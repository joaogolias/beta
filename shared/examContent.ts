import type { PaginationOptions } from 'convex/server';
import type { Infer } from 'convex/values';
import type { Doc } from '../backend/convex/_generated/dataModel';
import type {
  examContentValidator,
  examCreateValidator,
  examPatchValidator,
} from '../backend/convex/examValidators';
import { fail, normalizedSearch } from './alphabetContent';
import { normalizeFilters, type VocabularyFilters } from './vocabularyContent';

export { normalizeFilters };
export type ExamContent = Infer<typeof examContentValidator>;
export type ExamCreateInput = Infer<typeof examCreateValidator>;
export type ExamPatch = Infer<typeof examPatchValidator>;
export type ExamCard = Doc<'examCards'>;
export type ExamFilters = VocabularyFilters;
export type ExamSearch = ExamFilters & {
  archived?: boolean;
  paginationOpts: PaginationOptions;
};

export const EXAM_LIMITS = {
  title: 300,
  prompt: 12000,
  answer: 4000,
  explanation: 12000,
  alternative: 2000,
  alternatives: 10,
  sortKey: 300,
  examReference: 300,
  section: 300,
  source: 2000,
} as const;

function text(value: string, label: string, max: number) {
  const normalized = value.trim().normalize('NFC');
  if (!normalized || normalized.length > max)
    fail('VALIDATION', `${label}: preencha entre 1 e ${max} caracteres.`);
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

function year(value: number) {
  if (!Number.isInteger(value) || value < 1900 || value > 2100)
    fail('VALIDATION', 'Ano deve ser um número inteiro entre 1900 e 2100.');
  return value;
}

function alternatives(values: string[]) {
  if (values.length > EXAM_LIMITS.alternatives)
    fail('VALIDATION', `Máximo de ${EXAM_LIMITS.alternatives} alternativas.`);
  return values.map((value) =>
    text(value, 'Alternativa', EXAM_LIMITS.alternative),
  );
}

function classifications(values: ExamCreateInput['classifications']) {
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
    fail('VALIDATION', 'Informe ao menos um nível JLPT desta questão.');
  return [
    ...new Map(
      normalized.map((item) => [`${item.scheme}:${item.level}`, item]),
    ).values(),
  ];
}

/** Faces are always derived, preventing stale custom fronts or exposed answers. */
export function normalizeContent(input: ExamCreateInput): ExamContent {
  const prompt = text(input.prompt, 'Enunciado', EXAM_LIMITS.prompt);
  const answer = text(input.answer, 'Resposta', EXAM_LIMITS.answer);
  const explanation = text(
    input.explanation,
    'Explicação',
    EXAM_LIMITS.explanation,
  );
  const choices = alternatives(input.alternatives);
  return {
    language: language(input.language),
    title: text(input.title, 'Título', EXAM_LIMITS.title),
    prompt,
    answer,
    explanation,
    alternatives: choices,
    sortKey: '',
    classifications: classifications(input.classifications),
    ...(input.examReference?.trim()
      ? {
          examReference: text(
            input.examReference,
            'Referência da prova',
            EXAM_LIMITS.examReference,
          ),
        }
      : {}),
    ...(input.year === undefined ? {} : { year: year(input.year) }),
    ...(input.section?.trim()
      ? { section: text(input.section, 'Seção', EXAM_LIMITS.section) }
      : {}),
    ...(input.source?.trim()
      ? { source: text(input.source, 'Fonte', EXAM_LIMITS.source) }
      : {}),
    front: choices.length
      ? `${prompt}\n\n${choices.map((choice, index) => `${index + 1}. ${choice}`).join('\n')}`
      : prompt,
    back: `Resposta\n${answer}\n\nExplicação\n${explanation}`,
  };
}

export function normalizePatch(input: ExamPatch): ExamPatch {
  const patch: ExamPatch = {};
  if (input.language !== undefined) patch.language = language(input.language);
  if (input.title !== undefined)
    patch.title = text(input.title, 'Título', EXAM_LIMITS.title);
  if (input.prompt !== undefined)
    patch.prompt = text(input.prompt, 'Enunciado', EXAM_LIMITS.prompt);
  if (input.answer !== undefined)
    patch.answer = text(input.answer, 'Resposta', EXAM_LIMITS.answer);
  if (input.explanation !== undefined)
    patch.explanation = text(
      input.explanation,
      'Explicação',
      EXAM_LIMITS.explanation,
    );
  if (input.alternatives !== undefined)
    patch.alternatives = alternatives(input.alternatives);
  if (input.classifications !== undefined)
    patch.classifications = classifications(input.classifications);
  for (const key of ['examReference', 'section', 'source'] as const) {
    const value = input[key];
    if (value !== undefined)
      patch[key] = value?.trim() ? text(value, key, EXAM_LIMITS[key]) : null;
  }
  if (input.year !== undefined)
    patch.year = input.year === null ? null : year(input.year);
  return patch;
}

export function contentOf(card: ExamCreateInput): ExamContent {
  return normalizeContent(card);
}

export function canonicalCard(card: ExamCard): ExamCard {
  return { ...card, sortKey: '' };
}

export function applyPatch(
  current: ExamContent,
  input: ExamPatch,
): ExamContent {
  const patch = normalizePatch(input);
  const merged: ExamCreateInput = {
    language: patch.language ?? current.language,
    title: patch.title ?? current.title,
    prompt: patch.prompt ?? current.prompt,
    answer: patch.answer ?? current.answer,
    explanation: patch.explanation ?? current.explanation,
    alternatives: patch.alternatives ?? current.alternatives,
    sortKey: patch.sortKey ?? current.sortKey,
    classifications: patch.classifications ?? current.classifications,
  };
  for (const key of ['examReference', 'section', 'source'] as const) {
    const value = patch[key] === undefined ? current[key] : patch[key];
    if (value !== undefined && value !== null) merged[key] = value;
  }
  const selectedYear = patch.year === undefined ? current.year : patch.year;
  if (selectedYear !== undefined && selectedYear !== null)
    merged.year = selectedYear;
  return normalizeContent(merged);
}

export function matchesFilters(card: ExamContent, filters: ExamFilters) {
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
    card.prompt,
    card.answer,
    card.explanation,
    ...card.alternatives,
    card.sortKey,
    card.examReference ?? '',
    card.year?.toString() ?? '',
    card.section ?? '',
    card.source ?? '',
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
