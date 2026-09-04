// Turn Scale-Sandbox collected responses into an analysis-ready dataset.
// Reverse-scored items are recoded (min + max − value) exactly as the sandbox's
// own reliability analysis does, item columns are named and labelled, and
// subscale + total scores are added as computed columns — so the result can be
// dropped straight into CTT, factor analysis, path analysis, SEM, etc.

import type { VariableDef, Measure } from '../components/DataGridEditor';

export interface SandboxItem {
  id: string;
  content: string;
  reversed: boolean;
  subscale?: string;        // legacy flat grouping (retained for backward-compat)
  constructId?: string;     // hierarchy: which construct this item belongs to
  subconstructId?: string;  // hierarchy: which subconstruct/dimension within it
}

// Construct > Subconstruct > Item hierarchy. An instrument holds several
// constructs, each with optional subconstructs/dimensions; items are assigned
// to a construct and (optionally) a subconstruct within it.
export interface SandboxSubconstruct { id: string; name: string }
export interface SandboxConstruct { id: string; name: string; subconstructs: SandboxSubconstruct[] }

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
  constructs?: SandboxConstruct[];
  demographics?: DemographicVariable[];
  response_scale: { type: 'likert' | 'binary'; min: number; max: number; labels?: string[] };
}

// ---- questionnaire import ---------------------------------------------------
// Parse a pasted table into the construct hierarchy. Columns are detected by a
// header row (item / construct / subconstruct|dimension / reverse) or, without
// one, assumed in the order: item, construct, subconstruct, reversed. Tab- or
// comma-separated. Lets a researcher bring a whole instrument in at once.
export interface ParsedImport { constructs: SandboxConstruct[]; items: SandboxItem[]; warnings: string[] }

const REV_RE = /^(y|yes|true|1|r|rev|reverse|reversed)$/i;

export function parseQuestionnaireImport(text: string): ParsedImport | { error: string } {
  const raw = (text || '').replace(/\r/g, '').trim();
  if (!raw) return { error: 'Nothing to import — paste a table first.' };
  const lines = raw.split('\n').map((l) => l).filter((l) => l.trim() !== '');
  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : '\t';
  const rows = lines.map((l) => l.split(delim).map((c) => c.trim()));

  // Header detection + column mapping.
  const head = rows[0].map((c) => c.toLowerCase());
  const find = (...keys: string[]) => head.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
  let itemCol = find('item', 'content', 'question', 'statement');
  let constructCol = find('construct', 'scale', 'factor');
  let subCol = find('subconstruct', 'dimension', 'subscale', 'facet');
  let revCol = find('reverse', 'reversed', 'recode');
  const hasHeader = itemCol !== -1 || constructCol !== -1;
  if (!hasHeader) { itemCol = 0; constructCol = 1; subCol = 2; revCol = 3; }
  if (itemCol === -1) itemCol = 0;

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const constructs: SandboxConstruct[] = [];
  const cByName = new Map<string, SandboxConstruct>();
  const items: SandboxItem[] = [];
  const warnings: string[] = [];
  let ci = 0;

  dataRows.forEach((r, ri) => {
    const content = (r[itemCol] ?? '').trim();
    if (!content) return;
    const cName = (constructCol !== -1 ? (r[constructCol] ?? '').trim() : '') || 'General';
    const sName = subCol !== -1 ? (r[subCol] ?? '').trim() : '';
    const reversed = revCol !== -1 ? REV_RE.test((r[revCol] ?? '').trim()) : false;

    let c = cByName.get(cName);
    if (!c) { c = { id: `c_${ci++}`, name: cName, subconstructs: [] }; cByName.set(cName, c); constructs.push(c); }
    let scId: string | undefined;
    if (sName) {
      let sc = c.subconstructs.find((s) => s.name === sName);
      if (!sc) { sc = { id: `${c.id}_s${c.subconstructs.length}`, name: sName }; c.subconstructs.push(sc); }
      scId = sc.id;
    }
    items.push({ id: `i_${ri}_${Math.random().toString(36).slice(2, 6)}`, content, reversed, constructId: c.id, subconstructId: scId });
  });

  if (!items.length) return { error: 'No item rows found. Expected columns: item, construct, [dimension], [reverse].' };
  if (constructs.length === 1 && constructs[0].name === 'General') warnings.push('No construct column detected — all items were placed under a single "General" construct.');
  return { constructs, items, warnings };
}

// ---- structure validation ---------------------------------------------------
export interface ValidationIssue { level: 'error' | 'warning'; message: string }

export function validateInstrument(project: SandboxProjectLite): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { constructs, placement } = resolveHierarchy(project);
  const items = project.items ?? [];

  if (constructs.length === 0) issues.push({ level: 'error', message: 'No constructs defined — add at least one construct.' });
  if (items.length === 0) issues.push({ level: 'error', message: 'No items defined.' });

  const orphan = items.filter((_, i) => !placement[i].cId).length;
  if (orphan > 0) issues.push({ level: 'error', message: `${orphan} item${orphan > 1 ? 's are' : ' is'} not assigned to any construct.` });

  items.forEach((it, i) => { if (!it.content || !it.content.trim()) issues.push({ level: 'error', message: `Item ${i + 1} has no text.` }); });

  for (const c of constructs) {
    const n = items.filter((_, i) => placement[i].cId === c.id).length;
    if (n === 0) issues.push({ level: 'warning', message: `Construct "${c.name}" has no items.` });
    else if (n < 2) issues.push({ level: 'warning', message: `Construct "${c.name}" has only ${n} item — reliability needs ≥ 2.` });
    for (const sc of c.subconstructs) {
      const sn = items.filter((_, i) => placement[i].scId === sc.id).length;
      if (sn === 1) issues.push({ level: 'warning', message: `Dimension "${c.name} / ${sc.name}" has only 1 item.` });
    }
  }

  const demos = project.demographics ?? [];
  const dnames = demos.map((d) => d.name.trim().toLowerCase());
  if (new Set(dnames).size !== dnames.length) issues.push({ level: 'error', message: 'Two demographic variables share the same name.' });
  demos.forEach((d) => {
    if (d.type !== 'continuous' && (!d.options || d.options.length < 2))
      issues.push({ level: 'error', message: `Grouping variable "${d.name}" needs at least two options.` });
  });

  return issues;
}

interface ItemPlacement { cId?: string; cName?: string; scId?: string; scName?: string }

// Resolve the effective hierarchy for the dataset builder + analysis. Uses the
// explicit constructs tree when present; otherwise derives one from the legacy
// flat `subscale` (each distinct subscale becomes a construct) so old
// instruments produce exactly the same columns as before.
export function resolveHierarchy(project: SandboxProjectLite): { constructs: SandboxConstruct[]; placement: ItemPlacement[] } {
  const items = project.items ?? [];
  if (project.constructs && project.constructs.length) {
    const byId = new Map(project.constructs.map((c) => [c.id, c]));
    const placement = items.map((it) => {
      const c = it.constructId ? byId.get(it.constructId) : undefined;
      const sc = c && it.subconstructId ? c.subconstructs.find((s) => s.id === it.subconstructId) : undefined;
      return { cId: c?.id, cName: c?.name, scId: sc?.id, scName: sc?.name };
    });
    return { constructs: project.constructs, placement };
  }
  const names = [...new Set(items.map((it) => it.subscale).filter(Boolean))] as string[];
  const constructs: SandboxConstruct[] = names.map((n) => ({ id: n, name: n, subconstructs: [] }));
  const placement: ItemPlacement[] = items.map((it) => (it.subscale ? { cId: it.subscale, cName: it.subscale } : {}));
  return { constructs, placement };
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

  // Resolve the Construct › Subconstruct hierarchy (or derive it from legacy
  // subscales) and name item columns from it.
  const { constructs, placement } = resolveHierarchy(project);
  const usedNames = new Set<string>();
  const groupCounters: Record<string, number> = {};
  const itemCols = items.map((_item, i) => {
    const p = placement[i];
    let name: string;
    if (p.scId && p.cName && p.scName) { const key = `${p.cId}|${p.scId}`; groupCounters[key] = (groupCounters[key] ?? 0) + 1; name = `${slug(p.cName)}_${slug(p.scName)}_${groupCounters[key]}`; }
    else if (p.cId && p.cName) { const key = p.cId; groupCounters[key] = (groupCounters[key] ?? 0) + 1; name = `${slug(p.cName)}_${groupCounters[key]}`; }
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

  // Score columns: subconstruct scores, then construct scores, then grand total.
  const scoreCols: { name: string; label: string; idxs: number[]; kind: 'sum' | 'mean' }[] = [];
  for (const c of constructs) {
    for (const sc of c.subconstructs) {
      const idxs = items.map((_, i) => (placement[i].scId === sc.id ? i : -1)).filter((i) => i >= 0);
      if (!idxs.length) continue;
      const base = `${slug(c.name)}_${slug(sc.name)}`;
      scoreCols.push({ name: `${base}_Total`, label: `${c.name} / ${sc.name} — total`, idxs, kind: 'sum' });
      scoreCols.push({ name: `${base}_Mean`, label: `${c.name} / ${sc.name} — mean`, idxs, kind: 'mean' });
    }
  }
  for (const c of constructs) {
    const idxs = items.map((_, i) => (placement[i].cId === c.id ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) continue;
    const base = slug(c.name);
    scoreCols.push({ name: `${base}_Total`, label: `${c.name} — total score`, idxs, kind: 'sum' });
    scoreCols.push({ name: `${base}_Mean`, label: `${c.name} — mean score`, idxs, kind: 'mean' });
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
