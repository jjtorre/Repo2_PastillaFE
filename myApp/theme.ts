// theme.ts
// Paleta y constantes visuales compartidas por toda la app.
// Pensado para usuarios adultos mayores: alto contraste, texto grande.

export const colors = {
  background: '#FBF8F3',
  surface: '#FFFFFF',
  surfaceBorder: '#E5DFD3',
  inputBorder: '#D6D0C2',
  divider: '#EFEAE0',

  textPrimary: '#1F3A3D',
  textSecondary: '#8B7355',

  header: '#1F3A3D',
  headerText: '#FBF8F3',

  primary: '#2D6E5E',
  primaryText: '#FBF8F3',

  warning: '#D4683A',
  warningBg: '#FBEAE3',

  danger: '#A32D2D',
  dangerBg: '#FBEAE3',
  dangerBorder: '#E2A0A0',

  success: '#2D6E5E',
  successBg: '#E8EFE9',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 28,
} as const;

export const fontSize = {
  caption: 13,
  body: 15,
  bodyLg: 16,
  title: 17,
  titleLg: 19,
} as const;
