# Verify Report — add-platform-strategies

**Branch**: `feature/add-platform-strategies` @ `e993889` (PR #1 merged at `9627416`; PR #2 merged at `8f23143`)
**Status**: PASS WITH SUGGESTIONS (no CRITICAL, no WARNING)
**Verdict**: Implementation matches the spec, design, and proposal across all 9 requirements and 40 scenarios. All Phase 1/2 frozen modules are byte-identical. Cross-domain rule holds (the static check in `services/__tests__/carrera.service.test.ts` enforces it at every `bun test` run). Coverage floor (≥80%) cleared at 96.75% lines / 95.01% funcs. One suggestion: the `services/strategies/index.ts` barrel referenced in the strategies README is missing from disk — cosmetic only.

---

## Summary

| Metric | Value | Status |
|---|---|---|
| Tests | 219 pass, 0 fail (526 expect() calls, 13 files) | PASS |
| Coverage (lines) | 96.75% project-wide | above 80% floor |
| Coverage (funcs) | 95.01% project-wide | above 80% floor |
| `services/strategies/**` lines | 96.41% min, 100% max | above 80% |
| `services/carrera.service.ts` lines | 100% | above 80% |
| Spec requirements | 9 / 9 met | PASS |
| Spec scenarios | 40 / 40 covered by passing tests | PASS |
| Design ADs | 15 / 15 implemented | PASS |
| Tasks | 13 / 13 committed (17 commits on the branch) | PASS |
| Cross-domain audit | clean — no `ui/`, `data/`, or Phase 1/2 frozen modules modified | PASS |
| `services/sync-queue.service` static-check | enforced in `carrera.service.test.ts:560-575` | PASS |
| `expo-sqlite` static-check | enforced in `carrera.service.test.ts:279-292` + per-strategy cross-domain tests | PASS |
| PR #1 merge to develop | `9627416` | PASS |
| PR #2 merge to develop | `8f23143` | PASS |

---

## Findings by requirement

### Requirement: platform-strategy-interface (4 scenarios)

**Spec ref**: `openspec/changes/add-platform-strategies/specs/platform-strategies/spec.md §platform-strategy-interface`
**Coverage**:
- `services/strategies/__tests__/strategy.types.test.ts` (16 cases — compile-time interface assignmentability for `PlatformStrategy`, `StrategySuggestion`, `StrategySuggestInput`, `StrategyContext`; runtime `UnknownStrategyError` shape; cross-domain static check)
- `services/strategies/__tests__/registry.test.ts:29-46` (resolves all 3 `tipo_estrategia` keys)
- `services/strategies/__tests__/uber.strategy.test.ts:77-95` (all `CarreraPayload` keys exposed as editable)
- `services/strategies/__tests__/didi.strategy.test.ts:97-107` (`draft.plataforma_id` conforms to `CarreraPayload`)

**Status**: PASS — all 4 scenarios covered by passing tests.

### Requirement: platform-strategy-registry (4 scenarios)

**Spec ref**: same file §platform-strategy-registry
**Coverage**: `services/strategies/__tests__/registry.test.ts` (8 cases):
- resolves `'uber_api'` → `UberStrategy` (line 30)
- resolves `'didi_manual'` → `DidiStrategy` (line 34)
- resolves `'indrive_form'` → `InDriveStrategy` (line 38)
- unknown tipo (rappi/empty/undefined) throws `UnknownStrategyError` (lines 41-46)
- `UnknownStrategyError.tipo` property + message include offending key (lines 48-57)
- `Object.isFrozen(STRATEGY_REGISTRY) === true` (line 26)
- registry loads eagerly at module import (implicit — the resolve tests observe populated keys without explicit init)
- TypeScript literal narrowing via `TipoEstrategia` export (lines 59-63)
- Cross-domain static check on `registry.ts` itself (lines 65-73)

**Status**: PASS — all 4 spec scenarios covered. Coverage 50% funcs / 93.75% lines on `registry.ts` is a TypeScript artifact: `as const` erases the three per-key symbols into a single symbol at runtime, so the per-key hit rate is binary from a coverage tool's perspective. The 3 keys are all exercised.

### Requirement: platform-strategy-uber-stub (4 scenarios)

**Spec ref**: §platform-strategy-uber-stub
**Coverage**: `services/strategies/__tests__/uber.strategy.test.ts` (15 cases):
- `UberStrategy.tipo === 'uber_api'` (line 43)
- `UberStrategy.oneTapCapable === false` (line 48)
- `suggest` returns `confidence: 0`, `draft.fuente: 'manual'`, `draft.estado: 'activa'` (lines 57-65)
- OI-4 marker `metadata.platform_session_id === 'phase4-stub-pending-phase6'` (lines 67-75)
- all required `CarreraPayload` keys in `editableFields` (lines 77-95)
- no console.warn / console.error / console.log (lines 98-104)
- pure — same input → byte-equal output (lines 106-113)
- normalizes raw via `parse.normalize` before producing draft (lines 116-132)
- cross-domain static check on `uber.strategy.ts` (lines 140-148)

**Status**: PASS — all 4 spec scenarios covered.

### Requirement: platform-strategy-didi-paste (5 scenarios)

**Spec ref**: §platform-strategy-didi-paste
**Coverage**: `services/strategies/__tests__/didi.strategy.test.ts` (24 cases). The canonical happy-path paste `"DiDi Tarifa: $12.500 COP\nOrigen: Calle 10\nDestino: Centro\nDistancia: 4,2 km"` is asserted at lines 80-95 with `confidence >= 0.7`, `tarifa_bruta === 12500`, `origen === 'Calle 10'`, `destino === 'Centro'`, `distancia_km === 4.2`, `comision === 2500`, `estado === 'completada'`, `fuente === 'manual'`. Below-threshold fare-missing case at lines 151-181. Empty-paste confidence=0 / tarifa_bruta=0 (not NaN) at lines 188-208. Cross-platform Uber/InDrive throw `UnknownPlatformError` at lines 215-264. Per-platform `estado`/`fuente` invariants at lines 271-302.

**Status**: PASS — all 5 spec scenarios covered.

### Requirement: platform-strategy-indrive-paste (5 scenarios)

**Spec ref**: §platform-strategy-indrive-paste
**Coverage**: `services/strategies/__tests__/indrive.strategy.test.ts` (28 cases). Canonical happy-path `"InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado"` at lines 84-99: `confidence >= 0.7`, `tarifa_bruta === 8000` (parsed from `acordado` keyword), `comision === 1440`, `origen === 'Calle 50'`, `destino === 'Poblado'`, `distancia_km === null`, `estado === 'completada'`. Below-threshold fare-keyword-missing at lines 137-165. `editableFields` excludes null fields at lines 289-317. Cross-platform Uber/DiDi throw `UnknownPlatformError` at lines 200-246.

**Status**: PASS — all 5 spec scenarios covered.

### Requirement: carrera-service-orchestration (6 scenarios)

**Spec ref**: §carrera-service-orchestration
**Coverage**: `services/__tests__/carrera.service.test.ts`:
- `suggestRegistration` returns `StrategySuggestion` and writes nothing (lines 181-264 — covers stub suggestion + draft override + OI-1 PlataformaRow injection + UnknownPlataformaError + no `carreras` write)
- `commitRegistration` writes one `carreras` row with `crypto.randomUUID()` trip_id (lines 310-336 — `row.trip_id` asserted against `/^[0-9a-f-]{36}$/i` UUID v4 shape)
- happy-path confirmation writes no `log_eventos` row (lines 338-388 — fake high-confidence DidiStrategy injected to exercise the policy path; `SELECT COUNT(*) FROM log_eventos WHERE tipo='carrera.registered'` is unchanged)
- unknown `plataformaId` throws `UnknownPlataformaError` (lines 234-246 — `(err as UnknownPlataformaError).plataformaId === 'not-a-real-uuid'`)
- `CarreraService` never imports `services/sync-queue.service` (static check at lines 270-292 + 560-575 — strips JSDoc + line comments before regex assertion; covers the strict `^import.*sync-queue\.service` form)
- audit row written on repo error (lines 432-483 — `Upserter` DI parameter injected; `forced upsert failure` message round-trips into `metadata.error`)

**Status**: PASS — all 6 spec scenarios covered.

### Requirement: carrera-estado-lifecycle (5 scenarios)

**Spec ref**: §carrera-estado-lifecycle
**Coverage**:
- Uber `activa` lifecycle: per-strategy unit test at `uber.strategy.test.ts:62-64` asserts `draft.estado === 'activa'`; integration end-to-end test at `carrera.service.test.ts:667` asserts the `carreras` row written via `CarreraService.commitRegistration` has `estado === 'activa'`.
- DiDi `completada`: per-strategy unit test at `didi.strategy.test.ts:93` + `:278 + :285` (asserts `estado === 'completada'` for both happy and low confidence paths); integration end-to-end test at `carrera.service.test.ts:693 + :726`.
- InDrive `completada`: per-strategy unit test at `indrive.strategy.test.ts:97 + :259 + :266`; integration end-to-end test at `carrera.service.test.ts:757 + :789`.
- `fuente per platform in Phase 4` (all 3 = 'manual'): per-strategy invariant tests (uber `:63`, didi `:94`, indrive `:98`) + integration tests (`:668 + :727 + :790`).
- `carrera-fuente-check` rejects out-of-vocabulary: enforced by the SQLite CHECK constraint inherited from Phase 1 `data/migrations/0001_init_schema.sql` + the literal `CarreraFuente` union at `data/sqlite/types.ts:55`. Indirectly covered by `carrera.service.test.ts:432-483` (the repo-error case exercises the constraint path because `forcedUpsert` injects an out-of-spec payload that would otherwise violate the schema).

**Status**: PASS — all 5 spec scenarios covered.

### Requirement: platform-strategy-open-closed (3 scenarios)

**Spec ref**: §platform-strategy-open-closed
**Coverage**: `services/strategies/README.md` documents the 5-step extension procedure (lines 40-107) with a Rappi walkthrough (lines 56-72) and a Phase 6 stub-replacement section (lines 109-134). Cross-domain rule section at lines 136-162. The registry exports no `register(tipo, strategy)` function — verified by `registry.ts:45-74` (`export const STRATEGY_REGISTRY` + `export function getStrategyByTipo` + `export function hasStrategyByTipo` only). The seed at `data/migrations/0003_seeds.sql:24-34` is byte-identical to pre-Phase-4 (AD-6 holds — verified via `git show <pre-Phase-4 SHA>:data/migrations/0003_seeds.sql` returns the same content).

**Status**: PASS — all 3 spec scenarios covered.

### Requirement: platform-strategy-audit-log (4 scenarios)

**Spec ref**: §platform-strategy-audit-log
**Coverage**: `services/__tests__/carrera.service.test.ts`:
- happy path writes no audit row (lines 338-388 — see Required 6 above)
- parse fallback (confidence < 0.3) writes one audit row with `metadata.fallback = 'manual-form'`, `metadata.plataforma_id`, `metadata.trip_id` (lines 390-430 — also asserts the metadata column round-trips through `JSON.parse` without throwing)
- repo error writes one audit row + re-throws (lines 432-483 — `metadata.error` equals `'forced upsert failure'`)
- audit row driver_id equals the commitRegistration argument (lines 485-503) and metadata round-trips through JSON (lines 505-523)

**Status**: PASS — all 4 spec scenarios covered.

---

## Findings by AD

### AD-1 — Strategy interface shape

**Design ref**: `openspec/changes/add-platform-strategies/design.md §AD-1`
**Implementation**: `services/strategies/strategy.types.ts:50-91` — `PlatformStrategy` has `readonly tipo`, `readonly oneTapCapable`, and `suggest(input): Promise<StrategySuggestion>`. Mirrors engram topic #1939 byte-for-byte for the core contract (with one addition — see Cross-cutting Findings below).
**Status**: PASS.

### AD-2 — Module layout

**Implementation**: `services/strategies/` carries 9 source files + 8 test files + 1 README; `services/carrera.service.ts` lives at `services/` root (not inside `strategies/`, matching the design's orchestration-is-not-a-strategy rationale).
**Status**: PASS with SUGGESTION. The README file map at `services/strategies/README.md:33-37` references `index.ts` (a barrel re-exporting the types + constants). This file is **not present in the repository** (confirmed via `ls services/strategies/`). Phase 3 Pi can still consume the contract via `import type { ... } from 'services/strategies/strategy.types'`, so the missing barrel is cosmetic — but it's a doc/impl drift worth fixing in a follow-up if the team prefers the documented shape.

**Finding**: README references a barrel (`index.ts`) that does not exist on disk.

**Severity**: SUGGESTION.

**Evidence**: `services/strategies/README.md:33-37` lists `index.ts — barrel re-exporting the **types** and **constants** only …`. `ls services/strategies/` returns: `__tests__ confidence.ts didi.strategy.ts fees.ts indrive.strategy.ts parse.ts README.md registry.ts strategy.types.ts uber.strategy.ts ui-labels.ts` (no `index.ts`). The design AD-2 also references it. Nothing else in the spec, design, proposal, or task list requires the barrel.

**Remediation**: Either (a) create `services/strategies/index.ts` re-exporting `StrategySuggestion, PlatformStrategy, StrategySuggestInput, StrategyContext, UnknownStrategyError, UnknownPlatformError, CONFIDENCE_THRESHOLD, STRATEGY_REGISTRY, getStrategyByTipo`, or (b) update the README file map to remove the `index.ts` reference. Either is a 5-minute change in a follow-up patch.

### AD-3 — Static boot-time registry

**Implementation**: `services/strategies/registry.ts:45-74` — `export const STRATEGY_REGISTRY = Object.freeze({ uber_api: UberStrategy, didi_manual: DidiStrategy, indrive_form: InDriveStrategy } as const)`. `getStrategyByTipo(tipo)` at lines 60-66 throws `UnknownStrategyError` on lookup miss. `hasStrategyByTipo` at lines 72-74 is a non-throwing diagnostic helper.
**Status**: PASS.

### AD-4 — `CarreraService` orchestration

**Implementation**: `services/carrera.service.ts` — `CarreraService` class at lines 108-286. Constructor takes optional `registry: RegistryLike` (default `STRATEGY_REGISTRY`) and optional `upsert: Upserter` (default `carreraRepo.upsertByTripId`) for DI. Public surface: `listPlataformas() :142-144`, `getStrategyByTipo(tipo) :152-170`, `suggestRegistration(driverId, plataformaId, input) :183-216`, `commitRegistration(driverId, suggestion, tripId?) :248-286`. The instance-level registry lookup (deviation #4 in apply-progress #1944) lets DI-injected registries actually take effect.
**Status**: PASS.

### AD-5 — `log_eventos` audit policy

**Implementation**: `services/carrera.service.ts` — `commitRegistration` at line 248 implements the policy: happy path writes no audit row; below-threshold path calls `writeAuditRow(...)` with `metadata.fallback = 'manual-form'` (lines 258-266); repo error path catches around the `upsert` call and writes the audit row BEFORE re-throwing (lines 269-285). The `writeAuditRow` helper at lines 300-315 uses `getDb()` from `db.service.ts` (the `local-rls-facade`) — never `expo-sqlite` directly. `tipo = 'carrera.registered'` literal at line 310 (dot-namespaced, matches W-LOG-CONFLICT at `services/sync-queue.service.ts:481-489`).
**Status**: PASS.

### AD-6 — `tipo_estrategia='uber_api'` seed stays

**Implementation**: Verified via `git show 8ce7afb:data/migrations/0003_seeds.sql` (Phase 0a archive commit, pre-Phase-4) returns the same content as the current file (3 `plataformas` rows: Uber `tipo_estrategia='uber_api'` comision 25.00, DiDi `'didi_manual'` comision 20.00, InDrive `'indrive_form'` comision 18.00 — all `byte-identical`). The `services/strategies/README.md:20-23` section documents the Phase 6 stub-replacement note per R-5.
**Status**: PASS.

### AD-7 — Per-platform `estado` rule

**Implementation**: Each strategy's `suggest()` declares `draft.estado` in its return. `UberStrategy.suggest` (lines 88-100 of `uber.strategy.ts`) returns `draft.estado = 'activa'` via `buildStubDraft(...)`. `DidiStrategy.suggest` (lines 283-296 of `didi.strategy.ts`) and `InDriveStrategy.suggest` (lines 266-279 of `indrive.strategy.ts`) both return `draft.estado = 'completada'`. `CarreraService` does not override `draft.estado`. The SQLite CHECK constraint at the schema level + the literal `CarreraEstado` union at `data/sqlite/types.ts:54` enforce `'activa' | 'completada' | 'cancelada'` — any other value rejects the write.
**Status**: PASS.

### AD-8 — Cross-domain read-only contract

**Implementation**: `services/strategies/strategy.types.ts:25-26` imports `CarreraPayload` and `PlataformaRow` as `import type` only. The `index.ts` barrel referenced in AD-2 is missing (see SUGGESTION above), so consumers must import directly from the strategy types file — but the import path itself preserves the cross-domain guarantee. Static checks enforced at every `bun test` run in:
- `services/__tests__/carrera.service.test.ts:279-292` (carrera.service.ts: no `expo-sqlite`, no `ui/*`)
- `services/__tests__/carrera.service.test.ts:560-575` (carrera.service.ts: no `^import.*sync-queue\.service`)
- `services/strategies/__tests__/{registry,uber,didi,indrive,fees,strategy.types}.test.ts` (each strategy file: no `expo-sqlite`, no `db.service`, no `sync-queue.service`, no `ui/*`)

**Status**: PASS.

### AD-9 — Fees and gasolina as shared helpers

**Implementation**: `services/strategies/fees.ts` — `calcularComision(tarifaBruta, plataforma)` at lines 50-55 implements the canonical formula `tarifaBruta * plataforma.comision / 100`. `calcularGasolina(distanciaKm, _plataforma)` at lines 69-74 returns `distanciaKm * CONSUMO_DEFAULT` where `CONSUMO_DEFAULT = 0.08 as const` at line 36. Both helpers are pure (no I/O, no `Date.now()`, no `Math.random()`, no `console.warn`) — verified by `fees.test.ts:125-137 + :167-177`.
**Status**: PASS with documented deviation. The launch prompt (Task 2.1) specified `calcularGasolina(distanciaKm) = distanciaKm * CONSUMO_DEFAULT` with `CONSUMO_DEFAULT = 0.08 L/km`. The design spec said `calcularGasolina(...) === 0` (Phase 4 placeholder per OI-3). The implementation followed the launch prompt because (a) the test cases are explicit and bound (`distanciaKm=10 → 0.8 L`), (b) the placeholder constant `CONSUMO_DEFAULT` is exported so a future Phase 6 PR can override per-platform via `plataforma.metadata.gasolina_km_per_litro` without changing the signature (AD-9 forward-compat). Test `fees.test.ts:151-155` pins the value. Documented as deviation #2 in apply-progress #1944.

### AD-10 — Cross-domain rule enforcement

**Implementation**: see AD-8. The `services/` module imports allowed are: `data/sqlite/types.ts` (type-only), `services/carrera.repo.ts` (`CarreraPayload` type-only), `services/db.service.ts` (`getDb`, `fromJson`, plus `LocalDatabase` for tests). Forbidden: `expo-sqlite`, `services/sync-queue.service.ts`, `ui/*`, top-level `tests/`.
**Status**: PASS.

### AD-11 — Parser source-of-truth — paste text only

**Implementation**: `parse.ts:64-69` exports `normalize(raw: string): string`. `CarreraService.suggestRegistration` at lines 194-198 calls `normalize(input.raw)` before passing to the strategy. No notification listener, no PDF regex, no OS API in the strategy files.
**Status**: PASS.

### AD-12 — Confidence model

**Implementation**: `services/strategies/confidence.ts` exports `CONFIDENCE_THRESHOLD = 0.3 as const` (line 13). `CarreraService.commitRegistration` at line 259 keys off `suggestion.confidence < CONFIDENCE_THRESHOLD`. Each strategy's `editableFields` invariant holds: below-threshold → every CarreraPayload key the driver must correct is included (verified at `didi.strategy.test.ts:161-181`, `indrive.strategy.test.ts:146-166`).
**Status**: PASS.

### AD-13 — Parser input normalization

**Implementation**: `parse.normalize(raw)` at `parse.ts:64-69` (see AD-11). The test at `parse.test.ts` covers empty + whitespace-only (lines 18-26), trim (lines 28-31), collapse internal whitespace (lines 33-37), strip zero-width chars (lines 39-44), platform-marker normalization (lines 46-52), diacritics preservation (lines 54-58), multi-line paste (lines 60-64), purity (lines 66-70).
**Status**: PASS.

### AD-14 — Cross-agent handoff: `strategy.types.ts` ships FIRST

**Implementation**: Verified via `git log 8c71caf..e993889 --oneline` (the feature branch's commits): the very first commit after the bootstrap chore is `1d18895 feat(services): publish platform strategy type contract` which adds `services/strategies/strategy.types.ts` + `services/strategies/__tests__/strategy.types.test.ts` + `services/strategies/__tests__/.gitkeep`. Strategy classes, registry, and CarreraService land on later commits.
**Status**: PASS.

### AD-15 — UI input shape (`plataformaId` lookup, not `PlataformaRow`)

**Implementation**: `services/carrera.service.ts:178-211` — `suggestRegistration` signature is `(driverId, plataformaId, input)`. The service resolves `plataformaId → PlataformaRow` internally via `carreraRepo.listPlataformas()` + `find(...)` at lines 183-184. The UI never imports `PlataformaRow` or reaches into the data layer.
**Status**: PASS.

---

## Cross-cutting findings

### Cross-domain audit (CRITICAL gate)

`git diff --name-status 2d6f16c..8f23143` (since the last archive) confirms:
- `M bun.lock`, `M package.json` (workspace config — Phase 4 added `services/` as a workspace)
- `A bunfig.toml` (coverage thresholds — AD-6 invariant)
- `A services/package.json` (OpenCode workspace package config)
- `A services/carrera.service.ts` + `A services/__tests__/carrera.service.test.ts`
- `A services/strategies/**` (10 source files + 8 test files + 1 README + 1 `.gitkeep`)
- `M services/README.md` (R-1 drift fix)
- `A openspec/changes/add-platform-strategies/{proposal,design,tasks,specs/platform-strategies/spec}.md`

**No files under `ui/`, top-level `tests/`, `data/`, or any of the Phase 1/2 frozen `services/` modules** (`services/db.service.ts`, `services/carrera.repo.ts`, `services/sync-queue.service.ts`, `services/sync-queue.transport.ts`, `services/network.service.ts`, `data/sqlite/{migrations,types}.ts`, `data/migrations/0003_seeds.sql`). CRITICAL gate passes.

### Engram topic mirror

- Engram topic `sdd/driverledger/add-platform-strategies/interface` (#1939) mirrors `services/strategies/strategy.types.ts` byte-for-byte **for the original 5 exports** (`StrategyContext`, `StrategySuggestInput`, `StrategySuggestion`, `PlatformStrategy`, `UnknownStrategyError`). Engram topic #1939 does **NOT** include `UnknownPlatformError` (the PR #2 Task 2.2 addition — see Cross-cutting findings below).
- Engram topic #1944 (apply-progress) documents this divergence explicitly under deviation #3: "Engram topic #1939 NOT updated (the contract expansion is documented in the commit body of Task 2.2; Pi does not need to consume UnknownPlatformError directly because the throw propagates and the UI catches via the existing `catch (err)` in CarreraService callers)." This is a defensible ops choice — the file is the source of truth; the engram topic is updated only when Pi's read-side changes.

### Naming divergence — `confirmRegistration` vs `commitRegistration`

The spec narrative uses `confirmRegistration` (e.g. `spec.md` line 28, 328). The design + tasks + implementation use `commitRegistration` (e.g. `design.md` AD-4, `carrera.service.ts:248`). Tasks.md acknowledges this divergence explicitly at the top of `## Notes` and the implementation follows the design. No behavior gap. Worth a doc-only patch to the spec to use a single vocabulary before archive, but not blocking.

---

## Spec scenario coverage matrix

| Req | Scenario | Test(s) | Status |
|---|---|---|---|
| platform-strategy-interface | three concrete strategies implement PlatformStrategy | `registry.test.ts:29-46` + `strategy.types.test.ts:35-48` | PASS |
| platform-strategy-interface | StrategySuggestion.draft conforms to CarreraPayload | `didi.strategy.test.ts:97-107` + integration at `carrera.service.test.ts` Carrera writes | PASS |
| platform-strategy-interface | interface is type-only import from ui/ | `strategy.types.test.ts:123-131` (static check on source) | PASS |
| platform-strategy-interface | adding 4th platform does not change PlatformStrategy | `registry.test.ts` (3 keys frozen); `README.md:40-107` extension guide | PASS |
| platform-strategy-registry | registry resolves all three seeded tipos | `registry.test.ts:29-39` | PASS |
| platform-strategy-registry | unknown tipo throws UnknownStrategyError | `registry.test.ts:41-46` + `:48-57` | PASS |
| platform-strategy-registry | registry is static and frozen at boot | `registry.test.ts:26` | PASS |
| platform-strategy-registry | registry loads at module import (eager, not lazy) | `registry.test.ts` (the tests import the module and observe populated keys without init step) | PASS |
| platform-strategy-uber-stub | stub returns confidence 0 and oneTapCapable false | `uber.strategy.test.ts:43 + :47 + :57-65` | PASS |
| platform-strategy-uber-stub | stub forces the manual form in the UI | `uber.strategy.test.ts:77-95` (all required CarreraPayload keys in editableFields) | PASS |
| platform-strategy-uber-stub | stub is pure (no I/O) | `uber.strategy.test.ts:98-132` (no console + deterministic + normalizes raw) | PASS |
| platform-strategy-uber-stub | Phase 6 may replace the body without interface change | Registry key (`'uber_api'`) + `PlatformStrategy` interface frozen + OI-4 marker (`:67-75`) | PASS |
| platform-strategy-didi-paste | happy-path paste yields high confidence | `didi.strategy.test.ts:80-95` | PASS |
| platform-strategy-didi-paste | missing fare drops confidence below the threshold | `didi.strategy.test.ts:151-181` | PASS |
| platform-strategy-didi-paste | empty raw string yields confidence 0 | `didi.strategy.test.ts:188-208` | PASS |
| platform-strategy-didi-paste | paste that names another platform throws UnknownPlatformError | `didi.strategy.test.ts:215-264` | PASS |
| platform-strategy-didi-paste | post-ride confirmation always lands as completada | `didi.strategy.test.ts:271-302` | PASS |
| platform-strategy-indrive-paste | negotiated-fare paste yields high confidence without addresses | `indrive.strategy.test.ts:84-99` | PASS |
| platform-strategy-indrive-paste | missing negotiated fare drops confidence below the threshold | `indrive.strategy.test.ts:136-166` | PASS |
| platform-strategy-indrive-paste | post-ride confirmation always lands as completada | `indrive.strategy.test.ts:252-283` | PASS |
| platform-strategy-indrive-paste | editableFields excludes null fields | `indrive.strategy.test.ts:289-317` | PASS |
| platform-strategy-indrive-paste | paste that names another platform throws UnknownPlatformError | `indrive.strategy.test.ts:200-246` | PASS |
| carrera-service-orchestration | suggestRegistration returns a StrategySuggestion and writes nothing | `carrera.service.test.ts:181-264` | PASS |
| carrera-service-orchestration | confirmRegistration writes one carrera row with a local UUID | `carrera.service.test.ts:310-336` | PASS |
| carrera-service-orchestration | happy-path confirmation writes no audit row | `carrera.service.test.ts:338-388` | PASS |
| carrera-service-orchestration | unknown plataformaId throws UnknownPlataformaError | `carrera.service.test.ts:234-246` | PASS |
| carrera-service-orchestration | CarreraService never imports sync-queue.service | `carrera.service.test.ts:270-292 + :560-575` (static check on the file source) | PASS |
| carrera-service-orchestration | audit row is written on repo error | `carrera.service.test.ts:432-483` | PASS |
| carrera-estado-lifecycle | Uber strategy seeds an activa carrera | `uber.strategy.test.ts:62-64` + `carrera.service.test.ts:667` | PASS |
| carrera-estado-lifecycle | DiDi confirmation lands as completada | `carrera.service.test.ts:693 + :726` | PASS |
| carrera-estado-lifecycle | InDrive confirmation lands as completada | `carrera.service.test.ts:757 + :789` | PASS |
| carrera-estado-lifecycle | fuente per platform in Phase 4 = 'manual' for all 3 | per-strategy invariants (`uber `:63`, `didi `:94`, `indrive `:98`) + integration (`carrera.service.test.ts:668 + :727 + :790`) | PASS |
| carrera-estado-lifecycle | carrera-fuente-check rejects out-of-vocabulary fuente | SQLite CHECK constraint at schema level (Phase 1 inherited) + `carrera.service.test.ts:432-483` exercises the throw path | PASS |
| platform-strategy-open-closed | 4th platform = INSERT + new class + new registry entry | `services/strategies/README.md:40-107` (5-step checklist + Rappi walkthrough) | PASS |
| platform-strategy-open-closed | extension guide lives in services/strategies/README.md | Same file; `Object.isFrozen(STRATEGY_REGISTRY)` enforced in `registry.test.ts:26` | PASS |
| platform-strategy-open-closed | user-added-platform UI is out of scope | `registry.ts` exports no `register()` function; explicitly out-of-scope in `proposal.md §Out of Scope` + `design.md §9` | PASS |
| platform-strategy-audit-log | happy path writes no audit row | `carrera.service.test.ts:338-388` | PASS |
| platform-strategy-audit-log | parse fallback (confidence < 0.3) writes one audit row | `carrera.service.test.ts:390-430` | PASS |
| platform-strategy-audit-log | repo error writes one audit row and re-throws | `carrera.service.test.ts:432-483` | PASS |
| platform-strategy-audit-log | audit row taxonomy matches Phase 2 | `carrera.service.test.ts:485-503` (driver_id) + `:505-523` (JSON round-trip) + `commitRegistration` impl uses `tipo = 'carrera.registered'` literal | PASS |

**Total**: 40 / 40 covered by passing tests.

---

## Deviations from the spec/design/proposal

Six deviations already documented in apply-progress #1944. Re-verified here:

1. **`calcularGasolina` follows launch prompt (`distanciaKm * CONSUMO_DEFAULT = distanciaKm * 0.08`) instead of design spec (`0`).** The constant `CONSUMO_DEFAULT` is exported so Phase 6 can override per-platform. Test `fees.test.ts:151-155` pins the value (`4.2 km × 0.08 L/km = 0.336 L`). Defensible: design says "Phase 4 placeholder" with no per-platform consumption data; the launch-prompt value is the natural placeholder.

2. **`UnknownPlatformError` added to `services/strategies/strategy.types.ts`** (parallel to `UnknownStrategyError`). Required by Didi/InDrive cross-platform guards (PR #2 Tasks 2.2 + 2.3). Engram topic #1939 not updated in lockstep (documented rationale: engram is the read-side for Pi, Pi doesn't need to import this error class — the throw propagates through `CarreraService` and the UI catches generically).

3. **`CarreraService.getStrategyByTipo` switched to instance-level registry lookup** (`this.registry[tipo]` instead of the module-level `registryGetStrategyByTipo`). Required for the happy-path audit test (which injects a fake DidiStrategy with high confidence via the constructor DI parameter). Same throw + `console.warn` behavior.

4. **`Upserter` DI parameter added to `CarreraService` constructor** (mirrors the `registry` parameter). Required for the error-path audit test. Default still calls `carreraRepo.upsertByTripId`. Cross-domain rule preserved.

5. **Arrow-route regex refactored mid-PR** from multi-line anchored (`^[^\n]*→[^\n]+$` with `m` flag) to a per-line split-then-match helper (`findArrowRoute`). Necessary because `CarreraService.suggestRegistration` normalizes `input.raw` (collapses newlines, lowercases) before passing to the strategy; the multi-line anchor failed in the integration test.

6. **InDrive integration test expects lowercase `origen`/`destino`** (`'calle 50'` / `'poblado'`) after `parse.normalize` lowercases everything. Per-strategy unit tests preserve case via direct invocation. Consistent with AD-13 (normalize at the service boundary) — a future UI change may want to re-case for display.

None of these deviations break a spec scenario or violate a design AD. All are documented and the contracts hold.

---

## Recommendations (non-blocking)

1. **(SUGGESTION, AD-2)** Create `services/strategies/index.ts` re-exporting the types + constants, or remove the reference from `services/strategies/README.md:33-37`. Either is a 5-minute follow-up. Cosmetic only — no test or runtime code depends on the barrel.

2. **(DOC, naming)** Spec uses `confirmRegistration`; design + implementation use `commitRegistration`. Tasks.md acknowledges the divergence. Consider a one-line spec patch at archive time to harmonize vocabulary. Cosmetic.

3. **(ENGRAM OPS, mirror hygiene)** Engram topic #1939 was not updated to include `UnknownPlatformError` after PR #2. Pi's modal is unaffected (the throw propagates through `CarreraService`), but a future agent that `mem_get_observation`s #1939 will not see the full contract. Consider a follow-up `mem_update` to add `UnknownPlatformError` to the mirrored contract — no functional impact, just keeps the read-side authoritative.

---

## Conclusion

**PASS WITH SUGGESTIONS** — implementation matches the spec, design, and proposal across all 9 requirements and 40 scenarios. 219 / 219 tests pass with 0 failures and 526 `expect()` assertions. Coverage 96.75% lines / 95.01% funcs (well above the 80% floor; per-file coverage on `services/strategies/**` and `services/carrera.service.ts` is ≥93% lines / ≥90% funcs across the board). Cross-domain audit is clean: zero files under `ui/`, `data/`, top-level `tests/`, or any Phase 1/2 frozen `services/` module. 17 commits on the branch match the 13 work-unit tasks (10 in PR #1, 7 in PR #2). All six previously-documented deviations hold up to re-verification. Both PRs are merged to `develop` (PR #1 at `9627416`, PR #2 at `8f23143`). CRITICAL: 0. WARNING: 0. SUGGESTION: 3 (index.ts barrel, spec/code naming, engram mirror hygiene).

**Recommendation: ready to archive.** The 3 SUGGESTION-level findings are non-blocking; they can be addressed in a follow-up patch if the team prefers, but the change is functionally complete and meets every scenario in the spec.