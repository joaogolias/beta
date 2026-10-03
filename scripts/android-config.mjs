import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Validate before invoking Expo/Gradle; never include supplied values in errors. */
export function readBuildConfig(env = process.env) {
  const appEnv = env.APP_ENV;
  if (!['development', 'production'].includes(appEnv)) {
    throw new Error('APP_ENV deve ser development ou production.');
  }
  const versionCode = Number(env.ANDROID_VERSION_CODE);
  if (
    !/^\d+$/.test(env.ANDROID_VERSION_CODE ?? '') ||
    !Number.isSafeInteger(versionCode) ||
    versionCode < 1 ||
    versionCode > 2100000000
  ) {
    throw new Error(
      'ANDROID_VERSION_CODE deve ser um inteiro de 1 a 2100000000.',
    );
  }
  const version = env.APP_VERSION;
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version ?? '')) {
    throw new Error('APP_VERSION deve ser uma versão como 0.1.0.');
  }
  let convexUrl;
  try {
    convexUrl = new URL(env.EXPO_PUBLIC_CONVEX_URL);
  } catch {
    throw new Error(
      'EXPO_PUBLIC_CONVEX_URL deve ser a URL HTTPS do deployment Convex.',
    );
  }
  if (
    convexUrl.protocol !== 'https:' ||
    convexUrl.username ||
    convexUrl.password ||
    !convexUrl.hostname.endsWith('.convex.cloud') ||
    convexUrl.pathname !== '/' ||
    convexUrl.search ||
    convexUrl.hash
  ) {
    throw new Error(
      'EXPO_PUBLIC_CONVEX_URL deve ser a URL HTTPS do deployment Convex Cloud.',
    );
  }
  const keyPrefix = appEnv === 'production' ? 'pk_live_' : 'pk_test_';
  if (
    !env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith(keyPrefix) ||
    env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY.length <= keyPrefix.length
  ) {
    throw new Error(
      `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY deve começar com ${keyPrefix} para esse APP_ENV.`,
    );
  }
  const required = [
    'ANDROID_KEYSTORE_PATH',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length)
    throw new Error(`Assinatura Android incompleta: ${missing.join(', ')}.`);
  if (
    !isAbsolute(env.ANDROID_KEYSTORE_PATH) ||
    !existsSync(env.ANDROID_KEYSTORE_PATH) ||
    !statSync(env.ANDROID_KEYSTORE_PATH).isFile()
  ) {
    throw new Error(
      'ANDROID_KEYSTORE_PATH deve apontar para um keystore existente, fora do repositório, usando caminho absoluto.',
    );
  }
  const keyRelativeToProject = relative(
    projectRoot,
    realpathSync(env.ANDROID_KEYSTORE_PATH),
  );
  if (
    !isAbsolute(keyRelativeToProject) &&
    !keyRelativeToProject.startsWith(`..${sep}`)
  ) {
    throw new Error(
      'ANDROID_KEYSTORE_PATH deve apontar para um keystore fora do repositório.',
    );
  }
  return { appEnv, versionCode, version };
}
