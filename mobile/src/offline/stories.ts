import {
  applyStoryProgress,
  storyReadingKey,
  type StoryProgress,
} from '../../../shared/stories';
import type { OfflineCommand } from '../../../backend/convex/offlineValidators';
import type { Data } from './model';
import { creditLocalQuests } from './quests';

type StoryCommand = Extract<OfflineCommand, { type: `story.${string}` }>;
export function isStoryCommand(
  command: OfflineCommand,
): command is StoryCommand {
  return (
    command.type === 'story.progress' ||
    command.type === 'story.answer' ||
    command.type === 'story.complete'
  );
}
export function applyStoryLocal(
  data: Data,
  command: StoryCommand,
  replay = false,
) {
  const key = storyReadingKey(command.storyId, command.questId);
  let story = data.stories?.find(
    (s) => storyReadingKey(s.id, s.questId) === key,
  );
  const previous =
    data.storyProgress?.find(
      (p) => storyReadingKey(p.storyId, p.questId) === key,
    ) ?? null;
  if (command.questId) {
    const quest = data.quests?.find((q) => q.id === command.questId);
    if (!quest?.storyIds?.includes(command.storyId))
      throw new Error('Esta história não faz parte da quest neste aparelho.');
    if (
      !previous &&
      ((quest.cancelledAt !== undefined &&
        (!replay || command.occurredAt >= quest.cancelledAt)) ||
        (quest.completedAt !== undefined && !replay) ||
        command.occurredAt < Math.max(quest.createdAt, quest.startsAt) ||
        command.occurredAt >= quest.dueAt)
    )
      throw new Error(
        'Esta quest não está disponível para iniciar uma leitura.',
      );
    if (!story) {
      const downloaded = data.stories?.find(
        (s) => s.id === command.storyId && !s.questId,
      );
      if (downloaded) story = { ...downloaded, questId: command.questId };
    }
    if (!previous && story?.archived && !replay)
      throw new Error(
        'Esta história foi arquivada. Restaure-a para iniciar a quest.',
      );
  }
  if (!story)
    throw new Error('Conecte para baixar esta história antes de ler.');
  const context = command.questId ? { questId: command.questId } : {};
  const progress = applyStoryProgress(
    story,
    previous,
    command.type === 'story.progress'
      ? {
          ...context,
          type: 'progress',
          paragraphIndex: command.paragraphIndex,
          contentVersion: command.contentVersion ?? 1,
          occurredAt: command.occurredAt,
        }
      : command.type === 'story.answer'
        ? {
            ...context,
            type: 'answer',
            questionId: command.questionId,
            contentVersion: command.contentVersion ?? 1,
            optionId: command.optionId,
            occurredAt: command.occurredAt,
          }
        : {
            ...context,
            type: 'complete',
            occurredAt: command.occurredAt,
            contentVersion: command.contentVersion ?? 1,
          },
  );
  data.stories = [
    ...(data.stories ?? []).filter(
      (s) => storyReadingKey(s.id, s.questId) !== key,
    ),
    story,
  ];
  data.storyProgress = [
    ...(data.storyProgress ?? []).filter(
      (p) => storyReadingKey(p.storyId, p.questId) !== key,
    ),
    progress,
  ];
  if (
    command.type === 'story.complete' &&
    command.questId &&
    progress.completedAt !== undefined
  )
    creditLocalQuests(data, {
      kind: 'story',
      questId: command.questId,
      storyId: command.storyId,
      sourceId: key,
      occurredAt: progress.completedAt,
    });
  return progress;
}

/** Reconcile downloaded progress without regressing an open reader or another device. */
export function mergeStoryProgress(
  local: StoryProgress | undefined,
  remote: StoryProgress,
): StoryProgress {
  if (
    local &&
    (storyReadingKey(local.storyId, local.questId) !==
      storyReadingKey(remote.storyId, remote.questId) ||
      (local.contentVersion ?? 1) !== (remote.contentVersion ?? 1))
  )
    return remote;
  if (!local || remote.completedAt !== undefined) return remote;
  if (local.completedAt !== undefined) return local;
  const answers = new Map(local.answers.map((a) => [a.questionId, a]));
  for (const answer of remote.answers) {
    const before = answers.get(answer.questionId);
    if (
      !before ||
      answer.answeredAt > before.answeredAt ||
      (answer.answeredAt === before.answeredAt &&
        answer.optionId.localeCompare(before.optionId) > 0)
    )
      answers.set(answer.questionId, answer);
  }
  const paragraph =
    remote.paragraphUpdatedAt >= local.paragraphUpdatedAt ? remote : local;
  return {
    ...remote,
    paragraphIndex: paragraph.paragraphIndex,
    paragraphUpdatedAt: paragraph.paragraphUpdatedAt,
    startedAt: Math.min(local.startedAt, remote.startedAt),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    answers: [...answers.values()],
  };
}

/** Keep opened older stories offline, with a finite cache; never evict a pending reading. */
export function mergeStoryCache(
  downloaded: Data,
  previous: Data,
  pendingIds: Set<string> = new Set(),
  preserveVersionIds: Set<string> = new Set(),
) {
  if (!downloaded.stories && !previous.stories) return;
  const stories = new Map(
    previous.stories?.map((s) => [storyReadingKey(s.id, s.questId), s]),
  );
  const incomingProgress = new Map(
    downloaded.storyProgress?.map((p) => [
      storyReadingKey(p.storyId, p.questId),
      p,
    ]),
  );
  const previousProgress = new Set(
    previous.storyProgress?.map((p) => storyReadingKey(p.storyId, p.questId)),
  );
  for (const story of downloaded.stories ?? []) {
    const key = storyReadingKey(story.id, story.questId);
    const before = stories.get(key);
    const differentVersion =
      before && (before.contentVersion ?? 1) !== (story.contentVersion ?? 1);
    if (differentVersion && preserveVersionIds.has(key)) continue;
    // A query begun before the first answer can arrive after its ACK. Null
    // progress is not evidence that an already saved reading was reset.
    if (
      differentVersion &&
      previousProgress.has(key) &&
      !incomingProgress.has(key)
    )
      continue;
    // A confirmed reading can pin an older published edition. Its content must
    // arrive together with the matching answers, even if a newer edition was cached.
    const pinned = incomingProgress.get(key);
    if (
      !before ||
      (differentVersion && pinned) ||
      before.updatedAt <= story.updatedAt
    )
      stories.set(key, story);
  }
  for (const state of downloaded.storyCachedStates ?? []) {
    for (const [key, before] of stories) {
      if (before.id === state.id && before.updatedAt <= state.updatedAt)
        stories.set(key, { ...before, ...state });
    }
  }
  delete downloaded.storyCachedStates;
  const progress = new Map(
    previous.storyProgress?.map((p) => [
      storyReadingKey(p.storyId, p.questId),
      p,
    ]),
  );
  for (const p of downloaded.storyProgress ?? []) {
    const key = storyReadingKey(p.storyId, p.questId);
    const record = stories.get(key);
    if (record && (record.contentVersion ?? 1) === (p.contentVersion ?? 1))
      progress.set(key, mergeStoryProgress(progress.get(key), p));
  }
  const ordered = [...stories.values()].sort(
    (a, b) =>
      (progress.get(storyReadingKey(b.id, b.questId))?.updatedAt ??
        b.createdAt) -
      (progress.get(storyReadingKey(a.id, a.questId))?.updatedAt ??
        a.createdAt),
  );
  const retained = ordered.filter(
    (s, index) =>
      index < 100 || pendingIds.has(storyReadingKey(s.id, s.questId)),
  );
  const ids = new Set(retained.map((s) => storyReadingKey(s.id, s.questId)));
  downloaded.stories = retained;
  downloaded.storyProgress = [...progress.values()].filter(
    (p) =>
      ids.has(storyReadingKey(p.storyId, p.questId)) &&
      (stories.get(storyReadingKey(p.storyId, p.questId))?.contentVersion ??
        1) === (p.contentVersion ?? 1),
  );
}
