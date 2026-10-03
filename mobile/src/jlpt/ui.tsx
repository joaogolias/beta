import { StyleSheet, Text, View } from 'react-native';
import { blocksForLevel, type JlptLevel } from '../../../shared/jlpt';
import { palette } from '../theme';

export function BlockPlan({ level }: { level: JlptLevel }) {
  return (
    <View style={styles.stack}>
      {blocksForLevel(level).map((block, index) => (
        <View key={block.id} style={styles.block}>
          <Text style={styles.blockNumber}>{index + 1}</Text>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{block.title}</Text>
            <Text style={styles.meta}>{block.minutes} minutos</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: 20 },
  stack: { gap: 12 },
  flex: { flex: 1, minWidth: 0, gap: 5 },
  eyebrow: {
    color: palette.blue,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    color: palette.ink,
    fontSize: 42,
    fontWeight: '700',
    lineHeight: 54,
  },
  intro: { color: palette.muted, fontSize: 16, lineHeight: 24 },
  hero: {
    backgroundColor: palette.navy,
    borderRadius: 26,
    padding: 24,
    gap: 14,
  },
  heroTitle: {
    color: palette.surface,
    fontSize: 27,
    fontWeight: '700',
    lineHeight: 36,
  },
  heroCopy: { color: '#BCD0FF', fontSize: 14, lineHeight: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: 21,
    lineHeight: 28,
    color: palette.ink,
    fontWeight: '700',
  },
  card: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    gap: 12,
  },
  cardTitle: {
    color: palette.ink,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '700',
  },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 19 },
  block: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  blockNumber: {
    color: palette.blue,
    fontSize: 24,
    fontWeight: '700',
    width: 34,
  },
  levelTile: {
    padding: 20,
    borderRadius: 20,
    width: 116,
    minHeight: 112,
    backgroundColor: palette.mountainSoft,
    justifyContent: 'space-between',
  },
  activeLevel: { backgroundColor: palette.blue },
  levelLabel: { color: palette.mountainDeep, fontSize: 31, fontWeight: '700' },
  white: { color: palette.surface },
  levelCaption: { color: palette.mountainDeep, fontSize: 10, lineHeight: 16 },
  outlineButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.mountainSoft,
  },
  buttonText: { color: palette.mountainDeep, fontSize: 13, fontWeight: '600' },
  questionText: { color: palette.ink, fontSize: 19, lineHeight: 31 },
  passage: {
    backgroundColor: palette.mountainSoft,
    padding: 18,
    borderRadius: 16,
  },
  option: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  selectedOption: {
    backgroundColor: palette.blueSoft,
    borderColor: palette.blue,
  },
  optionNumber: {
    color: palette.blue,
    fontWeight: '800',
    fontSize: 17,
    width: 22,
  },
  optionText: { flex: 1, color: palette.ink, fontSize: 17, lineHeight: 26 },
  timer: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: palette.navy,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  timerNumber: {
    color: palette.surface,
    fontSize: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timerCaption: { color: '#BCD0FF', fontSize: 11, lineHeight: 18 },
  questionNumber: {
    width: 46,
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  answeredNumber: { backgroundColor: palette.blueSoft },
  currentNumber: { borderWidth: 2, borderColor: palette.blue },
  numberText: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  flagText: { color: palette.blueDeep, fontSize: 9 },
  dimmed: { opacity: 0.5 },
  modal: {
    flex: 1,
    backgroundColor: 'rgba(10,22,50,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: palette.surface,
    borderRadius: 24,
    padding: 24,
    gap: 18,
    maxHeight: '90%',
  },
  score: {
    color: palette.blue,
    fontSize: 60,
    fontWeight: '700',
    lineHeight: 72,
  },
  image: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    backgroundColor: palette.mountainSoft,
  },
});
