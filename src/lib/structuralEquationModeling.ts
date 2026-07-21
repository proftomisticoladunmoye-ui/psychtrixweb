/**
 * Structural Equation Modeling (SEM) — full-information ULS estimator
 *
 * All parameters (loadings, structural coefficients, exogenous factor
 * correlations) are estimated simultaneously by minimising the ULS
 * discrepancy F = ½·tr[(S − Σ(θ))²] on the observed correlation matrix,
 * exactly as in the CFA engine (confirmatoryFactorAnalysis.ts).
 *
 * Parameterisation (standardised solution, fixed-factor-variance
 * identification): every latent variance is 1, so estimates are directly
 * the standardised loadings/coefficients. The latent correlation matrix
 * Φ is derived from the structural model by path tracing in topological
 * order; endogenous disturbances ψₑ = 1 − explained variance are implied,
 * not free. χ² = (n−1)·F_ULS, matching the CFA/invariance modules.
 *
 * The former two-stage estimates (item–composite correlations, OLS on
 * unit-weighted factor scores) are retained only as starting values.
 */

import { MatrixOps } from './psychometricStats';
import { normalCDF, chiSqPValue, ncpRmseaBound as ncpBound } from './statDistributions';
import { polychoricMatrix, looksOrdinal } from './polychoric';

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

export interface SEMOptions {
  /** 'ULS' (Pearson) · 'DWLS' (polychoric, ordinal) · 'auto' (detect ordinal). */
  estimator?: 'ULS' | 'DWLS' | 'auto';
}

export interface SEMResults {
  estimator?: 'ULS' | 'DWLS';
  thresholds?: Array<{ variable: string; values: number[] }>;
  fitIndices: {
    chisq: number; df: number; pvalue: number; chisq_df_ratio: number;
    cfi: number; tli: number; rmsea: number;
    rmsea_ci_lower: number; rmsea_ci_upper: number;
    srmr: number; wrmr: number;
    aic: number; bic: number;
    gfi: number; agfi: number; nfi: number; nnfi: number;
    pgfi: number; pnfi: number;
    chisqNull: number; dfNull: number;
    scaled?: boolean; scalingFactor?: number;
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

// normalCDF, chiSqPValue, and ncpBound (RMSEA CI) are imported from
// statDistributions.ts — shared, verified implementations.

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

  static estimate(data: number[][], model: SEMModel, variableNames: string[], options: SEMOptions = {}): SEMResults {
    const n = data.length;

    // 1. Correlation matrix of the p indicators. Ordinal data (DWLS/auto) uses
    //    polychoric correlations + diagonal weights and a robust WLSM statistic.
    const allInds = [...new Set(Object.values(model.measurementModel).flat())];
    const indIdx  = allInds.map(v => variableNames.indexOf(v)).filter(i => i >= 0);
    const indData = data.map(row => indIdx.map(i => row[i]));
    const p = indIdx.length;

    const allOrdinal = indIdx.every(vi => looksOrdinal(data.map(r => r[vi])));
    const useDWLS = options.estimator === 'DWLS' || (options.estimator === 'auto' && allOrdinal);

    // Lower-triangle pair order (i>j, i outer) shared by weights, Γ and the objective.
    const lowerPairs: Array<[number, number]> = [];
    for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) lowerPairs.push([i, j]);
    let pairWeight: number[] | null = null;
    let Gamma: number[][] | null = null;
    let dwlsThresholds: number[][] = [];

    let S: number[][];
    if (useDWLS) {
      const poly = polychoricMatrix(data, indIdx, true);
      S = poly.R;
      dwlsThresholds = poly.thresholds;
      pairWeight = poly.asymVar.map(v => 1 / Math.max(v, 1e-8)); // ordered i>j like lowerPairs
      Gamma = poly.Gamma ?? null;
    } else {
      S = Array.from({ length: p }, (_, i) =>
        Array.from({ length: p }, (_, j) =>
          i === j ? 1 : pearsonR(indData.map(r => r[i]), indData.map(r => r[j]))
        )
      );
    }

    // 2. Warm starts: unit-weighted factor scores, item–composite loadings,
    //    OLS structural coefficients (the former two-stage estimates)
    const factorNames  = Object.keys(model.measurementModel);
    const factorScores = this.buildFactorScores(data, model, variableNames);
    const warmMeas   = this.estimateMeasurementModel(data, model.measurementModel, variableNames, n);
    const warmStruct = this.estimateStructuralModel(factorScores, model.structuralPaths, factorNames, n);
    const PhiScores  = this.buildFactorCorrelation(factorScores, factorNames);

    // 3. Full-information (D)WLS estimation of the complete SEM
    const fitted = this.fitULS(
      S, model, allInds, factorNames,
      warmMeas.factorLoadings, warmStruct.paths, PhiScores, n,
      pairWeight, Gamma, lowerPairs
    );

    // 4. Measurement model output — CR/AVE from fitted loadings, α from raw data
    const reliability    = this.rebuildReliability(warmMeas.reliability, fitted.factorLoadings, factorNames);
    const reliabilityExt = this.extendReliability(reliability, fitted.Phi, factorNames);
    const htmt = this.computeHTMT(allInds, model.measurementModel, S, factorNames);

    // 5. Structural model output from the simultaneous fit
    const structResult: SEMResults['structuralModel'] = {
      paths: fitted.paths,
      rSquared: fitted.rSquared,
      effects: this.decomposeEffects(fitted.paths),
    };

    // 6. Fit indices on the fitted implied matrix (WLSM-scaled for DWLS)
    const nParams  = this.countParameters(model);
    const fitIndices = this.computeFitIndices(S, fitted.Sigma, n, nParams, p, fitted.fitStat);

    // 7. Mediation
    const mediation = this.analyzeMediation(fitted.paths, model.structuralPaths);

    // 8. Diagnostics
    const diagnostics = this.computeDiagnostics(
      S, fitted.Sigma, allInds, model, fitted.factorLoadings, factorNames, factorScores, p, n
    );

    return {
      fitIndices,
      estimator: useDWLS ? 'DWLS' : 'ULS',
      thresholds: useDWLS ? allInds.map((item, k) => ({ variable: item, values: dwlsThresholds[k] ?? [] })) : undefined,
      measurementModel: {
        factorLoadings: fitted.factorLoadings,
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

  // ── Full-information ULS fit ─────────────────────────────────────────────────
  //
  // θ = [λ₁…λ_p, b₁…b_q, φ₁…φ_r]
  //   λ — one loading per indicator (all free; latent variances fixed to 1)
  //   b — standardised structural coefficient per path
  //   φ — correlation per exogenous-factor pair
  // Φ(b, φ) is built by path tracing in topological order; for each endogenous
  // factor e with predictors P: Φ(e,g) = Σᵢ bᵢ·Φ(Pᵢ,g) and its disturbance
  // ψₑ = 1 − ΣᵢΣⱼ bᵢbⱼΦ(Pᵢ,Pⱼ) is implied so Var(e) = 1.
  private static fitULS(
    S: number[][],
    model: SEMModel,
    allInds: string[],
    factorNames: string[],
    warmLoadings: SEMResults['measurementModel']['factorLoadings'],
    warmPaths: SEMResults['structuralModel']['paths'],
    PhiScores: number[][],
    n: number,
    pairWeight: number[] | null = null,
    Gamma: number[][] | null = null,
    lowerPairs: Array<[number, number]> = []
  ): {
    factorLoadings: SEMResults['measurementModel']['factorLoadings'];
    paths: SEMResults['structuralModel']['paths'];
    rSquared: { [f: string]: number };
    Phi: number[][];
    Sigma: number[][];
    fitStat?: { chisq: number; chisqNull: number; dfNull: number; scaled: boolean; scalingFactor: number };
  } {
    const p  = allInds.length;
    const q  = model.structuralPaths.length;
    const nF = factorNames.length;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const fIndex = new Map<string, number>(factorNames.map((f, i) => [f, i]));
    const indFactor: number[] = allInds.map(ind => {
      for (const [f, inds] of Object.entries(model.measurementModel))
        if (inds.includes(ind)) return fIndex.get(f) ?? -1;
      return -1;
    });
    const pathIdx: Array<[number, number]> = model.structuralPaths
      .map(pt => [fIndex.get(pt.from) ?? -1, fIndex.get(pt.to) ?? -1] as [number, number]);

    const endoSet = new Set(pathIdx.map(([, t]) => t).filter(t => t >= 0));
    const exoIdx  = factorNames.map((_, i) => i).filter(i => !endoSet.has(i));
    const exoPairs: Array<[number, number]> = [];
    for (let a = 1; a < exoIdx.length; a++)
      for (let b = 0; b < a; b++) exoPairs.push([exoIdx[a], exoIdx[b]]);
    const r = exoPairs.length;

    const topo = this.topoOrder(nF, pathIdx);

    // Implied latent correlation matrix + explained variance per endo factor
    const buildPhi = (betas: number[], phis: number[]) => {
      const Phi: number[][] = Array.from({ length: nF }, (_, i) =>
        Array.from({ length: nF }, (_, j) => (i === j ? 1 : 0)));
      exoPairs.forEach(([a, b], k) => { Phi[a][b] = Phi[b][a] = clamp(phis[k], -0.99, 0.99); });
      const explained: number[] = new Array(nF).fill(0);
      const done: boolean[] = new Array(nF).fill(false);
      for (const e of topo) {
        if (!endoSet.has(e)) { done[e] = true; continue; }
        const preds: Array<[number, number]> = [];
        pathIdx.forEach(([f, t], k) => { if (t === e && f >= 0) preds.push([f, k]); });
        for (let g = 0; g < nF; g++) {
          if (!done[g] || g === e) continue;
          let s = 0;
          for (const [f, k] of preds) s += betas[k] * Phi[f][g];
          Phi[e][g] = Phi[g][e] = clamp(s, -0.995, 0.995);
        }
        let ev = 0;
        for (const [f1, k1] of preds)
          for (const [f2, k2] of preds) ev += betas[k1] * betas[k2] * Phi[f1][f2];
        explained[e] = ev;
        done[e] = true;
      }
      return { Phi, explained };
    };

    const buildSigma = (lambdas: number[], betas: number[], phis: number[]) => {
      const { Phi, explained } = buildPhi(betas, phis);
      const Sigma: number[][] = Array.from({ length: p }, (_, i) =>
        Array.from({ length: p }, (_, j) => {
          if (i === j) return 1;
          const fi = indFactor[i], fj = indFactor[j];
          if (fi < 0 || fj < 0) return 0;
          return lambdas[i] * Phi[fi][fj] * lambdas[j];
        }));
      return { Sigma, Phi, explained };
    };

    // Discrepancy over the lower triangle. ULS weights every residual equally;
    // DWLS weights by 1/asymVar of the polychoric correlation (pairWeight). A
    // smooth penalty keeps the endogenous variance decompositions admissible.
    const objective = (lambdas: number[], betas: number[], phis: number[]) => {
      const { Sigma, explained } = buildSigma(lambdas, betas, phis);
      let f = 0, k = 0;
      for (let i = 0; i < p; i++)
        for (let j = 0; j < i; j++) {
          const d = S[i][j] - Sigma[i][j];
          f += (pairWeight ? pairWeight[k] : 1) * d * d;
          k++;
        }
      for (const e of endoSet) f += 100 * Math.max(0, explained[e] - 0.98) ** 2;
      return f;
    };

    // ── Warm starts from the two-stage estimates ────────────────────────────
    const lamMap = new Map<string, number>(warmLoadings.map(fl => [fl.item, fl.loading]));
    let lambdas: number[] = allInds.map(ind => clamp((lamMap.get(ind) ?? 0.6) * 0.95, -0.98, 0.98));
    const warmPathMap = new Map<string, number>(warmPaths.map(pt => [`${pt.from}->${pt.to}`, pt.coefficient]));
    let betas: number[] = model.structuralPaths.map(pt =>
      clamp(warmPathMap.get(`${pt.from}->${pt.to}`) ?? 0.3, -0.9, 0.9));
    let phis: number[] = exoPairs.map(([a, b]) => clamp(PhiScores[a]?.[b] ?? 0, -0.9, 0.9));

    // ── Gradient descent with Armijo line search (mirrors CFAEstimator) ─────
    const nPar = p + q + r;
    const unpack = (t: number[]) => ({ l: t.slice(0, p), b: t.slice(p, p + q), ph: t.slice(p + q) });
    const clampTheta = (t: number[]) => t.map((v, k) =>
      k < p ? clamp(v, -0.999, 0.999) : k < p + q ? clamp(v, -1.5, 1.5) : clamp(v, -0.99, 0.99));
    const F = (t: number[]) => { const { l, b, ph } = unpack(t); return objective(l, b, ph); };

    let theta: number[] = clampTheta([...lambdas, ...betas, ...phis]);
    const H_STEP = 1e-5;
    let stepSize = 0.05;
    for (let iter = 0; iter < 500; iter++) {
      const f0 = F(theta);
      const grad = theta.map((_, k) => {
        const tp = [...theta]; tp[k] += H_STEP;
        return (F(tp) - f0) / H_STEP;
      });
      const gradNorm2 = grad.reduce((s, g) => s + g * g, 0);
      if (gradNorm2 < 1e-8) break;
      let step = stepSize;
      let moved = false;
      for (let ls = 0; ls < 20; ls++) {
        const tNext = clampTheta(theta.map((v, k) => v - step * grad[k]));
        if (F(tNext) < f0 - 1e-4 * step * gradNorm2) {
          theta = tNext; stepSize = step * 1.1; moved = true; break;
        }
        step *= 0.5;
        if (step < 1e-12) break;
      }
      if (!moved) break;
    }
    ({ l: lambdas, b: betas, ph: phis } = unpack(theta));

    // ── Standard errors via numerical Hessian of F (CFA convention) ─────────
    const hh = 1e-4;
    const Hm: number[][] = Array.from({ length: nPar }, () => new Array(nPar).fill(0));
    for (let i = 0; i < nPar; i++) {
      for (let j = i; j < nPar; j++) {
        const pp = [...theta]; pp[i] += hh; pp[j] += hh;
        const pm = [...theta]; pm[i] += hh; pm[j] -= hh;
        const mp = [...theta]; mp[i] -= hh; mp[j] += hh;
        const mm = [...theta]; mm[i] -= hh; mm[j] -= hh;
        Hm[i][j] = Hm[j][i] = (F(pp) - F(pm) - F(mp) + F(mm)) / (4 * hh * hh);
      }
    }
    const Hinv0 = (() => { try { return MatrixOps.inverse(Hm); } catch { return null; } })();
    let seTheta: number[] = Hinv0
      ? Hinv0.map((row, i) => Math.sqrt(Math.max(0, row[i]) / Math.max(n - 1, 1)))
      : new Array(nPar).fill(0.05);

    // ── DWLS: robust SEs + mean-adjusted (WLSM) test statistic ───────────────
    let fitStat: { chisq: number; chisqNull: number; dfNull: number; scaled: boolean; scalingFactor: number } | undefined;
    if (pairWeight && Gamma && lowerPairs.length === pairWeight.length) {
      const qy = lowerPairs.length;
      // Jacobian Δ = ∂σ/∂θ over the lower-triangle implied correlations
      const base = buildSigma(...([lambdas, betas, phis] as [number[], number[], number[]])).Sigma;
      const Dj: number[][] = Array.from({ length: qy }, () => new Array(nPar).fill(0));
      const hj = 1e-5;
      for (let t = 0; t < nPar; t++) {
        const tp = [...theta]; tp[t] += hj;
        const u = unpack(tp);
        const pert = buildSigma(u.l, u.b, u.ph).Sigma;
        for (let kk = 0; kk < qy; kk++) { const [i, j] = lowerPairs[kk]; Dj[kk][t] = (pert[i][j] - base[i][j]) / hj; }
      }
      // Robust SE sandwich: acov = (4/N)·Hinv·(Δ'VΓVΔ)·Hinv, V = diag(pairWeight)
      if (Hinv0) {
        const Vd = Dj.map((row, k) => row.map(v => v * pairWeight[k]));      // VΔ (q×t)
        const GVd = Array.from({ length: qy }, (_, a) => {
          const out = new Array(nPar).fill(0);
          for (let b = 0; b < qy; b++) { const g = Gamma[a][b]; if (g !== 0) for (let t = 0; t < nPar; t++) out[t] += g * Vd[b][t]; }
          return out;
        });
        const M: number[][] = Array.from({ length: nPar }, () => new Array(nPar).fill(0));
        for (let a = 0; a < qy; a++) for (let s = 0; s < nPar; s++) { const vs = Vd[a][s]; if (vs !== 0) for (let t = 0; t < nPar; t++) M[s][t] += vs * GVd[a][t]; }
        const acov = MatrixOps.multiply(MatrixOps.multiply(Hinv0, M), Hinv0);
        seTheta = acov.map((row, i) => Math.sqrt(Math.max(0, 4 * row[i] / Math.max(n, 1))));
      }
      // WLSM scaling: c = tr(UΓ)/df, U = W⁻¹ − W⁻¹Δ(Δ'W⁻¹Δ)⁻¹Δ'W⁻¹, W = diag(Γ)
      const Wo = Gamma.map((row, k) => 1 / Math.max(row[k], 1e-12));
      const A: number[][] = Array.from({ length: nPar }, () => new Array(nPar).fill(0));
      for (let k = 0; k < qy; k++) { const w = Wo[k]; for (let s = 0; s < nPar; s++) { const ds = Dj[k][s] * w; if (ds !== 0) for (let t = 0; t < nPar; t++) A[s][t] += ds * Dj[k][t]; } }
      const Ainv = (() => { try { return MatrixOps.inverse(A); } catch { return null; } })();
      let trUG = 0;
      for (let k = 0; k < qy; k++) trUG += Wo[k] * Gamma[k][k];
      if (Ainv) {
        const B = Array.from({ length: nPar }, (_, s) => Dj.map((row, k) => row[s] * Wo[k])); // Δ'W⁻¹ (t×q)
        const GB = Array.from({ length: qy }, (_, a) => { const out = new Array(nPar).fill(0); for (let b = 0; b < qy; b++) { const g = Gamma[a][b]; if (g !== 0) for (let s = 0; s < nPar; s++) out[s] += g * B[s][b]; } return out; });
        const C: number[][] = Array.from({ length: nPar }, () => new Array(nPar).fill(0));
        for (let s = 0; s < nPar; s++) for (let a = 0; a < qy; a++) { const bsa = B[s][a]; if (bsa !== 0) for (let t = 0; t < nPar; t++) C[s][t] += bsa * GB[a][t]; }
        let t2 = 0; for (let s = 0; s < nPar; s++) for (let t = 0; t < nPar; t++) t2 += Ainv[s][t] * C[t][s];
        trUG -= t2;
      }
      const nMoments = qy;
      const dfModel = Math.max(1, nMoments - nPar);
      const c = trUG / dfModel;
      // T = Σ pairWeight·(S−Σ)² (pure residual SS, no penalty)
      let T = 0; for (let k = 0; k < qy; k++) { const [i, j] = lowerPairs[k]; const d = S[i][j] - base[i][j]; T += pairWeight[k] * d * d; }
      const chisq = c > 1e-8 ? T / c : T;
      // Baseline (independence) model, scaled the same way
      let Tnull = 0, trUGnull = 0;
      for (let k = 0; k < qy; k++) { const [i, j] = lowerPairs[k]; Tnull += pairWeight[k] * S[i][j] * S[i][j]; trUGnull += Wo[k] * Gamma[k][k]; }
      const cNull = trUGnull / Math.max(1, qy);
      fitStat = { chisq, chisqNull: cNull > 1e-8 ? Tnull / cNull : Tnull, dfNull: qy, scaled: true, scalingFactor: c };
    }

    // ── Assemble outputs ────────────────────────────────────────────────────
    const { Sigma, Phi, explained } = buildSigma(lambdas, betas, phis);

    const factorLoadings: SEMResults['measurementModel']['factorLoadings'] = [];
    allInds.forEach((item, k) => {
      const fi = indFactor[k];
      if (fi < 0) return;
      const lam  = lambdas[k];
      const se   = seTheta[k] > 1e-8 ? seTheta[k] : Math.abs(lam) / Math.sqrt(Math.max(n, 2));
      const z    = se > 0 ? lam / se : 0;
      factorLoadings.push({
        item, factor: factorNames[fi],
        loading: lam, se, z,
        pvalue: Math.min(1, 2 * (1 - normalCDF(Math.abs(z)))),
        std_loading: lam, r_squared: lam * lam,
      });
    });

    const paths: SEMResults['structuralModel']['paths'] = model.structuralPaths.map((pt, k) => {
      const b  = betas[k];
      const se = seTheta[p + k] > 1e-8 ? seTheta[p + k] : 0.05;
      const z  = se > 0 ? b / se : 0;
      return {
        from: pt.from, to: pt.to,
        coefficient: b, se, z,
        pvalue: Math.min(1, 2 * (1 - normalCDF(Math.abs(z)))),
        std_coefficient: b,
      };
    });

    const rSquared: { [f: string]: number } = {};
    endoSet.forEach(e => { rSquared[factorNames[e]] = clamp(explained[e], 0, 1); });

    return { factorLoadings, paths, rSquared, Phi, Sigma, fitStat };
  }

  // ── Topological order of factors (Kahn); cycles appended in input order ──────
  private static topoOrder(nF: number, pathIdx: Array<[number, number]>): number[] {
    const inDeg = new Array(nF).fill(0);
    const out: number[][] = Array.from({ length: nF }, () => []);
    pathIdx.forEach(([f, t]) => {
      if (f >= 0 && t >= 0) { inDeg[t]++; out[f].push(t); }
    });
    const queue: number[] = [];
    for (let i = 0; i < nF; i++) if (inDeg[i] === 0) queue.push(i);
    const order: number[] = [];
    while (queue.length) {
      const v = queue.shift()!;
      order.push(v);
      out[v].forEach(t => { if (--inDeg[t] === 0) queue.push(t); });
    }
    // Non-recursive (cyclic) remainder: append so estimation still proceeds
    for (let i = 0; i < nF; i++) if (!order.includes(i)) order.push(i);
    return order;
  }

  // ── Reliability from fitted loadings (α kept from raw item data) ─────────────
  private static rebuildReliability(
    warm: SEMResults['measurementModel']['reliability'],
    factorLoadings: SEMResults['measurementModel']['factorLoadings'],
    factorNames: string[]
  ): SEMResults['measurementModel']['reliability'] {
    const rel: SEMResults['measurementModel']['reliability'] = {};
    for (const f of factorNames) {
      const ls = factorLoadings.filter(fl => fl.factor === f).map(fl => fl.loading);
      if (!ls.length) continue;
      const sumAbs = ls.reduce((a, l) => a + Math.abs(l), 0);
      const sumL2  = ls.reduce((a, l) => a + l * l, 0);
      const sumErr = ls.reduce((a, l) => a + (1 - l * l), 0);
      rel[f] = {
        cronbach_alpha: warm[f]?.cronbach_alpha ?? 0,
        composite_reliability: Math.min(1, sumAbs ** 2 / Math.max(1e-8, sumAbs ** 2 + sumErr)),
        ave: Math.min(1, sumL2 / Math.max(1e-8, sumL2 + sumErr)),
        maxSharedVariance: 0,
        averageSharedVariance: 0,
      };
    }
    return rel;
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

  // ── Structural model (OLS) — used only for warm-start values ─────────────────
  private static estimateStructuralModel(
    factorScores: { [f: string]: number[] },
    paths: Array<{ from: string; to: string }>,
    _factors: string[], n: number
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

  // ── Fit indices ───────────────────────────────────────────────────────────────
  // `stat` overrides the χ² and baseline with the mean-adjusted (WLSM) values
  // when DWLS was used; otherwise the ULS χ² = (n−1)·F is computed here.
  private static computeFitIndices(
    S: number[][], Sigma: number[][], n: number, nParams: number, p: number,
    stat?: { chisq: number; chisqNull: number; dfNull: number; scaled: boolean; scalingFactor: number }
  ): SEMResults['fitIndices'] {
    const nMoments = p * (p - 1) / 2;
    const dfModel  = Math.max(1, nMoments - nParams);

    let chisq: number, chisqNull: number, dfNull: number;
    if (stat) {
      chisq = stat.chisq; chisqNull = stat.chisqNull; dfNull = stat.dfNull;
    } else {
      let F = 0;
      for (let i = 0; i < p; i++) {
        F += (S[i][i] - Sigma[i][i]) ** 2;
        for (let j = 0; j < i; j++) F += 2 * (S[i][j] - Sigma[i][j]) ** 2;
      }
      F /= 2;
      chisq = (n - 1) * F;
      chisqNull = 0;
      for (let i = 0; i < p; i++) for (let j = 0; j < i; j++)
        chisqNull += (n - 1) * S[i][j] ** 2;
      dfNull = nMoments;
    }
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
      scaled: stat?.scaled ?? false, scalingFactor: stat?.scalingFactor ?? 1,
    };
  }

  // ── Parameter count (standardised correlation-structure SEM) ─────────────────
  // Free parameters: one loading per indicator (latent variances fixed to 1)
  // + structural paths + exogenous-factor correlations. Endogenous disturbances
  // are implied (ψ = 1 − explained) and the unit diagonal is not fitted, so
  // neither adds free parameters. This matches the lavaan/AMOS df for the
  // equivalent covariance-metric model.
  private static countParameters(model: SEMModel): number {
    const p = new Set(Object.values(model.measurementModel).flat()).size;
    const endo = new Set(model.structuralPaths.map(pt => pt.to));
    const exo  = Object.keys(model.measurementModel).filter(f => !endo.has(f));
    return p + model.structuralPaths.length + exo.length * (exo.length - 1) / 2;
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
        // LM statistic, χ²(1) under H₀ — same convention as the CFA engine:
        // MI = (n−1)·r² / (1−σᵢⱼ²)². The former version divided by the sampling
        // variance of r (which already contains 1/n), inflating MI ≈ n-fold.
        const w   = Math.max(1e-8, (1 - Sigma[i][j] ** 2) ** 2);
        const mi  = Math.max(0, (n - 1) * resid ** 2 / w);
        const std = resid * Math.sqrt(Math.max(0, (1 - Sigma[i][i]) * (1 - Sigma[j][j])));
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
    factorNames: string[], _factorScores: { [f: string]: number[] },
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
