# Fase 3: shell y pantallas

## Why

El scaffold solo muestra una ruta de prueba. Hace falta recorrer las siete vistas y dos modales definidos en `docs/ui/` antes de integrar los servicios pendientes.

## What Changes

- Sustituir el placeholder por Login, Registro, Recuperación, Onboarding, Dashboard, Historial y Ajustes.
- Añadir Confirmación de carrera y Alta de gasto.
- Compartir una barra inferior: Dashboard, Historial, Nuevo viaje, Gastos y Ajustes. Gastos filtra Historial.
- Usar tokens semánticos, temas claro/oscuro, safe areas, controles de al menos 48pt y movimiento reducido.
- Añadir escenarios explícitos de demostración para carga, vacío, error, offline, pendiente y éxito.
- Modificar el contrato `ui-bootstrap` para permitir el nuevo shell.

## Alcance de demostración acordado

Donde faltan servicios, los flujos usan datos ficticios y resultados identificados como simulados. No crean cuentas, envían correos ni guardan datos reales. Los valores financieros son ejemplos precargados; no se inventan reglas para neto, descuentos o carreras faltantes.

No se declara completa la integración productiva de fase 3. Requiere posteriores contratos de autenticación, gastos, preferencias y transporte remoto. Sin una sesión real, este change no consulta datos de conductores.

## Approach

Rutas delgadas de Expo Router, pantallas separadas y estado de demostración en memoria. Reutilizar las dependencias del workspace y comprobar su compatibilidad antes de construir controles. Sin acceso a SQLite, Supabase, GPS ni secretos desde esta demostración.

## Impact

- `ui/`: shell, pantallas, componentes, tokens y escenarios.
- `tests/`: pruebas Bun de lógica y flujos de demostración; aceptación visual nativa.
- `openspec/changes/add-ui-shell-and-screens/`: contrato y plan.
- Sin cambios en `data/`, `services/` ni specs principales antes del archivo.

## Riesgos y reversión

Confundir simulación con operación real: avisos persistentes y pruebas de ausencia de efectos externos. Compatibilidad nativa: comprobarla antes de implementar; escalar cualquier cambio de dependencias.

Revertir los archivos UI/tests del change y restaurar el placeholder. No hay migraciones ni efectos remotos.

## Criterios de éxito

- Nueve superficies navegables con estados verificables y navegación única.
- Typecheck, lint, pruebas Bun y cobertura de lógica testeable de al menos 80%.
- Revisión visual en dispositivo/simulador registrada, sin presentarla como E2E automatizado.
- Aprobación humana del plan antes de rama/implementación y del resultado antes de merge.
