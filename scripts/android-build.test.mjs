import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { readBuildConfig } from './android-config.mjs';
import {
  readAndroidEnvironment,
  selectAndroidEnvironment,
} from './android-environment.mjs';

const require = createRequire(import.meta.url);
const {
  addReleaseSigning,
} = require('../mobile/plugins/withReleaseSigning.cjs');
const directory = mkdtempSync(join(tmpdir(), 'beta-signing-test-'));
const keystore = join(directory, 'test.jks');
writeFileSync(keystore, 'fixture: not a real signing key');
after(() => rmSync(directory, { recursive: true, force: true }));
const valid = {
  APP_ENV: 'development',
  APP_VERSION: '0.1.0',
  ANDROID_VERSION_CODE: '1',
  EXPO_PUBLIC_CONVEX_URL: 'https://example.convex.cloud',
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
  ANDROID_KEYSTORE_PATH: keystore,
  ANDROID_KEYSTORE_PASSWORD: 'secret-test-password',
  ANDROID_KEY_ALIAS: 'fixture',
  ANDROID_KEY_PASSWORD: 'secret-test-password',
};

function environmentDirectory() {
  return mkdtempSync(join(directory, 'environment-'));
}

function writeEnvironment(root, name, values) {
  writeFileSync(
    join(root, name),
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join('\n'),
  );
}

test('Android keeps the parameterless development command and prefers its dedicated file', () => {
  const root = environmentDirectory();
  writeEnvironment(root, '.env.android.local', valid);
  const inherited = { PATH: '/runtime/bin' };
  const legacy = readAndroidEnvironment({ root, env: inherited });
  assert.deepEqual(legacy, { ...valid, ...inherited });
  assert.deepEqual(inherited, { PATH: '/runtime/bin' });
  assert.equal(readBuildConfig(legacy).appEnv, 'development');

  writeEnvironment(root, '.env.android.development.local', {
    ...valid,
    ANDROID_VERSION_CODE: '2',
  });
  assert.equal(
    readAndroidEnvironment({ root, env: inherited }).ANDROID_VERSION_CODE,
    '2',
  );
});

test('Android production loads only its dedicated file and does not inherit development URLs or signing', () => {
  const root = environmentDirectory();
  writeEnvironment(root, '.env.android.local', {
    ...valid,
    JAVA_HOME: '/dev/java',
  });
  writeEnvironment(root, '.env.android.development.local', valid);
  const production = {
    ...valid,
    APP_ENV: 'production',
    EXPO_PUBLIC_CONVEX_URL: 'https://production-example.convex.cloud',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_fixture',
    ANDROID_KEYSTORE_PATH: join(directory, 'production.jks'),
    ANDROID_KEY_ALIAS: 'production-fixture',
    ANDROID_KEYSTORE_PASSWORD: 'production-fixture-password',
    ANDROID_KEY_PASSWORD: 'production-fixture-password',
  };
  writeFileSync(production.ANDROID_KEYSTORE_PATH, 'fixture: not a signing key');
  writeEnvironment(root, '.env.android.production.local', production);
  const loaded = readAndroidEnvironment({
    root,
    args: ['--environment', 'production'],
    env: {},
  });
  assert.deepEqual(loaded, production);
  assert.equal(loaded.JAVA_HOME, undefined);
  assert.equal(readBuildConfig(loaded).appEnv, 'production');
});

test('Android rejects missing production inputs instead of completing them from development files', () => {
  const root = environmentDirectory();
  writeEnvironment(root, '.env.android.local', valid);
  const production = {
    APP_ENV: 'production',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_private-fixture-value',
  };
  const sanitizedMissing = (error) =>
    error.message.includes('.env.android.production.local') &&
    error.message.includes('EXPO_PUBLIC_CONVEX_URL') &&
    error.message.includes('ANDROID_KEYSTORE_PATH') &&
    !error.message.includes(production.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    !error.message.includes(valid.ANDROID_KEYSTORE_PASSWORD);
  assert.throws(
    () => readAndroidEnvironment({ root, env: production }),
    (error) => sanitizedMissing(error) && error.message.includes('ausente'),
  );
  writeEnvironment(root, '.env.android.production.local', production);
  assert.throws(
    () =>
      readAndroidEnvironment({
        root,
        env: {},
        args: ['--environment', 'production'],
      }),
    sanitizedMissing,
  );
});

test('Android production CI works with complete process variables and no production file', () => {
  const root = environmentDirectory();
  // Even an unreadable legacy file must never be consulted in production.
  mkdirSync(join(root, '.env.android.local'));
  const env = {
    ...valid,
    APP_ENV: 'production',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_fixture',
    CI: 'true',
  };
  const loaded = readAndroidEnvironment({ root, env });
  assert.deepEqual(loaded, env);
  assert.equal(readBuildConfig(loaded).appEnv, 'production');
});

test('Android rejects target conflicts before reading files and rejects mismatched files without leaking values', () => {
  assert.throws(
    () =>
      readAndroidEnvironment({
        root: null,
        args: ['--environment', 'production'],
        env: { APP_ENV: 'development' },
      }),
    /diverge de APP_ENV/,
  );
  for (const args of [
    ['--environment'],
    ['--environment', 'unknown-private-value'],
    ['--environment', 'production', '--environment', 'development'],
    ['--other-private-argument'],
  ]) {
    assert.throws(
      () => selectAndroidEnvironment(args, {}),
      (error) =>
        /Use --environment/.test(error.message) &&
        !/private/.test(error.message),
    );
  }
  assert.throws(
    () => selectAndroidEnvironment([], { APP_ENV: 'private-invalid-value' }),
    (error) => /APP_ENV/.test(error.message) && !/private/.test(error.message),
  );
  const root = environmentDirectory();
  writeEnvironment(root, '.env.android.production.local', valid);
  assert.throws(
    () => readAndroidEnvironment({ root, env: { APP_ENV: 'production' } }),
    /APP_ENV em \.env\.android\.production\.local/,
  );
  writeEnvironment(root, '.env.android.local', {
    ...valid,
    APP_ENV: 'production',
  });
  assert.throws(
    () => readAndroidEnvironment({ root, env: {} }),
    /APP_ENV em \.env\.android\.local/,
  );
});

test('Android reports unreadable environment files by filename without falling back', () => {
  const root = environmentDirectory();
  mkdirSync(join(root, '.env.android.production.local'));
  assert.throws(
    () => readAndroidEnvironment({ root, env: { APP_ENV: 'production' } }),
    /Não foi possível ler \.env\.android\.production\.local/,
  );
});

test('Android environments reject mismatched Clerk instances and incomplete signing before build', () => {
  assert.deepEqual(readBuildConfig(valid), {
    appEnv: 'development',
    version: '0.1.0',
    versionCode: 1,
  });
  assert.throws(
    () => readBuildConfig({ ...valid, APP_ENV: 'production' }),
    /pk_live_/,
  );
  assert.throws(
    () =>
      readBuildConfig({
        ...valid,
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_fixture',
      }),
    /pk_test_/,
  );
  for (const name of [
    'ANDROID_KEYSTORE_PATH',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ]) {
    assert.throws(
      () => readBuildConfig({ ...valid, [name]: '' }),
      new RegExp(name),
    );
  }
  assert.doesNotThrow(() =>
    readBuildConfig({
      ...valid,
      APP_ENV: 'production',
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_fixture',
    }),
  );
});

test('Android rejects unsafe version labels, absent keys and unexpected endpoint formats without echoing inputs', () => {
  for (const code of ['0', '-1', '1.5', '1e2', '2100000001', ''])
    assert.throws(
      () => readBuildConfig({ ...valid, ANDROID_VERSION_CODE: code }),
      /ANDROID_VERSION_CODE/,
    );
  for (const version of ['../../outside', '1', '1.2.3/other'])
    assert.throws(
      () => readBuildConfig({ ...valid, APP_VERSION: version }),
      /APP_VERSION/,
    );
  for (const url of [
    'http://example.convex.cloud',
    'https://example.com',
    'https://example.convex.cloud/path',
    'https://secret:password@example.convex.cloud',
  ]) {
    assert.throws(
      () => readBuildConfig({ ...valid, EXPO_PUBLIC_CONVEX_URL: url }),
      (error) =>
        !error.message.includes(url) &&
        error.message.includes('EXPO_PUBLIC_CONVEX_URL'),
    );
  }
  assert.throws(
    () =>
      readBuildConfig({
        ...valid,
        ANDROID_KEYSTORE_PATH: join(directory, 'missing.jks'),
      }),
    /ANDROID_KEYSTORE_PATH/,
  );
  assert.throws(
    () =>
      readBuildConfig({
        ...valid,
        ANDROID_KEYSTORE_PATH: fileURLToPath(import.meta.url),
      }),
    /fora do repositório/,
  );
});

test('prebuild signing override survives repeated regeneration and rejects broken generated blocks', () => {
  const template =
    'apply plugin: "com.android.application"\nandroid { buildTypes { release { signingConfig signingConfigs.debug } } }\n';
  const result = addReleaseSigning(template);
  assert.equal(addReleaseSigning(result), result);
  assert.ok(
    result.indexOf('signingConfig signingConfigs.betaRelease') >
      result.indexOf('signingConfig signingConfigs.debug'),
  );
  assert.ok(
    result.includes(
      "throw new GradleException('Assinatura Android incompleta: '",
    ),
  );
  assert.ok(result.includes('System.getenv(name)'));
  assert.ok(!result.includes(valid.ANDROID_KEYSTORE_PASSWORD));
  assert.throws(
    () =>
      addReleaseSigning(template + '// @generated beta-release-signing start'),
    /incompleto/,
  );
  assert.throws(
    () => addReleaseSigning('plugins { id("com.android.application") }'),
    /não reconhecido/,
  );
});
