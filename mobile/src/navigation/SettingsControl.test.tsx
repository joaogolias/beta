import { createElement, useSyncExternalStore, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { OfflineMode } from '../offline/mode';
import { SettingsControl } from './SettingsControl';
import { AppEnvironment } from '../environment/AppEnvironment';

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Modal: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? createElement('Modal', null, children) : null,
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles },
  Switch: 'Switch',
  Text: 'Text',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  SafeAreaView: 'SafeAreaView',
}));
vi.mock('../offline/hooks', () => ({
  useOfflineStatus: () => ({
    ...useSyncExternalStore(mode.subscribe, mode.getSnapshot),
    online,
    pending: 3,
    conflict: null,
    setOfflineMode: (enabled: boolean) => mode.setOfflineMode(enabled),
  }),
}));

let mode: OfflineMode;
let online: boolean;
let tree: ReactTestRenderer;
const write = vi.fn(async (_enabled: boolean) => undefined);
const synchronize = vi.fn(async (): Promise<void> => undefined);
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  online = true;
  write.mockClear();
  synchronize.mockReset();
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.unstubAllGlobals();
});
async function mount(offline = false, environment = 'production') {
  mode = new OfflineMode({
    read: async () => offline,
    write,
    synchronize,
    canConnect: () => online,
    promptMemory: { dismissed: true },
  });
  await mode.load();
  await act(async () => {
    tree = create(
      <AppEnvironment environment={environment}>
        <SettingsControl />
      </AppEnvironment>,
    );
  });
  await act(async () => {
    tree.root
      .findByProps({ accessibilityLabel: 'Abrir configurações' })
      .props.onPress();
  });
}
function toggle() {
  return tree.root.findByProps({ accessibilityLabel: 'Modo offline' });
}

test('settings can enable offline intentionally even after the network invitation was declined', async () => {
  await mount();
  expect(toggle().props.value).toBe(false);
  await act(async () => {
    toggle().props.onValueChange(true);
  });
  expect(toggle().props.value).toBe(true);
  expect(write).toHaveBeenCalledExactlyOnceWith(true);
  expect(synchronize).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain(
    '3 ações de estudo aguardando envio',
  );
  expect(JSON.stringify(tree.toJSON())).toContain('Benkyou');
  expect(JSON.stringify(tree.toJSON())).toContain('Shiken');
});

test('turning offline off waits for synchronization and repeated taps cannot send twice', async () => {
  await mount(true);
  let complete!: () => void;
  synchronize.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await act(async () => {
    toggle().props.onValueChange(false);
  });
  expect(toggle().props.value).toBe(true);
  expect(toggle().props.disabled).toBe(true);
  await act(async () => {
    tree.root
      .findByProps({ accessibilityLabel: 'Sincronizar e voltar online' })
      .props.onPress();
  });
  expect(synchronize).toHaveBeenCalledOnce();
  expect(write).not.toHaveBeenCalled();
  await act(async () => {
    complete();
  });
  expect(toggle().props.value).toBe(false);
  expect(toggle().props.disabled).toBe(false);
  expect(write).toHaveBeenCalledExactlyOnceWith(false);
});

test('failed synchronization shows the reason and preserves the offline choice for retry', async () => {
  await mount(true);
  synchronize.mockRejectedValueOnce(
    new Error('A conexão caiu. Tente novamente.'),
  );
  await act(async () => {
    tree.root
      .findByProps({ accessibilityLabel: 'Sincronizar e voltar online' })
      .props.onPress();
  });
  expect(toggle().props.value).toBe(true);
  expect(toggle().props.disabled).toBe(false);
  expect(
    tree.root.findByProps({ accessibilityRole: 'alert' }).props.children,
  ).toContain('A conexão caiu');
  expect(write).not.toHaveBeenCalled();
  await act(async () => {
    toggle().props.onValueChange(false);
  });
  expect(toggle().props.value).toBe(false);
});

test.each(['development', 'production'])(
  '%s keeps the environment tag inside the settings modal only when appropriate',
  async (environment) => {
    await mount(false, environment);
    const modal = tree.root.findByType('Modal' as never);
    expect(
      modal.findAllByProps({
        accessibilityLabel: 'Ambiente de desenvolvimento',
      }),
    ).toHaveLength(environment === 'development' ? 1 : 0);
    await act(async () => {
      tree.root
        .findByProps({ accessibilityLabel: 'Fechar configurações' })
        .props.onPress();
    });
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0);
  },
);
