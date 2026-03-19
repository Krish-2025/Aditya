/**
 * KuroTasker-inspired theme: dark, minimal, rich feel.
 * Muted accents to avoid eye strain.
 */

import { Platform } from 'react-native';

// --- App theme (dark, minimal, rich)
export const AppTheme = {
  // Surfaces (darker base)
  background: '#000000',
  surface: '#14172B',
  surfaceElevated: '#1A1D32',
  card: '#14172B',

  // Borders
  border: '#23273A',
  borderMuted: '#1C1F32',

  // Text
  text: '#E8E9F0',
  textSecondary: '#8B8FA3',
  textMuted: '#6B6F82',

  // Muted accents (not neon — easy on eyes)
  accent: '#6C9BCF',       // soft blue (primary actions)
  accentPurple: '#9B8EC7', // score / stats
  accentGreen: '#7CB083',  // completed / success
  accentAmber: '#C4A35A',  // skipped / warning
  accentOrange: '#C4865A', // postponed / secondary
  accentRed: '#B87A7A',    // failed / destructive (muted)

  // Dot grid
  dotGrid: 'rgba(139, 143, 163, 0.12)',

  // Tab bar
  tabBarBg: '#171A2E',
  tabBarBorder: '#2A2E4A',
  tabActive: '#6C9BCF',
  tabInactive: '#6B6F82',
} as const;

// Legacy compatibility
const tintColorLight = '#0a7ea4';
const tintColorDark = AppTheme.accent;

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: AppTheme.text,
    background: AppTheme.background,
    tint: tintColorDark,
    icon: AppTheme.textSecondary,
    tabIconDefault: AppTheme.textMuted,
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
