# Proposal: setup-expo-skeleton

## Intent

Bootstrap the Expo SDK 57+ mobile shell so subsequent UI changes (Fase 3+) have a working toolchain to land against. The repo is docs-only: no `ui/` directory, no `package.json`, no test runner, no linter. Before any screen, navigation, or reactive layer can land, the project needs a deterministic install, a strict type-check, a lint pass, and a placeholder route that proves the bundle boots.

This is Phase 0b in the multi-phase plan, paired with `setup-supabase-tables` (OpenCode, `data/`). Pi owns `ui/`+`tests/`; this change does NOT cross into `data/` or `services/`.

## Scope

### In Scope
- `ui/` workspace: `package.json`, `bunfig.toml`, `tsconfig.json`, `app.json`, `eslint.config.js`, `.prettierrc`, `.gitignore`
- Single Expo Router placeholder route at `/` rendering a smoke screen
- App entry (`App.tsx`, `index.ts`)
- Dependency set per RFC-001 (expo, expo-router, rxjs, signals, expo-sqlite, supabase-js, expo-secure-store, expo-location, expo-task-manager)
- DevDeps: typescript, eslint v9, prettier
- Root `package.json` with Bun workspaces declaring `["ui"]`
- Deterministic install verified via `bun install --filter ui`
- `bun tsc --noEmit` passes with `strict: true`
- `bun lint` passes
- README.md documenting dev commands

### Out of Scope
- Any screen beyond the placeholder (Login, Registro, Olvidar contraseña, Onboarding, Dashboard, Historial, Settings) — Fase 3
- Modals (ride confirmation, expense entry) — Fase 3
- Strategy pattern / `services/` — Fase 4 (OpenCode domain)
- SQLite schema, repositories, migrations — Fase 1 (OpenCode domain)
- Supabase schema, RLS, seeds — Fase 0a (parallel change, OpenCode domain)
- GPS lifecycle — Fase 5
- CI / GitHub Actions — separate change
- Playwright / E2E — Fase 7
- Production builds / app store config — deferred

## Capabilities

> This change does NOT modify capabilities. It bootstraps the toolchain only.

### New Capabilities
None.

### Modified Capabilities
None.

Rationale: under OpenSpec, capabilities describe observable behavior in `openspec/specs/<name>/spec.md`. A scaffold change introduces no behavior — no screen does anything, no data flows, no API is exposed. Therefore there are no spec deltas. The first behavior-bearing change lands in Fase 1 or 3.

## Approach

Adopt `bun create expo` (blank-typescript) as seed, layer RFC-001 dependencies on top, pin them in `package.json` `overrides` where Bun resolves differently from the template default. Use Expo Router (file-system routing) over bare React Navigation because Phase 3 expects 7 screens + 2 modals and Expo Router keeps the navigation graph declarative and reviewable. Configure TypeScript strict with path alias `@/*` → `src/*` to avoid deep relative imports. ESLint v9 flat config with `eslint-config-expo` preset; Prettier for formatting. Bun is both package manager and script runner; `bunfig.toml` declares `[install] peer = false` (Expo peer deps cause non-deterministic installs otherwise) and forward-looking coverage thresholds for Fase 7.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `ui/package.json` | New | Dependency manifest + scripts |
| `ui/bunfig.toml` | New | Bun runtime config |
| `ui/tsconfig.json` | New | TS strict + path aliases |
| `ui/app.json` | New | Expo config |
| `ui/eslint.config.js` | New | ESLint v9 flat |
| `ui/.prettierrc` | New | Prettier config |
| `ui/App.tsx` | New | Stack root |
| `ui/index.ts` | New | Entry |
| `ui/app/index.tsx` | New | Placeholder route |
| `ui/README.md` | New | Dev instructions |
| `package.json` (root) | New | Bun workspace root, `workspaces: ["ui"]` |
| `openspec/changes/setup-expo-skeleton/` | New | This change folder |

Explicitly NOT touched: `data/`, `services/`, anything under `openspec/specs/` (no spec deltas).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bun ↔ Expo peer-dep drift | Med | `bunfig.toml` `[install] peer = false`; pin versions in `package.json` |
| Expo SDK 57 churn | Low | Latest stable; record SDK in README |
| TS path alias mismatch bundler↔linter | Low | Mirror `paths` in `tsconfig.json` and `eslint.config.js` resolver |
| Cross-domain edit (`data/` or `services/`) | Low | `sdd-apply` pre-flight ownership check |
| ESLint v9 + `eslint-config-expo` compat | Med | Pin ESLint 9.x; fallback to plain Expo config if preset blocks |
| Bun test runner vs RN globals | Low | Out of scope here; resolve in Fase 7 |

## Rollback Plan

Single commit revert on `feature/setup-expo-skeleton` before merge. After merge, `git revert` of the merge commit, or archive the change and prune `ui/` from the workspace. No production data, API contracts, or persisted state are affected — rollback is safe.

## Dependencies

- Bun v1.3.12+ installed at `/opt/homebrew/bin/bun`
- Expo SDK 57+ (verify at `sdd-apply` time)
- `data/` migrations from `setup-supabase-tables` are NOT a runtime dependency (this skeleton has no DB calls)

## Success Criteria

- [ ] `bun install --filter ui` completes deterministically; lockfile committed
- [ ] `bun --filter ui tsc --noEmit` exits 0 with `strict: true`
- [ ] `bun --filter ui lint` exits 0
- [ ] `bun --filter ui dev` boots Expo Dev Tools and renders the placeholder route
- [ ] No file under `data/` or `services/` is created or modified
- [ ] Conventional commits only; no AI attribution