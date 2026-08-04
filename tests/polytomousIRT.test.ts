import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePolytomousIRT, categoryProbs } from '../src/lib/polytomousIRT';
import { mulberry32, randn, corr, rmse } from './_helpers';

function simulate(model: 'GRM' | 'GPCM', a: number[], b: number[][], n: number, seed: number): number[][] {
  const rng = mulberry32(seed);
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const theta = randn(rng);
    rows.push(a.map((aj, j) => {
      const p = categoryProbs(model, theta, aj, b[j]);
      let u = rng(), k = 0, cum = 0;
      for (; k < p.length; k++) { cum += p[k]; if (u <= cum) break; }
      return Math.min(k, p.length - 1) + 1; // 1-based Likert category
    }));
  }
  return rows;
}

const aTrue = [1.2, 0.8, 1.5, 1.0, 1.3, 0.9];
const bTrue = [
  [-1.6, -0.6, 0.5, 1.5], [-1.2, -0.2, 0.7, 1.6], [-1.8, -0.7, 0.4, 1.4],
  [-1.4, -0.4, 0.6, 1.7], [-1.5, -0.5, 0.5, 1.5], [-1.0, -0.1, 0.8, 1.8],
];
const names = aTrue.map((_, j) => `it${j + 1}`);

test('category probabilities form a valid distribution', () => {
  for (const model of ['GRM', 'GPCM'] as const) {
    for (const theta of [-2, -0.5, 0, 1, 2.5]) {
      const p = categoryProbs(model, theta, 1.1, [-1, 0, 1]);
      assert.equal(p.length, 4, 'K categories');
      const sum = p.reduce((s, v) => s + v, 0);
      assert.ok(Math.abs(sum - 1) < 1e-9, `${model} probs sum to 1 (${sum})`);
      assert.ok(p.every((v) => v >= 0), 'non-negative');
    }
  }
});

test('GRM recovers known item parameters', () => {
  const data = simulate('GRM', aTrue, bTrue, 1500, 12345);
  const res = estimatePolytomousIRT(data, names, 'GRM', 150, 0.001);
  const aEst = res.itemParameters.map((p) => p.discrimination);
  const bEst = res.itemParameters.flatMap((p) => p.thresholds);
  const bFlat = bTrue.flat();
  assert.ok(corr(aEst, aTrue) > 0.9, `GRM a corr > 0.9, got ${corr(aEst, aTrue).toFixed(3)}`);
  assert.ok(corr(bEst, bFlat) > 0.97, `GRM threshold corr > 0.97, got ${corr(bEst, bFlat).toFixed(3)}`);
  assert.ok(rmse(bEst, bFlat) < 0.2, `GRM threshold RMSE < 0.2, got ${rmse(bEst, bFlat).toFixed(3)}`);
  // GRM thresholds must be ordered within each item.
  res.itemParameters.forEach((p) => {
    for (let k = 1; k < p.thresholds.length; k++) assert.ok(p.thresholds[k] >= p.thresholds[k - 1], 'ordered thresholds');
  });
});

test('GPCM recovers known item parameters', () => {
  const data = simulate('GPCM', aTrue, bTrue, 1500, 67890);
  const res = estimatePolytomousIRT(data, names, 'GPCM', 150, 0.001);
  const aEst = res.itemParameters.map((p) => p.discrimination);
  const bEst = res.itemParameters.flatMap((p) => p.thresholds);
  const bFlat = bTrue.flat();
  assert.ok(corr(aEst, aTrue) > 0.9, `GPCM a corr > 0.9, got ${corr(aEst, aTrue).toFixed(3)}`);
  assert.ok(corr(bEst, bFlat) > 0.97, `GPCM step corr > 0.97, got ${corr(bEst, bFlat).toFixed(3)}`);
});
