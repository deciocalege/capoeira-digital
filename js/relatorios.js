/* @revisao 2.15.1 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).relatorios = '2.15.1';
/* ============ PÁGINA: RELATÓRIOS (Plantel, Alimentação, Produção, Financeiro) ============
   Junta, em 4 secções, tudo o que já é calculado noutras partes da app
   — pensada para responder a perguntas do tipo "como evoluiu isto nos
   últimos meses", que não cabiam bem no dashboard do Início (esse é
   sobre "agora"; este é sobre "ao longo do tempo"). */

async function renderRelatorios(){
  const app = document.getElementById('app');
  await UI.redesenhar(app, () => viewRelatorios(), () => { attachHandlersRelatorios(); });
}

/* Descarrega um ficheiro CSV (com BOM, para o Excel reconhecer os acentos). */
function descarregarCSV(ficheiro, texto){
  const blob = new Blob(['\ufeff' + texto], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = ficheiro;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function attachHandlersRelatorios(){
  document.querySelectorAll('[data-csv]').forEach(b=>b.addEventListener('click', async ()=>{
    const [compartimentos, aves, saidasAves, feedStock, consumo, ovosLog, transacoes, incubacao, saude, pesagens, vendas, revenda, revendaMov] = await Promise.all([
      DB.getAll('compartimentos'), DB.getAll('aves'), DB.getAll('saidasAves'), DB.getAll('feedStock'),
      DB.getAll('consumo'), DB.getAll('ovosLog'), DB.getAll('transacoes'), DB.getAll('incubacao'),
      DB.getAll('saude'), DB.getAll('pesagens'), DB.getAll('vendas'), DB.getAll('revenda'), DB.getAll('revendaMov')
    ]);
    const conjuntos = Calc.conjuntosCSV({compartimentos, aves, saidasAves, feedStock, consumo, ovosLog, transacoes, incubacao, saude, pesagens, vendas, revenda, revendaMov});
    const c = conjuntos.find(x=>x.id===b.dataset.csv);
    if(!c) return;
    if(c.linhas.length===0){ Util.toast('⚠️ Ainda não há registos para exportar nesta tabela'); return; }
    descarregarCSV(`capoeira-${c.ficheiro}-${Util.hoje()}.csv`, Calc.paraCSV(c.cabecalhos, c.linhas));
    Util.toast(`Exportado: ${c.titulo} (${c.linhas.length} linhas)`);
  }));
}

async function viewRelatorios(){
  const [compartimentos, aves, saidasAves, feedStock, consumo, ovosLog, transacoes] = await Promise.all([
    DB.getAll('compartimentos'), DB.getAll('aves'), DB.getAll('saidasAves'),
    DB.getAll('feedStock'), DB.getAll('consumo'), DB.getAll('ovosLog'), DB.getAll('transacoes')
  ]);

  const plantel = Calc.relatorioPlantel(aves, saidasAves);
  const alimentacao = Calc.relatorioAlimentacao(feedStock, consumo, aves);
  const producao = Calc.relatorioProducao(ovosLog, aves);
  const financeiro = Calc.relatorioFinanceiro(transacoes);

  return `
  <h2 class="section-title">${Icon.svg('lista')} Relatório de Plantel</h2>
  <div class="cards">
    <div class="card"><div class="label">Total actual</div><div class="value">${plantel.totalAtual}</div><div class="sub">em ${compartimentos.length} compartimento(s)</div></div>
    <div class="card"><div class="label">Vendas (histórico)</div><div class="value">${plantel.vendas}</div></div>
    <div class="card"><div class="label">Abates (histórico)</div><div class="value">${plantel.abates}</div></div>
    <div class="card"><div class="label">Mortes (histórico)</div><div class="value neg">${plantel.mortes}</div></div>
    <div class="card"><div class="label">Taxa de mortalidade</div><div class="value ${plantel.taxaMortalidade>10?'neg':''}">${plantel.taxaMortalidade.toFixed(1)}%</div><div class="sub">mortes ÷ (actual + saídas)</div></div>
  </div>
  <h3 class="sub-titulo">Evolução mensal (entradas vs saídas)</h3>
  ${plantel.evolucaoMensal.length===0 ? `<p class="empty">Ainda sem dados suficientes por mês.</p>` : `
  ${Tabela.html({
    id:'rel-plantel-mes',
    linhas: plantel.evolucaoMensal,
    colunas:[
      {titulo:'Mês', valor:m=>m.label},
      {titulo:'Entradas', valor:m=>m.entradas, num:true},
      {titulo:'Vendas', valor:m=>m.vendas, num:true},
      {titulo:'Abates', valor:m=>m.abates, num:true},
      {titulo:'Mortes', valor:m=>m.mortes, num:true}
    ]
  })}`}
  <p class="footnote">${Icon.svg('dica')} "Entradas" reflecte a data de entrada das aves <strong>ainda no plantel</strong> — aves já retiradas não aparecem aqui como entrada (a app não guarda um livro de registo separado de cada entrada, só o estado actual + o histórico completo de saídas). "Vendas/Abates/Mortes" vêm do histórico de saídas, esse sim completo.</p>

  <h2 class="section-title">${Icon.svg('trigo')} Relatório de Alimentação</h2>
  <div class="cards">
    <div class="card"><div class="label">Consumo diário (médio)</div><div class="value">${alimentacao.consumoDiario.toFixed(2)}kg</div></div>
    <div class="card"><div class="label">Consumo semanal</div><div class="value">${alimentacao.consumoSemanal.toFixed(1)}kg</div><div class="sub">últimos 7 dias</div></div>
    <div class="card"><div class="label">Consumo mensal</div><div class="value">${alimentacao.consumoMensal.toFixed(1)}kg</div><div class="sub">últimos 30 dias</div></div>
    <div class="card"><div class="label">Custo total em ração</div><div class="value neg">${Util.moeda(alimentacao.custoTotalComprado)}</div><div class="sub">${Util.moeda(alimentacao.custoMedioPorKg)}/kg em média</div></div>
    <div class="card"><div class="label">Consumo médio por ave</div><div class="value">${alimentacao.consumoMedioPorAveDia.toFixed(3)}kg</div><div class="sub">por dia</div></div>
    <div class="card"><div class="label">Previsão de esgotamento</div><div class="value">${alimentacao.diasAteEsgotar==null?'—':`${alimentacao.diasAteEsgotar}d`}</div><div class="sub">${alimentacao.previsaoEsgotamentoData?`≈ ${alimentacao.previsaoEsgotamentoData}`:'sem dados suficientes de consumo'}</div></div>
  </div>

  <h2 class="section-title">${Icon.svg('ovo')} Relatório de Produção</h2>
  <div class="cards">
    <div class="card"><div class="label">Ovos por dia (média)</div><div class="value">${producao.ovosDia.toFixed(1)}</div><div class="sub">últimos 7 dias</div></div>
    <div class="card"><div class="label">Ovos por semana</div><div class="value">${producao.ovosSemana}</div></div>
    <div class="card"><div class="label">Ovos por mês</div><div class="value">${producao.ovosMes}</div><div class="sub">últimos 30 dias</div></div>
    <div class="card"><div class="label">Média por fêmea</div><div class="value">${producao.mediaPorFemeaSemana.toFixed(2)}</div><div class="sub">ovos/semana, de ${producao.totalFemeas} fêmea(s)</div></div>
  </div>
  <h3 class="sub-titulo">Evolução mensal</h3>
  <div class="chart-card">${UI.svgBarChart(Calc.producaoEvolucaoGrafico(ovosLog, 6).map(m=>({label:m.label, valor:m.total})), {cor:'var(--mato)'})}</div>

  <h2 class="section-title">${Icon.svg('carteira')} Relatório Financeiro</h2>
  <div class="cards">
    <div class="card"><div class="label">Receitas</div><div class="value">${Util.moeda(financeiro.receitas)}</div></div>
    <div class="card"><div class="label">Despesas</div><div class="value neg">${Util.moeda(financeiro.despesas)}</div></div>
    <div class="card"><div class="label">Saldo acumulado</div><div class="value ${financeiro.saldo<0?'neg':''}">${Util.moeda(financeiro.saldo)}</div></div>
    <div class="card"><div class="label">Rentabilidade estimada</div><div class="value ${financeiro.rentabilidadeEstimada!=null&&financeiro.rentabilidadeEstimada<0?'neg':''}">${financeiro.rentabilidadeEstimada==null?'—':financeiro.rentabilidadeEstimada.toFixed(1)+'%'}</div><div class="sub">Saldo ÷ Receitas</div></div>
  </div>
  <p class="footnote">${Icon.svg('aviso')} "Rentabilidade estimada" é uma margem simples (Saldo acumulado ÷ Receitas totais) — não é uma contabilidade de lucro real. Tal como o Saldo, não desconta mortalidade, mão-de-obra própria, água, energia, ou depreciação de equipamento, a não ser que os tenhas lançado manualmente como despesa.</p>

  <h3 class="sub-titulo">Despesas por categoria</h3>
  ${financeiro.porCategoria.length===0 ? `<p class="empty">Ainda sem despesas registadas.</p>` : `
  <div class="chart-card">${UI.svgDonutChart(financeiro.porCategoria.slice(0,6).map(([label,valor])=>({label,valor})))}</div>`}

  <h3 class="sub-titulo">Evolução mensal</h3>
  ${financeiro.evolucaoMensal.length===0 ? `<p class="empty">Ainda sem movimentos suficientes por mês.</p>` : `
  ${Tabela.html({
    id:'rel-fin-mes',
    linhas: financeiro.evolucaoMensal,
    colunas:[
      {titulo:'Mês', valor:m=>m.label},
      {titulo:'Despesas', valor:m=>Util.moeda(m.despesas), num:true, classe:'neg'},
      {titulo:'Receitas', valor:m=>Util.moeda(m.receitas), num:true},
      {titulo:'Saldo', valor:m=>Util.moeda(m.saldo), num:true, classe:m=>m.saldo<0 ? 'neg' : ''}
    ]
  })}`}

  <h2 class="section-title">${Icon.svg('lista')} Exportar para Excel (CSV)</h2>
  <p class="footnote">Cada botão descarrega uma tabela com todos os registos, pronta para abrir no Excel ou no Google Sheets.</p>
  <div class="row-actions acoes-linha">
    <button class="btn outline" data-csv="movimentos">Movimentos</button>
    <button class="btn outline" data-csv="plantel">Plantel</button>
    <button class="btn outline" data-csv="saidas">Saídas de aves</button>
    <button class="btn outline" data-csv="consumo">Consumo de ração</button>
    <button class="btn outline" data-csv="stock">Stock de ração</button>
    <button class="btn outline" data-csv="ovos">Postura de ovos</button>
    <button class="btn outline" data-csv="chocos">Chocos e eclosões</button>
    <button class="btn outline" data-csv="vendas">Vendas</button>
    <button class="btn outline" data-csv="revenda">Inventário de revenda</button>
    <button class="btn outline" data-csv="revenda-mov">Movimentos de revenda</button>
    <button class="btn outline" data-csv="saude">Vacinas e medicação</button>
    <button class="btn outline" data-csv="pesagens">Pesagens</button>
  </div>
  <p class="footnote">${Icon.svg('dica')} Se o Excel abrir tudo numa só coluna, usa <strong>Dados → De texto/CSV</strong> e escolhe o separador "ponto e vírgula".</p>
  `;
}

UI.initPagina(renderRelatorios);
