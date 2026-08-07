import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSandboxDataset, SandboxProjectLite } from '../src/lib/sandboxDataset';

const project: SandboxProjectLite = {
  name: 'Wellbeing',
  response_scale: { type: 'likert', min: 1, max: 5, labels: ['SD', 'D', 'N', 'A', 'SA'] },
  subscales: ['Anxiety', 'Mood'],
  items: [
    { id: 'a', content: 'I feel tense', reversed: false, subscale: 'Anxiety' },
    { id: 'b', content: 'I feel calm', reversed: true, subscale: 'Anxiety' },
    { id: 'c', content: 'I feel happy', reversed: false, subscale: 'Mood' },
  ],
};

test('builds item + subscale + total columns with stable names', () => {
  const { columns } = buildSandboxDataset(project, [[3, 2, 4]]);
  assert.deepEqual(columns, [
    'Anxiety_1', 'Anxiety_2', 'Mood_1',
    'Anxiety_Total', 'Anxiety_Mean',
    'Mood_Total', 'Mood_Mean',
    'Total_Score', 'Total_Mean',
  ]);
});

test('applies reverse-scoring (min+max−v) to flagged items', () => {
  const { data } = buildSandboxDataset(project, [[3, 2, 4]]);
  // item b reversed: 1+5-2 = 4
  assert.equal(data[0].Anxiety_1, 3);
  assert.equal(data[0].Anxiety_2, 4);
  assert.equal(data[0].Mood_1, 4);
});

test('computes subscale and grand scores on reverse-scored values', () => {
  const { data } = buildSandboxDataset(project, [[3, 2, 4]]);
  // Anxiety items (rev): 3, 4 -> total 7, mean 3.5
  assert.equal(data[0].Anxiety_Total, 7);
  assert.equal(data[0].Anxiety_Mean, 3.5);
  // Mood: 4 -> total 4, mean 4
  assert.equal(data[0].Mood_Total, 4);
  // Grand: 3 + 4 + 4 = 11, mean 11/3
  assert.equal(data[0].Total_Score, 11);
  assert.ok(Math.abs((data[0].Total_Mean as number) - 11 / 3) < 1e-9);
});

test('missing responses are skipped in scores, cell left blank', () => {
  const { data } = buildSandboxDataset(project, [[3, null as any, 4]]);
  assert.equal(data[0].Anxiety_2, '');          // missing item cell
  assert.equal(data[0].Anxiety_Total, 3);        // only the one present item counts
  assert.equal(data[0].Total_Score, 7);          // 3 + 4
});

test('item variable metadata carries measure + value labels', () => {
  const { variables } = buildSandboxDataset(project, [[3, 2, 4]]);
  const a1 = variables.find((v) => v.name === 'Anxiety_1')!;
  assert.equal(a1.measure, 'ordinal');
  assert.equal(a1.values.length, 5);
  assert.deepEqual(a1.values[0], { value: '1', label: 'SD' });
  const rev = variables.find((v) => v.name === 'Anxiety_2')!;
  assert.match(rev.label, /reverse-scored/);
  const total = variables.find((v) => v.name === 'Total_Score')!;
  assert.equal(total.measure, 'scale');
});
