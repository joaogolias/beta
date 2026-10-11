import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import { StudySession } from '../study/StudyScreens';

vi.mock('react-native', () => ({
  AccessibilityInfo: { announceForAccessibility: vi.fn() },
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('../offline/hooks', () => ({
  useQuery: () => projection,
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === 'study:rate' ? rate : finish,
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
  useOfflineStatus: () => ({ ready: true }),
}));
vi.mock('../study/StudyCard', () => ({ StudyCard: 'StudyCard' }));
vi.mock('../alphabet/DetailScreen', () => ({ Performance: 'Performance' }));
vi.mock('../brand/IbexMascot', () => ({ IbexMascot: 'IbexMascot' }));
function makeProjection(status: 'active' | 'completed' = 'active') {
  return {
    session: {
      _id: 'session',
      mode: 'direct',
      status,
      total: 100,
      answered: status === 'active' ? 99 : 100,
      position: status === 'active' ? 99 : 100,
      skipped: 0,
      correct: 99,
      incorrect: 0,
      partial: 0,
      revision: 0,
    },
    presentation:
      status === 'active' ? { _id: 'presentation', revealedAt: 1 } : null,
    undoPresentationId: 'previous',
  };
}
let projection = makeProjection();
let rate = vi.fn(async () => makeProjection('completed'));
let finish = vi.fn(async () => {});
let onCompleted = vi.fn();
let onExit = vi.fn();
let tree: ReactTestRenderer;
let counting = true;
const sessionId = 'session' as Id<'studySessions'>;
function content() {
  return (
    <StudySession
      sessionId={sessionId}
      onSettings={onExit}
      quest={{
        title: 'Percurso inteiro',
        total: 251,
        completed: 99,
        counting,
        onCompleted,
      }}
    />
  );
}
function card() {
  return tree.root.find((node) => String(node.type) === 'StudyCard');
}
function textContent() {
  return tree.root
    .findAll(
      (node) => typeof node.type === 'string' && String(node.type) === 'Text',
    )
    .map((node) => node.children.join(''))
    .join('\n');
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  projection = makeProjection();
  rate = vi.fn(async () => makeProjection('completed'));
  finish = vi.fn(async () => {});
  onCompleted = vi.fn();
  onExit = vi.fn();
  counting = true;
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    tree = create(content());
  });
}

test('advances a technical batch only after the last card exit finishes, without celebrating the partial quest', async () => {
  await mount();
  expect(textContent()).toContain('Card 100 de 251');
  await act(async () => card().props.onBusyChange(true));
  await act(async () => card().props.onCommit('correct'));
  projection = makeProjection('completed');
  await act(async () => tree.update(content()));
  expect(onCompleted).not.toHaveBeenCalled();
  expect(card()).toBeDefined();
  await act(async () => card().props.onAdvanceComplete());
  expect(onCompleted).toHaveBeenCalledOnce();
  expect(textContent()).toContain('Continuando sua quest');
  expect(textContent()).not.toContain('Boa prática');
  expect(textContent()).not.toContain('Quest concluída');
});
test('keeps expired practice usable without displaying a quest counter that no longer advances', async () => {
  counting = false;
  await mount();
  expect(card()).toBeDefined();
  expect(textContent()).not.toContain('Card 100 de 251');
  const end = tree.root.find(
    (node) =>
      typeof node.type === 'string' &&
      node.props.accessibilityLabel === 'Encerrar por hoje e voltar às quests',
  );
  await act(async () => end.props.onPress());
  expect(finish).toHaveBeenCalledWith({ sessionId });
  expect(onExit).toHaveBeenCalledOnce();
});
test('does not leave the practice if ending it fails to save', async () => {
  finish.mockRejectedValueOnce(
    new Error('Não foi possível salvar no aparelho.'),
  );
  await mount();
  const end = tree.root.find(
    (node) =>
      typeof node.type === 'string' &&
      node.props.accessibilityLabel === 'Encerrar por hoje e voltar às quests',
  );
  await act(async () => end.props.onPress());
  expect(onExit).not.toHaveBeenCalled();
  expect(textContent()).toContain('Não foi possível salvar no aparelho');
});
