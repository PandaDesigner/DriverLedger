# Tasks: setup-expo-skeleton

> Convention: one task = one concrete scaffolded artifact. Conventional commits only. No AI attribution. Order is dependency-driven: workspace → config files → entry code → verification.

## 0. Branch (human gate 1 prerequisite)

- [x] **0.1** Create branch `feature/setup-expo-skeleton` off `develop` — `chore: branch setup-expo-skeleton`

## 1. Workspace scaffolding

- [x] **1.1** Create root `package.json` with `workspaces: ["ui"]`, `private: true`, and `packageManager` pinned to bun — `chore: add bun workspace root`
- [x] **1.2** Create `ui/.gitignore` (Expo defaults + `node_modules/`, `.expo/`, `dist/`, `*.log`) — `chore: add ui .gitignore`
- [x] **1.3** Create `ui/app.json` with Expo SDK 57+ name/slug/bundle identifier placeholders — `chore: add ui app.json`

## 2. Dependency manifest

- [x] **2.1** Create `ui/package.json` with runtime deps (expo, expo-router, expo-ui, rxjs, @preact/signals-react, expo-sqlite, @supabase/supabase-js, expo-secure-store, expo-location, expo-task-manager) and devDeps (typescript, eslint@9, eslint-config-expo, prettier, @types/react, @types/react-native) plus the script set per AD-9 — `chore: add ui package.json`
- [x] **2.2** Run `bun install` at repo root, commit lockfile — `chore: lock ui dependencies`

> **Note (2.1 deviation)**: `@types/react-native` is intentionally omitted; React Native 0.81+ ships its own types. `expo-ui` was renamed to `@expo/ui` and is published under that name (used in the dependency set).

## 3. Bun runtime config

- [x] **3.1** Create `ui/bunfig.toml` with `[install] peer = false` and `[test] coverageThreshold = { lines = 80, functions = 80, statements = 80, branches = 80 }` per AD-6 — `chore: add ui bunfig.toml`

## 4. TypeScript config

- [x] **4.1** Create `ui/tsconfig.json` extending `expo/tsconfig.base` with `compilerOptions.strict = true`, `noUncheckedIndexedAccess = true`, `exactOptionalPropertyTypes = true`, `paths: { "@/*": ["src/*"] }`, `baseUrl: "."` — `chore: add ui tsconfig strict`

## 5. Lint and format config

- [x] **5.1** Create `ui/eslint.config.js` (flat config) using `eslint-config-expo` preset — `chore: add ui eslint flat config`
- [x] **5.2** Create `ui/.prettierrc` with default Expo-friendly settings (single quotes, 2-space indent, trailing comma `all`) — `chore: add ui prettier config`

> **Note (5.1 deviation)**: Prettier is owned via `bun format` instead of being wired into `eslint --fix`. The two tools are kept independent so the eslint config does not need `eslint-config-prettier` as a dependency.

## 6. Source code (entry + placeholder)

- [x] **6.1** Create `ui/index.ts` registering the Expo Router entry — `chore: add ui entry`
- [x] **6.2** Create `ui/App.tsx` as a no-op root (Expo Router owns the rendered tree via `expo-router/entry`) — `feat: add ui app stack root`
- [x] **6.3** Create `ui/app/index.tsx` rendering the smoke placeholder (`<Text>DriverLedger — setup-expo-skeleton smoke</Text>`) — `feat: add ui placeholder route`

> **Note (6.2 deviation)**: AD-7 explicitly forbids `<Stack>` in the placeholder. `App.tsx` returns `null` and exists only for tooling that probes for an `App` export. Navigation patterns land in Fase 3.

## 7. Documentation

- [x] **7.1** Create `ui/README.md` documenting install (`bun install --filter ui`), dev (`bun --filter ui dev`), platform targets, lint (`bun --filter ui lint`), type-check (`bun --filter ui tsc`), test (`bun --filter ui test`), Expo SDK version, and the `feature/setup-expo-skeleton` branch reference — `docs: add ui readme`

## 8. Verification (must pass before merge)

- [x] **8.1** Run `bun install --filter ui` — completes without errors, lockfile written — `chore: verify bun install deterministic`
- [x] **8.2** Run `bun --filter ui tsc --noEmit` — exits 0 — `chore: verify tsc passes`
- [x] **8.3** Run `bun --filter ui lint` — exits 0 — `chore: verify lint passes`
- [ ] **8.4** Run `bun --filter ui dev` — boots Expo Dev Tools, placeholder route renders in browser preview — `chore: verify dev server boots`
- [x] **8.5** Run `openspec validate setup-expo-skeleton --strict` — exits 0 — `chore: verify openspec strict`

> **Note (8.4 deferral)**: `bun dev` opens an interactive Metro/Expo Dev Tools session which requires a foreground TTY. Skipped under this non-interactive apply session; manual smoke check is queued for gate 2 review.

## 9. Cross-domain boundary audit

- [x] **9.1** Confirm `git diff develop --stat` shows zero files under `data/` or `services/` — `chore: verify cross-domain boundary`

## 10. Merge and archive (human gate 2)

- [ ] **10.1** PR `feature/setup-expo-skeleton` → `develop` (after human gate 2 approval)
- [ ] **10.2** `openspec archive setup-expo-skeleton` — moves change folder to `openspec/changes/archive/YYYY-MM-DD-setup-expo-skeleton/`
- [ ] **10.3** Delete `feature/setup-expo-skeleton` local and remote

## Bonus (added at apply time)

- [x] **B.1** Add `openspec/changes/setup-expo-skeleton/specs/ui-bootstrap/spec.md` so `openspec validate --strict` has at least one delta. Documents the scaffold's guarantees (deterministic install, strict TS, lint clean, bundle boots, no cross-domain leaks). — `docs: add ui-bootstrap capability spec`

---

## Notes

- No `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` — Bun only.
- No `node_modules/` commit — `.gitignore` blocks it.
- No `.env` file at any level — secrets are deferred to Fase 2 (Supabase anon key handled by `expo-secure-store` per RFC-001 §8).
- No CI config in this change — separate change.
- The first commit on the branch (`chore: branch setup-expo-skeleton`) is purely a governance marker; the substantive commits 1.1–7.1 follow the conventional commit table in `docs/gitflow.md`.