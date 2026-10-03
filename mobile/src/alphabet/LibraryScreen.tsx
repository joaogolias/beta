import { useDeferredValue, useEffect, useState } from 'react';
import { usePaginatedQuery } from '../offline/hooks';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import { jlptLevels, type JlptLevel } from './form';
import type { CardCategory } from '../vocabulary/CategoryPicker';
import { palette } from '../theme';
import { Action, Choice, Field, Loading, Notice, ui } from './ui';

export type LibraryFilters = {
  category: CardCategory;
  query: string;
  level: JlptLevel | '';
  archived: boolean;
  reading: string;
  radical: string;
  operator?: 'AND' | 'OR';
};
export const defaultLibraryFilters: LibraryFilters = {
  category: 'alphabet',
  query: '',
  level: '',
  archived: false,
  reading: '',
  radical: '',
  operator: 'AND',
};
const collections = {
  N5: { name: 'Primeiros passos', mark: '始' },
  N4: { name: 'O dia a dia', mark: '日' },
  N3: { name: 'Novas conexões', mark: '結' },
  N2: { name: 'Mais horizontes', mark: '広' },
  N1: { name: 'Cada nuance', mark: '深' },
} as const;

export function LibraryScreen({
  filters,
  onFiltersChange,
  onOpen,
  onCreate,
  onOpenVocabulary,
  onOpenGrammar,
  onOpenExam,
  onLoadMoreReady,
}: {
  filters: LibraryFilters;
  onFiltersChange: (filters: LibraryFilters) => void;
  onOpen: (id: Id<'alphabetCards'>) => void;
  onCreate: (category: 'alphabet' | 'vocabulary' | 'grammar' | 'exam') => void;
  onOpenVocabulary: (id: Id<'vocabularyCards'>) => void;
  onOpenGrammar: (id: Id<'grammarCards'>) => void;
  onOpenExam: (id: Id<'examCards'>) => void;
  onLoadMoreReady?: (callback: (() => void) | null) => void;
}) {
  const vocabulary = filters.category === 'vocabulary';
  const grammar = filters.category === 'grammar';
  const exam = filters.category === 'exam';
  const [searchOpen, setSearchOpen] = useState(Boolean(filters.query));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = useDeferredValue(filters.query.trim());
  const reading = useDeferredValue(filters.reading.trim());
  const radical = useDeferredValue(filters.radical.trim());
  const alphabetPage = usePaginatedQuery(
    api.alphabet.search,
    vocabulary || grammar || exam
      ? 'skip'
      : {
          language: 'ja',
          writingSystem: 'Hani',
          archived: filters.archived,
          ...(query ? { query } : {}),
          ...(reading ? { reading } : {}),
          ...(radical ? { radical } : {}),
          ...(filters.level ? { level: filters.level } : {}),
        },
    { initialNumItems: 12 },
  );
  const vocabularyPage = usePaginatedQuery(
    api.vocabulary.search,
    vocabulary
      ? {
          language: 'ja',
          archived: filters.archived,
          ...(query ? { query } : {}),
          ...(filters.level ? { level: filters.level } : {}),
        }
      : 'skip',
    { initialNumItems: 12 },
  );
  const grammarPage = usePaginatedQuery(
    api.grammar.search,
    grammar
      ? {
          language: 'ja',
          archived: filters.archived,
          ...(query ? { query } : {}),
          operator: filters.operator ?? 'AND',
          ...(filters.level ? { level: filters.level } : {}),
        }
      : 'skip',
    { initialNumItems: 12 },
  );
  const examPage = usePaginatedQuery(
    api.exams.search,
    exam
      ? {
          language: 'ja',
          archived: filters.archived,
          ...(query ? { query } : {}),
          ...(filters.level ? { level: filters.level } : {}),
        }
      : 'skip',
    { initialNumItems: 12 },
  );
  const page = exam
    ? examPage
    : grammar
      ? grammarPage
      : vocabulary
        ? vocabularyPage
        : alphabetPage;
  const { status, loadMore } = page;
  useEffect(() => {
    onLoadMoreReady?.(status === 'CanLoadMore' ? () => loadMore(20) : null);
    return () => onLoadMoreReady?.(null);
  }, [onLoadMoreReady, status, loadMore]);
  const filtered = Boolean(query || reading || radical);
  const extraFilters = Boolean(
    filters.reading || filters.radical || filters.archived,
  );
  const label = exam
    ? 'Shiken'
    : grammar
      ? 'Bunpou'
      : vocabulary
        ? 'Kotoba'
        : 'Kanji';
  const kind = exam
    ? 'questões'
    : grammar
      ? 'gramática'
      : vocabulary
        ? 'palavras'
        : 'kanji';
  return (
    <View style={styles.library}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.eyebrow}>
            {exam
              ? 'UM DESAFIO, MAIS CONFIANÇA'
              : grammar
                ? 'ESTRUTURAS PARA SE EXPRESSAR'
                : vocabulary
                  ? 'PALAVRAS & EXPRESSÕES'
                  : 'UM UNIVERSO EM CADA TRAÇO'}
          </Text>
          <Text accessibilityRole="header" style={styles.title}>
            {exam ? '試験' : grammar ? '文法' : vocabulary ? 'ことば' : '漢字'}
            <Text style={styles.romanTitle}> / {label}</Text>
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            exam
              ? 'Nova questão'
              : grammar
                ? 'Nova gramática'
                : vocabulary
                  ? 'Novo vocabulário'
                  : 'Novo kanji'
          }
          onPress={() =>
            onCreate(
              exam
                ? 'exam'
                : grammar
                  ? 'grammar'
                  : vocabulary
                    ? 'vocabulary'
                    : 'alphabet',
            )
          }
          style={({ pressed }) => [styles.add, pressed && ui.pressed]}
        >
          <Text style={styles.addMark}>＋</Text>
        </Pressable>
      </View>
      {filters.level ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              exam
                ? 'Voltar para todas as questões'
                : grammar
                  ? 'Voltar para todas as gramáticas'
                  : vocabulary
                    ? 'Voltar para todas as palavras'
                    : 'Voltar para todos os kanji'
            }
            onPress={() => onFiltersChange({ ...filters, level: '' })}
            style={styles.breadcrumb}
          >
            <Text style={styles.breadcrumbText}>← Todas as coleções</Text>
          </Pressable>
          <View style={styles.collectionHero}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>COLEÇÃO JLPT</Text>
              <Text style={styles.heroLevel}>{filters.level}</Text>
              <Text style={styles.heroName}>
                {collections[filters.level].name}
              </Text>
            </View>
            <View
              style={styles.heroOrbit}
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.heroOrbitInner} />
              <Text style={styles.heroMark}>
                {collections[filters.level].mark}
              </Text>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.collections}>
          <View style={styles.sectionHeading}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Explore por nível
            </Text>
            <Text style={styles.caption}>JLPT · N5 → N1</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shelf}
            accessibilityLabel="Coleções por nível JLPT"
          >
            {jlptLevels.map((level, index) => (
              <Pressable
                key={level}
                accessibilityRole="button"
                accessibilityLabel={'Abrir coleção ' + level + ' de ' + kind}
                onPress={() => onFiltersChange({ ...filters, level })}
                style={({ pressed }) => [
                  styles.collection,
                  index === 0
                    ? styles.firstCollection
                    : index % 2
                      ? styles.lightCollection
                      : styles.darkCollection,
                  pressed && ui.pressed,
                ]}
              >
                <View style={styles.collectionTop}>
                  <Text
                    style={[
                      styles.collectionIndex,
                      index % 2 === 1 && styles.darkText,
                    ]}
                  >
                    0{index + 1}
                  </Text>
                  <Text
                    style={[
                      styles.collectionArrow,
                      index % 2 === 1 && styles.darkText,
                    ]}
                  >
                    ↗
                  </Text>
                </View>
                <View
                  style={styles.collectionRing}
                  importantForAccessibility="no-hide-descendants"
                />
                <Text
                  style={[
                    styles.collectionLevel,
                    index % 2 === 1 && styles.darkText,
                  ]}
                >
                  {level}
                </Text>
                <Text
                  style={[
                    styles.collectionName,
                    index % 2 === 1 && styles.darkText,
                  ]}
                >
                  {collections[level].name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      <View style={styles.archive}>
        <View style={styles.archiveHeading}>
          <View style={styles.titleCopy}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {filters.archived
                ? 'Arquivo'
                : filters.level
                  ? label + ' · ' + filters.level
                  : 'Seu acervo'}
            </Text>
            <Text style={styles.caption}>
              {grammar
                ? 'Por ordem de criação'
                : vocabulary
                  ? 'Hiragana → katakana · あ → ん'
                  : exam
                    ? 'Questões do acervo'
                    : 'Kun’yomi → on’yomi · あ → ん'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              searchOpen || filters.query
                ? 'Fechar busca'
                : 'Buscar na biblioteca'
            }
            accessibilityState={{
              expanded: searchOpen || Boolean(filters.query),
            }}
            onPress={() => {
              const open = searchOpen || Boolean(filters.query);
              setSearchOpen(!open);
              if (open) onFiltersChange({ ...filters, query: '' });
            }}
            style={styles.iconButton}
          >
            <View style={styles.searchGlyph}>
              <View style={styles.searchHandle} />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filtrar biblioteca"
            accessibilityState={{ expanded: filtersOpen }}
            onPress={() => setFiltersOpen(true)}
            style={[styles.iconButton, extraFilters && styles.activeIcon]}
          >
            <View style={styles.filterLine}>
              <View style={styles.filterDot} />
            </View>
            <View style={styles.filterLine}>
              <View style={[styles.filterDot, styles.secondDot]} />
            </View>
          </Pressable>
        </View>
        {(searchOpen || Boolean(filters.query)) && (
          <TextInput
            accessibilityLabel="Buscar na biblioteca"
            placeholder={
              exam
                ? 'Título, enunciado ou seção…'
                : grammar
                  ? 'Estrutura, explicação ou exemplo…'
                  : vocabulary
                    ? 'Palavra, leitura ou tradução…'
                    : 'Kanji, leitura ou significado…'
            }
            placeholderTextColor={palette.muted}
            value={filters.query}
            onChangeText={(value) =>
              onFiltersChange({ ...filters, query: value })
            }
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={120}
            style={styles.searchInput}
          />
        )}
        {grammar && (searchOpen || Boolean(filters.query)) && (
          <View style={ui.field}>
            <Text style={ui.note}>
              Separe termos por espaço. O texto japonês é preservado.
            </Text>
            <View
              style={ui.row}
              accessibilityRole="radiogroup"
              accessibilityLabel="Combinação dos termos da busca"
            >
              <Choice
                label="Todos os termos (AND)"
                selected={(filters.operator ?? 'AND') === 'AND'}
                onPress={() => onFiltersChange({ ...filters, operator: 'AND' })}
              />
              <Choice
                label="Qualquer termo (OR)"
                selected={filters.operator === 'OR'}
                onPress={() => onFiltersChange({ ...filters, operator: 'OR' })}
              />
            </View>
          </View>
        )}
        {(filtered || extraFilters) && (
          <View style={styles.appliedFilters}>
            <Text style={styles.filterDescription}>
              {[
                filters.archived && 'Arquivados',
                query && '“' + query + '”',
                reading && 'Leitura: ' + reading,
                radical && 'Radical: ' + radical,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Limpar filtros de busca"
              onPress={() =>
                onFiltersChange({
                  ...defaultLibraryFilters,
                  category: filters.category,
                  level: filters.level,
                })
              }
              style={styles.clearButton}
            >
              <Text style={styles.clearText}>Limpar</Text>
            </Pressable>
          </View>
        )}
        {page.status === 'LoadingFirstPage' ? (
          <Loading
            label={
              exam
                ? 'Buscando suas questões…'
                : grammar
                  ? 'Buscando suas gramáticas…'
                  : vocabulary
                    ? 'Buscando suas palavras…'
                    : 'Buscando seus kanji…'
            }
          />
        ) : (
          <>
            {page.results.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyMark}>
                  {exam
                    ? '試験'
                    : grammar
                      ? '文法'
                      : vocabulary
                        ? 'ことば'
                        : '字'}
                </Text>
                <Text style={styles.emptyTitle}>
                  {filtered
                    ? 'Nenhum encontro por aqui'
                    : filters.archived
                      ? 'O arquivo está vazio'
                      : 'Uma coleção para começar'}
                </Text>
                <Text style={styles.emptyCopy}>
                  {page.status === 'CanLoadMore' ||
                  page.status === 'LoadingMore'
                    ? 'Continue a busca nos próximos cards.'
                    : filtered
                      ? 'Tente outra palavra ou ajuste os filtros.'
                      : filters.archived
                        ? 'Seus cards arquivados vão aparecer aqui.'
                        : 'Adicione ' +
                          (exam
                            ? 'uma questão'
                            : grammar
                              ? 'uma gramática'
                              : vocabulary
                                ? 'uma palavra'
                                : 'um kanji') +
                          (filters.level
                            ? ' com o nível ' + filters.level
                            : '') +
                          ' pelo botão +.'}
                </Text>
              </View>
            )}
            {exam
              ? examPage.results.map((card) => (
                  <ExamRow
                    key={card._id}
                    card={card}
                    onPress={() => onOpenExam(card._id)}
                  />
                ))
              : grammar
                ? grammarPage.results.map((card) => (
                    <GrammarRow
                      key={card._id}
                      card={card}
                      onPress={() => onOpenGrammar(card._id)}
                    />
                  ))
                : vocabulary
                  ? vocabularyPage.results.map((card) => (
                      <VocabularyRow
                        key={card._id}
                        card={card}
                        onPress={() => onOpenVocabulary(card._id)}
                      />
                    ))
                  : alphabetPage.results.map((card) => (
                      <KanjiRow
                        key={card._id}
                        card={card}
                        onPress={() => onOpen(card._id)}
                      />
                    ))}
            {(page.status === 'CanLoadMore' ||
              page.status === 'LoadingMore') && (
              <Action
                secondary
                label={
                  page.results.length ? 'Ver mais cards' : 'Continuar busca'
                }
                busy={page.status === 'LoadingMore'}
                onPress={() => page.loadMore(20)}
              />
            )}
            {page.results.length > 0 && page.status === 'Exhausted' && (
              <Text style={styles.listEnd}>Seu acervo continua crescendo.</Text>
            )}
          </>
        )}
      </View>
      <Modal
        visible={filtersOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <KeyboardAvoidingView behavior="height" style={styles.modal}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar filtros"
            onPress={() => setFiltersOpen(false)}
            style={styles.backdrop}
          />
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.sheetHandle} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
            >
              <View style={styles.sectionHeading}>
                <Text accessibilityRole="header" style={styles.sheetTitle}>
                  Refine seu acervo
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Fechar painel de filtros"
                  onPress={() => setFiltersOpen(false)}
                  style={styles.iconButton}
                >
                  <Text style={styles.closeMark}>×</Text>
                </Pressable>
              </View>
              <Text style={ui.label}>Onde procurar</Text>
              <View
                style={ui.row}
                accessibilityRole="radiogroup"
                accessibilityLabel="Situação dos cards"
              >
                <Choice
                  label="Ativos"
                  selected={!filters.archived}
                  onPress={() =>
                    onFiltersChange({ ...filters, archived: false })
                  }
                />
                <Choice
                  label="Arquivados"
                  selected={filters.archived}
                  onPress={() =>
                    onFiltersChange({ ...filters, archived: true })
                  }
                />
              </View>
              {!vocabulary && !grammar && !exam && (
                <>
                  <Field
                    label="Leitura kun’yomi ou on’yomi"
                    placeholder="Ex.: がく ou ガク"
                    value={filters.reading}
                    onChangeText={(reading) =>
                      onFiltersChange({ ...filters, reading })
                    }
                    maxLength={120}
                  />
                  <Field
                    label="Radical"
                    placeholder="Ex.: 子"
                    value={filters.radical}
                    onChangeText={(radical) =>
                      onFiltersChange({ ...filters, radical })
                    }
                    maxLength={120}
                  />
                </>
              )}
              {filters.archived && (
                <Notice>
                  Cards arquivados ficam fora das sessões de estudo.
                </Notice>
              )}
              <Action
                label="Ver meu acervo"
                onPress={() => setFiltersOpen(false)}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ExamRow({
  card,
  onPress,
}: {
  card: Doc<'examCards'>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Abrir questão ' + card.title}
      onPress={onPress}
      style={({ pressed }) => [styles.cardRow, pressed && styles.pressedRow]}
    >
      <View style={styles.wordAccent} />
      <View style={styles.rowCopy}>
        <View style={styles.wordTop}>
          <Text numberOfLines={2} style={styles.word}>
            {card.title}
          </Text>
          <LevelChips classifications={card.classifications} />
        </View>
        <Text style={styles.reading}>
          {[card.examReference, card.year, card.section]
            .filter(Boolean)
            .join(' · ') || 'Questão JLPT'}
        </Text>
        <Text numberOfLines={2} style={styles.wordMeaning}>
          {card.prompt}
        </Text>
      </View>
      <Text style={styles.rowArrow}>↗</Text>
    </Pressable>
  );
}

function GrammarRow({
  card,
  onPress,
}: {
  card: Doc<'grammarCards'>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Abrir gramática ' + card.title}
      onPress={onPress}
      style={({ pressed }) => [styles.cardRow, pressed && styles.pressedRow]}
    >
      <View style={styles.wordAccent} />
      <View style={styles.rowCopy}>
        <View style={styles.wordTop}>
          <Text numberOfLines={2} style={styles.word}>
            {card.title}
          </Text>
          <LevelChips classifications={card.classifications} />
        </View>
        <Text numberOfLines={2} style={styles.wordMeaning}>
          {card.shortExplanation || card.explanation}
        </Text>
      </View>
      <Text style={styles.rowArrow}>↗</Text>
    </Pressable>
  );
}

function LevelChips({
  classifications,
}: {
  classifications: { scheme: string; level: string }[];
}) {
  const levels = jlptLevels.filter((level) =>
    classifications.some(
      (item) => item.scheme === 'jlpt' && item.level === level,
    ),
  );
  return (
    <View style={styles.chips}>
      {(levels.length ? levels : ['Sem nível']).map((level) => (
        <View key={level} style={styles.chip}>
          <Text style={styles.chipText}>{level}</Text>
        </View>
      ))}
    </View>
  );
}
function KanjiRow({
  card,
  onPress,
}: {
  card: Doc<'alphabetCards'>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        'Abrir kanji ' + card.symbol + ': ' + card.meanings.join(', ')
      }
      onPress={onPress}
      style={({ pressed }) => [styles.cardRow, pressed && styles.pressedRow]}
    >
      <View style={styles.symbolTile}>
        <Text style={styles.symbol}>{card.symbol}</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={2} style={styles.meaning}>
          {card.meanings.join(' · ')}
        </Text>
        {card.details.kind === 'kanji' && (
          <Text numberOfLines={1} style={styles.reading}>
            {[...card.details.kunYomi, ...card.details.onYomi].join(' · ') ||
              '—'}
          </Text>
        )}
        <LevelChips classifications={card.classifications} />
      </View>
      <Text style={styles.rowArrow}>↗</Text>
    </Pressable>
  );
}
function VocabularyRow({
  card,
  onPress,
}: {
  card: Doc<'vocabularyCards'>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        'Abrir vocabulário ' +
        card.expression +
        ': ' +
        [...(card.translations.pt ?? []), ...(card.translations.en ?? [])].join(
          ', ',
        )
      }
      onPress={onPress}
      style={({ pressed }) => [styles.cardRow, pressed && styles.pressedRow]}
    >
      <View style={styles.wordAccent} />
      <View style={styles.rowCopy}>
        <View style={styles.wordTop}>
          <Text numberOfLines={2} style={styles.word}>
            {card.expression}
          </Text>
          <LevelChips classifications={card.classifications} />
        </View>
        {card.reading && <Text style={styles.reading}>{card.reading}</Text>}
        <Text numberOfLines={2} style={styles.wordMeaning}>
          {[
            ...(card.translations.pt ?? []),
            ...(card.translations.en ?? []),
          ].join(' · ')}
        </Text>
      </View>
      <Text style={styles.rowArrow}>↗</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  library: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleCopy: { flex: 1, gap: 6 },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 1.8,
    fontWeight: '700',
    color: palette.muted,
  },
  title: {
    fontSize: 44,
    lineHeight: 58,
    color: palette.ink,
    fontWeight: '700',
  },
  romanTitle: { fontSize: 14, color: palette.muted, fontWeight: '400' },
  add: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMark: { color: palette.surface, fontSize: 27, lineHeight: 35 },
  collections: { gap: 15 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: palette.ink },
  caption: { fontSize: 11, color: palette.muted, lineHeight: 17 },
  shelf: { gap: 12, paddingBottom: 6, paddingRight: 20 },
  collection: {
    width: 144,
    height: 166,
    borderRadius: 22,
    padding: 18,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  firstCollection: { backgroundColor: palette.blue },
  lightCollection: {
    backgroundColor: palette.mountainSoft,
    borderWidth: 1,
    borderColor: palette.line,
  },
  darkCollection: { backgroundColor: palette.mountainDeep },
  collectionTop: { flexDirection: 'row', justifyContent: 'space-between' },
  collectionIndex: {
    color: palette.surface,
    opacity: 0.75,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
  },
  collectionArrow: { color: palette.surface, fontSize: 20, lineHeight: 22 },
  collectionLevel: {
    fontSize: 44,
    lineHeight: 54,
    color: palette.surface,
    fontWeight: '600',
    letterSpacing: -2,
  },
  collectionName: { color: palette.surface, fontSize: 11, fontWeight: '500' },
  darkText: { color: palette.mountainDeep, opacity: 1 },
  collectionRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(150,180,255,0.32)',
    top: 29,
    right: -49,
  },
  breadcrumb: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: -12,
    marginBottom: -16,
  },
  breadcrumbText: { color: palette.blueDeep, fontSize: 13, fontWeight: '600' },
  collectionHero: {
    minHeight: 186,
    borderRadius: 26,
    padding: 24,
    backgroundColor: palette.navy,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  heroCopy: { flex: 1, gap: 5, zIndex: 1 },
  heroEyebrow: {
    fontSize: 10,
    color: '#ADC2FF',
    letterSpacing: 2,
    fontWeight: '700',
  },
  heroLevel: {
    fontSize: 64,
    lineHeight: 77,
    fontWeight: '600',
    letterSpacing: -3,
    color: palette.surface,
  },
  heroName: { fontSize: 15, color: palette.surface },
  heroOrbit: {
    position: 'absolute',
    right: -20,
    top: 8,
    height: 190,
    width: 190,
    borderWidth: 1,
    borderColor: '#365286',
    borderRadius: 95,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOrbitInner: {
    position: 'absolute',
    width: 145,
    height: 145,
    borderRadius: 73,
    backgroundColor: '#1D3470',
  },
  heroMark: { fontSize: 78, color: '#7497FF', fontWeight: '300' },
  archive: { gap: 14 },
  archiveHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderColor: palette.line,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  activeIcon: { backgroundColor: palette.blueSoft, borderColor: palette.blue },
  searchGlyph: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.6,
    borderColor: palette.ink,
    marginLeft: -3,
    marginTop: -3,
  },
  searchHandle: {
    position: 'absolute',
    width: 7,
    height: 1.6,
    backgroundColor: palette.ink,
    transform: [{ rotate: '45deg' }],
    bottom: -3,
    right: -5,
  },
  filterLine: { height: 1.4, width: 18, backgroundColor: palette.ink },
  filterDot: {
    width: 5,
    height: 5,
    position: 'absolute',
    top: -2,
    left: 3,
    borderWidth: 1.4,
    borderColor: palette.ink,
    borderRadius: 3,
    backgroundColor: palette.surface,
  },
  secondDot: { left: 11 },
  searchInput: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 16,
    color: palette.ink,
    fontSize: 15,
  },
  appliedFilters: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  filterDescription: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 19,
    flex: 1,
  },
  clearButton: { minHeight: 44, justifyContent: 'center' },
  clearText: { color: palette.blueDeep, fontSize: 12, fontWeight: '600' },
  empty: { paddingVertical: 32, gap: 10, alignItems: 'center' },
  emptyMark: { fontSize: 44, color: palette.blue, marginBottom: 6 },
  emptyTitle: {
    fontSize: 18,
    color: palette.ink,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyCopy: {
    color: palette.muted,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 14,
    maxWidth: 290,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 15,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  pressedRow: { backgroundColor: palette.mountainSoft, borderRadius: 16 },
  symbolTile: {
    width: 70,
    height: 78,
    borderRadius: 18,
    backgroundColor: palette.mountainSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: { fontSize: 43, lineHeight: 61, color: palette.mountainDeep },
  rowCopy: { flex: 1, gap: 5, minWidth: 0 },
  meaning: {
    color: palette.ink,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
  },
  reading: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  rowArrow: { color: palette.muted, fontSize: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flexShrink: 1 },
  chip: {
    backgroundColor: palette.mountainSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  chipText: {
    color: palette.mountainDeep,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  wordAccent: {
    alignSelf: 'stretch',
    width: 3,
    backgroundColor: palette.blue,
    borderRadius: 3,
    marginVertical: 5,
  },
  wordTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flexWrap: 'wrap',
  },
  word: { fontSize: 25, lineHeight: 35, color: palette.ink, flexShrink: 1 },
  wordMeaning: { color: palette.ink, fontSize: 14, lineHeight: 21 },
  listEnd: {
    color: palette.muted,
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 24,
  },
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(10,22,50,0.42)',
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.line,
    alignSelf: 'center',
  },
  sheetContent: { padding: 24, paddingBottom: 36, gap: 18 },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: palette.ink },
  closeMark: { fontSize: 27, color: palette.ink },
});
