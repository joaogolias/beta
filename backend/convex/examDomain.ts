import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { libraryReadingSortKey, cardOrderKey } from '../../shared/libraryOrder';
import { libraryOrderIndex, creationTimestamp } from './libraryOrder';
import { fail } from '../../shared/alphabetContent';
import { PAGE_READ_BYTES } from './readBudget';
import {
  canonicalCard,
  contentOf,
  matchesFilters,
  normalizeContent,
  normalizeFilters,
  applyPatch,
  type ExamCreateInput,
  type ExamPatch,
  type ExamSearch,
} from '../../shared/examContent';
export * from '../../shared/examContent';

export async function getForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'examCards'>,
) {
  const card = await ctx.db.get('examCards', id);
  return card?.ownerId === ownerId ? canonicalCard(card) : null;
}

export async function requireCard(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'examCards'>,
) {
  const card = await getForOwner(ctx, ownerId, id);
  if (!card) fail('UNAVAILABLE', 'Card indisponível.');
  return card;
}
export const requireExamCard = requireCard;

export async function createForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  input: ExamCreateInput,
  createdAt?: number,
) {
  const content = normalizeContent(input);
  const now = Date.now();
  const id = await ctx.db.insert('examCards', {
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
  id: Id<'examCards'>,
  patch: ExamPatch,
) {
  const previous = await requireCard(ctx, ownerId, id);
  const content = applyPatch(contentOf(previous), patch);
  const readingSortKey = libraryReadingSortKey(
    content.sortKey,
    content.language,
  );
  if (JSON.stringify(normalizeContent(previous)) !== JSON.stringify(content))
    await ctx.db.patch('examCards', id, {
      ...content,
      examReference: content.examReference,
      year: content.year,
      section: content.section,
      source: content.source,
      readingSortKey,
      cardOrderKey: cardOrderKey(content),
      contentVersion: previous.contentVersion + 1,
      updatedAt: Date.now(),
    });
  else if (
    previous.readingSortKey !== readingSortKey ||
    previous.cardOrderKey !== cardOrderKey(content) ||
    previous.sortKey !== content.sortKey
  )
    await ctx.db.patch('examCards', id, {
      readingSortKey,
      cardOrderKey: cardOrderKey(content),
      sortKey: content.sortKey,
    });
  return requireCard(ctx, ownerId, id);
}

export async function setArchivedForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'examCards'>,
  archived: boolean,
) {
  const card = await requireCard(ctx, ownerId, id);
  if (card.archived !== archived)
    await ctx.db.patch('examCards', id, { archived, updatedAt: Date.now() });
  return requireCard(ctx, ownerId, id);
}

export async function searchForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  args: ExamSearch,
) {
  if (
    !Number.isInteger(args.paginationOpts.numItems) ||
    args.paginationOpts.numItems < 1 ||
    args.paginationOpts.numItems > 100
  )
    fail('VALIDATION', 'Tamanho da página deve estar entre 1 e 100.');
  const filters = normalizeFilters(args);
  const result = await ctx.db
    .query('examCards')
    .withIndex(libraryOrderIndex(), (q) =>
      q.eq('ownerId', ownerId).eq('archived', args.archived ?? false),
    )
    .paginate({
      ...args.paginationOpts,
      maximumBytesRead: PAGE_READ_BYTES,
    });
  return {
    ...result,
    page: result.page
      .map(canonicalCard)
      .filter((card) => matchesFilters(card, filters)),
  };
}
export const listOwnedExam = searchForOwner;
