# Design — add-platform-strategies

> Source of truth: `docs/RFC-001-arquitectura.md §Open-closed`, `docs/RFC-002-modelo-datos.md §Open-closed`, `docs/RFC-003-logica-registro.md §Strategy + §Confirmación de un toque`, `docs/RFC-004-sincronizacion.md §Flujo 1`, `openspec/specs/data-model/spec.md §carreras-fuente-check + §carreras-estado-check`, `openspec/specs/local-data-model/spec.md §local-rls-facade + §local-rxjs-bridge`, `openspec/specs/sync-queue/spec.md §sync-rls-facade-mirror`, and the locked defaults in `sdd/driverledger/add-platform-strategies/proposal` (#1938) + interface contract in `sdd/driverledger/add-platform-strategies/interface` (#1939). The first commit of this change publishes `services/strategies/strategy.types.ts` + engram topic `sdd/driverledger/add-platform-strategies/interface` so Phase 3 Pi (separate branch) can `mem_get_observation` the contract before `sdd-apply` lands.

## 1. Architectural decisions

### AD-1 Strategy interface — `suggest(input)` over RFC-003 verbatim three-method contract

**Decision**: Phase 4 ships the Strategy pattern with a single async method — `suggest(input: StrategySuggestInput): Promise<StrategySuggestion>` — instead of RFC-003 §Strategy's verbatim `registrarCarrera() / calcularComision() / calcularGasolina()` triplet. The shared fee and gasoline math lives in `services/strategies/fees.ts` as pure helpers, not as instance methods.

**Context**: RFC-003 §Strategy line 3-11 names three methods per strategy. Two of the three — `calcularComision(tarifaBruta, plataforma)` and `calcularGasolina(distanciaKm)` — share the exact same formula across all three seeded platforms (the only difference is the `comision` value at `data/migrations/0003_seeds.sql:24-34`; see Decision Q3 in the proposal at #1938 and explore §Design space at #1933). Three implementations of the same formula are dead code. The third method, `registrarCarrera`, conflates three concerns: parse, suggest, and write. Splitting it into pure `suggest()` + `CarreraService.commitSuggestion()` lets the strategy stay a pure function of `(raw, context)` with no I/O, which is forward-compatible with Phase 6's Uber OAuth2 stream (see R-4 in the proposal).

**Consequences**:
- The interface published in `services/strategies/strategy.types.ts` (`PlatformStrategy`, `StrategySuggestion`, `StrategySuggestInput`, `StrategyContext`) is the **open-closed seam**; adding a 4th platform = new class + new registry entry, no interface change. Spec scenario `platform-strategy-interface §add new strategy does not change interface` is satisfied.
- `confidence: number` + `editableFields: ReadonlyArray<keyof CarreraPayload>` (both in `StrategySuggestion`) replace RFC-003 line 42's implicit "always editable" — the modal can render the auto-filled preview when `confidence >= 0.3` and fall back to the manual form when `confidence < 0.3` (spec scenario `platform-strategy-uber-stub §stub fuerza formulario manual en la UI`).
- `oneTapCapable: boolean` on the strategy instance lets Phase 6 (Uber API) flip the flag without interface change, and lets Phase 3 Pi (V05 Dashboard per `docs/ui/views.md` line 41-49) skip the modal for `oneTapCapable === true` strategies in the future. In Phase 4 every strategy ships `oneTapCapable: false`.
- Cross-domain import safety: `services/strategies/strategy.types.ts` exports `import type { CarreraPayload } from '../carrera.repo'`. Phase 3 Pi imports the *types only*; no runtime import of `services/` reaches `ui/`. See AD-8.

**Source**: `docs/RFC-003-logica-registro.md §Strategy` (the verbatim three-method surface), `docs/RFC-001-arquitectura.md §Open-closed` (open-closed mandate), `services/carrera.repo.ts:36-52` (`CarreraPayload`), `sdd/driverledger/add-platform-strategies/proposal` (Decision Q1, Q3), `sdd/driverledger/add-platform-strategies/explore` (Design space §Interface shape options, §Recommended Option B), `sdd/driverledger/add-platform-strategies/interface` (#1939, the published contract).

### AD-2 Module layout under `services/strategies/`

**Decision**: New directory `services/strategies/` with one file per concern, plus colocated `__tests__/`. Strategies import only from `services/strategies/strategy.types.ts` (sibling), `data/sqlite/types.ts` (type definitions), and the public surface of `services/db.service.ts` (read-only). The `services/carrera.service.ts` orchestration class lives at `services/` root (sibling to `carrera.repo.ts`), not inside `services/strategies/` — orchestration is not a strategy concern.

**Context**: Phase 1's `services/` precedent uses kebab-case + suffix (`.service.ts`, `.repo.ts`, `.transport.ts`); Phase 2 extends that with `sync-queue.service.ts`. Phase 4 follows: `carrera.service.ts` (the orchestration layer), `strategies/<name>.strategy.ts` (per-platform), `strategies/registry.ts` (the static map), `strategies/fees.ts` (shared helpers), `strategies/confidence.ts` (the threshold constant), `strategies/parse.ts` (input normalization), `strategies/ui-labels.ts` (the human-readable "Modo de conexión" map per R-2 in the proposal), `strategies/strategy.types.ts` (the cross-domain contract), `strategies/index.ts` (barrel for the cross-domain import surface), and `strategies/README.md` (extension guide + Phase 6 stub note). Tests live colocated under `__tests__/` per Phase 1 AD-9 (`openspec/changes/archive/2026-10-11-local-data-model-sqlite/design.md §AD-9`).

**Consequences**:
- File-per-strategy makes Phase 6's body swap of `UberStrategy` a one-file change with no neighbours touched; spec scenario `platform-strategy-open-closed §open-closed permitte agregar plataforma via INSERT + OpenSpec change` is satisfied.
- `services/carrera.service.ts` is a **sibling** to `services/carrera.repo.ts` (Phase 1 frozen), not a wrapper. `carrera.service` calls `carreraRepo.upsertByTripId(...)`; the repo is never extended or re-implemented. Phase 1's AD-8 (`local-data-model-sqlite/design.md §AD-8 Upsert path`) is reasserted — the canonical write path stays in `carrera.repo.ts:66-139`.
- `services/strategies/index.ts` barrel re-exports the *types* (`StrategySuggestion`, `PlatformStrategy`, `StrategySuggestInput`, `StrategyContext`) and the constant exports (`CONFIDENCE_THRESHOLD`, `STRATEGY_REGISTRY` for the single entry point `getStrategyByTipo`). It does **not** re-export the strategy classes — `ui/` must never reach into implementations (AD-8).
- The `__tests__/` directory is colocated (not at `services/__tests__/strategies/`); this matches the Phase 1 precedent at `data/sqlite/__tests__/` and the Phase 2 pattern at `services/__tests__/` for the *service* tests, but per-strategy tests naturally live with the file under test.

**Source**: `openspec/changes/archive/2026-10-11-local-data-model-sqlite/design.md §AD-1` (file layout precedent), `openspec/changes/archive/2026-10-11-add-sync-queue/design.md §AD-1` (services-only layout), `services/carrera.repo.ts:187-192` (`listPlataformas`), `data/migrations/0003_seeds.sql:24-34` (the three seeded `tipo_estrategia` keys), `sdd/driverledger/add-platform-strategies/proposal` (Scope §In Scope).

### AD-3 Static boot-time registry — `STRATEGY_REGISTRY: Readonly<Record<TipoEstrategia, PlatformStrategy>>`

**Decision**: `services/strategies/registry.ts` exports a frozen `STRATEGY_REGISTRY` object literal populated at module-load time with exactly three keys: `uber_api`, `didi_manual`, `indrive_form`. Lookups go through `getStrategyByTipo(tipo: string): PlatformStrategy`, which throws a typed `UnknownStrategyError` on unknown keys. The object is `Object.freeze`d; runtime mutation is impossible (spec scenario `platform-strategy-registry §registry es estatico al boot`).

**Context**: Two pluggability mechanisms were considered in the explore (static map vs. dynamic discovery via naming convention). The static map is the project's precedent for any "ship a new module" surface — `data/sqlite/migrations.ts` does not auto-discover migration files; each is listed explicitly. Dynamic discovery has the same compile cost (the new class still has to be authored) but looser compile-time guarantees: a typo in `tipo_estrategia` is caught at `INSERT INTO plataformas` time, not at `getStrategyByTipo` time. The static map surfaces the mismatch at boot. The "user adds platform at runtime" UI is explicitly out of scope (locked decision Q5; spec scenario `platform-strategy-open-closed §user-added-platform UI es out of scope`).

**Consequences**:
- Open-closed guarantee is *code-side* (adding a strategy = new class + new entry in `STRATEGY_REGISTRY` + new OpenSpec change reviewed at PR time), not data-side. `data/migrations/` is untouched; the seed at `data/migrations/0003_seeds.sql:24-34` remains byte-identical (AD-6).
- `getStrategyByTipo` throws `UnknownStrategyError` with the offending `tipo` in the message. The error is `console.warn`-logged from `CarreraService.getStrategyByTipo` (no UI `Alert`, no `Toast` — Fase 7 may consolidate logging per the proposal §Notes).
- `STRATEGY_REGISTRY` is `as const` + `Object.freeze`d; TypeScript narrows the key set to `'uber_api' | 'didi_manual' | 'indrive_form'` (defined as a string-literal union in `data/sqlite/types.ts` via a follow-up Phase 4 spec — see open items). Tests assert the registry resolves all three keys and throws on unknown keys (AD-12).
- The registry is the **single source of truth** for what `tipo_estrategia` strings resolve to a strategy. `CarreraService.confirmRegistration` looks up the strategy from the registry after resolving the `plataformaId` to a `PlataformaRow` via `carreraRepo.listPlataformas()` (AD-4, DQ-4).

**Source**: `docs/RFC-001-arquitectura.md §Open-closed`, `docs/RFC-002-modelo-datos.md §Open-closed`, `data/sqlite/migrations.ts` (the project's "no auto-discovery" precedent), `sdd/driverledger/add-platform-strategies/proposal` (Decision Q5, R-1, R-5), `sdd/driverledger/add-platform-strategies/explore` (Design space §Pluggability mechanism).

### AD-4 `CarreraService` orchestration layer (sibling of `carreraRepo`)

**Decision**: New class `CarreraService` at `services/carrera.service.ts` (sibling of `services/carrera.repo.ts`, NOT a wrapper). Public surface:

```typescript
class CarreraService {
  /** Resolve plataformaId → estrategia → suggest → StrategySuggestion (no DB write). */
  confirmRegistration(
    driverId: string,
    plataformaId: string,
    input: StrategySuggestInput,
  ): Promise<StrategySuggestion>;

  /** Persist a confirmed suggestion. Writes one `carreras` row + audit on exceptional path. */
  commitSuggestion(
    driverId: string,
    suggestion: StrategySuggestion,
    tripId?: string,
  ): Promise<CarreraRow>;

  /** Re-export of `carreraRepo.listPlataformas()` — single entry point for UI. */
  listPlataformas(): Promise<PlataformaRow[]>;

  /** Expose the registry look-up so tests and the service can assert. */
  getStrategyByTipo(tipo: string): PlatformStrategy;
}
```

**Context**: Phase 1 froze `carreraRepo` and explicitly stated strategies would be a sibling layer (explore observation #1933 §"Strategy is NOT invoked in `carrera.repo.ts`"). `CarreraService` is the only layer that calls both — `carreraRepo` for I/O, `STRATEGY_REGISTRY` for the strategy. The class holds the registry reference (frozen) for test injection. `confirmRegistration` returns the suggestion (no DB write); the UI shows M01; on driver tap the UI calls `commitSuggestion`. This split is the answer to **DQ-3** (where does `commitSuggestion` live): option (a) inside `CarreraService` — *chosen*. Option (b) UI calls `carreraRepo.upsertByTripId` directly was rejected because it would scatter the audit-log policy (AD-5) across every modal and break the "single write path" invariant. The split is also the answer to **DQ-2** (class vs. module): a class with frozen instance state (the registry) keeps test ergonomics — `new CarreraService().confirmRegistration(...)` reads cleanly in tests, and DI for an alternate registry is a constructor argument.

**Consequences**:
- `CarreraService` does **not** emit `dbChange$` directly. The repo's `upsertByTripId` (Phase 1 AD-8) is the only writer; `emitAfterWrite` at `services/carrera.repo.ts:218-236` is the only emitter. The auto-enqueue subscription at `services/sync-queue.service.ts:547-549` catches every Carrera write structurally (spec scenario `carrera-service-orchestration §CarreraService never enqueues manually`).
- `CarreraService` does **not** import `services/sync-queue.service.ts`. Lint + code review enforces this (R-8 in the proposal). The `git diff develop --stat` pre-flight at `sdd-apply` would also catch it.
- `commitSuggestion` generates a `tripId` if the caller doesn't supply one (default: `crypto.randomUUID()`). The Carrera row is upserted by `(driverId, tripId)` per Phase 1's `UNIQUE(driver_id, trip_id)` constraint. This keeps the upsert idempotent: a re-confirm (driver taps the same M01 twice) produces one row, not two.
- `listPlataformas` re-exports `carreraRepo.listPlataformas` so Phase 3 Pi has **one** entry point: `import { CarreraService } from 'services/carrera.service'`. The UI never imports `carreraRepo` directly (cross-domain rule, AD-10).
- The service holds no mutable state beyond the frozen registry; the class is essentially a static namespace. Tests can construct `new CarreraService()` without ceremony.

**Source**: `services/carrera.repo.ts:66-139, 187-192, 218-236` (the repo surface and the only legal `dbChange$` emitter), `services/sync-queue.service.ts:547-549` (auto-enqueue filter), `openspec/changes/archive/2026-10-11-add-sync-queue/design.md §AD-6` (enqueue funnel invariant), `openspec/changes/archive/2026-10-11-local-data-model-sqlite/design.md §AD-8` (upsert path), `sdd/driverledger/add-platform-strategies/explore` (§Where to invoke, §Integration points).

### AD-5 `log_eventos` audit policy mirrors W-LOG-CONFLICT (log only on exceptional path)

**Decision**: `CarreraService.commitSuggestion` writes a `log_eventos(tipo = 'carrera.registered')` row ONLY on the exceptional path: (a) `suggestion.confidence < 0.3` (the driver fell back to manual form), OR (b) `carreraRepo.upsertByTripId` throws (registration error). Happy-path confirmations (high confidence + clean write) emit no `log_eventos` row.

**Context**: Phase 2's `W-LOG-CONFLICT` precedent at `services/sync-queue.service.ts:481-489` writes one `log_eventos(tipo = 'sync.conflict')` row when the local row is dropped because remote is fresher. The intent is "audit the exceptional path, not the happy path" — `log_eventos` rows stay rare and meaningful. Phase 4 mirrors that intent for `carrera.registered`: every successful registration would otherwise duplicate the `carreras` write in the audit log, and the dashboard (Phase 3 V05) doesn't need a flood of happy-path entries (R-6 in the proposal). The metadata payload distinguishes the two exceptional causes: `{ fallback: 'manual-form' }` for the low-confidence case, `{ error: '<message>' }` for the write-failure case. Both are inserted via the same `LocalDatabase` interface (`services/db.service.ts:46-55`) — never raw `expo-sqlite` — preserving the `local-rls-facade` contract (spec scenario `platform-strategy-audit-log §writes de CarreraService van por la facade`).

**Consequences**:
- The audit policy is **enforced inside `CarreraService.commitSuggestion`**, not in the strategy. The strategy is a pure function; it has no DB access. This keeps the "strategies are pure" invariant and keeps the policy in one place.
- The dot-namespaced `tipo` (`carrera.registered`) follows the project pattern (`sync.conflict`, `carrera.registered`). Fase 7 may consolidate logging to a shared `LogService`; for now the inline `INSERT INTO log_eventos` route is the established pattern (spec scenario `platform-strategy-audit-log §taxonomia audit row es consistente con Phase 2`).
- The error-path audit row is written **before** the exception propagates, so a thrown error in `commitSuggestion` is still visible in `log_eventos` (spec scenario `platform-strategy-audit-log §error de registro audita en log_eventos`). The test asserts the audit row exists even when the repo throws.
- No console output beyond `console.warn` for `UnknownStrategyError` (Fase 7 may consolidate). No `Alert`, no `Toast`, no UI Subject — per the proposal §Notes.

**Source**: `services/sync-queue.service.ts:481-489` (W-LOG-CONFLICT precedent), `services/db.service.ts:46-55` (LocalDatabase facade), `openspec/specs/local-data-model/spec.md §local-rls-facade`, `sdd/driverledger/add-platform-strategies/proposal` (Decision Q8, R-6, R-8), `openspec/changes/add-platform-strategies/specs/platform-strategies/spec.md` requirement `platform-strategy-audit-log`.

### AD-6 `tipo_estrategia='uber_api'` seed stays; no migration

**Decision**: The seed row at `data/migrations/0003_seeds.sql:24-34` is byte-identical in Phase 4. The `tipo_estrategia = 'uber_api'` string stays even though Phase 4 ships a stub `UberStrategy` body (open-closed promise holds: the seed string is the long-term identifier). The stub is documented in `services/strategies/README.md` under a "Phase 6 will honour this `tipo`" note. No migration is added in Phase 4 to flip the seed to `'uber_manual'`.

**Context**: Migrating the seed would couple Phase 4 to Postgres DDL changes (cross-domain breach: Phases 1 and 2 did not touch `data/migrations/`). The seed's `tipo_estrategia` is the **code-side** identifier that the registry keys on; flipping it would force a parallel code change in `STRATEGY_REGISTRY` and a Phase 3 Pi import. Net cost: zero upside, two diffs to coordinate. The open-closed principle in `docs/RFC-001-arquitectura.md` and `docs/RFC-002-modelo-datos.md` is about *adding* platforms, not renaming the `tipo` for an existing one. The stub body's contract (`fuente = 'manual'`, `confidence: 0`, `oneTapCapable: false`) is what Phase 6 swaps without touching the registry key (R-4, R-5 in the proposal).

**Consequences**:
- `data/migrations/0003_seeds.sql` is not touched in this change. `sdd-apply` pre-flight via `git diff develop --stat` aborts on any `data/migrations/` path (R-5 + the proposal §Cross-domain rule reasserted).
- `services/strategies/README.md` documents the Phase 6 contract: "When Phase 6 lands, `UberStrategy.suggest` will be replaced with the OAuth2 trip-stream body. The `tipo: 'uber_api'` registry key and the `PlatformStrategy` interface are unchanged; only the `suggest()` body swaps." This is the open-closed extension note Phase 6 contributors will read.
- The `metadata.api_supported: true` field on the Uber row at `data/migrations/0003_seeds.sql:24-26` is honoured at the data layer (Phase 0a) but ignored by the Phase 4 stub. Phase 6 will read it to decide whether to fall back to manual form if OAuth2 fails. This is forward-compatible without a Phase 4 change.

**Source**: `data/migrations/0003_seeds.sql:24-34` (the three reference rows), `docs/RFC-001-arquitectura.md §Open-closed`, `docs/RFC-002-modelo-datos.md §Open-closed`, `sdd/driverledger/add-platform-strategies/proposal` (Decision Q7, R-5).

### AD-7 Per-platform `estado` rule (Uber=`activa → completada`; DiDi/InDrive=`completada` on confirm)

**Decision**: Each strategy's `suggest()` declares `draft.estado` in its returned `StrategySuggestion`. `UberStrategy.suggest` returns `draft.estado = 'activa'` (the driver transitions `activa → completada` via a separate confirm action — see spec scenario `carrera-estado-lifecycle §Uber sugerencia arranca en activa`). `DidiStrategy.suggest` and `InDriveStrategy.suggest` return `draft.estado = 'completada'` (the notification/screenshot is post-trip, so the carrera is already complete on confirm — see spec scenarios `carrera-estado-lifecycle §DiDi confirmacion inicial es completada` and `§InDrive confirmacion inicial es completada`). `CarreraService` does **not** enforce or override `draft.estado`; the strategy is the platform expert.

**Context**: Locked decision Q4 in the proposal (#1938) maps platform reality on the road: Uber drivers in Medellín use the in-progress active/complete distinction to track an ongoing ride (they start the trip on the app, then complete it on our modal); DiDi and InDrive notifications arrive after the trip is finished, so the first confirm is already the final state. Encoding the lifecycle in the strategy (not in the service) means a future platform that needs `cancelada` on confirm (e.g. a platform that emits a "trip cancelled" notification) declares its own `draft.estado` without changing `CarreraService` (forward-compat, R-4). The `CHECK (estado IN ('activa','completada','cancelada'))` constraint at the schema level (`openspec/specs/data-model/spec.md §carreras-estado-check`) and the mirrored `local-carreras-estado-check` at SQLite (`data/sqlite/types.ts:54` + `data/migrations/0001_init_schema.sql`) reject any other value, so the strategy's choice is constrained (spec scenario `carrera-estado-lifecycle §CHECK constraint cumple carreras-fuente-check`).

**Consequences**:
- The `CarreraEstado` type union at `data/sqlite/types.ts:54` is the single source of truth. Strategies produce `'activa' | 'completada' | 'cancelada'`; nothing else.
- The per-strategy `draft.estado` is captured in the registry test: `getStrategyByTipo('uber_api').suggest(input).draft.estado === 'activa'`, `getStrategyByTipo('didi_manual').suggest(input).draft.estado === 'completada'`, `getStrategyByTipo('indrive_form').suggest(input).draft.estado === 'completada'`. The test fails if a future strategy change accidentally flips the default.
- For Uber, the M01 modal renders an explicit "Complete trip" CTA (Phase 3 Pi's responsibility) that calls `CarreraService.commitSuggestion` with a modified `suggestion` (or a second `confirmRegistration`-style call) — out of scope for Phase 4 design but documented here so Phase 3 Pi's modal contract is clear.

**Source**: `data/sqlite/types.ts:54` (`CarreraEstado` type), `data/migrations/0001_init_schema.sql` (CHECK constraint), `openspec/specs/data-model/spec.md §carreras-estado-check`, `docs/RFC-003-logica-registro.md §Confirmación de un toque`, `sdd/driverledger/add-platform-strategies/proposal` (Decision Q4), `sdd/driverledger/add-platform-strategies/explore` (Design space §Per-platform differences).

### AD-8 Cross-domain read-only contract (types-only import from `services/` to `ui/`)

**Decision**: `services/strategies/strategy.types.ts` and `services/carrera.service.ts` (the class surface) are the **only** cross-domain surface. Phase 3 Pi imports via `import type { StrategySuggestion, PlatformStrategy, StrategySuggestInput, StrategyContext, CarreraPayload } from 'services/strategies/strategy.types'` and `import type { CarreraService } from 'services/carrera.service'` — types only, no runtime import of `services/strategies/**` reaches `ui/`. The `strategy.types.ts` file is the FIRST commit of Phase 4 (alongside the engram topic `sdd/driverledger/add-platform-strategies/interface`, observation #1939) so Pi can `mem_get_observation` the contract before `sdd-apply` lands.

**Context**: Cross-domain rule per `docs/documento-maestro-agentes.md §1-5` and `docs/gitflow.md` (reasserted in Phase 1 AD-10 and Phase 2 AD-10). The cross-domain rule is bidirectional: `services/` must not import from `ui/` (preserves the OpenCode/Pi split), and `ui/` must not reach into the `services/` implementation surface (preserves the open-closed seam — Pi's modal binds to the *interface*, not to the concrete strategy classes). The `import type` keyword in TypeScript erases at compile time; the bundler drops the runtime import. This is the same "publish contract first, implement second" pattern used at the Phase 1 → Phase 2 handoff (engram topic #1939).

**Consequences**:
- `services/strategies/index.ts` re-exports the *types* (`StrategySuggestion`, `PlatformStrategy`, `StrategySuggestInput`, `StrategyContext`) and the *constants* (`CONFIDENCE_THRESHOLD`, `STRATEGY_REGISTRY` for single entry). It does **not** re-export the strategy classes (`UberStrategy`, `DidiStrategy`, `InDriveStrategy`); a Phase 3 Pi contributor who types `import { UberStrategy } from 'services/strategies'` gets a TypeScript error and is forced to import through `CarreraService` (R-7 in the proposal).
- `services/strategies/strategy.types.ts` itself imports types only from `services/carrera.repo` (`CarreraPayload`). The runtime graph from `ui/` ends at `strategy.types.ts`; the runtime graph from `strategy.types.ts` ends at `carrera.repo.ts` types — no value-level imports cross the domain boundary.
- The first commit of Phase 4 publishes `strategy.types.ts` + the engram topic. The engram topic is the *read-side* for any agent that needs the contract without checking out the branch. The repo file is the *authoritative* surface for any contributor checking out the branch. Both stay in sync (the orchestrator updates the engram topic when the file changes; the file is the source of truth).
- Tests for the cross-domain rule live in the integration test (`services/__tests__/carrera.service.test.ts`): assert that the `carreraService` instance exposes the same `tipo` strings the registry exports, and that the `carreraRepo.upsertByTripId` is called with a `CarreraPayload` conforming to the spec's `StrategySuggestion.draft` shape.

**Source**: `docs/documento-maestro-agentes.md §1-5`, `docs/gitflow.md §3` (single-change / single-branch / cross-domain audit), `openspec/changes/archive/2026-10-11-local-data-model-sqlite/design.md §AD-10`, `openspec/changes/archive/2026-10-11-add-sync-queue/design.md §AD-10`, `sdd/driverledger/add-platform-strategies/proposal` (R-7, Cross-agent coordination commitment), `sdd/driverledger/add-platform-strategies/interface` (#1939, the published contract).

### AD-9 Fees and gasoline as shared helpers in `fees.ts` (NOT strategy instance methods)

**Decision**: `services/strategies/fees.ts` exports two pure functions:

```typescript
/** comision = tarifa_bruta * plataformas.comision / 100 */
export function calcularComision(tarifaBruta: number, plataforma: PlataformaRow): number;

/** placeholder for per-platform consumption tables; Phase 6 may override per-platform. */
export function calcularGasolina(distanciaKm: number, plataforma: PlataformaRow): number;
```

`calcularComision` is the canonical formula for all three seeded platforms (per `data/migrations/0003_seeds.sql:24-34` — `Uber 25.00`, `DiDi 20.00`, `InDrive 18.00` are the only differences). `calcularGasolina` is a placeholder that returns `0` for Phase 4; Phase 6 may add per-platform consumption tables (`metadata.gasolina_km_per_litro`) without changing the function signature.

**Context**: RFC-003 §Strategy line 3-11 names `calcularComision` and `calcularGasolina` as strategy instance methods. Decision Q3 in the proposal (#1938) and explore §Design space §Interface shape options at #1933 both recommend shared helpers — the math is the same; the only variable is the per-platform `comision` value at the seed. The `calcularGasolina` placeholder is honest about Phase 4 not having per-platform consumption data; Phase 6 can extend the helper signature with optional `metadata` overrides without a Phase 4 change. Putting these helpers in `fees.ts` (not in the strategies) means the same function is called from every strategy's `suggest()` body — no duplication, single test target.

**Consequences**:
- Each strategy's `suggest()` calls `calcularComision(draft.tarifa_bruta, plataforma)` to fill `draft.comision`. The strategy doesn't implement the formula; it looks up `plataforma` from the context (or from `carreraRepo.listPlataformas()` resolved earlier in the orchestration) and delegates.
- `calcularGasolina` returns `0` in Phase 4. The Carrera row's `gasolina` column is `numeric(12,2)` with `NOT NULL DEFAULT 0` (mirrored at SQLite per `data/sqlite/types.ts:84`); the helper's return is the only place that value is computed.
- `fees.ts` is **pure** — no I/O, no `Date.now()`, no `Math.random()`. Tests are deterministic (no clock injection needed).
- Phase 6's per-platform override (e.g. Uber has a different consumption table per `metadata.gasolina_km_per_litro`) lives in `fees.ts` as an optional second overload: `calcularGasolina(distanciaKm, plataforma)` checks `plataforma.metadata.gasolina_km_per_litro` if present, otherwise returns the default. No strategy class changes.

**Source**: `data/migrations/0003_seeds.sql:24-34` (per-platform `comision` values), `data/sqlite/types.ts:84` (`gasolina: number; // numeric(12,2)`), `sdd/driverledger/add-platform-strategies/proposal` (Decision Q3), `sdd/driverledger/add-platform-strategies/explore` (Design space §Interface shape options).

### AD-10 Cross-domain rule enforcement (mirror Phase 1 AD-10 + Phase 2 AD-10)

**Decision**: Phase 4 sources in `services/strategies/**`, `services/carrera.service.ts`, `services/__tests__/{strategies,carrera.service}.test.ts`, `services/README.md` (UPDATE for R-1), and `openspec/changes/add-platform-strategies/` ONLY. Never `ui/`, never top-level `tests/`, never `data/`, never `services/db.service.ts`, never `services/carrera.repo.ts`, never `services/sync-queue.service.ts`. Enforced by:

1. **Code review at PR time** — every import in the new files is reviewed against this rule.
2. **`git diff develop --stat` pre-flight in `sdd-apply`** — aborts if any path matches `^ui/`, `^tests/` (top-level), `^data/`, or any of the three Phase 1/2 frozen `services/` modules.
3. **No UI side-effects** — `services/strategies/**` and `services/carrera.service.ts` do not log to console beyond `console.warn` for the `UnknownStrategyError` path. No `Alert`, no `Toast`, no UI Subject.
4. **Concrete import allow-list** for the new files:
   - `services/strategies/**` may import: `services/strategies/strategy.types.ts` (sibling), `data/sqlite/types.ts` (type definitions only via `import type`), `services/db.service.ts` (read-only — the `LocalDatabase` interface type for tests), `services/carrera.repo.ts` (`import type { CarreraPayload }` for the canonical write shape; see **DQ-1** below).
   - `services/carrera.service.ts` may import: `services/strategies/index.ts` (the registry + helpers), `services/carrera.repo.ts` (`upsertByTripId`, `listPlataformas`), `services/db.service.ts` (`getDb`, `getBridge` for the LocalDatabase facade, `LocalDatabase` interface type for tests), `data/sqlite/types.ts` (`CarreraRow`, `PlataformaRow`, `LogEventoRow` types).
   - Forbidden: `expo-sqlite` (direct), `ui/*`, top-level `tests/*`, `services/sync-queue.service.ts` (R-8), `services/network.service.ts` (not needed), any other unlisted path.

**Context**: This is the third reassertion of the cross-domain rule (Phase 1 AD-10, Phase 2 AD-10, now Phase 4 AD-10). The "no UI side-effects" clause keeps `services/` testable without a UI runtime and keeps `ui/` from depending on `services/` implementations (R-7 in the proposal). The concrete import allow-list closes the loop on DQ-1 — strategies may `import type { CarreraPayload } from '../carrera.repo'` for type-checking their own output, but may not import the runtime `upsertByTripId` (that's `CarreraService`'s job, AD-4).

**Consequences**:
- Strategies are **pure** (no I/O, no DB access) — DQ-1 is resolved in favor of "type-only import from `carrera.repo.ts` for `CarreraPayload`; no runtime import of the repo's methods".
- `CarreraService` is the only path from `suggest()` to `dbChange$` — the strategy cannot bypass the audit policy (AD-5) by writing directly.
- The `git diff develop --stat` check in `sdd-apply` is mechanical and pre-existing in the orchestrator's flow (Phase 2 precedent at `openspec/changes/archive/2026-10-11-add-sync-queue/tasks.md §G.4`).

**Source**: `docs/documento-maestro-agentes.md §1-5`, `docs/gitflow.md §3`, `openspec/changes/archive/2026-10-11-local-data-model-sqlite/design.md §AD-10`, `openspec/changes/archive/2026-10-11-add-sync-queue/design.md §AD-10`, `sdd/driverledger/add-platform-strategies/proposal` (R-7, R-8, §Cross-domain rule reasserted), `services/carrera.repo.ts:36-52` (the `CarreraPayload` interface).

### AD-11 Parser source-of-truth — paste text is the only Phase 4 input

**Decision**: Phase 4 `StrategySuggestInput.raw` is a `string` of pasted text from a notification or screenshot. The strategy's `suggest()` is a pure function of `(raw, context)`; no I/O, no notification listener, no PDF parser, no OS API. A small input-normalization helper in `services/strategies/parse.ts` (trim, lowercase platform markers, strip noise chars) runs first; the strategy then applies its per-platform regex/parser.

**Context**: Decision Q1 in the proposal (#1938) locks "paste + manual form fallback" as the Phase 4 input source. Notification listener (OS permissions + battery) is deferred to a future change. PDF regex in Phase 4 is rejected because it couples Phase 4 to PDF parsing libraries (and the Uber PDF belongs to Phase 6 OAuth anyway). The pure-function invariant keeps strategies testable without device state.

**Consequences**:
- `services/strategies/parse.ts` exports `normalize(input: string): string` (trim, lowercase platform markers like "DIDI" → "didi", strip non-printable chars). Each strategy's parser receives the normalized text. Tests cover the happy path + a few normalization cases (leading/trailing whitespace, mixed case, zero-width chars).
- `StrategySuggestInput.context` is the **only** stateful surface. It carries `fecha`, `horaLocal`, `carreraActiva` (Phase 5 hook). The strategy reads `context.fecha` if present, else defaults to `new Date().toISOString().slice(0, 10)` (device-local date per `local-fecha-iso` precedent at `local-data-model-sqlite/design.md §AD-5`).
- Phase 6 may add an `input.kind: 'paste' | 'stream'` discriminator without changing the interface — the existing strategies ignore unknown kinds and return `confidence: 0` (the manual form fallback). The discriminator is forward-compatible.

**Source**: `docs/RFC-003-logica-registro.md §Strategy + §Confirmación de un toque`, `sdd/driverledger/add-platform-strategies/proposal` (Decision Q1), `sdd/driverledger/add-platform-strategies/explore` (Design space §Auto-fill source options), `openspec/changes/archive/2026-10-11-local-data-model-sqlite/design.md §AD-5` (fecha ISO policy).

### AD-12 Confidence model — `confidence` is a strategy-declared number in `[0, 1]` with a 0.3 threshold codified as a constant

**Decision**: `StrategySuggestion.confidence` is a `number` in `[0, 1]`. The 0.3 threshold (below which the UI shows the manual form per RFC-003 line 42) lives in `services/strategies/confidence.ts` as a named constant `CONFIDENCE_THRESHOLD = 0.3`. The constant is exported from the strategies barrel so Phase 3 Pi (M01 modal) can import it for the "show manual form" decision (no magic number in the UI either). Below-threshold strategies MUST set `editableFields` to cover all required `CarreraPayload` fields (`tarifa_bruta`, `comision`, `origen`, `destino`, `distancia_km`, `duracion_min`) so the driver can correct.

**Context**: The 0.3 threshold comes from `docs/RFC-003-logica-registro.md line 42` ("Editar" fallback). Codifying it as a constant in `services/strategies/` (not inlined in each strategy or the UI) means: (a) tests assert the exact value (no magic number drift), (b) a future PR that wants to change the threshold changes it in one place and updates the spec scenario, (c) the UI imports the constant instead of a literal `0.3` (so the modal's behaviour is data-driven, not hard-coded). The `editableFields` requirement (below-threshold → all fields editable) prevents a parser from returning a low-confidence suggestion that hides the field the driver needs to correct (R-9 in the proposal).

**Consequences**:
- `services/strategies/confidence.ts` exports `CONFIDENCE_THRESHOLD = 0.3` (as a `const` so TypeScript narrows to the literal type). The constant is re-exported from `services/strategies/index.ts` and `services/carrera.service.ts` for ergonomic UI import.
- The audit policy (AD-5) keys off `suggestion.confidence < CONFIDENCE_THRESHOLD` — the constant is the single source of truth.
- The `editableFields` invariant: a strategy that returns `confidence < CONFIDENCE_THRESHOLD` MUST include `'tarifa_bruta' | 'comision' | 'origen' | 'destino' | 'distancia_km' | 'duracion_min'` in `editableFields`. The integration test (`services/__tests__/carrera.service.test.ts`) asserts this for every strategy.
- A strategy returning `confidence >= CONFIDENCE_THRESHOLD` MAY include any subset in `editableFields` (the driver can still correct obvious garbage; spec scenario `platform-strategy-didi-paste §parseo completo produce alta confianza`).

**Source**: `docs/RFC-003-logica-registro.md line 42` (the "Editar" fallback), `openspec/changes/add-platform-strategies/specs/platform-strategies/spec.md` (requirement `platform-strategy-uber-stub §stub fuerza formulario manual en la UI`), `sdd/driverledger/add-platform-strategies/proposal` (R-9, §Notes), `sdd/driverledger/add-platform-strategies/explore` (R-9 mitigation).

### AD-13 Parser input normalization (`parse.ts`)

**Decision**: `services/strategies/parse.ts` exports a single helper `normalize(raw: string): string` that all three strategies call before their per-platform parser. The helper trims whitespace, strips non-printable characters, lowercases the platform-marker tokens (`UBER`, `DIDI`, `INDRIVE` are normalized to a canonical form the strategy's regex matches), and collapses internal whitespace runs to a single space.

**Context**: Drivers paste from screenshots and notifications; both sources inject noise (newlines, zero-width spaces from copy-paste, mixed case, RTL marks on Android). Letting each strategy implement its own normalization duplicates the same code three times and creates a drift surface (one strategy's "DI-DI" matches, another's does not). Centralizing the helper means a single test target and a single behavioural guarantee.

**Consequences**:
- `parse.ts` is **pure** — no I/O, no `Date.now()`. Tests cover leading/trailing whitespace, mixed case, zero-width chars, multi-line paste with embedded newlines, and platform-marker normalization.
- The helper is intentionally minimal in Phase 4. Phase 6 may extend it (e.g. currency-symbol normalization, decimal-comma → decimal-dot for ES-CO locale) without changing the signature.
- The strategy receives the normalized text and applies its own parser. The strategy does **not** call `normalize` itself — `CarreraService.confirmRegistration` calls it once before dispatching to the strategy. This keeps the "strategies are pure functions of `(raw, context)`" invariant (AD-11).

**Source**: `docs/RFC-003-logica-registro.md §Strategy` (the input contract), `openspec/changes/add-platform-strategies/specs/platform-strategies/spec.md` requirement `platform-strategy-didi-paste §parseo completo produce alta confianza` (the expected text shape), `sdd/driverledger/add-platform-strategies/explore` (R-9 mitigation).

### AD-14 Cross-agent handoff: `strategy.types.ts` ships FIRST (as commit #1 of Phase 4)

**Decision**: The **first commit** of Phase 4 publishes `services/strategies/strategy.types.ts` (interface + types) + updates the engram topic `sdd/driverledger/add-platform-strategies/interface` (#1939) + writes the directory `services/strategies/__tests__/.gitkeep`. The commit is the only file the cross-domain surface ships with — no strategy class, no registry, no `CarreraService`. Subsequent commits fill in the implementation.

**Context**: Phase 3 Pi (separate branch) consumes the `StrategySuggestion` contract to render M01 modal. If Phase 4 ships implementation without the contract first, Pi's modal types diverge and the integration breaks at PR merge (R-7 in the proposal). The "publish contract first, implement second" pattern is the same one used at the Phase 1 → Phase 2 handoff (the `sync-queue.transport.ts` interface shipped before the service). The orchestrator can verify the first commit exists before launching `sdd-apply` for the rest of Phase 4.

**Consequences**:
- The first commit is a single file (`strategy.types.ts`) + a directory marker. ~50 LOC + a `.gitkeep`. Conventional commit: `feat: add strategy types contract (add-platform-strategies)`.
- Phase 3 Pi can checkout `develop` after this commit lands and `mem_get_observation` the engram topic #1939 to see the exact TypeScript surface. Pi's modal types bind to `StrategySuggestion` and `PlatformStrategy` from this commit onward.
- Subsequent commits (registry, UberStrategy stub, CarreraService skeleton, DidiStrategy, InDriveStrategy, fees, parse, tests, README update) ship in any order; the contract is already locked.
- The engram topic is the **read-side** for any agent that doesn't have the file checked out (parallel agent run); the file is the **authoritative** surface for any contributor with the branch.

**Source**: `sdd/driverledger/add-platform-strategies/interface` (#1939, the published contract), `sdd/driverledger/add-platform-strategies/proposal` (Cross-agent coordination commitment, R-7), `openspec/changes/archive/2026-10-11-add-sync-queue/design.md §AD-2` (the Phase 1 → 2 port-first precedent).

### AD-15 UI input shape — `plataformaId` lookup, not `PlataformaRow` (resolves DQ-4)

**Decision**: The UI (M01 modal) passes a `plataformaId: string` to `CarreraService.confirmRegistration(driverId, plataformaId, input)`. The service resolves the `PlataformaRow` internally via `carreraRepo.listPlataformas()`. The UI does NOT do a DB lookup or pass a `PlataformaRow`.

**Context**: DQ-4 in the launch prompt offers option (a) `plataformaId` directly vs. option (b) `PlataformaRow`. Option (b) was rejected because it would force the UI to do a DB lookup before calling the service (a cross-domain pattern where UI reaches into data layer), and it would couple the UI's call site to the `PlataformaRow` shape (which is `services/` territory, not `ui/` territory — AD-8). Option (a) — chosen — keeps the UI's call site to a primitive string + the `StrategySuggestInput` type. The service does the lookup; the strategy sees the resolved `plataforma` via the orchestration context.

**Consequences**:
- `CarreraService.confirmRegistration` signature is `(driverId: string, plataformaId: string, input: StrategySuggestInput): Promise<StrategySuggestion>`. The service calls `carreraRepo.listPlataformas()` internally, finds the matching row by `id`, and passes the `PlataformaRow` to the strategy (via the `StrategySuggestInput.context` extension or a separate `plataforma` parameter — see open item OI-1).
- The UI's modal contract is reduced to two strings + one struct. Phase 3 Pi's M01 modal calls `carreraService.confirmRegistration(driverId, selectedPlataformaId, { raw: paste, context: { fecha, horaLocal } })`.
- The integration test asserts the service correctly resolves `plataformaId` to a `PlataformaRow` and passes the right `tipo_estrategia` to the registry.

**Source**: `services/carrera.repo.ts:187-192` (`listPlataformas`), `docs/documento-maestro-agentes.md §1-5` (cross-domain rule), `sdd/driverledger/add-platform-strategies/interface` (#1939, the cross-domain contract).

## 2. Resolved open design questions (DQ-1..DQ-4)

The launch prompt surfaced four design questions to resolve in this phase. Resolutions:

- **DQ-1 — Can `services/strategies/<name>.strategy.ts` import `services/carrera.repo.ts` for type definitions?**
  **Resolved YES, type-only.** The strategies may `import type { CarreraPayload } from '../carrera.repo'` to type-check their own `StrategySuggestion.draft` output against the canonical write shape. They MAY NOT import the runtime methods (`upsertByTripId`, `listPlataformas`) — those are `CarreraService`'s job. The import allow-list in AD-10 codifies this.
  **Grounding**: `services/carrera.repo.ts:36-52` is the canonical `CarreraPayload` definition; type-only imports are erased at compile time and cannot break the open-closed seam; Phase 1 AD-10 precedent (the cross-domain rule applies to *runtime* imports, not `import type`).

- **DQ-2 — Should `CarreraService` be a class or a module of pure functions?**
  **Resolved: class with a single frozen instance state (the registry).** `new CarreraService().confirmRegistration(...)` reads cleanly in tests; DI for an alternate registry is a constructor argument. The class holds no mutable state beyond the frozen registry, so it's effectively a static namespace with a constructor seam.
  **Grounding**: Phase 1's `LocalDatabase` is exposed as a class via `getDb()`; Phase 2's `NetworkService` is a class; consistency with the established pattern.

- **DQ-3 — Where does `commitSuggestion` live?**
  **Resolved: inside `CarreraService`.** Option (a) — chosen. Option (b) (UI calls `carreraRepo.upsertByTripId` directly) was rejected because it scatters the audit policy (AD-5) across every modal. Keeping the audit enforcement in one place is the same "single write path" invariant Phase 1 AD-8 established for `carreraRepo`.
  **Grounding**: AD-4 (the orchestration layer), AD-5 (the audit policy), `openspec/changes/archive/2026-10-11-local-data-model-sqlite/design.md §AD-8` (the upsert path canonicalization).

- **DQ-4 — How does the UI signal which `plataformaId` is selected?**
  **Resolved: UI passes `plataformaId: string`; service resolves internally.** Option (a) — chosen. Option (b) (UI passes `PlataformaRow`) was rejected because it forces the UI to do a DB lookup (cross-domain breach) and couples the UI to the `PlataformaRow` shape.
  **Grounding**: AD-15 (the input shape), `services/carrera.repo.ts:187-192` (`listPlataformas`), `docs/documento-maestro-agentes.md §1-5` (cross-domain rule).

## 3. Review Workload Forecast

This forecast is input to `sdd-tasks` for the PR-split decision under cached `delivery_strategy = 'ask-on-risk'`.

### Files and LOC

| Path | Action | LOC |
|------|--------|-----|
| `services/strategies/strategy.types.ts` | NEW (commit #1, contract) | ~50 |
| `services/strategies/registry.ts` | NEW | ~30 |
| `services/strategies/fees.ts` | NEW | ~30 |
| `services/strategies/confidence.ts` | NEW | ~15 |
| `services/strategies/parse.ts` | NEW | ~40 |
| `services/strategies/ui-labels.ts` | NEW (the "Modo de conexión" map) | ~20 |
| `services/strategies/uber.strategy.ts` | NEW (Phase 4 stub) | ~80 |
| `services/strategies/didi.strategy.ts` | NEW (paste parser) | ~120 |
| `services/strategies/indrive.strategy.ts` | NEW (paste parser) | ~120 |
| `services/strategies/index.ts` | NEW (barrel) | ~20 |
| `services/strategies/README.md` | NEW (extension guide + Phase 6 stub note) | ~60 |
| `services/strategies/__tests__/registry.test.ts` | NEW | ~80 |
| `services/strategies/__tests__/uber.strategy.test.ts` | NEW | ~80 |
| `services/strategies/__tests__/didi.strategy.test.ts` | NEW | ~120 |
| `services/strategies/__tests__/indrive.strategy.test.ts` | NEW | ~120 |
| `services/strategies/__tests__/fees.test.ts` | NEW | ~60 |
| `services/strategies/__tests__/confidence.test.ts` | NEW (covers the constant + below-threshold behaviour) | ~30 |
| `services/strategies/__tests__/parse.test.ts` | NEW | ~50 |
| `services/carrera.service.ts` | NEW | ~150 |
| `services/__tests__/carrera.service.test.ts` | NEW (integration: in-memory SQLite) | ~250 |
| `services/README.md` | UPDATE (naming-drift fix per R-1) | ~20 (delta) |
| **Total** | — | **~1,535 LOC** |

### Guard lines (plain text, per sdd-phase-common §E)

```
Decision needed before apply: Yes
Chained PRs recommended: Yes
400-line budget risk: High
```

### Recommended PR split (chained-to-main under `stacked-to-main` or `feature-branch-chain`)

| PR | Scope | LOC | Tests | Reasoning |
|----|-------|-----|-------|-----------|
| **PR #1** — `feat: add platform strategy contract + registry + Uber stub` | `strategy.types.ts` + `registry.ts` + `confidence.ts` + `parse.ts` + `index.ts` (barrel) + `uber.strategy.ts` (stub) + `README.md` (stub note) + 2 test files (`registry.test.ts`, `uber.strategy.test.ts`, `confidence.test.ts`) + `services/README.md` UPDATE | ~540 | ~190 | Publishes the cross-domain contract (AD-14, AD-8) so Phase 3 Pi can `mem_get_observation` + `import type` immediately. Establishes the open-closed seam (AD-3) and the registry resolution. Ships the Uber stub with the seed at `tipo_estrategia='uber_api'` (AD-6). Each commit in the PR is independently testable; the PR is the smallest coherent slice that unblocks Phase 3. |
| **PR #2** — `feat: add DidiStrategy + InDriveStrategy + CarreraService + fees` | `didi.strategy.ts` + `indrive.strategy.ts` + `fees.ts` + `ui-labels.ts` + `carrera.service.ts` (orchestration) + 4 test files (`didi.strategy.test.ts`, `indrive.strategy.test.ts`, `fees.test.ts`, `parse.test.ts`) + `carrera.service.test.ts` (integration) | ~990 | ~500 | Fills in the per-platform paste parsers and the orchestration layer. The `CarreraService` is the writer + audit log enforcer (AD-4, AD-5). The integration test verifies end-to-end: `confirmRegistration` → `commitSuggestion` → `carreras` row + `log_eventos` row on exceptional path + `dbChange$` emission. PR #1 must be merged first; PR #2 is independently testable once PR #1 is on `develop`. |

**Total: ~1,535 LOC across 2 PRs. Each PR is ≤ 1,000 LOC** — under the 400-line *ideal* budget each is over, but under the chained-PR precedent at `openspec/changes/archive/2026-10-11-add-sync-queue/tasks.md §PR-split candidate` (which budgets ~700 LOC for a single PR and recommends auto-chain at >400).

**Alternative if user prefers `single-pr + size:exception`**: one PR covering both slices (~1,535 LOC). Requires explicit user approval per the orchestrator's `ask-on-risk` delivery strategy. Phase 1's `local-data-model-sqlite` shipped 2,327 insertions on a single PR (precedent at `local-data-model-sqlite/design.md §4 File-by-file plan`); a single-PR Phase 4 is feasible but exceeds the standing 400-line review budget.

### Decision needed before apply

**YES.** Under cached `delivery_strategy = 'ask-on-risk'`, the orchestrator surfaces this forecast to the user and asks: (a) proceed with the chained PR split (PR #1 + PR #2) under cached `chain_strategy` (to be set at session start if not yet set), or (b) request `single-pr + size:exception`. The forecast's `Decision needed before apply: Yes` is the formal guard line for the orchestrator.

## 4. Test strategy

Per Phase 1/2 precedent (`local-test-coverage ≥ 80%` at `local-data-model-sqlite/design.md §AD-9` + Phase 2 G.3 at `openspec/changes/archive/2026-10-11-add-sync-queue/tasks.md §G.3`).

| Layer | File | What is tested | Approach |
|-------|------|----------------|----------|
| **Unit — parser** | `services/strategies/__tests__/parse.test.ts` | `normalize()` happy path + edge cases (whitespace, mixed case, zero-width chars, multi-line). Pure function. | TDD: write tests first; assert `normalize('  DI-DI Tarifa: $12.500 COP  ')` returns canonical form. |
| **Unit — fees** | `services/strategies/__tests__/fees.test.ts` | `calcularComision(tarifaBruta, plataforma)` for each seeded platform (`Uber 25%`, `DiDi 20%`, `InDrive 18%`). `calcularGasolina` placeholder returns `0`. Pure functions. | TDD: tests assert exact numbers. |
| **Unit — confidence** | `services/strategies/__tests__/confidence.test.ts` | The `CONFIDENCE_THRESHOLD` constant is exactly `0.3`. The audit-policy threshold comparison uses the constant (not a magic literal). | TDD: tests import the constant and assert against it. |
| **Unit — registry** | `services/strategies/__tests__/registry.test.ts` | `getStrategyByTipo('uber_api' \| 'didi_manual' \| 'indrive_form')` resolves to the correct strategy instance. `getStrategyByTipo('rappi_paste')` throws `UnknownStrategyError` with the offending `tipo` in the message. `STRATEGY_REGISTRY` is `Object.freeze`d at module-load. | TDD: tests import the registry and assert. |
| **Unit — Uber stub** | `services/strategies/__tests__/uber.strategy.test.ts` | `uber.suggest(any input)` returns `confidence: 0`, `oneTapCapable: false`, `draft.fuente: 'manual'`, `draft.estado: 'activa'`. Spec scenario `platform-strategy-uber-stub §stub retorna confidence cero y fuente manual`. | TDD: tests call `suggest` with arbitrary inputs (empty string, garbage, DiDi-format text); assertion holds. |
| **Unit — DiDi parser** | `services/strategies/__tests__/didi.strategy.test.ts` | Happy path: DiDi notification with `Tarifa: $12.500 COP` + `Distancia: 4,2 km` parses to `tarifa_bruta: 12500`, `distancia_km: 4.2`, `confidence >= 0.3`, `fuente: 'manual'`, `estado: 'completada'`. Below-threshold: empty text → `confidence < 0.3`. Garbage: `Tarifa: ???` → `confidence < 0.3`. Spec scenarios `platform-strategy-didi-paste`. | TDD: tests cover happy + 3 failure cases. |
| **Unit — InDrive parser** | `services/strategies/__tests__/indrive.strategy.test.ts` | Happy path: `Precio acordado: 8.000 COP` → `tarifa_bruta: 8000`, `confidence >= 0.3`, `fuente: 'manual'`, `estado: 'completada'`. Below-threshold: text without `acordado` keyword → `confidence < 0.3`. Spec scenarios `platform-strategy-indrive-paste`. | TDD: tests cover happy + failure. |
| **Integration — CarreraService** | `services/__tests__/carrera.service.test.ts` | End-to-end via in-memory SQLite (precedent at `services/__tests__/sync-queue.service.test.ts:56-85`): (1) `confirmRegistration` returns `StrategySuggestion` without DB write; (2) `commitSuggestion` writes one `carreras` row with right `fuente`/`estado`; (3) `dbChange$` emits exactly one event after `commitSuggestion`; (4) below-threshold `commitSuggestion` writes one `log_eventos(tipo='carrera.registered')` row; (5) repo error during `commitSuggestion` writes one `log_eventos` row with `metadata.error`; (6) `listPlataformas` returns the 3 seeded rows; (7) `getStrategyByTipo` on unknown key throws; (8) `CarreraService` does NOT import `services/sync-queue.service` (static check via `import` inspection if practical, otherwise code-review note). | TDD: in-memory `bun:sqlite` factory; the test sets up the 3 seeded `plataformas` rows manually, drives the service, and asserts. |
| **Coverage gate** | Root `bunfig.toml` (Phase 1's existing config; Phase 4 extends the scope) | ≥ 80% on `services/strategies/**` + `services/carrera.service.ts`. | `bun test --coverage` from repo root; the pre-existing threshold at `local-data-model-sqlite/design.md §AD-9` is unchanged. Phase 4's `sdd-apply` extends the `include` glob to cover the new files. |

### Test command

```
bun test services/strategies services/__tests__/carrera.service.test.ts
```

Runs from repo root. The `bunfig.toml` from Phase 1/2 picks this up.

### TDD posture

**Standard TDD Mode** (per `sdd-init` cached `testing-capabilities = null`; `strict_tdd = false` — `bun test` is the runner; the project does not have a strict RED-GREEN-REFACTOR harness). For Phase 4: each per-strategy test file is authored **before** its strategy implementation lands; the commit message records the test-first posture. The integration test is authored after the per-strategy tests pass and is committed alongside the `CarreraService` skeleton.

## 5. File structure (final tree)

```
services/
├── carrera.service.ts                 (NEW) — orchestration class (AD-4, AD-13-DQ-3)
├── carrera.repo.ts                    (UNCHANGED, frozen)
├── db.service.ts                      (UNCHANGED, frozen)
├── sync-queue.service.ts              (UNCHANGED, frozen)
├── network.service.ts                 (UNCHANGED, frozen)
├── sync-queue.transport.ts            (UNCHANGED, frozen)
├── README.md                          (UPDATED — R-1 naming-drift fix)
├── __tests__/
│   ├── db.service.test.ts             (UNCHANGED, Phase 1)
│   ├── sync-queue.service.test.ts     (UNCHANGED, Phase 2)
│   ├── network.service.test.ts        (UNCHANGED, Phase 2)
│   └── carrera.service.test.ts        (NEW) — in-memory SQLite integration
└── strategies/                        (NEW directory)
    ├── strategy.types.ts              (NEW — commit #1 cross-domain contract, AD-1, AD-8, AD-14)
    ├── registry.ts                    (NEW — STRATEGY_REGISTRY + getStrategyByTipo, AD-3)
    ├── fees.ts                        (NEW — calcularComision + calcularGasolina, AD-9)
    ├── confidence.ts                  (NEW — CONFIDENCE_THRESHOLD constant, AD-12)
    ├── parse.ts                       (NEW — normalize() helper, AD-13)
    ├── ui-labels.ts                   (NEW — "Modo de conexión" map per R-2)
    ├── index.ts                       (NEW — barrel for cross-domain import surface, AD-8)
    ├── uber.strategy.ts               (NEW — Phase 4 stub, AD-6)
    ├── didi.strategy.ts               (NEW — paste parser, AD-11)
    ├── indrive.strategy.ts            (NEW — paste parser, AD-11)
    ├── README.md                      (NEW — extension guide + Phase 6 stub note, AD-6)
    └── __tests__/                     (NEW directory)
        ├── registry.test.ts           (NEW)
        ├── uber.strategy.test.ts      (NEW)
        ├── didi.strategy.test.ts      (NEW)
        ├── indrive.strategy.test.ts   (NEW)
        ├── fees.test.ts               (NEW)
        ├── confidence.test.ts            (NEW)
        └── parse.test.ts            (NEW)

openspec/changes/add-platform-strategies/
├── proposal.md                        (sdd-propose, already shipped)
├── design.md                          (THIS FILE, sdd-design)
├── tasks.md                           (sdd-tasks, NEXT)
└── specs/
    └── platform-strategies/
        └── spec.md                    (sdd-spec, in parallel — 8 ADDED requirements)
```

**NOT touched** (frozen or out of scope): `services/db.service.ts`, `services/carrera.repo.ts`, `services/sync-queue.service.ts`, `services/sync-queue.transport.ts`, `services/network.service.ts`, `data/sqlite/{migrations,types}.ts`, `data/migrations/0003_seeds.sql`, `ui/**`, top-level `tests/`, `bunfig.toml` (only its `coverage include` glob is extended, not the file structure).

## 6. Phase 1 + Phase 2 bridge surface consumed (read-only)

Phase 1's bridge design (`local-data-model-sqlite/design.md` AD-7 + AD-8) and Phase 2's enqueue funnel (`add-sync-queue/design.md` AD-6) are consumed by Phase 4:

- **`CarreraPayload`** (`services/carrera.repo.ts:36-52`) — canonical write shape. `StrategySuggestion.draft` MUST conform. Strategy code imports the type only.
- **`upsertByTripId(driverId, tripId, payload)`** (`services/carrera.repo.ts:66-139`) — the canonical idempotent write. Called by `CarreraService.commitSuggestion`; never by strategies.
- **`listPlataformas()`** (`services/carrera.repo.ts:187-192`) — reference data for registry boot + `CarreraService.confirmRegistration` resolution. Called by `CarreraService`; never by strategies.
- **`emitAfterWrite`** (`services/carrera.repo.ts:218-236`) — the only legal `dbChange$` emitter. Phase 4 does not emit; it writes through the repo and lets the bridge auto-emit.
- **`carreras$` BehaviorSubject** (`services/db.service.ts:139-141`) — read-side for Phase 3 Pi (V05 Dashboard per `docs/ui/views.md`). Phase 4 does not subscribe.
- **`dbChange$` Subject** (`services/db.service.ts:155-157`) — multiplexed event; Phase 2's auto-enqueue subscription at `services/sync-queue.service.ts:547-549` catches every Carrera write. Phase 4's `commitSuggestion` triggers this structurally; no explicit enqueue.
- **`LocalDatabase` interface** (`services/db.service.ts:46-55`) — the only legal write facade (`local-rls-facade`). `CarreraService` writes `log_eventos` rows through this interface; strategies are pure and do not write.
- **CHECK constraints** (`data/sqlite/types.ts:54-55` + `data/migrations/0001_init_schema.sql`) — `CarreraEstado` and `CarreraFuente` enums enforced at schema level. Strategies produce values in the union; nothing else passes.

No Phase 1 or Phase 2 file is modified. No Phase 1/2 spec delta is required.

## 7. Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `services/strategies/` | New | 10 source files + 7 test files + 1 README + 1 index barrel. |
| `services/carrera.service.ts` | New | Orchestration class. |
| `services/__tests__/carrera.service.test.ts` | New | In-memory SQLite integration. |
| `services/README.md` | Update | Fix naming drift per R-1 (PascalCase → kebab-case). |
| `bunfig.toml` (root) | Coverage glob extension | Add `services/strategies/**` + `services/carrera.service.ts` to the `coverage include` paths. |
| `openspec/changes/add-platform-strategies/` | New | This change folder (proposal + design + tasks + spec). |

Not touched: `ui/`, top-level `tests/`, `data/`, `services/db.service.ts`, `services/carrera.repo.ts`, `services/sync-queue.service.ts`, `services/sync-queue.transport.ts`, `services/network.service.ts`, `data/sqlite/**`, `data/migrations/**`.

## 8. File-by-file plan (write-time)

| Path | Conventional commit | PR |
|------|---------------------|----|
| `services/strategies/strategy.types.ts` | `feat: add strategy types contract (add-platform-strategies)` | PR #1 (commit #1) |
| `services/strategies/index.ts` | `feat: add strategies barrel (add-platform-strategies)` | PR #1 |
| `services/strategies/registry.ts` | `feat: add strategy registry (add-platform-strategies)` | PR #1 |
| `services/strategies/confidence.ts` | `feat: add confidence threshold constant (add-platform-strategies)` | PR #1 |
| `services/strategies/parse.ts` | `feat: add strategy parse normalizer (add-platform-strategies)` | PR #1 |
| `services/strategies/uber.strategy.ts` | `feat: add UberStrategy phase 4 stub (add-platform-strategies)` | PR #1 |
| `services/strategies/README.md` | `docs: add strategies extension guide (add-platform-strategies)` | PR #1 |
| `services/strategies/__tests__/registry.test.ts` | `test: add registry tests (add-platform-strategies)` | PR #1 |
| `services/strategies/__tests__/uber.strategy.test.ts` | `test: add UberStrategy stub tests (add-platform-strategies)` | PR #1 |
| `services/strategies/__tests__/confidence.test.ts` | `test: add confidence constant tests (add-platform-strategies)` | PR #1 |
| `services/strategies/__tests__/parse.test.ts` | `test: add parse normalizer tests (add-platform-strategies)` | PR #1 |
| `services/README.md` UPDATE | `chore: fix services readme naming drift (add-platform-strategies)` | PR #1 |
| `services/strategies/ui-labels.ts` | `feat: add platform ui-labels map (add-platform-strategies)` | PR #2 |
| `services/strategies/fees.ts` | `feat: add shared fees helpers (add-platform-strategies)` | PR #2 |
| `services/strategies/didi.strategy.ts` | `feat: add DidiStrategy paste parser (add-platform-strategies)` | PR #2 |
| `services/strategies/indrive.strategy.ts` | `feat: add InDriveStrategy paste parser (add-platform-strategies)` | PR #2 |
| `services/carrera.service.ts` | `feat: add CarreraService orchestration (add-platform-strategies)` | PR #2 |
| `services/strategies/__tests__/fees.test.ts` | `test: add fees tests (add-platform-strategies)` | PR #2 |
| `services/strategies/__tests__/didi.strategy.test.ts` | `test: add DidiStrategy tests (add-platform-strategies)` | PR #2 |
| `services/strategies/__tests__/indrive.strategy.test.ts` | `test: add InDriveStrategy tests (add-platform-strategies)` | PR #2 |
| `services/__tests__/carrera.service.test.ts` | `test: add CarreraService integration tests (add-platform-strategies)` | PR #2 |
| `bunfig.toml` coverage glob | `chore: extend coverage glob to strategies (add-platform-strategies)` | PR #2 |

PR-split decision lives at the orchestrator's `sdd-tasks` time (cached `delivery_strategy = 'ask-on-risk'`). The forecast in §3 is the input. Working estimate for the whole change: ~1,535 LOC. The 400-line PR budget is exceeded; chained PRs are recommended (PR #1 ~540 LOC, PR #2 ~990 LOC). Under the Phase 1 single-PR precedent (~2,327 LOC for `local-data-model-sqlite`), a single-PR Phase 4 is feasible but the user must explicitly accept `size:exception`.

## 9. Out of scope (forwarded to future changes)

- **Phase 5 (`LocationService` / `posicion$` / `fuente = 'background'`)** — separate change. Phase 4's `StrategyContext.carreraActiva` is the forward-compat hook; nothing in Phase 4 reads it.
- **Phase 6 (UberStrategy body replacement + Supabase transport concrete impl)** — separate change. The `UberStrategy.suggest` body swap is documented in `services/strategies/README.md` under the "Phase 6" note. No Phase 4 change required.
- **Phase 7 polish** — E2E tests, error logging consolidation (e.g. a shared `LogService`), coverage threshold unification, per-platform `metadata.gasolina_km_per_litro` consumption tables.
- **"User adds platform" UI + dynamic discovery** — explicitly out of scope per locked decision Q5. Adding a 4th platform is a new OpenSpec change reviewed at PR time.
- **Notification-listener integration** — `expo-notifications` / Android `NotificationListenerService`. OS permissions + battery cost. Deferred to a future change once DiDi notifications are confirmed useful.
- **PDF regex parsing** — belongs to Phase 6 (Uber PDF OAuth flow).
- **Encrypted `metadata`** for Carrera payloads — Phase 7 (security review).
- **Realtime publication** of remote changes — `openspec/specs/realtime/spec.md` is the remote contract; Phase 4 is one-way (local-first write; remote is Phase 2's job to drain).
- **Today-filter on `carreras$`** — Phase 3 Pi filters in UI per `discovery/carreras-bridge-today-filter` (#1936). No change to Phase 1's frozen bridge.
- **Adapter for Uber API OAuth2 stream** — Phase 6. The interface (`StrategySuggestInput.context.carreraActiva` + `StrategySuggestion.draft.metadata.platform_session_id` via JSONB) is forward-compatible.
- **Type-level union for `tipo_estrategia` strings** — see open item OI-1.

## 10. Open items forwarded to `sdd-tasks`

These surfaced while writing this design and are deferred to `sdd-tasks` (or to a follow-up spec delta) — they are NOT blockers for this design.

- **OI-1 — How does the strategy see the resolved `PlataformaRow`?** The `StrategySuggestInput` interface (#1939) has `context: StrategyContext` (fecha, horaLocal, carreraActiva). It does NOT carry the `PlataformaRow` (which has `comision`, `tipo_estrategia`, `metadata`). The strategy needs `comision` (for `calcularComision`) and `tipo_estrategia` (for self-identification). Two options: (a) extend `StrategySuggestInput` to add `plataforma: PlataformaRow` directly; (b) keep `StrategySuggestInput` lean and have `CarreraService.confirmRegistration` enrich the registry look-up with a closure. The interface contract (#1939) currently shows option (a)-leaning via the `context` field; `sdd-tasks` should pin this down before PR #1's strategy.types.ts commit. The recommendation in this design is **option (a)** — add `plataforma: PlataformaRow` to `StrategySuggestInput` (or a sibling field) so the strategy is fully self-contained. Update to the engram topic #1939 follows.

- **OI-2 — Coverage glob extension in `bunfig.toml`.** Phase 1's `bunfig.toml` covers `data/sqlite/` and `services/{db.service,carrera.repo}.ts` per `local-data-model-sqlite/design.md §AD-9`. Phase 4 needs the glob to include `services/strategies/**` and `services/carrera.service.ts`. This is a one-line config change in PR #2. `sdd-tasks` should add a verification step (`bun test --coverage` exits 0 with the new files at ≥ 80%).

- **OI-3 — A literal type union for `tipo_estrategia`.** The current `PlataformaRow.tipo_estrategia: string` (at `data/sqlite/types.ts:67`) is a wide string. The registry (`STRATEGY_REGISTRY`) would benefit from a string-literal union `'uber_api' | 'didi_manual' | 'indrive_form' | <future>` for compile-time guarantees. **However** — adding a 4th platform would require a `data/sqlite/types.ts` change, which violates AD-10 (no `data/` modification in Phase 4). Defer to a follow-up spec delta that allows per-platform type unions via `metadata.tipo_estrategia` JSONB extension, OR to the future change that adds the 4th platform. For Phase 4, the registry uses `Record<string, PlatformStrategy>` (wide string key) and `getStrategyByTipo` accepts `string`; the `UnknownStrategyError` catch is the runtime safety net.

- **OI-4 — `metadata.platform_session_id` marker for the Uber stub.** The proposal §Rollback Plan step 3 mentions `metadata.platform_session_id = 'phase4-stub-pending-phase6'` as a marker so a follow-up migration can identify stub-originated Carrera rows. The marker is set by `UberStrategy.suggest` (in the `draft.metadata` field); the test in `uber.strategy.test.ts` asserts the marker. `sdd-tasks` should include this assertion.

- **OI-5 — Cross-domain type-only re-export path for `ui-labels.ts`.** `services/strategies/ui-labels.ts` exports the "Modo de conexión" map (e.g. `Uber → "Modo API"`, `DiDi → "Modo manual (captura)"`, `InDrive → "Modo formulario"`). Phase 3 Pi imports the map via the `services/strategies` barrel. The barrel re-exports the value (not just the type), so the import is `import { PLATFORM_UI_LABELS } from 'services/strategies'` (no `import type`). This is a value-level import that crosses the domain boundary, justified by R-2 in the proposal ("UI needs human-readable copy per platform"). The orchestrator should be aware: this is the ONE value-level import from `services/` to `ui/`. Future contributors should not extend this pattern without an explicit AD.

## 11. Open tradeoffs (forwarded to proposal.md)

- **Interface shape (Q1)**: chose `suggest()` over RFC-003 verbatim three-method contract. Tradeoff: a small deviation from RFC-003 §Strategy (the literal three methods) for a smaller, more testable, forward-compatible surface. RFC-003's `calcularComision` and `calcularGasolina` become pure helpers in `fees.ts` (AD-9) and the strategies become pure parsers (AD-1, AD-11).
- **Open-closed mechanism (Q5)**: chose static map at boot. Tradeoff: a code change for any new platform (vs. runtime registration) for compile-time guarantees + PR-time review.
- **Per-platform `estado` (Q4)**: chose per-strategy `draft.estado` default (Uber `activa`, others `completada`). Tradeoff: a small amount of per-strategy state for matching the driver's mental model.
- **PR split (Q6)**: forecast ~1,535 LOC total; recommended chained PRs (PR #1 ~540 LOC + PR #2 ~990 LOC). Tradeoff: two PRs to review vs. one larger PR. Under the orchestrator's `ask-on-risk` delivery strategy, the user picks.
- **Audit log policy (Q8)**: chose to log only on exceptional path (confidence < 0.3 or repo error). Tradeoff: a smaller `log_eventos` table (matches Phase 2's W-LOG-CONFLICT intent) vs. a full audit trail. The driver's confirmation is the canonical record; the audit log is for the exceptional path.

## 12. Source-of-truth citations

- **`docs/RFC-001-arquitectura.md`** §Open-closed — "agregar plataforma = INSERT en `plataformas`, no migración". AD-3, AD-6.
- **`docs/RFC-002-modelo-datos.md`** §Open-closed — `plataformas.tipo_estrategia` is the strategy discriminator. AD-3, AD-6.
- **`docs/RFC-003-logica-registro.md`** line 3-11 — three strategy methods + per-platform behaviour. AD-1 (deviation rationale).
- **`docs/RFC-003-logica-registro.md`** line 42 — "Editar" fallback when parser can't lock in high confidence. AD-12.
- **`docs/RFC-003-logica-registro.md`** §Confirmación de un toque — modal M01 contract. AD-4, AD-7.
- **`docs/RFC-004-sincronizacion.md`** §Flujo 1 — every Carrera write lands first on SQLite. AD-4, AD-5, AD-10.
- **`docs/PRD-consolidado.md`** §4 + §8 — Phase 4 placement in the plan; "confirmación de carrera (un toque)" modal contract.
- **`docs/ui/views.md`** line 41-49 (V04) + line 109-117 (M01) — UI consumption surface. AD-8, AD-15.
- **`docs/documento-maestro-agentes.md`** §1-5 — cross-domain rule + ownership. AD-8, AD-10.
- **`docs/gitflow.md`** §3 — single-change / single-branch / cross-domain audit. AD-10, AD-14.
- **`openspec/specs/data-model/spec.md`** §carreras-fuente-check + §carreras-estado-check — table contracts. AD-7, AD-12.
- **`openspec/specs/local-data-model/spec.md`** §local-rls-facade + §local-rxjs-bridge + §local-upsert-trip-id + §local-updated-at-js-layer — bridge surface consumed by Phase 4. §6 of this design.
- **`openspec/specs/sync-queue/spec.md`** §sync-enqueue-de-dup + §sync-rls-facade-mirror — auto-enqueue contract. AD-4, AD-10.
- **`services/db.service.ts:46-128, 139-157`** — `LocalDatabase` interface + `getDb()` + bridge. §6.
- **`services/carrera.repo.ts:36-52, 66-139, 187-192, 218-236`** — `CarreraPayload` + `upsertByTripId` + `listPlataformas` + `emitAfterWrite`. §6, AD-4, AD-10.
- **`services/sync-queue.service.ts:481-489, 547-549`** — W-LOG-CONFLICT precedent + auto-enqueue filter. AD-4, AD-5, AD-10.
- **`data/sqlite/types.ts:54-55, 67, 84, 95`** — `CarreraEstado`, `CarreraFuente`, `PlataformaRow.tipo_estrategia`, `CarreraRow`. AD-7, AD-9, §6.
- **`data/migrations/0003_seeds.sql:24-34`** — three reference rows + `tipo_estrategia` keys. AD-3, AD-6, AD-9.
- **`openspec/changes/archive/2026-10-11-local-data-model-sqlite/design.md`** §AD-9 (test runner), §AD-10 (cross-domain rule). AD-10, §4.
- **`openspec/changes/archive/2026-10-11-add-sync-queue/design.md`** §AD-1 (file layout), §AD-2 (port-first), §AD-6 (enqueue funnel), §AD-10 (cross-domain rule). AD-2, AD-4, AD-10, AD-14.
- **`sdd/driverledger/add-platform-strategies/explore`** (#1933) — Design space, Integration points, Open questions. AD-1, AD-4, AD-7, AD-9, AD-11.
- **`sdd/driverledger/add-platform-strategies/proposal`** (#1938) — Locked decisions Q1-Q8, Risks R-1..R-10, Cross-agent commitment. AD-1, AD-3, AD-5, AD-6, AD-7, AD-9, AD-11, AD-12, AD-14, AD-15.
- **`sdd/driverledger/add-platform-strategies/interface`** (#1939) — Cross-domain contract. AD-1, AD-8, AD-14.
- **`sdd/driverledger/add-platform-strategies/state`** (#1940) — DAG state at start of design phase.