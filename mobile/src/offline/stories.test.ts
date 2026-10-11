import { describe, expect, it } from 'vitest';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import type { OfflineCommand } from '../../../backend/convex/offlineValidators';
import {
  applyStoryProgress,
  storyScore,
  type StoryProgress,
  type StoryRecord,
} from '../../../shared/stories';
import { OfflineEngine, type Reply } from './engine';
import { applyLocal, clone, emptyData, type Data, type Saved } from './model';
import { mergeStoryCache, mergeStoryProgress } from './stories';

function story(id = 'story-one', createdAt = 1): StoryRecord {
  return {
    id,
    title: '山の朝',
    level: 'N4',
    createdAt,
    updatedAt: createdAt,
    archived: false,
    paragraphs: [
      {
        id: 'p1',
        segments: [{ text: '山', reading: 'やま' }, { text: 'へ行きました。' }],
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
        prompt: 'どこへ？',
        options: [
          { id: 'a', text: '山' },
          { id: 'b', text: '海' },
        ],
        correctOptionId: 'a',
      },
      {
        id: 'q2',
        prompt: 'いつ？',
        options: [
          { id: 'a', text: '朝' },
          { id: 'b', text: '夜' },
        ],
        correctOptionId: 'a',
      },
    ],
  };
}
function data(stories = [story()]): Data {
  return {
    ...emptyData({ _id: 'owner' as Id<'users'> }),
    stories,
    storyProgress: [],
    storiesHasMore: false,
  };
}
function harness(base: Data = data()) {
  let disk: Saved = {
    version: 1,
    accountKey: 'owner',
    base: clone(base),
    queue: [],
    aliases: {},
    lastSyncedAt: 1,
  };
  let now = 10000,
    sequence = 0,
    storageError = false;
  const deps = {
    accountKey: 'owner',
    uuid: () => `story-command-${++sequence}`,
    now: () => now++,
    storage: {
      read: async () => clone(disk),
      write: async (value: Saved) => {
        if (storageError) throw new Error('Armazenamento indisponível');
        disk = clone(value);
      },
    },
  };
  return {
    engine: new OfflineEngine(deps),
    restart: () => new OfflineEngine(deps),
    disk: () => disk,
    failStorage: () => {
      storageError = true;
    },
  };
}
function progress(engine: OfflineEngine, id = 'story-one') {
  return (
    engine.getSnapshot().data!.storyProgress?.find((p) => p.storyId === id) ??
    null
  );
}
async function answer(
  engine: OfflineEngine,
  questionId: string,
  optionId = 'a',
  id = 'story-one',
) {
  return engine.mutate('stories:answer', { id, questionId, optionId });
}

describe('stories offline', () => {
  it('keeps different editions and answers isolated when the same story is read in two quests and the library', () => {
    const original = { ...story(), contentVersion: 1 };
    const first = { ...original, questId: 'quest-one' };
    const second = {
      ...original,
      questId: 'quest-two',
      contentVersion: 2,
      title: 'Edição dois',
    };
    const checkpoint = (record: StoryRecord, optionId: string): StoryProgress =>
      applyStoryProgress(record, null, {
        type: 'answer',
        questionId: 'q1',
        optionId,
        occurredAt: 100,
        contentVersion: record.contentVersion,
        questId: record.questId,
      });
    const previous = data([original, first, second]);
    previous.storyProgress = [
      checkpoint(original, 'a'),
      checkpoint(first, 'b'),
      checkpoint(second, 'a'),
    ];
    const updatedFirst = {
      ...first,
      title: 'Edição nova em trânsito',
      contentVersion: 3,
      updatedAt: 200,
    };
    const updatedSecond = {
      ...second,
      title: 'Edição quatro',
      contentVersion: 4,
      updatedAt: 200,
    };
    const downloaded = data([updatedFirst, updatedSecond]);
    downloaded.storyProgress = [
      checkpoint(updatedFirst, 'a'),
      checkpoint(updatedSecond, 'b'),
    ];
    mergeStoryCache(
      downloaded,
      previous,
      new Set(['story-one:quest:quest-one']),
      new Set(['story-one:quest:quest-one']),
    );
    expect(downloaded.stories).toHaveLength(3);
    expect(
      downloaded.stories?.find((s) => s.questId === 'quest-one')
        ?.contentVersion,
    ).toBe(1);
    expect(
      downloaded.storyProgress?.find((p) => p.questId === 'quest-one')
        ?.answers[0].optionId,
    ).toBe('b');
    expect(
      downloaded.stories?.find((s) => s.questId === 'quest-two')
        ?.contentVersion,
    ).toBe(4);
    expect(
      downloaded.storyProgress?.find((p) => p.questId === 'quest-two')
        ?.answers[0].optionId,
    ).toBe('b');
    expect(downloaded.stories?.find((s) => !s.questId)).toEqual(original);
    expect(
      downloaded.storyProgress?.find((p) => !p.questId)?.answers[0].optionId,
    ).toBe('a');
    expect(
      mergeStoryProgress(checkpoint(first, 'b'), checkpoint(second, 'a')),
    ).toEqual(checkpoint(second, 'a'));
  });

  it('applies archive metadata to every cached reading without erasing its answers', () => {
    const original = story();
    const contextual = { ...original, questId: 'quest-one' };
    const before = data([original, contextual]);
    before.storyProgress = [
      applyStoryProgress(contextual, null, {
        type: 'answer',
        questId: 'quest-one',
        questionId: 'q1',
        optionId: 'a',
        occurredAt: 100,
      }),
    ];
    const downloaded = data([]);
    downloaded.storyCachedStates = [
      { id: original.id, archived: true, updatedAt: 200 },
    ];
    mergeStoryCache(downloaded, before);
    expect(downloaded.stories?.every((s) => s.archived)).toBe(true);
    expect(downloaded.storyProgress).toEqual(before.storyProgress);
  });

  it('keeps a queued reading on its original edition after an editorial update and replays that edition', async () => {
    const original = { ...story(), contentVersion: 1 };
    const edited = {
      ...original,
      title: 'Nova edição',
      contentVersion: 2,
      updatedAt: 500,
    };
    const h = harness(data([original]));
    await h.engine.load();
    await answer(h.engine, 'q1', 'b');
    await h.engine.acceptRemoteStory(edited, null);
    expect(h.engine.getSnapshot().data!.stories![0].title).toBe(original.title);
    expect(h.disk().queue[0].command).toMatchObject({
      type: 'story.answer',
      contentVersion: 1,
    });
    const server = data([original]);
    await h.engine.synchronizePending(
      async (_, command) => ({
        mappings: [],
        story: original,
        storyProgress: applyLocal(server, command) as StoryProgress,
      }),
      () => true,
    );
    expect(h.engine.getSnapshot().status.pending).toBe(0);
    // An old in-flight get can still report the latest edition with no reading.
    await h.engine.acceptRemoteStory(edited, null);
    expect(h.engine.getSnapshot().data!.stories![0].contentVersion).toBe(1);
    expect(progress(h.engine)).toMatchObject({
      contentVersion: 1,
      answers: [{ questionId: 'q1', optionId: 'b' }],
    });
    const restarted = h.restart();
    await restarted.load();
    expect(restarted.getSnapshot().data!.stories![0].contentVersion).toBe(1);
  });

  it('downloads the latest edition before starting and journals its version', async () => {
    const h = harness();
    await h.engine.load();
    const edited = {
      ...story(),
      title: 'Nova edição',
      contentVersion: 2,
      updatedAt: 500,
    };
    await h.engine.acceptRemoteStory(edited, null);
    await answer(h.engine, 'q1');
    expect(h.disk().queue[0].command).toMatchObject({ contentVersion: 2 });
    expect(progress(h.engine)).toMatchObject({ contentVersion: 2 });
  });

  it('reconciles an authoritative saved older edition together with its answers', async () => {
    const original = { ...story(), contentVersion: 1 };
    const edited = {
      ...original,
      title: 'Nova edição',
      contentVersion: 2,
      updatedAt: 500,
    };
    const h = harness(data([edited]));
    await h.engine.load();
    const pinned = applyStoryProgress(original, null, {
      type: 'answer',
      questionId: 'q1',
      optionId: 'b',
      occurredAt: 100,
      contentVersion: 1,
    });
    await h.engine.acceptRemoteStory(original, pinned);
    expect(h.engine.getSnapshot().data!.stories![0].contentVersion).toBe(1);
    expect(progress(h.engine)).toEqual(pinned);
    const currentProgress = { ...pinned, contentVersion: 2, answers: [] };
    expect(mergeStoryProgress(pinned, currentProgress)).toEqual(
      currentProgress,
    );
  });

  it('does not replace an open reading with a newer edition during a catalogue refresh', async () => {
    const original = { ...story(), contentVersion: 1 };
    const edited = {
      ...original,
      title: 'Nova edição',
      contentVersion: 2,
      updatedAt: 500,
    };
    const h = harness(data([original]));
    await h.engine.load();
    const release = h.engine.retainStory(original.id);
    await h.engine.synchronize(
      async () => ({ mappings: [] }),
      async () => data([edited]),
      () => true,
    );
    expect(h.engine.getSnapshot().data!.stories![0].contentVersion).toBe(1);
    release();
    await h.engine.synchronize(
      async () => ({ mappings: [] }),
      async () => data([edited]),
      () => true,
    );
    expect(h.engine.getSnapshot().data!.stories![0].contentVersion).toBe(2);
  });

  it('durably resumes answers, reading position and reading preferences after restart', async () => {
    const h = harness();
    await h.engine.load();
    await h.engine.mutate('stories:saveParagraph', {
      id: 'story-one',
      paragraphIndex: 1,
    });
    await answer(h.engine, 'q1', 'b');
    await h.engine.setStoryPreferences({ furigana: false, textSize: 'extra' });
    const reopened = h.restart();
    await reopened.load();
    expect(progress(reopened)).toMatchObject({
      paragraphIndex: 1,
      answers: [{ questionId: 'q1', optionId: 'b' }],
    });
    expect(reopened.getSnapshot().saved?.storyPreferences).toEqual({
      furigana: false,
      textSize: 'extra',
    });
    expect(reopened.getSnapshot().status.pending).toBe(2);
    await reopened.setStoryPreferences({ textSize: 'large' });
    expect(h.disk().storyPreferences).toEqual({
      furigana: false,
      textSize: 'large',
    });
  });

  it('rejects incomplete completion and invalid selections without journaling them', async () => {
    const { engine, disk } = harness();
    await engine.load();
    await expect(
      engine.mutate('stories:complete', { id: 'story-one' }),
    ).rejects.toThrow('todas as perguntas');
    await expect(answer(engine, 'q1', 'missing')).rejects.toThrow(
      'alternativa',
    );
    await expect(
      engine.mutate('stories:saveParagraph', {
        id: 'story-one',
        paragraphIndex: 2,
      }),
    ).rejects.toThrow('parágrafo');
    expect(disk().queue).toHaveLength(0);
    await answer(engine, 'q1', 'b');
    await answer(engine, 'q2');
    await engine.mutate('stories:complete', { id: 'story-one' });
    expect(progress(engine)?.completedAt).toBeDefined();
    expect(storyScore(story(), progress(engine))).toMatchObject({
      correct: 1,
      total: 2,
    });
  });

  it('keeps completed answers frozen during rereading', async () => {
    const { engine } = harness();
    await engine.load();
    await answer(engine, 'q1', 'b');
    await answer(engine, 'q2');
    await engine.mutate('stories:complete', { id: 'story-one' });
    const before = clone(progress(engine));
    await answer(engine, 'q1');
    await engine.mutate('stories:saveParagraph', {
      id: 'story-one',
      paragraphIndex: 1,
    });
    expect(progress(engine)).toEqual(before);
  });

  it('retries a lost acknowledgement with exactly the persisted payload and server result', async () => {
    const h = harness();
    await h.engine.load();
    await answer(h.engine, 'q1', 'b');
    await answer(h.engine, 'q2');
    await h.engine.mutate('stories:complete', { id: 'story-one' });
    const server = data(),
      receipts = new Map<string, { command: OfflineCommand; reply: Reply }>();
    let loseAck = true,
      sends = 0;
    const send = async (
      id: string,
      command: OfflineCommand,
    ): Promise<Reply> => {
      sends++;
      const receipt = receipts.get(id);
      if (receipt) {
        expect(command).toEqual(receipt.command);
        return clone(receipt.reply);
      }
      const result = applyLocal(server, command, {}) as StoryProgress;
      const reply: Reply = { mappings: [], storyProgress: result };
      receipts.set(id, { command: clone(command), reply: clone(reply) });
      if (loseAck) {
        loseAck = false;
        throw new Error('Resposta de rede perdida');
      }
      return reply;
    };
    await h.engine.synchronizePending(send, () => true);
    expect(h.disk().queue).toHaveLength(3);
    expect(h.disk().queue[0].sent).toEqual(h.disk().queue[0].command);
    const restarted = h.restart();
    await restarted.load();
    await restarted.synchronizePending(send, () => true);
    expect(sends).toBe(4);
    expect(receipts.size).toBe(3);
    expect(restarted.getSnapshot().status.pending).toBe(0);
    expect(progress(restarted)).toEqual(server.storyProgress![0]);
    expect(progress(restarted)?.answers).toHaveLength(2);
    expect(progress(restarted)?.completedAt).toBeDefined();
  });

  it('takes the authoritative completed result after another device finishes first', async () => {
    const { engine } = harness();
    await engine.load();
    await answer(engine, 'q1', 'b');
    let remote = applyStoryProgress(story(), null, {
      type: 'answer',
      questionId: 'q1',
      optionId: 'a',
      occurredAt: 50,
    });
    remote = applyStoryProgress(story(), remote, {
      type: 'answer',
      questionId: 'q2',
      optionId: 'a',
      occurredAt: 60,
    });
    remote = applyStoryProgress(story(), remote, {
      type: 'complete',
      occurredAt: 70,
    });
    await engine.synchronizePending(
      async () => ({ mappings: [], storyProgress: remote }),
      () => true,
    );
    expect(progress(engine)).toEqual(remote);
    expect(storyScore(story(), progress(engine)).correct).toBe(2);
  });

  it('keeps an opened old story and newer progress through a catalogue refresh', async () => {
    const { engine, restart } = harness();
    await engine.load();
    const old = story('older-story', 1);
    const oldProgress = applyStoryProgress(old, null, {
      type: 'progress',
      paragraphIndex: 1,
      occurredAt: 100,
    });
    await engine.acceptRemoteStory(old, oldProgress);
    await engine.synchronize(
      async () => ({ mappings: [] }),
      async () => data([story('new-story', 300)]),
      () => true,
    );
    expect(engine.getSnapshot().data?.stories?.map((s) => s.id)).toContain(
      'older-story',
    );
    expect(progress(engine, 'older-story')).toEqual(oldProgress);
    const reopened = restart();
    await reopened.load();
    expect(progress(reopened, 'older-story')).toEqual(oldProgress);
  });

  it('keeps a pending answer when a newly downloaded copy has older progress', async () => {
    const { engine } = harness();
    await engine.load();
    await answer(engine, 'q1');
    const stale = applyStoryProgress(story(), null, {
      type: 'answer',
      questionId: 'q1',
      optionId: 'b',
      occurredAt: 10,
    });
    await engine.acceptRemoteStory(story(), stale);
    expect(progress(engine)?.answers[0].optionId).toBe('a');
    expect(engine.getSnapshot().status.pending).toBe(1);
  });

  it('reconciles remote archival without letting an older in-flight get restore it', async () => {
    const h = harness();
    await h.engine.load();
    const refresh = data([]);
    refresh.storyCachedStates = [
      { id: 'story-one', archived: true, updatedAt: 500 },
    ];
    await h.engine.synchronize(
      async () => ({ mappings: [] }),
      async () => clone(refresh),
      () => true,
    );
    expect(h.engine.getSnapshot().data?.stories?.[0]).toMatchObject({
      id: 'story-one',
      archived: true,
      updatedAt: 500,
    });
    expect(h.disk().base.storyCachedStates).toBeUndefined();
    await h.engine.acceptRemoteStory(story(), null);
    expect(h.engine.getSnapshot().data?.stories?.[0].archived).toBe(true);
    const restarted = h.restart();
    await restarted.load();
    expect(restarted.getSnapshot().data?.stories?.[0].archived).toBe(true);
    const restored = data([]);
    restored.storyCachedStates = [
      { id: 'story-one', archived: false, updatedAt: 501 },
    ];
    await restarted.synchronize(
      async () => ({ mappings: [] }),
      async () => restored,
      () => true,
    );
    expect(restarted.getSnapshot().data?.stories?.[0]).toMatchObject({
      archived: false,
      updatedAt: 501,
    });
  });

  it('keeps an old completed story throughout rereading and permits eviction only after unpinning', async () => {
    const old = story('old-completed', 1);
    let completed = applyStoryProgress(old, null, {
      type: 'answer',
      questionId: 'q1',
      optionId: 'a',
      occurredAt: 2,
    });
    completed = applyStoryProgress(old, completed, {
      type: 'answer',
      questionId: 'q2',
      optionId: 'a',
      occurredAt: 3,
    });
    completed = applyStoryProgress(old, completed, {
      type: 'complete',
      occurredAt: 4,
    });
    const initial = data([old]);
    initial.storyProgress = [completed];
    const h = harness(initial);
    await h.engine.load();
    const unpin = h.engine.retainStory(old.id);
    const secondUnpin = h.engine.retainStory(old.id);
    const refresh = async () =>
      data(Array.from({ length: 100 }, (_, i) => story(`fresh-${i}`, 100 + i)));
    await h.engine.synchronize(
      async () => ({ mappings: [] }),
      refresh,
      () => true,
    );
    expect(h.engine.getSnapshot().data?.stories).toHaveLength(101);
    expect(progress(h.engine, old.id)).toEqual(completed);
    unpin();
    await h.engine.synchronize(
      async () => ({ mappings: [] }),
      refresh,
      () => true,
    );
    expect(progress(h.engine, old.id)).toEqual(completed);
    secondUnpin();
    await h.engine.synchronize(
      async () => ({ mappings: [] }),
      refresh,
      () => true,
    );
    expect(h.engine.getSnapshot().data?.stories).toHaveLength(100);
    expect(
      h.engine.getSnapshot().data?.stories?.some((s) => s.id === old.id),
    ).toBe(false);
    expect(progress(h.engine, old.id)).toBeNull();
    expect(h.disk().base.storyProgress).toEqual([]);
  });

  it('caps stored stories at 100, while never evicting an unsynchronized story', async () => {
    const initial = data(
      Array.from({ length: 100 }, (_, i) => story(`story-${i}`, i + 1)),
    );
    const h = harness(initial);
    await h.engine.load();
    await answer(h.engine, 'q1', 'a', 'story-0');
    for (let i = 100; i < 105; i++)
      await h.engine.acceptRemoteStory(story(`story-${i}`, i + 1), null);
    const cached = h.engine.getSnapshot().data!.stories!;
    expect(cached).toHaveLength(101);
    expect(cached.some((s) => s.id === 'story-0')).toBe(true);
    expect(cached.some((s) => s.id === 'story-1')).toBe(false);
    const reopened = h.restart();
    await reopened.load();
    expect(progress(reopened, 'story-0')?.answers).toHaveLength(1);
  });

  it('evicts old completed progress together with its text, keeping an ongoing recent reading', () => {
    const old = data([story('old', 1)]),
      downloaded = data(
        Array.from({ length: 101 }, (_, i) => story(`new-${i}`, i + 2)),
      );
    old.storyProgress = [
      applyStoryProgress(old.stories![0], null, {
        type: 'progress',
        paragraphIndex: 1,
        occurredAt: 1000,
      }),
    ];
    mergeStoryCache(downloaded, old);
    expect(downloaded.stories).toHaveLength(100);
    expect(downloaded.stories!.some((s) => s.id === 'old')).toBe(true);
    expect(downloaded.stories!.some((s) => s.id === 'new-0')).toBe(false);
    expect(downloaded.storyProgress![0].storyId).toBe('old');
  });

  it('leaves the journal and preferences unchanged when disk persistence fails', async () => {
    const h = harness();
    await h.engine.load();
    h.failStorage();
    await expect(answer(h.engine, 'q1')).rejects.toThrow('Armazenamento');
    await expect(
      h.engine.setStoryPreferences({ furigana: false }),
    ).rejects.toThrow('Armazenamento');
    expect(h.disk().queue).toHaveLength(0);
    expect(h.disk().storyPreferences).toBeUndefined();
    expect(progress(h.engine)).toBeNull();
  });

  it('merges per-question timestamps independently from the last-read paragraph', () => {
    let local = applyStoryProgress(story(), null, {
      type: 'progress',
      paragraphIndex: 1,
      occurredAt: 40,
    });
    local = applyStoryProgress(story(), local, {
      type: 'answer',
      questionId: 'q1',
      optionId: 'a',
      occurredAt: 50,
    });
    let remote = applyStoryProgress(story(), null, {
      type: 'progress',
      paragraphIndex: 0,
      occurredAt: 30,
    });
    remote = applyStoryProgress(story(), remote, {
      type: 'answer',
      questionId: 'q2',
      optionId: 'b',
      occurredAt: 60,
    });
    const merged = mergeStoryProgress(local, remote);
    expect(merged.paragraphIndex).toBe(1);
    expect(merged.paragraphUpdatedAt).toBe(40);
    expect(merged.answers).toHaveLength(2);
    expect(merged.updatedAt).toBe(60);
  });
});
