import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, randn } from './_helpers';
import { SEMEstimator, SEMModel } from '../src/lib/structuralEquationModeling';

// MIMIC: latent ETA (3 indicators) is predicted by two observed covariates
// x1, x2 (γ = 0.5, 0.3). Covariates correlate r ≈ 0.3. Indicator loadings 0.75.
function makeMimicData(n = 900, seed = 9): number[][] {
  const rng = mulberry32(seed);
  const g1 = 0.5, g2 = 0.3, lam = 0.75;
  const varEta = g1 * g1 + g2 * g2 + 2 * g1 * g2 * 0.3; // ≈ 0.43
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const z1 = randn(rng);
    const x1 = z1;
    const x2 = 0.3 * z1 + Math.sqrt(1 - 0.09) * randn(rng); // corr(x1,x2) ≈ 0.3
    const eta = g1 * x1 + g2 * x2 + Math.sqrt(Math.max(0.01, 1 - varEta)) * randn(rng);
    const y1 = lam * eta + Math.sqrt(1 - lam * lam) * randn(rng);
    const y2 = lam * eta + Math.sqrt(1 - lam * lam) * randn(rng);
    const y3 = lam * eta + Math.sqrt(1 - lam * lam) * randn(rng);
    rows.push([y1, y2, y3, x1, x2]);
  }
  return rows;
}

const NAMES = ['y1', 'y2', 'y3', 'x1', 'x2'];
const MODEL: SEMModel = {
  measurementModel: { ETA: ['y1', 'y2', 'y3'], X1: ['x1'], X2: ['x2'] },
  structuralPaths: [{ from: 'X1', to: 'ETA' }, { from: 'X2', to: 'ETA' }],
  fixedUnitLatents: ['X1', 'X2'],
};

test('MIMIC: observed covariates predict a latent via fixed-unit proxy latents', () => {
  const data = makeMimicData();
  const r = SEMEstimator.estimate(data, MODEL, NAMES, { estimator: 'ULS' });

  // Proxy loadings are fixed at 1 (no free parameter, no SE).
  const proxy = r.measurementModel.factorLoadings.filter((f) => f.item === 'x1' || f.item === 'x2');
  assert.equal(proxy.length, 2);
  for (const p of proxy) { assert.ok(Math.abs(p.loading - 1) < 1e-9, `${p.item} loading fixed at 1`); assert.equal(p.se, 0); }

  // ETA's indicator loadings recovered near 0.75.
  const etaLoad = r.measurementModel.factorLoadings.filter((f) => f.factor === 'ETA');
  assert.equal(etaLoad.length, 3);
  for (const l of etaLoad) assert.ok(l.std_loading > 0.55 && l.std_loading < 0.9, `${l.item} ~0.75 (got ${l.std_loading.toFixed(2)})`);

  // Covariate → latent paths recovered near 0.5 / 0.3.
  const byPath: Record<string, number> = {};
  for (const p of r.structuralModel.paths) { assert.equal(p.to, 'ETA'); byPath[p.from] = p.std_coefficient; }
  assert.ok(byPath.X1 > 0.30 && byPath.X1 < 0.70, `X1->ETA ~0.5 (got ${byPath.X1?.toFixed(2)})`);
  assert.ok(byPath.X2 > 0.12 && byPath.X2 < 0.50, `X2->ETA ~0.3 (got ${byPath.X2?.toFixed(2)})`);

  // Good fit (data generated from this structure); finite indices.
  assert.ok(Number.isFinite(r.fitIndices.cfi) && r.fitIndices.cfi > 0.9, `CFI good (got ${r.fitIndices.cfi.toFixed(3)})`);
  assert.ok(r.fitIndices.df > 0, `positive df (got ${r.fitIndices.df})`);
});
