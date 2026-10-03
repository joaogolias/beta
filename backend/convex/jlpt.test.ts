import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import { createTestBackend, learnerIdentity } from './test-support.helpers';
import {
  normalizePaper,
  applyPaperPatch,
  blocksForLevel,
  kindsFor,
  validateReady,
  startAttempt,
  answerAttempt,
  advanceAttempt,
  finishAttempt,
  summarizeAttempt,
  type PaperInput,
  type JlptLevel,
} from '../../shared/jlpt';
import type { OfflineCommand } from './offlineValidators';

afterEach(() => vi.restoreAllMocks());
const paper: PaperInput = {
  title: 'Treino N5 autoral',
  level: 'N5',
  description: 'Prática pessoal',
  source: 'Questões autorais',
  questions: [
    {
      id: 'vocab',
      skill: 'vocabulary',
      kind: 'kanji_reading',
      prompt: '水の読み方は？',
      choices: ['やま', 'みず', 'ひ', 'つき'],
      correctChoice: 1,
      explanation: '水 se lê みず.',
    },
    {
      id: 'grammar',
      skill: 'grammar',
      kind: 'grammar_form',
      prompt: '学校（　）行きます。',
      choices: ['へ', 'が', 'を', 'も'],
      correctChoice: 0,
      explanation: 'へ marca direção.',
    },
    {
      id: 'reading',
      skill: 'reading',
      kind: 'short_passage',
      prompt: 'いつ行きますか。',
      passage: '明日、学校へ行きます。',
      choices: ['今日', '昨日', '明日', '毎日'],
      correctChoice: 2,
      explanation: '明日 significa amanhã.',
    },
    {
      id: 'listening',
      skill: 'listening',
      kind: 'quick_response',
      prompt: '音声を聞いて、答えてください。',
      choices: ['はい', 'いいえ', 'ありがとう'],
      correctChoice: 1,
      explanation: 'A resposta é negativa.',
      audioUrl: 'https://example.com/listening.mp3',
    },
  ],
};
async function setup() {
  const backend = createTestBackend();
  const learner = backend.withIdentity(learnerIdentity);
  const other = backend.withIdentity({
    ...learnerIdentity,
    subject: 'other',
    tokenIdentifier: `${learnerIdentity.issuer}|other`,
  });
  await learner.mutation(api.users.ensureCurrentUser, {});
  await other.mutation(api.users.ensureCurrentUser, {});
  let operation = 0;
  const apply = (
    command: OfflineCommand,
    operationId = `jlpt-operation-${++operation}`,
  ) => learner.mutation(api.offline.apply, { command, operationId });
  return { backend, learner, other, apply };
}

describe('JLPT practice papers and objective attempts', () => {
  test('rejects an editor draft based on an older version without replacing newer content', async () => {
    const { learner } = await setup();
    const created = await learner.mutation(api.jlpt.create, { paper });
    await learner.mutation(api.jlpt.update, {
      id: created._id,
      patch: { title: 'Título atualizado' },
      expectedContentVersion: created.contentVersion,
    });
    await expect(
      learner.mutation(api.jlpt.update, {
        id: created._id,
        patch: { title: 'Rascunho desatualizado' },
        expectedContentVersion: created.contentVersion,
      }),
    ).rejects.toThrow(/mudou desde/);
    expect(
      await learner.query(api.jlpt.get, { id: created._id }),
    ).toMatchObject({ title: 'Título atualizado', contentVersion: 2 });
  });
  test('uses official block times and only item kinds offered at the selected level', () => {
    for (const [level, minutes] of Object.entries({
      N1: [110, 55],
      N2: [105, 50],
      N3: [30, 70, 40],
      N4: [25, 55, 35],
      N5: [20, 40, 30],
    }))
      expect(
        blocksForLevel(level as JlptLevel).map((block) => block.minutes),
      ).toEqual(minutes);
    expect(blocksForLevel('N1')[0].skills).toEqual([
      'vocabulary',
      'grammar',
      'reading',
    ]);
    expect(blocksForLevel('N5')[1].skills).toEqual(['grammar', 'reading']);
    expect(
      kindsFor('N5', 'vocabulary').map((kind) => kind.value),
    ).not.toContain('usage');
    expect(kindsFor('N2', 'vocabulary').map((kind) => kind.value)).toContain(
      'word_formation',
    );
    expect(
      kindsFor('N1', 'vocabulary').map((kind) => kind.value),
    ).not.toContain('orthography');
    expect(kindsFor('N5', 'listening').map((kind) => kind.value)).not.toContain(
      'general_outline',
    );
    expect(kindsFor('N1', 'listening').map((kind) => kind.value)).not.toContain(
      'verbal_expressions',
    );
  });

  test('validates objective choices, level-specific kinds, unique ids and safe remote media', () => {
    expect(normalizePaper(paper)).toEqual(paper);
    const first = paper.questions[0];
    for (const changed of [
      { ...first, prompt: ' ' },
      { ...first, choices: ['a', 'b', 'c'] },
      { ...first, choices: ['a', 'a', 'b', 'c'] },
      { ...first, correctChoice: 4 },
      { ...first, correctChoice: -1 },
      { ...first, correctChoice: 1.5 },
      { ...first, kind: 'usage' },
      { ...first, skill: 'listening' as const },
      { ...first, audioUrl: 'javascript:alert(1)' },
      { ...first, imageUrl: 'http://example.com/image.png' },
      { ...first, audioUrl: 'https://user:password@example.com/audio' },
    ])
      expect(() => normalizePaper({ ...paper, questions: [changed] })).toThrow(
        'VALIDATION',
      );
    expect(() =>
      normalizePaper({ ...paper, questions: [first, first] }),
    ).toThrow('identificador único');
    expect(() =>
      normalizePaper({
        ...paper,
        questions: Array.from({ length: 201 }, (_, index) => ({
          ...first,
          id: String(index),
        })),
      }),
    ).toThrow('200 questões');
    expect(() =>
      normalizePaper({
        ...paper,
        questions: paper.questions.map((question) => ({
          ...question,
          prompt: '問'.repeat(12000),
          passage: '文'.repeat(16000),
          explanation: '説'.repeat(12000),
        })),
      }),
    ).toThrow('muito grande');
    expect(
      applyPaperPatch(paper, { description: null, source: '' }),
    ).not.toHaveProperty('description');
    expect(
      applyPaperPatch(paper, { description: null, source: '' }),
    ).not.toHaveProperty('source');
  });

  test('allows incomplete drafts but requires every skill and playable listening references before starting', async () => {
    const { learner } = await setup();
    const draft = await learner.mutation(api.jlpt.create, {
      paper: { ...paper, questions: [] },
    });
    await expect(
      learner.mutation(api.jlpt.start, { paperId: draft._id }),
    ).rejects.toThrow('pelo menos uma questão');
    const noAudio = {
      ...paper,
      questions: paper.questions.map((question) => ({
        ...question,
        audioUrl: undefined,
      })),
    };
    expect(() => validateReady(noAudio)).toThrow('precisa de um áudio');
    await learner.mutation(api.jlpt.update, {
      id: draft._id,
      patch: { questions: paper.questions },
    });
    expect(
      await learner.mutation(api.jlpt.start, { paperId: draft._id }),
    ).toMatchObject({
      status: 'active',
      revision: 0,
      blockIndex: 0,
      answers: paper.questions.map((question) => ({
        questionId: question.id,
        choice: null,
        flagged: false,
      })),
    });
  });

  test('persists deadlines, permits review only inside the current block and grades only at the end', () => {
    const original = startAttempt({ ...paper, contentVersion: 1 }, 1000);
    expect(original.blockDeadlineAt).toBe(1_201_000);
    let state = answerAttempt(
      original,
      { questionId: 'vocab', choice: 0, flagged: true },
      2000,
    );
    expect(original.answers[0]).toEqual({
      questionId: 'vocab',
      choice: null,
      flagged: false,
    });
    expect(summarizeAttempt(state)).toBeNull();
    state = answerAttempt(
      state,
      { questionId: 'vocab', choice: 1, flagged: false },
      3000,
    );
    expect(() =>
      answerAttempt(
        state,
        { questionId: 'reading', choice: 2, flagged: false },
        4000,
      ),
    ).toThrow('bloco atual');
    const restored = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(() =>
      answerAttempt(
        restored,
        { questionId: 'vocab', choice: 0, flagged: false },
        restored.blockDeadlineAt,
      ),
    ).toThrow('TIME_EXPIRED');
    state = advanceAttempt(restored, 5_000_000);
    expect(state.blockDeadlineAt).toBe(7_400_000);
    expect(() =>
      answerAttempt(
        state,
        { questionId: 'vocab', choice: 0, flagged: false },
        5_000_001,
      ),
    ).toThrow('bloco atual');
    state = answerAttempt(
      state,
      { questionId: 'grammar', choice: 0, flagged: false },
      5_000_002,
    );
    state = answerAttempt(
      state,
      { questionId: 'reading', choice: 0, flagged: true },
      5_000_003,
    );
    state = advanceAttempt(state, 5_000_004);
    state = advanceAttempt(state, state.blockDeadlineAt);
    const summary = summarizeAttempt(state);
    expect(summary).toMatchObject({
      total: 4,
      answered: 3,
      correct: 2,
      incorrect: 1,
      unanswered: 1,
      percentage: 50,
    });
    expect(summary?.bySkill).toMatchObject([
      { skill: 'vocabulary', correct: 1, percentage: 100 },
      { skill: 'grammar', correct: 1, percentage: 100 },
      { skill: 'reading', incorrect: 1, percentage: 0 },
      { skill: 'listening', unanswered: 1, percentage: 0 },
    ]);
    expect(summary).not.toHaveProperty('officialScore');
    expect(() =>
      answerAttempt(
        state,
        { questionId: 'listening', choice: 1, flagged: false },
        state.lastActionAt + 1,
      ),
    ).toThrow('encerrado');
    expect(() => advanceAttempt(state, state.lastActionAt + 1)).toThrow(
      'encerrado',
    );
  });

  test('rejects clock rollback and stale revisions without changing saved answers', () => {
    const state = answerAttempt(
      startAttempt({ ...paper, contentVersion: 1 }, 1000),
      { questionId: 'vocab', choice: 1, flagged: true },
      2000,
    );
    expect(() =>
      answerAttempt(
        state,
        { questionId: 'vocab', choice: 0, flagged: false },
        3000,
        0,
      ),
    ).toThrow('CONFLICT');
    expect(() => advanceAttempt(state, 1999)).toThrow('relógio voltou');
    expect(() => finishAttempt(state, 1999)).toThrow('relógio voltou');
    const completed = finishAttempt(state, 3000);
    expect(summarizeAttempt(completed)).toMatchObject({
      correct: 1,
      unanswered: 3,
      percentage: 25,
    });
  });

  test('isolates papers, mutations, filtered search, attempt history and result access by owner', async () => {
    const { backend, learner, other } = await setup();
    await expect(backend.mutation(api.jlpt.create, { paper })).rejects.toThrow(
      'UNAUTHENTICATED',
    );
    const created = await learner.mutation(api.jlpt.create, { paper });
    expect(await other.query(api.jlpt.get, { id: created._id })).toBeNull();
    expect(
      (
        await other.query(api.jlpt.search, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
    expect(
      (
        await learner.query(api.jlpt.search, {
          level: 'N5',
          query: 'PRATICA',
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page.map((item) => item._id),
    ).toEqual([created._id]);
    expect(
      (
        await learner.query(api.jlpt.search, {
          level: 'N4',
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
    await expect(
      other.mutation(api.jlpt.update, {
        id: created._id,
        patch: { title: 'changed' },
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.jlpt.archive, { id: created._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.jlpt.restore, { id: created._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.jlpt.start, { paperId: created._id }),
    ).rejects.toThrow('UNAVAILABLE');
    const attempt = await learner.mutation(api.jlpt.start, {
      paperId: created._id,
    });
    expect(
      await other.query(api.jlpt.getAttempt, { id: attempt._id }),
    ).toBeNull();
    expect(await other.query(api.jlpt.active, {})).toBeNull();
    expect(
      (
        await other.query(api.jlpt.history, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
    await expect(
      other.query(api.jlpt.history, {
        paperId: created._id,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.jlpt.answer, {
        attemptId: attempt._id,
        expectedRevision: 0,
        questionId: 'vocab',
        choice: 1,
        flagged: false,
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.jlpt.advance, {
        attemptId: attempt._id,
        expectedRevision: 0,
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.jlpt.finish, {
        attemptId: attempt._id,
        expectedRevision: 0,
      }),
    ).rejects.toThrow('UNAVAILABLE');
  });

  test('freezes the paper snapshot across later edits and archive while keeping attempts outside Benkyou', async () => {
    const { learner } = await setup();
    const created = await learner.mutation(api.jlpt.create, { paper });
    const attempt = await learner.mutation(api.jlpt.start, {
      paperId: created._id,
    });
    await expect(
      learner.mutation(api.jlpt.start, { paperId: created._id }),
    ).rejects.toThrow('em andamento');
    await learner.mutation(api.jlpt.update, {
      id: created._id,
      patch: {
        title: 'Nova edição',
        questions: paper.questions.map((question) => ({
          ...question,
          correctChoice: 0,
        })),
      },
    });
    await learner.mutation(api.jlpt.archive, { id: created._id });
    expect(
      (await learner.query(api.jlpt.getAttempt, { id: attempt._id }))?.snapshot,
    ).toEqual({ ...paper, contentVersion: 1 });
    await learner.mutation(api.jlpt.answer, {
      attemptId: attempt._id,
      expectedRevision: 0,
      questionId: 'vocab',
      choice: 1,
      flagged: false,
    });
    const completed = await learner.mutation(api.jlpt.finish, {
      attemptId: attempt._id,
      expectedRevision: 1,
    });
    expect(summarizeAttempt(completed)).toMatchObject({
      correct: 1,
      percentage: 25,
    });
    await expect(
      learner.mutation(api.jlpt.start, { paperId: created._id }),
    ).rejects.toThrow('arquivado');
    expect(
      (
        await learner.query(api.jlpt.history, {
          paperId: created._id,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([completed]);
    expect(await learner.query(api.study.overview, {})).toMatchObject({
      attempts: 0,
      reviewedCards: 0,
    });
    expect(await learner.query(api.studyProgress.overview, {})).toMatchObject({
      totalCards: 0,
      attempts: 0,
    });
    await expect(
      learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        limit: 10,
      }),
    ).rejects.toThrow('Nenhum card');
    await learner.mutation(api.jlpt.restore, { id: created._id });
    expect(
      (await learner.mutation(api.jlpt.start, { paperId: created._id }))
        .snapshot,
    ).toMatchObject({ title: 'Nova edição', contentVersion: 2 });
  });

  test('the public answer endpoint enforces deadlines and revisions on the server', async () => {
    const { backend, learner } = await setup();
    const created = await learner.mutation(api.jlpt.create, { paper });
    const attempt = await learner.mutation(api.jlpt.start, {
      paperId: created._id,
    });
    const args = {
      attemptId: attempt._id,
      expectedRevision: 0,
      questionId: 'vocab',
      choice: 1,
      flagged: false,
    };
    await learner.mutation(api.jlpt.answer, args);
    await expect(
      learner.mutation(api.jlpt.answer, { ...args, choice: 0 }),
    ).rejects.toThrow('CONFLICT');
    await backend.run((ctx) =>
      ctx.db.patch('jlptAttempts', attempt._id, {
        blockDeadlineAt: Date.now() - 1,
      }),
    );
    await expect(
      learner.mutation(api.jlpt.answer, {
        ...args,
        expectedRevision: 1,
        choice: 0,
      }),
    ).rejects.toThrow('TIME_EXPIRED');
    const advanced = await learner.mutation(api.jlpt.advance, {
      attemptId: attempt._id,
      expectedRevision: 1,
    });
    expect(advanced).toMatchObject({ blockIndex: 1, revision: 2 });
    expect(advanced.blockDeadlineAt - advanced.blockStartedAt).toBe(
      40 * 60_000,
    );
  });

  test('offline aliases and receipts replay a complete objective attempt after lost acknowledgements without duplicate results', async () => {
    const { learner, other, apply } = await setup();
    const created = await apply({
      type: 'jlpt.create',
      localId: 'local:jlpt-paper-0001',
      paper,
    });
    const now = Date.now() - 10_000;
    const start: OfflineCommand = {
      type: 'jlpt.start',
      localId: 'local:jlpt-attempt-0001',
      paperId: 'local:jlpt-paper-0001',
      snapshot: { ...paper, contentVersion: 1 },
      startedAt: now,
    };
    const first = await apply(start, 'stable-start-operation');
    expect(await apply(start, 'stable-start-operation')).toEqual(first);
    const answer: OfflineCommand = {
      type: 'jlpt.answer',
      attemptId: 'local:jlpt-attempt-0001',
      expectedRevision: 0,
      questionId: 'vocab',
      choice: 1,
      flagged: true,
      occurredAt: now + 1,
    };
    const acknowledged = await apply(answer, 'stable-answer-operation');
    await apply({
      ...answer,
      expectedRevision: 1,
      choice: 0,
      flagged: false,
      occurredAt: now + 2,
    });
    expect(await apply(answer, 'stable-answer-operation')).toEqual(
      acknowledged,
    );
    await expect(
      apply({ ...answer, choice: 2 }, 'stable-answer-operation'),
    ).rejects.toThrow('CONFLICT');
    await apply({
      type: 'jlpt.advance',
      attemptId: start.localId,
      expectedRevision: 2,
      occurredAt: now + 3,
    });
    await apply({
      ...answer,
      expectedRevision: 3,
      questionId: 'grammar',
      choice: 0,
      occurredAt: now + 4,
    });
    await apply({
      ...answer,
      expectedRevision: 4,
      questionId: 'reading',
      choice: 2,
      occurredAt: now + 5,
    });
    await apply({
      type: 'jlpt.advance',
      attemptId: start.localId,
      expectedRevision: 5,
      occurredAt: now + 6,
    });
    await apply({
      ...answer,
      expectedRevision: 6,
      questionId: 'listening',
      choice: 1,
      occurredAt: now + 7,
    });
    const finish: OfflineCommand = {
      type: 'jlpt.finish',
      attemptId: start.localId,
      expectedRevision: 7,
      occurredAt: now + 8,
    };
    const done = await apply(finish, 'stable-finish-operation');
    expect(await apply(finish, 'stable-finish-operation')).toEqual(done);
    expect(summarizeAttempt(done.attempt!)).toMatchObject({
      total: 4,
      correct: 3,
      incorrect: 1,
      unanswered: 0,
      percentage: 75,
    });
    expect(
      (
        await learner.query(api.jlpt.history, {
          paginationOpts: { cursor: null, numItems: 100 },
        })
      ).page,
    ).toHaveLength(1);
    await expect(
      other.mutation(api.offline.apply, {
        operationId: 'other-answer-operation',
        command: { ...answer, attemptId: done.attempt!._id },
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.offline.apply, {
        operationId: 'other-start-operation',
        command: {
          ...start,
          localId: 'local:other-attempt-0001',
          paperId: created.paper!._id,
        },
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.offline.apply, {
        operationId: 'other-local-reference',
        command: answer,
      }),
    ).rejects.toThrow('UNAVAILABLE');
  });

  test('offline edits detect conflicts, clearing optional metadata remains idempotent and frozen old content survives remote editing', async () => {
    const { learner, apply } = await setup();
    const created = await learner.mutation(api.jlpt.create, { paper });
    const now = Date.now() - 10_000;
    await learner.mutation(api.jlpt.update, {
      id: created._id,
      patch: { title: 'Edição remota' },
    });
    const update: OfflineCommand = {
      type: 'jlpt.update',
      id: created._id,
      patch: { description: null, source: null },
      expectedContentVersion: 1,
      expectedArchived: false,
    };
    await expect(apply(update)).rejects.toThrow('CONFLICT');
    const changed = await apply(
      { ...update, force: true },
      'force-clear-metadata',
    );
    expect(changed.paper).not.toHaveProperty('description');
    expect(changed.paper).not.toHaveProperty('source');
    expect(
      await apply({ ...update, force: true }, 'force-clear-metadata'),
    ).toEqual(changed);
    await learner.mutation(api.jlpt.archive, { id: created._id });
    const started = await apply({
      type: 'jlpt.start',
      localId: 'local:old-content-0001',
      paperId: created._id,
      snapshot: { ...paper, contentVersion: 1 },
      startedAt: now,
    });
    expect(started.attempt?.snapshot).toEqual({ ...paper, contentVersion: 1 });
    await expect(
      apply({
        type: 'jlpt.answer',
        attemptId: started.attempt!._id,
        questionId: 'vocab',
        choice: 1,
        flagged: false,
        expectedRevision: 0,
        occurredAt: now - 1,
      }),
    ).rejects.toThrow('relógio voltou');
    await expect(
      apply({
        type: 'jlpt.answer',
        attemptId: started.attempt!._id,
        questionId: 'vocab',
        choice: 1,
        flagged: false,
        expectedRevision: 0,
        occurredAt: Date.now() + 400_000,
      }),
    ).rejects.toThrow('data desta ação');
  });
});
