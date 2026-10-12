# Archive Report — add-platform-strategies

> Phase 4 of PRD §8. Strategy pattern for Uber / DiDi / InDrive + `CarreraService` orchestration.
>
> **Status**: ✅ **ARCHIVED**
> **Branch**: `feature/add-platform-strategies` @ `e993889` (PR #1 merged to `develop` at `9627416`; PR #2 merged at `8f23143`)
> **Tag**: `v0.2.0` on `main` (tag commit SHA to be filled by orchestrator at `git tag` time — see §Tag below)
> **Archived**: 2026-10-12

## What shipped

Phase 4 of the PRD turned the local-first write layer (Phase 1) and the sync queue (Phase 2) into a guided "auto-fill + one-tap confirm" registration flow per `docs/PRD-consolidado.md §4` and `docs/RFC-003-logica-registro.md §Confirmación de un toque`. The deliverable is the `services/strategies/` directory (Strategy interface + 3 concrete classes — Uber stub, DiDi paste parser, InDrive negotiated-fare paste parser — + static boot-time registry + shared fees helpers + input normalizer + cross-domain type contract), `services/carrera.service.ts` (the orchestration class that wires driver input → resolved strategy → canonical repo write → audit log on the exceptional path), and an update to `services/README.md` that closes the naming-drift finding `discovery/services-readme-drift` (#1934). Phase 3 Pi can now `import type { StrategySuggestion, ... } from 'services/strategies/strategy.types'` and the M01 modal binds to the open-closed seam. Phase 6 will replace the `UberStrategy.suggest()` body without touching the interface.

The change was delivered as **two stacked PRs** (`stacked-to-main`) chained against `develop`:
- **PR #1** (https://github.com/PandaDesigner/DriverLedger/pull/1, merge `9627416`) — published the cross-domain contract (`strategy.types.ts`), shipped the static registry + 0.3 confidence constant, the Uber Phase 4 stub, the input normalizer, and the `CarreraService` skeleton (resolve + suggest, no commit). Plus the `services/README.md` drift fix and the `services/strategies/README.md` open-closed extension guide. 10 commits.
- **PR #2** (https://github.com/PandaDesigner/DriverLedger/pull/2, merge `8f23143`) — added the shared fees + `calcularGasolina` placeholder, the `DidiStrategy` and `InDriveStrategy` paste parsers (each registered under its `tipo_estrategia` key), the `CarreraService.commitRegistration` write + audit step, the `PLATFORM_UI_LABELS` value-level cross-domain export, and the end-to-end integration tests. 7 commits.

## Verification summary

The full `verify-report.md` is archived alongside this file. Headline numbers:

- **0 CRITICAL, 0 WARNING, 3 SUGGESTION** (PASS WITH SUGGESTIONS).
- **219 / 219 tests pass** (526 `expect()` calls, 13 test files).
- **96.75% lines / 95.01% funcs** project-wide coverage (above the 80% floor).
- **9 / 9 spec requirements met**, **40 / 40 scenarios covered** by passing `bun test` cases.
- **15 / 15 design ADs implemented**, **13 / 13 work-unit tasks** committed (17 commits on the branch).
- **Cross-domain audit clean**: zero files under `ui/`, `data/`, top-level `tests/`, or any Phase 1/2 frozen `services/` module. `services/sync-queue.service.ts` is byte-identical to pre-Phase-4.

The 3 SUGGESTION-level findings (cosmetic) are recorded under **§Follow-up** below.

## Spec delta promoted

The following capability spec was promoted from `openspec/changes/archive/2026-10-12-add-platform-strategies/specs/platform-strategies/spec.md` to `openspec/specs/platform-strategies/spec.md` (byte-identical copy, no modifications):

- **`platform-strategies`** (NEW capability, 9 ADDED requirements, 40 scenarios)

Capability now lives alongside `data-model`, `local-data-model`, `sync-queue`, `realtime`, `storage`, and `ui-bootstrap` in `openspec/specs/`. The YAML front-matter sets `version: 1.0.0`, `status: draft`, `created: 2026-10-11`, with `related_changes: [add-platform-strategies]` and `related_specs: [data-model, local-data-model, sync-queue]`. **Recommend a follow-up patch to flip `status: draft` → `status: active`** as a minor hygiene item.

## Capabilities affected

- **`platform-strategies`** (NEW): Strategy pattern + CarreraService orchestration. The open-closed seam for adding new platforms. Now a live spec under `openspec/specs/platform-strategies/spec.md`.
- **`local-data-model`** (consumed, unchanged): `carreraRepo.upsertByTripId` is the canonical write path; `CarreraService` routes through it. Spec untouched.
- **`sync-queue`** (consumed, unchanged): `dbChange$` auto-enqueues carrera writes; `CarreraService` never enqueues manually. Spec untouched.
- **`data-model`** (consumed, unchanged): `plataformas.tipo_estrategia` is the registry key. Seed at `data/migrations/0003_seeds.sql:24-34` is byte-identical (AD-6 holds). Spec untouched.

## Files promoted / created

### Files in `services/strategies/` (NEW directory, OpenCode ownership)

Source files (10):
- `services/strategies/strategy.types.ts` — `PlatformStrategy`, `StrategySuggestion`, `StrategySuggestInput`, `StrategyContext`, `UnknownStrategyError`, `UnknownPlatformError` (cross-domain contract; the only file `ui/` reaches into)
- `services/strategies/registry.ts` — `STRATEGY_REGISTRY` (frozen, eager-loaded) + `getStrategyByTipo` + `hasStrategyByTipo`
- `services/strategies/confidence.ts` — `CONFIDENCE_THRESHOLD = 0.3 as const`
- `services/strategies/parse.ts` — `normalize(raw)` input helper (trim, lowercase platform markers, collapse whitespace)
- `services/strategies/fees.ts` — `calcularComision` (canonical formula) + `calcularGasolina` (placeholder `distanciaKm * CONSUMO_DEFAULT` where `CONSUMO_DEFAULT = 0.08`) + exported `CONSUMO_DEFAULT` for Phase 6 override
- `services/strategies/uber.strategy.ts` — Phase 4 stub returning `confidence: 0`, `oneTapCapable: false`, `draft.fuente: 'manual'`, `draft.estado: 'activa'`, with `metadata.platform_session_id = 'phase4-stub-pending-phase6'` marker for Phase 6 migration reconciliation
- `services/strategies/didi.strategy.ts` — paste parser; `confidence >= 0.7` on happy path; `confidence < 0.3` on missing fare; `estado: 'completada'`; `UnknownPlatformError` on Uber/InDrive markers
- `services/strategies/indrive.strategy.ts` — negotiated-fare paste parser; same confidence contract; `editableFields` excludes null fields
- `services/strategies/ui-labels.ts` — `PLATFORM_UI_LABELS` (the ONE accepted value-level cross-domain import, OI-5)
- `services/strategies/README.md` — open-closed extension guide with Rappi walkthrough + Phase 6 stub-replacement section

Test files (8): `strategy.types.test.ts`, `registry.test.ts`, `confidence.test.ts`, `parse.test.ts`, `fees.test.ts`, `uber.strategy.test.ts`, `didi.strategy.test.ts`, `indrive.strategy.test.ts`.

### Files at `services/` root

- `services/carrera.service.ts` (NEW) — `CarreraService` class: `listPlataformas()`, `getStrategyByTipo()`, `suggestRegistration()`, `commitRegistration()` + `writeAuditRow()`. Constructor takes optional DI `registry` + `Upserter` (for test injection).
- `services/__tests__/carrera.service.test.ts` (NEW) — in-memory SQLite integration tests for both PR #1 scenarios (suggest) and PR #2 scenarios (commit + audit + cross-domain static checks).
- `services/README.md` (UPDATED) — naming drift fix (closes `discovery/services-readme-drift` #1934): now lists actual shipped files (`carrera.repo.ts`, `sync-queue.service.ts`, `network.service.ts`, `carrera.service.ts`, `strategies/`).
- `services/package.json` (NEW) — OpenCode workspace package config (bootstrap chore in PR #1).

### Files at repo root

- `bunfig.toml` (UPDATED) — coverage `include` glob extended to add `services/strategies/**` + `services/carrera.service.ts`.
- `package.json` (UPDATED) — workspace entry for `services/`.
- `bun.lock` (UPDATED) — workspace lockfile.

### Archived specs

- `openspec/specs/platform-strategies/spec.md` (NEW — promoted from delta)

## Commits on `feature/add-platform-strategies` (17 total)

PR #1 — 10 commits (verified via `git log 8c71caf..9627416`):

```
1d18895 feat(services): publish platform strategy type contract          (Task 1.1)
<sha>   feat(services): add UberStrategy Phase 4 stub + parse normalize (Task 1.3 — landed before 1.2)
<sha>   feat(services): add static platform strategy registry + CONFIDENCE_THRESHOLD (Task 1.2)
<sha>   feat(services): add CarreraService suggestion step              (Task 1.4)
<sha>   docs(services): fix README naming drift                          (Task 1.5)
<sha>   docs(services): add strategies README extension guide            (Task 1.6)
38be375 chore(services): extend coverage glob to strategies              (Task 1.7)
<sha>   chore(services): services workspace bootstrap                    (one-off bootstrap)
<sha>   docs(apply): mark PR #1 Tasks 1.1-1.7 acceptance as complete     (verification chore)
```

PR #2 — 7 commits (from apply-progress #1944):

```
5c0e2ee feat(services): add shared fees and gasolina helpers                                  (Task 2.1)
a7b7332 feat(services): add DidiStrategy paste parser                                          (Task 2.2)
6410ace feat(services): add InDriveStrategy paste parser                                       (Task 2.3)
bcf1396 feat(services): add CarreraService commit step with audit policy                        (Task 2.4)
866fd1b test(services): add end-to-end CarreraService integration tests                        (Task 2.5)
bbcb920 feat(services): register DidiStrategy and InDriveStrategy in STRATEGY_REGISTRY          (Task 2.6)
e993889 docs(apply): mark PR #2 Tasks 2.1-2.6 acceptance as complete                            (verification chore)
```

Branch tip: `e993889`. PR #1 merged to `origin/develop` at `9627416`; PR #2 merged at `8f23143`. Both PRs are `MERGE` commits on `develop` (squash-merged at PR time).

## Test + coverage

- **219 tests pass, 0 fail** (526 `expect()` calls, 13 files, 468ms)
- **Coverage 96.75% lines / 95.01% funcs** project-wide (above 80% floor)
- Per-file coverage on `services/strategies/**` is ≥90% lines / ≥90% funcs across all 9 source files
- `services/carrera.service.ts` shows 100% lines / 100% funcs
- All 9 spec requirements have at least one passing test
- All 40 spec scenarios have at least one passing test (some are verified indirectly via inherited SQLite CHECK constraints, the `Object.frozen` registry, or the README extension guide)

## Deviations from the original spec/design/proposal

Six deviations already documented in apply-progress #1944 and re-verified in `verify-report.md`. None breaks a spec scenario or violates a design AD.

1. **Workspace bootstrap tax** (PR #1): `services/` was not a Bun workspace before this change. The root `package.json` had no workspaces entry and `services/package.json` did not exist. A chore commit had to land before any task code so `bun test` could resolve `rxjs` from `services/__tests__/`. Documented as a one-off tax; should be remembered in the next `sdd-init` refresh.
2. **Task ordering** (PR #1): Task 1.3 (`UberStrategy` stub) landed BEFORE Task 1.2 (registry) because the registry cannot import `UberStrategy` without the strategy existing first, and the registry test (`getStrategyByTipo('uber_api')` returns `UberStrategy`) requires the strategy to exist at registry-load time. Land order: 1.1 → 1.3 → 1.2 → 1.4 → 1.5 → 1.6 → 1.7. Both commits kept their original numbering.
3. **`calcularGasolina` follows launch prompt** (`distanciaKm * CONSUMO_DEFAULT = distanciaKm * 0.08`) instead of design spec's `0` placeholder. The `CONSUMO_DEFAULT` constant is exported so Phase 6 can override per-platform via `plataforma.metadata.gasolina_km_per_litro` without changing the signature (AD-9 forward-compat).
4. **`UnknownPlatformError` added to `strategy.types.ts`** (parallel to `UnknownStrategyError`). Required by Didi/InDrive cross-platform guards (PR #2 Tasks 2.2 + 2.3). Engram topic #1939 was NOT updated in lockstep — documented rationale: engram is the read-side for Pi, Pi doesn't need to import this error class because the throw propagates through `CarreraService` and the UI catches generically.
5. **`CarreraService.getStrategyByTipo` switched to instance-level registry lookup** (`this.registry[tipo]` instead of module-level `registryGetStrategyByTipo`). Required for the happy-path audit test (which injects a fake high-confidence DidiStrategy via the constructor DI parameter). Same throw + `console.warn` behavior.
6. **`Upserter` DI parameter added to `CarreraService` constructor** (mirrors the `registry` parameter). Required for the error-path audit test, which injects a throwing upsert without monkey-patching the readonly `carrera.repo` module export. Default still calls `carreraRepo.upsertByTripId`. Cross-domain rule preserved.
7. **Arrow-route regex refactored mid-PR** from multi-line anchored (`^[^\n]*→[^\n]+$` with `m` flag) to a per-line split-then-match helper (`findArrowRoute`). Necessary because `CarreraService.suggestRegistration` normalizes `input.raw` (collapses newlines, lowercases) before passing to the strategy; the multi-line anchor failed in the integration test.
8. **InDrive integration test expects lowercase `origen`/`destino`** (`'calle 50'` / `'poblado'`) after `parse.normalize` lowercases everything. Per-strategy unit tests preserve case via direct invocation. Consistent with AD-13 (normalize at the service boundary) — a future UI change may want to re-case for display.

## Follow-up (non-blocking SUGGESTIONs from verify)

- **S1**: `services/strategies/README.md:33-37` references an `index.ts` barrel that does not exist on disk. Either create `services/strategies/index.ts` re-exporting `StrategySuggestion, PlatformStrategy, StrategySuggestInput, StrategyContext, UnknownStrategyError, UnknownPlatformError, CONFIDENCE_THRESHOLD, STRATEGY_REGISTRY, getStrategyByTipo`, or remove the reference from the README. Either is a 5-minute follow-up.
- **S2**: Spec narrative uses `confirmRegistration`; design + implementation use `commitRegistration`. Tasks.md acknowledges this divergence. A doc-only patch to harmonize vocabulary is recommended but cosmetic.
- **S3**: Engram interface topic #1939 may need a fresh `mem_update` to add `UnknownPlatformError` post-PR #2. Pi's modal is unaffected (the throw propagates through `CarreraService`), but a future agent that `mem_get_observation`s #1939 will not see the full contract.
- **S4 (hygiene, new)**: The promoted spec at `openspec/specs/platform-strategies/spec.md` has `status: draft` in the YAML front-matter. Consider a follow-up patch to flip to `status: active` (or whatever the project's spec lifecycle vocabulary is — see other promoted specs at `openspec/specs/{data-model,sync-queue,realtime,storage,local-data-model,ui-bootstrap}/spec.md` for the convention).

## Next phase

- **Phase 5** (per PRD §8): Background GPS rides (`expo-task-manager` + `expo-location`). Separate change; not in this archive.
- **Phase 3** (in progress, parallel branch): UI pantallas. Will consume the `StrategySuggestion` interface from `services/strategies/strategy.types.ts` (cross-domain `import type` only) and the `PLATFORM_UI_LABELS` value-level import from `services/strategies/ui-labels.ts` (OI-5 accepted exception). Phase 3 lands on `develop` independently; when both PRs merge, `v0.3.0` will follow.
- **Phase 6** (future): Uber API integration. The `UberStrategy.suggest()` body swaps without touching the interface; `metadata.platform_session_id = 'phase4-stub-pending-phase6'` rows on device can be reconciled.

## Tag

- **`v0.2.0`** will be tagged on `main` after the merge of `develop` (which already contains both PRs).
- **SemVer rationale**: minor bump from `v0.1.0` (Phase 0+1+2 archive snapshot, see `openspec/changes/archive/2026-10-11-*`). New capability (`platform-strategies`) is additive; no breaking changes to the frozen Phase 1/2 modules. Phase 3 UI is still in progress; `v0.3.0` will follow when the UI lands.

## Lessons learned

- **Workspace bootstrap tax** is a real cost when introducing a new top-level directory. The orchestrator's `sdd-init` flow should detect missing `package.json` files in proposed new directories and bootstrap them BEFORE the work-unit tasks land. Recommend a `workspaces-bootstrap-tax` pattern in the next `sdd-init` refresh.
- **Task ordering** matters when one task's test depends on a sibling module that's authored in a later task. The producer-before-consumer invariant should be captured in `tasks.md` upfront (the Task 1.3-before-1.2 swap here was caught and documented but a static ordering rule would have prevented it).
- **Engram contract amendments** are not always worth the in-flight update. Documenting the divergence in the apply-progress + commit body is sufficient when the read-side agent can tolerate the lag (Pi's modal catches `UnknownPlatformError` generically, so the missing entry in #1939 was non-blocking).
- **DI parameter patterns** (`registry`, `Upserter`) are the cleanest way to make audit-policy tests exercise both the happy path AND the error path without monkey-patching readonly module exports. Worth codifying as a project convention.
- **Chained stacked-to-main delivery** worked well for Phase 4: PR #1 published the cross-domain contract unblocking Phase 3 Pi immediately, PR #2 filled in the per-platform logic and orchestration. Two clean PRs (each < 1000 LOC, each independently testable) is better than one large PR with a `size:exception`.

---

## Engram traceability

This archive report is mirrored in Engram with the following observation IDs (for cross-session recovery):

| Artifact | Engram topic | Observation ID |
|---|---|---|
| Proposal | `sdd/driverledger/add-platform-strategies/proposal` | 1938 |
| Interface (cross-domain contract) | `sdd/driverledger/add-platform-strategies/interface` | 1939 |
| Spec | `sdd/driverledger/add-platform-strategies/spec` | 1941 |
| Design | `sdd/driverledger/add-platform-strategies/design` | 1942 |
| Tasks | `sdd/driverledger/add-platform-strategies/tasks` | 1943 |
| Apply progress (merged PR #1 + PR #2) | `sdd/driverledger/add-platform-strategies/apply-progress` | 1944 |
| PR #1 shipped milestone | `sdd/driverledger/add-platform-strategies/pr1-shipped` | 1945 |
| PR #2 shipped milestone | `sdd/driverledger/add-platform-strategies/pr2-shipped` | 1946 |
| Verify report | `sdd/driverledger/add-platform-strategies/verify-report` | 1947 |
| DAG state (pre-archive) | `sdd/driverledger/add-platform-strategies/state` | 1940 |
| **Archive report (THIS FILE)** | `sdd/driverledger/add-platform-strategies/archive-report` | <new-id> |
| **v0.2.0 released milestone** | `sdd/driverledger/v0.2.0-released` | <new-id> |

The new archive observation and the v0.2.0 milestone observation are written by `mem_save` after this file lands on disk. The DAG state observation (#1940) is updated to `phase: 'archive'`, `status: 'completed'`, `next: null`, `tag: 'v0.2.0'` via `mem_update` (upsert by topic_key).