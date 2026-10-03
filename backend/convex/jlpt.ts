import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwner } from './alphabetDomain';
import * as domain from './jlptDomain';
import {
  jlptAnswerFields,
  jlptLevelValidator,
  jlptPaperValidator,
  jlptPatchValidator,
} from './jlptValidators';

export const create = mutation({
  args: { paper: jlptPaperValidator },
  handler: async (ctx, { paper }) =>
    domain.createForOwner(ctx, await requireOwner(ctx), paper),
});
export const get = query({
  args: { id: v.id('jlptPapers') },
  handler: async (ctx, { id }) =>
    domain.getForOwner(ctx, await requireOwner(ctx), id),
});
export const update = mutation({
  args: {
    id: v.id('jlptPapers'),
    patch: jlptPatchValidator,
    expectedContentVersion: v.optional(v.number()),
  },
  handler: async (ctx, { id, patch, expectedContentVersion }) =>
    domain.updateForOwner(
      ctx,
      await requireOwner(ctx),
      id,
      patch,
      expectedContentVersion,
    ),
});
export const archive = mutation({
  args: { id: v.id('jlptPapers') },
  handler: async (ctx, { id }) =>
    domain.setArchivedForOwner(ctx, await requireOwner(ctx), id, true),
});
export const restore = mutation({
  args: { id: v.id('jlptPapers') },
  handler: async (ctx, { id }) =>
    domain.setArchivedForOwner(ctx, await requireOwner(ctx), id, false),
});
export const search = query({
  args: {
    level: v.optional(jlptLevelValidator),
    query: v.optional(v.string()),
    archived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    domain.searchForOwner(ctx, await requireOwner(ctx), args),
});
export const start = mutation({
  args: { paperId: v.id('jlptPapers') },
  handler: async (ctx, { paperId }) =>
    domain.startForOwner(ctx, await requireOwner(ctx), paperId),
});
const attemptArgs = {
  attemptId: v.id('jlptAttempts'),
  expectedRevision: v.number(),
};
export const answer = mutation({
  args: { ...attemptArgs, ...jlptAnswerFields },
  handler: async (ctx, args) =>
    domain.answerForOwner(
      ctx,
      await requireOwner(ctx),
      args.attemptId,
      {
        questionId: args.questionId,
        choice: args.choice,
        flagged: args.flagged,
      },
      args.expectedRevision,
    ),
});
export const advance = mutation({
  args: attemptArgs,
  handler: async (ctx, args) =>
    domain.advanceForOwner(
      ctx,
      await requireOwner(ctx),
      args.attemptId,
      args.expectedRevision,
    ),
});
export const finish = mutation({
  args: attemptArgs,
  handler: async (ctx, args) =>
    domain.finishForOwner(
      ctx,
      await requireOwner(ctx),
      args.attemptId,
      args.expectedRevision,
    ),
});
export const active = query({
  args: {},
  handler: async (ctx) => domain.activeForOwner(ctx, await requireOwner(ctx)),
});
export const getAttempt = query({
  args: { id: v.id('jlptAttempts') },
  handler: async (ctx, { id }) =>
    domain.getAttemptForOwner(ctx, await requireOwner(ctx), id),
});
export const history = query({
  args: {
    paperId: v.optional(v.id('jlptPapers')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    domain.historyForOwner(ctx, await requireOwner(ctx), args),
});
