import type { Infer } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  canonicalCard,
  canonicalizeForSnapshot,
  contentOf as alphabetContentOf,
  fail,
  matchesFilters as matchesAlphabetFilters,
  normalizeFilters,
  normalizedSearch,
  type AlphabetFilters,
} from './alphabetDomain';
import {
  contentOf as vocabularyContentOf,
  canonicalizeForSnapshot as canonicalizeVocabulary,
  canonicalCard as canonicalVocabulary,
  matchesFilters as matchesVocabularyFilters,
} from './vocabularyDomain';
import {
  contentOf as grammarContentOf,
  canonicalizeForSnapshot as canonicalizeGrammar,
  canonicalCard as canonicalGrammar,
  matchesFilters as matchesGrammarFilters,
} from './grammarDomain';
import type { studyCategoryValidator } from './studyValidators';
import { LIBRARY_READ_BYTES, ReadBudget, readWithinBudget } from './readBudget';
import { contentOf as examContentOf } from './examDomain';

export type StudyCardId =
  | Id<'alphabetCards'>
  | Id<'vocabularyCards'>
  | Id<'grammarCards'>
  | Id<'examCards'>;
type StudyCard =
  | Doc<'alphabetCards'>
  | Doc<'vocabularyCards'>
  | Doc<'grammarCards'>
  | Doc<'examCards'>;
type StudyCategory = Infer<typeof studyCategoryValidator>;
export type StudyFilters = AlphabetFilters & { category?: StudyCategory };

export function normalizeStudyFilters(args: StudyFilters): StudyFilters {
  const filters = normalizeFilters(args);
  // Older Android clients pass the alphabet-specific writing-system filter.
  // Its omission on newer clients means a combined personal study library.
  const category =
    args.category ??
    (filters.writingSystem || filters.reading || filters.radical
      ? 'alphabet'
      : 'all');
  return { ...filters, category };
}

export async function getStudyCard(
  ctx: QueryCtx | MutationCtx,
  cardId: StudyCardId,
) {
  const examId = ctx.db.normalizeId('examCards', cardId);
  if (examId) return ctx.db.get('examCards', examId);
  const grammarId = ctx.db.normalizeId('grammarCards', cardId);
  if (grammarId) return ctx.db.get('grammarCards', grammarId);
  const vocabularyId = ctx.db.normalizeId('vocabularyCards', cardId);
  if (vocabularyId) return ctx.db.get('vocabularyCards', vocabularyId);
  const alphabetId = ctx.db.normalizeId('alphabetCards', cardId);
  return alphabetId ? ctx.db.get('alphabetCards', alphabetId) : null;
}

export async function requireStudyCard(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<'users'>,
  cardId: StudyCardId,
) {
  const card = await getStudyCard(ctx, cardId);
  if (!card || card.ownerId !== ownerId)
    fail('UNAVAILABLE', 'Card indisponível.');
  return card;
}

export async function studyCandidates(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  filters: StudyFilters,
  maxCandidates: number,
): Promise<StudyCard[]> {
  if (filters.category === 'exam')
    fail(
      'VALIDATION',
      'Provas pertencem ao Shiken. Escolha kanji, vocabulário ou gramática no Benkyou.',
    );
  const budget = new ReadBudget(
    LIBRARY_READ_BYTES,
    'Os textos da biblioteca são muito longos para selecionar todos de uma vez. Escolha uma categoria menor ou arquive alguns cards.',
  );
  const alphabet =
    filters.category === 'vocabulary' || filters.category === 'grammar'
      ? []
      : await readWithinBudget(
          ctx.db
            .query('alphabetCards')
            .withIndex('by_ownerId_and_archived_and_sortKey', (q) =>
              q.eq('ownerId', ownerId).eq('archived', false),
            ),
          maxCandidates + 1,
          budget,
        );
  const vocabulary =
    filters.category === 'alphabet' ||
    filters.category === 'grammar' ||
    filters.writingSystem ||
    filters.radical
      ? []
      : await readWithinBudget(
          ctx.db
            .query('vocabularyCards')
            .withIndex('by_ownerId_and_archived_and_sortKey', (q) =>
              q.eq('ownerId', ownerId).eq('archived', false),
            ),
          maxCandidates + 1,
          budget,
        );
  const grammar =
    filters.category === 'alphabet' ||
    filters.category === 'vocabulary' ||
    filters.writingSystem ||
    filters.radical
      ? []
      : await readWithinBudget(
          ctx.db
            .query('grammarCards')
            .withIndex('by_ownerId_and_archived_and_sortKey', (q) =>
              q.eq('ownerId', ownerId).eq('archived', false),
            ),
          maxCandidates + 1,
          budget,
        );
  if (alphabet.length + vocabulary.length + grammar.length > maxCandidates)
    fail(
      'VALIDATION',
      'O estudo suporta até 1.000 cards ativos nas categorias escolhidas nesta primeira versão. Arquive cards ou escolha uma categoria para reduzir sua biblioteca de estudo.',
    );
  return [
    ...grammar.filter(
      (card) =>
        matchesGrammarFilters(canonicalGrammar(card), filters) &&
        (!filters.reading ||
          normalizedSearch(card.sortKey).includes(
            normalizedSearch(filters.reading),
          )),
    ),
    ...alphabet.filter((card) =>
      matchesAlphabetFilters(canonicalCard(card), filters),
    ),
    ...vocabulary.filter(
      (card) =>
        matchesVocabularyFilters(canonicalVocabulary(card), filters) &&
        (!filters.reading ||
          normalizedSearch(card.reading).includes(
            normalizedSearch(filters.reading),
          )),
    ),
  ];
}

export async function studySnapshot(ctx: MutationCtx, storedCard: StudyCard) {
  if ('prompt' in storedCard) {
    return {
      ...examContentOf(storedCard),
      category: 'exam' as const,
      contentVersion: storedCard.contentVersion,
    };
  }
  if ('title' in storedCard) {
    const card = await canonicalizeGrammar(ctx, storedCard);
    return {
      ...grammarContentOf(card),
      category: 'grammar' as const,
      contentVersion: card.contentVersion,
    };
  }
  if ('expression' in storedCard) {
    const card = await canonicalizeVocabulary(ctx, storedCard);
    return {
      ...vocabularyContentOf(card),
      category: 'vocabulary' as const,
      contentVersion: card.contentVersion,
    };
  }
  const card = await canonicalizeForSnapshot(ctx, storedCard);
  return { ...alphabetContentOf(card), contentVersion: card.contentVersion };
}
