import { useEffect, useMemo } from 'react';
import type { ConvexReactClient } from 'convex/react';

export function useClientLifetime(client: ConvexReactClient) {
  const retain = useMemo(() => {
    let generation = 0;
    return () => {
      const current = ++generation;
      return () => {
        // Parent effects clean up before their children. Convex's auth provider
        // must clear auth and query subscriptions before its client is closed.
        queueMicrotask(() => {
          // Strict Mode can resume the same effect without disposing its client.
          if (generation !== current) return;
          void client.close().catch(() => {
            console.warn('Não foi possível encerrar a conexão anterior.');
          });
        });
      };
    };
  }, [client]);
  useEffect(retain, [retain]);
}
