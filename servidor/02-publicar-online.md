# Pôr a Capoeira Digital online (HTTPS)

Para usar a app no **telemóvel e no computador** (e, mais tarde, partilhá-la com um
trabalhador) ela precisa de um endereço na internet com **https://**. Sem isso o telemóvel não
deixa instalar a app no ecrã inicial, não regista o modo offline e o login com Google não funciona.

> A app é só ficheiros (HTML, CSS e JavaScript): não precisa de servidor próprio. Qualquer
> serviço que publique ficheiros estáticos serve. Os planos gratuitos e os limites mudam com o
> tempo — confirma no site de cada serviço.

## Opção A — GitHub Pages (a mais simples; é a que o exemplo do LEIA-ME usa)

1. Cria uma conta em <https://github.com> e um repositório novo, por exemplo `capoeira-digital`
   (público é o mais fácil no plano gratuito).
2. Carrega **todos** os ficheiros da pasta da app (a pasta `Capoeira-Digital-…` inteira:
   `index.html`, `js/`, `css/`, `icons/`, `servidor/`, `manifest.json`, `sw.js`…).
   Pelo site: *Add file → Upload files* e arrasta o conteúdo da pasta.
3. Em **Settings → Pages**: *Source* = *Deploy from a branch*, *Branch* = `main`, pasta `/ (root)`
   → *Save*. Passado um ou dois minutos aparece o endereço:
   `https://<o-teu-utilizador>.github.io/capoeira-digital/`
4. Abre o endereço no telemóvel e no computador.

## Opção B — Cloudflare Pages ou Netlify (arrastar e largar)

- **Netlify:** em <https://app.netlify.com/drop> arrasta a pasta da app para a página. Recebes um
  endereço `https://….netlify.app` na hora.
- **Cloudflare Pages:** *Workers & Pages → Create → Pages → Upload assets*, dá um nome ao projeto
  e arrasta a pasta. Endereço: `https://<nome>.pages.dev`.

Em qualquer das opções **não é preciso configurar nada** (não há "build"): é publicar a pasta.

## Ligar o login ao endereço

No Supabase (**Authentication → URL Configuration**):

1. **Site URL** = o endereço da app, por exemplo `https://<utilizador>.github.io/capoeira-digital/`
2. **Redirect URLs** → acrescenta o mesmo endereço e a página do servidor:
   `https://<utilizador>.github.io/capoeira-digital/servidor.html`

Sem isto, o "Entrar com Google" e os emails de recuperar palavra-passe voltam para o sítio errado.

## Instalar no telemóvel (como uma app)

- **Android (Chrome):** abre o endereço → menu ⋮ → **Instalar app** (ou *Adicionar ao ecrã inicial*).
- **iPhone (Safari):** botão de partilhar → **Adicionar ao ecrã principal**.
- **Computador (Chrome/Edge):** ícone de instalar na barra de endereços.

Depois da primeira visita a app abre também **sem internet**.

## Actualizar a app depois

1. Substitui os ficheiros no repositório (ou volta a arrastar a pasta, no Netlify/Cloudflare).
2. A app compara a versão ao abrir: o service worker descarrega os ficheiros novos e a versão
   que aparece no fim de cada página sobe. Se uma página ficar com comportamentos estranhos,
   fecha a app e abre-a de novo (no computador: Ctrl+F5).
3. **Copia sempre a pasta completa** da versão nova. Misturar ficheiros de versões diferentes
   dá falhas — a app mostra uma faixa vermelha a dizer qual ficheiro está desactualizado.

## Cuidados

- **Cada aparelho tem a sua própria base de dados.** Para o que registas no telemóvel aparecer
  no computador, liga a **sincronização** (página Servidor; ver `LEIA-ME.md`). Sem ela, usa um
  backup (Início → Exportar backup) para passar os dados de um aparelho para o outro.
- O endereço `http://127.0.0.1:…` (servidor local) só funciona nesse aparelho: não serve para
  usar a app em dois aparelhos.
- Dados e endereço andam juntos: se mudares o endereço da app (outro domínio), o navegador trata-a
  como outra app e começa **vazia**. Leva os dados com um backup.
- Não coloques nunca chaves secretas (`service_role`) na app nem no repositório; só a chave
  pública do Supabase.


## Nota para a versão 2.19.0 (Netlify Functions)

A partir da versão 2.19.0, a página Ficheiros precisa de Netlify Functions e Netlify Blobs. Publica através de um repositório Git ligado à Netlify ou da Netlify CLI; o simples arrastar-e-largar não publica estas funções. Configura `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `CAPOEIRA_BLOBS_REGION` nas variáveis de ambiente do projeto. Consulta [`05-netlify.md`](05-netlify.md).
