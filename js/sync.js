/* @revisao 2.18.0 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).sync = '2.18.0';
/* ============================================================
   SINCRONIZAÇÃO ENTRE APARELHOS (telemóvel, computador…)

   Como funciona
   • Cada aparelho continua a guardar tudo localmente (funciona sem internet). Quando há
     ligação, este módulo ENVIA para o servidor o que mudou aqui e RECEBE o que mudou nos
     outros aparelhos. Tudo passa pelas funções do servidor/03-sincronizacao.sql.
   • Enviar: todos os registos com atualizadoEm depois do último enviado (db.js dá a cada
     alteração um carimbo novo e sempre crescente). Apagar também é uma alteração: o registo
     vai com apagado:true.
   • Receber: tudo o que o servidor recebeu depois do último ponto lido (o ponto é guardado
     aqui). Para não perder nada quando dois aparelhos gravam quase ao mesmo tempo, cada
     ronda volta 5 segundos atrás — receber duas vezes o mesmo registo é inofensivo.
   • Se o mesmo registo foi alterado em dois aparelhos, ganha a alteração MAIS RECENTE
     (atualizadoEm). Nunca uma alteração antiga apaga uma nova.
   • Corre sozinho: ao abrir a app, quando volta a haver internet, quando se volta à app,
     poucos segundos depois de gravares alguma coisa e de minuto a minuto. Também há o botão
     "Sincronizar agora" na página Servidor.
   • Limitação conhecida: a decisão "o mais recente ganha" usa o relógio de cada aparelho.
     O servidor limita datas do futuro (+5 min), mas um relógio atrasado faz as alterações
     desse aparelho parecerem mais antigas. Mantém a hora dos aparelhos certa (automática).

   O servidor fica atrás de um "transporte" (enviar / receber / resumo): em produção é o
   Supabase (transporteSupabase); nos testes é um servidor falso em memória.
   ============================================================ */
const Sync = (function(){
  'use strict';
  const CHAVE = 'capoeira-sync';
  const LOTE_ENVIO = 200, LOTE_RECEBER = 500;
  /* O trabalhador não usa estas tabelas (finanças, vendas, revenda): nem as envia nem as recebe.
     O servidor também o impõe — isto evita pedidos inúteis e guarda-o de ter dados que não pode ver. */
  const TABELAS_RESTRITAS = ['transacoes', 'vendas', 'revenda', 'revendaMov'];
  let papelFn = null;
  function papelActual(){
    if(papelFn) return papelFn();
    try{ return (typeof Servidor !== 'undefined' && Servidor.papelActual && Servidor.papelActual()) || 'administrador'; }
    catch(e){ return 'administrador'; }
  }
  function definirPapel(fn){ papelFn = fn; }     // para os testes
  const SOBREPOSICAO_MS = 5000, INTERVALO_MS = 60000, ESPERA_APOS_ALTERAR_MS = 2500;

  const eventos = new EventTarget();
  let transporte = null, transporteInjetado = false, emCurso = null, repetir = false;
  let timerEspera = null, automaticoLigado = false;
  let estado = {estado:'inactivo', detalhe:''};

  const agoraIso = ()=> new Date().toISOString();
  function ler(){
    try{ const c = JSON.parse(localStorage.getItem(CHAVE) || 'null'); return (c && c.granjaId) ? c : null; }
    catch(e){ return null; }
  }
  function gravar(c){ try{ localStorage.setItem(CHAVE, JSON.stringify(c)); }catch(e){} }

  /* ---------- Estado (para o indicador no topo e para a página Servidor) ---------- */
  function definir(novo, detalhe){
    estado = {estado:novo, detalhe:detalhe || ''};
    eventos.dispatchEvent(new CustomEvent('estado', {detail:estadoActual()}));
  }
  function estadoActual(){
    const cfg = ler();
    return {
      estado: cfg ? (estado.estado === 'inactivo' ? 'ok' : estado.estado) : 'inactivo',
      detalhe: estado.detalhe,
      ligado: !!cfg,
      granjaId: cfg ? cfg.granjaId : null,
      granjaNome: cfg ? cfg.granjaNome : '',
      ultimaSync: cfg ? cfg.ultimaSync : null,
      desvioRelogioS: cfg && typeof cfg.desvioRelogioS === 'number' ? cfg.desvioRelogioS : 0     // + = este relógio está adiantado
    };
  }
  function aoMudar(fn){ eventos.addEventListener('estado', e=>fn(e.detail)); }
  function aoReceber(fn){ eventos.addEventListener('dados', e=>fn(e.detail)); }
  async function pendentes(){
    const cfg = ler();
    return cfg ? DB.contarAlterados(cfg.envioAte) : 0;
  }

  /* ---------- Transporte: Supabase ---------- */
  function classificar(r){
    const d = r.dados || {};
    const msg = (typeof d === 'object' && (d.message || d.msg)) ? String(d.message || d.msg) : '';
    if(r.erro === 'sem-ligacao' || r.erro === 'tempo-esgotado') return {tipo:'offline', mensagem:'Sem ligação ao servidor.'};
    if(r.status === 401 || r.status === 403 || /iniciar sessão/i.test(msg)) return {tipo:'sessao', mensagem:'A sessão terminou. Entra de novo na página Servidor.'};
    if(/Não pertences/i.test(msg)) return {tipo:'permissao', mensagem:'Já não pertences a esta criação no servidor.'};
    if(r.status === 404 || d.code === 'PGRST202') return {tipo:'esquema', mensagem:'Falta executar o ficheiro servidor/03-sincronizacao.sql no Supabase.'};
    if(r.status >= 500) return {tipo:'servidor', mensagem:'O servidor está indisponível neste momento.'};
    return {tipo:'erro', mensagem: msg || `Resposta inesperada do servidor (código ${r.status}).`};
  }
  function transporteSupabase(){
    const chamar = async (rpc, corpo)=>{
      const r = await Servidor.pedido('/rest/v1/rpc/' + rpc, {metodo:'POST', corpo, tempoMs:30000});
      return r.ok ? {ok:true, dados:r.dados} : Object.assign({ok:false}, classificar(r));
    };
    return {
      async enviar(granja, registos){ return chamar('enviar_registos', {p_granja:granja, p_registos:registos}); },
      async receber(granja, ponto, limite){
        const r = await chamar('receber_registos', {p_granja:granja, p_desde:ponto.desde, p_desde_tabela:ponto.tabela, p_desde_id:ponto.id, p_limite:limite});
        return r.ok ? {ok:true, registos:Array.isArray(r.dados) ? r.dados : []} : r;
      },
      async resumo(granja){
        const r = await chamar('resumo_granja', {p_granja:granja});
        return r.ok ? {ok:true, vivos:r.dados.vivos, total:r.dados.total, ultima:r.dados.ultima} : r;
      }
    };
  }
  function obterTransporte(){ return transporte || (transporte = transporteSupabase()); }
  function definirTransporte(t){ transporte = t; transporteInjetado = true; }          // para os testes

  /* O administrador pode mudar o papel de alguém (ou retirá-lo) a qualquer momento. De vez em
     quando a app pergunta ao servidor qual é o papel actual desta conta. */
  async function actualizarPapelDoServidor(cfg){
    if(transporteInjetado || typeof Servidor === 'undefined' || !Servidor.minhasGranjas) return;
    if(cfg.papelVerificadoEm && Date.now() - Date.parse(cfg.papelVerificadoEm) < 5 * 60000) return;
    const r = await Servidor.minhasGranjas();
    if(!r || !r.ok) return;                                    // sem ligação: fica com o que já sabe
    cfg.papelVerificadoEm = agoraIso();
    const g = (r.granjas || []).find(x=>x.id === cfg.granjaId);
    if(!g) throw Object.assign(new Error('Já não pertences a esta criação no servidor. Desliga a sincronização.'), {tipo:'permissao'});
    const guardada = Servidor.lerGranja();
    if(guardada && guardada.id === g.id && guardada.papel !== g.papel) Servidor.guardarGranja({...guardada, papel:g.papel});
    gravar(cfg);
  }

  const erroSync = r => Object.assign(new Error(r.mensagem || 'Falha na sincronização.'), {tipo:r.tipo || 'erro'});

  /* ---------- A sincronização em si ---------- */
  async function executar(){
    const cfg = ler();
    if(!cfg) return {ok:false, tipo:'inactivo', mensagem:'A sincronização não está ligada.'};
    if(typeof navigator !== 'undefined' && navigator.onLine === false){
      definir('offline', 'Sem internet — as alterações ficam guardadas e seguem quando voltar.');
      return {ok:false, tipo:'offline', mensagem:'Sem internet.'};
    }
    if(typeof Servidor !== 'undefined' && !transporteInjetado && !Servidor.lerSessao()){
      definir('sessao', 'A sessão terminou. Entra de novo na página Servidor.');
      return {ok:false, tipo:'sessao', mensagem:'A sessão terminou.'};
    }
    definir('a-sincronizar');
    const t = obterTransporte();
    let enviados = 0, recebidos = 0, aplicados = 0;
    const mudaram = new Set();
    let ultimoDoServidor = null;
    try{
      await actualizarPapelDoServidor(cfg);
      /* Papel: o trabalhador não envia nem recebe finanças. Se o papel mudou desde a última vez,
         recomeça a receber (um trabalhador que passa a administrador passa a ver o que não via)
         e, se deixou de ser administrador, apaga do aparelho o que já não pode ter. */
      const papel = papelActual();
      const restritas = papel === 'trabalhador' ? TABELAS_RESTRITAS : [];
      if(cfg.papelVisto && cfg.papelVisto !== papel){
        cfg.cursor = null;
        if(papel === 'trabalhador') await DB.limparTabelas(TABELAS_RESTRITAS);
      }
      cfg.papelVisto = papel;
      gravar(cfg);
      /* 1) enviar o que mudou aqui */
      for(;;){
        const lote = await DB.lerAlterados(cfg.envioAte, LOTE_ENVIO);
        if(!lote.length) break;
        const aEnviar = lote.filter(x=>!restritas.includes(x.tabela));
        if(aEnviar.length){
          const r = await t.enviar(cfg.granjaId, aEnviar.map(x=>({tabela:x.tabela, id:String(x.id), apagado:x.apagado, dados:x.dados})));
          if(!r.ok) throw erroSync(r);
        }
        cfg.envioAte = lote[lote.length - 1].dados.atualizadoEm;
        gravar(cfg);
        enviados += lote.length;
        if(lote.length < LOTE_ENVIO) break;
      }
      /* 2) receber o que mudou nos outros aparelhos */
      let ponto = cfg.cursor
        ? {desde:new Date(Date.parse(cfg.cursor.ts) - SOBREPOSICAO_MS).toISOString(), tabela:null, id:null}
        : {desde:null, tabela:null, id:null};
      for(;;){
        const r = await t.receber(cfg.granjaId, ponto, LOTE_RECEBER);
        if(!r.ok) throw erroSync(r);
        const regs = r.registos || [];
        if(!regs.length) break;
        recebidos += regs.length;
        const ap = await DB.aplicarRemotos(regs.filter(x=>!restritas.includes(x.tabela)).map(x=>({tabela:x.tabela, id:x.id, dados:x.dados, apagado:x.apagado})));
        aplicados += ap.aplicados; ap.stores.forEach(s=>mudaram.add(s));
        const ultimo = regs[regs.length - 1];
        if(!ultimoDoServidor || Date.parse(ultimo.atualizado_em) > Date.parse(ultimoDoServidor)) ultimoDoServidor = ultimo.atualizado_em;
        ponto = {desde:ultimo.atualizado_em, tabela:ultimo.tabela, id:ultimo.id};
        cfg.cursor = {ts:ultimo.atualizado_em, tabela:ultimo.tabela, id:ultimo.id};
        gravar(cfg);
        if(regs.length < LOTE_RECEBER) break;
      }
      /* Relógio deste aparelho vs relógio do servidor: se acabámos de enviar alguma coisa, o registo
         mais recente que o servidor devolve foi carimbado "agora" pelo servidor. */
      if(enviados > 0 && ultimoDoServidor){
        const desvio = Math.round((Date.now() - Date.parse(ultimoDoServidor)) / 1000);
        if(!isNaN(desvio)) cfg.desvioRelogioS = desvio;
      }
      cfg.ultimaSync = agoraIso();
      gravar(cfg);
      definir('ok', aplicados ? `Recebidas ${aplicados} alteração(ões) de outros aparelhos.` : '');
      if(aplicados) eventos.dispatchEvent(new CustomEvent('dados', {detail:{aplicados, stores:Array.from(mudaram)}}));
      return {ok:true, enviados, recebidos, aplicados};
    }catch(e){
      const tipo = (e && e.tipo) || 'erro';
      if(tipo === 'offline') definir('offline', 'Sem ligação ao servidor — as alterações ficam guardadas e seguem quando houver internet.');
      else if(tipo === 'sessao') definir('sessao', e.message);
      else if(tipo === 'permissao') definir('erro', e.message);
      else { console.error('Falha na sincronização', e); definir('erro', e && e.message ? e.message : 'Falha na sincronização.'); }
      return {ok:false, tipo, mensagem: e && e.message, enviados, recebidos, aplicados};
    }
  }
  /* Uma de cada vez; se pedirem outra enquanto corre, repete no fim (para apanhar o que mudou entretanto). */
  function sincronizar(){
    if(emCurso){ repetir = true; return emCurso; }
    emCurso = executar().finally(()=>{
      emCurso = null;
      if(repetir){ repetir = false; agendar(300); }
    });
    return emCurso;
  }
  function agendar(ms){
    clearTimeout(timerEspera);
    timerEspera = setTimeout(()=>{ if(ler()) sincronizar(); }, ms);
  }

  /* ---------- Ligar / desligar ---------- */
  /* O que há aqui e no servidor, para a pessoa decidir como começar. */
  async function resumoParaLigar(granjaId){
    let local = 0;
    for(const nome of DB.tabelas) local += (await DB.getAll(nome)).length;
    const r = await obterTransporte().resumo(granjaId);
    return {local, servidor: r.ok ? {vivos:r.vivos, total:r.total, ultima:r.ultima} : null, erro: r.ok ? null : r.mensagem};
  }
  /* modo: 'enviar' (o servidor está vazio), 'receber' (este aparelho está vazio), 'juntar'
     (os dois têm dados: fica tudo) ou 'substituir' (apaga os dados daqui e fica com os do servidor). */
  async function ligar(granja, modo){
    if(!granja || !granja.id) return {ok:false, mensagem:'Escolhe primeiro a criação.'};
    if(!['enviar', 'receber', 'juntar', 'substituir'].includes(modo)) return {ok:false, mensagem:'Escolha inválida.'};
    const actual = ler();
    if(actual && actual.granjaId !== granja.id){
      return {ok:false, mensagem:`Este aparelho já sincroniza com "${actual.granjaNome}". Desliga primeiro a sincronização.`};
    }
    if(modo === 'substituir') await DB.limparTudoLocal();
    gravar({granjaId:granja.id, granjaNome:granja.nome || '', modo,
            envioAte: modo === 'substituir' ? DB.novoCarimbo() : '', cursor:null, ultimaSync:null, ligadoEm:agoraIso()});
    const r = await sincronizar();
    return Object.assign({ok:r.ok !== false || r.tipo === 'offline'}, r);
  }
  function desligar(){
    try{ localStorage.removeItem(CHAVE); }catch(e){}
    clearTimeout(timerEspera);
    definir('inactivo');
  }

  /* ---------- Automático ---------- */
  function iniciarAutomatico(){
    if(automaticoLigado) return;
    automaticoLigado = true;
    if(typeof window !== 'undefined'){
      window.addEventListener('online', ()=>agendar(500));
      window.addEventListener('offline', ()=>{ if(ler()) definir('offline', 'Sem internet — as alterações ficam guardadas e seguem quando voltar.'); });
    }
    if(typeof document !== 'undefined'){
      document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'visible') agendar(500); });
    }
    /* Alterações feitas aqui → enviar poucos segundos depois (as que vieram do servidor ou de
       outra janela não disparam nada). */
    DB.Bus.addEventListener('dataChanged', e=>{
      const d = e.detail || {};
      if(d.sync || d.remota) return;
      if(ler()) agendar(ESPERA_APOS_ALTERAR_MS);
    });
    setInterval(()=>{
      if(ler() && (typeof document === 'undefined' || document.visibilityState === 'visible')) sincronizar();
    }, INTERVALO_MS);
    if(ler()) agendar(800);
  }

  return {
    configuracao: ler, estado: estadoActual, aoMudar, aoReceber, pendentes,
    sincronizar, ligar, desligar, resumoParaLigar, iniciarAutomatico,
    definirTransporte, definirPapel, transporteSupabase
  };
})();
if(typeof module !== 'undefined' && module.exports) module.exports = Sync;
