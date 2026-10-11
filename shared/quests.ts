/** A session is a technical batch; a quest can contain any number of targets. */
export const QUEST_BATCH_CARDS = 100;
export type QuestSnapshot = {
  id: string;
  title: string;
  startsAt: number;
  dueAt: number;
  timeZone: string;
  createdAt: number;
  updatedAt: number;
  cancelledAt?: number;
  completedAt?: number;
  cardIds: string[];
  paperIds: string[];
  storyIds?: string[];
  completedCardIds: string[];
  completedPaperIds: string[];
  completedStoryIds?: string[];
};
export type QuestActivity = {
  questId: string;
  sourceId: string;
  occurredAt: number;
} & (
  | { kind: 'study'; cardId: string }
  | { kind: 'shiken'; paperId: string }
  | { kind: 'story'; storyId: string }
);

export function remainingQuestCardIds(quest: QuestSnapshot): string[] {
  const completed = new Set(quest.completedCardIds);
  return quest.cardIds.filter((id) => !completed.has(id));
}
export function remainingQuestPaperIds(quest: QuestSnapshot): string[] {
  const completed = new Set(quest.completedPaperIds);
  return quest.paperIds.filter((id) => !completed.has(id));
}
export function remainingQuestStoryIds(quest: QuestSnapshot): string[] {
  const completed = new Set(quest.completedStoryIds ?? []);
  return (quest.storyIds ?? []).filter((id) => !completed.has(id));
}
function containsTarget(quest: QuestSnapshot, activity: QuestActivity) {
  return (
    quest.id === activity.questId &&
    (activity.kind === 'study'
      ? quest.cardIds.includes(activity.cardId)
      : activity.kind === 'shiken'
        ? quest.paperIds.includes(activity.paperId)
        : (quest.storyIds ?? []).includes(activity.storyId))
  );
}
export function canCreditQuest(
  quest: QuestSnapshot,
  activity: QuestActivity,
): boolean {
  return (
    containsTarget(quest, activity) &&
    quest.cancelledAt === undefined &&
    quest.completedAt === undefined &&
    Number.isFinite(activity.occurredAt) &&
    activity.occurredAt >= Math.max(quest.createdAt, quest.startsAt) &&
    activity.occurredAt < quest.dueAt
  );
}

/** Only remove a target after the caller verifies its last contribution was undone. */
export function applyQuestCredit(
  quest: QuestSnapshot,
  activity: QuestActivity,
  delta: 1 | -1 = 1,
): QuestSnapshot {
  if (
    quest.completedAt !== undefined ||
    !Number.isFinite(activity.occurredAt) ||
    !containsTarget(quest, activity)
  )
    return quest;
  if (delta === 1 && !canCreditQuest(quest, activity)) return quest;
  const target =
    activity.kind === 'study'
      ? activity.cardId
      : activity.kind === 'shiken'
        ? activity.paperId
        : activity.storyId;
  const previous =
    activity.kind === 'study'
      ? quest.completedCardIds
      : activity.kind === 'shiken'
        ? quest.completedPaperIds
        : (quest.completedStoryIds ?? []);
  if ((delta === 1) === previous.includes(target)) return quest;
  const selected = new Set(previous);
  if (delta === 1) selected.add(target);
  else selected.delete(target);
  const completedCardIds =
    activity.kind === 'study'
      ? quest.cardIds.filter((id) => selected.has(id))
      : quest.completedCardIds;
  const completedPaperIds =
    activity.kind === 'shiken'
      ? quest.paperIds.filter((id) => selected.has(id))
      : quest.completedPaperIds;
  const completedStoryIds =
    activity.kind === 'story'
      ? (quest.storyIds ?? []).filter((id) => selected.has(id))
      : (quest.completedStoryIds ?? []);
  const complete =
    delta === 1 &&
    quest.cardIds.length +
      quest.paperIds.length +
      (quest.storyIds?.length ?? 0) >
      0 &&
    completedCardIds.length === quest.cardIds.length &&
    completedPaperIds.length === quest.paperIds.length &&
    completedStoryIds.length === (quest.storyIds?.length ?? 0);
  return {
    ...quest,
    completedCardIds,
    completedPaperIds,
    completedStoryIds,
    updatedAt: Math.max(quest.updatedAt, activity.occurredAt),
    ...(complete ? { completedAt: activity.occurredAt } : {}),
  };
}
