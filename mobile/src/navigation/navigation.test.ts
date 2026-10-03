import { describe, expect, it } from 'vitest';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import {
  canGoBack,
  initialNavigation,
  navigationReducer,
  parentRoute,
  selectedTab,
  type LibraryCategory,
} from './navigation';

const cardId = 'owned-card' as Id<'alphabetCards'>;
const vocabularyId = 'owned-vocabulary' as Id<'vocabularyCards'>;
const grammarId = 'owned-grammar' as Id<'grammarCards'>;
const examId = 'owned-exam' as Id<'examCards'>;
const paperId = 'owned-paper' as Id<'jlptPapers'>;
const attemptId = 'owned-attempt' as Id<'jlptAttempts'>;
const sessionId = 'owned-session' as Id<'studySessions'>;

describe('study navigation', () => {
  it('keeps historical exam data accessible without opening a Benkyou session', () => {
    let state = navigationReducer(initialNavigation, {
      type: 'change-library',
      filters: {
        ...initialNavigation.libraries.exam,
        level: 'N2',
        query: '文法',
        archived: true,
      },
    });
    state = navigationReducer(state, {
      type: 'open',
      route: { name: 'exam-editor', cardId: examId },
    });
    expect(selectedTab(state.route)).toBe('exam');
    state = navigationReducer(state, { type: 'back' });
    expect(state.route).toEqual({ name: 'exam-detail', cardId: examId });
    state = navigationReducer(state, { type: 'back' });
    expect(state.route).toEqual({ name: 'library', category: 'exam' });
    expect(state.libraries.exam).toMatchObject({
      level: 'N2',
      query: '文法',
      archived: true,
    });
    expect(state.libraries.grammar.level).toBe('');
    expect(parentRoute({ name: 'exam-editor' })).toEqual({
      name: 'library',
      category: 'exam',
    });
    const before = state;
    expect(navigationReducer(state, { type: 'study-library' })).toBe(before);
  });
  it('keeps timed simulations in Shiken and leaves Benkyou preferences unchanged', () => {
    let state = navigationReducer(initialNavigation, {
      type: 'open',
      route: { name: 'jlpt-editor', paperId },
    });
    expect(selectedTab(state.route)).toBe('exam');
    state = navigationReducer(state, { type: 'back' });
    expect(state.route).toEqual({ name: 'jlpt-paper', paperId });
    state = navigationReducer(state, { type: 'back' });
    expect(state.route).toEqual({ name: 'jlpt-home' });
    expect(canGoBack(state)).toBe(false);
    state = navigationReducer(state, {
      type: 'open',
      route: { name: 'jlpt-attempt', attemptId },
    });
    expect(selectedTab(state.route)).toBe('exam');
    state = navigationReducer(state, { type: 'back' });
    expect(state.route).toEqual({ name: 'jlpt-home' });
    expect(state.study).toEqual(initialNavigation.study);
    expect(parentRoute({ name: 'jlpt-editor' })).toEqual({ name: 'jlpt-home' });
  });
  it('keeps Bunpou edits, search operator and JLPT context independent through back and tab changes', () => {
    let state = navigationReducer(initialNavigation, {
      type: 'change-library',
      filters: {
        ...initialNavigation.libraries.grammar,
        level: 'N3',
        query: 'ても 許可',
        operator: 'OR',
        archived: true,
      },
    });
    state = navigationReducer(state, {
      type: 'open',
      route: { name: 'grammar-editor', cardId: grammarId },
    });
    expect(selectedTab(state.route)).toBe('grammar');
    state = navigationReducer(state, { type: 'back' });
    expect(state.route).toEqual({ name: 'grammar-detail', cardId: grammarId });
    expect(selectedTab(state.route)).toBe('grammar');
    state = navigationReducer(state, { type: 'back' });
    expect(state.route).toEqual({ name: 'library', category: 'grammar' });
    expect(state.libraries.grammar).toMatchObject({
      level: 'N3',
      query: 'ても 許可',
      operator: 'OR',
      archived: true,
    });
    expect(state.libraries.vocabulary.level).toBe('');
    expect(state.libraries.alphabet.query).toBe('');
    expect(parentRoute({ name: 'grammar-editor' })).toEqual({
      name: 'library',
      category: 'grammar',
    });
    state = navigationReducer(state, { type: 'study-library' });
    expect(state.study).toMatchObject({ category: 'grammar', level: 'N3' });
    state = navigationReducer(state, {
      type: 'open',
      route: { name: 'study-session', sessionId },
    });
    state = navigationReducer(state, { type: 'back' });
    expect(state.study).toMatchObject({ category: 'grammar', level: 'N3' });
  });
  it('keeps vocabulary edit and detail in Kotoba and returns to its selected level', () => {
    let state = navigationReducer(initialNavigation, {
      type: 'change-library',
      filters: {
        ...initialNavigation.libraries.vocabulary,
        level: 'N4',
        query: 'たべる',
      },
    });
    state = navigationReducer(state, {
      type: 'open',
      route: { name: 'vocabulary-editor', cardId: vocabularyId },
    });
    expect(selectedTab(state.route)).toBe('vocabulary');
    state = navigationReducer(state, { type: 'back' });
    expect(state.route).toEqual({
      name: 'vocabulary-detail',
      cardId: vocabularyId,
    });
    expect(selectedTab(state.route)).toBe('vocabulary');
    state = navigationReducer(state, { type: 'back' });
    expect(state.route).toEqual({ name: 'library', category: 'vocabulary' });
    expect(state.libraries.vocabulary).toMatchObject({
      level: 'N4',
      query: 'たべる',
    });
    expect(parentRoute({ name: 'vocabulary-editor' })).toEqual({
      name: 'library',
      category: 'vocabulary',
    });
  });

  it('returns from a session without losing mode, category, level, order or size', () => {
    let state = navigationReducer(initialNavigation, {
      type: 'change-study',
      patch: {
        category: 'vocabulary',
        level: 'N3',
        order: 'random',
        limit: '35',
      },
    });
    state = navigationReducer(state, { type: 'select-mode', mode: 'adaptive' });
    const before = state.study;
    state = navigationReducer(state, {
      type: 'open',
      route: { name: 'study-session', sessionId },
    });
    expect(selectedTab(state.route)).toBe('study');
    state = navigationReducer(state, { type: 'back' });
    expect(state.route).toEqual({ name: 'study-settings' });
    expect(state.mode).toBe('adaptive');
    expect(state.study).toEqual(before);
  });

  it('returns new kanji to Kanji and edited kanji through their own detail', () => {
    let state = navigationReducer(initialNavigation, {
      type: 'change-library',
      filters: {
        ...initialNavigation.libraries.alphabet,
        level: 'N5',
        reading: 'がく',
      },
    });
    state = navigationReducer(state, {
      type: 'open',
      route: { name: 'card-editor', cardId },
    });
    expect(selectedTab(state.route)).toBe('alphabet');
    state = navigationReducer(state, { type: 'back' });
    expect(state.route).toEqual({ name: 'card-detail', cardId });
    state = navigationReducer(state, { type: 'back' });
    expect(state.route).toEqual({ name: 'library', category: 'alphabet' });
    expect(state.libraries.alphabet).toMatchObject({
      level: 'N5',
      reading: 'がく',
    });
    expect(parentRoute({ name: 'card-editor' })).toEqual({
      name: 'library',
      category: 'alphabet',
    });
  });

  it('preserves separate category filters when switching tabs', () => {
    let state = navigationReducer(initialNavigation, {
      type: 'change-library',
      filters: {
        ...initialNavigation.libraries.alphabet,
        level: 'N5',
        query: '学',
        archived: true,
      },
    });
    state = navigationReducer(state, {
      type: 'change-library',
      filters: {
        ...initialNavigation.libraries.vocabulary,
        level: 'N2',
        query: 'いく',
      },
    });
    for (const category of ['vocabulary', 'alphabet'] as const) {
      state = navigationReducer(state, {
        type: 'open',
        route: { name: 'library', category },
      });
      expect(selectedTab(state.route)).toBe(category);
    }
    expect(state.libraries.alphabet).toMatchObject({
      level: 'N5',
      query: '学',
      archived: true,
    });
    expect(state.libraries.vocabulary).toMatchObject({
      level: 'N2',
      query: 'いく',
      archived: false,
    });
  });

  it('uses Android back to leave a level before leaving a category root', () => {
    for (const category of [
      'alphabet',
      'vocabulary',
      'grammar',
      'exam',
    ] as const) {
      let state = navigationReducer(initialNavigation, {
        type: 'open',
        route: { name: 'library', category },
      });
      state = navigationReducer(state, {
        type: 'change-library',
        filters: { ...state.libraries[category], level: 'N5', query: 'あ' },
      });
      expect(canGoBack(state)).toBe(true);
      state = navigationReducer(state, { type: 'back' });
      expect(state.route).toEqual({ name: 'library', category });
      expect(state.libraries[category]).toMatchObject({
        level: '',
        query: 'あ',
      });
      expect(canGoBack(state)).toBe(false);
      expect(navigationReducer(state, { type: 'back' })).toBe(state);
    }
  });

  it('does not consume Android back on a root tab', () => {
    for (const route of [
      { name: 'library' as const, category: 'alphabet' as const },
      { name: 'library' as const, category: 'vocabulary' as const },
      { name: 'study-settings' as const },
      { name: 'progress' as const },
    ]) {
      const state = navigationReducer(initialNavigation, {
        type: 'open',
        route,
      });
      expect(canGoBack(state)).toBe(false);
      expect(navigationReducer(state, { type: 'back' })).toBe(state);
    }
  });

  it('opens contextual study with only category and level, preserving study preferences', () => {
    for (const category of ['alphabet', 'vocabulary', 'grammar'] as const) {
      let state = navigationReducer(initialNavigation, {
        type: 'open',
        route: { name: 'library', category },
      });
      state = navigationReducer(state, {
        type: 'select-mode',
        mode: 'adaptive',
      });
      state = navigationReducer(state, {
        type: 'change-study',
        patch: { order: 'random', limit: '50' },
      });
      state = navigationReducer(state, {
        type: 'change-library',
        filters: {
          ...state.libraries[category],
          level: 'N5',
          query: '検索',
          reading: 'よむ',
          radical: '子',
          archived: true,
        },
      });
      state = navigationReducer(state, { type: 'study-library' });
      expect(state.route).toEqual({ name: 'study-settings' });
      expect(state.study).toEqual({
        category,
        level: 'N5',
        order: 'random',
        limit: '50',
      });
      expect(state.mode).toBe('adaptive');
    }
  });

  it('clears the previous level when study is opened from a category root', () => {
    let state = navigationReducer(initialNavigation, {
      type: 'change-study',
      patch: { category: 'vocabulary', level: 'N2' },
    });
    state = navigationReducer(state, { type: 'study-library' });
    expect(state.study).toMatchObject({ category: 'alphabet', level: '' });
  });

  it('ordinary study tab preserves manual choices instead of reapplying an old library context', () => {
    let state = navigationReducer(initialNavigation, { type: 'study-library' });
    state = navigationReducer(state, {
      type: 'change-study',
      patch: { category: 'all', level: 'N1' },
    });
    state = navigationReducer(state, {
      type: 'open',
      route: { name: 'library', category: 'vocabulary' },
    });
    state = navigationReducer(state, {
      type: 'open',
      route: { name: 'study-settings' },
    });
    expect(state.study).toMatchObject({ category: 'all', level: 'N1' });
  });

  it('switches tabs out of an editor without retaining its card selection', () => {
    let state = navigationReducer(initialNavigation, {
      type: 'open',
      route: { name: 'card-editor', cardId },
    });
    state = navigationReducer(state, {
      type: 'open',
      route: { name: 'progress' },
    });
    expect(selectedTab(state.route)).toBe('progress');
    for (const category of [
      'alphabet',
      'vocabulary',
    ] satisfies LibraryCategory[]) {
      state = navigationReducer(state, {
        type: 'open',
        route: { name: 'library', category },
      });
      expect(state.route).toEqual({ name: 'library', category });
    }
  });
});
