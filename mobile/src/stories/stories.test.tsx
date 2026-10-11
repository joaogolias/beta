import type { ComponentProps } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  applyStoryProgress,
  storySummary,
  type StoryProgress,
  type StoryRecord,
} from '../../../shared/stories';
import { StoriesScreen } from './StoriesScreen';
import { StoryReader } from './StoryReader';
import { nextQuestionIndex, rubyTokens } from './presentation';

vi.mock('react-native', () => ({
  BackHandler: { addEventListener: () => ({ remove: vi.fn() }) },
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  Text: 'Text',
  TextInput: 'TextInput',
  ScrollView: 'ScrollView',
  Switch: 'Switch',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('../offline/hooks', () => ({
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
}));
vi.mock('./hooks', () => ({
  useStories: () => catalog,
  useStory: () => state,
  useStoryPreferences: () => preferences,
}));

const story: StoryRecord = {
  id: 'story-one',
  title: '小さな図書館',
  level: 'N4',
  createdAt: 100,
  updatedAt: 100,
  archived: false,
  paragraphs: [
    {
      id: 'p1',
      segments: [
        { text: '昨日', reading: 'きのう' },
        { text: '、小さな' },
        { text: '図書館', reading: 'としょかん' },
        { text: 'へ行きました。' },
      ],
      translation: 'Ontem fui a uma pequena biblioteca.',
    },
    {
      id: 'p2',
      segments: [{ text: '本', reading: 'ほん' }, { text: 'を読みました。' }],
      translation: 'Li um livro.',
    },
    {
      id: 'p3',
      segments: [
        { text: '雨', reading: 'あめ' },
        { text: 'が降り始めました。' },
      ],
      translation: 'Começou a chover.',
    },
    {
      id: 'p4',
      segments: [{ text: '傘', reading: 'かさ' }, { text: 'を借りました。' }],
      translation: 'Peguei um guarda-chuva emprestado.',
    },
  ],
  questions: [
    {
      id: 'q1',
      prompt: 'どこへ行きましたか。',
      options: [
        { id: 'library', text: '図書館' },
        { id: 'park', text: '公園' },
      ],
      correctOptionId: 'library',
      explanation: 'A história começa na biblioteca.',
    },
    {
      id: 'q2',
      prompt: '何をしましたか。',
      options: [
        { id: 'read', text: '本を読みました。' },
        { id: 'run', text: '走りました。' },
      ],
      correctOptionId: 'read',
      explanation: 'A personagem leu um livro.',
    },
  ],
};
let state: {
  story: StoryRecord | null | undefined;
  progress: StoryProgress | null;
  error: string | null;
  loading: boolean;
  saveParagraph: ReturnType<typeof vi.fn>;
  answer: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
};
let catalog: {
  items: ReturnType<typeof storySummary>[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: ReturnType<typeof vi.fn>;
  error: string | null;
  offline: boolean;
};
let preferences: {
  furigana: boolean;
  textSize?: 'normal' | 'large' | 'extra';
  setFurigana: ReturnType<typeof vi.fn>;
};
let tree: ReactTestRenderer;
let onExit: ReturnType<typeof vi.fn<() => void>>;
let tick: number;
let scrollTo: ReturnType<typeof vi.fn>;
let questContext: ComponentProps<typeof StoryReader>['quest'];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  tick = 200;
  scrollTo = vi.fn();
  state = {
    story,
    progress: null,
    loading: false,
    error: null,
    retry: vi.fn(),
    saveParagraph: vi.fn(async (paragraphIndex: number) => {
      state.progress = applyStoryProgress(story, state.progress, {
        type: 'progress',
        paragraphIndex,
        occurredAt: ++tick,
      });
    }),
    answer: vi.fn(async (questionId: string, optionId: string) => {
      state.progress = applyStoryProgress(story, state.progress, {
        type: 'answer',
        questionId,
        optionId,
        occurredAt: ++tick,
      });
    }),
    complete: vi.fn(async () => {
      state.progress = applyStoryProgress(story, state.progress, {
        type: 'complete',
        occurredAt: ++tick,
      });
    }),
  };
  catalog = {
    items: [storySummary(story, null)],
    loading: false,
    hasMore: false,
    loadingMore: false,
    loadMore: vi.fn(),
    error: null,
    offline: false,
  };
  preferences = {
    furigana: true,
    setFurigana: vi.fn(async (value: boolean) => {
      preferences.furigana = value;
    }),
  };
  onExit = vi.fn();
  questContext = undefined;
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.unstubAllGlobals();
});
function host(label: string) {
  return tree.root.find(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label,
  );
}
function text() {
  return tree.root
    .findAll(
      (node) => typeof node.type === 'string' && String(node.type) === 'Text',
    )
    .map((node) => node.children.join(''))
    .join('\n');
}
async function mountReader() {
  await act(async () => {
    tree = create(
      <StoryReader storyId={story.id} onExit={onExit} quest={questContext} />,
      {
        createNodeMock: (element) =>
          String(element.type) === 'ScrollView' ? { scrollTo } : null,
      },
    );
  });
}
async function updateReader() {
  await act(async () =>
    tree.update(
      <StoryReader storyId={story.id} onExit={onExit} quest={questContext} />,
    ),
  );
}
async function press(label: string) {
  await act(async () => host(label).props.onPress());
  await updateReader();
}

test('filters and paginates the catalog while distinguishing new, resumed and complete readings', async () => {
  const progress = applyStoryProgress(story, null, {
    type: 'progress',
    paragraphIndex: 1,
    occurredAt: 200,
  });
  catalog.items = [
    storySummary(story, null),
    storySummary(
      { ...story, id: 'in-progress', title: '途中' },
      { ...progress, storyId: 'in-progress' },
    ),
    storySummary(
      { ...story, id: 'done', title: '終わり' },
      { ...progress, storyId: 'done', completedAt: 201 },
    ),
  ];
  catalog.hasMore = true;
  const onOpen = vi.fn();
  const onFiltersChange = vi.fn();
  await act(async () => {
    tree = create(
      <StoriesScreen
        filters={{ status: 'all' }}
        onFiltersChange={onFiltersChange}
        onOpen={onOpen}
      />,
    );
  });
  await act(async () => host('Nível N3').props.onPress());
  expect(onFiltersChange).toHaveBeenCalledWith({ status: 'all', level: 'N3' });
  await act(async () => host('Continuar leitura: 途中, N4').props.onPress());
  expect(onOpen).toHaveBeenCalledWith('in-progress');
  expect(host('Reler: 終わり, N4')).toBeDefined();
  await act(async () => host('Mais histórias').props.onPress());
  expect(catalog.loadMore).toHaveBeenCalledOnce();
});

test('all paragraphs reveal and hide their own translation independently', async () => {
  await mountReader();
  for (const [index, paragraph] of story.paragraphs.entries()) {
    expect(host(`Ver tradução do parágrafo ${index + 1}`)).toBeDefined();
    expect(text()).not.toContain(paragraph.translation);
  }
  for (const [index, paragraph] of story.paragraphs.entries()) {
    await press(`Ver tradução do parágrafo ${index + 1}`);
    expect(text()).toContain(paragraph.translation);
  }
  await press('Ocultar tradução do parágrafo 2');
  expect(text()).not.toContain(story.paragraphs[1].translation);
  for (const index of [0, 2, 3])
    expect(text()).toContain(story.paragraphs[index].translation);
});

test('legacy paragraphs without a translation still explain their availability on demand', async () => {
  state.story = {
    ...story,
    paragraphs: [{ id: 'legacy', segments: [{ text: 'ひらがなだけです。' }] }],
  };
  await mountReader();
  expect(text()).not.toContain('ainda não tem tradução');
  await press('Ver tradução do parágrafo 1');
  expect(text()).toContain(
    'Esta história ainda não tem tradução para este parágrafo.',
  );
  await press('Ocultar tradução do parágrafo 1');
  expect(text()).not.toContain('ainda não tem tradução');
});

test('a new content edition resets transient reader state before the first answer', async () => {
  await mountReader();
  await press('Ver tradução do parágrafo 1');
  expect(text()).toContain('Ontem fui a uma pequena biblioteca.');
  state.story = {
    ...story,
    contentVersion: 2,
    paragraphs: [
      {
        id: 'p1',
        segments: [{ text: '今日は雨です。' }],
        translation: 'Hoje está chovendo.',
      },
    ],
  };
  await updateReader();
  expect(text()).toContain('今日は雨です。');
  expect(text()).not.toContain('Hoje está chovendo.');
  expect(host('Ver tradução do parágrafo 1')).toBeDefined();
});

test('reading has only a visible furigana toggle and ignores the legacy text size preference', async () => {
  preferences.textSize = 'extra';
  await mountReader();
  expect(text()).toContain('きのう');
  expect(text()).not.toContain('Aa');
  expect(text()).not.toContain('Tamanho do texto');
  expect(() => host('Ajustes da leitura')).toThrow();
  expect(
    tree.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityRole === 'switch',
    ),
  ).toHaveLength(1);
  await act(async () => host('Habilitar furigana').props.onPress());
  await updateReader();
  expect(preferences.setFurigana).toHaveBeenCalledWith(false);
  expect(text()).not.toContain('きのう');
  expect(text()).toContain('昨日、小さな図書館へ行きました。');
  const paragraph = tree.root.find(
    (node) =>
      String(node.type) === 'Text' &&
      node.children.join('') === '昨日、小さな図書館へ行きました。',
  );
  expect(paragraph.props.style).toContainEqual({
    fontSize: 20,
    lineHeight: 38,
  });
  expect(paragraph.props.allowFontScaling).not.toBe(false);
  expect(
    tree.root.findAll((node) => String(node.type) === 'ScrollView'),
  ).toHaveLength(1);
});

test('asks one question at a time, preserves the choice during text consultation, and only completes after every answer', async () => {
  await mountReader();
  expect(state.complete).not.toHaveBeenCalled();
  await press('Responder 2 perguntas');
  expect(host('Confirmar resposta').props.disabled).toBe(true);
  expect(text()).not.toContain('何をしましたか。');
  await press('2. 公園');
  await press('Consultar o texto da história');
  expect(text()).toContain('CONSULTANDO O TEXTO');
  await press('Voltar à pergunta 1');
  expect(host('2. 公園').props.accessibilityState.checked).toBe(true);
  await press('Confirmar resposta');
  expect(state.answer).toHaveBeenCalledWith('q1', 'park');
  expect(text()).toContain('Vamos conferir juntos.');
  const feedback = tree.root.find(
    (node) =>
      String(node.type) === 'View' &&
      node.props.accessibilityLiveRegion === 'polite',
  );
  await act(async () =>
    feedback.props.onLayout({ nativeEvent: { layout: { y: 480 } } }),
  );
  expect(scrollTo).toHaveBeenCalledWith({ y: 464, animated: true });
  expect(state.complete).not.toHaveBeenCalled();
  await press('Próxima pergunta');
  await press('1. 本を読みました。');
  await press('Confirmar resposta');
  expect(state.progress?.completedAt).toBeUndefined();
  await press('Concluir história');
  expect(state.complete).toHaveBeenCalledOnce();
  expect(state.progress?.completedAt).toBeDefined();
  expect(text()).toContain('respostas corretas');
  await press('Reler história');
  expect(state.complete).toHaveBeenCalledOnce();
  expect(host('Ver meu resultado')).toBeDefined();
});

test('resumes the first unanswered question and keeps earlier answers read-only', async () => {
  state.progress = applyStoryProgress(story, null, {
    type: 'answer',
    questionId: 'q1',
    optionId: 'library',
    occurredAt: 201,
  });
  expect(nextQuestionIndex(story, state.progress)).toBe(1);
  await mountReader();
  expect(text()).toContain('何をしましたか。');
  const back = tree.root.find(
    (node) =>
      String(node.type) === 'Pressable' &&
      node.findAll(
        (child) =>
          String(child.type) === 'Text' &&
          child.children.join('') === '‹ Pergunta anterior',
      ).length === 1,
  );
  await act(async () => back.props.onPress());
  expect(host('1. 図書館, resposta correta').props.disabled).toBe(true);
  expect(state.answer).not.toHaveBeenCalled();
});

test('a quest story requires saved completion and result acknowledgement before continuing the quest', async () => {
  const onCompleted = vi.fn();
  questContext = {
    id: 'quest-one',
    title: 'Ler no fim de semana',
    onCompleted,
  };
  await mountReader();
  expect(host('Voltar para Quests')).toBeDefined();
  expect(text()).toContain('Ler no fim de semana');
  expect(onCompleted).not.toHaveBeenCalled();
  await press('Responder 2 perguntas');
  await press('1. 図書館');
  await press('Confirmar resposta');
  await press('Próxima pergunta');
  await press('1. 本を読みました。');
  await press('Confirmar resposta');
  expect(onCompleted).not.toHaveBeenCalled();
  state.complete.mockRejectedValueOnce(new Error('Sem espaço para salvar.'));
  await press('Concluir história');
  expect(text()).toContain('Sem espaço para salvar.');
  expect(() => host('Continuar quest')).toThrow();
  expect(onCompleted).not.toHaveBeenCalled();
  await press('Concluir história');
  expect(text()).toContain('respostas corretas');
  expect(onCompleted).not.toHaveBeenCalled();
  await press('Continuar quest');
  expect(onCompleted).toHaveBeenCalledOnce();
  expect(onExit).not.toHaveBeenCalled();
});

test('retains the choice and offers retry after a failed save instead of showing success', async () => {
  state.answer = vi.fn(async () => {
    throw new Error('Sem espaço para salvar.');
  });
  await mountReader();
  await press('Responder 2 perguntas');
  await press('1. 図書館');
  await press('Confirmar resposta');
  expect(text()).toContain('Sem espaço para salvar.');
  expect(host('Confirmar resposta').props.disabled).toBe(false);
  expect(state.complete).not.toHaveBeenCalled();
});

test('keeps Japanese opening and closing punctuation attached while preserving supplied readings', () => {
  expect(
    rubyTokens([
      { text: '「' },
      { text: '図書館', reading: 'としょかん' },
      { text: '」。' },
    ]),
  ).toEqual([{ text: '「図書館」。', reading: 'としょかん' }]);
  expect(
    rubyTokens([{ text: '本を読みます。' }])
      .map((token) => token.text)
      .join(''),
  ).toBe('本を読みます。');
});

test('explains absent furigana and disables its control without changing the saved preference', async () => {
  state.story = {
    ...story,
    paragraphs: [{ id: 'plain', segments: [{ text: 'ひらがなだけです。' }] }],
  };
  await mountReader();
  expect(text()).toContain('Esta história não inclui furigana.');
  expect(host('Habilitar furigana').props.accessibilityRole).toBe('switch');
  expect(host('Habilitar furigana').props.accessibilityState).toEqual({
    checked: false,
    disabled: true,
  });
  expect(preferences.furigana).toBe(true);
  expect(preferences.setFurigana).not.toHaveBeenCalled();
});

test('restores the saved paragraph only after both paragraph and content offsets are measured', async () => {
  state.progress = applyStoryProgress(story, null, {
    type: 'progress',
    paragraphIndex: 1,
    occurredAt: 201,
  });
  await mountReader();
  await act(async () =>
    tree.root
      .findByProps({ testID: 'story-paragraph-p2' })
      .props.onLayout({ nativeEvent: { layout: { y: 400 } } }),
  );
  expect(scrollTo).not.toHaveBeenCalled();
  await act(async () =>
    tree.root
      .findByProps({ testID: 'story-paragraphs' })
      .props.onLayout({ nativeEvent: { layout: { y: 150 } } }),
  );
  expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 550, animated: false });
  expect(state.saveParagraph).not.toHaveBeenCalled();
});

test('keeps the reader open when saving on exit fails and allows a safe retry', async () => {
  state.saveParagraph = vi.fn(async () => {
    throw new Error('Não foi possível guardar a leitura.');
  });
  await mountReader();
  await press('Voltar para Histórias');
  expect(onExit).not.toHaveBeenCalled();
  expect(text()).toContain('Não foi possível guardar a leitura.');
  state.saveParagraph = vi.fn(async () => {});
  await updateReader();
  await press('Tentar salvar novamente');
  expect(state.saveParagraph).toHaveBeenCalledOnce();
  await press('Voltar para Histórias');
  expect(onExit).toHaveBeenCalledOnce();
});

test('rereading opens the text and result review distinguishes the users wrong answer from the correct one', async () => {
  state.progress = applyStoryProgress(story, null, {
    type: 'answer',
    questionId: 'q1',
    optionId: 'park',
    occurredAt: 201,
  });
  state.progress = applyStoryProgress(story, state.progress, {
    type: 'answer',
    questionId: 'q2',
    optionId: 'read',
    occurredAt: 202,
  });
  state.progress = applyStoryProgress(story, state.progress, {
    type: 'complete',
    occurredAt: 203,
  });
  await mountReader();
  expect(text()).toContain('きのう');
  expect(text()).not.toContain('respostas corretas');
  await press('Ver meu resultado');
  expect(text()).toContain('Sua resposta');
  expect(text()).toContain('Resposta correta');
  expect(text()).toContain('✓ Acertou');
  expect(state.answer).not.toHaveBeenCalled();
  expect(state.complete).not.toHaveBeenCalled();
});
