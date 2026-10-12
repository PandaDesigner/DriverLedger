/**
 * `confidence.test.ts` — guards the literal value of the cross-cutting
 * confidence threshold (AD-12). A regression here is silent — the UI
 * stops rendering the manual form at the wrong cutoff. Pin the value.
 */

import { describe, expect, it } from 'bun:test';

import { CONFIDENCE_THRESHOLD } from '../confidence';

describe('CONFIDENCE_THRESHOLD', () => {
  it('is the literal 0.3', () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.3);
  });

  it('is typed as the literal type 0.3 (compile-time narrowing)', () => {
    // If a future commit flips the literal type, this assignment fails
    // tsc BEFORE the runtime assertion runs. Belt + suspenders.
    const value: 0.3 = CONFIDENCE_THRESHOLD;
    expect(value).toBe(0.3);
  });

  it('is strictly less than 1 so confidence=1 is above the threshold', () => {
    expect(CONFIDENCE_THRESHOLD).toBeLessThan(1);
  });

  it('is strictly greater than 0 so confidence=0 is below the threshold', () => {
    expect(CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
  });
});
