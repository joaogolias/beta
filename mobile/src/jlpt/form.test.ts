import { describe, expect, it } from 'vitest';
import {
  JLPT_LEVELS,
  JLPT_SKILLS,
  kindsFor,
  validateReady,
} from '../../../shared/jlpt';
import {
  changeLevel,
  clockText,
  emptyPaper,
  newQuestion,
  moveQuestion,
  paperFromDraft,
  patchFromDraft,
  removeChoice,
} from './form';

describe('JLPT paper editing', () => {
  it('reorders questions inside an area while preserving their identifiers and other areas', () => {
    const first = newQuestion('N5', 'reading', 'first');
    const vocabulary = newQuestion('N5', 'vocabulary', 'vocabulary');
    const last = newQuestion('N5', 'reading', 'last');
    const draft = { ...emptyPaper(), questions: [first, vocabulary, last] };
    const moved = moveQuestion(draft, 'last', -1);
    expect(moved.questions.map((question) => question.id)).toEqual([
      'last',
      'vocabulary',
      'first',
    ]);
    expect(moved.questions[0]).toBe(last);
    expect(moved.questions[1]).toBe(vocabulary);
    expect(moveQuestion(moved, 'last', -1)).toBe(moved);
    expect(moveQuestion(moved, 'last', 1)).toEqual(draft);
  });
  it('starts an authored question with an eligible format in every level and skill', () => {
    for (const level of JLPT_LEVELS)
      for (const skill of JLPT_SKILLS) {
        const question = newQuestion(level, skill, 'question-1');
        expect(
          kindsFor(level, skill).some((kind) => kind.value === question.kind),
        ).toBe(true);
        expect(question.choices).toHaveLength(4);
        expect(question.skill).toBe(skill);
      }
  });
  it('preserves compatible formats and adjusts unavailable formats on level change', () => {
    const draft = {
      ...emptyPaper(),
      title: 'Treino',
      level: 'N1' as const,
      questions: [
        {
          ...newQuestion('N1', 'listening', 'listen'),
          kind: 'integrated_listening',
          prompt: '聞いてください。',
        },
        {
          ...newQuestion('N1', 'reading', 'read'),
          kind: 'short_passage',
          passage: '日本語の文章。',
        },
      ],
    };
    const changed = changeLevel(draft, 'N5');
    expect(changed.questions[0].kind).toBe(
      kindsFor('N5', 'listening')[0].value,
    );
    expect(changed.questions[0].prompt).toBe('聞いてください。');
    expect(changed.questions[1].kind).toBe('short_passage');
    expect(changed.questions[1].passage).toBe('日本語の文章。');
    expect(draft.questions[0].kind).toBe('integrated_listening');
  });
  it('keeps the selected answer attached to the right listening choice when another choice is removed', () => {
    const question = {
      ...newQuestion('N5', 'listening', 'listen'),
      choices: ['A', 'B', 'C', 'D'],
      correctChoice: 3,
    };
    const shortened = removeChoice(question, 1);
    expect(shortened.choices).toEqual(['A', 'C', 'D']);
    expect(shortened.correctChoice).toBe(2);
    expect(removeChoice(question, 3).correctChoice).toBe(0);
    expect(removeChoice(shortened, 1)).toBe(shortened);
    const reading = { ...question, skill: 'reading' as const };
    expect(removeChoice(reading, 1)).toBe(reading);
  });
  it('saves a draft without all skills while requiring a complete paper for a timed start', () => {
    const draft = { ...emptyPaper(), title: 'Ainda preparando' };
    expect(paperFromDraft(draft).questions).toEqual([]);
    expect(() => validateReady(paperFromDraft(draft))).toThrow();
    expect(
      patchFromDraft({ ...draft, description: '', source: ' ' }),
    ).toMatchObject({ description: null, source: null });
  });
  it('keeps long Japanese passages and answers when saving authored material', () => {
    const passage = '駅の前には図書館があります。\n'.repeat(200);
    const question = {
      ...newQuestion('N5', 'reading', 'read'),
      prompt: '図書館はどこですか。',
      passage,
      choices: ['駅の前', '学校の中', '駅の後ろ', '家の隣'],
      correctChoice: 0,
      explanation: '本文に「駅の前」と書いてあります。',
    };
    const saved = paperFromDraft({
      ...emptyPaper(),
      title: '読解',
      questions: [question],
    });
    expect(saved.questions[0].passage).toBe(passage.trim());
    expect(saved.questions[0].correctChoice).toBe(0);
    expect(saved.questions[0].explanation).toBe(question.explanation);
  });
});

describe('JLPT visible countdown', () => {
  it('shows absolute remaining time across reopening and never a negative countdown', () => {
    const deadline = 7_000_000;
    expect(clockText(deadline, deadline - 110 * 60_000)).toBe('110:00');
    expect(clockText(deadline, deadline - 60_001)).toBe('01:01');
    expect(clockText(deadline, deadline - 1)).toBe('00:01');
    expect(clockText(deadline, deadline)).toBe('00:00');
    expect(clockText(deadline, deadline + 180_000)).toBe('00:00');
  });
});
