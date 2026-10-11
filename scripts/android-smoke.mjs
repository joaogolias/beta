import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const [packageName = 'com.beta.app.dev', serial, ...extra] =
  process.argv.slice(2);
const adb = process.env.ADB || 'adb';
const port = process.env.ADB_SERVER_PORT;

function redact(value) {
  return value
    .replace(/(?:pk|sk)_(?:test|live)_[A-Za-z0-9_-]+/g, '<REDACTED_KEY>')
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      '<REDACTED_TOKEN>',
    )
    .replace(/(Bearer\s+)\S+/gi, '$1<REDACTED_TOKEN>')
    .replace(
      /((?:access_token|refresh_token|id_token|session_token|password)["']?\s*[:=]\s*["']?)[^\s,"'&}]+/gi,
      '$1<REDACTED>',
    );
}

function run(args, description, { allowFailure = false } = {}) {
  const result = spawnSync(
    adb,
    [
      ...(port ? ['-P', port] : []),
      ...(serial ? ['-s', serial] : ['-d']),
      ...args,
    ],
    { encoding: 'utf8', timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.error) {
    throw new Error(
      result.error.code === 'ENOENT'
        ? 'ADB não encontrado. Instale Android SDK Platform-Tools ou defina ADB com o caminho do executável.'
        : `${description}: ${result.error.message}`,
    );
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `${description}: ${redact((result.stderr || result.stdout).trim()) || `ADB terminou com código ${result.status}`}`,
    );
  }
  return result.stdout.trim();
}

async function main() {
  if (
    extra.length ||
    !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName) ||
    (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535))
  ) {
    throw new Error(
      'Uso: npm run android:smoke -- [package] [serial]. ADB_SERVER_PORT deve ser uma porta de 1 a 65535.',
    );
  }

  const state = run(
    ['get-state'],
    'Dispositivo indisponível; confira o cabo, a Depuração USB e a autorização no celular',
  );
  if (state !== 'device')
    throw new Error(`Dispositivo não está pronto: ${state}`);

  const packages = run(
    ['shell', 'cmd', 'package', 'list', 'packages', '-U', packageName],
    'Não foi possível consultar o APK instalado',
  );
  const uid = packages
    .split(/\r?\n/)
    .find((line) => line.startsWith(`package:${packageName} `))
    ?.match(/\buid:(\d+)\b/)?.[1];
  if (!uid)
    throw new Error(
      `APK ${packageName} não está instalado para este usuário Android.`,
    );

  run(
    ['shell', 'am', 'force-stop', packageName],
    'Não foi possível fechar o app',
  );
  const since = run(
    ['shell', 'date', '+%s.%N'],
    'Não foi possível ler o relógio Android',
  );
  if (!/^\d+\.\d+$/.test(since))
    throw new Error(
      'O relógio Android não retornou um cursor válido para o logcat.',
    );

  const launch = run(
    ['shell', 'am', 'start', '-W', '-n', `${packageName}/.MainActivity`],
    'Não foi possível abrir o app',
  );
  if (!/^Status: ok\r?$/m.test(launch))
    throw new Error(`Android não confirmou a abertura: ${redact(launch)}`);

  console.log(
    `Observando ${packageName} por 10 segundos. Mantenha o aparelho desbloqueado e o app aberto.`,
  );
  await setTimeout(10_000);

  const pids = run(
    ['shell', 'pidof', packageName],
    'Não foi possível consultar o processo',
    { allowFailure: true },
  );
  const activities = run(
    ['shell', 'dumpsys', 'activity', 'activities'],
    'Não foi possível consultar a atividade em primeiro plano',
  );
  const foreground = activities
    .split(/\r?\n/)
    .some(
      (line) =>
        /(?:mResumedActivity:|topResumedActivity=)/.test(line) &&
        line.includes(`${packageName}/`),
    );
  const logs = run(
    [
      'logcat',
      '-b',
      'main',
      '-b',
      'crash',
      '-b',
      'system',
      '-d',
      '-v',
      'brief',
      '-T',
      since,
      `--uid=${uid}`,
      'AndroidRuntime:E',
      'ReactNativeJS:E',
      'ReactNative:E',
      '*:F',
    ],
    'Não foi possível ler os logs do app',
  );
  const signals = logs.split(/\r?\n/).filter((line) => /^[EF]\//.test(line));
  const fatal = signals.some(
    (line) =>
      /^F\//.test(line) ||
      /FATAL EXCEPTION|Fatal signal \d+|JavascriptException|Unhandled JS Exception|Minified React error #/i.test(
        line,
      ),
  );
  const alive = /^\d+(?:\s+\d+)*$/.test(pids);
  console.log(
    `${alive && foreground && !fatal ? 'PASS' : 'FAIL'} package=${packageName} process_alive=${alive} foreground=${foreground} fatal=${fatal}`,
  );
  if (!alive || !foreground || fatal) {
    if (signals.length) console.error(redact(signals.join('\n')));
    throw new Error(
      'O app falhou na abertura. Confira os sinais acima; se não houve crash, mantenha o celular desbloqueado sem trocar de app durante o teste.',
    );
  }
}

try {
  await main();
} catch (error) {
  console.error(redact(error.message));
  process.exitCode = 1;
}
