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
