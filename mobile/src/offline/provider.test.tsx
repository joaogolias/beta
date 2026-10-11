import * as React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctionName } from 'convex/server';
import type { Doc } from '../../../backend/convex/_generated/dataModel';
import { emptyData, type CachedProfile } from './model';
import {
  OfflineProvider,
  useOfflineContext,
  type OfflineContextValue,
} from './Provider';

const mocks = vi.hoisted(() => ({
  saved: new Map<string, string>(),
  connected: true,
  query: vi.fn(),
  mutation: vi.fn(),
  network: { isConnected: true, isInternetReachable: true },
  networkListeners: new Set<
    (state: { isConnected: boolean; isInternetReachable: boolean }) => void
  >(),
  appListeners: new Set<(state: string) => void>(),
  networkRead: vi.fn(),
  serial: 0,
}));
vi.mock('convex/react', () => ({
  useConvex: () => ({ query: mocks.query, mutation: mocks.mutation }),
  useConvexConnectionState: () => ({ isWebSocketConnected: mocks.connected }),
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => `test-${++mocks.serial}` }));
vi.mock('expo-sqlite/kv-store', () => ({
  default: {
    getItem: async (key: string) => mocks.saved.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mocks.saved.set(key, value);
    },
  },
}));
vi.mock('expo-network', () => ({
  getNetworkStateAsync: () => {
    mocks.networkRead();
    return Promise.resolve(mocks.network);
  },
  addNetworkStateListener: (
    listener: typeof mocks.networkListeners extends Set<infer T> ? T : never,
  ) => {
    mocks.networkListeners.add(listener);
    return { remove: () => mocks.networkListeners.delete(listener) };
  },
}));
vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Modal: 'Modal',
  ActivityIndicator: 'ActivityIndicator',
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.appListeners.add(listener);
      return { remove: () => mocks.appListeners.delete(listener) };
    },
  },
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  SafeAreaView: 'SafeAreaView',
}));

const profile = {
  _id: 'owner',
  _creationTime: 1,
  clerkUserId: 'clerk-owner',
  email: 'study@example.test',
  name: 'Study',
} as unknown as CachedProfile;
const card: Doc<'alphabetCards'> = {
  _id: 'card' as Doc<'alphabetCards'>['_id'],
  _creationTime: 1,
  ownerId: profile._id,
  language: 'ja',
  writingSystem: 'Hani',
  symbol: '水',
  meanings: ['água'],
  examples: [],
  front: '水',
  back: 'água',
  sortKey: 'みず',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
  details: { kind: 'kanji', kunYomi: ['みず'], onYomi: [], radicals: [] },
  archived: false,
  contentVersion: 1,
  createdAt: 1,
  updatedAt: 1,
};
let current: OfflineContextValue;
const renderers: ReactTestRenderer[] = [];
function Probe() {
  const context = useOfflineContext();
  React.useLayoutEffect(() => {
    current = context;
  });
  return null;
}
function tree(account: string) {
  return (
    <OfflineProvider
      accountKey={account}
      name="Study"
      environment="development"
      profile={profile}
      onlineAuthenticated
    >
      <Probe />
    </OfflineProvider>
  );
}
async function mount(account: string) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(tree(account));
  });
  renderers.push(renderer);
  return renderer;
}
function text(node: ReactTestRenderer['root']): string {
  return node
    .findAllByType('Text' as never)
    .map((entry) => entry.props.children)
    .flat()
    .join(' ');
}
function prompt(renderer: ReactTestRenderer) {
  return renderer.root.findByType('Modal' as never);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.saved.clear();
  mocks.connected = true;
  mocks.network = { isConnected: true, isInternetReachable: true };
  mocks.networkListeners.clear();
  mocks.appListeners.clear();
  mocks.networkRead.mockClear();
  mocks.query.mockReset().mockImplementation(async (reference) => {
    const name = getFunctionName(reference);
    if (name === 'offline:state')
      return {
        owner: profile,
        stats: [],
        attempts: [],
        presentations: [],
        session: null,
      };
    if (name === 'jlpt:active') return null;
    return { page: [], isDone: true, continueCursor: '' };
  });
  mocks.mutation.mockReset();
});
afterEach(async () => {
  for (const renderer of renderers.splice(0))
    await act(async () => renderer.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('offline provider connectivity and synchronization', () => {
  it('times out cloud conflict resolution without clearing pending work and allows a fresh resolution', async () => {
    await mount('hung-cloud-resolution');
    await act(async () => {
      await current.engine.acceptRemoteContent(card);
    });
    mocks.mutation.mockRejectedValue({
      data: { code: 'CONFLICT', message: 'Outra sessão está ativa.' },
    });
    await act(async () => {
      await current.engine.mutate('study:start', {
        mode: 'direct',
        order: 'sorted',
        limit: 1,
      });
      current.retry();
    });
    expect(current.engine.getSnapshot().status.pending).toBe(1);
    let late!: (value: unknown) => void;
    mocks.query.mockClear().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          late = resolve;
        }),
    );
    let resolution!: Promise<void>;
    await act(async () => {
      resolution = current.resolveConflict('cloud');
    });
    const rejected = expect(resolution).rejects.toThrow('demorou');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_001);
      await rejected;
    });
    expect(current.engine.getSnapshot().status).toMatchObject({
      syncing: false,
      pending: 1,
      error: expect.stringContaining('demorou'),
    });
    await act(async () => {
      await current.resolveConflict('cloud');
    });
    expect(current.engine.getSnapshot().status).toMatchObject({
      syncing: false,
      pending: 0,
      conflict: null,
      error: null,
    });
    const refreshed = current.engine.getSnapshot().saved;
    mocks.query.mockClear();
    await act(async () => {
      late({
        owner: { ...profile, name: 'stale' },
        stats: [],
        attempts: [],
        presentations: [],
        session: null,
      });
    });
    expect(current.engine.getSnapshot().saved).toEqual(refreshed);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('releases a hung refresh after its deadline, permits retry and ignores the late old response', async () => {
    await mount('hung-refresh');
    let late!: (value: unknown) => void;
    mocks.query.mockClear().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          late = resolve;
        }),
    );
    let refresh!: Promise<void>;
    await act(async () => {
      refresh = current.refresh();
    });
    const rejected = expect(refresh).rejects.toThrow('demorou');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_001);
      await rejected;
    });
    expect(current.engine.getSnapshot().status).toMatchObject({
      syncing: false,
      error: expect.stringContaining('demorou'),
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    await act(async () => {
      await current.refresh();
    });
    expect(current.engine.getSnapshot().status).toMatchObject({
      syncing: false,
      error: null,
    });
    const refreshed = current.engine.getSnapshot().saved;
    mocks.query.mockClear();
    await act(async () => {
      late({
        owner: { ...profile, name: 'stale' },
        stats: [],
        attempts: [],
        presentations: [],
        session: null,
      });
    });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(current.engine.getSnapshot().saved).toEqual(refreshed);
  });
  it('retries a timed-out study send with its original idempotent payload and ignores its late ACK', async () => {
    await mount('hung-send');
    await act(async () => {
      await current.engine.acceptRemoteContent(card);
    });
    let late!: (value: unknown) => void;
    mocks.query.mockClear();
    mocks.mutation
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            late = resolve;
          }),
      )
      .mockResolvedValue({ mappings: [] });
    await act(async () => {
      await current.engine.mutate('study:start', {
        mode: 'direct',
        order: 'sorted',
        limit: 1,
      });
      current.retry();
    });
    const original = mocks.mutation.mock.calls[0][1];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_001);
    });
    expect(current.engine.getSnapshot().status).toMatchObject({
      syncing: false,
      pending: 1,
      error: expect.stringContaining('demorou'),
    });
    await act(async () => {
      current.retry();
    });
    expect(mocks.mutation).toHaveBeenCalledTimes(2);
    expect(mocks.mutation.mock.calls[1][1]).toEqual(original);
    expect(current.engine.getSnapshot().status.pending).toBe(0);
    const refreshed = current.engine.getSnapshot().saved;
    await act(async () => {
      late({ mappings: [{ localId: 'wrong', serverId: 'late' }] });
    });
    expect(current.engine.getSnapshot().saved).toEqual(refreshed);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('bootstraps once and leaves idle timers and later reconnects free of catalogue requests', async () => {
    const renderer = await mount('idle-no-poll');
    expect(
      mocks.query.mock.calls.filter(
        ([ref]) => getFunctionName(ref) === 'offline:state',
      ),
    ).toHaveLength(1);
    mocks.query.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    mocks.connected = false;
    await act(async () => {
      renderer.update(tree('idle-no-poll'));
    });
    mocks.connected = true;
    await act(async () => {
      renderer.update(tree('idle-no-poll'));
    });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
  it('completes one pending bootstrap when the app first gets a connection', async () => {
    mocks.connected = false;
    const renderer = await mount('late-bootstrap');
    expect(mocks.query).not.toHaveBeenCalled();
    mocks.connected = true;
    await act(async () => {
      renderer.update(tree('late-bootstrap'));
    });
    expect(
      mocks.query.mock.calls.filter(
        ([ref]) => getFunctionName(ref) === 'offline:state',
      ),
    ).toHaveLength(1);
  });
  it('keeps a foreground refresh requested without a socket until reconnection, without refreshing later idle reconnects', async () => {
    const renderer = await mount('return-without-socket');
    mocks.query.mockClear();
    mocks.connected = false;
    await act(async () => {
      renderer.update(tree('return-without-socket'));
    });
    await act(async () => {
      for (const listener of mocks.appListeners) listener('background');
    });
    await act(async () => {
      for (const listener of mocks.appListeners) listener('active');
    });
    expect(mocks.query).not.toHaveBeenCalled();
    mocks.connected = true;
    await act(async () => {
      renderer.update(tree('return-without-socket'));
    });
    expect(
      mocks.query.mock.calls.filter(
        ([ref]) => getFunctionName(ref) === 'offline:state',
      ),
    ).toHaveLength(1);
    mocks.query.mockClear();
    mocks.connected = false;
    await act(async () => {
      renderer.update(tree('return-without-socket'));
    });
    mocks.connected = true;
    await act(async () => {
      renderer.update(tree('return-without-socket'));
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(['bootstrap', 'manual'] as const)(
    'finishes a %s refresh invalidated by a new study write, then answer ACKs only flush the queue',
    async (trigger) => {
      const account = `write-during-${trigger}`;
      if (trigger === 'manual') {
        await mount(account);
        await act(async () => {
          await current.engine.acceptRemoteContent(card);
        });
      } else {
        mocks.saved.set(
          `beta:offline:v1:${encodeURIComponent(account)}`,
          JSON.stringify({
            version: 1,
            accountKey: account,
            base: { ...emptyData(profile), cards: [card] },
            queue: [],
            aliases: {},
            lastSyncedAt: 1,
          }),
        );
      }
      const query = mocks.query.getMockImplementation()!;
      const releases: ((value: unknown) => void)[] = [];
      mocks.query.mockClear().mockImplementation((reference, args) => {
        if (
          getFunctionName(reference) === 'offline:state' &&
          releases.length < 2
        )
          return new Promise((resolve) => {
            releases.push(resolve);
          });
        return query(reference, args);
      });
      mocks.mutation.mockResolvedValue({ mappings: [] });
      let refreshed = false;
      let refresh: Promise<void> | undefined;
      if (trigger === 'bootstrap') await mount(account);
      else
        await act(async () => {
          refresh = current.refresh().then(() => {
            refreshed = true;
          });
        });
      let session!: Doc<'studySessions'>;
      await act(async () => {
        session = (await current.engine.mutate('study:start', {
          mode: 'direct',
          order: 'sorted',
          limit: 1,
        })) as Doc<'studySessions'>;
        current.retry();
      });
      await act(async () => {
        releases[0]({
          owner: profile,
          stats: [],
          attempts: [],
          presentations: [],
          session: null,
        });
      });
      expect(releases).toHaveLength(2);
      expect(mocks.mutation).toHaveBeenCalledTimes(1);
      expect(refreshed).toBe(false);
      const synced = current.engine.getSnapshot().data!;
      await act(async () => {
        releases[1]({
          owner: profile,
          stats: synced.stats,
          attempts: synced.attempts,
          presentations: synced.presentations,
          session: synced.sessions[0],
        });
        await refresh;
      });
      expect(current.engine.getSnapshot().status.pending).toBe(0);
      expect(
        mocks.query.mock.calls.filter(
          ([ref]) => getFunctionName(ref) === 'offline:state',
        ),
      ).toHaveLength(2);
      mocks.query.mockClear();
      const presentation = current.engine.getSnapshot().data!.presentations[0];
      await act(async () => {
        await current.engine.mutate('study:reveal', {
          sessionId: session._id,
          presentationId: presentation._id,
        });
        current.retry();
        await vi.advanceTimersByTimeAsync(90_000);
      });
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.mutation).toHaveBeenCalledTimes(2);
    },
  );
  it('refreshes on background and foreground transitions, but repeated active events do not duplicate refreshes', async () => {
    await mount('lifecycle-refresh');
    mocks.query.mockClear();
    await act(async () => {
      for (const listener of mocks.appListeners) listener('background');
    });
    expect(
      mocks.query.mock.calls.filter(
        ([ref]) => getFunctionName(ref) === 'offline:state',
      ),
    ).toHaveLength(1);
    expect(
      mocks.query.mock.calls.some(
        ([ref]) => getFunctionName(ref) === 'jlpt:active',
      ),
    ).toBe(true);
    await act(async () => {
      for (const listener of mocks.appListeners) listener('active');
    });
    expect(
      mocks.query.mock.calls.filter(
        ([ref]) => getFunctionName(ref) === 'offline:state',
      ),
    ).toHaveLength(2);
    await act(async () => {
      for (const listener of mocks.appListeners) listener('active');
    });
    expect(
      mocks.query.mock.calls.filter(
        ([ref]) => getFunctionName(ref) === 'offline:state',
      ),
    ).toHaveLength(2);
  });
  it('coalesces simultaneous manual and lifecycle refreshes and waits for the same download', async () => {
    await mount('coalesced-refresh');
    let complete!: (value: unknown) => void;
    mocks.query.mockClear().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    let first!: Promise<void>, second!: Promise<void>;
    let finished = false;
    await act(async () => {
      first = current.refresh();
      second = current.refresh().then(() => {
        finished = true;
      });
      for (const listener of mocks.appListeners) listener('background');
    });
    expect(finished).toBe(false);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    await act(async () => {
      complete({
        owner: profile,
        stats: [],
        attempts: [],
        presentations: [],
        session: null,
      });
      await Promise.all([first, second]);
    });
    expect(finished).toBe(true);
    expect(
      mocks.query.mock.calls.filter(
        ([ref]) => getFunctionName(ref) === 'offline:state',
      ),
    ).toHaveLength(1);
  });
  it('sends study responses and reconnecting pending work without fetching catalogues', async () => {
    const renderer = await mount('push-study');
    await act(async () => {
      await current.engine.acceptRemoteContent(card);
    });
    mocks.query.mockClear();
    mocks.mutation.mockResolvedValue({ mappings: [] });
    mocks.connected = false;
    await act(async () => {
      renderer.update(tree('push-study'));
    });
    let session!: Doc<'studySessions'>;
    await act(async () => {
      session = (await current.engine.mutate('study:start', {
        mode: 'direct',
        order: 'sorted',
        limit: 1,
      })) as Doc<'studySessions'>;
    });
    expect(current.engine.getSnapshot().status.pending).toBe(1);
    mocks.connected = true;
    await act(async () => {
      renderer.update(tree('push-study'));
    });
    const presentation = current.engine.getSnapshot().data!.presentations[0];
    await act(async () => {
      await current.engine.mutate('study:reveal', {
        sessionId: session._id,
        presentationId: presentation._id,
      });
      current.retry();
    });
    await act(async () => {
      await current.engine.mutate('study:rate', {
        sessionId: session._id,
        presentationId: presentation._id,
        rating: 'correct',
      });
      current.retry();
    });
    expect(mocks.mutation).toHaveBeenCalledTimes(3);
    expect(current.engine.getSnapshot().status.pending).toBe(0);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('does not start another request after unmount while a download is in flight', async () => {
    const renderer = await mount('unmount-download');
    let complete!: (value: unknown) => void;
    mocks.query.mockClear().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    let refresh!: Promise<void>;
    await act(async () => {
      refresh = current.refresh();
    });
    const rejected = expect(refresh).rejects.toThrow();
    await act(async () => {
      renderer.unmount();
    });
    await act(async () => {
      complete({
        owner: profile,
        stats: [],
        attempts: [],
        presentations: [],
        session: null,
      });
      await rejected;
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
  it('stops additional download pages after offline is enabled during a request', async () => {
    await mount('stop-download');
    let complete!: (value: unknown) => void;
    mocks.query.mockClear().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    let refresh!: Promise<void>;
    await act(async () => {
      refresh = current.refresh();
    });
    const rejected = expect(refresh).rejects.toThrow();
    await act(async () => current.setOfflineMode(true));
    await act(async () => {
      complete({
        owner: profile,
        stats: [],
        attempts: [],
        presentations: [],
        session: null,
      });
      await rejected;
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(current.offlineMode).toBe(true);
    expect(() => current.assertCanEditLibrary()).toThrow('modo offline');
  });
  it('restores offline mode before any request and does not sync on timers or foreground', async () => {
    const account = 'persisted-offline';
    mocks.saved.set(
      `beta:offline-mode:v1:${encodeURIComponent(account)}`,
      'offline',
    );
    await mount(account);
    expect(current.offlineMode).toBe(true);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.networkRead).not.toHaveBeenCalled();
    expect(mocks.networkListeners.size).toBe(0);
    await act(async () => {
      for (const listener of mocks.appListeners) listener('active');
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
    await act(async () => current.setOfflineMode(false));
    expect(current.offlineMode).toBe(false);
    expect(mocks.query).toHaveBeenCalled();
    expect(
      mocks.saved.get(`beta:offline-mode:v1:${encodeURIComponent(account)}`),
    ).toBe('online');
  });
  it('offers offline once, stops network monitoring after refusal and allows manual activation', async () => {
    mocks.connected = false;
    mocks.network = { isConnected: false, isInternetReachable: false };
    const renderer = await mount('declined-runtime');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(prompt(renderer).props.visible).toBe(true);
    expect(current.offlineMode).toBe(false);
    const decline = renderer.root
      .findAllByType('Pressable' as never)
      .find((node) => text(node).includes('Agora não'))!;
    await act(async () => decline.props.onPress());
    expect(prompt(renderer).props.visible).toBe(false);
    expect(mocks.networkListeners.size).toBe(0);
    const reads = mocks.networkRead.mock.calls.length;
    await act(async () => {
      for (const listener of mocks.appListeners) listener('active');
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mocks.networkRead).toHaveBeenCalledTimes(reads);
    await act(async () => current.setOfflineMode(true));
    expect(current.offlineMode).toBe(true);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('keeps accepted mode and the journal local after the network comes back', async () => {
    mocks.connected = false;
    mocks.network = { isConnected: false, isInternetReachable: false };
    const renderer = await mount('accepted-runtime');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    await act(async () => current.setOfflineMode(true));
    mocks.connected = true;
    mocks.network = { isConnected: true, isInternetReachable: true };
    await act(async () => {
      renderer.update(tree('accepted-runtime'));
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(current.offlineMode).toBe(true);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
  it('keeps offline mode when the explicit exit cannot download the remote state', async () => {
    const account = 'failed-exit';
    mocks.saved.set(
      `beta:offline-mode:v1:${encodeURIComponent(account)}`,
      'offline',
    );
    await mount(account);
    mocks.query.mockRejectedValue(new Error('Servidor indisponível'));
    await act(async () => {
      await expect(current.setOfflineMode(false)).rejects.toThrow(
        'Servidor indisponível',
      );
    });
    expect(current.offlineMode).toBe(true);
    expect(current.switchingMode).toBe(false);
    expect(
      mocks.saved.get(`beta:offline-mode:v1:${encodeURIComponent(account)}`),
    ).toBe('offline');
  });
});
