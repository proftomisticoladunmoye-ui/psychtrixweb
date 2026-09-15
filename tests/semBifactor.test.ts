import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, randn } from './_helpers';
import { SEMEstimator, SEMModel } from '../src/lib/structuralEquationModeling';

// Bifactor: a general factor G (all 9 items, λ_G = 0.5) plus three ORTHOGONAL
// specific factors S1,S2,S3 (three items each, λ_S = 0.4). yij = 0.5·G + 0.4·Si + e.
function makeBifactorData(n = 900, seed = 3): number[][] {
  const rng = mulberry32(seed);
  const lg = 0.5, ls = 0.4, e = Math.sqrt(1 - lg * lg - ls * ls);
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const G = randn(rng);
    const S = [randn(rng), randn(rng), randn(rng)];
    const row: number[] = [];
    for (let s = 0; s < 3; s++) for (let k = 0; k < 3; k++) row.push(lg * G + ls * S[s] + e * randn(rng));
    rows.push(row);
  }
  return rows;
}

const NAMES = ['y1', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7', 'y8', 'y9'];
const MODEL: SEMModel = {
  measurementModel: { G: NAMES },
  structuralPaths: [],
  bifactorSpecifics: { S1: ['y1', 'y2', 'y3'], S2: ['y4', 'y5', 'y6'], S3: ['y7', 'y8', 'y9'] },
};

test('bifactor: general + orthogonal specific loadings are recovered', () => {
  const data = makeBifactorData();
  const r = SEMEstimator.estimate(data, MODEL, NAMES, { estimator: 'ULS' });

  // General loadings (~0.5) for all nine items.
  const gLoad = r.measurementModel.factorLoadings.filter((f) => f.factor === 'G');
  assert.equal(gLoad.length, 9);
  const gMean = gLoad.reduce((s, l) => s + l.std_loading, 0) / gLoad.length;
  assert.ok(gMean > 0.35 && gMean < 0.65, `general loadings ~0.5 (mean ${gMean.toFixed(2)})`);

  // Specific loadings (~0.4), nine of them across three factors.
  assert.ok(r.specificLoadings && r.specificLoadings.length === 9, 'nine specific loadings');
  const sMean = r.specificLoadings!.reduce((s, l) => s + l.loading, 0) / 9;
  assert.ok(sMean > 0.25 && sMean < 0.6, `specific loadings ~0.4 (mean ${sMean.toFixed(2)})`);
  const factors = new Set(r.specificLoadings!.map((l) => l.factor));
  assert.deepEqual([...factors].sort(), ['S1', 'S2', 'S3']);

  // Good fit (data generated from this structure).
  assert.ok(Number.isFinite(r.fitIndices.cfi) && r.fitIndices.cfi > 0.9, `CFI good (got ${r.fitIndices.cfi.toFixed(3)})`);
  assert.ok(r.fitIndices.df > 0, `positive df (got ${r.fitIndices.df})`);
});

test('bifactor: empty specifics reduce to a single-factor CFA (unchanged)', () => {
  const data = makeBifactorData();
  const a = SEMEstimator.estimate(data, { measurementModel: { G: NAMES }, structuralPaths: [] }, NAMES, { estimator: 'ULS' });
  const b = SEMEstimator.estimate(data, { measurementModel: { G: NAMES }, structuralPaths: [], bifactorSpecifics: {} }, NAMES, { estimator: 'ULS' });
  assert.equal(a.fitIndices.df, b.fitIndices.df);
  assert.ok(Math.abs(a.fitIndices.chisq - b.fitIndices.chisq) < 1e-9, 'chisq identical');
  assert.equal((a.specificLoadings || []).length, 0);
});
