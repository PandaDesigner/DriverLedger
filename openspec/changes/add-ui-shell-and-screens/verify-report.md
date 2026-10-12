# Verificación parcial: add-ui-shell-and-screens

## Resultado

BLOCKED para integración. Código de demostración implementado; aceptación visual/nativa pendiente. Tareas: 24 totales, 18 marcadas y 6 abiertas (2.4, 3.3, 3.4, 5.2, 5.3, 5.5). Sin merge ni archivo. La base usada fue `9627416`, que ya contiene cambios de fase 4; esta rama no modifica `data/` ni `services/`.

## Ejecución real

- `bun test`: 162 aprobadas, 0 fallidas, 15 archivos.
- `bun test tests/unit tests/integration`: 15 aprobadas, 0 fallidas; son pruebas de lógica y revisión estática de imports, no render RN.
- TypeScript UI y `tests/tsconfig.json`: salida 0.
- ESLint UI y tests raíz: salida 0 tras corregir el efecto duplicado de Historial. La carga inicial fue lenta; ejecuciones con timeout de hasta 600 segundos terminaron.
- Prettier aplicado a rutas, source, configuración y tests.
- Expo export iOS/Android: salida 0; bundles Hermes de aproximadamente 3 MB en `/tmp/driverledger-ui-native-export`.
- Expo install check aprobó versiones alineadas; safe-area fue declarado explícitamente después.
- `cd tests && bun test --coverage`: 15 aprobadas; 100% líneas y funciones de history.ts, model.ts y navigation.ts, excluyendo fixtures/contratos. Umbrales de 80% configurados. No acredita pantallas ni branches/statements.

## Evidencia TDD

`3bc676f`: 11 fallos por funciones de demostración sin implementar. `3c4cc3d`: las mismas 11 pruebas pasan.

`9b0fb76`: reproducción del escenario vacío destructivo, 5 pasan/1 falla. `49ab550`: 11 pasan tras preservar datos de sesión.

Las pruebas de navegación, aislamiento e integración se añadieron después del core; no se presenta un RED inexistente para esas suites ni para render de pantallas.

## Escenarios y alcance probado

| Escenario OpenSpec       | Evidencia                                                           | Estado                                                        |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| Arranque de demostración | Tipos, rutas y export; smoke Expo Go sin render confirmado          | Pendiente nativo                                              |
| Ownership fase 3         | Test de imports por cada ruta/módulo y diff de la rama              | Estático; no prueba todos los efectos indirectos de librerías |
| Recuperación sin correo  | UI explica simulación; límite de imports aprobado                   | Pendiente interacción                                         |
| Confirmación repetida    | ui-demo y ui-demo-flows, mismo ID añade una vez; dos IDs añaden dos | Lógica aprobada                                               |
| Entrada/onboarding       | ui-demo y ui-demo-flows, plataforma requerida                       | Lógica aprobada; navegación nativa pendiente                  |
| Formulario inválido      | ui-demo: identidad, importe, categoría y fecha                      | Lógica aprobada; foco/mensajes nativos pendientes             |
| Shortcut Gastos          | Validación del tipo + barra y ruta implementadas                    | Interacción pendiente                                         |
| Plataforma en Historial  | ui-history mantiene gastos sin plataforma                           | Lógica aprobada                                               |
| Selección vacía          | ui-history + ui-demo-flows conservan datos de sesión                | Lógica aprobada; acción UI pendiente                          |
| Borrador tras dismiss    | Estado conserva borrador; discard/submission explícitos             | Dismiss/back nativos pendientes                               |
| Reduced motion           | Navegación sin animación y feedback estático                        | Aceptación pendiente                                          |
| Gasto offline            | ui-demo-flows produce pendiente simulado, sin proyección financiera | Lógica aprobada; UI pendiente                                 |

## Bloqueos y desviaciones

Expo Go quedó abriendo el proyecto al 80% del bundle en la primera captura. Capturas posteriores del simulador excedieron 15 y 60 segundos; no se acredita render, nueve superficies, landscape, lectores de pantalla ni Android. Véase `tests/ui/manual-acceptance.md`.

Bun acredita líneas/funciones; statements no se exige efectivamente y branches no está acreditado. Los cuatro umbrales originales del diseño no se pueden declarar cumplidos con esta evidencia. No se añadió otro runner ni se relajó silenciosamente la aceptación.

El usuario autorizó corregir runtime UI y lockfile: React, React Native, tipos, ESLint y TypeScript. Se eliminó newArchEnabled obsoleto, se habilitó landscape y se migró el alias sin baseUrl. No se cambiaron servicios de fase 4.

## Siguiente puerta

Completar aceptación nativa, resolver evidencia de cobertura pendiente y obtener aprobación del resultado antes de integrar. Mantener el change abierto; no archivar ni dar por terminada la fase.
