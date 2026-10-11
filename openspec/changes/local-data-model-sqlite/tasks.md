# Tasks — local-data-model-sqlite

> Branch `feature/local-data-model-sqlite` is created by `sdd-apply`, not here. Each task maps to one conventional commit. No AI attribution. **Cross-domain rule**: this change touches ONLY `data/sqlite/`, `services/`, root `bunfig.toml`, and `openspec/changes/local-data-model-sqlite/`. Never `ui/` or top-level `tests/`. Enforced at `sdd-apply` pre-flight via `git diff develop --stat`.

## Phase A — Proposal artifacts (committed on `feature/local-data-model-sqlite` as first commit)

- [ ] **A.1** Write `openspec/changes/local-data-model-sqlite/{proposal.md, design.md, tasks.md, specs/local-data-model/spec.md}`. Commit type: `docs: propose local-data-model-sqlite`.

## Phase B — Schema + migration runner (one commit per artifact)

- [ ] **B.1** Write `data/sqlite/types.ts` — TypeScript row types (`PlataformaRow`, `CarreraRow`, `GastoFijoRow`, `GastoDiarioRow`, `LogEventoRow`, `SyncQueueRow`) matching `data-model.spec.md §schema-tables` columns and Phase 0a `0001_init_schema.sql` types adapted to SQLite (UUID as TEXT, NUMERIC as REAL, BOOLEAN as INTEGER 0/1, TIMESTAMPTZ as TEXT ISO, JSONB as TEXT). Commit type: `feat: add sqlite row types (local-data-model-sqlite)`.
- [ ] **B.2** Write `data/sqlite/migrations.ts` — ordered `Migration[]` with `0001` (6 `CREATE TABLE` statements + CHECKs + UNIQUE on `carreras(driver_id, trip_id)`), `0002` (9 indexes from `data-model.spec.md §indexes`), `0003` (3 `plataformas` seed rows with deterministic UUIDs for cold-start). Commit type: `feat: add sqlite migration runner (local-data-model-sqlite)`.
- [ ] **B.3** Write `data/sqlite/README.md` — lifecycle doc: `getDb()` lazy-open, `PRAGMA journal_mode = WAL` + `foreign_keys = ON`, in-memory test mode, dev-seed flag, rollback (`DROP TABLE`). Commit type: `docs: add sqlite readme (local-data-model-sqlite)`.

## Phase C — Schema tests (RED first, then GREEN)

- [ ] **C.1** Write `data/sqlite/__tests__/pragma-parity.test.ts` — boots an in-memory SQLite via `db.service.ts`, asserts each of the 6 tables exists, asserts each column from `data-model.spec.md §schema-tables` is present via `PRAGMA table_info`, asserts all 9 indexes exist via `PRAGMA index_list`. **Should be RED until B.2 lands.** Commit type: `test: add sqlite pragma parity tests (local-data-model-sqlite)`.
- [ ] **C.2** Write `data/sqlite/__tests__/upsert.test.ts` — inserts a `carreras` row, then calls the upsert again with the same `(driver_id, trip_id)` and updated payload; asserts exactly ONE row exists, `updated_at` refreshed, other columns updated. **Should be RED until B.2 + CarreraRepo land.** Commit type: `test: add sqlite upsert idempotency tests (local-data-model-sqlite)`.

## Phase D — Service layer (one commit per artifact)

- [ ] **D.1** Write `services/db.service.ts` — `getDb()` singleton (AD-3), migration runner hook, JSON helpers (`toJson` / `fromJson`), RxJS Subjects (`carreras$`, `gastos$`, `eventos$`, `syncQueue$`, `dbChange$`) created lazily, `closeDb()` for tests, `withUpdatedAt<T>()` helper (AD-6). Commit type: `feat: add db service with rxjs bridge (local-data-model-sqlite)`.
- [ ] **D.2** Write `services/carrera.repo.ts` — `upsertByTripId(driverId, tripId, payload)` using `INSERT ... ON CONFLICT(driver_id, trip_id) DO UPDATE SET ...`, `getCarrerasByFecha(driverId, fecha)`, `listPlataformas()`. Emits to `carreras$` and `dbChange$` after each write. Commit type: `feat: add carrera repo (local-data-model-sqlite)`.

## Phase E — Service tests

- [ ] **E.1** Write `services/__tests__/db.service.test.ts` — covers (a) connection lifecycle: `getDb()` returns same handle, `closeDb()` completes Subjects and clears handle, second `getDb()` re-opens; (b) Subject emission: `carreras$` emits after `carreraRepo.upsertByTripId`, `dbChange$` emits the multiplexed event; (c) JSON round-trip: `toJson` / `fromJson` preserve `metadata` shape, NULL-equivalent `{}` default; (d) `updated_at` refresh: two upserts 1s apart produce different ISO timestamps; (e) PRAGMA assertions: `journal_mode = wal`, `foreign_keys = on`. Commit type: `test: add db service bridge tests (local-data-model-sqlite)`.

## Phase F — Workspace test config

- [ ] **F.1** Write root `bunfig.toml` — `[test] coverageThreshold = { lines = 80, functions = 80, statements = 80, branches = 80 }` mirroring `ui/bunfig.toml`, plus `coverageInclude = ["data/sqlite/**", "services/db.service.ts", "services/carrera.repo.ts"]` (root-level `bunfig.toml` extends to the whole workspace, but Bun `coverageInclude` is file-scoped at run time; verifies only `data/sqlite/` and `services/` are scored). Commit type: `chore: add workspace bunfig for data+services tests (local-data-model-sqlite)`.

## Phase G — Verification (must pass before merge)

- [ ] **G.1** Run `openspec validate local-data-model-sqlite --strict` — exits 0. Commit type: `chore: verify openspec strict (local-data-model-sqlite)`.
- [ ] **G.2** Run `bun test` from repo root — exits 0; all `data/sqlite/__tests__/*.test.ts` + `services/__tests__/*.test.ts` pass. Commit type: `chore: verify bun test (local-data-model-sqlite)`.
- [ ] **G.3** Run `bun test --coverage` — coverage on `data/sqlite/**` and `services/db.service.ts` + `services/carrera.repo.ts` ≥ 80% lines/functions/statements/branches. Commit type: `chore: verify coverage threshold (local-data-model-sqlite)`.
- [ ] **G.4** `git diff develop --stat` audit — no files under `ui/` or top-level `tests/` (cross-domain rule). Commit type: `chore: verify cross-domain boundary (local-data-model-sqlite)`.

## Phase H — Merge + archive (human gate 2)

- [ ] **H.1** PR `feature/local-data-model-sqlite` → `develop` (after human gate 2 approval).
- [ ] **H.2** `openspec archive local-data-model-sqlite` — moves change folder to `openspec/changes/archive/2026-10-11-local-data-model-sqlite/` and promotes `specs/local-data-model/spec.md` into `openspec/specs/local-data-model/spec.md` (8 ADDED requirements; no MODIFIED / REMOVED).
- [ ] **H.3** Delete `feature/local-data-model-sqlite` local and remote.

## Notes

- Test placement: `__tests__/` colocated under `data/sqlite/` and `services/` (Q1 default, confirmed by user in `architecture/phase-1-decisions`). Fase 7 may centralise a subset under `tests/`.
- Bun test runner uses in-memory SQLite (`:memory:`) per test file; `db.service.ts` is parameterised so tests inject a memory handle, real device gets `driverledger.db`.
- The `data/migrations/*.sql` files from Phase 0a are NOT touched by this change. They remain the Postgres source-of-truth.
- If `sdd-tasks` forecasts ≥400 changed lines and `delivery_strategy = auto-chain`, split: PR #1 = A.1 + B.1 + B.2 + C.1 + F.1; PR #2 = D.1 + D.2 + C.2 + E.1.
- Coverage gate (`≥80%`) lives in root `bunfig.toml`; `ui/bunfig.toml` keeps its own thresholds for Fase 7. The two configs do not conflict.