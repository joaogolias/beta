import { type ComponentProps } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { StudyShell } from './StudyShell';
import { StudyHome } from '../study/StudyHome';
import {
  AppEnvironment,
  EnvironmentFrame,
} from '../environment/AppEnvironment';

const alert = vi.hoisted(() => vi.fn());
const hardwareBack = vi.hoisted(() => ({ listener: (): boolean => false }));
vi.mock('react-native', () => ({
  Alert: { alert },
  BackHandler: {
    addEventListener: (_name: string, listener: () => boolean) => {
      hardwareBack.listener = listener;
      return { remove: vi.fn() };
    },
  },
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
  Pressable: 'Pressable',
  RefreshControl: 'RefreshControl',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  SafeAreaView: 'SafeAreaView',
}));
vi.mock('../offline/hooks', () => ({ useOfflineStatus: () => status }));
vi.mock('../alphabet/DetailScreen', () => ({ DetailScreen: 'DetailScreen' }));
vi.mock('../alphabet/EditorScreen', () => ({ EditorScreen: 'EditorScreen' }));
vi.mock('../alphabet/LibraryScreen', () => ({
  LibraryScreen: 'LibraryScreen',
}));
vi.mock('../alphabet/ui', () => ({ ScreenBoundary: 'ScreenBoundary' }));
vi.mock('../vocabulary/DetailScreen', () => ({
  VocabularyDetailScreen: 'VocabularyDetailScreen',
}));
vi.mock('../vocabulary/EditorScreen', () => ({
  VocabularyEditorScreen: 'VocabularyEditorScreen',
}));
vi.mock('../grammar/DetailScreen', () => ({
  GrammarDetailScreen: 'GrammarDetailScreen',
}));
vi.mock('../grammar/EditorScreen', () => ({
  GrammarEditorScreen: 'GrammarEditorScreen',
}));
vi.mock('../exams/DetailScreen', () => ({
  ExamDetailScreen: 'ExamDetailScreen',
}));
vi.mock('../exams/EditorScreen', () => ({
  ExamEditorScreen: 'ExamEditorScreen',
}));
vi.mock('../jlpt/HomeScreen', () => ({
  JlptHomeScreen: 'JlptHomeScreen',
  JlptPaperScreen: 'JlptPaperScreen',
}));
vi.mock('../jlpt/EditorScreen', () => ({
  JlptEditorScreen: 'JlptEditorScreen',
}));
vi.mock('../jlpt/AttemptScreen', () => ({
  JlptAttemptScreen: 'JlptAttemptScreen',
}));
vi.mock('../study/StudyScreens', () => ({
  StudySession: 'StudySession',
  StudySettings: 'StudySettings',
}));
vi.mock('../study/ProgressScreen', () => ({
  ProgressScreen: 'ProgressScreen',
}));
vi.mock('../streak/StreakCard', () => ({ StreakCard: 'StreakCard' }));
vi.mock('../quests/QuestsScreen', () => ({
  QuestsEntry: 'QuestsEntry',
  QuestsScreen: 'QuestsScreen',
}));
vi.mock('../quests/QuestRunner', () => ({ QuestRunner: 'QuestRunner' }));
vi.mock('../stories/StoriesScreen', () => ({
  StoriesEntry: 'StoriesEntry',
  StoriesScreen: 'StoriesScreen',
}));
vi.mock('../stories/StoryReader', () => ({ StoryReader: 'StoryReader' }));
vi.mock('./SettingsControl', () => ({ SettingsControl: 'SettingsControl' }));
vi.mock('./SyncStatus', () => ({ SyncStatus: 'SyncStatus' }));

let status: {
  online: boolean;
  offlineMode: boolean;
  switchingMode: boolean;
  resetVersion: number;
  syncing: boolean;
  refresh: () => Promise<void>;
};
let tree: ReactTestRenderer;
const props: ComponentProps<typeof StudyShell> = {
  name: 'Estudante',
  accountControl: null,
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  status = {
    online: true,
    offlineMode: false,
    switchingMode: false,
    resetVersion: 0,
    syncing: false,
    refresh: vi.fn(async () => {}),
  };
  alert.mockClear();
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.unstubAllGlobals();
});
function screen(name: string) {
  return tree.root.find(
    (node) => node.type === (name === 'StudyHome' ? StudyHome : name),
  );
}

async function openFlashcards() {
  await act(async () =>
    tree.root
      .findByProps({
        accessibilityLabel: '暗記 · Anki · Flashcards · exercite a memória',
      })
      .props.onPress(),
  );
}

test.each([
  ['漢字 · Kanji', 'LibraryScreen'],
  ['ことば · Kotoba', 'LibraryScreen'],
  ['文法 · Bunpou', 'LibraryScreen'],
  ['試験 · Shiken', 'JlptHomeScreen'],
  ['勉強 · Benkyou', 'StudyHome'],
])(
  'offers one quests shortcut after the streak and returns to the originating tab (%s)',
  async (tabLabel, target) => {
    await mount();
    await act(async () =>
      tree.root.findByProps({ accessibilityLabel: tabLabel }).props.onPress(),
    );
    const originFilters =
      target === 'LibraryScreen'
        ? {
            ...screen(target).props.filters,
            level: 'N4',
            query: '山',
            archived: true,
          }
        : null;
    if (originFilters)
      await act(async () =>
        screen(target).props.onFiltersChange(originFilters),
      );
    expect(tree.root.findAllByType('QuestsEntry' as never)).toHaveLength(1);
    expect(tree.root.findAllByType('ScrollView' as never)).toHaveLength(1);
    expect(screen('ScrollView').children[0]).toBe(screen('StreakCard'));
    if (target !== 'StudyHome') {
      expect(screen('ScreenBoundary').children[0]).toBe(screen('QuestsEntry'));
      await act(async () =>
        screen('ScrollView').props.refreshControl.props.onRefresh(),
      );
      expect(status.refresh).toHaveBeenCalledOnce();
    }
    await act(async () => screen('QuestsEntry').props.onPress());
    expect(screen('QuestsScreen')).toBeDefined();
    expect(tree.root.findAllByType('QuestsEntry' as never)).toHaveLength(0);
    expect(
      tree.root.findByProps({ accessibilityLabel: tabLabel }).props
        .accessibilityState.selected,
    ).toBe(true);
    expect(tree.root.findAllByType('ScrollView' as never)).toHaveLength(1);
    expect(screen('ScrollView').props.refreshControl.props.enabled).toBe(true);
    await act(async () =>
      screen('QuestsScreen').props.onStarted('quest-one', {
        kind: 'study',
        sessionId: 'selected-session',
      }),
    );
    expect(tree.root.findAllByType('QuestsEntry' as never)).toHaveLength(0);
    expect(
      tree.root.findByProps({ accessibilityLabel: tabLabel }).props
        .accessibilityState.selected,
    ).toBe(true);
    await act(async () => screen('QuestRunner').props.onExit());
    expect(screen('QuestsScreen')).toBeDefined();
    await act(async () => {
      expect(hardwareBack.listener()).toBe(true);
    });
    expect(screen(target)).toBeDefined();
    expect(
      tree.root.findByProps({ accessibilityLabel: tabLabel }).props
        .accessibilityState.selected,
    ).toBe(true);
    if (originFilters)
      expect(screen(target).props.filters).toEqual(originFilters);
  },
);

test('Benkyou presents three destinations and Anki retains study preferences through a session and back', async () => {
  await mount();
  await act(async () =>
    tree.root
      .findByProps({ accessibilityLabel: '勉強 · Benkyou' })
      .props.onPress(),
  );
  expect(screen('StudyHome')).toBeDefined();
  expect(screen('QuestsEntry')).toBeDefined();
  expect(screen('StoriesEntry')).toBeDefined();
  expect(tree.root.findAllByType('StudySettings' as never)).toHaveLength(0);
  expect(hardwareBack.listener()).toBe(false);
  await openFlashcards();
  expect(tree.root.findAllByType('QuestsEntry' as never)).toHaveLength(0);
  expect(tree.root.findAllByType('StoriesEntry' as never)).toHaveLength(0);
  await act(async () => {
    screen('StudySettings').props.onPreferencesChange({
      category: 'vocabulary',
      level: 'N3',
      order: 'random',
      limit: '35',
    });
    screen('StudySettings').props.onModeChange('adaptive');
  });
  const preferences = screen('StudySettings').props.preferences;
  await act(async () => screen('StudySettings').props.onStart('session-one'));
  await act(async () => screen('StudySession').props.onSettings());
  expect(screen('StudySettings').props.preferences).toEqual(preferences);
  await act(async () => {
    expect(hardwareBack.listener()).toBe(true);
  });
  expect(screen('StudyHome')).toBeDefined();
  await openFlashcards();
  expect(screen('StudySettings').props.preferences).toEqual(preferences);
  expect(screen('StudySettings').props.mode).toBe('adaptive');
});

test('contextual library study still opens Anki directly with its category and level', async () => {
  await mount();
  await act(async () =>
    screen('LibraryScreen').props.onFiltersChange({
      ...screen('LibraryScreen').props.filters,
      level: 'N4',
    }),
  );
  await act(async () =>
    tree.root
      .findByProps({
        accessibilityLabel: '勉強 · Estudar cards ativos: Kanji · N4',
      })
      .props.onPress(),
  );
  expect(screen('StudySettings').props.preferences).toMatchObject({
    category: 'alphabet',
    level: 'N4',
  });
  expect(tree.root.findAllByType(StudyHome)).toHaveLength(0);
  expect(screen('ScrollView').props.refreshControl).toBeUndefined();
});

test('does not show quests shortcuts in details, editors, practice or progress', async () => {
  await mount();
  await act(async () => screen('LibraryScreen').props.onOpen('card-one'));
  expect(tree.root.findAllByType('QuestsEntry' as never)).toHaveLength(0);
  await act(async () => screen('DetailScreen').props.onEdit());
  expect(tree.root.findAllByType('QuestsEntry' as never)).toHaveLength(0);
  await act(async () =>
    tree.root
      .findByProps({ accessibilityLabel: '勉強 · Benkyou' })
      .props.onPress(),
  );
  await openFlashcards();
  await act(async () => screen('StudySettings').props.onStart('session-one'));
  expect(tree.root.findAllByType('QuestsEntry' as never)).toHaveLength(0);
  await act(async () =>
    tree.root
      .findByProps({ accessibilityLabel: '進捗 · Progresso' })
      .props.onPress(),
  );
  expect(tree.root.findAllByType('QuestsEntry' as never)).toHaveLength(0);
});

test('opens Monogatari inside Benkyou and preserves filters while the reader owns its scroll', async () => {
  await mount();
  await act(async () =>
    tree.root
      .findByProps({ accessibilityLabel: '勉強 · Benkyou' })
      .props.onPress(),
  );
  await act(async () => screen('StoriesEntry').props.onPress());
  await act(async () =>
    screen('ScrollView').props.refreshControl.props.onRefresh(),
  );
  expect(status.refresh).toHaveBeenCalledOnce();
  expect(tree.root.findAllByProps({ accessibilityRole: 'tab' })).toHaveLength(
    6,
  );
  await act(async () =>
    screen('StoriesScreen').props.onFiltersChange({
      level: 'N4',
      status: 'new',
    }),
  );
  await act(async () => screen('StoriesScreen').props.onOpen('story-one'));
  expect(screen('StoryReader').props.storyId).toBe('story-one');
  expect(tree.root.findAllByType('ScrollView' as never)).toHaveLength(0);
  await act(async () => screen('StoryReader').props.onExit());
  expect(screen('StoriesScreen').props.filters).toEqual({
    level: 'N4',
    status: 'new',
  });
  expect(tree.root.findAllByType('ScrollView' as never)).toHaveLength(1);
});

test('opens exact quests inside Benkyou with six tabs and one refreshable scroll, then returns from the runner', async () => {
  await mount();
  await act(async () =>
    tree.root
      .findByProps({ accessibilityLabel: '勉強 · Benkyou' })
      .props.onPress(),
  );
  await act(async () => screen('QuestsEntry').props.onPress());
  expect(tree.root.findAllByProps({ accessibilityRole: 'tab' })).toHaveLength(
    6,
  );
  expect(tree.root.findAllByType('ScrollView' as never)).toHaveLength(1);
  await act(async () =>
    screen('ScrollView').props.refreshControl.props.onRefresh(),
  );
  expect(status.refresh).toHaveBeenCalledOnce();
  await act(async () =>
    screen('QuestsScreen').props.onStarted('quest-one', {
      kind: 'study',
      sessionId: 'exact-session',
    }),
  );
  expect(screen('QuestRunner').props).toMatchObject({
    questId: 'quest-one',
    run: { kind: 'study', sessionId: 'exact-session' },
  });
  expect(tree.root.findAllByType('StudySettings' as never)).toHaveLength(0);
  expect(screen('ScrollView').props.refreshControl).toBeUndefined();
  await act(async () =>
    screen('QuestRunner').props.onStarted({
      kind: 'shiken',
      attemptId: 'exact-attempt',
    }),
  );
  expect(screen('QuestRunner').props.run).toEqual({
    kind: 'shiken',
    attemptId: 'exact-attempt',
  });
  await act(async () => screen('QuestRunner').props.onExit());
  expect(screen('QuestsScreen')).toBeDefined();
});
test('resuming quest activity from ordinary Benkyou or Shiken preserves its runner', async () => {
  await mount();
  await act(async () =>
    tree.root
      .findByProps({ accessibilityLabel: '勉強 · Benkyou' })
      .props.onPress(),
  );
  await openFlashcards();
  await act(async () =>
    screen('StudySettings').props.onStart('quest-session', 'quest-one'),
  );
  expect(screen('QuestRunner').props.run).toEqual({
    kind: 'study',
    sessionId: 'quest-session',
  });
  await act(async () =>
    tree.root
      .findByProps({ accessibilityLabel: '試験 · Shiken' })
      .props.onPress(),
  );
  await act(async () =>
    screen('JlptHomeScreen').props.onAttempt('quest-attempt', 'quest-two'),
  );
  expect(screen('QuestRunner').props).toMatchObject({
    questId: 'quest-two',
    run: { kind: 'shiken', attemptId: 'quest-attempt' },
  });
});

test('a quest story owns its scroll and returns to quests without opening the story catalogue', async () => {
  await mount();
  await act(async () =>
    tree.root
      .findByProps({ accessibilityLabel: '勉強 · Benkyou' })
      .props.onPress(),
  );
  await act(async () => screen('QuestsEntry').props.onPress());
  await act(async () =>
    screen('QuestsScreen').props.onStarted('quest-one', {
      kind: 'story',
      storyId: 'selected-story',
    }),
  );
  expect(screen('QuestRunner').props).toMatchObject({
    questId: 'quest-one',
    run: { kind: 'story', storyId: 'selected-story' },
  });
  expect(tree.root.findAllByType('ScrollView' as never)).toHaveLength(0);
  await act(async () => screen('QuestRunner').props.onExit());
  expect(screen('QuestsScreen')).toBeDefined();
  expect(tree.root.findAllByType('StoriesScreen' as never)).toHaveLength(0);
});
async function mount(environment = 'development') {
  await act(async () => {
    tree = create(
      <AppEnvironment environment={environment}>
        <EnvironmentFrame>
          <StudyShell {...props} />
        </EnvironmentFrame>
      </AppEnvironment>,
    );
  });
}

test.each([
  { online: false, offlineMode: false, switchingMode: false },
  { online: true, offlineMode: true, switchingMode: false },
  { online: true, offlineMode: false, switchingMode: true },
])(
  'library and exam editors require connected online mode (%o)',
  async (mode) => {
    status = { ...status, ...mode };
    await mount();
    for (const category of ['alphabet', 'vocabulary', 'grammar', 'exam']) {
      await act(async () => {
        screen('LibraryScreen').props.onCreate(category);
      });
      expect(screen('LibraryScreen')).toBeDefined();
    }
    await act(async () => {
      tree.root
        .findByProps({ accessibilityLabel: '試験 · Shiken' })
        .props.onPress();
    });
    await act(async () => {
      screen('JlptHomeScreen').props.onCreate();
    });
    expect(screen('JlptHomeScreen')).toBeDefined();
    expect(alert).toHaveBeenCalledTimes(5);
  },
);

test('losing connectivity keeps an already-open editor mounted with its draft', async () => {
  await mount();
  await act(async () => {
    screen('LibraryScreen').props.onCreate('vocabulary');
  });
  const editor = screen('VocabularyEditorScreen');
  status = { ...status, online: false };
  await act(async () => {
    tree.update(
      <AppEnvironment environment="development">
        <EnvironmentFrame>
          <StudyShell {...props} />
        </EnvironmentFrame>
      </AppEnvironment>,
    );
  });
  expect(screen('VocabularyEditorScreen')).toBe(editor);
  expect(alert).not.toHaveBeenCalled();
});

test('settings stay reachable inside an immersive study session', async () => {
  await mount();
  await act(async () => {
    tree.root
      .findByProps({ accessibilityLabel: '勉強 · Benkyou' })
      .props.onPress();
  });
  await openFlashcards();
  await act(async () => {
    screen('StudySettings').props.onStart('session');
  });
  expect(screen('StudySession')).toBeDefined();
  expect(screen('SettingsControl')).toBeDefined();
  expect(screen('SyncStatus')).toBeDefined();
  expect(screen('ScrollView').props.refreshControl).toBeUndefined();
  expect(
    screen('ScrollView').findAllByType('SyncStatus' as never),
  ).toHaveLength(0);
});

test('sync status stays in the toolbar and background work does not show pull-to-refresh loading', async () => {
  status.syncing = true;
  await mount();
  expect(tree.root.findAllByType('SyncStatus' as never)).toHaveLength(1);
  expect(
    screen('ScrollView').findAllByType('SyncStatus' as never),
  ).toHaveLength(0);
  expect(screen('ScrollView').props.refreshControl.props.refreshing).toBe(
    false,
  );
  expect(status.refresh).not.toHaveBeenCalled();
});

test.each([
  ['漢字 · Kanji', 'LibraryScreen'],
  ['ことば · Kotoba', 'LibraryScreen'],
  ['文法 · Bunpou', 'LibraryScreen'],
  ['試験 · Shiken', 'JlptHomeScreen'],
])('%s refreshes through its main scroll view', async (label, content) => {
  await mount('production');
  await act(async () => {
    tree.root.findByProps({ accessibilityLabel: label }).props.onPress();
  });
  const scroll = screen('ScrollView');
  expect(scroll.findAllByType(content as never)).toHaveLength(1);
  expect(scroll.props.refreshControl.props.enabled).toBe(true);
  await act(async () => scroll.props.refreshControl.props.onRefresh());
  expect(status.refresh).toHaveBeenCalledOnce();
  expect(screen('ScrollView')).toBe(scroll);
});

test('top pulls and refresh do not paginate while scrolling toward the bottom still does', async () => {
  let finish!: () => void;
  status.refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const loadMore = vi.fn();
  await mount();
  screen('LibraryScreen').props.onLoadMoreReady(loadMore);
  const scroll = (y: number, height = 600) =>
    screen('ScrollView').props.onScroll({
      nativeEvent: {
        contentOffset: { y },
        contentSize: { height },
        layoutMeasurement: { height: 600 },
      },
    });

  scroll(0);
  scroll(-60);
  scroll(100, 1800);
  expect(loadMore).not.toHaveBeenCalled();
  expect(status.refresh).not.toHaveBeenCalled();

  await act(async () => {
    screen('ScrollView').props.refreshControl.props.onRefresh();
  });
  scroll(1100, 1800);
  expect(loadMore).not.toHaveBeenCalled();
  await act(async () => finish());
  scroll(1100, 1800);
  expect(loadMore).toHaveBeenCalledOnce();
  expect(status.refresh).toHaveBeenCalledOnce();
});

test('pulling the catalog waits for refresh, ignores duplicate pulls and ends quietly on failure', async () => {
  let finish!: () => void;
  status.refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  await act(async () => {
    screen('ScrollView').props.refreshControl.props.onRefresh();
    screen('ScrollView').props.refreshControl.props.onRefresh();
  });
  expect(status.refresh).toHaveBeenCalledOnce();
  expect(screen('ScrollView').props.refreshControl.props.refreshing).toBe(true);
  await act(async () => finish());
  expect(screen('ScrollView').props.refreshControl.props.refreshing).toBe(
    false,
  );

  status.refresh = vi.fn(async () => {
    throw new Error('Sem conexão');
  });
  await act(async () => {
    tree.update(<StudyShell {...props} />);
  });
  await act(async () => {
    screen('ScrollView').props.refreshControl.props.onRefresh();
  });
  expect(screen('ScrollView').props.refreshControl.props.refreshing).toBe(
    false,
  );
  expect(alert).not.toHaveBeenCalled();
});

test.each([
  { online: false, offlineMode: false, switchingMode: false },
  { online: true, offlineMode: true, switchingMode: false },
  { online: true, offlineMode: false, switchingMode: true },
])(
  'pull-to-refresh respects connectivity and the offline choice (%o)',
  async (mode) => {
    status = { ...status, ...mode };
    await mount();
    const refresh = screen('ScrollView').props.refreshControl;
    expect(refresh.props.enabled).toBe(false);
    await act(async () => refresh.props.onRefresh());
    expect(status.refresh).not.toHaveBeenCalled();
  },
);

test('refresh gesture belongs to catalogs, not editors or study and exam interactions', async () => {
  await mount();
  expect(screen('ScrollView').props.refreshControl).toBeDefined();
  await act(async () => screen('LibraryScreen').props.onCreate('alphabet'));
  expect(screen('ScrollView').props.refreshControl).toBeUndefined();
  await act(async () => {
    tree.root
      .findByProps({ accessibilityLabel: '試験 · Shiken' })
      .props.onPress();
  });
  expect(screen('ScrollView').props.refreshControl).toBeDefined();
  await act(async () => screen('JlptHomeScreen').props.onAttempt('attempt'));
  expect(screen('ScrollView').props.refreshControl).toBeUndefined();
  expect(screen('SyncStatus')).toBeDefined();
  await act(async () => {
    tree.root
      .findByProps({ accessibilityLabel: '勉強 · Benkyou' })
      .props.onPress();
  });
  expect(screen('ScrollView').props.refreshControl).toBeUndefined();
});

test.each(['development', 'production'])(
  '%s keeps its environment indication when entering immersive study and exam screens',
  async (environment) => {
    await mount(environment);
    const expectEnvironment = () => {
      expect(
        tree.root.findAllByProps({
          accessibilityLabel: 'Ambiente de desenvolvimento',
        }),
      ).toHaveLength(environment === 'development' ? 1 : 0);
    };
    expectEnvironment();
    await act(async () => {
      tree.root
        .findByProps({ accessibilityLabel: '勉強 · Benkyou' })
        .props.onPress();
    });
    await openFlashcards();
    await act(async () => {
      screen('StudySettings').props.onStart('session');
    });
    expect(screen('StudySession')).toBeDefined();
    expectEnvironment();
    await act(async () => {
      screen('StudySession').props.onSettings();
    });
    await act(async () => {
      tree.root
        .findByProps({ accessibilityLabel: '試験 · Shiken' })
        .props.onPress();
    });
    await act(async () => {
      screen('JlptHomeScreen').props.onAttempt('attempt');
    });
    expect(screen('JlptAttemptScreen')).toBeDefined();
    expectEnvironment();
  },
);

test.each(['development', 'production'])(
  '%s identifies the native editing alert without leaking DEV into production',
  async (environment) => {
    status.online = false;
    await mount(environment);
    await act(async () => {
      screen('LibraryScreen').props.onCreate('alphabet');
    });
    expect(alert.mock.calls[0][0]).toBe(
      environment === 'development'
        ? 'DEV · Sua biblioteca é editada online'
        : 'Sua biblioteca é editada online',
    );
  },
);
