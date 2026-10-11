import type { Id } from '../../../backend/convex/_generated/dataModel';
import type { QuestSnapshot } from '../../../shared/quests';

export type QuestRun =
  | { kind: 'study'; sessionId: Id<'studySessions'> }
  | { kind: 'shiken'; attemptId: Id<'jlptAttempts'> }
  | { kind: 'story'; storyId: Id<'stories'>; questId?: Id<'quests'> };
export type QuestState =
  'active' | 'upcoming' | 'completed' | 'expired' | 'cancelled';
export function questState(quest: QuestSnapshot, now: number): QuestState {
  if (quest.completedAt !== undefined) return 'completed';
  if (quest.cancelledAt !== undefined) return 'cancelled';
  if (now >= quest.dueAt) return 'expired';
  return now < quest.startsAt ? 'upcoming' : 'active';
}

/** Keep deadlines and cancellation separate from actual completion. */
export function groupQuests(quests: QuestSnapshot[], now: number) {
  const groups: Record<
    'active' | 'upcoming' | 'completed' | 'closed',
    QuestSnapshot[]
  > = {
    active: [],
    upcoming: [],
    completed: [],
    closed: [],
  };
  for (const quest of quests) {
    const state = questState(quest, now);
    groups[
      state === 'expired' || state === 'cancelled' ? 'closed' : state
    ].push(quest);
  }
  groups.active.sort((a, b) => a.dueAt - b.dueAt);
  groups.upcoming.sort((a, b) => a.startsAt - b.startsAt);
  groups.completed.sort((a, b) => b.completedAt! - a.completedAt!);
  groups.closed.sort(
    (a, b) => (b.cancelledAt ?? b.dueAt) - (a.cancelledAt ?? a.dueAt),
  );
  return groups;
}

/** Historical and scheduled quests do not describe what can be completed now. */
export function questEntryState(
  quests: QuestSnapshot[] | undefined,
  now: number,
) {
  const current = (quests ?? []).filter(
    (quest) =>
      quest.cancelledAt === undefined &&
      quest.startsAt <= now &&
      now < quest.dueAt,
  );
  const pending = current.filter(
    (quest) => quest.completedAt === undefined,
  ).length;
  const complete = current.length > 0 && pending === 0;
  const upcoming = quests?.some(
    (quest) => questState(quest, now) === 'upcoming',
  );
  return {
    complete,
    caption:
      quests === undefined
        ? 'Seus desafios de estudo'
        : complete
          ? 'Todas concluídas. Bom descanso!'
          : pending > 0
            ? `${pending} ${pending === 1 ? 'quest para concluir' : 'quests para concluir'}`
            : upcoming
              ? 'Novas quests em breve'
              : 'Nenhuma quest disponível',
  };
}
function duration(milliseconds: number) {
  if (milliseconds < 60_000) return 'menos de 1 min';
  if (milliseconds < 3_600_000)
    return `${Math.ceil(milliseconds / 60_000)} min`;
  if (milliseconds < 86_400_000)
    return `${Math.ceil(milliseconds / 3_600_000)} h`;
  const days = Math.ceil(milliseconds / 86_400_000);
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}
export function relativeQuestTime(quest: QuestSnapshot, now: number) {
  if (quest.completedAt !== undefined) {
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: quest.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return day.format(quest.completedAt) === day.format(now)
      ? 'Concluída hoje'
      : `Concluída em ${new Intl.DateTimeFormat('pt-BR', { timeZone: quest.timeZone, day: '2-digit', month: '2-digit' }).format(quest.completedAt)}`;
  }
  if (quest.cancelledAt !== undefined) return 'Cancelada';
  if (now >= quest.dueAt) return 'Prazo encerrado';
  if (now < quest.startsAt)
    return `Começa em ${duration(quest.startsAt - now)} · expira em ${duration(quest.dueAt - now)}`;
  return `Expira em ${duration(quest.dueAt - now)}`;
}
/** Delayed server credit can change progress without advancing updatedAt. */
export function mergeQuestHistory(
  recent: QuestSnapshot[],
  history: QuestSnapshot[],
) {
  const byId = new Map(history.map((quest) => [quest.id, quest]));
  for (const quest of recent) {
    const previous = byId.get(quest.id);
    if (!previous || quest.updatedAt > previous.updatedAt)
      byId.set(quest.id, quest);
  }
  return [...byId.values()];
}
