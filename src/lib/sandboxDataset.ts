// Turn Scale-Sandbox collected responses into an analysis-ready dataset.
// Reverse-scored items are recoded (min + max − value) exactly as the sandbox's
// own reliability analysis does, item columns are named and labelled, and
// subscale + total scores are added as computed columns — so the result can be
// dropped straight into CTT, factor analysis, path analysis, SEM, etc.

import type { VariableDef, Measure } from '../components/DataGridEditor';

export interface SandboxItem { id: string; content: string; reversed: boolean; subscale?: string }
export interface SandboxProjectLite {
  name: string;
  items: SandboxItem[];
  subscales?: string[];
  response_scale: { type: 'likert' | 'binary'; min: number; max: number; labels?: string[] };
}

export interface BuiltDataset {
  columns: string[];
  data: Array<Record<string, number | ''>>;
  variables: VariableDef[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Make a safe, unique column token from a subscale/label.
function slug(s: string): string {
  const base = s.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Sub';
  return /^[A-Za-z]/.test(base) ? base : `S_${base}`;
}

export function buildSandboxDataset(project: SandboxProjectLite, responseRows: number[][]): BuiltDataset {
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

  // Assemble rows.
  const data = responseRows.map((raw) => {
    const row: Record<string, number | ''> = {};
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
    columns: [...itemCols, ...scoreCols.map((s) => s.name)],
    data,
    variables: [...itemVars, ...scoreVars],
  };
}
