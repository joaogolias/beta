import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readBuildConfig } from './android-config.mjs';
import { readAndroidEnvironment } from './android-environment.mjs';
import { assertAndroidBundle } from './android-bundle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'mobile');

function run(command, args, { cwd = root, capture = false, ...options } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    ...options,
  });
  if (result.error)
    throw new Error(
      `Não foi possível executar ${command}; confira os pré-requisitos de docs/android-build.md.`,
    );
  if (result.status !== 0)
    throw new Error(
      `${command} falhou (código ${result.status ?? 'interrompido'}).`,
    );
  return result.stdout?.trim();
}

try {
  if (process.platform === 'win32')
    throw new Error(
      'Execute o build em Linux/WSL, com Java e Android SDK instalados nesse mesmo ambiente.',
    );
  Object.assign(
    process.env,
    readAndroidEnvironment({ root, args: process.argv.slice(2) }),
  );
  const config = readBuildConfig();
  const sdk = process.env.ANDROID_HOME;
  if (!sdk || !existsSync(sdk))
    throw new Error(
      'Configure ANDROID_HOME para o Android SDK deste ambiente.',
    );
  // The Gradle wrapper prefers JAVA_HOME over PATH; validate that same runtime.
  const javaBin = process.env.JAVA_HOME
    ? join(process.env.JAVA_HOME, 'bin')
    : null;
  const java = spawnSync(
    javaBin ? join(javaBin, 'java') : 'java',
    ['-version'],
    { encoding: 'utf8' },
  );
  if (java.status !== 0 || !/version "17[.\"]/.test(java.stderr + java.stdout))
    throw new Error(
      'O build requer Java 17 em JAVA_HOME (ou no PATH quando JAVA_HOME não está definido).',
    );

  // The selected environment is explicit; Expo must not mix in mobile/.env files.
  process.env.EXPO_NO_DOTENV = '1';
  process.env.CI = '1';
  process.env.NODE_ENV = 'production';
  const requireMobile = createRequire(join(mobile, 'package.json'));
  const expoCli = join(
    dirname(requireMobile.resolve('expo/package.json')),
    'bin',
    'cli',
  );
  run(
    process.execPath,
    [expoCli, 'prebuild', '--platform', 'android', '--clean', '--no-install'],
    { cwd: mobile },
  );
  const native = join(mobile, 'android');
  run(
    'bash',
    ['./gradlew', ':app:assembleRelease', '--no-daemon', '--console=plain'],
    { cwd: native },
  );

  const output = join(native, 'app/build/outputs/apk/release');
  const metadata = JSON.parse(
    readFileSync(join(output, 'output-metadata.json'), 'utf8'),
  );
  const expectedPackage =
    config.appEnv === 'production' ? 'com.beta.app' : 'com.beta.app.dev';
  if (
    metadata.applicationId !== expectedPackage ||
    metadata.elements.length !== 1
  )
    throw new Error(
      'O APK gerado não corresponde ao ambiente ou formato universal esperado.',
    );
  const artifact = metadata.elements[0];
  if (
    artifact.versionCode !== config.versionCode ||
    artifact.versionName !== config.version
  )
    throw new Error(
      'A versão do APK diverge de APP_VERSION/ANDROID_VERSION_CODE.',
    );
  const apk = join(output, artifact.outputFile);
  const entries = run(javaBin ? join(javaBin, 'jar') : 'jar', ['tf', apk], {
    capture: true,
  });
  if (!entries.split(/\r?\n/).includes('assets/index.android.bundle'))
    throw new Error(
      'APK sem bundle JavaScript; não é instalável para uso sem Metro.',
    );

  const inspection = mkdtempSync(join(tmpdir(), 'beta-apk-inspection-'));
  try {
    run(
      javaBin ? join(javaBin, 'jar') : 'jar',
      ['xf', apk, 'assets/index.android.bundle', 'assets/app.config'],
      { cwd: inspection },
    );
    assertAndroidBundle(
      readFileSync(join(inspection, 'assets/index.android.bundle')),
      JSON.parse(readFileSync(join(inspection, 'assets/app.config'), 'utf8')),
      process.env,
    );
  } finally {
    rmSync(inspection, { recursive: true, force: true });
  }

  const buildTools = join(sdk, 'build-tools');
  const apksignerVersion = readdirSync(buildTools)
    .filter((entry) => existsSync(join(buildTools, entry, 'apksigner')))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  if (!apksignerVersion)
    throw new Error('Instale Android SDK Build-Tools (apksigner).');
  run(join(buildTools, apksignerVersion, 'apksigner'), ['verify', apk]);

  const commit = run('git', ['rev-parse', 'HEAD'], { capture: true });
  const dirty =
    run('git', ['status', '--porcelain'], { capture: true }).length > 0;
  const name = `beta-${config.appEnv}-${config.version}-${config.versionCode}-${commit.slice(0, 12)}${dirty ? '-dirty' : ''}`;
  const destination = join(root, 'artifacts', config.appEnv, name);
  mkdirSync(destination, { recursive: true });
  const file = `${name}.apk`;
  copyFileSync(apk, join(destination, file));
  const sha256 = createHash('sha256').update(readFileSync(apk)).digest('hex');
  writeFileSync(
    join(destination, 'build-info.json'),
    JSON.stringify(
      {
        ...config,
        applicationId: expectedPackage,
        commit,
        dirty,
        file,
        sha256,
        builtAt: new Date().toISOString(),
        requiresMetro: false,
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(join(destination, 'SHA256SUMS'), `${sha256}  ${file}\n`);
  console.log(`APK assinado com bundle: ${join(destination, file)}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
