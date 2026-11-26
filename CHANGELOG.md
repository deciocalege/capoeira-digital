# Histórico de alterações

## 2.19.0 — Integração parcial Netlify
- Adicionada a página Ficheiros com Netlify Blobs e permissões verificadas no Supabase.
- Administrador pode carregar e eliminar; trabalhador pode consultar e descarregar.
- Adicionadas Netlify Functions, configuração de deploy e guia de ativação do Netlify Web Analytics.
- Mantidos Supabase Auth, papéis, PostgreSQL e sincronização para não comprometer os dados existentes.


Este ficheiro regista as alterações mais importantes feitas à app, para
conseguires confirmar rapidamente se estás a usar a versão mais
recente e o que mudou desde a última vez que a actualizaste no
telemóvel. O número da versão também aparece no rodapé de todas as
páginas da app.

## v2.18.0 — Fase 4 do plano: papéis (administrador / trabalhador) e convite do segundo utilizador

- **Convidar sem enviar emails.** O administrador escreve o email e o papel e recebe um **código** (`7F3A-91C2-0BDE`) para dar à pessoa; ela entra com esse email, escreve o código em "Tenho um convite" (ou abre o link) e fica com acesso. O código só funciona com o email convidado, vale 7 dias e usa-se uma vez.
- **Página Servidor › Pessoas com acesso**: lista de quem tem acesso; o administrador muda papéis, retira pessoas, vê e cancela convites. Qualquer pessoa pode sair da criação. Uma criação nunca fica sem administrador.
- **Trabalhador**: faz os registos do dia a dia (aves, ovos, consumo de ração, saúde, produção, saídas por abate ou morte) mas **não vê nem recebe finanças, vendas, revenda nem relatórios**. O menu, a barra inferior e o menu principal escondem essas páginas; Início não mostra o saldo, o panorama financeiro nem o gasto extra; Gestão não oferece "Venda"; Saúde não pede custos; Alimentação não regista compras. Se abrir uma dessas páginas pelo endereço, vê "Só para administradores".
- **Imposto pelo servidor** (`servidor/04-papeis-e-convites.sql`): as regras de acesso aos registos passam a olhar para o papel; o trabalhador não recebe esses dados nem os consegue gravar (o que tentar enviar dessas tabelas é ignorado, sem partir a sincronização). O acesso directo à tabela de membros fica fechado: só se mexe nas pessoas pelas funções do servidor.
- **Sincronização com papéis**: o aparelho do trabalhador não envia nem recebe as tabelas restritas; se alguém passa a administrador, passa a receber o que ainda não via; se um administrador passa a trabalhador, as finanças saem do aparelho. A app confirma o papel no servidor de 5 em 5 minutos e avisa se já não pertences à criação.
- Testes: `tests/servidor.test.js` (30), `tests/sync.test.js` (29, com papéis) e `tests/papeis-e-convites.sql` (num PostgreSQL à parte: convites, papéis, finanças fechadas ao trabalhador, nunca sem administrador, escrita directa recusada).
- Correcção de um teste do `calc` que dependia da data de hoje (consumo de ração nos últimos 30 dias).

## v2.17.0 — Fase 3 do plano: sincronização entre aparelhos

**O que registas no telemóvel passa a aparecer no computador (e vice-versa).**

- Novo `js/sync.js`: envia para o servidor tudo o que mudou neste aparelho e recebe o que mudou nos outros. Funciona sem internet (as alterações ficam guardadas e seguem quando a ligação volta). Corre sozinho: ao abrir a app, quando volta a haver internet, ao voltar à app, poucos segundos depois de gravares e de minuto a minuto; há também "Sincronizar agora".
- **O mais recente ganha.** Se dois aparelhos alteraram o mesmo registo, fica a alteração mais recente; uma antiga nunca apaga uma nova. Cada alteração local tem sempre uma data posterior à de qualquer registo que o aparelho já viu, mesmo com o relógio atrasado ou no mesmo milissegundo. A app avisa se o relógio de um aparelho estiver desacertado.
- **Apagar sincroniza** (o registo fica marcado como apagado no servidor).
- Novo `servidor/03-sincronizacao.sql` (correr uma vez no Supabase): funções `enviar_registos`, `receber_registos` e `resumo_granja`; só aceitam registos mais recentes, limitam datas do futuro a +5 minutos, paginam sem perder registos e só deixam usar a criação a quem pertence a ela. Testado num PostgreSQL à parte (`tests/sincronizacao.sql`).
- Página **Servidor**: painel da sincronização (ligar, estado, última sincronização, alterações por enviar, "Sincronizar agora", desligar). Ao ligar, a app mostra o que há neste aparelho e no servidor e propõe como começar: enviar, trazer, juntar ou substituir.
- **Indicador no cabeçalho** (verde, amarelo, cinzento, vermelho) em todas as páginas quando a sincronização está ligada; quando chegam dados de outro aparelho a página redesenha-se sozinha (se estiveres a escrever, avisa em vez de interromper).
- `db.js`: leitura do que mudou, aplicação de registos do servidor, carimbos sempre crescentes. O `servidor.js` passa a carregar em todas as páginas.
- Testes: `tests/sync.test.js` (25: dois aparelhos e um servidor falso — conflitos, sem internet, lotes grandes, "juntar", "substituir"…) e `db.test.js` (29).

## v2.16.0 — Fase 2 do plano: primeiro uso com criação vazia e guia para publicar online

- **Assistente de primeiro uso.** Numa instalação nova a app deixa de se encher sozinha com dados de exemplo (que eram uma criação de outra pessoa e se misturariam com os teus noutro aparelho). Pergunta como começar: **Começar do zero** (criação vazia), **Entrar com a minha conta** (vai à página Servidor), **Repor um backup** (abre o Início na secção das cópias de segurança) ou **Ver com dados de exemplo**. Quem já usava a app nunca vê o assistente.
- As duas misturas de ração de exemplo passam a ser criadas **uma só vez** (antes voltavam sempre que se apagavam todas) e não existem numa criação nova.
- Um endereço com âncora (`inicio.html#det-backup`) abre a secção recolhida de destino.
- Novo guia `servidor/02-publicar-online.md`: pôr a app online com HTTPS (GitHub Pages, Netlify, Cloudflare Pages), configurar os endereços no Supabase, instalar no telemóvel e actualizar sem misturar versões.
- Testes: `db.test.js` passa a 29 testes (primeiro uso, escolhas do assistente, utilizadores existentes).

## v2.15.1 — A app avisa quando há ficheiros de versões diferentes

- Cada ficheiro JS traz a sua versão (linha `@revisao`) e o `config.js` lista a versão mínima exigida (`REVISOES`). Ao abrir uma página, se algum ficheiro for mais antigo — por exemplo um `gestao.js` que ficou da instalação anterior —, aparece um aviso vermelho a dizer **qual** é. Antes, isto só se via como falhas estranhas ao gravar ("o parâmetro não é uma chave válida").
- Gestão: registar saída e editar ave não vão à base de dados sem uma ave escolhida (mostram "Escolhe a ave primeiro").
- Novo teste `tests/ficheiros.test.js`: confirma que todos os ficheiros têm a marca certa e que o `config.js` os lista.

## v2.15.0 — Fase 1 do plano: identificadores UUID e registos "apagados" com marca

**Preparação para usar a app em vários aparelhos (telemóvel e PC) ao mesmo tempo.**

- Cada registo passa a ter um **UUID** em vez de um número (1, 2, 3…), para dois aparelhos criarem registos sem colidir, mais `criadoEm`, `atualizadoEm` e `apagado`.
- **Migração automática** da base (versão 8 para 9) na primeira abertura, numa só transacção: se falhar, nada é alterado. Todas as ligações entre tabelas (ave → compartimento, venda → receita, compra → despesa, choco → aves…) são convertidas.
- **Cópia de segurança automática antes de migrar**: um ficheiro `capoeira-backup-antes-da-v9-AAAA-MM-DD.json` é descarregado e outra cópia fica guardada na própria app (base `capoeiraDB-copias`). Guarda o ficheiro.
- **Apagar passa a marcar** o registo (`apagado:true`) em vez de o remover; as listas e os cálculos não o mostram. É isto que permitirá a sincronização saber o que foi apagado noutro aparelho.
- **Backups**: a exportação passa a versão 3; a importação aceita versões 2 e 3 (a 2 é convertida automaticamente) e conserva as datas de criação.
- Todas as páginas e o `calc.js` funcionam com os dois formatos de id (numérico antigo e UUID) — `Util.mesmoId`, `Util.chaveId`, `Util.novoId`, `Util.compararRegistos`.
- **Mensagens de erro nas transacções**: quando uma operação falha por uma regra ("Só há 2 machos disponíveis", "Quantidade inválida") aparece essa mensagem, em vez de um genérico "Operação cancelada"; para erros técnicos aparece a causa e, se for sinal de ficheiros de versões diferentes, a sugestão de recarregar a página.
- **Gestão**: apagar um compartimento voltou a funcionar (tinha um erro que vinha da versão 2.9.0 e que nunca mostrava mensagem).
- Testes novos: `tests/db.test.js` (23 testes: migração, cópia, falha a meio, apagar, transacções) e testes de ids no `calc.test.js` (122 no total).

**Ao actualizar:** substitui TODOS os ficheiros desta versão, fecha todas as janelas da app e abre uma só; se alguma página falhar a gravar com a mensagem a sugerir recarregar, faz Ctrl+F5 (ou limpa os dados do site no navegador).

## v2.14.0 — Erros com mensagem e nomes escritos como o utilizador quer

- **Gestão › Editar ave**: "Patas Muscovy" (ou "Pintos…") deixa de ser trocado em silêncio por "Pato Muscovy". A palavra que abre o nome guarda-se tal como foi escrita (continua a contar como Patos no painel) e o painel mostra-a em cada lote. "Unir nomes" também respeita o nome de cada registo.
- Quando a app ajusta o que escreveste (maiúsculas, raça já existente), diz-o: *Ave actualizada — nome guardado como "…"*.
- **Tratamento de erros geral**: se uma gravação ou acção falhar (base de dados do aparelho recusou, sem espaço, sem ligação ao servidor, erro inesperado), aparece sempre uma mensagem clara, com o nome do botão ("Guardar alterações" não foi concluída…) e o motivo em português. Antes o botão não fazia nada.
- Editar ou apagar um registo que entretanto desapareceu passa a avisar ("Registo não encontrado") em vez de não fazer nada.

## v2.13.0 — Listas de escolha com o visual da app

- Novo `js/select.js`: as listas de escolha (categoria, tipo, raça, compartimento, filtros…) deixam de abrir o ecrã do sistema e passam a abrir **logo por baixo do campo**, com as cores, letra e espaçamentos da app (opção escolhida destacada com visto; por cima do campo se por baixo não houver espaço).
- Funciona em todas as páginas sem mexer nelas: o `<select>` verdadeiro continua a guardar o valor, por isso formulários, filtros e validação seguem iguais. Aceita teclado (setas, Enter, Esc, primeira letra).
- Gestão: a lista de raças mostra só as raças (Muscovy, Pequim…), uma vez cada, sem as descrições dos lotes.

## v2.12.0 — Raças sem duplicados e painel por tipo → raça → lotes

- **Gestão › Organização por tipo e raça**: agora é um painel que abre. **Patos** → *Pato Pequim*, *Pato Muscovy*… → dentro de cada raça, os **lotes** (descrição, quantidade, idade, compartimento e data de entrada). O mesmo para Galinhas e Gansos.
- "Cafrial", "cafriais" e "cafrial " contam como **a mesma raça** (sem distinguir maiúsculas, acentos nem plural). Em raças conhecidas, o que vem a seguir ao nome ("em postura", "chocando", "(marreco)") é a descrição do lote e não outra raça.
- **Ao registar, renomear ou editar** uma ave, a app escreve o nome sempre da mesma forma, reutiliza a raça que já existe e, se encontrar uma parecida (erro de escrita, por exemplo "Cafrail"), pergunta se é a mesma. Nada se junta sem confirmação.
- **Unir nomes parecidos**: quando já existem duas formas do mesmo nome, aparece um aviso com o botão "Unir como…". Só muda o nome; quantidades, idades e compartimentos ficam como estão.
- Testes novos em `tests/calc.test.js` (115 no total).

## v2.11.1 — Correção

- **Gestão › Histórico de saídas**: a coluna "Motivo" mostrava o código do ícone (`<svg …>`) em vez do ícone. Corrigido.

## v2.11.0 — Front-end reorganizado (integração, conteúdos e listagens)

**Integração das páginas**
- Novo `js/config.js`: **um só sítio** para a versão (`APP_VERSAO`), a lista de páginas (`PAGINAS`) e os scripts de cada página. O menu, a barra inferior, os cartões do menu principal e o service worker leem tudo daí; para lançar uma versão basta mudar `APP_VERSAO`.
- **Menu agrupado** (Exploração, Stock, Dinheiro, Sistema) com ícones, fecha com Esc e ao tocar fora. No telemóvel há uma **barra inferior** (Início, Gestão, Alimentação, Finanças, Mais).
- O `index.html` passou a usar o mesmo arranque das outras páginas (cabeçalho, faixa de totais, alerta de choco, consumo automático) e mostra o mapa de secções gerado de `PAGINAS`.
- Depois de guardar, apagar ou filtrar, a página **mantém o scroll, as secções abertas e os filtros** (`UI.redesenhar`), sem o ecrã "A carregar…".
- O service worker revalida os ficheiros no servidor e a cache usa o nome da versão.

**Organização dos conteúdos**
- **Separadores** em Gestão (Plantel | Registar | Histórico), Finanças (Resumo | Movimentos | Registar) e Alimentação (Stock | Plano | Registar | Histórico). A aba activa fica no endereço (`#registar`), os links para secções abrem a aba certa e os botões "Editar" mudam para a aba do formulário.
- Início: o **choco em curso** sobe para logo a seguir aos alertas; a cópia de segurança fica recolhida.
- Estilos: os `style=""` soltos passaram a classes utilitárias, as cores repetidas a variáveis (`--cinza-nota`, `--fundo-perigo`…), o gráfico de rosca usa os tons do tema, e o atributo `hidden` substitui os `display:none`.
- Ícones: os emojis em botões, títulos e avisos foram trocados pelos ícones SVG da app. As datas mostram-se sempre como dd/mm/aaaa (`Util.dataBR`).

**Listagens**
- Novo componente `Tabela` (`js/tabela.js`) com cabeçalho a sério, pesquisa sem distinguir acentos, filtros por coluna, "Mostrar mais" e contagem. Usado nos históricos (movimentos, extrato, vendas, revenda, consumo, saídas, postura, incubações, saúde) e nas tabelas de resumo (categorias, meses, relatórios, previsões, pesagens).
- Ficaram com o formato antigo: a lista completa de aves e o plantel por local (Gestão), e as tabelas de lotes e de fases do plano (Alimentação), que têm filtros e botões próprios.

## v2.9.0 — Login (item 2 do plano de atualizações)

- **Conta na página Servidor**: entrar com email e palavra-passe, criar conta, recuperar palavra-passe, "Entrar com Google" (opcional) e sair.
- **Sessão no aparelho** com renovação automática do acesso; nunca guarda a palavra-passe. Se a sessão deixar de ser válida, a app pede novo login e **nunca** cai para a chave pública para pedir dados.
- **Criação (granja)**: depois de entrares, "Criar a minha criação" (ficas administrador) ou escolhes uma das criações a que já pertences.
- Mensagens de erro em português (credenciais, email por confirmar, registo desativado, limites de emails…).
- Mudar de projeto no servidor termina a sessão do projeto anterior.
- A app continua a guardar os dados só neste aparelho; a sincronização vem no item 3.

## v2.8.0 — Preparação do servidor (item 1 do plano de atualizações)

- **Esquema do servidor** (`servidor/01-esquema.sql`) para o Supabase: granjas, membros e registos (JSON com data de alteração e marca de apagado), regras de acesso por granja (RLS), função de teste e tempo real preparado. É repetível sem estragar nada.
- **Nova página Servidor**: guardas o endereço do projeto e a chave pública, e a app testa a ligação (ok, esquema em falta, chave recusada, sem internet, tempo esgotado ou projeto em pausa). A chave secreta (`service_role`/`sb_secret_`) é recusada.
- Botão para **copiar o ficheiro SQL** para colar no painel do Supabase.
- A app continua a funcionar só neste aparelho; a sincronização vem nos itens seguintes.

## v2.7.1 — Listas e tipografia mais organizadas

- **Listas no telemóvel**: cada registo passa a uma "ficha" (título + pares etiqueta/valor em 2 colunas + botões no fim). Corrigido o erro em que tabelas com muitas colunas (Gestão, lotes, etc.) ficavam cortadas à direita e escondiam os valores.
- Cartões de stock e de revenda em coluna larga, com as compras em linhas arrumadas (data, kg e valor à esquerda; botões à direita).
- Títulos secundários, números dos cartões e listas com tamanhos de letra mais coerentes com o resto da app; selos ("repor", "arquivado") e secções recolhíveis com o mesmo estilo.

## v2.7.0 — Inventário de revenda

- **Nova página Revenda**: produtos que compras para vender (carvão, sacos de ração, materiais…) com unidade, preço de venda e stock mínimo.
- **Compras** aumentam o stock e criam a despesa "Compra para revenda" em Finanças (editar ou apagar a compra acompanha a despesa). **Ajustes** de stock (perdas, quebras, uso próprio, contagem) mexem só no stock.
- **Vendas ligadas ao inventário**: em Vendas → "Vender outro produto" escolhes o produto do inventário; a venda baixa o stock, sugere o valor (preço × quantidade) e calcula a **margem** com o custo médio das compras.
- Cartões com stock, custo médio, valor em stock, margem por unidade, vendas e margem do mês; produtos podem ser arquivados.
- **Aviso no Resumo** quando um produto fica abaixo do stock mínimo (ou negativo).
- Relatório do inventário em **PDF** e exportação **CSV** (inventário e movimentos). O backup inclui as duas tabelas novas.
- Estrutura da base de dados: versão 8 (tabelas `revenda` e `revendaMov`).

## v2.6.0 — Vendas, extrato em PDF e locais flexíveis

- **Nova página Vendas**: painel com tudo o que sai para venda (aves registadas em Gestão, ovos, ração e outros produtos/materiais), por período, com "de onde vem o valor" por tipo e produto, detalhe de cada venda (o quê, quando, a quem) e relatório em PDF.
- **Cada venda cria a receita em Finanças** automaticamente. Vender **ração** baixa o stock (sem contar como consumo das aves) e mostra a margem estimada; vender **ovos** controla os ovos disponíveis. Editar ou apagar uma venda corrige a receita e o stock.
- **Extrato de entradas e saídas em Finanças** (hoje, semana, mês, ano ou datas à escolha) com saldo anterior, saldo corrido e totais por categoria, e **descarregamento em PDF** (gerado no telemóvel, sem internet).
- **Locais flexíveis**: além de compartimentos, podes criar gaiolas, galpões, parques ou outro tipo, e criar vários de uma vez (ex.: 10 gaiolas numeradas).
- Atalhos e secções recolhíveis com novo aspeto (pastilhas) e ligações dentro do conteúdo mais coerentes com o resto da app.
- Estrutura da base de dados: versão 7 (tabela `vendas`). O backup e o CSV passam a incluir as vendas.

## v2.5.0 — Tipo e raça das aves, planos gerais e modelos prontos

- **Registo de aves por tipo e raça**: escolhes o tipo (Galinha, Pato, Ganso, outro) e a raça (sugestões + as que já tens + "outra raça"); o grupo fica "Galinha Sasso", "Pato Muscovy"… Os registos antigos continuam a funcionar.
- **Organização por tipo e raça** em Gestão: totais de galinhas e patos e o detalhe por raça (machos/fêmeas).
- **Plano alimentar geral por tipo**: um plano chamado "Galinha" ou "Pato" aplica-se a todas as raças desse tipo que não tenham plano próprio; o plano da raça tem prioridade.
- **Modelos prontos de plano**: Galinha Sasso, Galinha poedeira, Pato Pequim, Pato Muscovy e Pata poedeira, com a fonte e o aviso de que são referências; escolhes os teus produtos de ração em cada fase.
- Cada lote pode escolher **qual plano usar** (útil para poedeiras e engorda da mesma raça) e a tabela mostra de que plano vem o consumo.
- O CSV do plantel inclui as colunas Tipo e Raça. Sem alterações na base de dados.

## v2.4.1

- Lotes ainda sem sexo identificado (ex.: pintos recém-nascidos) mostram "?" em Machos/Fêmeas em vez de 0; a identificação faz-se mais tarde em Gestão → Editar / mover ave. Nota explicativa no registo de eclosão.

## v2.4.0 — Período de retirada da medicação

- Vacinas e medicação podem ter um **período de retirada** (dias). Depois de marcadas como feitas, o lote fica "em retirada" até essa data.
- Aviso (que podes ignorar) ao **vender ou abater** um lote que ainda está em retirada, e alerta no Resumo.
- Secção "Períodos de retirada em curso" na página Saúde & Crescimento; a coluna entra também no CSV.

## v2.3.1 — Revisão geral

- Importação de backup: se a página falhar a redesenhar depois de importar, já não diz "ficheiro inválido" (os dados foram importados).
- O service worker já não falha a instalação se faltar um ficheiro no servidor.
- Alertas: o aviso de compra substitui o aviso de "stock baixo" quando há plano (sem duplicados).
- Alimentação: atalhos no topo para saltar entre secções.
- Gestão: aves antigas sem machos/fêmeas já não mostram "undefined".

## v2.3.0 — Saúde, pesagens, alertas de compra e custo por lote

- **Nova página Saúde & Crescimento**: agenda de vacinas e medicação (com repetição automática, aviso no Resumo e despesa em Finanças ao concluir) e pesagens por lote com o ganho de peso por dia.
- **Alerta de compra**: avisa quando o stock de um produto dura 7 dias ou menos ao ritmo do plano alimentar.
- **Editar compras de ração** (kg, custo e data), actualizando a despesa ligada em Finanças.
- **Custo de ração por lote** (kg, MT e MT por ave) na tabela de lotes.
- Exportação CSV de vacinas/medicação e pesagens. Backup inclui as duas tabelas novas.
- Estrutura da base de dados: versão 6 (tabelas `saude` e `pesagens`).

## v2.2.0 — Plano alimentar, stock por produto e consumo automático

- **Plano alimentar por espécie, em fases por idade** (ex.: Ração A1 do dia 0 ao 29 e Ração A2 do dia 30 em diante), com gramas por ave por dia.
- **Aviso de troca de fase**: "Os patinhos têm 30 dias de vida — já podes passar de A1 para A2" (e aviso 3 dias antes).
- **Consumo automático**: todos os dias a app abate do stock o consumo previsto de cada lote, a partir da data da primeira compra do produto. Nunca repete um dia já lançado; um registo manual substitui o automático desse produto nesse dia.
- **Stock por produto**: compras com o mesmo nome somam-se (o que sobrou passa para a compra seguinte). Mostra quantos dias o stock dura ao ritmo do plano.
- **Novo lote**: campos de idade ao entrar, consumo automático e ração/gramas só desse lote.
- **Previsão de consumo**: quantos kg (e MT) para N aves durante X dias, e se o stock chega.
- Compras de ração ligadas à despesa em Finanças: ao remover a compra pode apagar-se também a despesa.
- Estrutura da base de dados: versão 5 (nova tabela `planosAlimentares`). O backup passa a incluir os planos.

## v2.1.0 — Vários chocos, eclosão e PWA

- **Incubação com várias aves/chocos ao mesmo tempo**: cada choco tem as suas aves (nome mostrado nos cartões e alertas), ovos, data, duração e compartimento.
- **Registar eclosão**: a app pergunta quantos ovos chocaram, adiciona os pintos ao compartimento escolhido e soma-os ao total de aves. Fica guardado um histórico com a taxa de eclosão.
- Misturas de ração editáveis (nome, composição, destino) e nova mistura.
- PWA: instalável, funciona offline e pede armazenamento persistente. Aviso de backup no Resumo.
- Correções: toast no menu principal, gráfico de saldo com meses negativos, importação de backup mais segura (versão e validação), dados de exemplo só na primeira utilização, estimativa de consumo de ração mais realista, duração da incubação validada.
- Estrutura da base de dados: versão 4 (nova tabela `misturas`). Backups novos têm `versaoBackup: 2`; backups antigos continuam a importar.

## v2.0.0 — Reescrita para múltiplas páginas + funcionalidades novas

Marco grande: a app deixou de ser um único ficheiro `index.html` (SPA)
e passou a ser 7 páginas HTML separadas, cada uma com o seu próprio
JavaScript, para seres tu a poderes editar (ex: só `js/financas.js`)
sem teres de mexer no resto.

**Estrutura e arquitectura**
- Divisão em páginas: `index.html` (menu), `inicio.html`, `gestao.html`,
  `alimentacao.html`, `financas.html`, `producao.html`, `relatorios.html`.
- Cabeçalho, navegação e rodapé centralizados em `js/common.js` — editar
  aí muda automaticamente em todas as páginas.
- Código reorganizado em namespaces (`DB`, `Util`, `Validacao`, `Calc`,
  `UI`) em vez de dezenas de funções soltas no `window`.
- Cabeçalho fixo no topo, com menu rápido (☰) para saltar entre páginas
  sem ter de voltar sempre ao menu principal.

**Correcções de fiabilidade e segurança**
- Transacções atómicas no IndexedDB (`DB.transacao`) — operações que
  mexem em várias tabelas (ex: registar uma venda) só confirmam se
  tudo correr bem; se algo falhar a meio, nada fica gravado.
- Protecção contra XSS (`Util.escapeHTML`) em todo o texto vindo do
  utilizador antes de ir para o ecrã.
- Corrigido o bug de fuso horário: a app usava UTC para calcular "hoje",
  o que dava a data errada perto da meia-noite em Moçambique (UTC+2).
- Sincronização entre abas/janelas abertas ao mesmo tempo, via
  `BroadcastChannel`.
- Validação Machos + Fêmeas ≤ Total em todos os formulários de aves.
- O stock de ração passou a corresponder por ID da compra, não por
  nome — evita misturar consumo de uma compra antiga com uma nova
  do mesmo ingrediente.
- Tabelas com deslize lateral próprio, para nunca "rebentarem" a
  largura do ecrã em telemóvel.

**Funcionalidades novas**
- Gestão: formulários únicos de "Adicionar ave" e "Editar/mover ave"
  (em vez de repetidos por compartimento), com deteção de espécie já
  existente (pergunta se queres somar ou criar registo separado).
  Lista completa de aves com pesquisa, filtros (compartimento, sexo,
  finalidade) e ordenação (idade, quantidade, compartimento, entrada).
  Botão "Renomear" rápido para corrigir só o nome de uma ave.
- Início: dashboard com 4 métricas principais e tendência (Plantel,
  Ração, Finanças, Produção) + lista de alertas coloridos por tipo
  (stock baixo, incubação a terminar, registos incompletos, produção
  a subir).
- Relatórios (página nova): 4 relatórios — Plantel, Alimentação,
  Produção, Financeiro — com evolução mensal e métricas como
  "previsão de esgotamento da ração" e "rentabilidade estimada".
- Gráficos de barras e circulares (SVG, sem bibliotecas externas).
- Semáforo visual do estado da incubação (calmo/atenção/terminado).
- Ícones SVG consistentes em toda a app, substituindo a maioria dos
  emojis — visual uniforme em qualquer sistema (Android/iPhone/PC).
- Paleta de cores azul-acinzentada, cabeçalho e rodapé próprios.
- Terminologia financeira mais honesta: "Saldo acumulado" em vez de
  "Lucro", com nota explicando o que o número inclui e não inclui.

**Removido**
- `php/backup.php` — endpoint sem autenticação, desnecessário numa app
  100% offline. O backup local em `.json` (exportar/importar) continua
  disponível e é a forma recomendada de guardar cópias de segurança.

## v1.0.0 — Versão inicial (SPA de ficheiro único)

App de gestão de galinheiro num único `index.html`, com IndexedDB,
gestão de compartimentos/aves, alimentação, finanças e incubação.
