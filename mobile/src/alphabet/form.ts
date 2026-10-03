import type { AlphabetContent } from '../../../backend/convex/alphabetDomain';
import { formatKanjiFaces } from '../../../shared/kanji';

export const jlptLevels = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
export type JlptLevel = (typeof jlptLevels)[number];
export type ExampleDraft = { text: string; reading: string; meaning: string };
export type KanjiDraft = {
  symbol: string;
  meanings: string;
  kunYomi: string;
  onYomi: string;
  radicals: string;
  levels: JlptLevel[];
  examples: ExampleDraft[];
};

export function splitEntries(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,、;\n]/u)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

export function emptyDraft(): KanjiDraft {
  return {
    symbol: '',
    meanings: '',
    kunYomi: '',
    onYomi: '',
    radicals: '',
    levels: [],
    examples: [],
  };
}

export function draftFromCard(card: AlphabetContent): KanjiDraft {
  if (card.details.kind !== 'kanji')
    throw new Error('Este editor aceita cards de kanji.');
  return {
    symbol: card.symbol,
    meanings: card.meanings.join('; '),
    kunYomi: card.details.kunYomi.join('; '),
    onYomi: card.details.onYomi.join('; '),
    radicals: card.details.radicals.join('; '),
    levels: jlptLevels.filter((level) =>
      card.classifications.some(
        (entry) => entry.scheme === 'jlpt' && entry.level === level,
      ),
    ),
    examples: card.examples.map((example) => ({
      text: example.text,
      reading: example.reading ?? '',
      meaning: example.meaning ?? '',
    })),
  };
}

export function kanjiDataFromDraft(draft: KanjiDraft) {
  return {
    symbol: draft.symbol.trim(),
    meanings: splitEntries(draft.meanings),
    details: {
      kind: 'kanji' as const,
      kunYomi: splitEntries(draft.kunYomi),
      onYomi: splitEntries(draft.onYomi),
      radicals: splitEntries(draft.radicals),
    },
  };
}

export function kanjiDataFromCard(
  card: Pick<AlphabetContent, 'symbol' | 'meanings' | 'details'>,
) {
  if (card.details.kind !== 'kanji') return null;
  return {
    symbol: card.symbol,
    meanings: card.meanings,
    details: card.details,
  };
}

export function contentFromDraft(
  draft: KanjiDraft,
  original?: AlphabetContent,
): AlphabetContent {
  if (!draft.symbol.trim()) throw new Error('Informe o kanji.');
  if (!splitEntries(draft.meanings).length)
    throw new Error('Informe pelo menos um significado.');
  if (!draft.levels.length)
    throw new Error('Selecione pelo menos um nível JLPT.');
  if (draft.examples.some((example) => !example.text.trim())) {
    throw new Error(
      'Preencha o texto de cada exemplo ou remova o exemplo vazio.',
    );
  }
  const data = kanjiDataFromDraft(draft);
  return {
    ...data,
    language: original?.language ?? 'ja',
    writingSystem: original?.writingSystem ?? 'Hani',
    classifications: [
      ...draft.levels.map((level) => ({ scheme: 'jlpt', level })),
      ...(original?.classifications.filter(
        (entry) => entry.scheme !== 'jlpt',
      ) ?? []),
    ],
    examples: draft.examples.map((example) => ({
      text: example.text.trim(),
      ...(example.reading.trim() ? { reading: example.reading.trim() } : {}),
      ...(example.meaning.trim() ? { meaning: example.meaning.trim() } : {}),
    })),
    ...formatKanjiFaces(data),
    sortKey: data.details.kunYomi[0] || data.details.onYomi[0] || data.symbol,
  };
}

export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data: unknown = error.data;
    if (typeof data === 'string') return data;
    if (
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
    )
      return data.message;
  }
  if (error instanceof Error && !error.message.includes('[CONVEX'))
    return error.message;
  return 'Não foi possível concluir. Confira a conexão e tente novamente.';
}

export function rates(
  stats: { correct: number; partial: number; attempts: number } | null,
) {
  if (!stats?.attempts) return null;
  return {
    full: Math.round((stats.correct / stats.attempts) * 100),
    weighted: Math.round(
      ((stats.correct + stats.partial * 0.5) / stats.attempts) * 100,
    ),
  };
}
