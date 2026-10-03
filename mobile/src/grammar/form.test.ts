import { describe, expect, it } from 'vitest';
import { formatGrammarFaces } from '../../../shared/grammar';
import {
  contentFromDraft,
  draftFromCard,
  emptyDraft,
  patchFromDraft,
  type GrammarDraft,
} from './form';

function validDraft(): GrammarDraft {
  return {
    ...emptyDraft(),
    title: '〜てもいいです',
    explanation: 'Pedir permissão.\nUse a forma て + もいいです。',
    shortExplanation: 'Use para pedir ou dar permissão.',
    levels: ['N5'],
    examples: [
      {
        text: 'ここで写真を撮ってもいいですか。\nはい、いいです。',
        reading: 'ここでしゃしんをとってもいいですか。\nはい、いいです。',
        meaning: 'Posso tirar uma foto aqui?\nSim, pode.',
      },
    ],
  };
}

describe('grammar editor', () => {
  it('requires title, full explanation and explicit JLPT, while examples and short explanation are optional', () => {
    for (const key of ['title', 'explanation'] as const) {
      expect(() =>
        contentFromDraft({ ...validDraft(), [key]: '  ' }),
      ).toThrow();
    }
    expect(() => contentFromDraft({ ...validDraft(), levels: [] })).toThrow(
      'JLPT',
    );
    expect(
      contentFromDraft({ ...validDraft(), examples: [], shortExplanation: '' }),
    ).toMatchObject({
      examples: [],
      shortExplanation: '',
      front: '〜てもいいです',
      back: '',
    });
    expect(() =>
      contentFromDraft({
        ...validDraft(),
        examples: [
          ...validDraft().examples,
          { text: '', reading: '', meaning: '' },
        ],
      }),
    ).toThrow('exemplo');
  });

  it('preserves multiline content and optional example fields through editing', () => {
    const draft = validDraft();
    const card = contentFromDraft(draft);
    expect(card.explanation).toBe(draft.explanation);
    expect(card).toMatchObject(formatGrammarFaces(draft));
    expect(card.examples).toEqual(draft.examples);
    expect(draftFromCard(card)).toEqual(draft);
    expect(patchFromDraft(draft, card)).toEqual({});
    expect(
      contentFromDraft({
        ...draft,
        examples: [{ text: '日本語の例。', reading: '', meaning: '' }],
      }).examples,
    ).toEqual([{ text: '日本語の例。' }]);
  });

  it('patches only edited fields and preserves independent levels and foreign classifications', () => {
    const card = {
      ...contentFromDraft(validDraft()),
      language: 'ja',
      classifications: [
        { scheme: 'jlpt', level: 'N5' },
        { scheme: 'jlpt', level: 'N3' },
        { scheme: 'course', level: 'UNIT-2' },
      ],
    };
    const draft = draftFromCard(card);
    expect(draft.levels).toEqual(['N5', 'N3']);
    expect(
      patchFromDraft({ ...draft, shortExplanation: 'Indica permissão.' }, card),
    ).toEqual({ shortExplanation: 'Indica permissão.' });
    expect(patchFromDraft({ ...draft, shortExplanation: '' }, card)).toEqual({
      shortExplanation: '',
    });
    expect(patchFromDraft({ ...draft, levels: ['N1'] }, card)).toEqual({
      classifications: [
        { scheme: 'jlpt', level: 'N1' },
        { scheme: 'course', level: 'UNIT-2' },
      ],
    });
  });
  it('uses the title on the front and never replaces an absent short explanation with the full text', () => {
    const draft = {
      ...validDraft(),
      shortExplanation: '',
      explanation: 'EXPLICAÇÃO COMPLETA APENAS NO BOTÃO',
    };
    const saved = contentFromDraft(draft);
    expect(saved.front).toBe(draft.title);
    expect(saved.back).not.toContain(draft.explanation);
    expect(saved.back).toContain('ここで写真を撮ってもいいですか。');
    expect(saved.explanation).toBe(draft.explanation);
    expect(emptyDraft()).not.toHaveProperty('front');
    expect(emptyDraft()).not.toHaveProperty('back');
    expect(emptyDraft()).not.toHaveProperty('sortKey');
  });
});
