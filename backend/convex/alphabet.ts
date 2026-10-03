import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  createForOwner,
  getForOwner,
  requireOwner,
  searchForOwner,
  setArchivedForOwner,
  updateForOwner,
} from './alphabetDomain';
import {
  alphabetCreateValidator,
  alphabetFilterFields,
  alphabetPatchValidator,
} from './alphabetValidators';

export const create = mutation({
  args: { card: alphabetCreateValidator },
  handler: async (ctx, { card }) =>
    createForOwner(ctx, await requireOwner(ctx), card),
});

export const get = query({
  args: { id: v.id('alphabetCards') },
  handler: async (ctx, { id }) => getForOwner(ctx, await requireOwner(ctx), id),
});

export const search = query({
  args: {
    ...alphabetFilterFields,
    archived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    searchForOwner(ctx, await requireOwner(ctx), args),
});

export const update = mutation({
  args: { id: v.id('alphabetCards'), patch: alphabetPatchValidator },
  handler: async (ctx, { id, patch }) =>
    updateForOwner(ctx, await requireOwner(ctx), id, patch),
});

export const archive = mutation({
  args: { id: v.id('alphabetCards') },
  handler: async (ctx, { id }) =>
    setArchivedForOwner(ctx, await requireOwner(ctx), id, true),
});

export const restore = mutation({
  args: { id: v.id('alphabetCards') },
  handler: async (ctx, { id }) =>
    setArchivedForOwner(ctx, await requireOwner(ctx), id, false),
});
