import type { PropsWithChildren } from 'react';
import { Text, View, TextInput, type TextInputProps } from 'react-native';
import { useTokens } from './host';
import { rhythm } from '../../theme/tokens';

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
