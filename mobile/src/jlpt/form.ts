import {
  kindsFor,
  normalizePaper,
  type JlptLevel,
  type JlptSkill,
  type PaperInput,
  type PaperPatch,
} from '../../../shared/jlpt';

export type QuestionDraft = PaperInput['questions'][number];
export type PaperDraft = PaperInput;
export function emptyPaper(): PaperDraft {
  return { title: '', level: 'N5', questions: [] };
}
export function newQuestion(
  level: JlptLevel,
  skill: JlptSkill,
  id: string,
): QuestionDraft {
  return {
    id,
    skill,
    kind: kindsFor(level, skill)[0].value,
    prompt: '',
    choices: ['', '', '', ''],
    correctChoice: 0,
    explanation: '',
  };
}
export function changeLevel(draft: PaperDraft, level: JlptLevel): PaperDraft {
  return {
    ...draft,
    level,
    questions: draft.questions.map((question) => ({
      ...question,
      kind: kindsFor(level, question.skill).some(
        (kind) => kind.value === question.kind,
      )
        ? question.kind
        : kindsFor(level, question.skill)[0].value,
    })),
  };
}
export function paperFromDraft(draft: PaperDraft): PaperInput {
  return normalizePaper(draft);
}
export function patchFromDraft(draft: PaperDraft): PaperPatch {
  return {
    ...paperFromDraft(draft),
    description: draft.description?.trim() || null,
    source: draft.source?.trim() || null,
  };
}
export function removeChoice(
  question: QuestionDraft,
  index: number,
): QuestionDraft {
  if (question.skill !== 'listening' || question.choices.length <= 3)
    return question;
  return {
    ...question,
    choices: question.choices.filter((_, position) => index !== position),
    correctChoice:
      question.correctChoice === index
        ? 0
        : question.correctChoice > index
          ? question.correctChoice - 1
          : question.correctChoice,
  };
}
export function moveQuestion(
  draft: PaperDraft,
  id: string,
  direction: -1 | 1,
): PaperDraft {
  const current = draft.questions.findIndex((question) => question.id === id);
  if (current < 0) return draft;
  const area = draft.questions
    .map((question, index) => ({ question, index }))
    .filter(
      ({ question }) => question.skill === draft.questions[current].skill,
    );
  const position = area.findIndex(({ index }) => index === current);
  const target = area[position + direction]?.index;
  if (target === undefined) return draft;
  const questions = [...draft.questions];
  [questions[current], questions[target]] = [
    questions[target],
    questions[current],
  ];
  return { ...draft, questions };
}
export function clockText(deadline: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
