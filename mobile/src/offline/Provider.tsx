import { AppModal } from '../environment/AppEnvironment';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { useConvex, useConvexConnectionState } from 'convex/react';
import { randomUUID } from 'expo-crypto';
import * as Network from 'expo-network';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  Text,
  View,
} from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import { OfflineEngine } from './engine';
import { clone, type Card, type CachedProfile, type Data } from './model';
import { offlinePreference, persistence } from './storage';
import { hasNoInternet, OfflineMode, promptMemoryFor } from './mode';
import { palette } from '../theme';
export type { CachedProfile } from './model';

export type OfflineContextValue = {
  engine: OfflineEngine;
  online: boolean;
  offlineMode: boolean;
  switchingMode: boolean;
  modeError: string | null;
  setOfflineMode: (enabled: boolean) => Promise<void>;
  assertCanEditLibrary: () => void;
  refresh: () => Promise<void>;
  flushPending: () => Promise<void>;
  retry: () => void;
  resolveConflict: (choice: 'device' | 'cloud') => Promise<void>;
};
export const OfflineContext = createContext<OfflineContextValue | null>(null);
type SyncRequest = { full?: boolean; manual?: boolean };
type SyncJob = {
  fullRequested: boolean;
  pushingRequested: boolean;
  downloading: boolean;
  manual: boolean;
  promise: Promise<void>;
};
const syncTimeoutMessage =
  'A sincronização demorou mais que o esperado. Seu estudo continua salvo; tente novamente.';
function syncDeadline(canConnect: () => boolean) {
  let expired = false;
  let rejectTimeout!: (error: Error) => void;
  const cancellation = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });
  void cancellation.catch(() => {});
  const timer = setTimeout(() => {
    expired = true;
    rejectTimeout(new Error(syncTimeoutMessage));
  }, 20_000);
  const connected = () => !expired && canConnect();
  return {
    connected,
    expired: () => expired,
    dispose: () => clearTimeout(timer),
    request<T>(start: () => Promise<T>): Promise<T> {
      if (!connected())
        return Promise.reject(
          new Error('Sincronização pausada. Seu estudo continua salvo.'),
        );
      return Promise.race([start(), cancellation]);
    },
  };
}
export function useOfflineContext() {
  const context = useContext(OfflineContext);
  if (!context)
    throw new Error('O armazenamento local ainda não está disponível.');
  return context;
}

export function OfflineProvider({
  accountKey,
  profile,
  onlineAuthenticated,
  children,
}: PropsWithChildren<{
  accountKey: string;
  name: string;
  environment: string;
  profile?: CachedProfile;
  onlineAuthenticated: boolean;
}>) {
  const client = useConvex();
  const connection = useConvexConnectionState();
  const [engine] = useState(
    () =>
      new OfflineEngine({
        accountKey,
        storage: persistence(accountKey),
        uuid: randomUUID,
      }),
  );
  const state = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getSnapshot,
  );
  const online = onlineAuthenticated && connection.isWebSocketConnected;
  const onlineRef = useRef(online);
  useLayoutEffect(() => {
    onlineRef.current = online;
  }, [online]);
  const profileRef = useRef(profile);
  useLayoutEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  const activeRef = useRef(true);
  const foregroundRef = useRef(AppState.currentState !== 'background');
  const lifecycleRefreshPending = useRef(true);
  const syncRef = useRef<(request?: SyncRequest) => Promise<void>>(
    async () => {},
  );
  const inFlightSync = useRef<SyncJob | null>(null);
  const [mode] = useState(
    // The constructor stores these callbacks without invoking them during render.
    // eslint-disable-next-line react-hooks/refs
    () =>
      new OfflineMode({
        ...offlinePreference(accountKey),
        promptMemory: promptMemoryFor(accountKey),
        canConnect: () => activeRef.current && onlineRef.current,
        synchronize: () => syncRef.current({ full: true, manual: true }),
      }),
  );
  const modeState = useSyncExternalStore(
    mode.subscribe,
    mode.getSnapshot,
    mode.getSnapshot,
  );
  async function pull(
    connected = () => activeRef.current && onlineRef.current,
    query: typeof client.query = (reference, ...args) =>
      client.query(reference, ...args),
  ): Promise<Data> {
    const assertDownload = () => {
      if (!connected())
        throw new Error(
          'Download pausado. Sua biblioteca salva foi preservada.',
        );
    };
    assertDownload();
    const remote = await query(api.offline.state, {});
    if (!remote.owner)
      throw new Error(
        'Conecte novamente para atualizar os dados da sua conta.',
      );
    if (remote.statsTruncated)
      throw new Error(
        'Há mais estatísticas do que o limite de download. Seus dados locais foram preservados.',
      );
    const attempts: Data['attempts'] = remote.attemptsTruncated
      ? []
      : remote.attempts;
    if (remote.attemptsTruncated) {
      let cursor: string | null = null;
      do {
        assertDownload();
        const page: {
          page: Data['attempts'];
          isDone: boolean;
          continueCursor: string;
        } = await query(api.offline.recentAttempts, {
          paginationOpts: { numItems: 100 - attempts.length, cursor },
        });
        attempts.push(...page.page);
        if (page.isDone || attempts.length >= 100) break;
        cursor = page.continueCursor;
      } while (cursor);
    }
    const cards: Card[] = [];
    for (const category of [
      'alphabet',
      'vocabulary',
      'grammar',
      'exam',
    ] as const) {
      for (const archived of [false, true]) {
        let cursor: string | null = null;
        do {
          assertDownload();
          const args: {
            archived: boolean;
            paginationOpts: { numItems: number; cursor: string | null };
          } = { archived, paginationOpts: { numItems: 100, cursor } };
          const page: {
            page: Card[];
            isDone: boolean;
            continueCursor: string;
          } =
            category === 'alphabet'
              ? await query(api.alphabet.search, args)
              : category === 'vocabulary'
                ? await query(api.vocabulary.search, args)
                : category === 'grammar'
                  ? await query(api.grammar.search, args)
                  : await query(api.exams.search, args);
          cards.push(...page.page);
          if (cards.length > 3000)
            throw new Error(
              'O download local suporta até 3.000 cards. Os dados anteriores foram preservados.',
            );
          if (page.isDone) break;
          cursor = page.continueCursor;
        } while (cursor);
      }
    }
    const jlptPapers: Doc<'jlptPapers'>[] = [];
    for (const archived of [false, true]) {
      let cursor: string | null = null;
      do {
        assertDownload();
        const page: {
          page: Doc<'jlptPapers'>[];
          isDone: boolean;
          continueCursor: string;
        } = await query(api.jlpt.search, {
          archived,
          paginationOpts: { numItems: 25, cursor },
        });
        jlptPapers.push(...page.page);
        if (jlptPapers.length > 200)
          throw new Error(
            'O download local suporta até 200 provas. Os dados anteriores foram preservados.',
          );
        if (page.isDone) break;
        if (page.continueCursor === cursor)
          throw new Error(
            'Não foi possível continuar o download das provas. Tente novamente.',
          );
        cursor = page.continueCursor;
      } while (cursor);
    }
    const jlptAttempts: Doc<'jlptAttempts'>[] = [];
    let attemptCursor: string | null = null;
    do {
      assertDownload();
      const page: {
        page: Doc<'jlptAttempts'>[];
        isDone: boolean;
        continueCursor: string;
      } = await query(api.jlpt.history, {
        paginationOpts: {
          numItems: Math.min(25, 100 - jlptAttempts.length),
          cursor: attemptCursor,
        },
      });
      jlptAttempts.push(...page.page);
      if (page.isDone || jlptAttempts.length >= 100) break;
      if (page.continueCursor === attemptCursor)
        throw new Error(
          'Não foi possível continuar o download do histórico de provas. Tente novamente.',
        );
      attemptCursor = page.continueCursor;
    } while (attemptCursor);
    assertDownload();
    const activeAttempt = await query(api.jlpt.active, {});
    if (
      activeAttempt &&
      !jlptAttempts.some((attempt) => attempt._id === activeAttempt._id)
    )
      jlptAttempts.push(activeAttempt);
    assertDownload();
    const stories = await query(api.stories.offlineSnapshot, {
      cachedIds: [
        ...new Set(
          (engine.getSnapshot().data?.stories ?? []).map(
            (story) => story.id as Id<'stories'>,
          ),
        ),
      ].slice(0, 100),
    });
    assertDownload();
    return {
      profile: remote.owner,
      cards,
      stats: remote.stats,
      attempts,
      sessions: remote.session ? [remote.session] : [],
      presentations: remote.presentations,
      jlptPapers,
      jlptAttempts,
      quests: remote.quests ?? [],
      questsHasMoreHistory: remote.questsHasMoreHistory ?? false,
      stories: stories.stories,
      storyProgress: stories.storyProgress,
      storiesHasMore: stories.hasMore,
      storyCachedStates: stories.cachedStates,
    };
  }
  const pullRef = useRef(pull);
  useLayoutEffect(() => {
    pullRef.current = pull;
  });
  const synchronize = async ({
    full = false,
    manual = false,
  }: SyncRequest = {}) => {
    const canStart = () =>
      activeRef.current && onlineRef.current && mode.canSynchronize(manual);
    if (!canStart()) {
      if (manual)
        throw new Error('Conecte-se à internet para sincronizar seus estudos.');
      return;
    }
    const pending = engine.getSnapshot().status.pending > 0;
    let job = inFlightSync.current;
    if (job) {
      // Join the same download. If only the journal is being sent, upgrade it
      // to one full refresh after its ACKs, without a second concurrent worker.
      if (full && !job.downloading) job.fullRequested = true;
      if (pending) job.pushingRequested = true;
      job.manual ||= manual;
    } else {
      if (!full && !pending) return;
      job = {
        fullRequested: full,
        pushingRequested: pending,
        downloading: false,
        manual,
        promise: Promise.resolve(),
      };
      const currentJob = job;
      const canUseNetwork = () =>
        activeRef.current &&
        onlineRef.current &&
        mode.canSynchronize(currentJob.manual);
      inFlightSync.current = currentJob;
      currentJob.promise = (async () => {
        const deadline = syncDeadline(canUseNetwork);
        const { connected, request } = deadline;
        const query: typeof client.query = (reference, ...args) =>
          request(() => client.query(reference, ...args));
        try {
          while (
            connected() &&
            (currentJob.fullRequested || currentJob.pushingRequested)
          ) {
            const download = currentJob.fullRequested;
            currentJob.fullRequested = false;
            currentJob.pushingRequested = false;
            currentJob.downloading = download;
            const send: Parameters<OfflineEngine['synchronizePending']>[0] = (
              operationId,
              command,
            ) =>
              request(() =>
                client.mutation(api.offline.apply, { operationId, command }),
              );
            const refreshed = download
              ? await engine.synchronize(
                  send,
                  () => pullRef.current(connected, query),
                  connected,
                )
              : await engine.synchronizePending(send, connected);
            currentJob.downloading = false;
            if (deadline.expired()) {
              if (canUseNetwork()) engine.reportSyncError(syncTimeoutMessage);
              break;
            }
            if (refreshed) lifecycleRefreshPending.current = false;
            const status = engine.getSnapshot().status;
            if (status.error || status.conflict) break;
            // A local write invalidates a downloaded study snapshot. Finish
            // this existing full-refresh intent after draining those writes;
            // ordinary answer ACKs never create a new full-refresh intent.
            if (download && !refreshed && status.pending)
              currentJob.fullRequested = true;
            currentJob.pushingRequested = status.pending > 0;
          }
        } finally {
          deadline.dispose();
          if (inFlightSync.current === currentJob) inFlightSync.current = null;
        }
      })();
    }
    const task = job.promise;
    if (!manual) return task;
    await task;
    const status = engine.getSnapshot().status;
    if (!canStart())
      throw new Error('A conexão caiu. Seus estudos continuam neste aparelho.');
    if (status.error || status.conflict || status.pending) {
      throw new Error(
        status.error ??
          status.conflict?.message ??
          'Ainda há estudos pendentes de sincronização.',
      );
    }
  };
  useLayoutEffect(() => {
    syncRef.current = synchronize;
  });
  const retry = useCallback(() => {
    void syncRef.current().catch(() => {});
  }, []);
  const refresh = useCallback(
    () => syncRef.current({ full: true, manual: true }),
    [],
  );
  const flushPending = useCallback(() => syncRef.current({ manual: true }), []);
  const setOfflineMode = useCallback(
    (enabled: boolean) => mode.setOfflineMode(enabled),
    [mode],
  );
  const assertCanEditLibrary = useCallback(() => {
    const current = mode.getSnapshot();
    if (
      !activeRef.current ||
      !onlineRef.current ||
      !current.ready ||
      current.offlineMode ||
      current.switchingMode
    ) {
      throw new Error(
        'Conecte-se e saia do modo offline nas configurações para alterar a biblioteca.',
      );
    }
  }, [mode]);
  const resolveConflict = useCallback(
    async (choice: 'device' | 'cloud') => {
      if (!activeRef.current || !onlineRef.current)
        throw new Error('Conecte para resolver esta pendência.');
      const offlineMode = mode.getSnapshot().offlineMode;
      const connected = () =>
        activeRef.current &&
        onlineRef.current &&
        mode.getSnapshot().offlineMode === offlineMode &&
        !mode.getSnapshot().switchingMode;
      const deadline = syncDeadline(connected);
      const query: typeof client.query = (reference, ...args) =>
        deadline.request(() => client.query(reference, ...args));
      try {
        await engine.resolveConflict(
          choice,
          () => pullRef.current(deadline.connected, query),
          deadline.connected,
        );
      } catch (error) {
        if (deadline.expired() && connected())
          engine.reportSyncError(syncTimeoutMessage);
        throw error;
      } finally {
        deadline.dispose();
      }
      if (mode.getSnapshot().offlineMode) await mode.setOfflineMode(false);
      else await syncRef.current({ full: true, manual: true });
    },
    [client, engine, mode],
  );
  useEffect(() => {
    activeRef.current = true;
    engine.resume();
    void Promise.all([engine.load(profileRef.current), mode.load()]);
    return () => {
      activeRef.current = false;
      engine.stop();
    };
  }, [engine, mode]);
  useEffect(() => {
    if (
      profile &&
      state.status.ready &&
      JSON.stringify(profile) !== JSON.stringify(state.data?.profile)
    )
      void engine.updateProfile(clone(profile));
  }, [profile, engine, state.status.ready, state.data?.profile]);
  useEffect(() => {
    if (
      online &&
      state.status.ready &&
      modeState.ready &&
      !modeState.offlineMode &&
      !modeState.switchingMode &&
      foregroundRef.current
    ) {
      if (lifecycleRefreshPending.current)
        void syncRef.current({ full: true }).catch(() => {});
    }
  }, [
    online,
    state.status.ready,
    modeState.ready,
    modeState.offlineMode,
    modeState.switchingMode,
    retry,
  ]);
  useEffect(() => {
    if (
      online &&
      state.status.ready &&
      state.status.pending &&
      modeState.ready &&
      !modeState.offlineMode &&
      !modeState.switchingMode &&
      foregroundRef.current
    )
      retry();
  }, [
    online,
    state.status.ready,
    state.status.pending,
    modeState.ready,
    modeState.offlineMode,
    modeState.switchingMode,
    retry,
  ]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (value) => {
      // Background execution is best effort. Do not stop the just-requested
      // exit refresh; only unmount/signout or offline mode cancels its next page.
      if (value !== 'active' && value !== 'background') return;
      const foreground = value === 'active';
      if (foregroundRef.current === foreground) return;
      foregroundRef.current = foreground;
      lifecycleRefreshPending.current = true;
      void syncRef.current({ full: true }).catch(() => {});
    });
    return () => listener.remove();
  }, [retry]);
  useEffect(() => {
    if (!modeState.ready || modeState.offlineMode || modeState.promptDismissed)
      return;
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observe = (network: Network.NetworkState) => {
      if (!current) return;
      if (timer) clearTimeout(timer);
      if (!hasNoInternet(network)) mode.networkChanged(false);
      else if (
        AppState.currentState === 'active' ||
        AppState.currentState === null
      ) {
        timer = setTimeout(() => {
          if (current) mode.networkChanged(true);
        }, 1500);
      }
    };
    const check = () => {
      void Network.getNetworkStateAsync()
        .then(observe)
        .catch(() => {});
    };
    const listener = Network.addNetworkStateListener(observe);
    const foreground = AppState.addEventListener('change', (value) => {
      if (value === 'active') check();
      else if (timer) clearTimeout(timer);
    });
    check();
    return () => {
      current = false;
      if (timer) clearTimeout(timer);
      listener.remove();
      foreground.remove();
    };
  }, [mode, modeState.ready, modeState.offlineMode, modeState.promptDismissed]);
  const context: OfflineContextValue = {
    engine,
    online,
    offlineMode: modeState.offlineMode,
    switchingMode: modeState.switchingMode,
    modeError: modeState.modeError,
    setOfflineMode,
    assertCanEditLibrary,
    refresh,
    flushPending,
    retry,
    resolveConflict,
  };
  if (!state.status.ready || !modeState.ready)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 28,
          gap: 16,
          backgroundColor: palette.background,
        }}
      >
        <ActivityIndicator color={palette.primary} />
        <Text>
          {state.status.error ??
            modeState.modeError ??
            'Abrindo os cards salvos no aparelho…'}
        </Text>
        {(state.status.error || modeState.modeError) && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void Promise.all([
                engine.load(profileRef.current),
                mode.load(),
              ]).then(() => syncRef.current({ full: true }));
            }}
          >
            <Text>Tentar de novo</Text>
          </Pressable>
        )}
      </View>
    );
  return (
    <OfflineContext.Provider value={context}>
      {children}
      <AppModal
        visible={modeState.promptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => mode.dismissPrompt()}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: palette.scrim,
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              padding: 24,
              gap: 16,
              borderRadius: 24,
              backgroundColor: palette.surface,
              maxWidth: 480,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            <Text
              accessibilityRole="header"
              style={{ color: palette.ink, fontSize: 24, fontWeight: '800' }}
            >
              Continuar offline?
            </Text>
            <Text
              style={{ color: palette.muted, fontSize: 15, lineHeight: 23 }}
            >
              A internet caiu. Você pode continuar no Benkyou e no Shiken com o
              conteúdo já baixado. Seus estudos ficam neste aparelho até você
              escolher sincronizar nas configurações.
            </Text>
            {modeState.modeError && (
              <Text accessibilityRole="alert" style={{ color: palette.error }}>
                {modeState.modeError}
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={modeState.switchingMode}
              onPress={() => {
                void mode.setOfflineMode(true).catch(() => {});
              }}
              style={{
                minHeight: 48,
                padding: 14,
                borderRadius: 14,
                backgroundColor: palette.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: palette.surface, fontWeight: '700' }}>
                {modeState.switchingMode ? 'Preparando…' : 'Continuar offline'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={modeState.switchingMode}
              onPress={() => mode.dismissPrompt()}
              style={{
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: palette.primary, fontWeight: '700' }}>
                Agora não
              </Text>
            </Pressable>
            <Text
              style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}
            >
              Se escolher “Agora não”, este convite só aparece novamente ao
              reabrir o app. Você pode ativar o modo offline pela engrenagem
              quando quiser.
            </Text>
          </View>
        </View>
      </AppModal>
    </OfflineContext.Provider>
  );
}
