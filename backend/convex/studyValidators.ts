import { v } from 'convex/values';
import {
  alphabetFilterFields,
  studySnapshotValidator as alphabetSnapshotValidator,
} from './alphabetValidators';
import { vocabularyContentFields } from './vocabularyValidators';
import { grammarContentFields } from './grammarValidators';
import { examContentFields } from './examValidators';

export const studyCardIdValidator = v.union(
  v.id('alphabetCards'),
  v.id('vocabularyCards'),
  v.id('grammarCards'),
  v.id('examCards'),
);
export const studyCategoryValidator = v.union(
  v.literal('alphabet'),
  v.literal('vocabulary'),
  v.literal('grammar'),
  v.literal('exam'),
  v.literal('all'),
);
export const studyFilterFields = {
  ...alphabetFilterFields,
  category: v.optional(studyCategoryValidator),
};
export const studySnapshotValidator = v.union(
  alphabetSnapshotValidator,
  v.object({
    ...vocabularyContentFields,
    category: v.literal('vocabulary'),
    contentVersion: v.number(),
  }),
  v.object({
    ...grammarContentFields,
    category: v.literal('grammar'),
    contentVersion: v.number(),
  }),
  v.object({
    ...examContentFields,
    category: v.literal('exam'),
    contentVersion: v.number(),
  }),
);
