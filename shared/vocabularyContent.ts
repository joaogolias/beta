import type { PaginationOptions } from 'convex/server';
import type { Infer } from 'convex/values';
import type { Doc } from '../backend/convex/_generated/dataModel';
import type {
  vocabularyContentValidator,
  vocabularyCreateValidator,
  vocabularyPatchValidator,
} from '../backend/convex/vocabularyValidators';
import { formatVocabularyFaces, isKanaReading } from './vocabulary';
import {
  fail,
  normalizedSearch,
  normalizeFilters as normalizeAlphabetFilters,
} from './alphabetContent';

export type VocabularyContent = Infer<typeof vocabularyContentValidator>;
export type VocabularyCreateInput = Infer<typeof vocabularyCreateValidator>;
export type VocabularyPatch = Infer<typeof vocabularyPatchValidator>;
export type VocabularyFilters = {
  query?: string;
  terms?: string[];
  operator?: 'AND' | 'OR';
  language?: string;
  level?: string;
};
export type VocabularySearch = VocabularyFilters & {
  archived?: boolean;
  paginationOpts: PaginationOptions;
};
export type VocabularyCard = Doc<'vocabularyCards'>;

function text(value: string, field: string, max: number) {
  const normalized = value.trim().normalize('NFC');
  if (!normalized || normalized.length > max)
    fail('VALIDATION', `${field}: preencha entre 1 e ${max} caracteres.`);
  return normalized;
}

function translationList(values: string[]) {
  if (values.length > 32)
    fail('VALIDATION', 'Máximo de 32 traduções por idioma.');
  return [...new Set(values.map((value) => text(value, 'Tradução', 300)))];
}

export function normalizeContent(
  input: VocabularyCreateInput,
): VocabularyContent {
  const language = input.language.trim().toLowerCase();
  if (!/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/.test(language) || language.length > 64)
    fail(
      'VALIDATION',
      'Idioma inválido. Use uma etiqueta como ja, pt-BR ou ko.',
    );
  const readingOmitted = input.readingOmitted === true;
  const reading = readingOmitted
    ? ''
    : text(input.reading ?? '', 'Leitura', 300);
  if (
    !readingOmitted &&
    language.split('-')[0] === 'ja' &&
    !isKanaReading(reading)
  )
    fail('VALIDATION', 'Leitura: use hiragana ou katakana.');
  const translations = {
    ...(input.translations.pt === undefined
      ? {}
      : { pt: translationList(input.translations.pt) }),
    ...(input.translations.en === undefined
      ? {}
      : { en: translationList(input.translations.en) }),
  };
  if (!translations.pt?.length && !translations.en?.length)
    fail('VALIDATION', 'Informe ao menos uma tradução em português ou inglês.');
  if (input.classifications.length > 16)
    fail('VALIDATION', 'Máximo de 16 classificações.');
  const classifications = input.classifications.map(({ scheme, level }) => ({
    scheme: text(scheme, 'Classificação', 32).toLowerCase(),
    level: text(level, 'Nível', 32).toUpperCase(),
  }));
  if (
    new Set(classifications.map(({ scheme, level }) => `${scheme}:${level}`))
      .size !== classifications.length
  )
    fail('VALIDATION', 'Não repita o mesmo nível de uma classificação.');
  if (
    classifications.some(
      ({ scheme, level }) => scheme === 'jlpt' && !/^N[1-5]$/.test(level),
    )
  )
    fail('VALIDATION', 'Nível JLPT deve ser N1 a N5.');
  if (
    language.split('-')[0] === 'ja' &&
    !classifications.some(({ scheme }) => scheme === 'jlpt')
  )
    fail('VALIDATION', 'Informe ao menos um nível JLPT deste vocabulário.');
  if (input.examples.length > 24) fail('VALIDATION', 'Máximo de 24 exemplos.');
  const content = {
    language,
    expression: text(input.expression, 'Expressão', 300),
    reading,
    readingOmitted,
    translations,
    examples: input.examples.map((example) => ({
      text: text(example.text, 'Exemplo', 1000),
      ...(example.reading?.trim()
        ? { reading: text(example.reading, 'Leitura do exemplo', 1000) }
        : {}),
      ...(example.meaning?.trim()
        ? { meaning: text(example.meaning, 'Tradução do exemplo', 1000) }
        : {}),
    })),
    sortKey: reading,
    classifications,
  };
  return { ...content, ...formatVocabularyFaces(content) };
}

export function contentOf(card: VocabularyContent): VocabularyContent {
  return {
    language: card.language,
    expression: card.expression,
    reading: card.reading,
    ...(card.readingOmitted === undefined
      ? {}
      : { readingOmitted: card.readingOmitted }),
    translations: card.translations,
    examples: card.examples,
    front: card.front,
    back: card.back,
    sortKey: card.sortKey,
    classifications: card.classifications,
  };
}

/** Live cards use canonical faces; historical snapshots are not passed here. */
export function canonicalCard(card: VocabularyCard): VocabularyCard {
  const content = normalizeContent(card);
  const changed = card.front !== content.front || card.back !== content.back;
  return {
    ...card,
    ...content,
    contentVersion: card.contentVersion + (changed ? 1 : 0),
  };
}

export function normalizeFilters(input: VocabularyFilters): VocabularyFilters {
  const base = normalizeAlphabetFilters({
    query: input.query,
    language: input.language,
    level: input.level,
  });
  if ((input.terms?.length ?? 0) > 24)
    fail('VALIDATION', 'Use no máximo 24 termos de busca.');
  const terms = input.terms?.map((term) => text(term, 'Termo de busca', 256));
  return {
    ...base,
    ...(terms?.length ? { terms } : {}),
    ...(input.operator ? { operator: input.operator } : {}),
  };
}

export function matchesFilters(
  card: VocabularyContent,
  filters: VocabularyFilters,
) {
  if (
    filters.language &&
    card.language !== filters.language &&
    (filters.language.includes('-') ||
      !card.language.startsWith(`${filters.language}-`))
  )
    return false;
  if (
    filters.level &&
    !card.classifications.some(
      ({ scheme, level }) => scheme === 'jlpt' && level === filters.level,
    )
  )
    return false;
  const terms = [
    ...(filters.query ? normalizedSearch(filters.query).split(/\s+/) : []),
    ...(filters.terms?.map(normalizedSearch) ?? []),
  ];
  if (!terms.length) return true;
  const fields = [
    card.language,
    card.expression,
    card.reading,
    ...(card.translations.pt ?? []),
    ...(card.translations.en ?? []),
    card.front,
    card.back,
    card.sortKey,
    ...card.examples.flatMap(({ text, reading, meaning }) => [
      text,
      reading ?? '',
      meaning ?? '',
    ]),
    ...card.classifications.flatMap(({ scheme, level }) => [
      scheme,
      level,
      `${scheme}:${level}`,
    ]),
  ].map(normalizedSearch);
  const matches = (term: string) =>
    fields.some((field) => field.includes(term));
  return filters.operator === 'OR' ? terms.some(matches) : terms.every(matches);
}

export function identityFields(content: VocabularyContent) {
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
