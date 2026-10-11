import type { Id } from '../../../backend/convex/_generated/dataModel';
import type { LibraryFilters } from '../alphabet/LibraryScreen';
import type { JlptLevel } from '../alphabet/form';
import type { CardCategory } from '../vocabulary/CategoryPicker';
import type { QuestRun } from '../quests/presentation';
import type { StoryFilters } from '../stories/presentation';

export type StudyMode = 'direct' | 'adaptive';
export type LibraryCategory = 'alphabet' | 'vocabulary' | 'grammar' | 'exam';
export type StudyTab = LibraryCategory | 'study' | 'progress';
export type StudyPreferences = {
  category: CardCategory;
  level: JlptLevel | '';
  order: 'sorted' | 'random';
  limit: string;
};
export type CategoryLibraryFilters = LibraryFilters & {
  category: LibraryCategory;
};

export type StudyRoute =
  | { name: 'library'; category: LibraryCategory }
  | { name: 'card-detail'; cardId: Id<'alphabetCards'> }
  | { name: 'card-editor'; cardId?: Id<'alphabetCards'> }
  | { name: 'vocabulary-detail'; cardId: Id<'vocabularyCards'> }
  | { name: 'vocabulary-editor'; cardId?: Id<'vocabularyCards'> }
  | { name: 'grammar-detail'; cardId: Id<'grammarCards'> }
  | { name: 'grammar-editor'; cardId?: Id<'grammarCards'> }
  | { name: 'exam-detail'; cardId: Id<'examCards'> }
  | { name: 'exam-editor'; cardId?: Id<'examCards'> }
  | { name: 'jlpt-home'; level?: JlptLevel }
  | { name: 'jlpt-paper'; paperId: Id<'jlptPapers'> }
  | { name: 'jlpt-editor'; paperId?: Id<'jlptPapers'> }
  | { name: 'jlpt-attempt'; attemptId: Id<'jlptAttempts'> }
  | { name: 'study-home' }
  | { name: 'study-settings' }
  | { name: 'quests' }
  | { name: 'stories' }
  | { name: 'stories-reader'; storyId: string }
  | { name: 'quest-runner'; questId: Id<'quests'>; run: QuestRun }
  | { name: 'study-session'; sessionId: Id<'studySessions'> }
  | { name: 'progress' };

export type NavigationState = {
  route: StudyRoute;
  questOrigin: QuestOrigin;
  mode: StudyMode;
  libraries: Record<LibraryCategory, CategoryLibraryFilters>;
  study: StudyPreferences;
  stories: StoryFilters;
};
type QuestOrigin = Extract<
  StudyRoute,
  { name: 'library' | 'jlpt-home' | 'study-home' | 'study-settings' }
>;
export type NavigationAction =
  | { type: 'open'; route: StudyRoute }
  | { type: 'select-mode'; mode: StudyMode }
  | { type: 'change-study'; patch: Partial<StudyPreferences> }
  | { type: 'change-stories'; filters: StoryFilters }
  | { type: 'change-library'; filters: CategoryLibraryFilters }
  | { type: 'study-library' }
  | { type: 'back' };

function libraryFilters(category: LibraryCategory): CategoryLibraryFilters {
  return {
    category,
    query: '',
    level: '',
    archived: false,
    reading: '',
    radical: '',
    operator: 'AND',
  };
}

export const initialNavigation: NavigationState = {
  route: { name: 'library', category: 'alphabet' },
  questOrigin: { name: 'study-home' },
  mode: 'direct',
  libraries: {
    alphabet: libraryFilters('alphabet'),
    vocabulary: libraryFilters('vocabulary'),
    grammar: libraryFilters('grammar'),
    exam: libraryFilters('exam'),
  },
  study: { category: 'all', level: '', order: 'sorted', limit: '20' },
  stories: { status: 'all' },
};

export function parentRoute(
  route: StudyRoute,
  questOrigin: QuestOrigin = { name: 'study-home' },
): StudyRoute | null {
  if (route.name === 'stories-reader') return { name: 'stories' };
  if (route.name === 'stories' || route.name === 'study-settings')
    return { name: 'study-home' };
  if (route.name === 'quest-runner') return { name: 'quests' };
  if (route.name === 'jlpt-editor')
    return route.paperId
      ? { name: 'jlpt-paper', paperId: route.paperId }
      : { name: 'jlpt-home' };
  if (route.name === 'jlpt-paper' || route.name === 'jlpt-attempt')
    return { name: 'jlpt-home' };
  if (route.name === 'exam-detail')
    return { name: 'library', category: 'exam' };
  if (route.name === 'exam-editor')
    return route.cardId
      ? { name: 'exam-detail', cardId: route.cardId }
      : { name: 'library', category: 'exam' };
  if (route.name === 'grammar-detail')
    return { name: 'library', category: 'grammar' };
  if (route.name === 'grammar-editor')
    return route.cardId
      ? { name: 'grammar-detail', cardId: route.cardId }
      : { name: 'library', category: 'grammar' };
  if (route.name === 'card-detail')
    return { name: 'library', category: 'alphabet' };
  if (route.name === 'vocabulary-detail')
    return { name: 'library', category: 'vocabulary' };
  if (route.name === 'vocabulary-editor')
    return route.cardId
      ? { name: 'vocabulary-detail', cardId: route.cardId }
      : { name: 'library', category: 'vocabulary' };
  if (route.name === 'card-editor')
    return route.cardId
      ? { name: 'card-detail', cardId: route.cardId }
      : { name: 'library', category: 'alphabet' };
  if (route.name === 'quests') return questOrigin;
  if (route.name === 'study-session') return { name: 'study-settings' };
  return null;
}

export function canGoBack(state: NavigationState): boolean {
  return Boolean(
    parentRoute(state.route, state.questOrigin) ||
    (state.route.name === 'library' &&
      state.libraries[state.route.category].level),
  );
}

export function selectedTab(
  route: StudyRoute,
  questOrigin: QuestOrigin = { name: 'study-home' },
): StudyTab {
  if (route.name === 'quests' || route.name === 'quest-runner')
    return selectedTab(questOrigin);
  if (route.name.startsWith('jlpt-')) return 'exam';
  if (route.name === 'library') return route.category;
  if (route.name === 'card-editor' || route.name === 'card-detail')
    return 'alphabet';
  if (route.name === 'vocabulary-editor' || route.name === 'vocabulary-detail')
    return 'vocabulary';
  if (route.name === 'grammar-editor' || route.name === 'grammar-detail')
    return 'grammar';
  if (route.name === 'exam-editor' || route.name === 'exam-detail')
    return 'exam';
  if (route.name === 'progress') return 'progress';
  return 'study';
}

function questOriginFor(route: StudyRoute): QuestOrigin {
  if (
    route.name === 'library' ||
    route.name === 'jlpt-home' ||
    route.name === 'study-home' ||
    route.name === 'study-settings'
  )
    return route;
  const tab = selectedTab(route);
  if (tab === 'exam') return { name: 'jlpt-home' };
  if (tab === 'alphabet' || tab === 'vocabulary' || tab === 'grammar')
    return { name: 'library', category: tab };
  return { name: 'study-home' };
}

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'open': {
      const enteringQuests =
        action.route.name === 'quests' || action.route.name === 'quest-runner';
      const alreadyInQuests =
        state.route.name === 'quests' || state.route.name === 'quest-runner';
      return {
        ...state,
        route: action.route,
        questOrigin:
          enteringQuests && !alreadyInQuests
            ? questOriginFor(state.route)
            : state.questOrigin,
      };
    }
    case 'select-mode':
      return { ...state, mode: action.mode };
    case 'change-study':
      return { ...state, study: { ...state.study, ...action.patch } };
    case 'change-stories':
      return { ...state, stories: action.filters };
    case 'change-library':
      return {
        ...state,
        libraries: {
          ...state.libraries,
          [action.filters.category]: action.filters,
        },
      };
    case 'study-library': {
      if (state.route.name !== 'library' || state.route.category === 'exam')
        return state;
      const { category, level } = state.libraries[state.route.category];
      return {
        ...state,
        route: { name: 'study-settings' },
        study: { ...state.study, category, level },
      };
    }
    case 'back': {
      if (state.route.name === 'library') {
        const { category } = state.route;
        const filters = state.libraries[category];
        return filters.level
          ? {
              ...state,
              libraries: {
                ...state.libraries,
                [category]: { ...filters, level: '' },
              },
            }
          : state;
      }
      const parent = parentRoute(state.route, state.questOrigin);
      return parent ? { ...state, route: parent } : state;
    }
  }
}
