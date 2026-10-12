import { Redirect, Stack } from 'expo-router';
import { ROUTE, SESSION } from '../../src/demo/contracts';
import { useDemo } from '../../src/demo/demo-provider';
import { useTokens } from '../../src/components/ui';
export default function OnboardingLayout() {
  const { state } = useDemo();
  const tokens = useTokens();
  if (state.session === SESSION.LOGIN) {
    return <Redirect href={ROUTE.LOGIN} />;
  }
  return (
    <Stack
      screenOptions={{
        animation: 'none',
        title: 'Tus plataformas de prueba',
        headerStyle: { backgroundColor: tokens.surface },
        headerTintColor: tokens.ink,
      }}
    />
  );
}
