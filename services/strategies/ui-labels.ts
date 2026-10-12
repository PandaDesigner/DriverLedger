/**
 * `ui-labels.ts` — human-readable "Modo de conexión" map for the
 * 3 seeded platforms (R-2 in the proposal, OI-5 in the design).
 *
 * Phase 3 Pi imports this from `services/strategies/ui-labels` as a
 * VALUE-LEVEL import — the one accepted exception to the AD-8
 * cross-domain rule. The import is a plain `Record`, not a type; the
 * UI renders the label in V04 onboarding ("¿Cómo te conectás con
 * Uber? — Modo API" vs. "¿Cómo te conectás con DiDi? — Modo manual
 * (captura)").
 *
 * The `as const` lets TypeScript narrow the keys to the literal
 * `TipoEstrategia` union (the same union that `STRATEGY_REGISTRY`
 * keys on, exported from `./registry`).
 *
 * Adding a 4th platform = new entry in this map + the registry +
 * the README extension guide. The map is intentionally a plain
 * object so the UI can iterate it without a code-side for-loop.
 *
 * Source: `sdd/driverledger/add-platform-strategies/proposal` R-2,
 * design AD-8 + OI-5.
 */

import type { TipoEstrategia } from './registry';

/**
 * `PLATFORM_UI_LABELS` — `tipo_estrategia` → Spanish label shown in
 * V04 onboarding + M01 modal header. Phase 4 ships the 3 seeded
 * platforms; the 4th is added in lockstep with the registry entry.
 */
export const PLATFORM_UI_LABELS: Readonly<Record<TipoEstrategia, string>> = Object.freeze({
  uber_api: 'Modo API',
  didi_manual: 'Modo manual (captura)',
  indrive_form: 'Modo formulario',
});
