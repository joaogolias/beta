import * as React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctionName } from 'convex/server';
import type { CachedProfile } from './model';
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

const profile = {
  _id: 'owner',
  _creationTime: 1,
  clerkUserId: 'clerk-owner',
  email: 'study@example.test',
  name: 'Study',
} as unknown as CachedProfile;
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
      `babel-crux:offline-mode:v1:${encodeURIComponent(account)}`,
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
      mocks.saved.get(
        `babel-crux:offline-mode:v1:${encodeURIComponent(account)}`,
      ),
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
      `babel-crux:offline-mode:v1:${encodeURIComponent(account)}`,
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
      mocks.saved.get(
        `babel-crux:offline-mode:v1:${encodeURIComponent(account)}`,
      ),
    ).toBe('offline');
  });
});
