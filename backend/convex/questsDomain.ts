import type { PaginationOptions } from 'convex/server';
import { getDocumentSize } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { fail } from './alphabetDomain';
import { getStudyCard, type StudyCardId } from './studyCards';
import { ReadBudget, LIBRARY_READ_BYTES, PAGE_READ_BYTES } from './readBudget';
import type { QuestCreateInput } from './questsValidators';
import {
  applyQuestCredit,
  canCreditQuest,
  QUEST_BATCH_CARDS,
  remainingQuestCardIds,
  type QuestActivity,
  type QuestSnapshot,
} from '../../shared/quests';

type Context = QueryCtx | MutationCtx;
const DAY = 86_400_000;
export const QUEST_LIMITS = {
  days: 90,
  futureDays: 365,
  snapshot: 200,
  recentDays: 2,
  payloadBytes: 700_000,
} as const;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function normalize(input: QuestCreateInput) {
  const title = input.title.trim();
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(input.clientKey))
    fail('VALIDATION', 'Use uma chave de criação de 8 a 128 caracteres.');
  if (!title || title.length > 160)
    fail('VALIDATION', 'Informe um título de até 160 caracteres.');
  if (
    !Number.isSafeInteger(input.startsAt) ||
    !Number.isSafeInteger(input.dueAt) ||
    input.startsAt < 0 ||
    input.dueAt <= input.startsAt ||
    input.dueAt - input.startsAt > QUEST_LIMITS.days * DAY
  )
    fail('VALIDATION', 'A quest precisa de uma janela válida de até 90 dias.');
  try {
    if (
      input.timeZone !== 'UTC' &&
      !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(input.timeZone)
    )
      throw new Error('timezone');
    new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone }).format(0);
  } catch {
    fail('VALIDATION', 'Informe um fuso IANA válido, como America/Sao_Paulo.');
  }
  const cardIds = input.cardIds ?? [],
    paperIds = input.paperIds ?? [],
    storyIds = input.storyIds ?? [];
  if (!cardIds.length && !paperIds.length && !storyIds.length)
    fail(
      'VALIDATION',
      'Escolha pelo menos um card, simulado ou história para a quest.',
    );
  if (
    new Set([...cardIds, ...paperIds, ...storyIds]).size !==
    cardIds.length + paperIds.length + storyIds.length
  )
    fail(
      'VALIDATION',
      'Cada card, simulado e história deve aparecer uma única vez na quest.',
    );
  const normalized = { ...input, title, cardIds, paperIds, storyIds };
  if (
    new TextEncoder().encode(canonical(normalized)).byteLength >
    QUEST_LIMITS.payloadBytes
  )
    fail(
      'VALIDATION',
      'A seleção excede o tamanho técnico de um pedido. Divida-a em outras quests.',
    );
  return normalized;
}
export function questSnapshot(quest: Doc<'quests'>): QuestSnapshot {
  return {
    id: quest._id,
    title: quest.title,
    startsAt: quest.startsAt,
    dueAt: quest.dueAt,
    timeZone: quest.timeZone,
    createdAt: quest.createdAt,
    updatedAt: quest.updatedAt,
    ...(quest.cancelledAt !== undefined
      ? { cancelledAt: quest.cancelledAt }
      : {}),
    ...(quest.completedAt !== undefined
      ? { completedAt: quest.completedAt }
      : {}),
    cardIds: quest.cardIds,
    paperIds: quest.paperIds,
    storyIds: quest.storyIds ?? [],
    completedCardIds: quest.completedCardIds,
    completedPaperIds: quest.completedPaperIds,
    completedStoryIds: quest.completedStoryIds ?? [],
  };
}
export async function getForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
  id: Id<'quests'>,
) {
  const quest = await ctx.db.get('quests', id);
  return quest?.ownerId === ownerId ? questSnapshot(quest) : null;
}
export async function requireQuestForPractice(
  ctx: Context,
  ownerId: Id<'users'>,
  reference: string,
  occurredAt: number,
  replay = false,
) {
  const id = ctx.db.normalizeId('quests', reference);
  const quest = id ? await ctx.db.get('quests', id) : null;
  if (!quest || quest.ownerId !== ownerId)
    fail('UNAVAILABLE', 'Quest indisponível.');
  if (
    !Number.isSafeInteger(occurredAt) ||
    occurredAt < Math.max(quest.createdAt, quest.startsAt) ||
    occurredAt >= quest.dueAt
  )
    fail('VALIDATION', 'Esta quest está fora do período de prática.');
  if (
    quest.cancelledAt !== undefined &&
    (!replay || occurredAt >= quest.cancelledAt)
  )
    fail('CONFLICT', 'Esta quest foi cancelada.');
  if (quest.completedAt !== undefined && !replay)
    fail('CONFLICT', 'Esta quest já foi concluída.');
  return quest;
}
export async function requireQuestCard(
  ctx: Context,
  ownerId: Id<'users'>,
  reference: string,
) {
  const id =
    ctx.db.normalizeId('alphabetCards', reference) ??
    ctx.db.normalizeId('vocabularyCards', reference) ??
    ctx.db.normalizeId('grammarCards', reference);
  const card = id ? await getStudyCard(ctx, id) : null;
  if (!card || card.ownerId !== ownerId || card.archived || 'prompt' in card)
    fail(
      'UNAVAILABLE',
      'Um card selecionado para a quest está indisponível ou arquivado. Nenhum item foi substituído.',
    );
  return card;
}
export async function requireQuestStory(
  ctx: Context,
  ownerId: Id<'users'>,
  reference: string,
) {
  const id = ctx.db.normalizeId('stories', reference);
  const story = id ? await ctx.db.get('stories', id) : null;
  if (!story || story.ownerId !== ownerId || story.archived)
    fail(
      'UNAVAILABLE',
      'Uma história selecionada para a quest está indisponível ou arquivada. Nenhum item foi substituído.',
    );
  return story;
}
/** Download a complete bounded cache, never a silently truncated target set. */
export async function snapshotForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
): Promise<QuestSnapshot[]> {
  const cutoff = Date.now() - QUEST_LIMITS.recentDays * DAY;
  const due = await ctx.db
    .query('quests')
    .withIndex('by_ownerId_and_dueAt', (q) =>
      q.eq('ownerId', ownerId).gte('dueAt', cutoff),
    )
    .take(QUEST_LIMITS.snapshot + 1);
  const completed = await ctx.db
    .query('quests')
    .withIndex('by_ownerId_and_completedAt', (q) =>
      q.eq('ownerId', ownerId).gte('completedAt', cutoff),
    )
    .take(QUEST_LIMITS.snapshot + 1);
  const quests = [
    ...new Map(
      [...due, ...completed].map((quest) => [quest._id, quest]),
    ).values(),
  ];
  if (quests.length > QUEST_LIMITS.snapshot)
    fail(
      'VALIDATION',
      'Há mais de 200 quests no período de sincronização. Consulte o histórico paginado; o cache anterior foi preservado.',
    );
  const snapshots = quests.map(questSnapshot);
  if (
    new TextEncoder().encode(JSON.stringify(snapshots)).byteLength >
    PAGE_READ_BYTES
  )
    fail(
      'VALIDATION',
      'As seleções de quests excedem o tamanho do cache. Consulte o histórico paginado; o cache anterior foi preservado.',
    );
  return snapshots;
}
export async function snapshotPageForOwner(ctx: Context, ownerId: Id<'users'>) {
  const quests = await snapshotForOwner(ctx, ownerId);
  const included = new Set(quests.map((quest) => quest.id));
  const older = await ctx.db
    .query('quests')
    .withIndex('by_ownerId_and_dueAt', (q) =>
      q
        .eq('ownerId', ownerId)
        .lt('dueAt', Date.now() - QUEST_LIMITS.recentDays * DAY),
    )
    .take(QUEST_LIMITS.snapshot + 1);
  return {
    quests,
    hasMoreHistory: older.some((quest) => !included.has(quest._id)),
  };
}
export async function listForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
  args: {
    paginationOpts: PaginationOptions;
    status?: 'all' | 'open' | 'completed' | 'cancelled';
  },
) {
  if (
    !Number.isSafeInteger(args.paginationOpts.numItems) ||
    args.paginationOpts.numItems < 1 ||
    args.paginationOpts.numItems > 50
  )
    fail('VALIDATION', 'Consulte de 1 a 50 quests por página.');
  const status = args.status;
  const query =
    status && status !== 'all'
      ? ctx.db
          .query('quests')
          .withIndex('by_ownerId_and_status_and_createdAt', (q) =>
            q.eq('ownerId', ownerId).eq('status', status),
          )
      : ctx.db
          .query('quests')
          .withIndex('by_ownerId_and_createdAt', (q) =>
            q.eq('ownerId', ownerId),
          );
  const result = await query
    .order('desc')
    .paginate({ ...args.paginationOpts, maximumBytesRead: PAGE_READ_BYTES });
  return { ...result, page: result.page.map(questSnapshot) };
}
export async function createForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  input: QuestCreateInput,
): Promise<QuestSnapshot> {
  const normalized = normalize(input);
  const request = canonical(normalized);
  const existing = await ctx.db
    .query('quests')
    .withIndex('by_ownerId_and_clientKey', (q) =>
      q.eq('ownerId', ownerId).eq('clientKey', normalized.clientKey),
    )
    .unique();
  if (existing) {
    const original = canonical({
      clientKey: existing.clientKey,
      title: existing.title,
      startsAt: existing.startsAt,
      dueAt: existing.dueAt,
      timeZone: existing.timeZone,
      cardIds: existing.cardIds,
      paperIds: existing.paperIds,
      storyIds: existing.storyIds ?? [],
    });
    if (original !== request)
      fail(
        'CONFLICT',
        'Esta chave de criação já foi usada com outro conteúdo.',
      );
    return questSnapshot(existing);
  }
  const now = Date.now();
  if (
    normalized.dueAt <= now ||
    normalized.startsAt > now + QUEST_LIMITS.futureDays * DAY
  )
    fail(
      'VALIDATION',
      'O prazo deve estar no futuro e a quest deve começar em até 365 dias.',
    );
  const budget = new ReadBudget(
    LIBRARY_READ_BYTES,
    'Os textos selecionados excedem o limite técnico de validação. Divida a seleção em outras quests.',
  );
  for (const reference of normalized.cardIds)
    budget.consume(await requireQuestCard(ctx, ownerId, reference));
  for (const reference of normalized.paperIds) {
    const id = ctx.db.normalizeId('jlptPapers', reference);
    const paper = id ? await ctx.db.get('jlptPapers', id) : null;
    if (!paper || paper.ownerId !== ownerId || paper.archived)
      fail(
        'UNAVAILABLE',
        'Um simulado selecionado não está disponível nesta conta.',
      );
    budget.consume(paper);
  }
  // Reserve document space for eventual completion of every target as well.
  for (const reference of normalized.storyIds)
    budget.consume(await requireQuestStory(ctx, ownerId, reference));
  if (
    getDocumentSize({
      ...normalized,
      ownerId,
      completedCardIds: normalized.cardIds,
      completedPaperIds: normalized.paperIds,
      completedStoryIds: normalized.storyIds,
    }) > 900_000
  )
    fail(
      'VALIDATION',
      'A seleção excede o tamanho técnico de uma quest concluída. Divida-a em outras quests.',
    );
  const id = await ctx.db.insert('quests', {
    ...normalized,
    ownerId,
    createdAt: now,
    updatedAt: now,
    completedCardIds: [],
    completedPaperIds: [],
    completedStoryIds: [],
    status: 'open',
  });
  return (await getForOwner(ctx, ownerId, id))!;
}
export async function cancelForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'quests'>,
): Promise<QuestSnapshot> {
  const previous = await getForOwner(ctx, ownerId, id);
  if (!previous) fail('UNAVAILABLE', 'Quest indisponível.');
  if (previous.cancelledAt !== undefined || previous.completedAt !== undefined)
    return previous;
  const now = Date.now();
  await ctx.db.patch('quests', id, {
    cancelledAt: now,
    updatedAt: Math.max(now, previous.updatedAt),
    status: 'cancelled',
  });
  return (await getForOwner(ctx, ownerId, id))!;
}
async function saveProgress(
  ctx: MutationCtx,
  id: Id<'quests'>,
  next: QuestSnapshot,
) {
  await ctx.db.patch('quests', id, {
    completedCardIds: next.completedCardIds,
    completedPaperIds: next.completedPaperIds,
    completedStoryIds: next.completedStoryIds ?? [],
    updatedAt: next.updatedAt,
    ...(next.completedAt !== undefined
      ? { completedAt: next.completedAt, status: 'completed' as const }
      : {}),
  });
}
export async function creditForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  activity: QuestActivity,
): Promise<QuestSnapshot[]> {
  const id = ctx.db.normalizeId('quests', activity.questId);
  const quest = id ? await ctx.db.get('quests', id) : null;
  if (!quest || quest.ownerId !== ownerId) return [];
  const snapshot = questSnapshot(quest);
  if (!canCreditQuest(snapshot, activity)) return [snapshot];
  const previous = await ctx.db
    .query('questContributions')
    .withIndex('by_questId_and_kind_and_sourceId', (q) =>
      q
        .eq('questId', quest._id)
        .eq('kind', activity.kind)
        .eq('sourceId', activity.sourceId),
    )
    .unique();
  if (previous) return [snapshot];
  await ctx.db.insert('questContributions', {
    ownerId,
    questId: quest._id,
    kind: activity.kind,
    sourceId: activity.sourceId,
    occurredAt: activity.occurredAt,
    targetId:
      activity.kind === 'study'
        ? activity.cardId
        : activity.kind === 'shiken'
          ? activity.paperId
          : activity.storyId,
  });
  const next = applyQuestCredit(snapshot, activity);
  if (next.completedAt !== undefined) {
    const latest = await ctx.db
      .query('questContributions')
      .withIndex('by_questId_and_occurredAt', (q) => q.eq('questId', quest._id))
      .order('desc')
      .first();
    next.completedAt = Math.max(next.completedAt, latest?.occurredAt ?? 0);
  }
  await saveProgress(ctx, quest._id, next);
  return [next];
}
export async function undoStudyForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  presentationId: string,
  occurredAt: number,
): Promise<QuestSnapshot[]> {
  const contributions = await ctx.db
    .query('questContributions')
    .withIndex('by_ownerId_and_kind_and_sourceId', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('kind', 'study')
        .eq('sourceId', presentationId),
    )
    .collect();
  const changed: QuestSnapshot[] = [];
  for (const contribution of contributions) {
    const quest = await ctx.db.get('quests', contribution.questId);
    await ctx.db.delete('questContributions', contribution._id);
    if (!quest || quest.ownerId !== ownerId) continue;
    const other = await ctx.db
      .query('questContributions')
      .withIndex('by_questId_and_kind_and_targetId', (q) =>
        q
          .eq('questId', quest._id)
          .eq('kind', 'study')
          .eq('targetId', contribution.targetId),
      )
      .first();
    const snapshot = questSnapshot(quest);
    const next = other
      ? snapshot
      : applyQuestCredit(
          snapshot,
          {
            kind: 'study',
            questId: quest._id,
            cardId: contribution.targetId,
            sourceId: presentationId,
            occurredAt,
          },
          -1,
        );
    await saveProgress(ctx, quest._id, next);
    changed.push(next);
  }
  return changed;
}
export async function refreshSnapshotsForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
  snapshots: readonly QuestSnapshot[],
): Promise<QuestSnapshot[]> {
  const result: QuestSnapshot[] = [];
  for (const snapshot of snapshots) {
    const id = ctx.db.normalizeId('quests', snapshot.id);
    const current = id ? await getForOwner(ctx, ownerId, id) : null;
    if (current) result.push(current);
  }
  return result;
}
/** A byte-sized batch must still be an exact prefix of the unfinished selection. */
export function validateQuestStudyQueue(
  quest: Doc<'quests'>,
  cardIds: readonly StudyCardId[],
) {
  const remaining = remainingQuestCardIds(questSnapshot(quest));
  if (
    !cardIds.length ||
    cardIds.length > QUEST_BATCH_CARDS ||
    cardIds.some((id, index) => id !== remaining[index])
  )
    fail(
      'CONFLICT',
      'A seleção restante da quest mudou. Atualize a quest antes de continuar; nenhum card foi substituído.',
    );
}
