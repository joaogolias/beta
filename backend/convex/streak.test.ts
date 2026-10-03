import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { createTestBackend, learnerIdentity } from './test-support.helpers';
import {
  activityDay,
  streakSummary,
  type Activity,
} from '../../shared/dailyStreak';

const visit = (date: string, utcOffsetMinutes = 0): Activity => ({
  occurredAt: Date.parse(date),
  utcOffsetMinutes,
});
describe('daily app streak', () => {
  test('counts calendar visits once and preserves the best after a missed day', async () => {
    const backend = createTestBackend();
    const user = backend.withIdentity(learnerIdentity);
    await user.mutation(api.users.ensureCurrentUser, {});
    const first = visit('2026-01-01T23:30:00Z', -180);
    const next = visit('2026-01-03T02:30:00Z', -180);
    await user.mutation(api.streak.record, {
      activities: [first, first, next],
    });
    let result = await user.query(api.streak.current, {});
    expect(streakSummary(result, activityDay(next))).toMatchObject({
      currentStreak: 2,
      bestStreak: 2,
      lastActiveDate: '2026-01-02',
      activeToday: true,
    });
    expect(streakSummary(result, activityDay(next) + 1).currentStreak).toBe(2);
    expect(streakSummary(result, activityDay(next) + 2).currentStreak).toBe(0);
    const restart = visit('2026-01-05T12:00:00Z');
    await user.mutation(api.streak.record, { activities: [restart] });
    result = await user.query(api.streak.current, {});
    expect(streakSummary(result, activityDay(restart))).toMatchObject({
      currentStreak: 1,
      bestStreak: 2,
    });
  });
  test('late offline visits merge both neighboring runs and retry safely', async () => {
    const backend = createTestBackend();
    const user = backend.withIdentity(learnerIdentity);
    await user.mutation(api.users.ensureCurrentUser, {});
    const first = visit('2026-02-01T12:00:00Z');
    const middle = visit('2026-02-02T12:00:00Z');
    const last = visit('2026-02-03T12:00:00Z');
    await user.mutation(api.streak.record, { activities: [last, first] });
    await user.mutation(api.streak.record, { activities: [middle] });
    await user.mutation(api.streak.record, {
      activities: [last, middle, first],
    });
    const result = await user.query(api.streak.current, {});
    expect(result.runs).toHaveLength(1);
    expect(streakSummary(result, activityDay(last)).currentStreak).toBe(3);
    expect(
      await backend.run((ctx) => ctx.db.query('streakRuns').take(10)),
    ).toHaveLength(1);
  });
  test('is private to the authenticated account and isolates invalid dates from valid offline visits', async () => {
    const backend = createTestBackend();
    const first = backend.withIdentity(learnerIdentity);
    const other = backend.withIdentity({
      ...learnerIdentity,
      subject: 'other',
      tokenIdentifier: 'other',
    });
    await first.mutation(api.users.ensureCurrentUser, {});
    await other.mutation(api.users.ensureCurrentUser, {});
    const activity = visit('2026-03-01T12:00:00Z');
    await first.mutation(api.streak.record, { activities: [activity] });
    expect(await other.query(api.streak.current, {})).toEqual({
      runs: [],
      best: 0,
    });
    await expect(backend.query(api.streak.current, {})).rejects.toThrow();
    await expect(
      backend.mutation(api.streak.record, { activities: [activity] }),
    ).rejects.toThrow();
    const future = { ...activity, occurredAt: Date.now() + 600_000 };
    const result = await other.mutation(api.streak.record, {
      activities: [activity, future],
    });
    expect(result.rejectedActivities).toEqual([future]);
    expect(result.best).toBe(1);
    expect(result.runs).toEqual([
      { start: activityDay(activity), end: activityDay(activity) },
    ]);
    await expect(
      other.mutation(api.streak.record, {
        activities: [{ ...activity, utcOffsetMinutes: 900 }],
      }),
    ).rejects.toThrow('Data de atividade');
  });
});
