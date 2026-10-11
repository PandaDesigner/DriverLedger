/**
 * Carrera repository — concrete example of the repository pattern over
 * `services/db.service.ts`. Demonstrates:
 *
 *   - `upsertByTripId(...)` — idempotent INSERT ON CONFLICT
 *     (UNIQUE(driver_id, trip_id)). Matches design.md AD-8.
 *   - `deleteByTripId(...)` — companion to upsert (Discard ride flow).
 *   - `getCarrerasByFecha(...)` — uses `idx_carreras_fecha`.
 *   - `listPlataformas(...)` — reference data for Phase 4 strategies.
 *
 * All writes go through `db.service.ts`; the connection handle never leaks.
 * `updated_at` is set via `withUpdatedAt` (AD-6) so callers can't override
 * the timestamp even by including it in the payload.
 *
 * Subject emissions:
 *   - `carreras$` carries the new snapshot after each successful write.
 *   - `dbChange$` carries the multiplexed `{ kind, table, rowId, driverId, ts }` event.
 */

import type {
  CarreraRow,
  PlataformaRow,
} from '../data/sqlite/types';

import {
  fromJson,
  getBridge,
  getDb,
  withUpdatedAt,
} from './db.service';

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface CarreraPayload {
  /** If omitted, the repository derives a deterministic id from (driverId, tripId). */
  id?: string;
  plataforma_id: string;
  tarifa_bruta: number;
  comision: number;
  gasolina?: number;
  origen?: string | null;
  destino?: string | null;
  distancia_km?: number | null;
  duracion_min?: number | null;
  estado?: CarreraRow['estado'];
  fuente?: CarreraRow['fuente'];
  /** YYYY-MM-DD; defaults to date('now') (Postgres `current_date` parity). */
  fecha?: string | null;
  metadata?: unknown;
}

/**
 * `upsertByTripId` — idempotent write per `(driver_id, trip_id)`. Two
 * calls with the same key produce ONE row; the second refreshes every
 * mutable column AND the `updated_at` ISO timestamp.
 *
 * Steps:
 *   1. `withUpdatedAt` stamps the JS-layer timestamp on the write payload.
 *   2. INSERT … ON CONFLICT runs as a single statement (no separate tx
 *      wrap needed because the migration runner already runs in a tx).
 *   3. The post-write SELECT repopulates the affected row.
 *   4. `carreras$` is refreshed (full snapshot) and `dbChange$` emits.
 */
export async function upsertByTripId(
  driverId: string,
  tripId: string,
  payload: CarreraPayload,
): Promise<CarreraRow> {
  const db = await getDb();
  const id = payload.id ?? deriveId(driverId, tripId);
  const ts = new Date().toISOString();

  // Stamp `updated_at` defensively — even if caller supplied it in the
  // payload, the JS-layer helper wins (see AD-6 + `local-updated-at-js-layer`).
  withUpdatedAt({ id });

  const sql = `
    INSERT INTO carreras (
      id, driver_id, trip_id, plataforma_id, tarifa_bruta, comision,
      gasolina, origen, destino, distancia_km, duracion_min,
      estado, fuente, fecha, created_at, updated_at, metadata
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(driver_id, trip_id) DO UPDATE SET
      plataforma_id = excluded.plataforma_id,
      tarifa_bruta  = excluded.tarifa_bruta,
      comision      = excluded.comision,
      gasolina      = excluded.gasolina,
      origen        = excluded.origen,
      destino       = excluded.destino,
      distancia_km  = excluded.distancia_km,
      duracion_min  = excluded.duracion_min,
      estado        = excluded.estado,
      fuente        = excluded.fuente,
      fecha         = excluded.fecha,
      updated_at    = excluded.updated_at,
      metadata      = excluded.metadata
  `;

  const params = [
    id,
    driverId,
    tripId,
    payload.plataforma_id,
    payload.tarifa_bruta,
    payload.comision,
    payload.gasolina ?? 0,
    payload.origen ?? null,
    payload.destino ?? null,
    payload.distancia_km ?? null,
    payload.duracion_min ?? null,
    payload.estado ?? 'activa',
    payload.fuente ?? 'manual',
    payload.fecha ?? null,
    ts, // created_at (insert-only via INSERT-ON-CONFLICT preserves existing value)
    ts, // updated_at
    fromJson(payload.metadata ?? {}),
  ];

  db.run(sql, params);

  const row = db.queryOne<CarreraRow>(
    'SELECT * FROM carreras WHERE driver_id = ? AND trip_id = ?',
    [driverId, tripId],
  );
  if (!row) {
    throw new Error(
      `[carrera.repo] upsertByTripId: row missing after write (driver=${driverId}, trip=${tripId})`,
    );
  }

  emitAfterWrite('upsert', driverId, row, db);
  return row;
}

/**
 * `deleteByTripId` — companion to `upsertByTripId` for "Discard ride"
 * UI flow. Emits `kind: 'delete'` on `dbChange$`.
 */
export async function deleteByTripId(
  driverId: string,
  tripId: string,
): Promise<boolean> {
  const db = await getDb();
  const before = db.queryOne<CarreraRow>(
    'SELECT * FROM carreras WHERE driver_id = ? AND trip_id = ?',
    [driverId, tripId],
  );
  if (!before) return false;

  db.run('DELETE FROM carreras WHERE driver_id = ? AND trip_id = ?', [
    driverId,
    tripId,
  ]);

  emitAfterWrite('delete', driverId, before, db);
  return true;
}

/**
 * `getCarrerasByFecha` — uses `idx_carreras_fecha` to fetch the day's trip
 * list for one driver (ordered newest-first by `updated_at`).
 */
export async function getCarrerasByFecha(
  driverId: string,
  fecha: string,
): Promise<CarreraRow[]> {
  const db = await getDb();
  return db.queryAll<CarreraRow>(
    `SELECT * FROM carreras
     WHERE driver_id = ? AND fecha = ?
     ORDER BY updated_at DESC`,
    [driverId, fecha],
  );
}

/**
 * `listPlataformas` — reference data for Strategy resolution (Phase 4).
 * Returns the 3 seeded rows plus any user-added platform. Strategies
 * should cache the result; calling here is cheap.
 */
export async function listPlataformas(): Promise<PlataformaRow[]> {
  const db = await getDb();
  return db.queryAll<PlataformaRow>(
    'SELECT * FROM plataformas ORDER BY nombre ASC',
  );
}

/**
 * `listByDriver` — convenience read for Phase 4 strategies (current
 * CarreraService contract). Ordered by `updated_at DESC`.
 */
export async function listByDriver(driverId: string): Promise<CarreraRow[]> {
  const db = await getDb();
  return db.queryAll<CarreraRow>(
    `SELECT * FROM carreras
     WHERE driver_id = ?
     ORDER BY updated_at DESC`,
    [driverId],
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Refresh `carreras$` after a write and emit a `dbChange$` event. The DB
 * parameter is passed in so tests can inject a backend that doesn't match
 * the production singleton; production callers always reuse the singleton
 * from `getBridge()`.
 */
function emitAfterWrite(
  kind: 'insert' | 'update' | 'upsert' | 'delete',
  driverId: string,
  row: CarreraRow,
  db: import('./db.service').LocalDatabase,
): void {
  const bridge = getBridge();
  const refreshed = db.queryAll<CarreraRow>(
    'SELECT * FROM carreras ORDER BY updated_at DESC',
  );
  bridge.carreras$.next(refreshed);
  bridge.dbChange.next({
    kind,
    table: 'carreras',
    rowId: row.id,
    driverId,
    ts: new Date().toISOString(),
  });
}

/**
 * Derive a 32-hex-char id from `(driverId, tripId)` so repeated upserts
 * with the same key target the same row even when the caller doesn't
 * supply an `id`. This mirrors how deterministic seeding works.
 */
function deriveId(driverId: string, tripId: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  const seed = `${driverId}::${tripId}`;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 ^ c) >>> 0;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const a = h1.toString(16).padStart(8, '0');
  const b = h2.toString(16).padStart(8, '0');
  const c = h1.toString(16).padStart(8, '0');
  const d = h2.toString(16).padStart(8, '0');
  return `${a}${b}${c}${d}`;
}
