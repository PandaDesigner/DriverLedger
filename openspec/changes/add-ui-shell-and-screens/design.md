# Diseño: shell y pantallas de fase 3

## Enfoque

Extender el scaffold observado en `ui/app/index.tsx`, con Expo Router y las dependencias ya declaradas en `ui/package.json`. Aplicar `docs/ui/views.md`, `navigation.md`, `design-tokens.md` y `motion.md`; usar `history-v2.png`, no la referencia histórica de Historial.

## Límites acordados

Datos de prueba donde faltan servicios. Sin sesión autenticada disponible, el recorrido inicial será una demostración aislada, sin importaciones de `data/` o `services/`. No crear contratos ficticios que se presenten como API productiva.

Los snapshots globales existentes no están aislados por conductor. Conectarlos sin sesión sería inseguro. La separación de escenarios cuesta trabajo inicial, pero permite conectar posteriormente servicios reales sin mezclar registros ficticios y reales.

La meta de 310–320 mil y el neto aproximado de 200 mil son ambiguos en el PRD. Mostrar proyecciones de ejemplo identificadas como tales; no calcular descuentos, neto ni carreras faltantes. Las reglas financieras quedan pendientes de otro contrato aprobado.

## Flujo de datos

Fixtures deterministas alimentan un estado de demostración en memoria. Las pantallas leen ese estado y envían acciones explícitas. Las acciones actualizan únicamente actividad sintética y preferencias de la demostración. Cerrar/reiniciar la sesión borra esos valores. Nunca almacenar contraseñas ni incluirlas en fixtures.

Reutilizar RxJS/signals declarados en el proyecto; comprobar las APIs instaladas antes de implementación. Limpiar suscripciones al desmontar. No añadir otro gestor de estado.

## Archivos previstos

| Ruta                                     | Trabajo                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `ui/app/index.tsx`, `ui/app/_layout.tsx` | Entrada de demostración y stack raíz.                                        |
| `ui/app/(auth)/`                         | Login, register, forgot-password y layout.                                   |
| `ui/app/(onboarding)/platforms.tsx`      | Selección simulada de plataformas.                                           |
| `ui/app/(tabs)/`                         | Layout compartido, dashboard, history y settings.                            |
| `ui/app/modals/`                         | confirm-trip y add-expense.                                                  |
| `ui/src/screens/`                        | Nueve componentes de superficie; rutas sin lógica de negocio.                |
| `ui/src/theme/tokens.ts`                 | Colores y espaciados semánticos claro/oscuro.                                |
| `ui/src/components/`                     | Aviso de demostración, barra compartida y controles reutilizados.            |
| `ui/src/demo/`                           | Tipos de presentación, fixtures, estado, filtros y validación de navegación. |
| `tests/unit/`, `tests/integration/`      | Lógica pura y flujos sintéticos con Bun.                                     |
| `tests/ui/manual-acceptance.md`          | Evidencias de aceptación visual/nativa.                                      |

## Comportamiento

Tres destinos persistentes y dos acciones/contextos en la barra de cinco slots. Gastos reutiliza Historial con filtro de tipo; no duplica pantalla. Detalles inline evitan añadir pantallas o modales fuera de alcance. Parámetros externos se validan una vez al entrar.

Confirmación de carrera idempotente por identidad sintética. Borrador de gasto conservado durante dismiss/back y eliminado solo al enviar o descartar explícitamente. Los resúmenes financieros son proyecciones precargadas por escenario; una mutación sin proyección disponible indica esa limitación en lugar de mostrar un total incorrecto.

## Comprobaciones antes de código

- El remoto avanzó 11 commits durante la preparación, hasta `9627416`, con fase 4 y workspace de servicios. Actualizar la base y registrar SHA antes de crear rama. Revisar contratos nuevos; resolve/suggest y Uber stub no son persistencia ni integración remota. La demostración permanece aislada.
- Verificar compatibilidad de Expo, React Native, Expo UI y la configuración de arquitectura nativa. No cambiar versiones/configuración de arquitectura sin exponer el impacto y obtener aprobación.
- Usar controles Expo UI donde los contratos instalados lo permitan; no introducir un segundo design system.
- El scaffold fija portrait, pero el plan pide landscape. Proponer habilitar ambas orientaciones en `ui/app.json` para aceptación; aprobación incluida en este plan.
- Tests Bun de lógica/navegación no equivalen a renderizado RN ni E2E. No introducir otro runner sin aprobación.

## Validación y reversión

Typecheck y lint de `ui/`, más configuración específica para incluir los tests de `tests/` raíz. Ejecutar Bun desde raíz con rutas explícitas a `tests/unit` y `tests/integration`; los scripts UI no descubren esas suites. Configurar cobertura de `ui/src/demo/`, excluyendo fixtures y contratos sin lógica, con umbrales del 80% en líneas, funciones, statements y branches; no asumir que la ejecución raíz hereda `ui/bunfig.toml`. Revisar las nueve superficies en iOS/Android: pequeño/grande, landscape, claro/oscuro, texto ampliado, lectores de pantalla y reduced motion. Registrar lo no ejecutado, sin marcarlo como aprobado.

La matriz `acceptance-matrix.md` identifica estados y evidencias. Los tests de aislamiento deben cubrir también imports transitivos y efectos de rutas/componentes: red, almacenamiento, ubicación y manejo de credenciales. No basta probar el estado demo.

Sin migraciones. Revertir UI/tests y restaurar placeholder. Aprobación del plan antes de crear rama y escribir implementación; aprobación del resultado antes de merge. Archivar solo después de merge y validación.
