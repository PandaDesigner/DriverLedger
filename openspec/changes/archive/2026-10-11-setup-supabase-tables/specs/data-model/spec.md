# Spec — data-model

## Purpose

Codify the remote Supabase schema (6 tables) as the canonical contract between the offline-first SQLite layer and the remote source-of-truth. Aligned with RFC-002 (`docs/RFC-002-modelo-datos.md`) and `docs/gherkin-modelo-datos.md`.

## ADDED Requirements

### Requirement: schema-tables

The remote schema SHALL contain exactly the following six tables: `plataformas`, `carreras`, `gastos_fijos`, `gastos_diarios`, `log_eventos`, `sync_queue`.

#### Scenario: six tablas contract

WHEN the migration `0001_init_schema.sql` is applied, THEN the system SHALL create all six tables with the columns defined in RFC-002 §Tablas, and SHALL reject any schema drift away from this shape without a new OpenSpec change.

### Requirement: carreras-upsee-by-trip-id

The `carreras` table SHALL enforce `UNIQUE(driver_id, trip_id)` so that two writes for the same driver-trip upsert to a single row.

#### Scenario: Upsert por trip_id

GIVEN a `carreras` row for driver-A with `trip_id = 't-001'`, WHEN a second write arrives for driver-A with the same `trip_id = 't-001'`, THEN the system SHALL upsert (one row per pair), and the `updated_at` trigger SHALL refresh.

### Requirement: carreras-fuente-check

The `carreras.fuente` column SHALL accept only one of `manual`, `api`, `background`. The system SHALL reject other values at the database layer via a CHECK constraint.

#### Scenario: Carrera manual en DiDi o InDrive

WHEN a driver records a DiDi or InDrive ride via one-tap confirmation, THEN the system SHALL persist `fuente = manual` and `estado = completada`.

#### Scenario: Carrera en background

WHEN a `expo-task-manager` task ends and emits a ride, THEN the system SHALL persist the ride with `fuente = background`.

### Requirement: carreras-estado-check

The `carreras.estado` column SHALL accept only one of `activa`, `completada`, `cancelada`.

#### Scenario: Carrera activa

WHEN a driver starts an Uber ride and confirms via one-tap, THEN the system SHALL persist `estado = activa`.

#### Scenario: Carrera completada

WHEN the driver manually confirms ride end, THEN the system SHALL transition `estado` from `activa` to `completada`.

#### Scenario: Carrera cancelada

WHEN the driver cancels before pickup, THEN the system SHALL transition `estado` from `activa` to `cancelada`.

### Requirement: rls-by-driver-id

For every table with a `driver_id` column (`carreras`, `gastos_fijos`, `gastos_diarios`, `log_eventos`, `sync_queue`), the system SHALL enforce Row-Level Security with policies that restrict `SELECT`, `INSERT`, `UPDATE`, and `DELETE` to rows where `driver_id = auth.uid()`.

#### Scenario: RLS isolates drivers

GIVEN two distinct authenticated sessions (driver-A and driver-B), WHEN driver-A attempts to SELECT a `carreras` row owned by driver-B, THEN the system SHALL return zero rows. WHEN driver-A attempts to INSERT a `carreras` row with `driver_id = driver-B-uuid`, THEN the system SHALL reject the insert with a CHECK violation.

### Requirement: plataformas-global-read

The `plataformas` table SHALL be globally readable for any authenticated user. The system SHALL reject `INSERT`, `UPDATE`, and `DELETE` from non-`service_role` callers (no policy for `authenticated` = deny by default).

#### Scenario: Plataforma nueva

WHEN a new platform (e.g., Rappi) is added in the future, THEN the change SHALL be a single INSERT into `plataformas`, not a schema migration.

### Requirement: sync-queue-states

The `sync_queue.estado` column SHALL accept only one of `pendiente`, `procesando`, `completado`, `fallido`, `pausado`. The `sync_queue.operacion` column SHALL accept only one of `insert`, `update`, `upsert`, `delete`.

#### Scenario: Drenado de cola

WHEN the SyncService drains `pendiente` rows, THEN the system SHALL transition each row through `procesando` → `completado` (or `fallido` → `pausado` after 5 attempts) per RFC-004 §Flujo 4.

### Requirement: indexes

The schema SHALL include the following indexes:

- `carreras(trip_id)` UNIQUE per `driver_id`
- `carreras(fecha)`
- `carreras(driver_id, updated_at DESC)`
- `gastos_fijos(driver_id)`
- `gastos_diarios(driver_id, fecha)`
- `log_eventos(driver_id, created_at DESC)`
- `log_eventos(tipo)`
- `sync_queue(driver_id, estado)`
- `sync_queue(ultimo_intento)`

#### Scenario: Carrera history pagination

WHEN the Historial screen queries `carreras` ordered by `fecha DESC`, THEN the query SHALL use `idx_carreras_fecha` and SHALL return rows for the requesting driver in < 50ms over 5000 rows.

#### Scenario: Sync queue driver scan

WHEN the SyncService scans pending rows for one driver, THEN the query SHALL use `idx_sync_queue_driver_estado` and SHALL return only that driver's rows ordered by `ultimo_intento`.

### Requirement: updated-at-trigger

The `carreras` table SHALL auto-update its `updated_at` column via a `BEFORE UPDATE` trigger. Client-set values SHALL be ignored (the trigger overrides).

#### Scenario: last-write-wins

WHEN two writes target the same `(driver_id, trip_id)` from different sessions, THEN the SyncService's last-write-wins rule (RFC-004 §Flujo 6) SHALL use the trigger-populated `updated_at` as the ordering key.

### Requirement: jsonb-metadata-extensibility

Every extensible table SHALL include a `metadata JSONB DEFAULT '{}'::jsonb` column for future schema additions without migration. The system SHALL NOT enforce CHECK constraints on the shape of `metadata` (schema-less by design).

#### Scenario: Platform-specific payload in carrera metadata

WHEN an Uber ride carries a `vehicle_view` field, THEN the system SHALL persist it as `metadata.vehicle_view` without requiring a schema migration.

#### Scenario: Future field without migration

WHEN a future platform integration adds a new optional field, THEN the system SHALL store it under `metadata` and SHALL NOT require a schema change to the table.

#### Scenario: Default value when omitted

WHEN an INSERT omits the `metadata` column, THEN the system SHALL default to `'{}'::jsonb`.

## REMOVED Requirements

None.

## MODIFIED Requirements

None.