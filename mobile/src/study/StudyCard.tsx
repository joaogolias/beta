import { AppModal } from '../environment/AppEnvironment';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Doc } from '../../../backend/convex/_generated/dataModel';
import { studyFaces } from './presentation';
import { errorMessage } from '../alphabet/form';
import { Notice } from '../alphabet/ui';
import { palette } from '../theme';
import {
  canAdvance,
  createStudyGestureHandlers,
  createStudyInteraction,
  createStudyTapController,
  type StudyRating,
} from './interaction';
import { useMotionPreference } from './useMotionPreference';

const ratings = [
  {
    value: 'incorrect',
    label: 'Errei',
    mark: '←',
    direction: 'esquerda',
    color: palette.error,
    background: palette.errorSoft,
  },
  {
    value: 'partial',
    label: 'Acertei parcialmente',
    mark: '2×',
    direction: 'toque duplo no verso',
    color: palette.tertiaryDeep,
    background: palette.tertiarySoft,
  },
  {
    value: 'correct',
    label: 'Acertei',
    mark: '→',
    direction: 'direita',
    color: palette.surface,
    background: palette.primary,
  },
] as const;

export interface StudyCardProps {
  presentation: Doc<'studyPresentations'>;
  onReveal: () => Promise<unknown>;
  onCommit: (rating: StudyRating) => Promise<unknown>;
  onAdvanceComplete?: () => void;
  online?: boolean;
  disabled?: boolean;
  remaining?: number;
  onBusyChange?: (busy: boolean) => void;
}

/** Remount for each presentation or restored revision to reset local progress. */
export function StudyCard(props: StudyCardProps) {
  const { presentation, remaining = 1, disabled = false } = props;
  const callbacks = useRef(props);
  const [interaction] = useState(() =>
    createStudyInteraction({
      revealed: presentation.revealedAt !== undefined,
      online: () => props.online !== false,
      blocked: () => props.disabled === true,
      reveal: props.onReveal,
      commit: props.onCommit,
      describeError: errorMessage,
    }),
  );
  useLayoutEffect(() => {
    callbacks.current = props;
    interaction.setActions({
      online: () => props.online !== false,
      blocked: () => props.disabled === true,
      reveal: props.onReveal,
      commit: props.onCommit,
    });
  }, [interaction, props]);
  const state = useSyncExternalStore(
    interaction.subscribe,
    interaction.getSnapshot,
    interaction.getSnapshot,
  );
  const [showBack, setShowBack] = useState(
    presentation.revealedAt !== undefined,
  );
  const [flipping, setFlipping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    rating: StudyRating | null;
    ready: boolean;
  }>({ rating: null, ready: false });
  const reducedMotion = useMotionPreference();
  const mounted = useRef(true);
  const moving = useRef(false);
  const [flip] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.ValueXY());
  const [enter] = useState(() => new Animated.Value(0));
  const { width, height, fontScale } = useWindowDimensions();
  const cardHeight = Math.max(
    fontScale > 1.25 ? 368 : 306,
    Math.min(340, height * 0.38),
  );
  const busy = ['revealing', 'saving', 'accepted'].includes(state.phase);
  const controlsDisabled =
    busy || flipping || disabled || dragging || detailsOpen || promptOpen;
  const canSwipe =
    showBack &&
    canAdvance(state) &&
    !flipping &&
    !disabled &&
    !detailsOpen &&
    !promptOpen;
  const current = useRef({ canSwipe, reducedMotion, showBack, disabled });
  useLayoutEffect(() => {
    current.current = { canSwipe, reducedMotion, showBack, disabled };
  }, [canSwipe, reducedMotion, showBack, disabled]);
  const {
    isKanji,
    isGrammar,
    isExam,
    front: frontValue,
    backTitle,
    sections,
    detailsSections,
  } = studyFaces(presentation.snapshot);
  const activeRating = ratings.find(
    (rating) => rating.value === feedback.rating,
  );
  const radical = sections.find((section) => section.key === 'radicals');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      flip.stopAnimation();
      drag.stopAnimation();
      enter.stopAnimation();
    };
  }, [drag, enter, flip]);
  useEffect(() => {
    if (presentation.revealedAt !== undefined) interaction.syncRevealed();
  }, [interaction, presentation.revealedAt]);
  useEffect(() => {
    callbacks.current.onBusyChange?.(
      busy || flipping || dragging || detailsOpen || promptOpen,
    );
  }, [busy, flipping, dragging, detailsOpen, promptOpen]);
  useEffect(() => {
    if (reducedMotion) enter.setValue(1);
    else
      Animated.timing(enter, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
  }, [enter, reducedMotion]);

  function animateFlip(toValue: number, duration: number) {
    return new Promise<void>((resolve) => {
      if (current.current.reducedMotion) {
        flip.setValue(toValue);
        resolve();
        return;
      }
      Animated.timing(flip, {
        toValue,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => resolve());
    });
  }
  async function turnCard(nextBack: boolean) {
    taps.cancel();
    if (moving.current || current.current.disabled) return;
    moving.current = true;
    setFlipping(true);
    if (!current.current.reducedMotion) await animateFlip(90, 120);
    if (!mounted.current) return;
    setShowBack(nextBack);
    flip.setValue(current.current.reducedMotion ? 0 : -90);
    await animateFlip(0, 150);
    if (!mounted.current) return;
    moving.current = false;
    setFlipping(false);
    if (nextBack)
      AccessibilityInfo.announceForAccessibility(
        'Resposta revelada. Direita: acertei. Esquerda: errei. Dois toques no verso: acertei parcialmente. Um toque volta à frente. Você também pode usar os botões.',
      );
  }
  async function revealOrTurn() {
    if (controlsDisabled || moving.current) return;
    if (state.phase === 'front' && !(await interaction.reveal())) return;
    await turnCard(!current.current.showBack);
  }
  const resetRef = useRef<() => void>(() => undefined);
  const tapRef = useRef<() => void>(() => undefined);
  function returnToCenter() {
    taps.cancel();
    setDragging(false);
    setFeedback({ rating: null, ready: false });
    drag.stopAnimation();
    if (current.current.reducedMotion) drag.setValue({ x: 0, y: 0 });
    else
      Animated.spring(drag, {
        toValue: { x: 0, y: 0 },
        damping: 15,
        stiffness: 190,
        mass: 0.85,
        useNativeDriver: true,
      }).start();
  }
  const advanceRef = useRef<(rating: StudyRating) => void>(() => undefined);
  // The controller stores callbacks and only reads refs on a tap or timer tick.
  // eslint-disable-next-line react-hooks/refs
  const [taps] = useState(() =>
    createStudyTapController({
      eligible: () =>
        mounted.current && current.current.canSwipe && !moving.current,
      onSingleTap: () => tapRef.current(),
      onDoubleTap: () => advanceRef.current('partial'),
    }),
  );
  useEffect(() => () => taps.cancel(), [taps]);
  useLayoutEffect(() => {
    if (!canSwipe) taps.cancel();
  }, [canSwipe, taps]);
  async function advance(rating: StudyRating) {
    taps.cancel();
    if (!current.current.canSwipe || moving.current) {
      if (!moving.current) returnToCenter();
      return;
    }
    moving.current = true;
    setDragging(false);
    setFeedback({ rating, ready: true });
    // Hold the released position while saving; an error springs this same card back.
    const accepted = await interaction.advance(rating);
    if (!mounted.current) return;
    if (!accepted) {
      moving.current = false;
      returnToCenter();
      return;
    }
    const destination =
      rating === 'partial'
        ? { x: 12, y: height + cardHeight }
        : { x: (rating === 'correct' ? 1 : -1) * (width + 100), y: 30 };
    if (!current.current.reducedMotion)
      await new Promise<void>((resolve) => {
        Animated.timing(drag, {
          toValue: destination,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => resolve());
      });
    if (mounted.current) callbacks.current.onAdvanceComplete?.();
  }
  useLayoutEffect(() => {
    resetRef.current = returnToCenter;
    tapRef.current = () => {
      void turnCard(false);
    };
    advanceRef.current = (rating) => {
      void advance(rating);
    };
  });
  const panResponder = useMemo(
    () =>
      // PanResponder stores these callbacks; refs are read only during gestures.
      PanResponder.create(
        // eslint-disable-next-line react-hooks/refs
        createStudyGestureHandlers({
          canSwipe: () => current.current.canSwipe && !moving.current,
          onStart: () => {
            taps.cancel();
            drag.stopAnimation();
            setDragging(true);
          },
          onMove: (dx, dy, rating, ready) => {
            drag.setValue(
              current.current.reducedMotion ? { x: 0, y: 0 } : { x: dx, y: dy },
            );
            setFeedback((previous) =>
              previous.rating === rating && previous.ready === ready
                ? previous
                : { rating, ready },
            );
          },
          onAdvance: (rating) => {
            advanceRef.current(rating);
          },
          onReset: () => resetRef.current(),
          onCancelTap: () => taps.cancel(),
        }),
      ),
    [drag, taps],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.stageLabel} accessibilityLiveRegion="polite">
        {state.phase === 'saving'
          ? 'GUARDANDO SUA RESPOSTA…'
          : showBack
            ? 'CONFIRA E DESLIZE'
            : isKanji
              ? 'UM KANJI, UMA NOVA LEMBRANÇA'
              : isGrammar
                ? 'UMA ESTRUTURA, NOVAS POSSIBILIDADES'
                : isExam
                  ? 'LEIA, PENSE, DESCUBRA'
                  : 'UMA PALAVRA, NOVAS POSSIBILIDADES'}
      </Text>
      <View style={[styles.deck, { height: cardHeight + 14 }]}>
        {remaining > 1 && (
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            style={[styles.paper, styles.thirdPaper]}
          />
        )}
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          style={[styles.paper, styles.secondPaper]}
        />
        <Animated.View
          style={[
            styles.paper,
            styles.activePaper,
            activeRating && {
              borderColor:
                activeRating.value === 'correct'
                  ? palette.primary
                  : activeRating.color,
              borderWidth: 2,
            },
            {
              height: cardHeight,
              opacity: enter,
              transform: [
                { perspective: 1200 },
                { translateX: drag.x },
                {
                  translateY: Animated.add(
                    drag.y,
                    enter.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  ),
                },
                {
                  rotate: reducedMotion
                    ? '0deg'
                    : Animated.add(
                        drag.x,
                        Animated.multiply(drag.y, 0.12),
                      ).interpolate({
                        inputRange: [-200, 0, 200],
                        outputRange: ['-12deg', '0deg', '12deg'],
                        extrapolate: 'clamp',
                      }),
                },
                {
                  rotateY: flip.interpolate({
                    inputRange: [-90, 0, 90],
                    outputRange: ['-90deg', '0deg', '90deg'],
                  }),
                },
              ],
            },
          ]}
        >
          {showBack ? (
            <View style={styles.back}>
              <View style={styles.backTop}>
                <Text
                  selectable={false}
                  numberOfLines={1}
                  style={[styles.miniSymbol, !isKanji && styles.miniExpression]}
                >
                  {backTitle}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Virar card para ver a frente"
                  disabled={controlsDisabled}
                  onPress={() => {
                    void revealOrTurn();
                  }}
                  style={styles.flipLink}
                >
                  <Text style={styles.flipLabel}>↶ Ver frente</Text>
                </Pressable>
              </View>
              <View
                {...panResponder.panHandlers}
                style={styles.backGestureSurface}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Conteúdo do verso"
                  accessibilityHint="Um toque volta à frente. Dois toques rápidos avaliam como acerto parcial. Você também pode usar os botões de resposta."
                  disabled={controlsDisabled}
                  onPress={() => taps.tap()}
                  onTouchCancel={() => taps.cancel()}
                  style={styles.backPreview}
                >
                  {isGrammar && sections.length === 0 && (
                    <Text style={styles.meaning}>
                      Abra a explicação completa para conferir.
                    </Text>
                  )}
                  {sections
                    .filter((section) => section.key !== 'radicals')
                    .map((section) => (
                      <View key={section.key} style={styles.section}>
                        <Text selectable={false} style={styles.sectionLabel}>
                          {section.label}
                        </Text>
                        <Text
                          selectable={false}
                          numberOfLines={
                            isKanji ? (section.key === 'meanings' ? 2 : 1) : 5
                          }
                          style={[
                            styles.sectionValue,
                            isExam && styles.examText,
                            section.key === 'meanings' && styles.meaning,
                          ]}
                        >
                          {section.value}
                        </Text>
                      </View>
                    ))}
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isGrammar
                    ? 'Ver explicação completa'
                    : 'Ver resposta completa'
                }
                accessibilityHint={
                  isExam
                    ? 'Abre a questão, a resposta e toda a explicação em uma janela com rolagem, sem gestos de resposta.'
                    : isGrammar
                      ? 'Abre a explicação completa e todos os exemplos em uma janela com rolagem, sem gestos de resposta.'
                      : 'Abre todas as leituras e detalhes em uma janela com rolagem.'
                }
                disabled={controlsDisabled}
                onPress={() => {
                  taps.cancel();
                  setDetailsOpen(true);
                }}
                style={styles.detailsLink}
              >
                {radical && (
                  <Text numberOfLines={1} style={styles.radical}>
                    部首 · {radical.value}
                  </Text>
                )}
                <Text style={styles.flipLabel}>
                  {isExam
                    ? 'Resposta e explicação completas ↗'
                    : isGrammar
                      ? 'Ver explicação completa ↗'
                      : 'Ver resposta completa ↗'}
                </Text>
              </Pressable>
            </View>
          ) : isKanji ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={'Kanji ' + frontValue + '. Revelar resposta'}
              accessibilityHint="Toque duas vezes para virar o card."
              accessibilityState={{ busy, disabled: controlsDisabled }}
              disabled={controlsDisabled}
              onPress={() => {
                void revealOrTurn();
              }}
              style={styles.front}
            >
              <Text
                selectable={false}
                style={[
                  styles.symbol,
                  { fontSize: fontScale > 1.25 ? 102 : 120 },
                ]}
              >
                {frontValue}
              </Text>
              {state.phase === 'revealing' && (
                <ActivityIndicator
                  style={styles.revealing}
                  color={palette.primary}
                />
              )}
            </Pressable>
          ) : isExam ? (
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              persistentScrollbar
              contentContainerStyle={styles.examFront}
            >
              <Text selectable style={styles.examText}>
                {frontValue}
              </Text>
            </ScrollView>
          ) : (
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              persistentScrollbar
              contentContainerStyle={styles.frontScroll}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={frontValue + '. Revelar resposta'}
                accessibilityHint="Toque duas vezes para virar o card."
                accessibilityState={{ busy, disabled: controlsDisabled }}
                disabled={controlsDisabled}
                onPress={() => {
                  void revealOrTurn();
                }}
                style={[styles.front, styles.expressionFront]}
              >
                <Text
                  selectable={false}
                  style={[styles.symbol, styles.expression]}
                >
                  {frontValue}
                </Text>
                {state.phase === 'revealing' && (
                  <ActivityIndicator
                    style={styles.revealing}
                    color={palette.primary}
                  />
                )}
              </Pressable>
            </ScrollView>
          )}
          {activeRating && (
            <View
              pointerEvents="none"
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.gestureBadge,
                { backgroundColor: activeRating.background },
              ]}
            >
              <Text
                style={[styles.gestureLabel, { color: activeRating.color }]}
              >
                {activeRating.mark} {activeRating.label}
              </Text>
              <Text style={[styles.gestureHint, { color: activeRating.color }]}>
                {state.phase === 'saving'
                  ? 'Salvando…'
                  : feedback.ready
                    ? 'Solte para continuar'
                    : 'Continue arrastando'}
              </Text>
            </View>
          )}
          {state.phase === 'saving' && (
            <View style={styles.savingOverlay} pointerEvents="none">
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.savingLabel}>Salvando…</Text>
            </View>
          )}
        </Animated.View>
      </View>
      {showBack ? (
        <View style={styles.answerArea}>
          <Text style={styles.question}>Como você se saiu?</Text>
          <Text style={styles.hint}>
            Deslize para os lados. Dois toques no verso: parcial. Um toque: ver
            frente.
          </Text>
          <View
            style={styles.ratings}
            accessibilityLabel="Avaliar e passar para o próximo card"
          >
            {ratings.map((rating) => (
              <Pressable
                key={rating.value}
                accessibilityRole="button"
                accessibilityLabel={rating.label}
                accessibilityHint={
                  'Salva sua avaliação e passa para o próximo card. Gesto equivalente: ' +
                  rating.direction +
                  '.'
                }
                accessibilityState={{
                  disabled: controlsDisabled,
                  busy:
                    state.phase === 'saving' && state.rating === rating.value,
                }}
                disabled={controlsDisabled}
                onPress={() => advanceRef.current(rating.value)}
                style={[
                  styles.rating,
                  { backgroundColor: rating.background },
                  controlsDisabled && styles.disabled,
                ]}
              >
                <Text
                  style={[styles.ratingMark, { color: rating.color }]}
                  importantForAccessibility="no"
                >
                  {rating.mark}
                </Text>
                <Text style={[styles.ratingLabel, { color: rating.color }]}>
                  {rating.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.prompt}>
          <Text style={styles.question}>Você se lembra?</Text>
          <Text style={styles.hint}>
            {isKanji
              ? 'Pense nas leituras e no significado.'
              : 'Pense na resposta, no seu ritmo.'}
            {'\n'}
            {isExam
              ? 'Revele quando estiver pronto para conferir.'
              : 'Toque no card para descobrir.'}
          </Text>
          {isExam && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ler enunciado completo"
              accessibilityHint="Abre somente o enunciado e as alternativas, sem revelar a resposta."
              disabled={controlsDisabled}
              onPress={() => setPromptOpen(true)}
              style={styles.flipLink}
            >
              <Text style={styles.flipLabel}>Ler enunciado completo ↗</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Revelar resposta"
            disabled={controlsDisabled}
            onPress={() => {
              void revealOrTurn();
            }}
            style={[styles.revealButton, controlsDisabled && styles.disabled]}
          >
            <Text style={styles.revealLabel}>
              {state.phase === 'revealing' ? 'Revelando…' : '↻ Virar card'}
            </Text>
          </Pressable>
        </View>
      )}
      {state.error && <Notice error>{state.error}</Notice>}
      <AppModal
        visible={promptOpen}
        animationType={reducedMotion ? 'none' : 'fade'}
        onRequestClose={() => setPromptOpen(false)}
      >
        <SafeAreaView style={styles.detailsModal} accessibilityViewIsModal>
          <View style={styles.detailsHeader}>
            <Text accessibilityRole="header" style={styles.detailsTitle}>
              Enunciado completo
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar enunciado e voltar ao card"
              onPress={() => setPromptOpen(false)}
              style={styles.flipLink}
            >
              <Text style={styles.flipLabel}>Fechar ✕</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.detailsContent}
            showsVerticalScrollIndicator
            persistentScrollbar
          >
            <Text selectable style={styles.examText}>
              {frontValue}
            </Text>
          </ScrollView>
        </SafeAreaView>
      </AppModal>
      <AppModal
        visible={detailsOpen}
        animationType={reducedMotion ? 'none' : 'fade'}
        onRequestClose={() => setDetailsOpen(false)}
      >
        <SafeAreaView style={styles.detailsModal} accessibilityViewIsModal>
          <View style={styles.detailsHeader}>
            <Text accessibilityRole="header" style={styles.detailsTitle}>
              {isGrammar ? 'Explicação completa' : 'Resposta completa'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isGrammar
                  ? 'Fechar explicação completa e voltar ao card'
                  : 'Fechar resposta completa e voltar ao card'
              }
              onPress={() => setDetailsOpen(false)}
              style={styles.flipLink}
            >
              <Text style={styles.flipLabel}>Fechar ✕</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.detailsContent}
            showsVerticalScrollIndicator
            persistentScrollbar
          >
            <Text
              selectable
              style={[styles.miniSymbol, !isKanji && styles.expression]}
            >
              {backTitle}
            </Text>
            {(detailsSections ?? sections).map((section) => (
              <View key={section.key} style={styles.section}>
                <Text style={styles.sectionLabel}>{section.label}</Text>
                <Text
                  selectable
                  style={[
                    styles.sectionValue,
                    isExam && styles.examText,
                    section.key === 'meanings' && styles.meaning,
                  ]}
                >
                  {section.value}
                </Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, width: '100%', maxWidth: 520, alignSelf: 'center' },
  stageLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
    color: palette.muted,
  },
  deck: { marginHorizontal: 8, marginBottom: 4, zIndex: 1 },
  paper: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.line,
  },
  thirdPaper: {
    backgroundColor: palette.line,
    transform: [{ scale: 0.92 }],
    top: 12,
  },
  secondPaper: {
    backgroundColor: palette.stoneSoft,
    transform: [{ scale: 0.96 }],
    top: 8,
  },
  activePaper: {
    bottom: undefined,
    backgroundColor: palette.surface,
    elevation: 3,
    shadowColor: palette.forest,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    overflow: 'hidden',
  },
  front: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frontScroll: { flexGrow: 1 },
  expressionFront: { padding: 22 },
  expression: { fontSize: 30, lineHeight: 43 },
  examFront: { flexGrow: 1, padding: 22 },
  examText: {
    color: palette.ink,
    fontSize: 18,
    lineHeight: 29,
    textAlign: 'left',
  },
  symbol: { color: palette.ink, fontWeight: '400', textAlign: 'center' },
  revealing: { position: 'absolute', bottom: 26 },
  back: { flex: 1 },
  backGestureSurface: { flex: 1, overflow: 'hidden' },
  backTop: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  miniSymbol: { fontSize: 32, color: palette.ink },
  miniExpression: { flex: 1, fontSize: 18, lineHeight: 25, marginRight: 8 },
  flipLink: {
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipLabel: { fontSize: 12, fontWeight: '700', color: palette.primary },
  backPreview: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  detailsLink: {
    minHeight: 44,
    flexShrink: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: palette.surface,
  },
  radical: { flexShrink: 1, fontSize: 12, color: palette.muted },
  section: { gap: 3 },
  sectionLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  sectionValue: { color: palette.ink, fontSize: 23, lineHeight: 31 },
  meaning: { fontSize: 17, lineHeight: 24, fontWeight: '500' },
  gestureBadge: {
    position: 'absolute',
    top: 72,
    alignSelf: 'center',
    maxWidth: '90%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    elevation: 5,
    shadowColor: palette.forest,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  gestureLabel: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  gestureHint: { fontSize: 11, textAlign: 'center', marginTop: 3 },
  savingOverlay: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: palette.line,
  },
  savingLabel: { color: palette.muted, fontSize: 12 },
  answerArea: { gap: 10 },
  question: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: palette.ink,
  },
  ratings: { flexDirection: 'row', gap: 8 },
  rating: {
    flex: 1,
    minHeight: 84,
    borderRadius: 18,
    paddingHorizontal: 5,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  ratingMark: { fontSize: 23, fontWeight: '600', lineHeight: 27 },
  ratingLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    textAlign: 'center',
    color: palette.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  disabled: { opacity: 0.45 },
  prompt: { gap: 9, alignItems: 'center', paddingTop: 5, paddingBottom: 10 },
  revealButton: {
    minHeight: 48,
    paddingHorizontal: 22,
    paddingVertical: 13,
    backgroundColor: palette.primarySoft,
    borderRadius: 16,
    marginTop: 5,
  },
  revealLabel: { color: palette.primaryDeep, fontWeight: '700', fontSize: 14 },
  detailsModal: { flex: 1, backgroundColor: palette.surface },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  detailsTitle: {
    flex: 1,
    color: palette.ink,
    fontWeight: '700',
    fontSize: 19,
  },
  detailsContent: { padding: 24, gap: 22 },
});
