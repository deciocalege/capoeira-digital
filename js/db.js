/* @revisao 2.18.0 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).db = '2.18.0';
/* ============================================================
   BANCO DE DADOS (IndexedDB) — 100% offline, sem servidor.
   Cada tipo de dado vive na sua própria "tabela" (object store).

   Tudo aqui dentro vive fechado numa IIFE — só o objecto `DB` (e a
   classe `DB.ErroBD`) ficam visíveis para o resto da app. Antes,
   `abrirBD`, `dbAdd`, `dbGet`, `reqToPromise`, `notificarMudanca`,
   etc. eram ~15 nomes soltos no `window`; agora é só UM nome (`DB`),
   com tudo o resto arrumado lá dentro — ver "core/db" na reorganização
   pedida. Continua a ser um <script> normal (sem import/export), para
   a app continuar a abrir directamente como ficheiro no telemóvel.
   ============================================================ */
const DB = (function(){
  const DB_NAME = 'capoeiraDB';
  const DB_VERSION = 9;
  let db;

  /* ============ VERSÃO 9: IDs UUID + criadoEm / atualizadoEm / apagado ============
     Até à versão 8 cada registo tinha um id numérico automático (1, 2, 3…).
     Dois aparelhos a criar registos ao mesmo tempo davam o mesmo número e
     colidiam. Agora:
       • id            — UUID (texto único em qualquer aparelho);
       • criadoEm      — quando o registo nasceu (ISO 8601);
       • atualizadoEm  — a última alteração: com dois aparelhos a editar o
                         mesmo registo, o mais recente prevalece;
       • apagado       — apagar MARCA o registo (apagado:true) em vez de o
                         remover, para o outro aparelho saber que foi apagado.
     Tudo isto é automático: DB.add / DB.put / DB.del e as transacções
     (DB.transacao) preenchem e respeitam estes campos, e getAll / get /
     getByIndex nunca devolvem registos apagados. As páginas não mudam. */
  const ESQUEMA = [
    {nome:'compartimentos',    indices:[]},
    {nome:'aves',              indices:['compartimentoId']},
    {nome:'feedStock',         indices:[]},
    {nome:'consumo',           indices:['item']},
    {nome:'transacoes',        indices:['categoria','tipo']},
    {nome:'ovosLog',           indices:[]},
    {nome:'incubacao',         indices:[]},
    {nome:'revenda',           indices:[]},
    {nome:'revendaMov',        indices:[]},
    {nome:'vendas',            indices:[]},
    {nome:'saude',             indices:[]},
    {nome:'pesagens',          indices:[]},
    {nome:'planosAlimentares', indices:[]},
    {nome:'misturas',          indices:[]},
    {nome:'saidasAves',        indices:['compartimentoId']}
  ];

  /* Que campo de que tabela aponta para que outra — é o que a migração tem
     de converter de número para UUID. [campo, tabela de destino, é lista?] */
  const REFERENCIAS = {
    aves:       [['compartimentoId','compartimentos']],
    saidasAves: [['compartimentoId','compartimentos']],
    consumo:    [['feedStockId','feedStock'], ['loteId','aves'], ['vendaId','vendas']],
    transacoes: [['feedStockId','feedStock'], ['vendaId','vendas'], ['revendaMovId','revendaMov'], ['saudeId','saude']],
    vendas:     [['revendaId','revenda'], ['feedStockId','feedStock']],
    revendaMov: [['produtoId','revenda'], ['vendaId','vendas']],
    saude:      [['loteId','aves']],
    pesagens:   [['loteId','aves']],
    ovosLog:    [['aveId','aves']],
    incubacao:  [['destinoCompartimentoId','compartimentos'], ['aveIds','aves',true]]
  };

  /* Carimbos sempre crescentes: dois carimbos seguidos nunca são iguais (mesmo no mesmo
     milissegundo). A sincronização envia "tudo o que tem atualizadoEm depois do último
     enviado"; com carimbos únicos nenhum registo pode ficar para trás nesse corte. */
  let ultimoCarimbo = 0;
  /* depoisDe: o carimbo anterior do mesmo registo (ou de qualquer registo visto). O novo é sempre
     MAIS RECENTE do que ele, mesmo que o relógio deste aparelho esteja atrasado — assim, quando
     editas um registo, a tua edição ganha sempre à versão que estavas a ver. */
  const agora = (depoisDe)=> {
    let t = Date.now();
    if(t <= ultimoCarimbo) t = ultimoCarimbo + 1;
    if(depoisDe){
      const d = Date.parse(depoisDe);
      if(!isNaN(d) && t <= d) t = d + 1;
    }
    ultimoCarimbo = t;
    return new Date(t).toISOString();
  };

  function novoUUID(){
    if(typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const b = new Uint8Array(16);
    if(typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
    else for(let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x=>x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  const ehIdTexto = id => typeof id === 'string' && !/^\d+$/.test(id);

  /* Converte dados com ids numéricos (base versão 8 ou backup versão 2) em
     dados com UUID, mantendo todas as ligações entre tabelas. É uma função
     "pura" (sem base de dados), por isso serve a migração, a importação de
     backups antigos e os testes. Ids que já são UUID não mudam, por isso é
     seguro correr mais do que uma vez. Uma ligação para um registo que já
     não existe fica a null. */
  function converterColecoes(colecoes){
    const nomes = ESQUEMA.map(e=>e.nome);
    const total = nomes.reduce((n, k)=>n + ((colecoes[k] || []).filter(Boolean).length), 0);
    let t = Date.now() - total;            // criadoEm sequencial, todos anteriores a "agora"
    const mapa = {};
    nomes.forEach(n=>{
      mapa[n] = {};
      (colecoes[n] || []).forEach(r=>{
        if(r && r.id != null) mapa[n][String(r.id)] = ehIdTexto(r.id) ? r.id : novoUUID();
      });
    });
    const resolver = (alvo, v)=> {
      if(v == null || v === '') return v;
      const novo = mapa[alvo] && mapa[alvo][String(v)];
      return novo === undefined ? null : novo;
    };
    const ordem = (a, b)=> {
      const na = Number(a.id), nb = Number(b.id);
      return (!isNaN(na) && !isNaN(nb)) ? na - nb : String(a.criadoEm || '').localeCompare(String(b.criadoEm || ''));
    };
    const saida = {};
    nomes.forEach(n=>{
      saida[n] = (colecoes[n] || []).filter(Boolean).slice().sort(ordem).map(r=>{
        const novo = {...r};
        novo.id = r.id == null ? novoUUID() : mapa[n][String(r.id)];
        (REFERENCIAS[n] || []).forEach(([campo, alvo, lista])=>{
          if(!(campo in novo)) return;
          novo[campo] = lista
            ? (Array.isArray(novo[campo]) ? novo[campo].map(v=>resolver(alvo, v)).filter(v=>v != null) : novo[campo])
            : resolver(alvo, novo[campo]);
        });
        const ts = new Date(t++).toISOString();
        if(!novo.criadoEm) novo.criadoEm = ts;
        if(!novo.atualizadoEm) novo.atualizadoEm = novo.criadoEm;
        if(novo.apagado === undefined) novo.apagado = false;
        return novo;
      });
    });
    return {colecoes: saida, mapa};
  }

  /* Backup antigo (versão 2, ids numéricos) → versão 3 (UUID). Só mexe nas
     tabelas que o ficheiro traz. Backups já na versão 3 ficam como estão. */
  function converterBackup(dados){
    if(!dados || Number(dados.versaoBackup) >= 3) return dados;
    const colecoes = {};
    ESQUEMA.forEach(e=>{
      const v = dados[e.nome];
      if(Array.isArray(v)) colecoes[e.nome] = v;
      else if(e.nome === 'incubacao' && v && typeof v === 'object' && Object.keys(v).length) colecoes[e.nome] = [v];
    });
    const {colecoes: nova} = converterColecoes(colecoes);
    const resultado = {...dados, versaoBackup: 3};
    Object.keys(colecoes).forEach(n=>{ resultado[n] = nova[n]; });
    return resultado;
  }

  /* Estado da migração desta abertura (usado pelo aviso ao utilizador). */
  const migracao = {feita:false, de:0, copiaDescarregada:false, copiaInterna:false, nomeCopia:'', erro:null};

  /* Barramento de eventos: qualquer alteração aos dados (adicionar, editar,
     apagar aves, registar saída, etc.) emite 'dataChanged'. Isto é o que
     garante que o Início e a faixa de estatísticas se mantêm SEMPRE
     coordenados com o que é feito em Gestão, mesmo sem mudar de separador.
     IMPORTANTE: um EventTarget sozinho só funciona DENTRO da mesma aba —
     se tiveres duas abas abertas ao mesmo tempo (ex: Gestão numa, Finanças
     noutra), uma não sabe da outra por este meio. */
  const Bus = new EventTarget();

  /* ============ SINCRONIZAÇÃO ENTRE ABAS (BroadcastChannel) ============
     Resolve a limitação acima: sempre que há uma alteração aqui, avisa-se
     também as OUTRAS abas/janelas abertas na mesma origem, que disparam o
     mesmo evento 'dataChanged' no seu próprio Bus — assim a faixa de
     estatísticas (e qualquer outro código já preparado para ouvir o Bus)
     reage da mesma forma, quer a alteração tenha vindo desta aba, quer de
     outra. Por definição do próprio BroadcastChannel, uma aba NUNCA recebe
     as suas próprias mensagens, por isso não há risco de notificar a dobrar
     na aba onde a alteração realmente aconteceu. */
  const canalSync = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('capoeiraDB') : null;
  if(canalSync){
    canalSync.onmessage = (e)=>{
      if(e.data && e.data.type==='dataChanged'){
        Bus.dispatchEvent(new CustomEvent('dataChanged', {detail:{store:e.data.store, remota:true, sync:!!e.data.sync}}));
      }
    };
  }

  /* origem: {sync:true} quando a alteração veio da sincronização com o servidor (e não de
     alguém a mexer na app) — assim a sincronização não se dispara a si própria. */
  function notificarMudanca(store, origem){
    const sync = !!(origem && origem.sync);
    Bus.dispatchEvent(new CustomEvent('dataChanged', {detail:{store, sync}}));
    if(canalSync){
      try{ canalSync.postMessage({type:'dataChanged', store, sync}); }
      catch(e){ console.warn('Não foi possível avisar outras abas (canal pode ter sido fechado):', e); }
    }
  }

  /* Erro amigável, usado sempre que uma operação na base de dados falha, para
     que o utilizador veja sempre uma mensagem compreensível em vez de a app
     ficar "presa" em silêncio (ex: "A carregar…" para sempre). Exposto como
     DB.ErroBD porque o resto da app precisa de o reconhecer/lançar (ex: em
     Gestão, ao validar uma saída dentro de uma transacção atómica). */
  class ErroBD extends Error{
    constructor(msg, causa){ super(msg); this.name='ErroBD'; this.causa=causa; }
  }

  /* ============ CÓPIA DE SEGURANÇA ANTES DE MIGRAR ============
     Antes de mexer numa base antiga (versão 1 a 8) a app guarda tudo o que
     lá está: (1) descarrega um ficheiro .json e (2) deixa uma cópia numa
     base separada ("capoeiraDB-copias"), para o caso de o download falhar
     ou o ficheiro se perder. O ficheiro é um backup versão 2 normal, que a
     importação do Início sabe repor. */
  function sondarVersao(){
    return new Promise(resolve=>{
      let req;
      try{ req = indexedDB.open(DB_NAME); }catch(e){ resolve({versao:0}); return; }
      req.onupgradeneeded = (e)=>{
        // A base não existe ainda: não a criar agora (a abertura a sério trata disso).
        if(e.oldVersion === 0){ try{ e.target.transaction.abort(); }catch(_){} }
      };
      req.onsuccess = ()=> resolve({versao:req.result.version, conexao:req.result});
      req.onerror = ()=> resolve({versao:0});
      req.onblocked = ()=> resolve({versao:0});
    });
  }
  async function lerTodasAsTabelas(conexao){
    const nomes = Array.from(conexao.objectStoreNames);
    const saida = {};
    if(!nomes.length) return saida;
    const tx = conexao.transaction(nomes, 'readonly');
    await Promise.all(nomes.map(async n=>{ saida[n] = await reqToPromise(tx.objectStore(n).getAll()); }));
    return saida;
  }
  function guardarCopiaInterna(backup){
    return new Promise((resolve, reject)=>{
      let req;
      try{ req = indexedDB.open('capoeiraDB-copias', 1); }catch(e){ reject(e); return; }
      req.onupgradeneeded = ()=>{ req.result.createObjectStore('copias', {keyPath:'chave'}); };
      req.onerror = ()=> reject(req.error);
      req.onsuccess = ()=>{
        const c = req.result;
        const tx = c.transaction('copias', 'readwrite');
        tx.objectStore('copias').put({chave:'antes-da-v9', criadoEm:agora(), dados:backup});
        tx.oncomplete = ()=>{ c.close(); resolve(true); };
        tx.onerror = tx.onabort = ()=>{ c.close(); reject(tx.error); };
      };
    });
  }
  function descarregarJSON(nome, objeto){
    try{
      if(typeof document === 'undefined' || typeof Blob === 'undefined') return false;
      const blob = new Blob([JSON.stringify(objeto)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 4000);
      return true;
    }catch(e){ console.warn('Não foi possível descarregar a cópia de segurança', e); return false; }
  }
  async function copiaAntesDeMigrar(){
    const sonda = await sondarVersao();
    if(!sonda.conexao) return;
    const conexao = sonda.conexao;
    try{
      if(sonda.versao < 1 || sonda.versao >= DB_VERSION) return;
      const tudo = await lerTodasAsTabelas(conexao);
      const total = Object.values(tudo).reduce((n, l)=>n + (l ? l.length : 0), 0);
      if(total === 0) return;                       // nada a proteger
      const backup = {versaoBackup:2, geradoEm:agora(), origem:`cópia automática antes de actualizar a base de dados (versão ${sonda.versao} → ${DB_VERSION})`, ...tudo};
      migracao.nomeCopia = `capoeira-backup-antes-da-v9-${agora().slice(0,10)}.json`;
      try{ migracao.copiaInterna = await guardarCopiaInterna(backup); }catch(e){ console.warn('Cópia interna falhou', e); }
      migracao.copiaDescarregada = descarregarJSON(migracao.nomeCopia, backup);
      if(!migracao.copiaInterna && !migracao.copiaDescarregada){
        migracao.erro = 'Não foi possível criar a cópia de segurança antes de actualizar.';
      }
    } finally {
      conexao.close();
    }
  }

  function criarEsquema(d){
    ESQUEMA.forEach(e=>{
      if(d.objectStoreNames.contains(e.nome)) return;
      const st = d.createObjectStore(e.nome, {keyPath:'id'});          // ids UUID: sem autoIncrement
      e.indices.forEach(i=>st.createIndex(i, i, {unique:false}));
      st.createIndex('atualizadoEm', 'atualizadoEm', {unique:false});   // para a sincronização ("o que mudou desde…")
    });
  }

  /* Dentro da própria actualização da base (uma transacção "versionchange"):
     lê tudo, converte, apaga as tabelas antigas e cria as novas já com os
     dados convertidos. É tudo ou nada — se alguma coisa falhar, a transacção
     é abortada e a base fica como estava (versão 8). */
  function migrarParaUUID(d, tx, falha){
    const existentes = ESQUEMA.map(e=>e.nome).filter(n=>d.objectStoreNames.contains(n));
    if(!existentes.length){ criarEsquema(d); return; }
    const colecoes = {};
    let pendentes = existentes.length;
    const abortar = (erro)=>{ falha.erro = erro; try{ tx.abort(); }catch(_){} };
    const concluir = ()=>{
      try{
        const {colecoes: novas} = converterColecoes(colecoes);
        existentes.forEach(n=>d.deleteObjectStore(n));
        criarEsquema(d);
        Object.keys(novas).forEach(n=>{
          const st = tx.objectStore(n);
          novas[n].forEach(r=>st.put(r));
        });
      }catch(e){ abortar(e); }
    };
    existentes.forEach(n=>{
      const rq = tx.objectStore(n).getAll();
      rq.onsuccess = ()=>{ colecoes[n] = rq.result; if(--pendentes === 0) concluir(); };
      rq.onerror = ()=> abortar(rq.error);
    });
  }

  async function abrirBD(){
    if(!('indexedDB' in window)){
      throw new ErroBD('Este navegador não suporta armazenamento local (IndexedDB). Experimenta um navegador mais recente (Chrome, Firefox, Edge, Safari actualizado).');
    }
    await copiaAntesDeMigrar();
    return new Promise((resolve, reject)=>{
      let req;
      const falha = {erro:null};
      try{
        req = indexedDB.open(DB_NAME, DB_VERSION);
      }catch(e){
        reject(new ErroBD('Não foi possível abrir o armazenamento local do navegador.', e));
        return;
      }
      req.onupgradeneeded = (e)=>{
        const d = e.target.result;
        if(e.oldVersion === 0){ criarEsquema(d); return; }          // instalação nova
        if(e.oldVersion < 9){
          migracao.feita = true; migracao.de = e.oldVersion;
          migrarParaUUID(d, e.target.transaction, falha);
        }
      };
      /* onblocked: acontece quando há outro separador/aba aberto com uma
         versão antiga da app a bloquear a actualização da estrutura da BD.
         Sem isto, a app ficava simplesmente "pendurada" sem explicação. */
      req.onblocked = ()=>{
        reject(new ErroBD('A base de dados está bloqueada por outra janela ou separador desta app já aberto. Fecha as outras janelas da Capoeira Digital e recarrega esta página.'));
      };
      req.onsuccess = ()=>{
        db = req.result;
        /* Se a BD for fechada inesperadamente (ex: limite de armazenamento
           do navegador atingido), avisa em vez de deixar a app "morta". */
        db.onversionchange = ()=>{ db.close(); };
        resolve(db);
      };
      req.onerror = ()=>{
        if(falha.erro){
          migracao.feita = false;
          reject(new ErroBD('A actualização dos dados para a nova versão falhou e NADA foi alterado. A cópia de segurança foi guardada. Detalhe: ' + ((falha.erro && falha.erro.message) || falha.erro), falha.erro));
        } else {
          reject(new ErroBD('Não foi possível abrir a base de dados local. Os dados podem não ficar guardados.', req.error));
        }
      };
    });
  }

  function reqToPromise(req){
    return new Promise((resolve,reject)=>{
      req.onsuccess = ()=>resolve(req.result);
      req.onerror = ()=>reject(req.error);
    });
  }
  /* Leituras: nunca devolvem registos apagados (apagado:true). */
  const vivos = lista => (lista || []).filter(r=>r && !r.apagado);
  async function getAll(store){
    try{
      return vivos(await reqToPromise(db.transaction(store,'readonly').objectStore(store).getAll()));
    }catch(e){
      console.error(`Falha a ler "${store}"`, e);
      toastErro(`Não foi possível ler os dados de "${store}".`);
      return [];
    }
  }
  async function getByIndex(store, indexName, valor){
    try{
      return vivos(await reqToPromise(db.transaction(store,'readonly').objectStore(store).index(indexName).getAll(valor)));
    }catch(e){
      console.error(`Falha a ler índice de "${store}"`, e);
      toastErro(`Não foi possível ler os dados de "${store}".`);
      return [];
    }
  }
  async function dbGet(store, chave){
    try{
      const r = await reqToPromise(db.transaction(store,'readonly').objectStore(store).get(chave));
      return (r && r.apagado) ? undefined : r;
    }catch(e){
      console.error(`Falha a obter registo de "${store}"`, e);
      toastErro(`Não foi possível obter o registo de "${store}".`);
      return undefined;
    }
  }

  /* Mensagem de erro específica e legível consoante o motivo da falha —
     em particular distingue "sem espaço" (quota) de outras falhas, porque
     a solução para o utilizador é diferente em cada caso. */
  function mensagemErroEscrita(store, e){
    const nome = (e && (e.name||'')) || '';
    if(nome==='QuotaExceededError'){
      return `⚠️ Sem espaço de armazenamento disponível no navegador. Exporta um backup, liberta espaço (ex: apaga backups antigos do telemóvel) e tenta novamente.`;
    }
    if(nome==='ConstraintError'){
      return `⚠️ Não foi possível guardar em "${store}" — registo em conflito.`;
    }
    return `⚠️ Não foi possível guardar em "${store}". A alteração pode não ter sido gravada.`;
  }
  /* toastErro tem uma verificação de segurança porque Util.toast só existe
     depois de calc.js carregar; isto evita um erro caso uma falha na BD
     aconteça mesmo no arranque da app. */
  function toastErro(msg){
    if(typeof Util!=='undefined' && Util && typeof Util.toast==='function') Util.toast(msg);
    else console.error(msg);
  }

  /* Carimbos automáticos: id (UUID), criadoEm, atualizadoEm, apagado. */
  function carimbar(valor, manterAtualizacao){
    const r = {...valor};
    const t = manterAtualizacao ? agora() : agora(valor.atualizadoEm);
    if(r.id == null || r.id === '') r.id = novoUUID();
    if(!r.criadoEm) r.criadoEm = t;
    if(!(manterAtualizacao && r.atualizadoEm)) r.atualizadoEm = t;
    if(r.apagado === undefined) r.apagado = false;
    return r;
  }

  /* As operações de escrita notificam sempre o Bus — é isto que resolve a falta
     de "atualização direta": qualquer alteração em qualquer separador acende
     de imediato a faixa de estatísticas e, se estiveres no Início, o próprio
     painel de resumo. Cada uma está protegida com try/catch: se a escrita
     falhar (ex: armazenamento cheio), o utilizador é avisado em vez de a
     alteração desaparecer silenciosamente. */
  async function dbPut(store, valor){
    try{
      const r = await reqToPromise(db.transaction(store,'readwrite').objectStore(store).put(carimbar(valor)));
      notificarMudanca(store);
      return r;
    }catch(e){
      console.error(`Falha ao gravar em "${store}"`, e);
      toastErro(mensagemErroEscrita(store, e));
      throw new ErroBD(mensagemErroEscrita(store, e), e);
    }
  }
  async function dbAdd(store, valor){
    try{
      const r = await reqToPromise(db.transaction(store,'readwrite').objectStore(store).add(carimbar(valor)));
      notificarMudanca(store);
      return r;
    }catch(e){
      console.error(`Falha ao adicionar em "${store}"`, e);
      toastErro(mensagemErroEscrita(store, e));
      throw new ErroBD(mensagemErroEscrita(store, e), e);
    }
  }
  /* Apagar = marcar como apagado (o registo fica na base para o outro aparelho
     saber). Apagar um registo que não existe, ou que já está apagado, não faz nada. */
  async function dbDel(store, chave){
    try{
      const os = db.transaction(store,'readwrite').objectStore(store);
      await new Promise((resolve, reject)=>{
        const g = os.get(chave);
        g.onerror = ()=>reject(g.error);
        g.onsuccess = ()=>{
          const atual = g.result;
          if(!atual || atual.apagado){ resolve(); return; }
          const p = os.put({...atual, apagado:true, atualizadoEm:agora(atual.atualizadoEm)});
          p.onsuccess = ()=>resolve();
          p.onerror = ()=>reject(p.error);
        };
      });
      notificarMudanca(store);
    }catch(e){
      console.error(`Falha ao apagar de "${store}"`, e);
      toastErro(mensagemErroEscrita(store, e));
      throw new ErroBD(mensagemErroEscrita(store, e), e);
    }
  }
  /* Remove mesmo o registo (sem deixar marca). Só para manutenção. */
  async function dbApagarDefinitivo(store, chave){
    try{
      await reqToPromise(db.transaction(store,'readwrite').objectStore(store).delete(chave));
      notificarMudanca(store);
    }catch(e){
      throw new ErroBD(mensagemErroEscrita(store, e), e);
    }
  }
  async function dbClear(store){
    try{
      const r = await reqToPromise(db.transaction(store,'readwrite').objectStore(store).clear());
      notificarMudanca(store);
      return r;
    }catch(e){
      console.error(`Falha ao limpar "${store}"`, e);
      toastErro(mensagemErroEscrita(store, e));
      throw new ErroBD(mensagemErroEscrita(store, e), e);
    }
  }

  /* ============ TRANSACÇÕES: os mesmos carimbos e a mesma regra de "apagado" ============
     As páginas fazem, dentro de uma transacção, tx.objectStore('x').add(...),
     .put(...), .delete(...), .get(...), .getAll() e .index(...).getAll(...).
     Para não ter de mudar nenhuma delas, a transacção que lhes chega é uma
     "máscara" sobre a verdadeira:
       • add / put  — preenchem id (UUID), criadoEm, atualizadoEm, apagado.
                      add devolve o id gerado (as páginas usam-no para ligar
                      registos: venda → receita, compra → despesa…);
       • delete     — marca como apagado em vez de remover;
       • get / getAll / index().getAll — não devolvem registos apagados;
       • clear      — limpa mesmo; os put que vêm a seguir NA MESMA transacção
                      (é o que faz a importação de um backup) conservam o
                      criadoEm / atualizadoEm que o backup traz. */
  function pedidoDerivado(pedido, transformar){
    const w = {result:undefined, error:null, onsuccess:null, onerror:null};
    pedido.onsuccess = ()=>{
      try{ w.result = transformar ? transformar(pedido.result) : pedido.result; }
      catch(e){ w.error = e; if(w.onerror) w.onerror({target:w}); return; }
      if(w.onsuccess) w.onsuccess({target:w});
    };
    pedido.onerror = ()=>{ w.error = pedido.error; if(w.onerror) w.onerror({target:w}); };
    return w;
  }
  function envolverStore(store, estado){
    const umVivo = r => (r && r.apagado) ? undefined : r;
    const custom = {
      add: v => store.add(carimbar(v, estado.limpo)),
      put: v => store.put(carimbar(v, estado.limpo)),
      get: k => pedidoDerivado(store.get(k), umVivo),
      getAll: (q, n) => pedidoDerivado(store.getAll(q, n), vivos),
      count: q => pedidoDerivado(store.getAll(q), l=>vivos(l).length),
      clear: () => { estado.limpo = true; return store.clear(); },
      delete: k => {
        const w = {result:undefined, error:null, onsuccess:null, onerror:null};
        const ok = ()=>{ if(w.onsuccess) w.onsuccess({target:w}); };
        const falhar = e=>{ w.error = e; if(w.onerror) w.onerror({target:w}); };
        const g = store.get(k);
        g.onerror = ()=>falhar(g.error);
        g.onsuccess = ()=>{
          const atual = g.result;
          if(!atual || atual.apagado){ ok(); return; }
          const p = store.put({...atual, apagado:true, atualizadoEm:agora(atual.atualizadoEm)});
          p.onsuccess = ok;
          p.onerror = ()=>falhar(p.error);
        };
        return w;
      },
      index: nome => {
        const ix = store.index(nome);
        return new Proxy(ix, {get(t, p){
          if(p === 'getAll') return (q, n)=>pedidoDerivado(ix.getAll(q, n), vivos);
          if(p === 'get') return k=>pedidoDerivado(ix.get(k), umVivo);
          if(p === 'count') return q=>pedidoDerivado(ix.getAll(q), l=>vivos(l).length);
          const v = t[p]; return typeof v === 'function' ? v.bind(t) : v;
        }});
      }
    };
    return new Proxy(store, {get(t, p){
      if(Object.prototype.hasOwnProperty.call(custom, p)) return custom[p];
      const v = t[p]; return typeof v === 'function' ? v.bind(t) : v;
    }});
  }
  function envolverTransacao(tx){
    const estados = {};
    return new Proxy(tx, {get(t, p){
      if(p === 'objectStore') return nome=>envolverStore(t.objectStore(nome), (estados[nome] = estados[nome] || {limpo:false}));
      const v = t[p]; return typeof v === 'function' ? v.bind(t) : v;
    }});
  }

  /* ============ TRANSAÇÕES ATÓMICAS (várias tabelas, tudo ou nada) ============
     Usada sempre que uma operação mexe em mais do que uma "tabela" ao
     mesmo tempo (ex: registar uma venda = actualizar o plantel + criar
     uma saída + criar uma receita). `stores` é a lista de tabelas
     envolvidas. `operacoes(tx)` é uma função (pode ser async) que
     recebe a transação e faz lá dentro os get/put/add/delete
     necessários, usando DB.reqToPromise para cada um. Se essa função
     lançar um erro, a transação é abortada e o IndexedDB desfaz
     sozinho tudo o que já tinha sido escrito nela. */
  async function executarTransacaoAtomica(stores, operacoes){
    let tx;
    try{
      tx = db.transaction(stores, 'readwrite');
    }catch(e){
      const msg = '⚠️ Não foi possível iniciar a operação — nada foi alterado.';
      toastErro(msg);
      throw new ErroBD(msg, e);
    }
    let resultado, falhouDentro = false, erroInterno = null;
    const espera = new Promise((resolve, reject)=>{
      tx.oncomplete = ()=> resolve(resultado);
      tx.onerror = ()=>{ if(!falhouDentro) reject(tx.error); };
      /* O erro que fez a transacção abortar é o que interessa ao utilizador (ex.: "Só há 2 machos disponíveis"), não o aborto em si. */
      tx.onabort = ()=> reject(erroInterno || tx.error || new ErroBD('Operação cancelada — nenhuma alteração foi gravada.'));
    });
    (async ()=>{
      try{
        resultado = await operacoes(envolverTransacao(tx));
      }catch(err){
        falhouDentro = true;
        erroInterno = err;
        console.error(`Passo da transação [${stores.join(', ')}] falhou — a cancelar tudo`, err);
        try{ tx.abort(); }catch(_){/* já pode estar a abortar sozinha */}
      }
    })();
    try{
      const r = await espera;
      stores.forEach(s=>notificarMudanca(s));
      return r;
    }catch(e){
      let msg;
      if(e instanceof ErroBD){
        msg = `⚠️ ${e.message}`;                 // mensagem pensada para o utilizador
      } else {
        /* Erro técnico inesperado: diz-se qual foi, para não ficar "às escuras". Um DataError costuma
           querer dizer que há ficheiros da app de versões diferentes (um antigo que não entende os
           identificadores novos). */
        const causa = e && (e.name || e.message) ? ` [${[e.name, e.message].filter(Boolean).join(': ').slice(0, 140)}]` : '';
        const dica = (e && e.name === 'DataError') ? ' Se acabaste de actualizar a app, recarrega a página (Ctrl+F5) para carregar todos os ficheiros novos.' : '';
        msg = `⚠️ A operação foi cancelada e NENHUMA alteração foi gravada (falha em: ${stores.join(', ')}).${dica}${causa}`;
      }
      toastErro(msg);
      throw new ErroBD(msg, e);
    }
  }

  /* ============ PARA A SINCRONIZAÇÃO (js/sync.js) ============ */

  /* Registos (mesmo apagados) alterados DEPOIS de `desde` (um atualizadoEm; vazio = todos),
     do mais antigo para o mais recente, no máximo `max`. */
  async function lerAlterados(desde, max){
    const nomes = ESQUEMA.map(e=>e.nome);
    const tx = db.transaction(nomes, 'readonly');
    const out = [];
    await Promise.all(nomes.map(async nome=>{
      const idx = tx.objectStore(nome).index('atualizadoEm');
      const faixa = desde ? IDBKeyRange.lowerBound(desde, true) : undefined;
      const lista = await reqToPromise(max ? idx.getAll(faixa, max) : idx.getAll(faixa));
      lista.forEach(r=>out.push({tabela:nome, id:r.id, apagado:!!r.apagado, dados:r}));
    }));
    out.sort((a, b)=>String(a.dados.atualizadoEm).localeCompare(String(b.dados.atualizadoEm))
      || a.tabela.localeCompare(b.tabela) || String(a.id).localeCompare(String(b.id)));
    return max ? out.slice(0, max) : out;
  }
  /* Quantos registos estão à espera de ser enviados. */
  async function contarAlterados(desde){
    const nomes = ESQUEMA.map(e=>e.nome);
    const tx = db.transaction(nomes, 'readonly');
    const faixa = desde ? IDBKeyRange.lowerBound(desde, true) : undefined;
    const contagens = await Promise.all(nomes.map(nome=>reqToPromise(tx.objectStore(nome).index('atualizadoEm').count(faixa))));
    return contagens.reduce((a, b)=>a + b, 0);
  }

  /* Aplica registos vindos do servidor: um registo só substitui o local se for MAIS RECENTE
     (atualizadoEm). Guarda-os tal como chegaram (sem lhes mudar o atualizadoEm) e avisa a app
     de que os dados mudaram, marcando a origem como "sync". Tudo numa só transacção. */
  async function aplicarRemotos(lista){
    const nomesValidos = ESQUEMA.map(e=>e.nome);
    const validos = (lista || []).filter(r=>r && nomesValidos.includes(r.tabela) && r.dados && r.id != null);
    if(!validos.length) return {aplicados:0, ignorados:0, stores:[]};
    const nomes = Array.from(new Set(validos.map(r=>r.tabela)));
    const tx = db.transaction(nomes, 'readwrite');
    let aplicados = 0, ignorados = 0;
    const mudou = new Set();
    const concluida = new Promise((resolve, reject)=>{
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = ()=>reject(tx.error || new Error('Transacção abortada ao aplicar dados do servidor.'));
    });
    await Promise.all(validos.map(async r=>{
      const st = tx.objectStore(r.tabela);
      const chave = r.id;
      const atual = await reqToPromise(st.get(chave));
      const novoTs = String(r.dados.atualizadoEm || ''), velhoTs = atual ? String(atual.atualizadoEm || '') : '';
      if(atual && velhoTs >= novoTs){ ignorados++; return; }
      await reqToPromise(st.put({...r.dados, id:chave, apagado:!!r.apagado, criadoEm: r.dados.criadoEm || (atual && atual.criadoEm) || novoTs}));
      aplicados++; mudou.add(r.tabela);
    }));
    await concluida;
    /* Daqui para a frente, qualquer alteração feita neste aparelho tem de ser mais recente do que
       tudo o que acabou de chegar (senão uma edição minha podia perder contra um registo que vi). */
    validos.forEach(r=>{
      const d = Date.parse(r.dados.atualizadoEm);
      if(!isNaN(d) && d > ultimoCarimbo && d < Date.now() + 10 * 60000) ultimoCarimbo = d;
    });
    mudou.forEach(n=>notificarMudanca(n, {sync:true}));
    return {aplicados, ignorados, stores:Array.from(mudou)};
  }

  /* Apaga TUDO neste aparelho, de vez (sem marcas). Só para "substituir pelos dados do servidor". */
  async function limparTudoLocal(){
    const nomes = ESQUEMA.map(e=>e.nome);
    const tx = db.transaction(nomes, 'readwrite');
    await Promise.all(nomes.map(n=>reqToPromise(tx.objectStore(n).clear())));
    nomes.forEach(n=>notificarMudanca(n, {sync:true}));
  }

  /* Apaga de vez (sem marcas) só as tabelas indicadas. Usado quando um aparelho deixa de ter
     acesso a certas tabelas (um administrador que passa a trabalhador não guarda finanças). */
  async function limparTabelas(nomes){
    const validos = (nomes || []).filter(n=>ESQUEMA.some(e=>e.nome === n));
    if(!validos.length) return;
    const tx = db.transaction(validos, 'readwrite');
    await Promise.all(validos.map(n=>reqToPromise(tx.objectStore(n).clear())));
    validos.forEach(n=>notificarMudanca(n, {sync:true}));
  }

  /* ============ DADOS INICIAIS (só na primeira utilização) ============ */
  function dataMenosDias(dias){
    const d = new Date();
    d.setDate(d.getDate()-dias);
    return Util.dataISO(d);
  }

  async function semearDadosIniciais(){
    const hoje = new Date();
    const menos1mes = new Date(hoje); menos1mes.setDate(menos1mes.getDate()-28);
    const compraFeed = Util.hoje();

    const compartimentosIniciais = [
      { nome:"Compartimento 1", desc:"Recria — patinhos e frangos", aves:[
        {especie:"Pato Pequim (marreco)", qtd:5, machos:4, femeas:1, dataEntrada:dataMenosDias(37), finalidade:"Corte/Reprodução futura"},
        {especie:"Galinha de corte", qtd:4, machos:0, femeas:0, dataEntrada:dataMenosDias(23), finalidade:"Abate"}
      ]},
      { nome:"Compartimento 2", desc:"Machos mistos", aves:[
        {especie:"Galo misto (Boschveld × Cafrial caipira)", qtd:2, machos:2, femeas:0, dataEntrada:dataMenosDias(250), finalidade:"Reprodução/Corte"}
      ]},
      { nome:"Compartimento 3", desc:"Reprodutores de raças", aves:[
        {especie:"Galinha Boschveld", qtd:1, machos:0, femeas:1, dataEntrada:dataMenosDias(300), finalidade:"Reprodução"},
        {especie:"Brahma", qtd:3, machos:1, femeas:1, dataEntrada:dataMenosDias(280), finalidade:"Reprodução (1 sem sexo definido)"},
        {especie:"Koekoek (casal)", qtd:2, machos:1, femeas:1, dataEntrada:dataMenosDias(260), finalidade:"Reprodução"},
        {especie:"Caipira (casal)", qtd:2, machos:1, femeas:1, dataEntrada:dataMenosDias(77), finalidade:"Reprodução"}
      ]},
      { nome:"Compartimento 4", desc:"Patos Muscovy — núcleo 1", aves:[
        {especie:"Pato Muscovy reprodutor Nº1", qtd:1, machos:1, femeas:0, dataEntrada:dataMenosDias(400), finalidade:"Reprodução"},
        {especie:"Pata Muscovy em postura", qtd:2, machos:0, femeas:2, dataEntrada:dataMenosDias(380), finalidade:"Postura/Reprodução"},
        {especie:"Pata Muscovy chocando", qtd:1, machos:0, femeas:1, dataEntrada:dataMenosDias(350), finalidade:"Choco de 13 ovos"}
      ]},
      { nome:"Compartimento 5", desc:"Patos Muscovy — núcleo 2", aves:[
        {especie:"Pato Muscovy reprodutor Nº2 (jovem)", qtd:1, machos:1, femeas:0, dataEntrada:dataMenosDias(90), finalidade:"Reprodução"},
        {especie:"Pata Muscovy em postura", qtd:1, machos:0, femeas:1, dataEntrada:dataMenosDias(300), finalidade:"Postura"},
        {especie:"Pata Muscovy meia-idade", qtd:1, machos:0, femeas:1, dataEntrada:dataMenosDias(500), finalidade:"Postura/Reserva"},
        {especie:"Patas Muscovy (irmãs do jovem / filhas do Nº1)", qtd:2, machos:0, femeas:2, dataEntrada:dataMenosDias(120), finalidade:"Futuras reprodutoras"}
      ]}
    ];

    let compartimento4Nome = "Compartimento 4";
    for(const c of compartimentosIniciais){
      const aves = c.aves;
      delete c.aves;
      const id = await dbAdd('compartimentos', c);
      for(const a of aves){
        await dbAdd('aves', {...a, compartimentoId:id});
      }
    }

    await dbAdd('feedStock', {nome:"Farelo de trigo", kgComprado:25, custoTotal:650, dataCompra:compraFeed});
    await dbAdd('feedStock', {nome:"Milho partido", kgComprado:50, custoTotal:1350, dataCompra:compraFeed});
    await dbAdd('feedStock', {nome:"Soja", kgComprado:5, custoTotal:250, dataCompra:compraFeed});

    await dbAdd('transacoes', {tipo:"despesa", categoria:"Alimentação", desc:"Farelo de trigo 25kg", valor:650, data:compraFeed});
    await dbAdd('transacoes', {tipo:"despesa", categoria:"Alimentação", desc:"Milho partido 50kg", valor:1350, data:compraFeed});
    await dbAdd('transacoes', {tipo:"despesa", categoria:"Alimentação", desc:"Soja 5kg", valor:250, data:compraFeed});

    await dbPut('incubacao', {ativa:true, numOvos:13, dataInicio:Util.dataISO(menos1mes), diasIncubacao:35, compartimento:compartimento4Nome, alertaMostrado:false});
  }

  /* ============ MIGRAÇÃO AUTOMÁTICA (versão antiga em localStorage) ============ */
  async function migrarDeLocalStorageSeNecessario(){
    const raw = localStorage.getItem('capoeira-estado');
    if(!raw) return false;
    try{
      const antigo = JSON.parse(raw);
      for(const c of (antigo.compartimentos||[])){
        const aves = c.aves||[];
        const {aves:_omit, ...compSemAves} = c;
        delete compSemAves.id;
        const novoId = await dbAdd('compartimentos', compSemAves);
        for(const a of aves){ await dbAdd('aves', {...a, compartimentoId:novoId}); }
      }
      for(const item of (antigo.feedStock||[])){ const {id,...rest} = item; await dbAdd('feedStock', rest); }
      for(const c of (antigo.consumo||[])){ const {id,...rest} = c; await dbAdd('consumo', rest); }
      for(const t of (antigo.transacoes||[])){ const {id,...rest} = t; await dbAdd('transacoes', rest); }
      for(const o of (antigo.ovosLog||[])){ const {id,...rest} = o; await dbAdd('ovosLog', rest); }
      if(antigo.incubacao && Object.keys(antigo.incubacao).length){
        const {id:_idAntigo, ...incSemId} = antigo.incubacao;
        await dbPut('incubacao', incSemId);
      }
      localStorage.setItem('capoeira-estado-migrado-em', Util.hoje());
      localStorage.removeItem('capoeira-estado');
      Util.toast('Dados antigos migrados para o novo banco de dados ✅');
      return true;
    }catch(e){
      console.error('Falha na migração', e);
      return false;
    }
  }

  /* Prepara a base de dados por completo: abre-a, migra dados antigos do
     localStorage se existirem, e semeia dados de exemplo se for mesmo a
     primeira utilização. Chamada uma vez por página, no arranque
     (ver UI.initPagina em common.js). */
  /* ============ PRIMEIRO USO ============
     Antes, uma instalação nova enchia-se sozinha com os dados de exemplo (uma criação
     inteira de outra pessoa). Isso é um problema: num segundo aparelho, ou para um
     trabalhador, esses dados falsos misturavam-se com os verdadeiros. Agora, numa
     instalação nova a app NÃO cria nada: fica a aguardar que o utilizador escolha
     (assistente inicial, em common.js) entre começar do zero, ligar ao servidor, repor
     um backup ou ver os dados de exemplo. Quem já tinha dados nunca vê o assistente. */
  const inicio = {primeiroUso:false, modo:null};
  const CHAVE_INICIO = 'capoeira-inicio';
  const lerFlag = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const guardarFlag = (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} };

  async function temDadosDaCriacao(){
    for(const nome of ['compartimentos','aves','feedStock','transacoes','vendas','revenda','ovosLog','incubacao','saude','pesagens','saidasAves','consumo']){
      if((await getAll(nome)).length > 0) return true;
    }
    return false;
  }

  /* Prepara a base de dados por completo: abre-a (e migra a estrutura, se for
     preciso), traz os dados antigos do localStorage e decide se é o primeiro uso. */
  async function preparar(){
    await abrirBD();
    const migrou = await migrarDeLocalStorageSeNecessario();
    inicio.modo = lerFlag(CHAVE_INICIO);
    if(!inicio.modo){
      if(migrou || lerFlag('capoeira-semeado') || await temDadosDaCriacao()){
        inicio.modo = 'existente';                       // já usava a app: nada muda
        guardarFlag(CHAVE_INICIO, inicio.modo);
      } else {
        inicio.primeiroUso = true;                       // instalação nova: aguarda a escolha
      }
    }
    if(!inicio.primeiroUso) await garantirMisturasIniciaisUmaVez();
    avisarMigracao();
  }

  /* Chamada pelo assistente inicial. modo:
       'vazia'    — criação vazia (o normal);
       'exemplo'  — carrega os dados de exemplo, para experimentar;
       'servidor' — vai ligar-se ao servidor (a escolha só fica registada);
       'backup'   — vai repor um backup (idem). */
  async function iniciarCriacao(modo){
    if(modo === 'exemplo'){
      await semearDadosIniciais();
      await garantirMisturasIniciais();
      guardarFlag('capoeira-semeado', '1');
    }
    guardarFlag('capoeira-misturas-iniciais', '1');   // uma criação nova não leva misturas que ela não escolheu
    inicio.modo = modo; inicio.primeiroUso = false;
    guardarFlag(CHAVE_INICIO, modo);
    notificarMudanca('compartimentos');
  }

  /* Depois de uma actualização de versão, diz ao utilizador o que aconteceu e
     onde está a cópia de segurança. */
  function avisarMigracao(){
    if(typeof Util === 'undefined' || !Util.toast) return;
    if(migracao.erro){
      Util.toast('⚠️ ' + migracao.erro + ' Exporta um backup pelo Início assim que possível.', 12000);
    } else if(migracao.feita && (migracao.copiaDescarregada || migracao.copiaInterna)){
      Util.toast('✅ Dados actualizados para a nova versão (cada registo tem agora um identificador único). ' +
        (migracao.copiaDescarregada ? `Foi descarregada uma cópia de segurança (${migracao.nomeCopia}) — guarda-a.` : 'Ficou guardada uma cópia de segurança interna.'), 12000);
    } else if(migracao.feita){
      Util.toast('✅ Dados actualizados para a nova versão.', 6000);
    }
  }

  /* Quem já usava a app ficava com as duas misturas de exemplo sempre que apagava todas. Passa a
     criá-las uma única vez (e só se ainda não houver nenhuma). */
  async function garantirMisturasIniciaisUmaVez(){
    if(lerFlag('capoeira-misturas-iniciais')) return;
    await garantirMisturasIniciais();
    guardarFlag('capoeira-misturas-iniciais', '1');
  }

  async function garantirMisturasIniciais(){
    const existentes = await getAll('misturas');
    if(existentes.length>0) return;
    await dbAdd('misturas', {nome:'A (patinhos/galinhas)', composicao:'Farelo de trigo + Milho partido + Soja', destino:'Patinhos Pequin, Galinhas de corte'});
    await dbAdd('misturas', {nome:'B (patos adultos)', composicao:'Farelo de trigo + Milho partido (sem soja)', destino:'Patos Muscovy adultos'});
  }

  return {
    ErroBD, Bus,
    preparar,
    inicio, iniciarCriacao,
    getAll, getByIndex, get: dbGet, put: dbPut, add: dbAdd, del: dbDel, clear: dbClear,
    apagarDefinitivo: dbApagarDefinitivo,
    transacao: executarTransacaoAtomica,
    reqToPromise,
    /* Fase 1 (UUID) */
    usaUUID: true,
    novoId: novoUUID,
    lerAlterados, contarAlterados, aplicarRemotos, limparTudoLocal, limparTabelas,
    novoCarimbo: ()=>agora(),
    converterBackup, converterColecoes,
    migracao,
    tabelas: ESQUEMA.map(e=>e.nome)
  };
})();
if(typeof module !== 'undefined' && module.exports) module.exports = DB;   // para os testes (node)
