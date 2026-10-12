/**
 * `fees.ts` — shared `calcularComision` + `calcularGasolina` helpers (AD-9).
 *
 * RFC-003 §Strategy names `calcularComision` and `calcularGasolina` as
 * strategy instance methods. Decision Q3 in the proposal and the
 * `Interface shape options` exploration both recommended shared helpers:
 * the math is the same across all three seeded platforms; the only
 * variable is the per-platform `comision` value at the seed
 * (`data/migrations/0003_seeds.sql:24-34`). Three identical instance
 * methods would be dead code.
 *
 * Both helpers are **pure**:
 *   - no I/O
 *   - no `Date.now()`, no `Math.random()`
 *   - no `console.warn` / `console.error`
 *
 * Every strategy imports these helpers and passes the OI-1-resolved
 * `PlataformaRow` so the math reads from the canonical seed value.
 *
 * Source: `data/migrations/0003_seeds.sql:24-34` (per-platform `comision`),
 * `docs/RFC-003-logica-registro.md §Strategy` (canonical surface),
 * `sdd/driverledger/add-platform-strategies/design` AD-9.
 */

import type { PlataformaRow } from '../../data/sqlite/types';

/**
 * Phase 4 placeholder for fuel consumption. `0.08 L/km` is a single global
 * average; Phase 6 may add per-platform override tables without changing
 * the function signature — the override lives in `plataforma.metadata`
 * (a new key like `gasolina_km_per_litro`).
 *
 * Exported so the integration test can pin the value with a single
 * assertion (magic-number drift guard).
 */
export const CONSUMO_DEFAULT = 0.08 as const;

/**
 * `calcularComision` — `tarifaBruta * comision / 100`.
 *
 * `plataforma.comision` is a percent (e.g. `25.0` means 25%), mirroring
 * the seed schema's `comision REAL NOT NULL CHECK (comision >= 0 AND
 * comision <= 100)` constraint at `data/migrations/0001_init_schema.sql`.
 *
 * Examples (from the spec's canonical cases):
 *   - Uber:    12500 * 0.25 = 3125.00
 *   - DiDi:    12500 * 0.20 = 2500.00
 *   - InDrive:  8000 * 0.18 = 1440.00
 */
export function calcularComision(
  tarifaBruta: number,
  plataforma: PlataformaRow,
): number {
  return tarifaBruta * plataforma.comision / 100;
}

/**
 * `calcularGasolina` — `distanciaKm * CONSUMO_DEFAULT` (Phase 4 placeholder).
 *
 * Phase 6 may add a per-platform override (e.g. an electric vehicle on
 * InDrive with `plataforma.metadata.gasolina_km_per_litro = Infinity`).
 * When that lands, the helper should read from `plataforma.metadata` first
 * and fall back to `CONSUMO_DEFAULT`. The signature is stable.
 *
 * `distanciaKm` is the raw driver-typed distance. The caller is
 * responsible for parsing the number out of the paste; this helper does
 * not parse strings.
 */
export function calcularGasolina(
  distanciaKm: number,
  _plataforma: PlataformaRow,
): number {
  return distanciaKm * CONSUMO_DEFAULT;
}
