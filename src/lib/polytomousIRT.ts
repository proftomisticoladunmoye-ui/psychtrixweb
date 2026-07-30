/**
 * Polytomous Item Response Theory — for ordered-categorical (Likert/rating) data.
 *
 *  • GRM  — Samejima's Graded Response Model (cumulative logits)
 *  • GPCM — Muraki's Generalized Partial Credit Model (adjacent-category logits)
 *
 * Estimation is Marginal Maximum Likelihood via the Bock–Aitkin (1981) EM
 * algorithm over a fixed N(0,1) quadrature grid — the same family (and grid) as
 * the dichotomous engine in itemResponseTheory.ts — with EAP person scoring.
 * The per-item M-step uses damped coordinate Newton steps on the expected
 * complete-data log-likelihood (numerical derivatives — robust and model-
 * agnostic across GRM/GPCM).
 */
import { normalInv } from './polychoric';

export type PolytomousModel = 'GRM' | 'GPCM';

export interface PolytomousItemParameters {
  discrimination: number; // a (slope)
  thresholds: number[];   // GRM: category boundaries b₁…b_{K−1} (ascending)
                          // GPCM: step difficulties d₁…d_{K−1}
  categories: number;     // K = number of response categories
}

export interface PolytomousItemResult {
  item: string;
  discrimination: number;
  thresholds: number[];
  categories: number;
  information: number; // item information at θ = 0
}

export interface CategoryCurve {
  item: string;
  abilityLevels: number[];
  categoryProbs: number[][]; // categoryProbs[k] = P(X=k | θ) across abilityLevels
}

export interface PolytomousIRTResults {
  model: PolytomousModel;
  itemParameters: PolytomousItemResult[];
  personAbilities: Array<{ person: number; ability: number; se: number }>;
  fitStatistics: { logLikelihood: number; aic: number; bic: number; nParameters: number };
  reliability: { empirical: number; marginal: number };
  crc: CategoryCurve[];                                               // category response curves
  iif: Array<{ item: string; abilityLevels: number[]; information: number[] }>; // item info
  tif: { abilityLevels: number[]; information: number[]; se: number[] };         // test info
  nCases: number;
  droppedCases: number;
}

const clampExp = (z: number) => Math.max(-500, Math.min(500, z));

// ─── Category response probabilities ────────────────────────────────────────

/** P(X = k | θ), k = 0…K−1, for the given model. */
export function categoryProbs(model: PolytomousModel, theta: number, a: number, thr: number[]): number[] {
  const K = thr.length + 1;
  if (model === 'GRM') {
    // Cumulative P(X ≥ k) = logistic(a(θ − b_{k−1})); differences give category probs.
    const cumGE = new Array(K + 1);
    cumGE[0] = 1;
    for (let k = 1; k < K; k++) cumGE[k] = 1 / (1 + Math.exp(-clampExp(a * (theta - thr[k - 1]))));
    cumGE[K] = 0;
    const p = new Array(K);
    for (let k = 0; k < K; k++) p[k] = Math.max(1e-12, cumGE[k] - cumGE[k + 1]);
    return p;
  }
  // GPCM: adjacent-category logits. ψ₀ = 0; ψ_k = Σ_{v=1}^{k} a(θ − d_v).
  const psi = new Array(K);
  psi[0] = 0;
  for (let k = 1; k < K; k++) psi[k] = psi[k - 1] + a * (theta - thr[k - 1]);
  const maxPsi = Math.max(...psi);
  let denom = 0;
  const ex = new Array(K);
  for (let k = 0; k < K; k++) { ex[k] = Math.exp(clampExp(psi[k] - maxPsi)); denom += ex[k]; }
  return ex.map((e) => Math.max(1e-12, e / denom));
}

/** Fisher information contributed by one item at θ (numerical dP_k/dθ). */
function itemInformationAt(model: PolytomousModel, theta: number, a: number, thr: number[]): number {
  const h = 1e-3;
  const pP = categoryProbs(model, theta + h, a, thr);
  const pM = categoryProbs(model, theta - h, a, thr);
  const p = categoryProbs(model, theta, a, thr);
  let info = 0;
  for (let k = 0; k < p.length; k++) {
    const dP = (pP[k] - pM[k]) / (2 * h);
    info += (dP * dP) / Math.max(1e-9, p[k]);
  }
  return info;
}

// ─── Data recoding (→ consecutive 0-based categories per item) ───────────────

interface Recoded { intData: number[][]; categories: number[]; dropped: number }

function recode(data: number[][], nItems: number): Recoded {
  // Complete cases only (IRT calibration needs a full response vector).
  const complete = data.filter((row) => row.length >= nItems && row.slice(0, nItems).every((v) => v != null && !isNaN(v)));
  const dropped = data.length - complete.length;
  const maps: Map<number, number>[] = [];
  const categories: number[] = [];
  for (let j = 0; j < nItems; j++) {
    const uniq = [...new Set(complete.map((r) => r[j]))].sort((x, y) => x - y);
    const m = new Map<number, number>();
    uniq.forEach((v, idx) => m.set(v, idx));
    maps.push(m);
    categories.push(uniq.length);
  }
  const intData = complete.map((row) => row.slice(0, nItems).map((v, j) => maps[j].get(v)!));
  return { intData, categories, dropped };
}

// ─── Estimation ──────────────────────────────────────────────────────────────

export function estimatePolytomousIRT(
  rawData: number[][],
  itemNames: string[],
  model: PolytomousModel = 'GRM',
  maxIterations = 100,
  tolerance = 0.001,
): PolytomousIRTResults {
  const nItems = itemNames.length;
  const { intData: data, categories, dropped } = recode(rawData, nItems);
  const n = data.length;
  if (n < 20) throw new Error(`Need at least 20 complete cases for polytomous IRT (have ${n}).`);
  if (categories.some((K) => K < 2)) {
    const bad = itemNames.filter((_, j) => categories[j] < 2);
    throw new Error(`These item(s) have no variance: ${bad.join(', ')}.`);
  }

  // N(0,1) quadrature grid — 41 nodes on [−4, 4] (matches the dichotomous engine).
  const Q = 41;
  const nodes = Array.from({ length: Q }, (_, q) => -4 + (8 * q) / (Q - 1));
  let weights = nodes.map((t) => Math.exp(-0.5 * t * t));
  const wSum = weights.reduce((s, v) => s + v, 0);
  weights = weights.map((w) => w / wSum);

  // Deterministic starting values: a = 1; thresholds from the normal quantiles
  // of the observed cumulative category proportions.
  const params: PolytomousItemParameters[] = itemNames.map((_, j) => {
    const K = categories[j];
    const counts = new Array(K).fill(0);
    for (let i = 0; i < n; i++) counts[data[i][j]]++;
    const thr: number[] = [];
    let cum = 0;
    for (let k = 0; k < K - 1; k++) {
      cum += counts[k] / n;
      thr.push(Math.max(-3, Math.min(3, normalInv(Math.min(0.99, Math.max(0.01, cum))))));
    }
    if (model === 'GRM') thr.sort((x, y) => x - y);
    return { discrimination: 1.0, thresholds: thr, categories: K };
  });

  // Cache P_j(θ_q) = category-probability vector, refreshed after each M-step.
  let probsCache: number[][][] = params.map(() => []);
  const refreshCache = () => {
    probsCache = params.map((pj) => nodes.map((t) => categoryProbs(model, t, pj.discrimination, pj.thresholds)));
  };
  refreshCache();

  const posterior: number[][] = Array.from({ length: n }, () => new Array(Q).fill(0));

  // Expected complete-data LL for one item, given expected category counts r[k][q].
  const itemLL = (a: number, thr: number[], r: number[][]) => {
    let ll = 0;
    for (let q = 0; q < Q; q++) {
      const p = categoryProbs(model, nodes[q], a, thr);
      for (let k = 0; k < p.length; k++) if (r[k][q] > 0) ll += r[k][q] * Math.log(Math.max(1e-12, p[k]));
    }
    return ll;
  };

  for (let iter = 0; iter < maxIterations; iter++) {
    // ── E-step: person posteriors + expected category counts r_j[k][q] ────────
    const nq = new Array(Q).fill(0);
    const r: number[][][] = params.map((pj) => Array.from({ length: pj.categories }, () => new Array(Q).fill(0)));

    for (let i = 0; i < n; i++) {
      const logL = new Array(Q);
      for (let q = 0; q < Q; q++) {
        let ll = Math.log(weights[q]);
        for (let j = 0; j < nItems; j++) ll += Math.log(probsCache[j][q][data[i][j]]);
        logL[q] = ll;
      }
      const maxLL = Math.max(...logL);
      let denom = 0;
      for (let q = 0; q < Q; q++) { posterior[i][q] = Math.exp(logL[q] - maxLL); denom += posterior[i][q]; }
      for (let q = 0; q < Q; q++) {
        posterior[i][q] /= denom;
        nq[q] += posterior[i][q];
        for (let j = 0; j < nItems; j++) r[j][data[i][j]][q] += posterior[i][q];
      }
    }

    // ── M-step: per-item damped coordinate Newton on (a, thresholds) ──────────
    let maxChange = 0;
    for (let j = 0; j < nItems; j++) {
      const before = [params[j].discrimination, ...params[j].thresholds];
      const rj = r[j];

      for (let pass = 0; pass < 4; pass++) {
        // discrimination a
        {
          const a = params[j].discrimination;
          const step = newtonStep((x) => itemLL(x, params[j].thresholds, rj), a, 1e-3, 0.5);
          params[j].discrimination = Math.max(0.2, Math.min(4, a + step));
        }
        // thresholds
        for (let k = 0; k < params[j].thresholds.length; k++) {
          const cur = params[j].thresholds[k];
          const step = newtonStep((x) => {
            const t = params[j].thresholds.slice();
            t[k] = x;
            return itemLL(params[j].discrimination, t, rj);
          }, cur, 1e-3, 0.5);
          params[j].thresholds[k] = Math.max(-5, Math.min(5, cur + step));
        }
        if (model === 'GRM') params[j].thresholds.sort((x, y) => x - y); // keep boundaries ordered
      }

      const after = [params[j].discrimination, ...params[j].thresholds];
      for (let t = 0; t < after.length; t++) maxChange = Math.max(maxChange, Math.abs(after[t] - before[t]));
    }

    refreshCache();
    if (maxChange < tolerance) break;
  }

  // ── EAP person scoring ──────────────────────────────────────────────────────
  const abilities = new Array(n).fill(0);
  const ses = new Array(n).fill(1);
  for (let i = 0; i < n; i++) {
    let m1 = 0;
    for (let q = 0; q < Q; q++) m1 += posterior[i][q] * nodes[q];
    let v = 0;
    for (let q = 0; q < Q; q++) v += posterior[i][q] * (nodes[q] - m1) ** 2;
    abilities[i] = m1;
    ses[i] = Math.sqrt(Math.max(v, 1e-6));
  }

  // ── Marginal log-likelihood + fit ────────────────────────────────────────────
  let mll = 0;
  for (let i = 0; i < n; i++) {
    const logTerm = new Array(Q);
    for (let q = 0; q < Q; q++) {
      let lt = Math.log(weights[q]);
      for (let j = 0; j < nItems; j++) lt += Math.log(probsCache[j][q][data[i][j]]);
      logTerm[q] = lt;
    }
    const mx = Math.max(...logTerm);
    let s = 0;
    for (let q = 0; q < Q; q++) s += Math.exp(logTerm[q] - mx);
    mll += mx + Math.log(s);
  }
  const nParameters = categories.reduce((s, K) => s + K, 0); // a + (K−1) thresholds = K per item
  const aic = -2 * mll + 2 * nParameters;
  const bic = -2 * mll + nParameters * Math.log(n);

  // ── Curves (CRC, IIF, TIF) ────────────────────────────────────────────────────
  const grid = Array.from({ length: 61 }, (_, i) => -3 + (6 * i) / 60);
  const crc: CategoryCurve[] = params.map((pj, j) => ({
    item: itemNames[j],
    abilityLevels: grid,
    categoryProbs: Array.from({ length: pj.categories }, (_, k) =>
      grid.map((t) => categoryProbs(model, t, pj.discrimination, pj.thresholds)[k])),
  }));
  const iif = params.map((pj, j) => ({
    item: itemNames[j],
    abilityLevels: grid,
    information: grid.map((t) => itemInformationAt(model, t, pj.discrimination, pj.thresholds)),
  }));
  const tifInfo = grid.map((t) =>
    params.reduce((s, pj) => s + itemInformationAt(model, t, pj.discrimination, pj.thresholds), 0));
  const tif = { abilityLevels: grid, information: tifInfo, se: tifInfo.map((I) => 1 / Math.sqrt(Math.max(I, 1e-6))) };

  // ── Reliability ───────────────────────────────────────────────────────────────
  const meanTheta = abilities.reduce((s, v) => s + v, 0) / n;
  const varTheta = abilities.reduce((s, v) => s + (v - meanTheta) ** 2, 0) / n;
  const meanErrVar = ses.reduce((s, v) => s + v * v, 0) / n;
  const empirical = varTheta / (varTheta + meanErrVar);
  // Marginal reliability from the test information function over the population.
  let mrNum = 0, mrDen = 0;
  grid.forEach((t, gi) => {
    const w = Math.exp(-0.5 * t * t);
    mrDen += w;
    mrNum += w * (1 / (1 + 1 / Math.max(1e-6, tifInfo[gi])));
  });
  const marginal = mrNum / mrDen;

  const itemParameters: PolytomousItemResult[] = params.map((pj, j) => ({
    item: itemNames[j],
    discrimination: parseFloat(pj.discrimination.toFixed(3)),
    thresholds: pj.thresholds.map((b) => parseFloat(b.toFixed(3))),
    categories: pj.categories,
    information: parseFloat(itemInformationAt(model, 0, pj.discrimination, pj.thresholds).toFixed(3)),
  }));

  return {
    model,
    itemParameters,
    personAbilities: abilities.map((a, i) => ({ person: i + 1, ability: parseFloat(a.toFixed(3)), se: parseFloat(ses[i].toFixed(3)) })),
    fitStatistics: { logLikelihood: parseFloat(mll.toFixed(2)), aic: parseFloat(aic.toFixed(2)), bic: parseFloat(bic.toFixed(2)), nParameters },
    reliability: { empirical: parseFloat(empirical.toFixed(3)), marginal: parseFloat(marginal.toFixed(3)) },
    crc,
    iif,
    tif,
    nCases: n,
    droppedCases: dropped,
  };
}

// Damped 1-D Newton step maximizing f at x (central finite differences).
function newtonStep(f: (x: number) => number, x: number, h: number, maxStep: number): number {
  const f0 = f(x);
  const fp = f(x + h);
  const fm = f(x - h);
  const g = (fp - fm) / (2 * h);           // gradient
  const hess = (fp - 2 * f0 + fm) / (h * h); // curvature
  let step: number;
  if (hess < -1e-9) step = g / -hess;       // concave → Newton toward the maximum
  else step = 0.1 * g;                       // fall back to a small gradient-ascent step
  return Math.max(-maxStep, Math.min(maxStep, step));
}
