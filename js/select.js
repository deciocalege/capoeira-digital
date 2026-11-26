/* @revisao 2.15.1 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).select = '2.15.1';
/* ============================================================
   SelectUI — listas de escolha (<select>) com o visual da app.

   A lista nativa do telemóvel abre num ecrã do sistema, com outra cor,
   outro tipo de letra e outro estilo: parece não fazer parte da app.
   Este módulo troca-a por um botão + lista própria, que abre logo por
   baixo do campo (ou por cima, se não houver espaço) e usa as cores,
   letras e espaçamentos da app.

   Como funciona (sem mexer nas páginas):
   • Cada <select> continua no sítio, escondido, e é ele que guarda o
     valor — por isso formulários, FormData, "required" e todos os
     ouvintes de "change" das páginas funcionam como antes.
   • Fica por cima um botão que mostra a opção escolhida; ao tocar abre a
     lista. Escolher uma opção muda o <select> e dispara "input" e "change".
   • Um observador trata dos selects que as páginas criam ou refazem mais
     tarde, e acompanha mudanças feitas por código (select.value = …,
     select.innerHTML = …, form.reset()).
   • Teclado: setas, Home/End, Enter/Espaço, Esc e primeira letra.
   • Um select que não deva ser trocado leva o atributo data-nativo.
   ============================================================ */
const SelectUI = (function(){
  'use strict';

  const protoValor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const protoIndice = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  const CHEVRON = '<svg class="select-seta" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  let contador = 0;
  let aberto = null;          // estado do select com a lista aberta
  let agendado = false;

  const texto = o => (o.textContent || '').replace(/\s+/g, ' ').trim();
  const assinatura = sel => Array.from(sel.querySelectorAll('option,optgroup'))
    .map(o => o.tagName[0] + (o.value || '') + '|' + texto(o) + '|' + (o.disabled ? 1 : 0)).join('§');

  function melhorar(sel){
    if(sel.dataset.sc || sel.multiple || sel.size > 1 || sel.hasAttribute('data-nativo')) return;
    if(!sel.parentNode) return;
    sel.dataset.sc = '1';
    const id = 'sc' + (++contador);

    const envolucro = document.createElement('span');
    envolucro.className = 'select-custom';
    sel.parentNode.insertBefore(envolucro, sel);

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'select-botao';
    botao.setAttribute('aria-haspopup', 'listbox');
    botao.setAttribute('aria-expanded', 'false');
    botao.setAttribute('aria-controls', id + '-lista');
    botao.innerHTML = '<span class="select-valor"></span>' + CHEVRON;
    const rotulo = sel.closest('label');
    const nome = sel.getAttribute('aria-label') ||
      (rotulo ? Array.from(rotulo.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim() : '');
    if(nome) botao.setAttribute('aria-label', nome);

    const lista = document.createElement('ul');
    lista.className = 'select-lista';
    lista.id = id + '-lista';
    lista.setAttribute('role', 'listbox');
    if(nome) lista.setAttribute('aria-label', nome);
    lista.hidden = true;

    envolucro.appendChild(botao);
    envolucro.appendChild(sel);
    sel.classList.add('select-nativo');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    const s = {sel, botao, lista, envolucro, id, itens: [], ativo: -1, assin: '', busca: '', buscaTimer: null};
    sel._sc = s;

    /* Código das páginas que muda o select (select.value = …) também
       actualiza o botão. */
    Object.defineProperty(sel, 'value', {
      configurable: true,
      get(){ return protoValor.get.call(this); },
      set(v){ protoValor.set.call(this, v); sincronizar(s); }
    });
    Object.defineProperty(sel, 'selectedIndex', {
      configurable: true,
      get(){ return protoIndice.get.call(this); },
      set(v){ protoIndice.set.call(this, v); sincronizar(s); }
    });

    sel.addEventListener('change', () => sincronizar(s));
    sel.addEventListener('focus', () => { if(!sel.disabled) botao.focus(); });   // ex.: toque no rótulo
    if(sel.form && !sel.form._scReset){
      sel.form._scReset = true;
      sel.form.addEventListener('reset', () => setTimeout(() => {
        sel.form.querySelectorAll('select[data-sc]').forEach(x => x._sc && sincronizar(x._sc));
      }, 0));
    }

    botao.addEventListener('click', () => { aberto && aberto.sel === sel ? fechar(true) : abrir(s); });
    botao.addEventListener('keydown', e => teclado(e, s));
    lista.addEventListener('click', e => {
      const li = e.target.closest('[data-i]');
      if(li) escolher(s, Number(li.dataset.i));
    });
    lista.addEventListener('mousedown', e => e.preventDefault());   // o botão mantém o foco

    construir(s);
    sincronizar(s);
  }

  /* Desenha as opções da lista a partir do <select>. */
  function construir(s){
    const {sel, lista} = s;
    s.assin = assinatura(sel);
    s.itens = [];
    const partes = [];
    const opcao = o => {
      const i = o.index;
      s.itens[i] = o;
      const vazia = o.value === '';
      return '<li role="option" id="' + s.id + '-o' + i + '" data-i="' + i + '" class="select-opcao' + (vazia ? ' vazia' : '') +
        (o.disabled ? ' desativada" aria-disabled="true' : '') + '">' +
        '<span class="select-opcao-texto">' + Util.escapeHTML(texto(o)) + '</span>' +
        '<span class="select-opcao-marca">' + (typeof Icon !== 'undefined' ? Icon.svg('check') : '✓') + '</span></li>';
    };
    Array.from(sel.children).forEach(f => {
      if(f.tagName === 'OPTGROUP'){
        partes.push('<li role="presentation" class="select-grupo">' + Util.escapeHTML(f.label || '') + '</li>');
        Array.from(f.children).forEach(o => partes.push(opcao(o)));
      } else if(f.tagName === 'OPTION'){
        partes.push(opcao(f));
      }
    });
    lista.innerHTML = partes.join('');
  }

  /* Põe o botão e a lista de acordo com o estado actual do <select>. */
  function sincronizar(s){
    const {sel, botao, lista, envolucro} = s;
    if(assinatura(sel) !== s.assin) construir(s);
    const o = sel.options[protoIndice.get.call(sel)];
    const txt = o ? texto(o) : '';
    const alvo = botao.querySelector('.select-valor');
    if(alvo.textContent !== txt) alvo.textContent = txt;
    botao.classList.toggle('vazio', !o || o.value === '');
    botao.disabled = sel.disabled;
    envolucro.classList.toggle('desativado', sel.disabled);
    const escolhido = protoIndice.get.call(sel);
    lista.querySelectorAll('[data-i]').forEach(li => {
      const on = Number(li.dataset.i) === escolhido;
      li.classList.toggle('selecionada', on);
      li.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function abrir(s){
    if(s.sel.disabled || !s.itens.length) return;
    if(aberto) fechar(false);
    aberto = s;
    document.body.appendChild(s.lista);
    s.lista.hidden = false;
    s.botao.setAttribute('aria-expanded', 'true');
    s.envolucro.classList.add('aberto');
    s.ativo = protoIndice.get.call(s.sel);
    posicionar(s);
    destacar(s, s.ativo, true);
    document.addEventListener('pointerdown', fora, true);
    window.addEventListener('resize', reposicionar);
    window.addEventListener('scroll', reposicionar, true);
  }

  function fechar(devolverFoco){
    const s = aberto;
    if(!s) return;
    aberto = null;
    s.lista.hidden = true;
    s.lista.remove();
    s.botao.setAttribute('aria-expanded', 'false');
    s.botao.removeAttribute('aria-activedescendant');
    s.envolucro.classList.remove('aberto');
    document.removeEventListener('pointerdown', fora, true);
    window.removeEventListener('resize', reposicionar);
    window.removeEventListener('scroll', reposicionar, true);
    if(devolverFoco) s.botao.focus();
  }

  function fora(e){
    if(!aberto) return;
    if(aberto.lista.contains(e.target) || aberto.envolucro.contains(e.target)) return;
    fechar(false);
  }
  function reposicionar(e){
    if(!aberto || (e && e.target === aberto.lista)) return;
    posicionar(aberto);
  }

  /* Por baixo do campo; por cima só se por baixo não couber e por cima houver mais espaço. */
  function posicionar(s){
    const {botao, lista} = s;
    const r = botao.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const barra = document.querySelector('.bottom-nav');
    const alturaBarra = barra && getComputedStyle(barra).display !== 'none' ? barra.offsetHeight : 0;
    const cabecalho = document.querySelector('.app-header');
    const alturaCab = cabecalho ? cabecalho.offsetHeight : 0;
    if(r.bottom < alturaCab || r.top > vh){ fechar(false); return; }   // o campo saiu do ecrã
    lista.style.maxHeight = '';
    const natural = Math.min(lista.scrollHeight, 320);
    const abaixo = vh - alturaBarra - r.bottom - 8;
    const acima = r.top - alturaCab - 8;
    const porCima = natural > abaixo && acima > abaixo;
    const espaco = Math.max(120, Math.min(320, porCima ? acima : abaixo));
    lista.style.left = Math.max(8, r.left) + 'px';
    lista.style.width = Math.min(r.width, window.innerWidth - 16) + 'px';
    lista.style.maxHeight = espaco + 'px';
    if(porCima){
      lista.style.top = 'auto';
      lista.style.bottom = (vh - r.top + 4) + 'px';
      lista.classList.add('por-cima');
    } else {
      lista.style.bottom = 'auto';
      lista.style.top = (r.bottom + 4) + 'px';
      lista.classList.remove('por-cima');
    }
  }

  function destacar(s, i, rolar){
    s.lista.querySelectorAll('.ativa').forEach(x => x.classList.remove('ativa'));
    const li = s.lista.querySelector('[data-i="' + i + '"]');
    if(!li) return;
    s.ativo = i;
    li.classList.add('ativa');
    s.botao.setAttribute('aria-activedescendant', li.id);
    if(rolar){
      const top = li.offsetTop, fundo = top + li.offsetHeight;
      if(top < s.lista.scrollTop) s.lista.scrollTop = top - 4;
      else if(fundo > s.lista.scrollTop + s.lista.clientHeight) s.lista.scrollTop = fundo - s.lista.clientHeight + 4;
    }
  }

  function escolher(s, i){
    const o = s.sel.options[i];
    if(!o || o.disabled) return;
    const mudou = protoIndice.get.call(s.sel) !== i;
    protoIndice.set.call(s.sel, i);
    sincronizar(s);
    fechar(true);
    if(mudou){
      s.sel.dispatchEvent(new Event('input', {bubbles: true}));
      s.sel.dispatchEvent(new Event('change', {bubbles: true}));
    }
  }

  function vizinho(s, de, passo){
    let i = de;
    for(let n = 0; n < s.sel.options.length; n++){
      i += passo;
      if(i < 0 || i >= s.sel.options.length) return de;
      if(!s.sel.options[i].disabled) return i;
    }
    return de;
  }

  function teclado(e, s){
    const abertoAqui = aberto && aberto.sel === s.sel;
    const k = e.key;
    if(!abertoAqui){
      if(k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' '){ e.preventDefault(); abrir(s); }
      return;
    }
    if(k === 'Escape'){ e.preventDefault(); fechar(true); }
    else if(k === 'Tab'){ fechar(false); }
    else if(k === 'ArrowDown'){ e.preventDefault(); destacar(s, vizinho(s, s.ativo, 1), true); }
    else if(k === 'ArrowUp'){ e.preventDefault(); destacar(s, vizinho(s, s.ativo, -1), true); }
    else if(k === 'Home'){ e.preventDefault(); destacar(s, vizinho(s, -1, 1), true); }
    else if(k === 'End'){ e.preventDefault(); destacar(s, vizinho(s, s.sel.options.length, -1), true); }
    else if(k === 'Enter' || k === ' '){ e.preventDefault(); escolher(s, s.ativo); }
    else if(k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey){
      s.busca += k.toLowerCase();
      clearTimeout(s.buscaTimer);
      s.buscaTimer = setTimeout(() => { s.busca = ''; }, 700);
      const opcoes = Array.from(s.sel.options);
      const ordem = opcoes.slice(s.ativo + 1).concat(opcoes.slice(0, s.ativo + 1));
      const achou = ordem.find(o => !o.disabled && texto(o).toLowerCase().startsWith(s.busca));
      if(achou) destacar(s, achou.index, true);
    }
  }

  /* Trata dos selects novos e refeitos (as páginas redesenham-se com innerHTML). */
  function varrer(){
    agendado = false;
    document.querySelectorAll('select').forEach(melhorar);
    document.querySelectorAll('select[data-sc]').forEach(sel => {
      if(!sel._sc) return;
      if(!document.body.contains(sel)){ if(aberto && aberto.sel === sel) fechar(false); return; }
      sincronizar(sel._sc);
    });
  }
  function agendar(){
    if(agendado) return;
    agendado = true;
    requestAnimationFrame(varrer);
  }

  function iniciar(){
    varrer();
    new MutationObserver(agendar).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected']
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  return {melhorar, varrer};
})();
