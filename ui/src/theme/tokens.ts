export const lightTokens = {
  background: '#F4F5FA',
  surface: '#FFFFFF',
  ink: '#14213D',
  muted: '#526077',
  accent: '#5633B8',
  onAccent: '#FFFFFF',
  border: '#CED3DF',
  success: '#176047',
  warning: '#7C4800',
  danger: '#A22036',
  navy: '#14213D',
  onNavy: '#FFFFFF',
} as const;
export const darkTokens = {
  background: '#0D1424',
  surface: '#192338',
  ink: '#F0F3FA',
  muted: '#B6C2D8',
  accent: '#B6A0FF',
  onAccent: '#17102E',
  border: '#43516D',
  success: '#8CDBBA',
  warning: '#FFD09B',
  danger: '#FFADB9',
  navy: '#192338',
  onNavy: '#F0F3FA',
} as const;
export const rhythm = { gap: 8, section: 16, gutter: 24, target: 48, radius: 16 } as const;
export type Tokens = { [Key in keyof typeof lightTokens]: string };
