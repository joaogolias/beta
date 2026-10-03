import { afterEach, describe, expect, test, vi } from 'vitest';
import type { FunctionReturnType } from 'convex/server';
import { api } from './_generated/api';
import type { AlphabetContent, AlphabetCreateInput } from './alphabetDomain';
import { formatKanjiFaces, kanjiBackSections } from '../../shared/kanji';
import { createTestBackend, learnerIdentity } from './test-support.helpers';
import { libraryReadingSortKey } from '../../shared/libraryOrder';

afterEach(() => vi.unstubAllEnvs());

const water: AlphabetContent = {
  language: 'ja',
  writingSystem: 'Hani',
  symbol: '水',
  meanings: ['água'],
  examples: [
    { text: '水曜日', reading: 'すいようび', meaning: 'quarta-feira' },
  ],
  front: '水',
  back: 'água — みず / スイ',
  sortKey: 'みず',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
  details: {
    kind: 'kanji',
    kunYomi: ['みず'],
    onYomi: ['スイ'],
    radicals: ['水'],
  },
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

describe('personal alphabet', () => {
  test('indexes mixed kana globally across sparse pages, keeping ties stable and other owners out', async () => {
    vi.stubEnv('LIBRARY_CARD_ORDER_ENABLED', 'true');
    const { learner, other } = await setup();
    const inputs = [
      ['間', 'かん', 'N5'],
      ['学', 'ガク', 'N4'],
      ['柿', 'カキ', 'N5'],
      ['書', 'かき', 'N5'],
      ['愛', 'あい', 'N5'],
    ];
    for (const [symbol, sortKey, level] of inputs)
      await learner.mutation(api.alphabet.create, {
        card: {
          ...water,
          symbol,
          sortKey,
          details: {
            kind: 'kanji',
            kunYomi: [sortKey],
            onYomi: [],
            radicals: [],
          },
          classifications: [{ scheme: 'jlpt', level }],
        },
      });
    await other.mutation(api.alphabet.create, {
      card: { ...water, symbol: '足', sortKey: 'あし' },
    });
    const readAll = async (level?: string) => {
      let cursor: string | null = null;
      const symbols: string[] = [];
      for (let page = 0; page < 10; page += 1) {
        const result: FunctionReturnType<typeof api.alphabet.search> =
          await learner.query(api.alphabet.search, {
            level,
            query: 'água',
            paginationOpts: { cursor, numItems: 1 },
          });
        symbols.push(...result.page.map(({ symbol }) => symbol));
        if (result.isDone) return symbols;
        cursor = result.continueCursor;
      }
      throw new Error('Pagination did not finish');
    };
    expect(await readAll()).toEqual(['愛', '柿', '書', '学', '間']);
    expect(await readAll('N5')).toEqual(['愛', '柿', '書', '間']);
    expect(await readAll()).toEqual(['愛', '柿', '書', '学', '間']);
  });

  test('ignores authored sort keys and derives order from first kun then on reading without revising metadata-only repairs', async () => {
    const { backend, learner } = await setup();
    const card = await learner.mutation(api.alphabet.create, { card: water });
    await backend.run((ctx) =>
      ctx.db.patch('alphabetCards', card._id, { readingSortKey: undefined }),
    );
    expect(
      await learner.mutation(api.alphabet.update, { id: card._id, patch: {} }),
    ).toEqual(card);
    const ignored = await learner.mutation(api.alphabet.update, {
      id: card._id,
      patch: { sortKey: 'スイ' },
    });
    expect(ignored).toEqual(card);
    const changed = await learner.mutation(api.alphabet.update, {
      id: card._id,
      patch: {
        details: {
          kind: 'kanji',
          kunYomi: [],
          onYomi: ['スイ'],
          radicals: ['水'],
        },
      },
    });
    expect(changed).toMatchObject({
      sortKey: 'スイ',
      readingSortKey: libraryReadingSortKey('すい'),
      contentVersion: 2,
    });
    expect(
      await learner.mutation(api.alphabet.update, { id: card._id, patch: {} }),
    ).toEqual(changed);
  });

  test('kanji faces are generated, allow all readings and radicals to be empty, and ignore legacy face inputs', async () => {
    const { learner } = await setup();
    const input: AlphabetCreateInput = {
      ...water,
      details: { kind: 'kanji', kunYomi: [], onYomi: [], radicals: [] },
    };
    delete input.front;
    delete input.back;
    const card = await learner.mutation(api.alphabet.create, { card: input });
    expect(card).toMatchObject({
      front: '水',
      back: '意味 · Significado: água\n訓読み · Kun’yomi: —\n音読み · On’yomi: —\n部首 · Radical: —',
      contentVersion: 1,
    });
    const changed = await learner.mutation(api.alphabet.update, {
      id: card._id,
      patch: {
        symbol: '火',
        meanings: ['fogo', 'chama'],
        details: {
          kind: 'kanji',
          kunYomi: ['ひ'],
          onYomi: ['カ'],
          radicals: ['火'],
        },
        front: 'frente customizada ignorada',
        back: 'verso customizado ignorado',
      },
    });
    expect(changed).toMatchObject({
      front: '火',
      back: '意味 · Significado: fogo; chama\n訓読み · Kun’yomi: ひ\n音読み · On’yomi: カ\n部首 · Radical: 火',
      contentVersion: 2,
    });
    expect(
      await learner.mutation(api.alphabet.update, {
        id: card._id,
        patch: { front: '', back: 'qualquer coisa' },
      }),
    ).toEqual(changed);
    const faces = formatKanjiFaces({
      symbol: changed.symbol,
      meanings: changed.meanings,
      details: {
        kind: 'kanji',
        kunYomi: ['ひ'],
        onYomi: ['カ'],
        radicals: ['火'],
      },
    });
    expect(faces).toEqual({ front: changed.front, back: changed.back });
    expect(
      kanjiBackSections({
        symbol: '水',
        meanings: ['água'],
        details: { kind: 'kanji', kunYomi: [], onYomi: [], radicals: [] },
      }).map(({ value }) => value),
    ).toEqual(['água', '—', '—', '—']);
  });

  test('generic cards still require authored faces', async () => {
    const { learner } = await setup();
    const input: AlphabetCreateInput = {
      ...water,
      language: 'pt',
      writingSystem: 'Latn',
      symbol: 'a',
      details: { kind: 'generic', readings: [] },
      classifications: [],
    };
    delete input.front;
    delete input.back;
    await expect(
      learner.mutation(api.alphabet.create, { card: input }),
    ).rejects.toThrow('Frente');
    await expect(
      learner.mutation(api.alphabet.create, { card: { ...input, front: 'A' } }),
    ).rejects.toThrow('Verso');
    expect(
      await learner.mutation(api.alphabet.create, {
        card: { ...input, front: 'A', back: 'Letra A' },
      }),
    ).toMatchObject({ front: 'A', back: 'Letra A' });
  });

  test('legacy reads project canonical faces and versions while updates persist without false no-ops', async () => {
    const { backend, learner } = await setup();
    const created = await learner.mutation(api.alphabet.create, {
      card: water,
    });
    await backend.run((ctx) =>
      ctx.db.patch('alphabetCards', created._id, {
        front: 'Frente antiga',
        back: 'Verso antigo',
      }),
    );
    const projected = await learner.query(api.alphabet.get, {
      id: created._id,
    });
    expect(projected).toMatchObject({
      front: '水',
      back: created.back,
      contentVersion: 2,
    });
    expect(
      (
        await learner.query(api.alphabet.search, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([projected]);
    expect(
      await backend.run((ctx) => ctx.db.get('alphabetCards', created._id)),
    ).toMatchObject({
      front: 'Frente antiga',
      back: 'Verso antigo',
      contentVersion: 1,
    });
    const canonicalized = await learner.mutation(api.alphabet.update, {
      id: created._id,
      patch: {},
    });
    expect(canonicalized).toMatchObject({
      front: '水',
      back: created.back,
      contentVersion: 2,
    });
    expect(
      await learner.mutation(api.alphabet.update, {
        id: created._id,
        patch: {},
      }),
    ).toEqual(canonicalized);
    await backend.run((ctx) =>
      ctx.db.patch('alphabetCards', created._id, {
        front: 'Outro formato antigo',
      }),
    );
    const nextProjection = await learner.query(api.alphabet.get, {
      id: created._id,
    });
    expect(nextProjection?.contentVersion).toBe(3);
    const changed = await learner.mutation(api.alphabet.update, {
      id: created._id,
      patch: { meanings: ['líquido'] },
    });
    expect(changed).toMatchObject({
      contentVersion: 4,
      back: expect.stringContaining('Significado: líquido'),
    });
    expect(
      await learner.mutation(api.alphabet.update, {
        id: created._id,
        patch: { meanings: ['líquido'] },
      }),
    ).toEqual(changed);
  });

  test('base language filters include regional content while specific tags remain exact', async () => {
    const { learner } = await setup();
    const regional = await learner.mutation(api.alphabet.create, {
      card: { ...water, language: 'ja-JP' },
    });
    const general = await learner.mutation(api.alphabet.create, {
      card: { ...water, symbol: '火' },
    });
    const japanese = await learner.query(api.alphabet.search, {
      language: 'ja',
      paginationOpts: { cursor: null, numItems: 20 },
    });
    expect(new Set(japanese.page.map((card) => card._id))).toEqual(
      new Set([regional._id, general._id]),
    );
    const japan = await learner.query(api.alphabet.search, {
      language: 'ja-JP',
      paginationOpts: { cursor: null, numItems: 20 },
    });
    expect(japan.page.map((card) => card._id)).toEqual([regional._id]);
    expect(japan.page[0].language).toBe('ja-jp');
  });

  test('kanji uniqueness spans regional Japanese tags, including archived and concurrent creation', async () => {
    const { learner } = await setup();
    const regional = await learner.mutation(api.alphabet.create, {
      card: { ...water, language: 'ja-JP' },
    });
    await expect(
      learner.mutation(api.alphabet.create, { card: water }),
    ).rejects.toThrow('CONFLICT');
    await learner.mutation(api.alphabet.archive, { id: regional._id });
    await expect(
      learner.mutation(api.alphabet.create, { card: water }),
    ).rejects.toThrow('arquivados');
    const results = await Promise.allSettled([
      learner.mutation(api.alphabet.create, {
        card: { ...water, symbol: '火', language: 'ja' },
      }),
      learner.mutation(api.alphabet.create, {
        card: { ...water, symbol: '火', language: 'ja-JP' },
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await learner.mutation(api.alphabet.update, {
        id: regional._id,
        patch: { language: 'ja' },
      }),
    ).toMatchObject({ _id: regional._id, language: 'ja', contentVersion: 2 });
    // Chinese and other languages can reuse the same Han character independently.
    expect(
      await learner.mutation(api.alphabet.create, {
        card: {
          ...water,
          language: 'zh',
          details: { kind: 'generic', readings: ['shuǐ'] },
          classifications: [],
        },
      }),
    ).toMatchObject({ symbol: '水', language: 'zh' });
  });

  test('creates a normalized personal kanji with multiple distinct JLPT levels', async () => {
    const { learner } = await setup();
    const card = await learner.mutation(api.alphabet.create, {
      card: {
        ...water,
        symbol: ' 水 ',
        language: ' JA ',
        writingSystem: 'hani',
        classifications: [
          { scheme: 'JLPT', level: 'n5' },
          { scheme: 'jlpt', level: 'N4' },
        ],
      },
    });
    expect(card).toMatchObject({
      symbol: '水',
      language: 'ja',
      writingSystem: 'Hani',
      contentVersion: 1,
      archived: false,
    });
    for (const level of ['N5', 'N4']) {
      expect(
        (
          await learner.query(api.alphabet.search, {
            level,
            paginationOpts: { cursor: null, numItems: 20 },
          })
        ).page.map((row) => row._id),
      ).toEqual([card._id]);
    }
  });

  test('keeps all reads, edits, archival and search isolated by verified owner', async () => {
    const { backend, learner, other } = await setup();
    const card = await learner.mutation(api.alphabet.create, { card: water });
    expect(await other.query(api.alphabet.get, { id: card._id })).toBeNull();
    expect(
      (
        await other.query(api.alphabet.search, {
          paginationOpts: { cursor: null, numItems: 20 },
        })
      ).page,
    ).toEqual([]);
    await expect(
      other.mutation(api.alphabet.update, {
        id: card._id,
        patch: { back: 'stolen' },
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.alphabet.archive, { id: card._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      backend.query(api.alphabet.get, { id: card._id }),
    ).rejects.toThrow('UNAUTHENTICATED');
    await expect(
      backend.mutation(api.alphabet.create, { card: water }),
    ).rejects.toThrow('UNAUTHENTICATED');
    expect(
      (await other.mutation(api.alphabet.create, { card: water }))._id,
    ).not.toBe(card._id);
  });

  test('rejects duplicates across whitespace, archived cards and edits', async () => {
    const { learner } = await setup();
    const first = await learner.mutation(api.alphabet.create, { card: water });
    await expect(
      learner.mutation(api.alphabet.create, {
        card: { ...water, symbol: ' 水 ' },
      }),
    ).rejects.toThrow('CONFLICT');
    await learner.mutation(api.alphabet.archive, { id: first._id });
    await expect(
      learner.mutation(api.alphabet.create, { card: water }),
    ).rejects.toThrow('arquivados');
    const second = await learner.mutation(api.alphabet.create, {
      card: { ...water, symbol: '火' },
    });
    await expect(
      learner.mutation(api.alphabet.update, {
        id: second._id,
        patch: { symbol: '水' },
      }),
    ).rejects.toThrow('CONFLICT');
    expect(
      (await learner.mutation(api.alphabet.restore, { id: first._id }))
        .contentVersion,
    ).toBe(1);
  });

  test('serializes simultaneous duplicate creation into one record', async () => {
    const { backend, learner } = await setup();
    const results = await Promise.allSettled([
      learner.mutation(api.alphabet.create, { card: water }),
      learner.mutation(api.alphabet.create, { card: water }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await backend.run(async (ctx) => ctx.db.query('alphabetCards').take(2)),
    ).toHaveLength(1);
  });

  test('validates every JLPT level, duplicate classification, required content and compatible details', async () => {
    const { learner } = await setup();
    const invalid: AlphabetContent[] = [
      { ...water, meanings: [] },
      { ...water, symbol: '水火' },
      { ...water, classifications: [] },
      {
        ...water,
        classifications: [
          { scheme: 'jlpt', level: 'N5' },
          { scheme: 'jlpt', level: 'N6' },
        ],
      },
      {
        ...water,
        classifications: [
          { scheme: 'jlpt', level: 'N5' },
          { scheme: 'jlpt', level: 'n5' },
        ],
      },
      { ...water, details: { kind: 'generic', readings: ['みず'] } },
      { ...water, language: 'ko' },
    ];
    for (const card of invalid)
      await expect(
        learner.mutation(api.alphabet.create, { card }),
      ).rejects.toThrow('VALIDATION');
  });

  test('stores Latin and Hangul characters without Japanese-only metadata', async () => {
    const { learner } = await setup();
    const latin: AlphabetContent = {
      ...water,
      language: 'pt-BR',
      writingSystem: 'Latn',
      symbol: 'e\u0301',
      details: { kind: 'generic', readings: ['é'] },
      classifications: [],
    };
    const created = await learner.mutation(api.alphabet.create, {
      card: latin,
    });
    expect(created).toMatchObject({
      language: 'pt-br',
      symbol: 'é',
      details: { kind: 'generic', readings: ['é'] },
    });
    await expect(
      learner.mutation(api.alphabet.create, {
        card: { ...latin, symbol: 'é' },
      }),
    ).rejects.toThrow('CONFLICT');
    expect(
      await learner.mutation(api.alphabet.create, {
        card: { ...latin, language: 'ko', writingSystem: 'Hang', symbol: '한' },
      }),
    ).toMatchObject({ language: 'ko', symbol: '한' });
  });

  test('preserves distinct compatibility ideographs and variation selectors', async () => {
    const { learner } = await setup();
    const symbols = ['豈', '\uF900', '葛', '葛\u{E0100}'];
    for (const symbol of symbols)
      expect(
        (
          await learner.mutation(api.alphabet.create, {
            card: { ...water, symbol },
          })
        ).symbol,
      ).toBe(symbol);
    expect(
      (
        await learner.query(api.alphabet.search, {
          paginationOpts: { cursor: null, numItems: 20 },
        })
      ).page,
    ).toHaveLength(4);
  });

  test('partial edits preserve omitted content, identity and revision unless content changes', async () => {
    const { learner } = await setup();
    const created = await learner.mutation(api.alphabet.create, {
      card: water,
    });
    expect(
      await learner.mutation(api.alphabet.update, {
        id: created._id,
        patch: {},
      }),
    ).toEqual(created);
    const edited = await learner.mutation(api.alphabet.update, {
      id: created._id,
      patch: { meanings: ['água', 'líquido'] },
    });
    expect(edited).toMatchObject({
      _id: created._id,
      contentVersion: 2,
      details: created.details,
      examples: created.examples,
      front: created.front,
    });
    expect(
      (
        await learner.mutation(api.alphabet.update, {
          id: created._id,
          patch: { meanings: ['água', 'líquido'] },
        })
      ).contentVersion,
    ).toBe(2);
  });

  test('finds symbol, readings, radicals, meanings and examples with kana normalization', async () => {
    const { learner } = await setup();
    const created = await learner.mutation(api.alphabet.create, {
      card: water,
    });
    const filters = [
      { query: '水' },
      { query: 'agua' },
      { query: 'quarta' },
      { query: 'ｽｲ' },
      { reading: 'すい' },
      { reading: 'ミズ' },
      { radical: '水' },
    ];
    for (const filter of filters) {
      expect(
        (
          await learner.query(api.alphabet.search, {
            ...filter,
            paginationOpts: { cursor: null, numItems: 20 },
          })
        ).page.map((card) => card._id),
      ).toEqual([created._id]);
    }
    const eat = await learner.mutation(api.alphabet.create, {
      card: {
        ...water,
        symbol: '食',
        details: {
          kind: 'kanji',
          kunYomi: ['た.べる'],
          onYomi: ['ショク'],
          radicals: ['食'],
        },
      },
    });
    expect(
      (
        await learner.query(api.alphabet.search, {
          reading: 'タベル',
          paginationOpts: { cursor: null, numItems: 20 },
        })
      ).page.map((card) => card._id),
    ).toEqual([eat._id]);
    expect(
      (
        await learner.query(api.alphabet.search, {
          query: 'agua ミズ',
          level: 'N1',
          paginationOpts: { cursor: null, numItems: 20 },
        })
      ).page,
    ).toEqual([]);
  });

  test('paginates through sparse matching pages without losing later results', async () => {
    const { learner } = await setup();
    for (const [index, symbol] of ['水', '火', '木', '土'].entries()) {
      await learner.mutation(api.alphabet.create, {
        card: {
          ...water,
          symbol,
          sortKey: String(index),
          meanings: [index === 3 ? 'terra' : 'outro'],
        },
      });
    }
    const first = await learner.query(api.alphabet.search, {
      query: 'terra',
      paginationOpts: { cursor: null, numItems: 2 },
    });
    expect(first.page).toEqual([]);
    expect(first.isDone).toBe(false);
    const second = await learner.query(api.alphabet.search, {
      query: 'terra',
      paginationOpts: { cursor: first.continueCursor, numItems: 2 },
    });
    expect(second.page.map((card) => card.symbol)).toEqual(['土']);
    expect(second.isDone).toBe(true);
    await expect(
      learner.query(api.alphabet.search, {
        paginationOpts: { cursor: null, numItems: 101 },
      }),
    ).rejects.toThrow('VALIDATION');
  });
});
