import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import { JLPT_SKILLS, startAttempt } from '../../../shared/jlpt';
import { JlptAttemptScreen } from './AttemptScreen';
import { newQuestion } from './form';

// Expo/Clerk already provide this renderer. Native primitives are adapted at the
// platform boundary; the screen, buttons and command state remain real React.
const { renderToStaticMarkup } = createRequire(import.meta.url)(
  'react-dom/server',
) as {
  renderToStaticMarkup(element: React.ReactNode): string;
};
const mock = vi.hoisted(() => ({
  attempt: null as Doc<'jlptAttempts'> | null,
}));
vi.mock('../offline/hooks', () => ({
  useQuery: () => mock.attempt,
  useMutation: () => vi.fn(),
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
}));
vi.mock('./ListeningPlayer', () => ({ ListeningPlayer: () => null }));
vi.mock('./CachedImage', () => ({ CachedImage: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: React.PropsWithChildren) => children,
  SafeAreaView: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', null, children),
}));
vi.mock('react-native', async () => {
  const { createElement } = await import('react');
  type Props = {
    children?: React.ReactNode;
    disabled?: boolean;
    accessibilityLabel?: string;
    visible?: boolean;
    onPress?: () => void;
  };
  const element =
    (tag: string) =>
    ({ children, disabled, accessibilityLabel, onPress }: Props) =>
      createElement(
        tag,
        { disabled, 'aria-label': accessibilityLabel, onClick: onPress },
        children,
      );
  return {
    View: element('div'),
    ScrollView: element('div'),
    Text: element('span'),
    Pressable: element('button'),
    TextInput: element('input'),
    ActivityIndicator: () => null,
    Modal: ({ visible, children }: Props) => (visible ? children : null),
    StyleSheet: { create: <T>(styles: T) => styles },
  };
});

const attemptId = 'test-attempt' as Id<'jlptAttempts'>;
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  // Vitest's existing React Native JSX configuration uses the classic JSX runtime.
  vi.stubGlobal('React', React);
  const now = Date.now();
  const state = startAttempt(
    {
      title: 'Teste de navegação',
      level: 'N5',
      contentVersion: 1,
      questions: JLPT_SKILLS.map((skill) => ({
        ...newQuestion('N5', skill, skill),
        prompt: '問題',
        choices: ['一', '二', '三', '四'],
        explanation: 'Explicação reservada para o resultado.',
        ...(skill === 'listening'
          ? { audioUrl: 'https://example.test/audio.mp3' }
          : {}),
      })),
    },
    now,
  );
  mock.attempt = {
    ...state,
    _id: attemptId,
    _creationTime: now,
    ownerId: 'test-owner' as Id<'users'>,
    paperId: 'test-paper' as Id<'jlptPapers'>,
    answers: state.answers.map((answer) => ({ ...answer, choice: 0 })),
  };
});
function button(label: string) {
  const html = renderToStaticMarkup(
    React.createElement(JlptAttemptScreen, {
      attemptId,
      onHome: () => undefined,
    }),
  );
  return html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0];
}

describe('rendered JLPT question navigation', () => {
  it('keeps completion enabled beside Previous on the answered final listening question', () => {
    mock.attempt!.blockIndex = 2;
    const rendered = button('Finalizar prova');
    expect(rendered).toBeDefined();
    expect(rendered).not.toContain('disabled');
    expect(button('Próxima →')).toBeUndefined();
  });
  it('keeps next-block navigation enabled on the last question of an earlier block', () => {
    expect(button('Próximo bloco →')).toBeDefined();
    expect(button('Próximo bloco →')).not.toContain('disabled');
  });
  it('keeps ordinary next-question navigation for an intermediate question', () => {
    mock.attempt!.blockIndex = 1;
    expect(button('Próxima →')).toBeDefined();
    expect(button('Próxima →')).not.toContain('disabled');
    expect(button('Finalizar prova')).toBeUndefined();
  });
});
