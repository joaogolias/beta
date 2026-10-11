import { v, type Infer } from 'convex/values';

export const storyLevelValidator = v.union(
  v.literal('N5'),
  v.literal('N4'),
  v.literal('N3'),
  v.literal('N2'),
  v.literal('N1'),
);
export const storyStatusValidator = v.union(
  v.literal('new'),
  v.literal('completed'),
);
export const storyContentFields = {
  title: v.string(),
  level: storyLevelValidator,
  paragraphs: v.array(
    v.object({
      id: v.string(),
      segments: v.array(
        v.object({ text: v.string(), reading: v.optional(v.string()) }),
      ),
      translation: v.optional(v.string()),
    }),
  ),
  questions: v.array(
    v.object({
      id: v.string(),
      prompt: v.string(),
      options: v.array(v.object({ id: v.string(), text: v.string() })),
      correctOptionId: v.string(),
      explanation: v.optional(v.string()),
    }),
  ),
};
export const storyCreateFields = {
  clientKey: v.string(),
  story: v.object(storyContentFields),
};
export type StoryCreateInput = {
  clientKey: string;
  story: Infer<typeof storyCreateFields.story>;
};
export const storyUpdateFields = {
  id: v.id('stories'),
  expectedContentVersion: v.number(),
  story: v.object(storyContentFields),
};
export type StoryUpdateInput = {
  id: Infer<typeof storyUpdateFields.id>;
  expectedContentVersion: number;
  story: Infer<typeof storyUpdateFields.story>;
};
export const storyProgressFields = {
  contentVersion: v.optional(v.number()),
  paragraphIndex: v.number(),
  paragraphUpdatedAt: v.number(),
  answers: v.array(
    v.object({
      questionId: v.string(),
      optionId: v.string(),
      answeredAt: v.number(),
    }),
  ),
  startedAt: v.number(),
  updatedAt: v.number(),
  completedAt: v.optional(v.number()),
};
