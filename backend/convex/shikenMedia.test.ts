import { afterEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import { createTestBackend, learnerIdentity } from './test-support.helpers';
import { hashHex, validatePaperMediaForOwner } from './shikenMedia';
import { MAX_SHIKEN_MEDIA_BYTES } from './shikenMediaValidators';
import type {
  ShikenMediaInput,
  ShikenMediaUploadResult,
} from './shikenMediaValidators';
import type { Id } from './_generated/dataModel';
import type { PaperInput } from '../../shared/jlpt';

afterEach(() => vi.unstubAllEnvs());
// A tiny real PCM WAV used only as an upload fixture, never as a JLPT question.
const audio = new Uint8Array(48);
const view = new DataView(audio.buffer);
for (const [offset, text] of [
  [0, 'RIFF'],
  [8, 'WAVE'],
  [12, 'fmt '],
  [36, 'data'],
] as const)
  [...text].forEach((letter, index) => {
    audio[offset + index] = letter.charCodeAt(0);
  });
view.setUint32(4, 40, true);
view.setUint32(16, 16, true);
view.setUint16(20, 1, true);
view.setUint16(22, 1, true);
view.setUint32(24, 8000, true);
view.setUint32(28, 16000, true);
view.setUint16(32, 2, true);
view.setUint16(34, 16, true);
view.setUint32(40, 4, true);

async function setup() {
  vi.stubEnv('CONVEX_SITE_URL', 'https://test-beta.convex.site');
  const t = createTestBackend();
  const input: ShikenMediaInput = {
    clientKey: 'weekly:2026-10-11:audio:1',
    contentType: 'audio/wav',
    byteLength: audio.byteLength,
    sha256: await hashHex(audio),
  };
  const args = { ...input, tokenIdentifier: learnerIdentity.tokenIdentifier };
  const prepared = await t.action(internal.shikenMedia.prepare, args);
  return { t, args, prepared };
}
async function upload(
  t: ReturnType<typeof createTestBackend>,
  prepared: ShikenMediaUploadResult,
  bytes = audio,
  contentType = 'audio/wav',
) {
  return t.fetch(new URL(prepared.upload!.url).pathname, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(bytes).buffer,
  });
}

describe('Shiken media publication', () => {
  test('authenticated preparation, binary upload and readback preserve bytes and recover the same receipt', async () => {
    const { t, args, prepared } = await setup();
    expect(prepared).toMatchObject({
      status: 'pending',
      url: null,
      upload: { method: 'POST', contentType: 'audio/wav' },
    });
    const response = await upload(t, prepared);
    expect(response.status).toBe(200);
    const ready = await response.json();
    expect(ready).toMatchObject({
      id: prepared.id,
      status: 'ready',
      sha256: args.sha256,
      byteLength: audio.length,
    });
    expect(ready.url).toMatch(/^https:\/\//);
    expect(
      await t.query(internal.shikenMedia.get, {
        tokenIdentifier: args.tokenIdentifier,
        id: prepared.id,
      }),
    ).toEqual(ready);
    expect(await t.action(internal.shikenMedia.prepare, args)).toEqual({
      ...ready,
      upload: null,
    });
    expect(await (await upload(t, prepared)).json()).toEqual(ready);
    const stored = await t.run(async (ctx) => {
      const row = await ctx.db.get(
        'shikenMedia',
        prepared.id as Id<'shikenMedia'>,
      );
      return {
        files: await ctx.db.system.query('_storage').collect(),
        bytes: await (await ctx.storage.get(row!.storageId!))!.arrayBuffer(),
      };
    });
    expect(stored.files).toHaveLength(1);
    expect(new Uint8Array(stored.bytes)).toEqual(audio);
  });

  test('keys are scoped to the owner and cannot silently replace file content or type', async () => {
    const { t, args, prepared } = await setup();
    for (const patch of [
      { sha256: 'a'.repeat(64) },
      { byteLength: 50 },
      { contentType: 'audio/mpeg' },
    ])
      await expect(
        t.action(internal.shikenMedia.prepare, { ...args, ...patch }),
      ).rejects.toThrow(/outro arquivo/);
    const other = await t.action(internal.shikenMedia.prepare, {
      ...args,
      tokenIdentifier: 'other-user',
    });
    expect(other.id).not.toBe(prepared.id);
    expect(
      await t.query(internal.shikenMedia.get, {
        tokenIdentifier: 'other-user',
        id: prepared.id,
      }),
    ).toBeNull();
    expect(
      await t.query(internal.shikenMedia.get, {
        tokenIdentifier: args.tokenIdentifier,
        id: other.id,
      }),
    ).toBeNull();
  });

  test('expired and replaced upload capabilities do not publish bytes; preparing the same key recovers it', async () => {
    const { t, args, prepared } = await setup();
    const second = await t.action(internal.shikenMedia.prepare, args);
    expect(second.id).toBe(prepared.id);
    expect((await upload(t, prepared)).status).toBe(403);
    await t.run((ctx) =>
      ctx.db.patch('shikenMedia', prepared.id as Id<'shikenMedia'>, {
        uploadExpiresAt: Date.now() - 1,
      }),
    );
    expect((await upload(t, second)).status).toBe(403);
    const recovered = await t.action(internal.shikenMedia.prepare, args);
    expect(recovered.id).toBe(prepared.id);
    expect((await upload(t, recovered)).status).toBe(200);
  });

  test('unknown capabilities and mismatched MIME, length, digest or signature never store a file', async () => {
    const { t, args, prepared } = await setup();
    expect(
      (
        await t.fetch(`/shiken-media-upload/${'f'.repeat(64)}`, {
          method: 'POST',
          body: audio.buffer,
        })
      ).status,
    ).toBe(403);
    expect((await upload(t, prepared, audio, 'text/html')).status).toBe(415);
    expect((await upload(t, prepared, audio.subarray(0, 40))).status).toBe(413);
    expect((await upload(t, prepared, new Uint8Array(49))).status).toBe(413);
    const altered = audio.slice();
    altered[47] = 1;
    expect((await upload(t, prepared, altered)).status).toBe(422);
    const html = new TextEncoder().encode('<html>not audio</html>');
    const disguised = await t.action(internal.shikenMedia.prepare, {
      ...args,
      clientKey: 'disguised-file',
      byteLength: html.length,
      sha256: await hashHex(html),
    });
    expect((await upload(t, disguised, html)).status).toBe(415);
    expect(
      await t.run((ctx) => ctx.db.system.query('_storage').collect()),
    ).toHaveLength(0);
  });

  test('rejects invalid preparation without opening extra upload receipts', async () => {
    const { t, args } = await setup();
    for (const patch of [
      { clientKey: 'short' },
      { byteLength: MAX_SHIKEN_MEDIA_BYTES + 1 },
      { byteLength: 0 },
      { byteLength: 1.5 },
      { sha256: 'Z'.repeat(64) },
      { contentType: 'image/svg+xml' },
    ])
      await expect(
        t.action(internal.shikenMedia.prepare, { ...args, ...patch }),
      ).rejects.toThrow();
    expect(
      await t.run((ctx) => ctx.db.query('shikenMedia').collect()),
    ).toHaveLength(1);
  });

  test('concurrent completion keeps one file and cleanup never removes the acknowledged file', async () => {
    const { t, prepared } = await setup();
    const token = new URL(prepared.upload!.url).pathname.split('/').at(-1)!;
    const tokenHash = await hashHex(new TextEncoder().encode(token));
    const ids = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob([audio.buffer], { type: 'audio/wav' })),
      await ctx.storage.store(new Blob([audio.buffer], { type: 'audio/wav' })),
    ]);
    const args = { id: prepared.id as Id<'shikenMedia'>, tokenHash };
    const results = await Promise.all(
      ids.map((storageId) =>
        t.mutation(internal.shikenMedia.complete, { ...args, storageId }),
      ),
    );
    expect(results[0]).toEqual(results[1]);
    const row = await t.run((ctx) => ctx.db.get('shikenMedia', args.id));
    await t.mutation(internal.shikenMedia.discardUnclaimedUpload, {
      id: args.id,
      storageId: row!.storageId!,
    });
    expect(
      await t.run((ctx) => ctx.db.system.query('_storage').collect()),
    ).toHaveLength(1);
  });

  test('paper references verify owner, readiness and audio/image kind', async () => {
    const { t, prepared } = await setup();
    const ready = await (await upload(t, prepared)).json();
    const otherOwner = await t.run((ctx) =>
      ctx.db.insert('users', { tokenIdentifier: 'another-owner' }),
    );
    const row = await t.run((ctx) =>
      ctx.db.get('shikenMedia', prepared.id as Id<'shikenMedia'>),
    );
    const paper: PaperInput = {
      title: 'Validation fixture',
      level: 'N5',
      questions: [
        {
          id: 'one',
          skill: 'listening',
          kind: 'task_based',
          prompt: 'fixture',
          choices: ['a', 'b', 'c'],
          correctChoice: 0,
          explanation: 'fixture',
          audioUrl: ready.url,
        },
      ],
    };
    await expect(
      t.run((ctx) => validatePaperMediaForOwner(ctx, row!.ownerId, paper)),
    ).resolves.toBeNull();
    await expect(
      t.run((ctx) => validatePaperMediaForOwner(ctx, otherOwner, paper)),
    ).rejects.toThrow(/conta/);
    const wrongKind = {
      ...paper,
      questions: [
        { ...paper.questions[0], audioUrl: undefined, imageUrl: ready.url },
      ],
    };
    await expect(
      t.run((ctx) => validatePaperMediaForOwner(ctx, row!.ownerId, wrongKind)),
    ).rejects.toThrow(/tipo/);
    const unclaimed = {
      ...paper,
      questions: [
        {
          ...paper.questions[0],
          audioUrl: 'https://test-beta.convex.cloud/api/storage/unknown',
        },
      ],
    };
    await expect(
      t.run((ctx) => validatePaperMediaForOwner(ctx, row!.ownerId, unclaimed)),
    ).rejects.toThrow(/autorizado/);
  });
});
