import { afterEach, describe, expect, test, vi } from 'vitest';
import type { FunctionReturnType } from 'convex/server';
import { api } from './_generated/api';
import { libraryReadingSortKey } from '../../shared/libraryOrder';
import type { GrammarContent } from './grammarDomain';
import { createTestBackend, learnerIdentity } from './test-support.helpers';

afterEach(() => vi.unstubAllEnvs());

const permission: GrammarContent = {
  language: 'ja',
  title: '〜てもいい',
  explanation: 'Expressa permissão.\nUse o verbo na forma て + もいい.',
  examples: [
    {
      text: 'ここに座ってもいいですか。',
      reading: 'ここにすわってもいいですか。',
      meaning: 'Posso me sentar aqui?\nPedido de permissão.',
    },
  ],
  front: 'Como pedir permissão com a forma て?',
  back: '〜てもいい\nここに座ってもいいですか。',
  sortKey: 'てもいい',
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

describe('personal grammar', () => {
  test('derives faces, accepts optional short explanation and examples, and never falls back to the full explanation', async () => {
    const { learner } = await setup();
    const card = await learner.mutation(api.grammar.create, {
      card: {
        language: 'ja',
        title: '〜てもいい',
        explanation: 'Explicação completa e separada.',
        classifications: permission.classifications,
      },
    });
    expect(card).toMatchObject({
      front: '〜てもいい',
      back: '',
      shortExplanation: '',
      examples: [],
      sortKey: '',
      contentVersion: 1,
    });
    expect(
      await learner.mutation(api.grammar.update, {
        id: card._id,
        patch: { front: 'ignored', back: 'ignored', sortKey: 'ignored' },
      }),
    ).toEqual(card);
    const changed = await learner.mutation(api.grammar.update, {
      id: card._id,
      patch: {
        title: '〜てもいいですか',
        shortExplanation: 'Permissão.',
        examples: [
          {
            text: '座ってもいいですか。',
            reading: 'すわってもいいですか。',
            meaning: 'Posso sentar?',
          },
        ],
      },
    });
    expect(changed).toMatchObject({
      front: '〜てもいいですか',
      back: 'Permissão.\n\nExemplos\n座ってもいいですか。\nすわってもいいですか。\nPosso sentar?',
      contentVersion: 2,
    });
    expect(changed.back).not.toContain(card.explanation);
    const cleared = await learner.mutation(api.grammar.update, {
      id: card._id,
      patch: { shortExplanation: '', examples: [] },
    });
    expect(cleared).toMatchObject({
      back: '',
      explanation: card.explanation,
      contentVersion: 3,
    });
  });

  test('preserves long examples and line breaks in generated faces and explicit noncumulative JLPT levels', async () => {
    const { learner } = await setup();
    const text = `一行目\n${'説明'.repeat(200)}\n最後の行`;
    const card = await learner.mutation(api.grammar.create, {
      card: {
        ...permission,
        language: ' JA-jp ',
        examples: [
          {
            text,
            reading: 'よみかた\nつづき',
            meaning: 'Significado\nOutra linha',
          },
        ],
        classifications: [
          { scheme: 'JLPT', level: 'n3' },
          { scheme: 'jlpt', level: 'N5' },
          { scheme: 'jlpt', level: 'N3' },
        ],
      },
    });
    expect(card).toMatchObject({
      language: 'ja-jp',
      front: permission.title,
      back: `Exemplos\n${text}\nよみかた\nつづき\nSignificado\nOutra linha`,
      explanation: permission.explanation,
      examples: [{ text }],
      classifications: [
        { scheme: 'jlpt', level: 'N3' },
        { scheme: 'jlpt', level: 'N5' },
      ],
      contentVersion: 1,
      archived: false,
    });
    for (const level of ['N1', 'N2', 'N3', 'N4', 'N5']) {
      const result = await learner.query(api.grammar.search, {
        language: 'ja',
        level,
        paginationOpts: { cursor: null, numItems: 10 },
      });
      expect(result.page.map(({ _id }) => _id)).toEqual(
        ['N3', 'N5'].includes(level) ? [card._id] : [],
      );
    }
  });

  test('requires complete explanation and one actual JLPT level while bounding optional content', async () => {
    const { learner } = await setup();
    const invalid: GrammarContent[] = [
      { ...permission, title: ' ' },
      { ...permission, explanation: '' },
      { ...permission, language: 'ja_JP' },
      { ...permission, examples: [{ text: ' ' }] },
      {
        ...permission,
        examples: Array.from({ length: 25 }, () => ({ text: '例' })),
      },
      { ...permission, examples: [{ text: '例'.repeat(1001) }] },
      { ...permission, classifications: [] },
      { ...permission, classifications: [{ scheme: 'jlpt', level: 'N6' }] },
      { ...permission, classifications: [{ scheme: 'jlpt', level: 'N0' }] },
      { ...permission, classifications: [{ scheme: 'other', level: 'N5' }] },
      { ...permission, explanation: 'a'.repeat(8001) },
      { ...permission, shortExplanation: 'a'.repeat(2001) },
      { ...permission, title: 'a'.repeat(301) },
    ];
    for (const card of invalid)
      await expect(
        learner.mutation(api.grammar.create, { card }),
      ).rejects.toThrow('VALIDATION');
    for (const numItems of [0, 101, 1.5])
      await expect(
        learner.query(api.grammar.search, {
          paginationOpts: { cursor: null, numItems },
        }),
      ).rejects.toThrow('VALIDATION');
  });

  test('searches every field with normalized kana, Latin accents and AND/OR terms intersecting language and level', async () => {
    const { learner } = await setup();
    const card = await learner.mutation(api.grammar.create, {
      card: {
        ...permission,
        title: '見る構造',
        explanation: 'Água explicada',
        shortExplanation: 'Resumo exclusivo',
        examples: [
          {
            text: '冷たい水',
            reading: 'ツメタイミズ',
            meaning: 'líquido frio',
          },
        ],
        front: 'frente especial',
        back: 'verso exclusivo',
        sortKey: 'chave distinta',
      },
    });
    const search = (filters: {
      query?: string;
      terms?: string[];
      operator?: 'AND' | 'OR';
      language?: string;
      level?: string;
    }) =>
      learner.query(api.grammar.search, {
        ...filters,
        paginationOpts: { cursor: null, numItems: 10 },
      });
    for (const query of [
      '見る構造',
      'AGUA',
      '冷たい',
      'つめたいみず',
      'ﾂﾒﾀｲﾐｽﾞ',
      'LIQUIDO',
      'exclusivo',
      'ja',
      'JLPT',
      'N5',
      'jlpt:N5',
    ])
      expect((await search({ query })).page.map(({ _id }) => _id)).toEqual([
        card._id,
      ]);
    expect((await search({ query: 'AGUA LIQUIDO' })).page).toHaveLength(1);
    expect((await search({ terms: ['agua', 'ausente'] })).page).toEqual([]);
    expect(
      (
        await search({
          terms: ['agua', 'ausente'],
          operator: 'OR',
          level: 'N5',
          language: 'ja',
        })
      ).page,
    ).toHaveLength(1);
    expect(
      (
        await search({
          terms: ['agua', 'ausente'],
          operator: 'OR',
          level: 'N4',
        })
      ).page,
    ).toEqual([]);
    expect(
      (
        await search({
          terms: ['agua', 'ausente'],
          operator: 'OR',
          language: 'en',
        })
      ).page,
    ).toEqual([]);
    expect(
      (await search({ query: 'AGUA ausente', operator: 'OR' })).page,
    ).toHaveLength(1);
    // Japanese voicing remains significant during search.
    expect((await search({ query: 'みす' })).page).toEqual([]);
  });

  test('pages oldest grammar first with no skipped or repeated matching items', async () => {
    vi.stubEnv('LIBRARY_CARD_ORDER_ENABLED', 'true');
    const { learner, other } = await setup();
    for (const [title, sortKey, level] of [
      ['水', 'みず', 'N5'],
      ['コーヒー', 'コーヒー', 'N5'],
      ['紅茶', 'こうちゃ', 'N4'],
      ['珈琲', 'こーひー', 'N5'],
      ['会う', 'あう', 'N5'],
    ])
      await learner.mutation(api.grammar.create, {
        card: {
          ...permission,
          title,
          sortKey,
          classifications: [{ scheme: 'jlpt', level }],
        },
      });
    await other.mutation(api.grammar.create, { card: permission });
    const readAll = async (level?: string) => {
      let cursor: string | null = null;
      const titles: string[] = [];
      for (let page = 0; page < 10; page += 1) {
        const result: FunctionReturnType<typeof api.grammar.search> =
          await learner.query(api.grammar.search, {
            level,
            query: 'permissao',
            paginationOpts: { cursor, numItems: 1 },
          });
        titles.push(...result.page.map(({ title }) => title));
        if (result.isDone) return titles;
        cursor = result.continueCursor;
      }
      throw new Error('Pagination did not finish');
    };
    expect(await readAll()).toEqual(['水', 'コーヒー', '紅茶', '珈琲', '会う']);
    expect(await readAll('N5')).toEqual(['水', 'コーヒー', '珈琲', '会う']);
    expect(await readAll()).toEqual(['水', 'コーヒー', '紅茶', '珈琲', '会う']);
  });

  test('patches only supplied facts, versions effective edits and ignores legacy sort keys', async () => {
    const { learner } = await setup();
    const card = await learner.mutation(api.grammar.create, {
      card: permission,
    });
    expect(
      await learner.mutation(api.grammar.update, { id: card._id, patch: {} }),
    ).toEqual(card);
    const changed = await learner.mutation(api.grammar.update, {
      id: card._id,
      patch: {
        explanation: 'Nova explicação\nSegunda linha',
        sortKey: 'コーヒー',
      },
    });
    expect(changed).toMatchObject({
      title: permission.title,
      front: card.front,
      back: card.back,
      explanation: 'Nova explicação\nSegunda linha',
      sortKey: '',
      readingSortKey: libraryReadingSortKey(''),
      contentVersion: 2,
    });
    expect(
      await learner.mutation(api.grammar.update, {
        id: card._id,
        patch: {
          explanation: ' Nova explicação\nSegunda linha ',
          language: 'JA',
        },
      }),
    ).toEqual(changed);
    const cleared = await learner.mutation(api.grammar.update, {
      id: card._id,
      patch: { examples: [] },
    });
    expect(cleared).toMatchObject({
      examples: [],
      back: '',
      contentVersion: 3,
    });
    expect(await learner.query(api.grammar.get, { id: card._id })).toEqual(
      cleared,
    );
  });

  test('isolates get, search, updates, archival and restore by authenticated owner', async () => {
    const { backend, learner, other } = await setup();
    const card = await learner.mutation(api.grammar.create, {
      card: permission,
    });
    expect(await other.query(api.grammar.get, { id: card._id })).toBeNull();
    expect(
      (
        await other.query(api.grammar.search, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
    await expect(
      other.mutation(api.grammar.update, {
        id: card._id,
        patch: { back: 'other' },
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.grammar.archive, { id: card._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.grammar.restore, { id: card._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      backend.mutation(api.grammar.create, { card: permission }),
    ).rejects.toThrow('UNAUTHENTICATED');
    await expect(
      backend.query(api.grammar.get, { id: card._id }),
    ).rejects.toThrow('UNAUTHENTICATED');
    const archived = await learner.mutation(api.grammar.archive, {
      id: card._id,
    });
    expect(archived).toMatchObject({ archived: true, contentVersion: 1 });
    expect(
      await learner.mutation(api.grammar.archive, { id: card._id }),
    ).toEqual(archived);
    expect(
      (
        await learner.query(api.grammar.search, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
    expect(
      (
        await learner.query(api.grammar.search, {
          archived: true,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page.map(({ _id }) => _id),
    ).toEqual([card._id]);
    expect(
      (
        await other.query(api.grammar.search, {
          archived: true,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
    expect(
      await learner.mutation(api.grammar.restore, { id: card._id }),
    ).toMatchObject({ archived: false, contentVersion: 1 });
  });
});
