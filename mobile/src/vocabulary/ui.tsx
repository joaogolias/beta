import { StyleSheet, Text, View } from 'react-native';
import { ui } from '../alphabet/ui';
import { palette } from '../theme';

export function VocabularyPreview({
  front,
  back,
}: {
  front: string;
  back: string;
}) {
  return (
    <View style={ui.stack}>
      <View style={styles.front}>
        <Text style={styles.label}>FRENTE</Text>
        <Text selectable style={styles.expression}>
          {front || 'Sua palavra ou expressão'}
        </Text>
      </View>
      <View style={styles.back}>
        <Text style={styles.label}>VERSO</Text>
        <Text selectable style={styles.answer}>
          {back || 'Leitura e traduções'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  front: {
    padding: 20,
    gap: 20,
    borderRadius: 24,
    backgroundColor: palette.stoneSoft,
    borderWidth: 1,
    borderColor: palette.line,
  },
  back: {
    padding: 20,
    gap: 18,
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  label: {
    color: palette.stoneDeep,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  expression: {
    color: palette.ink,
    fontSize: 32,
    lineHeight: 45,
    textAlign: 'center',
    paddingVertical: 12,
  },
  answer: { color: palette.ink, fontSize: 19, lineHeight: 29 },
});
