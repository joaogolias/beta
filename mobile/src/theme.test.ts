import { expect, test } from 'vitest';
import { palette, textureOpacity } from './theme';

function rgb(hex: string) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance(channels: number[]) {
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground: string, background: number[]) {
  const a = luminance(rgb(foreground));
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.each([
  ['ink', 'background'],
  ['muted', 'background'],
  ['ink', 'surface'],
  ['muted', 'surface'],
  ['primary', 'surface'],
  ['secondary', 'surface'],
  ['tertiary', 'surface'],
  ['stoneDeep', 'stoneSoft'],
  ['muted', 'stoneSoft'],
  ['primaryDeep', 'primarySoft'],
  ['muted', 'primarySoft'],
  ['secondaryDeep', 'secondarySoft'],
  ['tertiaryDeep', 'tertiarySoft'],
  ['error', 'errorSoft'],
  ['surface', 'primary'],
  ['surface', 'secondary'],
  ['surface', 'tertiary'],
  ['surface', 'stoneDeep'],
  ['surface', 'forest'],
  ['onForest', 'forest'],
] as const)(
  '%s on %s meets WCAG AA for normal text',
  (foreground, background) => {
    expect(
      contrast(palette[foreground], rgb(palette[background])),
    ).toBeGreaterThanOrEqual(4.5);
  },
);

// A black/white source pixel bounds any pixel of the bundled stone artwork.
// Check small labels too, so adding texture cannot silently reduce readability.
test.each([
  ['surface', 'primary', 'dark'],
  ['surface', 'secondary', 'dark'],
  ['surface', 'stoneDeep', 'dark'],
  ['surface', 'forest', 'dark'],
  ['onForest', 'forest', 'dark'],
  ['stoneDeep', 'tertiarySoft', 'light'],
  ['stoneDeep', 'stoneSoft', 'light'],
  ['secondaryDeep', 'secondarySoft', 'light'],
  ['ink', 'secondarySoft', 'light'],
  ['muted', 'secondarySoft', 'light'],
] as const)(
  '%s stays legible over textured %s',
  (foreground, background, tone) => {
    for (const sourcePixel of [0, 255]) {
      const alpha = textureOpacity[tone];
      const composite = rgb(palette[background]).map(
        (channel) => channel * (1 - alpha) + sourcePixel * alpha,
      );
      expect(contrast(palette[foreground], composite)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  },
);
