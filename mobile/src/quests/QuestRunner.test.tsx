import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { QuestSnapshot } from '../../../shared/quests';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import { QuestRunner } from './QuestRunner';
import type { QuestRun } from './presentation';

vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('../offline/hooks', () => ({
  useQuery: () => quest,
  useMutation: () => start,
}));
vi.mock('../study/StudyScreens', () => ({ StudySession: 'StudySession' }));
vi.mock('../jlpt/AttemptScreen', () => ({
  JlptAttemptScreen: 'JlptAttemptScreen',
}));
vi.mock('../stories/StoryReader', () => ({ StoryReader: 'StoryReader' }));
vi.mock('../brand/IbexMascot', () => ({ IbexMascot: 'IbexMascot' }));
const now = 1_000_000;
const questId = 'quest-one' as Id<'quests'>;
let quest: QuestSnapshot | null | undefined;
let start = vi.fn<(_args: { id: string }) => Promise<QuestRun>>();
let onStarted = vi.fn();
let onExit = vi.fn();
let tree: ReactTestRenderer;
let run: QuestRun;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.setSystemTime(now);
  quest = {
    id: questId,
    title: 'Travessia inteira',
    startsAt: now - 1000,
    dueAt: now + 1000,
    timeZone: 'UTC',
    createdAt: now - 1000,
    updatedAt: now,
    cardIds: Array.from({ length: 251 }, (_, i) => 'card-' + i),
    paperIds: ['paper'],
    completedCardIds: [],
    completedPaperIds: [],
  };
  start = vi.fn(async () => ({
    kind: 'study',
    sessionId: 'next-session' as Id<'studySessions'>,
  }));
  onStarted = vi.fn();
  onExit = vi.fn();
  run = { kind: 'study', sessionId: 'first-session' as Id<'studySessions'> };
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    tree = create(
      <QuestRunner
        questId={questId}
        run={run}
        onStarted={onStarted}
        onExit={onExit}
      />,
    );
  });
}
function screen(name: string) {
  return tree.root.find((node) => node.type === name);
}
function button(label: string) {
  return tree.root.find(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label,
  );
}
function textContent() {
  return tree.root
    .findAll(
      (node) => typeof node.type === 'string' && String(node.type) === 'Text',
    )
    .map((node) => node.children.join(''))
    .join('\n');
}

test('keeps the whole selected set and advances a finished batch once without showing settings or completion', async () => {
  quest!.completedCardIds = quest!.cardIds.slice(0, 100);
  await mount();
  expect(screen('StudySession').props.quest).toMatchObject({
    title: 'Travessia inteira',
    total: 251,
    completed: 100,
  });
  expect(start).not.toHaveBeenCalled();
  await act(async () => {
    screen('StudySession').props.quest.onCompleted();
    screen('StudySession').props.quest.onCompleted();
  });
  expect(start).toHaveBeenCalledExactlyOnceWith({ id: questId });
  expect(onStarted).toHaveBeenCalledWith({
    kind: 'study',
    sessionId: 'next-session',
  });
  expect(textContent()).not.toContain('Quest concluída');
});
test('continues from the exact cards to a selected Shiken attempt and back to the quests list', async () => {
  quest!.completedCardIds = [...quest!.cardIds];
  start.mockResolvedValue({
    kind: 'shiken',
    attemptId: 'target-attempt' as Id<'jlptAttempts'>,
  });
  await mount();
  await act(async () => screen('StudySession').props.quest.onCompleted());
  expect(onStarted).toHaveBeenCalledWith({
    kind: 'shiken',
    attemptId: 'target-attempt',
  });
  run = { kind: 'shiken', attemptId: 'target-attempt' as Id<'jlptAttempts'> };
  await act(async () =>
    tree.update(
      <QuestRunner
        questId={questId}
        run={run}
        onStarted={onStarted}
        onExit={onExit}
      />,
    ),
  );
  expect(screen('JlptAttemptScreen').props.attemptId).toBe('target-attempt');
  await act(async () => screen('JlptAttemptScreen').props.onHome());
  expect(onExit).toHaveBeenCalledOnce();
});
test('celebrates only the completed quest and never starts another batch', async () => {
  quest!.completedAt = now;
  quest!.completedCardIds = [...quest!.cardIds];
  quest!.completedPaperIds = ['paper'];
  await mount();
  expect(textContent()).toContain('Quest concluída!');
  expect(start).not.toHaveBeenCalled();
  await act(async () => button('Voltar às quests').props.onPress());
  expect(onExit).toHaveBeenCalledOnce();
});
test.each([{ dueAt: now }, { cancelledAt: now }])(
  'lets the current practice finish after expiry or cancellation but never starts another batch (%s)',
  async (patch) => {
    quest = { ...quest!, ...patch };
    await mount();
    expect(start).not.toHaveBeenCalled();
    expect(textContent()).toContain('Você pode terminar esta prática');
    expect(screen('StudySession').props.quest.counting).toBe(false);
    await act(async () => screen('StudySession').props.quest.onCompleted());
    expect(onExit).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  },
);
test('does not strand a Shiken attempt when the quest expires during it', async () => {
  run = { kind: 'shiken', attemptId: 'target-attempt' as Id<'jlptAttempts'> };
  await mount();
  await act(async () => {
    vi.advanceTimersByTime(1_000);
  });
  expect(screen('JlptAttemptScreen').props.attemptId).toBe('target-attempt');
  await act(async () => screen('JlptAttemptScreen').props.quest.onCompleted());
  expect(onExit).toHaveBeenCalledOnce();
  expect(start).not.toHaveBeenCalled();
});
test('shows a missing-card continuation failure and retries only after explicit action', async () => {
  start.mockRejectedValueOnce(
    new Error('Card arquivado: restaure o card da quest.'),
  );
  await mount();
  const done = screen('StudySession').props.quest.onCompleted;
  await act(async () => done());
  expect(textContent()).toContain('Card arquivado');
  expect(onStarted).not.toHaveBeenCalled();
  await act(async () => done());
  expect(start).toHaveBeenCalledOnce();
  await act(async () => button('Tentar continuar').props.onPress());
  expect(start).toHaveBeenCalledTimes(2);
});
test('does not reopen the runner if the user left while the next selection was being saved', async () => {
  let resolve!: (result: QuestRun) => void;
  start.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await mount();
  await act(async () => screen('StudySession').props.quest.onCompleted());
  await act(async () => tree.unmount());
  await act(async () =>
    resolve({
      kind: 'study',
      sessionId: 'next-session' as Id<'studySessions'>,
    }),
  );
  expect(onStarted).not.toHaveBeenCalled();
});
test('rejects a non-advancing start response instead of repeatedly reopening a completed batch', async () => {
  start.mockResolvedValue(run);
  await mount();
  await act(async () => screen('StudySession').props.quest.onCompleted());
  expect(textContent()).toContain('Não foi possível avançar');
  expect(start).toHaveBeenCalledOnce();
  expect(onStarted).not.toHaveBeenCalled();
});

test('continues into the exact selected story and passes its quest identity to an independent reader', async () => {
  quest!.storyIds = ['selected-story'];
  start.mockResolvedValue({
    kind: 'story',
    storyId: 'selected-story' as Id<'stories'>,
    questId,
  });
  await mount();
  await act(async () => screen('StudySession').props.quest.onCompleted());
  expect(onStarted).toHaveBeenCalledWith({
    kind: 'story',
    storyId: 'selected-story',
    questId,
  });
  run = { kind: 'story', storyId: 'selected-story' as Id<'stories'> };
  await act(async () =>
    tree.update(
      <QuestRunner
        questId={questId}
        run={run}
        onStarted={onStarted}
        onExit={onExit}
      />,
    ),
  );
  expect(screen('StoryReader').props).toMatchObject({
    storyId: 'selected-story',
    quest: { id: questId, title: quest!.title, counting: true },
  });
  expect(start).toHaveBeenCalledTimes(1);
  await act(async () => screen('StoryReader').props.onExit());
  expect(onExit).toHaveBeenCalledOnce();
});

test('keeps the final story result until explicitly acknowledged, then celebrates without another start', async () => {
  run = { kind: 'story', storyId: 'selected-story' as Id<'stories'> };
  await mount();
  quest!.completedAt = now;
  await act(async () =>
    tree.update(
      <QuestRunner
        questId={questId}
        run={run}
        onStarted={onStarted}
        onExit={onExit}
      />,
    ),
  );
  expect(screen('StoryReader')).toBeDefined();
  expect(textContent()).not.toContain('Quest concluída!');
  await act(async () => screen('StoryReader').props.quest.onCompleted());
  expect(textContent()).toContain('Quest concluída!');
  expect(start).not.toHaveBeenCalled();
});

test('does not advance from a story after expiry and lets the reader return to quests', async () => {
  run = { kind: 'story', storyId: 'selected-story' as Id<'stories'> };
  await mount();
  await act(async () => {
    vi.advanceTimersByTime(1_000);
  });
  expect(screen('StoryReader').props.quest.counting).toBe(false);
  expect(textContent()).toContain('Você pode terminar esta leitura');
  await act(async () => screen('StoryReader').props.quest.onCompleted());
  expect(onExit).toHaveBeenCalledOnce();
  expect(start).not.toHaveBeenCalled();
});

test('advances a completed story only once into the following story', async () => {
  run = { kind: 'story', storyId: 'selected-story' as Id<'stories'> };
  start.mockResolvedValue({
    kind: 'story',
    storyId: 'next-story' as Id<'stories'>,
  });
  await mount();
  const done = screen('StoryReader').props.quest.onCompleted;
  await act(async () => {
    done();
    done();
  });
  expect(start).toHaveBeenCalledExactlyOnceWith({ id: questId });
  expect(onStarted).toHaveBeenCalledExactlyOnceWith({
    kind: 'story',
    storyId: 'next-story',
  });
});
