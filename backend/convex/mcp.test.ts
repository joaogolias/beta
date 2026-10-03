import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { api, internal } from './_generated/api';
import { createTestBackend, learnerIdentity } from './test-support.helpers';
import { handleMcpHttp } from './mcpHttp';
import {
  authenticateMcp,
  resourceMetadata,
  READ_SCOPE,
  WRITE_SCOPE,
  VOCABULARY_READ_SCOPE,
  VOCABULARY_WRITE_SCOPE,
  GRAMMAR_READ_SCOPE,
  GRAMMAR_WRITE_SCOPE,
  OAUTH_SCOPES,
} from './mcpAuth';
import type { McpConfiguration } from './mcpAuth';
import type { AlphabetCreateInput } from './alphabetDomain';
import {
  cardResultSchema,
  searchResultSchema,
  vocabularyCardResultSchema,
  vocabularySearchResultSchema,
  grammarCardResultSchema,
  grammarSearchResultSchema,
} from './mcpSchemas';
import type { VocabularyCreateInput } from './vocabularyDomain';
import type { GrammarCreateInput } from './grammarDomain';

const resource = 'https://babel-test.convex.site/mcp';
const issuer = learnerIdentity.issuer;
const toolNames = [
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
];
const config: McpConfiguration = {
  resource,
  issuer,
  secretKey: 'sk_test_babel_crux_mcp_unit_test',
  publishableKey: `pk_test_${btoa(`${new URL(issuer).host}$`)}`,
  allowedClientIds: ['babel-mcp-client'],
  allowedOrigins: ['https://chatgpt.com'],
};

const kanji: AlphabetCreateInput = {
  language: 'ja',
  writingSystem: 'Hani',
  symbol: '日',
  meanings: ['sol', 'dia'],
  examples: [{ text: '日本', reading: 'にほん', meaning: 'Japão' }],
  front: '日',
  back: 'Sol; dia',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
  details: {
    kind: 'kanji',
    kunYomi: ['ひ'],
    onYomi: ['ニチ', 'ジツ'],
    radicals: ['日'],
  },
};

const vocabulary: VocabularyCreateInput = {
  language: 'ja',
  expression: '食べる',
  reading: 'たべる',
  translations: { pt: ['comer'], en: ['eat'] },
  examples: [
    {
      text: 'パンを食べる。',
      reading: 'ぱんをたべる。',
      meaning: 'Comer pão no café exclusivo.',
    },
  ],
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
};

const grammar: GrammarCreateInput = {
  language: 'ja',
  title: 'は marca o tópico',
  explanation: 'A partícula temática indica o assunto da frase.',
  examples: [
    {
      text: '私は学生です。',
      reading: 'わたしはがくせいです。',
      meaning: 'Sou estudante universitário.',
    },
  ],
  shortExplanation: 'Use は: informação conhecida.',
  classifications: [
    { scheme: 'jlpt', level: 'N5' },
    { scheme: 'curso', level: 'LIÇÃO-TÓPICOS' },
  ],
};

let key: CryptoKeyPair;
let jwk: JsonWebKey;

function base64url(value: string | Uint8Array) {
  const binary =
    typeof value === 'string' ? value : String.fromCharCode(...value);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function accessToken(
  claims: Record<string, unknown> = {},
  typ = 'at+jwt',
) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    JSON.stringify({ alg: 'RS256', kid: 'babel-mcp-test-key', typ }),
  );
  const body = base64url(
    JSON.stringify({
      iss: issuer,
      aud: resource,
      sub: learnerIdentity.subject,
      client_id: 'babel-mcp-client',
      scope: `openid ${READ_SCOPE} ${WRITE_SCOPE}`,
      exp: now + 3600,
      iat: now - 10,
      nbf: now - 10,
      jti: 'oat_test',
      ...claims,
    }),
  );
  const unsigned = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key.privateKey,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

beforeAll(async () => {
  key = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  jwk = await crypto.subtle.exportKey('jwk', key.publicKey);
});

beforeEach(() => {
  // Mock the public JWKS network boundary, not Clerk token verification.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url !== 'https://api.clerk.com/v1/jwks')
        throw new Error('Unexpected network request');
      return Response.json({
        keys: [{ ...jwk, kid: 'babel-mcp-test-key', alg: 'RS256', use: 'sig' }],
      });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function request(
  token?: string,
  body: unknown = { jsonrpc: '2.0', id: 1, method: 'tools/list' },
) {
  return new Request(resource, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function endpoint(backend: ReturnType<typeof createTestBackend>) {
  return (req: Request) =>
    handleMcpHttp(
      req,
      ({ tokenIdentifier }) => ({
        alphabet: {
          search: ({ limit, cursor, ...filters }) =>
            backend.query(internal.mcpGateway.search, {
              tokenIdentifier,
              ...filters,
              paginationOpts: { numItems: limit, cursor },
            }),
          get: (id) =>
            backend.query(internal.mcpGateway.get, { tokenIdentifier, id }),
          create: (card) =>
            backend.mutation(internal.mcpGateway.create, {
              tokenIdentifier,
              card,
            }),
          update: (id, patch) =>
            backend.mutation(internal.mcpGateway.update, {
              tokenIdentifier,
              id,
              patch,
            }),
        },
        vocabulary: {
          search: ({ limit, cursor, ...filters }) =>
            backend.query(internal.mcpGateway.searchVocabulary, {
              tokenIdentifier,
              ...filters,
              paginationOpts: { numItems: limit, cursor },
            }),
          get: (id) =>
            backend.query(internal.mcpGateway.getVocabulary, {
              tokenIdentifier,
              id,
            }),
          create: (card) =>
            backend.mutation(internal.mcpGateway.createVocabulary, {
              tokenIdentifier,
              card,
            }),
          update: (id, patch) =>
            backend.mutation(internal.mcpGateway.updateVocabulary, {
              tokenIdentifier,
              id,
              patch,
            }),
          setArchived: (id, archived) =>
            backend.mutation(internal.mcpGateway.setVocabularyArchived, {
              tokenIdentifier,
              id,
              archived,
            }),
        },
        grammar: {
          search: ({ limit, cursor, ...filters }) =>
            backend.query(internal.mcpGateway.searchGrammar, {
              tokenIdentifier,
              ...filters,
              paginationOpts: { numItems: limit, cursor },
            }),
          get: (id) =>
            backend.query(internal.mcpGateway.getGrammar, {
              tokenIdentifier,
              id,
            }),
          create: (card) =>
            backend.mutation(internal.mcpGateway.createGrammar, {
              tokenIdentifier,
              card,
            }),
          update: (id, patch) =>
            backend.mutation(internal.mcpGateway.updateGrammar, {
              tokenIdentifier,
              id,
              patch,
            }),
          setArchived: (id, archived) =>
            backend.mutation(internal.mcpGateway.setGrammarArchived, {
              tokenIdentifier,
              id,
              archived,
            }),
        },
      }),
      config,
    );
}

async function connect(
  backend: ReturnType<typeof createTestBackend>,
  token: string,
) {
  const handle = endpoint(backend);
  const client = new Client({ name: 'babel-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: async (input, init) => handle(new Request(input, init)),
  });
  await client.connect(transport);
  return client;
}

describe('remote alphabet MCP', () => {
  test('kanji creation omits authored faces and accepts empty readings while generic requires both faces', async () => {
    const backend = createTestBackend();
    const client = await connect(backend, await accessToken());
    try {
      const input: AlphabetCreateInput = {
        ...kanji,
        details: { kind: 'kanji', kunYomi: [], onYomi: [], radicals: [] },
      };
      delete input.front;
      delete input.back;
      const created = await client.callTool({
        name: 'create_alphabet',
        arguments: { card: input },
      });
      expect(created.isError).not.toBe(true);
      expect(
        cardResultSchema.parse(created.structuredContent).card,
      ).toMatchObject({
        front: '日',
        back: '意味 · Significado: sol; dia\n訓読み · Kun’yomi: —\n音読み · On’yomi: —\n部首 · Radical: —',
      });
      const invalid = await client.callTool({
        name: 'create_alphabet',
        arguments: {
          card: {
            ...input,
            language: 'pt',
            writingSystem: 'Latn',
            symbol: 'a',
            details: { kind: 'generic', readings: [] },
            classifications: [],
          },
        },
      });
      expect(invalid.isError).toBe(true);
      const oversizedGeneric = await client.callTool({
        name: 'create_alphabet',
        arguments: {
          card: {
            ...input,
            language: 'pt',
            writingSystem: 'Latn',
            symbol: 'a',
            details: { kind: 'generic', readings: [] },
            classifications: [],
            front: 'A',
            back: 'a'.repeat(9_000),
          },
        },
      });
      expect(oversizedGeneric.isError).toBe(true);
      expect(
        await backend.run((ctx) => ctx.db.query('alphabetCards').take(2)),
      ).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  test('large generated backs remain valid MCP outputs after a successful creation', async () => {
    const backend = createTestBackend();
    const client = await connect(backend, await accessToken());
    try {
      const values = Array.from(
        { length: 32 },
        (_, index) => `${index}${'あ'.repeat(290)}`,
      );
      const input: AlphabetCreateInput = {
        ...kanji,
        meanings: values,
        details: {
          kind: 'kanji',
          kunYomi: values,
          onYomi: values,
          radicals: values,
        },
      };
      delete input.front;
      delete input.back;
      const result = await client.callTool({
        name: 'create_alphabet',
        arguments: { card: input },
      });
      expect(result.isError).not.toBe(true);
      const card = cardResultSchema.parse(result.structuredContent).card;
      expect(card.back.length).toBeGreaterThan(8_000);
      expect(card.back.length).toBeLessThan(40_000);
      expect(card.back).toContain(values[31]);
      const fetched = await client.callTool({
        name: 'get_alphabet',
        arguments: { id: card.id },
      });
      expect(fetched.structuredContent).toEqual(result.structuredContent);
    } finally {
      await client.close();
    }
  });

  test('SDK initialization, tool discovery, CRUD, search and pagination use the personal catalog', async () => {
    const backend = createTestBackend();
    const client = await connect(backend, await accessToken());
    try {
      const tools = await client.listTools();
      expect(tools.tools.map(({ name }) => name)).toEqual(toolNames);
      expect(
        tools.tools.every(
          (tool) =>
            tool.inputSchema.type === 'object' &&
            tool.outputSchema?.type === 'object',
        ),
      ).toBe(true);
      expect(
        tools.tools.find((tool) => tool.name === 'update_alphabet')
          ?.annotations,
      ).toMatchObject({ destructiveHint: true });
      expect(
        tools.tools.find((tool) => tool.name === 'create_alphabet')
          ?.annotations,
      ).toMatchObject({ destructiveHint: false });
      const created = await client.callTool({
        name: 'create_alphabet',
        arguments: { card: kanji },
      });
      expect(created.isError).not.toBe(true);
      const card = cardResultSchema.parse(created.structuredContent).card;
      expect(card).toMatchObject({ symbol: '日', archived: false });
      expect(card).not.toHaveProperty('ownerId');
      const id = card.id;
      expect(
        (await client.callTool({ name: 'get_alphabet', arguments: { id } }))
          .structuredContent,
      ).toEqual(created.structuredContent);
      const updated = await client.callTool({
        name: 'update_alphabet',
        arguments: {
          id,
          patch: {
            meanings: ['sol', 'dia', 'luz'],
            back: 'Sol e dia (atualizado)',
          },
        },
      });
      expect(updated.structuredContent).toMatchObject({
        card: {
          back: expect.stringContaining('Significado: sol; dia; luz'),
          meanings: ['sol', 'dia', 'luz'],
          contentVersion: 2,
        },
      });
      const found = await client.callTool({
        name: 'search_alphabet',
        arguments: { reading: 'にち', level: 'N5', limit: 1 },
      });
      expect(found.structuredContent).toMatchObject({ items: [{ id }] });
      const page = await client.callTool({
        name: 'search_alphabet',
        arguments: {
          cursor: searchResultSchema.parse(found.structuredContent).cursor,
          limit: 1,
        },
      });
      expect(page.isError).not.toBe(true);
      const duplicate = await client.callTool({
        name: 'create_alphabet',
        arguments: { card: kanji },
      });
      expect(duplicate).toMatchObject({
        isError: true,
        content: [
          { type: 'text', text: expect.stringContaining('"code":"CONFLICT"') },
        ],
      });
      const invalid = await client.callTool({
        name: 'update_alphabet',
        arguments: { id, patch: { symbol: 'not a kanji' } },
      });
      expect(invalid).toMatchObject({
        isError: true,
        content: [
          {
            type: 'text',
            text: expect.stringContaining('"code":"VALIDATION"'),
          },
        ],
      });
    } finally {
      await client.close();
    }
  });

  test('first MCP use provisions the same owner later used by the mobile login', async () => {
    const backend = createTestBackend();
    const client = await connect(backend, await accessToken());
    await client.callTool({
      name: 'create_alphabet',
      arguments: { card: kanji },
    });
    const mobile = backend.withIdentity(learnerIdentity);
    const owner = await mobile.mutation(api.users.ensureCurrentUser, {});
    const cards = await backend.run((ctx) =>
      ctx.db.query('alphabetCards').take(10),
    );
    expect(cards[0].ownerId).toEqual(owner._id);
    expect(
      await backend.run((ctx) => ctx.db.query('users').take(10)),
    ).toHaveLength(1);
    await client.close();
  });

  test('OAuth identities cannot read, mutate or discover another user’s cards', async () => {
    const backend = createTestBackend();
    const owner = await connect(backend, await accessToken());
    const other = await connect(
      backend,
      await accessToken({ sub: 'user_other' }),
    );
    const created = await owner.callTool({
      name: 'create_alphabet',
      arguments: { card: kanji },
    });
    const card = cardResultSchema.parse(created.structuredContent).card;
    for (const operation of [
      { name: 'get_alphabet', arguments: { id: card.id } },
      {
        name: 'update_alphabet',
        arguments: { id: card.id, patch: { back: 'attack' } },
      },
    ]) {
      expect(await other.callTool(operation)).toMatchObject({
        isError: true,
        content: [
          {
            type: 'text',
            text: expect.stringContaining('"code":"UNAVAILABLE"'),
          },
        ],
      });
    }
    expect(
      (await other.callTool({ name: 'search_alphabet', arguments: {} }))
        .structuredContent,
    ).toMatchObject({ items: [] });
    const injectedOwner = await other.callTool({
      name: 'create_alphabet',
      arguments: {
        card: kanji,
        tokenIdentifier: learnerIdentity.tokenIdentifier,
      },
    });
    expect(injectedOwner.isError).toBe(true);
    await owner.close();
    await other.close();
  });

  test('verifies signature, expiration, issuer, audience, token type, client and read scope', async () => {
    expect(
      await authenticateMcp(request(await accessToken()), config),
    ).toMatchObject({ tokenIdentifier: learnerIdentity.tokenIdentifier });
    expect(
      await authenticateMcp(
        request(await accessToken({ aud: [resource] })),
        config,
      ),
    ).toMatchObject({ clientId: 'babel-mcp-client' });
    for (const claims of [
      { exp: 1 },
      { iss: 'https://another.clerk.accounts.dev' },
      { aud: 'https://other-resource.example/mcp' },
      { aud: 'babel-mcp-client' },
      { aud: ['babel-mcp-client', 'https://other-resource.example/mcp'] },
      { client_id: 'another-client' },
      { sub: 'mch_machine' },
      { aud: null },
      { aud: undefined },
    ]) {
      await expect(
        authenticateMcp(request(await accessToken(claims)), config),
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(
      authenticateMcp(request(await accessToken({}, 'JWT')), config),
    ).rejects.toMatchObject({ status: 401 });
    const valid = await accessToken();
    await expect(
      authenticateMcp(request(`${valid.slice(0, -5)}xxxxx`), config),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      authenticateMcp(request(await accessToken({ scope: 'openid' })), config),
    ).rejects.toMatchObject({ status: 403, requiredScope: READ_SCOPE });
    await expect(
      authenticateMcp(request('oat_unverifiable_opaque_token'), config),
    ).rejects.toMatchObject({ status: 401 });
  });

  test('discovery challenges explain authentication and enforce write scope before mutation', async () => {
    const backend = createTestBackend();
    const handle = endpoint(backend);
    const anonymous = await handle(request());
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('WWW-Authenticate')).toContain(
      '/.well-known/oauth-protected-resource/mcp',
    );
    expect(resourceMetadata(config)).toMatchObject({
      resource,
      authorization_servers: [issuer],
      scopes_supported: OAUTH_SCOPES,
    });
    const readOnly = await accessToken({ scope: `openid ${READ_SCOPE}` });
    const denied = await handle(
      request(readOnly, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'create_alphabet', arguments: { card: kanji } },
      }),
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get('WWW-Authenticate')).toContain(
      'scope="openid alphabet:read alphabet:write offline_access"',
    );
    expect(
      await backend.run((ctx) => ctx.db.query('alphabetCards').take(1)),
    ).toEqual([]);
  });

  test('rejects untrusted origins, malformed payloads and oversized bodies', async () => {
    const backend = createTestBackend();
    const handle = endpoint(backend);
    const token = await accessToken();
    const foreignOrigin = request(token);
    foreignOrigin.headers.set('Origin', 'https://untrusted.example');
    expect((await handle(foreignOrigin)).status).toBe(403);
    expect(
      (
        await handle(
          new Request(resource, {
            method: 'OPTIONS',
            headers: { Origin: 'https://chatgpt.com' },
          }),
        )
      ).status,
    ).toBe(204);
    const headers = request(token).headers;
    expect(
      (
        await handle(
          new Request(resource, { method: 'POST', headers, body: '{' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handle(
          new Request(resource, {
            method: 'POST',
            headers,
            body: 'a'.repeat(256 * 1024 + 1),
          }),
        )
      ).status,
    ).toBe(413);
  });
});

describe('remote vocabulary MCP', () => {
  const vocabularyScope = `openid ${VOCABULARY_READ_SCOPE} ${VOCABULARY_WRITE_SCOPE}`;

  test('requires explicit reading omission and derives faces when readings are removed or restored', async () => {
    const backend = createTestBackend();
    const client = await connect(
      backend,
      await accessToken({ scope: vocabularyScope }),
    );
    try {
      const tools = (await client.listTools()).tools;
      const schema = tools.find(
        ({ name }) => name === 'create_vocabulary',
      )?.inputSchema;
      expect(schema).not.toHaveProperty('properties.card.properties.front');
      expect(schema).not.toHaveProperty('properties.card.properties.sortKey');
      expect(
        (
          await client.callTool({
            name: 'create_vocabulary',
            arguments: { card: { ...vocabulary, reading: '' } },
          })
        ).isError,
      ).toBe(true);
      const created = await client.callTool({
        name: 'create_vocabulary',
        arguments: {
          card: { ...vocabulary, reading: '', readingOmitted: true },
        },
      });
      expect(created.isError, JSON.stringify(created.content)).not.toBe(true);
      const card = vocabularyCardResultSchema.parse(
        created.structuredContent,
      ).card;
      expect(card).toMatchObject({
        reading: '',
        readingOmitted: true,
        front: vocabulary.expression,
      });
      expect(card.back).toContain('comer');
      expect(card.back).toContain('パンを食べる。');
      expect(
        (
          await client.callTool({
            name: 'update_vocabulary',
            arguments: { id: card.id, patch: { readingOmitted: false } },
          })
        ).isError,
      ).toBe(true);
      const restored = await client.callTool({
        name: 'update_vocabulary',
        arguments: {
          id: card.id,
          patch: { readingOmitted: false, reading: 'たべる' },
        },
      });
      expect(restored.isError).not.toBe(true);
      expect(
        vocabularyCardResultSchema.parse(restored.structuredContent).card,
      ).toMatchObject({
        reading: 'たべる',
        readingOmitted: false,
        back: expect.stringContaining('たべる'),
      });
    } finally {
      await client.close();
    }
  });

  test('creates, gets, partially edits and archives personal vocabulary without changing omitted translations or identity', async () => {
    const backend = createTestBackend();
    const client = await connect(
      backend,
      await accessToken({ scope: vocabularyScope }),
    );
    try {
      const created = await client.callTool({
        name: 'create_vocabulary',
        arguments: { card: vocabulary },
      });
      expect(created.isError).not.toBe(true);
      const card = vocabularyCardResultSchema.parse(
        created.structuredContent,
      ).card;
      expect(card).toMatchObject({
        ...vocabulary,
        contentVersion: 1,
        archived: false,
      });
      expect(card).not.toHaveProperty('ownerId');
      expect(card).not.toHaveProperty('readingKey');
      const stored = await backend.run((ctx) =>
        ctx.db.query('vocabularyCards').take(1),
      );
      const fetched = await client.callTool({
        name: 'get_vocabulary',
        arguments: { id: card.id },
      });
      expect(fetched.structuredContent).toEqual(created.structuredContent);
      const updated = await client.callTool({
        name: 'update_vocabulary',
        arguments: {
          id: card.id,
          patch: {
            translations: { pt: ['comer', 'alimentar-se'] },
            classifications: [{ scheme: 'jlpt', level: 'N4' }],
          },
        },
      });
      expect(
        vocabularyCardResultSchema.parse(updated.structuredContent).card,
      ).toMatchObject({
        id: card.id,
        translations: { pt: ['comer', 'alimentar-se'], en: ['eat'] },
        expression: vocabulary.expression,
        front: vocabulary.expression,
        back: expect.stringContaining('alimentar-se'),
        examples: vocabulary.examples,
        contentVersion: 2,
      });
      const saved = await backend.run((ctx) =>
        ctx.db.query('vocabularyCards').take(1),
      );
      expect(saved[0].ownerId).toEqual(stored[0].ownerId);
      expect(saved[0]._id).toEqual(stored[0]._id);
      expect(saved[0].createdAt).toEqual(stored[0].createdAt);
      const owner = await backend
        .withIdentity(learnerIdentity)
        .mutation(api.users.ensureCurrentUser, {});
      expect(owner._id).toEqual(saved[0].ownerId);

      for (const archived of [true, false]) {
        const result = await client.callTool({
          name: 'set_vocabulary_archived',
          arguments: { id: card.id, archived },
        });
        expect(
          vocabularyCardResultSchema.parse(result.structuredContent).card,
        ).toMatchObject({ id: card.id, archived, contentVersion: 2 });
        const active = await client.callTool({
          name: 'search_vocabulary',
          arguments: {},
        });
        expect(
          vocabularySearchResultSchema.parse(active.structuredContent).items,
        ).toHaveLength(archived ? 0 : 1);
        const archive = await client.callTool({
          name: 'search_vocabulary',
          arguments: { archived: true },
        });
        expect(
          vocabularySearchResultSchema.parse(archive.structuredContent).items,
        ).toHaveLength(archived ? 1 : 0);
        const duplicate = await client.callTool({
          name: 'create_vocabulary',
          arguments: { card: { ...vocabulary, reading: 'タベル' } },
        });
        expect(duplicate).toMatchObject({
          isError: true,
          content: [
            {
              type: 'text',
              text: expect.stringContaining('"code":"CONFLICT"'),
            },
          ],
        });
      }
    } finally {
      await client.close();
    }
  });

  test('search supports every content field, AND/OR, intersected filters and stable pagination without duplicate matches', async () => {
    const backend = createTestBackend();
    const client = await connect(
      backend,
      await accessToken({ scope: vocabularyScope }),
    );
    try {
      const cards = [
        {
          ...vocabulary,
          expression: '歩く',
          reading: 'あるく',
          translations: { pt: ['andar'], en: ['walk'] },
          examples: [],
        },
        vocabulary,
        {
          ...vocabulary,
          expression: '飲む',
          reading: 'のむ',
          translations: { pt: ['beber'], en: ['drink'] },
          examples: [],
          classifications: [{ scheme: 'jlpt', level: 'N4' }],
        },
      ];
      const ids: string[] = [];
      for (const card of cards) {
        const result = await client.callTool({
          name: 'create_vocabulary',
          arguments: { card },
        });
        ids.push(
          vocabularyCardResultSchema.parse(result.structuredContent).card.id,
        );
      }
      const search = async (args: Record<string, unknown>) =>
        vocabularySearchResultSchema.parse(
          (
            await client.callTool({
              name: 'search_vocabulary',
              arguments: args,
            })
          ).structuredContent,
        );
      for (const query of ['食べる', 'タベル', 'EAT', 'COMER', 'EXCLUSIVO']) {
        const found = await search({ query });
        expect(found.items.map(({ id }) => id)).toEqual([ids[1]]);
        expect(found.items[0].reading).toEqual('たべる');
        expect(found.items[0].summary).toContain('comer');
      }
      expect(
        (await search({ terms: ['COMER', 'タベル'] })).items.map(
          ({ id }) => id,
        ),
      ).toEqual([ids[1]]);
      expect((await search({ terms: ['eat', 'drink'] })).items).toEqual([]);
      const filters = { terms: ['eat', 'COMER', 'drink'], operator: 'OR' };
      expect((await search(filters)).items.map(({ id }) => id)).toEqual([
        ids[1],
        ids[2],
      ]);
      expect(
        (await search({ ...filters, level: 'N5' })).items.map(({ id }) => id),
      ).toEqual([ids[1]]);
      expect((await search({ ...filters, language: 'ko' })).items).toEqual([]);
      expect(
        (await search({ query: 'JLPT:N5' })).items.map(({ id }) => id),
      ).toEqual([ids[0], ids[1]]);
      let cursor: string | null = null;
      const paged: string[] = [];
      let finished = false;
      let sawEmptyPage = false;
      for (let page = 0; page < 10; page += 1) {
        const result = await search({ ...filters, cursor, limit: 1 });
        sawEmptyPage ||= result.items.length === 0;
        paged.push(...result.items.map(({ id }) => id));
        cursor = result.cursor;
        if (result.isDone) {
          finished = true;
          break;
        }
      }
      expect(finished).toBe(true);
      expect(sawEmptyPage).toBe(true);
      expect(paged).toEqual([ids[1], ids[2]]);
      expect(new Set(paged).size).toBe(paged.length);
    } finally {
      await client.close();
    }
  });

  test('isolates vocabulary by verified OAuth owner and rejects attempts to edit identity or statistics', async () => {
    const backend = createTestBackend();
    const owner = await connect(
      backend,
      await accessToken({ scope: vocabularyScope }),
    );
    const other = await connect(
      backend,
      await accessToken({ scope: vocabularyScope, sub: 'user_other' }),
    );
    try {
      const result = await owner.callTool({
        name: 'create_vocabulary',
        arguments: { card: vocabulary },
      });
      const { id } = vocabularyCardResultSchema.parse(
        result.structuredContent,
      ).card;
      for (const operation of [
        { name: 'get_vocabulary', arguments: { id } },
        {
          name: 'update_vocabulary',
          arguments: { id, patch: { expression: 'attack' } },
        },
        { name: 'set_vocabulary_archived', arguments: { id, archived: true } },
      ]) {
        expect(await other.callTool(operation)).toMatchObject({
          isError: true,
          content: [
            {
              type: 'text',
              text: expect.stringContaining('"code":"UNAVAILABLE"'),
            },
          ],
        });
      }
      expect(
        (await other.callTool({ name: 'search_vocabulary', arguments: {} }))
          .structuredContent,
      ).toMatchObject({ items: [] });
      for (const patch of [
        { ownerId: 'user_other' },
        { id: 'another' },
        { contentVersion: 9 },
        { stats: { correct: 9 } },
        { archived: true },
      ]) {
        expect(
          (
            await owner.callTool({
              name: 'update_vocabulary',
              arguments: { id, patch },
            })
          ).isError,
        ).toBe(true);
      }
      expect(
        (
          await other.callTool({
            name: 'create_vocabulary',
            arguments: {
              card: vocabulary,
              tokenIdentifier: learnerIdentity.tokenIdentifier,
            },
          })
        ).isError,
      ).toBe(true);
      const saved = await owner.callTool({
        name: 'get_vocabulary',
        arguments: { id },
      });
      expect(saved.structuredContent).toEqual(result.structuredContent);
    } finally {
      await owner.close();
      await other.close();
    }
  });

  test('authorizes each area independently and challenges missing scopes before accessing data', async () => {
    const backend = createTestBackend();
    const handle = endpoint(backend);
    const call = async (
      scope: string,
      name: string,
      args: Record<string, unknown> = {},
    ) =>
      handle(
        request(await accessToken({ scope }), {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      );
    const vocabularyRead = `openid ${VOCABULARY_READ_SCOPE}`;
    expect((await call(`openid ${READ_SCOPE}`, 'search_alphabet')).status).toBe(
      200,
    );
    expect((await call(vocabularyRead, 'search_vocabulary')).status).toBe(200);
    const cases = [
      {
        scope: `openid ${READ_SCOPE} ${WRITE_SCOPE}`,
        name: 'search_vocabulary',
        required: VOCABULARY_READ_SCOPE,
        args: {},
      },
      {
        scope: vocabularyScope,
        name: 'search_alphabet',
        required: READ_SCOPE,
        args: {},
      },
      {
        scope: vocabularyRead,
        name: 'create_vocabulary',
        required: VOCABULARY_WRITE_SCOPE,
        args: { card: vocabulary },
      },
      {
        scope: `${vocabularyRead} ${WRITE_SCOPE}`,
        name: 'create_vocabulary',
        required: VOCABULARY_WRITE_SCOPE,
        args: { card: vocabulary },
      },
      {
        scope: `openid ${READ_SCOPE} ${VOCABULARY_WRITE_SCOPE}`,
        name: 'create_vocabulary',
        required: VOCABULARY_READ_SCOPE,
        args: { card: vocabulary },
      },
      {
        scope: VOCABULARY_READ_SCOPE,
        name: 'search_vocabulary',
        required: 'openid',
        args: {},
      },
    ];
    for (const entry of cases) {
      const response = await call(entry.scope, entry.name, entry.args);
      expect(response.status).toBe(403);
      const challenge = response.headers.get('WWW-Authenticate');
      expect(challenge).toContain(entry.required);
      expect(challenge).toContain('insufficient_scope');
      expect(await response.text()).toContain('Reconecte');
      if (entry.required === VOCABULARY_WRITE_SCOPE)
        expect(challenge).not.toContain('alphabet:');
    }
    expect(
      await backend.run((ctx) => ctx.db.query('vocabularyCards').take(1)),
    ).toEqual([]);
    const discovered = await connect(
      backend,
      await accessToken({ scope: vocabularyRead }),
    );
    try {
      const tools = await discovered.listTools();
      expect(
        tools.tools.find(({ name }) => name === 'search_vocabulary')?._meta,
      ).toMatchObject({
        securitySchemes: [{ type: 'oauth2', scopes: [VOCABULARY_READ_SCOPE] }],
      });
      expect(tools.tools.map(({ name }) => name)).toEqual(toolNames);
    } finally {
      await discovered.close();
    }
  });

  test('requires explicit vocabulary faces, kana readings and valid translated content', async () => {
    const backend = createTestBackend();
    const client = await connect(
      backend,
      await accessToken({ scope: vocabularyScope }),
    );
    try {
      for (const card of [
        { ...vocabulary, front: '' },
        { ...vocabulary, back: '' },
        { ...vocabulary, reading: 'taberu' },
        { ...vocabulary, translations: { pt: [], en: [] } },
        { ...vocabulary, classifications: [] },
      ])
        expect(
          (
            await client.callTool({
              name: 'create_vocabulary',
              arguments: { card },
            })
          ).isError,
        ).toBe(true);
      expect(
        await backend.run((ctx) => ctx.db.query('vocabularyCards').take(1)),
      ).toEqual([]);
    } finally {
      await client.close();
    }
  });
});

describe('remote grammar MCP', () => {
  const grammarScope = `openid ${GRAMMAR_READ_SCOPE} ${GRAMMAR_WRITE_SCOPE}`;

  test('creates, gets and edits every grammar field while preserving omitted content, ownership and study history', async () => {
    const backend = createTestBackend();
    const client = await connect(
      backend,
      await accessToken({ scope: grammarScope }),
    );
    try {
      const created = await client.callTool({
        name: 'create_grammar',
        arguments: { card: grammar },
      });
      expect(created.isError).not.toBe(true);
      const card = grammarCardResultSchema.parse(
        created.structuredContent,
      ).card;
      expect(card).toMatchObject({
        ...grammar,
        archived: false,
        contentVersion: 1,
      });
      expect(card).not.toHaveProperty('ownerId');
      expect(card).not.toHaveProperty('_id');
      expect(
        (
          await client.callTool({
            name: 'get_grammar',
            arguments: { id: card.id },
          })
        ).structuredContent,
      ).toEqual(created.structuredContent);

      const learner = backend.withIdentity(learnerIdentity);
      const stored = (
        await backend.run((ctx) => ctx.db.query('grammarCards').take(1))
      )[0];
      const session = await learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        limit: 1,
        category: 'grammar',
      });
      const { presentation } = await learner.query(api.study.current, {
        sessionId: session._id,
      });
      if (!presentation)
        throw new Error('Expected an active grammar presentation');
      const answerArgs = {
        sessionId: session._id,
        presentationId: presentation._id,
      };
      await learner.mutation(api.study.reveal, answerArgs);
      await learner.mutation(api.study.rate, {
        ...answerArgs,
        rating: 'correct',
      });
      const historyArgs = {
        cardId: stored._id,
        paginationOpts: { cursor: null, numItems: 10 },
      };
      const history = await learner.query(api.study.history, historyArgs);
      const progress = await learner.query(api.study.progress, {
        cardId: stored._id,
      });
      const totals = await learner.query(api.study.overview, {});

      const partial = await client.callTool({
        name: 'update_grammar',
        arguments: {
          id: card.id,
          patch: { explanation: '  Explicação revisada.\nSegunda linha.  ' },
        },
      });
      const partialCard = grammarCardResultSchema.parse(
        partial.structuredContent,
      ).card;
      expect(partialCard).toEqual({
        ...card,
        explanation: 'Explicação revisada.\nSegunda linha.',
        contentVersion: 2,
        updatedAt: expect.any(Number),
      });
      const replacement: GrammarCreateInput = {
        language: 'pt-BR',
        title: '  Título revisado  ',
        explanation: 'Nova explicação completa.',
        examples: [
          {
            text: 'Exemplo novo',
            meaning: 'Exemplo explicado',
            reading: 'Leitura nova',
          },
        ],
        shortExplanation: 'Resposta nova.',
        classifications: [{ scheme: 'JLPT', level: 'n4' }],
      };
      const updated = await client.callTool({
        name: 'update_grammar',
        arguments: { id: card.id, patch: replacement },
      });
      expect(
        grammarCardResultSchema.parse(updated.structuredContent).card,
      ).toMatchObject({
        ...replacement,
        id: card.id,
        language: 'pt-br',
        title: 'Título revisado',
        classifications: [{ scheme: 'jlpt', level: 'N4' }],
        contentVersion: 3,
      });
      const saved = (
        await backend.run((ctx) => ctx.db.query('grammarCards').take(1))
      )[0];
      expect(saved._id).toBe(stored._id);
      expect(saved.ownerId).toBe(stored.ownerId);
      expect(saved.createdAt).toBe(stored.createdAt);
      expect(await learner.query(api.study.history, historyArgs)).toEqual(
        history,
      );
      expect(
        await learner.query(api.study.progress, { cardId: stored._id }),
      ).toEqual(progress);
      expect(await learner.query(api.study.overview, {})).toEqual(totals);
      for (const archived of [true, false]) {
        const result = await client.callTool({
          name: 'set_grammar_archived',
          arguments: { id: card.id, archived },
        });
        expect(
          grammarCardResultSchema.parse(result.structuredContent).card,
        ).toMatchObject({ id: card.id, archived, contentVersion: 3 });
        const active = await client.callTool({
          name: 'search_grammar',
          arguments: {},
        });
        expect(
          grammarSearchResultSchema.parse(active.structuredContent).items,
        ).toHaveLength(archived ? 0 : 1);
        const archive = await client.callTool({
          name: 'search_grammar',
          arguments: { archived: true },
        });
        expect(
          grammarSearchResultSchema.parse(archive.structuredContent).items,
        ).toHaveLength(archived ? 1 : 0);
      }
      expect(await learner.query(api.study.history, historyArgs)).toEqual(
        history,
      );
      expect(await learner.query(api.study.overview, {})).toEqual(totals);
    } finally {
      await client.close();
    }
  });

  test('searches every field with AND by default, explicit OR, intersected levels and stable unique pagination', async () => {
    const backend = createTestBackend();
    const client = await connect(
      backend,
      await accessToken({ scope: grammarScope }),
    );
    try {
      const cards: GrammarCreateInput[] = [
        {
          ...grammar,
          language: 'ko',
          title: 'Primeiro neutro',
          explanation: 'Descreve uma relação.',
          examples: [{ text: 'Texto neutro.' }],
          shortExplanation: 'Resposta neutra.',
          classifications: [{ scheme: 'jlpt', level: 'N5' }],
        },
        grammar,
        {
          ...grammar,
          language: 'en',
          title: 'Última condição',
          explanation: 'Condição alternativa.',
          examples: [{ text: 'Texto alternativo.' }],
          shortExplanation: 'Resposta alternativa.',
          classifications: [{ scheme: 'jlpt', level: 'N4' }],
        },
      ];
      const ids: string[] = [];
      for (const card of cards) {
        const created = await client.callTool({
          name: 'create_grammar',
          arguments: { card },
        });
        ids.push(
          grammarCardResultSchema.parse(created.structuredContent).card.id,
        );
      }
      const search = async (args: Record<string, unknown>) =>
        grammarSearchResultSchema.parse(
          (await client.callTool({ name: 'search_grammar', arguments: args }))
            .structuredContent,
        );
      for (const query of [
        'TOPICO',
        'TEMATICA',
        '私は学生です',
        'ワタシハガクセイデス',
        'UNIVERSITARIO',
        'CONHECIDA',
        'curso',
        'LICAO-TOPICOS',
        'ja',
      ]) {
        const found = await search({ query });
        expect(
          found.items.map(({ id }) => id),
          query,
        ).toEqual([ids[1]]);
        expect(found.items[0].summary).toContain(grammar.title);
        expect(found.items[0].title).toBe(grammar.title);
      }
      expect(
        (await search({ terms: ['TOPICO', 'CONHECIDA'] })).items.map(
          ({ id }) => id,
        ),
      ).toEqual([ids[1]]);
      expect(
        (await search({ query: 'TOPICO', terms: ['universitário'] })).items.map(
          ({ id }) => id,
        ),
      ).toEqual([ids[1]]);
      expect(
        (await search({ terms: ['TOPICO', 'alternativa'] })).items,
      ).toEqual([]);
      expect(
        (await search({ terms: ['informação conhecida'] })).items.map(
          ({ id }) => id,
        ),
      ).toEqual([ids[1]]);
      const filters = {
        terms: ['TOPICO', 'CONHECIDA', 'alternativa'],
        operator: 'OR',
      };
      expect((await search(filters)).items.map(({ id }) => id)).toEqual([
        ids[1],
        ids[2],
      ]);
      expect(
        (await search({ ...filters, level: 'N5' })).items.map(({ id }) => id),
      ).toEqual([ids[1]]);
      expect(
        (await search({ ...filters, language: 'ja' })).items.map(
          ({ id }) => id,
        ),
      ).toEqual([ids[1]]);
      expect((await search({ ...filters, level: 'N3' })).items).toEqual([]);
      expect(
        (await search({ query: 'JLPT:N5' })).items.map(({ id }) => id),
      ).toEqual([ids[0], ids[1]]);
      let cursor: string | null = null;
      const paged: string[] = [];
      let finished = false;
      let sawEmptyPage = false;
      for (let page = 0; page < 10; page += 1) {
        const result = await search({ ...filters, cursor, limit: 1 });
        sawEmptyPage ||= result.items.length === 0;
        paged.push(...result.items.map(({ id }) => id));
        cursor = result.cursor;
        if (result.isDone) {
          finished = true;
          break;
        }
      }
      expect(finished).toBe(true);
      expect(sawEmptyPage).toBe(true);
      expect(paged).toEqual([ids[1], ids[2]]);
      expect(new Set(paged).size).toBe(paged.length);
      expect((await search(filters)).items.map(({ id }) => id)).toEqual(paged);
    } finally {
      await client.close();
    }
  });

  test('exposes automatic faces, permits optional summaries/examples and rejects invalid edits atomically', async () => {
    const backend = createTestBackend();
    const client = await connect(
      backend,
      await accessToken({ scope: grammarScope }),
    );
    try {
      const tools = (await client.listTools()).tools;
      const createTool = tools.find(({ name }) => name === 'create_grammar');
      expect(createTool?.inputSchema).not.toHaveProperty(
        'properties.card.properties.front',
      );
      expect(createTool?.inputSchema).not.toHaveProperty(
        'properties.card.properties.back',
      );
      expect(createTool?.inputSchema).not.toHaveProperty(
        'properties.card.properties.sortKey',
      );
      const created = await client.callTool({
        name: 'create_grammar',
        arguments: { card: grammar },
      });
      expect(created.isError).not.toBe(true);
      const { id } = grammarCardResultSchema.parse(
        created.structuredContent,
      ).card;
      const cleared = await client.callTool({
        name: 'update_grammar',
        arguments: { id, patch: { shortExplanation: '', examples: [] } },
      });
      expect(cleared.isError).not.toBe(true);
      const clearedCard = grammarCardResultSchema.parse(
        cleared.structuredContent,
      ).card;
      expect(clearedCard.front).toBe(grammar.title);
      expect(clearedCard.back).toBe('');
      expect(clearedCard.explanation).toBe(grammar.explanation);
      const before = await client.callTool({
        name: 'get_grammar',
        arguments: { id },
      });
      for (const patch of [
        {},
        { front: '' },
        { back: 'Texto manual' },
        { sortKey: 'ordem manual' },
        { shortExplanation: 'a'.repeat(2001), title: 'Não deve salvar' },
        { explanation: '' },
        { examples: [{ text: 'Exemplo', unknown: 'não' }] },
        { classifications: [] },
        { classifications: [{ scheme: 'jlpt', level: 'N6' }] },
        { title: 42 },
        { explanation: null },
        { language: 'invalid_language' },
        { mystery: 'não' },
        { id: 'other' },
        { ownerId: 'user_other' },
        { archived: true },
        { createdAt: 0 },
        { updatedAt: 0 },
        { contentVersion: 99 },
        { stats: { correct: 9 } },
      ]) {
        const result = await client.callTool({
          name: 'update_grammar',
          arguments: { id, patch },
        });
        expect(result.isError, JSON.stringify(patch).slice(0, 100)).toBe(true);
        expect(
          (await client.callTool({ name: 'get_grammar', arguments: { id } }))
            .structuredContent,
        ).toEqual(before.structuredContent);
      }
      expect(
        (
          await client.callTool({
            name: 'update_grammar',
            arguments: { id: 'invalid-id', patch: { title: 'Título' } },
          })
        ).isError,
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  test('isolates search, full reads and writes by the verified OAuth owner', async () => {
    const backend = createTestBackend();
    const owner = await connect(
      backend,
      await accessToken({ scope: grammarScope }),
    );
    const other = await connect(
      backend,
      await accessToken({ scope: grammarScope, sub: 'user_other' }),
    );
    try {
      const created = await owner.callTool({
        name: 'create_grammar',
        arguments: { card: grammar },
      });
      const { id } = grammarCardResultSchema.parse(
        created.structuredContent,
      ).card;
      for (const operation of [
        { name: 'get_grammar', arguments: { id } },
        {
          name: 'update_grammar',
          arguments: { id, patch: { explanation: 'attack' } },
        },
        { name: 'set_grammar_archived', arguments: { id, archived: true } },
      ])
        expect(await other.callTool(operation)).toMatchObject({
          isError: true,
          content: [
            {
              type: 'text',
              text: expect.stringContaining('"code":"UNAVAILABLE"'),
            },
          ],
        });
      expect(
        (
          await other.callTool({
            name: 'search_grammar',
            arguments: { terms: ['tópico', 'は'], operator: 'OR' },
          })
        ).structuredContent,
      ).toMatchObject({ items: [] });
      expect(
        (
          await other.callTool({
            name: 'create_grammar',
            arguments: {
              card: grammar,
              tokenIdentifier: learnerIdentity.tokenIdentifier,
            },
          })
        ).isError,
      ).toBe(true);
      expect(
        (await owner.callTool({ name: 'get_grammar', arguments: { id } }))
          .structuredContent,
      ).toEqual(created.structuredContent);
    } finally {
      await owner.close();
      await other.close();
    }
  });

  test('discovers all tools with legacy scopes while enforcing permissions before accessing any area', async () => {
    const backend = createTestBackend();
    const gatewayFor = vi.fn(() => {
      throw new Error('Unauthorized calls must not reach the gateway');
    });
    const handle = (req: Request) => handleMcpHttp(req, gatewayFor, config);
    const grammarRead = `openid ${GRAMMAR_READ_SCOPE}`;
    const legacy = await connect(
      backend,
      await accessToken({
        scope: `openid ${READ_SCOPE} ${WRITE_SCOPE} ${VOCABULARY_READ_SCOPE} ${VOCABULARY_WRITE_SCOPE}`,
      }),
    );
    const readOnly = await connect(
      backend,
      await accessToken({ scope: grammarRead }),
    );
    const writer = await connect(
      backend,
      await accessToken({ scope: grammarScope }),
    );
    try {
      const legacyTools = (await legacy.listTools()).tools;
      expect(legacyTools.map(({ name }) => name)).toEqual(toolNames);
      for (const name of ['search_grammar', 'get_grammar']) {
        expect(legacyTools.find((tool) => tool.name === name)).toMatchObject({
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: [GRAMMAR_READ_SCOPE] }],
          },
        });
      }
      for (const name of [
        'create_grammar',
        'update_grammar',
        'set_grammar_archived',
      ]) {
        expect(legacyTools.find((tool) => tool.name === name)).toMatchObject({
          _meta: {
            securitySchemes: [
              {
                type: 'oauth2',
                scopes: [GRAMMAR_READ_SCOPE, GRAMMAR_WRITE_SCOPE],
              },
            ],
          },
        });
      }
      expect(
        (await readOnly.listTools()).tools.map(({ name }) => name),
      ).toEqual(toolNames);
      const writableTools = (await writer.listTools()).tools;
      expect(writableTools.map(({ name }) => name)).toEqual(toolNames);
      expect(
        writableTools.find(({ name }) => name === 'update_grammar'),
      ).toMatchObject({
        annotations: { destructiveHint: true, idempotentHint: true },
        _meta: {
          securitySchemes: [
            {
              type: 'oauth2',
              scopes: [GRAMMAR_READ_SCOPE, GRAMMAR_WRITE_SCOPE],
            },
          ],
        },
      });
      expect(
        (await readOnly.callTool({ name: 'search_grammar', arguments: {} }))
          .structuredContent,
      ).toMatchObject({ items: [] });
      for (const entry of [
        {
          scope: grammarScope,
          name: 'search_alphabet',
          required: READ_SCOPE,
          args: {},
        },
        {
          scope: grammarScope,
          name: 'create_alphabet',
          required: READ_SCOPE,
          args: { card: kanji },
        },
        {
          scope: grammarScope,
          name: 'search_vocabulary',
          required: VOCABULARY_READ_SCOPE,
          args: {},
        },
        {
          scope: grammarScope,
          name: 'create_vocabulary',
          required: VOCABULARY_READ_SCOPE,
          args: { card: vocabulary },
        },
        {
          scope: `openid ${READ_SCOPE} ${WRITE_SCOPE}`,
          name: 'search_grammar',
          required: GRAMMAR_READ_SCOPE,
          args: {},
        },
        {
          scope: `openid ${VOCABULARY_READ_SCOPE} ${VOCABULARY_WRITE_SCOPE}`,
          name: 'get_grammar',
          required: GRAMMAR_READ_SCOPE,
          args: { id: 'unused' },
        },
        {
          scope: grammarRead,
          name: 'create_grammar',
          required: GRAMMAR_WRITE_SCOPE,
          args: { card: grammar },
        },
        {
          scope: `${grammarRead} ${WRITE_SCOPE}`,
          name: 'update_grammar',
          required: GRAMMAR_WRITE_SCOPE,
          args: { id: 'unused', patch: { title: 'Não deve salvar' } },
        },
        {
          scope: `openid ${READ_SCOPE} ${GRAMMAR_WRITE_SCOPE}`,
          name: 'create_grammar',
          required: GRAMMAR_READ_SCOPE,
          args: { card: grammar },
        },
        {
          scope: `openid ${GRAMMAR_WRITE_SCOPE}`,
          name: 'create_grammar',
          required: GRAMMAR_READ_SCOPE,
          args: { card: grammar },
        },
        {
          scope: GRAMMAR_READ_SCOPE,
          name: 'search_grammar',
          required: 'openid',
          args: {},
        },
      ]) {
        const denied = await handle(
          request(await accessToken({ scope: entry.scope }), {
            jsonrpc: '2.0',
            id: 7,
            method: 'tools/call',
            params: { name: entry.name, arguments: entry.args },
          }),
        );
        expect(denied.status).toBe(403);
        const challenge = denied.headers.get('WWW-Authenticate');
        expect(challenge).toContain(entry.required);
        expect(challenge).toContain('insufficient_scope');
        if (entry.required.startsWith('grammar:')) {
          expect(challenge).not.toContain('alphabet:');
          expect(challenge).not.toContain('vocabulary:');
        }
      }
      expect(gatewayFor).not.toHaveBeenCalled();
      expect(
        await backend.run((ctx) => ctx.db.query('grammarCards').take(1)),
      ).toEqual([]);
      expect(resourceMetadata(config).scopes_supported).toEqual(
        expect.arrayContaining([
          READ_SCOPE,
          WRITE_SCOPE,
          VOCABULARY_READ_SCOPE,
          VOCABULARY_WRITE_SCOPE,
          GRAMMAR_READ_SCOPE,
          GRAMMAR_WRITE_SCOPE,
        ]),
      );
    } finally {
      await legacy.close();
      await readOnly.close();
      await writer.close();
    }
  });
});
