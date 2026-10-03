import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clerkTokenFetcher,
  createAuthRecovery,
  type RecoveryState,
} from './convexRecovery';

// Exercise the installed SDK runtime with its published declarations, without
// type-checking the dependency's uncompiled source against our Expo TS config.
const authRuntime = new URL(
  '../../../node_modules/convex/dist/esm/browser/sync/authentication_manager.js',
  import.meta.url,
).href;
const stateRuntime = new URL(
  '../../../node_modules/convex/dist/esm/browser/sync/local_state.js',
  import.meta.url,
).href;
const { AuthenticationManager } = (await import(
  authRuntime
)) as typeof import('../../../node_modules/convex/dist/esm-types/browser/sync/authentication_manager');
const { LocalSyncState } = (await import(
  stateRuntime
)) as typeof import('../../../node_modules/convex/dist/esm-types/browser/sync/local_state');

const unauthenticated: RecoveryState = {
  signedIn: true,
  authenticated: false,
  loading: false,
  connected: true,
  foreground: true,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('Clerk and Convex offline authentication recovery', () => {
  it('restarts the actual SDK token fetch after cold offline startup reaches noAuth', async () => {
    let network = false;
    const getToken = vi.fn(async () => (network ? 'new-clerk-token' : null));
    const fetchToken = clerkTokenFetcher(getToken, undefined);
    const authenticate = vi.fn(() => 1);
    const reportAuth = vi.fn();
    const manager = new AuthenticationManager(
      new LocalSyncState(),
      {
        authenticate,
        stopSocket: async () => undefined,
        tryRestartSocket: vi.fn(),
        pauseSocket: vi.fn(),
        resumeSocket: vi.fn(),
        clearAuth: vi.fn(),
      },
      {
        refreshTokenLeewaySeconds: 2,
        initialAuthTokenReuse: false,
        logger: {
          log: vi.fn(),
          logVerbose: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      },
    );
    await manager.setConfig(fetchToken, reportAuth);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(reportAuth).toHaveBeenLastCalledWith(false);
    expect(authenticate).not.toHaveBeenCalled();
    const recovery = createAuthRecovery(() => {
      // A new fetchAccessToken callback makes ConvexProviderWithAuth call this
      // exact SDK method while keeping its client and child tree mounted.
      void manager.setConfig(
        clerkTokenFetcher(getToken, undefined),
        reportAuth,
      );
    });
    recovery.update({ ...unauthenticated, connected: false });
    await vi.advanceTimersByTimeAsync(10_000);
    network = true;
    // Network availability alone does not restart the SDK's noAuth state.
    expect(authenticate).not.toHaveBeenCalled();
    recovery.update(unauthenticated);
    await vi.advanceTimersByTimeAsync(0);
    expect(authenticate).toHaveBeenCalledExactlyOnceWith('new-clerk-token');
    recovery.update({ ...unauthenticated, authenticated: true });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(authenticate).toHaveBeenCalledTimes(1);
    manager.stop();
  });

  it('backs off exponentially and caps recurring retry intervals at sixty seconds', () => {
    const times: number[] = [];
    const recovery = createAuthRecovery(() => times.push(Date.now()));
    recovery.update(unauthenticated);
    vi.advanceTimersByTime(183_000);
    expect(times).toEqual([
      0, 1000, 3000, 7000, 15000, 31000, 63000, 123000, 183000,
    ]);
    recovery.stop();
  });

  it('does not retry while signed out, loading, disconnected, backgrounded or already authenticated', () => {
    const retry = vi.fn();
    const recovery = createAuthRecovery(retry);
    for (const state of [
      { signedIn: false },
      { loading: true },
      { connected: false },
      { foreground: false },
      { authenticated: true },
    ]) {
      recovery.update({ ...unauthenticated, ...state });
      vi.advanceTimersByTime(120_000);
    }
    expect(retry).not.toHaveBeenCalled();
    recovery.update(unauthenticated);
    vi.advanceTimersByTime(0);
    expect(retry).toHaveBeenCalledOnce();
    recovery.stop();
  });

  it('expedites recovery after foreground or reconnect without a retry storm on rapid network flaps', () => {
    const retry = vi.fn();
    const recovery = createAuthRecovery(retry);
    recovery.update(unauthenticated);
    vi.advanceTimersByTime(0);
    for (let index = 0; index < 8; index += 1) {
      vi.advanceTimersByTime(100);
      recovery.update({ ...unauthenticated, connected: false });
      recovery.update(unauthenticated);
    }
    expect(retry).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(retry).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(64_000);
    const beforeForeground = retry.mock.calls.length;
    recovery.update({ ...unauthenticated, foreground: false });
    recovery.update(unauthenticated);
    vi.advanceTimersByTime(0);
    expect(retry).toHaveBeenCalledTimes(beforeForeground + 1);
    recovery.stop();
  });

  it('cancels timers on cleanup and can resume after a Strict Mode effect replay', () => {
    const retry = vi.fn();
    const recovery = createAuthRecovery(retry);
    recovery.update(unauthenticated);
    recovery.stop();
    vi.advanceTimersByTime(120_000);
    expect(retry).not.toHaveBeenCalled();
    recovery.update(unauthenticated);
    vi.advanceTimersByTime(0);
    expect(retry).toHaveBeenCalledOnce();
    recovery.stop();
    vi.advanceTimersByTime(120_000);
    expect(retry).toHaveBeenCalledOnce();
  });

  it('does not let an in-flight loading state or token success restart another refresh', () => {
    const retry = vi.fn();
    const recovery = createAuthRecovery(retry);
    recovery.update(unauthenticated);
    vi.advanceTimersByTime(0);
    recovery.update({ ...unauthenticated, loading: true });
    vi.advanceTimersByTime(120_000);
    expect(retry).toHaveBeenCalledOnce();
    recovery.update({ ...unauthenticated, authenticated: true });
    vi.advanceTimersByTime(120_000);
    expect(retry).toHaveBeenCalledOnce();
    recovery.update(unauthenticated);
    vi.advanceTimersByTime(0);
    expect(retry).toHaveBeenCalledTimes(2);
    recovery.stop();
  });

  it('honors forced refresh and preserves Clerk integration versus JWT-template options', async () => {
    const getToken = vi.fn(async () => 'token');
    await expect(
      clerkTokenFetcher(getToken, 'convex')({ forceRefreshToken: true }),
    ).resolves.toBe('token');
    expect(getToken).toHaveBeenLastCalledWith({ skipCache: true });
    await clerkTokenFetcher(getToken, undefined)({ forceRefreshToken: false });
    expect(getToken).toHaveBeenLastCalledWith({
      template: 'convex',
      skipCache: false,
    });
    const offline = vi.fn(async () => {
      throw new Error('Network unavailable');
    });
    await expect(
      clerkTokenFetcher(offline, undefined)({ forceRefreshToken: true }),
    ).resolves.toBeNull();
  });
});
