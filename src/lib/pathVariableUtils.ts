// Variable-discovery helpers for the Path Analysis Visual Builder.
// Pure, dependency-free, and cheap to memoize — designed to stay responsive with
// thousands of variables. No fabricated metadata: a type is only asserted when it
// can be determined from real metadata or the actual data.

export type VarType = 'numeric' | 'categorical' | 'unknown';
export type VarMeasure = 'scale' | 'ordinal' | 'nominal';

export interface VariableInfo {
  name: string;
  label?: string;
  type: VarType;
  measure?: VarMeasure;
  /** precomputed lowercase haystack (name + label) for fast search */
  _h: string;
}

// Determine numeric vs categorical from a sample of values. Returns 'unknown'
// when there's nothing to judge (all blank) rather than guessing.
export function detectType(samples: any[]): VarType {
  const vals = samples.filter(
    (v) => v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v)),
  );
  if (!vals.length) return 'unknown';
  const allNumeric = vals.every((v) =>
    typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
  return allNumeric ? 'numeric' : 'categorical';
}

// Build the variable index. `meta` (SPSS-style var defs) is used first; otherwise
// the type is inferred from a small per-column data sample.
export function buildVariableIndex(
  columns: string[],
  opts: {
    meta?: Array<{ name: string; label?: string; type?: string; measure?: string }>;
    columnTypes?: Array<{ name: string; type?: string }>;
    data?: any[];
    sampleSize?: number;
  } = {},
): VariableInfo[] {
  const metaByName = new Map((opts.meta || []).map((m) => [m.name, m]));
  const ctypeByName = new Map((opts.columnTypes || []).map((c) => [c.name, c.type]));
  const rows = opts.data || [];
  const sampleN = Math.min(opts.sampleSize ?? 60, rows.length);

  return columns.map((name) => {
    const m = metaByName.get(name);
    let type: VarType = 'unknown';
    let measure: VarMeasure | undefined;
    let label: string | undefined = m?.label || undefined;

    if (m && (m.type || m.measure)) {
      measure = (m.measure as VarMeasure) || undefined;
      if (m.type === 'string' || measure === 'nominal') type = 'categorical';
      else if (measure === 'scale' || m.type === 'numeric') type = 'numeric';
      else if (measure === 'ordinal') type = 'numeric'; // ordinal is numeric-coded; kept for the Ordinal filter
    }
    if (type === 'unknown') {
      const ct = ctypeByName.get(name);
      if (ct === 'numeric') type = 'numeric';
      else if (ct === 'string') type = 'categorical';
    }
    if (type === 'unknown' && sampleN > 0) {
      const samples: any[] = [];
      for (let i = 0; i < sampleN; i++) samples.push(rows[i]?.[name]);
      type = detectType(samples);
    }
    return { name, label, type, measure, _h: (name + ' ' + (label || '')).toLowerCase() };
  });
}

export type VarFilter = 'all' | 'numeric' | 'categorical' | 'scale' | 'ordinal' | 'nominal' | 'inmodel' | 'unused' | 'favorites' | 'recent';

export interface VarStats {
  type: VarType;
  validN: number;
  missing: number;
  missingPct: number;
  distinct: number;
  distinctCapped: boolean;
  mean?: number;
  sd?: number;
  min?: number;
  max?: number;
}

// Single-pass descriptive summary of one column. Cheap enough to run lazily on
// demand (e.g. when a metadata popover opens) and cache; never fabricates values.
export function computeVarStats(name: string, data: any[]): VarStats {
  let n = 0, miss = 0, sum = 0, sumsq = 0, min = Infinity, max = -Infinity, numericCount = 0;
  let nonNumeric = false, capped = false;
  const seen = new Set<string>();
  for (let i = 0; i < data.length; i++) {
    const v = data[i]?.[name];
    if (v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))) { miss++; continue; }
    n++;
    if (!capped) { seen.add(typeof v === 'string' ? v : String(v)); if (seen.size >= 200) capped = true; }
    const num = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(num) && (typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''))) {
      numericCount++; sum += num; sumsq += num * num; if (num < min) min = num; if (num > max) max = num;
    } else nonNumeric = true;
  }
  const total = n + miss;
  const type: VarType = n === 0 ? 'unknown' : (!nonNumeric && numericCount === n ? 'numeric' : 'categorical');
  const stats: VarStats = {
    type, validN: n, missing: miss, missingPct: total ? +((miss / total) * 100).toFixed(1) : 0,
    distinct: seen.size, distinctCapped: capped,
  };
  if (type === 'numeric' && numericCount > 0) {
    const mean = sum / numericCount;
    const varc = numericCount > 1 ? (sumsq - (sum * sum) / numericCount) / (numericCount - 1) : 0;
    stats.mean = mean; stats.sd = Math.sqrt(Math.max(0, varc)); stats.min = min; stats.max = max;
  }
  return stats;
}

export function matchesFilter(v: VariableInfo, filter: VarFilter, inModel: Set<string>): boolean {
  switch (filter) {
    case 'all': return true;
    case 'numeric': return v.type === 'numeric';
    case 'categorical': return v.type === 'categorical';
    case 'scale': return v.measure === 'scale';
    case 'ordinal': return v.measure === 'ordinal';
    case 'nominal': return v.measure === 'nominal';
    case 'inmodel': return inModel.has(v.name);
    case 'unused': return !inModel.has(v.name);
    default: return true;
  }
}

// Case-insensitive partial search over name + label.
export function searchVariables(
  index: VariableInfo[], query: string, filter: VarFilter, inModel: Set<string>,
): VariableInfo[] {
  const q = query.trim().toLowerCase();
  const out: VariableInfo[] = [];
  for (const v of index) {
    if (!matchesFilter(v, filter, inModel)) continue;
    if (q && !v._h.includes(q)) continue;
    out.push(v);
  }
  return out;
}

export interface VarGroup { key: string; label: string; items: VariableInfo[] }

// Conservative grouping: variables that share a common alphanumeric prefix
// followed by an index number (item batteries like PAT1..PAT6) are grouped under
// that prefix. Everything else stays ungrouped. Never invents constructs.
export function groupVariables(vars: VariableInfo[]): { groups: VarGroup[]; ungrouped: VariableInfo[] } {
  const prefixOf = (name: string): string | null => {
    const m = name.match(/^(.*?[A-Za-z])[ _.\-]?\d+[A-Za-z_]*$/);
    if (!m) return null;
    const p = m[1].replace(/[ _.\-]+$/, '');
    return p.length >= 2 ? p : null;
  };
  const buckets = new Map<string, VariableInfo[]>();
  const order: string[] = [];
  const ungrouped: VariableInfo[] = [];
  for (const v of vars) {
    const p = prefixOf(v.name);
    if (p) {
      if (!buckets.has(p)) { buckets.set(p, []); order.push(p); }
      buckets.get(p)!.push(v);
    } else ungrouped.push(v);
  }
  const groups: VarGroup[] = [];
  for (const p of order) {
    const items = buckets.get(p)!;
    if (items.length >= 2) groups.push({ key: p, label: p, items });
    else ungrouped.push(items[0]);
  }
  groups.sort((a, b) => a.label.localeCompare(b.label));
  ungrouped.sort((a, b) => a.name.localeCompare(b.name));
  return { groups, ungrouped };
}

export const TYPE_BADGE: Record<VarType, { label: string; cls: string }> = {
  numeric: { label: 'Numeric', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  categorical: { label: 'Categorical', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  unknown: { label: 'Type n/a', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};
