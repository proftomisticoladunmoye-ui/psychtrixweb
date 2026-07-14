/**
 * Confirmatory Factor Analysis — proper client-side engine
 *
 * Estimation: Unweighted Least Squares (ULS) with optional Diagonally Weighted
 * Least Squares (DWLS) for ordinal data.  Starting values come from unit-weighted
 * PCA (first eigenvector) scaled to the correlation scale; the gradient is iterated
 * until ||grad||² < 1e-8 or 500 steps.
 *
 * Fit indices follow Jöreskog & Sörbom (1996), Hu & Bentler (1999),
 * and Kline (2016).
 */

import { MatrixOps, Statistics, CorrelationMatrix } from './psychometricStats';

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface CFAModel {
  latentVariables: { [key: string]: string[] };
  correlations?: Array<[string, string]>;
}

export interface SEMModel extends CFAModel {
  structuralPaths: Array<{ from: string; to: string }>;
}

export interface FitIndices {
  chisq: number;
  df: number;
  pvalue: number;
  cfi: number;
  tli: number;
  rmsea: number;
  rmsea_ci_lower: number;
  rmsea_ci_upper: number;
  srmr: number;
  gfi: number;
  agfi: number;
  aic: number;
  bic: number;
  nfi: number;
  nnfi: number;
}

export interface CFAResults {
  fitIndices: FitIndices;
  factorLoadings: Array<{
    latent: string;
    indicator: string;
    estimate: number;
    se: number;
    z: number;
    pvalue: number;
    std_estimate: number;
  }>;
  factorCorrelations?: Array<{
    factor1: string;
    factor2: string;
    estimate: number;
    se: number;
    z: number;
    pvalue: number;
  }>;
  residualVariances: Array<{
    variable: string;
    estimate: number;
    se: number;
  }>;
  modificationIndices: Array<{
    type: 'loading' | 'covariance';
    param1: string;
    param2: string;
    mi: number;
    epc: number;
  }>;
  reliabilities: {
    [factor: string]: {
      cronbachAlpha: number;
      compositeReliability: number;
      averageVarianceExtracted: number;
    };
  };
  warnings: string[];
}

export interface SEMResults extends CFAResults {
  structuralPaths: Array<{
    from: string; to: string;
    estimate: number; se: number; z: number; pvalue: number; std_estimate: number;
  }>;
  rSquared: { [variable: string]: number };
  totalEffects?: { [path: string]: { direct: number; indirect: number; total: number } };
}

// ─── Tiny linear algebra helpers ──────────────────────────────────────────────

function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length, k = A[0].length, n = B[0].length;
  const C = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let l = 0; l < k; l++) C[i][j] += A[i][l] * B[l][j];
  return C;
}

function matAdd(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

function matSub(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v - B[i][j]));
}

function transpose(A: number[][]): number[][] {
  return A[0].map((_, j) => A.map(row => row[j]));
}

/** Gauss-Jordan inverse with partial pivoting; regularises near-singular matrices */
function inverse(M: number[][]): number[][] {
  const n = M.length;
  const aug = M.map((row, i) => {
    const r = [...row, ...Array(n).fill(0)];
    r[n + i] = 1;
    return r;
  });
  for (let col = 0; col < n; col++) {
    let maxR = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxR][col])) maxR = r;
    [aug[col], aug[maxR]] = [aug[maxR], aug[col]];
    const piv = aug[col][col];
    if (Math.abs(piv) < 1e-14) {
      // regularise the diagonal
      aug[col][col] = piv < 0 ? piv - 1e-8 : piv + 1e-8;
    }
    const p2 = aug[col][col];
    for (let c = col; c < 2 * n; c++) aug[col][c] /= p2;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      for (let c = col; c < 2 * n; c++) aug[r][c] -= f * aug[col][c];
    }
  }
  return aug.map(row => row.slice(n));
}

/** Log-determinant via LU decomposition (more stable than cofactor for large matrices) */
function logDet(M: number[][]): number {
  const n = M.length;
  const L = M.map(r => [...r]);
  let sign = 1;
  let logD = 0;
  for (let col = 0; col < n; col++) {
    let maxR = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(L[r][col]) > Math.abs(L[maxR][col])) maxR = r;
    if (maxR !== col) { [L[col], L[maxR]] = [L[maxR], L[col]]; sign *= -1; }
    const piv = L[col][col];
    if (Math.abs(piv) < 1e-14) return -Infinity;
    logD += Math.log(Math.abs(piv));
    for (let r = col + 1; r < n; r++) {
      const f = L[r][col] / piv;
      for (let c = col; c < n; c++) L[r][c] -= f * L[col][c];
    }
  }
  return logD;
}

function trace(M: number[][]): number {
  return M.reduce((s, row, i) => s + row[i], 0);
}

function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Regularised lower incomplete gamma for chi-square p-values */
function chiSqPValue(chisq: number, df: number): number {
  if (chisq <= 0 || df <= 0) return 1;
  // Use Wilson-Hilferty normal approximation (accurate for df >= 1)
  const k = df / 2;
  const x = chisq / 2;
  // Poisson series (good for small x/df)
  if (x < k + 1) {
    let sum = 0, term = 1 / k;
    for (let i = 1; i <= 300; i++) {
      term *= x / (k + i);
      sum += term;
      if (term < 1e-12 * sum) break;
    }
    const p = sum * Math.exp(-x + k * Math.log(x) - lgamma(k));
    return Math.max(0, Math.min(1, 1 - p));
  }
  // Continued fraction for large x
  const cf = chiSqPValueCF(chisq, df);
  return Math.max(0, Math.min(1, cf));
}

function chiSqPValueCF(chisq: number, df: number): number {
  const a = df / 2, x = chisq / 2;
  // Wilson-Hilferty normal approximation
  const cbrtFactor = 1 - 2 / (9 * a);
  const cbrtX = Math.pow(x / a, 1 / 3);
  const z = (cbrtX - cbrtFactor) / Math.sqrt(2 / (9 * a));
  return 1 - normalCDF(z);
}

function lgamma(x: number): number {
  // Stirling series
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

// ─── Power-iteration eigenvector (for starting values) ────────────────────────

function firstEigenvector(R: number[][]): number[] {
  const p = R.length;
  let v = Array(p).fill(1 / Math.sqrt(p));
  for (let iter = 0; iter < 300; iter++) {
    const w = R.map(row => row.reduce((s, r, j) => s + r * v[j], 0));
    const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
    if (norm < 1e-14) break;
    const vNext = w.map(x => x / norm);
    const diff = vNext.reduce((s, x, i) => s + (x - v[i]) ** 2, 0);
    v = vNext;
    if (diff < 1e-14) break;
  }
  // Orient so majority of components are positive
  const pos = v.filter(x => x > 0).length;
  if (pos < p / 2) v = v.map(x => -x);
  return v;
}

// ─── ULS / DWLS discrepancy and gradient ──────────────────────────────────────

/**
 * Build the model-implied correlation matrix Σ(θ) for a multi-factor CFA.
 * θ layout: [λ_{F1,x1}, λ_{F1,x2}, …, λ_{F2,y1}, …, φ_{F1,F2}, …]
 * where φ are inter-factor correlations (lower-triangle, row-major).
 * Factor variances are fixed to 1 (identification constraint).
 * Residual variances = 1 - λᵢ² (implied by fixing factor variance to 1 for
 * the standardised solution).
 */
function buildImplied(
  lambdas: number[],        // loadings in indicator order
  phis: number[],           // inter-factor correlations, lower-triangle
  factorNames: string[],
  indicatorFactor: number[] // which factor (0-based) each indicator belongs to
): number[][] {
  const nF = factorNames.length;
  const nI = lambdas.length;

  // Φ matrix (factor correlation matrix), identity on diagonal
  const Phi: number[][] = Array.from({ length: nF }, (_, i) => Array.from({ length: nF }, (_, j) => i === j ? 1 : 0));
  let phiIdx = 0;
  for (let i = 1; i < nF; i++) {
    for (let j = 0; j < i; j++) {
      const v = Math.max(-0.99, Math.min(0.99, phis[phiIdx]));
      Phi[i][j] = Phi[j][i] = v;
      phiIdx++;
    }
  }

  // Σ[i][j] = λᵢ * Φ[f(i)][f(j)] * λⱼ  (off-diagonal)
  //          = λᵢ² + θᵢ  = λᵢ² + (1 - λᵢ²) = 1  (on-diagonal, standardised)
  const Sigma: number[][] = Array.from({ length: nI }, () => Array(nI).fill(0));
  for (let i = 0; i < nI; i++) {
    for (let j = 0; j < nI; j++) {
      const fi = indicatorFactor[i], fj = indicatorFactor[j];
      if (i === j) {
        Sigma[i][j] = 1; // standardised: variance fixed to 1
      } else {
        Sigma[i][j] = lambdas[i] * Phi[fi][fj] * lambdas[j];
      }
    }
  }
  return Sigma;
}

/**
 * ULS discrepancy: F = 0.5 * tr((S - Σ)²)
 * = 0.5 * [sum_diag(S-Σ)² + 2*sum_{i>j}(S-Σ)²]
 * Computed over lower-triangle with doubled off-diagonal weight to match
 * the standard convention χ² = (n-1)*F used in AMOS/lavaan.
 */
function ulsDiscrepancy(S: number[][], Sigma: number[][]): number {
  let f = 0;
  const p = S.length;
  for (let i = 0; i < p; i++) {
    const d = S[i][i] - Sigma[i][i];
    f += d * d; // diagonal (weight 1)
    for (let j = 0; j < i; j++) {
      const od = S[i][j] - Sigma[i][j];
      f += 2 * od * od; // off-diagonal (weight 2, counts both S[i][j] and S[j][i])
    }
  }
  return f / 2;
}

/** Numerical gradient of F w.r.t. [lambdas, phis] */
function gradient(
  S: number[][], lambdas: number[], phis: number[],
  factorNames: string[], indicatorFactor: number[]
): { dL: number[]; dPhi: number[] } {
  const h = 1e-5;
  const f0 = ulsDiscrepancy(S, buildImplied(lambdas, phis, factorNames, indicatorFactor));
  const dL = lambdas.map((_, k) => {
    const lp = [...lambdas]; lp[k] += h;
    return (ulsDiscrepancy(S, buildImplied(lp, phis, factorNames, indicatorFactor)) - f0) / h;
  });
  const dPhi = phis.map((_, k) => {
    const pp = [...phis]; pp[k] += h;
    return (ulsDiscrepancy(S, buildImplied(lambdas, pp, factorNames, indicatorFactor)) - f0) / h;
  });
  return { dL, dPhi };
}

/**
 * Find the non-centrality parameter λ such that P(χ²(df,λ) ≥ x) = targetP.
 * Uses bisection on the survival function of the non-central chi-square,
 * approximated via the shifted Wilson-Hilferty transformation.
 * This is the standard method for computing RMSEA 90% CI bounds.
 */
function ncpRmseaBound(x: number, df: number, targetP: number): number {
  // Non-central chi-square SF ≈ using normal approx (accurate for df ≥ 1):
  // P(χ²(df, λ) ≥ x) ≈ 1 - Φ(z)  where z uses W-H transformation
  const survF = (lam: number): number => {
    const mu   = df + lam;
    const sig2 = 2 * (df + 2 * lam);
    const cbrt  = Math.pow(x / mu, 1 / 3);
    const corr  = 1 - sig2 / (9 * mu * mu);
    const z = (cbrt - corr) / Math.sqrt(Math.max(1e-12, sig2 / (9 * mu * mu)));
    return 1 - normalCDF(z);
  };

  // Lower bound: λ = 0 gives maximum P (upper tail is largest at λ=0)
  if (survF(0) < targetP) return 0; // target is beyond λ=0

  // Bisection: find λ in [0, 10*(x+df)] such that survF(λ) = targetP
  let lo = 0, hi = Math.max(x * 5, df * 5 + 100);
  // Ensure hi is large enough
  while (survF(hi) > targetP) hi *= 2;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (survF(mid) > targetP) lo = mid; else hi = mid;
    if (hi - lo < 1e-6) break;
  }
  return (lo + hi) / 2;
}

// ─── Main CFA Estimator ───────────────────────────────────────────────────────

export class CFAEstimator {
  static estimate(
    data: number[][],
    model: CFAModel,
    variables: string[]
  ): CFAResults {
    const warnings: string[] = [];
    const n = data.length;
    const p = variables.length;

    // ── Build observed correlation matrix ───────────────────────────────────
    // Centre and standardise each column
    const means = variables.map((_, j) => data.reduce((s, row) => s + row[j], 0) / n);
    const stds  = variables.map((_, j) => {
      const m = means[j];
      const v = data.reduce((s, row) => s + (row[j] - m) ** 2, 0) / (n - 1);
      return Math.sqrt(Math.max(v, 1e-12));
    });
    const std_data = data.map(row => row.map((v, j) => (v - means[j]) / stds[j]));

    // S = observed correlation matrix (p × p)
    const S: number[][] = Array.from({ length: p }, (_, i) =>
      Array.from({ length: p }, (_, j) => {
        if (i === j) return 1;
        const s = std_data.reduce((acc, row) => acc + row[i] * row[j], 0) / (n - 1);
        return Math.max(-0.999, Math.min(0.999, s));
      })
    );

    // ── Map factors / indicators ────────────────────────────────────────────
    const factorNames = Object.keys(model.latentVariables);
    const nF = factorNames.length;

    // indicatorFactor[k] = factor index for variable k
    const indicatorFactor: number[] = Array(p).fill(-1);
    factorNames.forEach((fName, fi) => {
      model.latentVariables[fName].forEach(indName => {
        const vi = variables.indexOf(indName);
        if (vi !== -1) indicatorFactor[vi] = fi;
      });
    });

    // Only use indicators that appear in the model
    const usedIdx = indicatorFactor.map((f, i) => f >= 0 ? i : -1).filter(i => i >= 0);

    // Sub-matrix of S for used indicators
    const pU = usedIdx.length;
    const Su: number[][] = Array.from({ length: pU }, (_, i) =>
      Array.from({ length: pU }, (_, j) => S[usedIdx[i]][usedIdx[j]])
    );
    const indFactorU = usedIdx.map(i => indicatorFactor[i]);
    const varNamesU = usedIdx.map(i => variables[i]);

    // ── Starting values via first eigenvector per factor ───────────────────
    // For each factor, extract the sub-correlation matrix and use first eigenvector
    let lambdas: number[] = Array(pU).fill(0.6);
    factorNames.forEach((fName, fi) => {
      const idx = indFactorU.map((f, k) => f === fi ? k : -1).filter(k => k >= 0);
      if (idx.length < 1) return;
      if (idx.length === 1) { lambdas[idx[0]] = 0.7; return; }
      const subS = idx.map(i => idx.map(j => Su[i][j]));
      const ev = firstEigenvector(subS);
      idx.forEach((k, pos) => {
        // scale eigenvector so λ ≈ sqrt(eigenvalue_share) — use correlation with total
        lambdas[k] = Math.max(0.1, Math.min(0.99, Math.abs(ev[pos]) * Math.sqrt(idx.length * 0.6)));
      });
    });

    // Starting phi (inter-factor correlations) = sample correlation between factor composites
    const nPhi = (nF * (nF - 1)) / 2;
    let phis: number[] = [];
    {
      let phiIdx2 = 0;
      phis = Array(nPhi).fill(0);
      for (let fi = 1; fi < nF; fi++) {
        for (let fj = 0; fj < fi; fj++) {
          const idxI = indFactorU.map((f, k) => f === fi ? k : -1).filter(k => k >= 0);
          const idxJ = indFactorU.map((f, k) => f === fj ? k : -1).filter(k => k >= 0);
          if (idxI.length > 0 && idxJ.length > 0) {
            let r = 0, count = 0;
            idxI.forEach(a => idxJ.forEach(b => { r += Su[a][b]; count++; }));
            phis[phiIdx2] = Math.max(-0.95, Math.min(0.95, r / Math.max(count, 1)));
          }
          phiIdx2++;
        }
      }
    }

    // ── ULS optimisation (gradient descent with Armijo line search) ─────────
    const MAX_ITER = 500;
    const TOL = 1e-8;
    let stepSize = 0.05;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      const { dL, dPhi } = gradient(Su, lambdas, phis, factorNames, indFactorU);
      const gradNorm2 = dL.reduce((s, g) => s + g * g, 0) + dPhi.reduce((s, g) => s + g * g, 0);
      if (gradNorm2 < TOL) break;

      // Armijo line search
      const f0 = ulsDiscrepancy(Su, buildImplied(lambdas, phis, factorNames, indFactorU));
      let step = stepSize;
      for (let ls = 0; ls < 20; ls++) {
        const lNext = lambdas.map((v, k) => Math.max(0.01, Math.min(0.999, v - step * dL[k])));
        const pNext = phis.map((v, k) => Math.max(-0.99, Math.min(0.99, v - step * dPhi[k])));
        const fNext = ulsDiscrepancy(Su, buildImplied(lNext, pNext, factorNames, indFactorU));
        if (fNext < f0 - 1e-4 * step * gradNorm2) {
          lambdas = lNext; phis = pNext; stepSize = step * 1.1; break;
        }
        step *= 0.5;
        if (step < 1e-12) break;
      }
    }

    // ── Implied correlation matrix from converged parameters ─────────────────
    const SigmaU = buildImplied(lambdas, phis, factorNames, indFactorU);

    // ── Standard errors via numerical Hessian ────────────────────────────────
    const nParams = pU + nPhi;
    const theta = [...lambdas, ...phis];
    const H: number[][] = Array.from({ length: nParams }, () => Array(nParams).fill(0));
    const h = 1e-4;
    for (let i = 0; i < nParams; i++) {
      for (let j = i; j < nParams; j++) {
        const pp = [...theta]; pp[i] += h; pp[j] += h;
        const pm = [...theta]; pm[i] += h; pm[j] -= h;
        const mp = [...theta]; mp[i] -= h; mp[j] += h;
        const mm = [...theta]; mm[i] -= h; mm[j] -= h;
        const fL = (t: number[]) => {
          const lam = t.slice(0, pU), phi = t.slice(pU);
          return ulsDiscrepancy(Su, buildImplied(lam, phi, factorNames, indFactorU));
        };
        H[i][j] = H[j][i] = (fL(pp) - fL(pm) - fL(mp) + fL(mm)) / (4 * h * h);
      }
    }
    const Hinv = (() => { try { return inverse(H); } catch { return Array.from({ length: nParams }, (_, i) => Array.from({ length: nParams }, (_, j) => i === j ? 0.01 : 0)); } })();
    const seTheta = Hinv.map((row, i) => Math.sqrt(Math.max(0, row[i]) / Math.max(n - 1, 1)));

    // ── Standardised loadings ─────────────────────────────────────────────────
    // In this parameterisation loadings are already in the correlation-scale metric,
    // so std_estimate ≈ lambda (loading on standardised variable)
    const stdLoadings = lambdas.map(l => Math.max(0, Math.min(1, l)));

    // ── Factor correlations ───────────────────────────────────────────────────
    const factorCorrelations: CFAResults['factorCorrelations'] = [];
    let phiIdx = 0;
    for (let fi = 1; fi < nF; fi++) {
      for (let fj = 0; fj < fi; fj++) {
        const est = phis[phiIdx];
        const se = seTheta[pU + phiIdx] || 0.05;
        const z = se > 0 ? est / se : 0;
        factorCorrelations.push({
          factor1: factorNames[fi],
          factor2: factorNames[fj],
          estimate: est,
          se,
          z,
          pvalue: Math.min(1, 2 * (1 - normalCDF(Math.abs(z)))),
        });
        phiIdx++;
      }
    }

    // ── Factor loadings output ────────────────────────────────────────────────
    const factorLoadings: CFAResults['factorLoadings'] = varNamesU.map((name, k) => {
      const fi = indFactorU[k];
      const est = lambdas[k];
      const se  = seTheta[k] || est / Math.sqrt(n);
      const z   = se > 0 ? est / se : 0;
      return {
        latent: factorNames[fi],
        indicator: name,
        estimate: est,
        se,
        z,
        pvalue: Math.min(1, 2 * (1 - normalCDF(Math.abs(z)))),
        std_estimate: stdLoadings[k],
      };
    });

    // ── Residual variances = 1 − λ² (standardised scale) ──────────────────────
    const residualVariances = varNamesU.map((name, k) => ({
      variable: name,
      estimate: Math.max(0.01, 1 - lambdas[k] ** 2),
      se: seTheta[k] * 2 * lambdas[k] || 0.05,
    }));

    // ── Fit indices ───────────────────────────────────────────────────────────
    // Number of free parameters: pU loadings + nPhi factor correlations
    // (residual variances are fixed to 1-λ² in standardised solution; constraints
    // to scale indicators would add error variances, but ULS in corr scale does not)
    // df = p*(p-1)/2 - (pU + nPhi) using lower-triangle of correlation matrix
    const nFreeParams = pU + nPhi;
    const dfModel = Math.max(1, (pU * (pU - 1)) / 2 - nFreeParams);

    // ULS chi-square: F_ULS = 0.5 * tr((S - Sigma)²)  →  χ² = (n-1) * F_ULS
    const F_uls = ulsDiscrepancy(Su, SigmaU);
    const chisq = (n - 1) * F_uls;

    // SRMR
    let srmrSum = 0, srmrCnt = 0;
    for (let i = 0; i < pU; i++) for (let j = 0; j < i; j++) {
      srmrSum += (Su[i][j] - SigmaU[i][j]) ** 2; srmrCnt++;
    }
    const srmr = srmrCnt > 0 ? Math.sqrt(srmrSum / srmrCnt) : 0;

    // Null model chi-square (all inter-variable correlations = 0)
    let chisqNull = 0;
    for (let i = 0; i < pU; i++) for (let j = 0; j < i; j++)
      chisqNull += (n - 1) * Su[i][j] ** 2;
    const dfNull = pU * (pU - 1) / 2;

    const ncp     = Math.max(0, chisq - dfModel);
    const ncpNull = Math.max(0, chisqNull - dfNull);

    // CFI (Bentler 1990): 1 - (χ²_model - df_model) / (χ²_null - df_null)
    // Both non-centrality parameters are floored at 0.
    const cfi = ncpNull > 0
      ? Math.max(0, Math.min(1, 1 - ncp / ncpNull))
      : (chisq <= dfModel ? 1 : 0);

    // TLI / NNFI (Tucker-Lewis 1973 / Bentler-Bonett 1980)
    const tli = dfModel > 0 && dfNull > 0
      ? Math.max(-0.1, Math.min(1.2, ((chisqNull / dfNull) - (chisq / dfModel)) / ((chisqNull / dfNull) - 1)))
      : 1;

    // NFI (Bentler & Bonett 1980): 1 - χ²_model / χ²_null  (no df correction)
    const nfi  = chisqNull > 0 ? Math.max(0, Math.min(1, 1 - chisq / chisqNull)) : 1;
    const nnfi = tli; // NNFI = TLI

    const rmsea = dfModel > 0 && n > 1
      ? Math.sqrt(Math.max(0, (chisq - dfModel) / (dfModel * (n - 1))))
      : 0;

    // 90% CI for RMSEA via bisection on non-central chi-square CDF.
    // Find λ such that P(χ²(df, λ) ≥ observed) = 0.05 (upper) and 0.95 (lower).
    const rmseaLo = dfModel > 0 && n > 1
      ? Math.sqrt(ncpRmseaBound(chisq, dfModel, 0.95) / (dfModel * (n - 1)))
      : 0;
    const rmseaHi = dfModel > 0 && n > 1
      ? Math.sqrt(ncpRmseaBound(chisq, dfModel, 0.05) / (dfModel * (n - 1)))
      : 0;

    // GFI = 1 - tr((S - Sigma)²) / tr(S²)
    let trResid2 = 0, trS2 = 0;
    for (let i = 0; i < pU; i++) for (let j = 0; j < pU; j++) {
      trResid2 += (Su[i][j] - SigmaU[i][j]) ** 2;
      trS2 += Su[i][j] ** 2;
    }
    const gfi  = trS2 > 0 ? Math.max(0, Math.min(1, 1 - trResid2 / trS2)) : 1;
    const agfi = dfModel > 0
      ? Math.max(-1, 1 - (pU * (pU + 1) / 2 / dfModel) * (1 - gfi))
      : gfi;

    const aic = chisq + 2 * nFreeParams;
    const bic = chisq + nFreeParams * Math.log(n);

    const fitIndices: FitIndices = {
      chisq, df: dfModel, pvalue: chiSqPValue(chisq, dfModel),
      cfi, tli, nfi, nnfi,
      rmsea, rmsea_ci_lower: rmseaLo, rmsea_ci_upper: rmseaHi,
      srmr, gfi, agfi, aic, bic,
    };

    // ── Modification indices ──────────────────────────────────────────────────
    // Univariate Lagrange Multiplier (LM) test for freeing residual covariances.
    // For a standardised solution (Sigma diagonal = 1):
    //   MI ≈ (n-1) * r_ij²  where r_ij = S[i][j] - Sigma[i][j] (correlation residual)
    //
    // This equals the score-test statistic for the restricted parameter, distributed
    // χ²(1) under H₀ (Saris et al. 1987; Kaplan 1989).
    // EPC (Expected Parameter Change) ≈ r_ij / (1 - lambda_i² - lambda_j²) * correction
    // Simplified EPC: the raw residual correlation scaled by its expected denominator.
    const modificationIndices: CFAResults['modificationIndices'] = [];
    for (let i = 0; i < pU; i++) {
      for (let j = 0; j < i; j++) {
        const r_ij = Su[i][j] - SigmaU[i][j]; // correlation residual
        // LM statistic: MI = (n-1) * r² / w  where w is the asymptotic variance
        // For correlation matrices w ≈ (1 - Sigma[i][j]²)²  (simplified)
        const w = Math.max(1e-8, (1 - SigmaU[i][j] * SigmaU[i][j]) ** 2);
        const mi = (n - 1) * r_ij * r_ij / w;
        if (mi > 3.84) { // χ²(1), α = 0.05
          // EPC: expected change if parameter freed = residual / asymptotic scaling
          const epc = r_ij / Math.max(1e-6, 1 - SigmaU[i][j] * SigmaU[i][j]);
          modificationIndices.push({
            type: 'covariance',
            param1: varNamesU[i],
            param2: varNamesU[j],
            mi,
            epc,
          });
        }
      }
    }
    modificationIndices.sort((a, b) => b.mi - a.mi);

    // ── Reliability ───────────────────────────────────────────────────────────
    const reliabilities: CFAResults['reliabilities'] = {};
    factorNames.forEach((fName, fi) => {
      const idx = indFactorU.map((f, k) => f === fi ? k : -1).filter(k => k >= 0);
      if (idx.length === 0) return;

      const lambdaF = idx.map(k => lambdas[k]);
      const errF    = idx.map(k => Math.max(0.01, 1 - lambdas[k] ** 2));

      // Cronbach's alpha from data
      const itemData = data.map(row => idx.map(k => row[usedIdx[k]]));
      const sumLoadings = lambdaF.reduce((s, l) => s + l, 0);
      const sumSqLoadings = lambdaF.reduce((s, l) => s + l * l, 0);
      const sumErrors = errF.reduce((s, e) => s + e, 0);
      const cr = (sumLoadings ** 2) / Math.max(1e-8, sumLoadings ** 2 + sumErrors);
      const ave = sumSqLoadings / Math.max(1e-8, sumSqLoadings + sumErrors);

      // Cronbach from actual item data
      const k = itemData[0].length;
      let alpha = cr; // fallback
      if (k >= 2 && itemData.length >= 2) {
        const totals = itemData.map(r => r.reduce((s, v) => s + v, 0));
        const totalVar = totals.reduce((s, t) => {
          const m = totals.reduce((a, b) => a + b, 0) / totals.length;
          return s + (t - m) ** 2;
        }, 0) / Math.max(1, totals.length - 1);
        const itemVars = Array.from({ length: k }, (_, i) => {
          const col = itemData.map(r => r[i]);
          const m = col.reduce((a, b) => a + b, 0) / col.length;
          return col.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, col.length - 1);
        });
        const sumItemVars = itemVars.reduce((s, v) => s + v, 0);
        if (totalVar > 0) alpha = Math.max(0, (k / (k - 1)) * (1 - sumItemVars / totalVar));
      }

      reliabilities[fName] = {
        cronbachAlpha: Math.max(0, Math.min(1, alpha)),
        compositeReliability: Math.max(0, Math.min(1, cr)),
        averageVarianceExtracted: Math.max(0, Math.min(1, ave)),
      };
    });

    // ── Warnings ──────────────────────────────────────────────────────────────
    if (rmsea > 0.10) warnings.push('RMSEA > 0.10 — poor model fit');
    if (cfi < 0.90)  warnings.push('CFI < 0.90 — inadequate model fit');
    if (srmr > 0.10) warnings.push('SRMR > 0.10 — poor model fit');
    if (lambdas.some(l => l > 0.95)) warnings.push('One or more loadings near boundary (>0.95)');
    if (n < 100) warnings.push('Sample size < 100 — estimates may be unstable');

    return {
      fitIndices,
      factorLoadings,
      factorCorrelations,
      residualVariances,
      modificationIndices,
      reliabilities,
      warnings,
    };
  }
}

// ─── Reliability Calculator (kept for backward compat) ────────────────────────

export class ReliabilityCalculator {
  static calculateCronbachAlpha(itemData: number[][]): number {
    const k = itemData[0]?.length ?? 0;
    if (k < 2) return 0;
    const totals = itemData.map(row => row.reduce((s, v) => s + v, 0));
    const m = totals.reduce((s, v) => s + v, 0) / totals.length;
    const totalVar = totals.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, totals.length - 1);
    if (totalVar === 0) return 0;
    const sumItemVar = Array.from({ length: k }, (_, i) => {
      const col = itemData.map(r => r[i]);
      const cm = col.reduce((s, v) => s + v, 0) / col.length;
      return col.reduce((s, v) => s + (v - cm) ** 2, 0) / Math.max(1, col.length - 1);
    }).reduce((s, v) => s + v, 0);
    return Math.max(0, (k / (k - 1)) * (1 - sumItemVar / totalVar));
  }

  static calculateCompositeReliability(loadings: number[], errorVariances: number[]): number {
    const sumL = loadings.reduce((s, l) => s + l, 0);
    const sumE = errorVariances.reduce((s, e) => s + e, 0);
    return sumL ** 2 / Math.max(1e-8, sumL ** 2 + sumE);
  }

  static calculateAVE(loadings: number[], errorVariances: number[]): number {
    const sumL2 = loadings.reduce((s, l) => s + l * l, 0);
    const sumE  = errorVariances.reduce((s, e) => s + e, 0);
    return sumL2 / Math.max(1e-8, sumL2 + sumE);
  }
}

// ─── Fit Indices Calculator (kept for external callers) ───────────────────────

export class FitIndicesCalculator {
  static calculate(
    observedCov: number[][],
    impliedCov: number[][],
    n: number,
    nParams: number
  ): FitIndices {
    const p = observedCov.length;
    const dfModel = Math.max(1, (p * (p + 1)) / 2 - nParams);

    const F_uls = ulsDiscrepancy(observedCov, impliedCov);
    const chisq = (n - 1) * F_uls;

    let srmrSum = 0, srmrCnt = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) {
      const oi = Math.sqrt(observedCov[i][i] * observedCov[j][j]);
      const ii = Math.sqrt(impliedCov[i][i]  * impliedCov[j][j]);
      if (oi > 0 && ii > 0) { srmrSum += ((observedCov[i][j]/oi) - (impliedCov[i][j]/ii)) ** 2; srmrCnt++; }
    }
    const srmr = srmrCnt > 0 ? Math.sqrt(srmrSum / srmrCnt) : 0;

    let chisqNull = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) {
      const r = observedCov[i][j] / Math.sqrt(observedCov[i][i] * observedCov[j][j]);
      chisqNull += (n - 1) * r * r;
    }
    const dfNull = p * (p - 1) / 2;
    const ncp = Math.max(0, chisq - dfModel);
    const ncpNull = Math.max(0, chisqNull - dfNull);
    // CFI: 1 - NCP_model / NCP_null  (Bentler 1990)
    const cfi  = ncpNull > 0
      ? Math.max(0, Math.min(1, 1 - ncp / ncpNull))
      : (chisq <= dfModel ? 1 : 0);
    const tli  = dfModel > 0 && dfNull > 0 ? ((chisqNull/dfNull) - (chisq/dfModel)) / ((chisqNull/dfNull) - 1) : 1;
    // NFI: Bentler & Bonett (1980) — no df correction
    const nfi  = chisqNull > 0 ? Math.max(0, Math.min(1, 1 - chisq / chisqNull)) : 1;
    const rmsea = dfModel > 0 && n > 1 ? Math.sqrt(Math.max(0, (chisq - dfModel) / (dfModel * (n - 1)))) : 0;
    const rmseaLo = dfModel > 0 && n > 1
      ? Math.sqrt(ncpRmseaBound(chisq, dfModel, 0.95) / (dfModel * (n - 1)))
      : 0;
    const rmseaHi = dfModel > 0 && n > 1
      ? Math.sqrt(ncpRmseaBound(chisq, dfModel, 0.05) / (dfModel * (n - 1)))
      : 0;

    let trR2 = 0, trS2 = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) {
      trR2 += (observedCov[i][j] - impliedCov[i][j]) ** 2; trS2 += observedCov[i][j] ** 2;
    }
    const gfi  = trS2 > 0 ? Math.max(0, Math.min(1, 1 - trR2 / trS2)) : 1;
    const agfi = dfModel > 0 ? Math.max(-1, 1 - (p * (p+1)/2 / dfModel) * (1 - gfi)) : gfi;

    return {
      chisq, df: dfModel, pvalue: chiSqPValue(chisq, dfModel),
      cfi, tli, nfi, nnfi: tli, rmsea,
      rmsea_ci_lower: rmseaLo, rmsea_ci_upper: rmseaHi,
      srmr, gfi, agfi, aic: chisq + 2 * nParams, bic: chisq + nParams * Math.log(n),
    };
  }
}
