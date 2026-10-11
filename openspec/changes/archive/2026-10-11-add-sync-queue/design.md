# Design — add-sync-queue

> Source of truth: `docs/RFC-004-sincronizacion.md` (the canonical algorithm), `docs/PRD-consolidado.md §5 + §8` (Phase 2 scope), `openspec/specs/data-model/spec.md §sync-queue-states` (state machine), `openspec/specs/local-data-model/spec.md §local-rls-facade + §local-rxjs-bridge` (Phase 1 bridge AD-7), and the locked decisions in `architecture/phase-2-decisions` (#1926).

## 1. Architectural decisions

### AD-1 File layout (services-only, AD-10 reasserted)

```
services/
├── db.service.ts                              # FROZEN — Phase 1; consumed read-only.
├── carrera.repo.ts                            # FROZEN — Phase 1; consumed read-only.
├── sync-queue.transport.ts                    # NEW — port interface + types only.
├── sync-queue.service.ts                      # NEW — drain loop, conflict resolver, backoff scheduler.
├── network.service.ts                         # NEW — red$ + becameOnline$.
└── __tests__/
    ├── db.service.test.ts                     # FROZEN — Phase 1.
    ├── sync-queue.service.test.ts             # NEW — colocated; FakeSyncTransport + FakeClock.
    └── network.service.test.ts                # NEW — colocated.
```

OpenSpec change folder:

```
openspec/changes/add-sync-queue/
├── proposal.md
├── design.md                                  # this file
├── tasks.md
└── specs/
    └── sync-queue/
        └── spec.md                            # NEW capability spec delta (8 ADDED requirements)
```

Cross-domain enforcement: `git diff develop --stat` MUST NOT include `^ui/` or `^tests/` paths. Reasserted from `local-data-model-sqlite design.md AD-10`. Phase 2 does not modify `db.service.ts` or `carrera.repo.ts` — they are consumed read-only via the existing exports.

### AD-2 Port interface — `SyncTransport`

`services/sync-queue.transport.ts` declares the **port only**. The concrete Supabase implementation is a Fase 5 deliverable; tests use `FakeSyncTransport`.

```typescript
export type SyncConflict = 'none' | 'remote-fresher';

export interface SyncTransportRead<T> {
  row: T | null;
  updated_at: string | null;
}

export interface SyncTransport {
  /** Fetch one row from the remote table by primary key. Returns null if absent. */
  read<T = unknown>(table: SqliteTable, pk: string): Promise<SyncTransportRead<T>>;
  /**
   * Apply a local mutation. Returns `conflict: 'remote-fresher'` when the
   * remote has a strictly newer `updated_at` than the local payload (the
   * caller's last-write-wins pre-check should normally catch this — the
   * return value is the belt-and-suspenders second-line defence).
   */
  upsert<T = unknown>(table: SqliteTable, pk: string, payload: T, localUpdatedAt: string): Promise<{ conflict: SyncConflict; remoteUpdatedAt?: string }>;
  /** Delete one row from the remote table by primary key. */
  delete(table: SqliteTable, pk: string): Promise<void>;
}
```

Why a port instead of a direct Supabase import: (a) keeps `services/` testable without network, (b) postpones the Supabase dep coupling to Fase 5 when OAuth + RLS-bypass secrets land together, (c) makes the conflict-resolver algorithm backend-agnostic — the same code path runs against Supabase today, against a fake backend in `bun:test`, and against any future replication target.

### AD-3 Hybrid trigger (event + poll)

`services/sync-queue.service.ts` boots two timers:

1. **Event edge** — subscribe to `network.becameOnline$`. On each emission, call `drain()` immediately. This catches the most common case: the device reconnects after a long offline session and we want to flush within milliseconds, not 30s later.
2. **Poll fallback** — `setInterval(30_000)` ticks. Each tick checks `network.red$.value`; if `false` the tick is a no-op (zero DB hits). If `true`, call `drain()`. This recovers from: app kill mid-backoff, lost event during process restart, very slow reconnect transitions, and any `pendiente` rows that arrived without a corresponding `becameOnline$` event.

`drain()` is idempotent: if a drain is already running, the new request no-ops. The implementation uses a single in-flight `Promise<void> | null` slot.

Tests inject a `FakeClock` (controls `setInterval` / `setTimeout`) and a `FakeNetwork` (toggles `red$` on demand). The hybrid trigger is exercised by:

- Test A — start offline, enqueue 1 row, go online (`FakeNetwork.setOnline(true)` triggers `becameOnline$`), assert drain happens within 1 tick.
- Test B — stay online, enqueue 1 row, advance the `FakeClock` 30s, assert drain happens on the tick.
- Test C — stay offline, advance the clock 60s, assert NO drain happens (tick is a no-op while offline).

Why not push-only (`dbChange$` subscription): duplicates de-dup logic, costs battery on micro-bursts, and misses rows after restart. Why not event-only: misses pending rows after kill. Why not pull-only: stale rows during long offline, latency on the first reconnect. Hybrid wins on all four failure modes.

### AD-4 Backoff schedule (single source of truth)

```typescript
export const BACKOFF_SCHEDULE = [1_000, 2_000, 4_000, 8_000, 16_000] as const;
export const MAX_INTENTOS = 5; // attempts before transitioning to 'pausado'
```

`BACKOFF_SCHEDULE[intentos - 1]` ms is the wait BEFORE the next drain attempt:

- Attempt 1 fails → wait 1000 ms.
- Attempt 2 fails → wait 2000 ms.
- Attempt 3 fails → wait 4000 ms.
- Attempt 4 fails → wait 8000 ms.
- Attempt 5 fails → transition `fallido → pausado`. **No more auto-retries.**

`intentos` increments on every transition INTO `procesando` (i.e. every drain attempt). `ultimo_intento` is refreshed JS-side via `new Date().toISOString()` in the same write (mirrors the Phase 1 `withUpdatedAt` pattern).

The schedule is exported so tests can assert the exact numbers (no magic literals). The cap of 5 is constant — any change requires a spec change.

Timer persistence across app kill is **OUT of scope** for Phase 2. A row that is `fallido` when the process is killed has no live timer after restart; the 30s polling tick picks it up on the next online window if `intentos < 5`. After 5 attempts the row is `pausado`; manual retry only.

### AD-5 State machine — `(estado, intentos) → accion`

| Current state | `intentos` | Action on drain | Next state |
|---------------|------------|-----------------|------------|
| `pendiente`   | 0          | Apply via transport. On success → `completado`. On error → `fallido`, `intentos = 1`. | `completado` \| `fallido` |
| `fallido`     | 1..4       | Wait `BACKOFF_SCHEDULE[intentos - 1]` ms. Re-apply. On success → `completado`. On error → `fallido`, `intentos += 1`. | `completado` \| `fallido` |
| `fallido`     | ≥ 5        | Transition → `pausado`. No auto-retry. | `pausado` |
| `procesando`  | any        | Crash recovery — see `pausado` snapshot reset below. | `pendiente` |
| `completado`  | any        | No-op. | `completado` |
| `pausado`     | any        | No auto-retry. Only manual `drain()` (if forced) or admin `clearStuckQueued()` moves it back. | unchanged |

Crash recovery: rows left in `procesando` after a process kill are stale (the drain promise died mid-flight). On boot, `sync-queue.service.ts` runs a single recovery query: `UPDATE sync_queue SET estado = 'pendiente', ultimo_intento = NULL WHERE estado = 'procesando'`. This is the same query that runs as the first action of `drain()` so a recovery happens implicitly on the first trigger after restart.

All state transitions route through `db.service.ts`. The service NEVER calls `expo-sqlite` directly — this is `local-rls-facade` enforced at code review (per `local-data-model.spec.md §local-rls-facade`).

### AD-6 Enqueue algorithm — auto-subscribe to `dbChange$`

```typescript
// services/sync-queue.service.ts (sketch)
const SUB = dbChange$.subscribe((evt) => {
  // Defensive filters — these tables must NEVER enqueue.
  if (
    evt.table === 'sync_queue' ||  // would create infinite loop
    evt.table === 'plataformas' || // reference data; seeds come from migration 0003
    evt.table === 'posicion'       // GPS excluded per RFC-004 §Reglas
  ) return;

  enqueue(evt);
});

export async function enqueue(evt: DbChange): Promise<void> {
  const db = await getDb();
  // UNIQUE check at enqueue time — drops duplicates within the same drain window.
  const existing = db.queryOne<SyncQueueRow>(
    `SELECT id FROM sync_queue
     WHERE driver_id = ? AND tabla = ? AND registro_id = ? AND operacion = ?
       AND estado IN ('pendiente','fallido','pausado')`,
    [evt.driverId, evt.table, evt.rowId, evt.kind],
  );
  if (existing) {
    // Refresh ultimo_intento and keep the original estado; no new row.
    db.run(
      `UPDATE sync_queue SET ultimo_intento = ?
       WHERE id = ? AND estado IN ('pendiente','fallido','pausado')`,
      [new Date().toISOString(), existing.id],
    );
    return;
  }
  db.run(
    `INSERT INTO sync_queue (id, driver_id, tabla, registro_id, operacion, intentos, ultimo_intento, estado, metadata)
     VALUES (?, ?, ?, ?, ?, 0, NULL, 'pendiente', '{}')`,
    [uuid(), evt.driverId, evt.table, evt.rowId, evt.kind],
  );
  // Emit on syncQueue$ via the standard refresh path inside db.service.ts.
}
```

Key properties:

- **Single write path**: every row that enters `sync_queue` does so through this `enqueue()` function — including any future caller (Fase 3 may surface a "force sync" button that calls `enqueue` for a manual retry).
- **No re-entrant enqueue**: `dbChange$` events with `table === 'sync_queue'` are filtered out. The sync service's own mutations never feed back into the queue.
- **GPS isolation is structural, not policy**: even if a future `posicion$` Subject leaks, the `table !== 'posicion'` filter is the second line of defence (RFC-004 §Reglas 1). The first line is that `posicion$` is in-memory only (Fase 5) and has no DB write path.
- **De-dup is per `(driver_id, tabla, registro_id, operacion)`**: same row + same operation = single queue entry. The `operacion` dimension means an `insert` and a subsequent `update` for the same row are both queued (correct: Supabase needs both writes for last-write-wins to converge).

### AD-7 Conflict resolver — last-write-wins at enqueue time

For each `pendiente` row, the drain loop runs the following:

```
1. SELECT the local payload row by (tabla, registro_id).
2. transport.read(tabla, registro_id) → fetch remote current row.
3. If remote is null → push via transport.upsert/delete. Mark completado.
4. If remote.updated_at > local.updated_at → DROP local change.
   Mark sync_queue.estado = 'completado' with metadata.error = 'remote-fresher'.
   Log tipo = 'sync.conflict' in log_eventos (Fase 3 surfaces).
5. Else (local fresher or equal) → push via transport.upsert/delete.
   Mark sync_queue.estado = 'completado'.
```

Why at enqueue time vs drain time: enqueue-time checks happen once per row insertion, drain-time would re-read remote on every retry. Enqueue-time trades precision (the remote may be fresher by the time we actually push) for fewer network round-trips. The `transport.upsert` return value carries `conflict: 'remote-fresher'` as the second-line defence in case a remote write lands between the enqueue check and the push.

The conflict window between enqueue check and transport push is logged via `log_eventos(tipo = 'sync.conflict')` so Fase 7 can audit it.

### AD-8 NetworkService — `red$` + `becameOnline$`

```typescript
// services/network.service.ts (sketch)
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export class NetworkService {
  readonly red$ = new BehaviorSubject<boolean>(true);
  readonly becameOnline$ = new Subject<void>();
  private prevOnline: boolean = true;

  /** Inject the connectivity source. Production uses expo-network; tests use a FakeNetwork. */
  constructor(private readonly source: { isOnline(): boolean; subscribe(cb: (online: boolean) => void): () => void }) {
    this.prevOnline = source.isOnline();
    this.red$.next(this.prevOnline);
    source.subscribe((online) => {
      const rising = online && !this.prevOnline;
      this.prevOnline = online;
      this.red$.next(online);
      if (rising) this.becameOnline$.next();
    });
  }
}
```

`becameOnline$` is the **rising edge** — it fires only when the device transitions from offline to online. Disconnects (online → offline) emit on `red$` but NOT on `becameOnline$`. This is the trigger the hybrid model uses to fire immediate flushes.

Production wires `expo-network`'s `addNetworkStateListener`; tests use a `FakeNetwork` that exposes `setOnline(value: boolean)` and routes through the same listener contract.

`NetworkService` is **bundled** in Phase 2 (per Q4). Fase 5 Background GPS reuses `red$` to gate TaskManager activation. Forward-only: any cross-phase consumer treats `red$` as a read-only Observable.

### AD-9 Test strategy

- **Sync service tests** (`sync-queue.service.test.ts`):
  - `FakeSyncTransport` — in-memory map per table; tests set up rows + `updated_at` values to drive the conflict path.
  - `FakeClock` — wraps `setTimeout` / `setInterval`; `advance(ms)` advances the clock deterministically and flushes any due timers.
  - `FakeNetwork` — toggles `red$` and emits `becameOnline$` on demand.
  - Tests cover: drain success on `apply`, drop on `remote-fresher`, backoff schedule (1s/2s/4s/8s/16s), 5-intent cap → `pausado`, hybrid trigger (event + tick), GPS isolation (insert fake `dbChange$` event with `table = 'posicion'`, assert nothing enters `sync_queue`).
- **NetworkService tests** (`network.service.test.ts`):
  - `red$` reports online/offline based on the source.
  - `becameOnline$` fires only on the rising edge (online → offline transition is silent on `becameOnline$`).
- **Coverage target**: ≥ 80% on `services/sync-queue.service.ts` per the Phase 1 `local-test-coverage` precedent. The threshold lives in root `bunfig.toml` (Phase 1's existing config; Phase 2 inherits). If `bunfig.toml` does not include `services/sync-queue.service.ts` in its coverage scope, Phase 2's `sdd-apply` will extend it.
- **Cross-domain audit**: `git diff develop --stat` MUST NOT include `^ui/` or `^tests/`.

### AD-10 Cross-domain enforcement

Reasserted from `local-data-model-sqlite/design.md §AD-10`. Phase 2 sources in `services/` and `openspec/changes/add-sync-queue/` only. The `services/sync-queue.service.ts` module is forbidden from importing anything under `ui/` or top-level `tests/`. Concrete enforcement:

1. **Code review at PR time**: every import in `services/sync-queue.{service,transport}.ts` and `services/network.service.ts` is reviewed against this rule.
2. **`git diff develop --stat` pre-flight** in `sdd-apply`: abort if any path matches `^ui/` or `^tests/`.
3. **No UI side-effects**: `services/sync-queue.service.ts` does not log to console beyond `console.warn` for the `pausado` cap (Fase 7 may consolidate logging). No `Alert`, no `Toast`, no UI Subject.

## 2. Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `services/sync-queue.transport.ts` | New | Port interface + types. |
| `services/sync-queue.service.ts` | New | Drain loop, conflict resolver, backoff scheduler, enqueue. |
| `services/network.service.ts` | New | `red$` + `becameOnline$`. |
| `services/__tests__/sync-queue.service.test.ts` | New | Drain success, drop on remote-fresher, backoff schedule, 5-intent cap, hybrid trigger, GPS isolation. |
| `services/__tests__/network.service.test.ts` | New | `red$` reflects connectivity; `becameOnline$` is rising-edge only. |
| `openspec/changes/add-sync-queue/` | New | Change folder (proposal + design + tasks + spec). |
| `openspec/specs/sync-queue/spec.md` | New (post-archive) | Delta spec with 8 ADDED requirements. |

Not touched: `ui/`, top-level `tests/`, `services/db.service.ts` (Phase 1 frozen), `services/carrera.repo.ts` (Phase 1 frozen), `data/sqlite/{migrations,types}.ts` (Phase 1 frozen), `services/strategies/` (Fase 4), `services/location.service.ts` (Fase 5).

## 3. Phase 1 bridge surface consumed (read-only)

The Phase 1 design (`local-data-model-sqlite/design.md`) shipped AD-7 (RxJS bridge) and AD-8 (Upsert path). Phase 2 consumes:

- **`syncQueue$: BehaviorSubject<SyncQueueRow[]>`** — initial snapshot at `services/db.service.ts:267-272` already filters to `pendiente|fallido|pausado|procesando`. Phase 2 reads `getValue()` to pick the next batch and subscribes for UI updates.
- **`dbChange$: Subject<DbChange>`** — multiplexed `{ kind, table, rowId, driverId, ts }`. Phase 2's enqueue subscription filters on `kind`, `table`, and re-broadcasts via the same `enqueue()` path.
- **`local-rls-facade` mandate** — every `UPDATE sync_queue SET estado = ...` and every `INSERT INTO sync_queue` routes through `db.service.ts`'s `LocalDatabase` interface. The sync service never imports `expo-sqlite`.
- **`local-updated-at-js-layer` mandate** — `ultimo_intento` is stamped via `new Date().toISOString()` in the same write that updates `estado`. No SQLite trigger is added.
- **`local-rxjs-bridge` requirement** — Phase 1's `carreras$`, `gastos$`, `eventos$` emissions are independent of Phase 2; only `syncQueue$` and `dbChange$` are touched.

No Phase 1 file is modified. No Phase 1 spec delta is required.

## 4. File-by-file plan (write-time)

| Path | Conventional commit |
|------|---------------------|
| `openspec/changes/add-sync-queue/{proposal.md, design.md, tasks.md, specs/sync-queue/spec.md}` | `docs: propose add-sync-queue` |
| `services/sync-queue.transport.ts` | `feat: add sync queue transport port (add-sync-queue)` |
| `services/network.service.ts` | `feat: add network service with red$ and becameOnline$ (add-sync-queue)` |
| `services/sync-queue.service.ts` | `feat: add sync queue service with drain + backoff + lww (add-sync-queue)` |
| `services/__tests__/network.service.test.ts` | `test: add network service tests (add-sync-queue)` |
| `services/__tests__/sync-queue.service.test.ts` | `test: add sync queue service tests (add-sync-queue)` |

PR-split decision: at the orchestrator's `sdd-tasks` time. Natural split boundary: PR #1 = `docs:` + `network.service.ts` + `network.service.test.ts` (smallest coherent slice); PR #2 = `sync-queue.transport.ts` + `sync-queue.service.ts` + `sync-queue.service.test.ts` (the substantive slice). The single-PR size for the entire change is estimated at ~700 lines (1 transport interface + 1 service ~250 LOC + 2 test files ~400 LOC + OpenSpec ~150 LOC). The 400-line PR budget risk is **high** under Phase 1's precedent (`local-data-model-sqlite` shipped 2,327 insertions on a single PR; orchestrator chose single-PR for Phase 1; for Phase 2, `auto-chain` is the default unless the user overrides).

## 5. Out-of-scope (forwarded to future changes)

- **Concrete Supabase transport** (`SupabaseSyncTransport`) — Fase 5. Requires OAuth + Supabase client wiring + RLS-bypass secrets (Fase 6 if/when Uber partnership lands).
- **UI surfacing** of `pausado` rows, `syncState$` indicator on the Dashboard, manual "retry paused items" button — Fase 3 (Pi territory; cross-domain rule).
- **`LocationService` / `posicion$`** — Fase 5. The `table !== 'posicion'` filter is in place so the day `posicion$` lands, the isolation is structural.
- **Adaptive polling intervals** — 30s fixed for Phase 2. Fase 7 may add 5-minute slow-tick when `syncQueue$` is empty.
- **Encrypted `metadata` for queue payloads** — Fase 7 (security review).
- **Realtime publication of remote changes** — out of scope; local push-only. `openspec/specs/realtime/spec.md` is the remote contract; Phase 2 is one-way.

## 6. Open tradeoffs (forwarded to proposal.md)

- **Trigger model** (Q1): chose hybrid over push-only / pull-only / event-only. Tradeoff: slightly more code (event + timer) for fewer failure modes.
- **Backoff schedule** (Q2): chose `base=1000ms, factor=2, cap=60000ms` → `[1000, 2000, 4000, 8000, 16000]`. Tradeoff: aggressive recovery (≤31s total of backoff) at the cost of battery drain during flaky network storms. Alternative `base=2000ms, factor=2.5` is slower but uses less battery.
- **Conflict resolver** (Q3): chose enqueue-time read-then-compare. Tradeoff: fewer network round-trips vs. the precision of drain-time. Documented in AD-7; `transport.upsert` returns `conflict: 'remote-fresher'` as the second-line defence.
- **NetworkService bundling** (Q4): chose bundled in Phase 2 over a separate change. Tradeoff: Phase 2 PR is larger; alternative would ship a fake NetworkService and split the real one later. Net cost favours bundling because the drain loop is unusable without `red$`.
- **Enqueue mechanism** (Q8): chose auto-subscribe to `dbChange$` over explicit `enqueue()` from each repo. Tradeoff: a single funnel vs. a thin coupling between every repo and the sync service. The funnel wins because it localises de-dup logic.

## 7. Source-of-truth citations

- **`docs/RFC-004-sincronizacion.md`** — local-first writes; backoff schedule; last-write-wins by `updated_at`; GPS exclusion; Realtime optional.
- **`openspec/specs/data-model/spec.md §sync-queue-states`** — state machine enums (`pendiente|procesando|completado|fallido|pausado`) and `operacion` enums (`insert|update|upsert|delete`).
- **`openspec/specs/data-model/spec.md §updated-at-trigger`** — last-write-wins ordering key on the remote side.
- **`openspec/specs/data-model/spec.md §indexes`** — `idx_sync_queue_driver_estado` + `idx_sync_queue_ultimo_intento` are already present from Phase 1; Phase 2 queries use them.
- **`openspec/specs/local-data-model/spec.md §local-rls-facade`** — single write facade mandate; Phase 2 sync mutations route through `db.service.ts`.
- **`openspec/specs/local-data-model/spec.md §local-updated-at-js-layer`** — JS-stamped `updated_at`; Phase 2 uses the same pattern for `ultimo_intento`.
- **`openspec/specs/local-data-model/spec.md §local-rxjs-bridge`** — `syncQueue$` (BehaviorSubject of pending rows) + `dbChange$` (multiplexed Subject); Phase 2 consumes both.
- **`docs/RFC-003-logica-registro.md §Observables`** — names `sync$` and `red$` (Phase 2 materialises both; `sync$` is the UI-side alias of `syncState$`).
- **`docs/PRD-consolidado.md §5 + §8`** — Phase 2 = "Servicios RxJS + sync"; ownership = OpenCode (`data/` + `services/`).
- **`docs/gitflow.md`** — cross-domain rule; conventional commits; OpenSpec validate gate before code ships.
- **`.claude/plans/driverledger-fase-0-7.plan.md`** §5 Fase 2 — validation gate is "tests offline→online, conflicto de versiones y reintentos".
- **Explore observation #1925** — Phase 2 inventory + 8 open questions + risks.
- **Decision observation #1926** — user-confirmed Q1-Q8 forks.
- **`openspec/changes/archive/2026-10-11-local-data-model-sqlite/design.md AD-7`** — Phase 1 RxJS bridge surface that Phase 2 consumes.
- **`services/db.service.ts:267-272`** — `syncQueue$` initial snapshot filter (already includes `pendiente|fallido|pausado|procesando`).
- **`services/carrera.repo.ts:218-236`** — `emitAfterWrite` pattern for `dbChange$` shape that Phase 2's enqueue filter reads.
- **`data/sqlite/migrations.ts:100-110`** — `sync_queue` table schema; CHECKs on `operacion` and `estado`; no Phase 2 changes.