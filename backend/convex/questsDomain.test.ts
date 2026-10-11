import { describe, expect, test } from 'vitest';
import {
  applyQuestCredit,
  canCreditQuest,
  remainingQuestCardIds,
  remainingQuestPaperIds,
  type QuestActivity,
  type QuestSnapshot,
} from '../../shared/quests';

function quest(patch: Partial<QuestSnapshot> = {}): QuestSnapshot {
  return {
    id: 'quest',
    title: 'Prática exata',
    startsAt: 100,
    dueAt: 500,
    timeZone: 'UTC',
    createdAt: 120,
    updatedAt: 120,
    cardIds: ['second', 'first'],
    paperIds: ['paper'],
    completedCardIds: [],
    completedPaperIds: [],
    ...patch,
  };
}
const study: QuestActivity = {
  questId: 'quest',
  kind: 'study',
  sourceId: 'presentation',
  cardId: 'first',
  occurredAt: 200,
};
const shiken: QuestActivity = {
  questId: 'quest',
  kind: 'shiken',
  sourceId: 'attempt',
  paperId: 'paper',
  occurredAt: 300,
};

describe('exact quest progress', () => {
  test('accepts only the selected target in the selected quest and occurrence window', () => {
    for (const activity of [
      { ...study, questId: 'other' },
      { ...study, cardId: 'other' },
      { ...study, occurredAt: 119 },
      { ...study, occurredAt: 500 },
      { ...study, occurredAt: NaN },
    ])
      expect(canCreditQuest(quest(), activity)).toBe(false);
    expect(canCreditQuest(quest(), { ...study, occurredAt: 120 })).toBe(true);
    expect(canCreditQuest(quest({ startsAt: 250 }), study)).toBe(false);
    expect(canCreditQuest(quest(), { ...shiken, paperId: 'other' })).toBe(
      false,
    );
  });
  test('repeating one card never substitutes another and target order is stable', () => {
    const initial = quest(),
      first = applyQuestCredit(initial, study);
    expect(applyQuestCredit(first, { ...study, sourceId: 'repeat' })).toBe(
      first,
    );
    expect(remainingQuestCardIds(first)).toEqual(['second']);
    const cards = applyQuestCredit(first, { ...study, cardId: 'second' });
    expect(cards.completedCardIds).toEqual(['second', 'first']);
    expect(cards.completedAt).toBeUndefined();
    expect(remainingQuestPaperIds(cards)).toEqual(['paper']);
    const complete = applyQuestCredit(cards, shiken);
    expect(complete.completedAt).toBe(300);
    expect(initial.completedCardIds).toEqual([]);
  });
  test('undo removes one target before completion and never reopens earned completion', () => {
    const credited = applyQuestCredit(quest(), study);
    expect(applyQuestCredit(credited, study, -1).completedCardIds).toEqual([]);
    const complete = applyQuestCredit(
      quest({ cardIds: ['first'], paperIds: [] }),
      study,
    );
    expect(applyQuestCredit(complete, study, -1)).toBe(complete);
    expect(applyQuestCredit(complete, { ...study, occurredAt: 400 })).toBe(
      complete,
    );
  });
  test('cancellation and expiration stop new credit but not undo of an earlier contribution', () => {
    const credited = applyQuestCredit(quest(), study);
    const cancelled = { ...credited, cancelledAt: 250 };
    expect(applyQuestCredit(cancelled, { ...study, cardId: 'second' })).toBe(
      cancelled,
    );
    expect(
      applyQuestCredit(credited, {
        ...study,
        cardId: 'second',
        occurredAt: 500,
      }),
    ).toBe(credited);
    expect(
      applyQuestCredit(cancelled, { ...study, occurredAt: 600 }, -1)
        .completedCardIds,
    ).toEqual([]);
  });
  test('delayed activity keeps its occurrence date and cannot move updatedAt backwards', () => {
    const result = applyQuestCredit(
      quest({ cardIds: ['first'], paperIds: [], updatedAt: 800 }),
      study,
    );
    expect(result.completedAt).toBe(200);
    expect(result.updatedAt).toBe(800);
    expect(
      applyQuestCredit(quest({ cardIds: [], paperIds: [] }), study).completedAt,
    ).toBeUndefined();
  });
});
