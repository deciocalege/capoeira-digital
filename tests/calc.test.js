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
   Indicadores do negócio
   ============================================================ */
grupo('indicadoresNegocio()');
const dadosInd = {
  aves:[{id:1, qtd:18}, {id:2, qtd:2}],
  saidasAves:[
    {motivo:'morte', qtd:2, data:dataMenosDiasTeste(5)},
    {motivo:'morte', qtd:1, data:dataMenosDiasTeste(60)},
    {motivo:'venda', qtd:7, data:dataMenosDiasTeste(10)}
  ],
  feedStock:[{id:1, nome:'Milho', kgComprado:10, custoTotal:100}],
  consumo:[
    {feedStockId:1, item:'Milho', kg:4, data:dataMenosDiasTeste(2)},
    {feedStockId:1, item:'Milho', kg:3, data:dataMenosDiasTeste(90)}
  ],
  ovosLog:[{qtd:20, data:dataMenosDiasTeste(3)}, {qtd:50, data:dataMenosDiasTeste(70)}],
  transacoes:[
    {tipo:'receita', valor:500, data:dataMenosDiasTeste(4)},
    {tipo:'despesa', valor:200, data:dataMenosDiasTeste(6)},
    {tipo:'despesa', valor:999, data:dataMenosDiasTeste(100)}
  ],
  incubacao:[
    {id:1, concluida:true, numOvos:10, nascidos:8},
    {id:2, concluida:true, numOvos:10, nascidos:4},
    {id:3, ativa:true, numOvos:50}
  ]
};
test('mortalidade usa aves actuais + saídas como base', ()=>{
  const r = calc.Calc.indicadoresNegocio(dadosInd, 30);
  assert.strictEqual(r.mortas, 3);
  assert.strictEqual(Math.round(r.mortalidadePct*100)/100, 3/(20+10)*100);
  assert.strictEqual(r.mortas30, 2);
});
test('custo da ração só conta o período e usa o custo por kg', ()=>{
  const r = calc.Calc.indicadoresNegocio(dadosInd, 30);
  assert.strictEqual(r.custoRacao, 40);
  assert.strictEqual(r.custoRacaoPorAve, 2);
  assert.strictEqual(r.ovos, 20);
  assert.strictEqual(r.custoRacaoPorOvo, 2);
});
test('eclosão média é ponderada pelos ovos e ignora chocos em curso', ()=>{
  const r = calc.Calc.indicadoresNegocio(dadosInd, 30);
  assert.strictEqual(r.chocosConcluidos, 2);
  assert.strictEqual(r.eclosaoPct, 60);
});
test('saldo do período só inclui movimentos recentes', ()=>{
  const r = calc.Calc.indicadoresNegocio(dadosInd, 30);
  assert.strictEqual(r.receitasPeriodo, 500);
  assert.strictEqual(r.despesasPeriodo, 200);
  assert.strictEqual(r.saldoPeriodo, 300);
});
test('sem dados devolve null em vez de NaN/Infinity', ()=>{
  const r = calc.Calc.indicadoresNegocio({}, 30);
  assert.strictEqual(r.mortalidadePct, null);
  assert.strictEqual(r.custoRacaoPorAve, null);
  assert.strictEqual(r.custoRacaoPorOvo, null);
  assert.strictEqual(r.eclosaoPct, null);
  assert.strictEqual(r.saldoPeriodo, 0);
});

/* ============================================================
   Exportação CSV
   ============================================================ */
grupo('Exportação CSV');
test('celulaCSV: números com vírgula decimal, aspas e ponto e vírgula protegidos', ()=>{
  assert.strictEqual(calc.Calc.celulaCSV(12.5), '12,5');
  assert.strictEqual(calc.Calc.celulaCSV(null), '');
  assert.strictEqual(calc.Calc.celulaCSV('ração; milho'), '"ração; milho"');
  assert.strictEqual(calc.Calc.celulaCSV('disse "olá"'), '"disse ""olá"""');
  assert.strictEqual(calc.Calc.celulaCSV('linha1\nlinha2'), '"linha1\nlinha2"');
});
test('celulaCSV: texto que parece fórmula leva apóstrofo; números negativos não', ()=>{
  assert.strictEqual(calc.Calc.celulaCSV('=1+1'), "'=1+1");
  assert.strictEqual(calc.Calc.celulaCSV('@SOMA(A1)'), "'@SOMA(A1)");
  assert.strictEqual(calc.Calc.celulaCSV(-5), '-5');
});
test('paraCSV junta cabeçalho e linhas com ; e CRLF', ()=>{
  assert.strictEqual(calc.Calc.paraCSV(['A','B'], [[1,'x'],[2.5,'y']]), 'A;B\r\n1;x\r\n2,5;y');
});
test('conjuntosCSV: todas as tabelas têm linhas com o mesmo nº de colunas do cabeçalho', ()=>{
  const d = {
    compartimentos:[{id:1,nome:'C1'}],
    aves:[{id:1,compartimentoId:1,especie:'Pato',qtd:5,machos:1,femeas:4,dataEntrada:'2026-01-01',finalidade:'Reprodução'}],
    saidasAves:[{compartimentoId:1,especie:'Pato',qtd:1,machos:0,femeas:1,motivo:'venda',valor:300,data:'2026-02-01'}],
    feedStock:[{id:1,nome:'Milho',kgComprado:10,custoTotal:100}],
    consumo:[{feedStockId:1,item:'Milho',kg:2,data:'2026-02-02',mistura:'A'}],
    ovosLog:[{aveId:1,qtd:3,data:'2026-02-03'},{aveId:99,qtd:2,data:'2026-02-04'},{qtd:1,data:'2026-02-05',compartimento:'C1'}],
    transacoes:[{tipo:'despesa',categoria:'Alimentação',desc:'=cmd',valor:50,data:'2026-02-06'}],
    incubacao:[{id:1,concluida:true,numOvos:10,nascidos:7,dataInicio:'2026-01-01',diasIncubacao:35,aveNomes:['Pato (C1)'],destinoNome:'C1'},{id:2,ativa:true,numOvos:5,dataInicio:'2026-03-01',diasIncubacao:28}],
    saude:[{id:1,tipo:'Vacina',produto:'Newcastle',loteNome:'Pato (10)',data:'2026-02-10',feito:true,dataFeito:'2026-02-11',custo:120,repetirDias:30,notas:'1.ª dose'}],
    pesagens:[{id:1,loteNome:'Pato (10)',data:'2026-02-12',pesoMedioG:850,amostra:5}],
    vendas:[{id:1,data:'2026-02-14',tipo:'ovos',produto:'Ovos',qtd:2,unidade:'dúzia',qtdBase:24,valor:120,cliente:'Maria'}],
    revenda:[{id:1,nome:'Carvão',unidade:'saco',precoVenda:150,stockMinimo:2}],
    revendaMov:[{id:1,produtoId:1,tipo:'compra',data:'2026-02-01',qtd:10,valor:1000,pessoa:'Fornecedor'},{id:2,produtoId:1,tipo:'venda',data:'2026-02-05',qtd:3,valor:450}]
  };
  const conjuntos = calc.Calc.conjuntosCSV(d);
  assert.strictEqual(conjuntos.length, 12);
  conjuntos.forEach(c=>{
    assert.ok(c.linhas.length>0, c.id+' sem linhas');
    c.linhas.forEach(l=>assert.strictEqual(l.length, c.cabecalhos.length, c.id));
  });
  const csv = calc.Calc.paraCSV(conjuntos[0].cabecalhos, conjuntos[0].linhas);
  assert.ok(csv.includes("'=cmd"));
  const ovos = conjuntos.find(c=>c.id==='ovos').linhas;
  assert.ok(ovos.some(l=>l[2]==='(ave removida)') && ovos.some(l=>l[2]==='(sem fêmea definida)'));
  assert.strictEqual(conjuntos.find(c=>c.id==='chocos').linhas[0][8], 70);
});
test('conjuntosCSV sem dados não rebenta', ()=>{
  const r = calc.Calc.conjuntosCSV({});
  assert.strictEqual(r.length, 12);
  r.forEach(c=>assert.strictEqual(c.linhas.length, 0));
});

/* ============================================================
   Plano alimentar, stock por produto e consumo automático
   ============================================================ */
grupo('Plano alimentar');
global.Icon = global.Icon || {svg: ()=>''};
const C = calc.Calc;
const planoPatinhos = [
  {especie:'Pato Muscovy', produto:'Ração A1', diaInicio:0, diaFim:29, gramas:50},
  {especie:'Pato Muscovy', produto:'Ração A2', diaInicio:30, diaFim:null, gramas:100}
];
test('produtosStock soma compras do mesmo nome e leva o remanescente para a compra seguinte', ()=>{
  const stock = [
    {id:1, nome:'Ração A1', kgComprado:25, custoTotal:500, dataCompra:'2026-09-01'},
    {id:2, nome:'ração a1 ', kgComprado:25, custoTotal:700, dataCompra:'2026-09-20'}
  ];
  const consumo = [{feedStockId:1, item:'Ração A1', kg:20}, {feedStockId:2, item:'Ração A1', kg:10}];
  const p = C.produtosStock(stock, consumo);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].kgComprado, 50);
  assert.strictEqual(p[0].restante, 20);
  assert.strictEqual(p[0].custoMedioKg, 24);
  assert.strictEqual(p[0].primeiraCompra, '2026-09-01');
});
test('produtosStock: consumo acima do comprado aparece como excedente', ()=>{
  const p = C.produtosStock([{id:1, nome:'A1', kgComprado:10, custoTotal:10}], [{feedStockId:1, item:'A1', kg:12}]);
  assert.strictEqual(p[0].restante, 0);
  assert.strictEqual(p[0].excedente, 2);
});
test('faseNaIdade escolhe A1 até ao dia 29 e A2 a partir do dia 30', ()=>{
  assert.strictEqual(C.faseNaIdade(planoPatinhos, 0).produto, 'Ração A1');
  assert.strictEqual(C.faseNaIdade(planoPatinhos, 29).produto, 'Ração A1');
  assert.strictEqual(C.faseNaIdade(planoPatinhos, 30).produto, 'Ração A2');
  assert.strictEqual(C.faseNaIdade(planoPatinhos, 400).produto, 'Ração A2');
  assert.strictEqual(C.faseNaIdade(planoPatinhos, -1), null);
});
test('previsaoConsumo: 10 patinhos durante 30 dias com A1 a 50 g = 15 kg', ()=>{
  const r = C.previsaoConsumo(planoPatinhos.slice(0,1), 10, 0, 30, []);
  assert.strictEqual(r.totalKg, 15);
  assert.strictEqual(r.porFase.length, 1);
});
test('previsaoConsumo atravessa as fases e calcula o custo com o preço médio', ()=>{
  const prods = C.produtosStock([
    {id:1, nome:'Ração A1', kgComprado:10, custoTotal:200, dataCompra:'2026-09-01'},
    {id:2, nome:'Ração A2', kgComprado:10, custoTotal:300, dataCompra:'2026-09-01'}], []);
  const r = C.previsaoConsumo(planoPatinhos, 10, 20, 20, prods); // dias 20..39
  assert.strictEqual(r.porFase[0].dias, 10);   // A1: dias 20-29 -> 10*0.5 = 5 kg
  assert.strictEqual(r.porFase[0].kg, 5);
  assert.strictEqual(r.porFase[1].kg, 10);     // A2: dias 30-39 -> 10*1 = 10 kg
  assert.strictEqual(r.totalKg, 15);
  assert.strictEqual(r.custo, 5*20 + 10*30);
  assert.strictEqual(r.custoCompleto, true);
});
test('previsaoConsumo conta os dias sem fase definida', ()=>{
  const r = C.previsaoConsumo([{produto:'X', diaInicio:5, diaFim:9, gramas:100}], 1, 0, 10, []);
  assert.strictEqual(r.diasSemFase, 5);
  assert.strictEqual(r.totalKg, 0.5);
});
test('planoDoLote: ração só do lote substitui o plano da espécie', ()=>{
  const lote = {especie:'Pato Muscovy', racaoProduto:'Ração X', consumoGramas:40};
  const p = C.planoDoLote(lote, planoPatinhos);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].produto, 'Ração X');
  assert.strictEqual(C.planoDoLote({especie:'pato muscovy'}, planoPatinhos).length, 2);
});
test('idade do lote soma a idade que já tinha ao entrar', ()=>{
  const lote = {dataEntrada:'2026-10-01', idadeEntradaDias:10};
  assert.strictEqual(C.idadeLoteEm(lote, '2026-10-06'), 15);
});
test('alertasFases avisa quando os patinhos chegam aos 30 dias e antes da troca', ()=>{
  const lote = {id:1, especie:'Pato Muscovy', qtd:10, dataEntrada:'2026-09-01'};
  const noDia30 = C.alertasFases([lote], planoPatinhos, '2026-10-01');
  assert.strictEqual(noDia30.length, 1);
  assert.ok(noDia30[0].texto.includes('30 dias') && noDia30[0].texto.includes('Ração A2'));
  const antes = C.alertasFases([lote], planoPatinhos, '2026-09-29'); // idade 28
  assert.strictEqual(antes.length, 1);
  assert.ok(antes[0].texto.includes('faltam 2'));
  assert.strictEqual(C.alertasFases([lote], planoPatinhos, '2026-09-10').length, 0);
  assert.strictEqual(C.alertasFases([lote], planoPatinhos, '2026-12-01').length, 0);
});
test('gerarConsumoAutomatico: só a partir da 1.ª compra, com a fase certa de cada dia', ()=>{
  const lote = {id:1, especie:'Pato Muscovy', qtd:10, dataEntrada:'2026-09-01', autoDesde:'2026-09-01'};
  const stock = [
    {id:1, nome:'Ração A1', kgComprado:50, custoTotal:1000, dataCompra:'2026-09-03'},
    {id:2, nome:'Ração A2', kgComprado:50, custoTotal:1500, dataCompra:'2026-09-25'}];
  const novos = C.gerarConsumoAutomatico({aves:[lote], planosAlimentares:planoPatinhos, consumo:[], feedStock:stock}, '2026-10-02');
  // A1: 03/09..30/09 (idade 2..29) = 28 dias x 0,5 kg ; A2: 01/10..02/10 (idade 30..31) = 2 dias x 1 kg
  const a1 = novos.filter(n=>n.item==='Ração A1'), a2 = novos.filter(n=>n.item==='Ração A2');
  assert.strictEqual(a1.length, 28);
  assert.strictEqual(a1[0].data, '2026-09-03');
  assert.strictEqual(a1[0].kg, 0.5);
  assert.strictEqual(a2.length, 2);
  assert.strictEqual(a2[0].data, '2026-10-01');
  assert.strictEqual(a2[0].kg, 1);
  assert.ok(novos.every(n=>n.auto===true && n.loteId===1));
});
test('gerarConsumoAutomatico é idempotente e respeita lançamentos manuais', ()=>{
  const lote = {id:1, especie:'Pato Muscovy', qtd:10, dataEntrada:'2026-09-28', autoDesde:'2026-09-28'};
  const stock = [{id:1, nome:'Ração A1', kgComprado:50, custoTotal:1000, dataCompra:'2026-09-28'}];
  const dados = {aves:[lote], planosAlimentares:planoPatinhos, consumo:[{data:'2026-09-29', item:'Ração A1', kg:2}], feedStock:stock};
  const primeira = C.gerarConsumoAutomatico(dados, '2026-10-01');
  assert.deepStrictEqual(primeira.map(n=>n.data), ['2026-09-28','2026-09-30','2026-10-01']); // 29/09 foi manual
  dados.consumo = dados.consumo.concat(primeira);
  assert.strictEqual(C.gerarConsumoAutomatico(dados, '2026-10-01').length, 0);
});
test('gerarConsumoAutomatico ignora lotes sem consumo automático, sem plano ou sem stock', ()=>{
  const stock = [{id:1, nome:'Ração A1', kgComprado:50, custoTotal:1000, dataCompra:'2026-09-01'}];
  const base = {planosAlimentares:planoPatinhos, consumo:[], feedStock:stock};
  assert.strictEqual(C.gerarConsumoAutomatico({...base, aves:[{id:1, especie:'Pato Muscovy', qtd:10, dataEntrada:'2026-09-30'}]}, '2026-10-01').length, 0);
  assert.strictEqual(C.gerarConsumoAutomatico({...base, aves:[{id:1, especie:'Ganso', qtd:10, dataEntrada:'2026-09-30', autoDesde:'2026-09-30'}]}, '2026-10-01').length, 0);
  assert.strictEqual(C.gerarConsumoAutomatico({...base, feedStock:[], aves:[{id:1, especie:'Pato Muscovy', qtd:10, dataEntrada:'2026-09-30', autoDesde:'2026-09-30'}]}, '2026-10-01').length, 0);
});
test('gerarConsumoAutomatico nunca recua mais de 90 dias', ()=>{
  const lote = {id:1, especie:'Pato Muscovy', qtd:1, dataEntrada:'2025-01-01', autoDesde:'2025-01-01', racaoProduto:'Ração A1', consumoGramas:10};
  const stock = [{id:1, nome:'Ração A1', kgComprado:50, custoTotal:1000, dataCompra:'2025-01-01'}];
  const novos = C.gerarConsumoAutomatico({aves:[lote], planosAlimentares:[], consumo:[], feedStock:stock}, '2026-10-01');
  assert.strictEqual(novos.length, 90);
});
test('consumoPlaneadoDiarioKg soma só os lotes que hoje usam esse produto', ()=>{
  const aves = [
    {id:1, especie:'Pato Muscovy', qtd:10, dataEntrada:'2026-09-25', autoDesde:'2026-09-25'},  // idade 6 -> A1: 0,5 kg
    {id:2, especie:'Pato Muscovy', qtd:4, dataEntrada:'2026-08-01', autoDesde:'2026-08-01'}    // idade 60 -> A2
  ];
  assert.strictEqual(C.consumoPlaneadoDiarioKg('Ração A1', aves, planoPatinhos, '2026-10-01'), 0.5);
  assert.strictEqual(C.consumoPlaneadoDiarioKg('ração a2', aves, planoPatinhos, '2026-10-01'), 0.4);
});
test('fasesSobrepoem detecta fases que cobrem os mesmos dias', ()=>{
  assert.strictEqual(C.fasesSobrepoem(planoPatinhos, {diaInicio:0, diaFim:29}), true);
  assert.strictEqual(C.fasesSobrepoem(planoPatinhos.slice(0,1), {diaInicio:30, diaFim:59}), false);
  assert.strictEqual(C.fasesSobrepoem(planoPatinhos.slice(0,1), {diaInicio:29, diaFim:null}), true);
  assert.strictEqual(C.fasesSobrepoem([], {diaInicio:0, diaFim:null}), false);
});
test('alertasCompra avisa quando o stock dura 7 dias ou menos ao ritmo do plano', ()=>{
  const lote = {id:1, especie:'Pato Muscovy', qtd:10, dataEntrada:'2026-09-25', autoDesde:'2026-09-25'}; // A1: 0,5 kg/dia
  const stock = (kg)=>[{id:1, nome:'Ração A1', kgComprado:kg, custoTotal:100, dataCompra:'2026-09-01'}];
  const a = C.alertasCompra(stock(3), [], [lote], planoPatinhos, '2026-10-01'); // 6 dias
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].tipo, 'aviso');
  assert.strictEqual(C.alertasCompra(stock(1.2), [], [lote], planoPatinhos, '2026-10-01')[0].tipo, 'perigo'); // 2 dias
  assert.strictEqual(C.alertasCompra(stock(10), [], [lote], planoPatinhos, '2026-10-01').length, 0); // 20 dias
  assert.strictEqual(C.alertasCompra(stock(3), [], [{...lote, autoDesde:null}], planoPatinhos, '2026-10-01').length, 0);
});
test('custoRacaoPorLote soma só lançamentos automáticos e usa o preço médio', ()=>{
  const stock = [{id:1, nome:'Ração A1', kgComprado:10, custoTotal:200, dataCompra:'2026-09-01'}];
  const consumo = [
    {item:'Ração A1', kg:2, auto:true, loteId:1}, {item:'Ração A1', kg:3, auto:true, loteId:1},
    {item:'Ração A1', kg:4, auto:true, loteId:2}, {item:'Ração A1', kg:9}
  ];
  const r = C.custoRacaoPorLote(consumo, stock);
  assert.strictEqual(r[1].kg, 5);
  assert.strictEqual(r[1].custo, 100);
  assert.strictEqual(r[2].custo, 80);
});
test('estadoTarefaSaude e alertasSaude: atrasada, hoje, breve e futura', ()=>{
  const h = '2026-10-10';
  assert.strictEqual(C.estadoTarefaSaude({data:'2026-10-08'}, h).estado, 'atrasada');
  assert.strictEqual(C.estadoTarefaSaude({data:'2026-10-10'}, h).estado, 'hoje');
  assert.strictEqual(C.estadoTarefaSaude({data:'2026-10-12'}, h).estado, 'breve');
  assert.strictEqual(C.estadoTarefaSaude({data:'2026-10-20'}, h).estado, 'futura');
  assert.strictEqual(C.estadoTarefaSaude({data:'2026-10-01', feito:true}, h).estado, 'feito');
  const lista = [
    {tipo:'Vacina', produto:'Newcastle', data:'2026-10-08'}, {tipo:'Medicação', produto:'Vitaminas', data:'2026-10-20'},
    {tipo:'Vacina', produto:'<b>x</b>', data:'2026-10-10'}, {tipo:'Vacina', produto:'Feita', data:'2026-10-01', feito:true}
  ];
  const a = C.alertasSaude(lista, h);
  assert.strictEqual(a.length, 2);
  assert.strictEqual(a[0].tipo, 'perigo');
  assert.ok(a[1].texto.includes('&lt;b&gt;'));
});
test('proximaTarefaSaude agenda a repetição a partir da data em que foi feita', ()=>{
  const n = C.proximaTarefaSaude({tipo:'Vacina', produto:'Newcastle', loteId:3, loteNome:'X', repetirDias:21, custo:50}, '2026-10-10');
  assert.strictEqual(n.data, '2026-10-31');
  assert.strictEqual(n.feito, false);
  assert.strictEqual(C.proximaTarefaSaude({tipo:'Vacina', produto:'A'}, '2026-10-10'), null);
});
test('evolucaoPeso calcula o ganho em g/dia entre pesagens', ()=>{
  const lote = {dataEntrada:'2026-09-01'};
  const r = C.evolucaoPeso([{id:2, data:'2026-09-21', pesoMedioG:600}, {id:1, data:'2026-09-11', pesoMedioG:200}, {id:3, data:'2026-09-22', pesoMedioG:630}], lote);
  assert.deepStrictEqual(r.map(x=>x.id), [1,2,3]);
  assert.strictEqual(r[0].ganhoDiario, null);
  assert.strictEqual(r[1].ganhoDiario, 40);
  assert.strictEqual(r[2].ganhoDiario, 30);
  assert.strictEqual(r[0].idade, 10);
});

test('alertas: com plano, o "stock baixo" em % cede o lugar ao alerta de compra (sem duplicar)', ()=>{
  const lote = {id:1, especie:'Pato Muscovy', qtd:10, dataEntrada:'2026-09-25', finalidade:'Crescimento', autoDesde:'2026-09-25'};
  const stock = [{id:1, nome:'Ração A1', kgComprado:100, custoTotal:1000, dataCompra:'2026-09-01'}];
  const consumo = [{feedStockId:1, item:'Ração A1', kg:98}]; // restam 2 kg = 2% (4 dias ao ritmo do plano)
  /* alertas() usa a data de HOJE para saber em que fase do plano está o lote; por isso este lote é
     "de há 10 dias" (e não uma data fixa, que um dia deixava de estar dentro do plano e o teste falhava). */
  const dias = n => { const d = new Date(); d.setDate(d.getDate() - n); return calc.Util.dataISO(d); };
  const loteHoje = {...lote, dataEntrada:dias(10), autoDesde:dias(10)};
  assert.strictEqual(C.alertas(stock, consumo, [], [loteHoje], [], undefined).length, 1);        // sem plano: aviso em %
  assert.strictEqual(C.alertas(stock, consumo, [], [loteHoje], [], planoPatinhos).length, 0);    // com plano: fica só o de compra
  assert.strictEqual(C.alertasCompra(stock, consumo, [lote], planoPatinhos, '2026-10-01').length, 1);
});
test('retiradasAtivas: só enquanto não passam os dias, só para o lote certo (ou todas as aves)', ()=>{
  const saude = [
    {id:1, tipo:'Medicação', produto:'Antibiótico X', feito:true, dataFeito:'2026-10-01', retiradaDias:7, loteId:5, loteNome:'Pato (10)'},
    {id:2, tipo:'Medicação', produto:'Vit', feito:true, dataFeito:'2026-10-01', retiradaDias:3, loteId:null},
    {id:3, tipo:'Vacina', produto:'Sem retirada', feito:true, dataFeito:'2026-10-01'},
    {id:4, tipo:'Medicação', produto:'Pendente', feito:false, data:'2026-10-02', retiradaDias:5, loteId:5}
  ];
  const a = C.retiradasAtivas(saude, 5, '2026-10-02');
  assert.deepStrictEqual(a.map(r=>r.id), [2,1]);               // ordenadas por data de fim
  assert.strictEqual(a[1].fim, '2026-10-08');
  assert.strictEqual(a[1].diasRestantes, 6);
  assert.deepStrictEqual(C.retiradasAtivas(saude, 9, '2026-10-02').map(r=>r.id), [2]);   // outro lote: só a de todas as aves
  assert.deepStrictEqual(C.retiradasAtivas(saude, 5, '2026-10-04').map(r=>r.id), [1]);   // a de 3 dias já terminou
  assert.strictEqual(C.retiradasAtivas(saude, 5, '2026-10-08').length, 0);                // no dia do fim já é seguro
});
test('alertasRetirada gera um aviso por retirada em curso e escapa o texto', ()=>{
  const a = C.alertasRetirada([{id:1, tipo:'Medicação', produto:'<b>X</b>', feito:true, dataFeito:'2026-10-01', retiradaDias:7, loteNome:'Pato'}], '2026-10-02');
  assert.strictEqual(a.length, 1);
  assert.ok(a[0].texto.includes('2026-10-08') && a[0].texto.includes('&lt;b&gt;'));
});
test('proximaTarefaSaude mantém o período de retirada na repetição', ()=>{
  assert.strictEqual(C.proximaTarefaSaude({tipo:'Medicação', produto:'A', repetirDias:7, retiradaDias:5}, '2026-10-10').retiradaDias, 5);
});
test('tipoDaEspecie e racaDaEspecie separam "Galinha Sasso" e "Pato Muscovy" (e nomes antigos)', ()=>{
  assert.strictEqual(C.tipoDaEspecie('Galinha Sasso'), 'Galinha');
  assert.strictEqual(C.racaDaEspecie('Galinha Sasso'), 'Sasso');
  assert.strictEqual(C.tipoDaEspecie('Pato Muscovy'), 'Pato');
  assert.strictEqual(C.racaDaEspecie('Pato Muscovy'), 'Muscovy');
  assert.strictEqual(C.tipoDaEspecie('Patinhos Pequin'), 'Pato');
  assert.strictEqual(C.racaDaEspecie('Patinhos Pequin'), 'Pequin');
  assert.strictEqual(C.tipoDaEspecie('Pintos Sasso'), 'Galinha');
  assert.strictEqual(C.tipoDaEspecie('Muscovy'), 'Outro');
  assert.strictEqual(C.racaDaEspecie('Muscovy'), 'Muscovy');
  assert.strictEqual(C.racaDaEspecie('Pato'), '');
  assert.strictEqual(C.tipoDaEspecie('Ganso Toulouse'), 'Ganso');
});
test('resumoPorTipo agrupa por tipo e raça com totais', ()=>{
  const r = C.resumoPorTipo([
    {especie:'Galinha Sasso', qtd:20, machos:8, femeas:12}, {especie:'Galinha Sasso', qtd:10, machos:0, femeas:0},
    {especie:'Pato Muscovy', qtd:5, machos:2, femeas:3}, {especie:'Pato', qtd:2, machos:1, femeas:1}
  ]);
  assert.deepStrictEqual(r.map(x=>x.tipo), ['Galinha','Pato']);
  assert.strictEqual(r[0].qtd, 30);
  assert.strictEqual(r[0].racas[0].lotes, 2);
  assert.strictEqual(r[1].qtd, 7);
  assert.ok(r[1].racas.some(x=>x.raca==='(sem raça definida)'));
});
test('chaveRaca: maiúsculas, acentos, espaços e plural não criam raças diferentes', ()=>{
  assert.strictEqual(C.chaveRaca('Cafriais'), C.chaveRaca(' cafrial '));
  assert.strictEqual(C.chaveRaca('Rhode  Island Red'), C.chaveRaca('rhode island red'));
  assert.strictEqual(C.chaveRaca('Nativos'), C.chaveRaca('Nativo'));
  assert.notStrictEqual(C.chaveRaca('Sasso'), C.chaveRaca('Pequim'));
});
test('racasParecidas: apanha erros de escrita pequenos mas não raças diferentes', ()=>{
  assert.ok(C.racasParecidas('Cafrial', 'Cafrail'));
  assert.ok(C.racasParecidas('Muscovy', 'Muscovi'));
  assert.ok(!C.racasParecidas('Sasso', 'Pequim'));
  assert.ok(!C.racasParecidas('Cobb', 'Ross'));
});
test('formatarNomeRaca: uma só forma de escrever', ()=>{
  assert.strictEqual(C.formatarNomeRaca('  rhode ISLAND   red '), 'Rhode Island Red');
  assert.strictEqual(C.formatarNomeRaca('khaki campbell'), 'Khaki Campbell');
  assert.strictEqual(C.formatarNomeRaca('ISA brown'), 'ISA Brown');
  assert.strictEqual(C.nomeGrupo('Pato', 'Pequim'), 'Pato Pequim');
  assert.strictEqual(C.nomeGrupo('Pato', ''), 'Pato');
});
test('racaExistenteParecida: reutiliza a raça já registada (igual) ou sugere a parecida', ()=>{
  const aves = [{especie:'Pintos cafriais', qtd:20}, {especie:'Galinha Sasso', qtd:5}, {especie:'Pato Pequim', qtd:3}];
  assert.deepStrictEqual(C.racaExistenteParecida(aves, 'Galinha Cafrial'), {raca:'cafriais', igual:true});
  assert.deepStrictEqual(C.racaExistenteParecida(aves, 'Galinha Cafrail'), {raca:'cafriais', igual:false});
  assert.strictEqual(C.racaExistenteParecida(aves, 'Pato Cafrial'), null);   // outro tipo: não mistura
  assert.strictEqual(C.racaExistenteParecida(aves, 'Galinha Nativa'), null);
});
test('duplicadosDeRacas: propõe unir nomes parecidos dentro do mesmo tipo', ()=>{
  const d = C.duplicadosDeRacas([{especie:'Pintos cafriais', qtd:20}, {especie:'Galinha Cafrial', qtd:10},
    {especie:'Galinha Sasso', qtd:5}, {especie:'Pato Pequim', qtd:3}, {especie:'Pato pequim', qtd:2}]);
  /* "Pato Pequim" e "Pato pequim" já contam como a mesma raça (raça conhecida),
     por isso só "cafriais"/"Cafrial" ficam para unir. */
  assert.strictEqual(d.length, 1);
  assert.strictEqual(d[0].tipo, 'Galinha');
  assert.deepStrictEqual(d[0].nomes.map(n=>n.raca), ['cafriais', 'Cafrial']);
});
test('resumoPorTipo: "Cafrial" e "cafriais" contam como uma só raça, com os lotes dentro', ()=>{
  const r = C.resumoPorTipo([{especie:'Pintos cafriais', qtd:20, machos:0, femeas:0}, {especie:'Galinha Cafrial', qtd:10, machos:4, femeas:6}]);
  assert.strictEqual(r[0].racas.length, 1);
  assert.strictEqual(r[0].racas[0].qtd, 30);
  assert.strictEqual(r[0].racas[0].lotes, 2);
  assert.strictEqual(r[0].racas[0].registos.length, 2);
});
test('separarBaseVariante: a raça conhecida fica como base e o resto é a descrição do lote', ()=>{
  assert.deepStrictEqual(C.separarBaseVariante('Pato', 'Muscovy em postura'), {base:'Muscovy', variante:'em postura'});
  assert.deepStrictEqual(C.separarBaseVariante('Pato', 'muscovy'), {base:'Muscovy', variante:''});
  assert.deepStrictEqual(C.separarBaseVariante('Pato', 'Pequim (marreco)'), {base:'Pequim', variante:'(marreco)'});
  assert.deepStrictEqual(C.separarBaseVariante('Galinha', 'Rhode Island Red jovem'), {base:'Rhode Island Red', variante:'jovem'});
  assert.deepStrictEqual(C.separarBaseVariante('Galinha', 'Boschveld'), {base:'Boschveld', variante:''});
});
test('resumoPorTipo: "Muscovy em postura" e "Muscovy chocando" são a mesma raça (Muscovy), com a descrição em cada lote', ()=>{
  const r = C.resumoPorTipo([{especie:'Pato Muscovy em postura', qtd:3}, {especie:'Pata Muscovy chocando', qtd:1},
    {especie:'Pato Pequim (marreco)', qtd:5}, {especie:'Pato Pequim', qtd:5}]);
  assert.strictEqual(r[0].racas.length, 2);
  const m = r[0].racas.find(x=>x.raca==='Muscovy'), p = r[0].racas.find(x=>x.raca==='Pequim');
  assert.strictEqual(m.qtd, 4); assert.strictEqual(m.lotes, 2);
  assert.deepStrictEqual(m.registos.map(x=>x.variante).sort(), ['chocando', 'em postura']);
  assert.strictEqual(p.qtd, 10);
});
test('duplicadosDeRacas: variantes do mesmo lote ("em postura") não são duplicados', ()=>{
  assert.strictEqual(C.duplicadosDeRacas([{especie:'Pato Muscovy em postura', qtd:3}, {especie:'Pato Muscovy chocando', qtd:1}]).length, 0);
});
test('racaExistenteParecida: compara a raça-base e ignora a descrição', ()=>{
  const aves = [{especie:'Pato Muscovy em postura', qtd:3}];
  assert.deepStrictEqual(C.racaExistenteParecida(aves, 'Pato muscovy chocando'), {raca:'Muscovy', igual:true});
  assert.deepStrictEqual(C.racaExistenteParecida(aves, 'Pato Muscovi'), {raca:'Muscovy', igual:false});
});
test('prefixoDoNome: "Patas", "Pintos" e "Pato" mantêm-se como foram escritos', ()=>{
  assert.strictEqual(C.prefixoDoNome('Patas Muscovy'), 'Patas');
  assert.strictEqual(C.prefixoDoNome('pintos cafriais'), 'Pintos');
  assert.strictEqual(C.prefixoDoNome('Pato Muscovy'), 'Pato');
  assert.strictEqual(C.prefixoDoNome('Cafrial'), '');          // tipo desconhecido: não há prefixo
  assert.strictEqual(C.tipoDaEspecie('Patas Muscovy'), 'Pato'); // continua a agrupar nos Patos
});
/* ============ IDs: numéricos (antigos) e UUID têm de funcionar ============ */
const UUID_A = 'b3f1c9e2-5a47-4d0e-9c1a-7e2f8d4a1b60', UUID_B = '0d9a6c11-84fe-4a3b-8c5d-1f2e3a4b5c6d';
test('mesmoId: ignora o tipo (7 e "7") e nunca iguala valores vazios', ()=>{
  assert.ok(calc.Util.mesmoId(7, '7'));
  assert.ok(calc.Util.mesmoId(UUID_A, UUID_A));
  assert.ok(!calc.Util.mesmoId(7, 8));
  assert.ok(!calc.Util.mesmoId(UUID_A, UUID_B));
  assert.ok(!calc.Util.mesmoId(undefined, undefined));
  assert.ok(!calc.Util.mesmoId(null, ''));
  assert.ok(!calc.Util.mesmoId('', ''));
});
test('chaveId: "7" → 7 (chave numérica antiga); UUID e texto ficam como estão', ()=>{
  assert.strictEqual(calc.Util.chaveId('7'), 7);
  assert.strictEqual(calc.Util.chaveId(' 12 '), 12);
  assert.strictEqual(calc.Util.chaveId(5), 5);
  assert.strictEqual(calc.Util.chaveId(UUID_A), UUID_A);
  assert.strictEqual(calc.Util.chaveId('abc'), 'abc');
  assert.strictEqual(calc.Util.chaveId(''), '');
  assert.strictEqual(calc.Util.chaveId(null), null);
});
test('novoId: UUID v4 válido e sem repetições', ()=>{
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const vistos = new Set();
  for(let i = 0; i < 500; i++){ const id = calc.Util.novoId(); assert.ok(re.test(id), id); vistos.add(id); }
  assert.strictEqual(vistos.size, 500);
});
test('compararRegistos: por criadoEm, depois id numérico, depois texto', ()=>{
  const l = [{id:UUID_B, criadoEm:'2026-10-08T10:00:00Z'}, {id:UUID_A, criadoEm:'2026-10-08T09:00:00Z'}, {id:3}, {id:10}, {id:2}];
  const ord = l.slice().sort(calc.Util.compararRegistos).map(x=>x.id);
  assert.deepStrictEqual(ord.slice(0, 3), [2, 3, 10]);                // antigos (sem criadoEm): por número
  assert.deepStrictEqual(ord.slice(3), [UUID_A, UUID_B]);              // novos: pela data de criação
  assert.strictEqual(calc.Util.compararRegistos({id:'a'}, {id:'b'}) < 0, true);
});
test('proximoIdIncubacao: numérico enquanto os ids forem números; UUID quando a base usa UUID', ()=>{
  const C0 = calc.Calc;
  assert.strictEqual(C0.proximoIdIncubacao([]), 1);
  assert.strictEqual(C0.proximoIdIncubacao([{id:1}, {id:4}]), 5);
  assert.strictEqual(C0.proximoIdIncubacao([{id:'7'}]), 8);
  assert.ok(/^[0-9a-f-]{36}$/.test(C0.proximoIdIncubacao([{id:UUID_A}])));
  assert.ok(/^[0-9a-f-]{36}$/.test(C0.proximoIdIncubacao([], true)));
});
test('Calc funciona igual com ids UUID (ordenação de vendas, saídas e extrato)', ()=>{
  const vendas = [
    {id:UUID_A, data:'2026-10-05', criadoEm:'2026-10-05T08:00:00Z', tipo:'ovos', qtd:1, valor:10, produto:'Ovos', unidade:'un'},
    {id:UUID_B, data:'2026-10-05', criadoEm:'2026-10-05T09:00:00Z', tipo:'ovos', qtd:1, valor:20, produto:'Ovos', unidade:'un'}
  ];
  const r = calc.Calc.resumoVendas(vendas, null, null);
  assert.deepStrictEqual(r.linhas.map(v=>v.id), [UUID_A, UUID_B]);          // mesma data → ordem de criação
  const ex = calc.Calc.extratoFinanceiro([
    {id:UUID_B, data:'2026-10-05', criadoEm:'2026-10-05T09:00:00Z', tipo:'despesa', valor:5, categoria:'x', desc:'b'},
    {id:UUID_A, data:'2026-10-05', criadoEm:'2026-10-05T08:00:00Z', tipo:'receita', valor:50, categoria:'x', desc:'a'}
  ], null, null);
  assert.deepStrictEqual(ex.linhas.map(l=>l.desc), ['a', 'b']);              // idem no extrato
  assert.strictEqual(ex.linhas[1].saldo, 45);
});
/* ============ ALERTAS INTELIGENTES (Fase 5) — datas fixas, passadas por parâmetro ============ */
const HOJE5 = '2026-11-10';
const antes5 = n => { const d = new Date(Date.parse(HOJE5) - n * 86400000); return d.toISOString().slice(0, 10); };
const ovosDias = (de, ate, qtd)=>{ const l = []; for(let i = de; i <= ate; i++) l.push({data:antes5(i), qtd}); return l; };

test('alertasPostura: queda forte → perigo; queda moderada → aviso; estável → nada', ()=>{
  const base = ovosDias(8, 28, 10);
  const forte = C.alertasPostura(base.concat(ovosDias(1, 7, 5)), HOJE5);                    // -50%
  assert.strictEqual(forte.length, 1); assert.strictEqual(forte[0].tipo, 'perigo'); assert.strictEqual(forte[0].chave, 'postura');
  assert.ok(/50%/.test(forte[0].texto) && /5\.0 ovos\/dia/.test(forte[0].texto) && /10\.0/.test(forte[0].texto));
  const moderada = C.alertasPostura(base.concat(ovosDias(1, 7, 7)), HOJE5);                // -30%
  assert.strictEqual(moderada.length, 1); assert.strictEqual(moderada[0].tipo, 'aviso');
  assert.strictEqual(C.alertasPostura(base.concat(ovosDias(1, 7, 8)), HOJE5).length, 0);    // -20%: dentro do normal
  assert.strictEqual(C.alertasPostura(base.concat(ovosDias(1, 7, 10)), HOJE5).length, 0);
});
test('alertasPostura: sem dados suficientes ou com poucos ovos não avisa; somam-se os registos do mesmo dia', ()=>{
  assert.strictEqual(C.alertasPostura([], HOJE5).length, 0);
  assert.strictEqual(C.alertasPostura(ovosDias(8, 28, 10).concat(ovosDias(1, 2, 1)), HOJE5).length, 0);          // só 2 dias na semana recente
  assert.strictEqual(C.alertasPostura(ovosDias(8, 12, 10).concat(ovosDias(1, 7, 1)), HOJE5).length, 0);          // só 5 dias de comparação
  assert.strictEqual(C.alertasPostura(ovosDias(8, 28, 2).concat(ovosDias(1, 7, 0)), HOJE5).length, 0);           // média anterior < 3 ovos/dia
  const porAve = []; for(let i = 8; i <= 28; i++){ porAve.push({data:antes5(i), qtd:4}, {data:antes5(i), qtd:6}); }  // duas aves por dia = 10
  for(let i = 1; i <= 7; i++){ porAve.push({data:antes5(i), qtd:1}, {data:antes5(i), qtd:2}); }                    // = 3
  assert.strictEqual(C.alertasPostura(porAve, HOJE5).length, 1);
});
test('alertasMortalidade: precisa de 3+ mortes e de estar acima do habitual', ()=>{
  const aves = [{qtd:50}];
  const mortes = (dias, qtd)=>dias.map(i=>({motivo:'morte', data:antes5(i), qtd}));
  const r = C.alertasMortalidade(aves, mortes([0, 2, 4], 1), HOJE5);                         // 3 em 53 = 5,7%
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].tipo, 'perigo'); assert.strictEqual(r[0].chave, 'mortalidade');
  assert.ok(/3 ave\(s\) morta\(s\)/.test(r[0].texto));
  assert.strictEqual(C.alertasMortalidade(aves, mortes([0, 3], 1), HOJE5).length, 0);                  // só 2
  assert.strictEqual(C.alertasMortalidade(aves, [{motivo:'venda', data:antes5(1), qtd:9}], HOJE5).length, 0);   // vendas não são mortes
  const grande = [{qtd:400}];
  const habitual = mortes([10, 12, 18, 20, 24, 26, 31, 33], 1);                                             // 8 em 4 semanas = 2/semana
  assert.strictEqual(C.alertasMortalidade(grande, mortes([0, 1, 2, 3], 1).concat(habitual), HOJE5)[0].tipo, 'aviso');   // 4 ≥ 2×2 mas só 1% do plantel
  assert.strictEqual(C.alertasMortalidade(grande, mortes([0, 1, 2], 1).concat(habitual), HOJE5).length, 0);               // 3 < 2×2 e 0,7%
});
test('previsaoCaixa: só prevê com histórico; calcula o ritmo, o saldo previsto e em quantos dias chega a zero', ()=>{
  const mov = (dias, tipo, valor)=>dias.map(i=>({data:antes5(i), tipo, valor}));
  assert.strictEqual(C.previsaoCaixa([], HOJE5).suficiente, false);
  assert.strictEqual(C.previsaoCaixa(mov([0, 1, 2, 3, 4], 'despesa', 10), HOJE5).suficiente, false);        // sem 14 dias de histórico
  const t = [{data:antes5(40), tipo:'receita', valor:3000}].concat(mov([1, 5, 9, 13, 17, 21, 25], 'despesa', 100), mov([3, 15], 'receita', 100));
  const p = C.previsaoCaixa(t, HOJE5);
  assert.strictEqual(p.suficiente, true); assert.strictEqual(p.saldoAtual, 3000 - 700 + 200);
  assert.ok(Math.abs(p.mediaDiaria - (-500 / 30)) < 1e-9);                                                  // (200-700)/30 dias
  assert.ok(Math.abs(p.previsto - (2500 - 500)) < 1e-9);
  assert.strictEqual(p.diasAteZero, Math.floor(2500 / (500 / 30)));                                         // 150 dias
  assert.strictEqual(C.alertaCaixa(p).length, 0);                                                           // longe de zero: sem alerta
});
test('alertaCaixa: avisa quando o saldo chega a zero em ≤ 30 dias e fica perigo se já está negativo', ()=>{
  const t = [{data:antes5(40), tipo:'receita', valor:400}];
  for(let i = 1; i <= 25; i += 2) t.push({data:antes5(i), tipo:'despesa', valor:60});                       // 13 × 60 = 780
  const p = C.previsaoCaixa(t, HOJE5);
  assert.ok(p.saldoAtual < 0); const a = C.alertaCaixa(p); assert.strictEqual(a[0].tipo, 'perigo'); assert.strictEqual(a[0].chave, 'caixa');
  const t2 = [{data:antes5(40), tipo:'receita', valor:1000}];
  for(let i = 1; i <= 25; i += 2) t2.push({data:antes5(i), tipo:'despesa', valor:50});                      // 650: sobra 350, ritmo -21,7/dia
  const p2 = C.previsaoCaixa(t2, HOJE5); assert.ok(p2.diasAteZero >= 15 && p2.diasAteZero <= 17);
  const a2 = C.alertaCaixa(p2); assert.strictEqual(a2.length, 1); assert.strictEqual(a2[0].tipo, 'aviso');
  assert.strictEqual(C.alertaCaixa({suficiente:false}).length, 0); assert.strictEqual(C.alertaCaixa(null).length, 0);
});
test('conversaoAlimentarPorLote: kg de ração por kg ganho e custo por kg ganho, só com o consumo do lote no período', ()=>{
  const aves = [{id:'L1', especie:'Frangos', qtd:10}];
  const pes = [{loteId:'L1', data:'2026-10-01', pesoMedioG:100, loteNome:'Frangos'}, {loteId:'L1', data:'2026-10-21', pesoMedioG:500, loteNome:'Frangos'}];
  const stock = [{nome:'Ração A', kgComprado:50, custoTotal:1000}];
  const consumo = [
    {loteId:'L1', item:'Ração A', kg:5, data:'2026-10-05', auto:true}, {loteId:'L1', item:'Ração A', kg:3, data:'2026-10-20', auto:true},
    {loteId:'L1', item:'Ração A', kg:9, data:'2026-09-20', auto:true},                  // antes da 1.ª pesagem: fora
    {loteId:'L2', item:'Ração A', kg:7, data:'2026-10-10', auto:true},                  // outro lote: fora
    {item:'Ração A', kg:4, data:'2026-10-10'}                                             // sem lote: não se sabe de quem é
  ];
  const r = C.conversaoAlimentarPorLote(pes, consumo, stock, aves);
  assert.strictEqual(r.length, 1);
  assert.ok(Math.abs(r[0].ganhoKg - 4) < 1e-9);                       // (500-100) g × 10 aves
  assert.strictEqual(r[0].racaoKg, 8); assert.ok(Math.abs(r[0].conversao - 2) < 1e-9);
  assert.ok(Math.abs(r[0].custo - 160) < 1e-9); assert.ok(Math.abs(r[0].custoPorKgGanho - 40) < 1e-9);
  assert.strictEqual(r[0].dias, 20); assert.strictEqual(r[0].de, '2026-10-01'); assert.strictEqual(r[0].ate, '2026-10-21');
  const semPreco = C.conversaoAlimentarPorLote(pes, consumo, [], aves)[0];
  assert.ok(Math.abs(semPreco.conversao - 2) < 1e-9); assert.strictEqual(semPreco.custoPorKgGanho, null);   // sem preço não inventa o custo
  assert.strictEqual(C.conversaoAlimentarPorLote([pes[0]], consumo, stock, aves).length, 0);               // 1 pesagem só
  assert.strictEqual(C.conversaoAlimentarPorLote(pes, consumo, stock, []).length, 0);                      // o lote já não existe
  assert.strictEqual(C.conversaoAlimentarPorLote([pes[1], {...pes[0], pesoMedioG:600}], consumo, stock, aves).length, 0);   // não ganhou peso
});
test('chaveAlerta: a mesma para o mesmo assunto mesmo com números diferentes', ()=>{
  const a = {tipo:'aviso', texto:'<svg></svg> Stock de "Ração A" baixo: só restam 12.5kg.'}, b = {tipo:'aviso', texto:'<svg></svg> Stock de "Ração A" baixo: só restam 9kg.'};
  assert.strictEqual(C.chaveAlerta(a), C.chaveAlerta(b));
  assert.notStrictEqual(C.chaveAlerta(a), C.chaveAlerta({tipo:'aviso', texto:'Stock de "Ração B" baixo: só restam 9kg.'}));
  assert.strictEqual(C.chaveAlerta({tipo:'perigo', chave:'postura', texto:'x'}), 'postura');
});
test('reunirAlertas: junta os alertas de sempre com os novos; quem não vê finanças não recebe a previsão de caixa', ()=>{
  const dados = {feedStock:[], consumo:[], incubacao:[], aves:[{id:1, qtd:50, especie:'Galinha'}], ovosLog:ovosDias(8, 28, 10).concat(ovosDias(1, 7, 4)),
    planos:[], saude:[], saidasAves:[], transacoes:[{data:antes5(40), tipo:'receita', valor:100}].concat(Array.from({length:13}, (_, i)=>({data:antes5(1 + i * 2), tipo:'despesa', valor:60}))),
    revendaProdutos:[], revendaMovs:[]};
  const admin = C.reunirAlertas(dados, {hoje:HOJE5});
  assert.ok(admin.some(a=>a.chave === 'postura')); assert.ok(admin.some(a=>a.chave === 'caixa'));
  const trab = C.reunirAlertas(dados, {hoje:HOJE5, financas:false});
  assert.ok(trab.some(a=>a.chave === 'postura')); assert.ok(!trab.some(a=>a.chave === 'caixa'));
});
test('planoDoLote: raça > plano geral do tipo; e o grupo escolhido no lote ganha a ambos', ()=>{
  const planos = [
    {especie:'Galinha', produto:'Geral', diaInicio:0, diaFim:null, gramas:100},
    {especie:'Galinha Sasso', produto:'Sasso', diaInicio:0, diaFim:null, gramas:120},
    {especie:'Galinha poedeira', produto:'Postura', diaInicio:0, diaFim:null, gramas:105}
  ];
  assert.strictEqual(C.planoDoLote({especie:'Galinha Sasso'}, planos)[0].produto, 'Sasso');
  assert.strictEqual(C.planoDoLote({especie:'Galinha Nativa'}, planos)[0].produto, 'Geral');
  assert.strictEqual(C.planoDoLote({especie:'Galinha Nativa', planoGrupo:'Galinha poedeira'}, planos)[0].produto, 'Postura');
  assert.strictEqual(C.planoDoLote({especie:'Galinha Nativa', planoGrupo:'Inexistente'}, planos)[0].produto, 'Geral');
  assert.strictEqual(C.planoDoLote({especie:'Pato Muscovy'}, planos).length, 0);
});
test('modelos de plano: fases em sequência, sem sobreposição e só a última sem fim', ()=>{
  assert.ok(C.MODELOS_PLANO.length>=5);
  C.MODELOS_PLANO.forEach(m=>{
    assert.ok(m.nota && m.grupoSugerido, m.id);
    m.fases.forEach((f,i)=>{
      assert.ok(f.gramas>0 && f.produto, m.id);
      if(i>0) assert.strictEqual(f.diaInicio, m.fases[i-1].diaFim+1, `${m.id} fase ${i} não é contínua`);
      if(i<m.fases.length-1) assert.ok(f.diaFim!==null && f.diaFim>=f.diaInicio, m.id);
      else assert.strictEqual(f.diaFim, null, m.id+' última fase deve ficar aberta');
    });
    assert.strictEqual(m.fases[0].diaInicio, 0, m.id);
  });
});
test('previsão com o modelo Sasso: 10 pintos até aos 21 dias ≈ 0,3 + 0,44 kg', ()=>{
  const sasso = C.MODELOS_PLANO.find(m=>m.id==='sasso').fases;
  const r = C.previsaoConsumo(sasso, 10, 0, 21, []);
  assert.strictEqual(r.totalKg, 14*21*10/1000 + 7*63*10/1000);
});
test('ração vendida baixa o stock mas não conta como consumo das aves', ()=>{
  const stock = [{id:1, nome:'Ração A1', kgComprado:50, custoTotal:1000, dataCompra:'2026-09-01'}];
  /* indicadoresNegocio(…, 30) olha para os últimos 30 dias a contar de HOJE: as datas do consumo são
     relativas (e não fixas, que um dia saíam da janela e o teste falhava). */
  const haDias = n => { const d = new Date(); d.setDate(d.getDate() - n); return calc.Util.dataISO(d); };
  const consumo = [{item:'Ração A1', feedStockId:1, kg:10, data:haDias(3)}, {item:'Ração A1', feedStockId:1, kg:5, venda:true, data:haDias(3)}];
  assert.strictEqual(C.produtosStock(stock, consumo)[0].restante, 35);
  assert.strictEqual(C.relatorioAlimentacao(stock, consumo, []).stockKg, 35);
  assert.strictEqual(C.indicadoresNegocio({feedStock:stock, consumo, aves:[{qtd:1}]}, 30).custoRacao, 200); // só os 10 kg
  const lote = {id:1, especie:'Pato Muscovy', qtd:10, dataEntrada:'2026-10-01', autoDesde:'2026-10-01', racaoProduto:'Ração A1', consumoGramas:50};
  assert.strictEqual(C.gerarConsumoAutomatico({aves:[lote], planosAlimentares:[], consumo:[{item:'Ração A1', kg:5, venda:true, data:'2026-10-01'}], feedStock:stock}, '2026-10-01').length, 1);
});
test('ovosDisponiveis: postos − vendidos − incubados (não conta incubações inactivas)', ()=>{
  const r = C.ovosDisponiveis([{qtd:100},{qtd:50}], [{tipo:'ovos', qtdBase:30, id:1},{tipo:'racao', qtdBase:99, id:2}], [{ativa:true, numOvos:12},{concluida:true, numOvos:8},{ativa:false, numOvos:50}]);
  assert.strictEqual(r.disponiveis, 150-30-20);
  assert.strictEqual(C.ovosDisponiveis([{qtd:10}], [{tipo:'ovos', qtdBase:4, id:7}], [], 7).disponiveis, 10); // ao editar, ignora a própria venda
  assert.strictEqual(C.qtdBaseVenda('ovos', 2, 'dúzia'), 24);
  assert.strictEqual(C.qtdBaseVenda('ovos', 1, 'cartão (30)'), 30);
  assert.strictEqual(C.qtdBaseVenda('racao', 7.5, 'kg'), 7.5);
});
test('vendasUnificadas junta vendas e vendas de aves; resumoVendas totaliza por tipo e produto no período', ()=>{
  const vendas = [
    {id:1, data:'2026-10-02', tipo:'ovos', produto:'Ovos', qtd:2, unidade:'dúzia', qtdBase:24, valor:120, cliente:'Maria'},
    {id:2, data:'2026-10-05', tipo:'racao', produto:'Ração A1', qtd:5, unidade:'kg', valor:150},
    {id:3, data:'2026-09-20', tipo:'outro', produto:'Carvão', qtd:3, unidade:'sacos', valor:300}
  ];
  const saidas = [{id:9, motivo:'venda', especie:'Galinha Sasso', qtd:2, valor:800, data:'2026-10-03'}, {id:10, motivo:'morte', especie:'X', qtd:1, valor:0, data:'2026-10-03'}];
  const u = C.vendasUnificadas(vendas, saidas);
  assert.strictEqual(u.length, 4);
  assert.deepStrictEqual(u.map(x=>x.data), ['2026-10-05','2026-10-03','2026-10-02','2026-09-20']);
  const r = C.resumoVendas(u, '2026-10-01', '2026-10-31');
  assert.strictEqual(r.n, 3);
  assert.strictEqual(r.total, 120+150+800);
  assert.strictEqual(r.porTipo[0].tipo, 'aves');
  assert.strictEqual(r.porTipo.find(t=>t.tipo==='ovos').valor, 120);
  assert.deepStrictEqual(r.linhas.map(x=>x.data), ['2026-10-02','2026-10-03','2026-10-05']); // cronológico
  assert.strictEqual(C.resumoVendas(u, '', '').n, 4);
});
test('margemVendaRacao usa o preço médio por kg do stock', ()=>{
  const prods = C.produtosStock([{id:1, nome:'Ração A1', kgComprado:50, custoTotal:1000, dataCompra:'2026-09-01'}], []);
  assert.strictEqual(C.margemVendaRacao({produto:'ração a1', qtdBase:5, valor:150}, prods), 50);
  assert.strictEqual(C.margemVendaRacao({produto:'Outra', qtdBase:5, valor:150}, prods), null);
});
test('periodoPreset: hoje, semana (seg–dom), mês, 7 e 30 dias', ()=>{
  const h = '2026-10-07'; // quarta-feira
  assert.deepStrictEqual(C.periodoPreset('hoje', h), {de:'2026-10-07', ate:'2026-10-07'});
  assert.deepStrictEqual(C.periodoPreset('semana', h), {de:'2026-10-05', ate:'2026-10-11'});
  assert.deepStrictEqual(C.periodoPreset('semana', '2026-10-11'), {de:'2026-10-05', ate:'2026-10-11'}); // domingo
  assert.deepStrictEqual(C.periodoPreset('mes', h), {de:'2026-10-01', ate:'2026-10-31'});
  assert.deepStrictEqual(C.periodoPreset('mes-passado', h), {de:'2026-09-01', ate:'2026-09-30'});
  assert.deepStrictEqual(C.periodoPreset('7d', h), {de:'2026-10-01', ate:'2026-10-07'});
  assert.deepStrictEqual(C.periodoPreset('30d', h), {de:'2026-09-08', ate:'2026-10-07'});
  assert.deepStrictEqual(C.periodoPreset('ano', h), {de:'2026-01-01', ate:'2026-12-31'});
});
test('extratoFinanceiro: saldo anterior, saldo corrido, totais e categorias', ()=>{
  const tr = [
    {id:1, tipo:'receita', categoria:'Venda de aves', desc:'a', valor:1000, data:'2026-09-30'},
    {id:2, tipo:'despesa', categoria:'Alimentação', desc:'b', valor:300, data:'2026-10-01'},
    {id:3, tipo:'receita', categoria:'Venda de ovos', desc:'c', valor:120, data:'2026-10-02'},
    {id:4, tipo:'despesa', categoria:'Alimentação', desc:'d', valor:80, data:'2026-10-02'},
    {id:5, tipo:'despesa', categoria:'Saúde/Vacinas', desc:'e', valor:50, data:'2026-11-01'}
  ];
  const e = C.extratoFinanceiro(tr, '2026-10-01', '2026-10-31');
  assert.strictEqual(e.saldoAnterior, 1000);
  assert.deepStrictEqual(e.linhas.map(l=>l.saldo), [700, 820, 740]);
  assert.strictEqual(e.totalEntradas, 120);
  assert.strictEqual(e.totalSaidas, 380);
  assert.strictEqual(e.saldoPeriodo, -260);
  assert.strictEqual(e.saldoFinal, 740);
  assert.deepStrictEqual(e.saidasPorCategoria, [{categoria:'Alimentação', valor:380}]);
  assert.strictEqual(C.extratoFinanceiro(tr, '', '').linhas.length, 5);
  assert.strictEqual(C.extratoFinanceiro([], '2026-10-01', '2026-10-31').saldoFinal, 0);
});
test('stockRevenda: stock = compras − vendas ± ajustes, custo médio e margens', ()=>{
  const produtos = [{id:1, nome:'Carvão', unidade:'saco', precoVenda:150, stockMinimo:5}, {id:2, nome:'Vazio', unidade:'unid.'}];
  const movs = [
    {produtoId:1, tipo:'compra', qtd:20, valor:2000}, {produtoId:1, tipo:'compra', qtd:10, valor:1300},   // custo médio 110
    {produtoId:1, tipo:'venda', qtd:12, valor:1920}, {produtoId:1, tipo:'ajuste', qtd:-3},
    {produtoId:99, tipo:'compra', qtd:5, valor:50}
  ];
  const [c, v] = C.stockRevenda(produtos, movs);
  assert.strictEqual(c.stock, 15);
  assert.strictEqual(Math.round(c.custoMedio*100)/100, 110);
  assert.strictEqual(Math.round(c.valorStock), 1650);
  assert.strictEqual(Math.round(c.margemUnitaria), 40);
  assert.strictEqual(c.margemVendida, 1920 - 12*110);
  assert.strictEqual(c.abaixoMinimo, false);
  assert.strictEqual(v.stock, 0);
  assert.strictEqual(v.custoMedio, null);
  assert.strictEqual(v.margemUnitaria, null);
});
test('alertasRevenda: avisa abaixo do mínimo, esgotado e negativo; ignora arquivados', ()=>{
  const l = C.stockRevenda([
    {id:1, nome:'A', unidade:'saco', stockMinimo:5}, {id:2, nome:'B', unidade:'kg', stockMinimo:2}, {id:3, nome:'C', stockMinimo:2, ativo:false}, {id:4, nome:'D'}
  ], [
    {produtoId:1, tipo:'compra', qtd:10, valor:100}, {produtoId:1, tipo:'venda', qtd:6, valor:80},
    {produtoId:2, tipo:'venda', qtd:1, valor:10},
    {produtoId:3, tipo:'compra', qtd:1, valor:1}
  ]);
  const a = C.alertasRevenda(l);
  assert.strictEqual(a.length, 2);
  assert.strictEqual(a[0].tipo, 'aviso');          // A: 4 ≤ 5
  assert.strictEqual(a[1].tipo, 'perigo');         // B: −1 (negativo)
  assert.ok(a[1].texto.includes('negativo'));
});
test('margemVendaRevenda usa o custo médio do produto', ()=>{
  const l = C.stockRevenda([{id:1, nome:'Carvão'}], [{produtoId:1, tipo:'compra', qtd:10, valor:1000}]);
  assert.strictEqual(C.margemVendaRevenda({revendaId:1, qtd:3, valor:450}, l), 150);
  assert.strictEqual(C.margemVendaRevenda({revendaId:9, qtd:3, valor:450}, l), null);
  assert.strictEqual(C.vendasUnificadas([{id:1, data:'2026-10-01', tipo:'outro', produto:'Carvão', qtd:3, valor:450, revendaId:1}], [])[0].revendaId, 1);
});
test('alertas de stock passam a ser por produto (compras somadas)', ()=>{
  const stock = [{id:1, nome:'A1', kgComprado:50, custoTotal:1, dataCompra:'2026-09-01'},{id:2, nome:'A1', kgComprado:50, custoTotal:1, dataCompra:'2026-09-02'}];
  const consumo = [{feedStockId:1, item:'A1', kg:60}];
  assert.strictEqual(C.alertas(stock, consumo, [], [], []).length, 0);
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
