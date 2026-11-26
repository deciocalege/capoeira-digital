'use strict';
/* ============================================================
   TESTES AUTOMATIZADOS — js/db.js (Fase 1: UUID, criadoEm / atualizadoEm /
   apagado, migração da versão 8 para a 9 e backup versão 3)
   ============================================================
   Como correr:   node tests/db.test.js

   Parte dos testes não precisa de nada (conversão de ids e de backups).
   Os que usam a base de dados precisam de um IndexedDB de teste:

       npm install --no-save fake-indexeddb

   Sem isso, esses testes são saltados (aparece um aviso) e os restantes
   correm na mesma. ============================================================ */
const assert = require('assert');
const path = require('path');
const ficheiroDB = path.join(__dirname, '..', 'js', 'db.js');

let fake = null;
try{ fake = require('fake-indexeddb'); }catch(e){ /* sem IndexedDB de teste */ }

/* --- ambiente mínimo que o db.js espera (navegador) --- */
const avisos = [];
const armazem = {};
global.localStorage = {getItem:k=>(k in armazem ? armazem[k] : null), setItem:(k,v)=>{ armazem[k]=String(v); }, removeItem:k=>{ delete armazem[k]; }};
global.Util = {
  dataISO: d=>d.toISOString().slice(0,10), hoje: ()=>new Date().toISOString().slice(0,10),
  toast: (m)=>{ avisos.push(String(m)); }
};
global.BroadcastChannel = undefined;                       // não prender o processo
const descarregas = [];
global.document = {
  createElement: ()=>({click(){ descarregas.push(this.download); }, set href(v){}, get href(){return ''}, remove(){}}),
  body: {appendChild(){}}
};

function carregarDB(factory){
  global.indexedDB = factory;
  if(fake) global.IDBKeyRange = fake.IDBKeyRange;
  global.window = {indexedDB: factory};
  delete require.cache[require.resolve(ficheiroDB)];
  return require(ficheiroDB);
}

let ok = 0; const falhas = [];
async function test(nome, fn){
  try{ await fn(); ok++; console.log('  ✅ ' + nome); }
  catch(e){ falhas.push(nome); console.log('  ❌ ' + nome + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0,3).join('\n     ') : e)); }
}
function saltar(nome){ console.log('  ⏭  ' + nome + ' (precisa de fake-indexeddb)'); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const dormir = ms=>new Promise(r=>setTimeout(r, ms));
/* Cada teste começa com a memória do navegador (localStorage) e a base de dados limpas. */
const limparLS = ()=>{ Object.keys(armazem).forEach(k=>delete armazem[k]); };
const novaBase = ()=>{ limparLS(); return new fake.IDBFactory(); };

/* ---------- ajudas para a base "antiga" (versão 8) ---------- */
const STORES_V8 = [['compartimentos'],['aves',['compartimentoId']],['feedStock'],['consumo',['item']],['transacoes',['categoria','tipo']],
  ['ovosLog'],['incubacao',null,false],['revenda'],['revendaMov'],['vendas'],['saude'],['pesagens'],['planosAlimentares'],['misturas'],['saidasAves',['compartimentoId']]];
function criarBaseV8(factory, dados){
  return new Promise((resolve, reject)=>{
    const rq = factory.open('capoeiraDB', 8);
    rq.onupgradeneeded = ()=>{
      const d = rq.result;
      STORES_V8.forEach(([nome, indices, auto])=>{
        const s = d.createObjectStore(nome, {keyPath:'id', autoIncrement: auto !== false});
        (indices || []).forEach(i=>s.createIndex(i, i, {unique:false}));
      });
    };
    rq.onerror = ()=>reject(rq.error);
    rq.onsuccess = ()=>{
      const d = rq.result;
      const tx = d.transaction(Object.keys(dados), 'readwrite');
      Object.keys(dados).forEach(n=>dados[n].forEach(r=>tx.objectStore(n).put(r)));
      tx.oncomplete = ()=>{ d.close(); resolve(); };
      tx.onerror = ()=>reject(tx.error);
    };
  });
}
const DADOS_V8 = {
  compartimentos: [{id:1, nome:'Galinheiro'}, {id:2, nome:'Lago'}],
  aves: [{id:1, compartimentoId:1, especie:'Galinha Sasso', qtd:5}, {id:2, compartimentoId:2, especie:'Pato Muscovy', qtd:2}, {id:3, compartimentoId:99, especie:'Órfã', qtd:1}],
  feedStock: [{id:1, nome:'Ração', kgComprado:50}],
  consumo: [{id:1, item:'Ração', feedStockId:1, loteId:2, vendaId:5, kg:2}],
  transacoes: [{id:1, tipo:'despesa', categoria:'Alimentação', feedStockId:1, valor:10}, {id:2, tipo:'receita', categoria:'Venda', vendaId:5, valor:50}, {id:3, tipo:'despesa', categoria:'Saúde', saudeId:3, valor:5}, {id:4, tipo:'despesa', categoria:'Revenda', revendaMovId:1, valor:7}],
  ovosLog: [{id:1, aveId:2, qtd:3}],
  incubacao: [{id:1, ativa:true, aveIds:[1, 2, 77], destinoCompartimentoId:2}],
  revenda: [{id:7, nome:'Milho'}],
  revendaMov: [{id:1, produtoId:7, vendaId:5, tipo:'venda', qtd:1}],
  vendas: [{id:5, tipo:'outro', revendaId:7, feedStockId:1, valor:50}],
  saude: [{id:3, loteId:1, tipo:'Vacina'}],
  pesagens: [{id:1, loteId:2, pesoMedioG:300}],
  planosAlimentares: [{id:1, especie:'Pato Muscovy', gramas:30}],
  misturas: [{id:1, nome:'A'}],
  saidasAves: [{id:1, compartimentoId:1, motivo:'venda'}]
};
function lerBruto(factory, nome, versao){
  return new Promise((resolve, reject)=>{
    const rq = versao ? factory.open(nome, versao) : factory.open(nome);
    rq.onerror = ()=>reject(rq.error);
    rq.onsuccess = ()=>resolve(rq.result);
  });
}
const todos = (d, store)=>new Promise((res, rej)=>{ const r = d.transaction(store).objectStore(store).getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });

/* Protótipo do "object store" do IndexedDB de teste, para simular uma falha a meio de uma escrita. */
async function protoObjectStore(modulo){
  const f = new modulo.IDBFactory();
  const d = await new Promise((res, rej)=>{ const r = f.open('proto', 1); r.onupgradeneeded = ()=>r.result.createObjectStore('x'); r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); });
  const proto = Object.getPrototypeOf(d.transaction('x').objectStore('x')); d.close();
  return {prototype: proto};
}
(async()=>{
  const DB0 = carregarDB(fake ? new fake.IDBFactory() : undefined);

  console.log('\nConversão de ids (função pura)');
  await test('converterColecoes: ids viram UUID únicos e as ligações entre tabelas acompanham', ()=>{
    const {colecoes, mapa} = DB0.converterColecoes(JSON.parse(JSON.stringify(DADOS_V8)));
    const todosIds = [].concat(...Object.values(colecoes).map(l=>l.map(r=>r.id)));
    assert.ok(todosIds.every(id=>UUID.test(id)));
    assert.strictEqual(new Set(todosIds).size, todosIds.length);
    const comp = Object.fromEntries(colecoes.compartimentos.map(c=>[c.nome, c.id]));
    assert.strictEqual(colecoes.aves[0].compartimentoId, comp.Galinheiro);
    assert.strictEqual(colecoes.aves[1].compartimentoId, comp.Lago);
    assert.strictEqual(colecoes.aves[2].compartimentoId, null);                         // compartimento que já não existe
    assert.strictEqual(colecoes.transacoes[0].feedStockId, colecoes.feedStock[0].id);
    assert.strictEqual(colecoes.transacoes[1].vendaId, colecoes.vendas[0].id);
    assert.strictEqual(colecoes.transacoes[2].saudeId, colecoes.saude[0].id);
    assert.strictEqual(colecoes.transacoes[3].revendaMovId, colecoes.revendaMov[0].id);
    assert.deepStrictEqual([colecoes.consumo[0].feedStockId, colecoes.consumo[0].loteId, colecoes.consumo[0].vendaId],
      [colecoes.feedStock[0].id, colecoes.aves[1].id, colecoes.vendas[0].id]);
    assert.strictEqual(colecoes.vendas[0].revendaId, colecoes.revenda[0].id);
    assert.strictEqual(colecoes.revendaMov[0].produtoId, colecoes.revenda[0].id);
    assert.strictEqual(colecoes.saude[0].loteId, colecoes.aves[0].id);
    assert.strictEqual(colecoes.pesagens[0].loteId, colecoes.aves[1].id);
    assert.strictEqual(colecoes.ovosLog[0].aveId, colecoes.aves[1].id);
    assert.deepStrictEqual(colecoes.incubacao[0].aveIds, [colecoes.aves[0].id, colecoes.aves[1].id]);   // o 77 não existe: sai
    assert.strictEqual(colecoes.incubacao[0].destinoCompartimentoId, comp.Lago);
    assert.strictEqual(mapa.aves['1'], colecoes.aves[0].id);
  });
  await test('converterColecoes: acrescenta criadoEm / atualizadoEm / apagado, pela ordem dos ids antigos', ()=>{
    const {colecoes} = DB0.converterColecoes({aves:[{id:10, especie:'B'}, {id:2, especie:'A'}]});
    assert.deepStrictEqual(colecoes.aves.map(a=>a.especie), ['A', 'B']);
    colecoes.aves.forEach(a=>{ assert.ok(!isNaN(Date.parse(a.criadoEm))); assert.strictEqual(a.atualizadoEm, a.criadoEm); assert.strictEqual(a.apagado, false); });
    assert.ok(colecoes.aves[0].criadoEm < colecoes.aves[1].criadoEm);
  });
  await test('converterColecoes: é seguro correr duas vezes (UUID e carimbos não mudam)', ()=>{
    const um = DB0.converterColecoes(JSON.parse(JSON.stringify(DADOS_V8))).colecoes;
    const dois = DB0.converterColecoes(JSON.parse(JSON.stringify(um))).colecoes;
    const resumo = c=>Object.fromEntries(Object.keys(c).map(k=>[k, c[k].map(r=>[r.id, r.criadoEm]).sort()]));
    assert.deepStrictEqual(resumo(dois), resumo(um));                                     // mesmos ids e carimbos
    assert.deepStrictEqual(dois.aves.map(a=>a.compartimentoId).sort(), um.aves.map(a=>a.compartimentoId).sort());   // mesmas ligações
  });
  await test('converterBackup: versão 2 → 3, mantém o resto e aceita o choco antigo em objecto único', ()=>{
    const v2 = {versaoBackup:2, geradoEm:'x', compartimentos:[{id:1, nome:'A'}], aves:[{id:1, compartimentoId:1}], incubacao:{ativa:true, numOvos:5}};
    const v3 = DB0.converterBackup(v2);
    assert.strictEqual(v3.versaoBackup, 3); assert.strictEqual(v3.geradoEm, 'x');
    assert.strictEqual(v3.aves[0].compartimentoId, v3.compartimentos[0].id);
    assert.ok(Array.isArray(v3.incubacao) && UUID.test(v3.incubacao[0].id));
    assert.ok(!('feedStock' in v3));                                    // não inventa tabelas que o backup não trazia
    assert.strictEqual(v2.versaoBackup, 2);                             // não altera o original
  });
  await test('converterBackup: versão 3 passa tal como está', ()=>{
    const v3 = {versaoBackup:3, aves:[{id:'b3f1c9e2-5a47-4d0e-9c1a-7e2f8d4a1b60'}]};
    assert.strictEqual(DB0.converterBackup(v3), v3);
  });

  if(!fake){
    saltar('Base de dados: instalação nova, migração 8→9, apagar, transacções');
    console.log('\n   Para correr todos: npm install --no-save fake-indexeddb\n');
  } else {
    console.log('\nInstalação nova');
    await test('primeira abertura: cria a base na versão 9 e NÃO inventa dados (aguarda a escolha do utilizador)', async ()=>{
      const f = novaBase(); const DB = carregarDB(f);
      await DB.preparar();
      const d = await lerBruto(f, 'capoeiraDB'); assert.strictEqual(d.version, 9);
      assert.strictEqual(DB.usaUUID, true); assert.strictEqual(DB.migracao.feita, false);
      assert.strictEqual(DB.inicio.primeiroUso, true);
      for(const nome of DB.tabelas) assert.strictEqual((await DB.getAll(nome)).length, 0, nome + ' devia estar vazia');
      const ix = d.transaction('aves').objectStore('aves').indexNames;
      assert.ok(ix.contains('compartimentoId') && ix.contains('atualizadoEm'));
      d.close();
    });

    console.log('\nPrimeiro uso (assistente inicial)');
    await test('"começar do zero": fica vazio, o assistente não volta e nada é criado nas aberturas seguintes', async ()=>{
      const f = novaBase(); let DB = carregarDB(f);
      await DB.preparar(); assert.strictEqual(DB.inicio.primeiroUso, true);
      await DB.iniciarCriacao('vazia');
      assert.strictEqual(DB.inicio.primeiroUso, false); assert.strictEqual(armazem['capoeira-inicio'], 'vazia');
      DB = carregarDB(f); await DB.preparar();
      assert.strictEqual(DB.inicio.primeiroUso, false); assert.strictEqual(DB.inicio.modo, 'vazia');
      for(const nome of DB.tabelas) assert.strictEqual((await DB.getAll(nome)).length, 0, nome);
    });
    await test('"dados de exemplo": cria a criação de exemplo já com UUID e ligações', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      await DB.iniciarCriacao('exemplo');
      const comps = await DB.getAll('compartimentos'), aves = await DB.getAll('aves');
      assert.strictEqual(comps.length, 5); assert.ok(aves.length > 5);
      assert.ok(comps.every(c=>UUID.test(c.id) && c.criadoEm && c.apagado === false));
      assert.ok(aves.every(a=>comps.some(c=>c.id === a.compartimentoId)));
      assert.ok(UUID.test((await DB.getAll('incubacao'))[0].id));
      assert.strictEqual((await DB.getAll('misturas')).length, 2);
    });
    await test('"servidor" e "backup": só ficam registados (não criam dados)', async ()=>{
      for(const modo of ['servidor', 'backup']){
        const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
        await DB.iniciarCriacao(modo);
        assert.strictEqual(armazem['capoeira-inicio'], modo); assert.strictEqual((await DB.getAll('compartimentos')).length, 0);
      }
    });
    await test('quem já usava a app (base antiga com dados) nunca vê o assistente', async ()=>{
      const f = novaBase(); await criarBaseV8(f, DADOS_V8);
      const DB = carregarDB(f); await DB.preparar();
      assert.strictEqual(DB.inicio.primeiroUso, false); assert.strictEqual(DB.inicio.modo, 'existente'); assert.strictEqual(armazem['capoeira-inicio'], 'existente');
    });
    await test('quem já tinha a marca de "dados de exemplo criados" (mesmo com a base vazia) também não vê o assistente', async ()=>{
      const f = novaBase(); armazem['capoeira-semeado'] = '1';
      const DB = carregarDB(f); await DB.preparar();
      assert.strictEqual(DB.inicio.primeiroUso, false); assert.strictEqual(DB.inicio.modo, 'existente');
    });
    await test('misturas de exemplo: para quem já usava, cria-se uma só vez (apagá-las não as faz voltar)', async ()=>{
      const f = novaBase(); armazem['capoeira-semeado'] = '1';
      let DB = carregarDB(f); await DB.preparar();
      const ms = await DB.getAll('misturas'); assert.strictEqual(ms.length, 2);
      for(const m of ms) await DB.del('misturas', m.id);
      DB = carregarDB(f); await DB.preparar();
      assert.strictEqual((await DB.getAll('misturas')).length, 0);
    });

    console.log('\nMigração da versão 8 para a 9');
    await test('converte uma base antiga: UUID, ligações, carimbos, nada se perde', async ()=>{
      const f = novaBase(); await criarBaseV8(f, DADOS_V8);
      const DB = carregarDB(f); descarregas.length = 0; avisos.length = 0;
      await DB.preparar();
      assert.strictEqual(DB.migracao.feita, true); assert.strictEqual(DB.migracao.de, 8);
      const d = await lerBruto(f, 'capoeiraDB'); assert.strictEqual(d.version, 9);
      for(const [nome] of STORES_V8){
        const novos = await todos(d, nome);
        assert.strictEqual(novos.length, DADOS_V8[nome].length, nome + ': mesmo número de registos');
        assert.ok(novos.every(r=>UUID.test(r.id) && r.criadoEm && r.atualizadoEm && r.apagado === false), nome);
        assert.strictEqual(d.transaction(nome).objectStore(nome).autoIncrement, false, nome + ': sem autoIncrement');
      }
      const aves = await DB.getAll('aves'), comps = await DB.getAll('compartimentos');
      const sasso = aves.find(a=>a.especie === 'Galinha Sasso');
      assert.strictEqual(comps.find(c=>c.id === sasso.compartimentoId).nome, 'Galinheiro');
      assert.strictEqual(aves.find(a=>a.especie === 'Órfã').compartimentoId, null);
      const venda = (await DB.getAll('vendas'))[0];
      assert.strictEqual((await DB.getAll('revendaMov'))[0].vendaId, venda.id);
      assert.strictEqual((await DB.getAll('transacoes')).find(t=>t.valor === 50).vendaId, venda.id);
      d.close();
    });
    await test('antes de migrar guarda uma cópia (ficheiro e base interna) com os dados antigos intactos', async ()=>{
      const f = novaBase(); await criarBaseV8(f, DADOS_V8);
      const DB = carregarDB(f); descarregas.length = 0; avisos.length = 0;
      await DB.preparar();
      assert.strictEqual(DB.migracao.copiaInterna, true); assert.strictEqual(DB.migracao.copiaDescarregada, true);
      assert.ok(/^capoeira-backup-antes-da-v9-\d{4}-\d{2}-\d{2}\.json$/.test(descarregas[0]));
      const c = await lerBruto(f, 'capoeiraDB-copias', 1);
      const guardada = (await todos(c, 'copias'))[0]; c.close();
      assert.strictEqual(guardada.chave, 'antes-da-v9');
      assert.strictEqual(guardada.dados.versaoBackup, 2);
      assert.deepStrictEqual(guardada.dados.aves.map(a=>a.id).sort(), [1, 2, 3]);          // ids numéricos antigos
      assert.strictEqual(guardada.dados.aves[0].compartimentoId === 1 || guardada.dados.aves[0].compartimentoId === 2 || guardada.dados.aves[0].compartimentoId === 99, true);
      assert.ok(avisos.some(m=>/Dados actualizados/.test(m) && /cópia de segurança/.test(m)));
    });
    await test('a cópia guardada volta a entrar: converterBackup(cópia) liga tudo outra vez', async ()=>{
      const f = novaBase(); await criarBaseV8(f, DADOS_V8);
      const DB = carregarDB(f); await DB.preparar();
      const c = await lerBruto(f, 'capoeiraDB-copias', 1); const cop = (await todos(c, 'copias'))[0].dados; c.close();
      const conv = DB.converterBackup(cop);
      assert.strictEqual(conv.versaoBackup, 3);
      assert.strictEqual(conv.aves.find(a=>a.especie === 'Pato Muscovy').compartimentoId, conv.compartimentos.find(x=>x.nome === 'Lago').id);
    });
    await test('abrir outra vez não migra de novo nem repete a cópia', async ()=>{
      const f = novaBase(); await criarBaseV8(f, DADOS_V8);
      let DB = carregarDB(f); await DB.preparar();
      const antes = (await DB.getAll('aves')).map(a=>a.id).sort();
      descarregas.length = 0;
      DB = carregarDB(f); await DB.preparar();
      assert.strictEqual(DB.migracao.feita, false); assert.strictEqual(descarregas.length, 0);
      assert.deepStrictEqual((await DB.getAll('aves')).map(a=>a.id).sort(), antes);
    });
    await test('se a migração falhar a meio, NADA muda: a base fica na versão 8 com os dados intactos', async ()=>{
      const f = novaBase(); await criarBaseV8(f, DADOS_V8);
      const FDBObjectStore = await protoObjectStore(fake);
      const original = FDBObjectStore.prototype.put;
      let chamadas = 0;
      FDBObjectStore.prototype.put = function(){ chamadas++; if(chamadas === 5) throw new Error('falha simulada a meio'); return original.apply(this, arguments); };
      const DB = carregarDB(f); avisos.length = 0;
      let erro = null;
      try{ await DB.preparar(); }catch(e){ erro = e; } finally { FDBObjectStore.prototype.put = original; }
      assert.ok(erro && /NADA foi alterado/.test(erro.message), erro && erro.message);
      const d = await lerBruto(f, 'capoeiraDB');
      assert.strictEqual(d.version, 8);
      const aves = await todos(d, 'aves'); d.close();
      assert.deepStrictEqual(aves.map(a=>a.id).sort(), [1, 2, 3]);                     // ids numéricos antigos, intactos
      assert.strictEqual(DB.migracao.feita, false);
      /* e a cópia de segurança já existia antes de a migração começar */
      const c = await lerBruto(f, 'capoeiraDB-copias', 1); const n = (await todos(c, 'copias')).length; c.close();
      assert.strictEqual(n, 1);
    });
    await test('depois de uma falha, tentar outra vez migra bem', async ()=>{
      const f = novaBase(); await criarBaseV8(f, DADOS_V8);
      const FDBObjectStore = await protoObjectStore(fake);
      const original = FDBObjectStore.prototype.put; let n = 0;
      FDBObjectStore.prototype.put = function(){ if(++n === 3) throw new Error('falha simulada'); return original.apply(this, arguments); };
      try{ await carregarDB(f).preparar(); }catch(e){} finally { FDBObjectStore.prototype.put = original; }
      const DB = carregarDB(f); await DB.preparar();
      assert.strictEqual(DB.migracao.feita, true);
      assert.strictEqual((await DB.getAll('aves')).length, 3);
    });
    await test('base antiga vazia: migra sem criar cópia', async ()=>{
      const f = novaBase(); await criarBaseV8(f, {compartimentos:[]});
      const DB = carregarDB(f); descarregas.length = 0; await DB.preparar();
      assert.strictEqual(descarregas.length, 0); assert.strictEqual((await lerBruto(f, 'capoeiraDB')).version, 9);
    });

    console.log('\nCarimbos e apagar');
    await test('add: devolve o UUID e carimba; put: renova atualizadoEm e mantém criadoEm', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      const id = await DB.add('ovosLog', {data:'2026-10-01', qtd:3});
      assert.ok(UUID.test(id));
      const r1 = await DB.get('ovosLog', id);
      assert.ok(r1.criadoEm && r1.atualizadoEm && r1.apagado === false);
      await dormir(8);
      await DB.put('ovosLog', {...r1, qtd:9});
      const r2 = await DB.get('ovosLog', id);
      assert.strictEqual(r2.qtd, 9); assert.strictEqual(r2.criadoEm, r1.criadoEm); assert.ok(r2.atualizadoEm > r1.atualizadoEm);
    });
    await test('put sem id cria um registo novo com UUID', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      const id = await DB.put('pesagens', {pesoMedioG:100});
      assert.ok(UUID.test(id)); assert.strictEqual((await DB.getAll('pesagens')).length, 1);
    });
    await test('del: marca como apagado — some das leituras mas fica na base; apagar duas vezes ou um inexistente não dá erro', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      const id = await DB.add('ovosLog', {qtd:1}); await DB.add('ovosLog', {qtd:2});
      await dormir(8); await DB.del('ovosLog', id);
      assert.deepStrictEqual((await DB.getAll('ovosLog')).map(o=>o.qtd), [2]);
      assert.strictEqual(await DB.get('ovosLog', id), undefined);
      const bruto = await lerBruto(f, 'capoeiraDB'); const reg = (await todos(bruto, 'ovosLog')).find(o=>o.id === id); bruto.close();
      assert.strictEqual(reg.apagado, true); assert.ok(reg.atualizadoEm > reg.criadoEm);
      await DB.del('ovosLog', id); await DB.del('ovosLog', 'não-existe');
    });
    await test('getByIndex não devolve registos apagados', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      const c = await DB.add('compartimentos', {nome:'X'});
      const a1 = await DB.add('aves', {compartimentoId:c, especie:'A'}); await DB.add('aves', {compartimentoId:c, especie:'B'});
      await DB.del('aves', a1);
      assert.deepStrictEqual((await DB.getByIndex('aves', 'compartimentoId', c)).map(a=>a.especie), ['B']);
    });

    console.log('\nPara a sincronização (ler o que mudou, aplicar o que chega)');
    await test('lerAlterados: do mais antigo ao mais recente, inclui apagados, respeita "desde" e o máximo; contarAlterados bate certo', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      const a = await DB.add('ovosLog', {qtd:1}), b = await DB.add('aves', {especie:'X'}), c = await DB.add('ovosLog', {qtd:3});
      await DB.del('ovosLog', a);                                              // apagar também é uma alteração (e a mais recente)
      const todos = await DB.lerAlterados('', 0);
      assert.strictEqual(todos.length, 3);
      assert.deepStrictEqual(todos.map(x=>x.id), [b, c, a]);                  // ordenados por atualizadoEm
      assert.strictEqual(todos[2].apagado, true);
      assert.strictEqual((await DB.lerAlterados('', 2)).length, 2);
      const depoisDoB = await DB.lerAlterados(todos[0].dados.atualizadoEm, 0);
      assert.deepStrictEqual(depoisDoB.map(x=>x.id), [c, a]);
      assert.strictEqual(await DB.contarAlterados(''), 3); assert.strictEqual(await DB.contarAlterados(todos[1].dados.atualizadoEm), 1);
    });
    await test('carimbos: cada alteração é mais recente que a anterior e que a versão que se está a editar', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      const id = await DB.add('ovosLog', {qtd:1});
      let anterior = (await DB.get('ovosLog', id)).atualizadoEm;
      for(let i = 0; i < 25; i++){
        await DB.put('ovosLog', {...(await DB.get('ovosLog', id)), qtd:i});
        const atual = (await DB.get('ovosLog', id)).atualizadoEm;
        assert.ok(atual > anterior, `volta ${i}: ${atual} devia ser > ${anterior}`); anterior = atual;
      }
      // uma versão "de um relógio adiantado" (5 min): a edição seguinte ganha-lhe na mesma
      const futuro = new Date(Date.now() + 5 * 60000).toISOString();
      await DB.aplicarRemotos([{tabela:'ovosLog', id, dados:{id, qtd:99, criadoEm:futuro, atualizadoEm:futuro, apagado:false}, apagado:false}]);
      await DB.put('ovosLog', {...(await DB.get('ovosLog', id)), qtd:100});
      assert.ok((await DB.get('ovosLog', id)).atualizadoEm > futuro);
    });
    await test('aplicarRemotos: só substitui por versões MAIS RECENTES, conserva o carimbo recebido e avisa com origem "sync"', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      const eventos = []; DB.Bus.addEventListener('dataChanged', e=>eventos.push(e.detail));
      const base = {id:'x1', qtd:1, criadoEm:'2026-10-01T10:00:00.000Z', atualizadoEm:'2026-10-01T10:00:00.000Z', apagado:false};
      let r = await DB.aplicarRemotos([{tabela:'ovosLog', id:'x1', dados:base, apagado:false}]);
      assert.strictEqual(r.aplicados, 1); assert.strictEqual((await DB.get('ovosLog', 'x1')).atualizadoEm, base.atualizadoEm);
      r = await DB.aplicarRemotos([{tabela:'ovosLog', id:'x1', dados:{...base, qtd:2, atualizadoEm:'2026-10-01T09:00:00.000Z'}, apagado:false}]);     // mais antiga
      assert.strictEqual(r.aplicados, 0); assert.strictEqual((await DB.get('ovosLog', 'x1')).qtd, 1);
      r = await DB.aplicarRemotos([{tabela:'ovosLog', id:'x1', dados:{...base}, apagado:false}]);                                                  // igual
      assert.strictEqual(r.aplicados, 0);
      r = await DB.aplicarRemotos([{tabela:'ovosLog', id:'x1', dados:{...base, qtd:3, atualizadoEm:'2026-10-02T10:00:00.000Z'}, apagado:false}]);  // mais recente
      assert.strictEqual(r.aplicados, 1); assert.strictEqual((await DB.get('ovosLog', 'x1')).qtd, 3);
      r = await DB.aplicarRemotos([{tabela:'ovosLog', id:'x1', dados:{...base, atualizadoEm:'2026-10-03T10:00:00.000Z'}, apagado:true}]);           // apagado no servidor
      assert.strictEqual(await DB.get('ovosLog', 'x1'), undefined);
      assert.ok(eventos.length >= 3 && eventos.every(e=>e.sync === true), JSON.stringify(eventos));
    });
    await test('limparTudoLocal apaga tudo de vez, sem deixar marcas', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      await DB.add('ovosLog', {qtd:1}); await DB.add('aves', {especie:'X'}); const del = await DB.add('ovosLog', {qtd:2}); await DB.del('ovosLog', del);
      await DB.limparTudoLocal();
      assert.strictEqual(await DB.contarAlterados(''), 0);
      const bruto = await lerBruto(f, 'capoeiraDB'); assert.strictEqual((await todos(bruto, 'ovosLog')).length, 0); bruto.close();
    });

    console.log('\nTransacções (as páginas não mudam)');
    await test('tx.add devolve o UUID, que serve para ligar registos na mesma transacção', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      await DB.transacao(['vendas', 'transacoes'], async tx=>{
        const idVenda = await DB.reqToPromise(tx.objectStore('vendas').add({tipo:'ovos', valor:20}));
        assert.ok(UUID.test(idVenda));
        await DB.reqToPromise(tx.objectStore('transacoes').add({tipo:'receita', valor:20, vendaId:idVenda}));
      });
      const v = (await DB.getAll('vendas'))[0], t = (await DB.getAll('transacoes')).find(x=>x.vendaId);
      assert.strictEqual(t.vendaId, v.id); assert.ok(t.criadoEm && t.apagado === false);
    });
    await test('tx.delete apaga com marca; tx.get, tx.getAll e index().getAll não mostram os apagados', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      const c = await DB.add('compartimentos', {nome:'X'});
      const a1 = await DB.add('aves', {compartimentoId:c, especie:'A'}), a2 = await DB.add('aves', {compartimentoId:c, especie:'B'});
      await DB.transacao(['aves'], async tx=>{
        const st = tx.objectStore('aves');
        await DB.reqToPromise(st.delete(a1));
        assert.strictEqual(await DB.reqToPromise(st.get(a1)), undefined);
        assert.deepStrictEqual((await DB.reqToPromise(st.getAll())).map(a=>a.id), [a2]);
        assert.deepStrictEqual((await DB.reqToPromise(st.index('compartimentoId').getAll(c))).map(a=>a.id), [a2]);
        assert.strictEqual(await DB.reqToPromise(st.count()), 1);
      });
      const bruto = await lerBruto(f, 'capoeiraDB'); const todas = await todos(bruto, 'aves'); bruto.close();
      assert.strictEqual(todas.find(a=>a.id === a1).apagado, true);
    });
    await test('importação (clear + put na mesma transacção) conserva criadoEm e atualizadoEm do backup', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      const id = 'b3f1c9e2-5a47-4d0e-9c1a-7e2f8d4a1b60';
      await DB.transacao(['ovosLog'], async tx=>{
        const st = tx.objectStore('ovosLog'); await DB.reqToPromise(st.clear());
        await DB.reqToPromise(st.put({id, qtd:4, criadoEm:'2026-01-01T10:00:00.000Z', atualizadoEm:'2026-02-02T10:00:00.000Z', apagado:false}));
      });
      const r = await DB.get('ovosLog', id);
      assert.strictEqual(r.criadoEm, '2026-01-01T10:00:00.000Z'); assert.strictEqual(r.atualizadoEm, '2026-02-02T10:00:00.000Z');
      await DB.put('ovosLog', {...r, qtd:5});                                           // uma edição normal já actualiza
      assert.ok((await DB.get('ovosLog', id)).atualizadoEm > '2026-02-02T10:00:00.000Z');
    });
    await test('um erro de validação dentro da transacção chega ao utilizador com a SUA mensagem (e desfaz tudo)', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar(); avisos.length = 0;
      let erro = null;
      try{
        await DB.transacao(['vendas'], async tx=>{
          await DB.reqToPromise(tx.objectStore('vendas').add({tipo:'ovos'}));
          throw new DB.ErroBD('Só há 2 macho(s) disponíveis nesta ave/grupo.');
        });
      }catch(e){ erro = e; }
      assert.ok(erro && /Só há 2 macho/.test(erro.message));
      assert.ok(avisos.some(m=>m.includes('Só há 2 macho(s) disponíveis')), avisos.join(' | '));      // antes aparecia só "Operação cancelada"
      assert.strictEqual((await DB.getAll('vendas')).length, 0);
    });
    await test('um erro técnico (ex.: id inválido) diz qual foi e sugere recarregar a página', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar(); avisos.length = 0;
      try{
        await DB.transacao(['aves'], async tx=>{ await DB.reqToPromise(tx.objectStore('aves').get(NaN)); });   // como um ficheiro antigo: Number("uuid")
      }catch(e){}
      const m = avisos.join(' | ');
      assert.ok(/NENHUMA alteração/.test(m) && /DataError/.test(m) && /recarrega a página/.test(m), m);
    });
    await test('uma falha a meio da transacção desfaz tudo (como antes)', async ()=>{
      const f = novaBase(); const DB = carregarDB(f); await DB.preparar();
      let erro = null;
      try{
        await DB.transacao(['vendas', 'transacoes'], async tx=>{
          await DB.reqToPromise(tx.objectStore('vendas').add({tipo:'ovos'}));
          throw new Error('falha de propósito');
        });
      }catch(e){ erro = e; }
      assert.ok(erro); assert.strictEqual((await DB.getAll('vendas')).length, 0);
    });
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`${ok} passou(ram), ${falhas.length} falhou(aram)`);
  if(falhas.length){ falhas.forEach(n=>console.log('  - ' + n)); process.exitCode = 1; }
  else console.log('✅ Tudo bem — nenhuma regressão detectada.');
})();
