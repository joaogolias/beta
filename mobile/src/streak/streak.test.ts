import { describe, expect, test } from 'vitest';
import {
  activityDay,
  emptyStreak,
  mergeHistory,
  streakSummary,
  type Activity,
} from '../../../shared/dailyStreak';
import { StreakStore, streakMood, type SavedStreak } from './model';
import { streakPersistence, streakStorageKey } from './storage';

const visit = (date: string, utcOffsetMinutes = 0): Activity => ({
  occurredAt: Date.parse(date),
  utcOffsetMinutes,
});
function memory() {
  let saved: SavedStreak | null = null;
  return {
    async read() {
      return saved ? structuredClone(saved) : null;
    },
    async write(value: SavedStreak) {
      saved = structuredClone(value);
    },
  };
}
describe('daily app streak', () => {
  test('entering offline mode stops remaining streak batches and preserves them until explicit reconnection', async () => {
    const store = new StreakStore('one', memory());
    await store.load();
    for (let day = 0; day < 70; day++) {
      await store.visit({
        occurredAt: Date.parse('2026-01-01T12:00:00Z') + day * 86_400_000,
        utcOffsetMinutes: 0,
      });
    }
    let connected = true;
    let sends = 0;
    await store.sync(
      async (activities) => {
        sends++;
        connected = false;
        return mergeHistory(emptyStreak(), activities);
      },
      () => connected,
    );
    expect(sends).toBe(1);
    expect(store.getSnapshot().saved?.pending).toHaveLength(6);
    await store.sync(
      async (activities) => {
        sends++;
        return mergeHistory(emptyStreak(), activities);
      },
      () => connected,
    );
    expect(sends).toBe(1);
    connected = true;
    await store.sync(
      async (activities) => {
        sends++;
        return mergeHistory(emptyStreak(), activities);
      },
      () => connected,
    );
    expect(sends).toBe(2);
    expect(store.getSnapshot().saved?.pending).toHaveLength(0);
    expect(store.getSnapshot().saved?.history.best).toBe(70);
  });

  test('the ibex welcomes a new learner and only warns about an existing sequence from 19h', () => {
    const first = visit('2026-10-01T12:00:00Z');
    const today = activityDay(first);
    expect(streakMood(streakSummary(emptyStreak(), today), 20)).toBe('welcome');
    const history = mergeHistory(emptyStreak(), [first]);
    expect(streakMood(streakSummary(history, today), 23)).toBe('celebrate');
    expect(streakMood(streakSummary(history, today + 1), 18)).toBe('welcome');
    expect(streakMood(streakSummary(history, today + 1), 19)).toBe('angry');
    expect(streakMood(streakSummary(history, today + 2), 0)).toBe('sad');
    expect(streakMood(streakSummary(history, today + 2), 19)).toBe('sad');
  });
  test('the missed sequence remains visible on the first returning day offline without hiding its new count', async () => {
    const persistence = memory();
    const store = new StreakStore('one', persistence);
    await store.load();
    await store.visit(visit('2026-10-01T12:00:00Z'));
    await store.visit(visit('2026-10-02T12:00:00Z'));
    const returningVisit = visit('2026-10-04T12:00:00Z');
    await store.visit(returningVisit);
    await store.visit(visit('2026-10-04T20:00:00Z'));
    const reopened = new StreakStore('one', persistence);
    await reopened.load();
    const summary = streakSummary(
      reopened.getSnapshot().saved!.history,
      activityDay(returningVisit),
    );
    expect(summary).toMatchObject({
      currentStreak: 1,
      bestStreak: 2,
      activeToday: true,
      restartedToday: true,
    });
    expect(streakMood(summary, 20)).toBe('sad');
    expect(reopened.getSnapshot().saved?.pending).toHaveLength(3);
    const next = visit('2026-10-05T12:00:00Z');
    await reopened.visit(next);
    const continued = streakSummary(
      reopened.getSnapshot().saved!.history,
      activityDay(next),
    );
    expect(continued).toMatchObject({
      currentStreak: 2,
      restartedToday: false,
    });
    expect(streakMood(continued, 12)).toBe('celebrate');
  });
  test('late activity from another device removes a false loss and first visits never look sad', async () => {
    const store = new StreakStore('one', memory());
    await store.load();
    const first = visit('2026-10-01T12:00:00Z');
    await store.visit(first);
    expect(
      streakSummary(store.getSnapshot().saved!.history, activityDay(first))
        .restartedToday,
    ).toBe(false);
    const returnDay = visit('2026-10-03T12:00:00Z');
    await store.visit(returnDay);
    await store.receive(
      mergeHistory(emptyStreak(), [visit('2026-10-02T12:00:00Z')]),
    );
    const summary = streakSummary(
      store.getSnapshot().saved!.history,
      activityDay(returnDay),
    );
    expect(summary).toMatchObject({ currentStreak: 3, restartedToday: false });
    expect(streakMood(summary, 20)).toBe('celebrate');
  });
  test('recovers transient reads and preserves malformed caches before reconstructing from cloud', async () => {
    let reads = 0;
    const store = new StreakStore('one', {
      async read() {
        if (reads++ === 0) throw new Error('busy');
        return null;
      },
      async write() {},
    });
    await store.load();
    expect(store.getSnapshot().saved).toBeNull();
    await store.load();
    expect(store.getSnapshot().saved?.pending).toEqual([]);
    const key = streakStorageKey('one');
    const raw = '{malformed';
    const values = new Map([[key, raw]]);
    const recovered = new StreakStore(
      'one',
      streakPersistence('one', {
        async getItem(key) {
          return values.get(key) ?? null;
        },
        async setItem(key, value) {
          values.set(key, value);
        },
      }),
    );
    await recovered.load();
    await recovered.receive(
      mergeHistory(emptyStreak(), [visit('2026-01-01T12:00:00Z')]),
    );
    expect(recovered.getSnapshot().saved?.history.best).toBe(1);
    expect(
      [...values.entries()].some(
        ([key, value]) => key.includes(':recovery:') && value === raw,
      ),
    ).toBe(true);
  });
  test('merges adjacent local and remote history and isolates rejected clock dates without blocking valid visits', async () => {
    const store = new StreakStore('one', memory());
    await store.load();
    const first = visit('2026-01-01T12:00:00Z');
    const second = visit('2026-01-02T12:00:00Z');
    const future = visit('2099-01-01T12:00:00Z');
    await store.visit(second);
    await store.receive(mergeHistory(emptyStreak(), [first]));
    expect(store.getSnapshot().saved?.history.best).toBe(2);
    await store.visit(future);
    await store.sync(async () => ({
      ...mergeHistory(emptyStreak(), [first, second]),
      rejectedActivities: [future],
    }));
    expect(store.getSnapshot().saved?.pending).toHaveLength(0);
    expect(store.getSnapshot().saved?.rejectedActivities).toEqual([future]);
    expect(store.getSnapshot().saved?.history.runs).toEqual([
      { start: activityDay(first), end: activityDay(second) },
    ]);
    await store.visit(visit('2026-01-03T12:00:00Z'));
    expect(store.getSnapshot().saved?.pending).toHaveLength(1);
  });
  test('uses calendar dates across DST, year boundaries and UTC midnight', () => {
    const activities = [
      visit('2025-12-31T23:50:00Z'),
      visit('2026-01-01T00:05:00Z'),
    ];
    expect(
      streakSummary(
        mergeHistory(emptyStreak(), activities),
        activityDay(activities[1]),
      ).currentStreak,
    ).toBe(2);
    const dst = [
      visit('2026-03-08T04:55:00Z', -300),
      visit('2026-03-09T03:55:00Z', -240),
    ];
    expect(
      streakSummary(mergeHistory(emptyStreak(), dst), activityDay(dst[1]))
        .currentStreak,
    ).toBe(2);
    expect(activityDay(visit('2026-01-02T01:00:00Z', -180))).toBe(
      activityDay(visit('2026-01-01T10:00:00Z', -180)),
    );
  });
  test('survives restart offline and does not duplicate a day on repeated app opens', async () => {
    const persistence = memory();
    const store = new StreakStore('one', persistence);
    await store.load();
    await store.visit(visit('2026-01-01T12:00:00Z'));
    await store.visit(visit('2026-01-01T22:00:00Z'));
    const reopened = new StreakStore('one', persistence);
    await reopened.load();
    await reopened.visit(visit('2026-01-02T12:00:00Z'));
    expect(reopened.getSnapshot().saved?.pending).toHaveLength(2);
    expect(reopened.getSnapshot().saved?.history.best).toBe(2);
    await reopened.sync(async () => {
      throw new Error('offline');
    });
    expect(reopened.getSnapshot().saved?.pending).toHaveLength(2);
    await reopened.sync(async (activities) =>
      mergeHistory(emptyStreak(), activities),
    );
    expect(reopened.getSnapshot().saved?.pending).toHaveLength(0);
    expect((await persistence.read())?.history.best).toBe(2);
  });
  test('preserves a new day recorded while an older batch is being acknowledged', async () => {
    const store = new StreakStore('one', memory());
    await store.load();
    const first = visit('2026-01-01T12:00:00Z');
    const second = visit('2026-01-02T12:00:00Z');
    await store.visit(first);
    const batches: Activity[][] = [];
    await store.sync(async (activities) => {
      batches.push(activities);
      if (batches.length === 1) await store.visit(second);
      return mergeHistory(emptyStreak(), activities);
    });
    expect(batches).toEqual([[first], [second]]);
    expect(store.getSnapshot().saved?.pending).toHaveLength(0);
    expect(store.getSnapshot().saved?.history.best).toBe(2);
  });
  test('rejects another account cache and commits only after durable storage succeeds', async () => {
    const persistence = memory();
    const one = new StreakStore('one', persistence);
    await one.load();
    await one.visit(visit('2026-01-01T12:00:00Z'));
    const two = new StreakStore('two', persistence);
    await two.load();
    expect(two.getSnapshot().saved).toBeNull();
    expect(two.getSnapshot().error).toBeTruthy();
    const failing = new StreakStore('one', {
      read: persistence.read,
      async write() {
        throw new Error('disk full');
      },
    });
    await failing.load();
    await failing.visit(visit('2026-01-02T12:00:00Z'));
    expect(failing.getSnapshot().saved?.pending).toHaveLength(1);
    expect(failing.getSnapshot().error).toBe('disk full');
  });
});
