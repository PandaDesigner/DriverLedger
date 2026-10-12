# services/strategies/

The **per-platform Strategy pattern** for DriverLedger. This directory
holds the open-closed seam that lets the app add a 4th platform without
a schema migration (per `docs/RFC-001-arquitectura.md §Open-closed` and
`docs/RFC-002-modelo-datos.md §Open-closed`).

## File map

- `strategy.types.ts` — `PlatformStrategy` interface + `StrategySuggestion`,
  `StrategySuggestInput`, `StrategyContext`, `UnknownStrategyError`. The
  **only** file Phase 3 Pi (`ui/`) imports from this directory — and only
  via `import type`. Cross-domain read-only contract (AD-8, AD-14).
- `registry.ts` — `STRATEGY_REGISTRY` (frozen at module import) +
  `getStrategyByTipo` lookup. Throws `UnknownStrategyError` on miss (AD-3).
- `confidence.ts` — `CONFIDENCE_THRESHOLD = 0.3` literal. Single source
  of truth for the manual-form threshold (AD-12). UI imports this constant.
- `parse.ts` — `normalize(raw)` helper. All strategies pipe their input
  through this seam before their per-platform parser (AD-13).
- `uber.strategy.ts` — Phase 4 stub. Returns `confidence: 0`,
  `oneTapCapable: false`, `fuente: 'manual'`, `estado: 'activa'` with
  `metadata.platform_session_id = 'phase4-stub-pending-phase6'` marker
  (OI-4). See "Replacing an existing strategy body" below.
- `didi.strategy.ts` — **Phase 2 (PR #2 Task 2.2)**. Paste-parser for
  DiDi notification text.
- `indrive.strategy.ts` — **Phase 2 (PR #2 Task 2.3)**. Paste-parser
  for InDrive negotiated-fare confirmation.
- `fees.ts` — **Phase 2 (PR #2 Task 2.1)**. Pure `calcularComision` +
  `calcularGasolina` helpers (AD-9).
- `ui-labels.ts` — **Phase 2 (PR #2 Task 2.4)**. The human-readable
  "Modo de conexión" map (R-2). This is the one accepted value-level
  import from `services/` to `ui/` (OI-5 exception).
- `index.ts` — barrel re-exporting the **types** and **constants** only
  (`StrategySuggestion`, `PlatformStrategy`, `StrategySuggestInput`,
  `StrategyContext`, `UnknownStrategyError`, `CONFIDENCE_THRESHOLD`,
  `STRATEGY_REGISTRY`, `getStrategyByTipo`). Does NOT re-export the
  strategy classes (cross-domain rule, AD-8).
- `__tests__/` — colocated unit tests for every module above.

## Adding a new platform (the open-closed procedure)

Five steps, in order. Following the project governance
(`docs/gitflow.md §3`: 1 OpenSpec change = 1 `feature/<change>` branch,
no squashing, PR review on `develop`):

1. **`INSERT` into `plataformas`.** Open a new PR against `data/migrations/`.
   Add the platform row with `(id, nombre, comision, tipo_estrategia,
   metadata)`. Choose a stable `tipo_estrategia` string (e.g. `rappi_form`).
   Reuse the `data/migrations/0003_seeds.sql` precedent.

2. **Author the strategy class** at `services/strategies/<name>.strategy.ts`,
   implementing the `PlatformStrategy` interface:

   ```typescript
   import type { PlatformStrategy, StrategySuggestInput, StrategySuggestion } from './strategy.types';

   export const RappiStrategy: PlatformStrategy = {
     tipo: 'rappi_form',
     oneTapCapable: false,
     async suggest(input: StrategySuggestInput): Promise<StrategySuggestion> {
       // Pure function: no I/O, no DB, no Date.now().
       // input.raw is already normalized via parse.normalize().
       // input.plataforma is already resolved (OI-1).
       // ...parse Rappi paste text...
       return {
         draft: { /* ... */ },
         confidence: 0.85,
         editableFields: ['tarifa_bruta', 'origen', 'destino'],
       };
     },
   };
   ```

   Import `normalize` from `./parse` if you need to re-run the helper on
   a sub-string (the input is already normalized at the service boundary).

3. **Register the strategy** in `services/strategies/registry.ts`:

   ```typescript
   import { RappiStrategy } from './rappi.strategy';

   export type TipoEstrategia =
     | 'uber_api'
     | 'didi_manual'
     | 'indrive_form'
     | 'rappi_form'; // <-- add to the union

   export const STRATEGY_REGISTRY = Object.freeze({
     uber_api: UberStrategy,
     didi_manual: DidiStrategy,
     indrive_form: InDriveStrategy,
     rappi_form: RappiStrategy, // <-- new entry
   } as const);
   ```

4. **Write a colocated test** at `services/strategies/__tests__/<name>.strategy.test.ts`.
   Cover: identity (`tipo`/`oneTapCapable`), happy-path parse, below-threshold
   fallback, cross-platform detection (throw if the wrong brand is in the
   paste), per-platform `estado` + `fuente`, purity (no `console.warn`,
   no I/O, deterministic on repeated calls). The Phase 2 tests follow this
   shape — copy them as a starting point.

5. **Ship as a new OpenSpec change** on a `feature/<change-name>` branch
   off `develop`. OpenSpec is the project's change-management protocol;
   your `proposal.md` documents the new `tipo_estrategia`, your
   `design.md` describes any parsing edge cases, your `tasks.md` lists
   the five steps above.

## Replacing an existing strategy body

The interface is the open-closed seam — replacing the body of a
strategy is **not** a breaking change. Phase 6 will replace
`UberStrategy.suggest` with the OAuth2 trip-stream body without
touching:

- the `PlatformStrategy` interface,
- the `tipo: 'uber_api'` registry key,
- `oneTapCapable`,
- the `StrategySuggestInput` / `StrategySuggestion` shapes,
- the `PlatformStrategy` import surface from `ui/`.

The replacement procedure (no migration, no new branch required
**for the strategy file itself**):

1. Drop in the new body. Keep the same `tipo` and `oneTapCapable`.
2. The OI-4 marker (`metadata.platform_session_id =
   'phase4-stub-pending-phase6'`) stays in the test for Carrera rows
   that originated from the stub during Phase 4–5. New rows from
   Phase 6+ replace it with a real OAuth2 session id.
3. The integration test in `services/__tests__/carrera.service.test.ts`
   updates the assertion. The `// @ts-expect-error` lines and the
   `metadata.platform_session_id` regex are the migration seams.
4. Re-run `bun test` and `bun test --coverage`. Coverage gate
   (≥80%) must hold.

## Cross-domain import rule

Phase 3 Pi (`ui/`) imports only:

```typescript
import type {
  StrategySuggestion,
  PlatformStrategy,
  StrategySuggestInput,
  StrategyContext,
} from 'services/strategies/strategy.types';
// OR via the barrel:
import type { ... } from 'services/strategies'; // types only
import { CONFIDENCE_THRESHOLD, STRATEGY_REGISTRY } from 'services/strategies';
```

**Forbidden** from `ui/`:

- Value-level imports of `UberStrategy`, `DidiStrategy`, `InDriveStrategy`,
  or any future strategy class.
- Runtime imports of any `services/strategies/**` module.
- Reads from the registry or any database I/O.

The single accepted value-level cross-domain import exception is
`services/strategies/ui-labels.ts` (OI-5), which ships the human-readable
"Modo de conexión" map for V04 onboarding. Future exceptions require an
explicit AD entry.
