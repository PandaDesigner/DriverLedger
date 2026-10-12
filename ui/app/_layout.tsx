import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DemoProvider } from '../src/demo/demo-provider';
import { useTokens } from '../src/components/ui';
function RootStack() {
  const tokens = useTokens();
  return (
    <Stack
      screenOptions={{
        animation: 'none',
        headerStyle: { backgroundColor: tokens.surface },
        headerTintColor: tokens.ink,
        contentStyle: { backgroundColor: tokens.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="modals/confirm-trip"
        options={{ title: 'Confirmar viaje', presentation: 'modal' }}
      />
      <Stack.Screen
        name="modals/add-expense"
        options={{ title: 'Registrar gasto', presentation: 'modal' }}
      />
    </Stack>
  );
}
export default function Layout() {
  return (
    <SafeAreaProvider>
      <DemoProvider>
        <RootStack />
      </DemoProvider>
    </SafeAreaProvider>
  );
}
