/* ============ PÁGINA: FINANÇAS (despesas, receitas e saldo) ============ */

let _filtroCategoria = '';
let _filtroMes = '';

async function renderFinancas(){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="loading-msg">A carregar…</div>`;
  app.innerHTML = await viewFinancas(_filtroCategoria, _filtroMes);
  attachHandlersFinancas();
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
  <h2 class="section-title">Resumo financeiro</h2>
  <div class="cards">
    <div class="card"><div class="label">Despesas</div><div class="value neg">${Util.moeda(Calc.totalDespesas(transacoesTodas))}</div></div>
    <div class="card"><div class="label">Receitas</div><div class="value">${Util.moeda(Calc.totalReceitas(transacoesTodas))}</div></div>
    <div class="card"><div class="label">Saldo acumulado</div><div class="value ${Calc.saldo(transacoesTodas)<0?'neg':''}">${Util.moeda(Calc.saldo(transacoesTodas))}</div><div class="sub">Receitas − Despesas registadas</div></div>
  </div>
  <p class="footnote">${Icon.svg('aviso')} <strong>Este valor não é o lucro real do negócio</strong> — é apenas Receitas menos Despesas <strong>registadas</strong> na app. Coisas como mortalidade de aves, mão-de-obra própria, água, energia, ou depreciação de equipamento e infraestrutura só entram nesta conta se as lançares manualmente como despesa (ex: em "Início → Registar gasto extra"). Usa este número para acompanhar o fluxo de caixa, não como medida final de rentabilidade do negócio.</p>

  <h2 class="section-title">Visão gráfica</h2>
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

  <h2 class="section-title">Despesas por categoria (tabela)</h2>
  ${Calc.despesasPorCategoria(transacoesTodas).length===0 ? `<p class="empty">Ainda sem despesas registadas.</p>` : `
  <div class="table-scroll"><table class="responsive-stack">
    <tr><th>Categoria</th><th>Total gasto</th><th>% do total</th></tr>
    ${Calc.despesasPorCategoria(transacoesTodas).map(([cat,val])=>`<tr>
    <td data-label="Categoria">${Util.escapeHTML(cat)}</td>
    <td data-label="Total gasto" class="num-font">${Util.moeda(val)}</td>
    <td data-label="% do total">${(val/Calc.totalDespesas(transacoesTodas)*100).toFixed(0)}%</td></tr>`).join('')}
  </table></div>`}

  <h2 class="section-title">Gastos organizados por mês</h2>
  ${resumoMes.length===0 ? `<p class="empty">Ainda sem movimentos para agrupar por mês.</p>` : `
  <div class="table-scroll"><table class="responsive-stack">
    <tr><th>Mês</th><th>Despesas</th><th>Receitas</th><th>Saldo</th><th></th></tr>
    ${resumoMes.map(m=>`<tr>
      <td data-label="Mês">${m.label}</td>
      <td data-label="Despesas" class="num-font neg">${Util.moeda(m.despesas)}</td>
      <td data-label="Receitas" class="num-font">${Util.moeda(m.receitas)}</td>
      <td data-label="Saldo" class="num-font ${m.saldo<0?'neg':''}">${Util.moeda(m.saldo)}</td>
      <td class="row-actions">
        ${m.chave===filtroMes
          ? `<button type="button" class="btn small outline" data-limpar-filtro-mes="1">Limpar filtro</button>`
          : `<button type="button" class="btn small outline" data-filtro-mes="${m.chave}">Ver movimentos</button>`}
      </td>
    </tr>`).join('')}
  </table></div>`}

  <h2 class="section-title" id="titulo-form-transacao">Registar movimento</h2>
  <form id="form-transacao" class="inline" data-id="">
    <label>Tipo
      <select name="tipo"><option value="despesa">Despesa</option><option value="receita">Receita</option></select>
    </label>
    <label>Categoria
      <select name="categoria">
        <option>Alimentação</option><option>Venda de aves</option><option>Venda de ovos</option>
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

  <h2 class="section-title">Histórico de movimentos</h2>
  <form class="inline" id="form-filtro-categoria" style="margin-bottom:6px;">
    <label>Filtrar por categoria
      <select name="filtroCategoria">
        <option value="">Todas</option>
        ${categoriasDisponiveis.map(c=>`<option value="${Util.escapeHTML(c)}" ${c===filtroCategoria?'selected':''}>${Util.escapeHTML(c)}</option>`).join('')}
      </select>
    </label>
  </form>
  ${transacoes.length===0 ? `<p class="empty">Sem movimentos registados${filtroCategoria?` para "${filtroCategoria}"`:''}${filtroMes?` em ${Calc.formatarMes(filtroMes)}`:''}.</p>` : `
  <div class="table-scroll"><table class="responsive-stack">
    <tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th></th></tr>
    ${transacoes.slice().reverse().map(t=>`<tr>
      <td data-label="Data">${t.data}</td>
      <td data-label="Tipo">${t.tipo==='despesa'?`${Icon.svg('descida')} Despesa`:`${Icon.svg('subida')} Receita`}</td>
      <td data-label="Categoria">${Util.escapeHTML(t.categoria)}</td>
      <td data-label="Descrição">${Util.escapeHTML(t.desc)}</td>
      <td data-label="Valor" class="num-font">${t.tipo==='despesa'?'-':'+'}${Util.moeda(t.valor)}</td>
      <td class="row-actions"><button class="btn small outline" data-edit-transacao="${t.id}">Editar</button> <button class="btn small danger" data-del-transacao="${t.id}">Apagar</button></td>
    </tr>`).join('')}
  </table></div>`}
  `;
}

function attachHandlersFinancas(){
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
        const id = Number(ft.dataset.id);
        const todas = await DB.getAll('transacoes');
        const antiga = todas.find(t=>t.id===id);
        await DB.put('transacoes', {...(antiga||{}), ...dados, id});
        await afterMutacao('Movimento actualizado');
      }else{
        await DB.add('transacoes', dados);
        await afterMutacao('Movimento registado');
      }
    });
    document.querySelectorAll('[data-edit-transacao]').forEach(b=>b.addEventListener('click', async ()=>{
      const todas = await DB.getAll('transacoes');
      const t = todas.find(x=>x.id===Number(b.dataset.editTransacao));
      if(!t) return;
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
      ft.scrollIntoView({behavior:'smooth', block:'center'});
    }));
  }
  document.querySelectorAll('[data-del-transacao]').forEach(b=>b.addEventListener('click', async ()=>{
    await DB.del('transacoes', Number(b.dataset.delTransacao));
    await afterMutacao();
  }));
}

UI.initPagina(renderFinancas);
