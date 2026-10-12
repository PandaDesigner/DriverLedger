# Verificación parcial: add-ui-shell-and-screens

## Resultado

BLOCKED para integración. Código de demostración implementado; aceptación visual/nativa pendiente. Tareas: 24 totales, 18 marcadas y 6 abiertas (2.4, 3.3, 3.4, 5.2, 5.3, 5.5). Sin merge de fase 3 ni archivo. La base inicial fue `9627416`; se hizo rebase sin conflictos sobre `origin/develop` en `8f23143` después del merge del PR #2 de fase 4. El diff de esta rama no modifica `data/` ni `services/`.

## Ejecución real

- Después del rebase, `bun test`: 235 aprobadas, 0 fallidas, 18 archivos.
- Suites UI ejecutadas con cobertura: 16 aprobadas, 0 fallidas; son pruebas de lógica y revisión estática de imports, no render RN.
- TypeScript UI y `tests/tsconfig.json`: salida 0.
- ESLint UI y tests raíz: salida 0 tras corregir el efecto duplicado de Historial. La carga inicial fue lenta; ejecuciones con timeout de hasta 600 segundos terminaron.
- Prettier aplicado a rutas, source, configuración y tests.
- Expo export iOS/Android repetido después del rebase: salida 0; ambos bundles Hermes en `/tmp/driverledger-ui-post-rebase-export`.
- Expo install check repetido después del rebase: dependencias al día, salida 0, incluyendo safe-area declarado.
- `cd tests && bun test --coverage`: 16 aprobadas; 100% líneas y funciones de history.ts, model.ts y navigation.ts, excluyendo fixtures/contratos. Umbrales de 80% configurados. No acredita pantallas ni branches/statements.

## Evidencia TDD

Commits alcanzables después del rebase: `f2e39a6`, RED de 11 fallos por funciones sin implementar; `d4b6d2b`, GREEN de las mismas 11 pruebas.

`2dda8ac`: reproducción del escenario vacío destructivo, 5 pasan/1 falla. `752c008`: 11 pasan tras preservar datos de sesión.

`716134d`: RED de proyección incompatible con meta alcanzada, 5 pasan/1 falla. `6a87766`: corrección y GREEN, con 235 pruebas globales y 16 UI aprobadas. También se corrigieron la tarifa editada, el resumen con parámetros inválidos y las identidades de navegación. Revisión Sideroom final sin infracciones pendientes.

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
