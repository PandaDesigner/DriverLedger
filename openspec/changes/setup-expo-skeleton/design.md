# Design: setup-expo-skeleton

## Architectural Decisions

### AD-1 — Expo Router over bare React Navigation

**Decision**: Use Expo Router (file-system routing, app/ directory).

**Rationale**: Phase 3 expects 7 screens + 2 modals (PRD §6). File-system routing keeps the navigation graph declarative, discoverable by file path, and trivially reviewable in PRs. Bare React Navigation requires manual route registration and is error-prone at this scale. Expo Router also gives deep-link routing and typed routes for free, which the Strategy pattern (Fase 4) benefits from.

**Trade-off accepted**: Expo Router adds a small build-time codegen step. Worth it for the reviewability win.

### AD-2 — Bun as package manager, script runner, and test runner

**Decision**: Bun v1.3.12+ (`/opt/homebrew/bin/bun`) drives `install`, `run`, and `test`. No npm, no yarn, no jest, no vitest.

**Rationale**: User decision is final per the fase 0–7 plan. Bun is faster, has built-in TS transpilation (removes need for `ts-node`/`tsx`), and the native `bun test` runner is Jest-API compatible enough to cover Fase 7 without a second tool.

**Trade-off accepted**: Bun's lockfile (`bun.lockb`) is binary; some CI tooling prefers text lockfiles. Mitigation: pin Bun version in `package.json` `engines` and document in README.

### AD-3 — Bun workspaces (single-package workspace for `ui/`

**Decision**: Root `package.json` declares `workspaces: ["ui"]`. No other workspaces yet.

**Rationale**: The fase 0–7 plan splits by ownership (OpenCode → `data/`+`services/`; Pi → `ui/`+`tests/`). A workspace boundary lets Pi run `bun --filter ui tsc` without triggering any cross-domain work. The root workspace also gives a single `bun install` for the whole repo when Fase 1 lands.

### AD-4 — TypeScript strict + path alias `@/*` → `src/*`

**Decision**: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Alias `@/*` resolves to `src/*`.

**Rationale**: PRD §6 demands minimal cognitive load at the wheel; strict TS catches the class of bugs that survive review (off-by-one in index access, implicit `undefined` propagation). Path aliases avoid `../../../../services/...` in screen files once Phase 3 lands.

**Trade-off accepted**: `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` will require extra care in Phase 3 mapping logic. Worth the bug surface reduction.

### AD-5 — ESLint v9 flat config + Prettier

**Decision**: `eslint.config.js` (flat config) with `eslint-config-expo` preset; `.prettierrc` for formatting. `bun lint` runs ESLint; `bun format` runs Prettier.

**Rationale**: ESLint v9 deprecated `eslintrc`; the Expo ecosystem migrated. Flat config makes rule composition explicit and avoids the legacy `extends` chain.

**Trade-off accepted**: Some legacy plugins still require `eslintrc`. If `eslint-config-expo` preset fails to load under flat config, fall back to `@react-native/eslint-config` (community-maintained, flat-compatible) without changing the lint script.

### AD-6 — `bunfig.toml` peer-dep and coverage config

**Decision**:

```toml
[install]
peer = false

[install.cache]
disable = false

[test]
coverageThreshold = { lines = 80, functions = 80, statements = 80, branches = 80 }
```

**Rationale**: `peer = false` because Expo SDK packages declare conflicting peer ranges that cause non-deterministic resolution across Bun versions. Coverage thresholds are forward-looking — Fase 7 will gate at 80%; declaring them now means new files can't silently regress the floor.

### AD-7 — Single placeholder route, no navigation library calls yet

**Decision**: `app/index.tsx` renders `<Text>DriverLedger — setup-expo-skeleton smoke</Text>`. No `<Stack>`, no `<Tabs>`.

**Rationale**: Phase 0b proves the bundle boots. Adding `<Stack>` in Phase 0 commits us to navigation patterns before Phase 3 decides on tabs vs. stack. One route is the minimum sufficient smoke.

### AD-8 — Dependency set

**Runtime** (pinned to versions current at `sdd-apply` time):

| Package | Why |
|---------|-----|
| `expo` | SDK 57+ runtime |
| `expo-router` | File-system routing (AD-1) |
| `expo-ui` | Native primitives (SwiftUI / Compose) per RFC-001 §2 |
| `rxjs` | Observables layer per RFC-001 §3 |
| `@preact/signals-react` | Signal binding for UI consumption (RFC-001 §3) |
| `expo-sqlite` | Local offline-first DB per RFC-001 §4 |
| `@supabase/supabase-js` | Remote source of truth per RFC-001 §4 |
| `expo-secure-store` | Secrets + tokens per RFC-001 §8 |
| `expo-location` | GPS per RFC-001 §5 |
| `expo-task-manager` | Background tasks per RFC-001 §5 |

**Dev**:

| Package | Why |
|---------|-----|
| `typescript` | TS strict |
| `eslint` v9.x | Linting |
| `eslint-config-expo` (or `@react-native/eslint-config`) | RN ruleset |
| `prettier` | Formatting |
| `@types/react`, `@types/react-native` | Types |

**NOT included yet** (will be added in their respective phases):

- `bun-types` — when bun test is wired (Fase 7)
- `@playwright/test` — Fase 7
- Navigation gesture libraries — Fase 3
- Form/validation libraries — Fase 3
- `expo-notifications`, `expo-haptics` — only if a screen needs them

### AD-9 — Script set

```jsonc
{
  "scripts": {
    "dev": "npx expo start",
    "ios": "npx expo start --ios",
    "android": "npx expo start --android",
    "web": "npx expo start --web",
    "lint": "eslint .",
    "format": "prettier --write .",
    "tsc": "tsc --noEmit",
    "test": "bun test"
  }
}
```

Rationale: `npx expo start` is the canonical Expo Dev Tools command — Bun cannot execute the Metro bundler directly. Tests use native `bun test`. Lint and type-check are direct invocations to keep error messages clean.

### AD-10 — Out-of-scope reaffirmation

The following are explicitly NOT in this change:

- Business logic (PRD §4)
- Screens beyond `app/index.tsx` placeholder (PRD §6)
- Services (sync queue, network) — Fase 2
- DB layer (repositories, migrations) — Fase 1
- Navigation patterns beyond a single route — Fase 3
- Strategy pattern per platform — Fase 4
- GPS lifecycle — Fase 5
- Uber API integration — Fase 6 (blocked externally)
- Test suite (only coverage threshold declared) — Fase 7

## Citing Internal Plans

- `.claude/plans/driverledger-fase-0-7.plan.md` §"Fase 0b — `setup-expo-skeleton`" — file list and ownership rule
- `.claude/plans/driverledger-fase-0-7.plan.md` §"Patterns to Mirror" — Bun runtime decision
- `docs/RFC-001-arquitectura.md` — dependency set (AD-8)
- `docs/PRD-consolidado.md` §6 — UI scope (AD-7)
- `docs/gitflow.md` §1 — "1 change = 1 rama `feature/<change>`"
- `openspec/project.md` — governance + folder ownership (OpenCode vs Pi)
- Engram `#1892 sdd-init/driverledger` — stack and conventions cache

## Cross-Domain Boundary Check

This change touches ONLY:

- `ui/**` (new)
- `package.json` at root (workspaces manifest — neutral)
- `openspec/changes/setup-expo-skeleton/**` (this change folder)

It does NOT touch `data/`, `services/`, or any file under `openspec/specs/`. Pi owns `ui/`+`tests/`; this is squarely Pi work. The sibling change `setup-supabase-tables` (OpenCode, parallel) is independent and does not block this one.