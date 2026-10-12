---
name: platform-strategies
version: 1.0.0
status: draft
created: 2026-10-11
related_changes:
  - add-platform-strategies
related_specs:
  - data-model
  - local-data-model
  - sync-queue
---

# platform-strategies Specification (Delta)

## Purpose

Phase 4 of `docs/PRD-consolidado.md §8`. Lands the per-platform Strategy pattern (Uber / DiDi / InDrive) referenced in `docs/RFC-001-arquitectura.md §Open-closed`, `docs/RFC-002-modelo-datos.md §Open-closed`, and `docs/RFC-003-logica-registro.md §Strategy`. The Strategy interface (`PlatformStrategy`) is the open-closed seam: adding a 4th platform requires INSERT into `plataformas` + a new strategy class + a registry entry — no schema migration. Phase 3 (UI screens, Pi territory) consumes the `StrategySuggestion` contract this capability publishes; Phase 6 (Uber API integration) replaces the `UberStrategy` stub body without changing the interface.

## ADDED Requirements

### Requirement: platform-strategy-interface

The `PlatformStrategy` interface SHALL be the open-closed seam between Strategy classes and their consumers (`CarreraService`, Phase 3 Pi modals). The interface SHALL be importable as TypeScript types only from `ui/` (no runtime import, per the cross-domain rule in `docs/documento-maestro-agentes.md §1-5`).

```typescript
// services/strategies/strategy.types.ts (public cross-domain contract)
import type { CarreraPayload } from '../carrera.repo';

export interface StrategyContext {
  fecha?: string;
  horaLocal?: string;
  carreraActiva?: boolean;
}

export interface StrategySuggestInput {
  raw: string;
  context: StrategyContext;
}

export interface StrategySuggestion {
  draft: CarreraPayload;
  /** 0..1; < 0.3 forces UI to render the manual form (RFC-003 line 42 "Editar"). */
  confidence: number;
  /** Subset of CarreraPayload keys the modal exposes as editable before confirm. */
  editableFields: ReadonlyArray<keyof CarreraPayload>;
}

export interface PlatformStrategy {
  readonly tipo: string;
  readonly oneTapCapable: boolean;
  suggest(input: StrategySuggestInput): Promise<StrategySuggestion>;
}
```

#### Scenario: three concrete strategies implement PlatformStrategy

- **WHEN** the registry loads at module init
- **THEN** `UberStrategy`, `DidiStrategy`, and `InDriveStrategy` SHALL each satisfy `PlatformStrategy` (assignable to it)
- **AND** `UberStrategy.tipo === 'uber_api'`, `DidiStrategy.tipo === 'didi_manual'`, `InDriveStrategy.tipo === 'indrive_form'`
- **AND** every concrete strategy SHALL set `oneTapCapable === false` in Phase 4

#### Scenario: StrategySuggestion.draft conforms to CarreraPayload

- **WHEN** any strategy returns a `StrategySuggestion`
- **THEN** `draft` SHALL be assignable to `CarreraPayload` (the canonical write shape from `services/carrera.repo.ts:36-52`) without unsafe casts
- **AND** `draft.plataforma_id` SHALL equal the `id` of the `PlataformaRow` resolved by `CarreraService.listPlataformas()`
- **AND** `draft.tarifa_bruta` SHALL be a finite `number` (NOT `NaN`, NOT `Infinity`); a parser that fails to extract a fare MUST return `confidence < 0.3` instead of a `NaN` value

#### Scenario: interface is type-only import from ui/

- **WHEN** a file under `ui/` writes `import type { PlatformStrategy, StrategySuggestion, StrategySuggestInput, StrategyContext } from 'services/strategies'`
- **THEN** the TypeScript compiler SHALL resolve the symbols as type-only (no runtime dependency on `services/strategies/**` from `ui/**`)
- **AND** `git diff develop --stat` for the cross-domain audit SHALL show zero non-type files imported across the boundary

#### Scenario: adding a 4th platform does not change PlatformStrategy

- **WHEN** a future change ships `RappiStrategy implements PlatformStrategy` and registers it under `tipo = 'rappi_paste'`
- **THEN** the `PlatformStrategy` interface SHALL NOT be modified
- **AND** `CarreraService` and the Phase 3 M01 modal SHALL compile unmodified
- **AND** the only required code additions SHALL be (a) `services/strategies/rappi.strategy.ts`, (b) one entry in `STRATEGY_REGISTRY`, (c) one INSERT into `plataformas` (covered by `platform-strategy-open-closed`)

#### Source

- `docs/RFC-001-arquitectura.md` §Decisiones + §Open-closed — Strategy auto-fill + open-closed principle.
- `docs/RFC-003-logica-registro.md` §Strategy + §Confirmación de un toque — per-platform methods + modal contract.
- `openspec/specs/data-model/spec.md` §plataformas-global-read + §carreras-fuente-check + §carreras-estado-check — table contracts.
- `services/carrera.repo.ts:36-52` — `CarreraPayload` (the canonical write shape `draft` must conform to).
- `data/sqlite/types.ts:54-95` — `CarreraFuente`, `CarreraEstado`, `CarreraRow`, `PlataformaRow`.

### Requirement: platform-strategy-registry

The system SHALL resolve `plataformas.tipo_estrategia` to a `PlatformStrategy` instance via a static boot-time registry (`STRATEGY_REGISTRY: Record<string, PlatformStrategy>`) populated at module load with the three seeded `tipo_estrategia` values from `data/migrations/0003_seeds.sql:24-34`.

```typescript
// services/strategies/registry.ts
export const STRATEGY_REGISTRY: Readonly<Record<string, PlatformStrategy>> =
  Object.freeze({
    uber_api: new UberStrategy(),
    didi_manual: new DidiStrategy(),
    indrive_form: new InDriveStrategy(),
  });

export class UnknownStrategyError extends Error {
  constructor(public readonly tipo: string) {
    super(`[strategies] Unknown tipo_estrategia: '${tipo}'`);
    this.name = 'UnknownStrategyError';
  }
}

export function getStrategyByTipo(tipo: string): PlatformStrategy {
  const strategy = STRATEGY_REGISTRY[tipo];
  if (!strategy) throw new UnknownStrategyError(tipo);
  return strategy;
}
```

#### Scenario: registry resolves all three seeded tipos

- **WHEN** `getStrategyByTipo('uber_api')`, `getStrategyByTipo('didi_manual')`, AND `getStrategyByTipo('indrive_form')` are called
- **THEN** each call SHALL return the corresponding `UberStrategy`, `DidiStrategy`, and `InDriveStrategy` instance respectively
- **AND** the returned `strategy.tipo` SHALL match the argument
- **AND** the same instance SHALL be returned on every call (the registry is a singleton map)

#### Scenario: unknown tipo throws UnknownStrategyError

- **WHEN** `getStrategyByTipo('rappi_paste')` is called BEFORE a `RappiStrategy` is registered
- **THEN** the registry SHALL throw an `UnknownStrategyError` whose `tipo` property equals `'rappi_paste'`
- **AND** the error message SHALL include the offending key verbatim
- **AND** the thrown error SHALL be a subclass of `Error` (catchable by `instanceof Error`)

#### Scenario: registry is static and frozen at boot

- **WHEN** `STRATEGY_REGISTRY` is read at runtime
- **THEN** its contents SHALL be the same objects registered at module-load time
- **AND** `Object.isFrozen(STRATEGY_REGISTRY) === true` (runtime mutation SHALL throw `TypeError` in strict mode and SHALL be impossible from a non-frozen reference)
- **AND** no strategy instance field SHALL be reassigned after construction

#### Scenario: registry loads at module import (eager, not lazy)

- **WHEN** any file does `import { STRATEGY_REGISTRY } from 'services/strategies/registry'`
- **THEN** the three strategy constructors SHALL be invoked at that import time
- **AND** the `Object.freeze(...)` call SHALL have completed before any `getStrategyByTipo` call
- **AND** a test importing the registry in isolation SHALL observe three populated keys without any explicit init step

#### Source

- `data/migrations/0003_seeds.sql:22-35` — three seeded `plataformas` rows with `tipo_estrategia` values `uber_api`, `didi_manual`, `indrive_form`.
- `openspec/specs/data-model/spec.md` §plataformas-global-read — `plataformas` reference data shape.
- `docs/RFC-001-arquitectura.md` §Open-closed — static registry mandated.

### Requirement: platform-strategy-uber-stub

`UberStrategy` in Phase 4 SHALL return a stub `StrategySuggestion` regardless of input. Phase 6 may replace the body without changing the interface, per `sdd/driverledger/add-platform-strategies/proposal` §Approach Q2 + R-4.

```typescript
// services/strategies/uber.strategy.ts
export class UberStrategy implements PlatformStrategy {
  readonly tipo = 'uber_api';
  readonly oneTapCapable = false;

  async suggest(_input: StrategySuggestInput): Promise<StrategySuggestion> {
    return {
      draft: {
        plataforma_id: '<resolved at call site by CarreraService>',
        tarifa_bruta: 0,
        comision: 0,
        gasolina: 0,
        origen: null,
        destino: null,
        distancia_km: null,
        duracion_min: null,
        estado: 'activa',
        fuente: 'manual',
        fecha: null,
        metadata: { phase4_stub: true, awaiting_phase6: 'api' },
      },
      confidence: 0,
      editableFields: ['plataforma_id', 'tarifa_bruta', 'origen', 'destino',
        'distancia_km', 'duracion_min', 'gasolina', 'fecha'],
    };
  }
}
```

#### Scenario: stub returns confidence 0 and oneTapCapable false

- **WHEN** `uberStrategy.suggest({ raw: '<any non-empty text>', context: {} })` is called
- **THEN** the returned `StrategySuggestion` SHALL have `confidence === 0`
- **AND** the strategy instance SHALL have `oneTapCapable === false`
- **AND** `draft.fuente === 'manual'`
- **AND** `draft.estado === 'activa'` (the Uber active-trip lifecycle per `carrera-estado-lifecycle`)

#### Scenario: stub forces the manual form in the UI

- **WHEN** the M01 modal (Phase 3) receives a `StrategySuggestion` with `confidence < 0.3` (the stub returns `0`)
- **THEN** the modal SHALL render the manual form (`docs/RFC-003-logica-registro.md` line 42 "Editar")
- **AND** every field in `editableFields` SHALL be exposed as a writable input
- **AND** the driver SHALL NOT see an auto-filled preview; the modal SHALL present the form as if the strategy had returned an empty paste

#### Scenario: stub is pure (no I/O)

- **WHEN** `uberStrategy.suggest(...)` is called
- **THEN** the function SHALL NOT read the file system, SHALL NOT make a network request, SHALL NOT touch `expo-task-manager` / `expo-location`, AND SHALL NOT call `getDb()` (no SQLite I/O)
- **AND** the function SHALL be deterministic (same input → same `StrategySuggestion` shape)
- **AND** the test suite SHALL assert `Object.is(uberStrategy.suggest(input), uberStrategy.suggest(input))` only checks shape, not identity (Promise wrapper)

#### Scenario: Phase 6 may replace the body without interface change

- **WHEN** a future Phase 6 change modifies only the body of `UberStrategy.suggest(...)` (e.g. calls Uber Driver API + parses response)
- **THEN** the `PlatformStrategy` interface SHALL remain unchanged
- **AND** `CarreraService.confirmRegistration` SHALL compile unmodified
- **AND** the only required change SHALL be the `UberStrategy` class body plus optional new fields under `draft.metadata` (JSONB extension, no schema change)
- **AND** `tipo: 'uber_api'` and `oneTapCapable` SHALL remain stable (open-closed promise holds)

#### Source

- `docs/RFC-003-logica-registro.md` §Strategy — "UberStrategy: Uber Driver API (OAuth2) cuando esté disponible. Fallback a confirmación de un toque."
- `data/migrations/0003_seeds.sql:24-26` — `tipo_estrategia = 'uber_api'` seed (Phase 4 cannot fully honour; stub documented in `services/strategies/README.md`).
- `openspec/specs/data-model/spec.md` §carreras-fuente-check — `fuente IN ('manual', 'api', 'background')`; Phase 4 stub uses `'manual'`, Phase 6 flips to `'api'`.
- `sdd/driverledger/add-platform-strategies/proposal` §Q2 + R-4 — Phase 6 body swap is forward-compatible by design.

### Requirement: platform-strategy-didi-paste

`DidiStrategy.suggest(raw)` SHALL parse DiDi-style notification/screenshot text into a `StrategySuggestion` with editable `origen`, `destino`, `tarifa_bruta`, `distancia_km`, `duracion_min`. The parser SHALL treat the paste as a post-ride confirmation, so `draft.estado = 'completada'`.

The confidence threshold for fallback to the manual form is `0.3`, codified as a constant exported from `services/strategies/registry.ts` (per `sdd/driverledger/add-platform-strategies/proposal` Notes).

#### Scenario: happy-path paste yields high confidence

- **WHEN** `raw` contains a DiDi-style notification with `Tarifa: $12.500 COP`, `Origen: Calle 10`, `Destino: Centro`, AND `Distancia: 4,2 km`
- **THEN** the returned `StrategySuggestion` SHALL have `confidence >= 0.7`
- **AND** `draft.tarifa_bruta === 12500` (COP, no decimals, no currency markers)
- **AND** `draft.origen === 'Calle 10'` AND `draft.destino === 'Centro'`
- **AND** `draft.distancia_km === 4.2` (comma-decimal normalised to dot-decimal)
- **AND** `draft.estado === 'completada'`
- **AND** `draft.fuente === 'manual'`

#### Scenario: missing fare drops confidence below the threshold

- **WHEN** `raw` contains a DiDi-style notification WITHOUT a recognisable fare line (no `Tarifa`, no `$`, no numeric currency)
- **THEN** the returned `StrategySuggestion` SHALL have `confidence < 0.3`
- **AND** `editableFields` SHALL include `tarifa_bruta` so the driver can type the missing value
- **AND** `editableFields` SHALL also include `origen` and `destino` if they could not be parsed
- **AND** the M01 modal SHALL render the manual form

#### Scenario: empty raw string yields confidence 0

- **WHEN** `raw === ''` (or `raw.trim() === ''`)
- **THEN** the returned `StrategySuggestion` SHALL have `confidence === 0`
- **AND** `draft.tarifa_bruta === 0` (NOT `NaN`)
- **AND** `editableFields` SHALL include every CarreraPayload key the driver must fill manually
- **AND** the modal SHALL render the manual form (the only path forward)

#### Scenario: paste that names another platform throws UnknownPlatformError

- **WHEN** `raw` contains a recognisable `Uber` brand marker (e.g. `Uber Driver`, `UberX`, `Rappi`) but no DiDi markers
- **THEN** `DidiStrategy.suggest(...)` SHALL reject with a `UnknownPlatformError` (or `StrategyParseError` extending `Error`)
- **AND** the error message SHALL include the offending brand token
- **AND** the rejection SHALL be a `Promise.reject(...)` (test asserts `await expect(...).rejects.toThrow(...)`)

#### Scenario: post-ride confirmation always lands as completada

- **WHEN** any DiDi `StrategySuggestion` is returned (any confidence, any `editableFields`)
- **THEN** `draft.estado SHALL be 'completada'` (DiDi pastes are post-ride notifications)
- **AND** `draft.fuente SHALL be 'manual'`
- **AND** the SQLite CHECK constraint `carreras_estado_check` SHALL accept the value (`openspec/specs/data-model/spec.md` §carreras-estado-check)

#### Source

- `docs/RFC-003-logica-registro.md` §Strategy — "DidiStrategy: suscripción diaria, registro semi-manual."
- `docs/gherkin-modelo-datos.md` Feature: Registro de carreras → "Carrera manual en DiDi o InDrive" — `fuente = manual, estado = completada`.
- `services/carrera.repo.ts:36-52` — `CarreraPayload` (the `draft` shape).
- `data/sqlite/types.ts:54-95` — `CarreraEstado`, `CarreraFuente`, `CarreraRow`.
- `openspec/specs/data-model/spec.md` §carreras-fuente-check + §carreras-estado-check — DB-level constraints.

### Requirement: platform-strategy-indrive-paste

`InDriveStrategy.suggest(raw)` SHALL parse InDrive-style negotiated-fare notification/screenshot text into a `StrategySuggestion`. Negotiated-fare pastes frequently lack origin/destination addresses, so `origen` / `destino` MAY be `null` even at high confidence. Same confidence contract as `DidiStrategy`.

#### Scenario: negotiated-fare paste yields high confidence without addresses

- **WHEN** `raw` contains an InDrive-style notification with `Precio acordado: 8.000 COP` AND a route line `Calle 50 → Poblado` but NO distance line
- **THEN** the returned `StrategySuggestion` SHALL have `confidence >= 0.7`
- **AND** `draft.tarifa_bruta === 8000` (parsed from the "acordado" key, not the "Tarifa" key)
- **AND** `draft.origen === 'Calle 50'` AND `draft.destino === 'Poblado'`
- **AND** `draft.distancia_km === null` (InDrive pastes frequently omit distance; absence is not a parse failure)
- **AND** `draft.estado === 'completada'`

#### Scenario: missing negotiated fare drops confidence below the threshold

- **WHEN** `raw` contains InDrive text WITHOUT an `acordado` keyword or numeric fare
- **THEN** the returned `StrategySuggestion` SHALL have `confidence < 0.3`
- **AND** `editableFields` SHALL include `tarifa_bruta` (the driver must type the negotiated value)
- **AND** `editableFields` SHALL also include `origen` and `destino` ONLY when those fields could not be parsed
- **AND** the M01 modal SHALL render the manual form

#### Scenario: post-ride confirmation always lands as completada

- **WHEN** any InDrive `StrategySuggestion` is returned
- **THEN** `draft.estado SHALL be 'completada'`
- **AND** `draft.fuente SHALL be 'manual'`
- **AND** the SQLite CHECK constraints SHALL accept the value

#### Scenario: editableFields excludes null fields

- **WHEN** `InDriveStrategy.suggest(...)` cannot parse `origen` (returns `null`) but CAN parse `tarifa_bruta`
- **THEN** `editableFields` SHALL include `tarifa_bruta` (driver-visible input)
- **AND** `editableFields` SHALL NOT include `origen` (the field is null; the form should not present an empty input for a field the driver has no data for)
- **AND** the same rule SHALL apply symmetrically to `destino`, `distancia_km`, `duracion_min`, `gasolina`

#### Scenario: paste that names another platform throws UnknownPlatformError

- **WHEN** `raw` contains a recognisable `Uber` or `DiDi` brand marker but no `InDrive` marker
- **THEN** `InDriveStrategy.suggest(...)` SHALL reject with a `UnknownPlatformError`
- **AND** the rejection SHALL be a `Promise.reject(...)`
- **AND** the modal SHALL show an error state (per `docs/ui/views.md` line 109-117 "error" state)

#### Source

- `docs/RFC-003-logica-registro.md` §Strategy — "InDriveStrategy: formulario rápido / confirmación de un toque (sin API)."
- `data/migrations/0003_seeds.sql:32-34` — InDrive seed with `tipo_estrategia = 'indrive_form'` and `api_supported: false`.
- `docs/gherkin-modelo-datos.md` Feature: Registro de carreras → "Carrera manual en DiDi o InDrive".
- `openspec/specs/data-model/spec.md` §carreras-fuente-check + §carreras-estado-check.

### Requirement: carrera-service-orchestration

`CarreraService.confirmRegistration(driverId, plataformaId, input)` SHALL resolve the strategy, call `suggest`, return a `StrategySuggestion` to the UI; on driver confirm, the service SHALL route the `draft` through `carreraRepo.upsertByTripId` and write the audit row ONLY on the exceptional path. The service SHALL never enqueue manually and SHALL never import `services/sync-queue.service.ts`.

```typescript
// services/carrera.service.ts
export class CarreraService {
  async suggestRegistration(
    driverId: string,
    plataformaId: string,
    input: StrategySuggestInput,
  ): Promise<StrategySuggestion> {
    const plataforma = await this.resolvePlataforma(plataformaId);
    const strategy = getStrategyByTipo(plataforma.tipo_estrategia);
    const suggestion = await strategy.suggest(input);
    suggestion.draft.plataforma_id = plataformaId;
    return suggestion;
  }

  async confirmRegistration(
    driverId: string,
    plataformaId: string,
    input: StrategySuggestInput,
    finalDraft: CarreraPayload,
  ): Promise<CarreraRow> {
    const tripId = crypto.randomUUID();
    try {
      const row = await carreraRepo.upsertByTripId(driverId, tripId, finalDraft);
      if ((input && /* confidence < 0.3 case */)) {
        await this.writeAuditRow(driverId, 'carrera.registered',
          { fallback: 'manual-form', plataforma_id: plataformaId, trip_id: tripId });
      }
      return row;
    } catch (err) {
      await this.writeAuditRow(driverId, 'carrera.registered',
        { error: (err as Error).message, plataforma_id: plataformaId, trip_id: tripId });
      throw err;
    }
  }
}
```

#### Scenario: suggestRegistration returns a StrategySuggestion and writes nothing

- **WHEN** `CarreraService.suggestRegistration(driverId, plataformaId, { raw, context })` is called
- **THEN** the return value SHALL be a `StrategySuggestion` whose `draft` conforms to `CarreraPayload` (`services/carrera.repo.ts:36-52`)
- **AND** the resolved strategy's `tipo` SHALL equal the `tipo_estrategia` of the `plataformas` row whose `id === plataformaId`
- **AND** NO row SHALL be written to `carreras` (suggestion is a read-side computation only)
- **AND** `dbChange$` SHALL NOT emit (no write happened)

#### Scenario: confirmRegistration writes one carrera row with a local UUID

- **WHEN** the driver confirms the `StrategySuggestion` returned by `suggestRegistration`
- **THEN** `CarreraService.confirmRegistration` SHALL call `carreraRepo.upsertByTripId(driverId, generatedTripId, finalDraft)` exactly once
- **AND** the `generatedTripId` SHALL be `crypto.randomUUID()` (a RFC 4122 v4 UUID; the trip_id is local, NOT a platform-supplied id; Phase 6 may flip Uber's `trip_id` to a platform-supplied value without changing the contract)
- **AND** `dbChange$` SHALL emit exactly one event with `table === 'carreras'`
- **AND** the Phase 2 enqueue subscription (`services/sync-queue.service.ts:547-549`) SHALL auto-enqueue the row (single funnel preserved)

#### Scenario: happy-path confirmation writes no audit row

- **WHEN** `CarreraService.confirmRegistration` is called AND `confidence >= 0.3` AND `carreraRepo.upsertByTripId` resolves successfully
- **THEN** NO new `log_eventos` row SHALL be inserted by `CarreraService` (the `sync.conflict` row from Phase 2 is independent and is NOT counted here)
- **AND** the `eventos$` BehaviorSubject snapshot count SHALL be unchanged (modulo any concurrent writes)

#### Scenario: unknown plataformaId throws UnknownPlataformaError

- **WHEN** `CarreraService.confirmRegistration(driverId, 'non-seeded-uuid', input)` is called
- **THEN** the service SHALL reject with a typed `UnknownPlataformaError` (or `Error` subclass) whose message includes the offending `plataformaId`
- **AND** NO row SHALL be written to `carreras` and NO row SHALL be written to `log_eventos`
- **AND** the rejection SHALL be a `Promise.reject(...)` (test asserts `await expect(...).rejects.toThrow(...)`)

#### Scenario: CarreraService never imports sync-queue.service

- **WHEN** code review inspects `services/carrera.service.ts` for the literal token `import` plus the module specifier `services/sync-queue.service`
- **THEN** zero matches SHALL appear (the auto-enqueue funnel is structural; manual enqueue would break de-dup)
- **AND** no `import` of `expo-sqlite` SHALL appear (per `local-rls-facade`)
- **AND** the `git diff develop --stat` cross-domain audit SHALL confirm `services/sync-queue.service.ts` is byte-identical to its pre-Phase-4 version

#### Scenario: audit row is written on repo error

- **WHEN** `carreraRepo.upsertByTripId(driverId, tripId, draft)` throws (e.g. `tarifa_bruta = NaN` violates the column constraint, or the unique constraint fires)
- **THEN** one `log_eventos` row SHALL be inserted via the `db.service.ts` facade with `tipo = 'carrera.registered'`, `metadata.error = '<message>'`, `metadata.plataforma_id = plataformaId`, AND `metadata.trip_id = tripId`
- **AND** the original exception SHALL propagate to the caller AFTER the audit row is committed (the test asserts `await expect(...).rejects.toThrow(...)` AND `SELECT COUNT(*) FROM log_eventos WHERE tipo = 'carrera.registered'` === 1)

#### Source

- `docs/RFC-003-logica-registro.md` §Confirmación de un toque (line 39-43) — "pantalla muestra: plataforma, tarifa, origen, destino, duración, gasolina estimada, comisión, neto. Un tap confirma."
- `docs/RFC-004-sincronizacion.md` §Flujo 1 — every Carrera write lands first on SQLite; strategy output routes through `carreraRepo.upsertByTripId`.
- `services/carrera.repo.ts:66-139` — `upsertByTripId` (Phase 1 frozen; consumes `CarreraPayload`).
- `services/carrera.repo.ts:187-192` — `listPlataformas` (registry boot seed).
- `services/sync-queue.service.ts:547-549` — `dbChange$` filter that auto-enqueues Carrera writes (single funnel).
- `openspec/specs/local-data-model/spec.md` §local-rls-facade — write facade mandate.
- `openspec/specs/sync-queue/spec.md` §sync-enqueue-de-dup + §sync-rls-facade-mirror — auto-enqueue contract.

### Requirement: carrera-estado-lifecycle

The system SHALL encode the per-platform `estado` choice from locked decision Q4: Uber = `activa → completada` (driver transitions via a separate confirm action); DiDi / InDrive = `completada` on initial confirm.

#### Scenario: Uber strategy seeds an activa carrera

- **WHEN** `UberStrategy.suggest(...)` returns a `StrategySuggestion`
- **THEN** `draft.estado SHALL be 'activa'` (the active-trip state; the driver transitions to `completada` later via a separate `carreraRepo.upsertByTripId` call with `estado: 'completada'`)
- **AND** `draft.fuente SHALL be 'manual'` in Phase 4 (Phase 6 flips to `'api'` without interface change)
- **AND** the SQLite CHECK constraint `carreras_estado_check` SHALL accept the value

#### Scenario: DiDi confirmation lands as completada

- **WHEN** the driver confirms a DiDi-sourced `StrategySuggestion`
- **THEN** the resulting `carreras` row SHALL have `estado = 'completada'`
- **AND** `fuente = 'manual'`
- **AND** the update path `activa → completada` is NOT exercised for DiDi (the row never has `estado = 'activa'`)

#### Scenario: InDrive confirmation lands as completada

- **WHEN** the driver confirms an InDrive-sourced `StrategySuggestion`
- **THEN** the resulting `carreras` row SHALL have `estado = 'completada'`
- **AND** `fuente = 'manual'`

#### Scenario: fuente per platform in Phase 4

- **WHEN** any of the three strategies returns a `StrategySuggestion` in Phase 4
- **THEN** `draft.fuente SHALL be 'manual'` for all three (Uber stub, DiDi parser, InDrive parser)
- **AND** the value SHALL satisfy the SQLite CHECK constraint `carreras_fuente_check` per `openspec/specs/data-model/spec.md` §carreras-fuente-check (`fuente IN ('manual', 'api', 'background')`)
- **AND** Phase 6 may flip Uber's `fuente` to `'api'` without changing the strategy interface or `CarreraService`

#### Scenario: carrera-fuente-check rejects out-of-vocabulary fuente

- **WHEN** a write attempts `fuente = 'screenshot'` (or any value outside `'manual' | 'api' | 'background'`)
- **THEN** the SQLite CHECK constraint SHALL reject the write
- **AND** `carreraRepo.upsertByTripId` SHALL throw (the `try/catch` in `confirmRegistration` then writes the audit row per `carrera-service-orchestration`)

#### Source

- `docs/PRD-consolidado.md` §4 — "modales: confirmación de carrera (un toque)" (line 51) + Strategy pattern placement.
- `docs/gherkin-modelo-datos.md` Feature: Registro de carreras — "Carrera completada por Uber" (activa → completada) and "Carrera manual en DiDi o InDrive" (completada on confirm).
- `openspec/specs/data-model/spec.md` §carreras-estado-check + §carreras-fuente-check.
- `data/sqlite/types.ts:54-95` — `CarreraEstado`, `CarreraFuente` literal unions.
- `sdd/driverledger/add-platform-strategies/proposal` §Q4 — locked decision Q4.

### Requirement: platform-strategy-open-closed

The system SHALL ship a static registry plus an extension guide so that adding a 4th platform requires ONLY INSERT into `plataformas` + a new strategy class + a new registry entry — no schema migration, no `PlatformStrategy` interface change. `services/strategies/README.md` SHALL document the extension flow as a step-by-step checklist.

#### Scenario: 4th platform = INSERT + new class + new registry entry

- **WHEN** a future change adds a 4th platform by (a) `INSERT INTO plataformas (id, nombre, comision, tipo_estrategia, metadata) VALUES ('rappi-uuid', 'Rappi', 22, 'rappi_paste', '{}')`, (b) creating `services/strategies/rappi.strategy.ts` implementing `PlatformStrategy`, AND (c) adding `rappi_paste: new RappiStrategy()` to `STRATEGY_REGISTRY`
- **THEN** the system SHALL resolve `rappi_paste` from the registry via `getStrategyByTipo('rappi_paste')`
- **AND** no existing file under `services/strategies/**`, `services/carrera.service.ts`, OR `data/sqlite/**` SHALL need modification
- **AND** the change SHALL be its own OpenSpec change (per `docs/gitflow.md` §3 single-change / single-branch)

#### Scenario: extension guide lives in services/strategies/README.md

- **WHEN** a developer reads `services/strategies/README.md`
- **THEN** the document SHALL contain a numbered extension checklist with at minimum: (1) `INSERT` into `plataformas` (id, nombre, comision, tipo_estrategia, metadata); (2) create `services/strategies/<name>.strategy.ts` implementing `PlatformStrategy`; (3) add `<tipo_estrategia>: new <Name>Strategy()` to `STRATEGY_REGISTRY` in `services/strategies/registry.ts`; (4) write a colocated test in `services/strategies/__tests__/<name>.strategy.test.ts`; (5) open a new OpenSpec change
- **AND** the document SHALL explicitly call out that no schema migration is required
- **AND** the document SHALL explicitly call out that no `PlatformStrategy` interface change is required
- **AND** a `Phase 6 stub-replacement example` section SHALL show how to swap an `UberStrategy` body without touching the interface

#### Scenario: user-added-platform UI is out of scope

- **WHEN** a future change proposes exposing a "Add platform" UI in Phase 3
- **THEN** that capability SHALL be a separate OpenSpec change (per `sdd/driverledger/add-platform-strategies/proposal` §Q5 + §Out-of-Scope)
- **AND** Phase 4 explicitly excludes runtime registration: every strategy registration is a code change reviewed at PR time
- **AND** the registry SHALL NOT expose any `register(tipo, strategy)` function (compile-time check + code review)

#### Source

- `docs/RFC-001-arquitectura.md` §Open-closed — "agregar plataforma = INSERT en `plataformas`, no migración".
- `docs/RFC-002-modelo-datos.md` §Open-closed — `plataformas.tipo_estrategia` discriminator.
- `docs/gitflow.md` §3 — single-change / single-branch / cross-domain audit.
- `openspec/specs/data-model/spec.md` §plataformas-global-read — INSERT is the only way to add a platform.
- `sdd/driverledger/add-platform-strategies/proposal` §Q5 + §Out-of-Scope.

### Requirement: platform-strategy-audit-log

The system SHALL insert a `log_eventos(tipo = 'carrera.registered')` row ONLY on the exceptional path: (a) `suggestRegistration` returns `confidence < 0.3` (parse fallback) AND the driver proceeds to confirm, OR (b) `carreraRepo.upsertByTripId` throws. The audit row SHALL be inserted via the `services/db.service.ts` facade (per `local-rls-facade`); the dot-namespaced `tipo` matches the Phase 2 `sync.conflict` precedent at `services/sync-queue.service.ts:481-489`.

```typescript
// services/carrera.service.ts (audit row helper)
private async writeAuditRow(
  driverId: string,
  reason: 'manual-form' | Error,
  context: { plataforma_id: string; trip_id: string },
): Promise<void> {
  const db = await getDb();
  const metadata = reason === 'manual-form'
    ? { fallback: 'manual-form', plataforma_id: context.plataforma_id, trip_id: context.trip_id }
    : { error: reason.message, plataforma_id: context.plataforma_id, trip_id: context.trip_id };
  const ts = new Date().toISOString();
  db.run(
    `INSERT INTO log_eventos (id, driver_id, tipo, metadata, created_at)
     VALUES (?, ?, 'carrera.registered', ?, ?)`,
    [crypto.randomUUID(), driverId, fromJson(metadata), ts],
  );
}
```

#### Scenario: happy path writes no audit row

- **WHEN** the driver confirms a `StrategySuggestion` with `confidence >= 0.3` AND `carreraRepo.upsertByTripId` resolves successfully
- **THEN** NO new `log_eventos` row SHALL be inserted by `CarreraService` with `tipo = 'carrera.registered'`
- **AND** `SELECT COUNT(*) FROM log_eventos WHERE tipo = 'carrera.registered'` SHALL equal the pre-confirm count
- **AND** the `sync.conflict` audit rows from Phase 2 are independent and SHALL NOT be counted in this assertion

#### Scenario: parse fallback (confidence < 0.3) writes one audit row

- **WHEN** `CarreraService.confirmRegistration` proceeds with a `confidence < 0.3` confirmation
- **THEN** one `log_eventos` row SHALL be inserted via the `db.service.ts` facade with `tipo = 'carrera.registered'` and `metadata.fallback = 'manual-form'`
- **AND** `metadata.plataforma_id` SHALL equal the `plataformaId` argument
- **AND** `metadata.trip_id` SHALL equal the `generatedTripId` argument
- **AND** the `metadata` column SHALL be valid JSON (round-trips through `JSON.parse`)

#### Scenario: repo error writes one audit row and re-throws

- **WHEN** `carreraRepo.upsertByTripId(driverId, tripId, draft)` throws
- **THEN** one `log_eventos` row SHALL be inserted with `tipo = 'carrera.registered'`, `metadata.error = '<original message>'`, `metadata.plataforma_id = plataformaId`, AND `metadata.trip_id = tripId`
- **AND** the original exception SHALL propagate to the caller AFTER the audit row is committed (the test asserts `await expect(...).rejects.toThrow(...)` AND the audit row count)
- **AND** the audit row SHALL be inserted via the `db.service.ts` facade (no direct `expo-sqlite` import in `services/carrera.service.ts`)

#### Scenario: audit row taxonomy matches Phase 2

- **WHEN** a `log_eventos` row is inserted by `CarreraService`
- **THEN** its `tipo` SHALL equal the literal string `'carrera.registered'` (dot-namespaced, matching the Phase 2 `sync.conflict` precedent at `services/sync-queue.service.ts:481-489`)
- **AND** the `metadata` column SHALL be valid JSON (the `json1` extension's `json_extract` returns the parsed object)
- **AND** the `driver_id` column SHALL equal the `driverId` argument (the audit row is per-driver; cross-driver isolation is enforced by RLS at the remote layer per `openspec/specs/data-model/spec.md` §rls-by-driver-id)

#### Source

- `services/sync-queue.service.ts:481-489` — W-LOG-CONFLICT precedent (Phase 2 audit log on the exceptional path only).
- `openspec/specs/local-data-model/spec.md` §local-rls-facade — every write routes through `db.service.ts`.
- `openspec/specs/data-model/spec.md` §rls-by-driver-id — `log_eventos` per-driver isolation.
- `data/sqlite/types.ts:127-133` — `LogEventoRow` shape (`id`, `driver_id`, `tipo`, `metadata`, `created_at`).
- `sdd/driverledger/add-platform-strategies/proposal` §Approach + R-6 — locked default Q8.
