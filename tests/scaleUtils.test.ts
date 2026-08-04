import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCronbachAlpha,
  calculateCorrectedItemTotalCorrelation,
  calculateMcDonaldOmega,
  calculateSplitHalfReliability,
  calculatePercentiles,
  calculateZScore,
  calculateTScore,
} from '../src/lib/scaleUtils';
import { mulberry32, randn } from './_helpers';

const approx = (a: number, b: number, tol = 1e-3, msg = '') =>
  assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${a} ≈ ${b} (±${tol})`);

// Hand-computed reference: α = (k/(k-1))·(1 − Σσ²ᵢ/σ²_total).
// Σσ²ᵢ/σ²_total is scale-of-variance invariant, so the value below holds for
// either the population or sample variance convention.
const REF = [
  [4, 5, 4],
  [3, 3, 2],
  [5, 5, 5],
  [2, 3, 3],
  [4, 4, 5],
  [3, 2, 3],
];

test('Cronbach α matches an independent hand calculation', () => {
  approx(calculateCronbachAlpha(REF), 0.9049, 5e-3, 'α(REF)');
});

test('Cronbach α = 1 for identical items, and is bounded', () => {
  const identical = Array.from({ length: 10 }, (_, i) => [i, i, i, i]);
  approx(calculateCronbachAlpha(identical), 1, 1e-6, 'identical items');
  approx(calculateCronbachAlpha(REF) <= 1 ? 1 : 0, 1, 0, 'α ≤ 1');
});

test('corrected item-total correlation is perfect for identical items', () => {
  const identical = Array.from({ length: 8 }, (_, i) => [i, i, i]);
  approx(calculateCorrectedItemTotalCorrelation(identical, 0), 1, 1e-6, 'r_it identical');
});

test('McDonald ω recovers a strong single-factor scale', () => {
  // Congeneric 1-factor data: xᵢⱼ = λⱼ·θ + εⱼ. High loadings ⇒ high ω.
  const rng = mulberry32(20260804);
  const lambda = [0.8, 0.75, 0.8, 0.7, 0.78, 0.72];
  const data: number[][] = [];
  for (let i = 0; i < 500; i++) {
    const theta = randn(rng);
    data.push(lambda.map((l) => l * theta + Math.sqrt(1 - l * l) * randn(rng)));
  }
  const omega = calculateMcDonaldOmega(data);
  assert.ok(omega > 0.82 && omega <= 1, `ω should be high for a strong scale, got ${omega}`);
  const splitHalf = calculateSplitHalfReliability(data);
  assert.ok(splitHalf > 0.7 && splitHalf <= 1, `split-half in range, got ${splitHalf}`);
});

test('percentiles are ordered and centred correctly on 1..100', () => {
  const scores = Array.from({ length: 100 }, (_, i) => i + 1);
  const p = calculatePercentiles(scores);
  approx(p[50], 50.5, 1e-6, 'median');
  approx(p[25], 25.75, 0.5, 'Q1');
  approx(p[75], 75.25, 0.5, 'Q3');
  assert.ok(p[5] < p[25] && p[25] < p[50] && p[50] < p[75] && p[75] < p[95], 'monotone');
});

test('z and T scores use the standard formulas', () => {
  approx(calculateZScore(60, 50, 10), 1, 1e-9, 'z');
  approx(calculateZScore(50, 50, 10), 0, 1e-9, 'z at mean');
  approx(calculateTScore(50, 50, 10), 50, 1e-9, 'T at mean = 50');
  approx(calculateTScore(60, 50, 10), 60, 1e-9, 'T at +1SD = 60');
});
