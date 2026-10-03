import { ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError('Not authenticated');
  }
  return identity;
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    return await ctx.db
      .query('users')
      .withIndex('by_tokenIdentifier', (q) =>
        q.eq('tokenIdentifier', identity.tokenIdentifier),
      )
      .unique();
  },
});

export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const user = await ctx.db
      .query('users')
      .withIndex('by_tokenIdentifier', (q) =>
        q.eq('tokenIdentifier', identity.tokenIdentifier),
      )
      .unique();

    const profile = {
      name: identity.name,
      email: identity.email,
      imageUrl: identity.pictureUrl,
    };

    if (user !== null) {
      // Avoid invalidating subscriptions when repeated provisioning changes nothing.
      if (
        user.name !== profile.name ||
        user.email !== profile.email ||
        user.imageUrl !== profile.imageUrl
      ) {
        await ctx.db.patch('users', user._id, profile);
      }
      return { ...user, ...profile };
    }

    const userId = await ctx.db.insert('users', {
      tokenIdentifier: identity.tokenIdentifier,
      ...profile,
    });
    const createdUser = await ctx.db.get('users', userId);
    if (createdUser === null) {
      throw new Error('User provisioning failed');
    }
    return createdUser;
  },
});
