/**
 * `indrive.strategy.test.ts` — unit tests for the `InDriveStrategy`
 * paste parser (PR #2 Task 2.3).
 *
 * `InDriveStrategy` parses a negotiated-fare confirmation. The canonical
 * example (from the spec scenario `platform-strategy-indrive-paste`):
 *
 *   "InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado"
 *
 * Yields `confidence >= 0.7`, `tarifa_bruta: 8000`, `comision: 1440`
 * (InDrive comision = 18%), `origen: 'Calle 50'`, `destino: 'Poblado'`,
 * `distancia_km: null` (InDrive pastes frequently omit distance),
 * `estado: 'completada'`, `fuente: 'manual'`.
 *
 * InDrive pastes are less structured than DiDi pastes: the fare is
 * "negotiated" rather than "tarifa" (look for `acordado` / `precio` /
 * `tarifa`), and the route may be missing (negotiated fares often
 * lack street addresses). `editableFields` reflects what the parser
 * actually populated — null fields are excluded.
 *
 * Mirrors the DidiStrategy test layout so the Phase 3 Pi reviewer can
 * audit the two files side by side.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { InDriveStrategy } from '../indrive.strategy';
import { UnknownPlatformError } from '../strategy.types';
import type { PlataformaRow } from '../../../data/sqlite/types';
import { CONFIDENCE_THRESHOLD } from '../confidence';

// ---------------------------------------------------------------------------
// Console silence spy — `suggest` is pure; no console output allowed.
// ---------------------------------------------------------------------------

let warnSpy: ReturnType<typeof spyOn>;
let errorSpy: ReturnType<typeof spyOn>;
let logSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = spyOn(console, 'error').mockImplementation(() => {});
  logSpy = spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
  logSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Test fixture — InDrive seed at `data/migrations/0003_seeds.sql:32-34`.
// ---------------------------------------------------------------------------

const INDRIVE_PLATAFORMA: PlataformaRow = {
  id: 'a0eebc7e-0001-4000-8000-000000000003',
  nombre: 'InDrive',
  comision: 18.0,
  tipo_estrategia: 'indrive_form',
  metadata: {},
  created_at: '2026-10-11 09:00:00',
};

// ---------------------------------------------------------------------------
// Identity — InDriveStrategy.tipo + oneTapCapable.
// ---------------------------------------------------------------------------

describe('InDriveStrategy — identity', () => {
  it("exposes tipo === 'indrive_form'", () => {
    expect(InDriveStrategy.tipo).toBe('indrive_form');
  });

  it('exposes oneTapCapable === false in Phase 4', () => {
    expect(InDriveStrategy.oneTapCapable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Happy path — canonical InDrive paste.
// ---------------------------------------------------------------------------

describe('InDriveStrategy.suggest — happy path', () => {
  it("parses the canonical paste: 'InDrive Precio acordado: 8.000 COP\\nCalle 50 → Poblado'", async () => {
    const result = await InDriveStrategy.suggest({
      raw: 'InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado',
      context: { fecha: '2026-10-11', horaLocal: '14:30' },
      plataforma: INDRIVE_PLATAFORMA,
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.draft.tarifa_bruta).toBe(8000);
    expect(result.draft.origen).toBe('Calle 50');
    expect(result.draft.destino).toBe('Poblado');
    expect(result.draft.distancia_km).toBeNull();
    expect(result.draft.comision).toBe(1440); // 8000 * 0.18
    expect(result.draft.estado).toBe('completada');
    expect(result.draft.fuente).toBe('manual');
  });

  it('overrides draft.plataforma_id with the input.plataforma.id (OI-1 + AD-15)', async () => {
    const result = await InDriveStrategy.suggest({
      raw: 'InDrive Precio acordado: 8.000\nCalle 50 → Poblado',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    expect(result.draft.plataforma_id).toBe(INDRIVE_PLATAFORMA.id);
  });

  it('parses label-form route: "Origen: A\nDestino: B"', async () => {
    const result = await InDriveStrategy.suggest({
      raw: 'InDrive Precio acordado: 8.000 COP\nOrigen: Calle 50\nDestino: Poblado',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    expect(result.draft.origen).toBe('Calle 50');
    expect(result.draft.destino).toBe('Poblado');
  });

  it('emits the indrive_strategy_v1 parser marker in metadata', async () => {
    const result = await InDriveStrategy.suggest({
      raw: 'InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    const md = result.draft.metadata as Record<string, unknown>;
    expect(md).toBeDefined();
    expect(md.parser).toBe('indrive_strategy_v1');
  });
});

// ---------------------------------------------------------------------------
// Below-threshold — paste missing the fare keyword.
// ---------------------------------------------------------------------------

describe('InDriveStrategy.suggest — below-threshold', () => {
  it('returns confidence < CONFIDENCE_THRESHOLD when no fare keyword (acordado / precio / tarifa) is present', async () => {
    const result = await InDriveStrategy.suggest({
      raw: 'InDrive Origen: A Destino: B', // no fare keyword
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    expect(result.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
  });

  it('exposes every required CarreraPayload key as editable when below threshold', async () => {
    const result = await InDriveStrategy.suggest({
      raw: 'InDrive Origen: A Destino: B',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    const required: Array<keyof import('../../carrera.repo').CarreraPayload> = [
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
    for (const key of required) {
      expect(result.editableFields).toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Empty paste — confidence 0, draft.tarifa_bruta === 0 (not NaN).
// ---------------------------------------------------------------------------

describe('InDriveStrategy.suggest — empty paste', () => {
  it('returns confidence === 0 and tarifa_bruta === 0 for empty raw', async () => {
    const result = await InDriveStrategy.suggest({
      raw: '',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    expect(result.confidence).toBe(0);
    expect(result.draft.tarifa_bruta).toBe(0);
    expect(Number.isNaN(result.draft.tarifa_bruta)).toBe(false);
  });

  it('returns confidence === 0 and tarifa_bruta === 0 for whitespace-only raw', async () => {
    const result = await InDriveStrategy.suggest({
      raw: '   \n\n   ',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    expect(result.confidence).toBe(0);
    expect(result.draft.tarifa_bruta).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-platform guard — raw contains Uber/DiDi markers but no InDrive.
// ---------------------------------------------------------------------------

describe('InDriveStrategy.suggest — cross-platform guard', () => {
  it("throws UnknownPlatformError when raw has 'Uber' but no 'indrive'", async () => {
    await expect(
      InDriveStrategy.suggest({
        raw: 'Uber Driver Trip $12.500',
        context: {},
        plataforma: INDRIVE_PLATAFORMA,
      }),
    ).rejects.toThrow(UnknownPlatformError);
  });

  it("throws UnknownPlatformError when raw has 'DiDi' but no 'indrive'", async () => {
    await expect(
      InDriveStrategy.suggest({
        raw: 'DiDi Tarifa: $12.500 COP',
        context: {},
        plataforma: INDRIVE_PLATAFORMA,
      }),
    ).rejects.toThrow(UnknownPlatformError);
  });

  it('does NOT throw when raw has both InDrive and DiDi markers (InDrive wins)', async () => {
    const result = await InDriveStrategy.suggest({
      raw: 'InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado\nNotas: similar a DiDi',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.draft.tarifa_bruta).toBe(8000);
  });

  it('UnknownPlatformError carries expected=inDrive and detected=uberApi (or similar)', async () => {
    try {
      await InDriveStrategy.suggest({
        raw: 'Uber Driver Trip $12.500',
        context: {},
        plataforma: INDRIVE_PLATAFORMA,
      });
      throw new Error('unreachable: InDriveStrategy should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownPlatformError);
      const upe = err as UnknownPlatformError;
      expect(upe.expected).toBe('inDrive');
      expect(upe.detected).toMatch(/uber|didi/);
    }
  });
});

// ---------------------------------------------------------------------------
// Per-platform invariants — every InDrive suggestion has estado + fuente fixed.
// ---------------------------------------------------------------------------

describe('InDriveStrategy — per-platform invariants', () => {
  it('always sets draft.estado === "completada" (AD-7)', async () => {
    const happy = await InDriveStrategy.suggest({
      raw: 'InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    expect(happy.draft.estado).toBe('completada');

    const low = await InDriveStrategy.suggest({
      raw: 'InDrive Origen: A Destino: B',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    expect(low.draft.estado).toBe('completada');
  });

  it('always sets draft.fuente === "manual" (AD-7)', async () => {
    const happy = await InDriveStrategy.suggest({
      raw: 'InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    expect(happy.draft.fuente).toBe('manual');

    const low = await InDriveStrategy.suggest({
      raw: 'InDrive Origen: A Destino: B',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    expect(low.draft.fuente).toBe('manual');
  });
});

// ---------------------------------------------------------------------------
// editableFields excludes null fields (InDrive-specific UX).
// ---------------------------------------------------------------------------

describe('InDriveStrategy.suggest — editableFields', () => {
  it('excludes null fields (origen/destino not parsed → not in editableFields)', async () => {
    const result = await InDriveStrategy.suggest({
      raw: 'InDrive Precio acordado: 8.000 COP', // no route
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    expect(result.draft.tarifa_bruta).toBe(8000);
    expect(result.draft.origen).toBeNull();
    expect(result.draft.destino).toBeNull();
    expect(result.editableFields).toContain('tarifa_bruta');
    expect(result.editableFields).not.toContain('origen');
    expect(result.editableFields).not.toContain('destino');
    expect(result.editableFields).not.toContain('distancia_km');
    expect(result.editableFields).not.toContain('duracion_min');
  });

  it('includes parsed fields (origen + destino + tarifa_bruta when route is parsed)', async () => {
    const result = await InDriveStrategy.suggest({
      raw: 'InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    expect(result.editableFields).toContain('tarifa_bruta');
    expect(result.editableFields).toContain('origen');
    expect(result.editableFields).toContain('destino');
  });
});

// ---------------------------------------------------------------------------
// Purity invariant — no console output, no I/O, deterministic on repeat.
// ---------------------------------------------------------------------------

describe('InDriveStrategy — purity', () => {
  it('emits no console.warn / console.error / console.log on any path', async () => {
    await InDriveStrategy.suggest({
      raw: 'InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    await InDriveStrategy.suggest({
      raw: 'InDrive Origen: A Destino: B',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    await InDriveStrategy.suggest({
      raw: '',
      context: {},
      plataforma: INDRIVE_PLATAFORMA,
    });
    try {
      await InDriveStrategy.suggest({
        raw: 'Uber Driver Trip $12.500',
        context: {},
        plataforma: INDRIVE_PLATAFORMA,
      });
    } catch {
      // expected
    }
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('is pure: same input → byte-equal output on two consecutive calls', async () => {
    const input = {
      raw: 'InDrive Precio acordado: 8.000 COP\nCalle 50 → Poblado',
      context: { fecha: '2026-10-11' },
      plataforma: INDRIVE_PLATAFORMA,
    };
    const a = await InDriveStrategy.suggest(input);
    const b = await InDriveStrategy.suggest(input);
    expect(a).toEqual(b);
    expect(a.confidence).toBe(b.confidence);
    expect(a.draft).toEqual(b.draft);
  });

  it('does not import expo-sqlite, db.service, or sync-queue.service', async () => {
    const source = await Bun.file(
      new URL('../indrive.strategy.ts', import.meta.url),
    ).text();
    expect(source).not.toMatch(/from\s+['"]expo-sqlite['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/db\.service['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/sync-queue\.service['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/ui\//);
  });
});
