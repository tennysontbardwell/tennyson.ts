// Error function approximation (Abramowitz & Stegun 7.1.26)
// Max error ~1.5e-7 for typical double-precision usage.
export function erf(x: number): number {
  // Save the sign of x
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);

  // Constants
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * ax);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
    Math.exp(-ax * ax);

  return sign * y;
}

// Standard normal CDF using erf
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Two-tailed p-value from z (common in hypothesis testing)
export function pValueTwoTailedFromZ(z: number): number {
  const pOneSide = 1 - normalCdf(Math.abs(z));
  return 2 * pOneSide;
}
