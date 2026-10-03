import type { Doc } from '../../../backend/convex/_generated/dataModel';
import type { OfflineCommand } from '../../../backend/convex/offlineValidators';
import * as alphabet from '../../../shared/alphabetContent';
import * as vocabulary from '../../../shared/vocabularyContent';
import * as grammar from '../../../shared/grammarContent';
import * as exam from '../../../shared/examContent';
import { applyJlptLocal, isJlptCommand, queryJlptLocal } from './jlpt';
import {
  compareLibraryCards,
  cardOrderKey,
  libraryReadingSortKey,
} from '../../../shared/libraryOrder';
import {
  aggregateStudyProgress,
  type ProgressFilters,
} from '../../../shared/studyProgress';

export type Card =
  | Doc<'alphabetCards'>
  | Doc<'vocabularyCards'>
  | Doc<'grammarCards'>
  | Doc<'examCards'>;
export type CachedProfile = Pick<Doc<'users'>, '_id' | 'name' | 'email'>;
export type Data = {
  profile: CachedProfile;
  cards: Card[];
  sessions: Doc<'studySessions'>[];
  presentations: Doc<'studyPresentations'>[];
  stats: Doc<'studyStats'>[];
  attempts: Doc<'studyAttempts'>[];
  /** Optional so journals written before the dedicated JLPT module still load. */
  jlptPapers?: Doc<'jlptPapers'>[];
  jlptAttempts?: Doc<'jlptAttempts'>[];
};
export type Pending = {
  id: string;
  command: OfflineCommand;
  sent?: OfflineCommand;
};
export type Saved = {
  version: 1;
  accountKey: string;
  base: Data;
  queue: Pending[];
  aliases: Record<string, string>;
  lastSyncedAt: number | null;
};
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function emptyData(profile: CachedProfile): Data {
  return {
    profile,
    cards: [],
    sessions: [],
    presentations: [],
    stats: [],
    attempts: [],
  };
}
export function categoryOf(card: Card) {
  return 'symbol' in card
    ? 'alphabet'
    : 'expression' in card
      ? 'vocabulary'
      : 'prompt' in card
        ? 'exam'
        : 'grammar';
}
export function resolveId(id: string, aliases: Saved['aliases']) {
  return aliases[id] ?? id;
}
function currentCard(card: Card): Card {
  if ('symbol' in card) return alphabet.canonicalCard(card);
  if ('expression' in card) return vocabulary.canonicalCard(card);
  if ('prompt' in card) return card;
  return grammar.canonicalCard(card);
}
export function snapshotOf(card: Card): Doc<'studyPresentations'>['snapshot'] {
  card = currentCard(card);
  if ('prompt' in card)
    return {
      ...exam.contentOf(card),
      category: 'exam',
      contentVersion: card.contentVersion,
    };
  if ('symbol' in card)
    return { ...alphabet.contentOf(card), contentVersion: card.contentVersion };
  if ('expression' in card)
    return {
      ...vocabulary.contentOf(card),
      category: 'vocabulary',
      contentVersion: card.contentVersion,
    };
  return {
    ...grammar.contentOf(card),
    category: 'grammar',
    contentVersion: card.contentVersion,
  };
}
export const sorted = (cards: Card[]) =>
  cards.slice().sort(compareLibraryCards);
export function matches(
  card: Card,
  filters: alphabet.AlphabetFilters &
    vocabulary.VocabularyFilters & { category?: string; archived?: boolean },
) {
  if (card.archived !== (filters.archived ?? false)) return false;
  if (
    filters.category &&
    filters.category !== 'all' &&
    categoryOf(card) !== filters.category
  )
    return false;
  if ('symbol' in card)
    return alphabet.matchesFilters(
      alphabet.canonicalCard(card),
      alphabet.normalizeFilters(filters),
    );
  if (filters.writingSystem || filters.radical) return false;
  const normalized = vocabulary.normalizeFilters(filters);
  const reading = alphabet.normalizeFilters({
    reading: filters.reading,
  }).reading;
  if (
    reading &&
    !alphabet
      .normalizedSearch('expression' in card ? card.reading : card.sortKey)
      .includes(alphabet.normalizedSearch(reading))
  )
    return false;
  return 'expression' in card
    ? vocabulary.matchesFilters(card, normalized)
    : 'prompt' in card
      ? exam.matchesFilters(card, normalized)
      : grammar.matchesFilters(card, normalized);
}

type Content =
  | alphabet.AlphabetContent
  | vocabulary.VocabularyContent
  | grammar.GrammarContent
  | exam.ExamContent;

// Identity deliberately preserves accents and kana spelling in the expression;
// full-text search is more permissive and must never define duplicate cards.
function vocabularyIdentity(content: vocabulary.VocabularyContent) {
  return {
    expressionKey: content.expression.normalize('NFKC').toLowerCase(),
    readingKey: content.reading
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u30A1-\u30F6]/g, (char) =>
        String.fromCharCode(char.charCodeAt(0) - 0x60),
      )
      .replace(/\s+/g, ' '),
  };
}

function ensureUnique(data: Data, content: Content, currentId?: string) {
  const duplicate = data.cards.find((card) => {
    if (card._id === currentId) return false;
    if ('symbol' in content && 'symbol' in card) {
      const languageMatches =
        card.language === content.language ||
        (content.details.kind === 'kanji' &&
          card.language.split('-')[0] === 'ja');
      return (
        languageMatches &&
        card.writingSystem === content.writingSystem &&
        card.symbol === content.symbol
      );
    }
    if (
      'expression' in content &&
      'expression' in card &&
      card.language === content.language
    ) {
      const first = vocabularyIdentity(content),
        second = vocabularyIdentity(card);
      return (
        first.expressionKey === second.expressionKey &&
        first.readingKey === second.readingKey
      );
    }
    // Grammar titles are not unique: one structure can have several uses.
    return false;
  });
  if (duplicate)
    throw new Error(
      duplicate.archived
        ? 'Este item já existe nos arquivados. Restaure o card existente.'
        : 'Este item já está na sua biblioteca.',
    );
}

function suppliedFields<T extends object>(patch: T) {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
}

function contentIndexes(content: Content) {
  return {
    readingSortKey: libraryReadingSortKey(content.sortKey, content.language),
    cardOrderKey: cardOrderKey(content),
    ...('expression' in content ? vocabularyIdentity(content) : {}),
  };
}
export function projection(data: Data, id: string) {
  const session = data.sessions.find((s) => s._id === id);
  if (!session)
    throw new Error('Esta sessão ainda não está salva neste aparelho.');
  const list = data.presentations.filter((p) => p.sessionId === id);
  const previous = list
    .filter((p) => p.position < session.position && p.rating)
    .sort((a, b) => b.position - a.position)[0];
  return {
    session,
    presentation:
      session.status === 'active'
        ? (list.find((p) => p.position === session.position) ?? null)
        : null,
    undoPresentationId:
      session.status !== 'ended' ? (previous?._id ?? null) : null,
  };
}
/** Capture skip decisions when the answer is made, not when a later ACK arrives. */
export function skippedAfterAnswer(
  data: Data,
  sessionId: string,
  presentationId: string,
  aliases: Saved['aliases'] = {},
): string[] {
  const session = data.sessions.find(
    (s) => s._id === resolveId(sessionId, aliases),
  );
  const current = data.presentations.find(
    (p) =>
      p._id === resolveId(presentationId, aliases) &&
      p.sessionId === session?._id,
  );
  if (!session || !current) throw new Error('Card da sessão indisponível.');
  const skipped: string[] = [];
  for (
    let position = current.position + 1;
    position < session.total;
    position++
  ) {
    const next = data.presentations.find(
      (p) => p.sessionId === session._id && p.position === position,
    );
    if (!next)
      throw new Error('Fila de estudo incompleta. Atualize a biblioteca.');
    const card = data.cards.find((c) => c._id === next.cardId);
    if (next.presentedAt !== undefined || (card && !card.archived)) break;
    skipped.push(next._id);
  }
  return skipped;
}
function advance(
  data: Data,
  session: Doc<'studySessions'>,
  now: number,
  skippedPresentationIds?: string[],
) {
  const skips = skippedPresentationIds
    ? [...skippedPresentationIds]
    : undefined;
  while (session.position < session.total) {
    const next = data.presentations.find(
      (p) => p.sessionId === session._id && p.position === session.position,
    );
    if (!next)
      throw new Error('Fila de estudo incompleta. Atualize a biblioteca.');
    const card = data.cards.find((c) => c._id === next.cardId);
    const shouldSkip = skips ? skips[0] === next._id : !card || card.archived;
    if (next.presentedAt === undefined && shouldSkip) {
      skips?.shift();
      next.skipped = true;
      session.skipped++;
      session.position++;
      continue;
    }
    if (skips?.length)
      throw new Error(
        'A sequência de cards ignorados mudou. Abra novamente a sessão.',
      );
    next.presentedAt ??= now;
    return;
  }
  if (skips?.length)
    throw new Error(
      'A sequência de cards ignorados mudou. Abra novamente a sessão.',
    );
  session.status = 'completed';
  session.completedAt = now;
}
function changeStats(
  data: Data,
  p: Doc<'studyPresentations'>,
  rating: 'correct' | 'partial' | 'incorrect',
  amount: 1 | -1,
  now: number,
) {
  let stats = data.stats.find((s) => s.cardId === p.cardId);
  if (!stats) {
    // Local handles are never passed to Convex ID validators. The sync protocol
    // accepts explicit local: UUID references and returns server mappings.
    stats = {
      _id: `local:stats:${p.cardId}`,
      _creationTime: now,
      ownerId: data.profile._id,
      cardId: p.cardId,
      attempts: 0,
      correct: 0,
      partial: 0,
      incorrect: 0,
      lastReviewedAt: now,
    } as Doc<'studyStats'>;
    data.stats.push(stats);
  }
  stats.attempts += amount;
  stats[rating] += amount;
  if (stats.attempts <= 0) data.stats = data.stats.filter((s) => s !== stats);
  else
    stats.lastReviewedAt =
      amount === 1
        ? now
        : Math.max(
            0,
            ...data.attempts
              .filter((a) => a.cardId === p.cardId)
              .map((a) => a.reviewedAt),
          );
}
/** Deterministic local projection. It is committed to disk before the UI advances. */
export function applyLocal(
  data: Data,
  command: OfflineCommand,
  aliases: Saved['aliases'] = {},
): unknown {
  const id = (value: string) => resolveId(value, aliases);
  if (isJlptCommand(command)) return applyJlptLocal(data, command, aliases);
  if (command.type === 'card.create') {
    const content =
      command.category === 'alphabet'
        ? alphabet.normalizeContent(command.card)
        : command.category === 'vocabulary'
          ? vocabulary.normalizeContent(command.card)
          : command.category === 'grammar'
            ? grammar.normalizeContent(command.card)
            : exam.normalizeContent(command.card);
    ensureUnique(data, content);
    const card = {
      ...content,
      ...contentIndexes(content),
      _id: id(command.localId),
      ownerId: data.profile._id,
      _creationTime: command.createdAt ?? 0,
      createdAt: command.createdAt ?? 0,
      updatedAt: command.createdAt ?? 0,
      contentVersion: 1,
      archived: false,
    } as Card;
    data.cards.push(card);
    return card;
  }
  if (command.type === 'card.update' || command.type === 'card.archive') {
    const index = data.cards.findIndex((c) => c._id === id(command.id));
    const previous = data.cards[index];
    if (!previous || categoryOf(previous) !== command.category)
      throw new Error('Card indisponível neste aparelho.');
    if (command.type === 'card.archive') {
      data.cards[index] = { ...previous, archived: command.archived };
      return data.cards[index];
    }
    let content: Content;
    let previousContent: Content;
    if (command.category === 'alphabet' && 'symbol' in previous) {
      previousContent = alphabet.normalizeContent(previous);
      content = alphabet.normalizeContent({
        ...alphabet.contentOf(previous),
        ...suppliedFields(command.patch),
      });
    } else if (command.category === 'vocabulary' && 'expression' in previous) {
      previousContent = vocabulary.normalizeContent(previous);
      content = vocabulary.normalizeContent({
        ...vocabulary.contentOf(previous),
        ...suppliedFields(command.patch),
        translations: {
          ...previous.translations,
          ...suppliedFields(command.patch.translations ?? {}),
        },
      });
    } else if (command.category === 'exam' && 'prompt' in previous) {
      previousContent = exam.normalizeContent(previous);
      content = exam.applyPatch(previous, command.patch);
    } else if (
      command.category === 'grammar' &&
      'title' in previous &&
      !('prompt' in previous)
    ) {
      previousContent = grammar.normalizeContent(previous);
      content = grammar.normalizeContent({
        ...grammar.contentOf(previous),
        ...grammar.normalizePatch(command.patch),
      });
    } else throw new Error('Categoria do card inválida.');
    ensureUnique(data, content, previous._id);
    const changed = JSON.stringify(previousContent) !== JSON.stringify(content);
    const card = {
      ...previous,
      ...content,
      ...contentIndexes(content),
      contentVersion: previous.contentVersion + (changed ? 1 : 0),
    } as Card;
    if ('prompt' in card)
      for (const field of [
        'examReference',
        'year',
        'section',
        'source',
      ] as const) {
        if (!(field in content)) delete card[field];
      }
    if (
      'title' in card &&
      !('prompt' in card) &&
      !('shortExplanation' in content)
    )
      delete card.shortExplanation;
    data.cards[index] = card;
    return card;
  }
  if (command.type === 'study.start') {
    const active = data.sessions.find((s) => s.status === 'active');
    if (active)
      throw new Error(
        'Retome ou encerre a sessão atual antes de começar outra.',
      );
    const session = {
      _id: id(command.localId),
      _creationTime: command.createdAt,
      ownerId: data.profile._id,
      mode: command.mode,
      order: command.order,
      filters: command.filters,
      total: command.queue.length,
      position: 0,
      answered: 0,
      correct: 0,
      partial: 0,
      incorrect: 0,
      skipped: 0,
      revision: 0,
      status: 'active',
      createdAt: command.createdAt,
    } as Doc<'studySessions'>;
    data.sessions.push(session);
    data.presentations.push(
      ...command.queue.map(
        (q, position) =>
          ({
            _id: id(q.localId),
            _creationTime: command.createdAt,
            ownerId: data.profile._id,
            sessionId: session._id,
            cardId: id(q.cardId),
            position,
            snapshot: clone(q.snapshot),
            skipped: false,
          }) as Doc<'studyPresentations'>,
      ),
    );
    advance(data, session, command.createdAt, []);
    return session;
  }
  const session = data.sessions.find((s) => s._id === id(command.sessionId));
  if (!session) throw new Error('Sessão indisponível neste aparelho.');
  if ((command.expectedRevision ?? 0) !== (session.revision ?? 0))
    throw new Error('A sessão mudou. Abra novamente o card atual.');
  if (command.type === 'study.finish') {
    if (session.status === 'active') {
      session.status = 'ended';
      session.completedAt = command.occurredAt;
    }
    return session;
  }
  const presentation = data.presentations.find(
    (p) => p._id === id(command.presentationId) && p.sessionId === session._id,
  );
  if (!presentation) throw new Error('Card da sessão indisponível.');
  if (command.type === 'study.undo') {
    if (
      projection(data, session._id).undoPresentationId !== presentation._id ||
      !presentation.rating
    )
      throw new Error('Só é possível voltar à última resposta.');
    if (
      data.sessions.some((s) => s._id !== session._id && s.status === 'active')
    )
      throw new Error('Encerre a sessão atual antes de voltar à anterior.');
    const rating = presentation.rating;
    data.attempts = data.attempts.filter(
      (a) => a.presentationId !== presentation._id,
    );
    changeStats(data, presentation, rating, -1, command.occurredAt);
    for (const p of data.presentations.filter(
      (p) =>
        p.sessionId === session._id &&
        p.position > presentation.position &&
        p.position <= session.position,
    )) {
      if (p.skipped) session.skipped--;
      p.skipped = false;
      delete p.presentedAt;
      delete p.revealedAt;
    }
    delete presentation.rating;
    delete presentation.answeredAt;
    delete presentation.revealedAt;
    session.position = presentation.position;
    session.answered--;
    session[rating]--;
    session.revision = (session.revision ?? 0) + 1;
    session.status = 'active';
    delete session.completedAt;
    return projection(data, session._id);
  }
  if (
    session.status !== 'active' ||
    session.position !== presentation.position ||
    presentation.skipped
  )
    throw new Error('Este card não é o atual da sessão.');
  if (command.type === 'study.reveal')
    presentation.revealedAt ??= command.occurredAt;
  else {
    if (!presentation.revealedAt)
      throw new Error('Revele o verso antes de responder.');
    if (presentation.rating) throw new Error('Este card já foi respondido.');
    presentation.rating = command.rating;
    presentation.answeredAt = command.occurredAt;
    data.attempts.push({
      _id: `local:attempt:${presentation._id}:${session.revision ?? 0}`,
      _creationTime: command.occurredAt,
      ownerId: data.profile._id,
      cardId: presentation.cardId,
      sessionId: session._id,
      presentationId: presentation._id,
      snapshot: clone(presentation.snapshot),
      mode: session.mode,
      rating: command.rating,
      reviewedAt: command.occurredAt,
    } as Doc<'studyAttempts'>);
    changeStats(data, presentation, command.rating, 1, command.occurredAt);
    session.answered++;
    session[command.rating]++;
    session.position++;
    advance(
      data,
      session,
      command.occurredAt,
      command.skippedPresentationIds?.map(id),
    );
  }
  return projection(data, session._id);
}
export function project(saved: Saved): Data {
  const data = clone(saved.base);
  data.cards = data.cards.map(currentCard);
  for (const pending of saved.queue)
    applyLocal(data, pending.command, saved.aliases);
  return data;
}
export function localQuery(
  data: Data,
  name: string,
  args: Record<string, unknown>,
  aliases: Saved['aliases'],
): unknown {
  const id = (value: unknown) => resolveId(String(value), aliases);
  if (name.startsWith('jlpt:'))
    return queryJlptLocal(data, name, args, aliases);
  if (name.endsWith(':search'))
    return sorted(
      data.cards.filter((c) =>
        matches(c, {
          ...args,
          category: name.startsWith('exams:') ? 'exam' : name.split(':')[0],
        }),
      ),
    );
  if (
    ['alphabet:get', 'vocabulary:get', 'grammar:get', 'exams:get'].includes(
      name,
    )
  )
    return data.cards.find((c) => c._id === id(args.id)) ?? null;
  if (name === 'study:active')
    return data.sessions.find((s) => s.status === 'active') ?? null;
  if (name === 'study:current') return projection(data, id(args.sessionId));
  if (name === 'study:progress')
    return data.stats.find((s) => s.cardId === id(args.cardId)) ?? null;
  if (name === 'study:history')
    return data.attempts
      .filter((a) => a.cardId === id(args.cardId))
      .sort((a, b) => b.reviewedAt - a.reviewedAt);
  if (name === 'studyProgress:overview')
    return aggregateStudyProgress(
      data.cards
        .filter((c) => !('prompt' in c))
        .map((c) => ({ ...c, category: categoryOf(c) })),
      data.stats,
      args as ProgressFilters,
    );
  if (name === 'study:overview')
    return data.stats
      .filter((stat) =>
        data.cards.some(
          (card) => card._id === stat.cardId && !('prompt' in card),
        ),
      )
      .reduce(
        (t, s) => ({
          correct: t.correct + s.correct,
          partial: t.partial + s.partial,
          incorrect: t.incorrect + s.incorrect,
          attempts: t.attempts + s.attempts,
          reviewedCards: t.reviewedCards + 1,
        }),
        { correct: 0, partial: 0, incorrect: 0, attempts: 0, reviewedCards: 0 },
      );
  throw new Error(`Consulta local não disponível: ${name}`);
}
