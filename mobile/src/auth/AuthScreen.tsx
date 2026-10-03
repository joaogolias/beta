import {
  useClerk,
  useSession,
  useSignIn,
  useSignUp,
  useSSO,
} from '@clerk/expo';
import { makeRedirectUri } from 'expo-auth-session';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette } from '../theme';
import { AuthWelcome } from './AuthWelcome';

import {
  authenticationErrorMessage,
  AuthenticationFlowError,
  checkResult,
  continueGoogleSignIn,
  continueSignIn,
  continueSignUp,
  sessionTaskMessage,
  type AuthStep,
  type GoogleFlowResult,
} from './authentication';

WebBrowser.maybeCompleteAuthSession();

const titles: Record<AuthStep, string> = {
  'sign-in': 'Bora continuar?',
  'sign-up': 'Comece por aqui.',
  'forgot-password': 'Esqueceu a senha?',
  'verify-reset': 'Olha seu e-mail.',
  'new-password': 'Crie uma nova senha.',
  blocked: 'Vamos acertar seu acesso.',
  'finalize-sign-in': 'Pronto. Pode entrar.',
  'finalize-sign-up': 'Sua conta está pronta.',
  'finalize-google': 'Pronto. Pode entrar.',
};

const primaryLabels: Partial<Record<AuthStep, string>> = {
  'sign-in': 'Entrar',
  'sign-up': 'Criar minha conta',
  'forgot-password': 'Receber código',
  'verify-reset': 'Verificar código',
  'new-password': 'Salvar senha',
  'finalize-sign-in': 'Continuar',
  'finalize-sign-up': 'Continuar',
  'finalize-google': 'Continuar',
};

export function AuthScreen() {
  const { signIn, fetchStatus: signInStatus } = useSignIn();
  const { signUp, fetchStatus: signUpStatus } = useSignUp();
  const { startSSOFlow } = useSSO();
  const { signOut } = useClerk();
  const { session } = useSession();
  const [step, setStep] = useState<AuthStep>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'form' | 'google' | null>(null);
  const [googleResult, setGoogleResult] = useState<GoogleFlowResult | null>(
    null,
  );
  // React state does not commit synchronously: a ref also rejects rapid double taps.
  const inFlight = useRef(false);
  const disabled =
    busy !== null || signInStatus === 'fetching' || signUpStatus === 'fetching';
  const currentTask = session?.currentTask;
  const visibleStep = currentTask ? 'blocked' : step;
  const view = { step: setStep, notice: setNotice };

  async function execute(
    action: () => Promise<void>,
    kind: 'form' | 'google' = 'form',
  ) {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      setError(authenticationErrorMessage(cause));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  function changeFlow(next: 'sign-in' | 'sign-up' | 'forgot-password') {
    void execute(async () => {
      if (currentTask) await signOut();
      await signIn.reset();
      await signUp.reset();
      setPassword('');
      setPasswordConfirmation('');
      setCode('');
      setGoogleResult(null);
      setStep(next);
    });
  }

  function validate(): boolean {
    if (
      ['sign-in', 'sign-up', 'forgot-password'].includes(step) &&
      !/^\S+@\S+\.\S+$/.test(email.trim())
    ) {
      setError('Informe um e-mail válido para continuar.');
      return false;
    }
    if (
      ['sign-in', 'sign-up', 'new-password'].includes(step) &&
      password.length === 0
    ) {
      setError('Informe sua senha para continuar.');
      return false;
    }
    if (
      ['sign-up', 'new-password'].includes(step) &&
      password !== passwordConfirmation
    ) {
      setError('As senhas não coincidem. Confira a confirmação da senha.');
      return false;
    }
    if (step === 'verify-reset' && !/^\d{6}$/.test(code.trim())) {
      setError('Informe o código de 6 dígitos.');
      return false;
    }
    return true;
  }

  function submit() {
    if (disabled || !validate()) return;
    void execute(async () => {
      switch (step) {
        case 'sign-in':
          checkResult(
            await signIn.password({ emailAddress: email.trim(), password }),
          );
          setPassword('');
          await continueSignIn(signIn, view);
          break;
        case 'sign-up':
          checkResult(
            await signUp.password({ emailAddress: email.trim(), password }),
          );
          setPassword('');
          setPasswordConfirmation('');
          await continueSignUp(signUp, view);
          break;
        case 'forgot-password':
          checkResult(await signIn.create({ identifier: email.trim() }));
          // Stay on code entry if delivery fails so resend retries the same attempt.
          setStep('verify-reset');
          checkResult(await signIn.resetPasswordEmailCode.sendCode());
          setNotice(
            'Se este e-mail puder recuperar a conta, você receberá um código. Confira também a caixa de spam.',
          );
          break;
        case 'verify-reset':
          checkResult(
            await signIn.resetPasswordEmailCode.verifyCode({
              code: code.trim(),
            }),
          );
          setCode('');
          if (signIn.status === 'needs_new_password') {
            setStep('new-password');
          } else {
            await continueSignIn(signIn, view);
          }
          break;
        case 'new-password':
          checkResult(
            await signIn.resetPasswordEmailCode.submitPassword({
              password,
              signOutOfOtherSessions: true,
            }),
          );
          setPassword('');
          setPasswordConfirmation('');
          await continueSignIn(signIn, view);
          break;
        case 'finalize-sign-in':
          await continueSignIn(signIn, view);
          break;
        case 'finalize-sign-up':
          await continueSignUp(signUp, view);
          break;
        case 'finalize-google':
          if (!googleResult)
            throw new AuthenticationFlowError('oauth_callback_failed');
          await continueGoogleSignIn(googleResult, view);
          break;
      }
    });
  }

  function resendCode() {
    void execute(async () => {
      checkResult(await signIn.resetPasswordEmailCode.sendCode());
      setCode('');
      setNotice(
        'Um novo código foi enviado. Confira seu e-mail e a caixa de spam.',
      );
    });
  }

  function continueWithGoogle() {
    void execute(async () => {
      const scheme = Constants.expoConfig?.scheme;
      if (typeof scheme !== 'string' || !scheme) {
        throw new AuthenticationFlowError('oauth_redirect_unavailable');
      }
      // Clear previous attempts so a cancelled flow cannot affect the next method.
      await signIn.reset();
      await signUp.reset();
      setPassword('');
      setPasswordConfirmation('');
      setGoogleResult(null);
      const result = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: makeRedirectUri({ scheme, path: 'sso-callback' }),
      });
      setGoogleResult(result);
      if ((await continueGoogleSignIn(result, view)) === 'cancelled') {
        await signIn.reset();
        await signUp.reset();
        setGoogleResult(null);
      }
    }, 'google');
  }

  const showEmail = ['sign-in', 'sign-up', 'forgot-password'].includes(
    visibleStep,
  );
  const showPassword = ['sign-in', 'sign-up', 'new-password'].includes(
    visibleStep,
  );
  const showConfirmation = ['sign-up', 'new-password'].includes(visibleStep);
  const showCode = visibleStep === 'verify-reset';
  const showGoogle = visibleStep === 'sign-in' || visibleStep === 'sign-up';

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.page}>
            <AuthWelcome showHero={showGoogle} />

            <View style={[styles.form, !showGoogle && styles.recoveryForm]}>
              {!showGoogle && <Text style={styles.eyebrow}>SUA CONTA</Text>}
              <View style={styles.formHeading}>
                <Text accessibilityRole="header" style={styles.title}>
                  {titles[visibleStep]}
                </Text>
                {visibleStep === 'sign-in' && (
                  <TextAction
                    label="Criar conta"
                    onPress={() => changeFlow('sign-up')}
                    disabled={disabled}
                  />
                )}
              </View>
              {visibleStep === 'forgot-password' && (
                <Text style={styles.description}>
                  Acontece. Digite seu e-mail para receber um código e criar
                  outra.
                </Text>
              )}
              {showCode && (
                <Text style={styles.description}>
                  Digite os 6 dígitos enviados para {email || 'seu e-mail'}.
                </Text>
              )}
              {visibleStep === 'new-password' && (
                <Text style={styles.description}>
                  Escolha uma senha segura. Você precisará entrar de novo nos
                  outros dispositivos.
                </Text>
              )}

              {showGoogle && (
                <>
                  <Action
                    label="Continuar com Google"
                    onPress={continueWithGoogle}
                    disabled={disabled}
                    loading={busy === 'google'}
                    provider
                  />
                  <View style={styles.separator}>
                    <View style={styles.divider} />
                    <Text style={styles.caption}>ou com e-mail</Text>
                    <View style={styles.divider} />
                  </View>
                </>
              )}
              {showEmail && (
                <Field
                  label="E-mail"
                  value={email}
                  onChangeText={setEmail}
                  editable={!disabled}
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  onSubmitEditing={
                    visibleStep === 'forgot-password' ? submit : undefined
                  }
                />
              )}
              {showPassword && (
                <Field
                  key={visibleStep}
                  label={
                    visibleStep === 'new-password' ? 'Nova senha' : 'Senha'
                  }
                  value={password}
                  onChangeText={setPassword}
                  editable={!disabled}
                  secureTextEntry
                  autoComplete={
                    showConfirmation ? 'new-password' : 'current-password'
                  }
                  onSubmitEditing={showConfirmation ? undefined : submit}
                  placeholder={
                    showConfirmation ? 'Crie sua senha' : 'Sua senha'
                  }
                  labelAction={
                    visibleStep === 'sign-in' ? (
                      <TextAction
                        label="Esqueci minha senha"
                        onPress={() => changeFlow('forgot-password')}
                        disabled={disabled}
                        small
                      />
                    ) : undefined
                  }
                />
              )}
              {showConfirmation && (
                <Field
                  label="Repita a senha"
                  value={passwordConfirmation}
                  onChangeText={setPasswordConfirmation}
                  editable={!disabled}
                  secureTextEntry
                  autoComplete="new-password"
                  onSubmitEditing={submit}
                  placeholder="Mais uma vez"
                />
              )}
              {showCode && (
                <Field
                  label="Código de recuperação"
                  value={code}
                  onChangeText={setCode}
                  editable={!disabled}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000 000"
                  onSubmitEditing={submit}
                  code
                />
              )}

              {(currentTask || notice) && (
                <Text style={styles.notice} accessibilityLiveRegion="polite">
                  {currentTask ? sessionTaskMessage(currentTask.key) : notice}
                </Text>
              )}
              {error && (
                <Text
                  style={styles.error}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                >
                  {error}
                </Text>
              )}

              {visibleStep !== 'blocked' && (
                <Action
                  label={primaryLabels[visibleStep] ?? 'Continuar'}
                  onPress={submit}
                  disabled={disabled}
                  loading={busy === 'form'}
                  arrow
                />
              )}
              {showCode && (
                <Action
                  label="Reenviar código"
                  onPress={resendCode}
                  disabled={disabled}
                  secondary
                />
              )}
              {visibleStep !== 'sign-in' && (
                <Action
                  label={
                    visibleStep === 'sign-up'
                      ? 'Já tenho uma conta'
                      : 'Voltar ao login'
                  }
                  onPress={() => changeFlow('sign-in')}
                  disabled={disabled}
                  secondary
                />
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  labelAction,
  secureTextEntry,
  code = false,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {
  label: string;
  labelAction?: ReactNode;
  code?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeading}>
        <Text style={styles.label}>{label}</Text>
        {labelAction}
      </View>
      <View style={[styles.inputShell, focused && styles.inputFocused]}>
        <TextInput
          {...props}
          accessibilityLabel={label}
          style={[styles.input, code && styles.codeInput]}
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          secureTextEntry={secureTextEntry && !revealed}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
        {secureTextEntry && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ocultar senha' : 'Mostrar senha'}
            accessibilityState={{ disabled: props.editable === false }}
            disabled={props.editable === false}
            onPress={() => setRevealed((value) => !value)}
            style={({ pressed }) => [
              styles.revealButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.revealLabel}>
              {revealed ? 'Ocultar' : 'Ver'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function TextAction({
  label,
  onPress,
  disabled,
  small = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={small ? 8 : undefined}
      style={({ pressed }) => [
        styles.textAction,
        small && styles.smallTextAction,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[styles.textActionLabel, small && styles.smallTextActionLabel]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Action({
  label,
  onPress,
  disabled,
  loading = false,
  secondary = false,
  provider = false,
  arrow = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  loading?: boolean;
  secondary?: boolean;
  provider?: boolean;
  arrow?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        provider && styles.providerButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={
            provider
              ? palette.ink
              : secondary
                ? palette.mountainDeep
                : palette.surface
          }
        />
      ) : provider ? (
        <Text style={styles.googleMark} accessible={false}>
          G
        </Text>
      ) : null}
      <Text
        style={[
          styles.buttonLabel,
          secondary && styles.secondaryLabel,
          provider && styles.providerLabel,
        ]}
      >
        {loading ? 'Só um instante…' : label}
      </Text>
      {arrow && !loading && (
        <Text style={styles.buttonArrow} accessible={false}>
          →
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.surface },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 32,
  },
  page: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 25 },
  form: { gap: 14, paddingHorizontal: 2 },
  recoveryForm: { paddingTop: 42, gap: 22 },
  formHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  eyebrow: {
    color: palette.blue,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    color: palette.ink,
    fontWeight: '800',
    letterSpacing: -0.9,
    flexShrink: 1,
  },
  description: { color: palette.muted, fontSize: 15, lineHeight: 23 },
  field: { gap: 6 },
  fieldHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  label: { fontSize: 13, fontWeight: '700', color: palette.ink },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    backgroundColor: palette.background,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 14,
  },
  inputFocused: {
    borderColor: palette.blue,
    backgroundColor: palette.blueSoft,
  },
  input: {
    minHeight: 50,
    minWidth: 0,
    flex: 1,
    fontSize: 15,
    color: palette.ink,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  codeInput: { fontSize: 23, letterSpacing: 7, textAlign: 'center' },
  revealButton: {
    minHeight: 44,
    minWidth: 48,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealLabel: { color: palette.mountainDeep, fontSize: 12, fontWeight: '700' },
  textAction: { minHeight: 44, justifyContent: 'center' },
  smallTextAction: { minHeight: 28 },
  textActionLabel: { color: palette.blueDeep, fontSize: 13, fontWeight: '700' },
  smallTextActionLabel: { fontSize: 11 },
  button: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: palette.ink,
    paddingHorizontal: 18,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    backgroundColor: palette.mountainSoft,
    borderWidth: 1,
    borderColor: palette.line,
    minHeight: 48,
  },
  providerButton: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  providerLabel: { color: palette.ink },
  googleMark: {
    fontSize: 21,
    lineHeight: 24,
    fontWeight: '800',
    color: palette.blue,
  },
  buttonLabel: {
    color: palette.surface,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  buttonArrow: { color: palette.surface, fontSize: 23, lineHeight: 25 },
  secondaryLabel: { color: palette.mountainDeep },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.7 },
  separator: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { height: 1, backgroundColor: palette.line, flex: 1 },
  caption: { color: palette.muted, fontSize: 12, textAlign: 'center' },
  notice: {
    color: palette.mountainDeep,
    fontSize: 14,
    lineHeight: 21,
    backgroundColor: palette.mountainSoft,
    padding: 14,
    borderRadius: 14,
  },
  error: {
    color: palette.error,
    fontSize: 14,
    lineHeight: 21,
    backgroundColor: palette.errorSoft,
    padding: 14,
    borderRadius: 14,
  },
});
