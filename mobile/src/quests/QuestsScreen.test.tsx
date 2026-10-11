import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { QuestSnapshot } from '../../../shared/quests';
import { QuestsEntry, QuestsScreen } from './QuestsScreen';
import { mergeQuestHistory, relativeQuestTime } from './presentation';
import { palette } from '../theme';

vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('../offline/hooks', () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === 'quests:snapshot' ? snapshot : active,
  useMutation: () => start,
  useOfflineStatus: () => offline,
  usePaginatedQuery: (_ref: unknown, args: unknown) => {
    pageArgs = args;
    return history;
  },
}));
vi.mock('../brand/IbexMascot', () => ({ IbexMascot: 'IbexMascot' }));
const now = Date.parse('2026-10-10T01:00:00Z');
function quest(patch: Partial<QuestSnapshot> = {}): QuestSnapshot {
  return {
    id: 'quest-one',
    title: 'Primeira subida',
    startsAt: now - 60_000,
    dueAt: now + 3_600_000,
    timeZone: 'America/Sao_Paulo',
    createdAt: now - 120_000,
    updatedAt: now,
    cardIds: ['kanji-1', 'kotoba-1', 'bunpou-1'],
    paperIds: [],
    completedCardIds: [],
    completedPaperIds: [],
    ...patch,
  };
}
let snapshot: { quests: QuestSnapshot[]; hasMoreHistory: boolean } | undefined;
let active: { questId: string } | null;
let offline: { online: boolean; offlineMode: boolean; pending: number };
let history: {
  results: QuestSnapshot[];
  status: 'LoadingFirstPage' | 'LoadingMore' | 'CanLoadMore' | 'Exhausted';
  loadMore: ReturnType<typeof vi.fn>;
};
let pageArgs: unknown;
let tree: ReactTestRenderer;
let start = vi.fn(async (_args: { id: string }) => ({
  kind: 'study' as const,
  sessionId: 'exact-session',
}));
let onStarted = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.setSystemTime(now);
  snapshot = { quests: [quest()], hasMoreHistory: false };
  active = null;
  offline = { online: true, offlineMode: false, pending: 0 };
  history = { results: [], status: 'Exhausted', loadMore: vi.fn() };
  start = vi.fn(async (_args: { id: string }) => ({
    kind: 'study' as const,
    sessionId: 'exact-session',
  }));
  onStarted = vi.fn();
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    tree = create(<QuestsScreen onStarted={onStarted} />);
  });
}
function textContent() {
  return tree.root
    .findAll(
      (node) => typeof node.type === 'string' && String(node.type) === 'Text',
    )
    .map((node) => node.children.join(''))
    .join('\n');
}
function button(label: string) {
  return tree.root.find(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label,
  );
}

test('opens quests from its accessible entry', async () => {
  const onPress = vi.fn();
  await act(async () => {
    tree = create(<QuestsEntry onPress={onPress} />);
  });
  await act(async () => button('Abrir quests').props.onPress());
  expect(onPress).toHaveBeenCalledOnce();
});

function expectEntry(complete: boolean, caption: string) {
  const entry = button('Abrir quests');
  const style = Object.assign({}, ...entry.props.style({ pressed: false }));
  expect(style.backgroundColor).toBe(
    complete ? palette.primary : palette.secondary,
  );
  expect(
    tree.root.findByProps({ mood: complete ? 'rest' : 'angry' }),
  ).toBeDefined();
  expect(entry.props.accessibilityHint).toBe(caption);
  expect(textContent()).toContain(caption);
}

test('changes the shortcut only after every available quest is completed and reopens it for a new quest', async () => {
  snapshot!.quests = [quest(), quest({ id: 'second', completedAt: now })];
  await act(async () => {
    tree = create(<QuestsEntry onPress={vi.fn()} />);
  });
  expectEntry(false, '1 quest para concluir');

  snapshot!.quests[0].completedCardIds = ['kanji-1', 'kotoba-1'];
  await act(async () => tree.update(<QuestsEntry onPress={vi.fn()} />));
  expectEntry(false, '1 quest para concluir');

  snapshot!.quests[0].completedAt = now;
  await act(async () => tree.update(<QuestsEntry onPress={vi.fn()} />));
  expectEntry(true, 'Todas concluídas. Bom descanso!');

  snapshot!.quests.push(quest({ id: 'new-quest' }));
  await act(async () => tree.update(<QuestsEntry onPress={vi.fn()} />));
  expectEntry(false, '1 quest para concluir');
});

test.each([
  { label: 'loading', value: undefined, caption: 'Seus desafios de estudo' },
  { label: 'empty', value: [], caption: 'Nenhuma quest disponível' },
  {
    label: 'expired completed history',
    value: [quest({ dueAt: now, completedAt: now - 1000 })],
    caption: 'Nenhuma quest disponível',
  },
  {
    label: 'cancelled',
    value: [quest({ cancelledAt: now })],
    caption: 'Nenhuma quest disponível',
  },
  {
    label: 'future',
    value: [quest({ startsAt: now + 1000 })],
    caption: 'Novas quests em breve',
  },
])(
  'does not claim all quests completed for $label',
  async ({ value, caption }) => {
    snapshot =
      value === undefined ? undefined : { quests: value, hasMoreHistory: true };
    await act(async () => {
      tree = create(<QuestsEntry onPress={vi.fn()} />);
    });
    expectEntry(false, caption);
  },
);

test('ignores expired, cancelled and scheduled quests when available quests are done, including offline history', async () => {
  offline = { online: false, offlineMode: true, pending: 0 };
  snapshot = {
    hasMoreHistory: true,
    quests: [
      quest({ completedAt: now }),
      quest({ id: 'expired', dueAt: now }),
      quest({ id: 'cancelled', cancelledAt: now }),
      quest({ id: 'future', startsAt: now + 1000 }),
    ],
  };
  await act(async () => {
    tree = create(<QuestsEntry onPress={vi.fn()} />);
  });
  expectEntry(true, 'Todas concluídas. Bom descanso!');

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expectEntry(false, '1 quest para concluir');
  expect(start).not.toHaveBeenCalled();
});

test('does not turn an expired final quest into a completed shortcut', async () => {
  snapshot!.quests = [quest({ dueAt: now + 1000 })];
  await act(async () => {
    tree = create(<QuestsEntry onPress={vi.fn()} />);
  });
  expectEntry(false, '1 quest para concluir');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expectEntry(false, 'Nenhuma quest disponível');
});
test('distinguishes loading and the empty state without creating examples', async () => {
  snapshot = undefined;
  await mount();
  expect(textContent()).toContain('Abrindo suas quests');
  snapshot = { quests: [], hasMoreHistory: false };
  await act(async () => tree.update(<QuestsScreen onStarted={onStarted} />));
  expect(textContent()).toContain('Peça ao GPT uma quest');
  expect(start).not.toHaveBeenCalled();
});
test('keeps cards compact and starts the exact quest directly without preferences or per-type limits', async () => {
  snapshot!.quests = [
    quest({
      cardIds: Array.from({ length: 240 }, (_, index) => 'card-' + index),
    }),
  ];
  await mount();
  const card = tree.root.findByProps({ testID: 'quest-quest-one' });
  expect(
    card.findAllByProps({ accessibilityRole: 'progressbar' }),
  ).toHaveLength(0);
  expect(
    card.findAllByProps({ accessibilityRole: 'header' })[0].props.children,
  ).toBe('Primeira subida');
  expect(textContent()).toContain(
    'Primeira subida\nCriada em 09/10/2026\nExpira em 1 h\nComeçar',
  );
  await act(async () => button('Começar: Primeira subida').props.onPress());
  expect(start).toHaveBeenCalledExactlyOnceWith({ id: 'quest-one' });
  expect(onStarted).toHaveBeenCalledWith('quest-one', {
    kind: 'study',
    sessionId: 'exact-session',
  });
});
test('supports several quests and continues saved selections or a just-started active quest', async () => {
  snapshot!.quests = [
    quest({ completedCardIds: ['kanji-1'] }),
    quest({ id: 'second', title: 'Segunda subida' }),
  ];
  active = { questId: 'second' };
  await mount();
  expect(button('Continuar: Primeira subida')).toBeDefined();
  await act(async () => button('Continuar: Segunda subida').props.onPress());
  expect(start).toHaveBeenCalledWith({ id: 'second' });
});
test('serializes taps across different quests until starting completes', async () => {
  let resolve!: (run: { kind: 'study'; sessionId: string }) => void;
  start = vi.fn(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  snapshot!.quests.push(quest({ id: 'second', title: 'Segunda subida' }));
  await mount();
  await act(async () => {
    button('Começar: Primeira subida').props.onPress();
    button('Começar: Segunda subida').props.onPress();
  });
  expect(start).toHaveBeenCalledOnce();
  expect(button('Começar: Segunda subida').props.disabled).toBe(true);
  await act(async () => resolve({ kind: 'study', sessionId: 'exact-session' }));
  expect(onStarted).toHaveBeenCalledOnce();
});
test('shows missing-card errors and permits retry without selecting substitute cards', async () => {
  start.mockRejectedValueOnce(
    new Error(
      'Um card desta quest está arquivado. Restaure o card para continuar.',
    ),
  );
  await mount();
  await act(async () => button('Começar: Primeira subida').props.onPress());
  expect(textContent()).toContain('Um card desta quest está arquivado');
  expect(onStarted).not.toHaveBeenCalled();
  await act(async () => button('Começar: Primeira subida').props.onPress());
  expect(start.mock.calls).toEqual([
    [{ id: 'quest-one' }],
    [{ id: 'quest-one' }],
  ]);
});
test('only shows Concluída for whole-quest completion, not a partial selection', async () => {
  snapshot!.quests = [
    quest({ completedCardIds: ['kanji-1'] }),
    quest({
      id: 'done',
      title: 'Travessia',
      completedCardIds: quest().cardIds,
      completedAt: now,
    }),
  ];
  await mount();
  expect(button('Continuar: Primeira subida').props.disabled).toBe(false);
  expect(textContent()).not.toContain('Travessia');
  await act(async () => button('Concluídas').props.onPress());
  expect(button('Concluída: Travessia').props.disabled).toBe(true);
  expect(textContent()).not.toContain('Primeira subida');
});
test('defaults to active and moves a newly completed quest to completed without mixing lists', async () => {
  await mount();
  expect(button('Ativas').props.accessibilityState.selected).toBe(true);
  expect(button('Concluídas').props.accessibilityState.selected).toBe(false);
  snapshot!.quests[0] = quest({ completedAt: now });
  await act(async () => tree.update(<QuestsScreen onStarted={onStarted} />));
  expect(textContent()).toContain('Nenhuma quest ativa agora');
  expect(textContent()).not.toContain('Primeira subida');
  await act(async () => button('Concluídas').props.onPress());
  expect(button('Concluídas').props.accessibilityState.selected).toBe(true);
  expect(button('Concluída: Primeira subida').props.disabled).toBe(true);
  await act(async () => button('Ativas').props.onPress());
  expect(textContent()).not.toContain('Primeira subida');
  expect(pageArgs).toBe('skip');
});
test('separates upcoming quests and makes them available at their start without leaving active', async () => {
  snapshot!.quests = [quest({ startsAt: now + 1000 })];
  await mount();
  expect(textContent()).toContain('Nenhuma quest ativa agora');
  expect(button('Em breve: Primeira subida').props.disabled).toBe(true);
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  expect(textContent()).not.toContain('Nenhuma quest ativa agora');
  expect(textContent()).not.toContain('Em breve');
  expect(button('Começar: Primeira subida').props.disabled).toBe(false);
  expect(pageArgs).toBe('skip');
});
test.each([{ startsAt: now + 30_000 }, { dueAt: now }, { cancelledAt: now }])(
  'does not start a quest outside its window (%s)',
  async (patch) => {
    snapshot!.quests = [quest(patch)];
    await mount();
    if ('dueAt' in patch || 'cancelledAt' in patch) {
      await act(async () => button('Concluídas').props.onPress());
      await act(async () => button('Encerradas').props.onPress());
    }
    const label =
      'cancelledAt' in patch
        ? 'Cancelada'
        : 'dueAt' in patch
          ? 'Encerrada'
          : 'Em breve';
    expect(button(`${label}: Primeira subida`).props.disabled).toBe(true);
    expect(start).not.toHaveBeenCalled();
  },
);
test('moves an expired quest out of active into closed history at the exact deadline without synchronizing', async () => {
  snapshot!.quests = [quest({ dueAt: now + 1_000 })];
  await mount();
  expect(textContent()).toContain('Expira em menos de 1 min');
  await act(async () => {
    vi.advanceTimersByTime(1_000);
  });
  expect(textContent()).toContain('Nenhuma quest ativa agora');
  expect(textContent()).not.toContain('Primeira subida');
  await act(async () => button('Concluídas').props.onPress());
  expect(textContent()).toContain('Nenhuma quest concluída ainda');
  await act(async () => button('Encerradas').props.onPress());
  expect(textContent()).toContain('Prazo encerrado');
  expect(button('Encerrada: Primeira subida').props.disabled).toBe(true);
  expect(start).not.toHaveBeenCalled();
});
test('formats arbitrary relative deadlines', () => {
  expect(relativeQuestTime(quest({ dueAt: now + 5 * 60_000 }), now)).toBe(
    'Expira em 5 min',
  );
  expect(relativeQuestTime(quest({ dueAt: now + 49 * 3_600_000 }), now)).toBe(
    'Expira em 3 dias',
  );
});
test('keeps the completion day in the quest timezone after expiry', () => {
  const completed = quest({ completedAt: now, dueAt: now + 1 });
  expect(relativeQuestTime(completed, now + 60_000)).toBe('Concluída hoje');
  expect(relativeQuestTime(completed, now + 86_400_000)).toBe(
    'Concluída em 09/10',
  );
});
test('requests and paginates older quests only on demand', async () => {
  snapshot!.hasMoreHistory = true;
  history.status = 'CanLoadMore';
  history.results = [quest({ id: 'old', title: 'Anterior', completedAt: now })];
  await mount();
  expect(pageArgs).toBe('skip');
  expect(textContent()).not.toContain('Anterior');
  await act(async () => button('Concluídas').props.onPress());
  expect(pageArgs).toBe('skip');
  await act(async () => button('Consultar histórico completo').props.onPress());
  expect(pageArgs).toEqual({ status: 'all' });
  expect(textContent()).toContain('Anterior');
  await act(async () => button('Ver mais quests').props.onPress());
  expect(history.loadMore).toHaveBeenCalledWith(20);
});
test('keeps truncated history explicit and respects the offline choice', async () => {
  snapshot!.hasMoreHistory = true;
  snapshot!.quests = [quest({ completedAt: now })];
  offline.offlineMode = true;
  await mount();
  await act(async () => button('Concluídas').props.onPress());
  expect(button('Consultar histórico completo').props.disabled).toBe(true);
  expect(textContent()).toContain('Histórico recente salvo neste aparelho');
  expect(button('Concluída: Primeira subida')).toBeDefined();
  expect(pageArgs).toBe('skip');
});

test('distinguishes incomplete history from empty completed history, paginates once, and keeps closed quests separate', async () => {
  snapshot!.hasMoreHistory = true;
  history.status = 'LoadingFirstPage';
  await mount();
  await act(async () => button('Concluídas').props.onPress());
  expect(textContent()).toContain(
    'Nenhuma quest concluída no histórico recente',
  );
  await act(async () => button('Consultar histórico completo').props.onPress());
  expect(pageArgs).toEqual({ status: 'all' });
  expect(textContent()).toContain('Consultando histórico');
  expect(textContent()).not.toContain('Nenhuma quest concluída');

  const expired = quest({
    id: 'expired',
    title: 'Prazo antigo',
    dueAt: now - 1000,
  });
  const cancelled = quest({
    id: 'cancelled',
    title: 'Cancelamento antigo',
    cancelledAt: now - 1000,
  });
  history = {
    ...history,
    status: 'CanLoadMore',
    results: [expired, cancelled],
  };
  await act(async () => tree.update(<QuestsScreen onStarted={onStarted} />));
  expect(textContent()).toContain(
    'Nenhuma quest concluída nas quests consultadas',
  );
  expect(textContent()).not.toContain('Prazo antigo');
  expect(textContent()).not.toContain('Cancelamento antigo');
  await act(async () => button('Encerradas').props.onPress());
  expect(button('Encerrada: Prazo antigo').props.disabled).toBe(true);
  expect(button('Cancelada: Cancelamento antigo').props.disabled).toBe(true);
  await act(async () => button('Ver mais quests').props.onPress());
  expect(history.loadMore).toHaveBeenCalledExactlyOnceWith(20);

  const completed = quest({ completedAt: now });
  snapshot!.quests = [completed];
  history = {
    ...history,
    status: 'Exhausted',
    results: [expired, cancelled, completed],
  };
  await act(async () => tree.update(<QuestsScreen onStarted={onStarted} />));
  expect(tree.root.findAllByProps({ testID: 'quest-quest-one' })).toHaveLength(
    1,
  );
  expect(textContent()).not.toContain('Nenhuma quest concluída');
  await act(async () => button('Ativas').props.onPress());
  expect(textContent()).not.toContain('Primeira subida');
  expect(pageArgs).toEqual({ status: 'all' });
  await act(async () => button('Concluídas').props.onPress());
  expect(button('Concluída: Primeira subida')).toBeDefined();
  expect(history.loadMore).toHaveBeenCalledOnce();
});

test('only claims no completed quests after the requested history is exhausted', async () => {
  snapshot!.hasMoreHistory = true;
  history.status = 'Exhausted';
  history.results = [quest({ id: 'expired', dueAt: now - 1000 })];
  await mount();
  await act(async () => button('Concluídas').props.onPress());
  expect(textContent()).toContain('no histórico recente');
  await act(async () => button('Consultar histórico completo').props.onPress());
  expect(textContent()).toContain('Nenhuma quest concluída ainda');
  expect(textContent()).not.toContain('no histórico recente');
});
test('keeps history marked as recent while pending writes make the hook fall back to local pages', async () => {
  snapshot!.hasMoreHistory = true;
  offline.pending = 1;
  history.status = 'Exhausted';
  await mount();
  await act(async () => button('Concluídas').props.onPress());
  expect(button('Consultar histórico completo').props.disabled).toBe(true);
  expect(textContent()).toContain(
    'Nenhuma quest concluída no histórico recente',
  );
  expect(textContent()).toContain('após sincronizar as atividades pendentes');
  expect(pageArgs).toBe('skip');

  offline.pending = 0;
  history.status = 'LoadingFirstPage';
  await act(async () => tree.update(<QuestsScreen onStarted={onStarted} />));
  expect(button('Consultar histórico completo').props.disabled).toBe(false);
  await act(async () => button('Consultar histórico completo').props.onPress());
  expect(textContent()).toContain('Consultando histórico');
  expect(pageArgs).toEqual({ status: 'all' });

  offline.pending = 1;
  history.status = 'Exhausted';
  await act(async () => tree.update(<QuestsScreen onStarted={onStarted} />));
  expect(textContent()).toContain(
    'Nenhuma quest concluída no histórico recente',
  );
  expect(textContent()).not.toContain('Nenhuma quest concluída ainda');
  expect(textContent()).not.toContain('Consultando histórico');

  offline.pending = 0;
  history.results = [
    quest({
      id: 'old-completion',
      title: 'Conquista antiga',
      completedAt: now - 86_400_000,
    }),
  ];
  await act(async () => tree.update(<QuestsScreen onStarted={onStarted} />));
  expect(button('Concluída: Conquista antiga')).toBeDefined();
  expect(textContent()).not.toContain(
    'após sincronizar as atividades pendentes',
  );
});

test('keeps the latest completion above older history even if its deadline was later', async () => {
  snapshot!.quests = [
    quest({
      id: 'old',
      title: 'Conquista antiga',
      dueAt: now - 86_400_000,
      completedAt: now - 172_800_000,
    }),
    quest({ id: 'today', title: 'Conquista de hoje', completedAt: now }),
  ];
  await mount();
  await act(async () => button('Concluídas').props.onPress());
  const text = textContent();
  expect(text.indexOf('Conquista de hoje')).toBeLessThan(
    text.indexOf('Conquista antiga'),
  );
});
test('server delivery and completion win equal timestamps, while newer local credit is retained', () => {
  const cached = quest({ completedCardIds: ['kanji-1'] });
  const remote = quest({ completedCardIds: quest().cardIds, completedAt: now });
  expect(mergeQuestHistory([cached], [remote])[0]).toEqual(remote);
  expect(
    mergeQuestHistory([{ ...cached, updatedAt: now + 1 }], [remote])[0]
      .completedAt,
  ).toBeUndefined();
});
