import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, randn } from './_helpers';
import { SEMEstimator, SEMModel } from '../src/lib/structuralEquationModeling';

// Generate data from a SECOND-ORDER model:
//   G (general) -> F1,F2,F3 (first-order)  ->  3 indicators each.
// Second-order loadings: G->F1=0.7, G->F2=0.6, G->F3=0.8.
// First-order loadings: 0.75 on every indicator.
function makeSecondOrderData(n = 800, seed = 5): number[][] {
  const rng = mulberry32(seed);
  const g2 = { F1: 0.7, F2: 0.6, F3: 0.8 };
  const lam = 0.75;
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const G = randn(rng);
    const F: Record<string, number> = {};
    for (const [f, b] of Object.entries(g2)) F[f] = b * G + Math.sqrt(1 - b * b) * randn(rng);
    const row: number[] = [];
    for (const f of ['F1', 'F2', 'F3']) for (let k = 0; k < 3; k++) row.push(lam * F[f] + Math.sqrt(1 - lam * lam) * randn(rng));
    rows.push(row);
  }
  return rows;
}

const NAMES = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8', 'x9'];
// Second-order factor G has NO observed indicators; it is measured only through
// the first-order factors, which it predicts.
const MODEL: SEMModel = {
  measurementModel: { G: [], F1: ['x1', 'x2', 'x3'], F2: ['x4', 'x5', 'x6'], F3: ['x7', 'x8', 'x9'] },
  structuralPaths: [{ from: 'G', to: 'F1' }, { from: 'G', to: 'F2' }, { from: 'G', to: 'F3' }],
};

test('second-order CFA: estimator handles a latent with no indicators and recovers second-order loadings', () => {
  const data = makeSecondOrderData();
  const r = SEMEstimator.estimate(data, MODEL, NAMES, { estimator: 'ULS' });

  // No NaNs anywhere critical.
  assert.ok(Number.isFinite(r.fitIndices.cfi), 'CFI finite');
  assert.ok(Number.isFinite(r.fitIndices.chisq) && r.fitIndices.chisq >= 0, 'chisq finite & non-negative');
  assert.equal(r.measurementModel.factorLoadings.length, 9, 'nine first-order loadings');
  for (const fl of r.measurementModel.factorLoadings) assert.ok(Number.isFinite(fl.std_loading), `loading finite for ${fl.item}`);

  // Second-order loadings appear as structural paths G -> Fk and are recovered.
  const paths = r.structuralModel.paths;
  assert.equal(paths.length, 3, 'three second-order loadings');
  const byTo: Record<string, number> = {};
  for (const p of paths) { assert.equal(p.from, 'G'); assert.ok(Number.isFinite(p.std_coefficient)); byTo[p.to] = p.std_coefficient; }
  // Recovered within a tolerance (ULS on a correlation matrix; not exact ML).
  assert.ok(byTo.F1 > 0.45 && byTo.F1 < 0.9, `G->F1 ~0.7 (got ${byTo.F1?.toFixed(2)})`);
  assert.ok(byTo.F2 > 0.35 && byTo.F2 < 0.85, `G->F2 ~0.6 (got ${byTo.F2?.toFixed(2)})`);
  assert.ok(byTo.F3 > 0.55 && byTo.F3 < 0.95, `G->F3 ~0.8 (got ${byTo.F3?.toFixed(2)})`);

  // Good fit expected (data generated from this exact structure).
  assert.ok(r.fitIndices.cfi > 0.9, `CFI good (got ${r.fitIndices.cfi.toFixed(3)})`);
});
