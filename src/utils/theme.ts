export const colors = {
  background: '#FFF9EF',
  text: '#000000',
  textMuted: '#7F5E57',
  cardBorder: '#7F5E57',
  navBg: 'rgba(0, 0, 0, 0.72)',
  navPillActive: 'rgba(255, 255, 255, 0.1)',
  navPillActiveBorder: 'rgba(255, 255, 255, 0.2)',
  navIconActive: '#FFFFFF',
  navIconInactive: 'rgba(255, 255, 255, 0.6)',
} as const;

export const mealTheme = {
  breakfast: { bg: '#FFEFD6', border: '#FFE0AF', pill: '#FFE0AF' },
  lunch: { bg: '#ECD9CD', border: '#DAB49D', pill: '#DAB49D' },
  dinner: { bg: '#E8C5B3', border: '#D38C69', pill: '#D38C69' },
  snack: { bg: '#CFABA3', border: '#A05848', pill: '#A05848' },
} as const;

export const fonts = {
  regular: 'SchibstedGrotesk_400Regular',
  medium: 'SchibstedGrotesk_500Medium',
  extraBold: 'SchibstedGrotesk_800ExtraBold',
} as const;
