import { ConvexError } from 'convex/values';

export type JlptLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5';
export type JlptSkill = 'vocabulary' | 'grammar' | 'reading' | 'listening';
export type JlptQuestion = {
  id: string;
  skill: JlptSkill;
  kind: string;
  prompt: string;
  passage?: string;
  choices: string[];
  correctChoice: number;
  explanation: string;
  audioUrl?: string;
  imageUrl?: string;
};
export type PaperInput = {
  title: string;
  level: JlptLevel;
  description?: string;
  source?: string;
  questions: JlptQuestion[];
};
export type PaperPatch = {
  title?: string;
  level?: JlptLevel;
  description?: string | null;
  source?: string | null;
  questions?: JlptQuestion[];
};
export type PaperSnapshot = PaperInput & { contentVersion: number };
export type JlptAnswer = {
  questionId: string;
  choice: number | null;
  flagged: boolean;
};
export type AttemptState = {
  snapshot: PaperSnapshot;
  status: 'active' | 'completed';
  blockIndex: number;
  startedAt: number;
  blockStartedAt: number;
  blockDeadlineAt: number;
  lastActionAt: number;
  completedAt?: number;
  revision: number;
  answers: JlptAnswer[];
};
export type JlptBlock = {
  id: string;
  title: string;
  skills: JlptSkill[];
  minutes: number;
};
export const JLPT_LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];
export const JLPT_SKILLS: JlptSkill[] = [
  'vocabulary',
  'grammar',
  'reading',
  'listening',
];
export const SKILL_LABELS: Record<JlptSkill, string> = {
  vocabulary: '語彙 · Vocabulário',
  grammar: '文法 · Gramática',
  reading: '読解 · Leitura',
  listening: '聴解 · Escuta',
};
// Official section timings and item eligibility, verified September 2026:
// https://www.jlpt.jp/e/guideline/testsections.html
export const JLPT_STRUCTURE_SOURCE =
  'https://www.jlpt.jp/e/guideline/testsections.html';
export const QUESTION_KINDS: {
  value: string;
  label: string;
  skill: JlptSkill;
  levels: JlptLevel[];
}[] = [
  {
    value: 'kanji_reading',
    label: 'Leitura de kanji',
    skill: 'vocabulary',
    levels: JLPT_LEVELS,
  },
  {
    value: 'orthography',
    label: 'Ortografia',
    skill: 'vocabulary',
    levels: ['N5', 'N4', 'N3', 'N2'],
  },
  {
    value: 'word_formation',
    label: 'Formação de palavras',
    skill: 'vocabulary',
    levels: ['N2'],
  },
  {
    value: 'context',
    label: 'Expressões em contexto',
    skill: 'vocabulary',
    levels: JLPT_LEVELS,
  },
  {
    value: 'paraphrase',
    label: 'Paráfrases',
    skill: 'vocabulary',
    levels: JLPT_LEVELS,
  },
  {
    value: 'usage',
    label: 'Uso da palavra',
    skill: 'vocabulary',
    levels: ['N4', 'N3', 'N2', 'N1'],
  },
  {
    value: 'grammar_form',
    label: 'Escolher a forma gramatical',
    skill: 'grammar',
    levels: JLPT_LEVELS,
  },
  {
    value: 'sentence_composition',
    label: 'Montar a frase',
    skill: 'grammar',
    levels: JLPT_LEVELS,
  },
  {
    value: 'text_grammar',
    label: 'Gramática no texto',
    skill: 'grammar',
    levels: JLPT_LEVELS,
  },
  {
    value: 'short_passage',
    label: 'Texto curto',
    skill: 'reading',
    levels: JLPT_LEVELS,
  },
  {
    value: 'medium_passage',
    label: 'Texto médio',
    skill: 'reading',
    levels: JLPT_LEVELS,
  },
  {
    value: 'long_passage',
    label: 'Texto longo',
    skill: 'reading',
    levels: ['N3', 'N1'],
  },
  {
    value: 'integrated_reading',
    label: 'Leitura integrada',
    skill: 'reading',
    levels: ['N2', 'N1'],
  },
  {
    value: 'thematic_reading',
    label: 'Compreensão temática',
    skill: 'reading',
    levels: ['N2', 'N1'],
  },
  {
    value: 'information_retrieval',
    label: 'Encontrar informações',
    skill: 'reading',
    levels: JLPT_LEVELS,
  },
  {
    value: 'task_comprehension',
    label: 'Compreensão de tarefas',
    skill: 'listening',
    levels: JLPT_LEVELS,
  },
  {
    value: 'key_points',
    label: 'Pontos principais',
    skill: 'listening',
    levels: JLPT_LEVELS,
  },
  {
    value: 'general_outline',
    label: 'Ideia geral',
    skill: 'listening',
    levels: ['N3', 'N2', 'N1'],
  },
  {
    value: 'verbal_expressions',
    label: 'Expressões verbais',
    skill: 'listening',
    levels: ['N5', 'N4', 'N3'],
  },
  {
    value: 'quick_response',
    label: 'Resposta rápida',
    skill: 'listening',
    levels: JLPT_LEVELS,
  },
  {
    value: 'integrated_listening',
    label: 'Escuta integrada',
    skill: 'listening',
    levels: ['N2', 'N1'],
  },
];
export function kindsFor(level: JlptLevel, skill: JlptSkill) {
  return QUESTION_KINDS.filter(
    (item) => item.skill === skill && item.levels.includes(level),
  ).map(({ value, label }) => ({ value, label }));
}
export function blocksForLevel(level: JlptLevel): JlptBlock[] {
  if (level === 'N1' || level === 'N2')
    return [
      {
        id: 'knowledge_reading',
        title: '言語知識・読解',
        skills: ['vocabulary', 'grammar', 'reading'],
        minutes: level === 'N1' ? 110 : 105,
      },
      {
        id: 'listening',
        title: '聴解',
        skills: ['listening'],
        minutes: level === 'N1' ? 55 : 50,
      },
    ];
  const times = { N3: [30, 70, 40], N4: [25, 55, 35], N5: [20, 40, 30] }[level];
  if (!times) jlptFail('VALIDATION', 'Nível JLPT inválido.');
  return [
    {
      id: 'vocabulary',
      title: '文字・語彙',
      skills: ['vocabulary'],
      minutes: times[0],
    },
    {
      id: 'grammar_reading',
      title: '文法・読解',
      skills: ['grammar', 'reading'],
      minutes: times[1],
    },
    {
      id: 'listening',
      title: '聴解',
      skills: ['listening'],
      minutes: times[2],
    },
  ];
}
export function jlptFail(
  code: 'VALIDATION' | 'CONFLICT' | 'TIME_EXPIRED' | 'UNAVAILABLE',
  message: string,
): never {
  throw new ConvexError({ code, message });
}
function text(value: string, label: string, max: number) {
  const result = value.trim().normalize('NFC');
  if (!result || result.length > max)
    jlptFail('VALIDATION', `${label}: preencha entre 1 e ${max} caracteres.`);
  return result;
}
function mediaUrl(value: string | undefined, label: string) {
  if (!value?.trim()) return undefined;
  const url = text(value, label, 2000);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
      throw new Error();
  } catch {
    jlptFail('VALIDATION', `${label}: use uma URL HTTPS válida.`);
  }
  return url;
}
export function utf8Length(value: string) {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}
export function normalizePaper(input: PaperInput): PaperInput {
  if (!JLPT_LEVELS.includes(input.level))
    jlptFail('VALIDATION', 'Nível JLPT deve ser N1 a N5.');
  if (input.questions.length > 200)
    jlptFail('VALIDATION', 'Um simulado pode ter no máximo 200 questões.');
  const ids = new Set<string>();
  const questions = input.questions.map((question) => {
    const id = text(question.id, 'Identificador da questão', 100);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || ids.has(id))
      jlptFail('VALIDATION', 'Cada questão precisa de um identificador único.');
    ids.add(id);
    if (
      !JLPT_SKILLS.includes(question.skill) ||
      !kindsFor(input.level, question.skill).some(
        (kind) => kind.value === question.kind,
      )
    )
      jlptFail(
        'VALIDATION',
        'Tipo de questão incompatível com a habilidade ou o nível JLPT.',
      );
    if (question.choices.length !== 3 && question.choices.length !== 4)
      jlptFail('VALIDATION', 'Cada questão precisa de 3 ou 4 alternativas.');
    if (question.skill !== 'listening' && question.choices.length !== 4)
      jlptFail(
        'VALIDATION',
        'Questões de vocabulário, gramática e leitura precisam de 4 alternativas.',
      );
    const choices = question.choices.map((choice) =>
      text(choice, 'Alternativa', 2000),
    );
    if (new Set(choices).size !== choices.length)
      jlptFail(
        'VALIDATION',
        'As alternativas da questão devem ser diferentes.',
      );
    if (
      !Number.isInteger(question.correctChoice) ||
      question.correctChoice < 0 ||
      question.correctChoice >= choices.length
    )
      jlptFail('VALIDATION', 'Selecione uma alternativa correta da questão.');
    const audioUrl = mediaUrl(question.audioUrl, 'Áudio');
    const imageUrl = mediaUrl(question.imageUrl, 'Imagem');
    return {
      id,
      skill: question.skill,
      kind: question.kind,
      prompt: text(question.prompt, 'Enunciado', 12000),
      choices,
      correctChoice: question.correctChoice,
      explanation: text(question.explanation, 'Explicação', 12000),
      ...(question.passage?.trim()
        ? { passage: text(question.passage, 'Texto de apoio', 16000) }
        : {}),
      ...(audioUrl ? { audioUrl } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    };
  });
  const paper: PaperInput = {
    title: text(input.title, 'Título', 300),
    level: input.level,
    questions,
    ...(input.description?.trim()
      ? { description: text(input.description, 'Descrição', 4000) }
      : {}),
    ...(input.source?.trim()
      ? { source: text(input.source, 'Fonte', 2000) }
      : {}),
  };
  if (utf8Length(JSON.stringify(paper)) > 400_000)
    jlptFail(
      'VALIDATION',
      'O conteúdo do simulado é muito grande. Reduza os textos ou o número de questões.',
    );
  return paper;
}
export function applyPaperPatch(
  current: PaperInput,
  patch: PaperPatch,
): PaperInput {
  return normalizePaper({
    title: patch.title ?? current.title,
    level: patch.level ?? current.level,
    questions: patch.questions ?? current.questions,
    description:
      patch.description === undefined
        ? current.description
        : (patch.description ?? undefined),
    source:
      patch.source === undefined ? current.source : (patch.source ?? undefined),
  });
}
export function validateReady(input: PaperInput): void {
  const paper = normalizePaper(input);
  for (const skill of JLPT_SKILLS)
    if (!paper.questions.some((question) => question.skill === skill))
      jlptFail(
        'VALIDATION',
        `Inclua pelo menos uma questão de ${SKILL_LABELS[skill]} antes de iniciar.`,
      );
  if (
    paper.questions.some(
      (question) => question.skill === 'listening' && !question.audioUrl,
    )
  )
    jlptFail(
      'VALIDATION',
      'Cada questão de escuta precisa de um áudio antes de iniciar.',
    );
}
function time(now: number) {
  if (!Number.isSafeInteger(now) || now < 0)
    jlptFail('VALIDATION', 'Horário inválido. Confira o relógio do aparelho.');
  return now;
}
export function startAttempt(input: PaperSnapshot, now: number): AttemptState {
  const snapshot = {
    ...normalizePaper(input),
    contentVersion: input.contentVersion,
  };
  if (
    !Number.isSafeInteger(snapshot.contentVersion) ||
    snapshot.contentVersion < 1
  )
    jlptFail('VALIDATION', 'Versão do simulado inválida.');
  validateReady(snapshot);
  time(now);
  return {
    snapshot,
    status: 'active',
    blockIndex: 0,
    startedAt: now,
    blockStartedAt: now,
    blockDeadlineAt: now + blocksForLevel(snapshot.level)[0].minutes * 60_000,
    lastActionAt: now,
    revision: 0,
    answers: snapshot.questions.map((question) => ({
      questionId: question.id,
      choice: null,
      flagged: false,
    })),
  };
}
function guardAttempt(
  state: AttemptState,
  now: number,
  expectedRevision: number,
) {
  time(now);
  if (state.status !== 'active')
    jlptFail('CONFLICT', 'Este simulado já foi encerrado.');
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision !== state.revision
  )
    jlptFail(
      'CONFLICT',
      'A tentativa mudou em outro aparelho. Abra novamente o simulado.',
    );
  if (now < state.lastActionAt)
    jlptFail(
      'VALIDATION',
      'O relógio voltou no tempo. Confira o horário do aparelho.',
    );
}
export function answerAttempt(
  state: AttemptState,
  answer: JlptAnswer,
  now: number,
  expectedRevision = state.revision,
): AttemptState {
  guardAttempt(state, now, expectedRevision);
  if (now >= state.blockDeadlineAt)
    jlptFail(
      'TIME_EXPIRED',
      'O tempo deste bloco terminou. Avance para continuar.',
    );
  const question = state.snapshot.questions.find(
    (question) => question.id === answer.questionId,
  );
  const block = blocksForLevel(state.snapshot.level)[state.blockIndex];
  if (!question || !block?.skills.includes(question.skill))
    jlptFail(
      'CONFLICT',
      'Só é possível responder ou revisar questões do bloco atual.',
    );
  if (
    answer.choice !== null &&
    (!Number.isInteger(answer.choice) ||
      answer.choice < 0 ||
      answer.choice >= question.choices.length)
  )
    jlptFail('VALIDATION', 'Alternativa inválida.');
  if (typeof answer.flagged !== 'boolean')
    jlptFail('VALIDATION', 'Marcação de revisão inválida.');
  return {
    ...state,
    lastActionAt: now,
    revision: state.revision + 1,
    answers: state.answers.map((previous) =>
      previous.questionId === answer.questionId
        ? {
            questionId: answer.questionId,
            choice: answer.choice,
            flagged: answer.flagged,
          }
        : previous,
    ),
  };
}
export function advanceAttempt(
  state: AttemptState,
  now: number,
  expectedRevision = state.revision,
): AttemptState {
  guardAttempt(state, now, expectedRevision);
  const blocks = blocksForLevel(state.snapshot.level);
  const next = state.blockIndex + 1;
  if (next === blocks.length)
    return finishAttempt(state, now, expectedRevision);
  return {
    ...state,
    blockIndex: next,
    blockStartedAt: now,
    blockDeadlineAt: now + blocks[next].minutes * 60_000,
    lastActionAt: now,
    revision: state.revision + 1,
  };
}
export function finishAttempt(
  state: AttemptState,
  now: number,
  expectedRevision = state.revision,
): AttemptState {
  guardAttempt(state, now, expectedRevision);
  return {
    ...state,
    status: 'completed',
    completedAt: now,
    lastActionAt: now,
    revision: state.revision + 1,
  };
}
function score(questions: JlptQuestion[], answers: JlptAnswer[]) {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  let answered = 0,
    correct = 0;
  for (const question of questions) {
    const answer = byId.get(question.id);
    if (answer?.choice !== undefined && answer.choice !== null) {
      answered++;
      if (answer.choice === question.correctChoice) correct++;
    }
  }
  return {
    total: questions.length,
    answered,
    correct,
    incorrect: answered - correct,
    unanswered: questions.length - answered,
    percentage: questions.length ? (correct / questions.length) * 100 : null,
  };
}
export function summarizeAttempt(state: AttemptState) {
  if (state.status !== 'completed') return null;
  return {
    ...score(state.snapshot.questions, state.answers),
    bySkill: JLPT_SKILLS.map((skill) => ({
      skill,
      ...score(
        state.snapshot.questions.filter((question) => question.skill === skill),
        state.answers,
      ),
    })),
    questions: state.snapshot.questions.map((question) => {
      const choice =
        state.answers.find((answer) => answer.questionId === question.id)
          ?.choice ?? null;
      return {
        questionId: question.id,
        choice,
        correctChoice: question.correctChoice,
        correct: choice === question.correctChoice,
        explanation: question.explanation,
      };
    }),
  };
}
