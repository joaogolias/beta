import { StyleSheet, Text, View } from 'react-native';
import { QuestsEntry } from '../quests/QuestsScreen';
import { StoriesEntry } from '../stories/StoriesScreen';
import { palette } from '../theme';
import { StudyEntry } from './StudyEntry';

export function StudyHome({
  onQuests,
  onStories,
  onFlashcards,
}: {
  onQuests: () => void;
  onStories: () => void;
  onFlashcards: () => void;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.heading}>
        <Text style={styles.kicker}>勉強 · BENKYOU</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Como vamos estudar?
        </Text>
        <Text style={styles.subtitle}>Escolha sua prática de hoje.</Text>
      </View>
      <QuestsEntry onPress={onQuests} />
      <StoriesEntry onPress={onStories} />
      <StudyEntry
        title="Anki"
        glyph="暗記"
        caption="Flashcards · exercite a memória"
        tone="stone"
        onPress={onFlashcards}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  heading: { gap: 6, marginBottom: 8 },
  kicker: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: palette.ink,
    fontSize: 28,
    lineHeight: 35,
    fontWeight: '800',
  },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 21 },
});
