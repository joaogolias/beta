# Android: APK local e CI

O alvo inicial é somente Android. O APK para uso diário usa o build **release**, inclusive no ambiente `development`: ele inclui o JavaScript e funciona sem Metro, sem cabo conectado e sem computador ligado. Login e sincronização ainda precisam de internet. Não há publicação na Play Store, alvo iOS nem dependência de EAS.

## Pré-requisitos locais

Execute o build no Linux/WSL com Node 24 (ver `.nvmrc`), npm, Git, JDK 17 e Android SDK no mesmo ambiente. Configure `JAVA_HOME`, `ANDROID_HOME` e acrescente `platform-tools` e `cmdline-tools/latest/bin` do SDK ao `PATH`. O script valida o Java em `JAVA_HOME`, que tem precedência sobre o `PATH` no Gradle. Java, SDK e ferramentas globais não são instalados pelos scripts do projeto. No SDK Manager, aceite as licenças e instale:

```sh
sdkmanager 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0'
sdkmanager --licenses
java -version
adb version
npm ci
npm run check
```

O SDK 57 usa Android API 36 e suporta Android 7 ou superior. O Gradle poderá baixar a versão do NDK/CMake definida pelo template Expo; reserve espaço em disco e acesso à rede no primeiro build. [Referência do Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).

O script regenera `mobile/android/` com `expo prebuild --clean --platform android --no-install`. Essa pasta é descartável: configurações permanentes ficam em `mobile/app.config.ts` e plugins. Não edite arquivos nativos gerados manualmente. [Build local Expo](https://docs.expo.dev/guides/local-app-production/).

## Assinatura estável

Crie **uma vez por ambiente** um keystore fora do repositório. O script rejeita chaves armazenadas dentro do projeto. Reuse a mesma chave localmente e no CI. O comando solicita senha e identificação interativamente; não coloque senhas nos argumentos:

```sh
mkdir -p "$HOME/.config/beta"
keytool -genkeypair -v -storetype PKCS12 \
  -keystore "$HOME/.config/beta/development.p12" \
  -alias beta-development -keyalg RSA -keysize 3072 -validity 10000
chmod 600 "$HOME/.config/beta/development.p12"
```

Para produção, repita com `production.p12` e outro alias. Em PKCS12, use a mesma senha para keystore e chave. Guarde backup privado do arquivo, alias e senha. Android exige a mesma identidade de assinatura para atualizar o app preservando dados; perder a chave pode exigir desinstalação e perda dos dados locais. [Assinatura Android](https://developer.android.com/studio/publish/app-signing).

O plugin `withReleaseSigning.cjs` aplica a configuração após cada prebuild e lê as credenciais no ambiente do Gradle. Builds release falham sem credenciais; não adotam a chave debug padrão silenciosamente. O fluxo não gera uma chave nova por execução.

## Configurar e gerar

Crie `.env.android.development.local` na raiz para desenvolvimento e `.env.android.production.local` para produção, ambos ignorados pelo Git. Use os modelos `.env.android.development.example` e `.env.android.production.example`. Cada arquivo contém a configuração e a assinatura do seu ambiente. Esses arquivos são carregados somente pelo script de APK; variáveis já exportadas no terminal têm precedência. `EXPO_PUBLIC_*` vai para o aplicativo e nunca deve conter segredos. Exemplo de desenvolvimento:

```dotenv
APP_ENV=development
APP_VERSION=0.1.0
ANDROID_VERSION_CODE=1
EXPO_PUBLIC_CONVEX_URL=https://SEU-DEPLOYMENT-DEV.convex.cloud
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_SUA_CHAVE_PUBLICA
ANDROID_KEYSTORE_PATH=/home/SEU_USUARIO/.config/beta/development.p12
ANDROID_KEYSTORE_PASSWORD="SUA_SENHA"
ANDROID_KEY_ALIAS=beta-development
ANDROID_KEY_PASSWORD="SUA_SENHA"
```

```sh
chmod 600 .env.android.development.local
npm run android:apk -- --environment development
```

Para produção, crie o arquivo separado com `APP_ENV=production`, Convex production, Clerk `pk_live_...` e a assinatura de produção:

```sh
chmod 600 .env.android.production.local
npm run android:apk -- --environment production
```

O argumento `--environment` ou a variável `APP_ENV` exportada seleciona o ambiente antes de qualquer arquivo ser lido. Se ambos estiverem definidos, precisam concordar. Sem seleção explícita, o padrão é `development`. O `APP_ENV` dentro do arquivo deve corresponder à seleção; um arquivo de produção nunca seleciona produção sozinho.

O script lê apenas o arquivo do ambiente escolhido. Para compatibilidade, desenvolvimento usa `.env.android.local` somente quando `.env.android.development.local` não existe; produção nunca usa esse arquivo antigo nem o arquivo de desenvolvimento. Não é necessário arquivo local quando todas as variáveis exigidas já estão no processo, como no CI. Configuração ausente ou misturada interrompe o fluxo antes do build.

Confira no dashboard que o deployment Convex é do ambiente selecionado: a URL não informa sozinha se é dev ou prod. O script rejeita chaves Clerk test/live trocadas e desabilita a leitura automática de outros `.env` pelo Expo durante o build.

O cache do Metro inclui `APP_ENV` e os valores `EXPO_PUBLIC_*` na sua identificação. Assim, alternar entre produção e desenvolvimento ou trocar uma chave pública não reutiliza código compilado com valores anteriores, mesmo no modo CI. Antes de disponibilizar o APK, o script também extrai seu bundle e confere se contém a chave Clerk e a URL Convex selecionadas, além do ambiente incorporado. Uma divergência interrompe o build antes da criação do artefato em `artifacts/`.

Os pacotes são `com.beta.app.dev` e `com.beta.app`; ambos podem coexistir. Cada um tem sessão e dados locais próprios. Nunca inclua `CLERK_SECRET_KEY`, `CONVEX_DEPLOY_KEY` ou credenciais da assinatura em variáveis `EXPO_PUBLIC_*`.

### Identificação de desenvolvimento

O ambiente `development` mostra uma faixa **DEV** nas telas e nos modais do app, inclusive quando o APK usa build release. A indicação vem de `extra.appEnv`, definido por `APP_ENV`, e não de `__DEV__` ou da presença do Metro. Produção não exibe a faixa.

O ícone de desenvolvimento conserva a Betinha e acrescenta a tag **DEV**. Há derivados próprios para o launcher legado, o ícone adaptativo e o ícone temático do Android; a tag fica dentro da área segura de recorte e sua versão monocromática usa letras vazadas para continuar visível com a cor do sistema. Produção mantém seus ícones originais. O nome exibido continua `beta` nos dois ambientes.

`npm run assets:brand` atualiza todos os derivados. Para reconstruir somente os três ícones DEV a partir dos PNGs de produção existentes, execute `node scripts/dev-icon.mjs`; as fontes da mascote e os ícones de produção são preservados.

### Instalações anteriores ao rebranding

Os identificadores Android e os schemes foram atualizados para beta. O Android trata esse APK como outro aplicativo: a instalação anterior, sua sessão e suas pendências offline não são transferidas automaticamente. Sincronize os dados no app anterior antes da troca e entre com a mesma conta no beta para recuperar o conteúdo da nuvem. Não desinstale a versão anterior enquanto houver dados pendentes; widget e permissões de lembrete precisam ser configurados no novo app.

Adicione `beta-dev://sso-callback` e `beta://sso-callback` às allowlists das respectivas instâncias Clerk antes de testar Google. Preserve os certificados e os aliases de assinatura existentes; os nomes dos exemplos abaixo são para novas configurações e não exigem recriar chaves.

O fluxo `npm run android:apk` já regenera o projeto nativo. Ao usar `expo run:android` diretamente após essa mudança, regenere antes com `npx expo prebuild --platform android --clean --no-install`, no diretório `mobile`, para atualizar o package, o módulo `beta-streak` e o bloco de assinatura.

O comando executa `:app:assembleRelease`, verifica assinatura com `apksigner`, confere o bundle `assets/index.android.bundle`, package e versão. Entrega em `artifacts/<ambiente>/<nome>/`:

- APK identificado por ambiente, versão, `versionCode` e commit; `-dirty` indica alterações locais ainda não commitadas.
- `build-info.json` com o commit completo, versão, ambiente, horário e SHA-256.
- `SHA256SUMS` para conferir a integridade do download.

## Instalar por USB

Ative Opções do desenvolvedor e Depuração USB no celular, conecte o cabo e aceite a autorização de depuração na tela. [ADB](https://developer.android.com/tools/adb).

```sh
adb devices -l
npm run android:install -- /caminho/completo/beta-development-0.1.0-1-COMMIT.apk
```

O script executa `adb -d install -r`: seleciona o celular físico e preserva dados do app. Com vários dispositivos, passe o serial como segundo argumento. No Windows, você pode instalar o APK usando o `adb` do Android SDK para Windows e um caminho Windows/UNC; para compilar dentro do WSL, use o SDK Linux. O WSL só verá USB se o dispositivo tiver sido disponibilizado a ele; outra opção é copiar o APK e instalar pelo PowerShell com `adb install -r "C:\caminho\app.apk"`.

Após instalar, desconecte o cabo, feche o Metro e abra o app pelo ícone. Verifique login por e-mail/senha, **Continuar com Google**, retorno do navegador ao app e a tela protegida com internet. Confira também que cancelar o Google mantém o formulário disponível. O retorno SSO precisa estar autorizado no Clerk conforme o [README](../README.md#entrar-ou-cadastrar-com-google). Builds `expo run:android` usados para desenvolver com hot reload são outro fluxo e podem depender do Metro.

## Verificar a abertura do APK

Com o APK instalado e o celular conectado e desbloqueado, execute:

```sh
npm run android:smoke
npm run android:smoke -- com.beta.app.dev SERIAL
```

O teste fecha e abre o app sem apagar seus dados, espera 10 segundos e exige que o processo continue vivo, com a atividade em primeiro plano e sem erro fatal nos logs do app. Mantenha o app aberto durante o teste. O resultado é `PASS` ou `FAIL`, com código de saída diferente de zero em caso de falha. Esse teste verifica a abertura; login e retorno do Google continuam exigindo a verificação funcional acima.

O pacote padrão é `com.beta.app.dev`; sem serial, o ADB seleciona um único dispositivo USB (`-d`). Para testar um emulador ou escolher outro aparelho, informe o serial. O script funciona com Node 24 no Linux ou Windows. `ADB` pode apontar para o executável do ADB e `ADB_SERVER_PORT` pode selecionar outra porta do servidor. No PowerShell:

```powershell
$env:ADB = 'C:\Android\platform-tools\adb.exe'
$env:ADB_SERVER_PORT = '5038'
npm run android:smoke -- com.beta.app.dev SERIAL
```

O teste lê somente logs do UID do aplicativo desde essa abertura, oculta chaves e tokens comuns na saída e não limpa o logcat do aparelho.

## GitHub Actions

`Validate` roda `npm ci` e `npm run check` em PRs e pushes para `main`, sem credenciais externas. As Actions são fixadas por commit. `Android APK` é acionado manualmente em **Actions → Android APK → Run workflow**. Escolha branch/commit via seletor de referência, ambiente, versão e um `version_code` maior que o último instalado nesse ambiente.

Antes do primeiro build, crie GitHub Environments `development` e `production`. Cada ambiente precisa de:

| Tipo     | Nome                                | Conteúdo                                    |
| -------- | ----------------------------------- | ------------------------------------------- |
| Variable | `EXPO_PUBLIC_CONVEX_URL`            | URL do deployment correspondente            |
| Variable | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Chave publicável test ou live               |
| Secret   | `ANDROID_KEYSTORE_BASE64`           | Base64 do keystore estável daquele ambiente |
| Secret   | `ANDROID_KEYSTORE_PASSWORD`         | Senha do keystore                           |
| Secret   | `ANDROID_KEY_ALIAS`                 | Alias da chave                              |
| Secret   | `ANDROID_KEY_PASSWORD`              | Senha da chave                              |

Para carregar a chave com GitHub CLI autenticado, envie o base64 direto pela entrada padrão, sem exibi-lo no terminal:

```sh
base64 -w 0 "$HOME/.config/beta/development.p12" | gh secret set ANDROID_KEYSTORE_BASE64 --env development
```

O CI valida, compila, verifica e disponibiliza o APK e seus metadados na seção **Artifacts** da execução por 30 dias. Baixe, descompacte, confira `sha256sum -c SHA256SUMS` e instale por ADB. Mantenha uma cópia dos APKs que deseja preservar além da retenção. [Artefatos do GitHub Actions](https://docs.github.com/en/actions/tutorials/store-and-share-data).

Os builds não fazem deploy do backend. `Deploy backend (opt-in)` é um workflow manual separado, que só executa se a opção `deploy` for marcada e `CONVEX_DEPLOY_KEY` estiver configurada no Environment `production`. Antes de usá-lo, configure `CLERK_JWT_ISSUER_DOMAIN` no Convex production e mantenha clientes e funções compatíveis. Desenvolvimento usa `npm run dev --workspace backend`. Restrinja branches e revisão do Environment production conforme a política do seu repositório.

## Atualizações e retorno a uma versão anterior

Mantenha `ANDROID_VERSION_CODE` estritamente crescente por pacote. `APP_VERSION` é a versão legível. A atualização exige mesmo package e assinatura. O script nunca desinstala automaticamente nem força downgrade.

Para voltar ao código de um commit anterior, faça um checkout separado desse commit, mantenha o mesmo keystore e **gere novo APK com `versionCode` maior** que o instalado. Instale com `-r`. Isso evita depender de downgrade, que Android restringe em builds release. Garanta que o código antigo continue compatível com o schema/backend e dados atuais; reconstruir um APK antigo não desfaz migrações Convex.

Se houver erro de assinatura, confira ambiente, package e keystore antes de agir. Desinstalar é uma decisão manual e apaga dados locais, incluindo a sessão; não é o procedimento normal de atualização. [Builds e assinatura pela linha de comando](https://developer.android.com/build/building-cmdline).
