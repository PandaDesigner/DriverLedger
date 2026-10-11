# Design — local-data-model-sqlite

> Source of truth: `openspec/specs/data-model/spec.md` (the bridge contract, archived from Phase 0a), `docs/RFC-002-modelo-datos.md` (column shapes), `docs/RFC-003-logica-registro.md` (canonical Subjects), `docs/RFC-004-sincronizacion.md` (sync contract — this change lays the groundwork), and the explore observation `sdd/driverledger/local-data-model-sqlite/explore` (#1916) plus the user-confirmed forks in `architecture/phase-1-decisions` (#1917).

## 1. Architectural decisions

### AD-1 File layout

```
data/
└── sqlite/
    ├── migrations.ts                  # ordered embedded-SQL migrations (0001..000N)
    ├── types.ts                       # TS row types matching the 6 tables
    ├── README.md                      # lifecycle: open, migrate, smoke, teardown
    └── __tests__/
        ├── pragma-parity.test.ts      # asserts PRAGMA table_info / index_list match spec
        └── upsert.test.ts             # asserts ON CONFLICT(driver_id, trip_id) DO UPDATE

services/
├── db.service.ts                      # getDb() singleton + RxJS bridge + JSON helpers
├── carrera.repo.ts                    # concrete repository using db.service.ts
└── __tests__/
    └── db.service.test.ts             # lifecycle, Subject emission, JSON round-trip, updated_at
```

OpenCode territory: `data/sqlite/` + `services/`. Never `ui/` or top-level `tests/`.

### AD-2 Migration loading

`data/sqlite/migrations.ts` exports an ordered array of `Migration { name: string; sql: string }`. `db.service.ts` runs them inside a single transaction on first `getDb()`, recording applied migrations in a `schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)` bookkeeping table. Order:

1. **0001 schema** — `CREATE TABLE` for all 6 tables with columns, CHECKs, UNIQUE.
2. **0002 indexes** — the 9 indexes from `data-model.spec.md §indexes`.
3. **0003 sample seed (local dev only)** — 3 `plataformas` rows (Uber / DiDi / InDrive) so Phase 4 strategies resolve without a sync round-trip on cold start.

Production builds skip the dev seed (flag-driven at apply time).

### AD-3 Connection model

`services/db.service.ts` exports an async `getDb(): Promise<SQLiteDatabase>` singleton that:
1. Lazily calls `expo-sqlite/openDatabaseSync('driverledger.db')` on first invocation.
2. Applies pending migrations in `data/sqlite/migrations.ts` (tracked via `schema_migrations`).
3. Sets `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`, `PRAGMA busy_timeout = 5000`.
4. Returns the handle; subsequent `getDb()` calls return the same handle.

Exposes `async closeDb(): Promise<void>` for test teardown only. Connection handle never leaves the module boundary.

### AD-4 JSONB-as-TEXT via `json1`

`metadata` columns are `TEXT NOT NULL DEFAULT '{}'` (default enforced at schema time). The `json1` extension is bundled in `expo-sqlite` ≥ SDK 47. Queries use `json_extract(metadata, '$.key')` / `json_each(...)` for indexed access. `db.service.ts` exports `toJson<T>(text: string): T` and `fromJson(value: unknown): string` helpers that wrap `JSON.parse` / `JSON.stringify` with a defensive fallback to `{}`. JSONB-normalisation parity (key order) is **not** guaranteed — Postgres and SQLite will diverge on byte-level for the same logical value. Sync uses `json_extract` equality (Postgres returns canonical JSON; SQLite returns text bytes; the Supabase client normalises server-side).

`log_eventos.payload` (RFC-002) is renamed to `metadata` to match `spec.md §jsonb-metadata-extensibility`. RFC-002 update is deferred to a follow-up doc change; the bridge contract is `spec.md`.

### AD-5 `fecha` ISO TEXT

`fecha` columns are `TEXT NOT NULL DEFAULT (date('now'))` storing `YYYY-MM-DD`. ISO date sorts lexicographically and matches Postgres `date` semantics. **Timezone policy**: stored in the device's local timezone (no UTC conversion). Phase 4's Strategy layer, which knows the driver's working context, computes "today's carreras" against the same local date. This is documented in `data/sqlite/README.md` and design note AD-5 so Fase 7 doesn't accidentally "fix" it.

`created_at` / `updated_at` columns store ISO 8601 UTC: `TEXT NOT NULL DEFAULT (datetime('now'))` (equivalent to `YYYY-MM-DD HH:MM:SS` UTC). Last-write-wins ordering is by lexicographic ISO comparison (matches RFC-004 §Flujo 6).

### AD-6 `updated_at` JS-layer

`db.service.ts` exposes a private `withUpdatedAt<T>(row: T): T` helper that injects `updated_at = new Date().toISOString()` into UPDATE payloads inside the same transaction as the write. No SQLite trigger — keeps the bridge visible in TS and avoids divergence from Postgres trigger behaviour (which Phase 2's SyncService must mirror for last-write-wins). Insert sets `updated_at` via `DEFAULT (datetime('now'))`.

For tables without `updated_at` (`log_eventos` is append-only; `sync_queue` manages `ultimo_intento` on its own), the helper is bypassed automatically.

### AD-7 RxJS bridge surface

Per Q6 default. Exactly four per-table Subjects + one multiplex, created lazily on first `getDb()`:

| Subject | Type | Emits |
|---------|------|-------|
| `carreras$` | `BehaviorSubject<CarreraRow[]>` | Current snapshot after every `carreras` write (filterable to today by Phase 4). |
| `gastos$` | `BehaviorSubject<GastoRow[]>` | Combined snapshot of `gastos_fijos` + `gastos_diarios`. |
| `eventos$` | `BehaviorSubject<LogEventoRow[]>` | Recent `log_eventos` (last N rows). |
| `syncQueue$` | `BehaviorSubject<SyncQueueRow[]>` | Pending rows (`estado = 'pendiente' \|\| 'fallido'`) for Phase 2 drain. |
| `dbChange$` | `Subject<DbChange>` | Multiplexed event: `{ kind: 'insert' \| 'update' \| 'delete', table, rowId, driverId, ts }`. |

Lifecycle: created in `getDb()`, completed in `closeDb()` (test only). Repositories call `next(...)` on the relevant Subject(s) after each successful write inside the same transaction wrapper.

### AD-8 Upsert path

SQLite's `INSERT ... ON CONFLICT(driver_id, trip_id) DO UPDATE SET ...` is the local equivalent of Postgres's `ON CONFLICT` clause. `services/carrera.repo.ts` exports:

```typescript
export interface CarreraRepo {
  upsertByTripId(driverId: string, tripId: string, payload: CarreraPayload): Promise<CarreraRow>;
  getCarrerasByFecha(driverId: string, fecha: string): Promise<CarreraRow[]>;
  listPlataformas(): Promise<PlataformaRow[]>;
}
```

`upsertByTripId` is the canonical idempotent write — repeated calls produce ONE row, `updated_at` refreshes via AD-6. `getCarrerasByFecha` uses `idx_carreras_fecha` (AD-2). `listPlataformas` returns the 3 seed rows so Phase 4 strategies resolve platform metadata without a sync round-trip.

### AD-9 Test runner

Bun test discovers `data/sqlite/__tests__/*.test.ts` and `services/__tests__/*.test.ts`. Coverage via `bun test --coverage` — a root `bunfig.toml` (workspace root) is added in this change to enable `bun test` from repo root and to scope the coverage include paths to `data/sqlite/` and `services/db.service.ts` + `services/carrera.repo.ts`. The forward-looking `[test] coverageThreshold = { lines = 80, functions = 80, statements = 80, branches = 80 }` matches the `ui/bunfig.toml` floor. Tests use an in-memory SQLite (`':memory:'`) and a fresh schema applied per test via the migration runner — no cross-test bleed.

### AD-10 Cross-domain enforcement

`sdd-apply` pre-flight runs `git diff develop --stat` and aborts if any path matches `^ui/` or `^tests/` (top-level). Within the change, no `import` reaches into `ui/` (TS path alias `@/...` is configured only for `ui/` in `tsconfig.json` per Fase 0b; Phase 1 source files in `data/` and `services/` use relative imports only). The contract is enforced by code review at PR time (no automated `eslint-plugin-import` boundary rule — out of scope for Fase 1).

## 2. Mirror matrix — `openspec/specs/data-model/spec.md` ↔ SQLite

| Spec requirement (line ref) | Mirror target | Notes |
|---|---|---|
| `schema-tables` (§Requirements line 6–12) | `migrations.ts` 0001 — `CREATE TABLE` for all 6 tables | `local-schema-tables` delta |
| `carreras-upsee-by-trip-id` (line 14–20) | `carreras` UNIQUE `(driver_id, trip_id)` | `local-upsert-trip-id` delta |
| `carreras-fuente-check` (line 22–32) | `CHECK (fuente IN ('manual','api','background'))` | Enforced at schema; preserves contract |
| `carreras-estado-check` (line 34–48) | `CHECK (estado IN ('activa','completada','cancelada'))` | Enforced at schema |
| `rls-by-driver-id` (line 50–56) | **No DB-layer RLS on local.** `db.service.ts` is the only legal write facade. | `local-rls-facade` delta (replaces remote RLS) |
| `plataformas-global-read` (line 58–64) | All authenticated local reads return all rows; no policy at local layer (single-driver device). | Documented; no delta spec (out of local scope) |
| `sync-queue-states` (line 66–72) | CHECKs on `operacion` and `estado` | Preserved verbatim |
| `indexes` (line 74–94) | 9 indexes recreated in `migrations.ts` 0002 | `local-indexes` delta |
| `updated-at-trigger` (line 96–102) | JS-layer `updated_at` set in same transaction | `local-updated-at-js-layer` delta |
| `jsonb-metadata-extensibility` (line 104–118) | `metadata TEXT NOT NULL DEFAULT '{}'` + `json1` extension | `local-jsonb-via-text` delta |

All 10 spec requirements are accounted for. 4 (schema-tables, upsee, fuente, estado, sync-states) are enforced at schema level identically to Postgres. 3 (indexes, jsonb, updated_at) are mirrored with documented adaptations (AD-2, AD-4, AD-6). 2 (rls, plataformas-global-read) are intentionally dropped with `local-rls-facade` delta replacing the contract.

## 3. Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `data/sqlite/` | New | Migration runner, 6-table schema, in-memory test fixtures |
| `data/sqlite/__tests__/` | New | `pragma-parity` + `upsert` |
| `services/db.service.ts` | New | Singleton + RxJS bridge + JSON helpers |
| `services/carrera.repo.ts` | New | Concrete repository (canonical example for Fase 2) |
| `services/__tests__/` | New | Bridge lifecycle + emission + JSON tests |
| Root `bunfig.toml` | New | Coverage scope + thresholds (Phase 1 testing surface) |
| `openspec/changes/local-data-model-sqlite/` | New | This change folder |
| `openspec/specs/local-data-model/spec.md` | New (post-archive) | Delta spec for SQLite-specific requirements |

Not touched: `ui/`, top-level `tests/`, `data/migrations/*.sql` (Postgres), `services/strategies/`, `services/{sync,location,network}.service.ts` (later phases).

## 4. File-by-file plan (write-time)

| Path | Conventional commit |
|------|---------------------|
| `openspec/changes/local-data-model-sqlite/proposal.md` + `design.md` + `tasks.md` + `specs/local-data-model/spec.md` | `docs: propose local-data-model-sqlite` |
| `data/sqlite/migrations.ts` + `data/sqlite/types.ts` + `data/sqlite/README.md` | `feat: add sqlite migration runner (local-data-model-sqlite)` |
| `data/sqlite/__tests__/pragma-parity.test.ts` + `data/sqlite/__tests__/upsert.test.ts` | `test: add sqlite parity + idempotency tests (local-data-model-sqlite)` |
| `services/db.service.ts` | `feat: add db service with rxjs bridge (local-data-model-sqlite)` |
| `services/carrera.repo.ts` | `feat: add carrera repo (local-data-model-sqlite)` |
| `services/__tests__/db.service.test.ts` | `test: add db service bridge tests (local-data-model-sqlite)` |
| Root `bunfig.toml` | `chore: add workspace bunfig for data+services tests (local-data-model-sqlite)` |

If `delivery_strategy = auto-chain` (TBD at `sdd-tasks`), split into PR #1 (`docs:` + schema + `pragma-parity` test) + PR #2 (`db.service.ts` + `carrera.repo.ts` + bridge tests).

## 5. Out-of-scope (forwarded to `proposal.md`)

- Sync drain (Phase 2 `add-sync-queue`).
- Strategy pattern + CarreraService composition (Phase 4 `add-platform-strategies`).
- LocationService / NetworkService / `posicion$` / `red$` (Phases 2 + 5).
- UI, navigation, modals (Fase 3 — Pi territory).
- Per-driver storage buckets (`storage` spec is remote-only).
- Realtime publication (`realtime` spec is remote-only).
- RLS / auth at local layer (replaced by `local-rls-facade`).
- `drivers` profile table (deferred indefinitely — Phase 0a decision).

## 6. Open tradeoffs (forwarded to `proposal.md`)

- **Trigger parity**: chose JS-layer `updated_at` over SQLite `BEFORE UPDATE` trigger for bridge visibility (AD-6). Tradeoff: a raw-SQL bypass of `db.service.ts` could skip `updated_at`. Mitigation: `local-rls-facade` delta forbids raw `expo-sqlite` calls outside the facade; code review at PR.
- **JSON normalisation**: `json1` doesn't deduplicate keys; Postgres `jsonb` does. Sync equivalence via `json_extract` is safe but byte-comparison isn't. Documented; Supabase client normalises server-side.
- **Connection scope**: chose singleton (AD-3) over per-repository. Tradeoff: tests must call `closeDb()` between cases; mitigated by in-memory SQLite + `beforeEach` schema reset.
- **Dev seed**: chose to ship 3 platform rows in 0003 for cold-start UX. Tradeoff: production builds must skip via env. Mitigated by flag at apply time.

## 7. Source-of-truth citations

- **`openspec/specs/data-model/spec.md`** — 10 requirements; bridge contract; mirror matrix in §2.
- **`docs/RFC-002-modelo-datos.md`** — column shapes; `UNIQUE(driver_id, trip_id)`; CHECK enums.
- **`docs/RFC-003-logica-registro.md`** — `carreras$` is a `BehaviorSubject` of the day's carreras.
- **`docs/RFC-004-sincronizacion.md`** — local-first writes; sync_queue contract (this PR lays the local groundwork; Phase 2 drains).
- **`docs/gitflow.md`** §3 — cross-domain rule; §conventional commits.
- **`docs/PRD-consolidado.md`** §3 + §8 — 6-table contract; Phase 1 scope.
- **`docs/gherkin-modelo-datos.md`** — Scenarios mapped 1:1 to spec requirements.
- **Explore observation #1916** — 7 open questions + default answers + risks.
- **Decision observation #1917** — user-confirmed Q1 + Q3 forks.
- **`.claude/plans/driverledger-fase-0-7.plan.md`** §5 Fase 1 — validation gate is `bun test` + OpenSpec strict.
- **Archived `2026-10-11-setup-supabase-tables` design.md** §1.1 (plain SQL wins) — adopt the same posture for `data/sqlite/migrations.ts` (embedded SQL strings, no ORM).