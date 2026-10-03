import { createClerkClient } from '@clerk/backend';

export const READ_SCOPE = 'alphabet:read';
export const WRITE_SCOPE = 'alphabet:write';
export const VOCABULARY_READ_SCOPE = 'vocabulary:read';
export const VOCABULARY_WRITE_SCOPE = 'vocabulary:write';
export const GRAMMAR_READ_SCOPE = 'grammar:read';
export const GRAMMAR_WRITE_SCOPE = 'grammar:write';
export const OAUTH_SCOPES = [
  'openid',
  'offline_access',
  READ_SCOPE,
  WRITE_SCOPE,
  VOCABULARY_READ_SCOPE,
  VOCABULARY_WRITE_SCOPE,
  GRAMMAR_READ_SCOPE,
  GRAMMAR_WRITE_SCOPE,
];

export const MCP_TOOL_SCOPES: Readonly<Record<string, string>> = {
  search_alphabet: READ_SCOPE,
  get_alphabet: READ_SCOPE,
  create_alphabet: WRITE_SCOPE,
  update_alphabet: WRITE_SCOPE,
  search_vocabulary: VOCABULARY_READ_SCOPE,
  get_vocabulary: VOCABULARY_READ_SCOPE,
  create_vocabulary: VOCABULARY_WRITE_SCOPE,
  update_vocabulary: VOCABULARY_WRITE_SCOPE,
  set_vocabulary_archived: VOCABULARY_WRITE_SCOPE,
  search_grammar: GRAMMAR_READ_SCOPE,
  get_grammar: GRAMMAR_READ_SCOPE,
  create_grammar: GRAMMAR_WRITE_SCOPE,
  update_grammar: GRAMMAR_WRITE_SCOPE,
  set_grammar_archived: GRAMMAR_WRITE_SCOPE,
};

export function scopesForOperation(scope: string) {
  return [
    'openid',
    ...(scope === WRITE_SCOPE ? [READ_SCOPE] : []),
    ...(scope === VOCABULARY_WRITE_SCOPE ? [VOCABULARY_READ_SCOPE] : []),
    ...(scope === GRAMMAR_WRITE_SCOPE ? [GRAMMAR_READ_SCOPE] : []),
    scope,
  ];
}

export interface McpConfiguration {
  resource: string;
  issuer: string;
  secretKey: string;
  publishableKey: string;
  allowedClientIds: string[];
  allowedOrigins: string[];
}

export interface McpPrincipal {
  tokenIdentifier: string;
  clientId: string;
  scopes: string[];
}

export class McpAccessError extends Error {
  constructor(
    readonly status: 401 | 403 | 503,
    message: string,
    readonly requiredScope?: string,
  ) {
    super(message);
  }
}

function httpsUrl(value: string | undefined): URL {
  const url = new URL(value ?? '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  ) {
    throw new Error('Invalid MCP URL configuration');
  }
  return url;
}

export function readMcpConfiguration(
  env: Record<string, string | undefined> = process.env,
): McpConfiguration {
  try {
    const resource = httpsUrl(env.MCP_RESOURCE_URL);
    const issuer = httpsUrl(env.CLERK_JWT_ISSUER_DOMAIN);
    const secretKey = env.CLERK_SECRET_KEY?.trim();
    const publishableKey = env.CLERK_PUBLISHABLE_KEY?.trim();
    const allowedClientIds = (env.MCP_ALLOWED_OAUTH_CLIENT_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      !secretKey ||
      !publishableKey ||
      allowedClientIds.length === 0 ||
      resource.pathname !== '/mcp'
    ) {
      throw new Error('Missing MCP configuration');
    }
    const allowedOrigins = (
      env.MCP_ALLOWED_ORIGINS ?? 'https://chatgpt.com,https://chat.openai.com'
    )
      .split(',')
      .map((value) => httpsUrl(value.trim()).origin);
    return {
      resource: resource.toString(),
      issuer: issuer.toString().replace(/\/$/, ''),
      secretKey,
      publishableKey,
      allowedClientIds,
      allowedOrigins: [...new Set([resource.origin, ...allowedOrigins])],
    };
  } catch {
    throw new McpAccessError(503, 'O servidor MCP ainda não está configurado.');
  }
}

export function resourceMetadata(configuration: McpConfiguration) {
  return {
    resource: configuration.resource,
    resource_name: 'Babel Crux — alfabeto, vocabulário e gramática pessoais',
    authorization_servers: [configuration.issuer],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ['header'],
  };
}

export function challenge(
  configuration: McpConfiguration,
  error: McpAccessError,
) {
  const metadataUrl = new URL(
    '/.well-known/oauth-protected-resource/mcp',
    configuration.resource,
  );
  const parts = [
    `resource_metadata="${metadataUrl}"`,
    `scope="${error.requiredScope ? [...new Set([...scopesForOperation(error.requiredScope), 'offline_access'])].join(' ') : OAUTH_SCOPES.join(' ')}"`,
  ];
  if (error.status === 401) parts.push('error="invalid_token"');
  if (error.status === 403) parts.push('error="insufficient_scope"');
  parts.push(
    `error_description="${error.status === 403 ? 'Additional permission is required' : 'OAuth access token is required'}"`,
  );
  return `Bearer ${parts.join(', ')}`;
}

export function requireScope(principal: McpPrincipal, scope: string) {
  if (!principal.scopes.includes(scope)) {
    throw new McpAccessError(
      403,
      `Reconecte sua conta Babel Crux e autorize o escopo ${scope} para usar esta ferramenta.`,
      scope,
    );
  }
}

/** Only Clerk's server-side verification can produce the identity used by the gateway. */
export async function authenticateMcp(
  request: Request,
  configuration: McpConfiguration,
): Promise<McpPrincipal> {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer ([^\s,]+)$/i);
  if (!match || match[1].length > 16_384) {
    throw new McpAccessError(401, 'Conecte sua conta Babel Crux com OAuth.');
  }
  try {
    // A JWT carries the resource audience. Session JWTs and opaque tokens are not
    // accepted here; configure the dedicated Clerk OAuth client to issue JWTs.
    const segments = match[1].split('.');
    if (segments.length !== 3)
      throw new McpAccessError(
        401,
        'Use um access token OAuth no formato JWT.',
      );
    const clerk = createClerkClient({
      secretKey: configuration.secretKey,
      publishableKey: configuration.publishableKey,
    });
    const state = await clerk.authenticateRequest(request, {
      acceptsToken: 'oauth_token',
    });
    const token = state.toAuth();
    if (!token.isAuthenticated)
      throw new McpAccessError(
        401,
        'A autorização OAuth expirou ou não é válida.',
      );
    // Decode only AFTER Clerk has cryptographically authenticated this exact token.
    const payload: unknown = JSON.parse(
      atob(segments[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    if (
      payload === null ||
      typeof payload !== 'object' ||
      !('iss' in payload) ||
      !('aud' in payload)
    ) {
      throw new McpAccessError(
        401,
        'O access token não identifica seu emissor e destinatário.',
      );
    }
    const audiences: unknown[] = Array.isArray(payload.aud)
      ? payload.aud
      : [payload.aud];
    if (
      payload.iss !== configuration.issuer ||
      !token.userId.startsWith('user_') ||
      !configuration.allowedClientIds.includes(token.clientId) ||
      !audiences.includes(configuration.resource)
    ) {
      throw new McpAccessError(
        401,
        'A autorização OAuth expirou ou não é válida para o Babel Crux.',
      );
    }
    const principal = {
      tokenIdentifier: `${configuration.issuer}|${token.userId}`,
      clientId: token.clientId,
      scopes: token.scopes,
    };
    requireScope(principal, 'openid');
    if (
      !principal.scopes.includes(READ_SCOPE) &&
      !principal.scopes.includes(VOCABULARY_READ_SCOPE) &&
      !principal.scopes.includes(GRAMMAR_READ_SCOPE)
    ) {
      const requiredRead = principal.scopes.includes(GRAMMAR_WRITE_SCOPE)
        ? GRAMMAR_READ_SCOPE
        : principal.scopes.includes(VOCABULARY_WRITE_SCOPE)
          ? VOCABULARY_READ_SCOPE
          : READ_SCOPE;
      throw new McpAccessError(
        403,
        'Reconecte sua conta Babel Crux e autorize a leitura do alfabeto, do vocabulário ou da gramática.',
        requiredRead,
      );
    }
    return principal;
  } catch (error) {
    if (error instanceof McpAccessError) throw error;
    const status =
      error !== null && typeof error === 'object' && 'status' in error
        ? error.status
        : undefined;
    if (status === 400 || status === 404 || status === 422) {
      throw new McpAccessError(
        401,
        'A autorização OAuth expirou ou foi revogada.',
      );
    }
    throw new McpAccessError(
      503,
      'Não foi possível verificar a autorização. Tente novamente.',
    );
  }
}
