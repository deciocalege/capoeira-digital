# Integração Netlify — Capoeira Digital 2.19.0

Esta versão acrescenta uma primeira integração com a Netlify sem desligar o Supabase.

## Arquitetura nesta fase (migração parcial)

- **Netlify Hosting:** publica a aplicação PWA.
- **Netlify Functions + Netlify Blobs:** arquivo de novos documentos e imagens enviados pela página **Ficheiros**.
- **Supabase Auth + PostgreSQL:** continuam a autenticar os utilizadores, validar os papéis administrador/trabalhador e sincronizar os registos da exploração entre aparelhos.
- **Netlify Web Analytics:** estatísticas de visitas no painel da Netlify.

> Importante: o Supabase continua a ser um serviço ativo e necessário nesta versão, não apenas uma cópia de segurança. Não apagues o projeto Supabase nem as tabelas/funções SQL existentes. A migração da autenticação e da sincronização exigiria outro projeto e uma migração de dados testada.

## Publicação correta na Netlify

A pasta deve ser publicada a partir da raiz `Capoeira-Digital-2.9.0/`, onde estão `index.html`, `netlify.toml`, `package.json`, `js/`, `css/` e `netlify/`.

Para que as funções de servidor e o Netlify Blobs sejam publicados, usa uma destas opções:

1. **Recomendado — GitHub:** envia o conteúdo desta pasta para um repositório e liga esse repositório à Netlify. A Netlify deteta `netlify.toml`, instala `@netlify/blobs` e publica as Functions.
2. **Netlify CLI:** instala Node.js e Netlify CLI, abre o terminal nesta pasta e executa `npm install` e depois `netlify deploy --prod` (na primeira utilização, associa a pasta ao site correto e confirma o diretório publicado).

Não uses apenas o arrastar-e-largar de uma pasta para esta versão: esse método publica os ficheiros estáticos, mas não faz o processo de build/deploy das Functions necessário ao arquivo.

## Variáveis de ambiente obrigatórias

No painel do projeto Netlify, abre **Project configuration → Environment variables** e cria estas variáveis com âmbito de execução das Functions:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | O Project URL do projeto Supabase já utilizado pela aplicação |
| `SUPABASE_ANON_KEY` | A chave pública anon/publishable do mesmo projeto |
| `CAPOEIRA_BLOBS_REGION` | `eu-central-1` (Frankfurt) por defeito nesta integração; confirma se esta região serve os requisitos de localização dos teus dados |

Depois de alterar variáveis, faz um novo deploy.

**Nunca** coloques `service_role`, `sb_secret_...`, palavra-passe da base de dados ou token pessoal da Netlify no JavaScript do navegador ou no repositório. A Function só precisa da chave pública do Supabase e do token de sessão do utilizador para verificar a identidade e o papel no servidor.

## Página Ficheiros e permissões

A página **Ficheiros** aparece no grupo Sistema.

- Administrador: pode carregar, consultar, descarregar e eliminar ficheiros.
- Trabalhador: pode consultar e descarregar; não pode carregar nem eliminar.
- Os ficheiros são separados por `granja_id` no armazenamento, e a Function confirma a sessão e a pertença à criação no Supabase em cada pedido.
- Tipos permitidos: PDF, JPEG, PNG, WebP, GIF, TXT, CSV, Excel e ZIP.
- Limite desta primeira integração: 4 MB por ficheiro, devido ao limite de payload das Netlify Functions. Para ficheiros maiores será necessário implementar um fluxo de upload direto.

O arquivo é persistente entre deploys porque usa um site-wide store do Netlify Blobs. Não alteres a região depois de começar a guardar ficheiros sem migrar os objetos: uma região diferente parece um arquivo vazio.

## Estatísticas detalhadas de visitas

A aplicação não recolhe IP nem cria um rastreador próprio. Usa o **Netlify Web Analytics**, que recolhe dados do lado do servidor e disponibiliza:

- visualizações de páginas;
- visitantes únicos;
- páginas mais visitadas;
- origens do tráfego;
- localizações agregadas;
- erros 404 e largura de banda.

Para ativar: no painel do projeto Netlify, abre **Analytics & metrics → Analytics → Enable Analytics**. Os dados aparecem no painel Analytics da Netlify, não dentro do painel HTML da Capoeira Digital. A Netlify informa que o serviço é um extra pago calculado por visualizações; confirma o preço apresentado na tua conta antes de ativar.

## Teste depois do deploy

1. Abre `https://o-teu-site.netlify.app/` e confirma que a aplicação carrega.
2. Abre **Servidor**, confirma que o Supabase responde e entra como administrador.
3. Seleciona a criação e abre **Ficheiros**.
4. Carrega um PDF pequeno e confirma que aparece na lista e pode ser descarregado.
5. Entra com a conta de trabalhador: deve conseguir consultar/descarregar, mas não deve ver o formulário de upload nem conseguir eliminar ficheiros.
6. Ativa Netlify Web Analytics e confirma que as visitas começam a aparecer no painel Analytics.
7. Testa a sincronização entre dois aparelhos antes de considerar a atualização concluída.

## Backups e limites desta etapa

- Continua a usar **Início → Exportar backup** e guarda cópias fora do telemóvel/computador.
- Esta integração não copia automaticamente os blobs para o Supabase, nem transforma o Supabase num backup automático do Netlify Blobs.
- Os dados operacionais e a autenticação continuam no Supabase. Os novos ficheiros carregados pela página Ficheiros ficam no Netlify Blobs.
- Faz primeiro um deploy de teste. Não apagues nem alteres o projeto Supabase existente.
