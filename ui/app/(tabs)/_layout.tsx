import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { SESSION } from '../../src/demo/contracts';
import { entryRoute } from '../../src/demo/navigation';
import { useDemo } from '../../src/demo/demo-provider';
import { useTokens } from '../../src/components/primitives';
import { BottomBar } from '../../src/components/bottom-bar';
export default function TabsLayout() {
  const { state } = useDemo();
  const tokens = useTokens();
  if (state.session !== SESSION.WORKSPACE) {
    return <Redirect href={entryRoute(state.session)} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: tokens.background }}>
      <Stack
        screenOptions={{
          animation: 'none',
          headerStyle: { backgroundColor: tokens.surface },
          headerTintColor: tokens.ink,
        }}
      >
        <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
        <Stack.Screen name="history" options={{ title: 'Historial' }} />
        <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
      </Stack>
      <BottomBar />
    </View>
  );
}
