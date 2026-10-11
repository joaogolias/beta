import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { fail } from './alphabetDomain';
import { aggregateStudyProgress } from '../../shared/studyProgress';
import { JLPT_SKILLS, summarizeAttempt } from '../../shared/jlpt';
import {
  LIBRARY_READ_BYTES,
  PAGE_READ_BYTES,
  ReadBudget,
  readWithinBudget,
} from './readBudget';
import type {
  McpStudyProgress,
  McpStudyProgressResult,
  McpStudyCards,
  McpStudyCardsResult,
} from './mcpPlanningSchemas';

const MAX_CARDS = 1000;
const categories = ['alphabet', 'vocabulary', 'grammar'] as const;
const levels = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;

/** Each category has its own stable cursor; callers can combine IDs across categories. */
export async function studyCardsForOwner(
  ctx: QueryCtx,
  ownerId: Id<'users'> | null,
  filters: McpStudyCards,
): Promise<McpStudyCardsResult> {
  const basis = 'lifetime_statistics_for_current_library' as const;
  if (!ownerId)
    return { items: [], cursor: null, isDone: true, scanned: 0, basis };
  const table =
    filters.category === 'alphabet'
      ? 'alphabetCards'
      : filters.category === 'vocabulary'
        ? 'vocabularyCards'
        : 'grammarCards';
  const page = await ctx.db
    .query(table)
    .withIndex('by_ownerId_and_archived_and_sortKey', (q) =>
      q.eq('ownerId', ownerId).eq('archived', filters.archived),
    )
    .paginate({
      numItems: filters.limit,
      cursor: filters.cursor,
      maximumBytesRead: PAGE_READ_BYTES,
    });
  const cards = page.page.filter(
    (card) =>
      !filters.level ||
      card.classifications.some(
        (item) => item.scheme === 'jlpt' && item.level === filters.level,
      ),
  );
  const items = await Promise.all(
    cards.map(async (card) => {
      const stat = await ctx.db
        .query('studyStats')
        .withIndex('by_ownerId_and_cardId', (q) =>
          q.eq('ownerId', ownerId).eq('cardId', card._id),
        )
        .unique();
      const correct = stat?.correct ?? 0;
      const partial = stat?.partial ?? 0;
      const incorrect = stat?.incorrect ?? 0;
      const attempts = correct + partial + incorrect;
      return {
        id: card._id,
        category: filters.category,
        language: card.language,
        label:
          'symbol' in card
            ? card.symbol
            : 'expression' in card
              ? card.expression
              : card.title,
        front: card.front,
        back: card.back,
        classifications: card.classifications,
        archived: card.archived,
        contentVersion: card.contentVersion,
        stats: {
          correct,
          partial,
          incorrect,
          attempts,
          integralAccuracy: attempts ? correct / attempts : null,
          weightedAccuracy: attempts
            ? (correct + partial * 0.5) / attempts
            : null,
          lastReviewedAt: stat?.lastReviewedAt ?? null,
        },
      };
    }),
  );
  return {
    items,
    cursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    scanned: page.page.length,
    basis,
  };
}

/** Exact bounded totals, not an unlabelled sample of a larger library. */
export async function studyProgressForOwner(
  ctx: QueryCtx,
  ownerId: Id<'users'> | null,
  filters: McpStudyProgress,
): Promise<McpStudyProgressResult> {
  const budget = new ReadBudget(
    LIBRARY_READ_BYTES,
    'O recorte excede 6 MiB de leitura. Consulte uma categoria menor ou percorra get_study_cards; nenhum resumo parcial foi retornado.',
  );
  const selected = (category: (typeof categories)[number]) =>
    filters.category === 'all' || filters.category === category;
  const [alphabet, vocabulary, grammar] = ownerId
    ? await Promise.all([
        selected('alphabet')
          ? readWithinBudget(
              ctx.db
                .query('alphabetCards')
                .withIndex('by_ownerId_and_archived_and_sortKey', (q) =>
                  q.eq('ownerId', ownerId).eq('archived', filters.archived),
                ),
              MAX_CARDS + 1,
              budget,
            )
          : [],
        selected('vocabulary')
          ? readWithinBudget(
              ctx.db
                .query('vocabularyCards')
                .withIndex('by_ownerId_and_archived_and_sortKey', (q) =>
                  q.eq('ownerId', ownerId).eq('archived', filters.archived),
                ),
              MAX_CARDS + 1,
              budget,
            )
          : [],
        selected('grammar')
          ? readWithinBudget(
              ctx.db
                .query('grammarCards')
                .withIndex('by_ownerId_and_archived_and_sortKey', (q) =>
                  q.eq('ownerId', ownerId).eq('archived', filters.archived),
                ),
              MAX_CARDS + 1,
              budget,
            )
          : [],
      ])
    : [[], [], []];
  if (alphabet.length + vocabulary.length + grammar.length > MAX_CARDS)
    fail(
      'VALIDATION',
      'O resumo suporta até 1.000 cards nas categorias selecionadas, antes do filtro de nível. Consulte uma categoria menor ou percorra get_study_cards; nenhum resumo parcial foi retornado.',
    );
  const cards = [
    ...alphabet.map((card) => ({
      ...card,
      category: 'alphabet' as const,
      label: card.symbol,
    })),
    ...vocabulary.map((card) => ({
      ...card,
      category: 'vocabulary' as const,
      label: card.expression,
    })),
    ...grammar.map((card) => ({
      ...card,
      category: 'grammar' as const,
      label: card.title,
    })),
  ].filter(
    (card) =>
      !filters.level ||
      card.classifications.some(
        (item) => item.scheme === 'jlpt' && item.level === filters.level,
      ),
  );
  const stats = (
    await Promise.all(
      cards.map((card) =>
        ctx.db
          .query('studyStats')
          .withIndex('by_ownerId_and_cardId', (q) =>
            q.eq('ownerId', ownerId!).eq('cardId', card._id),
          )
          .unique(),
      ),
    )
  ).filter((stat) => stat !== null);
  for (const stat of stats) budget.consume(stat);
  const byId = new Map(stats.map((stat) => [stat.cardId, stat]));
  const weak = cards
    .flatMap((card) => {
      const stat = byId.get(card._id);
      if (!stat) return [];
      const attempts = stat.correct + stat.partial + stat.incorrect;
      if (!attempts) return [];
      return [
        {
          id: card._id,
          category: card.category,
          label: card.label.slice(0, 200),
          levels: card.classifications
            .filter((item) => item.scheme === 'jlpt')
            .map((item) => item.level),
          attempts,
          correct: stat.correct,
          partial: stat.partial,
          incorrect: stat.incorrect,
          weightedAccuracy: (stat.correct + stat.partial * 0.5) / attempts,
          lastReviewedAt: stat.lastReviewedAt,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.weightedAccuracy - b.weightedAccuracy ||
        b.attempts - a.attempts ||
        a.id.localeCompare(b.id),
    );
  return {
    filters,
    basis: 'lifetime_statistics_for_current_library',
    overview: aggregateStudyProgress(cards, stats, filters),
    byCategory: categories.filter(selected).map((category) => ({
      category,
      overview: aggregateStudyProgress(cards, stats, {
        ...filters,
        category,
      }),
    })),
    byLevel: levels
      .filter((level) => !filters.level || level === filters.level)
      .map((level) => ({
        level,
        overview: aggregateStudyProgress(cards, stats, { ...filters, level }),
      })),
    weakCards: weak.slice(0, filters.weakLimit),
    hasMoreWeakCards: weak.length > filters.weakLimit,
    truncated: false,
    limits: {
      scannedCards: MAX_CARDS,
      maxReadBytes: LIBRARY_READ_BYTES,
      weakCards: filters.weakLimit,
    },
  };
}

export function presentShikenPaper(paper: Doc<'jlptPapers'>) {
  return {
    id: paper._id,
    title: paper.title,
    level: paper.level,
    ...(paper.description !== undefined
      ? { description: paper.description }
      : {}),
    ...(paper.source !== undefined ? { source: paper.source } : {}),
    archived: paper.archived,
    contentVersion: paper.contentVersion,
    questionCount: paper.questions.length,
    bySkill: JLPT_SKILLS.map((skill) => ({
      skill,
      questionCount: paper.questions.filter(
        (question) => question.skill === skill,
      ).length,
    })),
    createdAt: paper.createdAt,
    updatedAt: paper.updatedAt,
  };
}

export function presentShikenAttempt(attempt: Doc<'jlptAttempts'>) {
  const summary = summarizeAttempt(attempt);
  return {
    id: attempt._id,
    paperId: attempt.paperId,
    title: attempt.snapshot.title,
    level: attempt.snapshot.level,
    status: attempt.status,
    startedAt: attempt.startedAt,
    ...(attempt.completedAt !== undefined
      ? { completedAt: attempt.completedAt }
      : {}),
    result: summary
      ? {
          total: summary.total,
          answered: summary.answered,
          correct: summary.correct,
          incorrect: summary.incorrect,
          unanswered: summary.unanswered,
          percentage: summary.percentage,
          bySkill: summary.bySkill,
        }
      : null,
  };
}
