import { describe, expect, it } from 'vitest';
import { normalizeContent } from '../../../shared/examContent';
import {
  contentFromDraft,
  draftFromCard,
  emptyDraft,
  patchFromDraft,
  type ExamDraft,
} from './form';

function validDraft(): ExamDraft {
  return {
    ...emptyDraft(),
    title: '助詞を選ぶ',
    prompt: '学校（　）行きます。\n正しい答えを選んでください。',
    answer: 'に',
    explanation: 'に indica o destino.\n行く significa ir.',
    alternatives: ['に', 'を', 'が', 'と'],
    levels: ['N5'],
  };
}

describe('exam editor', () => {
  it('creates authored question fields without accepting custom study faces', () => {
    const input = contentFromDraft(validDraft());
    expect(input).not.toHaveProperty('front');
    expect(input).not.toHaveProperty('back');
    const card = normalizeContent(input);
    expect(card.front).toContain('1. に');
    expect(card.front).not.toContain(card.explanation);
    expect(draftFromCard(card)).toEqual(validDraft());
    expect(patchFromDraft(validDraft(), card)).toEqual({});
  });

  it('preserves long Japanese text and accepts questions without alternatives', () => {
    const draft = {
      ...validDraft(),
      prompt: '長い文章。\n'.repeat(1000),
      explanation: '説明。\n'.repeat(1000),
      alternatives: [],
    };
    const card = normalizeContent(contentFromDraft(draft));
    expect(card.prompt).toBe(draft.prompt.trim());
    expect(card.explanation).toBe(draft.explanation.trim());
    expect(card.front).toBe(card.prompt);
    expect(card.alternatives).toEqual([]);
  });

  it('requires question, answer, explanation and JLPT and rejects blank choices or invalid years', () => {
    for (const field of ['title', 'prompt', 'answer', 'explanation'] as const)
      expect(() =>
        contentFromDraft({ ...validDraft(), [field]: '  ' }),
      ).toThrow();
    expect(() => contentFromDraft({ ...validDraft(), levels: [] })).toThrow(
      'JLPT',
    );
    expect(() =>
      contentFromDraft({ ...validDraft(), alternatives: ['に', ''] }),
    ).toThrow('alternativas');
    for (const year of ['20.5', 'foo', '1899', '2101', '2e3'])
      expect(() => contentFromDraft({ ...validDraft(), year })).toThrow('ano');
    expect(() =>
      contentFromDraft({ ...validDraft(), prompt: 'あ'.repeat(12001) }),
    ).toThrow('12000');
    expect(() =>
      contentFromDraft({
        ...validDraft(),
        alternatives: Array.from({ length: 11 }, () => 'に'),
      }),
    ).toThrow('10');
  });

  it('patches only changed fields and explicitly clears metadata while preserving other classifications', () => {
    const card = normalizeContent({
      ...contentFromDraft(validDraft()),
      examReference: 'Caderno 1',
      year: 2025,
      section: '文法',
      source: 'Minha fonte',
      classifications: [
        { scheme: 'jlpt', level: 'N5' },
        { scheme: 'course', level: 'UNIT-1' },
      ],
    });
    const draft = draftFromCard(card);
    expect(patchFromDraft({ ...draft, prompt: '新しい問題。' }, card)).toEqual({
      prompt: '新しい問題。',
    });
    expect(
      patchFromDraft(
        { ...draft, year: '', section: '', source: '', examReference: '' },
        card,
      ),
    ).toEqual({ year: null, section: null, source: null, examReference: null });
    expect(patchFromDraft({ ...draft, levels: ['N3', 'N2'] }, card)).toEqual({
      classifications: [
        { scheme: 'jlpt', level: 'N3' },
        { scheme: 'jlpt', level: 'N2' },
        { scheme: 'course', level: 'UNIT-1' },
      ],
    });
  });
});
