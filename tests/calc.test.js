'use strict';
/* ============================================================
   TESTES AUTOMATIZADOS — js/calc.js
   ============================================================
   Como correr:  node tests/calc.test.js
   (a partir da pasta principal do projecto, "capoeira-digital/")

   Não precisa de instalar nada — usa só módulos nativos do
   Node.js (assert) e o próprio js/calc.js, que expõe as suas
   funções puras via `module.exports` quando corre em Node
   (ver o final de js/calc.js — esse bloco é inofensivo no
   navegador, onde `module` não existe).

   Cobre as funções de cálculo: idade, incubação, finanças,
   stock de ração, ordenação de compartimentos e previsão de
   reprodução — incluindo casos que já causaram bugs reais
   (datas inválidas, acentuação/maiúsculas na finalidade das
   aves, dias "parados" na incubação).
   ============================================================ */
const path = require('path');
const assert = require('assert');
const calc = require(path.join(__dirname, '..', 'js', 'calc.js'));

/* ------------ mini test-runner, sem dependências externas ------------ */
let passou = 0, falhou = 0;
const falhas = [];
function test(nome, fn){
  try{
    fn();
    passou++;
    console.log(`  ✅ ${nome}`);
  }catch(e){
    falhou++;
    falhas.push(nome);
    console.log(`  ❌ ${nome}`);
    console.log(`     ${e.message}`);
  }
}
function grupo(titulo){ console.log(`\n${titulo}`); }

/* Data de referência auxiliar para os testes (equivalente ao
   dataMenosDias() usado em js/db.js, mas independente dele). */
function dataMenosDiasTeste(dias){
  const d = new Date();
  d.setDate(d.getDate()-dias);
  return d.toISOString().slice(0,10);
}

/* ============================================================
   daysBetween — nunca deve devolver NaN, mesmo com datas más
   ============================================================ */
grupo('daysBetween()');
test('calcula corretamente a diferença entre duas datas', ()=>{
  assert.strictEqual(calc.Util.diasEntre('2024-01-01', '2024-01-11'), 10);
});
test('devolve 0 (nunca NaN) com datas vazias', ()=>{
  assert.strictEqual(calc.Util.diasEntre('', ''), 0);
});
test('devolve 0 (nunca NaN) com texto inválido', ()=>{
  assert.strictEqual(calc.Util.diasEntre('não é uma data', '2024-01-01'), 0);
});

/* ============================================================
   calcularIdadeCalc / idadeExibicaoAve
   ============================================================ */
grupo('calcularIdadeCalc() / idadeExibicaoAve()');
test('sem data de entrada devolve null', ()=>{
  assert.strictEqual(calc.Calc.idade(''), null);
  assert.strictEqual(calc.Calc.idade(null), null);
});
test('data de hoje devolve "hoje"', ()=>{
  assert.strictEqual(calc.Calc.idade(calc.Util.hoje()), 'hoje');
});
test('data no futuro é sinalizada em vez de dar erro', ()=>{
  const amanha = new Date(); amanha.setDate(amanha.getDate()+5);
  assert.strictEqual(calc.Calc.idade(amanha.toISOString().slice(0,10)), 'data futura');
});
test('idade com dias soltos (menos de um mês) devolve texto em dias', ()=>{
  assert.strictEqual(calc.Calc.idade(dataMenosDiasTeste(5)), '5 dias');
});
test('idadeExibicaoAve usa a data de entrada quando existe', ()=>{
  const txt = calc.Calc.idadeExibicao({dataEntrada: calc.Util.hoje(), idade:'texto antigo'});
  assert.strictEqual(txt, 'hoje');
});
test('idadeExibicaoAve recorre ao texto antigo quando não há data de entrada', ()=>{
  assert.strictEqual(calc.Calc.idadeExibicao({idade:'6 meses'}), '6 meses');
  assert.strictEqual(calc.Calc.idadeExibicao({}), '—');
});

/* ============================================================
   normalizarTexto / ehFinalidadeReproducao — regressão do bug
   de deteção frágil (acentos, maiúsculas, pequenas variações)
   ============================================================ */
grupo('normalizarTexto() / ehFinalidadeReproducao()  [correção de robustez]');
test('normalizarTexto remove acentos e baixa para minúsculas', ()=>{
  assert.strictEqual(calc.Util.normalizarTexto('Reprodução'), 'reproducao');
  assert.strictEqual(calc.Util.normalizarTexto('REPRODUÇÃO'), 'reproducao');
});
test('reconhece "Reprodução" com acento normal', ()=>{
  assert.strictEqual(calc.Calc.ehFinalidadeReproducao('Reprodução'), true);
});
test('reconhece variações sem acento ou com erro de escrita comuns', ()=>{
  assert.strictEqual(calc.Calc.ehFinalidadeReproducao('reproducao'), true);
  assert.strictEqual(calc.Calc.ehFinalidadeReproducao('REPRODUCAO'), true);
  assert.strictEqual(calc.Calc.ehFinalidadeReproducao('Reprodução futura'), true);
  assert.strictEqual(calc.Calc.ehFinalidadeReproducao('Postura/Reprodução'), true);
});
test('reconhece pela palavra "matriz" / "reprodutor(a)" mesmo sem a palavra completa', ()=>{
  assert.strictEqual(calc.Calc.ehFinalidadeReproducao('Matriz'), true);
  assert.strictEqual(calc.Calc.ehFinalidadeReproducao('Reprodutor principal'), true);
});
test('não reconhece finalidades sem relação com reprodução', ()=>{
  assert.strictEqual(calc.Calc.ehFinalidadeReproducao('Abate'), false);
  assert.strictEqual(calc.Calc.ehFinalidadeReproducao('Corte'), false);
  assert.strictEqual(calc.Calc.ehFinalidadeReproducao(''), false);
  assert.strictEqual(calc.Calc.ehFinalidadeReproducao(undefined), false);
});

/* ============================================================
   maturidadeDiasEspecie / previsaoReproducaoCalc
   ============================================================ */
grupo('maturidadeDiasEspecie() / previsaoReproducaoCalc()');
test('patos/patas/Muscovy → 180 dias, mesmo com acentuação diferente', ()=>{
  assert.strictEqual(calc.Calc.maturidadeDiasEspecie('Pato Muscovy'), 180);
  assert.strictEqual(calc.Calc.maturidadeDiasEspecie('PATA MUSCOVY'), 180);
  assert.strictEqual(calc.Calc.maturidadeDiasEspecie('Pato Pequim (marreco)'), 180);
});
test('galinhas/galos e raças conhecidas → 150 dias', ()=>{
  assert.strictEqual(calc.Calc.maturidadeDiasEspecie('Galinha Boschveld'), 150);
  assert.strictEqual(calc.Calc.maturidadeDiasEspecie('Galo misto (Boschveld × Cafrial caipira)'), 150);
  assert.strictEqual(calc.Calc.maturidadeDiasEspecie('Brahma'), 150);
});
test('espécie desconhecida usa valor por omissão (165 dias)', ()=>{
  assert.strictEqual(calc.Calc.maturidadeDiasEspecie('Ave misteriosa'), 165);
});
test('ave sem finalidade de reprodução não tem previsão', ()=>{
  const r = calc.Calc.previsaoReproducao({especie:'Galinha de corte', finalidade:'Abate', dataEntrada:'2024-01-01'});
  assert.strictEqual(r, null);
});
test('ave sem data de entrada não tem previsão', ()=>{
  const r = calc.Calc.previsaoReproducao({especie:'Pato Muscovy', finalidade:'Reprodução'});
  assert.strictEqual(r, null);
});
test('ave já com idade suficiente é marcada como "em idade"', ()=>{
  const r = calc.Calc.previsaoReproducao({especie:'Galinha Boschveld', finalidade:'Reprodução', dataEntrada:dataMenosDiasTeste(400)});
  assert.ok(r);
  assert.strictEqual(r.emIdade, true);
  assert.strictEqual(r.diasFaltam, 0);
});
test('ave jovem devolve dias em falta corretos', ()=>{
  const r = calc.Calc.previsaoReproducao({especie:'Pato Muscovy', finalidade:'Reprodução', dataEntrada:calc.Util.hoje()});
  assert.ok(r);
  assert.strictEqual(r.emIdade, false);
  assert.strictEqual(r.diasFaltam, 180);
});

/* ============================================================
   progressoIncubacaoCalc — nunca deve "parecer parado"
   ============================================================ */
grupo('progressoIncubacaoCalc()');
test('incubação inactiva devolve tudo a zero, sem erro', ()=>{
  const r = calc.Calc.progressoIncubacao({ativa:false});
  assert.deepStrictEqual(r, {diasIncorridos:0, diasFaltam:0, pct:0, terminou:false});
});
test('incubação sem objecto (undefined) não rebenta', ()=>{
  const r = calc.Calc.progressoIncubacao(undefined);
  assert.strictEqual(r.terminou, false);
});
test('a meio da incubação calcula percentagem entre 0 e 100', ()=>{
  const r = calc.Calc.progressoIncubacao({ativa:true, dataInicio:dataMenosDiasTeste(10), diasIncubacao:35});
  assert.strictEqual(r.diasIncorridos, 10);
  assert.strictEqual(r.diasFaltam, 25);
  assert.ok(r.pct > 0 && r.pct < 100);
  assert.strictEqual(r.terminou, false);
});
test('incubação terminada não passa de 100% nem de diasFaltam negativo', ()=>{
  const r = calc.Calc.progressoIncubacao({ativa:true, dataInicio:dataMenosDiasTeste(50), diasIncubacao:35});
  assert.strictEqual(r.pct, 100);
  assert.strictEqual(r.diasFaltam, 0);
  assert.strictEqual(r.terminou, true);
});
test('alterar a duração recalcula os dias em falta de imediato (sem "ficar parado")', ()=>{
  const inc = {ativa:true, dataInicio:dataMenosDiasTeste(10), diasIncubacao:35};
  const antes = calc.Calc.progressoIncubacao(inc);
  const depois = calc.Calc.progressoIncubacao({...inc, diasIncubacao:45});
  assert.strictEqual(antes.diasFaltam, 25);
  assert.strictEqual(depois.diasFaltam, 35);
});

/* ============================================================
   Vários chocos ao mesmo tempo + eclosão
   ============================================================ */
grupo('Incubações múltiplas');
global.Icon = global.Icon || {svg: ()=>''}; // calc.js usa Icon.svg nos textos dos alertas
test('duração 0, vazia ou inválida não dá NaN (assume 35 dias)', ()=>{
  for(const d of [0, '', undefined, NaN]){
    const r = calc.Calc.progressoIncubacao({ativa:true, dataInicio:dataMenosDiasTeste(0), diasIncubacao:d});
    assert.strictEqual(r.diasFaltam, 35);
    assert.ok(!Number.isNaN(r.pct));
  }
});
test('incubacoesAtivas devolve só as activas, a mais próxima do fim primeiro', ()=>{
  const lista = [
    {id:1, ativa:true, dataInicio:dataMenosDiasTeste(5), diasIncubacao:35},
    {id:2, ativa:false, concluida:true, dataInicio:dataMenosDiasTeste(40), diasIncubacao:35},
    {id:3, ativa:true, dataInicio:dataMenosDiasTeste(30), diasIncubacao:35}
  ];
  const r = calc.Calc.incubacoesAtivas(lista);
  assert.deepStrictEqual(r.map(i=>i.id), [3,1]);
});
test('incubacoesConcluidas ordena pela data de conclusão (mais recente primeiro)', ()=>{
  const lista = [
    {id:1, concluida:true, dataConclusao:'2026-01-10'},
    {id:2, concluida:true, dataConclusao:'2026-03-01'},
    {id:3, ativa:true}
  ];
  assert.deepStrictEqual(calc.Calc.incubacoesConcluidas(lista).map(i=>i.id), [2,1]);
});
test('taxaEclosao calcula a percentagem e trata 0 ovos', ()=>{
  assert.strictEqual(calc.Calc.taxaEclosao({numOvos:13, nascidos:10}), 77);
  assert.strictEqual(calc.Calc.taxaEclosao({numOvos:10, nascidos:0}), 0);
  assert.strictEqual(calc.Calc.taxaEclosao({numOvos:0, nascidos:0}), null);
});
test('proximoIdIncubacao não repete ids', ()=>{
  assert.strictEqual(calc.Calc.proximoIdIncubacao([]), 1);
  assert.strictEqual(calc.Calc.proximoIdIncubacao([{id:1},{id:7},{id:3}]), 8);
});
test('alertas aceita uma lista de chocos e nomeia as aves', ()=>{
  const lista = [
    {id:1, ativa:true, dataInicio:dataMenosDiasTeste(40), diasIncubacao:35, aveNomes:['Pata Muscovy (Comp 4)']},
    {id:2, ativa:true, dataInicio:dataMenosDiasTeste(2), diasIncubacao:35}
  ];
  const a = calc.Calc.alertas([], [], lista, [], []);
  assert.strictEqual(a.length, 1);
  assert.ok(a[0].texto.includes('Pata Muscovy'));
});
test('alertas continua a aceitar um único choco (compatibilidade)', ()=>{
  const a = calc.Calc.alertas([], [], {ativa:true, dataInicio:dataMenosDiasTeste(40), diasIncubacao:35}, [], []);
  assert.strictEqual(a.length, 1);
});
test('consumoDiarioEstimado divide pelo período e ignora registos com mais de 30 dias', ()=>{
  assert.strictEqual(calc.Calc.consumoDiarioEstimado([{data:dataMenosDiasTeste(7), kg:20},{data:dataMenosDiasTeste(0), kg:20}]), 5);
  assert.strictEqual(calc.Calc.consumoDiarioEstimado([{data:dataMenosDiasTeste(40), kg:9}]), 0);
});

/* ============================================================
   Finanças: despesas, receitas, saldo, por categoria, por mês
   ============================================================ */
grupo('Finanças');
const transacoesTeste = [
  {tipo:'despesa', categoria:'Alimentação', valor:100, data:'2024-01-05'},
  {tipo:'despesa', categoria:'Alimentação', valor:50,  data:'2024-02-10'},
  {tipo:'despesa', categoria:'Saúde/Vacinas', valor:30, data:'2024-02-15'},
  {tipo:'receita', categoria:'Venda de aves', valor:400, data:'2024-02-20'},
];
test('totalDespesasCalc soma só as despesas', ()=>{
  assert.strictEqual(calc.Calc.totalDespesas(transacoesTeste), 180);
});
test('totalReceitasCalc soma só as receitas', ()=>{
  assert.strictEqual(calc.Calc.totalReceitas(transacoesTeste), 400);
});
test('saldoCalc = receitas - despesas', ()=>{
  assert.strictEqual(calc.Calc.saldo(transacoesTeste), 220);
});
test('despesasPorCategoriaCalc agrupa e ordena do maior para o menor', ()=>{
  const r = calc.Calc.despesasPorCategoria(transacoesTeste);
  assert.deepStrictEqual(r[0], ['Alimentação', 150]);
  assert.deepStrictEqual(r[1], ['Saúde/Vacinas', 30]);
});
test('resumoPorMesCalc agrupa por AAAA-MM e calcula saldo do mês', ()=>{
  const r = calc.Calc.resumoPorMes(transacoesTeste);
  const fev = r.find(m=>m.chave==='2024-02');
  assert.ok(fev);
  assert.strictEqual(fev.despesas, 80);
  assert.strictEqual(fev.receitas, 400);
  assert.strictEqual(fev.saldo, 320);
});
test('resumoPorMesCalc ignora movimentos sem data em vez de rebentar', ()=>{
  const r = calc.Calc.resumoPorMes([{tipo:'despesa', categoria:'X', valor:10, data:''}]);
  assert.deepStrictEqual(r, []);
});

/* ============================================================
   Stock de ração
   ============================================================ */
grupo('Stock de ração');
test('stockAtualCalc subtrai o consumo já registado (por feedStockId)', ()=>{
  const item = {id:1, nome:'Milho partido', kgComprado:50, custoTotal:1350};
  const consumo = [{feedStockId:1, kg:10}, {feedStockId:1, kg:5}, {feedStockId:2, kg:3}];
  assert.strictEqual(calc.Calc.stockAtual(item, consumo), 35);
});
test('stockAtualCalc nunca fica negativo mesmo com consumo a mais', ()=>{
  const item = {id:2, nome:'Soja', kgComprado:5, custoTotal:250};
  const consumo = [{feedStockId:2, kg:20}];
  assert.strictEqual(calc.Calc.stockAtual(item, consumo), 0);
});
test('stockAtualCalc NÃO confunde duas entradas com o mesmo nome mas IDs diferentes (bug corrigido)', ()=>{
  // Cenário descrito: comprou "Milho", consumiu, apagou essa entrada,
  // comprou "Milho" outra vez (ID novo, autoIncrement nunca repete).
  // O consumo antigo (ligado ao ID 1, já apagado) não pode "contar"
  // contra o stock da compra nova (ID 7).
  const itemNovo = {id:7, nome:'Milho', kgComprado:80, custoTotal:2000};
  const consumoDaCompraAntiga = [{feedStockId:1, item:'Milho', kg:10}];
  assert.strictEqual(calc.Calc.stockAtual(itemNovo, consumoDaCompraAntiga), 80);
});
test('stockAtualCalc usa o nome só como reserva, para consumo antigo sem feedStockId', ()=>{
  const item = {id:3, nome:'Farelo de trigo', kgComprado:25, custoTotal:650};
  const consumoAntigoSemId = [{item:'Farelo de trigo', kg:5}]; // registo de antes desta correção
  assert.strictEqual(calc.Calc.stockAtual(item, consumoAntigoSemId), 20);
});
test('custoPorKg calcula o preço unitário', ()=>{
  assert.strictEqual(calc.Calc.custoPorKg({custoTotal:1350, kgComprado:50}), 27);
});

grupo('validarSexagemAve()');
test('aceita quando Machos + Fêmeas é igual ao Total', ()=>{
  assert.strictEqual(calc.Validacao.sexagemAve(5, 3, 2).valido, true);
});
test('aceita quando Machos + Fêmeas é menor que o Total (sexo não identificado)', ()=>{
  assert.strictEqual(calc.Validacao.sexagemAve(5, 1, 1).valido, true);
});
test('rejeita quando Machos + Fêmeas ultrapassa o Total (o bug reportado: 4 e 1 com total 4)', ()=>{
  const r = calc.Validacao.sexagemAve(4, 4, 1);
  assert.strictEqual(r.valido, false);
  assert.match(r.motivo, /Machos \+ Fêmeas \(5\) não pode ultrapassar o Total \(4\)/);
});
test('rejeita valores negativos', ()=>{
  assert.strictEqual(calc.Validacao.sexagemAve(5, -1, 2).valido, false);
  assert.strictEqual(calc.Validacao.sexagemAve(-1, 1, 2).valido, false);
});

/* ============================================================
   Ordenação numérica de compartimentos
   ============================================================ */
grupo('ordenarCompartimentosCalc()');
test('ordena "Compartimento 2" antes de "Compartimento 10" (não alfabeticamente)', ()=>{
  const comps = [{nome:'Compartimento 10'}, {nome:'Compartimento 2'}, {nome:'Compartimento 1'}];
  const r = calc.Calc.ordenarCompartimentos(comps).map(c=>c.nome);
  assert.deepStrictEqual(r, ['Compartimento 1', 'Compartimento 2', 'Compartimento 10']);
});
test('compartimentos sem número no nome vão para o fim, sem erro', ()=>{
  const comps = [{nome:'Quarentena'}, {nome:'Compartimento 1'}];
  const r = calc.Calc.ordenarCompartimentos(comps).map(c=>c.nome);
  assert.deepStrictEqual(r, ['Compartimento 1', 'Quarentena']);
});
test('não mistura o array original passado como argumento (sem efeitos secundários)', ()=>{
  const original = [{nome:'Compartimento 3'}, {nome:'Compartimento 1'}];
  const copia = original.map(c=>({...c}));
  calc.Calc.ordenarCompartimentos(original);
  assert.deepStrictEqual(original, copia);
});

/* ============================================================
   Postura de ovos por fêmea/grupo
   ============================================================ */
grupo('ultimosMesesGraficoCalc()');
test('com só 1 mês de dados, devolve sempre 6 meses (preenche o resto com zero)', ()=>{
  const transacoes = [{tipo:'despesa', valor:2250, data:'2026-08-05'}];
  const r = calc.Calc.ultimosMesesGrafico(transacoes, 6);
  assert.strictEqual(r.length, 6);
  assert.strictEqual(r[5].chave, '2026-08');
  assert.strictEqual(r[5].despesas, 2250);
  // Os 5 meses anteriores devem estar a zero, não ausentes
  assert.deepStrictEqual(r.slice(0,5).map(m=>m.despesas), [0,0,0,0,0]);
});
test('mostra sempre os N meses mais RECENTES, em ordem cronológica (mais antigo primeiro)', ()=>{
  const transacoes = [
    {tipo:'despesa', valor:100, data:'2025-01-10'}, // muito antigo — não deve aparecer numa janela de 6
    {tipo:'despesa', valor:200, data:'2026-06-10'},
    {tipo:'despesa', valor:300, data:'2026-07-10'},
    {tipo:'despesa', valor:400, data:'2026-08-10'},
  ];
  const r = calc.Calc.ultimosMesesGrafico(transacoes, 6);
  const chaves = r.map(m=>m.chave);
  assert.deepStrictEqual(chaves, ['2026-03','2026-04','2026-05','2026-06','2026-07','2026-08']);
  assert.strictEqual(r[r.length-1].chave, '2026-08'); // o mais recente fica no fim (ordem cronológica)
  assert.strictEqual(r.find(m=>m.chave==='2025-01'), undefined); // o muito antigo fica fora da janela
});

grupo('posturaPorAveCalc()');
test('agrupa por ave quando aveId está definido', ()=>{
  const aves = [{id:1, especie:'Pata Muscovy', compartimentoId:9}];
  const comps = [{id:9, nome:'Compartimento 4'}];
  const ovos = [{aveId:1, qtd:5}, {aveId:1, qtd:3}];
  const r = calc.Calc.posturaPorAve(ovos, aves, comps);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].total, 8);
  assert.strictEqual(r[0].label, 'Pata Muscovy — Compartimento 4');
});
test('registos antigos sem aveId ficam agrupados como "(sem fêmea definida)"', ()=>{
  const r = calc.Calc.posturaPorAve([{compartimento:'Compartimento 4', qtd:2}], [], []);
  assert.strictEqual(r[0].label, 'Compartimento 4 (sem fêmea definida)');
  assert.strictEqual(r[0].total, 2);
});

/* ============================================================
   RESUMO FINAL
   ============================================================ */
console.log('\n' + '─'.repeat(50));
console.log(`${passou} passou(ram), ${falhou} falhou(aram) — de ${passou+falhou} testes no total`);
if(falhou>0){
  console.log('\nTestes falhados:');
  falhas.forEach(n=>console.log(`  - ${n}`));
  process.exitCode = 1;
} else {
  console.log('✅ Tudo bem — nenhuma regressão detectada.');
}
