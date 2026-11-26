/* @revisao 2.15.1 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).financas = '2.15.1';
/* ============ PÁGINA: FINANÇAS (despesas, receitas e saldo) ============ */

let _filtroCategoria = '';
let _filtroMes = '';

async function renderFinancas(){
  const app = document.getElementById('app');
  await UI.redesenhar(app, () => viewFinancas(_filtroCategoria, _filtroMes), () => { attachHandlersFinancas(); });
}

async function afterMutacao(msg){
  if(msg) Util.toast(msg);
  await renderFinancas();
}

async function viewFinancas(filtroCategoria, filtroMes){
  const transacoesTodas = await DB.getAll('transacoes');
  let transacoes = transacoesTodas;
  if(filtroCategoria) transacoes = transacoes.filter(t=>t.categoria===filtroCategoria);
  if(filtroMes) transacoes = transacoes.filter(t=>(t.data||'').slice(0,7)===filtroMes);
  const categoriasDisponiveis = [...new Set(transacoesTodas.map(t=>t.categoria))].sort();
  const resumoMes = Calc.resumoPorMes(transacoesTodas);
  const despesasCat = Calc.despesasPorCategoria(transacoesTodas).slice(0,6).map(([label,valor])=>({label,valor}));
  const ultimosMeses = Calc.ultimosMesesGrafico(transacoesTodas, 6);
  const despesasPorMesGrafico = ultimosMeses.map(m=>({label:m.label, valor:m.despesas}));
  const saldoPorMesGrafico = ultimosMeses.map(m=>({label:m.label, valor:m.saldo}));
  return `
  <h2 class="section-title" id="sec-resumo">Resumo financeiro</h2>
  <div class="cards">
    <div class="card"><div class="label">Despesas</div><div class="value neg">${Util.moeda(Calc.totalDespesas(transacoesTodas))}</div></div>
    <div class="card"><div class="label">Receitas</div><div class="value">${Util.moeda(Calc.totalReceitas(transacoesTodas))}</div></div>
    <div class="card"><div class="label">Saldo acumulado</div><div class="value ${Calc.saldo(transacoesTodas)<0?'neg':''}">${Util.moeda(Calc.saldo(transacoesTodas))}</div><div class="sub">Receitas − Despesas registadas</div></div>
  </div>
  <p class="footnote">${Icon.svg('aviso')} <strong>Este valor não é o lucro real do negócio</strong> — é apenas Receitas menos Despesas <strong>registadas</strong> na app. Coisas como mortalidade de aves, mão-de-obra própria, água, energia, ou depreciação de equipamento e infraestrutura só entram nesta conta se as lançares manualmente como despesa (ex: em "Início → Registar gasto extra"). Usa este número para acompanhar o fluxo de caixa, não como medida final de rentabilidade do negócio.</p>

  <h2 class="section-title" id="sec-grafico">Visão gráfica</h2>
  <div class="charts-split">
    <div class="chart-card">
      <h3>Despesas por mês (últimos 6)</h3>
      ${UI.svgBarChart(despesasPorMesGrafico, {cor:'var(--sangue)'})}
    </div>
    <div class="chart-card">
      <h3>Saldo por mês (últimos 6)</h3>
      ${UI.svgBarChart(saldoPorMesGrafico, {cor:'var(--mato)'})}
    </div>
    <div class="chart-card">
      <h3>Despesas por categoria</h3>
      ${UI.svgDonutChart(despesasCat)}
    </div>
  </div>

  <h2 class="section-title" id="sec-cat-tabela">Despesas por categoria (tabela)</h2>
  ${Calc.despesasPorCategoria(transacoesTodas).length===0 ? `<p class="empty">Ainda sem despesas registadas.</p>` : `
  ${Tabela.html({
    id:'fin-categorias',
    linhas: Calc.despesasPorCategoria(transacoesTodas),
    colunas:[
      {titulo:'Categoria', valor:([cat])=>cat},
      {titulo:'Total gasto', valor:([,val])=>Util.moeda(val), num:true},
      {titulo:'% do total', valor:([,val])=>(val/Calc.totalDespesas(transacoesTodas)*100).toFixed(0)+'%', num:true}
    ]
  })}`}

  <h2 class="section-title" id="sec-meses">Gastos organizados por mês</h2>
  ${resumoMes.length===0 ? `<p class="empty">Ainda sem movimentos para agrupar por mês.</p>` : `
  ${Tabela.html({
    id:'fin-meses',
    linhas: resumoMes,
    colunas:[
      {titulo:'Mês', valor:m=>m.label},
      {titulo:'Despesas', valor:m=>Util.moeda(m.despesas), num:true, classe:'neg'},
      {titulo:'Receitas', valor:m=>Util.moeda(m.receitas), num:true},
      {titulo:'Saldo', valor:m=>Util.moeda(m.saldo), num:true, classe:m=>m.saldo<0 ? 'neg' : ''}
    ],
    acoes: m => `
        ${m.chave===filtroMes
          ? `<button type="button" class="btn small outline" data-limpar-filtro-mes="1">Limpar filtro</button>`
          : `<button type="button" class="btn small outline" data-filtro-mes="${m.chave}">Ver movimentos</button>`}
      `
  })}`}

  <h2 class="section-title" id="sec-historico">Histórico de movimentos</h2>
  <form class="inline mb-2" id="form-filtro-categoria">
    <label>Filtrar por categoria
      <select name="filtroCategoria">
        <option value="">Todas</option>
        ${categoriasDisponiveis.map(c=>`<option value="${Util.escapeHTML(c)}" ${c===filtroCategoria?'selected':''}>${Util.escapeHTML(c)}</option>`).join('')}
      </select>
    </label>
  </form>
  ${transacoes.length===0 ? `<p class="empty">Sem movimentos registados${filtroCategoria?` para "${filtroCategoria}"`:''}${filtroMes?` em ${Calc.formatarMes(filtroMes)}`:''}.</p>` : `
  ${Tabela.html({
    id:'fin-historico', limite:25, busca:true, buscaPlaceholder:'Pesquisar descrição, categoria…',
    linhas: transacoes.slice().reverse(),
    colunas:[
      {titulo:'Data', valor:t=>Util.dataBR(t.data)},
      {titulo:'Tipo', valor:t=>t.tipo==='despesa'?`${Icon.svg('descida')} Despesa`:`${Icon.svg('subida')} Receita`, html:true, filtro:true},
      {titulo:'Categoria', valor:t=>t.categoria},
      {titulo:'Descrição', valor:t=>t.desc, largo:true},
      {titulo:'Valor', valor:t=>`${t.tipo==='despesa'?'-':'+'}${Util.moeda(t.valor)}`, num:true}
    ],
    acoes: t => `${t.vendaId ? '<a href="vendas.html" class="footnote">gerido em Vendas</a>' : t.revendaMovId ? '<a href="revenda.html" class="footnote">gerido em Revenda</a>' : `<button class="btn small outline" data-edit-transacao="${t.id}">Editar</button> <button class="btn small danger" data-del-transacao="${t.id}">Apagar</button>`}`
  })}`}
  <h2 class="section-title" id="sec-extrato">Extrato de entradas e saídas</h2>
  <p class="footnote">${Icon.svg('dica')} Escolhe um período (dia, semana, mês ou datas à tua escolha) para ver todas as entradas e saídas com o saldo, e descarrega em PDF.</p>
  <div class="atalhos" id="atalhos-extrato">
    <button type="button" data-periodo="hoje">Hoje</button><button type="button" data-periodo="semana">Esta semana</button>
    <button type="button" data-periodo="mes">Este mês</button><button type="button" data-periodo="mes-passado">Mês passado</button>
    <button type="button" data-periodo="30d">Últimos 30 dias</button><button type="button" data-periodo="ano">Este ano</button>
  </div>
  <form id="form-extrato" class="inline">
    <label>De <input type="date" name="de"></label>
    <label>Até <input type="date" name="ate"></label>
    <button class="btn" type="submit">Ver extrato</button>
    <button class="btn outline" type="button" id="btn-extrato-pdf">${Icon.svg('descarregar')} Descarregar PDF</button>
  </form>
  <div id="resultado-extrato"></div>

  <h2 class="section-title" id="titulo-form-transacao">Registar movimento</h2>
  <form id="form-transacao" class="inline" data-id="">
    <label>Tipo
      <select name="tipo"><option value="despesa">Despesa</option><option value="receita">Receita</option></select>
    </label>
    <label>Categoria
      <select name="categoria">
        <option>Alimentação</option><option>Venda de aves</option><option>Venda de ovos</option><option>Venda de ração</option><option>Outras vendas</option><option>Compra para revenda</option>
        <option>Saúde/Vacinas</option><option>Equipamento</option>
        <option>Manutenção</option><option>Construção/Infraestrutura</option><option>Material/Ferramentas</option>
        <option>Compra de aves</option><option>Transporte</option><option>Outro</option>
      </select>
    </label>
    <label>Descrição <input type="text" name="desc" placeholder="ex: venda de 2 galos" required></label>
    <label>Valor (MT) <input type="number" step="1" min="0" name="valor" required></label>
    <label>Data <input type="date" name="data" value="${Util.hoje()}" required></label>
    <button class="btn" type="submit" id="btn-guardar-transacao">Adicionar</button>
    <button class="btn outline" type="button" id="btn-cancelar-transacao" hidden>Cancelar edição</button>
  </form>

  `;
}

function attachHandlersFinancas(){
  UI.separadores(document.getElementById('app'), 'financas', [
    {id:'resumo', titulo:'Resumo', icone:'carteira', secoes:['sec-resumo','sec-grafico','sec-cat-tabela','sec-meses']},
    {id:'movimentos', titulo:'Movimentos', icone:'lista', secoes:['sec-historico','sec-extrato']},
    {id:'registar', titulo:'Registar', icone:'mais', secoes:['titulo-form-transacao']}
  ]);
  const ffiltro = document.getElementById('form-filtro-categoria');
  if(ffiltro) ffiltro.querySelector('select').addEventListener('change', async e=>{
    _filtroCategoria = e.target.value;
    await renderFinancas();
  });
  document.querySelectorAll('[data-filtro-mes]').forEach(b=>b.addEventListener('click', async ()=>{
    _filtroMes = b.dataset.filtroMes;
    await renderFinancas();
  }));
  document.querySelectorAll('[data-limpar-filtro-mes]').forEach(b=>b.addEventListener('click', async ()=>{
    _filtroMes = '';
    await renderFinancas();
  }));
  const ft = document.getElementById('form-transacao');
  if(ft){
    const titulo = document.getElementById('titulo-form-transacao');
    const btnG = document.getElementById('btn-guardar-transacao');
    const btnC = document.getElementById('btn-cancelar-transacao');
    btnC.addEventListener('click', ()=>{
      ft.reset(); ft.dataset.id = '';
      titulo.textContent = 'Registar movimento';
      btnG.textContent = 'Adicionar';
      btnC.hidden = true;
    });
    ft.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(ft);
      const valor = Number(fd.get('valor'));
      if(!(valor>=0)){ Util.toast('⚠️ Indica um valor válido'); return; }
      const dados = {tipo:fd.get('tipo'), categoria:fd.get('categoria'), desc:fd.get('desc'), valor, data:fd.get('data')};
      if(ft.dataset.id){
        const id = Util.chaveId(ft.dataset.id);   // número (ids antigos) ou UUID
        const todas = await DB.getAll('transacoes');
        const antiga = todas.find(t=>Util.mesmoId(t.id, id));
        await DB.put('transacoes', {...(antiga||{}), ...dados, id});
        await afterMutacao('Movimento actualizado');
      }else{
        await DB.add('transacoes', dados);
        await afterMutacao('Movimento registado');
      }
    });
    document.querySelectorAll('[data-edit-transacao]').forEach(b=>b.addEventListener('click', async ()=>{
      const todas = await DB.getAll('transacoes');
      const t = todas.find(x=>Util.mesmoId(x.id, b.dataset.editTransacao));
      if(!t) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
      const sel = ft.querySelector('[name=categoria]');
      if(![...sel.options].some(o=>o.value===t.categoria)) sel.add(new Option(t.categoria, t.categoria));
      ft.dataset.id = t.id;
      ft.querySelector('[name=tipo]').value = t.tipo;
      sel.value = t.categoria;
      ft.querySelector('[name=desc]').value = t.desc;
      ft.querySelector('[name=valor]').value = t.valor;
      ft.querySelector('[name=data]').value = t.data;
      titulo.textContent = 'Editar movimento';
      btnG.textContent = 'Guardar alterações';
      btnC.hidden = false;
      UI.revelar(ft, {behavior:'smooth', block:'center'});
    }));
  }
  /* ---------- Extrato: ver e descarregar em PDF ---------- */
  const formExtrato = document.getElementById('form-extrato');
  if(formExtrato){
    const campoDe = formExtrato.querySelector('[name=de]'), campoAte = formExtrato.querySelector('[name=ate]');
    const dataBR = Util.dataBR;
    const textoPeriodo = (de, ate) => de && ate ? `${dataBR(de)} a ${dataBR(ate)}` : de ? `desde ${dataBR(de)}` : ate ? `até ${dataBR(ate)}` : 'todo o histórico';
    const obterExtrato = async ()=>{
      const de = campoDe.value || '', ate = campoAte.value || '';
      if(de && ate && de > ate){ Util.toast('⚠️ A data inicial é depois da data final'); return null; }
      return {extrato: Calc.extratoFinanceiro(await DB.getAll('transacoes'), de, ate), de, ate};
    };
    const pintar = ({extrato:e, de, ate})=>{
      const mt = n => Util.moeda(n);
      document.getElementById('resultado-extrato').innerHTML = `
        <div class="painel-extrato">
          <h3 class="mt-0">Extrato — ${textoPeriodo(de, ate)}</h3>
          <div class="cards">
            <div class="card"><div class="label">Saldo anterior</div><div class="value">${mt(e.saldoAnterior)}</div></div>
            <div class="card"><div class="label">Entradas</div><div class="value pos">${mt(e.totalEntradas)}</div></div>
            <div class="card"><div class="label">Saídas</div><div class="value neg">${mt(e.totalSaidas)}</div></div>
            <div class="card"><div class="label">Saldo final</div><div class="value ${e.saldoFinal<0?'neg':''}">${mt(e.saldoFinal)}</div><div class="sub">Do período: ${mt(e.saldoPeriodo)}</div></div>
          </div>
          ${e.linhas.length===0 ? '<p class="empty">Sem movimentos neste período.</p>' : `
          ${Tabela.html({
            id:'fin-extrato', limite:30, busca:true, buscaPlaceholder:'Pesquisar no extrato…',
            linhas: e.linhas,
            colunas:[
              {titulo:'Data', valor:l=>dataBR(l.data)},
              {titulo:'Categoria', valor:l=>l.categoria},
              {titulo:'Descrição', valor:l=>l.desc, largo:true},
              {titulo:'Entrada', valor:l=>l.entrada==null ? '' : mt(l.entrada), num:true, classe:'pos'},
              {titulo:'Saída', valor:l=>l.saida==null ? '' : mt(l.saida), num:true, classe:'neg'},
              {titulo:'Saldo', valor:l=>mt(l.saldo), num:true}
            ]
          })}`}
        </div>`;
    };
    formExtrato.addEventListener('submit', async ev=>{ ev.preventDefault(); const r = await obterExtrato(); if(r) pintar(r); });
    document.querySelectorAll('[data-periodo]').forEach(b=>b.addEventListener('click', async ()=>{
      const p = Calc.periodoPreset(b.dataset.periodo);
      campoDe.value = p.de; campoAte.value = p.ate;
      document.querySelectorAll('[data-periodo]').forEach(x=>x.classList.toggle('ativo', x===b));
      const r = await obterExtrato(); if(r) pintar(r);
    }));
    document.getElementById('btn-extrato-pdf').addEventListener('click', async ()=>{
      const r = await obterExtrato(); if(!r) return;
      pintar(r);
      const e = r.extrato, mt = n => Util.moeda(n);
      const doc = PDF.criar('Extrato financeiro');
      doc.titulo('Extrato financeiro', `Período: ${textoPeriodo(r.de, r.ate)}`);
      doc.secao('Resumo do período');
      doc.tabela(['Descrição','Valor'], [['Saldo anterior', mt(e.saldoAnterior)], ['Total de entradas', mt(e.totalEntradas)], ['Total de saídas', mt(e.totalSaidas)], ['Saldo do período', mt(e.saldoPeriodo)], ['Saldo final', mt(e.saldoFinal)]],
        {larguras:[355,160], alinhar:['l','r'], semCabecalho:true, negritoUltima:true});
      doc.secao('Movimentos');
      if(e.linhas.length===0) doc.paragrafo('Sem movimentos neste período.');
      else doc.tabela(['Data','Categoria','Descrição','Entrada','Saída','Saldo'],
        e.linhas.map(l=>[dataBR(l.data), l.categoria, l.desc, l.entrada==null ? '' : mt(l.entrada), l.saida==null ? '' : mt(l.saida), mt(l.saldo)]),
        {larguras:[58,88,170,62,62,75], alinhar:['l','l','l','r','r','r'], corColuna:{3:[0.1,0.45,0.2], 4:[0.64,0.25,0.18]}});
      if(e.entradasPorCategoria.length){ doc.secao('Entradas por categoria'); doc.tabela(['Categoria','Valor'], e.entradasPorCategoria.map(c=>[c.categoria, mt(c.valor)]), {larguras:[355,160], alinhar:['l','r']}); }
      if(e.saidasPorCategoria.length){ doc.secao('Saídas por categoria'); doc.tabela(['Categoria','Valor'], e.saidasPorCategoria.map(c=>[c.categoria, mt(c.valor)]), {larguras:[355,160], alinhar:['l','r']}); }
      const nome = `capoeira-extrato-${r.de || 'inicio'}-a-${r.ate || Util.hoje()}.pdf`;
      doc.descarregar(nome);
      Util.toast('📄 PDF do extrato descarregado');
    });
  }

  document.querySelectorAll('[data-del-transacao]').forEach(b=>b.addEventListener('click', async ()=>{
    await DB.del('transacoes', Util.chaveId(b.dataset.delTransacao));
    await afterMutacao();
  }));
}

UI.initPagina(renderFinancas);
