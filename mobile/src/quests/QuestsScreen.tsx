import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import type { QuestSnapshot } from '../../../shared/quests';
import { Action, Loading, Notice } from '../alphabet/ui';
import { errorMessage } from '../alphabet/form';
import { IbexMascot } from '../brand/IbexMascot';
import {
  useMutation,
  useOfflineStatus,
  usePaginatedQuery,
  useQuery,
} from '../offline/hooks';
import { palette } from '../theme';
import {
  groupQuests,
  mergeQuestHistory,
  questEntryState,
  questState,
  relativeQuestTime,
  type QuestRun,
} from './presentation';
import { useQuestTime } from './useQuestTime';

export function QuestsEntry({ onPress }: { onPress: () => void }) {
  const snapshot = useQuery(api.quests.snapshot, {});
  const now = useQuestTime(snapshot?.quests ?? []);
  const { complete, caption } = questEntryState(snapshot?.quests, now);
  return (
    <Pressable
      testID="quests-entry"
      accessibilityRole="button"
      accessibilityLabel="Abrir quests"
      accessibilityHint={caption}
      onPress={onPress}
      style={({ pressed }) => [
        styles.entry,
        complete && styles.entryComplete,
        pressed && styles.entryPressed,
      ]}
    >
      <IbexMascot size={84} mood={complete ? 'rest' : 'angry'} />
      <View style={styles.entryCopy}>
        <Text style={styles.entryTitle}>Quests</Text>
        <Text
          style={[styles.entryCaption, complete && styles.entryCaptionComplete]}
        >
          {caption}
        </Text>
      </View>
      <Text
        accessible={false}
        importantForAccessibility="no"
        style={styles.arrow}
      >
        ↗
      </Text>
    </Pressable>
  );
}
type Props = { onStarted: (questId: Id<'quests'>, run: QuestRun) => void };
export function QuestsScreen({ onStarted }: Props) {
  const snapshot = useQuery(api.quests.snapshot, {});
  const study = useQuery(api.study.active, {});
  const exam = useQuery(api.jlpt.active, {});
  const start = useMutation(api.quests.start);
  const { online, offlineMode, pending } = useOfflineStatus();
  const [view, setView] = useState<'active' | 'completed'>('active');
  const [showClosed, setShowClosed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(
    null,
  );
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const history = usePaginatedQuery(
    api.quests.list,
    showHistory ? { status: 'all' } : 'skip',
    { initialNumItems: 20 },
  );
  const quests = mergeQuestHistory(
    snapshot?.quests ?? [],
    showHistory ? history.results : [],
  );
  const now = useQuestTime(quests);
  const groups = groupQuests(quests, now);
  const connected = online && !offlineMode;
  // The paginated hook serves only local history until pending writes are sent.
  const remoteHistoryAvailable = connected && pending === 0;
  const loadingHistory =
    showHistory &&
    remoteHistoryAvailable &&
    history.status === 'LoadingFirstPage';
  const limitedHistory =
    snapshot?.hasMoreHistory &&
    (!showHistory || !remoteHistoryAvailable || history.status !== 'Exhausted');
  function emptyHistory(label: 'concluída' | 'encerrada') {
    return limitedHistory
      ? `Nenhuma quest ${label} ${showHistory && remoteHistoryAvailable ? 'nas quests consultadas' : 'no histórico recente'}.`
      : `Nenhuma quest ${label} ainda.`;
  }
  async function launch(id: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setStartingId(id);
    setError(null);
    try {
      const run = await start({ id: id as Id<'quests'> });
      if (mounted.current) onStarted(id as Id<'quests'>, run);
    } catch (cause) {
      if (mounted.current) setError({ id, message: errorMessage(cause) });
    } finally {
      inFlight.current = false;
      if (mounted.current) setStartingId(null);
    }
  }
  function renderQuest(quest: QuestSnapshot) {
    const state = questState(quest, now);
    const continuing =
      quest.completedCardIds.length > 0 ||
      quest.completedPaperIds.length > 0 ||
      (quest.completedStoryIds?.length ?? 0) > 0 ||
      study?.questId === quest.id ||
      exam?.questId === quest.id;
    const label =
      state === 'completed'
        ? 'Concluída'
        : state === 'expired'
          ? 'Encerrada'
          : state === 'cancelled'
            ? 'Cancelada'
            : state === 'upcoming'
              ? 'Em breve'
              : continuing
                ? 'Continuar'
                : 'Começar';
    const disabled = state !== 'active' || startingId !== null;
    return (
      <View key={quest.id} testID={`quest-${quest.id}`} style={styles.card}>
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            {quest.title}
          </Text>
          <Text style={styles.meta}>
            Criada em{' '}
            {new Intl.DateTimeFormat('pt-BR', {
              timeZone: quest.timeZone,
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            }).format(quest.createdAt)}
          </Text>
          <Text style={styles.meta}>{relativeQuestTime(quest, now)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${quest.title}`}
          accessibilityState={{
            disabled,
            busy: startingId === quest.id,
          }}
          disabled={disabled}
          onPress={() => void launch(quest.id)}
          style={[
            styles.button,
            state === 'completed' && styles.completeButton,
            disabled && state !== 'completed' && styles.disabled,
          ]}
        >
          <Text
            style={[
              styles.buttonText,
              state === 'completed' && styles.completeText,
            ]}
          >
            {startingId === quest.id ? 'Abrindo…' : label}
          </Text>
        </Pressable>
        {error?.id === quest.id && (
          <View style={styles.error}>
            <Notice error>{error.message}</Notice>
          </View>
        )}
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        Quests
      </Text>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {(
          [
            ['active', 'Ativas'],
            ['completed', 'Concluídas'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: view === value }}
            onPress={() => setView(value)}
            style={[styles.tab, view === value && styles.selectedTab]}
          >
            <Text
              style={[styles.tabText, view === value && styles.selectedTabText]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {snapshot === undefined ? (
        <Loading label="Abrindo suas quests…" />
      ) : view === 'active' ? (
        <>
          {groups.active.length > 0 ? (
            groups.active.map(renderQuest)
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nenhuma quest ativa agora.</Text>
              <Text style={styles.meta}>
                {groups.upcoming.length > 0
                  ? 'Suas próximas quests aparecem abaixo.'
                  : 'Peça ao GPT uma quest com cards, simulados ou histórias para praticar.'}
              </Text>
            </View>
          )}
          {groups.upcoming.length > 0 && (
            <View style={styles.group}>
              <Text accessibilityRole="header" style={styles.groupTitle}>
                Em breve
              </Text>
              {groups.upcoming.map(renderQuest)}
            </View>
          )}
        </>
      ) : (
        <>
          {groups.completed.map(renderQuest)}
          {!groups.completed.length && !loadingHistory && (
            <Text style={styles.emptyTitle}>{emptyHistory('concluída')}</Text>
          )}
          {(groups.closed.length > 0 || snapshot.hasMoreHistory) && (
            <View style={styles.closedGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Encerradas"
                accessibilityState={{ expanded: showClosed }}
                onPress={() => setShowClosed((value) => !value)}
                style={styles.disclosure}
              >
                <View style={styles.entryCopy}>
                  <Text style={styles.groupTitle}>Encerradas</Text>
                  <Text style={styles.meta}>Prazo encerrado ou canceladas</Text>
                </View>
                <Text accessible={false} style={styles.disclosureArrow}>
                  {showClosed ? '−' : '+'}
                </Text>
              </Pressable>
              {showClosed && groups.closed.map(renderQuest)}
              {showClosed && !groups.closed.length && !loadingHistory && (
                <Text style={styles.meta}>{emptyHistory('encerrada')}</Text>
              )}
            </View>
          )}
          {snapshot?.hasMoreHistory && !connected && (
            <Text style={styles.meta}>
              Histórico recente salvo neste aparelho. Volte ao modo online para
              consultar quests anteriores.
            </Text>
          )}
          {snapshot.hasMoreHistory && connected && pending > 0 && (
            <Text style={styles.meta}>
              Histórico recente salvo neste aparelho. As quests anteriores ficam
              disponíveis após sincronizar as atividades pendentes.
            </Text>
          )}
          {snapshot?.hasMoreHistory && !showHistory && (
            <Action
              secondary
              label="Consultar histórico completo"
              disabled={!remoteHistoryAvailable}
              onPress={() => setShowHistory(true)}
            />
          )}
          {loadingHistory && <Loading label="Consultando histórico…" />}
          {showHistory &&
            remoteHistoryAvailable &&
            (history.status === 'CanLoadMore' ||
              history.status === 'LoadingMore') && (
              <Action
                secondary
                label="Ver mais quests"
                busy={history.status === 'LoadingMore'}
                onPress={() => history.loadMore(20)}
              />
            )}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { gap: 12 },
  title: {
    color: palette.ink,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    marginBottom: 6,
  },
  card: {
    padding: 16,
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  copy: { flex: 1, minWidth: 140, gap: 5 },
  cardTitle: {
    color: palette.ink,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
  },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: palette.stoneSoft,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  selectedTab: { backgroundColor: palette.primary },
  tabText: { color: palette.muted, fontSize: 14, fontWeight: '700' },
  selectedTabText: { color: palette.surface },
  empty: { gap: 6, paddingVertical: 12 },
  emptyTitle: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  group: { gap: 12, marginTop: 8 },
  groupTitle: {
    color: palette.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  closedGroup: {
    gap: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 8,
  },
  disclosure: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  disclosureArrow: { color: palette.muted, fontSize: 24 },
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: palette.primary,
  },
  buttonText: { color: palette.surface, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  completeButton: { backgroundColor: palette.primarySoft },
  completeText: { color: palette.primaryDeep },
  error: { width: '100%' },
  entry: {
    minHeight: 104,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: palette.secondary,
    borderRadius: 18,
  },
  entryComplete: { backgroundColor: palette.primary },
  entryPressed: { opacity: 0.85 },
  entryCopy: { flex: 1, minWidth: 0, gap: 4 },
  entryTitle: {
    color: palette.surface,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  entryCaption: {
    color: palette.secondarySoft,
    fontSize: 13,
    lineHeight: 18,
    minHeight: 36,
  },
  entryCaptionComplete: { color: palette.primarySoft },
  arrow: { color: palette.surface, fontSize: 25 },
});
