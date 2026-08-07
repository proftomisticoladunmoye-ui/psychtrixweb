import React, { useMemo, useRef, useState } from 'react';
import {
  Plus, Trash2, ClipboardPaste, Save, X, Table2, AlertCircle, Grid3x3, Columns3,
  Ruler, BarChart3, CircleDot, Tags, Eye, EyeOff, ChevronUp, ChevronDown,
} from 'lucide-react';

// An SPSS-style editable data editor. Two views:
//   • Data View     — the spreadsheet of cases × variables, with Excel-like
//                     keyboard navigation (arrows / Enter / Tab move between
//                     cells and auto-grow the grid).
//   • Variable View — define each variable: name, label, type, measurement
//                     level (nominal / ordinal / scale) and value labels
//                     (coding, e.g. 1 = Male, 2 = Female).
// Variable definitions travel with the dataset (stored in metadata.variables)
// so downstream analyses can respect measurement level and show value labels.

export type Measure = 'nominal' | 'ordinal' | 'scale';
export type VarType = 'numeric' | 'string';
export interface ValueLabel { value: string; label: string; }
export interface VariableDef {
  name: string;
  label: string;        // descriptive label ("Respondent's sex")
  type: VarType;        // numeric | string
  measure: Measure;     // nominal | ordinal | scale (interval/ratio)
  values: ValueLabel[]; // coding: [{value:'1',label:'Male'}, …]
  missing: string[];    // discrete missing-value codes (e.g. ['99'])
}

interface DataGridEditorProps {
  initialColumns?: string[];
  initialRows?: string[][];
  initialName?: string;
  saving?: boolean;
  onSave: (name: string, columns: string[], rows: string[][], variables: VariableDef[]) => void | Promise<void>;
  onCancel: () => void;
}

const MAX_ROWS = 2000; // manual/paste editing cap; larger data should be imported as a file
const MAX_COLS = 100;

const MEASURES: Record<Measure, { label: string; Icon: typeof Ruler; color: string; hint: string }> = {
  scale:   { label: 'Scale',   Icon: Ruler,     color: 'text-emerald-600', hint: 'Interval/ratio — means, SD, correlations' },
  ordinal: { label: 'Ordinal', Icon: BarChart3, color: 'text-amber-600',   hint: 'Ordered categories — medians, ranks' },
  nominal: { label: 'Nominal', Icon: CircleDot, color: 'text-sky-600',     hint: 'Unordered categories — counts, mode' },
};

const makeVar = (name: string, type: VarType = 'numeric'): VariableDef => ({
  name, label: '', type, measure: type === 'string' ? 'nominal' : 'scale', values: [], missing: [],
});

// Excel / Sheets copies as TSV; a pasted CSV uses commas. Prefer tabs when present.
function parseBlock(text: string): string[][] {
  const t = text.replace(/\r/g, '').replace(/\n+$/, '');
  if (!t) return [];
  const delim = t.includes('\t') ? '\t' : t.split('\n')[0].includes(',') ? ',' : '\t';
  return t.split('\n').map((line) => line.split(delim));
}

function rectangular(rows: string[][], width: number): string[][] {
  return rows.map((r) => {
    const out = r.slice(0, width);
    while (out.length < width) out.push('');
    return out;
  });
}

export function DataGridEditor({ initialColumns, initialRows, initialName, saving, onSave, onCancel }: DataGridEditorProps) {
  const [variables, setVariables] = useState<VariableDef[]>(
    (initialColumns && initialColumns.length ? initialColumns : ['var1', 'var2', 'var3']).map((n) => makeVar(n)),
  );
  const [rows, setRows] = useState<string[][]>(() => {
    const w = (initialColumns && initialColumns.length) || 3;
    if (initialRows && initialRows.length) return rectangular(initialRows, w);
    return Array.from({ length: 8 }, () => Array(w).fill(''));
  });
  const [view, setView] = useState<'data' | 'variable'>('data');
  const [name, setName] = useState(initialName || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showLabels, setShowLabels] = useState(false); // display value labels instead of codes
  const [valueEditor, setValueEditor] = useState<number | null>(null); // variable index whose values are being edited
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteHasHeader, setPasteHasHeader] = useState(true);
  const [pasteMode, setPasteMode] = useState<'replace' | 'append'>('replace');

  const columns = useMemo(() => variables.map((v) => v.name), [variables]);

  // ---- keyboard navigation (Data View) --------------------------------------
  const cellRefs = useRef(new Map<string, HTMLInputElement>());
  const cellKey = (r: number, c: number) => `${r}:${c}`;
  const registerCell = (r: number, c: number) => (el: HTMLInputElement | null) => {
    const k = cellKey(r, c);
    if (el) cellRefs.current.set(k, el); else cellRefs.current.delete(k);
  };
  const focusCell = (r: number, c: number) => {
    const el = cellRefs.current.get(cellKey(r, c));
    if (el) { el.focus(); el.select(); }
  };
  const moveTo = (r: number, c: number, mode: 'clamp' | 'wrap' | 'wrapback' = 'clamp') => {
    const cols = variables.length;
    if (mode === 'wrap') { if (c >= cols) { c = 0; r += 1; } }
    else if (mode === 'wrapback') { if (c < 0) { c = cols - 1; r -= 1; } }
    else if (c < 0 || c >= cols) return; // arrows don't wrap horizontally
    if (r < 0 || c < 0 || c >= cols) return;
    if (r >= rows.length) {
      if (rows.length >= MAX_ROWS) return;
      setRows((prev) => [...prev, Array(cols).fill('')]);
      requestAnimationFrame(() => focusCell(r, c)); // focus the freshly-added row after render
      return;
    }
    focusCell(r, c);
  };
  const onCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const inp = e.currentTarget;
    const atStart = inp.selectionStart === 0 && inp.selectionEnd === 0;
    const atEnd = inp.selectionStart === inp.value.length && inp.selectionEnd === inp.value.length;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveTo(r + 1, c); break;
      case 'ArrowUp':   e.preventDefault(); moveTo(r - 1, c); break;
      case 'Enter':     e.preventDefault(); moveTo(r + 1, c); break;
      case 'ArrowLeft':  if (atStart) { e.preventDefault(); moveTo(r, c - 1); } break;
      case 'ArrowRight': if (atEnd)   { e.preventDefault(); moveTo(r, c + 1); } break;
      case 'Tab': e.preventDefault(); moveTo(r, c + (e.shiftKey ? -1 : 1), e.shiftKey ? 'wrapback' : 'wrap'); break;
      default: break;
    }
  };

  // ---- cell + structure edits -----------------------------------------------
  const setCell = (r: number, c: number, value: string) => {
    setRows((prev) => { const next = prev.map((row) => row.slice()); next[r][c] = value; return next; });
  };

  const patchVar = (c: number, patch: Partial<VariableDef>) =>
    setVariables((prev) => prev.map((v, i) => (i === c ? { ...v, ...patch } : v)));

  const addRow = () => setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, Array(variables.length).fill('')]));
  const deleteRow = (r: number) => setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== r)));

  const addColumn = () => {
    if (variables.length >= MAX_COLS) return;
    setVariables((prev) => [...prev, makeVar(`var${prev.length + 1}`)]);
    setRows((prev) => prev.map((row) => [...row, '']));
  };
  const deleteColumn = (c: number) => {
    if (variables.length <= 1) return;
    setVariables((prev) => prev.filter((_, i) => i !== c));
    setRows((prev) => prev.map((row) => row.filter((_, i) => i !== c)));
  };
  // Reorder a variable (and its column of data) up/down — like SPSS drag-reorder.
  const moveColumn = (c: number, dir: -1 | 1) => {
    const t = c + dir;
    if (t < 0 || t >= variables.length) return;
    const swap = <T,>(a: T[]) => { const n = a.slice(); [n[c], n[t]] = [n[t], n[c]]; return n; };
    setVariables((prev) => swap(prev));
    setRows((prev) => prev.map((row) => swap(row)));
  };

  // Write a pasted block into the grid starting at (r, c), growing rows/cols as needed.
  const writeBlock = (block: string[][], r: number, c: number) => {
    if (!block.length) return;
    const widthNeeded = Math.min(MAX_COLS, c + Math.max(...block.map((b) => b.length)));
    setVariables((prev) => { const v = prev.slice(); while (v.length < widthNeeded) v.push(makeVar(`var${v.length + 1}`)); return v; });
    setRows((prev) => {
      const width = Math.max(widthNeeded, variables.length);
      let next = prev.map((row) => row.slice());
      block.forEach((brow, i) => {
        const rr = r + i;
        if (rr >= MAX_ROWS) return;
        while (next.length <= rr) next.push(Array(width).fill(''));
        brow.forEach((val, j) => { const cc = c + j; if (cc < MAX_COLS) next[rr][cc] = val; });
      });
      return rectangular(next, width);
    });
  };
  const onCellPaste = (e: React.ClipboardEvent, r: number, c: number) => {
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // single value → default paste
    e.preventDefault();
    writeBlock(parseBlock(text), r, c);
  };
  const applyPasteModal = () => {
    const block = parseBlock(pasteText);
    if (!block.length) { setShowPaste(false); return; }
    let header = columns;
    let body = block;
    if (pasteHasHeader) { header = block[0].map((h, i) => h.trim() || `var${i + 1}`); body = block.slice(1); }
    const width = Math.max(header.length, ...body.map((b) => b.length));
    if (pasteMode === 'replace') {
      const names = pasteHasHeader ? rectangular([header], width)[0] : Array.from({ length: width }, (_, i) => `var${i + 1}`);
      setVariables(names.map((n) => makeVar(n)));
      setRows(rectangular(body.length ? body : [Array(width).fill('')], width));
    } else {
      writeBlock(body, rows.length, 0);
    }
    setPasteText('');
    setShowPaste(false);
  };

  const nonEmptyRows = useMemo(() => rows.filter((r) => r.some((v) => v.trim() !== '')).length, [rows]);

  // Distinct non-empty values in a column, for "fill value labels from data".
  const distinctValues = (c: number): string[] => {
    const seen = new Set<string>();
    for (const row of rows) { const v = (row[c] ?? '').trim(); if (v) seen.add(v); }
    return [...seen].sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));
  };

  const handleSave = async () => {
    setError('');
    const trimmed = variables.map((v) => ({ ...v, name: v.name.trim() }));
    if (!name.trim()) return setError('Please give the dataset a name.');
    if (trimmed.some((v) => !v.name)) return setError('Every variable needs a name.');
    if (new Set(trimmed.map((v) => v.name.toLowerCase())).size !== trimmed.length)
      return setError('Variable names must be unique.');
    const dataRows = rows.filter((r) => r.some((v) => v.trim() !== ''));
    if (!dataRows.length) return setError('Enter at least one row of data.');
    try {
      setBusy(true);
      await onSave(name.trim(), trimmed.map((v) => v.name), dataRows, trimmed);
    } catch (e: any) {
      setError(e?.message || 'Could not save the dataset. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const labelFor = (c: number, code: string): string | null => {
    const hit = variables[c]?.values.find((x) => x.value === code);
    return hit ? hit.label : null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Table2 className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Enter Data</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving || busy}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition font-medium">
            <Save className="w-4 h-4" />{saving || busy ? 'Saving…' : 'Save Dataset'}
          </button>
          <button onClick={onCancel} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition">Cancel</button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Dataset name (e.g., Pilot Study Responses)"
          className="flex-1 min-w-[220px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={addRow} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"><Plus className="w-4 h-4 text-blue-600" />Row</button>
        <button onClick={addColumn} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"><Plus className="w-4 h-4 text-blue-600" />Variable</button>
        <button onClick={() => setShowPaste(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg"><ClipboardPaste className="w-4 h-4" />Paste from Excel/Sheets</button>
      </div>

      {/* View switch — Data View / Variable View, like SPSS's bottom tabs */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          <button onClick={() => setView('data')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${view === 'data' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
            <Grid3x3 className="w-4 h-4" />Data View
          </button>
          <button onClick={() => setView('variable')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-l border-gray-300 ${view === 'variable' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
            <Columns3 className="w-4 h-4" />Variable View
          </button>
        </div>
        {view === 'data' && (
          <button onClick={() => setShowLabels((s) => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
            {showLabels ? <EyeOff className="w-4 h-4 text-gray-500" /> : <Eye className="w-4 h-4 text-gray-500" />}
            {showLabels ? 'Show codes' : 'Show value labels'}
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500">
        {view === 'data'
          ? <>Type into any cell; <b>Arrow keys / Enter / Tab</b> move between cells (a new row is added when you go past the bottom). Paste a block from Excel/Sheets into any cell. </>
          : <>Define each variable — name, label, type, measurement level and value labels (coding). </>}
        {rows.length} row{rows.length !== 1 ? 's' : ''} · {nonEmptyRows} with data · {variables.length} variables.
      </p>

      {view === 'data' ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto max-h-[60vh]">
          <table className="text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-20 bg-gray-100 border-b border-r border-gray-200 px-2 py-1 text-gray-400 font-normal w-12">#</th>
                {variables.map((v, c) => {
                  const M = MEASURES[v.measure];
                  return (
                    <th key={c} className="border-b border-r border-gray-200 p-1 min-w-[130px]">
                      <div className="flex items-center gap-1">
                        <M.Icon className={`w-3.5 h-3.5 flex-shrink-0 ${M.color}`} aria-label={M.label} />
                        <input
                          value={v.name} onChange={(e) => patchVar(c, { name: e.target.value })}
                          title={v.label || v.name}
                          className="w-full px-2 py-1 text-xs font-semibold text-gray-800 bg-blue-50 border border-blue-100 rounded focus:ring-1 focus:ring-blue-400 focus:bg-white"
                        />
                        <button tabIndex={-1} onClick={() => deleteColumn(c)} title="Delete variable" className="text-gray-300 hover:text-red-600 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="hover:bg-blue-50/40 group">
                  <td className="sticky left-0 z-10 bg-gray-50 group-hover:bg-blue-50 border-b border-r border-gray-200 px-1 text-center text-gray-400 text-xs">
                    <div className="flex items-center justify-between gap-1">
                      <span className="w-6 text-right">{r + 1}</span>
                      <button tabIndex={-1} onClick={() => deleteRow(r)} title="Delete row" className="text-gray-300 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                  {variables.map((_, c) => {
                    const code = row[c] ?? '';
                    const lbl = labelFor(c, code);
                    if (showLabels) {
                      // Read-only value-label display (turn off to edit).
                      return (
                        <td key={c} className="border-b border-r border-gray-100 px-2 py-1 text-gray-700" title={lbl ? `${code} = ${lbl}` : undefined}>
                          {lbl ?? code}
                        </td>
                      );
                    }
                    return (
                      <td key={c} className="border-b border-r border-gray-100 p-0">
                        <input
                          ref={registerCell(r, c)}
                          value={code}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          onKeyDown={(e) => onCellKeyDown(e, r, c)}
                          onPaste={(e) => onCellPaste(e, r, c)}
                          title={lbl ? `${code} = ${lbl}` : undefined}
                          className="w-full px-2 py-1 text-gray-800 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-400"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ---- Variable View ---------------------------------------------------- */
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto max-h-[60vh]">
          <table className="text-sm border-collapse w-full">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="text-left text-xs font-semibold text-gray-600">
                <th className="border-b border-r border-gray-200 px-2 py-2 w-10">#</th>
                <th className="border-b border-r border-gray-200 px-2 py-2 min-w-[140px]">Name</th>
                <th className="border-b border-r border-gray-200 px-2 py-2 min-w-[180px]">Label</th>
                <th className="border-b border-r border-gray-200 px-2 py-2 w-28">Type</th>
                <th className="border-b border-r border-gray-200 px-2 py-2 w-36">Measure</th>
                <th className="border-b border-r border-gray-200 px-2 py-2 min-w-[200px]">Values (coding)</th>
                <th className="border-b border-r border-gray-200 px-2 py-2 w-24">Missing</th>
                <th className="border-b border-gray-200 px-2 py-2 w-20">Order</th>
              </tr>
            </thead>
            <tbody>
              {variables.map((v, c) => {
                const M = MEASURES[v.measure];
                const valueSummary = v.values.length ? v.values.map((x) => `${x.value} = ${x.label}`).join(', ') : 'None';
                return (
                  <tr key={c} className="hover:bg-blue-50/30">
                    <td className="border-b border-r border-gray-100 px-2 py-1 text-center text-gray-400 text-xs">{c + 1}</td>
                    <td className="border-b border-r border-gray-100 p-1">
                      <input value={v.name} onChange={(e) => patchVar(c, { name: e.target.value })}
                        className="w-full px-2 py-1 text-xs font-semibold text-gray-800 bg-blue-50 border border-blue-100 rounded focus:ring-1 focus:ring-blue-400 focus:bg-white" />
                    </td>
                    <td className="border-b border-r border-gray-100 p-1">
                      <input value={v.label} onChange={(e) => patchVar(c, { label: e.target.value })}
                        placeholder="Description (optional)"
                        className="w-full px-2 py-1 text-gray-800 border border-gray-200 rounded focus:ring-1 focus:ring-blue-400" />
                    </td>
                    <td className="border-b border-r border-gray-100 p-1">
                      <select value={v.type} onChange={(e) => patchVar(c, { type: e.target.value as VarType })}
                        className="w-full px-1.5 py-1 text-gray-700 border border-gray-200 rounded bg-white focus:ring-1 focus:ring-blue-400">
                        <option value="numeric">Numeric</option>
                        <option value="string">String</option>
                      </select>
                    </td>
                    <td className="border-b border-r border-gray-100 p-1">
                      <div className="flex items-center gap-1.5" title={M.hint}>
                        <M.Icon className={`w-4 h-4 flex-shrink-0 ${M.color}`} />
                        <select value={v.measure} onChange={(e) => patchVar(c, { measure: e.target.value as Measure })}
                          className="w-full px-1.5 py-1 text-gray-700 border border-gray-200 rounded bg-white focus:ring-1 focus:ring-blue-400">
                          <option value="scale">Scale</option>
                          <option value="ordinal">Ordinal</option>
                          <option value="nominal">Nominal</option>
                        </select>
                      </div>
                    </td>
                    <td className="border-b border-r border-gray-100 p-1">
                      <button onClick={() => setValueEditor(c)}
                        className="w-full flex items-center gap-1.5 px-2 py-1 text-left text-xs text-gray-700 border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-300">
                        <Tags className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        <span className="truncate" title={valueSummary}>{valueSummary}</span>
                      </button>
                    </td>
                    <td className="border-b border-r border-gray-100 p-1">
                      <input value={v.missing.join(', ')}
                        onChange={(e) => patchVar(c, { missing: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                        placeholder="e.g. 99"
                        className="w-full px-2 py-1 text-gray-800 border border-gray-200 rounded focus:ring-1 focus:ring-blue-400" />
                    </td>
                    <td className="border-b border-gray-100 p-1">
                      <div className="flex items-center justify-center gap-0.5">
                        <button tabIndex={-1} onClick={() => moveColumn(c, -1)} disabled={c === 0} title="Move up"
                          className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                        <button tabIndex={-1} onClick={() => moveColumn(c, 1)} disabled={c === variables.length - 1} title="Move down"
                          className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                        <button tabIndex={-1} onClick={() => deleteColumn(c)} disabled={variables.length <= 1} title="Delete variable"
                          className="p-1 text-gray-300 hover:text-red-600 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Value-labels editor modal ---------------------------------------- */}
      {valueEditor !== null && variables[valueEditor] && (
        <ValueLabelsModal
          variable={variables[valueEditor]}
          distinct={distinctValues(valueEditor)}
          onClose={() => setValueEditor(null)}
          onApply={(values) => { patchVar(valueEditor, { values }); setValueEditor(null); }}
        />
      )}

      {/* ---- Paste modal ------------------------------------------------------ */}
      {showPaste && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowPaste(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><ClipboardPaste className="w-5 h-5 text-blue-600" />Paste data</h3>
              <button onClick={() => setShowPaste(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <p className="text-sm text-gray-600">Copy a range of cells from Excel or Google Sheets (or paste comma-separated values) and paste it below.</p>
            <textarea
              value={pasteText} onChange={(e) => setPasteText(e.target.value)} autoFocus rows={8}
              placeholder={'age\tscore\tgroup\n23\t45\t1\n31\t52\t2'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={pasteHasHeader} onChange={(e) => setPasteHasHeader(e.target.checked)} className="rounded" />First row is variable names</label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={pasteMode === 'replace'} onChange={() => setPasteMode('replace')} />Replace grid</label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={pasteMode === 'append'} onChange={() => setPasteMode('append')} />Append rows</label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowPaste(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-800">Cancel</button>
              <button onClick={applyPasteModal} disabled={!pasteText.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg">Load into grid</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Value-labels editor ----------------------------------------------------
function ValueLabelsModal({ variable, distinct, onClose, onApply }: {
  variable: VariableDef;
  distinct: string[];
  onClose: () => void;
  onApply: (values: ValueLabel[]) => void;
}) {
  const [pairs, setPairs] = useState<ValueLabel[]>(variable.values.length ? variable.values.map((v) => ({ ...v })) : [{ value: '', label: '' }]);

  const set = (i: number, patch: Partial<ValueLabel>) => setPairs((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = () => setPairs((p) => [...p, { value: '', label: '' }]);
  const remove = (i: number) => setPairs((p) => (p.length <= 1 ? [{ value: '', label: '' }] : p.filter((_, j) => j !== i)));
  const fillFromData = () => setPairs((prev) => {
    const have = new Set(prev.map((p) => p.value.trim()).filter(Boolean));
    const additions = distinct.filter((d) => !have.has(d)).map((d) => ({ value: d, label: '' }));
    const base = prev.filter((p) => p.value.trim() || p.label.trim());
    return [...base, ...additions].length ? [...base, ...additions] : [{ value: '', label: '' }];
  });
  const apply = () => onApply(pairs.filter((p) => p.value.trim() !== '').map((p) => ({ value: p.value.trim(), label: p.label.trim() })));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Tags className="w-5 h-5 text-blue-600" />Value labels — <span className="text-blue-700">{variable.name}</span></h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <p className="text-sm text-gray-600">Assign a label to each code (e.g. <b>1</b> = Male, <b>2</b> = Female). Codes without a label are ignored.</p>

        <div className="space-y-2 max-h-[45vh] overflow-auto pr-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 px-1">
            <span className="w-24">Value</span><span className="flex-1">Label</span><span className="w-6" />
          </div>
          {pairs.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={p.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="1"
                className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-400" />
              <input value={p.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Male"
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-400" />
              <button onClick={() => remove(i)} title="Remove" className="text-gray-300 hover:text-red-600 w-6 flex justify-center"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={add} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"><Plus className="w-4 h-4 text-blue-600" />Add</button>
            {distinct.length > 0 && (
              <button onClick={fillFromData} className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700" title={`Add the ${distinct.length} distinct value(s) found in this column`}>
                Fill from data ({distinct.length})
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-800">Cancel</button>
            <button onClick={apply} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}
