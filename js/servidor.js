/* @revisao 2.18.0 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).servidor = '2.18.0';
/* ============ LIGAÇÃO AO SERVIDOR (Supabase) ============
   Guarda no aparelho o endereço do projeto e a chave PÚBLICA, e fala com a
   API REST do Supabase usando só fetch (sem bibliotecas, funciona na PWA).

   A chave pública (anon/publishable) pode estar na app: quem manda nos dados
   são as regras de acesso (RLS) do servidor. A chave SECRETA (service_role /
   sb_secret_) NUNCA pode vir para aqui — esta camada recusa-a. */
const Servidor = (()=>{
  const CHAVE = 'capoeira-servidor';

  function lerConfig(){
    try{ const c = JSON.parse(localStorage.getItem(CHAVE) || 'null'); return (c && c.url && c.chave) ? c : null; }
    catch(e){ return null; }
  }
  function guardarConfig(cfg){
    try{ localStorage.setItem(CHAVE, JSON.stringify(cfg)); return true; }catch(e){ return false; }
  }
  function removerConfig(){ try{ localStorage.removeItem(CHAVE); }catch(e){} }

  /* "https://abc.supabase.co/rest/v1/" → {url:"https://abc.supabase.co"} */
  function normalizarUrl(bruto){
    let u = String(bruto==null ? '' : bruto).trim();
    if(!u) return {erro:'Indica o endereço (URL) do projeto.'};
    if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
    let url;
    try{ url = new URL(u); }catch(e){ return {erro:'O endereço não é válido.'}; }
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if(url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return {erro:'Usa um endereço que comece por https://'};
    if(!local && !url.hostname.includes('.')) return {erro:'O endereço não é válido.'};
    return {url: url.origin};
  }

  function descodificarBase64Url(s){
    let b = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while(b.length % 4) b += '=';
    const bin = (typeof atob === 'function') ? atob(b) : Buffer.from(b, 'base64').toString('binary');
    return decodeURIComponent(bin.split('').map(c=>'%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
  }

  /* Aceita a chave pública; recusa chaves secretas. */
  function analisarChave(bruta){
    const k = String(bruta==null ? '' : bruta).replace(/\s+/g, '');
    if(!k) return {erro:'Indica a chave pública do projeto.'};
    const aviso = 'Essa é uma chave SECRETA. Nunca a coloques na app: usa a chave pública (anon / publishable).';
    if(/^sb_secret_/i.test(k)) return {erro:aviso};
    if(/^sb_publishable_/i.test(k)) return {chave:k, tipo:'publishable'};
    const partes = k.split('.');
    if(partes.length === 3){
      try{
        const payload = JSON.parse(descodificarBase64Url(partes[1]));
        if(payload.role === 'service_role') return {erro:aviso};
        return {chave:k, tipo:'jwt', papel:payload.role || ''};
      }catch(e){ /* cai para o erro genérico */ }
    }
    return {erro:'A chave não parece válida (começa por "eyJ…" ou "sb_publishable_…").'};
  }

  /* Pedido genérico à API; nunca lança erro, devolve {ok, status, dados, erro?} */
  async function pedido(caminho, opcoes){
    const o = opcoes || {};
    const cfg = o.config || lerConfig();
    if(!cfg) return {ok:false, status:0, erro:'sem-configuracao'};
    const tokenSessao = (o.token || o.semSessao) ? null : await tokenValido();
    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctl ? setTimeout(()=>ctl.abort(), o.tempoMs || 10000) : null;
    try{
      const r = await fetch(cfg.url + caminho, {
        method: o.metodo || 'GET',
        signal: ctl ? ctl.signal : undefined,
        headers: Object.assign({
          apikey: cfg.chave,
          Authorization: 'Bearer ' + (o.token || tokenSessao || cfg.chave),
          'Content-Type': 'application/json'
        }, o.cabecalhos || {}),
        body: o.corpo !== undefined ? JSON.stringify(o.corpo) : undefined
      });
      const texto = await r.text();
      let dados = null;
      try{ dados = texto ? JSON.parse(texto) : null; }catch(e){ dados = texto; }
      return {ok:r.ok, status:r.status, dados};
    }catch(e){
      return {ok:false, status:0, erro: (e && e.name === 'AbortError') ? 'tempo-esgotado' : 'sem-ligacao'};
    }finally{
      if(timer) clearTimeout(timer);
    }
  }

  /* Pergunta ao servidor se está pronto (função public.ping do 01-esquema.sql). */
  async function testar(config){
    const r = await pedido('/rest/v1/rpc/ping', {metodo:'POST', corpo:{}, config, semSessao:true});
    if(r.erro === 'sem-configuracao') return {estado:'sem-configuracao', mensagem:'Ainda não há ligação configurada.'};
    if(r.erro === 'tempo-esgotado') return {estado:'tempo-esgotado', mensagem:'O servidor demorou demasiado a responder. Se o projeto é gratuito e esteve uma semana sem uso, pode estar em pausa: reativa-o no painel do Supabase.'};
    if(r.erro) return {estado:'sem-ligacao', mensagem:'Não foi possível contactar o servidor. Confirma a internet e o endereço do projeto.'};
    if(r.ok && r.dados && r.dados.ok) return {estado:'ok', hora:r.dados.hora, versaoEsquema:r.dados.versao_esquema, mensagem:'Ligação ao servidor estabelecida.'};
    const codigo = r.dados && typeof r.dados === 'object' ? r.dados.code : '';
    if(r.status === 404 || codigo === 'PGRST202') return {estado:'falta-esquema', mensagem:'O servidor responde, mas falta executar o ficheiro 01-esquema.sql no SQL Editor do Supabase.'};
    if(r.status === 401 || r.status === 403) return {estado:'chave-invalida', mensagem:'O servidor recusou a chave. Confirma que copiaste a chave pública (anon / publishable) do mesmo projeto.'};
    if(r.status >= 500) return {estado:'servidor-indisponivel', mensagem:'O servidor está indisponível neste momento (se o projeto estava em pausa, reativa-o no painel).'};
    return {estado:'erro', mensagem:`Resposta inesperada do servidor (código ${r.status}).`};
  }


  /* ============ SESSÃO (login) ============
     Fala com o Supabase Auth (GoTrue) pela API REST. A sessão (tokens) fica
     só neste aparelho; a palavra-passe nunca é guardada. */
  const CHAVE_SESSAO = 'capoeira-sessao', CHAVE_GRANJA = 'capoeira-granja';
  let renovacaoEmCurso = null;

  const lerJson = k => { try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } };
  const gravarJson = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } };
  const lerSessao = () => { const s = lerJson(CHAVE_SESSAO); return (s && s.access_token) ? s : null; };
  const guardarSessao = s => gravarJson(CHAVE_SESSAO, s);
  const limparSessao = () => { try{ localStorage.removeItem(CHAVE_SESSAO); }catch(e){} };
  const lerGranja = () => { const g = lerJson(CHAVE_GRANJA); return (g && g.id) ? g : null; };
  const guardarGranja = g => gravarJson(CHAVE_GRANJA, g);
  const limparGranja = () => { try{ localStorage.removeItem(CHAVE_GRANJA); }catch(e){} };

  const agoraSeg = () => Math.floor(Date.now() / 1000);
  function descodificarPayload(token){
    try{ return JSON.parse(descodificarBase64Url(String(token).split('.')[1])); }catch(e){ return {}; }
  }
  /* resposta do GoTrue → sessão guardada */
  function sessaoDeResposta(d){
    if(!d || typeof d !== 'object' || !d.access_token) return null;
    const p = descodificarPayload(d.access_token);
    return {
      access_token: d.access_token, refresh_token: d.refresh_token || '',
      expires_at: Number(d.expires_at) || (agoraSeg() + (Number(d.expires_in) || 3600)),
      user: {id: (d.user && d.user.id) || p.sub || '', email: (d.user && d.user.email) || p.email || ''}
    };
  }
  /* regresso do Google: #access_token=…&refresh_token=…&expires_in=… */
  function sessaoDeFragmento(hash){
    const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    if(p.get('error_description') || p.get('error')) return {erro: p.get('error_description') || p.get('error')};
    if(!p.get('access_token')) return null;
    const s = sessaoDeResposta({access_token:p.get('access_token'), refresh_token:p.get('refresh_token'), expires_at:p.get('expires_at'), expires_in:p.get('expires_in')});
    return s ? {sessao:s} : null;
  }

  function mensagemAuth(r){
    if(r.erro === 'sem-ligacao') return 'Sem ligação à internet ou ao servidor.';
    if(r.erro === 'tempo-esgotado') return 'O servidor demorou demasiado a responder.';
    const d = (r.dados && typeof r.dados === 'object') ? r.dados : {};
    const msg = String(d.msg || d.error_description || d.message || (typeof r.dados === 'string' ? r.dados : ''));
    const t = `${d.error_code || ''} ${d.code || ''} ${d.error || ''} ${msg}`.toLowerCase();
    if(/invalid_credentials|invalid login credentials/.test(t)) return 'Email ou palavra-passe incorretos.';
    if(/email_not_confirmed|email not confirmed/.test(t)) return 'O email ainda não foi confirmado. Abre o email que enviámos e carrega na ligação.';
    if(/user_already_exists|already registered/.test(t)) return 'Já existe uma conta com este email. Usa "Entrar".';
    if(/weak_password|password should be/.test(t)) return 'A palavra-passe é demasiado fraca (usa 8 ou mais caracteres).';
    if(/signup_disabled|signups not allowed|signup is disabled/.test(t)) return 'O registo de contas novas está desativado neste projeto. Pede ao administrador para criar a tua conta.';
    if(/not authorized/.test(t)) return 'O servidor de email do projeto só envia para membros da equipa. Pede ao administrador para criar a tua conta.';
    if(/rate.?limit|too many/.test(t) || r.status === 429) return 'Demasiados pedidos ou emails enviados. Espera um pouco e tenta de novo.';
    if(/validation_failed|invalid.*email|unable to validate email/.test(t)) return 'O email não é válido.';
    return msg ? `Erro do servidor: ${msg}` : `Erro inesperado (código ${r.status}).`;
  }

  const emailValido = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

  async function entrar(email, senha){
    if(!emailValido(email)) return {ok:false, mensagem:'Indica um email válido.'};
    if(!senha) return {ok:false, mensagem:'Indica a palavra-passe.'};
    const r = await pedido('/auth/v1/token?grant_type=password', {metodo:'POST', corpo:{email:String(email).trim(), password:senha}, semSessao:true});
    const s = r.ok ? sessaoDeResposta(r.dados) : null;
    if(!s) return {ok:false, mensagem:mensagemAuth(r)};
    guardarSessao(s);
    return {ok:true, sessao:s};
  }
  async function criarConta(email, senha){
    if(!emailValido(email)) return {ok:false, mensagem:'Indica um email válido.'};
    if(String(senha || '').length < 8) return {ok:false, mensagem:'A palavra-passe deve ter pelo menos 8 caracteres.'};
    const r = await pedido('/auth/v1/signup', {metodo:'POST', corpo:{email:String(email).trim(), password:senha}, semSessao:true});
    if(!r.ok) return {ok:false, mensagem:mensagemAuth(r)};
    const s = sessaoDeResposta(r.dados);
    if(s){ guardarSessao(s); return {ok:true, sessao:s, confirmar:false}; }
    return {ok:true, confirmar:true, mensagem:'Conta criada. Enviámos um email de confirmação: abre-o e carrega na ligação; depois volta aqui e usa "Entrar".'};
  }
  async function recuperarSenha(email){
    if(!emailValido(email)) return {ok:false, mensagem:'Indica o teu email no campo acima.'};
    const r = await pedido('/auth/v1/recover', {metodo:'POST', corpo:{email:String(email).trim()}, semSessao:true});
    return r.ok ? {ok:true, mensagem:'Se existir uma conta com esse email, enviámos uma ligação para criar nova palavra-passe.'} : {ok:false, mensagem:mensagemAuth(r)};
  }
  async function sair(){
    const s = lerSessao();
    if(s) await pedido('/auth/v1/logout', {metodo:'POST', token:s.access_token, semSessao:true, tempoMs:4000}); // melhor esforço
    limparSessao(); limparGranja();
    return {ok:true};
  }

  /* Troca o refresh_token por tokens novos (uma só renovação de cada vez) */
  function renovarSessao(){
    if(renovacaoEmCurso) return renovacaoEmCurso;
    renovacaoEmCurso = (async ()=>{
      const s = lerSessao();
      if(!s || !s.refresh_token) return {ok:false, motivo:'sem-sessao'};
      const r = await pedido('/auth/v1/token?grant_type=refresh_token', {metodo:'POST', corpo:{refresh_token:s.refresh_token}, semSessao:true});
      const nova = r.ok ? sessaoDeResposta(r.dados) : null;
      if(nova){ guardarSessao(nova); return {ok:true, sessao:nova}; }
      if(r.status === 400 || r.status === 401 || r.status === 403){ limparSessao(); return {ok:false, motivo:'expirada'}; } // sessão inválida: pede novo login
      return {ok:false, motivo:'sem-ligacao'}; // offline: mantém a sessão
    })().finally(()=>{ renovacaoEmCurso = null; });
    return renovacaoEmCurso;
  }
  /* Token de acesso válido (renova se faltar menos de 60 s); null se não houver */
  async function tokenValido(){
    const s = lerSessao();
    if(!s) return null;
    if(s.expires_at - agoraSeg() > 60) return s.access_token;
    const r = await renovarSessao();
    if(r.ok) return r.sessao.access_token;
    return null;
  }

  function urlGoogle(){
    const cfg = lerConfig();
    if(!cfg) return null;
    return `${cfg.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin + location.pathname)}`;
  }

  /* Granjas a que o utilizador pertence */
  async function minhasGranjas(){
    const s = lerSessao();
    if(!s) return {ok:false, mensagem:'Sem sessão iniciada.'};
    const tok = await tokenValido();   // renova se for preciso; se falhar, nunca cai para a chave pública
    if(!tok) return {ok:false, expirada:!lerSessao(), mensagem: lerSessao() ? 'Sem ligação ao servidor neste momento.' : 'A sessão expirou. Entra de novo.'};
    const r = await pedido(`/rest/v1/membros?select=granja_id,papel,granjas(id,nome)&utilizador_id=eq.${encodeURIComponent(s.user.id)}`, {token:tok});
    if(!r.ok || !Array.isArray(r.dados)) return {ok:false, erro:r.erro, mensagem:mensagemAuth(r)};
    return {ok:true, granjas:r.dados.filter(m=>m.granjas).map(m=>({id:m.granja_id, nome:m.granjas.nome, papel:m.papel}))};
  }
  async function criarGranja(nome){
    const n = String(nome || '').trim();
    if(!n) return {ok:false, mensagem:'Indica o nome da criação.'};
    const tok = await tokenValido();
    if(!tok) return {ok:false, mensagem: lerSessao() ? 'Sem ligação ao servidor neste momento.' : 'A sessão expirou. Entra de novo.'};
    const r = await pedido('/rest/v1/rpc/criar_granja', {metodo:'POST', corpo:{p_nome:n}, token:tok});
    if(!r.ok || typeof r.dados !== 'string') return {ok:false, mensagem:mensagemAuth(r)};
    return {ok:true, granja:{id:r.dados, nome:n, papel:'administrador'}};
  }

  /* ============ PESSOAS E CONVITES (servidor/04-papeis-e-convites.sql) ============
     Todas as chamadas são funções do servidor. Quando uma regra recusa o pedido (ex.: "Só os
     administradores podem convidar pessoas"), a mensagem que o servidor devolve já vem em
     português e é essa que se mostra. */
  async function rpc(nome, corpo){
    const tok = await tokenValido();
    if(!tok) return {ok:false, mensagem: lerSessao() ? 'Sem ligação ao servidor neste momento.' : 'A sessão expirou. Entra de novo.'};
    const r = await pedido('/rest/v1/rpc/' + nome, {metodo:'POST', corpo: corpo || {}, token: tok});
    if(r.ok) return {ok:true, dados:r.dados};
    const d = r.dados && typeof r.dados === 'object' ? r.dados : {};
    if(r.status === 404 || d.code === 'PGRST202') return {ok:false, falhaSql:true, mensagem:'Falta executar o ficheiro servidor/04-papeis-e-convites.sql no Supabase.'};
    if(r.status === 401 || r.status === 403) return {ok:false, expirada:true, mensagem:'A sessão terminou ou já não tens permissão. Entra de novo na página Servidor.'};
    if(d.message && r.status >= 400 && r.status < 500) return {ok:false, mensagem:String(d.message)};
    if(r.status >= 500) return {ok:false, mensagem:'O servidor está indisponível neste momento. Tenta mais tarde.'};
    return {ok:false, erro:r.erro, mensagem:mensagemAuth(r)};
  }
  const convidar = (granja, email, papel)=>rpc('convidar', {p_granja:granja, p_email:email, p_papel:papel || 'trabalhador'});
  const aceitarConvite = codigo=>rpc('aceitar_convite', {p_codigo:codigo});
  const listarMembros = granja=>rpc('listar_membros', {p_granja:granja});
  const listarConvites = granja=>rpc('listar_convites', {p_granja:granja});
  const cancelarConvite = id=>rpc('cancelar_convite', {p_convite:id});
  const alterarPapel = (granja, utilizador, papel)=>rpc('alterar_papel', {p_granja:granja, p_utilizador:utilizador, p_papel:papel});
  const removerMembro = (granja, utilizador)=>rpc('remover_membro', {p_granja:granja, p_utilizador:utilizador});
  const sairDaGranja = granja=>rpc('sair_da_granja', {p_granja:granja});
  /* O papel nesta criação ('administrador' | 'trabalhador'), ou null se não houver criação escolhida. */
  function papelActual(){
    const g = lerGranja();
    return g && g.papel ? g.papel : null;
  }

  return {lerConfig, guardarConfig, removerConfig, normalizarUrl, analisarChave, pedido, testar,
    lerSessao, guardarSessao, limparSessao, lerGranja, guardarGranja, limparGranja, sessaoDeResposta, sessaoDeFragmento,
    mensagemAuth, emailValido, entrar, criarConta, recuperarSenha, sair, renovarSessao, tokenValido, urlGoogle, minhasGranjas, criarGranja,
    convidar, aceitarConvite, listarMembros, listarConvites, cancelarConvite, alterarPapel, removerMembro, sairDaGranja, papelActual};
})();
if(typeof module !== 'undefined') module.exports = Servidor;
