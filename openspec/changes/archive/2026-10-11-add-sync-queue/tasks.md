# Tasks — add-sync-queue

> Branch `feature/add-sync-queue` is created by `sdd-apply`, not here. Each task maps to one conventional commit. No AI attribution. **Cross-domain rule**: this change touches ONLY `services/sync-queue*.ts`, `services/network.service.ts`, `services/__tests__/{sync-queue,network}.service.test.ts`, and `openspec/changes/add-sync-queue/`. Never `ui/`, never top-level `tests/`, never `data/`, never `services/db.service.ts`, never `services/carrera.repo.ts` (Phase 1 frozen). Enforced at `sdd-apply` pre-flight via `git diff develop --stat`.

## Phase A — Proposal artifacts (first commit on `feature/add-sync-queue`)

- [x] **A.1** Write `openspec/changes/add-sync-queue/{proposal.md, design.md, tasks.md, specs/sync-queue/spec.md}`. Commit type: `docs: propose add-sync-queue`.

## Phase B — Port interface (one commit)

- [x] **B.1** Write `services/sync-queue.transport.ts` — `SyncTransport` port interface (`read`, `upsert`, `delete`) + `SyncConflict` enum (`'none' | 'remote-fresher'`) + `SyncTransportRead<T>` return type. No Supabase import. Tests use `FakeSyncTransport` so the interface stays backend-agnostic (Fase 5 ships the concrete impl). Commit type: `feat: add sync queue transport port (add-sync-queue)`.

## Phase C — NetworkService (one commit)

- [x] **C.1** Write `services/network.service.ts` — `NetworkService` class exposing `red$: BehaviorSubject<boolean>` (current connectivity) + `becameOnline$: Observable<void>` (rising-edge trigger). Constructor injects a connectivity source so production can wire `expo-network` and tests can wire `FakeNetwork`. Disconnects (online → offline) emit on `red$` only, NOT on `becameOnline$`. Commit type: `feat: add network service with red$ and becameOnline$ (add-sync-queue)`.

## Phase D — Sync service (one commit)

- [x] **D.1** Write `services/sync-queue.service.ts` — `SyncQueueService` class. Public surface:
  - `drain(): Promise<void>` — idempotent manual flush; no-op if a drain is already in flight.
  - `enqueue(evt: DbChange): Promise<void>` — idempotent on `(driver_id, tabla, registro_id, operacion)`; refreshes `ultimo_intento` on duplicate.
  - `syncState$: Observable<SyncDrainState>` — emits `'idle' | 'draining' | 'backoff' | 'pausado-cap'` after every drain.
  
  Behaviour:
  - Boot subscription to `dbChange$` filtered to tables other than `sync_queue`, `plataformas`, `posicion`; feeds `enqueue()`.
  - Boot subscription to `network.becameOnline$`; calls `drain()` on each emission.
  - Boot `setInterval(30_000)` poll tick; calls `drain()` only while `network.red$.value === true`.
  - Drain loop implements the state machine per design.md AD-5 (pendiente → procesando → completado|fallido; ≥5 intentos → pausado).
  - Backoff schedule is `BACKOFF_SCHEDULE = [1_000, 2_000, 4_000, 8_000, 16_000]` ms; `MAX_INTENTOS = 5` (design.md AD-4).
  - Conflict resolver per design.md AD-7: read remote by PK, drop local if `remote.updated_at > local.updated_at`.
  - Crash recovery on first drain after restart: `UPDATE sync_queue SET estado='pendiente', ultimo_intento=NULL WHERE estado='procesando'`.
  - Every `UPDATE sync_queue SET estado = ...` and every `INSERT INTO sync_queue` routes through `db.service.ts` (per `local-rls-facade`).
  - No import of `expo-sqlite`. No import of `ui/*`.
  
  Commit type: `feat: add sync queue service with drain + backoff + lww (add-sync-queue)`.

## Phase E — Network service tests (RED first, then GREEN)

- [x] **E.1** Write `services/__tests__/network.service.test.ts` — covers:
  - `red$` reflects the source's `isOnline()` result on boot and after each `subscribe` callback.
  - `becameOnline$` fires when transitioning `offline → online` (rising edge).
  - `becameOnline$` does NOT fire when transitioning `online → offline`.
  - `becameOnline$` does NOT fire when transitioning `online → online` (no edge).
  - `becameOnline$` fires again on a second `offline → online` cycle.
  - **Should be RED until C.1 lands.** Commit type: `test: add network service tests (add-sync-queue)`.

## Phase F — Sync queue tests (RED first, then GREEN)

- [x] **F.1** Write `services/__tests__/sync-queue.service.test.ts` — covers:
  - **Drain success on `apply`**: enqueue 1 row, `drain()` resolves with `syncState$ = 'idle'`, `sync_queue` row has `estado = 'completado'`, transport received exactly one `upsert` call.
  - **Drop on `remote-fresher`**: `FakeSyncTransport.read()` returns `updated_at > local.updated_at`; row transitions `pendiente → completado` with no `upsert` call.
  - **Push on `remote-equal`**: `FakeSyncTransport.read()` returns `updated_at === local.updated_at`; row transitions to `completado` with one `upsert` call.
  - **Backoff schedule**: enqueue a row whose transport always errors; assert `BACKOFF_SCHEDULE = [1000, 2000, 4000, 8000, 16000]` ms between consecutive attempts via `FakeClock.advance(...)`. `intentos` increments per attempt.
  - **5-intent cap → `pausado`**: after the 5th failure, row transitions to `pausado`; auto-retry stops; `syncState$` emits `'pausado-cap'`.
  - **Hybrid trigger via `becameOnline$`**: start offline (network set `red$.value = false`), enqueue 1 row, set `red$.value = true` and emit `becameOnline$`; assert drain happens within 1 tick.
  - **Hybrid trigger via poll tick**: stay online, enqueue 1 row, advance `FakeClock` 30_000 ms; assert drain happens on the tick.
  - **Poll no-op while offline**: stay offline, advance `FakeClock` 60_000 ms; assert NO drain runs (tick is gated by `red$.value`).
  - **GPS isolation**: emit a fake `dbChange$` event with `table = 'posicion'`; assert no row is inserted in `sync_queue` (query the table).
  - **`plataformas` filter**: emit a fake `dbChange$` event with `table = 'plataformas'`; assert no row is inserted in `sync_queue`.
  - **`sync_queue` re-entrance guard**: emit a fake `dbChange$` event with `table = 'sync_queue'`; assert no row is inserted (no infinite loop).
  - **De-dup on rapid retries**: enqueue the same `(driver_id, tabla, registro_id, operacion)` twice in quick succession; assert exactly one `sync_queue` row exists; assert `ultimo_intento` is refreshed.
  - **Crash recovery**: enqueue 2 rows, manually `UPDATE sync_queue SET estado='procesando'`, call `drain()`; assert rows reset to `pendiente` first, then drained normally.
  - **drain() idempotent**: call `drain()` twice in flight; assert only one in-flight transport call.
  
  **Should be RED until D.1 lands.** Commit type: `test: add sync queue service tests (add-sync-queue)`.

## Phase G — Verification (must pass before merge)

- [x] **G.1** Run `openspec validate add-sync-queue --strict` — exits 0. Commit type: `chore: verify openspec strict (add-sync-queue)`.
- [x] **G.2** Run `bun test services/__tests__/sync-queue.service.test.ts services/__tests__/network.service.test.ts` from repo root — exits 0; all suites pass. Commit type: `chore: verify sync-queue bun test (add-sync-queue)`.
- [x] **G.3** Run `bun test --coverage` — coverage on `services/sync-queue.service.ts` ≥ 80% lines/functions/statements/branches. Commit type: `chore: verify sync-queue coverage threshold (add-sync-queue)`.
- [x] **G.4** `git diff develop --stat` audit — no files under `ui/`, top-level `tests/`, `data/`, `services/db.service.ts`, or `services/carrera.repo.ts` (cross-domain rule + Phase 1 freeze). Commit type: `chore: verify cross-domain boundary (add-sync-queue)`.

## Phase H — Merge + archive (human gate 2)

- [ ] **H.1** PR `feature/add-sync-queue` → `develop` (after human gate 2 approval).
- [ ] **H.2** `openspec archive add-sync-queue` — moves change folder to `openspec/changes/archive/2026-10-11-add-sync-queue/` and promotes `specs/sync-queue/spec.md` into `openspec/specs/sync-queue/spec.md` (8 ADDED requirements; no MODIFIED / REMOVED).
- [ ] **H.3** Delete `feature/add-sync-queue` local and remote.

## Notes

- **Phase 1 surface is consumed read-only**: `services/db.service.ts` (syncQueue$, dbChange$, getDb, LocalDatabase interface) and `services/carrera.repo.ts` (no imports — only the `dbChange$` shape it emits). No edits to either file.
- **Fase 5 dependency**: `services/sync-queue.transport.ts` is a port. The concrete `SupabaseSyncTransport` ships with Fase 5 (when OAuth + Supabase client + RLS-bypass secrets land together). For now, tests inject `FakeSyncTransport`.
- **PR-split candidate**: estimated ~700 lines across 1 transport interface, 1 service (~250 LOC), 1 network service (~50 LOC), 2 test files (~400 LOC), 4 OpenSpec files (~150 LOC). 400-line PR budget risk is high; if `sdd-tasks` forecasts > 400 lines and `delivery_strategy = auto-chain`, split into PR #1 (A.1 + C.1 + E.1 = `docs:` + network service + tests) and PR #2 (B.1 + D.1 + F.1 = port + service + tests). The orchestrator's authoritative task list is the source of truth.
- **Coverage gate (`≥80%`)** lives in root `bunfig.toml` (Phase 1's existing config; Phase 2 inherits). If the existing config does not include `services/sync-queue.service.ts` in its coverage scope, Phase 2's `sdd-apply` extends it as part of G.3.
- **GPS filter is structural**, not policy: even though `posicion$` does not exist yet (Fase 5), the `table !== 'posicion'` filter is enforced today so that on the day it lands, isolation is automatic without a follow-up spec change.
- **`sync$` naming**: RFC-003 names the UI-side Subject `sync$`. Phase 2 ships `syncState$` on the service surface (more explicit). Fase 3 Pi may alias `syncState$` as `sync$` in the UI layer — out of scope here.
- **Update tasks.md** with `[x]` as tasks complete; commit the `[x]` flips alongside the code that closed them (conventional commits; one commit per task in Phases B-F).