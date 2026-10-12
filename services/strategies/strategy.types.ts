/**
 * `strategy.types.ts` — cross-domain contract for the platform strategy
 * pattern. This file is the **single import surface** for the UI layer
 * (Phase 3 Pi territory): `import type { StrategySuggestion, PlatformStrategy,
 * StrategySuggestInput, StrategyContext } from 'services/strategies/strategy.types'`.
 *
 * Type-only contract:
 * - No runtime imports, no I/O, no `Date.now()`, no `Math.random()`.
 * - The single `import type` is `CarreraPayload` from `services/carrera.repo.ts`
 *   (DQ-1 resolution: strategies MAY import types from the repo, never runtime).
 * - `UnknownStrategyError` is the one runtime value exported here because the
 *   UI (M01 modal) needs a typed catch for resolution failures.
 *
 * Mirrors engram topic `sdd/driverledger/add-platform-strategies/interface`
 * (#1939) byte-for-byte at first commit. OI-1 (`plataforma: PlataformaRow`
 * on `StrategySuggestInput`) lands in PR #1 Task 1.4 alongside the
 * `CarreraService` skeleton, at which point the engram topic is updated
 * in lockstep.
 *
 * Source: `docs/RFC-001-arquitectura.md §Open-closed`,
 * `docs/RFC-003-logica-registro.md §Strategy + §Confirmación de un toque`,
 * design.md AD-1 + AD-8 + AD-14 + AD-15.
 */

import type { CarreraPayload } from '../carrera.repo';

/**
 * Caller-supplied context (date, time, GPS hint if a carrera is active).
 * `fecha` and `horaLocal` are driver-local strings — Phase 4 drivers paste
 * the notification text and rely on the device clock for timestamp extraction.
 */
export interface StrategyContext {
  /** Driver-local calendar date, ISO YYYY-MM-DD. */
  fecha?: string;
  /** Device-local HH:mm, used by DiDi/InDrive timestamp extraction. */
  horaLocal?: string;
  /** True iff the driver is mid-trip (GPS Subject active). Phase 5 hook. */
  carreraActiva?: boolean;
}

/**
 * Raw driver input — paste of notification/screenshot text plus driver context.
 * Future Phase 6 may add an `input.kind: 'paste' | 'stream'` discriminator
 * without breaking the interface (AD-11 forward-compat).
 */
export interface StrategySuggestInput {
  raw: string;
  context: StrategyContext;
}

/**
 * Strategy output — what the driver sees in M01 confirmation modal.
 * `confidence` is in `[0, 1]`; below the project's `CONFIDENCE_THRESHOLD`
 * the modal renders the full manual form per `docs/RFC-003-logica-registro.md`
 * line 42 "Editar".
 */
export interface StrategySuggestion {
  /** Canonical write shape; conforms to CarreraPayload. */
  draft: CarreraPayload;
  /** 0..1; <0.3 forces UI to render the manual form. */
  confidence: number;
  /** Subset of CarreraPayload keys the modal exposes as editable before confirm. */
  editableFields: ReadonlyArray<keyof CarreraPayload>;
}

/**
 * The Strategy interface — open-closed seam (AD-1, AD-3).
 * Adding a 4th platform = new class + new registry entry; the interface
 * stays stable. Phase 6 may replace a strategy's `suggest()` body (e.g.
 * Uber OAuth2 stream) without changing this shape.
 */
export interface PlatformStrategy {
  /** Matches `plataformas.tipo_estrategia` (e.g. 'uber_api', 'didi_manual'). */
  readonly tipo: string;
  /** False in Phase 4 for all three; true = UI may skip the modal. */
  readonly oneTapCapable: boolean;
  suggest(input: StrategySuggestInput): Promise<StrategySuggestion>;
}

/**
 * `UnknownStrategyError` — thrown by `getStrategyByTipo` when the registry
 * has no entry for the requested `tipo_estrategia`. The `tipo` field lets
 * `CarreraService` log + the UI render an actionable error in M01.
 *
 * Mirrors the W-LOG-CONFLICT precedent of typed dot-namespaced errors
 * from Phase 2 (`services/sync-queue.service.ts:481-489`).
 */
export class UnknownStrategyError extends Error {
  public readonly tipo: string;

  constructor(tipo: string) {
    super(`[strategy.registry] no strategy registered for tipo_estrategia='${tipo}'`);
    this.name = 'UnknownStrategyError';
    this.tipo = tipo;
    // Preserve prototype chain across the super() boundary (TS target ES5
    // would drop the prototype otherwise; harmless on ES2020 but defensive).
    Object.setPrototypeOf(this, UnknownStrategyError.prototype);
  }
}
