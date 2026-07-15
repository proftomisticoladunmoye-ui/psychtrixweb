/**
 * Shared statistical distribution functions — single source of truth for
 * p-values and non-central chi-square machinery used by CFA, SEM, EFA, and
 * measurement invariance. All routines verified against reference values
 * (R pchisq/qchisq and lavaan RMSEA CIs).
 */

/** log Γ(x) — Lanczos approximation, |err| < 1e-13. */
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let sum = c[0];
  for (let i = 1; i < g + 2; i++) sum += c[i] / (x + i - 1);
  const t = x + g - 0.5;
  return 0.9189385332046727 + (x - 0.5) * Math.log(t) - t + Math.log(sum);
}

/** Standard normal CDF (Zelen & Severo 26.2.17, |err| < 7.5e-8). */
export function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/**
 * Chi-square upper-tail p-value via the regularized incomplete gamma function:
 * series for x < k+1, modified Lentz continued fraction otherwise
 * (Numerical Recipes §6.2). Exact to ~1e-14, stable for arbitrarily large chisq
 * (naive series underflow at large chisq is what used to return p = 1.0).
 */
export function chiSqPValue(chisq: number, df: number): number {
  if (chisq <= 0 || df <= 0) return 1;
  const k = df / 2;
  const x = chisq / 2;

  if (x < k + 1) {
    let ap = k;
    let sum = 1 / k; // the i = 0 term — omitting it skews every p-value
    let del = sum;
    for (let i = 0; i < 500; i++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    const P = sum * Math.exp(-x + k * Math.log(x) - lgamma(k));
    return Math.max(0, Math.min(1, 1 - P));
  }

  const FPMIN = 1e-300;
  let b = x + 1 - k;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 500; i++) {
    const an = -i * (i - k);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  const Q = Math.exp(-x + k * Math.log(x) - lgamma(k)) * h;
  return Math.max(0, Math.min(1, Q));
}

/**
 * CDF of the non-central chi-square, Sankaran (1963) approximation.
 * Monotonically decreasing in λ for fixed x — the property the RMSEA
 * bound search relies on.
 */
export function noncentralChisqCDF(x: number, df: number, lam: number): number {
  if (x <= 0) return 0;
  const h = 1 - (2 / 3) * ((df + lam) * (df + 3 * lam)) / ((df + 2 * lam) ** 2);
  const p = (df + 2 * lam) / ((df + lam) ** 2);
  const m = (h - 1) * (1 - 3 * h);
  const num = Math.pow(x / (df + lam), h) - (1 + h * p * (h - 1 - 0.5 * (2 - h) * m * p));
  const den = h * Math.sqrt(2 * p) * (1 + 0.5 * m * p);
  return normalCDF(num / Math.max(den, 1e-12));
}

/**
 * Browne & Cudeck (1993) non-centrality bound: λ such that the observed
 * chi-square sits at the given percentile of χ²(df, λ).
 * targetCDF = 0.95 → λ for the RMSEA lower bound; 0.05 → upper bound.
 */
export function ncpRmseaBound(x: number, df: number, targetCDF: number): number {
  if (noncentralChisqCDF(x, df, 0) < targetCDF) return 0;

  let lo = 0;
  let hi = Math.max(x * 2, df + 10);
  while (noncentralChisqCDF(x, df, hi) > targetCDF && hi < 1e8) hi *= 2;

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (noncentralChisqCDF(x, df, mid) > targetCDF) lo = mid; else hi = mid;
    if (hi - lo < 1e-8 * (1 + hi)) break;
  }
  return (lo + hi) / 2;
}

/** 90% RMSEA confidence interval (Browne & Cudeck, 1993). */
export function rmseaCI(chisq: number, df: number, n: number): { lower: number; upper: number } {
  if (df <= 0 || n <= 1) return { lower: 0, upper: 0 };
  return {
    lower: Math.sqrt(ncpRmseaBound(chisq, df, 0.95) / (df * (n - 1))),
    upper: Math.sqrt(ncpRmseaBound(chisq, df, 0.05) / (df * (n - 1))),
  };
}
