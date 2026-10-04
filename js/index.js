/* ============ RESUMO RÁPIDO NA PÁGINA PRINCIPAL (index.html) ============
   Lê a mesma base de dados que as outras páginas e mostra, antes dos
   cartões de navegação: o choco em curso (se houver), quantos ovos já
   foram registados, e o panorama financeiro (despesas, receitas, saldo).
   Assim dá para ver o essencial sem entrar em nenhuma secção. */

async function renderResumoIndex(){
  const el = document.getElementById('resumo-index');
  if(!el) return;
  const [incAll, ovosLog, transacoes] = await Promise.all([
    DB.getAll('incubacao'), DB.getAll('ovosLog'), DB.getAll('transacoes')
  ]);
  const inc = incAll;
  const totalOvos = ovosLog.reduce((s,o)=>s+Number(o.qtd),0);
  const desp = Calc.totalDespesas(transacoes);
  const rec = Calc.totalReceitas(transacoes);
  const sal = Calc.saldo(transacoes);

  el.innerHTML = `
    <h2 class="section-title">Choco em curso</h2>
    <div id="choco-live">
    ${UI.renderChocoBloco(inc)}
    </div>

    <h2 class="section-title">Resumo rápido</h2>
    <div class="cards">
      <div class="card"><div class="label">${Icon.svg('ovo')} Ovos registados</div><div class="value">${totalOvos}</div><div class="sub">total desde o início do registo</div></div>
      <div class="card"><div class="label">Despesas</div><div class="value neg">${Util.moeda(desp)}</div></div>
      <div class="card"><div class="label">Receitas</div><div class="value">${Util.moeda(rec)}</div></div>
      <div class="card"><div class="label">Saldo acumulado</div><div class="value ${sal<0?'neg':''}">${Util.moeda(sal)}</div><div class="sub">não é o lucro real — ver Finanças</div></div>
    </div>
  `;
}

(async function initIndex(){
  UI.renderFooter();
  try{
    await DB.preparar();
    await UI.verificarAlertaIncubacao();
    await renderResumoIndex();
    UI.iniciarRelogioChoco();
  }catch(e){
    console.error('Falha ao carregar o resumo da página principal', e);
    const el = document.getElementById('resumo-index');
    const detalhe = (e && e.message) ? e.message : 'motivo desconhecido';
    if(el) el.innerHTML = `<p class="empty">${Icon.svg('aviso')} Não foi possível carregar o resumo agora (${detalhe}). As secções abaixo continuam disponíveis normalmente.<br><br>${Icon.svg('dica')} Se isto acontecer sempre, experimenta abrir o <code>index.html</code> num navegador completo (Chrome, Firefox) em vez da pré-visualização do editor — alguns navegadores embutidos bloqueiam o armazenamento local em ficheiros abertos directamente do telemóvel.</p>`;
  }
})();
