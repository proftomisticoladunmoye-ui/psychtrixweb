import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExploratoryFactorAnalysis } from '../src/lib/factorAnalysis';
import { mulberry32, randn } from './_helpers';

// One-factor congeneric data: p items all loading on a single latent factor.
function oneFactor(n: number, loadings: number[], seed: number): number[][] {
  const rng = mulberry32(seed);
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const f = randn(rng);
    rows.push(loadings.map((l) => l * f + Math.sqrt(1 - l * l) * randn(rng)));
  }
  return rows;
}

// Two independent factors: items 1..h load on F1, items h+1..2h on F2.
function twoFactor(n: number, per: number, load: number, seed: number): number[][] {
  const rng = mulberry32(seed);
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const f1 = randn(rng), f2 = randn(rng);
    const row: number[] = [];
    for (let j = 0; j < per; j++) row.push(load * f1 + Math.sqrt(1 - load * load) * randn(rng));
    for (let j = 0; j < per; j++) row.push(load * f2 + Math.sqrt(1 - load * load) * randn(rng));
    rows.push(row);
  }
  return rows;
}

test('parallel analysis recovers the true number of factors', () => {
  const one = oneFactor(400, [0.75, 0.7, 0.72, 0.68, 0.74, 0.71], 101);
  const pa1 = ExploratoryFactorAnalysis.parallelAnalysis(one, 40, 95);
  assert.equal(pa1.suggestedFactors, 1, `1-factor data → 1, got ${pa1.suggestedFactors}`);

  const two = twoFactor(400, 3, 0.75, 202);
  const pa2 = ExploratoryFactorAnalysis.parallelAnalysis(two, 40, 95);
  assert.equal(pa2.suggestedFactors, 2, `2-factor data → 2, got ${pa2.suggestedFactors}`);
});

test('EFA recovers strong first-factor loadings', () => {
  const data = oneFactor(400, [0.8, 0.75, 0.8, 0.72, 0.78], 303);
  const res = ExploratoryFactorAnalysis.run(data, ['v1', 'v2', 'v3', 'v4', 'v5'], { method: 'pca' });
  // Every item should load substantially on the first factor (sign may flip).
  const first = res.loadings.map((row: number[]) => Math.abs(row[0]));
  assert.ok(first.every((l) => l > 0.5), `all |loadings| > 0.5, got ${first.map((x) => x.toFixed(2))}`);
  // KMO should indicate factorability on clean data.
  assert.ok(res.kmo.overall > 0.6, `KMO > 0.6, got ${res.kmo.overall}`);
});
