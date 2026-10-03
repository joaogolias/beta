import { useAuth } from '@clerk/expo';
import {
  ConvexProviderWithAuth,
  useConvexAuth,
  useConvexConnectionState,
  type ConvexReactClient,
} from 'convex/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { clerkTokenFetcher, createAuthRecovery } from './convexRecovery';

const RecoveryGeneration = createContext(0);

function useClerkAuthForConvex() {
  const {
    isLoaded,
    isSignedIn,
    getToken,
    orgId,
    orgRole,
    sessionId,
    sessionClaims,
  } = useAuth();
  const generation = useContext(RecoveryGeneration);
  const audience = sessionClaims?.aud;
  const fetchAccessToken = useMemo(
    () => clerkTokenFetcher(getToken, audience),
    // Clerk Expo does not memoize getToken. As in Convex's Clerk adapter, only
    // auth-context changes should replace this callback; recovery adds one
    // explicit generation to restart the SDK after an offline null-token result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, orgRole, sessionId, audience, generation],
  );
  return useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: isSignedIn ?? false,
      fetchAccessToken,
    }),
    [isLoaded, isSignedIn, fetchAccessToken],
  );
}

function RecoverAuthentication({ retry }: { retry: () => void }) {
  const { isSignedIn } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { isWebSocketConnected } = useConvexConnectionState();
  const [foreground, setForeground] = useState(
    () =>
      AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const [recovery] = useState(() => createAuthRecovery(retry));
  useEffect(() => {
    const listener = AppState.addEventListener('change', (next) =>
      setForeground(next === 'active'),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    recovery.update({
      signedIn: Boolean(isSignedIn),
      authenticated: isAuthenticated,
      loading: isLoading,
      connected: isWebSocketConnected,
      foreground,
    });
    return recovery.stop;
  }, [
    recovery,
    isSignedIn,
    isAuthenticated,
    isLoading,
    isWebSocketConnected,
    foreground,
  ]);
  return null;
}

export function ClerkConvexProvider({
  client,
  children,
}: PropsWithChildren<{ client: ConvexReactClient }>) {
  const [generation, setGeneration] = useState(0);
  const retry = useCallback(
    () => setGeneration((previous) => previous + 1),
    [],
  );
  return (
    <RecoveryGeneration.Provider value={generation}>
      <ConvexProviderWithAuth client={client} useAuth={useClerkAuthForConvex}>
        <RecoverAuthentication retry={retry} />
        {children}
      </ConvexProviderWithAuth>
    </RecoveryGeneration.Provider>
  );
}
