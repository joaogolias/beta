import { createElement, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({ environment: 'development', loaded: true }));
vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return { extra: { appEnv: state.environment } };
    },
  },
}));
vi.mock('@clerk/expo', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ isLoaded: state.loaded, isSignedIn: false }),
  useSession: () => ({ session: null }),
}));
vi.mock('@clerk/expo/token-cache', () => ({ tokenCache: {} }));
vi.mock('@clerk/expo/resource-cache', () => ({ resourceCache: {} }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  SafeAreaView: 'SafeAreaView',
}));
vi.mock('../auth/AuthScreen', () => ({
  AuthScreen: () => createElement('AuthScreen'),
}));
vi.mock('../auth/ClerkConvexProvider', () => ({
  ClerkConvexProvider: 'ClerkConvexProvider',
}));
vi.mock('../navigation/StudyShell', () => ({ StudyShell: 'StudyShell' }));
vi.mock('../offline/Provider', () => ({ OfflineProvider: 'OfflineProvider' }));
vi.mock('../offline/storage', () => ({ getCachedProfile: vi.fn() }));
vi.mock('../offline/hooks', () => ({
  useOfflineStatus: () => ({ pending: 0 }),
}));
vi.mock('../streak/Provider', () => ({ StreakProvider: 'StreakProvider' }));

let tree: ReactTestRenderer;
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubEnv('EXPO_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test.each(['development', 'production'])(
  '%s labels auth, loading and invalid configuration according to the target environment',
  async (environment) => {
    state.environment = environment;
    for (const screen of ['auth', 'loading', 'configuration-error']) {
      state.loaded = screen !== 'loading';
      vi.stubEnv(
        'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
        screen === 'configuration-error'
          ? ''
          : environment === 'production'
            ? 'pk_live_example'
            : 'pk_test_example',
      );
      vi.resetModules();
      const { default: App } = await import('../../App');
      await act(async () => {
        tree = create(<App />);
      });
      expect(
        tree.root.findAllByProps({
          accessibilityLabel: 'Ambiente de desenvolvimento',
        }),
      ).toHaveLength(environment === 'development' ? 1 : 0);
      if (screen === 'auth')
        expect(tree.root.findByType('AuthScreen' as never)).toBeDefined();
      else
        expect(
          tree.root
            .findAllByType('Text' as never)
            .map((node) => node.props.children),
        ).toContain(
          screen === 'loading'
            ? 'Abrindo seus estudos'
            : 'Falta conectar o aplicativo',
        );
      await act(async () => tree.unmount());
    }
  },
);
