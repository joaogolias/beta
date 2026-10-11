# Produção do beta — BETA-23

Estado atualizado em 2026-10-11, no fuso `America/Sao_Paulo`. O backend de autoria Shiken e mídia foi publicado em DEV e PROD a partir de `/home/golias/projects/beta`, com 33 ferramentas. O plugin ChatGPT PROD importou o catálogo e reconectou com `shiken:write`; DEV ainda aguarda esse refresh e a nova autorização. O smoke real PROD passou com access token e refresh, publicando apenas dois arquivos neutros de teste. A automação semanal foi atualizada e ativada, sem execução manual. Nenhuma prova ou quest pessoal foi criada, e não houve novo APK.

## Publicação de autoria Shiken e mídia — estado atual

| Ambiente | Deployment            | Publicado em UTC           | Origem                       |
| -------- | --------------------- | -------------------------- | ---------------------------- |
| DEV      | `kindhearted-hare-87` | `2026-10-11T02:54:38.028Z` | `/home/golias/projects/beta` |
| PROD     | `glad-bison-698`      | `2026-10-11T02:55:45.716Z` | `/home/golias/projects/beta` |

Os recibos atuais `.tools/release-development-receipt.json` e `.tools/release-production-receipt.json` registram `status: deployed` para esta extensão. Esses arquivos foram sobrescritos e já não representam as publicações anteriores. A verificação atual em `.tools/deployed-mcp-verification.json` confirmou descoberta pública HTTP 200 com **15 escopos**, MCP sem autenticação HTTP 401 e CORS HTTP 204 nos dois ambientes. Anunciar escopos no backend não os cadastra no Clerk nem comprova consentimento.

O refresh do plugin **`beta PROD`** confirmou **33 ferramentas, 17 de leitura e 16 de escrita**, incluindo `create_shiken_paper`, `get_shiken_paper_content`, `prepare_shiken_media_upload` e `get_shiken_media`. O plugin **`beta DEV` não recebeu o refresh desta extensão**; a última confirmação dele permanece nas 29 ferramentas de histórias em quests.

Após autorização do usuário, `shiken:write` foi cadastrado como **Advertised** no Clerk PROD e permitido nos clientes ChatGPT `lwRmQRQ7spzNW8tB` e Codex `wXS5CdkfK1TNBuEU`. A conferência consta em `.tools/shiken-prod-scope-receipt.json`, em `2026-10-11T03:02:58.215Z`; callbacks e consentimento habilitado foram preservados. O consentimento Codex foi aceito, e o ChatGPT PROD reconectou após consentimento com `shiken:write`, retornando às configurações com `joaovgolias` como conta **Primary** e endpoint PROD. Tokens de outras conexões antigas continuam restritos aos escopos concedidos. Não houve atualização ou confirmação remota do novo escopo em DEV.

A validação final `npm run check` terminou com exit code 0, formatação, lint, tipos e **680 testes: 423 mobile, 231 backend e 26 scripts**, conforme `.tools/shiken-authoring-final-check.log`. Esse resultado substitui a contagem inicial de 677 testes. As 33 ferramentas têm **66 JSON Schemas** validados no Python `jsonschema`, e a suite MCP passou com **39 testes**.

O smoke real PROD passou com access token e após refresh: 33 ferramentas, schemas de autoria verificados, prova inválida rejeitada e duas mídias neutras verificadas de forma idempotente — WAV de 48 bytes e PNG de 68 bytes, total de **116 bytes**. Não criou prova válida (`validPapersCreated: 0`) nem quest. Não havia prova existente para a leitura editorial remota: `existingPaperPages: 0` e `existingPaperQuestions: 0`. A criação e releitura completas, incluindo gabarito e paginação, estão cobertas localmente; não foram demonstradas por esse smoke remoto.

A ferramenta instalada do plugin PROD também confirmou `search_shiken_papers({ limit: 1 })` sem erro, com catálogo vazio e `isDone: true`. A evidência consolidada desta entrega está em `.tools/shiken-authoring-release-receipt.json`; os recibos antigos de 29 ferramentas permanecem históricos.

A automação existente `simulado-jlpt-semanal` foi atualizada com o prompt de `.tools/shiken-weekly-prompt.txt` e ativada em `2026-10-11T03:05:35.216Z`. O arquivo de configuração confirmou prompt exato, estado **ACTIVE**, mesmo ID, destino e agenda preservada: **domingo, 00:01, `America/Sao_Paulo`**. O job não foi executado manualmente nesta etapa; nenhuma prova ou quest pessoal foi criada.

## Histórico: publicação de histórias em quests — 10/10/2026

| Ambiente | Deployment            | Publicado em UTC           | Origem                       |
| -------- | --------------------- | -------------------------- | ---------------------------- |
| DEV      | `kindhearted-hare-87` | `2026-10-11T02:38:13.440Z` | `/home/golias/projects/beta` |
| PROD     | `glad-bison-698`      | `2026-10-11T02:38:52.368Z` | `/home/golias/projects/beta` |

A evidência preservada dessa entrega está em `.tools/quest-stories-release-receipt.json`. Naquela etapa a verificação pública confirmou 14 escopos, HTTP 200/401/204 e presença das dez funções de histórias e seis de quests. Os recibos genéricos de deploy e `.tools/deployed-mcp-verification.json` foram depois sobrescritos pela autoria Shiken; seus conteúdos atuais não são evidência histórica de quests. A publicação inicial anterior ocorreu em `02:04:30.903Z` (DEV) e `02:05:22.290Z` (PROD) na mesma data UTC.

**Plugins naquela publicação:** `beta DEV` e `beta PROD` concluíram o refresh da extensão de histórias em quests. A interface mostrou `create_quest` com `storyIds` e seleção só de histórias ou mista; `get_quest` anunciou `completedStoryIds`, com **15 ferramentas de leitura e 14 de escrita**. Não houve novo escopo ou novo consentimento nessa etapa. A evidência sanitizada está em `.tools/quest-stories-release-receipt.json`; ela não valida o refresh posterior de autoria Shiken.

`npm run check` passou com formatação, lint, tipos e **661 testes** (423 mobile, 215 backend e 23 scripts). A suite MCP contém 35 testes, e os 58 schemas de entrada/saída foram validados no Python `jsonschema`. Esta extensão não incluiu outro smoke OAuth completo nem geração ou instalação de APK.

### Evidência histórica da publicação inicial de quests e histórias

Antes da extensão, os seis escopos `quests:read`, `quests:write`, `study:read`, `shiken:read`, `stories:read` e `stories:write` foram criados e anunciados nas duas instâncias Clerk. `.tools/oauth-scope-update-report.json` registra a atribuição aos quatro clientes ChatGPT/Codex DEV/PROD, preservando permissões e callbacks anteriores. Tokens emitidos antes do consentimento continuam restritos aos escopos originalmente concedidos.

Na importação inicial das 29 ferramentas, uma incompatibilidade do padrão Unicode dos JSON Schemas de histórias foi corrigida mantendo a validação de kana. Naquela etapa passaram 34 testes MCP, tipos, lint e a validação dos 58 schemas com Python `jsonschema`.

O smoke `scripts/mcp-smoke.mjs` da publicação inicial passou em DEV e PROD com autorização PKCE, catálogo de 29 ferramentas e oito chamadas de leitura com access token e após refresh, sem alterar dados pessoais. `.tools/authenticated-mcp-smoke-evidence.json` registra esse teste anterior, sem horários exatos inventados. Os consentimentos com os seis novos escopos e o retorno conectado no ChatGPT estão em `.tools/chatgpt-plugin-update-receipt.json`. Esses arquivos históricos não comprovam uma nova execução de smoke ou reconexão na extensão atual.

## Inventário por ambiente

| Componente                       | Desenvolvimento                                                       | Produção                                                        |
| -------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| Convex                           | `kindhearted-hare-87`                                                 | `glad-bison-698`, funções/schema/índices publicados             |
| API mobile                       | `https://kindhearted-hare-87.convex.cloud`                            | `https://glad-bison-698.convex.cloud`                           |
| MCP/ChatGPT                      | `https://kindhearted-hare-87.convex.site/mcp`                         | `https://glad-bison-698.convex.site/mcp`                        |
| Domínio do aplicativo / DNS      | —                                                                     | `beta.golias.dev` / Cloudflare, definidos pelo proprietário     |
| Clerk issuer                     | `https://genuine-lark-146.clerk.accounts.dev`                         | `https://clerk.beta.golias.dev`; DNS e TLS válidos              |
| Chaves Clerk                     | `pk_test_…` / `sk_test_…`                                             | Live configuradas; chave secreta somente no Convex PROD         |
| OAuth ChatGPT                    | Cliente público `o3rjBpCxzXJ3J2LD`, PKCE, consentimento ativo         | Cliente público `lwRmQRQ7spzNW8tB`, PKCE e consentimento ativos |
| OAuth de validação               | Cliente público `mv8B8GOEV0KRJ3kc`                                    | Cliente público `wXS5CdkfK1TNBuEU`, PKCE e consentimento ativos |
| Android package / retorno Google | `com.beta.app.dev` / `beta-dev://sso-callback`                        | `com.beta.app` / `beta://sso-callback`                          |
| Build Android                    | `.env.android.development.local` (aceita legado `.env.android.local`) | `.env.android.production.local`, sem fallback DEV               |
| Assinatura Android               | Keystore local existente, fora do Git                                 | Keystore próprio e chave pública Clerk live configurados        |
| Interface                        | Ícone e faixa DEV, inclusive login, erros e modais                    | Ícone original e nenhuma faixa                                  |

O app usa Convex para banco, funções e arquivos dos simulados; Clerk para contas, Google e OAuth do MCP; Android para lembretes/widget e SQLite/SecureStore para dados locais. Não há API de modelo OpenAI nem chave GPT no app: o plugin ChatGPT chama o MCP autenticado. Não há EAS, Play Store ou serviço de push remoto no fluxo atual. Os dados/seeds pessoais de DEV não fazem parte da preparação de PROD.

O aplicativo Clerk se chama `beta`; nome e slug do projeto Convex também foram confirmados como `beta` no painel.

## Clerk e DNS confirmados

Instância PROD: `ins_3KDn0DfeXk1AUIkXdtuMpm2JhdI`, configurada como **Secondary application** de `beta.golias.dev`. Domínio Clerk: `dmn_3KDn0CXQYTMBJfjSxxwf5Rl6hbK`. Os registros abaixo estão na zona `golias.dev`, como CNAME, **DNS only** e TTL **Auto**:

| Nome na zona           | Destino                             |
| ---------------------- | ----------------------------------- |
| `clerk.beta`           | `frontend-api.clerk.services`       |
| `accounts.beta`        | `accounts.clerk.services`           |
| `clkmail.beta`         | `mail.0qlsfstsy3ab.clerk.services`  |
| `clk._domainkey.beta`  | `dkim1.0qlsfstsy3ab.clerk.services` |
| `clk2._domainkey.beta` | `dkim2.0qlsfstsy3ab.clerk.services` |

O painel confirmou **Frontend API Verified**, **Account portal Verified** e **Email 3/3 Verified**. A verificação pública posterior confirmou TLS válido em `clerk.beta.golias.dev` e `accounts.beta.golias.dev`, discovery OAuth HTTP 200 com o issuer correto e PKCE `S256`, e JWKS HTTP 200. O portal de contas apresentou desafio Cloudflare em requisições de terminal; posteriormente, sua página de login foi aberta no navegador e iniciou o redirecionamento Google descrito abaixo.

## O que já foi aplicado no Convex de produção

No deployment `glad-bison-698`, foram definidos:

```dotenv
CLERK_JWT_ISSUER_DOMAIN=https://clerk.beta.golias.dev
CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuYmV0YS5nb2xpYXMuZGV2JA
MCP_RESOURCE_URL=https://glad-bison-698.convex.site/mcp
MCP_ALLOWED_OAUTH_CLIENT_IDS=lwRmQRQ7spzNW8tB,wXS5CdkfK1TNBuEU
MCP_ALLOWED_ORIGINS=https://chatgpt.com,https://chat.openai.com
LIBRARY_CARD_ORDER_ENABLED=true
LIBRARY_READING_ORDER_ENABLED=true
```

As duas flags foram conferidas no DEV antes da cópia. O issuer, a chave publicável e a allowlist dos dois clientes OAuth PROD foram definidos e conferidos pela CLI. A `CLERK_SECRET_KEY` live foi armazenada somente no Convex PROD; seu valor não foi versionado nem incluído no APK. Nenhuma chave de DEV foi copiada para PROD.

Na preparação inicial de 04/10, o preflight remoto foi aprovado com login local e destino explícito `glad-bison-698`. O dry-run confirmou esse destino; o deploy subsequente publicou funções, schema e índices com typecheck habilitado. A verificação pública confirmou `/version` HTTP 200, os dois endpoints de metadata OAuth HTTP 200 com resource/issuer PROD e os seis escopos de cards, `GET` e `POST /mcp` sem token HTTP 401 com challenge OAuth, e preflight CORS do ChatGPT HTTP 204. Nenhuma mutação de usuário ou seed foi executada nessa preparação. A publicação mais recente e seus escopos adicionais estão registrados acima.

Os clientes OAuth DEV do Clerk foram renomeados para `beta MCP - ChatGPT DEV` e `beta MCP - Codex DEV`, preservando IDs e callbacks; os escopos foram ampliados na publicação de 10/10. O plugin ChatGPT DEV existente foi renomeado para `beta DEV`. Ele e o [plugin ChatGPT `beta PROD`](https://chatgpt.com/plugins/plugin_asdk_app_6ac21d03b148819180a3dd4932b80097) tiveram descrições e catálogos atualizados. Os segredos de GitHub Environments não foram validados por esta publicação local.

## Clerk e Google configurados

A Native API está habilitada, com `com.beta.app`, o SHA-256 de produção abaixo e `beta://sso-callback` cadastrados. A integração Convex do Clerk está habilitada. Issuer e chaves live estão configurados no backend; a chave pública também está no arquivo local do APK PROD.

O projeto Google Cloud `beta` (`beta-golias-prod`) foi criado sem ativar billing ou serviços adicionais. O branding usa nome `beta`, suporte `joaovgolias@gmail.com` e público externo. Com autorização do proprietário, a **User Data Policy** foi aceita e o cliente Google OAuth do tipo **Web application**, `beta Clerk PROD`, foi criado. Seu Client ID e client secret foram salvos na conexão Google da instância Clerk PROD, que confirmou o provedor habilitado para autenticação. O client secret ficou somente no Clerk; não foi gravado localmente nem incluído no APK.

- Client ID público Google: `1014364249447-qcqpfdatdj3htrgosq3l4uido6iss45r.apps.googleusercontent.com`.
- Origem autorizada: `https://beta.golias.dev`.
- Redirect URI: `https://clerk.beta.golias.dev/v1/oauth_callback`.
- Escopos Google: `openid`, `userinfo.email` e `userinfo.profile`.

Na preparação inicial de 04/10, uma tentativa nova em `https://accounts.beta.golias.dev/sign-in`, pelo botão **Continuar com Google**, abriu `accounts.google.com/v3/signin/accountchooser` com o Client ID acima, sem `authError` nem o erro de parâmetro `client_id` ausente. Nenhuma conta foi escolhida naquele teste. O OAuth/MCP autenticado foi posteriormente validado pelo smoke de 10/10; isso não substitui a validação do login e retorno nativo do Android.

1. Validar entrada por e-mail/senha e Google, cadastro, recuperação e verificação exigida pela nova instância, incluindo o retorno nativo `beta://sso-callback`.
2. Confirmar no fluxo real que o token da integração Convex autentica com audience `convex` e que a conta acessa somente seus próprios dados.

SSO, integrações e paths exigem revisão própria na clonagem. O checklist oficial está em [Clerk: produção](https://clerk.com/docs/guides/development/deployment/production); configuração Convex em [Convex + Clerk](https://docs.convex.dev/auth/clerk).

## Conectar e validar o plugin ChatGPT

O Clerk PROD está configurado para access tokens JWT com **Include audience** e consentimento ativo nos dois clientes públicos. O smoke utiliza PKCE **S256**, mas a configuração preservada de ambos é `pkceRequired: false`; isso corrige a afirmação anterior de que PKCE era obrigatório nesses clientes.

| Cliente                  | ID público         | Callback cadastrado                                     | Escopos                                     |
| ------------------------ | ------------------ | ------------------------------------------------------- | ------------------------------------------- |
| ChatGPT PROD             | `lwRmQRQ7spzNW8tB` | `https://chatgpt.com/connector_platform_oauth_redirect` | Os 15 escopos MCP, mais `email` e `profile` |
| Codex PROD / smoke local | `wXS5CdkfK1TNBuEU` | `http://127.0.0.1:8765/callback`                        | Os 15 escopos MCP                           |

Os 15 escopos MCP permitidos nos dois clientes PROD são `openid`, `offline_access`, `alphabet:read`, `alphabet:write`, `vocabulary:read`, `vocabulary:write`, `grammar:read`, `grammar:write`, `quests:read`, `quests:write`, `study:read`, `shiken:read`, `shiken:write`, `stories:read` e `stories:write`. A inclusão de `shiken:write` foi autorizada e confirmada remotamente. A allowlist do Convex contém somente esses dois IDs PROD; os clientes DEV permanecem separados.

1. Abrir o [plugin `beta PROD` já criado](https://chatgpt.com/plugins/plugin_asdk_app_6ac21d03b148819180a3dd4932b80097), com URL `https://glad-bison-698.convex.site/mcp`, autenticação OAuth, Client ID `lwRmQRQ7spzNW8tB` e ícone configurados. Atualizar o catálogo e reconectar a conta de produção para consentir aos novos escopos. Para cliente público PKCE, não fornecer client secret nem chave secreta Clerk ao ChatGPT.
2. Conferir o **redirect URI exato mostrado pelo ChatGPT** contra o callback já cadastrado; se o callback exibido divergir, atualizar a allowlist desse cliente. [Autenticação oficial de plugins](https://developers.openai.com/plugins/build/auth).
3. O catálogo PROD confirmou as 33 ferramentas, o consentimento com `shiken:write` foi concluído e o smoke validou consultas autenticadas, renovação e upload das duas mídias neutras. A leitura editorial de prova existente não ocorreu porque o catálogo estava vazio. Repetir o refresh e o consentimento em `beta DEV`, mantendo seu endpoint separado; essa etapa DEV ainda não foi realizada.

O endpoint rejeita chaves Clerk test/live misturadas, chave pública de outro issuer e resource fora da origem Convex configurada. As verificações de assinatura, audience, usuário, cliente e escopo continuam em cada chamada. Ver [MCP](mcp.md).

## Credenciais e publicação

Os exemplos completos estão em [Android PROD](../.env.android.production.example) e [backend PROD](../backend/.env.production.example). O segundo é um inventário: não carrega variáveis automaticamente. Nunca versionar valores secretos.

A identidade Android PROD foi criada em `/home/golias/.config/beta/production.p12`, alias `beta-production`, certificado `CN=beta`, RSA 3072. A senha está somente no arquivo local ignorado `.env.android.production.local`; ambos têm permissão `600`. Esse arquivo tem endpoint PROD, SDK/JDK, versão `0.1.0`/code `1` e `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` da instância live. A inclusão da chave pública preservou os demais valores, a assinatura e as permissões do arquivo. Guardar backup privado dessa identidade antes da distribuição e reutilizá-la nas atualizações.

O [APK release PROD 0.1.0/code 1](../artifacts/production/beta-production-0.1.0-1-ae9f1e12fdd8-dirty/beta-production-0.1.0-1-ae9f1e12fdd8-dirty.apk) foi gerado e validado, com cerca de 104 MB. A verificação confirmou assinatura de produção, package `com.beta.app`, scheme `beta`, bundle autônomo, configuração pública PROD e ícones de produção. O `appEnv=production` embutido desativa a faixa DEV; ainda não houve execução em aparelho. O relatório local está em `.tools/beta-production-apk-validation.json`.

SHA-256 do APK:

```text
687730153f084f69627c9c5d6f5a455080a0a8db25e619bc5f9e62affc9fe974
```

SHA-256 público para Native applications do Clerk:

```text
CC:3E:54:5E:C1:AD:0C:A8:74:25:56:0D:F7:A2:63:C6:F7:12:2F:F7:AB:A3:2D:48:A5:EF:F4:A1:C8:E1:14:1F
```

No GitHub Environment `production`, configurar:

- Variables: `EXPO_PUBLIC_CONVEX_URL=https://glad-bison-698.convex.cloud` e `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` live.
- Secrets Android: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` da identidade de produção.
- Secret backend: `CONVEX_DEPLOY_KEY` restrita a `prod:glad-bison-698`. A chave de deploy não é a chave Clerk e não entra no app.

O workflow de backend verifica o destino e as variáveis remotas antes do deploy. O workflow Android usa o Environment selecionado. Para conferir a produção localmente com o login Convex já existente:

```sh
npm run production:check -- --use-login
```

Para verificações e builds locais, usar sempre a pasta atual:

```sh
cd /home/golias/projects/beta
npm run check
npm run android:apk -- --environment production
```

Para validar OAuth/MCP, usar o smoke documentado em [MCP](mcp.md), passando o endpoint, issuer e cliente de validação **de produção**. Por padrão ele checa PKCE S256, ferramentas, buscas e refresh sem escrita. A opção explícita `--shiken-authoring-check true` publica dois arquivos neutros de teste de forma idempotente, revisa conteúdo editorial quando há uma prova e testa a rejeição de uma prova inválida; não cria prova válida ou quest. Esse smoke passou em PROD com os limites de cobertura registrados acima. Validar também no ChatGPT real; o smoke não substitui a conexão e a validação do plugin.

## Aceite pendente

- Atualizar o catálogo ChatGPT DEV para as 33 ferramentas e autorizar o novo escopo em seu ambiente separado. Em PROD, escopo, consentimento, catálogo e smoke já foram confirmados.
- Validar a leitura editorial remota quando houver uma prova existente autorizada para consulta; o smoke encontrou catálogo vazio e não criou uma prova para preencher essa lacuna. A cobertura de criação e releitura permanece local.

Na preparação inicial de 04/10, `npm run check` passou (430 testes, TypeScript, ESLint e formatação), assim como a exportação Android. A prévia web foi conferida em DEV/PROD, incluindo a faixa no login e no modal, fechamento da janela e ausência da faixa em PROD. Os ícones legado/adaptativo/temático foram inspecionados e os arquivos de produção preservados. O histórico de validação posterior de histórias está em [Histórias](stories.md). Esses testes e a publicação do backend não validam teclado, insets e autenticação em aparelho físico.

- Fluxos de entrada por e-mail/Google e JWT Convex funcionando com conta real; as credenciais Google PROD já estão configuradas.
- GitHub Environments preenchidos e fluxo CI validado; o preflight local remoto já passou.
- APK release PROD assinado: entrada por e-mail/Google, retorno ao app, sincronização e reabertura offline em aparelho físico.
- DEV e PROD instalados lado a lado: DEV no ícone/telas/janelas de DEV; nenhuma tag em PROD; sessões e dados isolados.

Esta lista permanece pendente enquanto depender de credenciais ou verificações reais. Testes locais, mocks ou a prévia visual não constituem aceite remoto.
