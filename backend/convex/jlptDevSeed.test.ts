import { afterEach, describe, expect, test, vi } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import { createTestBackend } from './test-support.helpers';
import {
  normalizePaper,
  validateReady,
  type PaperInput,
} from '../../shared/jlpt';
import dataset from '../../docs/data/jlpt-n5-authorial.json';

const seed = makeFunctionReference<'mutation'>('jlptDevSeed:seed');
const inspect = makeFunctionReference<'query'>('jlptDevSeed:inspect');
const target = {
  email: 'joaovgolias@gmail.com',
  tokenIdentifier: 'https://genuine-lark-146.clerk.accounts.dev|seed_test_user',
};
afterEach(() => vi.unstubAllEnvs());

function paperInput(): PaperInput {
  return structuredClone(dataset.paper) as PaperInput;
}

async function setup() {
  vi.stubEnv('CONVEX_CLOUD_URL', 'https://kindhearted-hare-87.convex.cloud');
  const backend = createTestBackend();
  const ownerId = await backend.run((ctx) =>
    ctx.db.insert('users', { tokenIdentifier: target.tokenIdentifier }),
  );
  const otherId = await backend.run((ctx) =>
    ctx.db.insert('users', { tokenIdentifier: 'unrelated-user' }),
  );
  const files = await backend.run(async (ctx) => {
    const result = [];
    for (const question of dataset.paper.questions.filter(
      (question) => question.skill === 'listening',
    )) {
      const storageId = await ctx.storage.store(
        new Blob(
          [
            `Unique test audio for ${question.id}; payload longer than a WAV header.`,
          ],
          { type: 'audio/wav' },
        ),
      );
      const metadata = await ctx.db.system.get('_storage', storageId);
      if (!metadata) throw new Error('Test audio missing.');
      result.push({
        questionId: question.id,
        storageId,
        sha256: metadata.sha256,
      });
    }
    return result;
  });
  return { backend, ownerId, otherId, files };
}

describe('Development JLPT seed', () => {
  test('ships twenty valid N5 questions with five authored scripts and no audio answer exposed in the prompt', () => {
    const paper = paperInput();
    expect(paper.questions).toHaveLength(20);
    for (const skill of ['vocabulary', 'grammar', 'reading', 'listening'])
      expect(
        paper.questions.filter((question) => question.skill === skill),
      ).toHaveLength(5);
    expect(Object.keys(dataset.listeningScripts)).toHaveLength(5);
    for (const question of paper.questions.filter(
      (question) => question.skill === 'listening',
    )) {
      expect(question.passage).toBeUndefined();
      expect(question.prompt).not.toContain(
        dataset.listeningScripts[
          question.id as keyof typeof dataset.listeningScripts
        ],
      );
      question.audioUrl = `https://example.com/${question.id}.wav`;
    }
    expect(() => validateReady(normalizePaper(paper))).not.toThrow();
    expect(paper.title).toContain('autoral');
    expect(paper.description).toContain('não é uma prova oficial');
  });

  test('resolves the existing owner even when the JWT-provisioned row has no email and inserts only once', async () => {
    const { backend, ownerId, otherId, files } = await setup();
    const args = { ...target, paper: paperInput(), files };
    const first = await backend.mutation(seed, args);
    const replay = await backend.mutation(seed, args);
    expect(first).toMatchObject({
      created: true,
      ownerId,
      questionCount: 20,
      counts: { vocabulary: 5, grammar: 5, reading: 5, listening: 5 },
    });
    expect(replay).toMatchObject({
      created: false,
      id: first.id,
      contentVersion: 1,
    });
    expect(first.audio).toHaveLength(5);
    expect(
      first.audio.every((file: { url: string }) =>
        file.url.startsWith('https://'),
      ),
    ).toBe(true);
    const stored = await backend.run((ctx) =>
      ctx.db.query('jlptPapers').collect(),
    );
    expect(stored).toHaveLength(1);
    expect(stored.some((paper) => paper.ownerId === otherId)).toBe(false);
  });

  test('preserves user edits, even after renaming the seeded paper', async () => {
    const { backend, files } = await setup();
    const args = { ...target, paper: paperInput(), files };
    const first = await backend.mutation(seed, args);
    await backend.run((ctx) =>
      ctx.db.patch('jlptPapers', first.id, {
        title: 'Meu título editado',
        contentVersion: 2,
      }),
    );
    await expect(backend.mutation(seed, args)).rejects.toThrow(
      /Preserve as edições/,
    );
    const after = await backend.query(inspect, target);
    expect(after.existing).toMatchObject({
      id: first.id,
      title: 'Meu título editado',
      contentVersion: 2,
    });
  });

  test('rejects a missing owner, mismatched email, and any other deployment without creating users or papers', async () => {
    const { backend } = await setup();
    await expect(
      backend.query(inspect, {
        ...target,
        tokenIdentifier: `${target.tokenIdentifier}-missing`,
      }),
    ).rejects.toThrow(/Usuário esperado/);
    await expect(
      backend.query(inspect, { ...target, email: 'other@example.com' }),
    ).rejects.toThrow(/Identidade/);
    vi.stubEnv('CONVEX_CLOUD_URL', 'https://production.convex.cloud');
    await expect(backend.query(inspect, target)).rejects.toThrow(
      /só pode executar no desenvolvimento/,
    );
    const counts = await backend.run(async (ctx) => ({
      users: (await ctx.db.query('users').collect()).length,
      papers: (await ctx.db.query('jlptPapers').collect()).length,
    }));
    expect(counts).toEqual({ users: 2, papers: 0 });
  });

  test('rejects missing or mismatched storage audio before inserting a paper', async () => {
    const { backend, files } = await setup();
    await expect(
      backend.mutation(seed, {
        ...target,
        paper: paperInput(),
        files: files.slice(0, 4),
      }),
    ).rejects.toThrow(/arquivo de áudio/);
    await expect(
      backend.mutation(seed, {
        ...target,
        paper: paperInput(),
        files: files.map((file, index) =>
          index ? file : { ...file, sha256: 'invalid' },
        ),
      }),
    ).rejects.toThrow(/checksum/);
    expect(
      await backend.run((ctx) => ctx.db.query('jlptPapers').collect()),
    ).toHaveLength(0);
  });
});
