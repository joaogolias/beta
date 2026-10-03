import {
  normalizeContent,
  type ExamContent,
  type ExamCreateInput,
  type ExamPatch,
} from '../../../shared/examContent';
import { jlptLevels, type JlptLevel } from '../alphabet/form';

export type ExamDraft = {
  title: string;
  prompt: string;
  answer: string;
  explanation: string;
  alternatives: string[];
  levels: JlptLevel[];
  examReference: string;
  year: string;
  section: string;
  source: string;
};

export function emptyDraft(): ExamDraft {
  return {
    title: '',
    prompt: '',
    answer: '',
    explanation: '',
    alternatives: [],
    levels: [],
    examReference: '',
    year: '',
    section: '',
    source: '',
  };
}

export function draftFromCard(card: ExamContent): ExamDraft {
  return {
    title: card.title,
    prompt: card.prompt,
    answer: card.answer,
    explanation: card.explanation,
    alternatives: [...card.alternatives],
    levels: jlptLevels.filter((level) =>
      card.classifications.some(
        (item) => item.scheme === 'jlpt' && item.level === level,
      ),
    ),
    examReference: card.examReference ?? '',
    year: card.year?.toString() ?? '',
    section: card.section ?? '',
    source: card.source ?? '',
  };
}

export function contentFromDraft(
  draft: ExamDraft,
  original?: ExamContent,
): ExamCreateInput {
  for (const [key, label] of [
    ['title', 'o título'],
    ['prompt', 'o enunciado'],
    ['answer', 'a resposta'],
    ['explanation', 'a explicação'],
  ] as const) {
    if (!draft[key].trim()) throw new Error(`Preencha ${label} da questão.`);
  }
  if (
    !draft.levels.length ||
    draft.levels.some((level) => !jlptLevels.includes(level))
  )
    throw new Error('Selecione pelo menos um nível JLPT.');
  if (draft.alternatives.some((alternative) => !alternative.trim()))
    throw new Error('Preencha ou remova as alternativas vazias.');
  const year = draft.year.trim() ? Number(draft.year) : undefined;
  if (
    year !== undefined &&
    (!/^\d{4}$/.test(draft.year.trim()) ||
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 2100)
  )
    throw new Error('Informe um ano entre 1900 e 2100.');
  const input: ExamCreateInput = {
    language: original?.language ?? 'ja',
    title: draft.title.trim(),
    prompt: draft.prompt.trim(),
    answer: draft.answer.trim(),
    explanation: draft.explanation.trim(),
    alternatives: draft.alternatives.map((value) => value.trim()),
    sortKey: draft.title.trim(),
    classifications: [
      ...draft.levels.map((level) => ({ scheme: 'jlpt', level })),
      ...(original?.classifications.filter((item) => item.scheme !== 'jlpt') ??
        []),
    ],
    ...(draft.examReference.trim()
      ? { examReference: draft.examReference.trim() }
      : {}),
    ...(year !== undefined ? { year } : {}),
    ...(draft.section.trim() ? { section: draft.section.trim() } : {}),
    ...(draft.source.trim() ? { source: draft.source.trim() } : {}),
  };
  normalizeContent(input);
  return input;
}

export function patchFromDraft(
  draft: ExamDraft,
  original: ExamContent,
): ExamPatch {
  const initial = draftFromCard(original);
  const content = contentFromDraft(draft, original);
  let patch: ExamPatch = {};
  for (const field of [
    'title',
    'prompt',
    'answer',
    'explanation',
    'alternatives',
    'examReference',
    'year',
    'section',
    'source',
  ] as const) {
    if (JSON.stringify(draft[field]) !== JSON.stringify(initial[field]))
      patch = { ...patch, [field]: content[field] ?? null };
  }
  if (JSON.stringify(draft.levels) !== JSON.stringify(initial.levels))
    patch.classifications = content.classifications;
  return patch;
}
