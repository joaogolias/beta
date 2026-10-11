import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwner } from './alphabetDomain';
import {
  storyCreateFields,
  storyLevelValidator,
  storyStatusValidator,
  storyUpdateFields,
} from './storiesValidators';
import * as stories from './storiesDomain';

export const create = mutation({
  args: storyCreateFields,
  handler: async (ctx, args) =>
    stories.createForOwner(ctx, await requireOwner(ctx), args),
});
export const update = mutation({
  args: storyUpdateFields,
  handler: async (ctx, args) =>
    stories.updateForOwner(ctx, await requireOwner(ctx), args),
});
export const deleteStory = mutation({
  args: { id: v.id('stories') },
  handler: async (ctx, { id }) =>
    stories.deleteForOwner(ctx, await requireOwner(ctx), id),
});
export const get = query({
  args: { id: v.id('stories'), questId: v.optional(v.id('quests')) },
  handler: async (ctx, { id, questId }) =>
    stories.getForOwner(ctx, await requireOwner(ctx), id, questId),
});
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    level: v.optional(storyLevelValidator),
    status: v.optional(v.union(v.literal('all'), storyStatusValidator)),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) =>
    stories.listForOwner(ctx, await requireOwner(ctx), args),
});
export const setArchived = mutation({
  args: { id: v.id('stories'), archived: v.boolean() },
  handler: async (ctx, { id, archived }) =>
    stories.setArchivedForOwner(ctx, await requireOwner(ctx), id, archived),
});
export const saveParagraph = mutation({
  args: {
    id: v.id('stories'),
    questId: v.optional(v.id('quests')),
    paragraphIndex: v.number(),
    contentVersion: v.optional(v.number()),
  },
  handler: async (ctx, { id, paragraphIndex, contentVersion, questId }) =>
    stories.progressForAction(ctx, await requireOwner(ctx), id, {
      type: 'progress',
      questId,
      paragraphIndex,
      contentVersion,
      occurredAt: Date.now(),
    }),
});
export const answer = mutation({
  args: {
    id: v.id('stories'),
    questId: v.optional(v.id('quests')),
    questionId: v.string(),
    optionId: v.string(),
    contentVersion: v.optional(v.number()),
  },
  handler: async (ctx, { id, questionId, optionId, contentVersion, questId }) =>
    stories.progressForAction(ctx, await requireOwner(ctx), id, {
      type: 'answer',
      questId,
      questionId,
      optionId,
      contentVersion,
      occurredAt: Date.now(),
    }),
});
export const complete = mutation({
  args: {
    id: v.id('stories'),
    contentVersion: v.optional(v.number()),
    questId: v.optional(v.id('quests')),
  },
  handler: async (ctx, { id, contentVersion, questId }) =>
    stories.progressForAction(ctx, await requireOwner(ctx), id, {
      type: 'complete',
      questId,
      contentVersion,
      occurredAt: Date.now(),
    }),
});
export const offlineSnapshot = query({
  args: { cachedIds: v.optional(v.array(v.id('stories'))) },
  handler: async (ctx, { cachedIds }) =>
    stories.offlineSnapshotForOwner(ctx, await requireOwner(ctx), cachedIds),
});
