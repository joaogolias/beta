import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOfflineStatus } from '../offline/hooks';
import { DetailScreen } from '../alphabet/DetailScreen';
import { EditorScreen } from '../alphabet/EditorScreen';
import { VocabularyDetailScreen } from '../vocabulary/DetailScreen';
import { VocabularyEditorScreen } from '../vocabulary/EditorScreen';
import { GrammarDetailScreen } from '../grammar/DetailScreen';
import { GrammarEditorScreen } from '../grammar/EditorScreen';
import { ExamDetailScreen } from '../exams/DetailScreen';
import { ExamEditorScreen } from '../exams/EditorScreen';
import { JlptHomeScreen, JlptPaperScreen } from '../jlpt/HomeScreen';
import { JlptEditorScreen } from '../jlpt/EditorScreen';
import { JlptAttemptScreen } from '../jlpt/AttemptScreen';
import { LibraryScreen } from '../alphabet/LibraryScreen';
import { ScreenBoundary } from '../alphabet/ui';
import { StudySession, StudySettings } from '../study/StudyScreens';
import { ProgressScreen } from '../study/ProgressScreen';
import { SyncStatus } from './SyncStatus';
import { SettingsControl } from './SettingsControl';
import { palette } from '../theme';
import { StreakCard } from '../streak/StreakCard';
import {
  canGoBack,
  initialNavigation,
  navigationReducer,
  parentRoute,
  selectedTab,
  type StudyRoute,
  type StudyTab,
} from './navigation';

const tabs: {
  key: StudyTab;
  label: string;
  reading: string;
  route: StudyRoute;
}[] = [
  {
    key: 'alphabet',
    label: '漢字',
    reading: 'Kanji',
    route: { name: 'library', category: 'alphabet' },
  },
  {
    key: 'vocabulary',
    label: 'ことば',
    reading: 'Kotoba',
    route: { name: 'library', category: 'vocabulary' },
  },
  {
    key: 'grammar',
    label: '文法',
    reading: 'Bunpou',
    route: { name: 'library', category: 'grammar' },
  },
  {
    key: 'exam',
    label: '試験',
    reading: 'Shiken',
    route: { name: 'jlpt-home' },
  },
  {
    key: 'study',
    label: '勉強',
    reading: 'Benkyou',
    route: { name: 'study-settings' },
  },
  {
    key: 'progress',
    label: '進捗',
    reading: 'Progresso',
    route: { name: 'progress' },
  },
];

export function StudyShell({
  name,
  environment,
  accountControl,
}: {
  name: string;
  environment: string;
  accountControl: ReactNode;
}) {
  const { resetVersion, online, offlineMode, switchingMode } =
    useOfflineStatus();
  const [navigation, dispatch] = useReducer(
    navigationReducer,
    initialNavigation,
  );
  const { route, mode, study, libraries } = navigation;
  const immersive =
    route.name === 'study-session' || route.name === 'jlpt-attempt';
  const tab = selectedTab(route);
  const parent = parentRoute(route);
  const filters = route.name === 'library' ? libraries[route.category] : null;
  const routeKey =
    route.name +
    (route.name === 'library'
      ? route.category + libraries[route.category].level
      : 'cardId' in route
        ? (route.cardId ?? '')
        : 'paperId' in route
          ? (route.paperId ?? '')
          : 'attemptId' in route
            ? route.attemptId
            : 'sessionId' in route
              ? route.sessionId
              : '');
  const loadMore = useRef<(() => void) | null>(null);
  const lastLoad = useRef(0);
  const registerLoadMore = useCallback((callback: (() => void) | null) => {
    loadMore.current = callback;
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!canGoBack(navigation)) return false;
        dispatch({ type: 'back' });
        return true;
      },
    );
    return () => subscription.remove();
  }, [navigation]);
  function open(next: StudyRoute) {
    if (
      next.name.endsWith('-editor') &&
      (!online || offlineMode || switchingMode)
    ) {
      Alert.alert(
        'Sua biblioteca é editada online',
        switchingMode
          ? 'Aguarde a mudança de modo terminar para criar ou editar itens.'
          : 'Conecte à internet e desligue o modo offline nas configurações para criar ou editar itens. Você pode continuar estudando o conteúdo já salvo.',
      );
      return;
    }
    dispatch({ type: 'open', route: next });
  }
  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (route.name !== 'library' || !loadMore.current) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height - contentOffset.y - layoutMeasurement.height > 280)
      return;
    const now = Date.now();
    if (now - lastLoad.current < 350) return;
    lastLoad.current = now;
    loadMore.current();
  }
  const studyContext = filters
    ? `${filters.category === 'alphabet' ? 'Kanji' : filters.category === 'grammar' ? 'Bunpou' : filters.category === 'exam' ? 'Shiken' : 'Kotoba'} · ${filters.level || 'Todos os níveis'}`
    : '';
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.screen} behavior="height">
        <ScrollView
          key={routeKey}
          contentContainerStyle={[
            styles.content,
            filters && styles.libraryContent,
            immersive && styles.immersiveContent,
          ]}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={100}
        >
          {!immersive && (
            <View style={styles.header}>
              <View style={styles.identity}>
                <View style={styles.brandMark} accessible={false}>
                  <Text style={styles.brandSymbol}>文</Text>
                </View>
                <Text style={styles.wordmark}>beta</Text>
                {environment === 'development' && (
                  <Text style={styles.environment}>DEV</Text>
                )}
              </View>
              <View
                style={styles.accountActions}
                accessibilityLabel={`Conta de ${name}`}
              >
                <SettingsControl />
                {accountControl}
              </View>
            </View>
          )}
          {immersive && (
            <View style={styles.immersiveTools}>
              <SettingsControl />
            </View>
          )}
          <SyncStatus />
          {!immersive && !parent && <StreakCard />}
          {parent && !immersive && (
            <Pressable
              accessibilityRole="button"
              onPress={() => dispatch({ type: 'back' })}
              style={styles.back}
            >
              <Text style={styles.backText}>
                {parent.name === 'jlpt-home'
                  ? '‹ Shiken'
                  : parent.name === 'jlpt-paper'
                    ? '‹ Voltar para o simulado'
                    : parent.name === 'library'
                      ? parent.category === 'alphabet'
                        ? '‹ Kanji'
                        : parent.category === 'grammar'
                          ? '‹ Bunpou'
                          : parent.category === 'exam'
                            ? '‹ Shiken'
                            : '‹ Kotoba'
                      : parent.name === 'card-detail'
                        ? '‹ Voltar para o kanji'
                        : parent.name === 'vocabulary-detail'
                          ? '‹ Voltar para a palavra'
                          : parent.name === 'grammar-detail'
                            ? '‹ Voltar para a gramática'
                            : parent.name === 'exam-detail'
                              ? '‹ Voltar para a questão'
                              : '‹ Configuração'}
              </Text>
            </Pressable>
          )}
          <ScreenBoundary key={routeKey}>
            {route.name === 'jlpt-home' && (
              <JlptHomeScreen
                onCreate={() => open({ name: 'jlpt-editor' })}
                onOpen={(paperId) => open({ name: 'jlpt-paper', paperId })}
                onAttempt={(attemptId) =>
                  open({ name: 'jlpt-attempt', attemptId })
                }
              />
            )}
            {route.name === 'jlpt-paper' && (
              <JlptPaperScreen
                paperId={route.paperId}
                onEdit={() =>
                  open({ name: 'jlpt-editor', paperId: route.paperId })
                }
                onAttempt={(attemptId) =>
                  open({ name: 'jlpt-attempt', attemptId })
                }
              />
            )}
            {route.name === 'jlpt-editor' && (
              <JlptEditorScreen
                paperId={route.paperId}
                onSaved={(paperId) => open({ name: 'jlpt-paper', paperId })}
                onCancel={() => dispatch({ type: 'back' })}
              />
            )}
            {route.name === 'jlpt-attempt' && (
              <JlptAttemptScreen
                attemptId={route.attemptId}
                onHome={() => open({ name: 'jlpt-home' })}
              />
            )}
            {route.name === 'library' && filters && (
              <LibraryScreen
                filters={filters}
                onFiltersChange={(next) =>
                  dispatch({
                    type: 'change-library',
                    filters: { ...next, category: route.category },
                  })
                }
                onLoadMoreReady={registerLoadMore}
                onCreate={(category) =>
                  open({
                    name:
                      category === 'exam'
                        ? 'exam-editor'
                        : category === 'grammar'
                          ? 'grammar-editor'
                          : category === 'vocabulary'
                            ? 'vocabulary-editor'
                            : 'card-editor',
                  })
                }
                onOpen={(cardId) => open({ name: 'card-detail', cardId })}
                onOpenVocabulary={(cardId) =>
                  open({ name: 'vocabulary-detail', cardId })
                }
                onOpenGrammar={(cardId) =>
                  open({ name: 'grammar-detail', cardId })
                }
                onOpenExam={(cardId) => open({ name: 'exam-detail', cardId })}
              />
            )}
            {route.name === 'card-detail' && (
              <DetailScreen
                cardId={route.cardId}
                onEdit={() =>
                  open({ name: 'card-editor', cardId: route.cardId })
                }
              />
            )}
            {route.name === 'card-editor' && (
              <EditorScreen
                cardId={route.cardId}
                onSaved={(cardId) => open({ name: 'card-detail', cardId })}
                onCancel={() => dispatch({ type: 'back' })}
              />
            )}
            {route.name === 'vocabulary-detail' && (
              <VocabularyDetailScreen
                cardId={route.cardId}
                onEdit={() =>
                  open({ name: 'vocabulary-editor', cardId: route.cardId })
                }
              />
            )}
            {route.name === 'vocabulary-editor' && (
              <VocabularyEditorScreen
                cardId={route.cardId}
                onSaved={(cardId) =>
                  open({ name: 'vocabulary-detail', cardId })
                }
                onCancel={() => dispatch({ type: 'back' })}
              />
            )}
            {route.name === 'grammar-detail' && (
              <GrammarDetailScreen
                cardId={route.cardId}
                onEdit={() =>
                  open({ name: 'grammar-editor', cardId: route.cardId })
                }
              />
            )}
            {route.name === 'grammar-editor' && (
              <GrammarEditorScreen
                cardId={route.cardId}
                initialLevel={libraries.grammar.level}
                onSaved={(cardId) => open({ name: 'grammar-detail', cardId })}
                onCancel={() => dispatch({ type: 'back' })}
              />
            )}
            {route.name === 'study-settings' && (
              <StudySettings
                mode={mode}
                preferences={study}
                onPreferencesChange={(patch) =>
                  dispatch({ type: 'change-study', patch })
                }
                onModeChange={(nextMode) =>
                  dispatch({ type: 'select-mode', mode: nextMode })
                }
                onStart={(sessionId) =>
                  open({ name: 'study-session', sessionId })
                }
              />
            )}
            {route.name === 'exam-detail' && (
              <ExamDetailScreen
                cardId={route.cardId}
                onEdit={() =>
                  open({ name: 'exam-editor', cardId: route.cardId })
                }
              />
            )}
            {route.name === 'exam-editor' && (
              <ExamEditorScreen
                cardId={route.cardId}
                initialLevel={libraries.exam.level}
                onSaved={(cardId) => open({ name: 'exam-detail', cardId })}
                onCancel={() => dispatch({ type: 'back' })}
              />
            )}
            {route.name === 'study-session' && (
              <StudySession
                key={`${route.sessionId}:${resetVersion}`}
                sessionId={route.sessionId}
                onSettings={() => open({ name: 'study-settings' })}
              />
            )}
            {route.name === 'progress' && (
              <ProgressScreen
                onStudy={() => open({ name: 'study-settings' })}
                onLibrary={() =>
                  open({ name: 'library', category: 'alphabet' })
                }
              />
            )}
          </ScreenBoundary>
        </ScrollView>
        {filters && filters.category !== 'exam' && (
          <View style={styles.floatingContainer} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`勉強 · Estudar cards ativos: ${studyContext}`}
              accessibilityHint="Abre a configuração de estudo desta categoria e nível."
              onPress={() => dispatch({ type: 'study-library' })}
              style={({ pressed }) => [
                styles.floatingButton,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.floatingPlay}>
                <Text style={styles.playText}>▶</Text>
              </View>
              <View>
                <Text style={styles.floatingTitle}>
                  勉強<Text style={styles.floatingReading}> Benkyou</Text>
                </Text>
                <Text style={styles.floatingContext}>
                  {studyContext}
                  {filters.archived ? ' · ativos' : ''}
                </Text>
              </View>
              <Text style={styles.floatingArrow}>↗</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
      <View style={styles.tabs} accessibilityRole="tablist">
        {tabs.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={`${item.label} · ${item.reading}`}
            accessibilityState={{ selected: item.key === tab }}
            onPress={() => open(item.route)}
            style={[styles.tab, item.key === tab && styles.activeTab]}
          >
            <Text
              style={[styles.tabText, item.key === tab && styles.activeTabText]}
            >
              {item.label}
            </Text>
            <Text
              style={[
                styles.tabReading,
                item.key === tab && styles.activeTabReading,
              ]}
            >
              {item.reading}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { flexGrow: 1, padding: 20, paddingBottom: 28, gap: 20 },
  libraryContent: { paddingBottom: 112 },
  immersiveContent: {
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 8,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    minHeight: 42,
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  accountActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  immersiveTools: { alignItems: 'flex-end' },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: palette.blue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandSymbol: { color: palette.surface, fontSize: 19, fontWeight: '600' },
  wordmark: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  environment: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  back: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingRight: 16,
  },
  backText: { color: palette.blueDeep, fontSize: 14, fontWeight: '700' },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 9,
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: palette.surface,
  },
  tab: {
    flex: 1,
    minWidth: 44,
    minHeight: 60,
    paddingVertical: 8,
    gap: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  activeTab: { backgroundColor: palette.blueSoft },
  tabText: { color: palette.muted, fontWeight: '700', fontSize: 16 },
  activeTabText: { color: palette.blue },
  tabReading: {
    color: palette.muted,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  activeTabReading: { color: palette.blueDeep },
  floatingContainer: {
    position: 'absolute',
    bottom: 14,
    right: 20,
    left: 20,
    alignItems: 'flex-end',
  },
  floatingButton: {
    minHeight: 68,
    maxWidth: '100%',
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 23,
    backgroundColor: palette.blue,
    elevation: 6,
    boxShadow: '0px 6px 18px rgba(36, 91, 255, 0.22)',
  },
  floatingPlay: {
    width: 33,
    height: 33,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { color: palette.surface, fontSize: 12 },
  floatingTitle: { color: palette.surface, fontSize: 20, fontWeight: '700' },
  floatingReading: { fontSize: 11, fontWeight: '500' },
  floatingContext: { color: palette.surface, fontSize: 10, marginTop: 3 },
  floatingArrow: { color: palette.surface, fontSize: 23, marginLeft: 4 },
  pressed: { opacity: 0.85 },
});
