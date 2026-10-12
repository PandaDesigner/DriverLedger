/**
 * `confidence.ts` — single source of truth for the cross-cutting
 * confidence threshold (AD-12).
 *
 * The literal value `0.3` lives here so every consumer (registry,
 * `CarreraService.commitRegistration`, Phase 3 M01 modal) reads from
 * one place. Changing the threshold is one edit, one test update.
 *
 * The `as const` lets TypeScript narrow the type to the literal `0.3`,
 * which guards arithmetic operations against magic-number drift.
 */

export const CONFIDENCE_THRESHOLD = 0.3 as const;

/**
 * Type-level alias matching the literal value. Useful where a `as const`
 * inference isn't available (e.g. switch cases, structural narrowing).
 */
export type ConfidenceThreshold = typeof CONFIDENCE_THRESHOLD;
