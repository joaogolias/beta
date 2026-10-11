import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useConvex } from 'convex/react';
import { api } from '../../../backend/convex/_generated/api';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import {
  storySummary,
  type StoryLevel,
  type StorySummary,
} from '../../../shared/stories';
import { useOfflineContext } from '../offline/Provider';
import { mergeStoryProgress } from '../offline/stories';

type Filters = { level?: StoryLevel; status?: 'all' | 'new' | 'completed' };
const errorText = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : 'Não foi possível abrir as histórias. Tente novamente.';
async function boundedRequest<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'A conexão demorou. Tente novamente ou continue com as histórias baixadas.',
              ),
            ),
          20_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function useStore() {
  const context = useOfflineContext();
  const { engine } = context;
  const state = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getSnapshot,
  );
  return { ...context, state };
}
const matches = (s: StorySummary, filters: Filters) =>
  !s.archived &&
  (!filters.level || s.level === filters.level) &&
  (filters.status === 'completed'
    ? s.progress?.completedAt !== undefined
    : filters.status === 'new'
      ? s.progress?.completedAt === undefined
      : true);

/** Catalogue pages are fetched on entry, refresh or explicit pagination, never polled. */
export function useStories(filters: Filters) {
  const client = useConvex();
  const { engine, state, online, offlineMode } = useStore();
  const offline = !online || offlineMode;
  const key = JSON.stringify([
    filters.level ?? null,
    filters.status ?? 'all',
    state.status.lastSyncedAt,
  ]);
  const [remote, setRemote] = useState<{
    key: string;
    items: StorySummary[];
    cursor: string | null;
    done: boolean;
    loading: boolean;
    error: string | null;
  }>({
    key: '',
    items: [],
    cursor: null,
    done: false,
    loading: false,
    error: null,
  });
  const [page, setPage] = useState({ key, limit: 20 });
  const request = useRef(0);
  const pending = useRef(false);
  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      const sequence = ++request.current;
      pending.current = true;
      setRemote((before) => ({
        key,
        items: append && before.key === key ? before.items : [],
        cursor,
        done: false,
        loading: true,
        error: null,
      }));
      try {
        const result = await boundedRequest(
          client.query(api.stories.list, {
            level: filters.level,
            status: filters.status ?? 'all',
            paginationOpts: { numItems: 20, cursor },
          }),
        );
        if (sequence !== request.current) return;
        setRemote((before) => ({
          key,
          items: [
            ...(append && before.key === key ? before.items : []),
            ...result.page,
          ],
          cursor: result.continueCursor,
          done: result.isDone,
          loading: false,
          error: null,
        }));
      } catch (cause) {
        if (sequence === request.current)
          setRemote((before) => ({
            ...before,
            loading: false,
            error: errorText(cause),
          }));
      } finally {
        if (sequence === request.current) pending.current = false;
      }
    },
    [client, key, filters.level, filters.status],
  );
  useEffect(() => {
    if (!offline) void fetchPage(null, false);
    return () => {
      // This numeric generation deliberately invalidates the active request.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      request.current++;
      pending.current = false;
    };
  }, [fetchPage, offline, engine]);
  const cached = useMemo(
    () =>
      (state.data?.stories ?? [])
        .filter((s) => !s.questId)
        .map((s) =>
          storySummary(
            s,
            state.data?.storyProgress?.find(
              (p) => p.storyId === s.id && !p.questId,
            ) ?? null,
          ),
        )
        .filter((s) => matches(s, filters))
        .sort((a, b) => b.createdAt - a.createdAt),
    [state.data, filters],
  );
  const current = remote.key === key ? remote : null;
  const useRemote =
    !offline &&
    current &&
    (!current.loading || current.items.length > 0) &&
    !(!current.items.length && current.error);
  const limit = page.key === key ? page.limit : 20;
  const remoteItems = useRemote
    ? current.items
        .map((s) => {
          const local = state.data?.storyProgress?.find(
            (p) => p.storyId === s.id && !p.questId,
          );
          return {
            ...s,
            progress: s.progress
              ? mergeStoryProgress(local, s.progress)
              : (local ?? null),
          };
        })
        .filter((s) => matches(s, filters))
    : cached.slice(0, limit);
  const pendingIds = new Set(
    state.saved?.queue.flatMap((p) =>
      'storyId' in p.command && !p.command.questId ? [p.command.storyId] : [],
    ),
  );
  const items = [
    ...new Map(
      [...cached.filter((s) => pendingIds.has(s.id)), ...remoteItems].map(
        (s) => [s.id, s],
      ),
    ).values(),
  ].sort((a, b) => b.createdAt - a.createdAt);
  const loadMore = useCallback(() => {
    if (offline)
      setPage((before) => ({
        key,
        limit: (before.key === key ? before.limit : 20) + 20,
      }));
    else if (!pending.current)
      void fetchPage(current?.cursor ?? null, !!current?.items.length);
  }, [offline, key, current?.cursor, current?.items.length, fetchPage]);
  return {
    items,
    loading:
      !state.status.ready ||
      (!offline && !items.length && (!current || current.loading)),
    hasMore: offline ? cached.length > limit : !current?.done,
    loadingMore: !!current?.loading && !!current.items.length,
    loadMore,
    error:
      offline && state.data?.storiesHasMore
        ? 'Offline: mostrando as histórias baixadas. Conecte para acessar as mais antigas.'
        : (current?.error ?? null),
    offline,
  };
}

export function useStory(id: string, questId?: string) {
  const client = useConvex();
  const {
    engine,
    state,
    online,
    offlineMode,
    switchingMode,
    retry: flush,
  } = useStore();
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState<{
    key: string;
    missing: boolean;
    error: string | null;
  }>({ key: '', missing: false, error: null });
  const requestKey = JSON.stringify([
    id,
    questId ?? null,
    online,
    offlineMode,
    attempt,
  ]);
  const cached = state.data?.stories?.find(
    (s) => s.id === id && s.questId === questId,
  );
  const progress =
    state.data?.storyProgress?.find(
      (p) => p.storyId === id && p.questId === questId,
    ) ?? null;
  const hasPending = state.saved?.queue.some(
    ({ command }) =>
      'storyId' in command &&
      command.storyId === id &&
      command.questId === questId,
  );
  // Mounting the reader saves its first paragraph. Reconcile a never-started
  // online story first so that automatic checkpoint cannot pin a stale edition.
  const waitingForEdition =
    online &&
    !offlineMode &&
    request.key !== requestKey &&
    (!cached || (!progress && !hasPending));
  useEffect(() => engine.retainStory(id, questId), [engine, id, questId]);
  useEffect(() => {
    let active = true;
    if (!online || offlineMode) return;
    void boundedRequest(
      client.query(api.stories.get, {
        id: id as Id<'stories'>,
        ...(questId ? { questId: questId as Id<'quests'> } : {}),
      }),
    )
      .then(async (result) => {
        if (!active) return;
        if (result)
          await engine.acceptRemoteStory(
            result.story,
            result.progress,
            result.quest,
          );
        if (active)
          setRequest({ key: requestKey, missing: !result, error: null });
      })
      .catch((cause: unknown) => {
        if (active)
          setRequest({
            key: requestKey,
            missing: false,
            error: errorText(cause),
          });
      });
    return () => {
      active = false;
    };
  }, [client, engine, id, questId, online, offlineMode, requestKey]);
  const mutate = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      if (switchingMode) throw new Error('Aguarde a mudança de modo terminar.');
      if (!online && !offlineMode)
        throw new Error(
          'Ative o modo offline nas configurações para continuar lendo sem internet.',
        );
      await engine.mutate(name, {
        id,
        ...(questId ? { questId } : {}),
        ...args,
      });
      if (!offlineMode) flush();
    },
    [engine, id, questId, online, offlineMode, switchingMode, flush],
  );
  return {
    story: waitingForEdition ? undefined : (cached ?? null),
    progress,
    error: request.key === requestKey ? request.error : null,
    loading: waitingForEdition,
    saveParagraph: useCallback(
      (index: number) =>
        mutate('stories:saveParagraph', { paragraphIndex: index }),
      [mutate],
    ),
    answer: useCallback(
      (questionId: string, optionId: string) =>
        mutate('stories:answer', { questionId, optionId }),
      [mutate],
    ),
    complete: useCallback(() => mutate('stories:complete', {}), [mutate]),
    retry: useCallback(() => setAttempt((n) => n + 1), []),
  };
}

export function useStoryPreferences() {
  const { engine, state } = useStore();
  return {
    furigana: state.saved?.storyPreferences?.furigana ?? true,
    setFurigana: useCallback(
      (furigana: boolean) => engine.setStoryPreferences({ furigana }),
      [engine],
    ),
  };
}
