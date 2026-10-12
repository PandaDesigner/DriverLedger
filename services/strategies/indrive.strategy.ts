/**
 * `indrive.strategy.ts` — InDrive platform strategy (PR #2 Task 2.3).
 *
 * InDrive is a negotiated-fare platform: the driver and passenger agree
 * on a price in-app, then the driver pastes the confirmation into
 * DriverLedger. The paste is less structured than DiDi:
 *
 *   "InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado"
 *
 * → `tarifa_bruta: 8000`, `comision: 1440` (18%), `origen: 'Calle 50'`,
 *   `destino: 'Poblado'`, `distancia_km: null` (InDrive pastes
 *   frequently omit distance; absence is not a parse failure),
 *   `estado: 'completada'`, `fuente: 'manual'`, `confidence: 0.85`.
 *
 * `editableFields` is dynamic: when the route is missing, the modal
 * must NOT expose `origen`/`destino` as editable (they are already
 * `null`, no need to edit). Same for `distancia_km` and `duracion_min`.
 *
 * Cross-platform guard: if the raw text contains a clear marker for a
 * DIFFERENT platform (Uber / DiDi) but NOT an InDrive marker, the strategy
 * throws `UnknownPlatformError` so `CarreraService` / the UI can route
 * the driver back to M01.
 *
 * Pure function — no I/O, no `Date.now()`, no `Math.random()`. The
 * `input.raw` is normalized via `parse.normalize` before parsing (AD-13);
 * the `input.plataforma` carries the resolved `PlataformaRow` (OI-1) so
 * we can call `calcularComision`.
 *
 * Source: `docs/RFC-003-logica-registro.md §Strategy`,
 * `openspec/changes/add-platform-strategies/specs/platform-strategies/spec.md`
 * requirement `platform-strategy-indrive-paste`, design AD-1 + AD-7 + AD-11 + AD-12.
 */

import type { CarreraPayload } from '../carrera.repo';
import type { PlataformaRow } from '../../data/sqlite/types';

import { normalize } from './parse';
import { calcularComision } from './fees';
import { CONFIDENCE_THRESHOLD } from './confidence';
import type {
  PlatformStrategy,
  StrategySuggestInput,
  StrategySuggestion,
} from './strategy.types';
import { UnknownPlatformError } from './strategy.types';

// ---------------------------------------------------------------------------
// Constants — confidence scoring + parser version marker.
// ---------------------------------------------------------------------------

/** The brand marker the parser looks for in the normalized raw text. */
const INDRIVE_MARKER = 'indrive';

/** Other platforms' brand markers (used by the cross-platform guard). */
const OTHER_MARKERS: ReadonlyArray<{ token: string; detected: string }> = [
  { token: 'uber', detected: 'uberApi' },
  { token: 'didi', detected: 'didiManual' },
];

/** Parser version — forward-compat for Phase 6 if InDrive ships an API. */
const PARSER_VERSION = 'indrive_strategy_v1';

/** Threshold at or above which the modal renders the auto-filled preview. */
const HIGH_CONFIDENCE = CONFIDENCE_THRESHOLD; // 0.3

// ---------------------------------------------------------------------------
// Regexes — happy-path parsers.
// ---------------------------------------------------------------------------

/**
 * Fare regex — InDrive uses three synonyms for the negotiated fare:
 * `acordado` (most common), `precio` (also seen), `tarifa` (rare but
 * possible in templated pastes). The capture group strips currency
 * markers and separators; `parseFare` converts to a numeric.
 */
const FARE_RE =
  /(?:precio\s+acordado|acordado|precio|tarifa)\s*[:\-]?\s*(?:\$\s*)?([\d.,]+)\s*(?:cop)?/i;

/**
 * Route regex (label form) — matches: `Origen: A\nDestino: B` or
 * `Origen: A Destino: B` (case-insensitive). Applied to the ORIGINAL
 * raw to preserve display case.
 */
const ROUTE_LABEL_RE = /origen\s*[:\-]\s*(.+?)\s*destino\s*[:\-]\s*(.+?)(?:\s*distancia|$)/i;

/**
 * Per-line arrow regex — matches an arrow (`→` or `->`) with non-empty
 * text on both sides. Applied to a single line (no `\n` in scope).
 * Used by `findArrowRoute` below.
 */
const ROUTE_ARROW_RE = /(\S(?:[^→]*\S)?)\s*[→]\s*(\S(?:[^→]*\S)?)/;

/** Distance regex — optional, InDrive pastes frequently omit it. */
const DISTANCE_RE = /distancia\s*[:\-]?\s*([\d.,]+)\s*km/i;

/** Optional negotiation id — best-effort. `Negociación #XYZ` etc. */
const NEGOTIATION_RE = /(?:negociaci[oó]n|negotiation)\s*#?\s*([a-z0-9\-]+)/i;

// ---------------------------------------------------------------------------
// Pure helpers — string → value.
// ---------------------------------------------------------------------------

/** Convert "8.000" or "8,000" → 8000. Strips dots/commas, no rounding. */
function parseFare(raw: string): number {
  const cleaned = raw.replace(/[.,]/g, '');
  if (cleaned === '' || !/^\d+$/.test(cleaned)) return 0;
  return Number.parseInt(cleaned, 10);
}

/** Convert "4,2" or "4.2" → 4.2. */
function parseDistanceKm(raw: string): number | null {
  const cleaned = raw.replace(',', '.').trim();
  if (cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) return null;
  return value;
}

/** Trim a route fragment, drop trailing punctuation. */
function trimRouteFragment(s: string): string {
  return s.trim().replace(/[\s,;.]+$/, '').trim();
}

/**
 * `findArrowRoute` — split the scope on newlines, then try the arrow
 * regex on each line. The first line with an arrow wins. Returns
 * `null` if no line has an arrow. Works for both single-line
 * (normalized) and multi-line (original) input.
 */
function findArrowRoute(scope: string): { origen: string; destino: string } | null {
  for (const line of scope.split('\n')) {
    const m = line.match(ROUTE_ARROW_RE);
    if (!m) continue;
    const parts = m[0].split(/[→]|->/).map((s) => s.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return { origen: trimRouteFragment(parts[0]), destino: trimRouteFragment(parts[1]) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// `InDriveStrategy` — the PlatformStrategy implementation.
// ---------------------------------------------------------------------------

/**
 * `InDriveStrategy` — Phase 4 paste parser for InDrive.
 *
 * `oneTapCapable: false` because the negotiated fare is a manual entry
 * even in the best case (the driver still confirms in M01). Phase 6 may
 * flip the flag if InDrive ships a webhook.
 */
export const InDriveStrategy: PlatformStrategy = {
  tipo: 'indrive_form',
  oneTapCapable: false,

  async suggest(input: StrategySuggestInput): Promise<StrategySuggestion> {
    if (!input.plataforma) {
      throw new Error(
        '[indrive.strategy] input.plataforma is required (CarreraService must inject it)',
      );
    }
    const plataforma: PlataformaRow = input.plataforma;

    // AD-13: normalize at the strategy boundary too (parity with the
    // other strategies; CarreraService already does this, but a direct
    // unit test of the strategy also passes raw text).
    const normalized = normalize(input.raw);

    // Empty / whitespace-only — return a confidence-0 stub.
    if (normalized === '') {
      return {
        draft: emptyDraft(plataforma.id),
        confidence: 0,
        editableFields: ALL_EDITABLE_FIELDS,
      };
    }

    // Cross-platform guard.
    if (!normalized.includes(INDRIVE_MARKER)) {
      const detected = detectOtherPlatform(normalized);
      if (detected) {
        throw new UnknownPlatformError('inDrive', detected);
      }
    }

    // ---------------------------------------------------------------------
    // Parse fare. Without a fare the strategy can't auto-fill and the
    // modal falls back to the manual form.
    // ---------------------------------------------------------------------
    const fareMatch = normalized.match(FARE_RE);
    const tarifaBruta = fareMatch ? parseFare(fareMatch[1]) : 0;

    // ---------------------------------------------------------------------
    // Parse route. CarreraService normalizes `input.raw` before calling
    // the strategy, so newlines are collapsed to spaces. The arrow form
    // is ambiguous when the fare sits on the same line — we look for
    // the arrow only in the substring AFTER the fare match.
    // ---------------------------------------------------------------------
    let origen: string | null = null;
    let destino: string | null = null;
    const labelMatch = input.raw.match(ROUTE_LABEL_RE);
    if (labelMatch) {
      origen = trimRouteFragment(labelMatch[1]);
      destino = trimRouteFragment(labelMatch[2]);
    } else {
      // For the arrow form, look at the substring AFTER the fare
      // match (or the whole text if no fare matched). Split on
      // newlines so the same code works whether `input.raw` is the
      // original multi-line paste (test invocation) or the
      // CarreraService-normalized single-line paste (integration).
      const arrowScope = fareMatch
        ? input.raw.slice((fareMatch.index ?? 0) + fareMatch[0].length)
        : input.raw;
      const arrowResult = findArrowRoute(arrowScope);
      if (arrowResult) {
        origen = arrowResult.origen;
        destino = arrowResult.destino;
      }
    }

    // ---------------------------------------------------------------------
    // Parse distance (optional — InDrive pastes frequently omit it).
    // ---------------------------------------------------------------------
    const distMatch = normalized.match(DISTANCE_RE);
    const distanciaKm = distMatch ? parseDistanceKm(distMatch[1]) : null;

    // ---------------------------------------------------------------------
    // Optional negotiation id (best-effort).
    // ---------------------------------------------------------------------
    const negMatch = normalized.match(NEGOTIATION_RE);
    const negotiationId = negMatch ? negMatch[1] : undefined;

    // ---------------------------------------------------------------------
    // Compute comision.
    // ---------------------------------------------------------------------
    const comision = tarifaBruta > 0 ? calcularComision(tarifaBruta, plataforma) : 0;

    // ---------------------------------------------------------------------
    // Confidence scoring (same model as DidiStrategy).
    //
    //   tarifaBruta === 0          → 0.0          (below threshold)
    //   tarifaBruta > 0            → 0.7          (fare only)
    //   tarifaBruta + route        → 0.85         (route present)
    //   tarifaBruta + route + dist → 0.95         (all fields present)
    // ---------------------------------------------------------------------
    let confidence: number;
    if (tarifaBruta <= 0) {
      confidence = 0;
    } else if (origen === null || destino === null) {
      confidence = 0.7;
    } else if (distanciaKm === null) {
      confidence = 0.85;
    } else {
      confidence = 0.95;
    }

    // ---------------------------------------------------------------------
    // Build draft.
    // ---------------------------------------------------------------------
    const metadata: Record<string, unknown> = { parser: PARSER_VERSION };
    if (negotiationId !== undefined) {
      metadata.negotiation_id = negotiationId;
    }

    const draft: CarreraPayload = {
      plataforma_id: plataforma.id,
      tarifa_bruta: tarifaBruta,
      comision,
      gasolina: 0,
      origen,
      destino,
      distancia_km: distanciaKm,
      duracion_min: null,
      estado: 'completada', // AD-7: InDrive pastes are post-ride
      fuente: 'manual',     // AD-7: every Phase 4 strategy is manual
      fecha: input.context.fecha ?? null,
      metadata,
    };

    return {
      draft,
      confidence,
      editableFields: computeEditableFields(draft, confidence),
    };
  },
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Detect a competing platform marker in the normalized text. */
function detectOtherPlatform(normalized: string): string | null {
  for (const { token, detected } of OTHER_MARKERS) {
    if (normalized.includes(token)) return detected;
  }
  return null;
}

/** Build an empty / confidence-0 draft. */
function emptyDraft(plataformaId: string): CarreraPayload {
  return {
    plataforma_id: plataformaId,
    tarifa_bruta: 0,
    comision: 0,
    gasolina: 0,
    origen: null,
    destino: null,
    distancia_km: null,
    duracion_min: null,
    estado: 'completada',
    fuente: 'manual',
    fecha: null,
    metadata: { parser: PARSER_VERSION },
  };
}

/**
 * `computeEditableFields` — at low confidence, every CarreraPayload key
 * is editable (manual form). At high confidence, only the fields the
 * parser actually populated are exposed (the modal would otherwise let
 * the driver "edit" a `null` field that has no sensible value).
 */
function computeEditableFields(
  draft: CarreraPayload,
  confidence: number,
): ReadonlyArray<keyof CarreraPayload> {
  if (confidence < HIGH_CONFIDENCE) {
    return ALL_EDITABLE_FIELDS;
  }
  const fields: Array<keyof CarreraPayload> = ['plataforma_id', 'tarifa_bruta'];
  if (draft.comision > 0) fields.push('comision');
  if (draft.origen !== null) fields.push('origen');
  if (draft.destino !== null) fields.push('destino');
  if (draft.distancia_km !== null) fields.push('distancia_km');
  if (draft.duracion_min !== null) fields.push('duracion_min');
  if (draft.gasolina > 0) fields.push('gasolina');
  return fields;
}

/** Editable fields when confidence is below threshold (full manual form). */
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
];
