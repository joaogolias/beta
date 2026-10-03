import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwner } from './alphabetDomain';
import {
  createForOwner,
  getForOwner,
  searchForOwner,
  setArchivedForOwner,
  updateForOwner,
} from './vocabularyDomain';
import {
  vocabularyCreateValidator,
  vocabularyFilterFields,
  vocabularyPatchValidator,
} from './vocabularyValidators';

export const create = mutation({
  args: { card: vocabularyCreateValidator },
  handler: async (ctx, { card }) =>
    createForOwner(ctx, await requireOwner(ctx), card),
});
export const get = query({
  args: { id: v.id('vocabularyCards') },
  handler: async (ctx, { id }) => getForOwner(ctx, await requireOwner(ctx), id),
});
export const search = query({
  args: {
    ...vocabularyFilterFields,
    archived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    searchForOwner(ctx, await requireOwner(ctx), args),
});
export const update = mutation({
  args: { id: v.id('vocabularyCards'), patch: vocabularyPatchValidator },
  handler: async (ctx, { id, patch }) =>
    updateForOwner(ctx, await requireOwner(ctx), id, patch),
});
export const archive = mutation({
  args: { id: v.id('vocabularyCards') },
  handler: async (ctx, { id }) =>
    setArchivedForOwner(ctx, await requireOwner(ctx), id, true),
});
export const restore = mutation({
  args: { id: v.id('vocabularyCards') },
  handler: async (ctx, { id }) =>
    setArchivedForOwner(ctx, await requireOwner(ctx), id, false),
});
