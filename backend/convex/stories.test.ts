import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { createTestBackend, learnerIdentity } from './test-support.helpers';
import {
  applyStoryProgress,
  storyScore,
  type StoryContent,
  type StoryRecord,
} from '../../shared/stories';
import { getLatestForOwner, STORY_LIMITS } from './storiesDomain';

const START = Date.UTC(2026, 9, 10, 12);
afterEach(() => vi.restoreAllMocks());
function content(patch: Partial<StoryContent> = {}): StoryContent {
  return {
    title: '山の朝',
    level: 'N4',
    paragraphs: [
      {
        id: 'p1',
        segments: [{ text: '山', reading: 'やま' }, { text: 'へ行きました。' }],
        translation: 'Fui à montanha.',
      },
      {
        id: 'p2',
        segments: [{ text: '朝は静かでした。' }],
        translation: 'A manhã estava tranquila.',
      },
    ],
    questions: [
      {
        id: 'q1',
        prompt: 'どこへ行きましたか。',
        options: [
          { id: 'a', text: '山' },
          { id: 'b', text: '海' },
        ],
        correctOptionId: 'a',
        explanation: 'Foi à montanha.',
      },
      {
        id: 'q2',
        prompt: 'いつですか。',
        options: [
          { id: 'a', text: '夜' },
          { id: 'b', text: '朝' },
        ],
        correctOptionId: 'b',
      },
    ],
    ...patch,
  };
}
async function setup() {
  const clock = { now: START };
  vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
  const backend = createTestBackend();
  const learner = backend.withIdentity(learnerIdentity),
    other = backend.withIdentity({
      ...learnerIdentity,
      subject: 'other',
      tokenIdentifier: 'other',
    });
  await learner.mutation(api.users.ensureCurrentUser, {});
  await other.mutation(api.users.ensureCurrentUser, {});
  const story = await learner.mutation(api.stories.create, {
    clientKey: 'story-original',
    story: content(),
  });
  return {
    backend,
    learner,
    other,
    story,
    id: story.id as Id<'stories'>,
    clock,
  };
}

describe('personal stories', () => {
  test('accepts a queued quest reading after remote archival while refusing a new online opening', async () => {
    const { learner, id, clock } = await setup();
    const quest = await learner.mutation(api.quests.create, {
      clientKey: 'queued-before-archive',
      title: 'Leitura baixada',
      startsAt: START,
      dueAt: START + 1000,
      timeZone: 'UTC',
      storyIds: [id],
    });
    const questId = quest.id as Id<'quests'>;
    clock.now += 10;
    await learner.mutation(api.stories.setArchived, { id, archived: true });
    await expect(
      learner.mutation(api.quests.start, { id: questId }),
    ).rejects.toThrow('arquivada');
    await expect(
      learner.mutation(api.stories.saveParagraph, {
        id,
        questId,
        paragraphIndex: 0,
      }),
    ).rejects.toThrow('arquivada');
    const start = await learner.mutation(api.offline.apply, {
      operationId: 'queued-story-start-before-archive',
      command: {
        type: 'story.progress',
        storyId: id,
        questId,
        contentVersion: 1,
        paragraphIndex: 1,
        occurredAt: START + 1,
      },
    });
    expect(start.storyProgress).toMatchObject({
      questId,
      paragraphIndex: 1,
      startedAt: START + 1,
    });
    for (const [index, question] of content().questions.entries())
      await learner.mutation(api.offline.apply, {
        operationId: `queued-story-answer-before-archive-${index}`,
        command: {
          type: 'story.answer',
          storyId: id,
          questId,
          contentVersion: 1,
          questionId: question.id,
          optionId: question.correctOptionId,
          occurredAt: START + index + 2,
        },
      });
    const result = await learner.mutation(api.offline.apply, {
      operationId: 'queued-story-complete-before-archive',
      command: {
        type: 'story.complete',
        storyId: id,
        questId,
        contentVersion: 1,
        occurredAt: START + 4,
      },
    });
    expect(result.story?.archived).toBe(true);
    expect(result.storyProgress?.answers).toHaveLength(
      content().questions.length,
    );
    expect(result.quests?.[0]).toMatchObject({
      completedStoryIds: [id],
      completedAt: START + 4,
    });
  });
  test('returns the authoritative quest with a reading completed on another device', async () => {
    const { learner, id, clock, backend } = await setup();
    const secondStory = await learner.mutation(api.stories.create, {
      clientKey: 'second-device-next-story',
      story: content({ title: 'Próxima história' }),
    });
    const quest = await learner.mutation(api.quests.create, {
      clientKey: 'second-device-story-quest',
      title: 'Duas histórias',
      startsAt: START,
      dueAt: START + 1000,
      timeZone: 'UTC',
      storyIds: [id, secondStory.id],
    });
    const questId = quest.id as Id<'quests'>;
    await learner.mutation(api.quests.start, { id: questId });
    const staleReading = await learner.query(api.stories.get, { id, questId });
    expect(staleReading?.quest?.completedStoryIds).toEqual([]);
    const anotherDevice = backend.withIdentity(learnerIdentity);
    for (const question of content().questions)
      await anotherDevice.mutation(api.stories.answer, {
        id,
        questId,
        questionId: question.id,
        optionId: question.correctOptionId,
      });
    clock.now++;
    await anotherDevice.mutation(api.stories.complete, { id, questId });
    const freshReading = await learner.query(api.stories.get, { id, questId });
    expect(freshReading?.progress?.completedAt).toBe(clock.now);
    expect(freshReading?.quest).toEqual(
      await learner.query(api.quests.get, { id: questId }),
    );
    expect(freshReading?.quest?.completedStoryIds).toEqual([id]);
    expect(freshReading?.quest?.completedAt).toBeUndefined();
    expect((await learner.query(api.stories.get, { id }))?.quest).toBeNull();
    expect(await learner.mutation(api.quests.start, { id: questId })).toEqual({
      kind: 'story',
      storyId: secondStory.id,
      questId,
    });
  });
  test('starts exact story quests independently of a previously completed reading and other quests', async () => {
    const { learner, id, clock, backend } = await setup();
    for (const question of content().questions)
      await learner.mutation(api.stories.answer, {
        id,
        questionId: question.id,
        optionId: question.correctOptionId,
      });
    await learner.mutation(api.stories.complete, { id });
    const makeQuest = (clientKey: string) =>
      learner.mutation(api.quests.create, {
        clientKey,
        title: 'Ler a história',
        startsAt: START,
        dueAt: START + 1000,
        timeZone: 'UTC',
        storyIds: [id],
      });
    const first = await makeQuest('reading-first'),
      second = await makeQuest('reading-second');
    const questId = first.id as Id<'quests'>;
    expect(first.completedStoryIds).toEqual([]);
    expect(await learner.mutation(api.quests.start, { id: questId })).toEqual({
      kind: 'story',
      storyId: id,
      questId,
    });
    const reading = await learner.query(api.stories.get, { id, questId });
    expect(reading?.story.questId).toBe(questId);
    expect(reading?.progress).toMatchObject({
      questId,
      answers: [],
      paragraphIndex: 0,
    });
    expect(reading?.progress?.completedAt).toBeUndefined();
    await expect(
      learner.mutation(api.stories.complete, { id, questId }),
    ).rejects.toThrow('todas as perguntas');
    for (const question of content().questions)
      await learner.mutation(api.stories.answer, {
        id,
        questId,
        questionId: question.id,
        optionId: question.correctOptionId,
      });
    expect(
      (await learner.query(api.quests.get, { id: questId }))?.completedAt,
    ).toBeUndefined();
    clock.now += 20;
    await learner.mutation(api.stories.complete, { id, questId });
    await learner.mutation(api.stories.complete, { id, questId });
    expect(await learner.query(api.quests.get, { id: questId })).toMatchObject({
      completedStoryIds: [id],
      completedAt: clock.now,
    });
    expect(
      (await learner.query(api.quests.get, { id: second.id as Id<'quests'> }))
        ?.completedStoryIds,
    ).toEqual([]);
    expect(
      (await learner.query(api.stories.get, { id }))?.progress?.completedAt,
    ).toBe(START);
    expect(
      await backend.run((ctx) => ctx.db.query('questContributions').collect()),
    ).toHaveLength(1);
  });

  test('validates story targets, ownership, duplicates, archival and quest start window', async () => {
    const { learner, other, id, clock } = await setup();
    const input = {
      clientKey: 'story-target-check',
      title: 'Leitura',
      startsAt: START,
      dueAt: START + 1000,
      timeZone: 'UTC',
      storyIds: [id],
    };
    await expect(other.mutation(api.quests.create, input)).rejects.toThrow(
      'indisponível',
    );
    await expect(
      learner.mutation(api.quests.create, { ...input, storyIds: [id, id] }),
    ).rejects.toThrow('única vez');
    const quest = await learner.mutation(api.quests.create, input),
      questId = quest.id as Id<'quests'>;
    expect(await learner.mutation(api.quests.create, input)).toEqual(quest);
    await expect(
      other.query(api.stories.get, { id, questId }),
    ).resolves.toBeNull();
    const otherStory = await learner.mutation(api.stories.create, {
      clientKey: 'unselected-story',
      story: content(),
    });
    await expect(
      learner.mutation(api.stories.answer, {
        id: otherStory.id as Id<'stories'>,
        questId,
        questionId: 'q1',
        optionId: 'a',
      }),
    ).rejects.toThrow('não pertence');
    await learner.mutation(api.stories.setArchived, { id, archived: true });
    await expect(
      learner.mutation(api.quests.create, {
        ...input,
        clientKey: 'archived-story-quest',
      }),
    ).rejects.toThrow('arquivada');
    await expect(
      learner.mutation(api.quests.start, { id: questId }),
    ).rejects.toThrow('arquivada');
    await learner.mutation(api.stories.setArchived, { id, archived: false });
    clock.now += 1000;
    await expect(
      learner.mutation(api.quests.start, { id: questId }),
    ).rejects.toThrow('fora do período');
    await expect(
      learner.mutation(api.stories.saveParagraph, {
        id,
        questId,
        paragraphIndex: 0,
      }),
    ).rejects.toThrow('fora do período');
  });

  test('pins a separate edition per quest and includes all reading contexts in the offline snapshot', async () => {
    const { learner, id, clock } = await setup();
    await learner.mutation(api.stories.saveParagraph, {
      id,
      paragraphIndex: 1,
    });
    await learner.mutation(api.stories.update, {
      id,
      expectedContentVersion: 1,
      story: content({ title: 'Edição 2' }),
    });
    const quest = await learner.mutation(api.quests.create, {
      clientKey: 'story-version-quest',
      title: 'Nova edição',
      startsAt: START,
      dueAt: START + 1000,
      timeZone: 'UTC',
      storyIds: [id],
    });
    const questId = quest.id as Id<'quests'>;
    await learner.mutation(api.quests.start, { id: questId });
    clock.now++;
    await learner.mutation(api.stories.update, {
      id,
      expectedContentVersion: 2,
      story: content({ title: 'Edição 3' }),
    });
    const snapshot = await learner.query(api.stories.offlineSnapshot, {});
    expect(
      snapshot.stories.find((story) => story.id === id && !story.questId)
        ?.contentVersion,
    ).toBe(1);
    expect(
      snapshot.stories.find(
        (story) => story.id === id && story.questId === questId,
      ),
    ).toMatchObject({ title: 'Edição 2', contentVersion: 2 });
    expect(
      snapshot.storyProgress.filter((progress) => progress.storyId === id),
    ).toHaveLength(2);
    await expect(
      learner.mutation(api.stories.answer, {
        id,
        questId,
        contentVersion: 1,
        questionId: 'q1',
        optionId: 'a',
      }),
    ).rejects.toThrow('outra versão');
    expect(
      (await learner.query(api.stories.get, { id, questId }))?.story
        .contentVersion,
    ).toBe(2);
    await learner.mutation(api.stories.setArchived, { id, archived: true });
    expect(await learner.mutation(api.quests.start, { id: questId })).toEqual({
      kind: 'story',
      storyId: id,
      questId,
    });
    expect(
      (await learner.query(api.stories.get, { id, questId }))?.story
        .contentVersion,
    ).toBe(2);
  });

  test('credits delayed offline story completion once by occurrence time and reconciles lost acknowledgments', async () => {
    const { learner, id, clock, backend } = await setup();
    const quest = await learner.mutation(api.quests.create, {
      clientKey: 'offline-story-quest',
      title: 'Offline',
      startsAt: START,
      dueAt: START + 100,
      timeZone: 'UTC',
      storyIds: [id],
    });
    clock.now = START + 1000;
    for (const [index, question] of content().questions.entries())
      await learner.mutation(api.offline.apply, {
        operationId: `quest-story-answer-${index}`,
        command: {
          type: 'story.answer',
          storyId: id,
          questId: quest.id,
          questionId: question.id,
          optionId: question.correctOptionId,
          occurredAt: START + index + 1,
        },
      });
    const request = {
      operationId: 'quest-story-complete',
      command: {
        type: 'story.complete' as const,
        storyId: id,
        questId: quest.id,
        occurredAt: START + 10,
      },
    };
    const result = await learner.mutation(api.offline.apply, request);
    expect(result.quests?.[0]).toMatchObject({
      completedStoryIds: [id],
      completedAt: START + 10,
    });
    expect(result.storyProgress?.questId).toBe(quest.id);
    expect(result.story?.questId).toBe(quest.id);
    expect(await learner.mutation(api.offline.apply, request)).toEqual(result);
    await learner.mutation(api.offline.apply, {
      ...request,
      operationId: 'quest-story-complete-retry',
    });
    expect(
      await backend.run((ctx) => ctx.db.query('questContributions').collect()),
    ).toHaveLength(1);
    expect((await learner.query(api.stories.get, { id }))?.progress).toBeNull();
  });

  test('preserves late and cancelled readings without completing their quests', async () => {
    const { learner, id, clock } = await setup();
    for (const cancelled of [false, true]) {
      clock.now = START;
      const quest = await learner.mutation(api.quests.create, {
        clientKey: `story-outside-${cancelled}`,
        title: 'Janela',
        startsAt: START,
        dueAt: START + 100,
        timeZone: 'UTC',
        storyIds: [id],
      });
      const questId = quest.id as Id<'quests'>;
      await learner.mutation(api.quests.start, { id: questId });
      clock.now = START + 20;
      if (cancelled) await learner.mutation(api.quests.cancel, { id: questId });
      clock.now = START + 1000;
      for (const [index, question] of content().questions.entries())
        await learner.mutation(api.offline.apply, {
          operationId: `story-window-${cancelled}-${index}`,
          command: {
            type: 'story.answer',
            storyId: id,
            questId,
            questionId: question.id,
            optionId: question.correctOptionId,
            occurredAt: START + index + 1,
          },
        });
      const result = await learner.mutation(api.offline.apply, {
        operationId: `story-window-complete-${cancelled}`,
        command: {
          type: 'story.complete',
          storyId: id,
          questId,
          occurredAt: START + (cancelled ? 10 : 100),
        },
      });
      expect(result.storyProgress?.completedAt).toBeDefined();
      expect(result.quests?.[0].completedStoryIds).toEqual([]);
      expect(result.quests?.[0].completedAt).toBeUndefined();
    }
  });

  test('keeps furigana and content intact; retries creation without duplicates', async () => {
    const { learner, story, id } = await setup();
    expect(
      await learner.mutation(api.stories.create, {
        clientKey: 'story-original',
        story: content({ title: '  山の朝  ' }),
      }),
    ).toEqual(story);
    expect(
      (await learner.query(api.stories.get, { id }))?.story.paragraphs[0]
        .segments[0],
    ).toEqual({ text: '山', reading: 'やま' });
    await expect(
      learner.mutation(api.stories.create, {
        clientKey: 'story-original',
        story: content({ title: '変更' }),
      }),
    ).rejects.toThrow('outro conteúdo');
    expect(
      (
        await learner.query(api.stories.list, {
          paginationOpts: { numItems: 30, cursor: null },
        })
      ).page,
    ).toHaveLength(1);
  });

  test('isolates read, answer, completion and archival for two accounts', async () => {
    const { learner, other, id } = await setup();
    expect(await other.query(api.stories.get, { id })).toBeNull();
    expect(
      (
        await other.query(api.stories.list, {
          paginationOpts: { numItems: 30, cursor: null },
        })
      ).page,
    ).toEqual([]);
    for (const request of [
      other.mutation(api.stories.answer, {
        id,
        questionId: 'q1',
        optionId: 'a',
      }),
      other.mutation(api.stories.complete, { id }),
      other.mutation(api.stories.saveParagraph, { id, paragraphIndex: 0 }),
      other.mutation(api.stories.setArchived, { id, archived: true }),
    ])
      await expect(request).rejects.toThrow('indisponível');
    expect((await learner.query(api.stories.get, { id }))?.progress).toBeNull();
    // The same automation key is independent per owner.
    expect(
      (
        await other.mutation(api.stories.create, {
          clientKey: 'story-original',
          story: content(),
        })
      ).id,
    ).not.toBe(id);
  });

  test.each([
    [
      'furigana',
      () =>
        content({
          paragraphs: [
            {
              id: 'p',
              segments: [{ text: '山', reading: 'yama' }],
              translation: 'Montanha.',
            },
          ],
        }),
    ],
    [
      'duplicate paragraphs',
      () =>
        content({
          paragraphs: [content().paragraphs[0], content().paragraphs[0]],
        }),
    ],
    ['empty paragraphs', () => content({ paragraphs: [] })],
    [
      'missing paragraph translation',
      () => content({ paragraphs: [{ id: 'p', segments: [{ text: '山' }] }] }),
    ],
    [
      'blank paragraph translation',
      () =>
        content({
          paragraphs: [
            { id: 'p', segments: [{ text: '山' }], translation: '  ' },
          ],
        }),
    ],
    ['empty questions', () => content({ questions: [] })],
    [
      'duplicate options',
      () =>
        content({
          questions: [
            {
              ...content().questions[0],
              options: [
                { id: 'a', text: '山' },
                { id: 'a', text: '海' },
              ],
            },
          ],
        }),
    ],
    [
      'absent correct option',
      () =>
        content({
          questions: [
            { ...content().questions[0], correctOptionId: 'missing' },
          ],
        }),
    ],
    [
      'empty text',
      () => content({ paragraphs: [{ id: 'p', segments: [{ text: '  ' }] }] }),
    ],
    [
      'content bytes',
      () =>
        content({
          paragraphs: Array.from({ length: 20 }, (_, i) => ({
            id: `p${i}`,
            segments: [{ text: '山'.repeat(2000) }],
            translation: 'Montanha.',
          })),
        }),
    ],
  ])('rejects malformed %s', async (_label, value) => {
    const { learner } = await setup();
    await expect(
      learner.mutation(api.stories.create, {
        clientKey: 'story-malformed',
        story: value(),
      }),
    ).rejects.toThrow();
  });

  test('requires every answer, derives score and freezes a completed result', async () => {
    const { learner, id, story, clock } = await setup();
    await learner.mutation(api.stories.saveParagraph, {
      id,
      paragraphIndex: 1,
    });
    await learner.mutation(api.stories.answer, {
      id,
      questionId: 'q1',
      optionId: 'b',
    });
    await expect(
      learner.mutation(api.stories.complete, { id }),
    ).rejects.toThrow('todas as perguntas');
    clock.now += 100;
    await learner.mutation(api.stories.answer, {
      id,
      questionId: 'q2',
      optionId: 'b',
    });
    const completed = await learner.mutation(api.stories.complete, { id });
    expect(storyScore(story, completed)).toEqual({
      total: 2,
      answered: 2,
      correct: 1,
      percentage: 50,
    });
    expect(completed.completedAt).toBe(clock.now);
    clock.now += 100;
    expect(
      await learner.mutation(api.stories.answer, {
        id,
        questionId: 'q1',
        optionId: 'a',
      }),
    ).toEqual(completed);
    expect(
      await learner.mutation(api.stories.saveParagraph, {
        id,
        paragraphIndex: 0,
      }),
    ).toEqual(completed);
    expect(await learner.mutation(api.stories.complete, { id })).toEqual(
      completed,
    );
  });

  test('supports bounded pagination and combined level/status filters', async () => {
    const { learner, id } = await setup();
    for (const [index, level] of ['N5', 'N3', 'N4', 'N4', 'N1'].entries())
      await learner.mutation(api.stories.create, {
        clientKey: `story-page-${index}`,
        story: content({
          title: `Leitura ${index}`,
          level: level as StoryContent['level'],
        }),
      });
    await learner.mutation(api.stories.answer, {
      id,
      questionId: 'q1',
      optionId: 'a',
    });
    await learner.mutation(api.stories.answer, {
      id,
      questionId: 'q2',
      optionId: 'b',
    });
    await learner.mutation(api.stories.complete, { id });
    const first = await learner.query(api.stories.list, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    const second = await learner.query(api.stories.list, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(new Set([...first.page, ...second.page].map((s) => s.id)).size).toBe(
      4,
    );
    const completed = await learner.query(api.stories.list, {
      paginationOpts: { numItems: 30, cursor: null },
      level: 'N4',
      status: 'completed',
    });
    expect(completed.page.map((s) => s.id)).toEqual([id]);
    const fresh = await learner.query(api.stories.list, {
      paginationOpts: { numItems: 30, cursor: null },
      level: 'N4',
      status: 'new',
    });
    expect(fresh.page).toHaveLength(2);
    expect(fresh.page[0]).not.toHaveProperty('paragraphs');
    expect(completed.page[0]).toMatchObject({
      paragraphCount: 2,
      questionCount: 2,
      progress: { completedAt: START },
    });
  });

  test('archives reversibly without deleting reading history', async () => {
    const { learner, id } = await setup();
    await learner.mutation(api.stories.answer, {
      id,
      questionId: 'q1',
      optionId: 'a',
    });
    await learner.mutation(api.stories.setArchived, { id, archived: true });
    expect(
      (
        await learner.query(api.stories.list, {
          paginationOpts: { numItems: 30, cursor: null },
        })
      ).page,
    ).toEqual([]);
    expect(
      (
        await learner.query(api.stories.list, {
          paginationOpts: { numItems: 30, cursor: null },
          archived: true,
        })
      ).page[0].id,
    ).toBe(id);
    expect(
      (await learner.query(api.stories.get, { id }))?.progress?.answers,
    ).toHaveLength(1);
    await learner.mutation(api.stories.setArchived, { id, archived: false });
    expect(
      (await learner.query(api.stories.offlineSnapshot, {})).stories,
    ).toHaveLength(1);
  });

  test('updates the same ID with optimistic concurrency and idempotent retries', async () => {
    const { learner, other, id, story } = await setup();
    const edited = content({ title: '山の午後', level: 'N3' });
    const updated = await learner.mutation(api.stories.update, {
      id,
      expectedContentVersion: 1,
      story: edited,
    });
    expect(updated).toMatchObject({
      id,
      contentVersion: 2,
      title: '山の午後',
      level: 'N3',
    });
    expect(updated.updatedAt).toBeGreaterThan(story.updatedAt);
    expect(
      await learner.mutation(api.stories.update, {
        id,
        expectedContentVersion: 1,
        story: edited,
      }),
    ).toEqual(updated);
    expect(
      await learner.mutation(api.stories.create, {
        clientKey: 'story-original',
        story: content(),
      }),
    ).toEqual(updated);
    await expect(
      learner.mutation(api.stories.update, {
        id,
        expectedContentVersion: 1,
        story: content({ title: 'Outra alteração' }),
      }),
    ).rejects.toThrow('foi alterada');
    await expect(
      learner.mutation(api.stories.update, {
        id,
        expectedContentVersion: 3,
        story: edited,
      }),
    ).rejects.toThrow('foi alterada');
    await expect(
      other.mutation(api.stories.update, {
        id,
        expectedContentVersion: 2,
        story: edited,
      }),
    ).rejects.toThrow('indisponível');
    await expect(
      other.mutation(api.stories.deleteStory, { id }),
    ).rejects.toThrow('indisponível');
    expect(
      (
        await learner.query(api.stories.list, {
          level: 'N3',
          paginationOpts: { numItems: 30, cursor: null },
        })
      ).page,
    ).toMatchObject([
      { id, contentVersion: 2, title: '山の午後', level: 'N3' },
    ]);
  });

  test('requires translations in every paragraph on updates without changing the previous version', async () => {
    const { learner, id, story } = await setup();
    for (const translation of [undefined, '', '   ']) {
      const invalid = content();
      invalid.paragraphs[1].translation = translation;
      await expect(
        learner.mutation(api.stories.update, {
          id,
          expectedContentVersion: 1,
          story: invalid,
        }),
      ).rejects.toThrow();
    }
    expect((await learner.query(api.stories.get, { id }))?.story).toEqual(
      story,
    );
  });

  test('pins started and completed readings to their original text and answer key after edits', async () => {
    const { backend, learner, id, clock } = await setup();
    await learner.mutation(api.stories.saveParagraph, {
      id,
      paragraphIndex: 1,
    });
    await learner.mutation(api.stories.answer, {
      id,
      questionId: 'q1',
      optionId: 'a',
    });
    const edited = content({
      title: '改訂版',
      level: 'N3',
      questions: [
        {
          ...content().questions[0],
          correctOptionId: 'b',
        },
      ],
    });
    await learner.mutation(api.stories.update, {
      id,
      expectedContentVersion: 1,
      story: edited,
    });
    const reading = await learner.query(api.stories.get, { id });
    expect(reading?.story).toMatchObject({
      contentVersion: 1,
      title: '山の朝',
      level: 'N4',
    });
    expect(reading?.progress).toMatchObject({
      contentVersion: 1,
      paragraphIndex: 1,
    });
    const editor = await backend.run(async (ctx) => {
      const doc = await ctx.db.get('stories', id);
      return getLatestForOwner(ctx, doc!.ownerId, id);
    });
    expect(editor?.story).toMatchObject({ contentVersion: 2, title: '改訂版' });
    expect(editor?.progress?.contentVersion).toBe(1);
    const summary = (
      await learner.query(api.stories.list, {
        level: 'N3',
        paginationOpts: { numItems: 30, cursor: null },
      })
    ).page[0];
    expect(summary).toMatchObject({
      contentVersion: 2,
      level: 'N3',
      progress: { contentVersion: 1 },
    });
    await learner.mutation(api.stories.answer, {
      id,
      questionId: 'q2',
      optionId: 'b',
      contentVersion: 1,
    });
    const finished = await learner.mutation(api.stories.complete, {
      id,
      contentVersion: 1,
    });
    expect(storyScore(reading!.story, finished).percentage).toBe(100);
    clock.now++;
    await learner.mutation(api.stories.update, {
      id,
      expectedContentVersion: 2,
      story: content({ title: 'Outra revisão' }),
    });
    const final = await learner.query(api.stories.get, { id });
    expect(final?.progress).toEqual(finished);
    expect(storyScore(final!.story, final!.progress).percentage).toBe(100);
    const snapshot = await learner.query(api.stories.offlineSnapshot, {});
    expect(snapshot.stories[0].contentVersion).toBe(1);
    expect(snapshot.storyProgress[0].contentVersion).toBe(1);
  });

  test('a new reading pins the current version and rejects a different version from another device', async () => {
    const { learner, id } = await setup();
    await learner.mutation(api.stories.update, {
      id,
      expectedContentVersion: 1,
      story: content({ title: 'Revisão' }),
    });
    expect(
      (await learner.query(api.stories.get, { id }))?.story.contentVersion,
    ).toBe(2);
    const progress = await learner.mutation(api.stories.answer, {
      id,
      contentVersion: 2,
      questionId: 'q1',
      optionId: 'a',
    });
    expect(progress.contentVersion).toBe(2);
    await expect(
      learner.mutation(api.offline.apply, {
        operationId: 'stale-reading-device',
        command: {
          type: 'story.answer',
          storyId: id,
          contentVersion: 1,
          questionId: 'q2',
          optionId: 'b',
          occurredAt: START,
        },
      }),
    ).rejects.toThrow('outra versão');
    expect((await learner.query(api.stories.get, { id }))?.progress).toEqual(
      progress,
    );
  });

  test('queued offline reading survives content edits and deletion, returning pinned content on replay', async () => {
    const { learner, id } = await setup();
    await learner.mutation(api.stories.update, {
      id,
      expectedContentVersion: 1,
      story: content({
        title: 'Novo texto',
        questions: [{ ...content().questions[0], id: 'new-question' }],
      }),
    });
    const deleted = await learner.mutation(api.stories.deleteStory, { id });
    expect(await learner.mutation(api.stories.deleteStory, { id })).toEqual(
      deleted,
    );
    const request = {
      operationId: 'offline-before-edit',
      command: {
        type: 'story.answer' as const,
        storyId: id,
        contentVersion: 1,
        questionId: 'q1',
        optionId: 'a',
        occurredAt: START,
      },
    };
    const applied = await learner.mutation(api.offline.apply, request);
    expect(applied.story).toMatchObject({
      id,
      contentVersion: 1,
      archived: true,
      title: '山の朝',
    });
    expect(applied.storyProgress).toMatchObject({
      contentVersion: 1,
      answers: [{ questionId: 'q1', optionId: 'a' }],
    });
    await learner.mutation(api.offline.apply, {
      operationId: 'offline-second-answer',
      command: { ...request.command, questionId: 'q2', optionId: 'b' },
    });
    const finished = await learner.mutation(api.offline.apply, {
      operationId: 'offline-completion',
      command: {
        type: 'story.complete',
        storyId: id,
        contentVersion: 1,
        occurredAt: START,
      },
    });
    const replay = await learner.mutation(api.offline.apply, request);
    expect(replay.story).toEqual(finished.story);
    expect(replay.storyProgress).toEqual(finished.storyProgress);
    expect(
      (
        await learner.query(api.stories.list, {
          paginationOpts: { numItems: 30, cursor: null },
        })
      ).page,
    ).toEqual([]);
    await learner.mutation(api.stories.setArchived, { id, archived: false });
    expect((await learner.query(api.stories.get, { id }))?.progress).toEqual(
      finished.storyProgress,
    );
  });

  test('legacy stored content and queued commands default to version one', async () => {
    const { backend, learner, id } = await setup();
    await backend.run(async (ctx) => {
      const old = content();
      delete old.paragraphs[1].translation;
      await ctx.db.patch('stories', id, { ...old, contentVersion: undefined });
    });
    const legacy = await learner.query(api.stories.get, { id });
    expect(legacy?.story.contentVersion).toBe(1);
    expect(legacy?.story.paragraphs[1].translation).toBeUndefined();
    await learner.mutation(api.stories.update, {
      id,
      expectedContentVersion: 1,
      story: content(),
    });
    const result = await learner.mutation(api.offline.apply, {
      operationId: 'legacy-offline-answer',
      command: {
        type: 'story.answer',
        storyId: id,
        questionId: 'q1',
        optionId: 'a',
        occurredAt: START,
      },
    });
    expect(result.story?.contentVersion).toBe(1);
    expect(result.story?.paragraphs[1].translation).toBeUndefined();
    expect(result.storyProgress?.contentVersion).toBe(1);
  });

  test('offline replay merges answers by time, preserves paragraph position and returns current progress on retry', async () => {
    const { learner, id, clock } = await setup();
    clock.now += 1000;
    const request = {
      operationId: 'story-answer-0001',
      command: {
        type: 'story.answer' as const,
        storyId: id,
        questionId: 'q1',
        optionId: 'b',
        occurredAt: START + 10,
      },
    };
    await learner.mutation(api.offline.apply, request);
    await learner.mutation(api.offline.apply, {
      operationId: 'story-answer-0002',
      command: { ...request.command, optionId: 'a', occurredAt: START + 20 },
    });
    await learner.mutation(api.offline.apply, {
      operationId: 'story-progress-new',
      command: {
        type: 'story.progress',
        storyId: id,
        paragraphIndex: 1,
        occurredAt: START + 30,
      },
    });
    await learner.mutation(api.offline.apply, {
      operationId: 'story-progress-old',
      command: {
        type: 'story.progress',
        storyId: id,
        paragraphIndex: 0,
        occurredAt: START + 5,
      },
    });
    await learner.mutation(api.offline.apply, {
      operationId: 'story-answer-0003',
      command: {
        ...request.command,
        questionId: 'q2',
        optionId: 'b',
        occurredAt: START + 40,
      },
    });
    const complete = await learner.mutation(api.offline.apply, {
      operationId: 'story-complete-0001',
      command: { type: 'story.complete', storyId: id, occurredAt: START + 50 },
    });
    const retried = await learner.mutation(api.offline.apply, request);
    expect(retried.storyProgress).toEqual(complete.storyProgress);
    expect(retried.storyProgress).toMatchObject({
      paragraphIndex: 1,
      completedAt: START + 50,
      answers: [
        { questionId: 'q1', optionId: 'a' },
        { questionId: 'q2', optionId: 'b' },
      ],
    });
    await expect(
      learner.mutation(api.offline.apply, {
        ...request,
        command: { ...request.command, optionId: 'a' },
      }),
    ).rejects.toThrow('outro conteúdo');
  });

  test('offline replay validates ownership, IDs, choices, paragraph bounds and time', async () => {
    const { learner, other, id } = await setup();
    const command = {
      type: 'story.answer' as const,
      storyId: id,
      questionId: 'q1',
      optionId: 'a',
      occurredAt: START,
    };
    await expect(
      other.mutation(api.offline.apply, {
        operationId: 'story-other-owner',
        command,
      }),
    ).rejects.toThrow('indisponível');
    for (const [index, invalid] of [
      { ...command, storyId: 'not-an-id' },
      { ...command, questionId: 'missing' },
      { ...command, optionId: 'missing' },
      { ...command, occurredAt: START - 1 },
      { ...command, occurredAt: START + 300_001 },
      {
        type: 'story.progress' as const,
        storyId: id,
        paragraphIndex: 2,
        occurredAt: START,
      },
    ].entries())
      await expect(
        learner.mutation(api.offline.apply, {
          operationId: `story-invalid-${index}`,
          command: invalid,
        }),
      ).rejects.toThrow();
    expect((await learner.query(api.stories.get, { id }))?.progress).toBeNull();
  });

  test('bounded cache retains an older ongoing story and signals undisplayed stories', async () => {
    const { learner, id, clock } = await setup();
    await learner.mutation(api.stories.saveParagraph, {
      id,
      paragraphIndex: 1,
    });
    for (let i = 0; i < 31; i++) {
      clock.now++;
      await learner.mutation(api.stories.create, {
        clientKey: `story-snapshot-${i}`,
        story: content({ title: `História ${i}` }),
      });
    }
    const snapshot = await learner.query(api.stories.offlineSnapshot, {});
    expect(snapshot.hasMore).toBe(true);
    expect(snapshot.stories).toHaveLength(31);
    expect(snapshot.stories.some((s) => s.id === id)).toBe(true);
    expect(snapshot.storyProgress[0]).toMatchObject({
      storyId: id,
      paragraphIndex: 1,
    });
    expect(
      new TextEncoder().encode(JSON.stringify(snapshot)).byteLength,
    ).toBeLessThan(STORY_LIMITS.snapshotBytes);
  });
});

test('snapshot reconciles archived cached IDs without exposing another account', async () => {
  const { learner, other, id, story } = await setup();
  const foreign = await other.mutation(api.stories.create, {
    clientKey: 'foreign-cache-key',
    story: content(),
  });
  const archived = await learner.mutation(api.stories.setArchived, {
    id,
    archived: true,
  });
  const snapshot = await learner.query(api.stories.offlineSnapshot, {
    cachedIds: [id, id, foreign.id as Id<'stories'>],
  });
  expect(snapshot.stories).toEqual([]);
  expect(snapshot.cachedStates).toEqual([
    { id, archived: true, updatedAt: archived.updatedAt },
  ]);
  expect(archived.updatedAt).toBeGreaterThan(story.updatedAt);
  const restored = await learner.mutation(api.stories.setArchived, {
    id,
    archived: false,
  });
  expect(restored.updatedAt).toBeGreaterThan(archived.updatedAt);
  expect(
    (await learner.query(api.stories.offlineSnapshot, { cachedIds: [id] }))
      .cachedStates,
  ).toEqual([{ id, archived: false, updatedAt: restored.updatedAt }]);
});

test('snapshot bounds explicit cache reconciliation to 100 IDs', async () => {
  const { learner, id } = await setup();
  await expect(
    learner.query(api.stories.offlineSnapshot, {
      cachedIds: Array.from({ length: 101 }, () => id),
    }),
  ).rejects.toThrow('até 100 histórias');
  expect(
    (await learner.query(api.stories.offlineSnapshot, {})).cachedStates,
  ).toEqual([]);
  expect(
    (
      await learner.query(api.stories.offlineSnapshot, {
        cachedIds: Array.from({ length: 100 }, () => id),
      })
    ).cachedStates,
  ).toHaveLength(1);
});

test('shared progress is pure and deterministic for concurrent answer timestamps', () => {
  const story: StoryRecord = {
    ...content(),
    id: 'story',
    archived: false,
    createdAt: START,
    updatedAt: START,
  };
  const first = applyStoryProgress(story, null, {
    type: 'answer',
    questionId: 'q1',
    optionId: 'a',
    occurredAt: START,
  });
  const second = applyStoryProgress(story, first, {
    type: 'answer',
    questionId: 'q1',
    optionId: 'b',
    occurredAt: START,
  });
  const inverse = applyStoryProgress(story, second, {
    type: 'answer',
    questionId: 'q1',
    optionId: 'a',
    occurredAt: START,
  });
  expect(first.answers[0].optionId).toBe('a');
  expect(second).toEqual(inverse);
});
