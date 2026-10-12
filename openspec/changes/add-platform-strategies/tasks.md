# Tasks: add-platform-strategies

> **Phase 4 of `docs/PRD-consolidado.md §8`.** Strategy pattern for Uber / DiDi / InDrive + `CarreraService` orchestration, the open-closed seam from `docs/RFC-001-arquitectura.md §Open-closed` and `docs/RFC-003-logica-registro.md §Strategy + §Confirmación de un toque`. Phase 3 (Pi territory) consumes the `StrategySuggestion` contract this PR #1 publishes; Phase 6 replaces the `UberStrategy` stub body without touching the interface.
>
> **Branch**: `feature/add-platform-strategies`
> **Base**: `develop`
> **Review Workload Forecast** (echoed from `design.md §3`):
> - Total LOC: ~1,535
> - PR #1 LOC: ~540
> - PR #2 LOC: ~990
> - 400-line budget risk: **High**
> - Chained PRs recommended: **Yes**
> - Decision needed before apply: **Yes** (cached `delivery_strategy = ask-on-risk` → orchestrator surfaces the split to the user; user picks `chained PRs + chain_strategy` or `single-pr + size:exception`)

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
400-line budget risk: High
```

**Work-unit commits (convention)**. Each task is a single commit. Conventional Commits only. No AI attribution. No "Co-Authored-By". One commit per task in PRs 1.1-1.7 and 2.1-2.6.

**Cross-domain rule** (reasserted from `docs/documento-maestro-agentes.md §1-5` + `docs/gitflow.md §3`). This change touches ONLY `services/strategies/**`, `services/carrera.service.ts`, `services/__tests__/{strategies,carrera.service}.test.ts`, `services/README.md`, `bunfig.toml`, and `openspec/changes/add-platform-strategies/`. Never `ui/`, never top-level `tests/`, never `data/`, never `services/db.service.ts`, never `services/carrera.repo.ts`, never `services/sync-queue.service.ts`. Enforced at `sdd-apply` pre-flight via `git diff develop --stat`.

**TDD posture** (Standard TDD per cached `testing-capabilities = null`). For each per-strategy task, the **test file is written first**; it goes RED; the implementation lands and turns it GREEN. The integration test (`services/__tests__/carrera.service.test.ts`) ships as the last task of PR #2 alongside the full `CarreraService` (Task 2.4 wires it; Task 2.5 extends it).

---

## PR #1 — feat: add platform strategy contract + registry + Uber stub

> **Goal**: publish the cross-domain `PlatformStrategy` interface so Phase 3 Pi (separate branch) can `import type` and `mem_get_observation` `sdd/driverledger/add-platform-strategies/interface` immediately after PR #1 merges. Ship the static registry, the input-normalization helper, the `UberStrategy` Phase 4 stub, and a `CarreraService` skeleton that can resolve platforms and return suggestions (no DB writes yet). `services/README.md` naming drift (R-1) is fixed alongside PR #1.
>
> **LOC**: ~540 (12 files: 4 source + 4 tests + 1 README + 1 barrel + 1 strategies README + 1 services README update).

### PR #1 Task 1.1: Publish cross-domain contract (FIRST commit)

- **Files**: `services/strategies/strategy.types.ts` (NEW), `services/strategies/__tests__/.gitkeep` (NEW empty marker so the directory is tracked)
- **Test command**: n/a (types-only file; verified by `tsc --noEmit` from the downstream `services/carrera.service.ts` and engram topic #1939)
- **Depends on**: none
- **Acceptance criteria**:
  - [x] File exports `StrategySuggestion`, `PlatformStrategy`, `StrategySuggestInput`, `StrategyContext` (TypeScript types only — no runtime values)
  - [x] File also exports `UnknownStrategyError` as a runtime `Error` subclass (Pi may want the typed error in M01 catch blocks)
  - [x] Mirrors engram topic `sdd/driverledger/add-platform-strategies/interface` (#1939) byte-for-byte
  - [x] `import type { CarreraPayload } from '../carrera.repo'` is the only inter-module import
  - [x] No `import` of `expo-sqlite`, `ui/*`, `services/db.service`, `services/sync-queue.service`, or `top-level tests/*`
- **Spec requirements covered**: `platform-strategy-interface`
- **Design ADs referenced**: AD-1, AD-8, AD-14
- **Rollback**: `git revert <commit>` — no runtime impact (types erased at compile); only `ui/` type imports break (mitigated by R-7: never revert after Pi has shipped)
- **Commit message**: `feat(services): publish platform strategy type contract`

### PR #1 Task 1.2: Static registry + 0.3 confidence constant

- **Files**: `services/strategies/registry.ts` (NEW), `services/strategies/confidence.ts` (NEW), `services/strategies/__tests__/registry.test.ts` (NEW), `services/strategies/__tests__/confidence.test.ts` (NEW)
- **Test command**: `bun test services/strategies/__tests__/registry.test.ts services/strategies/__tests__/confidence.test.ts`
- **Depends on**: 1.1
- **Acceptance criteria**:
  - [x] `services/strategies/confidence.ts` exports `export const CONFIDENCE_THRESHOLD = 0.3 as const`; the test asserts the literal value (no magic-number drift)
  - [x] `services/strategies/registry.ts` exports `getStrategyByTipo(tipo: string): PlatformStrategy` which throws `UnknownStrategyError` with the offending `tipo` in the message
  - [x] `UnknownStrategyError extends Error`; `.name === 'UnknownStrategyError'`; `.tipo` property equals the offending key (test asserts `instanceof Error` + `.message.includes(tipo)`)
  - [x] In Task 1.2, only `UberStrategy` is registered; `getStrategyByTipo('uber_api')` returns the stub, `getStrategyByTipo('didi_manual')` and `getStrategyByTipo('indrive_form')` throw `UnknownStrategyError`. PR #2 Tasks 2.2 and 2.3 register the remaining two.
  - [x] `STRATEGY_REGISTRY` is declared as `Object.freeze({ uber_api: new UberStrategy() })` (or empty + populated at module import — whichever the implementation prefers; the test asserts `Object.isFrozen(...)` is `true` after module load)
  - [x] Registry loads eagerly at module import (test imports the module in isolation and observes the populated key without any explicit init)
  - [x] `registry.test.ts` is written **first** and is RED before `registry.ts` lands; `confidence.test.ts` is written **first** and is RED before `confidence.ts` lands
- **Spec requirements covered**: `platform-strategy-registry` (all 4 scenarios)
- **Design ADs referenced**: AD-3, AD-12
- **Rollback**: `git revert <commit>` — registry only resolves `uber_api` post-1.2; before PR #2 lands, `didi_manual` / `indrive_form` lookups throw (defensible runtime behaviour, documented in commit body)
- **Commit message**: `feat(services): add static platform strategy registry and confidence threshold`

### PR #1 Task 1.3: `UberStrategy` Phase 4 stub + `parse.ts` input normalizer

- **Files**: `services/strategies/uber.strategy.ts` (NEW), `services/strategies/parse.ts` (NEW), `services/strategies/__tests__/uber.strategy.test.ts` (NEW), `services/strategies/__tests__/parse.test.ts` (NEW)
- **Test command**: `bun test services/strategies/__tests__/uber.strategy.test.ts services/strategies/__tests__/parse.test.ts`
- **Depends on**: 1.1 (types), 1.2 (registry — registry has `new UberStrategy()` and importing registry.ts triggers its construction)
- **Acceptance criteria**:
  - [x] `UberStrategy.tipo === 'uber_api'` (test asserts)
  - [x] `UberStrategy.oneTapCapable === false` (test asserts)
  - [x] `suggest({ raw: '<any non-empty text>', context: {} })` returns:
    - `confidence === 0`
    - `draft.fuente === 'manual'`
    - `draft.estado === 'activa'`
    - `draft.plataforma_id === ''` (overridden by `CarreraService.suggestRegistration` before returning to UI)
    - `draft.metadata = { phase4_stub: true, awaiting_phase6: 'api', platform_session_id: 'phase4-stub-pending-phase6' }` (per OI-4 — test asserts the `platform_session_id` marker)
  - [x] `editableFields` covers every `CarreraPayload` key the driver must fill manually: `plataforma_id`, `tarifa_bruta`, `comision`, `origen`, `destino`, `distancia_km`, `duracion_min`, `gasolina`, `fecha`
  - [x] `suggest` is **pure**: no I/O, no `getDb()`, no `Date.now()`, no `Math.random()`. Test calls `suggest` twice with the same input and asserts deterministic shape equality; a separate test asserts no `console.warn`/`console.error` is emitted on any path (use a stubbed `console.warn`).
  - [x] `parse.ts` exports a `normalize(raw: string): string` helper (trim → strip non-printable → collapse internal whitespace). Tests cover leading/trailing whitespace, zero-width chars (`​`), multi-line paste with embedded `\n`.
  - [x] `UberStrategy.suggest` calls `parse.normalize(input.raw)` before constructing the stub draft.
  - [x] `parse.ts` is pure — no I/O, no `Date.now()`.
  - [x] Both test files written **first**, RED, then implementation lands GREEN.

> **Deviation (documented)**: Task 1.3 was landed BEFORE Task 1.2 in this PR. The registry cannot import `UberStrategy` without the strategy existing first, and Task 1.2's test (`getStrategyByTipo('uber_api')` returns `UberStrategy`) requires the strategy to exist at registry-load time. Land order in this PR: 1.1 → 1.3 → 1.2 → 1.4 → 1.5 → 1.6 → 1.7.
- **Spec requirements covered**: `platform-strategy-uber-stub` (all 4 scenarios)
- **Design ADs referenced**: AD-1, AD-6, AD-11, AD-13, AD-15
- **Rollback**: `git revert <commit>` — `uber_api` strategy is a no-op stub; `CarreraService.suggestRegistration` would throw `UnknownStrategyError` for Uber until the stub is re-registered
- **Commit message**: `feat(services): add UberStrategy Phase 4 stub with input normalization`

### PR #1 Task 1.4: `CarreraService` skeleton (resolve + suggest, no commit yet)

- **Files**: `services/carrera.service.ts` (NEW — suggest-only side), `services/__tests__/carrera.service.test.ts` (NEW — first 3 scenarios only: `listPlataformas`, `getStrategyByTipo`, `suggestRegistration` happy path)
- **Test command**: `bun test services/__tests__/carrera.service.test.ts`
- **Depends on**: 1.1 (types), 1.2 (registry), 1.3 (Uber stub), plus Phase 1 `services/carrera.repo.ts:187-192` (`listPlataformas`) and `services/db.service.ts` (`getBridge`, `getDb` — read-only)
- **Acceptance criteria**:
  - [x] `CarreraService` is a class with a single frozen instance state (the registry reference; AD-4, DQ-2).
  - [x] Constructor takes an optional `registry: Readonly<Record<string, PlatformStrategy>>` for DI; defaults to `STRATEGY_REGISTRY`.
  - [x] `listPlataformas(): Promise<PlataformaRow[]>` re-exports `carreraRepo.listPlataformas()`.
  - [x] `getStrategyByTipo(tipo: string): PlatformStrategy` re-exports `getStrategyByTipo` from the registry; `console.warn` logs once on `UnknownStrategyError`.
  - [x] `suggestRegistration(driverId: string, plataformaId: string, input: StrategySuggestInput): Promise<StrategySuggestion>`:
    - resolves `plataformaId` to a `PlataformaRow` via `listPlataformas()`; throws `UnknownPlataformaError` if not found (typed `Error` subclass with `.plataformaId` property)
    - resolves the strategy via `getStrategyByTipo(plataforma.tipo_estrategia)`
    - calls `strategy.suggest(input)` (where `input.raw` has already been normalized via `parse.normalize(...)` if non-empty — service-side, not strategy-side; AD-13)
    - mutates `suggestion.draft.plataforma_id = plataformaId` (per AD-15 + spec scenario `platform-strategy-interface §StrategySuggestion.draft conforms to CarreraPayload`)
    - returns the suggestion; **no DB write**
  - [x] `suggestRegistration` accepts a `plataformaId: string` (NOT a `PlataformaRow` — AD-15 / DQ-4); the service resolves internally
  - [x] **OI-1 update**: add `plataforma: PlataformaRow` to `StrategySuggestInput` so the strategy is self-contained (resolve in Task 1.4 + update the engram topic `sdd/driverledger/add-platform-strategies/interface` in lockstep via `mem_update` after the file lands; mention this in the commit body)
  - [x] **No `import` of `services/sync-queue.service.ts`** (cross-domain rule, AD-10, R-8)
  - [x] **No `import` of `expo-sqlite`** (Phase 1's `local-rls-facade` mandate)
  - [x] Tests cover: `listPlataformas` returns the 3 seeded `PlataformaRow` from an in-memory SQLite (Phase 1 `bun:sqlite` factory); `getStrategyByTipo('uber_api')` returns the stub; `suggestRegistration` resolves the right strategy and overrides `draft.plataforma_id`.
  - [x] In-memory SQLite factory mirrors `services/__tests__/sync-queue.service.test.ts:56-85`.
  - [x] Test file written **first**, RED, then the implementation lands GREEN.
- **Spec requirements covered**: `carrera-service-orchestration` (`suggestRegistration returns a StrategySuggestion and writes nothing` scenario), `platform-strategy-interface` (platform_id resolution scenario partial)
- **Design ADs referenced**: AD-4, AD-8, AD-10, AD-15, OI-1
- **Rollback**: `git revert <commit>` — service is a thin wrapper; `ui/` loses the single entry point but each strategy is still independently importable for unit testing
- **Commit message**: `feat(services): add CarreraService suggestion step (resolve + suggest, no write)`

### PR #1 Task 1.5: Fix `services/README.md` naming drift (R-1)

- **Files**: `services/README.md` (UPDATE)
- **Test command**: n/a (docs only)
- **Depends on**: none (can run in parallel with 1.1-1.4)
- **Acceptance criteria**:
  - [x] Lists actual shipped files for Phase 1 + 2: `carrera.repo.ts`, `db.service.ts`, `sync-queue.service.ts`, `network.service.ts`, `sync-queue.transport.ts`
  - [x] Lists Phase 4 additions: `carrera.service.ts` (NEW), `strategies/` (NEW directory with sub-files)
  - [x] Mentions the upcoming Phase 5 file `location.service.ts` (no entry until shipped)
  - [x] Removes stale PascalCase references: `CarreraService.ts`, `SyncService.ts`, `LocationService.ts`
  - [x] Marks `Ownership: OpenCode (agent/opencode)` + `Cross-domain: never ui/, never top-level tests/, never data/`
- **Spec requirements covered**: `platform-strategy-open-closed` (partial — README is part of the contract)
- **Design ADs referenced**: AD-13 (extension guide for the strategies subfolder)
- **Rollback**: `git revert <commit>` — README only
- **Commit message**: `docs(services): fix README naming drift to match shipped modules`

### PR #1 Task 1.6: Add `services/strategies/README.md` extension guide (R-7)

- **Files**: `services/strategies/README.md` (NEW)
- **Test command**: n/a (docs only)
- **Depends on**: 1.1 (types), 1.2 (registry keys), 1.3 (Uber stub)
- **Acceptance criteria**:
  - [x] Documents the 5-step open-closed extension procedure (per AD-13):
    1. `INSERT` into `plataformas` (id, nombre, comision, tipo_estrategia, metadata)
    2. Create `services/strategies/<name>.strategy.ts` implementing `PlatformStrategy`
    3. Add `<tipo_estrategia>: new <Name>Strategy()` to `STRATEGY_REGISTRY` in `services/strategies/registry.ts`
    4. Write a colocated test in `services/strategies/__tests__/<name>.strategy.test.ts`
    5. Open a new OpenSpec change (per `docs/gitflow.md §3 single-change / single-branch`)
  - [x] Explicitly notes that `UberStrategy` is a Phase 4 stub returning `confidence: 0, oneTapCapable: false, fuente: 'manual'` — **Phase 6 will replace the `suggest()` body only**; the `PlatformStrategy` interface, the `tipo: 'uber_api'` registry key, and `oneTapCapable` stay stable (R-5, OI-4)
  - [x] Section "Adding a new platform" mini-section with a Rappi walkthrough
  - [x] Section "Replacing an existing strategy body" — shows how Phase 6 swaps `UberStrategy.suggest` without changing `StrategyContext`, `StrategySuggestInput`, `StrategySuggestion`, or `PlatformStrategy`
  - [x] Section "Cross-domain import rule" — Phase 3 Pi imports `import type` from `services/strategies` only (no value-level imports of `UberStrategy`, `DidiStrategy`, `InDriveStrategy`)
- **Spec requirements covered**: `platform-strategy-open-closed` (extension guide scenario + Phase 6 example scenario)
- **Design ADs referenced**: AD-3, AD-6, AD-13, AD-14
- **Rollback**: `git revert <commit>` — docs only
- **Commit message**: `docs(services): add strategies README with open-closed extension guide`

### PR #1 Task 1.7: PR #1 coverage glob extension (OI-2)

- **Files**: `bunfig.toml` (UPDATE — extend coverage `include` glob to add `services/strategies/**` and `services/carrera.service.ts`)
- **Test command**: `bun test --coverage services/strategies/__tests__/ services/__tests__/carrera.service.test.ts` (must exit 0 with the new files at ≥ 80% lines/functions/statements/branches)
- **Depends on**: 1.3, 1.4 (the files that need to be covered)
- **Acceptance criteria**:
  - [x] `bunfig.toml` coverage `include` glob lists `services/strategies/**` and `services/carrera.service.ts` (mirrors the Phase 1 + Phase 2 precedent; the existing `data/sqlite/**` and `services/{db.service,carrera.repo}.ts` entries stay)
  - [x] `bun test --coverage` reports ≥ 80% on every new file
  - [x] CI gate (if any) does not regress for previously passing files
  - [x] No new dependencies
- **Spec requirements covered**: `local-test-coverage` (Phase 1 inherited floor)
- **Design ADs referenced**: AD-9
- **Rollback**: `git revert <commit>` — coverage config only; the new files simply drop out of the coverage report but the test suite still passes
- **Commit message**: `chore(services): extend coverage glob to strategies and carrera service`

### PR #1 — Verification (must pass before merge)

- [ ] V.1 `bun test services/strategies/__tests__/ services/__tests__/carrera.service.test.ts` exits 0 — all suites pass.
- [ ] V.2 `bun test --coverage` exits 0 with ≥ 80% on `services/strategies/**` + `services/carrera.service.ts`.
- [ ] V.3 `git diff develop --stat` shows no files under `ui/`, top-level `tests/`, `data/`, `services/db.service.ts`, `services/carrera.repo.ts`, or `services/sync-queue.service.ts` (cross-domain rule + Phase 1/2 freeze).
- [ ] V.4 Engram topic `sdd/driverledger/add-platform-strategies/interface` (#1939) is updated to reflect the OI-1 amendment (`plataforma: PlataformaRow` field on `StrategySuggestInput`). Run `mem_update` with the merged content after PR #1 lands. No AI attribution in the topic; technical artifact only.
- [ ] V.5 Conventional commits only — no `Co-Authored-By` trailers.
- [ ] V.6 After merge, Phase 3 Pi can `import type { StrategySuggestion, PlatformStrategy, StrategySuggestInput, StrategyContext } from 'services/strategies'` without runtime dependency and `mem_get_observation` the engram topic for the contract.

### PR #1 — Merge + archive (human gate 2)

- [ ] H.1 PR `feature/add-platform-strategies` (PR #1 only — squash or rebase-merge with the 7 work-unit commits + the verification chore) → `develop` after human gate 2 approval.
- [ ] H.2 **Do NOT run `openspec archive` yet** — the change stays open while PR #2 is in flight (the spec is published with PR #1's merge, the change folder stays open until both PRs land).

---

## PR #2 — feat: add DidiStrategy + InDriveStrategy + CarreraService commit + fees

> **Goal**: finish the per-platform paste parsers (`DidiStrategy`, `InDriveStrategy`), add the shared fee helpers, complete `CarreraService` with the `commitRegistration` step (write + audit policy), ship the end-to-end integration tests, and verify the coverage gate.
>
> **Depends on**: PR #1 merged into `develop`.
> **LOC**: ~990 (5 source + 3 strategy tests + 1 service integration test + 1 fees test).

### PR #2 Task 2.1: Shared fees + gasolina helpers

- **Files**: `services/strategies/fees.ts` (NEW), `services/strategies/__tests__/fees.test.ts` (NEW)
- **Test command**: `bun test services/strategies/__tests__/fees.test.ts`
- **Depends on**: Phase 1 `data/sqlite/types.ts` (`PlataformaRow`, type-only import) + `data/migrations/0003_seeds.sql:22-34` (the per-platform `comision` values: Uber 25.00, DiDi 20.00, InDrive 18.00)
- **Acceptance criteria**:
  - [ ] `calcularComision(tarifaBruta: number, plataforma: PlataformaRow): number` returns `tarifaBruta * plataforma.comision / 100` exactly. Test asserts the formula for each seeded platform with concrete numbers (`Uber: 12500 * 0.25 = 3125.00`, `DiDi: 12500 * 0.20 = 2500.00`, `InDrive: 8000 * 0.18 = 1440.00`).
  - [ ] `calcularGasolina(distanciaKm: number, plataforma: PlataformaRow): number` returns `0` for Phase 4 (placeholder per OI-3 / AD-9 + R-2). Test asserts `calcularGasolina(4.2, ...) === 0` for all three seeded platforms.
  - [ ] Both helpers are **pure**: no I/O, no `Date.now()`, no `Math.random()`, no `console.warn`. Tests call each helper twice with the same args and assert identical return values.
  - [ ] No `import` of `ui/*`, `top-level tests/*`, `services/sync-queue.service.ts`, `services/db.service.ts`, `services/carrera.repo.ts` (strategy purity invariant)
  - [ ] Test file written **first**, RED, then the implementation lands GREEN.
- **Spec requirements covered**: none directly (internal infrastructure)
- **Design ADs referenced**: AD-9
- **Rollback**: `git revert <commit>` — helpers only; downstream strategy tests would fail at compile, signalling the rollback to the next contributor
- **Commit message**: `feat(services): add shared fees and gasolina helpers`

### PR #2 Task 2.2: `DidiStrategy` paste parser

- **Files**: `services/strategies/didi.strategy.ts` (NEW), `services/strategies/__tests__/didi.strategy.test.ts` (NEW). **Add `didi_manual: new DidiStrategy()` to `STRATEGY_REGISTRY` in `services/strategies/registry.ts`** (modify the existing file).
- **Test command**: `bun test services/strategies/__tests__/didi.strategy.test.ts`
- **Depends on**: 2.1 (fees), 1.2 (registry), 1.3 (parse.ts + confidence + CarreraPayload type)
- **Acceptance criteria**:
  - [ ] `DidiStrategy.tipo === 'didi_manual'`
  - [ ] `DidiStrategy.oneTapCapable === false` in Phase 4
  - [ ] **Happy path** — paste `"DiDi Tarifa: $12.500 COP\nOrigen: Calle 10\nDestino: Centro\nDistancia: 4,2 km"` yields:
    - `confidence >= 0.7`
    - `draft.tarifa_bruta === 12500` (commas + currency markers stripped)
    - `draft.origen === 'Calle 10'`, `draft.destino === 'Centro'`
    - `draft.distancia_km === 4.2` (comma-decimal → dot-decimal)
    - `draft.comision === 2500` (computed via `calcularComision(12500, didiPlataforma)`)
    - `draft.estado === 'completada'`
    - `draft.fuente === 'manual'`
    - `draft.metadata = { parser: 'didi_strategy_v1' }` (forward-compat for Phase 6 if DiDi adds anything)
  - [ ] **Below-threshold** — paste contains no `Tarifa`, no `$`, no numeric currency → `confidence < 0.3`, `editableFields` covers `tarifa_bruta | comision | origen | destino | distancia_km | duracion_min | gasolina | fecha`
  - [ ] **Empty paste** — `raw === ''` or `raw.trim() === ''` → `confidence === 0`, `draft.tarifa_bruta === 0` (NOT `NaN`)
  - [ ] **Cross-platform** — paste contains a recognizable `Uber` brand marker (e.g. `"Uber Driver Trip"`) but no `DiDi` marker → throws `UnknownPlatformError` (extends `Error`); the test asserts `await expect(strategy.suggest({ raw, context: {} })).rejects.toThrow(UnknownPlatformError)`
  - [ ] **Per-platform estado** — every DiDi suggestion has `draft.estado === 'completada'` (AD-7)
  - [ ] **Per-platform fuente** — every DiDi suggestion has `draft.fuente === 'manual'` (AD-7, spec scenario `carrera-estado-lifecycle §fuente per platform in Phase 4`)
  - [ ] **No I/O** — strategy is pure (test asserts no DB calls; uses in-memory assertion)
  - [ ] `registry.ts` updated to register `didi_manual: new DidiStrategy()`; `didi.strategy.ts` is the only file added in this commit outside tests + the registry modification
  - [ ] Test file written **first**, RED, then the implementation lands GREEN.
- **Spec requirements covered**: `platform-strategy-didi-paste` (all 5 scenarios) + `carrera-estado-lifecycle` (`DiDi confirmation lands as completada` scenario)
- **Design ADs referenced**: AD-1, AD-7, AD-11, AD-12
- **Rollback**: `git revert <commit>` — `didi_manual` is not registered after revert; registry lookup throws `UnknownStrategyError` for DiDi (defensible runtime behaviour)
- **Commit message**: `feat(services): add DidiStrategy paste parser`

### PR #2 Task 2.3: `InDriveStrategy` paste parser

- **Files**: `services/strategies/indrive.strategy.ts` (NEW), `services/strategies/__tests__/indrive.strategy.test.ts` (NEW). **Add `indrive_form: new InDriveStrategy()` to `STRATEGY_REGISTRY` in `services/strategies/registry.ts`** (modify the existing file).
- **Test command**: `bun test services/strategies/__tests__/indrive.strategy.test.ts`
- **Depends on**: 2.1 (fees), 2.2 (`didi.strategy.ts` precedent + the now-shared fees signatures + the registry pattern), 1.3 (parse.ts + CarreraPayload type)
- **Acceptance criteria**:
  - [ ] `InDriveStrategy.tipo === 'indrive_form'`
  - [ ] `InDriveStrategy.oneTapCapable === false` in Phase 4
  - [ ] **Happy path** — paste `"InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado"` (no distance line) yields:
    - `confidence >= 0.7`
    - `draft.tarifa_bruta === 8000` (parsed from the `acordado` keyword, NOT the `Tarifa` keyword)
    - `draft.origen === 'Calle 50'`, `draft.destino === 'Poblado'`
    - `draft.distancia_km === null` (InDrive pastes frequently omit distance; absence is not a parse failure)
    - `draft.comision === 1440` (computed via `calcularComision(8000, indrivePlataforma)`)
    - `draft.estado === 'completada'`
    - `draft.fuente === 'manual'`
    - `draft.metadata = { parser: 'indrive_strategy_v1' }`
  - [ ] **Below-threshold** — paste contains no `acordado` keyword AND no numeric fare → `confidence < 0.3`, `editableFields` covers the required fields
  - [ ] **editableFields excludes null fields** — when `origen` is unparsed (`null`), `editableFields` does NOT include `'origen'`; the rule applies symmetrically to `destino`, `distancia_km`, `duracion_min`, `gasolina`. Test asserts `editableFields.includes('tarifa_bruta') === true` AND `editableFields.includes('origen') === false` for this case.
  - [ ] **Cross-platform** — paste contains `Uber` or `DiDi` brand markers but no `InDrive` marker → throws `UnknownPlatformError`
  - [ ] **Per-platform estado** — every InDrive suggestion has `draft.estado === 'completada'`
  - [ ] **Per-platform fuente** — every InDrive suggestion has `draft.fuente === 'manual'`
  - [ ] **No I/O** — strategy is pure
  - [ ] `registry.ts` updated to register `indrive_form: new InDriveStrategy()`
  - [ ] Test file written **first**, RED, then the implementation lands GREEN.
- **Spec requirements covered**: `platform-strategy-indrive-paste` (all 5 scenarios) + `carrera-estado-lifecycle` (`InDrive confirmation lands as completada` scenario)
- **Design ADs referenced**: AD-1, AD-7, AD-11, AD-12
- **Rollback**: `git revert <commit>` — `indrive_form` not registered after revert; registry lookup throws `UnknownStrategyError` for InDrive
- **Commit message**: `feat(services): add InDriveStrategy paste parser`

### PR #2 Task 2.4: `CarreraService` commit step (write + audit + no manual enqueue)

- **Files**: `services/carrera.service.ts` (UPDATE — add `commitRegistration` and `writeAuditRow`), `services/strategies/ui-labels.ts` (NEW — the `PLATFORM_UI_LABELS` map per R-2 / proposal `R-2`), `services/__tests__/carrera.service.test.ts` (UPDATE — extend with 5 commit-scenarios)
- **Test command**: `bun test services/__tests__/carrera.service.test.ts`
- **Depends on**: 2.2, 2.3 (all 3 strategies registered), 1.4 (skeleton), Phase 1 `services/carrera.repo.ts:66-139` (`upsertByTripId`), Phase 1 `services/db.service.ts` (`getBridge`, `getDb`, the `LocalDatabase` interface for the audit row INSERT).
- **Acceptance criteria**:
  - [ ] `commitRegistration(driverId: string, suggestion: StrategySuggestion, tripId?: string): Promise<CarreraRow>`:
    - generates `tripId = crypto.randomUUID()` if not supplied (idempotent per Phase 1's `UNIQUE(driver_id, trip_id)` constraint)
    - calls `carreraRepo.upsertByTripId(driverId, generatedTripId, suggestion.draft)` exactly once
    - **does NOT import `services/sync-queue.service.ts`** (cross-domain, R-8, AD-10) — the auto-enqueue funnel at `services/sync-queue.service.ts:547-549` catches the row structurally via `dbChange$`
    - **does NOT import `expo-sqlite`** directly (Phase 1 `local-rls-facade`)
  - [ ] **Happy path** (suggestion.confidence >= 0.3 AND repo resolves) — NO `log_eventos` row is inserted by `commitRegistration`. Test asserts `SELECT COUNT(*) FROM log_eventos WHERE tipo = 'carrera.registered'` equals the pre-confirm count.
  - [ ] **Below-threshold path** (suggestion.confidence < 0.3) — ONE `log_eventos` row is inserted with:
    - `tipo = 'carrera.registered'`
    - `metadata.fallback = 'manual-form'`
    - `metadata.plataforma_id = <the plataformaId>`
    - `metadata.trip_id = <the generatedTripId>`
    - the `metadata` column round-trips through `JSON.parse(JSON.stringify(metadata))` (valid JSON)
    - INSERT goes through `getDb()` (Phase 1 facade, NOT raw `expo-sqlite`)
    - Test asserts `SELECT COUNT(*) FROM log_eventos WHERE tipo = 'carrera.registered'` increases by exactly 1.
  - [ ] **Repo error path** (`carreraRepo.upsertByTripId` throws) — ONE `log_eventos` row is inserted with `tipo = 'carrera.registered'`, `metadata.error = '<message>'`, `metadata.plataforma_id`, `metadata.trip_id`. The original exception propagates AFTER the audit row is committed. Test asserts `await expect(...).rejects.toThrow(...)` AND the audit row count increase.
  - [ ] **Audit row taxonomy** — `tipo` is the literal string `'carrera.registered'` (dot-namespaced, matches W-LOG-CONFLICT precedent at `services/sync-queue.service.ts:481-489`); `driver_id` column equals the `driverId` argument.
  - [ ] `services/strategies/ui-labels.ts` exports `PLATFORM_UI_LABELS: Readonly<Record<string, string>>` (e.g. `uber_api: 'Modo API'`, `didi_manual: 'Modo manual (captura)'`, `indrive_form: 'Modo formulario'`). Phase 3 Pi imports this value-level from `services/strategies/ui-labels`. This is the **one** value-level cross-domain import from `services/` to `ui/` (OI-5, accepted exception per the design).
  - [ ] The `CarreraService` class is unchanged in shape — same constructor signature, same `listPlataformas` / `getStrategyByTipo` / `suggestRegistration` / `commitRegistration` surface. Tests already in PR #1 Task 1.4 still pass.
  - [ ] Update `services/__tests__/carrera.service.test.ts` with 5 scenarios: (a) happy path no audit; (b) below-threshold audit; (c) repo error audit + throw; (d) audit-row taxonomy metadata shape; (e) static check that `carrera.service.ts` does NOT import `services/sync-queue.service.ts` (regex on the file contents from a Bun test).
- **Spec requirements covered**: `carrera-service-orchestration` (5 of 6 scenarios now fully land), `platform-strategy-audit-log` (all 4 scenarios)
- **Design ADs referenced**: AD-4, AD-5, AD-10, AD-14, OI-5
- **Rollback**: `git revert <commit>` — `CarreraService` becomes a no-write shell; `ui/` cannot drive commits until the reverted version re-lands or a hotfix restores `commitRegistration`
- **Commit message**: `feat(services): add CarreraService commit step with audit policy`

### PR #2 Task 2.5: End-to-end integration test (all 3 strategies → CarreraService → SQLite → sync_queue)

- **Files**: `services/__tests__/carrera.service.test.ts` (UPDATE — add the 3 end-to-end scenarios)
- **Test command**: `bun test services/__tests__/carrera.service.test.ts`
- **Depends on**: 2.4 (full `commitRegistration` surface)
- **Acceptance criteria**:
  - [ ] Test scenario `Uber end-to-end happy path`:
    - seed 3 `plataformas` rows from `0003_seeds.sql:24-34` into the in-memory SQLite
    - `service.suggestRegistration(driverId, uberPlataformaId, { raw: '', context: {} })` returns a stub suggestion (`fuente: 'manual'`, `estado: 'activa'`, `confidence: 0`)
    - driver mutates the suggestion fields (mimics the M01 modal), then calls `service.commitRegistration(driverId, suggestion)`
    - assert: `SELECT * FROM carreras` returns exactly one row, `tarifa_bruta === 12500`, `estado === 'activa'` (Uber stays `activa` per AD-7), `fuente === 'manual'`, `plataforma_id === uberPlataformaId`
    - assert: `SELECT COUNT(*) FROM log_eventos WHERE tipo = 'carrera.registered'` equals 0 (happy path)
    - assert: `dbChange$` emitted exactly once with `table === 'carreras'`
    - assert: `sync-queue.service.ts:547-549` auto-enqueue picked up the row (the Phase 2 subscription observes the `dbChange$` event; verify via `syncQueue$` snapshot)
  - [ ] Test scenario `DiDi end-to-end happy path`:
    - same setup, paste `"DiDi Tarifa: $12.500 COP\nOrigen: Calle 10\nDestino: Centro\nDistancia: 4,2 km"`
    - assert one `carreras` row, `tarifa_bruta === 12500`, `comision === 2500.00`, `estado === 'completada'`, `fuente === 'manual'`
    - assert zero `carrera.registered` audit rows
    - assert auto-enqueue
  - [ ] Test scenario `InDrive end-to-end happy path`:
    - same setup, paste `"InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado"`
    - assert one `carreras` row, `tarifa_bruta === 8000`, `comision === 1440.00`, `estado === 'completada'`, `fuente === 'manual'`
    - assert `distancia_km` is `NULL`
    - assert zero `carrera.registered` audit rows
    - assert auto-enqueue
  - [ ] In-memory SQLite factory mirrors `services/__tests__/sync-queue.service.test.ts:56-85` precedent; pre-seeds the 3 `plataformas` rows manually
  - [ ] All 3 scenarios written FIRST as failing tests, then task 2.4 + task 2.5 build them GREEN
- **Spec requirements covered**: `carrera-estado-lifecycle` (all 5 scenarios — every platform), `carrera-service-orchestration` (audit scenarios now covered end-to-end)
- **Design ADs referenced**: AD-4, AD-5, AD-7
- **Rollback**: `git revert <commit>` — tests only; no production behavior change
- **Commit message**: `test(services): add end-to-end CarreraService integration tests`

### PR #2 Task 2.6: Coverage gate + lint pass + cross-domain audit

- **Files**: (none — verification only)
- **Test command**: `bun test --coverage` from repo root (Phase 2 G.3 precedent)
- **Depends on**: all prior tasks in PR #2
- **Acceptance criteria**:
  - [ ] `bun test --coverage` exits 0 with ≥ 80% lines/functions/statements/branches on:
    - `services/strategies/**` (all 6 source files + their tests)
    - `services/carrera.service.ts`
  - [ ] No `any` types in `services/strategies/**` or `services/carrera.service.ts` (or justified `any` per `unknown` with a comment; documented by code review)
  - [ ] No unused imports (ESLint clean; `bun run lint` exits 0 if a lint script exists, otherwise manual review notes in the commit body)
  - [ ] `git diff develop --stat` cross-domain audit:
    - NO files under `ui/`
    - NO files under top-level `tests/`
    - NO files under `data/`
    - NO modifications to `services/db.service.ts`, `services/carrera.repo.ts`, `services/sync-queue.service.ts`, `services/sync-queue.transport.ts`, `services/network.service.ts` (Phase 1 + Phase 2 frozen)
  - [ ] All 40 spec scenarios from `openspec/changes/add-platform-strategies/specs/platform-strategies/spec.md` pass as `bun test` cases (verified via grep + test name; coverage gate inherits)
- **Spec requirements covered**: `local-test-coverage` (Phase 1 inherited floor, applied to the new files)
- **Design ADs referenced**: AD-9, AD-10
- **Rollback**: n/a (verification only)
- **Commit message**: `chore(services): verify coverage and lint for Phase 4`

### PR #2 — Merge + archive (human gate 2)

- [x] H.1 PR `feature/add-platform-strategies` (PR #2 only — 6 work-unit commits + verification chore) → `develop` after human gate 2 approval.
- [x] H.2 `openspec archive add-platform-strategies` — moves change folder to `openspec/changes/archive/2026-10-11-add-platform-strategies/` and promotes `specs/platform-strategies/spec.md` into `openspec/specs/platform-strategies/spec.md` (9 ADDED requirements; no MODIFIED / REMOVED).
- [x] H.3 Delete `feature/add-platform-strategies` local and remote.

---

## Rollback Plan

1. **PR #2 alone** (revert PR #2, keep PR #1 on `develop`) — the registry still resolves `uber_api` only. DiDi / InDrive lookups throw `UnknownStrategyError` (defensible runtime behaviour documented in PR #2 Tasks 2.2 / 2.3 rollbacks). Phase 3 Pi's modal falls back to the manual form for DiDi / InDrive until PR #2 is restored. **No data loss.**
2. **PR #1 alone** (revert PR #1, keep PR #2) — impossible: PR #2 depends on PR #1 types + registry + parse + CarreraService skeleton. If PR #1 reverts, PR #2 cannot build.
3. **Full revert** — `git revert <merge commit for PR #1>..<merge commit for PR #2> --no-edit` removes both PRs. The `tipo_estrategia='uber_api'` seed row remains but is unused. Phase 3 Pi's `import type` from `services/strategies` fails to resolve; Pi swaps to placeholder types until Phase 4 is restored.
4. **Data migration rollback** — none needed. Phase 4 makes zero schema changes; `data/migrations/0003_seeds.sql` is byte-identical before and after (AD-6). Any `CarreraRow` rows written by Phase 4 strategies during a stress test remain on device with valid `metadata.platform_session_id = 'phase4-stub-pending-phase6'` markers for the future Phase 6 migration to reconcile.
5. **Cross-agent coordination** — never revert PR #1 after Phase 3 Pi has merged its modal. The modal imports `services/strategies/strategy.types.ts` as `import type`; if the file disappears, the modal fails to compile. Mitigation: the first commit of any future revert restores `strategy.types.ts` first.

## Success Criteria Checklist

- [x] All 3 strategy classes exist and resolve from `STRATEGY_REGISTRY` by `plataformas.tipo_estrategia`
- [x] `CarreraService.suggestRegistration(driverId, plataformaId, input)` returns a `StrategySuggestion` for each of the 3 seeded platforms
- [x] `CarreraService.commitRegistration(driverId, suggestion)` writes one `carreras` row with the right `fuente` + `estado` for each platform (Uber = `'activa'`; DiDi / InDrive = `'completada'`)
- [x] Confirming a high-confidence suggestion (`confidence >= 0.3`) produces: (a) one `carreras` row, (b) NO `log_eventos` row, (c) auto-enqueue via `dbChange$` → `services/sync-queue.service.ts:547-549`
- [x] Confirming a below-threshold suggestion (`confidence < 0.3`) produces one `log_eventos(tipo='carrera.registered')` row with `metadata.fallback = 'manual-form'`, `metadata.plataforma_id`, `metadata.trip_id`
- [x] A repository error during commit produces one `log_eventos(tipo='carrera.registered')` row with `metadata.error = '<message>'` AND re-throws the original exception to the caller (post-audit)
- [x] `CarreraService` does NOT import `services/sync-queue.service.ts` (static check passes)
- [x] `CarreraService` does NOT import `expo-sqlite` directly (Phase 1 `local-rls-facade` holds)
- [x] Adding a 4th platform requires ONLY: `INSERT` into `plataformas` + new OpenSpec change to author a strategy class + new entry in `STRATEGY_REGISTRY`
- [x] `services/strategies/strategy.types.ts` is importable from `ui/` via `import type` (cross-domain read-only contract)
- [x] Coverage ≥ 80% on `services/strategies/**` + `services/carrera.service.ts` via `bun test --coverage`
- [x] `services/README.md` is updated to match actual file names (no more `CarreraService.ts` PascalCase reference; closes `discovery/services-readme-drift` #1934)
- [x] `services/strategies/README.md` documents the open-closed extension flow with a Phase 6 stub-replacement example
- [x] All 40 spec scenarios pass as `bun test` cases (verified in PR #2 Task 2.6)
- [x] `git diff develop --stat` (after both PRs merged) shows zero files under `ui/`, top-level `tests/`, `data/`, `services/db.service.ts`, `services/carrera.repo.ts`, or `services/sync-queue.service.ts`
- [x] First commit (`PR #1 Task 1.1`) is `services/strategies/strategy.types.ts` — the cross-domain contract is unblocked for Phase 3 Pi immediately, before any strategy or service lands

## Open Items (forwarded from design §10)

The 5 open items from `design.md §10` are resolved as follows:

- **OI-1** — `plataforma: PlataformaRow` field on `StrategySuggestInput` → **RESOLVED in PR #1 Task 1.4**. The committed `services/strategies/strategy.types.ts` includes `plataforma?: PlataformaRow` (or a sibling field) per the design recommendation. Update the engram topic `sdd/driverledger/add-platform-strategies/interface` (call `mem_update` or `mem_save` with `topic_key: 'sdd/driverledger/add-platform-strategies/interface'`, `capture_prompt: false`) after the file lands — both stay byte-for-byte equivalent.
- **OI-2** — `bunfig.toml` coverage glob → **RESOLVED in PR #1 Task 1.7**. The coverage `include` glob extends to `services/strategies/**` + `services/carrera.service.ts`; PR #1 itself exercises the gate before merge.
- **OI-3** — Defer a literal type union for `tipo_estrategia` → **NOTED as out of scope**. Adding a string-literal union `'uber_api' | 'didi_manual' | 'indrive_form'` would require a `data/sqlite/types.ts` change, which violates AD-10 (no `data/` modification in Phase 4). Phase 4 uses `Record<string, PlatformStrategy>` (wide string) + `getStrategyByTipo` runtime safety net. A follow-up spec delta may add the union via JSONB extension if a 4th platform becomes a real priority.
- **OI-4** — `metadata.platform_session_id = 'phase4-stub-pending-phase6'` marker → **RESOLVED in PR #1 Task 1.3**. The test asserts `suggestion.draft.metadata.platform_session_id === 'phase4-stub-pending-phase6'`. Forward-compatible for a Phase 6 migration to reconcile stub-originated Carrera rows.
- **OI-5** — `ui-labels.ts` value-level import from `services/` to `ui/` → **NOTED as the one accepted exception**. `services/strategies/ui-labels.ts` exports `PLATFORM_UI_LABELS` (a value, not a type); Phase 3 Pi imports it via the barrel. Per the design, future contributors must NOT extend this pattern without an explicit AD. Resolved in PR #2 Task 2.4 (the file ships alongside `commitRegistration`).

## Notes

- **Work-unit commits only.** One task = one conventional commit. Twelve tasks across both PRs + verification chores. No squashing at PR time (the orchestrator verifies each task `[x]`-flips in this file alongside the corresponding commit).
- **PR-split decision is a user gate, not an agent gate.** The orchestrator surfaces the `Decision needed before apply: Yes` to the user. The user picks: (a) chained PRs (this file's plan), or (b) `single-pr + size:exception` (~1,535 LOC single PR). Phase 1 (`local-data-model-sqlite`) shipped 2,327 LOC on a single PR with `size:exception` precedent; a single-PR Phase 4 is feasible if the user accepts the exception.
- **Coverage gate (`≥ 80%`)** is enforced from PR #1's first merge (Task 1.7); PR #1 exercises the gate before merge so subsequent PRs land in green.
- **Public readout**. After both PRs land, the engram topic `sdd/driverledger/add-platform-strategies/state` is updated to `phase: 'completed'`, `next: 'sdd-apply'` (the apply phase is the merge above) and the proposal's `Success Criteria` list becomes a checked checkbox in this file.
- **Update tasks.md with `[x]` flips** as each task's commit lands. Conventional commit messages; no AI attribution; no "Co-Authored-By" trailers (per repository + global rules).
