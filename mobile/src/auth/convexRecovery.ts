export type RecoveryState = {
  signedIn: boolean;
  authenticated: boolean;
  loading: boolean;
  connected: boolean;
  foreground: boolean;
};

export function clerkTokenFetcher(
  getToken: (options: {
    template?: 'convex';
    skipCache?: boolean;
  }) => Promise<string | null>,
  audience: unknown,
) {
  return async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    try {
      return await getToken({
        ...(audience === 'convex' ? {} : { template: 'convex' as const }),
        skipCache: forceRefreshToken,
      });
    } catch {
      // A restored Clerk session can remain usable locally while token renewal
      // needs a network connection. Convex must still report it unauthenticated.
      return null;
    }
  };
}

/** Restarts token fetching only; its owner never remounts the local library. */
export function createAuthRecovery(retry: () => void) {
  let state: RecoveryState | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let stopped = false;
  let nextAllowedAt = 0;
  let lastAttemptAt = -Infinity;
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const eligible = () =>
    Boolean(
      !stopped &&
      state?.signedIn &&
      !state.authenticated &&
      !state.loading &&
      state.connected &&
      state.foreground,
    );
  function schedule() {
    cancel();
    if (!eligible()) return;
    timer = setTimeout(
      () => {
        timer = undefined;
        if (!eligible()) return;
        lastAttemptAt = Date.now();
        nextAllowedAt =
          lastAttemptAt + Math.min(1000 * 2 ** Math.min(attempt, 6), 60_000);
        attempt += 1;
        retry();
        schedule();
      },
      Math.max(0, nextAllowedAt - Date.now()),
    );
  }
  return {
    update(next: RecoveryState) {
      stopped = false;
      const returned =
        state &&
        ((!state.connected && next.connected) ||
          (!state.foreground && next.foreground));
      state = next;
      if (!next.signedIn || next.authenticated) {
        attempt = 0;
        nextAllowedAt = 0;
        lastAttemptAt = -Infinity;
      } else if (returned) {
        // Foreground/reconnect can expedite a long backoff, without permitting
        // rapid network flaps to trigger more than one attempt per second.
        nextAllowedAt = Math.max(Date.now(), lastAttemptAt + 1000);
      }
      schedule();
    },
    stop() {
      stopped = true;
      cancel();
    },
  };
}
