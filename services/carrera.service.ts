/**
 * `carrera.service.ts` — orchestration layer between the UI (Phase 3 Pi),
 * the strategies registry (Phase 4 OpenCode), and the local SQLite repo
 * (Phase 1 OpenCode frozen).
 *
 * Public surface (PR #1 Task 1.4 + PR #2 Task 2.4):
 *   - `listPlataformas(): Promise<PlataformaRow[]>` — reference data for
 *     V04 onboarding + M01 modal.
 *   - `getStrategyByTipo(tipo): PlatformStrategy` — registry lookup with
 *     `console.warn` on miss (matching the W-LOG-CONFLICT precedent at
 *     `services/sync-queue.service.ts:481-489`).
 *   - `suggestRegistration(driverId, plataformaId, input)` — resolves
 *     `plataformaId` → `PlataformaRow` → strategy → `StrategySuggestion`.
 *     OVERWRITES `suggestion.draft.plataforma_id` so the UI never has to
 *     trust the strategy's outbound field.
 *   - `commitRegistration(driverId, suggestion, tripId?)` — writes the
 *     Carrera row via `carreraRepo.upsertByTripId` and emits the audit
 *     `log_eventos(tipo='carrera.registered')` row ONLY on (a) below-
 *     threshold fallback OR (b) repo error (AD-5, mirroring W-LOG-CONFLICT).
 *
 * Two errors are typed:
 *   - `UnknownStrategyError` (re-exported from the registry module)
 *   - `UnknownPlataformaError` (this module; `plataformaId` typed miss)
 *
 * AD-10 cross-domain rule: this file does NOT import
 * `services/sync-queue.service.ts` or `expo-sqlite`. The auto-enqueue
 * subscription at `services/sync-queue.service.ts:547-549` catches every
 * Carrera write structurally via `dbChange$`; we never enqueue manually
 * (R-8 mitigation). The static check is enforced by
 * `services/__tests__/carrera.service.test.ts` (PR #2 Task 2.4).
 */

import type { CarreraRow, PlataformaRow } from '../data/sqlite/types';

import { listPlataformas as carreraRepoListPlataformas, upsertByTripId as carreraRepoUpsertByTripId } from './carrera.repo';
import { fromJson, getDb } from './db.service';
import { STRATEGY_REGISTRY } from './strategies/registry';
import { CONFIDENCE_THRESHOLD } from './strategies/confidence';
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
 * Optional DI: a custom upsert function for tests that want to simulate
 * a repo error. Production code uses `carreraRepo.upsertByTripId` (the
 * Phase 1 frozen contract). Mirrored after the `registry` parameter so
 * the constructor pattern is consistent.
 */
export type Upserter = (
  driverId: string,
  tripId: string,
  payload: import('./carrera.repo').CarreraPayload,
) => Promise<import('../data/sqlite/types').CarreraRow>;

/**
 * `CarreraService` — orchestration class.
 *
 * The single instance state is the (frozen) registry reference; once
 * constructed, the service holds no mutable data. `new CarreraService()`
 * can be created freely in tests without ceremony (DQ-2 resolution).
 *
 * The `registry` override lets PR #2 unit tests inject fake strategies
 * (e.g. `DidiStrategy` after Task 2.2) without touching the static
 * module-level map. The `upsert` override lets the error-path audit
 * test inject a throwing upsert. The overrides are intentionally NOT
 * exposed via setter methods — that would violate AD-3's "frozen at
 * module import" guarantee.
 */
export class CarreraService {
  private readonly registry: RegistryLike;
  private readonly upsert: Upserter;

  constructor(
    registry: RegistryLike = STRATEGY_REGISTRY as RegistryLike,
    upsert: Upserter = carreraRepoUpsertByTripId,
  ) {
    this.registry = registry;
    this.upsert = upsert;
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
   * `getStrategyByTipo` — instance-level registry lookup, with a
   * `console.warn` log emitted before re-throwing. Mirrors the
   * W-LOG-CONFLICT precedent (one observable signal per miss).
   *
   * Uses the instance's `this.registry` (not the module-level
   * `STRATEGY_REGISTRY`) so DI-injected overrides take effect. This
   * is the resolution that makes the constructor's `registry`
   * parameter actually do something (the test suite relies on it
   * to inject a fake strategy for the happy-path audit assertion).
   */
  getStrategyByTipo(tipo: string): PlatformStrategy {
    const strategy = this.registry[tipo];
    if (strategy === undefined) {
      console.warn(
        `[carrera.service] strategy lookup miss: tipo_estrategia='${tipo}' ` +
          `(phase 4 ships uber_api + didi_manual + indrive_form; ` +
          `did the user add a new plataforma row without registering a strategy?)`,
      );
      throw new UnknownStrategyError(tipo);
    }
    return strategy;
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

  /**
   * `commitRegistration` — write the Carrera row + emit the audit
   * `log_eventos(tipo='carrera.registered')` row on the exceptional path.
   *
   * AD-5 audit policy (mirrors W-LOG-CONFLICT at
   * `services/sync-queue.service.ts:481-489`):
   *   - Happy path (confidence >= CONFIDENCE_THRESHOLD AND repo resolves):
   *     NO `log_eventos` row.
   *   - Below-threshold fallback (confidence < CONFIDENCE_THRESHOLD):
   *     ONE `log_eventos` row with `metadata.fallback = 'manual-form'`,
   *     `metadata.plataforma_id`, `metadata.trip_id`.
   *   - Repo error: ONE `log_eventos` row with `metadata.error = '<message>'`,
   *     `metadata.plataforma_id`, `metadata.trip_id`. The original
   *     exception propagates AFTER the audit row is committed.
   *
   * The audit INSERT goes through `getDb()` from `db.service.ts` —
   * the only legal write facade per Phase 1 AD-10 (`local-rls-facade`).
   * The audit row is NOT enqueued into `sync_queue`; `log_eventos` is
   * local-only and never goes to Supabase (mirroring W-LOG-CONFLICT).
   *
   * `tripId` is `crypto.randomUUID()` if not supplied; a re-confirm of
   * the same M01 modal produces ONE row (idempotent via
   * `UNIQUE(driver_id, trip_id)`).
   *
   * Sync enqueue is automatic: `carreraRepo.upsertByTripId` is the
   * only legal `dbChange$` emitter (`services/carrera.repo.ts:218-236`),
   * and the Phase 2 subscription at
   * `services/sync-queue.service.ts:547-549` catches every Carrera
   * write structurally. This service does NOT import `sync-queue.service`
   * (R-8, AD-10).
   */
  async commitRegistration(
    driverId: string,
    suggestion: StrategySuggestion,
    tripId?: string,
  ): Promise<CarreraRow> {
    const finalTripId = tripId ?? crypto.randomUUID();

    try {
      const row = await this.upsert(
        driverId,
        finalTripId,
        suggestion.draft,
      );

      // Below-threshold audit — happy path emits nothing (AD-5).
      if (suggestion.confidence < CONFIDENCE_THRESHOLD) {
        await writeAuditRow(driverId, {
          fallback: 'manual-form',
          plataforma_id: row.plataforma_id,
          trip_id: finalTripId,
          confidence: suggestion.confidence,
        });
      }

      return row;
    } catch (err) {
      // Error-path audit — written BEFORE the exception propagates
      // so the audit row is visible in `log_eventos` even on failure
      // (AD-5: "audit the exceptional path, not the happy path").
      try {
        await writeAuditRow(driverId, {
          error: err instanceof Error ? err.message : String(err),
          plataforma_id: suggestion.draft.plataforma_id,
          trip_id: finalTripId,
        });
      } catch {
        // Audit-write failure is non-fatal: the original error is
        // what the caller cares about. Swallow to avoid masking it.
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helper — single chokepoint for the audit `log_eventos` row.
// ---------------------------------------------------------------------------

/**
 * `writeAuditRow` — insert one `log_eventos(tipo='carrera.registered')`
 * row via the Phase 1 `LocalDatabase` facade. Called from
 * `commitRegistration` on (a) below-threshold fallback OR (b) repo error.
 *
 * The dot-namespaced `tipo` matches the W-LOG-CONFLICT precedent at
 * `services/sync-queue.service.ts:481-489`.
 */
async function writeAuditRow(
  driverId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  db.run(
    `INSERT INTO log_eventos (driver_id, tipo, metadata, created_at)
     VALUES (?, ?, ?, ?)`,
    [
      driverId,
      'carrera.registered',
      fromJson(metadata),
      new Date().toISOString(),
    ],
  );
}
