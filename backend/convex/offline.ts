import { getDocumentSize, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import {
  PAGE_READ_BYTES,
  SESSION_READ_BYTES,
  ReadBudget,
  readWithinBudget,
} from './readBudget';
import type { Doc, Id, TableNames } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import * as alphabet from './alphabetDomain';
import * as vocabulary from './vocabularyDomain';
import * as grammar from './grammarDomain';
import * as exam from './examDomain';
import * as jlpt from './jlptDomain';
import {
  getForOwner as getQuestForOwner,
  refreshSnapshotsForOwner,
  snapshotPageForOwner,
  requireQuestForPractice,
  validateQuestStudyQueue,
} from './questsDomain';
import type { QuestSnapshot } from '../../shared/quests';
import type { StoryProgress, StoryRecord } from '../../shared/stories';
import * as stories from './storiesDomain';
import { fail, requireOwner } from './alphabetDomain';
import { normalizeStudyFilters, requireStudyCard } from './studyCards';
import {
  finishForOwner,
  createQuestSessionForOwner,
  ownedSession,
  rateForOwner,
  revealForOwner,
  sessionCardProjection,
  undoForOwner,
} from './study';
import {
  offlineCommandValidator,
  type OfflineCommand,
} from './offlineValidators';

type Card =
  | Doc<'alphabetCards'>
  | Doc<'vocabularyCards'>
  | Doc<'grammarCards'>
  | Doc<'examCards'>;
type Mapping = { localId: string; serverId: string };
export type OfflineResult = {
  mappings: Mapping[];
  storyProgress?: StoryProgress;
  story?: StoryRecord;
  quests?: QuestSnapshot[];
  card?: Card;
  paper?: Doc<'jlptPapers'>;
  attempt?: Doc<'jlptAttempts'>;
  session?: Doc<'studySessions'>;
  projection?: Awaited<ReturnType<typeof sessionCardProjection>>;
};

// Receipts compare the original command, never a client's later remapped copy.
// Canonical object order makes retry equivalence independent of JS key order.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function localReference(value: string) {
  if (!/^local:[A-Za-z0-9_-]{8,160}$/.test(value))
    fail('VALIDATION', 'Identificador local inválido.');
}

function timestamp(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > Date.now() + 300_000)
    fail(
      'VALIDATION',
      'A data desta ação é inválida. Confira o relógio do aparelho.',
    );
  return value;
}

async function alias(ctx: MutationCtx, ownerId: Id<'users'>, localId: string) {
  return ctx.db
    .query('offlineAliases')
    .withIndex('by_ownerId_and_localId', (q) =>
      q.eq('ownerId', ownerId).eq('localId', localId),
    )
    .unique();
}

async function addAlias(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  localId: string,
  serverId: string,
) {
  localReference(localId);
  if (await alias(ctx, ownerId, localId))
    fail('CONFLICT', 'Este identificador local já foi sincronizado.');
  await ctx.db.insert('offlineAliases', { ownerId, localId, serverId });
  return { localId, serverId };
}

async function resolve<T extends TableNames>(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  table: T,
  reference: string,
): Promise<Id<T>> {
  const value = reference.startsWith('local:')
    ? (await alias(ctx, ownerId, reference))?.serverId
    : reference;
  const id = value ? ctx.db.normalizeId(table, value) : null;
  if (!id)
    fail(
      'UNAVAILABLE',
      'Este item ainda não está disponível para sincronizar.',
    );
  return id;
}

async function cardReference(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  reference: string,
) {
  const value = reference.startsWith('local:')
    ? (await alias(ctx, ownerId, reference))?.serverId
    : reference;
  const id =
    value &&
    (ctx.db.normalizeId('alphabetCards', value) ??
      ctx.db.normalizeId('vocabularyCards', value) ??
      ctx.db.normalizeId('grammarCards', value) ??
      ctx.db.normalizeId('examCards', value));
  if (!id) fail('UNAVAILABLE', 'Card indisponível para sincronizar.');
  return requireStudyCard(ctx, ownerId, id);
}

function checkVersion(
  card: { contentVersion: number; archived: boolean },
  command: {
    expectedContentVersion: number;
    expectedArchived: boolean;
    force?: boolean;
  },
) {
  if (
    !Number.isSafeInteger(command.expectedContentVersion) ||
    command.expectedContentVersion < 1
  )
    fail('VALIDATION', 'A versão do card é inválida.');
  if (
    !command.force &&
    (card.contentVersion !== command.expectedContentVersion ||
      card.archived !== command.expectedArchived)
  )
    fail(
      'CONFLICT',
      'Este card mudou em outro aparelho. Escolha qual versão deseja manter.',
    );
}

async function applyCard(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  command: Extract<
    OfflineCommand,
    { type: 'card.create' | 'card.update' | 'card.archive' }
  >,
): Promise<OfflineResult> {
  if (command.type === 'card.create') {
    localReference(command.localId);
    if (await alias(ctx, ownerId, command.localId))
      fail('CONFLICT', 'Este card local já foi sincronizado.');
    const card =
      command.category === 'alphabet'
        ? await alphabet.createForOwner(
            ctx,
            ownerId,
            command.card,
            command.createdAt,
          )
        : command.category === 'vocabulary'
          ? await vocabulary.createForOwner(
              ctx,
              ownerId,
              command.card,
              command.createdAt,
            )
          : command.category === 'grammar'
            ? await grammar.createForOwner(
                ctx,
                ownerId,
                command.card,
                command.createdAt,
              )
            : await exam.createForOwner(ctx, ownerId, command.card);
    return {
      card,
      mappings: [await addAlias(ctx, ownerId, command.localId, card._id)],
    };
  }
  const previous = await cardReference(ctx, ownerId, command.id);
  checkVersion(previous, command);
  let card: Card;
  if (command.category === 'alphabet') {
    const id = await resolve(ctx, ownerId, 'alphabetCards', command.id);
    card =
      command.type === 'card.update'
        ? await alphabet.updateForOwner(ctx, ownerId, id, command.patch)
        : await alphabet.setArchivedForOwner(
            ctx,
            ownerId,
            id,
            command.archived,
          );
  } else if (command.category === 'vocabulary') {
    const id = await resolve(ctx, ownerId, 'vocabularyCards', command.id);
    card =
      command.type === 'card.update'
        ? await vocabulary.updateForOwner(ctx, ownerId, id, command.patch)
        : await vocabulary.setArchivedForOwner(
            ctx,
            ownerId,
            id,
            command.archived,
          );
  } else if (command.category === 'grammar') {
    const id = await resolve(ctx, ownerId, 'grammarCards', command.id);
    card =
      command.type === 'card.update'
        ? await grammar.updateForOwner(ctx, ownerId, id, command.patch)
        : await grammar.setArchivedForOwner(ctx, ownerId, id, command.archived);
  } else {
    const id = await resolve(ctx, ownerId, 'examCards', command.id);
    card =
      command.type === 'card.update'
        ? await exam.updateForOwner(ctx, ownerId, id, command.patch)
        : await exam.setArchivedForOwner(ctx, ownerId, id, command.archived);
  }
  return { card, mappings: [] };
}

async function startStudy(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  command: Extract<OfflineCommand, { type: 'study.start' }>,
): Promise<OfflineResult> {
  localReference(command.localId);
  const now = timestamp(command.createdAt);
  const quest = command.questId
    ? await requireQuestForPractice(ctx, ownerId, command.questId, now, true)
    : null;
  if (
    quest &&
    (command.mode !== 'direct' ||
      command.order !== 'sorted' ||
      Object.keys(command.filters).length)
  )
    fail(
      'VALIDATION',
      'A sessão da quest usa somente a seleção exata de cards.',
    );
  if (!command.queue.length || command.queue.length > 100)
    fail('VALIDATION', 'Escolha entre 1 e 100 cards por sessão.');
  if (
    new Set([command.localId, ...command.queue.map((item) => item.localId)])
      .size !==
    command.queue.length + 1
  )
    fail('VALIDATION', 'Identificadores locais repetidos na sessão.');
  const active = await ctx.db
    .query('studySessions')
    .withIndex('by_ownerId_and_status', (q) =>
      q.eq('ownerId', ownerId).eq('status', 'active'),
    )
    .unique();
  if (active && !command.force && (!quest || active.questId === quest._id))
    fail(
      'CONFLICT',
      'Uma sessão foi iniciada em outro aparelho. Escolha qual sessão continuar.',
    );
  const selected = [];
  const cardIds = new Set<string>();
  for (const item of command.queue) {
    localReference(item.localId);
    const card = await cardReference(ctx, ownerId, item.cardId);
    if (card.archived)
      fail(
        'CONFLICT',
        'Um card desta sessão foi arquivado em outro aparelho. Restaure o card para sincronizar esta sessão.',
      );
    if (quest && 'prompt' in card)
      fail(
        'VALIDATION',
        'As questões Shiken não pertencem à fila de cards da quest.',
      );
    if (cardIds.has(card._id))
      fail(
        'VALIDATION',
        'Um card não pode aparecer duas vezes na mesma sessão.',
      );
    cardIds.add(card._id);
    const snapshot = item.snapshot;
    if (
      !Number.isSafeInteger(snapshot.contentVersion) ||
      snapshot.contentVersion < 1
    )
      fail('VALIDATION', 'A versão do card é inválida.');
    if ('prompt' in card) {
      if (!('category' in snapshot) || snapshot.category !== 'exam')
        fail('VALIDATION', 'Categoria do card incompatível.');
      const canonical = exam.normalizeContent(snapshot);
      if (
        snapshot.front !== canonical.front ||
        snapshot.back !== canonical.back
      )
        fail(
          'VALIDATION',
          'A frente e o verso da questão não correspondem ao conteúdo.',
        );
    } else if ('title' in card) {
      if (!('category' in snapshot) || snapshot.category !== 'grammar')
        fail('VALIDATION', 'Categoria do card incompatível.');
      grammar.normalizeContent(snapshot);
    } else if ('expression' in card) {
      if (!('category' in snapshot) || snapshot.category !== 'vocabulary')
        fail('VALIDATION', 'Categoria do card incompatível.');
      // Older APKs copied the reading but omitted readingOmitted when freezing
      // a downloaded vocabulary card. Accept those already-studied snapshots
      // without relaxing the explicit opt-out required by create/update.
      vocabulary.normalizeContent({
        ...snapshot,
        readingOmitted:
          snapshot.readingOmitted ?? snapshot.reading.trim().length === 0,
      });
    } else {
      if ('category' in snapshot)
        fail('VALIDATION', 'Categoria do card incompatível.');
      alphabet.normalizeContent(snapshot);
    }
    // Preserve exactly what was studied, even when remote content has changed.
    selected.push({ ...item, cardId: card._id });
  }
  if (quest)
    validateQuestStudyQueue(
      quest,
      selected.map((item) => item.cardId),
    );
  if (active) await finishForOwner(ctx, ownerId, { sessionId: active._id });
  if (quest) {
    const created = await createQuestSessionForOwner(
      ctx,
      ownerId,
      quest._id,
      selected.map(({ cardId, snapshot }) => ({ cardId, snapshot })),
      now,
    );
    const mappings = [
      await addAlias(ctx, ownerId, command.localId, created.session._id),
    ];
    for (const [index, item] of selected.entries())
      mappings.push(
        await addAlias(
          ctx,
          ownerId,
          item.localId,
          created.presentationIds[index],
        ),
      );
    return { mappings, session: created.session };
  }
  const sessionId = await ctx.db.insert('studySessions', {
    ownerId,
    mode: command.mode,
    order: command.order,
    filters: normalizeStudyFilters(command.filters),
    status: 'active',
    total: selected.length,
    position: 0,
    answered: 0,
    skipped: 0,
    correct: 0,
    partial: 0,
    incorrect: 0,
    createdAt: now,
    offlineQueue: true,
  });
  const mappings = [await addAlias(ctx, ownerId, command.localId, sessionId)];
  for (const [position, item] of selected.entries()) {
    const presentationId = await ctx.db.insert('studyPresentations', {
      ownerId,
      sessionId,
      cardId: item.cardId,
      position,
      snapshot: item.snapshot,
      skipped: false,
      ...(position === 0 ? { presentedAt: now } : {}),
    });
    mappings.push(await addAlias(ctx, ownerId, item.localId, presentationId));
  }
  return { mappings, session: await ownedSession(ctx, ownerId, sessionId) };
}

async function applyCommand(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  command: OfflineCommand,
): Promise<OfflineResult> {
  if (
    command.type === 'story.progress' ||
    command.type === 'story.answer' ||
    command.type === 'story.complete'
  ) {
    const id = ctx.db.normalizeId('stories', command.storyId);
    if (!id) fail('UNAVAILABLE', 'História indisponível.');
    const occurredAt = timestamp(command.occurredAt);
    const action =
      command.type === 'story.progress'
        ? {
            type: 'progress' as const,
            paragraphIndex: command.paragraphIndex,
            occurredAt,
          }
        : command.type === 'story.answer'
          ? {
              type: 'answer' as const,
              questionId: command.questionId,
              optionId: command.optionId,
              occurredAt,
            }
          : { type: 'complete' as const, occurredAt };
    const storyProgress = await stories.progressForAction(
      ctx,
      ownerId,
      id,
      {
        ...action,
        contentVersion: command.contentVersion,
        questId: command.questId,
      },
      true,
    );
    const saved = await stories.getForOwner(ctx, ownerId, id, command.questId);
    const questId = command.questId
      ? ctx.db.normalizeId('quests', command.questId)
      : null;
    const quest = questId
      ? await getQuestForOwner(ctx, ownerId, questId)
      : null;
    return {
      mappings: [],
      storyProgress,
      story: saved!.story,
      ...(quest ? { quests: [quest] } : {}),
    };
  }
  if (
    command.type === 'jlpt.create' ||
    command.type === 'jlpt.update' ||
    command.type === 'jlpt.archive' ||
    command.type === 'jlpt.start' ||
    command.type === 'jlpt.answer' ||
    command.type === 'jlpt.advance' ||
    command.type === 'jlpt.finish'
  )
    return applyJlpt(ctx, ownerId, command);
  if (
    command.type === 'card.create' ||
    command.type === 'card.update' ||
    command.type === 'card.archive'
  )
    return applyCard(ctx, ownerId, command);
  if (command.type === 'study.start') return startStudy(ctx, ownerId, command);
  const sessionId = await resolve(
    ctx,
    ownerId,
    'studySessions',
    command.sessionId,
  );
  const session = await ownedSession(ctx, ownerId, sessionId);
  const occurredAt = timestamp(command.occurredAt);
  if (occurredAt < session.createdAt)
    fail('VALIDATION', 'A data da resposta é anterior à sessão.');
  if (command.type === 'study.finish') {
    if (
      command.expectedRevision !== undefined &&
      (session.revision ?? 0) !== command.expectedRevision
    )
      fail('CONFLICT', 'A sessão mudou em outro aparelho.');
    return {
      mappings: [],
      session: await finishForOwner(ctx, ownerId, { sessionId, occurredAt }),
    };
  }
  if (
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0
  )
    fail('VALIDATION', 'A revisão da sessão é inválida.');
  const presentationId = await resolve(
    ctx,
    ownerId,
    'studyPresentations',
    command.presentationId,
  );
  const args = {
    sessionId,
    presentationId,
    expectedRevision: command.expectedRevision,
    occurredAt,
  };
  const skippedPresentationIds = new Set<Id<'studyPresentations'>>();
  if (command.type === 'study.rate') {
    const skips = command.skippedPresentationIds ?? [];
    if (session.questId && skips.length)
      fail('VALIDATION', 'Não é possível pular itens da seleção da quest.');
    if (skips.length > 99)
      fail('VALIDATION', 'A fila de cards ignorados é inválida.');
    const current = await ctx.db.get('studyPresentations', presentationId);
    if (
      !current ||
      current.ownerId !== ownerId ||
      current.sessionId !== sessionId
    )
      fail('UNAVAILABLE', 'Card da sessão indisponível.');
    for (const [offset, reference] of skips.entries()) {
      const skippedId = await resolve(
        ctx,
        ownerId,
        'studyPresentations',
        reference,
      );
      const skipped = await ctx.db.get('studyPresentations', skippedId);
      if (
        !skipped ||
        skipped.ownerId !== ownerId ||
        skipped.sessionId !== sessionId
      )
        fail('UNAVAILABLE', 'Card da sessão indisponível.');
      if (
        skipped.position !== current.position + offset + 1 ||
        skipped.presentedAt !== undefined ||
        skipped.rating !== undefined ||
        skipped.skipped
      )
        fail(
          'CONFLICT',
          'A sequência de cards ignorados mudou. Abra novamente a sessão.',
        );
      skippedPresentationIds.add(skippedId);
    }
  }
  // A downloaded online session becomes a frozen offline queue when replayed.
  // Its following presentations must not disappear before their queued answers.
  if (!session.offlineQueue)
    await ctx.db.patch('studySessions', sessionId, { offlineQueue: true });
  const quests: QuestSnapshot[] = [];
  const projection =
    command.type === 'study.reveal'
      ? await revealForOwner(ctx, ownerId, args)
      : command.type === 'study.rate'
        ? await rateForOwner(
            ctx,
            ownerId,
            {
              ...args,
              rating: command.rating,
              skippedPresentationIds,
            },
            quests,
          )
        : await undoForOwner(ctx, ownerId, args, quests);
  // A retry can return early from rate/undo without changing a contribution.
  // Still reconcile that quest, including remote cancellation or completion.
  if (session.questId && !quests.length) {
    const quest = await getQuestForOwner(ctx, ownerId, session.questId);
    if (quest) quests.push(quest);
  }
  return { mappings: [], projection, quests };
}

async function applyJlpt(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  command: Extract<OfflineCommand, { type: `jlpt.${string}` }>,
): Promise<OfflineResult> {
  if (command.type === 'jlpt.create') {
    localReference(command.localId);
    if (await alias(ctx, ownerId, command.localId))
      fail('CONFLICT', 'Este simulado local já foi sincronizado.');
    const paper = await jlpt.createForOwner(ctx, ownerId, command.paper);
    return {
      paper,
      mappings: [await addAlias(ctx, ownerId, command.localId, paper._id)],
    };
  }
  if (command.type === 'jlpt.update' || command.type === 'jlpt.archive') {
    const id = await resolve(ctx, ownerId, 'jlptPapers', command.id);
    const previous = await jlpt.requirePaper(ctx, ownerId, id);
    checkVersion(previous, command);
    const paper =
      command.type === 'jlpt.update'
        ? await jlpt.updateForOwner(ctx, ownerId, id, command.patch)
        : await jlpt.setArchivedForOwner(ctx, ownerId, id, command.archived);
    return { paper, mappings: [] };
  }
  if (command.type === 'jlpt.start') {
    localReference(command.localId);
    if (await alias(ctx, ownerId, command.localId))
      fail('CONFLICT', 'Esta tentativa local já foi sincronizada.');
    const paperId = await resolve(ctx, ownerId, 'jlptPapers', command.paperId);
    const attempt = await jlpt.startForOwner(ctx, ownerId, paperId, {
      snapshot: command.snapshot,
      startedAt: timestamp(command.startedAt),
      ...(command.questId
        ? {
            questId: (
              await requireQuestForPractice(
                ctx,
                ownerId,
                command.questId,
                timestamp(command.startedAt),
                true,
              )
            )._id,
          }
        : {}),
    });
    return {
      attempt,
      mappings: [await addAlias(ctx, ownerId, command.localId, attempt._id)],
    };
  }
  const id = await resolve(ctx, ownerId, 'jlptAttempts', command.attemptId);
  const occurredAt = timestamp(command.occurredAt);
  const quests: QuestSnapshot[] = [];
  const attempt =
    command.type === 'jlpt.answer'
      ? await jlpt.answerForOwner(
          ctx,
          ownerId,
          id,
          {
            questionId: command.questionId,
            choice: command.choice,
            flagged: command.flagged,
          },
          command.expectedRevision,
          occurredAt,
        )
      : command.type === 'jlpt.advance'
        ? await jlpt.advanceForOwner(
            ctx,
            ownerId,
            id,
            command.expectedRevision,
            occurredAt,
            quests,
          )
        : await jlpt.finishForOwner(
            ctx,
            ownerId,
            id,
            command.expectedRevision,
            occurredAt,
            quests,
          );
  return { attempt, mappings: [], quests };
}

export const apply = mutation({
  args: { operationId: v.string(), command: offlineCommandValidator },
  handler: async (ctx, { operationId, command }): Promise<OfflineResult> => {
    const ownerId = await requireOwner(ctx);
    if (!/^[A-Za-z0-9:_-]{8,200}$/.test(operationId))
      fail('VALIDATION', 'Identificador da ação inválido.');
    const serialized = canonicalJson(command);
    if (new TextEncoder().encode(serialized).byteLength > 700_000)
      fail(
        'VALIDATION',
        'Esta sessão é muito grande para sincronizar. Crie uma sessão com menos cards.',
      );
    const receipt = await ctx.db
      .query('offlineReceipts')
      .withIndex('by_ownerId_and_operationId', (q) =>
        q.eq('ownerId', ownerId).eq('operationId', operationId),
      )
      .unique();
    if (receipt) {
      if (receipt.command !== serialized)
        fail('CONFLICT', 'Esta ação já foi enviada com outro conteúdo.');
      const result = JSON.parse(receipt.result) as OfflineResult;
      if (result.quests)
        result.quests = await refreshSnapshotsForOwner(
          ctx,
          ownerId,
          result.quests,
        );
      if (result.storyProgress) {
        const id = ctx.db.normalizeId('stories', result.storyProgress.storyId);
        const current = id
          ? await stories.getForOwner(
              ctx,
              ownerId,
              id,
              result.storyProgress.questId,
            )
          : null;
        if (current?.progress) {
          result.storyProgress = current.progress;
          result.story = current.story;
        }
      }
      return result;
    }
    const result = await applyCommand(ctx, ownerId, command);
    await ctx.db.insert('offlineReceipts', {
      ownerId,
      operationId,
      command: serialized,
      result: JSON.stringify(result),
      appliedAt: Date.now(),
    });
    return result;
  },
});

export const recentAttempts = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const ownerId = await requireOwner(ctx);
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 100
    )
      fail('VALIDATION', 'Tamanho da página deve estar entre 1 e 100.');
    return ctx.db
      .query('studyAttempts')
      .withIndex('by_ownerId_and_reviewedAt', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .paginate({
        ...paginationOpts,
        maximumBytesRead: PAGE_READ_BYTES,
      });
  },
});

export const state = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const owner = await ctx.db.get('users', ownerId);
    const stats = await ctx.db
      .query('studyStats')
      .withIndex('by_ownerId_and_cardId', (q) => q.eq('ownerId', ownerId))
      .take(1001);
    const attempts: Doc<'studyAttempts'>[] = [];
    let attemptsBytes = 0;
    let attemptsTruncated = false;
    const history = ctx.db
      .query('studyAttempts')
      .withIndex('by_ownerId_and_reviewedAt', (q) => q.eq('ownerId', ownerId))
      .order('desc');
    for await (const attempt of history) {
      attemptsBytes += getDocumentSize(attempt);
      if (attemptsBytes > PAGE_READ_BYTES) {
        attemptsTruncated = true;
        break;
      }
      attempts.push(attempt);
      if (attempts.length === 100) break;
    }
    const totals = await ctx.db
      .query('studyTotals')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
      .unique();
    const active = await ctx.db
      .query('studySessions')
      .withIndex('by_ownerId_and_status', (q) =>
        q.eq('ownerId', ownerId).eq('status', 'active'),
      )
      .unique();
    const session =
      active ??
      (await ctx.db
        .query('studySessions')
        .withIndex('by_ownerId_and_status', (q) =>
          q.eq('ownerId', ownerId).eq('status', 'completed'),
        )
        .order('desc')
        .first());
    const presentations = session
      ? await readWithinBudget(
          ctx.db
            .query('studyPresentations')
            .withIndex('by_sessionId_and_position', (q) =>
              q.eq('sessionId', session._id),
            ),
          100,
          new ReadBudget(
            SESSION_READ_BYTES,
            'Esta sessão antiga é grande demais para baixar de uma vez. Encerre a sessão e inicie outra com menos cards.',
          ),
        )
      : [];
    const quests = await snapshotPageForOwner(ctx, ownerId);
    return {
      owner,
      quests: quests.quests,
      questsHasMoreHistory: quests.hasMoreHistory,
      stats: stats.slice(0, 1000),
      statsTruncated: stats.length > 1000,
      attempts,
      attemptsTruncated,
      totals,
      session,
      presentations,
    };
  },
});
