/**
 * `parse.test.ts` — unit tests for `parse.normalize`.
 *
 * `normalize(raw: string): string` is the single input-normalization
 * helper all three strategies call before their per-platform parser
 * (AD-13). It trims, strips non-printable chars, collapses internal
 * whitespace runs, and lowercases the platform-marker tokens
 * ("DIDI", "UBER", "INDRIVE") so the parsers can be platform-agnostic.
 *
 * Pure function — no I/O, no Date.now(), deterministic.
 */

import { describe, expect, it } from 'bun:test';

import { normalize } from '../parse';

describe('parse.normalize', () => {
  it('returns "" for empty input', () => {
    expect(normalize('')).toBe('');
  });

  it('returns "" for whitespace-only input', () => {
    expect(normalize('   ')).toBe('');
    expect(normalize('\n\n')).toBe('');
    expect(normalize('\t\t\t')).toBe('');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalize('  hello  ')).toBe('hello');
    expect(normalize('\nhello\n')).toBe('hello');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(normalize('foo    bar')).toBe('foo bar');
    expect(normalize('foo\n\nbar')).toBe('foo bar');
    expect(normalize('foo\tbar')).toBe('foo bar');
  });

  it('strips non-printable / zero-width characters', () => {
    // Zero-width space (U+200B) and BOM (U+FEFF) — common paste artifacts.
    expect(normalize('foo​bar')).toBe('foo bar');
    expect(normalize('﻿hello')).toBe('hello');
    expect(normalize('hello​​world')).toBe('hello world');
  });

  it('lowercases platform-marker tokens (DIDI, UBER, INDRIVE)', () => {
    expect(normalize('DIDI')).toBe('didi');
    expect(normalize('DiDi')).toBe('didi');
    expect(normalize('UBER')).toBe('uber');
    expect(normalize('InDrive')).toBe('indrive');
    expect(normalize('INDRIVE')).toBe('indrive');
  });

  it('preserves diacritics and non-platform characters', () => {
    // Spanish place names contain accented chars; the helper must not
    // strip them. Driver pastes "Calle 10 # 5-23, Medellín" verbatim.
    expect(normalize('Calle 10 Medellín')).toBe('calle 10 medellín');
  });

  it('handles multi-line paste (notification + body)', () => {
    expect(
      normalize('Uber Driver Trip\n\n$12.500 COP\nOrigen: Calle 10'),
    ).toBe('uber driver trip $12.500 cop origen: calle 10');
  });

  it('is pure — same input yields same output on repeated calls', () => {
    const input = '  DiDi  Tarifa:  $12.500  COP  \n\nCalle 10  ';
    expect(normalize(input)).toBe(normalize(input));
    expect(normalize(input)).toBe('didi tarifa: $12.500 cop calle 10');
  });
});
