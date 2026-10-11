import { Buffer } from 'node:buffer';

/** Validate the actual bundle, since prebuild metadata can outlive Metro's inputs. */
export function assertAndroidBundle(bundle, embeddedConfig, env) {
  if (embeddedConfig.extra?.appEnv !== env.APP_ENV) {
    throw new Error('O ambiente incorporado ao APK diverge de APP_ENV.');
  }
  for (const name of [
    'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_CONVEX_URL',
  ]) {
    if (!env[name] || !bundle.includes(Buffer.from(env[name], 'utf8'))) {
      throw new Error(
        `O bundle do APK não contém ${name} do ambiente selecionado. Verifique o cache do Metro antes de distribuir.`,
      );
    }
  }
}
