import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export function readOptions(args) {
  const allowed = new Set(['--server', '--issuer', '--client-id', '--port']);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!allowed.has(name) || !value || values.has(name))
      throw new Error('Invalid arguments');
    values.set(name, value);
  }
  const resource = new URL(values.get('--server') ?? '');
  const issuer = new URL(values.get('--issuer') ?? '');
  for (const url of [resource, issuer]) {
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('HTTPS URLs required');
  }
  const port = Number(values.get('--port') ?? 8765);
  const clientId = values.get('--client-id');
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !clientId)
    throw new Error('Invalid port or client ID');
  return {
    resource: resource.toString(),
    issuer: issuer.toString().replace(/\/$/, ''),
    port,
    clientId,
  };
}

function matchingState(actual, expected) {
  if (typeof actual !== 'string') return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function jsonResponse(response) {
  if (!response.ok) throw new Error('HTTP request failed');
  return await response.json();
}

export async function runSmoke(options) {
  let stage = 'descoberta OAuth';
  const metadataUrl = new URL(
    '/.well-known/oauth-protected-resource/mcp',
    options.resource,
  );
  const metadata = await jsonResponse(await fetch(metadataUrl));
  if (
    metadata.resource !== options.resource ||
    !metadata.authorization_servers?.includes(options.issuer)
  )
    throw new Error('Unexpected resource metadata');
  const authorization = await jsonResponse(
    await fetch(`${options.issuer}/.well-known/oauth-authorization-server`),
  );
  if (
    authorization.issuer !== options.issuer ||
    !authorization.code_challenge_methods_supported?.includes('S256')
  )
    throw new Error('Unexpected OAuth server or PKCE unsupported');
  const authorizationEndpoint = new URL(authorization.authorization_endpoint);
  const tokenEndpoint = new URL(authorization.token_endpoint);
  for (const url of [authorizationEndpoint, tokenEndpoint]) {
    if (
      url.protocol !== 'https:' ||
      url.origin !== new URL(options.issuer).origin
    )
      throw new Error('Unexpected OAuth endpoint');
  }

  const redirect = `http://127.0.0.1:${options.port}/callback`;
  const state = randomBytes(24).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const scopes =
    'openid offline_access alphabet:read alphabet:write vocabulary:read vocabulary:write';
  const authorize = new URL(authorizationEndpoint);
  for (const [key, value] of Object.entries({
    response_type: 'code',
    client_id: options.clientId,
    redirect_uri: redirect,
    scope: scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: options.resource,
  }))
    authorize.searchParams.set(key, value);

  async function exchange(parameters) {
    return await jsonResponse(
      await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: options.clientId,
          resource: options.resource,
          ...parameters,
        }),
      }),
    );
  }

  async function verifyMcp(token) {
    if (typeof token !== 'string' || token.split('.').length !== 3)
      throw new Error('OAuth access token must be a JWT');
    const client = new Client({
      name: 'babel-crux-oauth-smoke',
      version: '1.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(options.resource),
      {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      },
    );
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      if (
        ![
          'search_alphabet',
          'get_alphabet',
          'create_alphabet',
          'update_alphabet',
          'search_vocabulary',
          'get_vocabulary',
          'create_vocabulary',
          'update_vocabulary',
          'set_vocabulary_archived',
        ].every((name) => tools.tools.some((tool) => tool.name === name))
      )
        throw new Error('MCP tools missing');
      for (const name of ['search_alphabet', 'search_vocabulary']) {
        const found = await client.callTool({ name, arguments: { limit: 1 } });
        if (found.isError || !Array.isArray(found.structuredContent?.items))
          throw new Error('MCP search failed');
      }
      // Output contains neither tokens nor personal card content or user IDs.
      console.log(
        JSON.stringify({
          stage,
          initialized: true,
          tools: tools.tools.map(({ name }) => name),
          searchSucceeded: true,
        }),
      );
    } finally {
      await client.close();
    }
  }

  return await new Promise((resolve, reject) => {
    let handled = false;
    const server = createServer(async (request, response) => {
      const callback = new URL(request.url ?? '/', redirect);
      if (request.method !== 'GET' || callback.pathname !== '/callback') {
        response.writeHead(404).end();
        return;
      }
      if (
        handled ||
        !matchingState(callback.searchParams.get('state'), state)
      ) {
        response.writeHead(400).end('Callback OAuth invalido.');
        return;
      }
      handled = true;
      let tokens;
      let refreshed;
      try {
        const callbackIssuer = callback.searchParams.get('iss');
        if (
          (authorization.authorization_response_iss_parameter_supported ||
            callbackIssuer) &&
          callbackIssuer !== options.issuer
        )
          throw new Error('Unexpected callback issuer');
        const code = callback.searchParams.get('code');
        if (!code || callback.searchParams.has('error'))
          throw new Error('Authorization not granted');
        stage = 'troca do código com PKCE';
        tokens = await exchange({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirect,
          code_verifier: verifier,
        });
        if (!tokens.refresh_token) throw new Error('Refresh token missing');
        stage = 'MCP com access token OAuth';
        await verifyMcp(tokens.access_token);
        stage = 'renovação OAuth';
        refreshed = await exchange({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
        });
        stage = 'MCP após renovação';
        await verifyMcp(refreshed.access_token);
        response
          .writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
          })
          .end(
            'OAuth, PKCE, refresh e MCP validados. Nenhum card foi alterado. Pode fechar esta aba.',
          );
        console.log(
          'OAuth + PKCE + refresh + MCP: OK. Tokens permaneceram apenas na memória.',
        );
        resolve();
      } catch {
        response
          .writeHead(500, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
          })
          .end('A validação falhou. Consulte a etapa indicada no terminal.');
        reject(new Error(`Falha na etapa: ${stage}`));
      } finally {
        tokens = undefined;
        refreshed = undefined;
        clearTimeout(timeout);
        server.close();
      }
    });
    server.on('error', () => {
      clearTimeout(timeout);
      reject(new Error('Não foi possível abrir o callback local.'));
    });
    const timeout = setTimeout(
      () => {
        server.close();
        reject(new Error('Tempo limite aguardando autorização OAuth.'));
      },
      10 * 60 * 1000,
    );
    server.listen(options.port, '127.0.0.1', () => {
      console.log(
        `Callback temporário que deve estar cadastrado no Clerk: ${redirect}`,
      );
      console.log(
        'Abra a URL abaixo no navegador e autorize sua própria conta:',
      );
      console.log(authorize.toString());
    });
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.includes('--help')) {
    console.log(
      'node scripts/mcp-smoke.mjs --server https://DEPLOYMENT.convex.site/mcp --issuer https://INSTANCE.clerk.accounts.dev --client-id CLIENT_ID [--port 8765]',
    );
  } else {
    try {
      await runSmoke(readOptions(process.argv.slice(2)));
    } catch (error) {
      // Never print third-party error bodies, request URLs, codes or tokens.
      console.error(
        error instanceof Error && error.message.startsWith('Falha na etapa:')
          ? error.message
          : 'Validação MCP não concluída. Confira argumentos, descoberta OAuth e disponibilidade do callback local.',
      );
      process.exitCode = 1;
    }
  }
}
