# services/

RxJS-backed services, repositories, sync queue, and the Phase 4 platform
strategy pattern. All files in this directory follow the project's
kebab-case + suffix convention (`<name>.service.ts`, `<name>.repo.ts`,
`<name>.transport.ts`).

## Shipped modules (Phase 0–2)

- `carrera.repo.ts` — `CarreraPayload`, `upsertByTripId`, `listPlataformas`.
  Idempotent INSERT ON CONFLICT keyed on `(driver_id, trip_id)`.
- `db.service.ts` — `getDb()` singleton + `getBridge()` (`carreras$`,
  `gastos$`, `eventos$`, `syncQueue$`, `dbChange$`). The only legal write
  facade for the local SQLite mirror (`local-rls-facade`).
- `sync-queue.service.ts` — drains `sync_queue` with exponential backoff
  and LWW conflict resolution (`W-LOG-CONFLICT`). Subscribes to
  `dbChange$` so every Carrera write is auto-enqueued.
- `network.service.ts` — `red$` (online/offline) + `becameOnline$`
  pulse bridge that triggers sync queue drains.
- `sync-queue.transport.ts` — `SyncTransport` port abstraction; the
  default `SupabaseTransport` posts the queue to Supabase.

## Phase 4 additions

- `carrera.service.ts` (PR #1 / `add-platform-strategies`) —
  orchestration layer. Resolves `plataformaId` → `PlataformaRow` →
  strategy → `StrategySuggestion`. PR #2 adds `commitRegistration`.
  Public read-only surface for `ui/` (cross-domain rule, AD-10).
- `strategies/` — per-platform Strategy pattern (Uber / DiDi / InDrive).
  Open-closed seam: `INSERT` into `plataformas` + new class + new
  registry entry = a new platform. See `services/strategies/README.md`
  for the extension procedure + Phase 6 stub-replacement example.

## Phase 5 (planned, not yet shipped)

- `location.service.ts` — `posicion$` from `expo-task-manager` +
  `expo-location`. GPS only during active rides. **No entry point to
  reference yet**; this README will be updated when it lands.

## Colocated tests

- `services/__tests__/db.service.test.ts` — Phase 1.
- `services/__tests__/sync-queue.service.test.ts` — Phase 2.
- `services/__tests__/network.service.test.ts` — Phase 2.
- `services/__tests__/carrera.service.test.ts` — Phase 4 (PR #1).
- `services/strategies/__tests__/*.test.ts` — Phase 4 strategy unit tests.

Run via `bun test` or `bun test services/__tests__` from the repo root.

## Ownership

**OpenCode** (`agent/opencode`). Cross-domain rule (per
`docs/documento-maestro-agentes.md §1-5` + `docs/gitflow.md`):

- This directory may import from `data/sqlite/types.ts`, sibling
  services in this directory, and `bun:sqlite` / `expo-sqlite` (via
  the `db.service` facade).
- This directory MUST NOT import from `ui/` or top-level `tests/`.
- This directory MUST NOT be modified by Phase 3 (Pi territory).

Stage changes to this directory via `feature/<change>` branches off
`develop` per `docs/gitflow.md §3`. Each OpenSpec change = one branch
with the same name.
