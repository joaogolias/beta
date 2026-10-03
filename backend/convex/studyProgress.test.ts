import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import type { AlphabetContent } from './alphabetDomain';
import type { VocabularyContent } from './vocabularyDomain';
import type { GrammarContent } from './grammarDomain';
import { createTestBackend, learnerIdentity } from './test-support.helpers';
import { aggregateStudyProgress } from '../../shared/studyProgress';

const water: AlphabetContent = {
  language: 'ja',
  writingSystem: 'Hani',
  symbol: '水',
  meanings: ['água'],
  examples: [],
  front: '水',
  back: 'água',
  sortKey: 'みず',
  classifications: [
    { scheme: 'jlpt', level: 'N5' },
    { scheme: 'jlpt', level: 'N4' },
  ],
  details: { kind: 'kanji', kunYomi: ['みず'], onYomi: [], radicals: [] },
};
const school: VocabularyContent = {
  language: 'ja',
  expression: '学校',
  reading: 'がっこう',
  translations: { pt: ['escola'] },
  examples: [],
  front: '学校',
  back: 'escola',
  sortKey: 'がっこう',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
};
const permission: GrammarContent = {
  language: 'ja',
  title: '〜てもいい',
  explanation: 'Pedir permissão',
  examples: [{ text: '座ってもいいですか。' }],
  front: 'Como pedir permissão?',
  back: '〜てもいい',
  sortKey: 'てもいい',
  classifications: [{ scheme: 'jlpt', level: 'N4' }],
};

async function setup() {
  const backend = createTestBackend();
  const learner = backend.withIdentity(learnerIdentity);
  await learner.mutation(api.users.ensureCurrentUser, {});
  const other = backend.withIdentity({
    ...learnerIdentity,
    subject: 'other',
    tokenIdentifier: `${learnerIdentity.issuer}|other`,
  });
  await other.mutation(api.users.ensureCurrentUser, {});
  return { backend, learner, other };
}

describe('study progress overview', () => {
  test('empty libraries and never-studied cards have undefined rates, not zero percent', async () => {
    const { learner } = await setup();
    expect(await learner.query(api.studyProgress.overview, {})).toEqual({
      totalCards: 0,
      studiedCards: 0,
      neverStudiedCards: 0,
      correct: 0,
      partial: 0,
      incorrect: 0,
      attempts: 0,
      integralAccuracy: null,
      weightedAccuracy: null,
    });
    await learner.mutation(api.alphabet.create, { card: water });
    expect(await learner.query(api.studyProgress.overview, {})).toMatchObject({
      totalCards: 1,
      studiedCards: 0,
      neverStudiedCards: 1,
      integralAccuracy: null,
      weightedAccuracy: null,
    });
  });

  test('sums outcomes and computes integral and weighted rates across cards without duplicating multiple levels', async () => {
    const { backend, learner } = await setup();
    const kanji = await learner.mutation(api.alphabet.create, { card: water });
    const vocabulary = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    await learner.mutation(api.grammar.create, { card: permission });
    await backend.run(async (ctx) => {
      await ctx.db.insert('studyStats', {
        ownerId: kanji.ownerId,
        cardId: kanji._id,
        correct: 2,
        partial: 0,
        incorrect: 0,
        attempts: 2,
        lastReviewedAt: 1,
      });
      await ctx.db.insert('studyStats', {
        ownerId: vocabulary.ownerId,
        cardId: vocabulary._id,
        correct: 0,
        partial: 1,
        incorrect: 1,
        attempts: 2,
        lastReviewedAt: 2,
      });
    });
    expect(await learner.query(api.studyProgress.overview, {})).toEqual({
      totalCards: 3,
      studiedCards: 2,
      neverStudiedCards: 1,
      correct: 2,
      partial: 1,
      incorrect: 1,
      attempts: 4,
      integralAccuracy: 0.5,
      weightedAccuracy: 0.625,
    });
    expect(
      await learner.query(api.studyProgress.overview, { level: 'N5' }),
    ).toMatchObject({ totalCards: 2, studiedCards: 2, attempts: 4 });
    expect(
      await learner.query(api.studyProgress.overview, { level: 'N4' }),
    ).toMatchObject({ totalCards: 2, studiedCards: 1, attempts: 2 });
    expect(
      await learner.query(api.studyProgress.overview, {
        level: 'N4',
        category: 'vocabulary',
      }),
    ).toMatchObject({ totalCards: 0, attempts: 0, weightedAccuracy: null });
    expect(
      await learner.query(api.studyProgress.overview, { category: 'grammar' }),
    ).toMatchObject({ totalCards: 1, neverStudiedCards: 1 });
  });

  test('edits and archival change membership while preserving historical performance, and undo resets studied status', async () => {
    const { learner } = await setup();
    const card = await learner.mutation(api.alphabet.create, { card: water });
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 10,
    });
    const current = await learner.query(api.study.current, {
      sessionId: session._id,
    });
    const args = {
      sessionId: session._id,
      presentationId: current.presentation!._id,
      expectedRevision: 0,
    };
    await learner.mutation(api.study.reveal, args);
    await learner.mutation(api.study.rate, { ...args, rating: 'partial' });
    await learner.mutation(api.alphabet.archive, { id: card._id });
    expect(await learner.query(api.studyProgress.overview, {})).toMatchObject({
      totalCards: 0,
      attempts: 0,
    });
    expect(
      await learner.query(api.studyProgress.overview, { archived: true }),
    ).toMatchObject({
      totalCards: 1,
      studiedCards: 1,
      partial: 1,
      attempts: 1,
    });
    await learner.mutation(api.alphabet.restore, { id: card._id });
    await learner.mutation(api.alphabet.update, {
      id: card._id,
      patch: { classifications: [{ scheme: 'jlpt', level: 'N3' }] },
    });
    expect(
      await learner.query(api.studyProgress.overview, { level: 'N5' }),
    ).toMatchObject({ totalCards: 0, attempts: 0 });
    expect(
      await learner.query(api.studyProgress.overview, { level: 'N3' }),
    ).toMatchObject({ totalCards: 1, partial: 1, weightedAccuracy: 0.5 });
    await learner.mutation(api.study.undo, args);
    expect(await learner.query(api.studyProgress.overview, {})).toMatchObject({
      totalCards: 1,
      studiedCards: 0,
      neverStudiedCards: 1,
      attempts: 0,
      integralAccuracy: null,
    });
  });

  test('authentication and owner-scoped indexes isolate both cards and statistics', async () => {
    const { backend, learner, other } = await setup();
    await learner.mutation(api.alphabet.create, { card: water });
    await learner.mutation(api.vocabulary.create, { card: school });
    await learner.mutation(api.grammar.create, { card: permission });
    await expect(backend.query(api.studyProgress.overview, {})).rejects.toThrow(
      'UNAUTHENTICATED',
    );
    expect(await other.query(api.studyProgress.overview, {})).toMatchObject({
      totalCards: 0,
      attempts: 0,
    });
    await expect(
      learner.query(api.studyProgress.overview, {
        // @ts-expect-error Runtime callers can still send malformed filters.
        level: 'N6',
      }),
    ).rejects.toThrow();
  });

  test('rejects an oversized library explicitly instead of displaying truncated counts', async () => {
    const { backend, learner } = await setup();
    const first = await learner.mutation(api.alphabet.create, { card: water });
    await backend.run(async (ctx) => {
      for (let index = 0; index < 1000; index += 1)
        await ctx.db.insert('alphabetCards', {
          ...water,
          symbol: String(index),
          ownerId: first.ownerId,
          archived: false,
          contentVersion: 1,
          createdAt: 1,
          updatedAt: 1,
        });
    });
    await expect(learner.query(api.studyProgress.overview, {})).rejects.toThrow(
      '1.000 cards',
    );
    expect(
      await learner.query(api.studyProgress.overview, { category: 'grammar' }),
    ).toMatchObject({ totalCards: 0 });
  });

  test('the shared offline projection deduplicates cards and uses the sum of outcomes for its denominator', () => {
    const card = {
      _id: 'water',
      category: 'alphabet' as const,
      archived: false,
      classifications: water.classifications,
    };
    expect(
      aggregateStudyProgress(
        [card, card],
        [
          {
            cardId: card._id,
            correct: 2,
            partial: 1,
            incorrect: 1,
            attempts: 4,
          },
        ],
        { level: 'N5' },
      ),
    ).toMatchObject({
      totalCards: 1,
      studiedCards: 1,
      attempts: 4,
      integralAccuracy: 0.5,
      weightedAccuracy: 0.625,
    });
  });
});
