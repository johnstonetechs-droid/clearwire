/**
 * ClearWire brand tokens.
 *
 * IMPORTANT: Replace these values with the actual `T = {...}` object
 * from apps/website/ClearWireWebsite.jsx so both the website and the
 * native app stay visually in sync.
 */
export const T = {
  // Colors — placeholders, replace with values from ClearWireWebsite.jsx
  bg: '#0B0F14',
  surface: '#121821',
  surfaceAlt: '#1A2230',
  text: '#E6EDF3',
  textMuted: '#8B98A5',
  textDim: '#5C6B7A',
  primary: '#00D4FF',
  primaryDark: '#0099CC',
  accent: '#FFB020',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  border: '#2A3441',

  // Spacing scale (matches common 4pt grid)
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  // Type scale
  font: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    display: 34,
  },

  // Radii
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    pill: 999,
  },
} as const;

export type BrandTokens = typeof T;
