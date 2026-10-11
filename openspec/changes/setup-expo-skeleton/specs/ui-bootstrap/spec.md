# Capability: ui-bootstrap

## Purpose

The DriverLedger mobile shell scaffolds the Expo SDK 57+ runtime so subsequent UI changes (Fase 1+) land on a deterministic install, strict TypeScript, lint-clean default, and a booting bundle. This capability records the **observable guarantees** of the scaffold, not the screens or business behaviour — those arrive in Fase 3+.

## ADDED Requirements

### Requirement: Bun workspace with Expo SDK 57+ pinned

The repository SHALL declare a Bun workspace with `ui/` as its single member. `ui/package.json` SHALL pin runtime dependencies at SDK 57+ versions and SHALL declare `packageManager` set to the Bun version used at apply time.

#### Scenario: workspace installs deterministically

- WHEN the user runs `bun install` from the repo root
- THEN the lockfile SHALL be materialized at the repo root
- AND the dependency resolution SHALL complete without peer-dep errors blocking the install
- AND `ui/node_modules` SHALL contain `expo`, `expo-router`, and the Expo modules declared in `package.json`

### Requirement: Strict TypeScript configuration

`ui/tsconfig.json` SHALL extend `expo/tsconfig.base` and SHALL enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitOverride`.

#### Scenario: type-check passes against the placeholder

- WHEN the user runs `bun --filter ui tsc --noEmit`
- THEN the command SHALL exit 0
- AND the strict-mode flags SHALL be active in the resolved config

### Requirement: ESLint v9 flat config

`ui/eslint.config.js` SHALL consume the `eslint-config-expo` preset via its `flat` entry, SHALL ignore `node_modules`, `.expo`, `dist`, and `coverage`, and SHALL wire TypeScript path-alias resolution at lint time.

#### Scenario: lint passes against the placeholder

- WHEN the user runs `bun --filter ui lint`
- THEN the command SHALL exit 0

### Requirement: Expo Router placeholder route

`ui/index.ts` SHALL import `expo-router/entry`. `ui/app/index.tsx` SHALL export a default React component that renders a Text node identifying the bundle as the DriverLedger smoke screen. `ui/App.tsx` SHALL exist as a tooling-compatibility no-op root.

#### Scenario: placeholder bundle boots

- WHEN the user runs `bun --filter ui dev` and Metro bundles the project
- THEN the placeholder route SHALL mount at `/`
- AND the rendered Text SHALL include the substring `DriverLedger`

### Requirement: No behaviour outside the placeholder

The scaffold SHALL NOT add business logic, data access, navigation beyond a single route, or any dependency beyond what is required to boot the bundle. Subsequent capabilities (screens, services, sync) SHALL land in their own OpenSpec changes.

#### Scenario: cross-domain boundary is respected

- WHEN the user inspects the diff between `develop` and `feature/setup-expo-skeleton`
- THEN the diff SHALL be confined to `ui/`, the root `package.json`, the lockfile, and `openspec/changes/setup-expo-skeleton/`
- AND the diff SHALL NOT introduce any file under `data/`, `services/`, `tests/`, or `openspec/specs/` (main specs)
