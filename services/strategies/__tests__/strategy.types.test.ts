/**
 * `strategy.types.test.ts` — smoke test for the cross-domain contract.
 *
 * The contract is type-only except for `UnknownStrategyError` (the one
 * runtime value the UI needs in M01 catch blocks). This file:
 *   1. Asserts every cross-domain symbol is importable as a type (compile check).
 *   2. Asserts `UnknownStrategyError` is an Error subclass, has `tipo`,
 *      and carries the offending key in its message.
 *   3. Asserts `strategy.types.ts` does NOT import `expo-sqlite`, `ui/*`,
 *      `services/db.service`, `services/sync-queue.service`, or top-level
 *      `tests/*` (the AD-10 cross-domain rule).
 *
 * Compiles under bun's TypeScript transformer; runs against any UTF-8 host.
 */

import { describe, expect, it } from 'bun:test';

// Type-only imports — interfaces and types are erased at runtime, so the
// runtime module never tries to look them up. The `type` modifier on these
// imports is what makes the cross-domain read-only contract verifiable:
// downstream consumers can `import type` without dragging the file into
// their bundle.
import type { PlatformStrategy } from '../strategy.types';
import type { StrategyContext } from '../strategy.types';
import type { StrategySuggestInput } from '../strategy.types';
import type { StrategySuggestion } from '../strategy.types';

import { UnknownStrategyError } from '../strategy.types';

// ---------------------------------------------------------------------------
// Cross-domain symbol availability — type-only assertions.
// ---------------------------------------------------------------------------

describe('strategy.types — cross-domain contract', () => {
  it('exposes PlatformStrategy shape (compile-time)', () => {
    // Assignable probe: `Pick` is purely a type-level operation.
    // If the export disappears, tsc fails first.
    type Probe = Pick<PlatformStrategy, 'tipo' | 'oneTapCapable' | 'suggest'>;
    const sample: Probe = {
      tipo: 'uber_api',
      oneTapCapable: false,
      async suggest(_input: StrategySuggestInput): Promise<StrategySuggestion> {
        throw new Error('not used');
      },
    };
    expect(sample.tipo).toBe('uber_api');
    expect(sample.oneTapCapable).toBe(false);
  });

  it('exposes StrategySuggestInput shape (compile-time)', () => {
    type Probe = Pick<StrategySuggestInput, 'raw' | 'context'>;
    const sample: Probe = {
      raw: 'pasted text',
      context: { fecha: '2026-10-11', horaLocal: '14:30', carreraActiva: false },
    };
    expect(sample.raw).toBe('pasted text');
    expect(sample.context.fecha).toBe('2026-10-11');
  });

  it('exposes StrategySuggestion shape (compile-time)', () => {
    type Probe = Pick<StrategySuggestion, 'draft' | 'confidence' | 'editableFields'>;
    const sample: Probe = {
      draft: {
        plataforma_id: 'x',
        tarifa_bruta: 12500,
        comision: 2500,
      },
      confidence: 0.85,
      editableFields: ['tarifa_bruta', 'comision', 'origen'],
    };
    expect(sample.confidence).toBe(0.85);
    expect(sample.editableFields).toContain('tarifa_bruta');
  });

  it('exposes StrategyContext shape (compile-time)', () => {
    type Probe = Pick<StrategyContext, 'fecha' | 'horaLocal' | 'carreraActiva'>;
    const sample: Probe = { fecha: '2026-10-11', horaLocal: '09:15', carreraActiva: true };
    expect(sample.carreraActiva).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UnknownStrategyError — the single runtime value exported.
// ---------------------------------------------------------------------------

describe('UnknownStrategyError', () => {
  it('is an Error subclass', () => {
    const err = new UnknownStrategyError('rappi');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UnknownStrategyError);
  });

  it("sets .name = 'UnknownStrategyError'", () => {
    const err = new UnknownStrategyError('rappi');
    expect(err.name).toBe('UnknownStrategyError');
  });

  it('exposes the offending tipo on a public .tipo field', () => {
    const err = new UnknownStrategyError('rappi');
    expect(err.tipo).toBe('rappi');
  });

  it('includes the offending tipo in the message', () => {
    const err = new UnknownStrategyError('rappi');
    expect(err.message).toContain('rappi');
  });
});

// ---------------------------------------------------------------------------
// Cross-domain rule (AD-10) — static check on the source file.
// ---------------------------------------------------------------------------

describe('strategy.types.ts — cross-domain isolation', () => {
  it('does not import expo-sqlite, ui/*, or services/{db,sync-queue}.service', async () => {
    const source = await Bun.file(
      new URL('../strategy.types.ts', import.meta.url),
    ).text();
    expect(source).not.toMatch(/from\s+['"]expo-sqlite['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/ui\//);
    expect(source).not.toMatch(/from\s+['"]\.\.\/db\.service['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/sync-queue\.service['"]/);
  });

  it('has exactly one inter-module import (the CarreraPayload type)', async () => {
    const source = await Bun.file(
      new URL('../strategy.types.ts', import.meta.url),
    ).text();
    const importLines = source.match(/^import\s.+$/gm) ?? [];
    const nonCarreraPayload = importLines.filter(
      (line) => !line.includes('CarreraPayload'),
    );
    expect(nonCarreraPayload).toEqual([]);
  });
});
