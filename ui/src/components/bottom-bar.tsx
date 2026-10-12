import { router, usePathname, useLocalSearchParams } from 'expo-router';
import { View, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KIND, ROUTE } from '../demo/contracts';
import { useTokens } from './primitives';
import { rhythm } from '../theme/tokens';
export function BottomBar() {
  const pathname = usePathname();
  const { kind } = useLocalSearchParams();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const current = pathname.endsWith('/history')
    ? kind === KIND.EXPENSE
      ? 'Gastos'
      : 'Historial'
    : pathname.endsWith('/settings')
      ? 'Ajustes'
      : 'Dashboard';
  const controls = [
    {
      title: 'Dashboard',
      press: () => {
        router.replace(ROUTE.DASHBOARD);
      },
    },
    {
      title: 'Historial',
      press: () => {
        router.replace({ pathname: ROUTE.HISTORY, params: { kind: KIND.ALL } });
      },
    },
    {
      title: 'Nuevo viaje',
      press: () => {
        router.push(ROUTE.TRIP);
      },
    },
    {
      title: 'Gastos',
      press: () => {
        router.replace({ pathname: ROUTE.HISTORY, params: { kind: KIND.EXPENSE } });
      },
    },
    {
      title: 'Ajustes',
      press: () => {
        router.replace(ROUTE.SETTINGS);
      },
    },
  ];
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: tokens.surface,
        paddingTop: rhythm.gap,
        paddingBottom: Math.max(insets.bottom, rhythm.gap),
        borderTopWidth: 1,
        borderColor: tokens.border,
      }}
    >
      {controls.map((control) => (
        <Pressable
          key={control.title}
          accessibilityRole="button"
          accessibilityLabel={control.title}
          accessibilityState={{ selected: current === control.title }}
          onPress={control.press}
          style={{
            flex: 1,
            minHeight: rhythm.target,
            minWidth: rhythm.target,
            justifyContent: 'center',
            padding: 4,
            borderBottomWidth: current === control.title ? 3 : 0,
            borderColor: tokens.accent,
          }}
        >
          <Text
            style={{
              color: tokens.ink,
              textAlign: 'center',
              fontSize: 12,
              fontWeight: current === control.title ? '700' : '400',
            }}
          >
            {control.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
