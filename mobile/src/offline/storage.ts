import Storage from 'expo-sqlite/kv-store';
import type { CachedProfile, Saved } from './model';
import type { Persistence } from './engine';
export type { CachedProfile } from './model';

export function persistence(accountKey: string): Persistence {
  const key = `beta:offline:v1:${encodeURIComponent(accountKey)}`;
  return {
    async read() {
      const raw = await Storage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw) as Saved;
      if (
        data.version !== 1 ||
        data.accountKey !== accountKey ||
        !data.base?.profile?._id ||
        !Array.isArray(data.queue) ||
        !data.aliases ||
        ![
          data.base.cards,
          data.base.sessions,
          data.base.presentations,
          data.base.stats,
          data.base.attempts,
        ].every(Array.isArray)
      )
        throw new Error(
          'Não foi possível ler os dados salvos. As pendências foram preservadas neste aparelho.',
        );
      for (const documents of [
        data.base.cards,
        data.base.sessions,
        data.base.presentations,
        data.base.stats,
        data.base.attempts,
      ])
        if (documents.some((doc) => doc.ownerId !== data.base.profile._id))
          throw new Error('Os dados salvos não correspondem à conta atual.');
      return data;
    },
    async write(value) {
      // One SQLite row replaces base + pending journal atomically, including ACKs.
      await Storage.setItem(key, JSON.stringify(value));
    },
  };
}
export async function getCachedProfile(
  accountKey: string,
): Promise<CachedProfile | null> {
  return (await persistence(accountKey).read())?.base.profile ?? null;
}

export function offlinePreference(accountKey: string) {
  const key = `beta:offline-mode:v1:${encodeURIComponent(accountKey)}`;
  return {
    async read() {
      return (await Storage.getItem(key)) === 'offline';
    },
    async write(offline: boolean) {
      await Storage.setItem(key, offline ? 'offline' : 'online');
    },
  };
}
