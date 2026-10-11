/**
 * `SyncQueueService` — Phase 2 drain loop, conflict resolver, and
 * backoff scheduler. Consumes the Phase 1 RxJS bridge
 * (`openspec/specs/local-data-model/spec.md §local-rxjs-bridge`) and
 * the `SyncTransport` port (Fase 5 supplies the concrete impl).
 *
 * Behaviour reference: `openspec/changes/add-sync-queue/design.md`
 * §AD-3 (hybrid trigger), §AD-4 (backoff schedule), §AD-5 (state
 * machine), §AD-6 (auto-enqueue), §AD-7 (LWW conflict resolver).
 * Algorithm source of truth: `docs/RFC-004-sincronizacion.md §Flujo 1-6`.
 *
 * Cross-domain (AD-10): this module imports ZERO files from `ui/`,
 * top-level `tests/`, `data/`, `services/strategies/`, and never
 * imports `expo-sqlite` directly. Every mutation on `sync_queue`
 * routes through `services/db.service.ts`'s `LocalDatabase` handle
 * per `openspec/specs/local-data-model/spec.md §local-rls-facade`.
 */

import {
  BehaviorSubject,
  type Subscription,
} from 'rxjs';

import { getBridge, getDb, type BridgeAccessors, type LocalDatabase } from './db.service';
import type {
  DbChange,
  SqliteTable,
  SyncQueueRow,
} from '../data/sqlite/types';
import type { NetworkService } from './network.service';
import type {
  SyncTransport,
  SyncTransportRead,
} from './sync-queue.transport';

// ---------------------------------------------------------------------------
// Constants — backoff schedule + retry cap (design.md AD-4)
// ---------------------------------------------------------------------------

/**
 * Backoff schedule in milliseconds.
 *
 * Wait BEFORE the next drain attempt:
 *   - Attempt 1 failed → wait 1000 ms.
 *   - Attempt 2 failed → wait 2000 ms.
 *   - Attempt 3 failed → wait 4000 ms.
 *   - Attempt 4 failed → wait 8000 ms.
 *   - Attempt 5 failed → transition `fallido → pausado`. No more auto-retries.
 *
 * Exported so tests assert the exact numbers (no magic literals in
 * production code or test code).
 */
export const BACKOFF_SCHEDULE = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

/** Attempts before transitioning `fallido → pausado`. */
export const MAX_INTENTOS = 5;

/** Default polling tick interval in milliseconds (design.md AD-3). */
const DEFAULT_POLL_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Public state of the drain loop. Emitted by `syncState$` after every
 * drain. UI consumers (Fase 3, out of scope) can drive a "sincronizando"
 * indicator or surface `pausado-cap` toasts.
 *
 *   - `'idle'` — nothing in flight; last drain ended cleanly.
 *   - `'draining'` — a drain is currently in flight.
 *   - `'backoff'` — at least one row hit a transient failure during the
 *     last drain and will be retried after `BACKOFF_SCHEDULE[intentos-1]`.
 *   - `'pausado-cap'` — at least one row hit the `MAX_INTENTOS` cap
 *     during the last drain and is now `pausado` (manual retry only).
 */
export type SyncDrainState =
  | 'idle'
  | 'draining'
  | 'backoff'
  | 'pausado-cap';

/**
 * A row to push to the transport is missing a corresponding local
 * payload (e.g. a `delete` for a row that was already purged). The
 * drain loop treats this as a no-op success — the row will transition
 * to `completado` without a transport call.
 */
const DROPPED_LOCALLY = Symbol('dropped-locally');

/**
 * Minimal timer abstraction so tests can advance the clock
 * deterministically. Production is `RealClock`; tests inject a
 * `FakeClock` from `services/__tests__/sync-queue.service.test.ts`.
 */
export interface Clock {
  setTimeout(cb: () => void, ms: number): { cancel: () => void };
  setInterval(cb: () => void, ms: number): { cancel: () => void };
}

const realClock: Clock = {
  setTimeout(cb, ms) {
    const handle: { cancel: () => void } = {
      cancel: () => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
    };
    const realHandle = setTimeout(() => {
      handle.cancel = () => undefined;
      cb();
    }, ms);
    (handle as unknown as { _real: ReturnType<typeof setTimeout> })._real =
      realHandle;
    return handle;
  },
  setInterval(cb, ms) {
    const handle: { cancel: () => void } = {
      cancel: () => clearInterval(handle as unknown as ReturnType<typeof setInterval>),
    };
    const realHandle = setInterval(cb, ms);
    (handle as unknown as { _real: ReturnType<typeof setInterval> })._real =
      realHandle;
    return handle;
  },
};

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface SyncQueueServiceOptions {
  /** Transport port (production: Fase 5; tests: FakeSyncTransport). */
  transport: SyncTransport;
  /** Connectivity source (production: NetworkService; tests: FakeNetwork). */
  network: NetworkService;
  /**
   * Bridge accessors. Defaults to `getBridge()` from `db.service.ts`.
   * Tests override with a fake to keep subject emission deterministic.
   */
  bridge?: Pick<BridgeAccessors, 'dbChange$' | 'syncQueue$'>;
  /**
   * DB handle factory. Defaults to `getDb()` from `db.service.ts`.
   * Tests pass `() => getDbNamed(':memory:', factory)`.
   */
  getDb?: () => Promise<LocalDatabase>;
  /** Timer abstraction. Defaults to `realClock` (global setTimeout). */
  clock?: Clock;
  /** Polling tick interval in milliseconds. Defaults to 30_000. */
  pollIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Internal helper — refresh `syncQueue$` snapshot after every write
// ---------------------------------------------------------------------------

/**
 * Phase 1's `db.service.ts` initialises `syncQueue$` at boot but does
 * not auto-refresh on every write. The sync service mutates `sync_queue`
 * rows directly via `LocalDatabase.run`/`queryAll` (per local-rls-facade),
 * so it MUST also nudge `syncQueue$` manually. This helper keeps the
 * snapshot aligned with the table state.
 *
 * Mirrors the same SELECT Phase 1 uses in `init()`:
 *   `SELECT * FROM sync_queue WHERE estado IN
 *    ('pendiente','fallido','pausado','procesando')
 *    ORDER BY ultimo_intento DESC NULLS LAST`
 */
function refreshSyncQueueSnapshot(
  db: LocalDatabase,
  subj: BehaviorSubject<SyncQueueRow[]>,
): void {
  const snapshot = db.queryAll<SyncQueueRow>(
    `SELECT * FROM sync_queue
     WHERE estado IN ('pendiente','fallido','pausado','procesando')
     ORDER BY ultimo_intento DESC NULLS LAST`,
  );
  subj.next(snapshot);
}

// ---------------------------------------------------------------------------
// SyncQueueService class
// ---------------------------------------------------------------------------

export class SyncQueueService {
  readonly syncState$: BehaviorSubject<SyncDrainState>;

  private readonly transport: SyncTransport;
  private readonly network: NetworkService;
  private readonly bridge: Pick<BridgeAccessors, 'dbChange$' | 'syncQueue$'>;
  private readonly getDbFn: () => Promise<LocalDatabase>;
  private readonly clock: Clock;
  private readonly pollIntervalMs: number;

  private drainInFlight: Promise<void> | null = null;
  private dbChangeSub: Subscription | null = null;
  private becameOnlineSub: Subscription | null = null;
  private pollHandle: { cancel: () => void } | null = null;
  private started = false;

  constructor(opts: SyncQueueServiceOptions) {
    this.transport = opts.transport;
    this.network = opts.network;
    this.bridge = opts.bridge ?? getBridge();
    this.getDbFn = opts.getDb ?? getDb;
    this.clock = opts.clock ?? realClock;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.syncState$ = new BehaviorSubject<SyncDrainState>('idle');
  }

  /**
   * Boot the subscriptions + polling timer. Idempotent — calling twice
   * is a no-op. Production callers typically invoke this once at app
   * boot; tests invoke explicitly so they can control timing.
   */
  boot(): void {
    if (this.started) return;
    this.started = true;

    // Auto-enqueue on dbChange$ — filtered to skip sync_queue,
    // plataformas, and posicion tables (design.md AD-6).
    this.dbChangeSub = this.bridge.dbChange$.subscribe((evt) => {
      if (this.shouldSkipDbChange(evt)) return;
      // enqueue() returns a Promise; we deliberately swallow it to
      // avoid unhandled-rejection noise — errors here are local-only
      // and never escape the service.
      void this.enqueue(evt);
    });

    // Hybrid trigger #1: rising edge of connectivity (design.md AD-3).
    this.becameOnlineSub = this.network.becameOnline$.subscribe(() => {
      void this.drain();
    });

    // Hybrid trigger #2: polling tick, gated by red$ (design.md AD-3).
    this.pollHandle = this.clock.setInterval(() => {
      // The tick is a no-op while the device is offline — zero DB hits
      // while red$.value === false.
      if (this.network.red$.getValue() !== true) return;
      void this.drain();
    }, this.pollIntervalMs);
  }

  /**
   * Tear down — cancels poll interval, unsubscribes from dbChange$ +
   * becameOnline$, completes `syncState$`. Idempotent.
   */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.pollHandle?.cancel();
    this.pollHandle = null;
    this.dbChangeSub?.unsubscribe();
    this.dbChangeSub = null;
    this.becameOnlineSub?.unsubscribe();
    this.becameOnlineSub = null;
    if (!this.syncState$.isStopped) this.syncState$.complete();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Manual flush. Idempotent: if a drain is already in flight, the new
   * call returns the in-flight promise (no parallel drain). Multiple
   * consecutive calls during a long-running drain are coalesced.
   */
  async drain(): Promise<void> {
    if (this.drainInFlight) return this.drainInFlight;
    const p = this.drainImpl();
    this.drainInFlight = p;
    try {
      await p;
    } finally {
      this.drainInFlight = null;
    }
  }

  /**
   * Enqueue a row from a `dbChange$` event. Public for Fase 3 (manual
   * "force sync" button may call this directly). Idempotent on the
   * UNIQUE key `(driver_id, tabla, registro_id, operacion)`: if a row
   * with the same key is already `pendiente | fallido | pausado`,
   * refresh `ultimo_intento` and keep the original `estado`.
   */
  async enqueue(evt: DbChange): Promise<void> {
    if (this.shouldSkipDbChange(evt)) return;
    const db = await this.getDbFn();
    const ts = new Date().toISOString();

    const existing = db.queryOne<{ id: string }>(
      `SELECT id FROM sync_queue
       WHERE driver_id = ? AND tabla = ? AND registro_id = ? AND operacion = ?
         AND estado IN ('pendiente','fallido','pausado')
       LIMIT 1`,
      [evt.driverId, evt.table, evt.rowId, evt.kind],
    );

    if (existing) {
      db.run(
        `UPDATE sync_queue SET ultimo_intento = ?
         WHERE id = ? AND estado IN ('pendiente','fallido','pausado')`,
        [ts, existing.id],
      );
    } else {
      db.run(
        `INSERT INTO sync_queue
           (id, driver_id, tabla, registro_id, operacion,
            intentos, ultimo_intento, estado, metadata)
         VALUES (?, ?, ?, ?, ?, 0, NULL, 'pendiente', '{}')`,
        [crypto.randomUUID(), evt.driverId, evt.table, evt.rowId, evt.kind],
      );
    }

    refreshSyncQueueSnapshot(db, this.bridge.syncQueue$);
  }

  // -------------------------------------------------------------------------
  // Internal — drain loop
  // -------------------------------------------------------------------------

  private async drainImpl(): Promise<void> {
    this.syncState$.next('draining');
    let hitBackoff = false;
    let hitPausadoCap = false;

    try {
      const db = await this.getDbFn();

      // Crash recovery (design.md AD-5) — rows left in `procesando`
      // from a killed previous run are stale; reset them to
      // `pendiente` before processing. Always idempotent.
      db.run(
        `UPDATE sync_queue SET estado = 'pendiente', ultimo_intento = NULL
         WHERE estado = 'procesando'`,
      );

      // Pull the current batch. ORDER BY ensures deterministic test
      // behavior — rows that have never been attempted come first.
      const rows = db.queryAll<SyncQueueRow>(
        `SELECT * FROM sync_queue
         WHERE estado IN ('pendiente','fallido')
         ORDER BY (ultimo_intento IS NULL) DESC, ultimo_intento ASC, id ASC`,
      );

      for (const row of rows) {
        const result = await this.processRow(db, row);
        if (result === 'fallido') hitBackoff = true;
        if (result === 'pausado') hitPausadoCap = true;
      }

      refreshSyncQueueSnapshot(db, this.bridge.syncQueue$);
      this.syncState$.next(
        hitPausadoCap ? 'pausado-cap' : hitBackoff ? 'backoff' : 'idle',
      );
    } catch (err) {
      // Drain errors propagate to the caller (the in-flight promise
      // rejects) but we still surface `idle` so the UI resets.
      this.syncState$.next('idle');
      throw err;
    }
  }

  /**
   * Process one `sync_queue` row. Returns `'completado' | 'fallido' |
   * 'pausado'` so the caller can update `syncState$` correctly.
   *
   * Algorithm (design.md AD-5 + AD-7):
   *
   *   1. Transition row to `procesando`, stamp `ultimo_intento`.
   *   2. Fetch local payload row (if any). `delete` ops may have no
   *      row locally — that's the `DROPPED_LOCALLY` sentinel.
   *   3. `transport.read(...)` — if remote is missing, push.
   *   4. If remote is fresher than local → drop (mark `completado`
   *      with `metadata.error = 'remote-fresher'`).
   *   5. Otherwise push; if `transport.upsert` returns
   *      `conflict: 'remote-fresher'`, drop.
   *   6. On error: increment `intentos`; if `>= MAX_INTENTOS` mark
   *      `pausado`, else mark `fallido` and schedule a backoff retry.
   */
  private async processRow(
    db: LocalDatabase,
    row: SyncQueueRow,
  ): Promise<'completado' | 'fallido' | 'pausado'> {
    const now = new Date().toISOString();
    // Counter for THIS attempt. Design.md AD-4: "intentos increments
    // on every transition INTO procesando (i.e. every drain attempt)".
    // We bump here so the row's `intentos` reflects the attempt count
    // even if the process crashes mid-drain.
    const attemptCount = row.intentos + 1;

    // Mark `procesando` BEFORE the transport call so a concurrent
    // drain sees this row in the snapshot rather than re-running it.
    db.run(
      `UPDATE sync_queue SET estado = 'procesando', intentos = ?, ultimo_intento = ?
       WHERE id = ?`,
      [attemptCount, now, row.id],
    );

    try {
      // Local payload — `delete` ops may have no matching row. Tables
      // that don't carry `updated_at` (gastos_fijos, gastos_diarios)
      // fall through to a `null` localUpdatedAt.
      const localRow = row.operacion === 'delete'
        ? DROPPED_LOCALLY
        : db.queryOne<Record<string, unknown>>(
            `SELECT * FROM ${row.tabla} WHERE id = ?`,
            [row.registro_id],
          );

      const localUpdatedAt =
        localRow && typeof (localRow as Record<string, unknown>).updated_at === 'string'
          ? ((localRow as Record<string, unknown>).updated_at as string)
          : null;

      // Conflict resolver — read remote by PK.
      const remote = await this.transport.read(row.tabla as SqliteTable, row.registro_id);

      const remoteDrop =
        this.isRemoteFresher(remote, localUpdatedAt);

      if (remoteDrop) {
        return await this.markConflictDropped(db, row.id);
      }

      // Push — `delete` and other ops route through `transport.upsert`.
      if (row.operacion === 'delete') {
        await this.transport.delete(row.tabla as SqliteTable, row.registro_id);
      } else {
        // Second-line defence: `transport.upsert` may still detect a
        // concurrent remote write — handle its `conflict` return value.
        const payload =
          localRow && localRow !== DROPPED_LOCALLY
            ? localRow
            : {};
        const result = await this.transport.upsert(
          row.tabla as SqliteTable,
          row.registro_id,
          payload,
          localUpdatedAt ?? now,
        );
        if (result.conflict === 'remote-fresher') {
          return await this.markConflictDropped(db, row.id);
        }
      }

      // Success.
      db.run(
        `UPDATE sync_queue SET estado = 'completado', ultimo_intento = ? WHERE id = ?`,
        [new Date().toISOString(), row.id],
      );
      return 'completado';
    } catch (err) {
      void err; // intentionally swallowed — surfaced via state transitions
      return await this.markFailure(db, row.id, attemptCount);
    }
  }

  /**
   * Mark the row as a conflict drop — `completado` with
   * `metadata.error = 'remote-fresher'`. RFC-004 §Flujo 6 + spec
   * scenario `sync-conflict-resolver / drop cuando remoto es mas
   * reciente`.
   */
  private async markConflictDropped(
    db: LocalDatabase,
    id: string,
  ): Promise<'completado'> {
    const ts = new Date().toISOString();
    db.run(
      `UPDATE sync_queue
       SET estado = 'completado',
           ultimo_intento = ?,
           metadata = json_set(COALESCE(metadata, '{}'), '$.error', 'remote-fresher')
       WHERE id = ?`,
      [ts, id],
    );
    return 'completado';
  }

  /**
   * Mark the row as `pausado` (after `MAX_INTENTOS` cap) or `fallido`
   * (and schedule a backoff retry). Returns the new status so the
   * caller can drive `syncState$`.
   *
   * `attemptCount` is the value already written to `intentos` at the
   * start of `processRow` — we don't re-increment here.
   */
  private async markFailure(
    db: LocalDatabase,
    id: string,
    attemptCount: number,
  ): Promise<'fallido' | 'pausado'> {
    const ts = new Date().toISOString();

    if (attemptCount >= MAX_INTENTOS) {
      db.run(
        `UPDATE sync_queue SET estado = 'pausado', ultimo_intento = ? WHERE id = ?`,
        [ts, id],
      );
      return 'pausado';
    }

    db.run(
      `UPDATE sync_queue SET estado = 'fallido', ultimo_intento = ? WHERE id = ?`,
      [ts, id],
    );

    // Schedule a backoff retry. The timer merely calls `drain()`
    // which is idempotent — if a drain is already running it merges.
    const waitMs =
      BACKOFF_SCHEDULE[attemptCount - 1] ??
      BACKOFF_SCHEDULE[BACKOFF_SCHEDULE.length - 1];
    this.clock.setTimeout(() => {
      void this.drain();
    }, waitMs);

    return 'fallido';
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Tables whose writes must NEVER enter `sync_queue`:
   *
   *   - `sync_queue` itself — would create infinite re-entrance.
   *   - `plataformas` — reference data; seeds from migration 0003.
   *   - `posicion` — GPS coordinates excluded per RFC-004 §Reglas 1.
   *     `posicion$` is Fase 5 (in-memory only), but the filter is
   *     in place structurally so the day `posicion$` lands the
   *     isolation is automatic.
   */
  private shouldSkipDbChange(evt: DbChange): boolean {
    return (
      evt.table === 'sync_queue' ||
      evt.table === 'plataformas' ||
      evt.table === 'posicion'
    );
  }

  /**
   * Last-write-wins comparison (design.md AD-7). Returns `true` if
   * the remote row exists and is strictly fresher than the local
   * payload — in which case the local change should be dropped.
   *
   * Returns `false` when:
   *   - remote is `null` (no remote row) — caller pushes.
   *   - remote has no `updated_at` (degraded remote) — caller pushes.
   *   - local has no `updated_at` (e.g. gastos_fijos) — caller pushes
   *     and the `transport.upsert` second-line check takes over.
   *   - remote `updated_at <= local.updated_at`.
   */
  private isRemoteFresher(
    remote: SyncTransportRead,
    localUpdatedAt: string | null,
  ): boolean {
    if (!remote.row || !remote.updated_at) return false;
    if (!localUpdatedAt) return false;
    return remote.updated_at > localUpdatedAt;
  }
}
