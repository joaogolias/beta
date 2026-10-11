import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  authenticateMcp,
  challenge,
  McpAccessError,
  readMcpConfiguration,
  resourceMetadata,
  requireScope,
  scopesForOperation,
  MCP_TOOL_SCOPES,
} from './mcpAuth';
import type { McpConfiguration, McpPrincipal } from './mcpAuth';
import { createBetaMcpServer } from './mcpServer';
import type { McpGateway } from './mcpServer';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers':
    'WWW-Authenticate, MCP-Session-Id, MCP-Protocol-Version',
};

function withHeaders(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders))
    headers.set(name, value);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}

async function readBody(
  request: Request,
): Promise<{ body: unknown } | { response: Response }> {
  const reader = request.body?.getReader();
  let length = 0;
  let text = '';
  const decoder = new TextDecoder();
  if (reader) {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 512 * 1024) {
        await reader.cancel();
        return {
          response: Response.json(
            { error: 'Solicitação muito grande.' },
            { status: 413 },
          ),
        };
      }
      text += decoder.decode(next.value, { stream: true });
    }
  }
  text += decoder.decode();
  try {
    return { body: JSON.parse(text) };
  } catch {
    return {
      response: Response.json(
        {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Invalid JSON' },
        },
        { status: 400 },
      ),
    };
  }
}

function callScope(body: unknown) {
  if (
    body === null ||
    typeof body !== 'object' ||
    !('method' in body) ||
    body.method !== 'tools/call' ||
    !('params' in body)
  )
    return undefined;
  const params = body.params;
  return params !== null &&
    typeof params === 'object' &&
    'name' in params &&
    typeof params.name === 'string'
    ? MCP_TOOL_SCOPES[params.name]
    : undefined;
}

export function handleMcpMetadata() {
  try {
    return withHeaders(Response.json(resourceMetadata(readMcpConfiguration())));
  } catch {
    return withHeaders(
      Response.json({ error: 'MCP indisponível.' }, { status: 503 }),
    );
  }
}

export async function handleMcpHttp(
  request: Request,
  gatewayFor: (principal: McpPrincipal) => McpGateway,
  configuration: McpConfiguration = readMcpConfiguration(),
) {
  const origin = request.headers.get('origin');
  if (origin && !configuration.allowedOrigins.includes(origin)) {
    return withHeaders(
      Response.json({ error: 'Origem não permitida.' }, { status: 403 }),
    );
  }
  if (request.method === 'OPTIONS')
    return withHeaders(new Response(null, { status: 204 }));

  try {
    const principal = await authenticateMcp(request, configuration);
    // JSON request/response keeps Convex invocations bounded, with no in-memory
    // session state shared across users or dependent on a long-running process.
    if (request.method !== 'POST') {
      return withHeaders(
        new Response(null, {
          status: 405,
          headers: { Allow: 'POST, OPTIONS' },
        }),
      );
    }
    const parsed = await readBody(request);
    if ('response' in parsed) return withHeaders(parsed.response);
    const scope = callScope(parsed.body);
    if (scope) {
      for (const required of scopesForOperation(scope))
        requireScope(principal, required);
    }
    const server = createBetaMcpServer(
      principal,
      gatewayFor(principal),
      configuration,
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return withHeaders(
        await transport.handleRequest(request, { parsedBody: parsed.body }),
      );
    } finally {
      await server.close();
    }
  } catch (error) {
    const failure =
      error instanceof McpAccessError
        ? error
        : new McpAccessError(503, 'MCP temporariamente indisponível.');
    return withHeaders(
      Response.json(
        { error: failure.message },
        {
          status: failure.status,
          headers:
            failure.status === 503
              ? {}
              : { 'WWW-Authenticate': challenge(configuration, failure) },
        },
      ),
    );
  }
}
