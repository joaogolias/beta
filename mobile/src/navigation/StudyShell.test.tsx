import { type ComponentProps } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { StudyShell } from './StudyShell';

const alert = vi.hoisted(() => vi.fn());
vi.mock('react-native', () => ({
  Alert: { alert },
  BackHandler: { addEventListener: () => ({ remove: vi.fn() }) },
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({
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
vi.mock('./SettingsControl', () => ({ SettingsControl: 'SettingsControl' }));
vi.mock('./SyncStatus', () => ({ SyncStatus: 'SyncStatus' }));

let status: {
  online: boolean;
  offlineMode: boolean;
  switchingMode: boolean;
  resetVersion: number;
};
let tree: ReactTestRenderer;
const props: ComponentProps<typeof StudyShell> = {
  name: 'Estudante',
  environment: 'development',
  accountControl: null,
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  status = {
    online: true,
    offlineMode: false,
    switchingMode: false,
    resetVersion: 0,
  };
  alert.mockClear();
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.unstubAllGlobals();
});
function screen(name: string) {
  return tree.root.find((node) => node.type === name);
}
async function mount() {
  await act(async () => {
    tree = create(<StudyShell {...props} />);
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
    tree.update(<StudyShell {...props} />);
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
  await act(async () => {
    screen('StudySettings').props.onStart('session');
  });
  expect(screen('StudySession')).toBeDefined();
  expect(screen('SettingsControl')).toBeDefined();
});
