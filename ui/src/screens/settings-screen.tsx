import { useState } from 'react';
import { router } from 'expo-router';
import { Switch } from 'react-native';
import { ROUTE, SCENARIO, THEME } from '../demo/contracts';
import { useDemo } from '../demo/demo-provider';
import { savePreferences } from '../demo/model';
import { DemoScreen } from '../components/demo-screen';
import { Action, Card, Copy, Field, Message } from '../components/ui';
export function SettingsScreen() {
  const { state, update, reset } = useDemo();
  const [target, setTarget] = useState(state.preferences.target);
  const [notifications, setNotifications] = useState(state.preferences.notifications);
  const [feedback, setFeedback] = useState('');
  return (
    <DemoScreen
      scenarios={[
        SCENARIO.READY,
        SCENARIO.LOADING,
        SCENARIO.INVALID,
        SCENARIO.OFFLINE,
        SCENARIO.PENDING,
        SCENARIO.SUCCESS,
      ]}
    >
      <Copy large>Ajustes</Copy>
      <Card>
        <Copy>Perfil: conductor de prueba</Copy>
        <Copy>Plataformas: {state.platforms.join(', ') || 'Sin selección'}</Copy>
        <Action
          secondary
          title="Cambiar plataformas de demostración"
          onPress={() => {
            router.push(ROUTE.ONBOARDING);
          }}
        />
      </Card>
      <Card>
        <Field
          label="Meta de ejemplo COP (no modifica cálculos)"
          value={target}
          onChangeText={setTarget}
          keyboardType="numeric"
        />
        <Copy>Notificaciones simuladas</Copy>
        <Switch
          accessibilityLabel="Activar notificaciones simuladas"
          value={notifications}
          onValueChange={setNotifications}
          style={{ minHeight: 48 }}
        />
        <Action
          title="Guardar preferencias de ejemplo"
          disabled={state.scenario === SCENARIO.LOADING}
          onPress={() => {
            const amount = Number(target);
            if (!target.trim() || !Number.isFinite(amount) || amount <= 0) {
              setFeedback('Ingresa una meta de ejemplo positiva.');
              return;
            }
            update((current) => savePreferences(current, { target, notifications }));
            setFeedback(
              'Preferencias guardadas en la sesión de demostración. Sin guardado real ni cambio del neto mostrado.',
            );
          }}
        />
        {feedback !== '' && <Message>{feedback}</Message>}
      </Card>
      <Card>
        <Copy>Apariencia</Copy>
        {Object.values(THEME).map((theme) => (
          <Action
            key={theme}
            secondary
            title={{ system: 'Sistema', light: 'Claro', dark: 'Oscuro' }[theme]}
            onPress={() => {
              update((current) => ({ ...current, theme }));
            }}
          />
        ))}
      </Card>
      <Card>
        <Copy>Sincronización: solo escenarios ficticios</Copy>
        <Copy>
          Privacidad: no se envían datos, no se guardan contraseñas ni se solicita ubicación.
        </Copy>
      </Card>
      <Action
        secondary
        title="Cerrar y reiniciar demostración"
        onPress={() => {
          reset();
          router.replace(ROUTE.LOGIN);
        }}
      />
    </DemoScreen>
  );
}
