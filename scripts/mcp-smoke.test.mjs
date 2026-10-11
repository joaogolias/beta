import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readOptions, verifyShikenAuthorship } from './mcp-smoke.mjs';

const baseArgs = [
  '--server',
  'https://example.convex.site/mcp',
  '--issuer',
  'https://example.clerk.accounts.dev',
  '--client-id',
  'example-client',
];

test('Shiken publishing smoke requires an explicit boolean flag and defaults to read-only', () => {
  assert.equal(readOptions(baseArgs).shikenAuthoringCheck, false);
  assert.equal(
    readOptions([...baseArgs, '--shiken-authoring-check', 'false'])
      .shikenAuthoringCheck,
    false,
  );
  assert.equal(
    readOptions([...baseArgs, '--shiken-authoring-check', 'true'])
      .shikenAuthoringCheck,
    true,
  );
  for (const args of [
    ['--shiken-authoring-check'],
    ['--shiken-authoring-check', 'yes'],
    ['--shiken-authoring-check', 'true', '--shiken-authoring-check', 'true'],
  ])
    assert.throws(() => readOptions([...baseArgs, ...args]));
});

const schemas = [
  {
    name: 'create_shiken_paper',
    inputSchema: {
      properties: { clientKey: {}, paper: { properties: { questions: {} } } },
    },
  },
  {
    name: 'get_shiken_paper_content',
    inputSchema: {
      properties: {
        id: {},
        questionOffset: {},
        questionLimit: {},
        expectedContentVersion: {},
      },
    },
  },
];

function harness({ acceptInvalid = false } = {}) {
  const rows = new Map();
  let uploads = 0,
    invalidCreates = 0;
  const client = {
    async listTools() {
      return { tools: schemas };
    },
    async callTool({ name, arguments: args }) {
      let value;
      if (name === 'search_shiken_papers')
        value = { items: [{ id: 'sample-paper' }] };
      else if (name === 'get_shiken_paper_content') {
        assert.equal(args.id, 'sample-paper');
        if (args.questionOffset) assert.equal(args.expectedContentVersion, 3);
        value = {
          id: args.id,
          contentVersion: 3,
          totalQuestions: 2,
          questionOffset: args.questionOffset,
          nextQuestionOffset: args.questionOffset === 0 ? 1 : null,
          questions: [
            {
              id: `q${args.questionOffset}`,
              prompt: 'Fixture',
              explanation: 'Fixture',
              choices: ['A', 'B', 'C', 'D'],
              correctChoice: 0,
            },
          ],
        };
      } else if (name === 'create_shiken_paper') {
        assert.deepEqual(args, {
          clientKey: 'mcp-check-shiken-invalid-v1',
          paper: { title: 'Validation only', level: 'N5', questions: [] },
        });
        invalidCreates++;
        return { isError: !acceptInvalid };
      } else if (name === 'prepare_shiken_media_upload') {
        let row = rows.get(args.clientKey);
        if (!row) {
          row = {
            ...args,
            id: `media-${rows.size}`,
            status: 'pending',
            url: null,
            token: String(rows.size + 1).repeat(64),
          };
          rows.set(args.clientKey, row);
        }
        const { token, bytes: _bytes, ...media } = row;
        value = {
          ...media,
          upload:
            row.status === 'ready'
              ? null
              : {
                  url: `https://example.convex.site/shiken-media-upload/${token}`,
                  method: 'POST',
                  contentType: row.contentType,
                  expiresAt: Date.now() + 60_000,
                },
        };
      } else if (name === 'get_shiken_media') {
        const row = [...rows.values()].find((item) => item.id === args.id);
        const { token: _token, bytes: _bytes, ...media } = row;
        value = { media };
      } else assert.fail(`Unexpected tool ${name}`);
      return { structuredContent: value };
    },
  };
  async function fetchImpl(url, options) {
    assert.equal(options.redirect, 'error');
    if (options.method === 'POST') {
      const row = [...rows.values()].find((item) =>
        url.pathname.endsWith(item.token),
      );
      assert.ok(row);
      assert.equal(options.headers['Content-Type'], row.contentType);
      assert.equal(options.body.length, row.byteLength);
      assert.equal(
        createHash('sha256').update(options.body).digest('hex'),
        row.sha256,
      );
      row.bytes = Buffer.from(options.body);
      row.status = 'ready';
      row.url = `https://example.convex.cloud/api/storage/${row.id}`;
      uploads++;
      return Response.json({ id: row.id, status: row.status });
    }
    const row = [...rows.values()].find((item) => item.url === url.href);
    assert.ok(row);
    return new Response(row.bytes, {
      headers: { 'content-type': row.contentType },
    });
  }
  return {
    client,
    fetchImpl,
    stats: () => ({ uploads, invalidCreates, rows }),
  };
}

test('authoring verification checks all pages and reuses two neutral uploads after token refresh', async () => {
  const { client, fetchImpl, stats } = harness();
  const options = { resource: 'https://example.convex.site/mcp', fetchImpl };
  const first = await verifyShikenAuthorship(client, options);
  assert.deepEqual(first, await verifyShikenAuthorship(client, options));
  assert.deepEqual(first, {
    schemasVerified: true,
    existingPaperPages: 2,
    existingPaperQuestions: 2,
    invalidPaperRejected: true,
    mediaFixturesVerified: 2,
    mediaBytesVerified: 116,
    mediaIdempotencyVerified: true,
    validPapersCreated: 0,
  });
  assert.equal(stats().uploads, 2);
  assert.equal(stats().invalidCreates, 2);
  assert.equal(stats().rows.size, 2);
  const audio = stats().rows.get('mcp-check-shiken-audio-v1').bytes;
  assert.equal(audio.length, 48);
  assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
  assert.equal(audio.toString('ascii', 8, 12), 'WAVE');
  assert.equal(audio.readUInt32LE(40), 4);
});

test('unexpected acceptance of the invalid paper stops before any media upload', async () => {
  const { client, fetchImpl, stats } = harness({ acceptInvalid: true });
  await assert.rejects(
    verifyShikenAuthorship(client, {
      resource: 'https://example.convex.site/mcp',
      fetchImpl,
    }),
    /unexpectedly accepted/,
  );
  assert.equal(stats().uploads, 0);
});
