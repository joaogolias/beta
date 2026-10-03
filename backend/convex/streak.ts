import { ConvexError, v } from 'convex/values';
import { mutation, query, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireOwner } from './alphabetDomain';
import { activityDay } from '../../shared/dailyStreak';

async function history(ctx: QueryCtx, ownerId: Id<'users'>) {
  const runs = await ctx.db
    .query('streakRuns')
    .withIndex('by_ownerId_and_start', (q) => q.eq('ownerId', ownerId))
    .order('desc')
    .take(100);
  const total = await ctx.db
    .query('streakTotals')
    .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
    .unique();
  return {
    runs: runs.reverse().map(({ start, end }) => ({ start, end })),
    best: total?.best ?? 0,
  };
}

export const current = query({
  args: {},
  handler: async (ctx) => history(ctx, await requireOwner(ctx)),
});

/** Each event is an authenticated foreground visit, including durable offline visits. */
export const record = mutation({
  args: {
    activities: v.array(
      v.object({ occurredAt: v.number(), utcOffsetMinutes: v.number() }),
    ),
  },
  handler: async (ctx, { activities }) => {
    const ownerId = await requireOwner(ctx);
    if (activities.length < 1 || activities.length > 64)
      throw new ConvexError('Envie de 1 a 64 dias de atividade por vez.');
    for (const activity of activities) {
      if (
        !Number.isSafeInteger(activity.occurredAt) ||
        !Number.isInteger(activity.utcOffsetMinutes) ||
        activity.utcOffsetMinutes < -720 ||
        activity.utcOffsetMinutes > 840
      )
        throw new ConvexError(
          'Data de atividade inválida. Confira a data e a hora do aparelho.',
        );
    }
    const rejectedActivities = activities.filter(
      (activity) =>
        activity.occurredAt < Date.UTC(2020, 0, 1) ||
        activity.occurredAt > Date.now() + 300_000,
    );
    const validActivities = activities.filter(
      (activity) => !rejectedActivities.includes(activity),
    );
    const total = await ctx.db
      .query('streakTotals')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
      .unique();
    let best = total?.best ?? 0;
    for (const day of [...new Set(validActivities.map(activityDay))].sort(
      (a, b) => a - b,
    )) {
      const previous = await ctx.db
        .query('streakRuns')
        .withIndex('by_ownerId_and_start', (q) =>
          q.eq('ownerId', ownerId).lte('start', day),
        )
        .order('desc')
        .first();
      if (previous && previous.end >= day) continue;
      const next = await ctx.db
        .query('streakRuns')
        .withIndex('by_ownerId_and_start', (q) =>
          q.eq('ownerId', ownerId).gt('start', day),
        )
        .first();
      const joinsPrevious = previous?.end === day - 1;
      const joinsNext = next?.start === day + 1;
      const start = joinsPrevious ? previous.start : day;
      const end = joinsNext ? next.end : day;
      if (joinsPrevious) {
        await ctx.db.patch('streakRuns', previous._id, { end });
        if (joinsNext) await ctx.db.delete('streakRuns', next._id);
      } else if (joinsNext)
        await ctx.db.patch('streakRuns', next._id, { start });
      else await ctx.db.insert('streakRuns', { ownerId, start, end });
      best = Math.max(best, end - start + 1);
    }
    if (!total) await ctx.db.insert('streakTotals', { ownerId, best });
    else if (total.best !== best)
      await ctx.db.patch('streakTotals', total._id, { best });
    return { ...(await history(ctx, ownerId)), rejectedActivities };
  },
});
