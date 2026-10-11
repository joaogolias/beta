import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

export const PRODUCTION_DEPLOYMENT = 'glad-bison-698';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'CLERK_JWT_ISSUER_DOMAIN',
  'CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'MCP_RESOURCE_URL',
  'MCP_ALLOWED_OAUTH_CLIENT_IDS',
  'LIBRARY_CARD_ORDER_ENABLED',
  'LIBRARY_READING_ORDER_ENABLED',
];

export class ProductionCheckError extends Error {}

export function readProductionOptions(args) {
  const options = { useLogin: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--deployment' && !options.deployment) {
      options.deployment = args[++index];
    } else if (args[index] === '--use-login' && !options.useLogin) {
      options.useLogin = true;
    } else {
      throw new ProductionCheckError(
        'Use --deployment glad-bison-698 e, somente para login local, --use-login.',
      );
    }
  }
  // This known deployment was verified as production. Local login must not
  // allow an arbitrary development deployment to masquerade as production.
  if (options.deployment !== PRODUCTION_DEPLOYMENT)
    throw new ProductionCheckError(
      'Selecione explicitamente --deployment glad-bison-698.',
    );
  return options;
}

export function hasLocalConvexLogin(read = readFileSync) {
  try {
    const config = JSON.parse(
      read(join(homedir(), '.convex', 'config.json'), 'utf8'),
    );
    return (
      typeof config.accessToken === 'string' &&
      Boolean(config.accessToken.trim())
    );
  } catch {
    return false;
  }
}

export function productionCommand(
  options,
  env,
  localLogin = hasLocalConvexLogin,
) {
  if (options.deployment !== PRODUCTION_DEPLOYMENT)
    throw new ProductionCheckError('Deployment de produção inesperado.');
  const key = env.CONVEX_DEPLOY_KEY ?? '';
  if (options.useLogin) {
    if (env.CI || key || env.CONVEX_DEPLOYMENT_TOKEN)
      throw new ProductionCheckError(
        '--use-login exige sessão local, fora do CI e sem deploy key.',
      );
    if (!localLogin())
      throw new ProductionCheckError(
        'Faça login no Convex localmente antes de usar --use-login.',
      );
  } else if (
    !key.startsWith(`prod:${PRODUCTION_DEPLOYMENT}|`) ||
    key !== key.trim() ||
    !/^[^|\s]+\|[^|\s]+$/.test(key)
  ) {
    throw new ProductionCheckError(
      'CONVEX_DEPLOY_KEY deve ser uma chave exclusiva do deployment de produção esperado; chaves DEV, preview e project não são aceitas.',
    );
  }
  // Convex 1.45: a deploy key wins over --prod, and cannot be combined with
  // --deployment. These are intentionally separate, explicitly checked modes.
  return {
    args: [
      join(root, 'node_modules/convex/dist/cli.bundle.cjs'),
      'env',
      'list',
      ...(options.useLogin ? ['--deployment', PRODUCTION_DEPLOYMENT] : []),
    ],
    env: {
      ...env,
      CI: 'true',
      CONVEX_DEPLOY_KEY: key,
      CONVEX_DEPLOYMENT_TOKEN: '',
      CONVEX_DEPLOYMENT: `prod:${PRODUCTION_DEPLOYMENT}`,
      CONVEX_SELF_HOSTED_URL: '',
      CONVEX_SELF_HOSTED_ADMIN_KEY: '',
    },
  };
}

function issuerUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.hostname.endsWith('.clerk.accounts.dev')
    )
      throw new Error();
    return url;
  } catch {
    throw new ProductionCheckError(
      'CLERK_JWT_ISSUER_DOMAIN deve ser o domínio HTTPS da instância de produção.',
    );
  }
}

export function validateProductionEnvironment(env) {
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length)
    throw new ProductionCheckError(
      `Variáveis ausentes no Convex de produção: ${missing.join(', ')}.`,
    );
  const issuer = issuerUrl(env.CLERK_JWT_ISSUER_DOMAIN);
  const publishable = /^pk_live_([A-Za-z0-9+/]+={0,2})$/.exec(
    env.CLERK_PUBLISHABLE_KEY.trim(),
  );
  const secret = /^sk_live_\S+$/.test(env.CLERK_SECRET_KEY.trim());
  let hostname;
  if (publishable) {
    try {
      const decoded = atob(publishable[1]);
      if (decoded.endsWith('$')) hostname = decoded.slice(0, -1);
    } catch {
      /* An invalid key is reported without its contents below. */
    }
  }
  if (
    !secret ||
    !hostname ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(
      hostname,
    ) ||
    hostname.toLowerCase() !== issuer.hostname
  )
    throw new ProductionCheckError(
      'CLERK_PUBLISHABLE_KEY e CLERK_SECRET_KEY devem ser live, com domínio público correspondente ao issuer.',
    );
  if (
    env.MCP_RESOURCE_URL !== `https://${PRODUCTION_DEPLOYMENT}.convex.site/mcp`
  )
    throw new ProductionCheckError(
      'MCP_RESOURCE_URL deve apontar para /mcp no deployment de produção esperado.',
    );
  if (
    !env.MCP_ALLOWED_OAUTH_CLIENT_IDS.split(',').every((value) => value.trim())
  )
    throw new ProductionCheckError(
      'MCP_ALLOWED_OAUTH_CLIENT_IDS deve listar clientes de produção sem entradas vazias.',
    );
  for (const name of [
    'LIBRARY_CARD_ORDER_ENABLED',
    'LIBRARY_READING_ORDER_ENABLED',
  ]) {
    if (env[name] !== 'true')
      throw new ProductionCheckError(
        `${name} deve ser true no Convex de produção.`,
      );
  }
  if (env.MCP_ALLOWED_ORIGINS) {
    try {
      for (const value of env.MCP_ALLOWED_ORIGINS.split(',')) {
        const url = new URL(value.trim());
        if (
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          url.pathname !== '/' ||
          url.search ||
          url.hash
        )
          throw new Error();
      }
    } catch {
      throw new ProductionCheckError(
        'MCP_ALLOWED_ORIGINS deve conter somente origens HTTPS.',
      );
    }
  }
  return { deployment: PRODUCTION_DEPLOYMENT, checked: [...required] };
}

export function checkProduction({
  args = process.argv.slice(2),
  env = process.env,
  run = spawnSync,
  localLogin = hasLocalConvexLogin,
} = {}) {
  const options = readProductionOptions(args);
  const command = productionCommand(options, env, localLogin);
  let result;
  try {
    result = run(process.execPath, command.args, {
      cwd: join(root, 'backend'),
      env: command.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new ProductionCheckError(
      'Não foi possível consultar as variáveis do Convex; confira autenticação e acesso ao deployment esperado.',
    );
  }
  if (result.error || result.status !== 0)
    throw new ProductionCheckError(
      'Não foi possível consultar as variáveis do Convex; confira autenticação e acesso ao deployment esperado.',
    );
  // env list is read-only. Its output remains in memory and is never written
  // to disk or forwarded, including stderr on authentication/network failures.
  let values;
  try {
    values = parseEnv(result.stdout ?? '');
  } catch {
    throw new ProductionCheckError(
      'A resposta da consulta de configuração não é válida.',
    );
  }
  return validateProductionEnvironment(values);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = checkProduction();
    console.log(
      `Configuração de produção validada para ${result.deployment}; nenhum deploy foi executado.`,
    );
  } catch (error) {
    console.error(
      error instanceof ProductionCheckError
        ? error.message
        : 'A verificação de produção falhou; nenhum valor de configuração foi exibido.',
    );
    process.exitCode = 1;
  }
}
