import { router } from 'expo-router';
import { View } from 'react-native';
import { ROUTE, SCENARIO, KIND } from '../demo/contracts';
import { useDemo } from '../demo/demo-provider';
import { visibleActivity } from '../demo/model';
import { projection, weekProjection } from '../demo/fixtures';
import { filterActivity, initialFilter } from '../demo/history';
import { DemoScreen } from '../components/demo-screen';
import { Action, Card, Copy, money, useTokens } from '../components/primitives';
export function DashboardScreen() {
  const { state } = useDemo();
  const tokens = useTokens();
  const reached = state.scenario === SCENARIO.GOAL;
  const progress = reached ? 100 : projection.percent;
  return (
    <DemoScreen
      scenarios={[
        SCENARIO.READY,
        SCENARIO.LOADING,
        SCENARIO.EMPTY,
        SCENARIO.ACTIVE,
        SCENARIO.GOAL,
        SCENARIO.OFFLINE,
        SCENARIO.PENDING,
        SCENARIO.ERROR,
        SCENARIO.PERMISSION,
      ]}
    >
      <Copy>Hola, conductor de prueba</Copy>
      <Copy>Lunes 12 de octubre de 2026 · Medellín</Copy>
      <Copy>Estado de red y sincronización: simulados</Copy>
      <Card>
        <Copy>Meta neta de ejemplo · no es una recomendación</Copy>
        {state.projectionAvailable && state.scenario !== SCENARIO.EMPTY ? (
          <>
            <Copy large>{money(reached ? projection.target : projection.net)}</Copy>
            <Copy>
              Meta: {money(projection.target)} · Faltante:{' '}
              {money(reached ? 0 : projection.remaining)}
            </Copy>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: progress }}
              style={{ height: 12, borderRadius: 6, backgroundColor: tokens.border }}
            >
              <View
                style={{
                  height: 12,
                  width: `${progress}%`,
                  borderRadius: 6,
                  backgroundColor: tokens.accent,
                }}
              />
            </View>
            <Copy>{progress}% · valores precargados</Copy>
          </>
        ) : (
          <Copy>
            Proyección no disponible para esta actividad. No se calculan ganancias reales.
          </Copy>
        )}
      </Card>
      <Card>
        <Copy large>Tu jornada</Copy>
        {state.projectionAvailable && state.scenario !== SCENARIO.EMPTY ? (
          <>
            <Copy>
              {projection.trips} viajes · Ingresos: {money(projection.gross)}
            </Copy>
            <Copy>
              Gastos: {money(projection.expenses)} · Tiempo activo: {projection.activeTime}
            </Copy>
            <Copy>Carreras hechas: 2 · faltantes: {projection.remainingTrips}</Copy>
          </>
        ) : (
          <Copy>Los KPIs financieros necesitan una proyección compatible.</Copy>
        )}
      </Card>
      <Card>
        <Copy large>Esta semana · ejemplo</Copy>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 96 }}>
          {weekProjection.map((height, index) => (
            <View
              key={index}
              style={{ flex: 1, height, backgroundColor: tokens.accent, borderRadius: 4 }}
              accessibilityLabel={`Día ${index + 1}: ${height}% de ejemplo`}
            />
          ))}
        </View>
        <Copy>Serie ficticia; no se deriva de tus registros.</Copy>
      </Card>
      <Card>
        <Copy large>Actividad reciente</Copy>
        {filterActivity(visibleActivity(state), initialFilter())
          .slice(0, 3)
          .map((entry) => (
            <Copy key={entry.id}>
              {entry.time} · {entry.kind === KIND.TRIP ? entry.platform : entry.category} ·{' '}
              {money(entry.amount)}
            </Copy>
          ))}
        {visibleActivity(state).length === 0 && (
          <Copy>Aún no hay viajes. Añade uno de prueba.</Copy>
        )}
      </Card>
      <Action
        title="Nuevo viaje de prueba"
        onPress={() => {
          router.push(ROUTE.TRIP);
        }}
      />
      <Action
        secondary
        title="Registrar gasto de prueba"
        onPress={() => {
          router.push(ROUTE.EXPENSE);
        }}
      />
    </DemoScreen>
  );
}
