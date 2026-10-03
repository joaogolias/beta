export interface VocabularyFaceSource {
  expression: string;
  reading?: string;
  readingOmitted?: boolean;
  translations: { pt?: readonly string[]; en?: readonly string[] };
  examples?: readonly { text: string; reading?: string; meaning?: string }[];
}

/** Canonical faces shared by creation, editing and new study snapshots. */
export function formatVocabularyFaces(card: VocabularyFaceSource) {
  const sections = [
    ...(!card.readingOmitted && card.reading?.trim()
      ? [`読み方 · Leitura: ${card.reading.trim()}`]
      : []),
    ...(card.translations.pt?.length
      ? [`Português: ${card.translations.pt.join('; ')}`]
      : []),
    ...(card.translations.en?.length
      ? [`English: ${card.translations.en.join('; ')}`]
      : []),
    ...(card.examples?.length
      ? [
          `Exemplos\n${card.examples.map((example) => [example.text, example.reading, example.meaning].filter(Boolean).join('\n')).join('\n\n')}`,
        ]
      : []),
  ];
  return { front: card.expression.trim(), back: sections.join('\n') };
}

export function isKanaReading(value: string) {
  const normalized = value.trim().normalize('NFKC');
  return (
    /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(normalized) &&
    /^[\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+$/u.test(normalized)
  );
}
