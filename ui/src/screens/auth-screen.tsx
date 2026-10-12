import { useState } from 'react';
import { router } from 'expo-router';
import { Switch, View } from 'react-native';
import { ROUTE, SCENARIO } from '../demo/contracts';
import { useDemo } from '../demo/demo-provider';
import { enterDemo, validateIdentity } from '../demo/model';
import { DemoScreen } from '../components/demo-screen';
import { Action, Card, Copy, Field, Message } from '../components/primitives';
export const AUTH = { LOGIN: 'login', REGISTER: 'register', RECOVERY: 'recovery' } as const;
type AuthMode = (typeof AUTH)[keyof typeof AUTH];
export function AuthScreen({ mode }: { mode: AuthMode }) {
  const { state, update } = useDemo();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [feedback, setFeedback] = useState('');
  const recovery = mode === AUTH.RECOVERY;
  const register = mode === AUTH.REGISTER;
  const title = recovery
    ? 'Recupera el acceso'
    : register
      ? 'Crea tu cuenta de prueba'
      : 'Tu jornada, en orden';
  function submit() {
    const checked = validateIdentity(identity, recovery ? undefined : password);
    setPassword('');
    if (!checked.ok) {
      setFeedback(checked.message);
      return;
    }
    if (register && (!name.trim() || !consent)) {
      setFeedback('Ingresa un nombre de prueba y acepta los términos de demostración.');
      return;
    }
    if (
      [SCENARIO.OFFLINE, SCENARIO.ERROR, SCENARIO.INVALID, SCENARIO.UNKNOWN].some(
        (scenario) => scenario === state.scenario,
      )
    ) {
      setFeedback(
        'Escenario de error simulado. Corrige el escenario y reintenta. No se envió ninguna solicitud.',
      );
      return;
    }
    if (recovery) {
      setFeedback(
        'Solicitud simulada. No se envió ningún correo. Vuelve al inicio para recorrer la demostración.',
      );
      return;
    }
    update(enterDemo);
    router.replace(ROUTE.ONBOARDING);
  }
  return (
    <DemoScreen
      scenarios={[
        SCENARIO.READY,
        SCENARIO.LOADING,
        SCENARIO.INVALID,
        SCENARIO.OFFLINE,
        SCENARIO.ERROR,
        SCENARIO.UNKNOWN,
        SCENARIO.SUCCESS,
      ]}
    >
      <Copy large>DriverLedger</Copy>
      <Copy large>{title}</Copy>
      <Copy>
        Una vista clara de viajes, gastos y tu progreso diario. Este recorrido no crea cuentas
        reales.
      </Copy>
      <Card>
        {register && <Field label="Nombre de prueba" value={name} onChangeText={setName} />}
        <Field
          label="Correo o teléfono de prueba"
          value={identity}
          onChangeText={setIdentity}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!recovery && (
          <Field
            label="Contraseña de prueba"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        {register && (
          <View>
            <Copy>Acepto los términos de esta demostración. No se crea una cuenta.</Copy>
            <Switch
              accessibilityLabel="Aceptar términos de demostración"
              value={consent}
              onValueChange={setConsent}
              style={{ minHeight: 48 }}
            />
          </View>
        )}
        {feedback !== '' && <Message>{feedback}</Message>}
        <Action
          title={
            recovery
              ? 'Simular solicitud'
              : register
                ? 'Continuar con cuenta ficticia'
                : 'Entrar a la demostración'
          }
          onPress={submit}
          disabled={state.scenario === SCENARIO.LOADING}
        />
      </Card>
      {mode === AUTH.LOGIN && (
        <>
          <Action
            secondary
            title="Crear cuenta de prueba"
            onPress={() => {
              router.push(ROUTE.REGISTER);
            }}
          />
          <Action
            secondary
            title="Olvidé mi contraseña"
            onPress={() => {
              router.push(ROUTE.RECOVERY);
            }}
          />
        </>
      )}
      {mode !== AUTH.LOGIN && (
        <Action
          secondary
          title="Volver al inicio"
          onPress={() => {
            router.replace(ROUTE.LOGIN);
          }}
        />
      )}
    </DemoScreen>
  );
}
