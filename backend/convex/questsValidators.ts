import { v, type Infer } from 'convex/values';

export const questHeaderFields = {
  title: v.string(),
  startsAt: v.number(),
  dueAt: v.number(),
  timeZone: v.string(),
};
export const questFields = {
  ...questHeaderFields,
  cardIds: v.array(v.string()),
  paperIds: v.array(v.string()),
  storyIds: v.optional(v.array(v.string())),
};
export const questCreateFields = {
  clientKey: v.string(),
  ...questHeaderFields,
  cardIds: v.optional(v.array(v.string())),
  paperIds: v.optional(v.array(v.string())),
  storyIds: v.optional(v.array(v.string())),
};
export const questCreateValidator = v.object(questCreateFields);
export type QuestCreateInput = Infer<typeof questCreateValidator>;
export const questStatusValidator = v.union(
  v.literal('open'),
  v.literal('completed'),
  v.literal('cancelled'),
);
