import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeasurementInvarianceTester } from '../src/lib/measurementInvariance';
import { mulberry32, randn } from './_helpers';

const ITEMS = ['i1', 'i2', 'i3', 'i4'];
const MODEL = { factorStructure: { F1: ITEMS }, groups: ['A', 'B'] };

// Congeneric 1-factor data with intercepts τ and loadings λ per group.
function makeGroup(n: number, lambda: number[], tau: number[], seed: number): number[][] {
  const rng = mulberry32(seed);
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const f = randn(rng);
    rows.push(lambda.map((l, j) => tau[j] + l * f + Math.sqrt(1 - l * l) * randn(rng)));
  }
  return rows;
}

const lambda = [0.8, 0.75, 0.7, 0.78];
const tau = [0.0, 0.2, -0.1, 0.1];

function run(groupB: { lambda: number[]; tau: number[] }) {
  const gA = makeGroup(300, lambda, tau, 111);
  const gB = makeGroup(300, groupB.lambda, groupB.tau, 222);
  const data = [...gA, ...gB];
  const groupVar = [...gA.map(() => 0), ...gB.map(() => 1)];
  return MeasurementInvarianceTester.test(data, groupVar, MODEL as any, ITEMS);
}

function metricComparison(res: any) {
  return res.comparisons.find((c: any) => /metric/i.test(c.comparison) || c.model2 === 'metric');
}

test('metric invariance is SUPPORTED when groups share loadings', () => {
  const res = run({ lambda, tau }); // identical parameters
  const cmp = metricComparison(res);
  assert.ok(cmp, 'a metric-vs-configural comparison exists');
  assert.ok(
    cmp.decision === 'supported' || cmp.deltaCFI <= 0.01,
    `expected support for invariant data (decision=${cmp.decision}, ΔCFI=${cmp.deltaCFI})`,
  );
});

test('metric invariance is NOT supported when one loading differs across groups', () => {
  const badLambda = [0.3, 0.75, 0.7, 0.78]; // item 1 loading much lower in group B
  const res = run({ lambda: badLambda, tau });
  const cmp = metricComparison(res);
  assert.ok(cmp, 'a metric comparison exists');
  assert.ok(
    cmp.decision === 'not supported' || cmp.deltaCFI > 0.01,
    `expected a violation to be flagged (decision=${cmp.decision}, ΔCFI=${cmp.deltaCFI})`,
  );
});
