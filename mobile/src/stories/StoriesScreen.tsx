import { Pressable, StyleSheet, Text, View } from 'react-native';
import { STORY_LEVELS } from '../../../shared/stories';
import { Action, Loading, Notice } from '../alphabet/ui';
import { palette } from '../theme';
import { StudyEntry } from '../study/StudyEntry';
import { useStories } from './hooks';
import { readingMinutes, type StoryFilters } from './presentation';

export function StoriesEntry({ onPress }: { onPress: () => void }) {
  return (
    <StudyEntry
      title="Monogatari"
      glyph="物語"
      caption="Histórias · leia em japonês"
      onPress={onPress}
    />
  );
}

export function StoriesScreen({
  filters,
  onFiltersChange,
  onOpen,
}: {
  filters: StoryFilters;
  onFiltersChange: (filters: StoryFilters) => void;
  onOpen: (id: string) => void;
}) {
  const { items, loading, error, hasMore, loadingMore, loadMore, offline } =
    useStories(filters);
  const filtered = filters.level !== undefined || filters.status !== 'all';
  return (
    <View style={styles.screen}>
      <View style={styles.heading}>
        <Text style={styles.kicker}>物語 · MONOGATARI</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Histórias
        </Text>
        <Text style={styles.subtitle}>
          Leia, descubra e pratique a compreensão.
        </Text>
      </View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Estado da leitura"
        style={styles.statusRow}
      >
        {(
          [
            { value: 'all', label: 'Todas' },
            { value: 'new', label: 'Novas' },
            { value: 'completed', label: 'Concluídas' },
          ] as const
        ).map(({ value, label }) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: filters.status === value }}
            onPress={() => onFiltersChange({ ...filters, status: value })}
            style={[
              styles.status,
              filters.status === value && styles.statusSelected,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filters.status === value && styles.selectedText,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Nível das histórias"
        style={styles.levelRow}
      >
        {[undefined, ...STORY_LEVELS].map((level) => (
          <Pressable
            key={level ?? 'all'}
            accessibilityRole="radio"
            accessibilityLabel={level ? `Nível ${level}` : 'Todos os níveis'}
            accessibilityState={{ checked: filters.level === level }}
            onPress={() => onFiltersChange({ ...filters, level })}
            style={[
              styles.level,
              filters.level === level && styles.levelSelected,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filters.level === level && styles.selectedText,
              ]}
            >
              {level ?? 'Todos'}
            </Text>
          </Pressable>
        ))}
      </View>
      {offline && (
        <Text style={styles.note}>
          Mostrando histórias salvas neste aparelho.
        </Text>
      )}
      {error && <Notice error>{error}</Notice>}
      {loading ? (
        <Loading label="Abrindo suas histórias…" />
      ) : !items.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyGlyph} accessible={false}>
            物語
          </Text>
          <Text accessibilityRole="header" style={styles.emptyTitle}>
            {filtered
              ? 'Nenhuma história por aqui.'
              : 'Seu próximo capítulo começa aqui.'}
          </Text>
          <Text style={styles.subtitle}>
            {filtered
              ? 'Experimente outro nível ou veja todas as leituras.'
              : 'Peça ao GPT uma história no seu nível. Ela aparecerá aqui com perguntas para praticar.'}
          </Text>
          {filtered && (
            <Action
              secondary
              label="Ver todas as histórias"
              onPress={() => onFiltersChange({ status: 'all' })}
            />
          )}
        </View>
      ) : (
        items.map((story) => {
          const completed = story.progress?.completedAt !== undefined;
          const started = story.progress !== null;
          const action = completed
            ? 'Reler'
            : started
              ? story.progress?.answers.length
                ? 'Continuar perguntas'
                : 'Continuar leitura'
              : 'Ler história';
          return (
            <Pressable
              key={story.id}
              accessibilityRole="button"
              accessibilityLabel={`${action}: ${story.title}, ${story.level}`}
              onPress={() => onOpen(story.id)}
              style={({ pressed }) => [
                styles.card,
                started && !completed && styles.cardInProgress,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.cardMeta}>
                <Text style={styles.levelBadge}>{story.level}</Text>
                <Text style={[styles.state, completed && styles.complete]}>
                  {completed
                    ? '✓ Concluída'
                    : started
                      ? story.progress?.answers.length
                        ? 'Em compreensão'
                        : 'Em leitura'
                      : 'Nova'}
                </Text>
              </View>
              <Text style={styles.cardTitle}>{story.title}</Text>
              <Text style={styles.note}>
                ~{readingMinutes(story.characterCount)} min de leitura ·{' '}
                {story.questionCount}{' '}
                {story.questionCount === 1 ? 'pergunta' : 'perguntas'}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardAction}>{action}</Text>
                <Text style={styles.cardArrow} accessible={false}>
                  →
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
      {hasMore && (
        <Action
          secondary
          label="Mais histórias"
          busy={loadingMore}
          onPress={loadMore}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 16, width: '100%', maxWidth: 620, alignSelf: 'center' },
  heading: { gap: 8, paddingBottom: 6 },
  kicker: {
    fontSize: 11,
    lineHeight: 18,
    letterSpacing: 1.5,
    fontWeight: '700',
    color: palette.primary,
  },
  title: {
    fontSize: 30,
    lineHeight: 37,
    fontWeight: '800',
    color: palette.ink,
    letterSpacing: -0.8,
  },
  subtitle: { fontSize: 15, lineHeight: 23, color: palette.muted },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: palette.stoneSoft,
    padding: 4,
    borderRadius: 16,
    gap: 4,
  },
  status: {
    flexGrow: 1,
    minWidth: 80,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  statusSelected: { backgroundColor: palette.surface },
  filterText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: '100%',
  },
  selectedText: { color: palette.primaryDeep, fontWeight: '800' },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  level: {
    minWidth: 48,
    paddingHorizontal: 12,
    minHeight: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.line,
  },
  levelSelected: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.primary,
  },
  note: { color: palette.muted, fontSize: 12, lineHeight: 19 },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  cardInProgress: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  levelBadge: {
    backgroundColor: palette.stoneSoft,
    color: palette.stoneDeep,
    fontSize: 12,
    fontWeight: '800',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  state: { color: palette.muted, fontSize: 12, fontWeight: '600' },
  complete: { color: palette.primary },
  cardTitle: {
    color: palette.ink,
    fontSize: 23,
    lineHeight: 34,
    fontWeight: '700',
  },
  cardFooter: {
    borderTopWidth: 1,
    borderColor: palette.line,
    paddingTop: 10,
    marginTop: 2,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardAction: { color: palette.primary, fontSize: 14, fontWeight: '700' },
  cardArrow: { color: palette.primary, fontSize: 22 },
  pressed: { opacity: 0.75 },
  empty: {
    padding: 24,
    gap: 14,
    backgroundColor: palette.surface,
    borderRadius: 20,
  },
  emptyGlyph: { fontSize: 36, color: palette.primary },
  emptyTitle: {
    color: palette.ink,
    fontSize: 21,
    lineHeight: 29,
    fontWeight: '700',
  },
});
