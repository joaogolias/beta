import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import { useConvexConnectionState, useMutation, useQuery } from 'convex/react';
import { api } from '../../../backend/convex/_generated/api';
import { useOfflineContext } from '../offline/Provider';
import {
  activityDay,
  captureActivity,
  emptyStreak,
  streakSummary,
} from '../../../shared/dailyStreak';
import { StreakStore, streakMood } from './model';
import { streakPersistence } from './storage';
import {
  clearStreakNative,
  getStreakNotificationPermission,
  requestStreakNotificationPermission,
  syncStreakNative,
} from './native';

type StreakContextValue = ReturnType<typeof streakSummary> & {
  mood: ReturnType<typeof streakMood>;
  ready: boolean;
  remindersEnabled: boolean;
  pending: number;
  error: string | null;
  setReminders: (enabled: boolean) => Promise<boolean>;
};
const StreakContext = createContext<StreakContextValue | null>(null);
// Native preferences belong to the visible account. Serialize cleanup and subsequent account writes.
let nativeWrites: Promise<void> = Promise.resolve();
function updateNative(operation: () => Promise<void>) {
  nativeWrites = nativeWrites.then(operation).catch(() => {});
}

export function StreakProvider({
  accountKey,
  onlineAuthenticated,
  children,
}: PropsWithChildren<{ accountKey: string; onlineAuthenticated: boolean }>) {
  const [store] = useState(
    () => new StreakStore(accountKey, streakPersistence(accountKey, Storage)),
  );
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [now, setNow] = useState(() => new Date());
  const today = activityDay(captureActivity(now));
  const [retry, setRetry] = useState(0);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const { isWebSocketConnected } = useConvexConnectionState();
  const { offlineMode, switchingMode } = useOfflineContext();
  const canSync = onlineAuthenticated && !offlineMode && !switchingMode;
  const syncAllowed = useRef(false);
  useLayoutEffect(() => {
    syncAllowed.current = canSync && isWebSocketConnected;
    return () => {
      syncAllowed.current = false;
    };
  }, [canSync, isWebSocketConnected]);
  const record = useMutation(api.streak.record);
  const remote = useQuery(api.streak.current, canSync ? {} : 'skip');
  const ready = Boolean(state.saved);
  const remindersEnabled = state.saved?.remindersEnabled ?? false;
  const summary = useMemo(
    () => streakSummary(state.saved?.history ?? emptyStreak(), today),
    [state.saved?.history, today],
  );

  useEffect(() => {
    let active = true;
    const visit = () => {
      if (!active || AppState.currentState !== 'active') return;
      const now = new Date();
      const activity = captureActivity(now);
      setNow(now);
      void store.load().then(() => {
        if (active) return store.visit(activity);
      });
      setRetry((value) => value + 1);
      void getStreakNotificationPermission()
        .then((granted) => {
          if (active && !granted && store.getSnapshot().saved?.remindersEnabled)
            void store.setReminders(false);
        })
        .catch(() => {});
    };
    void store.load().then(visit);
    const subscription = AppState.addEventListener('change', (value) => {
      if (value === 'active') visit();
    });
    const timer = setInterval(visit, 60_000);
    return () => {
      active = false;
      subscription.remove();
      clearInterval(timer);
      updateNative(clearStreakNative);
    };
  }, [store]);
  useEffect(() => {
    if (remote && ready) void store.receive(remote);
  }, [remote, ready, store]);
  useEffect(() => {
    if (canSync && isWebSocketConnected)
      void store.sync(
        (activities) => record({ activities }),
        () => syncAllowed.current,
      );
  }, [
    canSync,
    isWebSocketConnected,
    state.saved?.pending.length,
    retry,
    record,
    store,
  ]);
  useEffect(() => {
    if (!ready) return;
    updateNative(() =>
      syncStreakNative({
        ownerId: accountKey,
        currentStreak: summary.currentStreak,
        lastActiveDate: summary.lastActiveDate,
        restartedOnDate: summary.restartedToday ? summary.lastActiveDate : null,
        remindersEnabled,
      }),
    );
  }, [
    accountKey,
    remindersEnabled,
    summary.currentStreak,
    summary.lastActiveDate,
    summary.restartedToday,
    ready,
  ]);

  async function setReminders(enabled: boolean) {
    setNativeError(null);
    try {
      if (enabled && !(await requestStreakNotificationPermission())) {
        setNativeError(
          'Permita notificações nas configurações do Android para receber o lembrete.',
        );
        return false;
      }
      await store.setReminders(enabled);
      return store.getSnapshot().saved?.remindersEnabled === enabled;
    } catch {
      setNativeError('Não foi possível alterar o lembrete. Tente novamente.');
      return false;
    }
  }
  return (
    <StreakContext.Provider
      value={{
        ...summary,
        mood: streakMood(summary, now.getHours()),
        ready: Boolean(state.saved),
        remindersEnabled: state.saved?.remindersEnabled ?? false,
        pending: state.saved?.pending.length ?? 0,
        error:
          nativeError ??
          state.error ??
          (state.saved?.rejectedActivities?.length
            ? 'Alguns registros tinham datas inválidas e foram preservados neste aparelho. Confira a data e a hora do Android. Os demais dias continuam sincronizando.'
            : null),
        setReminders,
      }}
    >
      {children}
    </StreakContext.Provider>
  );
}
export function useStreak() {
  const context = useContext(StreakContext);
  if (!context) throw new Error('StreakProvider ausente.');
  return context;
}
