import { createElement, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AppEnvironment, AppModal, EnvironmentFrame } from './AppEnvironment';

vi.mock('react-native', () => ({
  Modal: ({
    visible = true,
    children,
    ...props
  }: {
    visible?: boolean;
    children: ReactNode;
  }) => (visible ? createElement('Modal', props, children) : null),
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  SafeAreaView: 'SafeAreaView',
}));

let tree: ReactTestRenderer;
function Content() {
  return createElement('content');
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('__DEV__', false);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.unstubAllGlobals();
});

test.each(['production', undefined, 'invalid'])(
  'does not label %s as development or change its screen layout',
  async (environment) => {
    vi.stubGlobal('__DEV__', true);
    await act(async () => {
      tree = create(
        <AppEnvironment environment={environment}>
          <EnvironmentFrame>
            <Content />
          </EnvironmentFrame>
        </AppEnvironment>,
      );
    });
    expect(tree.toJSON()).toEqual({
      type: 'content',
      props: {},
      children: null,
    });
  },
);

test('a release bundle targeting development has one persistent, noninteractive DEV strip', async () => {
  await act(async () => {
    tree = create(
      <AppEnvironment environment="development">
        <EnvironmentFrame>
          <Content />
        </EnvironmentFrame>
      </AppEnvironment>,
    );
  });
  const labels = tree.root.findAllByProps({
    accessibilityLabel: 'Ambiente de desenvolvimento',
  });
  expect(labels).toHaveLength(1);
  expect(labels[0].props.children).toBe('DEV');
  expect(labels[0].parent?.props.pointerEvents).toBe('none');
  expect(labels[0].parent?.props.edges).toEqual(['top', 'left', 'right']);
  expect(tree.root.findByType('content' as never)).toBeDefined();
});

test.each([true, false])(
  'modal transparent=%s keeps the tag in its native window and preserves close behavior',
  async (transparent) => {
    const close = vi.fn();
    await act(async () => {
      tree = create(
        <AppEnvironment environment="development">
          <AppModal visible transparent={transparent} onRequestClose={close}>
            <Content />
          </AppModal>
        </AppEnvironment>,
      );
    });
    const modal = tree.root.findByType('Modal' as never);
    expect(modal.props.transparent).toBe(transparent);
    expect(
      modal.findAllByProps({
        accessibilityLabel: 'Ambiente de desenvolvimento',
      }),
    ).toHaveLength(1);
    modal.props.onRequestClose();
    expect(close).toHaveBeenCalledOnce();
    await act(async () => {
      tree.update(
        <AppEnvironment environment="development">
          <AppModal visible={false}>
            <Content />
          </AppModal>
        </AppEnvironment>,
      );
    });
    expect(tree.toJSON()).toBeNull();
  },
);

test('production modals retain their original content with no development strip', async () => {
  await act(async () => {
    tree = create(
      <AppEnvironment environment="production">
        <AppModal visible>
          <Content />
        </AppModal>
      </AppEnvironment>,
    );
  });
  expect(tree.toJSON()).toEqual({
    type: 'Modal',
    props: {},
    children: [{ type: 'content', props: {}, children: null }],
  });
});
