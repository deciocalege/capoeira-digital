'use strict';
/* ============================================================
   TESTES AUTOMATIZADOS — js/sync.js (sincronização entre aparelhos)
   ============================================================
   Cada "aparelho" é um ambiente isolado (a sua própria base de dados, memória do navegador
   e módulos db.js + sync.js) e todos falam com um SERVIDOR FALSO em memória que se comporta
   como as funções do servidor/03-sincronizacao.sql: só aceita registos mais recentes, limita
   datas do futuro, carimba com a hora do servidor e pagina por (data, tabela, id).
   (O SQL verdadeiro foi testado num PostgreSQL à parte: tests/sincronizacao.sql.)

   Como correr:   npm install --no-save fake-indexeddb   e depois   node tests/sync.test.js
   ============================================================ */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let fake = null;
try{ fake = require('fake-indexeddb'); }catch(e){}
if(!fake){ console.log('  ⏭  testes da sincronização saltados (precisam de: npm install --no-save fake-indexeddb)'); process.exit(0); }

const dirJs = path.join(__dirname, '..', 'js');
const fonte = n => fs.readFileSync(path.join(dirJs, n + '.js'), 'utf8');
const dormir = ms=>new Promise(r=>setTimeout(r, ms));

/* ---------- servidor falso (espelha o 03-sincronizacao.sql) ---------- */
function criarServidor(){
  const linhas = new Map();                      // granja|tabela|id → registo
  let relogio = Date.now() - 1000;               // o servidor tem o relógio certo (e avança 1 s por operação)
  let desvio = 0;                                // para simular um servidor/aparelho desacertados
  const estado = {offline:false, erro:null, recusados:0, chamadas:{enviar:0, receber:0, resumo:0}};
  const agoraServidor = ()=>Math.max(Date.now(), relogio) + desvio;
  const carimbo = ()=>{ relogio = Math.max(Date.now(), relogio + 1000); return new Date(relogio + desvio).toISOString().replace('Z', '000+00:00'); };   // como o Postgres: microssegundos + fuso
  const chave = (g, t, i)=>`${g}|${t}|${i}`;
  const cmp = (a, b)=>(a.atualizado_em < b.atualizado_em ? -1 : a.atualizado_em > b.atualizado_em ? 1 : 0) || a.tabela.localeCompare(b.tabela) || a.id.localeCompare(b.id);
  const falha = ()=> estado.offline ? {ok:false, tipo:'offline', mensagem:'Sem ligação ao servidor.'} : (estado.erro ? {ok:false, tipo:estado.erro, mensagem:'erro simulado: ' + estado.erro} : null);
  const TABELAS = ['compartimentos','aves','feedStock','consumo','transacoes','ovosLog','saidasAves','incubacao','misturas','planosAlimentares','saude','pesagens','vendas','revenda','revendaMov'];
  const RESTRITAS = ['transacoes', 'vendas', 'revenda', 'revendaMov'];
  const construir = (papelFn)=>({
    async enviar(granja, regs){
      estado.chamadas.enviar++;
      const f = falha(); if(f) return f;
      for(const r of regs) if(!TABELAS.includes(r.tabela)) return {ok:false, tipo:'erro', mensagem:'tabela inválida: ' + r.tabela};   // tudo ou nada
      const recusadosAntes = regs.length;
      regs = regs.filter(r=>!(papelFn() === 'trabalhador' && RESTRITAS.includes(r.tabela)));          // o servidor ignora o que o papel não pode usar
      estado.recusados += recusadosAntes - regs.length;
      const quando = carimbo();                  // um único "now()" para o lote inteiro
      let aceites = 0, ignorados = 0;
      for(const r of regs){
        const limite = new Date(agoraServidor() + 5 * 60000).toISOString();
        const ts = (r.dados.atualizadoEm || '') > limite ? limite : r.dados.atualizadoEm;
        const dados = {...r.dados, atualizadoEm: ts};
        const k = chave(granja, r.tabela, r.id), atual = linhas.get(k);
        if(!atual || String(atual.dados.atualizadoEm || '') < String(ts)){
          linhas.set(k, {tabela:r.tabela, id:r.id, dados, apagado:!!r.apagado, atualizado_em:quando}); aceites++;
        } else ignorados++;
      }
      return {ok:true, dados:{aceites, ignorados}};
    },
    async receber(granja, ponto, limite){
      estado.chamadas.receber++;
      const f = falha(); if(f) return f;
      const todas = Array.from(linhas.entries()).filter(([k])=>k.startsWith(granja + '|')).map(([, v])=>v).filter(r=>!(papelFn() === 'trabalhador' && RESTRITAS.includes(r.tabela))).sort(cmp);
      const depois = todas.filter(r=>{
        if(!ponto.desde) return true;
        const d = Date.parse(ponto.desde), t = Date.parse(r.atualizado_em);
        if(ponto.tabela == null) return t > d;
        if(t !== d) return t > d;
        return r.tabela > ponto.tabela || (r.tabela === ponto.tabela && r.id > (ponto.id || ''));
      });
      return {ok:true, registos:depois.slice(0, Math.min(Math.max(limite, 1), 1000)).map(r=>({tabela:r.tabela, id:r.id, dados:r.dados, apagado:r.apagado, atualizado_em:r.atualizado_em}))};
    },
    async resumo(granja){
      estado.chamadas.resumo++;
      const f = falha(); if(f) return f;
      const deste = Array.from(linhas.entries()).filter(([k])=>k.startsWith(granja + '|')).map(([, v])=>v);
      const visiveis = deste.filter(r=>!(papelFn() === 'trabalhador' && RESTRITAS.includes(r.tabela)));
      return {ok:true, vivos:visiveis.filter(r=>!r.apagado).length, total:visiveis.length};
    }
  });
  const transporte = construir(()=>'administrador');
  return {linhas, estado, transporte, comPapel:construir, avancar:(ms)=>{ relogio += ms; }, desviar:(ms)=>{ desvio = ms; }, linhasDa:(g)=>Array.from(linhas.entries()).filter(([k])=>k.startsWith(g + '|')).map(([, v])=>v)};
}

/* ---------- um aparelho = ambiente isolado ---------- */
async function criarAparelho(servidor, nome, papelInicial){
  const armazem = {};
  const factory = new fake.IDBFactory();
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, setInterval, clearInterval, EventTarget, CustomEvent, URL, Blob, crypto: require('crypto').webcrypto,
    structuredClone, indexedDB: factory, IDBKeyRange: fake.IDBKeyRange,
    localStorage: {getItem:k=>(k in armazem ? armazem[k] : null), setItem:(k, v)=>{ armazem[k] = String(v); }, removeItem:k=>{ delete armazem[k]; }},
    navigator: {onLine:true},
    window: {indexedDB:factory, addEventListener(){}},
    document: {visibilityState:'visible', addEventListener(){}, createElement:()=>({click(){}}), body:{appendChild(){}}},
    Util: {dataISO:d=>d.toISOString().slice(0, 10), hoje:()=>new Date().toISOString().slice(0, 10), toast(){}}
  });
  ctx.BroadcastChannel = undefined;
  vm.runInContext(fonte('db') + '\n;globalThis.__DB = DB;', ctx, {filename:'db.js'});
  vm.runInContext(fonte('sync') + '\n;globalThis.__Sync = Sync;', ctx, {filename:'sync.js'});
  const DB = ctx.__DB, Sync = ctx.__Sync;
  await DB.preparar();
  await DB.iniciarCriacao('vazia');
  const papel = {actual: papelInicial || 'administrador'};
  Sync.definirTransporte(servidor.comPapel(()=>papel.actual));
  Sync.definirPapel(()=>papel.actual);
  return {nome, DB, Sync, ctx, armazem, mudarPapel:(p)=>{ papel.actual = p; }, offline:(v)=>{ ctx.navigator.onLine = !v; },
    lista: async t=>(await DB.getAll(t)), cfg:()=>JSON.parse(armazem['capoeira-sync'] || 'null')};
}
const GRANJA = 'granja-1';
const ids = lista=>lista.map(r=>r.id).sort();

let ok = 0; const falhas = [];
async function test(nome, fn){
  try{ await fn(); ok++; console.log('  ✅ ' + nome); }
  catch(e){ falhas.push(nome); console.log('  ❌ ' + nome + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
}

(async()=>{
  console.log('\nLigar e trazer dados');
  await test('"enviar": o telemóvel envia tudo ao servidor vazio; o computador novo "recebe" e fica igual', async ()=>{
    const srv = criarServidor();
    const tel = await criarAparelho(srv, 'telemóvel'), pc = await criarAparelho(srv, 'computador');
    const c = await tel.DB.add('compartimentos', {nome:'Galinheiro'});
    const a = await tel.DB.add('aves', {compartimentoId:c, especie:'Galinha Sasso', qtd:5});
    const r1 = await tel.Sync.ligar({id:GRANJA, nome:'Capoeira'}, 'enviar');
    assert.strictEqual(r1.ok, true); assert.strictEqual(r1.enviados, 2);
    assert.strictEqual(srv.linhasDa(GRANJA).length, 2);
    const r2 = await pc.Sync.ligar({id:GRANJA, nome:'Capoeira'}, 'receber');
    assert.strictEqual(r2.aplicados, 2);
    const av = await pc.lista('aves'); assert.strictEqual(av.length, 1);
    assert.strictEqual(av[0].id, a); assert.strictEqual(av[0].compartimentoId, c); assert.strictEqual(av[0].qtd, 5);
    assert.strictEqual(JSON.stringify((await tel.lista('aves'))[0]), JSON.stringify(av[0]));   // registo idêntico, incluindo carimbos
  });
  await test('resumoParaLigar diz o que há aqui e no servidor', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel'), pc = await criarAparelho(srv, 'pc');
    await tel.DB.add('compartimentos', {nome:'X'}); await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar');
    const r = await pc.Sync.resumoParaLigar(GRANJA);
    assert.strictEqual(r.local, 0); assert.strictEqual(r.servidor.vivos, 1); assert.strictEqual(r.erro, null);
  });

  console.log('\nAlterações a passar de um aparelho para o outro');
  await test('editar e apagar num aparelho aparecem no outro', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel'), pc = await criarAparelho(srv, 'pc');
    const id = await tel.DB.add('ovosLog', {data:'2026-10-26', qtd:4});
    await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); await pc.Sync.ligar({id:GRANJA, nome:'C'}, 'receber');
    const o = await pc.DB.get('ovosLog', id); await pc.DB.put('ovosLog', {...o, qtd:9}); await pc.Sync.sincronizar();
    await tel.Sync.sincronizar();
    assert.strictEqual((await tel.DB.get('ovosLog', id)).qtd, 9);
    await tel.DB.del('ovosLog', id); await tel.Sync.sincronizar(); await pc.Sync.sincronizar();
    assert.strictEqual((await pc.lista('ovosLog')).length, 0);                           // apagado aqui, apagado lá
    assert.strictEqual(srv.linhasDa(GRANJA).find(r=>r.id === id).apagado, true);          // o servidor guarda a marca
  });
  await test('o servidor não é pedido duas vezes em vão: sem mudanças, nada é alterado no servidor (sem "eco")', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel'), pc = await criarAparelho(srv, 'pc');
    await tel.DB.add('ovosLog', {qtd:1}); await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); await pc.Sync.ligar({id:GRANJA, nome:'C'}, 'receber');
    await pc.Sync.sincronizar(); await tel.Sync.sincronizar(); await pc.Sync.sincronizar();
    const antes = JSON.stringify(srv.linhasDa(GRANJA));
    await tel.Sync.sincronizar(); await pc.Sync.sincronizar(); await tel.Sync.sincronizar();
    assert.strictEqual(JSON.stringify(srv.linhasDa(GRANJA)), antes);
    assert.strictEqual(await pc.Sync.pendentes(), 0);
  });

  console.log('\nConflitos: o mais recente ganha');
  await test('dois aparelhos editam o mesmo registo sem internet: fica a edição MAIS RECENTE nos dois', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel'), pc = await criarAparelho(srv, 'pc');
    const id = await tel.DB.add('ovosLog', {qtd:1});
    await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); await pc.Sync.ligar({id:GRANJA, nome:'C'}, 'receber');
    tel.offline(true); pc.offline(true);
    await tel.DB.put('ovosLog', {...(await tel.DB.get('ovosLog', id)), qtd:10});
    await dormir(15);
    await pc.DB.put('ovosLog', {...(await pc.DB.get('ovosLog', id)), qtd:20});            // a mais recente
    tel.offline(false); pc.offline(false);
    await pc.Sync.sincronizar(); await tel.Sync.sincronizar(); await pc.Sync.sincronizar();
    assert.strictEqual((await tel.DB.get('ovosLog', id)).qtd, 20);
    assert.strictEqual((await pc.DB.get('ovosLog', id)).qtd, 20);
    assert.strictEqual(srv.linhasDa(GRANJA).find(r=>r.id === id).dados.qtd, 20);
  });
  await test('...e a ordem de chegada ao servidor não interessa (a edição antiga chega depois e é ignorada)', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel'), pc = await criarAparelho(srv, 'pc');
    const id = await tel.DB.add('ovosLog', {qtd:1});
    await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); await pc.Sync.ligar({id:GRANJA, nome:'C'}, 'receber');
    tel.offline(true); pc.offline(true);
    await pc.DB.put('ovosLog', {...(await pc.DB.get('ovosLog', id)), qtd:20});            // 1.º (mais antiga)
    await dormir(15);
    await tel.DB.put('ovosLog', {...(await tel.DB.get('ovosLog', id)), qtd:10});          // 2.º (mais recente)
    tel.offline(false); pc.offline(false);
    await tel.Sync.sincronizar();                                                          // a mais recente chega primeiro
    await pc.Sync.sincronizar();                                                           // a antiga chega depois e perde
    await tel.Sync.sincronizar();
    assert.strictEqual((await pc.DB.get('ovosLog', id)).qtd, 10);
    assert.strictEqual((await tel.DB.get('ovosLog', id)).qtd, 10);
  });
  await test('um aparelho com o relógio no FUTURO não passa a ganhar sempre (o servidor limita a +5 min)', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel');
    const id = await tel.DB.add('ovosLog', {qtd:1});
    await tel.DB.put('ovosLog', {...(await tel.DB.get('ovosLog', id)), qtd:2, atualizadoEm:'2099-01-01T00:00:00.000Z'});
    // o carimbo é sempre refeito pelo db.js, por isso simula-se enviando directamente um registo "do futuro"
    await srv.transporte.enviar(GRANJA, [{tabela:'ovosLog', id:'x', dados:{id:'x', qtd:1, atualizadoEm:'2099-01-01T00:00:00.000Z'}}]);
    const guardado = srv.linhasDa(GRANJA).find(r=>r.id === 'x').dados.atualizadoEm;
    assert.ok(guardado < new Date(Date.now() + 6 * 60000).toISOString(), 'devia estar limitado a +5 min, está em ' + guardado);
  });

  await test('uma edição feita logo a seguir a receber um registo ganha-lhe SEMPRE, mesmo no mesmo milissegundo', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel'), pc = await criarAparelho(srv, 'pc');
    for(let i = 0; i < 20; i++){
      const id = await tel.DB.add('ovosLog', {qtd:i});
      await tel.Sync.sincronizar().catch(()=>0);
      if(i === 0){ await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); await pc.Sync.ligar({id:GRANJA, nome:'C'}, 'receber'); }
      await tel.Sync.sincronizar(); await pc.Sync.sincronizar();
      const r = await pc.DB.get('ovosLog', id); await pc.DB.put('ovosLog', {...r, qtd:1000 + i});
      assert.ok((await pc.DB.get('ovosLog', id)).atualizadoEm > r.atualizadoEm);
      await pc.Sync.sincronizar(); await tel.Sync.sincronizar();
      assert.strictEqual((await tel.DB.get('ovosLog', id)).qtd, 1000 + i, 'volta ' + i);
    }
  });
  await test('um aparelho com o relógio ATRASADO também vê as suas edições ganharem às versões que já viu', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel'), pc = await criarAparelho(srv, 'pc');
    const id = await tel.DB.add('ovosLog', {qtd:1}); await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); await pc.Sync.ligar({id:GRANJA, nome:'C'}, 'receber');
    pc.ctx.Date = class extends Date { static now(){ return Date.now() - 3600 * 1000; } };    // o relógio do computador está 1 hora atrasado
    await pc.DB.put('ovosLog', {...(await pc.DB.get('ovosLog', id)), qtd:77});
    await pc.Sync.sincronizar(); await tel.Sync.sincronizar();
    assert.strictEqual((await tel.DB.get('ovosLog', id)).qtd, 77);
  });
  await test('detecta e mostra um relógio desacertado (aparelho adiantado/atrasado em relação ao servidor)', async ()=>{
    const certo = criarServidor(); const a = await criarAparelho(certo, 'certo');
    await a.DB.add('ovosLog', {qtd:1}); await a.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar');
    assert.ok(Math.abs(a.Sync.estado().desvioRelogioS) < 5, 'relógio certo: ' + a.Sync.estado().desvioRelogioS);
    const srv = criarServidor(); srv.desviar(-10 * 60000);       // o servidor "está" 10 min atrás → este aparelho está 10 min adiantado
    const tel = await criarAparelho(srv, 'tel');
    await tel.DB.add('ovosLog', {qtd:1}); await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar');
    const d = tel.Sync.estado().desvioRelogioS;
    assert.ok(d > 500 && d < 700, 'desvio: ' + d);
  });

  console.log('\nPapéis: o trabalhador não vê nem envia finanças');
  await test('o trabalhador recebe os registos do dia a dia mas NÃO as finanças, vendas nem revenda', async ()=>{
    const srv = criarServidor(); const adm = await criarAparelho(srv, 'admin'), trab = await criarAparelho(srv, 'trabalhador', 'trabalhador');
    await adm.DB.add('aves', {especie:'Pato Muscovy', qtd:3}); await adm.DB.add('transacoes', {tipo:'receita', valor:100});
    await adm.DB.add('vendas', {tipo:'ovos', valor:50}); await adm.DB.add('revenda', {nome:'Milho'}); await adm.DB.add('revendaMov', {tipo:'compra'});
    await adm.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); assert.strictEqual(srv.linhasDa(GRANJA).length, 5);
    const r = await trab.Sync.ligar({id:GRANJA, nome:'C'}, 'receber'); assert.strictEqual(r.ok, true);
    assert.strictEqual((await trab.lista('aves')).length, 1);
    for(const t of ['transacoes', 'vendas', 'revenda', 'revendaMov']) assert.strictEqual((await trab.lista(t)).length, 0, t);
    const res = await trab.Sync.resumoParaLigar(GRANJA); assert.strictEqual(res.servidor.vivos, 1);       // o resumo também só conta o que ele pode ver
  });
  await test('o trabalhador regista aves/ovos que seguem para o administrador; finanças criadas por engano ficam no aparelho e não partem a sincronização', async ()=>{
    const srv = criarServidor(); const adm = await criarAparelho(srv, 'admin'), trab = await criarAparelho(srv, 'trabalhador', 'trabalhador');
    await adm.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); await trab.Sync.ligar({id:GRANJA, nome:'C'}, 'receber');
    await trab.DB.add('ovosLog', {qtd:12}); await trab.DB.add('transacoes', {tipo:'despesa', valor:1});    // este não pode seguir
    const r = await trab.Sync.sincronizar(); assert.strictEqual(r.ok, true);
    assert.strictEqual(srv.linhasDa(GRANJA).filter(x=>x.tabela === 'transacoes').length, 0);
    assert.strictEqual(srv.linhasDa(GRANJA).filter(x=>x.tabela === 'ovosLog').length, 1);
    await adm.Sync.sincronizar(); assert.strictEqual((await adm.lista('ovosLog')).length, 1);
    assert.strictEqual(await trab.Sync.pendentes(), 0);                                                   // nada fica à espera: o que não pode seguir é ignorado, não fica a falhar
  });
  await test('um trabalhador promovido a administrador passa a receber também as finanças que já existiam', async ()=>{
    const srv = criarServidor(); const adm = await criarAparelho(srv, 'admin'), pessoa = await criarAparelho(srv, 'pessoa', 'trabalhador');
    await adm.DB.add('transacoes', {tipo:'receita', valor:100}); await adm.DB.add('aves', {especie:'X', qtd:1});
    await adm.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); await pessoa.Sync.ligar({id:GRANJA, nome:'C'}, 'receber');
    assert.strictEqual((await pessoa.lista('transacoes')).length, 0);
    pessoa.mudarPapel('administrador'); await pessoa.Sync.sincronizar();
    assert.strictEqual((await pessoa.lista('transacoes')).length, 1);
  });
  await test('um administrador que passa a trabalhador deixa de ter as finanças no aparelho (e o resto fica)', async ()=>{
    const srv = criarServidor(); const pessoa = await criarAparelho(srv, 'pessoa', 'administrador');
    await pessoa.DB.add('transacoes', {tipo:'receita', valor:100}); await pessoa.DB.add('vendas', {tipo:'ovos'}); await pessoa.DB.add('aves', {especie:'X', qtd:2});
    await pessoa.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar');
    pessoa.mudarPapel('trabalhador'); const r = await pessoa.Sync.sincronizar(); assert.strictEqual(r.ok, true);
    assert.strictEqual((await pessoa.lista('transacoes')).length, 0); assert.strictEqual((await pessoa.lista('vendas')).length, 0);
    assert.strictEqual((await pessoa.lista('aves')).length, 1);
    await pessoa.DB.add('ovosLog', {qtd:1}); assert.strictEqual((await pessoa.Sync.sincronizar()).ok, true);   // e continua a sincronizar normalmente
  });

  console.log('\nSem internet e erros');
  await test('sem internet: nada se perde — fica pendente e segue quando volta', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel');
    await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar');
    srv.estado.offline = true;
    await tel.DB.add('ovosLog', {qtd:3}); await tel.DB.add('ovosLog', {qtd:4});
    const r = await tel.Sync.sincronizar();
    assert.strictEqual(r.ok, false); assert.strictEqual(r.tipo, 'offline'); assert.strictEqual(tel.Sync.estado().estado, 'offline');
    assert.strictEqual(await tel.Sync.pendentes(), 2);
    srv.estado.offline = false;
    const r2 = await tel.Sync.sincronizar();
    assert.strictEqual(r2.ok, true); assert.strictEqual(r2.enviados, 2); assert.strictEqual(await tel.Sync.pendentes(), 0);
    assert.strictEqual(tel.Sync.estado().estado, 'ok'); assert.ok(tel.Sync.estado().ultimaSync);
  });
  await test('o aparelho sem rede (navigator.onLine=false) nem tenta falar com o servidor', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel');
    await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); const antes = srv.estado.chamadas.enviar + srv.estado.chamadas.receber;
    tel.offline(true); const r = await tel.Sync.sincronizar();
    assert.strictEqual(r.tipo, 'offline'); assert.strictEqual(srv.estado.chamadas.enviar + srv.estado.chamadas.receber, antes);
  });
  await test('sessão expirada e outros erros do servidor ficam no estado, com mensagem', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel');
    await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar');
    srv.estado.erro = 'sessao'; await tel.Sync.sincronizar(); assert.strictEqual(tel.Sync.estado().estado, 'sessao');
    srv.estado.erro = 'esquema'; await tel.Sync.sincronizar(); assert.strictEqual(tel.Sync.estado().estado, 'erro'); assert.ok(tel.Sync.estado().detalhe);
    srv.estado.erro = null; await tel.Sync.sincronizar(); assert.strictEqual(tel.Sync.estado().estado, 'ok');
  });
  await test('se o envio falha a meio, o que já foi enviado não se repete e o resto segue depois', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel');
    await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar');
    for(let i = 0; i < 450; i++) await tel.DB.add('ovosLog', {qtd:i});
    let n = 0; const base = srv.comPapel(()=>'administrador');
    tel.Sync.definirTransporte({...base, enviar: async (g, r)=>{ if(++n === 2) return {ok:false, tipo:'offline', mensagem:'cortou'}; return base.enviar(g, r); }});
    const r1 = await tel.Sync.sincronizar(); assert.strictEqual(r1.ok, false);
    assert.strictEqual(srv.linhasDa(GRANJA).length, 200);                                 // 1.º lote chegou
    tel.Sync.definirTransporte(base);
    const r2 = await tel.Sync.sincronizar(); assert.strictEqual(r2.ok, true);
    assert.strictEqual(srv.linhasDa(GRANJA).length, 450); assert.strictEqual(r2.enviados, 250);
  });

  console.log('\nQuantidades grandes');
  await test('envia 650 registos em lotes e outro aparelho recebe os 650 (paginação sem perder nem repetir)', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel'), pc = await criarAparelho(srv, 'pc');
    for(let i = 0; i < 650; i++) await tel.DB.add('ovosLog', {qtd:i});
    const r = await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); assert.strictEqual(r.enviados, 650);
    const r2 = await pc.Sync.ligar({id:GRANJA, nome:'C'}, 'receber');
    assert.strictEqual(r2.recebidos, 650); assert.strictEqual(r2.aplicados, 650);
    assert.strictEqual(JSON.stringify(ids(await pc.lista('ovosLog'))), JSON.stringify(ids(await tel.lista('ovosLog'))));
  });
  await test('mais de 500 registos com a MESMA data de servidor (enviados de uma vez) também se recebem completos', async ()=>{
    const srv = criarServidor(); const pc = await criarAparelho(srv, 'pc');
    const lote = Array.from({length:520}, (_, i)=>({tabela:'ovosLog', id:'o' + String(i).padStart(4, '0'), dados:{id:'o' + String(i).padStart(4, '0'), qtd:i, atualizadoEm:'2026-10-26T09:00:00.000Z', criadoEm:'2026-10-26T09:00:00.000Z', apagado:false}}));
    await srv.transporte.enviar(GRANJA, lote);
    const r = await pc.Sync.ligar({id:GRANJA, nome:'C'}, 'receber');
    assert.strictEqual((await pc.lista('ovosLog')).length, 520); assert.strictEqual(r.aplicados, 520);
  });

  console.log('\nO que acontece quando ambos já têm dados');
  await test('"juntar": os dois ficam com tudo', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel'), pc = await criarAparelho(srv, 'pc');
    await tel.DB.add('compartimentos', {nome:'Do telemóvel'}); await pc.DB.add('compartimentos', {nome:'Do computador'});
    await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar');
    await pc.Sync.ligar({id:GRANJA, nome:'C'}, 'juntar'); await tel.Sync.sincronizar();
    for(const d of [tel, pc]) assert.strictEqual(JSON.stringify((await d.lista('compartimentos')).map(c=>c.nome).sort()), '["Do computador","Do telemóvel"]');
  });
  await test('"substituir": os dados do aparelho são trocados pelos do servidor e NADA do que havia é enviado', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel'), pc = await criarAparelho(srv, 'pc');
    await tel.DB.add('compartimentos', {nome:'Verdadeiro'}); await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar');
    await pc.DB.add('compartimentos', {nome:'Lixo de teste'});
    await pc.Sync.ligar({id:GRANJA, nome:'C'}, 'substituir');
    assert.strictEqual(JSON.stringify((await pc.lista('compartimentos')).map(c=>c.nome)), '["Verdadeiro"]');
    assert.strictEqual(srv.linhasDa(GRANJA).length, 1);                                   // o "lixo" não foi para o servidor
    await pc.DB.add('compartimentos', {nome:'Novo no computador'}); await pc.Sync.sincronizar();   // e o que se faz depois já segue
    assert.strictEqual(srv.linhasDa(GRANJA).length, 2);
  });
  await test('não deixa ligar a outra criação sem desligar a primeira', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel');
    await tel.Sync.ligar({id:'g1', nome:'Primeira'}, 'enviar');
    const r = await tel.Sync.ligar({id:'g2', nome:'Segunda'}, 'enviar');
    assert.strictEqual(r.ok, false); assert.ok(/Primeira/.test(r.mensagem));
    tel.Sync.desligar(); assert.strictEqual(tel.Sync.estado().estado, 'inactivo');
    assert.strictEqual((await tel.Sync.ligar({id:'g2', nome:'Segunda'}, 'enviar')).ok, true);
  });
  await test('desligar mantém os dados e para de sincronizar', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel');
    await tel.DB.add('ovosLog', {qtd:1}); await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar');
    tel.Sync.desligar(); await tel.DB.add('ovosLog', {qtd:2});
    const r = await tel.Sync.sincronizar(); assert.strictEqual(r.tipo, 'inactivo');
    assert.strictEqual((await tel.lista('ovosLog')).length, 2); assert.strictEqual(srv.linhasDa(GRANJA).length, 1);
  });

  console.log('\nRobustez');
  await test('duas sincronizações pedidas ao mesmo tempo correm uma de cada vez', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel');
    await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); await tel.DB.add('ovosLog', {qtd:1});
    const antes = srv.estado.chamadas.enviar;
    const [a, b] = await Promise.all([tel.Sync.sincronizar(), tel.Sync.sincronizar()]);
    assert.strictEqual(a, b);                                                              // a mesma operação em curso
    await dormir(700);                                                                     // a repetição agendada no fim
    assert.ok(srv.estado.chamadas.enviar - antes <= 3);
    assert.strictEqual(srv.linhasDa(GRANJA).length, 1);
  });
  await test('uma alteração feita aqui dispara o envio sozinha, passados uns segundos', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel');
    await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar'); tel.Sync.iniciarAutomatico();
    await tel.DB.add('ovosLog', {qtd:7});
    assert.strictEqual(srv.linhasDa(GRANJA).length, 0);
    await dormir(3400);
    assert.strictEqual(srv.linhasDa(GRANJA).length, 1);
  });
  await test('dados que chegam do servidor não fazem o aparelho enviá-los de volta de imediato', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel'), pc = await criarAparelho(srv, 'pc');
    await tel.DB.add('ovosLog', {qtd:1}); await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar');
    pc.Sync.iniciarAutomatico(); await pc.Sync.ligar({id:GRANJA, nome:'C'}, 'receber');
    const antes = srv.estado.chamadas.enviar; await dormir(3400);
    assert.strictEqual(srv.estado.chamadas.enviar, antes);
  });
  await test('o aparelho avisa a app quando chegam dados (para redesenhar a página)', async ()=>{
    const srv = criarServidor(); const tel = await criarAparelho(srv, 'tel'), pc = await criarAparelho(srv, 'pc');
    await pc.Sync.ligar({id:GRANJA, nome:'C'}, 'receber');
    let avisos = []; pc.Sync.aoReceber(d=>avisos.push(d));
    await tel.DB.add('aves', {especie:'X', qtd:1}); await tel.Sync.ligar({id:GRANJA, nome:'C'}, 'enviar');
    await pc.Sync.sincronizar();
    assert.strictEqual(avisos.length, 1); assert.strictEqual(JSON.stringify(avisos[0].stores), '["aves"]'); assert.strictEqual(avisos[0].aplicados, 1);
  });
  await test('registos de tabelas desconhecidas ou estragados são ignorados sem partir nada', async ()=>{
    const srv = criarServidor(); const pc = await criarAparelho(srv, 'pc');
    const r = await pc.DB.aplicarRemotos([{tabela:'naoexiste', id:'1', dados:{id:'1'}}, {tabela:'aves', id:'2'}, null, {tabela:'aves', id:'3', dados:{id:'3', qtd:1, atualizadoEm:'2026-10-26T10:00:00.000Z'}}]);
    assert.strictEqual(r.aplicados, 1); assert.strictEqual((await pc.lista('aves')).length, 1);
  });

  console.log('\n' + '─'.repeat(50));
  console.log(`${ok} passou(ram), ${falhas.length} falhou(aram)`);
  if(falhas.length){ falhas.forEach(n=>console.log('  - ' + n)); process.exitCode = 1; }
  else console.log('✅ Tudo bem — nenhuma regressão detectada.');
  process.exit(process.exitCode || 0);
})();
