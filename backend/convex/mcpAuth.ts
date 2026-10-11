import { createClerkClient } from '@clerk/backend';

export const READ_SCOPE = 'alphabet:read';
export const WRITE_SCOPE = 'alphabet:write';
export const VOCABULARY_READ_SCOPE = 'vocabulary:read';
export const VOCABULARY_WRITE_SCOPE = 'vocabulary:write';
export const GRAMMAR_READ_SCOPE = 'grammar:read';
export const GRAMMAR_WRITE_SCOPE = 'grammar:write';
export const QUESTS_READ_SCOPE = 'quests:read';
export const QUESTS_WRITE_SCOPE = 'quests:write';
export const STUDY_READ_SCOPE = 'study:read';
export const SHIKEN_READ_SCOPE = 'shiken:read';
export const SHIKEN_WRITE_SCOPE = 'shiken:write';
export const STORIES_READ_SCOPE = 'stories:read';
export const STORIES_WRITE_SCOPE = 'stories:write';
export const OAUTH_SCOPES = [
  'openid',
  'offline_access',
  READ_SCOPE,
  WRITE_SCOPE,
  VOCABULARY_READ_SCOPE,
  VOCABULARY_WRITE_SCOPE,
  GRAMMAR_READ_SCOPE,
  GRAMMAR_WRITE_SCOPE,
  QUESTS_READ_SCOPE,
  QUESTS_WRITE_SCOPE,
  STUDY_READ_SCOPE,
  SHIKEN_READ_SCOPE,
  SHIKEN_WRITE_SCOPE,
  STORIES_READ_SCOPE,
  STORIES_WRITE_SCOPE,
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
  list_quests: QUESTS_READ_SCOPE,
  get_quest: QUESTS_READ_SCOPE,
  create_quest: QUESTS_WRITE_SCOPE,
  cancel_quest: QUESTS_WRITE_SCOPE,
  get_study_progress: STUDY_READ_SCOPE,
  get_study_cards: STUDY_READ_SCOPE,
  search_shiken_papers: SHIKEN_READ_SCOPE,
  get_shiken_paper: SHIKEN_READ_SCOPE,
  get_shiken_history: SHIKEN_READ_SCOPE,
  create_shiken_paper: SHIKEN_WRITE_SCOPE,
  get_shiken_paper_content: SHIKEN_WRITE_SCOPE,
  prepare_shiken_media_upload: SHIKEN_WRITE_SCOPE,
  get_shiken_media: SHIKEN_READ_SCOPE,
  list_stories: STORIES_READ_SCOPE,
  get_story: STORIES_READ_SCOPE,
  create_story: STORIES_WRITE_SCOPE,
  update_story: STORIES_WRITE_SCOPE,
  delete_story: STORIES_WRITE_SCOPE,
  set_story_archived: STORIES_WRITE_SCOPE,
};

export function scopesForOperation(scope: string) {
  return [
    'openid',
    ...(scope === WRITE_SCOPE ? [READ_SCOPE] : []),
    ...(scope === VOCABULARY_WRITE_SCOPE ? [VOCABULARY_READ_SCOPE] : []),
    ...(scope === GRAMMAR_WRITE_SCOPE ? [GRAMMAR_READ_SCOPE] : []),
    ...(scope === QUESTS_WRITE_SCOPE ? [QUESTS_READ_SCOPE] : []),
    ...(scope === STORIES_WRITE_SCOPE ? [STORIES_READ_SCOPE] : []),
    ...(scope === SHIKEN_WRITE_SCOPE ? [SHIKEN_READ_SCOPE] : []),
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

function matchingClerkInstance(
  publishableKey: string,
  secretKey: string,
  issuer: URL,
) {
  const publishable = /^pk_(test|live)_([A-Za-z0-9+/]+={0,2})$/.exec(
    publishableKey,
  );
  const secret = /^sk_(test|live)_\S+$/.exec(secretKey);
  if (!publishable || !secret || publishable[1] !== secret[1]) return false;
  // Clerk encodes the frontend API hostname followed by a single "$". Use
  // the runtime's atob so configuration stays compatible with Convex's edge VM.
  const decoded = atob(publishable[2]);
  const hostname = decoded.slice(0, -1);
  return (
    decoded.endsWith('$') &&
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(
      hostname,
    ) &&
    issuer.hostname === hostname.toLowerCase() &&
    issuer.port === '' &&
    issuer.pathname === '/'
  );
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
    if (!matchingClerkInstance(publishableKey, secretKey, issuer))
      throw new Error('Inconsistent Clerk instance configuration');
    if (env.CONVEX_SITE_URL !== undefined) {
      const site = httpsUrl(env.CONVEX_SITE_URL);
      if (site.pathname !== '/' || site.origin !== resource.origin)
        throw new Error('Inconsistent MCP deployment configuration');
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
    resource_name: 'beta — biblioteca, histórias, quests e progresso pessoal',
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
      `Reconecte sua conta beta e autorize o escopo ${scope} para usar esta ferramenta.`,
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
    throw new McpAccessError(401, 'Conecte sua conta beta com OAuth.');
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
        'A autorização OAuth expirou ou não é válida para o beta.',
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
      !principal.scopes.includes(GRAMMAR_READ_SCOPE) &&
      !principal.scopes.includes(QUESTS_READ_SCOPE) &&
      !principal.scopes.includes(STUDY_READ_SCOPE) &&
      !principal.scopes.includes(SHIKEN_READ_SCOPE) &&
      !principal.scopes.includes(STORIES_READ_SCOPE)
    ) {
      const requiredRead = principal.scopes.includes(SHIKEN_WRITE_SCOPE)
        ? SHIKEN_READ_SCOPE
        : principal.scopes.includes(STORIES_WRITE_SCOPE)
          ? STORIES_READ_SCOPE
          : principal.scopes.includes(QUESTS_WRITE_SCOPE)
            ? QUESTS_READ_SCOPE
            : principal.scopes.includes(GRAMMAR_WRITE_SCOPE)
              ? GRAMMAR_READ_SCOPE
              : principal.scopes.includes(VOCABULARY_WRITE_SCOPE)
                ? VOCABULARY_READ_SCOPE
                : READ_SCOPE;
      throw new McpAccessError(
        403,
        'Reconecte sua conta beta e autorize a leitura da área que deseja usar.',
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
