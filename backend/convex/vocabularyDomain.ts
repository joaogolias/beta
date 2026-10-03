import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { libraryReadingSortKey, cardOrderKey } from '../../shared/libraryOrder';
import { libraryOrderIndex, creationTimestamp } from './libraryOrder';
import { PAGE_READ_BYTES } from './readBudget';
import { fail } from '../../shared/alphabetContent';
import {
  canonicalCard,
  contentOf,
  identityFields,
  matchesFilters,
  normalizeContent,
  normalizeFilters,
  type VocabularyCreateInput,
  type VocabularyContent,
  type VocabularyPatch,
  type VocabularySearch,
} from '../../shared/vocabularyContent';
export * from '../../shared/vocabularyContent';

async function ensureUnique(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  content: VocabularyContent,
  currentId?: Id<'vocabularyCards'>,
) {
  const keys = identityFields(content);
  const existing = await ctx.db
    .query('vocabularyCards')
    .withIndex(
      'by_ownerId_and_language_and_expressionKey_and_readingKey',
      (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('language', content.language)
          .eq('expressionKey', keys.expressionKey)
          .eq('readingKey', keys.readingKey),
    )
    .unique();
  if (existing && existing._id !== currentId)
    fail(
      'CONFLICT',
      existing.archived
        ? 'Este vocabulário já existe nos arquivados. Restaure o card existente.'
        : 'Esta expressão com esta leitura já está no seu vocabulário.',
    );
  return keys;
}

export async function getForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'vocabularyCards'>,
) {
  const card = await ctx.db.get('vocabularyCards', id);
  return card?.ownerId === ownerId ? canonicalCard(card) : null;
}

export async function requireCard(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'vocabularyCards'>,
) {
  const card = await getForOwner(ctx, ownerId, id);
  if (!card) fail('UNAVAILABLE', 'Card indisponível.');
  return card;
}

export async function canonicalizeForSnapshot(
  ctx: MutationCtx,
  card: Doc<'vocabularyCards'>,
) {
  const canonical = canonicalCard(card);
  if (canonical.contentVersion !== card.contentVersion) {
    const updatedAt = Date.now();
    await ctx.db.patch('vocabularyCards', card._id, {
      front: canonical.front,
      back: canonical.back,
      readingOmitted: canonical.readingOmitted,
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
  input: VocabularyCreateInput,
  createdAt?: number,
) {
  const content = normalizeContent(input);
  const keys = await ensureUnique(ctx, ownerId, content);
  const now = Date.now();
  const id = await ctx.db.insert('vocabularyCards', {
    ...content,
    ...keys,
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
  id: Id<'vocabularyCards'>,
  patch: VocabularyPatch,
) {
  const previous = await ctx.db.get('vocabularyCards', id);
  if (!previous || previous.ownerId !== ownerId)
    fail('UNAVAILABLE', 'Card indisponível.');
  const canonicalPrevious = canonicalCard(previous);
  const supplied = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  const content = normalizeContent({
    ...contentOf(previous),
    ...supplied,
    translations: {
      ...previous.translations,
      ...Object.fromEntries(
        Object.entries(patch.translations ?? {}).filter(
          ([, value]) => value !== undefined,
        ),
      ),
    },
  });
  const keys = await ensureUnique(ctx, ownerId, content, id);
  const readingSortKey = libraryReadingSortKey(
    content.sortKey,
    content.language,
  );
  const changed =
    JSON.stringify(normalizeContent(canonicalPrevious)) !==
    JSON.stringify(content);
  if (changed || canonicalPrevious.contentVersion !== previous.contentVersion)
    await ctx.db.patch('vocabularyCards', id, {
      ...content,
      ...keys,
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
    await ctx.db.patch('vocabularyCards', id, {
      readingSortKey,
      cardOrderKey: cardOrderKey(content),
      sortKey: content.sortKey,
    });
  return requireCard(ctx, ownerId, id);
}

export async function setArchivedForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'vocabularyCards'>,
  archived: boolean,
) {
  const card = await requireCard(ctx, ownerId, id);
  if (card.archived !== archived)
    await ctx.db.patch('vocabularyCards', id, {
      archived,
      updatedAt: Date.now(),
    });
  return requireCard(ctx, ownerId, id);
}

export async function searchForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  args: VocabularySearch,
) {
  if (
    !Number.isInteger(args.paginationOpts.numItems) ||
    args.paginationOpts.numItems < 1 ||
    args.paginationOpts.numItems > 100
  )
    fail('VALIDATION', 'Tamanho da página deve estar entre 1 e 100.');
  const filters = normalizeFilters(args);
  const result = await ctx.db
    .query('vocabularyCards')
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
