import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { assertAndroidBundle } from './android-bundle.mjs';

const development = {
  APP_ENV: 'development',
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_dev_fixture',
  EXPO_PUBLIC_CONVEX_URL: 'https://development-fixture.convex.cloud',
};
const production = {
  APP_ENV: 'production',
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_prod_fixture',
  EXPO_PUBLIC_CONVEX_URL: 'https://production-fixture.convex.cloud',
};
const bundleFor = (env) =>
  Buffer.from(
    `\0${env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}\0${env.EXPO_PUBLIC_CONVEX_URL}\0`,
  );
const configFor = (env) => ({ extra: { appEnv: env.APP_ENV } });

test('rejects a cached production bundle inside an otherwise valid development APK', () => {
  assert.throws(
    () =>
      assertAndroidBundle(
        bundleFor(production),
        configFor(development),
        development,
      ),
    (error) =>
      error.message.includes('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY') &&
      !Object.values(development).some((value) =>
        error.message.includes(value),
      ) &&
      !Object.values(production).some((value) => error.message.includes(value)),
  );
});

test('rejects a stale backend URL even when the Clerk key is unchanged', () => {
  assert.throws(
    () =>
      assertAndroidBundle(
        bundleFor({
          ...production,
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
            development.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
        }),
        configFor(development),
        development,
      ),
    /EXPO_PUBLIC_CONVEX_URL/,
  );
});

test('requires the actual bundle and embedded configuration to match the selected environment', () => {
  for (const env of [development, production]) {
    assert.doesNotThrow(() =>
      assertAndroidBundle(bundleFor(env), configFor(env), env),
    );
    assert.throws(() =>
      assertAndroidBundle(Buffer.alloc(0), configFor(env), env),
    );
    assert.throws(
      () => assertAndroidBundle(bundleFor(env), {}, env),
      /APP_ENV/,
    );
  }
});
