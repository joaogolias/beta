import type { PaginationOptions } from 'convex/server';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  normalizePaper,
  applyPaperPatch,
  startAttempt,
  answerAttempt,
  advanceAttempt,
  finishAttempt,
  jlptFail,
  type PaperInput,
  type PaperPatch,
  type PaperSnapshot,
  type JlptAnswer,
  type JlptLevel,
} from '../../shared/jlpt';
import { normalizedSearch } from './alphabetDomain';
import { PAGE_READ_BYTES } from './readBudget';
export * from '../../shared/jlpt';

type Context = MutationCtx | QueryCtx;
export async function getForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
  id: Id<'jlptPapers'>,
) {
  const paper = await ctx.db.get('jlptPapers', id);
  return paper?.ownerId === ownerId ? paper : null;
}
export async function requirePaper(
  ctx: Context,
  ownerId: Id<'users'>,
  id: Id<'jlptPapers'>,
) {
  const paper = await getForOwner(ctx, ownerId, id);
  if (!paper) jlptFail('UNAVAILABLE', 'Simulado indisponível.');
  return paper;
}
export async function createForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  input: PaperInput,
) {
  const paper = normalizePaper(input),
    now = Date.now();
  const id = await ctx.db.insert('jlptPapers', {
    ...paper,
    ownerId,
    archived: false,
    contentVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
  return requirePaper(ctx, ownerId, id);
}
export async function updateForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'jlptPapers'>,
  patch: PaperPatch,
  expectedContentVersion?: number,
) {
  const previous = await requirePaper(ctx, ownerId, id);
  if (
    expectedContentVersion !== undefined &&
    expectedContentVersion !== previous.contentVersion
  )
    jlptFail(
      'CONFLICT',
      'Este simulado mudou desde que você abriu a edição. Reabra a versão mais recente antes de salvar.',
    );
  const next = applyPaperPatch(previous, patch);
  if (JSON.stringify(normalizePaper(previous)) !== JSON.stringify(next))
    await ctx.db.patch('jlptPapers', id, {
      ...next,
      description: next.description,
      source: next.source,
      contentVersion: previous.contentVersion + 1,
      updatedAt: Date.now(),
    });
  return requirePaper(ctx, ownerId, id);
}
export async function setArchivedForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'jlptPapers'>,
  archived: boolean,
) {
  const previous = await requirePaper(ctx, ownerId, id);
  if (previous.archived !== archived)
    await ctx.db.patch('jlptPapers', id, { archived, updatedAt: Date.now() });
  return requirePaper(ctx, ownerId, id);
}
export function pageOptions(options: PaginationOptions) {
  if (
    !Number.isInteger(options.numItems) ||
    options.numItems < 1 ||
    options.numItems > 100
  )
    jlptFail('VALIDATION', 'Tamanho da página deve estar entre 1 e 100.');
  return { ...options, maximumBytesRead: PAGE_READ_BYTES };
}
export async function searchForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
  args: {
    level?: JlptLevel;
    query?: string;
    archived?: boolean;
    paginationOpts: PaginationOptions;
  },
) {
  const indexed = args.level
    ? ctx.db
        .query('jlptPapers')
        .withIndex('by_ownerId_and_archived_and_level_and_title', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('archived', args.archived ?? false)
            .eq('level', args.level!),
        )
    : ctx.db
        .query('jlptPapers')
        .withIndex('by_ownerId_and_archived_and_title', (q) =>
          q.eq('ownerId', ownerId).eq('archived', args.archived ?? false),
        );
  const result = await indexed.paginate(pageOptions(args.paginationOpts));
  const terms = normalizedSearch(args.query ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if ((args.query?.length ?? 0) > 300)
    jlptFail('VALIDATION', 'Busca: máximo de 300 caracteres.');
  return {
    ...result,
    page: result.page.filter((paper) =>
      terms.every((term) =>
        normalizedSearch(
          [paper.title, paper.description ?? '', paper.source ?? ''].join(' '),
        ).includes(term),
      ),
    ),
  };
}
export async function getAttemptForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
  id: Id<'jlptAttempts'>,
) {
  const attempt = await ctx.db.get('jlptAttempts', id);
  return attempt?.ownerId === ownerId ? attempt : null;
}
export async function requireAttempt(
  ctx: Context,
  ownerId: Id<'users'>,
  id: Id<'jlptAttempts'>,
) {
  const attempt = await getAttemptForOwner(ctx, ownerId, id);
  if (!attempt) jlptFail('UNAVAILABLE', 'Tentativa indisponível.');
  return attempt;
}
export async function activeForOwner(ctx: Context, ownerId: Id<'users'>) {
  return ctx.db
    .query('jlptAttempts')
    .withIndex('by_ownerId_and_status', (q) =>
      q.eq('ownerId', ownerId).eq('status', 'active'),
    )
    .unique();
}
export async function startForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  paperId: Id<'jlptPapers'>,
  options: { snapshot?: PaperSnapshot; startedAt?: number } = {},
) {
  const paper = await requirePaper(ctx, ownerId, paperId);
  const startedAt = options.startedAt ?? Date.now();
  if (paper.archived && (!options.snapshot || startedAt >= paper.updatedAt))
    jlptFail(
      'CONFLICT',
      'Este simulado está arquivado. Restaure-o antes de iniciar.',
    );
  if (await activeForOwner(ctx, ownerId))
    jlptFail(
      'CONFLICT',
      'Há um simulado em andamento. Termine a tentativa atual antes de iniciar outra.',
    );
  const snapshot = options.snapshot ?? {
    ...normalizePaper(paper),
    contentVersion: paper.contentVersion,
  };
  if (snapshot.contentVersion > paper.contentVersion)
    jlptFail(
      'CONFLICT',
      'A versão deste simulado ainda não está sincronizada.',
    );
  const state = startAttempt(snapshot, startedAt);
  const id = await ctx.db.insert('jlptAttempts', {
    ...state,
    ownerId,
    paperId,
  });
  return requireAttempt(ctx, ownerId, id);
}
export async function answerForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'jlptAttempts'>,
  answer: JlptAnswer,
  expectedRevision: number,
  occurredAt = Date.now(),
) {
  const previous = await requireAttempt(ctx, ownerId, id);
  const next = answerAttempt(previous, answer, occurredAt, expectedRevision);
  await ctx.db.patch('jlptAttempts', id, {
    answers: next.answers,
    revision: next.revision,
    lastActionAt: next.lastActionAt,
  });
  return requireAttempt(ctx, ownerId, id);
}
export async function advanceForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'jlptAttempts'>,
  expectedRevision: number,
  occurredAt = Date.now(),
) {
  const previous = await requireAttempt(ctx, ownerId, id);
  const next = advanceAttempt(previous, occurredAt, expectedRevision);
  await ctx.db.patch('jlptAttempts', id, {
    status: next.status,
    blockIndex: next.blockIndex,
    blockStartedAt: next.blockStartedAt,
    blockDeadlineAt: next.blockDeadlineAt,
    lastActionAt: next.lastActionAt,
    completedAt: next.completedAt,
    revision: next.revision,
  });
  return requireAttempt(ctx, ownerId, id);
}
export async function finishForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'jlptAttempts'>,
  expectedRevision: number,
  occurredAt = Date.now(),
) {
  const previous = await requireAttempt(ctx, ownerId, id);
  const next = finishAttempt(previous, occurredAt, expectedRevision);
  await ctx.db.patch('jlptAttempts', id, {
    status: next.status,
    completedAt: next.completedAt,
    lastActionAt: next.lastActionAt,
    revision: next.revision,
  });
  return requireAttempt(ctx, ownerId, id);
}
export async function historyForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
  args: { paperId?: Id<'jlptPapers'>; paginationOpts: PaginationOptions },
) {
  if (args.paperId) await requirePaper(ctx, ownerId, args.paperId);
  const query = args.paperId
    ? ctx.db
        .query('jlptAttempts')
        .withIndex('by_ownerId_and_paperId_and_startedAt', (q) =>
          q.eq('ownerId', ownerId).eq('paperId', args.paperId!),
        )
    : ctx.db
        .query('jlptAttempts')
        .withIndex('by_ownerId_and_startedAt', (q) => q.eq('ownerId', ownerId));
  return query.order('desc').paginate(pageOptions(args.paginationOpts));
}
