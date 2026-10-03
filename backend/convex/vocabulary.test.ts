import { afterEach, describe, expect, test, vi } from 'vitest';
import type { FunctionReturnType } from 'convex/server';
import { api } from './_generated/api';
import { formatVocabularyFaces, isKanaReading } from '../../shared/vocabulary';
import type {
  VocabularyContent,
  VocabularyCreateInput,
} from './vocabularyDomain';
import { createTestBackend, learnerIdentity } from './test-support.helpers';
import { libraryReadingSortKey } from '../../shared/libraryOrder';

afterEach(() => vi.unstubAllEnvs());

const school: VocabularyContent = {
  language: 'ja',
  expression: '学校',
  reading: 'がっこう',
  translations: { pt: ['escola'], en: ['school'] },
  examples: [
    {
      text: '学校に行きます。',
      reading: 'がっこうにいきます',
      meaning: 'Vou à escola.',
    },
  ],
  front: 'Como se diz escola?',
  back: '学校（がっこう） · escola / school',
  sortKey: 'がっこう',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
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

describe('personal vocabulary', () => {
  test('projects legacy faces immediately and persists their revision before a new study snapshot', async () => {
    const { backend, learner } = await setup();
    const original = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    await backend.run((ctx) =>
      ctx.db.patch(original._id, {
        front: 'Frente manual antiga',
        back: 'Verso manual antigo',
        readingOmitted: undefined,
      }),
    );
    const projected = await learner.query(api.vocabulary.get, {
      id: original._id,
    });
    expect(projected).toMatchObject({
      front: '学校',
      back: original.back,
      contentVersion: 2,
    });
    expect(
      (await backend.run((ctx) => ctx.db.get(original._id)))?.contentVersion,
    ).toBe(1);
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'vocabulary',
      limit: 1,
    });
    expect(
      (await learner.query(api.study.current, { sessionId: session._id }))
        .presentation?.snapshot,
    ).toMatchObject({
      front: '学校',
      back: original.back,
      contentVersion: 2,
      readingOmitted: false,
    });
    expect(
      (await backend.run((ctx) => ctx.db.get(original._id)))?.contentVersion,
    ).toBe(2);
    expect(
      (
        await learner.mutation(api.vocabulary.update, {
          id: original._id,
          patch: { front: 'ignored', back: 'ignored', sortKey: 'ignored' },
        })
      ).contentVersion,
    ).toBe(2);
    const changed = await learner.mutation(api.vocabulary.update, {
      id: original._id,
      patch: { translations: { pt: ['colégio'] } },
    });
    expect(changed).toMatchObject({ contentVersion: 3 });
    expect(
      (await learner.query(api.study.current, { sessionId: session._id }))
        .presentation?.snapshot,
    ).toMatchObject({ back: original.back, contentVersion: 2 });
  });

  test('omits reading only by explicit choice, derives faces and prevents duplicate readingless expressions', async () => {
    const { learner } = await setup();
    const input: VocabularyCreateInput = { ...school };
    delete input.reading;
    delete input.front;
    delete input.back;
    delete input.sortKey;
    await expect(
      learner.mutation(api.vocabulary.create, { card: input }),
    ).rejects.toThrow('Leitura');
    const card = await learner.mutation(api.vocabulary.create, {
      card: { ...input, readingOmitted: true },
    });
    expect(card).toMatchObject({
      reading: '',
      readingOmitted: true,
      sortKey: '',
      front: '学校',
      contentVersion: 1,
    });
    expect(card.back).toBe(
      'Português: escola\nEnglish: school\nExemplos\n学校に行きます。\nがっこうにいきます\nVou à escola.',
    );
    await expect(
      learner.mutation(api.vocabulary.create, {
        card: { ...input, readingOmitted: true, reading: 'ignored' },
      }),
    ).rejects.toThrow('CONFLICT');
    expect(
      await learner.mutation(api.vocabulary.update, {
        id: card._id,
        patch: { front: 'ignored', back: 'ignored', sortKey: 'ignored' },
      }),
    ).toEqual(card);
    await expect(
      learner.mutation(api.vocabulary.update, {
        id: card._id,
        patch: { readingOmitted: false },
      }),
    ).rejects.toThrow('Leitura');
    const restored = await learner.mutation(api.vocabulary.update, {
      id: card._id,
      patch: { readingOmitted: false, reading: 'がっこう' },
    });
    expect(restored).toMatchObject({
      reading: 'がっこう',
      readingOmitted: false,
      sortKey: 'がっこう',
      contentVersion: 2,
    });
    expect(restored.back.startsWith('読み方 · Leitura: がっこう\n')).toBe(true);
    const cleared = await learner.mutation(api.vocabulary.update, {
      id: card._id,
      patch: { readingOmitted: true },
    });
    expect(cleared).toMatchObject({
      reading: '',
      readingOmitted: true,
      contentVersion: 3,
    });
    await learner.mutation(api.vocabulary.archive, { id: card._id });
    await expect(
      learner.mutation(api.vocabulary.create, {
        card: { ...input, readingOmitted: true },
      }),
    ).rejects.toThrow('arquivados');
  });

  test('pages all hiragana before katakana with stable equivalent-reading ties and intersecting filters', async () => {
    vi.stubEnv('LIBRARY_CARD_ORDER_ENABLED', 'true');
    const { learner, other } = await setup();
    for (const [expression, reading, level] of [
      ['水', 'みず', 'N5'],
      ['コーヒー', 'コーヒー', 'N5'],
      ['紅茶', 'こうちゃ', 'N4'],
      ['珈琲', 'こーひー', 'N5'],
      ['会う', 'あう', 'N5'],
    ])
      await learner.mutation(api.vocabulary.create, {
        card: {
          ...school,
          expression,
          reading,
          sortKey: reading,
          classifications: [{ scheme: 'jlpt', level }],
        },
      });
    await other.mutation(api.vocabulary.create, { card: school });
    const readAll = async (level?: string) => {
      let cursor: string | null = null;
      const expressions: string[] = [];
      for (let page = 0; page < 10; page += 1) {
        const result: FunctionReturnType<typeof api.vocabulary.search> =
          await learner.query(api.vocabulary.search, {
            level,
            terms: ['school', 'escola'],
            operator: 'OR',
            paginationOpts: { cursor, numItems: 1 },
          });
        expressions.push(...result.page.map(({ expression }) => expression));
        if (result.isDone) return expressions;
        cursor = result.continueCursor;
      }
      throw new Error('Pagination did not finish');
    };
    expect(await readAll()).toEqual(['会う', '紅茶', '珈琲', '水', 'コーヒー']);
    expect(await readAll('N5')).toEqual(['会う', '珈琲', '水', 'コーヒー']);
    expect(await readAll()).toEqual(['会う', '紅茶', '珈琲', '水', 'コーヒー']);
  });

  test('maintains derived ordering on edits and repairs missing metadata without changing versions or user content', async () => {
    const { backend, learner } = await setup();
    const card = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    await backend.run((ctx) =>
      ctx.db.patch('vocabularyCards', card._id, { readingSortKey: undefined }),
    );
    expect(
      await learner.mutation(api.vocabulary.update, {
        id: card._id,
        patch: {},
      }),
    ).toEqual(card);
    const ignored = await learner.mutation(api.vocabulary.update, {
      id: card._id,
      patch: { sortKey: 'コーヒー' },
    });
    expect(ignored).toEqual(card);
    const changed = await learner.mutation(api.vocabulary.update, {
      id: card._id,
      patch: { reading: 'コーヒー' },
    });
    expect(changed).toMatchObject({
      sortKey: 'コーヒー',
      readingSortKey: libraryReadingSortKey('こーひー'),
      contentVersion: 2,
    });
    expect(
      await learner.mutation(api.vocabulary.update, {
        id: card._id,
        patch: {},
      }),
    ).toEqual(changed);
  });

  test('preserves kana spelling and derives faces from facts, with normalized language and multiple levels', async () => {
    const { learner } = await setup();
    const created = await learner.mutation(api.vocabulary.create, {
      card: {
        ...school,
        language: ' JA-jp ',
        expression: ' 学校 ',
        reading: ' ガッコウ ',
        translations: { pt: [' escola ', 'escola'], en: ['school'] },
        classifications: [
          { scheme: 'JLPT', level: 'n5' },
          { scheme: 'jlpt', level: 'N4' },
        ],
      },
    });
    expect(created).toMatchObject({
      language: 'ja-jp',
      expression: '学校',
      reading: 'ガッコウ',
      translations: { pt: ['escola'], en: ['school'] },
      front: school.expression,
      back: '読み方 · Leitura: ガッコウ\nPortuguês: escola\nEnglish: school\nExemplos\n学校に行きます。\nがっこうにいきます\nVou à escola.',
      contentVersion: 1,
    });
    for (const level of ['N4', 'N5']) {
      const page = await learner.query(api.vocabulary.search, {
        language: 'ja',
        level,
        paginationOpts: { cursor: null, numItems: 10 },
      });
      expect(page.page.map(({ _id }) => _id)).toEqual([created._id]);
    }
    expect(formatVocabularyFaces(school)).toEqual({
      front: '学校',
      back: '読み方 · Leitura: がっこう\nPortuguês: escola\nEnglish: school\nExemplos\n学校に行きます。\nがっこうにいきます\nVou à escola.',
    });
  });

  test('requires a kana reading unless explicitly omitted, a translation, valid JLPT levels and bounded content', async () => {
    const { learner } = await setup();
    const invalid: VocabularyContent[] = [
      { ...school, reading: 'gakkou' },
      { ...school, reading: '学校' },
      { ...school, reading: '' },
      { ...school, translations: {} },
      { ...school, translations: { pt: [], en: [] } },
      { ...school, translations: { pt: [' '] } },
      { ...school, classifications: [] },
      { ...school, classifications: [{ scheme: 'jlpt', level: 'N6' }] },
      {
        ...school,
        classifications: [
          { scheme: 'jlpt', level: 'N5' },
          { scheme: 'JLPT', level: 'n5' },
        ],
      },
      {
        ...school,
        translations: { en: Array.from({ length: 33 }, () => 'school') },
      },
      { ...school, examples: [{ text: '' }] },
    ];
    for (const card of invalid)
      await expect(
        learner.mutation(api.vocabulary.create, { card }),
      ).rejects.toThrow('VALIDATION');
    for (const reading of [
      'がっこう',
      'ガッコウ',
      'ｶﾞｯｺｳ',
      'コーヒー',
      'ひらがな・カタカナ',
    ])
      expect(isKanaReading(reading)).toBe(true);
    for (const reading of ['', 'ー', '123', 'abc', '学こう'])
      expect(isKanaReading(reading)).toBe(false);
    expect(
      await learner.mutation(api.vocabulary.create, {
        card: { ...school, translations: { en: ['school'] } },
      }),
    ).toMatchObject({ translations: { en: ['school'] } });
  });

  test('merges translation edits by language, keeps omitted data and versions only effective changes', async () => {
    const { learner } = await setup();
    const card = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    expect(
      await learner.mutation(api.vocabulary.update, {
        id: card._id,
        patch: {},
      }),
    ).toEqual(card);
    const changed = await learner.mutation(api.vocabulary.update, {
      id: card._id,
      patch: { translations: { pt: ['colégio'] } },
    });
    expect(changed).toMatchObject({
      translations: { pt: ['colégio'], en: ['school'] },
      reading: card.reading,
      front: card.front,
      back: card.back.replace('Português: escola', 'Português: colégio'),
      examples: card.examples,
      contentVersion: 2,
    });
    expect(
      await learner.mutation(api.vocabulary.update, {
        id: card._id,
        patch: { translations: { pt: ['colégio'] } },
      }),
    ).toEqual(changed);
    const cleared = await learner.mutation(api.vocabulary.update, {
      id: card._id,
      patch: { translations: { pt: [] } },
    });
    expect(cleared).toMatchObject({
      translations: { pt: [], en: ['school'] },
      contentVersion: 3,
    });
    await expect(
      learner.mutation(api.vocabulary.update, {
        id: card._id,
        patch: { translations: { en: [] } },
      }),
    ).rejects.toThrow('tradução');
    expect(await learner.query(api.vocabulary.get, { id: card._id })).toEqual(
      cleared,
    );
  });

  test('prevents normalized duplicate readings but allows homographs, archived restore and other owners', async () => {
    const { learner, other } = await setup();
    const card = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    await expect(
      learner.mutation(api.vocabulary.create, {
        card: { ...school, reading: 'ｶﾞｯｺｳ' },
      }),
    ).rejects.toThrow('CONFLICT');
    const otherReading = await learner.mutation(api.vocabulary.create, {
      card: { ...school, reading: 'まなびや' },
    });
    await expect(
      learner.mutation(api.vocabulary.update, {
        id: otherReading._id,
        patch: { reading: 'ガッコウ' },
      }),
    ).rejects.toThrow('CONFLICT');
    await learner.mutation(api.vocabulary.archive, { id: card._id });
    await expect(
      learner.mutation(api.vocabulary.create, { card: school }),
    ).rejects.toThrow('arquivados');
    expect(
      await learner.mutation(api.vocabulary.restore, { id: card._id }),
    ).toMatchObject({ archived: false, contentVersion: 1 });
    expect(
      (await other.mutation(api.vocabulary.create, { card: school }))._id,
    ).not.toBe(card._id);
  });

  test('simultaneous duplicate creates persist a single card', async () => {
    const { learner, backend } = await setup();
    const results = await Promise.allSettled([
      learner.mutation(api.vocabulary.create, { card: school }),
      learner.mutation(api.vocabulary.create, {
        card: { ...school, reading: 'ガッコウ' },
      }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(
      await backend.run((ctx) => ctx.db.query('vocabularyCards').take(2)),
    ).toHaveLength(1);
  });

  test('isolates get, search, writes and archived data using the authenticated identity', async () => {
    const { learner, other, backend } = await setup();
    const card = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    expect(await other.query(api.vocabulary.get, { id: card._id })).toBeNull();
    expect(
      (
        await other.query(api.vocabulary.search, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
    await expect(
      other.mutation(api.vocabulary.update, {
        id: card._id,
        patch: { front: 'outra frente' },
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.vocabulary.archive, { id: card._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.vocabulary.restore, { id: card._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      backend.mutation(api.vocabulary.create, { card: school }),
    ).rejects.toThrow('UNAUTHENTICATED');
    await expect(
      backend.query(api.vocabulary.get, { id: card._id }),
    ).rejects.toThrow('UNAUTHENTICATED');
    await learner.mutation(api.vocabulary.archive, { id: card._id });
    expect(
      (
        await learner.query(api.vocabulary.search, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
    expect(
      (
        await learner.query(api.vocabulary.search, {
          archived: true,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page.map(({ _id }) => _id),
    ).toEqual([card._id]);
    expect(
      (
        await other.query(api.vocabulary.search, {
          archived: true,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
  });

  test('searches all content fields and classifications with kana, case and Latin accent equivalence', async () => {
    const { learner } = await setup();
    const card = await learner.mutation(api.vocabulary.create, {
      card: {
        ...school,
        expression: '水',
        reading: 'ミズ',
        translations: { pt: ['água'], en: ['water'] },
        examples: [
          {
            text: '冷たい水',
            reading: 'つめたいみず',
            meaning: 'líquido frio',
          },
        ],
        front: 'frente especial',
        back: 'verso exclusivo',
        sortKey: 'chave distinta',
      },
    });
    for (const query of [
      '水',
      'みず',
      'ﾐｽﾞ',
      'AGUA',
      'WATER',
      '冷たい',
      'ツメタイ',
      'liquido',
      'N5',
      'JLPT',
      'jlpt:N5',
      'ja',
    ]) {
      expect(
        (
          await learner.query(api.vocabulary.search, {
            query,
            paginationOpts: { cursor: null, numItems: 20 },
          })
        ).page.map(({ _id }) => _id),
      ).toEqual([card._id]);
    }
  });

  test('AND combines terms across fields and OR unions results once while structured filters always intersect', async () => {
    const { learner } = await setup();
    const schoolCard = await learner.mutation(api.vocabulary.create, {
      card: school,
    });
    const water = await learner.mutation(api.vocabulary.create, {
      card: {
        ...school,
        expression: '水',
        reading: 'みず',
        translations: { pt: ['água'] },
        front: '水',
        back: 'água',
        examples: [],
        classifications: [{ scheme: 'jlpt', level: 'N4' }],
      },
    });
    const search = (filters: {
      query?: string;
      terms?: string[];
      operator?: 'AND' | 'OR';
      level?: string;
      language?: string;
    }) =>
      learner.query(api.vocabulary.search, {
        ...filters,
        paginationOpts: { cursor: null, numItems: 20 },
      });
    expect(
      (await search({ query: 'school ガッコウ', terms: ['N5'] })).page.map(
        ({ _id }) => _id,
      ),
    ).toEqual([schoolCard._id]);
    expect((await search({ terms: ['school', 'water'] })).page).toEqual([]);
    expect(
      new Set(
        (
          await search({ terms: ['school', 'água', 'N5'], operator: 'OR' })
        ).page.map(({ _id }) => _id),
      ),
    ).toEqual(new Set([schoolCard._id, water._id]));
    expect(
      (
        await search({ terms: ['school', 'água'], operator: 'OR', level: 'N5' })
      ).page.map(({ _id }) => _id),
    ).toEqual([schoolCard._id]);
    expect(
      (
        await search({
          terms: ['school', 'água'],
          operator: 'OR',
          language: 'ko',
        })
      ).page,
    ).toEqual([]);
  });

  test('stable pagination traverses sparse matches without duplicates or dropping later matches', async () => {
    const { learner } = await setup();
    const expected = [];
    for (let index = 0; index < 7; index += 1) {
      const card = await learner.mutation(api.vocabulary.create, {
        card: {
          ...school,
          expression: `語${index}`,
          sortKey: String(index),
          translations: { pt: [index % 3 === 0 ? 'alvo' : 'outro'] },
        },
      });
      if (index % 3 === 0) expected.push(card._id);
    }
    let cursor: string | null = null;
    const actual = [];
    for (let page = 0; page < 10; page += 1) {
      const result: FunctionReturnType<typeof api.vocabulary.search> =
        await learner.query(api.vocabulary.search, {
          query: 'alvo',
          paginationOpts: { cursor, numItems: 2 },
        });
      actual.push(...result.page.map(({ _id }) => _id));
      if (result.isDone) break;
      expect(result.continueCursor).not.toBe(cursor);
      cursor = result.continueCursor;
    }
    expect(actual).toEqual(expected);
    for (const numItems of [0, 101, 1.5])
      await expect(
        learner.query(api.vocabulary.search, {
          paginationOpts: { cursor: null, numItems },
        }),
      ).rejects.toThrow('VALIDATION');
  });

  test('other languages accept their own reading without kanji fields or Japanese levels', async () => {
    const { learner } = await setup();
    expect(
      await learner.mutation(api.vocabulary.create, {
        card: {
          ...school,
          language: 'ko',
          expression: '학교',
          reading: '학교',
          classifications: [],
        },
      }),
    ).toMatchObject({
      language: 'ko',
      expression: '학교',
      reading: '학교',
      classifications: [],
    });
  });
});
