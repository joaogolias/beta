import { v } from 'convex/values';
import {
  classificationValidator,
  exampleValidator,
} from './alphabetValidators';

export const vocabularyTranslationsValidator = v.object({
  pt: v.optional(v.array(v.string())),
  en: v.optional(v.array(v.string())),
});

export const vocabularyContentFields = {
  language: v.string(),
  expression: v.string(),
  reading: v.string(),
  readingOmitted: v.optional(v.boolean()),
  translations: vocabularyTranslationsValidator,
  examples: v.array(exampleValidator),
  front: v.string(),
  back: v.string(),
  sortKey: v.string(),
  classifications: v.array(classificationValidator),
};

export const vocabularyContentValidator = v.object(vocabularyContentFields);
export const vocabularyCreateValidator = v.object({
  ...vocabularyContentFields,
  reading: v.optional(v.string()),
  front: v.optional(v.string()),
  back: v.optional(v.string()),
  sortKey: v.optional(v.string()),
});
export const vocabularyPatchValidator = v.object({
  language: v.optional(v.string()),
  expression: v.optional(v.string()),
  reading: v.optional(v.string()),
  readingOmitted: v.optional(v.boolean()),
  translations: v.optional(vocabularyTranslationsValidator),
  examples: v.optional(v.array(exampleValidator)),
  front: v.optional(v.string()),
  back: v.optional(v.string()),
  sortKey: v.optional(v.string()),
  classifications: v.optional(v.array(classificationValidator)),
});

export const vocabularyFilterFields = {
  query: v.optional(v.string()),
  terms: v.optional(v.array(v.string())),
  operator: v.optional(v.union(v.literal('AND'), v.literal('OR'))),
  language: v.optional(v.string()),
  level: v.optional(v.string()),
};
