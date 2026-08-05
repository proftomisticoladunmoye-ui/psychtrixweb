import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMissingness, emEstimate, littleMCAR, imputeMean, imputeEM } from '../src/lib/missingData';
import { mulberry32, randn } from './_helpers';

const NaNv = NaN;

// Lower-triangular Cholesky factor (for simulating correlated normals).
function chol(A: number[][]): number[][] {
  const n = A.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(A[i][i] - s) : (A[i][j] - s) / L[j][j];
    }
  return L;
}
// Draw n rows from N(mu, Sigma).
function mvn(n: number, mu: number[], Sigma: number[][], rng: () => number): number[][] {
  const L = chol(Sigma), p = mu.length, rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const z = Array.from({ length: p }, () => randn(rng));
    rows.push(mu.map((m, a) => m + z.slice(0, a + 1).reduce((acc, zk, k) => acc + L[a][k] * zk, 0)));
  }
  return rows;
}
const maxAbsDiff = (A: number[][], B: number[][]) => {
  let d = 0;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < A[0].length; j++) d = Math.max(d, Math.abs(A[i][j] - B[i][j]));
  return d;
};
const colVar = (data: number[][], j: number) => {
  const col = data.map((r) => r[j]).filter((v) => !Number.isNaN(v));
  const m = col.reduce((s, v) => s + v, 0) / col.length;
  return col.reduce((s, v) => s + (v - m) ** 2, 0) / col.length;
};

const SIGMA = [
  [1.0, 0.5, 0.3],
  [0.5, 1.0, 0.4],
  [0.3, 0.4, 1.0],
];
const MU = [0, 1, -0.5];

test('analyzeMissingness counts cells, cases and patterns correctly', () => {
  const data = [
    [1, 2, 3],
    [NaNv, 5, 6],
    [7, NaNv, 9],
    [10, 11, 12],
    [NaNv, NaNv, 13],
  ];
  const r = analyzeMissingness(data, ['a', 'b', 'c']);
  assert.equal(r.nCases, 5);
  assert.equal(r.nComplete, 2, 'two complete rows');
  assert.equal(r.casesWithMissing, 3);
  assert.equal(r.perVariable[0].missing, 2, 'col a missing count');
  assert.equal(r.perVariable[2].missing, 0, 'col c complete');
  assert.ok(Math.abs(r.overallMissingPct - (4 / 15) * 100) < 1e-9, 'overall %');
});

test('EM equals the sample covariance when nothing is missing', () => {
  const rng = mulberry32(7);
  const data = mvn(400, MU, SIGMA, rng);
  const em = emEstimate(data);
  // ML sample covariance (÷ n)
  const n = data.length, p = 3;
  const mean = [0, 1, 2].map((j) => data.reduce((s, r) => s + r[j], 0) / n);
  const sample = [0, 1, 2].map((a) => [0, 1, 2].map((b) =>
    data.reduce((s, r) => s + (r[a] - mean[a]) * (r[b] - mean[b]), 0) / n));
  assert.ok(maxAbsDiff(em.cov, sample) < 1e-6, `EM cov == sample cov, diff ${maxAbsDiff(em.cov, sample)}`);
});

test('EM recovers the true covariance from MCAR-incomplete data', () => {
  const rng = mulberry32(20260804);
  const data = mvn(1000, MU, SIGMA, rng);
  // knock out ~20% of cells at random (MCAR), never a whole row
  for (const row of data) {
    for (let j = 0; j < 3; j++) if (rng() < 0.2) row[j] = NaN;
    if (row.every((v) => Number.isNaN(v))) row[0] = mvn(1, MU, SIGMA, rng)[0][0];
  }
  const em = emEstimate(data);
  assert.ok(em.converged, 'EM converged');
  assert.ok(maxAbsDiff(em.cov, SIGMA) < 0.15, `EM cov ≈ true Σ, max diff ${maxAbsDiff(em.cov, SIGMA).toFixed(3)}`);
  assert.ok(Math.abs(em.corr[0][1] - 0.5) < 0.08, `corr(1,2) ≈ .5, got ${em.corr[0][1].toFixed(3)}`);
});

test("Little's MCAR test does not reject MCAR data, but rejects MAR data", () => {
  // MCAR: missingness independent of values → should NOT reject.
  let rng = mulberry32(42);
  const mcarData = mvn(600, MU, SIGMA, rng);
  for (const row of mcarData) for (let j = 0; j < 3; j++) if (rng() < 0.2) row[j] = NaN;
  const mcar = littleMCAR(mcarData);
  assert.ok(mcar.pValue > 0.05, `MCAR → not rejected, p=${mcar.pValue.toFixed(3)}`);
  assert.equal(mcar.mcar, true);

  // MAR: x3 tends to be missing when x1 is high → pattern means differ → reject.
  rng = mulberry32(43);
  const marData = mvn(600, MU, SIGMA, rng);
  for (const row of marData) if (row[0] > 0.4 && rng() < 0.7) row[2] = NaN;
  const mar = littleMCAR(marData);
  assert.ok(mar.pValue < 0.05, `MAR → rejected, p=${mar.pValue.toFixed(4)}`);
});

test('imputation fills every gap; stochastic EM preserves variance better than mean imputation', () => {
  const rng = mulberry32(99);
  const data = mvn(800, MU, SIGMA, rng);
  for (const row of data) for (let j = 0; j < 3; j++) if (rng() < 0.25) row[j] = NaN;
  const trueVar = 1.0; // marginal variance of each standardized-ish variable ≈ 1

  const em = imputeEM(data, 5);
  const mean = imputeMean(data);
  assert.ok(em.every((r) => r.every((v) => !Number.isNaN(v))), 'EM: no missing left');
  assert.ok(mean.every((r) => r.every((v) => !Number.isNaN(v))), 'mean: no missing left');

  // Mean imputation shrinks variance; stochastic EM stays near the true variance.
  const emVar = colVar(em, 0), meanVar = colVar(mean, 0);
  assert.ok(Math.abs(emVar - trueVar) < 0.2, `EM var ≈ 1, got ${emVar.toFixed(3)}`);
  assert.ok(emVar > meanVar, `EM variance (${emVar.toFixed(3)}) > mean-imputed variance (${meanVar.toFixed(3)})`);
});
