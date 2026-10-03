import { describe, expect, it, vi } from 'vitest';
import {
  authenticationErrorMessage,
  checkResult,
  continueGoogleSignIn,
  continueSignIn,
  continueSignUp,
  type FlowView,
  type GoogleFlowResult,
  type SignInFlow,
  type SignUpFlow,
} from './authentication';

function view(): FlowView {
  return { step: vi.fn(), notice: vi.fn() };
}
function signIn(overrides: Partial<SignInFlow> = {}): SignInFlow {
  return {
    status: 'complete',
    finalize: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}
function signUp(overrides: Partial<SignUpFlow> = {}): SignUpFlow {
  return {
    status: 'complete',
    missingFields: [],
    unverifiedFields: ['email_address'],
    finalize: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}
function google(overrides: Partial<GoogleFlowResult> = {}): GoogleFlowResult {
  return {
    createdSessionId: 'new-session',
    authSessionResult: {
      type: 'success',
      url: 'babelcrux-dev://sso-callback?rotating_token_nonce=example',
    },
    setActive: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('authentication', () => {
  it('surfaces Clerk validation errors without accepting the attempt', () => {
    const error = { errors: [{ code: 'form_password_incorrect' }] };
    expect(() => checkResult({ error })).toThrow();
    expect(authenticationErrorMessage(error)).toMatch(
      'Confira o e-mail e a senha',
    );
    expect(() => checkResult({ error: null })).not.toThrow();
  });

  it('activates completed email sign-in and signup without a verification challenge', async () => {
    const login = signIn();
    const registration = signUp();
    await continueSignIn(login, view());
    await continueSignUp(registration, view());
    expect(login.finalize).toHaveBeenCalledOnce();
    // Clerk can complete signup while the email itself remains unverified.
    expect(registration.unverifiedFields).toEqual(['email_address']);
    expect(registration.finalize).toHaveBeenCalledOnce();
  });

  it('blocks unexpected signup requirements without sending or accepting verification codes', async () => {
    const screen = view();
    for (const attempt of [
      signUp({ status: 'missing_requirements' }),
      signUp({
        status: 'missing_requirements',
        missingFields: ['phone_number'],
      }),
    ]) {
      await continueSignUp(attempt, screen);
      expect(screen.step).toHaveBeenLastCalledWith('blocked');
      expect(attempt.finalize).not.toHaveBeenCalled();
    }
  });

  it.each(['needs_client_trust', 'needs_second_factor', 'needs_first_factor'])(
    'blocks email status %s without a removed verification flow',
    async (status) => {
      const attempt = signIn({ status });
      const screen = view();
      await continueSignIn(attempt, screen);
      expect(screen.step).toHaveBeenLastCalledWith('blocked');
      expect(attempt.finalize).not.toHaveBeenCalled();
      expect(screen.notice).toHaveBeenCalledWith(
        expect.stringContaining('método que você já utiliza'),
      );
    },
  );

  it('retains password recovery when a new password is required', async () => {
    const attempt = signIn({ status: 'needs_new_password' });
    const screen = view();
    await continueSignIn(attempt, screen);
    expect(screen.step).toHaveBeenCalledWith('new-password');
    expect(attempt.finalize).not.toHaveBeenCalled();
  });

  it('can retry email session activation after a network failure', async () => {
    const error = new Error('network');
    const attempt = signIn({ finalize: vi.fn().mockResolvedValue({ error }) });
    const screen = view();
    await expect(continueSignIn(attempt, screen)).rejects.toBe(error);
    expect(screen.step).toHaveBeenLastCalledWith('finalize-sign-in');
    attempt.finalize = vi.fn().mockResolvedValue({ error: null });
    await continueSignIn(attempt, screen);
    expect(attempt.finalize).toHaveBeenCalledOnce();
  });

  it.each(['sign-in', 'sign-up'])(
    'activates only the Clerk-created session after Google %s',
    async (flow) => {
      const result = google(
        flow === 'sign-up'
          ? {
              signUp: {
                status: 'complete',
                missingFields: [],
                unverifiedFields: [],
              },
            }
          : { signIn: { status: 'complete' } },
      );
      await expect(continueGoogleSignIn(result, view())).resolves.toBe(
        'activated',
      );
      expect(result.setActive).toHaveBeenCalledWith({
        session: 'new-session',
        navigate: expect.any(Function),
      });
    },
  );

  it.each(['cancel', 'dismiss'])(
    'treats Google %s as cancellation, even with stale session data',
    async (type) => {
      const result = google({ authSessionResult: { type } });
      const screen = view();
      await expect(continueGoogleSignIn(result, screen)).resolves.toBe(
        'cancelled',
      );
      expect(result.setActive).not.toHaveBeenCalled();
      expect(screen.notice).not.toHaveBeenCalled();
      expect(screen.step).not.toHaveBeenCalled();
    },
  );

  it('rejects missing or failed callbacks and missing activation helpers', async () => {
    for (const result of [
      google({ authSessionResult: null }),
      google({ authSessionResult: { type: 'locked' } }),
      google({ authSessionResult: { type: 'success' } }),
      google({ setActive: undefined }),
      google({ createdSessionId: null }),
    ]) {
      await expect(continueGoogleSignIn(result, view())).rejects.toMatchObject({
        code: 'oauth_callback_failed',
      });
      if (result.setActive) expect(result.setActive).not.toHaveBeenCalled();
    }
  });

  it('keeps Google session activation retryable after a network failure', async () => {
    const error = new Error('offline');
    const result = google({
      setActive: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue(undefined),
    });
    const screen = view();
    await expect(continueGoogleSignIn(result, screen)).rejects.toBe(error);
    expect(screen.step).toHaveBeenLastCalledWith('finalize-google');
    await expect(continueGoogleSignIn(result, screen)).resolves.toBe(
      'activated',
    );
    expect(result.setActive).toHaveBeenCalledTimes(2);
  });

  it('does not fabricate missing Google registration fields', async () => {
    const result = google({
      createdSessionId: null,
      signUp: {
        status: 'missing_requirements',
        missingFields: ['first_name'],
        unverifiedFields: [],
      },
    });
    const screen = view();
    await expect(continueGoogleSignIn(result, screen)).resolves.toBe('blocked');
    expect(result.setActive).not.toHaveBeenCalled();
    expect(screen.notice).toHaveBeenCalledWith(
      expect.stringContaining('dados recebidos do Google'),
    );
  });

  it('leaves account linking to Clerk and points incomplete linking to the original method or recovery', async () => {
    const result = google({
      createdSessionId: null,
      signIn: { status: 'needs_new_password' },
    });
    const screen = view();
    await expect(continueGoogleSignIn(result, screen)).resolves.toBe('blocked');
    expect(result.setActive).not.toHaveBeenCalled();
    expect(screen.notice).toHaveBeenCalledWith(
      expect.stringContaining('Esqueci minha senha'),
    );
  });

  it('does not treat provider errors followed by a browser return as authentication', async () => {
    const error = { code: 'oauth_access_denied' };
    const result = google({
      createdSessionId: null,
      signIn: {
        status: 'needs_first_factor',
        firstFactorVerification: { error },
      },
    });
    await expect(continueGoogleSignIn(result, view())).rejects.toBe(error);
    expect(result.setActive).not.toHaveBeenCalled();
    expect(authenticationErrorMessage(error)).toContain('não foi autorizado');
  });

  it('handles pending session tasks for both email and Google without bypassing them', async () => {
    const screen = view();
    const attempt = signIn({
      finalize: async ({ navigate }) => {
        navigate({ session: { currentTask: { key: 'reset-password' } } });
        return { error: null };
      },
    });
    await continueSignIn(attempt, screen);
    expect(screen.step).toHaveBeenLastCalledWith('blocked');
    const result = google({
      setActive: async ({ navigate }) => {
        navigate({ session: { currentTask: { key: 'setup-mfa' } } });
      },
    });
    await continueGoogleSignIn(result, screen);
    expect(screen.step).toHaveBeenLastCalledWith('blocked');
    expect(screen.notice).toHaveBeenLastCalledWith(
      expect.stringContaining('métodos disponíveis'),
    );
  });

  it('never renders raw server debug payloads', () => {
    expect(
      authenticationErrorMessage({
        message: 'secret token XYZ',
        code: 'unexpected',
      }),
    ).not.toContain('XYZ');
    expect(authenticationErrorMessage({ status: 429 })).toContain('Aguarde');
    expect(
      authenticationErrorMessage({ errors: [{ code: 'form_code_incorrect' }] }),
    ).toContain('O código não confere');
  });
});
