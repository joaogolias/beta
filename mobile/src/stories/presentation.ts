import type {
  StoryProgress,
  StoryRecord,
  StorySegment,
} from '../../../shared/stories';

export type StoryFilters = {
  level?: StoryRecord['level'];
  status: 'all' | 'new' | 'completed';
};

export function readingMinutes(characterCount: number) {
  return Math.max(1, Math.ceil(characterCount / 180));
}

export function nextQuestionIndex(
  story: StoryRecord,
  progress: StoryProgress | null,
) {
  const answered = new Set(
    progress?.answers.map((answer) => answer.questionId),
  );
  const index = story.questions.findIndex(
    (question) => !answered.has(question.id),
  );
  return index < 0 ? story.questions.length - 1 : index;
}

// CJK can wrap between characters. Keep punctuation with its neighbor so that
// closing marks never start a line, and opening marks never finish one.
export function rubyTokens(segments: StorySegment[]): StorySegment[] {
  const tokens: StorySegment[] = [];
  const closing = /^[、。，．！？!?：:；;）)」』】〉》〕］…ー]/u;
  const opening = /[（(「『【〈《〔［]$/u;
  for (const segment of segments) {
    const parts = segment.reading ? [segment.text] : Array.from(segment.text);
    for (const text of parts) {
      const previous = tokens.at(-1);
      if (!segment.reading && previous && closing.test(text)) {
        previous.text += text;
      } else if (previous && !previous.reading && opening.test(previous.text)) {
        previous.text += text;
        previous.reading = segment.reading;
      } else {
        tokens.push({
          text,
          ...(segment.reading ? { reading: segment.reading } : {}),
        });
      }
    }
  }
  return tokens;
}
