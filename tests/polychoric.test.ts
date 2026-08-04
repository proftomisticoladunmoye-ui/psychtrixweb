import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalInv } from '../src/lib/polychoric';

const approx = (a: number, b: number, tol = 1e-3, msg = '') =>
  assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${a} ≈ ${b} (±${tol})`);

test('normalInv is the inverse standard-normal CDF at known points', () => {
  approx(normalInv(0.5), 0, 1e-6, 'Φ⁻¹(0.5)');
  approx(normalInv(0.975), 1.959964, 2e-3, 'Φ⁻¹(0.975)');
  approx(normalInv(0.025), -1.959964, 2e-3, 'Φ⁻¹(0.025)');
  approx(normalInv(0.8413447), 1, 3e-3, 'Φ⁻¹(0.8413)');
  approx(normalInv(0.1586553), -1, 3e-3, 'Φ⁻¹(0.1587)');
});

test('normalInv is strictly increasing and antisymmetric', () => {
  assert.ok(normalInv(0.2) < normalInv(0.4) && normalInv(0.4) < normalInv(0.6), 'monotone');
  approx(normalInv(0.3) + normalInv(0.7), 0, 1e-6, 'antisymmetry');
});
