# MCP remoto do Babel Crux

Endpoint: `https://kindhearted-hare-87.convex.site/mcp`.

O servidor usa MCP Streamable HTTP sobre HTTPS, sem sessão persistida no processo. O Clerk faz o login, o consentimento OAuth, a troca de código com PKCE S256 e a renovação por refresh token. Os cards pertencem ao usuário que autorizou a conexão e são os mesmos exibidos no Android.

## Conectar um cliente

No cadastro de um app/conector MCP do ChatGPT, use o endpoint acima e autenticação OAuth. Informe o Client ID do cliente dedicado criado em **Clerk → OAuth applications**. Um cliente público usa PKCE e não exige Client Secret.

No ambiente de desenvolvimento configurado, o cliente é **Babel Crux MCP - ChatGPT**, com Client ID `o3rjBpCxzXJ3J2LD` (identificador público).

Nesse cliente de desenvolvimento, os escopos de vocabulário e os novos `grammar:read` e `grammar:write` já estão cadastrados e permitidos no Clerk, mantendo os escopos de alfabeto, os callbacks e o consentimento existentes. A configuração não altera tokens já emitidos: reconecte a integração para autorizar as novas permissões.

O cliente existente **Babel Crux MCP - Codex Dev**, Client ID público `mv8B8GOEV0KRJ3kc`, também permite `grammar:read` e `grammar:write`. Seu callback local e o consentimento foram preservados; conexões anteriores também precisam autorizar os novos escopos.

O cliente ChatGPT dedicado deve permitir o callback `https://chatgpt.com/connector_platform_oauth_redirect`, manter o consentimento habilitado e permitir os escopos `openid`, `offline_access`, `alphabet:read`, `alphabet:write`, `vocabulary:read`, `vocabulary:write`, `grammar:read` e `grammar:write`. O callback estável depende do suporte a `authorization_response_iss_parameter_supported` anunciado pelo Clerk; confirme a configuração ao usar outra instância.

Alfabeto, vocabulário e gramática têm permissões separadas. Tokens existentes com `openid` e escopos de alfabeto ou vocabulário continuam funcionando nas áreas autorizadas. Em outra instalação, cadastre os dois escopos de gramática no Clerk e permita-os no cliente OAuth; depois reconecte o cliente e dê um novo consentimento. Uma conexão somente de gramática precisa de `openid` e `grammar:read`; escrita exige também `grammar:write`. Ela não exige acesso ao alfabeto ou vocabulário. A mesma regra vale para as outras áreas. `offline_access` permite renovação da conexão, mas não autoriza dados por si só. Os desafios 403 indicam a permissão necessária à operação, sem pedir acesso a outra área.

`tools/list` exige autenticação e mostra as 14 ferramentas, cada uma com os escopos OAuth necessários em `_meta.securitySchemes`, inclusive as áreas ainda não autorizadas pelo token. Isso permite ao cliente descobrir novas ferramentas e solicitar o consentimento correspondente, sem ficar preso ao catálogo dos escopos antigos. A descoberta não concede acesso aos dados: cada chamada continua exigindo seus próprios escopos; leitura libera busca e consulta, e escrita junto com leitura libera criação, edição e arquivamento. Chamar uma ferramenta sem a permissão necessária retorna 403 antes de acessar os dados. Após adicionar uma área como gramática, atualize as ferramentas no cliente e reconecte para autorizar os novos escopos.

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

| Ferramenta                | Escopo                                 | Comportamento                                                                                       |
| ------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `search_alphabet`         | `alphabet:read`                        | Busca pessoal por texto, leitura, radical, idioma, escrita ou nível; suporta paginação e arquivados |
| `get_alphabet`            | `alphabet:read`                        | Consulta completa de um card pessoal pelo ID                                                        |
| `create_alphabet`         | `alphabet:read` + `alphabet:write`     | Cria um card, rejeitando símbolos duplicados inclusive arquivados                                   |
| `update_alphabet`         | `alphabet:read` + `alphabet:write`     | Atualiza somente os campos enviados, preservando histórico de estudo                                |
| `search_vocabulary`       | `vocabulary:read`                      | Busca nos campos do vocabulário com AND/OR, filtros e paginação; inclui IDs e resumo                |
| `get_vocabulary`          | `vocabulary:read`                      | Consulta completa de um card pessoal de vocabulário pelo ID                                         |
| `create_vocabulary`       | `vocabulary:read` + `vocabulary:write` | Cria vocabulário, rejeitando a combinação duplicada de idioma, expressão e leitura                  |
| `update_vocabulary`       | `vocabulary:read` + `vocabulary:write` | Edita conteúdo e classificações parcialmente, preservando ID, proprietário e histórico              |
| `set_vocabulary_archived` | `vocabulary:read` + `vocabulary:write` | Arquiva ou restaura um card, sem apagar dados ou estatísticas                                       |
| `search_grammar`          | `grammar:read`                         | Busca em todos os campos pessoais de gramática, com AND/OR, filtros, IDs, resumo e paginação        |
| `get_grammar`             | `grammar:read`                         | Consulta completa de um card pessoal de gramática pelo ID                                           |
| `create_grammar`          | `grammar:read` + `grammar:write`       | Cria título, explicação completa, resumo e exemplos opcionais e classificações                      |
| `update_grammar`          | `grammar:read` + `grammar:write`       | Edita parcialmente qualquer campo de conteúdo; preserva ID, proprietário e histórico                |
| `set_grammar_archived`    | `grammar:read` + `grammar:write`       | Arquiva ou restaura sem apagar conteúdo, respostas ou estatísticas                                  |

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

Resultados bem-sucedidos têm `structuredContent` e uma cópia JSON em `content`. Erros de ferramenta têm `isError: true` e JSON em `content`, com código `VALIDATION`, `AUTH`, `CONFLICT` ou `UNAVAILABLE`; argumentos que violam o schema são rejeitados pelo SDK MCP. IDs de outros usuários recebem a mesma resposta de um card indisponível.

## Validação

O fluxo inicial de alfabeto do deployment de desenvolvimento foi validado com uma conta temporária no Clerk: autorização real com PKCE, `initialize`, `tools/list`, `search_alphabet`, renovação do token e nova consulta após renovação. Os testes de vocabulário e gramática usam o SDK MCP oficial e JWTs assinados, cobrindo descoberta completa com tokens de escopos antigos, declaração de permissões por ferramenta, autorização separada por área antes de acessar dados, busca em todos os campos com AND/OR, paginação, edição parcial, arquivamento e isolamento entre usuários. Para gramática também verificam limites de explicação, resumo opcional, faces automáticas, rejeição atômica de conteúdo inválido e preservação de histórico e estatísticas. A conexão dentro da interface do ChatGPT precisa ser feita pelo usuário com os escopos desejados.

`npm test --workspace @babel-crux/backend` cobre o protocolo com o cliente SDK oficial, a verificação de JWTs assinados, os escopos e o isolamento dos dados. Para validar um novo deployment, conecte um cliente OAuth real, busque um card existente e confirme que aparece também no Android da mesma conta.

O smoke test `scripts/mcp-smoke.mjs` valida descoberta, PKCE, busca no alfabeto e no vocabulário e renovação OAuth sem alterar cards. Os escopos solicitados pelo script devem estar permitidos no cliente Clerk. A validação remota de gramática também precisa de consentimento para os novos escopos. Cadastre temporariamente `http://127.0.0.1:8765/callback` no cliente Clerk e execute no mesmo computador do navegador:

```sh
node scripts/mcp-smoke.mjs --server https://kindhearted-hare-87.convex.site/mcp --issuer https://genuine-lark-146.clerk.accounts.dev --client-id SEU_CLIENT_ID --port 8765
```

Abra a URL exibida e autorize sua conta. O script verifica `state` e `iss`, mantém tokens apenas em memória e imprime o resultado das operações, sem conteúdo dos cards. Remova o callback temporário após o teste.

Referências: [OAuth no Clerk](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth), [autorização MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [autenticação de apps no ChatGPT](https://developers.openai.com/plugins/build/auth).
