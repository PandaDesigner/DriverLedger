/**
 * `registry.ts` — static, boot-time strategy registry (AD-3).
 *
 * The registry is `Object.freeze`d at module-load time. Adding a 4th
 * platform requires: a new `INSERT` into `plataformas`, a new strategy
 * class, and a new entry in `STRATEGY_REGISTRY` — never a migration
 * (`docs/RFC-002-modelo-datos.md §Open-closed`).
 *
 * PR #1 shipped with one entry (UberStrategy at `tipo_estrategia='uber_api'`).
 * PR #2 Task 2.6 adds the other two seeded entries (`didi_manual`,
 * `indrive_form`) so all 3 platforms resolve from the registry. Lookup
 * misses throw a typed `UnknownStrategyError` so `CarreraService` and
 * the UI can react defensively.
 */

import type { PlatformStrategy } from './strategy.types';
import { UnknownStrategyError } from './strategy.types';
import { UberStrategy } from './uber.strategy';
import { DidiStrategy } from './didi.strategy';
import { InDriveStrategy } from './indrive.strategy';

// ---------------------------------------------------------------------------
// Type-narrowed key set. Includes every value from `plataformas.tipo_estrategia`
// the seed migration installs (`data/migrations/0003_seeds.sql:24-34`).
// ---------------------------------------------------------------------------

/**
 * Literal-string union over the seed `tipo_estrategia` values. Exported
 * so consumers (registry tests, `PLATFORM_UI_LABELS` in `ui-labels.ts`)
 * can narrow without re-declaring the union.
 */
export type TipoEstrategia = 'uber_api' | 'didi_manual' | 'indrive_form';

// ---------------------------------------------------------------------------
// STRATEGY_REGISTRY — `Object.freeze`d literal; populated at module import.
// ---------------------------------------------------------------------------

/**
 * The boot-time strategy registry. The 3 seeded entries are wired here;
 * the object is `Object.freeze`d so runtime mutation is impossible.
 *
 * `as const` lets TypeScript narrow to the literal key set; the
 * exported `TipoEstrategia` is the public-facing union.
 */
export const STRATEGY_REGISTRY = Object.freeze({
  uber_api: UberStrategy,
  didi_manual: DidiStrategy,
  indrive_form: InDriveStrategy,
} as const);

/**
 * `getStrategyByTipo` — single registry entry point. Returns the
 * registered strategy or throws `UnknownStrategyError` on a miss.
 *
 * Throws instead of returning `null` so callers cannot forget the
 * null-check (`CarreraService.getStrategyByTipo` and `suggestRegistration`
 * both call this in the hot path; a null return would silently skip
 * the audit log).
 */
export function getStrategyByTipo(tipo: string): PlatformStrategy {
  const strategy = (STRATEGY_REGISTRY as Record<string, PlatformStrategy | undefined>)[tipo];
  if (strategy === undefined) {
    throw new UnknownStrategyError(tipo);
  }
  return strategy;
}

/**
 * `hasStrategyByTipo` — non-throwing lookup. Useful for diagnostics
 * and PR #1's defensive tests; not used on the hot path.
 */
export function hasStrategyByTipo(tipo: string): boolean {
  return (STRATEGY_REGISTRY as Record<string, PlatformStrategy | undefined>)[tipo] !== undefined;
}
