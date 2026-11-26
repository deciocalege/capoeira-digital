/* @revisao 2.18.0 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).common = '2.18.0';
/* ============================================================
   UI — tudo o que não é específico de nenhuma página em particular:
   cabeçalho + menu rápido, faixa de estatísticas, semáforo do choco,
   gráficos, backup, rodapé e o arranque comum da app. Fechado numa
   IIFE — só `UI` fica global; o resto (renderChrome, ligarMenuRapido,
   renderStatsStrip, mostrarErroFatal...) só é chamado lá de dentro.
   Cada página HTML carrega db.js + calc.js + este ficheiro + o seu
   próprio js/<pagina>.js. ============================================================ */
const UI = (function(){

  let chocoTimer = null;

  /* Sempre que qualquer dado muda — nesta página ou numa aba/janela
     diferente que use a mesma base de dados — a faixa de estatísticas
     do topo actualiza-se de imediato. */
  DB.Bus.addEventListener('dataChanged', async ()=>{
    await renderStatsStrip(true);
  });

  /* ============ FAIXA DE ESTATÍSTICAS (topo de todas as páginas) ============ */
  async function renderStatsStrip(comPulso){
    const strip = document.getElementById('stats-strip');
    if(!strip) return;
    const [aves, saidasAves, compartimentos] = await Promise.all([DB.getAll('aves'), DB.getAll('saidasAves'), DB.getAll('compartimentos')]);
    const totalAves = aves.reduce((s,a)=>s+Number(a.qtd),0);
    const vendidas = Calc.totalVendidas(saidasAves);
    const abatidas = Calc.totalAbatidas(saidasAves);
    const mortas = Calc.totalMortas(saidasAves);
    strip.innerHTML = `
      <div class="mini"><div class="n">${totalAves}</div><div class="l">Total de aves</div></div>
      <div class="mini"><div class="n">${compartimentos.length}</div><div class="l">Compartimentos</div></div>
      <div class="mini"><div class="n">${vendidas}</div><div class="l">Vendidas</div></div>
      <div class="mini"><div class="n">${abatidas}</div><div class="l">Abatidas</div></div>
      <div class="mini mortas"><div class="n">${mortas}</div><div class="l">Mortas</div></div>
    `;
    if(comPulso){
      strip.querySelectorAll('.mini').forEach(m=>{
        m.classList.add('pulse');
        setTimeout(()=>m.classList.remove('pulse'), 650);
      });
    }
  }

  /* ============ ESTADO "SEMÁFORO" DO CHOCO ============
     Classifica o choco em 3 fases consoante os dias que faltam, para dar
     uma leitura instantânea (cor + emoji + texto), tal como um semáforo:
     calmo (ainda falta bastante) → atenção (última semana) → iminente ou
     já terminado. Usado em Início, Produção e no resumo do menu. */
  function estadoChoco(diasFaltam, terminou){
    if(terminou) return {classe:'perigo', emoji:'<span class="icon-dot icon-dot-perigo"></span>', label:'Terminou — verifica os ovos'};
    if(diasFaltam<=5) return {classe:'aviso', emoji:'<span class="icon-dot icon-dot-aviso"></span>', label:`Atenção — faltam ${diasFaltam} dia(s)`};
    return {classe:'calmo', emoji:'<span class="icon-dot icon-dot-calmo"></span>', label:`Tranquilo — faltam ${diasFaltam} dia(s)`};
  }

  /* Nomes das aves que estão a chocar (guardados no registo do choco). */
  function nomesAvesChoco(inc){
    return (inc.aveNomes||[]).filter(Boolean).map(n=>Util.escapeHTML(n)).join(', ');
  }

  /* Gera o HTML de TODOS os chocos em curso (um cartão por choco, com
     barra "semáforo" e selo de estado). Aceita uma lista (ou um único
     registo). Com opcoes.acoes=true mostra os botões de editar/eclosão/
     apagar (usado só na página Produção). */
  function renderChocoBloco(lista, opcoes){
    opcoes = opcoes || {};
    const ativas = Calc.incubacoesAtivas(Array.isArray(lista) ? lista : (lista ? [lista] : []));
    if(ativas.length===0){
      return `<p class="empty">Nenhum choco activo de momento. Vai a "Produção &amp; Incubação" para iniciar um.</p>`;
    }
    return ativas.map(inc=>{
      const {diasIncorridos, diasFaltam, pct, terminou} = Calc.progressoIncubacao(inc);
      const estado = estadoChoco(diasFaltam, terminou);
      const nomes = nomesAvesChoco(inc);
      const duracao = Math.max(1, Number(inc.diasIncubacao) || 35);
      const acoes = opcoes.acoes ? `
        <p class="row-actions mt-2">
          <button class="btn small" data-eclosao-inc="${inc.id}">${Icon.svg('ovo')} Registar eclosão</button>
          <button class="btn small outline" data-edit-inc="${inc.id}">Editar</button>
          <button class="btn small danger outline" data-del-inc="${inc.id}">Apagar</button>
        </p>` : '';
      return `
      <div class="compartimento choco-item" data-inc-id="${inc.id}">
        <h3>${Util.escapeHTML(inc.compartimento)||'Sem compartimento definido'} <span class="badge">${inc.numOvos} ovos</span></h3>
        ${nomes ? `<p class="footnote">${Icon.svg('galinha')} ${nomes}</p>` : ''}
        <p><span class="status-pill status-pill-${estado.classe}">${estado.emoji} ${estado.label}</span></p>
        <div class="progress-wrap"><div class="progress-bar progress-bar-${estado.classe}" style="width:${pct.toFixed(0)}%"></div></div>
        <p class="footnote">Dia <span data-dias-incorridos>${diasIncorridos}</span> de ${duracao}. Faltam <span class="countdown ${diasFaltam<=0?'zero':''}">${diasFaltam}</span> dia(s) para a eclosão prevista.</p>
        <p class="live-clock">${Icon.svg('atualizar')} verificado às ${new Date().toLocaleTimeString('pt-PT')} — actualiza automaticamente</p>
        ${terminou ? `<div class="alert-banner">${Icon.svg('ovo')} A incubação já terminou! Verifica os ovos${opcoes.acoes ? ' e regista a eclosão.' : '.'}</div>` : ''}
        ${acoes}
      </div>`;
    }).join('');
  }

  /* ============ ALERTA DE FIM DE INCUBAÇÃO (ao abrir qualquer página) ============ */
  async function verificarAlertaIncubacao(){
    const todas = await DB.getAll('incubacao');
    let novos = 0;
    for(const inc of Calc.incubacoesAtivas(todas)){
      const {terminou} = Calc.progressoIncubacao(inc);
      if(terminou && !inc.alertaMostrado){
        await DB.put('incubacao', {...inc, alertaMostrado:true});
        novos++;
      } else if(!terminou && inc.alertaMostrado){
        await DB.put('incubacao', {...inc, alertaMostrado:false});
      }
    }
    if(novos>0){
      setTimeout(()=>Util.toast(novos>1 ? `🐣 ${novos} incubações já terminaram! Verifica os ovos.` : '🐣 A incubação já terminou! Verifica os ovos.'), 600);
    }
  }

  /* ============ CONSUMO AUTOMÁTICO DE RAÇÃO ============
     Ao abrir qualquer página, lança o consumo diário previsto (plano da
     espécie ou ração própria do lote) dos dias que ainda não foram
     lançados. É seguro repetir: nunca duplica um dia já lançado. */
  async function aplicarConsumoAutomatico(){
    let criados = 0;
    try{
      const ler = async ()=> {
        const [aves, planos, consumo, feedStock] = await Promise.all([
          DB.getAll('aves'), DB.getAll('planosAlimentares'), DB.getAll('consumo'), DB.getAll('feedStock')
        ]);
        return {aves, planosAlimentares:planos, consumo, feedStock};
      };
      if(Calc.gerarConsumoAutomatico(await ler(), Util.hoje()).length === 0) return;
      await DB.transacao(['aves','planosAlimentares','consumo','feedStock'], async (tx)=>{
        const lerTx = n => DB.reqToPromise(tx.objectStore(n).getAll());
        const dados = {
          aves: await lerTx('aves'), planosAlimentares: await lerTx('planosAlimentares'),
          consumo: await lerTx('consumo'), feedStock: await lerTx('feedStock')
        };
        const novos = Calc.gerarConsumoAutomatico(dados, Util.hoje());
        const store = tx.objectStore('consumo');
        for(const n of novos) await DB.reqToPromise(store.add(n));
        criados = novos.length;
      });
    }catch(e){ console.warn('Consumo automático não aplicado', e); return; }
    if(criados>0){
      setTimeout(()=>Util.toast(`🌾 Consumo automático: ${criados} lançamento(s) de ração registado(s)`), 900);
    }
  }

  /* Relógio ao vivo dos chocos: recalcula os dias a cada 20s e actualiza
     a barra/contagem de cada cartão directamente no DOM. Funciona em
     qualquer página que tenha um elemento #choco-live. */
  function iniciarRelogioChoco(){
    if(chocoTimer) clearInterval(chocoTimer);
    chocoTimer = setInterval(async ()=>{
      const wrap = document.getElementById('choco-live');
      if(!wrap) return;
      const todas = await DB.getAll('incubacao');
      wrap.querySelectorAll('.choco-item').forEach(item=>{
        const inc = todas.find(x=>Util.mesmoId(x.id, item.dataset.incId));   // ids numéricos antigos ou UUID
        if(!inc || !inc.ativa) return;
        const {diasIncorridos, diasFaltam, pct, terminou} = Calc.progressoIncubacao(inc);
        const estado = estadoChoco(diasFaltam, terminou);
        const bar = item.querySelector('.progress-bar');
        const pill = item.querySelector('.status-pill');
        const count = item.querySelector('.countdown');
        const dias = item.querySelector('[data-dias-incorridos]');
        const relogio = item.querySelector('.live-clock');
        if(bar){
          bar.style.width = pct.toFixed(0)+'%';
          bar.className = 'progress-bar progress-bar-'+estado.classe;
        }
        if(pill){
          pill.className = 'status-pill status-pill-'+estado.classe;
          pill.innerHTML = `${estado.emoji} ${estado.label}`;
        }
        if(count){ count.textContent = diasFaltam; count.classList.toggle('zero', diasFaltam<=0); }
        if(dias) dias.textContent = diasIncorridos;
        if(relogio) relogio.innerHTML = `${Icon.svg('atualizar')} verificado às ` + new Date().toLocaleTimeString('pt-PT');
      });
    }, 20000);
  }

  /* ============ BACKUP ============ */
  async function construirBackupCompleto(){
    return {
      versaoBackup: DB.usaUUID ? 3 : 2,   // 3 = ids UUID (a partir do db.js da Fase 1)
      geradoEm: new Date().toISOString(),
      compartimentos: await DB.getAll('compartimentos'),
      aves: await DB.getAll('aves'),
      feedStock: await DB.getAll('feedStock'),
      consumo: await DB.getAll('consumo'),
      transacoes: await DB.getAll('transacoes'),
      ovosLog: await DB.getAll('ovosLog'),
      saidasAves: await DB.getAll('saidasAves'),
      misturas: await DB.getAll('misturas'),
      planosAlimentares: await DB.getAll('planosAlimentares'),
      vendas: await DB.getAll('vendas'),
      revenda: await DB.getAll('revenda'),
      revendaMov: await DB.getAll('revendaMov'),
      saude: await DB.getAll('saude'),
      pesagens: await DB.getAll('pesagens'),
      incubacao: await DB.getAll('incubacao')
    };
  }

  /* Rede de segurança: se uma escrita na BD falhar depois de o utilizador já
     ter recebido o toast de erro (ver db.js), a promessa rejeitada não deve
     aparecer como um erro não tratado no consola sem explicação. */
  window.addEventListener('unhandledrejection', (e)=>{
    if(e.reason && e.reason.name==='ErroBD'){
      console.warn('Operação na base de dados falhou (utilizador já foi avisado):', e.reason.message);
      e.preventDefault();
    }
  });

  /* Ecrã de erro simples, mostrado quando a base de dados não consegue
     sequer abrir. */
  function mostrarErroFatal(mensagem){
    const app = document.getElementById('app');
    const strip = document.getElementById('stats-strip');
    if(strip) strip.innerHTML = '';
    if(app){
      app.innerHTML = `
        <div class="compartimento borda-erro">
          <h3 class="txt-erro">${Icon.svg('perigo')} Não foi possível iniciar a app</h3>
          <p>${mensagem}</p>
          <p class="footnote">Se tiveres um backup exportado (.json), guarda-o num local seguro. Depois de resolveres o problema acima, recarrega esta página.</p>
          <button class="btn" onclick="location.reload()">${Icon.svg('atualizar')} Tentar novamente</button>
        </div>`;
    }
  }

  /* ============ CABEÇALHO (gerado aqui, para todas as páginas) ============
     Antes, este bloco de HTML estava repetido dentro de cada um dos 5
     ficheiros .html. Agora vive só aqui — se quiseres mudar o cabeçalho
     ou acrescentar uma secção nova, só precisas de editar este ficheiro
     (js/common.js), e a alteração aparece em todas as páginas de uma vez.
     Cada página .html só precisa de um <div id="chrome"></div> logo no
     início do <body>. */
  function renderChrome(){
    const chrome = document.getElementById('chrome');
    if(!chrome) return;
    const esc = Util.escapeHTML;
    /* Menu e barra inferior nascem da lista PAGINAS (js/config.js). */
    const linkMenu = p => `<a href="${p.ficheiro}">${Icon.svg(p.icone)} ${esc(p.titulo)}</a>`;
    const grupos = GRUPOS_PAGINAS.map(g=>{
      const itens = paginasVisiveis().filter(p=>p.grupo===g.id);
      return itens.length ? `<div class="quick-nav-grupo">${esc(g.titulo)}</div>${itens.map(linkMenu).join('')}` : '';
    }).join('');
    const barra = paginasVisiveis().filter(p=>p.principal).map(p =>
      `<a href="${p.ficheiro}">${Icon.svg(p.icone, {tamanho:'22px'})}<span>${esc(p.rotulo || p.titulo)}</span></a>`).join('');
    chrome.innerHTML = `
      <header class="app-header">
        <a href="index.html" class="app-header-top app-header-link">
          <span class="app-icon">${Icon.svg('galinha', {tamanho:'28px'})}</span>
          <div>
            <h1>Capoeira</h1>
            <p>Gestão do plantel, alimentação e finanças</p>
          </div>
        </a>
        <a id="sync-estado" class="sync-estado" href="servidor.html#sec-sync" hidden><span class="sync-ponto"></span><span class="sync-texto"></span></a>
        <button type="button" id="menu-toggle" class="menu-toggle-btn" aria-label="Mostrar/ocultar menu de páginas" aria-expanded="false" aria-controls="quick-nav">${Icon.svg('menu')}</button>
      </header>
      <nav id="quick-nav" class="quick-nav" aria-label="Páginas" hidden>
        <a href="index.html">${Icon.svg('casa')} Menu principal</a>
        ${grupos}
      </nav>
      <nav class="bottom-nav" aria-label="Navegação principal">
        ${barra}
        <button type="button" id="bottom-mais" aria-expanded="false" aria-controls="quick-nav">${Icon.svg('menu', {tamanho:'22px'})}<span>Mais</span></button>
      </nav>
      <div class="stats-strip" id="stats-strip"></div>
    `;
    marcarNavAtiva();
    ligarMenuRapido();
  }

  /* Marca a página actual no menu e na barra inferior. */
  function marcarNavAtiva(){
    const atual = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('#quick-nav a, .bottom-nav a').forEach(a=>{
      const ativo = a.getAttribute('href')===atual;
      a.classList.toggle('active', ativo);
      if(ativo) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
    });
  }

  /* Menu rápido: abre pelo botão do cabeçalho ou pelo "Mais" da barra
     inferior. Fecha ao tocar fora, ao carregar em Esc (devolvendo o foco ao
     botão que o abriu) e ao abrir foca o primeiro link, para quem navega
     por teclado. */
  function ligarMenuRapido(){
    const painel = document.getElementById('quick-nav');
    const botoes = ['menu-toggle','bottom-mais'].map(id=>document.getElementById(id)).filter(Boolean);
    if(!painel || !botoes.length) return;
    let abertoPor = null;
    const fechar = (devolverFoco)=>{
      painel.setAttribute('hidden','');
      botoes.forEach(b=>b.setAttribute('aria-expanded','false'));
      if(devolverFoco && abertoPor) abertoPor.focus();
      abertoPor = null;
    };
    const abrir = (botao)=>{
      painel.removeAttribute('hidden');
      botoes.forEach(b=>b.setAttribute('aria-expanded','true'));
      abertoPor = botao;
      const primeiro = painel.querySelector('a');
      if(primeiro) primeiro.focus({preventScroll:true});
    };
    botoes.forEach(botao=>{
      botao.addEventListener('click', e=>{
        e.stopPropagation();
        if(painel.hasAttribute('hidden')) abrir(botao); else fechar(false);
      });
    });
    document.addEventListener('click', e=>{
      if(!painel.hasAttribute('hidden') && !painel.contains(e.target) && !botoes.some(b=>b.contains(e.target))) fechar(false);
    });
    document.addEventListener('keydown', e=>{
      if(e.key==='Escape' && !painel.hasAttribute('hidden')) fechar(true);
    });
  }

  /* ============ GRÁFICOS (SVG simples, sem bibliotecas externas) ============ */

  function svgBarChart(dados, opts){
    opts = opts || {};
    const largura = opts.largura || 300, altura = opts.altura || 150;
    const cor = opts.cor || 'var(--mato)';
    const corNeg = opts.corNegativa || 'var(--sangue)';
    if(!dados.length) return `<p class="empty">Sem dados suficientes para o gráfico.</p>`;
    const areaAltura = altura - 26;
    const maxPos = Math.max(0, ...dados.map(d=>d.valor));
    const maxNeg = Math.max(0, ...dados.map(d=>-d.valor));
    const escala = Math.max(1, maxPos + maxNeg);
    const base = (maxPos/escala) * areaAltura;
    const colW = largura / dados.length;
    const barW = Math.max(10, colW - 14);
    const barras = dados.map((d,i)=>{
      const h = Math.max(1, (Math.abs(d.valor)/escala) * areaAltura);
      const x = i*colW + (colW-barW)/2;
      const y = d.valor >= 0 ? base - h : base;
      const fill = d.valor < 0 ? corNeg : cor;
      const labelSeguro = Util.escapeHTML(d.label);
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${fill}"><title>${labelSeguro}: ${d.valor}</title></rect>
        <text x="${(x+barW/2).toFixed(1)}" y="${altura-8}" text-anchor="middle" class="chart-label">${labelSeguro}</text>`;
    }).join('');
    const linha = maxNeg>0 ? `<line x1="0" x2="${largura}" y1="${base.toFixed(1)}" y2="${base.toFixed(1)}" stroke="currentColor" stroke-opacity=".3"/>` : '';
    return `<svg viewBox="0 0 ${largura} ${altura}" class="chart-svg" role="img" aria-label="Gráfico de barras">${linha}${barras}</svg>`;
  }

  function svgDonutChart(dados, opts){
    opts = opts || {};
    const tamanho = opts.tamanho || 150;
    const cores = opts.cores || ['#5c749c','#c98a2c','#243349','#a3402f','#8094bc','#767f90','#2d6a3f'] /* = --mato, --aviso, --mato-esc, --sangue, --milho, --terra, --positivo */;
    const total = dados.reduce((s,d)=>s+d.valor,0);
    if(!total) return `<p class="empty">Sem dados suficientes para o gráfico.</p>`;
    const r = tamanho/2 - 16, cx = tamanho/2, cy = tamanho/2, circ = 2*Math.PI*r;
    let acumulado = 0;
    const fatias = dados.map((d,i)=>{
      const frac = d.valor/total;
      const dash = frac*circ;
      const offset = circ*0.25 - acumulado;
      acumulado += dash;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${cores[i%cores.length]}" stroke-width="20" stroke-dasharray="${dash.toFixed(1)} ${(circ-dash).toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"><title>${Util.escapeHTML(d.label)}: ${d.valor}</title></circle>`;
    }).join('');
    const legenda = dados.map((d,i)=>`<span class="chart-legenda-item"><i style="background:${cores[i%cores.length]}"></i>${Util.escapeHTML(d.label)}</span>`).join('');
    return `
    <div class="chart-donut-wrap">
      <svg viewBox="0 0 ${tamanho} ${tamanho}" class="chart-svg chart-donut" role="img" aria-label="Gráfico circular">${fatias}</svg>
      <div class="chart-legenda">${legenda}</div>
    </div>`;
  }

  /* Número da versão da app — muda sempre que houver uma actualização
     significativa (ver CHANGELOG.md na raiz do projecto). Aparece no
     rodapé para conseguires confirmar rapidamente, só de olhar para a
     app, se estás a usar a cópia mais recente — evita a confusão de
     teres ficheiros de páginas diferentes por sincronizar. */
  const VERSAO_APP = APP_VERSAO; // definida em js/config.js (único sítio a mudar)

  /* Rodapé — gerado uma única vez, no fim do <body>, em todas as páginas.
     O ano é calculado automaticamente, por isso nunca fica desatualizado. */
  function renderFooter(){
    if(document.querySelector('.app-footer')) return;
    const footer = document.createElement('footer');
    footer.className = 'app-footer';
    footer.innerHTML = `Desenvolvido por <strong>Décio Calege</strong> · ${new Date().getFullYear()} · v${VERSAO_APP}`;
    document.body.appendChild(footer);
  }

  /* ============ REDESENHAR SEM PERDER O CONTEXTO ============
     Todas as páginas redesenham o conteúdo inteiro depois de guardar,
     apagar ou mudar um filtro. Antes, isso fazia saltar a página para o
     topo, fechar as secções abertas (<details>) e limpar os filtros.
     Agora UI.redesenhar() guarda esse estado, desenha o HTML novo de uma
     só vez (sem o ecrã intermédio "A carregar…") e restaura tudo.
     - scroll: posição vertical da página
     - <details>: abertos/fechados (pelo id; sem id, pela ordem)
     - campos com o atributo data-persistir (filtros): valor, e volta a
       disparar o evento para a lista se filtrar de novo */
  function capturarEstadoPagina(raiz){
    const detalhes = {};
    raiz.querySelectorAll('details').forEach((d,i)=>{ detalhes[d.id || ('#'+i)] = d.open; });
    const campos = {};
    raiz.querySelectorAll('[data-persistir]').forEach(el=>{
      const k = el.id || el.name;
      if(k) campos[k] = el.value;
    });
    return {scrollY: window.scrollY, detalhes, campos};
  }

  function restaurarEstadoPagina(raiz, e){
    raiz.querySelectorAll('details').forEach((d,i)=>{
      const k = d.id || ('#'+i);
      if(k in e.detalhes) d.open = e.detalhes[k];
    });
    raiz.querySelectorAll('[data-persistir]').forEach(el=>{
      const k = el.id || el.name;
      if(k && (k in e.campos) && el.value !== e.campos[k]){
        el.value = e.campos[k];
        el.dispatchEvent(new Event(el.tagName==='SELECT' ? 'change' : 'input', {bubbles:true}));
      }
    });
    window.scrollTo({top: e.scrollY, left: 0, behavior: 'instant'});
  }

  async function redesenhar(app, gerarHTML, ligar){
    const primeira = !app.children.length || !!app.querySelector(':scope > .loading-msg');
    const estado = primeira ? null : capturarEstadoPagina(app);
    const html = await gerarHTML();
    app.innerHTML = html;
    if(ligar) await ligar();
    if(estado) restaurarEstadoPagina(app, estado);
  }

  /* ============ ERROS: NUNCA FALHAR EM SILÊNCIO ============
     Se uma gravação, uma leitura ou qualquer acção falha por um motivo que
     a página não previu (base de dados do aparelho recusou, sem espaço,
     sem ligação ao servidor, erro de programação…), aparece SEMPRE uma
     mensagem — antes o botão simplesmente "não fazia nada".
     • apanha erros que ninguém tratou (unhandledrejection / error);
     • diz qual foi a acção ("Guardar alterações" não foi concluída…),
       lembrando o último botão tocado;
     • traduz os erros técnicos mais comuns para português claro;
     • não repete um aviso que a base de dados já mostrou (db.js avisa
       sozinha e depois deixa o erro seguir) nem o mesmo aviso em 2,5 s. */
  let _ultimaAcao = {texto:'', t:0};
  let _ultimoAviso = {msg:'', t:0};

  function lembrarAcao(botao){
    if(!botao) return;
    const t = (botao.getAttribute('aria-label') || botao.textContent || '').replace(/\s+/g,' ').trim();
    if(t) _ultimaAcao = {texto: t.slice(0,40), t: Date.now()};
  }
  document.addEventListener('submit', e=>{
    lembrarAcao(e.submitter || (e.target.querySelector && e.target.querySelector('[type=submit],button:not([type])')));
  }, true);
  document.addEventListener('click', e=>{
    const b = e.target.closest && e.target.closest('button');
    if(b && !b.matches('.select-botao,[role=tab],#menu-toggle,#bottom-mais')) lembrarAcao(b);
  }, true);

  function mensagemDeErro(err){
    const nome = (err && err.name) || '';
    const msg = String(err && err.message ? err.message : (err == null ? '' : err)).trim();
    if(nome === 'QuotaExceededError' || /quota/i.test(msg))
      return 'O aparelho está sem espaço de armazenamento. Liberta espaço e tenta de novo.';
    if(nome === 'ConstraintError')
      return 'Já existe um registo igual. Confirma os dados.';
    if(nome === 'AbortError' || nome === 'TimeoutError')
      return 'A operação demorou demasiado ou foi interrompida. Tenta de novo.';
    if(/failed to fetch|networkerror|load failed|network request failed/i.test(msg))
      return 'Sem ligação ao servidor neste momento. Verifica a internet e tenta de novo — os dados continuam guardados neste aparelho.';
    if(['InvalidStateError','TransactionInactiveError','NotFoundError','VersionError','UnknownError','DataError','ReadOnlyError'].includes(nome))
      return 'A base de dados deste aparelho não aceitou a operação. Fecha outros separadores da app, recarrega a página e tenta de novo.';
    return 'Não foi possível concluir a operação.' + (msg ? ' (' + msg.slice(0,90) + ')' : '');
  }

  function avisarErro(err, contexto){
    console.error(contexto || 'Erro', err);
    const texto = String(err && err.message ? err.message : err || '');
    if(/ResizeObserver|^Script error/i.test(texto)) return;   // ruído do navegador, não é falha da app
    const ultimo = Util.toast && Util.toast.ultimo;
    if(ultimo && Date.now() - ultimo.t < 700) return;         // a base de dados já avisou
    let msg = mensagemDeErro(err);
    if(_ultimaAcao.texto && Date.now() - _ultimaAcao.t < 5000) msg = '“' + _ultimaAcao.texto + '” não foi concluída. ' + msg;
    const agora = Date.now();
    if(msg === _ultimoAviso.msg && agora - _ultimoAviso.t < 2500) return;
    _ultimoAviso = {msg, t: agora};
    Util.toast('⚠️ ' + msg, 6500);
  }
  window.addEventListener('unhandledrejection', e=>avisarErro(e.reason, 'Promessa rejeitada'));
  window.addEventListener('error', e=>{
    if(e.target && e.target !== window) return;               // falha ao carregar uma imagem/script
    avisarErro(e.error || e.message, 'Erro');
  });

  /* ============ SINCRONIZAÇÃO NA PÁGINA ============
     Indicador no cabeçalho (só aparece se a sincronização estiver ligada), arranque do envio
     automático e redesenho da página quando chegam dados de outro aparelho. */
  const TEXTO_SYNC = {'ok':'Sincronizado', 'a-sincronizar':'A sincronizar', 'offline':'Sem ligação', 'sessao':'Entra de novo', 'erro':'Erro na sincronização'};
  function pintarEstadoSync(e){
    const el = document.getElementById('sync-estado');
    if(!el) return;
    if(!e || !e.ligado){ el.hidden = true; return; }
    el.hidden = false;
    el.className = 'sync-estado sync-' + e.estado;
    const texto = TEXTO_SYNC[e.estado] || e.estado;
    el.querySelector('.sync-texto').textContent = texto;
    let ultima = '';
    try{ ultima = e.ultimaSync ? ' · última: ' + new Date(e.ultimaSync).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) : ''; }catch(err){}
    el.title = texto + (e.detalhe ? ' — ' + e.detalhe : '') + ultima;
    el.setAttribute('aria-label', el.title);
  }
  let _renderActual = null, _timerRedesenho = null;
  async function actualizarPaginaSePossivel(){
    if(!_renderActual || /servidor\.html$/.test(location.pathname)) return;
    const app = document.getElementById('app');
    const ae = document.activeElement;
    const aEscrever = ae && app && app.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && !/^(button|submit|checkbox|radio)$/.test(ae.type || '');
    const aEditar = app && app.querySelector('form[data-id]:not([data-id=""])');
    if(aEscrever || aEditar){
      Util.toast('Chegaram alterações de outro aparelho. Quando acabares aqui, actualiza a página para as ver.', 6000);
      return;
    }
    try{ await _renderActual(); }catch(e){ console.error('Não foi possível redesenhar a página após a sincronização', e); }
  }
  function iniciarSincronizacaoNaPagina(renderPagina){
    if(typeof Sync === 'undefined') return;
    _renderActual = renderPagina;
    Sync.aoMudar(pintarEstadoSync);
    pintarEstadoSync(Sync.estado());
    Sync.aoReceber(()=>{
      clearTimeout(_timerRedesenho);
      _timerRedesenho = setTimeout(actualizarPaginaSePossivel, 400);
    });
    Sync.iniciarAutomatico();
  }

  /* ============ PAPEL NESTA CRIAÇÃO ============
     Sem servidor (ou sem criação escolhida) a app é só tua: acesso total. Com sincronização, o
     papel vem da criação escolhida: o ADMINISTRADOR vê tudo; o TRABALHADOR não vê nem regista
     finanças, vendas nem revenda. (O servidor também o impõe: um trabalhador nunca recebe esses
     dados.) */
  function papel(){
    try{ return (typeof Servidor !== 'undefined' && Servidor.papelActual && Servidor.papelActual()) || 'administrador'; }
    catch(e){ return 'administrador'; }
  }
  const eTrabalhador = ()=> papel() === 'trabalhador';
  const podeFinancas = ()=> !eTrabalhador();
  /* As páginas que este utilizador pode abrir (para o menu, a barra inferior e o menu principal). */
  const paginasVisiveis = ()=> PAGINAS.filter(p=>!(p.restrita && eTrabalhador()));
  function paginaRestritaAtual(){
    const f = location.pathname.split('/').pop() || 'index.html';
    const p = PAGINAS.find(x=>x.ficheiro === f);
    return !!(p && p.restrita);
  }
  function mostrarSemPermissao(){
    const app = document.getElementById('app');
    if(!app) return;
    app.innerHTML = `<section class="assistente-inicial"><h2>Só para administradores</h2>
      <p>Com o teu papel de <strong>trabalhador</strong> não tens acesso às finanças, vendas e revenda desta criação.
      Podes fazer todos os registos do dia a dia (aves, ovos, ração, saúde, produção).</p>
      <p><a class="btn" href="inicio.html">Ir para o Início</a></p></section>`;
  }

  /* ============ ASSISTENTE DE PRIMEIRO USO ============
     Numa instalação nova a base de dados está vazia e a app não inventa dados: pergunta como
     começar. Quem já usava a app nunca vê isto (db.js decide em DB.inicio.primeiroUso). */
  function mostrarAssistenteInicial(){
    return new Promise(resolve=>{
      const app = document.getElementById('app');
      if(!app){ resolve(); return; }
      const opcoes = [
        {modo:'vazia',    icone:'mais',        titulo:'Começar do zero',          texto:'Uma criação vazia: crias os compartimentos e registas as tuas aves.', principal:true},
        {modo:'servidor', icone:'servidor',    titulo:'Entrar com a minha conta', texto:'Liga este aparelho ao servidor da tua criação.'},
        {modo:'backup',   icone:'descarregar', titulo:'Repor um backup',          texto:'Tenho um ficheiro de cópia de segurança (.json).'},
        {modo:'exemplo',  icone:'lista',       titulo:'Ver com dados de exemplo', texto:'Dados fictícios para explorar a app antes de registares os teus.'}
      ];
      app.innerHTML = `<section class="assistente-inicial" aria-labelledby="ass-titulo">
        <h2 id="ass-titulo">Bem-vindo à Capoeira Digital</h2>
        <p>Como queres começar?</p>
        <div class="assistente-opcoes">${opcoes.map(o=>`
          <button type="button" class="assistente-opcao${o.principal ? ' principal' : ''}" data-modo="${o.modo}">
            <span class="assistente-icone">${Icon.svg(o.icone, {tamanho:'24px'})}</span>
            <span><strong>${o.titulo}</strong><small>${o.texto}</small></span>
          </button>`).join('')}</div>
        <p class="footnote">Não é definitivo: os dados podem sempre ser exportados, importados ou ligados ao servidor mais tarde.</p>
      </section>`;
      app.querySelectorAll('[data-modo]').forEach(b=>b.addEventListener('click', async ()=>{
        const modo = b.dataset.modo;
        app.querySelectorAll('button').forEach(x=>{ x.disabled = true; });
        try{
          await DB.iniciarCriacao(modo);
        }catch(e){
          app.querySelectorAll('button').forEach(x=>{ x.disabled = false; });
          avisarErro(e, 'Começar');
          return;
        }
        if(modo === 'servidor'){ location.href = 'servidor.html'; return; }
        if(modo === 'backup'){ location.href = 'inicio.html#det-backup'; return; }
        resolve();
      }));
    });
  }

  /* Um endereço como inicio.html#det-backup deve abrir essa secção, mesmo que esteja recolhida
     (o conteúdo só existe depois de a página ser desenhada, por isso o navegador não o faz sozinho). */
  function abrirSeccaoDoEndereco(){
    const id = decodeURIComponent((location.hash || '').slice(1));
    const alvo = id ? document.getElementById(id) : null;
    if(alvo && alvo.closest('details:not([open])')) revelar(alvo, {behavior:'smooth', block:'start'});
  }

  /* ============ FICHEIROS DESACTUALIZADOS ============
     A app é feita de muitos ficheiros e, quando se substituem aos poucos, pode ficar um antigo
     misturado com os novos (ou o navegador pode guardar um antigo). Isso dá falhas estranhas —
     ex.: "o parâmetro não é uma chave válida" ao registar uma saída, porque um gestao.js antigo
     não entende os identificadores novos. Cada ficheiro diz de que versão é (linha @revisao no
     topo) e config.js diz qual é a mínima aceitável (REVISOES). Aqui compara-se e, se algum
     estiver desactualizado, mostra-se um aviso que diz QUAL. */
  function versaoMenorQue(a, b){
    const pa = String(a || '0').split('.').map(Number), pb = String(b || '0').split('.').map(Number);
    for(let i = 0; i < Math.max(pa.length, pb.length); i++){
      const x = pa[i] || 0, y = pb[i] || 0;
      if(x !== y) return x < y;
    }
    return false;
  }
  function ficheirosDesactualizados(){
    if(typeof REVISOES === 'undefined' || typeof APP_VERSAO === 'undefined') return [];
    const rev = globalThis.__revisao || {};
    const carregados = Array.from(document.scripts)
      .map(sc=>(sc.getAttribute('src') || '').match(/js\/([\w-]+)\.js/)).filter(Boolean).map(m=>m[1]);
    const lista = [];
    carregados.forEach(n=>{
      const exigida = REVISOES[n]; if(!exigida) return;
      const tem = rev[n];
      if(!tem || versaoMenorQue(tem, exigida)) lista.push({nome: n + '.js', tem: tem || 'sem identificação', exigida});
      else if(versaoMenorQue(APP_VERSAO, tem)) lista.push({nome: 'config.js', tem: APP_VERSAO, exigida: tem});   // o config.js é que ficou para trás
    });
    const vistos = new Set();
    return lista.filter(x=>!vistos.has(x.nome) && vistos.add(x.nome));
  }
  function mostrarAvisoFicheiros(){
    const lista = ficheirosDesactualizados();
    if(!lista.length) return false;
    if(document.querySelector('.aviso-ficheiros')) return true;
    const esc = Util.escapeHTML;
    const caixa = document.createElement('div');
    caixa.className = 'aviso-ficheiros';
    caixa.setAttribute('role', 'alert');
    caixa.innerHTML = `<strong>${Icon.svg('aviso')} Há ficheiros desactualizados nesta instalação</strong>
      <p>Isto causa falhas (por exemplo ao gravar). Ficheiros a substituir:</p>
      <ul>${lista.map(x=>`<li><code>${esc(x.nome)}</code> — tem ${esc(x.tem)}, devia ter ${esc(x.exigida)} ou mais recente</li>`).join('')}</ul>
      <p>Copia de novo a pasta completa da versão ${esc(APP_VERSAO)}, fecha todas as janelas da app e recarrega a página (Ctrl+F5).</p>`;
    const app = document.getElementById('app');
    if(app && app.parentNode) app.parentNode.insertBefore(caixa, app); else document.body.prepend(caixa);
    console.error('Ficheiros desactualizados:', lista);
    return true;
  }

  /* ============ SEPARADORES (abas) ============
     As páginas longas (Gestão, Finanças, Alimentação) desenham todas as
     secções seguidas. UI.separadores() pega nessas secções — cada uma
     começa num <h2 class="section-title" id="…"> — e agrupa-as em abas
     (Plantel | Registar | Histórico…), com a ordem "ver primeiro, agir
     depois". Corre depois de a página ser desenhada, por isso as páginas
     não mudam de lógica: os formulários e botões continuam os mesmos.
       UI.separadores(app, 'gestao', [
         {id:'plantel', titulo:'Plantel', icone:'galinha', secoes:['sec-a','sec-b']}, …])
     • A aba activa lembra-se entre redesenhos e vai no endereço (#registar).
     • Um link para uma secção (#sec-compra) abre a aba certa.
     • UI.revelar(el) abre a aba e os <details> que contêm o elemento e só
       depois faz scroll — serve para os botões "Editar", que preenchem um
       formulário noutra aba. Substitui el.scrollIntoView(). */
  const _abaAtiva = new Map();   // chave da página → id da aba activa
  let _hashLigado = false;

  function ativarAba(chave, id, focar){
    const barra = document.querySelector('.abas[data-chave="'+chave+'"]');
    if(!barra) return;
    barra.querySelectorAll('[role=tab]').forEach(b=>{
      const on = b.dataset.aba === id;
      b.classList.toggle('ativo', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if(on && focar) b.focus();
    });
    document.querySelectorAll('.aba-painel[data-chave="'+chave+'"]').forEach(p=>{ p.hidden = p.dataset.aba !== id; });
    _abaAtiva.set(chave, id);
    try{ history.replaceState(null, '', '#' + id); }catch(e){}
  }

  function revelar(el, opcoes){
    if(!el) return;
    const painel = el.closest ? el.closest('.aba-painel') : null;
    if(painel && painel.hidden) ativarAba(painel.dataset.chave, painel.dataset.aba);
    for(let d = el; d; d = d.parentElement){          // o próprio elemento (se for um <details>) e os que o contêm
      if(d.tagName === 'DETAILS' && !d.open) d.open = true;
    }
    el.scrollIntoView(opcoes || {behavior:'smooth', block:'center'});
  }

  function separadores(app, chave, abas){
    if(!app || !abas || !abas.length) return;
    const secoes = [], antes = [];
    let atual = null;
    Array.from(app.children).forEach(el=>{
      if(el.matches('h2.section-title')){ atual = {id: el.id, nos:[el]}; secoes.push(atual); }
      else if(atual) atual.nos.push(el);
      else antes.push(el);
    });
    const destino = {};
    abas.forEach(a=>a.secoes.forEach(id=>{ destino[id] = a.id; }));
    const painel = {};
    abas.forEach(a=>{
      const p = document.createElement('section');
      p.className = 'aba-painel'; p.id = 'aba-' + a.id;
      p.dataset.chave = chave; p.dataset.aba = a.id;
      p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', 'tab-' + a.id);
      painel[a.id] = p;
    });
    const primeira = abas[0].id;
    antes.forEach(el=>painel[primeira].appendChild(el));
    secoes.forEach(sec=>{
      const dest = painel[destino[sec.id]] || painel[primeira];
      sec.nos.forEach(n=>dest.appendChild(n));
    });

    const barra = document.createElement('div');
    barra.className = 'atalhos abas';
    barra.setAttribute('role', 'tablist');
    barra.dataset.chave = chave;
    barra.innerHTML = abas.map(a=>
      '<button type="button" role="tab" id="tab-' + a.id + '" aria-controls="aba-' + a.id + '" data-aba="' + a.id + '">'
      + (a.icone ? Icon.svg(a.icone) + ' ' : '') + Util.escapeHTML(a.titulo) + '</button>').join('');
    barra.addEventListener('click', e=>{
      const b = e.target.closest('[role=tab]');
      if(b) ativarAba(chave, b.dataset.aba);
    });
    barra.addEventListener('keydown', e=>{
      if(e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const ids = abas.map(a=>a.id);
      const i = ids.indexOf(_abaAtiva.get(chave));
      const novo = ids[(i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length];
      ativarAba(chave, novo, true);
      e.preventDefault();
    });
    app.insertBefore(barra, app.firstChild);
    abas.forEach(a=>app.appendChild(painel[a.id]));

    /* Aba inicial: a que estava aberta; senão a do endereço (#registar ou
       #sec-compra); senão a primeira. */
    let inicial = _abaAtiva.get(chave), alvo = null;
    if(!inicial){
      const h = decodeURIComponent(location.hash.slice(1));
      if(h){
        if(painel[h]) inicial = h;
        else {
          alvo = document.getElementById(h);
          const pa = alvo && alvo.closest('.aba-painel');
          if(pa) inicial = pa.dataset.aba;
        }
      }
    }
    if(!painel[inicial]) inicial = primeira;
    ativarAba(chave, inicial);
    if(alvo) setTimeout(()=>alvo.scrollIntoView(), 0);

    if(!_hashLigado){
      _hashLigado = true;
      window.addEventListener('hashchange', ()=>{
        const h = decodeURIComponent(location.hash.slice(1));
        const el = h ? document.getElementById(h) : null;
        const pa = el && el.closest ? el.closest('.aba-painel') : null;
        if(pa){
          if(pa.hidden) ativarAba(pa.dataset.chave, pa.dataset.aba);
          el.scrollIntoView({behavior:'smooth'});
        }
      });
    }
  }

  /* ============ ARRANQUE COMUM ============
     Cada página de secção chama UI.initPagina(renderPagina), passando a
     sua própria função de desenho (ex: renderInicio, renderGestao...).
     Isto prepara a base de dados, mostra alertas e a faixa de
     estatísticas, e só depois desenha o conteúdo da página. */
  async function initPagina(renderPagina){
    renderChrome();
    renderFooter();
    mostrarAvisoFicheiros();   // antes de abrir a base de dados: se há ficheiros de versões diferentes, diz-se já
    if(eTrabalhador() && paginaRestritaAtual()){ mostrarSemPermissao(); return; }
    try{
      await DB.preparar();
    }catch(e){
      console.error('Falha fatal ao abrir a base de dados', e);
      mostrarErroFatal(e.message || 'Erro desconhecido ao abrir o armazenamento local do navegador.');
      return;
    }
    try{
      if(DB.inicio && DB.inicio.primeiroUso && !/servidor\.html$/.test(location.pathname)) await mostrarAssistenteInicial();
      await verificarAlertaIncubacao();
      await aplicarConsumoAutomatico();
      await renderStatsStrip(false);
      await renderPagina();
      abrirSeccaoDoEndereco();
      iniciarRelogioChoco();
      iniciarSincronizacaoNaPagina(renderPagina);
    }catch(e){
      console.error('Falha ao carregar os dados iniciais', e);
      mostrarErroFatal('A base de dados abriu, mas houve um erro ao carregar os dados. Tenta recarregar a página; se o problema persistir, restaura um backup em "Início → Importar".');
    }
  }

  return {
    VERSAO_APP,
    estadoChoco, renderChocoBloco, verificarAlertaIncubacao, aplicarConsumoAutomatico, iniciarRelogioChoco,
    svgBarChart, svgDonutChart, construirBackupCompleto, renderFooter,
    initPagina, redesenhar, separadores, revelar, avisarErro, mensagemDeErro, ficheirosDesactualizados,
    papel, eTrabalhador, podeFinancas, paginasVisiveis
  };
})();

/* ===== PWA: manifest, service worker e armazenamento persistente ===== */
(function(){
  const l = document.createElement('link');
  l.rel = 'manifest'; l.href = 'manifest.json';
  document.head.appendChild(l);

  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('sw.js').catch(e=>console.warn('SW', e));
    });
  }
  if(navigator.storage && navigator.storage.persist){
    navigator.storage.persist().catch(()=>{});
  }
})();

/* ===== Tabelas: marca as linhas de cabeçalho (<th>) para o CSS as esconder
   no telemóvel, onde cada registo passa a "ficha" ===== */
(function(){
  function arrumar(){
    document.querySelectorAll('table.responsive-stack tr').forEach(tr=>{
      if(tr.querySelector('th') && !tr.classList.contains('cabecalho')) tr.classList.add('cabecalho');
    });
  }
  if(typeof MutationObserver !== 'undefined'){
    let pendente = false;
    new MutationObserver(()=>{
      if(pendente) return;
      pendente = true;
      requestAnimationFrame(()=>{ pendente = false; arrumar(); });
    }).observe(document.documentElement, {childList:true, subtree:true});
  }
  document.addEventListener('DOMContentLoaded', arrumar);
})();
