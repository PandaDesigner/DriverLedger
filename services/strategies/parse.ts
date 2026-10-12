/**
 * `parse.ts` — single input-normalization helper shared by every
 * platform strategy (AD-13).
 *
 * `normalize(raw: string): string` collapses paste-of-notification noise
 * into a canonical form the per-platform parsers operate on. Drivers
 * paste from screenshots and notifications; both inject noise (newlines,
 * zero-width spaces, mixed case, RTL marks on Android). Letting each
 * strategy do its own normalization duplicates the same code three times
 * and creates a drift surface — this helper is the single seam.
 *
 * Pure function — no I/O, no Date.now(), no Math.random().
 */

const PLATFORM_TOKENS = ['UBER', 'DIDI', 'INDRIVE'] as const;

/**
 * Lowercase a copy of `raw` while leaving the rest of the string alone.
 * Token-match (case-insensitive substring) preserves diacritics ("Médellín").
 */
function lowercasePlatformMarkers(raw: string): string {
  let out = raw;
  for (const token of PLATFORM_TOKENS) {
    // Escape any regex metacharacters in the token (none exist for these
    // three, but the helper is generic).
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'gi');
    out = out.replace(re, token.toLowerCase());
  }
  return out;
}

/**
 * Strip zero-width, RTL, and other non-printable chars that ride along
 * with copy/paste from notification stacks. Keeps Spanish diacritics.
 */
function stripNoiseChars(raw: string): string {
  // U+200B zero-width space, U+200C zero-width non-joiner, U+200D zero-width joiner,
  // U+FEFF byte-order-mark, U+200E/200F LTR/RTL marks.
  return raw.replace(/[​-‏﻿]/g, ' ');
}

/**
 * Trim leading/trailing whitespace and collapse internal whitespace
 * runs to a single space (preserves single spaces between words).
 */
function collapseWhitespace(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Normalize a raw paste input into the canonical form strategies parse.
 *
 * Steps:
 *   1. Strip non-printable / zero-width characters.
 *   2. Lowercase the platform-marker tokens (DIDI → didi, UBER → uber,
 *      INDRIVE → indrive) so per-platform parsers can match case-insensitive
 *      without hardcoding three variants.
 *   3. Collapse internal whitespace runs to a single space and trim both ends.
 *
 * Does NOT touch currency, numerics, or diacritics — those are
 * per-platform parser concerns.
 */
export function normalize(raw: string): string {
  if (raw.length === 0) return '';
  return collapseWhitespace(
    lowercasePlatformMarkers(stripNoiseChars(raw)).toLowerCase(),
  );
}
