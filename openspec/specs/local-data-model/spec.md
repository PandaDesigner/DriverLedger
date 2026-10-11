# local-data-model Specification

## Purpose
TBD - created by archiving change local-data-model-sqlite. Update Purpose after archive.
## Requirements
### Requirement: local-schema-tables

The local SQLite schema SHALL contain exactly the following six tables: `plataformas`, `carreras`, `gastos_fijos`, `gastos_diarios`, `log_eventos`, `sync_queue`. Each table SHALL expose the same column set as the remote `data-model.spec.md §schema-tables` requirement, adapted to SQLite types: `uuid` → `TEXT`, `numeric(12,2)` → `REAL`, `numeric(8,2)` → `REAL`, `numeric(5,2)` → `REAL`, `integer` → `INTEGER`, `boolean` → `INTEGER CHECK (boolean IN (0,1))` (or `INTEGER NOT NULL DEFAULT 1`), `text` → `TEXT`, `date` → `TEXT DEFAULT (date('now'))` (ISO `YYYY-MM-DD`), `timestamptz` → `TEXT DEFAULT (datetime('now'))` (ISO 8601 UTC).

#### Scenario: six tablas locales contract

WHEN `getDb()` opens the local SQLite database for the first time, THEN the system SHALL create all six tables (`plataformas`, `carreras`, `gastos_fijos`, `gastos_diarios`, `log_eventos`, `sync_queue`) with the column set defined in `data-model.spec.md §schema-tables`, and `PRAGMA table_info(<table>)` SHALL return the expected columns for each table.

#### Scenario: column parity with remote spec

WHEN `pragma-parity.test.ts` runs, THEN for each of the 6 tables, the test SHALL assert that every column listed in `data-model.spec.md §schema-tables` is present with the matching SQLite type, and SHALL reject any drift without a follow-up OpenSpec change.

### Requirement: local-rls-facade

The local SQLite database SHALL NOT implement Row-Level Security (SQLite has no RLS). The system SHALL restrict all mutations to rows owned by the local authenticated driver through a single write facade (`services/db.service.ts`). Direct calls to `expo-sqlite` outside `db.service.ts` SHALL be forbidden by code review and SHALL trigger a CI lint warning if discovered.

#### Scenario: no raw expo-sqlite calls outside the facade

WHEN a code review inspects `data/sqlite/**` and `services/**` for `import` of `expo-sqlite`, THEN every import SHALL resolve to `db.service.ts`. Any other file importing `expo-sqlite` directly SHALL fail the review.

#### Scenario: writes go through the facade

WHEN `carreraRepo.upsertByTripId(...)` is called, THEN the write SHALL be routed through `db.service.ts` (no raw `db.run(...)` in the repository), and the bridge Subjects SHALL emit the change event in the same transaction.

### Requirement: local-upsert-trip-id

The local `carreras` table SHALL enforce `UNIQUE(driver_id, trip_id)` so that two writes for the same driver-trip upsert to a single row. The system SHALL use SQLite's `INSERT ... ON CONFLICT(driver_id, trip_id) DO UPDATE SET ...` (the local equivalent of Postgres's `ON CONFLICT` clause).

#### Scenario: idempotent upsert by trip_id

GIVEN a `carreras` row for driver-A with `trip_id = 't-001'`, WHEN `carreraRepo.upsertByTripId('driver-A', 't-001', payload)` is called a second time with the same `trip_id` and updated fields, THEN the system SHALL produce exactly ONE row (no duplicate), and the `updated_at` column SHALL refresh to the new ISO timestamp.

#### Scenario: different driver with same trip_id does not conflict

GIVEN a `carreras` row for driver-A with `trip_id = 't-001'`, WHEN `carreraRepo.upsertByTripId('driver-B', 't-001', payload)` is called, THEN the system SHALL INSERT a new row (different `driver_id`), and the row count SHALL be 2.

### Requirement: local-updated-at-js-layer

The `carreras.updated_at` column SHALL be set by JavaScript (`new Date().toISOString()`) inside `services/db.service.ts` in the same transaction as the UPDATE. The system SHALL NOT install a SQLite `BEFORE UPDATE` trigger (intentional divergence from the remote Postgres trigger — keeps the bridge visible in TypeScript and avoids divergence from `add-sync-queue`'s drain logic).

#### Scenario: updated_at refreshes on every upsert

WHEN `carreraRepo.upsertByTripId(...)` is called twice with a 1-second gap, THEN the resulting row's `updated_at` SHALL equal the second call's timestamp (ISO 8601 string), and the first timestamp SHALL NOT appear in the row.

#### Scenario: updated_at not overridable by raw payload

WHEN a write payload includes `updated_at = '2000-01-01T00:00:00.000Z'`, THEN the system SHALL overwrite it with `new Date().toISOString()` (the JS-layer helper wins).

### Requirement: local-rxjs-bridge

The local DB service SHALL expose exactly the following RxJS bridge: 4 per-table `BehaviorSubject` streams (`carreras$`, `gastos$`, `eventos$`, `syncQueue$`) plus 1 multiplexed `Subject` (`dbChange$`). The Subjects SHALL be created lazily on the first `getDb()` call and SHALL be completed on `closeDb()`. The bridge SHALL emit after every successful write inside the same transaction wrapper.

#### Scenario: carreras$ emits on upsert

WHEN `carreraRepo.upsertByTripId(...)` completes, THEN `db.service.ts`'s `carreras$` BehaviorSubject SHALL emit a new snapshot array (latest write included), and `dbChange$` SHALL emit a `DbChange { kind: 'upsert', table: 'carreras', rowId, driverId, ts }` event.

#### Scenario: Subjects complete on close

WHEN `closeDb()` is called (test teardown), THEN all 5 Subjects SHALL emit `complete`, and any subsequent `getDb()` SHALL re-create them.

#### Scenario: bridge absent before first getDb

WHEN `db.service.ts` is imported but `getDb()` has not yet been called, THEN `carreras$`, `gastos$`, `eventos$`, `syncQueue$`, and `dbChange$` SHALL be undefined (lazy lifecycle); consumers SHALL await `getDb()` before subscribing.

### Requirement: local-jsonb-via-text

Every extensible table SHALL include a `metadata TEXT NOT NULL DEFAULT '{}'` column (the local equivalent of Postgres `JSONB`). The system SHALL query JSON-shaped fields via `json_extract(metadata, '$.key')` using the `json1` extension (bundled in `expo-sqlite` ≥ SDK 47). `services/db.service.ts` SHALL expose `toJson<T>(text: string): T` and `fromJson(value: unknown): string` helpers that wrap `JSON.parse` / `JSON.stringify` with a defensive fallback to `{}`.

#### Scenario: json_extract on metadata key

GIVEN a `carreras` row with `metadata = '{"vehicle_view":"comfort"}'`, WHEN the query `SELECT json_extract(metadata, '$.vehicle_view') AS v FROM carreras WHERE id = ?` runs, THEN the result SHALL equal `'comfort'`.

#### Scenario: default value when metadata omitted

WHEN an INSERT omits the `metadata` column, THEN the system SHALL default to the literal `'{}'` string (NOT NULL).

#### Scenario: round-trip preserves shape

WHEN `db.service.ts` writes `{ source: 'uber', vehicle_view: 'comfort' }` via `fromJson` and reads it back via `toJson`, THEN the resulting object SHALL equal the input structurally (key-order may differ; values identical).

### Requirement: local-indexes

The local schema SHALL include exactly the 9 indexes listed in `data-model.spec.md §indexes`:

1. `carreras(trip_id)` UNIQUE per `driver_id` — via `UNIQUE(driver_id, trip_id)` constraint
2. `carreras(fecha)`
3. `carreras(driver_id, updated_at DESC)`
4. `gastos_fijos(driver_id)`
5. `gastos_diarios(driver_id, fecha)`
6. `log_eventos(driver_id, created_at DESC)`
7. `log_eventos(tipo)`
8. `sync_queue(driver_id, estado)`
9. `sync_queue(ultimo_intento)`

#### Scenario: nine indexes present

WHEN `pragma-parity.test.ts` queries `PRAGMA index_list(<table>)` for each of the 4 indexed tables (`carreras`, `gastos_fijos`, `gastos_diarios`, `log_eventos`, `sync_queue`), THEN the test SHALL find all 9 expected indexes and SHALL fail if any index is missing or if an unexpected extra index appears.

#### Scenario: idx_carreras_fecha accelerates history query

WHEN `carreraRepo.getCarrerasByFecha('driver-A', '2026-10-11')` runs against 5000 rows, THEN the query plan SHALL reference `idx_carreras_fecha` (`EXPLAIN QUERY PLAN` returns `USING INDEX idx_carreras_fecha`), and the query SHALL return rows in < 50ms.

### Requirement: local-test-coverage

The local SQLite layer SHALL maintain ≥80% line/function/statement/branch coverage on `data/sqlite/**` and `services/db.service.ts` + `services/carrera.repo.ts`. Coverage SHALL be measured via `bun test --coverage` against the root `bunfig.toml` thresholds.

#### Scenario: coverage gate passes

WHEN `bun test --coverage` runs from the repo root, THEN the reported coverage for `data/sqlite/**` and `services/db.service.ts` + `services/carrera.repo.ts` SHALL be ≥80% on all four metrics (lines, functions, statements, branches).

#### Scenario: coverage gate fails on uncovered branch

WHEN a new code path in `db.service.ts` is added without a corresponding test, THEN the next `bun test --coverage` run SHALL exit non-zero and the build SHALL block.

