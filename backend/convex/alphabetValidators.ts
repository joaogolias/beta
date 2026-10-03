import { v } from 'convex/values';

export const classificationValidator = v.object({
  scheme: v.string(),
  level: v.string(),
});

export const alphabetDetailsValidator = v.union(
  v.object({
    kind: v.literal('kanji'),
    kunYomi: v.array(v.string()),
    onYomi: v.array(v.string()),
    radicals: v.array(v.string()),
  }),
  v.object({ kind: v.literal('generic'), readings: v.array(v.string()) }),
);

export const exampleValidator = v.object({
  text: v.string(),
  reading: v.optional(v.string()),
  meaning: v.optional(v.string()),
});

export const alphabetContentFields = {
  language: v.string(),
  writingSystem: v.string(),
  symbol: v.string(),
  meanings: v.array(v.string()),
  examples: v.array(exampleValidator),
  front: v.string(),
  back: v.string(),
  sortKey: v.string(),
  classifications: v.array(classificationValidator),
  details: alphabetDetailsValidator,
};

export const alphabetContentValidator = v.object(alphabetContentFields);
export const alphabetCreateValidator = v.object({
  ...alphabetContentFields,
  front: v.optional(v.string()),
  back: v.optional(v.string()),
  sortKey: v.optional(v.string()),
});
export const alphabetPatchValidator = v.object({
  language: v.optional(v.string()),
  writingSystem: v.optional(v.string()),
  symbol: v.optional(v.string()),
  meanings: v.optional(v.array(v.string())),
  examples: v.optional(v.array(exampleValidator)),
  front: v.optional(v.string()),
  back: v.optional(v.string()),
  sortKey: v.optional(v.string()),
  classifications: v.optional(v.array(classificationValidator)),
  details: v.optional(alphabetDetailsValidator),
});

export const alphabetFilterFields = {
  query: v.optional(v.string()),
  language: v.optional(v.string()),
  writingSystem: v.optional(v.string()),
  level: v.optional(v.string()),
  reading: v.optional(v.string()),
  radical: v.optional(v.string()),
};

export const studyRatingValidator = v.union(
  v.literal('correct'),
  v.literal('partial'),
  v.literal('incorrect'),
);

export const studySnapshotValidator = v.object({
  ...alphabetContentFields,
  contentVersion: v.number(),
});
