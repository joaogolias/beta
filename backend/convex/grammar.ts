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
} from './grammarDomain';
import {
  grammarCreateValidator,
  grammarFilterFields,
  grammarPatchValidator,
} from './grammarValidators';

export const create = mutation({
  args: { card: grammarCreateValidator },
  handler: async (ctx, { card }) =>
    createForOwner(ctx, await requireOwner(ctx), card),
});
export const get = query({
  args: { id: v.id('grammarCards') },
  handler: async (ctx, { id }) => getForOwner(ctx, await requireOwner(ctx), id),
});
export const search = query({
  args: {
    ...grammarFilterFields,
    archived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    searchForOwner(ctx, await requireOwner(ctx), args),
});
export const update = mutation({
  args: { id: v.id('grammarCards'), patch: grammarPatchValidator },
  handler: async (ctx, { id, patch }) =>
    updateForOwner(ctx, await requireOwner(ctx), id, patch),
});
export const archive = mutation({
  args: { id: v.id('grammarCards') },
  handler: async (ctx, { id }) =>
    setArchivedForOwner(ctx, await requireOwner(ctx), id, true),
});
export const restore = mutation({
  args: { id: v.id('grammarCards') },
  handler: async (ctx, { id }) =>
    setArchivedForOwner(ctx, await requireOwner(ctx), id, false),
});
