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

  function toast(msg){
    let t = document.getElementById('toast');
    if(!t){ t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(()=>t.classList.remove('show'), 2400);
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

  return { dataISO, hoje, moeda, escapeHTML, diasEntre, toast, normalizarTexto };
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
      .filter(c => c.feedStockId!=null ? c.feedStockId===item.id : c.item===item.nome)
      .reduce((s,c)=>s+Number(c.kg),0);
    return Math.max(0, item.kgComprado - usado);
  }
  function consumoExcedente(item, consumo){
    const usado = consumo
      .filter(c => c.feedStockId!=null ? c.feedStockId===item.id : c.item===item.nome)
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
  function proximoIdIncubacao(lista){
    return (lista||[]).reduce((m,i)=>Math.max(m, Number(i && i.id)||0), 0) + 1;
  }

  /* alertas: cobre 5 situações que merecem chamar a atenção assim que
     abres a app — combina o que já existia (stock baixo/esgotado,
     incubação perto do fim) com 3 novas: incubação a terminar amanhã
     em particular (mensagem mais específica/urgente que "faltam X
     dias"), registos de aves com dados em falta, e produção de ovos a
     subir esta semana (um alerta positivo, não só avisos de problema —
     um dashboard só de más notícias também não ajuda a decidir bem). */
  function alertas(feedStock, consumo, inc, aves, ovosLog){
    const alerts = [];
    feedStock.forEach(item=>{
      const restante = stockAtual(item, consumo);
      const pctRestante = item.kgComprado>0 ? (restante/item.kgComprado)*100 : 0;
      if(pctRestante <= 15 && restante>0) alerts.push({tipo:'aviso', texto:`${Icon.svg('aviso')} Stock de "${Util.escapeHTML(item.nome)}" baixo: só restam ${restante.toFixed(1)}kg.`});
      const excedente = consumoExcedente(item, consumo);
      if(excedente>0) alerts.push({tipo:'perigo', texto:`${Icon.svg('perigo')} Consumo de "${Util.escapeHTML(item.nome)}" registado acima do stock comprado (+${excedente.toFixed(1)}kg) — confirma as compras ou corrige os consumos.`});
      else if(restante<=0) alerts.push({tipo:'perigo', texto:`${Icon.svg('perigo')} Stock de "${Util.escapeHTML(item.nome)}" esgotado.`});
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
      const ave = aves.find(a=>a.id===id);
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
    const stockKg = feedStock.reduce((s,i)=>s+stockAtual(i,consumo),0);
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
    stockAtual, consumoExcedente, custoPorKg,
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
