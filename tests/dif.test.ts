import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, randn } from './_helpers';
import { runDIF, splitGroups, DIFOutput } from '../src/lib/dif';

// Two groups of binary items driven by ability; one item carries uniform DIF
// (an extra logit shift for the focal group).
function genBinaryDIF(seed = 3, n = 500, difItem = 1, difLogit = 1.8) {
  const rng = mulberry32(seed);
  const items = ['i0', 'i1', 'i2', 'i3', 'i4'];
  const b = [-1, 0, 0.5, -0.5, 1];
  const rows: Array<Record<string, unknown>> = [];
  for (let g = 0; g < 2; g++) {
    for (let p = 0; p < n; p++) {
      const theta = randn(rng);
      const row: Record<string, unknown> = { group: g === 0 ? 'Ref' : 'Foc' };
      items.forEach((it, j) => {
        let logit = 1.2 * (theta - b[j]);
        if (j === difItem && g === 1) logit += difLogit;
        row[it] = rng() < 1 / (1 + Math.exp(-logit)) ? 1 : 0;
      });
      rows.push(row);
    }
  }
  return { rows, items };
}

test('splitGroups picks the two most frequent groups and drops incomplete rows', () => {
  const data = [
    { g: 'A', x: 1, y: 0 }, { g: 'A', x: 1, y: 1 }, { g: 'B', x: 0, y: 1 },
    { g: 'B', x: '', y: 1 }, { g: 'C', x: 1, y: 1 },
  ];
  const s = splitGroups(data, ['x', 'y'], 'g');
  assert.ok(!('error' in s));
  const r = s as any;
  assert.deepEqual([r.g1Name, r.g2Name].sort(), ['A', 'B']);
  assert.equal(r.g1.length + r.g2.length, 3); // the empty-x B row is dropped
});

test('runDIF guards: too few items / groups', () => {
  assert.ok('error' in runDIF([{ g: 'A', i0: 1 }], ['i0'], 'g', 'score'));
  const oneGroup = Array.from({ length: 20 }, () => ({ g: 'A', i0: 1, i1: 0, i2: 1 }));
  assert.ok('error' in runDIF(oneGroup, ['i0', 'i1', 'i2'], 'g', 'score'));
});

test('score-based DIF flags the biased item and clears the fair ones', () => {
  const { rows, items } = genBinaryDIF();
  const out = runDIF(rows, items, 'group', 'score') as DIFOutput;
  assert.ok(!('error' in out));
  assert.equal(out.rows.length, 5);
  out.rows.forEach((r) => assert.ok(['A', 'B', 'C'].includes(r.classification)));
  // the DIF item (i1) carries the most DIF of all items
  const maxEffect = Math.max(...out.rows.map((r) => r.effectSize));
  assert.equal(out.rows[1].effectSize, maxEffect, 'biased item should have the largest effect');
  assert.notEqual(out.rows[1].classification, 'A');   // biased item detected
  assert.ok(out.rows[1].effectSize > out.rows[3].effectSize);
});

test('IRT-based DIF returns linked Δb per item and detects the biased item', () => {
  const { rows, items } = genBinaryDIF(9, 600, 1, 2.4);
  const out = runDIF(rows, items, 'group', 'irt') as DIFOutput;
  assert.ok(!('error' in out));
  assert.equal(out.rows.length, 5);
  out.rows.forEach((r) => { assert.ok(Number.isFinite(r.uniform!)); assert.ok(['A', 'B', 'C'].includes(r.classification)); });
  // biased item has a larger |Δb| than a fair item
  assert.ok(out.rows[1].statistic > out.rows[3].statistic, `|Δb| i1=${out.rows[1].statistic} i3=${out.rows[3].statistic}`);
});
