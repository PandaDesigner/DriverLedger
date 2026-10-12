import type { PropsWithChildren } from 'react';
import { Button, Host } from '@expo/ui';
import { Text, View, TextInput, useColorScheme, type TextInputProps } from 'react-native';
import { useDemo } from '../demo/demo-provider';
import { THEME } from '../demo/contracts';
import { darkTokens, lightTokens, rhythm } from '../theme/tokens';
export function useTokens() {
  const { state } = useDemo();
  const scheme = useColorScheme();
  return state.theme === THEME.DARK || (state.theme === THEME.SYSTEM && scheme === THEME.DARK)
    ? darkTokens
    : lightTokens;
}
export function Copy({ children, large = false }: PropsWithChildren<{ large?: boolean }>) {
  const tokens = useTokens();
  return (
    <Text
      selectable
      style={{
        color: tokens.ink,
        fontSize: large ? 28 : 16,
        lineHeight: large ? 36 : 24,
        fontWeight: large ? '700' : '400',
        fontVariant: ['tabular-nums'],
      }}
    >
      {children}
    </Text>
  );
}
export function Card({ children }: PropsWithChildren) {
  const tokens = useTokens();
  return (
    <View
      style={{
        padding: rhythm.section,
        gap: rhythm.gap,
        borderRadius: rhythm.radius,
        backgroundColor: tokens.surface,
        borderWidth: 1,
        borderColor: tokens.border,
      }}
    >
      {children}
    </View>
  );
}
export function Action({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const tokens = useTokens();
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={tokens === darkTokens ? THEME.DARK : THEME.LIGHT}
      style={{ minHeight: rhythm.target }}
    >
      <Button
        label={title}
        onPress={onPress}
        disabled={disabled}
        variant={secondary ? 'outlined' : 'filled'}
        style={{ height: rhythm.target, paddingHorizontal: rhythm.section, borderRadius: 12 }}
      />
    </Host>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const tokens = useTokens();
  return (
    <View style={{ gap: rhythm.gap }}>
      <Copy>{label}</Copy>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={tokens.muted}
        style={{
          minHeight: rhythm.target,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: tokens.border,
          color: tokens.ink,
          backgroundColor: tokens.surface,
          fontSize: 16,
        }}
      />
    </View>
  );
}
export function Message({ children }: PropsWithChildren) {
  const tokens = useTokens();
  return (
    <Text
      selectable
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ color: tokens.danger, fontSize: 16, lineHeight: 24 }}
    >
      {children}
    </Text>
  );
}
export function money(amount: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}
