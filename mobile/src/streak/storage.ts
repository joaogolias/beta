import type { SavedStreak, StreakPersistence } from './model';

type KeyValue = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};
export const streakStorageKey = (accountKey: string) =>
  `babel-crux:streak:v1:${encodeURIComponent(accountKey)}`;

function validCache(value: unknown, accountKey: string): value is SavedStreak {
  if (!value || typeof value !== 'object') return false;
  const saved = value as Partial<SavedStreak>;
  return (
    saved.version === 1 &&
    saved.accountKey === accountKey &&
    typeof saved.remindersEnabled === 'boolean' &&
    Number.isInteger(saved.history?.best) &&
    Number(saved.history?.best) >= 0 &&
    Array.isArray(saved.history?.runs) &&
    saved.history.runs.every(
      (run) =>
        run &&
        Number.isInteger(run.start) &&
        Number.isInteger(run.end) &&
        run.start <= run.end,
    ) &&
    Array.isArray(saved.pending) &&
    saved.pending.every(
      (activity) =>
        activity &&
        Number.isSafeInteger(activity.occurredAt) &&
        Number.isInteger(activity.utcOffsetMinutes),
    )
  );
}

export function streakPersistence(
  accountKey: string,
  storage: KeyValue,
): StreakPersistence {
  const key = streakStorageKey(accountKey);
  return {
    async read() {
      // Storage failures propagate for retry; only malformed payloads need recovery.
      const raw = await storage.getItem(key);
      if (!raw) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      if (validCache(parsed, accountKey)) return parsed;
      // Keep the exact original before rebuilding from cloud data and new visits.
      await storage.setItem(`${key}:recovery:${Date.now()}`, raw);
      return null;
    },
    async write(saved) {
      await storage.setItem(key, JSON.stringify(saved));
    },
  };
}
