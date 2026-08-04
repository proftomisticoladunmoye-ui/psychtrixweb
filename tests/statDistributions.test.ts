import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lgamma, normalCDF, chiSqPValue } from '../src/lib/statDistributions';

const approx = (a: number, b: number, tol = 1e-3, msg = '') =>
  assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${a} ≈ ${b} (±${tol})`);

test('normalCDF matches known standard-normal values', () => {
  approx(normalCDF(0), 0.5, 1e-9, 'Φ(0)');
  approx(normalCDF(1), 0.8413447, 1e-4, 'Φ(1)');
  approx(normalCDF(1.959964), 0.975, 1e-3, 'Φ(1.96)');
  approx(normalCDF(-1.959964), 0.025, 1e-3, 'Φ(-1.96)');
  assert.ok(normalCDF(6) > 0.999999 && normalCDF(-6) < 1e-6, 'tails');
  // symmetric
  approx(normalCDF(0.7) + normalCDF(-0.7), 1, 1e-9, 'symmetry');
});

test('lgamma matches ln Γ at known points', () => {
  approx(lgamma(1), 0, 1e-9, 'lnΓ(1)=ln0!');
  approx(lgamma(2), 0, 1e-9, 'lnΓ(2)=ln1!');
  approx(lgamma(0.5), 0.5723649429, 1e-6, 'lnΓ(0.5)=ln√π');
  approx(lgamma(5), Math.log(24), 1e-6, 'lnΓ(5)=ln4!');
  approx(lgamma(10), 12.8018274801, 1e-4, 'lnΓ(10)');
});

test('chiSqPValue matches known critical values', () => {
  approx(chiSqPValue(3.841459, 1), 0.05, 2e-3, 'χ²(1) 5%');
  approx(chiSqPValue(5.991465, 2), 0.05, 2e-3, 'χ²(2) 5%');
  approx(chiSqPValue(11.070498, 5), 0.05, 2e-3, 'χ²(5) 5%');
  approx(chiSqPValue(0, 3), 1, 1e-6, 'χ²=0 → p=1');
  // monotone decreasing in the statistic
  assert.ok(chiSqPValue(2, 4) > chiSqPValue(9, 4), 'monotone');
  // valid probability range
  const p = chiSqPValue(7, 3);
  assert.ok(p >= 0 && p <= 1, 'in [0,1]');
});
