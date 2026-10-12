/**
 * `didi.strategy.test.ts` — unit tests for the `DidiStrategy` paste parser
 * (PR #2 Task 2.2).
 *
 * `DidiStrategy` parses a DiDi notification / screenshot paste. The
 * canonical example (from the spec scenario `platform-strategy-didi-paste`):
 *
 *   "DiDi Tarifa: $12.500 COP\nOrigen: Calle 10\nDestino: Centro\nDistancia: 4,2 km"
 *
 * Yields `confidence >= 0.7`, `tarifa_bruta === 12500`, `comision === 2500`
 * (DiDi comision = 20%), `estado: 'completada'`, `fuente: 'manual'`.
 *
 * The strategy is a pure function of `(raw, context, plataforma)`. No I/O,
 * no `console.warn` on any path. Cross-platform text (Uber/InDrive markers
 * without DiDi) throws `UnknownPlatformError`.
 *
 * Mirrors the UberStrategy test layout so the Phase 3 Pi reviewer can
 * audit the two files side by side.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { DidiStrategy } from '../didi.strategy';
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
// Test fixture — DiDi seed at `data/migrations/0003_seeds.sql:28-30`.
// ---------------------------------------------------------------------------

const DIDI_PLATAFORMA: PlataformaRow = {
  id: 'a0eebc7e-0001-4000-8000-000000000002',
  nombre: 'DiDi',
  comision: 20.0,
  tipo_estrategia: 'didi_manual',
  metadata: {},
  created_at: '2026-10-11 09:00:00',
};

// ---------------------------------------------------------------------------
// Identity — DidiStrategy.tipo + oneTapCapable.
// ---------------------------------------------------------------------------

describe('DidiStrategy — identity', () => {
  it("exposes tipo === 'didi_manual'", () => {
    expect(DidiStrategy.tipo).toBe('didi_manual');
  });

  it('exposes oneTapCapable === false in Phase 4', () => {
    expect(DidiStrategy.oneTapCapable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Happy path — canonical DiDi paste.
// ---------------------------------------------------------------------------

describe('DidiStrategy.suggest — happy path', () => {
  it("parses the canonical paste: 'DiDi Tarifa: $12.500 COP\\nOrigen: Calle 10\\nDestino: Centro\\nDistancia: 4,2 km'", async () => {
    const result = await DidiStrategy.suggest({
      raw: 'DiDi Tarifa: $12.500 COP\nOrigen: Calle 10\nDestino: Centro\nDistancia: 4,2 km',
      context: { fecha: '2026-10-11', horaLocal: '14:30' },
      plataforma: DIDI_PLATAFORMA,
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.draft.tarifa_bruta).toBe(12500);
    expect(result.draft.origen).toBe('Calle 10');
    expect(result.draft.destino).toBe('Centro');
    expect(result.draft.distancia_km).toBe(4.2);
    expect(result.draft.comision).toBe(2500); // 12500 * 0.20
    expect(result.draft.estado).toBe('completada');
    expect(result.draft.fuente).toBe('manual');
  });

  it('overrides draft.plataforma_id with the input.plataforma.id (OI-1 + AD-15)', async () => {
    // The CarreraService is the single resolver for plataforma_id, but the
    // strategy also reflects it in the draft so unit tests of the strategy
    // alone see the correct FK.
    const result = await DidiStrategy.suggest({
      raw: 'DiDi Tarifa: $12.500\nOrigen: A\nDestino: B',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    expect(result.draft.plataforma_id).toBe(DIDI_PLATAFORMA.id);
  });

  it('parses currency variants: $12.500, $12,500, COP 12500', async () => {
    const variants = [
      { raw: 'DiDi Tarifa: $12,500\nOrigen: A\nDestino: B', expected: 12500 },
      { raw: 'DiDi Tarifa: COP 12.500\nOrigen: A\nDestino: B', expected: 12500 },
      { raw: 'DiDi Tarifa: 12500 COP\nOrigen: A\nDestino: B', expected: 12500 },
    ];
    for (const v of variants) {
      const result = await DidiStrategy.suggest({
        raw: v.raw,
        context: {},
        plataforma: DIDI_PLATAFORMA,
      });
      expect(result.draft.tarifa_bruta).toBe(v.expected);
    }
  });

  it('parses arrow route syntax: "Calle 10 → Centro"', async () => {
    const result = await DidiStrategy.suggest({
      raw: 'DiDi Tarifa: $12.500 COP\nCalle 10 → Centro',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    expect(result.draft.origen).toBe('Calle 10');
    expect(result.draft.destino).toBe('Centro');
  });

  it('emits the didi_strategy_v1 parser marker in metadata', async () => {
    const result = await DidiStrategy.suggest({
      raw: 'DiDi Tarifa: $12.500 COP\nOrigen: A\nDestino: B',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    const md = result.draft.metadata as Record<string, unknown>;
    expect(md).toBeDefined();
    expect(md.parser).toBe('didi_strategy_v1');
  });
});

// ---------------------------------------------------------------------------
// Below-threshold — paste missing required fields.
// ---------------------------------------------------------------------------

describe('DidiStrategy.suggest — below-threshold', () => {
  it('returns confidence < CONFIDENCE_THRESHOLD when no fare is detected', async () => {
    const result = await DidiStrategy.suggest({
      raw: 'DiDi Origen: A Destino: B', // no $ / Tarifa / currency
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    expect(result.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
  });

  it('exposes every required CarreraPayload key as editable when below threshold', async () => {
    const result = await DidiStrategy.suggest({
      raw: 'DiDi Origen: A Destino: B',
      context: {},
      plataforma: DIDI_PLATAFORMA,
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

describe('DidiStrategy.suggest — empty paste', () => {
  it('returns confidence === 0 and tarifa_bruta === 0 for empty raw', async () => {
    const result = await DidiStrategy.suggest({
      raw: '',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    expect(result.confidence).toBe(0);
    expect(result.draft.tarifa_bruta).toBe(0);
    expect(Number.isNaN(result.draft.tarifa_bruta)).toBe(false);
  });

  it('returns confidence === 0 and tarifa_bruta === 0 for whitespace-only raw', async () => {
    const result = await DidiStrategy.suggest({
      raw: '   \n\n   ',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    expect(result.confidence).toBe(0);
    expect(result.draft.tarifa_bruta).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-platform guard — raw contains Uber/InDrive markers but no DiDi.
// ---------------------------------------------------------------------------

describe('DidiStrategy.suggest — cross-platform guard', () => {
  it("throws UnknownPlatformError when raw has 'Uber' but no 'didi'", async () => {
    await expect(
      DidiStrategy.suggest({
        raw: 'Uber Driver Trip $12.500',
        context: {},
        plataforma: DIDI_PLATAFORMA,
      }),
    ).rejects.toThrow(UnknownPlatformError);
  });

  it("throws UnknownPlatformError when raw has 'InDrive' but no 'didi'", async () => {
    await expect(
      DidiStrategy.suggest({
        raw: 'InDrive Precio acordado: 8.000 COP',
        context: {},
        plataforma: DIDI_PLATAFORMA,
      }),
    ).rejects.toThrow(UnknownPlatformError);
  });

  it('does NOT throw when raw has both DiDi and Uber markers (DiDi wins)', async () => {
    // Notification stack can contain cross-references. The DiDi marker
    // is the platform fingerprint; the parser treats it as the
    // authoritative signal.
    const result = await DidiStrategy.suggest({
      raw: 'DiDi Tarifa: $12.500 COP\nOrigen: A\nDestino: B\nNotas: similar a Uber',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.draft.tarifa_bruta).toBe(12500);
  });

  it('UnknownPlatformError carries expected=diDi and detected=uberApi (or similar)', async () => {
    try {
      await DidiStrategy.suggest({
        raw: 'Uber Driver Trip $12.500',
        context: {},
        plataforma: DIDI_PLATAFORMA,
      });
      throw new Error('unreachable: DidiStrategy should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownPlatformError);
      const upe = err as UnknownPlatformError;
      expect(upe.expected).toBe('didi');
      expect(upe.detected).toMatch(/uber|indrive/);
      expect(upe.message).toContain('didi');
    }
  });
});

// ---------------------------------------------------------------------------
// Per-platform invariants — every DiDi suggestion has estado + fuente fixed.
// ---------------------------------------------------------------------------

describe('DidiStrategy — per-platform invariants', () => {
  it('always sets draft.estado === "completada" (AD-7)', async () => {
    const happy = await DidiStrategy.suggest({
      raw: 'DiDi Tarifa: $12.500 COP\nOrigen: A\nDestino: B',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    expect(happy.draft.estado).toBe('completada');

    const low = await DidiStrategy.suggest({
      raw: 'DiDi Origen: A Destino: B',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    expect(low.draft.estado).toBe('completada');
  });

  it('always sets draft.fuente === "manual" (AD-7)', async () => {
    const happy = await DidiStrategy.suggest({
      raw: 'DiDi Tarifa: $12.500 COP\nOrigen: A\nDestino: B',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    expect(happy.draft.fuente).toBe('manual');

    const low = await DidiStrategy.suggest({
      raw: 'DiDi Origen: A Destino: B',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    expect(low.draft.fuente).toBe('manual');
  });
});

// ---------------------------------------------------------------------------
// Purity invariant — no console output, no I/O, deterministic on repeat.
// ---------------------------------------------------------------------------

describe('DidiStrategy — purity', () => {
  it('emits no console.warn / console.error / console.log on any path', async () => {
    await DidiStrategy.suggest({
      raw: 'DiDi Tarifa: $12.500 COP\nOrigen: A\nDestino: B',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    await DidiStrategy.suggest({
      raw: 'DiDi Origen: A Destino: B',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    await DidiStrategy.suggest({
      raw: '',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    // Cross-platform throw path does not log either.
    try {
      await DidiStrategy.suggest({
        raw: 'Uber Driver Trip $12.500',
        context: {},
        plataforma: DIDI_PLATAFORMA,
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
      raw: 'DiDi Tarifa: $12.500 COP\nOrigen: Calle 10\nDestino: Centro',
      context: { fecha: '2026-10-11' },
      plataforma: DIDI_PLATAFORMA,
    };
    const a = await DidiStrategy.suggest(input);
    const b = await DidiStrategy.suggest(input);
    expect(a).toEqual(b);
    expect(a.confidence).toBe(b.confidence);
    expect(a.draft).toEqual(b.draft);
  });

  it('normalizes raw via parse.normalize before parsing', async () => {
    // Whitespace + case differences collapse to one canonical form.
    const a = await DidiStrategy.suggest({
      raw: '  DIDI Tarifa:  $12.500  COP  \n  Origen: A  \n  Destino: B  ',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    const b = await DidiStrategy.suggest({
      raw: 'DiDi Tarifa: $12.500 COP\nOrigen: A\nDestino: B',
      context: {},
      plataforma: DIDI_PLATAFORMA,
    });
    expect(a.draft.tarifa_bruta).toBe(b.draft.tarifa_bruta);
    expect(a.draft.origen).toBe(b.draft.origen);
    expect(a.draft.destino).toBe(b.draft.destino);
    expect(a.confidence).toBe(b.confidence);
  });

  it('does not import expo-sqlite, db.service, or sync-queue.service', async () => {
    const source = await Bun.file(
      new URL('../didi.strategy.ts', import.meta.url),
    ).text();
    expect(source).not.toMatch(/from\s+['"]expo-sqlite['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/db\.service['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/sync-queue\.service['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/ui\//);
  });
});
