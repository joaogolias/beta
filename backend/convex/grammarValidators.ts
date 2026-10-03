import { v } from 'convex/values';
import {
  classificationValidator,
  exampleValidator,
} from './alphabetValidators';
import { vocabularyFilterFields } from './vocabularyValidators';

export const grammarContentFields = {
  language: v.string(),
  title: v.string(),
  explanation: v.string(),
  shortExplanation: v.optional(v.string()),
  examples: v.array(exampleValidator),
  front: v.string(),
  back: v.string(),
  sortKey: v.string(),
  classifications: v.array(classificationValidator),
};

export const grammarContentValidator = v.object(grammarContentFields);
export const grammarCreateValidator = v.object({
  ...grammarContentFields,
  examples: v.optional(v.array(exampleValidator)),
  front: v.optional(v.string()),
  back: v.optional(v.string()),
  sortKey: v.optional(v.string()),
});
export const grammarPatchValidator = v.object({
  language: v.optional(v.string()),
  title: v.optional(v.string()),
  explanation: v.optional(v.string()),
  shortExplanation: v.optional(v.string()),
  examples: v.optional(v.array(exampleValidator)),
  front: v.optional(v.string()),
  back: v.optional(v.string()),
  sortKey: v.optional(v.string()),
  classifications: v.optional(v.array(classificationValidator)),
});

export const grammarFilterFields = vocabularyFilterFields;
