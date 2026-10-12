import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KIND, PLATFORM, RANGE, ROUTE, SCENARIO, type HistoryFilter } from '../demo/contracts';
import { useDemo } from '../demo/demo-provider';
import {
  filterActivity,
  groupActivity,
  hasProjection,
  initialFilter,
  parseHistoryKind,
} from '../demo/history';
import { validDate, visibleActivity } from '../demo/model';
import { projection } from '../demo/fixtures';
import { DemoBanner, ScenarioControls, StatusPanel } from '../components/demo-screen';
import { Action, Card, Copy, Field, Message, useTokens } from '../components/ui';
import { money } from '../formatters/money';
export function HistoryScreen() {
  const { kind } = useLocalSearchParams();
  const parsed = parseHistoryKind(kind);
  const { state } = useDemo();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const [selection, setFilter] = useState<HistoryFilter>(initialFilter);
  const filter = { ...selection, kind: parsed.ok ? parsed.value : KIND.ALL };
  const [expanded, setExpanded] = useState<string | undefined>();
  const validRange =
    filter.range !== RANGE.CUSTOM ||
    (validDate(filter.from) && validDate(filter.to) && filter.from <= filter.to);
  const grouped = groupActivity(
    parsed.ok && validRange ? filterActivity(visibleActivity(state), filter) : [],
  );
  const clear = () => {
    setFilter(initialFilter());
    router.setParams({ kind: KIND.ALL });
  };
  return (
    <SectionList
      style={{ backgroundColor: tokens.background }}
      contentContainerStyle={{ padding: 24, paddingBottom: Math.max(24, insets.bottom), gap: 12 }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      sections={grouped.map((group) => ({ title: group.date, data: group.activity }))}
      keyExtractor={(entry) => entry.id}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          <DemoBanner />
          <ScenarioControls
            scenarios={[
              SCENARIO.READY,
              SCENARIO.LOADING,
              SCENARIO.EMPTY,
              SCENARIO.OFFLINE,
              SCENARIO.ERROR,
            ]}
          />
          <StatusPanel />
          <Card>
            <Copy large>Historial</Copy>
            <Copy>Fechas operativas de ejemplo · Medellín</Copy>
            {Object.values(RANGE).map((range) => (
              <Action
                key={range}
                secondary
                title={
                  {
                    today: 'Hoy',
                    week: 'Esta semana',
                    month: 'Este mes',
                    custom: 'Rango personalizado',
                  }[range]
                }
                onPress={() => {
                  setFilter((current) => ({ ...current, range }));
                }}
              />
            ))}
            {filter.range === RANGE.CUSTOM && (
              <>
                <Field
                  label="Desde AAAA-MM-DD"
                  value={filter.from}
                  onChangeText={(from) => {
                    setFilter((current) => ({ ...current, from }));
                  }}
                />
                <Field
                  label="Hasta AAAA-MM-DD"
                  value={filter.to}
                  onChangeText={(to) => {
                    setFilter((current) => ({ ...current, to }));
                  }}
                />
              </>
            )}
            {!validRange && <Message>Corrige las fechas y su orden antes de filtrar.</Message>}
            {Object.values(PLATFORM).map((platform) => (
              <Action
                key={platform}
                secondary
                title={`${platform}${filter.platform === platform ? ' · seleccionada' : ''}`}
                onPress={() => {
                  setFilter((current) => ({ ...current, platform }));
                }}
              />
            ))}
            <Copy>
              Tipo:{' '}
              {filter.kind === KIND.EXPENSE
                ? 'Gastos'
                : filter.kind === KIND.TRIP
                  ? 'Viajes'
                  : 'Toda la actividad'}
            </Copy>
            <Action
              secondary
              title="Solo gastos"
              onPress={() => {
                router.setParams({ kind: KIND.EXPENSE });
              }}
            />
            <Action
              secondary
              title="Solo viajes"
              onPress={() => {
                router.setParams({ kind: KIND.TRIP });
              }}
            />
            <Action secondary title="Limpiar filtros" onPress={clear} />
            {!parsed.ok && <Message>{parsed.message}</Message>}
          </Card>
          <Card>
            {parsed.ok && validRange && hasProjection(state, filter) ? (
              <>
                <Copy>Neto de ejemplo: {money(projection.net)}</Copy>
                <Copy>
                  Ingresos {money(projection.gross)} · Gastos {money(projection.expenses)} ·{' '}
                  {projection.trips} viajes
                </Copy>
              </>
            ) : (
              <Copy>
                Proyección financiera no disponible para esta selección. La lista sí refleja los
                filtros.
              </Copy>
            )}
          </Card>
          <Action
            title="Añadir gasto de prueba"
            onPress={() => {
              router.push(ROUTE.EXPENSE);
            }}
          />
        </View>
      }
      renderSectionHeader={({ section }) => <Copy large>{section.title}</Copy>}
      renderItem={({ item }) => (
        <Card>
          <Copy>
            {item.time} · {item.platform ?? item.category} · {money(item.amount)}
          </Copy>
          <Action
            secondary
            title={expanded === item.id ? 'Cerrar detalle' : 'Ver detalle'}
            onPress={() => {
              setExpanded(expanded === item.id ? undefined : item.id);
            }}
          />
          {expanded === item.id && (
            <>
              <Copy>{item.note}</Copy>
              <Copy>
                {item.date} {item.time} · Fuente: manual ficticia
              </Copy>
              <Copy>
                {item.kind === KIND.TRIP
                  ? 'Ruta disponible en la nota. Sin captura GPS.'
                  : `Categoría: ${item.category}`}
              </Copy>
            </>
          )}
        </Card>
      )}
      ListEmptyComponent={
        <Card>
          <Copy>No hay actividad para esta selección.</Copy>
          <Action secondary title="Limpiar filtros" onPress={clear} />
        </Card>
      }
    />
  );
}
