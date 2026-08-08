import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, randn } from './_helpers';
import { calculateVIF, calculateInnerVIF, calculateAVE, enumerateIndirectPaths, computeMediation, blindfolding, plsPredict, PLSSEMModel } from '../src/lib/plssemUtils';

// Build two columns with a target correlation r, plus a large mean offset so we
// also verify VIF is computed on centered data (the raw-data bug would distort
// R² and hence VIF).
function twoCorrelated(r: number, n = 800, seed = 7, offset = 50): number[][] {
  const rng = mulberry32(seed);
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = randn(rng);
    const e = randn(rng);
    const b = r * a + Math.sqrt(1 - r * r) * e;
    rows.push([a + offset, b + offset]);
  }
  return rows;
}

test('VIF matches 1/(1-r^2) and is offset-invariant (centering fix)', () => {
  const r = 0.8;
  const vifs = calculateVIF(twoCorrelated(r));
  const expected = 1 / (1 - r * r); // 2.777…
  assert.ok(Math.abs(vifs[0] - expected) < 0.15, `vif0=${vifs[0]} exp=${expected}`);
  assert.ok(Math.abs(vifs[1] - expected) < 0.15, `vif1=${vifs[1]} exp=${expected}`);
});

test('VIF ~ 1 for independent predictors', () => {
  const vifs = calculateVIF(twoCorrelated(0.0));
  assert.ok(vifs[0] < 1.1 && vifs[1] < 1.1, `vifs=${vifs}`);
});

test('inner VIF flags collinear predictor constructs', () => {
  const rng = mulberry32(11);
  const n = 800;
  const A: number[] = [], B: number[] = [], Y: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = randn(rng);
    const b = 0.9 * a + Math.sqrt(1 - 0.81) * randn(rng); // corr(A,B) ≈ 0.9
    A.push(a); B.push(b); Y.push(0.3 * a + 0.3 * b + randn(rng));
  }
  const model: PLSSEMModel = {
    constructs: [
      { id: 'A', name: 'A', type: 'reflective', order: 1, indicators: ['a'] },
      { id: 'B', name: 'B', type: 'reflective', order: 1, indicators: ['b'] },
      { id: 'Y', name: 'Y', type: 'reflective', order: 1, indicators: ['y'] },
    ],
    paths: [{ from: 'A', to: 'Y' }, { from: 'B', to: 'Y' }],
  };
  const vif = calculateInnerVIF({ A, B, Y }, model);
  const expected = 1 / (1 - 0.81); // ≈ 5.26
  assert.ok(vif['Y']['A'] > 3 && vif['Y']['B'] > 3, `collinear VIF too low: ${JSON.stringify(vif['Y'])}`);
  assert.ok(Math.abs(vif['Y']['A'] - expected) < 1.0, `vifA=${vif['Y']['A']} exp=${expected}`);
});

test('inner VIF = 1 for a single predictor', () => {
  const model: PLSSEMModel = {
    constructs: [
      { id: 'A', name: 'A', type: 'reflective', order: 1, indicators: ['a'] },
      { id: 'Y', name: 'Y', type: 'reflective', order: 1, indicators: ['y'] },
    ],
    paths: [{ from: 'A', to: 'Y' }],
  };
  const vif = calculateInnerVIF({ A: [1, 2, 3, 4], Y: [1, 2, 3, 4] }, model);
  assert.equal(vif['Y']['A'], 1);
});

test('AVE equals the mean of squared loadings', () => {
  assert.ok(Math.abs(calculateAVE([0.8, 0.7, 0.9]) - (0.64 + 0.49 + 0.81) / 3) < 1e-9);
});

const chainModel: PLSSEMModel = {
  constructs: [
    { id: 'X', name: 'X', type: 'reflective', order: 1, indicators: ['x'] },
    { id: 'M', name: 'M', type: 'reflective', order: 1, indicators: ['m'] },
    { id: 'Y', name: 'Y', type: 'reflective', order: 1, indicators: ['y'] },
  ],
  paths: [{ from: 'X', to: 'M' }, { from: 'M', to: 'Y' }, { from: 'X', to: 'Y' }],
};

test('enumerateIndirectPaths finds the X→M→Y route', () => {
  const routes = enumerateIndirectPaths(chainModel);
  assert.deepEqual(routes, [['X', 'M', 'Y']]);
});

test('mediation: indirect effect is the product of the path coefficients', () => {
  const original = { 'X->M': 0.5, 'M->Y': 0.4, 'X->Y': 0.2 };
  // bootstrap distributions with slight jitter so CI/SE are well-defined
  const jitter = (v: number) => Array.from({ length: 200 }, (_, i) => v + (i % 2 ? 0.01 : -0.01));
  const boot = { 'X->M': jitter(0.5), 'M->Y': jitter(0.4), 'X->Y': jitter(0.2) };
  const med = computeMediation(chainModel, original, boot, 0.95);

  assert.equal(med.specific.length, 1);
  const sp = med.specific[0];
  assert.equal(sp.via, 'X → M → Y');
  assert.ok(Math.abs(sp.estimate - 0.2) < 1e-9);            // 0.5 * 0.4
  assert.ok(sp.ci[0] > 0 && sp.ci[1] > 0);                   // CI excludes 0 → significant

  // total effect X→Y: direct 0.2 + indirect 0.2 = 0.4
  const te = med.totalEffects.find(t => t.from === 'X' && t.to === 'Y')!;
  assert.ok(Math.abs(te.direct - 0.2) < 1e-9);
  assert.ok(Math.abs(te.indirect - 0.2) < 1e-9);
  assert.ok(Math.abs(te.total - 0.4) < 1e-9);
});

// Generate a 2-construct PLS dataset: X → Y with a strong structural path.
function plsData(n = 300, seed = 42, beta = 0.7, lambda = 0.8) {
  const rng = mulberry32(seed);
  const cols = ['x1', 'x2', 'x3', 'y1', 'y2', 'y3'];
  const data: number[][] = [];
  for (let i = 0; i < n; i++) {
    const X = randn(rng);
    const Y = beta * X + Math.sqrt(1 - beta * beta) * randn(rng);
    const ind = (L: number) => lambda * L + Math.sqrt(1 - lambda * lambda) * randn(rng);
    data.push([ind(X), ind(X), ind(X), ind(Y), ind(Y), ind(Y)]);
  }
  const model: PLSSEMModel = {
    constructs: [
      { id: 'X', name: 'X', type: 'reflective', order: 1, indicators: ['x1', 'x2', 'x3'] },
      { id: 'Y', name: 'Y', type: 'reflective', order: 1, indicators: ['y1', 'y2', 'y3'] },
    ],
    paths: [{ from: 'X', to: 'Y' }],
  };
  const settings = { weightingScheme: 'path', maxIterations: 300, convergenceCriterion: 1e-6 };
  return { data, cols, model, settings };
}

test('blindfolding Q² is positive when the predictor explains the endogenous block', () => {
  const { data, cols, model, settings } = plsData();
  const q = blindfolding(data, model, settings, 7, cols);
  assert.ok(q['Y'] > 0.05, `Q²(Y)=${q['Y']} should be clearly positive`);
  assert.ok(q['Y'] <= 1, `Q²(Y)=${q['Y']} must be ≤ 1`);
});

test('PLSpredict Q²_predict is positive out-of-sample for a real relationship', () => {
  const { data, cols, model, settings } = plsData();
  const p = plsPredict(data, model, settings, 0.8, cols);
  assert.ok(p.qSquaredPredict['Y'] > 0, `Q²_predict(Y)=${p.qSquaredPredict['Y']} should beat the mean benchmark`);
  assert.ok(p.rmse['Y'] > 0 && Number.isFinite(p.rmse['Y']), `RMSE(Y)=${p.rmse['Y']}`);
});

test('predictive metrics are ~null when predictor is unrelated to the outcome', () => {
  const { data, cols, model, settings } = plsData(300, 7, 0.02); // near-zero path
  const q = blindfolding(data, model, settings, 7, cols);
  assert.ok(q['Y'] < 0.05, `Q²(Y)=${q['Y']} should be ~0 with no real relationship`);
});
