import { afterEach, describe, expect, test, vi } from 'vitest';
import type { FunctionReturnType } from 'convex/server';
import { api, internal } from './_generated/api';
import { createTestBackend, learnerIdentity } from './test-support.helpers';
import {
  libraryReadingSortKey,
  compareLibraryReadings,
  cardOrderKey,
  compareLibraryCards,
} from '../../shared/libraryOrder';
import { creationTimestamp } from './libraryOrder';

afterEach(() => vi.unstubAllEnvs());

describe('library reading order', () => {
  test('new ordering derives first kun then on, places every hiragana vocabulary before katakana and compares creation timestamps for missing readings', () => {
    const base = { language: 'ja', createdAt: 100 };
    const kanji = {
      ...base,
      details: {
        kind: 'kanji' as const,
        kunYomi: ['みず', 'あ'],
        onYomi: ['ア'],
      },
    };
    expect(cardOrderKey(kanji)).toBe(`0\u0000${libraryReadingSortKey('みず')}`);
    expect(
      cardOrderKey({ ...kanji, details: { ...kanji.details, kunYomi: [] } }),
    ).toBe(`0\u0000${libraryReadingSortKey('ア')}`);
    const entries = [
      {
        ...base,
        _id: 'none-new',
        expression: '無2',
        reading: '',
        readingOmitted: true,
        createdAt: 200,
      },
      { ...base, _id: 'katakana', expression: 'ア', reading: 'ア' },
      { ...base, _id: 'hiragana', expression: 'ん', reading: 'ん' },
      {
        ...base,
        _id: 'none-old',
        expression: '無1',
        reading: '',
        readingOmitted: true,
        createdAt: 50,
      },
    ];
    expect(entries.sort(compareLibraryCards).map(({ _id }) => _id)).toEqual([
      'hiragana',
      'katakana',
      'none-old',
      'none-new',
    ]);
    expect(cardOrderKey({ ...base, expression: 'ア', reading: 'ｱ' })).toBe(
      cardOrderKey({ ...base, expression: 'ア', reading: 'ア' }),
    );
    expect(cardOrderKey({ ...base })).toBe('2');
    expect(creationTimestamp(123, 1000)).toBe(123);
    for (const timestamp of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER])
      expect(() => creationTimestamp(timestamp, 1000)).toThrow('VALIDATION');
  });

  test('new persisted index orders by reading script and offline creation time, including sparse filtered pages', async () => {
    vi.stubEnv('LIBRARY_CARD_ORDER_ENABLED', 'true');
    const backend = createTestBackend();
    const learner = backend.withIdentity(learnerIdentity);
    await learner.mutation(api.users.ensureCurrentUser, {});
    for (const [expression, reading, createdAt, level] of [
      ['無2', '', 50, 'N5'],
      ['ア', 'ア', 10, 'N5'],
      ['ん', 'ん', 40, 'N5'],
      ['無1', '', 20, 'N5'],
      ['同2', 'あ', 100, 'N5'],
      ['同1', 'あ', 5, 'N5'],
      ['隠', 'い', 3, 'N4'],
    ] as const) {
      const card = await learner.mutation(api.vocabulary.create, {
        card: {
          language: 'ja',
          expression,
          reading,
          readingOmitted: !reading,
          translations: { pt: ['palavra'] },
          examples: [],
          classifications: [{ scheme: 'jlpt', level }],
        },
      });
      await backend.run((ctx) => ctx.db.patch(card._id, { createdAt }));
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let count = 0; count < 10; count++) {
      const result: FunctionReturnType<typeof api.vocabulary.search> =
        await learner.query(api.vocabulary.search, {
          level: 'N5',
          paginationOpts: { cursor, numItems: 1 },
        });
      seen.push(...result.page.map(({ expression }) => expression));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(seen).toEqual(['同1', '同2', 'ん', 'ア', '無1', '無2']);
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'vocabulary',
      level: 'N5',
      limit: 10,
    });
    const queue = await backend.run((ctx) =>
      ctx.db
        .query('studyPresentations')
        .withIndex('by_sessionId_and_position', (q) =>
          q.eq('sessionId', session._id),
        )
        .take(10),
    );
    expect(
      queue.map(({ snapshot }) =>
        'expression' in snapshot ? snapshot.expression : '',
      ),
    ).toEqual(seen);
  });

  test('new migration dry runs and resumes all tables, preserves old indexes and frozen history, and increments changed faces only once', async () => {
    vi.stubEnv('LIBRARY_CARD_ORDER_ENABLED', 'false');
    const backend = createTestBackend();
    const learner = backend.withIdentity(learnerIdentity);
    await learner.mutation(api.users.ensureCurrentUser, {});
    const classifications = [{ scheme: 'jlpt', level: 'N5' }];
    const alphabet = await learner.mutation(api.alphabet.create, {
      card: {
        language: 'ja',
        writingSystem: 'Hani',
        symbol: '学',
        meanings: ['aprender'],
        examples: [],
        classifications,
        details: { kind: 'kanji', kunYomi: [], onYomi: ['ガク'], radicals: [] },
      },
    });
    const vocabulary = await learner.mutation(api.vocabulary.create, {
      card: {
        language: 'ja',
        expression: '学校',
        reading: 'がっこう',
        translations: { pt: ['escola'] },
        examples: [],
        classifications,
      },
    });
    const grammar = await learner.mutation(api.grammar.create, {
      card: {
        language: 'ja',
        title: '〜てもいい',
        explanation: 'Explicação completa.',
        classifications,
      },
    });
    const exam = await learner.mutation(api.exams.create, {
      card: {
        language: 'ja',
        title: 'Questão',
        prompt: '問い',
        answer: '答え',
        explanation: '説明',
        alternatives: [],
        classifications,
      },
    });
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'grammar',
      limit: 1,
    });
    const current = await learner.query(api.study.current, {
      sessionId: session._id,
    });
    const presentation = current.presentation!;
    const legacySnapshot = {
      ...presentation.snapshot,
      front: 'Frente manual antiga',
      back: 'Verso manual antigo',
      sortKey: 'legacy-history',
    };
    await backend.run((ctx) =>
      ctx.db.patch(presentation._id, { snapshot: legacySnapshot }),
    );
    await learner.mutation(api.study.reveal, {
      sessionId: session._id,
      presentationId: presentation._id,
    });
    await learner.mutation(api.study.rate, {
      sessionId: session._id,
      presentationId: presentation._id,
      rating: 'correct',
    });
    await learner.mutation(api.vocabulary.archive, { id: vocabulary._id });
    for (const card of [alphabet, vocabulary, grammar, exam])
      await backend.run((ctx) =>
        ctx.db.patch(card._id, {
          sortKey: 'legacy-order',
          readingSortKey: 'legacy-index',
          cardOrderKey: undefined,
        }),
      );
    await backend.run(async (ctx) => {
      await ctx.db.patch(vocabulary._id, {
        front: 'Frente vocab antiga',
        back: 'Verso vocab antigo',
        readingOmitted: undefined,
      });
      await ctx.db.patch(grammar._id, {
        front: legacySnapshot.front,
        back: legacySnapshot.back,
        shortExplanation: undefined,
      });
    });
    const before = await backend.run(async (ctx) => ({
      vocabulary: await ctx.db.get(vocabulary._id),
      grammar: await ctx.db.get(grammar._id),
      presentations: await ctx.db.query('studyPresentations').take(10),
      attempts: await ctx.db.query('studyAttempts').take(10),
      stats: await ctx.db.query('studyStats').take(10),
    }));
    expect(
      (await learner.query(api.vocabulary.get, { id: vocabulary._id }))
        ?.contentVersion,
    ).toBe(2);
    expect(
      (await learner.query(api.grammar.get, { id: grammar._id }))
        ?.contentVersion,
    ).toBe(2);
    for (const table of [
      'alphabetCards',
      'vocabularyCards',
      'grammarCards',
      'examCards',
    ] as const) {
      const args = { table, cursor: null, batchSize: 1 };
      expect(
        await backend.mutation(internal.libraryOrder.backfillCardModel, {
          ...args,
          dryRun: true,
        }),
      ).toMatchObject({ scanned: 1, needsUpdate: 1, updated: 0 });
      expect(
        (await backend.run((ctx) => ctx.db.query(table).take(10)))[0]
          .cardOrderKey,
      ).toBeUndefined();
      let cursor: string | null = null;
      for (let page = 0; page < 10; page++) {
        const result: FunctionReturnType<
          typeof internal.libraryOrder.backfillCardModel
        > = await backend.mutation(internal.libraryOrder.backfillCardModel, {
          ...args,
          cursor,
          dryRun: false,
        });
        expect(result.scanned).toBeLessThanOrEqual(1);
        if (result.isDone) break;
        cursor = result.continueCursor;
      }
      expect(
        await backend.mutation(internal.libraryOrder.backfillCardModel, {
          ...args,
          dryRun: true,
        }),
      ).toMatchObject({ needsUpdate: 0, contentChanges: 0, updated: 0 });
      expect(
        (await backend.run((ctx) => ctx.db.query(table).take(10)))[0],
      ).toMatchObject({
        sortKey: 'legacy-order',
        readingSortKey: 'legacy-index',
      });
    }
    const after = await backend.run(async (ctx) => ({
      vocabulary: await ctx.db.get(vocabulary._id),
      grammar: await ctx.db.get(grammar._id),
      presentations: await ctx.db.query('studyPresentations').take(10),
      attempts: await ctx.db.query('studyAttempts').take(10),
      stats: await ctx.db.query('studyStats').take(10),
    }));
    expect(after.presentations).toEqual(before.presentations);
    expect(after.attempts).toEqual(before.attempts);
    expect(after.stats).toEqual(before.stats);
    expect(after.vocabulary).toMatchObject({
      archived: true,
      front: '学校',
      contentVersion: 2,
      createdAt: vocabulary.createdAt,
    });
    expect(after.grammar).toMatchObject({
      front: '〜てもいい',
      back: '',
      shortExplanation: '',
      explanation: 'Explicação completa.',
      contentVersion: 2,
      createdAt: grammar.createdAt,
    });
    expect(
      (
        await learner.mutation(api.grammar.update, {
          id: grammar._id,
          patch: { front: 'ignored', back: 'ignored', sortKey: 'ignored' },
        })
      ).contentVersion,
    ).toBe(2);
    const next = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'grammar',
      limit: 1,
    });
    expect(
      (await learner.query(api.study.current, { sessionId: next._id }))
        .presentation?.snapshot,
    ).toMatchObject({
      front: '〜てもいい',
      back: '',
      explanation: 'Explicação completa.',
      contentVersion: 2,
    });
    expect(
      (
        await learner.query(api.study.history, {
          cardId: grammar._id,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page[0].snapshot,
    ).toEqual(legacySnapshot);
  });

  test('normalizes kana widths, voices, small kana and vowel extension deterministically', () => {
    expect(libraryReadingSortKey('ｶﾞｯｺｳ')).toBe(
      libraryReadingSortKey('がっこう'),
    );
    expect(libraryReadingSortKey('ガク')).toBe(
      libraryReadingSortKey('か\u3099く'),
    );
    const values = [
      'みず',
      'かん',
      'がく',
      'カキ',
      'あい',
      'コーヒー',
      'こうちゃ',
    ];
    expect(
      values.sort((left, right) =>
        compareLibraryReadings(
          { sortKey: left, language: 'ja' },
          { sortKey: right, language: 'ja' },
        ),
      ),
    ).toEqual(['あい', 'カキ', 'がく', 'かん', 'こうちゃ', 'コーヒー', 'みず']);
    const variants = ['ぱ', 'ば', 'は', 'パ', 'バ', 'ハ'];
    expect(
      variants.sort((left, right) =>
        compareLibraryReadings(
          { sortKey: left, language: 'ja' },
          { sortKey: right, language: 'ja' },
        ),
      ),
    ).toEqual(['は', 'ハ', 'ば', 'バ', 'ぱ', 'パ']);
    expect(libraryReadingSortKey('キャク').split('\u0000')[0]).toBe('きやく');
    expect(libraryReadingSortKey('コーヒー').split('\u0000')[0]).toBe(
      'こおひい',
    );
    expect(libraryReadingSortKey('がっこう', 'ja-jp')).toBe(
      libraryReadingSortKey('ガッコウ'),
    );
    expect(libraryReadingSortKey('  ÉCOLE ', 'fr')).toBe('école');
    expect(libraryReadingSortKey('학교', 'ko')).toBe('학교');
  });

  test('backfills bounded resumable batches idempotently without changing card content, archives, versions or timestamps', async () => {
    vi.stubEnv('LIBRARY_READING_ORDER_ENABLED', 'false');
    const backend = createTestBackend();
    const learner = backend.withIdentity(learnerIdentity);
    await learner.mutation(api.users.ensureCurrentUser, {});
    const kanji = [];
    for (const [symbol, sortKey] of [
      ['木', 'キ'],
      ['愛', 'あい'],
    ])
      kanji.push(
        await learner.mutation(api.alphabet.create, {
          card: {
            language: 'ja',
            writingSystem: 'Hani',
            symbol,
            sortKey,
            meanings: ['significado'],
            examples: [],
            classifications: [{ scheme: 'jlpt', level: 'N5' }],
            details: {
              kind: 'kanji',
              kunYomi: [sortKey],
              onYomi: [],
              radicals: [],
            },
          },
        }),
      );
    const vocabulary = await learner.mutation(api.vocabulary.create, {
      card: {
        language: 'ja',
        expression: 'コーヒー',
        reading: 'コーヒー',
        sortKey: 'コーヒー',
        translations: { pt: ['café'] },
        examples: [],
        front: 'コーヒー',
        back: 'café',
        classifications: [{ scheme: 'jlpt', level: 'N5' }],
      },
    });
    await learner.mutation(api.vocabulary.archive, { id: vocabulary._id });
    for (const card of [...kanji, vocabulary])
      await backend.run((ctx) =>
        ctx.db.patch(card._id, { readingSortKey: undefined }),
      );
    const before = await backend.run(async (ctx) => ({
      alphabet: await ctx.db.query('alphabetCards').take(10),
      vocabulary: await ctx.db.query('vocabularyCards').take(10),
    }));
    expect(
      (
        await learner.query(api.alphabet.search, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page.map(({ symbol }) => symbol),
    ).toEqual(['愛', '木']);
    for (const table of ['alphabetCards', 'vocabularyCards'] as const) {
      const dryRun = await backend.mutation(
        internal.libraryOrder.backfillReadingSortKeys,
        {
          table,
          cursor: null,
          dryRun: true,
          batchSize: 1,
        },
      );
      expect(dryRun).toMatchObject({ scanned: 1, needsUpdate: 1, updated: 0 });
      expect(
        await backend.run(async (ctx) =>
          (await ctx.db.query(table).take(10)).every(
            (card) => card.readingSortKey === undefined,
          ),
        ),
      ).toBe(true);
      let cursor: string | null = null;
      for (let batch = 0; batch < 5; batch += 1) {
        const result: FunctionReturnType<
          typeof internal.libraryOrder.backfillReadingSortKeys
        > = await backend.mutation(
          internal.libraryOrder.backfillReadingSortKeys,
          {
            table,
            cursor,
            dryRun: false,
            batchSize: 1,
          },
        );
        expect(result.scanned).toBeLessThanOrEqual(1);
        if (result.isDone) break;
        cursor = result.continueCursor;
      }
      expect(
        await backend.mutation(internal.libraryOrder.backfillReadingSortKeys, {
          table,
          cursor: null,
          dryRun: false,
          batchSize: 100,
        }),
      ).toMatchObject({ needsUpdate: 0, updated: 0, isDone: true });
      expect(
        await backend.mutation(internal.libraryOrder.backfillReadingSortKeys, {
          table,
          cursor: null,
          dryRun: true,
          batchSize: 100,
        }),
      ).toMatchObject({ needsUpdate: 0, updated: 0, isDone: true });
    }
    const after = await backend.run(async (ctx) => ({
      alphabet: await ctx.db.query('alphabetCards').take(10),
      vocabulary: await ctx.db.query('vocabularyCards').take(10),
    }));
    expect(after).toEqual({
      alphabet: before.alphabet.map((card) => ({
        ...card,
        readingSortKey: libraryReadingSortKey(card.sortKey, card.language),
      })),
      vocabulary: before.vocabulary.map((card) => ({
        ...card,
        readingSortKey: libraryReadingSortKey(card.sortKey, card.language),
      })),
    });
    for (const batchSize of [0, 101, 1.5])
      await expect(
        backend.mutation(internal.libraryOrder.backfillReadingSortKeys, {
          table: 'alphabetCards',
          cursor: null,
          dryRun: false,
          batchSize,
        }),
      ).rejects.toThrow('VALIDATION');
  });
});
