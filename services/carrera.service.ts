/**
 * `carrera.service.ts` — orchestration layer between the UI (Phase 3 Pi),
 * the strategies registry (Phase 4 OpenCode), and the local SQLite repo
 * (Phase 1 OpenCode frozen).
 *
 * Public surface (PR #1 Task 1.4):
 *   - `listPlataformas(): Promise<PlataformaRow[]>` — reference data for
 *     V04 onboarding + M01 modal.
 *   - `getStrategyByTipo(tipo): PlatformStrategy` — registry lookup with
 *     `console.warn` on miss (matching the W-LOG-CONFLICT precedent at
 *     `services/sync-queue.service.ts:481-489`).
 *   - `suggestRegistration(driverId, plataformaId, input)` — resolves
 *     `plataformaId` → `PlataformaRow` → strategy → `StrategySuggestion`.
 *     OVERWRITES `suggestion.draft.plataforma_id` so the UI never has to
 *     trust the strategy's outbound field.
 *     NO DB WRITE in PR #1; `commitRegistration` lands in PR #2.
 *
 * Two errors are typed:
 *   - `UnknownStrategyError` (re-exported from the registry module)
 *   - `UnknownPlataformaError` (this module; `plataformaId` typed miss)
 *
 * AD-10 cross-domain rule: this file does NOT import
 * `services/sync-queue.service.ts` or `expo-sqlite`. The auto-enqueue
 * subscription at `services/sync-queue.service.ts:547-549` catches every
 * Carrera write structurally via `dbChange$`; we never enqueue manually
 * (R-8 mitigation).
 */

import type { PlataformaRow } from '../data/sqlite/types';

import { listPlataformas as carreraRepoListPlataformas } from './carrera.repo';
import {
  getStrategyByTipo as registryGetStrategyByTipo,
} from './strategies/registry';
import { STRATEGY_REGISTRY } from './strategies/registry';
import type {
  PlatformStrategy,
  StrategySuggestInput,
  StrategySuggestion,
} from './strategies/strategy.types';
import { UnknownStrategyError } from './strategies/strategy.types';
import { normalize } from './strategies/parse';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown by `suggestRegistration` when `plataformaId` does not resolve to a
 * row in the local `plataformas` table. Mirrors the typed-error pattern of
 * `UnknownStrategyError` (registry lookup miss) and `W-LOG-CONFLICT` Phase
 * 2 audit precedent (`services/sync-queue.service.ts:481-489`).
 */
export class UnknownPlataformaError extends Error {
  public readonly plataformaId: string;

  constructor(plataformaId: string) {
    super(
      `[carrera.service] no plataforma row for id='${plataformaId}' ` +
        `(did the user add it locally? call listPlataformas() to confirm)`,
    );
    this.name = 'UnknownPlataformaError';
    this.plataformaId = plataformaId;
    Object.setPrototypeOf(this, UnknownPlataformaError.prototype);
  }
}

// ---------------------------------------------------------------------------
// CarreraService
// ---------------------------------------------------------------------------

/**
 * Optional DI: pass a custom registry in tests to swap strategy behavior
 * without touching the static `STRATEGY_REGISTRY`. Default resolves at
 * module load so consumers do not pay a startup cost per call.
 */
export type RegistryLike = Readonly<Record<string, PlatformStrategy>>;

/**
 * `CarreraService` — orchestration class.
 *
 * The single instance state is the (frozen) registry reference; once
 * constructed, the service holds no mutable data. `new CarreraService()`
 * can be created freely in tests without ceremony (DQ-2 resolution).
 *
 * The `registry` override lets PR #2 unit tests inject fake strategies
 * (e.g. `DidiStrategy` after Task 2.2) without touching the static
 * module-level map. The override is intentionally NOT exposed via
 * a `setRegistry()` method — that would violate AD-3's "frozen at
 * module import" guarantee.
 */
export class CarreraService {
  private readonly registry: RegistryLike;

  constructor(
    registry: RegistryLike = STRATEGY_REGISTRY as RegistryLike,
  ) {
    this.registry = registry;
  }

  /**
   * `listPlataformas` — re-export of `carreraRepo.listPlataformas()` so
   * Phase 3 Pi has ONE entry point. Mirrors the "ui imports service, not
   * repo" cross-domain rule (AD-10).
   */
  async listPlataformas(): Promise<PlataformaRow[]> {
    return carreraRepoListPlataformas();
  }

  /**
   * `getStrategyByTipo` — re-export of the registry lookup, with a
   * `console.warn` log emitted before re-throwing. Mirrors the W-LOG-CONFLICT
   * precedent (one observable signal per miss).
   *
   * Caller can `try { service.getStrategyByTipo(...) } catch (err) { ... }`
   * to handle the `UnknownStrategyError` typed throw.
   */
  getStrategyByTipo(tipo: string): PlatformStrategy {
    try {
      return registryGetStrategyByTipo(tipo);
    } catch (err) {
      if (err instanceof UnknownStrategyError) {
        console.warn(
          `[carrera.service] strategy lookup miss: tipo_estrategia='${tipo}' ` +
            `(phase 4 ships only uber_api; PR #2 fills in didi_manual + indrive_form)`,
        );
      }
      throw err;
    }
  }

  /**
   * `suggestRegistration` — resolve `plataformaId` → `PlataformaRow` →
   * strategy → `StrategySuggestion`.
   *
   * PR #1 boundary: returns the suggestion WITHOUT writing anything to
   * the DB. PR #2 Task 2.4 adds the `commitRegistration` step that takes
   * the suggestion and writes through `carreraRepo.upsertByTripId` (with
   * the audit policy from `platform-strategy-audit-log`).
   *
   * Steps:
   *   1. Look up the `PlataformaRow` for `plataformaId`. Throws
   *      `UnknownPlataformaError` on a miss.
   *   2. Look up the strategy in the registry by `plataforma.tipo_estrategia`.
   *      Propagates `UnknownStrategyError`.
   *   3. Build a `StrategySuggestInput` that includes the resolved
   *      PlataformaRow (OI-1) AND passes the user's `raw` text through
   *      `parse.normalize()` first (AD-13: normalization runs at the
   *      service boundary, not in each strategy).
   *   4. Call `strategy.suggest(input)`.
   *   5. OVERRIDE `suggestion.draft.plataforma_id = plataformaId` so the
   *      UI never has to trust the strategy's outbound field.
   *      Strategies may set a placeholder; the service is the single
   *      resolver for the FK (AD-15).
   *   6. Return the suggestion.
   */
  async suggestRegistration(
    _driverId: string,
    plataformaId: string,
    input: StrategySuggestInput,
  ): Promise<StrategySuggestion> {
    const plataformas = await this.listPlataformas();
    const plataforma = plataformas.find((p) => p.id === plataformaId);
    if (!plataforma) {
      throw new UnknownPlataformaError(plataformaId);
    }

    const strategy = this.getStrategyByTipo(plataforma.tipo_estrategia);

    // AD-13: normalize the raw text at the service boundary so each
    // strategy receives the canonical form without re-implementing
    // the helper.
    const normalizedInput: StrategySuggestInput = {
      raw: normalize(input.raw),
      context: input.context,
      plataforma, // OI-1
    };

    const suggestion = await strategy.suggest(normalizedInput);

    // AD-15: overwrite plataforma_id with the resolved id; the
    // strategy's outbound field is treated as a hint, not a contract.
    return {
      ...suggestion,
      draft: {
        ...suggestion.draft,
        plataforma_id: plataformaId,
      },
    };
  }
}
