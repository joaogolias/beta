import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { libraryReadingSortKey, cardOrderKey } from '../../shared/libraryOrder';
import { canonicalCard as canonicalAlphabet } from '../../shared/alphabetContent';
import { canonicalCard as canonicalVocabulary } from '../../shared/vocabularyContent';
import { canonicalCard as canonicalGrammar } from '../../shared/grammarContent';
import { PAGE_READ_BYTES } from './readBudget';

/** Keep legacy ordering until every existing card has its derived key. */
export function libraryOrderIndex() {
  if (process.env.LIBRARY_CARD_ORDER_ENABLED === 'true')
    return 'by_ownerId_and_archived_and_cardOrderKey_and_createdAt';
  return process.env.LIBRARY_READING_ORDER_ENABLED === 'true'
    ? 'by_ownerId_and_archived_and_readingSortKey'
    : 'by_ownerId_and_archived_and_sortKey';
}

export function creationTimestamp(supplied: number | undefined, now: number) {
  if (supplied === undefined) return now;
  if (
    !Number.isSafeInteger(supplied) ||
    supplied < 0 ||
    supplied > now + 300_000
  )
    throw new ConvexError({
      code: 'VALIDATION',
      message: 'Data de criação inválida.',
    });
  return supplied;
}

/**
 * Additive, bounded migration for the personal MVP library. Preserve both old
 * ordering fields until the new index is fully populated and its gate enabled.
 * Never scan or modify frozen presentations, attempts, statistics or papers.
 */
export const backfillCardModel = internalMutation({
  args: {
    table: v.union(
      v.literal('alphabetCards'),
      v.literal('vocabularyCards'),
      v.literal('grammarCards'),
      v.literal('examCards'),
    ),
    cursor: v.union(v.string(), v.null()),
    dryRun: v.boolean(),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 50;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
      throw new ConvexError({
        code: 'VALIDATION',
        message: 'Tamanho do lote deve estar entre 1 e 100.',
      });
    const result = await ctx.db.query(args.table).paginate({
      cursor: args.cursor,
      numItems: batchSize,
      maximumBytesRead: PAGE_READ_BYTES,
    });
    let needsUpdate = 0;
    let contentChanges = 0;
    for (const card of result.page) {
      const canonical =
        'symbol' in card
          ? canonicalAlphabet(card)
          : 'expression' in card
            ? canonicalVocabulary(card)
            : 'prompt' in card
              ? card
              : canonicalGrammar(card);
      const key = cardOrderKey(canonical);
      const optionalContent =
        'expression' in canonical
          ? { readingOmitted: canonical.readingOmitted }
          : 'title' in canonical && !('prompt' in canonical)
            ? { shortExplanation: canonical.shortExplanation }
            : {};
      const changed = canonical.contentVersion !== card.contentVersion;
      const optionalChanged =
        'expression' in card
          ? card.readingOmitted !==
            ('readingOmitted' in canonical
              ? canonical.readingOmitted
              : undefined)
          : 'title' in card && !('prompt' in card)
            ? card.shortExplanation !==
              ('shortExplanation' in canonical
                ? canonical.shortExplanation
                : undefined)
            : false;
      if (!changed && !optionalChanged && card.cardOrderKey === key) continue;
      needsUpdate += 1;
      if (changed) contentChanges += 1;
      if (!args.dryRun)
        await ctx.db.patch(card._id, {
          ...optionalContent,
          front: canonical.front,
          back: canonical.back,
          cardOrderKey: key,
          contentVersion: canonical.contentVersion,
          ...(changed ? { updatedAt: Date.now() } : {}),
        });
    }
    return {
      table: args.table,
      scanned: result.page.length,
      needsUpdate,
      contentChanges,
      updated: args.dryRun ? 0 : needsUpdate,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

// Administrative, resumable small-table migration. Run a complete dry run,
// backfill both tables, then verify a second dry run reports zero needsUpdate
// before setting LIBRARY_READING_ORDER_ENABLED=true. No content/history changes.
export const backfillReadingSortKeys = internalMutation({
  args: {
    table: v.union(v.literal('alphabetCards'), v.literal('vocabularyCards')),
    cursor: v.union(v.string(), v.null()),
    dryRun: v.boolean(),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
      throw new ConvexError({
        code: 'VALIDATION',
        message: 'Tamanho do lote deve estar entre 1 e 100.',
      });
    const result = await ctx.db.query(args.table).paginate({
      cursor: args.cursor,
      numItems: batchSize,
    });
    let needsUpdate = 0;
    for (const card of result.page) {
      const readingSortKey = libraryReadingSortKey(card.sortKey, card.language);
      if (card.readingSortKey === readingSortKey) continue;
      needsUpdate += 1;
      if (!args.dryRun) await ctx.db.patch(card._id, { readingSortKey });
    }
    return {
      table: args.table,
      scanned: result.page.length,
      needsUpdate,
      updated: args.dryRun ? 0 : needsUpdate,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
