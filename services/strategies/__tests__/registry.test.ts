/**
 * `registry.test.ts` — guards the static strategy registry's contract
 * (AD-3): populated at module load, frozen, throws `UnknownStrategyError`
 * on lookup miss.
 *
 * PR #1 ships with one entry (UberStrategy at tipo_estrategia='uber_api').
 * PR #2 Task 2.6 adds the other two seed rows (`didi_manual`,
 * `indrive_form`) to the registry. This test file is updated alongside
 * the registry change.
 */

import { describe, expect, it } from 'bun:test';

import {
  getStrategyByTipo,
  STRATEGY_REGISTRY,
  type TipoEstrategia,
} from '../registry';
import { UberStrategy } from '../uber.strategy';
import { DidiStrategy } from '../didi.strategy';
import { InDriveStrategy } from '../indrive.strategy';
import { UnknownStrategyError } from '../strategy.types';

describe('STRATEGY_REGISTRY — static boot-time map (AD-3)', () => {
  it('is frozen after module import (no runtime mutation)', () => {
    expect(Object.isFrozen(STRATEGY_REGISTRY)).toBe(true);
  });

  it("resolves 'uber_api' to the UberStrategy instance registered at boot", () => {
    expect(getStrategyByTipo('uber_api')).toBe(UberStrategy);
  });

  it("resolves 'didi_manual' to the DidiStrategy instance registered at boot (PR #2 Task 2.6)", () => {
    expect(getStrategyByTipo('didi_manual')).toBe(DidiStrategy);
  });

  it("resolves 'indrive_form' to the InDriveStrategy instance registered at boot (PR #2 Task 2.6)", () => {
    expect(getStrategyByTipo('indrive_form')).toBe(InDriveStrategy);
  });

  it('throws UnknownStrategyError on any unknown tipo', () => {
    expect(() => getStrategyByTipo('rappi')).toThrow(UnknownStrategyError);
    expect(() => getStrategyByTipo('')).toThrow(UnknownStrategyError);
    // @ts-expect-error — exercise the type-erased runtime path
    expect(() => getStrategyByTipo(undefined)).toThrow(UnknownStrategyError);
  });

  it('UnknownStrategyError carries the offending tipo on .tipo and in .message', () => {
    try {
      getStrategyByTipo('rappi');
      throw new Error('unreachable: getStrategyByTipo should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownStrategyError);
      expect((err as UnknownStrategyError).tipo).toBe('rappi');
      expect((err as Error).message).toContain('rappi');
    }
  });

  it('exports the TipoEstrategia type so consumers can narrow the key set', () => {
    // Compile-time only: a key that is not part of the union fails tsc.
    const k: TipoEstrategia = 'uber_api';
    expect(k).toBe('uber_api');
  });

  it('does not import expo-sqlite, db.service, sync-queue.service, or ui/*', async () => {
    const source = await Bun.file(
      new URL('../registry.ts', import.meta.url),
    ).text();
    expect(source).not.toMatch(/from\s+['"]expo-sqlite['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/db\.service['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/sync-queue\.service['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/ui\//);
  });
});
