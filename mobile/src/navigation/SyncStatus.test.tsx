import { createElement, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { useOfflineStatus } from '../offline/hooks';
import { SyncStatus } from './SyncStatus';

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Modal: ({
    visible,
    children,
    ...props
  }: {
    visible: boolean;
    children: ReactNode;
  }) => (visible ? createElement('Modal', props, children) : null),
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  SafeAreaView: 'SafeAreaView',
}));
vi.mock('../offline/hooks', () => ({ useOfflineStatus: () => status }));

type Status = ReturnType<typeof useOfflineStatus>;
let status: Status;
let tree: ReactTestRenderer;
const refresh = vi.fn<() => Promise<void>>();
const setOfflineMode = vi.fn<(enabled: boolean) => Promise<void>>();
const resolveConflict = vi.fn<(choice: 'device' | 'cloud') => Promise<void>>();
const lastSyncedAt = Date.UTC(2026, 9, 4, 12, 30);
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  refresh.mockReset().mockResolvedValue(undefined);
  setOfflineMode.mockReset().mockResolvedValue(undefined);
  resolveConflict.mockReset().mockResolvedValue(undefined);
  status = {
    resetVersion: 0,
    ready: true,
    online: true,
    offlineMode: false,
    switchingMode: false,
    modeError: null,
    pending: 0,
    syncing: false,
    error: null,
    conflict: null,
    lastSyncedAt,
    refresh,
    flushPending: vi.fn(async () => undefined),
    setOfflineMode,
    resolveConflict,
    retry: vi.fn(),
    assertCanEditLibrary: vi.fn(),
  };
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    tree = create(<SyncStatus />);
  });
}
async function update(change: Partial<Status>) {
  status = { ...status, ...change };
  await act(async () => tree.update(<SyncStatus />));
}
function indicator() {
  return tree.root.findByProps({ testID: 'sync-status-indicator' });
}
function button(label: string) {
  return tree.root.findByProps({ accessibilityLabel: label });
}
function modals() {
  return hosts('Modal');
}
function hosts(name: string, root = tree.root) {
  return root.findAll((node) => node.type === name);
}
function text() {
  return JSON.stringify(tree.toJSON());
}
async function open() {
  await act(async () => indicator().props.onPress());
}

test.each<{ change: Partial<Status>; label: string; symbol: string }>([
  { change: {}, label: 'Tudo sincronizado', symbol: '✓' },
  { change: { ready: false }, label: 'Preparando biblioteca', symbol: '↻' },
  { change: { pending: 3 }, label: '3 atividades pendentes', symbol: '↻' },
  { change: { syncing: true }, label: 'Sincronizando', symbol: '↻' },
  { change: { switchingMode: true }, label: 'Sincronizando', symbol: '↻' },
  { change: { offlineMode: true }, label: 'Modo offline', symbol: '↻' },
  { change: { online: false }, label: 'Sem conexão', symbol: '↻' },
  {
    change: { lastSyncedAt: null },
    label: 'Aguardando primeira sincronização',
    symbol: '↻',
  },
  {
    change: { error: 'Falha de conexão' },
    label: 'Erro de sincronização',
    symbol: '!',
  },
  {
    change: { modeError: 'Não foi possível voltar online' },
    label: 'Erro de sincronização',
    symbol: '!',
  },
  {
    change: {
      conflict: { message: 'Versões diferentes', kind: 'card', canForce: true },
    },
    label: 'Conflito de sincronização',
    symbol: '!',
  },
])(
  'shows $label as a compact indicator without opening a modal',
  async ({ change, label, symbol }) => {
    status = { ...status, ...change };
    await mount();
    expect(indicator().props.accessibilityLabel).toBe(
      `Sincronização: ${label}. Ver detalhes`,
    );
    expect(indicator().props.style({ pressed: false })[0]).toMatchObject({
      width: 44,
      height: 44,
      flexShrink: 0,
    });
    expect(hosts('Text', indicator())[0].props.children).toBe(symbol);
    expect(modals()).toHaveLength(0);
    expect(refresh).not.toHaveBeenCalled();
    expect(setOfflineMode).not.toHaveBeenCalled();
  },
);

test('updates color and symbol across sync states without changing layout or opening details', async () => {
  await mount();
  const layout = indicator().props.style({ pressed: false })[0];
  const color = () =>
    hosts('View', indicator())[0].props.style[1].backgroundColor;
  const green = color();
  await update({ pending: 2 });
  const yellow = color();
  expect(yellow).not.toBe(green);
  await update({ syncing: true });
  expect(color()).toBe(yellow);
  await update({
    syncing: false,
    pending: 0,
    lastSyncedAt: lastSyncedAt + 1000,
  });
  expect(color()).toBe(green);
  await update({ error: 'Servidor indisponível', online: false });
  expect(color()).not.toBe(green);
  expect(color()).not.toBe(yellow);
  expect(indicator().props.style({ pressed: false })[0]).toEqual(layout);
  expect(modals()).toHaveLength(0);
});

test('details show last update and pending work only after tapping, and can be dismissed', async () => {
  status.pending = 2;
  await mount();
  await open();
  expect(modals()).toHaveLength(1);
  expect(text()).toContain('Última sincronização');
  expect(text()).toContain(
    new Date(lastSyncedAt).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }),
  );
  expect(text()).toContain('2 atividades pendentes');
  expect(button('Sincronizar agora').props.disabled).toBe(false);
  await act(async () => button('Fechar sincronização').props.onPress());
  expect(modals()).toHaveLength(0);
  expect(refresh).not.toHaveBeenCalled();
});

test('manual refresh awaits its promise, blocks duplicate taps and does not reopen a closed modal', async () => {
  let finish!: () => void;
  refresh.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  await open();
  const press = button('Atualizar agora').props.onPress;
  await act(async () => {
    press();
    press();
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(button('Atualizar agora').props.disabled).toBe(true);
  expect(indicator().props.accessibilityLabel).toContain('Sincronizando');
  await act(async () => button('Fechar sincronização').props.onPress());
  await act(async () => finish());
  expect(modals()).toHaveLength(0);
  expect(indicator().props.accessibilityLabel).toContain('Tudo sincronizado');
});

test('a rejected refresh is visible in details and the indicator, then clears on successful retry', async () => {
  refresh.mockRejectedValueOnce(new Error('A conexão caiu. Tente novamente.'));
  await mount();
  await open();
  await act(async () => button('Atualizar agora').props.onPress());
  expect(text()).toContain('A conexão caiu. Tente novamente.');
  expect(indicator().props.accessibilityLabel).toContain(
    'Erro de sincronização',
  );
  expect(button('Atualizar agora').props.disabled).toBe(false);
  await act(async () => button('Atualizar agora').props.onPress());
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(text()).not.toContain('A conexão caiu. Tente novamente.');
  expect(indicator().props.accessibilityLabel).toContain('Tudo sincronizado');
});

test('a later automatic update clears a stale manual failure without reopening the dialog', async () => {
  refresh.mockRejectedValueOnce(new Error('Falha temporária'));
  await mount();
  await open();
  await act(async () => button('Atualizar agora').props.onPress());
  await act(async () => button('Fechar sincronização').props.onPress());
  await update({ lastSyncedAt: lastSyncedAt + 1000 });
  expect(indicator().props.accessibilityLabel).toContain('Tudo sincronizado');
  expect(modals()).toHaveLength(0);
});

test('offline mode changes only after the explicitly named online action and failures preserve the choice', async () => {
  status.offlineMode = true;
  status.pending = 3;
  setOfflineMode.mockRejectedValueOnce(
    new Error('Conecte-se à internet para voltar online.'),
  );
  await mount();
  await open();
  expect(setOfflineMode).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  expect(text()).toContain('O modo offline continua ligado');
  await act(async () => button('Sincronizar e voltar online').props.onPress());
  expect(setOfflineMode).toHaveBeenCalledExactlyOnceWith(false);
  expect(refresh).not.toHaveBeenCalled();
  expect(status.offlineMode).toBe(true);
  expect(text()).toContain('Conecte-se à internet para voltar online.');
});

test('disconnected devices keep the update action disabled and never send or switch modes', async () => {
  status.online = false;
  await mount();
  await open();
  expect(button('Atualizar agora').props.disabled).toBe(true);
  await act(async () => button('Atualizar agora').props.onPress());
  expect(refresh).not.toHaveBeenCalled();
  expect(setOfflineMode).not.toHaveBeenCalled();
});

test('cloud resolution needs a second confirmation and cancel/back preserve every pending activity', async () => {
  status.pending = 4;
  status.conflict = {
    kind: 'card',
    canForce: true,
    message: 'Este card mudou na nuvem.',
  };
  await mount();
  await open();
  await act(async () => button('Usar versão da nuvem').props.onPress());
  expect(modals()).toHaveLength(1);
  expect(text()).toContain('As 4 atividades ainda não sincronizadas');
  expect(text()).toContain('Esta ação não pode ser desfeita.');
  expect(resolveConflict).not.toHaveBeenCalled();
  await act(async () => button('Cancelar e manter pendências').props.onPress());
  expect(resolveConflict).not.toHaveBeenCalled();
  expect(button('Usar versão da nuvem')).toBeDefined();
  await act(async () => button('Usar versão da nuvem').props.onPress());
  await act(async () => modals()[0].props.onRequestClose());
  expect(button('Usar versão da nuvem')).toBeDefined();
  expect(resolveConflict).not.toHaveBeenCalled();
  expect(status.pending).toBe(4);
});

test('confirmed cloud resolution is sent once and a failure keeps the confirmation available', async () => {
  status.pending = 2;
  status.conflict = {
    kind: 'card',
    canForce: true,
    message: 'Este card mudou na nuvem.',
  };
  let reject!: (error: Error) => void;
  resolveConflict.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  await mount();
  await open();
  await act(async () => button('Usar versão da nuvem').props.onPress());
  const confirm = button('Descartar pendências e usar a nuvem').props.onPress;
  await act(async () => {
    confirm();
    confirm();
  });
  expect(resolveConflict).toHaveBeenCalledExactlyOnceWith('cloud');
  expect(button('Cancelar e manter pendências').props.disabled).toBe(true);
  await act(async () => modals()[0].props.onRequestClose());
  expect(button('Descartar pendências e usar a nuvem')).toBeDefined();
  await act(async () =>
    reject(new Error('Não foi possível baixar a versão da nuvem.')),
  );
  expect(text()).toContain('Não foi possível baixar a versão da nuvem.');
  expect(button('Descartar pendências e usar a nuvem').props.disabled).toBe(
    false,
  );
  await act(async () =>
    button('Descartar pendências e usar a nuvem').props.onPress(),
  );
  expect(resolveConflict).toHaveBeenCalledTimes(2);
  expect(button('Usar versão da nuvem')).toBeDefined();
});

test('session conflicts explain the replacement and explicitly confirm exiting offline mode', async () => {
  status.offlineMode = true;
  status.conflict = {
    kind: 'session',
    canForce: true,
    message: 'Uma sessão está ativa na nuvem.',
  };
  await mount();
  await open();
  await act(async () =>
    button('Usar alterações deste aparelho').props.onPress(),
  );
  expect(text()).toContain('A sessão de estudo ativa na nuvem será encerrada');
  expect(text()).toContain('desligar o modo offline');
  expect(resolveConflict).not.toHaveBeenCalled();
  await act(async () =>
    button('Usar este aparelho e voltar online').props.onPress(),
  );
  expect(resolveConflict).toHaveBeenCalledExactlyOnceWith('device');
  expect(setOfflineMode).not.toHaveBeenCalled();
});

test('conflicts that cannot be forced expose only cloud resolution, and stale confirmations cannot mutate', async () => {
  status.conflict = {
    kind: 'card',
    canForce: false,
    message: 'Este card não pode ser recuperado.',
  };
  await mount();
  await open();
  expect(
    tree.root.findAllByProps({
      accessibilityLabel: 'Usar alterações deste aparelho',
    }),
  ).toHaveLength(0);
  await act(async () => button('Usar versão da nuvem').props.onPress());
  await update({ conflict: null, pending: 0 });
  expect(button('Descartar pendências e usar a nuvem').props.disabled).toBe(
    true,
  );
  await act(async () =>
    button('Descartar pendências e usar a nuvem').props.onPress(),
  );
  expect(resolveConflict).not.toHaveBeenCalled();
});
