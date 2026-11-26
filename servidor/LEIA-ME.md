# Servidor da Capoeira Digital (Supabase)

Este passo cria o **servidor central** onde, mais tarde, a app vai guardar os dados para os
poder usar no telemóvel e no computador ao mesmo tempo. Nesta fase a app continua a
funcionar como antes (dados só no aparelho); só ficas com a ligação preparada e testada.

## O que precisas de fazer (uma vez)

1. **Conta:** entra em <https://supabase.com> (podes usar a tua conta do GitHub).
2. **Projeto:** *New project* → nome `capoeira-digital` → escolhe uma palavra-passe forte
   para a base de dados (**guarda-a**) → escolhe a **região mais próxima de Moçambique** que
   aparecer na lista → *Create*. Espera uns minutos até ficar pronto.
3. **Esquema:** no menu do projeto abre o **SQL Editor** → *New query* → cola o conteúdo de
   `servidor/01-esquema.sql` (na app, página **Servidor**, há o botão *Copiar o ficheiro SQL*)
   → *Run*. Deve aparecer "Success". Podes repetir sem problema.
4. **Chaves:** nas definições do projeto (**API**, ou o botão **Connect**) copia
   - o **Project URL** (ex.: `https://xxxxxxxx.supabase.co`);
   - a **chave pública** (*anon* ou *publishable*).
5. **Ligar a app:** na página **Servidor** cola os dois valores e carrega em *Guardar e testar*.
   Resultado esperado: "Ligação ao servidor estabelecida".

## Contas (item 2): como criar os utilizadores

O serviço de email gratuito do Supabase é muito limitado: só envia para membros da tua equipa
e no máximo 2 emails por hora. Por isso **não dependas de emails de confirmação**.

**Recomendado (privado, sem emails):**
1. Painel do Supabase → **Authentication → Users → Add user → Create new user**: email e
   palavra-passe, com **Auto Confirm User** ligado. Faz isto para cada pessoa (tu e, mais tarde,
   o trabalhador).
2. (Opcional, mais seguro) **Authentication → Sign In / Providers**: desliga
   *Allow new users to sign up*, para ninguém criar contas por conta própria.
3. Na app, página **Servidor → Conta → Entrar**. A primeira pessoa carrega em
   **Criar a minha criação** e fica administradora.

**Alternativa:** deixar o registo aberto e desligar *Confirm email*. Qualquer pessoa que
conheça o endereço do projeto poderia criar uma conta; sem pertencer a uma criação não vê
dados, mas pode criar criações vazias e gastar a quota. Prefere a opção recomendada.

**Endereços:** em **Authentication → URL Configuration** define *Site URL* como o endereço da
app (ex.: `https://deciocalege.github.io/capoeira-digital/`) e acrescenta a mesma página
`…/servidor.html` em *Redirect URLs* (necessário para o Google e para os emails).

**Entrar com Google (opcional):** exige criar uma credencial OAuth na Google Cloud Console
(tipo *Web application*), pôr em *Authorized redirect URIs* o endereço
`https://<o-teu-projeto>.supabase.co/auth/v1/callback`, e colar o *Client ID* e o *Client
Secret* em **Authentication → Sign In / Providers → Google**. Os menus podem ter mudado de
nome: confirma na documentação do Supabase.

## Segurança (importante)

- Na app só vai a **chave pública**. As regras de acesso (Row Level Security) do servidor
  decidem quem vê o quê; sem iniciar sessão (próximo passo) ninguém consegue ler dados.
- **Nunca** coloques a chave `service_role` / `sb_secret_…` na app: a app recusa-a.
- Os ficheiros desta pasta não contêm segredos e podem estar no GitHub.

## O que o esquema cria

| Tabela / função | Para quê |
|---|---|
| `granjas` | uma por criação |
| `membros` | quem pertence a cada granja e com que papel (administrador / trabalhador) |
| `registos` | todos os registos da app (aves, vendas, consumo…) como JSON, com data da última alteração e marca de "apagado" |
| `criar_granja(nome)` | cria a granja e torna quem a criou administrador |
| `ping()` | usada pela app para testar a ligação |
| Regras RLS | cada pessoa só acede às granjas de que é membro |

## Limites do plano gratuito (confirma em supabase.com/pricing)

- O projeto **entra em pausa** se ficar cerca de uma semana sem uso (reativa-se no painel).
- A base de dados gratuita tem 500 MB, mais do que suficiente para uma criação.
- Não contes com cópias de segurança automáticas no plano gratuito: continua a exportar
  backups manuais (Início → Exportar backup).

## Pôr a app online

Para usar a app no telemóvel e no computador precisa de um endereço **https://**. O guia está em
[`02-publicar-online.md`](02-publicar-online.md) (GitHub Pages, Netlify ou Cloudflare Pages).

## Sincronização entre aparelhos

Depois do `01-esquema.sql`, corre também o **`03-sincronizacao.sql`** (SQL Editor → New query → Run).
Em cada aparelho: página **Servidor** → entra na conta → escolhe a criação → **Ligar a sincronização**.

- **Primeiro aparelho (o que já tem os dados):** "Enviar os dados deste aparelho".
- **Aparelho novo (vazio):** "Trazer os dados do servidor".
- **Os dois já têm dados:** "Juntar" (fica tudo; pode haver animais repetidos) ou "Substituir" (o aparelho fica só com os do servidor — faz um backup antes).
- Funciona sem internet: o que registas fica guardado e segue quando a ligação volta. O que mudou nos outros aparelhos chega sozinho (ao abrir a app, de minuto a minuto, e logo depois de gravares).
- Se duas pessoas alteraram o **mesmo registo**, fica a alteração **mais recente**. Mantém a data e a hora dos aparelhos em **automático**: um relógio errado faz as alterações desse aparelho perderem (a app avisa se o relógio estiver desacertado).
- Apagar também sincroniza: o registo fica marcado como apagado no servidor, para os outros aparelhos o apagarem.
- O ponto no cabeçalho mostra o estado: verde = sincronizado; amarelo = a sincronizar; cinzento = sem ligação; vermelho = erro ou sessão terminada (toca para ver).

Como testar o SQL num PostgreSQL local: ver o início de `tests/supabase-simulado.sql`.

## Pessoas, papéis e convites

Corre também o **`04-papeis-e-convites.sql`** (SQL Editor → Run). Depois, na página **Servidor**, a secção
**Pessoas com acesso** mostra quem tem acesso à criação.

Dois papéis:

| | Administrador | Trabalhador |
|---|---|---|
| Aves, ovos, ração (consumo), saúde, produção, saídas (abate/morte) | ✔ | ✔ |
| Finanças, vendas, revenda, relatórios e registar compras de ração | ✔ | ✘ (nem vê, nem recebe os dados) |
| Convidar, mudar papéis, retirar pessoas | ✔ | ✘ |

Isto é **imposto pelo servidor**: o trabalhador nunca recebe os dados de finanças, mesmo que alguém mexa na app.

**Como convidar alguém** (não é preciso enviar emails):
1. Administrador: Servidor → *Convidar uma pessoa* → escreve o email e o papel → **Criar convite** → aparece um código (ex.: `7F3A-91C2-0BDE`).
2. **Copiar mensagem** e envia-a à pessoa (WhatsApp, SMS…).
3. A pessoa cria conta ou entra **com esse email**, abre a página Servidor, escreve o código em **Tenho um convite** (ou abre o link da mensagem) e fica com acesso. Depois liga a sincronização para trazer os dados.

O código só funciona com o email convidado, vale 7 dias e usa-se uma vez. Uma criação nunca fica sem administrador. Um administrador pode sair ou ser retirado desde que haja outro.

Como testar o SQL: ver o início de `tests/supabase-simulado.sql` e correr `tests/papeis-e-convites.sql`.

## Próximo passo do plano

Notificações push e alertas inteligentes (fim de choco, vacinas, stock baixo, mortalidade), mesmo com a app fechada.


## Integração parcial com Netlify (versão 2.19.0)

A aplicação pode continuar publicada na Netlify enquanto usa o Supabase para autenticação, papéis e sincronização. A página **Ficheiros** usa Netlify Functions + Netlify Blobs para novos documentos e imagens. As estatísticas detalhadas podem ser ativadas no Netlify Web Analytics. Segue o guia [`05-netlify.md`](05-netlify.md) antes de publicar.
