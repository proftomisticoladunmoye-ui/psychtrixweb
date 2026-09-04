import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSandboxDataset, parseQuestionnaireImport, validateInstrument, SandboxProjectLite } from '../src/lib/sandboxDataset';

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

test('applies reverse-scoring (min+maxâˆ’v) to flagged items', () => {
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

const demoProject: SandboxProjectLite = {
  name: 'Wellbeing',
  response_scale: { type: 'likert', min: 1, max: 5, labels: ['SD', 'D', 'N', 'A', 'SA'] },
  subscales: ['Anxiety'],
  demographics: [
    { id: 'g', name: 'Gender', type: 'categorical', role: 'grouping', options: ['Male', 'Female'] },
    { id: 'age', name: 'Age', type: 'continuous', role: 'criterion' },
  ],
  items: [
    { id: 'a', content: 'I feel tense', reversed: false, subscale: 'Anxiety' },
    { id: 'b', content: 'I feel calm', reversed: true, subscale: 'Anxiety' },
  ],
};

test('demographic columns lead the dataset and carry role/measure metadata', () => {
  const built = buildSandboxDataset(
    demoProject,
    [[3, 2], [4, 1]],
    [{ g: 'Male', age: 21 }, { g: 'Female', age: 34 }],
  );
  // demographics come first, then items, then scores
  assert.equal(built.columns[0], 'Gender');
  assert.equal(built.columns[1], 'Age');
  assert.equal(built.data[0].Gender, 'Male');
  assert.equal(built.data[1].Gender, 'Female');
  assert.equal(built.data[0].Age, 21);            // continuous -> numeric
  const gvar = built.variables.find(v => v.name === 'Gender');
  assert.equal(gvar.measure, 'nominal');
  assert.equal(gvar.type, 'string');
  assert.deepEqual(gvar.values.map(x => x.value), ['Male', 'Female']);
  assert.match(gvar.label, /grouping/);
  const agevar = built.variables.find(v => v.name === 'Age');
  assert.equal(agevar.measure, 'scale');
});

test('missing demographic answers become blank cells', () => {
  const built = buildSandboxDataset(demoProject, [[3, 2]], [{}]);
  assert.equal(built.data[0].Gender, '');
  assert.equal(built.data[0].Age, '');
});

const hierProject: SandboxProjectLite = {
  name: 'Academic Wellbeing',
  response_scale: { type: 'likert', min: 1, max: 5, labels: [] },
  constructs: [
    { id: 'c1', name: 'Academic Stress', subconstructs: [
      { id: 's1', name: 'Workload' }, { id: 's2', name: 'Exams' },
    ] },
  ],
  items: [
    { id: 'i1', content: 'Too much work', reversed: false, constructId: 'c1', subconstructId: 's1' },
    { id: 'i2', content: 'Deadlines pile up', reversed: false, constructId: 'c1', subconstructId: 's1' },
    { id: 'i3', content: 'Exams stress me', reversed: false, constructId: 'c1', subconstructId: 's2' },
  ],
};

test('hierarchy: emits subconstruct + construct + grand scores with nested names', () => {
  const built = buildSandboxDataset(hierProject, [[4, 2, 5]]);
  assert.deepEqual(built.columns, [
    'Academic_Stress_Workload_1', 'Academic_Stress_Workload_2', 'Academic_Stress_Exams_1',
    'Academic_Stress_Workload_Total', 'Academic_Stress_Workload_Mean',
    'Academic_Stress_Exams_Total', 'Academic_Stress_Exams_Mean',
    'Academic_Stress_Total', 'Academic_Stress_Mean',
    'Total_Score', 'Total_Mean',
  ]);
  const r = built.data[0];
  assert.equal(r.Academic_Stress_Workload_Total, 6);   // 4 + 2
  assert.equal(r.Academic_Stress_Workload_Mean, 3);
  assert.equal(r.Academic_Stress_Exams_Total, 5);
  assert.equal(r.Academic_Stress_Total, 11);           // 4 + 2 + 5
  assert.equal(r.Total_Score, 11);
});


test('parseQuestionnaireImport: header-mapped table -> hierarchy', () => {
  const text = [
    'item\tconstruct\tdimension\treverse',
    'I feel tense\tAcademic Stress\tWorkload\tno',
    'I feel calm\tAcademic Stress\tWorkload\tyes',
    'Exams stress me\tAcademic Stress\tExams\t',
    'I feel happy\tWellbeing\tMood\t',
  ].join('\n');
  const r = parseQuestionnaireImport(text);
  assert.ok(!('error' in r));
  const res = r as any;
  assert.equal(res.constructs.length, 2);
  assert.equal(res.constructs[0].name, 'Academic Stress');
  assert.deepEqual(res.constructs[0].subconstructs.map(s => s.name), ['Workload', 'Exams']);
  assert.equal(res.items.length, 4);
  assert.equal(res.items[1].reversed, true);            // "yes"
  assert.equal(res.items[0].constructId, res.constructs[0].id);
  assert.equal(res.items[2].subconstructId, res.constructs[0].subconstructs[1].id); // Exams
});

test('parseQuestionnaireImport: no header falls back to column order', () => {
  const r = parseQuestionnaireImport('Q1,Anxiety,,\nQ2,Anxiety,,r') as any;
  assert.ok(!('error' in r));
  assert.equal(r.constructs.length, 1);
  assert.equal(r.constructs[0].name, 'Anxiety');
  assert.equal(r.items[1].reversed, true);
});

test('parseQuestionnaireImport: empty input errors', () => {
  assert.ok('error' in parseQuestionnaireImport('   '));
});

test('validateInstrument flags orphans, thin constructs and bad demographics', () => {
  const p: SandboxProjectLite = {
    name: 'X',
    response_scale: { type: 'likert', min: 1, max: 5 },
    constructs: [{ id: 'c1', name: 'Solo', subconstructs: [] }],
    demographics: [{ id: 'g', name: 'Gender', type: 'categorical', role: 'grouping', options: ['Male'] }],
    items: [
      { id: 'i1', content: 'only item', reversed: false, constructId: 'c1' },
      { id: 'i2', content: 'orphan', reversed: false },
    ],
  };
  const issues = validateInstrument(p);
  assert.ok(issues.some(x => x.level === 'error' && /not assigned/.test(x.message)));   // orphan item
  assert.ok(issues.some(x => x.level === 'warning' && /only 1 item/.test(x.message)));  // thin construct
  assert.ok(issues.some(x => x.level === 'error' && /at least two options/.test(x.message))); // 1-option group
});

test('validateInstrument is clean for a well-formed instrument', () => {
  const p: SandboxProjectLite = {
    name: 'Y',
    response_scale: { type: 'likert', min: 1, max: 5 },
    constructs: [{ id: 'c1', name: 'A', subconstructs: [] }],
    items: [
      { id: 'i1', content: 'a', reversed: false, constructId: 'c1' },
      { id: 'i2', content: 'b', reversed: false, constructId: 'c1' },
    ],
  };
  assert.equal(validateInstrument(p).length, 0);
});

