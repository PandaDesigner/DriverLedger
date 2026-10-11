/**
 * `sync-queue.service.test.ts` — colocated suite covering all 8
 * requirements from `openspec/changes/add-sync-queue/specs/sync-queue/spec.md`.
 *
 * Wired against an in-memory `bun:sqlite` backend (mirroring
 * `db.service.test.ts`). The transport is `FakeSyncTransport`; the
 * network is `FakeNetwork`; the clock is `FakeClock` so backoff
 * timing is deterministic.
 *
 * Source of truth for the algorithm under test:
 *   - `openspec/changes/add-sync-queue/design.md` §AD-3..AD-7
 *   - `docs/RFC-004-sincronizacion.md` §Flujo 1-6
 *   - `openspec/specs/data-model/spec.md` §sync-queue-states
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';
import { Database } from 'bun:sqlite';
import { firstValueFrom, take } from 'rxjs';

import {
  closeDb,
  getDb,
  getDbNamed,
  type LocalDatabase,
} from '../db.service';
import type { DbChange, SyncQueueRow } from '../../data/sqlite/types';

import {
  BACKOFF_SCHEDULE,
  MAX_INTENTOS,
  SyncQueueService,
  type Clock,
  type SyncDrainState,
} from '../sync-queue.service';
import type {
  SyncConflict,
  SyncTransport,
  SyncTransportRead,
} from '../sync-queue.transport';
import {
  NetworkService,
  type NetworkSource,
} from '../network.service';

// ---------------------------------------------------------------------------
// bun:sqlite adapter — in-memory SQLite with the LocalDatabase shape.
// Mirrors the factory in `db.service.test.ts`.
// ---------------------------------------------------------------------------

function bunSqliteFactory(_name: string): LocalDatabase {
  void _name;
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');

  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params = []) {
      const stmt = db.query(sql);
      const result = stmt.run(...(params as never[]));
      return { rowsAffected: result.changes, lastInsertRowId: result.lastInsertRowid };
    },
    queryAll(sql, params = []) {
      return db
        .query(sql)
        .all(...(params as never[])) as unknown[];
    },
    queryOne(sql, params = []) {
      const row = db
        .query(sql)
        .get(...(params as never[])) as unknown;
      return row ?? null;
    },
    close() {
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// FakeClock — manual `setTimeout` + `setInterval` with explicit `advance(ms)`.
// ---------------------------------------------------------------------------

type Timer = { at: number; cb: () => void; cancelled: boolean; id: number };

class FakeClock implements Clock {
  private current = 0;
  private nextId = 1;
  private timers: Timer[] = [];

  now(): number {
    return this.current;
  }

  pending(): number {
    return this.timers.filter((t) => !t.cancelled).length;
  }

  setTimeout(cb: () => void, ms: number): { cancel: () => void } {
    const id = this.nextId++;
    const timer: Timer = {
      at: this.current + ms,
      cb,
      cancelled: false,
      id,
    };
    this.timers.push(timer);
    return {
      cancel: () => {
        timer.cancelled = true;
      },
    };
  }

  setInterval(cb: () => void, ms: number): { cancel: () => void } {
    // For tests we model the interval as a chained series of timers so
    // `advance(ms)` deterministically fires each tick in order.
    let cancelled = false;
    let handle: { cancel: () => void } | null = null;
    const fire = () => {
      if (cancelled) return;
      try {
        cb();
      } finally {
        if (!cancelled) {
          handle = this.setTimeout(fire, ms);
        }
      }
    };
    handle = this.setTimeout(fire, ms);
    return {
      cancel: () => {
        cancelled = true;
        handle?.cancel();
      },
    };
  }

  /**
   * Advance the clock by `ms` and fire every due timer (in order).
   * Returns when no more timers are due within the new window.
   */
  advance(ms: number): void {
    const target = this.current + ms;
    while (true) {
      const due = this.timers
        .filter((t) => !t.cancelled && t.at <= target)
        .sort((a, b) => (a.at - b.at) || (a.id - b.id))[0];
      if (!due) break;
      this.current = due.at;
      this.timers = this.timers.filter((t) => t.id !== due.id);
      due.cb();
    }
    this.current = target;
  }
}

// ---------------------------------------------------------------------------
// FakeNetwork — mirror of expo-network for tests.
// ---------------------------------------------------------------------------

class FakeNetwork implements NetworkSource {
  private online = false;
  private listeners: Array<(online: boolean) => void> = [];

  isOnline(): boolean {
    return this.online;
  }

  subscribe(cb: (online: boolean) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  setOnline(value: boolean): void {
    if (this.online === value) return;
    this.online = value;
    for (const l of this.listeners) l(value);
  }
}

// ---------------------------------------------------------------------------
// FakeSyncTransport — in-memory table store + a `upsert` call recorder + a
// `read` programmable per-table. Lets tests assert exact call counts and
// drive the conflict resolver path.
// ---------------------------------------------------------------------------

interface RemoteRow {
  row: Record<string, unknown>;
  updated_at: string;
}

class FakeSyncTransport implements SyncTransport {
  store = new Map<string, Map<string, RemoteRow>>();
  upsertCalls: Array<{
    table: string;
    pk: string;
    payload: Record<string, unknown> | null;
    localUpdatedAt: string;
  }> = [];
  deleteCalls: Array<{ table: string; pk: string }> = [];
  readCalls: Array<{ table: string; pk: string }> = [];

  /** Programmable behaviour — make the next `upsert` return a conflict. */
  nextConflict: SyncConflict = 'none';
  nextRemoteUpdatedAt: string | undefined = undefined;

  /** Pre-populate a remote row in the store. */
  seed(
    table: string,
    pk: string,
    row: Record<string, unknown>,
    updated_at: string,
  ): void {
    let bucket = this.store.get(table);
    if (!bucket) {
      bucket = new Map();
      this.store.set(table, bucket);
    }
    bucket.set(pk, { row, updated_at });
  }

  /** Configure the next upsert call to return a conflict. */
  setNextConflict(
    conflict: SyncConflict,
    remoteUpdatedAt?: string,
  ): void {
    this.nextConflict = conflict;
    this.nextRemoteUpdatedAt = remoteUpdatedAt;
  }

  /** Make every upsert throw — for the backoff tests. */
  failEveryUpsert = false;

  async read<T = unknown>(
    table: string,
    pk: string,
  ): Promise<SyncTransportRead<T>> {
    this.readCalls.push({ table, pk });
    const bucket = this.store.get(table);
    const found = bucket?.get(pk);
    if (!found) {
      return { row: null, updated_at: null };
    }
    return {
      row: found.row as unknown as T,
      updated_at: found.updated_at,
    };
  }

  async upsert<T = unknown>(
    table: string,
    pk: string,
    payload: T,
    localUpdatedAt: string,
  ): Promise<{ conflict: SyncConflict; remoteUpdatedAt?: string }> {
    this.upsertCalls.push({
      table,
      pk,
      payload: payload as Record<string, unknown>,
      localUpdatedAt,
    });

    if (this.failEveryUpsert) {
      throw new Error('transport: boom');
    }

    if (this.nextConflict !== 'none') {
      const conflict = this.nextConflict;
      const remoteUpdatedAt = this.nextRemoteUpdatedAt;
      this.nextConflict = 'none';
      this.nextRemoteUpdatedAt = undefined;
      return { conflict, remoteUpdatedAt };
    }

    // Persist into the store as if remote accepted the write.
    let bucket = this.store.get(table);
    if (!bucket) {
      bucket = new Map();
      this.store.set(table, bucket);
    }
    bucket.set(pk, {
      row: payload as unknown as Record<string, unknown>,
      updated_at: localUpdatedAt,
    });
    return { conflict: 'none' };
  }

  async delete(table: string, pk: string): Promise<void> {
    this.deleteCalls.push({ table, pk });
    this.store.get(table)?.delete(pk);
  }
}

// ---------------------------------------------------------------------------
// Test harness — wires a SyncQueueService against a real `LocalDatabase`
// (in-memory), `FakeSyncTransport`, `FakeNetwork`, `FakeClock`. Returns
// helpers so each test can drive the system without re-initialising.
// ---------------------------------------------------------------------------

interface Harness {
  service: SyncQueueService;
  transport: FakeSyncTransport;
  network: FakeNetwork;
  clock: FakeClock;
  bridge: {
    dbChange$: import('rxjs').Subject<DbChange>;
    syncQueue$: import('rxjs').BehaviorSubject<SyncQueueRow[]>;
  };
  db: LocalDatabase;
  emitChange: (overrides: Partial<DbChange>) => void;
  waitForIdle: () => Promise<void>;
}

async function bootHarness(): Promise<Harness> {
  const db = await getDbNamed(':memory:', bunSqliteFactory);
  // Re-export to obtain the bridge (so this test never assumes Phase 1
  // bridge internals).
  const { getBridge } = await import('../db.service');
  const bridge = getBridge();

  const transport = new FakeSyncTransport();
  const net = new FakeNetwork();
  net.setOnline(true);
  const network = new NetworkService(net);
  const clock = new FakeClock();

  const service = new SyncQueueService({
    transport,
    network,
    bridge,
    getDb: () => Promise.resolve(db),
    clock,
    pollIntervalMs: 30_000,
  });
  service.boot();

  return {
    service,
    transport,
    network: net,
    clock,
    bridge: bridge as Harness['bridge'],
    db,
    emitChange(overrides) {
      const evt: DbChange = {
        kind: 'upsert',
        table: 'carreras',
        rowId: 'r-1',
        driverId: 'driver-A',
        ts: new Date().toISOString(),
        ...overrides,
      };
      bridge.dbChange$.next(evt);
    },
    async waitForIdle() {
      // Each emission on dbChange$ triggers enqueue() which is async.
      // Pinning on syncState$ ensures we wait until at least the
      // resulting microtasks are flushed.
      await firstValueFrom(service.syncState$.pipe(take(1)));
      await flushMicrotasks(20);
    },
  };
}

/**
 * Flush up to `n` microtask hops. Useful when the test triggers work
 * through `void this.drain()` (fire-and-forget from a timer) and the
 * assertion must observe the resulting state. Real `setTimeout`-based
 * waits are avoided because the FakeClock doesn't advance real time.
 */
async function flushMicrotasks(n: number = 20): Promise<void> {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
}

/**
 * Poll a predicate until it holds, flushing microtasks between polls.
 * Used to wait for "the drain started by this timer has finished
 * writing to the DB", where the number of microtask hops is dynamic.
 */
async function waitFor(
  predicate: () => boolean,
  maxIterations: number = 50,
): Promise<void> {
  for (let i = 0; i < maxIterations; i++) {
    if (predicate()) return;
    await flushMicrotasks(5);
  }
  throw new Error('waitFor: predicate never became true within budget');
}

// ---------------------------------------------------------------------------
// Setup / teardown — fresh in-memory DB per test, plus a seed plataforma
// (FK target for `carreras`) and one carrera row for payload-shaped tests.
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await closeDb();
  await getDbNamed(':memory:', bunSqliteFactory);
  const db = await getDb();
  db.run(
    `INSERT INTO plataformas (id, nombre, comision, tipo_estrategia)
     VALUES ('p-uber', 'Uber', 25.0, 'uber_api')`,
  );
});

afterEach(async () => {
  await closeDb();
});

async function seedCarrera(
  db: LocalDatabase,
  id: string,
  updated_at: string,
): Promise<void> {
  db.run(
    `INSERT INTO carreras (
       id, driver_id, trip_id, plataforma_id, tarifa_bruta, comision,
       gasolina, origen, destino, distancia_km, duracion_min,
       estado, fuente, fecha, created_at, updated_at, metadata
     ) VALUES (
       ?, 'driver-A', 't-1', 'p-uber', 100, 20,
       0, NULL, NULL, NULL, NULL,
       'activa', 'manual', '2026-10-11', ?, ?, '{}'
     )`,
    [id, updated_at, updated_at],
  );
}

// ---------------------------------------------------------------------------
// (a) Enqueue — basic path + UNIQUE dedup
// ---------------------------------------------------------------------------

describe('SyncQueueService — enqueue()', () => {
  it('inserts a row in `pendiente` with intentos = 0', async () => {
    const h = await bootHarness();

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();

    const rows = h.db.queryAll<SyncQueueRow>(
      `SELECT * FROM sync_queue WHERE tabla = 'carreras'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].estado).toBe('pendiente');
    expect(rows[0].intentos).toBe(0);
    expect(rows[0].ultimo_intento).toBeNull();
    expect(rows[0].operacion).toBe('upsert');

    h.service.stop();
  });

  it('is idempotent on (driver_id, tabla, registro_id, operacion) — second call refreshes ultimo_intento and stays pendiente', async () => {
    const h = await bootHarness();

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();

    const before = h.db.queryAll<SyncQueueRow>(`SELECT * FROM sync_queue`);
    expect(before.length).toBe(1);
    const initialTs = before[0].ultimo_intento;

    // Sleep at least 5 ms so the JS-side timestamp would change.
    await new Promise((r) => setTimeout(r, 10));

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();

    const after = h.db.queryAll<SyncQueueRow>(`SELECT * FROM sync_queue`);
    expect(after.length).toBe(1);
    expect(after[0].estado).toBe('pendiente');
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].ultimo_intento).not.toBe(initialTs);
    expect(new Date(after[0].ultimo_intento ?? 0).getTime()).toBeGreaterThan(
      new Date(initialTs ?? 0).getTime(),
    );

    h.service.stop();
  });
});

// ---------------------------------------------------------------------------
// (b) Drain — success path + remote-fresher drop + remote-equal push
// ---------------------------------------------------------------------------

describe('SyncQueueService — drain() success path', () => {
  it('transitions pendiente → procesando → completado on a successful upsert', async () => {
    const h = await bootHarness();
    await seedCarrera(h.db, 'r-1', '2026-10-11T10:00:00.000Z');

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();

    // Remote store is empty — local push wins.
    await h.service.drain();

    const row = h.db.queryOne<SyncQueueRow>(
      `SELECT * FROM sync_queue WHERE registro_id = 'r-1'`,
    );
    expect(row?.estado).toBe('completado');
    // First successful attempt → intentos = 1 (per design.md AD-4:
    // increments on every transition INTO procesando).
    expect(row?.intentos).toBe(1);
    expect(row?.ultimo_intento).not.toBeNull();

    expect(h.transport.upsertCalls.length).toBe(1);
    expect(h.transport.upsertCalls[0].table).toBe('carreras');
    expect(h.transport.upsertCalls[0].pk).toBe('r-1');

    h.service.stop();
  });

  it('emits syncState$ = idle after a clean drain', async () => {
    const h = await bootHarness();
    await seedCarrera(h.db, 'r-1', '2026-10-11T10:00:00.000Z');

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();

    const states: SyncDrainState[] = [];
    const sub = h.service.syncState$.subscribe((s) => states.push(s));
    await h.service.drain();
    sub.unsubscribe();

    // `draining` then `idle`. Tests are order-sensitive for ordering but
    // tolerant of duplicate values.
    expect(states).toContain('draining');
    expect(states[states.length - 1]).toBe('idle');
    h.service.stop();
  });
});

describe('SyncQueueService — conflict resolver (LWW at enqueue time)', () => {
  it('drops local change when remote.updated_at > local.updated_at (no upsert call)', async () => {
    const h = await bootHarness();
    await seedCarrera(h.db, 'r-1', '2026-10-11T10:00:00.000Z');
    h.transport.seed(
      'carreras',
      'r-1',
      { id: 'r-1', tarifa_bruta: 999 },
      '2026-10-11T11:00:00.000Z', // fresher than local
    );

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();
    await h.service.drain();

    const row = h.db.queryOne<SyncQueueRow>(
      `SELECT * FROM sync_queue WHERE registro_id = 'r-1'`,
    );
    expect(row?.estado).toBe('completado');
    expect(h.transport.upsertCalls.length).toBe(0);

    // Spec scenario `sync-conflict-resolver / drop cuando remoto es mas reciente`
    // requires a log_eventos row with tipo='sync.conflict' on every drop.
    const logRow = h.db.queryOne<{
      tipo: string;
      driver_id: string;
      metadata: string;
    }>(
      `SELECT tipo, driver_id, metadata FROM log_eventos WHERE tipo = 'sync.conflict'`,
    );
    expect(logRow).not.toBeNull();
    expect(logRow?.tipo).toBe('sync.conflict');
    const logMeta = JSON.parse((logRow?.metadata ?? '{}') as string) as {
      sync_queue_id?: string;
    };
    expect(logMeta.sync_queue_id).toBe(row?.id);

    h.service.stop();
  });

  it('pushes when remote.updated_at < local.updated_at', async () => {
    const h = await bootHarness();
    await seedCarrera(h.db, 'r-1', '2026-10-11T12:00:00.000Z');
    h.transport.seed(
      'carreras',
      'r-1',
      { id: 'r-1' },
      '2026-10-11T11:00:00.000Z', // older than local
    );

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();
    await h.service.drain();

    expect(h.transport.upsertCalls.length).toBe(1);
    const row = h.db.queryOne<SyncQueueRow>(
      `SELECT * FROM sync_queue WHERE registro_id = 'r-1'`,
    );
    expect(row?.estado).toBe('completado');
    h.service.stop();
  });

  it('pushes when remote.updated_at === local.updated_at', async () => {
    const h = await bootHarness();
    const ts = '2026-10-11T10:00:00.000Z';
    await seedCarrera(h.db, 'r-1', ts);
    h.transport.seed('carreras', 'r-1', { id: 'r-1' }, ts);

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();
    await h.service.drain();

    expect(h.transport.upsertCalls.length).toBe(1);
    h.service.stop();
  });

  it('handles the second-line defence: transport.upsert returns conflict → drop', async () => {
    const h = await bootHarness();
    await seedCarrera(h.db, 'r-1', '2026-10-11T10:00:00.000Z');
    h.transport.setNextConflict(
      'remote-fresher',
      '2026-10-11T11:00:00.000Z',
    );

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();
    await h.service.drain();

    // Read-pre-check said remote was missing so it tried to push.
    // Upsert returned conflict → row dropped without retries.
    expect(h.transport.upsertCalls.length).toBe(1);
    const row = h.db.queryOne<SyncQueueRow>(
      `SELECT * FROM sync_queue WHERE registro_id = 'r-1'`,
    );
    expect(row?.estado).toBe('completado');
    h.service.stop();
  });
});

// ---------------------------------------------------------------------------
// (c) Backoff schedule + 5-attempt cap
// ---------------------------------------------------------------------------

describe('SyncQueueService — backoff schedule + retry cap', () => {
  it('follows BACKOFF_SCHEDULE = [1000, 2000, 4000, 8000, 16000] and increments intentos', async () => {
    const h = await bootHarness();
    await seedCarrera(h.db, 'r-1', '2026-10-11T10:00:00.000Z');
    h.transport.failEveryUpsert = true;

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();

    const attempts = () =>
      h.db.queryOne<SyncQueueRow>('SELECT * FROM sync_queue')?.intentos ?? 0;
    const estado = () =>
      h.db.queryOne<SyncQueueRow>('SELECT * FROM sync_queue')?.estado ?? null;

    // Attempt 1 — fail.
    await h.service.drain();
    expect(attempts()).toBe(1);

    // Advance 1000ms → scheduled retry fires attempt 2.
    h.clock.advance(BACKOFF_SCHEDULE[0]);
    await waitFor(() => attempts() === 2);
    expect(attempts()).toBe(2);

    // Advance 2000ms → attempt 3.
    h.clock.advance(BACKOFF_SCHEDULE[1]);
    await waitFor(() => attempts() === 3);
    expect(attempts()).toBe(3);

    // Advance 4000ms → attempt 4.
    h.clock.advance(BACKOFF_SCHEDULE[2]);
    await waitFor(() => attempts() === 4);
    expect(attempts()).toBe(4);

    // Advance 8000ms → attempt 5 (cap → pausado).
    h.clock.advance(BACKOFF_SCHEDULE[3]);
    await waitFor(() => attempts() === MAX_INTENTOS);
    expect(estado()).toBe('pausado');
    expect(attempts()).toBe(MAX_INTENTOS);

    h.service.stop();
  });

  it('emits syncState$ = pausado-cap when the cap is hit', async () => {
    const h = await bootHarness();
    await seedCarrera(h.db, 'r-1', '2026-10-11T10:00:00.000Z');
    h.transport.failEveryUpsert = true;

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();

    const intentos = () =>
      h.db.queryOne<SyncQueueRow>('SELECT * FROM sync_queue')?.intentos ?? 0;
    const estadoActual = () =>
      h.db.queryOne<SyncQueueRow>('SELECT * FROM sync_queue')?.estado ?? null;

    // First attempt — fail; increments to 1, schedules retry at +1000ms.
    await h.service.drain();
    expect(intentos()).toBe(1);

    // Attempts 2-5 are driven by the backoff timer scheduled inside
    // each markFailure. We just advance the clock and wait for the
    // drain to settle. The 5th attempt marks the row `pausado`.
    for (let i = 1; i < MAX_INTENTOS; i++) {
      h.clock.advance(BACKOFF_SCHEDULE[i - 1]);
      await waitFor(() => intentos() === i + 1);
    }

    await flushMicrotasks(20);
    expect(intentos()).toBe(MAX_INTENTOS);
    expect(estadoActual()).toBe('pausado');
    expect(h.service.syncState$.getValue()).toBe('pausado-cap');

    h.service.stop();
  });
});

// ---------------------------------------------------------------------------
// (d) Hybrid trigger — becameOnline$ + 30s polling tick
// ---------------------------------------------------------------------------

describe('SyncQueueService — hybrid trigger', () => {
  it('drain fires on becameOnline$ when transitioning offline → online', async () => {
    const h = await bootHarness();
    h.network.setOnline(false);
    await seedCarrera(h.db, 'r-1', '2026-10-11T10:00:00.000Z');

    // Reset transport call counters — service.boot() caused an initial
    // upsert as part of any background writes; we re-baseline here.
    h.transport.upsertCalls.length = 0;

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();

    // Going online triggers a drain that should push the row.
    h.network.setOnline(true);

    // The becameOnline$ emission is synchronous; `void this.drain()` is
    // async so microtasks must settle.
    await waitFor(() => h.transport.upsertCalls.length === 1);
    expect(h.transport.upsertCalls.length).toBe(1);
    h.service.stop();
  });

  it('drain fires on the 30s polling tick when online', async () => {
    const h = await bootHarness();
    h.network.setOnline(true);
    await seedCarrera(h.db, 'r-1', '2026-10-11T10:00:00.000Z');

    h.transport.upsertCalls.length = 0;
    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();

    // First poll at +30_000ms — the chained interval fires the next at
    // +60_000ms. We advance 30_000ms exactly so the first tick hits.
    h.clock.advance(30_000);
    await waitFor(() => h.transport.upsertCalls.length === 1);
    expect(h.transport.upsertCalls.length).toBe(1);
    h.service.stop();
  });

  it('polling tick is a no-op while offline (zero upsert calls)', async () => {
    const h = await bootHarness();
    h.network.setOnline(false);
    await seedCarrera(h.db, 'r-1', '2026-10-11T10:00:00.000Z');

    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();

    // Advance well past 30s — the tick should fire but the offline
    // check skips the drain.
    h.clock.advance(60_000);
    // Give the tick time to fire and confirm no upsert happened.
    await flushMicrotasks(40);
    expect(h.transport.upsertCalls.length).toBe(0);
    h.service.stop();
  });
});

// ---------------------------------------------------------------------------
// (e) Drain idempotency + crash recovery
// ---------------------------------------------------------------------------

describe('SyncQueueService — drain() in-flight coalescing + crash recovery', () => {
  it('two simultaneous drain() calls produce one in-flight transport call', async () => {
    const h = await bootHarness();
    await seedCarrera(h.db, 'r-1', '2026-10-11T10:00:00.000Z');
    h.emitChange({ table: 'carreras', rowId: 'r-1', kind: 'upsert' });
    await h.waitForIdle();

    // Slow next transport call so drain doesn't finish too early.
    const slow = h.transport.upsert.bind(h.transport);
    h.transport.upsert = async (...args: Parameters<typeof slow>) => {
      await new Promise((r) => setTimeout(r, 20));
      return slow(...args);
    };

    const a = h.service.drain();
    const b = h.service.drain();
    // The two callers share the in-flight drain promise. Async function
    // wrappers may add an outer promise layer; the stronger assertion
    // is that the transport only sees ONE upsert call.
    expect(a).toBeInstanceOf(Promise);
    expect(b).toBeInstanceOf(Promise);
    await Promise.all([a, b]);
    expect(h.transport.upsertCalls.length).toBe(1);

    h.service.stop();
  });

  it('resets procesando rows to pendiente before draining (crash recovery)', async () => {
    const h = await bootHarness();
    await seedCarrera(h.db, 'r-1', '2026-10-11T10:00:00.000Z');

    // Pre-insert a stale `procesando` row.
    h.db.run(
      `INSERT INTO sync_queue
        (id, driver_id, tabla, registro_id, operacion,
         intentos, ultimo_intento, estado, metadata)
       VALUES ('q-stale', 'driver-A', 'carreras', 'r-1', 'upsert',
               2, ?, 'procesando', '{}')`,
      [new Date().toISOString()],
    );

    await h.service.drain();

    const row = h.db.queryOne<SyncQueueRow>(
      `SELECT * FROM sync_queue WHERE id = 'q-stale'`,
    );
    // After recovery + a successful drain, the row must be completado.
    expect(row?.estado).toBe('completado');
    h.service.stop();
  });
});

// ---------------------------------------------------------------------------
// (f) Defensive filters — sync_queue / plataformas / posicion
// ---------------------------------------------------------------------------

describe('SyncQueueService — defensive filters on dbChange$', () => {
  it('posicion events NEVER enter sync_queue (GPS isolation)', async () => {
    const h = await bootHarness();
    h.emitChange({ table: 'posicion', rowId: 'p-1', kind: 'upsert' });
    await h.waitForIdle();

    const count = (
      h.db.queryAll<{ c: number }>(
        `SELECT COUNT(*) AS c FROM sync_queue WHERE tabla = 'posicion'`,
      )[0] ?? { c: 0 }
    ).c;
    expect(count).toBe(0);

    const all = h.db.queryAll<{ c: number }>(
      `SELECT COUNT(*) AS c FROM sync_queue`,
    );
    expect((all[0] ?? { c: 0 }).c).toBe(0);

    h.service.stop();
  });

  it('plataformas events NEVER enter sync_queue (reference data)', async () => {
    const h = await bootHarness();
    h.emitChange({ table: 'plataformas', rowId: 'p-new', kind: 'insert' });
    await h.waitForIdle();

    const count = (
      h.db.queryAll<{ c: number }>(
        `SELECT COUNT(*) AS c FROM sync_queue WHERE tabla = 'plataformas'`,
      )[0] ?? { c: 0 }
    ).c;
    expect(count).toBe(0);
    h.service.stop();
  });

  it('sync_queue events NEVER re-enter sync_queue (no infinite loop)', async () => {
    const h = await bootHarness();

    // Emit a self-referential event — should be filtered out.
    h.emitChange({ table: 'sync_queue', rowId: 'q-1', kind: 'update' });
    await h.waitForIdle();

    const count = (
      h.db.queryAll<{ c: number }>(
        `SELECT COUNT(*) AS c FROM sync_queue`,
      )[0] ?? { c: 0 }
    ).c;
    expect(count).toBe(0);
    h.service.stop();
  });
});

// ---------------------------------------------------------------------------
// (g) Constant export sanity check
// ---------------------------------------------------------------------------

describe('SyncQueueService — constants are exposed', () => {
  it('BACKOFF_SCHEDULE matches the spec exactly', () => {
    expect(BACKOFF_SCHEDULE).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('MAX_INTENTOS matches the spec exactly', () => {
    expect(MAX_INTENTOS).toBe(5);
  });
});
