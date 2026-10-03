export type AppEnvironment = 'development' | 'production';

export type RuntimeConfig = {
  environment: AppEnvironment;
  clerkPublishableKey: string;
  convexUrl: string;
};

export function parseRuntimeConfig(input: {
  environment: unknown;
  clerkPublishableKey: string | undefined;
  convexUrl: string | undefined;
}): RuntimeConfig {
  const { environment, clerkPublishableKey, convexUrl } = input;
  if (environment !== 'development' && environment !== 'production') {
    throw new Error('O ambiente do aplicativo não foi configurado.');
  }
  const prefix = environment === 'production' ? 'pk_live_' : 'pk_test_';
  if (
    !clerkPublishableKey?.startsWith(prefix) ||
    clerkPublishableKey.includes('replace_')
  ) {
    throw new Error(`Configure a chave pública do Clerk para ${environment}.`);
  }
  if (!convexUrl) throw new Error('Configure o endereço do backend Convex.');
  let url: URL;
  try {
    url = new URL(convexUrl);
  } catch {
    throw new Error('O endereço do backend Convex não é válido.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'Use a URL HTTPS do deployment Convex, sem caminho ou credenciais.',
    );
  }
  if (
    !url.hostname.endsWith('.convex.cloud') ||
    url.hostname.includes('your-')
  ) {
    throw new Error('Use a Cloud URL do seu deployment Convex.');
  }
  return { environment, clerkPublishableKey, convexUrl: url.origin };
}
