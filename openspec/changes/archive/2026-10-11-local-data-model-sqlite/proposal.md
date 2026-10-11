# Proposal: local-data-model-sqlite

## Intent

Phase 1 of PRD §8. Mirror the archived remote contract (`openspec/specs/data-model/spec.md`) into an offline-first SQLite layer driven by `expo-sqlite`, and expose a thin RxJS bridge that downstream changes (Phase 2 `add-sync-queue`, Phase 4 strategies) can depend on. Phase 2 cannot exist without a verified local schema (RFC-004 §Flujo 1 writes locally first).

## Why

- **PRD §3 + §8** mandate the 6-table contract and put the SQLite mirror at Phase 1, before sync and strategies.
- **RFC-002 §Tablas** is the column-shape source of truth; `openspec/specs/data-model/spec.md` (archived) is the bridge contract — any drift between Postgres and SQLite is a critical defect.
- **RFC-003** names `carreras$` as the canonical Subject the Strategy pattern emits to; this change provides the bridge that Phase 4 subscribes to.
- **RFC-004 §Flujo 1** starts every write in SQLite; Phase 2 inherits the verified mirror.
- **Plan §5 Fase 1** validation gate is `bun test` + OpenSpec strict — tests must ship with this change.

## Scope

### In Scope

- `data/sqlite/migrations.ts` — embedded SQL migration runner.
- `data/sqlite/types.ts` — TypeScript types matching the 6-table shape.
- `data/sqlite/__tests__/pragma-parity.test.ts` — `PRAGMA table_info` / `PRAGMA index_list` match the archived spec.
- `data/sqlite/__tests__/upsert.test.ts` — idempotent upsert by `(driver_id, trip_id)`.
- `services/db.service.ts` — singleton `getDb()`, RxJS bridge (`carreras$`, `gastos$`, `eventos$`, `syncQueue$`, `dbChange$`), JSON helpers.
- `services/carrera.repo.ts` — concrete repository using `db.service.ts`.
- `services/__tests__/db.service.test.ts` — lifecycle, emission, JSON round-trip, `updated_at` refresh.
- `openspec/changes/local-data-model-sqlite/{proposal,design,tasks}.md` and `specs/local-data-model/spec.md`.

### Out of Scope

- `ui/` (Pi territory; Fase 3).
- Top-level `tests/` directory (Fase 7 — Pi).
- `services/strategies/` (Fase 4).
- Phase 0a `data/migrations/*.sql` — Postgres source-of-truth, never modified from this change.
- Sync drain logic (Phase 2).
- RLS, OAuth, profile table (Phase 0a; not revisited).

> **Cross-domain rule**: this change touches ONLY `data/sqlite/`, `services/`, and `openspec/changes/local-data-model-sqlite/`. Never `ui/` or top-level `tests/`. Enforced at `sdd-apply` via `git diff develop --stat`.

## Capabilities

### New Capabilities

- `local-data-model` — offline-first SQLite mirror of the 6-table contract with RxJS bridge.

### Modified Capabilities

None.

### Removed Capabilities

None.

## Approach

`expo-sqlite` (`~57.0.4` per `ui/package.json`) with synchronous commands wrapped in a single transaction per migration. `services/db.service.ts` is the only legal write path; all repositories depend on it and never call `expo-sqlite` directly. `services/carrera.repo.ts` is the concrete repository demonstrating the pattern (`upsertByTripId`). RxJS bridge exposes per-table streams + a multiplexed `dbChange$` for Phase 2 drain. Migrations are embedded SQL strings in `data/sqlite/migrations.ts`, ordered (0001 schema, 0002 indexes, 0003 sample seed for local dev only). Tests are colocated in `__tests__/` folders under `data/sqlite/` and `services/`, runnable via `bun test` against an in-memory SQLite. See `design.md` for AD-1…AD-10.

## Open Questions (defaults applied unless review objects)

| # | Question | Default | Alternative |
|---|---------|---------|-------------|
| Q1 | Test placement | **Colocated `__tests__/`** under `data/sqlite/` and `services/` | Deferred to Fase 7 Pi (`tests/`) |
| Q2 | Metadata storage | `TEXT` + `json1` extension (bundled in `expo-sqlite`) | Manual `JSON.parse/stringify` |
| Q3 | JSONB columns | All 6 tables get `metadata` (mirror spec.md); defer RFC-002 update | Strict RFC-002 (omit on `gastos_fijos`) |
| Q4 | `fecha` type | `TEXT` ISO `YYYY-MM-DD` | `INTEGER` epoch / `REAL` Julian |
| Q5 | `updated_at` automation | JS-layer in `db.service.ts` (sets on UPDATE in same tx) | SQLite `BEFORE UPDATE` trigger for Postgres parity |
| Q6 | RxJS bridge surface | Per-table Subject (`carreras$`, `gastos$`, `eventos$`, `syncQueue$`) + multiplexed `dbChange$` | Single multiplexed only |
| Q7 | Connection model | Single shared connection in `db.service.ts` (lazy open, closeable for tests) | Per-repository |

Q1 and Q3 confirmed by user in advance (see `architecture/phase-1-decisions`); the rest follow explore defaults.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| SQLite ↔ Supabase schema drift | High | `pragma-parity.test.ts` asserts `PRAGMA table_info` matches the 6-table spec; CI gate. |
| JSONB semantics divergence (Postgres normalises; SQLite stores bytes) | Med | `metadata-roundtrip` test + comment in `data/sqlite/README.md`; rely on `json_extract` equality. |
| `fecha` timezone ambiguity (driver local vs device UTC) | Med | Store ISO local calendar; Phase 4 strategy reads device-local context. Documented in design AD-5. |
| Index proliferation (9 indexes for a small local DB) | Low | Ship verbatim for parity; comment that Fase 7 may drop unused. |
| No RLS on local DB (intentional) | Med | `db.service.ts` is the single write facade; connection handle never escapes. |
| Connection lifecycle (`expo-sqlite` is process-wide) | Low | Lazy singleton + `close()` only used by tests. |
| Bun coverage thresholds live in `ui/bunfig.toml` (excludes `data/`) | Low | Documented; Fase 7 unifies coverage. |
| PR-split risk: estimated 500–700 lines for 6 tables + service + tests | Med | Orchestrator pre-flights `delivery_strategy`; may split into PR #1 (schema + parity test) + PR #2 (service + bridge + upsert test). |
| Local `payload` vs `metadata` naming (RFC-002 says `log_eventos.payload`; spec.md says `metadata`) | Low | Adopt `metadata` to match the bridge contract (`spec.md`); defer RFC-002 update. |

## Rollback Plan

Forward-only. SQLite migrations roll down via `DROP TABLE` if the change is abandoned before merge (no production data on local DB). After merge, revert the merge commit on `develop`; `openspec archive --undo` removes `local-data-model` from `openspec/specs/` and the change folder is moved to `archive/`. No remote data is affected — the local mirror is non-authoritative.

## Dependencies

- Phase 0a `setup-supabase-tables` (archived; provides `openspec/specs/data-model/spec.md` as the bridge contract).
- `expo-sqlite` `~57.0.4` (already pinned in `ui/package.json`).
- `rxjs` `^7.8.2` (already pinned).
- Bun `1.3.12` (already pinned as `packageManager`).

## Success Criteria

- [ ] 6 tables created on `expo-sqlite` with the same columns/defaults as Phase 0a `data/migrations/0001_init_schema.sql` (verify via `PRAGMA table_info(...)` round-trip).
- [ ] `db.service.ts` exposes `carreras$`, `gastos$`, `eventos$`, `syncQueue$` Subjects and a `dbChange$` multiplex.
- [ ] `upsertByTripId(driverId, tripId, payload)` is idempotent: repeated calls produce ONE row, `updated_at` refreshes.
- [ ] All 9 indexes from `data-model` spec recreate locally.
- [ ] Coverage ≥ 80% on `data/sqlite/` and `services/db.service.ts`.
- [ ] `openspec validate local-data-model-sqlite --strict` passes.
- [ ] `git diff develop --stat` shows zero files under `ui/` or top-level `tests/`.