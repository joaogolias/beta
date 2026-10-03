import { StrictMode, type PropsWithChildren } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useClientLifetime } from './clientLifetime';

// Keep the installed Convex SDK and its real auth cleanup; replace only I/O.
class Socket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    queueMicrotask(() => this.onopen?.());
  }
  send() {}
  close() {
    queueMicrotask(() => this.onclose?.());
  }
}
const fetchAccessToken = async () => null;
function useSignedIn() {
  return { isLoading: false, isAuthenticated: true, fetchAccessToken };
}
function Session({
  client,
  children,
}: PropsWithChildren<{ client: ConvexReactClient }>) {
  useClientLifetime(client);
  return (
    <ConvexProviderWithAuth client={client} useAuth={useSignedIn}>
      {children}
    </ConvexProviderWithAuth>
  );
}
function client() {
  return new ConvexReactClient('https://example.convex.cloud', {
    logger: false,
    unsavedChangesWarning: false,
  });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('WebSocket', Socket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('signed-in backend lifetime', () => {
  test('signing out lets the real Convex auth provider clean up before closing its client', async () => {
    const connection = client();
    const clearAuth = vi.spyOn(connection, 'clearAuth');
    const close = vi.spyOn(connection, 'close');
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<Session client={connection} />);
    });
    await expect(
      act(async () => {
        tree.unmount();
      }),
    ).resolves.toBeUndefined();
    expect(clearAuth).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(clearAuth.mock.invocationCallOrder[0]).toBeLessThan(
      close.mock.invocationCallOrder[0],
    );
  });

  test('Strict Mode effect replay keeps the session client usable until its actual unmount', async () => {
    const connection = client();
    const close = vi.spyOn(connection, 'close');
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <StrictMode>
          <Session client={connection} />
        </StrictMode>,
      );
    });
    expect(close).not.toHaveBeenCalled();
    expect(() => connection.clearAuth()).not.toThrow();
    await act(async () => tree.unmount());
    expect(close).toHaveBeenCalledOnce();
  });

  test('switching accounts disposes only the previous client and keeps the new account live', async () => {
    const previous = client();
    const next = client();
    const closePrevious = vi.spyOn(previous, 'close');
    const closeNext = vi.spyOn(next, 'close');
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<Session key="previous" client={previous} />);
    });
    await act(async () => {
      tree.update(<Session key="next" client={next} />);
    });
    expect(closePrevious).toHaveBeenCalledOnce();
    expect(closeNext).not.toHaveBeenCalled();
    expect(() => next.clearAuth()).not.toThrow();
    await act(async () => tree.unmount());
    expect(closeNext).toHaveBeenCalledOnce();
  });
});
