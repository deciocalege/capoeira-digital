/* @revisao 2.15.1 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).revenda = '2.15.1';
/* ============ PÁGINA: REVENDA (INVENTÁRIO) ============
   Produtos que compras para vender: carvão, sacos de ração, materiais…
   - Compra → entra no stock e cria a despesa em Finanças
   - Venda (registada na página Vendas) → sai do stock e calcula a margem
   - Ajustes de stock (perdas, quebras, uso próprio, contagem) sem mexer nas Finanças
   - Stock mínimo com aviso no Resumo e relatório do inventário em PDF */

let _rev = {produtos:[], lista:[], movs:[]};
let _filtroRev = '';

async function renderRevenda(){
  const app = document.getElementById('app');
  await UI.redesenhar(app, () => viewRevenda(), () => { attachHandlersRevenda(); });
}
async function afterMutacao(msg){
  if(msg) Util.toast(msg);
  await renderRevenda();
}

const dataBR = Util.dataBR;
const num = n => (Math.round((Number(n)||0)*1000)/1000).toString().replace('.', ',');
const ROTULO_MOV = {compra:'Compra', venda:'Venda', ajuste:'Ajuste'};

async function viewRevenda(){
  const [produtos, movs] = await Promise.all([DB.getAll('revenda'), DB.getAll('revendaMov')]);
  const lista = Calc.stockRevenda(produtos, movs).sort((a,b)=>String(a.nome).localeCompare(String(b.nome)));
  _rev = {produtos, lista, movs};
  const hoje = Util.hoje(), mt = n => Util.moeda(n);
  const ativos = lista.filter(p=>p.ativo!==false), arquivados = lista.filter(p=>p.ativo===false);
  const porId = {}; lista.forEach(p=>{ porId[p.id] = p; });

  /* vendas e margem do mês corrente */
  const mes = Calc.periodoPreset('mes');
  const vendasMes = movs.filter(m=>m.tipo==='venda' && m.data>=mes.de && m.data<=mes.ate);
  const valorMes = vendasMes.reduce((s,m)=>s+(Number(m.valor)||0),0);
  const margemMes = vendasMes.reduce((s,m)=>{
    const p = porId[m.produtoId];
    return (p && p.custoMedio!=null) ? s + (Number(m.valor)||0) - (Number(m.qtd)||0)*p.custoMedio : s;
  }, 0);
  const valorStock = ativos.reduce((s,p)=>s+p.valorStock,0);

  const cartao = p => `
    <div class="card">
      <div class="label">${Util.escapeHTML(p.nome)}${p.abaixoMinimo && p.ativo!==false ? ' <span class="badge alerta">repor</span>' : ''}${p.ativo===false ? ' <span class="badge">arquivado</span>' : ''}</div>
      <div class="value ${p.stock<0 ? 'neg' : ''}">${num(p.stock)} ${Util.escapeHTML(p.unidade||'')}</div>
      <div class="sub">${p.custoMedio==null ? 'Sem compras registadas' : `Custo médio ${mt(p.custoMedio)}/${Util.escapeHTML(p.unidade||'un.')} · em stock ${mt(p.valorStock)}`}</div>
      ${Number(p.precoVenda)>0 ? `<div class="sub">Preço de venda ${mt(p.precoVenda)}${p.margemUnitaria!=null ? ` · margem ${mt(p.margemUnitaria)}/${Util.escapeHTML(p.unidade||'un.')}` : ''}</div>` : ''}
      ${Number(p.stockMinimo)>0 ? `<div class="sub">Stock mínimo: ${num(p.stockMinimo)}</div>` : ''}
      ${p.vendido>0 ? `<div class="sub">Vendido: ${num(p.vendido)} ${Util.escapeHTML(p.unidade||'')} · ${mt(p.valorVendido)}${p.margemVendida!=null ? ` · margem ${mt(p.margemVendida)}` : ''}</div>` : ''}
      <p class="acoes">
        ${p.ativo!==false ? `<button class="btn small" data-comprar="${p.id}">Comprar</button><button class="btn small outline" data-ajustar="${p.id}">Ajustar stock</button>` : ''}
        <button class="btn small outline" data-edit-prod="${p.id}">Editar</button>
        <button class="btn small outline" data-arq-prod="${p.id}">${p.ativo===false ? 'Reativar' : 'Arquivar'}</button>
        <button class="btn small danger outline" data-del-prod="${p.id}">Apagar</button>
      </p>
    </div>`;
  const optsProdutos = ativos.map(p=>`<option value="${p.id}">${Util.escapeHTML(p.nome)} (${num(p.stock)} ${Util.escapeHTML(p.unidade||'')})</option>`).join('');
  const movsVista = movs.slice().filter(m=>!_filtroRev || String(m.produtoId)===_filtroRev)
    .sort((a,b)=>String(b.data).localeCompare(String(a.data)) || Util.compararRegistos(b, a)).slice(0,100);

  return `
  <h2 class="section-title">Inventário de revenda</h2>
  <div class="cards">
    <div class="card"><div class="label">Produtos</div><div class="value">${ativos.length}</div></div>
    <div class="card"><div class="label">Valor em stock</div><div class="value">${mt(valorStock)}</div><div class="sub">ao custo médio</div></div>
    <div class="card"><div class="label">Vendas do mês</div><div class="value pos">${mt(valorMes)}</div></div>
    <div class="card"><div class="label">Margem do mês</div><div class="value ${margemMes<0 ? 'neg' : 'pos'}">${mt(margemMes)}</div><div class="sub">estimada</div></div>
  </div>
  <nav class="atalhos" aria-label="Atalhos da página">
    <a href="#sec-produtos">Produtos</a><a href="#sec-compra-rev">Comprar</a><a href="#sec-ajuste">Ajustar</a><a href="#sec-hist-rev">Histórico</a>
    <button type="button" id="btn-rev-pdf">${Icon.svg('descarregar')} Relatório PDF</button>
  </nav>

  <h2 class="section-title" id="sec-produtos">Produtos</h2>
  ${ativos.length===0 ? `<p class="empty">Ainda sem produtos. Adiciona o primeiro mais abaixo (ex.: Carvão, saco).</p>` : `<div class="cards cards-detalhe">${ativos.map(cartao).join('')}</div>`}
  ${arquivados.length===0 ? '' : `<details><summary>Arquivados (${arquivados.length})</summary><div class="cards cards-detalhe">${arquivados.map(cartao).join('')}</div></details>`}
  <div id="painel-editar-mov"></div>

  <h3 id="titulo-form-produto">Novo produto</h3>
  <form id="form-produto" class="inline" data-id="">
    <label>Nome <input type="text" name="nome" placeholder="ex: Carvão" maxlength="60" required></label>
    <label>Unidade <input type="text" name="unidade" list="lista-unidades-rev" placeholder="ex: saco" maxlength="20" required></label>
    <datalist id="lista-unidades-rev"><option value="saco"><option value="kg"><option value="unidade"><option value="litro"><option value="caixa"></datalist>
    <label>Preço de venda por unidade (MT, opcional) <input type="number" name="precoVenda" min="0" step="0.01"></label>
    <label>Stock mínimo (opcional) <input type="number" name="stockMinimo" min="0" step="0.01"></label>
    <label>Notas <input type="text" name="notas" maxlength="120"></label>
    <button class="btn" type="submit" id="btn-guardar-produto">Adicionar produto</button>
    <button class="btn outline" type="button" id="btn-cancelar-produto" hidden>Cancelar edição</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} O <strong>stock mínimo</strong> faz aparecer um aviso no Resumo quando o produto estiver a acabar. O preço de venda serve de sugestão ao registar vendas e para calcular a margem por unidade.</p>

  <h2 class="section-title" id="sec-compra-rev">Registar compra</h2>
  ${ativos.length===0 ? `<p class="empty">Adiciona primeiro um produto.</p>` : `
  <form id="form-compra-rev" class="inline">
    <label>Produto <select name="produto">${optsProdutos}</select></label>
    <label>Quantidade <input type="number" name="qtd" min="0.01" step="0.01" required></label>
    <label>Valor total pago (MT) <input type="number" name="valor" min="0" step="1" required></label>
    <label>Data <input type="date" name="data" value="${hoje}" required></label>
    <label>Fornecedor (opcional) <input type="text" name="pessoa" maxlength="60"></label>
    <label>Notas (opcional) <input type="text" name="notas" maxlength="120"></label>
    <button class="btn" type="submit">Registar compra</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} A compra aumenta o stock e cria a despesa "Compra para revenda" em <a href="financas.html">Finanças</a>. As vendas registam-se em <a href="vendas.html">Vendas</a> (Vender outro produto → escolher o produto do inventário).</p>`}

  <h2 class="section-title" id="sec-ajuste">Ajustar stock</h2>
  ${ativos.length===0 ? '' : `
  <form id="form-ajuste-rev" class="inline">
    <label>Produto <select name="produto">${optsProdutos}</select></label>
    <label>Quantidade (use − para tirar) <input type="number" name="qtd" step="0.01" required placeholder="ex: -2"></label>
    <label>Motivo
      <select name="motivo"><option>Perda ou quebra</option><option>Uso próprio</option><option>Oferta</option><option>Correção após contagem</option></select>
    </label>
    <label>Data <input type="date" name="data" value="${hoje}" required></label>
    <button class="btn" type="submit">Registar ajuste</button>
  </form>
  <p class="footnote">Ajustes mudam só o stock — não criam receitas nem despesas.</p>`}

  <h2 class="section-title" id="sec-hist-rev">Histórico de movimentos</h2>
  <form id="form-filtro-rev" class="inline">
    <label>Produto
      <select name="filtro"><option value="">Todos</option>${lista.map(p=>`<option value="${p.id}" ${String(p.id)===_filtroRev ? 'selected' : ''}>${Util.escapeHTML(p.nome)}</option>`).join('')}</select>
    </label>
  </form>
  ${movsVista.length===0 ? `<p class="empty">Sem movimentos.</p>` : `
  ${Tabela.html({
    id:'revenda-mov', limite:20, busca:true, buscaPlaceholder:'Pesquisar produto, pessoa…',
    linhas: movsVista,
    contexto: m => ({p: porId[m.produtoId]}),
    colunas:[
      {titulo:'Data', valor:m=>dataBR(m.data)},
      {titulo:'Produto', valor:(m,c)=>c.p ? c.p.nome : '(removido)', largo:true},
      {titulo:'Tipo', valor:m=>ROTULO_MOV[m.tipo]||m.tipo, filtro:true},
      {titulo:'Qtd', valor:(m,c)=>`${num(m.qtd)} ${c.p ? c.p.unidade||'' : ''}`.trim(), classe:m=>Number(m.qtd)<0 ? 'neg' : ''},
      {titulo:'Valor', valor:m=>m.valor==null ? '—' : mt(m.valor)},
      {titulo:'Cliente/Fornecedor', valor:m=>Tabela.esc(m.pessoa||'')+(m.notas ? `<br><span class="footnote">${Tabela.esc(m.notas)}</span>` : ''), html:true, largo:true}
    ],
    acoes: m => `${m.tipo==='venda' ? '<a href="vendas.html" class="footnote">ver em Vendas</a>'
          : `${m.tipo==='compra' ? `<button class="btn small outline" data-edit-mov="${m.id}">Editar</button> ` : ''}<button class="btn small danger" data-del-mov="${m.id}">Apagar</button>`}`
  })}`}
  `;
}

function attachHandlersRevenda(){
  const mt = n => Util.moeda(n);

  /* ---------- Produto: adicionar / editar ---------- */
  const fp = document.getElementById('form-produto');
  if(fp){
    const titulo = document.getElementById('titulo-form-produto');
    const btnG = document.getElementById('btn-guardar-produto');
    const btnC = document.getElementById('btn-cancelar-produto');
    btnC.addEventListener('click', ()=>{
      fp.reset(); fp.dataset.id = ''; titulo.textContent = 'Novo produto'; btnG.textContent = 'Adicionar produto'; btnC.hidden = true;
    });
    fp.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(fp);
      const nome = String(fd.get('nome')||'').trim(), unidade = String(fd.get('unidade')||'').trim();
      if(!nome || !unidade){ Util.toast('⚠️ Indica o nome e a unidade'); return; }
      const idEdit = fp.dataset.id ? Util.chaveId(fp.dataset.id) : null;   // número (ids antigos) ou UUID
      if(_rev.produtos.some(p=>!Util.mesmoId(p.id, idEdit) && Util.normalizarTexto(p.nome)===Util.normalizarTexto(nome))){ Util.toast('⚠️ Já existe um produto com esse nome'); return; }
      const preco = Number(fd.get('precoVenda'))||0, minimo = Number(fd.get('stockMinimo'))||0;
      const existente = idEdit ? _rev.produtos.find(p=>Util.mesmoId(p.id, idEdit)) : null;
      const reg = {...(existente||{}), nome, unidade, precoVenda: preco>0 ? preco : null, stockMinimo: minimo>0 ? minimo : null, notas:String(fd.get('notas')||'').trim(), ativo: existente ? existente.ativo!==false : true};
      if(idEdit){ reg.id = idEdit; await DB.put('revenda', reg); } else await DB.add('revenda', reg);
      await afterMutacao(idEdit ? 'Produto actualizado' : 'Produto adicionado');
    });
    document.querySelectorAll('[data-edit-prod]').forEach(b=>b.addEventListener('click', ()=>{
      const p = _rev.produtos.find(x=>Util.mesmoId(x.id, b.dataset.editProd));
      if(!p) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
      fp.dataset.id = p.id;
      const set = (n,v)=>{ const c = fp.querySelector(`[name=${n}]`); if(c) c.value = v; };
      set('nome', p.nome); set('unidade', p.unidade||''); set('precoVenda', p.precoVenda||''); set('stockMinimo', p.stockMinimo||''); set('notas', p.notas||'');
      titulo.textContent = 'Editar produto'; btnG.textContent = 'Guardar alterações'; btnC.hidden = false;
      fp.scrollIntoView({behavior:'smooth', block:'center'});
    }));
  }
  document.querySelectorAll('[data-arq-prod]').forEach(b=>b.addEventListener('click', async ()=>{
    const p = _rev.produtos.find(x=>Util.mesmoId(x.id, b.dataset.arqProd));
    if(!p) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    await DB.put('revenda', {...p, ativo: p.ativo===false});
    await afterMutacao(p.ativo===false ? 'Produto reativado' : 'Produto arquivado (o histórico mantém-se)');
  }));
  document.querySelectorAll('[data-del-prod]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = Util.chaveId(b.dataset.delProd);
    const p = _rev.produtos.find(x=>Util.mesmoId(x.id, id));
    if(!p) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    if(_rev.movs.some(m=>Util.mesmoId(m.produtoId, id))){ Util.toast('⚠️ Este produto tem movimentos — arquiva-o em vez de o apagar'); return; }
    if(!confirm(`Apagar o produto "${p.nome}"?`)) return;
    await DB.del('revenda', id);
    await afterMutacao('Produto apagado');
  }));

  /* ---------- Atalhos "Comprar" / "Ajustar" nos cartões ---------- */
  const irPara = (formId, produtoId)=>{
    const f = document.getElementById(formId); if(!f) return;
    const sel = f.querySelector('[name=produto]'); if(sel) sel.value = String(produtoId);
    f.scrollIntoView({behavior:'smooth', block:'center'});
  };
  document.querySelectorAll('[data-comprar]').forEach(b=>b.addEventListener('click', ()=>irPara('form-compra-rev', b.dataset.comprar)));
  document.querySelectorAll('[data-ajustar]').forEach(b=>b.addEventListener('click', ()=>irPara('form-ajuste-rev', b.dataset.ajustar)));

  /* ---------- Compra: stock + despesa em Finanças ---------- */
  const fc = document.getElementById('form-compra-rev');
  if(fc) fc.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fc);
    const p = _rev.produtos.find(x=>Util.mesmoId(x.id, fd.get('produto')));
    const qtd = Number(fd.get('qtd')), valor = Number(fd.get('valor'));
    if(!p){ Util.toast('⚠️ Escolhe o produto'); return; }
    if(!(qtd>0)){ Util.toast('⚠️ Indica a quantidade comprada (maior que 0)'); return; }
    if(!(valor>=0)){ Util.toast('⚠️ Indica o valor pago'); return; }
    const mov = {produtoId:p.id, tipo:'compra', data:fd.get('data') || Util.hoje(), qtd, valor, pessoa:String(fd.get('pessoa')||'').trim(), notas:String(fd.get('notas')||'').trim()};
    try{
      await DB.transacao(['revendaMov','transacoes'], async (tx)=>{
        const id = await DB.reqToPromise(tx.objectStore('revendaMov').add(mov));
        await DB.reqToPromise(tx.objectStore('transacoes').add({
          tipo:'despesa', categoria:'Compra para revenda',
          desc:`Compra de ${num(qtd)} ${p.unidade||''} de ${p.nome}${mov.pessoa ? ' a '+mov.pessoa : ''}`.replace(/\s+/g,' '),
          valor, data:mov.data, revendaMovId:id
        }));
      });
    }catch(err){ return; }
    await afterMutacao(`Compra registada — despesa de ${mt(valor)} criada em Finanças`);
  });

  /* ---------- Ajuste de stock ---------- */
  const fa = document.getElementById('form-ajuste-rev');
  if(fa) fa.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fa);
    const p = _rev.lista.find(x=>Util.mesmoId(x.id, fd.get('produto')));
    const qtd = Number(fd.get('qtd'));
    if(!p){ Util.toast('⚠️ Escolhe o produto'); return; }
    if(!qtd){ Util.toast('⚠️ Indica a quantidade do ajuste (diferente de 0)'); return; }
    if(qtd<0 && -qtd > p.stock && !confirm(`Vais tirar ${num(-qtd)} mas só há ${num(p.stock)} ${p.unidade||''} em stock. O stock ficará negativo.\n\nRegistar mesmo assim?`)) return;
    await DB.add('revendaMov', {produtoId:p.id, tipo:'ajuste', data:fd.get('data') || Util.hoje(), qtd, valor:null, pessoa:'', notas:String(fd.get('motivo')||'')});
    await afterMutacao('Ajuste de stock registado');
  });

  /* ---------- Histórico: filtro, editar e apagar ---------- */
  const ff = document.getElementById('form-filtro-rev');
  if(ff){
    const sel = ff.querySelector('[name=filtro]');
    sel.addEventListener('change', async ()=>{ _filtroRev = sel.value; await renderRevenda(); });
  }
  document.querySelectorAll('[data-edit-mov]').forEach(b=>b.addEventListener('click', async ()=>{
    const m = _rev.movs.find(x=>Util.mesmoId(x.id, b.dataset.editMov));
    const painel = document.getElementById('painel-editar-mov');
    if(!m || !painel) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    const p = _rev.lista.find(x=>Util.mesmoId(x.id, m.produtoId));
    painel.innerHTML = `
      <div class="compartimento">
        <h3>Editar compra — ${Util.escapeHTML(p ? p.nome : '')}</h3>
        <form id="form-editar-mov" class="inline">
          <label>Quantidade <input type="number" name="qtd" min="0.01" step="0.01" value="${m.qtd}" required></label>
          <label>Valor total (MT) <input type="number" name="valor" min="0" step="1" value="${m.valor||0}" required></label>
          <label>Data <input type="date" name="data" value="${m.data}" required></label>
          <label>Fornecedor <input type="text" name="pessoa" value="${Util.escapeHTML(m.pessoa||'')}" maxlength="60"></label>
          <button class="btn" type="submit">Guardar</button>
          <button class="btn outline" type="button" id="btn-cancelar-edit-mov">Cancelar</button>
        </form>
        <p class="footnote">${Icon.svg('dica')} A despesa correspondente em Finanças é actualizada com os novos valores.</p>
      </div>`;
    painel.scrollIntoView({behavior:'smooth', block:'center'});
    document.getElementById('btn-cancelar-edit-mov').addEventListener('click', ()=>{ painel.innerHTML = ''; });
    document.getElementById('form-editar-mov').addEventListener('submit', async ev=>{
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const qtd = Number(fd.get('qtd')), valor = Number(fd.get('valor'));
      if(!(qtd>0) || !(valor>=0)){ Util.toast('⚠️ Indica uma quantidade e um valor válidos'); return; }
      const novoStock = (p ? p.stock : 0) - Number(m.qtd) + qtd;
      if(novoStock<0 && !confirm(`Com esta alteração o stock de "${p.nome}" fica negativo (${num(novoStock)}).\n\nGuardar mesmo assim?`)) return;
      const novo = {...m, qtd, valor, data:fd.get('data'), pessoa:String(fd.get('pessoa')||'').trim()};
      try{
        await DB.transacao(['revendaMov','transacoes'], async (tx)=>{
          await DB.reqToPromise(tx.objectStore('revendaMov').put(novo));
          const sT = tx.objectStore('transacoes');
          for(const t of (await DB.reqToPromise(sT.getAll())).filter(t=>Util.mesmoId(t.revendaMovId, m.id))){
            await DB.reqToPromise(sT.put({...t, valor, data:novo.data,
              desc:`Compra de ${num(qtd)} ${p ? p.unidade||'' : ''} de ${p ? p.nome : ''}${novo.pessoa ? ' a '+novo.pessoa : ''}`.replace(/\s+/g,' ')}));
          }
        });
      }catch(err){ return; }
      await afterMutacao('Compra e despesa actualizadas');
    });
  }));
  document.querySelectorAll('[data-del-mov]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = Util.chaveId(b.dataset.delMov);
    const m = _rev.movs.find(x=>Util.mesmoId(x.id, id));
    if(!m) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    const p = _rev.lista.find(x=>Util.mesmoId(x.id, m.produtoId));
    const stockDepois = p ? p.stock - Number(m.qtd) : 0; // apagar uma compra tira-a do stock; apagar um ajuste negativo devolve-o
    const aviso = (p && stockDepois<0) ? `\n\nAtenção: o stock de "${p.nome}" ficará negativo (${num(stockDepois)}).` : '';
    if(!confirm(`Apagar este movimento (${ROTULO_MOV[m.tipo]}, ${num(m.qtd)} ${p ? p.unidade||'' : ''})?${aviso}`)) return;
    const trans = m.tipo==='compra' ? (await DB.getAll('transacoes')).filter(t=>Util.mesmoId(t.revendaMovId, id)) : [];
    const apagarDespesa = trans.length ? confirm(`Apagar também a despesa correspondente em Finanças (${mt(trans[0].valor)}, ${trans[0].data})?`) : false;
    try{
      await DB.transacao(['revendaMov','transacoes'], async (tx)=>{
        await DB.reqToPromise(tx.objectStore('revendaMov').delete(id));
        if(apagarDespesa) for(const t of trans) await DB.reqToPromise(tx.objectStore('transacoes').delete(t.id));
      });
    }catch(err){ return; }
    await afterMutacao(apagarDespesa ? 'Movimento e despesa apagados' : 'Movimento apagado');
  }));

  /* ---------- Relatório do inventário em PDF ---------- */
  const bPdf = document.getElementById('btn-rev-pdf');
  if(bPdf) bPdf.addEventListener('click', ()=>{
    const ativos = _rev.lista.filter(p=>p.ativo!==false);
    const doc = PDF.criar('Inventário de revenda');
    doc.titulo('Inventário de revenda', `Situação em ${dataBR(Util.hoje())}`);
    doc.secao('Stock actual');
    if(ativos.length===0) doc.paragrafo('Sem produtos registados.');
    else {
      const total = ativos.reduce((s,p)=>s+p.valorStock,0);
      doc.tabela(['Produto','Unid.','Stock','Custo médio','Valor em stock','Preço venda','Margem un.'],
        ativos.map(p=>[p.nome, p.unidade||'', num(p.stock), p.custoMedio==null ? '—' : mt(p.custoMedio), mt(p.valorStock), Number(p.precoVenda)>0 ? mt(p.precoVenda) : '—', p.margemUnitaria==null ? '—' : mt(p.margemUnitaria)])
          .concat([['Total em stock','','','',mt(total),'','']]),
        {larguras:[120,40,55,68,80,72,80], alinhar:['l','l','r','r','r','r','r'], negritoUltima:true});
      const repor = ativos.filter(p=>p.abaixoMinimo);
      if(repor.length){ doc.secao('Produtos a repor'); doc.tabela(['Produto','Stock','Mínimo'], repor.map(p=>[p.nome, `${num(p.stock)} ${p.unidade||''}`, num(p.stockMinimo)]), {larguras:[255,130,130], alinhar:['l','r','r']}); }
      const vend = ativos.filter(p=>p.vendido>0);
      if(vend.length){ doc.secao('Vendas e margem registadas'); doc.tabela(['Produto','Qtd vendida','Valor vendido','Margem'], vend.map(p=>[p.nome, `${num(p.vendido)} ${p.unidade||''}`, mt(p.valorVendido), p.margemVendida==null ? '—' : mt(p.margemVendida)]), {larguras:[215,100,110,90], alinhar:['l','r','r','r']}); }
    }
    const porId = {}; _rev.lista.forEach(p=>{ porId[p.id] = p; });
    const recentes = _rev.movs.slice().sort((a,b)=>String(b.data).localeCompare(String(a.data)) || Util.compararRegistos(b, a)).slice(0,40);
    doc.secao('Últimos movimentos');
    if(recentes.length===0) doc.paragrafo('Sem movimentos.');
    else doc.tabela(['Data','Produto','Tipo','Qtd','Valor','Cliente/Fornecedor'], recentes.map(m=>[dataBR(m.data), porId[m.produtoId] ? porId[m.produtoId].nome : '(removido)', ROTULO_MOV[m.tipo]||m.tipo, num(m.qtd), m.valor==null ? '—' : mt(m.valor), m.pessoa||'']),
      {larguras:[58,120,55,60,80,142], alinhar:['l','l','l','r','r','l']});
    doc.descarregar(`capoeira-inventario-revenda-${Util.hoje()}.pdf`);
    Util.toast('📄 Relatório do inventário descarregado');
  });
}

UI.initPagina(renderRevenda);
