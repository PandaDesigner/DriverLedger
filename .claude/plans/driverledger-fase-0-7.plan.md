# DriverLedger — Plan de ejecución Fase 0–7

**Estado:** plan actualizado con el contrato UI vigente.
**Fuente de producto:** `docs/PRD-consolidado.md`.
**Fuente técnica:** `docs/RFC-001-arquitectura.md` a `docs/RFC-004-sincronizacion.md`.
**Fuente UI:** `docs/ui/`.
**Complejidad:** Large — React Native + Expo, SQLite, Supabase, RxJS, GPS y siete fases funcionales.

## 1. Objetivo del producto

DriverLedger es una app móvil offline-first para conductores que trabajan con Uber, DiDi e InDrive en Medellín. El producto debe permitir registrar carreras y gastos con mínima carga cognitiva, entender el progreso hacia una meta neta diaria de 310–320k COP y revisar la rentabilidad por día y período.

La app debe funcionar sin conexión. SQLite es la fuente local operativa; Supabase es la fuente remota de verdad; la sincronización es eventual.

## 2. Fuentes de verdad y precedencia

Cuando exista una contradicción, aplicar este orden:

1. PRD para alcance y reglas de producto.
2. RFCs para decisiones técnicas.
3. `docs/ui/` para composición, navegación, estados y referencias visuales.
4. OpenSpec para el contrato ejecutable de cada change.
5. Este plan para secuencia, ownership, dependencias y validación.

Una modificación que cambie comportamiento debe actualizar PRD/RFC/OpenSpec, no solo una imagen o una maqueta.

## 3. Decisiones globales

| Área | Decisión | Consecuencia |
|---|---|---|
| Runtime | Bun | `bun install`, `bun run`, `bun test`; sin npm/yarn/jest/vitest. |
| App | React Native + Expo SDK 57+ | UI nativa y Expo Router. |
| UI primitives | Expo UI | Componentes nativos; evitar una segunda design system. |
| Estado | RxJS + signals | La UI consume observables/señales sin conocer la fuente. |
| Datos | SQLite offline-first + Supabase | Escritura local primero y sync eventual. |
| Auth/secrets | SecureStore | Nunca incluir `service_role` ni secretos en el bundle. |
| GPS | Solo carrera activa | Sin consumo de batería cuando no hay carrera activa. |
| Registro | Strategy por plataforma + State `AppMode` | Uber, DiDi e InDrive comparten contrato y difieren en captura. |
| Git | GitFlow + OpenSpec | 1 change = 1 rama `feature/<change>`. |
| Ownership | OpenCode: `data/` + `services/`; Pi: `ui/` + `tests/` | No cruzar ownership en un change. |

## 4. Contrato funcional de UI

### 4.1 Vistas y modales dentro del alcance

Fase 3 implementa siete vistas y dos modales:

| ID | Superficie | Responsabilidad | Resultado esperado |
|---|---|---|---|
| V01 | Login | Autenticar al conductor | Entrar o recuperar acceso. |
| V02 | Registro | Crear cuenta | Cuenta creada y lista para onboarding. |
| V03 | Olvidar contraseña | Recuperar acceso | Solicitud de recuperación enviada. |
| V04 | Onboarding | Seleccionar/configurar plataformas | Workspace preparado. |
| V05 | Dashboard | Mostrar situación operativa del día | Entender progreso y ejecutar siguiente acción. |
| V06 | Historial | Revisar viajes y gastos | Consultar actividad por período/plataforma. |
| V07 | Settings | Configurar cuenta y preferencias | Cambios guardados o pendientes de sync. |
| M01 | Confirmación de carrera | Confirmar captura automática/manual | Carrera guardada con un tap deliberado. |
| M02 | Alta de gasto | Registrar gasto diario | Gasto guardado localmente y en cola si offline. |

La especificación visual y de estados está en `docs/ui/views.md`. Las referencias generadas están en `docs/ui/references/`.

### 4.1.1 Casos de uso por superficie

| ID | Caso | Resultado verificable |
|---|---|---|
| U-01 | Iniciar sesión | El conductor entra al workspace o recibe error recuperable. |
| U-02 | Crear cuenta | La cuenta se crea y el flujo continúa a onboarding. |
| U-03 | Recuperar acceso | Se envía la solicitud y se informa el siguiente paso. |
| U-04 | Configurar plataformas | Se guardan las plataformas activas y el modo de captura. |
| U-05 | Consultar Dashboard | El conductor ve meta, acumulado, KPIs, semana y actividad reciente. |
| U-06 | Consultar Historial | El conductor filtra, agrupa y abre viajes/gastos por período. |
| U-07 | Entrar a Gastos | Se abre Historial con filtro de gastos, sin duplicar una vista de negocio. |
| U-08 | Configurar preferencias | Los cambios se guardan localmente y quedan pendientes de sync si corresponde. |
| U-09 | Confirmar carrera | Una captura manual/API/background se confirma con un tap deliberado. |
| U-10 | Registrar gasto | El gasto se persiste localmente y se sincroniza posteriormente. |

### 4.2 Navegación única

Todas las vistas principales comparten una única barra inferior de cinco slots:

1. Dashboard.
2. Historial.
3. Nuevo viaje — acción central.
4. Gastos — abre Historial en modo filtrado de gastos.
5. Ajustes.

No se implementarán dos variantes de tab navigation. `Gastos` no agrega una octava pantalla de negocio: reutiliza Historial con filtro de tipo `expense`.

Rutas conceptuales:

```text
app/
  (auth)/login
  (auth)/register
  (auth)/forgot-password
  (onboarding)/platforms
  (tabs)/dashboard
  (tabs)/history
  (tabs)/settings
  modals/confirm-trip
  modals/add-expense
```

### 4.3 Dashboard

El Dashboard responde: “¿cómo voy hoy y cuál es mi siguiente acción?”.

Orden visual obligatorio:

1. Saludo, fecha y estado de sync/offline.
2. Hero de meta neta diaria: acumulado, meta, faltante y porcentaje.
3. KPIs: viajes, ingresos brutos, gastos y tiempo activo.
4. Resumen semanal de ganancia neta.
5. Viajes recientes.
6. Acción central para nuevo/confirmar viaje.

La referencia principal es `docs/ui/references/dashboard.png`.

### 4.4 Historial

Historial usa el mismo shell visual y navegación del Dashboard.

Composición obligatoria:

1. Título `Historial` y selector de rango.
2. Segmentos `Hoy`, `Esta semana`, `Este mes`.
3. Filtros `Todas`, `Uber`, `DiDi`, `InDrive`.
4. Resumen de neto acumulado, ingresos, gastos y viajes.
5. Lista cronológica agrupada por día.
6. Filas de carrera y gasto con detalle, importe y estado.
7. Navegación inferior idéntica al Dashboard.

Casos de uso mínimos:

| ID | Caso | Resultado |
|---|---|---|
| H-01 | Revisar actividad del día | Viajes y gastos de hoy ordenados cronológicamente. |
| H-02 | Cambiar período | Totales y lista recalculados para semana/mes/período. |
| H-03 | Filtrar plataforma | Se muestran solo viajes de la plataforma seleccionada. |
| H-04 | Abrir carrera | Se muestra detalle de valor, plataforma, fuente, hora y ruta disponible. |
| H-05 | Abrir gasto | Se muestra detalle de importe, categoría, fecha y nota. |
| H-06 | Filtro sin resultados | Empty state con acción clara para limpiar filtros. |
| H-07 | Consultar offline | Se muestran datos cacheados y estado de sync. |

La referencia vigente es `docs/ui/references/history-v2.png`. La imagen anterior queda como referencia histórica, no como contrato.

### 4.5 Estados transversales

Cada vista aplicable debe diseñar:

- Loading: skeleton estable, no layout vacío.
- Empty: explicación concreta y siguiente acción.
- Error: causa, recuperación y retry.
- Offline: datos cacheados y estado de cola/sync.
- Success: confirmación breve y siguiente acción.
- Permission: explicación y retorno seguro cuando requiera ubicación/notificaciones.

## 5. Plan por fases

### Fase 0 — Bootstrap

#### 0a — `setup-supabase-tables` (OpenCode)

**Scope:** `data/`, migraciones, RLS, seeds y configuración de Supabase.

**Entregables:**

- `data/migrations/0001_init_schema.sql` — tablas, constraints, indexes y enums.
- `data/migrations/0002_rls_policies.sql` — RLS por `driver_id`.
- `data/migrations/0003_seeds.sql` — Uber, DiDi, InDrive.
- `data/README.md` — migración local y smoke test.
- OpenSpec proposal/design/tasks + spec delta de modelo, realtime y storage.

**Validación:** `openspec validate setup-supabase-tables --strict` y tests RLS multi-driver.

#### 0b — `setup-expo-skeleton` (Pi)

**Scope:** `ui/`, workspace Bun, Expo Router mínimo y configuración TS/ESLint/Prettier.

**Entregables:** `ui/package.json`, `app.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `bunfig.toml`, `App.tsx`, `index.ts`, README y OpenSpec.

**Validación:** `bun install`, `bun tsc --noEmit`, `bun lint`.

### Fase 1 — `local-data-model-sqlite` (OpenCode)

Crear el esquema SQLite espejo del contrato remoto y repositorios para carreras, gastos y eventos.

**Reglas:** upsert por `trip_id`, metadata conservada, timestamps monotónicos, tests de idempotencia.

**Dependencias:** Fase 0a.
**Validación:** `bun test` + OpenSpec strict.

### Fase 2 — `add-sync-queue` (OpenCode)

Implementar `SyncService`, cola offline, backoff exponencial, last-write-wins y estado de red.

**Reglas:** escribir primero en SQLite; GPS no se sincroniza; máximo cinco fallos antes de pausar.

**Dependencias:** Fase 1.
**Validación:** tests offline→online, conflicto de versiones y reintentos.

### Fase 3 — `add-ui-shell-and-screens` (Pi)

Implementar las superficies definidas en §4 y `docs/ui/`.

**Scope:** solamente `ui/`, `tests/` y artefactos OpenSpec del change.

**Requisitos UI:**

- Expo Router.
- Una sola navegación inferior de cinco slots.
- `Gastos` como filtro de Historial, no pantalla duplicada.
- Modo claro/oscuro.
- Touch targets mínimos de 48pt.
- Safe areas y accesibilidad.
- Estados transversales definidos en §4.5.
- Tokens semánticos, no colores raw por pantalla.
- Motion funcional conforme a `docs/ui/motion.md`.

**Dependencias:** Fase 0b para shell; puede comenzar el diseño estructural en paralelo con Fase 1, pero la integración de datos depende de Fase 1/2.
**Validación:** `bun tsc --noEmit`, lint, pruebas de navegación y revisión visual de las nueve superficies.

### Fase 4 — `add-platform-strategies` (OpenCode)

Implementar Strategy para Uber, DiDi e InDrive, State `AppMode` y contrato de confirmación de un tap.

**Contrato de confirmación:** plataforma, tarifa, origen, destino, duración, gasolina estimada, comisión y neto; editar es fallback.

**Dependencias:** Fase 1; la UI de M01 debe existir desde Fase 3.
**Validación:** unit tests por strategy e integración de confirmación.

### Fase 5 — `add-background-gps` (OpenCode + Pi)

Conectar `expo-task-manager` + `expo-location` con `posicion$` solo durante carrera activa.

**UI:** indicador visual en Dashboard y estado de permiso; no capturar GPS en modo inactivo.

**Dependencias:** Fase 4 y permisos Expo.
**Validación:** activation/deactivation, permisos, battery no-drain inactivo.

### Fase 6 — `integrate-uber-driver-api` (OpenCode, bloqueada)

OAuth2 y Driver API solo cuando partnership sea aprobada.

**Preparación permitida:** interfaz y placeholder de `UberStrategy`.
**No permitido:** credenciales reales, `service_role` en bundle o simular integración aprobada.

### Fase 7 — `add-tests-and-polish` (Pi)

Completar unit, integration y E2E; regenerar escenarios desde Gherkin; pulir accesibilidad y estados.

**Targets:** cobertura ≥80%, accessibility score ≥95, validación visual mobile portrait y landscape, reduced motion, Dynamic Type y offline.

## 6. Grafo de dependencias y paralelismo

```text
0a setup-supabase-tables ──> 1 local-data-model-sqlite ──> 2 add-sync-queue ──> 4 strategies ──> 5 background-gps ──> 7 tests-polish
0b setup-expo-skeleton ────────────────────────────────────> 3 ui-shell-and-screens ────────────────┘
4 strategies ──> 6 uber-api (blocked externally)
```

0a y 0b son paralelizables porque no comparten ownership. Fase 3 puede definir shell y estados con mocks mientras Fase 1/2 avanzan, pero no debe inventar contratos de datos.

## 7. Ownership y límites de cambios

| Dominio | Agente | Carpetas |
|---|---|---|
| Datos | OpenCode | `data/`, migraciones, repositorios |
| Servicios | OpenCode | `services/`, sync, strategies, GPS |
| UI | Pi | `ui/` |
| Tests de UI | Pi | `tests/` |
| Documentación | Coordinada | `docs/`, `openspec/`, `.claude/plans/` |

Un change no toca ambos dominios de código. Si una tarea cruza el límite, dividirla antes de implementarla.

## 8. Validación por fase

```bash
# Fase 0
openspec validate setup-supabase-tables --strict
openspec validate setup-expo-skeleton --strict
bun install
bun --filter ui tsc --noEmit
bun --filter ui lint

# Fases 1–7
openspec validate <change> --strict
openspec status <change>
bun test
bun test --coverage
```

Validación manual UI:

- 375px-equivalent mobile portrait.
- Large phone and landscape.
- Light/dark mode.
- Reduced motion.
- Dynamic Type / text scaling.
- VoiceOver/TalkBack labels and focus order.
- Offline, sync pending, empty, error and success.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| RLS leak entre drivers | Crítico | Tests multi-tenant y nunca `service_role` en cliente. |
| Drift SQLite/Supabase | Alto | Contrato único y tests de upsert/idempotencia. |
| Segunda navegación divergente | Medio | Una sola especificación en `docs/ui/navigation.md`; revisión visual Fase 3. |
| Gastos duplican Historial | Medio | Gastos es filtro de Historial, no nuevo modelo de vista. |
| Batería por GPS | Alto | GPS solo en carrera activa y tests de lifecycle. |
| Texto/marca generado incorrecto | Medio | Imágenes solo referencia; validar labels/assets antes de producción. |
| Uber API bloqueada | Alto | Placeholder de strategy; Fase 6 bloqueada hasta partnership. |
| Scope creep visual | Medio | No agregar vistas fuera de §4 sin actualizar PRD y OpenSpec. |

## 10. Definition of Done

- [ ] PRD, RFCs, `docs/ui/` y este plan no se contradicen.
- [ ] Cada pantalla tiene job, composición, estados y caso de uso.
- [ ] Existe una sola navegación inferior documentada.
- [ ] `Gastos` reutiliza Historial y no crea una octava pantalla de negocio.
- [ ] Cada change tiene OpenSpec válido y rama correspondiente.
- [ ] Ownership respetado entre `data/`, `services/`, `ui/` y `tests/`.
- [ ] Tests RED → GREEN → REFACTOR cuando el change sea testeable.
- [ ] Coverage ≥80% al cierre de cada fase testeable.
- [ ] Accessibility score ≥95 al cierre de Fase 7.
- [ ] Puerta humana después del plan y antes del commit/merge.
- [ ] OpenSpec archivado solo después de merge a `develop` y validación.

