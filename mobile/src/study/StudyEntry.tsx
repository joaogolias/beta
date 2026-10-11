import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme';

export function StudyEntry({
  title,
  glyph,
  caption,
  onPress,
  tone = 'forest',
}: {
  title: string;
  glyph: string;
  caption: string;
  onPress: () => void;
  tone?: 'forest' | 'stone';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${glyph} · ${title} · ${caption}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.entry,
        tone === 'stone' && styles.stone,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.mark} accessible={false}>
        <Text style={styles.glyph}>{glyph}</Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
      <Text
        accessible={false}
        importantForAccessibility="no"
        style={styles.arrow}
      >
        ↗
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: {
    minHeight: 104,
    borderRadius: 18,
    backgroundColor: palette.forest,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stone: { backgroundColor: palette.stoneDeep },
  pressed: { opacity: 0.85 },
  mark: {
    width: 84,
    height: 84,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.onDarkLine,
    borderRadius: 16,
    backgroundColor: palette.onDarkSurface,
  },
  glyph: { color: palette.surface, fontSize: 27, fontWeight: '600' },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: {
    color: palette.surface,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  caption: {
    color: palette.surface,
    fontSize: 13,
    lineHeight: 18,
    minHeight: 36,
  },
  arrow: { color: palette.surface, fontSize: 25 },
});
