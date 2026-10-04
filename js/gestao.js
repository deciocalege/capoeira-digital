/* ============ PÁGINA: GESTÃO (plantel — compartimentos, aves, saídas) ============
   Os formulários de "Adicionar ave" e "Editar/mover ave" são ÚNICOS
   para toda a página (não um por compartimento) — escolhes o
   compartimento dentro do próprio formulário. Isto evita ter um bloco
   de formulário repetido em cada compartimento, e permite mover uma
   ave de um compartimento para outro só mudando esse campo. */

async function renderGestao(){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="loading-msg">A carregar…</div>`;
  app.innerHTML = await viewGestao();
  attachHandlersGestao();
}

async function afterMutacao(msg){
  if(msg) Util.toast(msg);
  await renderGestao();
}

/* Gera o <tr> de uma linha da "Lista completa de aves" — reaproveitado
   tanto no desenho inicial da página como sempre que os filtros/ordenação
   mudam (ver aplicarFiltrosAves() em attachHandlersGestao). */
function linhaAveTabelaHTML(a, compartimentos){
  const c = compartimentos.find(x=>x.id===a.compartimentoId);
  return `<tr data-nome-filtro="${Util.escapeHTML(Util.normalizarTexto(a.especie))} ${Util.escapeHTML(Util.normalizarTexto(c?c.nome:''))}"
              data-compartimento-id="${a.compartimentoId}"
              data-machos="${a.machos||0}" data-femeas="${a.femeas||0}"
              data-finalidade="${Util.escapeHTML(a.finalidade||'')}">
    <td data-label="Espécie/Grupo">${Util.escapeHTML(a.especie)}</td>
    <td data-label="Compartimento">${c?Util.escapeHTML(c.nome):'sem compartimento'}</td>
    <td data-label="Qtd">${a.qtd}</td>
    <td data-label="Machos">${a.machos||0}</td>
    <td data-label="Fêmeas">${a.femeas||0}</td>
    <td data-label="Idade">${Calc.idadeExibicao(a)}</td>
    <td data-label="Entrada">${a.dataEntrada||'—'}</td>
    <td class="row-actions"><button class="btn small outline" data-rename-ave="${a.id}" title="Corrigir nome">${Icon.svg('lapis')} Renomear</button></td></tr>`;
}

async function viewGestao(){
  const [compartimentosRaw, aves, saidasAves] = await Promise.all([DB.getAll('compartimentos'), DB.getAll('aves'), DB.getAll('saidasAves')]);
  const compartimentos = Calc.ordenarCompartimentos(compartimentosRaw);
  const especiesExistentes = [...new Set(aves.map(a=>a.especie).filter(Boolean))].sort();

  const opcoesCompartimento = compartimentos.map(c=>`<option value="${c.id}">${Util.escapeHTML(c.nome)}</option>`).join('');

  return `
  <h2 class="section-title">Adicionar novo compartimento</h2>
  <form id="form-compartimento" class="inline">
    <label>Nome <input type="text" name="nome" placeholder="ex: Compartimento 6" required></label>
    <label>Descrição <input type="text" name="desc" placeholder="ex: Poedeiras"></label>
    <button class="btn" type="submit">Adicionar compartimento</button>
  </form>

  <h2 class="section-title">Adicionar ave</h2>
  ${compartimentos.length===0 ? `<p class="empty">Cria primeiro um compartimento acima — depois podes adicionar aves a ele.</p>` : `
  <form id="form-ave-central" class="inline">
    <label>Compartimento
      <select name="compartimentoId" required>${opcoesCompartimento}</select>
    </label>
    <label>Espécie/Grupo
      <select id="especie-select">
        ${especiesExistentes.map(e=>`<option value="${Util.escapeHTML(e)}">${Util.escapeHTML(e)}</option>`).join('')}
        <option value="__nova__">➕ Nova espécie...</option>
      </select>
    </label>
    <label id="especie-nova-wrap" style="display:${especiesExistentes.length?'none':'flex'};">
      Nome da nova espécie <input type="text" id="especie-nova" placeholder="ex: Pato Pequim" ${especiesExistentes.length?'':'required'}>
    </label>
    <label>Qtd <input type="number" name="qtd" min="1" value="1" required></label>
    <label>Machos <input type="number" name="machos" min="0" value="0"></label>
    <label>Fêmeas <input type="number" name="femeas" min="0" value="0"></label>
    <label>Data de entrada <input type="date" name="dataEntrada" value="${Util.hoje()}" required></label>
    <label>Finalidade <input type="text" name="finalidade" placeholder="ex: Reprodução"></label>
    <button class="btn" type="submit">Adicionar ave</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} Escolhe uma espécie já existente na lista ou usa "➕ Nova espécie..." para escrever um nome novo. Se a espécie já existir nesse compartimento, a app pergunta se queres somar à entrada existente ou criar um registo separado (útil para um lote com outra idade). A idade é calculada automaticamente a partir da data de entrada. <strong>Machos + Fêmeas nunca pode ultrapassar o Total</strong> — a diferença fica contada como "sexo não identificado".</p>
  `}

  <h2 class="section-title">Editar / mover ave</h2>
  ${aves.length===0 ? `<p class="empty">Ainda não há nenhuma ave registada.</p>` : `
  <form id="form-editar-ave-central" class="inline" data-aves="${encodeURIComponent(JSON.stringify(aves))}">
    <label>Ave
      <select name="aveId">
        ${aves.map(a=>{
          const c = compartimentos.find(x=>x.id===a.compartimentoId);
          return `<option value="${a.id}">${Util.escapeHTML(a.especie)} — ${c?Util.escapeHTML(c.nome):'sem compartimento'}</option>`;
        }).join('')}
      </select>
    </label>
    <label>Compartimento
      <select name="compartimentoId">${opcoesCompartimento}</select>
    </label>
    <label>Espécie/Grupo <input type="text" name="especie" required></label>
    <label>Qtd <input type="number" name="qtd" min="0" required></label>
    <label>Machos <input type="number" name="machos" min="0"></label>
    <label>Fêmeas <input type="number" name="femeas" min="0"></label>
    <label>Data de entrada <input type="date" name="dataEntrada"></label>
    <label>Finalidade <input type="text" name="finalidade"></label>
    <button class="btn outline" type="submit">Guardar alterações</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} Para mover uma ave para outro compartimento, escolhe-a acima e muda o campo "Compartimento" — as aves não ficam presas ao compartimento onde foram registadas.</p>
  `}

  <h2 class="section-title">Lista completa de aves registadas</h2>
  ${aves.length===0 ? `<p class="empty">Ainda não há nenhuma ave registada.</p>` : `
  <div class="filtros-lista inline" id="filtros-aves" data-aves="${encodeURIComponent(JSON.stringify(aves))}">
    <label>${Icon.svg('procurar')} Procurar
      <input type="text" id="filtro-aves-texto" placeholder="ex: Muscovy, Brahma…" autocomplete="off">
    </label>
    <label>Compartimento
      <select id="filtro-aves-compartimento">
        <option value="">Todos</option>
        ${compartimentos.map(c=>`<option value="${c.id}">${Util.escapeHTML(c.nome)}</option>`).join('')}
      </select>
    </label>
    <label>Sexo
      <select id="filtro-aves-sexo">
        <option value="">Todos</option>
        <option value="machos">Tem machos</option>
        <option value="femeas">Tem fêmeas</option>
        <option value="indefinido">Sem sexo definido</option>
      </select>
    </label>
    <label>Finalidade
      <select id="filtro-aves-finalidade">
        <option value="">Todas</option>
        ${[...new Set(aves.map(a=>a.finalidade).filter(Boolean))].sort().map(f=>`<option value="${Util.escapeHTML(f)}">${Util.escapeHTML(f)}</option>`).join('')}
      </select>
    </label>
    <label>Ordenar por
      <select id="ordenar-aves">
        <option value="especie">Espécie (A–Z)</option>
        <option value="idade-desc">Idade (mais velha primeiro)</option>
        <option value="idade-asc">Idade (mais nova primeiro)</option>
        <option value="compartimento">Compartimento</option>
        <option value="qtd-desc">Quantidade (maior primeiro)</option>
        <option value="entrada-desc">Entrada (mais recente)</option>
        <option value="entrada-asc">Entrada (mais antiga)</option>
      </select>
    </label>
  </div>
  <div class="table-scroll"><table class="responsive-stack" id="tabela-todas-aves">
    <tr><th>Espécie/Grupo</th><th>Compartimento</th><th>Qtd</th><th>M</th><th>F</th><th>Idade</th><th>Entrada</th><th></th></tr>
    ${aves.slice().sort((a,b)=>(a.especie||'').localeCompare(b.especie||'')).map(a=>linhaAveTabelaHTML(a, compartimentos)).join('')}
  </table></div>
  <p class="empty" id="filtro-aves-vazio" style="display:none;">Nenhuma ave encontrada com estes critérios.</p>
  <p class="footnote">${Icon.svg('dica')} Usa "${Icon.svg('lapis')} Renomear" para corrigir só o nome (ex: um erro de escrita) sem teres de preencher o resto do formulário. Para alterar outros dados (quantidade, compartimento, etc.), usa o formulário "Editar / mover ave" acima.</p>
  `}

  <h2 class="section-title">Plantel por compartimento</h2>
  ${compartimentos.map(c=>{
    const avesDoComp = aves.filter(a=>a.compartimentoId===c.id);
    return `
    <div class="compartimento">
      <h3>${Util.escapeHTML(c.nome)} — <span style="font-size:.8rem;color:#8a7a58;font-weight:normal;">${Util.escapeHTML(c.desc)}</span> <span class="badge">${avesDoComp.reduce((s,a)=>s+Number(a.qtd),0)} aves</span></h3>
      ${avesDoComp.length===0 ? `<p class="empty">Sem aves registadas neste compartimento.</p>` : `
      <div class="table-scroll"><table class="responsive-stack">
        <tr><th>Espécie/Grupo</th><th>Qtd</th><th>M</th><th>F</th><th>Idade</th><th>Entrada</th><th>Finalidade</th><th>Previsão reprodução</th><th></th></tr>
        ${avesDoComp.map(a=>{
          const prev = Calc.previsaoReproducao(a);
          const previsaoTxt = !prev ? '—' : prev.emIdade ? `${Icon.svg('check')} Em idade` : `⏳ ${prev.diasFaltam}d (${prev.dataPrevista})`;
          return `<tr>
        <td data-label="Espécie/Grupo">${Util.escapeHTML(a.especie)}</td>
        <td data-label="Qtd">${a.qtd}</td>
        <td data-label="Machos">${a.machos}</td>
        <td data-label="Fêmeas">${a.femeas}</td>
        <td data-label="Idade">${Calc.idadeExibicao(a)}</td>
        <td data-label="Entrada">${a.dataEntrada||'—'}</td>
        <td data-label="Finalidade">${Util.escapeHTML(a.finalidade)}</td>
        <td data-label="Previsão reprodução">${previsaoTxt}</td>
        <td class="row-actions">
          <button class="btn small outline" data-rename-ave="${a.id}" title="Corrigir nome">${Icon.svg('lapis')}</button>
          <button class="btn small danger" data-del-ave="${a.id}">Apagar</button>
        </td></tr>`;
        }).join('')}
      </table></div>`}
      <p class="row-actions" style="margin-top:8px;"><button class="btn small danger outline" data-del-comp="${c.id}">Apagar compartimento</button></p>
    </div>
  `}).join('')}

  <h2 class="section-title">Registar saída (venda / abate / morte)</h2>
  ${aves.length===0 ? `<p class="empty">Ainda não há nenhuma ave registada.</p>` : `
  <form id="form-saida-central" class="inline">
    <label>Ave
      <select name="aveId" required>
        ${aves.map(a=>{
          const c = compartimentos.find(x=>x.id===a.compartimentoId);
          return `<option value="${a.id}">${Util.escapeHTML(a.especie)} — ${c?Util.escapeHTML(c.nome):'sem compartimento'} (disp: ${a.qtd} — M:${a.machos||0} F:${a.femeas||0})</option>`;
        }).join('')}
      </select>
    </label>
    <label>Motivo
      <select name="motivo">
        <option value="venda">Venda</option>
        <option value="abate">Abate p/ consumo próprio</option>
        <option value="morte">Morte</option>
        <option value="outro">Outro</option>
      </select>
    </label>
    <label>Qtd total retirada <input type="number" name="qtd" min="1" value="1" required></label>
    <label>Machos retirados <input type="number" name="machosRetirados" min="0" value="0"></label>
    <label>Fêmeas retiradas <input type="number" name="femeasRetiradas" min="0" value="0"></label>
    <label>Valor recebido (MT) <input type="number" name="valor" min="0" step="1" placeholder="só se for venda"></label>
    <label>Data <input type="date" name="data" value="${Util.hoje()}" required></label>
    <button class="btn danger" type="submit">Registar saída</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} Serve para venda, abate para consumo próprio ou morte — de qualquer espécie e compartimento, escolhida na lista acima. Se não souberes o sexo das aves retiradas, deixa "Machos retirados" e "Fêmeas retiradas" em 0 — só o Total desce, os contadores de Machos/Fêmeas mantêm-se como estão.</p>
  `}

  <h2 class="section-title">Histórico de saídas (vendas, abates, mortes)</h2>
  ${saidasAves.length===0 ? `<p class="empty">Ainda sem saídas registadas.</p>` : `
  <div class="table-scroll"><table class="responsive-stack">
    <tr><th>Data</th><th>Compartimento</th><th>Espécie/Grupo</th><th>Qtd</th><th>M</th><th>F</th><th>Motivo</th><th>Valor</th><th></th></tr>
    ${saidasAves.slice().reverse().map(s=>{
      const comp = compartimentos.find(c=>c.id===s.compartimentoId);
      return `<tr>
      <td data-label="Data">${s.data}</td>
      <td data-label="Compartimento">${comp?Util.escapeHTML(comp.nome):'—'}</td>
      <td data-label="Espécie/Grupo">${Util.escapeHTML(s.especie)}</td>
      <td data-label="Qtd">${s.qtd}</td>
      <td data-label="Machos">${s.machos||0}</td>
      <td data-label="Fêmeas">${s.femeas||0}</td>
      <td data-label="Motivo">${Calc.motivoLabel(s.motivo)}</td>
      <td data-label="Valor" class="num-font">${s.valor?Util.moeda(s.valor):'—'}</td>
      <td class="row-actions"><button class="btn small danger outline" data-del-saida="${s.id}">Apagar</button></td></tr>`;
    }).join('')}
  </table></div>`}
  <p class="footnote">${Icon.svg('dica')} Ao registares uma <strong>venda</strong> com valor recebido, a receita é lançada automaticamente em Finanças. Um <strong>abate para consumo próprio</strong> ou uma <strong>morte</strong> reduzem o plantel mas não geram receita — ficam no histórico e nos totais do Início para controlo. Apagar um registo do histórico não devolve a ave ao plantel.</p>
  `;
}

function attachHandlersGestao(){
  const fcomp = document.getElementById('form-compartimento');
  if(fcomp) fcomp.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fcomp);
    await DB.add('compartimentos', {nome:fd.get('nome'), desc:fd.get('desc')||''});
    await afterMutacao('Compartimento adicionado');
  });

  /* ---- Adicionar ave (formulário único, com escolha de compartimento) ---- */
  const fAveCentral = document.getElementById('form-ave-central');
  if(fAveCentral){
    const selEspecie = document.getElementById('especie-select');
    const novaWrap = document.getElementById('especie-nova-wrap');
    const novaInput = document.getElementById('especie-nova');
    const sincronizarEspecieUI = ()=>{
      const ehNova = !selEspecie || selEspecie.value==='__nova__';
      if(novaWrap) novaWrap.style.display = ehNova ? 'flex' : 'none';
      if(novaInput) novaInput.required = ehNova;
    };
    if(selEspecie) selEspecie.addEventListener('change', sincronizarEspecieUI);
    sincronizarEspecieUI();

    fAveCentral.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(fAveCentral);
      const ehNova = !selEspecie || selEspecie.value==='__nova__';
      const especie = (ehNova ? (novaInput?novaInput.value:'') : selEspecie.value).trim();
      if(!especie){ Util.toast('⚠️ Indica o nome da espécie/grupo'); return; }
      const compartimentoId = Number(fd.get('compartimentoId'));
      if(!compartimentoId){ Util.toast('⚠️ Escolhe um compartimento'); return; }
      const qtd = Number(fd.get('qtd'));
      const machos = Number(fd.get('machos'))||0;
      const femeas = Number(fd.get('femeas'))||0;
      const check = Validacao.sexagemAve(qtd, machos, femeas);
      if(!check.valido){ Util.toast(`⚠️ ${check.motivo}`); return; }

      /* Já existe esta espécie NESTE compartimento? Em vez de criar
         sempre um registo novo e separado (o que antes fazia parecer
         que a ave "desapareceu" das que já existiam), pergunta-se se é
         para SOMAR à entrada já existente, ou criar mesmo um registo
         novo — útil quando é um lote diferente, com outra idade/data
         de entrada, que não faz sentido misturar com o já existente. */
      const avesAtual = await DB.getAll('aves');
      const existente = avesAtual.find(a=>
        a.compartimentoId===compartimentoId &&
        (a.especie||'').trim().toLowerCase()===especie.toLowerCase()
      );
      if(existente){
        const somar = confirm(
          `Já existe "${especie}" neste compartimento (Qtd:${existente.qtd}, M:${existente.machos||0} F:${existente.femeas||0}).\n\n`+
          `OK → Somar a esta entrada (fica Qtd:${Number(existente.qtd)+qtd}, M:${Number(existente.machos||0)+machos} F:${Number(existente.femeas||0)+femeas}).\n`+
          `Cancelar → Criar um registo novo e separado (ex: outro lote, com idade/data de entrada diferente).`
        );
        if(somar){
          const novaQtd = Number(existente.qtd)+qtd;
          const novosMachos = Number(existente.machos||0)+machos;
          const novasFemeas = Number(existente.femeas||0)+femeas;
          const check2 = Validacao.sexagemAve(novaQtd, novosMachos, novasFemeas);
          if(!check2.valido){ Util.toast(`⚠️ ${check2.motivo}`); return; }
          await DB.put('aves', {...existente, qtd:novaQtd, machos:novosMachos, femeas:novasFemeas});
          await afterMutacao(`Somado à entrada já existente de "${especie}"`);
          return;
        }
        // Cancelou o "somar" → continua abaixo e cria um registo novo e separado.
      }

      await DB.add('aves', {
        compartimentoId, especie, qtd, machos, femeas,
        dataEntrada:fd.get('dataEntrada')||Util.hoje(), finalidade:fd.get('finalidade')||'—'
      });
      await afterMutacao(existente ? `Registo novo e separado de "${especie}" criado` : 'Ave registada — idade vai actualizar-se sozinha');
    });
  }

  /* ---- Editar / mover ave (formulário único, com todas as aves) ---- */
  const fEditarCentral = document.getElementById('form-editar-ave-central');
  if(fEditarCentral){
    const aves = JSON.parse(decodeURIComponent(fEditarCentral.dataset.aves));
    const selAve = fEditarCentral.querySelector('[name=aveId]');
    const preencher = (aveId)=>{
      const a = aves.find(x=>x.id===Number(aveId));
      if(!a) return;
      fEditarCentral.querySelector('[name=compartimentoId]').value = a.compartimentoId;
      fEditarCentral.querySelector('[name=especie]').value = a.especie;
      fEditarCentral.querySelector('[name=qtd]').value = a.qtd;
      fEditarCentral.querySelector('[name=machos]').value = a.machos||0;
      fEditarCentral.querySelector('[name=femeas]').value = a.femeas||0;
      fEditarCentral.querySelector('[name=dataEntrada]').value = a.dataEntrada||'';
      fEditarCentral.querySelector('[name=finalidade]').value = a.finalidade||'';
    };
    if(selAve){
      preencher(selAve.value);
      selAve.addEventListener('change', ()=>preencher(selAve.value));
    }
    fEditarCentral.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(fEditarCentral);
      const aveId = Number(fd.get('aveId'));
      const qtd = Number(fd.get('qtd'));
      const machos = Number(fd.get('machos'))||0;
      const femeas = Number(fd.get('femeas'))||0;
      const check = Validacao.sexagemAve(qtd, machos, femeas);
      if(!check.valido){ Util.toast(`⚠️ ${check.motivo}`); return; }
      const compartimentoId = Number(fd.get('compartimentoId'));
      const aveOriginal = await DB.get('aves', aveId);
      if(!aveOriginal){ Util.toast('⚠️ Ave não encontrada'); return; }
      const mudouCompartimento = Number(aveOriginal.compartimentoId)!==compartimentoId;
      await DB.put('aves', {
        ...aveOriginal,
        compartimentoId, especie: fd.get('especie'), qtd, machos, femeas,
        dataEntrada: fd.get('dataEntrada')||null,
        finalidade: fd.get('finalidade')||'—'
      });
      await afterMutacao(mudouCompartimento ? '↔️ Ave actualizada e movida de compartimento' : 'Ave actualizada');
    });
  }

  document.querySelectorAll('[data-del-ave]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('Apagar este registo de ave? Usa "Registar saída" em vez disto se for uma venda, abate ou morte — assim fica no histórico.')) return;
    await DB.del('aves', Number(b.dataset.delAve));
    await afterMutacao('Registo apagado');
  }));

  /* ---- Renomear ave (correção rápida do nome, sem tocar no resto) ----
     Pensado para corrigir um erro de escrita (ex: "Muscovy" escrito
     errado) sem obrigar a preencher todo o formulário "Editar / mover
     ave" — só pede o nome novo e grava, mantendo tudo o resto igual.
     Usa DELEGAÇÃO DE EVENTOS (o listener fica no <table>, não em cada
     botão) — importante porque a tabela "Lista completa de aves" é
     reconstruída via JS sempre que um filtro/ordenação muda (ver
     aplicarFiltrosAves() abaixo); um listener preso directamente a um
     botão desapareceria assim que esse botão fosse substituído. */
  async function corrigirNomeAve(id){
    const ave = await DB.get('aves', id);
    if(!ave){ Util.toast('⚠️ Ave não encontrada — pode ter sido apagada entretanto.'); return; }
    const novoNome = prompt('Corrigir nome da espécie/grupo:', ave.especie);
    if(novoNome===null) return; // cancelou
    const nomeLimpo = novoNome.trim();
    if(!nomeLimpo){ Util.toast('⚠️ O nome não pode ficar vazio'); return; }
    if(nomeLimpo===ave.especie) return; // sem alteração
    await DB.put('aves', {...ave, especie:nomeLimpo});
    await afterMutacao(`Nome corrigido: "${ave.especie}" → "${nomeLimpo}"`);
  }
  document.querySelectorAll('[data-rename-ave]').forEach(b=>{
    // Botões fora da tabela filtrável (ex: se existirem noutro sítio no
    // futuro) continuam a funcionar da forma simples habitual.
    if(b.closest('#tabela-todas-aves')) return; // esses ficam a cargo da delegação abaixo
    b.addEventListener('click', ()=>corrigirNomeAve(Number(b.dataset.renameAve)));
  });
  const tabelaTodasAves = document.getElementById('tabela-todas-aves');
  if(tabelaTodasAves){
    tabelaTodasAves.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-rename-ave]');
      if(btn) corrigirNomeAve(Number(btn.dataset.renameAve));
    });
  }

  /* ---- Filtros + ordenação da lista completa de aves (tudo no
     cliente, sem tocar na base de dados — os dados já vêm embutidos
     no HTML como JSON, ver data-aves no #filtros-aves) ---- */
  const painelFiltros = document.getElementById('filtros-aves');
  if(painelFiltros){
    const todasAves = JSON.parse(decodeURIComponent(painelFiltros.dataset.aves));
    const inputTexto = document.getElementById('filtro-aves-texto');
    const selCompartimento = document.getElementById('filtro-aves-compartimento');
    const selSexo = document.getElementById('filtro-aves-sexo');
    const selFinalidade = document.getElementById('filtro-aves-finalidade');
    const selOrdenar = document.getElementById('ordenar-aves');
    const tabela = document.getElementById('tabela-todas-aves');
    const vazio = document.getElementById('filtro-aves-vazio');
    const cabecalhoTabela = `<tr><th>Espécie/Grupo</th><th>Compartimento</th><th>Qtd</th><th>M</th><th>F</th><th>Idade</th><th>Entrada</th><th></th></tr>`;

    function aplicarFiltrosAves(){
      const termo = Util.normalizarTexto(inputTexto ? inputTexto.value : '');
      const compId = selCompartimento ? selCompartimento.value : '';
      const sexo = selSexo ? selSexo.value : '';
      const finalidade = selFinalidade ? selFinalidade.value : '';
      const ordem = selOrdenar ? selOrdenar.value : 'especie';

      let lista = todasAves.filter(a=>{
        if(termo){
          const alvo = Util.normalizarTexto(a.especie);
          if(!alvo.includes(termo)) return false;
        }
        if(compId && String(a.compartimentoId)!==compId) return false;
        if(sexo==='machos' && !(Number(a.machos)>0)) return false;
        if(sexo==='femeas' && !(Number(a.femeas)>0)) return false;
        if(sexo==='indefinido' && (Number(a.machos)>0 || Number(a.femeas)>0)) return false;
        if(finalidade && (a.finalidade||'')!==finalidade) return false;
        return true;
      });

      lista = lista.slice().sort((a,b)=>{
        switch(ordem){
          case 'idade-desc': return (a.dataEntrada||'9999-99-99').localeCompare(b.dataEntrada||'9999-99-99'); // entrada mais antiga = ave mais velha
          case 'idade-asc': return (b.dataEntrada||'0000-00-00').localeCompare(a.dataEntrada||'0000-00-00');
          case 'compartimento': {
            const compA = compartimentosAtuais.find(c=>c.id===a.compartimentoId);
            const compB = compartimentosAtuais.find(c=>c.id===b.compartimentoId);
            return (compA?compA.nome:'').localeCompare(compB?compB.nome:'');
          }
          case 'qtd-desc': return Number(b.qtd)-Number(a.qtd);
          case 'entrada-desc': return (b.dataEntrada||'').localeCompare(a.dataEntrada||'');
          case 'entrada-asc': return (a.dataEntrada||'').localeCompare(b.dataEntrada||'');
          default: return (a.especie||'').localeCompare(b.especie||'');
        }
      });

      tabela.innerHTML = cabecalhoTabela + lista.map(a=>linhaAveTabelaHTML(a, compartimentosAtuais)).join('');
      if(vazio) vazio.style.display = lista.length===0 ? '' : 'none';
    }

    // Precisa dos compartimentos (para mostrar nomes e ordenar por
    // compartimento) — vêm do próprio formulário "Editar/mover ave",
    // que já os lista como opções, evitando ir buscar de novo à BD.
    const compartimentosAtuais = Array.from(document.querySelectorAll('#form-ave-central select[name=compartimentoId] option'))
      .map(opt=>({id:Number(opt.value), nome:opt.textContent}));

    [inputTexto, selCompartimento, selSexo, selFinalidade, selOrdenar].forEach(el=>{
      if(el) el.addEventListener(el.tagName==='SELECT' ? 'change' : 'input', aplicarFiltrosAves);
    });
  }
  const fSaidaCentral = document.getElementById('form-saida-central');
  if(fSaidaCentral) fSaidaCentral.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fSaidaCentral);
    const aveId = Number(fd.get('aveId'));
    const motivo = fd.get('motivo');
    const qtdSaida = Number(fd.get('qtd'));
    const machosRet = Number(fd.get('machosRetirados'))||0;
    const femeasRet = Number(fd.get('femeasRetiradas'))||0;
    const valor = Number(fd.get('valor'))||0;
    const data = fd.get('data');

    /* REGISTAR SAÍDA (venda/abate/morte) — tudo numa única transação
       IndexedDB: actualizar plantel (total E machos/fêmeas) → criar
       saída → criar receita (se for venda) → confirmar. Machos e
       fêmeas retirados são sempre validados contra o que a ave tem
       disponível, e nunca podem ultrapassar a quantidade total
       retirada — evita a inconsistência de Machos+Fêmeas > Total. */
    try{
      await DB.transacao(['aves','saidasAves','transacoes'], async (tx)=>{
        const avesStore = tx.objectStore('aves');
        const ave = await DB.reqToPromise(avesStore.get(aveId));
        if(!ave) throw new DB.ErroBD('Ave não encontrada — pode ter sido apagada entretanto.');
        if(qtdSaida<=0 || qtdSaida>Number(ave.qtd)){
          throw new DB.ErroBD(`Quantidade inválida — só há ${ave.qtd} disponíveis.`);
        }
        if(machosRet<0 || femeasRet<0){
          throw new DB.ErroBD('Machos/Fêmeas retirados não podem ser negativos.');
        }
        if(machosRet+femeasRet>qtdSaida){
          throw new DB.ErroBD(`Machos + Fêmeas retirados (${machosRet+femeasRet}) não pode ultrapassar a Qtd total retirada (${qtdSaida}).`);
        }
        if(machosRet>Number(ave.machos||0)){
          throw new DB.ErroBD(`Só há ${ave.machos||0} macho(s) disponíveis nesta ave/grupo.`);
        }
        if(femeasRet>Number(ave.femeas||0)){
          throw new DB.ErroBD(`Só há ${ave.femeas||0} fêmea(s) disponíveis nesta ave/grupo.`);
        }
        // 1. Atualizar plantel (total + machos + fêmeas, sempre em conjunto)
        const novaQtd = Number(ave.qtd) - qtdSaida;
        const novosMachos = Number(ave.machos||0) - machosRet;
        const novasFemeas = Number(ave.femeas||0) - femeasRet;
        if(novaQtd<=0){
          await DB.reqToPromise(avesStore.delete(ave.id));
        }else{
          await DB.reqToPromise(avesStore.put({...ave, qtd:novaQtd, machos:novosMachos, femeas:novasFemeas}));
        }
        // 2. Criar saída (guarda também quantos eram machos/fêmeas, para o histórico)
        await DB.reqToPromise(tx.objectStore('saidasAves').add({
          compartimentoId: ave.compartimentoId, especie: ave.especie, qtd: qtdSaida,
          machos: machosRet, femeas: femeasRet,
          motivo, valor: motivo==='venda' ? valor : 0, data
        }));
        // 3. Criar receita (só se for venda com valor)
        if(motivo==='venda' && valor>0){
          await DB.reqToPromise(tx.objectStore('transacoes').add({
            tipo:'receita', categoria:'Venda de aves', desc:`Venda de ${qtdSaida} × ${ave.especie}`, valor, data
          }));
        }
        return ave.especie;
      });
    }catch(err){
      // executarTransacaoAtomica já mostrou o toast de erro — só paramos aqui.
      return;
    }
    const msg = motivo==='venda' ? '💰 Venda registada' : motivo==='abate' ? '🔪 Abate registado' : motivo==='morte' ? '☠️ Morte registada' : 'Saída registada';
    await afterMutacao(msg);
  });
  document.querySelectorAll('[data-del-saida]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('Apagar este registo do histórico de saídas? Isto NÃO devolve a ave ao plantel nem apaga a receita já lançada em Finanças.')) return;
    await DB.del('saidasAves', Number(b.dataset.delSaida));
    await afterMutacao('Registo apagado');
  }));
  document.querySelectorAll('[data-del-comp]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('Apagar este compartimento e todas as aves nele registadas?')) return;
    const compId = Number(b.dataset.delComp);
    /* Apagar compartimento + todas as aves nele: também numa única
       transação — evita ficar com aves "órfãs" (sem compartimento) se
       o processo for interrompido a meio. */
    try{
      await DB.transacao(['aves','compartimentos'], async (tx)=>{
        const avesStore = tx.objectStore('aves');
        const avesDoComp = await DB.reqToPromise(avesStore.index('compartimentoId').DB.getAll(compId));
        for(const a of avesDoComp) await DB.reqToPromise(avesStore.delete(a.id));
        await DB.reqToPromise(tx.objectStore('compartimentos').delete(compId));
      });
    }catch(err){
      return;
    }
    await afterMutacao('Compartimento apagado');
  }));
}

UI.initPagina(renderGestao);
