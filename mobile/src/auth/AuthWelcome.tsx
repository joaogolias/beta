import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { palette } from '../theme';
import { IbexMascot } from '../brand/IbexMascot';

export function AuthWelcome({ showHero }: { showHero: boolean }) {
  const { height, width, fontScale } = useWindowDimensions();
  const compact = height < 720 || width < 390;
  const showArtwork = width >= 330 && fontScale < 1.3;

  return (
    <View style={styles.welcome}>
      <View style={styles.brand}>
        <View style={styles.brandLockup}>
          <IbexMascot size={36} portrait animated={false} />
          <Text style={styles.brandName}>beta</Text>
        </View>
        <View style={styles.languageTag}>
          <Text style={styles.languageLabel}>JAPONÊS</Text>
          <Text style={styles.languageArrow} accessible={false}>
            ↗
          </Text>
        </View>
      </View>

      {showHero && (
        <View style={[styles.hero, compact && styles.heroCompact]}>
          <View style={styles.heroTopline}>
            <View style={styles.heroDot} />
            <Text style={styles.heroEyebrow}>UM POUCO, TODO DIA.</Text>
          </View>
          <Text
            accessibilityRole="header"
            style={[
              styles.headline,
              compact && styles.headlineCompact,
              showArtwork && styles.headlineWithArt,
            ]}
          >
            Japonês,{'\n'}no seu{'\n'}ritmo.
          </Text>
          {showArtwork && (
            <View
              style={[styles.artwork, compact && styles.artworkCompact]}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.orbit} />
              <View style={styles.orbitInner} />
              <IbexMascot size={188} mood="welcome" />
            </View>
          )}
          <View style={styles.heroBottom}>
            <View style={styles.heroRule} />
            <Text style={styles.heroCaption}>Cada passo, com a Betinha.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  welcome: { gap: 22 },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandName: {
    color: palette.ink,
    fontWeight: '900',
    fontSize: 23,
    letterSpacing: -1,
  },
  languageTag: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  languageLabel: {
    color: palette.ink,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  languageArrow: { color: palette.blue, fontSize: 22 },
  hero: {
    backgroundColor: palette.blue,
    borderRadius: 28,
    padding: 24,
    minHeight: 286,
    overflow: 'hidden',
    justifyContent: 'space-between',
    gap: 15,
  },
  heroCompact: { minHeight: 258, padding: 22, gap: 10 },
  heroTopline: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.surface,
  },
  heroEyebrow: {
    color: palette.surface,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.7,
  },
  headline: {
    color: palette.surface,
    fontSize: 43,
    lineHeight: 44,
    fontWeight: '900',
    letterSpacing: -1.8,
    zIndex: 1,
  },
  headlineCompact: { fontSize: 35, lineHeight: 37 },
  headlineWithArt: { maxWidth: '65%' },
  heroBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroRule: { height: 1, width: 20, backgroundColor: '#AFC3FF' },
  heroCaption: { color: palette.surface, fontSize: 11, flexShrink: 1 },
  artwork: {
    position: 'absolute',
    width: 188,
    height: 188,
    right: -8,
    top: 68,
  },
  artworkCompact: { right: -8, top: 68, transform: [{ scale: 0.8 }] },
  orbit: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: '#5681FF',
    top: -13,
    left: -32,
  },
  orbitInner: {
    position: 'absolute',
    width: 192,
    height: 192,
    borderRadius: 96,
    borderWidth: 1,
    borderColor: '#5681FF',
    top: 20,
    left: 2,
  },
});
