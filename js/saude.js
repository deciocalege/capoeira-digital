/* @revisao 2.18.0 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).saude = '2.18.0';
/* ============ PÁGINA: SAÚDE & CRESCIMENTO ============
   - Agenda de vacinas e medicação (com repetição e custo opcional ligado às Finanças)
   - Pesagens por lote, com o ganho de peso por dia entre pesagens */

const TIPOS_SAUDE = ['Vacina', 'Medicação', 'Desparasitação', 'Outro'];
let _saude = {tarefas:[], pesagens:[], aves:[]}; // dados da página usados pelos botões

async function renderSaude(){
  const app = document.getElementById('app');
  await UI.redesenhar(app, () => viewSaude(), () => { attachHandlersSaude(); });
}

async function afterMutacao(msg){
  if(msg) Util.toast(msg);
  await renderSaude();
}

function rotuloLote(a){ return `${a.especie} (${a.qtd})`; }

async function viewSaude(){
  const [tarefas, pesagens, aves, compartimentos] = await Promise.all([
    DB.getAll('saude'), DB.getAll('pesagens'), DB.getAll('aves'), DB.getAll('compartimentos')
  ]);
  const hoje = Util.hoje();
  const compNome = {}; compartimentos.forEach(c=>{ compNome[c.id]=c.nome; });
  _saude = {tarefas, pesagens, aves};

  const retiradas = Calc.retiradasAtivas(tarefas, null, hoje);
  const pendentes = Calc.tarefasSaudePendentes(tarefas);
  const feitas = tarefas.filter(t=>t.feito)
    .sort((a,b)=>String(b.dataFeito||b.data).localeCompare(String(a.dataFeito||a.data)));
  const optsLotes = aves.map(a=>`<option value="${a.id}">${Util.escapeHTML(a.especie)} (${a.qtd})${compNome[a.compartimentoId] ? ' · '+Util.escapeHTML(compNome[a.compartimentoId]) : ''}</option>`).join('');

  const pill = t=>{
    const {estado, dias} = Calc.estadoTarefaSaude(t, hoje);
    if(estado==='atrasada') return {classe:'perigo', label:`Atrasada há ${-dias} dia(s)`};
    if(estado==='hoje') return {classe:'aviso', label:'Hoje'};
    if(estado==='breve') return {classe:'aviso', label:`Em ${dias} dia(s)`};
    return {classe:'calmo', label:`Em ${dias} dia(s)`};
  };

  /* pesagens agrupadas por lote */
  const grupos = {};
  pesagens.forEach(p=>{ const k = p.loteId==null ? 'x' : p.loteId; (grupos[k] = grupos[k] || []).push(p); });

  return `
  ${retiradas.length===0 ? '' : `
  <h2 class="section-title">Períodos de retirada em curso</h2>
  <div class="compartimento">
    ${retiradas.map(r=>`<p><span class="status-pill status-pill-aviso">Até ${r.fim}</span> ${Util.escapeHTML(r.tipo)}: ${Util.escapeHTML(r.produto)} — ${Util.escapeHTML(r.loteNome || 'todas as aves')}<br><span class="footnote">Não vender nem abater antes desta data (faltam ${r.diasRestantes} dia(s)).</span></p>`).join('')}
  </div>`}

  <h2 class="section-title">Agenda de vacinas e medicação</h2>
  ${pendentes.length===0 ? `<p class="empty">Nada agendado. Adiciona a primeira vacina ou medicação abaixo.</p>` : pendentes.map(t=>{
    const p = pill(t);
    return `<div class="compartimento">
      <h3>${Util.escapeHTML(t.tipo)}: ${Util.escapeHTML(t.produto)}</h3>
      <p><span class="status-pill status-pill-${p.classe}">${p.label}</span></p>
      <p class="footnote">${Util.escapeHTML(t.loteNome || 'Todas as aves')} · ${t.data}${t.repetirDias ? ` · repete a cada ${t.repetirDias} dias` : ''}${t.retiradaDias ? ` · retirada ${t.retiradaDias} dias` : ''}${t.custo ? ` · custo previsto ${Util.moeda(t.custo)}` : ''}</p>
      ${t.notas ? `<p class="footnote">${Util.escapeHTML(t.notas)}</p>` : ''}
      <p class="row-actions mt-2">
        <button class="btn small" data-feito="${t.id}">${Icon.svg('check')} Feito</button>
        <button class="btn small outline" data-edit-saude="${t.id}">Editar</button>
        <button class="btn small danger outline" data-del-saude="${t.id}">Apagar</button>
      </p>
    </div>`;
  }).join('')}
  <div id="painel-feito"></div>

  <h3 id="titulo-form-saude">Agendar vacina / medicação</h3>
  <form id="form-saude" class="inline" data-id="">
    <label>Tipo
      <select name="tipo">${TIPOS_SAUDE.map(t=>`<option>${t}</option>`).join('')}</select>
    </label>
    <label>Produto <input type="text" name="produto" placeholder="ex: Newcastle" required></label>
    <label>Aplicar a
      <select name="loteId"><option value="">Todas as aves</option>${optsLotes}</select>
    </label>
    <label>Data <input type="date" name="data" value="${hoje}" required></label>
    <label>Repetir a cada (dias, opcional) <input type="number" name="repetirDias" min="1"></label>
    <label>Período de retirada (dias, opcional) <input type="number" name="retiradaDias" min="1"></label>
    ${UI.podeFinancas() ? `<label>Custo previsto (MT, opcional) <input type="number" name="custo" min="0" step="1"></label>` : ''}
    <label>Notas <input type="text" name="notas" maxlength="160"></label>
    <button class="btn" type="submit" id="btn-guardar-saude">Agendar</button>
    <button class="btn outline" type="button" id="btn-cancelar-saude" hidden>Cancelar edição</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} Os avisos aparecem no Resumo quando falta 3 dias ou menos (ou já passou a data). <strong>Período de retirada:</strong> indica os dias que a bula/rótulo (ou o veterinário) manda esperar antes de vender ou abater aves tratadas — a app avisa-te na venda/abate e no Resumo. Ao marcar como feito, se houver custo, a despesa é criada em Finanças (categoria "Saúde/Vacinas"), e se repetir, a seguinte fica logo agendada.</p>

  ${feitas.length===0 ? '' : `
  <details class="mt-3"><summary>Histórico de saúde (${feitas.length})</summary>
    ${Tabela.html({
      id:'saude-historico', limite:15, busca:true, buscaPlaceholder:'Pesquisar produto, lote…',
      linhas: feitas,
      colunas:[
        {titulo:'Feito em', valor:t=>Util.dataBR(t.dataFeito||t.data)},
        {titulo:'Tipo', valor:t=>t.tipo, filtro:true},
        {titulo:'Produto', valor:t=>t.produto, largo:true},
        {titulo:'Aves', valor:t=>t.loteNome||'Todas'},
        {titulo:'Custo', valor:t=>t.custo ? Util.moeda(t.custo) : '—', num:true}
      ],
      acoes: t => `<button class="btn small danger" data-del-saude="${t.id}">Apagar</button>`
    })}
  </details>`}

  <h2 class="section-title">Pesagens e crescimento</h2>
  <form id="form-pesagem" class="inline" data-id="">
    <label>Lote
      <select name="loteId" required>${aves.length===0 ? '<option value="">— sem lotes —</option>' : optsLotes}</select>
    </label>
    <label>Data <input type="date" name="data" value="${hoje}" required></label>
    <label>Peso médio (g) <input type="number" name="pesoMedioG" min="1" step="1" required></label>
    <label>Nº de aves pesadas (opcional) <input type="number" name="amostra" min="1"></label>
    <label>Notas <input type="text" name="notas" maxlength="160"></label>
    <button class="btn" type="submit" id="btn-guardar-pesagem">Registar pesagem</button>
    <button class="btn outline" type="button" id="btn-cancelar-pesagem" hidden>Cancelar edição</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} Pesa uma amostra (por exemplo 5 a 10 aves) e indica a média em gramas. A app calcula o ganho por dia entre pesagens seguidas.</p>

  ${pesagens.length===0 ? `<p class="empty">Ainda sem pesagens registadas.</p>` : Object.keys(grupos).map(k=>{
    const lote = k==='x' ? null : aves.find(a=>Util.mesmoId(a.id, k));
    const nome = lote ? rotuloLote(lote) : ((grupos[k][0] && grupos[k][0].loteNome) || 'Lote removido');
    const linhas = Calc.evolucaoPeso(grupos[k], lote);
    const ultima = linhas[linhas.length-1];
    return `<div class="compartimento">
      <h3>${Util.escapeHTML(nome)}</h3>
      <p class="footnote">Última pesagem: ${ultima.data} · ${ultima.pesoMedioG} g${ultima.ganhoDiario!=null ? ` · ${ultima.ganhoDiario>=0 ? '+' : ''}${ultima.ganhoDiario} g/dia` : ''}</p>
      ${linhas.length>1 ? UI.svgBarChart(linhas.map(r=>({label:r.data.slice(5), valor:r.pesoMedioG})), {cor:'var(--mato)'}) : ''}
      ${Tabela.html({
        id:'saude-pesagens',
        linhas: linhas,
        colunas:[
          {titulo:'Data', valor:r=>Util.dataBR(r.data)},
          {titulo:'Idade', valor:r=>r.idade==null ? '—' : r.idade+' dias'},
          {titulo:'Peso médio (g)', valor:r=>r.pesoMedioG, num:true},
          {titulo:'Ganho (g/dia)', valor:r=>r.ganhoDiario==null ? '—' : (r.ganhoDiario>=0 ? '+' : '')+r.ganhoDiario, num:true},
          {titulo:'Pesadas', valor:r=>r.amostra||'—', num:true}
        ],
        acoes: r => `<button class="btn small outline" data-edit-pesagem="${r.id}">Editar</button> <button class="btn small danger" data-del-pesagem="${r.id}">Apagar</button>`
      })}
    </div>`;
  }).join('')}
  `;
}

function attachHandlersSaude(){
  /* ---------- Agenda: agendar / editar ---------- */
  const fs = document.getElementById('form-saude');
  if(fs){
    const titulo = document.getElementById('titulo-form-saude');
    const btnG = document.getElementById('btn-guardar-saude');
    const btnC = document.getElementById('btn-cancelar-saude');
    btnC.addEventListener('click', ()=>{
      fs.reset(); fs.dataset.id = '';
      titulo.textContent = 'Agendar vacina / medicação'; btnG.textContent = 'Agendar'; btnC.hidden = true;
    });
    fs.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(fs);
      const produto = String(fd.get('produto')||'').trim();
      if(!produto){ Util.toast('⚠️ Indica o produto'); return; }
      const loteIdBruto = fd.get('loteId');
      const lote = loteIdBruto ? _saude.aves.find(a=>Util.mesmoId(a.id, loteIdBruto)) : null;
      const repetirDias = Math.round(Number(fd.get('repetirDias'))||0);
      const retiradaDias = Math.round(Number(fd.get('retiradaDias'))||0);
      const custo = Number(fd.get('custo'))||0;
      const idEdit = fs.dataset.id ? Util.chaveId(fs.dataset.id) : null;   // número (ids antigos) ou UUID
      const existente = idEdit ? _saude.tarefas.find(t=>Util.mesmoId(t.id, idEdit)) : null;
      const reg = {
        ...(existente||{}),
        tipo:fd.get('tipo'), produto,
        loteId: lote ? lote.id : null,
        loteNome: lote ? rotuloLote(lote) : '',
        data:fd.get('data'), feito:false,
        repetirDias: repetirDias>0 ? repetirDias : null,
        retiradaDias: retiradaDias>0 ? retiradaDias : null,
        custo: custo>0 ? custo : null,
        notas:String(fd.get('notas')||'').trim()
      };
      if(idEdit){ reg.id = idEdit; await DB.put('saude', reg); }
      else await DB.add('saude', reg);
      await afterMutacao(idEdit ? 'Tarefa actualizada' : 'Tarefa agendada');
    });
    document.querySelectorAll('[data-edit-saude]').forEach(b=>b.addEventListener('click', ()=>{
      const t = _saude.tarefas.find(x=>Util.mesmoId(x.id, b.dataset.editSaude));
      if(!t) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
      fs.dataset.id = t.id;
      fs.querySelector('[name=tipo]').value = t.tipo;
      fs.querySelector('[name=produto]').value = t.produto;
      fs.querySelector('[name=loteId]').value = t.loteId==null ? '' : String(t.loteId);
      fs.querySelector('[name=data]').value = t.data;
      fs.querySelector('[name=repetirDias]').value = t.repetirDias || '';
      fs.querySelector('[name=retiradaDias]').value = t.retiradaDias || '';
      fs.querySelector('[name=custo]').value = t.custo || '';
      fs.querySelector('[name=notas]').value = t.notas || '';
      titulo.textContent = 'Editar tarefa'; btnG.textContent = 'Guardar alterações'; btnC.hidden = false;
      fs.scrollIntoView({behavior:'smooth', block:'center'});
    }));
  }

  /* ---------- Marcar como feito ---------- */
  document.querySelectorAll('[data-feito]').forEach(b=>b.addEventListener('click', ()=>{
    const t = _saude.tarefas.find(x=>Util.mesmoId(x.id, b.dataset.feito));
    const painel = document.getElementById('painel-feito');
    if(!t || !painel) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    painel.innerHTML = `
      <div class="compartimento">
        <h3>${Icon.svg('check')} ${Util.escapeHTML(t.tipo)}: ${Util.escapeHTML(t.produto)}</h3>
        <form id="form-feito" class="inline">
          <label>Feito em <input type="date" name="dataFeito" value="${Util.hoje()}" required></label>
    ${UI.podeFinancas() ? `<label>Custo (MT, opcional) <input type="number" name="custo" min="0" step="1" value="${t.custo||''}"></label>` : ''}
          <button class="btn" type="submit">Confirmar</button>
          <button class="btn outline" type="button" id="btn-cancelar-feito">Cancelar</button>
        </form>
        <p class="footnote">${t.repetirDias ? `A seguinte será agendada para ${t.repetirDias} dias depois da data em que foi feita. ` : ''}Se indicares um custo, é criada a despesa em Finanças.</p>
      </div>`;
    painel.scrollIntoView({behavior:'smooth', block:'center'});
    document.getElementById('btn-cancelar-feito').addEventListener('click', ()=>{ painel.innerHTML = ''; });
    document.getElementById('form-feito').addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const dataFeito = fd.get('dataFeito') || Util.hoje();
      const custo = Number(fd.get('custo'))||0;
      const proxima = Calc.proximaTarefaSaude(t, dataFeito);
      try{
        await DB.transacao(['saude','transacoes'], async (tx)=>{
          const store = tx.objectStore('saude');
          await DB.reqToPromise(store.put({...t, feito:true, dataFeito, custo: custo>0 ? custo : null}));
          if(custo>0){
            await DB.reqToPromise(tx.objectStore('transacoes').add({
              tipo:'despesa', categoria:'Saúde/Vacinas',
              desc:`${t.tipo}: ${t.produto}${t.loteNome ? ' ('+t.loteNome+')' : ''}`,
              valor:custo, data:dataFeito, saudeId:t.id
            }));
          }
          if(proxima) await DB.reqToPromise(store.add(proxima));
        });
      }catch(err){ return; }
      await afterMutacao(proxima ? `Feito — próxima agendada para ${proxima.data}` : 'Marcada como feita');
    });
  }));

  document.querySelectorAll('[data-del-saude]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = Util.chaveId(b.dataset.delSaude);
    const t = _saude.tarefas.find(x=>Util.mesmoId(x.id, id));
    if(!t) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    if(!confirm(`Apagar "${t.tipo}: ${t.produto}"?`)) return;
    const trans = await DB.getAll('transacoes');
    const despesa = trans.find(x=>Util.mesmoId(x.saudeId, id));
    const apagarDespesa = despesa ? confirm(`Apagar também a despesa correspondente em Finanças (${Util.moeda(despesa.valor)}, ${despesa.data})?`) : false;
    try{
      await DB.transacao(['saude','transacoes'], async (tx)=>{
        await DB.reqToPromise(tx.objectStore('saude').delete(id));
        if(apagarDespesa) await DB.reqToPromise(tx.objectStore('transacoes').delete(despesa.id));
      });
    }catch(err){ return; }
    await afterMutacao('Tarefa apagada');
  }));

  /* ---------- Pesagens ---------- */
  const fp = document.getElementById('form-pesagem');
  if(fp){
    const btnG = document.getElementById('btn-guardar-pesagem');
    const btnC = document.getElementById('btn-cancelar-pesagem');
    btnC.addEventListener('click', ()=>{
      fp.reset(); fp.dataset.id = ''; btnG.textContent = 'Registar pesagem'; btnC.hidden = true;
    });
    fp.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(fp);
      const lote = _saude.aves.find(a=>Util.mesmoId(a.id, fd.get('loteId')));
      const pesoMedioG = Number(fd.get('pesoMedioG'));
      const amostra = Math.round(Number(fd.get('amostra'))||0);
      if(!lote){ Util.toast('⚠️ Escolhe o lote (regista aves em Gestão primeiro)'); return; }
      if(!(pesoMedioG>0)){ Util.toast('⚠️ Indica o peso médio em gramas (maior que 0)'); return; }
      const idEdit = fp.dataset.id ? Util.chaveId(fp.dataset.id) : null;
      const existente = idEdit ? _saude.pesagens.find(p=>Util.mesmoId(p.id, idEdit)) : null;
      const reg = {
        ...(existente||{}), loteId:lote.id, loteNome:rotuloLote(lote), data:fd.get('data'),
        pesoMedioG, amostra: amostra>0 ? amostra : null, notas:String(fd.get('notas')||'').trim()
      };
      if(idEdit){ reg.id = idEdit; await DB.put('pesagens', reg); }
      else await DB.add('pesagens', reg);
      await afterMutacao(idEdit ? 'Pesagem actualizada' : 'Pesagem registada');
    });
    document.querySelectorAll('[data-edit-pesagem]').forEach(b=>b.addEventListener('click', ()=>{
      const p = _saude.pesagens.find(x=>Util.mesmoId(x.id, b.dataset.editPesagem));
      if(!p) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
      fp.dataset.id = p.id;
      fp.querySelector('[name=loteId]').value = String(p.loteId);
      fp.querySelector('[name=data]').value = p.data;
      fp.querySelector('[name=pesoMedioG]').value = p.pesoMedioG;
      fp.querySelector('[name=amostra]').value = p.amostra || '';
      fp.querySelector('[name=notas]').value = p.notas || '';
      btnG.textContent = 'Guardar alterações'; btnC.hidden = false;
      fp.scrollIntoView({behavior:'smooth', block:'center'});
    }));
  }
  document.querySelectorAll('[data-del-pesagem]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('Apagar esta pesagem?')) return;
    await DB.del('pesagens', Util.chaveId(b.dataset.delPesagem));
    await afterMutacao('Pesagem apagada');
  }));
}

UI.initPagina(renderSaude);
