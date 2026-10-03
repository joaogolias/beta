// One Unicode version and segmentation implementation in Convex and Hermes.
export { countGraphemes } from 'unicode-segmenter/grapheme';

export const MAX_GRAMMAR_FRONT_LENGTH = 200;

export interface GrammarFaceSource {
  title: string;
  shortExplanation?: string;
  examples?: readonly { text: string; reading?: string; meaning?: string }[];
}

/** The complete explanation is available separately, never exposed by fallback. */
export function formatGrammarFaces(card: GrammarFaceSource) {
  const sections = [
    ...(card.shortExplanation?.trim() ? [card.shortExplanation.trim()] : []),
    ...(card.examples?.length
      ? [
          `Exemplos\n${card.examples.map((example) => [example.text, example.reading, example.meaning].filter(Boolean).join('\n')).join('\n\n')}`,
        ]
      : []),
  ];
  return { front: card.title.trim(), back: sections.join('\n\n') };
}
