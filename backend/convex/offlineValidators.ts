import { v, type Infer } from 'convex/values';
import {
  alphabetCreateValidator,
  alphabetPatchValidator,
  studyRatingValidator,
} from './alphabetValidators';
import {
  vocabularyCreateValidator,
  vocabularyPatchValidator,
} from './vocabularyValidators';
import {
  grammarCreateValidator,
  grammarPatchValidator,
} from './grammarValidators';
import { studyFilterFields, studySnapshotValidator } from './studyValidators';
import { examCreateValidator, examPatchValidator } from './examValidators';
import {
  jlptPaperValidator,
  jlptPatchValidator,
  jlptSnapshotValidator,
  jlptAnswerFields,
} from './jlptValidators';

const updateFields = {
  type: v.literal('card.update'),
  id: v.string(),
  expectedContentVersion: v.number(),
  expectedArchived: v.boolean(),
  force: v.optional(v.boolean()),
};
const presentationFields = {
  sessionId: v.string(),
  presentationId: v.string(),
  expectedRevision: v.number(),
  occurredAt: v.number(),
};

export const offlineCommandValidator = v.union(
  v.object({
    type: v.literal('jlpt.create'),
    localId: v.string(),
    paper: jlptPaperValidator,
  }),
  v.object({
    type: v.literal('jlpt.update'),
    id: v.string(),
    patch: jlptPatchValidator,
    expectedContentVersion: v.number(),
    expectedArchived: v.boolean(),
    force: v.optional(v.boolean()),
  }),
  v.object({
    type: v.literal('jlpt.archive'),
    id: v.string(),
    archived: v.boolean(),
    expectedContentVersion: v.number(),
    expectedArchived: v.boolean(),
    force: v.optional(v.boolean()),
  }),
  v.object({
    type: v.literal('jlpt.start'),
    localId: v.string(),
    paperId: v.string(),
    snapshot: jlptSnapshotValidator,
    startedAt: v.number(),
  }),
  v.object({
    type: v.literal('jlpt.answer'),
    attemptId: v.string(),
    expectedRevision: v.number(),
    occurredAt: v.number(),
    ...jlptAnswerFields,
  }),
  v.object({
    type: v.literal('jlpt.advance'),
    attemptId: v.string(),
    expectedRevision: v.number(),
    occurredAt: v.number(),
  }),
  v.object({
    type: v.literal('jlpt.finish'),
    attemptId: v.string(),
    expectedRevision: v.number(),
    occurredAt: v.number(),
  }),
  v.object({
    type: v.literal('card.create'),
    category: v.literal('exam'),
    localId: v.string(),
    createdAt: v.optional(v.number()),
    card: examCreateValidator,
  }),
  v.object({
    ...updateFields,
    category: v.literal('exam'),
    patch: examPatchValidator,
  }),
  v.object({
    type: v.literal('card.create'),
    category: v.literal('alphabet'),
    localId: v.string(),
    createdAt: v.optional(v.number()),
    card: alphabetCreateValidator,
  }),
  v.object({
    type: v.literal('card.create'),
    category: v.literal('vocabulary'),
    localId: v.string(),
    createdAt: v.optional(v.number()),
    card: vocabularyCreateValidator,
  }),
  v.object({
    type: v.literal('card.create'),
    category: v.literal('grammar'),
    localId: v.string(),
    createdAt: v.optional(v.number()),
    card: grammarCreateValidator,
  }),
  v.object({
    ...updateFields,
    category: v.literal('alphabet'),
    patch: alphabetPatchValidator,
  }),
  v.object({
    ...updateFields,
    category: v.literal('vocabulary'),
    patch: vocabularyPatchValidator,
  }),
  v.object({
    ...updateFields,
    category: v.literal('grammar'),
    patch: grammarPatchValidator,
  }),
  v.object({
    type: v.literal('card.archive'),
    category: v.union(
      v.literal('alphabet'),
      v.literal('vocabulary'),
      v.literal('grammar'),
      v.literal('exam'),
    ),
    id: v.string(),
    archived: v.boolean(),
    expectedContentVersion: v.number(),
    expectedArchived: v.boolean(),
    force: v.optional(v.boolean()),
  }),
  v.object({
    type: v.literal('study.start'),
    localId: v.string(),
    mode: v.union(v.literal('direct'), v.literal('adaptive')),
    order: v.union(v.literal('sorted'), v.literal('random')),
    filters: v.object(studyFilterFields),
    queue: v.array(
      v.object({
        localId: v.string(),
        cardId: v.string(),
        snapshot: studySnapshotValidator,
      }),
    ),
    createdAt: v.number(),
    force: v.optional(v.boolean()),
  }),
  v.object({ type: v.literal('study.reveal'), ...presentationFields }),
  v.object({
    type: v.literal('study.rate'),
    ...presentationFields,
    rating: studyRatingValidator,
    skippedPresentationIds: v.optional(v.array(v.string())),
  }),
  v.object({ type: v.literal('study.undo'), ...presentationFields }),
  v.object({
    type: v.literal('study.finish'),
    sessionId: v.string(),
    expectedRevision: v.optional(v.number()),
    occurredAt: v.number(),
  }),
);

export type OfflineCommand = Infer<typeof offlineCommandValidator>;
