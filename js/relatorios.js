/* ============ PÁGINA: RELATÓRIOS (Plantel, Alimentação, Produção, Financeiro) ============
   Junta, em 4 secções, tudo o que já é calculado noutras partes da app
   — pensada para responder a perguntas do tipo "como evoluiu isto nos
   últimos meses", que não cabiam bem no dashboard do Início (esse é
   sobre "agora"; este é sobre "ao longo do tempo"). */

async function renderRelatorios(){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="loading-msg">A carregar…</div>`;
  app.innerHTML = await viewRelatorios();
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
  <h3 style="font-size:.9rem;margin-top:14px;">Evolução mensal (entradas vs saídas)</h3>
  ${plantel.evolucaoMensal.length===0 ? `<p class="empty">Ainda sem dados suficientes por mês.</p>` : `
  <div class="table-scroll"><table class="responsive-stack">
    <tr><th>Mês</th><th>Entradas</th><th>Vendas</th><th>Abates</th><th>Mortes</th></tr>
    ${plantel.evolucaoMensal.map(m=>`<tr>
      <td data-label="Mês">${m.label}</td>
      <td data-label="Entradas" class="num-font">${m.entradas}</td>
      <td data-label="Vendas" class="num-font">${m.vendas}</td>
      <td data-label="Abates" class="num-font">${m.abates}</td>
      <td data-label="Mortes" class="num-font">${m.mortes}</td>
    </tr>`).join('')}
  </table></div>`}
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
  <h3 style="font-size:.9rem;margin-top:14px;">Evolução mensal</h3>
  <div class="chart-card">${UI.svgBarChart(Calc.producaoEvolucaoGrafico(ovosLog, 6).map(m=>({label:m.label, valor:m.total})), {cor:'var(--mato)'})}</div>

  <h2 class="section-title">${Icon.svg('carteira')} Relatório Financeiro</h2>
  <div class="cards">
    <div class="card"><div class="label">Receitas</div><div class="value">${Util.moeda(financeiro.receitas)}</div></div>
    <div class="card"><div class="label">Despesas</div><div class="value neg">${Util.moeda(financeiro.despesas)}</div></div>
    <div class="card"><div class="label">Saldo acumulado</div><div class="value ${financeiro.saldo<0?'neg':''}">${Util.moeda(financeiro.saldo)}</div></div>
    <div class="card"><div class="label">Rentabilidade estimada</div><div class="value ${financeiro.rentabilidadeEstimada!=null&&financeiro.rentabilidadeEstimada<0?'neg':''}">${financeiro.rentabilidadeEstimada==null?'—':financeiro.rentabilidadeEstimada.toFixed(1)+'%'}</div><div class="sub">Saldo ÷ Receitas</div></div>
  </div>
  <p class="footnote">${Icon.svg('aviso')} "Rentabilidade estimada" é uma margem simples (Saldo acumulado ÷ Receitas totais) — não é uma contabilidade de lucro real. Tal como o Saldo, não desconta mortalidade, mão-de-obra própria, água, energia, ou depreciação de equipamento, a não ser que os tenhas lançado manualmente como despesa.</p>

  <h3 style="font-size:.9rem;margin-top:14px;">Despesas por categoria</h3>
  ${financeiro.porCategoria.length===0 ? `<p class="empty">Ainda sem despesas registadas.</p>` : `
  <div class="chart-card">${UI.svgDonutChart(financeiro.porCategoria.slice(0,6).map(([label,valor])=>({label,valor})))}</div>`}

  <h3 style="font-size:.9rem;margin-top:14px;">Evolução mensal</h3>
  ${financeiro.evolucaoMensal.length===0 ? `<p class="empty">Ainda sem movimentos suficientes por mês.</p>` : `
  <div class="table-scroll"><table class="responsive-stack">
    <tr><th>Mês</th><th>Despesas</th><th>Receitas</th><th>Saldo</th></tr>
    ${financeiro.evolucaoMensal.map(m=>`<tr>
      <td data-label="Mês">${m.label}</td>
      <td data-label="Despesas" class="num-font neg">${Util.moeda(m.despesas)}</td>
      <td data-label="Receitas" class="num-font">${Util.moeda(m.receitas)}</td>
      <td data-label="Saldo" class="num-font ${m.saldo<0?'neg':''}">${Util.moeda(m.saldo)}</td>
    </tr>`).join('')}
  </table></div>`}
  `;
}

UI.initPagina(renderRelatorios);
