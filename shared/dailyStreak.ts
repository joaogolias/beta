/** Calendar-day ordinals avoid 23/25-hour DST days changing a streak. */
export type Activity = { occurredAt: number; utcOffsetMinutes: number };
export type StreakRun = { start: number; end: number };
export type StreakHistory = { runs: StreakRun[]; best: number };
export const emptyStreak = (): StreakHistory => ({ runs: [], best: 0 });
const DAY = 86_400_000;

export function activityDay(activity: Activity): number {
  return Math.floor(
    (activity.occurredAt + activity.utcOffsetMinutes * 60_000) / DAY,
  );
}
export function captureActivity(now = new Date()): Activity {
  return {
    occurredAt: now.getTime(),
    utcOffsetMinutes: -now.getTimezoneOffset(),
  };
}
export function dayKey(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}
export function mergeRuns(...groups: readonly StreakRun[][]): StreakRun[] {
  const result: StreakRun[] = [];
  for (const run of groups.flat().sort((a, b) => a.start - b.start)) {
    const previous = result.at(-1);
    if (previous && run.start <= previous.end + 1)
      previous.end = Math.max(previous.end, run.end);
    else result.push({ ...run });
  }
  return result;
}
export function mergeHistory(
  history: StreakHistory,
  activities: readonly Activity[],
): StreakHistory {
  const runs = mergeRuns(
    history.runs,
    activities.map((activity) => {
      const day = activityDay(activity);
      return { start: day, end: day };
    }),
  );
  return {
    runs,
    best: Math.max(
      history.best,
      0,
      ...runs.map((run) => run.end - run.start + 1),
    ),
  };
}
export function removeActivityDays(
  history: StreakHistory,
  activities: readonly Activity[],
): StreakHistory {
  let runs = history.runs;
  for (const day of new Set(activities.map(activityDay))) {
    runs = runs.flatMap((run) =>
      day < run.start || day > run.end
        ? [run]
        : [
            ...(run.start < day ? [{ start: run.start, end: day - 1 }] : []),
            ...(day < run.end ? [{ start: day + 1, end: run.end }] : []),
          ],
    );
  }
  return mergeHistory({ runs, best: 0 }, []);
}
export function streakSummary(history: StreakHistory, today: number) {
  const pastRuns = history.runs.filter((run) => run.start <= today);
  const latest = pastRuns.at(-1);
  const previous = pastRuns.at(-2);
  const lastDay = latest ? Math.min(latest.end, today) : null;
  return {
    currentStreak:
      latest && lastDay !== null && today - lastDay <= 1
        ? lastDay - latest.start + 1
        : 0,
    bestStreak: history.best,
    lastActiveDate: lastDay === null ? null : dayKey(lastDay),
    activeToday: lastDay === today,
    // Keep the missed sequence visible on the first return day, even after
    // opening the app has already recorded the first day of the new sequence.
    restartedToday: Boolean(
      latest?.start === today && previous && previous.end < today - 1,
    ),
  };
}
