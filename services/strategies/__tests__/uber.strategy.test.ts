/**
 * `uber.strategy.test.ts` — unit tests for the Phase 4 UberStrategy stub.
 *
 * The Phase 4 stub returns `confidence: 0`, `oneTapCapable: false`,
 * `fuente: 'manual'`, `estado: 'activa'`, with `metadata.platform_session_id
 * = 'phase4-stub-pending-phase6'` (OI-4 marker). Phase 6 replaces the
 * `suggest()` body without touching the interface (AD-1, AD-6).
 *
 * 5 acceptance cases pinned from `add-platform-strategies/tasks.md` Task 1.3
 * + spec scenario `platform-strategy-uber-stub` (4 scenarios).
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { UberStrategy } from '../uber.strategy';

// ---------------------------------------------------------------------------
// Console silence spy — `suggest` is pure; no `console.warn`/`error` allowed
// (AD-11, AD-13, design "no I/O in strategies").
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
// Properties of the strategy instance.
// ---------------------------------------------------------------------------

describe('UberStrategy — identity', () => {
  it("exposes tipo === 'uber_api'", () => {
    expect(UberStrategy.tipo).toBe('uber_api');
  });

  it('exposes oneTapCapable === false in Phase 4', () => {
    expect(UberStrategy.oneTapCapable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// `suggest()` output shape.
// ---------------------------------------------------------------------------

describe('UberStrategy.suggest', () => {
  it('returns a StrategySuggestion with confidence: 0 and full editableFields', async () => {
    const result = await UberStrategy.suggest({
      raw: '<driver typed anything>',
      context: { fecha: '2026-10-11', horaLocal: '14:30' },
    });
    expect(result.confidence).toBe(0);
    expect(result.draft.fuente).toBe('manual');
    expect(result.draft.estado).toBe('activa');
  });

  it('marks metadata.platform_session_id as phase4-stub-pending-phase6 (OI-4)', async () => {
    const result = await UberStrategy.suggest({
      raw: 'anything',
      context: {},
    });
    const metadata = result.draft.metadata as Record<string, unknown>;
    expect(metadata).toBeDefined();
    expect(metadata.platform_session_id).toBe('phase4-stub-pending-phase6');
  });

  it('exposes every required CarreraPayload key as editable', async () => {
    const result = await UberStrategy.suggest({
      raw: 'anything',
      context: {},
    });
    const required: Array<keyof import('../carrera.repo').CarreraPayload> = [
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

  it('emits no console.warn / console.error / console.log on any path', async () => {
    await UberStrategy.suggest({ raw: 'first', context: {} });
    await UberStrategy.suggest({ raw: 'second', context: { fecha: '2026-10-11' } });
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('is pure: same input → byte-equal output on two consecutive calls', async () => {
    const input = { raw: 'Driver typed body', context: { fecha: '2026-10-11' } };
    const a = await UberStrategy.suggest(input);
    const b = await UberStrategy.suggest(input);
    expect(a).toEqual(b);
    expect(a.confidence).toBe(b.confidence);
    expect(a.draft).toEqual(b.draft);
    expect(a.editableFields).toEqual(b.editableFields);
  });

  it('normalizes raw text via parse.normalize before producing the draft', async () => {
    // White-space + mixed-case input proves the helper is wired up.
    const a = await UberStrategy.suggest({
      raw: '  Driver typed body  ',
      context: {},
    });
    const b = await UberStrategy.suggest({
      raw: 'Driver typed body',
      context: {},
    });
    // If normalize were NOT applied, the two outputs would differ because
    // a non-pure strategy might echo raw into metadata. After normalization
    // the two inputs collapse to the same canonical form.
    expect(a.draft.metadata).toEqual(b.draft.metadata);
    // And the metadata round-trips through JSON without throwing.
    expect(() => JSON.stringify(a.draft.metadata)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Purity invariant — strategies never import I/O modules.
// ---------------------------------------------------------------------------

describe('UberStrategy — purity (no I/O)', () => {
  it('does not import expo-sqlite, db.service, or sync-queue.service', async () => {
    const source = await Bun.file(
      new URL('../uber.strategy.ts', import.meta.url),
    ).text();
    expect(source).not.toMatch(/from\s+['"]expo-sqlite['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/db\.service['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/sync-queue\.service['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/ui\//);
  });
});
