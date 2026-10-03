import { v } from 'convex/values';

export const jlptLevelValidator = v.union(
  v.literal('N1'),
  v.literal('N2'),
  v.literal('N3'),
  v.literal('N4'),
  v.literal('N5'),
);
export const jlptSkillValidator = v.union(
  v.literal('vocabulary'),
  v.literal('grammar'),
  v.literal('reading'),
  v.literal('listening'),
);
export const jlptQuestionValidator = v.object({
  id: v.string(),
  skill: jlptSkillValidator,
  kind: v.string(),
  prompt: v.string(),
  passage: v.optional(v.string()),
  choices: v.array(v.string()),
  correctChoice: v.number(),
  explanation: v.string(),
  audioUrl: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
});
export const jlptPaperFields = {
  title: v.string(),
  level: jlptLevelValidator,
  description: v.optional(v.string()),
  source: v.optional(v.string()),
  questions: v.array(jlptQuestionValidator),
};
export const jlptPaperValidator = v.object(jlptPaperFields);
export const jlptPatchValidator = v.object({
  title: v.optional(v.string()),
  level: v.optional(jlptLevelValidator),
  description: v.optional(v.union(v.string(), v.null())),
  source: v.optional(v.union(v.string(), v.null())),
  questions: v.optional(v.array(jlptQuestionValidator)),
});
export const jlptSnapshotValidator = v.object({
  ...jlptPaperFields,
  contentVersion: v.number(),
});
export const jlptAnswerFields = {
  questionId: v.string(),
  choice: v.union(v.number(), v.null()),
  flagged: v.boolean(),
};
export const jlptAnswerValidator = v.object(jlptAnswerFields);
export const jlptAttemptFields = {
  snapshot: jlptSnapshotValidator,
  status: v.union(v.literal('active'), v.literal('completed')),
  blockIndex: v.number(),
  startedAt: v.number(),
  blockStartedAt: v.number(),
  blockDeadlineAt: v.number(),
  lastActionAt: v.number(),
  completedAt: v.optional(v.number()),
  revision: v.number(),
  answers: v.array(jlptAnswerValidator),
};
