import { router, usePathname, useLocalSearchParams } from 'expo-router';
import { View, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KIND, ROUTE } from '../demo/contracts';
import { useTokens } from './ui';
import { rhythm } from '../theme/tokens';
export function BottomBar() {
  const pathname = usePathname();
  const { kind } = useLocalSearchParams();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const current = pathname.endsWith('/history')
    ? kind === KIND.EXPENSE
      ? KIND.EXPENSE
      : ROUTE.HISTORY
    : pathname.endsWith('/settings')
      ? ROUTE.SETTINGS
      : ROUTE.DASHBOARD;
  const controls = [
    {
      id: ROUTE.DASHBOARD,
      title: 'Dashboard',
      press: () => {
        router.replace(ROUTE.DASHBOARD);
      },
    },
    {
      id: ROUTE.HISTORY,
      title: 'Historial',
      press: () => {
        router.replace({ pathname: ROUTE.HISTORY, params: { kind: KIND.ALL } });
      },
    },
    {
      id: ROUTE.TRIP,
      title: 'Nuevo viaje',
      press: () => {
        router.push(ROUTE.TRIP);
      },
    },
    {
      id: KIND.EXPENSE,
      title: 'Gastos',
      press: () => {
        router.replace({ pathname: ROUTE.HISTORY, params: { kind: KIND.EXPENSE } });
      },
    },
    {
      id: ROUTE.SETTINGS,
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
          key={control.id}
          accessibilityRole="button"
          accessibilityLabel={control.title}
          accessibilityState={{ selected: current === control.id }}
          onPress={control.press}
          style={{
            flex: 1,
            minHeight: rhythm.target,
            minWidth: rhythm.target,
            justifyContent: 'center',
            padding: 4,
            borderBottomWidth: current === control.id ? 3 : 0,
            borderColor: tokens.accent,
          }}
        >
          <Text
            style={{
              color: tokens.ink,
              textAlign: 'center',
              fontSize: 12,
              fontWeight: current === control.id ? '700' : '400',
            }}
          >
            {control.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
