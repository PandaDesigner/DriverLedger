import { useState } from 'react';
import { router } from 'expo-router';
import { DEMO_DATE, KIND, PLATFORM, ROUTE, SCENARIO } from '../demo/contracts';
import { useDemo } from '../demo/demo-provider';
import { confirmTrip, nextTripId } from '../demo/model';
import { DemoScreen } from '../components/demo-screen';
import { Action, Card, Copy, Field, Message } from '../components/primitives';
export function TripModal() {
  const { state, update } = useDemo();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('18000');
  const [platform, setPlatform] = useState(
    PLATFORM.UBER as typeof PLATFORM.UBER | typeof PLATFORM.DIDI | typeof PLATFORM.INDRIVE,
  );
  const [feedback, setFeedback] = useState('');
  const [id] = useState(() => nextTripId(state));
  const saved = state.confirmed.includes(id);
  function submit() {
    const fare = Number(amount);
    if (!amount.trim() || !Number.isFinite(fare) || fare <= 0) {
      setFeedback('Ingresa una tarifa de prueba positiva.');
      return;
    }
    if (state.scenario === SCENARIO.CONFLICT || state.scenario === SCENARIO.ERROR) {
      setFeedback(
        'No se añadió el viaje. Conflicto/error simulado; cambia el escenario para reintentar.',
      );
      return;
    }
    update((current) =>
      confirmTrip(current, {
        id,
        kind: KIND.TRIP,
        amount: fare,
        date: DEMO_DATE,
        time: '10:30',
        platform,
        note: 'El Poblado a Laureles · manual ficticio',
      }),
    );
    setFeedback('Viaje añadido a la demostración. No se guardó ni sincronizó un registro real.');
  }
  return (
    <DemoScreen
      scenarios={[
        SCENARIO.READY,
        SCENARIO.LOADING,
        SCENARIO.SUCCESS,
        SCENARIO.CONFLICT,
        SCENARIO.ERROR,
      ]}
    >
      <Copy large>Confirma tu viaje de prueba</Copy>
      <Card>
        <Copy>
          {platform} · {amount} COP
        </Copy>
        <Copy>El Poblado a Laureles</Copy>
        <Copy>Fuente: manual ficticia · {DEMO_DATE} 10:30</Copy>
        <Copy>Duración: 20 min de ejemplo</Copy>
        <Copy>
          Gasolina estimada: 2000 COP · comisión: 3000 COP · neto: 13000 COP. Valores precargados,
          no calculados.
        </Copy>
        {editing && (
          <>
            <Field
              label="Tarifa de prueba COP"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            {[PLATFORM.UBER, PLATFORM.DIDI, PLATFORM.INDRIVE].map((choice) => (
              <Action
                secondary
                key={choice}
                title={choice}
                onPress={() => {
                  setPlatform(choice);
                }}
              />
            ))}
          </>
        )}
        <Action
          secondary
          title={editing ? 'Terminar edición' : 'Editar como alternativa'}
          onPress={() => {
            setEditing(!editing);
          }}
        />
        {feedback !== '' && <Message>{feedback}</Message>}
        <Action
          title={saved ? 'Confirmado en la demostración' : 'Confirmar con un tap'}
          onPress={submit}
          disabled={saved || state.scenario === SCENARIO.LOADING}
        />
      </Card>
      <Action
        secondary
        title={saved ? 'Volver al Dashboard' : 'Cancelar sin confirmar'}
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
            return;
          }
          router.replace(ROUTE.DASHBOARD);
        }}
      />
    </DemoScreen>
  );
}
