import { describe, expect, it } from 'vitest';
import { ConvexError } from 'convex/values';
import type { AlphabetContent } from '../../../backend/convex/alphabetDomain';
import { formatKanjiFaces, kanjiBackSections } from '../../../shared/kanji';
import {
  contentFromDraft,
  draftFromCard,
  emptyDraft,
  errorMessage,
  kanjiDataFromCard,
  kanjiDataFromDraft,
  rates,
  splitEntries,
} from './form';

const kanji: AlphabetContent = {
  language: 'ja',
  writingSystem: 'Hani',
  symbol: '学',
  meanings: ['estudo', 'aprender'],
  details: {
    kind: 'kanji',
    kunYomi: ['まな.ぶ'],
    onYomi: ['ガク'],
    radicals: ['子'],
  },
  examples: [
    { text: '学生', reading: 'がくせい', meaning: 'estudante' },
    { text: '学ぶ' },
  ],
  classifications: [
    { scheme: 'jlpt', level: 'N5' },
    { scheme: 'jlpt', level: 'N4' },
  ],
  front: 'O que significa 学?',
  back: 'Minha resposta pessoal, com exemplos.',
  sortKey: 'がく',
};

describe('kanji editor', () => {
  it('preserves editable data and generates fixed kanji faces instead of legacy custom text', () => {
    const saved = contentFromDraft(draftFromCard(kanji), kanji);
    expect(saved).toMatchObject({
      symbol: kanji.symbol,
      meanings: kanji.meanings,
      details: kanji.details,
      examples: kanji.examples,
      classifications: kanji.classifications,
      sortKey: 'まな.ぶ',
    });
    expect(saved.front).toBe('学');
    expect(saved.back).toContain('estudo');
    expect(saved.back).toContain('まな.ぶ');
    expect(saved.back).toContain('ガク');
    expect(saved.back).toContain('子');
    expect(saved.back).not.toContain('学生');
    expect(saved.back).not.toBe(kanji.back);
    expect(kanji.front).toBe('O que significa 学?');
    expect(kanji.back).toBe('Minha resposta pessoal, com exemplos.');
  });

  it('uses the same generated faces in the live preview and in the saved content', () => {
    const draft = draftFromCard(kanji);
    draft.meanings = ' aprender; estudo';
    draft.onYomi = ' ガク ';
    const preview = formatKanjiFaces(kanjiDataFromDraft(draft));
    expect(contentFromDraft(draft)).toMatchObject(preview);
    expect(
      kanjiBackSections(kanjiDataFromDraft(draft)).map(({ key }) => key),
    ).toEqual(['meanings', 'kunYomi', 'onYomi', 'radicals']);
    expect(preview.front).toBe('学');
    expect(preview.back).toContain('aprender');
  });

  it('accepts all reading and radical fields empty, without requiring an indirect sorting reading', () => {
    const draft = draftFromCard(kanji);
    draft.kunYomi = '';
    draft.onYomi = '';
    draft.radicals = '';
    const saved = contentFromDraft(draft);
    expect(saved.details).toEqual({
      kind: 'kanji',
      kunYomi: [],
      onYomi: [],
      radicals: [],
    });
    expect(saved.sortKey).toBe('学');
    expect(saved.front).toBe('学');
    expect(saved.back).toContain('estudo');
    expect(
      kanjiBackSections(kanjiDataFromDraft(draft))
        .filter(({ key }) => key !== 'meanings')
        .map(({ value }) => value),
    ).toEqual(['—', '—', '—']);
  });

  it('uses available readings to sort and preserves okurigana separators', () => {
    expect(splitEntries(' まな.ぶ; まな.ぶ\nガク、がく ')).toEqual([
      'まな.ぶ',
      'ガク',
      'がく',
    ]);
    const draft = draftFromCard(kanji);
    expect(contentFromDraft(draft).sortKey).toBe('まな.ぶ');
    draft.kunYomi = '';
    expect(contentFromDraft(draft).details).toMatchObject({
      kunYomi: [],
      onYomi: ['ガク'],
    });
    expect(contentFromDraft(draft).sortKey).toBe('ガク');
  });

  it('still requires meaning, JLPT levels and complete example text', () => {
    expect(emptyDraft().levels).toEqual([]);
    const draft = draftFromCard(kanji);
    draft.levels = [];
    expect(() => contentFromDraft(draft)).toThrow('pelo menos um nível');
    draft.levels = ['N5'];
    draft.meanings = '   ';
    expect(() => contentFromDraft(draft)).toThrow('significado');
    draft.meanings = 'estudo';
    draft.examples.push({ text: ' ', reading: 'がく', meaning: 'estudo' });
    expect(() => contentFromDraft(draft)).toThrow('exemplo');
  });

  it('keeps glyph variants intact instead of compatibility-normalizing the kanji', () => {
    const draft = draftFromCard(kanji);
    draft.symbol = ' 神 ';
    expect(contentFromDraft(draft).symbol).toBe('神');
  });

  it('preserves classifications from other schemes and the existing language tag when editing', () => {
    const existing = {
      ...kanji,
      language: 'ja-JP',
      classifications: [
        ...kanji.classifications,
        { scheme: 'school', level: 'GRADE-1' },
      ],
    };
    const draft = draftFromCard(existing);
    draft.meanings = 'aprender';
    const edited = contentFromDraft(draft, existing);
    expect(edited.language).toBe('ja-JP');
    expect(edited.classifications).toEqual(existing.classifications);
    expect(edited.meanings).toEqual(['aprender']);
  });

  it('surfaces the server validation message and keeps runtime details out of generic errors', () => {
    expect(
      errorMessage(
        new ConvexError({ code: 'CONFLICT', message: 'Este kanji já existe.' }),
      ),
    ).toBe('Este kanji já existe.');
    expect(
      errorMessage(new Error('[CONVEX M(alphabet:create)] Server Error')),
    ).toBe('Não foi possível concluir. Confira a conexão e tente novamente.');
  });
});

describe('study performance display', () => {
  it('formats review data from its snapshot, preserving history when the current card changes', () => {
    const attempt = { snapshot: { ...kanji, contentVersion: 1 } };
    const current = {
      ...kanji,
      meanings: ['significado atualizado'],
      details: {
        kind: 'kanji' as const,
        kunYomi: [],
        onYomi: [],
        radicals: [],
      },
      contentVersion: 2,
    };
    const historical = kanjiDataFromCard(attempt.snapshot);
    const latest = kanjiDataFromCard(current);
    if (!historical || !latest) throw new Error('Expected kanji sources');
    const faces = formatKanjiFaces(historical);
    expect(faces.front).toBe('学');
    expect(faces.back).toContain('estudo');
    expect(faces.back).toContain('まな.ぶ');
    expect(faces.back).not.toContain('significado atualizado');
    expect(formatKanjiFaces(latest).back).toContain('significado atualizado');
    expect(attempt.snapshot.contentVersion).toBe(1);
    expect(attempt.snapshot.back).toBe('Minha resposta pessoal, com exemplos.');
    expect(
      kanjiDataFromCard({
        ...kanji,
        details: { kind: 'generic', readings: [] },
      }),
    ).toBeNull();
  });

  it('distinguishes unseen cards, full accuracy and partial-weighted performance', () => {
    expect(rates(null)).toBeNull();
    expect(rates({ correct: 0, partial: 0, attempts: 0 })).toBeNull();
    expect(rates({ correct: 1, partial: 2, attempts: 4 })).toEqual({
      full: 25,
      weighted: 50,
    });
    expect(rates({ correct: 0, partial: 0, attempts: 1 })).toEqual({
      full: 0,
      weighted: 0,
    });
  });
});
