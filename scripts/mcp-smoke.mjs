import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export function readOptions(args) {
  const allowed = new Set([
    '--server',
    '--issuer',
    '--client-id',
    '--port',
    '--shiken-authoring-check',
  ]);
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
  const shikenAuthoringCheck =
    values.get('--shiken-authoring-check') ?? 'false';
  if (!['true', 'false'].includes(shikenAuthoringCheck))
    throw new Error('Invalid Shiken authoring check flag');
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !clientId)
    throw new Error('Invalid port or client ID');
  return {
    resource: resource.toString(),
    issuer: issuer.toString().replace(/\/$/, ''),
    port,
    clientId,
    shikenAuthoringCheck: shikenAuthoringCheck === 'true',
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

function shikenCheckFixtures() {
  const audio = Buffer.alloc(48);
  for (const [offset, text] of [
    [0, 'RIFF'],
    [8, 'WAVE'],
    [12, 'fmt '],
    [36, 'data'],
  ])
    audio.write(text, offset, 'ascii');
  audio.writeUInt32LE(40, 4);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(8000, 24);
  audio.writeUInt32LE(16000, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.writeUInt32LE(4, 40);
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=',
    'base64',
  );
  return [
    {
      clientKey: 'mcp-check-shiken-audio-v1',
      contentType: 'audio/wav',
      bytes: audio,
    },
    {
      clientKey: 'mcp-check-shiken-image-v1',
      contentType: 'image/png',
      bytes: image,
    },
  ];
}

function requiredCheck(condition, message) {
  if (!condition) throw new Error(message);
}

/** Writes only two stable neutral media fixtures; never creates a valid paper. */
export async function verifyShikenAuthorship(
  client,
  { resource, tools, fetchImpl = fetch },
) {
  const available = tools ?? (await client.listTools()).tools;
  const create = available.find(({ name }) => name === 'create_shiken_paper')
    ?.inputSchema?.properties;
  const content = available.find(
    ({ name }) => name === 'get_shiken_paper_content',
  )?.inputSchema?.properties;
  requiredCheck(
    create?.clientKey &&
      create?.paper?.properties?.questions &&
      ['id', 'questionOffset', 'questionLimit', 'expectedContentVersion'].every(
        (key) => content?.[key],
      ),
    'Shiken authoring schemas incomplete',
  );
  async function call(name, args) {
    const response = await client.callTool({ name, arguments: args });
    requiredCheck(
      !response.isError && response.structuredContent,
      'Shiken authoring check failed',
    );
    return response.structuredContent;
  }
  const found = await call('search_shiken_papers', { limit: 1 });
  requiredCheck(Array.isArray(found.items), 'Shiken search response invalid');
  let contentPages = 0,
    contentQuestions = 0;
  if (found.items.length) {
    const id = found.items[0].id;
    requiredCheck(typeof id === 'string', 'Shiken paper reference invalid');
    let questionOffset = 0,
      version;
    const questionIds = new Set();
    while (true) {
      const page = await call('get_shiken_paper_content', {
        id,
        questionOffset,
        questionLimit: 20,
        ...(version ? { expectedContentVersion: version } : {}),
      });
      requiredCheck(
        page.id === id &&
          page.questionOffset === questionOffset &&
          Number.isSafeInteger(page.contentVersion) &&
          page.contentVersion > 0 &&
          (!version || page.contentVersion === version) &&
          Array.isArray(page.questions) &&
          Number.isSafeInteger(page.totalQuestions) &&
          page.totalQuestions >= 0 &&
          page.totalQuestions <= 200,
        'Shiken content response invalid',
      );
      version = page.contentVersion;
      for (const question of page.questions) {
        requiredCheck(
          typeof question.id === 'string' &&
            !questionIds.has(question.id) &&
            typeof question.prompt === 'string' &&
            typeof question.explanation === 'string' &&
            Array.isArray(question.choices) &&
            Number.isSafeInteger(question.correctChoice),
          'Shiken question readback incomplete',
        );
        questionIds.add(question.id);
      }
      contentPages++;
      contentQuestions += page.questions.length;
      if (page.nextQuestionOffset === null) {
        requiredCheck(
          contentQuestions === page.totalQuestions,
          'Shiken content readback truncated',
        );
        break;
      }
      requiredCheck(
        Number.isSafeInteger(page.nextQuestionOffset) &&
          page.nextQuestionOffset === questionOffset + page.questions.length &&
          page.nextQuestionOffset > questionOffset &&
          page.nextQuestionOffset < page.totalQuestions &&
          contentPages <= 200,
        'Shiken pagination invalid',
      );
      questionOffset = page.nextQuestionOffset;
    }
  }
  const rejected = await client.callTool({
    name: 'create_shiken_paper',
    arguments: {
      clientKey: 'mcp-check-shiken-invalid-v1',
      paper: { title: 'Validation only', level: 'N5', questions: [] },
    },
  });
  requiredCheck(
    rejected.isError === true,
    'An invalid Shiken paper was unexpectedly accepted',
  );
  let mediaBytes = 0;
  for (const { bytes, ...fixture } of shikenCheckFixtures()) {
    const input = {
      ...fixture,
      byteLength: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    const prepared = await call('prepare_shiken_media_upload', input);
    requiredCheck(
      typeof prepared.id === 'string' &&
        prepared.clientKey === input.clientKey &&
        prepared.sha256 === input.sha256 &&
        prepared.byteLength === input.byteLength &&
        prepared.contentType === input.contentType,
      'Shiken media preparation invalid',
    );
    if (prepared.status === 'pending') {
      const target = new URL(prepared.upload?.url ?? '');
      requiredCheck(
        target.protocol === 'https:' &&
          target.origin === new URL(resource).origin &&
          !target.username &&
          !target.password &&
          !target.search &&
          !target.hash &&
          /^\/shiken-media-upload\/[a-f0-9]{64}$/.test(target.pathname) &&
          prepared.upload.method === 'POST' &&
          prepared.upload.contentType === input.contentType &&
          prepared.upload.expiresAt > Date.now(),
        'Shiken upload destination invalid',
      );
      const response = await fetchImpl(target, {
        method: 'POST',
        headers: { 'Content-Type': input.contentType },
        body: bytes,
        redirect: 'error',
      });
      const uploaded = await jsonResponse(response);
      requiredCheck(
        uploaded.id === prepared.id && uploaded.status === 'ready',
        'Shiken upload not confirmed',
      );
    } else
      requiredCheck(
        prepared.status === 'ready' && prepared.upload === null,
        'Shiken media status invalid',
      );
    const { media } = await call('get_shiken_media', { id: prepared.id });
    requiredCheck(
      media?.id === prepared.id &&
        media.status === 'ready' &&
        media.sha256 === input.sha256 &&
        media.byteLength === input.byteLength &&
        media.contentType === input.contentType,
      'Shiken media readback invalid',
    );
    const mediaUrl = new URL(media.url ?? '');
    requiredCheck(
      mediaUrl.protocol === 'https:' &&
        !mediaUrl.username &&
        !mediaUrl.password,
      'Shiken media download URL invalid',
    );
    const downloaded = await fetchImpl(mediaUrl, { redirect: 'error' });
    requiredCheck(
      downloaded.ok &&
        downloaded.headers
          .get('content-type')
          ?.split(';')[0]
          .trim()
          .toLowerCase() === input.contentType,
      'Shiken media download headers invalid',
    );
    const received = Buffer.from(await downloaded.arrayBuffer());
    requiredCheck(
      received.length === input.byteLength &&
        createHash('sha256').update(received).digest('hex') === input.sha256 &&
        received.equals(bytes),
      'Shiken media download differs from fixture',
    );
    const repeated = await call('prepare_shiken_media_upload', input);
    requiredCheck(
      repeated.id === prepared.id &&
        repeated.status === 'ready' &&
        repeated.upload === null &&
        repeated.url === media.url,
      'Shiken media preparation is not idempotent',
    );
    mediaBytes += received.length;
  }
  return {
    schemasVerified: true,
    existingPaperPages: contentPages,
    existingPaperQuestions: contentQuestions,
    invalidPaperRejected: true,
    mediaFixturesVerified: 2,
    mediaBytesVerified: mediaBytes,
    mediaIdempotencyVerified: true,
    validPapersCreated: 0,
  };
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
    'openid offline_access alphabet:read alphabet:write vocabulary:read vocabulary:write grammar:read grammar:write quests:read quests:write study:read shiken:read shiken:write stories:read stories:write';
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
      name: 'beta-oauth-smoke',
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
          'search_grammar',
          'get_grammar',
          'create_grammar',
          'update_grammar',
          'set_grammar_archived',
          'list_quests',
          'get_quest',
          'create_quest',
          'cancel_quest',
          'get_study_progress',
          'get_study_cards',
          'search_shiken_papers',
          'get_shiken_paper',
          'get_shiken_history',
          'create_shiken_paper',
          'get_shiken_paper_content',
          'prepare_shiken_media_upload',
          'get_shiken_media',
          'list_stories',
          'get_story',
          'create_story',
          'update_story',
          'delete_story',
          'set_story_archived',
        ].every((name) => tools.tools.some((tool) => tool.name === name))
      )
        throw new Error('MCP tools missing');
      for (const name of [
        'search_alphabet',
        'search_vocabulary',
        'search_grammar',
        'list_quests',
        'list_stories',
        'search_shiken_papers',
        'get_shiken_history',
      ]) {
        const found = await client.callTool({ name, arguments: { limit: 1 } });
        if (found.isError || !Array.isArray(found.structuredContent?.items))
          throw new Error('MCP search failed');
      }
      // Output contains neither tokens nor personal card content or user IDs.
      const cards = await client.callTool({
        name: 'get_study_cards',
        arguments: { category: 'alphabet', limit: 1 },
      });
      if (cards.isError || !Array.isArray(cards.structuredContent?.items))
        throw new Error('MCP card progress lookup failed');
      const shikenAuthorship = options.shikenAuthoringCheck
        ? await verifyShikenAuthorship(client, {
            resource: options.resource,
            tools: tools.tools,
          })
        : undefined;
      console.log(
        JSON.stringify({
          stage,
          initialized: true,
          toolCount: tools.tools.length,
          searchSucceeded: true,
          ...(shikenAuthorship ? { shikenAuthorship } : {}),
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
            'OAuth, PKCE, refresh e MCP validados. Nenhuma prova foi criada e nenhum card foi alterado. Pode fechar esta aba.',
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
      'node scripts/mcp-smoke.mjs --server https://DEPLOYMENT.convex.site/mcp --issuer https://INSTANCE.clerk.accounts.dev --client-id CLIENT_ID [--port 8765] [--shiken-authoring-check true|false]',
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
