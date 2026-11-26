/* @revisao 2.18.0 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).gestao = '2.18.0';
/* ============ PÁGINA: GESTÃO (plantel — compartimentos, aves, saídas) ============
   Os formulários de "Adicionar ave" e "Editar/mover ave" são ÚNICOS
   para toda a página (não um por compartimento) — escolhes o
   compartimento dentro do próprio formulário. Isto evita ter um bloco
   de formulário repetido em cada compartimento, e permite mover uma
   ave de um compartimento para outro só mudando esse campo. */

async function renderGestao(){
  const app = document.getElementById('app');
  await UI.redesenhar(app, () => viewGestao(), () => { attachHandlersGestao(); });
}

async function afterMutacao(msg){
  if(msg) Util.toast(msg);
  await renderGestao();
}

/* Antes de gravar o nome de um grupo de aves ("Galinha Cafrial"):
   1) escreve-o sempre da mesma forma (maiúsculas, espaços);
   2) se a raça JÁ existe — ainda que escrita com maiúsculas ou plural
      diferentes ("cafriais" / "Cafrial") — reutiliza-se a que existe, para
      os lotes ficarem juntos na mesma raça (separados só por quantidade e
      idade, como deve ser);
   3) se existe uma PARECIDA (provável erro de escrita, "Cafrail"), pergunta.
   Nunca junta nada sem o utilizador saber. idAIgnorar = o registo que está
   a ser renomeado (para não se comparar consigo próprio). */
async function resolverNomeGrupo(especieDigitada, idAIgnorar){
  const bruto = String(especieDigitada || '').trim();
  if(!bruto) return bruto;
  const tipo = Calc.tipoDaEspecie(bruto);
  const raca = Calc.formatarNomeRaca(Calc.racaDaEspecie(bruto));
  const variante = Calc.separarBaseVariante(tipo, raca).variante;   // ex.: "em postura" — mantém-se sempre
  const prefixo = Calc.prefixoDoNome(bruto);   // "Patas", "Pintos"… tal como escreveste
  const montar = r => tipo==='Outro' ? r : (r ? `${prefixo} ${r}` : prefixo);
  const comVariante = base => base + (variante ? ' ' + variante : '');
  const nome = montar(raca);
  if(!raca) return nome;
  const outras = (await DB.getAll('aves')).filter(a=>!Util.mesmoId(a.id, idAIgnorar));
  const parecida = Calc.racaExistenteParecida(outras, nome);
  if(!parecida) return nome;
  if(parecida.igual) return montar(comVariante(parecida.raca));
  const usar = confirm(
    `"${Calc.separarBaseVariante(tipo, raca).base}" parece ser a raça já registada "${parecida.raca}" (pode ser um erro de escrita).\n\n`+
    `OK → usar "${parecida.raca}" (fica tudo junto na mesma raça).\n`+
    `Cancelar → manter "${raca}" como uma raça nova.`);
  return usar ? montar(comVariante(parecida.raca)) : nome;
}

/* Gera o <tr> de uma linha da "Lista completa de aves" — reaproveitado
   tanto no desenho inicial da página como sempre que os filtros/ordenação
   mudam (ver aplicarFiltrosAves() em attachHandlersGestao). */
function linhaAveTabelaHTML(a, compartimentos){
  const c = compartimentos.find(x=>Util.mesmoId(x.id, a.compartimentoId));
  return `<tr data-nome-filtro="${Util.escapeHTML(Util.normalizarTexto(a.especie))} ${Util.escapeHTML(Util.normalizarTexto(c?c.nome:''))}"
              data-compartimento-id="${a.compartimentoId}"
              data-machos="${a.machos||0}" data-femeas="${a.femeas||0}"
              data-finalidade="${Util.escapeHTML(a.finalidade||'')}">
    <td data-label="Espécie/Grupo">${Util.escapeHTML(a.especie)}</td>
    <td data-label="Compartimento">${c?Util.escapeHTML(c.nome):'sem compartimento'}</td>
    <td data-label="Qtd">${a.qtd}</td>
    <td data-label="Machos" title="${(a.machos||0)+(a.femeas||0)===0 ? 'Sexo por identificar' : ''}">${(a.machos||0)+(a.femeas||0)===0 ? '?' : (a.machos||0)}</td>
    <td data-label="Fêmeas" title="${(a.machos||0)+(a.femeas||0)===0 ? 'Sexo por identificar' : ''}">${(a.machos||0)+(a.femeas||0)===0 ? '?' : (a.femeas||0)}</td>
    <td data-label="Idade">${Calc.idadeExibicao(a)}</td>
    <td data-label="Entrada">${a.dataEntrada||'—'}</td>
    <td class="row-actions"><button class="btn small outline" data-rename-ave="${a.id}" title="Corrigir nome">${Icon.svg('lapis')} Renomear</button></td></tr>`;
}

async function viewGestao(){
  const [compartimentosRaw, aves, saidasAves, feedStockGestao] = await Promise.all([DB.getAll('compartimentos'), DB.getAll('aves'), DB.getAll('saidasAves'), DB.getAll('feedStock')]);
  const produtosRacao = Calc.produtosStock(feedStockGestao, []);
  const compartimentos = Calc.ordenarCompartimentos(compartimentosRaw);
  const especiesExistentes = [...new Set(aves.map(a=>a.especie).filter(Boolean))].sort();
  /* Raças disponíveis por tipo: as sugeridas + as que já existem nos teus lotes */
  const racasPorTipo = {};
  ['Galinha','Pato','Ganso','Outro'].forEach(t=>{
    const vistas = new Set(), lista = [];
    /* A lista mostra a RAÇA (Muscovy, Pequim, Cafrial…), não as descrições dos
       lotes ("em postura", "chocando"), e uma só vez ainda que esteja escrita
       de formas diferentes no plantel. */
    (Calc.RACAS_SUGERIDAS[t]||[]).concat(aves.filter(a=>Calc.tipoDaEspecie(a.especie)===t).map(a=>Calc.separarBaseVariante(t, Calc.racaDaEspecie(a.especie)).base))
      .filter(Boolean).forEach(r=>{ const k = Calc.chaveRaca(r); if(!vistas.has(k)){ vistas.add(k); lista.push(r); } });
    racasPorTipo[t] = lista;
  });
  const organizacao = Calc.resumoPorTipo(aves);
  const duplicados = Calc.duplicadosDeRacas(aves);
  const nomePluralTipo = t => ({Galinha:'Galinhas', Pato:'Patos', Ganso:'Gansos'})[t] || 'Outras aves';
  const nomeCompletoRaca = (tipo, raca) => raca==='(sem raça definida)' ? tipo : (tipo==='Outro' ? raca : `${tipo} ${raca}`);

  const opcoesCompartimento = compartimentos.map(c=>`<option value="${c.id}">${Util.escapeHTML(c.nome)}</option>`).join('');

  return `
  ${organizacao.length===0 ? '' : `
  <h2 class="section-title" id="sec-organizacao">Organização por tipo e raça</h2>
  ${duplicados.map(d=>`<div class="aviso-nomes">
    <p>${Icon.svg('aviso')} <strong>${Util.escapeHTML(nomePluralTipo(d.tipo))}:</strong> ${d.nomes.map(n=>`“${Util.escapeHTML(n.raca)}” (${n.qtd})`).join(' e ')} parecem ser a mesma raça.</p>
    <form class="inline" data-unir-racas data-tipo="${Util.escapeHTML(d.tipo)}" data-nomes="${encodeURIComponent(JSON.stringify(d.nomes.map(n=>n.raca)))}">
      <label>Unir como <select name="nome">${d.nomes.map(n=>`<option value="${Util.escapeHTML(n.raca)}">${Util.escapeHTML(n.raca)}</option>`).join('')}</select></label>
      <button type="submit" class="btn small">Unir</button>
    </form>
  </div>`).join('')}
  <div class="grupos-tipo">
    ${organizacao.map(T=>`<details class="grupo-tipo" id="det-tipo-${Util.escapeHTML(T.tipo)}" open>
      <summary>
        <span class="grupo-tipo-nome">${Util.escapeHTML(nomePluralTipo(T.tipo))}</span>
        <span class="grupo-tipo-total num-font">${T.qtd}</span>
        <span class="footnote">${T.machos+T.femeas>0 ? `${T.machos}M/${T.femeas}F · ` : ''}${T.racas.length} ${T.racas.length===1 ? 'raça' : 'raças'}</span>
      </summary>
      <div class="grupo-racas">
        ${T.racas.map(R=>`<details class="grupo-raca">
          <summary><strong>${Util.escapeHTML(nomeCompletoRaca(T.tipo, R.raca))}</strong> — ${R.qtd}${R.machos+R.femeas>0 ? ` (${R.machos}M/${R.femeas}F)` : ''}${R.lotes>1 ? ` · ${R.lotes} lotes` : ''}</summary>
          <ul class="grupo-lotes">
            ${R.registos.slice().sort((x,y)=>String(y.ave.dataEntrada||'').localeCompare(String(x.ave.dataEntrada||''))).map(({ave:a, variante})=>{
              const c = compartimentos.find(x=>Util.mesmoId(x.id, a.compartimentoId));
              const pref = T.tipo==='Outro' ? '' : Calc.prefixoDoNome(a.especie);
              const etiqueta = [pref && pref.toLowerCase()!==T.tipo.toLowerCase() ? pref : '', variante].filter(Boolean).join(' · ');
              return `<li>${etiqueta ? `<strong>${Util.escapeHTML(etiqueta)}</strong> · ` : ''}${a.qtd} ${Number(a.qtd)===1 ? 'ave' : 'aves'}${(a.machos||0)+(a.femeas||0)>0 ? ` (${a.machos||0}M/${a.femeas||0}F)` : ''} · ${Util.escapeHTML(String(Calc.idadeExibicao(a)))} · ${c ? Util.escapeHTML(c.nome) : 'sem compartimento'}${a.dataEntrada ? ` · entrou em ${Util.dataBR(a.dataEntrada)}` : ''}</li>`;
            }).join('')}
          </ul>
        </details>`).join('')}
      </div>
    </details>`).join('')}
  </div>`}

  <h2 class="section-title" id="sec-plantel-local">Plantel por local</h2>
  ${compartimentos.map(c=>{
    const avesDoComp = aves.filter(a=>Util.mesmoId(a.compartimentoId, c.id));
    return `
    <div class="compartimento">
      <h3>${Util.escapeHTML(c.nome)}${c.tipo && c.tipo!=='Compartimento' ? ` <span class="badge">${Util.escapeHTML(c.tipo)}</span>` : ''} — <span class="nota-pequena">${Util.escapeHTML(c.desc)}</span> <span class="badge">${avesDoComp.reduce((s,a)=>s+Number(a.qtd),0)} aves</span></h3>
      ${avesDoComp.length===0 ? `<p class="empty">Sem aves registadas neste compartimento.</p>` : `
      <div class="table-scroll"><table class="responsive-stack">
        <tr><th>Espécie/Grupo</th><th>Qtd</th><th>M</th><th>F</th><th>Idade</th><th>Entrada</th><th>Finalidade</th><th>Previsão reprodução</th><th></th></tr>
        ${avesDoComp.map(a=>{
          const prev = Calc.previsaoReproducao(a);
          const previsaoTxt = !prev ? '—' : prev.emIdade ? `${Icon.svg('check')} Em idade` : `${prev.diasFaltam}d (${Util.dataBR(prev.dataPrevista)})`;
          return `<tr>
        <td data-label="Espécie/Grupo">${Util.escapeHTML(a.especie)}</td>
        <td data-label="Qtd">${a.qtd}</td>
        <td data-label="Machos">${a.machos||0}</td>
        <td data-label="Fêmeas">${a.femeas||0}</td>
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
      <p class="row-actions mt-2"><button class="btn small danger outline" data-del-comp="${c.id}">Apagar compartimento</button></p>
    </div>
  `}).join('')}

  <h2 class="section-title" id="sec-lista-aves">Lista completa de aves registadas</h2>
  ${aves.length===0 ? `<p class="empty">Ainda não há nenhuma ave registada.</p>` : `
  <div class="filtros-lista inline" id="filtros-aves" data-aves="${encodeURIComponent(JSON.stringify(aves))}">
    <label>${Icon.svg('procurar')} Procurar
      <input type="text" id="filtro-aves-texto" data-persistir placeholder="ex: Muscovy, Brahma…" autocomplete="off">
    </label>
    <label>Local (compartimento/gaiola)
      <select id="filtro-aves-compartimento" data-persistir>
        <option value="">Todos</option>
        ${compartimentos.map(c=>`<option value="${c.id}">${Util.escapeHTML(c.nome)}</option>`).join('')}
      </select>
    </label>
    <label>Sexo
      <select id="filtro-aves-sexo" data-persistir>
        <option value="">Todos</option>
        <option value="machos">Tem machos</option>
        <option value="femeas">Tem fêmeas</option>
        <option value="indefinido">Sem sexo definido</option>
      </select>
    </label>
    <label>Finalidade
      <select id="filtro-aves-finalidade" data-persistir>
        <option value="">Todas</option>
        ${[...new Set(aves.map(a=>a.finalidade).filter(Boolean))].sort().map(f=>`<option value="${Util.escapeHTML(f)}">${Util.escapeHTML(f)}</option>`).join('')}
      </select>
    </label>
    <label>Ordenar por
      <select id="ordenar-aves" data-persistir>
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
  <p class="empty" id="filtro-aves-vazio" hidden>Nenhuma ave encontrada com estes critérios.</p>
  <p class="footnote">${Icon.svg('dica')} Usa "${Icon.svg('lapis')} Renomear" para corrigir só o nome (ex: um erro de escrita) sem teres de preencher o resto do formulário. Para alterar outros dados (quantidade, compartimento, etc.), usa o formulário "Editar / mover ave" acima.</p>
  `}

  <h2 class="section-title" id="sec-add-ave">Adicionar ave</h2>
  ${compartimentos.length===0 ? `<p class="empty">Cria primeiro um compartimento acima — depois podes adicionar aves a ele.</p>` : `
  <form id="form-ave-central" class="inline" data-racas="${encodeURIComponent(JSON.stringify(racasPorTipo))}">
    <label>Local (compartimento/gaiola)
      <select name="compartimentoId" required>${opcoesCompartimento}</select>
    </label>
    <label>Tipo de ave
      <select id="tipo-select"><option>Galinha</option><option>Pato</option><option>Ganso</option><option value="__outro__">Outro tipo…</option></select>
    </label>
    <label id="tipo-outro-wrap" hidden>Nome do tipo <input type="text" id="tipo-outro" placeholder="ex: Peru"></label>
    <label>Raça
      <select id="raca-select"></select>
    </label>
    <label id="raca-nova-wrap" hidden>Nome da raça <input type="text" id="raca-nova" placeholder="ex: Sasso"></label>
    <label>Qtd <input type="number" name="qtd" min="1" value="1" required></label>
    <label>Machos <input type="number" name="machos" min="0" value="0"></label>
    <label>Fêmeas <input type="number" name="femeas" min="0" value="0"></label>
    <label>Data de entrada <input type="date" name="dataEntrada" value="${Util.hoje()}" required></label>
    <label>Finalidade <input type="text" name="finalidade" placeholder="ex: Reprodução"></label>
    <label>Idade ao entrar (dias) <input type="number" name="idadeEntradaDias" min="0" value="0"></label>
    <label class="campo-check"><input type="checkbox" name="consumoAuto" checked> Abater o consumo de ração deste lote automaticamente, todos os dias</label>
    <label>Ração só deste lote (opcional)
      <input type="text" name="racaoProduto" list="lista-racoes-lote" placeholder="vazio = usar o plano da espécie">
    </label>
    <datalist id="lista-racoes-lote">${produtosRacao.map(p=>`<option value="${Util.escapeHTML(p.nome)}">`).join('')}</datalist>
    <label>Consumo diário por ave (g) <input type="number" name="consumoGramas" min="0" step="1" placeholder="só se usares ração própria"></label>
    <button class="btn" type="submit">Adicionar ave</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} O consumo automático usa o <strong>plano alimentar da espécie</strong> (Alimentação → Plano alimentar), com fases por idade (ex.: A1 até aos 29 dias, A2 depois). Se preencheres a ração e as gramas aqui, este lote usa só esses valores. Podes mudar tudo mais tarde em Alimentação → Lotes.</p>
  <p class="footnote">${Icon.svg('dica')} Escolhe uma espécie já existente na lista ou usa "➕ Nova espécie..." para escrever um nome novo. Se a espécie já existir nesse compartimento, a app pergunta se queres somar à entrada existente ou criar um registo separado (útil para um lote com outra idade). A idade é calculada automaticamente a partir da data de entrada. <strong>Machos + Fêmeas nunca pode ultrapassar o Total</strong> — a diferença fica contada como "sexo não identificado".</p>
  `}

  <h2 class="section-title" id="sec-editar-ave">Editar / mover ave</h2>
  ${aves.length===0 ? `<p class="empty">Ainda não há nenhuma ave registada.</p>` : `
  <form id="form-editar-ave-central" class="inline" data-aves="${encodeURIComponent(JSON.stringify(aves))}">
    <label>Ave
      <select name="aveId">
        ${aves.map(a=>{
          const c = compartimentos.find(x=>Util.mesmoId(x.id, a.compartimentoId));
          return `<option value="${a.id}">${Util.escapeHTML(a.especie)} — ${c?Util.escapeHTML(c.nome):'sem compartimento'}</option>`;
        }).join('')}
      </select>
    </label>
    <label>Local (compartimento/gaiola)
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

  <h2 class="section-title" id="sec-add-local">Adicionar local (compartimento, gaiola…)</h2>
  <form id="form-compartimento" class="inline">
    <label>Tipo de local
      <select name="tipo"><option>Compartimento</option><option>Gaiola</option><option>Galpão</option><option>Parque</option><option>Outro</option></select>
    </label>
    <label>Nome <input type="text" name="nome" placeholder="ex: Gaiola" required></label>
    <label>Descrição <input type="text" name="desc" placeholder="ex: Poedeiras"></label>
    <label>Quantos criar <input type="number" name="quantos" min="1" max="60" value="1"></label>
    <button class="btn" type="submit">Adicionar</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} O local pode ser um compartimento, uma gaiola, um galpão ou um parque — tu escolhes e podes criar quantos precisares. Para <strong>vários de uma vez</strong> (ex.: 10 gaiolas), escreve o nome "Gaiola" e "Quantos criar" = 10: ficam "Gaiola 1" a "Gaiola 10". Para mudar aves de local usa <em>Editar / mover ave</em>.</p>

  <h2 class="section-title" id="sec-saida">Registar saída (venda / abate / morte)</h2>
  ${aves.length===0 ? `<p class="empty">Ainda não há nenhuma ave registada.</p>` : `
  <form id="form-saida-central" class="inline">
    <label>Ave
      <select name="aveId" required>
        ${aves.map(a=>{
          const c = compartimentos.find(x=>Util.mesmoId(x.id, a.compartimentoId));
          return `<option value="${a.id}">${Util.escapeHTML(a.especie)} — ${c?Util.escapeHTML(c.nome):'sem compartimento'} (disp: ${a.qtd} — M:${a.machos||0} F:${a.femeas||0})</option>`;
        }).join('')}
      </select>
    </label>
    <label>Motivo
      <select name="motivo">
        ${UI.podeFinancas() ? '<option value="venda">Venda</option>' : ''}
        <option value="abate">Abate p/ consumo próprio</option>
        <option value="morte">Morte</option>
        <option value="outro">Outro</option>
      </select>
    </label>
    <label>Qtd total retirada <input type="number" name="qtd" min="1" value="1" required></label>
    <label>Machos retirados <input type="number" name="machosRetirados" min="0" value="0"></label>
    <label>Fêmeas retiradas <input type="number" name="femeasRetiradas" min="0" value="0"></label>
    ${UI.podeFinancas() ? `<label>Valor recebido (MT) <input type="number" name="valor" min="0" step="1" placeholder="só se for venda"></label>` : ''}
    <label>Data <input type="date" name="data" value="${Util.hoje()}" required></label>
    <button class="btn danger" type="submit">Registar saída</button>
  </form>
  <p class="footnote">${Icon.svg('dica')} Serve para venda, abate para consumo próprio ou morte — de qualquer espécie e compartimento, escolhida na lista acima. Se não souberes o sexo das aves retiradas, deixa "Machos retirados" e "Fêmeas retiradas" em 0 — só o Total desce, os contadores de Machos/Fêmeas mantêm-se como estão.</p>
  `}

  <h2 class="section-title" id="sec-hist-saidas">Histórico de saídas (vendas, abates, mortes)</h2>
  ${saidasAves.length===0 ? `<p class="empty">Ainda sem saídas registadas.</p>` : `
  ${Tabela.html({
    id:'gestao-saidas', limite:20, busca:true, buscaPlaceholder:'Pesquisar espécie, local…',
    linhas: saidasAves.slice().reverse(),
    contexto: s => ({comp: compartimentos.find(c=>Util.mesmoId(c.id, s.compartimentoId))}),
    colunas:[
      {titulo:'Data', valor:s=>Util.dataBR(s.data)},
      {titulo:'Compartimento', valor:(s,c)=>c.comp ? c.comp.nome : '—', largo:true},
      {titulo:'Espécie/Grupo', valor:s=>s.especie, largo:true},
      {titulo:'Qtd', valor:s=>s.qtd},
      {titulo:'M', rotulo:'Machos', valor:s=>s.machos||0},
      {titulo:'F', rotulo:'Fêmeas', valor:s=>s.femeas||0},
      {titulo:'Motivo', valor:s=>Calc.motivoLabel(s.motivo), html:true, filtro:true},
      {titulo:'Valor', valor:s=>s.valor ? Util.moeda(s.valor) : '—', num:true}
    ],
    acoes: s => `<button class="btn small danger outline" data-del-saida="${s.id}">Apagar</button>`
  })}`}
  <p class="footnote">${Icon.svg('dica')} Ao registares uma <strong>venda</strong> com valor recebido, a receita é lançada automaticamente em Finanças. Um <strong>abate para consumo próprio</strong> ou uma <strong>morte</strong> reduzem o plantel mas não geram receita — ficam no histórico e nos totais do Início para controlo. Apagar um registo do histórico não devolve a ave ao plantel.</p>
  `;
}

function attachHandlersGestao(){
  UI.separadores(document.getElementById('app'), 'gestao', [
    {id:'plantel', titulo:'Plantel', icone:'galinha', secoes:['sec-organizacao','sec-plantel-local','sec-lista-aves']},
    {id:'registar', titulo:'Registar', icone:'mais', secoes:['sec-add-ave','sec-editar-ave','sec-add-local','sec-saida']},
    {id:'historico', titulo:'Histórico', icone:'lista', secoes:['sec-hist-saidas']}
  ]);
  const fcomp = document.getElementById('form-compartimento');
  if(fcomp) fcomp.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fcomp);
    const nomeBase = String(fd.get('nome')||'').trim();
    const tipoLocal = String(fd.get('tipo')||'Compartimento');
    const quantos = Math.max(1, Math.min(60, Math.round(Number(fd.get('quantos'))||1)));
    if(!nomeBase){ Util.toast('⚠️ Indica o nome do local'); return; }
    const existentes = await DB.getAll('compartimentos');
    const usados = new Set(existentes.map(c=>Util.normalizarTexto(c.nome)));
    const nomes = [];
    if(quantos===1) nomes.push(nomeBase);
    else {
      /* continua a numeração a partir do maior número já usado com este nome (Gaiola 1..3 → Gaiola 4…) */
      const re = new RegExp('^'+nomeBase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+(\\d+)$','i');
      let n = existentes.reduce((m,c)=>{ const r = re.exec(String(c.nome||'')); return r ? Math.max(m, Number(r[1])) : m; }, 0);
      for(let i=0;i<quantos;i++) nomes.push(`${nomeBase} ${++n}`);
    }
    const novos = nomes.filter(n=>!usados.has(Util.normalizarTexto(n)));
    if(novos.length===0){ Util.toast('⚠️ Já existe um local com esse nome'); return; }
    for(const nome of novos) await DB.add('compartimentos', {nome, desc:fd.get('desc')||'', tipo:tipoLocal});
    await afterMutacao(novos.length>1 ? `${novos.length} locais adicionados` : `${tipoLocal} adicionado`);
  });

  /* ---- Adicionar ave (formulário único, com escolha de compartimento) ---- */
  const fAveCentral = document.getElementById('form-ave-central');
  if(fAveCentral){
    let racasMapa = {};
    try{ racasMapa = JSON.parse(decodeURIComponent(fAveCentral.dataset.racas||'')) || {}; }catch(e){}
    const selTipo = document.getElementById('tipo-select');
    const tipoOutroWrap = document.getElementById('tipo-outro-wrap');
    const tipoOutro = document.getElementById('tipo-outro');
    const selRaca = document.getElementById('raca-select');
    const racaNovaWrap = document.getElementById('raca-nova-wrap');
    const racaNova = document.getElementById('raca-nova');
    const sincronizarTipoRacaUI = ()=>{
      const outroTipo = selTipo.value==='__outro__';
      const novaRaca = selRaca.value==='__nova__';
      tipoOutroWrap.hidden = !outroTipo;
      tipoOutro.required = outroTipo;
      racaNovaWrap.hidden = !novaRaca;
      racaNova.required = novaRaca;
    };
    const preencherRacas = ()=>{
      const lista = selTipo.value==='__outro__' ? [] : (racasMapa[selTipo.value] || []);
      selRaca.innerHTML = ['<option value="">(sem raça definida)</option>']
        .concat(lista.map(r=>`<option value="${Util.escapeHTML(r)}">${Util.escapeHTML(r)}</option>`))
        .concat(['<option value="__nova__">➕ Outra raça…</option>']).join('');
      sincronizarTipoRacaUI();
    };
    selTipo.addEventListener('change', preencherRacas);
    selRaca.addEventListener('change', sincronizarTipoRacaUI);
    preencherRacas();

    fAveCentral.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(fAveCentral);
      const tipo = (selTipo.value==='__outro__' ? tipoOutro.value : selTipo.value).trim();
      const raca = (selRaca.value==='__nova__' ? racaNova.value : selRaca.value).trim();
      if(!tipo){ Util.toast('⚠️ Indica o tipo de ave'); return; }
      const especie = await resolverNomeGrupo(raca ? `${tipo} ${raca}` : tipo);
      const compartimentoId = Util.chaveId(fd.get('compartimentoId'));   // número (ids antigos) ou UUID
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
      const chaveEsp = Calc.chaveRaca(Calc.racaDaEspecie(especie));
      const existente = avesAtual.find(a=>
        Util.mesmoId(a.compartimentoId, compartimentoId) &&
        Calc.tipoDaEspecie(a.especie)===Calc.tipoDaEspecie(especie) &&
        Calc.chaveRaca(Calc.racaDaEspecie(a.especie))===chaveEsp
      );
      if(existente){
        const somar = confirm(
          `Já existe "${existente.especie}" neste compartimento (Qtd:${existente.qtd}, M:${existente.machos||0} F:${existente.femeas||0}).\n\n`+
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

      const dataEntrada = fd.get('dataEntrada')||Util.hoje();
      const novoLote = {
        compartimentoId, especie, qtd, machos, femeas,
        dataEntrada, finalidade:fd.get('finalidade')||'—'
      };
      const idadeEntradaDias = Math.max(0, Math.round(Number(fd.get('idadeEntradaDias'))||0));
      if(idadeEntradaDias>0) novoLote.idadeEntradaDias = idadeEntradaDias;
      if(fd.get('consumoAuto')) novoLote.autoDesde = dataEntrada;
      const racaoPropria = String(fd.get('racaoProduto')||'').trim();
      const gramasProprias = Number(fd.get('consumoGramas'))||0;
      if(racaoPropria && gramasProprias>0){ novoLote.racaoProduto = racaoPropria; novoLote.consumoGramas = gramasProprias; }
      else if(racaoPropria || gramasProprias>0){ Util.toast('⚠️ Para usar ração própria indica o produto E as gramas por ave — nada foi guardado'); return; }
      await DB.add('aves', novoLote);
      await afterMutacao(existente ? `Registo novo e separado de "${especie}" criado` : 'Ave registada — idade vai actualizar-se sozinha');
    });
  }

  /* ---- Editar / mover ave (formulário único, com todas as aves) ---- */
  const fEditarCentral = document.getElementById('form-editar-ave-central');
  if(fEditarCentral){
    const aves = JSON.parse(decodeURIComponent(fEditarCentral.dataset.aves));
    const selAve = fEditarCentral.querySelector('[name=aveId]');
    const preencher = (aveId)=>{
      const a = aves.find(x=>Util.mesmoId(x.id, aveId));
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
      const aveId = Util.chaveId(fd.get('aveId'));
    if(aveId == null || aveId === '' || (typeof aveId === 'number' && isNaN(aveId))){ Util.toast('⚠️ Escolhe a ave primeiro.'); return; }
      const qtd = Number(fd.get('qtd'));
      const machos = Number(fd.get('machos'))||0;
      const femeas = Number(fd.get('femeas'))||0;
      const check = Validacao.sexagemAve(qtd, machos, femeas);
      if(!check.valido){ Util.toast(`⚠️ ${check.motivo}`); return; }
      const compartimentoId = Util.chaveId(fd.get('compartimentoId'));   // número (ids antigos) ou UUID
      const aveOriginal = await DB.get('aves', aveId);
      if(!aveOriginal){ Util.toast('⚠️ Ave não encontrada'); return; }
      const mudouCompartimento = !Util.mesmoId(aveOriginal.compartimentoId, compartimentoId);
      const especieDigitada = String(fd.get('especie')||'').trim();
      const especieFinal = await resolverNomeGrupo(especieDigitada, aveId);
      if(!especieFinal){ Util.toast('⚠️ O nome não pode ficar vazio'); return; }
      await DB.put('aves', {
        ...aveOriginal,
        compartimentoId, especie: especieFinal, qtd, machos, femeas,
        dataEntrada: fd.get('dataEntrada')||null,
        finalidade: fd.get('finalidade')||'—'
      });
      /* Se a app ajustou o nome (maiúsculas, raça já existente…), diz-o: nunca em silêncio. */
      const avisoNome = especieFinal !== especieDigitada ? ` — nome guardado como "${especieFinal}"` : '';
      await afterMutacao((mudouCompartimento ? '↔️ Ave actualizada e movida de compartimento' : 'Ave actualizada') + avisoNome);
    });
  }

  /* ---- Unir nomes de raça parecidos ----
     Só muda o NOME dos registos (as quantidades, idades e compartimentos
     ficam como estão: cada lote continua separado). */
  document.querySelectorAll('form[data-unir-racas]').forEach(f=>{
    f.addEventListener('submit', async e=>{
      e.preventDefault();
      const tipo = f.dataset.tipo;
      let nomes = [];
      try{ nomes = JSON.parse(decodeURIComponent(f.dataset.nomes||'')) || []; }catch(err){}
      const escolhido = f.elements.nome.value;
      const nomeFinal = tipo==='Outro' ? escolhido : Calc.nomeGrupo(tipo, escolhido);
      const todas = await DB.getAll('aves');
      const baseDe = a=>Calc.separarBaseVariante(tipo, Calc.racaDaEspecie(a.especie)).base;
      const mudar = todas.filter(a=>
        Calc.tipoDaEspecie(a.especie)===tipo && nomes.includes(baseDe(a)) && baseDe(a)!==escolhido);
      if(!mudar.length){ Util.toast('Nada para unir — já estão com o mesmo nome'); return; }
      if(!confirm(`Unir ${nomes.map(n=>`"${n}"`).join(' e ')} em "${nomeFinal}"?\n\n`+
                  `${mudar.length} registo(s) passam a chamar-se "${nomeFinal}". As quantidades, idades e compartimentos não mudam — cada lote continua separado.`)) return;
      for(const a of mudar){
        const {variante} = Calc.separarBaseVariante(tipo, Calc.racaDaEspecie(a.especie));
        const pref = Calc.prefixoDoNome(a.especie);   // cada registo mantém o seu ("Patas" não vira "Pato")
        const base = tipo==='Outro' ? escolhido : `${pref} ${escolhido}`;
        await DB.put('aves', {...a, especie: base + (variante ? ' ' + variante : '')});   // a descrição do lote mantém-se
      }
      await afterMutacao(`Unido em "${nomeFinal}" (${mudar.length} registo(s))`);
    });
  });

  document.querySelectorAll('[data-del-ave]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('Apagar este registo de ave? Usa "Registar saída" em vez disto se for uma venda, abate ou morte — assim fica no histórico.')) return;
    await DB.del('aves', Util.chaveId(b.dataset.delAve));
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
    if(!novoNome.trim()){ Util.toast('⚠️ O nome não pode ficar vazio'); return; }
    const nomeLimpo = await resolverNomeGrupo(novoNome, ave.id);
    if(nomeLimpo===ave.especie) return; // sem alteração
    await DB.put('aves', {...ave, especie:nomeLimpo});
    await afterMutacao(`Nome corrigido: "${ave.especie}" → "${nomeLimpo}"`);
  }
  document.querySelectorAll('[data-rename-ave]').forEach(b=>{
    // Botões fora da tabela filtrável (ex: se existirem noutro sítio no
    // futuro) continuam a funcionar da forma simples habitual.
    if(b.closest('#tabela-todas-aves')) return; // esses ficam a cargo da delegação abaixo
    b.addEventListener('click', ()=>corrigirNomeAve(Util.chaveId(b.dataset.renameAve)));
  });
  const tabelaTodasAves = document.getElementById('tabela-todas-aves');
  if(tabelaTodasAves){
    tabelaTodasAves.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-rename-ave]');
      if(btn) corrigirNomeAve(Util.chaveId(btn.dataset.renameAve));
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
            const compA = compartimentosAtuais.find(c=>Util.mesmoId(c.id, a.compartimentoId));
            const compB = compartimentosAtuais.find(c=>Util.mesmoId(c.id, b.compartimentoId));
            return (compA?compA.nome:'').localeCompare(compB?compB.nome:'');
          }
          case 'qtd-desc': return Number(b.qtd)-Number(a.qtd);
          case 'entrada-desc': return (b.dataEntrada||'').localeCompare(a.dataEntrada||'');
          case 'entrada-asc': return (a.dataEntrada||'').localeCompare(b.dataEntrada||'');
          default: return (a.especie||'').localeCompare(b.especie||'');
        }
      });

      tabela.innerHTML = cabecalhoTabela + lista.map(a=>linhaAveTabelaHTML(a, compartimentosAtuais)).join('');
      if(vazio) vazio.hidden = lista.length!==0;
    }

    // Precisa dos compartimentos (para mostrar nomes e ordenar por
    // compartimento) — vêm do próprio formulário "Editar/mover ave",
    // que já os lista como opções, evitando ir buscar de novo à BD.
    const compartimentosAtuais = Array.from(document.querySelectorAll('#form-ave-central select[name=compartimentoId] option'))
      .map(opt=>({id:Util.chaveId(opt.value), nome:opt.textContent}));

    [inputTexto, selCompartimento, selSexo, selFinalidade, selOrdenar].forEach(el=>{
      if(el) el.addEventListener(el.tagName==='SELECT' ? 'change' : 'input', aplicarFiltrosAves);
    });
  }
  const fSaidaCentral = document.getElementById('form-saida-central');
  if(fSaidaCentral) fSaidaCentral.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(fSaidaCentral);
    const aveId = Util.chaveId(fd.get('aveId'));
    if(aveId == null || aveId === '' || (typeof aveId === 'number' && isNaN(aveId))){ Util.toast('⚠️ Escolhe a ave primeiro.'); return; }
    const motivo = fd.get('motivo');
    if(motivo === 'venda' && !UI.podeFinancas()){ Util.toast('⚠️ Só os administradores registam vendas.'); return; }
    const qtdSaida = Number(fd.get('qtd'));
    const machosRet = Number(fd.get('machosRetirados'))||0;
    const femeasRet = Number(fd.get('femeasRetiradas'))||0;
    const valor = Number(fd.get('valor'))||0;
    const data = fd.get('data');

    /* Período de retirada: avisa (sem bloquear) antes de vender ou abater
       um lote que ainda está dentro do prazo de uma medicação. */
    if(motivo==='venda' || motivo==='abate'){
      const retiradas = Calc.retiradasAtivas(await DB.getAll('saude'), aveId, data);
      if(retiradas.length){
        const lista = retiradas.map(r=>`• ${r.tipo}: ${r.produto} — seguro a partir de ${r.fim} (faltam ${r.diasRestantes} dia(s))`).join('\n');
        if(!confirm(`⚠️ Período de retirada em curso para este lote:\n\n${lista}\n\nVender ou abater agora pode não ser seguro para consumo. Queres continuar mesmo assim?`)) return;
      }
    }

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
    await DB.del('saidasAves', Util.chaveId(b.dataset.delSaida));
    await afterMutacao('Registo apagado');
  }));
  document.querySelectorAll('[data-del-comp]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('Apagar este compartimento e todas as aves nele registadas?')) return;
    const compId = Util.chaveId(b.dataset.delComp);
    /* Apagar compartimento + todas as aves nele: também numa única
       transação — evita ficar com aves "órfãs" (sem compartimento) se
       o processo for interrompido a meio. */
    try{
      await DB.transacao(['aves','compartimentos'], async (tx)=>{
        const avesStore = tx.objectStore('aves');
        const avesDoComp = await DB.reqToPromise(avesStore.index('compartimentoId').getAll(compId));
        for(const a of avesDoComp) await DB.reqToPromise(avesStore.delete(a.id));
        await DB.reqToPromise(tx.objectStore('compartimentos').delete(compId));
      });
    }catch(err){
      UI.avisarErro(err, 'Apagar compartimento');
      return;
    }
    await afterMutacao('Compartimento apagado');
  }));
}

UI.initPagina(renderGestao);
