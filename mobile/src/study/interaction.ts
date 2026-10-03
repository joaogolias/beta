import type { PanResponderCallbacks } from 'react-native';

export type StudyRating = 'incorrect' | 'partial' | 'correct';

/** Archived queue positions remain stable internally but do not count as work. */
export function sessionProgress(session: {
  total: number;
  position: number;
  skipped: number;
  status: 'active' | 'completed' | 'ended';
}) {
  const total = Math.max(0, session.total - session.skipped);
  const completed = Math.min(
    total,
    Math.max(0, session.position - session.skipped),
  );
  return {
    total,
    completed,
    current: Math.min(total, completed + (session.status === 'active' ? 1 : 0)),
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}
export type InteractionPhase =
  'front' | 'revealing' | 'ready' | 'saving' | 'accepted';
export interface InteractionState {
  phase: InteractionPhase;
  rating: StudyRating | null;
  error: string | null;
}

interface InteractionActions {
  online: () => boolean;
  blocked?: () => boolean;
  reveal: () => Promise<unknown>;
  commit: (rating: StudyRating) => Promise<unknown>;
}

export function canAdvance(state: InteractionState) {
  return state.phase === 'ready';
}

/** The neutral diagonal band prevents ambiguous movements from scoring a card. */
export function gestureRating(
  dx: number,
  dy: number,
  touches = 1,
): StudyRating | null {
  if (touches !== 1) return null;
  if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.35)
    return dx > 0 ? 'correct' : 'incorrect';
  return null;
}

export function completedSwipe(
  dx: number,
  dy: number,
  vx: number,
  _vy = 0,
  touches = 1,
) {
  const rating = gestureRating(dx, dy, touches);
  if (!rating) return null;
  const distance = Math.abs(dx);
  const velocity = vx * Math.sign(dx);
  return distance >= 88 || (distance >= 35 && velocity >= 0.65) ? rating : null;
}

/** One tap flips; a second tap within the window replaces it with partial. */
export function createStudyTapController({
  eligible,
  onSingleTap,
  onDoubleTap,
  delayMs = 250,
}: {
  eligible: () => boolean;
  onSingleTap: () => void;
  onDoubleTap: () => void;
  delayMs?: number;
}) {
  let pending: ReturnType<typeof setTimeout> | undefined;
  function cancel() {
    if (pending !== undefined) clearTimeout(pending);
    pending = undefined;
  }
  return {
    cancel,
    tap() {
      if (!eligible()) {
        cancel();
        return;
      }
      if (pending !== undefined) {
        cancel();
        onDoubleTap();
      } else {
        pending = setTimeout(() => {
          pending = undefined;
          if (eligible()) onSingleTap();
        }, delayMs);
      }
    },
  };
}

/** Owns one touch sequence, including responder negotiation with scrolling. */
export function createStudyGestureHandlers({
  canSwipe,
  onStart,
  onMove,
  onReset,
  onAdvance,
  onCancelTap,
}: {
  canSwipe: () => boolean;
  onStart: () => void;
  onMove: (
    dx: number,
    dy: number,
    rating: StudyRating | null,
    ready: boolean,
  ) => void;
  onReset: () => void;
  onAdvance: (rating: StudyRating) => void;
  onCancelTap?: () => void;
}): PanResponderCallbacks {
  let multiTouch = false;
  let owned = false;
  return {
    onStartShouldSetPanResponderCapture: (event, gesture) => {
      // Before grant, RN's gesture touch count can lag behind the native event.
      const touches =
        event.nativeEvent?.touches?.length ?? gesture.numberActiveTouches;
      multiTouch = touches > 1;
      if (multiTouch) onCancelTap?.();
      return false;
    },
    // The nested Pressable owns taps; vertical gestures belong to the page.
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, gesture) => {
      if (gesture.numberActiveTouches > 1) multiTouch = true;
      if (Math.abs(gesture.dx) > 12 || Math.abs(gesture.dy) > 12 || multiTouch)
        onCancelTap?.();
      return (
        canSwipe() &&
        !multiTouch &&
        gestureRating(gesture.dx, gesture.dy, gesture.numberActiveTouches) !==
          null
      );
    },
    onPanResponderGrant: () => {
      owned = true;
      onCancelTap?.();
      onStart();
    },
    onPanResponderStart: (_, gesture) => {
      if (gesture.numberActiveTouches > 1) {
        multiTouch = true;
        onCancelTap?.();
        onReset();
      }
    },
    onPanResponderMove: (_, gesture) => {
      if (gesture.numberActiveTouches > 1) multiTouch = true;
      if (!canSwipe() || multiTouch) return;
      onMove(
        gesture.dx,
        gesture.dy,
        gestureRating(gesture.dx, gesture.dy),
        completedSwipe(gesture.dx, gesture.dy, gesture.vx, gesture.vy) !== null,
      );
    },
    onPanResponderRelease: (_, gesture) => {
      owned = false;
      const eligible = canSwipe() && !multiTouch;
      const rating = !eligible
        ? null
        : completedSwipe(gesture.dx, gesture.dy, gesture.vx, gesture.vy);
      if (rating) onAdvance(rating);
      else onReset();
    },
    onPanResponderTerminate: () => {
      owned = false;
      onCancelTap?.();
      onReset();
    },
    onPanResponderTerminationRequest: () => !owned || !canSwipe() || multiTouch,
    onShouldBlockNativeResponder: () => canSwipe() && !multiTouch,
  };
}

interface StudyProjectionProgress {
  session: {
    position: number;
    status: 'active' | 'completed' | 'ended';
    revision?: number;
  };
  presentation: { revealedAt?: number } | null;
}

/** Coordinates the subscription and mutation result for one study session. */
export function createStudyProjection<
  Projection extends StudyProjectionProgress,
>() {
  let latest: Projection | undefined;
  let visible: Projection | undefined;
  let advancing = false;
  const listeners = new Set<() => void>();

  function publish() {
    if (visible === latest) return;
    visible = latest;
    for (const listener of listeners) listener();
  }

  function observe(next: Projection | undefined) {
    if (!next) return;
    if (latest) {
      const revision = next.session.revision ?? 0;
      const latestRevision = latest.session.revision ?? 0;
      if (revision < latestRevision) return;
      // An undo starts a new revision and may rewind even a completed session.
      if (revision > latestRevision) {
        latest = next;
        return;
      }
      // Within one revision, delayed subscriptions must never rewind a card.
      if (
        latest.session.status !== 'active' &&
        next.session.status === 'active'
      )
        return;
      if (next.session.position < latest.session.position) return;
      if (
        next.session.position === latest.session.position &&
        next.session.status === 'active' &&
        (next.presentation?.revealedAt ?? 0) <
          (latest.presentation?.revealedAt ?? 0)
      )
        return;
    }
    latest = next;
  }

  return {
    getSnapshot: () => visible,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    receive(next: Projection | undefined) {
      observe(next);
      if (!advancing) publish();
      return visible;
    },
    beginAdvance() {
      advancing = true;
    },
    acknowledge(next: Projection) {
      observe(next);
    },
    finishAdvance() {
      advancing = false;
      publish();
      return visible;
    },
  };
}

/** One presentation owns one interaction; a swipe or button submits its rating. */
export function createStudyInteraction({
  revealed = false,
  online,
  blocked,
  reveal,
  commit,
  describeError,
}: {
  revealed?: boolean;
  online: () => boolean;
  blocked?: () => boolean;
  reveal: () => Promise<unknown>;
  commit: (rating: StudyRating) => Promise<unknown>;
  describeError: (cause: unknown) => string;
}) {
  let state: InteractionState = {
    phase: revealed ? 'ready' : 'front',
    rating: null,
    error: null,
  };
  let actions: InteractionActions = { online, blocked, reveal, commit };
  const listeners = new Set<() => void>();
  function update(next: InteractionState) {
    state = next;
    for (const listener of listeners) listener();
  }
  function connected() {
    if (actions.online()) return true;
    update({
      ...state,
      error:
        'Aguarde a conexão ou ative o modo offline na engrenagem. Seu card continua aqui.',
    });
    return false;
  }
  return {
    setActions(next: InteractionActions) {
      actions = next;
    },
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    syncRevealed() {
      if (state.phase === 'front')
        update({ ...state, phase: 'ready', error: null });
    },
    async reveal() {
      if (state.phase !== 'front' || actions.blocked?.() || !connected())
        return false;
      update({ ...state, phase: 'revealing', error: null });
      try {
        await actions.reveal();
        update({ ...state, phase: 'ready' });
        return true;
      } catch (cause) {
        update({ ...state, phase: 'front', error: describeError(cause) });
        return false;
      }
    },
    async advance(rating: StudyRating) {
      if (!canAdvance(state) || actions.blocked?.() || !connected())
        return false;
      // Lock synchronously, before awaiting the mutation: repeated gestures and
      // the accessible rating buttons cannot submit this presentation twice.
      update({ ...state, rating, phase: 'saving', error: null });
      try {
        await actions.commit(rating);
        update({ ...state, phase: 'accepted' });
        return true;
      } catch (cause) {
        update({ ...state, phase: 'ready', error: describeError(cause) });
        return false;
      }
    },
  };
}
