import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import { Action, Loading, Notice, ui } from '../alphabet/ui';
import { errorMessage } from '../alphabet/form';
import { IbexMascot } from '../brand/IbexMascot';
import { useMutation, useQuery } from '../offline/hooks';
import { StudySession } from '../study/StudyScreens';
import { JlptAttemptScreen } from '../jlpt/AttemptScreen';
import { StoryReader } from '../stories/StoryReader';
import { questState, type QuestRun } from './presentation';
import { useQuestTime } from './useQuestTime';

const runIdentity = (run: QuestRun) =>
  run.kind === 'study'
    ? `study:${run.sessionId}`
    : run.kind === 'shiken'
      ? `shiken:${run.attemptId}`
      : `story:${run.storyId}`;

export function QuestRunner({
  questId,
  run,
  onStarted,
  onExit,
}: {
  questId: Id<'quests'>;
  run: QuestRun;
  onStarted: (run: QuestRun) => void;
  onExit: () => void;
}) {
  const quest = useQuery(api.quests.get, { id: questId });
  const start = useMutation(api.quests.start);
  const now = useQuestTime(quest ? [quest] : []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acknowledgedStory, setAcknowledgedStory] = useState<string | null>(
    null,
  );
  const continuing = useRef(false);
  const handled = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const runKey = runIdentity(run);
  async function next(retry = false) {
    if (quest && run.kind === 'story') {
      const currentState = questState(quest, Date.now());
      if (currentState === 'completed') {
        setAcknowledgedStory(runKey);
        return;
      }
      if (currentState !== 'active') {
        onExit();
        return;
      }
    }
    if (
      !quest ||
      questState(quest, Date.now()) !== 'active' ||
      continuing.current ||
      (!retry && handled.current === runKey)
    )
      return;
    continuing.current = true;
    handled.current = runKey;
    setBusy(true);
    setError(null);
    try {
      const following = await start({ id: questId });
      const nextKey = runIdentity(following);
      if (nextKey === runKey)
        throw new Error(
          'Não foi possível avançar nesta quest. Sua prática foi salva. Tente continuar novamente.',
        );
      if (mounted.current) onStarted(following);
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      continuing.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (quest === undefined) return <Loading label="Abrindo sua quest…" />;
  if (!quest)
    return (
      <View style={ui.stack}>
        <Notice error>Esta quest não está disponível neste aparelho.</Notice>
        <Action label="Voltar às quests" onPress={onExit} />
      </View>
    );
  const state = questState(quest, now);
  // Keep the reader's result visible until the learner chooses to continue.
  if (
    state === 'completed' &&
    (run.kind !== 'story' || acknowledgedStory === runKey)
  )
    return (
      <View style={ui.stack}>
        <IbexMascot mood="celebrate" size={176} />
        <Text accessibilityRole="header" style={ui.title}>
          {quest.title}
        </Text>
        <Text style={ui.subtitle}>Quest concluída!</Text>
        <Action label="Voltar às quests" onPress={onExit} />
      </View>
    );
  if (state === 'upcoming')
    return (
      <View style={ui.stack}>
        <Notice>Esta quest ainda não começou.</Notice>
        <Action label="Voltar às quests" onPress={onExit} />
      </View>
    );
  const inactive = state === 'expired' || state === 'cancelled';
  if (run.kind === 'story' && !error && !busy)
    return (
      <View style={{ flex: 1 }}>
        {inactive && (
          <Notice>
            {state === 'expired'
              ? 'O prazo desta quest terminou.'
              : 'Esta quest foi cancelada.'}{' '}
            Você pode terminar esta leitura. Ela não contará para a quest.
          </Notice>
        )}
        <StoryReader
          key={runKey}
          storyId={run.storyId}
          onExit={onExit}
          quest={{
            id: questId,
            title: quest.title,
            counting: !inactive,
            onCompleted: () => void next(),
          }}
        />
      </View>
    );
  if (inactive && run.kind !== 'story')
    return (
      <View style={ui.stack}>
        <Notice>
          {state === 'expired'
            ? 'O prazo desta quest terminou.'
            : 'Esta quest foi cancelada.'}{' '}
          Você pode terminar esta prática. Ela não contará para a quest.
        </Notice>
        {run.kind === 'study' ? (
          <StudySession
            key={runKey}
            sessionId={run.sessionId}
            onSettings={onExit}
            quest={{
              title: quest.title,
              total: quest.cardIds.length,
              completed: quest.completedCardIds.length,
              counting: false,
              onCompleted: onExit,
            }}
          />
        ) : (
          <JlptAttemptScreen
            key={runKey}
            attemptId={run.attemptId}
            onHome={onExit}
            quest={{ title: quest.title, onCompleted: onExit }}
          />
        )}
      </View>
    );
  if (error)
    return (
      <View style={ui.stack}>
        <Notice error>{error}</Notice>
        <Action
          label="Tentar continuar"
          onPress={() => void next(true)}
          busy={busy}
        />
        <Action secondary label="Voltar às quests" onPress={onExit} />
      </View>
    );
  if (busy) return <Loading label="Continuando sua quest…" />;
  return run.kind === 'study' ? (
    <StudySession
      key={runKey}
      sessionId={run.sessionId}
      onSettings={onExit}
      quest={{
        title: quest.title,
        total: quest.cardIds.length,
        completed: quest.completedCardIds.length,
        onCompleted: () => void next(),
      }}
    />
  ) : run.kind === 'shiken' ? (
    <JlptAttemptScreen
      key={runKey}
      attemptId={run.attemptId}
      onHome={onExit}
      quest={{ title: quest.title, onCompleted: () => void next() }}
    />
  ) : null;
}
