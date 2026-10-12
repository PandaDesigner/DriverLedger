/**
 * `uber.strategy.ts` — Phase 4 stub for the Uber platform strategy.
 *
 * The stub returns `confidence: 0`, `oneTapCapable: false`,
 * `fuente: 'manual'`, `estado: 'activa'`, and `metadata.platform_session_id
 * = 'phase4-stub-pending-phase6'` (OI-4 marker). The marker lets the future
 * Phase 6 migration reconcile Carrera rows that originated from the stub.
 *
 * Phase 6 replaces this body with the OAuth2 trip-stream implementation
 * (AD-6, AD-1). The interface (`PlatformStrategy`), the registry key
 * (`tipo_estrategia = 'uber_api'`), and `oneTapCapable` stay stable —
 * the open-closed seam documented in `services/strategies/README.md`.
 *
 * The driver-facing UX in M01: low confidence forces the manual form per
 * `docs/RFC-003-logica-registro.md` line 42 "Editar"; the stub is the
 * canonical "no auto-fill possible" path.
 */

import type { CarreraPayload } from '../carrera.repo';

import { normalize } from './parse';
import type {
  PlatformStrategy,
  StrategySuggestInput,
  StrategySuggestion,
} from './strategy.types';

/**
 * `editableFields` — the full set of `CarreraPayload` keys the driver
 * can edit in M01 when the stub forces the manual form. Mirrors the
 * spec scenario `platform-strategy-uber-stub §stub expone todos los
 * campos editables`.
 */
const ALL_EDITABLE_FIELDS: ReadonlyArray<keyof CarreraPayload> = [
  'plataforma_id',
  'tarifa_bruta',
  'comision',
  'origen',
  'destino',
  'distancia_km',
  'duracion_min',
  'gasolina',
  'fecha',
] as const;

/**
 * Compose the stub draft. Pure function — every value is a literal; no
 * I/O, no Date, no platform metadata lookup. `plataforma_id` is left
 * empty because `CarreraService.suggestRegistration` overrides it with
 * the resolved `plataformaId` after lookup (AD-15, OI-1).
 */
function buildStubDraft(normalizedRaw: string): CarreraPayload {
  return {
    plataforma_id: '',
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
    metadata: {
      // OI-4 marker — Phase 6 reconciles Carrera rows that originated
      // from this stub. Drivers who edit-then-confirm get a row whose
      // metadata flags it as legacy.
      phase4_stub: true,
      awaiting_phase6: 'api',
      platform_session_id: 'phase4-stub-pending-phase6',
      raw_normalized: normalizedRaw,
    },
  };
}

/**
 * Phase 4 stub `PlatformStrategy` for Uber. Exported as a singleton-style
 * const object so `getStrategyByTipo('uber_api')` returns THIS instance
 * across the registry. Strategies are stateless in Phase 4; the
 * singleton pattern keeps the registry lightweight and matches the
 * "static at boot" guarantee from AD-3.
 */
export const UberStrategy: PlatformStrategy = {
  tipo: 'uber_api',
  oneTapCapable: false,

  async suggest(input: StrategySuggestInput): Promise<StrategySuggestion> {
    // AD-13: normalization runs first via the shared helper. The
    // strategy receives the normalized text; the stub echoes the
    // normalized body into `metadata.raw_normalized` so future Phase 6
    // migration has the original surface to work from.
    const normalizedRaw = normalize(input.raw);

    return {
      draft: buildStubDraft(normalizedRaw),
      confidence: 0,
      editableFields: ALL_EDITABLE_FIELDS,
    };
  },
};
