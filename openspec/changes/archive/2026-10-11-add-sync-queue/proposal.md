# Proposal: add-sync-queue

> Phase 2 of `docs/PRD-consolidado.md §8`. Drains `sync_queue` rows against Supabase with the algorithm `docs/RFC-004-sincronizacion.md` specifies. Depends on the Phase 1 bridge (`services/db.service.ts`) merged in `local-data-model-sqlite`.

## Intent

Phase 2 turns the local-first write layer into an offline-first system that reconciles with Supabase. Every `carreras` / `gastos_fijos` / `gastos_diarios` / `log_eventos` mutation already lands on SQLite first (per `docs/RFC-004 §Flujo 1` and `openspec/specs/local-data-model/spec.md §local-rxjs-bridge`). Phase 2 adds the missing piece: when connectivity returns, push the queued mutations to Supabase with exponential backoff, last-write-wins by `updated_at`, and a 5-attempt pause cap — exactly as RFC-004 §Flujo 4-6 mandates.

The deliverable is `services/sync-queue.service.ts` (drain loop + backoff scheduler + conflict resolver), `services/sync-queue.transport.ts` (port interface only — concrete Supabase impl is a Fase 5 deliverable), `services/network.service.ts` (`red$` + `becameOnline$` for connectivity events), two colocated tests under `services/__tests__/`, and one new capability spec delta (`sync-queue`).

## Why

- **RFC-004 §Flujo 1-6** mandates local-first writes, sync_queue draining with exponential backoff, last-write-wins by `updated_at`, and GPS isolation. Phase 1 ships the local mirror + bridge Subjects but explicitly defers drain logic to Phase 2 (`openspec/changes/archive/2026-10-11-local-data-model-sqlite/proposal.md §Out of Scope`).
- **PRD §5 + §8** puts "Servicios RxJS + sync" at Phase 2 — without this change, Fase 4 strategies can persist rows that never reach Supabase, breaking the offline-first contract.
- **PRD §2** names Supabase as the remote source-of-truth. If Phase 2 ships a partial drainer, local rows drift from Supabase and Fase 7 (`add-tests-and-polish`) cannot reconcile state.
- **Plan §5 Fase 2** validation gate: "tests offline→online, conflicto de versiones y reintentos". This change writes those tests against the bridge surface Phase 1 already locked.
- **Bridge reuse**: `services/db.service.ts` already exposes `syncQueue$` (initial snapshot includes `pendiente|fallido|pausado|procesando`) and the multiplexed `dbChange$` (`{ kind, table, rowId, driverId, ts }`). Phase 2 consumes both without modifying the facade (decision observation `sdd/driverledger/add-sync-queue/explore #1925` + archived `local-data-model-sqlite` design AD-7).

## Scope

### In Scope

- `services/sync-queue.transport.ts` — port interface only (`SyncTransport { read, upsert, delete }`); no Supabase implementation in this change.
- `services/sync-queue.service.ts` — drain loop, conflict resolver, backoff scheduler, public surface (`drain()`, `enqueue()`, `syncState$`).
- `services/network.service.ts` — `red$: BehaviorSubject<boolean>` (current connectivity) + `becameOnline$: Observable<void>` (rising-edge trigger).
- `services/__tests__/sync-queue.service.test.ts` — colocated; `FakeSyncTransport` for deterministic transport behaviour; `FakeClock` for backoff timing; assertions for drain success, drop on `remote-fresher`, backoff schedule, 5-intent cap → `pausado`, hybrid trigger (event + tick), GPS isolation.
- `services/__tests__/network.service.test.ts` — `red$` reports online/offline; `becameOnline$` fires only on the rising edge (does not fire on disconnect → reconnect-to-offline).
- `openspec/changes/add-sync-queue/{proposal.md, design.md, tasks.md}` — the change folder.
- `openspec/changes/add-sync-queue/specs/sync-queue/spec.md` — new capability spec delta with 8 ADDED requirements.

### Out of Scope

- `ui/` and any top-level `tests/` directory (Pi territory; cross-domain rule).
- `services/carrera.repo.ts` — no edits. Phase 2 consumes its `dbChange$` emissions; the repo pattern is frozen from the Phase 1 archive.
- `services/db.service.ts` — no edits. The Phase 1 facade stays frozen; Phase 2 reads `syncQueue$` and `dbChange$` only. Cross-domain to Phase 1's lock is by consumption, not mutation.
- `data/sqlite/{migrations,types}.ts` — no schema or type changes. Phase 2 uses the existing `sync_queue` shape and `SyncQueueRow` type verbatim.
- `services/strategies/` (Fase 4).
- `services/location.service.ts` and `posicion$` (Fase 5). GPS isolation in this change is enforced by the `table !== 'posicion'` filter on `dbChange$`; the `posicion$` Subject does not exist yet.
- Concrete Supabase transport implementation — `services/sync-queue.transport.ts` is a **port**; the `SupabaseSyncTransport` adapter is a Fase 5 deliverable. Tests use `FakeSyncTransport`.
- `@supabase/supabase-js` import from `services/` — `ui/package.json` already declares it; Phase 2 does not need its own copy because the concrete transport is Fase 5. Phase 2's only consumer-side dep is `rxjs` (already shared with `db.service.ts`).
- UI surfacing of `pausado` rows — Fase 3 (Pi territory).

> **Cross-domain rule (AD-10)**: this change touches ONLY `services/` (excluding the frozen `db.service.ts` + `carrera.repo.ts`) and `openspec/changes/add-sync-queue/`. Never `ui/`, never top-level `tests/`, never `data/`. Enforced at `sdd-apply` pre-flight via `git diff develop --stat`.

## Capabilities

### New Capabilities

- `sync-queue` — offline-first drain loop with exponential backoff, last-write-wins conflict resolver, hybrid (event + poll) trigger, transport port for Fase 5 Supabase adapter.

### Modified Capabilities

None.

### Removed Capabilities

None.

## Approach

Apply the 8 user-locked defaults from `architecture/phase-2-decisions` (decision observation #1926). Each maps to an AD in `design.md`:

| Q | Locked default | Reference |
|---|----------------|-----------|
| **Q1** Trigger model | **Hybrid**: subscribe to `NetworkService.becameOnline$` for immediate flush on reconnect + `setInterval(30_000)` polling tick that runs only while `red$` reports online. | AD-3 |
| **Q2** Backoff schedule | `BACKOFF_SCHEDULE = [1_000, 2_000, 4_000, 8_000, 16_000]` ms (base=1000, factor=2, cap=60000). 5th failure → `pausado`. | AD-4 |
| **Q3** Conflict resolver | **Last-write-wins by `updated_at`**: read remote by PK before push; if `remote.updated_at > local.updated_at` mark `sync_queue.estado = 'completado'` and drop the local change. | AD-7 |
| **Q4** NetworkService scope | **Bundled** in this change. Phase 2 ships `services/network.service.ts` so the hybrid trigger is co-located with the drain logic; Fase 5 Background GPS reuses `red$`. | AD-8 |
| **Q5** Retry cap | `intentos >= 5` → `pausado`. UI surfacing is Fase 3 Pi territory (out of scope here). | AD-4, AD-5 |
| **Q6** Test placement | Colocated `services/__tests__/sync-queue.service.test.ts` + `services/__tests__/network.service.test.ts` (Phase 1 precedent). | AD-9 |
| **Q7** GPS isolation | `posicion$` (in-memory only, Fase 5) and any `dbChange$` event with `table === 'posicion'` NEVER enter `sync_queue`. Defensive filter `table !== 'posicion'` in the auto-enqueue subscription. | AD-6 |
| **Q8** Enqueue mechanism | Auto-subscribe to `dbChange$` filtered to tables other than `sync_queue`, `plataformas`, `posicion` (per RFC-004 §Flujo 1-2: writes that are themselves sync_queue operations must not re-enqueue). UNIQUE `(driver_id, tabla, registro_id, operacion)` constraint check at enqueue time; duplicate events within a drain window refresh `ultimo_intento` and remain `pendiente`. | AD-6 |

Cross-cutting:

- All `sync_queue` mutations (`UPDATE sync_queue SET estado = ...`, `INSERT INTO sync_queue ...`) route through `services/db.service.ts` per `openspec/specs/local-data-model/spec.md §local-rls-facade`. The sync service never imports `expo-sqlite` directly.
- The drain loop consumes `SyncTransport` (port) — Fase 5 will provide `SupabaseSyncTransport`. Tests inject `FakeSyncTransport`.
- `NetworkService` exposes `red$` (BehaviorSubject<boolean>) for "is the device online right now?" and `becameOnline$` (Observable<void>) for "the connectivity just flipped from offline to online". The polling tick is a private internal scheduler inside `sync-queue.service.ts`, not a public NetworkService surface.
- The conflict resolver runs **at enqueue time** (AD-7): we compare local `updated_at` against a remote snapshot taken when the row is enqueued. If remote is fresher, the row is immediately marked `completado` without retrying. This trades a fresh read for offline-first safety — the drain loop only attempts push for rows where local may win.
- Coverage target ≥ 80% on `services/sync-queue.service.ts` (mirrors Phase 1's `local-test-coverage` precedent).

## Open Questions

All 8 are resolved by user-locked defaults above. Captured here for the proposal record with alternatives:

| # | Question | Accepted (Q-locked default) | Alternative considered |
|---|----------|-----------------------------|-------------------------|
| Q1 | Trigger model | Hybrid: `becameOnline$` event + 30s poll tick | Push-only (`dbChange$` subscription) — duplicated de-dup logic + battery cost. Pull-only — stale rows during long offline. Event-only — misses pending rows after kill/restart. |
| Q2 | Backoff parameters | `base=1000ms, factor=2, cap=60000ms` → `[1000, 2000, 4000, 8000, 16000]` | `base=2000ms, factor=2.5, cap=60000ms` → `[2000, 5000, 12500, 31250, 60000]` — slower recovery, longer user-visible delay. |
| Q3 | Conflict resolver | Last-write-wins by `updated_at` (RFC-004 §Flujo 6). Read-then-compare at enqueue time. | Server-first (remote always wins on conflict). Client-first (local always wins — violates RFC). Read-then-compare at drain time (more accurate but requires a fresh remote read on every drain, doubling network traffic). |
| Q4 | NetworkService scope | Bundled in this change. | Separate change shipping a stub `NetworkService` returning `online: true`. Tradeoff: pull-tick becomes the only real trigger until the next change ships. Rejected because Phase 2 already owns `services/` and the trigger model depends on `red$`. |
| Q5 | Retry cap | `intentos >= 5` → `pausado`. UI surfacing is Fase 3 Pi. | Exponential-only without a cap (rows would retry forever). Hard cap of 3 (too aggressive — drivers on flaky networks would lose legitimate writes). |
| Q6 | Test placement | Colocated `services/__tests__/` (Phase 1 precedent). | Top-level `tests/` (Fase 7 Pi territory — forbidden by cross-domain rule). |
| Q7 | GPS isolation | `posicion$` never enters `sync_queue`; defensive filter `table !== 'posicion'` even before `posicion$` exists. | Filter only `table !== 'sync_queue'` — risks leaking GPS rows in Fase 5 when `posicion$` lands. Rejected as too narrow. |
| Q8 | Enqueue mechanism | Auto-subscribe to `dbChange$` with filter `table ∉ {sync_queue, plataformas, posicion}` + UNIQUE `(driver_id, tabla, registro_id, operacion)` constraint. | Explicit `enqueue()` call from each repository — couples every repo to the sync service. Rejected because it duplicates the de-dup logic and inflates Phase 4's footprint. |

## Risks

| # | Risk | Likelihood | Mitigation |
|---|------|------------|------------|
| R-1 | **Silent last-write-wins drops** — concurrent local/remote writes lose the older side. | Med | Log `tipo = 'sync.conflict'` in `log_eventos` (Fase 3 surfaces in Settings); document in `services/README.md`. Spec scenario `sync-conflict-resolver` exercises the drop path. |
| R-2 | **Stranded `pausado` rows** — entries that hit 5 attempts sit forever unless UI surfaces them. | Med | `syncQueue$` BehaviorSubject already carries `pausado` rows in its Phase 1 snapshot (`services/db.service.ts:267-272`). Fase 3 Pi consumes `syncQueue$` to render the count. Phase 2 ships no UI hit; does not delete stranded rows. |
| R-3 | **Backoff timer loss on app kill** — pending `fallido` rows have no live timer after kill; pull-tick after reopen picks them up if `intentos < 5`. | Med | 30s polling tick (Q1) is the recovery path; documented in AD-3 + spec `sync-queue-trigger-hybrid`. After 5 attempts the row is `pausado` and requires manual retry. |
| R-4 | **Cross-domain drift** — SyncService reaches into `ui/` to surface `pausado` toasts. | Med | Hard cross-domain gate in `sdd-apply` via `git diff develop --stat`; `services/sync-queue.service.ts` has no UI imports. AD-10 reasserts the Phase 1 rule. |
| R-5 | **De-dup missed on rapid retries** — `dbChange$` fires twice during the same write session (rare race). | Low | UNIQUE `(driver_id, tabla, registro_id, operacion)` constraint check at enqueue time; if the constraint fires, refresh `ultimo_intento` on the existing row and stay in `pendiente`. Spec scenario `sync-enqueue-de-dup`. |
| R-6 | **Network state races** — `red$` reports online but the socket is dead. | Med | `SyncTransport` errors are treated as offline-equivalent: bump `intentos` and `fallido`. Tests use `FakeSyncTransport` that can simulate a dead-socket error to assert the path. AD-3 + AD-5. |
| R-7 | **Polling battery cost** — 30s interval is conservative; could be too aggressive on metered networks. | Low | Tick runs only while `red$` reports `online`. When `syncQueue$` is empty (`pendiente` count = 0), the tick is a no-op (single SELECT). Future Fase 7 may add adaptive intervals (out of scope). |
| R-8 | **Schema drift between local `sync_queue` and remote `sync_queue`** if Phase 0a changes the remote shape. | Low | `data/sqlite/migrations.ts` is frozen from Phase 1 archive. Any drift requires a Phase 0a follow-up change. Spec scenario `sync-queue-states` mirrors the CHECK enums 1:1. |

## Rollback Plan

Forward-only. The sync service mutates rows only through `db.service.ts`; no schema is introduced in Phase 2 (the `sync_queue` table already exists from Phase 1's `migrations.ts:100-110`). Rollback steps:

1. Revert the merge commit on `develop` after merge.
2. `openspec archive --undo` removes `sync-queue` from `openspec/specs/` and moves the change folder to `archive/`.
3. Any rows left in `pendiente|fallido|pausado` remain on device. Do **NOT** auto-purge — stranded rows are user data; the driver can re-enable sync in a future app launch.
4. Phase 2 ships a `clearStuckQueued(driverId)` admin endpoint stub for Fase 7 (out of scope for this change — the function is documented in `services/sync-queue.service.ts` JSDoc but not exported via UI). The repository test exercises it locally to avoid bit-rotting the helper.

## Dependencies

- **Phase 1 (`local-data-model-sqlite`)** — merged into `develop`. Phase 2 consumes:
  - `services/db.service.ts` `syncQueue$: BehaviorSubject<SyncQueueRow[]>` (initial snapshot includes `pendiente|fallido|pausado|procesando`).
  - `services/db.service.ts` `dbChange$: Subject<DbChange>` (`{ kind, table, rowId, driverId, ts }`).
  - `data/sqlite/types.ts` `SyncQueueRow`, `SyncEstado`, `SyncOperacion`.
  - `data/sqlite/migrations.ts:100-110` (existing `sync_queue` table; CHECKs on `operacion` and `estado`).
  - The `local-rls-facade` mandate (every `UPDATE sync_queue` routes through `db.service.ts`).
- **No new runtime deps**. `services/sync-queue.service.ts` imports only `rxjs` (already shared with `db.service.ts`) and the Phase 1 types. `@supabase/supabase-js` is **not** imported in this change because the concrete transport is Fase 5.
- **Bun test runner** for `services/__tests__/sync-queue.service.test.ts` and `services/__tests__/network.service.test.ts`.

## Success Criteria

- [ ] `services/sync-queue.service.ts` exposes `drain(): Promise<void>` (manual flush), `enqueue(evt: DbChange): Promise<void>` (idempotent on UNIQUE), `syncState$: Observable<SyncDrainState>` (current drain status).
- [ ] `services/network.service.ts` exposes `red$: BehaviorSubject<boolean>` and `becameOnline$: Observable<void>`; `becameOnline$` fires only on the rising edge.
- [ ] Hybrid trigger fires on either `becameOnline$` event OR the 30s polling tick; the tick is a no-op while `red$` reports `false`.
- [ ] Each `pendiente` row transitions `procesando → (completado | fallido)` per drain attempt.
- [ ] After 5 failed attempts the row transitions to `pausado` and stops auto-retrying (only manual `drain()` or admin `clearStuckQueued` can advance it).
- [ ] Last-write-wins correctly drops local writes when remote has fresher `updated_at` (asserted via `FakeSyncTransport` returning `remote.updated_at > local.updated_at`).
- [ ] `posicion` events NEVER appear in `sync_queue` — asserted by inserting a fake `dbChange$` event with `table = 'posicion'` and querying the table after the test.
- [ ] Auto-enqueue via `dbChange$` subscription is the only write path to `sync_queue` rows from this change; manual `enqueue()` calls route through the same subscription (single funnel).
- [ ] Coverage ≥ 80% on `services/sync-queue.service.ts` (per `local-test-coverage` precedent).
- [ ] `services/__tests__/sync-queue.service.test.ts` and `services/__tests__/network.service.test.ts` exit 0 via `bun test` from repo root.
- [ ] `openspec validate add-sync-queue --strict` passes.
- [ ] `git diff develop --stat` shows zero files under `ui/` or top-level `tests/` (cross-domain rule).

## Notes

- The `SyncTransport` port intentionally has no concrete Supabase implementation in this change. The interface is the contract; the implementation is Fase 5. Tests inject `FakeSyncTransport` so the suite is backend-agnostic — same posture as Phase 1's `LocalDatabase` / `bun:sqlite` factory split.
- `NetworkService` is bundled in this change (Q4) because the hybrid trigger (Q1) is a hard dependency of the drain loop. Splitting them would force a fake NetworkService into Phase 2 that Fase 5 would replace — net cost higher than co-locating.
- Phase 2 does **not** add a new UI surface; the only "user-visible" artefact is the `syncState$` Observable, which Fase 3 Pi consumes via the `syncQueue$` bridge for the Dashboard "sync pending" indicator.
- Per `docs/RFC-003-logica-registro.md §Observables`, the canonical Subject name for sync state is `sync$`. Phase 2 ships `syncState$` on the service surface (more explicit); Fase 3 may alias it as `sync$` in the UI layer. Out of scope here.