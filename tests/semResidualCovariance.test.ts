import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, randn } from './_helpers';
import { SEMEstimator, SEMModel } from '../src/lib/structuralEquationModeling';

// Two-factor model (F1: v1,v2,v3; F2: v4,v5,v6) with F1 -> F2, plus a PLANTED
// residual covariance between v1 and v4 via a shared error component.
function makeData(n = 600, seed = 11): number[][] {
  const rng = mulberry32(seed);
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const f1 = randn(rng);
    const f2 = 0.4 * f1 + Math.sqrt(1 - 0.16) * randn(rng);
    const shared = 0.55 * randn(rng);           // common error for v1 & v4
    const v1 = 0.7 * f1 + shared + 0.4 * randn(rng);
    const v2 = 0.7 * f1 + 0.7 * randn(rng);
    const v3 = 0.7 * f1 + 0.7 * randn(rng);
    const v4 = 0.7 * f2 + shared + 0.4 * randn(rng);
    const v5 = 0.7 * f2 + 0.7 * randn(rng);
    const v6 = 0.7 * f2 + 0.7 * randn(rng);
    rows.push([v1, v2, v3, v4, v5, v6]);
  }
  return rows;
}

const NAMES = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];
const BASE: SEMModel = {
  measurementModel: { F1: ['v1', 'v2', 'v3'], F2: ['v4', 'v5', 'v6'] },
  structuralPaths: [{ from: 'F1', to: 'F2' }],
};

test('measurement-only model (no structural paths) estimates as a CFA', () => {
  const data = makeData();
  const r = SEMEstimator.estimate(
    data, { measurementModel: BASE.measurementModel, structuralPaths: [] }, NAMES, { estimator: 'ULS' });
  // Loadings for all six indicators, valid fit indices, no structural paths.
  assert.equal(r.measurementModel.factorLoadings.length, 6);
  assert.equal(r.structuralModel.paths.length, 0);
  assert.ok(Number.isFinite(r.fitIndices.cfi) && r.fitIndices.cfi <= 1.0001, 'CFI is finite');
  assert.ok(r.fitIndices.df > 0, 'positive df');
  assert.ok(Object.keys(r.measurementModel.reliability).length === 2, 'reliability per factor');
});

test('residual covariances: empty/undefined leave the fit identical', () => {
  const data = makeData();
  const a = SEMEstimator.estimate(data, { ...BASE }, NAMES, { estimator: 'ULS' });
  const b = SEMEstimator.estimate(data, { ...BASE, residualCovariances: [] }, NAMES, { estimator: 'ULS' });
  assert.equal(a.fitIndices.df, b.fitIndices.df, 'df unchanged by empty residualCovariances');
  assert.ok(Math.abs(a.fitIndices.chisq - b.fitIndices.chisq) < 1e-9, 'chisq byte-identical');
  assert.equal(a.residualCovariances?.length ?? 0, 0, 'no residual covariances reported');
});

test('residual covariances: a planted error covariance is recovered, df-1, better fit', () => {
  const data = makeData();
  const without = SEMEstimator.estimate(data, { ...BASE }, NAMES, { estimator: 'ULS' });
  const withRC = SEMEstimator.estimate(
    data, { ...BASE, residualCovariances: [['v1', 'v4']] }, NAMES, { estimator: 'ULS' });

  // One free parameter added -> one fewer degree of freedom.
  assert.equal(withRC.fitIndices.df, without.fitIndices.df - 1, 'df decreases by exactly 1');

  // The residual covariance is reported and recovered with the correct sign.
  assert.equal(withRC.residualCovariances?.length, 1);
  const rc = withRC.residualCovariances![0];
  assert.ok(
    (rc.item1 === 'v1' && rc.item2 === 'v4') || (rc.item1 === 'v4' && rc.item2 === 'v1'),
    'the reported pair is v1~~v4');
  assert.ok(rc.estimate > 0.1, `planted positive covariance recovered (got ${rc.estimate.toFixed(3)})`);

  // Freeing the true residual covariance should not worsen fit (χ² drops).
  assert.ok(withRC.fitIndices.chisq <= without.fitIndices.chisq + 1e-6,
    `χ² improves: ${withRC.fitIndices.chisq.toFixed(2)} <= ${without.fitIndices.chisq.toFixed(2)}`);

  // The v1~v4 standardised residual should shrink once the covariance is freed.
  const resid = (r: any) => {
    const m = (r.diagnostics.standardisedResiduals || []).find(
      (x: any) => (x.row === 'v1' && x.col === 'v4') || (x.row === 'v4' && x.col === 'v1'));
    return m ? Math.abs(m.residual) : 0;
  };
  assert.ok(resid(withRC) <= resid(without) + 1e-6, 'v1~v4 standardised residual shrinks');
});
