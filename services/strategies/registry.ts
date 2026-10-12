/**
 * `registry.ts` — static, boot-time strategy registry (AD-3).
 *
 * The registry is `Object.freeze`d at module-load time. Adding a 4th
 * platform requires: a new `INSERT` into `plataformas`, a new strategy
 * class, and a new entry in `STRATEGY_REGISTRY` — never a migration
 * (`docs/RFC-002-modelo-datos.md §Open-closed`).
 *
 * Phase 4 ships with one entry (UberStrategy at `tipo_estrategia='uber_api'`);
 * PR #2 Task 2.2 + 2.3 add `didi_manual` + `indrive_form`. Lookup misses
 * throw a typed `UnknownStrategyError` so `CarreraService` and the UI can
 * react defensively (`CarreraService.getStrategyByTipo` `console.warn`s
 * the error and re-throws).
 */

import type { PlatformStrategy } from './strategy.types';
import { UnknownStrategyError } from './strategy.types';
import { UberStrategy } from './uber.strategy';

// ---------------------------------------------------------------------------
// Type-narrowed key set. Includes every value from `plataformas.tipo_estrategia`
// the seed migration installs (`data/migrations/0003_seeds.sql:24-34`). PR #2
// Tasks 2.2 + 2.3 extend the union as DiDi / InDrive land.
// ---------------------------------------------------------------------------

/**
 * Literal-string union over the seed `tipo_estrategia` values. Exported
 * so consumers (registry tests, future CarreraService callers) can
 * narrow without re-declaring the union.
 */
export type TipoEstrategia = 'uber_api' | 'didi_manual' | 'indrive_form';

// ---------------------------------------------------------------------------
// STRATEGY_REGISTRY — `Object.freeze`d literal; populated at module import.
// ---------------------------------------------------------------------------

/**
 * The boot-time strategy registry. Phase 4 ships with one entry; PR #2
 * fills in the other two. The object is `Object.freeze`d so runtime
 * mutation is impossible even if a future strategy import path becomes
 * dynamic (defensive — the project's "no auto-discovery" precedent at
 * `data/sqlite/migrations.ts` is honoured).
 *
 * `as const` lets TypeScript narrow to the literal key set; the
 * exported `TipoEstrategia` is the public-facing union.
 */
export const STRATEGY_REGISTRY = Object.freeze({
  uber_api: UberStrategy,
  // PR #2 Task 2.2 adds: didi_manual: DidiStrategy,
  // PR #2 Task 2.3 adds: indrive_form: InDriveStrategy.
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
