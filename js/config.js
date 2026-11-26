/* ============================================================
   config.js — o ÚNICO sítio onde se define:
     • a versão da app (APP_VERSAO)
     • a lista de páginas (PAGINAS) e os seus grupos (GRUPOS_PAGINAS)
     • que scripts cada página carrega

   É lido por três "clientes", por isso uma alteração aqui aparece em todos:
     1. as páginas .html (carregarEstilo / carregarScripts, mais abaixo)
     2. o menu e a barra inferior (UI.renderChrome, em common.js)
        e os cartões de index.js
     3. o service worker (sw.js), que o importa para saber o que guardar
        em cache e como se chama a cache.

   Para lançar uma versão nova: muda APP_VERSAO e mais nada.
   Para acrescentar uma página: acrescenta uma entrada a PAGINAS, cria o
   seu .html (copia um existente e muda o id) e o seu js/<id>.js.
   ============================================================ */
const APP_VERSAO = '2.19.0';

const GRUPOS_PAGINAS = [
  {id:'resumo',     titulo:'Visão geral'},
  {id:'exploracao', titulo:'Exploração'},
  {id:'stock',      titulo:'Stock'},
  {id:'dinheiro',   titulo:'Dinheiro'},
  {id:'sistema',    titulo:'Sistema'}
];

/* restrita:true → página só para administradores (o trabalhador não a vê no menu nem a abre). Os
   dados dessas páginas (transacoes, vendas, revenda, revendaMov) também não chegam ao aparelho do
   trabalhador: o servidor não os envia (servidor/04-papeis-e-convites.sql).
   principal:true → aparece na barra inferior do telemóvel (os outros ficam
   em "Mais"). rotulo: nome curto para cartões e barra (omite-se se for igual
   ao título). scripts: o que a página carrega além da base (SCRIPTS_BASE). */
const PAGINAS = [
  {id:'inicio',      ficheiro:'inicio.html',      titulo:'Início',                rotulo:'Início',   curto:'Resumo',     descricao:'Totais gerais, choco em curso, alertas e backup',          icone:'casa',     grupo:'resumo',     principal:true, scripts:['inicio']},
  {id:'gestao',      ficheiro:'gestao.html',      titulo:'Gestão',                curto:'Plantel',    descricao:'Compartimentos, aves e registo de saídas',                icone:'galinha',  grupo:'exploracao', principal:true, scripts:['gestao']},
  {id:'producao',    ficheiro:'producao.html',    titulo:'Produção & Incubação',  rotulo:'Produção', curto:'Incubação',  descricao:'Choco activo e postura de ovos',                           icone:'ovo',      grupo:'exploracao', scripts:['producao']},
  {id:'saude',       ficheiro:'saude.html',       titulo:'Saúde & Crescimento',   rotulo:'Saúde',    curto:'Crescimento',descricao:'Vacinas, medicação e pesagens',                            icone:'saude',    grupo:'exploracao', scripts:['saude']},
  {id:'alimentacao', ficheiro:'alimentacao.html', titulo:'Alimentação',           curto:'Ração',      descricao:'Stock, misturas e consumo diário',                        icone:'trigo',    grupo:'stock',      principal:true, scripts:['alimentacao']},
  {id:'revenda',     ficheiro:'revenda.html',     titulo:'Revenda',               curto:'Inventário', descricao:'Compras, stock e margem dos produtos que revendes',        icone:'caixa',    grupo:'stock',      restrita:true, scripts:['pdf','revenda']},
  {id:'vendas',      ficheiro:'vendas.html',      titulo:'Vendas',                curto:'Saídas',     descricao:'Aves, ovos, ração e outros produtos',                      icone:'carrinho', grupo:'dinheiro',   restrita:true, scripts:['pdf','vendas']},
  {id:'financas',    ficheiro:'financas.html',    titulo:'Finanças',              curto:'Contas',     descricao:'Despesas, receitas e saldo',                               icone:'carteira', grupo:'dinheiro',   principal:true, restrita:true, scripts:['pdf','financas']},
  {id:'relatorios',  ficheiro:'relatorios.html',  titulo:'Relatórios',            curto:'Evolução',   descricao:'Plantel, alimentação, produção e finanças',                icone:'lista',    grupo:'dinheiro',   restrita:true, scripts:['relatorios']},
  {id:'servidor',    ficheiro:'servidor.html',    titulo:'Servidor',              curto:'Ligação',    descricao:'Usar a app em vários aparelhos',                           icone:'servidor', grupo:'sistema',    scripts:['ligacao']},
  {id:'ficheiros',   ficheiro:'ficheiros.html',   titulo:'Ficheiros',             curto:'Arquivo',   descricao:'Documentos e imagens guardados na Netlify',                 icone:'caixa',    grupo:'sistema',    scripts:['ficheiros']}
];

/* Scripts que TODAS as páginas carregam, por esta ordem. */
const SCRIPTS_BASE = ['db','icons','calc','common','tabela','select','servidor','sync'];

/* O menu principal (index.html) não é uma entrada de PAGINAS: é o "mapa". */
const PAGINA_INDEX = {id:'index', ficheiro:'index.html', scripts:['index']};

/* Chamadas pelos .html — escrevem as <link>/<script> com ?v=APP_VERSAO,
   para o navegador nunca usar uma cópia antiga depois de uma actualização. */
function carregarEstilo(){
  document.write('<link rel="stylesheet" href="css/style.css?v=' + APP_VERSAO + '">');
}
function carregarScripts(id){
  const p = id === 'index' ? PAGINA_INDEX : PAGINAS.find(x => x.id === id);
  const nomes = SCRIPTS_BASE.concat(p ? p.scripts : []);
  /* Uma única escrita, para os scripts ficarem garantidamente por esta ordem. */
  document.write(nomes.map(n => '<script src="js/' + n + '.js?v=' + APP_VERSAO + '"><\/script>').join(''));
}

/* Revisão mínima de cada ficheiro JS. Cada ficheiro diz de que versão é (a linha "@revisao" no
   topo) e, ao abrir uma página, a app compara com esta lista: se algum ficheiro for mais antigo
   do que aqui se exige (por exemplo, um gestao.js que ficou da instalação anterior), aparece um
   aviso a dizer QUAL é, em vez de falhas estranhas. Ao alterar um ficheiro, sobe a sua revisão
   no próprio ficheiro e aqui. */
const REVISOES = {
  alimentacao: '2.18.0',
  calc       : '2.15.1',
  common     : '2.18.0',
  db         : '2.18.0',
  financas   : '2.15.1',
  ficheiros  : '2.19.0',
  gestao     : '2.18.0',
  icons      : '2.15.1',
  index      : '2.18.0',
  inicio     : '2.18.0',
  ligacao    : '2.18.0',
  pdf        : '2.15.1',
  producao   : '2.15.1',
  relatorios : '2.15.1',
  revenda    : '2.15.1',
  saude      : '2.18.0',
  select     : '2.15.1',
  servidor   : '2.18.0',
  sync       : '2.18.0',
  tabela     : '2.15.1',
  vendas     : '2.15.1'
};
