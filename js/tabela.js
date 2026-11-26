/* @revisao 2.15.1 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).tabela = '2.15.1';
/* ============================================================
   Tabela — componente único para as listagens (histórico de movimentos,
   vendas, consumo, saídas, postura…). Substitui as tabelas escritas à
   mão em cada página e dá-lhes, de graça:
     • <thead> a sério + rótulos (data-label) gerados a partir do título
       da coluna (antes escrevia-se cada rótulo duas vezes);
     • pesquisa por texto (sem distinguir maiúsculas nem acentos);
     • filtros por coluna (listas de valores gerados sozinhos);
     • "Mostrar mais" — só as primeiras linhas aparecem e o resto abre
       aos poucos, em vez de uma lista infinita no telemóvel;
     • contagem "12 de 40" (anunciada a leitores de ecrã).

   Tudo acontece no próprio ecrã, sem redesenhar a página: as linhas
   escondidas continuam no DOM, por isso os botões Editar/Apagar de
   qualquer linha continuam ligados. O estado (texto pesquisado, filtros,
   quantas linhas já abriste) sobrevive a um redesenho da página —
   campos com data-persistir são repostos por UI.redesenhar, e o número
   de linhas abertas fica guardado aqui por id.

   Uso:
     ${Tabela.html({
       id: 'hist-vendas',                 // obrigatório e único na página
       linhas: lista,
       colunas: [
         {titulo:'Data',  valor: v => v.data},
         {titulo:'Valor', valor: v => Util.moeda(v.valor), num:true},
         {titulo:'Cliente', valor: v => esc(v.cliente) + '<br>…', html:true, largo:true},
         {titulo:'Tipo',  valor: v => v.tipo, filtro:true}
       ],
       acoes: v => `<button …>Editar</button>`,   // última coluna (opcional)
       vazio: 'Sem registos.',
       limite: 20,                        // linhas visíveis ao início (0 = todas)
       busca: true                        // caixa de pesquisa
     })}

   Colunas: valor() devolve texto (é escapado) ou, com html:true, HTML
   já seguro (tu escapas com Util.escapeHTML). num:true alinha à direita
   no ecrã largo; largo:true ocupa a linha toda no telemóvel; filtro:true
   cria uma lista para filtrar por essa coluna; rotulo:'…' muda o nome
   mostrado no telemóvel (ex.: título "M", rótulo "Machos"); classe pode
   ser texto ou função (linha) → texto.
   ============================================================ */
const Tabela = (function(){

  const _mostrados = new Map();   // id → quantas linhas já foram abertas

  const esc = s => Util.escapeHTML(String(s == null ? '' : s));

  /* Minúsculas, sem acentos — "Ração" e "racao" encontram-se. */
  const norm = s => String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  /* Texto simples de uma célula: sem etiquetas HTML nem entidades. */
  const plano = s => String(s == null ? '' : s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();

  function html(o){
    const linhas = o.linhas || [];
    if(!linhas.length) return `<p class="empty">${esc(o.vazio || 'Sem registos.')}</p>`;
    const colunas = o.colunas || [];
    const limite = Number(o.limite) > 0 ? Number(o.limite) : 0;
    const passo = limite || 0;
    const mostrados = limite ? Math.max(limite, _mostrados.get(o.id) || 0) : Infinity;
    const colsFiltro = colunas.map((c,i)=>c.filtro ? i : -1).filter(i=>i>=0);

    /* Células de cada linha, calculadas uma só vez (servem a tabela, a
       pesquisa e os filtros). `h` é o HTML da célula, `t` o texto simples. */
    const celulas = linhas.map(l=>{
      const ctx = o.contexto ? o.contexto(l) : undefined;
      return colunas.map(c=>{
        const v = c.valor(l, ctx);
        return c.html ? {h: String(v == null ? '' : v), t: plano(v)} : {h: esc(v), t: String(v == null ? '' : v).trim()};
      });
    });

    const opcoes = {};
    colsFiltro.forEach(i=>{
      const vistos = new Set();
      celulas.forEach(r=>{ if(r[i].t) vistos.add(r[i].t); });
      opcoes[i] = Array.from(vistos).sort((a,b)=>a.localeCompare(b, 'pt'));
    });

    const comBarra = !!o.busca || colsFiltro.length > 0;
    const barra = !comBarra ? '' : `
      <div class="tabela-barra">
        ${o.busca ? `<label class="tabela-busca">Pesquisar
          <input type="search" id="tb-${esc(o.id)}-busca" data-tabela-busca data-persistir autocomplete="off" placeholder="${esc(o.buscaPlaceholder || 'Escreve para filtrar…')}">
        </label>` : ''}
        ${colsFiltro.map(i=>`<label>${esc(colunas[i].titulo)}
          <select id="tb-${esc(o.id)}-f${i}" data-tabela-filtro="${i}" data-persistir>
            <option value="">Todos</option>
            ${opcoes[i].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}
          </select></label>`).join('')}
      </div>`;

    const cabecalho = colunas.map(c=>`<th scope="col"${c.num ? ' class="col-num"' : ''}>${esc(c.titulo)}</th>`).join('')
      + (o.acoes ? '<th scope="col"><span class="sr-only">Acções</span></th>' : '');

    const corpo = linhas.map((l,r)=>{
      const tds = colunas.map((c,i)=>{
        const extraC = typeof c.classe === 'function' ? c.classe(linhas[r], celulas[r][i].t) : (c.classe || '');
        const classes = [c.num ? 'col-num num-font' : '', c.largo ? 'col-largo' : '', extraC].filter(Boolean).join(' ');
        return `<td data-label="${esc(c.rotulo || c.titulo)}"${classes ? ` class="${classes}"` : ''}>${celulas[r][i].h}</td>`;
      }).join('');
      const acoes = o.acoes ? `<td class="row-actions">${o.acoes(l)}</td>` : '';
      const extra = o.classeLinha ? o.classeLinha(l) : '';
      const buscaTxt = norm(celulas[r].map(x=>x.t).join(' '));
      const attrsFiltro = colsFiltro.map(i=>` data-f${i}="${esc(celulas[r][i].t)}"`).join('');
      return `<tr${extra ? ` class="${extra}"` : ''} data-busca="${esc(buscaTxt)}"${attrsFiltro}${r >= mostrados ? ' hidden' : ''}>${tds}${acoes}</tr>`;
    }).join('');

    const total = linhas.length;
    const visiveis = Math.min(total, mostrados);
    const rodape = (limite || comBarra) ? `
      <div class="tabela-rodape">
        <span class="tabela-contagem" role="status" aria-live="polite">${contagem(visiveis, total, total)}</span>
        <button type="button" class="btn small outline" data-tabela-mais${total > visiveis ? '' : ' hidden'}>Mostrar mais</button>
      </div>
      <p class="empty" data-tabela-vazio hidden>Nenhum registo encontrado com estes critérios.</p>` : '';

    return `<div class="tabela-lista" data-tabela="${esc(o.id)}" data-limite="${limite}" data-passo="${passo}" data-mostrados="${limite ? mostrados : 0}">
      ${barra}
      <div class="table-scroll"><table class="responsive-stack">
        <thead><tr>${cabecalho}</tr></thead>
        <tbody>${corpo}</tbody>
      </table></div>
      ${rodape}
    </div>`;
  }

  function contagem(visiveis, correspondem, total){
    return correspondem === total
      ? `A mostrar ${visiveis} de ${total}`
      : `A mostrar ${visiveis} de ${correspondem} (filtrado de ${total})`;
  }

  /* Recalcula o que está visível: pesquisa + filtros + "mostrar mais". */
  function aplicar(wrap){
    const campoBusca = wrap.querySelector('[data-tabela-busca]');
    const q = norm(campoBusca ? campoBusca.value : '');
    const filtros = Array.from(wrap.querySelectorAll('[data-tabela-filtro]'))
      .map(s=>[s.dataset.tabelaFiltro, s.value]).filter(([,v])=>v !== '');
    const limite = Number(wrap.dataset.limite) || 0;
    const mostrados = limite ? Number(wrap.dataset.mostrados) || limite : Infinity;
    const linhas = wrap.querySelectorAll('tbody tr');
    let correspondem = 0;
    linhas.forEach(tr=>{
      const ok = (!q || (tr.dataset.busca || '').includes(q))
        && filtros.every(([c,v]) => tr.getAttribute('data-f'+c) === v);
      if(ok){ correspondem++; tr.hidden = correspondem > mostrados; }
      else tr.hidden = true;
    });
    const visiveis = Math.min(correspondem, mostrados);
    const cont = wrap.querySelector('.tabela-contagem');
    if(cont) cont.textContent = contagem(visiveis, correspondem, linhas.length);
    const mais = wrap.querySelector('[data-tabela-mais]');
    if(mais) mais.hidden = !(correspondem > visiveis);
    const vazio = wrap.querySelector('[data-tabela-vazio]');
    if(vazio) vazio.hidden = correspondem > 0;
  }

  /* Um só conjunto de ouvintes para todas as tabelas da página. */
  document.addEventListener('input', e=>{
    const wrap = e.target.closest && e.target.closest('[data-tabela]');
    if(wrap && e.target.matches('[data-tabela-busca]')) aplicar(wrap);
  });
  document.addEventListener('change', e=>{
    const wrap = e.target.closest && e.target.closest('[data-tabela]');
    if(wrap && e.target.matches('[data-tabela-filtro]')) aplicar(wrap);
  });
  document.addEventListener('click', e=>{
    const btn = e.target.closest && e.target.closest('[data-tabela-mais]');
    if(!btn) return;
    const wrap = btn.closest('[data-tabela]');
    if(!wrap) return;
    const passo = Number(wrap.dataset.passo) || 20;
    const novo = (Number(wrap.dataset.mostrados) || passo) + passo;
    wrap.dataset.mostrados = String(novo);
    _mostrados.set(wrap.dataset.tabela, novo);
    aplicar(wrap);
  });

  return { html, esc };
})();
