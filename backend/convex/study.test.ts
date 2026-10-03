import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { AlphabetContent } from './alphabetDomain';
import type { VocabularyContent } from './vocabularyDomain';
import type { GrammarContent } from './grammarDomain';
import type { ExamCreateInput } from './examDomain';
import { createTestBackend, learnerIdentity } from './test-support.helpers';

const water: AlphabetContent = {
  language: 'ja',
  writingSystem: 'Hani',
  symbol: '水',
  meanings: ['água'],
  examples: [
    { text: '水曜日', reading: 'すいようび', meaning: 'quarta-feira' },
  ],
  front: '水',
  back: 'água — みず / スイ',
  sortKey: 'みず',
  classifications: [
    { scheme: 'jlpt', level: 'N5' },
    { scheme: 'jlpt', level: 'N4' },
  ],
  details: {
    kind: 'kanji',
    kunYomi: ['みず'],
    onYomi: ['スイ'],
    radicals: ['水'],
  },
};

async function setup() {
  const backend = createTestBackend();
  const learner = backend.withIdentity(learnerIdentity);
  await learner.mutation(api.users.ensureCurrentUser, {});
  const other = backend.withIdentity({
    ...learnerIdentity,
    subject: 'other',
    tokenIdentifier: `${learnerIdentity.issuer}|other`,
  });
  await other.mutation(api.users.ensureCurrentUser, {});
  return { backend, learner, other };
}

type Learner = Awaited<ReturnType<typeof setup>>['learner'];
async function answer(
  learner: Learner,
  sessionId: Id<'studySessions'>,
  rating: 'correct' | 'partial' | 'incorrect',
) {
  const { presentation, session } = await learner.query(api.study.current, {
    sessionId,
  });
  if (!presentation) throw new Error('Expected an active presentation');
  const args = {
    sessionId,
    presentationId: presentation._id,
    expectedRevision: session.revision ?? 0,
  };
  await learner.mutation(api.study.reveal, args);
  return await learner.mutation(api.study.rate, { ...args, rating });
}

describe('personal card study', () => {
  const permission: GrammarContent = {
    language: 'ja',
    title: '〜てもいい',
    explanation: 'Expressa permissão.\nUse a forma て.',
    examples: [
      {
        text: '座ってもいいですか。',
        reading: 'すわってもいいですか。',
        meaning: 'Posso sentar?\nPermissão.',
      },
    ],
    front: '〜てもいい',
    back: 'Exemplos\n座ってもいいですか。\nすわってもいいですか。\nPosso sentar?\nPermissão.',
    shortExplanation: '',
    sortKey: '',
    classifications: [{ scheme: 'jlpt', level: 'N5' }],
  };

  const examQuestion: ExamCreateInput = {
    language: 'ja',
    title: 'Escolha a partícula',
    prompt: '電車（　）学校へ行きます。',
    alternatives: ['を', 'で', 'に', 'が'],
    answer: '2. で',
    explanation: 'で indica o meio de transporte.',
    sortKey: 'でんしゃ',
    classifications: [
      { scheme: 'jlpt', level: 'N5' },
      { scheme: 'jlpt', level: 'N4' },
    ],
  };

  test('large grammar sessions fail before writes and smaller sessions retain the full snapshot', async () => {
    const { learner } = await setup();
    const long = {
      ...permission,
      explanation: '説'.repeat(8000),
      back: '答'.repeat(8000),
      examples: Array.from({ length: 24 }, () => ({
        text: '例'.repeat(1000),
        reading: 'あ'.repeat(1000),
        meaning: '意'.repeat(1000),
      })),
    };
    const first = await learner.mutation(api.grammar.create, { card: long });
    await learner.mutation(api.grammar.create, {
      card: { ...long, title: 'Outra estrutura' },
    });
    const args = {
      mode: 'direct' as const,
      order: 'sorted' as const,
      category: 'grammar' as const,
      limit: 2,
    };
    await expect(learner.mutation(api.study.start, args)).rejects.toThrow(
      'Escolha menos cards',
    );
    expect(await learner.query(api.study.active, {})).toBeNull();
    const session = await learner.mutation(api.study.start, {
      ...args,
      limit: 1,
    });
    expect(
      (await learner.query(api.study.current, { sessionId: session._id }))
        .presentation?.snapshot,
    ).toMatchObject({ front: first.front, back: first.back });
  });

  test('candidate and progress reads reject a large grammar byte footprint instead of returning partial counts', async () => {
    const { learner } = await setup();
    for (let index = 0; index < 28; index++)
      await learner.mutation(api.grammar.create, {
        card: {
          ...permission,
          title: String(index),
          explanation: '説'.repeat(8000),
          back: '答'.repeat(8000),
          examples: Array.from({ length: 24 }, () => ({
            text: '例'.repeat(1000),
            reading: 'あ'.repeat(1000),
            meaning: '意'.repeat(1000),
          })),
        },
      });
    await expect(
      learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        category: 'grammar',
        limit: 1,
      }),
    ).rejects.toThrow('textos da biblioteca');
    await expect(
      learner.query(api.studyProgress.overview, { category: 'grammar' }),
    ).rejects.toThrow('textos da biblioteca');
    expect(
      await learner.query(api.studyProgress.overview, { category: 'alphabet' }),
    ).toMatchObject({ totalCards: 0 });
  });

  test('new Benkyou sessions exclude legacy exam cards in every mode and reject the removed category explicitly', async () => {
    const { backend, learner } = await setup();
    const kanji = await learner.mutation(api.alphabet.create, { card: water });
    const vocab = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    const grammar = await learner.mutation(api.grammar.create, {
      card: permission,
    });
    await learner.mutation(api.exams.create, { card: examQuestion });
    await learner.mutation(api.jlpt.create, {
      paper: { title: 'Rascunho de simulado', level: 'N5', questions: [] },
    });
    for (const [mode, order] of [
      ['direct', 'sorted'],
      ['direct', 'random'],
      ['adaptive', 'sorted'],
    ] as const) {
      const session = await learner.mutation(api.study.start, {
        mode,
        order,
        category: 'all',
        level: 'N5',
        limit: 10,
      });
      expect(session.total).toBe(3);
      const queue = await backend.run((ctx) =>
        ctx.db
          .query('studyPresentations')
          .withIndex('by_sessionId_and_position', (q) =>
            q.eq('sessionId', session._id),
          )
          .take(10),
      );
      expect(new Set(queue.map((item) => item.cardId))).toEqual(
        new Set([kanji._id, vocab._id, grammar._id]),
      );
      await learner.mutation(api.study.finish, { sessionId: session._id });
    }
    await expect(
      learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        category: 'exam',
        limit: 10,
      }),
    ).rejects.toThrow('Shiken');
    expect(await learner.query(api.studyProgress.overview, {})).toMatchObject({
      totalCards: 3,
    });
    expect(
      await learner.query(api.studyProgress.overview, { category: 'exam' }),
    ).toMatchObject({ totalCards: 0, attempts: 0 });
  });

  test('legacy frozen exam sessions still replay, retain history and undo while their statistics stay outside Benkyou', async () => {
    const { learner, other } = await setup();
    const card = await learner.mutation(api.exams.create, {
      card: examQuestion,
    });
    const { normalizeContent } = await import('./examDomain');
    const startedAt = Date.now() - 1000;
    const result = await learner.mutation(api.offline.apply, {
      operationId: 'legacy-exam-session-start',
      command: {
        type: 'study.start',
        localId: 'local:legacy-session-01',
        mode: 'direct',
        order: 'sorted',
        filters: { category: 'exam' },
        createdAt: startedAt,
        queue: [
          {
            localId: 'local:legacy-presentation-01',
            cardId: card._id,
            snapshot: {
              ...normalizeContent(card),
              category: 'exam',
              contentVersion: 1,
            },
          },
        ],
      },
    });
    const session = result.session!;
    await learner.mutation(api.exams.update, {
      id: card._id,
      patch: { answer: 'Resposta nova' },
    });
    await learner.mutation(api.exams.archive, { id: card._id });
    await answer(learner, session._id, 'correct');
    const history = await learner.query(api.study.history, {
      cardId: card._id,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(history.page).toHaveLength(1);
    expect(history.page[0].snapshot).toMatchObject({
      category: 'exam',
      answer: examQuestion.answer,
      contentVersion: 1,
    });
    expect(
      await learner.query(api.study.progress, { cardId: card._id }),
    ).toMatchObject({ correct: 1, attempts: 1 });
    expect(await learner.query(api.study.overview, {})).toMatchObject({
      correct: 0,
      attempts: 0,
      reviewedCards: 0,
    });
    expect(
      await learner.query(api.studyProgress.overview, { archived: true }),
    ).toMatchObject({ totalCards: 0, attempts: 0 });
    await expect(
      other.query(api.study.history, {
        cardId: card._id,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await learner.mutation(api.study.undo, {
      sessionId: session._id,
      presentationId: history.page[0].presentationId,
      expectedRevision: 0,
    });
    expect(
      await learner.query(api.study.progress, { cardId: card._id }),
    ).toBeNull();
    expect(
      (await learner.query(api.study.current, { sessionId: session._id }))
        .presentation?.snapshot,
    ).toMatchObject({ answer: examQuestion.answer, contentVersion: 1 });
  });
  test('grammar joins all study modes and categories without duplicate cards or losing existing snapshots', async () => {
    const { backend, learner } = await setup();
    const alphabet = await learner.mutation(api.alphabet.create, {
      card: water,
    });
    const vocabulary = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    const grammar = await learner.mutation(api.grammar.create, {
      card: permission,
    });
    for (const [mode, order] of [
      ['direct', 'sorted'],
      ['direct', 'random'],
      ['adaptive', 'sorted'],
    ] as const) {
      const session = await learner.mutation(api.study.start, {
        mode,
        order,
        category: 'all',
        limit: 100,
      });
      const queue = await backend.run((ctx) =>
        ctx.db
          .query('studyPresentations')
          .withIndex('by_sessionId_and_position', (q) =>
            q.eq('sessionId', session._id),
          )
          .take(100),
      );
      expect(queue).toHaveLength(3);
      expect(new Set(queue.map(({ cardId }) => cardId))).toEqual(
        new Set([alphabet._id, vocabulary._id, grammar._id]),
      );
      expect(
        queue.find(({ cardId }) => cardId === grammar._id)?.snapshot,
      ).toEqual({ ...permission, category: 'grammar', contentVersion: 1 });
      expect(
        queue.find(({ cardId }) => cardId === alphabet._id)?.snapshot,
      ).not.toHaveProperty('category');
      if (mode === 'direct' && order === 'sorted')
        expect(queue.map(({ cardId }) => cardId)).toEqual([
          vocabulary._id,
          alphabet._id,
          grammar._id,
        ]);
      await learner.mutation(api.study.finish, { sessionId: session._id });
    }
    for (const category of ['alphabet', 'vocabulary', 'grammar'] as const) {
      const session = await learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        category,
        limit: 10,
      });
      expect(session.total).toBe(1);
      await learner.mutation(api.study.finish, { sessionId: session._id });
    }
    const defaultSession = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 10,
    });
    expect(defaultSession).toMatchObject({
      total: 3,
      filters: { category: 'all' },
    });
  });

  test('grammar snapshots and historical versions survive edits, archive and restore; undo restores exactly the prior statistics', async () => {
    const { learner } = await setup();
    const card = await learner.mutation(api.grammar.create, {
      card: permission,
    });
    const first = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'grammar',
      limit: 10,
    });
    await answer(learner, first._id, 'correct');
    const previousStats = await learner.query(api.study.progress, {
      cardId: card._id,
    });
    const session = await learner.mutation(api.study.start, {
      mode: 'adaptive',
      order: 'sorted',
      category: 'grammar',
      limit: 10,
    });
    await learner.mutation(api.grammar.update, {
      id: card._id,
      patch: {
        explanation: 'Explicação atualizada',
        examples: [{ text: '新しい例' }],
        back: 'Verso novo',
        shortExplanation: 'Verso novo',
        classifications: [{ scheme: 'jlpt', level: 'N4' }],
      },
    });
    const current = await learner.query(api.study.current, {
      sessionId: session._id,
    });
    expect(current.presentation?.snapshot).toEqual({
      ...permission,
      category: 'grammar',
      contentVersion: 1,
    });
    await answer(learner, session._id, 'incorrect');
    await learner.mutation(api.grammar.archive, { id: card._id });
    const historyArgs = {
      cardId: card._id,
      paginationOpts: { cursor: null, numItems: 10 },
    };
    expect(
      (await learner.query(api.study.history, historyArgs)).page.map(
        ({ snapshot }) => snapshot,
      ),
    ).toEqual([
      { ...permission, category: 'grammar', contentVersion: 1 },
      { ...permission, category: 'grammar', contentVersion: 1 },
    ]);
    const undoArgs = {
      sessionId: session._id,
      presentationId: current.presentation!._id,
      expectedRevision: 0,
    };
    const restored = await learner.mutation(api.study.undo, undoArgs);
    expect(await learner.mutation(api.study.undo, undoArgs)).toEqual(restored);
    expect(restored.presentation?.snapshot).toEqual({
      ...permission,
      category: 'grammar',
      contentVersion: 1,
    });
    expect(
      await learner.query(api.study.progress, { cardId: card._id }),
    ).toEqual(previousStats);
    expect(
      (await learner.query(api.study.history, historyArgs)).page,
    ).toHaveLength(1);
    expect(await learner.query(api.study.overview, {})).toEqual({
      correct: 1,
      partial: 0,
      incorrect: 0,
      attempts: 1,
      reviewedCards: 1,
    });
    await answer(learner, session._id, 'partial');
    await expect(
      learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        category: 'grammar',
        limit: 10,
      }),
    ).rejects.toThrow('Nenhum card');
    await learner.mutation(api.grammar.restore, { id: card._id });
    const next = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'grammar',
      level: 'N4',
      limit: 10,
    });
    expect(
      (await learner.query(api.study.current, { sessionId: next._id }))
        .presentation?.snapshot,
    ).toMatchObject({
      category: 'grammar',
      contentVersion: 2,
      back: 'Verso novo\n\nExemplos\n新しい例',
      examples: [{ text: '新しい例' }],
    });
  });

  test('grammar archive skips only unseen cards and preserves owner boundaries for history, stats and study actions', async () => {
    const { learner, other } = await setup();
    const first = await learner.mutation(api.grammar.create, {
      card: { ...permission, sortKey: 'a' },
    });
    const second = await learner.mutation(api.grammar.create, {
      card: { ...permission, title: '第二', sortKey: 'b' },
    });
    await expect(
      other.query(api.study.progress, { cardId: first._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.query(api.study.history, {
        cardId: first._id,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.study.start, {
        mode: 'adaptive',
        order: 'sorted',
        category: 'all',
        limit: 10,
      }),
    ).rejects.toThrow('Nenhum card');
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'grammar',
      limit: 10,
    });
    const current = await learner.query(api.study.current, {
      sessionId: session._id,
    });
    const args = {
      sessionId: session._id,
      presentationId: current.presentation!._id,
    };
    await expect(other.mutation(api.study.reveal, args)).rejects.toThrow(
      'UNAVAILABLE',
    );
    await expect(
      other.mutation(api.study.rate, { ...args, rating: 'correct' }),
    ).rejects.toThrow('UNAVAILABLE');
    await learner.mutation(api.grammar.archive, { id: first._id });
    await learner.mutation(api.grammar.archive, { id: second._id });
    expect(await answer(learner, session._id, 'incorrect')).toMatchObject({
      session: { status: 'completed', answered: 1, skipped: 1 },
      presentation: null,
    });
    expect(
      await learner.query(api.study.progress, { cardId: second._id }),
    ).toBeNull();
    expect(await other.query(api.study.overview, {})).toMatchObject({
      attempts: 0,
    });
  });

  test('grammar participates in the combined 1000 candidate guard and keeps the 100 card session limit', async () => {
    const { backend, learner } = await setup();
    const grammar = await learner.mutation(api.grammar.create, {
      card: permission,
    });
    await learner.mutation(api.alphabet.create, { card: water });
    await learner.mutation(api.vocabulary.create, { card: school });
    await backend.run(async (ctx) => {
      for (let index = 1; index < 999; index += 1)
        await ctx.db.insert('grammarCards', {
          ...permission,
          ownerId: grammar.ownerId,
          archived: false,
          readingSortKey: permission.sortKey,
          contentVersion: 1,
          createdAt: index,
          updatedAt: index,
        });
    });
    await expect(
      learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        category: 'all',
        limit: 100,
      }),
    ).rejects.toThrow('1.000');
    await expect(
      learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        category: 'grammar',
        limit: 101,
      }),
    ).rejects.toThrow('100');
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'random',
      category: 'grammar',
      limit: 100,
    });
    expect(session.total).toBe(100);
    const queue = await backend.run((ctx) =>
      ctx.db
        .query('studyPresentations')
        .withIndex('by_sessionId_and_position', (q) =>
          q.eq('sessionId', session._id),
        )
        .take(101),
    );
    expect(queue).toHaveLength(100);
    expect(new Set(queue.map(({ cardId }) => cardId)).size).toBe(100);
  });

  test('undo reopens the final card, clears its answer and removes its history and totals exactly once', async () => {
    const { learner, other } = await setup();
    const card = await learner.mutation(api.alphabet.create, { card: water });
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    const completed = await answer(learner, session._id, 'correct');
    const presentationId = completed.undoPresentationId!;
    const undoArgs = {
      sessionId: session._id,
      presentationId,
      expectedRevision: 0,
    };
    await expect(other.mutation(api.study.undo, undoArgs)).rejects.toThrow(
      'UNAVAILABLE',
    );
    const restored = await learner.mutation(api.study.undo, undoArgs);
    expect(restored).toMatchObject({
      session: {
        status: 'active',
        position: 0,
        answered: 0,
        correct: 0,
        revision: 1,
      },
      undoPresentationId: null,
    });
    expect(restored.presentation?._id).toBe(presentationId);
    expect(restored.presentation?.rating).toBeUndefined();
    expect(restored.presentation?.revealedAt).toBeUndefined();
    expect(restored.presentation?.answeredAt).toBeUndefined();
    expect(restored.session.completedAt).toBeUndefined();
    expect(await learner.mutation(api.study.undo, undoArgs)).toEqual(restored);
    expect(
      await learner.query(api.study.progress, { cardId: card._id }),
    ).toBeNull();
    expect(await learner.query(api.study.overview, {})).toEqual({
      correct: 0,
      partial: 0,
      incorrect: 0,
      attempts: 0,
      reviewedCards: 0,
    });
    expect(
      (
        await learner.query(api.study.history, {
          cardId: card._id,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toHaveLength(0);
    await expect(
      learner.mutation(api.study.rate, {
        sessionId: session._id,
        presentationId,
        rating: 'correct',
      }),
    ).rejects.toThrow('CONFLICT');
    await expect(
      learner.mutation(api.study.reveal, {
        sessionId: session._id,
        presentationId,
        expectedRevision: 0,
      }),
    ).rejects.toThrow('CONFLICT');
    await expect(
      learner.mutation(api.study.rate, {
        sessionId: session._id,
        presentationId,
        rating: 'partial',
        expectedRevision: 1,
      }),
    ).rejects.toThrow('Revele');
    await answer(learner, session._id, 'partial');
    await expect(learner.mutation(api.study.undo, undoArgs)).rejects.toThrow(
      'CONFLICT',
    );
    expect(await learner.query(api.study.overview, {})).toEqual({
      correct: 0,
      partial: 1,
      incorrect: 0,
      attempts: 1,
      reviewedCards: 1,
    });
  });

  test('undo can walk backward through several cards and resets the revealed next card', async () => {
    const { learner } = await setup();
    for (const [symbol, sortKey] of [
      ['水', 'a'],
      ['火', 'b'],
      ['木', 'c'],
    ])
      await learner.mutation(api.alphabet.create, {
        card: { ...water, symbol, sortKey },
      });
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 3,
    });
    const second = await answer(learner, session._id, 'incorrect');
    const third = await answer(learner, session._id, 'partial');
    await learner.mutation(api.study.reveal, {
      sessionId: session._id,
      presentationId: third.presentation!._id,
    });
    const rewindSecond = await learner.mutation(api.study.undo, {
      sessionId: session._id,
      presentationId: third.undoPresentationId!,
      expectedRevision: 0,
    });
    expect(rewindSecond.session).toMatchObject({
      position: 1,
      answered: 1,
      incorrect: 1,
      partial: 0,
    });
    const rewindFirst = await learner.mutation(api.study.undo, {
      sessionId: session._id,
      presentationId: rewindSecond.undoPresentationId!,
      expectedRevision: 1,
    });
    expect(rewindFirst.session).toMatchObject({
      position: 0,
      answered: 0,
      revision: 2,
    });
    expect(rewindFirst.undoPresentationId).toBeNull();
    const next = await answer(learner, session._id, 'correct');
    expect(next.presentation?._id).toBe(second.presentation?._id);
    expect(next.presentation?.revealedAt).toBeUndefined();
    expect(
      (await answer(learner, session._id, 'correct')).presentation?.revealedAt,
    ).toBeUndefined();
    expect(
      (await answer(learner, session._id, 'correct')).session,
    ).toMatchObject({
      status: 'completed',
      answered: 3,
      correct: 3,
      incorrect: 0,
      partial: 0,
    });
  });

  test('undo preserves earlier vocabulary history and its last reviewed date', async () => {
    const { learner } = await setup();
    const card = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    const first = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    await answer(learner, first._id, 'incorrect');
    const earlierStats = await learner.query(api.study.progress, {
      cardId: card._id,
    });
    const second = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    const completed = await answer(learner, second._id, 'correct');
    await learner.mutation(api.study.undo, {
      sessionId: second._id,
      presentationId: completed.undoPresentationId!,
      expectedRevision: 0,
    });
    expect(
      await learner.query(api.study.progress, { cardId: card._id }),
    ).toEqual(earlierStats);
    expect(await learner.query(api.study.overview, {})).toMatchObject({
      attempts: 1,
      reviewedCards: 1,
      incorrect: 1,
      correct: 0,
    });
    const history = await learner.query(api.study.history, {
      cardId: card._id,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(history.page).toHaveLength(1);
    expect(history.page[0].sessionId).toBe(first._id);
  });

  test('undo restores skip bookkeeping and cannot reopen a session alongside another active session', async () => {
    const { learner } = await setup();
    await learner.mutation(api.alphabet.create, {
      card: { ...water, sortKey: 'a' },
    });
    const archived = await learner.mutation(api.alphabet.create, {
      card: { ...water, symbol: '火', sortKey: 'b' },
    });
    const first = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 2,
    });
    await learner.mutation(api.alphabet.archive, { id: archived._id });
    const completed = await answer(learner, first._id, 'correct');
    expect(completed.session.skipped).toBe(1);
    const args = {
      sessionId: first._id,
      presentationId: completed.undoPresentationId!,
      expectedRevision: 0,
    };
    const nextSession = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    await expect(learner.mutation(api.study.undo, args)).rejects.toThrow(
      'Termine a sessão',
    );
    await learner.mutation(api.study.finish, { sessionId: nextSession._id });
    const restored = await learner.mutation(api.study.undo, args);
    expect(restored.session).toMatchObject({
      skipped: 0,
      position: 0,
      answered: 0,
    });
    expect((await answer(learner, first._id, 'partial')).session).toMatchObject(
      { skipped: 1, position: 2, answered: 1, partial: 1, correct: 0 },
    );
    await learner.mutation(api.study.finish, { sessionId: first._id });
  });

  test('new sessions canonicalize legacy cards without rewriting completed attempts', async () => {
    const { backend, learner } = await setup();
    const card = await learner.mutation(api.alphabet.create, { card: water });
    const first = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    await answer(learner, first._id, 'correct');
    const prior = (
      await learner.query(api.study.history, {
        cardId: card._id,
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page[0];
    const legacySnapshot = {
      ...prior.snapshot,
      front: 'Frente antiga',
      back: 'Verso antigo',
    };
    await backend.run(async (ctx) => {
      await ctx.db.patch('studyAttempts', prior._id, {
        snapshot: legacySnapshot,
      });
      await ctx.db.patch('alphabetCards', card._id, {
        front: legacySnapshot.front,
        back: legacySnapshot.back,
      });
    });
    expect(
      await learner.query(api.alphabet.get, { id: card._id }),
    ).toMatchObject({ front: '水', back: card.back, contentVersion: 2 });
    const next = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    expect(
      (await learner.query(api.study.current, { sessionId: next._id }))
        .presentation?.snapshot,
    ).toMatchObject({ front: '水', back: card.back, contentVersion: 2 });
    expect(
      await backend.run((ctx) => ctx.db.get('alphabetCards', card._id)),
    ).toMatchObject({ front: '水', back: card.back, contentVersion: 2 });
    expect(
      (
        await learner.query(api.study.history, {
          cardId: card._id,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page[0].snapshot,
    ).toEqual(legacySnapshot);
    expect(
      await learner.query(api.study.progress, { cardId: card._id }),
    ).toMatchObject({ correct: 1, attempts: 1 });
    await answer(learner, next._id, 'partial');
    const history = await learner.query(api.study.history, {
      cardId: card._id,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(history.page[0].snapshot).toMatchObject({
      front: '水',
      back: card.back,
      contentVersion: 2,
    });
    expect(history.page[1].snapshot).toEqual(legacySnapshot);
  });

  test('Japanese study includes regional content and sorts voiced kana in dictionary order', async () => {
    const { backend, learner } = await setup();
    for (const [symbol, sortKey, language] of [
      ['間', 'かん', 'ja'],
      ['学', 'がく', 'ja-JP'],
      ['柿', 'カキ', 'ja'],
    ]) {
      await learner.mutation(api.alphabet.create, {
        card: {
          ...water,
          symbol,
          sortKey,
          language,
          details: {
            kind: 'kanji',
            kunYomi: [sortKey],
            onYomi: [],
            radicals: [],
          },
        },
      });
    }
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      language: 'ja',
      limit: 20,
    });
    const queue = await backend.run((ctx) =>
      ctx.db
        .query('studyPresentations')
        .withIndex('by_sessionId_and_position', (q) =>
          q.eq('sessionId', session._id),
        )
        .take(100),
    );
    expect(queue.map((row) => row.snapshot.sortKey)).toEqual([
      'カキ',
      'がく',
      'かん',
    ]);
    expect(
      queue.map((row) =>
        'symbol' in row.snapshot ? row.snapshot.symbol : null,
      ),
    ).toEqual(['柿', '学', '間']);
  });

  test('starts a sorted frozen queue once per card and resumes the active session', async () => {
    const { backend, learner } = await setup();
    for (const [symbol, sortKey] of [
      ['水', 'みず'],
      ['火', 'ひ'],
      ['木', 'き'],
    ]) {
      await learner.mutation(api.alphabet.create, {
        card: {
          ...water,
          symbol,
          sortKey,
          details: {
            kind: 'kanji',
            kunYomi: [sortKey],
            onYomi: [],
            radicals: [],
          },
        },
      });
    }
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      level: 'N5',
      limit: 20,
    });
    expect(session).toMatchObject({ total: 3, answered: 0, status: 'active' });
    expect(await learner.query(api.study.active, {})).toEqual(session);
    expect(
      await learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'random',
        limit: 20,
      }),
    ).toEqual(session);
    const queue = await backend.run(async (ctx) =>
      ctx.db
        .query('studyPresentations')
        .withIndex('by_sessionId_and_position', (q) =>
          q.eq('sessionId', session._id),
        )
        .take(100),
    );
    expect(
      queue.map((row) =>
        'symbol' in row.snapshot ? row.snapshot.symbol : null,
      ),
    ).toEqual(['木', '火', '水']);
    expect(queue[0].presentedAt).toBeDefined();
    expect(queue[1].presentedAt).toBeUndefined();
  });

  test('requires reveal and atomically records all three responses, history and totals', async () => {
    const { learner } = await setup();
    const card = await learner.mutation(api.alphabet.create, { card: water });
    for (const rating of ['correct', 'partial', 'incorrect'] as const) {
      const session = await learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        limit: 1,
      });
      const { presentation } = await learner.query(api.study.current, {
        sessionId: session._id,
      });
      if (!presentation) throw new Error('Expected presentation');
      await expect(
        learner.mutation(api.study.rate, {
          sessionId: session._id,
          presentationId: presentation._id,
          rating,
        }),
      ).rejects.toThrow('Revele');
      const result = await answer(learner, session._id, rating);
      expect(result).toMatchObject({
        session: { status: 'completed', answered: 1, [rating]: 1 },
        presentation: null,
      });
      expect(await learner.query(api.study.active, {})).toBeNull();
    }
    expect(
      await learner.query(api.study.progress, { cardId: card._id }),
    ).toMatchObject({ attempts: 3, correct: 1, partial: 1, incorrect: 1 });
    expect(await learner.query(api.study.overview, {})).toEqual({
      attempts: 3,
      correct: 1,
      partial: 1,
      incorrect: 1,
      reviewedCards: 1,
    });
    const history = await learner.query(api.study.history, {
      cardId: card._id,
      paginationOpts: { cursor: null, numItems: 2 },
    });
    expect(history.page.map((attempt) => attempt.rating)).toEqual([
      'incorrect',
      'partial',
    ]);
    expect(history.isDone).toBe(false);
    expect(
      (
        await learner.query(api.study.history, {
          cardId: card._id,
          paginationOpts: { cursor: history.continueCursor, numItems: 2 },
        })
      ).page.map((attempt) => attempt.rating),
    ).toEqual(['correct']);
  });

  test('idempotent retries and simultaneous ratings cannot double-count an attempt', async () => {
    const { backend, learner } = await setup();
    const card = await learner.mutation(api.alphabet.create, { card: water });
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    const { presentation } = await learner.query(api.study.current, {
      sessionId: session._id,
    });
    if (!presentation) throw new Error('Expected presentation');
    const args = { sessionId: session._id, presentationId: presentation._id };
    await learner.mutation(api.study.reveal, args);
    const results = await Promise.all([
      learner.mutation(api.study.rate, { ...args, rating: 'partial' }),
      learner.mutation(api.study.rate, { ...args, rating: 'partial' }),
    ]);
    expect(results[0]).toEqual(results[1]);
    await learner.mutation(api.study.rate, { ...args, rating: 'partial' });
    await expect(
      learner.mutation(api.study.rate, { ...args, rating: 'correct' }),
    ).rejects.toThrow('CONFLICT');
    expect(
      await learner.query(api.study.progress, { cardId: card._id }),
    ).toMatchObject({ attempts: 1, partial: 1 });
    expect(
      await backend.run(async (ctx) => ctx.db.query('studyAttempts').take(2)),
    ).toHaveLength(1);
  });

  test('edits preserve historical snapshots and scores while new sessions use the new content', async () => {
    const { learner } = await setup();
    const card = await learner.mutation(api.alphabet.create, { card: water });
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    await learner.mutation(api.alphabet.update, {
      id: card._id,
      patch: { back: 'Água atualizada', meanings: ['água', 'líquido'] },
    });
    expect(
      (await learner.query(api.study.current, { sessionId: session._id }))
        .presentation?.snapshot,
    ).toMatchObject({ contentVersion: 1, back: card.back });
    await answer(learner, session._id, 'correct');
    await learner.mutation(api.alphabet.archive, { id: card._id });
    expect(
      await learner.query(api.study.progress, { cardId: card._id }),
    ).toMatchObject({ correct: 1 });
    expect(
      (
        await learner.query(api.study.history, {
          cardId: card._id,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page[0].snapshot,
    ).toMatchObject({ contentVersion: 1, back: card.back });
    await expect(
      learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        limit: 1,
      }),
    ).rejects.toThrow('Nenhum card');
    await learner.mutation(api.alphabet.restore, { id: card._id });
    const next = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    expect(
      (await learner.query(api.study.current, { sessionId: next._id }))
        .presentation?.snapshot,
    ).toMatchObject({
      contentVersion: 2,
      back: expect.stringContaining('Significado: água; líquido'),
    });
  });

  test('skips queued archived cards while allowing the already presented card to be answered', async () => {
    const { learner } = await setup();
    const first = await learner.mutation(api.alphabet.create, {
      card: { ...water, sortKey: 'a' },
    });
    const second = await learner.mutation(api.alphabet.create, {
      card: { ...water, symbol: '火', sortKey: 'b' },
    });
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 10,
    });
    await learner.mutation(api.alphabet.archive, { id: first._id });
    await learner.mutation(api.alphabet.archive, { id: second._id });
    expect(await answer(learner, session._id, 'incorrect')).toMatchObject({
      session: { total: 2, answered: 1, skipped: 1, status: 'completed' },
      presentation: null,
    });
    expect(
      await learner.query(api.study.progress, { cardId: second._id }),
    ).toBeNull();
  });

  test('isolates sessions, responses, per-card history and aggregate progress', async () => {
    const { backend, learner, other } = await setup();
    const card = await learner.mutation(api.alphabet.create, { card: water });
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    const { presentation } = await learner.query(api.study.current, {
      sessionId: session._id,
    });
    if (!presentation) throw new Error('Expected presentation');
    const args = { sessionId: session._id, presentationId: presentation._id };
    await expect(
      other.query(api.study.current, { sessionId: session._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(other.mutation(api.study.reveal, args)).rejects.toThrow(
      'UNAVAILABLE',
    );
    await expect(
      other.mutation(api.study.rate, { ...args, rating: 'correct' }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.study.finish, { sessionId: session._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.query(api.study.history, {
        cardId: card._id,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.query(api.study.progress, { cardId: card._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(backend.query(api.study.active, {})).rejects.toThrow(
      'UNAUTHENTICATED',
    );
    expect(await other.query(api.study.overview, {})).toEqual({
      attempts: 0,
      correct: 0,
      partial: 0,
      incorrect: 0,
      reviewedCards: 0,
    });
  });

  test('saves randomized ordering across reloads and applies explicit size and level filters', async () => {
    const { backend, learner } = await setup();
    for (const symbol of ['水', '火', '木', '土'])
      await learner.mutation(api.alphabet.create, {
        card: { ...water, symbol },
      });
    await learner.mutation(api.alphabet.create, {
      card: {
        ...water,
        symbol: '金',
        classifications: [{ scheme: 'jlpt', level: 'N1' }],
      },
    });
    await expect(
      learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        limit: 101,
      }),
    ).rejects.toThrow('VALIDATION');
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'random',
      level: 'N5',
      limit: 3,
    });
    const readQueue = () =>
      backend.run(async (ctx) =>
        ctx.db
          .query('studyPresentations')
          .withIndex('by_sessionId_and_position', (q) =>
            q.eq('sessionId', session._id),
          )
          .take(100),
      );
    const original = await readQueue();
    expect(original).toHaveLength(3);
    expect(new Set(original.map((row) => row.cardId)).size).toBe(3);
    expect(
      original.map((row) =>
        'symbol' in row.snapshot ? row.snapshot.symbol : null,
      ),
    ).not.toContain('金');
    expect(await readQueue()).toEqual(original);
    expect(
      (await learner.mutation(api.study.finish, { sessionId: session._id }))
        .status,
    ).toBe('ended');
    expect(await learner.query(api.study.overview, {})).toMatchObject({
      attempts: 0,
    });
  });

  test('adaptive study prioritizes mistakes over correct answers and includes new cards', async () => {
    const { learner } = await setup();
    const first = await learner.mutation(api.alphabet.create, {
      card: { ...water, sortKey: 'a' },
    });
    const second = await learner.mutation(api.alphabet.create, {
      card: { ...water, symbol: '火', sortKey: 'b' },
    });
    const initial = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 10,
    });
    await answer(learner, initial._id, 'correct');
    await answer(learner, initial._id, 'incorrect');
    const adaptive = await learner.mutation(api.study.start, {
      mode: 'adaptive',
      order: 'sorted',
      limit: 10,
    });
    expect(
      (await learner.query(api.study.current, { sessionId: adaptive._id }))
        .presentation?.cardId,
    ).toBe(second._id);
    await learner.mutation(api.study.finish, { sessionId: adaptive._id });
    const unseen = await learner.mutation(api.alphabet.create, {
      card: { ...water, symbol: '木' },
    });
    const next = await learner.mutation(api.study.start, {
      mode: 'adaptive',
      order: 'sorted',
      limit: 10,
    });
    expect(
      (await learner.query(api.study.current, { sessionId: next._id }))
        .presentation?.cardId,
    ).toBe(unseen._id);
    expect(
      (await learner.query(api.study.progress, { cardId: first._id }))?.correct,
    ).toBe(1);
  });

  const school: VocabularyContent = {
    language: 'ja',
    expression: '学校',
    reading: 'がっこう',
    readingOmitted: false,
    translations: { pt: ['escola'], en: ['school'] },
    examples: [],
    front: '学校',
    back: '読み方 · Leitura: がっこう\nPortuguês: escola\nEnglish: school',
    sortKey: 'がっこう',
    classifications: [{ scheme: 'jlpt', level: 'N5' }],
  };

  test('mixed direct sessions freeze derived alphabet and vocabulary faces once per card', async () => {
    const { backend, learner } = await setup();
    const kanji = await learner.mutation(api.alphabet.create, { card: water });
    const vocab = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'all',
      level: 'N5',
      limit: 10,
    });
    const queue = await backend.run((ctx) =>
      ctx.db
        .query('studyPresentations')
        .withIndex('by_sessionId_and_position', (q) =>
          q.eq('sessionId', session._id),
        )
        .take(10),
    );
    expect(queue.map(({ cardId }) => cardId)).toEqual([vocab._id, kanji._id]);
    expect(queue[0].snapshot).toEqual({
      ...school,
      category: 'vocabulary',
      contentVersion: 1,
    });
    expect(queue[1].snapshot).toMatchObject({
      symbol: '水',
      front: '水',
      contentVersion: 1,
    });
    expect(queue[1].snapshot).not.toHaveProperty('category');
    await answer(learner, session._id, 'partial');
    await answer(learner, session._id, 'correct');
    expect(
      await learner.query(api.study.progress, { cardId: vocab._id }),
    ).toMatchObject({ partial: 1, correct: 0, attempts: 1 });
    expect(
      await learner.query(api.study.progress, { cardId: kanji._id }),
    ).toMatchObject({ partial: 0, correct: 1, attempts: 1 });
    expect(await learner.query(api.study.overview, {})).toEqual({
      partial: 1,
      correct: 1,
      incorrect: 0,
      attempts: 2,
      reviewedCards: 2,
    });
  });

  test('explicit category and level filters isolate libraries while older Android start arguments stay alphabet-only', async () => {
    const { learner } = await setup();
    const kanji = await learner.mutation(api.alphabet.create, { card: water });
    const vocab = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    await learner.mutation(api.vocabulary.create, {
      card: {
        ...school,
        expression: '大学',
        reading: 'だいがく',
        classifications: [{ scheme: 'jlpt', level: 'N4' }],
      },
    });
    for (const filter of [
      { category: 'alphabet' as const },
      { writingSystem: 'Hani', language: 'ja' },
    ]) {
      const session = await learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        limit: 10,
        ...filter,
      });
      expect(session).toMatchObject({
        total: 1,
        filters: { category: 'alphabet' },
      });
      expect(
        (await learner.query(api.study.current, { sessionId: session._id }))
          .presentation?.cardId,
      ).toBe(kanji._id);
      await learner.mutation(api.study.finish, { sessionId: session._id });
    }
    const onlyVocabulary = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'vocabulary',
      level: 'N5',
      limit: 10,
    });
    expect(onlyVocabulary.total).toBe(1);
    expect(
      (
        await learner.query(api.study.current, {
          sessionId: onlyVocabulary._id,
        })
      ).presentation?.cardId,
    ).toBe(vocab._id);
    await learner.mutation(api.study.finish, { sessionId: onlyVocabulary._id });
    const combinedByDefault = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 10,
    });
    expect(combinedByDefault.total).toBe(3);
  });

  test('vocabulary edits and archival preserve the frozen snapshot, history and prior stats', async () => {
    const { learner } = await setup();
    const card = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'vocabulary',
      limit: 10,
    });
    await learner.mutation(api.vocabulary.update, {
      id: card._id,
      patch: { back: 'resposta atualizada', translations: { pt: ['colégio'] } },
    });
    expect(
      (await learner.query(api.study.current, { sessionId: session._id }))
        .presentation?.snapshot,
    ).toMatchObject({
      category: 'vocabulary',
      back: school.back,
      translations: school.translations,
      contentVersion: 1,
    });
    await answer(learner, session._id, 'correct');
    await learner.mutation(api.vocabulary.archive, { id: card._id });
    const history = await learner.query(api.study.history, {
      cardId: card._id,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(history.page[0].snapshot).toMatchObject({
      back: school.back,
      translations: school.translations,
      contentVersion: 1,
    });
    expect(
      await learner.query(api.study.progress, { cardId: card._id }),
    ).toMatchObject({ correct: 1, attempts: 1 });
    await expect(
      learner.mutation(api.study.start, {
        mode: 'direct',
        order: 'sorted',
        category: 'vocabulary',
        limit: 10,
      }),
    ).rejects.toThrow('Nenhum card');
    await learner.mutation(api.vocabulary.restore, { id: card._id });
    const next = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'vocabulary',
      limit: 10,
    });
    expect(
      (await learner.query(api.study.current, { sessionId: next._id }))
        .presentation?.snapshot,
    ).toMatchObject({
      back: '読み方 · Leitura: がっこう\nPortuguês: colégio\nEnglish: school',
      translations: { pt: ['colégio'], en: ['school'] },
      contentVersion: 2,
    });
  });

  test('queued vocabulary archival skips safely while an already revealed archived vocabulary can still be rated', async () => {
    const { learner } = await setup();
    const first = await learner.mutation(api.vocabulary.create, {
      card: { ...school, sortKey: 'a' },
    });
    const second = await learner.mutation(api.vocabulary.create, {
      card: {
        ...school,
        expression: '大学',
        reading: 'だいがく',
        sortKey: 'b',
      },
    });
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'all',
      limit: 10,
    });
    await learner.mutation(api.vocabulary.archive, { id: first._id });
    await learner.mutation(api.vocabulary.archive, { id: second._id });
    expect(await answer(learner, session._id, 'incorrect')).toMatchObject({
      session: { status: 'completed', answered: 1, skipped: 1 },
      presentation: null,
    });
    expect(
      await learner.query(api.study.progress, { cardId: second._id }),
    ).toBeNull();
  });

  test('mixed adaptive study ranks both categories with independent statistics and unchanged attempt identities', async () => {
    const { learner } = await setup();
    const kanji = await learner.mutation(api.alphabet.create, {
      card: {
        ...water,
        sortKey: 'ignored',
        details: { kind: 'kanji', kunYomi: ['あ'], onYomi: [], radicals: [] },
      },
    });
    const vocab = await learner.mutation(api.vocabulary.create, {
      card: { ...school, sortKey: 'b' },
    });
    const direct = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'all',
      limit: 10,
    });
    await answer(learner, direct._id, 'correct');
    await answer(learner, direct._id, 'incorrect');
    const adaptive = await learner.mutation(api.study.start, {
      mode: 'adaptive',
      order: 'sorted',
      category: 'all',
      limit: 10,
    });
    const current = await learner.query(api.study.current, {
      sessionId: adaptive._id,
    });
    expect(current.presentation?.cardId).toBe(vocab._id);
    const presentationId = current.presentation!._id;
    await answer(learner, adaptive._id, 'partial');
    await learner.mutation(api.study.rate, {
      sessionId: adaptive._id,
      presentationId,
      rating: 'partial',
    });
    expect(
      await learner.query(api.study.progress, { cardId: vocab._id }),
    ).toMatchObject({ incorrect: 1, partial: 1, attempts: 2 });
    expect(
      await learner.query(api.study.progress, { cardId: kanji._id }),
    ).toMatchObject({ correct: 1, attempts: 1 });
  });

  test('vocabulary study, progress and history are isolated across owners, including mixed sessions', async () => {
    const { learner, other } = await setup();
    const card = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    await expect(
      other.query(api.study.progress, { cardId: card._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.query(api.study.history, {
        cardId: card._id,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.study.start, {
        mode: 'adaptive',
        order: 'sorted',
        category: 'all',
        limit: 10,
      }),
    ).rejects.toThrow('Nenhum card');
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'vocabulary',
      limit: 10,
    });
    const current = await learner.query(api.study.current, {
      sessionId: session._id,
    });
    const args = {
      sessionId: session._id,
      presentationId: current.presentation!._id,
    };
    await expect(other.mutation(api.study.reveal, args)).rejects.toThrow(
      'UNAVAILABLE',
    );
    await expect(
      other.mutation(api.study.rate, { ...args, rating: 'correct' }),
    ).rejects.toThrow('UNAVAILABLE');
    expect(await other.query(api.study.overview, {})).toMatchObject({
      attempts: 0,
      reviewedCards: 0,
    });
  });
});
