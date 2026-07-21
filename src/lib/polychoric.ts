/**
 * Polychoric correlations + threshold estimation for ordinal data.
 *
 * Implements the Olsson (1979) two-step estimator:
 *   Step 1 — thresholds from each variable's univariate cumulative marginals,
 *            τ_k = Φ⁻¹(cumulative proportion through category k).
 *   Step 2 — the polychoric ρ maximises the bivariate-normal likelihood of the
 *            observed contingency table given the fixed thresholds.
 *
 * Also returns per-observation influence functions for every correlation, so
 * the asymptotic covariance Γ = cov(IF)/N is available for DWLS/WLSM weighting
 * and the robust (mean-adjusted) test statistic used with ordinal SEM.
 *
 * References: Olsson (1979); Muthén (1984); Jöreskog (1994).
 */

import { normalCDF } from './statDistributions';

// ─── Standard-normal helpers ────────────────────────────────────────────────

function normalPDF(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** Inverse standard-normal CDF — Acklam's rational approximation (|err| < 1.15e-9). */
export function normalInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q: number, r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

// ─── Bivariate normal CDF Φ₂(h,k;ρ) = P(Z₁≤h, Z₂≤k) ─────────────────────────
//
// Drezner & Wesolowsky (1990): Φ₂ = Φ(h)Φ(k) + ∫₀^ρ φ₂(h,k,r) dr, the integral
// evaluated by 24-point Gauss-Legendre quadrature. Accurate for |ρ| up to ~0.99,
// which is where polychoric estimation operates.

const GL_NODES = [
  -0.9951872199970213, -0.9747285559713095, -0.9382745520027328, -0.8864155270044011,
  -0.8200019859739029, -0.7401241915785544, -0.6480936519369755, -0.5454214713888396,
  -0.4337935076260451, -0.3150426796961634, -0.1911188674736163, -0.0640568928626056,
  0.0640568928626056, 0.1911188674736163, 0.3150426796961634, 0.4337935076260451,
  0.5454214713888396, 0.6480936519369755, 0.7401241915785544, 0.8200019859739029,
  0.8864155270044011, 0.9382745520027328, 0.9747285559713095, 0.9951872199970213,
];
const GL_WEIGHTS = [
  0.0123412297999872, 0.0285313886289337, 0.0442774388174198, 0.0592985849154368,
  0.0733464814110803, 0.0861901615319533, 0.0976186521041139, 0.1074442701159656,
  0.1155056680537256, 0.1216704729278034, 0.1258374563468283, 0.1279381953467522,
  0.1279381953467522, 0.1258374563468283, 0.1216704729278034, 0.1155056680537256,
  0.1074442701159656, 0.0976186521041139, 0.0861901615319533, 0.0733464814110803,
  0.0592985849154368, 0.0442774388174198, 0.0285313886289337, 0.0123412297999872,
];

/** Bivariate standard-normal density with correlation r. */
function bvnPDF(h: number, k: number, r: number): number {
  const om = 1 - r * r;
  if (om <= 1e-12) return 0;
  return Math.exp(-(h * h - 2 * r * h * k + k * k) / (2 * om)) / (2 * Math.PI * Math.sqrt(om));
}

/** Φ₂(h,k;ρ) = P(Z₁ ≤ h, Z₂ ≤ k). */
export function bvnCdf(h: number, k: number, rho: number): number {
  if (h === Infinity) return normalCDF(k);
  if (k === Infinity) return normalCDF(h);
  if (h === -Infinity || k === -Infinity) return 0;
  if (Math.abs(rho) < 1e-12) return normalCDF(h) * normalCDF(k);

  // ∫₀^ρ φ₂(h,k,r) dr via Gauss-Legendre on [0, ρ]
  const half = rho / 2;
  let integral = 0;
  for (let i = 0; i < GL_NODES.length; i++) {
    const r = half * GL_NODES[i] + half;
    integral += GL_WEIGHTS[i] * bvnPDF(h, k, r);
  }
  integral *= half;
  return normalCDF(h) * normalCDF(k) + integral;
}

// ─── Thresholds ─────────────────────────────────────────────────────────────

export interface VarMeta {
  categories: number[];     // sorted distinct category values
  counts: number[];         // frequency of each category
  thresholds: number[];     // K-1 interior thresholds (τ₁..τ_{K-1})
  n: number;
}

/** Estimate thresholds from a single ordinal column. Returns null if <2 categories. */
export function estimateThresholds(col: number[]): VarMeta | null {
  const clean = col.filter(v => Number.isFinite(v));
  const n = clean.length;
  if (n < 2) return null;
  const uniq = [...new Set(clean)].sort((a, b) => a - b);
  if (uniq.length < 2) return null;

  const counts = uniq.map(c => clean.filter(v => v === c).length);
  const thresholds: number[] = [];
  let cum = 0;
  for (let k = 0; k < uniq.length - 1; k++) {
    cum += counts[k];
    // clamp the proportion away from 0/1 so the threshold is finite
    const prop = Math.min(1 - 0.5 / n, Math.max(0.5 / n, cum / n));
    thresholds.push(normalInv(prop));
  }
  return { categories: uniq, counts, thresholds, n };
}

/** Is this column plausibly ordinal? (few distinct, integer-like values) */
export function looksOrdinal(col: number[], maxCategories = 10): boolean {
  const clean = col.filter(v => Number.isFinite(v));
  if (clean.length === 0) return false;
  const uniq = new Set(clean);
  if (uniq.size < 2 || uniq.size > maxCategories) return false;
  return clean.every(v => Number.isInteger(v));
}

// ─── Polychoric correlation for one pair ────────────────────────────────────

/** Bounds for a category index into a threshold vector: returns [lower, upper]. */
function catBounds(thresholds: number[], cat: number): [number, number] {
  const lower = cat === 0 ? -Infinity : thresholds[cat - 1];
  const upper = cat === thresholds.length ? Infinity : thresholds[cat];
  return [lower, upper];
}

/** Probability of cell (a,b) under the bivariate normal with correlation rho. */
function cellProb(ti: number[], tj: number[], a: number, b: number, rho: number): number {
  const [la, ua] = catBounds(ti, a);
  const [lb, ub] = catBounds(tj, b);
  const p = bvnCdf(ua, ub, rho) - bvnCdf(la, ub, rho) - bvnCdf(ua, lb, rho) + bvnCdf(la, lb, rho);
  return Math.max(p, 1e-12);
}

/** ∂P(cell a,b)/∂ρ  = φ₂ evaluated at the four corners (±). */
function cellProbDeriv(ti: number[], tj: number[], a: number, b: number, rho: number): number {
  const [la, ua] = catBounds(ti, a);
  const [lb, ub] = catBounds(tj, b);
  const f = (h: number, k: number) => (h === Infinity || h === -Infinity || k === Infinity || k === -Infinity) ? 0 : bvnPDF(h, k, rho);
  return f(ua, ub) - f(la, ub) - f(ua, lb) + f(la, lb);
}

export interface PolychoricPair {
  rho: number;
  se: number;              // asymptotic SE of rho (from observed information)
  table: number[][];       // contingency table (rows = var i categories)
  Ka: number; Kb: number;
  info: number;            // total (observed) information Σ n·(∂logP/∂ρ)²
  cellScore: number[][];   // per-cell score (∂logP/∂ρ) — for influence functions
}

/**
 * Polychoric correlation for two ordinal columns given their thresholds.
 * Two-step: thresholds are fixed; ρ maximises the multinomial likelihood.
 */
export function polychoricPair(
  xi: number[], xj: number[], mi: VarMeta, mj: VarMeta
): PolychoricPair {
  const Ka = mi.categories.length, Kb = mj.categories.length;
  const idxA = new Map(mi.categories.map((c, i) => [c, i]));
  const idxB = new Map(mj.categories.map((c, i) => [c, i]));

  // Contingency table over complete pairs
  const table: number[][] = Array.from({ length: Ka }, () => new Array(Kb).fill(0));
  let nPairs = 0;
  for (let m = 0; m < xi.length; m++) {
    const vi = xi[m], vj = xj[m];
    if (!Number.isFinite(vi) || !Number.isFinite(vj)) continue;
    const a = idxA.get(vi), b = idxB.get(vj);
    if (a === undefined || b === undefined) continue;
    table[a][b]++; nPairs++;
  }

  const ti = mi.thresholds, tj = mj.thresholds;

  // Negative log-likelihood as a function of rho
  const negLL = (rho: number): number => {
    let ll = 0;
    for (let a = 0; a < Ka; a++)
      for (let b = 0; b < Kb; b++)
        if (table[a][b] > 0) ll += table[a][b] * Math.log(cellProb(ti, tj, a, b, rho));
    return -ll;
  };

  // Golden-section search on (-0.999, 0.999)
  let lo = -0.999, hi = 0.999;
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo);
  let fc = negLL(c), fd = negLL(d);
  for (let it = 0; it < 100 && hi - lo > 1e-8; it++) {
    if (fc < fd) { hi = d; d = c; fd = fc; c = hi - gr * (hi - lo); fc = negLL(c); }
    else { lo = c; c = d; fc = fd; d = lo + gr * (hi - lo); fd = negLL(d); }
  }
  let rho = (lo + hi) / 2;

  // Observed information + per-cell scores → asymptotic variance and influence
  let info = 0;
  const cellScore: number[][] = Array.from({ length: Ka }, () => new Array(Kb).fill(0));
  for (let a = 0; a < Ka; a++) {
    for (let b = 0; b < Kb; b++) {
      const Pab = cellProb(ti, tj, a, b, rho);
      const dP = cellProbDeriv(ti, tj, a, b, rho);
      const s = Pab > 1e-12 ? dP / Pab : 0;  // ∂logP/∂ρ for an obs in this cell
      cellScore[a][b] = s;
      info += table[a][b] * s * s;           // Σ n·(∂logP/∂ρ)²
    }
  }
  const se = info > 1e-12 ? Math.sqrt(1 / info) : 0.1;

  return { rho: Math.max(-0.999, Math.min(0.999, rho)), se, table, Ka, Kb, info, cellScore };
}

// ─── Full polychoric matrix ─────────────────────────────────────────────────

export interface PolychoricResult {
  R: number[][];                 // polychoric correlation matrix (p × p)
  thresholds: number[][];        // per-variable thresholds
  asymVar: number[];             // asymptotic variance of each lower-triangle correlation
  pairIndex: Array<[number, number]>; // (i,j) for each lower-triangle entry, i>j
  n: number;
  ordinal: boolean[];            // which columns were treated as ordinal
  Gamma?: number[][];            // q×q asymptotic covariance of √N·(r̂ − r), q = p(p−1)/2
}

/**
 * Polychoric correlation matrix for the supplied columns (data[obs][var]).
 * Columns that are not ordinal fall back to the Pearson correlation with the
 * ordinal ones (mixed correlations use polyserial-free Pearson as a pragmatic
 * fallback; for fully-ordinal item sets — the usual CFA case — all entries are
 * polychoric).
 */
export function polychoricMatrix(
  data: number[][], varIndices: number[], computeGamma = false
): PolychoricResult {
  const p = varIndices.length;
  const cols = varIndices.map(vi => data.map(row => row[vi]));
  const metas = cols.map(c => estimateThresholds(c));
  const ordinal = metas.map(m => m !== null);
  const n = data.length;

  const R: number[][] = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => (i === j ? 1 : 0)));
  const thresholds = metas.map(m => m?.thresholds ?? []);
  const asymVar: number[] = [];
  const pairIndex: Array<[number, number]> = [];
  // Per-observation influence functions IF[m][pair], filled only when computeGamma
  const q = (p * (p - 1)) / 2;
  const IF: number[][] | null = computeGamma ? Array.from({ length: n }, () => new Array(q).fill(0)) : null;

  let pairPos = 0;
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < i; j++) {
      let rho: number, varRho: number;
      if (metas[i] && metas[j]) {
        const pr = polychoricPair(cols[i], cols[j], metas[i]!, metas[j]!);
        rho = pr.rho;
        varRho = pr.se * pr.se;
        if (IF) {
          // IF of r̂ for an obs in cell (a,b): score_ab / i₁, with i₁ = info/n.
          // Assemble the per-observation influence column for this pair.
          const idxA = new Map(metas[i]!.categories.map((c, k) => [c, k]));
          const idxB = new Map(metas[j]!.categories.map((c, k) => [c, k]));
          const perObsInfo = pr.info / n;
          for (let m = 0; m < n; m++) {
            const vi = cols[i][m], vj = cols[j][m];
            if (!Number.isFinite(vi) || !Number.isFinite(vj)) continue;
            const a = idxA.get(vi), b = idxB.get(vj);
            if (a === undefined || b === undefined) continue;
            IF[m][pairPos] = perObsInfo > 1e-12 ? pr.cellScore[a][b] / perObsInfo : 0;
          }
        }
      } else {
        rho = pearson(cols[i], cols[j]);
        varRho = (1 - rho * rho) ** 2 / Math.max(n - 1, 1);
      }
      R[i][j] = R[j][i] = rho;
      asymVar.push(Math.max(varRho, 1e-8));
      pairIndex.push([i, j]);
      pairPos++;
    }
  }

  let Gamma: number[][] | undefined;
  if (IF) {
    // Γ = (1/n) Σ_m IF[m] IF[m]ᵀ  (asymptotic covariance of √n·(r̂ − r))
    Gamma = Array.from({ length: q }, () => new Array(q).fill(0));
    for (let m = 0; m < n; m++) {
      const row = IF[m];
      for (let a = 0; a < q; a++) {
        const ra = row[a];
        if (ra === 0) continue;
        for (let b = a; b < q; b++) Gamma[a][b] += ra * row[b];
      }
    }
    for (let a = 0; a < q; a++)
      for (let b = a; b < q; b++) { Gamma[a][b] /= n; Gamma[b][a] = Gamma[a][b]; }
  }

  return { R, thresholds, asymVar, pairIndex, n, ordinal, Gamma };
}

function pearson(x: number[], y: number[]): number {
  const pairs = x.map((v, i) => [v, y[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const n = pairs.length;
  if (n < 3) return 0;
  const mx = pairs.reduce((s, [a]) => s + a, 0) / n;
  const my = pairs.reduce((s, [, b]) => s + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (const [a, b] of pairs) { const u = a - mx, v = b - my; num += u * v; dx += u * u; dy += v * v; }
  const den = Math.sqrt(dx * dy);
  return den < 1e-12 ? 0 : Math.max(-0.999, Math.min(0.999, num / den));
}
