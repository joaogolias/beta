import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Pressable,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  storyScore,
  type StoryParagraph,
  type StoryProgress,
  type StoryRecord,
} from '../../../shared/stories';
import { Action, Loading, Notice } from '../alphabet/ui';
import { errorMessage } from '../alphabet/form';
import { palette } from '../theme';
import { useStory, useStoryPreferences } from './hooks';
import { nextQuestionIndex, rubyTokens } from './presentation';

type Phase = 'read' | 'quiz' | 'result';
type StoryState = ReturnType<typeof useStory>;
type StoryQuest = {
  id: string;
  title: string;
  onCompleted: () => void;
  counting?: boolean;
};

export function StoryReader({
  storyId,
  onExit,
  quest,
}: {
  storyId: string;
  onExit: () => void;
  quest?: StoryQuest;
}) {
  const state = useStory(storyId, quest?.id);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (state.story) return false;
        onExit();
        return true;
      },
    );
    return () => subscription.remove();
  }, [state.story, onExit]);
  if (state.loading || state.story === undefined)
    return (
      <View style={styles.loading}>
        <Action
          secondary
          label={quest ? '‹ Quests' : '‹ Histórias'}
          onPress={onExit}
        />
        <Loading label="Abrindo a história…" />
      </View>
    );
  if (!state.story)
    return (
      <View style={styles.loading}>
        <Action
          secondary
          label={quest ? '‹ Quests' : '‹ Histórias'}
          onPress={onExit}
        />
        <Notice error>
          {state.error ?? 'Esta história não está disponível neste aparelho.'}
        </Notice>
        <Action label="Tentar novamente" onPress={state.retry} />
      </View>
    );
  return (
    <ReaderContent
      key={`${storyId}:${quest?.id ?? ''}:${state.story.contentVersion ?? 1}`}
      state={state}
      story={state.story}
      onExit={onExit}
      quest={quest}
    />
  );
}

function ReaderContent({
  state,
  story,
  onExit,
  quest,
}: {
  state: StoryState;
  story: StoryRecord;
  onExit: () => void;
  quest?: StoryQuest;
}) {
  const preferences = useStoryPreferences();
  const [phase, setPhase] = useState<Phase>(
    state.progress?.completedAt === undefined && state.progress?.answers.length
      ? 'quiz'
      : 'read',
  );
  const [questionIndex, setQuestionIndex] = useState(() =>
    nextQuestionIndex(story, state.progress),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [consulting, setConsulting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkpointFailed, setCheckpointFailed] = useState(false);
  const [translations, setTranslations] = useState<Set<string>>(new Set());
  const scroll = useRef<ScrollView>(null);
  const inFlight = useRef(false);
  const exitPending = useRef(false);
  const pendingFeedback = useRef<string | null>(null);
  const quizY = useRef(0);
  const lastParagraph = useRef(
    state.progress?.completedAt !== undefined
      ? 0
      : (state.progress?.paragraphIndex ?? 0),
  );
  const savedParagraph = useRef(
    state.progress ? state.progress.paragraphIndex : -1,
  );
  const paragraphY = useRef(new Map<number, number>());
  const bodyY = useRef(0);
  const bodyMeasured = useRef(false);
  const restored = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveParagraph = useRef(state.saveParagraph);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    saveParagraph.current = state.saveParagraph;
  }, [state.saveParagraph]);
  const score = storyScore(story, state.progress);
  const completed = state.progress?.completedAt !== undefined;
  const hasFurigana = story.paragraphs.some((paragraph) =>
    paragraph.segments.some((segment) => Boolean(segment.reading)),
  );
  const fontSize = 20;
  const question = story.questions[questionIndex];
  const answer = state.progress?.answers.find(
    (item) => item.questionId === question?.id,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (savedParagraph.current !== lastParagraph.current)
        void saveParagraph.current(lastParagraph.current).catch(() => {});
    };
  }, []);

  const checkpoint = useCallback(async () => {
    if (savedParagraph.current === lastParagraph.current || completed)
      return true;
    const index = lastParagraph.current;
    try {
      await saveParagraph.current(index);
      savedParagraph.current = index;
      if (mounted.current) setCheckpointFailed(false);
      return true;
    } catch (cause) {
      if (mounted.current) {
        setError(errorMessage(cause));
        setCheckpointFailed(true);
      }
      return false;
    }
  }, [completed]);
  const requestExit = useCallback(async () => {
    if (exitPending.current || inFlight.current) return;
    exitPending.current = true;
    setExiting(true);
    if (timer.current) clearTimeout(timer.current);
    try {
      if (await checkpoint()) onExit();
    } finally {
      exitPending.current = false;
      if (mounted.current) setExiting(false);
    }
  }, [checkpoint, onExit]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        void requestExit();
        return true;
      },
    );
    return () => subscription.remove();
  }, [requestExit]);
  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (phase !== 'read' || consulting || !restored.current) return;
    const y = Math.max(
      0,
      event.nativeEvent.contentOffset.y + 64 - bodyY.current,
    );
    let index = 0;
    for (const [candidate, top] of paragraphY.current)
      if (top <= y) index = Math.max(index, candidate);
    if (lastParagraph.current === index) return;
    lastParagraph.current = index;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void checkpoint(), 500);
  }
  function restorePosition() {
    if (restored.current || !bodyMeasured.current || phase !== 'read') return;
    const y = paragraphY.current.get(lastParagraph.current);
    if (y === undefined) return;
    restored.current = true;
    if (lastParagraph.current > 0)
      scroll.current?.scrollTo({ y: y + bodyY.current, animated: false });
    void checkpoint();
  }
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setCheckpointFailed(false);
    try {
      await action();
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function changePhase(next: Phase) {
    setPhase(next);
    setConsulting(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function moveQuestion(index: number) {
    setQuestionIndex(index);
    setSelected(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function showReading() {
    restored.current = true;
    changePhase('read');
  }
  function toggleTranslation(id: string) {
    setTranslations((before) => {
      const next = new Set(before);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const reading = phase === 'read' || consulting;

  return (
    <View style={styles.reader}>
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            quest ? 'Voltar para Quests' : 'Voltar para Histórias'
          }
          accessibilityState={{ disabled: exiting || busy, busy: exiting }}
          disabled={exiting || busy}
          onPress={() => void requestExit()}
          style={styles.back}
        >
          <Text style={styles.backText}>
            {quest ? '‹ Quests' : '‹ Histórias'}
          </Text>
        </Pressable>
        {reading && (
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Habilitar furigana"
            accessibilityState={{
              checked: preferences.furigana && hasFurigana,
              disabled: !hasFurigana || busy,
            }}
            disabled={!hasFurigana || busy}
            onPress={() =>
              void run(() => preferences.setFurigana(!preferences.furigana))
            }
            style={[styles.furiganaRow, !hasFurigana && styles.disabled]}
          >
            <Text style={styles.settingLabel}>Furigana</Text>
            <View
              accessible={false}
              style={[
                styles.switchTrack,
                preferences.furigana && hasFurigana && styles.switchOn,
              ]}
            >
              <View
                style={[
                  styles.switchThumb,
                  preferences.furigana && hasFurigana && styles.switchThumbOn,
                ]}
              />
            </View>
          </Pressable>
        )}
      </View>
      <ScrollView
        ref={scroll}
        style={styles.viewport}
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={120}
        keyboardShouldPersistTaps="handled"
      >
        {quest && <Text style={styles.caption}>Quest · {quest.title}</Text>}
        {reading ? (
          <>
            <View style={styles.storyHeading}>
              <Text style={styles.eyebrow}>
                {story.level} ·{' '}
                {consulting ? 'CONSULTANDO O TEXTO' : '物語 · MONOGATARI'}
              </Text>
              <Text accessibilityRole="header" style={styles.storyTitle}>
                {story.title}
              </Text>
              {!hasFurigana && (
                <Text style={styles.caption}>
                  Esta história não inclui furigana.
                </Text>
              )}
              {!consulting &&
                state.progress &&
                !completed &&
                state.progress.paragraphIndex > 0 && (
                  <Text style={styles.caption}>Sua leitura foi retomada.</Text>
                )}
            </View>
            <View
              testID="story-paragraphs"
              style={styles.paragraphs}
              onLayout={(event) => {
                bodyY.current = event.nativeEvent.layout.y;
                bodyMeasured.current = true;
                restorePosition();
              }}
            >
              {story.paragraphs.map((paragraph, index) => (
                <View
                  key={paragraph.id}
                  testID={`story-paragraph-${paragraph.id}`}
                  onLayout={(event) => {
                    paragraphY.current.set(index, event.nativeEvent.layout.y);
                    restorePosition();
                  }}
                  style={styles.paragraph}
                >
                  <RubyParagraph
                    paragraph={paragraph}
                    furigana={preferences.furigana && hasFurigana}
                    fontSize={fontSize}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${translations.has(paragraph.id) ? 'Ocultar' : 'Ver'} tradução do parágrafo ${index + 1}`}
                    accessibilityState={{
                      expanded: translations.has(paragraph.id),
                    }}
                    onPress={() => toggleTranslation(paragraph.id)}
                    style={styles.translationButton}
                  >
                    <Text style={styles.translationLabel}>
                      {translations.has(paragraph.id)
                        ? 'Ocultar tradução'
                        : 'Ver tradução'}{' '}
                      <Text accessible={false}>
                        {translations.has(paragraph.id) ? '−' : '+'}
                      </Text>
                    </Text>
                  </Pressable>
                  {translations.has(paragraph.id) && (
                    <Text selectable style={styles.translation}>
                      {paragraph.translation?.trim() ||
                        'Esta história ainda não tem tradução para este parágrafo.'}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            <View style={styles.readingEnd}>
              <Text style={styles.endMark} accessible={false}>
                ◇
              </Text>
              <Text style={styles.caption}>Fim da história</Text>
            </View>
          </>
        ) : phase === 'result' ? (
          <Result story={story} progress={state.progress} />
        ) : question ? (
          <View
            style={styles.quiz}
            onLayout={(event) => {
              quizY.current = event.nativeEvent.layout.y;
            }}
          >
            <View style={styles.questionMeta}>
              <Text style={styles.eyebrow}>
                PERGUNTA {questionIndex + 1} DE {story.questions.length}
              </Text>
              <Text style={styles.caption}>
                {score.answered}/{score.total} respondidas
              </Text>
            </View>
            <View style={styles.progressTrack} accessible={false}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${((questionIndex + 1) / story.questions.length) * 100}%`,
                  },
                ]}
              />
            </View>
            <Text
              accessibilityRole="header"
              style={[
                styles.questionTitle,
                {
                  fontSize: Math.max(22, fontSize),
                  lineHeight: fontSize * 1.65,
                },
              ]}
            >
              {question.prompt}
            </Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Alternativas"
              style={styles.options}
            >
              {question.options.map((option, index) => {
                const checked = (answer?.optionId ?? selected) === option.id;
                const correct =
                  Boolean(answer) && option.id === question.correctOptionId;
                const wrong = Boolean(answer) && checked && !correct;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${index + 1}. ${option.text}${answer ? (correct ? ', resposta correta' : wrong ? ', sua resposta, incorreta' : '') : ''}`}
                    accessibilityState={{
                      checked,
                      disabled: Boolean(answer) || busy,
                    }}
                    disabled={Boolean(answer) || busy}
                    onPress={() => setSelected(option.id)}
                    style={[
                      styles.option,
                      checked && styles.optionSelected,
                      correct && styles.optionCorrect,
                      wrong && styles.optionWrong,
                    ]}
                  >
                    <View
                      style={[
                        styles.optionMark,
                        checked && styles.optionMarkSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionNumber,
                          checked && styles.optionNumberSelected,
                        ]}
                      >
                        {answer && correct
                          ? '✓'
                          : answer && wrong
                            ? '×'
                            : index + 1}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.optionText,
                        {
                          fontSize: Math.max(18, fontSize - 2),
                          lineHeight: fontSize * 1.6,
                        },
                      ]}
                    >
                      {option.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {answer && (
              <View
                accessibilityLiveRegion="polite"
                onLayout={(event) => {
                  if (pendingFeedback.current !== question.id) return;
                  pendingFeedback.current = null;
                  scroll.current?.scrollTo({
                    y: Math.max(
                      0,
                      quizY.current + event.nativeEvent.layout.y - 16,
                    ),
                    animated: true,
                  });
                }}
                style={[
                  styles.feedback,
                  answer.optionId !== question.correctOptionId &&
                    styles.feedbackCorrection,
                ]}
              >
                <Text style={styles.feedbackTitle}>
                  {answer.optionId === question.correctOptionId
                    ? 'Isso mesmo!'
                    : 'Vamos conferir juntos.'}
                </Text>
                {question.explanation ? (
                  <Text style={styles.feedbackText}>
                    {question.explanation}
                  </Text>
                ) : (
                  <Text style={styles.feedbackText}>
                    A resposta é:{' '}
                    {
                      question.options.find(
                        (option) => option.id === question.correctOptionId,
                      )?.text
                    }
                  </Text>
                )}
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Consultar o texto da história"
              onPress={() => {
                setConsulting(true);
                scroll.current?.scrollTo({ y: 0, animated: false });
              }}
              style={styles.consult}
            >
              <Text style={styles.consultText}>↗ Consultar o texto</Text>
            </Pressable>
            {questionIndex > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={() => moveQuestion(questionIndex - 1)}
                style={styles.previous}
              >
                <Text style={styles.backText}>‹ Pergunta anterior</Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        {(error || state.error) && (
          <View style={styles.footerError}>
            <Notice error>{error ?? state.error}</Notice>
            {checkpointFailed && (
              <Action
                secondary
                label="Tentar salvar novamente"
                busy={busy || exiting}
                onPress={() =>
                  void run(async () => {
                    await checkpoint();
                  })
                }
              />
            )}
          </View>
        )}
        {consulting ? (
          <Action
            label={`Voltar à pergunta ${questionIndex + 1}`}
            onPress={() => {
              setConsulting(false);
              scroll.current?.scrollTo({ y: 0, animated: false });
            }}
          />
        ) : phase === 'read' ? (
          <Action
            label={
              completed
                ? 'Ver meu resultado'
                : score.answered
                  ? 'Continuar perguntas'
                  : `Responder ${story.questions.length} ${story.questions.length === 1 ? 'pergunta' : 'perguntas'}`
            }
            onPress={() => {
              void checkpoint();
              changePhase(completed ? 'result' : 'quiz');
            }}
          />
        ) : phase === 'result' ? (
          <View style={styles.resultActions}>
            <View style={styles.flex}>
              <Action secondary label="Reler história" onPress={showReading} />
            </View>
            <View style={styles.flex}>
              <Action
                label={
                  quest
                    ? quest.counting === false
                      ? 'Voltar às quests'
                      : 'Continuar quest'
                    : 'Mais histórias'
                }
                busy={exiting || busy}
                onPress={() =>
                  quest ? quest.onCompleted() : void requestExit()
                }
              />
            </View>
          </View>
        ) : !answer ? (
          <Action
            label="Confirmar resposta"
            disabled={!selected}
            busy={busy}
            onPress={() =>
              void run(async () => {
                if (selected && question) {
                  pendingFeedback.current = question.id;
                  try {
                    await state.answer(question.id, selected);
                  } catch (cause) {
                    pendingFeedback.current = null;
                    throw cause;
                  }
                }
              })
            }
          />
        ) : questionIndex < story.questions.length - 1 ? (
          <Action
            label="Próxima pergunta"
            onPress={() => moveQuestion(questionIndex + 1)}
          />
        ) : (
          <Action
            label={completed ? 'Ver resultado' : 'Concluir história'}
            busy={busy}
            disabled={score.answered !== score.total}
            onPress={() =>
              void run(async () => {
                if (!completed) await state.complete();
                changePhase('result');
              })
            }
          />
        )}
      </View>
    </View>
  );
}

export function RubyParagraph({
  paragraph,
  furigana,
  fontSize,
}: {
  paragraph: StoryParagraph;
  furigana: boolean;
  fontSize: number;
}) {
  const plain = paragraph.segments.map((segment) => segment.text).join('');
  if (!furigana)
    return (
      <Text
        selectable
        style={[
          styles.plainParagraph,
          { fontSize, lineHeight: fontSize * 1.9 },
        ]}
      >
        {plain}
      </Text>
    );
  return (
    <View accessible accessibilityLabel={plain} style={styles.rubyLine}>
      {rubyTokens(paragraph.segments).map((segment, index) => (
        <View key={index} accessible={false} style={styles.rubyToken}>
          <Text
            accessible={false}
            style={[
              styles.rubyReading,
              {
                fontSize: Math.max(10, fontSize * 0.48),
                lineHeight: fontSize * 0.68,
              },
            ]}
          >
            {segment.reading ?? ' '}
          </Text>
          <Text
            selectable
            accessible={false}
            style={[styles.rubyBase, { fontSize, lineHeight: fontSize * 1.45 }]}
          >
            {segment.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Result({
  story,
  progress,
}: {
  story: StoryRecord;
  progress: StoryProgress | null;
}) {
  const score = storyScore(story, progress);
  return (
    <View style={styles.result}>
      <View style={styles.resultBadge} accessible={false}>
        <Text style={styles.resultSymbol} accessible={false}>
          読
        </Text>
      </View>
      <Text style={styles.eyebrow}>MAIS UM CAPÍTULO CONCLUÍDO</Text>
      <Text accessibilityRole="header" style={styles.resultTitle}>
        Boa leitura.
      </Text>
      <Text style={styles.resultStory}>{story.title}</Text>
      <View style={styles.score}>
        <Text style={styles.scoreNumber}>
          {score.correct}
          <Text style={styles.scoreTotal}> / {score.total}</Text>
        </Text>
        <Text style={styles.caption}>respostas corretas</Text>
      </View>
      <Text style={styles.resultBody}>
        {score.correct === score.total
          ? 'Você encontrou todas as respostas. Que tal descobrir outra história?'
          : 'Cada detalhe descoberto conta. Releia o texto e as explicações no seu ritmo.'}
      </Text>
      <View style={styles.review}>
        {story.questions.map((question, index) => {
          const answer = progress?.answers.find(
            (item) => item.questionId === question.id,
          );
          const correct = answer?.optionId === question.correctOptionId;
          return (
            <View key={question.id} style={styles.reviewItem}>
              <Text style={styles.reviewLabel}>
                {correct ? '✓ Acertou' : '↗ Para revisar'} · Pergunta{' '}
                {index + 1}
              </Text>
              <Text style={styles.reviewPrompt}>{question.prompt}</Text>
              {!correct && (
                <>
                  <Text style={styles.caption}>Sua resposta</Text>
                  <Text style={styles.reviewWrong}>
                    {question.options.find(
                      (option) => option.id === answer?.optionId,
                    )?.text ?? 'Sem resposta'}
                  </Text>
                  <Text style={styles.caption}>Resposta correta</Text>
                </>
              )}
              <Text style={styles.reviewAnswer}>
                {
                  question.options.find(
                    (option) => option.id === question.correctOptionId,
                  )?.text
                }
              </Text>
              {question.explanation && (
                <Text style={styles.feedbackText}>{question.explanation}</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  reader: { flex: 1 },
  viewport: { flex: 1 },
  loading: { padding: 20, gap: 20 },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    gap: 8,
  },
  back: { minHeight: 48, justifyContent: 'center', paddingRight: 12 },
  backText: { color: palette.primary, fontWeight: '700', fontSize: 14 },
  furiganaRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disabled: { opacity: 0.5 },
  switchTrack: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.line,
    padding: 3,
  },
  switchOn: { backgroundColor: palette.primary },
  switchThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.surface,
    alignSelf: 'flex-start',
  },
  switchThumbOn: { alignSelf: 'flex-end' },
  settingLabel: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  content: {
    padding: 22,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 24,
    width: '100%',
    maxWidth: 660,
    alignSelf: 'center',
  },
  storyHeading: { gap: 10, marginBottom: 6 },
  eyebrow: {
    color: palette.primary,
    fontSize: 10,
    lineHeight: 16,
    letterSpacing: 1.3,
    fontWeight: '800',
  },
  storyTitle: {
    color: palette.ink,
    fontSize: 30,
    lineHeight: 44,
    fontWeight: '700',
  },
  caption: { color: palette.muted, fontSize: 12, lineHeight: 19 },
  paragraphs: { gap: 30 },
  paragraph: { gap: 6 },
  plainParagraph: { color: palette.ink },
  rubyLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    rowGap: 9,
  },
  rubyToken: { alignItems: 'center', maxWidth: '100%' },
  rubyReading: {
    maxWidth: '100%',
    color: palette.muted,
    textAlign: 'center',
    paddingHorizontal: 1,
  },
  rubyBase: { color: palette.ink, textAlign: 'center', maxWidth: '100%' },
  translationButton: {
    minHeight: 48,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingRight: 18,
  },
  translationLabel: { color: palette.primary, fontSize: 12, fontWeight: '600' },
  translation: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 25,
    backgroundColor: palette.stoneSoft,
    padding: 14,
    borderRadius: 12,
  },
  readingEnd: { alignItems: 'center', gap: 7, paddingTop: 8 },
  endMark: { color: palette.stone, fontSize: 20 },
  footer: {
    backgroundColor: palette.background,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  footerError: { gap: 8, marginBottom: 12 },
  quiz: { gap: 20 },
  questionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  progressTrack: { height: 4, backgroundColor: palette.line, borderRadius: 2 },
  progressFill: {
    height: 4,
    backgroundColor: palette.primary,
    borderRadius: 2,
  },
  questionTitle: { color: palette.ink, fontWeight: '700', paddingVertical: 8 },
  options: { gap: 12 },
  option: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 17,
    padding: 16,
    backgroundColor: palette.surface,
  },
  optionSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  optionCorrect: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  optionWrong: {
    borderColor: palette.secondary,
    backgroundColor: palette.secondarySoft,
  },
  optionMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.line,
  },
  optionMarkSelected: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  optionNumber: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  optionNumberSelected: { color: palette.surface },
  optionText: { color: palette.ink, flex: 1 },
  feedback: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: palette.primarySoft,
    gap: 8,
  },
  feedbackCorrection: { backgroundColor: palette.tertiarySoft },
  feedbackTitle: { color: palette.ink, fontSize: 17, fontWeight: '700' },
  feedbackText: { color: palette.muted, fontSize: 15, lineHeight: 24 },
  consult: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 13,
  },
  consultText: { color: palette.primary, fontSize: 14, fontWeight: '700' },
  previous: {
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  result: { alignItems: 'center', gap: 14 },
  resultBadge: {
    backgroundColor: palette.primarySoft,
    minWidth: 90,
    minHeight: 90,
    paddingHorizontal: 24,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
  },
  resultSymbol: {
    fontSize: 42,
    lineHeight: 54,
    color: palette.primary,
    textAlign: 'center',
  },
  resultTitle: {
    color: palette.ink,
    fontSize: 34,
    lineHeight: 43,
    fontWeight: '800',
  },
  resultStory: {
    color: palette.muted,
    fontSize: 20,
    lineHeight: 29,
    textAlign: 'center',
  },
  score: {
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 20,
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: palette.surface,
  },
  scoreNumber: { color: palette.primary, fontSize: 40, fontWeight: '800' },
  scoreTotal: { color: palette.muted, fontSize: 24, fontWeight: '500' },
  resultBody: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  resultActions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  review: { gap: 16, width: '100%', marginTop: 14 },
  reviewItem: {
    gap: 9,
    borderTopWidth: 1,
    borderColor: palette.line,
    paddingTop: 18,
  },
  reviewLabel: { color: palette.primary, fontSize: 12, fontWeight: '700' },
  reviewPrompt: {
    color: palette.ink,
    fontSize: 17,
    lineHeight: 28,
    fontWeight: '600',
  },
  reviewAnswer: { color: palette.primaryDeep, fontSize: 17, lineHeight: 27 },
  reviewWrong: { color: palette.secondaryDeep, fontSize: 17, lineHeight: 27 },
});
