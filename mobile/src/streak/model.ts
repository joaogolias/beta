import {
  activityDay,
  emptyStreak,
  mergeHistory,
  mergeRuns,
  removeActivityDays,
  type streakSummary,
  type Activity,
  type StreakHistory,
} from '../../../shared/dailyStreak';
import type { IbexMood } from '../../../shared/ibex';

export function streakMood(
  summary: ReturnType<typeof streakSummary>,
  localHour: number,
): IbexMood {
  if (
    summary.restartedToday ||
    (summary.currentStreak === 0 && summary.lastActiveDate !== null)
  )
    return 'sad';
  if (summary.activeToday) return 'celebrate';
  if (summary.currentStreak > 0 && localHour >= 19) return 'angry';
  return 'welcome';
}

export type SavedStreak = {
  version: 1;
  accountKey: string;
  history: StreakHistory;
  pending: Activity[];
  remindersEnabled: boolean;
  rejectedActivities?: Activity[];
};
export type StreakPersistence = {
  read: () => Promise<SavedStreak | null>;
  write: (saved: SavedStreak) => Promise<void>;
};
export type StreakSnapshot = {
  saved: SavedStreak | null;
  error: string | null;
  syncing: boolean;
};

/** Serialize local commits; acknowledge only the exact batch sent to the server. */
export class StreakStore {
  private state: StreakSnapshot = { saved: null, error: null, syncing: false };
  private listeners = new Set<() => void>();
  private work: Promise<void> = Promise.resolve();
  constructor(
    private accountKey: string,
    private persistence: StreakPersistence,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<StreakSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private enqueue(task: () => Promise<void>) {
    const result = this.work.then(task);
    this.work = result.catch((error: unknown) => {
      this.publish({
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar sua sequência.',
      });
    });
    return this.work;
  }
  private async save(saved: SavedStreak) {
    await this.persistence.write(saved);
    this.publish({ saved, error: null });
  }
  load() {
    return this.enqueue(async () => {
      if (this.state.saved) return;
      const saved = await this.persistence.read();
      if (
        saved &&
        (saved.version !== 1 ||
          saved.accountKey !== this.accountKey ||
          !Array.isArray(saved.pending) ||
          !Array.isArray(saved.history?.runs))
      )
        throw new Error(
          'Não foi possível ler sua sequência salva. Seus dados foram preservados.',
        );
      this.publish({
        saved: saved ?? {
          version: 1,
          accountKey: this.accountKey,
          history: emptyStreak(),
          pending: [],
          remindersEnabled: false,
        },
        error: null,
      });
    });
  }
  visit(activity: Activity) {
    return this.enqueue(async () => {
      const saved = this.state.saved;
      if (!saved) return;
      const day = activityDay(activity);
      if (saved.history.runs.some((run) => run.start <= day && run.end >= day))
        return;
      await this.save({
        ...saved,
        history: mergeHistory(saved.history, [activity]),
        pending: [...saved.pending, activity],
      });
    });
  }
  receive(remote: StreakHistory) {
    return this.enqueue(async () => {
      const saved = this.state.saved;
      if (!saved) return;
      const history = mergeHistory(
        {
          runs: mergeRuns(saved.history.runs, remote.runs),
          best: Math.max(saved.history.best, remote.best),
        },
        [],
      );
      if (JSON.stringify(history) !== JSON.stringify(saved.history))
        await this.save({ ...saved, history });
    });
  }
  setReminders(remindersEnabled: boolean) {
    return this.enqueue(async () => {
      if (this.state.saved)
        await this.save({ ...this.state.saved, remindersEnabled });
    });
  }
  async sync(
    send: (
      activities: Activity[],
    ) => Promise<StreakHistory & { rejectedActivities?: Activity[] }>,
    connected: () => boolean = () => true,
  ) {
    await this.work;
    if (!connected() || this.state.syncing || !this.state.saved?.pending.length)
      return;
    this.publish({ syncing: true });
    try {
      while (connected() && this.state.saved?.pending.length) {
        const activities = this.state.saved.pending.slice(0, 64);
        const remote = await send(activities);
        const sent = new Set(
          activities.map(
            (activity) => `${activity.occurredAt}:${activity.utcOffsetMinutes}`,
          ),
        );
        await this.enqueue(async () => {
          const saved = this.state.saved!;
          const rejected = remote.rejectedActivities ?? [];
          const rejectedDays = new Set(rejected.map(activityDay));
          const acceptedDays = new Set(
            activities
              .filter((activity) => !rejectedDays.has(activityDay(activity)))
              .map(activityDay),
          );
          const rejectedActivities = [
            ...new Map(
              [...(saved.rejectedActivities ?? []), ...rejected]
                .filter((activity) => !acceptedDays.has(activityDay(activity)))
                .map((activity) => [activityDay(activity), activity]),
            ).values(),
          ];
          const localHistory = rejected.length
            ? removeActivityDays(saved.history, rejected)
            : saved.history;
          await this.save({
            ...saved,
            ...(rejected.length || saved.rejectedActivities
              ? { rejectedActivities }
              : {}),
            history: mergeHistory(
              {
                runs: mergeRuns(localHistory.runs, remote.runs),
                best: Math.max(localHistory.best, remote.best),
              },
              [],
            ),
            pending: saved.pending.filter(
              (activity) =>
                !sent.has(
                  `${activity.occurredAt}:${activity.utcOffsetMinutes}`,
                ),
            ),
          });
        });
        // A failed SQLite acknowledgement must retain the batch for a later idempotent retry.
        if (this.state.error) break;
      }
    } catch {
      this.publish({
        error:
          'Sequência salva neste aparelho. A sincronização será tentada novamente.',
      });
    } finally {
      this.publish({ syncing: false });
    }
  }
}
