import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { libraryReadingSortKey, cardOrderKey } from '../../shared/libraryOrder';
import { libraryOrderIndex, creationTimestamp } from './libraryOrder';
import { PAGE_READ_BYTES } from './readBudget';
import {
  canonicalCard,
  contentOf,
  fail,
  matchesFilters,
  normalizeContent,
  normalizeFilters,
  type AlphabetContent,
  type AlphabetCreateInput,
  type AlphabetPatch,
  type AlphabetSearch,
} from '../../shared/alphabetContent';
export * from '../../shared/alphabetContent';

export async function requireOwner(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail('UNAUTHENTICATED', 'Entre na sua conta para continuar.');
  const owner = await ctx.db
    .query('users')
    .withIndex('by_tokenIdentifier', (q) =>
      q.eq('tokenIdentifier', identity.tokenIdentifier),
    )
    .unique();
  if (!owner) fail('UNAUTHENTICATED', 'Aguarde a preparação da sua conta.');
  return owner._id;
}

export async function getForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'alphabetCards'>,
) {
  const card = await ctx.db.get('alphabetCards', id);
  return card?.ownerId === ownerId ? canonicalCard(card) : null;
}

/** Persist the projected version before a new session records its snapshot. */
export async function canonicalizeForSnapshot(
  ctx: MutationCtx,
  card: Doc<'alphabetCards'>,
) {
  const canonical = canonicalCard(card);
  if (canonical.contentVersion !== card.contentVersion) {
    const updatedAt = Date.now();
    await ctx.db.patch('alphabetCards', card._id, {
      front: canonical.front,
      back: canonical.back,
      cardOrderKey: cardOrderKey(canonical),
      contentVersion: canonical.contentVersion,
      updatedAt,
    });
    return { ...canonical, updatedAt };
  }
  return canonical;
}

export async function requireCard(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'alphabetCards'>,
) {
  const card = await getForOwner(ctx, ownerId, id);
  if (!card) fail('UNAVAILABLE', 'Card indisponível.');
  return card;
}

async function ensureUnique(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  content: AlphabetContent,
  currentId?: Id<'alphabetCards'>,
) {
  const exact = await ctx.db
    .query('alphabetCards')
    .withIndex('by_ownerId_and_language_and_writingSystem_and_symbol', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('language', content.language)
        .eq('writingSystem', content.writingSystem)
        .eq('symbol', content.symbol),
    )
    .unique();
  // A regional tag may describe the content, but does not make the same
  // Japanese kanji a second personal card. The range includes ja and ja-*
  // while excluding distinct primary language tags such as jav.
  const japaneseVariants =
    content.details.kind === 'kanji'
      ? await ctx.db
          .query('alphabetCards')
          .withIndex(
            'by_ownerId_and_writingSystem_and_symbol_and_language',
            (q) =>
              q
                .eq('ownerId', ownerId)
                .eq('writingSystem', content.writingSystem)
                .eq('symbol', content.symbol)
                .gte('language', 'ja')
                .lt('language', 'ja.'),
          )
          .take(2)
      : [];
  const existing = [exact, ...japaneseVariants].find(
    (card) => card !== null && card._id !== currentId,
  );
  if (existing) {
    fail(
      'CONFLICT',
      existing.archived
        ? 'Este símbolo já existe nos arquivados. Restaure o card existente.'
        : 'Este símbolo já está no seu alfabeto.',
    );
  }
}

export async function createForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  input: AlphabetCreateInput,
  createdAt?: number,
) {
  const content = normalizeContent(input);
  await ensureUnique(ctx, ownerId, content);
  const now = Date.now();
  const id = await ctx.db.insert('alphabetCards', {
    ...content,
    readingSortKey: libraryReadingSortKey(content.sortKey, content.language),
    cardOrderKey: cardOrderKey(content),
    ownerId,
    archived: false,
    contentVersion: 1,
    createdAt: creationTimestamp(createdAt, now),
    updatedAt: now,
  });
  return await requireCard(ctx, ownerId, id);
}

export async function updateForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'alphabetCards'>,
  patch: AlphabetPatch,
) {
  const previous = await ctx.db.get('alphabetCards', id);
  if (!previous || previous.ownerId !== ownerId)
    fail('UNAVAILABLE', 'Card indisponível.');
  const canonicalPrevious = canonicalCard(previous);
  const supplied = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  const content = normalizeContent({ ...contentOf(previous), ...supplied });
  await ensureUnique(ctx, ownerId, content, id);
  const changed =
    JSON.stringify(normalizeContent(canonicalPrevious)) !==
    JSON.stringify(content);
  const readingSortKey = libraryReadingSortKey(
    content.sortKey,
    content.language,
  );
  if (changed || canonicalPrevious.contentVersion !== previous.contentVersion) {
    await ctx.db.patch('alphabetCards', id, {
      ...content,
      readingSortKey,
      cardOrderKey: cardOrderKey(content),
      contentVersion: canonicalPrevious.contentVersion + (changed ? 1 : 0),
      updatedAt: Date.now(),
    });
  } else if (
    previous.readingSortKey !== readingSortKey ||
    previous.cardOrderKey !== cardOrderKey(content) ||
    previous.sortKey !== content.sortKey
  ) {
    await ctx.db.patch('alphabetCards', id, {
      readingSortKey,
      cardOrderKey: cardOrderKey(content),
      sortKey: content.sortKey,
    });
  }
  return await requireCard(ctx, ownerId, id);
}

export async function setArchivedForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'alphabetCards'>,
  archived: boolean,
) {
  const card = await requireCard(ctx, ownerId, id);
  if (card.archived !== archived)
    await ctx.db.patch('alphabetCards', id, {
      archived,
      updatedAt: Date.now(),
    });
  return await requireCard(ctx, ownerId, id);
}

export async function searchForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  args: AlphabetSearch,
) {
  if (
    !Number.isInteger(args.paginationOpts.numItems) ||
    args.paginationOpts.numItems < 1 ||
    args.paginationOpts.numItems > 100
  ) {
    fail('VALIDATION', 'Tamanho da página deve estar entre 1 e 100.');
  }
  const filters = normalizeFilters(args);
  const result = await ctx.db
    .query('alphabetCards')
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
