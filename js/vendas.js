/* @revisao 2.15.1 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).vendas = '2.15.1';
/* ============ PÁGINA: VENDAS ============
   - Painel de tudo o que sai para venda: aves (registadas em Gestão), ovos,
     ração e outros produtos/materiais
   - Cada venda cria automaticamente a receita em Finanças
   - Vendas de ração baixam o stock; vendas de ovos baixam os ovos disponíveis
   - Relatório do período em PDF */

const CATEGORIA_VENDA = {ovos:'Venda de ovos', racao:'Venda de ração', outro:'Outras vendas'};
let _periodoVendas = Calc.periodoPreset('mes');
let _vendas = {todas:[], vendas:[], produtos:[], ovos:null};

async function renderVendas(){
  const app = document.getElementById('app');
  await UI.redesenhar(app, () => viewVendas(), () => { attachHandlersVendas(); });
}
async function afterMutacao(msg){
  if(msg) Util.toast(msg);
  await renderVendas();
}

const dataBR = Util.dataBR;
function textoPeriodo(de, ate){
  return de && ate ? `${dataBR(de)} a ${dataBR(ate)}` : de ? `desde ${dataBR(de)}` : ate ? `até ${dataBR(ate)}` : 'todo o histórico';
}
function descricaoVenda(v){
  const q = `${v.qtd} ${v.unidade || ''}`.trim();
  const base = v.tipo==='ovos' ? `Venda de ${q} de ovos` : `Venda de ${q} de ${v.produto}`;
  return v.cliente ? `${base} a ${v.cliente}` : base;
}

async function viewVendas(){
  const [vendas, saidasAves, feedStock, consumo, ovosLog, incubacao, revendaProdutos, revendaMovs] = await Promise.all([
    DB.getAll('vendas'), DB.getAll('saidasAves'), DB.getAll('feedStock'), DB.getAll('consumo'), DB.getAll('ovosLog'), DB.getAll('incubacao'),
    DB.getAll('revenda'), DB.getAll('revendaMov')
  ]);
  const revendaLista = Calc.stockRevenda(revendaProdutos, revendaMovs).filter(p=>p.ativo!==false);
  const produtos = Calc.produtosStock(feedStock, consumo);
  const ovos = Calc.ovosDisponiveis(ovosLog, vendas, incubacao);
  const todas = Calc.vendasUnificadas(vendas, saidasAves);
  const {de, ate} = _periodoVendas;
  const r = Calc.resumoVendas(todas, de, ate);
  _vendas = {todas, vendas, produtos, ovos, r, revenda:revendaLista};
  const hoje = Util.hoje();
  const mt = n => Util.moeda(n);
  const presets = [['hoje','Hoje'],['semana','Esta semana'],['mes','Este mês'],['mes-passado','Mês passado'],['30d','Últimos 30 dias'],['ano','Este ano']];
  const ativo = nome => { const p = Calc.periodoPreset(nome); return p.de===de && p.ate===ate; };
  const outrosUsados = [...new Set(vendas.filter(v=>v.tipo==='outro').map(v=>v.produto))];

  return `
  <h2 class="section-title">Painel de vendas</h2>
  <div class="atalhos" id="atalhos-vendas">
    ${presets.map(([id,t])=>`<button type="button" data-periodo-vendas="${id}" class="${ativo(id)?'ativo':''}">${t}</button>`).join('')}
  </div>
  <form id="form-periodo-vendas" class="inline">
    <label>De <input type="date" name="de" value="${de||''}"></label>
    <label>Até <input type="date" name="ate" value="${ate||''}"></label>
    <button class="btn" type="submit">Aplicar</button>
    <button class="btn outline" type="button" id="btn-vendas-pdf">${Icon.svg('descarregar')} Relatório em PDF</button>
  </form>
  <p class="footnote">Período: <strong>${textoPeriodo(de, ate)}</strong></p>

  <div class="cards">
    <div class="card"><div class="label">Total vendido</div><div class="value pos">${mt(r.total)}</div><div class="sub">${r.n} venda(s)</div></div>
    <div class="card"><div class="label">Valor médio</div><div class="value">${mt(r.ticketMedio)}</div><div class="sub">por venda</div></div>
    ${r.porTipo.map(t=>`<div class="card"><div class="label">${Util.escapeHTML(t.rotulo)}</div><div class="value">${mt(t.valor)}</div><div class="sub">${t.n} venda(s)</div></div>`).join('')}
  </div>

  ${r.n===0 ? '' : `
  <h3>De onde vem o valor</h3>
  ${Tabela.html({
    id:'vendas-por-produto',
    linhas: r.porProduto,
    colunas:[
      {titulo:'Tipo', valor:p=>p.rotulo},
      {titulo:'Produto', valor:p=>p.produto, largo:true},
      {titulo:'Qtd vendida', valor:p=>`${p.qtd}${p.unidade ? ' '+p.unidade : ''}`},
      {titulo:'Vendas', valor:p=>p.n, num:true},
      {titulo:'Valor', valor:p=>mt(p.valor), num:true},
      {titulo:'% do total', valor:p=>(r.total>0 ? Math.round(p.valor/r.total*100) : 0)+'%', num:true}
    ]
  })}`}

  <h2 class="section-title" id="sec-registar-venda">Registar venda</h2>
  <p class="footnote">${Icon.svg('dica')} Cada venda cria sozinha a receita em <a href="financas.html">Finanças</a>. As <strong>vendas de aves</strong> registam-se em <a href="gestao.html">Gestão</a> (Registar saída → venda) e aparecem aqui automaticamente.</p>

  <details id="det-venda-ovos"><summary>${Icon.svg('ovo')} Vender ovos <span class="footnote">(disponíveis: ${Math.max(0, ovos.disponiveis)})</span></summary>
    <form id="form-venda-ovos" class="inline" data-id="">
      <label>Quantidade <input type="number" name="qtd" min="1" step="1" required></label>
      <label>Unidade <select name="unidade"><option>unidade</option><option>dúzia</option><option>cartão (30)</option></select></label>
      <label>Valor total (MT) <input type="number" name="valor" min="0" step="1" required></label>
      <label>Data <input type="date" name="data" value="${hoje}" required></label>
      <label>Cliente (opcional) <input type="text" name="cliente" maxlength="60"></label>
      <label>Notas (opcional) <input type="text" name="notas" maxlength="120"></label>
      <button class="btn" type="submit">Registar venda</button>
      <button class="btn outline" type="button" data-cancelar-venda="ovos" hidden>Cancelar edição</button>
    </form>
    <p class="footnote">Ovos disponíveis = postos (${ovos.postos}) − vendidos (${ovos.vendidos}) − postos a chocar (${ovos.incubados}). Só conta o que registaste na página Produção.</p>
  </details>

  <details id="det-venda-racao"><summary>${Icon.svg('trigo')} Vender ração</summary>
    ${produtos.length===0 ? `<p class="empty">Sem ração em stock. Regista primeiro uma compra em <a href="alimentacao.html">Alimentação</a>.</p>` : `
    <form id="form-venda-racao" class="inline" data-id="">
      <label>Produto
        <select name="produto">${produtos.map(p=>`<option value="${Util.escapeHTML(p.chave)}">${Util.escapeHTML(p.nome)} — ${p.restante.toFixed(1)} kg em stock</option>`).join('')}</select>
      </label>
      <label>Quantidade (kg) <input type="number" name="qtd" min="0.1" step="0.1" required></label>
      <label>Valor total (MT) <input type="number" name="valor" min="0" step="1" required></label>
      <label>Data <input type="date" name="data" value="${hoje}" required></label>
      <label>Cliente (opcional) <input type="text" name="cliente" maxlength="60"></label>
      <label>Notas (opcional) <input type="text" name="notas" maxlength="120"></label>
      <button class="btn" type="submit">Registar venda</button>
      <button class="btn outline" type="button" data-cancelar-venda="racao" hidden>Cancelar edição</button>
    </form>
    <p class="footnote">Os kg vendidos saem do stock de ração (sem contar como consumo das aves). A margem estimada usa o preço médio por kg das tuas compras.</p>`}
  </details>

  <details id="det-venda-outro"><summary>${Icon.svg('caixa')} Vender outro produto ou material (carvão, esterco, equipamento…)</summary>
    <form id="form-venda-outro" class="inline" data-id="">
      <label>Produto do inventário de revenda (opcional)
        <select name="revendaId"><option value="">— nenhum (escrever abaixo) —</option>${revendaLista.map(p=>`<option value="${p.id}">${Util.escapeHTML(p.nome)} — ${p.stock} ${Util.escapeHTML(p.unidade||'')} em stock${Number(p.precoVenda)>0 ? ' · '+mt(p.precoVenda) : ''}</option>`).join('')}</select>
      </label>
      <label>Produto (se não for do inventário) <input type="text" name="produto" list="lista-outros-vendas" placeholder="ex: Esterco"></label>
      <datalist id="lista-outros-vendas">${outrosUsados.map(p=>`<option value="${Util.escapeHTML(p)}">`).join('')}</datalist>
      <label>Quantidade <input type="number" name="qtd" min="0.01" step="0.01" required></label>
      <label>Unidade <input type="text" name="unidade" placeholder="ex: sacos, kg, unid." maxlength="20"></label>
      <label>Valor total (MT) <input type="number" name="valor" min="0" step="1" required></label>
      <label>Data <input type="date" name="data" value="${hoje}" required></label>
      <label>Cliente (opcional) <input type="text" name="cliente" maxlength="60"></label>
      <label>Notas (opcional) <input type="text" name="notas" maxlength="120"></label>
      <button class="btn" type="submit">Registar venda</button>
      <button class="btn outline" type="button" data-cancelar-venda="outro" hidden>Cancelar edição</button>
    </form>
    <p class="footnote">${revendaLista.length ? 'Se escolheres um produto do <a href="revenda.html">inventário de revenda</a>, a venda baixa o stock e calcula a margem.' : 'Para controlares stock e margem de produtos que revendes (carvão, sacos de ração…), cria-os em <a href="revenda.html">Revenda</a>.'} Outros produtos escritos à mão ficam só com a venda e a receita.</p>
  </details>

  <h2 class="section-title">Detalhe das vendas</h2>
  ${r.linhas.length===0 ? `<p class="empty">Sem vendas neste período.</p>` : `
  ${Tabela.html({
    id:'vendas-detalhe', limite:20, busca:true, buscaPlaceholder:'Pesquisar produto, cliente…',
    linhas: r.linhas.slice().reverse(),
    contexto: v => ({margem: v.tipo==='racao' ? Calc.margemVendaRacao(v, produtos) : v.revendaId ? Calc.margemVendaRevenda(v, Calc.stockRevenda(revendaProdutos, revendaMovs)) : null}),
    colunas:[
      {titulo:'Data', valor:v=>dataBR(v.data)},
      {titulo:'Tipo', valor:v=>Calc.TIPOS_VENDA[v.tipo]||v.tipo, filtro:true},
      {titulo:'Produto', valor:v=>v.produto, largo:true},
      {titulo:'Qtd', valor:v=>`${v.qtd} ${v.unidade||''}`.trim()},
      {titulo:'Valor', valor:(v,c)=>mt(v.valor)+(c.margem==null ? '' : `<br><span class="footnote">margem ≈ ${mt(c.margem)}</span>`), html:true},
      {titulo:'Cliente', valor:v=>Tabela.esc(v.cliente)+(v.notas ? `<br><span class="footnote">${Tabela.esc(v.notas)}</span>` : ''), html:true, largo:true}
    ],
    acoes: v => `${v.origem==='venda'
        ? `<button class="btn small outline" data-edit-venda="${v.id}">Editar</button> <button class="btn small danger" data-del-venda="${v.id}">Apagar</button>`
        : `<a href="gestao.html" class="footnote">ver em Gestão</a>`}`
  })}`}
  `;
}

function attachHandlersVendas(){
  /* ---------- Período ---------- */
  document.querySelectorAll('[data-periodo-vendas]').forEach(b=>b.addEventListener('click', async ()=>{
    _periodoVendas = Calc.periodoPreset(b.dataset.periodoVendas);
    await renderVendas();
  }));
  const fp = document.getElementById('form-periodo-vendas');
  if(fp) fp.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fp);
    const de = fd.get('de') || '', ate = fd.get('ate') || '';
    if(de && ate && de > ate){ Util.toast('⚠️ A data inicial é depois da data final'); return; }
    _periodoVendas = {de, ate};
    await renderVendas();
  });

  /* ---------- PDF ---------- */
  const bPdf = document.getElementById('btn-vendas-pdf');
  if(bPdf) bPdf.addEventListener('click', ()=>{
    const {r, produtos} = _vendas, mt = n => Util.moeda(n);
    const {de, ate} = _periodoVendas;
    const doc = PDF.criar('Relatório de vendas');
    doc.titulo('Relatório de vendas', `Período: ${textoPeriodo(de, ate)}`);
    doc.secao('Resumo');
    doc.tabela(['Descrição','Valor'], [['Número de vendas', String(r.n)], ['Valor médio por venda', mt(r.ticketMedio)], ['Total vendido', mt(r.total)]],
      {larguras:[355,160], alinhar:['l','r'], semCabecalho:true, negritoUltima:true});
    if(r.porTipo.length){
      doc.secao('Por tipo de produto');
      doc.tabela(['Tipo','Vendas','Valor','% do total'], r.porTipo.map(t=>[t.rotulo, String(t.n), mt(t.valor), (r.total>0 ? Math.round(t.valor/r.total*100) : 0)+'%']),
        {larguras:[215,90,130,80], alinhar:['l','r','r','r']});
      doc.secao('De onde vem o valor (por produto)');
      doc.tabela(['Tipo','Produto','Qtd vendida','Valor'], r.porProduto.map(p=>[p.rotulo, p.produto, `${p.qtd}${p.unidade ? ' '+p.unidade : ''}`, mt(p.valor)]),
        {larguras:[95,200,110,110], alinhar:['l','l','r','r']});
    }
    doc.secao('Detalhe das vendas');
    if(r.linhas.length===0) doc.paragrafo('Sem vendas neste período.');
    else doc.tabela(['Data','Tipo','Produto','Qtd','Valor','Cliente'],
      r.linhas.map(v=>[dataBR(v.data), Calc.TIPOS_VENDA[v.tipo]||v.tipo, v.produto, `${v.qtd} ${v.unidade}`.trim(), mt(v.valor), v.cliente]),
      {larguras:[58,84,138,72,72,91], alinhar:['l','l','l','r','r','l']});
    doc.descarregar(`capoeira-vendas-${de || 'inicio'}-a-${ate || Util.hoje()}.pdf`);
    Util.toast('📄 Relatório de vendas descarregado');
  });

  /* ---------- Registar / editar ---------- */
  function ligarForm(tipo){
    const form = document.getElementById('form-venda-'+tipo);
    if(!form) return;
    const btnCancelar = document.querySelector(`[data-cancelar-venda="${tipo}"]`);
    btnCancelar.addEventListener('click', ()=>{
      form.reset(); form.dataset.id = ''; btnCancelar.hidden = true;
      form.querySelector('button[type=submit]').textContent = 'Registar venda';
    });
    form.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(form);
      const idEdit = form.dataset.id ? Util.chaveId(form.dataset.id) : null;   // número (ids antigos) ou UUID
      const antigo = idEdit ? _vendas.vendas.find(v=>Util.mesmoId(v.id, idEdit)) : null;
      const qtd = Number(fd.get('qtd')), valor = Number(fd.get('valor'));
      if(!(qtd>0)){ Util.toast('⚠️ Indica a quantidade vendida (maior que 0)'); return; }
      if(!(valor>=0)){ Util.toast('⚠️ Indica o valor total da venda'); return; }
      const rec = {
        tipo, data:fd.get('data') || Util.hoje(), qtd, valor,
        cliente:String(fd.get('cliente')||'').trim(), notas:String(fd.get('notas')||'').trim()
      };
      let feedStockId = null;
      if(tipo==='ovos'){
        rec.produto = 'Ovos'; rec.unidade = String(fd.get('unidade')||'unidade');
        rec.qtdBase = Calc.qtdBaseVenda('ovos', qtd, rec.unidade);
        const disp = Calc.ovosDisponiveis(
          await DB.getAll('ovosLog'), await DB.getAll('vendas'), await DB.getAll('incubacao'), idEdit
        ).disponiveis;
        if(rec.qtdBase > disp && !confirm(`Atenção: vais vender ${rec.qtdBase} ovos mas só há ${Math.max(0, disp)} disponíveis nos teus registos (postos − vendidos − postos a chocar).\n\nRegistar mesmo assim?`)) return;
      } else if(tipo==='racao'){
        const [stock, consumo] = await Promise.all([DB.getAll('feedStock'), DB.getAll('consumo')]);
        const prod = Calc.produtosStock(stock, consumo).find(p=>p.chave===fd.get('produto'));
        if(!prod){ Util.toast('⚠️ Escolhe o produto'); return; }
        rec.produto = prod.nome; rec.unidade = 'kg'; rec.qtdBase = qtd;
        feedStockId = prod.itens[prod.itens.length-1].id;
        const jaVendido = antigo && Calc.chaveProduto(antigo.produto)===prod.chave ? Number(antigo.qtdBase)||0 : 0;
        if(qtd > prod.restante + jaVendido && !confirm(`Atenção: vais vender ${qtd} kg de "${prod.nome}" mas só há ${(prod.restante+jaVendido).toFixed(1)} kg em stock.\n\nRegistar mesmo assim?`)) return;
      } else {
        const rid = fd.get('revendaId') ? Util.chaveId(fd.get('revendaId')) : null;
        const [prods, movsRev] = await Promise.all([DB.getAll('revenda'), DB.getAll('revendaMov')]);
        const pr = rid ? Calc.stockRevenda(prods, movsRev).find(p=>Util.mesmoId(p.id, rid)) : null;
        if(rid && !pr){ Util.toast('⚠️ Produto do inventário não encontrado'); return; }
        if(pr){
          rec.produto = pr.nome; rec.unidade = pr.unidade || ''; rec.revendaId = pr.id;
          const jaVendido = antigo && Util.mesmoId(antigo.revendaId, pr.id) ? Number(antigo.qtd)||0 : 0;
          if(qtd > pr.stock + jaVendido && !confirm(`Atenção: vais vender ${qtd} ${pr.unidade||''} de "${pr.nome}" mas só há ${pr.stock + jaVendido} em stock.\n\nRegistar mesmo assim?`)) return;
        } else {
          rec.produto = String(fd.get('produto')||'').trim();
          if(!rec.produto){ Util.toast('⚠️ Escolhe um produto do inventário ou escreve o nome do produto'); return; }
          rec.unidade = String(fd.get('unidade')||'').trim(); rec.revendaId = null;
        }
        rec.qtdBase = qtd;
      }
      try{
        await DB.transacao(['vendas','transacoes','consumo','revendaMov'], async (tx)=>{
          const sV = tx.objectStore('vendas'), sT = tx.objectStore('transacoes'), sC = tx.objectStore('consumo'), sR = tx.objectStore('revendaMov');
          const movRevenda = (id)=>({produtoId:rec.revendaId, tipo:'venda', data:rec.data, qtd:rec.qtd, valor:rec.valor, pessoa:rec.cliente, notas:rec.notas, vendaId:id});
          const receita = (id)=>({tipo:'receita', categoria:CATEGORIA_VENDA[tipo], desc:descricaoVenda(rec), valor:rec.valor, data:rec.data, vendaId:id});
          const saidaStock = (id)=>({feedStockId, item:rec.produto, kg:rec.qtdBase, mistura:'(venda)', data:rec.data, venda:true, vendaId:id});
          if(!idEdit){
            const id = await DB.reqToPromise(sV.add(rec));
            await DB.reqToPromise(sT.add(receita(id)));
            if(tipo==='racao') await DB.reqToPromise(sC.add(saidaStock(id)));
            if(rec.revendaId) await DB.reqToPromise(sR.add(movRevenda(id)));
          } else {
            await DB.reqToPromise(sV.put({...antigo, ...rec, id:idEdit}));
            const trs = (await DB.reqToPromise(sT.getAll())).filter(t=>Util.mesmoId(t.vendaId, idEdit));
            if(trs.length) for(const t of trs) await DB.reqToPromise(sT.put({...t, ...receita(idEdit), id:t.id}));
            else await DB.reqToPromise(sT.add(receita(idEdit)));
            if(tipo==='racao'){
              const cs = (await DB.reqToPromise(sC.getAll())).filter(c=>Util.mesmoId(c.vendaId, idEdit));
              if(cs.length) for(const c of cs) await DB.reqToPromise(sC.put({...c, ...saidaStock(idEdit), id:c.id}));
              else await DB.reqToPromise(sC.add(saidaStock(idEdit)));
            }
            const movs = (await DB.reqToPromise(sR.getAll())).filter(m=>Util.mesmoId(m.vendaId, idEdit));
            if(rec.revendaId){
              if(movs.length) for(const m of movs) await DB.reqToPromise(sR.put({...m, ...movRevenda(idEdit), id:m.id}));
              else await DB.reqToPromise(sR.add(movRevenda(idEdit)));
            } else for(const m of movs) await DB.reqToPromise(sR.delete(m.id));
          }
        });
      }catch(err){ return; }
      await afterMutacao(idEdit ? 'Venda actualizada (receita e stock também)' : `Venda registada — receita de ${Util.moeda(rec.valor)} criada em Finanças`);
    });
  }
  ['ovos','racao','outro'].forEach(ligarForm);

  /* Produto do inventário: sugere a unidade e o valor (preço × quantidade) */
  const formOutro = document.getElementById('form-venda-outro');
  if(formOutro){
    const selRev = formOutro.querySelector('[name=revendaId]'), campoQtd = formOutro.querySelector('[name=qtd]');
    const campoValor = formOutro.querySelector('[name=valor]'), campoUn = formOutro.querySelector('[name=unidade]');
    const sugerir = ()=>{
      const p = (_vendas.revenda||[]).find(x=>String(x.id)===selRev.value);
      if(!p) return;
      if(campoUn && !campoUn.value) campoUn.value = p.unidade || '';
      const q = Number(campoQtd.value);
      if(Number(p.precoVenda)>0 && q>0 && !campoValor.dataset.manual) campoValor.value = Math.round(p.precoVenda*q*100)/100;
    };
    selRev.addEventListener('change', sugerir);
    campoQtd.addEventListener('input', sugerir);
    campoValor.addEventListener('input', ()=>{ campoValor.dataset.manual = '1'; });
  }

  document.querySelectorAll('[data-edit-venda]').forEach(b=>b.addEventListener('click', ()=>{
    const v = _vendas.vendas.find(x=>Util.mesmoId(x.id, b.dataset.editVenda));
    if(!v) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    const form = document.getElementById('form-venda-'+v.tipo);
    if(!form){ Util.toast('⚠️ Não foi possível abrir este tipo de venda'); return; }
    const set = (nome, valor)=>{ const c = form.querySelector(`[name=${nome}]`); if(c) c.value = valor; };
    form.dataset.id = v.id;
    set('qtd', v.qtd); set('valor', v.valor); set('data', v.data); set('cliente', v.cliente||''); set('notas', v.notas||'');
    if(v.tipo==='ovos') set('unidade', v.unidade);
    if(v.tipo==='racao') set('produto', Calc.chaveProduto(v.produto));
    if(v.tipo==='outro'){ set('revendaId', v.revendaId ? String(v.revendaId) : ''); set('produto', v.revendaId ? '' : v.produto); set('unidade', v.unidade||''); }
    form.querySelector('button[type=submit]').textContent = 'Guardar alterações';
    const cancelar = document.querySelector(`[data-cancelar-venda="${v.tipo}"]`); if(cancelar) cancelar.hidden = false;
    const det = document.getElementById('det-venda-'+v.tipo); if(det) det.open = true;
    form.scrollIntoView({behavior:'smooth', block:'center'});
  }));

  document.querySelectorAll('[data-del-venda]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = Util.chaveId(b.dataset.delVenda);
    const v = _vendas.vendas.find(x=>Util.mesmoId(x.id, id));
    if(!v) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    if(!confirm(`Apagar esta venda (${v.qtd} ${v.unidade} de ${v.produto}, ${Util.moeda(v.valor)})?\n\nA receita em Finanças também é apagada${v.tipo==='racao' || v.revendaId ? ' e a quantidade volta ao stock' : ''}.`)) return;
    try{
      await DB.transacao(['vendas','transacoes','consumo','revendaMov'], async (tx)=>{
        await DB.reqToPromise(tx.objectStore('vendas').delete(id));
        const sR = tx.objectStore('revendaMov');
        for(const m of (await DB.reqToPromise(sR.getAll())).filter(m=>Util.mesmoId(m.vendaId, id))) await DB.reqToPromise(sR.delete(m.id));
        const sT = tx.objectStore('transacoes'), sC = tx.objectStore('consumo');
        for(const t of (await DB.reqToPromise(sT.getAll())).filter(t=>Util.mesmoId(t.vendaId, id))) await DB.reqToPromise(sT.delete(t.id));
        for(const c of (await DB.reqToPromise(sC.getAll())).filter(c=>Util.mesmoId(c.vendaId, id))) await DB.reqToPromise(sC.delete(c.id));
      });
    }catch(err){ return; }
    await afterMutacao('Venda apagada');
  }));
}

UI.initPagina(renderVendas);
