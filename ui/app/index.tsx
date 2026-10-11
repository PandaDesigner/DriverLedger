// Placeholder route at "/" — proves the Expo Router bundle boots.
// See design.md AD-7: no <Stack>/<Tabs>, only a single route. Fase 3
// will introduce the seven real screens and the two modals.

import { StyleSheet, Text, View } from 'react-native';

export default function Index(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>DriverLedger</Text>
      <Text style={styles.sub}>setup-expo-skeleton smoke</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    padding: 24,
  },
  heading: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '700',
  },
  sub: {
    color: '#94A3B8',
    fontSize: 16,
    marginTop: 8,
  },
});
