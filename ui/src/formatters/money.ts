/**
 * Format an amount of Colombian pesos for display.
 *
 * Domain decision: locale `es-CO`, currency `COP`, no fractional digits.
 * Lives outside the presentation layer because it encodes a business rule
 * (the project's working currency and locale), not a UI choice.
 */
export function money(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}
