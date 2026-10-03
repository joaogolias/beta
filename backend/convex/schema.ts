import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  alphabetContentFields,
  studyRatingValidator,
} from './alphabetValidators';
import { vocabularyContentFields } from './vocabularyValidators';
import { grammarContentFields } from './grammarValidators';
import { examContentFields } from './examValidators';
import { jlptPaperFields, jlptAttemptFields } from './jlptValidators';
import {
  studyCardIdValidator,
  studyFilterFields,
  studySnapshotValidator,
} from './studyValidators';

export default defineSchema({
  streakRuns: defineTable({
    ownerId: v.id('users'),
    start: v.number(),
    end: v.number(),
  }).index('by_ownerId_and_start', ['ownerId', 'start']),
  streakTotals: defineTable({ ownerId: v.id('users'), best: v.number() }).index(
    'by_ownerId',
    ['ownerId'],
  ),
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  }).index('by_tokenIdentifier', ['tokenIdentifier']),
  alphabetCards: defineTable({
    ...alphabetContentFields,
    ownerId: v.id('users'),
    archived: v.boolean(),
    readingSortKey: v.optional(v.string()),
    cardOrderKey: v.optional(v.string()),
    contentVersion: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_ownerId_and_language_and_writingSystem_and_symbol', [
      'ownerId',
      'language',
      'writingSystem',
      'symbol',
    ])
    .index('by_ownerId_and_writingSystem_and_symbol_and_language', [
      'ownerId',
      'writingSystem',
      'symbol',
      'language',
    ])
    .index('by_ownerId_and_archived_and_sortKey', [
      'ownerId',
      'archived',
      'sortKey',
    ])
    .index('by_ownerId_and_archived_and_readingSortKey', [
      'ownerId',
      'archived',
      'readingSortKey',
    ])
    .index('by_ownerId_and_archived_and_cardOrderKey_and_createdAt', [
      'ownerId',
      'archived',
      'cardOrderKey',
      'createdAt',
    ]),
  vocabularyCards: defineTable({
    ...vocabularyContentFields,
    expressionKey: v.string(),
    readingKey: v.string(),
    readingSortKey: v.optional(v.string()),
    cardOrderKey: v.optional(v.string()),
    ownerId: v.id('users'),
    archived: v.boolean(),
    contentVersion: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_ownerId_and_language_and_expressionKey_and_readingKey', [
      'ownerId',
      'language',
      'expressionKey',
      'readingKey',
    ])
    .index('by_ownerId_and_archived_and_sortKey', [
      'ownerId',
      'archived',
      'sortKey',
    ])
    .index('by_ownerId_and_archived_and_readingSortKey', [
      'ownerId',
      'archived',
      'readingSortKey',
    ])
    .index('by_ownerId_and_archived_and_cardOrderKey_and_createdAt', [
      'ownerId',
      'archived',
      'cardOrderKey',
      'createdAt',
    ]),
  grammarCards: defineTable({
    ...grammarContentFields,
    readingSortKey: v.string(),
    cardOrderKey: v.optional(v.string()),
    ownerId: v.id('users'),
    archived: v.boolean(),
    contentVersion: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_ownerId_and_archived_and_sortKey', [
      'ownerId',
      'archived',
      'sortKey',
    ])
    .index('by_ownerId_and_archived_and_readingSortKey', [
      'ownerId',
      'archived',
      'readingSortKey',
    ])
    .index('by_ownerId_and_archived_and_cardOrderKey_and_createdAt', [
      'ownerId',
      'archived',
      'cardOrderKey',
      'createdAt',
    ]),
  examCards: defineTable({
    ...examContentFields,
    readingSortKey: v.string(),
    cardOrderKey: v.optional(v.string()),
    ownerId: v.id('users'),
    archived: v.boolean(),
    contentVersion: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_ownerId_and_archived_and_sortKey', [
      'ownerId',
      'archived',
      'sortKey',
    ])
    .index('by_ownerId_and_archived_and_readingSortKey', [
      'ownerId',
      'archived',
      'readingSortKey',
    ])
    .index('by_ownerId_and_archived_and_cardOrderKey_and_createdAt', [
      'ownerId',
      'archived',
      'cardOrderKey',
      'createdAt',
    ]),
  jlptPapers: defineTable({
    ...jlptPaperFields,
    ownerId: v.id('users'),
    archived: v.boolean(),
    contentVersion: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_ownerId_and_archived_and_title', [
      'ownerId',
      'archived',
      'title',
    ])
    .index('by_ownerId_and_archived_and_level_and_title', [
      'ownerId',
      'archived',
      'level',
      'title',
    ]),
  jlptAttempts: defineTable({
    ...jlptAttemptFields,
    ownerId: v.id('users'),
    paperId: v.id('jlptPapers'),
  })
    .index('by_ownerId_and_status', ['ownerId', 'status'])
    .index('by_ownerId_and_startedAt', ['ownerId', 'startedAt'])
    .index('by_ownerId_and_paperId_and_startedAt', [
      'ownerId',
      'paperId',
      'startedAt',
    ]),
  studySessions: defineTable({
    ownerId: v.id('users'),
    mode: v.union(v.literal('direct'), v.literal('adaptive')),
    order: v.union(v.literal('sorted'), v.literal('random')),
    filters: v.object(studyFilterFields),
    status: v.union(
      v.literal('active'),
      v.literal('completed'),
      v.literal('ended'),
    ),
    total: v.number(),
    position: v.number(),
    answered: v.number(),
    correct: v.number(),
    partial: v.number(),
    incorrect: v.number(),
    skipped: v.number(),
    revision: v.optional(v.number()),
    offlineQueue: v.optional(v.boolean()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index('by_ownerId_and_status', ['ownerId', 'status']),
  studyPresentations: defineTable({
    ownerId: v.id('users'),
    sessionId: v.id('studySessions'),
    cardId: studyCardIdValidator,
    position: v.number(),
    snapshot: studySnapshotValidator,
    presentedAt: v.optional(v.number()),
    revealedAt: v.optional(v.number()),
    answeredAt: v.optional(v.number()),
    rating: v.optional(studyRatingValidator),
    skipped: v.boolean(),
  }).index('by_sessionId_and_position', ['sessionId', 'position']),
  studyStats: defineTable({
    ownerId: v.id('users'),
    cardId: studyCardIdValidator,
    correct: v.number(),
    partial: v.number(),
    incorrect: v.number(),
    attempts: v.number(),
    lastReviewedAt: v.number(),
  }).index('by_ownerId_and_cardId', ['ownerId', 'cardId']),
  studyTotals: defineTable({
    ownerId: v.id('users'),
    correct: v.number(),
    partial: v.number(),
    incorrect: v.number(),
    attempts: v.number(),
    reviewedCards: v.number(),
  }).index('by_ownerId', ['ownerId']),
  studyAttempts: defineTable({
    ownerId: v.id('users'),
    cardId: studyCardIdValidator,
    sessionId: v.id('studySessions'),
    presentationId: v.id('studyPresentations'),
    snapshot: studySnapshotValidator,
    rating: studyRatingValidator,
    mode: v.optional(v.union(v.literal('direct'), v.literal('adaptive'))),
    reviewedAt: v.number(),
  })
    .index('by_presentationId', ['presentationId'])
    .index('by_ownerId_and_cardId', ['ownerId', 'cardId'])
    .index('by_ownerId_and_cardId_and_reviewedAt', [
      'ownerId',
      'cardId',
      'reviewedAt',
    ])
    .index('by_ownerId_and_reviewedAt', ['ownerId', 'reviewedAt']),
  offlineAliases: defineTable({
    ownerId: v.id('users'),
    localId: v.string(),
    serverId: v.string(),
  }).index('by_ownerId_and_localId', ['ownerId', 'localId']),
  offlineReceipts: defineTable({
    ownerId: v.id('users'),
    operationId: v.string(),
    command: v.string(),
    result: v.string(),
    appliedAt: v.number(),
  }).index('by_ownerId_and_operationId', ['ownerId', 'operationId']),
});
