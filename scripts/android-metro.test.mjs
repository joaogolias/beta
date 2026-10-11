import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const mobile = join(root, 'mobile');
const configPath = join(mobile, 'metro.config.js');
const require = createRequire(import.meta.url);

test('Metro cache identity includes the environment and every public variable, with stable ordering', () => {
  const source = readFileSync(configPath, 'utf8');
  const version = (env) => {
    const module = { exports: {} };
    runInNewContext(source, {
      __dirname: mobile,
      module,
      process: { env },
      require: (name) =>
        name === 'expo/metro-config'
          ? { getDefaultConfig: () => ({ cacheVersion: 'expo-default' }) }
          : require(name),
    });
    return module.exports.cacheVersion;
  };
  const publicValues = { EXPO_PUBLIC_SECOND: 'two', EXPO_PUBLIC_FIRST: 'one' };
  const development = version(publicValues);
  assert.match(development, /^expo-default:[a-f0-9]{64}$/);
  assert.equal(
    development,
    version({
      APP_ENV: 'development',
      EXPO_PUBLIC_FIRST: 'one',
      EXPO_PUBLIC_SECOND: 'two',
      CLERK_SECRET_KEY: 'private-fixture-not-in-the-client-cache',
    }),
  );
  assert.notEqual(
    development,
    version({ ...publicValues, APP_ENV: 'production' }),
  );
  assert.notEqual(
    development,
    version({ ...publicValues, EXPO_PUBLIC_SECOND: 'changed' }),
  );
  assert.notEqual(development, version({ EXPO_PUBLIC_FIRST: 'one' }));
});

test(
  'Expo CI exports replace inlined public values across production, development, and key rotation with warm caches',
  { timeout: 240_000 },
  () => {
    const directory = mkdtempSync(join(mobile, '.metro-regression-'));
    const cacheDirectory = mkdtempSync(
      join(tmpdir(), 'beta-metro-regression-'),
    );
    try {
      const entry = join(directory, 'entry.js');
      const bundle = join(directory, 'index.android.bundle');
      writeFileSync(
        entry,
        `globalThis.__metroEnvironmentFixture = {
        key: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
        url: process.env.EXPO_PUBLIC_CONVEX_URL,
        feature: process.env.EXPO_PUBLIC_FUTURE_SETTING,
      };\n`,
      );
      const runtimeEnvironment = Object.fromEntries(
        Object.entries(process.env).filter(([name]) =>
          /^(PATH|HOME|USERPROFILE|SYSTEMROOT|COMSPEC|PATHEXT|LANG|LC_ALL)$/i.test(
            name,
          ),
        ),
      );
      const stages = [
        {
          APP_ENV: 'production',
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_fixture_production',
          EXPO_PUBLIC_CONVEX_URL: 'https://production-fixture.convex.cloud',
          EXPO_PUBLIC_FUTURE_SETTING: 'fixture-production-setting',
        },
        {
          APP_ENV: 'development',
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture_development',
          EXPO_PUBLIC_CONVEX_URL: 'https://development-fixture.convex.cloud',
          EXPO_PUBLIC_FUTURE_SETTING: 'fixture-development-setting',
        },
        {
          APP_ENV: 'development',
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture_rotated',
          EXPO_PUBLIC_CONVEX_URL: 'https://development-fixture.convex.cloud',
          EXPO_PUBLIC_FUTURE_SETTING: 'fixture-rotated-setting',
        },
      ];
      const publicNames = Object.keys(stages[0]).filter((name) =>
        name.startsWith('EXPO_PUBLIC_'),
      );
      const cli = join(
        dirname(require.resolve('expo/package.json')),
        'bin/cli',
      );
      const priorValues = new Set();
      for (const [index, stage] of stages.entries()) {
        const result = spawnSync(
          process.execPath,
          [
            cli,
            'export:embed',
            '--platform',
            'android',
            '--dev',
            'false',
            '--minify',
            'false',
            '--entry-file',
            entry,
            '--bundle-output',
            bundle,
            '--max-workers',
            '2',
            '--reset-cache',
          ],
          {
            cwd: mobile,
            env: {
              ...runtimeEnvironment,
              ...stage,
              CI: '1',
              NODE_ENV: 'production',
              EXPO_NO_DOTENV: '1',
              EXPO_NO_TELEMETRY: '1',
              EXPO_OFFLINE: '1',
              TMPDIR: cacheDirectory,
              TMP: cacheDirectory,
              TEMP: cacheDirectory,
            },
            encoding: 'utf8',
            timeout: 75_000,
            maxBuffer: 4 * 1024 * 1024,
          },
        );
        // Only synthetic public inputs reach this child, and redact them on failure.
        let diagnostic = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
        for (const values of stages) {
          for (const name of publicNames) {
            diagnostic = diagnostic.replaceAll(
              values[name],
              '<public fixture>',
            );
          }
        }
        assert.equal(
          result.status,
          0,
          `Expo fixture export ${index + 1} failed (${result.error?.code ?? result.signal ?? result.status}): ${diagnostic.slice(-4000)}`,
        );
        const output = readFileSync(bundle, 'utf8');
        const expectedValues = new Set(publicNames.map((name) => stage[name]));
        for (const name of publicNames) {
          assert.ok(
            output.includes(stage[name]),
            `Export ${index + 1} must inline current ${name}`,
          );
        }
        for (const value of priorValues) {
          if (!expectedValues.has(value)) {
            assert.ok(
              !output.includes(value),
              `Export ${index + 1} must not retain a prior public value`,
            );
          }
        }
        for (const value of expectedValues) priorValues.add(value);
        assert.ok(
          readdirSync(join(cacheDirectory, 'metro-cache')).length > 0,
          'The next export must reuse a populated cache directory',
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
      rmSync(cacheDirectory, { recursive: true, force: true });
    }
  },
);
