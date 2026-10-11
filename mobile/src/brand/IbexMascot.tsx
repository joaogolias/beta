import { useEffect, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Image,
  Platform,
  View,
} from 'react-native';
import type { IbexMood } from '../../../shared/ibex';
import { ibexArtwork, ibexPortrait } from './artwork';
import { useMotionPreference } from '../study/useMotionPreference';
import { palette } from '../theme';

type Accent = {
  kind: 'sparkle' | 'sleep' | 'slip' | 'dust';
  x: number;
  y: number;
  size: number;
  dx: number;
  dy: number;
  delay: number;
};

const accents: Record<IbexMood, Accent[]> = {
  welcome: [],
  celebrate: [
    {
      kind: 'sparkle',
      x: 0.6,
      y: 0.13,
      size: 0.065,
      dx: 0,
      dy: -0.025,
      delay: 0,
    },
    {
      kind: 'sparkle',
      x: 0.79,
      y: 0.11,
      size: 0.045,
      dx: 0.01,
      dy: -0.02,
      delay: 0.12,
    },
    {
      kind: 'sparkle',
      x: 0.88,
      y: 0.24,
      size: 0.035,
      dx: 0.01,
      dy: -0.025,
      delay: 0.24,
    },
  ],
  rest: [
    {
      kind: 'sleep',
      x: 0.35,
      y: 0.43,
      size: 0.05,
      dx: 0.02,
      dy: -0.04,
      delay: 0,
    },
    {
      kind: 'sleep',
      x: 0.42,
      y: 0.37,
      size: 0.037,
      dx: 0.02,
      dy: -0.045,
      delay: 0.2,
    },
  ],
  sad: [
    {
      kind: 'slip',
      x: 0.065,
      y: 0.68,
      size: 0.04,
      dx: -0.01,
      dy: 0.055,
      delay: 0,
    },
    {
      kind: 'slip',
      x: 0.23,
      y: 0.8,
      size: 0.025,
      dx: -0.015,
      dy: 0.04,
      delay: 0.12,
    },
    {
      kind: 'slip',
      x: 0.34,
      y: 0.88,
      size: 0.03,
      dx: -0.01,
      dy: 0.035,
      delay: 0.22,
    },
  ],
  angry: [
    {
      kind: 'dust',
      x: 0.44,
      y: 0.85,
      size: 0.024,
      dx: -0.045,
      dy: -0.04,
      delay: 0,
    },
    {
      kind: 'dust',
      x: 0.51,
      y: 0.91,
      size: 0.032,
      dx: -0.035,
      dy: -0.025,
      delay: 0.1,
    },
    {
      kind: 'dust',
      x: 0.63,
      y: 0.84,
      size: 0.018,
      dx: 0.015,
      dy: -0.04,
      delay: 0.05,
    },
    {
      kind: 'dust',
      x: 0.76,
      y: 0.88,
      size: 0.03,
      dx: 0.05,
      dy: -0.03,
      delay: 0.15,
    },
    {
      kind: 'dust',
      x: 0.81,
      y: 0.92,
      size: 0.022,
      dx: 0.04,
      dy: -0.02,
      delay: 0.22,
    },
  ],
};

const accentDuration: Record<IbexMood, number> = {
  welcome: 600,
  celebrate: 1400,
  rest: 2200,
  sad: 850,
  angry: 1000,
};

/** Betinha's scenery stays still; brief accents play once after the art loads. */
export function IbexMascot({
  size = 120,
  mood = 'welcome',
  animated = true,
  portrait = false,
  accessibilityLabel,
}: {
  size?: number;
  mood?: IbexMood;
  animated?: boolean;
  portrait?: boolean;
  /** Omit when nearby text already describes Betinha: the art is decorative. */
  accessibilityLabel?: string;
}) {
  const reducedMotion = useMotionPreference();
  const [entrance] = useState(() => new Animated.Value(1));
  const [progress] = useState(() => new Animated.Value(1));
  const [loadedArtwork, setLoadedArtwork] = useState<string>();
  const artworkKey = portrait ? 'portrait' : mood;
  const canAnimate = animated && !reducedMotion && !portrait;

  useEffect(() => {
    entrance.setValue(1);
    progress.setValue(1);
    if (
      !canAnimate ||
      loadedArtwork !== artworkKey ||
      AppState.currentState !== 'active'
    ) {
      return;
    }

    entrance.setValue(mood === 'welcome' ? 0.35 : 0.65);
    progress.setValue(0);
    const motion = Animated.parallel([
      Animated.timing(entrance, {
        toValue: 1,
        duration: mood === 'welcome' ? 600 : 360,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.timing(progress, {
        toValue: 1,
        delay: 100,
        duration: accentDuration[mood],
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]);
    const stop = () => {
      motion.stop();
      entrance.setValue(1);
      progress.setValue(1);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stop();
    });
    // Android may blur for the notification drawer without changing AppState.
    const blurSubscription =
      Platform.OS === 'android'
        ? AppState.addEventListener('blur', stop)
        : undefined;
    motion.start();
    return () => {
      stop();
      subscription.remove();
      blurSubscription?.remove();
    };
  }, [artworkKey, canAnimate, entrance, loadedArtwork, mood, progress]);

  const hasLabel = Boolean(accessibilityLabel);
  return (
    <View
      style={{ width: size, height: size }}
      pointerEvents="none"
      accessible={hasLabel}
      accessibilityRole={hasLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!hasLabel}
      importantForAccessibility={hasLabel ? 'yes' : 'no-hide-descendants'}
    >
      <Animated.View style={{ opacity: canAnimate ? entrance : 1 }}>
        <Image
          key={artworkKey}
          source={portrait ? ibexPortrait : ibexArtwork[mood]}
          style={{ width: size, height: size }}
          resizeMode="contain"
          accessible={false}
          fadeDuration={0}
          onLoad={() => setLoadedArtwork(artworkKey)}
        />
      </Animated.View>
      {canAnimate &&
        loadedArtwork === artworkKey &&
        accents[mood].map((accent) => (
          <MascotAccent
            key={accent.x}
            accent={accent}
            progress={progress}
            size={size}
          />
        ))}
    </View>
  );
}

function MascotAccent({
  accent,
  progress,
  size,
}: {
  accent: Accent;
  progress: Animated.Value;
  size: number;
}) {
  const extent = size * accent.size;
  const peakOpacity = accent.kind === 'sleep' ? 0.38 : 0.85;
  const phase = progress.interpolate({
    inputRange: [accent.delay, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: size * accent.x,
        top: size * accent.y,
        opacity: phase.interpolate({
          inputRange: [0, 0.18, 0.55, 1],
          outputRange: [0, peakOpacity, peakOpacity * 0.75, 0],
        }),
        transform: [
          {
            translateX: phase.interpolate({
              inputRange: [0, 1],
              outputRange: [0, size * accent.dx],
            }),
          },
          {
            translateY: phase.interpolate({
              inputRange: [0, 1],
              outputRange: [0, size * accent.dy],
            }),
          },
          {
            scale: phase.interpolate({
              inputRange: [0, 0.22, 1],
              outputRange: [0.65, 1, accent.kind === 'dust' ? 1.8 : 1.05],
            }),
          },
        ],
      }}
    >
      {accent.kind === 'sparkle' || accent.kind === 'sleep' ? (
        <Animated.Text
          allowFontScaling={false}
          style={{
            fontSize: extent,
            lineHeight: extent * 1.2,
            fontWeight: '700',
            color: accent.kind === 'sparkle' ? palette.tertiary : palette.stone,
            includeFontPadding: false,
          }}
        >
          {accent.kind === 'sparkle' ? '✦' : 'z'}
        </Animated.Text>
      ) : (
        <View
          style={{
            width: accent.kind === 'slip' ? Math.max(1, size * 0.006) : extent,
            height: extent,
            borderRadius: extent,
            backgroundColor:
              accent.kind === 'slip'
                ? palette.secondarySoft
                : palette.stoneSoft,
            borderColor: palette.line,
            borderWidth: accent.kind === 'dust' ? 0.5 : 0,
            transform: accent.kind === 'slip' ? [{ rotate: '16deg' }] : [],
          }}
        />
      )}
    </Animated.View>
  );
}
