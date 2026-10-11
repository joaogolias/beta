import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwner } from './alphabetDomain';
import { questCreateFields, questStatusValidator } from './questsValidators';
import * as quests from './questsDomain';
import { startForOwner } from './questsStart';

export const create = mutation({
  args: questCreateFields,
  handler: async (ctx, args) =>
    quests.createForOwner(ctx, await requireOwner(ctx), args),
});
export const get = query({
  args: { id: v.id('quests') },
  handler: async (ctx, { id }) =>
    quests.getForOwner(ctx, await requireOwner(ctx), id),
});
export const cancel = mutation({
  args: { id: v.id('quests') },
  handler: async (ctx, { id }) =>
    quests.cancelForOwner(ctx, await requireOwner(ctx), id),
});
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(v.literal('all'), questStatusValidator)),
  },
  handler: async (ctx, args) =>
    quests.listForOwner(ctx, await requireOwner(ctx), args),
});
export const snapshot = query({
  args: {},
  handler: async (ctx) =>
    quests.snapshotPageForOwner(ctx, await requireOwner(ctx)),
});
export const start = mutation({
  args: { id: v.id('quests') },
  handler: async (ctx, { id }) =>
    startForOwner(ctx, await requireOwner(ctx), id),
});
