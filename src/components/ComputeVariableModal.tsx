import { useMemo, useState } from 'react';
import { X, Calculator, AlertCircle, Plus, Trash2, FunctionSquare } from 'lucide-react';
import { computeColumn, summarize, ComputeMethod, ComputeSpec, RecodeRule, Cell } from '../lib/computeVariable';

// SPSS-style "Compute / Transform Variable" dialog. Builds a new column from
// existing ones (scale scores, standardized scores, recodes, free expressions)
// and hands the computed values back to the parent to save as a new dataset.

interface Props {
  columns: string[];
  data: Array<Record<string, unknown>>;
  saving?: boolean;
  onClose: () => void;
  onApply: (name: string, values: Cell[], methodLabel: string) => void;
}

const METHODS: { id: ComputeMethod; label: string; blurb: string }[] = [
  { id: 'mean', label: 'Mean of items', blurb: 'Average of selected items — a scale/subscale score' },
  { id: 'sum', label: 'Sum of items', blurb: 'Total of selected items' },
  { id: 'zscore', label: 'Standardize (z)', blurb: 'Convert one variable to a z-score (mean 0, SD 1)' },
  { id: 'recode', label: 'Recode', blurb: 'Map values/ranges to new codes (e.g. age → groups)' },
  { id: 'rank', label: 'Rank', blurb: 'Rank cases on one variable (ties averaged)' },
  { id: 'expression', label: 'Expression', blurb: 'Any formula, e.g. (q1 + q2 + q3) / 3' },
];

// A column is numeric if the bulk of its non-empty values parse as numbers.
function numericColumns(columns: string[], data: Array<Record<string, unknown>>): string[] {
  return columns.filter((c) => {
    let seen = 0, num = 0;
    for (const row of data) {
      const v = row[c];
      if (v === '' || v === null || v === undefined) continue;
      seen++;
      if (Number.isFinite(typeof v === 'number' ? v : Number(String(v).trim()))) num++;
      if (seen >= 30) break;
    }
    return seen > 0 && num / seen >= 0.8;
  });
}

export function ComputeVariableModal({ columns, data, saving, onClose, onApply }: Props) {
  const numCols = useMemo(() => numericColumns(columns, data), [columns, data]);

  const [name, setName] = useState('');
  const [method, setMethod] = useState<ComputeMethod>('mean');
  const [items, setItems] = useState<Set<string>>(new Set());
  const [reverse, setReverse] = useState<Record<string, boolean>>({});
  const [scaleMin, setScaleMin] = useState(1);
  const [scaleMax, setScaleMax] = useState(5);
  const [minValid, setMinValid] = useState(1);
  const [source, setSource] = useState(numCols[0] ?? '');
  const [rules, setRules] = useState<RecodeRule[]>([{ lo: 0, hi: 0, to: 1 }]);
  const [elseKeep, setElseKeep] = useState(false);
  const [expression, setExpression] = useState('');

  const toggleItem = (c: string) =>
    setItems((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const spec: ComputeSpec = useMemo(() => ({
    method,
    items: [...items],
    reverse,
    scaleMin, scaleMax, minValid,
    source,
    rules,
    elseKeep,
    expression,
  }), [method, items, reverse, scaleMin, scaleMax, minValid, source, rules, elseKeep, expression]);

  // Live preview (guard expression syntax errors).
  const { values, error, stats } = useMemo(() => {
    try {
      if (method === 'expression' && !expression.trim()) return { values: [] as Cell[], error: '', stats: null };
      if ((method === 'sum' || method === 'mean') && items.size === 0)
        return { values: [] as Cell[], error: '', stats: null };
      const vals = computeColumn(data, spec);
      return { values: vals, error: '', stats: summarize(vals) };
    } catch (e: any) {
      return { values: [] as Cell[], error: e?.message || 'Could not evaluate', stats: null };
    }
  }, [spec, data, method, expression, items]);

  const nameError =
    !name.trim() ? 'Enter a name for the new variable.'
    : columns.some((c) => c.toLowerCase() === name.trim().toLowerCase()) ? 'That name already exists in this dataset.'
    : !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name.trim()) ? 'Use letters, numbers and underscores; start with a letter.'
    : '';

  const canApply = !nameError && !error && values.length > 0 && (stats?.valid ?? 0) > 0;

  const apply = () => { if (canApply) onApply(name.trim(), values, METHODS.find((m) => m.id === method)!.label); };

  const insertToken = (tok: string) => setExpression((e) => (e ? `${e} ${tok}` : tok));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Calculator className="w-5 h-5 text-blue-600" />Compute Variable</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Target name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">New variable name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anxiety_Score"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            {name.trim() && nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
          </div>

          {/* Method picker */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Method</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {METHODS.map((m) => (
                <button key={m.id} onClick={() => setMethod(m.id)}
                  className={`text-left px-3 py-2 rounded-lg border text-sm transition ${method === m.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <span className="font-medium text-gray-800">{m.label}</span>
                  <span className="block text-[11px] text-gray-500 leading-tight mt-0.5">{m.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Method-specific controls */}
          {(method === 'sum' || method === 'mean') && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Scale min</label>
                  <input type="number" value={scaleMin} onChange={(e) => setScaleMin(Number(e.target.value))} className="w-20 px-2 py-1.5 border border-gray-300 rounded" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Scale max</label>
                  <input type="number" value={scaleMax} onChange={(e) => setScaleMax(Number(e.target.value))} className="w-20 px-2 py-1.5 border border-gray-300 rounded" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Min items answered</label>
                  <input type="number" min={1} value={minValid} onChange={(e) => setMinValid(Math.max(1, Number(e.target.value)))} className="w-24 px-2 py-1.5 border border-gray-300 rounded" />
                </div>
                <p className="text-xs text-gray-500 flex-1 min-w-[180px]">Tick the items; use “rev” for reverse-scored items (recoded as min + max − value).</p>
              </div>
              <div className="border border-gray-200 rounded-lg max-h-52 overflow-auto divide-y divide-gray-100">
                {numCols.length === 0 && <p className="p-3 text-sm text-gray-500">No numeric variables found.</p>}
                {numCols.map((c) => (
                  <div key={c} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50">
                    <label className="flex items-center gap-2 cursor-pointer flex-1">
                      <input type="checkbox" checked={items.has(c)} onChange={() => toggleItem(c)} className="rounded" />
                      <span className="text-sm text-gray-800">{c}</span>
                    </label>
                    {items.has(c) && (
                      <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={!!reverse[c]} onChange={(e) => setReverse((p) => ({ ...p, [c]: e.target.checked }))} className="rounded" />rev
                      </label>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">{items.size} item{items.size !== 1 ? 's' : ''} selected</p>
            </div>
          )}

          {(method === 'zscore' || method === 'rank') && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source variable</label>
              <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-lg bg-white">
                {numCols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {method === 'recode' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Source variable</label>
                <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-lg bg-white">
                  {numCols.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                  <span className="w-20">Low</span><span className="w-20">High</span><span className="w-24">→ New value</span>
                </div>
                {rules.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="number" value={r.lo} onChange={(e) => setRules((p) => p.map((x, j) => j === i ? { ...x, lo: Number(e.target.value) } : x))} className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    <input type="number" value={r.hi} onChange={(e) => setRules((p) => p.map((x, j) => j === i ? { ...x, hi: Number(e.target.value) } : x))} className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    <input type="number" value={r.to} onChange={(e) => setRules((p) => p.map((x, j) => j === i ? { ...x, to: e.target.value === '' ? '' : Number(e.target.value) } : x))} placeholder="(missing)" className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    <button onClick={() => setRules((p) => p.length <= 1 ? p : p.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <div className="flex items-center gap-4 flex-wrap">
                  <button onClick={() => setRules((p) => [...p, { lo: 0, hi: 0, to: '' }])} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"><Plus className="w-4 h-4 text-blue-600" />Add rule</button>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" checked={elseKeep} onChange={(e) => setElseKeep(e.target.checked)} className="rounded" />Keep original value when no rule matches</label>
                </div>
                <p className="text-xs text-gray-500">For a single value, set Low = High. Blank “New value” = system missing.</p>
              </div>
            </div>
          )}

          {method === 'expression' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">Expression</label>
              <textarea value={expression} onChange={(e) => setExpression(e.target.value)} rows={3}
                placeholder="(q1 + q2 + q3) / 3" className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500" />
              <div className="flex flex-wrap gap-1.5">
                {numCols.slice(0, 24).map((c) => (
                  <button key={c} onClick={() => insertToken(c)} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded hover:bg-blue-100">{c}</button>
                ))}
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1"><FunctionSquare className="w-3.5 h-3.5" />Operators + − * / ^ and functions: mean, sum, min, max, sqrt, abs, ln, log, exp, round, pow.</p>
            </div>
          )}

          {/* Preview */}
          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Preview</p>
            {error ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" /><p className="text-sm text-red-800">{error}</p>
              </div>
            ) : stats ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="text-gray-600">Valid: <b className="text-gray-900">{stats.valid}</b></span>
                  <span className="text-gray-600">Missing: <b className="text-gray-900">{stats.missing}</b></span>
                  {stats.mean !== undefined && <span className="text-gray-600">Mean: <b className="text-gray-900">{stats.mean.toFixed(2)}</b></span>}
                  {stats.min !== undefined && <span className="text-gray-600">Range: <b className="text-gray-900">{stats.min} – {stats.max}</b></span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {values.slice(0, 12).map((v, i) => (
                    <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 rounded text-gray-700">{v === '' ? '·' : typeof v === 'number' ? Number(v.toFixed(3)) : v}</span>
                  ))}
                  {values.length > 12 && <span className="text-xs text-gray-400 self-center">…{values.length - 12} more</span>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Choose a method and variables to see a preview.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-200 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-800">Cancel</button>
          <button onClick={apply} disabled={!canApply || saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium">
            {saving ? 'Saving…' : 'Compute & Save as New Dataset'}
          </button>
        </div>
      </div>
    </div>
  );
}
