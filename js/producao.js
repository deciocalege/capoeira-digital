/* @revisao 2.15.1 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).producao = '2.15.1';
/* ============ PÁGINA: PRODUÇÃO & INCUBAÇÃO ============ */

let _prod = {ativas:[], compartimentos:[], aves:[]}; // dados da página, usados pelos botões

async function renderProducao(){
  const app = document.getElementById('app');
  await UI.redesenhar(app, () => viewProducao(), () => { attachHandlersProducao(); UI.iniciarRelogioChoco(); });
}

async function afterMutacao(msg){
  if(msg) Util.toast(msg);
  await renderProducao();
}

async function viewProducao(){
  const [incAll, ovosLog, compartimentosRaw, aves] = await Promise.all([DB.getAll('incubacao'), DB.getAll('ovosLog'), DB.getAll('compartimentos'), DB.getAll('aves')]);
  const compartimentos = Calc.ordenarCompartimentos(compartimentosRaw);
  const ativas = Calc.incubacoesAtivas(incAll);
  const concluidas = Calc.incubacoesConcluidas(incAll);
  _prod = {ativas, compartimentos, aves};
  const totalOvos = ovosLog.reduce((s,o)=>s+Number(o.qtd),0);
  const compNome = {}; compartimentos.forEach(c=>{ compNome[c.id]=Util.escapeHTML(c.nome); });
  const femeasDisponiveis = aves
    .filter(a=>Number(a.femeas)>0)
    .slice()
    .sort((a,b)=>{
      const ia = compartimentos.findIndex(c=>Util.mesmoId(c.id, a.compartimentoId));
      const ib = compartimentos.findIndex(c=>Util.mesmoId(c.id, b.compartimentoId));
      return ia-ib;
    });
  const posturaPorAve = Calc.posturaPorAve(ovosLog, aves, compartimentos);
  const previsoesReproducao = aves
    .map(a=>({ave:a, prev:Calc.previsaoReproducao(a)}))
    .filter(x=>x.prev)
    .sort((a,b)=>a.prev.diasFaltam-b.prev.diasFaltam);
  return `
  <h2 class="section-title">Chocos em curso (${ativas.length})</h2>
  <div id="choco-live">${UI.renderChocoBloco(ativas, {acoes:true})}</div>
  <div id="painel-eclosao"></div>

  <h2 class="section-title" id="titulo-form-inc">Iniciar novo choco</h2>
  <div class="compartimento">
    <form id="form-incubacao" class="inline" data-id="">
      <div class="cheio">
        <strong>Aves que estão a chocar</strong> (podes escolher mais de uma)
        ${femeasDisponiveis.length===0
          ? `<p class="footnote">Ainda não há fêmeas registadas em Gestão — podes iniciar o choco mesmo assim.</p>`
          : `<div class="stack mt-2">${femeasDisponiveis.map(a=>`
              <label class="linha-centro"><input type="checkbox" name="aveIds" value="${a.id}"> ${Util.escapeHTML(a.especie)} (${compNome[a.compartimentoId]||'—'}) · ${a.femeas} fêmea(s)</label>`).join('')}</div>`}
      </div>
      <label>Nº de ovos <input type="number" name="numOvos" min="1" value="1" required></label>
      <label>Data de início <input type="date" name="dataInicio" value="${Util.hoje()}" required></label>
      <label>Duração da incubação (dias) — ex: galinha 21 · pato 28 · Muscovy 35 <input type="number" name="diasIncubacao" value="35" min="1" max="90" required></label>
      <label>Local onde está o choco
        <select name="compartimento">
          <option value="">— não definido —</option>
          ${compartimentos.map(c=>`<option value="${Util.escapeHTML(c.nome)}">${Util.escapeHTML(c.nome)}</option>`).join('')}
        </select>
      </label>
      <button class="btn" type="submit" id="btn-guardar-inc">Iniciar choco</button>
      <button class="btn outline" type="button" id="btn-cancelar-inc" hidden>Cancelar edição</button>
    </form>
  </div>
  <p class="footnote">${Icon.svg('dica')} Podes ter vários chocos ao mesmo tempo, cada um com as suas aves, ovos e data. Quando os ovos eclodirem, toca em "Registar eclosão" no cartão do choco: a app pergunta quantos ovos chocaram e adiciona os pintos ao compartimento que escolheres, somando-os ao total de aves.</p>

  <h2 class="section-title">Histórico de incubações</h2>
  ${concluidas.length===0 ? `<p class="empty">Ainda sem chocos concluídos.</p>` : `
  ${Tabela.html({
    id:'prod-incubacoes', limite:10,
    linhas: concluidas,
    contexto: i => ({taxa: Calc.taxaEclosao(i)}),
    colunas:[
      {titulo:'Início', valor:i=>Util.dataBR(i.dataInicio)||'—'},
      {titulo:'Aves', valor:i=>(i.aveNomes||[]).join(', ')||'—', largo:true},
      {titulo:'Ovos', valor:i=>i.numOvos},
      {titulo:'Nascidos', valor:i=>i.nascidos},
      {titulo:'Eclosão', valor:(i,c)=>c.taxa==null ? '—' : c.taxa+'%'},
      {titulo:'Destino', valor:i=>i.destinoNome||'—', largo:true}
    ],
    acoes: i => `<button class="btn small danger" data-del-inc="${i.id}">Apagar</button>`
  })}`}

  <h2 class="section-title">Postura de ovos</h2>
  <div class="cards">
    <div class="card"><div class="label">Total registado</div><div class="value">${totalOvos}</div><div class="sub">ovos desde o início do registo</div></div>
  </div>
  <form id="form-ovos" class="inline" data-id="">
    <label>Data <input type="date" name="data" value="${Util.hoje()}" required></label>
    <label>Qtd de ovos <input type="number" name="qtd" min="0" required></label>
    <label>Fêmea/grupo
      <select name="aveId">
        <option value="">— não especificado —</option>
        ${femeasDisponiveis.map(a=>`<option value="${a.id}">${Util.escapeHTML(a.especie)} (${compNome[a.compartimentoId]||'—'})</option>`).join('')}
      </select>
    </label>
    <button class="btn" type="submit">Registar</button>
    <button class="btn outline" type="button" id="btn-cancelar-ovo" hidden>Cancelar edição</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} Escolhe a fêmea/grupo que pôs os ovos para veres a produção separada por fêmea abaixo. Se não souberes qual foi, deixa "não especificado".</p>

  <h3 class="sub-titulo">Postura por fêmea/grupo</h3>
  ${posturaPorAve.length===0 ? `<p class="empty">Ainda sem dados suficientes para separar por fêmea.</p>` : `
  ${Tabela.html({
    id:'prod-por-femea',
    linhas: posturaPorAve,
    colunas:[
      {titulo:'Fêmea/grupo', valor:p=>p.label},
      {titulo:'Total de ovos', valor:p=>p.total, num:true}
    ]
  })}`}

  ${ovosLog.length===0 ? `<p class="empty">Ainda sem registos de postura.</p>` : `
  <h3 class="sub-titulo">Histórico de postura</h3>
  ${Tabela.html({
    id:'prod-postura', limite:20, busca:true, buscaPlaceholder:'Pesquisar fêmea, local…',
    linhas: ovosLog.slice().reverse(),
    contexto: o => {
      const ave = o.aveId ? aves.find(a=>Util.mesmoId(a.id, o.aveId)) : null;
      return {ave, compDaAve: ave ? (compNome[ave.compartimentoId]||'—') : Util.escapeHTML(o.compartimento||'—')};
    },
    colunas:[
      {titulo:'Data', valor:o=>Util.dataBR(o.data)},
      {titulo:'Qtd', valor:o=>o.qtd, num:true},
      {titulo:'Fêmea/grupo', valor:(o,c)=>c.ave ? c.ave.especie : '—', filtro:true, largo:true},
      {titulo:'Compartimento', valor:(o,c)=>c.compDaAve, html:true, largo:true}
    ],
    acoes: o => `<button class="btn small outline" data-edit-ovo="${o.id}">Editar</button> <button class="btn small danger" data-del-ovo="${o.id}">Apagar</button>`
  })}`}

  <h2 class="section-title">Previsão de início de reprodução</h2>
  <p class="footnote">Estimativa por espécie a partir da data de entrada, só para aves com finalidade de reprodução (patos/patas ≈ 180 dias, galinhas/galos ≈ 150 dias). É uma previsão aproximada — serve para te ajudar a planear, não substitui a observação directa.</p>
  ${previsoesReproducao.length===0 ? `<p class="empty">Nenhuma ave com finalidade de reprodução registada ainda.</p>` : `
  ${Tabela.html({
    id:'prod-previsoes',
    linhas: previsoesReproducao,
    colunas:[
      {titulo:'Espécie/Grupo', valor:({ave:a})=>a.especie},
      {titulo:'Compartimento', valor:({ave:a})=>compNome[a.compartimentoId]||'—'},
      {titulo:'Estado', valor:({prev})=>prev.emIdade ? `${Icon.svg('check')} Já em idade reprodutiva` : `Faltam ${prev.diasFaltam} dias (prev. ${Util.dataBR(prev.dataPrevista)})`, html:true, largo:true}
    ]
  })}`}
  `;
}

function attachHandlersProducao(){
  const fi = document.getElementById('form-incubacao');
  if(fi){
    const btnGuardar = document.getElementById('btn-guardar-inc');
    const btnCancelar = document.getElementById('btn-cancelar-inc');
    const tituloForm = document.getElementById('titulo-form-inc');
    const sairEdicao = ()=>{
      fi.reset(); fi.dataset.id = '';
      tituloForm.textContent = 'Iniciar novo choco';
      btnGuardar.textContent = 'Iniciar choco';
      btnCancelar.hidden = true;
    };
    btnCancelar.addEventListener('click', sairEdicao);

    fi.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(fi);
      const dataInicio = fd.get('dataInicio') || Util.hoje();
      const diasIncubacao = Math.round(Number(fd.get('diasIncubacao')));
      const numOvos = Math.round(Number(fd.get('numOvos')));
      if(!(diasIncubacao>=1 && diasIncubacao<=90)){ Util.toast('⚠️ A duração da incubação deve estar entre 1 e 90 dias'); return; }
      if(!(numOvos>=1)){ Util.toast('⚠️ Indica quantos ovos estão a chocar (pelo menos 1)'); return; }
      const aveIds = fd.getAll('aveIds').map(v=>Util.chaveId(v));   // número (ids antigos) ou UUID
      const avesAtuais = await DB.getAll('aves');
      const comps = await DB.getAll('compartimentos');
      const escolhidas = aveIds.map(id=>avesAtuais.find(x=>Util.mesmoId(x.id, id))).filter(Boolean);
      const aveNomes = escolhidas.map(a=>{
        const c = comps.find(c=>Util.mesmoId(c.id, a.compartimentoId));
        return `${a.especie}${c ? ' ('+c.nome+')' : ''}`;
      });
      const especies = [...new Set(escolhidas.map(a=>a.especie).filter(Boolean))];
      const todas = await DB.getAll('incubacao');
      const idEdit = fi.dataset.id ? Util.chaveId(fi.dataset.id) : null;
      const existente = idEdit ? todas.find(x=>Util.mesmoId(x.id, idEdit)) : null;
      await DB.put('incubacao', {
        ...(existente||{}),
        id: existente ? existente.id : Calc.proximoIdIncubacao(todas, DB.usaUUID),   // UUID quando a base usa UUID
        ativa: true,
        numOvos, dataInicio, diasIncubacao,
        compartimento: fd.get('compartimento') || '',
        aveIds, aveNomes, especies,
        alertaMostrado: false
      });
      sairEdicao();
      await afterMutacao(existente ? 'Choco actualizado — contagem recalculada' : 'Choco iniciado');
    });

    /* Editar: preenche o formulário com os dados do choco escolhido */
    document.querySelectorAll('[data-edit-inc]').forEach(b=>b.addEventListener('click', ()=>{
      const inc = _prod.ativas.find(x=>Util.mesmoId(x.id, b.dataset.editInc));
      if(!inc) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
      fi.dataset.id = inc.id;
      fi.querySelector('[name=numOvos]').value = inc.numOvos;
      fi.querySelector('[name=dataInicio]').value = inc.dataInicio || Util.hoje();
      fi.querySelector('[name=diasIncubacao]').value = inc.diasIncubacao;
      fi.querySelector('[name=compartimento]').value = inc.compartimento || '';
      fi.querySelectorAll('[name=aveIds]').forEach(c=>{ c.checked = (inc.aveIds||[]).some(x=>Util.mesmoId(x, c.value)); });
      tituloForm.textContent = 'Editar choco';
      btnGuardar.textContent = 'Guardar alterações';
      btnCancelar.hidden = false;
      fi.scrollIntoView({behavior:'smooth', block:'center'});
    }));
  }

  /* Registar eclosão: pergunta quantos ovos chocaram e adiciona os pintos */
  document.querySelectorAll('[data-eclosao-inc]').forEach(b=>b.addEventListener('click', ()=>{
    const inc = _prod.ativas.find(x=>Util.mesmoId(x.id, b.dataset.eclosaoInc));
    const painel = document.getElementById('painel-eclosao');
    if(!inc || !painel) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    const comps = _prod.compartimentos;
    if(comps.length===0){ Util.toast('⚠️ Cria primeiro um compartimento em Gestão para receber os pintos'); return; }
    const padrao = comps.find(c=>c.nome===inc.compartimento) || comps[0];
    const especiesExistentes = [...new Set(_prod.aves.map(a=>a.especie).filter(Boolean))];
    const nomes = (inc.aveNomes||[]).map(n=>Util.escapeHTML(n)).join(', ');
    painel.innerHTML = `
      <div class="compartimento">
        <h3>${Icon.svg('ovo')} Registar eclosão</h3>
        <p class="footnote">${nomes ? nomes+' — ' : ''}${inc.numOvos} ovos em incubação.</p>
        <p class="footnote">${Icon.svg('dica')} Os pintos entram <strong>sem sexo definido</strong>. Quando os conseguires identificar (alguns dias depois), regista os machos e as fêmeas em Gestão → <em>Editar / mover ave</em>.</p>
        <form id="form-eclosao" class="inline">
          <label>Quantos ovos chocaram? <input type="number" name="nascidos" min="0" max="${inc.numOvos}" value="${inc.numOvos}" required></label>
          <label>Local dos pintos
            <select name="compartimentoId" required>
              ${comps.map(c=>`<option value="${c.id}" ${Util.mesmoId(c.id, padrao.id)?'selected':''}>${Util.escapeHTML(c.nome)}</option>`).join('')}
            </select>
          </label>
          <label>Espécie/Grupo dos pintos <input type="text" name="especie" list="lista-especies-eclosao" value="${Util.escapeHTML((inc.especies||[])[0]||'')}" placeholder="ex: Pato Muscovy" required></label>
          <datalist id="lista-especies-eclosao">${especiesExistentes.map(e=>`<option value="${Util.escapeHTML(e)}">`).join('')}</datalist>
          <button class="btn" type="submit">Confirmar e adicionar às aves</button>
          <button class="btn outline" type="button" id="btn-cancelar-eclosao">Cancelar</button>
        </form>
      </div>`;
    painel.scrollIntoView({behavior:'smooth', block:'center'});
    document.getElementById('btn-cancelar-eclosao').addEventListener('click', ()=>{ painel.innerHTML = ''; });
    document.getElementById('form-eclosao').addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const nascidos = Math.round(Number(fd.get('nascidos')));
      const compartimentoId = Util.chaveId(fd.get('compartimentoId'));
      const especie = String(fd.get('especie')||'').trim();
      if(!(nascidos>=0 && nascidos<=inc.numOvos)){ Util.toast(`⚠️ O número de ovos que chocaram deve estar entre 0 e ${inc.numOvos}`); return; }
      const destino = comps.find(c=>Util.mesmoId(c.id, compartimentoId));
      if(nascidos>0 && (!destino || !especie)){ Util.toast('⚠️ Indica a espécie e o compartimento dos pintos'); return; }
      const taxa = Math.round((nascidos/inc.numOvos)*100);
      const pergunta = nascidos>0
        ? `Confirmas que ${nascidos} de ${inc.numOvos} ovos chocaram (${taxa}%)?\n\nSerão adicionados ${nascidos} "${especie}" ao compartimento "${destino.nome}" e somados ao total de aves.`
        : `Confirmas que nenhum ovo chocou? O choco será concluído e nenhuma ave será adicionada.`;
      if(!confirm(pergunta)) return;
      try{
        await DB.transacao(['aves','incubacao'], async (tx)=>{
          if(nascidos>0){
            await DB.reqToPromise(tx.objectStore('aves').add({
              compartimentoId, especie, qtd:nascidos, machos:0, femeas:0,
              dataEntrada:Util.hoje(), finalidade:'Crescimento (nascidos no choco)', autoDesde:Util.hoje()
            }));
          }
          await DB.reqToPromise(tx.objectStore('incubacao').put({
            ...inc, ativa:false, concluida:true, nascidos,
            dataConclusao:Util.hoje(), especieNascidos:especie,
            destinoCompartimentoId: nascidos>0 ? compartimentoId : null,
            destinoNome: nascidos>0 ? destino.nome : ''
          }));
        });
      }catch(err){
        return;
      }
      await afterMutacao(nascidos>0
        ? `🐣 ${nascidos} ${especie} adicionados a "${destino.nome}" e ao total de aves`
        : 'Choco concluído — nenhum ovo chocou');
    });
  }));

  /* Apagar um choco (em curso ou do histórico) */
  document.querySelectorAll('[data-del-inc]').forEach(b=>b.addEventListener('click', async ()=>{
    const todas = await DB.getAll('incubacao');
    const inc = todas.find(x=>Util.mesmoId(x.id, b.dataset.delInc));
    const msg = inc && inc.concluida
      ? 'Apagar este registo do histórico? As aves que já foram adicionadas ao plantel NÃO são removidas.'
      : 'Apagar este choco em curso? Esta acção não adiciona nenhuma ave.';
    if(!confirm(msg)) return;
    await DB.del('incubacao', Util.chaveId(b.dataset.delInc));
    await afterMutacao('Choco apagado');
  }));
  const fo = document.getElementById('form-ovos');
  if(fo) fo.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fo);
    const aveIdRaw = fd.get('aveId');
    const aveId = aveIdRaw ? Util.chaveId(aveIdRaw) : null;
    let compartimentoNome = '';
    if(aveId){
      const ave = await DB.get('aves', aveId);
      if(ave){
        const comp = await DB.get('compartimentos', ave.compartimentoId);
        compartimentoNome = comp ? comp.nome : '';
      }
    }
    const dadosOvo = {data:fd.get('data'), qtd:Number(fd.get('qtd')), aveId, compartimento:compartimentoNome};
    if(fo.dataset.id){
      const id = Util.chaveId(fo.dataset.id);
      const todos = await DB.getAll('ovosLog');
      const antigo = todos.find(o=>Util.mesmoId(o.id, id));
      await DB.put('ovosLog', {...(antigo||{}), ...dadosOvo, id});
      await afterMutacao('Postura actualizada');
    }else{
      await DB.add('ovosLog', dadosOvo);
      await afterMutacao('Postura registada');
    }
  });
  document.querySelectorAll('[data-edit-ovo]').forEach(b=>b.addEventListener('click', async ()=>{
    const todos = await DB.getAll('ovosLog');
    const o = todos.find(x=>Util.mesmoId(x.id, b.dataset.editOvo));
    if(!o || !fo) { Util.toast('⚠️ Registo não encontrado — pode já ter sido apagado. Recarrega a página.'); return; }
    fo.dataset.id = o.id;
    fo.querySelector('[name=data]').value = o.data;
    fo.querySelector('[name=qtd]').value = o.qtd;
    fo.querySelector('[name=aveId]').value = o.aveId ? String(o.aveId) : '';
    fo.querySelector('button[type=submit]').textContent = 'Guardar alterações';
    document.getElementById('btn-cancelar-ovo').hidden = false;
    fo.scrollIntoView({behavior:'smooth', block:'center'});
  }));
  const bCancelOvo = document.getElementById('btn-cancelar-ovo');
  if(bCancelOvo) bCancelOvo.addEventListener('click', ()=>{
    fo.reset(); fo.dataset.id = '';
    fo.querySelector('button[type=submit]').textContent = 'Registar';
    bCancelOvo.hidden = true;
  });
  document.querySelectorAll('[data-del-ovo]').forEach(b=>b.addEventListener('click', async ()=>{
    await DB.del('ovosLog', Util.chaveId(b.dataset.delOvo));
    await afterMutacao();
  }));
}

UI.initPagina(renderProducao);
