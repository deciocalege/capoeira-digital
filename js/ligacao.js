/* @revisao 2.18.0 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).ligacao = '2.18.0';
/* ============ PÁGINA: SERVIDOR (ligação ao Supabase + conta) ============ */

async function renderLigacao(){
  const app = document.getElementById('app');
  app.innerHTML = viewLigacao();
  attachHandlersLigacao();
  await carregarConta();
}

function viewLigacao(){
  const cfg = Servidor.lerConfig();
  const sessao = Servidor.lerSessao();
  const host = cfg ? cfg.url.replace(/^https?:\/\//, '') : '';
  return `
  <h2 class="section-title">Servidor</h2>
  <div class="compartimento" id="estado-servidor">
    ${cfg
      ? `<h3 class="mt-0">Ligação configurada</h3><p class="footnote">Projeto: <strong>${Util.escapeHTML(host)}</strong></p><p id="resultado-teste" class="footnote">A testar…</p>`
      : `<h3 class="mt-0">Modo atual: só neste aparelho</h3><p class="footnote">Os dados ficam guardados neste telemóvel/computador. Para usar o mesmo registo em vários aparelhos é preciso ligar a app a um servidor.</p>`}
  </div>

  ${cfg ? `
  <h2 class="section-title" id="sec-conta">Conta</h2>
  ${sessao ? `
  <div class="compartimento" id="cartao-conta">
    <h3 class="mt-0">Sessão iniciada</h3>
    <p class="footnote" id="email-sessao">${Util.escapeHTML(sessao.user.email || '')}</p>
    <div id="area-granja"><p class="footnote">A carregar a tua criação…</p></div>
    <div class="acoes"><button type="button" class="btn small danger outline" id="btn-sair">Sair</button></div>
  </div>` : `
  <form id="form-conta" class="inline">
    <label>Email <input type="email" name="email" autocomplete="email" autocapitalize="off" required></label>
    <label>Palavra-passe <input type="password" name="senha" autocomplete="current-password" required></label>
    <button class="btn" type="submit" id="btn-entrar">Entrar</button>
    <button class="btn outline" type="button" id="btn-criar-conta">Criar conta</button>
    <button class="btn outline" type="button" id="btn-recuperar">Esqueci a palavra-passe</button>
  </form>
  <p id="msg-conta" class="footnote" role="status"></p>
  <details><summary>Entrar com Google (opcional)</summary>
    <p class="footnote">Só funciona depois de ativares o Google no painel do Supabase (veja <code>servidor/LEIA-ME.md</code>).</p>
    <div class="acoes"><button type="button" class="btn small outline" id="btn-google">Entrar com Google</button></div>
  </details>`}` : ''}

  <h2 class="section-title">${cfg ? 'Alterar a ligação' : 'Ligar a um servidor'}</h2>
  <form id="form-ligacao" class="inline">
    <label>Endereço do projeto (Project URL)
      <input type="text" inputmode="url" autocapitalize="off" name="url" placeholder="https://xxxxxxxx.supabase.co" value="${cfg ? Util.escapeHTML(cfg.url) : ''}" autocomplete="off" required>
    </label>
    <label>Chave pública (anon / publishable)
      <input type="text" name="chave" placeholder="eyJ… ou sb_publishable_…" value="${cfg ? Util.escapeHTML(cfg.chave) : ''}" autocomplete="off" spellcheck="false" required>
    </label>
    <button class="btn" type="submit">Guardar e testar</button>
    ${cfg ? '<button class="btn outline" type="button" id="btn-testar-ligacao">Testar de novo</button><button class="btn danger outline" type="button" id="btn-remover-ligacao">Remover ligação</button>' : ''}
  </form>
  <p class="footnote">${Icon.svg('aviso')} Usa <strong>só a chave pública</strong>. A chave secreta (<em>service_role</em> / <em>sb_secret_</em>) nunca deve sair do painel do Supabase — a app recusa-a.</p>

  <h2 class="section-title">Como preparar o servidor</h2>
  <ol class="passos-servidor">
    <li>Cria uma conta em <strong>supabase.com</strong> (podes entrar com o GitHub) e um projeto novo, escolhendo a região mais próxima de Moçambique. Guarda a palavra-passe da base de dados.</li>
    <li>No painel do projeto abre o <strong>SQL Editor</strong> (New query), cola o conteúdo do ficheiro <code>servidor/01-esquema.sql</code> e carrega em <strong>Run</strong>.
      <div class="acoes"><button type="button" class="btn small outline" id="btn-copiar-sql">${Icon.svg('lista')} Copiar o ficheiro SQL</button></div>
      <div id="area-sql"></div></li>
          <li>Depois cola também o ficheiro <code>servidor/03-sincronizacao.sql</code> e carrega em <strong>Run</strong> — é ele que permite a <strong>sincronização entre aparelhos</strong>.
            <div class="acoes"><button type="button" class="btn small outline" id="btn-copiar-sql3">${Icon.svg('lista')} Copiar o SQL da sincronização</button></div>
            <div id="area-sql3"></div></li>
          <li>Por fim, o ficheiro <code>servidor/04-papeis-e-convites.sql</code> (<strong>Run</strong>): permite <strong>convidar pessoas</strong> (administrador ou trabalhador) para a tua criação.
            <div class="acoes"><button type="button" class="btn small outline" id="btn-copiar-sql4">${Icon.svg('lista')} Copiar o SQL dos papéis e convites</button></div>
            <div id="area-sql4"></div></li>
    <li>Nas definições do projeto (<strong>API</strong>, ou o botão <strong>Connect</strong>) copia o <strong>Project URL</strong> e a chave pública, e cola-os acima.</li>
    <li>Carrega em <strong>Guardar e testar</strong>. Quando aparecer "Ligação ao servidor estabelecida", este passo está concluído.</li>
    <li>Cria a tua conta: no painel, <strong>Authentication → Users → Add user</strong> (email e palavra-passe, com "Auto Confirm User"), e depois usa <strong>Entrar</strong> aqui. Assim não dependes de emails (o serviço de email gratuito do Supabase só envia para a equipa e no máximo 2 por hora).</li>
    <li>Depois de entrares, carrega em <strong>Criar a minha criação</strong>.</li>
  </ol>
  <p class="footnote">${Icon.svg('dica')} No plano gratuito do Supabase, o projeto <strong>pausa se ficar uma semana sem uso</strong> (reativa-se no painel) e a base de dados tem 500 MB. Confirma os limites atuais em supabase.com/pricing. Continua a fazer backups manuais em Início → Exportar backup.</p>
  `;
}

function mostrarResultado(r){
  const el = document.getElementById('resultado-teste');
  const caixa = document.getElementById('estado-servidor');
  if(!el) return;
  const bom = r.estado === 'ok';
  el.innerHTML = `${Icon.svg(bom ? 'check' : 'aviso')} ${Util.escapeHTML(r.mensagem)}${bom && r.hora ? `<br>Hora do servidor: ${Util.escapeHTML(new Date(r.hora).toLocaleString('pt-PT'))} · esquema v${Util.escapeHTML(String(r.versaoEsquema))}` : ''}`;
  el.dataset.estado = r.estado;
  if(caixa) caixa.style.borderLeftColor = bom ? 'var(--mato)' : 'var(--sangue)';
}

function mostrarMensagemConta(texto, bom){
  const el = document.getElementById('msg-conta');
  if(el){ el.innerHTML = Icon.svg(bom ? 'check' : 'aviso') + ' ' + Util.escapeHTML(texto); el.dataset.estado = bom ? 'ok' : 'erro'; }
}

/* ---- Sessão iniciada: mostra a criação (granja) ou pede para a criar ---- */
function pintarGranja(granjas, aviso){
  const area = document.getElementById('area-granja');
  if(!area) return;
  const escolhida = Servidor.lerGranja();
  if(granjas && granjas.length){
    const atual = granjas.find(g=>escolhida && g.id===escolhida.id) || granjas[0];
    Servidor.guardarGranja(atual);
    area.innerHTML = `
      <p><strong id="nome-granja">${Util.escapeHTML(atual.nome)}</strong> <span class="badge">${atual.papel === 'administrador' ? 'administrador' : 'trabalhador'}</span></p>
      ${granjas.length > 1 ? `<label>Criação <select id="sel-granja">${granjas.map(g=>`<option value="${Util.escapeHTML(g.id)}" ${g.id===atual.id ? 'selected' : ''}>${Util.escapeHTML(g.nome)} (${Util.escapeHTML(g.papel)})</option>`).join('')}</select></label>` : ''}
      <div id="sec-sync" class="sync-seccao"><div id="area-sync"></div></div>
      <div id="sec-pessoas" class="sync-seccao"><div id="area-pessoas"></div></div>
      ${htmlConvite()}`;
    pintarSync();
    pintarPessoas(atual);
    ligarConvite();
    const sel = document.getElementById('sel-granja');
    if(sel) sel.addEventListener('change', ()=>{
      const g = granjas.find(x=>x.id===sel.value);
      if(g){ Servidor.guardarGranja(g); pintarGranja(granjas); }
    });
  } else if(granjas){
    area.innerHTML = `
      <p class="footnote">Ainda não pertences a nenhuma criação.</p>
      <form id="form-granja" class="inline">
        <label>Nome da criação <input type="text" name="nome" maxlength="80" placeholder="ex: Capoeira do Décio" required></label>
        <button class="btn" type="submit">Criar a minha criação</button>
      </form>
      ${htmlConvite()}`;
    ligarConvite();
    document.getElementById('form-granja').addEventListener('submit', async e=>{
      e.preventDefault();
      const r = await Servidor.criarGranja(new FormData(e.target).get('nome'));
      if(!r.ok){ Util.toast('⚠️ ' + r.mensagem); return; }
      Servidor.guardarGranja(r.granja);
      Util.toast('Criação criada');
      pintarGranja([r.granja]);
    });
  } else {
    const g = escolhida;
    area.innerHTML = g
      ? `<p><strong>${Util.escapeHTML(g.nome)}</strong> <span class="badge">${Util.escapeHTML(g.papel)}</span></p><p class="footnote">${Icon.svg('aviso')} ${Util.escapeHTML(aviso || 'Sem ligação ao servidor neste momento.')}</p>`
      : `<p class="footnote">${Icon.svg('aviso')} ${Util.escapeHTML(aviso || 'Não foi possível obter a tua criação.')}</p>`;
  }
}

/* ============ PESSOAS COM ACESSO E CONVITES (servidor/04-papeis-e-convites.sql) ============ */
const ROTULO_PAPEL = {administrador:'Administrador', trabalhador:'Trabalhador'};
let _conviteRecente = null;

/* Caixa "Tenho um convite": serve para quem recebeu um código de um administrador. */
function htmlConvite(){
  return `<details id="det-convite" class="sync-seccao">
    <summary><strong>Tenho um convite</strong> — entrar na criação de outra pessoa</summary>
    <form id="form-convite" class="inline">
      <label>Código do convite <input type="text" id="campo-convite" name="codigo" maxlength="20" autocomplete="off" placeholder="ex.: 7F3A-91C2-0BDE" required></label>
      <button class="btn" type="submit">Entrar na criação</button>
    </form>
    <p class="footnote">${Icon.svg('dica')} O código foi-te enviado por um administrador e só funciona com a conta do <strong>email para que foi feito</strong> (vale 7 dias e usa-se uma vez).</p>
  </details>`;
}
function ligarConvite(){
  const det = document.getElementById('det-convite'), form = document.getElementById('form-convite');
  if(!det || !form) return;
  const m = (location.hash || '').match(/convite=([\w-]+)/i);       // link recebido: servidor.html#convite=CODIGO
  if(m){ det.open = true; document.getElementById('campo-convite').value = m[1]; }
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const botao = form.querySelector('button[type=submit]'); botao.disabled = true;
    const r = await Servidor.aceitarConvite(new FormData(form).get('codigo'));
    botao.disabled = false;
    if(!r.ok){ Util.toast('⚠️ ' + r.mensagem, 6000); return; }
    const d = r.dados || {};
    Servidor.guardarGranja({id:d.granja_id, nome:d.granja_nome, papel:d.papel});
    history.replaceState(null, '', location.pathname);
    Util.toast(`Entraste em "${d.granja_nome}" como ${(ROTULO_PAPEL[d.papel] || d.papel).toLowerCase()}`, 5000);
    const c = await Servidor.minhasGranjas();
    pintarGranja(c.ok ? c.granjas : null, c.mensagem);
  });
}

async function pintarPessoas(g){
  const area = document.getElementById('area-pessoas');
  if(!area) return;
  const esc = Util.escapeHTML;
  area.innerHTML = '<p class="footnote">A carregar as pessoas…</p>';
  const r = await Servidor.listarMembros(g.id);
  if(!document.getElementById('area-pessoas')) return;
  if(!r.ok){
    area.innerHTML = `<p class="footnote erro">${Icon.svg('aviso')} ${esc(r.mensagem)}</p>`;
    return;
  }
  const admin = g.papel === 'administrador';
  const pessoas = Array.isArray(r.dados) ? r.dados : [];
  let convites = [];
  if(admin){
    const c = await Servidor.listarConvites(g.id);
    if(c.ok && Array.isArray(c.dados)) convites = c.dados;
  }
  const opcoesPapel = (atual)=>['trabalhador', 'administrador'].map(p=>`<option value="${p}" ${p === atual ? 'selected' : ''}>${ROTULO_PAPEL[p]}</option>`).join('');
  const linkDe = codigo=>`${location.origin}${location.pathname}#convite=${encodeURIComponent(codigo)}`;
  area.innerHTML = `
    <h3 class="sub-titulo mt-0">Pessoas com acesso</h3>
    <ul class="lista-pessoas">${pessoas.map(p=>`
      <li class="pessoa">
        <span class="pessoa-nome">${esc(p.email || 'sem email')}${p.sou_eu ? ' <em>(tu)</em>' : ''}</span>
        <span class="badge">${esc(ROTULO_PAPEL[p.papel] || p.papel)}</span>
        ${admin && !p.sou_eu ? `<select data-papel-de="${esc(p.utilizador_id)}" aria-label="Papel de ${esc(p.email || '')}">${opcoesPapel(p.papel)}</select>
          <button type="button" class="btn small outline" data-retirar="${esc(p.utilizador_id)}" data-email="${esc(p.email || '')}">Retirar</button>` : ''}
        ${p.sou_eu ? `<button type="button" class="btn small outline" data-sair>Sair desta criação</button>` : ''}
      </li>`).join('')}
    </ul>
    <p class="footnote">${Icon.svg('dica')} <strong>Administrador:</strong> vê e altera tudo e convida pessoas. <strong>Trabalhador:</strong> faz os registos do dia a dia (aves, ovos, ração, saúde, produção), mas <strong>não vê finanças, vendas nem revenda</strong>.</p>
    ${admin ? `
      <h3 class="sub-titulo">Convidar uma pessoa</h3>
      ${_conviteRecente ? `<div class="sync-painel convite-novo" role="status">
        <p><strong>Convite criado para ${esc(_conviteRecente.email)}</strong> (${esc(ROTULO_PAPEL[_conviteRecente.papel] || _conviteRecente.papel).toLowerCase()})</p>
        <p class="codigo-convite">${esc(_conviteRecente.codigo)}</p>
        <p class="footnote">Envia este código à pessoa (mensagem, WhatsApp…). Ela cria conta ou entra com <strong>este email</strong>, abre a página Servidor e escreve o código em "Tenho um convite". Vale 7 dias.</p>
        <div class="acoes"><button type="button" class="btn small" id="btn-copiar-convite">${Icon.svg('lista')} Copiar mensagem</button></div>
        <div id="area-convite-copia"></div></div>` : ''}
      <form id="form-convidar" class="inline">
        <label>Email da pessoa <input type="email" name="email" placeholder="nome@exemplo.com" required autocomplete="off"></label>
        <label>Papel <select name="papel">${opcoesPapel('trabalhador')}</select></label>
        <button class="btn" type="submit">Criar convite</button>
      </form>
      ${convites.length ? `<p class="footnote">Convites por usar:</p><ul class="lista-pessoas">${convites.map(c=>`
        <li class="pessoa"><span class="pessoa-nome">${esc(c.email)}</span> <span class="badge">${esc(ROTULO_PAPEL[c.papel] || c.papel)}</span>
          <code>${esc(c.codigo)}</code>
          <button type="button" class="btn small outline" data-cancelar-convite="${esc(c.id)}">Cancelar</button></li>`).join('')}</ul>` : ''}` : ''}`;

  const repintar = ()=>pintarPessoas(g);
  area.querySelectorAll('[data-papel-de]').forEach(sel=>sel.addEventListener('change', async ()=>{
    const res = await Servidor.alterarPapel(g.id, sel.dataset.papelDe, sel.value);
    Util.toast(res.ok ? 'Papel alterado' : '⚠️ ' + res.mensagem, res.ok ? 2400 : 6000);
    repintar();
  }));
  area.querySelectorAll('[data-retirar]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm(`Retirar ${b.dataset.email || 'esta pessoa'} desta criação? Deixa de ter acesso aos dados.`)) return;
    const res = await Servidor.removerMembro(g.id, b.dataset.retirar);
    Util.toast(res.ok ? 'Pessoa retirada' : '⚠️ ' + res.mensagem, res.ok ? 2400 : 6000);
    repintar();
  }));
  area.querySelectorAll('[data-cancelar-convite]').forEach(b=>b.addEventListener('click', async ()=>{
    const res = await Servidor.cancelarConvite(b.dataset.cancelarConvite);
    Util.toast(res.ok ? 'Convite cancelado' : '⚠️ ' + res.mensagem, res.ok ? 2400 : 6000);
    repintar();
  }));
  const sair = area.querySelector('[data-sair]');
  if(sair) sair.addEventListener('click', async ()=>{
    if(!confirm(`Sair de "${g.nome}"? Deixas de ter acesso aos dados no servidor (os que já estão neste aparelho ficam aqui).`)) return;
    const res = await Servidor.sairDaGranja(g.id);
    if(!res.ok){ Util.toast('⚠️ ' + res.mensagem, 6000); return; }
    const cfg = Sync.configuracao();
    if(cfg && cfg.granjaId === g.id) Sync.desligar();
    Servidor.limparGranja();
    Util.toast('Saíste da criação');
    carregarConta();
  });
  const fConv = document.getElementById('form-convidar');
  if(fConv) fConv.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fConv), botao = fConv.querySelector('button[type=submit]');
    botao.disabled = true;
    const res = await Servidor.convidar(g.id, fd.get('email'), fd.get('papel'));
    botao.disabled = false;
    if(!res.ok){ Util.toast('⚠️ ' + res.mensagem, 6000); return; }
    _conviteRecente = res.dados;
    repintar();
  });
  const bCopiar = document.getElementById('btn-copiar-convite');
  if(bCopiar && _conviteRecente) bCopiar.addEventListener('click', async ()=>{
    const c = _conviteRecente;
    const msg = `Convite para a Capoeira Digital ("${g.nome}"), como ${(ROTULO_PAPEL[c.papel] || c.papel).toLowerCase()}.\n`
      + `1) Abre ${location.origin}${location.pathname.replace(/[^/]*$/, '')}servidor.html\n`
      + `2) Cria conta ou entra com o email ${c.email}\n`
      + `3) Em "Tenho um convite" escreve o código ${c.codigo}  (vale 7 dias)\n`
      + `Ou abre directamente: ${linkDe(c.codigo)}`;
    try{ await navigator.clipboard.writeText(msg); Util.toast('Mensagem copiada'); }
    catch(err){
      document.getElementById('area-convite-copia').innerHTML = `<textarea readonly rows="7" class="area-codigo">${esc(msg)}</textarea>`;
      const ta = document.querySelector('#area-convite-copia textarea'); if(ta){ ta.focus(); ta.select(); }
    }
  });
}

/* ============ SINCRONIZAÇÃO (painel na criação escolhida) ============ */
let _syncOuvinte = false;
const TEXTO_ESTADO_SYNC = {'ok':'Sincronizado', 'a-sincronizar':'A sincronizar…', 'offline':'Sem ligação', 'sessao':'Sessão terminada', 'erro':'Erro', 'inactivo':'Desligada'};
function quandoSync(iso){
  if(!iso) return 'ainda não';
  try{ return new Date(iso).toLocaleString('pt-PT', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}); }catch(e){ return iso; }
}

async function actualizarEstadoSync(){
  const el = document.getElementById('estado-sync');
  if(!el) return;
  const e = Sync.estado();
  let pend = 0;
  try{ pend = await Sync.pendentes(); }catch(err){}
  const esc = Util.escapeHTML;
  const relogio = Math.abs(e.desvioRelogioS) > 120
    ? `<p class="footnote erro">${Icon.svg('aviso')} O relógio deste aparelho está ${e.desvioRelogioS > 0 ? 'adiantado' : 'atrasado'} cerca de ${Math.round(Math.abs(e.desvioRelogioS) / 60)} minuto(s). Põe a data e a hora em <strong>automático</strong>: com o relógio errado, as tuas alterações podem perder contra as dos outros aparelhos.</p>`
    : '';
  el.innerHTML = `
    <p><span class="sync-ponto sync-${esc(e.estado)}"></span> <strong>${esc(TEXTO_ESTADO_SYNC[e.estado] || e.estado)}</strong>${e.detalhe ? ' — ' + esc(e.detalhe) : ''}</p>
    <p class="footnote">Última sincronização: ${esc(quandoSync(e.ultimaSync))} · ${pend ? pend + ' alteração(ões) por enviar' : 'nada por enviar'}</p>${relogio}`;
}

async function pintarSync(){
  const area = document.getElementById('area-sync');
  if(!area) return;
  const g = Servidor.lerGranja();
  if(!g){ area.innerHTML = ''; return; }
  if(!_syncOuvinte){
    _syncOuvinte = true;
    Sync.aoMudar(()=>{ actualizarEstadoSync(); });
  }
  const esc = Util.escapeHTML;
  const cfg = Sync.configuracao();
  if(cfg && cfg.granjaId !== g.id){
    area.innerHTML = `<p class="footnote">${Icon.svg('aviso')} Este aparelho sincroniza com <strong>${esc(cfg.granjaNome)}</strong>. Para sincronizar com <strong>${esc(g.nome)}</strong>, desliga primeiro a sincronização.</p>
      <div class="acoes"><button type="button" class="btn small outline" id="btn-sync-desligar">Desligar a sincronização</button></div>`;
  } else if(cfg){
    area.innerHTML = `<div id="estado-sync" class="sync-painel" role="status"></div>
      <div class="acoes">
        <button type="button" class="btn small" id="btn-sync-agora">${Icon.svg('atualizar')} Sincronizar agora</button>
        <button type="button" class="btn small outline" id="btn-sync-desligar">Desligar neste aparelho</button>
      </div>`;
    await actualizarEstadoSync();
  } else {
    area.innerHTML = `<p class="footnote">${Icon.svg('dica')} A sincronização mantém os mesmos dados no telemóvel e no computador: o que registas num aparece no outro. Funciona sem internet e envia quando a ligação volta.</p>
      <div class="acoes"><button type="button" class="btn" id="btn-sync-ligar">Ligar a sincronização</button></div>
      <div id="area-sync-escolha"></div>`;
  }
  const bAgora = document.getElementById('btn-sync-agora');
  if(bAgora) bAgora.addEventListener('click', async ()=>{
    bAgora.disabled = true;
    const r = await Sync.sincronizar();
    bAgora.disabled = false;
    Util.toast(r.ok ? `Sincronizado — enviadas ${r.enviados}, recebidas ${r.aplicados}` : '⚠️ ' + (r.mensagem || 'Não foi possível sincronizar'));
    await actualizarEstadoSync();
  });
  const bDesligar = document.getElementById('btn-sync-desligar');
  if(bDesligar) bDesligar.addEventListener('click', ()=>{
    if(!confirm('Desligar a sincronização neste aparelho? Os dados ficam aqui; deixam de seguir para o servidor e de chegar de lá.')) return;
    Sync.desligar();
    Util.toast('Sincronização desligada neste aparelho');
    pintarSync();
  });
  const bLigar = document.getElementById('btn-sync-ligar');
  if(bLigar) bLigar.addEventListener('click', ()=>escolherComoLigar(g));
}

/* Antes de ligar, mostra o que há aqui e no servidor, para decidir como começar. */
async function escolherComoLigar(g){
  const area = document.getElementById('area-sync-escolha');
  if(!area) return;
  const esc = Util.escapeHTML;
  area.innerHTML = '<p class="footnote">A consultar o servidor…</p>';
  const r = await Sync.resumoParaLigar(g.id);
  if(r.erro || !r.servidor){
    area.innerHTML = `<p class="footnote erro">${Icon.svg('aviso')} ${esc(r.erro || 'Não foi possível consultar o servidor.')}</p>`;
    return;
  }
  const local = r.local, noServidor = r.servidor.vivos, servidorVazio = r.servidor.total === 0;
  let texto, botoes;
  if(local === 0 && servidorVazio){
    texto = 'Nem este aparelho nem o servidor têm dados ainda. O que registares passa a seguir sozinho.';
    botoes = [['enviar', 'Ligar', 'btn']];
  } else if(servidorVazio){
    texto = `O servidor está vazio e este aparelho tem <strong>${local}</strong> registo(s). Vão ser enviados para o servidor.`;
    botoes = [['enviar', 'Enviar os dados deste aparelho', 'btn']];
  } else if(local === 0){
    texto = `Este aparelho está vazio e o servidor já tem <strong>${noServidor}</strong> registo(s). Vão ser trazidos para aqui.`;
    botoes = [['receber', 'Trazer os dados do servidor', 'btn']];
  } else {
    texto = `Este aparelho tem <strong>${local}</strong> registo(s) e o servidor também tem <strong>${noServidor}</strong>. O que queres fazer?`;
    botoes = [['juntar', 'Juntar os dois (fica tudo)', 'btn'], ['substituir', 'Substituir os daqui pelos do servidor', 'btn outline']];
  }
  area.innerHTML = `<div class="sync-painel"><p>${texto}</p>
    ${botoes.length > 1 ? `<p class="footnote">${Icon.svg('dica')} "Juntar" mantém tudo, mas se os dois lados tiverem os mesmos animais registados à parte, ficam repetidos. "Substituir" apaga os dados <em>deste</em> aparelho e fica só com os do servidor.</p>` : ''}
    <div class="acoes">${botoes.map(([modo, rotulo, cls])=>`<button type="button" class="${cls}" data-modo-sync="${modo}">${esc(rotulo)}</button>`).join('')}
      <button type="button" class="btn small outline" id="btn-sync-cancelar">Cancelar</button></div></div>`;
  document.getElementById('btn-sync-cancelar').addEventListener('click', ()=>{ area.innerHTML = ''; });
  area.querySelectorAll('[data-modo-sync]').forEach(b=>b.addEventListener('click', async ()=>{
    const modo = b.dataset.modoSync;
    if(modo === 'substituir' && !confirm(`Vais APAGAR os ${local} registo(s) deste aparelho e ficar só com os do servidor. Já exportaste um backup (Início → Exportar backup)? Continuar?`)) return;
    area.querySelectorAll('button').forEach(x=>{ x.disabled = true; });
    const res = await Sync.ligar(g, modo);
    Util.toast(res.ok && res.tipo !== 'offline'
      ? `Sincronização ligada — enviadas ${res.enviados || 0}, recebidas ${res.aplicados || 0}`
      : '⚠️ ' + (res.mensagem || 'Ligada, mas ainda não foi possível sincronizar'));
    await pintarSync();
  }));
}

async function carregarConta(){
  if(!Servidor.lerConfig()) return;
  /* regresso do "Entrar com Google": os tokens vêm no endereço (#access_token=…) */
  if(location.hash.includes('access_token') || location.hash.includes('error_description')){
    const f = Servidor.sessaoDeFragmento(location.hash);
    history.replaceState(null, '', location.pathname + location.search);
    if(f && f.sessao){ Servidor.guardarSessao(f.sessao); Util.toast('Sessão iniciada com Google'); await renderLigacao(); return; }
    if(f && f.erro) Util.toast('⚠️ ' + f.erro);
  }
  if(!Servidor.lerSessao()) return;
  const r = await Servidor.minhasGranjas();
  if(r.ok) pintarGranja(r.granjas);
  else if(!Servidor.lerSessao()){ await renderLigacao(); }   // a renovação falhou: pede novo login
  else pintarGranja(null, r.mensagem);
}

function attachHandlersLigacao(){
  const form = document.getElementById('form-ligacao');
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(form);
    const u = Servidor.normalizarUrl(fd.get('url'));
    if(u.erro){ Util.toast('⚠️ ' + u.erro); return; }
    const k = Servidor.analisarChave(fd.get('chave'));
    if(k.erro){ Util.toast('⚠️ ' + k.erro); return; }
    const antiga = Servidor.lerConfig();
    if(!Servidor.guardarConfig({url:u.url, chave:k.chave, tipo:k.tipo})){ Util.toast('⚠️ Não foi possível guardar neste navegador'); return; }
    if(antiga && antiga.url !== u.url){ Servidor.limparSessao(); Servidor.limparGranja(); } // outro projeto: a sessão antiga não serve
    Util.toast('Ligação guardada — a testar…');
    await renderLigacao();
  });
  const bTestar = document.getElementById('btn-testar-ligacao');
  if(bTestar) bTestar.addEventListener('click', async ()=>{
    const el = document.getElementById('resultado-teste'); if(el) el.textContent = 'A testar…';
    mostrarResultado(await Servidor.testar());
  });
  const bRemover = document.getElementById('btn-remover-ligacao');
  if(bRemover) bRemover.addEventListener('click', async ()=>{
    if(!confirm('Remover a ligação ao servidor deste aparelho? Os dados que estão aqui não são apagados.')) return;
    Servidor.limparSessao(); Servidor.limparGranja(); Servidor.removerConfig();
    Util.toast('Ligação removida');
    await renderLigacao();
  });

  /* ---- Conta: entrar, criar, recuperar, Google, sair ---- */
  const formConta = document.getElementById('form-conta');
  if(formConta){
    const valores = ()=>{ const fd = new FormData(formConta); return {email:String(fd.get('email')||'').trim(), senha:String(fd.get('senha')||'')}; };
    formConta.addEventListener('submit', async e=>{
      e.preventDefault();
      const {email, senha} = valores();
      mostrarMensagemConta('A entrar…', true);
      const r = await Servidor.entrar(email, senha);
      if(!r.ok){ mostrarMensagemConta(r.mensagem, false); return; }
      Util.toast('Sessão iniciada');
      await renderLigacao();
    });
    document.getElementById('btn-criar-conta').addEventListener('click', async ()=>{
      const {email, senha} = valores();
      mostrarMensagemConta('A criar a conta…', true);
      const r = await Servidor.criarConta(email, senha);
      if(!r.ok){ mostrarMensagemConta(r.mensagem, false); return; }
      if(r.confirmar){ mostrarMensagemConta(r.mensagem, true); return; }
      Util.toast('Conta criada e sessão iniciada');
      await renderLigacao();
    });
    document.getElementById('btn-recuperar').addEventListener('click', async ()=>{
      const r = await Servidor.recuperarSenha(valores().email);
      mostrarMensagemConta(r.mensagem, r.ok);
    });
    const bG = document.getElementById('btn-google');
    if(bG) bG.addEventListener('click', ()=>{ const u = Servidor.urlGoogle(); if(u) location.href = u; });
  }
  const bSair = document.getElementById('btn-sair');
  if(bSair) bSair.addEventListener('click', async ()=>{
    await Servidor.sair();
    Util.toast('Sessão terminada');
    await renderLigacao();
  });

  const copiarSql = (idBotao, ficheiro, idArea)=>{
    const botao = document.getElementById(idBotao);
    if(!botao) return;
    botao.addEventListener('click', async ()=>{
      let texto;
      try{
        const r = await fetch(ficheiro, {cache:'no-cache'});
        if(!r.ok) throw new Error('http ' + r.status);
        texto = await r.text();
      }catch(e){ Util.toast('⚠️ Não foi possível ler o ficheiro SQL (precisa de internet na primeira vez)'); return; }
      try{
        await navigator.clipboard.writeText(texto);
        Util.toast('SQL copiado — cola-o no SQL Editor do Supabase');
      }catch(e){
        document.getElementById(idArea).innerHTML = `<textarea readonly rows="8" class="area-codigo">${Util.escapeHTML(texto)}</textarea><p class="footnote">Seleciona tudo (toque longo → Selecionar tudo) e copia.</p>`;
        const ta = document.querySelector('#' + idArea + ' textarea'); if(ta){ ta.focus(); ta.select(); }
      }
    });
  };
  copiarSql('btn-copiar-sql', 'servidor/01-esquema.sql', 'area-sql');
  copiarSql('btn-copiar-sql3', 'servidor/03-sincronizacao.sql', 'area-sql3');
  copiarSql('btn-copiar-sql4', 'servidor/04-papeis-e-convites.sql', 'area-sql4');
  if(Servidor.lerConfig()) Servidor.testar().then(mostrarResultado);
}

UI.initPagina(renderLigacao);
