import test from 'node:test';
import assert from 'node:assert/strict';
// rn-names.js is dependency-free (no DB), so it bundles + runs in isolation.
import { cleanAuthorName } from '../server/rn-names.js';

test('cleanAuthorName strips academic credentials and honorifics', () => {
  assert.equal(cleanAuthorName('Enoch O. Oladunmoye, PhD'), 'Enoch O. Oladunmoye');
  assert.equal(cleanAuthorName('Enoch o. Oladunmoye, PhD'), 'Enoch O. Oladunmoye'); // lone initial upcased
  assert.equal(cleanAuthorName('Dr. Jane A. Smith, Ph.D., MBA'), 'Jane A. Smith');
  assert.equal(cleanAuthorName('Maria de la Cruz, MD'), 'Maria de la Cruz');
  assert.equal(cleanAuthorName('Enoch O. Oladunmoye'), 'Enoch O. Oladunmoye'); // unchanged
});

test('cleanAuthorName keeps genuine name suffixes (Jr/Sr/III)', () => {
  assert.equal(cleanAuthorName('John Doe Jr.'), 'John Doe Jr.');
  assert.equal(cleanAuthorName('Robert King III'), 'Robert King III');
});

test('all "PhD"-suffixed variants of one author normalize to one identical name', () => {
  const names = ['Enoch O. Oladunmoye', 'Enoch O. Oladunmoye, PhD', 'Enoch o. Oladunmoye, PhD']
    .map((n) => cleanAuthorName(n));
  assert.deepEqual(names, ['Enoch O. Oladunmoye', 'Enoch O. Oladunmoye', 'Enoch O. Oladunmoye']);
  // The corrupting suffix that broke Scholar's citation_author is gone.
  assert.ok(names.every((n) => !/phd/i.test(n)));
});
