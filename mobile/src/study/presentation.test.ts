import { describe, expect, it } from 'vitest';
import type { Doc } from '../../../backend/convex/_generated/dataModel';
import { studyFaces } from './presentation';
import { normalizeContent } from '../../../shared/examContent';
import { formatGrammarFaces } from '../../../shared/grammar';
import { formatVocabularyFaces } from '../../../shared/vocabulary';

describe('study card faces', () => {
  it('keeps a new grammar title on the front, optional summary and examples on the back, and full explanation behind details', () => {
    const content = {
      title: '〜てもいいです',
      shortExplanation: 'Permissão.',
      explanation: 'EXPLICAÇÃO COMPLETA SÓ NO BOTÃO',
      examples: [
        { text: '写真を撮ってもいいです。', meaning: 'Pode tirar fotos.' },
      ],
    };
    const snapshot: Doc<'studyPresentations'>['snapshot'] = {
      ...content,
      ...formatGrammarFaces(content),
      language: 'ja',
      category: 'grammar',
      sortKey: content.title,
      classifications: [{ scheme: 'jlpt', level: 'N5' }],
      contentVersion: 2,
    };
    const faces = studyFaces(snapshot);
    expect(faces.front).toBe(content.title);
    expect(faces.sections[0].value).toContain('Permissão.');
    expect(faces.sections[0].value).toContain(content.examples[0].text);
    expect(JSON.stringify(faces.sections)).not.toContain(content.explanation);
    expect(
      faces.detailsSections?.find((section) => section.key === 'explanation')
        ?.value,
    ).toBe(content.explanation);
    const withoutSummary = {
      ...snapshot,
      shortExplanation: '',
      examples: [],
      back: '',
    };
    const empty = studyFaces(withoutSummary);
    expect(empty.sections).toEqual([]);
    expect(empty.detailsSections).toEqual([
      { key: 'explanation', label: 'Explicação', value: content.explanation },
    ]);
  });
  it('shows the canonical vocabulary expression and keeps optional reading and examples on the answer side', () => {
    const content = {
      expression: 'ありがとう',
      reading: '',
      readingOmitted: true,
      translations: { pt: ['obrigado'] },
      examples: [
        { text: 'ありがとうございます。', meaning: 'Muito obrigado.' },
      ],
    };
    const snapshot: Doc<'studyPresentations'>['snapshot'] = {
      ...content,
      ...formatVocabularyFaces(content),
      language: 'ja',
      category: 'vocabulary',
      sortKey: content.expression,
      classifications: [{ scheme: 'jlpt', level: 'N5' }],
      contentVersion: 3,
    };
    const faces = studyFaces(snapshot);
    expect(faces.front).toBe('ありがとう');
    expect(faces.front).not.toContain('obrigado');
    expect(faces.sections[0].value).not.toContain('Leitura');
    expect(faces.sections[0].value).toContain('obrigado');
    expect(faces.sections[0].value).toContain('ありがとうございます。');
  });
  it('keeps exam answers and explanations off the front while preserving long questions and frozen details', () => {
    const content = normalizeContent({
      language: 'ja',
      title: '読解の練習',
      prompt: '長い日本語の文章。\n'.repeat(900),
      alternatives: ['選択肢の一', '選択肢の二'],
      answer: '二番です。',
      explanation: '説明の文章。\n'.repeat(1200),
      sortKey: 'どっかい',
      classifications: [{ scheme: 'jlpt', level: 'N3' }],
    });
    const snapshot: Doc<'studyPresentations'>['snapshot'] = {
      ...content,
      category: 'exam',
      contentVersion: 7,
    };
    const original = structuredClone(snapshot);
    const faces = studyFaces(snapshot);
    expect(faces.isExam).toBe(true);
    expect(faces.front).toBe(content.front);
    expect(faces.front).toContain(content.prompt);
    expect(faces.front).toContain('2. 選択肢の二');
    expect(faces.front).not.toContain(content.answer);
    expect(faces.front).not.toContain(content.explanation);
    expect(faces.detailsSections).toEqual([
      {
        key: 'prompt',
        label: 'Enunciado e alternativas',
        value: content.front,
      },
      { key: 'answer', label: 'Resposta', value: content.answer },
      { key: 'explanation', label: 'Explicação', value: content.explanation },
    ]);
    expect(snapshot).toEqual(original);
  });
  it('keeps grammar answers out of the prompt and places complete long content in details', () => {
    const snapshot: Doc<'studyPresentations'>['snapshot'] = {
      category: 'grammar',
      language: 'ja',
      title: '〜てもいいです — permissão',
      front: 'Como pedir permissão?',
      back: 'Use 〜てもいいですか。',
      explanation: 'Use a forma て.\n' + 'Explicação completa. '.repeat(300),
      examples: [
        {
          text: '写真を撮ってもいいですか。\nはい。',
          reading: 'しゃしんをとってもいいですか。',
          meaning: 'Posso tirar uma foto?\nSim.',
        },
      ],
      sortKey: 'てもいいです',
      classifications: [{ scheme: 'jlpt', level: 'N5' }],
      contentVersion: 3,
    };
    const before = structuredClone(snapshot);
    const faces = studyFaces(snapshot);
    expect(faces.isGrammar).toBe(true);
    expect(faces.front).toBe(snapshot.front);
    expect(faces.front).not.toContain(snapshot.title);
    expect(faces.front).not.toContain('てもいい');
    expect(faces.sections).toEqual([
      { key: 'back', label: 'Resposta', value: snapshot.back },
    ]);
    expect(faces.detailsSections).toEqual([
      { key: 'back', label: 'Resposta', value: snapshot.back },
      { key: 'explanation', label: 'Explicação', value: snapshot.explanation },
      {
        key: 'example-0',
        label: 'Exemplo 1',
        value:
          '写真を撮ってもいいですか。\nはい。\nしゃしんをとってもいいですか。\nPosso tirar uma foto?\nSim.',
      },
    ]);
    expect(snapshot).toEqual(before);
  });
  it('uses only the authored front and back of the vocabulary snapshot', () => {
    const snapshot: Doc<'studyPresentations'>['snapshot'] = {
      category: 'vocabulary',
      language: 'ja',
      expression: '学生',
      reading: 'がくせい',
      translations: { pt: ['estudante'], en: ['student'] },
      examples: [],
      classifications: [{ scheme: 'jlpt', level: 'N5' }],
      sortKey: 'がくせい',
      front: 'Como se diz estudante?',
      back: '学生（がくせい）\nExemplo: 私は学生です。',
      contentVersion: 2,
    };
    const faces = studyFaces(snapshot);
    expect(faces.isKanji).toBe(false);
    expect(faces.front).toBe('Como se diz estudante?');
    expect(faces.sections).toEqual([
      { key: 'back', label: 'Resposta', value: snapshot.back },
    ]);
    expect(faces.front).not.toContain(snapshot.reading);
  });

  it('keeps historical kanji faces canonical from that snapshot', () => {
    const snapshot: Doc<'studyPresentations'>['snapshot'] = {
      language: 'ja',
      writingSystem: 'Hani',
      symbol: '学',
      meanings: ['aprender'],
      details: { kind: 'kanji', kunYomi: [], onYomi: ['ガク'], radicals: [] },
      examples: [],
      classifications: [{ scheme: 'jlpt', level: 'N5' }],
      sortKey: 'がく',
      front: 'legacy front',
      back: 'legacy back',
      contentVersion: 1,
    };
    const faces = studyFaces(snapshot);
    expect(faces.front).toBe('学');
    expect(faces.sections.map((section) => section.value)).toEqual([
      '—',
      'ガク',
      'aprender',
    ]);
  });

  it('shows kun’yomi, on’yomi, meanings and available radicals without changing the snapshot', () => {
    const snapshot: Doc<'studyPresentations'>['snapshot'] = {
      language: 'ja',
      writingSystem: 'Hani',
      symbol: '学',
      meanings: ['aprender', 'estudo'],
      details: {
        kind: 'kanji',
        kunYomi: ['まな.ぶ', 'まなび'],
        onYomi: ['ガク'],
        radicals: ['子'],
      },
      examples: [],
      classifications: [],
      sortKey: 'がく',
      front: '学',
      back: 'authored historical response',
      contentVersion: 1,
    };
    const original = structuredClone(snapshot);
    const faces = studyFaces(snapshot);
    expect(faces.sections.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: 'kunYomi', value: 'まな.ぶ; まなび' },
      { key: 'onYomi', value: 'ガク' },
      { key: 'meanings', value: 'aprender; estudo' },
      { key: 'radicals', value: '子' },
    ]);
    expect(snapshot).toEqual(original);
  });
});
