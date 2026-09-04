// Turn Scale-Sandbox collected responses into an analysis-ready dataset.
// Reverse-scored items are recoded (min + max − value) exactly as the sandbox's
// own reliability analysis does, item columns are named and labelled, and
// subscale + total scores are added as computed columns — so the result can be
// dropped straight into CTT, factor analysis, path analysis, SEM, etc.

import type { VariableDef, Measure } from '../components/DataGridEditor';

export interface SandboxItem { id: string; content: string; reversed: boolean; subscale?: string }

// A demographic / grouping variable defined on the instrument. These are kept
// structurally separate from the psychometric items and flow into the dataset
// as their own columns, so modules like Measurement Invariance, Multi-Group CFA
// and DIF can pick them as the grouping / criterion variable.
export type DemographicType = 'categorical' | 'ordinal' | 'continuous';
export type DemographicRole = 'grouping' | 'criterion' | 'descriptive';
export interface DemographicVariable {
  id: string;
  name: string;
  type: DemographicType;
  role: DemographicRole;
  options?: string[];   // choices for categorical / ordinal
  required?: boolean;
}

export interface SandboxProjectLite {
  name: string;
  items: SandboxItem[];
  subscales?: string[];
  demographics?: DemographicVariable[];
  response_scale: { type: 'likert' | 'binary'; min: number; max: number; labels?: string[] };
}

export type DatasetCell = number | string | '';
export interface BuiltDataset {
  columns: string[];
  data: Array<Record<string, DatasetCell>>;
  variables: VariableDef[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Make a safe, unique column token from a subscale/label.
function slug(s: string): string {
  const base = s.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Sub';
  return /^[A-Za-z]/.test(base) ? base : `S_${base}`;
}

export function buildSandboxDataset(
  project: SandboxProjectLite,
  responseRows: number[][],
  demographicRows?: Array<Record<string, unknown>>, // aligned with responseRows, keyed by demographic id
): BuiltDataset {
  const items = project.items ?? [];
  const min = project.response_scale?.min ?? 1;
  const max = project.response_scale?.max ?? 5;
  const labels = project.response_scale?.labels ?? [];
  const itemMeasure: Measure = project.response_scale?.type === 'binary' ? 'nominal' : 'ordinal';

  // Value labels for Likert/binary points (min..max → labels), reused per item.
  const pointValues = () => {
    const out: { value: string; label: string }[] = [];
    for (let v = min; v <= max; v++) {
      const lab = labels[v - min];
      if (lab) out.push({ value: String(v), label: lab });
    }
    return out;
  };

  // Unique item column names.
  const usedNames = new Set<string>();
  const subCounters: Record<string, number> = {};
  const itemCols = items.map((it, i) => {
    let name: string;
    if (it.subscale) { const s = slug(it.subscale); subCounters[s] = (subCounters[s] ?? 0) + 1; name = `${s}_${subCounters[s]}`; }
    else name = `Item${i + 1}`;
    while (usedNames.has(name)) name += '_';
    usedNames.add(name);
    return name;
  });

  const rev = (raw: number, reversed: boolean) => (reversed ? min + max - raw : raw);

  // Item variable definitions.
  const itemVars: VariableDef[] = items.map((it, i) => ({
    name: itemCols[i],
    label: it.content + (it.reversed ? ' (reverse-scored)' : ''),
    type: 'numeric',
    measure: itemMeasure,
    values: pointValues(),
    missing: [],
  }));

  // Which item indices belong to each subscale (that actually has items present).
  const subscaleNames = (project.subscales ?? []).filter((s) =>
    items.some((it) => it.subscale === s));
  const subscaleIdx: Record<string, number[]> = {};
  for (const s of subscaleNames) subscaleIdx[s] = items.map((it, i) => (it.subscale === s ? i : -1)).filter((i) => i >= 0);

  // Build score-column definitions (subscale totals/means, then grand total/mean).
  const scoreCols: { name: string; label: string; idxs: number[]; kind: 'sum' | 'mean' }[] = [];
  for (const s of subscaleNames) {
    const sName = slug(s);
    scoreCols.push({ name: `${sName}_Total`, label: `${s} — total score`, idxs: subscaleIdx[s], kind: 'sum' });
    scoreCols.push({ name: `${sName}_Mean`, label: `${s} — mean score`, idxs: subscaleIdx[s], kind: 'mean' });
  }
  const allIdx = items.map((_, i) => i);
  scoreCols.push({ name: 'Total_Score', label: 'Total score (all items)', idxs: allIdx, kind: 'sum' });
  scoreCols.push({ name: 'Total_Mean', label: 'Mean score (all items)', idxs: allIdx, kind: 'mean' });

  // Ensure score column names don't collide with item names.
  for (const sc of scoreCols) { while (usedNames.has(sc.name)) sc.name += '_'; usedNames.add(sc.name); }

  const scoreVars: VariableDef[] = scoreCols.map((sc) => ({
    name: sc.name, label: sc.label, type: 'numeric', measure: 'scale', values: [], missing: [],
  }));

  // Demographic / grouping columns — these LEAD the dataset and are kept
  // structurally separate from the psychometric items, so downstream modules
  // (invariance, multi-group CFA, DIF, regression) can pick them as the group /
  // criterion variable.
  const demos = project.demographics ?? [];
  const demoCols = demos.map((d) => {
    let name = slug(d.name);
    while (usedNames.has(name)) name += '_';
    usedNames.add(name);
    const measure: Measure = d.type === 'continuous' ? 'scale' : d.type === 'ordinal' ? 'ordinal' : 'nominal';
    const values = d.type !== 'continuous' && d.options?.length ? d.options.map((o) => ({ value: o, label: o })) : [];
    return { def: d, name, colType: (d.type === 'continuous' ? 'numeric' : 'string') as 'numeric' | 'string', measure, values };
  });
  const demoVars: VariableDef[] = demoCols.map((d) => ({
    name: d.name, label: `${d.def.name} (${d.def.role})`, type: d.colType, measure: d.measure, values: d.values, missing: [],
  }));

  // Assemble rows.
  const data = responseRows.map((raw, ri) => {
    const row: Record<string, DatasetCell> = {};
    demoCols.forEach((d) => {
      const val = demographicRows?.[ri]?.[d.def.id];
      if (val === undefined || val === null || val === '') row[d.name] = '';
      else if (d.colType === 'numeric') { const nnum = Number(val); row[d.name] = Number.isFinite(nnum) ? nnum : ''; }
      else row[d.name] = String(val);
    });
    const revVals: Array<number | null> = items.map((it, i) => {
      const v = raw?.[i];
      return isNum(v) ? rev(v, it.reversed) : null;
    });
    itemCols.forEach((c, i) => { row[c] = revVals[i] == null ? '' : (revVals[i] as number); });
    for (const sc of scoreCols) {
      const vals = sc.idxs.map((i) => revVals[i]).filter((v): v is number => v != null);
      if (!vals.length) { row[sc.name] = ''; continue; }
      const sum = vals.reduce((a, b) => a + b, 0);
      row[sc.name] = sc.kind === 'sum' ? sum : sum / vals.length;
    }
    return row;
  });

  return {
    columns: [...demoCols.map((d) => d.name), ...itemCols, ...scoreCols.map((s) => s.name)],
    data,
    variables: [...demoVars, ...itemVars, ...scoreVars],
  };
}
