import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import {
  checkProduction,
  hasLocalConvexLogin,
  PRODUCTION_DEPLOYMENT,
  readProductionOptions,
  validateProductionEnvironment,
} from './production-check.mjs';

const args = ['--deployment', PRODUCTION_DEPLOYMENT];
const key = `prod:${PRODUCTION_DEPLOYMENT}|private-deploy-key-fixture`;
const liveKey = (hostname) =>
  `pk_live_${Buffer.from(`${hostname}$`).toString('base64')}`;
const valid = {
  CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.production.example',
  CLERK_PUBLISHABLE_KEY: liveKey('clerk.production.example'),
  CLERK_SECRET_KEY: 'sk_live_private-clerk-key-fixture',
  MCP_RESOURCE_URL: `https://${PRODUCTION_DEPLOYMENT}.convex.site/mcp`,
  MCP_ALLOWED_OAUTH_CLIENT_IDS: 'production-client-fixture',
  LIBRARY_CARD_ORDER_ENABLED: 'true',
  LIBRARY_READING_ORDER_ENABLED: 'true',
};
const output = Object.entries(valid)
  .map(([name, value]) => `${name}=${value}`)
  .join('\n');

test('Production check requires the known production deployment and rejects unsafe keys before querying', () => {
  for (const input of [
    [],
    ['--deployment', 'kindhearted-hare-87'],
    ['--deployment', 'other-prod'],
    [...args, '--other'],
  ])
    assert.throws(() => readProductionOptions(input));
  for (const badKey of [
    undefined,
    '',
    'private-key-without-target',
    'dev:kindhearted-hare-87|private-dev-key',
    `dev:${PRODUCTION_DEPLOYMENT}|private-key`,
    'prod:another-production|private-key',
    'project:team:project|private-key',
    'preview:team:project|private-key',
    `prod:${PRODUCTION_DEPLOYMENT}|`,
    `${key}\n`,
  ]) {
    let queried = false;
    assert.throws(
      () =>
        checkProduction({
          args,
          env: { CONVEX_DEPLOY_KEY: badKey },
          run: () => {
            queried = true;
          },
        }),
      (error) =>
        error.message.includes('CONVEX_DEPLOY_KEY') &&
        !error.message.includes('private-'),
    );
    assert.equal(queried, false);
  }
});

test('Production CI queries read-only env inventory with a checked key and returns no values', () => {
  let called = false;
  const result = checkProduction({
    args,
    env: {
      CONVEX_DEPLOY_KEY: key,
      CONVEX_DEPLOYMENT_TOKEN: 'conflicting-alias',
      CONVEX_SELF_HOSTED_URL: 'https://other.example',
      CI: 'true',
    },
    run: (_command, commandArgs, options) => {
      called = true;
      assert.deepEqual(commandArgs.slice(1), ['env', 'list']);
      assert.ok(!commandArgs.join(' ').includes(key));
      assert.equal(options.env.CONVEX_DEPLOY_KEY, key);
      assert.equal(options.env.CONVEX_DEPLOYMENT_TOKEN, '');
      assert.equal(options.env.CONVEX_SELF_HOSTED_URL, '');
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
      assert.equal(options.timeout, 45_000);
      return { status: 0, stdout: output, stderr: '' };
    },
  });
  assert.equal(called, true);
  assert.equal(result.deployment, PRODUCTION_DEPLOYMENT);
  assert.deepEqual(result.checked, Object.keys(valid));
  assert.ok(!JSON.stringify(result).includes('private-'));
});

test('Local login is explicit, requires an existing session and cannot become a CI or key fallback', () => {
  let queried = false;
  const run = (_command, commandArgs, options) => {
    queried = true;
    assert.deepEqual(commandArgs.slice(1), [
      'env',
      'list',
      '--deployment',
      PRODUCTION_DEPLOYMENT,
    ]);
    assert.equal(options.env.CONVEX_DEPLOY_KEY, '');
    return { status: 0, stdout: output };
  };
  assert.throws(
    () =>
      checkProduction({
        args: [...args, '--use-login'],
        env: {},
        localLogin: () => false,
        run,
      }),
    /Faça login/,
  );
  assert.equal(queried, false);
  for (const env of [
    { CI: 'true' },
    { CONVEX_DEPLOY_KEY: key },
    { CONVEX_DEPLOYMENT_TOKEN: 'private-alias' },
  ])
    assert.throws(
      () =>
        checkProduction({
          args: [...args, '--use-login'],
          env,
          localLogin: () => true,
          run,
        }),
      /fora do CI/,
    );
  assert.equal(queried, false);
  assert.equal(
    checkProduction({
      args: [...args, '--use-login'],
      env: {},
      localLogin: () => true,
      run,
    }).deployment,
    PRODUCTION_DEPLOYMENT,
  );
  assert.equal(queried, true);
  assert.equal(
    hasLocalConvexLogin(() => '{"accessToken":"local-private-token"}'),
    true,
  );
  assert.equal(
    hasLocalConvexLogin(() => '{}'),
    false,
  );
  assert.equal(
    hasLocalConvexLogin(() => 'invalid'),
    false,
  );
});

test('Production inventory rejects DEV or mismatched Clerk, incorrect MCP and disabled release flags without values', () => {
  const changes = [
    [
      'CLERK_PUBLISHABLE_KEY',
      valid.CLERK_PUBLISHABLE_KEY.replace('pk_live_', 'pk_test_'),
    ],
    ['CLERK_SECRET_KEY', 'sk_test_private-invalid'],
    ['CLERK_PUBLISHABLE_KEY', liveKey('clerk.other.example')],
    ['CLERK_PUBLISHABLE_KEY', 'pk_live_private-malformed'],
    ['CLERK_JWT_ISSUER_DOMAIN', 'https://genuine-lark-146.clerk.accounts.dev'],
    [
      'CLERK_JWT_ISSUER_DOMAIN',
      'https://private:password@clerk.production.example',
    ],
    ['CLERK_JWT_ISSUER_DOMAIN', 'https://clerk.production.example/path'],
    ['CLERK_JWT_ISSUER_DOMAIN', 'http://clerk.production.example'],
    ['MCP_RESOURCE_URL', 'https://kindhearted-hare-87.convex.site/mcp'],
    [
      'MCP_RESOURCE_URL',
      `https://${PRODUCTION_DEPLOYMENT}.convex.site/mcp?private=query`,
    ],
    ['MCP_ALLOWED_OAUTH_CLIENT_IDS', 'private-client,'],
    ['LIBRARY_CARD_ORDER_ENABLED', 'false'],
    ['LIBRARY_READING_ORDER_ENABLED', 'false'],
    ['MCP_ALLOWED_ORIGINS', 'https://private:password@chatgpt.com'],
  ];
  for (const [name, value] of changes) {
    assert.throws(
      () => validateProductionEnvironment({ ...valid, [name]: value }),
      (error) =>
        error.message.includes(name) &&
        !error.message.includes('private') &&
        !error.message.includes(value),
    );
  }
  assert.throws(
    () => validateProductionEnvironment({}),
    /Variáveis ausentes.*CLERK_JWT_ISSUER_DOMAIN.*LIBRARY_READING_ORDER_ENABLED/,
  );
});

test('Production inventory accepts padded and unpadded matching live keys and safe origins', () => {
  assert.doesNotThrow(() =>
    validateProductionEnvironment({
      ...valid,
      CLERK_PUBLISHABLE_KEY: valid.CLERK_PUBLISHABLE_KEY.replace(/=+$/, ''),
      MCP_ALLOWED_ORIGINS: 'https://chatgpt.com,https://chat.openai.com',
    }),
  );
});

test('Failed Convex reads suppress subprocess output, network errors and secret-bearing failures', () => {
  for (const run of [
    () => ({ status: 1, stdout: key, stderr: valid.CLERK_SECRET_KEY }),
    () => ({ status: null, error: new Error(key) }),
    () => {
      throw new Error(valid.CLERK_SECRET_KEY);
    },
  ])
    assert.throws(
      () => checkProduction({ args, env: { CONVEX_DEPLOY_KEY: key }, run }),
      (error) =>
        /Não foi possível consultar/.test(error.message) &&
        !error.message.includes('private-'),
    );
});
