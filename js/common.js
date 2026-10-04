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
        <p class="row-actions" style="margin-top:8px;">
          <button class="btn small" data-eclosao-inc="${inc.id}">🐣 Registar eclosão</button>
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
        const inc = todas.find(x=>x.id===Number(item.dataset.incId));
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
      versaoBackup: 2,
      geradoEm: new Date().toISOString(),
      compartimentos: await DB.getAll('compartimentos'),
      aves: await DB.getAll('aves'),
      feedStock: await DB.getAll('feedStock'),
      consumo: await DB.getAll('consumo'),
      transacoes: await DB.getAll('transacoes'),
      ovosLog: await DB.getAll('ovosLog'),
      saidasAves: await DB.getAll('saidasAves'),
      misturas: await DB.getAll('misturas'),
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
        <div class="compartimento" style="border-color:var(--sangue);">
          <h3 style="color:var(--sangue);">${Icon.svg('perigo')} Não foi possível iniciar a app</h3>
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
    chrome.innerHTML = `
      <header class="app-header">
        <a href="index.html" class="app-header-top app-header-link">
          <span class="app-icon">${Icon.svg('galinha', {tamanho:'28px'})}</span>
          <div>
            <h1>Capoeira</h1>
            <p>Gestão do plantel, alimentação e finanças</p>
          </div>
        </a>
        <button type="button" id="menu-toggle" class="menu-toggle-btn" aria-label="Mostrar/ocultar menu de páginas" aria-expanded="false">${Icon.svg('menu')}</button>
      </header>
      <nav id="quick-nav" class="quick-nav" hidden>
        <a href="index.html">${Icon.svg('casa')} Menu principal</a>
        <a href="inicio.html">Início</a>
        <a href="gestao.html">Gestão</a>
        <a href="alimentacao.html">Alimentação</a>
        <a href="financas.html">Finanças</a>
        <a href="producao.html">Produção &amp; Incubação</a>
        <a href="relatorios.html">Relatórios</a>
      </nav>
      <div class="stats-strip" id="stats-strip"></div>
    `;
    marcarNavAtiva();
    ligarMenuRapido();
  }

  /* Marca, no menu rápido, o link correspondente à página actual. */
  function marcarNavAtiva(){
    const atual = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('#quick-nav a').forEach(a=>{
      a.classList.toggle('active', a.getAttribute('href')===atual);
    });
  }

  /* Seta/menu rápido no canto superior direito do cabeçalho: permite ir
     directamente para qualquer outra página sem ter de voltar primeiro
     ao menu principal. Fica escondido por defeito e só aparece quando o
     botão é tocado. */
  function ligarMenuRapido(){
    const botao = document.getElementById('menu-toggle');
    const painel = document.getElementById('quick-nav');
    if(!botao || !painel) return;
    const fechar = ()=>{
      painel.setAttribute('hidden','');
      botao.setAttribute('aria-expanded','false');
    };
    const abrir = ()=>{
      painel.removeAttribute('hidden');
      botao.setAttribute('aria-expanded','true');
    };
    botao.addEventListener('click', (e)=>{
      e.stopPropagation();
      if(painel.hasAttribute('hidden')) abrir(); else fechar();
    });
    document.addEventListener('click', (e)=>{
      if(!painel.hasAttribute('hidden') && !painel.contains(e.target) && e.target!==botao){
        fechar();
      }
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
    const cores = opts.cores || ['#3a5a40','#c98a2c','#5b4326','#a3402f','#8a7a58','#28401f','#6b5c3d'];
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
  const VERSAO_APP = '2.1.0';

  /* Rodapé — gerado uma única vez, no fim do <body>, em todas as páginas.
     O ano é calculado automaticamente, por isso nunca fica desatualizado. */
  function renderFooter(){
    if(document.querySelector('.app-footer')) return;
    const footer = document.createElement('footer');
    footer.className = 'app-footer';
    footer.innerHTML = `Desenvolvido por <strong>Décio Calege</strong> · ${new Date().getFullYear()} · v${VERSAO_APP}`;
    document.body.appendChild(footer);
  }

  /* ============ ARRANQUE COMUM ============
     Cada página de secção chama UI.initPagina(renderPagina), passando a
     sua própria função de desenho (ex: renderInicio, renderGestao...).
     Isto prepara a base de dados, mostra alertas e a faixa de
     estatísticas, e só depois desenha o conteúdo da página. */
  async function initPagina(renderPagina){
    renderChrome();
    renderFooter();
    try{
      await DB.preparar();
    }catch(e){
      console.error('Falha fatal ao abrir a base de dados', e);
      mostrarErroFatal(e.message || 'Erro desconhecido ao abrir o armazenamento local do navegador.');
      return;
    }
    try{
      await verificarAlertaIncubacao();
      await renderStatsStrip(false);
      await renderPagina();
      iniciarRelogioChoco();
    }catch(e){
      console.error('Falha ao carregar os dados iniciais', e);
      mostrarErroFatal('A base de dados abriu, mas houve um erro ao carregar os dados. Tenta recarregar a página; se o problema persistir, restaura um backup em "Início → Importar".');
    }
  }

  return {
    VERSAO_APP,
    estadoChoco, renderChocoBloco, verificarAlertaIncubacao, iniciarRelogioChoco,
    svgBarChart, svgDonutChart, construirBackupCompleto, renderFooter,
    initPagina
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
