/* ============ PÁGINA: ALIMENTAÇÃO (stock de ração e consumo) ============ */

let misturaEmEdicao = null; // id da mistura a editar, 'nova' ou null

async function renderAlimentacao(){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="loading-msg">A carregar…</div>`;
  app.innerHTML = await viewAlimentacao();
  attachHandlersAlimentacao();
}

async function afterMutacao(msg){
  if(msg) Util.toast(msg);
  await renderAlimentacao();
}

function cartaoMistura(m){
  const emEdicao = (m.id === '' && misturaEmEdicao === 'nova') || (m.id !== '' && m.id === misturaEmEdicao);
  if(emEdicao){
    return `<div class="compartimento">
      <form class="form-mistura" data-id="${m.id}" style="display:flex;flex-direction:column;gap:8px;">
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
    <p class="row-actions" style="margin-top:6px;"><button class="btn small outline" data-edit-mistura="${m.id}">Editar</button> <button class="btn small danger outline" data-del-mistura="${m.id}">Apagar</button></p>
  </div>`;
}

async function viewAlimentacao(){
  const [feedStock, consumo, misturas] = await Promise.all([DB.getAll('feedStock'), DB.getAll('consumo'), DB.getAll('misturas')]);
  return `
  <h2 class="section-title">Stock de ração</h2>
  <div class="cards">
    ${feedStock.map(item=>{
      const restante = Calc.stockAtual(item, consumo);
      const pct = Math.max(0, Math.min(100, restante/item.kgComprado*100));
      return `<div class="card">
        <div class="label">${Util.escapeHTML(item.nome)}</div>
        <div class="value">${restante.toFixed(1)}kg</div>
        <div class="sub">de ${item.kgComprado}kg · ${Util.moeda(Calc.custoPorKg(item))}/kg</div>
        ${Calc.consumoExcedente(item, consumo)>0 ? `<div class="sub" style="color:var(--sangue);">${Icon.svg('aviso')} Consumo acima do comprado: +${Calc.consumoExcedente(item, consumo).toFixed(1)}kg</div>` : ''}
        <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
        <p class="row-actions" style="margin-top:6px;"><button class="btn small danger outline" data-del-stock="${item.id}">Remover</button></p>
      </div>`;
    }).join('')}
  </div>

  <h2 class="section-title">Adicionar ingrediente ao stock</h2>
  <form id="form-stock" class="inline">
    <label>Nome <input type="text" name="nome" placeholder="ex: Casca de ostra" required></label>
    <label>Kg comprados <input type="number" step="0.1" min="0" name="kgComprado" required></label>
    <label>Custo total (MT) <input type="number" step="1" min="0" name="custoTotal" required></label>
    <label>Data da compra <input type="date" name="dataCompra" value="${Util.hoje()}" required></label>
    <button class="btn" type="submit">Adicionar ao stock</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} Ao adicionar, é criada automaticamente uma despesa correspondente em Finanças.</p>

  <h2 class="section-title">Misturas usadas</h2>
  <div class="split">
    ${misturas.map(m=>cartaoMistura(m)).join('')}
    ${misturaEmEdicao==='nova' ? cartaoMistura({id:'', nome:'', composicao:'', destino:''}) : ''}
  </div>
  ${misturaEmEdicao ? '' : `<p style="margin:6px 0;"><button class="btn small outline" id="btn-nova-mistura">+ Nova mistura</button></p>`}

  <h2 class="section-title">Registar consumo diário</h2>
  <form id="form-consumo" style="display:flex;flex-direction:column;gap:8px;margin:10px 0 4px;">
    <div class="inline" style="margin:0;">
      <label>Data <input type="date" name="data" value="${Util.hoje()}" required></label>
      <label>Mistura
        <select name="mistura">${misturas.map(m=>`<option>${Util.escapeHTML(m.nome)}</option>`).join('')}</select>
      </label>
    </div>
    <p class="footnote">${Icon.svg('dica')} Indica quanto foi usado hoje de cada ingrediente disponível — já vem pré-preenchido com 1,5kg (consumo diário habitual); ajusta o que for preciso ou deixa 0 para não registar esse ingrediente.</p>
    <div class="inline" style="margin:0;">
      ${feedStock.length===0 ? `<p class="empty">Adiciona primeiro um ingrediente ao stock acima.</p>` :
        feedStock.map(i=>`<label>${Util.escapeHTML(i.nome)} (kg) <input type="number" step="0.1" min="0" name="kg_${i.id}" value="1.5"></label>`).join('')}
    </div>
    <button class="btn" type="submit" style="align-self:flex-start;">Registar consumo do dia</button>
  </form>

  <h2 class="section-title">Histórico de consumo</h2>
  <div id="painel-editar-consumo"></div>
  ${consumo.length===0 ? `<p class="empty">Ainda sem registos — regista o consumo diário acima para acompanhar quanto tempo dura a ração.</p>` : `
  <div class="table-scroll"><table class="responsive-stack">
    <tr><th>Data</th><th>Ingrediente</th><th>Kg</th><th>Mistura</th><th></th></tr>
    ${consumo.slice().reverse().map(c=>`<tr>
    <td data-label="Data">${c.data}</td>
    <td data-label="Ingrediente">${Util.escapeHTML(c.item)}</td>
    <td data-label="Kg">${c.kg}</td>
    <td data-label="Mistura">${Util.escapeHTML(c.mistura)}</td>
    <td class="row-actions"><button class="btn small outline" data-edit-consumo="${c.id}">Editar</button> <button class="btn small danger" data-del-consumo="${c.id}">Apagar</button></td></tr>`).join('')}
  </table></div>`}
  `;
}

function attachHandlersAlimentacao(){
  const fstock = document.getElementById('form-stock');
  if(fstock) fstock.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fstock);
    const novo = {nome:fd.get('nome'), kgComprado:Number(fd.get('kgComprado')), custoTotal:Number(fd.get('custoTotal')), dataCompra:fd.get('dataCompra')};
    /* Adicionar ao stock + criar a despesa correspondente: uma única
       transação — evita ficar com ração registada sem a despesa
       correspondente em Finanças (ou vice-versa) se algo falhar a meio. */
    try{
      await DB.transacao(['feedStock','transacoes'], async (tx)=>{
        await DB.reqToPromise(tx.objectStore('feedStock').add(novo));
        await DB.reqToPromise(tx.objectStore('transacoes').add({
          tipo:'despesa', categoria:'Alimentação', desc:`Compra de ${novo.nome} (${novo.kgComprado}kg)`, valor:novo.custoTotal, data:novo.dataCompra
        }));
      });
    }catch(err){
      return;
    }
    await afterMutacao('Ingrediente adicionado ao stock');
  });
  document.querySelectorAll('[data-del-stock]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('Remover este ingrediente do stock? O histórico de consumo já registado não será apagado.')) return;
    await DB.del('feedStock', Number(b.dataset.delStock));
    await afterMutacao('Ingrediente removido');
  }));
  const fc = document.getElementById('form-consumo');
  if(fc) fc.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fc);
    const data = fd.get('data');
    const mistura = fd.get('mistura');
    const feedStockAtual = await DB.getAll('feedStock');
    const aRegistar = feedStockAtual
      .map(item=>({item, kg: Number(fd.get('kg_'+item.id))||0}))
      .filter(x=>x.kg>0);
    if(aRegistar.length===0){ Util.toast('⚠️ Indica pelo menos um ingrediente com quantidade maior que 0'); return; }
    const consumoAtual = await DB.getAll('consumo');
    const acima = aRegistar.filter(x=>x.kg > Calc.stockAtual(x.item, consumoAtual));
    if(acima.length && !confirm(`Atenção: o consumo de ${acima.map(x=>x.item.nome).join(', ')} é maior do que o stock disponível.\n\nRegistar mesmo assim?`)) return;
    /* Regista o consumo de todos os ingredientes indicados numa única
       transação (tudo ou nada), e guarda sempre o feedStockId (não só
       o nome) — é isso que liga cada consumo à compra exacta a que
       pertence, mesmo que no futuro exista outra entrada com o mesmo
       nome. */
    try{
      await DB.transacao(['consumo'], async (tx)=>{
        const store = tx.objectStore('consumo');
        for(const {item, kg} of aRegistar){
          await DB.reqToPromise(store.add({feedStockId:item.id, item:item.nome, kg, mistura, data}));
        }
      });
    }catch(err){
      return;
    }
    await afterMutacao(`Consumo registado (${aRegistar.length} ingrediente${aRegistar.length>1?'s':''})`);
  });
  document.querySelectorAll('[data-del-consumo]').forEach(b=>b.addEventListener('click', async ()=>{
    await DB.del('consumo', Number(b.dataset.delConsumo));
    await afterMutacao();
  }));

  document.querySelectorAll('[data-edit-consumo]').forEach(b=>b.addEventListener('click', async ()=>{
    const [todos, stock, misturas] = await Promise.all([DB.getAll('consumo'), DB.getAll('feedStock'), DB.getAll('misturas')]);
    const c = todos.find(x=>x.id===Number(b.dataset.editConsumo));
    const painel = document.getElementById('painel-editar-consumo');
    if(!c || !painel) return;
    const optsStock = stock.map(i=>`<option value="${i.id}" ${(i.id===c.feedStockId || (c.feedStockId==null && i.nome===c.item))?'selected':''}>${Util.escapeHTML(i.nome)}</option>`).join('');
    const optsMist = misturas.map(m=>`<option ${m.nome===c.mistura?'selected':''}>${Util.escapeHTML(m.nome)}</option>`).join('')
      + (misturas.some(m=>m.nome===c.mistura) ? '' : `<option selected>${Util.escapeHTML(c.mistura)}</option>`);
    painel.innerHTML = `
      <div class="compartimento">
        <h3>Editar consumo</h3>
        <form id="form-editar-consumo" class="inline">
          <label>Data <input type="date" name="data" value="${c.data}" required></label>
          <label>Ingrediente <select name="feedStockId">${optsStock}</select></label>
          <label>Kg <input type="number" step="0.1" min="0.1" name="kg" value="${c.kg}" required></label>
          <label>Mistura <select name="mistura">${optsMist}</select></label>
          <button class="btn" type="submit">Guardar</button>
          <button class="btn outline" type="button" id="btn-cancelar-edit-consumo">Cancelar</button>
        </form>
      </div>`;
    painel.scrollIntoView({behavior:'smooth', block:'center'});
    document.getElementById('btn-cancelar-edit-consumo').addEventListener('click', ()=>{ painel.innerHTML = ''; });
    document.getElementById('form-editar-consumo').addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const kg = Number(fd.get('kg'));
      const item = stock.find(i=>i.id===Number(fd.get('feedStockId')));
      if(!item){ Util.toast('⚠️ Escolhe um ingrediente'); return; }
      if(!(kg>0)){ Util.toast('⚠️ Indica uma quantidade maior que 0'); return; }
      await DB.put('consumo', {...c, data:fd.get('data'), feedStockId:item.id, item:item.nome, kg, mistura:fd.get('mistura')});
      await afterMutacao('Consumo actualizado');
    });
  }));

  document.querySelectorAll('[data-del-mistura]').forEach(b=>b.addEventListener('click', async ()=>{
    const todas = await DB.getAll('misturas');
    if(todas.length<=1){ Util.toast('⚠️ Tem de existir pelo menos uma mistura'); return; }
    if(!confirm('Apagar esta mistura? Os registos de consumo antigos mantêm o nome dela.')) return;
    await DB.del('misturas', Number(b.dataset.delMistura));
    await afterMutacao('Mistura apagada');
  }));

  document.querySelectorAll('[data-edit-mistura]').forEach(b=>b.addEventListener('click', async ()=>{
    misturaEmEdicao = Number(b.dataset.editMistura);
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
    const id = fm.dataset.id === '' ? null : Number(fm.dataset.id);
    const todas = await DB.getAll('misturas');
    if(todas.some(m=>m.id!==id && Util.normalizarTexto(m.nome)===Util.normalizarTexto(nome))){
      Util.toast('⚠️ Já existe uma mistura com esse nome'); return;
    }
    const antigo = id==null ? null : todas.find(m=>m.id===id);
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
    }catch(err){
      return;
    }
    misturaEmEdicao = null;
    await afterMutacao('Mistura guardada');
  });
}

UI.initPagina(renderAlimentacao);
