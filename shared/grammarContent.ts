import type { PaginationOptions } from 'convex/server';
import type { Infer } from 'convex/values';
import type { Doc } from '../backend/convex/_generated/dataModel';
import type {
  grammarContentValidator,
  grammarCreateValidator,
  grammarPatchValidator,
} from '../backend/convex/grammarValidators';
import { formatGrammarFaces } from './grammar';
import { fail, normalizedSearch } from './alphabetContent';
import { normalizeFilters, type VocabularyFilters } from './vocabularyContent';

export { normalizeFilters };
export type GrammarContent = Infer<typeof grammarContentValidator>;
export type GrammarCreateInput = Infer<typeof grammarCreateValidator>;
export type GrammarPatch = Infer<typeof grammarPatchValidator>;
export type GrammarFilters = VocabularyFilters;
export type GrammarSearch = GrammarFilters & {
  archived?: boolean;
  paginationOpts: PaginationOptions;
};
export type GrammarCard = Doc<'grammarCards'>;

function text(value: string, field: string, max: number) {
  const normalized = value.trim().normalize('NFC');
  if (!normalized || normalized.length > max)
    fail('VALIDATION', `${field}: preencha entre 1 e ${max} caracteres.`);
  return normalized;
}

function language(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/.test(normalized) ||
    normalized.length > 64
  )
    fail(
      'VALIDATION',
      'Idioma inválido. Use uma etiqueta como ja, pt-BR ou ko.',
    );
  return normalized;
}

function shortExplanation(value: string) {
  const normalized = value.trim().normalize('NFC');
  if (normalized.length > 2000)
    fail('VALIDATION', 'Explicação curta: máximo de 2000 caracteres.');
  return normalized;
}

function examples(values: GrammarContent['examples']) {
  if (values.length > 24) fail('VALIDATION', 'Informe no máximo 24 exemplos.');
  return values.map((example) => ({
    text: text(example.text, 'Exemplo', 1000),
    ...(example.reading?.trim()
      ? { reading: text(example.reading, 'Leitura do exemplo', 1000) }
      : {}),
    ...(example.meaning?.trim()
      ? { meaning: text(example.meaning, 'Significado do exemplo', 1000) }
      : {}),
  }));
}

function classifications(values: GrammarContent['classifications']) {
  if (values.length > 16) fail('VALIDATION', 'Máximo de 16 classificações.');
  const normalized = values.map(({ scheme, level }) => ({
    scheme: text(scheme, 'Classificação', 32).toLowerCase(),
    level: text(level, 'Nível', 32).toUpperCase(),
  }));
  if (
    normalized.some(
      ({ scheme, level }) => scheme === 'jlpt' && !/^N[1-5]$/.test(level),
    )
  )
    fail('VALIDATION', 'Nível JLPT deve ser N1 a N5.');
  if (!normalized.some(({ scheme }) => scheme === 'jlpt'))
    fail('VALIDATION', 'Informe ao menos um nível JLPT desta gramática.');
  return [
    ...new Map(
      normalized.map((item) => [`${item.scheme}:${item.level}`, item]),
    ).values(),
  ];
}

export function normalizeContent(input: GrammarCreateInput): GrammarContent {
  const content = {
    language: language(input.language),
    title: text(input.title, 'Título / estrutura', 300),
    explanation: text(input.explanation, 'Explicação', 8000),
    shortExplanation: shortExplanation(input.shortExplanation ?? ''),
    examples: examples(input.examples ?? []),
    sortKey: '',
    classifications: classifications(input.classifications),
  };
  return { ...content, ...formatGrammarFaces(content) };
}

export function normalizePatch(input: GrammarPatch): GrammarPatch {
  return {
    ...(input.language === undefined
      ? {}
      : { language: language(input.language) }),
    ...(input.title === undefined
      ? {}
      : { title: text(input.title, 'Título / estrutura', 300) }),
    ...(input.explanation === undefined
      ? {}
      : { explanation: text(input.explanation, 'Explicação', 8000) }),
    ...(input.shortExplanation === undefined
      ? {}
      : { shortExplanation: shortExplanation(input.shortExplanation) }),
    ...(input.examples === undefined
      ? {}
      : { examples: examples(input.examples) }),
    ...(input.classifications === undefined
      ? {}
      : { classifications: classifications(input.classifications) }),
  };
}

export function contentOf(card: GrammarContent): GrammarContent {
  return {
    language: card.language,
    title: card.title,
    explanation: card.explanation,
    ...(card.shortExplanation === undefined
      ? {}
      : { shortExplanation: card.shortExplanation }),
    examples: card.examples,
    front: card.front,
    back: card.back,
    sortKey: card.sortKey,
    classifications: card.classifications,
  };
}

/** Projection only for current cards, never for already frozen presentations. */
export function canonicalCard(card: GrammarCard): GrammarCard {
  const content = normalizeContent(card);
  const changed = card.front !== content.front || card.back !== content.back;
  return {
    ...card,
    ...content,
    contentVersion: card.contentVersion + (changed ? 1 : 0),
  };
}

export function matchesFilters(card: GrammarContent, filters: GrammarFilters) {
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
    card.title,
    card.explanation,
    card.shortExplanation ?? '',
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
