/**
 * SQLite row types — mirror of `openspec/specs/data-model/spec.md` §schema-tables
 * adapted to SQLite storage (AD-1 in design.md).
 *
 * SQLite stores: uuid -> TEXT, numeric(p,s) -> REAL, integer -> INTEGER,
 * boolean -> INTEGER (0|1), text -> TEXT, date -> TEXT (ISO YYYY-MM-DD),
 * timestamptz -> TEXT (ISO 8601 UTC), JSONB -> TEXT (default '{}').
 *
 * Per locked decision: `metadata` column wins over `payload` (spec.md)
 * for every extensible table (including gastos_fijos and log_eventos).
 * RFC-002 update is deferred to a doc follow-up.
 */

/**
 * JSONB-equivalent value carried by `metadata` columns. Stored as TEXT
 * (default `'{}'`); queried via `json_extract(metadata, '$.key')` using the
 * `json1` extension bundled in `expo-sqlite`.
 */
export type Metadata = unknown;

/**
 * Names of the six local tables. Used as the `table` discriminator on
 * `DbChange` and as the canonical set validated by `pragma-parity.test.ts`.
 */
export const SQLITE_TABLES = [
  'plataformas',
  'carreras',
  'gastos_fijos',
  'gastos_diarios',
  'log_eventos',
  'sync_queue',
] as const;

export type SqliteTable = (typeof SQLITE_TABLES)[number];

/**
 * Indexed tables per `data-model` spec §indexes. Only these four carry
 * explicit indexes; `plataformas` is a small reference table.
 */
export const SQLITE_INDEXED_TABLES = [
  'carreras',
  'gastos_fijos',
  'gastos_diarios',
  'log_eventos',
  'sync_queue',
] as const;

export type IndexedTable = (typeof SQLITE_INDEXED_TABLES)[number];

// ---------------------------------------------------------------------------
// Row types — column order mirrors `data/migrations/0001_init_schema.sql`.
// ---------------------------------------------------------------------------

export type CarreraEstado = 'activa' | 'completada' | 'cancelada';
export type CarreraFuente = 'manual' | 'api' | 'background';
export type SyncOperacion = 'insert' | 'update' | 'upsert' | 'delete';
export type SyncEstado = 'pendiente' | 'procesando' | 'completado' | 'fallido' | 'pausado';

/**
 * `plataformas` — open-closed reference data. New platform (e.g. Rappi) =
 * INSERT, no schema migration (RFC-002 §Open-closed).
 */
export interface PlataformaRow {
  id: string;
  nombre: string;
  comision: number; // numeric(5,2) -> REAL
  tipo_estrategia: string;
  metadata: Metadata;
  created_at: string; // ISO 8601 UTC (datetime('now'))
}

/**
 * `carreras` — driver trip log. Upsert by `(driver_id, trip_id)`.
 * `fecha` is ISO `YYYY-MM-DD` (driver-local date, see AD-5).
 * `updated_at` is set JS-side on UPDATE (see AD-6).
 */
export interface CarreraRow {
  id: string;
  driver_id: string;
  trip_id: string;
  plataforma_id: string;
  tarifa_bruta: number; // numeric(12,2)
  comision: number; // numeric(12,2)
  gasolina: number; // numeric(12,2)
  origen: string | null;
  destino: string | null;
  distancia_km: number | null; // numeric(8,2)
  duracion_min: number | null;
  estado: CarreraEstado;
  fuente: CarreraFuente;
  fecha: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
  metadata: Metadata;
}

/**
 * `gastos_fijos` — recurring monthly expenses per driver.
 * `metadata` included per spec.md even though RFC-002 omits it (locked
 * decision: `gastos_fijos.metadata` mirrors the bridge contract).
 */
export interface GastoFijoRow {
  id: string;
  driver_id: string;
  nombre: string;
  monto_mensual: number; // numeric(12,2)
  activo: 0 | 1; // boolean -> INTEGER 0|1
  metadata: Metadata;
}

/**
 * `gastos_diarios` — driver-scoped day-level variable expenses.
 */
export interface GastoDiarioRow {
  id: string;
  driver_id: string;
  fecha: string; // YYYY-MM-DD
  categoria: string;
  monto: number; // numeric(12,2)
  metadata: Metadata;
}

/**
 * `log_eventos` — append-only event log per driver. `payload` (RFC-002) is
 * renamed to `metadata` per locked decision. JSONB via TEXT (AD-4).
 */
export interface LogEventoRow {
  id: string;
  driver_id: string;
  tipo: string; // dot-namespaced event type, e.g. 'carrera.registered'
  metadata: Metadata;
  created_at: string;
}

/**
 * `sync_queue` — local-first write queue drained by Phase 2's SyncService.
 * `ultimo_intento` is TEXT ISO timestamp (nullable; managed by sync loop).
 */
export interface SyncQueueRow {
  id: string;
  driver_id: string;
  tabla: string;
  registro_id: string;
  operacion: SyncOperacion;
  intentos: number;
  ultimo_intento: string | null;
  estado: SyncEstado;
  metadata: Metadata;
}

/**
 * Multiplexed change event emitted by `dbChange$` after every successful
 * write inside the same transaction wrapper (AD-7).
 */
export interface DbChange {
  kind: 'insert' | 'update' | 'upsert' | 'delete';
  table: SqliteTable;
  rowId: string;
  driverId: string;
  ts: string; // ISO 8601 UTC, JS-layer timestamp
}

/**
 * Migration bookkeeping row from `schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`.
 */
export interface AppliedMigrationRow {
  name: string;
  applied_at: string;
}

/**
 * Minimal SQL runner exposed to `Migration.postApply` hooks. Matches the
 * shape of `expo-sqlite`'s `SQLiteDatabase` for the operations migrations
 * actually need (`getAllSync`, `execSync`). Bun's `bun:sqlite` is shape-
 * compatible in tests.
 */
export interface SqliteDatabaseRunner {
  getAllSync<T>(sql: string, params?: unknown[]): T[];
  execSync(sql: string): void;
}
