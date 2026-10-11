# sync-queue Specification

## Purpose
TBD - created by archiving change add-sync-queue. Update Purpose after archive.
## Requirements
### Requirement: sync-queue-states

The drain loop SHALL transition each `sync_queue` row through the states defined in `openspec/specs/data-model/spec.md §sync-queue-states`:

- `pendiente` → `procesando` → `completado` (success path).
- `pendiente` → `procesando` → `fallido` (transient failure; retry).
- `fallido` with `intentos >= 5` → `pausado` (terminal; manual retry only).

The `operacion` column SHALL be restricted to `insert`, `update`, `upsert`, `delete` (CHECK constraint from Phase 1 `data/sqlite/migrations.ts:100-110`).

#### Scenario: pendiente transiciona a completado en push exitoso

GIVEN a `sync_queue` row with `estado = 'pendiente'` and `intentos = 0`, WHEN the drain loop pushes the row to the transport successfully, THEN the row's `estado` SHALL transition to `completado`, `intentos` SHALL be `1`, and `ultimo_intento` SHALL equal the ISO timestamp of the drain attempt.

#### Scenario: fallido incrementa intentos y espera backoff

GIVEN a `sync_queue` row with `estado = 'pendiente'` and `intentos = 1`, WHEN the drain loop attempts a push and the transport errors, THEN the row's `estado` SHALL transition to `fallido`, `intentos` SHALL be `2`, and the next attempt SHALL wait `BACKOFF_SCHEDULE[1] = 2000` ms before running.

#### Scenario: pausado despues de cinco intentos

GIVEN a `sync_queue` row with `estado = 'fallido'` and `intentos = 5`, WHEN the drain loop attempts a push and the transport errors, THEN the row's `estado` SHALL transition to `pausado`, and the drain loop SHALL NOT auto-retry the row on subsequent drains.

### Requirement: sync-queue-trigger-hybrid

The drain loop SHALL be triggered by either of two sources:

1. **Event edge** — a subscription to `NetworkService.becameOnline$`. When the Observable emits, the drain loop SHALL begin a drain within the same microtask.
2. **Polling tick** — `setInterval(30_000)`. When the tick fires, the drain loop SHALL begin a drain ONLY WHEN `NetworkService.red$.value === true`. If `red$.value === false`, the tick SHALL be a no-op (zero DB hits).

The drain loop SHALL be idempotent — if a drain is already in flight when a new trigger arrives, the new trigger SHALL be a no-op.

#### Scenario: drain al reconectar

GIVEN the device is offline (`NetworkService.red$.value === false`) and 3 rows are `pendiente` in `sync_queue`, WHEN the device transitions to online (`red$.value === true` AND `becameOnline$` emits), THEN the drain loop SHALL begin within the same microtask, and all 3 rows SHALL transition to `procesando` (then `completado` or `fallido` based on transport outcome).

#### Scenario: tick cada treinta segundos

GIVEN the device is online (`NetworkService.red$.value === true`) and 1 row is `pendiente`, WHEN 30 seconds elapse without a `becameOnline$` event, THEN the polling tick SHALL fire and the drain loop SHALL begin.

#### Scenario: tick no-op mientras offline

GIVEN the device is offline (`NetworkService.red$.value === false`), WHEN 60 seconds elapse, THEN no drain SHALL run (zero `UPDATE sync_queue` queries).

#### Scenario: drain idempotente

GIVEN a drain is in flight, WHEN a second trigger arrives (`becameOnline$` event OR polling tick), THEN the second trigger SHALL be a no-op, and exactly one in-flight transport call SHALL be active.

### Requirement: sync-queue-backoff

The drain loop SHALL wait `BACKOFF_SCHEDULE[intentos - 1]` milliseconds before the next retry attempt on a `fallido` row. `BACKOFF_SCHEDULE` SHALL be `[1000, 2000, 4000, 8000, 16000]`. After `intentos >= 5`, the row SHALL transition to `pausado` and SHALL NOT auto-retry.

#### Scenario: secuencia de backoff exponencial

GIVEN a `fallido` row, WHEN the drain loop attempts a retry, THEN the wait between attempt N and attempt N+1 SHALL equal `BACKOFF_SCHEDULE[N - 1]` ms (e.g. attempt 1 → wait 1000ms, attempt 2 → wait 2000ms, attempt 3 → wait 4000ms, attempt 4 → wait 8000ms, attempt 5 → wait 16000ms).

#### Scenario: cap de cinco intentos

GIVEN a `fallido` row with `intentos = 5`, WHEN the drain loop attempts a retry and the transport errors, THEN the row SHALL transition to `pausado` and SHALL NOT be picked up by subsequent drains (without a manual retry).

### Requirement: sync-conflict-resolver

For each `pendiente` row, the drain loop SHALL compare the local `updated_at` of the payload row against the remote `updated_at` returned by `SyncTransport.read(table, pk)`. The resolver SHALL apply last-write-wins:

- IF remote is `null` → push via `SyncTransport.upsert/delete`. Mark `completado`.
- IF `remote.updated_at > local.updated_at` → DROP the local change. Mark `completado` with `metadata.error = 'remote-fresher'`. Log `tipo = 'sync.conflict'` in `log_eventos`.
- ELSE → push via `SyncTransport.upsert/delete`. Mark `completado`.

#### Scenario: drop cuando remoto es mas reciente

GIVEN a local `carreras` row with `updated_at = '2026-10-11T10:00:00.000Z'` and a remote `carreras` row with `updated_at = '2026-10-11T11:00:00.000Z'`, WHEN the drain loop processes the corresponding `sync_queue` row, THEN the transport SHALL NOT receive an `upsert` call, the `sync_queue` row SHALL transition to `completado` with `metadata.error = 'remote-fresher'`, and a `log_eventos` row with `tipo = 'sync.conflict'` SHALL be inserted.

#### Scenario: push cuando local es mas reciente o igual

GIVEN a local `carreras` row with `updated_at = '2026-10-11T12:00:00.000Z'` and a remote `carreras` row with `updated_at = '2026-10-11T11:00:00.000Z'` (or `null`), WHEN the drain loop processes the corresponding `sync_queue` row, THEN the transport SHALL receive exactly one `upsert` call, and the `sync_queue` row SHALL transition to `completado`.

#### Scenario: segundo check defensivo en transport.upsert

WHEN `SyncTransport.upsert` returns `{ conflict: 'remote-fresher', remoteUpdatedAt }`, THEN the drain loop SHALL mark the `sync_queue` row `completado` with `metadata.error = 'remote-fresher'`, and SHALL NOT retry (the conflict window between the enqueue check and the push is logged in `log_eventos`).

### Requirement: sync-enqueue-de-dup

The enqueue subscription SHALL consume `dbChange$` and insert a `sync_queue` row per event. The subscription SHALL filter out:

- `event.table === 'sync_queue'` (would create infinite re-entrance).
- `event.table === 'plataformas'` (reference data; seeds come from migration 0003).
- `event.table === 'posicion'` (GPS excluded per RFC-004 §Reglas).

The enqueue function SHALL be idempotent on `(driver_id, tabla, registro_id, operacion)`:

- IF a row with the same key exists in `estado IN ('pendiente', 'fallido', 'pausado')` → refresh `ultimo_intento` and keep the original `estado`. No new row.
- ELSE → insert a new row with `estado = 'pendiente'`, `intentos = 0`, `ultimo_intento = NULL`, `metadata = '{}'`.

#### Scenario: enqueue normal crea fila pendiente

WHEN `dbChange$` emits `{ kind: 'upsert', table: 'carreras', rowId: 'r-1', driverId: 'driver-A', ts: '...' }`, THEN a `sync_queue` row SHALL be inserted with `tabla = 'carreras'`, `registro_id = 'r-1'`, `operacion = 'upsert'`, `estado = 'pendiente'`, `intentos = 0`.

#### Scenario: enqueue duplicado actualiza ultimo_intento

GIVEN a `sync_queue` row with `(driver_id = 'driver-A', tabla = 'carreras', registro_id = 'r-1', operacion = 'upsert')` in `estado = 'pendiente'`, WHEN `dbChange$` emits the same event again, THEN no second `sync_queue` row SHALL be inserted; the existing row's `ultimo_intento` SHALL be the new ISO timestamp, and `estado` SHALL remain `pendiente`.

#### Scenario: filtro de sync_queue evita reencolar

WHEN `dbChange$` emits `{ kind: 'update', table: 'sync_queue', rowId: 'q-1', driverId: 'driver-A', ts: '...' }`, THEN no `sync_queue` row SHALL be inserted (the drain loop's own state transitions are not queueable).

#### Scenario: filtro de plataformas evita reencolar reference data

WHEN `dbChange$` emits `{ kind: 'insert', table: 'plataformas', rowId: 'p-new', driverId: 'driver-A', ts: '...' }`, THEN no `sync_queue` row SHALL be inserted.

### Requirement: sync-gps-isolation

The drain loop SHALL NEVER push GPS coordinates. The enqueue subscription SHALL filter `event.table === 'posicion'` from `dbChange$`. The `sync_queue` table SHALL NOT contain any row with `tabla = 'posicion'`.

#### Scenario: posicion nunca aparece en sync_queue

WHEN a `dbChange$` event is emitted with `table = 'posicion'`, THEN no `sync_queue` row SHALL be inserted, and `SELECT COUNT(*) FROM sync_queue WHERE tabla = 'posicion'` SHALL return `0`.

### Requirement: sync-rls-facade-mirror

Every mutation on the `sync_queue` table from `services/sync-queue.service.ts` SHALL route through `services/db.service.ts`'s `LocalDatabase` interface. The sync service SHALL NOT import `expo-sqlite` directly. This reasserts `openspec/specs/local-data-model/spec.md §local-rls-facade`.

#### Scenario: writes van por la facade

WHEN `syncQueueService.drain()` transitions a row to `completado`, THEN the `UPDATE sync_queue SET estado = 'completado', intentos = intentos + 1, ultimo_intento = ? WHERE id = ?` query SHALL be executed via `LocalDatabase.run(...)` obtained from `db.service.ts` (never a direct `expo-sqlite` import).

#### Scenario: imports inspeccionados en code review

WHEN a code review inspects `services/sync-queue.service.ts` for `import` of `expo-sqlite`, THEN no such import SHALL appear.

### Requirement: sync-network-events

`services/network.service.ts` SHALL expose `red$: BehaviorSubject<boolean>` reflecting the device's current connectivity, AND `becameOnline$: Observable<void>` firing ONLY on the rising edge (`offline → online` transition).

#### Scenario: red$ refleja conectividad actual

WHEN the device transitions from `online` to `offline`, THEN `NetworkService.red$.value` SHALL be `false`, AND `NetworkService.red$.getValue()` SHALL emit `false` to new subscribers.

#### Scenario: becameOnline$ fires en rising edge

WHEN the device transitions from `online` to `offline`, THEN `NetworkService.becameOnline$` SHALL NOT emit. WHEN the device transitions from `offline` to `online`, THEN `NetworkService.becameOnline$` SHALL emit exactly once.

#### Scenario: becameOnline$ fires multiples veces en ciclos

GIVEN the device transitions `online → offline → online → offline → online`, WHEN each `offline → online` transition occurs, THEN `NetworkService.becameOnline$` SHALL emit exactly once per transition (3 emissions total).

