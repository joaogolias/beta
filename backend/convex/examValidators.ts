import { v } from 'convex/values';
import { classificationValidator } from './alphabetValidators';
import { vocabularyFilterFields } from './vocabularyValidators';

export const examCreateFields = {
  language: v.string(),
  title: v.string(),
  prompt: v.string(),
  answer: v.string(),
  explanation: v.string(),
  alternatives: v.array(v.string()),
  sortKey: v.string(),
  classifications: v.array(classificationValidator),
  examReference: v.optional(v.string()),
  year: v.optional(v.number()),
  section: v.optional(v.string()),
  source: v.optional(v.string()),
};
export const examCreateValidator = v.object({
  ...examCreateFields,
  sortKey: v.optional(v.string()),
});
export const examContentFields = {
  ...examCreateFields,
  front: v.string(),
  back: v.string(),
};
export const examContentValidator = v.object(examContentFields);
export const examPatchValidator = v.object({
  language: v.optional(v.string()),
  title: v.optional(v.string()),
  prompt: v.optional(v.string()),
  answer: v.optional(v.string()),
  explanation: v.optional(v.string()),
  alternatives: v.optional(v.array(v.string())),
  sortKey: v.optional(v.string()),
  classifications: v.optional(v.array(classificationValidator)),
  examReference: v.optional(v.union(v.string(), v.null())),
  year: v.optional(v.union(v.number(), v.null())),
  section: v.optional(v.union(v.string(), v.null())),
  source: v.optional(v.union(v.string(), v.null())),
});
export const examFilterFields = vocabularyFilterFields;
