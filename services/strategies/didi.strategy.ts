/**
 * `didi.strategy.ts` — DiDi platform strategy (PR #2 Task 2.2).
 *
 * DiDi drivers in Medellín receive a post-ride notification with the
 * fare, origin, destination, and distance. The driver pastes the text
 * into the app; this strategy parses it into a `StrategySuggestion`
 * with `confidence` reflecting how complete the parse was.
 *
 * Canonical paste (per the spec scenario `platform-strategy-didi-paste`):
 *
 *   "DiDi Tarifa: $12.500 COP\nOrigen: Calle 10\nDestino: Centro\nDistancia: 4,2 km"
 *
 * → `tarifa_bruta: 12500`, `comision: 2500` (20%), `origen: 'Calle 10'`,
 *   `destino: 'Centro'`, `distancia_km: 4.2`, `estado: 'completada'`,
 *   `fuente: 'manual'`, `confidence: 0.85`.
 *
 * Cross-platform guard: if the raw text contains a clear marker for a
 * DIFFERENT platform (Uber / InDrive) but NOT a DiDi marker, the strategy
 * throws `UnknownPlatformError` so `CarreraService` / the UI can route
 * the driver back to M01 ("looks like Uber — switch the platform?").
 *
 * Pure function — no I/O, no `Date.now()`, no `Math.random()`, no
 * `console.warn`. The `input.raw` is normalized via `parse.normalize`
 * before parsing (AD-13); the `input.plataforma` carries the resolved
 * `PlataformaRow` (OI-1) so we can call `calcularComision`.
 *
 * Source: `docs/RFC-003-logica-registro.md §Strategy`,
 * `openspec/changes/add-platform-strategies/specs/platform-strategies/spec.md`
 * requirement `platform-strategy-didi-paste`, design AD-1 + AD-7 + AD-11 + AD-12.
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
const DIDI_MARKER = 'didi';

/** Other platforms' brand markers (used by the cross-platform guard). */
const OTHER_MARKERS: ReadonlyArray<{ token: string; detected: string }> = [
  { token: 'uber', detected: 'uberApi' },
  { token: 'indrive', detected: 'indriveForm' },
];

/** Parser version — forward-compat for Phase 6 if DiDi ever ships its own API. */
const PARSER_VERSION = 'didi_strategy_v1';

/** Threshold at or above which the modal renders the auto-filled preview. */
const HIGH_CONFIDENCE = CONFIDENCE_THRESHOLD; // 0.3

// ---------------------------------------------------------------------------
// Regexes — happy-path parsers.
// ---------------------------------------------------------------------------

/**
 * Fare regex — matches: `Tarifa: $12.500 COP`, `$12,500`, `COP 12.500`, `12500 COP`.
 * The capture group strips currency markers and separators; the helper
 * `parseFare` converts to a numeric. `$` is optional so `COP 12.500` and
 * `Tarifa: 12500 COP` both work.
 */
const FARE_RE = /(?:tarifa\s*[:\-]?\s*)?(?:\$\s*)?([\d.,]+)\s*(?:cop)?/i;

/**
 * Route regex (label form) — matches: `Origen: A\nDestino: B` (case-insensitive
 * via the `i` flag). The case-insensitivity lets the parser match the
 * normalized lowercase text while still capturing the original-case text
 * from the original `input.raw` (the regex applies to either; we run it
 * on the original raw to preserve display case).
 */
const ROUTE_LABEL_RE = /origen\s*[:\-]\s*(.+?)\s*destino\s*[:\-]\s*(.+?)(?:\s*distancia|$)/i;

/**
 * Per-line arrow regex — matches an arrow (`→` or `->`) with non-empty
 * text on both sides. Applied to a single line (no `\n` in scope).
 * Used by `findArrowRoute` below.
 */
const ROUTE_ARROW_RE = /(\S(?:[^→]*\S)?)\s*[→]\s*(\S(?:[^→]*\S)?)/;

/** Distance regex — matches: `Distancia: 4,2 km`, `Distancia 4.2 km`. */
const DISTANCE_RE = /distancia\s*[:\-]?\s*([\d.,]+)\s*km/i;

/** Optional notification id — best-effort. `Notificación #ABC123` etc. */
const NOTIFICATION_RE = /(?:notificaci[oó]n|notification)\s*#?\s*([a-z0-9\-]+)/i;

// ---------------------------------------------------------------------------
// Pure helpers — string → value.
// ---------------------------------------------------------------------------

/** Convert "12.500" or "12,500" → 12500. Strips dots/commas, no rounding. */
function parseFare(raw: string): number {
  const cleaned = raw.replace(/[.,]/g, '');
  if (cleaned === '' || !/^\d+$/.test(cleaned)) return 0;
  return Number.parseInt(cleaned, 10);
}

/** Convert "4,2" or "4.2" → 4.2. Replaces comma with dot then parses. */
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
// `DidiStrategy` — the PlatformStrategy implementation.
// ---------------------------------------------------------------------------

/**
 * `DidiStrategy` — Phase 4 paste parser for DiDi.
 *
 * `oneTapCapable: false` because the post-ride notification is not
 * "one tap" — the driver still confirms in M01. Phase 6 may flip the
 * flag if DiDi ships a server callback.
 */
export const DidiStrategy: PlatformStrategy = {
  tipo: 'didi_manual',
  oneTapCapable: false,

  async suggest(input: StrategySuggestInput): Promise<StrategySuggestion> {
    // OI-1 invariant — strategies never resolve plataforma themselves;
    // if CarreraService forgot to inject it, the type system won't catch
    // it because `plataforma?` is optional, but the platform_id fallback
    // is empty and the comision helper would NaN. We make the contract
    // explicit here for the integration test.
    if (!input.plataforma) {
      throw new Error(
        '[didi.strategy] input.plataforma is required (CarreraService must inject it)',
      );
    }
    const plataforma: PlataformaRow = input.plataforma;

    // AD-13: normalize at the service boundary, but the strategy can
    // re-run the helper on the raw defensively (parity with Uber).
    const normalized = normalize(input.raw);

    // Empty / whitespace-only — return a confidence-0 stub.
    if (normalized === '') {
      return {
        draft: emptyDraft(plataforma.id),
        confidence: 0,
        editableFields: ALL_EDITABLE_FIELDS,
      };
    }

    // Cross-platform guard — the DiDi marker MUST be present. If a
    // competing platform marker is present and DiDi is NOT, throw.
    if (!normalized.includes(DIDI_MARKER)) {
      const detected = detectOtherPlatform(normalized);
      if (detected) {
        throw new UnknownPlatformError('didi', detected);
      }
      // No platform marker at all — fall through to below-threshold.
    }

    // ---------------------------------------------------------------------
    // Parse fare (required for HIGH_CONFIDENCE).
    // ---------------------------------------------------------------------
    const fareMatch = normalized.match(FARE_RE);
    const tarifaBruta = fareMatch ? parseFare(fareMatch[1]) : 0;

    // ---------------------------------------------------------------------
    // Parse route (origin + destination).
    //
    // CarreraService normalizes `input.raw` before calling the strategy,
    // so by the time we get here, newlines are collapsed to spaces and
    // the text is lowercased. The label form is unambiguous (`Origen: X
    // Destino: Y`) and matches regardless of case. The arrow form
    // (`A → B`) is ambiguous when the fare sits on the same line —
    // we must look for the arrow ONLY after the fare so the origen
    // capture doesn't include the fare line.
    // ---------------------------------------------------------------------
    let origen: string | null = null;
    let destino: string | null = null;
    const labelMatch = input.raw.match(ROUTE_LABEL_RE);
    if (labelMatch) {
      origen = trimRouteFragment(labelMatch[1]);
      destino = trimRouteFragment(labelMatch[2]);
    } else {
      // For the arrow form, look at the substring AFTER the fare
      // match (or the whole text if no fare matched). This way the
      // fare text is never included in the origen capture. We split
      // the scope on newlines and try each line so the same code
      // works whether `input.raw` is the original multi-line paste
      // (test invocation) or the CarreraService-normalized single-
      // line paste (integration invocation).
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
    // Parse distance (optional — DiDi pastes frequently omit it).
    // ---------------------------------------------------------------------
    const distMatch = normalized.match(DISTANCE_RE);
    const distanciaKm = distMatch ? parseDistanceKm(distMatch[1]) : null;

    // ---------------------------------------------------------------------
    // Optional notification id (best-effort).
    // ---------------------------------------------------------------------
    const notifMatch = normalized.match(NOTIFICATION_RE);
    const notificationId = notifMatch ? notifMatch[1] : undefined;

    // ---------------------------------------------------------------------
    // Compute comision (always, even at low confidence — it's a function
    // of tarifa + plataforma.comision, both of which may be defaulted).
    // ---------------------------------------------------------------------
    const comision = tarifaBruta > 0 ? calcularComision(tarifaBruta, plataforma) : 0;

    // ---------------------------------------------------------------------
    // Confidence scoring.
    //
    // Fare is the dominant signal: without a fare, the strategy can't
    // auto-fill enough to beat the threshold and the modal must fall back
    // to the manual form. With a fare, the model layers the optional
    // fields (route, distance) on top.
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
    if (notificationId !== undefined) {
      metadata.notification_id = notificationId;
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
      estado: 'completada', // AD-7: DiDi pastes are post-ride
      fuente: 'manual',     // AD-7: every Phase 4 strategy is manual
      fecha: input.context.fecha ?? null,
      metadata,
    };

    return {
      draft,
      confidence,
      editableFields:
        confidence >= HIGH_CONFIDENCE ? HIGH_CONFIDENCE_EDITABLE : ALL_EDITABLE_FIELDS,
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

/** Build an empty / confidence-0 draft (empty paste path). */
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

/** Editable fields when confidence is high (auto-fill preview, small edit set). */
const HIGH_CONFIDENCE_EDITABLE: ReadonlyArray<keyof CarreraPayload> = [
  'plataforma_id',
  'tarifa_bruta',
  'origen',
  'destino',
  'distancia_km',
];

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
