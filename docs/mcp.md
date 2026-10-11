# MCP remoto do beta

Endpoints: DEV `https://kindhearted-hare-87.convex.site/mcp`; PROD `https://glad-bison-698.convex.site/mcp`.

O servidor usa MCP Streamable HTTP sobre HTTPS, sem sessão persistida no processo. O Clerk faz o login, o consentimento OAuth, a troca de código com PKCE S256 e a renovação por refresh token. Biblioteca, histórias, quests e progresso pertencem ao usuário que autorizou a conexão e são os mesmos exibidos no Android após sincronização.

## Histórico: publicação de histórias em quests

O backend com as 29 ferramentas e a extensão de histórias em quests foi publicado a partir de `/home/golias/projects/beta`, em DEV `2026-10-11T02:38:13.440Z` e PROD `2026-10-11T02:38:52.368Z` (noite de 10/10 em `America/Sao_Paulo`). `.tools/quest-stories-release-receipt.json` preserva a evidência dessa entrega. Os recibos genéricos `release-development-receipt.json`, `release-production-receipt.json` e a verificação `deployed-mcp-verification.json` foram sobrescritos pela autoria Shiken descrita abaixo; seus conteúdos atuais não são evidência histórica desta publicação de quests.

Na publicação inicial, os seis escopos de quests, planejamento e histórias foram criados e anunciados nas duas instâncias Clerk. Os quatro clientes abaixo já permitem esses escopos, conforme `.tools/oauth-scope-update-report.json`, preservando suas permissões anteriores e callbacks:

| Ambiente | Cliente                 | Client ID público  |
| -------- | ----------------------- | ------------------ |
| DEV      | beta MCP - ChatGPT DEV  | `o3rjBpCxzXJ3J2LD` |
| DEV      | beta MCP - Codex DEV    | `mv8B8GOEV0KRJ3kc` |
| PROD     | beta MCP - ChatGPT PROD | `lwRmQRQ7spzNW8tB` |
| PROD     | beta MCP - Codex PROD   | `wXS5CdkfK1TNBuEU` |

**Catálogos confirmados no ChatGPT nesta publicação:** `beta DEV` e `beta PROD` concluíram o refresh da extensão de histórias em quests com **15 ferramentas de leitura e 14 de escrita**. A interface confirmou `create_quest` com `storyIds`, histórias sozinhas ou misturadas, e `get_quest` com `completedStoryIds`. Não houve novo escopo nem novo consentimento nessa atualização. O registro específico desta entrega está em `.tools/quest-stories-release-receipt.json`.

Na importação inicial do CRUD de histórias, um padrão Unicode incompatível no JSON Schema impedia o refresh. A correção preservou a validação de kana e passou por 34 testes MCP, tipos, lint e os 58 schemas no Python `jsonschema`. Essa é a evidência histórica anterior à extensão de histórias em quests.

O smoke autenticado da publicação inicial passou nos dois ambientes com PKCE, catálogo de 29 ferramentas e oito chamadas de leitura em cada etapa: access token e token renovado. Não houve escrita de dados; a evidência resumida está em `.tools/authenticated-mcp-smoke-evidence.json`. Os novos consentimentos do ChatGPT DEV e PROD mostraram e autorizaram os seis escopos adicionais junto dos anteriores. Ambos retornaram conectados às configurações do ChatGPT, sem erro; o recibo sanitizado está em `.tools/chatgpt-plugin-update-receipt.json`. Tokens de outras conexões antigas mantêm apenas os escopos concedidos originalmente. Esse smoke completo e a reconexão não foram repetidos na extensão de histórias em quests.

## Histórias em quests: extensão publicada

O contrato abaixo inclui `storyIds` e progresso de leitura separado por quest. O backend foi publicado nos dois ambientes e os schemas atualizados foram importados nos dois plugins existentes, sem novas ferramentas ou permissões. `npm run check` passou com formatação, lint, tipos e **661 testes**: 423 mobile, 215 backend e 23 scripts. A suite MCP inclui 35 testes; os 58 JSON Schemas continuam válidos no Python `jsonschema`.

Nesta extensão, a verificação remota cobriu descoberta, proteção sem token, CORS, presença de funções e atualização dos catálogos na interface do ChatGPT. Não foi executado outro smoke OAuth completo, nem gerado ou instalado um APK.

## Autoria Shiken e mídia: backend publicado e smoke PROD aprovado

O backend com **33 ferramentas** e **15 escopos OAuth** foi publicado a partir de `/home/golias/projects/beta`: DEV em `2026-10-11T02:54:38.028Z` e PROD em `2026-10-11T02:55:45.716Z`. Os recibos atuais `.tools/release-development-receipt.json` e `.tools/release-production-receipt.json` registram esses deploys. `.tools/deployed-mcp-verification.json` confirmou nos dois ambientes descoberta pública HTTP 200 com 15 escopos, MCP sem autenticação HTTP 401 e CORS HTTP 204. Essa verificação não demonstra consentimento nem chamadas autenticadas das novas ferramentas.

O refresh do plugin ChatGPT **`beta PROD`** confirmou as **33 ferramentas: 17 de leitura e 16 de escrita**, incluindo `create_shiken_paper`, `get_shiken_paper_content`, `prepare_shiken_media_upload` e `get_shiken_media`. O plugin **`beta DEV` ainda não recebeu o refresh desta extensão**; sua última confirmação continua sendo o catálogo anterior de 29 ferramentas.

Após a autorização do usuário, `shiken:write` foi cadastrado como **Advertised** no Clerk PROD e concedido aos clientes ChatGPT `lwRmQRQ7spzNW8tB` e Codex `wXS5CdkfK1TNBuEU`. `.tools/shiken-prod-scope-receipt.json` registra a aplicação e a conferência em `2026-10-11T03:02:58.215Z`, preservando callbacks e consentimento habilitado. O consentimento Codex foi aceito. No ChatGPT, o consentimento incluiu `shiken:write`, foi aceito e retornou às configurações com a conta `joaovgolias` marcada como **Primary**, no endpoint PROD. O estado remoto do novo escopo em DEV não foi atualizado nem confirmado nesta etapa.

O smoke real de autoria em **PROD passou com access token e depois de refresh**, descobrindo 33 ferramentas e verificando os schemas. Rejeitou a prova inválida (`invalidPaperRejected: true`) e verificou duas mídias neutras: WAV de 48 bytes e PNG de 68 bytes, total de **116 bytes**, com upload e repetição idempotente (`mediaFixturesVerified: 2`, `mediaIdempotency: true`). **Nenhuma prova válida foi criada** (`validPapersCreated: 0`). Não havia prova existente para exercitar a leitura editorial remota (`existingPaperPages: 0`, `existingPaperQuestions: 0`); a criação e releitura completas, incluindo gabarito e paginação, estão cobertas pelos testes locais, não por esse smoke remoto.

O smoke utilizou PKCE **S256**. Nos dois clientes Clerk PROD a configuração preservada é `pkceRequired: false`; portanto, o uso de PKCE no teste não significa que sua exigência esteja habilitada no servidor. A afirmação anterior de PKCE obrigatório foi corrigida.

A consulta `search_shiken_papers({ limit: 1 })` pela ferramenta instalada do plugin PROD também retornou sem erro, com `items: []` e `isDone: true`. O recibo consolidado desta entrega está em `.tools/shiken-authoring-release-receipt.json`, separado das evidências históricas de 29 ferramentas.

A automação existente `simulado-jlpt-semanal` foi atualizada com o prompt de `.tools/shiken-weekly-prompt.txt` e ativada em `2026-10-11T03:05:35.216Z`. A conferência do arquivo de configuração confirmou o prompt exato, estado **ACTIVE**, mesmo ID, destino e agenda: **domingo, 00:01, `America/Sao_Paulo`**. O job não foi executado manualmente nesta entrega. Atualizar o catálogo e autorizar a nova permissão no plugin DEV permanece uma etapa separada, ainda não realizada.

Nenhuma prova ou quest pessoal foi criada, nem APK gerado nesta extensão. As únicas escritas do smoke foram os dois arquivos neutros descritos acima. A validação final `npm run check` passou com formatação, lint, tipos e **680 testes: 423 mobile, 231 backend e 26 scripts**, conforme `.tools/shiken-authoring-final-check.log`. O resultado substitui a contagem inicial de 677 testes; os limites de cobertura remota continuam explícitos acima.

As decisões de contrato são: `get_shiken_paper` continua sem questões ou gabarito; a ferramenta editorial exige escrita junto de leitura; novas provas publicadas pelo MCP devem estar completas e prontas para iniciar; o editor mobile continua podendo guardar rascunhos. Upload transfere bytes fora do JSON MCP, com reserva idempotente por arquivo, e os binários prontos continuam compatíveis com as URLs de reprodução do app. As decisões e limites estão detalhados adiante para revisão posterior.

## Conectar um cliente

No cadastro de um app/conector MCP do ChatGPT, use o endpoint e o Client ID do mesmo ambiente e autenticação OAuth. O cliente dedicado fica em **Clerk → OAuth applications**. Um cliente público usa PKCE e não exige Client Secret.

No ambiente de desenvolvimento configurado, o cliente para ChatGPT tem Client ID `o3rjBpCxzXJ3J2LD` (identificador público) e nome **beta MCP - ChatGPT DEV** no painel Clerk.

Nesse cliente de desenvolvimento, os escopos de biblioteca, quests, planejamento e histórias já estão cadastrados e permitidos no Clerk, mantendo os callbacks e o consentimento existentes. A configuração não altera tokens já emitidos: reconecte a integração para autorizar as novas permissões.

O cliente existente para Codex Dev, Client ID público `mv8B8GOEV0KRJ3kc`, também permite todas essas áreas e se chama **beta MCP - Codex DEV**. Seu callback local e o consentimento foram preservados; conexões anteriores também precisam autorizar os novos escopos.

O cliente ChatGPT dedicado deve permitir o callback `https://chatgpt.com/connector_platform_oauth_redirect`, manter o consentimento habilitado e permitir os 15 escopos MCP do contrato atual: `openid`, `offline_access`, `alphabet:read`, `alphabet:write`, `vocabulary:read`, `vocabulary:write`, `grammar:read`, `grammar:write`, `quests:read`, `quests:write`, `study:read`, `shiken:read`, `shiken:write`, `stories:read` e `stories:write`. Os clientes ChatGPT existentes também preservam `email` e `profile`; os 15 escopos estão permitidos nos dois clientes PROD, enquanto DEV permanece com confirmação dos 14 anteriores. O callback estável depende do suporte a `authorization_response_iss_parameter_supported` anunciado pelo Clerk; confirme a configuração ao usar outra instância.

Alfabeto, vocabulário e gramática têm permissões separadas. Tokens existentes com `openid` e escopos de alfabeto ou vocabulário continuam funcionando nas áreas autorizadas. Em outra instalação, cadastre os dois escopos de gramática no Clerk e permita-os no cliente OAuth; depois reconecte o cliente e dê um novo consentimento. Uma conexão somente de gramática precisa de `openid` e `grammar:read`; escrita exige também `grammar:write`. Ela não exige acesso ao alfabeto ou vocabulário. A mesma regra vale para as outras áreas. `offline_access` permite renovação da conexão, mas não autoriza dados por si só. Os desafios 403 indicam a permissão necessária à operação, sem pedir acesso a outra área.

O planejamento usa quatro permissões adicionais: `quests:read`, `quests:write`, `study:read` e `shiken:read`. Elas já foram cadastradas e permitidas nos clientes DEV/PROD listados acima. Para outra instalação, cadastre-as na instância Clerk e no cliente OAuth usado pela conexão; publicar código sozinho não altera esse cadastro remoto. Depois atualize as ferramentas e reconecte o cliente para dar novo consentimento. Os escopos antigos continuam autorizando apenas suas áreas. Uma conexão de planejamento pode usar `openid`, `offline_access` e esses quatro escopos, sem exigir permissões de edição da biblioteca. Criar ou cancelar quests exige leitura e escrita de quests; consultar estatísticas ou Shiken exige somente o respectivo escopo de leitura.

`tools/list` exige autenticação e mostra as 33 ferramentas do contrato publicado, cada uma com os escopos OAuth necessários em `_meta.securitySchemes`, inclusive as áreas ainda não autorizadas pelo token. Isso permite ao cliente descobrir novas ferramentas e solicitar o consentimento correspondente, sem ficar preso ao catálogo dos escopos antigos. A descoberta não concede acesso aos dados: cada chamada continua exigindo seus próprios escopos; leitura libera busca e consulta, e escrita junto com leitura libera criação, edição e arquivamento. A leitura editorial de gabaritos Shiken também exige escrita. Chamar uma ferramenta sem a permissão necessária retorna 403 antes de acessar os dados. Após adicionar uma área, atualize as ferramentas no cliente e reconecte para autorizar os novos escopos.

Para outro cliente, cadastre o callback exato no Clerk e adicione seu Client ID à configuração do servidor. Não reutilize um cliente OAuth destinado a outro serviço. DCR e CIMD não são necessários para clientes previamente cadastrados.

## Configuração no Convex

| Variável                       | Valor                                                                     |
| ------------------------------ | ------------------------------------------------------------------------- |
| `MCP_RESOURCE_URL`             | URL HTTPS canônica terminada em `/mcp`                                    |
| `CLERK_JWT_ISSUER_DOMAIN`      | Emissor Clerk usado pelo app Android                                      |
| `CLERK_PUBLISHABLE_KEY`        | Chave pública da mesma instância                                          |
| `CLERK_SECRET_KEY`             | Chave secreta, somente nas variáveis do backend                           |
| `MCP_ALLOWED_OAUTH_CLIENT_IDS` | Client IDs dedicados ao MCP, separados por vírgulas                       |
| `MCP_ALLOWED_ORIGINS`          | Opcional: origens de clientes web, separadas por vírgulas; padrão ChatGPT |

Em **Clerk → OAuth applications → Settings**, habilite **Generate access tokens as JWTs** e **Include Audience**. O cliente deve enviar `resource` com a URL MCP canônica nas solicitações de autorização e token. O servidor verifica assinatura, tipo de token, expiração, emissor, audiência, Client ID autorizado e escopos. A audiência `aud` deve conter exatamente a URL configurada em `MCP_RESOURCE_URL`; um Client ID sozinho não é aceito como audiência. Tokens de sessão do Android, tokens opacos e identidades fornecidas pelo chamador não são aceitos. JWTs já emitidos seguem válidos até expirarem; não há lista local de revogação.

O backend publica a descoberta RFC 9728 em `/.well-known/oauth-protected-resource/mcp` e `/.well-known/oauth-protected-resource`. Respostas 401/403 incluem o desafio `WWW-Authenticate`. O cliente descobre no Clerk os endpoints OAuth e o suporte a PKCE/refresh.

## Ferramentas

| Ferramenta                    | Escopo                                 | Comportamento                                                                                       |
| ----------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `search_alphabet`             | `alphabet:read`                        | Busca pessoal por texto, leitura, radical, idioma, escrita ou nível; suporta paginação e arquivados |
| `get_alphabet`                | `alphabet:read`                        | Consulta completa de um card pessoal pelo ID                                                        |
| `create_alphabet`             | `alphabet:read` + `alphabet:write`     | Cria um card, rejeitando símbolos duplicados inclusive arquivados                                   |
| `update_alphabet`             | `alphabet:read` + `alphabet:write`     | Atualiza somente os campos enviados, preservando histórico de estudo                                |
| `search_vocabulary`           | `vocabulary:read`                      | Busca nos campos do vocabulário com AND/OR, filtros e paginação; inclui IDs e resumo                |
| `get_vocabulary`              | `vocabulary:read`                      | Consulta completa de um card pessoal de vocabulário pelo ID                                         |
| `create_vocabulary`           | `vocabulary:read` + `vocabulary:write` | Cria vocabulário, rejeitando a combinação duplicada de idioma, expressão e leitura                  |
| `update_vocabulary`           | `vocabulary:read` + `vocabulary:write` | Edita conteúdo e classificações parcialmente, preservando ID, proprietário e histórico              |
| `set_vocabulary_archived`     | `vocabulary:read` + `vocabulary:write` | Arquiva ou restaura um card, sem apagar dados ou estatísticas                                       |
| `search_grammar`              | `grammar:read`                         | Busca em todos os campos pessoais de gramática, com AND/OR, filtros, IDs, resumo e paginação        |
| `get_grammar`                 | `grammar:read`                         | Consulta completa de um card pessoal de gramática pelo ID                                           |
| `create_grammar`              | `grammar:read` + `grammar:write`       | Cria título, explicação completa, resumo e exemplos opcionais e classificações                      |
| `update_grammar`              | `grammar:read` + `grammar:write`       | Edita parcialmente qualquer campo de conteúdo; preserva ID, proprietário e histórico                |
| `set_grammar_archived`        | `grammar:read` + `grammar:write`       | Arquiva ou restaura sem apagar conteúdo, respostas ou estatísticas                                  |
| `list_quests`                 | `quests:read`                          | Lista quests e progresso por status, com paginação                                                  |
| `get_quest`                   | `quests:read`                          | Consulta uma quest pessoal pelo ID                                                                  |
| `create_quest`                | `quests:read` + `quests:write`         | Cria uma seleção fixa de cards, provas e/ou histórias com prazo flexível; repetição idempotente     |
| `cancel_quest`                | `quests:read` + `quests:write`         | Cancela sem apagar histórico; uma conquista concluída permanece concluída                           |
| `get_study_progress`          | `study:read`                           | Resumo exato de estudo por categoria e nível, com os cards de menor acerto ponderado                |
| `get_study_cards`             | `study:read`                           | Percorre cards com conteúdo e estatísticas individuais para selecionar IDs específicos              |
| `search_shiken_papers`        | `shiken:read`                          | Descobre IDs, níveis e composição das provas pessoais                                               |
| `get_shiken_paper`            | `shiken:read`                          | Consulta metadados de uma prova pessoal pelo ID                                                     |
| `create_shiken_paper`         | `shiken:read` + `shiken:write`         | Publica simulado completo com chave idempotente por usuário                                         |
| `get_shiken_paper_content`    | `shiken:read` + `shiken:write`         | Consulta editorial paginada com questões, gabarito, explicações e controle de versão                |
| `prepare_shiken_media_upload` | `shiken:read` + `shiken:write`         | Reserva arquivo e retorna autorização temporária para POST binário                                  |
| `get_shiken_media`            | `shiken:read`                          | Consulta estado e URL pronta de uma mídia pessoal                                                   |
| `get_shiken_history`          | `shiken:read`                          | Histórico paginado de tentativas com resultados por habilidade e resumo da página                   |
| `list_stories`                | `stories:read`                         | Lista histórias e histórico pessoais com filtros e paginação                                        |
| `get_story`                   | `stories:read`                         | Consulta texto, gabarito e progresso pessoal de leitura                                             |
| `create_story`                | `stories:read` + `stories:write`       | Publica uma história com traduções de forma idempotente                                             |
| `set_story_archived`          | `stories:read` + `stories:write`       | Arquiva ou restaura preservando conteúdo e histórico                                                |
| `update_story`                | `stories:read` + `stories:write`       | Edita conteúdo completo com controle de versão e preserva leituras anteriores                       |
| `delete_story`                | `stories:read` + `stories:write`       | Exclui do catálogo ativo de forma reversível, preservando conteúdo e progresso                      |

Para kanji, envie `language: "ja"`, `writingSystem: "Hani"`, `details.kind: "kanji"`, `kunYomi`, `onYomi`, `radicals` e uma classificação `{ "scheme": "jlpt", "level": "N5" }` (N1–N5). A busca normaliza hiragana/katakana e permite procurar por leitura. Os schemas completos ficam disponíveis em `tools/list`.

`kunYomi`, `onYomi` e `radicals` aceitam arrays vazios, inclusive os três ao mesmo tempo. `front` e `back` são calculados automaticamente para kanji: frente com o símbolo e verso com significado, 訓読み, 音読み e 部首. Não é necessário enviá-los ao criar; valores enviados por clientes antigos são ignorados e não sobrescrevem o formato. Alterações dos dados recalculam as faces. Outros sistemas de escrita continuam permitindo frente e verso personalizados.

A busca retorna `items`, `cursor` e `isDone`. Continue enquanto `isDone` for falso, inclusive quando a página estiver vazia por causa dos filtros. No update, campos omitidos permanecem iguais; arrays e `details` enviados substituem o respectivo campo inteiro.

### Vocabulário

Para criar, envie `language`, `expression`, `reading` ou `readingOmitted: true`, `translations`, `examples` e `classifications`. Para japonês, a leitura informada deve estar em kana e deve existir uma classificação JLPT. `translations` aceita `pt` e/ou `en`, com ao menos uma tradução. A frente é a expressão; o verso reúne leitura, traduções e exemplos. `front`, `back` e `sortKey` são derivados e não são argumentos de criação/edição MCP.

Para remover uma leitura existente, envie `patch: { "readingOmitted": true }`. Para voltar a informá-la, envie `patch: { "readingOmitted": false, "reading": "たべる" }`. Uma leitura vazia sem a omissão explícita é rejeitada.

Exemplo de argumentos para `create_vocabulary`:

```json
{
  "card": {
    "language": "ja",
    "expression": "食べる",
    "reading": "たべる",
    "translations": { "pt": ["comer"], "en": ["eat"] },
    "examples": [
      {
        "text": "パンを食べる。",
        "reading": "ぱんをたべる。",
        "meaning": "Comer pão."
      }
    ],
    "classifications": [{ "scheme": "jlpt", "level": "N5" }]
  }
}
```

`search_vocabulary` procura em expressão, leitura, traduções pt/en, exemplos (texto/leitura/significado), frente, verso e classificações. `query` divide o texto por espaços; `terms` permite indicar termos explicitamente, inclusive frases. Se ambos forem enviados, os termos são combinados. O operador padrão `AND` exige que todos os termos apareçam no mesmo card, podendo estar em campos diferentes. `OR` aceita qualquer termo, sem repetir cards que coincidam com vários termos. Por exemplo, `{ "terms": ["comer", "drink"], "operator": "OR", "level": "N5" }` retorna apenas cards N5 que coincidam com ao menos um dos termos. Idioma e arquivamento também se intersectam com o resultado. A busca ignora caixa/acentos latinos e considera leituras equivalentes em hiragana/katakana, sem alterar o conteúdo cadastrado.

Cada item da busca inclui `id`, `summary` e conteúdo completo. A ordem usa leitura kana, com hiragana antes de katakana, e criação como desempate; cards sem leitura ficam depois, por criação. Use os mesmos filtros ao continuar com `cursor`; páginas podem vir vazias antes do fim, pois a paginação percorre o catálogo pessoal e aplica os termos à página. `archived` omitido equivale a `false`; `true` lista apenas arquivados.

No `update_vocabulary`, envie `{ "id": "ID_DA_BUSCA", "patch": { "translations": { "pt": ["comer", "alimentar-se"] } } }` para atualizar só as traduções portuguesas. As traduções inglesas permanecem iguais. Cada array enviado substitui apenas sua lista correspondente; campos omitidos, inclusive idiomas dentro de `translations`, são preservados. ID, proprietário, versão, estatísticas e arquivamento não podem ser enviados em `patch`. Use `set_vocabulary_archived` com `{ "id": "ID_DA_BUSCA", "archived": true }` para arquivar ou `false` para restaurar. A unicidade considera idioma, expressão e leitura, inclusive em cards arquivados; leituras distintas da mesma expressão podem ter cards diferentes.

### Gramática

Para criar, envie `language`, `title`, `explanation`, `shortExplanation` opcional, `examples` (pode ser vazio) e `classifications`. Inclua ao menos uma classificação JLPT N1 a N5. A frente é o título; o verso reúne resumo e exemplos. A explicação completa fica em uma ação separada no app. `front`, `back` e `sortKey` não são argumentos de criação/edição MCP. Enviar `shortExplanation: ""` remove o resumo sem remover a explicação completa.

Exemplo de argumentos para `create_grammar`:

```json
{
  "card": {
    "language": "ja",
    "title": "は — marcador de tópico",
    "explanation": "A partícula は apresenta o tema da frase e é pronunciada wa nesse uso.",
    "examples": [
      {
        "text": "私は学生です。",
        "reading": "わたしはがくせいです。",
        "meaning": "Sou estudante."
      }
    ],
    "shortExplanation": "Use は após o tópico da frase.",
    "classifications": [{ "scheme": "jlpt", "level": "N5" }]
  }
}
```

O título aceita até 300 caracteres, a explicação completa até 8.000 e a curta até 2.000. São permitidos de zero a 24 exemplos com até 1.000 caracteres por campo e até 16 classificações. As faces derivadas não truncam exemplos. O antigo limite da frente personalizada deixa de se aplicar.

`search_grammar` busca em **todos** os campos de conteúdo: título, explicação completa e curta, texto/leitura/significado dos exemplos, frente, verso, esquema/nível das classificações e idioma. `query` separa termos por espaços; `terms` aceita termos explícitos, inclusive frases. Os dois se combinam quando enviados juntos. `AND` é o padrão e exige todos os termos no mesmo card, em qualquer combinação de campos. `OR` aceita qualquer termo, sem duplicar um card que coincida em vários campos. Por exemplo, `{ "terms": ["tópico", "condição"], "operator": "OR", "level": "N5" }` retorna só cards N5 que coincidam com pelo menos um termo. Os filtros de idioma e arquivamento também se intersectam. A normalização da busca segue o vocabulário: ignora caixa/acentos latinos e considera hiragana/katakana equivalentes, preservando o conteúdo cadastrado.

A resposta tem `items` com `id`, `summary` e conteúdo completo, em ordem de criação, com desempate do banco; não inclui proprietário nem chaves internas. Use `limit` entre 1 e 100 (padrão 30) e continue com `cursor` e os mesmos filtros até `isDone: true`, inclusive se uma página intermediária vier vazia. `archived` omitido equivale a `false`; `true` retorna somente arquivados. `get_grammar` recebe `{ "id": "ID_DA_BUSCA" }` e retorna o card completo apenas ao proprietário autenticado.

Para edição parcial, envie por exemplo `{ "id": "ID_DA_BUSCA", "patch": { "explanation": "Explicação revisada.", "classifications": [{ "scheme": "jlpt", "level": "N4" }] } }` a `update_grammar`. Qualquer campo de conteúdo pode ser alterado; omitidos permanecem iguais e listas enviadas substituem a lista inteira. O servidor remove espaços externos, normaliza NFC e valida o conteúdo resultante. Campos desconhecidos, tipos inválidos, listas obrigatórias vazias e metadados como `id`, `ownerId`, datas, versão ou estatísticas são rejeitados. Uma edição inválida não altera nenhum campo. ID, proprietário, criação, tentativas anteriores e estatísticas são preservados; a versão de conteúdo é atualizada. Use `set_grammar_archived` com `{ "id": "ID_DA_BUSCA", "archived": true }` ou `false` para arquivar ou restaurar.

### Planejamento com progresso e Shiken

Comece com `get_study_progress`, por exemplo `{ "category": "all", "level": "N5", "weakLimit": 10 }`. A resposta contém totais, cards estudados/nunca estudados, acertos/parciais/erros, precisão integral e ponderada, agrupamentos por categoria e nível e os cards estudados com menor precisão ponderada. Precisões são frações entre 0 e 1; sem tentativas, retornam `null`. O parcial vale meio acerto na precisão ponderada. Cards classificados em vários níveis participam de cada grupo correspondente: não some grupos de nível para obter o total.

Esses números são estatísticas acumuladas dos cards que pertencem **agora** ao recorte da biblioteca (`basis: "lifetime_statistics_for_current_library"`), não um histórico diário ou resultado de uma semana. `archived` omitido equivale a `false`; `true` consulta somente cards arquivados. Respostas ainda pendentes de sincronização no celular não aparecem. A consulta suporta até 1.000 cards nas categorias selecionadas antes do filtro de nível e até 6 MiB de leitura. Se exceder o limite, retorna erro explícito sem resumo parcial; tente uma categoria menor. `truncated: false` identifica totais completos para o recorte. A lista `weakCards` é limitada por `weakLimit` (1–30, padrão 10); `hasMoreWeakCards` sinaliza itens omitidos. Não interprete uma falha, `null` ou ausência de tentativas como baixo desempenho medido.

Para escolher cada card da quest, use `get_study_cards`, por exemplo `{ "category": "alphabet", "level": "N5", "limit": 50 }`. A ferramenta retorna ID, categoria, idioma, frente/verso completos, classificações, versão e estatísticas individuais exatas (acertos, parciais, erros, tentativas, precisões e última revisão). `study:read` autoriza esses dados para planejamento. Repita para `vocabulary` e `grammar` e combine os IDs escolhidos livremente: a categoria organiza apenas a consulta, não limita a composição da quest. Há de 1 a 100 itens e até 2 MiB lidos por página, sem teto total do catálogo. Continue com `cursor` e os mesmos filtros até `isDone: true`, inclusive quando o filtro de nível produzir página vazia. Assim é possível examinar todos os cards, inclusive quando o resumo de 1.000 cards ou a lista de 30 pontos fracos não bastar. Sem tentativas, precisões e última revisão são `null`; conteúdo e métricas não são truncados.

Use `search_shiken_papers` com `{ "level": "N5" }` para descobrir IDs válidos a incluir em `paperIds`. A busca e `get_shiken_paper` expõem título, nível, descrição, versão e quantidade de questões por habilidade; não expõem gabaritos e não editam provas. Busca aceita `query`, `level`, `archived`, `limit` de 1–25 (padrão 10) e `cursor`.

`get_shiken_history` aceita `paperId`, `level`, `status` (`all`, `active` ou `completed`), `limit` de 1–25 e `cursor`. Cada tentativa concluída tem resultado total e por habilidade, calculado sobre a cópia da prova usada naquela tentativa. Tentativas ativas têm `result: null`. `pageSummary` agrega somente tentativas concluídas **da página retornada**, conforme `summaryScope: "this_page_only"`; não é o total histórico. Para comparar todo o histórico filtrado, percorra todas as páginas com os mesmos filtros até `isDone: true` e agregue os resultados. Os filtros de nível/status podem produzir página vazia com `isDone: false`: avance com `cursor` também nesse caso. A leitura de cada página tem orçamento limitado, sem interromper silenciosamente a paginação.

### Autoria Shiken, revisão e mídia de um job externo

`create_shiken_paper` recebe `{ "clientKey": "shiken:ocorrencia-0001", "paper": { ... } }` e retorna `{ "paper": { ...metadados } }`, incluindo o ID que pode ser vinculado em `paperIds` de uma quest. `clientKey` aceita 8–128 caracteres ASCII entre letras, números, `_`, `.`, `:` e `-`; é único por usuário. Preserve a chave e o payload original após uma falha: repetir devolve o mesmo ID, inclusive se o usuário editou ou arquivou a prova depois. A comparação usa o conteúdo original normalizado, e o retorno apresenta os metadados atuais. Outro conteúdo com a mesma chave retorna `CONFLICT` sem sobrescrever. Uma ocorrência diferente precisa de outra chave. A ferramenta não agenda jobs, não cria quests automaticamente e não altera tentativas existentes.

`paper` contém título, nível N5–N1, descrição e fonte opcionais e `questions`. Cada questão tem `id`, `skill` (`vocabulary`, `grammar`, `reading` ou `listening`), `kind`, enunciado `prompt`, `passage` opcional, `choices`, `correctChoice` (índice iniciado em zero), `explanation`, `audioUrl` e `imageUrl` opcionais. Os schemas publicados enumeram os tipos de questão; a validação de domínio verifica a combinação com habilidade e nível. Exigem-se ao menos uma questão de cada habilidade e áudio em todas as de escuta. Questões têm quatro alternativas; escuta também aceita três. IDs e alternativas devem ser únicos nos seus respectivos conjuntos, e o gabarito deve apontar para uma alternativa existente.

Limites da prova: até 200 questões e 400.000 bytes de JSON UTF-8 normalizado; título até 300 caracteres, descrição até 4.000 e fonte até 2.000. ID de questão aceita letras/números ASCII, `_` e `-`, até 100 caracteres. Enunciado e explicação até 12.000 cada, passagem até 16.000, alternativa até 2.000 e URL até 2.000. URLs devem usar HTTPS sem credenciais. O envelope HTTP MCP aceita até 512 KiB para acomodar a prova e os argumentos; isso não aumenta o limite do domínio. Não envie proprietário, estatísticas, progresso, estado de arquivo ou binários na criação.

`get_shiken_paper_content` recebe `id`, `questionOffset` (padrão 0), `questionLimit` (1–50, padrão 20) e `expectedContentVersion` opcional na primeira página. Retorna cabeçalho da prova, `totalQuestions`, `contentVersion`, `questionOffset`, questões completas e `nextQuestionOffset`. Continue usando o offset retornado e a versão da primeira página até `nextQuestionOffset: null`; offsets posteriores a zero exigem a versão. Se o conteúdo mudou, retorna `CONFLICT`: reinicie a leitura para não misturar edições. Cada página procura limitar as questões a 32.000 bytes, mas preserva inteira uma questão maior, sem truncar texto, gabarito ou explicação. A página representa o conteúdo editorial atual, não o snapshot usado numa tentativa antiga.

Criar prova, ler seu conteúdo editorial e preparar upload exigem `shiken:read` **e** `shiken:write`. Essa decisão conserva o contrato anterior de `shiken:read`, que não expunha respostas das provas. `get_shiken_paper`, `search_shiken_papers` e `get_shiken_history` permanecem sem gabaritos. `get_shiken_media` exige somente leitura e não revela a autorização de upload. Todos os IDs são verificados contra o proprietário autenticado; não é possível indicar outra conta no pedido.

Para arquivos produzidos por um job autorizado, use este fluxo:

1. Gere e valide o arquivo localmente, incluindo decodificação do áudio/imagem, e calcule tamanho em bytes e SHA-256 hexadecimal minúsculo de 64 caracteres.
2. Chame `prepare_shiken_media_upload` com `clientKey` estável por arquivo, `contentType`, `byteLength` e `sha256`. A resposta contém `id`, esses metadados, `status`, `url` e `upload`.
3. Se estiver `pending`, envie **os bytes brutos** com método `POST` para `upload.url`, usando `Content-Type: upload.contentType`. Não envie JSON, multipart ou base64. A URL contém uma autorização temporária de uma hora; não a registre em logs públicos nem a use como URL de reprodução.
4. Consulte `get_shiken_media({ id })`, que retorna `{ "media": { ... } }`. Somente `status: "ready"` com `url` permite referenciar o arquivo no campo `audioUrl` ou `imageUrl` correspondente da prova.
5. Publique a prova com `create_shiken_paper` e a chave estável da ocorrência. Se desejar incluir essa prova numa quest, use o ID efetivamente retornado.

São aceitos `audio/mpeg`, `audio/mp4`, `audio/wav`, `audio/aac`, `audio/ogg`, `audio/flac`, `image/png`, `image/jpeg` e `image/webp`, até **8 MiB por arquivo**. O endpoint valida tamanho, tipo declarado, assinatura básica do formato e hash; o job deve validar qualidade e decodificação antes de publicar. A mesma chave e os mesmos metadados reutilizam o ID; metadados diferentes retornam `CONFLICT`. Preparar novamente uma mídia pendente renova a autorização e invalida a URL anterior; se já estiver pronta, retorna `upload: null`. Após resposta de upload perdida, consulte o estado antes de reenviar. A consulta não retorna conteúdo binário nem renova o upload.

As mídias gerenciadas têm proprietário, recibo de publicação e tipo compatível com o campo da questão. A criação recusa referências gerenciadas de outra conta ou não prontas. URLs HTTPS externas continuam compatíveis com o domínio existente; não são copiadas nem validadas por download nesta chamada. A URL pronta do Convex permite reprodução a quem a conhece, conforme o funcionamento já usado no app; ela **não** é a URL temporária de upload e não expira com esse ticket. URLs devem ser compartilhadas somente conforme a autorização do usuário. Não há ferramenta de exclusão física nesta extensão.

### Quests e ocorrências agendadas pelo cliente

`create_quest` recebe `{ "quest": { ... } }`. Cada quest tem `clientKey`, título, início inclusivo `startsAt`, prazo exclusivo `dueAt` em Unix milissegundos, fuso IANA e os conjuntos `cardIds`, `paperIds` e/ou `storyIds`. A janela pode durar até 90 dias, deve terminar no futuro e pode começar até 365 dias à frente. Selecione ao menos um alvo na união das três listas, sem IDs repetidos dentro de cada uma. Todos devem pertencer ao usuário e estar ativos no momento da criação. As listas podem ser omitidas ou vazias quando outra lista contém um alvo; uma quest pode conter somente histórias.

O conjunto escolhido é imutável. Por exemplo, para praticar **10 kanji, 10 kotoba e 5 bunpou específicos**, consulte os cards/estatísticas, escolha esses 25 IDs reais e envie-os juntos em `cardIds`. Não há cota por categoria nem limite de 100 alvos por quest; os lotes internos da sessão não mudam o conjunto. Uma resposta na prática genérica não cumpre a quest: o usuário deve abrir sua sessão vinculada e praticar cada card escolhido, além de concluir cada prova e cada história selecionada. A sequência é cards, provas e histórias; cada lista preserva sua ordem. Conclusão exige o conjunto inteiro dentro do prazo. O MCP não aceita `description`, `objectives`, `quantity`, proprietário ou progresso enviado pelo cliente.

Para selecionar histórias, percorra `list_stories` e consulte `get_story`, ambos com `stories:read`. Envie os IDs reais em `storyIds`. O escopo `quests:write`, junto com `quests:read`, autoriza vincular alvos pessoais já conhecidos; ele não concede leitura ou autoria de histórias. Essa separação segue a seleção de cards e provas. A inclusão de histórias nas quests não acrescentou ferramentas nem escopos; o acréscimo atual de quatro ferramentas e `shiken:write` pertence à autoria Shiken.

Uma história pode aparecer em várias quests, mas cada uma exige sua própria leitura. O app envia `questId` nas ações vinculadas; concluir no catálogo avulso ou em outra quest não dá crédito. É necessário responder todas as perguntas e confirmar a conclusão antes do prazo, sem nota mínima. Não envie `completedStoryIds` ou outro progresso a `create_quest`.

Exemplo de construção dos argumentos com os resultados reais previamente escolhidos (o trecho apenas monta o pedido; não cria dados nem inventa IDs):

```js
const startsAt = Date.now();
const occurrence = {
  quest: {
    clientKey: 'plano-n5:ocorrencia-0001',
    title: 'Revisar os 25 cards escolhidos ao longo da semana',
    startsAt,
    dueAt: startsAt + 7 * 24 * 60 * 60 * 1000,
    timeZone: 'America/Sao_Paulo',
    cardIds: [
      ...dezKanjiEscolhidos,
      ...dezKotobaEscolhidos,
      ...cincoBunpouEscolhidos,
    ].map((card) => card.id),
    paperIds: provasEscolhidas.map((paper) => paper.id),
    storyIds: historiasEscolhidas.map((story) => story.id),
  },
};
// Envie occurrence a create_quest; preserve este objeto para uma eventual repetição.
```

`clientKey` identifica uma ocorrência por usuário (8–128 caracteres entre letras, números, `_`, `.`, `:` e `-`). Repetir a mesma chave e conteúdo devolve a mesma quest; reutilizá-la com outro conteúdo retorna `CONFLICT`. Preserve também os timestamps ao repetir após falha de rede. Para recorrência diária/semanal, uma automação externa autorizada deve gerar uma chave diferente por ocorrência, consultar progresso recente e criar a próxima quest. O servidor MCP não cria agendamentos nem executa chamadas futuras automaticamente. Se a execução perder o prazo, planeje uma nova ocorrência futura em vez de fingir conclusão de uma antiga.

`list_quests` aceita `status` (`all`, `open`, `completed`, `cancelled`), `limit` de 1–50 (padrão 20) e `cursor`; continue até `isDone: true`. `open` significa ainda não concluída nem cancelada e pode incluir quests vencidas: avalie `dueAt` para planejar atividades. Os snapshots retornam `cardIds`, `paperIds`, `storyIds`, `completedCardIds`, `completedPaperIds` e `completedStoryIds`, sem objetivos por contagem. Campos de histórias omitidos em registros legados equivalem a listas vazias. `get_quest` e `cancel_quest` recebem `{ "id": "ID_DA_QUEST" }`. Cancelar preserva o histórico; cancelar novamente é idempotente e uma quest concluída conserva a conquista. IDs e dados de outra conta nunca são aceitos.

Resultados bem-sucedidos têm `structuredContent` e uma cópia JSON em `content`. Erros de ferramenta têm `isError: true` e JSON em `content`, com código `VALIDATION`, `AUTH`, `CONFLICT` ou `UNAVAILABLE`; argumentos que violam o schema são rejeitados pelo SDK MCP. IDs de outros usuários recebem a mesma resposta de um recurso indisponível.

### Histórias — Monogatari e autoria externa

Histórias têm consentimento próprio: `stories:read` para `list_stories` e `get_story`; leitura junto de `stories:write` para `create_story`, `update_story`, `delete_story` e `set_story_archived`. Uma conexão exclusiva de histórias precisa também de `openid` e pode pedir `offline_access` para renovação. As permissões de biblioteca, quests e Shiken não concedem acesso às histórias. Os dois escopos já estão cadastrados e anunciados no Clerk de DEV e PROD e permitidos nos quatro clientes existentes. Os catálogos ChatGPT já foram atualizados; o estado do novo consentimento de cada conexão está registrado acima.

| Ferramenta           | Entrada                                                                                         | Resultado                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `list_stories`       | `level` N5–N1 opcional, `status` all/new/completed, `archived` boolean, `limit` 1–30 e `cursor` | `items` com título, nível, contagens de parágrafos/perguntas/caracteres e progresso; `cursor` e `isDone` |
| `get_story`          | `id`                                                                                            | `story` completo e `progress` ou `null`; inclui gabarito para autoria/planejamento                       |
| `create_story`       | `clientKey` e `story`                                                                           | `story` pessoal criado, sem progresso forjado                                                            |
| `set_story_archived` | `id` e `archived`                                                                               | `story` arquivado/restaurado, preservando conteúdo e histórico                                           |
| `update_story`       | `id`, `expectedContentVersion` inteiro positivo e `story` completo                              | `story` atualizado, com nova `contentVersion`                                                            |
| `delete_story`       | `id`                                                                                            | `story` com `archived: true`; exclusão reversível do catálogo ativo                                      |

`new` significa ainda não concluída, inclusive leituras em andamento. `archived` omitido é `false`; `true` consulta apenas arquivadas. Percorra `cursor` com os mesmos filtros até `isDone: true`, inclusive se uma página vier vazia. O histórico avulso é `list_stories` com `status: "completed"`. Esse progresso não inclui a leitura independente de uma quest; use `get_quest` e `completedStoryIds` para saber quais histórias foram concluídas naquela seleção. O progresso retornado só inclui ações sincronizadas: respostas pendentes no Android podem ainda não aparecer. Proprietário é sempre derivado do token autenticado; IDs de outra conta são indisponíveis.

`create_story` recebe `{ "clientKey": "leitura-diaria:2026-10-10", "story": { ... } }`. O conteúdo contém `title`, `level`, `paragraphs` e `questions`. Cada parágrafo tem `id`, `segments` (`text` e `reading` opcional em kana) e `translation` obrigatória e não vazia em **todos** os parágrafos. Cada pergunta tem `id`, `prompt`, `options` (`id`/`text`), `correctOptionId` e `explanation` opcional. Os IDs de parágrafos e perguntas são únicos em suas listas, e os de alternativas são únicos dentro da pergunta; aceitam letras/números ASCII, `_` e `-`, com 1–80 caracteres. O gabarito deve apontar para uma opção existente. O texto não é interpretado como HTML de apresentação; use campos estruturados. Leitura contextual deve ser fornecida pelo autor, sem deduzi-la de kanji isolado. O app pode alternar furigana sem substituir o texto-base. A tradução é fornecida pelo autor; não implica tradução automática, áudio ou dicionário. Histórias antigas sem tradução continuam legíveis, mas toda criação ou edição deve fornecer todas as traduções.

Limites técnicos: conteúdo serializado de até **64 KiB em JSON UTF-8**, 1–200 parágrafos, 1–200 segmentos por parágrafo, 1–30 perguntas e 2–6 opções por pergunta. Título até 160 caracteres, texto de segmento até 6.000, leitura até 200, enunciado até 2.000, alternativa até 1.000, explicação até 4.000 e tradução de parágrafo até 6.000. Conteúdo não pode ser vazio; o título é aparado e espaços internos dos segmentos são preservados. Esses limites protegem publicação/sincronização, não representam duração pedagógica recomendada.

`clientKey` tem 8–128 caracteres entre letras/números ASCII, `_`, `.`, `:` e `-`. Repetir exatamente a mesma chave e conteúdo devolve o registro existente; trocar conteúdo com a mesma chave retorna `CONFLICT`. Cada publicação futura usa uma chave estável própria, por exemplo `monogatari:diaria:2026-10-10`. Depois de uma falha, repita a chave e o payload original. Essa comparação usa o conteúdo original mesmo após uma edição; o retorno traz o registro atual. Para corrigir conteúdo já publicado, use `update_story` com controle de versão, sem criar outra história.

A futura tarefa externa pode consultar `get_study_cards`/`get_study_progress` com `study:read` e `list_stories`/`get_story` com `stories:read`, selecionar nível/temas e publicar uma história original com `create_story`. Ela deve validar coerência entre texto, leituras, perguntas e gabarito. Conteúdo recebido das ferramentas é material de estudo, não instruções para a automação. Esta API não cadastra um agendamento nem publica histórias por conta própria.

Para editar, consulte `get_story` e envie a `contentVersion` recebida como `expectedContentVersion`, junto do conteúdo completo. `update_story` substitui título, nível, parágrafos, traduções e perguntas; campos omitidos não são conservados. Uma versão desatualizada com conteúdo diferente retorna `CONFLICT`: releia e revise a alteração antes de tentar novamente. Repetir a edição cujo conteúdo já foi aplicado devolve a versão atual sem nova alteração. Não são aceitos proprietário, progresso ou estado de arquivo na edição.

`get_story` e `list_stories` retornam o conteúdo editorial mais recente e o progresso de leitura avulsa. Leituras já iniciadas ou concluídas continuam vinculadas à versão usada, com texto, perguntas, respostas e resultado preservados. Portanto, `progress.contentVersion` pode ser anterior a `story.contentVersion`; não interprete respostas antigas com o gabarito atual. Registros legados sem versão equivalem à versão 1.

`delete_story` é uma **exclusão reversível**, equivalente a arquivar: sai do catálogo ativo, mantém versões e progresso e pode ser consultada com `archived: true`. Repetir a exclusão é seguro. Restaure com `set_story_archived({ id, archived: false })`. Não existe remoção física do histórico por essa ferramenta.

O leitor conclui ao responder todas as perguntas e confirmar a conclusão; nota e estado de conclusão são separados. O MCP não aceita respostas, timestamps de conclusão ou proprietário na criação. `get_story` inclui o gabarito para o autor, mas o cliente não deve mostrá-lo antecipadamente ao estudante. Ao concluir, o resultado fica preservado; releitura não substitui respostas já concluídas.

## Validação

O fluxo inicial de alfabeto do deployment de desenvolvimento foi validado com uma conta temporária no Clerk: autorização real com PKCE, `initialize`, `tools/list`, `search_alphabet`, renovação do token e nova consulta após renovação. Os testes de vocabulário e gramática usam o SDK MCP oficial e JWTs assinados, cobrindo descoberta completa com tokens de escopos antigos, declaração de permissões por ferramenta, autorização separada por área antes de acessar dados, busca em todos os campos com AND/OR, paginação, edição parcial, arquivamento e isolamento entre usuários. Para gramática também verificam limites de explicação, resumo opcional, faces automáticas, rejeição atômica de conteúdo inválido e preservação de histórico e estatísticas. A conexão dentro da interface do ChatGPT precisa ser feita pelo usuário com os escopos desejados.

`npm test --workspace @beta/backend` cobre o protocolo com o cliente SDK oficial, a verificação de JWTs assinados, os escopos e o isolamento dos dados. Os testes de planejamento verificam consentimento independente, rejeição antes do acesso a dados, criação idempotente, paginação, cancelamento, recusa de proprietário/progresso forjados e janelas inválidas, exatidão dos indicadores e recusa de resumo acima do limite, além de descoberta e histórico Shiken isolados por conta. Os testes de histórias verificam descoberta com tokens antigos e novos, escopos declarados, recusa antes do gateway, autoria idempotente, edição com controle de versão e repetição segura, paginação, exclusão reversível/restauração preservando a versão lida e o progresso, isolamento entre contas, traduções obrigatórias em todos os parágrafos e rejeição atômica de IDs/leitura/gabarito/conteúdo inválidos. Para validar um novo deployment, conecte um cliente OAuth real, busque um card existente e confirme que aparece também no Android da mesma conta. Na publicação inicial, o smoke autenticado de leitura e refresh passou em DEV e PROD. Na extensão de histórias em quests, a interface ChatGPT confirmou o novo contrato nas 29 ferramentas dos dois plugins, sem repetir aquele smoke. A validação remota não criou, editou nem excluiu histórias pessoais.

Os testes locais da autoria Shiken cobrem as 33 ferramentas, os escopos separados antes do acesso aos dados, criação idempotente após edição/arquivamento, páginas editoriais com proteção de versão, ausência de gabarito na consulta de metadados, isolamento entre contas, provas acima do antigo limite de transporte e rejeição de conteúdo acima do limite do domínio. A integração de mídia cobre reserva idempotente, estados sem exposição do ticket nas consultas, limites, tipo/hash declarados e recusa de IDs de outra conta. A suite MCP passou com **39 testes**, junto do typecheck do backend, e os **66 JSON Schemas** passaram no Python `jsonschema`. O smoke real PROD acrescentou a evidência de OAuth, renovação e upload descrita acima; não exercitou a leitura editorial de uma prova existente, pois o catálogo estava vazio.

Por padrão, o smoke test `scripts/mcp-smoke.mjs` valida descoberta, PKCE S256, ferramentas esperadas, buscas de alfabeto, vocabulário e gramática, consultas de histórias, quests, cards com estatísticas e Shiken e renovação OAuth sem alterar dados. O catálogo publicado é de 33 ferramentas; os recibos antigos do smoke continuam referentes às 29 anteriores. A opção explícita `--shiken-authoring-check true` acrescenta leitura editorial paginada quando há uma prova, rejeição de uma prova inválida e publicação idempotente de dois arquivos neutros de teste, inclusive verificação após refresh; não cria uma prova válida nem quest. Essa opção realiza escrita de mídia e passou contra PROD nesta extensão, com os limites de cobertura registrados acima. Os escopos solicitados pelo script devem estar permitidos no cliente Clerk. Use um cliente de validação do ambiente correto com `http://127.0.0.1:8765/callback` cadastrado e execute no mesmo computador do navegador:

```sh
node scripts/mcp-smoke.mjs --server https://kindhearted-hare-87.convex.site/mcp --issuer https://genuine-lark-146.clerk.accounts.dev --client-id SEU_CLIENT_ID --port 8765
```

Abra a URL exibida e autorize sua conta. O script verifica `state` e `iss`, mantém tokens apenas em memória e imprime o resultado das operações, sem conteúdo dos cards. Remova o callback temporário após o teste.

Referências: [OAuth no Clerk](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth), [autorização MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [autenticação de apps no ChatGPT](https://developers.openai.com/plugins/build/auth).
