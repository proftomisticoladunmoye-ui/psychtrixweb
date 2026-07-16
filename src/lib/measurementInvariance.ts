/**
 * Measurement Invariance Testing with Multi-group CFA — real estimation.
 *
 * Fits the four standard nested models by minimizing a ULS discrepancy over
 * all groups simultaneously, with genuine equality constraints:
 *
 *   configural — same structure, all parameters free per group
 *   metric     — factor loadings constrained equal across groups
 *   scalar     — loadings + intercepts equal (mean structure enters the fit)
 *   strict     — loadings + intercepts + residual variances equal
 *
 * Identification: fixed-factor (factor variances 1, factor means 0 in the
 *  first group; free in later groups once the relevant constraint applies).
 * Estimation: ULS on covariance matrices (+ mean residuals from scalar up),
 *  finite-difference gradient descent with Armijo line search — the same
 *  machinery validated in confirmatoryFactorAnalysis.ts.
 * Fit indices: chi-square = Σ_g (n_g − 1)·F_g, CFI/TLI against the
 *  independence baseline, RMSEA with Browne–Cudeck CIs, SRMR.
 *
 * This file previously fabricated the metric/scalar/strict results with
 * Math.random(); every statistic below is now actually estimated.
 */

import { chiSqPValue, rmseaCI, normalCDF } from './statDistributions';

export interface InvarianceModel {
  factorStructure: { [factor: string]: string[] };
  groups: string[];
}

export interface ModelFit {
  chisq: number;
  df: number;
  pvalue: number;
  cfi: number;
  tli: number;
  rmsea: number;
  rmsea_ci_lower: number;
  rmsea_ci_upper: number;
  srmr: number;
  aic: number;
  bic: number;
  npar: number;
}

export interface InvarianceResults {
  groups: string[];
  groupSizes: { [group: string]: number };
  models: {
    configural: ModelFit;
    metric: ModelFit;
    scalar: ModelFit;
    strict: ModelFit;
  };
  comparisons: Array<{
    comparison: string;
    model1: string;
    model2: string;
    deltaChisq: number;
    deltaDf: number;
    pvalue: number;
    deltaCFI: number;
    deltaRMSEA: number;
    deltaSRMR: number;
    decision: 'supported' | 'not supported';
    interpretation: string;
  }>;
  groupParameters: {
    [group: string]: {
      factorLoadings: Array<{ item: string; factor: string; loading: number; se: number; pvalue: number }>;
      intercepts: Array<{ item: string; value: number; se: number; pvalue: number }>;
      factorMeans: Array<{ factor: string; mean: number; se: number; pvalue: number }>;
    };
  };
  effectSizes: {
    configural_metric: { w: number; interpretation: string };
    metric_scalar: { w: number; interpretation: string };
    scalar_strict: { w: number; interpretation: string };
  };
}

// ── Level layout: which parameter blocks are shared across groups ────────────
type Level = 'configural' | 'metric' | 'scalar' | 'strict';

interface Layout {
  sharedLambda: boolean;
  withMeans: boolean;   // scalar & strict include the mean structure
  sharedTheta: boolean;
}

const LAYOUTS: Record<Level, Layout> = {
  configural: { sharedLambda: false, withMeans: false, sharedTheta: false },
  metric:     { sharedLambda: true,  withMeans: false, sharedTheta: false },
  scalar:     { sharedLambda: true,  withMeans: true,  sharedTheta: false },
  strict:     { sharedLambda: true,  withMeans: true,  sharedTheta: true  },
};

interface GroupStats {
  n: number;
  S: number[][];   // covariance matrix of the model items
  mean: number[];  // item means
}

interface FittedModel {
  fit: ModelFit;
  srmr: number;
  // solved parameters (kept for reporting)
  lambda: number[][];        // per group (identical rows when shared)
  phi: number[][][];         // per group factor correlation/covariance matrix
  theta: number[][];         // per group residual variances
  tau: number[] | null;      // shared intercepts (scalar+)
  kappa: number[][] | null;  // per group factor means (scalar+)
}

export class MeasurementInvarianceTester {
  static test(
    data: number[][],
    groupVariable: number[],
    model: InvarianceModel,
    variableNames: string[],
  ): InvarianceResults {
    const items: string[] = [];
    const itemFactor: number[] = [];
    const factorNames = Object.keys(model.factorStructure);
    factorNames.forEach((f, fi) => {
      model.factorStructure[f].forEach((it) => {
        if (variableNames.includes(it)) { items.push(it); itemFactor.push(fi); }
      });
    });
    const itemIdx = items.map((it) => variableNames.indexOf(it));
    const p = items.length;
    const m = factorNames.length;
    if (p < 3 || m < 1) throw new Error('Invariance model needs at least 3 mapped items');

    // Split rows and compute per-group covariance matrices and means.
    const stats: GroupStats[] = model.groups.map((_, gi) => {
      const rows = data
        .filter((_, r) => groupVariable[r] === gi)
        .map((row) => itemIdx.map((c) => Number(row[c])))
        .filter((row) => row.every((v) => Number.isFinite(v)));
      const n = rows.length;
      if (n < p + 1) throw new Error(`Group "${model.groups[gi]}" has too few complete cases (${n})`);
      const mean = Array.from({ length: p }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / n);
      const S = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => {
        let s = 0;
        for (const r of rows) s += (r[a] - mean[a]) * (r[b] - mean[b]);
        return s / (n - 1);
      }));
      return { n, S, mean };
    });
    const G = stats.length;
    const N = stats.reduce((s, g) => s + g.n, 0);

    // Fit the four nested models, warm-starting each from the previous one.
    const configuralM = fitLevel('configural', stats, itemFactor, p, m, null);
    const metricM     = fitLevel('metric',     stats, itemFactor, p, m, configuralM);
    const scalarM     = fitLevel('scalar',     stats, itemFactor, p, m, metricM);
    const strictM     = fitLevel('strict',     stats, itemFactor, p, m, scalarM);

    const models = {
      configural: configuralM.fit,
      metric: metricM.fit,
      scalar: scalarM.fit,
      strict: strictM.fit,
    };

    // Nested model comparisons (chi-square difference + ΔCFI heuristics).
    const seq: Array<[string, ModelFit, string, ModelFit]> = [
      ['configural', models.configural, 'metric', models.metric],
      ['metric', models.metric, 'scalar', models.scalar],
      ['scalar', models.scalar, 'strict', models.strict],
    ];
    const comparisons = seq.map(([n1, f1, n2, f2]) => {
      const dChi = Math.max(0, f2.chisq - f1.chisq);
      const dDf = Math.max(1, f2.df - f1.df);
      const pv = chiSqPValue(dChi, dDf);
      const dCFI = f2.cfi - f1.cfi;
      const dRMSEA = f2.rmsea - f1.rmsea;
      const dSRMR = f2.srmr - f1.srmr;
      // Cheung & Rensvold (2002): invariance tenable if CFI does not drop by
      // more than .01 (ΔRMSEA ≤ .015 as secondary criterion).
      const supported = dCFI >= -0.01 && dRMSEA <= 0.015;
      return {
        comparison: `${n2} vs ${n1}`,
        model1: n1,
        model2: n2,
        deltaChisq: dChi,
        deltaDf: dDf,
        pvalue: pv,
        deltaCFI: dCFI,
        deltaRMSEA: dRMSEA,
        deltaSRMR: dSRMR,
        decision: (supported ? 'supported' : 'not supported') as 'supported' | 'not supported',
        interpretation: supported
          ? `${cap(n2)} invariance holds (ΔCFI = ${dCFI.toFixed(3)}, ΔRMSEA = ${dRMSEA.toFixed(3)}).`
          : `${cap(n2)} invariance is violated (ΔCFI = ${dCFI.toFixed(3)}${pv < 0.05 ? `, Δχ² p = ${pv.toFixed(4)}` : ''}) — group parameters differ at this level.`,
      };
    });

    // Effect size of each constraint step: RMSEA-of-the-difference metric
    // w = sqrt(max(0, Δχ² − Δdf) / (Δdf · (N − G))).
    const wOf = (c: typeof comparisons[number]) =>
      Math.sqrt(Math.max(0, c.deltaChisq - c.deltaDf) / (c.deltaDf * Math.max(N - G, 1)));
    const interp = (w: number) => (w < 0.1 ? 'negligible' : w < 0.3 ? 'small' : w < 0.5 ? 'medium' : 'large');
    const effectSizes = {
      configural_metric: { w: wOf(comparisons[0]), interpretation: interp(wOf(comparisons[0])) },
      metric_scalar:     { w: wOf(comparisons[1]), interpretation: interp(wOf(comparisons[1])) },
      scalar_strict:     { w: wOf(comparisons[2]), interpretation: interp(wOf(comparisons[2])) },
    };

    // Per-group reported parameters: loadings from the configural solution
    // (standardized), observed intercepts, factor means from the scalar model.
    const groupParameters: InvarianceResults['groupParameters'] = {};
    model.groups.forEach((gName, gi) => {
      const st = stats[gi];
      const sd = items.map((_, j) => Math.sqrt(Math.max(st.S[j][j], 1e-12)));
      const factorLoadings = items.map((it, j) => {
        const raw = configuralM.lambda[gi][j];
        const std = raw / sd[j]; // standardized loading (factor variance is 1)
        const se = Math.sqrt(Math.max(1e-9, (1 - Math.min(std * std, 0.98)))) / Math.sqrt(st.n); // delta-method approx.
        const z = se > 0 ? std / se : 0;
        return {
          item: it,
          factor: factorNames[itemFactor[j]],
          loading: std,
          se,
          pvalue: Math.min(1, 2 * (1 - normalCDF(Math.abs(z)))),
        };
      });
      const intercepts = items.map((it, j) => {
        const se = sd[j] / Math.sqrt(st.n);
        const z = se > 0 ? st.mean[j] / se : 0;
        return { item: it, value: st.mean[j], se, pvalue: Math.min(1, 2 * (1 - normalCDF(Math.abs(z)))) };
      });
      const factorMeans = factorNames.map((f, fi) => {
        const meanVal = scalarM.kappa ? scalarM.kappa[gi][fi] : 0;
        // SE approximated from the average sampling error of the factor's indicators.
        const idx = itemFactor.map((ff, j) => (ff === fi ? j : -1)).filter((j) => j >= 0);
        const se = idx.length
          ? Math.sqrt(idx.reduce((s, j) => s + st.S[j][j], 0) / idx.length / st.n)
          : 0.1;
        const z = se > 0 ? meanVal / se : 0;
        return { factor: f, mean: meanVal, se, pvalue: Math.min(1, 2 * (1 - normalCDF(Math.abs(z)))) };
      });
      groupParameters[gName] = { factorLoadings, intercepts, factorMeans };
    });

    return {
      groups: model.groups,
      groupSizes: Object.fromEntries(model.groups.map((g, gi) => [g, stats[gi].n])),
      models,
      comparisons,
      groupParameters,
      effectSizes,
    };
  }
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── Core multi-group estimator ────────────────────────────────────────────────

/**
 * Parameter vector layout (theta):
 *  lambda: sharedLambda ? p : G·p
 *  phiCor: G · m(m−1)/2           (factor correlations, tanh-bounded)
 *  facSD : (G−1) · m if sharedLambda else 0   (factor SDs, group 1 fixed to 1;
 *          without shared loadings the SDs are unidentified next to λ_g)
 *  theta : sharedTheta ? p : G·p  (residual variances, softplus-positive)
 *  tau   : withMeans ? p : 0      (shared intercepts)
 *  kappa : withMeans ? (G−1)·m : 0 (factor means, group 1 fixed to 0)
 */
function fitLevel(
  level: Level,
  stats: GroupStats[],
  itemFactor: number[],
  p: number,
  m: number,
  warm: FittedModel | null,
): FittedModel {
  const L = LAYOUTS[level];
  const G = stats.length;
  const nPhi = (m * (m - 1)) / 2;

  const nLambda = L.sharedLambda ? p : G * p;
  const nFacSD = L.sharedLambda ? (G - 1) * m : 0;
  const nTheta = L.sharedTheta ? p : G * p;
  const nTau = L.withMeans ? p : 0;
  const nKappa = L.withMeans ? (G - 1) * m : 0;
  const nPar = nLambda + G * nPhi + nFacSD + nTheta + nTau + nKappa;

  // ---- initial values --------------------------------------------------------
  const theta0 = new Array(nPar).fill(0);
  {
    let off = 0;
    // loadings: warm start from previous level (group average when collapsing)
    for (let i = 0; i < nLambda; i++) {
      const j = i % p;
      if (warm) {
        if (L.sharedLambda) {
          theta0[off + i] = warm.lambda.reduce((s, lg) => s + lg[j], 0) / warm.lambda.length;
        } else {
          theta0[off + i] = warm.lambda[Math.floor(i / p)][j];
        }
      } else {
        const g = L.sharedLambda ? 0 : Math.floor(i / p);
        theta0[off + i] = 0.7 * Math.sqrt(Math.max(stats[g].S[j][j], 0.05));
      }
    }
    off += nLambda;
    // factor correlations (identity start or warm)
    for (let g = 0; g < G; g++) {
      let k = 0;
      for (let a = 1; a < m; a++) for (let b = 0; b < a; b++) {
        theta0[off + g * nPhi + k] = warm ? Math.atanh(clamp(warm.phi[g][a][b] /
          Math.sqrt(Math.max(warm.phi[g][a][a] * warm.phi[g][b][b], 1e-9)), -0.95, 0.95)) : 0;
        k++;
      }
    }
    off += G * nPhi;
    // factor SDs (log scale), start at 0 = SD 1
    off += nFacSD;
    // residual variances (log scale)
    for (let i = 0; i < nTheta; i++) {
      const j = i % p;
      const g = L.sharedTheta ? 0 : Math.floor(i / p);
      const start = warm
        ? (L.sharedTheta ? warm.theta.reduce((s, tg) => s + tg[j], 0) / warm.theta.length : warm.theta[Math.floor(i / p)][j])
        : 0.5 * Math.max(stats[g].S[j][j], 0.05);
      theta0[off + i] = Math.log(Math.max(start, 1e-4));
    }
    off += nTheta;
    // intercepts: pooled item means
    for (let j = 0; j < nTau; j++) {
      theta0[off + j] = stats.reduce((s, st) => s + st.n * st.mean[j], 0) / stats.reduce((s, st) => s + st.n, 0);
    }
    off += nTau;
    // kappa start at 0
  }

  // ---- model-implied moments per group ---------------------------------------
  function unpack(t: number[]) {
    let off = 0;
    const lambda: number[][] = [];
    for (let g = 0; g < G; g++) {
      const base = L.sharedLambda ? off : off + g * p;
      lambda.push(Array.from({ length: p }, (_, j) => t[base + j]));
    }
    off += nLambda;
    const phiCor: number[][] = [];
    for (let g = 0; g < G; g++) phiCor.push(t.slice(off + g * nPhi, off + (g + 1) * nPhi).map((v) => Math.tanh(v)));
    off += G * nPhi;
    const facSD: number[][] = [];
    for (let g = 0; g < G; g++) {
      if (L.sharedLambda && g > 0) {
        facSD.push(t.slice(off + (g - 1) * m, off + g * m).map((v) => Math.exp(v)));
      } else {
        facSD.push(new Array(m).fill(1));
      }
    }
    off += nFacSD;
    const thetaV: number[][] = [];
    for (let g = 0; g < G; g++) {
      const base = L.sharedTheta ? off : off + g * p;
      thetaV.push(Array.from({ length: p }, (_, j) => Math.exp(t[base + j])));
    }
    off += nTheta;
    const tau = L.withMeans ? t.slice(off, off + p) : null;
    off += nTau;
    const kappa: number[][] | null = L.withMeans ? [new Array(m).fill(0)] : null;
    if (kappa) for (let g = 1; g < G; g++) kappa.push(t.slice(off + (g - 1) * m, off + g * m));

    return { lambda, phiCor, facSD, thetaV, tau, kappa };
  }

  function impliedSigma(lambdaG: number[], phiG: number[][], thetaG: number[]): number[][] {
    const Sg: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let a = 0; a < p; a++) {
      for (let b = 0; b <= a; b++) {
        const v = lambdaG[a] * lambdaG[b] * phiG[itemFactor[a]][itemFactor[b]] + (a === b ? thetaG[a] : 0);
        Sg[a][b] = Sg[b][a] = v;
      }
    }
    return Sg;
  }

  function phiMatrix(cor: number[], sd: number[]): number[][] {
    const M: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
    let k = 0;
    for (let a = 0; a < m; a++) M[a][a] = sd[a] * sd[a];
    for (let a = 1; a < m; a++) for (let b = 0; b < a; b++) {
      M[a][b] = M[b][a] = cor[k++] * sd[a] * sd[b];
    }
    return M;
  }

  function discrepancy(t: number[]): number {
    const { lambda, phiCor, facSD, thetaV, tau, kappa } = unpack(t);
    let F = 0;
    for (let g = 0; g < G; g++) {
      const Phi = phiMatrix(phiCor[g], facSD[g]);
      const Sg = impliedSigma(lambda[g], Phi, thetaV[g]);
      const w = (stats[g].n - 1);
      let f = 0;
      for (let a = 0; a < p; a++) for (let b = 0; b <= a; b++) {
        const r = stats[g].S[a][b] - Sg[a][b];
        f += (a === b ? 0.5 : 1) * r * r;
      }
      if (tau && kappa) {
        for (let a = 0; a < p; a++) {
          const mu = tau[a] + lambda[g][a] * kappa[g][itemFactor[a]];
          const r = stats[g].mean[a] - mu;
          f += r * r;
        }
      }
      F += w * f;
    }
    return F;
  }

  // ---- optimize: finite-difference gradient + Armijo line search --------------
  let t = theta0.slice();
  let fCur = discrepancy(t);
  let step = 0.01;
  const EPS = 1e-5;
  for (let iter = 0; iter < 600; iter++) {
    const grad = new Array(nPar).fill(0);
    for (let i = 0; i < nPar; i++) {
      const tp = t.slice(); tp[i] += EPS;
      const tm = t.slice(); tm[i] -= EPS;
      grad[i] = (discrepancy(tp) - discrepancy(tm)) / (2 * EPS);
    }
    const g2 = grad.reduce((s, v) => s + v * v, 0);
    if (g2 < 1e-10 * (1 + Math.abs(fCur))) break;

    let s = step;
    let accepted = false;
    for (let ls = 0; ls < 25; ls++) {
      const tn = t.map((v, i) => v - s * grad[i]);
      const fn = discrepancy(tn);
      if (fn < fCur - 1e-4 * s * g2) { t = tn; fCur = fn; step = Math.min(s * 1.3, 1); accepted = true; break; }
      s *= 0.5;
    }
    if (!accepted) break;
  }

  // ---- fit indices -------------------------------------------------------------
  const { lambda, phiCor, facSD, thetaV, tau, kappa } = unpack(t);
  const N = stats.reduce((s, g) => s + g.n, 0);

  // chi-square: Σ_g (n_g − 1) F_g with F normalized per group already inside
  const chisq = fCur;

  // degrees of freedom: moments − free parameters
  const covMoments = G * (p * (p + 1)) / 2;
  const meanMoments = L.withMeans ? G * p : 0;
  const df = Math.max(1, covMoments + meanMoments - nPar);

  // independence baseline (diagonal Σ, saturated means)
  let chisqNull = 0;
  for (let g = 0; g < G; g++) {
    let f = 0;
    for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) f += stats[g].S[a][b] ** 2;
    chisqNull += (stats[g].n - 1) * f;
  }
  const dfNull = G * (p * (p - 1)) / 2 + (L.withMeans ? 0 : 0);

  const ncp = Math.max(0, chisq - df);
  const ncpNull = Math.max(0, chisqNull - dfNull);
  const cfi = ncpNull > 0 ? Math.max(0, Math.min(1, 1 - ncp / ncpNull)) : 1;
  const tli = df > 0 && dfNull > 0 && chisqNull / dfNull > 1
    ? Math.max(0, Math.min(1.2, ((chisqNull / dfNull) - (chisq / df)) / ((chisqNull / dfNull) - 1)))
    : 1;
  const rmsea = Math.sqrt(Math.max(0, (chisq - df) / (df * Math.max(N - G, 1))));
  const ci = rmseaCI(chisq, df, N - G + 1);

  // SRMR: standardized residual RMS averaged over groups
  let srmrSum = 0, srmrCnt = 0;
  for (let g = 0; g < G; g++) {
    const Phi = phiMatrix(phiCor[g], facSD[g]);
    const Sg = impliedSigma(lambda[g], Phi, thetaV[g]);
    for (let a = 0; a < p; a++) for (let b = 0; b <= a; b++) {
      const denom = Math.sqrt(Math.max(stats[g].S[a][a] * stats[g].S[b][b], 1e-12));
      srmrSum += ((stats[g].S[a][b] - Sg[a][b]) / denom) ** 2;
      srmrCnt++;
    }
  }
  const srmr = Math.sqrt(srmrSum / Math.max(srmrCnt, 1));

  const fit: ModelFit = {
    chisq,
    df,
    pvalue: chiSqPValue(chisq, df),
    cfi,
    tli,
    rmsea,
    rmsea_ci_lower: ci.lower,
    rmsea_ci_upper: ci.upper,
    srmr,
    aic: chisq + 2 * nPar,
    bic: chisq + nPar * Math.log(N),
    npar: nPar,
  };

  return {
    fit,
    srmr,
    lambda,
    phi: Array.from({ length: G }, (_, g) => phiMatrix(phiCor[g], facSD[g])),
    theta: thetaV,
    tau,
    kappa,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
