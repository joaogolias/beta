import type {
  GrammarContent,
  GrammarPatch,
} from '../../../backend/convex/grammarDomain';
import { formatGrammarFaces } from '../../../shared/grammar';
import {
  jlptLevels,
  type ExampleDraft,
  type JlptLevel,
} from '../alphabet/form';

export type GrammarDraft = {
  title: string;
  explanation: string;
  shortExplanation: string;
  examples: ExampleDraft[];
  levels: JlptLevel[];
};

export function emptyDraft(): GrammarDraft {
  return {
    title: '',
    explanation: '',
    shortExplanation: '',
    examples: [],
    levels: [],
  };
}

export function draftFromCard(card: GrammarContent): GrammarDraft {
  return {
    title: card.title,
    explanation: card.explanation,
    shortExplanation: card.shortExplanation ?? '',
    examples: card.examples.map((example) => ({
      text: example.text,
      reading: example.reading ?? '',
      meaning: example.meaning ?? '',
    })),
    levels: jlptLevels.filter((level) =>
      card.classifications.some(
        (item) => item.scheme === 'jlpt' && item.level === level,
      ),
    ),
  };
}

export function contentFromDraft(
  draft: GrammarDraft,
  original?: GrammarContent,
): GrammarContent {
  if (!draft.title.trim())
    throw new Error('Informe o título ou a estrutura gramatical.');
  if (!draft.explanation.trim())
    throw new Error('Escreva a explicação da gramática.');
  if (
    !draft.levels.length ||
    draft.levels.some((level) => !jlptLevels.includes(level))
  )
    throw new Error('Selecione pelo menos um nível JLPT.');
  if (draft.examples.some((example) => !example.text.trim()))
    throw new Error(
      'Preencha o texto de cada exemplo ou remova o exemplo vazio.',
    );
  return {
    language: original?.language ?? 'ja',
    title: draft.title.trim(),
    explanation: draft.explanation.trim(),
    shortExplanation: draft.shortExplanation.trim(),
    ...formatGrammarFaces({
      title: draft.title.trim(),
      shortExplanation: draft.shortExplanation.trim(),
      examples: draft.examples.map((example) => ({
        text: example.text.trim(),
        reading: example.reading.trim(),
        meaning: example.meaning.trim(),
      })),
    }),
    sortKey: draft.title.trim(),
    examples: draft.examples.map((example) => ({
      text: example.text.trim(),
      ...(example.reading.trim() ? { reading: example.reading.trim() } : {}),
      ...(example.meaning.trim() ? { meaning: example.meaning.trim() } : {}),
    })),
    classifications: [
      ...draft.levels.map((level) => ({ scheme: 'jlpt', level })),
      ...(original?.classifications.filter((item) => item.scheme !== 'jlpt') ??
        []),
    ],
  };
}

export function patchFromDraft(
  draft: GrammarDraft,
  original: GrammarContent,
): GrammarPatch {
  const initial = draftFromCard(original);
  const content = contentFromDraft(draft, original);
  let patch: GrammarPatch = {};
  for (const [field, draftField] of [
    ['title', 'title'],
    ['explanation', 'explanation'],
    ['examples', 'examples'],
    ['classifications', 'levels'],
  ] as const) {
    if (
      JSON.stringify(draft[draftField]) !== JSON.stringify(initial[draftField])
    )
      patch = { ...patch, [field]: content[field] };
  }
  if (draft.shortExplanation !== initial.shortExplanation)
    patch.shortExplanation = draft.shortExplanation.trim();
  return patch;
}
