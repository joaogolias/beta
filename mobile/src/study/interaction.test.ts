import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import {
  canAdvance,
  completedSwipe,
  createStudyGestureHandlers,
  createStudyInteraction,
  createStudyTapController,
  createStudyProjection,
  gestureRating,
  sessionProgress,
} from './interaction';

test('archived queue entries do not inflate the displayed study total or current card', () => {
  expect(
    sessionProgress({ total: 8, position: 5, skipped: 3, status: 'active' }),
  ).toEqual({
    total: 5,
    completed: 2,
    current: 3,
    percent: 40,
  });
  expect(
    sessionProgress({ total: 8, position: 8, skipped: 3, status: 'completed' }),
  ).toEqual({
    total: 5,
    completed: 5,
    current: 5,
    percent: 100,
  });
  expect(
    sessionProgress({ total: 0, position: 0, skipped: 0, status: 'active' })
      .current,
  ).toBe(0);
});

function create(revealed = false) {
  const reveal = vi.fn(async (): Promise<void> => undefined);
  const commit = vi.fn(async (): Promise<void> => undefined);
  const online = vi.fn(() => true);
  const blocked = vi.fn(() => false);
  return {
    reveal,
    commit,
    online,
    blocked,
    interaction: createStudyInteraction({
      revealed,
      reveal,
      commit,
      online,
      blocked,
      describeError: () => 'Não foi possível salvar.',
    }),
  };
}

describe('study card interaction', () => {
  test('requires a saved reveal, then a rating immediately saves and advances', async () => {
    const { interaction, reveal, commit } = create();
    expect(await interaction.advance('correct')).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(reveal).not.toHaveBeenCalled();
    await interaction.reveal();
    expect(reveal).toHaveBeenCalledOnce();
    expect(canAdvance(interaction.getSnapshot())).toBe(true);
    expect(interaction.getSnapshot().rating).toBeNull();
    expect(await interaction.advance('partial')).toBe(true);
    expect(commit).toHaveBeenCalledExactlyOnceWith('partial');
  });

  test('a rapid swipe and rating button commit once and wait for acknowledgment', async () => {
    const { interaction, commit } = create(true);
    let accept: () => void = () => undefined;
    commit.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    const first = interaction.advance('correct');
    expect(interaction.getSnapshot().phase).toBe('saving');
    expect(await interaction.advance('incorrect')).toBe(false);
    expect(interaction.getSnapshot().rating).toBe('correct');
    expect(commit).toHaveBeenCalledOnce();
    accept();
    expect(await first).toBe(true);
    expect(interaction.getSnapshot().phase).toBe('accepted');
    expect(await interaction.advance('partial')).toBe(false);
  });

  test('a failed save keeps the revealed card and allows a new gesture to retry', async () => {
    const { interaction, commit } = create(true);
    commit.mockRejectedValueOnce(new Error('network'));
    expect(await interaction.advance('partial')).toBe(false);
    expect(interaction.getSnapshot()).toEqual({
      phase: 'ready',
      rating: 'partial',
      error: 'Não foi possível salvar.',
    });
    expect(await interaction.advance('correct')).toBe(true);
    expect(commit.mock.calls).toEqual([['partial'], ['correct']]);
  });

  test('unavailable local storage and a failed reveal cannot expose or score the card', async () => {
    const { interaction, online, reveal, commit } = create();
    online.mockReturnValue(false);
    expect(await interaction.reveal()).toBe(false);
    expect(reveal).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    reveal.mockRejectedValueOnce(new Error('network'));
    expect(await interaction.reveal()).toBe(false);
    expect(await interaction.advance('correct')).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(interaction.getSnapshot().phase).toBe('front');
  });

  test('losing study availability before a swipe preserves the revealed card for retry', async () => {
    const { interaction, online, commit } = create(true);
    online.mockReturnValue(false);
    expect(await interaction.advance('partial')).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(interaction.getSnapshot().phase).toBe('ready');
    expect(interaction.getSnapshot().error).toContain('modo offline');
    online.mockReturnValue(true);
    expect(await interaction.advance('partial')).toBe(true);
    expect(commit).toHaveBeenCalledExactlyOnceWith('partial');
  });

  test('an external command blocks both revealing and rating until it finishes', async () => {
    const { interaction, blocked, reveal, commit } = create();
    blocked.mockReturnValue(true);
    expect(await interaction.reveal()).toBe(false);
    expect(reveal).not.toHaveBeenCalled();
    blocked.mockReturnValue(false);
    await interaction.reveal();
    blocked.mockReturnValue(true);
    expect(await interaction.advance('correct')).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    blocked.mockReturnValue(false);
    expect(await interaction.advance('correct')).toBe(true);
  });

  test('a pending reveal cannot be duplicated or rated early', async () => {
    const { interaction, reveal, commit } = create();
    let accept: () => void = () => undefined;
    reveal.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    const pending = interaction.reveal();
    expect(await interaction.reveal()).toBe(false);
    expect(await interaction.advance('partial')).toBe(false);
    expect(reveal).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
    accept();
    expect(await pending).toBe(true);
    expect(canAdvance(interaction.getSnapshot())).toBe(true);
  });

  test('a new presentation starts on the front and a resumed reveal is immediately eligible', () => {
    expect(create(false).interaction.getSnapshot()).toEqual({
      phase: 'front',
      rating: null,
      error: null,
    });
    expect(canAdvance(create(true).interaction.getSnapshot())).toBe(true);
  });
});

describe('study rating gestures', () => {
  function gesture(dx = 0, dy = 0): PanResponderGestureState {
    return {
      stateID: 1,
      moveX: dx,
      moveY: dy,
      x0: 0,
      y0: 0,
      dx,
      dy,
      vx: 0,
      vy: 0,
      numberActiveTouches: 1,
      _accountsForMovesUpTo: 0,
    };
  }
  const event = {} as GestureResponderEvent;
  test('leaves tap and vertical scrolling to Pressable and the page, and cancels any pending tap on drag', () => {
    const onCancelTap = vi.fn(),
      onAdvance = vi.fn();
    const handlers = createStudyGestureHandlers({
      canSwipe: () => true,
      onStart: vi.fn(),
      onMove: vi.fn(),
      onReset: vi.fn(),
      onAdvance,
      onCancelTap,
    });
    expect(
      handlers.onStartShouldSetPanResponderCapture?.(event, gesture()),
    ).toBe(false);
    expect(handlers.onStartShouldSetPanResponder?.(event, gesture())).toBe(
      false,
    );
    expect(
      handlers.onMoveShouldSetPanResponderCapture?.(event, gesture(0, 100)),
    ).toBe(false);
    expect(onCancelTap).toHaveBeenCalledOnce();
    handlers.onPanResponderRelease?.(event, gesture(0, 100));
    expect(onAdvance).not.toHaveBeenCalled();
  });

  test('captures a horizontal swipe, cancels tap detection and scores exactly once', async () => {
    const { interaction, commit } = create(true);
    const onCancelTap = vi.fn();
    const handlers = createStudyGestureHandlers({
      canSwipe: () => canAdvance(interaction.getSnapshot()),
      onStart: vi.fn(),
      onMove: vi.fn(),
      onReset: vi.fn(),
      onCancelTap,
      onAdvance: (rating) => {
        void interaction.advance(rating);
      },
    });
    handlers.onStartShouldSetPanResponderCapture?.(event, gesture());
    expect(
      handlers.onMoveShouldSetPanResponderCapture?.(event, gesture(20, 0)),
    ).toBe(true);
    handlers.onPanResponderGrant?.(event, gesture());
    expect(
      handlers.onPanResponderTerminationRequest?.(event, gesture(30, 0)),
    ).toBe(false);
    handlers.onPanResponderRelease?.(event, gesture(100, 0));
    handlers.onPanResponderRelease?.(event, gesture(100, 0));
    await Promise.resolve();
    expect(onCancelTap).toHaveBeenCalled();
    expect(commit).toHaveBeenCalledExactlyOnceWith('correct');
  });

  test('a second finger cancels until the next independent gesture', () => {
    const onAdvance = vi.fn();
    const handlers = createStudyGestureHandlers({
      canSwipe: () => true,
      onStart: vi.fn(),
      onMove: vi.fn(),
      onReset: vi.fn(),
      onAdvance,
    });
    handlers.onStartShouldSetPanResponderCapture?.(event, gesture());
    handlers.onPanResponderGrant?.(event, gesture());
    handlers.onPanResponderStart?.(event, {
      ...gesture(),
      numberActiveTouches: 2,
    });
    handlers.onPanResponderRelease?.(event, gesture(100, 0));
    expect(onAdvance).not.toHaveBeenCalled();
    handlers.onStartShouldSetPanResponderCapture?.(event, gesture());
    handlers.onPanResponderGrant?.(event, gesture());
    handlers.onPanResponderRelease?.(event, gesture(-100, 0));
    expect(onAdvance).toHaveBeenCalledExactlyOnceWith('incorrect');
  });

  test.each([
    [100, 4, 'correct'],
    [-100, 4, 'incorrect'],
  ] as const)(
    'rates direction (%s, %s) as %s without preselection',
    async (dx, dy, rating) => {
      const { interaction, commit } = create(true);
      expect(gestureRating(dx, dy)).toBe(rating);
      const completed = completedSwipe(dx, dy, 0, 0);
      expect(completed).toBe(rating);
      if (completed) await interaction.advance(completed);
      expect(commit).toHaveBeenCalledExactlyOnceWith(rating);
    },
  );

  test('uses a horizontal distance threshold or a deliberate flick in the same direction', () => {
    expect(gestureRating(12, 0)).toBeNull();
    expect(gestureRating(13, 0)).toBe('correct');
    expect(completedSwipe(87, 0, 0, 0)).toBeNull();
    expect(completedSwipe(88, 0, 0, 0)).toBe('correct');
    expect(completedSwipe(-88, 0, 0, 0)).toBe('incorrect');
    expect(completedSwipe(34, 0, 1, 0)).toBeNull();
    expect(completedSwipe(35, 0, 0.65, 0)).toBe('correct');
    expect(completedSwipe(-35, 0, -0.65, 0)).toBe('incorrect');
    expect(completedSwipe(35, 0, -0.8, 0)).toBeNull();
  });

  test('vertical, ambiguous, short and multiple-touch gestures never score', () => {
    for (const rating of [
      completedSwipe(0, -120, 0, -1),
      completedSwipe(0, 120, 0, 1),
      completedSwipe(0, 35, 0, 0.65),
      completedSwipe(100, 100, 1, 1),
      completedSwipe(-100, 100, -1, 1),
      completedSwipe(20, 1, 0.2, 0),
      completedSwipe(100, 0, 0, 0, 2),
    ])
      expect(rating).toBeNull();
  });
});

describe('single and double taps on the revealed card', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const { interaction, commit } = create(true);
    const eligible = vi.fn(() => canAdvance(interaction.getSnapshot()));
    const flip = vi.fn();
    const taps = createStudyTapController({
      eligible,
      onSingleTap: flip,
      onDoubleTap: () => {
        void interaction.advance('partial');
      },
    });
    return { interaction, commit, eligible, flip, taps };
  }

  test('one tap waits 250ms then flips without recording an answer', () => {
    const { taps, flip, commit } = setup();
    taps.tap();
    vi.advanceTimersByTime(249);
    expect(flip).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flip).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });

  test('a second quick tap replaces the pending flip with one partial answer', async () => {
    const { taps, flip, commit } = setup();
    taps.tap();
    vi.advanceTimersByTime(150);
    taps.tap();
    taps.tap();
    await vi.runAllTimersAsync();
    expect(commit).toHaveBeenCalledExactlyOnceWith('partial');
    expect(flip).not.toHaveBeenCalled();
  });

  test('canceling before a swipe, explicit flip, details or unmount prevents a delayed flip', () => {
    const { taps, flip, commit } = setup();
    taps.tap();
    vi.advanceTimersByTime(100);
    taps.cancel();
    vi.runAllTimers();
    expect(flip).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    taps.tap();
    vi.advanceTimersByTime(250);
    expect(flip).toHaveBeenCalledOnce();
  });

  test('front, modal or busy eligibility cancels delayed and subsequent taps', () => {
    const { taps, eligible, flip, commit } = setup();
    taps.tap();
    eligible.mockReturnValue(false);
    vi.runAllTimers();
    taps.tap();
    taps.tap();
    vi.runAllTimers();
    expect(flip).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  test('a rating button racing the delayed tap cancels its action through the same interaction lock', async () => {
    const { taps, interaction, flip, commit } = setup();
    taps.tap();
    await interaction.advance('correct');
    taps.tap();
    await vi.runAllTimersAsync();
    expect(commit).toHaveBeenCalledExactlyOnceWith('correct');
    expect(flip).not.toHaveBeenCalled();
  });
});

describe('study session projection', () => {
  function projection(
    position: number,
    status: 'active' | 'completed' | 'ended' = 'active',
    revealedAt?: number,
    revision = 0,
  ) {
    return {
      session: { position, status, revision },
      presentation: status === 'active' ? { revealedAt } : null,
    };
  }

  function createProjection() {
    return createStudyProjection<ReturnType<typeof projection>>();
  }

  test('holds the current card through acknowledgment and uses a newer query after the animation', () => {
    const state = createProjection();
    const current = projection(0, 'active', 100);
    const acknowledged = projection(1);
    const furtherAhead = projection(2);
    expect(state.receive(current)).toBe(current);
    state.beginAdvance();
    expect(state.receive(acknowledged)).toBe(current);
    state.acknowledge(acknowledged);
    expect(state.receive(furtherAhead)).toBe(current);
    expect(state.finishAdvance()).toBe(furtherAhead);
  });

  test('an older mutation result or query cannot undo a concurrently ended session', () => {
    const state = createProjection();
    const current = projection(0, 'active', 100);
    const acknowledged = projection(1);
    const ended = projection(1, 'ended');
    state.receive(current);
    state.beginAdvance();
    expect(state.receive(ended)).toBe(current);
    state.acknowledge(acknowledged);
    expect(state.finishAdvance()).toBe(ended);
    expect(state.receive(acknowledged)).toBe(ended);
  });

  test('queries lagging behind acknowledgment cannot restore the previous card before or after dismissal', () => {
    const state = createProjection();
    const current = projection(0, 'active', 100);
    const acknowledged = projection(1);
    state.receive(current);
    state.beginAdvance();
    state.acknowledge(acknowledged);
    expect(state.receive(current)).toBe(current);
    expect(state.finishAdvance()).toBe(acknowledged);
    expect(state.receive(current)).toBe(acknowledged);
    const revealed = projection(1, 'active', 200);
    expect(state.receive(revealed)).toBe(revealed);
    expect(state.receive(acknowledged)).toBe(revealed);
  });

  test('a rejected save keeps the same presentation unless the subscription has advanced', () => {
    const state = createProjection();
    const current = projection(0, 'active', 100);
    state.receive(current);
    state.beginAdvance();
    expect(state.finishAdvance()).toBe(current);
    state.beginAdvance();
    const advancedElsewhere = projection(1);
    state.receive(advancedElsewhere);
    expect(state.finishAdvance()).toBe(advancedElsewhere);
  });

  test('holds a completed session until an acknowledged new revision restores the previous card', () => {
    const state = createProjection();
    const completed = projection(3, 'completed', undefined, 1);
    const restored = projection(2, 'active', undefined, 2);
    state.receive(completed);
    state.beginAdvance();
    expect(state.receive(restored)).toBe(completed);
    state.acknowledge(restored);
    expect(state.finishAdvance()).toBe(restored);
    expect(state.getSnapshot()?.presentation?.revealedAt).toBeUndefined();
  });

  test('ignores an old revision even with a later position or revealed timestamp', () => {
    const state = createProjection();
    const restored = projection(2, 'active', undefined, 2);
    state.receive(restored);
    expect(state.receive(projection(3, 'completed', undefined, 1))).toBe(
      restored,
    );
    expect(state.receive(projection(2, 'active', 999, 1))).toBe(restored);
    state.beginAdvance();
    state.acknowledge(projection(3, 'active', 1000, 1));
    expect(state.finishAdvance()).toBe(restored);
  });
});
