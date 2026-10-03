export type ProgressCategory =
  'all' | 'alphabet' | 'vocabulary' | 'grammar' | 'exam';
export type ProgressLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5';
export type ProgressFilters = {
  category?: ProgressCategory;
  level?: ProgressLevel;
  archived?: boolean;
};

export type ProgressCard = {
  _id: string;
  category: Exclude<ProgressCategory, 'all'>;
  archived: boolean;
  classifications: { scheme: string; level: string }[];
};

export type ProgressStats = {
  cardId: string;
  correct: number;
  partial: number;
  incorrect: number;
  attempts: number;
};

export type ProgressOverview = {
  totalCards: number;
  studiedCards: number;
  neverStudiedCards: number;
  correct: number;
  partial: number;
  incorrect: number;
  attempts: number;
  integralAccuracy: number | null;
  weightedAccuracy: number | null;
};

/** Uses current card membership, so edits and archival never rewrite history. */
export function aggregateStudyProgress(
  cards: readonly ProgressCard[],
  stats: readonly ProgressStats[],
  filters: ProgressFilters = {},
): ProgressOverview {
  const selected = new Map(
    cards
      .filter(
        (card) =>
          card.category !== 'exam' &&
          card.archived === (filters.archived ?? false) &&
          (!filters.category ||
            filters.category === 'all' ||
            card.category === filters.category) &&
          (!filters.level ||
            card.classifications.some(
              (item) => item.scheme === 'jlpt' && item.level === filters.level,
            )),
      )
      .map((card) => [card._id, card]),
  );
  const byCard = new Map(stats.map((stat) => [stat.cardId, stat]));
  let studiedCards = 0;
  let correct = 0;
  let partial = 0;
  let incorrect = 0;
  for (const cardId of selected.keys()) {
    const stat = byCard.get(cardId);
    if (!stat) continue;
    const attempts = stat.correct + stat.partial + stat.incorrect;
    if (attempts > 0) studiedCards += 1;
    correct += stat.correct;
    partial += stat.partial;
    incorrect += stat.incorrect;
  }
  const attempts = correct + partial + incorrect;
  return {
    totalCards: selected.size,
    studiedCards,
    neverStudiedCards: selected.size - studiedCards,
    correct,
    partial,
    incorrect,
    attempts,
    integralAccuracy: attempts ? correct / attempts : null,
    weightedAccuracy: attempts ? (correct + partial * 0.5) / attempts : null,
  };
}
