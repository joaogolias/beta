# beta

Aplicativo Android para estudar japonês com um catálogo pessoal de kanji, vocabulário e gramática, organizado de N5 a N1. A base usa React Native com Expo, autenticação Clerk e backend Convex. O nome visível é **beta**; o repositório, os ambientes e os identificadores técnicos continuam como Babel Crux para preservar instalações e contas existentes.

## Escopo desta base

- [BAB-5 — Scaffolding 1](https://linear.app/babel-crux/issue/BAB-5): cadastro e login por Google ou e-mail e senha, recuperação de senha e saída; sessão persistida com o cache oficial do Clerk em SecureStore; área autenticada com navegação inicial. O cadastro não exige confirmação de e-mail, e o login não usa Device Trust.
- [BAB-6 — Scaffolding 2](https://linear.app/babel-crux/issue/BAB-6): validação do token Clerk pelo Convex, criação idempotente do perfil e consultas restritas à identidade autenticada. A troca de conta descarta o cliente e o cache Convex anteriores.
- [BAB-7 — Scaffolding 3](https://linear.app/babel-crux/issue/BAB-7): validação automática, build manual de APK release com assinatura estável por ambiente, instalação por USB/ADB e deploy do backend em workflow separado.

- [BAB-8 — Alfabeto](https://linear.app/babel-crux/issue/BAB-8): biblioteca pessoal de kanji com significados, kun’yomi, on’yomi, radicais, exemplos, múltiplos níveis JLPT, edição e arquivamento; estudo direto ou adaptativo com revelação, três avaliações, retomada e histórico por versão.
- [BAB-10 — MCP](https://linear.app/babel-crux/issue/BAB-10): servidor remoto com OAuth 2.0 do Clerk, PKCE e ferramentas para buscar, consultar, criar e atualizar caracteres da mesma biblioteca pessoal. Consulte [configuração e conexão MCP](docs/mcp.md).
- [BAB-9 — Vocabulário](https://linear.app/babel-crux/issue/BAB-9): palavras e expressões pessoais com leitura em kana opcional, traduções em português e inglês, exemplos, níveis JLPT e cards automáticos; cadastro, busca, edição, arquivamento e integração aos estudos e histórico.
- [BAB-11 — MCP de vocabulário](https://linear.app/babel-crux/issue/BAB-11): busca em todos os campos com AND/OR e filtro de nível, consulta por ID e alterações com as mesmas validações do aplicativo; permissões OAuth próprias de leitura e escrita.
- [BAB-12 — Gramática](https://linear.app/babel-crux/issue/BAB-12): aba Bunpou com estruturas pessoais, explicação completa, resumo e exemplos opcionais, com cards automáticos; múltiplos níveis JLPT, edição, arquivo e integração aos estudos e histórico.
- [BAB-13 — MCP de gramática](https://linear.app/babel-crux/issue/BAB-13): busca em todos os campos com AND/OR, consulta por ID e edição parcial; permissões OAuth `grammar:read` e `grammar:write`.
- [BAB-14 — Cards de memória](https://linear.app/babel-crux/issue/BAB-14): sessões com ordem e conteúdo congelados, três avaliações, retomada, correção da última resposta e progresso filtrado por categoria e nível, separando cards ativos e arquivados.
- [BAB-15 — Simulados JLPT](https://linear.app/babel-crux/issue/BAB-15): módulo Shiken separado dos cards, com provas de múltipla escolha, quatro áreas, blocos e tempos por nível, áudio, correção automática, histórico próprio e sincronização offline. Consulte [simulados e critérios de aplicação](docs/exams.md).
- [BAB-18 — Uso offline](https://linear.app/babel-crux/issue/BAB-18): consulta e estudo no Benkyou e Shiken com conteúdo baixado, consentimento para entrar offline e sincronização ao escolher voltar online. Cadastro e edição exigem conexão.
- [BAB-21 — Sequência diária](https://linear.app/babel-crux/issue/BAB-21): dias consecutivos de uso por conta, registro offline, contador na tela inicial do Android e lembretes opcionais nos dias sem uso.
- [BAB-22 — Mascote ibex](https://linear.app/babel-crux/issue/BAB-22): Betinha, a ibex escaladora com pelagem natural, sem cachecol ou bochechas rosadas, na entrada, sequência diária, resumo de estudo, ícone e widget; cinco cenas de escalada aprovadas e animações curtas com suporte a movimento reduzido.

Esta versão tem alvo Android, sem publicação na Play Store. O modelo distingue caracteres, vocabulário, gramática e provas, idioma, sistema de escrita e detalhes específicos de kanji; a interface atual oferece japonês. O Shiken usa alternativas e correção automática. Seus resultados são acertos e percentuais do simulado, sem estimar a nota ou aprovação oficial do JLPT.

Cada sessão permite selecionar até 100 cards, com até 1.000 cards ativos na biblioteca nesta primeira versão. O estudo adaptativo prioriza cards ainda não vistos, menor índice ponderado de acertos e tempo desde a última prática. O índice ponderado considera acerto parcial como metade de um acerto; a taxa de acerto integral é exibida separadamente.

Nos cards de kanji, a frente é sempre o símbolo e o verso é montado automaticamente com significado, kun’yomi, on’yomi e radical. As leituras e os radicais são opcionais e aparecem como “—” quando não informados. Editar os dados atualiza o card; o histórico conserva o conteúdo das tentativas anteriores.

No vocabulário, a expressão e ao menos uma tradução são obrigatórias. A leitura em kana pode ser omitida marcando **Não informar leitura**; sem essa opção, é obrigatória. O card é automático: expressão na frente e leitura, traduções e exemplos disponíveis no verso. As sessões permitem estudar alfabeto, vocabulário, gramática ou todas as categorias.

Na gramática, título/estrutura, explicação completa e ao menos um nível JLPT são obrigatórios. Explicação curta e exemplos são opcionais. O card mostra a estrutura na frente, resumo e exemplos no verso; **Ver explicação completa** abre o texto completo, inclusive quando não há resumo. Os níveis são explícitos: escolher N5 e N3 não inclui N4. Editar ou arquivar mantém o ID e o histórico; sessões já criadas conservam sua versão do conteúdo. A busca cobre explicações, exemplos e classificações, com AND por padrão e OR opcional.

A ordenação é automática: kanji usa a primeira leitura kun’yomi, ou a primeira on’yomi quando não houver kun’yomi; sem leituras, usa a data de criação. Kotoba usa a leitura kana, com hiragana antes de katakana, e a criação como desempate; entradas sem leitura vêm depois, por criação. Bunpou usa a criação, dos mais antigos aos mais novos. Não há campo de leitura de ordenação. Consulte [regras de ordenação e migração](docs/library-order.md).

A busca de vocabulário cobre expressão, leitura, traduções, exemplos, frente, verso e classificações. AND exige todos os termos e é o padrão; OR aceita qualquer termo. O nível restringe os resultados nos dois modos. A busca trata maiúsculas/minúsculas em texto latino e hiragana/katakana como equivalentes, preservando a escrita cadastrada.

A navegação usa seis abas: **漢字 (Kanji)**, **ことば (Kotoba)**, **文法 (Bunpou)**, **試験 (Shiken)**, **勉強 (Benkyou)** e **進捗 (Progresso)**. As três bibliotecas de cards têm coleções visuais de N5 a N1 e uma lista contínua com chips de nível. A busca fica no ícone de lupa; arquivo, leituras e radicais ficam no painel de filtros. Cada biblioteca mantém sua coleção aberta ao trocar de aba ou consultar um card. O botão flutuante **勉強** abre a configuração com a categoria e o nível atuais, preservando tamanho e ordem da sessão. Shiken tem catálogo de provas por nível, aplicação cronometrada e histórico próprios, sem botão para estudar seus itens no Benkyou. A interface compartilha azul como cor principal, cinza de montanha como cor secundária e superfícies claras.

Para estudar, toque no card para revelar o verso e deslize: **direita = Acertei**, **esquerda = Errei**. **Dois toques rápidos no conteúdo do verso = Acertei parcialmente**; um toque único volta à frente após uma breve espera para distinguir os dois gestos. O movimento vertical continua rolando a tela. Os gestos avaliam e avançam sem seleção prévia; os três botões oferecem as mesmas ações. O card acompanha o arrasto horizontal e volta ao centro se o gesto for cancelado. A resposta só avança após ser salva; em caso de falha, o card permanece disponível para tentar novamente.

O verso de kanji apresenta kun’yomi, on’yomi, significados e radical, nessa ordem. Respostas longas podem ser abertas por completo. **Voltar** retorna ao último card respondido e desfaz sua avaliação no histórico, no progresso do card e nos totais. É possível voltar várias vezes e também corrigir o último card pelo resumo da sessão. Cada retorno reinicia o card pela frente, sem avaliação; comandos atrasados de antes do retorno não reaplicam a resposta desfeita.

### Usar sem internet

Consulte [uso offline, limites e validação no Android](docs/offline.md) para o contrato de persistência, resolução de conflitos e roteiro de teste no aparelho.

### Sequência diária e lembretes

Abrir o app em uma conta já preparada conta como uso no dia local do aparelho. Não é necessário responder um card: o contador mede dias de uso, e não desempenho. Cada data conta uma vez; deixar o app aberto na virada do dia também registra o novo dia. O contador mantém a sequência de ontem até o fim de hoje e recomeça em um quando houver um dia inteiro sem uso. O recorde fica preservado. O registro começa com esta versão, sem inferir acessos anteriores a partir das respostas de estudo.

Os dias ficam salvos por conta e ambiente, mesmo offline, e são reunidos com os de outros aparelhos no modo online. Ao escolher o modo offline, o envio fica suspenso até sair dele pelas configurações. A data local no momento do uso é preservada ao sincronizar. Sair da conta limpa o contador visível no widget e cancela os lembretes desse aparelho; o histórico local fica disponível para a próxima entrada na mesma conta.

Toque no contador com a Betinha para ver o recorde, ativar **Lembrete diário** ou escolher **Adicionar contador à tela inicial**. O lembrete requer sua autorização e chega por volta das 19h, somente se o app ainda não tiver sido usado naquele dia. O horário segue o fuso do aparelho; o Android pode atrasar a entrega e a atualização do widget para poupar bateria. Na lista de widgets do launcher, procure **beta · Betinha**. O widget se adapta a formatos compactos, altos e largos; tocar nele abre o app.

Widget e lembretes usam o módulo local `mobile/modules/babel-streak` e exigem um novo APK; não estão disponíveis no Expo Go ou em um APK antigo. O módulo é incluído automaticamente pelo Expo durante o prebuild. Para verificar seu calendário e agendamento, execute `./gradlew :babel-streak:testDebugUnitTest` dentro de `mobile/android/` após o prebuild.

### Mascote e arquivos de marca

Betinha é a mascote ibex do Babel Crux. As cenas aprovadas são PNGs transparentes em `mobile/assets/brand/betinha-*.png`: boas-vindas diante de uma montanha, celebração escalando um boulder grande, descanso sobre um crash pad azul, tristeza ao perder os apoios no boulder e expressão brava com magnésio pela pelagem, barba e um chifre. O retrato mantém o rosto aprovado e os chifres corrigidos no ícone, sobre um degradê cinza com textura de rocha, também aplicado ao fundo do ícone adaptativo Android. Consulte [arquivos de marca, origem das imagens e prompts](mobile/assets/brand/README.md).

Execute `npm run assets:brand` para empacotar esses arquivos nos ícones Android, tela de abertura, favicon e imagens do widget; o comando não redesenha a mascote nem altera as cenas aprovadas. Os chifres ficam dentro da área segura da máscara circular Android, e o ícone monocromático usa a transparência do retrato. As animações são curtas, param quando o app sai do primeiro plano e ficam desativadas quando o sistema pede movimento reduzido. A expressão brava acompanha o aviso de sequência em risco a partir das 19h; a triste acompanha uma sequência perdida.

As referências de desenho e movimento foram as [diretrizes de ilustração do Duolingo](https://design.duolingo.com/identity/imagery), a [evolução da silhueta do Duo](https://blog.duolingo.com/reshaping-duo/) e as [animações de personagens durante os exercícios](https://blog.duolingo.com/building-character/). Os desenhos e animações entregues são próprios do Babel Crux.

### Biblioteca offline

Entre na conta com internet ao menos uma vez neste aparelho e aguarde a biblioteca ser preparada. Os cards baixados ficam disponíveis para consulta e estudo; simulados do Shiken exigem também suas mídias baixadas. Cadastro, edição, arquivamento e restauração ficam disponíveis somente online. É possível fechar e reabrir o app: biblioteca, sessão e respostas pendentes ficam salvas localmente. Um card só avança depois que a resposta foi gravada no aparelho.

Ao perder internet, um modal oferece continuar offline. Recusar impede novos convites até reiniciar o app; a engrenagem ao lado do ícone de sair permite ativar o modo a qualquer momento. Aceitar mantém o modo offline mesmo quando a conexão volta. **Sincronizar e voltar online** envia as pendências e atualiza a biblioteca antes de sair do modo; falhas preservam o estudo. No modo online, o envio é automático com conexão e autenticação. Entrar em uma conta nova exige internet; os dados locais de cada conta e ambiente ficam separados. Ao sair com pendências, o app avisa e mantém a fila para a próxima entrada na mesma conta. Desinstalar o app ou apagar seus dados remove as alterações ainda não sincronizadas.

Se o mesmo card ou a sessão mudar em outro aparelho, o app preserva a fila e mostra o conflito. **Usar alterações deste aparelho** pede confirmação antes de substituir o card na nuvem ou encerrar a outra sessão ativa. **Usar versão da nuvem** pede confirmação para descartar todas as alterações ainda pendentes deste aparelho, incluindo respostas de estudo, antes de recarregar a conta. Não há descarte automático em caso de conflito.

A biblioteca baixada pode ser consultada offline; o histórico local inclui as 100 tentativas mais recentes baixadas. O progresso considera os totais da conta e as respostas locais pendentes. Novos cards, edições e arquivos remotos só chegam no modo online. Cards arquivados antes da apresentação são pulados e deixam de contar no total exibido da sessão; o histórico já registrado permanece disponível.

O desenho da interação se inspira no toque para virar e na navegação por gesto do [Quizlet](https://help.quizlet.com/hc/en-us/articles/360030988091) e do [DuoCards](https://app.duocards.com/library/s/how-to-make-language-learning-with-flashcards-as-effective-as-possible), mantendo a avaliação explícita com três resultados do Babel Crux. A sessão usa uma pilha visual de cards, progresso e animações respeitando a preferência de movimento reduzido.

## Estrutura

```text
mobile/                 App Expo, autenticação, biblioteca e estudo
backend/convex/         Catálogo, sessões, estatísticas e servidor MCP
shared/                 Formatação dos cards compartilhada entre app e backend
scripts/                Build, verificação e instalação do APK
.github/workflows/      Validação, APK e deploy opcional do backend
docs/android-build.md   Assinatura, ambientes, CI e instalação por cabo
docs/mcp.md             OAuth e integração MCP remota
docs/offline.md         Persistência, sincronização e validação offline
CONTEXT.md              Vocabulário do domínio
```

## Desenvolvimento

Use Node 24.13 ou superior dentro da linha 24, conforme `.nvmrc`. Instale as dependências na raiz:

```sh
nvm install
nvm use
npm ci
cp mobile/.env.example mobile/.env.local
cp backend/.env.example backend/.env.local
```

Se os arquivos locais já existem, preserve os valores configurados. Preencha `mobile/.env.local` com `APP_ENV=development`, a chave **publicável** `pk_test_...` do Clerk e a Cloud URL do Convex. Em `backend/.env.local`, configure o deployment de desenvolvimento e sua URL conforme o exemplo. A variável `CLERK_JWT_ISSUER_DOMAIN` precisa existir também no ambiente remoto do Convex; colocá-la apenas no arquivo local não configura a validação remota.

Na instância de desenvolvimento do Clerk, mantenha cadastro e login por e-mail e senha, Native API e a integração **Convex** habilitados, seguindo a [documentação oficial](https://docs.convex.dev/auth/clerk). O backend usa `applicationID: 'convex'`.

A configuração de autenticação do MVP usa **Verify at sign-up** desativado em User & authentication → Email e **Device Trust** desativado em Protect → Rules. O app não oferece confirmação de e-mail, confirmação de dispositivo ou MFA. O código por e-mail permanece apenas no fluxo solicitado pelo usuário em **Esqueci minha senha**. Se outra instância ainda exigir verificações adicionais, o app informa que o acesso não pôde ser concluído; ele não ativa uma sessão incompleta.

### Entrar ou cadastrar com Google

O botão **Continuar com Google**, presente nas telas de login e cadastro, abre o navegador de autenticação do Android através do SDK Clerk (`useSSO`, `oauth_google`). O Clerk conduz a entrada ou o cadastro e o app ativa a sessão retornada. Cancelar a escolha de conta retorna ao formulário. O app não armazena tokens do Google.

Em User & authentication → SSO connections, habilite Google para **sign-up and sign-in**. O desenvolvimento pode usar as credenciais compartilhadas já oferecidas pelo Clerk; produção exige credenciais próprias configuradas no painel. Veja [Google no Clerk](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google).

Em Native applications → **Allowlist for mobile SSO redirect**, cadastre o endereço do ambiente correspondente, sem curingas:

| Ambiente        | Retorno OAuth                  |
| --------------- | ------------------------------ |
| Desenvolvimento | `babelcrux-dev://sso-callback` |
| Produção        | `babelcrux://sso-callback`     |

Os schemes são definidos em `mobile/app.config.ts`. Mudanças neles exigem novo build nativo. Teste o Google no APK ou em um build de desenvolvimento instalado; o Expo Go não representa esse retorno com scheme próprio. [Redirecionamento mobile no Clerk](https://clerk.com/docs/guides/development/deployment/expo).

O Clerk também controla a vinculação entre métodos. Se uma conta criada com senha possui e-mail ainda não verificado e a pessoa usa Google com o mesmo endereço, o Clerk pode exigir recuperação da senha antes de vincular. O app orienta usar o método original ou recuperar a senha; o backend nunca junta usuários apenas pelo endereço de e-mail. [Vinculação de contas](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/account-linking).

Depois de autenticar o CLI Convex e selecionar o projeto correto:

```sh
cd backend
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://SEU-DOMINIO.clerk.accounts.dev
cd ..
npm run backend:dev
```

O deployment usado no desenvolvimento inicial é `dev:kindhearted-hare-87`, do projeto Babel Crux. Os arquivos `.env.local` desta máquina já apontam para ele. O fluxo de desenvolvimento observa alterações e atualiza as funções e tipos gerados. Em outro terminal:

```sh
npm start
# Com JDK e SDK Android configurados, para compilar e abrir no dispositivo:
npm run android
```

O modo de desenvolvimento usa Metro. Para instalar um APK que abre com o computador desligado, siga [Android: APK local e CI](docs/android-build.md).

## Configuração por ambiente

| Configuração    | Desenvolvimento         | Produção                 |
| --------------- | ----------------------- | ------------------------ |
| `APP_ENV`       | `development`           | `production`             |
| Clerk           | `pk_test_...`           | `pk_live_...`            |
| Convex          | Deployment dev          | Deployment prod separado |
| Package Android | `com.babelcrux.app.dev` | `com.babelcrux.app`      |
| Assinatura      | Keystore dev estável    | Keystore prod estável    |

Os arquivos de exemplo de produção documentam a configuração; não provisionam recursos de produção. `EXPO_PUBLIC_*` é incorporado ao aplicativo e só pode conter informação pública. Chaves secretas, tokens de deploy e assinatura ficam fora do Git. A preparação de APK carrega `.env.android.local` da raiz e desativa a combinação automática de outros arquivos `.env` pelo Expo.

## Verificação

```sh
npm run check
npm run format:check
npm run backend:codegen
npm run export:android --workspace mobile
```

Os testes cobrem autenticação, configuração dos ambientes, catálogo e duplicatas, isolamento entre usuários, sessões e avaliações idempotentes, snapshots de conteúdo, estatísticas e o protocolo MCP com JWTs assinados. O app usa a identidade validada pelo Convex; o MCP usa a identidade OAuth validada pelo Clerk. Nenhum cliente pode escolher o proprietário dos dados.

A exportação Android valida o bundle JavaScript; ela não produz um APK. A validação final em aparelho deve incluir cadastro e login diretos por e-mail/senha, entrada e criação de conta com Google, cancelamento do Google, retorno ao app, login após reabrir, recuperação de senha, saída e troca de conta, abertura sem Metro e atualização por `adb install -r` preservando a sessão. Confira que Google e e-mail chegam à área autenticada do Convex e que repetir o acesso não duplica o perfil. Um build release requer JDK, SDK Android e keystore persistente, descritos no guia de build.
