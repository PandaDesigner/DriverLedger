/**
 * Embedded SQLite migrations — see design.md AD-2.
 *
 * Migration order:
 *   0001_init_schema        — 6 CREATE TABLE statements + CHECKs + UNIQUE.
 *   0002_indexes            — 9 indexes from `data-model.spec.md §indexes`.
 *   0003_metadata_columns   — idempotent safety net. SQL is a no-op
 *                             (`SELECT 1`); the `postApply` callback
 *                             inspects `pragma_table_info` for any table
 *                             missing `metadata` and issues ALTER TABLE
 *                             ADD COLUMN defensively.
 *
 * `db.service.ts` runs them in order on first `getDb()`, recording applied
 * migrations in `schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`.
 *
 * Source of truth: `docs/RFC-002-modelo-datos.md` (column shapes),
 * `data/migrations/0001_init_schema.sql` (remote Postgres schema mirrored).
 */

import { SQLITE_TABLES, type SqliteDatabaseRunner } from './types';

export interface Migration {
  name: string;
  order: number;
  sql: string;
  /**
   * Optional post-SQL hook. Receives the same `expo-sqlite` handle used by
   * `db.service.ts` (or any compatible runner — see `SqliteDatabaseRunner`).
   * Useful for safety-net migrations whose work cannot be expressed as a
   * single portable SQL statement.
   */
  postApply?: (db: SqliteDatabaseRunner) => void;
}

// ---------------------------------------------------------------------------
// 0001 — schema (CREATE TABLE × 6 + CHECKs + UNIQUE(driver_id, trip_id) on
// carreras). Per locked decision: every extensible table (including
// `gastos_fijos` and `log_eventos`) carries `metadata TEXT NOT NULL DEFAULT
// '{}'`. `log_eventos.payload` (RFC-002) is renamed to `metadata` to match
// spec.md; RFC-002 update is deferred.
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS plataformas (
  id              TEXT    PRIMARY KEY,
  nombre          TEXT    NOT NULL UNIQUE,
  comision        REAL    NOT NULL CHECK (comision >= 0 AND comision <= 100),
  tipo_estrategia TEXT    NOT NULL,
  metadata        TEXT    NOT NULL DEFAULT '{}',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carreras (
  id            TEXT    PRIMARY KEY,
  driver_id     TEXT    NOT NULL,
  trip_id       TEXT    NOT NULL,
  plataforma_id TEXT    NOT NULL REFERENCES plataformas(id),
  tarifa_bruta  REAL    NOT NULL,
  comision      REAL    NOT NULL,
  gasolina      REAL    NOT NULL DEFAULT 0,
  origen        TEXT,
  destino       TEXT,
  distancia_km  REAL,
  duracion_min  INTEGER,
  estado        TEXT    NOT NULL CHECK (estado IN ('activa','completada','cancelada')),
  fuente        TEXT    NOT NULL CHECK (fuente IN ('manual','api','background')),
  fecha         TEXT    NOT NULL DEFAULT (date('now')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  metadata      TEXT    NOT NULL DEFAULT '{}',
  UNIQUE(driver_id, trip_id)
);

CREATE TABLE IF NOT EXISTS gastos_fijos (
  id            TEXT    PRIMARY KEY,
  driver_id     TEXT    NOT NULL,
  nombre        TEXT    NOT NULL,
  monto_mensual REAL    NOT NULL,
  activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  metadata      TEXT    NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS gastos_diarios (
  id        TEXT    PRIMARY KEY,
  driver_id TEXT    NOT NULL,
  fecha     TEXT    NOT NULL,
  categoria TEXT    NOT NULL,
  monto     REAL    NOT NULL,
  metadata  TEXT    NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS log_eventos (
  id         TEXT    PRIMARY KEY,
  driver_id  TEXT    NOT NULL,
  tipo       TEXT    NOT NULL,
  metadata   TEXT    NOT NULL DEFAULT '{}',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id             TEXT    PRIMARY KEY,
  driver_id      TEXT    NOT NULL,
  tabla          TEXT    NOT NULL,
  registro_id    TEXT    NOT NULL,
  operacion      TEXT    NOT NULL CHECK (operacion IN ('insert','update','upsert','delete')),
  intentos       INTEGER NOT NULL DEFAULT 0,
  ultimo_intento TEXT,
  estado         TEXT    NOT NULL CHECK (estado IN ('pendiente','procesando','completado','fallido','pausado')),
  metadata       TEXT    NOT NULL DEFAULT '{}'
);
`;

// ---------------------------------------------------------------------------
// 0002 — indexes (the 9 from `data-model.spec.md §indexes`)
// ---------------------------------------------------------------------------
// (1) `carreras(trip_id)` UNIQUE per `driver_id` is realised via the
//     `UNIQUE(driver_id, trip_id)` table constraint declared in 0001; SQLite
//     creates an auto-index named `sqlite_autoindex_carreras_1`. The
//     remaining 8 indexes are declared explicitly below.

const INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_carreras_fecha
  ON carreras (fecha);

CREATE INDEX IF NOT EXISTS idx_carreras_driver_updated
  ON carreras (driver_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_gastos_fijos_driver
  ON gastos_fijos (driver_id);

CREATE INDEX IF NOT EXISTS idx_gastos_diarios_driver_fecha
  ON gastos_diarios (driver_id, fecha);

CREATE INDEX IF NOT EXISTS idx_log_eventos_driver_created
  ON log_eventos (driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_log_eventos_tipo
  ON log_eventos (tipo);

CREATE INDEX IF NOT EXISTS idx_sync_queue_driver_estado
  ON sync_queue (driver_id, estado);

CREATE INDEX IF NOT EXISTS idx_sync_queue_ultimo_intento
  ON sync_queue (ultimo_intento);
`;

// ---------------------------------------------------------------------------
// 0003 — idempotent metadata safety net
// ---------------------------------------------------------------------------
// On a freshly-initialised DB this migration's SQL is a no-op (0001 already
// adds `metadata` to all 6 tables) and `postApply` finds nothing to fix. On
// a legacy DB that landed before the metadata-everywhere rule, the callback
// issues ALTER TABLE ADD COLUMN for any table missing the column.
//
// We use a TS callback rather than `ADD COLUMN IF NOT EXISTS` because some
// SQLite builds (including `expo-sqlite` versions before SDK 51) do not
// recognise that syntax. Cross-version safety over syntax sugar.

const METADATA_SAFETY_NET_SQL = `-- 0003: see migrations.ts#ensureMetadataColumns`;

/** Detect tables missing `metadata` and ALTER TABLE ADD COLUMN them. */
function ensureMetadataColumns(db: SqliteDatabaseRunner): void {
  for (const table of SQLITE_TABLES) {
    const cols = db.getAllSync<{ name: string }>(
      `PRAGMA table_info(${table})`,
    );
    if (cols.some((row) => row.name === 'metadata')) continue;

    db.execSync(`ALTER TABLE ${table} ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';`);
  }

  db.execSync('SELECT 1;'); // anchor the migration so it records as applied
}

// ---------------------------------------------------------------------------
// Ordered, exported migration array
// ---------------------------------------------------------------------------

export const MIGRATIONS: ReadonlyArray<Migration> = [
  { name: '0001_init_schema', order: 1, sql: SCHEMA_SQL },
  { name: '0002_indexes', order: 2, sql: INDEXES_SQL },
  {
    name: '0003_metadata_columns',
    order: 3,
    sql: METADATA_SAFETY_NET_SQL,
    postApply: ensureMetadataColumns,
  },
];
