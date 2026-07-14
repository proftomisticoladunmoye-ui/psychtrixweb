/**
 * Structural Equation Modeling (SEM) — Two-stage estimator
 *
 * Stage 1 – Measurement model: Pearson r of each indicator with its
 *           unit-weighted, standardised composite factor score.
 * Stage 2 – Structural model: OLS on standardised factor scores.
 *
 * Fit indices: ULS discrepancy on the correlation matrix.
 * Σ = Λ · Φ · Λᵀ  (standardised solution, unit diagonal).
 */

import { MatrixOps } from './psychometricStats';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface SEMModel {
  measurementModel: { [latentVar: string]: string[] };
  structuralPaths:  Array<{ from: string; to: string }>;
}

export interface ModificationIndex {
  param:    string;
  mi:       number;
  epc:      number;
  std_epc:  number;
  type:     'loading' | 'covariance' | 'path';
}

export interface SEMResults {
  fitIndices: {
    chisq: number; df: number; pvalue: number; chisq_df_ratio: number;
    cfi: number; tli: number; rmsea: number;
    rmsea_ci_lower: number; rmsea_ci_upper: number;
    srmr: number; wrmr: number;
    aic: number; bic: number;
    gfi: number; agfi: number; nfi: number; nnfi: number;
    pgfi: number; pnfi: number;
    chisqNull: number; dfNull: number;
  };
  measurementModel: {
    factorLoadings: Array<{
      item: string; factor: string;
      loading: number; se: number; z: number; pvalue: number;
      std_loading: number; r_squared: number;
    }>;
    reliability: {
      [factor: string]: {
        cronbach_alpha: number; composite_reliability: number; ave: number;
        maxSharedVariance: number; averageSharedVariance: number;
      };
    };
    htmt: { [pair: string]: number };
  };
  structuralModel: {
    paths: Array<{
      from: string; to: string;
      coefficient: number; se: number; z: number; pvalue: number; std_coefficient: number;
    }>;
    rSquared: { [variable: string]: number };
    effects: {
      direct:   Map<string, { effect: number; se: number; pvalue: number }>;
      indirect: Map<string, { effect: number; se: number; pvalue: number; via: string }>;
      total:    Map<string, { effect: number; se: number; pvalue: number }>;
    };
  };
  mediation: Array<{
    iv: string; mediator: string; dv: string;
    directEffect: number; indirectEffect: number; totalEffect: number;
    proportion: number; sobelZ: number; sobelP: number;
    bootstrapCI: [number, number];
    mediationType: 'full' | 'partial' | 'none';
  }>;
  diagnostics: {
    modificationIndices:   ModificationIndex[];
    standardisedResiduals: Array<{ row: string; col: string; residual: number }>;
    heywoodCases:          Array<{ item: string; loading: number; issue: string }>;
    identificationStatus:  { identified: boolean; tRule: boolean; details: string };
    factorScoreDeterminacy: { [factor: string]: number };
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function chiSqPValue(chi2: number, df: number): number {
  if (chi2 <= 0 || df <= 0) return 1;
  const a = df / 2, x = chi2 / 2;
  const cbrtX = Math.pow(x / a, 1 / 3);
  const corr  = 1 - 1 / (9 * a);
  const sigma = Math.sqrt(1 / (9 * a));
  return Math.max(0, Math.min(1, 1 - normalCDF((cbrtX - corr) / sigma)));
}

/** NCP such that P(χ²(df,λ) ≥ x) = targetP via bisection (WH approx). */
function ncpBound(x: number, df: number, targetP: number): number {
  const survF = (lam: number) => {
    const mu   = df + lam;
    const sig2 = 2 * (df + 2 * lam);
    const h    = sig2 / (2 * mu * mu);
    const corr = 1 - h;
    const sig  = Math.sqrt(Math.max(1e-12, h));
    const cbrt = Math.pow(Math.max(0, x) / mu, 1 / 3);
    return 1 - normalCDF((cbrt - corr) / sig);
  };
  if (survF(0) < targetP) return 0;
  let lo = 0, hi = Math.max(x * 5, df * 5 + 100);
  while (survF(hi) > targetP) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (survF(mid) > targetP) lo = mid; else hi = mid;
    if (hi - lo < 1e-6) break;
  }
  return (lo + hi) / 2;
}

function pearsonR(x: number[], y: number[]): number {
  const n  = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den < 1e-12 ? 0 : Math.max(-0.9999, Math.min(0.9999, num / den));
}

function standardise(v: number[]): number[] {
  const n = v.length;
  const m = v.reduce((a, b) => a + b, 0) / n;
  const s = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(n - 1, 1));
  return s < 1e-12 ? v.map(() => 0) : v.map(x => (x - m) / s);
}

// ── SEM Estimator ─────────────────────────────────────────────────────────────

export class SEMEstimator {

  static estimate(data: number[][], model: SEMModel, variableNames: string[]): SEMResults {
    const n = data.length;

    // 1. Observed correlation matrix (p indicators)
    const allInds = [...new Set(Object.values(model.measurementModel).flat())];
    const indIdx  = allInds.map(v => variableNames.indexOf(v)).filter(i => i >= 0);
    const indData = data.map(row => indIdx.map(i => row[i]));
    const p = indIdx.length;
    const S: number[][] = Array.from({ length: p }, (_, i) =>
      Array.from({ length: p }, (_, j) =>
        i === j ? 1 : pearsonR(indData.map(r => r[i]), indData.map(r => r[j]))
      )
    );

    // 2. Factor scores
    const factorNames  = Object.keys(model.measurementModel);
    const factorScores = this.buildFactorScores(data, model, variableNames);

    // 3. Measurement model (loadings, reliability)
    const measResult = this.estimateMeasurementModel(data, model.measurementModel, variableNames, n);

    // 4. Structural model (OLS on factor scores)
    const structResult = this.estimateStructuralModel(factorScores, model.structuralPaths, factorNames, n);

    // 5. Factor correlation matrix (empirical from factor scores)
    const Phi = this.buildFactorCorrelation(factorScores, factorNames);

    // 6. Extended reliability (MSV, ASV) using Phi
    const reliabilityExt = this.extendReliability(measResult.reliability, Phi, factorNames);

    // 7. HTMT
    const htmt = this.computeHTMT(allInds, model.measurementModel, S, factorNames);

    // 8. Model-implied correlation matrix Σ = Λ·Φ·Λᵀ
    const Sigma = this.buildImpliedCorrelation(
      allInds, model.measurementModel, measResult.factorLoadings, Phi, factorNames, p
    );

    // 9. Fit indices
    const nParams  = this.countParameters(model);
    const fitIndices = this.computeFitIndices(S, Sigma, n, nParams, p);

    // 10. Mediation
    const mediation = this.analyzeMediation(structResult.paths, model.structuralPaths);

    // 11. Diagnostics
    const diagnostics = this.computeDiagnostics(
      S, Sigma, allInds, model, measResult.factorLoadings, factorNames, factorScores, p, n
    );

    return {
      fitIndices,
      measurementModel: {
        factorLoadings: measResult.factorLoadings,
        reliability: reliabilityExt,
        htmt,
      },
      structuralModel: structResult,
      mediation,
      diagnostics,
    };
  }

  // ── Factor correlation matrix from empirical factor score correlations ──────
  private static buildFactorCorrelation(
    factorScores: { [f: string]: number[] },
    factorNames: string[]
  ): number[][] {
    const nF = factorNames.length;
    return Array.from({ length: nF }, (_, i) =>
      Array.from({ length: nF }, (_, j) => {
        if (i === j) return 1;
        const a = factorScores[factorNames[i]], b = factorScores[factorNames[j]];
        return (!a || !b) ? 0 : pearsonR(a, b);
      })
    );
  }

  // ── Measurement model ────────────────────────────────────────────────────────
  private static estimateMeasurementModel(
    data: number[][],
    measurementModel: { [k: string]: string[] },
    variableNames: string[],
    n: number
  ) {
    const factorLoadings: SEMResults['measurementModel']['factorLoadings'] = [];
    const reliability: { [f: string]: { cronbach_alpha: number; composite_reliability: number; ave: number; maxSharedVariance: number; averageSharedVariance: number } } = {};

    for (const [factor, indicators] of Object.entries(measurementModel)) {
      const idxs = indicators.map(v => variableNames.indexOf(v)).filter(i => i >= 0);
      if (idxs.length === 0) continue;

      const composite = standardise(data.map(row => idxs.reduce((s, i) => s + row[i], 0) / idxs.length));
      const loadings: number[] = [];

      for (const ind of indicators) {
        const idx = variableNames.indexOf(ind);
        if (idx === -1) continue;
        const x      = standardise(data.map(r => r[idx]));
        const lam    = pearsonR(x, composite);
        const se     = Math.sqrt(Math.max(1e-12, (1 - lam * lam) ** 2 / Math.max(n - 2, 1)));
        const z      = se > 0 ? lam / se : 0;
        const pval   = Math.min(1, 2 * (1 - normalCDF(Math.abs(z))));
        factorLoadings.push({ item: ind, factor, loading: lam, se, z, pvalue: pval, std_loading: lam, r_squared: lam * lam });
        loadings.push(lam);
      }

      // Cronbach's alpha
      const itemMat = data.map(row => idxs.map(i => row[i]));
      const k = idxs.length;
      let alpha = 0;
      if (k >= 2) {
        const totals  = itemMat.map(r => r.reduce((a, b) => a + b, 0));
        const totMean = totals.reduce((a, b) => a + b, 0) / totals.length;
        const totVar  = totals.reduce((s, t) => s + (t - totMean) ** 2, 0) / Math.max(n - 1, 1);
        const sumItemVar = idxs.reduce((s, _, j) => {
          const col = itemMat.map(r => r[j]);
          const m   = col.reduce((a, b) => a + b, 0) / col.length;
          return s + col.reduce((sv, v) => sv + (v - m) ** 2, 0) / Math.max(col.length - 1, 1);
        }, 0);
        alpha = totVar > 0 ? Math.max(0, (k / (k - 1)) * (1 - sumItemVar / totVar)) : 0;
      }

      const sumAbsL = loadings.reduce((a, b) => a + Math.abs(b), 0);
      const sumL2   = loadings.reduce((a, b) => a + b * b, 0);
      const sumErr  = loadings.reduce((s, l) => s + (1 - l * l), 0);
      const cr  = sumAbsL ** 2 / Math.max(1e-8, sumAbsL ** 2 + sumErr);
      const ave = sumL2 / Math.max(1e-8, sumL2 + sumErr);

      reliability[factor] = {
        cronbach_alpha: Math.min(1, alpha),
        composite_reliability: Math.min(1, cr),
        ave: Math.min(1, ave),
        maxSharedVariance: 0,
        averageSharedVariance: 0,
      };
    }
    return { factorLoadings, reliability };
  }

  // ── Extend reliability with MSV / ASV from Phi ───────────────────────────────
  private static extendReliability(
    reliability: SEMResults['measurementModel']['reliability'],
    Phi: number[][], factorNames: string[]
  ): SEMResults['measurementModel']['reliability'] {
    const nF = factorNames.length;
    const result = { ...reliability };
    for (let i = 0; i < nF; i++) {
      const fi = factorNames[i];
      if (!result[fi]) continue;
      const sq = factorNames.map((_, j) => j !== i ? Phi[i][j] ** 2 : -1).filter(v => v >= 0);
      const msv = sq.length > 0 ? Math.max(...sq) : 0;
      const asv = sq.length > 0 ? sq.reduce((a, b) => a + b, 0) / sq.length : 0;
      result[fi] = { ...result[fi], maxSharedVariance: msv, averageSharedVariance: asv };
    }
    return result;
  }

  // ── HTMT discriminant validity ───────────────────────────────────────────────
  private static computeHTMT(
    allInds: string[],
    measurementModel: { [k: string]: string[] },
    S: number[][], factorNames: string[]
  ): { [pair: string]: number } {
    const htmt: { [pair: string]: number } = {};
    const imap = new Map<string, number>(allInds.map((v, i) => [v, i]));

    for (let fi = 0; fi < factorNames.length; fi++) {
      for (let fj = fi + 1; fj < factorNames.length; fj++) {
        const A = measurementModel[factorNames[fi]] ?? [];
        const B = measurementModel[factorNames[fj]] ?? [];
        if (!A.length || !B.length) continue;

        let cross = 0, crossN = 0;
        for (const a of A) for (const b of B) {
          const ia = imap.get(a) ?? -1, ib = imap.get(b) ?? -1;
          if (ia >= 0 && ib >= 0) { cross += Math.abs(S[ia][ib]); crossN++; }
        }

        let wA = 0, nA = 0;
        for (let a = 0; a < A.length; a++) for (let b = a + 1; b < A.length; b++) {
          const ia = imap.get(A[a]) ?? -1, ib = imap.get(A[b]) ?? -1;
          if (ia >= 0 && ib >= 0) { wA += Math.abs(S[ia][ib]); nA++; }
        }

        let wB = 0, nB = 0;
        for (let a = 0; a < B.length; a++) for (let b = a + 1; b < B.length; b++) {
          const ia = imap.get(B[a]) ?? -1, ib = imap.get(B[b]) ?? -1;
          if (ia >= 0 && ib >= 0) { wB += Math.abs(S[ia][ib]); nB++; }
        }

        const avgCross = crossN > 0 ? cross / crossN : 0;
        const avgWA    = nA > 0 ? wA / nA : 1;
        const avgWB    = nB > 0 ? wB / nB : 1;
        const denom    = Math.sqrt(avgWA * avgWB);
        htmt[`${factorNames[fi]}-${factorNames[fj]}`] = denom > 0 ? Math.round(avgCross / denom * 1000) / 1000 : 0;
      }
    }
    return htmt;
  }

  // ── Factor scores (unit-weighted, standardised) ──────────────────────────────
  private static buildFactorScores(
    data: number[][], model: SEMModel, variableNames: string[]
  ): { [f: string]: number[] } {
    const scores: { [f: string]: number[] } = {};
    for (const [factor, inds] of Object.entries(model.measurementModel)) {
      const idxs = inds.map(v => variableNames.indexOf(v)).filter(i => i >= 0);
      scores[factor] = idxs.length === 0
        ? data.map(() => 0)
        : standardise(data.map(row => idxs.reduce((s, i) => s + row[i], 0) / idxs.length));
    }
    return scores;
  }

  // ── Structural model (OLS) ───────────────────────────────────────────────────
  private static estimateStructuralModel(
    factorScores: { [f: string]: number[] },
    paths: Array<{ from: string; to: string }>,
    factors: string[], n: number
  ): SEMResults['structuralModel'] {
    const pathResults: SEMResults['structuralModel']['paths'] = [];
    const rSquared: { [k: string]: number } = {};
    const endoVars = [...new Set(paths.map(p => p.to))];

    for (const dv of endoVars) {
      const preds = paths.filter(p => p.to === dv).map(p => p.from);
      if (!preds.length || !factorScores[dv]) continue;
      const y    = factorScores[dv];
      const Xmat = preds.map(pred => factorScores[pred] ?? new Array(n).fill(0));
      const reg  = this.ols(y, Xmat, n);
      rSquared[dv] = reg.rSquared;
      preds.forEach((pred, i) => {
        const coef = reg.coefficients[i] ?? 0;
        const se   = reg.standardErrors[i] ?? 0.05;
        const z    = se > 0 ? coef / se : 0;
        pathResults.push({
          from: pred, to: dv, coefficient: coef, se, z,
          pvalue: Math.min(1, 2 * (1 - normalCDF(Math.abs(z)))),
          std_coefficient: coef,
        });
      });
    }

    return { paths: pathResults, rSquared, effects: this.decomposeEffects(pathResults) };
  }

  // ── OLS regression ───────────────────────────────────────────────────────────
  private static ols(y: number[], X: number[][], n: number) {
    const k = X.length;
    if (k === 0 || X[0]?.length !== n) return { coefficients: [], standardErrors: [], rSquared: 0 };
    const D     = Array.from({ length: n }, (_, i) => [1, ...X.map(x => x[i])]);
    const Dt    = MatrixOps.transpose(D);
    const DtD   = MatrixOps.multiply(Dt, D);
    const DtDinv = MatrixOps.inverse(DtD);
    const Dty   = Dt.map(row => row.reduce((s, v, i) => s + v * y[i], 0));
    const beta  = DtDinv.map(row => row.reduce((s, v, i) => s + v * Dty[i], 0));
    const yHat  = D.map(row => row.reduce((s, v, i) => s + v * beta[i], 0));
    const resid = y.map((v, i) => v - yHat[i]);
    const sse   = resid.reduce((s, r) => s + r * r, 0);
    const yMean = y.reduce((a, b) => a + b, 0) / n;
    const sst   = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
    const mse   = sse / Math.max(n - k - 1, 1);
    const se    = DtDinv.map((row, i) => Math.sqrt(Math.max(0, mse * row[i])));
    return {
      coefficients: beta.slice(1),
      standardErrors: se.slice(1),
      rSquared: Math.max(0, 1 - sse / Math.max(sst, 1e-12)),
    };
  }

  // ── Effects decomposition with Sobel SE ──────────────────────────────────────
  private static decomposeEffects(paths: SEMResults['structuralModel']['paths']) {
    const direct   = new Map<string, { effect: number; se: number; pvalue: number }>();
    const indirect = new Map<string, { effect: number; se: number; pvalue: number; via: string }>();
    const total    = new Map<string, { effect: number; se: number; pvalue: number }>();

    paths.forEach(p => {
      const k = `${p.from}->${p.to}`;
      direct.set(k, { effect: p.std_coefficient, se: p.se, pvalue: p.pvalue });
      total.set(k,  { effect: p.std_coefficient, se: p.se, pvalue: p.pvalue });
    });

    for (const p1 of paths) {
      for (const p2 of paths) {
        if (p1.to !== p2.from) continue;
        const k    = `${p1.from}->${p2.to}`;
        const a    = p1.std_coefficient, b = p2.std_coefficient;
        const ind  = a * b;
        const seI  = Math.sqrt(b * b * p1.se ** 2 + a * a * p2.se ** 2);
        const z    = seI > 0 ? ind / seI : 0;
        const pval = Math.min(1, 2 * (1 - normalCDF(Math.abs(z))));
        const prev = indirect.get(k);
        indirect.set(k, {
          effect: (prev?.effect ?? 0) + ind,
          se: Math.sqrt(((prev?.se ?? 0) ** 2) + seI ** 2),
          pvalue: pval, via: p1.to,
        });
        const prevT = total.get(k);
        total.set(k, {
          effect: (prevT?.effect ?? 0) + ind,
          se: Math.sqrt(((prevT?.se ?? 0) ** 2) + seI ** 2),
          pvalue: pval,
        });
      }
    }
    return { direct, indirect, total };
  }

  // ── Model-implied correlation matrix Σ = Λ·Φ·Λᵀ ─────────────────────────────
  private static buildImpliedCorrelation(
    allInds: string[], measurementModel: { [k: string]: string[] },
    factorLoadings: SEMResults['measurementModel']['factorLoadings'],
    Phi: number[][], factorNames: string[], p: number
  ): number[][] {
    const lambdaMap = new Map<string, number>();
    factorLoadings.forEach(fl => lambdaMap.set(fl.item, fl.std_loading));
    const indFactor = new Map<string, string>();
    Object.entries(measurementModel).forEach(([f, inds]) => inds.forEach(ind => indFactor.set(ind, f)));
    return Array.from({ length: p }, (_, i) =>
      Array.from({ length: p }, (_, j) => {
        if (i === j) return 1;
        const fi = factorNames.indexOf(indFactor.get(allInds[i]) ?? '');
        const fj = factorNames.indexOf(indFactor.get(allInds[j]) ?? '');
        if (fi < 0 || fj < 0) return 0;
        return (lambdaMap.get(allInds[i]) ?? 0) * Phi[fi][fj] * (lambdaMap.get(allInds[j]) ?? 0);
      })
    );
  }

  // ── Fit indices ───────────────────────────────────────────────────────────────
  private static computeFitIndices(
    S: number[][], Sigma: number[][], n: number, nParams: number, p: number
  ): SEMResults['fitIndices'] {
    const nMoments = p * (p - 1) / 2;
    const dfModel  = Math.max(1, nMoments - nParams);

    let F = 0;
    for (let i = 0; i < p; i++) {
      F += (S[i][i] - Sigma[i][i]) ** 2;
      for (let j = 0; j < i; j++) F += 2 * (S[i][j] - Sigma[i][j]) ** 2;
    }
    F /= 2;
    const chisq = (n - 1) * F;

    let chisqNull = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < i; j++)
      chisqNull += (n - 1) * S[i][j] ** 2;
    const dfNull  = nMoments;
    const ncp     = Math.max(0, chisq - dfModel);
    const ncpNull = Math.max(0, chisqNull - dfNull);

    const cfi = ncpNull > 0
      ? Math.max(0, Math.min(1, 1 - ncp / ncpNull))
      : (chisq <= dfModel ? 1 : 0);

    const tli = dfModel > 0 && dfNull > 0
      ? Math.max(-0.1, Math.min(1.2,
          ((chisqNull / dfNull) - (chisq / dfModel)) / ((chisqNull / dfNull) - 1)))
      : 1;

    const nfi  = chisqNull > 0 ? Math.max(0, Math.min(1, 1 - chisq / chisqNull)) : 1;
    const nnfi = tli;

    const rmsea   = dfModel > 0 && n > 1 ? Math.sqrt(Math.max(0, (chisq - dfModel) / (dfModel * (n - 1)))) : 0;
    const rmseaLo = dfModel > 0 && n > 1 ? Math.sqrt(ncpBound(chisq, dfModel, 0.95) / (dfModel * (n - 1))) : 0;
    const rmseaHi = dfModel > 0 && n > 1 ? Math.sqrt(ncpBound(chisq, dfModel, 0.05) / (dfModel * (n - 1))) : 0;

    let srmrSum = 0, srmrCnt = 0, wrmrSum = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) {
      const d   = S[i][j] - Sigma[i][j];
      const varS = Math.max(1e-8, (1 - S[i][j] ** 2) ** 2 / Math.max(n - 2, 1));
      srmrSum += d ** 2; wrmrSum += d ** 2 / varS; srmrCnt++;
    }
    const srmr = srmrCnt > 0 ? Math.sqrt(srmrSum / srmrCnt) : 0;
    const wrmr = srmrCnt > 0 ? Math.sqrt(wrmrSum / srmrCnt) : 0;

    let trR2 = 0, trS2 = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) {
      trR2 += (S[i][j] - Sigma[i][j]) ** 2; trS2 += S[i][j] ** 2;
    }
    const gfi  = trS2 > 0 ? Math.max(0, Math.min(1, 1 - trR2 / trS2)) : 1;
    const agfi = dfModel > 0 ? Math.max(-1, 1 - (p * (p + 1) / 2 / dfModel) * (1 - gfi)) : gfi;
    const pgfi = gfi * dfModel / Math.max(1, nMoments);
    const pnfi = nfi * dfModel / Math.max(1, dfNull);
    const aic  = chisq + 2 * nParams;
    const bic  = chisq + nParams * Math.log(n);

    return {
      chisq, df: dfModel, pvalue: chiSqPValue(chisq, dfModel),
      chisq_df_ratio: dfModel > 0 ? chisq / dfModel : 0,
      cfi, tli, rmsea, rmsea_ci_lower: rmseaLo, rmsea_ci_upper: rmseaHi,
      srmr, wrmr, aic, bic, gfi, agfi, nfi, nnfi, pgfi, pnfi,
      chisqNull, dfNull,
    };
  }

  // ── Parameter count (correlation-structure model) ─────────────────────────────
  // Free parameters: (k-1) loadings per factor + structural paths + exo factor correlations
  // + disturbance variances for endogenous factors (one per endo factor)
  private static countParameters(model: SEMModel): number {
    let count = 0;
    for (const inds of Object.values(model.measurementModel))
      count += Math.max(0, inds.length - 1);
    count += model.structuralPaths.length;
    const endo = new Set(model.structuralPaths.map(p => p.to));
    const exo  = Object.keys(model.measurementModel).filter(f => !endo.has(f));
    count += exo.length * (exo.length - 1) / 2;
    // Disturbance (residual) variance for each endogenous factor
    count += endo.size;
    return count;
  }

  // ── Modification indices (LM-test on off-diagonal residuals) ─────────────────
  private static computeModificationIndices(
    S: number[][], Sigma: number[][], allInds: string[],
    measurementModel: { [k: string]: string[] },
    _factorNames: string[], n: number, p: number
  ): ModificationIndex[] {
    const indFactor = new Map<string, string>();
    Object.entries(measurementModel).forEach(([f, inds]) => inds.forEach(ind => indFactor.set(ind, f)));
    const result: ModificationIndex[] = [];
    for (let i = 0; i < p; i++) {
      for (let j = i + 1; j < p; j++) {
        if (indFactor.get(allInds[i]) === indFactor.get(allInds[j])) continue;
        const resid = S[i][j] - Sigma[i][j];
        const varS  = Math.max(1e-8, (1 - S[i][j] ** 2) ** 2 / Math.max(n - 2, 1));
        const mi    = Math.max(0, (n - 1) * resid ** 2 / (2 * varS));
        const std   = resid * Math.sqrt(Math.max(0, (1 - Sigma[i][i]) * (1 - Sigma[j][j])));
        result.push({ param: `${allInds[i]} ~~ ${allInds[j]}`, mi, epc: resid, std_epc: std, type: 'covariance' });
      }
    }
    return result.sort((a, b) => b.mi - a.mi).slice(0, 20);
  }

  // ── Standardised residuals ────────────────────────────────────────────────────
  private static computeStandardisedResiduals(
    S: number[][], Sigma: number[][], allInds: string[], n: number, p: number
  ): Array<{ row: string; col: string; residual: number }> {
    const result: Array<{ row: string; col: string; residual: number }> = [];
    for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) {
      const raw = S[i][j] - Sigma[i][j];
      const se  = Math.sqrt(Math.max(1e-12, (1 - S[i][j] ** 2) ** 2 / Math.max(n - 2, 1)));
      result.push({ row: allInds[i], col: allInds[j], residual: Math.round(se > 0 ? raw / se * 1000 : 0) / 1000 });
    }
    return result.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual)).slice(0, 30);
  }

  // ── Heywood case detection ────────────────────────────────────────────────────
  private static detectHeywoodCases(
    factorLoadings: SEMResults['measurementModel']['factorLoadings']
  ): Array<{ item: string; loading: number; issue: string }> {
    const cases: Array<{ item: string; loading: number; issue: string }> = [];
    for (const fl of factorLoadings) {
      if (Math.abs(fl.std_loading) > 0.999)
        cases.push({ item: fl.item, loading: fl.std_loading, issue: `|Loading| ≥ 1.0 (Heywood case)` });
      else if (fl.std_loading < 0)
        cases.push({ item: fl.item, loading: fl.std_loading, issue: 'Negative loading (check item polarity)' });
      else if (fl.std_loading < 0.1)
        cases.push({ item: fl.item, loading: fl.std_loading, issue: 'Very low loading (< 0.10)' });
      else if (fl.r_squared < 0.1)
        cases.push({ item: fl.item, loading: fl.std_loading, issue: 'Poor communality (R² < 0.10)' });
    }
    return cases;
  }

  // ── Model identification check ────────────────────────────────────────────────
  private static checkIdentification(model: SEMModel, p: number): { identified: boolean; tRule: boolean; details: string } {
    const nMoments = p * (p - 1) / 2;
    const nParams  = this.countParameters(model);
    const df       = nMoments - nParams;
    const tRule    = df >= 0;
    const issues: string[] = [];
    const nF = Object.keys(model.measurementModel).length;
    for (const [factor, inds] of Object.entries(model.measurementModel)) {
      const min = nF === 1 ? 3 : 2;
      if (inds.length < min)
        issues.push(`${factor}: ${inds.length} indicator(s), need ≥ ${min}`);
    }
    return {
      identified: tRule && issues.length === 0,
      tRule,
      details: `t-rule: ${nMoments} moments, ${nParams} params, df = ${df}${issues.length ? `. Issues: ${issues.join('; ')}` : '. Model appears identified.'}`,
    };
  }

  // ── Factor score determinacy ──────────────────────────────────────────────────
  private static computeFactorScoreDeterminacy(
    factorLoadings: SEMResults['measurementModel']['factorLoadings']
  ): { [f: string]: number } {
    const fsd: { [f: string]: number } = {};
    const byFactor = new Map<string, number[]>();
    factorLoadings.forEach(fl => {
      if (!byFactor.has(fl.factor)) byFactor.set(fl.factor, []);
      byFactor.get(fl.factor)!.push(fl.std_loading);
    });
    for (const [fi, loads] of byFactor.entries()) {
      const sumL2  = loads.reduce((s, l) => s + l * l, 0);
      const sumErr = loads.reduce((s, l) => s + (1 - l * l), 0);
      fsd[fi] = Math.min(1, Math.sqrt(Math.max(0, sumL2 / Math.max(1e-8, sumL2 + sumErr))));
    }
    return fsd;
  }

  // ── All diagnostics ───────────────────────────────────────────────────────────
  private static computeDiagnostics(
    S: number[][], Sigma: number[][], allInds: string[],
    model: SEMModel,
    factorLoadings: SEMResults['measurementModel']['factorLoadings'],
    factorNames: string[], factorScores: { [f: string]: number[] },
    p: number, n: number
  ): SEMResults['diagnostics'] {
    return {
      modificationIndices: this.computeModificationIndices(S, Sigma, allInds, model.measurementModel, factorNames, n, p),
      standardisedResiduals: this.computeStandardisedResiduals(S, Sigma, allInds, n, p),
      heywoodCases: this.detectHeywoodCases(factorLoadings),
      identificationStatus: this.checkIdentification(model, p),
      factorScoreDeterminacy: this.computeFactorScoreDeterminacy(factorLoadings),
    };
  }

  // ── Mediation: Sobel test + delta-method 95% CI ───────────────────────────────
  private static analyzeMediation(
    paths: SEMResults['structuralModel']['paths'],
    _modelPaths: Array<{ from: string; to: string }>
  ): SEMResults['mediation'] {
    const results: SEMResults['mediation'] = [];
    const pathMap = new Map<string, typeof paths[0]>();
    paths.forEach(p => pathMap.set(`${p.from}->${p.to}`, p));

    for (const p1 of paths) {
      for (const p2 of paths) {
        if (p1.to !== p2.from) continue;
        const iv = p1.from, med = p1.to, dv = p2.to;
        const a = p1.std_coefficient, b = p2.std_coefficient;
        const seA = p1.se, seB = p2.se;
        const ind     = a * b;
        const seSobel = Math.sqrt(b * b * seA * seA + a * a * seB * seB);
        const sobelZ  = seSobel > 0 ? ind / seSobel : 0;
        const sobelP  = Math.min(1, 2 * (1 - normalCDF(Math.abs(sobelZ))));
        const directPath = pathMap.get(`${iv}->${dv}`);
        const direct     = directPath?.std_coefficient ?? 0;
        const total      = direct + ind;
        const prop       = total !== 0 ? ind / total : 0;
        let mediationType: 'full' | 'partial' | 'none' = 'none';
        if (sobelP < 0.05)
          mediationType = (directPath && directPath.pvalue < 0.05) ? 'partial' : 'full';

        results.push({
          iv, mediator: med, dv,
          directEffect: direct, indirectEffect: ind, totalEffect: total,
          proportion: prop, sobelZ, sobelP,
          bootstrapCI: [ind - 1.96 * seSobel, ind + 1.96 * seSobel],
          mediationType,
        });
      }
    }
    return results;
  }
}
