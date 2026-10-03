import { afterEach, describe, expect, test, vi } from 'vitest';
import type { FunctionReturnType } from 'convex/server';
import { api } from './_generated/api';
import { libraryReadingSortKey } from '../../shared/libraryOrder';
import type { ExamCreateInput } from '../../shared/examContent';
import { createTestBackend, learnerIdentity } from './test-support.helpers';
import { getDocumentSize } from 'convex/values';
import { PAGE_READ_BYTES } from './readBudget';

afterEach(() => vi.unstubAllEnvs());

const question: ExamCreateInput = {
  language: 'ja',
  title: '助詞を選ぶ',
  prompt: '毎日、電車（　）学校へ行きます。\n最もよいものを選んでください。',
  alternatives: ['を', 'で', 'に', 'が'],
  answer: 'Alternativa correta: 2. で',
  explanation: 'A partícula で indica o meio de transporte.\n電車で = de trem.',
  sortKey: 'じょしをえらぶ',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
  examReference: 'Questão autoral de prática',
  year: 2026,
  section: '文字・語彙・文法',
  source: 'Exemplo criado para estudo pessoal',
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

describe('personal exam questions', () => {
  test('pages long question documents by bytes without losing or repeating cards', async () => {
    const { learner } = await setup();
    const expected = new Set<string>();
    for (let index = 0; index < 12; index++) {
      const card = await learner.mutation(api.exams.create, {
        card: {
          ...question,
          title: String(index),
          prompt: '問'.repeat(12000),
          alternatives: Array.from({ length: 10 }, () => '選'.repeat(2000)),
          answer: '答'.repeat(4000),
          explanation: '説'.repeat(12000),
        },
      });
      expected.add(card._id);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const result: FunctionReturnType<typeof api.exams.search> =
        await learner.query(api.exams.search, {
          paginationOpts: {
            cursor,
            numItems: 100,
            maximumBytesRead: 16 * 1024 * 1024,
          },
        });
      expect(result.page.length).toBeLessThan(12);
      expect(
        result.page.reduce((sum, card) => sum + getDocumentSize(card), 0),
      ).toBeLessThan(PAGE_READ_BYTES + 1024 * 1024);
      seen.push(...result.page.map((card) => card._id));
      pages++;
      if (result.isDone) break;
      cursor = result.continueCursor;
      if (pages > 12) throw new Error('Pagination did not finish');
    } while (cursor);
    expect(pages).toBeGreaterThan(1);
    expect(new Set(seen)).toEqual(expected);
    expect(seen).toHaveLength(expected.size);
  });

  test('preserves long Japanese text, line breaks and alternatives with canonical separate faces', async () => {
    const { learner } = await setup();
    const prompt = `最初の行\n${'長い日本語の文章。'.repeat(250)}\n最後の行`;
    const created = await learner.mutation(api.exams.create, {
      card: {
        ...question,
        language: ' JA-jp ',
        prompt,
        classifications: [
          { scheme: 'JLPT', level: 'n5' },
          { scheme: 'jlpt', level: 'N3' },
          { scheme: 'jlpt', level: 'N5' },
        ],
      },
    });
    expect(created).toMatchObject({
      ...question,
      language: 'ja-jp',
      sortKey: '',
      prompt,
      front: `${prompt}\n\n1. を\n2. で\n3. に\n4. が`,
      back: `Resposta\n${question.answer}\n\nExplicação\n${question.explanation}`,
      classifications: [
        { scheme: 'jlpt', level: 'N5' },
        { scheme: 'jlpt', level: 'N3' },
      ],
      archived: false,
      contentVersion: 1,
    });
    expect(created.front).not.toContain(question.answer);
    expect(created.front).not.toContain(question.explanation);
    for (const level of ['N1', 'N2', 'N3', 'N4', 'N5']) {
      const page = await learner.query(api.exams.search, {
        language: 'ja',
        level,
        paginationOpts: { cursor: null, numItems: 10 },
      });
      expect(page.page.map(({ _id }) => _id)).toEqual(
        ['N3', 'N5'].includes(level) ? [created._id] : [],
      );
    }
  });

  test('allows open questions without optional metadata or alternatives', async () => {
    const { learner } = await setup();
    const {
      examReference: _,
      year: _year,
      section: _section,
      source: _source,
      ...required
    } = question;
    const card = await learner.mutation(api.exams.create, {
      card: { ...required, alternatives: [] },
    });
    expect(card.front).toBe(question.prompt);
    for (const key of ['examReference', 'year', 'section', 'source'])
      expect(card).not.toHaveProperty(key);
  });

  test('rejects missing required content, invalid levels, oversized choices and invalid years', async () => {
    const { learner } = await setup();
    const invalid: ExamCreateInput[] = [
      { ...question, title: ' ' },
      { ...question, prompt: '' },
      { ...question, answer: '\n' },
      { ...question, explanation: '' },
      { ...question, language: 'ja_JP' },
      { ...question, prompt: 'あ'.repeat(12001) },
      { ...question, answer: 'a'.repeat(4001) },
      { ...question, explanation: '説'.repeat(12001) },
      { ...question, alternatives: [' '] },
      { ...question, alternatives: ['a'.repeat(2001)] },
      { ...question, alternatives: Array.from({ length: 11 }, () => '選択肢') },
      { ...question, classifications: [] },
      { ...question, classifications: [{ scheme: 'jlpt', level: 'N6' }] },
      { ...question, classifications: [{ scheme: 'other', level: 'N5' }] },
      { ...question, year: 0 },
      { ...question, year: 2101 },
      { ...question, year: 2026.5 },
      { ...question, year: Number.NaN },
      { ...question, source: 's'.repeat(2001) },
    ];
    for (const card of invalid)
      await expect(
        learner.mutation(api.exams.create, { card }),
      ).rejects.toThrow('VALIDATION');
    for (const numItems of [0, 101, 1.5])
      await expect(
        learner.query(api.exams.search, {
          paginationOpts: { cursor: null, numItems },
        }),
      ).rejects.toThrow('VALIDATION');
  });

  test('searches all question fields and metadata with kana/accent normalization and intersecting filters', async () => {
    const { learner } = await setup();
    const created = await learner.mutation(api.exams.create, {
      card: {
        ...question,
        alternatives: ['コーヒー', '水'],
        answer: '水',
        explanation: 'Água como bebida.',
      },
    });
    const search = (filters: {
      query?: string;
      terms?: string[];
      operator?: 'AND' | 'OR';
      language?: string;
      level?: string;
    }) =>
      learner.query(api.exams.search, {
        ...filters,
        paginationOpts: { cursor: null, numItems: 10 },
      });
    for (const query of [
      '助詞',
      '毎日',
      'こーひー',
      '水',
      'AGUA',
      'autoral',
      '2026',
      '文字',
      'pessoal',
      'N5',
      'jlpt:N5',
    ])
      expect((await search({ query })).page.map(({ _id }) => _id)).toEqual([
        created._id,
      ]);
    expect(
      (await search({ terms: ['agua', '2026'], language: 'ja', level: 'N5' }))
        .page,
    ).toHaveLength(1);
    expect((await search({ query: 'agua ausente' })).page).toEqual([]);
    expect(
      (await search({ query: 'agua ausente', operator: 'OR' })).page,
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
    expect((await search({ query: 'agua', language: 'en' })).page).toEqual([]);
  });

  test('patches only supplied fields, clears metadata and regenerates faces without incrementing no-op versions', async () => {
    const { learner } = await setup();
    const created = await learner.mutation(api.exams.create, {
      card: question,
    });
    expect(
      await learner.mutation(api.exams.update, { id: created._id, patch: {} }),
    ).toEqual(created);
    const changed = await learner.mutation(api.exams.update, {
      id: created._id,
      patch: {
        answer: 'Resposta corrigida',
        alternatives: [],
        sortKey: 'コーヒー',
        examReference: null,
        year: null,
        section: '',
        source: ' ',
      },
    });
    expect(changed).toMatchObject({
      prompt: question.prompt,
      explanation: question.explanation,
      answer: 'Resposta corrigida',
      alternatives: [],
      front: question.prompt,
      back: `Resposta\nResposta corrigida\n\nExplicação\n${question.explanation}`,
      readingSortKey: libraryReadingSortKey(''),
      contentVersion: 2,
    });
    for (const key of ['examReference', 'year', 'section', 'source'])
      expect(changed).not.toHaveProperty(key);
    expect(
      await learner.mutation(api.exams.update, {
        id: created._id,
        patch: { answer: ' Resposta corrigida ', year: null, language: ' JA ' },
      }),
    ).toEqual(changed);
    await expect(
      learner.mutation(api.exams.update, {
        id: created._id,
        patch: { answer: '' },
      }),
    ).rejects.toThrow('VALIDATION');
    expect(await learner.query(api.exams.get, { id: created._id })).toEqual(
      changed,
    );
  });

  test('owner-scoped pagination keeps creation order across filtered empty pages', async () => {
    vi.stubEnv('LIBRARY_CARD_ORDER_ENABLED', 'true');
    const { learner, other } = await setup();
    for (const [title, sortKey, level] of [
      ['水', 'みず', 'N5'],
      ['コーヒー', 'コーヒー', 'N5'],
      ['紅茶', 'こうちゃ', 'N4'],
      ['珈琲', 'こーひー', 'N5'],
      ['会う', 'あう', 'N5'],
    ])
      await learner.mutation(api.exams.create, {
        card: {
          ...question,
          title,
          sortKey,
          classifications: [{ scheme: 'jlpt', level }],
        },
      });
    await other.mutation(api.exams.create, { card: question });
    let cursor: string | null = null;
    const titles: string[] = [];
    for (let page = 0; page < 10; page += 1) {
      const result: FunctionReturnType<typeof api.exams.search> =
        await learner.query(api.exams.search, {
          level: 'N5',
          paginationOpts: { cursor, numItems: 1 },
        });
      titles.push(...result.page.map(({ title }) => title));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(titles).toEqual(['水', 'コーヒー', '珈琲', '会う']);
  });

  test('isolates every public operation and retains archived content for restore', async () => {
    const { backend, learner, other } = await setup();
    const card = await learner.mutation(api.exams.create, { card: question });
    await expect(
      backend.mutation(api.exams.create, { card: question }),
    ).rejects.toThrow('UNAUTHENTICATED');
    expect(await other.query(api.exams.get, { id: card._id })).toBeNull();
    expect(
      (
        await other.query(api.exams.search, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
    await expect(
      other.mutation(api.exams.update, {
        id: card._id,
        patch: { answer: 'Outra' },
      }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.exams.archive, { id: card._id }),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      other.mutation(api.exams.restore, { id: card._id }),
    ).rejects.toThrow('UNAVAILABLE');
    const archived = await learner.mutation(api.exams.archive, {
      id: card._id,
    });
    expect(archived).toMatchObject({ archived: true, contentVersion: 1 });
    expect(await learner.mutation(api.exams.archive, { id: card._id })).toEqual(
      archived,
    );
    expect(
      (
        await learner.query(api.exams.search, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
    expect(
      (
        await learner.query(api.exams.search, {
          archived: true,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page.map(({ _id }) => _id),
    ).toEqual([card._id]);
    expect(
      (
        await other.query(api.exams.search, {
          archived: true,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
    expect(
      await learner.mutation(api.exams.restore, { id: card._id }),
    ).toMatchObject({
      archived: false,
      contentVersion: 1,
      prompt: question.prompt,
    });
  });
});
