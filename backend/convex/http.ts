import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { handleMcpHttp, handleMcpMetadata } from './mcpHttp';
import { handleShikenMediaUpload } from './shikenMediaHttp';

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
      stories: {
        list: ({ limit, cursor, ...filters }) =>
          ctx.runQuery(internal.mcpGateway.listStories, {
            tokenIdentifier,
            ...filters,
            paginationOpts: { numItems: limit, cursor },
          }),
        get: (id) =>
          ctx.runQuery(internal.mcpGateway.getStory, { tokenIdentifier, id }),
        create: (args) =>
          ctx.runMutation(internal.mcpGateway.createStory, {
            tokenIdentifier,
            ...args,
          }),
        update: (args) =>
          ctx.runMutation(internal.mcpGateway.updateStory, {
            tokenIdentifier,
            ...args,
          }),
        delete: (id) =>
          ctx.runMutation(internal.mcpGateway.deleteStory, {
            tokenIdentifier,
            id,
          }),
        setArchived: (id, archived) =>
          ctx.runMutation(internal.mcpGateway.setStoryArchived, {
            tokenIdentifier,
            id,
            archived,
          }),
      },
      quests: {
        list: ({ limit, cursor, ...filters }) =>
          ctx.runQuery(internal.mcpGateway.listQuests, {
            tokenIdentifier,
            ...filters,
            paginationOpts: { numItems: limit, cursor },
          }),
        get: (id) =>
          ctx.runQuery(internal.mcpGateway.getQuest, { tokenIdentifier, id }),
        create: (quest) =>
          ctx.runMutation(internal.mcpGateway.createQuest, {
            tokenIdentifier,
            quest,
          }),
        cancel: (id) =>
          ctx.runMutation(internal.mcpGateway.cancelQuest, {
            tokenIdentifier,
            id,
          }),
      },
      study: {
        cards: ({ limit, cursor, ...filters }) =>
          ctx.runQuery(internal.mcpGateway.studyCards, {
            tokenIdentifier,
            ...filters,
            paginationOpts: { numItems: limit, cursor },
          }),
        progress: (filters) =>
          ctx.runQuery(internal.mcpGateway.studyProgress, {
            tokenIdentifier,
            ...filters,
          }),
      },
      shiken: {
        search: ({ limit, cursor, ...filters }) =>
          ctx.runQuery(internal.mcpGateway.searchShikenPapers, {
            tokenIdentifier,
            ...filters,
            paginationOpts: { numItems: limit, cursor },
          }),
        get: (id) =>
          ctx.runQuery(internal.mcpGateway.getShikenPaper, {
            tokenIdentifier,
            id,
          }),
        create: (args) =>
          ctx.runMutation(internal.mcpGateway.createShikenPaper, {
            tokenIdentifier,
            ...args,
          }),
        content: (args) =>
          ctx.runQuery(internal.mcpGateway.getShikenPaperContent, {
            tokenIdentifier,
            ...args,
          }),
        prepareMedia: (args) =>
          ctx.runAction(internal.shikenMedia.prepare, {
            tokenIdentifier,
            ...args,
          }),
        getMedia: (id) =>
          ctx.runQuery(internal.shikenMedia.get, { tokenIdentifier, id }),
        history: ({ limit, cursor, ...filters }) =>
          ctx.runQuery(internal.mcpGateway.shikenHistory, {
            tokenIdentifier,
            ...filters,
            paginationOpts: { numItems: limit, cursor },
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

for (const method of ['POST', 'OPTIONS'] as const) {
  http.route({
    pathPrefix: '/shiken-media-upload/',
    method,
    handler: httpAction(handleShikenMediaUpload),
  });
}

export default http;
