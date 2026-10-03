import type {
  VocabularyContent,
  VocabularyPatch,
} from '../../../backend/convex/vocabularyDomain';
import {
  formatVocabularyFaces,
  isKanaReading,
} from '../../../shared/vocabulary';
import {
  jlptLevels,
  type ExampleDraft,
  type JlptLevel,
} from '../alphabet/form';

export type VocabularyDraft = {
  expression: string;
  reading: string;
  readingOmitted: boolean;
  portuguese: string;
  english: string;
  levels: JlptLevel[];
  examples: ExampleDraft[];
};

// Commas can belong to a translation; only an explicit separator splits senses.
export function splitTranslations(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[;\n]/u)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

export function emptyDraft(): VocabularyDraft {
  return {
    expression: '',
    reading: '',
    readingOmitted: false,
    portuguese: '',
    english: '',
    levels: [],
    examples: [],
  };
}

export function draftFromCard(card: VocabularyContent): VocabularyDraft {
  return {
    expression: card.expression,
    reading: card.reading,
    readingOmitted: card.readingOmitted === true,
    portuguese: card.translations.pt?.join('; ') ?? '',
    english: card.translations.en?.join('; ') ?? '',
    levels: jlptLevels.filter((level) =>
      card.classifications.some(
        (item) => item.scheme === 'jlpt' && item.level === level,
      ),
    ),
    examples: card.examples.map((example) => ({
      text: example.text,
      reading: example.reading ?? '',
      meaning: example.meaning ?? '',
    })),
  };
}

export function translationsFromDraft(
  draft: VocabularyDraft,
  original?: VocabularyContent,
) {
  // Existing senses may contain the editor's separators. Parse only a language
  // the user actually changed, so editing another field preserves those senses.
  const pt =
    original &&
    draft.portuguese === (original.translations.pt?.join('; ') ?? '')
      ? (original.translations.pt ?? [])
      : splitTranslations(draft.portuguese);
  const en =
    original && draft.english === (original.translations.en?.join('; ') ?? '')
      ? (original.translations.en ?? [])
      : splitTranslations(draft.english);
  return { ...(pt.length ? { pt } : {}), ...(en.length ? { en } : {}) };
}

export function suggestedFaces(
  draft: VocabularyDraft,
  original?: VocabularyContent,
) {
  return formatVocabularyFaces({
    expression: draft.expression.trim(),
    reading: draft.readingOmitted ? '' : draft.reading.trim(),
    readingOmitted: draft.readingOmitted,
    translations: translationsFromDraft(draft, original),
    examples: draft.examples.map((example) => ({
      text: example.text.trim(),
      reading: example.reading.trim(),
      meaning: example.meaning.trim(),
    })),
  });
}

export function contentFromDraft(
  draft: VocabularyDraft,
  original?: VocabularyContent,
): VocabularyContent {
  if (!draft.expression.trim())
    throw new Error('Informe a palavra ou expressão.');
  if (
    !draft.readingOmitted &&
    (!draft.reading.trim() || !isKanaReading(draft.reading))
  )
    throw new Error('Informe a leitura em hiragana ou katakana.');
  const translations = translationsFromDraft(draft, original);
  if (!translations.pt?.length && !translations.en?.length)
    throw new Error('Informe pelo menos uma tradução em português ou inglês.');
  if (!draft.levels.length)
    throw new Error('Selecione pelo menos um nível JLPT.');
  if (draft.examples.some((example) => !example.text.trim()))
    throw new Error(
      'Preencha o texto de cada exemplo ou remova o exemplo vazio.',
    );
  return {
    language: original?.language ?? 'ja',
    expression: draft.expression.trim(),
    reading: draft.readingOmitted ? '' : draft.reading.trim(),
    readingOmitted: draft.readingOmitted,
    // Empty arrays are intentional on update: clearing one language must remove it.
    translations: { pt: translations.pt ?? [], en: translations.en ?? [] },
    classifications: [
      ...draft.levels.map((level) => ({ scheme: 'jlpt', level })),
      ...(original?.classifications.filter((item) => item.scheme !== 'jlpt') ??
        []),
    ],
    examples: draft.examples.map((example) => ({
      text: example.text.trim(),
      ...(example.reading.trim() ? { reading: example.reading.trim() } : {}),
      ...(example.meaning.trim() ? { meaning: example.meaning.trim() } : {}),
    })),
    ...formatVocabularyFaces({
      expression: draft.expression.trim(),
      reading: draft.readingOmitted ? '' : draft.reading.trim(),
      readingOmitted: draft.readingOmitted,
      translations,
      examples: draft.examples.map((example) => ({
        text: example.text.trim(),
        reading: example.reading.trim(),
        meaning: example.meaning.trim(),
      })),
    }),
    sortKey:
      (draft.readingOmitted ? '' : draft.reading.trim()) ||
      draft.expression.trim(),
  };
}

export function patchFromDraft(
  draft: VocabularyDraft,
  original: VocabularyContent,
): VocabularyPatch {
  const initial = draftFromCard(original);
  const content = contentFromDraft(draft, original);
  let patch: VocabularyPatch = {};
  for (const [field, draftField] of [
    ['expression', 'expression'],
    ['reading', 'reading'],
    ['readingOmitted', 'readingOmitted'],
    ['examples', 'examples'],
    ['classifications', 'levels'],
  ] as const) {
    if (
      JSON.stringify(draft[draftField]) !== JSON.stringify(initial[draftField])
    ) {
      patch = { ...patch, [field]: content[field] };
    }
  }
  // Toggling omission must clear or restore the stored reading even when the
  // text kept in the editor did not change while its field was hidden.
  if (draft.readingOmitted !== initial.readingOmitted)
    patch.reading = content.reading;
  const translations: NonNullable<VocabularyPatch['translations']> = {};
  if (draft.portuguese !== initial.portuguese)
    translations.pt = content.translations.pt ?? [];
  if (draft.english !== initial.english)
    translations.en = content.translations.en ?? [];
  if (Object.keys(translations).length) patch.translations = translations;
  return patch;
}
