import { describe, expect, it } from 'vitest';
import {
  contentFromDraft,
  draftFromCard,
  emptyDraft,
  patchFromDraft,
  splitTranslations,
  suggestedFaces,
  type VocabularyDraft,
} from './form';

function draft(overrides: Partial<VocabularyDraft> = {}): VocabularyDraft {
  return {
    ...emptyDraft(),
    expression: ' 学生 ',
    reading: ' がくせい ',
    portuguese: 'estudante; aluno',
    english: 'student',
    levels: ['N5'],
    ...overrides,
  };
}

describe('vocabulary editor', () => {
  it('preserves imported senses containing separators when editing only the expression', () => {
    const imported = contentFromDraft(draft());
    imported.translations = {
      pt: ['cumprimento; usado pela manhã'],
      en: ['greeting\nused in the morning'],
    };
    const initial = draftFromCard(imported);
    expect(contentFromDraft(initial, imported).translations).toEqual(
      imported.translations,
    );
    expect(patchFromDraft(initial, imported)).toEqual({});
    expect(
      patchFromDraft({ ...initial, expression: '生徒' }, imported),
    ).toEqual({ expression: '生徒' });
  });

  it('updates only the edited translation language and permits explicit clearing', () => {
    const original = contentFromDraft(draft());
    const initial = draftFromCard(original);
    const patch = patchFromDraft(
      { ...initial, portuguese: 'aluno; universitário' },
      original,
    );
    expect(patch).toEqual({ translations: { pt: ['aluno', 'universitário'] } });
    // An English change arriving while this editor is open remains authoritative.
    const remote = {
      ...original.translations,
      en: ['learner; school student'],
    };
    expect({ ...remote, ...patch.translations }).toEqual({
      pt: ['aluno', 'universitário'],
      en: ['learner; school student'],
    });
    expect(patchFromDraft({ ...initial, portuguese: '' }, original)).toEqual({
      translations: { pt: [] },
    });
    expect(
      patchFromDraft({ ...initial, english: 'learner' }, original),
    ).toEqual({ translations: { en: ['learner'] } });
  });
  it('keeps Portuguese and English separate and always derives expression and answer faces', () => {
    const content = contentFromDraft(draft());
    expect(content.translations).toEqual({
      pt: ['estudante', 'aluno'],
      en: ['student'],
    });
    expect(content.front).toBe('学生');
    expect(content.back).toContain('がくせい');
    expect(content.back).toContain('estudante; aluno');
    expect(content.back).toContain('student');
    expect(content.sortKey).toBe('がくせい');
    expect(content.classifications).toEqual([{ scheme: 'jlpt', level: 'N5' }]);
  });

  it('accepts either translation language and sends explicit clearing of the other', () => {
    const original = contentFromDraft(draft());
    const edited = contentFromDraft(draft({ portuguese: '' }), original);
    expect(edited.translations).toEqual({ pt: [], en: ['student'] });
    expect(contentFromDraft(draft({ english: '' })).translations).toEqual({
      pt: ['estudante', 'aluno'],
      en: [],
    });
    expect(() =>
      contentFromDraft(draft({ portuguese: '', english: '' })),
    ).toThrow('tradução');
  });

  it('requires a kana reading even when the expression is already kana', () => {
    for (const reading of ['', 'gakusei', '学生', 'がく生']) {
      expect(() =>
        contentFromDraft(draft({ expression: 'がくせい', reading })),
      ).toThrow('hiragana ou katakana');
    }
    for (const reading of ['がくせい', 'ガクセイ', 'コーヒー', 'ｺｰﾋｰ'])
      expect(contentFromDraft(draft({ reading })).reading).toBe(reading);
  });
  it('allows an explicitly omitted reading and removes its section from the automatic answer', () => {
    const content = contentFromDraft(
      draft({ readingOmitted: true, reading: '' }),
    );
    expect(content.reading).toBe('');
    expect(content.readingOmitted).toBe(true);
    expect(content.back).not.toContain('Leitura');
    expect(content.back).not.toContain('—');
    expect(content.back).toContain('estudante');
    expect(content.front).toBe('学生');
    expect(draftFromCard(content).readingOmitted).toBe(true);
  });
  it('clears reading on omission and restores valid kana when the checkbox is unchecked', () => {
    const original = contentFromDraft(draft());
    const initial = draftFromCard(original);
    expect(
      patchFromDraft({ ...initial, readingOmitted: true }, original),
    ).toEqual({ readingOmitted: true, reading: '' });
    const omitted = contentFromDraft({ ...initial, readingOmitted: true });
    expect(() =>
      contentFromDraft({ ...draftFromCard(omitted), readingOmitted: false }),
    ).toThrow('hiragana ou katakana');
    expect(
      patchFromDraft(
        {
          ...draftFromCard(omitted),
          readingOmitted: false,
          reading: 'がくせい',
        },
        omitted,
      ),
    ).toEqual({ reading: 'がくせい', readingOmitted: false });
  });

  it('requires an expression and selected levels without editable faces or ordering fields', () => {
    expect(() => contentFromDraft(draft({ expression: '' }))).toThrow(
      'expressão',
    );
    expect(() => contentFromDraft(draft({ levels: [] }))).toThrow('nível');
    expect(emptyDraft()).not.toHaveProperty('front');
    expect(emptyDraft()).not.toHaveProperty('back');
    expect(emptyDraft()).not.toHaveProperty('sortKey');
  });

  it('suggests reading and both translation languages without changing the draft', () => {
    const value = draft();
    const before = structuredClone(value);
    const suggestion = suggestedFaces(value);
    expect(suggestion.front).toBe('学生');
    expect(suggestion.back).toContain('がくせい');
    expect(suggestion.back).toContain('Português: estudante; aluno');
    expect(suggestion.back).toContain('English: student');
    expect(value).toEqual(before);
  });

  it('splits explicit senses without destroying comma punctuation', () => {
    expect(
      splitTranslations('sim, por favor; por gentileza\nsim, por favor'),
    ).toEqual(['sim, por favor', 'por gentileza']);
  });

  it('round trips vocabulary edits with examples in the automatic answer and exact levels', () => {
    const content = contentFromDraft(
      draft({
        levels: ['N5', 'N3'],
        examples: [
          {
            text: ' 私は学生です。 ',
            reading: ' わたしはがくせいです ',
            meaning: ' Sou estudante. ',
          },
        ],
      }),
    );
    content.classifications.push({ scheme: 'course', level: 'A' });
    expect(contentFromDraft(draftFromCard(content), content)).toEqual(content);
    expect(content.back).toContain('私は学生です。');
    expect(content.back).toContain('Sou estudante.');
    expect(content.classifications.map((item) => item.level)).toEqual([
      'N5',
      'N3',
      'A',
    ]);
  });

  it('rejects empty example rows and permits optional example details', () => {
    expect(() =>
      contentFromDraft(
        draft({ examples: [{ text: '', reading: '', meaning: '' }] }),
      ),
    ).toThrow('exemplo vazio');
    expect(
      contentFromDraft(
        draft({ examples: [{ text: '学生です。', reading: '', meaning: '' }] }),
      ).examples,
    ).toEqual([{ text: '学生です。' }]);
  });
});
