import { Host } from '@expo/ui';
import type { PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { useDemo } from '../../demo/demo-provider';
import { THEME } from '../../demo/contracts';
import { darkTokens, lightTokens } from '../../theme/tokens';

export type ThemeMode = 'light' | 'dark';

export function useThemeMode(): ThemeMode {
  const { state } = useDemo();
  const scheme = useColorScheme();
  return state.theme === THEME.DARK || (state.theme === THEME.SYSTEM && scheme === THEME.DARK)
    ? 'dark'
    : 'light';
}

export function useTokens() {
  return useThemeMode() === 'dark' ? darkTokens : lightTokens;
}

type HostProps = PropsWithChildren<{
  matchContents?: boolean | { vertical?: boolean; horizontal?: boolean };
  style?: object;
}>;

export function ThemedHost({
  matchContents = { vertical: true },
  style,
  children,
}: HostProps) {
  const mode = useThemeMode();
  return (
    <Host matchContents={matchContents} colorScheme={mode} style={style}>
      {children}
    </Host>
  );
}
