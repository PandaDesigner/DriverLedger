# Proposal: add-platform-strategies

> Phase 4 of `docs/PRD-consolidado.md §8`. Lands the Strategy pattern for Uber / DiDi / InDrive trip registration referenced in `docs/RFC-001-arquitectura.md §Decisiones`, `docs/RFC-002-modelo-datos.md §Open-closed`, and `docs/RFC-003-logica-registro.md §Strategy`. Phase 3 (UI screens, Pi territory) consumes the Strategy interface contract this change publishes; Phase 6 (Uber API integration) replaces the `UberStrategy` stub body without touching the interface.

## Intent

Phase 4 turns the local-first write layer (Phase 1) and the sync queue (Phase 2) into a guided "auto-fill + one-tap confirm" registration flow per `docs/PRD-consolidado.md §4` and `docs/RFC-003-logica-registro.md §Confirmación de un toque`. Every Carrera write still lands first on SQLite through `services/carrera.repo.ts:66-139` (`upsertByTripId`), so Phase 4 cannot break the offline-first contract that Phase 1 froze and Phase 2 reads through `dbChange$` (per `openspec/specs/local-data-model/spec.md §local-rxjs-bridge`).

The deliverable is `services/strategies/` (Strategy interface + 3 concrete classes + boot-time registry + shared fees helpers), `services/carrera.service.ts` (orchestration layer that wires driver input → strategy → repo → audit log), colocated tests under `services/strategies/__tests__/` and `services/__tests__/carrera.service.test.ts`, an update to `services/README.md` that fixes the naming drift from Phase 1/2, and a new capability spec delta (`platform-strategies`) with 8 ADDED requirements.

## Why

- **`docs/RFC-003-logica-registro.md §Strategy`** names the per-platform Strategy pattern (`registrarCarrera`, `calcularComision`, `calcularGasolina`) — Phase 4 is the missing piece between Phase 1's local mirror and Phase 6's Uber API integration.
- **`docs/RFC-001-arquitectura.md §Open-closed`** mandates "agregar plataforma = INSERT en `plataformas`, no migración". The static strategy registry is the code-side counterpart that honours this: a new platform row + new strategy class + new registry entry, no schema change.
- **`docs/PRD-consolidado.md §4 + §8`** put Strategy at Phase 4 and name "confirmación de carrera (un toque)" as the modal contract (`docs/ui/views.md` line 109-117, M01). Phase 3's modal needs the `StrategySuggestion` interface contract to render `draft.*` fields + editable affordances. **Without this change Phase 3's modal types diverge from Phase 4's strategy output and the cross-domain integration breaks at PR merge.**
- **`docs/RFC-004-sincronizacion.md §Flujo 1`** requires every Carrera write to land first on SQLite. Phase 4's strategy output routes through `services/carrera.repo.ts:66-139`, never imports `expo-sqlite` directly (per `local-rls-facade`), and never enqueues manually — `dbChange$` auto-enqueue is structural (mirroring `services/sync-queue.service.ts:547-549` filter on `table ∉ {sync_queue, plataformas, posicion}`).
- **Bridge reuse**: `services/db.service.ts:139-157` exposes `carreras$` and `dbChange$`. `services/carrera.repo.ts:36-52` exposes `CarreraPayload` (the canonical write shape). `services/carrera.repo.ts:187-192` exposes `listPlataformas()`. Phase 4 consumes all three read-only — no changes to Phase 1's frozen modules.

## Scope

### In Scope

- `services/strategies/strategy.types.ts` — `PlatformStrategy`, `StrategySuggestInput`, `StrategySuggestion`, `StrategyContext` interface contracts (the cross-domain surface Phase 3 Pi imports).
- `services/strategies/registry.ts` — static `STRATEGY_REGISTRY: Record<string, PlatformStrategy>` populated at boot with `uber_api`, `didi_manual`, `indrive_form` (matches `data/migrations/0003_seeds.sql:24-34`). Throws on unknown keys.
- `services/strategies/uber.strategy.ts` — `UberStrategy` Phase 4 stub body: `suggest()` returns `oneTapCapable: false`, `confidence: 0`, `draft.fuente = 'manual'`. Phase 6 replaces the body without changing the interface.
- `services/strategies/didi.strategy.ts` — `DidiStrategy` paste-parser: parses notification/screenshot-style text into `StrategySuggestion` with editable `origen` / `destino` / `tarifa_bruta` / `distancia_km` / `duracion_min`; `draft.estado = 'completada'`, `draft.fuente = 'manual'`.
- `services/strategies/indrive.strategy.ts` — `InDriveStrategy` negotiated-fare paste-parser; same `confidence` + `editableFields` contract.
- `services/strategies/fees.ts` — shared helpers `calcularComision(tarifa_bruta, plataforma)` and `calcularGasolina(distanciaKm)`. Formula `comision = tarifa_bruta * plataformas.comision / 100` per `data/migrations/0003_seeds.sql:22-34`.
- `services/strategies/ui-labels.ts` — `metadata.ui_label` map (`Uber → "Modo API"`, `DiDi → "Modo manual (captura)"`, `InDrive → "Modo formulario"`); document the technical `tipo_estrategia` is machine-only per `discovery/tipo-estrategia-machine-only` (#1935).
- `services/strategies/index.ts` — barrel for `services/carrera.service.ts` and the cross-domain import surface Phase 3 Pi reads.
- `services/strategies/README.md` — open-closed extension rules + Phase 6 stub-replacement guide.
- `services/strategies/__tests__/{registry,uber.strategy,didi.strategy,indrive.strategy,fees}.test.ts` — colocated per Phase 1/2 precedent (`local-data-model-sqlite design AD-9`).
- `services/carrera.service.ts` — `CarreraService.confirmRegistration(driverId, plataformaId, input)` resolves strategy, calls `suggest`, returns `StrategySuggestion` to UI. On driver confirm, calls `carreraRepo.upsertByTripId(driverId, generatedTripId, draft)` (Phase 1 frozen) + writes `log_eventos(tipo = 'carrera.registered')` audit row only on the exceptional path (mirrors W-LOG-CONFLICT precedent at `services/sync-queue.service.ts:481-489`).
- `services/__tests__/carrera.service.test.ts` — in-memory SQLite integration test (mirrors `services/__tests__/sync-queue.service.test.ts:56-85` precedent).
- `services/README.md` — UPDATE to match actual shipped file names: `carrera.repo.ts`, `sync-queue.service.ts`, `network.service.ts` (not `CarreraService.ts`, `SyncService.ts`, `NetworkService.ts` PascalCase).
- `openspec/changes/add-platform-strategies/{proposal.md, design.md, tasks.md}` — the change folder.
- `openspec/changes/add-platform-strategies/specs/platform-strategies/spec.md` — new capability spec delta with 8 ADDED requirements.

### Out of Scope

- `ui/` and any top-level `tests/` directory (Pi territory; cross-domain rule per `docs/documento-maestro-agentes.md §1-5` + `docs/gitflow.md`).
- `services/db.service.ts`, `services/carrera.repo.ts`, `services/sync-queue.service.ts` — Phase 1 + Phase 2 frozen modules; Phase 4 consumes them read-only.
- `data/sqlite/{migrations,types}.ts`, `data/migrations/0003_seeds.sql` — no schema or seed changes. The `tipo_estrategia = 'uber_api'` key stays in the seed even though Phase 4 ships a stub body (per R-5).
- Phase 5 (`LocationService` / `posicion$` / `fuente = 'background'`) — separate change.
- Phase 6 (`UberStrategy` body replacement + Supabase transport concrete impl) — separate change.
- Phase 7 polish (E2E tests, error logging consolidation, coverage threshold unification) — separate change.
- "User adds platform" UI + dynamic discovery — explicitly out of scope per locked decision Q5. Adding a 4th platform requires a follow-up OpenSpec change.
- Notification-listener (`expo-notifications` / Android `NotificationListenerService`) — fragile, OS-permission heavy; not justified until DiDi notifications are confirmed useful (locked decision Q1).
- Adaptive polling / encrypted `metadata` / Realtime publication — Fase 7.
- Changing the `carreras$` bridge shape — Phase 1 freeze holds; Phase 3 Pi filters "today's carreras" in UI per `discovery/carreras-bridge-today-filter` (#1936).

> **Cross-domain rule (AD-10 reasserted)**: this change touches ONLY `services/strategies/**`, `services/carrera.service.ts`, `services/__tests__/{carrera.service,strategies/**}.test.ts`, `services/README.md`, and `openspec/changes/add-platform-strategies/`. Never `ui/`, never top-level `tests/`, never `data/`, never `services/db.service.ts`, never `services/carrera.repo.ts`, never `services/sync-queue.service.ts`. Enforced at `sdd-apply` pre-flight via `git diff develop --stat`.

## Capabilities

### New Capabilities

- `platform-strategies` — per-platform Strategy pattern (Uber / DiDi / InDrive) with paste-parser auto-fill + manual form fallback, type-driven static registry, and open-closed extension guide.
- `carrera-service` — orchestration layer that wires driver input → resolved strategy → canonical repo write → audit log on the exceptional path.

### Modified Capabilities

None.

### Removed Capabilities

None.

## Approach

Apply the 5 user-locked defaults from `sdd/driverledger/add-platform-strategies/explore` (#1933) + the interface decision (#1937). Each maps to an AD in `design.md`:

| Q | Locked default | Reference |
|---|----------------|-----------|
| **Q1** Auto-fill input source | **Paste from notification/screenshot** → strategy parses → if `confidence < 0.3` falls back to manual form. Notification listener deferred. PDF regex deferred to Phase 6. | AD-3 |
| **Q2** `UberStrategy` body in Phase 4 | **Stub** returning `confidence: 0`, `oneTapCapable: false`, `fuente = 'manual'` so Phase 6 can replace body without interface change. Open-closed preserved via `tipo: 'uber_api'` registry key. | AD-4 |
| **Q3** `calcularComision` + `calcularGasolina` location | **Shared helpers in `services/strategies/fees.ts`**. Formula identical for all three seeded (`comision = tarifa_bruta * plataformas.comision / 100`); strategy methods are thin pass-throughs if Phase 6 needs platform-specific overrides. | AD-5 |
| **Q4** `estado` lifecycle per platform | Uber = `activa → completada` (driver tap), DiDi/InDrive = `completada` on confirm. Encoded in each strategy's `suggest()` default and asserted in the spec scenario. | AD-6 |
| **Q5** Open-closed guarantee | **Static map registry** at boot (`STRATEGY_REGISTRY`). Adding a 4th platform = INSERT into `plataformas` + new OpenSpec change to add a strategy class + registry entry. "User adds platform" UI explicitly OUT OF SCOPE. | AD-7 |

Cross-cutting:

- **Interface is the cross-domain contract**: `services/strategies/strategy.types.ts` exports `PlatformStrategy`, `StrategySuggestion`, `StrategySuggestInput`, `StrategyContext`. Phase 3 Pi imports these as **types only** from `services/` (cross-domain rule: import types, never implementations). The same engram topic `sdd/driverledger/add-platform-strategies/interface` is the shared read-side for Pi.
- **All Carrera writes route through `carrera.repo.upsertByTripId`** (`services/carrera.repo.ts:66-139`). Strategy output must conform to `CarreraPayload` (`services/carrera.repo.ts:36-52`). Strategy NEVER imports `carrera.repo`; `CarreraService` calls both.
- **`CarreraService` never enqueues manually** — Phase 2's auto-enqueue subscription (`services/sync-queue.service.ts:547-549`) catches every `dbChange$` event emitted by `carreraRepo.upsertByTripId`. `CarreraService` does not import `sync-queue.service` either.
- **Audit log only on exceptional path** — `log_eventos(tipo = 'carrera.registered')` is written when (a) `suggest()` returns `confidence < 0.3` (parse fallback) or (b) `carreraRepo.upsertByTripId` throws (registration error). Mirrors W-LOG-CONFLICT precedent at `services/sync-queue.service.ts:481-489` (log the exceptional path, not the happy path).
- **Coverage target ≥ 80%** on `services/strategies/**` + `services/carrera.service.ts` (mirrors Phase 1 `local-test-coverage` and Phase 2 `services/sync-queue.service.ts` precedent).

### Proposed interface (published first; mirrored in spec.md `Source` block)

```typescript
// services/strategies/strategy.types.ts (public cross-domain contract)

import type { CarreraPayload } from '../carrera.repo';

/** Caller-supplied context (date, time, GPS hint if carrera is active). */
export interface StrategyContext {
  /** Driver-local calendar date, ISO YYYY-MM-DD. Strategy defaults to device clock. */
  fecha?: string;
  /** Device-local HH:mm, used by DiDi/InDrive timestamp extraction. */
  horaLocal?: string;
  /** True iff the driver is mid-trip (GPS Subject active). Phase 5. */
  carreraActiva?: boolean;
}

/** Raw driver input — paste of notification/screenshot text plus driver context. */
export interface StrategySuggestInput {
  raw: string;
  context: StrategyContext;
}

/** Strategy output — what the driver sees in M01 confirmation modal. */
export interface StrategySuggestion {
  /** Canonical write shape; conforms to CarreraPayload. */
  draft: CarreraPayload;
  /** 0..1; <0.3 forces UI to render the manual form (RFC-003 line 42 "Editar"). */
  confidence: number;
  /** Subset of CarreraPayload keys the modal exposes as editable before confirm. */
  editableFields: ReadonlyArray<keyof CarreraPayload>;
}

/** The Strategy interface — open-closed seam. Adding a strategy = new class + registry entry. */
export interface PlatformStrategy {
  /** Matches `plataformas.tipo_estrategia` (e.g. 'uber_api', 'didi_manual'). */
  readonly tipo: string;
  /** False in Phase 4 for all three; true = UI may skip the modal. */
  readonly oneTapCapable: boolean;
  suggest(input: StrategySuggestInput): Promise<StrategySuggestion>;
}
```

### Cross-agent coordination commitment

The **first commit** of Phase 4 publishes `services/strategies/strategy.types.ts` + the engram topic `sdd/driverledger/add-platform-strategies/interface` so Pi (Phase 3, separate branch) can `mem_get_observation` the contract before `sdd-apply` lands. Same "publish contract first, implement second" pattern used at Phase 1 → Phase 2 handoff.

## Open Questions

All 8 are resolved by user-locked defaults above (Q1-Q5) or by Phase 2 / Phase 1 precedent (Q6-Q8). Captured here for the proposal record:

| # | Question | Accepted (Q-locked default) | Alternative considered |
|---|----------|-----------------------------|------------------------|
| Q1 | Auto-fill input source | Paste from notification/screenshot + manual form fallback when `confidence < 0.3`. | Notification listener (OS permissions + battery) — rejected. PDF regex in Phase 4 — rejected (belongs to Phase 6 with Uber PDF OAuth). |
| Q2 | `UberStrategy` body in Phase 4 | Stub: `confidence: 0`, `oneTapCapable: false`, `fuente = 'manual'`. Phase 6 swaps the body. | Partial regex parser — fragile, not justified before Phase 6 negotiation. |
| Q3 | `calcularComision` + `calcularGasolina` | Shared helpers in `services/strategies/fees.ts` (`comision = tarifa_bruta * plataformas.comision / 100`); strategy methods are thin wrappers if Phase 6 needs override. | RFC-003 verbatim instance methods on each strategy — three implementations of the same formula. |
| Q4 | `estado` lifecycle | Uber = `activa → completada` (driver tap); DiDi / InDrive = `completada` on confirm. Encoded in each strategy's `suggest()` default. | Force all three to `completada` on first confirm (loses the active-trip distinction Uber drivers use to track in-progress rides). |
| Q5 | Open-closed guarantee | Static `STRATEGY_REGISTRY` at boot. Adding a 4th platform = INSERT into `plataformas` + new OpenSpec change + new strategy class + new registry entry. User-added-platform UI explicitly OUT OF SCOPE. | Dynamic discovery (`UberStrategy` ↔ `tipo_estrategia = 'uber_api'`) — same compile cost, looser compile-time guarantees. Runtime registration (YAGNI; strategies must be reviewed). |
| Q6 | PR budget at `sdd-tasks` | `ask-on-risk` is the cached delivery strategy. Orchestrator surfaces the forecast and asks the user. Working estimate is 600-800 LOC total. | Single-PR with `size:exception` — likely rejected at review. Auto-chain into PR #1 (registry + UberStrategy + CarreraService skeleton + log_eventos audit + types) + PR #2 (DidiStrategy + InDriveStrategy + fees + integration tests). |
| Q7 | `tipo_estrategia='uber_api'` seed handling | **Keep the seed string.** Open-closed promise is "the seed string is long-term". Phase 4 documents the stub in `services/strategies/README.md`. Do NOT ship a migration to flip to `'uber_manual'`. | Migrate the seed — couples Phase 4 to Postgres DDL changes (cross-domain; Phases 1 and 2 didn't touch it). |
| Q8 | Audit log policy for `carrera.registered` | Log ONLY on (a) `suggest()` returning `confidence < 0.3` (parse fallback) or (b) `carreraRepo.upsertByTripId` throwing. Mirror W-LOG-CONFLICT precedent at `services/sync-queue.service.ts:481-489`. | Log every successful registration — volume concerns; Pi's V04 dashboard doesn't need it; contradicts Phase 2's "log exceptional only" intent. |

## Risks

| # | Risk | Likelihood | Mitigation |
|---|------|------------|------------|
| R-1 | **Naming drift in `services/README.md`** — README references `CarreraService.ts`, `SyncService.ts`, `NetworkService.ts`, `LocationService.ts`; actual shipped names are `carrera.repo.ts`, `sync-queue.service.ts`, `network.service.ts`, `location.service.ts` (Fase 5). | Med | Fix alongside this change (in-scope); update README to match Phase 1/2 actual files + Phase 4's `strategies/` and `carrera.service.ts`. Closes `discovery/services-readme-drift` (#1934). |
| R-2 | **`tipo_estrategia` is machine-only** — UI (Phase 3 V04 platform-onboarding + M01 trip-confirmation) needs human-readable "Modo de conexión" copy per platform (`discovery/tipo-estrategia-machine-only` #1935). | Low-Med | Expose `services/strategies/ui-labels.ts` (hardcoded map); or accept `plataformas.metadata.ui_label` JSONB field once Phase 0a allows DDL. Map lives in `services/` so strategy ownership holds; cross-domain rule forces Phase 3 to use the map. |
| R-3 | **`carreras$` exposes full snapshot, not "today"** — RFC-003 line 26 names `carreras$` as "BehaviorSubject del día" but `services/db.service.ts:256-258` returns full snapshot. Phase 4 strategies don't need a today filter; Phase 3 V05 Dashboard does (`discovery/carreras-bridge-today-filter` #1936). | Low | Pi filters in UI via `carreras$.pipe(map(rows => rows.filter(r => r.fecha === today)))`. No change to Phase 1 frozen bridge; no Phase 4 spec delta on the bridge. |
| R-4 | **Phase 6 readiness** — `UberStrategy` stub must accept Phase 6 replacement without changing interface or `CarreraService` call sequence. | Low | Option B interface is forward-compatible by design (#1937); Phase 6 only swaps the body and adds a `metadata.platform_session_id` field via JSONB extension. Spec scenario covers the contract. |
| R-5 | **Strategy key drift** — `data/migrations/0003_seeds.sql:24-34` hardcodes `tipo_estrategia = 'uber_api'` which Phase 4 cannot fully honour. | Med | Keep the seed string; document the stub in `services/strategies/README.md` with a "Phase 6 will honour this `tipo`" note. Do NOT migrate the seed (Q7). Open-closed promise holds. |
| R-6 | **Audit log volume** — if `carrera.registered` logged on every successful registration, `log_eventos` rows duplicate the Carrera write. | Low | Log ONLY on (a) parse fallback and (b) repo error (Q8). Mirrors W-LOG-CONFLICT precedent. `log_eventos` rows stay rare and meaningful. |
| R-7 | **Cross-agent coordination with Phase 3 Pi** — if Pi's modal types diverge from `StrategySuggestion`, integration breaks at PR merge. | Med | **First commit** of Phase 4 publishes `services/strategies/strategy.types.ts` (interface + types) and engram topic `sdd/driverledger/add-platform-strategies/interface` for Pi to `mem_get_observation` before `sdd-apply`. Cross-domain rule forces Pi to import types only, never implementations. |
| R-8 | **`CarreraService` enqueue leak** — if a follow-up contributor adds `syncQueueService.enqueue(...)` inside `CarreraService.confirmRegistration`, auto-enqueue and explicit enqueue both enqueue the row. | Low | Lint rule + code review: `CarreraService` does not import `services/sync-queue.service.ts`. Phase 2's `dbChange$` subscription (`services/sync-queue.service.ts:547-549`) is the single funnel; any extra path breaks de-dup semantics. |
| R-9 | **Strategy parser false confidence** — DiDi / InDrive paste parsers may match junk text and produce a high-confidence `StrategySuggestion` with garbage data. The driver confirms a bad record. | Med | `confidence < 0.3` cap forces manual form. Additionally, regex anchors + required-field checks (e.g. `tarifa_bruta` must parse as a positive `number`) lower confidence on partial inputs. Ui shows the `editableFields` set so the driver can correct obvious garbage. Spec scenarios cover each parser's happy path + below-threshold path. |
| R-10 | **Coverage scope gap in `bunfig.toml`** — Phase 1's `bunfig.toml` may not include `services/strategies/**` + `services/carrera.service.ts` in its coverage glob. | Low | `sdd-apply` extends the glob as part of verification (mirrors Phase 2 G.3). Documented in `tasks.md`. |

## Rollback Plan

Forward-only. Phase 4 introduces no schema changes and no DB writes outside the existing `carrera.repo.upsertByTripId` path. Rollback steps:

1. Revert the merge commit on `develop` after merge.
2. `openspec archive --undo` removes `platform-strategies` from `openspec/specs/` and moves the change folder to `archive/`.
3. Any `CarreraRow` rows written by Phase 4 strategies (Uber stub via `fuente = 'manual'`) remain on device. They are real Carrera data with valid `metadata.platform_session_id = 'phase4-stub-pending-phase6'` markers; drivers can re-classify in a follow-up migration if needed.
4. Phase 3's modal that imported the deleted `strategy.types.ts` will fail to compile. **Cross-agent mitigation**: deletion of `strategy.types.ts` is staged with Pi before rollback so Pi can swap to its own placeholder types.

## Dependencies

- **Phase 1 (`local-data-model-sqlite`)** — merged into `develop`. Phase 4 consumes:
  - `services/db.service.ts:46-128` `LocalDatabase` interface + `getDb()` singleton.
  - `services/db.service.ts:139-157` `carreras$` + `dbChange$` Subjects.
  - `services/carrera.repo.ts:36-52` `CarreraPayload` (canonical write shape).
  - `services/carrera.repo.ts:66-139` `upsertByTripId` (idempotent write path).
  - `services/carrera.repo.ts:187-192` `listPlataformas()` (registry boot seeds).
  - `data/sqlite/types.ts:54-95` `CarreraFuente`, `CarreraEstado`, `CarreraRow`, `PlataformaRow`.
  - `data/migrations/0003_seeds.sql:24-34` three reference rows + `tipo_estrategia` keys.
  - `openspec/specs/local-data-model/spec.md §local-rls-facade + §local-rxjs-bridge`.
- **Phase 2 (`add-sync-queue`)** — merged into `develop`. Phase 4 consumes:
  - `services/sync-queue.service.ts:547-549` `dbChange$` filter that auto-enqueues Carrera writes (single funnel).
  - `W-LOG-CONFLICT` precedent at `services/sync-queue.service.ts:481-489` (Phase 4 audit row mirrors that pattern).
- **No new runtime deps**. `services/strategies/**` and `services/carrera.service.ts` import only `rxjs` (already shared with `db.service.ts`) and the Phase 1 types. No `expo-sqlite` import outside `db.service.ts`.
- **Bun test runner** for `services/strategies/__tests__/**` + `services/__tests__/carrera.service.test.ts`.
- **Phase 3 (parallel work, Pi's branch)** — informs the contract only. Phase 4 does not depend on Phase 3 to merge first.

## Success Criteria

- [ ] `services/strategies/strategy.types.ts` exports `PlatformStrategy`, `StrategySuggestion`, `StrategySuggestInput`, `StrategyContext`; importable from `ui/` as types-only (`import type`).
- [ ] `services/strategies/registry.ts` exposes `STRATEGY_REGISTRY` resolving all three seeded `tipo_estrategia` keys (`uber_api`, `didi_manual`, `indrive_form`); throws `UnknownStrategyError` on unknown keys.
- [ ] `UberStrategy.suggest()` returns `oneTapCapable: false`, `confidence: 0`, `draft.fuente = 'manual'`; satisfies `platform-strategy-uber-stub` spec scenario.
- [ ] `DidiStrategy.suggest()` and `InDriveStrategy.suggest()` parse paste text into `StrategySuggestion` with `confidence: 0..1`; below `0.3` the modal falls back to manual form; editable fields include `origen` / `destino` / `tarifa_bruta` / `distancia_km` / `duracion_min`.
- [ ] `CarreraService.confirmRegistration(driverId, plataformaId, input)` resolves the strategy, calls `suggest`, returns `StrategySuggestion` to UI.
- [ ] On driver confirm, one `carreras` row exists with the right `fuente` + `estado` (Uber = `activa → completada`; DiDi / InDrive = `completada`); `dbChange$` auto-enqueue picks it up via `services/sync-queue.service.ts:547-549`.
- [ ] `log_eventos(tipo = 'carrera.registered')` is written ONLY on (a) `confidence < 0.3` or (b) `carreraRepo.upsertByTripId` throwing — mirrors W-LOG-CONFLICT precedent.
- [ ] `CarreraService` does not import `services/sync-queue.service.ts` and does not enqueue manually (single funnel preserved).
- [ ] Adding a 4th platform requires: INSERT into `plataformas` + new OpenSpec change to add a strategy class + registry entry.
- [ ] `services/strategies/README.md` documents the open-closed extension flow with a Phase 6 example.
- [ ] `services/README.md` matches the actual file names (closes `discovery/services-readme-drift` #1934).
- [ ] Coverage ≥ 80% on `services/strategies/**` + `services/carrera.service.ts`.
- [ ] `services/strategies/__tests__/{registry,uber.strategy,didi.strategy,indrive.strategy,fees}.test.ts` and `services/__tests__/carrera.service.test.ts` exit 0 via `bun test` from repo root.
- [ ] `openspec validate add-platform-strategies --strict` passes.
- [ ] `git diff develop --stat` shows zero files under `ui/`, top-level `tests/`, `data/`, `services/db.service.ts`, `services/carrera.repo.ts`, or `services/sync-queue.service.ts`.
- [ ] First commit publishes `services/strategies/strategy.types.ts` + engram topic `sdd/driverledger/add-platform-strategies/interface` for Pi (Phase 3) `mem_get_observation` consumption.

## Notes

- **No code change to Phase 1 / Phase 2 frozen modules.** `services/db.service.ts`, `services/carrera.repo.ts`, `services/sync-queue.service.ts` stay byte-identical. Phase 4 is a **pure addition** plus `services/README.md` drift fix.
- **No schema change.** `data/migrations/0003_seeds.sql` stays untouched; the `tipo_estrategia = 'uber_api'` seed remains (locked decision Q7). Document the stub in `services/strategies/README.md` per R-5.
- **No UI surface.** Phase 3 Pi consumes the contract types via TypeScript imports + engram topic. Phase 4 does not log to console beyond `console.warn` for the `UnknownStrategyError` path (Fase 7 may consolidate logging). No `Alert`, no `Toast`, no UI Subject.
- **`confidence < 0.3` threshold** comes from `docs/RFC-003-logica-registro.md` line 42 — drivers see the manual form when the parser can't lock in high confidence. The threshold is a constant exported from `services/strategies/registry.ts` so tests can assert the exact value.
- **`CarreraPayload` is the only canonical write shape** (`services/carrera.repo.ts:36-52`). Strategies produce it directly via `suggest()`; `CarreraService` adds the `trip_id` (deterministic UUID) + passes through. Strategy output never mutates the payload — `editableFields` declares intent, not mutation.
- **PR split decision** lives at `sdd-tasks` time. Working estimate: PR #1 = registry + UberStrategy + CarreraService skeleton + log_eventos audit + `strategy.types.ts` (smallest coherent slice, ~300 LOC). PR #2 = DidiStrategy + InDriveStrategy + fees + integration tests (~500 LOC). Orchestrator pre-flights user under cached `delivery_strategy = 'ask-on-risk'`.
- **Phase 6 surface** is `UberStrategy.suggest()` body swap + a `metadata.platform_session_id` JSONB extension. The interface accepts this without change. `CarreraService.confirmRegistration` is unchanged.
- **Update tasks.md** with `[x]` flips as work lands — conventional commits, one per task group.