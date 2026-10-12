import type { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { changeScenario } from '../demo/model';
import { SCENARIO, type Scenario } from '../demo/contracts';
import { useDemo } from '../demo/demo-provider';
import { Action, Card, Copy, useTokens } from './ui';
import { rhythm } from '../theme/tokens';
export const scenarioLabels: Record<Scenario, string> = {
  ready: 'Preparado',
  loading: 'Cargando o guardando',
  empty: 'Sin actividad',
  error: 'Error recuperable',
  offline: 'Sin conexión simulada',
  pending: 'Pendiente simulado',
  success: 'Éxito simulado',
  invalid: 'Validación o credenciales inválidas',
  unknown: 'Cuenta desconocida',
  partial: 'Plataformas parcialmente configuradas',
  active: 'Carrera activa de ejemplo',
  goal: 'Meta de ejemplo alcanzada',
  conflict: 'Conflicto de ejemplo',
  permission: 'Permiso de ubicación simulado',
};
export function ScenarioControls({ scenarios }: { scenarios: readonly Scenario[] }) {
  const { state, update } = useDemo();
  return (
    <Card>
      <Copy>Escenarios de demostración: {scenarioLabels[state.scenario]}</Copy>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: rhythm.gap }}
      >
        {scenarios.map((scenario) => (
          <Action
            key={scenario}
            secondary
            title={scenarioLabels[scenario]}
            onPress={() => {
              update((current) => changeScenario(current, scenario));
            }}
          />
        ))}
      </ScrollView>
      {state.scenario === SCENARIO.EMPTY && (
        <Action
          title="Restaurar datos de ejemplo"
          onPress={() => {
            update((current) => changeScenario(current, SCENARIO.READY));
          }}
        />
      )}
    </Card>
  );
}
export function StatusPanel() {
  const tokens = useTokens();
  const { state, update } = useDemo();
  if (state.scenario === SCENARIO.READY) {
    return null;
  }
  return (
    <Card>
      <Copy>{scenarioLabels[state.scenario]}</Copy>
      {state.scenario === SCENARIO.LOADING && (
        <View
          accessibilityLabel="Skeleton de carga"
          style={{ height: 48, borderRadius: 12, backgroundColor: tokens.border }}
        />
      )}
      <Copy>Ninguna operación real. Puedes recuperar el estado preparado.</Copy>
      <Action
        secondary
        title="Volver al estado preparado"
        onPress={() => {
          update((current) => changeScenario(current, SCENARIO.READY));
        }}
      />
    </Card>
  );
}
export function DemoBanner() {
  return (
    <Copy>
      Demostración: datos ficticios, sin conexión a servicios. No uses credenciales reales.
    </Copy>
  );
}
export function DemoScreen({
  children,
  scenarios,
}: PropsWithChildren<{ scenarios: readonly Scenario[] }>) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: tokens.background }}
      contentContainerStyle={{
        padding: rhythm.gutter,
        paddingBottom: Math.max(insets.bottom, rhythm.gutter),
        gap: rhythm.section,
      }}
    >
      <DemoBanner />
      <ScenarioControls scenarios={scenarios} />
      <StatusPanel />
      {children}
    </ScrollView>
  );
}
