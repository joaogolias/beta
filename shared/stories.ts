export const STORY_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
export type StoryLevel = (typeof STORY_LEVELS)[number];
export type StorySegment = { text: string; reading?: string };
export type StoryParagraph = {
  id: string;
  segments: StorySegment[];
  translation?: string;
};
export type StoryQuestion = {
  id: string;
  prompt: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation?: string;
};
export type StoryContent = {
  title: string;
  level: StoryLevel;
  paragraphs: StoryParagraph[];
  questions: StoryQuestion[];
};
export type StoryRecord = StoryContent & {
  id: string;
  questId?: string;
  /** Missing only in caches created before editable stories. */
  contentVersion?: number;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
};
export type StoryAnswer = {
  questionId: string;
  optionId: string;
  answeredAt: number;
};
export type StoryProgress = {
  storyId: string;
  questId?: string;
  contentVersion?: number;
  paragraphIndex: number;
  paragraphUpdatedAt: number;
  answers: StoryAnswer[];
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
};
export type StoryAction = { contentVersion?: number; questId?: string } & (
  | { type: 'progress'; paragraphIndex: number; occurredAt: number }
  | { type: 'answer'; questionId: string; optionId: string; occurredAt: number }
  | { type: 'complete'; occurredAt: number }
);
export type StorySummary = {
  id: string;
  contentVersion?: number;
  title: string;
  level: StoryLevel;
  paragraphCount: number;
  questionCount: number;
  characterCount: number;
  createdAt: number;
  archived: boolean;
  progress: StoryProgress | null;
};

export function storyReadingKey(storyId: string, questId?: string): string {
  return questId ? `${storyId}:quest:${questId}` : storyId;
}

export function storyScore(
  story: StoryContent,
  progress: StoryProgress | null,
) {
  const answers = new Map(
    progress?.answers.map((a) => [a.questionId, a.optionId]),
  );
  const total = story.questions.length;
  const answered = story.questions.filter((q) => answers.has(q.id)).length;
  const correct = story.questions.filter(
    (q) => answers.get(q.id) === q.correctOptionId,
  ).length;
  return {
    total,
    answered,
    correct,
    percentage: total ? Math.round((correct / total) * 100) : 0,
  };
}

export function storySummary(
  story: StoryRecord,
  progress: StoryProgress | null,
): StorySummary {
  return {
    id: story.id,
    contentVersion: story.contentVersion ?? 1,
    title: story.title,
    level: story.level,
    paragraphCount: story.paragraphs.length,
    questionCount: story.questions.length,
    characterCount: story.paragraphs.reduce(
      (sum, p) => sum + p.segments.reduce((n, s) => n + [...s.text].length, 0),
      0,
    ),
    createdAt: story.createdAt,
    archived: story.archived,
    progress,
  };
}

/** The same immutable content and timestamp rules drive offline and server state. */
export function applyStoryProgress(
  story: StoryRecord,
  previous: StoryProgress | null,
  action: StoryAction,
): StoryProgress {
  if (
    !Number.isSafeInteger(action.occurredAt) ||
    action.occurredAt < story.createdAt
  )
    throw new Error('A data desta leitura é inválida.');
  if (previous && previous.storyId !== story.id)
    throw new Error('Progresso de outra história.');
  if (
    story.questId !== action.questId ||
    (previous && previous.questId !== action.questId)
  )
    throw new Error('Esta leitura pertence a outro contexto de desafio.');
  const contentVersion = story.contentVersion ?? 1;
  if (
    (action.contentVersion ?? 1) !== contentVersion ||
    (previous && (previous.contentVersion ?? 1) !== contentVersion)
  )
    throw new Error('Esta leitura pertence a outra versão da história.');
  if (
    action.type === 'progress' &&
    (!Number.isSafeInteger(action.paragraphIndex) ||
      action.paragraphIndex < 0 ||
      action.paragraphIndex >= story.paragraphs.length)
  )
    throw new Error('Este parágrafo não existe.');
  if (action.type === 'answer') {
    const question = story.questions.find((q) => q.id === action.questionId);
    if (!question?.options.some((o) => o.id === action.optionId))
      throw new Error('Esta pergunta ou alternativa não existe.');
  }
  // A completed reading is a frozen result; rereading never replaces its answers.
  if (previous?.completedAt !== undefined) return previous;
  const next: StoryProgress = previous
    ? { ...previous, answers: [...previous.answers] }
    : {
        storyId: story.id,
        ...(action.questId ? { questId: action.questId } : {}),
        contentVersion,
        paragraphIndex: 0,
        paragraphUpdatedAt: story.createdAt,
        answers: [],
        startedAt: action.occurredAt,
        updatedAt: action.occurredAt,
      };
  if (
    action.type === 'complete' &&
    storyScore(story, next).answered !== story.questions.length
  )
    throw new Error('Responda todas as perguntas antes de concluir.');
  next.startedAt = Math.min(next.startedAt, action.occurredAt);
  next.updatedAt = Math.max(next.updatedAt, action.occurredAt);
  if (
    action.type === 'progress' &&
    action.occurredAt >= next.paragraphUpdatedAt
  ) {
    next.paragraphIndex = action.paragraphIndex;
    next.paragraphUpdatedAt = action.occurredAt;
  }
  if (action.type === 'answer') {
    const before = next.answers.find((a) => a.questionId === action.questionId);
    // A deterministic tie break makes concurrent devices converge.
    if (
      !before ||
      action.occurredAt > before.answeredAt ||
      (action.occurredAt === before.answeredAt &&
        action.optionId.localeCompare(before.optionId) > 0)
    ) {
      next.answers = next.answers.filter(
        (a) => a.questionId !== action.questionId,
      );
      next.answers.push({
        questionId: action.questionId,
        optionId: action.optionId,
        answeredAt: action.occurredAt,
      });
      next.answers.sort(
        (a, b) =>
          story.questions.findIndex((q) => q.id === a.questionId) -
          story.questions.findIndex((q) => q.id === b.questionId),
      );
    }
  }
  if (action.type === 'complete')
    next.completedAt = Math.max(
      action.occurredAt,
      ...next.answers.map((a) => a.answeredAt),
    );
  return next;
}
