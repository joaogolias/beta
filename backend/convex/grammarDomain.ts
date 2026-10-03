import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { libraryReadingSortKey, cardOrderKey } from '../../shared/libraryOrder';
import { libraryOrderIndex, creationTimestamp } from './libraryOrder';
import { PAGE_READ_BYTES } from './readBudget';
import { fail } from '../../shared/alphabetContent';
import {
  canonicalCard,
  contentOf,
  matchesFilters,
  normalizeContent,
  normalizeFilters,
  normalizePatch,
  type GrammarCreateInput,
  type GrammarPatch,
  type GrammarSearch,
} from '../../shared/grammarContent';
export * from '../../shared/grammarContent';

export async function getForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'grammarCards'>,
) {
  const card = await ctx.db.get('grammarCards', id);
  return card?.ownerId === ownerId ? canonicalCard(card) : null;
}

export async function requireCard(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'grammarCards'>,
) {
  const card = await getForOwner(ctx, ownerId, id);
  if (!card) fail('UNAVAILABLE', 'Card indisponível.');
  return card;
}
export const requireGrammarCard = requireCard;

export async function canonicalizeForSnapshot(
  ctx: MutationCtx,
  card: Doc<'grammarCards'>,
) {
  const canonical = canonicalCard(card);
  if (canonical.contentVersion !== card.contentVersion) {
    const updatedAt = Date.now();
    await ctx.db.patch('grammarCards', card._id, {
      front: canonical.front,
      back: canonical.back,
      shortExplanation: canonical.shortExplanation,
      cardOrderKey: cardOrderKey(canonical),
      contentVersion: canonical.contentVersion,
      updatedAt,
    });
    return { ...canonical, updatedAt };
  }
  return canonical;
}

export async function createForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  input: GrammarCreateInput,
  createdAt?: number,
) {
  const content = normalizeContent(input);
  const now = Date.now();
  const id = await ctx.db.insert('grammarCards', {
    ...content,
    readingSortKey: libraryReadingSortKey(content.sortKey, content.language),
    cardOrderKey: cardOrderKey(content),
    ownerId,
    archived: false,
    contentVersion: 1,
    createdAt: creationTimestamp(createdAt, now),
    updatedAt: now,
  });
  return requireCard(ctx, ownerId, id);
}

export async function updateForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'grammarCards'>,
  patch: GrammarPatch,
) {
  const previous = await ctx.db.get('grammarCards', id);
  if (!previous || previous.ownerId !== ownerId)
    fail('UNAVAILABLE', 'Card indisponível.');
  const canonicalPrevious = canonicalCard(previous);
  const content = normalizeContent({
    ...contentOf(previous),
    ...normalizePatch(patch),
  });
  const readingSortKey = libraryReadingSortKey(
    content.sortKey,
    content.language,
  );
  const changed =
    JSON.stringify(normalizeContent(canonicalPrevious)) !==
    JSON.stringify(content);
  if (changed || canonicalPrevious.contentVersion !== previous.contentVersion)
    await ctx.db.patch('grammarCards', id, {
      ...content,
      readingSortKey,
      cardOrderKey: cardOrderKey(content),
      contentVersion: canonicalPrevious.contentVersion + (changed ? 1 : 0),
      updatedAt: Date.now(),
    });
  else if (
    previous.readingSortKey !== readingSortKey ||
    previous.cardOrderKey !== cardOrderKey(content) ||
    previous.sortKey !== content.sortKey
  )
    await ctx.db.patch('grammarCards', id, {
      readingSortKey,
      cardOrderKey: cardOrderKey(content),
      sortKey: content.sortKey,
    });
  return requireCard(ctx, ownerId, id);
}

export async function setArchivedForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'grammarCards'>,
  archived: boolean,
) {
  const card = await requireCard(ctx, ownerId, id);
  if (card.archived !== archived)
    await ctx.db.patch('grammarCards', id, { archived, updatedAt: Date.now() });
  return requireCard(ctx, ownerId, id);
}

export async function searchForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  args: GrammarSearch,
) {
  if (
    !Number.isInteger(args.paginationOpts.numItems) ||
    args.paginationOpts.numItems < 1 ||
    args.paginationOpts.numItems > 100
  )
    fail('VALIDATION', 'Tamanho da página deve estar entre 1 e 100.');
  const filters = normalizeFilters(args);
  const result = await ctx.db
    .query('grammarCards')
    .withIndex(libraryOrderIndex(), (q) =>
      q.eq('ownerId', ownerId).eq('archived', args.archived ?? false),
    )
    .paginate({ ...args.paginationOpts, maximumBytesRead: PAGE_READ_BYTES });
  return {
    ...result,
    page: result.page
      .map(canonicalCard)
      .filter((card) => matchesFilters(card, filters)),
  };
}
export const listOwnedGrammar = searchForOwner;
