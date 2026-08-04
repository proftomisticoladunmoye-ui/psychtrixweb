import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IRTEstimator } from '../src/lib/itemResponseTheory';
import { mulberry32, randn, corr, rmse } from './_helpers';

// Simulate 2PL responses from known item parameters.
function simulate2PL(n: number, a: number[], b: number[], seed: number): number[][] {
  const rng = mulberry32(seed);
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const theta = randn(rng);
    rows.push(a.map((aj, j) => {
      const p = 1 / (1 + Math.exp(-aj * (theta - b[j])));
      return rng() < p ? 1 : 0;
    }));
  }
  return rows;
}

test('2PL MML recovers known item parameters', () => {
  const aTrue = [1.2, 0.8, 1.5, 1.0, 1.3, 0.9, 1.1];
  const bTrue = [-1.5, -0.8, -0.2, 0.0, 0.5, 1.0, 1.6];
  const names = aTrue.map((_, j) => `it${j + 1}`);
  const data = simulate2PL(1200, aTrue, bTrue, 424242);

  const res = IRTEstimator.estimate(data, names, '2PL', 100, 0.001);
  const aEst = res.itemParameters.map((p: any) => p.discrimination);
  const bEst = res.itemParameters.map((p: any) => p.difficulty);

  assert.ok(corr(bEst, bTrue) > 0.95, `difficulty corr > 0.95, got ${corr(bEst, bTrue).toFixed(3)}`);
  assert.ok(rmse(bEst, bTrue) < 0.35, `difficulty RMSE < 0.35, got ${rmse(bEst, bTrue).toFixed(3)}`);
  assert.ok(corr(aEst, aTrue) > 0.7, `discrimination corr > 0.7, got ${corr(aEst, aTrue).toFixed(3)}`);
  // Person abilities and information are well-formed.
  assert.equal(res.personAbilities.length, 1200, 'one ability per respondent');
  assert.ok(res.tif.information.every((v: number) => v >= 0), 'test information non-negative');
});
