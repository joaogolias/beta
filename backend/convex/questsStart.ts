import { getDocumentSize } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { fail } from './alphabetDomain';
import { createQuestSessionForOwner, finishForOwner } from './study';
import { studySnapshot } from './studyCards';
import {
  activeForOwner,
  startForOwner as startPaperForOwner,
} from './jlptDomain';
import {
  questSnapshot,
  requireQuestCard,
  requireQuestForPractice,
  requireQuestStory,
} from './questsDomain';
import {
  QUEST_BATCH_CARDS,
  remainingQuestCardIds,
  remainingQuestPaperIds,
  remainingQuestStoryIds,
} from '../../shared/quests';
import { SESSION_SNAPSHOT_BYTES } from './readBudget';
import {
  getForOwner as getStoryForOwner,
  progressForAction,
} from './storiesDomain';

export type QuestStart =
  | { kind: 'study'; sessionId: Id<'studySessions'> }
  | { kind: 'shiken'; attemptId: Id<'jlptAttempts'> }
  | { kind: 'story'; storyId: Id<'stories'>; questId: Id<'quests'> };

export async function startForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  id: Id<'quests'>,
): Promise<QuestStart> {
  const now = Date.now();
  const quest = await requireQuestForPractice(ctx, ownerId, id, now);
  const active = await ctx.db
    .query('studySessions')
    .withIndex('by_ownerId_and_status', (q) =>
      q.eq('ownerId', ownerId).eq('status', 'active'),
    )
    .unique();
  if (active?.questId === id) return { kind: 'study', sessionId: active._id };
  const snapshot = questSnapshot(quest);
  const remaining = remainingQuestCardIds(snapshot);
  if (remaining.length) {
    const queue: {
      cardId: Doc<'studyPresentations'>['cardId'];
      snapshot: Doc<'studyPresentations'>['snapshot'];
    }[] = [];
    let bytes = 0;
    for (const reference of remaining.slice(0, QUEST_BATCH_CARDS)) {
      const card = await requireQuestCard(ctx, ownerId, reference);
      const frozen = await studySnapshot(ctx, card);
      const size = getDocumentSize(frozen);
      if (bytes + size > SESSION_SNAPSHOT_BYTES) {
        if (!queue.length)
          fail(
            'VALIDATION',
            'O primeiro card da quest excede o tamanho técnico de uma sessão.',
          );
        break;
      }
      bytes += size;
      queue.push({ cardId: card._id, snapshot: frozen });
    }
    if (active) await finishForOwner(ctx, ownerId, { sessionId: active._id });
    const created = await createQuestSessionForOwner(
      ctx,
      ownerId,
      id,
      queue,
      now,
    );
    return { kind: 'study', sessionId: created.session._id };
  }
  const attempt = await activeForOwner(ctx, ownerId);
  if (attempt?.questId === id)
    return { kind: 'shiken', attemptId: attempt._id };
  const next = remainingQuestPaperIds(snapshot)[0];
  if (attempt && next)
    fail(
      'CONFLICT',
      'Há outro simulado em andamento. Retome e finalize essa tentativa antes de começar esta quest.',
    );
  const paperId = next ? ctx.db.normalizeId('jlptPapers', next) : null;
  if (next) {
    if (!paperId)
      fail(
        'UNAVAILABLE',
        'Não há um simulado restante disponível nesta quest.',
      );
    const started = await startPaperForOwner(ctx, ownerId, paperId, {
      questId: id,
    });
    return { kind: 'shiken', attemptId: started._id };
  }
  const nextStory = remainingQuestStoryIds(snapshot)[0];
  if (!nextStory)
    fail('UNAVAILABLE', 'Não há um item restante disponível nesta quest.');
  const storyId = ctx.db.normalizeId('stories', nextStory);
  if (!storyId)
    fail('UNAVAILABLE', 'A história selecionada está indisponível.');
  const reading = await getStoryForOwner(ctx, ownerId, storyId, id);
  if (!reading)
    fail('UNAVAILABLE', 'A história selecionada está indisponível.');
  if (!reading.progress) {
    const story = await requireQuestStory(ctx, ownerId, nextStory);
    await progressForAction(ctx, ownerId, storyId, {
      type: 'progress',
      questId: id,
      contentVersion: story.contentVersion ?? 1,
      paragraphIndex: 0,
      occurredAt: now,
    });
  }
  return { kind: 'story', storyId, questId: id };
}
