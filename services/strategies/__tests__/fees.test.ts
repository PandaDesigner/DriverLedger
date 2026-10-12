/**
 * `fees.test.ts` — unit tests for the shared `calcularComision` +
 * `calcularGasolina` helpers (AD-9).
 *
 * Both helpers are pure functions. They live in `services/strategies/fees.ts`
 * so every strategy can call them with the resolved `PlataformaRow` (OI-1)
 * without re-implementing the math.
 *
 * `calcularComision` is the canonical formula: `tarifaBruta * comision / 100`
 * where `comision` is a percent (e.g. 25.0 = 25%).
 *
 * `calcularGasolina` is a Phase 4 placeholder: `distanciaKm * CONSUMO_DEFAULT`
 * where `CONSUMO_DEFAULT = 0.08 L/km` is a single global constant. Phase 6
 * may add per-platform consumption tables via the `plataforma` argument
 * without changing the signature.
 *
 * The unit-test target is the helper; the CarreraService commit step (PR #2
 * Task 2.4) is the consumer and is tested in `carrera.service.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import {
  CONSUMO_DEFAULT,
  calcularComision,
  calcularGasolina,
} from '../fees';
import type { PlataformaRow } from '../../../data/sqlite/types';

// ---------------------------------------------------------------------------
// Console silence spy — helpers are pure; no `console.warn`/`error` allowed.
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
// Test fixture — match the seeds at `data/migrations/0003_seeds.sql:24-34`.
// ---------------------------------------------------------------------------

function plataforma(
  id: string,
  nombre: string,
  comision: number,
  tipo_estrategia: string,
): PlataformaRow {
  return {
    id,
    nombre,
    comision,
    tipo_estrategia,
    metadata: {},
    created_at: '2026-10-11 09:00:00',
  };
}

const UBER = plataforma(
  'a0eebc7e-0001-4000-8000-000000000001',
  'Uber',
  25.0,
  'uber_api',
);
const DIDI = plataforma(
  'a0eebc7e-0001-4000-8000-000000000002',
  'DiDi',
  20.0,
  'didi_manual',
);
const INDRIVE = plataforma(
  'a0eebc7e-0001-4000-8000-000000000003',
  'InDrive',
  18.0,
  'indrive_form',
);

// ---------------------------------------------------------------------------
// `calcularComision`
// ---------------------------------------------------------------------------

describe('calcularComision', () => {
  it('returns 0 when tarifaBruta is 0', () => {
    expect(calcularComision(0, UBER)).toBe(0);
    expect(calcularComision(0, DIDI)).toBe(0);
    expect(calcularComision(0, INDRIVE)).toBe(0);
  });

  it('applies the 25% Uber commission: 10000 * 0.25 = 2500', () => {
    expect(calcularComision(10000, UBER)).toBe(2500);
  });

  it('applies the 20% DiDi commission: 10000 * 0.20 = 2000', () => {
    expect(calcularComision(10000, DIDI)).toBe(2000);
  });

  it('applies the 18% InDrive commission: 10000 * 0.18 = 1800', () => {
    expect(calcularComision(10000, INDRIVE)).toBe(1800);
  });

  it('handles arbitrary commission percentages: 15% on 10000 = 1500', () => {
    const custom = plataforma('p-x', 'Custom', 15.0, 'custom_form');
    expect(calcularComision(10000, custom)).toBe(1500);
  });

  it('handles fractional fares: 12500 * 0.20 = 2500 (DiDi canonical example)', () => {
    expect(calcularComision(12500, DIDI)).toBe(2500);
  });

  it('handles fractional fares: 8000 * 0.18 = 1440 (InDrive canonical example)', () => {
    expect(calcularComision(8000, INDRIVE)).toBe(1440);
  });

  it('is pure: same inputs yield same output on repeated calls', () => {
    expect(calcularComision(12500, DIDI)).toBe(calcularComision(12500, DIDI));
    expect(calcularComision(8000, INDRIVE)).toBe(calcularComision(8000, INDRIVE));
  });

  it('emits no console.warn / console.error / console.log on any path', () => {
    calcularComision(0, UBER);
    calcularComision(10000, DIDI);
    calcularComision(8000, INDRIVE);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// `calcularGasolina`
// ---------------------------------------------------------------------------

describe('calcularGasolina', () => {
  it('returns 0 when distanciaKm is 0', () => {
    expect(calcularGasolina(0, UBER)).toBe(0);
    expect(calcularGasolina(0, DIDI)).toBe(0);
    expect(calcularGasolina(0, INDRIVE)).toBe(0);
  });

  it('multiplies distanciaKm by CONSUMO_DEFAULT (0.08 L/km): 10 * 0.08 = 0.8', () => {
    // The launch prompt's acceptance: "distanciaKm=10, comision=20 → 0.8 L".
    // The comision does not affect gasolina; the formula is per-km.
    expect(calcularGasolina(10, DIDI)).toBe(0.8);
  });

  it('is identical across platforms in Phase 4 (CONSUMO_DEFAULT is global)', () => {
    expect(calcularGasolina(4.2, UBER)).toBe(calcularGasolina(4.2, DIDI));
    expect(calcularGasolina(4.2, DIDI)).toBe(calcularGasolina(4.2, INDRIVE));
    expect(calcularGasolina(4.2, UBER)).toBeCloseTo(0.336, 6);
  });

  it('exposes CONSUMO_DEFAULT as a numeric constant (0.08 L/km)', () => {
    expect(CONSUMO_DEFAULT).toBe(0.08);
  });

  it('is pure: same inputs yield same output on repeated calls', () => {
    expect(calcularGasolina(4.2, UBER)).toBe(calcularGasolina(4.2, UBER));
  });

  it('emits no console.warn / console.error / console.log on any path', () => {
    calcularGasolina(0, UBER);
    calcularGasolina(10, DIDI);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cross-domain rule (AD-10) — fees.ts is pure infrastructure.
// ---------------------------------------------------------------------------

describe('fees.ts — cross-domain isolation', () => {
  it('does not import expo-sqlite, db.service, sync-queue.service, or ui/*', async () => {
    const source = await Bun.file(
      new URL('../fees.ts', import.meta.url),
    ).text();
    expect(source).not.toMatch(/from\s+['"]expo-sqlite['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/db\.service['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/sync-queue\.service['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/ui\//);
  });
});
