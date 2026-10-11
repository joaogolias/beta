import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctionName } from 'convex/server';
import { api } from '../../../backend/convex/_generated/api';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import type { QuestSnapshot } from '../../../shared/quests';
import {
  storySummary,
  type StoryLevel,
  type StoryProgress,
  type StoryRecord,
} from '../../../shared/stories';
import { OfflineEngine } from '../offline/engine';
import { useMutation } from '../offline/hooks';
import { clone, emptyData, type Data, type Saved } from '../offline/model';
import type { OfflineContextValue } from '../offline/Provider';
import { useStories, useStory, useStoryPreferences } from './hooks';

const mocks = vi.hoisted(() => ({ client: { query: vi.fn() } }));
vi.mock('convex/react', () => ({ useConvex: () => mocks.client }));
vi.mock('../offline/Provider', () => ({ useOfflineContext: () => context }));

let context: OfflineContextValue;
let catalog: ReturnType<typeof useStories>;
let reader: ReturnType<typeof useStory>;
let preferences: ReturnType<typeof useStoryPreferences>;
let startQuest: ReturnType<typeof useMutation<typeof api.quests.start>>;
const trees: ReactTestRenderer[] = [];

function story(
  id = 'story-one',
  level: StoryLevel = 'N4',
  createdAt = 1,
): StoryRecord {
  return {
    id,
    level,
    title: `山の朝 ${id}`,
    createdAt,
    updatedAt: createdAt,
    archived: false,
    paragraphs: [
      {
        id: 'p1',
        segments: [{ text: '山', reading: 'やま' }, { text: 'へ行きました。' }],
      },
      { id: 'p2', segments: [{ text: '朝は静かでした。' }] },
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
function finished(id: string): StoryProgress {
  return {
    storyId: id,
    paragraphIndex: 1,
    paragraphUpdatedAt: 499,
    answers: [{ questionId: 'q1', optionId: 'a', answeredAt: 499 }],
    startedAt: 400,
    updatedAt: 500,
    completedAt: 500,
  };
}
function base(stories: StoryRecord[] = []): Data {
  return {
    ...emptyData({ _id: 'owner' as Id<'users'> }),
    stories,
    storyProgress: [],
    storiesHasMore: false,
  };
}
function readingQuest(storyIds: string[]): QuestSnapshot {
  return {
    id: 'quest-one',
    title: 'Leituras escolhidas',
    startsAt: 1,
    dueAt: 20_000,
    timeZone: 'UTC',
    createdAt: 1,
    updatedAt: 1,
    cardIds: [],
    paperIds: [],
    storyIds,
    completedCardIds: [],
    completedPaperIds: [],
    completedStoryIds: [],
  };
}
async function setup(data: Data = base()) {
  let disk: Saved = {
    version: 1,
    accountKey: 'owner',
    base: clone(data),
    queue: [],
    aliases: {},
    lastSyncedAt: 1,
  };
  let sequence = 0,
    now = 1000;
  const deps = {
    accountKey: 'owner',
    uuid: () => `story-hook-${++sequence}`,
    now: () => now++,
    storage: {
      read: async () => clone(disk),
      write: async (next: Saved) => {
        disk = clone(next);
      },
    },
  };
  const engine = new OfflineEngine(deps);
  await engine.load();
  context = {
    engine,
    online: true,
    offlineMode: false,
    switchingMode: false,
    modeError: null,
    setOfflineMode: vi.fn(async () => {}),
    assertCanEditLibrary: vi.fn(),
    refresh: vi.fn(async () => {}),
    flushPending: vi.fn(async () => {}),
    retry: vi.fn(),
    resolveConflict: vi.fn(async () => {}),
  };
  return { engine, disk: () => disk, restart: () => new OfflineEngine(deps) };
}
function CatalogProbe({
  level,
  status = 'all',
}: {
  level?: StoryLevel;
  status?: 'all' | 'new' | 'completed';
}) {
  const value = useStories({ level, status });
  useEffect(() => {
    catalog = value;
  }, [value]);
  return null;
}
function ReaderProbe({ id, questId }: { id: string; questId?: string }) {
  const value = useStory(id, questId);
  useEffect(() => {
    reader = value;
  }, [value]);
  return null;
}
function PreferencesProbe() {
  const value = useStoryPreferences();
  useEffect(() => {
    preferences = value;
  }, [value]);
  return null;
}
function QuestStartProbe() {
  const value = useMutation(api.quests.start);
  useEffect(() => {
    startQuest = value;
  }, [value]);
  return null;
}
async function render(element: Parameters<typeof create>[0]) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(element);
  });
  trees.push(tree);
  return tree;
}
function page(stories: StoryRecord[], cursor = '', done = true) {
  return {
    page: stories.map((s) => storySummary(s, null)),
    continueCursor: cursor,
    isDone: done,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.client.query.mockReset();
});
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => tree.unmount());
  vi.unstubAllGlobals();
});

describe('story hooks with the durable offline engine', () => {
  it('downloads an older selected story and retains it across a catalogue refresh until its quest start is journaled', async () => {
    const quest = readingQuest(['older-story']);
    const freshCatalogue = {
      ...base(
        Array.from({ length: 100 }, (_, index) =>
          story(`recent-${index}`, 'N4', 10_000 + index),
        ),
      ),
      quests: [quest],
    };
    const h = await setup(freshCatalogue);
    const selected = {
      ...story('older-story'),
      contentVersion: 3,
      questId: quest.id,
    };
    const request = deferred<{
      story: StoryRecord;
      progress: null;
      quest: QuestSnapshot;
    }>();
    mocks.client.query.mockReturnValueOnce(request.promise);
    const accept = h.engine.acceptRemoteStory.bind(h.engine);
    vi.spyOn(h.engine, 'acceptRemoteStory').mockImplementation(
      async (...args) => {
        await accept(...args);
        // A lifecycle download already in flight can finish between caching and start.
        await h.engine.synchronize(
          async () => ({ mappings: [] }),
          async () => clone(freshCatalogue),
          () => true,
        );
      },
    );
    await render(<QuestStartProbe />);
    let opening!: ReturnType<typeof startQuest>;
    await act(async () => {
      opening = startQuest({ id: quest.id as Id<'quests'> });
    });
    expect(h.disk().queue).toHaveLength(0);
    expect(context.retry).not.toHaveBeenCalled();
    await act(async () => {
      request.resolve({ story: selected, progress: null, quest });
      await expect(opening).resolves.toEqual({
        kind: 'story',
        storyId: selected.id,
        questId: quest.id,
      });
    });
    expect(mocks.client.query).toHaveBeenCalledExactlyOnceWith(
      api.stories.get,
      { id: selected.id, questId: quest.id },
    );
    expect(h.disk().queue.map(({ command }) => command)).toEqual([
      expect.objectContaining({
        type: 'story.progress',
        storyId: selected.id,
        questId: quest.id,
        contentVersion: 3,
      }),
    ]);
    expect(h.engine.getSnapshot().data?.stories).toContainEqual(selected);
    expect(context.retry).toHaveBeenCalledOnce();
    // With no reader mounted, ACK + a later refresh may evict it normally again.
    await h.engine.synchronize(
      async () => ({ mappings: [] }),
      async () => clone(freshCatalogue),
      () => true,
    );
    expect(h.disk().queue).toHaveLength(0);
    expect(h.disk().base.stories?.some((s) => s.id === selected.id)).toBe(
      false,
    );
  });

  it('starts the next selected story when another device has finished the locally pending first story', async () => {
    const quest = readingQuest(['first-story', 'second-story']);
    const updatedQuest = {
      ...quest,
      updatedAt: 500,
      completedStoryIds: ['first-story'],
    };
    const h = await setup({ ...base(), quests: [quest] });
    mocks.client.query
      .mockResolvedValueOnce({
        story: { ...story('first-story'), questId: quest.id },
        progress: { ...finished('first-story'), questId: quest.id },
        quest: updatedQuest,
      })
      .mockResolvedValueOnce({
        story: { ...story('second-story'), questId: quest.id },
        progress: null,
        quest: updatedQuest,
      });
    await render(<QuestStartProbe />);
    await act(async () => {
      await expect(
        startQuest({ id: quest.id as Id<'quests'> }),
      ).resolves.toEqual({
        kind: 'story',
        storyId: 'second-story',
        questId: quest.id,
      });
    });
    expect(mocks.client.query.mock.calls.map(([, args]) => args)).toEqual([
      { id: 'first-story', questId: quest.id },
      { id: 'second-story', questId: quest.id },
    ]);
    expect(h.disk().queue.map(({ command }) => command)).toEqual([
      expect.objectContaining({
        type: 'story.progress',
        storyId: 'second-story',
        questId: quest.id,
      }),
    ]);
    expect(h.engine.getSnapshot().data?.quests?.[0].completedStoryIds).toEqual([
      'first-story',
    ]);
  });

  it('opens the saved final result when the whole quest was completed on another device without creating another reading', async () => {
    const quest = readingQuest(['last-story']);
    const completedQuest = {
      ...quest,
      updatedAt: 500,
      completedAt: 500,
      completedStoryIds: ['last-story'],
    };
    const h = await setup({ ...base(), quests: [quest] });
    mocks.client.query.mockResolvedValue({
      story: { ...story('last-story'), questId: quest.id },
      progress: { ...finished('last-story'), questId: quest.id },
      quest: completedQuest,
    });
    await render(<QuestStartProbe />);
    await act(async () => {
      await expect(
        startQuest({ id: quest.id as Id<'quests'> }),
      ).resolves.toEqual({
        kind: 'story',
        storyId: 'last-story',
        questId: quest.id,
      });
    });
    expect(h.disk().queue).toHaveLength(0);
    expect(h.engine.getSnapshot().data?.quests).toEqual([completedQuest]);
    expect(h.engine.getSnapshot().data?.storyProgress?.[0].completedAt).toBe(
      500,
    );
    expect(mocks.client.query).toHaveBeenCalledOnce();
  });

  it('keeps quest editions and progress out of the ordinary story catalogue', async () => {
    const global = story();
    const quest = { ...global, questId: 'quest-one', title: 'Edição da quest' };
    const questOnly = { ...story('quest-only'), questId: 'quest-one' };
    await setup({
      ...base([quest, global, questOnly]),
      storyProgress: [{ ...finished(global.id), questId: 'quest-one' }],
    });
    context = { ...context, online: false, offlineMode: true };
    await render(<CatalogProbe status="new" />);
    expect(catalog.items.map((item) => item.id)).toEqual([global.id]);
    expect(catalog.items[0].title).toBe(global.title);
    expect(catalog.items[0].progress).toBeNull();
  });

  it('opens a fresh quest reading independently of completed global and other quest readings', async () => {
    const global = story();
    const selected = { ...global, questId: 'quest-one' };
    const data = {
      ...base([global]),
      storyProgress: [
        finished(global.id),
        { ...finished(global.id), questId: 'other-quest' },
      ],
      quests: [
        {
          id: 'quest-one',
          title: 'Uma história',
          startsAt: 1,
          dueAt: 10_000,
          timeZone: 'UTC',
          createdAt: 1,
          updatedAt: 1,
          cardIds: [],
          paperIds: [],
          storyIds: [global.id],
          completedCardIds: [],
          completedPaperIds: [],
          completedStoryIds: [],
        },
      ],
    };
    const h = await setup(data);
    mocks.client.query.mockResolvedValue({ story: selected, progress: null });
    await render(<ReaderProbe id={global.id} questId="quest-one" />);
    expect(mocks.client.query.mock.calls[0][1]).toEqual({
      id: global.id,
      questId: 'quest-one',
    });
    expect(reader.story?.questId).toBe('quest-one');
    expect(reader.progress).toBeNull();
    await act(async () => reader.answer('q1', 'b'));
    await act(async () => reader.complete());
    expect(h.disk().queue.map(({ command }) => command)).toEqual([
      expect.objectContaining({
        type: 'story.answer',
        storyId: global.id,
        questId: 'quest-one',
      }),
      expect.objectContaining({
        type: 'story.complete',
        storyId: global.id,
        questId: 'quest-one',
      }),
    ]);
    expect(reader.progress?.questId).toBe('quest-one');
    expect(reader.progress?.answers[0].optionId).toBe('b');
    expect(
      h.engine.getSnapshot().data?.storyProgress?.find((p) => !p.questId),
    ).toEqual(finished(global.id));
    expect(h.engine.getSnapshot().data?.quests?.[0].completedStoryIds).toEqual([
      global.id,
    ]);
  });

  it('ignores a stale request when changing quests for the same story', async () => {
    const s = story();
    const h = await setup(base([s]));
    const first = deferred<{
      story: StoryRecord;
      progress: StoryProgress | null;
    }>();
    mocks.client.query.mockReturnValueOnce(first.promise);
    const tree = await render(<ReaderProbe id={s.id} questId="quest-one" />);
    mocks.client.query.mockResolvedValueOnce({
      story: { ...s, questId: 'quest-two' },
      progress: null,
    });
    await act(async () =>
      tree.update(<ReaderProbe id={s.id} questId="quest-two" />),
    );
    await act(async () =>
      first.resolve({
        story: { ...s, questId: 'quest-one' },
        progress: { ...finished(s.id), questId: 'quest-one' },
      }),
    );
    expect(reader.story?.questId).toBe('quest-two');
    expect(reader.progress).toBeNull();
    expect(
      h.disk().base.storyProgress?.some((p) => p.questId === 'quest-one'),
    ).toBe(false);
  });

  it('reconciles a quest completed on another device together with its reading result', async () => {
    const selected = { ...story(), questId: 'quest-one' };
    const staleQuest = {
      id: 'quest-one',
      title: 'Uma história',
      startsAt: 1,
      dueAt: 10_000,
      timeZone: 'UTC',
      createdAt: 1,
      updatedAt: 1,
      cardIds: [],
      paperIds: [],
      storyIds: [selected.id],
      completedCardIds: [],
      completedPaperIds: [],
      completedStoryIds: [],
    };
    const completedQuest = {
      ...staleQuest,
      updatedAt: 500,
      completedAt: 500,
      completedStoryIds: [selected.id],
    };
    const h = await setup({ ...base([selected]), quests: [staleQuest] });
    mocks.client.query.mockResolvedValue({
      story: selected,
      progress: { ...finished(selected.id), questId: selected.questId },
      quest: completedQuest,
    });
    await render(<ReaderProbe id={selected.id} questId={selected.questId} />);
    expect(reader.progress?.completedAt).toBe(500);
    expect(h.engine.getSnapshot().data?.quests).toEqual([completedQuest]);
  });
  it('keeps a locally completed story in history while completion waits for sync and the remote history is empty', async () => {
    const h = await setup(base([story()]));
    await h.engine.mutate('stories:answer', {
      id: 'story-one',
      questionId: 'q1',
      optionId: 'b',
    });
    await h.engine.mutate('stories:complete', { id: 'story-one' });
    mocks.client.query.mockResolvedValue(page([]));
    await render(<CatalogProbe status="completed" />);
    expect(catalog.loading).toBe(false);
    expect(catalog.items.map((item) => item.id)).toEqual(['story-one']);
    expect(catalog.items[0].progress?.completedAt).toBeDefined();
    expect(h.disk().queue).toHaveLength(2);
  });

  it('does not replace a remote completed result with a newer pending local answer during the catalogue union', async () => {
    const s = story();
    const h = await setup(base([s]));
    await h.engine.mutate('stories:answer', {
      id: s.id,
      questionId: 'q1',
      optionId: 'b',
    });
    const completed = finished(s.id);
    mocks.client.query.mockResolvedValue({
      page: [storySummary(s, completed)],
      continueCursor: '',
      isDone: true,
    });
    await render(<CatalogProbe />);
    expect(catalog.items).toHaveLength(1);
    expect(catalog.items[0].progress).toEqual(completed);
    expect(h.disk().queue).toHaveLength(1);
  });

  it('retries a failed next page with the same cursor and preserves previously loaded items', async () => {
    await setup();
    const first = story('one'),
      second = story('two', 'N4', 2);
    mocks.client.query.mockResolvedValueOnce(page([first], 'next-page', false));
    await render(<CatalogProbe />);
    mocks.client.query.mockRejectedValueOnce(new Error('Conexão interrompida'));
    await act(async () => catalog.loadMore());
    expect(catalog.items.map((item) => item.id)).toEqual(['one']);
    expect(catalog.error).toBe('Conexão interrompida');
    expect(catalog.loadingMore).toBe(false);
    expect(catalog.hasMore).toBe(true);
    mocks.client.query.mockResolvedValueOnce(page([second]));
    await act(async () => catalog.loadMore());
    expect(catalog.error).toBeNull();
    expect(catalog.items.map((item) => item.id)).toEqual(['two', 'one']);
    expect(catalog.hasMore).toBe(false);
    expect(
      mocks.client.query.mock.calls
        .slice(1)
        .map((call) => call[1].paginationOpts.cursor),
    ).toEqual(['next-page', 'next-page']);
  });

  it('ignores a previous filter page that resolves after a new filter and does not mix their items or cursors', async () => {
    await setup();
    const oldPage = deferred<ReturnType<typeof page>>();
    mocks.client.query.mockReturnValueOnce(oldPage.promise);
    const tree = await render(<CatalogProbe level="N4" />);
    expect(catalog.loading).toBe(true);
    mocks.client.query.mockResolvedValueOnce(
      page([story('n3', 'N3')], 'n3-next', false),
    );
    await act(async () => tree.update(<CatalogProbe level="N3" />));
    expect(catalog.items.map((item) => item.id)).toEqual(['n3']);
    await act(async () =>
      oldPage.resolve(page([story('n4', 'N4')], 'n4-next', false)),
    );
    expect(catalog.items.map((item) => item.id)).toEqual(['n3']);
    mocks.client.query.mockResolvedValueOnce(page([story('n3-two', 'N3', 2)]));
    await act(async () => catalog.loadMore());
    expect(mocks.client.query.mock.lastCall?.[1]).toMatchObject({
      level: 'N3',
      paginationOpts: { cursor: 'n3-next' },
    });
    expect(catalog.items.map((item) => item.id)).toEqual(['n3-two', 'n3']);
  });

  it('downloads a story through the real hook and durably makes it available after an offline restart', async () => {
    const h = await setup();
    const downloaded = story('old-story');
    const progress = { ...finished(downloaded.id), completedAt: undefined };
    mocks.client.query.mockResolvedValue({ story: downloaded, progress });
    await render(<ReaderProbe id={downloaded.id} />);
    expect(reader.loading).toBe(false);
    expect(reader.story).toEqual(downloaded);
    expect(reader.progress).toEqual(progress);
    expect(getFunctionName(mocks.client.query.mock.calls[0][0])).toBe(
      'stories:get',
    );
    expect(h.disk().base.stories).toContainEqual(downloaded);
    expect(h.disk().base.storyProgress).toContainEqual(progress);
    const restarted = h.restart();
    await restarted.load();
    context = {
      ...context,
      engine: restarted,
      online: false,
      offlineMode: true,
    };
    mocks.client.query.mockClear();
    await render(<ReaderProbe id={downloaded.id} />);
    expect(reader.story).toEqual(downloaded);
    expect(reader.progress).toEqual(progress);
    expect(reader.loading).toBe(false);
    expect(mocks.client.query).not.toHaveBeenCalled();
  });

  it('does not cache a stale download when the reader switched to another story before it arrived', async () => {
    const h = await setup();
    const old = deferred<{ story: StoryRecord; progress: null }>();
    mocks.client.query.mockReturnValueOnce(old.promise);
    const tree = await render(<ReaderProbe id="old" />);
    const current = story('current');
    mocks.client.query.mockResolvedValueOnce({
      story: current,
      progress: null,
    });
    await act(async () => tree.update(<ReaderProbe id="current" />));
    await act(async () => old.resolve({ story: story('old'), progress: null }));
    expect(reader.story).toEqual(current);
    expect(h.disk().base.stories?.map((s) => s.id)).toEqual(['current']);
  });

  it('reconciles the latest edition before exposing a never-started cached story online', async () => {
    const original = { ...story(), contentVersion: 1 };
    const edited = {
      ...original,
      contentVersion: 2,
      title: 'Nova edição',
      updatedAt: 500,
    };
    const h = await setup(base([original]));
    const request = deferred<{ story: StoryRecord; progress: null }>();
    mocks.client.query.mockReturnValueOnce(request.promise);
    await render(<ReaderProbe id={original.id} />);
    expect(reader.loading).toBe(true);
    expect(reader.story).toBeUndefined();
    expect(h.disk().queue).toHaveLength(0);
    await act(async () => request.resolve({ story: edited, progress: null }));
    expect(reader.loading).toBe(false);
    expect(reader.story).toEqual(edited);
    await act(async () => reader.saveParagraph(0));
    expect(h.disk().queue[0].command).toMatchObject({ contentVersion: 2 });
  });

  it('opens an already started story immediately while its remote query is pending', async () => {
    const s = story();
    const reading = { ...finished(s.id), completedAt: undefined };
    const data = { ...base([s]), storyProgress: [reading] };
    await setup(data);
    const request = deferred<{ story: StoryRecord; progress: StoryProgress }>();
    mocks.client.query.mockReturnValueOnce(request.promise);
    await render(<ReaderProbe id={s.id} />);
    expect(reader.loading).toBe(false);
    expect(reader.story).toEqual(s);
    expect(reader.progress).toEqual(reading);
    await act(async () => request.resolve({ story: s, progress: reading }));
  });

  it('opens pending offline progress immediately and preserves its edition after the query completes', async () => {
    const original = { ...story(), contentVersion: 1 };
    const edited = {
      ...original,
      contentVersion: 2,
      title: 'Nova edição',
      updatedAt: 500,
    };
    const h = await setup(base([original]));
    await h.engine.mutate('stories:saveParagraph', {
      id: original.id,
      paragraphIndex: 1,
    });
    const request = deferred<{ story: StoryRecord; progress: null }>();
    mocks.client.query.mockReturnValueOnce(request.promise);
    await render(<ReaderProbe id={original.id} />);
    expect(reader.loading).toBe(false);
    expect(reader.story).toEqual(original);
    await act(async () => request.resolve({ story: edited, progress: null }));
    expect(reader.story).toEqual(original);
    expect(reader.progress?.paragraphIndex).toBe(1);
  });

  it('falls back to cached text with the existing warning after the initial query fails', async () => {
    const s = story();
    const h = await setup(base([s]));
    const request = deferred<{ story: StoryRecord; progress: null }>();
    mocks.client.query.mockReturnValueOnce(request.promise);
    await render(<ReaderProbe id={s.id} />);
    expect(reader.loading).toBe(true);
    await act(async () => request.reject(new Error('Conexão interrompida')));
    expect(reader.loading).toBe(false);
    expect(reader.story).toEqual(s);
    expect(reader.error).toBe('Conexão interrompida');
    expect(h.disk().queue).toHaveLength(0);
  });

  it('opens cached text when switching offline and ignores the interrupted online edition lookup', async () => {
    const original = { ...story(), contentVersion: 1 };
    const edited = {
      ...original,
      contentVersion: 2,
      title: 'Nova edição',
      updatedAt: 500,
    };
    const h = await setup(base([original]));
    const request = deferred<{ story: StoryRecord; progress: null }>();
    mocks.client.query.mockReturnValueOnce(request.promise);
    const tree = await render(<ReaderProbe id={original.id} />);
    expect(reader.loading).toBe(true);
    context = { ...context, offlineMode: true };
    await act(async () => tree.update(<ReaderProbe id={original.id} />));
    expect(reader.loading).toBe(false);
    expect(reader.story).toEqual(original);
    await act(async () => request.resolve({ story: edited, progress: null }));
    expect(reader.story).toEqual(original);
    expect(h.disk().base.stories).toEqual([original]);
    expect(mocks.client.query).toHaveBeenCalledOnce();
  });

  it('persists furigana and ignores the legacy font preference after restart', async () => {
    const h = await setup();
    await h.engine.setStoryPreferences({ textSize: 'extra' });
    const tree = await render(<PreferencesProbe />);
    expect(preferences.furigana).toBe(true);
    expect(preferences).not.toHaveProperty('textSize');
    expect(preferences).not.toHaveProperty('setTextSize');
    await act(async () => preferences.setFurigana(false));
    expect(preferences.furigana).toBe(false);
    expect(h.disk().storyPreferences).toEqual({
      furigana: false,
      textSize: 'extra',
    });
    const restarted = h.restart();
    await restarted.load();
    context = { ...context, engine: restarted };
    await act(async () => tree.update(<PreferencesProbe />));
    expect(preferences.furigana).toBe(false);
    expect(preferences).not.toHaveProperty('textSize');
    expect(mocks.client.query).not.toHaveBeenCalled();
  });

  it('paginates cached stories without making a network request in explicit offline mode', async () => {
    await setup(
      base(
        Array.from({ length: 23 }, (_, index) =>
          story(`offline-${index}`, 'N4', index + 1),
        ),
      ),
    );
    context = { ...context, online: false, offlineMode: true };
    await render(<CatalogProbe level="N4" />);
    expect(catalog.items).toHaveLength(20);
    expect(catalog.hasMore).toBe(true);
    expect(catalog.offline).toBe(true);
    await act(async () => catalog.loadMore());
    expect(catalog.items).toHaveLength(23);
    expect(catalog.hasMore).toBe(false);
    expect(mocks.client.query).not.toHaveBeenCalled();
  });
});
