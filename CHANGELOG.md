# Changelog — Capoeira Digital

Este ficheiro regista as alterações mais importantes feitas à app, para
conseguires confirmar rapidamente se estás a usar a versão mais
recente e o que mudou desde a última vez que a actualizaste no
telemóvel. O número da versão também aparece no rodapé de todas as
páginas da app.

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
