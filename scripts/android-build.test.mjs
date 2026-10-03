import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { readBuildConfig } from './android-config.mjs';

const require = createRequire(import.meta.url);
const {
  addReleaseSigning,
} = require('../mobile/plugins/withReleaseSigning.cjs');
const directory = mkdtempSync(join(tmpdir(), 'babel-crux-signing-test-'));
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
    result.indexOf('signingConfig signingConfigs.babelCruxRelease') >
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
      addReleaseSigning(
        template + '// @generated babel-crux-release-signing start',
      ),
    /incompleto/,
  );
  assert.throws(
    () => addReleaseSigning('plugins { id("com.android.application") }'),
    /não reconhecido/,
  );
});
