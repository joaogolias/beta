import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from 'convex/server';
import {
  useConvex,
  usePaginatedQuery as useRemotePages,
  useQuery as useRemoteQuery,
} from 'convex/react';
import { api } from '../../../backend/convex/_generated/api';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import { localQuery, resolveId, type Card } from './model';
import { useOfflineContext } from './Provider';

export function useOfflineStatus() {
  const { engine, ...context } = useOfflineContext();
  const state = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getSnapshot,
  );
  return { ...state.status, ...context };
}
/** Study controls can write locally only after offline mode was accepted. */
export function useConvexConnectionState() {
  const { ready, online, offlineMode, switchingMode } = useOfflineStatus();
  return {
    isWebSocketConnected: ready && !switchingMode && (online || offlineMode),
  };
}
export function useQuery<Query extends FunctionReference<'query'>>(
  reference: Query,
  args: FunctionArgs<Query> | 'skip',
): FunctionReturnType<Query> | undefined {
  const { engine, online, offlineMode } = useOfflineContext();
  const state = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getSnapshot,
  );
  const name = getFunctionName(reference),
    key = JSON.stringify(args);
  const attemptId =
    name === 'jlpt:getAttempt' &&
    args !== 'skip' &&
    'id' in args &&
    typeof args.id === 'string'
      ? resolveId(args.id, state.saved?.aliases ?? {})
      : null;
  const historicalAttempt = useRemoteQuery(
    api.jlpt.getAttempt,
    attemptId &&
      online &&
      !offlineMode &&
      state.status.pending === 0 &&
      !attemptId.startsWith('local:') &&
      !state.data?.jlptAttempts?.some((attempt) => attempt._id === attemptId)
      ? { id: attemptId as Id<'jlptAttempts'> }
      : 'skip',
  );
  const local = useMemo(() => {
    if (key === '"skip"' || !state.data || !state.saved) return undefined;
    const queryArgs = JSON.parse(key) as Record<string, unknown>;
    if (
      name === 'study:current' &&
      !state.data.sessions.some(
        (session) =>
          session._id ===
          resolveId(String(queryArgs.sessionId), state.saved!.aliases),
      )
    )
      return undefined;
    return localQuery(
      state.data,
      name,
      queryArgs,
      state.saved.aliases,
    ) as FunctionReturnType<Query>;
  }, [state.data, state.saved, name, key]);
  return (historicalAttempt ?? local) as FunctionReturnType<Query> | undefined;
}
type Paginated = FunctionReference<
  'query',
  'public',
  { paginationOpts: { numItems: number; cursor: string | null } },
  { page: unknown[]; isDone: boolean; continueCursor: string }
>;
export function usePaginatedQuery<Query extends Paginated>(
  reference: Query,
  args: Omit<FunctionArgs<Query>, 'paginationOpts'> | 'skip',
  options: { initialNumItems: number },
) {
  const { engine, online, offlineMode } = useOfflineContext();
  const state = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getSnapshot,
  );
  const name = getFunctionName(reference),
    key = JSON.stringify([name, args]);
  const historyCard =
    args !== 'skip' && 'cardId' in args && typeof args.cardId === 'string'
      ? resolveId(args.cardId, state.saved?.aliases ?? {})
      : null;
  const remoteHistory =
    name === 'study:history' &&
    online &&
    !offlineMode &&
    state.status.pending === 0 &&
    historyCard !== null &&
    !historyCard.startsWith('local:');
  const history = useRemotePages(
    api.study.history,
    remoteHistory
      ? {
          cardId: historyCard as
            | Id<'alphabetCards'>
            | Id<'vocabularyCards'>
            | Id<'grammarCards'>
            | Id<'examCards'>,
        }
      : 'skip',
    options,
  );
  const rawPaperId =
    args !== 'skip' && 'paperId' in args && typeof args.paperId === 'string'
      ? args.paperId
      : null;
  const paperId = rawPaperId
    ? resolveId(rawPaperId, state.saved?.aliases ?? {})
    : null;
  const remoteJlptHistory =
    name === 'jlpt:history' &&
    args !== 'skip' &&
    online &&
    !offlineMode &&
    state.status.pending === 0 &&
    (!paperId || !paperId.startsWith('local:'));
  const jlptHistory = useRemotePages(
    api.jlpt.history,
    remoteJlptHistory
      ? paperId
        ? { paperId: paperId as Id<'jlptPapers'> }
        : {}
      : 'skip',
    options,
  );
  const [page, setPage] = useState({ key, limit: options.initialNumItems });
  const limit = page.key === key ? page.limit : options.initialNumItems;
  type Item = FunctionReturnType<Query>['page'][number];
  const results = useMemo(() => {
    const [, queryArgs] = JSON.parse(key) as [
      string,
      Record<string, unknown> | 'skip',
    ];
    if (queryArgs === 'skip' || !state.data || !state.saved)
      return [] as Item[];
    return localQuery(
      state.data,
      name,
      queryArgs,
      state.saved.aliases,
    ) as Item[];
  }, [state.data, state.saved, name, key]);
  const loadMore = useCallback(
    (count: number) =>
      setPage((previous) => ({
        key,
        limit:
          (previous.key === key ? previous.limit : options.initialNumItems) +
          count,
      })),
    [key, options.initialNumItems],
  );
  const status:
    'LoadingFirstPage' | 'LoadingMore' | 'CanLoadMore' | 'Exhausted' = !state
    .status.ready
    ? 'LoadingFirstPage'
    : results.length > limit
      ? 'CanLoadMore'
      : 'Exhausted';
  if (remoteHistory && history.status !== 'LoadingFirstPage')
    return {
      results: history.results as Item[],
      status: history.status,
      loadMore: history.loadMore,
    };
  if (remoteJlptHistory && jlptHistory.status !== 'LoadingFirstPage')
    return {
      results: jlptHistory.results as Item[],
      status: jlptHistory.status,
      loadMore: jlptHistory.loadMore,
    };
  return {
    results: results.slice(0, limit),
    status: status as
      'LoadingFirstPage' | 'LoadingMore' | 'CanLoadMore' | 'Exhausted',
    loadMore,
  };
}
export function useMutation<Mutation extends FunctionReference<'mutation'>>(
  reference: Mutation,
) {
  const client = useConvex();
  const {
    engine,
    retry,
    refresh,
    online,
    offlineMode,
    switchingMode,
    assertCanEditLibrary,
  } = useOfflineContext();
  const name = getFunctionName(reference);
  return useCallback(
    async (
      args: FunctionArgs<Mutation>,
    ): Promise<FunctionReturnType<Mutation>> => {
      if (switchingMode) throw new Error('Aguarde a mudança de modo terminar.');
      const contentMutation =
        /^(alphabet|vocabulary|grammar|exams|jlpt):(create|update|archive|restore)$/.test(
          name,
        );
      if (contentMutation) {
        assertCanEditLibrary();
        // Older versions journaled library edits. Send those first so a new
        // direct mutation cannot race or overwrite a still-pending edit.
        if (engine.getSnapshot().status.pending) await refresh();
        const state = engine.getSnapshot();
        if (state.status.pending || state.status.conflict)
          throw new Error(
            'Resolva a sincronização pendente antes de alterar sua biblioteca.',
          );
        const remoteArgs = { ...args };
        if ('id' in remoteArgs && typeof remoteArgs.id === 'string') {
          remoteArgs.id = resolveId(remoteArgs.id, state.saved?.aliases ?? {});
          if (remoteArgs.id.startsWith('local:'))
            throw new Error('Sincronize este item antes de alterá-lo.');
        }
        // A previous edit may have taken time to synchronize; consult the
        // current mode instead of the one captured when this callback began.
        assertCanEditLibrary();
        const value = await client.mutation(reference, remoteArgs);
        // All library mutations return their complete document. Preserve that
        // confirmed result even if a later full-library download is unavailable.
        await engine.acceptRemoteContent(value as Card | Doc<'jlptPapers'>);
        await refresh().catch(() => undefined);
        return value;
      }
      if (!online && !offlineMode)
        throw new Error(
          'Sem internet. Ative o modo offline nas configurações para continuar estudando.',
        );
      const value = await engine.mutate(name, args as Record<string, unknown>);
      if (!offlineMode) retry();
      return value as FunctionReturnType<Mutation>;
    },
    [
      client,
      engine,
      name,
      offlineMode,
      online,
      reference,
      refresh,
      retry,
      switchingMode,
      assertCanEditLibrary,
    ],
  );
}
