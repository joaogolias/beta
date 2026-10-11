// Pine, sandstone and ochre, grounded in warm chalk and granite neutrals.
// Keep text on the solid surfaces; RockTexture is a subtle decorative layer.
export const palette = {
  background: '#F5F1E8',
  surface: '#FFFCF6',
  ink: '#292C25',
  muted: '#625F54',
  line: '#D8D1C3',
  primary: '#2E5948',
  primaryDeep: '#203F33',
  primarySoft: '#E2ECE2',
  secondary: '#9B4E32',
  secondaryDeep: '#773923',
  secondarySoft: '#F4E5DA',
  tertiary: '#876526',
  tertiaryDeep: '#684B18',
  tertiarySoft: '#F2E8CC',
  stone: '#696557',
  stoneDeep: '#494A40',
  stoneSoft: '#E9E4DA',
  forest: '#203B31',
  onForest: '#DCE8D5',
  onForestMuted: '#B7CAA8',
  error: '#A93529',
  errorSoft: '#FBE8E1',
  scrim: 'rgba(32, 43, 34, 0.55)',
  onDarkLine: 'rgba(255, 252, 246, 0.28)',
  onDarkSurface: 'rgba(255, 252, 246, 0.14)',
  primaryShadow: 'rgba(46, 89, 72, 0.22)',
} as const;

// Bound the texture contrast even when a source pixel is pure white or black.
export const textureOpacity = { light: 0.055, dark: 0.09 } as const;
