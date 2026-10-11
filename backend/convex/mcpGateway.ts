import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  createForOwner,
  fail,
  getForOwner,
  searchForOwner,
  updateForOwner,
} from './alphabetDomain';
import {
  alphabetCreateValidator,
  alphabetFilterFields,
  alphabetPatchValidator,
} from './alphabetValidators';
import {
  createForOwner as createVocabularyForOwner,
  getForOwner as getVocabularyForOwner,
  searchForOwner as searchVocabularyForOwner,
  updateForOwner as updateVocabularyForOwner,
  setArchivedForOwner as setVocabularyArchivedForOwner,
} from './vocabularyDomain';
import {
  vocabularyCreateValidator,
  vocabularyFilterFields,
  vocabularyPatchValidator,
} from './vocabularyValidators';
import {
  createForOwner as createGrammarForOwner,
  getForOwner as getGrammarForOwner,
  searchForOwner as searchGrammarForOwner,
  updateForOwner as updateGrammarForOwner,
  setArchivedForOwner as setGrammarArchivedForOwner,
} from './grammarDomain';
import {
  grammarCreateValidator,
  grammarFilterFields,
  grammarPatchValidator,
} from './grammarValidators';
import * as quests from './questsDomain';
import * as stories from './storiesDomain';
import {
  storyCreateFields,
  storyUpdateFields,
  storyLevelValidator,
  storyStatusValidator,
} from './storiesValidators';
import { questCreateValidator, questStatusValidator } from './questsValidators';
import * as shiken from './jlptDomain';
import { jlptLevelValidator, jlptPaperValidator } from './jlptValidators';
import {
  createShikenForOwner,
  getShikenContentForOwner,
} from './jlptAuthorship';
import { validatePaperMediaForOwner } from './shikenMedia';
import {
  presentShikenAttempt,
  presentShikenPaper,
  studyProgressForOwner,
  studyCardsForOwner,
} from './mcpPlanning';

// This module exposes INTERNAL functions only. A caller cannot choose an owner;
// mcpHttp supplies the canonical identity from the verified Clerk access token.
async function ownerForIdentity(
  ctx: QueryCtx | MutationCtx,
  tokenIdentifier: string,
) {
  return await ctx.db
    .query('users')
    .withIndex('by_tokenIdentifier', (q) =>
      q.eq('tokenIdentifier', tokenIdentifier),
    )
    .unique();
}

function cardId(ctx: QueryCtx | MutationCtx, id: string) {
  const normalized = ctx.db.normalizeId('alphabetCards', id);
  if (!normalized) fail('VALIDATION', 'Identificador de card inválido.');
  return normalized;
}

export const search = internalQuery({
  args: {
    tokenIdentifier: v.string(),
    ...alphabetFilterFields,
    archived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { tokenIdentifier, ...args }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) return { page: [], isDone: true, continueCursor: '' };
    return await searchForOwner(ctx, owner._id, args);
  },
});

export const get = internalQuery({
  args: { tokenIdentifier: v.string(), id: v.string() },
  handler: async (ctx, { tokenIdentifier, id }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) return null;
    return await getForOwner(ctx, owner._id, cardId(ctx, id));
  },
});

export const create = internalMutation({
  args: { tokenIdentifier: v.string(), card: alphabetCreateValidator },
  handler: async (ctx, { tokenIdentifier, card }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    const ownerId =
      owner?._id ?? (await ctx.db.insert('users', { tokenIdentifier }));
    return await createForOwner(ctx, ownerId, card);
  },
});

export const update = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    id: v.string(),
    patch: alphabetPatchValidator,
  },
  handler: async (ctx, { tokenIdentifier, id, patch }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) fail('UNAVAILABLE', 'Card indisponível.');
    return await updateForOwner(ctx, owner._id, cardId(ctx, id), patch);
  },
});

function vocabularyId(ctx: QueryCtx | MutationCtx, id: string) {
  const normalized = ctx.db.normalizeId('vocabularyCards', id);
  if (!normalized) fail('VALIDATION', 'Identificador de vocabulário inválido.');
  return normalized;
}

export const searchVocabulary = internalQuery({
  args: {
    tokenIdentifier: v.string(),
    ...vocabularyFilterFields,
    archived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { tokenIdentifier, ...args }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) return { page: [], isDone: true, continueCursor: '' };
    return await searchVocabularyForOwner(ctx, owner._id, args);
  },
});

export const getVocabulary = internalQuery({
  args: { tokenIdentifier: v.string(), id: v.string() },
  handler: async (ctx, { tokenIdentifier, id }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) return null;
    return await getVocabularyForOwner(ctx, owner._id, vocabularyId(ctx, id));
  },
});

export const createVocabulary = internalMutation({
  args: { tokenIdentifier: v.string(), card: vocabularyCreateValidator },
  handler: async (ctx, { tokenIdentifier, card }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    const ownerId =
      owner?._id ?? (await ctx.db.insert('users', { tokenIdentifier }));
    return await createVocabularyForOwner(ctx, ownerId, card);
  },
});

export const updateVocabulary = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    id: v.string(),
    patch: vocabularyPatchValidator,
  },
  handler: async (ctx, { tokenIdentifier, id, patch }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) fail('UNAVAILABLE', 'Card indisponível.');
    return await updateVocabularyForOwner(
      ctx,
      owner._id,
      vocabularyId(ctx, id),
      patch,
    );
  },
});

export const setVocabularyArchived = internalMutation({
  args: { tokenIdentifier: v.string(), id: v.string(), archived: v.boolean() },
  handler: async (ctx, { tokenIdentifier, id, archived }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) fail('UNAVAILABLE', 'Card indisponível.');
    return await setVocabularyArchivedForOwner(
      ctx,
      owner._id,
      vocabularyId(ctx, id),
      archived,
    );
  },
});

function grammarId(ctx: QueryCtx | MutationCtx, id: string) {
  const normalized = ctx.db.normalizeId('grammarCards', id);
  if (!normalized) fail('VALIDATION', 'Identificador de gramática inválido.');
  return normalized;
}

export const searchGrammar = internalQuery({
  args: {
    tokenIdentifier: v.string(),
    ...grammarFilterFields,
    archived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { tokenIdentifier, ...args }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) return { page: [], isDone: true, continueCursor: '' };
    return await searchGrammarForOwner(ctx, owner._id, args);
  },
});

export const getGrammar = internalQuery({
  args: { tokenIdentifier: v.string(), id: v.string() },
  handler: async (ctx, { tokenIdentifier, id }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) return null;
    return await getGrammarForOwner(ctx, owner._id, grammarId(ctx, id));
  },
});

export const createGrammar = internalMutation({
  args: { tokenIdentifier: v.string(), card: grammarCreateValidator },
  handler: async (ctx, { tokenIdentifier, card }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    const ownerId =
      owner?._id ?? (await ctx.db.insert('users', { tokenIdentifier }));
    return await createGrammarForOwner(ctx, ownerId, card);
  },
});

export const updateGrammar = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    id: v.string(),
    patch: grammarPatchValidator,
  },
  handler: async (ctx, { tokenIdentifier, id, patch }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) fail('UNAVAILABLE', 'Card indisponível.');
    return await updateGrammarForOwner(
      ctx,
      owner._id,
      grammarId(ctx, id),
      patch,
    );
  },
});

export const setGrammarArchived = internalMutation({
  args: { tokenIdentifier: v.string(), id: v.string(), archived: v.boolean() },
  handler: async (ctx, { tokenIdentifier, id, archived }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) fail('UNAVAILABLE', 'Card indisponível.');
    return await setGrammarArchivedForOwner(
      ctx,
      owner._id,
      grammarId(ctx, id),
      archived,
    );
  },
});

function questId(ctx: QueryCtx | MutationCtx, id: string) {
  const normalized = ctx.db.normalizeId('quests', id);
  if (!normalized) fail('VALIDATION', 'Identificador de quest inválido.');
  return normalized;
}

function paperId(ctx: QueryCtx, id: string) {
  const normalized = ctx.db.normalizeId('jlptPapers', id);
  if (!normalized) fail('VALIDATION', 'Identificador de simulado inválido.');
  return normalized;
}

export const listQuests = internalQuery({
  args: {
    tokenIdentifier: v.string(),
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(v.literal('all'), questStatusValidator)),
  },
  handler: async (ctx, { tokenIdentifier, ...args }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) return { page: [], isDone: true, continueCursor: '' };
    return quests.listForOwner(ctx, owner._id, args);
  },
});

export const getQuest = internalQuery({
  args: { tokenIdentifier: v.string(), id: v.string() },
  handler: async (ctx, { tokenIdentifier, id }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    return owner ? quests.getForOwner(ctx, owner._id, questId(ctx, id)) : null;
  },
});

export const createQuest = internalMutation({
  args: { tokenIdentifier: v.string(), quest: questCreateValidator },
  handler: async (ctx, { tokenIdentifier, quest }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    const ownerId =
      owner?._id ?? (await ctx.db.insert('users', { tokenIdentifier }));
    return quests.createForOwner(ctx, ownerId, quest);
  },
});

export const cancelQuest = internalMutation({
  args: { tokenIdentifier: v.string(), id: v.string() },
  handler: async (ctx, { tokenIdentifier, id }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) fail('UNAVAILABLE', 'Quest indisponível.');
    return quests.cancelForOwner(ctx, owner._id, questId(ctx, id));
  },
});

export const studyProgress = internalQuery({
  args: {
    tokenIdentifier: v.string(),
    category: v.union(
      v.literal('all'),
      v.literal('alphabet'),
      v.literal('vocabulary'),
      v.literal('grammar'),
    ),
    level: v.optional(jlptLevelValidator),
    archived: v.boolean(),
    weakLimit: v.number(),
  },
  handler: async (ctx, { tokenIdentifier, ...filters }) => {
    if (
      !Number.isSafeInteger(filters.weakLimit) ||
      filters.weakLimit < 1 ||
      filters.weakLimit > 30
    )
      fail('VALIDATION', 'Consulte de 1 a 30 pontos fracos.');
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    return studyProgressForOwner(ctx, owner?._id ?? null, filters);
  },
});

export const studyCards = internalQuery({
  args: {
    tokenIdentifier: v.string(),
    category: v.union(
      v.literal('alphabet'),
      v.literal('vocabulary'),
      v.literal('grammar'),
    ),
    level: v.optional(jlptLevelValidator),
    archived: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { tokenIdentifier, paginationOpts, ...filters }) => {
    if (
      !Number.isSafeInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 100
    )
      fail('VALIDATION', 'Consulte de 1 a 100 cards por página.');
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    return studyCardsForOwner(ctx, owner?._id ?? null, {
      ...filters,
      limit: paginationOpts.numItems,
      cursor: paginationOpts.cursor,
    });
  },
});

export const searchShikenPapers = internalQuery({
  args: {
    tokenIdentifier: v.string(),
    level: v.optional(jlptLevelValidator),
    archived: v.boolean(),
    query: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { tokenIdentifier, ...args }) => {
    if (args.paginationOpts.numItems > 25)
      fail('VALIDATION', 'Consulte até 25 simulados por página.');
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) return { page: [], isDone: true, continueCursor: '' };
    const result = await shiken.searchForOwner(ctx, owner._id, args);
    return { ...result, page: result.page.map(presentShikenPaper) };
  },
});

export const getShikenPaper = internalQuery({
  args: { tokenIdentifier: v.string(), id: v.string() },
  handler: async (ctx, { tokenIdentifier, id }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) return null;
    const paper = await shiken.getForOwner(ctx, owner._id, paperId(ctx, id));
    return paper ? presentShikenPaper(paper) : null;
  },
});

export const createShikenPaper = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    clientKey: v.string(),
    paper: jlptPaperValidator,
  },
  handler: async (ctx, { tokenIdentifier, ...args }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    const ownerId =
      owner?._id ?? (await ctx.db.insert('users', { tokenIdentifier }));
    const paper = await createShikenForOwner(ctx, ownerId, args, (content) =>
      validatePaperMediaForOwner(ctx, ownerId, content),
    );
    return presentShikenPaper(paper);
  },
});

export const getShikenPaperContent = internalQuery({
  args: {
    tokenIdentifier: v.string(),
    id: v.string(),
    questionOffset: v.optional(v.number()),
    questionLimit: v.optional(v.number()),
    expectedContentVersion: v.optional(v.number()),
  },
  handler: async (ctx, { tokenIdentifier, id, ...args }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    return owner
      ? getShikenContentForOwner(ctx, owner._id, {
          ...args,
          id: paperId(ctx, id),
        })
      : null;
  },
});

export const shikenHistory = internalQuery({
  args: {
    tokenIdentifier: v.string(),
    paperId: v.optional(v.string()),
    level: v.optional(jlptLevelValidator),
    status: v.union(
      v.literal('all'),
      v.literal('active'),
      v.literal('completed'),
    ),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (
    ctx,
    { tokenIdentifier, paperId: requestedPaper, level, status, paginationOpts },
  ) => {
    if (paginationOpts.numItems > 25)
      fail('VALIDATION', 'Consulte até 25 tentativas por página.');
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    const page = owner
      ? await shiken.historyForOwner(ctx, owner._id, {
          ...(requestedPaper ? { paperId: paperId(ctx, requestedPaper) } : {}),
          paginationOpts,
        })
      : { page: [], isDone: true, continueCursor: '' };
    const items = page.page
      .filter(
        (attempt) =>
          (!level || attempt.snapshot.level === level) &&
          (status === 'all' || attempt.status === status),
      )
      .map(presentShikenAttempt);
    const completed = items.filter((attempt) => attempt.result !== null);
    const total = completed.reduce(
      (sum, attempt) => sum + attempt.result!.total,
      0,
    );
    const correct = completed.reduce(
      (sum, attempt) => sum + attempt.result!.correct,
      0,
    );
    return {
      items,
      cursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
      scanned: page.page.length,
      summaryScope: 'this_page_only' as const,
      pageSummary: {
        completed: completed.length,
        total,
        correct,
        percentage: total ? (correct / total) * 100 : null,
      },
    };
  },
});

function storyId(ctx: QueryCtx | MutationCtx, id: string) {
  const normalized = ctx.db.normalizeId('stories', id);
  if (!normalized) fail('VALIDATION', 'Identificador de história inválido.');
  return normalized;
}

export const listStories = internalQuery({
  args: {
    tokenIdentifier: v.string(),
    paginationOpts: paginationOptsValidator,
    level: v.optional(storyLevelValidator),
    status: v.optional(v.union(v.literal('all'), storyStatusValidator)),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, { tokenIdentifier, ...args }) => {
    if (
      !Number.isSafeInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 30
    )
      fail('VALIDATION', 'Consulte de 1 a 30 histórias por página.');
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) return { page: [], isDone: true, continueCursor: '' };
    return stories.listForOwner(ctx, owner._id, {
      ...args,
      latestContent: true,
    });
  },
});

export const getStory = internalQuery({
  args: { tokenIdentifier: v.string(), id: v.string() },
  handler: async (ctx, { tokenIdentifier, id }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    return owner
      ? stories.getLatestForOwner(ctx, owner._id, storyId(ctx, id))
      : null;
  },
});

export const createStory = internalMutation({
  args: { tokenIdentifier: v.string(), ...storyCreateFields },
  handler: async (ctx, { tokenIdentifier, ...args }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    const ownerId =
      owner?._id ?? (await ctx.db.insert('users', { tokenIdentifier }));
    return stories.createForOwner(ctx, ownerId, args);
  },
});

export const setStoryArchived = internalMutation({
  args: { tokenIdentifier: v.string(), id: v.string(), archived: v.boolean() },
  handler: async (ctx, { tokenIdentifier, id, archived }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) fail('UNAVAILABLE', 'História indisponível.');
    return stories.setArchivedForOwner(
      ctx,
      owner._id,
      storyId(ctx, id),
      archived,
    );
  },
});

export const updateStory = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    id: v.string(),
    expectedContentVersion: v.number(),
    story: storyUpdateFields.story,
  },
  handler: async (ctx, { tokenIdentifier, id, ...args }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) fail('UNAVAILABLE', 'História indisponível.');
    return stories.updateForOwner(ctx, owner._id, {
      ...args,
      id: storyId(ctx, id),
    });
  },
});

export const deleteStory = internalMutation({
  args: { tokenIdentifier: v.string(), id: v.string() },
  handler: async (ctx, { tokenIdentifier, id }) => {
    const owner = await ownerForIdentity(ctx, tokenIdentifier);
    if (!owner) fail('UNAVAILABLE', 'História indisponível.');
    return stories.deleteForOwner(ctx, owner._id, storyId(ctx, id));
  },
});
