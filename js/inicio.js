/* ============ PÁGINA: INÍCIO (resumo geral) ============ */

async function renderInicio(){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="loading-msg">A carregar…</div>`;
  app.innerHTML = await viewInicio();
  attachHandlersInicio();
}

async function afterMutacao(msg){
  if(msg) Util.toast(msg);
  await renderInicio();
}

async function viewInicio(){
  const [compartimentos, aves, feedStock, consumo, transacoes, incAll, saidasAves, ovosLog] = await Promise.all([
    DB.getAll('compartimentos'), DB.getAll('aves'), DB.getAll('feedStock'), DB.getAll('consumo'), DB.getAll('transacoes'), DB.getAll('incubacao'), DB.getAll('saidasAves'), DB.getAll('ovosLog')
  ]);
  const inc = incAll;
  const totalVendidas = Calc.totalVendidas(saidasAves);
  const totalAbatidas = Calc.totalAbatidas(saidasAves);
  const totalMortas = Calc.totalMortas(saidasAves);
  const desp = Calc.totalDespesas(transacoes), rec = Calc.totalReceitas(transacoes);
  const stockKg = feedStock.reduce((s,i)=>s+Calc.stockAtual(i,consumo),0);
  const consumoDiarioEstimado = Calc.consumoDiarioEstimado(consumo);
  const diasRestantes = consumoDiarioEstimado>0 ? Math.floor(stockKg/consumoDiarioEstimado) : '—';
  const alertas = Calc.alertas(feedStock, consumo, inc, aves, ovosLog);
  let ultimoBackup = null;
  try{ ultimoBackup = localStorage.getItem('capoeira-ultimo-backup'); }catch(e){}
  const diasSemBackup = ultimoBackup ? Util.diasEntre(ultimoBackup, Util.hoje()) : null;
  if(diasSemBackup===null) alertas.push({tipo:'aviso', texto:'Ainda não fizeste nenhum backup — exporta um no fim desta página.'});
  else if(diasSemBackup>=7) alertas.push({tipo:'aviso', texto:`Último backup há ${diasSemBackup} dias — convém exportar um novo.`});
  const despesasCat = Calc.despesasPorCategoria(transacoes).slice(0,6).map(([label,valor])=>({label,valor}));
  const ultimosMeses = Calc.ultimosMesesGrafico(transacoes, 6);
  const despesasPorMesGrafico = ultimosMeses.map(m=>({label:m.label, valor:m.despesas}));
  const saldoPorMesGrafico = ultimosMeses.map(m=>({label:m.label, valor:m.saldo}));

  /* ============ DASHBOARD PRINCIPAL ============
     4 cartões que respondem directamente a "como está a exploração
     neste momento" — cada um com o número actual E para que lado está
     a ir (não só uma fotografia estática). */
  const plantel = Calc.tendenciaPlantel(aves, saidasAves);
  const financeira = Calc.tendenciaFinanceira(transacoes);
  const producao = Calc.producaoSemana(ovosLog);

  const setaPlantel = plantel.variacao>0 ? `↑ ${plantel.variacao}` : plantel.variacao<0 ? `↓ ${Math.abs(plantel.variacao)}` : '± 0';
  const classePlantel = plantel.variacao>0 ? 'trend-up' : plantel.variacao<0 ? 'trend-down' : '';
  const textoFinanceira = financeira.variacaoPct==null
    ? 'sem mês anterior para comparar'
    : `${financeira.variacaoPct>=0?'↑':'↓'} ${Math.abs(financeira.variacaoPct).toFixed(0)}% em relação ao mês anterior`;
  const classeFinanceira = financeira.variacaoPct==null ? '' : (financeira.variacaoPct>=0 ? 'trend-up' : 'trend-down');

  return `
  <h2 class="section-title">Como está a exploração agora <span class="live-clock">sincronizado com Gestão</span></h2>
  <div class="cards dashboard-principal">
    <div class="card dash-card">
      <div class="label">${Icon.svg('galinha')} Plantel</div>
      <div class="value">${plantel.total} aves</div>
      <div class="sub ${classePlantel}">${setaPlantel} esta semana</div>
    </div>
    <div class="card dash-card">
      <div class="label">${Icon.svg('trigo')} Ração</div>
      <div class="value">${stockKg.toFixed(0)} kg</div>
      <div class="sub">${diasRestantes==='—' ? 'sem dados de consumo suficientes' : `≈ ${diasRestantes} dia(s) restantes`}</div>
    </div>
    <div class="card dash-card">
      <div class="label">${Icon.svg('carteira')} Finanças</div>
      <div class="value ${financeira.saldoAtual<0?'neg':''}">${financeira.saldoAtual>=0?'+':''}${Util.moeda(financeira.saldoAtual)}</div>
      <div class="sub ${classeFinanceira}">${textoFinanceira}</div>
    </div>
    <div class="card dash-card">
      <div class="label">${Icon.svg('ovo')} Produção</div>
      <div class="value">${producao.total} ovos</div>
      <div class="sub">${producao.mediaDiaria.toFixed(1)} ovos/dia · esta semana</div>
    </div>
  </div>

  <h2 class="section-title">Alertas</h2>
  ${alertas.length
    ? `<ul class="lista-alertas">${alertas.map(a=>`<li class="alerta-${a.tipo}">${a.texto}</li>`).join('')}</ul>`
    : `<p class="empty">Sem alertas — tudo dentro do esperado.</p>`}

  <h2 class="section-title">Panorama financeiro</h2>
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

  <h2 class="section-title">Detalhe</h2>
  <div class="cards">
    <div class="card"><div class="label">Compartimentos</div><div class="value">${compartimentos.length}</div></div>
    <div class="card"><div class="label">Despesas (total)</div><div class="value neg">${Util.moeda(desp)}</div></div>
    <div class="card"><div class="label">Receitas (total)</div><div class="value">${Util.moeda(rec)}</div></div>
    <div class="card"><div class="label">Aves vendidas</div><div class="value">${totalVendidas}</div><div class="sub">total histórico</div></div>
    <div class="card"><div class="label">Aves abatidas</div><div class="value">${totalAbatidas}</div><div class="sub">para consumo próprio</div></div>
    <div class="card"><div class="label">Aves mortas</div><div class="value neg">${totalMortas}</div><div class="sub">registadas em Gestão</div></div>
  </div>
  <p class="footnote">${Icon.svg('aviso')} O valor de "Finanças" é Receitas − Despesas <strong>registadas</strong> na app — não é necessariamente o lucro real do negócio. Não desconta, por exemplo, o impacto financeiro das ${totalMortas} ave(s) morta(s), mão-de-obra própria, ou qualquer custo que ainda não tenhas lançado (água, energia, depreciação de equipamento, etc.).</p>

  <h2 class="section-title">Registar gasto extra</h2>
  <p class="footnote">Para manutenção, construção, compra de material ou qualquer outro gasto fora da rotina — sem precisar de ir até Finanças.</p>
  <form id="form-gasto-extra" class="inline">
    <label>Categoria
      <select name="categoria">
        <option>Manutenção</option><option>Construção/Infraestrutura</option><option>Material/Ferramentas</option>
        <option>Transporte</option><option>Equipamento</option><option>Outro</option>
      </select>
    </label>
    <label>Descrição <input type="text" name="desc" placeholder="ex: reparação da cerca" required></label>
    <label>Valor (MT) <input type="number" step="1" min="0" name="valor" required></label>
    <label>Data <input type="date" name="data" value="${Util.hoje()}" required></label>
    <button class="btn secondary" type="submit">Registar gasto</button>
  </form>

  <h2 class="section-title">Choco em curso</h2>
  <div id="choco-live">
  ${UI.renderChocoBloco(inc)}
  </div>

  <h2 class="section-title">Cópia de segurança</h2>
  <p class="footnote">Os dados ficam guardados no banco de dados deste aparelho. Exporta um ficheiro de backup regularmente para não perderes o histórico se desinstalares a app ou trocares de telemóvel.</p>
  <div class="split">
    <div class="compartimento">
      <h3>Exportar</h3>
      <p class="footnote">Guarda um ficheiro .json com todos os dados actuais.</p>
      <button class="btn" id="btn-export">⬇️ Exportar backup</button>
    </div>
    <div class="compartimento">
      <h3>Importar</h3>
      <p class="footnote">Restaura os dados a partir de um ficheiro .json exportado antes. Isto substitui os dados actuais.</p>
      <label>Ficheiro <input type="file" id="input-import" accept="application/json"></label>
    </div>
  </div>
  `;
}

function attachHandlersInicio(){
  const fExtra = document.getElementById('form-gasto-extra');
  if(fExtra) fExtra.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fExtra);
    await DB.add('transacoes', {tipo:'despesa', categoria:fd.get('categoria'), desc:fd.get('desc'), valor:Number(fd.get('valor')), data:fd.get('data')});
    await afterMutacao('Gasto extra registado');
  });
  const btnExport = document.getElementById('btn-export');
  if(btnExport) btnExport.addEventListener('click', async ()=>{
    const backup = await UI.construirBackupCompleto();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `capoeira-backup-${Util.hoje()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    try{ localStorage.setItem('capoeira-ultimo-backup', Util.hoje()); }catch(e){}
    Util.toast('Backup exportado');
  });
  const inputImport = document.getElementById('input-import');
  if(inputImport) inputImport.addEventListener('change', async e=>{
    const file = e.target.files[0];
    if(!file) return;
    if(!confirm('⚠️ Isto vai APAGAR e SUBSTITUIR todos os dados actuais pelos do ficheiro importado.\n\nPor segurança, antes de importar vamos descarregar automaticamente uma cópia dos dados actuais (um segundo ficheiro .json), para poderes recuperá-los caso isto seja um engano.\n\nContinuar?')){ inputImport.value=''; return; }
    try{
      const texto = await file.text();
      const dados = JSON.parse(texto);
      const storesEsperados = ['compartimentos','aves','feedStock','consumo','transacoes','ovosLog','saidasAves','misturas'];
      const temAlgumStoreValido = storesEsperados.some(s=>Array.isArray(dados[s])) || (dados.incubacao && typeof dados.incubacao==='object');
      if(!temAlgumStoreValido){
        Util.toast('⚠️ Este ficheiro não parece ser um backup válido da Capoeira Digital — nada foi alterado');
        inputImport.value = '';
        return;
      }
      if(Number(dados.versaoBackup) > 2){
        Util.toast('⚠️ Este backup é de uma versão mais recente da app — nada foi alterado');
        inputImport.value = '';
        return;
      }
      const registoInvalido = storesEsperados.some(s=>
        Array.isArray(dados[s]) && dados[s].some(r=>r===null || typeof r!=='object'));
      const incInvalida = Array.isArray(dados.incubacao) && dados.incubacao.some(r=>r===null || typeof r!=='object');
      if(registoInvalido || incInvalida){
        Util.toast('⚠️ O backup tem registos inválidos — nada foi alterado');
        inputImport.value = '';
        return;
      }
      try{
        const backupSeguranca = await UI.construirBackupCompleto();
        const blobSeg = new Blob([JSON.stringify(backupSeguranca, null, 2)], {type:'application/json'});
        const urlSeg = URL.createObjectURL(blobSeg);
        const aSeg = document.createElement('a');
        aSeg.href = urlSeg; aSeg.download = `capoeira-ANTES-DE-IMPORTAR-${Util.hoje()}-${Date.now()}.json`;
        document.body.appendChild(aSeg); aSeg.click(); aSeg.remove();
        URL.revokeObjectURL(urlSeg);
      }catch(errSeg){
        console.warn('Não foi possível gerar o backup de segurança automático', errSeg);
        if(!confirm('⚠️ Não foi possível criar automaticamente a cópia de segurança dos dados actuais. Queres mesmo assim continuar a importar (os dados actuais serão perdidos)?')){
          inputImport.value = '';
          return;
        }
      }
      /* Substituir TODOS os dados pelo backup importado — numa única
         transação atómica, envolvendo as 8 tabelas de uma vez. Ou o
         backup inteiro entra correctamente, ou (se algo falhar a meio,
         ex: um registo malformado) nada é alterado e ficas exactamente
         com os dados de antes — nunca com uma mistura de dados antigos
         e novos, que seria muito mais difícil de detectar e corrigir. */
      const todasAsTabelas = [...storesEsperados, 'incubacao'];
      try{
        await DB.transacao(todasAsTabelas, async (tx)=>{
          for(const store of storesEsperados){
            if(!Array.isArray(dados[store])) continue;
            const s = tx.objectStore(store);
            await DB.reqToPromise(s.clear());
            for(const registo of (dados[store]||[])) await DB.reqToPromise(s.put(registo));
          }
          if(dados.incubacao !== undefined){
            const incStore = tx.objectStore('incubacao');
            await DB.reqToPromise(incStore.clear());
            /* Backups novos: lista de chocos. Backups antigos: um só objecto. */
            const listaInc = Array.isArray(dados.incubacao)
              ? dados.incubacao
              : ((dados.incubacao && Object.keys(dados.incubacao).length) ? [{...dados.incubacao, id:1}] : []);
            let proximo = listaInc.reduce((m,r)=>Math.max(m, Number(r.id)||0), 0) + 1;
            for(const r of listaInc){
              await DB.reqToPromise(incStore.put(r.id!=null ? r : {...r, id:proximo++}));
            }
          }
        });
      }catch(errImport){
        // executarTransacaoAtomica já mostrou o toast de erro específico.
        inputImport.value = '';
        return;
      }
      Util.toast('✅ Backup importado com sucesso — cópia de segurança dos dados anteriores foi descarregada');
      await afterMutacao();
    }catch(err){
      console.error(err);
      Util.toast('⚠️ Ficheiro inválido — não foi possível importar. Nenhum dado foi alterado.');
    }
    inputImport.value = '';
  });
}

UI.initPagina(renderInicio);
