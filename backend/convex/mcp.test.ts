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
  readMcpConfiguration,
  McpAccessError,
  resourceMetadata,
  READ_SCOPE,
  WRITE_SCOPE,
  VOCABULARY_READ_SCOPE,
  VOCABULARY_WRITE_SCOPE,
  GRAMMAR_READ_SCOPE,
  GRAMMAR_WRITE_SCOPE,
  QUESTS_READ_SCOPE,
  QUESTS_WRITE_SCOPE,
  STUDY_READ_SCOPE,
  SHIKEN_READ_SCOPE,
  SHIKEN_WRITE_SCOPE,
  STORIES_READ_SCOPE,
  STORIES_WRITE_SCOPE,
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
import {
  questResultSchema,
  questListResultSchema,
  studyProgressResultSchema,
  studyCardsResultSchema,
  shikenSearchResultSchema,
  shikenHistoryResultSchema,
  shikenPaperResultSchema,
} from './mcpPlanningSchemas';
import {
  shikenContentResultSchema,
  shikenMediaPrepareResultSchema,
  shikenMediaResultSchema,
} from './mcpShikenSchemas';
import type { PaperInput } from '../../shared/jlpt';
import type { QuestCreateInput } from './questsValidators';
import {
  storyCreateSchema,
  storyUpdateSchema,
  storyResultSchema,
  storyGetResultSchema,
  storyListResultSchema,
} from './mcpStoriesSchemas';
import type { StoryContent } from '../../shared/stories';

const resource = 'https://beta-test.convex.site/mcp';
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
  'list_quests',
  'get_quest',
  'create_quest',
  'cancel_quest',
  'get_study_progress',
  'get_study_cards',
  'search_shiken_papers',
  'get_shiken_paper',
  'create_shiken_paper',
  'get_shiken_paper_content',
  'prepare_shiken_media_upload',
  'get_shiken_media',
  'get_shiken_history',
  'list_stories',
  'get_story',
  'create_story',
  'update_story',
  'delete_story',
  'set_story_archived',
];
const config: McpConfiguration = {
  resource,
  issuer,
  secretKey: 'sk_test_beta_mcp_unit_test',
  publishableKey: `pk_test_${btoa(`${new URL(issuer).host}$`)}`,
  allowedClientIds: ['beta-mcp-client'],
  allowedOrigins: ['https://chatgpt.com'],
};

const configurationEnv = {
  MCP_RESOURCE_URL: resource,
  CLERK_JWT_ISSUER_DOMAIN: issuer,
  CLERK_SECRET_KEY: config.secretKey,
  CLERK_PUBLISHABLE_KEY: config.publishableKey,
  MCP_ALLOWED_OAUTH_CLIENT_IDS: config.allowedClientIds.join(','),
  MCP_ALLOWED_ORIGINS: config.allowedOrigins.join(','),
};

describe('MCP deployment configuration', () => {
  test('accepts matching development keys with padded or unpadded publishable keys and an optional site URL', () => {
    for (const padding of [true, false]) {
      const configuration = readMcpConfiguration({
        ...configurationEnv,
        CLERK_SECRET_KEY: ` ${config.secretKey} `,
        CLERK_PUBLISHABLE_KEY: padding
          ? config.publishableKey
          : config.publishableKey.replace(/=+$/, ''),
        CLERK_JWT_ISSUER_DOMAIN: `${issuer}/`,
        ...(padding ? { CONVEX_SITE_URL: new URL(resource).origin } : {}),
      });
      expect(configuration).toMatchObject({
        resource,
        issuer,
        secretKey: config.secretKey,
        allowedClientIds: config.allowedClientIds,
      });
    }
  });

  test('accepts a matching production instance without hardcoding a deployment or Clerk domain', () => {
    const productionIssuer = 'https://clerk.study.example';
    const configuration = readMcpConfiguration({
      ...configurationEnv,
      CLERK_SECRET_KEY: 'sk_live_production_unit_test',
      CLERK_PUBLISHABLE_KEY: `pk_live_${btoa('clerk.study.example$')}`,
      CLERK_JWT_ISSUER_DOMAIN: productionIssuer,
      MCP_RESOURCE_URL: 'https://api.study.example/mcp',
      CONVEX_SITE_URL: 'https://api.study.example/',
    });
    expect(configuration).toMatchObject({
      resource: 'https://api.study.example/mcp',
      issuer: productionIssuer,
    });
  });

  test('rejects mixed environments, instances, deployments, and malformed keys without exposing configuration', () => {
    const invalidConfigurations = [
      { CLERK_SECRET_KEY: 'sk_live_secret_do_not_expose' },
      {
        CLERK_PUBLISHABLE_KEY: config.publishableKey.replace(
          'pk_test_',
          'pk_live_',
        ),
      },
      { CLERK_JWT_ISSUER_DOMAIN: 'https://different.clerk.accounts.dev' },
      { CLERK_JWT_ISSUER_DOMAIN: `${issuer}/unexpected` },
      { CLERK_JWT_ISSUER_DOMAIN: `${issuer}:8443` },
      { CONVEX_SITE_URL: 'https://different-deployment.convex.site' },
      { CONVEX_SITE_URL: `${new URL(resource).origin}/unexpected` },
      { CONVEX_SITE_URL: '' },
      { CLERK_SECRET_KEY: 'sk_test_' },
      { CLERK_SECRET_KEY: 'secret_without_environment' },
      { CLERK_PUBLISHABLE_KEY: 'pk_test_not-base64' },
      { CLERK_PUBLISHABLE_KEY: `pk_test_${btoa(new URL(issuer).host)}` },
      { CLERK_PUBLISHABLE_KEY: `pk_test_${btoa(`${new URL(issuer).host}$$`)}` },
      {
        CLERK_PUBLISHABLE_KEY: `pk_test_${btoa(`${new URL(issuer).host}/unexpected$`)}`,
      },
      {
        CLERK_PUBLISHABLE_KEY: `pk_test_${btoa(`other@${new URL(issuer).host}$`)}`,
      },
    ];
    for (const overrides of invalidConfigurations) {
      expect(() =>
        readMcpConfiguration({ ...configurationEnv, ...overrides }),
      ).toThrowError(
        new McpAccessError(503, 'O servidor MCP ainda não está configurado.'),
      );
      try {
        readMcpConfiguration({ ...configurationEnv, ...overrides });
      } catch (error) {
        expect(error).toBeInstanceOf(McpAccessError);
        expect(error).toMatchObject({ status: 503 });
        expect(String(error)).not.toContain('sk_');
        expect(String(error)).not.toContain('pk_');
        expect(String(error)).not.toContain('https://');
      }
    }
  });
});

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
    JSON.stringify({ alg: 'RS256', kid: 'beta-mcp-test-key', typ }),
  );
  const body = base64url(
    JSON.stringify({
      iss: issuer,
      aud: resource,
      sub: learnerIdentity.subject,
      client_id: 'beta-mcp-client',
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
        keys: [{ ...jwk, kid: 'beta-mcp-test-key', alg: 'RS256', use: 'sig' }],
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
        stories: {
          list: ({ limit, cursor, ...filters }) =>
            backend.query(internal.mcpGateway.listStories, {
              tokenIdentifier,
              ...filters,
              paginationOpts: { numItems: limit, cursor },
            }),
          get: (id) =>
            backend.query(internal.mcpGateway.getStory, {
              tokenIdentifier,
              id,
            }),
          create: (args) =>
            backend.mutation(internal.mcpGateway.createStory, {
              tokenIdentifier,
              ...args,
            }),
          update: (args) =>
            backend.mutation(internal.mcpGateway.updateStory, {
              tokenIdentifier,
              ...args,
            }),
          delete: (id) =>
            backend.mutation(internal.mcpGateway.deleteStory, {
              tokenIdentifier,
              id,
            }),
          setArchived: (id, archived) =>
            backend.mutation(internal.mcpGateway.setStoryArchived, {
              tokenIdentifier,
              id,
              archived,
            }),
        },
        quests: {
          list: ({ limit, cursor, ...filters }) =>
            backend.query(internal.mcpGateway.listQuests, {
              tokenIdentifier,
              ...filters,
              paginationOpts: { numItems: limit, cursor },
            }),
          get: (id) =>
            backend.query(internal.mcpGateway.getQuest, {
              tokenIdentifier,
              id,
            }),
          create: (quest) =>
            backend.mutation(internal.mcpGateway.createQuest, {
              tokenIdentifier,
              quest,
            }),
          cancel: (id) =>
            backend.mutation(internal.mcpGateway.cancelQuest, {
              tokenIdentifier,
              id,
            }),
        },
        study: {
          cards: ({ limit, cursor, ...filters }) =>
            backend.query(internal.mcpGateway.studyCards, {
              tokenIdentifier,
              ...filters,
              paginationOpts: { numItems: limit, cursor },
            }),
          progress: (filters) =>
            backend.query(internal.mcpGateway.studyProgress, {
              tokenIdentifier,
              ...filters,
            }),
        },
        shiken: {
          search: ({ limit, cursor, ...filters }) =>
            backend.query(internal.mcpGateway.searchShikenPapers, {
              tokenIdentifier,
              ...filters,
              paginationOpts: { numItems: limit, cursor },
            }),
          get: (id) =>
            backend.query(internal.mcpGateway.getShikenPaper, {
              tokenIdentifier,
              id,
            }),
          create: (args) =>
            backend.mutation(internal.mcpGateway.createShikenPaper, {
              tokenIdentifier,
              ...args,
            }),
          content: (args) =>
            backend.query(internal.mcpGateway.getShikenPaperContent, {
              tokenIdentifier,
              ...args,
            }),
          prepareMedia: (args) =>
            backend.action(internal.shikenMedia.prepare, {
              tokenIdentifier,
              ...args,
            }),
          getMedia: (id) =>
            backend.query(internal.shikenMedia.get, { tokenIdentifier, id }),
          history: ({ limit, cursor, ...filters }) =>
            backend.query(internal.mcpGateway.shikenHistory, {
              tokenIdentifier,
              ...filters,
              paginationOpts: { numItems: limit, cursor },
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
  const client = new Client({ name: 'beta-test-client', version: '1.0.0' });
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
    ).toMatchObject({ clientId: 'beta-mcp-client' });
    for (const claims of [
      { exp: 1 },
      { iss: 'https://another.clerk.accounts.dev' },
      { aud: 'https://other-resource.example/mcp' },
      { aud: 'beta-mcp-client' },
      { aud: ['beta-mcp-client', 'https://other-resource.example/mcp'] },
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
            body: 'a'.repeat(512 * 1024 + 1),
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

function plannedQuest(
  cardIds: string[],
  clientKey = 'weekly-2026-10-10',
): QuestCreateInput {
  const now = Date.now();
  return {
    clientKey,
    title: 'Praticar japonês esta semana',
    startsAt: now,
    dueAt: now + 7 * 86_400_000,
    timeZone: 'America/Sao_Paulo',
    cardIds,
  };
}

describe('MCP quests and personal study planning', () => {
  test('selects personal stories for story-only and mixed quests without granting story-content access', async () => {
    const backend = createTestBackend();
    const learner = backend.withIdentity(learnerIdentity);
    const otherLearner = backend.withIdentity({
      ...learnerIdentity,
      subject: 'user_other_story_quest',
      tokenIdentifier: `${issuer}|user_other_story_quest`,
    });
    await learner.mutation(api.users.ensureCurrentUser, {});
    await otherLearner.mutation(api.users.ensureCurrentUser, {});
    const first = await learner.mutation(api.stories.create, {
      clientKey: 'quest-story:first',
      story: storyContent,
    });
    const second = await learner.mutation(api.stories.create, {
      clientKey: 'quest-story:second',
      story: { ...storyContent, title: 'Outra história' },
    });
    const foreign = await otherLearner.mutation(api.stories.create, {
      clientKey: 'quest-story:foreign',
      story: storyContent,
    });
    const card = await learner.mutation(api.alphabet.create, { card: kanji });
    const paper = await learner.mutation(api.jlpt.create, {
      paper: {
        title: 'Prova da seleção mista',
        level: 'N5',
        questions: [
          {
            id: 'water',
            skill: 'vocabulary',
            kind: 'kanji_reading',
            prompt: '水',
            choices: ['みず', 'ひ', 'やま', 'つき'],
            correctChoice: 0,
            explanation: 'Água',
          },
        ],
      },
    });
    const client = await connect(
      backend,
      await accessToken({
        scope: `openid ${QUESTS_READ_SCOPE} ${QUESTS_WRITE_SCOPE}`,
      }),
    );
    const reader = await connect(
      backend,
      await accessToken({ scope: `openid ${STORIES_READ_SCOPE}` }),
    );
    try {
      const discovered = storyListResultSchema.parse(
        (await reader.callTool({ name: 'list_stories', arguments: {} }))
          .structuredContent,
      );
      expect(new Set(discovered.items.map((story) => story.id))).toEqual(
        new Set([first.id, second.id]),
      );
      const tools = (await client.listTools()).tools;
      expect(tools.map((tool) => tool.name)).toEqual(toolNames);
      expect(tools.find((tool) => tool.name === 'create_quest')?._meta).toEqual(
        {
          securitySchemes: [
            {
              type: 'oauth2',
              scopes: [QUESTS_READ_SCOPE, QUESTS_WRITE_SCOPE],
            },
          ],
        },
      );
      const withoutStoryConsent = await endpoint(backend)(
        request(
          await accessToken({
            scope: `openid ${QUESTS_READ_SCOPE} ${QUESTS_WRITE_SCOPE}`,
          }),
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'get_story', arguments: { id: first.id } },
          },
        ),
      );
      expect(withoutStoryConsent.status).toBe(403);
      expect(withoutStoryConsent.headers.get('WWW-Authenticate')).toContain(
        STORIES_READ_SCOPE,
      );
      const quest = {
        ...plannedQuest([], 'quest-story:only'),
        storyIds: [second.id, first.id],
      };
      const createdResult = await client.callTool({
        name: 'create_quest',
        arguments: { quest },
      });
      const created = questResultSchema.parse(
        createdResult.structuredContent,
      ).quest;
      expect(created).toMatchObject({
        cardIds: [],
        paperIds: [],
        storyIds: [second.id, first.id],
        completedStoryIds: [],
      });
      expect(
        (await client.callTool({ name: 'create_quest', arguments: { quest } }))
          .structuredContent,
      ).toEqual(createdResult.structuredContent);
      const mixed = questResultSchema.parse(
        (
          await client.callTool({
            name: 'create_quest',
            arguments: {
              quest: {
                ...plannedQuest([card._id], 'quest-story:mixed'),
                paperIds: [paper._id],
                storyIds: [first.id],
              },
            },
          })
        ).structuredContent,
      ).quest;
      expect(mixed).toMatchObject({
        cardIds: [card._id],
        paperIds: [paper._id],
        storyIds: [first.id],
        completedStoryIds: [],
      });
      const storyId = await backend.run(async (ctx) =>
        ctx.db.normalizeId('stories', first.id),
      );
      if (!storyId) throw new Error('Expected a story ID');
      await learner.mutation(api.stories.answer, {
        id: storyId,
        questionId: 'q1',
        optionId: 'letter',
      });
      await learner.mutation(api.stories.complete, { id: storyId });
      const saved = questResultSchema.parse(
        (
          await client.callTool({
            name: 'get_quest',
            arguments: { id: created.id },
          })
        ).structuredContent,
      ).quest;
      expect(saved.completedStoryIds).toEqual([]);
      expect(saved.completedAt).toBeUndefined();
      const listed = questListResultSchema.parse(
        (await client.callTool({ name: 'list_quests', arguments: {} }))
          .structuredContent,
      );
      expect(listed.items.find((item) => item.id === created.id)).toEqual(
        saved,
      );

      await learner.mutation(api.stories.setArchived, {
        id: storyId,
        archived: true,
      });
      for (const selection of [
        { storyIds: [] },
        { storyIds: [second.id, second.id] },
        { storyIds: [foreign.id] },
        { storyIds: [first.id] },
        { storyIds: [card._id] },
        { storyIds: [second.id], completedStoryIds: [second.id] },
      ]) {
        expect(
          (
            await client.callTool({
              name: 'create_quest',
              arguments: {
                quest: {
                  ...plannedQuest([], 'quest-story:invalid'),
                  ...selection,
                },
              },
            })
          ).isError,
        ).toBe(true);
      }
      expect(
        await backend.run((ctx) => ctx.db.query('quests').collect()),
      ).toHaveLength(2);
    } finally {
      await client.close();
      await reader.close();
    }
  });

  test('new areas require their own scopes before accessing gateways, while old scopes keep discovery', async () => {
    const backend = createTestBackend();
    const gatewayFor = vi.fn(() => {
      throw new Error('must not access data');
    });
    const cases = [
      {
        scope: `openid ${READ_SCOPE} ${WRITE_SCOPE}`,
        name: 'list_quests',
        required: QUESTS_READ_SCOPE,
      },
      {
        scope: `openid ${QUESTS_READ_SCOPE}`,
        name: 'create_quest',
        required: QUESTS_WRITE_SCOPE,
      },
      {
        scope: `openid ${QUESTS_WRITE_SCOPE}`,
        name: 'create_quest',
        required: QUESTS_READ_SCOPE,
      },
      {
        scope: `openid ${READ_SCOPE}`,
        name: 'get_study_progress',
        required: STUDY_READ_SCOPE,
      },
      {
        scope: `openid ${READ_SCOPE}`,
        name: 'get_study_cards',
        required: STUDY_READ_SCOPE,
      },
      {
        scope: `openid ${STUDY_READ_SCOPE}`,
        name: 'get_shiken_history',
        required: SHIKEN_READ_SCOPE,
      },
    ];
    for (const entry of cases) {
      const response = await handleMcpHttp(
        request(await accessToken({ scope: entry.scope }), {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: entry.name, arguments: {} },
        }),
        gatewayFor,
        config,
      );
      expect(response.status).toBe(403);
      expect(response.headers.get('WWW-Authenticate')).toContain(
        entry.required,
      );
    }
    expect(gatewayFor).not.toHaveBeenCalled();
    for (const scope of [
      QUESTS_READ_SCOPE,
      STUDY_READ_SCOPE,
      SHIKEN_READ_SCOPE,
    ]) {
      const client = await connect(
        backend,
        await accessToken({ scope: `openid ${scope}` }),
      );
      try {
        expect(
          (await client.listTools()).tools.map((tool) => tool.name),
        ).toEqual(toolNames);
      } finally {
        await client.close();
      }
    }
    expect(resourceMetadata(config).scopes_supported).toEqual(
      expect.arrayContaining([
        QUESTS_READ_SCOPE,
        QUESTS_WRITE_SCOPE,
        STUDY_READ_SCOPE,
        SHIKEN_READ_SCOPE,
      ]),
    );
  });

  test('creates occurrences idempotently, paginates and cancels only the authenticated owner quests', async () => {
    const backend = createTestBackend();
    const learner = backend.withIdentity(learnerIdentity);
    const otherLearner = backend.withIdentity({
      ...learnerIdentity,
      subject: 'user_other_quest_owner',
      tokenIdentifier: `${issuer}|user_other_quest_owner`,
    });
    await learner.mutation(api.users.ensureCurrentUser, {});
    await otherLearner.mutation(api.users.ensureCurrentUser, {});
    const cards = await Promise.all([
      learner.mutation(api.alphabet.create, { card: kanji }),
      learner.mutation(api.vocabulary.create, { card: vocabulary }),
      learner.mutation(api.grammar.create, { card: grammar }),
    ]);
    const otherCard = await otherLearner.mutation(api.alphabet.create, {
      card: kanji,
    });
    const scope = `openid ${QUESTS_READ_SCOPE} ${QUESTS_WRITE_SCOPE}`;
    const client = await connect(backend, await accessToken({ scope }));
    const other = await connect(
      backend,
      await accessToken({ scope, sub: 'user_other_quest_owner' }),
    );
    try {
      const quest = plannedQuest(cards.map((card) => card._id));
      const first = await client.callTool({
        name: 'create_quest',
        arguments: { quest },
      });
      expect(first.isError).not.toBe(true);
      const created = questResultSchema.parse(first.structuredContent).quest;
      expect(new Set(created.cardIds)).toEqual(new Set(quest.cardIds));
      expect(created.paperIds).toEqual([]);
      expect(created.completedCardIds).toEqual([]);
      expect(created.completedPaperIds).toEqual([]);
      expect(
        (
          await client.callTool({
            name: 'create_quest',
            arguments: {
              quest: {
                ...quest,
                clientKey: 'invalid-other-target',
                cardIds: [otherCard._id],
              },
            },
          })
        ).isError,
      ).toBe(true);
      const repeat = await client.callTool({
        name: 'create_quest',
        arguments: { quest },
      });
      expect(repeat.structuredContent).toEqual(first.structuredContent);
      const conflict = await client.callTool({
        name: 'create_quest',
        arguments: { quest: { ...quest, title: 'Outro conteúdo' } },
      });
      expect(conflict.isError).toBe(true);
      expect(JSON.stringify(conflict.content)).toContain('CONFLICT');
      const ownOther = await other.callTool({
        name: 'create_quest',
        arguments: { quest: { ...quest, cardIds: [otherCard._id] } },
      });
      expect(
        questResultSchema.parse(ownOther.structuredContent).quest.id,
      ).not.toBe(created.id);
      expect(
        (
          await other.callTool({
            name: 'get_quest',
            arguments: { id: created.id },
          })
        ).isError,
      ).toBe(true);
      expect(
        (
          await other.callTool({
            name: 'cancel_quest',
            arguments: { id: created.id },
          })
        ).isError,
      ).toBe(true);
      await client.callTool({
        name: 'create_quest',
        arguments: {
          quest: plannedQuest(
            cards.map((card) => card._id),
            'weekly-2026-10-17',
          ),
        },
      });
      const page1 = questListResultSchema.parse(
        (
          await client.callTool({
            name: 'list_quests',
            arguments: { limit: 1 },
          })
        ).structuredContent,
      );
      expect(page1.items).toHaveLength(1);
      expect(page1.isDone).toBe(false);
      const page2 = questListResultSchema.parse(
        (
          await client.callTool({
            name: 'list_quests',
            arguments: { limit: 1, cursor: page1.cursor },
          })
        ).structuredContent,
      );
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0].id).not.toBe(page1.items[0].id);
      const cancelled = questResultSchema.parse(
        (
          await client.callTool({
            name: 'cancel_quest',
            arguments: { id: created.id },
          })
        ).structuredContent,
      ).quest;
      expect(cancelled.cancelledAt).toBeTypeOf('number');
      expect(
        (
          await client.callTool({
            name: 'cancel_quest',
            arguments: { id: created.id },
          })
        ).structuredContent,
      ).toEqual({ quest: cancelled });
      const cancelledPage = questListResultSchema.parse(
        (
          await client.callTool({
            name: 'list_quests',
            arguments: { status: 'cancelled' },
          })
        ).structuredContent,
      );
      expect(cancelledPage.items.map((item) => item.id)).toEqual([created.id]);
      expect(JSON.stringify(cancelledPage)).not.toContain('tokenIdentifier');
      expect(JSON.stringify(cancelledPage)).not.toContain('ownerId');
    } finally {
      await client.close();
      await other.close();
    }
  });

  test('rejects forged identities, completion, generic objectives, invalid windows and duplicate targets', async () => {
    const backend = createTestBackend();
    const learner = backend.withIdentity(learnerIdentity);
    await learner.mutation(api.users.ensureCurrentUser, {});
    const card = await learner.mutation(api.alphabet.create, { card: kanji });
    const client = await connect(
      backend,
      await accessToken({
        scope: `openid ${QUESTS_READ_SCOPE} ${QUESTS_WRITE_SCOPE}`,
      }),
    );
    try {
      const quest = plannedQuest([card._id]);
      const inputs = [
        { quest, ownerId: 'someone-else' },
        { quest, tokenIdentifier: 'someone-else' },
        {
          quest: { ...quest, completedCardIds: [card._id] },
        },
        { quest: { ...quest, dueAt: quest.startsAt } },
        { quest: { ...quest, dueAt: quest.startsAt + 91 * 86_400_000 } },
        { quest: { ...quest, timeZone: 'Invalid/Somewhere' } },
        {
          quest: {
            ...quest,
            cardIds: [card._id, card._id],
          },
        },
        {
          quest: {
            ...quest,
            objectives: [{ id: 'any', kind: 'study', quantity: 20 }],
          },
        },
        { quest: { ...quest, description: 'Texto não permitido' } },
        { quest: { ...quest, quantity: 10 } },
        { quest: { ...quest, cardIds: [] } },
        { quest: { ...quest, cardIds: undefined, paperIds: [] } },
      ];
      for (const args of inputs) {
        expect(
          (await client.callTool({ name: 'create_quest', arguments: args }))
            .isError,
        ).toBe(true);
      }
      expect(
        await backend.run((ctx) => ctx.db.query('quests').take(1)),
      ).toEqual([]);
    } finally {
      await client.close();
    }
  });

  test('reports exact personal lifetime progress by category and level with bounded weak cards', async () => {
    const backend = createTestBackend();
    const learner = backend.withIdentity(learnerIdentity);
    await learner.mutation(api.users.ensureCurrentUser, {});
    const alphabet = await learner.mutation(api.alphabet.create, {
      card: kanji,
    });
    const word = await learner.mutation(api.vocabulary.create, {
      card: vocabulary,
    });
    await learner.mutation(api.grammar.create, { card: grammar });
    await backend.run(async (ctx) => {
      await ctx.db.insert('studyStats', {
        ownerId: alphabet.ownerId,
        cardId: alphabet._id,
        correct: 1,
        partial: 1,
        incorrect: 2,
        attempts: 4,
        lastReviewedAt: 1000,
      });
      await ctx.db.insert('studyStats', {
        ownerId: word.ownerId,
        cardId: word._id,
        correct: 3,
        partial: 0,
        incorrect: 0,
        attempts: 3,
        lastReviewedAt: 2000,
      });
      const other = await ctx.db.insert('users', {
        tokenIdentifier: `${issuer}|user_other_progress`,
      });
      await ctx.db.insert('studyStats', {
        ownerId: other,
        cardId: alphabet._id,
        correct: 100,
        partial: 0,
        incorrect: 0,
        attempts: 100,
        lastReviewedAt: 3000,
      });
    });
    const client = await connect(
      backend,
      await accessToken({ scope: `openid ${STUDY_READ_SCOPE}` }),
    );
    try {
      const result = studyProgressResultSchema.parse(
        (
          await client.callTool({
            name: 'get_study_progress',
            arguments: { weakLimit: 1 },
          })
        ).structuredContent,
      );
      expect(result.overview).toMatchObject({
        totalCards: 3,
        studiedCards: 2,
        neverStudiedCards: 1,
        correct: 4,
        partial: 1,
        incorrect: 2,
        attempts: 7,
      });
      expect(result.weakCards).toHaveLength(1);
      expect(result.weakCards[0]).toMatchObject({
        id: alphabet._id,
        weightedAccuracy: 0.375,
      });
      expect(result.hasMoreWeakCards).toBe(true);
      expect(result.truncated).toBe(false);
      expect(
        result.byCategory.find((row) => row.category === 'grammar')?.overview,
      ).toMatchObject({ attempts: 0, weightedAccuracy: null });
      expect(
        result.byLevel.find((row) => row.level === 'N5')?.overview.totalCards,
      ).toBe(3);
      const filtered = studyProgressResultSchema.parse(
        (
          await client.callTool({
            name: 'get_study_progress',
            arguments: { category: 'vocabulary', level: 'N5' },
          })
        ).structuredContent,
      );
      expect(filtered.overview).toMatchObject({
        totalCards: 1,
        correct: 3,
        attempts: 3,
      });
      const cards = studyCardsResultSchema.parse(
        (
          await client.callTool({
            name: 'get_study_cards',
            arguments: { category: 'alphabet' },
          })
        ).structuredContent,
      );
      expect(cards.items).toHaveLength(1);
      expect(cards.items[0]).toMatchObject({
        id: alphabet._id,
        front: alphabet.front,
        back: alphabet.back,
        stats: {
          correct: 1,
          partial: 1,
          incorrect: 2,
          attempts: 4,
          weightedAccuracy: 0.375,
          lastReviewedAt: 1000,
        },
      });
      for (const [category, attempts] of [
        ['vocabulary', 3],
        ['grammar', 0],
      ] as const) {
        const page = studyCardsResultSchema.parse(
          (
            await client.callTool({
              name: 'get_study_cards',
              arguments: { category },
            })
          ).structuredContent,
        );
        expect(page.items).toHaveLength(1);
        expect(page.items[0].stats.attempts).toBe(attempts);
      }
      const other = await connect(
        backend,
        await accessToken({
          scope: `openid ${STUDY_READ_SCOPE}`,
          sub: 'user_other_progress',
        }),
      );
      try {
        const page = studyCardsResultSchema.parse(
          (
            await other.callTool({
              name: 'get_study_cards',
              arguments: { category: 'alphabet' },
            })
          ).structuredContent,
        );
        expect(page.items).toEqual([]);
      } finally {
        await other.close();
      }
      expect(
        (
          await client.callTool({
            name: 'get_study_progress',
            arguments: { ownerId: alphabet.ownerId },
          })
        ).isError,
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  test('paginates statistics beyond summary bounds and creates an exact selection larger than 100 cards', async () => {
    const backend = createTestBackend();
    await backend.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', {
        tokenIdentifier: learnerIdentity.tokenIdentifier,
      });
      for (let index = 0; index < 1001; index++) {
        await ctx.db.insert('alphabetCards', {
          ...kanji,
          front: kanji.symbol,
          back: 'dia',
          sortKey: String(index),
          symbol: `symbol-${index}`,
          classifications: [
            { scheme: 'jlpt', level: index === 0 ? 'N4' : 'N5' },
          ],
          ownerId,
          archived: false,
          contentVersion: 1,
          createdAt: 1,
          updatedAt: 1,
        });
      }
    });
    const client = await connect(
      backend,
      await accessToken({
        scope: `openid ${STUDY_READ_SCOPE} ${QUESTS_READ_SCOPE} ${QUESTS_WRITE_SCOPE}`,
      }),
    );
    try {
      const result = await client.callTool({
        name: 'get_study_progress',
        arguments: { category: 'alphabet' },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('1.000');
      expect(result.structuredContent).toBeUndefined();
      const filtered = studyCardsResultSchema.parse(
        (
          await client.callTool({
            name: 'get_study_cards',
            arguments: { category: 'alphabet', level: 'N5', limit: 1 },
          })
        ).structuredContent,
      );
      expect(filtered.items).toEqual([]);
      expect(filtered.isDone).toBe(false);
      expect(filtered.cursor).toBeTypeOf('string');
      const ids: string[] = [];
      let cursor: string | null = null;
      for (;;) {
        const page = studyCardsResultSchema.parse(
          (
            await client.callTool({
              name: 'get_study_cards',
              arguments: { category: 'alphabet', limit: 100, cursor },
            })
          ).structuredContent,
        );
        expect(page.items.length).toBeLessThanOrEqual(100);
        expect(page.items[0]?.stats).toMatchObject({
          attempts: 0,
          integralAccuracy: null,
          weightedAccuracy: null,
          lastReviewedAt: null,
        });
        ids.push(...page.items.map((card) => card.id));
        if (page.isDone) break;
        cursor = page.cursor;
      }
      expect(ids).toHaveLength(1001);
      expect(new Set(ids).size).toBe(1001);
      const selected = ids.slice(0, 101);
      const created = questResultSchema.parse(
        (
          await client.callTool({
            name: 'create_quest',
            arguments: { quest: plannedQuest(selected) },
          })
        ).structuredContent,
      ).quest;
      expect(new Set(created.cardIds)).toEqual(new Set(selected));
      expect(created.completedCardIds).toEqual([]);
      expect(
        (
          await client.callTool({
            name: 'get_study_cards',
            arguments: { category: 'alphabet', ownerId: 'forged' },
          })
        ).isError,
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  test('discovers owner Shiken IDs and traverses filtered result history including empty pages', async () => {
    const backend = createTestBackend();
    const learner = backend.withIdentity(learnerIdentity);
    await learner.mutation(api.users.ensureCurrentUser, {});
    const paper = await learner.mutation(api.jlpt.create, {
      paper: {
        title: 'Treino N5',
        level: 'N5',
        questions: [
          {
            id: 'water',
            skill: 'vocabulary',
            kind: 'kanji_reading',
            prompt: '水',
            choices: ['みず', 'ひ', 'やま', 'つき'],
            correctChoice: 0,
            explanation: 'Água',
          },
        ],
      },
    });
    await backend.run(async (ctx) => {
      const snapshot = {
        title: paper.title,
        level: paper.level,
        questions: paper.questions,
        contentVersion: paper.contentVersion,
      };
      for (const [offset, level] of ['N5', 'N5', 'N4'].entries()) {
        await ctx.db.insert('jlptAttempts', {
          ownerId: paper.ownerId,
          paperId: paper._id,
          snapshot: { ...snapshot, level: level as 'N5' | 'N4' },
          status: 'completed',
          startedAt: 1000 + offset,
          completedAt: 2000 + offset,
          blockIndex: 0,
          blockStartedAt: 1000,
          blockDeadlineAt: 3000,
          lastActionAt: 2000,
          revision: 1,
          answers: [
            {
              questionId: 'water',
              choice: offset === 0 ? 0 : 1,
              flagged: false,
            },
          ],
        });
      }
      const other = await ctx.db.insert('users', {
        tokenIdentifier: `${issuer}|user_other_shiken`,
      });
      await ctx.db.insert('jlptPapers', {
        ...snapshot,
        ownerId: other,
        archived: false,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const client = await connect(
      backend,
      await accessToken({
        scope: `openid ${SHIKEN_READ_SCOPE} ${QUESTS_READ_SCOPE} ${QUESTS_WRITE_SCOPE}`,
      }),
    );
    const other = await connect(
      backend,
      await accessToken({
        scope: `openid ${SHIKEN_READ_SCOPE}`,
        sub: 'user_other_shiken',
      }),
    );
    try {
      const found = shikenSearchResultSchema.parse(
        (
          await client.callTool({
            name: 'search_shiken_papers',
            arguments: { level: 'N5' },
          })
        ).structuredContent,
      );
      expect(found.items.map((item) => item.id)).toEqual([paper._id]);
      expect(found.items[0].questionCount).toBe(1);
      expect(JSON.stringify(found)).not.toContain('correctChoice');
      const selectedPaperQuest = questResultSchema.parse(
        (
          await client.callTool({
            name: 'create_quest',
            arguments: {
              quest: { ...plannedQuest([]), paperIds: [paper._id] },
            },
          })
        ).structuredContent,
      ).quest;
      expect(selectedPaperQuest.cardIds).toEqual([]);
      expect(selectedPaperQuest.paperIds).toEqual([paper._id]);
      expect(selectedPaperQuest.completedPaperIds).toEqual([]);
      const first = shikenHistoryResultSchema.parse(
        (
          await client.callTool({
            name: 'get_shiken_history',
            arguments: { limit: 1, level: 'N5', status: 'completed' },
          })
        ).structuredContent,
      );
      expect(first.items).toEqual([]);
      expect(first.isDone).toBe(false);
      expect(first.scanned).toBe(1);
      let cursor = first.cursor;
      const items = [];
      do {
        const page = shikenHistoryResultSchema.parse(
          (
            await client.callTool({
              name: 'get_shiken_history',
              arguments: { limit: 1, cursor, level: 'N5', status: 'completed' },
            })
          ).structuredContent,
        );
        expect(page.summaryScope).toBe('this_page_only');
        items.push(...page.items);
        cursor = page.cursor;
      } while (cursor);
      expect(items).toHaveLength(2);
      expect(items.reduce((sum, item) => sum + item.result!.correct, 0)).toBe(
        1,
      );
      expect(
        items[0].result?.bySkill.find((row) => row.skill === 'vocabulary')
          ?.total,
      ).toBe(1);
      expect(
        (
          await other.callTool({
            name: 'get_shiken_paper',
            arguments: { id: paper._id },
          })
        ).isError,
      ).toBe(true);
      expect(
        (
          await other.callTool({
            name: 'get_shiken_history',
            arguments: { paperId: paper._id },
          })
        ).isError,
      ).toBe(true);
      const otherHistory = shikenHistoryResultSchema.parse(
        (await other.callTool({ name: 'get_shiken_history', arguments: {} }))
          .structuredContent,
      );
      expect(otherHistory.items).toEqual([]);
    } finally {
      await client.close();
      await other.close();
    }
  });
});

const storyContent: StoryContent = {
  title: '山で見つけた手紙',
  level: 'N4',
  paragraphs: [
    {
      id: 'p1',
      segments: [
        { text: '山', reading: 'やま' },
        { text: 'で' },
        { text: '手紙', reading: 'てがみ' },
        { text: 'を見つけました。' },
      ],
      translation: 'Encontrei uma carta na montanha.',
    },
  ],
  questions: [
    {
      id: 'q1',
      prompt: '何を見つけましたか。',
      options: [
        { id: 'letter', text: '手紙' },
        { id: 'key', text: '鍵' },
      ],
      correctOptionId: 'letter',
      explanation: '山で手紙を見つけました。',
    },
  ],
};

const authoredShikenPaper: PaperInput = {
  title: 'Simulado original de teste',
  level: 'N5',
  questions: [
    {
      id: 'vocabulary',
      skill: 'vocabulary',
      kind: 'kanji_reading',
      prompt: '水',
      choices: ['みず', 'ひ', 'やま', 'つき'],
      correctChoice: 0,
      explanation: '水 lê-se みず.',
    },
    {
      id: 'grammar',
      skill: 'grammar',
      kind: 'grammar_form',
      prompt: '学生（　）です。',
      choices: ['なの', 'に', 'を', 'が'],
      correctChoice: 0,
      explanation: 'Conteúdo de teste editorial.',
    },
    {
      id: 'reading',
      skill: 'reading',
      kind: 'short_passage',
      prompt: '何を飲みますか。',
      passage: '水を飲みます。',
      choices: ['水', 'お茶', '牛乳', 'コーヒー'],
      correctChoice: 0,
      explanation: 'O texto menciona água.',
    },
    {
      id: 'listening',
      skill: 'listening',
      kind: 'quick_response',
      prompt: '音声を聞いてください。',
      choices: ['はい', 'いいえ', 'ありがとう'],
      correctChoice: 0,
      explanation: 'Resposta editorial de teste.',
      audioUrl: 'https://example.com/test-listening.mp3',
    },
  ],
};

describe('MCP Shiken authorship', () => {
  const scope = `openid ${SHIKEN_READ_SCOPE} ${SHIKEN_WRITE_SCOPE}`;

  test('discovers authorship separately and refuses answer keys or uploads without read and write consent before accessing data', async () => {
    const backend = createTestBackend();
    const gatewayFor = vi.fn(() => {
      throw new Error('Unauthorized authorship must not reach data');
    });
    for (const name of [
      'create_shiken_paper',
      'get_shiken_paper_content',
      'prepare_shiken_media_upload',
    ]) {
      for (const [granted, required] of [
        [SHIKEN_READ_SCOPE, SHIKEN_WRITE_SCOPE],
        [SHIKEN_WRITE_SCOPE, SHIKEN_READ_SCOPE],
      ]) {
        const response = await handleMcpHttp(
          request(await accessToken({ scope: `openid ${granted}` }), {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name, arguments: {} },
          }),
          gatewayFor,
          config,
        );
        expect(response.status).toBe(403);
        expect(response.headers.get('WWW-Authenticate')).toContain(required);
      }
    }
    const missingRead = await handleMcpHttp(
      request(await accessToken({ scope: `openid ${STUDY_READ_SCOPE}` }), {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_shiken_media', arguments: {} },
      }),
      gatewayFor,
      config,
    );
    expect(missingRead.status).toBe(403);
    expect(gatewayFor).not.toHaveBeenCalled();
    const client = await connect(
      backend,
      await accessToken({ scope: `openid ${SHIKEN_READ_SCOPE}` }),
    );
    try {
      const tools = (await client.listTools()).tools;
      expect(tools.map((tool) => tool.name)).toEqual(toolNames);
      expect(tools).toHaveLength(33);
      for (const name of [
        'create_shiken_paper',
        'get_shiken_paper_content',
        'prepare_shiken_media_upload',
      ]) {
        expect(tools.find((tool) => tool.name === name)?._meta).toMatchObject({
          securitySchemes: [
            { type: 'oauth2', scopes: [SHIKEN_READ_SCOPE, SHIKEN_WRITE_SCOPE] },
          ],
        });
      }
      expect(
        tools.find((tool) => tool.name === 'get_shiken_paper_content')
          ?.annotations?.readOnlyHint,
      ).toBe(true);
      expect(
        tools.find((tool) => tool.name === 'create_shiken_paper')?.annotations
          ?.idempotentHint,
      ).toBe(true);
      expect(resourceMetadata(config).scopes_supported).toContain(
        SHIKEN_WRITE_SCOPE,
      );
    } finally {
      await client.close();
    }
  });

  test('publishes once, protects editorial pages by owner and version, and preserves the original receipt after edits and archival', async () => {
    const backend = createTestBackend();
    const client = await connect(backend, await accessToken({ scope }));
    const other = await connect(
      backend,
      await accessToken({ scope, sub: 'user_other_shiken_author' }),
    );
    const args = {
      clientKey: 'shiken-daily:original',
      paper: authoredShikenPaper,
    };
    try {
      const created = shikenPaperResultSchema.parse(
        (
          await client.callTool({
            name: 'create_shiken_paper',
            arguments: args,
          })
        ).structuredContent,
      ).paper;
      expect(created.questionCount).toBe(4);
      const repeated = shikenPaperResultSchema.parse(
        (
          await client.callTool({
            name: 'create_shiken_paper',
            arguments: args,
          })
        ).structuredContent,
      ).paper;
      expect(repeated).toEqual(created);
      const first = shikenContentResultSchema.parse(
        (
          await client.callTool({
            name: 'get_shiken_paper_content',
            arguments: { id: created.id, questionLimit: 2 },
          })
        ).structuredContent,
      );
      expect(first.questions).toEqual(
        authoredShikenPaper.questions.slice(0, 2),
      );
      expect(first.nextQuestionOffset).toBe(2);
      const second = shikenContentResultSchema.parse(
        (
          await client.callTool({
            name: 'get_shiken_paper_content',
            arguments: {
              id: created.id,
              questionOffset: 2,
              expectedContentVersion: first.contentVersion,
            },
          })
        ).structuredContent,
      );
      expect(second.questions).toEqual(authoredShikenPaper.questions.slice(2));
      expect(second.nextQuestionOffset).toBeNull();
      expect(
        (
          await client.callTool({
            name: 'get_shiken_paper_content',
            arguments: { id: created.id, questionOffset: 2 },
          })
        ).isError,
      ).toBe(true);
      const foreign = await other.callTool({
        name: 'get_shiken_paper_content',
        arguments: { id: created.id },
      });
      expect(foreign.isError).toBe(true);
      expect(JSON.stringify(foreign)).not.toContain(authoredShikenPaper.title);
      const metadata = await client.callTool({
        name: 'get_shiken_paper',
        arguments: { id: created.id },
      });
      expect(JSON.stringify(metadata)).not.toContain('correctChoice');
      expect(JSON.stringify(metadata)).not.toContain('questions');

      const id = await backend.run(async (ctx) =>
        ctx.db.normalizeId('jlptPapers', created.id),
      );
      if (!id) throw new Error('Missing created paper');
      const learner = backend.withIdentity(learnerIdentity);
      await learner.mutation(api.jlpt.update, {
        id,
        patch: { title: 'Edição posterior' },
        expectedContentVersion: first.contentVersion,
      });
      await learner.mutation(api.jlpt.archive, { id });
      const replay = shikenPaperResultSchema.parse(
        (
          await client.callTool({
            name: 'create_shiken_paper',
            arguments: args,
          })
        ).structuredContent,
      ).paper;
      expect(replay).toMatchObject({
        id: created.id,
        title: 'Edição posterior',
        archived: true,
        contentVersion: 2,
      });
      const stale = await client.callTool({
        name: 'get_shiken_paper_content',
        arguments: {
          id: created.id,
          questionOffset: 2,
          expectedContentVersion: first.contentVersion,
        },
      });
      expect(stale.isError).toBe(true);
      expect(JSON.stringify(stale)).toContain('CONFLICT');
      const conflict = await client.callTool({
        name: 'create_shiken_paper',
        arguments: {
          ...args,
          paper: { ...authoredShikenPaper, title: 'Outro conteúdo' },
        },
      });
      expect(conflict.isError).toBe(true);
      expect(JSON.stringify(conflict)).toContain('CONFLICT');
      for (const invalid of [
        { ...args, clientKey: 'invalid-owner', ownerId: 'forged' },
        {
          ...args,
          clientKey: 'invalid-questions',
          paper: {
            ...authoredShikenPaper,
            questions: authoredShikenPaper.questions.slice(0, 3),
          },
        },
        {
          ...args,
          clientKey: 'invalid-answer',
          paper: {
            ...authoredShikenPaper,
            questions: authoredShikenPaper.questions.map((question) => ({
              ...question,
              correctChoice: 3,
            })),
          },
        },
      ])
        expect(
          (
            await client.callTool({
              name: 'create_shiken_paper',
              arguments: invalid,
            })
          ).isError,
        ).toBe(true);
      expect(
        await backend.run((ctx) => ctx.db.query('jlptPapers').collect()),
      ).toHaveLength(1);
      const independent = shikenPaperResultSchema.parse(
        (await other.callTool({ name: 'create_shiken_paper', arguments: args }))
          .structuredContent,
      ).paper;
      expect(independent.id).not.toBe(created.id);
    } finally {
      await client.close();
      await other.close();
    }
  });

  test('accepts a valid paper above the former transport limit and returns complete large questions without mixing pages', async () => {
    const backend = createTestBackend();
    const client = await connect(backend, await accessToken({ scope }));
    const questions = [
      ...authoredShikenPaper.questions,
      ...authoredShikenPaper.questions.slice(0, 3),
    ].map((question, index) => ({
      ...question,
      id: `large-${index}`,
      prompt: 'a'.repeat(12000),
      passage: 'b'.repeat(16000),
      explanation: 'c'.repeat(12000),
    }));
    const paper = { ...authoredShikenPaper, questions };
    expect(
      new TextEncoder().encode(JSON.stringify(paper)).length,
    ).toBeGreaterThan(256 * 1024);
    try {
      const created = shikenPaperResultSchema.parse(
        (
          await client.callTool({
            name: 'create_shiken_paper',
            arguments: { clientKey: 'large-paper:original', paper },
          })
        ).structuredContent,
      ).paper;
      const content = shikenContentResultSchema.parse(
        (
          await client.callTool({
            name: 'get_shiken_paper_content',
            arguments: { id: created.id },
          })
        ).structuredContent,
      );
      expect(content.questions).toEqual([questions[0]]);
      expect(content.nextQuestionOffset).toBe(1);
      const oversized = {
        ...paper,
        questions: [
          ...questions,
          ...questions
            .slice(0, 3)
            .map((question, index) => ({ ...question, id: `extra-${index}` })),
        ],
      };
      const rejected = await client.callTool({
        name: 'create_shiken_paper',
        arguments: { clientKey: 'oversized-paper:original', paper: oversized },
      });
      expect(rejected.isError).toBe(true);
      expect(
        await backend.run((ctx) => ctx.db.query('jlptPapers').collect()),
      ).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  test('reserves owner-bound binary uploads idempotently and exposes status without leaking upload capabilities through read queries', async () => {
    vi.stubEnv('CONVEX_SITE_URL', new URL(resource).origin);
    const backend = createTestBackend();
    const client = await connect(backend, await accessToken({ scope }));
    const reader = await connect(
      backend,
      await accessToken({ scope: `openid ${SHIKEN_READ_SCOPE}` }),
    );
    const other = await connect(
      backend,
      await accessToken({ scope, sub: 'user_other_media_owner' }),
    );
    const args = {
      clientKey: 'audio-shiken:original',
      contentType: 'audio/mpeg',
      byteLength: 128,
      sha256: 'a'.repeat(64),
    };
    try {
      const prepared = shikenMediaPrepareResultSchema.parse(
        (
          await client.callTool({
            name: 'prepare_shiken_media_upload',
            arguments: args,
          })
        ).structuredContent,
      );
      expect(prepared).toMatchObject({
        ...args,
        status: 'pending',
        url: null,
        upload: { method: 'POST', contentType: 'audio/mpeg' },
      });
      expect(new URL(prepared.upload!.url).pathname).toMatch(
        /^\/shiken-media-upload\/[a-f0-9]{64}$/,
      );
      const replay = shikenMediaPrepareResultSchema.parse(
        (
          await client.callTool({
            name: 'prepare_shiken_media_upload',
            arguments: args,
          })
        ).structuredContent,
      );
      expect(replay.id).toBe(prepared.id);
      const read = await reader.callTool({
        name: 'get_shiken_media',
        arguments: { id: prepared.id },
      });
      expect(
        shikenMediaResultSchema.parse(read.structuredContent).media,
      ).toMatchObject({ id: prepared.id, status: 'pending', url: null });
      expect(JSON.stringify(read)).not.toContain('/shiken-media-upload/');
      expect(JSON.stringify(read)).not.toContain('tokenHash');
      expect(
        (
          await other.callTool({
            name: 'get_shiken_media',
            arguments: { id: prepared.id },
          })
        ).isError,
      ).toBe(true);
      const conflict = await client.callTool({
        name: 'prepare_shiken_media_upload',
        arguments: { ...args, sha256: 'b'.repeat(64) },
      });
      expect(conflict.isError).toBe(true);
      expect(JSON.stringify(conflict)).toContain('CONFLICT');
      for (const invalid of [
        { ...args, byteLength: 8 * 1024 * 1024 + 1 },
        { ...args, contentType: 'image/svg+xml' },
        { ...args, sha256: 'A'.repeat(64) },
        { ...args, base64: 'forbidden' },
      ]) {
        expect(
          (
            await client.callTool({
              name: 'prepare_shiken_media_upload',
              arguments: invalid,
            })
          ).isError,
        ).toBe(true);
      }
      expect(
        await backend.run((ctx) => ctx.db.query('shikenMedia').collect()),
      ).toHaveLength(1);
    } finally {
      await client.close();
      await reader.close();
      await other.close();
      vi.unstubAllEnvs();
    }
  });
});

describe('MCP personal stories', () => {
  test('discovers portable reading schemas while preserving Unicode kana validation', async () => {
    const backend = createTestBackend();
    const client = await connect(
      backend,
      await accessToken({
        scope: `openid ${STORIES_READ_SCOPE} ${STORIES_WRITE_SCOPE}`,
      }),
    );
    try {
      const tools = (await client.listTools()).tools;
      const patterns: string[] = [];
      const inspect = (value: unknown) => {
        if (value === null || typeof value !== 'object') return;
        for (const [key, item] of Object.entries(value)) {
          if (key === 'pattern' && typeof item === 'string')
            patterns.push(item);
          else inspect(item);
        }
      };
      for (const tool of tools) {
        inspect(tool.inputSchema);
        inspect(tool.outputSchema);
      }
      expect(patterns.length).toBeGreaterThan(0);
      // tools/list is also consumed by non-JavaScript validators. Unicode
      // property escapes are not portable across their regex implementations.
      for (const pattern of patterns) expect(pattern).not.toMatch(/\\[pP]\{/);

      const contentWithReading = (reading: string) => ({
        ...storyContent,
        paragraphs: [
          {
            ...storyContent.paragraphs[0],
            segments: [{ text: '山', reading }],
          },
        ],
      });
      for (const reading of ['やま', 'ヤマー・やま', '𛀁']) {
        const result = await client.callTool({
          name: 'create_story',
          arguments: {
            clientKey: `portable-reading:${reading.codePointAt(0)}`,
            story: contentWithReading(reading),
          },
        });
        expect(result.isError).not.toBe(true);
        expect(
          storyResultSchema.parse(result.structuredContent).story.paragraphs[0]
            .segments[0].reading,
        ).toBe(reading);
      }
      for (const reading of ['yama', '山', '😀', '   ']) {
        const result = await client.callTool({
          name: 'create_story',
          arguments: {
            clientKey: 'portable-reading:invalid',
            story: contentWithReading(reading),
          },
        });
        expect(result.isError).toBe(true);
      }
      expect(
        await backend.run((ctx) => ctx.db.query('stories').collect()),
      ).toHaveLength(3);
    } finally {
      await client.close();
    }
  });

  test('declares independent story scopes and refuses unauthorized access before the gateway', async () => {
    const backend = createTestBackend();
    const gatewayFor = vi.fn(() => {
      throw new Error('Unauthorized stories must not reach data');
    });
    for (const entry of [
      {
        scope: `openid ${READ_SCOPE}`,
        name: 'list_stories',
        required: STORIES_READ_SCOPE,
      },
      {
        scope: `openid ${QUESTS_READ_SCOPE} ${QUESTS_WRITE_SCOPE}`,
        name: 'get_story',
        required: STORIES_READ_SCOPE,
      },
      {
        scope: `openid ${STORIES_READ_SCOPE}`,
        name: 'create_story',
        required: STORIES_WRITE_SCOPE,
      },
      {
        scope: `openid ${STORIES_READ_SCOPE}`,
        name: 'set_story_archived',
        required: STORIES_WRITE_SCOPE,
      },
      {
        scope: `openid ${STORIES_READ_SCOPE}`,
        name: 'update_story',
        required: STORIES_WRITE_SCOPE,
      },
      {
        scope: `openid ${STORIES_READ_SCOPE}`,
        name: 'delete_story',
        required: STORIES_WRITE_SCOPE,
      },
      {
        scope: `openid ${STORIES_WRITE_SCOPE}`,
        name: 'create_story',
        required: STORIES_READ_SCOPE,
      },
    ]) {
      const response = await handleMcpHttp(
        request(await accessToken({ scope: entry.scope }), {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: entry.name, arguments: {} },
        }),
        gatewayFor,
        config,
      );
      expect(response.status).toBe(403);
      expect(response.headers.get('WWW-Authenticate')).toContain(
        entry.required,
      );
    }
    expect(gatewayFor).not.toHaveBeenCalled();
    const client = await connect(
      backend,
      await accessToken({ scope: `openid ${STORIES_READ_SCOPE}` }),
    );
    try {
      const tools = (await client.listTools()).tools;
      expect(tools.map((tool) => tool.name)).toEqual(toolNames);
      for (const name of ['list_stories', 'get_story'])
        expect(tools.find((tool) => tool.name === name)?._meta).toMatchObject({
          securitySchemes: [{ type: 'oauth2', scopes: [STORIES_READ_SCOPE] }],
        });
      for (const name of [
        'create_story',
        'update_story',
        'delete_story',
        'set_story_archived',
      ])
        expect(tools.find((tool) => tool.name === name)?._meta).toMatchObject({
          securitySchemes: [
            {
              type: 'oauth2',
              scopes: [STORIES_READ_SCOPE, STORIES_WRITE_SCOPE],
            },
          ],
        });
      expect(resourceMetadata(config).scopes_supported).toEqual(
        expect.arrayContaining([STORIES_READ_SCOPE, STORIES_WRITE_SCOPE]),
      );
    } finally {
      await client.close();
    }
  });

  test('publishes idempotently, reads full authored content, paginates, and archives only the owner story while retaining progress', async () => {
    const backend = createTestBackend();
    const scope = `openid ${STORIES_READ_SCOPE} ${STORIES_WRITE_SCOPE}`;
    const client = await connect(backend, await accessToken({ scope }));
    const other = await connect(
      backend,
      await accessToken({ scope, sub: 'user_other_story_owner' }),
    );
    try {
      const args = { clientKey: 'daily-story:2026-10-10', story: storyContent };
      const first = await client.callTool({
        name: 'create_story',
        arguments: args,
      });
      expect(first.isError).not.toBe(true);
      const created = storyResultSchema.parse(first.structuredContent).story;
      expect(created).toMatchObject(storyContent);
      expect(created.archived).toBe(false);
      expect(
        (await client.callTool({ name: 'create_story', arguments: args }))
          .structuredContent,
      ).toEqual(first.structuredContent);
      const conflict = await client.callTool({
        name: 'create_story',
        arguments: {
          ...args,
          story: { ...storyContent, title: 'Outro título' },
        },
      });
      expect(conflict.isError).toBe(true);
      expect(JSON.stringify(conflict.content)).toContain('CONFLICT');
      const otherCreated = storyResultSchema.parse(
        (await other.callTool({ name: 'create_story', arguments: args }))
          .structuredContent,
      ).story;
      expect(otherCreated.id).not.toBe(created.id);
      expect(
        (
          await other.callTool({
            name: 'get_story',
            arguments: { id: created.id },
          })
        ).isError,
      ).toBe(true);
      expect(
        (
          await other.callTool({
            name: 'set_story_archived',
            arguments: { id: created.id, archived: true },
          })
        ).isError,
      ).toBe(true);
      await client.callTool({
        name: 'create_story',
        arguments: {
          ...args,
          clientKey: 'daily-story:2026-10-11',
          story: { ...storyContent, title: 'Uma nova história', level: 'N3' },
        },
      });
      const page1 = storyListResultSchema.parse(
        (
          await client.callTool({
            name: 'list_stories',
            arguments: { limit: 1 },
          })
        ).structuredContent,
      );
      expect(page1.items).toHaveLength(1);
      expect(page1.isDone).toBe(false);
      const page2 = storyListResultSchema.parse(
        (
          await client.callTool({
            name: 'list_stories',
            arguments: { limit: 1, cursor: page1.cursor },
          })
        ).structuredContent,
      );
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0].id).not.toBe(page1.items[0].id);
      expect(
        new Set([...page1.items, ...page2.items].map((item) => item.id)),
      ).toEqual(new Set([created.id, page1.items[0].id]));
      const found = storyGetResultSchema.parse(
        (
          await client.callTool({
            name: 'get_story',
            arguments: { id: created.id },
          })
        ).structuredContent,
      );
      expect(found.story).toEqual(created);
      expect(found.progress).toBeNull();
      expect(found.story.questions[0].correctOptionId).toBe('letter');
      const id = await backend.run(async (ctx) =>
        ctx.db.normalizeId('stories', created.id),
      );
      if (!id) throw new Error('Expected real story ID');
      const learner = backend.withIdentity(learnerIdentity);
      await learner.mutation(api.stories.answer, {
        id,
        questionId: 'q1',
        optionId: 'key',
      });
      await learner.mutation(api.stories.complete, { id });
      const completed = storyGetResultSchema.parse(
        (
          await client.callTool({
            name: 'get_story',
            arguments: { id: created.id },
          })
        ).structuredContent,
      );
      expect(completed.progress?.completedAt).toBeTypeOf('number');
      expect(completed.progress?.answers).toMatchObject([
        { questionId: 'q1', optionId: 'key' },
      ]);
      const history = storyListResultSchema.parse(
        (
          await client.callTool({
            name: 'list_stories',
            arguments: { status: 'completed', level: 'N4' },
          })
        ).structuredContent,
      );
      expect(history.items.map((item) => item.id)).toEqual([created.id]);
      const archived = storyResultSchema.parse(
        (
          await client.callTool({
            name: 'set_story_archived',
            arguments: { id: created.id, archived: true },
          })
        ).structuredContent,
      ).story;
      expect(archived.archived).toBe(true);
      expect(archived.paragraphs).toEqual(created.paragraphs);
      expect(
        (
          await client.callTool({
            name: 'set_story_archived',
            arguments: { id: created.id, archived: true },
          })
        ).structuredContent,
      ).toEqual({ story: archived });
      expect(
        storyGetResultSchema.parse(
          (
            await client.callTool({
              name: 'get_story',
              arguments: { id: created.id },
            })
          ).structuredContent,
        ).progress,
      ).toEqual(completed.progress);
      const active = storyListResultSchema.parse(
        (await client.callTool({ name: 'list_stories', arguments: {} }))
          .structuredContent,
      );
      expect(active.items.map((item) => item.id)).not.toContain(created.id);
      const archivedList = storyListResultSchema.parse(
        (
          await client.callTool({
            name: 'list_stories',
            arguments: { archived: true },
          })
        ).structuredContent,
      );
      expect(archivedList.items.map((item) => item.id)).toEqual([created.id]);
      expect(
        storyResultSchema.parse(
          (
            await client.callTool({
              name: 'set_story_archived',
              arguments: { id: created.id, archived: false },
            })
          ).structuredContent,
        ).story.archived,
      ).toBe(false);
      expect(JSON.stringify(active)).not.toContain('ownerId');
      expect(JSON.stringify(active)).not.toContain('tokenIdentifier');
    } finally {
      await client.close();
      await other.close();
    }
  });

  test('edits with version concurrency, keeps reading history and supports reversible deletion only for the owner', async () => {
    const backend = createTestBackend();
    const scope = `openid ${STORIES_READ_SCOPE} ${STORIES_WRITE_SCOPE}`;
    const client = await connect(backend, await accessToken({ scope }));
    const other = await connect(
      backend,
      await accessToken({ scope, sub: 'user_other_story_editor' }),
    );
    try {
      const originalArgs = {
        clientKey: 'daily-story:editable',
        story: storyContent,
      };
      const created = storyResultSchema.parse(
        (
          await client.callTool({
            name: 'create_story',
            arguments: originalArgs,
          })
        ).structuredContent,
      ).story;
      expect(created.contentVersion).toBe(1);
      const storyId = await backend.run(async (ctx) =>
        ctx.db.normalizeId('stories', created.id),
      );
      if (!storyId) throw new Error('Expected real story ID');
      const learner = backend.withIdentity(learnerIdentity);
      await learner.mutation(api.stories.answer, {
        id: storyId,
        questionId: 'q1',
        optionId: 'key',
      });
      await learner.mutation(api.stories.complete, { id: storyId });
      const before = await learner.query(api.stories.get, { id: storyId });

      const editedContent = {
        ...storyContent,
        title: '山からの便り',
        level: 'N3',
        paragraphs: [
          ...storyContent.paragraphs,
          {
            id: 'p2',
            segments: [{ text: 'すぐに返事を書きました。' }],
            translation: 'Logo escrevi uma resposta.',
          },
        ],
        questions: [{ ...storyContent.questions[0], correctOptionId: 'key' }],
      };
      const edit = {
        id: created.id,
        expectedContentVersion: 1,
        story: editedContent,
      };
      for (const name of ['update_story', 'delete_story']) {
        const denied = await other.callTool({
          name,
          arguments: name === 'update_story' ? edit : { id: created.id },
        });
        expect(denied.isError).toBe(true);
        expect(JSON.stringify(denied.content)).toContain('UNAVAILABLE');
      }
      const updated = storyResultSchema.parse(
        (
          await client.callTool({
            name: 'update_story',
            arguments: edit,
          })
        ).structuredContent,
      ).story;
      expect(updated).toMatchObject({
        ...editedContent,
        id: created.id,
        contentVersion: 2,
      });
      expect(
        (await client.callTool({ name: 'update_story', arguments: edit }))
          .structuredContent,
      ).toEqual({ story: updated });
      const conflict = await client.callTool({
        name: 'update_story',
        arguments: {
          ...edit,
          story: { ...editedContent, title: 'Concurrent edit' },
        },
      });
      expect(conflict.isError).toBe(true);
      expect(JSON.stringify(conflict.content)).toContain('CONFLICT');

      const latest = storyGetResultSchema.parse(
        (
          await client.callTool({
            name: 'get_story',
            arguments: { id: created.id },
          })
        ).structuredContent,
      );
      expect(latest.story).toEqual(updated);
      expect(latest.progress).toEqual(before?.progress);
      expect(latest.progress?.contentVersion).toBe(1);
      expect(
        await learner.query(api.stories.get, { id: storyId }),
      ).toMatchObject({
        story: { ...storyContent, contentVersion: 1 },
        progress: before?.progress,
      });
      const catalog = storyListResultSchema.parse(
        (
          await client.callTool({
            name: 'list_stories',
            arguments: { level: 'N3' },
          })
        ).structuredContent,
      );
      expect(catalog.items).toMatchObject([
        { id: created.id, title: editedContent.title, contentVersion: 2 },
      ]);
      const retriedCreation = storyResultSchema.parse(
        (
          await client.callTool({
            name: 'create_story',
            arguments: originalArgs,
          })
        ).structuredContent,
      ).story;
      expect(retriedCreation.id).toBe(created.id);
      expect(retriedCreation.contentVersion).toBe(2);

      const deleted = storyResultSchema.parse(
        (
          await client.callTool({
            name: 'delete_story',
            arguments: { id: created.id },
          })
        ).structuredContent,
      ).story;
      expect(deleted.archived).toBe(true);
      expect(deleted.contentVersion).toBe(2);
      expect(
        (
          await client.callTool({
            name: 'delete_story',
            arguments: { id: created.id },
          })
        ).structuredContent,
      ).toEqual({ story: deleted });
      expect(
        storyListResultSchema.parse(
          (await client.callTool({ name: 'list_stories', arguments: {} }))
            .structuredContent,
        ).items,
      ).toEqual([]);
      const archived = storyListResultSchema.parse(
        (
          await client.callTool({
            name: 'list_stories',
            arguments: { archived: true },
          })
        ).structuredContent,
      );
      expect(archived.items).toHaveLength(1);
      expect(archived.items[0].progress).toEqual(before?.progress);
      const restored = storyResultSchema.parse(
        (
          await client.callTool({
            name: 'set_story_archived',
            arguments: { id: created.id, archived: false },
          })
        ).structuredContent,
      ).story;
      expect(restored).toMatchObject({
        ...editedContent,
        id: created.id,
        contentVersion: 2,
        archived: false,
      });
    } finally {
      await client.close();
      await other.close();
    }
  });

  test('requires translation for every authored paragraph, without rejecting legacy output', async () => {
    const backend = createTestBackend();
    const client = await connect(
      backend,
      await accessToken({
        scope: `openid ${STORIES_READ_SCOPE} ${STORIES_WRITE_SCOPE}`,
      }),
    );
    const secondParagraph = {
      id: 'p2',
      segments: [{ text: '返事を書きました。' }],
    };
    try {
      const created = storyResultSchema.parse(
        (
          await client.callTool({
            name: 'create_story',
            arguments: {
              clientKey: 'daily-story:translations',
              story: storyContent,
            },
          })
        ).structuredContent,
      ).story;
      for (const translation of [undefined, '', '   ']) {
        const story = {
          ...storyContent,
          paragraphs: [
            ...storyContent.paragraphs,
            { ...secondParagraph, translation },
          ],
        };
        const create = { clientKey: 'daily-story:no-translation', story };
        const update = { id: created.id, expectedContentVersion: 1, story };
        expect(storyCreateSchema.safeParse(create).success).toBe(false);
        expect(storyUpdateSchema.safeParse(update).success).toBe(false);
        expect(
          (await client.callTool({ name: 'create_story', arguments: create }))
            .isError,
        ).toBe(true);
        expect(
          (await client.callTool({ name: 'update_story', arguments: update }))
            .isError,
        ).toBe(true);
      }
      for (const expectedContentVersion of [0, -1, 1.5])
        expect(
          storyUpdateSchema.safeParse({
            id: created.id,
            expectedContentVersion,
            story: storyContent,
          }).success,
        ).toBe(false);
      expect(
        storyResultSchema.safeParse({
          story: { ...created, paragraphs: [secondParagraph] },
        }).success,
      ).toBe(true);
      expect(
        (
          await client.callTool({
            name: 'get_story',
            arguments: { id: created.id },
          })
        ).structuredContent,
      ).toMatchObject({ story: created });
      expect(
        await backend.run((ctx) => ctx.db.query('stories').collect()),
      ).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  test('rejects forged progress, invalid readings, duplicate IDs, absent correct options and oversized content atomically', async () => {
    const backend = createTestBackend();
    const client = await connect(
      backend,
      await accessToken({
        scope: `openid ${STORIES_READ_SCOPE} ${STORIES_WRITE_SCOPE}`,
      }),
    );
    const valid = { clientKey: 'daily-story:invalid', story: storyContent };
    const invalid = [
      { ...valid, ownerId: 'forged' },
      { ...valid, completedAt: Date.now() },
      { ...valid, story: { ...storyContent, progress: { answers: [] } } },
      { ...valid, story: { ...storyContent, level: 'N6' } },
      {
        ...valid,
        story: {
          ...storyContent,
          paragraphs: [
            {
              id: 'p1',
              segments: [{ text: '山', reading: 'mountain' }],
              translation: 'Montanha.',
            },
          ],
        },
      },
      {
        ...valid,
        story: {
          ...storyContent,
          paragraphs: [storyContent.paragraphs[0], storyContent.paragraphs[0]],
        },
      },
      {
        ...valid,
        story: {
          ...storyContent,
          questions: [storyContent.questions[0], storyContent.questions[0]],
        },
      },
      {
        ...valid,
        story: {
          ...storyContent,
          questions: [
            { ...storyContent.questions[0], correctOptionId: 'absent' },
          ],
        },
      },
      {
        ...valid,
        story: {
          ...storyContent,
          questions: [
            {
              ...storyContent.questions[0],
              options: [
                { id: 'letter', text: '手紙' },
                { id: 'letter', text: '鍵' },
              ],
            },
          ],
        },
      },
      {
        ...valid,
        story: {
          ...storyContent,
          paragraphs: Array.from({ length: 20 }, (_, index) => ({
            id: `p${index}`,
            segments: [{ text: '山'.repeat(2000) }],
            translation: 'Montanha.',
          })),
        },
      },
    ];
    try {
      for (const args of invalid) {
        expect(storyCreateSchema.safeParse(args).success).toBe(false);
        expect(
          (await client.callTool({ name: 'create_story', arguments: args }))
            .isError,
        ).toBe(true);
      }
      expect(
        await backend.run((ctx) => ctx.db.query('stories').collect()),
      ).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
