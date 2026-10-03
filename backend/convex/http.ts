import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { handleMcpHttp, handleMcpMetadata } from './mcpHttp';

const http = httpRouter();
const mcp = httpAction(async (ctx, request) => {
  try {
    return await handleMcpHttp(request, ({ tokenIdentifier }) => ({
      alphabet: {
        search: ({ limit, cursor, ...filters }) =>
          ctx.runQuery(internal.mcpGateway.search, {
            tokenIdentifier,
            ...filters,
            paginationOpts: { numItems: limit, cursor },
          }),
        get: (id) =>
          ctx.runQuery(internal.mcpGateway.get, { tokenIdentifier, id }),
        create: (card) =>
          ctx.runMutation(internal.mcpGateway.create, {
            tokenIdentifier,
            card,
          }),
        update: (id, patch) =>
          ctx.runMutation(internal.mcpGateway.update, {
            tokenIdentifier,
            id,
            patch,
          }),
      },
      vocabulary: {
        search: ({ limit, cursor, ...filters }) =>
          ctx.runQuery(internal.mcpGateway.searchVocabulary, {
            tokenIdentifier,
            ...filters,
            paginationOpts: { numItems: limit, cursor },
          }),
        get: (id) =>
          ctx.runQuery(internal.mcpGateway.getVocabulary, {
            tokenIdentifier,
            id,
          }),
        create: (card) =>
          ctx.runMutation(internal.mcpGateway.createVocabulary, {
            tokenIdentifier,
            card,
          }),
        update: (id, patch) =>
          ctx.runMutation(internal.mcpGateway.updateVocabulary, {
            tokenIdentifier,
            id,
            patch,
          }),
        setArchived: (id, archived) =>
          ctx.runMutation(internal.mcpGateway.setVocabularyArchived, {
            tokenIdentifier,
            id,
            archived,
          }),
      },
      grammar: {
        search: ({ limit, cursor, ...filters }) =>
          ctx.runQuery(internal.mcpGateway.searchGrammar, {
            tokenIdentifier,
            ...filters,
            paginationOpts: { numItems: limit, cursor },
          }),
        get: (id) =>
          ctx.runQuery(internal.mcpGateway.getGrammar, { tokenIdentifier, id }),
        create: (card) =>
          ctx.runMutation(internal.mcpGateway.createGrammar, {
            tokenIdentifier,
            card,
          }),
        update: (id, patch) =>
          ctx.runMutation(internal.mcpGateway.updateGrammar, {
            tokenIdentifier,
            id,
            patch,
          }),
        setArchived: (id, archived) =>
          ctx.runMutation(internal.mcpGateway.setGrammarArchived, {
            tokenIdentifier,
            id,
            archived,
          }),
      },
    }));
  } catch {
    return Response.json(
      { error: 'MCP ainda não configurado.' },
      { status: 503 },
    );
  }
});

for (const method of ['GET', 'POST', 'DELETE', 'OPTIONS'] as const) {
  http.route({ path: '/mcp', method, handler: mcp });
}
for (const path of [
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
]) {
  http.route({
    path,
    method: 'GET',
    handler: httpAction(async () => handleMcpMetadata()),
  });
}

export default http;
