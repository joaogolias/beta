export type AuthStep =
  | 'sign-in'
  | 'sign-up'
  | 'forgot-password'
  | 'verify-reset'
  | 'new-password'
  | 'blocked'
  | 'finalize-sign-in'
  | 'finalize-sign-up'
  | 'finalize-google';

type Result = { error: unknown };
type Navigation = (context: {
  session?: { currentTask?: { key: string } | null } | null;
}) => void;

/** Small SDK boundary: Clerk remains responsible for sessions, tokens and passwords. */
export interface SignInFlow {
  status: string | null;
  finalize: (options: { navigate: Navigation }) => Promise<Result>;
}

export interface SignUpFlow {
  status: string | null;
  missingFields: readonly string[];
  unverifiedFields: readonly string[];
  finalize: (options: { navigate: Navigation }) => Promise<Result>;
}

export interface GoogleFlowResult {
  createdSessionId: string | null;
  authSessionResult: { type: string; url?: string } | null;
  setActive?: (options: {
    session: string;
    navigate: Navigation;
  }) => Promise<void>;
  signIn?: {
    status: string | null;
    firstFactorVerification?: { error?: unknown };
  };
  signUp?: {
    status: string | null;
    missingFields: readonly string[];
    unverifiedFields: readonly string[];
  };
}

export class AuthenticationFlowError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AuthenticationFlowError';
  }
}

export interface FlowView {
  step: (step: AuthStep) => void;
  notice: (message: string) => void;
}

export function checkResult(result: Result): void {
  if (result.error) throw result.error;
}

export function sessionTaskMessage(key: string): string {
  if (key === 'reset-password') {
    return 'Sua conta precisa de uma nova senha. Volte para entrar e use “Esqueci minha senha”.';
  }
  if (key === 'choose-organization') {
    return 'Sua conta exige a seleção de uma organização. O beta usa contas pessoais; a configuração de acesso precisa ser ajustada antes de continuar.';
  }
  if (key === 'setup-mfa') {
    return 'Não foi possível concluir o acesso com os métodos disponíveis. Volte para entrar e tente novamente após ajustar os métodos de acesso da conta.';
  }
  return 'Não foi possível concluir o acesso. Volte para entrar e tente novamente com o método que você já utiliza nessa conta.';
}

function navigate(view: FlowView): Navigation {
  return ({ session }) => {
    if (session?.currentTask) {
      view.step('blocked');
      view.notice(sessionTaskMessage(session.currentTask.key));
    }
    // The app's auth gate reacts to the active Clerk session. No manual redirect.
  };
}

export async function continueSignIn(
  signIn: SignInFlow,
  view: FlowView,
): Promise<void> {
  if (signIn.status === 'complete') {
    // Keep a retry action available if session activation fails after authentication.
    view.step('finalize-sign-in');
    checkResult(await signIn.finalize({ navigate: navigate(view) }));
    return;
  }

  if (signIn.status === 'needs_new_password') {
    view.step('new-password');
    return;
  }

  view.step('blocked');
  view.notice(
    'Não foi possível concluir o acesso com e-mail e senha. Volte para entrar e tente novamente com o método que você já utiliza nessa conta.',
  );
}

export async function continueSignUp(
  signUp: SignUpFlow,
  view: FlowView,
): Promise<void> {
  if (signUp.status === 'complete') {
    view.step('finalize-sign-up');
    checkResult(await signUp.finalize({ navigate: navigate(view) }));
    return;
  }
  if (signUp.missingFields.length > 0) {
    view.step('blocked');
    view.notice(
      'O cadastro está exigindo informações além de e-mail e senha. A configuração de cadastro precisa ser ajustada antes de continuar.',
    );
    return;
  }
  view.step('blocked');
  view.notice(
    'Não foi possível concluir o cadastro com e-mail e senha. Volte para entrar e tente novamente ou continue com Google.',
  );
}

/** useSSO handles provider verification and sign-in → sign-up transfer in Clerk. */
export async function continueGoogleSignIn(
  result: GoogleFlowResult,
  view: FlowView,
): Promise<'activated' | 'cancelled' | 'blocked'> {
  const browserResult = result.authSessionResult;
  if (browserResult?.type === 'cancel' || browserResult?.type === 'dismiss') {
    return 'cancelled';
  }
  if (browserResult?.type !== 'success' || !browserResult.url) {
    throw new AuthenticationFlowError('oauth_callback_failed');
  }

  // A browser redirect alone is not proof of authentication.
  if (result.createdSessionId) {
    if (!result.setActive)
      throw new AuthenticationFlowError('oauth_callback_failed');
    view.step('finalize-google');
    await result.setActive({
      session: result.createdSessionId,
      navigate: navigate(view),
    });
    return 'activated';
  }
  if (result.signIn?.firstFactorVerification?.error) {
    throw result.signIn.firstFactorVerification.error;
  }

  if (
    result.signUp?.status === 'missing_requirements' &&
    result.signUp.missingFields.length > 0
  ) {
    view.step('blocked');
    view.notice(
      'Não foi possível concluir o cadastro com os dados recebidos do Google. Volte para entrar e use e-mail e senha ou tente outra conta Google.',
    );
    return 'blocked';
  }

  if (
    result.signUp?.unverifiedFields.length ||
    (result.signIn?.status && result.signIn.status !== 'complete')
  ) {
    // In particular, Clerk can require password recovery before linking a
    // previously unverified email/password account. Never merge accounts here.
    view.step('blocked');
    view.notice(
      'Não foi possível vincular o Google a esta conta. Volte para entrar com o método que você já utiliza. Se necessário, use “Esqueci minha senha” antes de tentar novamente.',
    );
    return 'blocked';
  }

  throw new AuthenticationFlowError('oauth_callback_failed');
}

const errorMessages: Record<string, string> = {
  form_identifier_not_found:
    'Não foi possível acessar com esses dados. Confira o e-mail e a senha.',
  form_password_incorrect:
    'Não foi possível acessar com esses dados. Confira o e-mail e a senha.',
  form_identifier_exists:
    'Este e-mail já tem uma conta. Entre ou recupere sua senha.',
  form_param_format_invalid:
    'Confira o formato dos dados informados e tente novamente.',
  form_param_nil: 'Preencha os campos solicitados para continuar.',
  form_password_length_too_short:
    'A senha é muito curta. Use uma senha mais longa, como uma frase com várias palavras.',
  form_password_pwned:
    'Esta senha apareceu em um vazamento. Escolha outra senha.',
  form_password_validation_failed:
    'Escolha uma senha mais forte, com letras, números e símbolos.',
  form_code_incorrect:
    'O código não confere. Digite o código recebido ou solicite outro.',
  verification_expired: 'O código expirou. Solicite um novo código.',
  verification_failed:
    'Não foi possível verificar o código. Solicite um novo código.',
  too_many_requests:
    'Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.',
  too_many_requests_in_a_given_amount_of_time:
    'Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.',
  session_exists:
    'Já existe uma sessão neste dispositivo. Volte para entrar e tente novamente.',
  network_error:
    'Não foi possível conectar. Confira sua internet e tente novamente.',
  oauth_callback_failed:
    'Não foi possível concluir o acesso com Google. Tente novamente e aguarde o retorno ao aplicativo.',
  oauth_redirect_unavailable:
    'Não foi possível abrir o acesso com Google nesta instalação. Use a versão Android do beta ou entre com e-mail e senha.',
  oauth_access_denied:
    'O acesso pelo Google não foi autorizado. Tente novamente ou entre com e-mail e senha.',
  external_account_not_found:
    'Não foi possível acessar com essa conta Google. Tente outra conta ou entre com e-mail e senha.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Never display SDK debug payloads, identifiers or untranslated server messages. */
export function authenticationErrorMessage(error: unknown): string {
  if (isRecord(error)) {
    if (Array.isArray(error.errors) && error.errors.length > 0) {
      return authenticationErrorMessage(error.errors[0]);
    }
    if (typeof error.code === 'string' && errorMessages[error.code]) {
      return errorMessages[error.code];
    }
    if (error.status === 429) return errorMessages.too_many_requests;
  }
  return 'Não foi possível concluir esta etapa. Confira sua conexão e tente novamente.';
}
