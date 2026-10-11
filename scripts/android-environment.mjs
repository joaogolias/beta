import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const environments = ['development', 'production'];
const required = [
  'APP_VERSION',
  'ANDROID_VERSION_CODE',
  'EXPO_PUBLIC_CONVEX_URL',
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'ANDROID_KEYSTORE_PATH',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

/** Select the environment before touching files; never echo supplied values. */
export function selectAndroidEnvironment(args, env) {
  let selected;
  if (args.length) {
    if (
      args.length !== 2 ||
      args[0] !== '--environment' ||
      !environments.includes(args[1])
    )
      throw new Error(
        'Use --environment development ou --environment production.',
      );
    selected = args[1];
  }
  if (env.APP_ENV !== undefined && !environments.includes(env.APP_ENV))
    throw new Error('APP_ENV deve ser development ou production.');
  if (selected && env.APP_ENV && selected !== env.APP_ENV)
    throw new Error(
      '--environment diverge de APP_ENV; selecione um único ambiente.',
    );
  // A production file never selects itself when the operator omitted the target.
  return selected ?? env.APP_ENV ?? 'development';
}

function readOptionalEnvironment(root, name) {
  let contents;
  try {
    contents = readFileSync(join(root, name), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(
      `Não foi possível ler ${name}; confira o arquivo e as permissões.`,
    );
  }
  try {
    return { name, values: parseEnv(contents) };
  } catch {
    throw new Error(`O formato de ${name} não é válido.`);
  }
}

export function readAndroidEnvironment({ root, args = [], env = process.env }) {
  const environment = selectAndroidEnvironment(args, env);
  const expectedFile = `.env.android.${environment}.local`;
  let local = readOptionalEnvironment(root, expectedFile);
  if (!local && environment === 'development')
    local = readOptionalEnvironment(root, '.env.android.local');
  if (local && local.values.APP_ENV !== environment)
    throw new Error(
      `APP_ENV em ${local.name} deve corresponder ao ambiente selecionado.`,
    );

  // Only this environment's file participates. Explicit process values win,
  // including in CI, which does not need a local file at all.
  const values = { ...local?.values, ...env, APP_ENV: environment };
  const missing = required.filter((name) => !values[name]?.trim());
  if (missing.length) {
    const source = local ? local.name : `${expectedFile} ausente`;
    throw new Error(
      `Configuração Android incompleta (${source}). Configure ${missing.join(', ')} no arquivo do ambiente ou nas variáveis do processo.`,
    );
  }
  return values;
}
