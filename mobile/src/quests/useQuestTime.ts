import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { QuestSnapshot } from '../../../shared/quests';

/** Only display time changes here. This never requests a synchronization. */
export function useQuestTime(quests: QuestSnapshot[]) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const next = Math.min(
      now + 60_000,
      ...quests
        .flatMap((quest) => [quest.startsAt, quest.dueAt])
        .filter((time) => time > now),
    );
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, next - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [quests, now]);
  return now;
}
