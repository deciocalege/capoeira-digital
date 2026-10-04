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
  const DB_VERSION = 4;
  let db;

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
        Bus.dispatchEvent(new CustomEvent('dataChanged', {detail:{store:e.data.store, remota:true}}));
      }
    };
  }

  function notificarMudanca(store){
    Bus.dispatchEvent(new CustomEvent('dataChanged', {detail:{store}}));
    if(canalSync){
      try{ canalSync.postMessage({type:'dataChanged', store}); }
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

  function abrirBD(){
    return new Promise((resolve, reject)=>{
      if(!('indexedDB' in window)){
        reject(new ErroBD('Este navegador não suporta armazenamento local (IndexedDB). Experimenta um navegador mais recente (Chrome, Firefox, Edge, Safari actualizado).'));
        return;
      }
      let req;
      try{
        req = indexedDB.open(DB_NAME, DB_VERSION);
      }catch(e){
        reject(new ErroBD('Não foi possível abrir o armazenamento local do navegador.', e));
        return;
      }
      req.onupgradeneeded = (e)=>{
        const d = e.target.result;
        if(!d.objectStoreNames.contains('compartimentos')){
          d.createObjectStore('compartimentos', {keyPath:'id', autoIncrement:true});
        }
        if(!d.objectStoreNames.contains('aves')){
          const s = d.createObjectStore('aves', {keyPath:'id', autoIncrement:true});
          s.createIndex('compartimentoId','compartimentoId',{unique:false});
        }
        if(!d.objectStoreNames.contains('feedStock')){
          d.createObjectStore('feedStock', {keyPath:'id', autoIncrement:true});
        }
        if(!d.objectStoreNames.contains('consumo')){
          const s = d.createObjectStore('consumo', {keyPath:'id', autoIncrement:true});
          s.createIndex('item','item',{unique:false});
        }
        if(!d.objectStoreNames.contains('transacoes')){
          const s = d.createObjectStore('transacoes', {keyPath:'id', autoIncrement:true});
          s.createIndex('categoria','categoria',{unique:false});
          s.createIndex('tipo','tipo',{unique:false});
        }
        if(!d.objectStoreNames.contains('ovosLog')){
          d.createObjectStore('ovosLog', {keyPath:'id', autoIncrement:true});
        }
        if(!d.objectStoreNames.contains('incubacao')){
          d.createObjectStore('incubacao', {keyPath:'id'});
        }
        if(!d.objectStoreNames.contains('misturas')){
          d.createObjectStore('misturas', {keyPath:'id', autoIncrement:true});
        }
        if(!d.objectStoreNames.contains('saidasAves')){
          const s = d.createObjectStore('saidasAves', {keyPath:'id', autoIncrement:true});
          s.createIndex('compartimentoId','compartimentoId',{unique:false});
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
      req.onerror = ()=> reject(new ErroBD('Não foi possível abrir a base de dados local. Os dados podem não ficar guardados.', req.error));
    });
  }

  function reqToPromise(req){
    return new Promise((resolve,reject)=>{
      req.onsuccess = ()=>resolve(req.result);
      req.onerror = ()=>reject(req.error);
    });
  }
  async function getAll(store){
    try{
      return await reqToPromise(db.transaction(store,'readonly').objectStore(store).getAll());
    }catch(e){
      console.error(`Falha a ler "${store}"`, e);
      toastErro(`Não foi possível ler os dados de "${store}".`);
      return [];
    }
  }
  async function getByIndex(store, indexName, valor){
    try{
      return await reqToPromise(db.transaction(store,'readonly').objectStore(store).index(indexName).getAll(valor));
    }catch(e){
      console.error(`Falha a ler índice de "${store}"`, e);
      toastErro(`Não foi possível ler os dados de "${store}".`);
      return [];
    }
  }
  async function dbGet(store, chave){
    try{
      return await reqToPromise(db.transaction(store,'readonly').objectStore(store).get(chave));
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

  /* As operações de escrita notificam sempre o Bus — é isto que resolve a falta
     de "atualização direta": qualquer alteração em qualquer separador acende
     de imediato a faixa de estatísticas e, se estiveres no Início, o próprio
     painel de resumo. Cada uma está agora protegida com try/catch: se a
     escrita falhar (ex: armazenamento cheio), o utilizador é avisado em vez
     de a alteração desaparecer silenciosamente. */
  async function dbPut(store, valor){
    try{
      const r = await reqToPromise(db.transaction(store,'readwrite').objectStore(store).put(valor));
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
      const r = await reqToPromise(db.transaction(store,'readwrite').objectStore(store).add(valor));
      notificarMudanca(store);
      return r;
    }catch(e){
      console.error(`Falha ao adicionar em "${store}"`, e);
      toastErro(mensagemErroEscrita(store, e));
      throw new ErroBD(mensagemErroEscrita(store, e), e);
    }
  }
  async function dbDel(store, chave){
    try{
      const r = await reqToPromise(db.transaction(store,'readwrite').objectStore(store).delete(chave));
      notificarMudanca(store);
      return r;
    }catch(e){
      console.error(`Falha ao apagar de "${store}"`, e);
      toastErro(mensagemErroEscrita(store, e));
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
    let resultado, falhouDentro = false;
    const espera = new Promise((resolve, reject)=>{
      tx.oncomplete = ()=> resolve(resultado);
      tx.onerror = ()=>{ if(!falhouDentro) reject(tx.error); };
      tx.onabort = ()=> reject(tx.error || new ErroBD('Operação cancelada — nenhuma alteração foi gravada.'));
    });
    (async ()=>{
      try{
        resultado = await operacoes(tx);
      }catch(err){
        falhouDentro = true;
        console.error(`Passo da transação [${stores.join(', ')}] falhou — a cancelar tudo`, err);
        try{ tx.abort(); }catch(_){/* já pode estar a abortar sozinha */}
      }
    })();
    try{
      const r = await espera;
      stores.forEach(s=>notificarMudanca(s));
      return r;
    }catch(e){
      const msg = (e instanceof ErroBD)
        ? `⚠️ ${e.message}`
        : `⚠️ A operação foi cancelada e NENHUMA alteração foi gravada (falha em: ${stores.join(', ')}). Tenta novamente.`;
      toastErro(msg);
      throw new ErroBD(msg, e);
    }
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

    await dbPut('incubacao', {id:1, ativa:true, numOvos:13, dataInicio:Util.dataISO(menos1mes), diasIncubacao:35, compartimento:compartimento4Nome, alertaMostrado:false});
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
        await dbPut('incubacao', {...antigo.incubacao, id:1});
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
  async function preparar(){
    await abrirBD();
    const migrou = await migrarDeLocalStorageSeNecessario();
    let jaSemeado = false;
    try{ jaSemeado = !!localStorage.getItem('capoeira-semeado'); }catch(e){}
    if(!migrou && !jaSemeado){
      const existentes = await getAll('compartimentos');
      if(existentes.length===0) await semearDadosIniciais();
      try{ localStorage.setItem('capoeira-semeado','1'); }catch(e){}
    }
    await garantirMisturasIniciais();
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
    getAll, getByIndex, get: dbGet, put: dbPut, add: dbAdd, del: dbDel, clear: dbClear,
    transacao: executarTransacaoAtomica,
    reqToPromise
  };
})();
