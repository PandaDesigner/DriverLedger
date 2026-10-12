import { router } from 'expo-router';
import { PLATFORM, ROUTE, SCENARIO } from '../demo/contracts';
import { useDemo } from '../demo/demo-provider';
import { openWorkspace, selectPlatforms } from '../demo/model';
import { DemoScreen } from '../components/demo-screen';
import { Action, Card, Copy } from '../components/ui';
export function PlatformsScreen() {
  const { state, update } = useDemo();
  const platforms = [PLATFORM.UBER, PLATFORM.DIDI, PLATFORM.INDRIVE];
  return (
    <DemoScreen scenarios={[SCENARIO.READY, SCENARIO.PARTIAL, SCENARIO.SUCCESS]}>
      <Copy>Paso 1 de 1</Copy>
      <Copy large>¿Con qué plataformas trabajas?</Copy>
      <Copy>Selecciona al menos una. Modo manual ficticio; no se conecta ninguna cuenta.</Copy>
      {platforms.map((platform) => (
        <Card key={platform}>
          <Copy>{platform}</Copy>
          <Copy>
            {state.platforms.includes(platform)
              ? 'Seleccionada · sin conexión real'
              : 'No seleccionada'}
          </Copy>
          <Action
            secondary
            title={
              state.platforms.includes(platform) ? `Quitar ${platform}` : `Seleccionar ${platform}`
            }
            onPress={() => {
              update((current) =>
                selectPlatforms(
                  current,
                  current.platforms.includes(platform)
                    ? current.platforms.filter((selected) => selected !== platform)
                    : [...current.platforms, platform],
                ),
              );
            }}
          />
        </Card>
      ))}
      <Action
        title="Preparar workspace de demostración"
        disabled={state.platforms.length === 0}
        onPress={() => {
          update(openWorkspace);
          router.replace(ROUTE.DASHBOARD);
        }}
      />
    </DemoScreen>
  );
}
