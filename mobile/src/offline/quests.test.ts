import { describe, expect, it } from 'vitest';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import type { OfflineCommand } from '../../../backend/convex/offlineValidators';
import type { QuestSnapshot } from '../../../shared/quests';
import { applyStoryProgress, type StoryRecord } from '../../../shared/stories';
import { OfflineEngine, type Reply } from './engine';
import {
  applyLocal,
  clone,
  emptyData,
  projection,
  type Card,
  type Data,
  type Saved,
} from './model';
import { creditLocalQuests } from './quests';

const owner = 'owner' as Id<'users'>;
function kanji(index: number): Doc<'alphabetCards'> {
  return {
    _id: `kanji-${index}` as Id<'alphabetCards'>,
    _creationTime: index,
    ownerId: owner,
    language: 'ja',
    writingSystem: 'Hani',
    symbol: String.fromCharCode(0x4e00 + index),
    meanings: ['significado'],
    examples: [],
    front: '字',
    back: 'significado',
    sortKey: 'じ',
    classifications: [{ scheme: 'jlpt', level: 'N5' }],
    details: { kind: 'kanji', kunYomi: ['じ'], onYomi: [], radicals: [] },
    archived: false,
    contentVersion: 1,
    createdAt: index,
    updatedAt: index,
  };
}
const kotoba: Doc<'vocabularyCards'> = {
  _id: 'kotoba' as Id<'vocabularyCards'>,
  _creationTime: 2,
  ownerId: owner,
  language: 'ja',
  expression: '学校',
  reading: 'がっこう',
  translations: { pt: ['escola'], en: [] },
  examples: [],
  front: '学校',
  back: 'escola',
  sortKey: 'がっこう',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
  expressionKey: '学校',
  readingKey: 'がっこう',
  archived: false,
  contentVersion: 1,
  createdAt: 2,
  updatedAt: 2,
};
const bunpou: Doc<'grammarCards'> = {
  _id: 'bunpou' as Id<'grammarCards'>,
  _creationTime: 3,
  ownerId: owner,
  language: 'ja',
  title: '〜てもいい',
  explanation: 'Permissão',
  examples: [],
  front: '〜てもいい',
  back: 'Permissão',
  sortKey: '3',
  readingSortKey: '3',
  classifications: [{ scheme: 'jlpt', level: 'N4' }],
  archived: false,
  contentVersion: 1,
  createdAt: 3,
  updatedAt: 3,
};
function quest(
  cardIds: string[],
  patch: Partial<QuestSnapshot> = {},
): QuestSnapshot {
  return {
    id: 'quest-one',
    title: 'Minha seleção',
    startsAt: 1,
    dueAt: 1_000_000,
    timeZone: 'America/Sao_Paulo',
    createdAt: 1,
    updatedAt: 1,
    cardIds,
    paperIds: [],
    completedCardIds: [],
    completedPaperIds: [],
    ...patch,
  };
}
function base(cards: Card[], quests: QuestSnapshot[]): Data {
  return { ...emptyData({ _id: owner, name: 'Estudante' }), cards, quests };
}
function reading(id = 'story-one'): StoryRecord {
  return {
    id,
    title: '山へ',
    level: 'N4',
    createdAt: 1,
    updatedAt: 1,
    contentVersion: 1,
    archived: false,
    paragraphs: [
      {
        id: 'p1',
        segments: [{ text: '山へ行く。' }],
        translation: 'Ir à montanha.',
      },
      {
        id: 'p2',
        segments: [{ text: '朝です。' }],
        translation: 'É de manhã.',
      },
    ],
    questions: [
      {
        id: 'q1',
        prompt: 'どこへ？',
        options: [
          { id: 'a', text: '山' },
          { id: 'b', text: '海' },
        ],
        correctOptionId: 'a',
      },
    ],
  };
}
function harness(data: Data) {
  let disk: Saved = {
    version: 1,
    accountKey: 'owner',
    base: clone(data),
    queue: [],
    aliases: {},
    lastSyncedAt: 1,
  };
  let counter = 0;
  let now = 100;
  const deps = {
    accountKey: 'owner',
    uuid: () => `command-${++counter}`,
    now: () => now++,
    storage: {
      read: async () => clone(disk),
      write: async (value: Saved) => {
        disk = clone(value);
      },
    },
  };
  return {
    engine: new OfflineEngine(deps),
    restart: () => new OfflineEngine(deps),
    disk: () => disk,
    setNow: (value: number) => {
      now = value;
    },
  };
}
async function start(engine: OfflineEngine, id = 'quest-one') {
  return (await engine.mutate('quests:start', { id })) as {
    kind: 'study';
    sessionId: Id<'studySessions'>;
  };
}
async function answer(engine: OfflineEngine, sessionId: Id<'studySessions'>) {
  const current = projection(engine.getSnapshot().data!, sessionId);
  const args = {
    sessionId,
    presentationId: current.presentation!._id,
    expectedRevision: current.session.revision ?? 0,
  };
  await engine.mutate('study:reveal', args);
  await engine.mutate('study:rate', { ...args, rating: 'incorrect' });
  return args;
}

describe('predetermined quest sets offline', () => {
  it('keeps already-journaled reading work when a remote quest becomes terminal before its first acknowledgement', async () => {
    for (const terminal of [
      { cancelledAt: 200 },
      { completedAt: 200, completedStoryIds: ['story-one', 'story-two'] },
    ]) {
      const selected = quest([], { storyIds: ['story-one', 'story-two'] });
      const h = harness({
        ...base([], [selected]),
        stories: [reading(), reading('story-two')],
      });
      await h.engine.load();
      await h.engine.mutate('quests:start', { id: selected.id });
      await h.engine.mutate('stories:answer', {
        id: 'story-one',
        questId: selected.id,
        questionId: 'q1',
        optionId: 'b',
      });
      const pending = clone(h.disk().queue);
      await h.engine.acceptRemoteStory(
        { ...reading('story-two'), questId: selected.id },
        null,
        { ...selected, ...terminal, updatedAt: 200 },
      );
      expect(h.disk().queue).toEqual(pending);
      expect(
        h.engine
          .getSnapshot()
          .data!.storyProgress!.find(
            (p) => p.storyId === 'story-one' && p.questId === selected.id,
          )?.answers[0].optionId,
      ).toBe('b');
      await expect(
        h.engine.mutate('quests:start', { id: selected.id }),
      ).rejects.toThrow();
      const restarted = h.restart();
      await restarted.load();
      expect(restarted.getSnapshot().status.error).toBeNull();
      expect(restarted.getSnapshot().status.pending).toBe(2);
    }
  });

  it('keeps a just-started offline quest on its edition while a newer online response is in flight', async () => {
    const original = reading();
    const initial = {
      ...base([], [quest([], { storyIds: [original.id] })]),
      stories: [original],
    };
    const h = harness(initial);
    await h.engine.load();
    await h.engine.mutate('quests:start', { id: 'quest-one' });
    const before = clone(h.disk());
    await h.engine.acceptRemoteStory(
      { ...original, questId: 'quest-one', contentVersion: 2, updatedAt: 200 },
      null,
    );
    expect(h.disk()).toEqual(before);
    expect(
      h.engine
        .getSnapshot()
        .data!.stories!.find((s) => s.questId === 'quest-one')?.contentVersion,
    ).toBe(1);
    await h.engine.mutate('stories:answer', {
      id: original.id,
      questId: 'quest-one',
      questionId: 'q1',
      optionId: 'a',
    });
    expect(
      h
        .disk()
        .queue.every(
          (p) =>
            'contentVersion' in p.command && p.command.contentVersion === 1,
        ),
    ).toBe(true);
  });

  it('reconciles another device completion before choosing the next story and preserves queued local answers', async () => {
    const initial = {
      ...base([], [quest([], { storyIds: ['story-one', 'story-two'] })]),
      stories: [reading(), reading('story-two')],
    };
    const h = harness(initial);
    await h.engine.load();
    const contextual = { ...reading(), questId: 'quest-one' };
    let remoteProgress = applyStoryProgress(contextual, null, {
      type: 'answer',
      questId: 'quest-one',
      questionId: 'q1',
      optionId: 'a',
      occurredAt: 20,
    });
    remoteProgress = applyStoryProgress(contextual, remoteProgress, {
      type: 'complete',
      questId: 'quest-one',
      occurredAt: 30,
    });
    const remoteQuest = {
      ...initial.quests![0],
      completedStoryIds: ['story-one'],
      updatedAt: 30,
    };
    await h.engine.acceptRemoteStory(contextual, remoteProgress, remoteQuest);
    expect(await h.engine.mutate('quests:start', { id: 'quest-one' })).toEqual({
      kind: 'story',
      storyId: 'story-two',
      questId: 'quest-one',
    });
    await h.engine.mutate('stories:answer', {
      id: 'story-two',
      questId: 'quest-one',
      questionId: 'q1',
      optionId: 'b',
    });
    await h.engine.acceptRemoteStory(
      contextual,
      remoteProgress,
      initial.quests![0],
    );
    expect(h.engine.getSnapshot().data!.quests![0].completedStoryIds).toEqual([
      'story-one',
    ]);
    expect(
      h.engine
        .getSnapshot()
        .data!.storyProgress!.find(
          (p) => p.storyId === 'story-two' && p.questId === 'quest-one',
        )?.answers[0].optionId,
    ).toBe('b');
  });

  it('opens only the selected stories, preserves each quest reading and requires explicit completion', async () => {
    const original = reading();
    let finished = applyStoryProgress(original, null, {
      type: 'answer',
      questionId: 'q1',
      optionId: 'a',
      occurredAt: 20,
    });
    finished = applyStoryProgress(original, finished, {
      type: 'complete',
      occurredAt: 30,
    });
    const initial = base(
      [],
      [
        quest([], { storyIds: [original.id, 'story-two'] }),
        quest([], { id: 'quest-two', storyIds: [original.id] }),
      ],
    );
    initial.stories = [reading('unselected'), original, reading('story-two')];
    initial.storyProgress = [finished];
    const h = harness(initial);
    await h.engine.load();
    const first = await h.engine.mutate('quests:start', { id: 'quest-one' });
    expect(first).toEqual({
      kind: 'story',
      storyId: original.id,
      questId: 'quest-one',
    });
    const action = { id: original.id, questId: 'quest-one' };
    await h.engine.mutate('stories:saveParagraph', {
      ...action,
      paragraphIndex: 1,
    });
    const queueSize = h.disk().queue.length;
    expect(await h.engine.mutate('quests:start', { id: 'quest-one' })).toEqual(
      first,
    );
    expect(h.disk().queue).toHaveLength(queueSize);
    await expect(h.engine.mutate('stories:complete', action)).rejects.toThrow(
      'Responda todas',
    );
    await h.engine.mutate('stories:answer', {
      ...action,
      questionId: 'q1',
      optionId: 'b',
    });
    expect(h.engine.getSnapshot().data!.quests![0].completedAt).toBeUndefined();
    await h.engine.mutate('quests:start', { id: 'quest-two' });
    const progress = h.engine.getSnapshot().data!.storyProgress!;
    expect(progress.find((p) => p.questId === 'quest-one')).toMatchObject({
      paragraphIndex: 1,
      answers: [{ optionId: 'b' }],
    });
    expect(progress.find((p) => p.questId === 'quest-two')?.answers).toEqual(
      [],
    );
    expect(progress.find((p) => !p.questId)).toEqual(finished);
    const resumed = h.restart();
    await resumed.load();
    expect(await resumed.mutate('quests:start', { id: 'quest-one' })).toEqual(
      first,
    );
    await resumed.mutate('stories:complete', action);
    expect(resumed.getSnapshot().data!.quests![0]).toMatchObject({
      completedStoryIds: [original.id],
    });
    expect(resumed.getSnapshot().data!.quests![0].completedAt).toBeUndefined();
    expect(await resumed.mutate('quests:start', { id: 'quest-one' })).toEqual({
      kind: 'story',
      storyId: 'story-two',
      questId: 'quest-one',
    });
    await resumed.mutate('stories:answer', {
      id: 'story-two',
      questId: 'quest-one',
      questionId: 'q1',
      optionId: 'a',
    });
    await resumed.mutate('stories:complete', {
      id: 'story-two',
      questId: 'quest-one',
    });
    expect(resumed.getSnapshot().data!.quests![0].completedAt).toBeDefined();
    expect(resumed.getSnapshot().data!.quests![1].completedAt).toBeUndefined();
  });

  it('finishes selected cards before stories and keeps the quest incomplete between them', async () => {
    const initial = base(
      [kanji(1)],
      [quest([kanji(1)._id], { storyIds: ['story-one'] })],
    );
    initial.stories = [reading()];
    const { engine } = harness(initial);
    await engine.load();
    const run = await start(engine);
    await answer(engine, run.sessionId);
    expect(engine.getSnapshot().data!.quests![0].completedAt).toBeUndefined();
    expect(await engine.mutate('quests:start', { id: 'quest-one' })).toEqual({
      kind: 'story',
      storyId: 'story-one',
      questId: 'quest-one',
    });
    await engine.mutate('stories:answer', {
      id: 'story-one',
      questId: 'quest-one',
      questionId: 'q1',
      optionId: 'a',
    });
    await engine.mutate('stories:complete', {
      id: 'story-one',
      questId: 'quest-one',
    });
    expect(engine.getSnapshot().data!.quests![0].completedAt).toBeDefined();
  });

  it('preserves reading after expiry without credit and rejects unavailable targets before journaling', async () => {
    const initial = base(
      [],
      [quest([], { storyIds: ['story-one'], dueAt: 200 })],
    );
    initial.stories = [reading()];
    const h = harness(initial);
    await h.engine.load();
    await h.engine.mutate('quests:start', { id: 'quest-one' });
    h.setNow(200);
    await h.engine.mutate('stories:answer', {
      id: 'story-one',
      questId: 'quest-one',
      questionId: 'q1',
      optionId: 'a',
    });
    await h.engine.mutate('stories:complete', {
      id: 'story-one',
      questId: 'quest-one',
    });
    expect(
      h.engine.getSnapshot().data!.storyProgress![0].completedAt,
    ).toBeDefined();
    expect(h.engine.getSnapshot().data!.quests![0].completedAt).toBeUndefined();
    expect(
      h.engine.getSnapshot().data!.quests![0].completedStoryIds ?? [],
    ).toEqual([]);
    for (const stories of [[], [{ ...reading(), archived: true }]]) {
      const unavailable = harness({
        ...base([], [quest([], { storyIds: ['story-one'] })]),
        stories,
      });
      await unavailable.engine.load();
      await expect(
        unavailable.engine.mutate('quests:start', { id: 'quest-one' }),
      ).rejects.toThrow();
      expect(unavailable.disk().queue).toEqual([]);
    }
  });

  it('replays story quest completion and reconciles its acknowledgement without duplicate credit', async () => {
    const initial = {
      ...base([], [quest([], { storyIds: ['story-one'] })]),
      stories: [reading()],
    };
    const h = harness(initial);
    await h.engine.load();
    await h.engine.mutate('quests:start', { id: 'quest-one' });
    await h.engine.mutate('stories:answer', {
      id: 'story-one',
      questId: 'quest-one',
      questionId: 'q1',
      optionId: 'a',
    });
    await h.engine.mutate('stories:complete', {
      id: 'story-one',
      questId: 'quest-one',
    });
    const cloud = clone(initial);
    await h.engine.synchronizePending(
      async (_, command) => {
        applyLocal(cloud, command);
        applyLocal(cloud, command);
        return {
          mappings: [],
          quests: cloud.quests,
          story: cloud.stories.find((s) => s.questId === 'quest-one'),
          storyProgress: (cloud as Data).storyProgress?.find(
            (p) => p.questId === 'quest-one',
          ),
        };
      },
      () => true,
    );
    expect(h.engine.getSnapshot().status.pending).toBe(0);
    expect(h.engine.getSnapshot().data!.quests![0].completedStoryIds).toEqual([
      'story-one',
    ]);
    expect(h.engine.getSnapshot().data!.stories).toHaveLength(2);
    const restarted = h.restart();
    await restarted.load();
    expect(restarted.getSnapshot().data!.quests).toEqual(cloud.quests);
  });

  it('starts the exact mixed set in chosen order with no settings, filters or replacement cards', async () => {
    const selected = [bunpou._id, kanji(2)._id, kotoba._id];
    const { engine } = harness(
      base([kanji(1), kanji(2), kotoba, bunpou], [quest(selected)]),
    );
    await engine.load();
    const result = await start(engine);
    expect(result.kind).toBe('study');
    const data = engine.getSnapshot().data!;
    expect(data.presentations.map((item) => item.cardId)).toEqual(selected);
    expect(data.sessions[0]).toMatchObject({
      questId: 'quest-one',
      mode: 'direct',
      total: 3,
    });
    expect(
      data.presentations.map((item) =>
        'category' in item.snapshot ? item.snapshot.category : 'alphabet',
      ),
    ).toEqual(['grammar', 'alphabet', 'vocabulary']);
  });

  it('resumes the same quest, switches between multiple quests and preserves each chosen set', async () => {
    const cards = [kanji(1), kanji(2), kanji(3)];
    const { engine, restart } = harness(
      base(cards, [
        quest([cards[0]._id, cards[1]._id]),
        quest([cards[1]._id, cards[2]._id], { id: 'quest-two' }),
      ]),
    );
    await engine.load();
    const one = await start(engine);
    await answer(engine, one.sessionId);
    const pending = engine.getSnapshot().status.pending;
    expect(await start(engine)).toEqual(one);
    expect(engine.getSnapshot().status.pending).toBe(pending);
    const two = await start(engine, 'quest-two');
    expect(engine.getSnapshot().data!.quests![0].completedCardIds).toEqual([
      cards[0]._id,
    ]);
    expect(engine.getSnapshot().data!.quests![1].completedCardIds).toEqual([]);
    expect(
      engine.getSnapshot().data!.sessions.find((s) => s._id === one.sessionId)
        ?.status,
    ).toBe('ended');
    await answer(engine, two.sessionId);
    const resumed = await start(engine);
    expect(
      projection(engine.getSnapshot().data!, resumed.sessionId).presentation
        ?.cardId,
    ).toBe(cards[1]._id);
    const reloaded = restart();
    await reloaded.load();
    expect(reloaded.getSnapshot().data).toEqual(engine.getSnapshot().data);
  });

  it('completes only after the entire selected set, and undo restores an unfinished item', async () => {
    const cards = [kanji(1), kotoba, bunpou];
    const { engine } = harness(
      base(cards, [quest(cards.map((card) => card._id))]),
    );
    await engine.load();
    const run = await start(engine);
    const args = await answer(engine, run.sessionId);
    expect(engine.getSnapshot().data!.quests![0].completedAt).toBeUndefined();
    await engine.mutate('study:undo', args);
    expect(engine.getSnapshot().data!.quests![0].completedCardIds).toEqual([]);
    for (let i = 0; i < 3; i++) await answer(engine, run.sessionId);
    const done = engine.getSnapshot().data!.quests![0];
    expect(done.completedCardIds).toEqual(cards.map((card) => card._id));
    expect(done.completedAt).toBeDefined();
  });

  it('ordinary study and repeating a selected card cannot replace unanswered targets', async () => {
    const cards = [kanji(1), kanji(2)];
    const { engine } = harness(
      base(cards, [quest(cards.map((card) => card._id))]),
    );
    await engine.load();
    const session = (await engine.mutate('study:start', {
      mode: 'direct',
      order: 'sorted',
      limit: 2,
    })) as Doc<'studySessions'>;
    await answer(engine, session._id);
    const data = engine.getSnapshot().data!;
    expect(data.quests![0].completedCardIds).toEqual([]);
    for (const sourceId of ['one', 'two', 'three'])
      creditLocalQuests(data, {
        kind: 'study',
        questId: 'quest-one',
        cardId: cards[0]._id,
        sourceId,
        occurredAt: 200,
      });
    creditLocalQuests(data, {
      kind: 'study',
      questId: 'quest-one',
      cardId: 'unselected',
      sourceId: 'four',
      occurredAt: 200,
    });
    expect(data.quests![0].completedCardIds).toEqual([cards[0]._id]);
    expect(data.quests![0].completedAt).toBeUndefined();
  });

  it('supports sets over 100 cards without completing after the first internal batch', async () => {
    const cards = Array.from({ length: 103 }, (_, i) => kanji(i + 1));
    const { engine } = harness(
      base(cards, [quest(cards.map((card) => card._id))]),
    );
    await engine.load();
    const first = await start(engine);
    expect(
      projection(engine.getSnapshot().data!, first.sessionId).session.total,
    ).toBe(100);
    for (let i = 0; i < 100; i++) await answer(engine, first.sessionId);
    expect(engine.getSnapshot().data!.quests![0].completedAt).toBeUndefined();
    const next = await start(engine);
    expect(
      projection(engine.getSnapshot().data!, next.sessionId).session.total,
    ).toBe(3);
    expect(
      engine
        .getSnapshot()
        .data!.presentations.filter((p) => p.sessionId === next.sessionId)
        .map((p) => p.cardId),
    ).toEqual(cards.slice(100).map((card) => card._id));
    for (let i = 0; i < 3; i++) await answer(engine, next.sessionId);
    expect(engine.getSnapshot().data!.quests![0].completedAt).toBeDefined();
  }, 15000);

  it.each(['missing', 'archived'] as const)(
    'fails clearly for a %s selected card without falling back to similar cards',
    async (reason) => {
      const unavailable = kanji(2);
      if (reason === 'archived') unavailable.archived = true;
      const { engine } = harness(
        base(
          [kanji(1), ...(reason === 'archived' ? [unavailable] : [])],
          [quest([kanji(2)._id])],
        ),
      );
      await engine.load();
      await expect(start(engine)).rejects.toThrow('indisponível');
      expect(engine.getSnapshot().status.pending).toBe(0);
      expect(engine.getSnapshot().data!.sessions).toEqual([]);
    },
  );

  it('keeps frozen selected cards in an already started batch when the catalogue is later archived', async () => {
    const cards = [kanji(1), kanji(2)];
    const { engine } = harness(
      base(cards, [quest(cards.map((card) => card._id))]),
    );
    await engine.load();
    const run = await start(engine);
    await engine.acceptRemoteContent({ ...cards[1], archived: true });
    await answer(engine, run.sessionId);
    expect(
      projection(engine.getSnapshot().data!, run.sessionId).presentation
        ?.cardId,
    ).toBe(cards[1]._id);
    expect(
      projection(engine.getSnapshot().data!, run.sessionId).session.skipped,
    ).toBe(0);
  });

  it('keeps exact selection and completion through cold restart and a lost server acknowledgement', async () => {
    const initial = base(
      [kanji(1), kotoba],
      [quest([kotoba._id, kanji(1)._id])],
    );
    const { engine, restart } = harness(initial);
    await engine.load();
    const run = await start(engine);
    await answer(engine, run.sessionId);
    await answer(engine, run.sessionId);
    const reloaded = restart();
    await reloaded.load();
    expect(reloaded.getSnapshot().data!.quests![0].completedAt).toBeDefined();
    const cloud = clone(initial);
    const receipts = new Set<string>();
    let lost = false;
    const send = async (
      id: string,
      command: OfflineCommand,
    ): Promise<Reply> => {
      if (!receipts.has(id)) {
        applyLocal(cloud, command);
        receipts.add(id);
      }
      if (command.type === 'study.rate' && !lost) {
        lost = true;
        throw new Error('ACK lost');
      }
      return { mappings: [], quests: clone(cloud.quests) };
    };
    await reloaded.synchronizePending(send, () => true);
    expect(reloaded.getSnapshot().status.pending).toBeGreaterThan(0);
    await reloaded.synchronizePending(send, () => true);
    expect(reloaded.getSnapshot().status.pending).toBe(0);
    expect(reloaded.getSnapshot().data!.quests).toEqual(cloud.quests);
    expect(cloud.quests![0].completedCardIds).toEqual(
      initial.quests![0].cardIds,
    );
  });

  it('does not subtract unearned credit after cancellation and rejects new expired starts', async () => {
    const data = base(
      [kanji(1), kanji(2)],
      [
        quest([kanji(1)._id, kanji(2)._id], {
          cancelledAt: 90,
          completedCardIds: [kanji(1)._id],
        }),
      ],
    );
    creditLocalQuests(
      data,
      {
        kind: 'study',
        questId: 'quest-one',
        sourceId: 'unearned',
        cardId: kanji(1)._id,
        occurredAt: 100,
      },
      -1,
    );
    expect(data.quests![0].completedCardIds).toEqual([kanji(1)._id]);
    const { engine } = harness(
      base([kanji(1)], [quest([kanji(1)._id], { dueAt: 99 })]),
    );
    await engine.load();
    await expect(start(engine)).rejects.toThrow('prazo');
  });
});
