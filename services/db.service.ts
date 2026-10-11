/**
 * Local SQLite service — singleton accessor + RxJS bridge + JSON helpers
 * + JS-layer `updated_at` automation (design.md AD-3 / AD-6 / AD-7).
 *
 * This module is the only legal write facade for the local SQLite mirror
 * (proposal `local-rls-facade`). Repositories depend on `getDb()` and the
 * bridge; they MUST NOT call `expo-sqlite` directly. The contract is
 * enforced by code review (proposal §Risks + design §AD-10).
 *
 * Backend polymorphism:
 *   - Default factory wires `expo-sqlite` (production).
 *   - Tests pass a `DatabaseFactory` (e.g. an in-memory `bun:sqlite`
 *     adapter) so the bridge logic can be exercised without the Expo
 *     native runtime. Both backends satisfy the same `LocalDatabase`
 *     interface; the rest of the service is backend-agnostic.
 */

import {
  BehaviorSubject,
  type Observable,
  Subject,
} from 'rxjs';

import { MIGRATIONS } from '../data/sqlite/migrations';
import type {
  AppliedMigrationRow,
  CarreraRow,
  DbChange,
  GastoDiarioRow,
  GastoFijoRow,
  LogEventoRow,
  Metadata,
  PlataformaRow,
  SyncQueueRow,
} from '../data/sqlite/types';

// ---------------------------------------------------------------------------
// Backend abstraction — `LocalDatabase`.
//
// `expo-sqlite`'s `SQLiteDatabase` exposes `*Sync` and `*Async` variants;
// we pin to the synchronous surface for migration + bridge simplicity and
// because `bun:sqlite` exposes only synchronous methods. Async callers
// should `await` `getDb()` once and then use the sync API.
// ---------------------------------------------------------------------------

export interface LocalDatabase {
  exec(sql: string, params?: unknown[]): void;
  run(
    sql: string,
    params?: unknown[],
  ): { rowsAffected: number; lastInsertRowId: number | bigint };
  queryAll<T>(sql: string, params?: unknown[]): T[];
  queryOne<T>(sql: string, params?: unknown[]): T | null;
  close(): void;
}

export type DatabaseFactory = (name: string) => LocalDatabase;

// ---------------------------------------------------------------------------
// Default factory — `expo-sqlite` adapter. Loaded lazily so the module can
// be imported in tests without needing the Expo native runtime. If
// `expo-sqlite` is absent (or not yet wired), the loader resolves to a
// stub `LocalDatabase`; `db.service.test.ts` never exercises this branch.
// ---------------------------------------------------------------------------

function defaultFactory(name: string): LocalDatabase {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ExpoSqlite: typeof import('expo-sqlite') = require('expo-sqlite');
  const raw = ExpoSqlite.openDatabaseSync(name);
  return {
    exec(sql, params) {
      if (params && params.length > 0) raw.execSync(sql, params as never);
      else raw.execSync(sql);
    },
    run(sql, params) {
      const result = params && params.length > 0
        ? raw.runSync(sql, params as never)
        : raw.runSync(sql);
      return { rowsAffected: result.rowsAffected, lastInsertRowId: result.lastInsertRowId };
    },
    queryAll(sql, params) {
      const rows = params && params.length > 0
        ? raw.getAllSync(sql, params as never)
        : raw.getAllSync(sql);
      return rows as never[];
    },
    queryOne(sql, params) {
      const row = params && params.length > 0
        ? raw.getFirstSync(sql, params as never)
        : raw.getFirstSync(sql);
      return (row ?? null) as T | null;
    },
    close() {
      raw.closeSync();
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton state — null until first `getDb()`.
// ---------------------------------------------------------------------------

interface DbState {
  db: LocalDatabase;
  factory: DatabaseFactory;
  carreras: BehaviorSubject<CarreraRow[]>;
  gastos: BehaviorSubject<GastoResumenRow[]>;
  eventos: BehaviorSubject<LogEventoRow[]>;
  syncQueue: BehaviorSubject<SyncQueueRow[]>;
  dbChange: Subject<DbChange>;
}

let state: DbState | null = null;
let statePromise: Promise<DbState> | null = null;

// ---------------------------------------------------------------------------
// Accessors — Subjects are undefined before `getDb()` resolves.
// ---------------------------------------------------------------------------

export interface BridgeAccessors {
  readonly carreras$: BehaviorSubject<CarreraRow[]>;
  readonly gastos$: BehaviorSubject<GastoResumenRow[]>;
  readonly eventos$: BehaviorSubject<LogEventoRow[]>;
  readonly syncQueue$: BehaviorSubject<SyncQueueRow[]>;
  readonly dbChange$: Subject<DbChange>;
}

export function getBridge(): BridgeAccessors {
  assertReady();
  return {
    carreras$: state!.carreras,
    gastos$: state!.gastos,
    eventos$: state!.eventos,
    syncQueue$: state!.syncQueue,
    dbChange$: state!.dbChange,
  };
}

export function carreras$(): Observable<CarreraRow[]> {
  return getBridge().carreras$;
}

export function gastos$(): Observable<GastoResumenRow[]> {
  return getBridge().gastos$;
}

export function eventos$(): Observable<LogEventoRow[]> {
  return getBridge().eventos$;
}

export function syncQueue$(): Observable<SyncQueueRow[]> {
  return getBridge().syncQueue$;
}

export function dbChange$(): Observable<DbChange> {
  return getBridge().dbChange$;
}

// ---------------------------------------------------------------------------
// `getDb()` — lazy singleton. Always returns the same handle.
// Tests may pass a factory; subsequent calls without a factory return the
// cached handle (the test owns the lifecycle via `closeDb()`).
// ---------------------------------------------------------------------------

export async function getDb(factory?: DatabaseFactory): Promise<LocalDatabase> {
  if (state) return state.db;
  if (!statePromise) {
    statePromise = init(factory ?? defaultFactory, 'driverledger.db');
  }
  await statePromise;
  return state!.db;
}

export async function getDbNamed(
  name: string,
  factory?: DatabaseFactory,
): Promise<LocalDatabase> {
  if (state) return state.db;
  if (!statePromise) {
    statePromise = init(factory ?? defaultFactory, name);
  }
  await statePromise;
  return state!.db;
}

// ---------------------------------------------------------------------------
// `closeDb()` — test teardown. Resets singleton + completes subjects.
// ---------------------------------------------------------------------------

export async function closeDb(): Promise<void> {
  if (!state) return;
  const subjects = [
    state.carreras,
    state.gastos,
    state.eventos,
    state.syncQueue,
  ];
  state.dbChange.complete();
  for (const subject of subjects) subject.complete();
  try {
    state.db.close();
  } catch {
    // closing twice is harmless; ignore.
  }
  state = null;
  statePromise = null;
}

// ---------------------------------------------------------------------------
// Initialisation — applies migrations + bridges + base snapshots.
// ---------------------------------------------------------------------------

async function init(
  factory: DatabaseFactory,
  name: string = 'driverledger.db',
): Promise<DbState> {
  const db = factory(name);

  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  for (const migration of MIGRATIONS) {
    const already = db.queryOne<Pick<AppliedMigrationRow, 'name'>>(
      'SELECT name FROM schema_migrations WHERE name = ?',
      [migration.name],
    );
    if (already) continue;

    db.exec('BEGIN;');
    try {
      db.exec(migration.sql);
      migration.postApply?.({
        execSync: (sql: string) => db.exec(sql),
        getAllSync: <T>(sql: string, params?: unknown[]) =>
          db.queryAll<T>(sql, params),
      });
      db.run(
        'INSERT INTO schema_migrations (name) VALUES (?);',
        [migration.name],
      );
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  const carreras = new BehaviorSubject<CarreraRow[]>(
    db.queryAll<CarreraRow>('SELECT * FROM carreras ORDER BY updated_at DESC'),
  );
  const gastos = new BehaviorSubject<GastoResumenRow[]>(
    loadGastosSnapshot(db),
  );
  const eventos = new BehaviorSubject<LogEventoRow[]>(
    db.queryAll<LogEventoRow>(
      'SELECT * FROM log_eventos ORDER BY created_at DESC LIMIT 200',
    ),
  );
  const syncQueue = new BehaviorSubject<SyncQueueRow[]>(
    db.queryAll<SyncQueueRow>(
      `SELECT * FROM sync_queue WHERE estado IN ('pendiente','fallido','pausado','procesando')
       ORDER BY ultimo_intento DESC NULLS LAST`,
    ),
  );
  const dbChange = new Subject<DbChange>();

  state = { db, factory, carreras, gastos, eventos, syncQueue, dbChange };
  return state;
}

function loadGastosSnapshot(db: LocalDatabase): GastoResumenRow[] {
  const fijos = db.queryAll<GastoFijoRow>('SELECT * FROM gastos_fijos');
  const diarios = db.queryAll<GastoDiarioRow>(
    'SELECT * FROM gastos_diarios ORDER BY fecha DESC',
  );
  return [
    ...fijos.map<GastoResumenRow>((row) => ({ kind: 'fijo', row })),
    ...diarios.map<GastoResumenRow>((row) => ({ kind: 'diario', row })),
  ];
}

// ---------------------------------------------------------------------------
// `updated_at` helper (AD-6) — JS-layer, in the same transaction wrapper as
// the caller. Inserts carry the DB default; updates are enriched with the
// current ISO timestamp. Tables without `updated_at` are no-ops via the
// `TUpdated` generic (caller omits the column from the payload type).
// ---------------------------------------------------------------------------

export function withUpdatedAt<T>(row: T): T & { updated_at: string } {
  return { ...row, updated_at: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// JSON helpers (AD-4) — defensive fallback to `{}` so legacy rows that
// pre-date the metadata-everywhere rule never throw on read.
// ---------------------------------------------------------------------------

export function fromJson(value: unknown): string {
  try {
    if (value === null || value === undefined) return '{}';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

export function toJson<T = Metadata>(text: string | null | undefined, fallback: T = {} as T): T {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function metadataGet<T = Metadata>(column: string, key: string): T | null {
  assertReady();
  const rows = state!.db.queryAll<{ value: string }>(
    `SELECT json_extract(metadata, '$.${key}') AS value FROM ${
      column.split('.')[0]
    } LIMIT 1`,
  );
  if (rows.length === 0) return null;
  const value = rows[0].value;
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

export function metadataSet(value: unknown): string {
  return fromJson(value);
}

// ---------------------------------------------------------------------------
// Internal helper — lazy-state assertions.
// ---------------------------------------------------------------------------

interface GastoResumenRow {
  kind: 'fijo' | 'diario';
  row: GastoFijoRow | GastoDiarioRow;
}

function assertReady(): asserts state is DbState {
  if (!state) {
    throw new Error(
      '[db.service] getDb() must be awaited before accessing the bridge. ' +
        'Lazy subjects are undefined until first init per local-rxjs-bridge spec.',
    );
  }
}
