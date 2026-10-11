import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { QuestCreateInput } from './questsValidators';
import type { OfflineCommand } from './offlineValidators';
import { creditForOwner, undoStudyForOwner } from './questsDomain';
import { createTestBackend, learnerIdentity } from './test-support.helpers';
import type { PaperInput } from '../../shared/jlpt';

const DAY = 86_400_000,
  START = Date.UTC(2026, 9, 10, 12);
afterEach(() => vi.restoreAllMocks());
const water = {
  language: 'ja',
  writingSystem: 'Hani',
  symbol: '水',
  meanings: ['água'],
  examples: [],
  front: '水',
  back: 'água',
  sortKey: 'みず',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
  details: {
    kind: 'kanji' as const,
    kunYomi: ['みず'],
    onYomi: ['スイ'],
    radicals: ['水'],
  },
};
const paper: PaperInput = {
  title: 'Treino',
  level: 'N5',
  description: '',
  source: 'Autoral',
  questions: [
    {
      id: 'vocabulary',
      skill: 'vocabulary',
      kind: 'kanji_reading',
      prompt: '水？',
      choices: ['みず', 'やま', 'ひ', 'つき'],
      correctChoice: 0,
      explanation: 'Água.',
    },
    {
      id: 'grammar',
      skill: 'grammar',
      kind: 'grammar_form',
      prompt: '学校（ ）行く',
      choices: ['へ', 'を', 'の', 'で'],
      correctChoice: 0,
      explanation: 'Direção.',
    },
    {
      id: 'reading',
      skill: 'reading',
      kind: 'short_passage',
      prompt: 'いつ？',
      passage: '明日行く。',
      choices: ['明日', '今日', '昨日', '毎日'],
      correctChoice: 0,
      explanation: 'Amanhã.',
    },
    {
      id: 'listening',
      skill: 'listening',
      kind: 'quick_response',
      prompt: '聞いてください。',
      audioUrl: 'https://example.com/audio.mp3',
      choices: ['はい', 'いいえ', 'ありがとう'],
      correctChoice: 0,
      explanation: 'Sim.',
    },
  ],
};
async function setup() {
  const clock = { now: START };
  vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
  const backend = createTestBackend(),
    learner = backend.withIdentity(learnerIdentity),
    other = backend.withIdentity({
      ...learnerIdentity,
      subject: 'other',
      tokenIdentifier: 'other',
    });
  const owner = await learner.mutation(api.users.ensureCurrentUser, {});
  await other.mutation(api.users.ensureCurrentUser, {});
  const first = await learner.mutation(api.alphabet.create, { card: water });
  const second = await learner.mutation(api.alphabet.create, {
    card: { ...water, symbol: '火', meanings: ['fogo'], sortKey: 'ひ' },
  });
  let key = 0;
  const input = (patch: Partial<QuestCreateInput> = {}): QuestCreateInput => ({
    clientKey: `quest-key-${++key}`,
    title: 'Minha prática',
    startsAt: START - DAY,
    dueAt: START + DAY,
    timeZone: 'America/Sao_Paulo',
    cardIds: [first._id, second._id],
    ...patch,
  });
  return { clock, backend, learner, other, owner, input, first, second };
}
type Learner = Awaited<ReturnType<typeof setup>>['learner'];
const questId = (id: string) => id as Id<'quests'>;
async function begin(learner: Learner, id: string) {
  const start = await learner.mutation(api.quests.start, { id: questId(id) });
  if (start.kind !== 'study') throw new Error('Expected study');
  return start.sessionId;
}
async function answer(learner: Learner, sessionId: Id<'studySessions'>) {
  const { presentation, session } = await learner.query(api.study.current, {
    sessionId,
  });
  const args = {
    sessionId,
    presentationId: presentation!._id,
    expectedRevision: session.revision ?? 0,
  };
  await learner.mutation(api.study.reveal, args);
  await learner.mutation(api.study.rate, { ...args, rating: 'partial' });
  return args;
}
describe('personal exact-target quests', () => {
  test('routes a mixed quest through exact cards, papers and stories and completes only after all three', async () => {
    const { learner, input, first, clock } = await setup();
    const selectedPaper = await learner.mutation(api.jlpt.create, { paper });
    const story = await learner.mutation(api.stories.create, {
      clientKey: 'mixed-story-target',
      story: {
        title: '山',
        level: 'N4',
        paragraphs: [
          {
            id: 'p1',
            segments: [{ text: '山へ行く。' }],
            translation: 'Vou à montanha.',
          },
        ],
        questions: [
          {
            id: 'q1',
            prompt: 'Onde?',
            options: [
              { id: 'a', text: 'Montanha' },
              { id: 'b', text: 'Mar' },
            ],
            correctOptionId: 'a',
          },
        ],
      },
    });
    const quest = await learner.mutation(
      api.quests.create,
      input({
        cardIds: [first._id],
        paperIds: [selectedPaper._id],
        storyIds: [story.id],
      }),
    );
    const id = questId(quest.id);
    await answer(learner, await begin(learner, quest.id));
    const second = await learner.mutation(api.quests.start, { id });
    if (second.kind !== 'shiken') throw new Error('Expected Shiken');
    const attempt = await learner.query(api.jlpt.getAttempt, {
      id: second.attemptId,
    });
    await learner.mutation(api.jlpt.finish, {
      attemptId: second.attemptId,
      expectedRevision: attempt!.revision,
    });
    expect(
      (await learner.query(api.quests.get, { id }))?.completedAt,
    ).toBeUndefined();
    expect(await learner.mutation(api.quests.start, { id })).toEqual({
      kind: 'story',
      storyId: story.id,
      questId: id,
    });
    const storyId = story.id as Id<'stories'>;
    await learner.mutation(api.stories.answer, {
      id: storyId,
      questId: id,
      questionId: 'q1',
      optionId: 'b',
    });
    expect(
      (await learner.query(api.quests.get, { id }))?.completedAt,
    ).toBeUndefined();
    clock.now++;
    await learner.mutation(api.stories.complete, { id: storyId, questId: id });
    expect(await learner.query(api.quests.get, { id })).toMatchObject({
      completedCardIds: [first._id],
      completedPaperIds: [selectedPaper._id],
      completedStoryIds: [storyId],
      completedAt: clock.now,
    });
  });
  test('creates an immutable ordered selection idempotently and isolates accounts', async () => {
    const { learner, other, backend, input, clock, first, second } =
      await setup();
    const request = input({ cardIds: [second._id, first._id] });
    const created = await learner.mutation(api.quests.create, request);
    expect(created.cardIds).toEqual(request.cardIds);
    expect(await learner.mutation(api.quests.create, request)).toEqual(created);
    await expect(
      learner.mutation(api.quests.create, {
        ...request,
        cardIds: [first._id, second._id],
      }),
    ).rejects.toThrow('outro conteúdo');
    expect(
      await other.query(api.quests.get, { id: questId(created.id) }),
    ).toBeNull();
    await expect(
      other.mutation(api.quests.start, { id: questId(created.id) }),
    ).rejects.toThrow('indisponível');
    await expect(
      other.mutation(api.quests.cancel, { id: questId(created.id) }),
    ).rejects.toThrow('indisponível');
    await expect(backend.query(api.quests.snapshot, {})).rejects.toThrow(
      'Entre',
    );
    clock.now += 1000;
    const cancelled = await learner.mutation(api.quests.cancel, {
      id: questId(created.id),
    });
    expect(cancelled.cancelledAt).toBe(clock.now);
    clock.now += 4 * DAY;
    expect(await learner.mutation(api.quests.create, request)).toEqual(
      cancelled,
    );
    expect(await learner.query(api.quests.snapshot, {})).toEqual({
      quests: [],
      hasMoreHistory: true,
    });
    expect(
      (
        await learner.query(api.quests.list, {
          paginationOpts: { numItems: 1, cursor: null },
          status: 'cancelled',
        })
      ).page,
    ).toEqual([cancelled]);
  });
  test('validates active owned unique targets, window and IANA time zone', async () => {
    const { learner, other, backend, input, first, second } = await setup();
    const foreign = await other.mutation(api.alphabet.create, { card: water }),
      foreignPaper = await other.mutation(api.jlpt.create, { paper });
    await backend.run((ctx) =>
      ctx.db.patch('alphabetCards', second._id, { archived: true }),
    );
    const patches: Partial<QuestCreateInput>[] = [
      { timeZone: 'Not/A_Zone' },
      { timeZone: '+03:00' },
      { dueAt: START - 1 },
      { dueAt: START + 91 * DAY },
      { cardIds: [], paperIds: [] },
      { cardIds: [first._id, first._id] },
      { cardIds: [foreign._id] },
      { cardIds: [second._id] },
      { cardIds: [], paperIds: [foreignPaper._id] },
    ];
    for (const patch of patches)
      await expect(
        learner.mutation(api.quests.create, input(patch)),
      ).rejects.toThrow();
    const scheduled = await learner.mutation(
      api.quests.create,
      input({
        cardIds: [first._id],
        startsAt: START + DAY,
        dueAt: START + 15 * DAY,
        timeZone: 'Asia/Tokyo',
      }),
    );
    await expect(begin(learner, scheduled.id)).rejects.toThrow('período');
  });
  test('starts the exact mixed order, resumes the same quest and switches without crediting unrelated practice', async () => {
    const { learner, input, first, second } = await setup();
    const vocabulary = await learner.mutation(api.vocabulary.create, {
      card: {
        language: 'ja',
        expression: '学校',
        reading: 'がっこう',
        translations: { pt: ['escola'] },
        examples: [],
        classifications: [{ scheme: 'jlpt', level: 'N5' }],
      },
    });
    const grammar = await learner.mutation(api.grammar.create, {
      card: {
        language: 'ja',
        title: '〜てもいい',
        explanation: 'Permissão',
        classifications: [{ scheme: 'jlpt', level: 'N5' }],
      },
    });
    const exact = [grammar._id, first._id, vocabulary._id];
    const quest = await learner.mutation(
      api.quests.create,
      input({ cardIds: exact }),
    );
    const ordinary = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    await answer(learner, ordinary._id);
    expect(
      (await learner.query(api.quests.get, { id: questId(quest.id) }))!
        .completedCardIds,
    ).toEqual([]);
    const sessionId = await begin(learner, quest.id);
    expect(await begin(learner, quest.id)).toBe(sessionId);
    expect(
      (await learner.query(api.study.current, { sessionId })).session,
    ).toMatchObject({ questId: quest.id, mode: 'direct', filters: {} });
    const presentations = await learner.query(api.study.current, { sessionId });
    expect(presentations.presentation!.cardId).toBe(grammar._id);
    await answer(learner, sessionId);
    const otherQuest = await learner.mutation(
      api.quests.create,
      input({ cardIds: [second._id] }),
    );
    const otherSession = await begin(learner, otherQuest.id);
    expect(otherSession).not.toBe(sessionId);
    const resumed = await begin(learner, quest.id);
    expect(
      (await learner.query(api.study.current, { sessionId: resumed }))
        .presentation!.cardId,
    ).toBe(first._id);
    await answer(learner, resumed);
    expect(
      (await learner.query(api.study.current, { sessionId: resumed }))
        .presentation!.cardId,
    ).toBe(vocabulary._id);
    await answer(learner, resumed);
    expect(
      (await learner.query(api.quests.get, { id: questId(quest.id) }))!
        .completedCardIds,
    ).toEqual(exact);
  });
  test('reverses undo before completion and freezes earned completion including its date', async () => {
    const { learner, input, clock, first } = await setup();
    const quest = await learner.mutation(api.quests.create, input()),
      sessionId = await begin(learner, quest.id);
    clock.now += 10;
    const firstAnswer = await answer(learner, sessionId);
    expect(
      (await learner.query(api.quests.get, { id: questId(quest.id) }))!
        .completedCardIds,
    ).toEqual([first._id]);
    await learner.mutation(api.study.undo, firstAnswer);
    expect(
      (await learner.query(api.quests.get, { id: questId(quest.id) }))!
        .completedCardIds,
    ).toEqual([]);
    await answer(learner, sessionId);
    clock.now += 10;
    const secondAnswer = await answer(learner, sessionId);
    const completed = (await learner.query(api.quests.get, {
      id: questId(quest.id),
    }))!;
    expect(completed.completedAt).toBe(clock.now);
    await learner.mutation(api.study.undo, secondAnswer);
    expect(
      await learner.query(api.quests.get, { id: questId(quest.id) }),
    ).toEqual(completed);
    expect(
      await learner.mutation(api.quests.cancel, { id: questId(quest.id) }),
    ).toEqual(completed);
  });
  test('deduplicates targets but retains separate contributions until the last source is undone', async () => {
    const { learner, input, backend, owner, first, second } = await setup();
    const quest = await learner.mutation(api.quests.create, input());
    const activity = {
      questId: quest.id,
      kind: 'study' as const,
      cardId: first._id,
      occurredAt: START + 1,
    };
    for (const sourceId of ['source-first', 'source-repeat', 'source-repeat'])
      await backend.run((ctx) =>
        creditForOwner(ctx, owner._id, { ...activity, sourceId }),
      );
    expect(
      (await learner.query(api.quests.get, { id: questId(quest.id) }))!
        .completedCardIds,
    ).toEqual([first._id]);
    expect(
      await backend.run((ctx) => ctx.db.query('questContributions').collect()),
    ).toHaveLength(2);
    await backend.run((ctx) =>
      undoStudyForOwner(ctx, owner._id, 'source-first', START + 2),
    );
    expect(
      (await learner.query(api.quests.get, { id: questId(quest.id) }))!
        .completedCardIds,
    ).toEqual([first._id]);
    await backend.run((ctx) =>
      undoStudyForOwner(ctx, owner._id, 'source-repeat', START + 3),
    );
    expect(
      (await learner.query(api.quests.get, { id: questId(quest.id) }))!
        .completedCardIds,
    ).toEqual([]);
    const other = await learner.mutation(
      api.quests.create,
      input({ cardIds: [second._id] }),
    );
    await backend.run((ctx) =>
      creditForOwner(ctx, owner._id, {
        ...activity,
        questId: other.id,
        sourceId: 'not-selected',
      }),
    );
    expect(
      (await learner.query(api.quests.get, { id: questId(other.id) }))!
        .completedCardIds,
    ).toEqual([]);
  });
  test('returns current affected quests on a lost ACK replay and corrects cancelled optimistic credit', async () => {
    const { learner, input, clock, backend, first } = await setup();
    const quest = await learner.mutation(api.quests.create, input()),
      sessionId = await begin(learner, quest.id);
    const current = await learner.query(api.study.current, { sessionId });
    const fields = {
      sessionId,
      presentationId: current.presentation!._id,
      expectedRevision: 0,
      occurredAt: START + 10,
    };
    clock.now += 100;
    await learner.mutation(api.offline.apply, {
      operationId: 'quest-reveal-first',
      command: { type: 'study.reveal', ...fields },
    });
    const command: OfflineCommand = {
      type: 'study.rate',
      ...fields,
      rating: 'incorrect',
    };
    const reply = await learner.mutation(api.offline.apply, {
      operationId: 'quest-rate-first',
      command,
    });
    expect(reply.quests![0].completedCardIds).toEqual([first._id]);
    const cancelled = await learner.mutation(api.quests.cancel, {
      id: questId(quest.id),
    });
    expect(
      (
        await learner.mutation(api.offline.apply, {
          operationId: 'quest-rate-first',
          command,
        })
      ).quests,
    ).toEqual([cancelled]);
    expect(
      (
        await learner.mutation(api.offline.apply, {
          operationId: 'quest-rate-equivalent-retry',
          command,
        })
      ).quests,
    ).toEqual([cancelled]);
    expect(
      await backend.run((ctx) => ctx.db.query('studyAttempts').collect()),
    ).toHaveLength(1);
    const next = {
      ...fields,
      presentationId: (await learner.query(api.study.current, { sessionId }))
        .presentation!._id,
      occurredAt: START + 20,
    };
    await learner.mutation(api.offline.apply, {
      operationId: 'quest-reveal-next',
      command: { type: 'study.reveal', ...next },
    });
    expect(
      (
        await learner.mutation(api.offline.apply, {
          operationId: 'quest-rate-next',
          command: { type: 'study.rate', ...next, rating: 'correct' },
        })
      ).quests,
    ).toEqual([cancelled]);
  });
  test('accepts exact offline prefixes and sequential batches, rejecting substitutions and foreign quests', async () => {
    const { learner, other, input, first, second } = await setup();
    const quest = await learner.mutation(api.quests.create, input());
    const start: Extract<OfflineCommand, { type: 'study.start' }> = {
      type: 'study.start',
      questId: quest.id,
      localId: 'local:quest-session-001',
      createdAt: START,
      mode: 'direct',
      order: 'sorted',
      filters: {},
      queue: [
        {
          localId: 'local:quest-presentation-001',
          cardId: first._id,
          snapshot: { ...water, contentVersion: 1 },
        },
      ],
    };
    await expect(
      other.mutation(api.offline.apply, {
        operationId: 'foreign-quest-start',
        command: start,
      }),
    ).rejects.toThrow('indisponível');
    await expect(
      learner.mutation(api.offline.apply, {
        operationId: 'wrong-quest-order',
        command: {
          ...start,
          queue: [{ ...start.queue[0], cardId: second._id }],
        },
      }),
    ).rejects.toThrow();
    const result = await learner.mutation(api.offline.apply, {
      operationId: 'exact-quest-start',
      command: start,
    });
    expect(result.session!.questId).toBe(quest.id);
    const fields = {
      sessionId: start.localId,
      presentationId: start.queue[0].localId,
      expectedRevision: 0,
      occurredAt: START,
    };
    await learner.mutation(api.offline.apply, {
      operationId: 'exact-quest-reveal',
      command: { type: 'study.reveal', ...fields },
    });
    await learner.mutation(api.offline.apply, {
      operationId: 'exact-quest-rate',
      command: { type: 'study.rate', ...fields, rating: 'correct' },
    });
    const next: typeof start = {
      ...start,
      localId: 'local:quest-session-002',
      queue: [
        {
          localId: 'local:quest-presentation-002',
          cardId: second._id,
          snapshot: {
            ...water,
            symbol: '火',
            meanings: ['fogo'],
            sortKey: 'ひ',
            contentVersion: 1,
          },
        },
      ],
    };
    const resumed = await learner.mutation(api.offline.apply, {
      operationId: 'exact-quest-next-batch',
      command: next,
    });
    expect(resumed.session!.questId).toBe(quest.id);
    expect(
      (
        await learner.mutation(api.offline.apply, {
          operationId: 'exact-quest-start',
          command: start,
        })
      ).session!._id,
    ).toBe(result.session!._id);
  });
  test('keeps started card snapshots after archival but fails clearly when an unstarted target is unavailable', async () => {
    const { learner, input, backend, first, second } = await setup();
    const quest = await learner.mutation(api.quests.create, input()),
      sessionId = await begin(learner, quest.id);
    await backend.run((ctx) =>
      ctx.db.patch('alphabetCards', second._id, { archived: true }),
    );
    await answer(learner, sessionId);
    const next = await learner.query(api.study.current, { sessionId });
    expect(next.presentation!.cardId).toBe(second._id);
    expect(next.presentation!.answeredAt).toBeUndefined();
    await answer(learner, sessionId);
    expect(
      (await learner.query(api.quests.get, { id: questId(quest.id) }))!
        .completedAt,
    ).toBeDefined();
    const unavailable = await learner.mutation(
      api.quests.create,
      input({ cardIds: [first._id] }),
    );
    await backend.run((ctx) =>
      ctx.db.patch('alphabetCards', first._id, { archived: true }),
    );
    await expect(begin(learner, unavailable.id)).rejects.toThrow(
      'Nenhum item foi substituído',
    );
  });
  test('creates more than 100 targets and completes the exact selection across technical batches', async () => {
    const { learner, input, backend, owner, first } = await setup();
    const ids = await backend.run(async (ctx) => {
      const { _id, _creationTime, ...fields } = first;
      void _id;
      void _creationTime;
      const ids: Id<'alphabetCards'>[] = [];
      for (let i = 0; i < 101; i++)
        ids.push(
          await ctx.db.insert('alphabetCards', {
            ...fields,
            symbol: '水' + i,
            sortKey: String(i),
          }),
        );
      return ids;
    });
    const quest = await learner.mutation(
      api.quests.create,
      input({ cardIds: ids }),
    );
    const firstSession = await begin(learner, quest.id);
    const presentations = await backend.run((ctx) =>
      ctx.db
        .query('studyPresentations')
        .withIndex('by_sessionId_and_position', (q) =>
          q.eq('sessionId', firstSession),
        )
        .collect(),
    );
    expect(presentations.map((p) => p.cardId)).toEqual(ids.slice(0, 100));
    // Simulate retained server contributions beyond the mobile 100-event history cache.
    for (const [index, cardId] of ids.slice(0, 100).entries())
      await backend.run((ctx) =>
        creditForOwner(ctx, owner._id, {
          questId: quest.id,
          kind: 'study',
          cardId,
          sourceId: 'history-' + index,
          occurredAt: START,
        }),
      );
    await learner.mutation(api.study.finish, { sessionId: firstSession });
    const lastSession = await begin(learner, quest.id);
    expect(
      (await learner.query(api.study.current, { sessionId: lastSession }))
        .presentation!.cardId,
    ).toBe(ids[100]);
    await answer(learner, lastSession);
    expect(
      (await learner.query(api.quests.get, { id: questId(quest.id) }))!
        .completedCardIds,
    ).toEqual(ids);
  });
  test('requires both exact cards and exact papers; unrelated exams never count or get implicitly finished', async () => {
    const { learner, input, first, clock } = await setup();
    const selected = await learner.mutation(api.jlpt.create, { paper }),
      secondPaper = await learner.mutation(api.jlpt.create, {
        paper: { ...paper, title: 'Outro selecionado' },
      });
    const quest = await learner.mutation(
      api.quests.create,
      input({
        cardIds: [first._id],
        paperIds: [selected._id, secondPaper._id],
      }),
    );
    const ordinary = await learner.mutation(api.jlpt.start, {
      paperId: selected._id,
    });
    await answer(learner, await begin(learner, quest.id));
    await expect(
      learner.mutation(api.quests.start, { id: questId(quest.id) }),
    ).rejects.toThrow('outro simulado');
    expect(
      (await learner.query(api.jlpt.getAttempt, { id: ordinary._id }))!.status,
    ).toBe('active');
    await learner.mutation(api.jlpt.finish, {
      attemptId: ordinary._id,
      expectedRevision: ordinary.revision,
    });
    expect(
      (await learner.query(api.quests.get, { id: questId(quest.id) }))!
        .completedPaperIds,
    ).toEqual([]);
    const start = await learner.mutation(api.quests.start, {
      id: questId(quest.id),
    });
    if (start.kind !== 'shiken') throw new Error('Expected Shiken');
    expect(
      await learner.mutation(api.quests.start, { id: questId(quest.id) }),
    ).toEqual(start);
    let attempt = await learner.query(api.jlpt.getAttempt, {
      id: start.attemptId,
    });
    if (!attempt) throw new Error('Expected attempt');
    expect(attempt).toMatchObject({ questId: quest.id, paperId: selected._id });
    while (attempt.status === 'active') {
      clock.now += 10;
      attempt = await learner.mutation(api.jlpt.advance, {
        attemptId: attempt._id,
        expectedRevision: attempt.revision,
      });
    }
    expect(
      (await learner.query(api.quests.get, { id: questId(quest.id) }))!
        .completedPaperIds,
    ).toEqual([selected._id]);
    const next = await learner.mutation(api.quests.start, {
      id: questId(quest.id),
    });
    if (next.kind !== 'shiken') throw new Error('Expected Shiken');
    const current = await learner.query(api.jlpt.getAttempt, {
      id: next.attemptId,
    });
    if (!current) throw new Error('Expected attempt');
    clock.now += 10;
    const command: OfflineCommand = {
      type: 'jlpt.finish',
      attemptId: current._id,
      expectedRevision: current.revision,
      occurredAt: clock.now,
    };
    const reply = await learner.mutation(api.offline.apply, {
      operationId: 'quest-finish-paper',
      command,
    });
    expect(reply.quests![0]).toMatchObject({
      completedCardIds: [first._id],
      completedPaperIds: [selected._id, secondPaper._id],
      completedAt: clock.now,
    });
    expect(
      (
        await learner.mutation(api.offline.apply, {
          operationId: 'quest-finish-paper',
          command,
        })
      ).quests,
    ).toEqual(reply.quests);
  });
  test('uses activity time for delayed offline completion and excludes dates outside the occurrence', async () => {
    const { learner, input, backend, owner, clock, first, second } =
      await setup();
    const quest = await learner.mutation(
      api.quests.create,
      input({ dueAt: START + 100 }),
    );
    clock.now = START + 3 * DAY;
    for (const occurredAt of [START - 1, START + 100])
      await backend.run((ctx) =>
        creditForOwner(ctx, owner._id, {
          questId: quest.id,
          kind: 'study',
          cardId: first._id,
          sourceId: 'outside-' + occurredAt,
          occurredAt,
        }),
      );
    expect(
      (await learner.query(api.quests.get, { id: questId(quest.id) }))!
        .completedCardIds,
    ).toEqual([]);
    await backend.run((ctx) =>
      creditForOwner(ctx, owner._id, {
        questId: quest.id,
        kind: 'study',
        cardId: first._id,
        sourceId: 'newer',
        occurredAt: START + 90,
      }),
    );
    const result = await backend.run((ctx) =>
      creditForOwner(ctx, owner._id, {
        questId: quest.id,
        kind: 'study',
        cardId: second._id,
        sourceId: 'older',
        occurredAt: START + 10,
      }),
    );
    expect(result[0].completedAt).toBe(START + 90);
  });
  test('keeps recent completions independently of old deadlines and pages older history explicitly', async () => {
    const { learner, input, backend } = await setup();
    const quest = await learner.mutation(api.quests.create, input());
    await backend.run((ctx) =>
      ctx.db.patch('quests', questId(quest.id), {
        dueAt: START - 3 * DAY,
        completedAt: START,
        status: 'completed',
        completedCardIds: quest.cardIds,
      }),
    );
    const snapshot = await learner.query(api.quests.snapshot, {});
    expect(snapshot.quests).toHaveLength(1);
    expect(snapshot.quests[0].completedAt).toBe(START);
    expect(snapshot.hasMoreHistory).toBe(false);
    expect((await learner.query(api.offline.state, {})).quests).toEqual(
      snapshot.quests,
    );
    const seed = await backend.run((ctx) =>
      ctx.db.get('quests', questId(quest.id)),
    );
    await backend.run(async (ctx) => {
      const { _id, _creationTime, ...fields } = seed!;
      void _id;
      void _creationTime;
      for (let i = 0; i < 205; i++)
        await ctx.db.insert('quests', {
          ...fields,
          clientKey: 'old-quest-' + i,
          createdAt: START - 10 * DAY,
          startsAt: START - 10 * DAY,
          completedAt: START - 9 * DAY,
        });
    });
    expect((await learner.query(api.quests.snapshot, {})).hasMoreHistory).toBe(
      true,
    );
    const one = await learner.query(api.quests.list, {
      paginationOpts: { numItems: 50, cursor: null },
    });
    const two = await learner.query(api.quests.list, {
      paginationOpts: { numItems: 50, cursor: one.continueCursor },
    });
    expect(new Set([...one.page, ...two.page].map((q) => q.id)).size).toBe(100);
  });
  test('allows independent overlapping quests without a daily quota and bounds only the downloaded cache', async () => {
    const { learner, input, backend, first } = await setup();
    for (let i = 0; i < 21; i++)
      await learner.mutation(
        api.quests.create,
        input({ cardIds: [first._id] }),
      );
    const snapshot = await learner.query(api.quests.snapshot, {});
    expect(snapshot.quests).toHaveLength(21);
    await answer(learner, await begin(learner, snapshot.quests[0].id));
    expect(
      (await learner.query(api.quests.snapshot, {})).quests.filter(
        (q) => q.completedAt !== undefined,
      ),
    ).toHaveLength(1);
    const seed = await backend.run((ctx) => ctx.db.query('quests').first());
    await backend.run(async (ctx) => {
      const { _id, _creationTime, ...fields } = seed!;
      void _id;
      void _creationTime;
      for (let i = 0; i < 180; i++)
        await ctx.db.insert('quests', {
          ...fields,
          clientKey: 'overfull-' + i,
        });
    });
    await expect(learner.query(api.quests.snapshot, {})).rejects.toThrow(
      '200 quests',
    );
    expect(
      (
        await learner.query(api.quests.list, {
          paginationOpts: { numItems: 50, cursor: null },
        })
      ).page,
    ).toHaveLength(50);
  });
});
