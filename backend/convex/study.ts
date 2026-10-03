import { paginationOptsValidator } from 'convex/server';
import { getDocumentSize, v, type Infer } from 'convex/values';
import { PAGE_READ_BYTES, SESSION_SNAPSHOT_BYTES } from './readBudget';
import type { Doc, Id } from './_generated/dataModel';
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { fail, requireOwner } from './alphabetDomain';
import { compareLibraryCards } from '../../shared/libraryOrder';
import { studyRatingValidator } from './alphabetValidators';
import { studyCardIdValidator, studyFilterFields } from './studyValidators';
import {
  getStudyCard,
  normalizeStudyFilters,
  requireStudyCard,
  studyCandidates,
  studySnapshot,
  type StudyCardId,
} from './studyCards';

const MAX_SESSION_CARDS = 100;
const MAX_CANDIDATES = 1000;
const sessionArgs = { sessionId: v.id('studySessions') };
const presentationArgs = {
  ...sessionArgs,
  presentationId: v.id('studyPresentations'),
  expectedRevision: v.optional(v.number()),
};

type PresentationOperation = {
  sessionId: Id<'studySessions'>;
  presentationId: Id<'studyPresentations'>;
  expectedRevision?: number;
  occurredAt?: number;
};

function requireRevision(session: Doc<'studySessions'>, expected = 0) {
  if (expected !== (session.revision ?? 0))
    fail('CONFLICT', 'A sessão mudou. Tente de novo no card atual.');
}

async function previousAnswer(
  ctx: QueryCtx | MutationCtx,
  session: Doc<'studySessions'>,
) {
  if (session.answered === 0 || session.status === 'ended') return null;
  const previous = ctx.db
    .query('studyPresentations')
    .withIndex('by_sessionId_and_position', (q) =>
      q.eq('sessionId', session._id).lt('position', session.position),
    )
    .order('desc');
  for await (const item of previous) if (item.rating !== undefined) return item;
  return null;
}

export async function ownedSession(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  sessionId: Id<'studySessions'>,
) {
  const session = await ctx.db.get('studySessions', sessionId);
  if (!session || session.ownerId !== ownerId)
    fail('UNAVAILABLE', 'Sessão indisponível.');
  return session;
}

export async function sessionCardProjection(
  ctx: QueryCtx | MutationCtx,
  session: Doc<'studySessions'>,
) {
  const presentation =
    session.status === 'active'
      ? await ctx.db
          .query('studyPresentations')
          .withIndex('by_sessionId_and_position', (q) =>
            q.eq('sessionId', session._id).eq('position', session.position),
          )
          .unique()
      : null;
  const previous = await previousAnswer(ctx, session);
  return { session, presentation, undoPresentationId: previous?._id ?? null };
}

async function activateNext(
  ctx: MutationCtx,
  session: Doc<'studySessions'>,
  now = Date.now(),
  skippedPresentationIds: ReadonlySet<Id<'studyPresentations'>> = new Set(),
) {
  let position = session.position;
  let skipped = session.skipped;
  while (position < session.total) {
    const presentation = await ctx.db
      .query('studyPresentations')
      .withIndex('by_sessionId_and_position', (q) =>
        q.eq('sessionId', session._id).eq('position', position),
      )
      .unique();
    if (!presentation)
      fail('UNAVAILABLE', 'Não foi possível carregar a sessão.');
    const card = await getStudyCard(ctx, presentation.cardId);
    if (
      !presentation.presentedAt &&
      (skippedPresentationIds.has(presentation._id) ||
        (!session.offlineQueue && (!card || card.archived)))
    ) {
      await ctx.db.patch('studyPresentations', presentation._id, {
        skipped: true,
      });
      position += 1;
      skipped += 1;
      continue;
    }
    if (!presentation.presentedAt) {
      await ctx.db.patch('studyPresentations', presentation._id, {
        presentedAt: now,
      });
    }
    await ctx.db.patch('studySessions', session._id, { position, skipped });
    return;
  }
  await ctx.db.patch('studySessions', session._id, {
    position,
    skipped,
    status: 'completed',
    completedAt: now,
  });
}

function adaptivePriority(stats: Doc<'studyStats'> | null, now: number) {
  if (!stats) return 1.5;
  const accuracy = (stats.correct + stats.partial * 0.5) / stats.attempts;
  const ageInDays = Math.max(0, now - stats.lastReviewedAt) / 86_400_000;
  return 1 - accuracy + Math.min(ageInDays / 30, 1) * 0.25;
}

export const start = mutation({
  args: {
    ...studyFilterFields,
    mode: v.union(v.literal('direct'), v.literal('adaptive')),
    order: v.union(v.literal('sorted'), v.literal('random')),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    if (
      !Number.isInteger(args.limit) ||
      args.limit < 1 ||
      args.limit > MAX_SESSION_CARDS
    ) {
      fail('VALIDATION', 'Escolha entre 1 e 100 cards por sessão.');
    }
    const active = await ctx.db
      .query('studySessions')
      .withIndex('by_ownerId_and_status', (q) =>
        q.eq('ownerId', ownerId).eq('status', 'active'),
      )
      .unique();
    if (active) return active;
    const filters = normalizeStudyFilters(args);
    let cards = await studyCandidates(ctx, ownerId, filters, MAX_CANDIDATES);
    if (!cards.length)
      fail('VALIDATION', 'Nenhum card ativo corresponde aos filtros.');
    const now = Date.now();
    if (args.mode === 'adaptive') {
      const ranked = await Promise.all(
        cards.map(async (card) => {
          const stats = await ctx.db
            .query('studyStats')
            .withIndex('by_ownerId_and_cardId', (q) =>
              q.eq('ownerId', ownerId).eq('cardId', card._id),
            )
            .unique();
          return { card, score: adaptivePriority(stats, now) };
        }),
      );
      ranked.sort(
        (a, b) =>
          b.score - a.score || a.card._creationTime - b.card._creationTime,
      );
      cards = ranked.map(({ card }) => card);
    } else if (args.order === 'random') {
      // Fisher–Yates gives each candidate a chance; the resulting order is saved.
      for (let index = cards.length - 1; index > 0; index -= 1) {
        const target = Math.floor(Math.random() * (index + 1));
        [cards[index], cards[target]] = [cards[target], cards[index]];
      }
    } else {
      cards.sort(compareLibraryCards);
    }
    const selected = cards.slice(0, args.limit);
    const snapshots = [];
    let snapshotBytes = 0;
    for (const card of selected) {
      const snapshot = await studySnapshot(ctx, card);
      snapshotBytes += getDocumentSize(snapshot);
      if (snapshotBytes > SESSION_SNAPSHOT_BYTES)
        fail(
          'VALIDATION',
          'Os textos desta sessão são muito longos. Escolha menos cards para estudar.',
        );
      snapshots.push(snapshot);
    }
    const sessionId = await ctx.db.insert('studySessions', {
      ownerId,
      mode: args.mode,
      order: args.order,
      filters,
      status: 'active',
      total: selected.length,
      position: 0,
      answered: 0,
      skipped: 0,
      correct: 0,
      partial: 0,
      incorrect: 0,
      createdAt: now,
    });
    for (const [position, storedCard] of selected.entries()) {
      await ctx.db.insert('studyPresentations', {
        ownerId,
        sessionId,
        cardId: storedCard._id,
        position,
        snapshot: snapshots[position],
        skipped: false,
        ...(position === 0 ? { presentedAt: now } : {}),
      });
    }
    return await ownedSession(ctx, ownerId, sessionId);
  },
});

export const active = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    return await ctx.db
      .query('studySessions')
      .withIndex('by_ownerId_and_status', (q) =>
        q.eq('ownerId', ownerId).eq('status', 'active'),
      )
      .unique();
  },
});

export const current = query({
  args: sessionArgs,
  handler: async (ctx, { sessionId }) =>
    sessionCardProjection(
      ctx,
      await ownedSession(ctx, await requireOwner(ctx), sessionId),
    ),
});

async function ownedPresentation(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  sessionId: Id<'studySessions'>,
  presentationId: Id<'studyPresentations'>,
) {
  const presentation = await ctx.db.get('studyPresentations', presentationId);
  if (
    !presentation ||
    presentation.ownerId !== ownerId ||
    presentation.sessionId !== sessionId
  ) {
    fail('UNAVAILABLE', 'Card da sessão indisponível.');
  }
  return presentation;
}

function requireCurrent(
  session: Doc<'studySessions'>,
  presentation: Doc<'studyPresentations'>,
) {
  if (
    session.status !== 'active' ||
    session.position !== presentation.position ||
    presentation.skipped ||
    presentation.presentedAt === undefined
  ) {
    fail('CONFLICT', 'Este card não é o card atual da sessão.');
  }
}

export async function revealForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  {
    sessionId,
    presentationId,
    expectedRevision,
    occurredAt,
  }: PresentationOperation,
) {
  const session = await ownedSession(ctx, ownerId, sessionId);
  requireRevision(session, expectedRevision);
  const presentation = await ownedPresentation(
    ctx,
    ownerId,
    sessionId,
    presentationId,
  );
  requireCurrent(session, presentation);
  if (presentation.revealedAt === undefined) {
    await ctx.db.patch('studyPresentations', presentationId, {
      revealedAt: occurredAt ?? Date.now(),
    });
  }
  return await sessionCardProjection(ctx, session);
}

export const reveal = mutation({
  args: presentationArgs,
  handler: async (ctx, args) =>
    revealForOwner(ctx, await requireOwner(ctx), args),
});

async function saveStats(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  cardId: StudyCardId,
  rating: Infer<typeof studyRatingValidator>,
  now: number,
) {
  const stats = await ctx.db
    .query('studyStats')
    .withIndex('by_ownerId_and_cardId', (q) =>
      q.eq('ownerId', ownerId).eq('cardId', cardId),
    )
    .unique();
  const counts = {
    correct: stats?.correct ?? 0,
    partial: stats?.partial ?? 0,
    incorrect: stats?.incorrect ?? 0,
  };
  counts[rating] += 1;
  const values = {
    ...counts,
    attempts: (stats?.attempts ?? 0) + 1,
    lastReviewedAt: Math.max(stats?.lastReviewedAt ?? 0, now),
  };
  if (stats) await ctx.db.patch('studyStats', stats._id, values);
  else await ctx.db.insert('studyStats', { ownerId, cardId, ...values });
  const totals = await ctx.db
    .query('studyTotals')
    .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
    .unique();
  const totalCounts = {
    correct: totals?.correct ?? 0,
    partial: totals?.partial ?? 0,
    incorrect: totals?.incorrect ?? 0,
  };
  totalCounts[rating] += 1;
  const totalValues = {
    ...totalCounts,
    attempts: (totals?.attempts ?? 0) + 1,
    reviewedCards: (totals?.reviewedCards ?? 0) + (stats ? 0 : 1),
  };
  if (totals) await ctx.db.patch('studyTotals', totals._id, totalValues);
  else await ctx.db.insert('studyTotals', { ownerId, ...totalValues });
}

export async function rateForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  {
    sessionId,
    presentationId,
    rating,
    expectedRevision,
    occurredAt,
    skippedPresentationIds,
  }: PresentationOperation & {
    rating: Infer<typeof studyRatingValidator>;
    skippedPresentationIds?: ReadonlySet<Id<'studyPresentations'>>;
  },
) {
  const session = await ownedSession(ctx, ownerId, sessionId);
  requireRevision(session, expectedRevision);
  const presentation = await ownedPresentation(
    ctx,
    ownerId,
    sessionId,
    presentationId,
  );
  if (presentation.rating !== undefined) {
    if (presentation.rating !== rating)
      fail('CONFLICT', 'Este card já recebeu outra resposta.');
    return await sessionCardProjection(ctx, session);
  }
  requireCurrent(session, presentation);
  if (presentation.revealedAt === undefined)
    fail('VALIDATION', 'Revele o verso antes de responder.');
  const now = occurredAt ?? Date.now();
  await ctx.db.insert('studyAttempts', {
    ownerId,
    cardId: presentation.cardId,
    sessionId,
    presentationId,
    snapshot: presentation.snapshot,
    rating,
    mode: session.mode,
    reviewedAt: now,
  });
  await ctx.db.patch('studyPresentations', presentationId, {
    rating,
    answeredAt: now,
  });
  await saveStats(ctx, ownerId, presentation.cardId, rating, now);
  await ctx.db.patch('studySessions', sessionId, {
    position: session.position + 1,
    answered: session.answered + 1,
    [rating]: session[rating] + 1,
  });
  await activateNext(
    ctx,
    await ownedSession(ctx, ownerId, sessionId),
    now,
    skippedPresentationIds,
  );
  return await sessionCardProjection(
    ctx,
    await ownedSession(ctx, ownerId, sessionId),
  );
}

export const rate = mutation({
  args: { ...presentationArgs, rating: studyRatingValidator },
  handler: async (ctx, args) =>
    rateForOwner(ctx, await requireOwner(ctx), args),
});

/** Undo only the last answer, atomically with history and all aggregates. */
export async function undoForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  {
    sessionId,
    presentationId,
    expectedRevision,
  }: PresentationOperation & { expectedRevision: number },
) {
  const session = await ownedSession(ctx, ownerId, sessionId);
  const previous = await ownedPresentation(
    ctx,
    ownerId,
    sessionId,
    presentationId,
  );
  // Retrying the same undo cannot undo a second card or a corrected answer.
  if (
    (session.revision ?? 0) === expectedRevision + 1 &&
    session.status === 'active' &&
    session.position === previous.position &&
    previous.rating === undefined
  )
    return await sessionCardProjection(ctx, session);
  requireRevision(session, expectedRevision);
  const candidate = await previousAnswer(ctx, session);
  if (
    !candidate ||
    candidate._id !== presentationId ||
    previous.rating === undefined
  )
    fail('CONFLICT', 'Só é possível voltar à última resposta desta sessão.');
  const activeSession = await ctx.db
    .query('studySessions')
    .withIndex('by_ownerId_and_status', (q) =>
      q.eq('ownerId', ownerId).eq('status', 'active'),
    )
    .unique();
  if (activeSession && activeSession._id !== sessionId)
    fail('CONFLICT', 'Termine a sessão atual antes de voltar a esta.');
  const attempt = await ctx.db
    .query('studyAttempts')
    .withIndex('by_presentationId', (q) =>
      q.eq('presentationId', presentationId),
    )
    .unique();
  const stats = await ctx.db
    .query('studyStats')
    .withIndex('by_ownerId_and_cardId', (q) =>
      q.eq('ownerId', ownerId).eq('cardId', previous.cardId),
    )
    .unique();
  const totals = await ctx.db
    .query('studyTotals')
    .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
    .unique();
  if (!attempt || !stats || !totals)
    fail('CONFLICT', 'Não foi possível desfazer esta resposta.');
  const rating = previous.rating;
  await ctx.db.delete('studyAttempts', attempt._id);
  if (stats.attempts === 1) await ctx.db.delete('studyStats', stats._id);
  else {
    const latest = await ctx.db
      .query('studyAttempts')
      .withIndex('by_ownerId_and_cardId_and_reviewedAt', (q) =>
        q.eq('ownerId', ownerId).eq('cardId', previous.cardId),
      )
      .order('desc')
      .first();
    if (!latest) fail('CONFLICT', 'Não foi possível atualizar o histórico.');
    await ctx.db.patch('studyStats', stats._id, {
      attempts: stats.attempts - 1,
      [rating]: stats[rating] - 1,
      lastReviewedAt: latest.reviewedAt,
    });
  }
  await ctx.db.patch('studyTotals', totals._id, {
    attempts: totals.attempts - 1,
    [rating]: totals[rating] - 1,
    reviewedCards: totals.reviewedCards - (stats.attempts === 1 ? 1 : 0),
  });
  const rewound = await ctx.db
    .query('studyPresentations')
    .withIndex('by_sessionId_and_position', (q) =>
      q
        .eq('sessionId', sessionId)
        .gt('position', previous.position)
        .lte('position', session.position),
    )
    .take(MAX_SESSION_CARDS);
  let skipped = session.skipped;
  for (const next of rewound) {
    if (next.skipped) skipped -= 1;
    await ctx.db.patch('studyPresentations', next._id, {
      skipped: false,
      presentedAt: undefined,
      revealedAt: undefined,
    });
  }
  await ctx.db.patch('studyPresentations', presentationId, {
    rating: undefined,
    answeredAt: undefined,
    revealedAt: undefined,
  });
  await ctx.db.patch('studySessions', sessionId, {
    position: previous.position,
    answered: session.answered - 1,
    [rating]: session[rating] - 1,
    skipped,
    status: 'active',
    completedAt: undefined,
    revision: (session.revision ?? 0) + 1,
  });
  return await sessionCardProjection(
    ctx,
    await ownedSession(ctx, ownerId, sessionId),
  );
}

export const undo = mutation({
  args: { ...presentationArgs, expectedRevision: v.number() },
  handler: async (ctx, args) =>
    undoForOwner(ctx, await requireOwner(ctx), args),
});

export async function finishForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  {
    sessionId,
    occurredAt,
  }: { sessionId: Id<'studySessions'>; occurredAt?: number },
) {
  const session = await ownedSession(ctx, ownerId, sessionId);
  if (session.status === 'active')
    await ctx.db.patch('studySessions', sessionId, {
      status: 'ended',
      completedAt: occurredAt ?? Date.now(),
    });
  return await ownedSession(ctx, ownerId, sessionId);
}

export const finish = mutation({
  args: sessionArgs,
  handler: async (ctx, args) =>
    finishForOwner(ctx, await requireOwner(ctx), args),
});

export const progress = query({
  args: { cardId: studyCardIdValidator },
  handler: async (ctx, { cardId }) => {
    const ownerId = await requireOwner(ctx);
    await requireStudyCard(ctx, ownerId, cardId);
    return await ctx.db
      .query('studyStats')
      .withIndex('by_ownerId_and_cardId', (q) =>
        q.eq('ownerId', ownerId).eq('cardId', cardId),
      )
      .unique();
  },
});

export const history = query({
  args: {
    cardId: studyCardIdValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { cardId, paginationOpts }) => {
    const ownerId = await requireOwner(ctx);
    await requireStudyCard(ctx, ownerId, cardId);
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 100
    )
      fail('VALIDATION', 'Tamanho da página deve estar entre 1 e 100.');
    return await ctx.db
      .query('studyAttempts')
      .withIndex('by_ownerId_and_cardId_and_reviewedAt', (q) =>
        q.eq('ownerId', ownerId).eq('cardId', cardId),
      )
      .order('desc')
      .paginate({
        ...paginationOpts,
        maximumBytesRead: PAGE_READ_BYTES,
      });
  },
});

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const stats = await ctx.db
      .query('studyStats')
      .withIndex('by_ownerId_and_cardId', (q) => q.eq('ownerId', ownerId))
      .take(MAX_CANDIDATES + 1);
    if (stats.length > MAX_CANDIDATES)
      fail(
        'VALIDATION',
        'O resumo suporta até 1.000 cards estudados nesta versão.',
      );
    return stats
      .filter((stat) => !ctx.db.normalizeId('examCards', stat.cardId))
      .reduce(
        (total, stat) => ({
          correct: total.correct + stat.correct,
          partial: total.partial + stat.partial,
          incorrect: total.incorrect + stat.incorrect,
          attempts: total.attempts + stat.attempts,
          reviewedCards: total.reviewedCards + (stat.attempts > 0 ? 1 : 0),
        }),
        { correct: 0, partial: 0, incorrect: 0, attempts: 0, reviewedCards: 0 },
      );
  },
});
