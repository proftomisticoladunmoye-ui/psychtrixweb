import test from 'node:test';
import assert from 'node:assert/strict';
import { computeColumn, compileExpression, summarize } from '../src/lib/computeVariable';

const rows = (arr: Array<Record<string, number | string>>) => arr;

test('sum of items', () => {
  const data = rows([{ a: 1, b: 2, c: 3 }, { a: 4, b: 5, c: 6 }]);
  const out = computeColumn(data, { method: 'sum', items: ['a', 'b', 'c'] });
  assert.deepEqual(out, [6, 15]);
});

test('mean of items with reverse-scoring (1..5 scale)', () => {
  // reverse b: new = 1+5 - b
  const data = rows([{ a: 5, b: 1 }, { a: 4, b: 2 }]);
  const out = computeColumn(data, {
    method: 'mean', items: ['a', 'b'], reverse: { b: true }, scaleMin: 1, scaleMax: 5,
  });
  // row0: a=5, b->(6-1)=5 => mean 5 ; row1: a=4, b->(6-2)=4 => mean 4
  assert.deepEqual(out, [5, 4]);
});

test('mean honors minValid (missing when too few items answered)', () => {
  const data = rows([{ a: 2, b: '', c: '' }]);
  const out = computeColumn(data, { method: 'mean', items: ['a', 'b', 'c'], minValid: 2 });
  assert.deepEqual(out, ['']);
});

test('zscore standardizes to mean 0, sd 1', () => {
  const data = rows([{ x: 2 }, { x: 4 }, { x: 6 }]);
  const out = computeColumn(data, { method: 'zscore', source: 'x' }) as number[];
  // mean 4, sample sd = 2 -> (-1, 0, 1)
  assert.ok(Math.abs(out[0] + 1) < 1e-9);
  assert.ok(Math.abs(out[1] - 0) < 1e-9);
  assert.ok(Math.abs(out[2] - 1) < 1e-9);
});

test('rank with average ties', () => {
  const data = rows([{ x: 10 }, { x: 20 }, { x: 20 }, { x: 30 }]);
  const out = computeColumn(data, { method: 'rank', source: 'x' });
  assert.deepEqual(out, [1, 2.5, 2.5, 4]);
});

test('recode ranges with else-keep', () => {
  const data = rows([{ age: 17 }, { age: 40 }, { age: 70 }]);
  const out = computeColumn(data, {
    method: 'recode', source: 'age',
    rules: [{ lo: 0, hi: 17, to: 1 }, { lo: 18, hi: 64, to: 2 }],
    elseKeep: false,
  });
  assert.deepEqual(out, [1, 2, '']); // 70 unmatched, not kept -> missing
});

test('expression: arithmetic, precedence, functions', () => {
  const f = compileExpression('(a + b) / 2 * 10');
  assert.equal(f({ a: 3, b: 7 }), 50);
  const g = compileExpression('sqrt(a) + max(b, c)');
  assert.equal(g({ a: 9, b: 2, c: 5 }), 8);
  const h = compileExpression('mean(a, b, c)');
  assert.equal(h({ a: 2, b: 4, c: 6 }), 4);
});

test('expression: unary minus and power', () => {
  assert.equal(compileExpression('-a ^ 2')({ a: 3 }), -9); // -(3^2) per right-assoc unary below ^? verify explicitly
  assert.equal(compileExpression('(-a) ^ 2')({ a: 3 }), 9);
  assert.equal(compileExpression('2 ^ 3 ^ 2')({}), 512); // right-assoc: 2^(3^2)
});

test('expression: missing operand -> missing result', () => {
  const f = compileExpression('a + b');
  assert.equal(f({ a: 1, b: '' }), '');
});

test('summarize reports valid/missing and stats', () => {
  const s = summarize([1, 2, '', 3]);
  assert.equal(s.valid, 3);
  assert.equal(s.missing, 1);
  assert.equal(s.min, 1);
  assert.equal(s.max, 3);
  assert.equal(s.mean, 2);
});
