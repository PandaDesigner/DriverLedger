# DriverLedger — `ui/`

Expo SDK 57+ mobile shell. Implements Fase 0b (`setup-expo-skeleton`).

**Ownership:** Pi (`agent/pi`).
**Branch of record:** `feature/setup-expo-skeleton`.
**OpenSpec change:** `openspec/changes/setup-expo-skeleton/`.

## Stack at a glance

- React Native + Expo (SDK 57+), Expo Router (file-system routing)
- RxJS Observables + `@preact/signals-react`
- Local persistence: SQLite offline-first via `expo-sqlite`
- Remote source of truth: `@supabase/supabase-js` (RLS by `driver_id`)
- Background services: `expo-task-manager` + `expo-location` (GPS only in active rides)
- Secrets: `expo-secure-store` (never plaintext, never `.env` on the client)
- Bun as package manager, script runner, and test runner
- TypeScript strict + ESLint v9 flat config + Prettier

See `../docs/RFC-001-arquitectura.md` for the full architecture rationale.

## Folder layout (current)

```
ui/
├── App.tsx                 # no-op root kept for tooling compatibility
├── app/
│   └── index.tsx           # placeholder route at "/"
├── index.ts                # imports expo-router/entry
├── package.json            # workspace manifests + scripts
├── bunfig.toml             # Bun runtime config (peer=false, coverage thresholds)
├── tsconfig.json           # TS strict + path alias @/* -> src/*
├── eslint.config.js        # ESLint v9 flat config (eslint-config-expo)
├── .prettierrc             # Prettier defaults
├── .gitignore
└── app.json                # Expo config
```

`src/` will be added in Fase 3 when the seven real screens land; the path
alias `@/* → src/*` is pre-wired in `tsconfig.json` so future imports are
reviewable rather than `../../../../services/...`.

## Prerequisites

- Bun ≥ 1.3.12 (`brew install bun`)
- Node not required at the user level; Bun handles TS transpilation natively
- iOS Simulator (macOS) and/or Android emulator for `bun ios` / `bun android`

## Install

From the repository root:

```bash
bun install            # installs every workspace declared in the root package.json
```

Or scoped to this workspace only:

```bash
bun install --filter ui
```

This materializes the lockfile (`bun.lockb` or text variant) at the repo
root. Commit the lockfile alongside any dependency change.

## Common scripts

Run with `bun --filter ui <script>` from the repo root, or `bun <script>` from `ui/`.

| Script           | What it does                                                |
|------------------|-------------------------------------------------------------|
| `bun dev`        | Boots Expo Dev Tools (`npx expo start`)                     |
| `bun ios`        | Boots Dev Tools and opens iOS Simulator                     |
| `bun android`    | Boots Dev Tools and opens Android emulator                  |
| `bun web`        | Boots Dev Tools and serves the web bundle                   |
| `bun tsc`        | Runs `tsc --noEmit` against the strict TS config            |
| `bun lint`       | Runs ESLint v9 flat config                                  |
| `bun format`     | Runs Prettier write on the whole tree                      |
| `bun test`       | Runs the native Bun test runner (no tests yet — Fase 7)     |
| `bun coverage`   | Runs tests with coverage (threshold declared in `bunfig.toml`) |

## Smoke check (Fase 0b acceptance)

```bash
cd ui
bun install
bun tsc --noEmit      # exits 0 with strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
bun lint             # exits 0
```

Plus a manual `bun dev` to confirm the placeholder route renders at `/`.

## Cross-domain boundary

This folder is the exclusive domain of the `Pi` agent. It does not depend
on `data/` (Supabase tables) or `services/` (sync queue, strategies); both
are owned by `OpenCode` and live in their own OpenSpec changes
(`setup-supabase-tables` etc.). Don't add DB calls or platform logic here
until Fase 1 / Fase 4 land.

## What is NOT in this change

- Any screen beyond the placeholder (Login, Registro, Olvidar contraseña,
  Onboarding, Dashboard, Historial, Settings) — Fase 3.
- Modals (ride confirmation, expense entry) — Fase 3.
- Strategy pattern / `services/` — Fase 4 (OpenCode domain).
- SQLite schema, repositories, migrations — Fase 1 (OpenCode domain).
- Supabase schema, RLS, seeds — Fase 0a (parallel change, OpenCode domain).
- GPS lifecycle — Fase 5.
- Production builds / app store config — deferred.

## Troubleshooting

- `bun install` fails on peer-dep warnings → expected (`bunfig.toml` has
  `peer = false`); do NOT re-enable peer resolution globally.
- `bun tsc` errors on `react-native` types → run `bun install` again, RN
  bundles its own types in 0.81+.
- `bun lint` complains about `project` parser option → ensure
  `tsconfig.json` is in `ui/` and the JSON parses.
