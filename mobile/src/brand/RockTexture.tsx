import { Image, StyleSheet, View } from 'react-native';
import { textureOpacity } from '../theme';
import { rockArtwork } from './rockArtwork';

/** Decorative stone layer: render first inside a rounded, clipped surface. */
export function RockTexture({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.fill}
    >
      <Image
        source={rockArtwork}
        resizeMode="cover"
        accessible={false}
        style={[styles.fill, { opacity: textureOpacity[tone] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
