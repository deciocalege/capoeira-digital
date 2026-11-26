/* @revisao 2.15.1 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).calc = '2.15.1';
/* ============================================================
   Util, Validacao e Calc — três namespaces, cada um numa IIFE própria
   (só o nome do namespace fica global; tudo o resto vive fechado lá
   dentro). Antes eram ~30 funções soltas no `window`; agora cada uma
   só é alcançável através do seu namespace (ex: Calc.saldo(...), não
   saldoCalc(...) sozinho) — corresponde a "core/utils" e "core/validation"
   na reorganização pedida, sem precisar de import/export real (que não
   funciona ao abrir o ficheiro directamente no telemóvel, sem servidor).
   ============================================================ */

/* ============ Util — utilitários genéricos, sem lógica de negócio ============ */
const Util = (function(){

  /* dataISO / hoje: FUNÇÃO CENTRAL para converter uma data em texto
     "AAAA-MM-DD", usando sempre a hora LOCAL do aparelho — nunca UTC.
     Isto importa porque Moçambique está em UTC+2: `Date.toISOString()`
     converte para UTC antes de gerar o texto, por isso perto da meia-noite
     local (ex: 00:30 do dia 14) o UTC ainda está no dia anterior (22:30 do
     dia 13) — e `new Date().toISOString().slice(0,10)` devolveria "13",
     quando o utilizador está claramente já no dia "14". Isto afetaria a
     data de entrada de aves, o início da incubação, a idade calculada, o
     registo de vendas/compras e qualquer relatório por data.
     getFullYear()/getMonth()/getDate() são, ao contrário de toISOString(),
     sempre relativos ao fuso horário LOCAL do aparelho — por isso são a
     forma correcta de fazer isto. TODOS os pontos da app que precisam da
     data de hoje, ou de converter uma Date para texto, devem usar SEMPRE
     Util.dataISO/Util.hoje — nunca `.toISOString().slice(0,10)` directamente. */
  function dataISO(d){
    const ano = d.getFullYear();
    const mes = String(d.getMonth()+1).padStart(2,'0');
    const dia = String(d.getDate()).padStart(2,'0');
    return `${ano}-${mes}-${dia}`;
  }
  const hoje = () => dataISO(new Date());
  const moeda = n => (Number(n)||0).toLocaleString('pt-PT',{minimumFractionDigits:0,maximumFractionDigits:0}) + ' MT';

  /* escapeHTML: FUNÇÃO CENTRAL contra XSS. Sempre que um texto vindo do
     utilizador (nome de espécie, de compartimento, descrição de despesa,
     categoria, etc.) é inserido dentro de HTML gerado por template
     string e depois colocado no ecrã com innerHTML, tem de passar
     primeiro por aqui — caso contrário, alguém podia escrever algo como
     <img src=x onerror="..."> num campo de texto e esse código correria
     quando a página fosse desenhada. Troca os caracteres especiais de
     HTML pelas suas entidades, para que sejam sempre mostrados como
     TEXTO simples, nunca interpretados como marcação/código. */
  function escapeHTML(valor){
    return String(valor==null ? '' : valor)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  /* diasEntre robusto: nunca devolve NaN (isto evita o "choco parado"
     quando a data de início vem vazia ou mal formatada). */
  function diasEntre(a,b){
    const da = new Date(a), db_ = new Date(b);
    if(isNaN(da) || isNaN(db_)) return 0;
    return Math.round((db_ - da) / 86400000);
  }

  /* Datas guardadas em ISO (2026-10-22) mostram-se sempre como dd/mm/aaaa. */
  function dataBR(d){
    return d ? String(d).split('-').reverse().join('/') : '';
  }

  /* Os avisos começam muitas vezes por um emoji (⚠️, ✅, 🐣…). Para a app
     ter um só estilo de ícones, o toast troca esse emoji inicial pelo
     ícone SVG equivalente — os textos nos ficheiros não precisam de mudar. */
  const _ICONE_TOAST = {'⚠️':'aviso','⚠':'aviso','✅':'check','✔':'check','🐣':'ovo','🌾':'trigo','📄':'descarregar',
    '💰':'carteira','🔪':'talheres','☠️':'caveira','☠':'caveira','↔️':'atualizar','↔':'atualizar'};
  function toast(msg, ms){
    let t = document.getElementById('toast');
    if(!t){ t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    const texto = String(msg == null ? '' : msg);
    const emoji = Object.keys(_ICONE_TOAST).find(e => texto.startsWith(e));
    if(emoji && typeof Icon !== 'undefined'){
      t.innerHTML = Icon.svg(_ICONE_TOAST[emoji]) + ' ' + escapeHTML(texto.slice(emoji.length).trim());
    } else {
      t.textContent = texto;
    }
    t.classList.add('show');
    toast.ultimo = {t: Date.now(), msg: texto};
    clearTimeout(t._timer);
    t._timer = setTimeout(()=>t.classList.remove('show'), ms || 2400);
  }

  /* normalizarTexto(): remove acentos e baixa para minúsculas, para que
     "Reprodução", "REPRODUÇAO" (sem cedilha por engano) ou "reproducao"
     sejam todos reconhecidos da mesma forma na pesquisa/comparação —
     evita que um pequeno erro de escrita faça uma ave "desaparecer". */
  function normalizarTexto(txt){
    return (txt||'')
      .toString()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .trim();
  }

  /* ============ IDENTIFICADORES (Fase 1 — preparação para UUID) ============
     Até aqui todos os registos tinham ids numéricos (1, 2, 3…). Para dois
     aparelhos poderem criar registos ao mesmo tempo sem colidir, os ids
     passam a ser UUID (texto). Estas funções fazem o resto do código
     funcionar com os DOIS formatos, antes, durante e depois da migração:

     • mesmoId(a, b)  — compara ids ignorando o tipo (7 e "7" são o mesmo;
                        um valor vazio nunca é igual a nada).
     • chaveId(v)     — converte o id que vem de um atributo data-*, de um
                        <select> ou de um campo de formulário (sempre texto)
                        na chave certa para a base de dados: "7" → 7 (id
                        numérico antigo), um UUID fica como texto.
     • novoId()       — gera um UUID novo (v4).
     • compararRegistos(a, b) — ordem estável por criação: primeiro pela data
                        de criação (criadoEm), depois pelo id numérico, e só
                        no fim pelo texto do id. Substitui o antigo
                        "Number(a.id)" que dava 0 para qualquer UUID. */
  function mesmoId(a, b){
    return a != null && b != null && a !== '' && b !== '' && String(a) === String(b);
  }
  function chaveId(v){
    if(v == null || v === '') return v;
    if(typeof v === 'number') return v;
    const s = String(v).trim();
    return /^\d+$/.test(s) ? Number(s) : s;
  }
  function novoId(){
    if(typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const b = new Uint8Array(16);
    if(typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
    else for(let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  function compararRegistos(a, b){
    const ca = String((a && a.criadoEm) || ''), cb = String((b && b.criadoEm) || '');
    if(ca !== cb) return ca < cb ? -1 : 1;
    const na = Number(a && a.id), nb = Number(b && b.id);
    if(!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return String((a && a.id) == null ? '' : a.id).localeCompare(String((b && b.id) == null ? '' : b.id));
  }

  return { dataISO, hoje, dataBR, moeda, escapeHTML, diasEntre, toast, normalizarTexto, mesmoId, chaveId, novoId, compararRegistos };
})();

/* ============ Validacao — regras de consistência dos dados ============ */
const Validacao = (function(){

  /* sexagemAve: garante a consistência Machos + Fêmeas <= Total, e que
     nenhum dos três valores é negativo. Usada em todos os pontos onde
     estes três números são gravados juntos (adicionar ave, editar ave,
     registar saída) — evita a inconsistência de, por exemplo, Total:4
     mas Machos:4 + Fêmeas:1 = 5. */
  function sexagemAve(qtd, machos, femeas){
    qtd = Number(qtd)||0; machos = Number(machos)||0; femeas = Number(femeas)||0;
    if(qtd<0 || machos<0 || femeas<0){
      return {valido:false, motivo:'Nenhum destes valores pode ser negativo.'};
    }
    if(machos+femeas>qtd){
      return {valido:false, motivo:`Machos + Fêmeas (${machos+femeas}) não pode ultrapassar o Total (${qtd}).`};
    }
    return {valido:true};
  }

  /* formulario: valida todos os campos obrigatórios/inválidos de um
     <form>, marca-os visualmente e foca o primeiro em falta. Ligado ao
     evento "submit" em fase de captura (ver mais abaixo), por isso corre
     ANTES do handler específico de cada formulário. */
  function formulario(form){
    let valido = true;
    let primeiroInvalido = null;
    form.querySelectorAll('input, select, textarea').forEach(campo=>{
      campo.classList.remove('campo-invalido');
      if(!campo.checkValidity()){
        campo.classList.add('campo-invalido');
        if(!primeiroInvalido) primeiroInvalido = campo;
        valido = false;
      }
    });
    if(!valido){
      Util.toast('⚠️ Preenche os campos assinalados a vermelho antes de continuar');
      if(primeiroInvalido) primeiroInvalido.focus();
    }
    return valido;
  }

  if(typeof document !== 'undefined'){
    document.addEventListener('submit', (e)=>{
      if(e.target && e.target.tagName==='FORM' && !formulario(e.target)){
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    document.addEventListener('input', (e)=>{
      const c = e.target;
      if(c && c.classList && c.classList.contains('campo-invalido') && c.checkValidity()){
        c.classList.remove('campo-invalido');
      }
    });
  }

  return { sexagemAve, formulario };
})();

/* ============ Calc — cálculos de negócio (funções puras) ============ */
const Calc = (function(){

  /* stockAtual: o stock restante de um ingrediente é o que foi comprado
     menos o que já foi consumido DAQUELA entrada específica. A
     correspondência é feita pelo ID (c.feedStockId === item.id), nunca
     pelo nome — isto evita um bug sério: se apagares "Milho partido" e
     comprares "Milho partido" outra vez mais tarde, o consumo antigo
     (de uma compra já apagada) NÃO deve influenciar o stock da compra
     nova, mesmo tendo o mesmo nome. Mantém-se uma reserva por nome só
     para registos de consumo antigos, gravados antes desta correção,
     que ainda não tinham feedStockId. */
  function stockAtual(item, consumo){
    const usado = consumo
      .filter(c => c.feedStockId!=null ? Util.mesmoId(c.feedStockId, item.id) : c.item===item.nome)
      .reduce((s,c)=>s+Number(c.kg),0);
    return Math.max(0, item.kgComprado - usado);
  }
  function consumoExcedente(item, consumo){
    const usado = consumo
      .filter(c => c.feedStockId!=null ? Util.mesmoId(c.feedStockId, item.id) : c.item===item.nome)
      .reduce((s,c)=>s+Number(c.kg),0);
    return Math.max(0, usado - item.kgComprado);
  }
  function custoPorKg(item){ return item.custoTotal / item.kgComprado; }

  function totalDespesas(transacoes){ return transacoes.filter(t=>t.tipo==='despesa').reduce((s,t)=>s+Number(t.valor),0); }
  function totalReceitas(transacoes){ return transacoes.filter(t=>t.tipo==='receita').reduce((s,t)=>s+Number(t.valor),0); }
  /* saldo: Receitas − Despesas REGISTADAS. Isto é um SALDO de caixa,
     não é o lucro real do negócio — só reflete o que foi lançado na app.
     Não desconta, por exemplo: perdas por mortalidade (aves mortas não
     têm valor financeiro lançado), mão-de-obra própria não paga,
     depreciação de equipamento/infraestrutura, ou qualquer custo que o
     utilizador não tenha registado. Por isso, na interface, este valor
     chama-se sempre "Saldo acumulado" e nunca "Lucro". */
  function saldo(transacoes){ return totalReceitas(transacoes) - totalDespesas(transacoes); }
  function despesasPorCategoria(transacoes){
    const porCat = {};
    transacoes.filter(t=>t.tipo==='despesa').forEach(t=>{ porCat[t.categoria] = (porCat[t.categoria]||0) + Number(t.valor); });
    return Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
  }
  function consumoDiarioEstimado(consumo){
    consumo = (consumo||[]).filter(c=>!c.venda); // ração vendida não é consumo das aves
    if(consumo.length===0) return 0;
    const hoje = Util.hoje();
    const JANELA = 30; // só conta os últimos 30 dias
    const recentes = consumo.filter(c=>{
      const d = Util.diasEntre(c.data, hoje);
      return d >= 0 && d < JANELA;
    });
    if(recentes.length===0) return 0;
    const maisAntigo = Math.max(...recentes.map(c=>Util.diasEntre(c.data, hoje)));
    const total = recentes.reduce((s,c)=>s+Number(c.kg),0);
    return total / (maisAntigo + 1);
  }

  /* Idade calculada a partir da data de entrada — recalculada sempre que a
     app é aberta ou o painel é desenhado, por isso nunca fica desactualizada,
     nem que seja aberta dias ou semanas depois. */
  function idade(dataEntrada){
    if(!dataEntrada) return null;
    const dias = Util.diasEntre(dataEntrada, Util.hoje());
    if(dias < 0) return 'data futura';
    if(dias === 0) return 'hoje';
    const anos = Math.floor(dias/365);
    let resto = dias % 365;
    const meses = Math.floor(resto/30);
    resto = resto % 30;
    const semanas = Math.floor(resto/7);
    const diasFinal = resto % 7;

    const partes = [];
    if(anos>0) partes.push(`${anos} ano${anos>1?'s':''}`);
    if(meses>0) partes.push(`${meses} ${meses>1?'meses':'mês'}`);
    if(anos===0 && semanas>0) partes.push(`${semanas} semana${semanas>1?'s':''}`);
    if(anos===0 && meses===0 && diasFinal>0) partes.push(`${diasFinal} dia${diasFinal>1?'s':''}`);
    if(partes.length===0) return `${dias} dia${dias>1?'s':''}`;

    const principais = partes.slice(0,2);
    if(principais.length===1) return principais[0];
    return principais.slice(0,-1).join(', ') + ' e ' + principais[principais.length-1];
  }

  /* Texto de idade a mostrar para uma ave: usa a data de entrada quando
     existe (auto-actualizado); só recorre ao texto antigo/manual para aves
     registadas antes desta funcionalidade existir. */
  function idadeExibicao(ave){
    if(ave.dataEntrada) return idade(ave.dataEntrada);
    return ave.idade || '—';
  }

  function motivoLabel(m){
    return m==='venda' ? `${Icon.svg('carteira')} Venda` : m==='abate' ? `${Icon.svg('talheres')} Abate p/ consumo` : m==='morte' ? `${Icon.svg('caveira')} Morte` : '↪ Outro';
  }
  function totalVendidas(saidas){ return saidas.filter(s=>s.motivo==='venda').reduce((s,x)=>s+Number(x.qtd),0); }
  function totalAbatidas(saidas){ return saidas.filter(s=>s.motivo==='abate').reduce((s,x)=>s+Number(x.qtd),0); }
  function totalMortas(saidas){ return saidas.filter(s=>s.motivo==='morte').reduce((s,x)=>s+Number(x.qtd),0); }


  /* ============ PLANO ALIMENTAR, STOCK POR PRODUTO E CONSUMO AUTOMÁTICO ============
     Um "produto" é o conjunto de compras com o mesmo nome (ex.: várias compras
     de "Ração A1" somam-se, e o que sobrou de uma compra passa para a seguinte).
     Cada espécie tem um plano em fases: de que dia de vida a que dia, que
     produto e quantas gramas por ave por dia. */
  function chaveProduto(nome){ return String(nome||'').trim().toLowerCase(); }

  function produtosStock(feedStock, consumo){
    const mapa = {};
    (feedStock||[]).forEach(i=>{
      const k = chaveProduto(i.nome);
      if(!mapa[k]) mapa[k] = {chave:k, nome:String(i.nome||'').trim(), itens:[], kgComprado:0, custoTotal:0, primeiraCompra:null};
      const p = mapa[k];
      p.itens.push(i);
      p.kgComprado += Number(i.kgComprado)||0;
      p.custoTotal += Number(i.custoTotal)||0;
      if(i.dataCompra && (!p.primeiraCompra || i.dataCompra < p.primeiraCompra)) p.primeiraCompra = i.dataCompra;
    });
    const ids = {};
    Object.values(mapa).forEach(p=>p.itens.forEach(i=>{ ids[i.id]=p.chave; }));
    Object.values(mapa).forEach(p=>{ p.consumido = 0; });
    (consumo||[]).forEach(c=>{
      const k = (c.feedStockId!=null && ids[c.feedStockId]) ? ids[c.feedStockId] : chaveProduto(c.item);
      if(mapa[k]) mapa[k].consumido += Number(c.kg)||0;
    });
    return Object.values(mapa).map(p=>({
      ...p,
      restante: Math.max(0, p.kgComprado - p.consumido),
      excedente: Math.max(0, p.consumido - p.kgComprado),
      custoMedioKg: p.kgComprado>0 ? p.custoTotal/p.kgComprado : null
    }));
  }

  function planoDaEspecie(planos, especie){
    const k = chaveProduto(especie);
    return (planos||[]).filter(p=>chaveProduto(p.especie)===k)
      .slice().sort((a,b)=>(Number(a.diaInicio)||0)-(Number(b.diaInicio)||0));
  }
  /* Um lote pode ter uma ração e gramas só dele (substitui o plano da espécie). */
  function planoDoLote(lote, planos){
    if(lote && lote.racaoProduto && Number(lote.consumoGramas)>0){
      return [{especie:lote.especie, produto:lote.racaoProduto, diaInicio:0, diaFim:null, gramas:Number(lote.consumoGramas), proprio:true}];
    }
    if(lote && lote.planoGrupo){
      const grupo = planoDaEspecie(planos, lote.planoGrupo);
      if(grupo.length) return grupo;
    }
    return planoEfetivoDaEspecie(planos, lote && lote.especie);
  }
  function idadeLoteEm(lote, dataISO){
    if(!lote || !lote.dataEntrada) return null;
    return Util.diasEntre(lote.dataEntrada, dataISO) + (Number(lote.idadeEntradaDias)||0);
  }
  function faseNaIdade(plano, idadeDias){
    if(idadeDias==null || idadeDias<0) return null;
    return (plano||[]).find(f=>{
      const ini = Number(f.diaInicio)||0;
      const fim = (f.diaFim==null || f.diaFim==='') ? Infinity : Number(f.diaFim);
      return idadeDias >= ini && idadeDias <= fim;
    }) || null;
  }
  function consumoDiarioLote(lote, dataISO, planos){
    const idade = idadeLoteEm(lote, dataISO);
    const fase = faseNaIdade(planoDoLote(lote, planos), idade);
    if(!fase) return null;
    const qtd = Number(lote.qtd)||0;
    return {fase, idade, produto:fase.produto, gramas:Number(fase.gramas)||0, kg: qtd*(Number(fase.gramas)||0)/1000};
  }

  function somarDias(dataISO, n){
    const d = new Date(dataISO+'T00:00:00');
    d.setDate(d.getDate()+n);
    return Util.dataISO(d);
  }

  /* Calcula (sem gravar) os registos de consumo automático em falta.
     - só lotes com consumo automático ligado (autoDesde);
     - nunca antes da data de entrada do lote nem da 1.ª compra do produto;
     - não repete dias já lançados para o mesmo lote;
     - se já registaste à mão esse produto nesse dia, não acrescenta;
     - no máximo 90 dias para trás, para nunca gerar uma avalanche. */
  function gerarConsumoAutomatico(dados, hojeISO){
    const hoje = hojeISO || Util.hoje();
    const aves = dados.aves||[], planos = dados.planosAlimentares||[];
    const consumo = dados.consumo||[], feedStock = dados.feedStock||[];
    const produtos = {}; produtosStock(feedStock, []).forEach(p=>{ produtos[p.chave]=p; });
    const jaAuto = new Set(consumo.filter(c=>c.auto && c.loteId!=null).map(c=>`${c.loteId}|${c.data}`));
    const manual = new Set(consumo.filter(c=>!c.auto && !c.venda).map(c=>`${chaveProduto(c.item)}|${c.data}`));
    const LIMITE = 90;
    const novos = [];
    aves.forEach(lote=>{
      if(!lote.autoDesde || !lote.dataEntrada) return;
      let inicio = lote.autoDesde > lote.dataEntrada ? lote.autoDesde : lote.dataEntrada;
      const minimo = somarDias(hoje, -(LIMITE-1));
      if(inicio < minimo) inicio = minimo;
      for(let dia=inicio; dia<=hoje; dia=somarDias(dia,1)){
        if(jaAuto.has(`${lote.id}|${dia}`)) continue;
        const c = consumoDiarioLote(lote, dia, planos);
        if(!c || !(c.kg>0)) continue;
        const prod = produtos[chaveProduto(c.produto)];
        if(!prod || !prod.primeiraCompra || prod.primeiraCompra > dia) continue;
        if(manual.has(`${chaveProduto(c.produto)}|${dia}`)) continue;
        novos.push({
          data:dia, feedStockId:prod.itens[prod.itens.length-1].id, item:prod.nome,
          kg:Math.round(c.kg*1000)/1000, mistura:'(automático)',
          auto:true, loteId:lote.id, loteNome:lote.especie
        });
      }
    });
    return novos;
  }

  /* Duas fases do mesmo plano não podem cobrir os mesmos dias. */
  function fasesSobrepoem(fases, nova){
    const ini = Number(nova.diaInicio)||0;
    const fim = (nova.diaFim==null || nova.diaFim==='') ? Infinity : Number(nova.diaFim);
    return (fases||[]).some(f=>{
      const fi = Number(f.diaInicio)||0;
      const ff = (f.diaFim==null || f.diaFim==='') ? Infinity : Number(f.diaFim);
      return ini <= ff && fi <= fim;
    });
  }

  /* Previsão: quantos kg (e MT) vão ser precisos para N aves durante D dias. */
  function previsaoConsumo(plano, nAves, idadeInicial, dias, produtos){
    const porFase = [];
    let total = 0, semFase = 0, custo = 0, custoCompleto = true;
    for(let i=0;i<dias;i++){
      const idade = idadeInicial + i;
      const f = faseNaIdade(plano, idade);
      if(!f){ semFase++; continue; }
      const kg = nAves*(Number(f.gramas)||0)/1000;
      let linha = porFase.find(x=>x.produto===f.produto && x.diaInicio===f.diaInicio);
      if(!linha){ linha = {produto:f.produto, diaInicio:Number(f.diaInicio)||0, gramas:Number(f.gramas)||0, dias:0, kg:0, custo:null}; porFase.push(linha); }
      linha.dias++; linha.kg += kg; total += kg;
    }
    const mapa = {}; (produtos||[]).forEach(p=>{ mapa[p.chave]=p; });
    porFase.forEach(l=>{
      const p = mapa[chaveProduto(l.produto)];
      if(p && p.custoMedioKg!=null){ l.custo = l.kg*p.custoMedioKg; custo += l.custo; } else custoCompleto = false;
      l.kg = Math.round(l.kg*100)/100;
    });
    return {porFase, totalKg:Math.round(total*100)/100, diasSemFase:semFase, custo:Math.round(custo*100)/100, custoCompleto};
  }

  /* Avisos de troca de fase: "os patinhos já têm 30 dias — já podes passar para A2". */
  function alertasFases(aves, planos, hojeISO){
    const hoje = hojeISO || Util.hoje();
    const alerts = [];
    (aves||[]).forEach(lote=>{
      const plano = planoDoLote(lote, planos);
      if(plano.length<2) return;
      const idade = idadeLoteEm(lote, hoje);
      const atual = faseNaIdade(plano, idade);
      if(!atual) return;
      const nome = Util.escapeHTML(lote.especie);
      const proxima = plano.find(f=>(Number(f.diaInicio)||0) > (Number(atual.diaInicio)||0));
      const anterior = plano.filter(f=>(Number(f.diaInicio)||0) < (Number(atual.diaInicio)||0)).pop();
      const ini = Number(atual.diaInicio)||0;
      if(anterior && idade - ini <= 2){
        alerts.push({tipo:'aviso', texto:`${Icon.svg('aviso')} ${nome} (${lote.qtd}) têm ${idade} dias de vida — já podes passar de "${Util.escapeHTML(anterior.produto)}" para "${Util.escapeHTML(atual.produto)}" (${atual.gramas} g/ave/dia).`});
      } else if(proxima){
        const faltam = (Number(proxima.diaInicio)||0) - idade;
        if(faltam>=1 && faltam<=3) alerts.push({tipo:'aviso', texto:`${Icon.svg('aviso')} ${nome} (${lote.qtd}) têm ${idade} dias — faltam ${faltam} dia(s) para passar de "${Util.escapeHTML(atual.produto)}" para "${Util.escapeHTML(proxima.produto)}".`});
      }
    });
    return alerts;
  }

  /* Dias que o stock de um produto dura ao ritmo planeado de hoje. */
  function consumoPlaneadoDiarioKg(produtoNome, aves, planos, hojeISO){
    const hoje = hojeISO || Util.hoje();
    const k = chaveProduto(produtoNome);
    return (aves||[]).filter(l=>l.autoDesde).reduce((s,l)=>{
      const c = consumoDiarioLote(l, hoje, planos);
      return (c && chaveProduto(c.produto)===k) ? s + c.kg : s;
    }, 0);
  }


  /* ============ ALERTAS INTELIGENTES (Fase 5) ============
     Avisam de problemas que só se vêem comparando períodos: a postura a cair, mortes acima do
     normal, o dinheiro a acabar. São cálculos simples e explicáveis (sem "adivinhar"): cada
     aviso diz que números o gerou. Todos aceitam a data de hoje por parâmetro, para se poderem
     testar. */
  const _diasAtras = (data, hoje)=> Math.round((Date.parse(hoje) - Date.parse(data)) / 86400000);

  /* Postura em queda: média diária de ovos da última semana (até ontem) contra a das 3
     semanas anteriores. Só avisa com dados suficientes (≥3 dias registados na semana recente e
     ≥7 nas anteriores) e uma média anterior com significado (≥3 ovos/dia). */
  function alertasPostura(ovosLog, hojeISO){
    const hoje = hojeISO || Util.hoje();
    const porDia = {};
    (ovosLog || []).forEach(o=>{
      const q = Number(o && o.qtd);
      if(!o || !o.data || !(q >= 0)) return;
      porDia[o.data] = (porDia[o.data] || 0) + q;
    });
    let rTot = 0, rDias = 0, bTot = 0, bDias = 0;
    Object.keys(porDia).forEach(data=>{
      const i = _diasAtras(data, hoje);
      if(i >= 1 && i <= 7){ rTot += porDia[data]; rDias++; }
      else if(i >= 8 && i <= 28){ bTot += porDia[data]; bDias++; }
    });
    if(rDias < 3 || bDias < 7) return [];
    const rMed = rTot / rDias, bMed = bTot / bDias;
    if(bMed < 3) return [];
    const queda = 1 - rMed / bMed;
    if(queda < 0.25) return [];
    const grave = queda >= 0.40;
    return [{
      tipo: grave ? 'perigo' : 'aviso', chave: 'postura',
      texto: `${Icon.svg(grave ? 'perigo' : 'aviso')} Postura em queda: ${rMed.toFixed(1)} ovos/dia na última semana, contra ${bMed.toFixed(1)} nas 3 semanas anteriores (−${Math.round(queda * 100)}%). Confirma a água, a ração, sinais de doença ou stress — e se não vendeste ou abateste fêmeas.`
    }];
  }

  /* Mortalidade acima do normal: mortes dos últimos 7 dias contra a média semanal das 4
     semanas anteriores e contra o tamanho do plantel. Pelo menos 3 mortes. */
  function alertasMortalidade(aves, saidas, hojeISO){
    const hoje = hojeISO || Util.hoje();
    let m7 = 0, mAntes = 0;
    (saidas || []).forEach(s=>{
      if(!s || s.motivo !== 'morte' || !s.data) return;
      const q = Number(s.qtd) || 0, i = _diasAtras(s.data, hoje);
      if(i >= 0 && i <= 6) m7 += q;
      else if(i >= 7 && i <= 34) mAntes += q;
    });
    if(m7 < 3) return [];
    const plantel = (aves || []).reduce((t, a)=>t + (Number(a && a.qtd) || 0), 0);
    const base = plantel + m7;
    const pct = base > 0 ? m7 / base * 100 : 0;
    const semanal = mAntes / 4, ref = Math.max(1, semanal);
    if(!(pct >= 3 || m7 >= 2 * ref)) return [];
    const grave = pct >= 5 || m7 >= 3 * ref;
    return [{
      tipo: grave ? 'perigo' : 'aviso', chave: 'mortalidade',
      texto: `${Icon.svg(grave ? 'perigo' : 'aviso')} Mortalidade acima do normal: ${m7} ave(s) morta(s) nos últimos 7 dias (${pct.toFixed(1)}% do plantel); nas 4 semanas anteriores a média foi ${semanal.toFixed(1)} por semana. Procura sinais de doença, isola as aves afectadas e vê a água e a ração.`
    }];
  }

  /* Previsão de caixa: saldo registado + o ritmo dos últimos 30 dias. Precisa de pelo menos 14
     dias de histórico e 5 movimentos na janela; senão diz que ainda não dá para prever. Não é o
     lucro real (só conta o que foi lançado). */
  function previsaoCaixa(transacoes, hojeISO, diasPrev){
    const hoje = hojeISO || Util.hoje();
    const dias = diasPrev || 30;
    const lista = (transacoes || []).filter(t=>t && t.data && t.data <= hoje && (t.tipo === 'despesa' || t.tipo === 'receita'));
    const valor = t=>(t.tipo === 'receita' ? 1 : -1) * (Number(t.valor) || 0);
    const saldoAtual = lista.reduce((s, t)=>s + valor(t), 0);
    const janela = lista.filter(t=>{ const i = _diasAtras(t.data, hoje); return i >= 0 && i <= 29; });
    const primeira = lista.reduce((m, t)=>(!m || t.data < m ? t.data : m), null);
    const historico = primeira ? _diasAtras(primeira, hoje) : 0;
    if(historico < 14 || janela.length < 5) return {suficiente:false, saldoAtual};
    const amostra = Math.min(30, historico);
    const receita = janela.filter(t=>t.tipo === 'receita').reduce((s, t)=>s + (Number(t.valor) || 0), 0);
    const despesa = janela.filter(t=>t.tipo === 'despesa').reduce((s, t)=>s + (Number(t.valor) || 0), 0);
    const mediaDiaria = (receita - despesa) / amostra;
    return {
      suficiente:true, saldoAtual, mediaDiaria, diasPrev:dias,
      receitaMedia: receita / amostra, despesaMedia: despesa / amostra,
      previsto: saldoAtual + mediaDiaria * dias,
      diasAteZero: (mediaDiaria < 0 && saldoAtual > 0) ? Math.floor(saldoAtual / -mediaDiaria) : null
    };
  }
  function alertaCaixa(prev){
    if(!prev || !prev.suficiente) return [];
    if(prev.saldoAtual < 0){
      return [{tipo:'perigo', chave:'caixa', texto:`${Icon.svg('perigo')} Previsão de caixa: o saldo registado já está negativo (${Util.moeda(prev.saldoAtual)}) e, ao ritmo dos últimos 30 dias, deve ficar em ${Util.moeda(prev.previsto)} daqui a ${prev.diasPrev} dias.`}];
    }
    if(prev.diasAteZero !== null && prev.diasAteZero <= 30){
      return [{tipo:'aviso', chave:'caixa', texto:`${Icon.svg('aviso')} Previsão de caixa: ao ritmo dos últimos 30 dias (média de ${Util.moeda(prev.mediaDiaria)} por dia), o saldo registado pode chegar a zero em cerca de ${prev.diasAteZero} dia(s).`}];
    }
    return [];
  }

  /* Conversão alimentar por lote: quantos kg de ração foram precisos por kg de peso ganho entre
     a primeira e a última pesagem do lote, e quanto custou cada kg ganho. A ração só é
     atribuída ao lote quando o consumo é o automático (que sabe de que lote é). O peso ganho
     usa o número de aves que o lote tem agora. */
  function conversaoAlimentarPorLote(pesagens, consumo, feedStock, aves){
    const porLote = {};
    (pesagens || []).forEach(p=>{
      if(!p || p.loteId == null || !p.data || !(Number(p.pesoMedioG) > 0)) return;
      (porLote[String(p.loteId)] = porLote[String(p.loteId)] || []).push(p);
    });
    const preco = {};
    (feedStock || []).forEach(f=>{
      const k = chaveProduto(f.nome || f.produto || '');
      const o = preco[k] || (preco[k] = {kg:0, custo:0});
      o.kg += Number(f.kgComprado) || 0; o.custo += Number(f.custoTotal) || 0;
    });
    const res = [];
    Object.keys(porLote).forEach(chave=>{
      const l = porLote[chave].slice().sort((a, b)=>String(a.data).localeCompare(String(b.data)));
      if(l.length < 2) return;
      const primeira = l[0], ultima = l[l.length - 1];
      if(!(ultima.data > primeira.data)) return;
      const ave = (aves || []).find(a=>Util.mesmoId(a.id, primeira.loteId));
      const qtd = ave ? Number(ave.qtd) : 0;
      const ganhoKg = (Number(ultima.pesoMedioG) - Number(primeira.pesoMedioG)) / 1000 * qtd;
      if(!(qtd > 0) || !(ganhoKg > 0)) return;
      const doLote = (consumo || []).filter(c=>c && !c.venda && c.loteId != null && Util.mesmoId(c.loteId, primeira.loteId)
        && c.data >= primeira.data && c.data <= ultima.data);
      const racaoKg = doLote.reduce((s, c)=>s + (Number(c.kg) || 0), 0);
      let custo = 0, semPreco = false;
      doLote.forEach(c=>{
        const p = preco[chaveProduto(c.item || '')];
        if(p && p.kg > 0) custo += (Number(c.kg) || 0) * p.custo / p.kg; else semPreco = true;
      });
      res.push({
        loteId: primeira.loteId, loteNome: ultima.loteNome || primeira.loteNome || (ave ? ave.especie : ''),
        de: primeira.data, ate: ultima.data, dias: _diasAtras(primeira.data, ultima.data),
        ganhoKg, racaoKg,
        conversao: racaoKg > 0 ? racaoKg / ganhoKg : null,
        custo: racaoKg > 0 && !semPreco ? custo : null,
        custoPorKgGanho: racaoKg > 0 && !semPreco ? custo / ganhoKg : null
      });
    });
    return res;
  }

  /* Chave estável de um alerta: a mesma para o mesmo assunto, mesmo que os números mudem
     ("faltam 3 dias" / "faltam 2 dias"). Serve para não repetir a mesma notificação. */
  function chaveAlerta(a){
    if(a && a.chave) return String(a.chave);
    const txt = String((a && a.texto) || '').replace(/<[^>]*>/g, ' ');
    return ((a && a.tipo) || '') + ':' + Util.normalizarTexto(txt).replace(/[0-9]+([.,][0-9]+)?/g, '#').replace(/\s+/g, ' ').trim();
  }

  /* Todos os alertas num só sítio — usado pelo Início e pelas notificações, para mostrarem
     exactamente o mesmo. `d` = os dados; opc.financas = false para quem não vê finanças. */
  function reunirAlertas(d, opc){
    opc = opc || {};
    const hoje = opc.hoje;
    const stockRev = stockRevenda(d.revendaProdutos || [], d.revendaMovs || []);
    let lista = alertas(d.feedStock, d.consumo, d.incubacao, d.aves, d.ovosLog, d.planos)
      .concat(alertasFases(d.aves, d.planos, hoje),
              alertasCompra(d.feedStock, d.consumo, d.aves, d.planos, hoje),
              alertasSaude(d.saude, hoje), alertasRetirada(d.saude, hoje),
              alertasPostura(d.ovosLog, hoje), alertasMortalidade(d.aves, d.saidasAves, hoje));
    if(opc.financas !== false){
      lista = lista.concat(alertasRevenda(stockRev), alertaCaixa(previsaoCaixa(d.transacoes, hoje)));
    }
    return lista;
  }

  /* ============ ALERTA DE COMPRA, CUSTO POR LOTE, SAÚDE E PESAGENS ============ */
  function alertasCompra(feedStock, consumo, aves, planos, hojeISO){
    const hoje = hojeISO || Util.hoje();
    const alerts = [];
    produtosStock(feedStock, consumo).forEach(p=>{
      if(p.restante<=0) return;
      const ritmo = consumoPlaneadoDiarioKg(p.nome, aves, planos, hoje);
      if(!(ritmo>0)) return;
      const dias = Math.floor(p.restante/ritmo);
      if(dias<=7){
        const quanto = dias<1 ? 'menos de 1 dia' : `cerca de ${dias} dia(s)`;
        alerts.push({tipo: dias<=3 ? 'perigo' : 'aviso', texto:`${Icon.svg('aviso')} "${Util.escapeHTML(p.nome)}" dura ${quanto} ao ritmo do plano (restam ${p.restante.toFixed(1)}kg) — hora de comprar.`});
      }
    });
    return alerts;
  }

  /* Ração gasta e custo de cada lote, a partir dos lançamentos automáticos. */
  function custoRacaoPorLote(consumo, feedStock){
    const prods = produtosStock(feedStock, []);
    const porChave = {}; prods.forEach(p=>{ porChave[p.chave]=p; });
    const r = {};
    (consumo||[]).filter(c=>c.auto && c.loteId!=null).forEach(c=>{
      const p = porChave[chaveProduto(c.item)];
      const kg = Number(c.kg)||0;
      if(!r[c.loteId]) r[c.loteId] = {kg:0, custo:0, semPreco:false};
      r[c.loteId].kg += kg;
      if(p && p.custoMedioKg!=null) r[c.loteId].custo += kg*p.custoMedioKg; else r[c.loteId].semPreco = true;
    });
    Object.values(r).forEach(x=>{ x.kg = Math.round(x.kg*100)/100; x.custo = Math.round(x.custo*100)/100; });
    return r;
  }

  /* Vacinas e medicação: tarefas com data; "feito" fecha-as. */
  function estadoTarefaSaude(t, hojeISO){
    const hoje = hojeISO || Util.hoje();
    const dias = Util.diasEntre(hoje, t.data); // > 0 = no futuro
    if(t.feito) return {estado:'feito', dias};
    if(dias<0) return {estado:'atrasada', dias};
    if(dias===0) return {estado:'hoje', dias};
    if(dias<=3) return {estado:'breve', dias};
    return {estado:'futura', dias};
  }
  function tarefasSaudePendentes(lista, hojeISO){
    return (lista||[]).filter(t=>t && !t.feito)
      .slice().sort((a,b)=>String(a.data).localeCompare(String(b.data)));
  }
  function alertasSaude(lista, hojeISO){
    const hoje = hojeISO || Util.hoje();
    const alerts = [];
    tarefasSaudePendentes(lista).forEach(t=>{
      const {estado, dias} = estadoTarefaSaude(t, hoje);
      const o = `${Util.escapeHTML(t.tipo)}: ${Util.escapeHTML(t.produto)}${t.loteNome ? ' ('+Util.escapeHTML(t.loteNome)+')' : ''}`;
      if(estado==='atrasada') alerts.push({tipo:'perigo', texto:`${Icon.svg('perigo')} ${o} estava marcada para ${t.data} — atrasada ${-dias} dia(s).`});
      else if(estado==='hoje') alerts.push({tipo:'aviso', texto:`${Icon.svg('aviso')} ${o} é para hoje.`});
      else if(estado==='breve') alerts.push({tipo:'aviso', texto:`${Icon.svg('aviso')} ${o} em ${dias} dia(s) (${t.data}).`});
    });
    return alerts;
  }
  /* Período de retirada: depois de uma medicação/vacina, o lote não deve ser
     vendido nem abatido para consumo até passarem os dias indicados na bula
     (ou pelo veterinário). Fica "em retirada" até dataFeito + retiradaDias. */
  function retiradasAtivas(saude, loteId, dataISO){
    const dia = dataISO || Util.hoje();
    return (saude||[]).filter(t=>t && t.feito && Number(t.retiradaDias)>0 && t.dataFeito).map(t=>{
      const fim = somarDias(t.dataFeito, Math.round(Number(t.retiradaDias)));
      return {id:t.id, tipo:t.tipo, produto:t.produto, loteId:t.loteId==null ? null : t.loteId, loteNome:t.loteNome||'',
              dataFeito:t.dataFeito, fim, diasRestantes:Util.diasEntre(dia, fim)};
    }).filter(r=>r.diasRestantes>0 && r.dataFeito<=dia && (loteId==null || r.loteId==null || Util.mesmoId(r.loteId, loteId)))
      .sort((a,b)=>a.fim.localeCompare(b.fim));
  }
  function alertasRetirada(saude, hojeISO){
    return retiradasAtivas(saude, null, hojeISO).map(r=>({
      tipo:'aviso',
      texto:`${Icon.svg('aviso')} Período de retirada: ${Util.escapeHTML(r.tipo)} ${Util.escapeHTML(r.produto)} (${Util.escapeHTML(r.loteNome||'todas as aves')}) — não vender nem abater antes de ${r.fim} (faltam ${r.diasRestantes} dia(s)).`
    }));
  }

  /* Ao marcar como feita uma tarefa que se repete, cria a seguinte. */
  function proximaTarefaSaude(t, dataFeito){
    const n = Math.round(Number(t.repetirDias)||0);
    if(!(n>0)) return null;
    return {
      tipo:t.tipo, produto:t.produto, loteId:t.loteId==null ? null : t.loteId, loteNome:t.loteNome||'',
      data:somarDias(dataFeito, n), feito:false, repetirDias:n, retiradaDias:t.retiradaDias||null, custo:t.custo||null, notas:t.notas||''
    };
  }

  /* Pesagens: peso médio por data e ganho diário entre pesagens seguidas. */
  function evolucaoPeso(pesagens, lote){
    const ord = (pesagens||[]).slice().sort((a,b)=>String(a.data).localeCompare(String(b.data)));
    return ord.map((p, i)=>{
      const ant = i>0 ? ord[i-1] : null;
      const dias = ant ? Util.diasEntre(ant.data, p.data) : 0;
      return {
        id:p.id, data:p.data, pesoMedioG:Number(p.pesoMedioG)||0, amostra:p.amostra||null, notas:p.notas||'',
        idade: lote ? idadeLoteEm(lote, p.data) : null,
        ganhoDiario: (ant && dias>0) ? Math.round(((Number(p.pesoMedioG)||0)-(Number(ant.pesoMedioG)||0))/dias*10)/10 : null
      };
    });
  }


  /* ============ TIPO E RAÇA DAS AVES + MODELOS DE PLANO ============
     O nome do grupo de aves ("Galinha Sasso", "Pato Muscovy") guarda o tipo
     (1.ª palavra) e a raça (o resto). Tudo é deduzido do nome, por isso
     os registos antigos continuam a funcionar sem alterações. */
  function tipoDaEspecie(especie){
    const s = String(especie||'').trim();
    if(/^(galinh|frang|pinto|pintainh)/i.test(s)) return 'Galinha';
    if(/^pat/i.test(s)) return 'Pato';
    if(/^gans/i.test(s)) return 'Ganso';
    return 'Outro';
  }
  function racaDaEspecie(especie){
    const s = String(especie||'').trim();
    const m = s.match(/^(galinhas?|frangos?|pintos?|pintainhos?|patos?|patas?|patinhos?|gansos?)\s+(.*)$/i);
    if(m) return m[2].trim();
    return tipoDaEspecie(s)==='Outro' ? s : '';
  }
  const RACAS_SUGERIDAS = {
    Galinha:['Sasso','Nativa','Poedeira','Cobb','Ross','Rhode Island Red'],
    Pato:['Muscovy','Pequim','Mulard','Khaki Campbell','Nativo'],
    Ganso:['Toulouse','Nativo'],
    Outro:[]
  };
  /* ---------- Nomes de raça: uma só forma, sem duplicados por engano ----------
     "Cafrial", "cafriais" e "Cafrial " são a mesma raça: comparam-se sem
     maiúsculas, acentos, espaços a mais nem plural. Erros de escrita
     pequenos ("Cafrail") são detectados como PARECIDOS, e quem decide é
     o utilizador (nunca se junta nada em silêncio). */
  const _semAcentos = t => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  function _singular(w){
    if(w.length <= 3) return w;
    if(/oes$|aes$/.test(w)) return w.slice(0,-3) + 'ao';
    if(/ais$/.test(w)) return w.slice(0,-3) + 'al';
    if(/eis$/.test(w)) return w.slice(0,-3) + 'el';
    if(/ois$/.test(w)) return w.slice(0,-3) + 'ol';
    if(/uis$/.test(w)) return w.slice(0,-3) + 'ul';
    if(/ns$/.test(w)) return w.slice(0,-2) + 'm';
    if(/[rz]es$/.test(w)) return w.slice(0,-2);
    if(/ss$/.test(w)) return w;
    if(/s$/.test(w)) return w.slice(0,-1);
    return w;
  }
  function chaveRaca(raca){
    return _semAcentos(raca).split(' ').filter(Boolean).map(_singular).join(' ');
  }
  function _distancia(a, b){
    const d = [];
    for(let i = 0; i <= a.length; i++){ d[i] = [i]; }
    for(let j = 1; j <= b.length; j++){ d[0][j] = j; }
    for(let i = 1; i <= a.length; i++){
      for(let j = 1; j <= b.length; j++){
        d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
        /* duas letras trocadas ("Cafrail" por "Cafrial") contam como 1 erro */
        if(i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) d[i][j] = Math.min(d[i][j], d[i-2][j-2] + 1);
      }
    }
    return d[a.length][b.length];
  }
  /* Mesma raça (igual) ou quase (1 letra de diferença; 2 nos nomes longos). */
  function racasParecidas(a, b){
    const ka = chaveRaca(a), kb = chaveRaca(b);
    if(!ka || !kb) return false;
    if(ka === kb) return true;
    const n = Math.min(ka.length, kb.length);
    if(n < 4) return false;
    return _distancia(ka, kb) <= (n >= 9 ? 2 : 1);
  }
  /* "rhode ISLAND  red" → "Rhode Island Red" (siglas até 3 letras ficam: "ISA"). */
  function formatarNomeRaca(raca){
    const pequenas = ['de','da','do','das','dos','e'];
    return String(raca == null ? '' : raca).replace(/\s+/g,' ').trim().split(' ').filter(Boolean).map((w, i)=>{
      const l = w.toLowerCase();
      if(i > 0 && pequenas.includes(l)) return l;
      if(w.length <= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
      return l.charAt(0).toUpperCase() + l.slice(1);
    }).join(' ');
  }
  /* A palavra que abre o nome — "Patas", "Pintos", "Galinha" — diz se são
     fêmeas, crias, etc. Guarda-se TAL COMO foi escrita (Patas Muscovy não
     passa a Pato Muscovy). Só existe quando o tipo é conhecido. */
  function prefixoDoNome(especie){
    const s = String(especie == null ? '' : especie).trim();
    if(tipoDaEspecie(s) === 'Outro') return '';
    return formatarNomeRaca(s.split(/\s+/)[0]);
  }
  function nomeGrupo(tipo, raca){
    return raca ? `${tipo} ${raca}` : tipo;
  }
  /* "Muscovy em postura" → {base:'Muscovy', variante:'em postura'}.
     Só reconhece as raças conhecidas (RACAS_SUGERIDAS): o resto do nome é uma
     descrição do lote ("chocando", "reprodutor Nº1", "(marreco)"), não outra
     raça. Raça desconhecida → o nome inteiro é a base. */
  function separarBaseVariante(tipo, raca){
    const palavras = String(raca == null ? '' : raca).trim().split(/\s+/).filter(Boolean);
    let melhor = null;
    (RACAS_SUGERIDAS[tipo] || []).forEach(sug=>{
      const n = sug.split(/\s+/).length;
      if(palavras.length >= n && chaveRaca(palavras.slice(0, n).join(' ')) === chaveRaca(sug) && (!melhor || n > melhor.n)) melhor = {n, sug};
    });
    return melhor ? {base: melhor.sug, variante: palavras.slice(melhor.n).join(' ')}
                  : {base: palavras.join(' '), variante: ''};
  }

  /* Já há, no mesmo tipo, uma raça igual ou parecida com a que vais registar?
     Devolve {raca, igual} (igual = só difere em maiúsculas/plural → reutiliza-se
     sem perguntar) ou null. A forma devolvida é a mais usada nos lotes existentes. */
  function racaExistenteParecida(aves, especie){
    const tipo = tipoDaEspecie(especie), raca = separarBaseVariante(tipo, racaDaEspecie(especie)).base;
    if(!raca) return null;
    const formas = {};
    (aves || []).forEach(a=>{
      if(tipoDaEspecie(a.especie) !== tipo) return;
      const r = separarBaseVariante(tipo, racaDaEspecie(a.especie)).base;
      if(r) formas[r] = (formas[r] || 0) + (Number(a.qtd) || 0) + 1;
    });
    const nomes = Object.keys(formas).sort((x, y)=>formas[y] - formas[x]);
    const igual = nomes.find(n=>chaveRaca(n) === chaveRaca(raca));
    if(igual) return {raca: igual, igual: true};
    const parecida = nomes.find(n=>racasParecidas(n, raca));
    return parecida ? {raca: parecida, igual: false} : null;
  }
  /* Grupos de nomes que parecem ser a mesma raça (para o botão "Unir"). */
  function duplicadosDeRacas(aves){
    const porTipo = {};
    (aves || []).forEach(a=>{
      const t = tipoDaEspecie(a.especie), r = separarBaseVariante(t, racaDaEspecie(a.especie)).base;
      if(!r) return;
      if(!porTipo[t]) porTipo[t] = {};
      if(!porTipo[t][r]) porTipo[t][r] = {raca:r, qtd:0, lotes:0};
      porTipo[t][r].qtd += Number(a.qtd) || 0; porTipo[t][r].lotes++;
    });
    const res = [];
    Object.keys(porTipo).forEach(t=>{
      const nomes = Object.values(porTipo[t]), usado = new Set();
      nomes.forEach((n, i)=>{
        if(usado.has(i)) return;
        const grupo = [n]; usado.add(i);
        nomes.forEach((m, j)=>{
          if(!usado.has(j) && grupo.some(g=>racasParecidas(g.raca, m.raca))){ grupo.push(m); usado.add(j); }
        });
        if(grupo.length > 1) res.push({tipo:t, nomes:grupo.sort((x, y)=>y.qtd - x.qtd)});
      });
    });
    return res;
  }

  /* Total de aves por tipo e, dentro de cada tipo, por raça. Raças que só
     diferem em maiúsculas/plural ("Cafrial", "cafriais") contam como uma só;
     cada raça traz os seus lotes (registos: {ave, variante}); a variante é a
     descrição do lote ("em postura", "chocando") que vem depois da raça. */
  function resumoPorTipo(aves){
    const tipos = {};
    (aves||[]).forEach(a=>{
      const t = tipoDaEspecie(a.especie), racaCompleta = racaDaEspecie(a.especie);
      const sv = racaCompleta ? separarBaseVariante(t, racaCompleta) : {base:'(sem raça definida)', variante:''};
      const r = sv.base;
      if(!tipos[t]) tipos[t] = {tipo:t, qtd:0, machos:0, femeas:0, racas:{}};
      const T = tipos[t];
      const q = Number(a.qtd)||0, m = Number(a.machos)||0, f = Number(a.femeas)||0;
      T.qtd += q; T.machos += m; T.femeas += f;
      const k = r === '(sem raça definida)' ? r : chaveRaca(r);
      if(!T.racas[k]) T.racas[k] = {raca:r, qtd:0, machos:0, femeas:0, lotes:0, registos:[], _formas:{}};
      const R = T.racas[k];
      R.qtd += q; R.machos += m; R.femeas += f; R.lotes++; R.registos.push({ave:a, variante:sv.variante});
      R._formas[r] = (R._formas[r] || 0) + q + 1;
    });
    const ordem = ['Galinha','Pato','Ganso','Outro'];
    return Object.values(tipos)
      .map(T=>({...T, racas:Object.values(T.racas).map(R=>{
        const forma = Object.keys(R._formas).sort((x, y)=>R._formas[y] - R._formas[x])[0];
        const {_formas, ...resto} = R;
        return {...resto, raca: forma};
      }).sort((a,b)=>b.qtd-a.qtd)}))
      .sort((a,b)=>ordem.indexOf(a.tipo)-ordem.indexOf(b.tipo));
  }

  /* Plano da raça ("Galinha Sasso"); se não houver, o plano geral do tipo ("Galinha"). */
  function planoEfetivoDaEspecie(planos, especie){
    const exato = planoDaEspecie(planos, especie);
    if(exato.length) return exato;
    const t = tipoDaEspecie(especie);
    return t==='Outro' ? [] : planoDaEspecie(planos, t);
  }

  /* Modelos prontos de plano. Os valores são REFERÊNCIAS aproximadas para
     começar (ração à vontade) — ajusta com o rótulo da ração, as pesagens e
     o consumo real. Cada fonte está indicada na nota. */
  const MODELOS_PLANO = [
    {id:'sasso', titulo:'Galinha Sasso (carne, crescimento lento)', grupoSugerido:'Galinha Sasso',
     nota:'Fonte: tabela de consumo acumulado de pintos Sasso machos (incubatório norte-americano), ração à vontade, convertida em g/ave/dia por semana. As fêmeas comem menos: usa isto como máximo e baixa se for preciso. Depois dos 63 dias a última fase mantém-se até mudares ou vendes.',
     fases:[
      {produto:'Ração inicial', diaInicio:0, diaFim:13, gramas:21},
      {produto:'Ração inicial', diaInicio:14, diaFim:20, gramas:63},
      {produto:'Ração de crescimento', diaInicio:21, diaFim:27, gramas:98},
      {produto:'Ração de crescimento', diaInicio:28, diaFim:41, gramas:136},
      {produto:'Ração de acabamento', diaInicio:42, diaFim:62, gramas:139},
      {produto:'Ração de acabamento', diaInicio:63, diaFim:null, gramas:155}]},
    {id:'poedeira', titulo:'Galinha poedeira (da cria à postura)', grupoSugerido:'Galinha poedeira',
     nota:'Fontes: poultryhub.org (poedeiras de ovos castanhos: 13 g/dia na 1.ª semana, 56 g/dia na 10.ª, 100-105 g/dia em postura) e guias de ração para poedeiras (100-120 g/dia). Os valores intermédios são interpolados por mim. Raças locais costumam comer menos.',
     fases:[
      {produto:'Ração inicial', diaInicio:0, diaFim:41, gramas:25},
      {produto:'Ração de recria', diaInicio:42, diaFim:83, gramas:53},
      {produto:'Ração de recria', diaInicio:84, diaFim:104, gramas:70},
      {produto:'Ração pré-postura', diaInicio:105, diaFim:125, gramas:85},
      {produto:'Ração de postura', diaInicio:126, diaFim:null, gramas:105}]},
    {id:'pequim', titulo:'Pato Pequim (carne, até ao adulto)', grupoSugerido:'Pato Pequim',
     nota:'Fonte: tabela de consumo semanal de patinhos Pequim (Metzer Farms), ração à vontade, convertida em g/ave/dia. Depois dos 56 dias a fase "adulto" é uma estimativa minha — confirma com o consumo real.',
     fases:[
      {produto:'Ração inicial', diaInicio:0, diaFim:6, gramas:32},
      {produto:'Ração inicial', diaInicio:7, diaFim:13, gramas:107},
      {produto:'Ração de crescimento', diaInicio:14, diaFim:27, gramas:165},
      {produto:'Ração de acabamento', diaInicio:28, diaFim:34, gramas:211},
      {produto:'Ração de acabamento', diaInicio:35, diaFim:55, gramas:238},
      {produto:'Ração de adulto', diaInicio:56, diaFim:null, gramas:170}]},
    {id:'muscovy', titulo:'Pato Muscovy (carne, até ao adulto)', grupoSugerido:'Pato Muscovy',
     nota:'ESTIMATIVA: não encontrei uma tabela publicada de consumo diário do Muscovy. Usei a do Pato Pequim ×0,8, porque aos 8 semanas o Muscovy pesa cerca de 80% do Pequim (2,04 kg contra 2,52 kg). Os Muscovy vendem-se entre as 10 e as 17 semanas. Ajusta com as tuas pesagens e o consumo real.',
     fases:[
      {produto:'Ração inicial', diaInicio:0, diaFim:6, gramas:26},
      {produto:'Ração inicial', diaInicio:7, diaFim:13, gramas:86},
      {produto:'Ração de crescimento', diaInicio:14, diaFim:27, gramas:132},
      {produto:'Ração de acabamento', diaInicio:28, diaFim:34, gramas:169},
      {produto:'Ração de acabamento', diaInicio:35, diaFim:55, gramas:190},
      {produto:'Ração de adulto', diaInicio:56, diaFim:null, gramas:140}]},
    {id:'pata-poedeira', titulo:'Pata poedeira (da cria à postura)', grupoSugerido:'Pata poedeira',
     nota:'Fonte: guia de criação de patas poedeiras do Departamento de Veterinária da Malásia (patas de 1,3-1,8 kg): 1,2-1,6 kg nas primeiras 4 semanas, 11-11,8 kg das 5 às 22 semanas e 160-170 g/dia em postura.',
     fases:[
      {produto:'Ração inicial', diaInicio:0, diaFim:27, gramas:50},
      {produto:'Ração de recria', diaInicio:28, diaFim:153, gramas:90},
      {produto:'Ração de postura', diaInicio:154, diaFim:null, gramas:165}]}
  ];



  /* ============ INVENTÁRIO DE REVENDA ============
     Produtos que compras para vender (carvão, sacos de ração, materiais…).
     stock = compras − vendas ± ajustes (perdas, quebras, contagem).
     Custo médio = total pago nas compras ÷ quantidade comprada. */
  function stockRevenda(produtos, movs){
    const por = {};
    (produtos||[]).forEach(p=>{ por[p.id] = {...p, comprado:0, custoCompras:0, vendido:0, valorVendido:0, ajustes:0}; });
    (movs||[]).forEach(m=>{
      const p = por[m.produtoId]; if(!p) return;
      const q = Number(m.qtd)||0, v = Number(m.valor)||0;
      if(m.tipo==='compra'){ p.comprado += q; p.custoCompras += v; }
      else if(m.tipo==='venda'){ p.vendido += q; p.valorVendido += v; }
      else if(m.tipo==='ajuste'){ p.ajustes += q; }
    });
    return Object.values(por).map(p=>{
      const stock = Math.round((p.comprado - p.vendido + p.ajustes)*1000)/1000;
      const custoMedio = p.comprado>0 ? p.custoCompras/p.comprado : null;
      const preco = Number(p.precoVenda)||0, minimo = Number(p.stockMinimo)||0;
      return {...p, stock, custoMedio,
        valorStock: custoMedio!=null ? Math.max(0, stock)*custoMedio : 0,
        margemUnitaria: (custoMedio!=null && preco>0) ? Math.round((preco-custoMedio)*100)/100 : null,
        margemVendida: custoMedio!=null ? Math.round((p.valorVendido - p.vendido*custoMedio)*100)/100 : null,
        abaixoMinimo: minimo>0 && stock <= minimo};
    });
  }
  function alertasRevenda(listaStock){
    const alerts = [];
    (listaStock||[]).filter(p=>p.ativo!==false && p.abaixoMinimo).forEach(p=>{
      const nome = Util.escapeHTML(p.nome), un = Util.escapeHTML(p.unidade||'');
      if(p.stock<0) alerts.push({tipo:'perigo', texto:`${Icon.svg('perigo')} Revenda: o stock de "${nome}" está negativo (${p.stock} ${un}) — falta registar uma compra ou corrigir vendas.`});
      else alerts.push({tipo: p.stock<=0 ? 'perigo' : 'aviso', texto:`${Icon.svg('aviso')} Revenda: "${nome}" com ${p.stock} ${un} (mínimo ${p.stockMinimo}) — hora de repor.`});
    });
    return alerts;
  }
  /* Margem estimada de uma venda de produto de revenda. */
  function margemVendaRevenda(venda, listaStock){
    const p = (listaStock||[]).find(x=>Util.mesmoId(x.id, venda.revendaId));
    if(!p || p.custoMedio==null) return null;
    return Math.round(((Number(venda.valor)||0) - (Number(venda.qtd)||0)*p.custoMedio)*100)/100;
  }

  /* ============ VENDAS, EXTRATO FINANCEIRO E PERÍODOS ============ */
  const TIPOS_VENDA = {aves:'Aves', ovos:'Ovos', racao:'Ração', outro:'Outros produtos'};
  const UNIDADES_OVOS = {unidade:1, 'dúzia':12, 'cartão (30)':30};
  function qtdBaseVenda(tipo, qtd, unidade){
    const q = Number(qtd)||0;
    return tipo==='ovos' ? q*(UNIDADES_OVOS[unidade]||1) : q;
  }
  /* Ovos em stock = postos − vendidos − postos a chocar (estimativa: só conta o que registaste). */
  function ovosDisponiveis(ovosLog, vendas, incubacoes, ignorarVendaId){
    const postos = (ovosLog||[]).reduce((s,o)=>s+(Number(o.qtd)||0),0);
    const vendidos = (vendas||[]).filter(v=>v.tipo==='ovos' && !Util.mesmoId(v.id, ignorarVendaId)).reduce((s,v)=>s+(Number(v.qtdBase)||0),0);
    const incubados = (incubacoes||[]).filter(i=>i && (i.ativa || i.concluida)).reduce((s,i)=>s+(Number(i.numOvos)||0),0);
    return {postos, vendidos, incubados, disponiveis: postos - vendidos - incubados};
  }
  /* Junta as vendas registadas em Vendas com as vendas de aves feitas em Gestão. */
  function vendasUnificadas(vendas, saidasAves){
    const lista = (vendas||[]).map(v=>({origem:'venda', id:v.id, data:v.data, tipo:v.tipo, produto:v.produto, qtd:Number(v.qtd)||0, unidade:v.unidade||'', valor:Number(v.valor)||0, cliente:v.cliente||'', notas:v.notas||'', revendaId:v.revendaId||null}));
    (saidasAves||[]).filter(s=>s.motivo==='venda').forEach(s=>{
      lista.push({origem:'aves', id:s.id, data:s.data, tipo:'aves', produto:s.especie, qtd:Number(s.qtd)||0, unidade:'aves', valor:Number(s.valor)||0, cliente:'', notas:''});
    });
    return lista.sort((a,b)=>String(b.data).localeCompare(String(a.data)) || Util.compararRegistos(b, a));
  }
  function dentroDoPeriodo(data, de, ate){
    if(!data) return false;
    if(de && data < de) return false;
    if(ate && data > ate) return false;
    return true;
  }
  function resumoVendas(lista, de, ate){
    const sel = (lista||[]).filter(v=>dentroDoPeriodo(v.data, de, ate));
    const tipos = {}, produtos = {};
    let total = 0;
    sel.forEach(v=>{
      total += v.valor;
      const t = tipos[v.tipo] || (tipos[v.tipo] = {tipo:v.tipo, rotulo:TIPOS_VENDA[v.tipo]||v.tipo, valor:0, n:0});
      t.valor += v.valor; t.n++;
      const k = v.tipo+'|'+chaveProduto(v.produto);
      const p = produtos[k] || (produtos[k] = {tipo:v.tipo, rotulo:TIPOS_VENDA[v.tipo]||v.tipo, produto:v.produto, valor:0, n:0, qtd:0, unidade:v.unidade});
      p.valor += v.valor; p.n++; p.qtd += v.qtd;
      if(p.unidade!==v.unidade) p.unidade = '';
    });
    return {
      linhas: sel.slice().sort((a,b)=>String(a.data).localeCompare(String(b.data)) || Util.compararRegistos(a, b)),
      total, n: sel.length, ticketMedio: sel.length ? total/sel.length : 0,
      porTipo: Object.values(tipos).sort((a,b)=>b.valor-a.valor),
      porProduto: Object.values(produtos).sort((a,b)=>b.valor-a.valor)
    };
  }
  /* Margem estimada de uma venda de ração: valor − kg × custo médio por kg. */
  function margemVendaRacao(venda, produtos){
    const p = (produtos||[]).find(x=>x.chave===chaveProduto(venda.produto));
    if(!p || p.custoMedioKg==null) return null;
    return Math.round(((Number(venda.valor)||0) - (Number(venda.qtdBase!=null ? venda.qtdBase : venda.qtd)||0)*p.custoMedioKg)*100)/100;
  }

  /* Períodos rápidos para os extratos (semana = segunda a domingo). */
  function periodoPreset(nome, hojeISO){
    const hoje = hojeISO || Util.hoje();
    const d0 = new Date(hoje+'T00:00:00');
    const iso = d=>Util.dataISO(d);
    if(nome==='hoje') return {de:hoje, ate:hoje};
    if(nome==='ontem'){ const o = somarDias(hoje,-1); return {de:o, ate:o}; }
    if(nome==='semana'){
      const dif = (d0.getDay()+6)%7;
      const ini = somarDias(hoje, -dif);
      return {de:ini, ate:somarDias(ini, 6)};
    }
    if(nome==='mes'){
      const ini = new Date(d0.getFullYear(), d0.getMonth(), 1), fim = new Date(d0.getFullYear(), d0.getMonth()+1, 0);
      return {de:iso(ini), ate:iso(fim)};
    }
    if(nome==='mes-passado'){
      const ini = new Date(d0.getFullYear(), d0.getMonth()-1, 1), fim = new Date(d0.getFullYear(), d0.getMonth(), 0);
      return {de:iso(ini), ate:iso(fim)};
    }
    if(nome==='7d') return {de:somarDias(hoje,-6), ate:hoje};
    if(nome==='30d') return {de:somarDias(hoje,-29), ate:hoje};
    if(nome==='ano') return {de:`${d0.getFullYear()}-01-01`, ate:`${d0.getFullYear()}-12-31`};
    return {de:'', ate:''};
  }

  /* Extrato financeiro: saldo anterior, movimentos do período com saldo corrido,
     totais e resumo por categoria. Entradas = receitas; saídas = despesas. */
  function extratoFinanceiro(transacoes, de, ate){
    const ord = (transacoes||[]).slice().sort((a,b)=>String(a.data).localeCompare(String(b.data)) || Util.compararRegistos(a, b));
    const sinal = t => (t.tipo==='receita' ? 1 : -1) * (Number(t.valor)||0);
    const saldoAnterior = de ? ord.filter(t=>t.data < de).reduce((s,t)=>s+sinal(t),0) : 0;
    let saldo = saldoAnterior, totalEntradas = 0, totalSaidas = 0;
    const entradasCat = {}, saidasCat = {};
    const linhas = ord.filter(t=>dentroDoPeriodo(t.data, de, ate)).map(t=>{
      const v = Number(t.valor)||0, entrada = t.tipo==='receita';
      saldo += sinal(t);
      if(entrada){ totalEntradas += v; entradasCat[t.categoria||'Sem categoria'] = (entradasCat[t.categoria||'Sem categoria']||0) + v; }
      else { totalSaidas += v; saidasCat[t.categoria||'Sem categoria'] = (saidasCat[t.categoria||'Sem categoria']||0) + v; }
      return {id:t.id, data:t.data, tipo:entrada?'Entrada':'Saída', categoria:t.categoria||'', desc:t.desc||'', entrada:entrada?v:null, saida:entrada?null:v, saldo};
    });
    const porCat = o => Object.entries(o).map(([categoria,valor])=>({categoria, valor})).sort((a,b)=>b.valor-a.valor);
    return {de, ate, saldoAnterior, linhas, totalEntradas, totalSaidas, saldoPeriodo: totalEntradas-totalSaidas, saldoFinal: saldoAnterior + totalEntradas - totalSaidas,
            entradasPorCategoria: porCat(entradasCat), saidasPorCategoria: porCat(saidasCat)};
  }

  /* ============ EXPORTAÇÃO PARA CSV (Excel) ============
     Separador ";" e decimais com vírgula, que é o que o Excel em
     português espera. Células de texto que começariam por = + - @ levam
     um apóstrofo à frente, para o Excel não as executar como fórmulas. */
  function celulaCSV(v){
    if(v==null) return '';
    if(typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
    let s = String(v);
    if(/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if(/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function paraCSV(cabecalhos, linhas){
    return [cabecalhos].concat(linhas).map(l=>l.map(celulaCSV).join(';')).join('\r\n');
  }
  function arredondar2(n){ return Math.round(n*100)/100; }

  /* Devolve a lista de tabelas exportáveis; cada uma tem id, título,
     nome do ficheiro, cabeçalhos e linhas (arrays do mesmo tamanho). */
  function conjuntosCSV(d){
    const compartimentos = d.compartimentos||[], aves = d.aves||[], saidas = d.saidasAves||[];
    const feedStock = d.feedStock||[], consumo = d.consumo||[], ovosLog = d.ovosLog||[];
    const transacoes = d.transacoes||[], incubacoes = d.incubacao||[];
    const saudeLista = d.saude||[], pesagensLista = d.pesagens||[], vendasLista = d.vendas||[], revendaProdutos = d.revenda||[], revendaMovs = d.revendaMov||[];
    const compNome = {}; compartimentos.forEach(c=>{ compNome[c.id]=c.nome; });
    const ordenarPorData = (lista, campo)=>lista.slice().sort((a,b)=>String(a[campo]||'').localeCompare(String(b[campo]||'')));

    const prodsCSV = produtosStock(feedStock, []);
    const prodPorChave = {}; prodsCSV.forEach(p=>{ prodPorChave[p.chave]=p; });
    const prodPorId = {}; prodsCSV.forEach(p=>p.itens.forEach(i=>{ prodPorId[i.id]=p; }));
    const custoConsumo = c=>{
      const p = (c.feedStockId!=null && prodPorId[c.feedStockId]) ? prodPorId[c.feedStockId] : prodPorChave[chaveProduto(c.item)];
      return (p && p.custoMedioKg!=null) ? arredondar2((Number(c.kg)||0)*p.custoMedioKg) : '';
    };

    return [
      {id:'movimentos', titulo:'Movimentos financeiros', ficheiro:'movimentos',
       cabecalhos:['Data','Tipo','Categoria','Descrição','Valor (MT)'],
       linhas:ordenarPorData(transacoes,'data').map(t=>[t.data, t.tipo==='receita'?'Receita':'Despesa', t.categoria, t.desc, Number(t.valor)||0])},
      {id:'plantel', titulo:'Plantel (aves actuais)', ficheiro:'plantel',
       cabecalhos:['Compartimento','Tipo','Raça','Espécie','Quantidade','Machos','Fêmeas','Data de entrada','Finalidade'],
       linhas:aves.map(a=>[compNome[a.compartimentoId]||'', tipoDaEspecie(a.especie), racaDaEspecie(a.especie), a.especie, Number(a.qtd)||0, Number(a.machos)||0, Number(a.femeas)||0, a.dataEntrada, a.finalidade])},
      {id:'saidas', titulo:'Saídas de aves', ficheiro:'saidas-aves',
       cabecalhos:['Data','Compartimento','Espécie','Motivo','Quantidade','Machos','Fêmeas','Valor (MT)'],
       linhas:ordenarPorData(saidas,'data').map(s=>[s.data, compNome[s.compartimentoId]||'', s.especie, motivoLabel(s.motivo), Number(s.qtd)||0, Number(s.machos)||0, Number(s.femeas)||0, Number(s.valor)||0])},
      {id:'consumo', titulo:'Consumo de ração', ficheiro:'consumo-racao',
       cabecalhos:['Data','Produto','Kg','Mistura','Origem','Custo estimado (MT)'],
       linhas:ordenarPorData(consumo,'data').map(c=>[c.data, c.item, Number(c.kg)||0, c.mistura, c.venda ? 'Venda' : c.auto ? ('Automático'+(c.loteNome?' - '+c.loteNome:'')) : 'Manual', custoConsumo(c)])},
      {id:'stock', titulo:'Stock de ração', ficheiro:'stock-racao',
       cabecalhos:['Produto','Kg comprados','Custo total (MT)','Custo médio por kg (MT)','Kg restantes'],
       linhas:produtosStock(feedStock, consumo).map(p=>[p.nome, arredondar2(p.kgComprado), arredondar2(p.custoTotal), p.custoMedioKg!=null ? arredondar2(p.custoMedioKg) : '', arredondar2(p.restante)])},
      {id:'ovos', titulo:'Postura de ovos', ficheiro:'postura-ovos',
       cabecalhos:['Data','Ovos','Ave','Compartimento'],
       linhas:ordenarPorData(ovosLog,'data').map(o=>{
         const ave = o.aveId ? aves.find(a=>Util.mesmoId(a.id, o.aveId)) : null;
         const nomeAve = o.aveId ? (ave ? ave.especie : '(ave removida)') : '(sem fêmea definida)';
         const comp = ave ? (compNome[ave.compartimentoId]||'') : (o.compartimento||'');
         return [o.data, Number(o.qtd)||0, nomeAve, comp];
       })},
      {id:'revenda', titulo:'Inventário de revenda', ficheiro:'inventario-revenda',
       cabecalhos:['Produto','Unidade','Stock','Custo médio (MT)','Valor em stock (MT)','Preço de venda (MT)','Margem unitária (MT)','Qtd vendida','Valor vendido (MT)','Margem registada (MT)','Estado'],
       linhas:stockRevenda(revendaProdutos, revendaMovs).map(p=>[p.nome, p.unidade||'', p.stock, p.custoMedio==null ? '' : arredondar2(p.custoMedio), arredondar2(p.valorStock), p.precoVenda ? Number(p.precoVenda) : '', p.margemUnitaria==null ? '' : p.margemUnitaria, p.vendido, arredondar2(p.valorVendido), p.margemVendida==null ? '' : p.margemVendida, p.ativo===false ? 'Arquivado' : (p.abaixoMinimo ? 'Repor' : 'Ok')])},
      {id:'revenda-mov', titulo:'Movimentos de revenda', ficheiro:'movimentos-revenda',
       cabecalhos:['Data','Produto','Tipo','Quantidade','Valor (MT)','Cliente/Fornecedor','Notas'],
       linhas:ordenarPorData(revendaMovs,'data').map(m=>{
         const p = revendaProdutos.find(x=>Util.mesmoId(x.id, m.produtoId));
         return [m.data, p ? p.nome : '(produto removido)', m.tipo==='compra' ? 'Compra' : m.tipo==='venda' ? 'Venda' : 'Ajuste', Number(m.qtd)||0, m.valor==null ? '' : Number(m.valor)||0, m.pessoa||'', m.notas||''];
       })},
      {id:'vendas', titulo:'Vendas', ficheiro:'vendas',
       cabecalhos:['Data','Tipo','Produto','Quantidade','Unidade','Valor (MT)','Cliente','Notas'],
       linhas:vendasUnificadas(vendasLista, saidas).slice().reverse().map(v=>[v.data, TIPOS_VENDA[v.tipo]||v.tipo, v.produto, v.qtd, v.unidade, v.valor, v.cliente, v.notas])},
      {id:'saude', titulo:'Vacinas e medicação', ficheiro:'saude',
       cabecalhos:['Data','Tipo','Produto','Lote','Estado','Data em que foi feito','Custo (MT)','Repetir (dias)','Retirada (dias)','Notas'],
       linhas:ordenarPorData(saudeLista,'data').map(t=>[t.data, t.tipo, t.produto, t.loteNome||'', t.feito ? 'Feito' : 'Pendente', t.dataFeito||'', t.custo==null ? '' : (Number(t.custo)||0), t.repetirDias ? Number(t.repetirDias) : '', t.retiradaDias ? Number(t.retiradaDias) : '', t.notas||''])},
      {id:'pesagens', titulo:'Pesagens', ficheiro:'pesagens',
       cabecalhos:['Data','Lote','Peso médio (g)','Nº de aves pesadas','Notas'],
       linhas:ordenarPorData(pesagensLista,'data').map(p=>[p.data, p.loteNome||'', Number(p.pesoMedioG)||0, p.amostra||'', p.notas||''])},
      {id:'chocos', titulo:'Chocos e eclosões', ficheiro:'chocos',
       cabecalhos:['Início','Estado','Aves','Compartimento','Ovos','Duração (dias)','Conclusão','Nascidos','Eclosão (%)','Destino dos pintos'],
       linhas:ordenarPorData(incubacoes.filter(i=>i && (i.ativa || i.concluida)),'dataInicio').map(i=>{
         const taxa = i.concluida ? taxaEclosao(i) : null;
         return [i.dataInicio, i.concluida ? 'Concluído' : 'Em curso', (i.aveNomes||[]).join(', '), i.compartimento||'', Number(i.numOvos)||0, Number(i.diasIncubacao)||'', i.dataConclusao||'', i.concluida ? (Number(i.nascidos)||0) : '', taxa==null ? '' : taxa, i.destinoNome||''];
       })}
    ];
  }

  /* ============ INDICADORES DO NEGÓCIO ============
     Tudo calculado só a partir do que foi registado na app. O "saldo do
     período" continua a ser Receitas − Despesas registadas (nunca
     "lucro real", pelas razões explicadas junto a saldo()). */
  function noPeriodo(data, dias){
    if(!data) return false;
    const d = Util.diasEntre(data, Util.hoje());
    return d >= 0 && d < dias;
  }
  function indicadoresNegocio(dados, dias){
    dias = dias || 30;
    const aves = dados.aves||[], saidas = dados.saidasAves||[], feedStock = dados.feedStock||[];
    const consumo = dados.consumo||[], ovosLog = dados.ovosLog||[], transacoes = dados.transacoes||[];
    const incubacoes = dados.incubacao||[];

    const avesAtuais = aves.reduce((s,a)=>s+(Number(a.qtd)||0),0);
    const totalSaidas = saidas.reduce((s,x)=>s+(Number(x.qtd)||0),0);
    const mortas = totalMortas(saidas);
    const baseMortalidade = avesAtuais + totalSaidas; // todas as aves que passaram pelo plantel
    const mortalidadePct = baseMortalidade>0 ? (mortas/baseMortalidade)*100 : null;
    const mortas30 = saidas
      .filter(s=>s.motivo==='morte' && noPeriodo(s.data, dias))
      .reduce((s,x)=>s+(Number(x.qtd)||0),0);

    const prods = produtosStock(feedStock, []);
    const porChave = {}; prods.forEach(p=>{ porChave[p.chave]=p; });
    const porIdProd = {}; prods.forEach(p=>p.itens.forEach(i=>{ porIdProd[i.id]=p; }));
    const custoRacao = consumo.filter(c=>!c.venda && noPeriodo(c.data, dias)).reduce((s,c)=>{
      const p = (c.feedStockId!=null && porIdProd[c.feedStockId]) ? porIdProd[c.feedStockId] : porChave[chaveProduto(c.item)];
      return (p && p.custoMedioKg!=null) ? s + (Number(c.kg)||0)*p.custoMedioKg : s;
    }, 0);
    const ovos = ovosLog.filter(o=>noPeriodo(o.data, dias)).reduce((s,o)=>s+(Number(o.qtd)||0),0);

    const concluidas = incubacoes.filter(i=>i && i.concluida);
    const ovosChocados = concluidas.reduce((s,i)=>s+(Number(i.numOvos)||0),0);
    const nascidos = concluidas.reduce((s,i)=>s+(Number(i.nascidos)||0),0);

    const doPeriodo = transacoes.filter(t=>noPeriodo(t.data, dias));
    return {
      dias, avesAtuais, mortas, mortalidadePct, mortas30,
      custoRacao,
      custoRacaoPorAve: (avesAtuais>0 && custoRacao>0) ? custoRacao/avesAtuais : null,
      ovos,
      custoRacaoPorOvo: (ovos>0 && custoRacao>0) ? custoRacao/ovos : null,
      chocosConcluidos: concluidas.length, ovosChocados, nascidos,
      eclosaoPct: ovosChocados>0 ? (nascidos/ovosChocados)*100 : null,
      receitasPeriodo: totalReceitas(doPeriodo),
      despesasPeriodo: totalDespesas(doPeriodo),
      saldoPeriodo: saldo(doPeriodo)
    };
  }

  /* ============ INCUBAÇÃO ============ */
  function progressoIncubacao(inc){
    if(!inc || !inc.ativa) return {diasIncorridos:0, diasFaltam:0, pct:0, terminou:false};
    const diasIncorridos = Math.max(0, Util.diasEntre(inc.dataInicio, Util.hoje()));
    const duracao = Math.max(1, Number(inc.diasIncubacao) || 35); // nunca 0/NaN
    const diasFaltam = Math.max(0, duracao - diasIncorridos);
    const pct = Math.min(100, (diasIncorridos/duracao)*100);
    const terminou = diasIncorridos >= duracao;
    return {diasIncorridos, diasFaltam, pct, terminou};
  }

  /* ---- Vários chocos ao mesmo tempo ---- */
  function incubacoesAtivas(lista){
    return (lista||[]).filter(i=>i && i.ativa)
      .slice()
      .sort((a,b)=>progressoIncubacao(a).diasFaltam - progressoIncubacao(b).diasFaltam);
  }
  function incubacoesConcluidas(lista){
    return (lista||[]).filter(i=>i && i.concluida)
      .slice()
      .sort((a,b)=>String(b.dataConclusao||'').localeCompare(String(a.dataConclusao||'')));
  }
  function taxaEclosao(inc){
    const ovos = Number(inc && inc.numOvos) || 0;
    if(ovos<=0) return null;
    return Math.round(((Number(inc.nascidos)||0)/ovos)*100);
  }
  /* Id de uma nova incubação. Com ids numéricos (versão antiga da base de
     dados) continua a ser "o maior + 1"; assim que a base usa UUID — ou se
     já existir algum id de texto — devolve um UUID novo. `usarUUID` vem de
     DB.usaUUID. */
  function proximoIdIncubacao(lista, usarUUID){
    const ids = (lista||[]).map(i=>i && i.id).filter(x=>x != null);
    if(usarUUID || ids.some(x=>typeof x === 'string' && !/^\d+$/.test(x))) return Util.novoId();
    return ids.reduce((m,x)=>Math.max(m, Number(x)||0), 0) + 1;
  }

  /* alertas: cobre 5 situações que merecem chamar a atenção assim que
     abres a app — combina o que já existia (stock baixo/esgotado,
     incubação perto do fim) com 3 novas: incubação a terminar amanhã
     em particular (mensagem mais específica/urgente que "faltam X
     dias"), registos de aves com dados em falta, e produção de ovos a
     subir esta semana (um alerta positivo, não só avisos de problema —
     um dashboard só de más notícias também não ajuda a decidir bem). */
  function alertas(feedStock, consumo, inc, aves, ovosLog, planos){
    const alerts = [];
    produtosStock(feedStock, consumo).forEach(p=>{
      const pctRestante = p.kgComprado>0 ? (p.restante/p.kgComprado)*100 : 0;
      const temRitmoDoPlano = planos && consumoPlaneadoDiarioKg(p.nome, aves, planos) > 0; // nesse caso quem avisa é o alerta de compra
      if(pctRestante <= 15 && p.restante>0 && !temRitmoDoPlano) alerts.push({tipo:'aviso', texto:`${Icon.svg('aviso')} Stock de "${Util.escapeHTML(p.nome)}" baixo: só restam ${p.restante.toFixed(1)}kg.`});
      if(p.excedente>0) alerts.push({tipo:'perigo', texto:`${Icon.svg('perigo')} Consumo de "${Util.escapeHTML(p.nome)}" registado acima do stock comprado (+${p.excedente.toFixed(1)}kg) — regista a compra em falta ou corrige os consumos.`});
      else if(p.restante<=0) alerts.push({tipo:'perigo', texto:`${Icon.svg('perigo')} Stock de "${Util.escapeHTML(p.nome)}" esgotado.`});
    });
    const listaInc = Array.isArray(inc) ? inc : (inc ? [inc] : []);
    incubacoesAtivas(listaInc).forEach(i=>{
      const {diasIncorridos, diasFaltam} = progressoIncubacao(i);
      const duracao = Math.max(1, Number(i.diasIncubacao) || 35);
      const nomes = (i.aveNomes && i.aveNomes.length) ? ` de ${i.aveNomes.map(n=>Util.escapeHTML(n)).join(', ')}` : '';
      if(diasIncorridos >= duracao) alerts.push({tipo:'perigo', texto:`${Icon.svg('ovo')} O período de incubação${nomes} (${duracao} dias) já se completou — verifica os ovos e regista a eclosão em Produção.`});
      else if(diasFaltam === 1) alerts.push({tipo:'aviso', texto:`${Icon.svg('ovo')} Incubação${nomes} termina amanhã — prepara a área de aquecimento para os pintos.`});
      else if(diasFaltam <= 3) alerts.push({tipo:'aviso', texto:`${Icon.svg('ovo')} Faltam ${diasFaltam} dias para a eclosão prevista${nomes}.`});
    });
    if(aves && aves.length){
      const incompletos = aves.filter(a=>!a.dataEntrada || !a.finalidade || a.finalidade==='—').length;
      if(incompletos>0) alerts.push({tipo:'info', texto:`${Icon.svg('lista')} ${incompletos} registo${incompletos>1?'s':''} de ave incompleto${incompletos>1?'s':''} (sem data de entrada e/ou finalidade) — corrige em Gestão para a idade e previsões ficarem certas.`});
    }
    if(ovosLog){
      const prod = producaoSemana(ovosLog);
      if(prod.anterior>0 && prod.total>prod.anterior){
        const variacao = Math.round(((prod.total-prod.anterior)/prod.anterior)*100);
        alerts.push({tipo:'bom', texto:`${Icon.svg('subida')} Produção de ovos aumentou ${variacao}% esta semana (${prod.total} vs ${prod.anterior} na semana anterior).`});
      }
    }
    return alerts;
  }

  /* ============ TENDÊNCIAS DO DASHBOARD (Início) ============
     Cada uma responde a "como está X neste momento, e para que lado
     está a ir" — é a diferença entre um número solto e um número com
     contexto suficiente para ajudar a decidir algo. */

  /* Plantel: total actual + variação líquida nos últimos 7 dias
     (entradas por data de entrada, menos saídas registadas). */
  function tendenciaPlantel(aves, saidasAves){
    const total = aves.reduce((s,a)=>s+Number(a.qtd),0);
    const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate()-7);
    const limiteISO = Util.dataISO(seteDiasAtras);
    const entradas = aves.filter(a=>a.dataEntrada && a.dataEntrada>=limiteISO).reduce((s,a)=>s+Number(a.qtd),0);
    const saidas = (saidasAves||[]).filter(s=>s.data && s.data>=limiteISO).reduce((s,x)=>s+Number(x.qtd),0);
    return {total, variacao: entradas-saidas};
  }

  /* Finanças: saldo do mês actual comparado com o mês anterior. Se o
     mês anterior tiver saldo zero, a variação percentual não faz
     sentido matemático — devolve null nesse caso, e quem desenha o
     dashboard decide como mostrar isso (ex: omitir a tendência). */
  function tendenciaFinanceira(transacoes){
    const doisUltimos = ultimosMesesGrafico(transacoes.map(t=>t), 2);
    const anterior = doisUltimos[0] ? doisUltimos[0].saldo : 0;
    const atual = doisUltimos[1] ? doisUltimos[1].saldo : 0;
    const variacaoPct = anterior!==0 ? ((atual-anterior)/Math.abs(anterior))*100 : null;
    return {saldoAtual:atual, saldoAnterior:anterior, variacaoPct};
  }

  /* Produção: ovos desta semana (últimos 7 dias) vs semana anterior
     (dias 8–14), e a média diária desta semana. */
  function producaoSemana(ovosLog){
    const hoje = new Date();
    const seteDiasAtras = new Date(hoje); seteDiasAtras.setDate(seteDiasAtras.getDate()-7);
    const catorzeDiasAtras = new Date(hoje); catorzeDiasAtras.setDate(catorzeDiasAtras.getDate()-14);
    const seteISO = Util.dataISO(seteDiasAtras), catorzeISO = Util.dataISO(catorzeDiasAtras);
    const total = ovosLog.filter(o=>o.data && o.data>=seteISO).reduce((s,o)=>s+Number(o.qtd),0);
    const anterior = ovosLog.filter(o=>o.data && o.data>=catorzeISO && o.data<seteISO).reduce((s,o)=>s+Number(o.qtd),0);
    return {total, mediaDiaria: total/7, anterior};
  }

  /* ============ PREVISÃO DE INÍCIO DE REPRODUÇÃO ============
     Estimativa simples por espécie, a partir da data de entrada. Só se
     aplica a aves cuja finalidade indique "reprodução". */
  const PALAVRAS_REPRODUCAO = ['reprodu', 'matriz', 'reprodutor', 'reprodutora'];
  function ehFinalidadeReproducao(finalidadeTexto){
    const t = Util.normalizarTexto(finalidadeTexto);
    if(!t) return false;
    return PALAVRAS_REPRODUCAO.some(p=>t.includes(p));
  }
  function maturidadeDiasEspecie(especieTexto){
    const t = Util.normalizarTexto(especieTexto);
    if(t.includes('pato')||t.includes('pata')||t.includes('muscovy')||t.includes('marreco')||t.includes('pequim')) return 180; // ≈ 6 meses
    if(t.includes('galinha')||t.includes('galo')||t.includes('frango')||t.includes('boschveld')||t.includes('brahma')||t.includes('koekoek')||t.includes('caipira')) return 150; // ≈ 5 meses
    return 165;
  }
  function previsaoReproducao(ave){
    if(!ave.dataEntrada || !ehFinalidadeReproducao(ave.finalidade)) return null;
    const maturidade = maturidadeDiasEspecie(ave.especie);
    const diasVividos = Math.max(0, Util.diasEntre(ave.dataEntrada, Util.hoje()));
    const dataPrevista = new Date(ave.dataEntrada);
    dataPrevista.setDate(dataPrevista.getDate()+maturidade);
    return {
      maturidade, diasVividos,
      diasFaltam: Math.max(0, maturidade - diasVividos),
      emIdade: diasVividos >= maturidade,
      dataPrevista: Util.dataISO(dataPrevista)
    };
  }

  /* ============ POSTURA DE OVOS AGRUPADA POR FÊMEA/GRUPO ============ */
  function posturaPorAve(ovosLog, aves, compartimentos){
    const compNome = {};
    compartimentos.forEach(c=>{ compNome[c.id]=c.nome; });
    const totais = {};
    ovosLog.forEach(o=>{
      const chave = o.aveId ? `ave:${o.aveId}` : `legado:${o.compartimento||'—'}`;
      totais[chave] = (totais[chave]||0) + Number(o.qtd);
    });
    return Object.entries(totais).map(([chave,total])=>{
      if(chave.startsWith('legado:')){
        return {label:`${Util.escapeHTML(chave.replace('legado:',''))} (sem fêmea definida)`, total};
      }
      const id = Number(chave.replace('ave:',''));
      const ave = aves.find(a=>Util.mesmoId(a.id, id));
      if(!ave) return {label:`Registo antigo #${id}`, total};
      return {label:`${Util.escapeHTML(ave.especie)} — ${Util.escapeHTML(compNome[ave.compartimentoId]||'—')}`, total};
    }).sort((a,b)=>b.total-a.total);
  }

  /* ============ ORDENAÇÃO NUMÉRICA DE COMPARTIMENTOS ============
     "Compartimento 2" deve vir antes de "Compartimento 10" — por isso
     ordena-se pelo número encontrado no nome, não por ordem alfabética
     (que colocaria "10" antes de "2"). */
  function ordenarCompartimentos(compartimentos){
    return compartimentos.slice().sort((a,b)=>{
      const na = parseInt((a.nome||'').match(/\d+/)?.[0] ?? '999999', 10);
      const nb = parseInt((b.nome||'').match(/\d+/)?.[0] ?? '999999', 10);
      if(na!==nb) return na-nb;
      return (a.nome||'').localeCompare(b.nome||'');
    });
  }

  const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  function formatarMes(chaveAnoMes){
    const [ano,mes] = chaveAnoMes.split('-');
    return `${MESES_PT[Number(mes)-1]||mes} ${ano}`;
  }
  function resumoPorMes(transacoes){
    const porMes = {};
    transacoes.forEach(t=>{
      if(!t.data) return;
      const chave = t.data.slice(0,7);
      if(!porMes[chave]) porMes[chave] = {despesas:0, receitas:0};
      if(t.tipo==='despesa') porMes[chave].despesas += Number(t.valor);
      else porMes[chave].receitas += Number(t.valor);
    });
    return Object.entries(porMes)
      .sort((a,b)=>b[0].localeCompare(a[0]))
      .map(([chave,v])=>({chave, label:formatarMes(chave), despesas:v.despesas, receitas:v.receitas, saldo:v.receitas-v.despesas}));
  }

  /* ultimosMesesGrafico: ao contrário de resumoPorMes (que só lista
     meses que TÊM movimentos, para a tabela), esta função é para os
     GRÁFICOS — devolve sempre exactamente N meses, em ordem
     cronológica (mais antigo → mais recente), preenchendo com zero os
     meses sem nenhum movimento. Corrige dois problemas:
     1. Com pouquíssimos dados, o gráfico deixa de mostrar uma única
        barra gigante sem contexto.
     2. Em contas com MAIS de N meses de histórico, mostra sempre os N
        meses mais RECENTES, nunca os mais antigos por engano. */
  function ultimosMesesGrafico(transacoes, n){
    n = n || 6;
    const porMes = {};
    transacoes.forEach(t=>{
      if(!t.data) return;
      const chave = t.data.slice(0,7);
      if(!porMes[chave]) porMes[chave] = {despesas:0, receitas:0};
      if(t.tipo==='despesa') porMes[chave].despesas += Number(t.valor);
      else porMes[chave].receitas += Number(t.valor);
    });
    const chaves = Object.keys(porMes).sort();
    const chaveMaisRecente = chaves.length ? chaves[chaves.length-1] : Util.hoje().slice(0,7);
    const [anoBase, mesBase] = chaveMaisRecente.split('-').map(Number);
    const meses = [];
    for(let i=n-1; i>=0; i--){
      const d = new Date(anoBase, mesBase-1-i, 1);
      const chave = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const v = porMes[chave] || {despesas:0, receitas:0};
      meses.push({chave, label:formatarMes(chave), despesas:v.despesas, receitas:v.receitas, saldo:v.receitas-v.despesas});
    }
    return meses;
  }

  /* Equivalente a ultimosMesesGrafico, mas para postura de ovos — usada
     pelo gráfico "Evolução mensal" da Produção em Relatórios. Sem isto,
     com poucos meses de dados (ex: só 1), a única barra ocupava o
     espaço todo do gráfico, parecendo um bloco sólido em vez de um
     gráfico com barras distintas. */
  function producaoEvolucaoGrafico(ovosLog, n){
    n = n || 6;
    const porMes = {};
    ovosLog.forEach(o=>{
      if(!o.data) return;
      const chave = o.data.slice(0,7);
      porMes[chave] = (porMes[chave]||0) + Number(o.qtd);
    });
    const chaves = Object.keys(porMes).sort();
    const chaveMaisRecente = chaves.length ? chaves[chaves.length-1] : Util.hoje().slice(0,7);
    const [anoBase, mesBase] = chaveMaisRecente.split('-').map(Number);
    const meses = [];
    for(let i=n-1; i>=0; i--){
      const d = new Date(anoBase, mesBase-1-i, 1);
      const chave = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      meses.push({chave, label:formatarMes(chave), total: porMes[chave]||0});
    }
    return meses;
  }

  /* Helper privado (não exportado): soma um campo numérico de uma lista
     de registos com campo "data" (AAAA-MM-DD), só dos últimos N dias. */
  function _somaUltimosDias(registos, dias, campo){
    const limite = new Date(); limite.setDate(limite.getDate()-dias);
    const limiteISO = Util.dataISO(limite);
    return registos.filter(r=>r.data && r.data>=limiteISO).reduce((s,r)=>s+Number(r[campo]||0),0);
  }

  /* ============ RELATÓRIOS ============
     Cada função agrega dados já existentes noutras partes da app — não
     inventam números novos, só juntam o que já lá está numa vista mais
     completa. Onde a definição de uma métrica pode ser discutível (ex:
     "rentabilidade"), o nome deixa claro que é uma ESTIMATIVA e a
     página de relatórios explica a fórmula usada. */

  /* Relatório de Plantel. A "evolução mensal" é uma aproximação
     honesta, não um livro de registo completo: as entradas são
     contadas a partir da data de entrada das aves AINDA no plantel
     (não existe um histórico de entradas já removidas), enquanto as
     saídas (vendas/abates/mortes) vêm do histórico completo de
     saídas, esse sim um registo append-only fiável. */
  function relatorioPlantel(aves, saidasAves){
    const totalAtual = aves.reduce((s,a)=>s+Number(a.qtd),0);
    const vendas = totalVendidas(saidasAves);
    const abates = totalAbatidas(saidasAves);
    const mortes = totalMortas(saidasAves);
    const universo = totalAtual + vendas + abates + mortes;
    const taxaMortalidade = universo>0 ? (mortes/universo)*100 : 0;

    const porMes = {};
    const mesDe = d => d ? d.slice(0,7) : null;
    aves.forEach(a=>{
      const m = mesDe(a.dataEntrada);
      if(!m) return;
      if(!porMes[m]) porMes[m] = {entradas:0, vendas:0, abates:0, mortes:0};
      porMes[m].entradas += Number(a.qtd);
    });
    saidasAves.forEach(s=>{
      const m = mesDe(s.data);
      if(!m) return;
      if(!porMes[m]) porMes[m] = {entradas:0, vendas:0, abates:0, mortes:0};
      if(s.motivo==='venda') porMes[m].vendas += Number(s.qtd);
      else if(s.motivo==='abate') porMes[m].abates += Number(s.qtd);
      else if(s.motivo==='morte') porMes[m].mortes += Number(s.qtd);
    });
    const evolucaoMensal = Object.entries(porMes)
      .sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([chave,v])=>({chave, label:formatarMes(chave), ...v}));

    return {totalAtual, vendas, abates, mortes, taxaMortalidade, evolucaoMensal};
  }

  /* Relatório de Alimentação. */
  function relatorioAlimentacao(feedStock, consumo, aves){
    const stockKg = produtosStock(feedStock, consumo).reduce((s,p)=>s+p.restante,0);
    consumo = (consumo||[]).filter(c=>!c.venda); // a partir daqui só o consumo real
    const consumoDiario = consumoDiarioEstimado(consumo);
    const consumoSemanal = _somaUltimosDias(consumo, 7, 'kg');
    const consumoMensal = _somaUltimosDias(consumo, 30, 'kg');
    const custoTotalComprado = feedStock.reduce((s,i)=>s+Number(i.custoTotal||0),0);
    const kgTotalComprado = feedStock.reduce((s,i)=>s+Number(i.kgComprado||0),0);
    const custoMedioPorKg = kgTotalComprado>0 ? custoTotalComprado/kgTotalComprado : 0;
    const totalAvesAtual = aves.reduce((s,a)=>s+Number(a.qtd),0);
    const consumoMedioPorAveDia = totalAvesAtual>0 ? consumoDiario/totalAvesAtual : 0;
    let diasAteEsgotar = null, previsaoEsgotamentoData = null;
    if(consumoDiario>0){
      diasAteEsgotar = Math.floor(stockKg/consumoDiario);
      const d = new Date(); d.setDate(d.getDate()+diasAteEsgotar);
      previsaoEsgotamentoData = Util.dataISO(d);
    }
    return {stockKg, consumoDiario, consumoSemanal, consumoMensal, custoTotalComprado, custoMedioPorKg, consumoMedioPorAveDia, diasAteEsgotar, previsaoEsgotamentoData};
  }

  /* Relatório de Produção. */
  function relatorioProducao(ovosLog, aves){
    const semana = producaoSemana(ovosLog);
    const ovosMes = _somaUltimosDias(ovosLog, 30, 'qtd');
    const totalFemeas = aves.reduce((s,a)=>s+Number(a.femeas||0),0);
    const mediaPorFemeaSemana = totalFemeas>0 ? semana.total/totalFemeas : 0;

    const porMes = {};
    ovosLog.forEach(o=>{
      if(!o.data) return;
      const m = o.data.slice(0,7);
      porMes[m] = (porMes[m]||0) + Number(o.qtd);
    });
    const evolucaoMensal = Object.entries(porMes)
      .sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([chave,total])=>({chave, label:formatarMes(chave), total}));

    return {ovosDia: semana.mediaDiaria, ovosSemana: semana.total, ovosMes, mediaPorFemeaSemana, totalFemeas, evolucaoMensal};
  }

  /* Relatório Financeiro. "rentabilidadeEstimada" é uma margem simples
     (Saldo acumulado ÷ Receitas totais × 100) — uma estimativa
     declarada como tal, não uma contabilidade de lucro real (ver
     Calc.saldo acima para as mesmas ressalvas: não desconta
     mortalidade, mão-de-obra própria, depreciação, etc.). Devolve null
     quando não há receitas registadas, para não dividir por zero nem
     mostrar uma percentagem sem sentido. */
  function relatorioFinanceiro(transacoes){
    const receitas = totalReceitas(transacoes);
    const despesas = totalDespesas(transacoes);
    const saldoAtual = saldo(transacoes);
    const porCategoria = despesasPorCategoria(transacoes);
    const evolucaoMensal = resumoPorMes(transacoes);
    const rentabilidadeEstimada = receitas>0 ? (saldoAtual/receitas)*100 : null;
    return {receitas, despesas, saldo:saldoAtual, porCategoria, evolucaoMensal, rentabilidadeEstimada};
  }

  return {
    stockAtual, consumoExcedente, custoPorKg, indicadoresNegocio, noPeriodo, produtosStock, planoDaEspecie, planoDoLote, idadeLoteEm, faseNaIdade, consumoDiarioLote, gerarConsumoAutomatico, fasesSobrepoem, stockRevenda, alertasRevenda, margemVendaRevenda, TIPOS_VENDA, UNIDADES_OVOS, qtdBaseVenda, ovosDisponiveis, vendasUnificadas, resumoVendas, margemVendaRacao, periodoPreset, extratoFinanceiro, tipoDaEspecie, racaDaEspecie, RACAS_SUGERIDAS, resumoPorTipo, chaveRaca, racasParecidas, formatarNomeRaca, nomeGrupo, prefixoDoNome, separarBaseVariante, racaExistenteParecida, duplicadosDeRacas, planoEfetivoDaEspecie, MODELOS_PLANO, alertasCompra, alertasPostura, alertasMortalidade, previsaoCaixa, alertaCaixa, conversaoAlimentarPorLote, chaveAlerta, reunirAlertas, custoRacaoPorLote, estadoTarefaSaude, tarefasSaudePendentes, alertasSaude, proximaTarefaSaude, retiradasAtivas, alertasRetirada, evolucaoPeso, previsaoConsumo, alertasFases, consumoPlaneadoDiarioKg, chaveProduto, paraCSV, celulaCSV, conjuntosCSV,
    totalDespesas, totalReceitas, saldo, despesasPorCategoria,
    consumoDiarioEstimado,
    idade, idadeExibicao,
    motivoLabel, totalVendidas, totalAbatidas, totalMortas,
    progressoIncubacao, incubacoesAtivas, incubacoesConcluidas, taxaEclosao, proximoIdIncubacao, alertas,
    tendenciaPlantel, tendenciaFinanceira, producaoSemana,
    ehFinalidadeReproducao, maturidadeDiasEspecie, previsaoReproducao,
    posturaPorAve, ordenarCompartimentos,
    MESES_PT, formatarMes, resumoPorMes, ultimosMesesGrafico, producaoEvolucaoGrafico,
    relatorioPlantel, relatorioAlimentacao, relatorioProducao, relatorioFinanceiro
  };
})();

/* ============ EXPORT OPCIONAL PARA NODE (testes automatizados) ============
   No navegador, `module` não existe, por isso este bloco nunca corre e não
   tem qualquer efeito na app. Em Node (usado só por tests/calc.test.js),
   permite fazer `require('../js/calc.js')` directamente. */
if(typeof module !== 'undefined' && module.exports){
  module.exports = { Util, Validacao, Calc };
}
