/* @revisao 2.18.0 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).index = '2.18.0';
/* ============ MENU PRINCIPAL (index.html) ============
   Mostra todas as secções agrupadas, geradas a partir de PAGINAS
   (js/config.js) — por isso uma página nova ou renomeada aparece aqui
   sozinha, sem editar este ficheiro. O resumo de números (plantel,
   choco, finanças) vive na página Início, para não haver dois
   "painéis" a repetir a mesma informação. Como as restantes páginas,
   usa UI.initPagina: cabeçalho, faixa de estatísticas, alerta de choco
   e consumo automático de ração são os mesmos em todo o lado. */

async function renderIndex(){
  const app = document.getElementById('app');
  const esc = Util.escapeHTML;
  const cartao = p => `
    <a class="card card-link" href="${p.ficheiro}">
      <div class="label">${Icon.svg(p.icone)} ${esc(p.rotulo || p.titulo)}</div>
      <div class="value">${esc(p.curto)}</div>
      <div class="sub">${esc(p.descricao)}</div>
    </a>`;
  app.innerHTML = GRUPOS_PAGINAS.map(g=>{
    const itens = UI.paginasVisiveis().filter(p=>p.grupo===g.id);
    if(!itens.length) return '';
    return `<h2 class="section-title">${esc(g.titulo)}</h2><div class="cards">${itens.map(cartao).join('')}</div>`;
  }).join('');
}

UI.initPagina(renderIndex);
