import { ClerkProvider, useAuth, useClerk, useSession } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { resourceCache } from '@clerk/expo/resource-cache';
import {
  ConvexReactClient,
  useConvexAuth,
  useMutation,
  useQuery,
} from 'convex/react';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import {
  Component,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../backend/convex/_generated/api';
import { AuthScreen } from './src/auth/AuthScreen';
import { ClerkConvexProvider } from './src/auth/ClerkConvexProvider';
import { useClientLifetime } from './src/auth/clientLifetime';
import { parseRuntimeConfig, type RuntimeConfig } from './src/config';
import { StudyShell } from './src/navigation/StudyShell';
import { OfflineProvider } from './src/offline/Provider';
import {
  profileForAccount,
  type CachedAccountProfile,
} from './src/auth/offlineProfile';
import { getCachedProfile } from './src/offline/storage';
import { useOfflineStatus } from './src/offline/hooks';
import { palette } from './src/theme';
import { StreakProvider } from './src/streak/Provider';

function readConfiguration():
  { config: RuntimeConfig; error?: never } | { config?: never; error: string } {
  try {
    return {
      config: parseRuntimeConfig({
        environment: Constants.expoConfig?.extra?.appEnv,
        clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
        convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL,
      }),
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Verifique a configuração do aplicativo.',
    };
  }
}
const configuration = readConfiguration();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {configuration.config ? (
        <ClerkProvider
          publishableKey={configuration.config.clerkPublishableKey}
          tokenCache={tokenCache}
          __experimental_resourceCache={resourceCache}
        >
          <SessionRoot config={configuration.config} />
        </ClerkProvider>
      ) : (
        <Message
          title="Falta conectar o aplicativo"
          detail={configuration.error}
        />
      )}
    </SafeAreaProvider>
  );
}

function SessionRoot({ config }: { config: RuntimeConfig }) {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth({
    treatPendingAsSignedOut: false,
  });
  const { session } = useSession();
  const [connection, setConnection] = useState(0);
  if (!isLoaded) return <Message title="Abrindo seus estudos" busy />;
  if (!isSignedIn || session?.currentTask) return <AuthScreen />;
  const retry = () => setConnection((value) => value + 1);
  // An account/session change discards the previous account's entire Convex cache.
  return (
    <BackendBoundary key={`${userId}:${sessionId}:${connection}`} retry={retry}>
      <UserBackend
        config={config}
        accountKey={`${config.convexUrl}:${userId}`}
        retry={retry}
      />
    </BackendBoundary>
  );
}

function UserBackend({
  config,
  accountKey,
  retry,
}: {
  config: RuntimeConfig;
  accountKey: string;
  retry: () => void;
}) {
  const [client] = useState(() => new ConvexReactClient(config.convexUrl));
  useClientLifetime(client);
  return (
    <ClerkConvexProvider client={client}>
      <ProfileGate
        accountKey={accountKey}
        environment={config.environment}
        retry={retry}
      />
    </ClerkConvexProvider>
  );
}

function ProfileGate({
  accountKey,
  environment,
  retry,
}: {
  accountKey: string;
  environment: string;
  retry: () => void;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureCurrentUser);
  const user = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const [cachedProfile, setCachedProfile] = useState<
    CachedAccountProfile | undefined
  >(undefined);
  const [provisioning, setProvisioning] = useState<
    'pending' | 'ready' | 'failed'
  >('pending');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    void getCachedProfile(accountKey).then(
      (profile) => {
        if (current) setCachedProfile({ accountKey, profile });
      },
      () => {
        if (current) setCachedProfile({ accountKey, profile: null });
      },
    );
    return () => {
      current = false;
    };
  }, [accountKey]);
  useEffect(() => {
    if (!isAuthenticated) return;
    let current = true;
    void ensureUser({}).then(
      () => {
        if (current) setProvisioning('ready');
      },
      () => {
        if (current) setProvisioning('failed');
      },
    );
    return () => {
      current = false;
    };
  }, [isAuthenticated, ensureUser, attempt]);
  // Clerk must restore this exact signed-in account before ProfileGate mounts.
  // The cached profile unlocks only its local library, never server access.
  const profile = profileForAccount(accountKey, user, cachedProfile);
  if (profile) {
    const name = profile.name ?? profile.email ?? 'Estudante';
    return (
      <OfflineProvider
        key={accountKey}
        accountKey={accountKey}
        name={name}
        environment={environment}
        profile={profile}
        onlineAuthenticated={
          isAuthenticated && provisioning === 'ready' && Boolean(user)
        }
      >
        <StreakProvider
          accountKey={accountKey}
          onlineAuthenticated={
            isAuthenticated && provisioning === 'ready' && Boolean(user)
          }
        >
          <StudyHome name={name} environment={environment} />
        </StreakProvider>
      </OfflineProvider>
    );
  }
  if (!cachedProfile || cachedProfile.accountKey !== accountKey)
    return <Message title="Abrindo seus estudos" busy />;
  if (isLoading)
    return (
      <Message
        title="Quase lá"
        detail="Só um instante para abrir seus cards."
        busy
        action={{ label: 'Tentar de novo', onPress: retry }}
        signOut
      />
    );
  if (!isAuthenticated)
    return (
      <Message
        title="Não deu para entrar agora"
        detail="Conecte-se à internet para preparar sua biblioteca neste aparelho. Depois você poderá usá-la sem conexão."
        action={{ label: 'Tentar novamente', onPress: retry }}
        signOut
      />
    );
  if (provisioning === 'failed')
    return (
      <Message
        title="Não foi possível preparar sua conta"
        detail="Confira a conexão e tente novamente."
        action={{
          label: 'Tentar novamente',
          onPress: () => {
            setProvisioning('pending');
            setAttempt((value) => value + 1);
          },
        }}
        signOut
      />
    );
  if (provisioning !== 'ready' || !user)
    return (
      <Message
        title="Preparando sua biblioteca"
        detail="Estamos reunindo seus cards. Se demorar, tente de novo."
        busy
        action={{ label: 'Tentar de novo', onPress: retry }}
        signOut
      />
    );
  return <Message title="Abrindo seus estudos" busy />;
}

function StudyHome({
  name,
  environment,
}: {
  name: string;
  environment: string;
}) {
  const { pending } = useOfflineStatus();
  return (
    <StudyShell
      name={name}
      environment={environment}
      accountControl={<SignOutControl pendingChanges={pending} />}
    />
  );
}

function SignOutControl({ pendingChanges = 0 }: { pendingChanges?: number }) {
  const { signOut } = useClerk();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  async function leave() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    try {
      await signOut();
    } catch {
      inFlight.current = false;
      setFailed(true);
      setPending(false);
    }
  }
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          pending
            ? 'Saindo da conta'
            : confirmLeave
              ? 'Sair mesmo assim'
              : 'Sair da conta'
        }
        disabled={pending}
        accessibilityState={{ disabled: pending, busy: pending }}
        style={styles.logoutButton}
        onPress={() => {
          if (pendingChanges && !confirmLeave) setConfirmLeave(true);
          else void leave();
        }}
      >
        {pending ? (
          <ActivityIndicator color={palette.blue} />
        ) : confirmLeave ? (
          <Text style={styles.link}>Sair mesmo assim</Text>
        ) : (
          <View accessible={false} style={styles.logoutIcon}>
            <View style={styles.logoutDoor} />
            <View style={styles.logoutArrow} />
            <View style={styles.logoutArrowhead} />
          </View>
        )}
      </Pressable>
      {confirmLeave && pendingChanges > 0 && (
        <View style={styles.signOutWarning}>
          <Text style={styles.signOutCopy}>
            Há {pendingChanges} alterações salvas só neste aparelho. Elas
            continuarão aqui para você retomar nesta mesma conta e sincronizar
            quando quiser.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={pending}
            style={styles.secondary}
            onPress={() => setConfirmLeave(false)}
          >
            <Text style={styles.link}>Continuar aqui</Text>
          </Pressable>
        </View>
      )}
      {failed && (
        <Text accessibilityRole="alert" style={styles.error}>
          Não foi possível sair. Tente novamente.
        </Text>
      )}
    </View>
  );
}

function Message({
  title,
  detail,
  busy,
  action,
  signOut,
}: {
  title: string;
  detail?: string;
  busy?: boolean;
  action?: { label: string; onPress: () => void };
  signOut?: boolean;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.center}>
        <Text style={styles.eyebrow}>beta</Text>
        {busy && (
          <ActivityIndicator
            size="large"
            color={palette.blue}
            accessibilityLabel="Carregando"
          />
        )}
        <Text style={styles.title}>{title}</Text>
        {detail && <Text style={styles.detail}>{detail}</Text>}
        {action && (
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={action.onPress}
          >
            <Text style={styles.buttonText}>{action.label}</Text>
          </Pressable>
        )}
        {signOut && <SignOutControl />}
      </ScrollView>
    </SafeAreaView>
  );
}

class BackendBoundary extends Component<
  PropsWithChildren<{ retry: () => void }>,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Message
        title="Não foi possível carregar seus dados"
        detail="Confira a conexão e tente novamente."
        action={{ label: 'Tentar novamente', onPress: this.props.retry }}
        signOut
      />
    ) : (
      this.props.children
    );
  }
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  center: { flexGrow: 1, justifyContent: 'center', padding: 32, gap: 24 },
  eyebrow: {
    color: palette.blue,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.ink,
    lineHeight: 36,
  },
  detail: { fontSize: 16, lineHeight: 25, color: palette.muted },
  secondary: { minHeight: 48, padding: 12, justifyContent: 'center' },
  logoutButton: {
    minWidth: 48,
    minHeight: 48,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutIcon: { width: 24, height: 24 },
  logoutDoor: {
    position: 'absolute',
    left: 1,
    top: 2,
    width: 12,
    height: 20,
    borderColor: palette.blue,
    borderWidth: 2,
    borderRightWidth: 0,
    borderRadius: 2,
  },
  logoutArrow: {
    position: 'absolute',
    left: 9,
    top: 11,
    width: 14,
    borderTopWidth: 2,
    borderColor: palette.blue,
  },
  logoutArrowhead: {
    position: 'absolute',
    right: 1,
    top: 7,
    width: 10,
    height: 10,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: palette.blue,
    transform: [{ rotate: '45deg' }],
  },
  link: { color: palette.blue, fontWeight: '700', fontSize: 16 },
  error: { color: palette.error, maxWidth: 180 },
  signOutWarning: { maxWidth: 240, gap: 6, padding: 10 },
  signOutCopy: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  button: {
    backgroundColor: palette.blue,
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonText: { color: palette.surface, fontSize: 16, fontWeight: '700' },
});
