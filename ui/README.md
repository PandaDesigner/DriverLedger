# DriverLedger UI: fase 3 de demostración

Siete vistas y dos modales bajo `app/`; componentes, tokens y estado bajo `src/`. El cambio activo es `add-ui-shell-and-screens`, rama `feature/add-ui-shell-and-screens`.

## Límites

Todos los datos son ficticios. Login, registro, recuperación y selección de plataformas son simulaciones; no crean cuentas, envían correos ni conectan plataformas. Viajes, gastos y preferencias viven únicamente en memoria. Reiniciar la demostración los borra.

No introducir credenciales reales. La UI no importa `data/` ni `services/`, no solicita GPS ni escribe en la cola real. La fase 4 se mantiene separada.

Las metas, el neto, los descuentos y las carreras faltantes son ejemplos precargados. No hay reglas financieras productivas. Después de mutaciones o filtros sin proyección compatible se informa que no hay proyección disponible.

## Recorrido

Desde Login, usar correo/teléfono ficticio y contraseña de prueba de ocho caracteres. Seleccionar al menos una plataforma para abrir Dashboard.

La barra tiene Dashboard, Historial, Nuevo viaje, Gastos y Ajustes. Gastos reutiliza Historial con filtro de gastos. Nuevo viaje abre Confirmación; Alta de gasto está disponible en Dashboard e Historial. Los modales requieren acciones explícitas; cerrar Alta de gasto conserva el borrador.

Cada superficie incluye un selector visible de escenarios de demostración. Este selector reproduce estados visuales y no representa operaciones de red. Elegir vacío no borra los registros de sesión. Las preferencias guardadas se conservan durante la sesión, no después de reiniciar.

## Runtime

Dependencias alineadas con Expo SDK 57 instalado: React 19.2.3 y React Native 0.86.3. No hay opt-out de arquitectura nativa antigua. Orientation default permite portrait/landscape. Expo UI aporta botones nativos; los controles que necesitan estado seleccionado o etiquetas accesibles usan primitivas React Native del mismo shell.

## Comandos

Desde la raíz:

```sh
bun install
bun --filter ui dev
bun --filter ui tsc
bun --filter ui lint
bun test
```

Los tests UI están en `tests/`, no en `ui/`. Para comprobarlos específicamente:

```sh
bun test tests/unit tests/integration
cd ui
node node_modules/typescript/bin/tsc -p ../tests/tsconfig.json --noEmit
cd ../tests
node ../node_modules/eslint/bin/eslint.js unit/ui-*.test.ts integration/ui-demo-flows.test.ts
bun test --coverage
```

La cobertura de `tests/bunfig.toml` exige 80% de líneas y funciones en los módulos de lógica cargados, excluyendo fixtures y contratos. Bun no acredita aquí cobertura de branches/statements ni renderizado nativo. No confundir estas pruebas con E2E.

Los tipos de rutas se generan al arrancar Expo. Si faltan rutas en TypeScript tras añadir archivos, arrancar Expo antes de repetir el chequeo; no desactivar typed routes.

## Aceptación pendiente

Consultar `../tests/ui/manual-acceptance.md` y el `verify-report.md` del cambio. Empaquetar iOS/Android no prueba su ejecución. No integrar ni archivar hasta completar la revisión nativa y obtener aprobación humana.
