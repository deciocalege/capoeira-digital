/* @revisao 2.18.0 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).alimentacao = '2.18.0';
/* ============ PÁGINA: ALIMENTAÇÃO (stock de ração e consumo) ============ */

let misturaEmEdicao = null; // id da mistura a editar, 'nova' ou null
let _alim = {planos:[], aves:[], produtos:[], gruposPlano:[]}; // dados da página usados pelos botões

async function renderAlimentacao(){
  const app = document.getElementById('app');
  await UI.redesenhar(app, () => viewAlimentacao(), () => { attachHandlersAlimentacao(); });
}

async function afterMutacao(msg){
  if(msg) Util.toast(msg);
  await renderAlimentacao();
}

function cartaoMistura(m){
  const emEdicao = (m.id === '' && misturaEmEdicao === 'nova') || (m.id !== '' && Util.mesmoId(m.id, misturaEmEdicao));
  if(emEdicao){
    return `<div class="compartimento">
      <form class="form-mistura stack" data-id="${m.id}">
        <label>Nome <input name="nome" value="${Util.escapeHTML(m.nome)}" required maxlength="40"></label>
        <label>Composição <input name="composicao" value="${Util.escapeHTML(m.composicao)}" maxlength="120"></label>
        <label>Para quem (separa por vírgulas) <input name="destino" value="${Util.escapeHTML(m.destino)}" maxlength="120"></label>
        <p class="row-actions"><button class="btn small" type="submit">Guardar</button> <button class="btn small outline" type="button" id="btn-cancelar-mistura">Cancelar</button></p>
      </form>
    </div>`;
  }
  const tags = (m.destino||'').split(',').map(t=>t.trim()).filter(Boolean)
    .map(t=>`<p class="tag">${Util.escapeHTML(t)}</p>`).join('');
  return `<div class="compartimento">
    <h3>Mistura ${Util.escapeHTML(m.nome)}</h3>
    <p class="footnote">${Util.escapeHTML(m.composicao||'')}</p>
    ${tags}
    <p class="row-actions mt-2"><button class="btn small outline" data-edit-mistura="${m.id}">Editar</button> <button class="btn small danger outline" data-del-mistura="${m.id}">Apagar</button></p>
  </div>`;
}

async function viewAlimentacao(){
  const [feedStock, consumo, misturas, planos, aves, compartimentos] = await Promise.all([
    DB.getAll('feedStock'), DB.getAll('consumo'), DB.getAll('misturas'),
    DB.getAll('planosAlimentares'), DB.getAll('aves'), DB.getAll('compartimentos')
  ]);
  const produtos = Calc.produtosStock(feedStock, consumo);
  const compNome = {}; compartimentos.forEach(c=>{ compNome[c.id]=c.nome; });
  const hoje = Util.hoje();
  const especies = [...new Set(aves.map(a=>a.especie).concat(planos.map(p=>p.especie)).filter(Boolean))].sort();
  const gruposPlano = [...new Set(planos.map(p=>p.especie).filter(Boolean))].sort();
  const chavesStock = new Set(produtos.map(p=>p.chave));
  _alim = {planos, aves, produtos, gruposPlano};
  const custoLotes = Calc.custoRacaoPorLote(consumo, feedStock);
  return `
  <h2 class="section-title" id="sec-stock">Stock de ração</h2>
  ${produtos.length===0 ? `<p class="empty">Ainda sem stock — regista a primeira compra mais abaixo.</p>` : ''}
  <div class="cards cards-detalhe">
    ${produtos.map(p=>{
      const pct = p.kgComprado>0 ? Math.max(0, Math.min(100, p.restante/p.kgComprado*100)) : 0;
      const ritmo = Calc.consumoPlaneadoDiarioKg(p.nome, aves, planos);
      const dura = ritmo>0 ? Math.floor(p.restante/ritmo) : null;
      return `<div class="card">
        <div class="label">${Util.escapeHTML(p.nome)}</div>
        <div class="value">${p.restante.toFixed(1)}kg</div>
        <div class="sub">de ${p.kgComprado.toFixed(1)}kg · ${p.itens.length} compra(s)${p.custoMedioKg!=null ? ` · ${Util.moeda(p.custoMedioKg)}/kg` : ''}</div>
        ${p.excedente>0 ? `<div class="sub txt-erro">${Icon.svg('aviso')} Consumo acima do comprado: +${p.excedente.toFixed(1)}kg</div>` : ''}
        ${ritmo>0 ? `<div class="sub">Ritmo do plano: ${ritmo.toFixed(2)} kg/dia → dura cerca de ${dura} dia(s)</div>` : ''}
        <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
  ${UI.podeFinancas() ? `
        <details class="mt-2"><summary>Compras (${p.itens.length})</summary>
          ${p.itens.map(i=>`<div class="compra-linha">
            <span>${Util.dataBR(i.dataCompra) || '—'} · ${i.kgComprado} kg · ${Util.moeda(i.custoTotal)}</span>
            <span class="acoes-mini"><button class="btn small outline" data-edit-stock="${i.id}">Editar</button><button class="btn small danger outline" data-del-stock="${i.id}">Remover</button></span></div>`).join('')}
        </details>
  ` : ''}
      </div>`;
    }).join('')}
  </div>

  <div id="painel-editar-compra"></div>

  <h2 class="section-title" id="sec-lotes">Lotes e consumo automático</h2>
  <div id="painel-lote"></div>
  ${aves.length===0 ? `<p class="empty">Ainda sem lotes — regista aves em Gestão.</p>` : `
  <div class="table-scroll"><table class="responsive-stack">
    <tr><th>Lote</th><th>Qtd</th><th>Idade</th><th>Hoje come</th><th>Kg/dia</th><th>Ração gasta</th><th>Automático</th><th></th></tr>
    ${aves.map(a=>{
      const idade = Calc.idadeLoteEm(a, hoje);
      const c = Calc.consumoDiarioLote(a, hoje, planos);
      return `<tr>
        <td data-label="Lote">${Util.escapeHTML(a.especie)}<br><span class="footnote">${Util.escapeHTML(compNome[a.compartimentoId]||'')}</span></td>
        <td data-label="Qtd">${a.qtd}</td>
        <td data-label="Idade">${idade==null ? '—' : idade+' dias'}</td>
        <td data-label="Hoje come">${c ? Util.escapeHTML(c.produto)+' ('+c.gramas+' g)'+`<br><span class="footnote">${c.fase.proprio ? 'ração própria do lote' : 'plano "'+Util.escapeHTML(c.fase.especie)+'"'}</span>` : '— sem plano'}</td>
        <td data-label="Kg/dia">${c ? c.kg.toFixed(2) : '—'}</td>
        <td data-label="Ração gasta">${custoLotes[a.id] ? `${custoLotes[a.id].kg} kg · ${Util.moeda(custoLotes[a.id].custo)}${a.qtd>0 ? `<br><span class="footnote">${Util.moeda(custoLotes[a.id].custo/a.qtd)}/ave</span>` : ''}${custoLotes[a.id].semPreco ? '<br><span class="footnote">(sem preço em parte)</span>' : ''}` : '—'}</td>
        <td data-label="Automático">${a.autoDesde ? 'Ligado desde '+a.autoDesde : 'Desligado'}</td>
        <td class="row-actions"><button class="btn small outline" data-cfg-lote="${a.id}">Configurar</button></td></tr>`;
    }).join('')}
  </table></div>`}

  <h2 class="section-title" id="sec-previsao">Previsão de consumo</h2>
  <p class="footnote">${Icon.svg('dica')} Quantos quilos vão ser precisos para um número de aves durante X dias, atravessando as fases do plano.</p>
  <form id="form-previsao" class="inline">
    <label>Usar um lote
      <select name="lote"><option value="">— nenhum —</option>${aves.map(a=>`<option value="${a.id}">${Util.escapeHTML(a.especie)} (${a.qtd}) · ${Util.escapeHTML(compNome[a.compartimentoId]||'')}</option>`).join('')}</select>
    </label>
    <label>Espécie <input type="text" name="especie" list="lista-especies-plano" required></label>
    <label>Nº de aves <input type="number" name="nAves" min="1" value="10" required></label>
    <label>Idade inicial (dias) <input type="number" name="idadeInicial" min="0" value="0"></label>
    <label>Durante (dias) <input type="number" name="dias" min="1" max="365" value="30" required></label>
    <button class="btn" type="submit">Calcular</button>
  </form>
  <div id="resultado-previsao"></div>

  <h2 class="section-title" id="sec-misturas">Misturas usadas</h2>
  <div class="split">
    ${misturas.map(m=>cartaoMistura(m)).join('')}
    ${misturaEmEdicao==='nova' ? cartaoMistura({id:'', nome:'', composicao:'', destino:''}) : ''}
  </div>
  ${misturaEmEdicao ? '' : `<p class="my-2"><button class="btn small outline" id="btn-nova-mistura">+ Nova mistura</button></p>`}

  <h2 class="section-title" id="sec-plano">Plano alimentar por espécie</h2>
  <p class="footnote">${Icon.svg('dica')} Define em fases o que cada espécie come conforme os dias de vida (ex.: Ração A1 do dia 0 ao 29 e Ração A2 do dia 30 em diante). A app usa isto para abater o stock todos os dias, avisar quando for altura de trocar e calcular previsões.</p>
  ${especies.length===0 ? `<p class="empty">Ainda não há aves nem planos. Regista aves em Gestão ou adiciona uma fase abaixo.</p>` : especies.map(esp=>{
    const fases = Calc.planoDaEspecie(planos, esp);
    const ehGeral = ['galinha','pato','ganso'].includes(Calc.chaveProduto(esp));
    return `<div class="compartimento"><h3>${Util.escapeHTML(esp)}${ehGeral ? ' <span class="badge">plano geral</span>' : ''}</h3>
      ${ehGeral ? `<p class="footnote">Aplica-se a todas as raças de ${Util.escapeHTML(esp.toLowerCase())} que não tenham plano próprio.</p>` : ''}
      ${fases.length===0 ? `<p class="footnote">Sem plano — adiciona a primeira fase no formulário abaixo.</p>` : `
      <div class="table-scroll"><table class="responsive-stack">
        <tr><th>Dias de vida</th><th>Produto</th><th>g/ave/dia</th><th></th></tr>
        ${fases.map(f=>`<tr>
          <td data-label="Dias de vida">${f.diaInicio}–${(f.diaFim==null||f.diaFim==='') ? 'em diante' : f.diaFim}</td>
          <td data-label="Produto">${Util.escapeHTML(f.produto)}${chavesStock.has(Calc.chaveProduto(f.produto)) ? '' : '<br><span class="footnote txt-erro">sem stock registado</span>'}</td>
          <td data-label="g/ave/dia">${f.gramas}</td>
          <td class="row-actions"><button class="btn small outline" data-edit-fase="${f.id}">Editar</button> <button class="btn small danger" data-del-fase="${f.id}">Apagar</button></td></tr>`).join('')}
      </table></div>`}
    </div>`;
  }).join('')}
  <details id="det-modelos" class="my-3"><summary><strong>Modelos prontos de plano</strong> (Sasso, patos, poedeiras)</summary>
    <p class="footnote">${Icon.svg('aviso')} São <strong>valores de referência para começar</strong>, com ração à vontade. Ajusta sempre ao rótulo da tua ração, às pesagens e ao consumo real. Cada modelo indica a fonte.</p>
    <label class="campo-bloco">Modelo
      <select id="sel-modelo"><option value="">— escolhe —</option>${Calc.MODELOS_PLANO.map(m=>`<option value="${m.id}">${Util.escapeHTML(m.titulo)}</option>`).join('')}</select>
    </label>
    <div id="painel-modelo"></div>
  </details>

  <h3 id="titulo-form-fase">Adicionar fase</h3>
  <form id="form-fase" class="inline" data-id="">
    <label>Espécie/Grupo <input type="text" name="especie" list="lista-especies-plano" placeholder="ex: Pato Muscovy" required></label>
    <datalist id="lista-especies-plano">${especies.map(e=>`<option value="${Util.escapeHTML(e)}">`).join('')}</datalist>
    <label>Produto <input type="text" name="produto" list="lista-produtos" placeholder="ex: Ração A1" required></label>
    <label>Do dia de vida <input type="number" name="diaInicio" min="0" value="0" required></label>
    <label>Até ao dia (vazio = sem fim) <input type="number" name="diaFim" min="0"></label>
    <label>Gramas por ave por dia <input type="number" name="gramas" min="1" step="1" required></label>
    <button class="btn" type="submit" id="btn-guardar-fase">Adicionar fase</button>
    <button class="btn outline" type="button" id="btn-cancelar-fase" hidden>Cancelar edição</button>
  </form>

  ${UI.podeFinancas() ? `
  <h2 class="section-title" id="sec-compra">Registar compra de ração / ingrediente</h2>
  <form id="form-stock" class="inline">
    <label>Produto <input type="text" name="nome" list="lista-produtos" placeholder="ex: Ração A1" required></label>
    <datalist id="lista-produtos">${produtos.map(p=>`<option value="${Util.escapeHTML(p.nome)}">`).join('')}</datalist>
    <label>Kg comprados <input type="number" step="0.1" min="0.1" name="kgComprado" required></label>
    <label>Custo total (MT) <input type="number" step="1" min="0" name="custoTotal" required></label>
    <label>Data da compra <input type="date" name="dataCompra" value="${hoje}" required></label>
    <button class="btn" type="submit">Registar compra</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} Se já existir um produto com o mesmo nome, a compra <strong>soma-se ao que sobrou</strong>. A despesa é criada automaticamente em Finanças (e podes apagá-la ao remover a compra). O abate diário só começa na data da compra.</p>
  ` : ''}

  <h2 class="section-title" id="sec-consumo">Registar consumo à mão (ajustes)</h2>
  <form id="form-consumo" class="stack mt-3">
    <div class="inline m-0">
      <label>Data <input type="date" name="data" value="${hoje}" required></label>
      <label>Mistura
        <select name="mistura">${misturas.map(m=>`<option>${Util.escapeHTML(m.nome)}</option>`).join('')}</select>
      </label>
    </div>
    <p class="footnote">${Icon.svg('dica')} O consumo dos lotes com abate automático já é lançado sozinho todos os dias. Usa este formulário para lotes sem plano ou para corrigir um dia: o valor que indicares <strong>substitui</strong> o lançamento automático desse produto nesse dia.</p>
    <div class="inline m-0">
      ${produtos.length===0 ? `<p class="empty">Regista primeiro uma compra de ração acima.</p>` :
        produtos.map(p=>`<label>${Util.escapeHTML(p.nome)} (kg) <input type="number" step="0.1" min="0" data-chave="${Util.escapeHTML(p.chave)}" value="0"></label>`).join('')}
    </div>
    <button class="btn alinha-inicio" type="submit">Registar consumo</button>
  </form>

  <h2 class="section-title" id="sec-historico">Histórico de consumo</h2>
  <div id="painel-editar-consumo"></div>
  ${consumo.length===0 ? `<p class="empty">Ainda sem registos — regista o consumo diário acima para acompanhar quanto tempo dura a ração.</p>` : `
  ${Tabela.html({
    id:'alim-consumo', limite:25, busca:true, buscaPlaceholder:'Pesquisar produto, lote…',
    linhas: consumo.slice().reverse(),
    colunas:[
      {titulo:'Data', valor:c=>Util.dataBR(c.data)},
      {titulo:'Produto', valor:c=>c.item, largo:true},
      {titulo:'Kg', valor:c=>c.kg, num:true},
      {titulo:'Origem', valor:c=>c.venda ? 'Venda' : c.auto ? `Automático${c.loteNome ? ' · '+Tabela.esc(c.loteNome) : ''}` : Tabela.esc(c.mistura), html:true, largo:true}
    ],
    acoes: c => `${c.venda ? '<a href="vendas.html" class="footnote">ver em Vendas</a>' : `<button class="btn small outline" data-edit-consumo="${c.id}">Editar</button> <button class="btn small danger" data-del-consumo="${c.id}">Apagar</button>`}`
  })}`}
  `;
}

function attachHandlersAlimentacao(){
  UI.separadores(document.getElementById('app'), 'alimentacao', [
    {id:'stock', titulo:'Stock', icone:'trigo', secoes:['sec-stock','sec-lotes','sec-previsao','sec-misturas']},
    {id:'plano', titulo:'Plano', icone:'lista', secoes:['sec-plano']},
    {id:'registar', titulo:'Registar', icone:'mais', secoes:['sec-compra','sec-consumo']},
    {id:'historico', titulo:'Histórico', icone:'lista', secoes:['sec-historico']}
  ]);
  const fstock = document.getElementById('form-stock');
  if(fstock) fstock.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fstock);
    const nome = String(fd.get('nome')||'').trim();
    const kgComprado = Number(fd.get('kgComprado'));
    const custoTotal = Number(fd.get('custoTotal'));
    if(!nome){ Util.toast('⚠️ Indica o nome do produto'); return; }
    if(!(kgComprado>0)){ Util.toast('⚠️ Indica os kg comprados (maior que 0)'); return; }
    if(!(custoTotal>=0)){ Util.toast('⚠️ Indica um custo válido'); return; }
    const novo = {nome, kgComprado, custoTotal, dataCompra:fd.get('dataCompra')};
    /* Compra + despesa em Finanças numa única transação; a despesa fica
       ligada à compra (feedStockId) para poder ser apagada com ela. */
    try{
      await DB.transacao(['feedStock','transacoes'], async (tx)=>{
        const idStock = await DB.reqToPromise(tx.objectStore('feedStock').add(novo));
        await DB.reqToPromise(tx.objectStore('transacoes').add({
          tipo:'despesa', categoria:'Alimentação', desc:`Compra de ${nome} (${kgComprado}kg)`,
          valor:custoTotal, data:novo.dataCompra, feedStockId:idStock
        }));
      });
    }catch(err){ UI.avisarErro(err, 'Alimentação'); return; }
    await UI.aplicarConsumoAutomatico();
    await afterMutacao('Compra registada — despesa criada em Finanças');
  });

  document.querySelectorAll('[data-edit-stock]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = Util.chaveId(b.dataset.editStock);   // número (ids antigos) ou UUID
    const [stock, trans] = await Promise.all([DB.getAll('feedStock'), DB.getAll('transacoes')]);
    const item = stock.find(i=>Util.mesmoId(i.id, id));
    const painel = document.getElementById('painel-editar-compra');
    if(!item || !painel) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    const acharDespesa = it => trans.find(t=>Util.mesmoId(t.feedStockId, it.id)) || trans.find(t=>t.tipo==='despesa' && t.categoria==='Alimentação'
      && Number(t.valor)===Number(it.custoTotal) && t.data===it.dataCompra && String(t.desc||'').startsWith('Compra de '+it.nome));
    const despesa = acharDespesa(item);
    painel.innerHTML = `
      <div class="compartimento">
        <h3>Editar compra — ${Util.escapeHTML(item.nome)}</h3>
        <form id="form-editar-compra" class="inline">
          <label>Kg comprados <input type="number" step="0.1" min="0.1" name="kgComprado" value="${item.kgComprado}" required></label>
          <label>Custo total (MT) <input type="number" step="1" min="0" name="custoTotal" value="${item.custoTotal}" required></label>
          <label>Data da compra <input type="date" name="dataCompra" value="${item.dataCompra||''}" required></label>
          <button class="btn" type="submit">Guardar</button>
          <button class="btn outline" type="button" id="btn-cancelar-edit-compra">Cancelar</button>
        </form>
        <p class="footnote">${Icon.svg('dica')} ${despesa ? 'A despesa correspondente em Finanças será actualizada com os novos valores.' : 'Esta compra não tem despesa ligada em Finanças.'} O nome do produto não se altera aqui (para não baralhar o histórico). Passar a data para mais tarde não apaga lançamentos automáticos já feitos.</p>
      </div>`;
    UI.revelar(painel, {behavior:'smooth', block:'center'});
    document.getElementById('btn-cancelar-edit-compra').addEventListener('click', ()=>{ painel.innerHTML = ''; });
    document.getElementById('form-editar-compra').addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const kgComprado = Number(fd.get('kgComprado'));
      const custoTotal = Number(fd.get('custoTotal'));
      const dataCompra = fd.get('dataCompra');
      if(!(kgComprado>0)){ Util.toast('⚠️ Indica os kg comprados (maior que 0)'); return; }
      if(!(custoTotal>=0)){ Util.toast('⚠️ Indica um custo válido'); return; }
      try{
        await DB.transacao(['feedStock','transacoes'], async (tx)=>{
          await DB.reqToPromise(tx.objectStore('feedStock').put({...item, kgComprado, custoTotal, dataCompra}));
          if(despesa){
            await DB.reqToPromise(tx.objectStore('transacoes').put({
              ...despesa, feedStockId:item.id, valor:custoTotal, data:dataCompra, desc:`Compra de ${item.nome} (${kgComprado}kg)`
            }));
          }
        });
      }catch(err){ UI.avisarErro(err, 'Alimentação'); return; }
      await UI.aplicarConsumoAutomatico();
      await afterMutacao(despesa ? 'Compra e despesa actualizadas' : 'Compra actualizada');
    });
  }));

  document.querySelectorAll('[data-del-stock]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = Util.chaveId(b.dataset.delStock);
    const [stock, trans] = await Promise.all([DB.getAll('feedStock'), DB.getAll('transacoes')]);
    const item = stock.find(i=>Util.mesmoId(i.id, id));
    if(!item) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    if(!confirm(`Remover esta compra de "${item.nome}" (${item.kgComprado}kg)? O histórico de consumo já registado não é apagado.`)) return;
    let despesa = trans.find(t=>Util.mesmoId(t.feedStockId, id));
    if(!despesa){
      despesa = trans.find(t=>t.tipo==='despesa' && t.categoria==='Alimentação' && Number(t.valor)===Number(item.custoTotal)
        && t.data===item.dataCompra && String(t.desc||'').startsWith('Compra de '+item.nome));
    }
    const apagarDespesa = despesa ? confirm(`Apagar também a despesa correspondente em Finanças (${Util.moeda(despesa.valor)}, ${despesa.data})?`) : false;
    try{
      await DB.transacao(['feedStock','transacoes'], async (tx)=>{
        await DB.reqToPromise(tx.objectStore('feedStock').delete(id));
        if(apagarDespesa) await DB.reqToPromise(tx.objectStore('transacoes').delete(despesa.id));
      });
    }catch(err){ UI.avisarErro(err, 'Alimentação'); return; }
    await afterMutacao(apagarDespesa ? 'Compra e despesa removidas' : 'Compra removida');
  }));

  const fc = document.getElementById('form-consumo');
  if(fc) fc.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fc);
    const data = fd.get('data');
    const mistura = fd.get('mistura');
    const [stockAtual, consumoAtual] = await Promise.all([DB.getAll('feedStock'), DB.getAll('consumo')]);
    const prods = Calc.produtosStock(stockAtual, consumoAtual);
    const aRegistar = [...fc.querySelectorAll('input[data-chave]')]
      .map(inp=>({p: prods.find(p=>p.chave===inp.dataset.chave), kg: Number(inp.value)||0}))
      .filter(x=>x.p && x.kg>0);
    if(aRegistar.length===0){ Util.toast('⚠️ Indica pelo menos um produto com quantidade maior que 0'); return; }
    const autoDoDia = p => consumoAtual.filter(c=>c.auto && c.data===data && Calc.chaveProduto(c.item)===p.chave).reduce((s,c)=>s+Number(c.kg),0);
    const acima = aRegistar.filter(x=>x.kg > x.p.restante + autoDoDia(x.p));
    if(acima.length && !confirm(`Atenção: o consumo de ${acima.map(x=>x.p.nome).join(', ')} é maior do que o stock disponível.\n\nRegistar mesmo assim?`)) return;
    try{
      await DB.transacao(['consumo'], async (tx)=>{
        const store = tx.objectStore('consumo');
        const todos = await DB.reqToPromise(store.getAll());
        for(const {p, kg} of aRegistar){
          for(const c of todos){
            if(c.auto && c.data===data && Calc.chaveProduto(c.item)===p.chave) await DB.reqToPromise(store.delete(c.id));
          }
          await DB.reqToPromise(store.add({feedStockId:p.itens[p.itens.length-1].id, item:p.nome, kg, mistura, data}));
        }
      });
    }catch(err){ UI.avisarErro(err, 'Alimentação'); return; }
    await afterMutacao(`Consumo registado (${aRegistar.length} produto${aRegistar.length>1?'s':''})`);
  });
  document.querySelectorAll('[data-del-consumo]').forEach(b=>b.addEventListener('click', async ()=>{
    await DB.del('consumo', Util.chaveId(b.dataset.delConsumo));
    await afterMutacao();
  }));

  document.querySelectorAll('[data-edit-consumo]').forEach(b=>b.addEventListener('click', async ()=>{
    const [todos, stock, misturas] = await Promise.all([DB.getAll('consumo'), DB.getAll('feedStock'), DB.getAll('misturas')]);
    const c = todos.find(x=>Util.mesmoId(x.id, b.dataset.editConsumo));
    const painel = document.getElementById('painel-editar-consumo');
    if(!c || !painel) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    const prods = Calc.produtosStock(stock, []);
    const chaveAtual = Calc.chaveProduto(c.item);
    const optsStock = prods.map(p=>`<option value="${Util.escapeHTML(p.chave)}" ${p.chave===chaveAtual?'selected':''}>${Util.escapeHTML(p.nome)}</option>`).join('');
    const optsMist = misturas.map(m=>`<option ${m.nome===c.mistura?'selected':''}>${Util.escapeHTML(m.nome)}</option>`).join('')
      + (misturas.some(m=>m.nome===c.mistura) ? '' : `<option selected>${Util.escapeHTML(c.mistura)}</option>`);
    painel.innerHTML = `
      <div class="compartimento">
        <h3>Editar consumo</h3>
        <form id="form-editar-consumo" class="inline">
          <label>Data <input type="date" name="data" value="${c.data}" required></label>
          <label>Produto <select name="produto">${optsStock}</select></label>
          <label>Kg <input type="number" step="0.01" min="0.01" name="kg" value="${c.kg}" required></label>
          <label>Mistura <select name="mistura">${optsMist}</select></label>
          <button class="btn" type="submit">Guardar</button>
          <button class="btn outline" type="button" id="btn-cancelar-edit-consumo">Cancelar</button>
        </form>
      </div>`;
    UI.revelar(painel, {behavior:'smooth', block:'center'});
    document.getElementById('btn-cancelar-edit-consumo').addEventListener('click', ()=>{ painel.innerHTML = ''; });
    document.getElementById('form-editar-consumo').addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const kg = Number(fd.get('kg'));
      const prod = prods.find(p=>p.chave===fd.get('produto'));
      if(!prod){ Util.toast('⚠️ Escolhe um produto'); return; }
      if(!(kg>0)){ Util.toast('⚠️ Indica uma quantidade maior que 0'); return; }
      await DB.put('consumo', {...c, data:fd.get('data'), feedStockId:prod.itens[prod.itens.length-1].id, item:prod.nome, kg, mistura:fd.get('mistura')});
      await afterMutacao('Consumo actualizado');
    });
  }));

  document.querySelectorAll('[data-del-mistura]').forEach(b=>b.addEventListener('click', async ()=>{
    const todas = await DB.getAll('misturas');
    if(todas.length<=1){ Util.toast('⚠️ Tem de existir pelo menos uma mistura'); return; }
    if(!confirm('Apagar esta mistura? Os registos de consumo antigos mantêm o nome dela.')) return;
    await DB.del('misturas', Util.chaveId(b.dataset.delMistura));
    await afterMutacao('Mistura apagada');
  }));

  document.querySelectorAll('[data-edit-mistura]').forEach(b=>b.addEventListener('click', async ()=>{
    misturaEmEdicao = Util.chaveId(b.dataset.editMistura);
    await renderAlimentacao();
  }));
  const bNova = document.getElementById('btn-nova-mistura');
  if(bNova) bNova.addEventListener('click', async ()=>{ misturaEmEdicao = 'nova'; await renderAlimentacao(); });
  const bCancel = document.getElementById('btn-cancelar-mistura');
  if(bCancel) bCancel.addEventListener('click', async ()=>{ misturaEmEdicao = null; await renderAlimentacao(); });
  const fm = document.querySelector('.form-mistura');
  if(fm) fm.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fm);
    const nome = String(fd.get('nome')||'').trim();
    if(!nome){ Util.toast('⚠️ Indica o nome da mistura'); return; }
    const composicao = String(fd.get('composicao')||'').trim();
    const destino = String(fd.get('destino')||'').trim();
    const id = fm.dataset.id === '' ? null : Util.chaveId(fm.dataset.id);
    const todas = await DB.getAll('misturas');
    if(todas.some(m=>!Util.mesmoId(m.id, id) && Util.normalizarTexto(m.nome)===Util.normalizarTexto(nome))){
      Util.toast('⚠️ Já existe uma mistura com esse nome'); return;
    }
    const antigo = id==null ? null : todas.find(m=>Util.mesmoId(m.id, id));
    try{
      await DB.transacao(['misturas','consumo'], async (tx)=>{
        const ms = tx.objectStore('misturas');
        if(id==null){
          await DB.reqToPromise(ms.add({nome, composicao, destino}));
        }else{
          await DB.reqToPromise(ms.put({...antigo, nome, composicao, destino}));
          if(antigo && antigo.nome !== nome){
            const cs = tx.objectStore('consumo');
            const registos = await DB.reqToPromise(cs.getAll());
            for(const c of registos){
              if(c.mistura === antigo.nome) await DB.reqToPromise(cs.put({...c, mistura:nome}));
            }
          }
        }
      });
    }catch(err){ UI.avisarErro(err, 'Alimentação'); return; }
    misturaEmEdicao = null;
    await afterMutacao('Mistura guardada');
  });
  /* ---- Plano alimentar: fases ---- */
  const ff = document.getElementById('form-fase');
  if(ff){
    const titulo = document.getElementById('titulo-form-fase');
    const btnG = document.getElementById('btn-guardar-fase');
    const btnC = document.getElementById('btn-cancelar-fase');
    btnC.addEventListener('click', ()=>{
      ff.reset(); ff.dataset.id = '';
      titulo.textContent = 'Adicionar fase'; btnG.textContent = 'Adicionar fase'; btnC.hidden = true;
    });
    ff.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(ff);
      const especie = String(fd.get('especie')||'').trim();
      const produto = String(fd.get('produto')||'').trim();
      const diaInicio = Math.round(Number(fd.get('diaInicio')));
      const diaFimBruto = String(fd.get('diaFim')||'').trim();
      const diaFim = diaFimBruto==='' ? null : Math.round(Number(diaFimBruto));
      const gramas = Number(fd.get('gramas'));
      if(!especie || !produto){ Util.toast('⚠️ Indica a espécie e o produto'); return; }
      if(!(diaInicio>=0)){ Util.toast('⚠️ O dia inicial tem de ser 0 ou mais'); return; }
      if(diaFim!==null && !(diaFim>=diaInicio)){ Util.toast('⚠️ O dia final tem de ser igual ou maior que o inicial'); return; }
      if(!(gramas>0)){ Util.toast('⚠️ Indica as gramas por ave por dia (maior que 0)'); return; }
      const todas = await DB.getAll('planosAlimentares');
      const idEdit = ff.dataset.id ? Util.chaveId(ff.dataset.id) : null;
      const outras = todas.filter(p=>Calc.chaveProduto(p.especie)===Calc.chaveProduto(especie) && !Util.mesmoId(p.id, idEdit));
      if(Calc.fasesSobrepoem(outras, {diaInicio, diaFim})){ Util.toast('⚠️ Esta fase sobrepõe-se a outra fase do mesmo plano'); return; }
      const reg = {especie, produto, diaInicio, diaFim, gramas};
      if(idEdit){
        const antiga = todas.find(p=>Util.mesmoId(p.id, idEdit));
        await DB.put('planosAlimentares', {...(antiga||{}), ...reg, id:idEdit});
      }else{
        await DB.add('planosAlimentares', reg);
      }
      await UI.aplicarConsumoAutomatico();
      await afterMutacao(idEdit ? 'Fase actualizada' : 'Fase adicionada ao plano');
    });
    document.querySelectorAll('[data-edit-fase]').forEach(b=>b.addEventListener('click', ()=>{
      const f = _alim.planos.find(p=>Util.mesmoId(p.id, b.dataset.editFase));
      if(!f) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
      ff.dataset.id = f.id;
      ff.querySelector('[name=especie]').value = f.especie;
      ff.querySelector('[name=produto]').value = f.produto;
      ff.querySelector('[name=diaInicio]').value = f.diaInicio;
      ff.querySelector('[name=diaFim]').value = (f.diaFim==null) ? '' : f.diaFim;
      ff.querySelector('[name=gramas]').value = f.gramas;
      titulo.textContent = 'Editar fase'; btnG.textContent = 'Guardar alterações'; btnC.hidden = false;
      UI.revelar(ff, {behavior:'smooth', block:'center'});
    }));
  }
  document.querySelectorAll('[data-del-fase]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('Apagar esta fase do plano? Os lançamentos de consumo já feitos não são alterados.')) return;
    await DB.del('planosAlimentares', Util.chaveId(b.dataset.delFase));
    await afterMutacao('Fase apagada');
  }));

  /* ---- Modelos prontos de plano ---- */
  const selModelo = document.getElementById('sel-modelo');
  const painelModelo = document.getElementById('painel-modelo');
  if(selModelo && painelModelo) selModelo.addEventListener('change', ()=>{
    const m = Calc.MODELOS_PLANO.find(x=>x.id===selModelo.value);
    if(!m){ painelModelo.innerHTML = ''; return; }
    const produtosModelo = [...new Set(m.fases.map(f=>f.produto))];
    painelModelo.innerHTML = `
      <div class="compartimento">
        <h3>${Util.escapeHTML(m.titulo)}</h3>
        <p class="footnote">${Util.escapeHTML(m.nota)}</p>
        ${Tabela.html({
          id:'alim-modelo-'+Util.normalizarTexto(m.titulo).replace(/[^a-z0-9]+/g,'-'),
          linhas: m.fases,
          colunas:[
            {titulo:'Dias de vida', valor:f=>`${f.diaInicio}–${f.diaFim==null ? 'em diante' : f.diaFim}`},
            {titulo:'Produto', valor:f=>f.produto, largo:true},
            {titulo:'g/ave/dia', valor:f=>f.gramas, num:true}
          ]
        })}
        <form id="form-modelo" class="inline">
          <label>Aplicar ao grupo <input type="text" name="grupo" list="lista-grupos-modelo" value="${Util.escapeHTML(m.grupoSugerido)}" required></label>
          <datalist id="lista-grupos-modelo">${['Galinha','Pato','Ganso'].concat(_alim.gruposPlano).map(g=>`<option value="${Util.escapeHTML(g)}">`).join('')}</datalist>
          ${produtosModelo.map((p,i)=>`<label>O teu produto para "${Util.escapeHTML(p)}" <input type="text" name="prod${i}" list="lista-produtos" value="${Util.escapeHTML(p)}" required></label>`).join('')}
          <button class="btn" type="submit">Adicionar fases ao plano</button>
        </form>
        <p class="footnote">${Icon.svg('dica')} Escreve o nome do grupo como o das tuas aves (ex.: "Galinha Sasso") para valer só para essa raça, ou só "Galinha"/"Pato" para um <strong>plano geral</strong> de todas as raças desse tipo. Nos produtos, escolhe os que tens em stock (ex.: "Ração A1") para o abate automático funcionar.</p>
      </div>`;
    document.getElementById('form-modelo').addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const grupo = String(fd.get('grupo')||'').trim();
      if(!grupo){ Util.toast('⚠️ Indica o nome do grupo'); return; }
      const mapa = {};
      produtosModelo.forEach((p,i)=>{ mapa[p] = String(fd.get('prod'+i)||'').trim() || p; });
      const todas = await DB.getAll('planosAlimentares');
      const existentes = todas.filter(p=>Calc.chaveProduto(p.especie)===Calc.chaveProduto(grupo));
      if(existentes.length && !confirm(`O grupo "${grupo}" já tem ${existentes.length} fase(s). Substituir pelas do modelo?`)) return;
      try{
        await DB.transacao(['planosAlimentares'], async (tx)=>{
          const store = tx.objectStore('planosAlimentares');
          for(const x of existentes) await DB.reqToPromise(store.delete(x.id));
          for(const f of m.fases){
            await DB.reqToPromise(store.add({especie:grupo, produto:mapa[f.produto], diaInicio:f.diaInicio, diaFim:f.diaFim, gramas:f.gramas}));
          }
        });
      }catch(err){ UI.avisarErro(err, 'Alimentação'); return; }
      await UI.aplicarConsumoAutomatico();
      await afterMutacao(`Plano "${grupo}" criado a partir do modelo`);
    });
    UI.revelar(painelModelo, {behavior:'smooth', block:'start'});
  });

  /* ---- Lotes: configurar o consumo automático ---- */
  document.querySelectorAll('[data-cfg-lote]').forEach(b=>b.addEventListener('click', ()=>{
    const l = _alim.aves.find(a=>Util.mesmoId(a.id, b.dataset.cfgLote));
    const painel = document.getElementById('painel-lote');
    if(!l || !painel) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    const hoje = Util.hoje();
    painel.innerHTML = `
      <div class="compartimento">
        <h3>Consumo do lote — ${Util.escapeHTML(l.especie)} (${l.qtd})</h3>
        <form id="form-lote" class="inline">
          <label>Idade ao entrar (dias) <input type="number" name="idadeEntradaDias" min="0" value="${l.idadeEntradaDias||0}"></label>
          <label class="campo-check"><input type="checkbox" name="auto" ${l.autoDesde?'checked':''}> Abater o consumo deste lote automaticamente, todos os dias</label>
          <label>A partir de <input type="date" name="autoDesde" value="${l.autoDesde || hoje}"></label>
          <label>Plano alimentar a usar
            <select name="planoGrupo"><option value="">Automático (pela raça, senão pelo tipo)</option>${_alim.gruposPlano.map(g=>`<option value="${Util.escapeHTML(g)}" ${l.planoGrupo && Calc.chaveProduto(l.planoGrupo)===Calc.chaveProduto(g) ? 'selected' : ''}>${Util.escapeHTML(g)}</option>`).join('')}</select>
          </label>
          <label>Ração só deste lote (opcional) <input type="text" name="racaoProduto" list="lista-produtos" value="${Util.escapeHTML(l.racaoProduto||'')}" placeholder="vazio = plano da espécie"></label>
          <label>Consumo diário por ave (g) <input type="number" name="consumoGramas" min="0" step="1" value="${l.consumoGramas||''}"></label>
          <button class="btn" type="submit">Guardar</button>
          <button class="btn outline" type="button" id="btn-cancelar-lote">Cancelar</button>
        </form>
        <p class="footnote">${Icon.svg('dica')} Para lotes que já existiam, escolhe a data a partir da qual a app deve começar a abater (o que registaste antes fica como está). Dias já lançados nunca são repetidos.</p>
      </div>`;
    UI.revelar(painel, {behavior:'smooth', block:'center'});
    document.getElementById('btn-cancelar-lote').addEventListener('click', ()=>{ painel.innerHTML = ''; });
    document.getElementById('form-lote').addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const racao = String(fd.get('racaoProduto')||'').trim();
      const gramas = Number(fd.get('consumoGramas'))||0;
      if((racao && !(gramas>0)) || (!racao && gramas>0)){ Util.toast('⚠️ Para usar ração própria indica o produto E as gramas por ave'); return; }
      const novo = {...l};
      const idadeEntrada = Math.max(0, Math.round(Number(fd.get('idadeEntradaDias'))||0));
      if(idadeEntrada>0) novo.idadeEntradaDias = idadeEntrada; else delete novo.idadeEntradaDias;
      if(fd.get('auto')) novo.autoDesde = fd.get('autoDesde') || hoje; else delete novo.autoDesde;
      if(racao){ novo.racaoProduto = racao; novo.consumoGramas = gramas; } else { delete novo.racaoProduto; delete novo.consumoGramas; }
      const grupoEscolhido = String(fd.get('planoGrupo')||'').trim();
      if(grupoEscolhido) novo.planoGrupo = grupoEscolhido; else delete novo.planoGrupo;
      await DB.put('aves', novo);
      await UI.aplicarConsumoAutomatico();
      await afterMutacao('Lote actualizado');
    });
  }));

  /* ---- Previsão de consumo ---- */
  const fp = document.getElementById('form-previsao');
  if(fp){
    const selLote = fp.querySelector('[name=lote]');
    selLote.addEventListener('change', ()=>{
      const l = _alim.aves.find(a=>Util.mesmoId(a.id, selLote.value));
      if(!l) return;
      fp.querySelector('[name=especie]').value = l.especie;
      fp.querySelector('[name=nAves]').value = l.qtd;
      const idade = Calc.idadeLoteEm(l, Util.hoje());
      fp.querySelector('[name=idadeInicial]').value = idade==null ? 0 : Math.max(0, idade);
    });
    fp.addEventListener('submit', e=>{
      e.preventDefault();
      const fd = new FormData(fp);
      const especie = String(fd.get('especie')||'').trim();
      const nAves = Math.round(Number(fd.get('nAves')));
      const idadeInicial = Math.max(0, Math.round(Number(fd.get('idadeInicial'))||0));
      const dias = Math.round(Number(fd.get('dias')));
      const saida = document.getElementById('resultado-previsao');
      if(!especie){ Util.toast('⚠️ Indica a espécie'); return; }
      if(!(nAves>=1) || !(dias>=1 && dias<=365)){ Util.toast('⚠️ Indica o nº de aves (1 ou mais) e os dias (1 a 365)'); return; }
      const lote = fd.get('lote') ? _alim.aves.find(a=>Util.mesmoId(a.id, fd.get('lote'))) : null;
      const usaLote = lote && Calc.chaveProduto(lote.especie)===Calc.chaveProduto(especie);
      const plano = usaLote ? Calc.planoDoLote(lote, _alim.planos) : Calc.planoEfetivoDaEspecie(_alim.planos, especie);
      if(plano.length===0){
        saida.innerHTML = `<p class="empty">Ainda não há plano alimentar para "${Util.escapeHTML(especie)}". Adiciona as fases no formulário "Plano alimentar" acima.</p>`;
        return;
      }
      const r = Calc.previsaoConsumo(plano, nAves, idadeInicial, dias, _alim.produtos);
      const porProduto = {};
      r.porFase.forEach(l=>{ const k = Calc.chaveProduto(l.produto); porProduto[k] = (porProduto[k]||0) + l.kg; });
      const comparacao = Object.keys(porProduto).map(k=>{
        const prod = _alim.produtos.find(p=>p.chave===k);
        const precisa = Math.round(porProduto[k]*100)/100;
        const nome = prod ? prod.nome : (r.porFase.find(l=>Calc.chaveProduto(l.produto)===k).produto);
        if(!prod) return `<li>${Util.escapeHTML(nome)}: precisas de ${precisa} kg — ainda sem stock registado.</li>`;
        return prod.restante >= precisa
          ? `<li>${Util.escapeHTML(nome)}: precisas de ${precisa} kg; tens ${prod.restante.toFixed(1)} kg ${Icon.svg('check')}</li>`
          : `<li>${Util.escapeHTML(nome)}: precisas de ${precisa} kg; tens ${prod.restante.toFixed(1)} kg — faltam ${(precisa-prod.restante).toFixed(1)} kg.</li>`;
      }).join('');
      saida.innerHTML = `
        <div class="compartimento">
          <h3>${nAves} × ${Util.escapeHTML(especie)} durante ${dias} dias</h3>
          ${Tabela.html({
            id:'alim-previsao-fases',
            linhas: r.porFase,
            colunas:[
              {titulo:'Produto', valor:l=>l.produto, largo:true},
              {titulo:'Dias', valor:l=>l.dias, num:true},
              {titulo:'g/ave/dia', valor:l=>l.gramas, num:true},
              {titulo:'Kg', valor:l=>l.kg, num:true},
              {titulo:'Custo', valor:l=>l.custo==null ? '—' : Util.moeda(l.custo), num:true}
            ]
          })}
          <p><strong>Total: ${r.totalKg} kg</strong>${r.custo>0 ? ` · ${r.custoCompleto ? '≈' : 'custo parcial ≈'} ${Util.moeda(r.custo)}` : ''}</p>
          <ul>${comparacao}</ul>
          ${r.diasSemFase>0 ? `<p class="footnote">${Icon.svg('aviso')} ${r.diasSemFase} dia(s) não têm fase definida no plano e não foram contados.</p>` : ''}
          <p class="footnote">Estimativa com o número de aves indicado (não considera mortes, vendas ou entradas durante o período). O custo usa o preço médio por kg das compras registadas.</p>
        </div>`;
    });
  }
}

UI.initPagina(renderAlimentacao);
