import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import {
  useConvexConnectionState,
  useMutation,
  useQuery,
  useOfflineStatus,
} from '../offline/hooks';
import type { FunctionReturnType } from 'convex/server';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import { Performance } from '../alphabet/DetailScreen';
import { StudyCard } from './StudyCard';
import { createStudyProjection, sessionProgress } from './interaction';
import {
  Action,
  Choice,
  Field,
  LevelPicker,
  Loading,
  Notice,
  ui,
  useCommand,
} from '../alphabet/ui';
import type { StudyMode, StudyPreferences } from '../navigation/navigation';
import { CategoryPicker } from '../vocabulary/CategoryPicker';
import { palette } from '../theme';
import { IbexMascot } from '../brand/IbexMascot';

export function StudySettings({
  mode,
  preferences,
  onPreferencesChange,
  onModeChange,
  onStart,
}: {
  mode: StudyMode;
  preferences: StudyPreferences;
  onPreferencesChange: (patch: Partial<StudyPreferences>) => void;
  onModeChange: (mode: StudyMode) => void;
  onStart: (sessionId: Id<'studySessions'>) => void;
}) {
  const active = useQuery(api.study.active, {});
  const start = useMutation(api.study.start);
  const finish = useMutation(api.study.finish);
  const command = useCommand();
  const [adjustCards, setAdjustCards] = useState(false);
  const { level, category, order, limit } = preferences;
  const categoryLabel =
    category === 'alphabet'
      ? '漢字 · Kanji'
      : category === 'vocabulary'
        ? 'ことば · Kotoba'
        : category === 'grammar'
          ? '文法 · Bunpou'
          : category === 'exam'
            ? '試験 · Shiken'
            : 'Kanji + Kotoba + Bunpou';
  return (
    <View style={settingsStyles.screen}>
      <View style={settingsStyles.heading}>
        <Text style={settingsStyles.eyebrow}>BENKYOU / ESTUDAR</Text>
        <Text accessibilityRole="header" style={settingsStyles.title}>
          勉強
        </Text>
        <Text style={settingsStyles.intro}>
          Um card de cada vez.{'\n'}No seu ritmo.
        </Text>
      </View>
      {active === undefined ? (
        <Loading label="Verificando sua última sessão…" />
      ) : (
        active && (
          <View style={settingsStyles.resume}>
            <Text style={ui.subtitle}>Continue de onde parou</Text>
            <Text style={ui.body}>
              {active.answered} de {sessionProgress(active).total} cards
              respondidos.
            </Text>
            <Action
              label="Retomar sessão"
              disabled={command.busy}
              onPress={() => onStart(active._id)}
            />
            <Action
              secondary
              label="Encerrar sessão atual"
              busy={command.busy}
              onPress={() => {
                void command.run(async () => {
                  await finish({ sessionId: active._id });
                  onStart(active._id);
                });
              }}
            />
          </View>
        )
      )}
      <View style={settingsStyles.contextCard}>
        <View style={settingsStyles.contextTop}>
          <Text style={settingsStyles.sectionLabel}>CARDS DESTA SESSÃO</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              adjustCards
                ? 'Fechar ajustes de categoria e nível'
                : 'Ajustar categoria e nível'
            }
            accessibilityState={{
              expanded: adjustCards,
              disabled: command.busy,
            }}
            disabled={command.busy}
            onPress={() => setAdjustCards(!adjustCards)}
            style={settingsStyles.adjustButton}
          >
            <Text style={settingsStyles.adjustText}>
              {adjustCards ? 'Pronto ✓' : 'Ajustar ↗'}
            </Text>
          </Pressable>
        </View>
        <Text style={settingsStyles.contextCategory}>{categoryLabel}</Text>
        <View style={settingsStyles.contextBottom}>
          <Text style={settingsStyles.levelBadge}>
            {level || 'Todos os níveis'}
          </Text>
          <Text style={settingsStyles.activeNote}>Somente cards ativos</Text>
        </View>
        {adjustCards && (
          <View style={settingsStyles.adjustments}>
            <CategoryPicker
              value={category}
              onChange={(next) => onPreferencesChange({ category: next })}
              disabled={command.busy}
            />
            <LevelPicker
              value={level}
              onChange={(next) => onPreferencesChange({ level: next })}
              disabled={command.busy}
            />
          </View>
        )}
      </View>
      <View style={settingsStyles.section}>
        <Text style={settingsStyles.sectionLabel}>01 / COMO PRATICAR</Text>
        <View
          style={settingsStyles.modeRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Modo de estudo"
        >
          {(
            [
              {
                value: 'direct',
                mark: '→',
                label: 'No seu ritmo',
                detail: 'Percorra os cards do seu jeito.',
              },
              {
                value: 'adaptive',
                mark: '✦',
                label: 'Revisão inteligente',
                detail: 'Foque no que precisa treinar.',
              },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityLabel={
                item.value === 'direct' ? 'Estudo direto' : 'Estudo adaptativo'
              }
              accessibilityState={{
                checked: mode === item.value,
                disabled: command.busy,
              }}
              disabled={command.busy}
              onPress={() => onModeChange(item.value)}
              style={[
                settingsStyles.mode,
                mode === item.value && settingsStyles.selectedMode,
                command.busy && ui.disabled,
              ]}
            >
              <Text
                style={[
                  settingsStyles.modeMark,
                  mode === item.value && settingsStyles.selectedModeText,
                ]}
              >
                {item.mark}
              </Text>
              <Text
                style={[
                  settingsStyles.modeTitle,
                  mode === item.value && settingsStyles.selectedModeText,
                ]}
              >
                {item.label}
              </Text>
              <Text style={settingsStyles.modeDetail}>{item.detail}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={settingsStyles.section}>
        <Text style={settingsStyles.sectionLabel}>02 / TAMANHO DA SESSÃO</Text>
        <Field
          label="Cards por sessão"
          hint="Entre 1 e 100, conforme os cards disponíveis."
          keyboardType="number-pad"
          maxLength={3}
          value={limit}
          onChangeText={(next) => onPreferencesChange({ limit: next })}
          editable={!command.busy}
        />
        {mode === 'direct' && (
          <View
            style={ui.row}
            accessibilityRole="radiogroup"
            accessibilityLabel="Ordem dos cards"
          >
            <Choice
              label={
                category === 'grammar'
                  ? 'Ordem de criação'
                  : category === 'alphabet'
                    ? 'Kun’yomi → on’yomi'
                    : category === 'vocabulary'
                      ? 'Hiragana → katakana'
                      : 'Ordem da biblioteca'
              }
              selected={order === 'sorted'}
              onPress={() => onPreferencesChange({ order: 'sorted' })}
              disabled={command.busy}
            />
            <Choice
              label="⇄ Aleatória"
              selected={order === 'random'}
              onPress={() => onPreferencesChange({ order: 'random' })}
              disabled={command.busy}
            />
          </View>
        )}
      </View>
      {command.error && <Notice error>{command.error}</Notice>}
      <Action
        label="はじめる · Começar"
        busy={command.busy}
        disabled={active === undefined || active !== null}
        onPress={() => {
          void command.run(async () => {
            const count = Number(limit);
            if (!/^\d+$/.test(limit) || count < 1 || count > 100)
              throw new Error('Escolha entre 1 e 100 cards por sessão.');
            const session = await start({
              mode,
              order,
              limit: count,
              language: 'ja',
              category,
              ...(category === 'alphabet' ? { writingSystem: 'Hani' } : {}),
              ...(level ? { level } : {}),
            });
            onStart(session._id);
          });
        }}
      />
      <Text style={settingsStyles.footnote}>
        Revele e deslize: ← errei · ↓ quase · acertei →
      </Text>
    </View>
  );
}

export function StudySession({
  sessionId,
  onSettings,
}: {
  sessionId: Id<'studySessions'>;
  onSettings: () => void;
}) {
  const projection = useQuery(api.study.current, { sessionId });
  const reveal = useMutation(api.study.reveal);
  const rate = useMutation(api.study.rate);
  const undo = useMutation(api.study.undo);
  const finish = useMutation(api.study.finish);
  const { isWebSocketConnected } = useConvexConnectionState();
  const command = useCommand();
  type Projection = FunctionReturnType<typeof api.study.current>;
  const [projectionState] = useState(() => createStudyProjection<Projection>());
  const visible = useSyncExternalStore(
    projectionState.subscribe,
    projectionState.getSnapshot,
    projectionState.getSnapshot,
  );
  const [cardBusy, setCardBusy] = useState(false);
  const storage = useOfflineStatus();
  useLayoutEffect(() => {
    projectionState.receive(projection);
  }, [projection, projectionState]);
  const shown = visible ?? projection;
  if (storage.ready && !projection)
    return (
      <View style={ui.stack}>
        <Notice>
          Esta sessão não está mais disponível neste aparelho. Seus resultados
          sincronizados continuam no progresso.
        </Notice>
        <Action label="Voltar aos estudos" onPress={onSettings} />
      </View>
    );
  if (!shown) return <Loading label="Preparando seu card…" />;
  const { session, presentation, undoPresentationId } = shown;
  const busy = cardBusy || command.busy;
  const revision = session.revision ?? 0;
  const goBack = () => {
    if (busy || !undoPresentationId) return;
    void command.run(async () => {
      if (!isWebSocketConnected)
        throw new Error(
          'Não foi possível preparar o armazenamento deste aparelho. Tente novamente.',
        );
      projectionState.beginAdvance();
      try {
        projectionState.acknowledge(
          await undo({
            sessionId,
            presentationId: undoPresentationId,
            expectedRevision: revision,
          }),
        );
        AccessibilityInfo.announceForAccessibility(
          'Resposta desfeita. O card anterior está pronto para tentar de novo.',
        );
      } finally {
        projectionState.finishAdvance();
        setCardBusy(false);
      }
    });
  };
  const backButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Voltar ao card anterior e desfazer a resposta"
      accessibilityState={{
        disabled: busy || !undoPresentationId,
        busy: command.busy,
      }}
      disabled={busy || !undoPresentationId}
      onPress={goBack}
      style={[
        studyStyles.backButton,
        (busy || !undoPresentationId) && ui.disabled,
      ]}
    >
      <Text style={studyStyles.backButtonText}>
        {command.busy ? 'Voltando…' : '↶ Voltar'}
      </Text>
    </Pressable>
  );
  if (session.status !== 'active')
    return (
      <View style={studyStyles.summary}>
        <View style={studyStyles.completionSeal}>
          <IbexMascot
            size={176}
            mood={session.status === 'completed' ? 'celebrate' : 'rest'}
          />
        </View>
        <Text style={studyStyles.summaryEyebrow}>
          {session.status === 'completed'
            ? 'MAIS UMA CONQUISTA COM A BETINHA'
            : 'UMA PAUSA COM A BETINHA'}
        </Text>
        <Text accessibilityRole="header" style={studyStyles.summaryTitle}>
          {session.status === 'completed'
            ? 'Boa prática!'
            : 'Até a próxima rodada'}
        </Text>
        <Text style={studyStyles.summaryCopy}>
          {session.answered > 0
            ? `Você revisitou ${session.answered} ${session.answered === 1 ? 'card' : 'cards'}. Cada encontro ajuda a lembrar.`
            : 'Seu lugar continua aqui para quando quiser praticar.'}
        </Text>
        <Performance
          stats={{
            correct: session.correct,
            partial: session.partial,
            incorrect: session.incorrect,
            attempts: session.answered,
          }}
        />
        {session.skipped > 0 && (
          <Text style={ui.note}>
            {session.skipped} cards arquivados foram pulados.
          </Text>
        )}
        <Text style={studyStyles.summaryCopy}>
          Acertos, dúvidas e tentativas fazem parte do caminho. Seu progresso
          está salvo neste aparelho.
        </Text>
        {undoPresentationId && backButton}
        {command.error && <Notice error>{command.error}</Notice>}
        <Action
          label="Preparar próxima sessão"
          onPress={onSettings}
          disabled={busy}
        />
      </View>
    );
  return (
    <View style={studyStyles.session}>
      <View style={studyStyles.sessionHeader}>
        <View>
          <Text style={studyStyles.eyebrow}>beta · ESTUDAR</Text>
          <Text accessibilityRole="header" style={studyStyles.sessionTitle}>
            {session.mode === 'direct' ? 'No seu ritmo' : 'Um pouco a cada vez'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pausar sessão e voltar à configuração"
          disabled={busy}
          onPress={onSettings}
          style={[studyStyles.pause, busy && { opacity: 0.4 }]}
        >
          <Text style={studyStyles.pauseText}>Pausar</Text>
        </Pressable>
      </View>
      <SessionProgress session={session} />
      <View style={studyStyles.deckToolbar}>
        {backButton}
        <Text style={studyStyles.gestureNote}>
          ← Errei · 2 toques: parcial · Acertei →
        </Text>
      </View>
      {presentation ? (
        <StudyCard
          key={`${presentation._id}:${revision}`}
          presentation={presentation}
          remaining={session.total - session.position}
          online={isWebSocketConnected}
          disabled={command.busy}
          onBusyChange={setCardBusy}
          onReveal={() =>
            reveal({
              sessionId,
              presentationId: presentation._id,
              expectedRevision: revision,
            })
          }
          onCommit={async (rating) => {
            // A subscription can deliver the next card before the mutation promise
            // resolves. Keep this presentation visible until acknowledgment + exit.
            projectionState.beginAdvance();
            try {
              projectionState.acknowledge(
                await rate({
                  sessionId,
                  presentationId: presentation._id,
                  rating,
                  expectedRevision: revision,
                }),
              );
            } catch (cause) {
              projectionState.finishAdvance();
              throw cause;
            }
          }}
          onAdvanceComplete={() => {
            projectionState.finishAdvance();
            setCardBusy(false);
            AccessibilityInfo.announceForAccessibility('Resposta salva.');
          }}
        />
      ) : (
        <Notice error>
          O card atual não está disponível. Volte à configuração e retome a
          sessão.
        </Notice>
      )}
      {command.error && <Notice error>{command.error}</Notice>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Encerrar sessão e ver resumo"
        disabled={busy}
        style={[studyStyles.endSession, busy && { opacity: 0.4 }]}
        onPress={() => {
          void command.run(async () => {
            await finish({ sessionId });
          });
        }}
      >
        <Text style={studyStyles.endSessionText}>Encerrar por hoje</Text>
      </Pressable>
    </View>
  );
}

function SessionProgress({ session }: { session: Doc<'studySessions'> }) {
  const progress = sessionProgress(session);
  return (
    <View style={studyStyles.progress}>
      <View style={studyStyles.progressTop}>
        <Text style={studyStyles.progressCount}>
          Card{' '}
          <Text style={studyStyles.progressNumber}>{progress.current}</Text> de{' '}
          {progress.total}
        </Text>
        <Text style={studyStyles.savedCount}>
          {session.answered}{' '}
          {session.answered === 1
            ? 'lembrança revisitada'
            : 'lembranças revisitadas'}
        </Text>
      </View>
      <View
        style={studyStyles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityLabel="Progresso da sessão"
        accessibilityValue={{
          min: 0,
          max: progress.total,
          now: progress.completed,
          text: `${session.answered} respostas salvas de ${progress.total} cards`,
        }}
      >
        <View
          style={[studyStyles.progressFill, { width: `${progress.percent}%` }]}
        />
      </View>
      {session.answered > 0 && session.answered % 5 === 0 && (
        <Text accessibilityLiveRegion="polite" style={studyStyles.milestone}>
          ✦ {session.answered} cards revisitados. Você está construindo memória.
        </Text>
      )}
    </View>
  );
}

const studyStyles = StyleSheet.create({
  deckToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  backButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  backButtonText: { fontSize: 13, fontWeight: '700', color: palette.ink },
  gestureNote: {
    flex: 1,
    textAlign: 'right',
    color: palette.muted,
    fontSize: 11,
  },
  session: {
    gap: 12,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingTop: 4,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: '800',
    color: palette.muted,
  },
  sessionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: palette.ink,
    marginTop: 5,
  },
  pause: {
    minHeight: 44,
    paddingHorizontal: 13,
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: palette.mountainSoft,
  },
  pauseText: { fontSize: 12, fontWeight: '700', color: palette.mountainDeep },
  progress: { gap: 8 },
  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  progressCount: { color: palette.muted, fontSize: 12 },
  progressNumber: { color: palette.ink, fontWeight: '800', fontSize: 17 },
  savedCount: { color: palette.muted, fontSize: 10 },
  progressTrack: {
    height: 7,
    backgroundColor: palette.line,
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressFill: { height: 7, backgroundColor: palette.blue, borderRadius: 8 },
  milestone: {
    color: palette.blueDeep,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 2,
  },
  endSession: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  endSessionText: {
    color: palette.muted,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  summary: {
    gap: 20,
    maxWidth: 540,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingTop: 20,
    paddingBottom: 20,
  },
  completionSeal: {
    alignSelf: 'center',
  },
  summaryEyebrow: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: palette.blueDeep,
  },
  summaryTitle: {
    fontSize: 31,
    lineHeight: 39,
    textAlign: 'center',
    fontWeight: '700',
    color: palette.ink,
  },
  summaryCopy: {
    fontSize: 15,
    lineHeight: 24,
    color: palette.muted,
    textAlign: 'center',
  },
});

const settingsStyles = StyleSheet.create({
  screen: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    gap: 24,
    paddingBottom: 6,
  },
  heading: { gap: 8, paddingTop: 5 },
  eyebrow: {
    color: palette.blue,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.9,
  },
  title: {
    color: palette.ink,
    fontSize: 49,
    fontWeight: '700',
    lineHeight: 63,
    letterSpacing: -1,
  },
  intro: { color: palette.muted, fontSize: 17, lineHeight: 25 },
  section: { gap: 14 },
  sectionLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  contextCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  contextTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  contextCategory: {
    color: palette.ink,
    fontSize: 24,
    lineHeight: 33,
    fontWeight: '700',
  },
  contextBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  levelBadge: {
    backgroundColor: palette.mountainSoft,
    color: palette.mountainDeep,
    fontWeight: '700',
    fontSize: 11,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  activeNote: { color: palette.muted, fontSize: 11 },
  adjustButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginVertical: -10,
  },
  adjustText: { color: palette.blue, fontSize: 12, fontWeight: '700' },
  adjustments: {
    gap: 20,
    borderTopColor: palette.line,
    borderTopWidth: 1,
    paddingTop: 18,
  },
  modeRow: { flexDirection: 'row', gap: 12 },
  mode: {
    flex: 1,
    minWidth: 0,
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 9,
  },
  selectedMode: {
    backgroundColor: palette.blueSoft,
    borderColor: palette.blue,
  },
  modeMark: { color: palette.muted, fontSize: 25, fontWeight: '600' },
  modeTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  selectedModeText: { color: palette.blueDeep },
  modeDetail: { color: palette.muted, fontSize: 12, lineHeight: 19 },
  resume: {
    gap: 12,
    padding: 20,
    backgroundColor: palette.mountainSoft,
    borderRadius: 22,
  },
  footnote: {
    color: palette.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: -12,
  },
});
