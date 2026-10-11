import type { PaginationOptions } from 'convex/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { fail } from './alphabetDomain';
import { PAGE_READ_BYTES } from './readBudget';
import {
  creditForOwner,
  questSnapshot,
  requireQuestForPractice,
} from './questsDomain';
import type { StoryCreateInput, StoryUpdateInput } from './storiesValidators';
import {
  applyStoryProgress,
  storySummary,
  storyReadingKey,
  type StoryAction,
  type StoryContent,
  type StoryLevel,
  type StoryProgress,
  type StoryRecord,
} from '../../shared/stories';

type Context = QueryCtx | MutationCtx;
export const STORY_LIMITS = {
  contentBytes: 65_536,
  paragraphs: 200,
  segments: 200,
  questions: 30,
  options: 6,
  snapshot: 30,
  continuing: 10,
  snapshotBytes: 2_000_000,
} as const;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function text(value: string, max: number, label: string) {
  if (!value.trim() || value.length > max)
    fail('VALIDATION', `${label}: informe de 1 a ${max} caracteres.`);
}
function identifiers(values: string[], label: string) {
  if (
    values.some((id) => !/^[A-Za-z0-9_-]{1,80}$/.test(id)) ||
    new Set(values).size !== values.length
  )
    fail(
      'VALIDATION',
      `${label}: use identificadores únicos de 1 a 80 letras, números, hífens ou sublinhados.`,
    );
}
export function normalizeStory(input: StoryContent): StoryContent {
  const story = { ...input, title: input.title.trim() };
  text(story.title, 160, 'Título');
  if (!['N5', 'N4', 'N3', 'N2', 'N1'].includes(story.level))
    fail('VALIDATION', 'Informe um nível entre N5 e N1.');
  if (
    !story.paragraphs.length ||
    story.paragraphs.length > STORY_LIMITS.paragraphs
  )
    fail('VALIDATION', 'Use de 1 a 200 parágrafos.');
  identifiers(
    story.paragraphs.map((p) => p.id),
    'Parágrafos',
  );
  for (const paragraph of story.paragraphs) {
    if (
      !paragraph.segments.length ||
      paragraph.segments.length > STORY_LIMITS.segments
    )
      fail('VALIDATION', 'Use de 1 a 200 segmentos por parágrafo.');
    for (const segment of paragraph.segments) {
      text(segment.text, 6000, 'Texto do segmento');
      if (segment.reading !== undefined) {
        text(segment.reading, 200, 'Furigana');
        if (
          !/^[\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+$/u.test(
            segment.reading,
          )
        )
          fail('VALIDATION', 'Escreva o furigana em hiragana ou katakana.');
      }
    }
    if (paragraph.translation === undefined)
      fail('VALIDATION', 'Inclua a tradução de todos os parágrafos.');
    text(paragraph.translation, 6000, 'Tradução');
  }
  if (
    !story.questions.length ||
    story.questions.length > STORY_LIMITS.questions
  )
    fail('VALIDATION', 'Use de 1 a 30 perguntas de compreensão.');
  identifiers(
    story.questions.map((q) => q.id),
    'Perguntas',
  );
  for (const question of story.questions) {
    text(question.prompt, 2000, 'Pergunta');
    if (
      question.options.length < 2 ||
      question.options.length > STORY_LIMITS.options
    )
      fail('VALIDATION', 'Use de 2 a 6 alternativas por pergunta.');
    identifiers(
      question.options.map((o) => o.id),
      'Alternativas',
    );
    for (const option of question.options)
      text(option.text, 1000, 'Alternativa');
    if (!question.options.some((o) => o.id === question.correctOptionId))
      fail('VALIDATION', 'A alternativa correta deve existir na pergunta.');
    if (question.explanation !== undefined)
      text(question.explanation, 4000, 'Explicação');
  }
  if (
    new TextEncoder().encode(canonical(story)).byteLength >
    STORY_LIMITS.contentBytes
  )
    fail(
      'VALIDATION',
      'O texto e as perguntas devem ocupar até 64 KiB. Divida histórias maiores em capítulos.',
    );
  return story;
}
export function storyRecord(story: Doc<'stories'>): StoryRecord {
  return {
    id: story._id,
    contentVersion: story.contentVersion ?? 1,
    title: story.title,
    level: story.level,
    paragraphs: story.paragraphs,
    questions: story.questions,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    archived: story.archived,
  };
}
export function progressRecord(progress: Doc<'storyProgress'>): StoryProgress {
  return {
    storyId: progress.storyId,
    ...(progress.questId ? { questId: progress.questId } : {}),
    contentVersion: progress.contentVersion ?? 1,
    paragraphIndex: progress.paragraphIndex,
    paragraphUpdatedAt: progress.paragraphUpdatedAt,
    answers: progress.answers,
    startedAt: progress.startedAt,
    updatedAt: progress.updatedAt,
    ...(progress.completedAt !== undefined
      ? { completedAt: progress.completedAt }
      : {}),
  };
}
async function progressForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
  storyId: Id<'stories'>,
  questId?: Id<'quests'>,
) {
  return ctx.db
    .query('storyProgress')
    .withIndex('by_ownerId_and_storyId_and_questId', (q) =>
      q.eq('ownerId', ownerId).eq('storyId', storyId).eq('questId', questId),
    )
    .unique();
}
async function requireReadingQuest(
  ctx: Context,
  ownerId: Id<'users'>,
  storyId: Id<'stories'>,
  reference: string,
) {
  const id = ctx.db.normalizeId('quests', reference);
  const quest = id ? await ctx.db.get('quests', id) : null;
  if (
    !quest ||
    quest.ownerId !== ownerId ||
    !(quest.storyIds ?? []).includes(storyId)
  )
    fail('UNAVAILABLE', 'Esta história não pertence ao desafio desta conta.');
  return quest;
}
export async function getForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
  id: Id<'stories'>,
  questId?: string,
) {
  const doc = await ctx.db.get('stories', id);
  if (!doc || doc.ownerId !== ownerId) return null;
  const quest = questId
    ? await requireReadingQuest(ctx, ownerId, id, questId)
    : null;
  const progress = await progressForOwner(ctx, ownerId, id, quest?._id);
  return {
    story: {
      ...(await readingRecord(ctx, doc, progress)),
      ...(quest ? { questId: quest._id } : {}),
    },
    progress: progress ? progressRecord(progress) : null,
    quest: quest ? questSnapshot(quest) : null,
  };
}
/** Editors always receive the newest content, independently of a saved reading. */
export async function getLatestForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
  id: Id<'stories'>,
) {
  const doc = await ctx.db.get('stories', id);
  if (!doc || doc.ownerId !== ownerId) return null;
  const progress = await progressForOwner(ctx, ownerId, id);
  return {
    story: storyRecord(doc),
    progress: progress ? progressRecord(progress) : null,
  };
}
function storyContent(story: StoryContent): StoryContent {
  return {
    title: story.title,
    level: story.level,
    paragraphs: story.paragraphs,
    questions: story.questions,
  };
}
async function versionRecord(
  ctx: Context,
  story: Doc<'stories'>,
  contentVersion: number,
): Promise<StoryRecord> {
  if (!Number.isSafeInteger(contentVersion) || contentVersion < 1)
    fail('VALIDATION', 'A versão da história é inválida.');
  if (contentVersion === (story.contentVersion ?? 1)) return storyRecord(story);
  const version = await ctx.db
    .query('storyVersions')
    .withIndex('by_storyId_and_contentVersion', (q) =>
      q.eq('storyId', story._id).eq('contentVersion', contentVersion),
    )
    .unique();
  if (!version || version.ownerId !== story.ownerId)
    fail('UNAVAILABLE', 'Esta versão da história está indisponível.');
  return {
    ...storyRecord(story),
    ...storyContent(version),
    contentVersion,
  };
}
async function readingRecord(
  ctx: Context,
  story: Doc<'stories'>,
  progress: Doc<'storyProgress'> | null,
) {
  const record = progress
    ? versionRecord(ctx, story, progress.contentVersion ?? 1)
    : storyRecord(story);
  return {
    ...(await record),
    ...(progress?.questId ? { questId: progress.questId } : {}),
  };
}
export async function requireStory(
  ctx: Context,
  ownerId: Id<'users'>,
  id: Id<'stories'>,
) {
  const story = await ctx.db.get('stories', id);
  if (!story || story.ownerId !== ownerId)
    fail('UNAVAILABLE', 'História indisponível.');
  return story;
}
export async function createForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  input: StoryCreateInput,
): Promise<StoryRecord> {
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(input.clientKey))
    fail('VALIDATION', 'Use uma chave de criação de 8 a 128 caracteres.');
  const story = normalizeStory(input.story);
  const existing = await ctx.db
    .query('stories')
    .withIndex('by_ownerId_and_clientKey', (q) =>
      q.eq('ownerId', ownerId).eq('clientKey', input.clientKey),
    )
    .unique();
  if (existing) {
    const original = await versionRecord(ctx, existing, 1);
    if (canonical(storyContent(original)) !== canonical(story))
      fail(
        'CONFLICT',
        'Esta chave de criação já foi usada com outro conteúdo.',
      );
    return storyRecord(existing);
  }
  const now = Date.now();
  const id = await ctx.db.insert('stories', {
    ...story,
    contentVersion: 1,
    clientKey: input.clientKey,
    ownerId,
    archived: false,
    status: 'new',
    createdAt: now,
    updatedAt: now,
  });
  return storyRecord((await ctx.db.get('stories', id))!);
}
export async function updateForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  input: StoryUpdateInput,
): Promise<StoryRecord> {
  const previous = await requireStory(ctx, ownerId, input.id);
  const story = normalizeStory(input.story);
  if (
    !Number.isSafeInteger(input.expectedContentVersion) ||
    input.expectedContentVersion < 1
  )
    fail('VALIDATION', 'A versão esperada da história é inválida.');
  const contentVersion = previous.contentVersion ?? 1;
  // A retried update which already produced the current content is a no-op.
  if (
    input.expectedContentVersion <= contentVersion &&
    canonical(storyContent(previous)) === canonical(story)
  )
    return storyRecord(previous);
  if (input.expectedContentVersion !== contentVersion)
    fail(
      'CONFLICT',
      'Esta história foi alterada. Leia a versão atual antes de atualizar.',
    );
  await ctx.db.insert('storyVersions', {
    ...storyContent(previous),
    ownerId,
    storyId: previous._id,
    contentVersion,
    updatedAt: previous.updatedAt,
  });
  await ctx.db.patch('stories', previous._id, {
    ...story,
    contentVersion: contentVersion + 1,
    updatedAt: Math.max(Date.now(), previous.updatedAt + 1),
  });
  return storyRecord((await ctx.db.get('stories', previous._id))!);
}
/** Deletion hides the story while preserving results and queued offline reads. */
export async function deleteForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'stories'>,
) {
  return setArchivedForOwner(ctx, ownerId, id, true);
}
export async function setArchivedForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'stories'>,
  archived: boolean,
): Promise<StoryRecord> {
  const previous = await requireStory(ctx, ownerId, id);
  if (previous.archived !== archived)
    await ctx.db.patch('stories', id, {
      archived,
      updatedAt: Math.max(Date.now(), previous.updatedAt + 1),
    });
  return storyRecord((await ctx.db.get('stories', id))!);
}
export async function listForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
  args: {
    paginationOpts: PaginationOptions;
    level?: StoryLevel;
    status?: 'all' | 'new' | 'completed';
    archived?: boolean;
    latestContent?: boolean;
  },
) {
  if (
    !Number.isSafeInteger(args.paginationOpts.numItems) ||
    args.paginationOpts.numItems < 1 ||
    args.paginationOpts.numItems > 30
  )
    fail('VALIDATION', 'Consulte de 1 a 30 histórias por página.');
  const archived = args.archived ?? false,
    status = args.status === 'all' ? undefined : args.status,
    level = args.level;
  const query =
    level && status
      ? ctx.db
          .query('stories')
          .withIndex(
            'by_ownerId_and_archived_and_level_and_status_and_createdAt',
            (q) =>
              q
                .eq('ownerId', ownerId)
                .eq('archived', archived)
                .eq('level', level)
                .eq('status', status),
          )
      : level
        ? ctx.db
            .query('stories')
            .withIndex('by_ownerId_and_archived_and_level_and_createdAt', (q) =>
              q
                .eq('ownerId', ownerId)
                .eq('archived', archived)
                .eq('level', level),
            )
        : status
          ? ctx.db
              .query('stories')
              .withIndex(
                'by_ownerId_and_archived_and_status_and_createdAt',
                (q) =>
                  q
                    .eq('ownerId', ownerId)
                    .eq('archived', archived)
                    .eq('status', status),
              )
          : ctx.db
              .query('stories')
              .withIndex('by_ownerId_and_archived_and_createdAt', (q) =>
                q.eq('ownerId', ownerId).eq('archived', archived),
              );
  const result = await query
    .order('desc')
    .paginate({ ...args.paginationOpts, maximumBytesRead: PAGE_READ_BYTES });
  const page = await Promise.all(
    result.page.map(async (doc) => {
      const progress = await progressForOwner(ctx, ownerId, doc._id);
      return storySummary(
        storyRecord(doc),
        progress ? progressRecord(progress) : null,
      );
    }),
  );
  return { ...result, page };
}
export async function progressForAction(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'stories'>,
  action: StoryAction,
  replay = false,
): Promise<StoryProgress> {
  const story = await requireStory(ctx, ownerId, id);
  if (
    !Number.isSafeInteger(action.occurredAt) ||
    action.occurredAt > Date.now() + 300_000 ||
    action.occurredAt < story.createdAt
  )
    fail(
      'VALIDATION',
      'A data desta leitura é inválida. Confira o relógio do aparelho.',
    );
  const quest = action.questId
    ? await requireReadingQuest(ctx, ownerId, id, action.questId)
    : null;
  const existing = await progressForOwner(ctx, ownerId, id, quest?._id);
  if (quest) {
    if (action.occurredAt < Math.max(quest.createdAt, quest.startsAt))
      fail('VALIDATION', 'A data desta leitura é anterior ao desafio.');
    if (!existing) {
      await requireQuestForPractice(
        ctx,
        ownerId,
        quest._id,
        action.occurredAt,
        replay,
      );
      if (story.archived && !replay)
        fail(
          'UNAVAILABLE',
          'Uma história selecionada para a quest está arquivada.',
        );
    }
  }
  const contentVersion = action.contentVersion ?? 1;
  if (existing && (existing.contentVersion ?? 1) !== contentVersion)
    fail(
      'CONFLICT',
      'Esta leitura foi iniciada em outra versão da história. Seu progresso foi preservado.',
    );
  const reading = {
    ...(await versionRecord(ctx, story, contentVersion)),
    ...(quest ? { questId: quest._id } : {}),
  };
  // An archived immutable story remains readable and can receive a queued answer.
  let next: StoryProgress;
  try {
    next = applyStoryProgress(
      reading,
      existing ? progressRecord(existing) : null,
      action,
    );
  } catch (error) {
    fail(
      'VALIDATION',
      error instanceof Error ? error.message : 'Progresso inválido.',
    );
  }
  const { storyId: _storyId, questId: _questId, ...fields } = next;
  let progressId = existing?._id;
  if (existing)
    await ctx.db.patch('storyProgress', existing._id, {
      ...fields,
      completed: next.completedAt !== undefined,
    });
  else
    progressId = await ctx.db.insert('storyProgress', {
      ...fields,
      storyId: id,
      ownerId,
      ...(quest ? { questId: quest._id } : {}),
      completed: next.completedAt !== undefined,
    });
  if (next.completedAt !== undefined && !quest && story.status !== 'completed')
    await ctx.db.patch('stories', id, {
      status: 'completed',
      updatedAt: Math.max(story.updatedAt, next.updatedAt),
    });
  if (quest && next.completedAt !== undefined && action.type === 'complete')
    await creditForOwner(ctx, ownerId, {
      kind: 'story',
      storyId: id,
      questId: quest._id,
      sourceId: progressId!,
      occurredAt: next.completedAt,
    });
  return next;
}
export async function offlineSnapshotForOwner(
  ctx: Context,
  ownerId: Id<'users'>,
  cachedIds: Id<'stories'>[] = [],
) {
  if (cachedIds.length > 100)
    fail(
      'VALIDATION',
      'Reconcilie até 100 histórias baixadas por atualização.',
    );
  const latest = await ctx.db
    .query('stories')
    .withIndex('by_ownerId_and_archived_and_createdAt', (q) =>
      q.eq('ownerId', ownerId).eq('archived', false),
    )
    .order('desc')
    .take(STORY_LIMITS.snapshot + 1);
  const continuing = await ctx.db
    .query('storyProgress')
    .withIndex('by_ownerId_and_completed_and_updatedAt', (q) =>
      q.eq('ownerId', ownerId).eq('completed', false),
    )
    .order('desc')
    .take(STORY_LIMITS.continuing + 1);
  const candidates = new Map<Id<'stories'>, Doc<'stories'>>();
  for (const progress of continuing.slice(0, STORY_LIMITS.continuing)) {
    const doc = await ctx.db.get('stories', progress.storyId);
    if (doc?.ownerId === ownerId && !doc.archived) candidates.set(doc._id, doc);
  }
  for (const story of latest.slice(0, STORY_LIMITS.snapshot))
    candidates.set(story._id, story);
  const stories: StoryRecord[] = [],
    storyProgress: StoryProgress[] = [];
  const contexts = new Map<
    string,
    {
      story: Doc<'stories'>;
      progress: Doc<'storyProgress'> | null;
      questId?: Id<'quests'>;
    }
  >();
  for (const saved of continuing.slice(0, STORY_LIMITS.continuing)) {
    if (!saved.questId) continue;
    const doc = await ctx.db.get('stories', saved.storyId);
    if (doc?.ownerId === ownerId)
      contexts.set(storyReadingKey(doc._id, saved.questId), {
        story: doc,
        progress: saved,
        questId: saved.questId,
      });
  }
  // Exact quest targets need their own latest edition even when a general
  // reading of the same story is pinned to an older edition.
  const recentQuests = await ctx.db
    .query('quests')
    .withIndex('by_ownerId_and_dueAt', (q) =>
      q.eq('ownerId', ownerId).gte('dueAt', Date.now() - 2 * 86_400_000),
    )
    .take(201);
  let bytes = 0,
    omitted =
      latest.length > STORY_LIMITS.snapshot ||
      continuing.length > STORY_LIMITS.continuing ||
      recentQuests.length > 200;
  questContexts: for (const quest of recentQuests.slice(0, 200)) {
    if (quest.cancelledAt !== undefined) continue;
    for (const id of quest.storyIds ?? []) {
      const storyId = ctx.db.normalizeId('stories', id);
      if (!storyId) continue;
      const key = storyReadingKey(storyId, quest._id);
      if (contexts.has(key)) continue;
      if (contexts.size >= STORY_LIMITS.snapshot + STORY_LIMITS.continuing) {
        omitted = true;
        break questContexts;
      }
      const doc = await ctx.db.get('stories', storyId);
      if (!doc || doc.ownerId !== ownerId) continue;
      const saved = await progressForOwner(ctx, ownerId, storyId, quest._id);
      contexts.set(key, { story: doc, progress: saved, questId: quest._id });
    }
  }
  for (const doc of candidates.values()) {
    contexts.set(storyReadingKey(doc._id), {
      story: doc,
      progress: await progressForOwner(ctx, ownerId, doc._id),
    });
  }
  for (const { story: doc, progress: saved, questId } of contexts.values()) {
    const story = {
        ...(await readingRecord(ctx, doc, saved)),
        ...(questId ? { questId } : {}),
      },
      progress = saved ? progressRecord(saved) : null;
    const size = new TextEncoder().encode(
      JSON.stringify({ story, progress }),
    ).byteLength;
    if (bytes + size > STORY_LIMITS.snapshotBytes) {
      omitted = true;
      continue;
    }
    bytes += size;
    stories.push(story);
    if (progress) storyProgress.push(progress);
  }
  // Absence from a partial snapshot does not imply archival. Reconcile the
  // explicitly cached IDs so old downloaded stories do receive that change.
  const cachedStates: { id: string; archived: boolean; updatedAt: number }[] =
    [];
  for (const id of new Set(cachedIds)) {
    const doc = candidates.get(id) ?? (await ctx.db.get('stories', id));
    if (doc?.ownerId === ownerId)
      cachedStates.push({
        id,
        archived: doc.archived,
        updatedAt: doc.updatedAt,
      });
  }
  return { stories, storyProgress, cachedStates, hasMore: omitted };
}
