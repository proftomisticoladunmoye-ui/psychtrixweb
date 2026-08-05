/**
 * Missing-data toolkit.
 *
 *  • analyzeMissingness — per-variable / per-case / pattern diagnostics
 *  • littleMCAR         — Little's (1988) test of Missing Completely At Random
 *  • emEstimate         — mean vector + covariance matrix via the EM algorithm
 *                         under a multivariate-normal MAR model. This is the
 *                         FIML-quality sufficient statistic that covariance-based
 *                         methods (CFA / SEM / EFA / network) should consume
 *                         instead of throwing away incomplete cases.
 *  • imputeMean / imputeMedian / imputeEM — build a completed dataset.
 *
 * `NaN` marks a missing value throughout.
 */
import { chiSqPValue } from './statDistributions';

const isMiss = (v: number) => v == null || Number.isNaN(v);

// ─── small self-contained linear algebra ─────────────────────────────────────
const zeros = (r: number, c: number) => Array.from({ length: r }, () => new Array(c).fill(0));

function submatrix(m: number[][], rows: number[], cols: number[]): number[][] {
  return rows.map((r) => cols.map((c) => m[r][c]));
}
function matMul(a: number[][], b: number[][]): number[][] {
  const out = zeros(a.length, b[0].length);
  for (let i = 0; i < a.length; i++)
    for (let k = 0; k < b.length; k++) {
      const aik = a[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < b[0].length; j++) out[i][j] += aik * b[k][j];
    }
  return out;
}
// Gauss–Jordan inverse with partial pivoting + tiny ridge for stability.
function invert(mat: number[][]): number[][] {
  const n = mat.length;
  const a = mat.map((row, i) => row.map((v, j) => v + (i === j ? 1e-10 : 0)));
  const inv = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    if (Math.abs(a[piv][col]) < 1e-12) continue;
    [a[col], a[piv]] = [a[piv], a[col]];
    [inv[col], inv[piv]] = [inv[piv], inv[col]];
    const d = a[col][col];
    for (let j = 0; j < n; j++) { a[col][j] /= d; inv[col][j] /= d; }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) { a[r][j] -= f * a[col][j]; inv[r][j] -= f * inv[col][j]; }
    }
  }
  return inv;
}
// xᵀ A x
function quad(x: number[], A: number[][]): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) for (let j = 0; j < x.length; j++) s += x[i] * A[i][j] * x[j];
  return s;
}
function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L = zeros(n, n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];
      if (i === j) L[i][j] = Math.sqrt(Math.max(1e-12, A[i][i] - s));
      else L[i][j] = (A[i][j] - s) / (L[j][j] || 1e-12);
    }
  return L;
}
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function randn(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Group case indices by their observed/missing pattern.
function patternGroups(obs: boolean[][]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < obs.length; i++) {
    const key = obs[i].map((b) => (b ? '1' : '0')).join('');
    const g = groups.get(key);
    if (g) g.push(i); else groups.set(key, [i]);
  }
  return groups;
}

// ─── diagnostics ─────────────────────────────────────────────────────────────
export interface MissingnessReport {
  nCases: number;
  nVariables: number;
  nComplete: number;
  casesWithMissing: number;
  overallMissingPct: number;
  perVariable: Array<{ variable: string; missing: number; pct: number }>;
  patterns: Array<{ label: string; count: number; nMissingVars: number }>;
}

export function analyzeMissingness(data: number[][], columns: string[]): MissingnessReport {
  const n = data.length, p = columns.length;
  const perVariable = columns.map((variable, j) => {
    let missing = 0;
    for (let i = 0; i < n; i++) if (isMiss(data[i][j])) missing++;
    return { variable, missing, pct: n ? (missing / n) * 100 : 0 };
  });
  let cellsMissing = 0, complete = 0, casesWithMissing = 0;
  for (let i = 0; i < n; i++) {
    let any = false;
    for (let j = 0; j < p; j++) if (isMiss(data[i][j])) { cellsMissing++; any = true; }
    if (any) casesWithMissing++; else complete++;
  }
  const obs = data.map((row) => columns.map((_, j) => !isMiss(row[j])));
  const groups = patternGroups(obs);
  const patterns = [...groups.entries()]
    .map(([key, idxs]) => {
      const missingVars = columns.filter((_, j) => key[j] === '0');
      return {
        label: missingVars.length === 0 ? 'complete' : `missing: ${missingVars.join(', ')}`,
        count: idxs.length,
        nMissingVars: missingVars.length,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  return {
    nCases: n, nVariables: p, nComplete: complete, casesWithMissing,
    overallMissingPct: n && p ? (cellsMissing / (n * p)) * 100 : 0,
    perVariable, patterns,
  };
}

// ─── EM estimation of (μ, Σ) under multivariate-normal MAR ───────────────────
export interface EMEstimate {
  mean: number[];
  cov: number[][];   // ML covariance (÷ n)
  corr: number[][];
  iterations: number;
  converged: boolean;
}

export function emEstimate(data: number[][], maxIter = 300, tol = 1e-6): EMEstimate {
  const n = data.length, p = data[0].length;
  const obs = data.map((row) => row.map((v) => !isMiss(v)));
  const groups = patternGroups(obs);

  // Start values from the observed data (available-case mean/variance).
  let mean = new Array(p).fill(0);
  for (let j = 0; j < p; j++) { let s = 0, c = 0; for (let i = 0; i < n; i++) if (obs[i][j]) { s += data[i][j]; c++; } mean[j] = c ? s / c : 0; }
  let cov = zeros(p, p);
  for (let j = 0; j < p; j++) { let s = 0, c = 0; for (let i = 0; i < n; i++) if (obs[i][j]) { const d = data[i][j] - mean[j]; s += d * d; c++; } cov[j][j] = c > 1 ? s / c : 1; }

  let iterations = 0, converged = false;
  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;
    const T1 = new Array(p).fill(0);
    const T2 = zeros(p, p);

    for (const idxs of groups.values()) {
      const first = idxs[0];
      const O: number[] = [], M: number[] = [];
      for (let j = 0; j < p; j++) (obs[first][j] ? O : M).push(j);

      let beta: number[][] = [], condCov: number[][] = [];
      if (M.length && O.length) {
        const SooInv = invert(submatrix(cov, O, O));
        beta = matMul(submatrix(cov, M, O), SooInv);                       // (|M|×|O|)
        condCov = submatrix(cov, M, M).map((row, a) =>
          row.map((v, b) => v - matMul([beta[a]], submatrix(cov, O, [M[b]]))[0][0]));
      } else if (M.length) {
        // Nothing observed for this pattern: conditional = marginal (μ, Σ_MM).
        condCov = submatrix(cov, M, M);
      }
      for (const i of idxs) {
        const xhat = new Array(p);
        for (const j of O) xhat[j] = data[i][j];
        if (M.length) {
          const dO = O.map((j) => data[i][j] - mean[j]);
          for (let a = 0; a < M.length; a++) {
            let acc = mean[M[a]];
            for (let t = 0; t < O.length; t++) acc += beta[a][t] * dO[t];
            xhat[M[a]] = acc;
          }
        }
        for (let a = 0; a < p; a++) { T1[a] += xhat[a]; for (let b = 0; b < p; b++) T2[a][b] += xhat[a] * xhat[b]; }
        for (let a = 0; a < M.length; a++) for (let b = 0; b < M.length; b++) T2[M[a]][M[b]] += condCov[a][b];
      }
    }

    const newMean = T1.map((s) => s / n);
    const newCov = zeros(p, p);
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) newCov[a][b] = T2[a][b] / n - newMean[a] * newMean[b];
    for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) { const m = (newCov[a][b] + newCov[b][a]) / 2; newCov[a][b] = newCov[b][a] = m; }

    let maxDelta = 0;
    for (let a = 0; a < p; a++) { maxDelta = Math.max(maxDelta, Math.abs(newMean[a] - mean[a])); for (let b = 0; b < p; b++) maxDelta = Math.max(maxDelta, Math.abs(newCov[a][b] - cov[a][b])); }
    mean = newMean; cov = newCov;
    if (maxDelta < tol) { converged = true; break; }
  }

  const corr = zeros(p, p);
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) corr[a][b] = cov[a][b] / Math.sqrt(cov[a][a] * cov[b][b]);
  return { mean, cov, corr, iterations, converged };
}

// ─── Little's MCAR test ──────────────────────────────────────────────────────
export interface MCARResult { chiSquare: number; df: number; pValue: number; mcar: boolean; interpretation: string; }

export function littleMCAR(data: number[][]): MCARResult {
  const p = data[0].length;
  const { mean, cov } = emEstimate(data);
  const obs = data.map((row) => row.map((v) => !isMiss(v)));
  const groups = patternGroups(obs);

  let d2 = 0, dfSum = 0;
  for (const idxs of groups.values()) {
    const first = idxs[0];
    const O: number[] = [];
    for (let j = 0; j < p; j++) if (obs[first][j]) O.push(j);
    if (O.length === 0) continue;
    const nj = idxs.length;
    const xbar = O.map((j) => { let s = 0; for (const i of idxs) s += data[i][j]; return s / nj; });
    const diff = xbar.map((v, t) => v - mean[O[t]]);
    const SooInv = invert(submatrix(cov, O, O));
    d2 += nj * quad(diff, SooInv);
    dfSum += O.length;
  }
  const df = Math.max(1, dfSum - p);
  const pValue = chiSqPValue(d2, df);
  const mcar = pValue > 0.05;
  return {
    chiSquare: d2, df, pValue, mcar,
    interpretation: mcar
      ? 'Consistent with Missing Completely At Random (MCAR) — the missingness shows no systematic relationship to observed values (p > .05).'
      : 'Not consistent with MCAR (p ≤ .05) — missingness is related to observed data. Prefer FIML / multiple imputation over listwise deletion.',
  };
}

// ─── imputation → completed dataset ──────────────────────────────────────────
export function imputeMean(data: number[][]): number[][] {
  const p = data[0].length;
  const m = new Array(p).fill(0);
  for (let j = 0; j < p; j++) { let s = 0, c = 0; for (let i = 0; i < data.length; i++) if (!isMiss(data[i][j])) { s += data[i][j]; c++; } m[j] = c ? s / c : 0; }
  return data.map((row) => row.map((v, j) => (isMiss(v) ? m[j] : v)));
}

export function imputeMedian(data: number[][]): number[][] {
  const p = data[0].length;
  const med = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    const col = data.map((r) => r[j]).filter((v) => !isMiss(v)).sort((a, b) => a - b);
    med[j] = col.length ? col[Math.floor(col.length / 2)] : 0;
  }
  return data.map((row) => row.map((v, j) => (isMiss(v) ? med[j] : v)));
}

/**
 * Stochastic imputation from the EM multivariate-normal model: each missing
 * block is drawn from its conditional distribution N(μ_mis|obs, Σ_mis|obs).
 * Unlike mean imputation this preserves marginal variances and correlations.
 * Seeded, so results are reproducible.
 */
export function imputeEM(data: number[][], seed = 20260804): number[][] {
  const p = data[0].length;
  const { mean, cov } = emEstimate(data);
  const obs = data.map((row) => row.map((v) => !isMiss(v)));
  const groups = patternGroups(obs);
  const rng = mulberry32(seed);
  const out = data.map((row) => row.slice());

  for (const idxs of groups.values()) {
    const first = idxs[0];
    const O: number[] = [], M: number[] = [];
    for (let j = 0; j < p; j++) (obs[first][j] ? O : M).push(j);
    if (M.length === 0) continue;
    const beta = O.length ? matMul(submatrix(cov, M, O), invert(submatrix(cov, O, O))) : [];
    const condCov = O.length
      ? submatrix(cov, M, M).map((row, a) => row.map((v, b) => v - matMul([beta[a]], submatrix(cov, O, [M[b]]))[0][0]))
      : submatrix(cov, M, M);
    const L = cholesky(condCov);
    for (const i of idxs) {
      const dO = O.map((j) => data[i][j] - mean[j]);
      const z = M.map(() => randn(rng));
      for (let a = 0; a < M.length; a++) {
        let condMean = mean[M[a]];
        for (let t = 0; t < O.length; t++) condMean += beta[a][t] * dO[t];
        let noise = 0;
        for (let k = 0; k <= a; k++) noise += L[a][k] * z[k];
        out[i][M[a]] = condMean + noise;
      }
    }
  }
  return out;
}
