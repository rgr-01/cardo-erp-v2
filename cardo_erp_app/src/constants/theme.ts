/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Cores da marca (manual Rede Agro): azul-petróleo #19323b e verde #00DC4D.
export const Colors = {
  light: {
    text: '#19323b',
    background: '#fcfcfa',
    backgroundElement: '#ecf1f3',
    backgroundSelected: '#d6dfe2',
    textSecondary: '#4a6670',
    textMuted: '#67818a',
    border: '#d6dfe2',
    accent: '#00a63a',
    accentBg: '#e6f9ec',
    success: '#00a63a',
    successBg: '#e6f9ec',
    warning: '#B45309',
    warningBg: '#FDF1DC',
    danger: '#DC2626',
    dangerBg: '#FCE8E7',
    onAccent: '#ffffff',
  },
  dark: {
    text: '#ecf1f3',
    background: '#10232a',
    backgroundElement: '#19323b',
    backgroundSelected: '#24434e',
    textSecondary: '#b5c4ca',
    textMuted: '#8ea3ab',
    border: '#24434e',
    accent: '#00dc4d',
    accentBg: '#0e3f2f',
    success: '#00dc4d',
    successBg: '#0e3f2f',
    warning: '#D99A2B',
    warningBg: '#3a2e17',
    danger: '#EF4444',
    dangerBg: '#3b1d1d',
    onAccent: '#19323b',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const Radius = { sm: 8, md: 12, pill: 999 } as const;
