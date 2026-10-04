/* ============================================================
   Icon — ícones SVG inline, no estilo "linha fina consistente" (traço
   uniforme, 2px, pontas arredondadas) usado por bibliotecas como
   Lucide/Phosphor/Material Symbols. Em vez de depender de uma dessas
   bibliotecas via CDN (o que exigiria ligação à internet — quebrando
   o uso 100% offline da app), o SVG de cada ícone vive aqui dentro,
   embutido directamente no HTML gerado.

   Vantagem sobre emojis: um emoji renderiza de forma diferente consoante
   o sistema (Android, iPhone, Windows, cada navegador tem o seu
   conjunto), o que torna o visual inconsistente entre aparelhos. Um SVG
   destes desenha-se sempre exactamente igual, em qualquer ecrã — e herda
   a cor do texto à volta (usa "currentColor"), por isso muda de cor
   sozinho consoante o contexto (ex: fica vermelho dentro de um aviso de
   perigo) sem precisar de nenhuma imagem extra. ============================================================ */
const Icon = (function(){

  /* Caminhos SVG dos ícones usados na app — 24×24, traço uniforme.
     Cada entrada é o conteúdo interior de um <svg>, pronto a inserir. */
  const CAMINHOS = {
    aviso: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    perigo: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    dica: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1v.2h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/>',
    ovo: '<path d="M12 22c4.4 0 7-3.6 7-8 0-6-4-12-7-12S5 8 5 14c0 4.4 2.6 8 7 8Z"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    atualizar: '<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/>',
    lapis: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    lista: '<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/>',
    trigo: '<path d="M12 22V8"/><path d="M8 8c0-2.2 1.8-4 4-4s4 1.8 4 4"/><path d="M9 12c0-1.7 1.3-3 3-3s3 1.3 3 3"/><path d="M6 4c0-1.1.9-2 2-2M18 4c0-1.1-.9-2-2-2"/>',
    mais: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    caveira: '<path d="M12 2C7 2 4 5.5 4 10c0 2.5 1.2 4.3 3 5.6V19a1 1 0 0 0 1 1h1v2h6v-2h1a1 1 0 0 0 1-1v-3.4c1.8-1.3 3-3.1 3-5.6 0-4.5-3-8-8-8Z"/><circle cx="9" cy="10" r="1.2"/><circle cx="15" cy="10" r="1.2"/>',
    casa: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/>',
    procurar: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    menu: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
    subida: '<polyline points="3 17 9 11 13 15 21 6"/><polyline points="15 6 21 6 21 12"/>',
    descida: '<polyline points="3 7 9 13 13 9 21 18"/><polyline points="15 18 21 18 21 12"/>',
    descarregar: '<path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M4 19h16"/>',
    carteira: '<path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M17 12h.01"/><path d="M3 10h14"/>',
    talheres: '<path d="M6 2v7a2 2 0 0 0 2 2v11"/><path d="M14 2v20"/><path d="M18 2c-2 0-3 2-3 5v3c0 1.5 1 2 3 2"/>',
    galinha: '<path d="M9 4c1-1 2.5-1 3.5 0"/><path d="M7 8c-2 0-3 1.5-3 3 0 1.6 1.2 2.8 2.7 3l.3 4c.1 1.2 1 2 2.2 2h5.6c1.2 0 2.1-.8 2.2-2l.3-4c1.5-.2 2.7-1.4 2.7-3 0-1.5-1-3-3-3-.3-2.5-2.5-4.5-5-4.5S7.3 5.5 7 8Z"/><path d="M13 5.5 15 4l-.7 2.2"/>',
    circulo: '<circle cx="12" cy="12" r="9"/>'
  };

  /* Devolve o SVG completo (pronto a inserir em innerHTML). `opts.tamanho`
     controla a largura/altura em pixels (por defeito acompanha o texto à
     volta, "1em"), e `opts.classe` acrescenta uma classe CSS extra. */
  function svg(nome, opts){
    opts = opts || {};
    const interior = CAMINHOS[nome];
    if(!interior){
      console.warn(`Icon.svg: ícone "${nome}" não existe`);
      return '';
    }
    const tamanho = opts.tamanho || '1em';
    const classe = opts.classe ? ` ${opts.classe}` : '';
    return `<svg class="icon${classe}" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${interior}</svg>`;
  }

  return { svg };
})();
