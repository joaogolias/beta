import type { Doc } from '../../../backend/convex/_generated/dataModel';
import { applyQuestCredit, type QuestActivity } from '../../../shared/quests';
import type { Data } from './model';

/** The journal owns replay; ordinary study never advances another quest. */
export function creditLocalQuests(
  data: Data,
  activity: QuestActivity,
  delta: 1 | -1 = 1,
) {
  if (!data.quests) return;
  data.quests = data.quests.map((quest) => {
    if (quest.id !== activity.questId) return quest;
    // Cancelled quests require the server ledger to confirm earlier credit.
    if (delta === -1 && quest.cancelledAt !== undefined) return quest;
    return applyQuestCredit(quest, activity, delta);
  });
}

export function creditLocalStudy(
  data: Data,
  presentation: Doc<'studyPresentations'>,
  session: Doc<'studySessions'>,
  occurredAt: number,
  delta: 1 | -1,
) {
  if (!session.questId) return;
  creditLocalQuests(
    data,
    {
      kind: 'study',
      questId: session.questId,
      sourceId: presentation._id,
      occurredAt,
      cardId: presentation.cardId,
    },
    delta,
  );
}
