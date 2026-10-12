import { Stack } from 'expo-router';
import { useTokens } from '../../src/components/primitives';
export default function AuthLayout() {
  const tokens = useTokens();
  return (
    <Stack
      screenOptions={{
        animation: 'none',
        headerStyle: { backgroundColor: tokens.surface },
        headerTintColor: tokens.ink,
      }}
    >
      <Stack.Screen name="login" options={{ title: 'DriverLedger · demostración' }} />
      <Stack.Screen name="register" options={{ title: 'Registro de prueba' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Recuperar acceso' }} />
    </Stack>
  );
}
