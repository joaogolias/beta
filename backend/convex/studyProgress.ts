import { v } from 'convex/values';
import { query } from './_generated/server';
import { fail, requireOwner } from './alphabetDomain';
import { studyCategoryValidator } from './studyValidators';
import { aggregateStudyProgress } from '../../shared/studyProgress';

import { LIBRARY_READ_BYTES, ReadBudget, readWithinBudget } from './readBudget';

const MAX_CARDS = 1000;

export const overview = query({
  args: {
    category: v.optional(studyCategoryValidator),
    level: v.optional(
      v.union(
        v.literal('N1'),
        v.literal('N2'),
        v.literal('N3'),
        v.literal('N4'),
        v.literal('N5'),
      ),
    ),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, filters) => {
    const ownerId = await requireOwner(ctx);
    const category = filters.category ?? 'all';
    const archived = filters.archived ?? false;
    const budget = new ReadBudget(
      LIBRARY_READ_BYTES,
      'Os textos da biblioteca são muito longos para calcular este recorte de uma vez. Escolha uma categoria menor.',
    );
    const [alphabet, vocabulary, grammar] = await Promise.all([
      category === 'all' || category === 'alphabet'
        ? readWithinBudget(
            ctx.db
              .query('alphabetCards')
              .withIndex('by_ownerId_and_archived_and_sortKey', (q) =>
                q.eq('ownerId', ownerId).eq('archived', archived),
              ),
            MAX_CARDS + 1,
            budget,
          )
        : [],
      category === 'all' || category === 'vocabulary'
        ? readWithinBudget(
            ctx.db
              .query('vocabularyCards')
              .withIndex('by_ownerId_and_archived_and_sortKey', (q) =>
                q.eq('ownerId', ownerId).eq('archived', archived),
              ),
            MAX_CARDS + 1,
            budget,
          )
        : [],
      category === 'all' || category === 'grammar'
        ? readWithinBudget(
            ctx.db
              .query('grammarCards')
              .withIndex('by_ownerId_and_archived_and_sortKey', (q) =>
                q.eq('ownerId', ownerId).eq('archived', archived),
              ),
            MAX_CARDS + 1,
            budget,
          )
        : [],
    ]);
    if (alphabet.length + vocabulary.length + grammar.length > MAX_CARDS)
      fail(
        'VALIDATION',
        'O progresso suporta até 1.000 cards nas categorias escolhidas nesta versão. Escolha uma categoria para consultar sua biblioteca por partes.',
      );
    const cards = [
      ...alphabet.map((card) => ({ ...card, category: 'alphabet' as const })),
      ...vocabulary.map((card) => ({
        ...card,
        category: 'vocabulary' as const,
      })),
      ...grammar.map((card) => ({ ...card, category: 'grammar' as const })),
    ].filter(
      (card) =>
        !filters.level ||
        card.classifications.some(
          (item) => item.scheme === 'jlpt' && item.level === filters.level,
        ),
    );
    const stats = await Promise.all(
      cards.map((card) =>
        ctx.db
          .query('studyStats')
          .withIndex('by_ownerId_and_cardId', (q) =>
            q.eq('ownerId', ownerId).eq('cardId', card._id),
          )
          .unique(),
      ),
    );
    return aggregateStudyProgress(
      cards,
      stats.filter((stat) => stat !== null),
      filters,
    );
  },
});
