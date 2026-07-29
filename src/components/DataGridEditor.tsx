import React, { useMemo, useState } from 'react';
import { Plus, Trash2, ClipboardPaste, Save, X, Table2, AlertCircle } from 'lucide-react';

// A lean, dependency-free editable spreadsheet grid for entering a dataset by
// hand or pasting a block from Excel / Google Sheets. Emits column names + rows
// of cell strings; the parent converts them into a saved dataset.

interface DataGridEditorProps {
  initialColumns?: string[];
  initialRows?: string[][];
  initialName?: string;
  saving?: boolean;
  onSave: (name: string, columns: string[], rows: string[][]) => void | Promise<void>;
  onCancel: () => void;
}

const MAX_ROWS = 2000; // manual/paste editing cap; larger data should be imported as a file
const MAX_COLS = 100;

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
  const [columns, setColumns] = useState<string[]>(
    initialColumns && initialColumns.length ? initialColumns : ['var1', 'var2', 'var3'],
  );
  const [rows, setRows] = useState<string[][]>(() => {
    const w = (initialColumns && initialColumns.length) || 3;
    if (initialRows && initialRows.length) return rectangular(initialRows, w);
    return Array.from({ length: 8 }, () => Array(w).fill(''));
  });
  const [name, setName] = useState(initialName || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteHasHeader, setPasteHasHeader] = useState(true);
  const [pasteMode, setPasteMode] = useState<'replace' | 'append'>('replace');

  const setCell = (r: number, c: number, value: string) => {
    setRows((prev) => {
      const next = prev.map((row) => row.slice());
      next[r][c] = value;
      return next;
    });
  };

  const renameColumn = (c: number, value: string) => {
    setColumns((prev) => prev.map((col, i) => (i === c ? value : col)));
  };

  const addRow = () => setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, Array(columns.length).fill('')]));
  const deleteRow = (r: number) => setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== r)));

  const addColumn = () => {
    if (columns.length >= MAX_COLS) return;
    setColumns((prev) => [...prev, `var${prev.length + 1}`]);
    setRows((prev) => prev.map((row) => [...row, '']));
  };
  const deleteColumn = (c: number) => {
    if (columns.length <= 1) return;
    setColumns((prev) => prev.filter((_, i) => i !== c));
    setRows((prev) => prev.map((row) => row.filter((_, i) => i !== c)));
  };

  // Write a pasted block into the grid starting at (r, c), growing rows/cols as needed.
  const writeBlock = (block: string[][], r: number, c: number) => {
    if (!block.length) return;
    const widthNeeded = Math.min(MAX_COLS, c + Math.max(...block.map((b) => b.length)));
    setColumns((prevCols) => {
      const cols = prevCols.slice();
      while (cols.length < widthNeeded) cols.push(`var${cols.length + 1}`);
      return cols;
    });
    setRows((prev) => {
      const width = Math.max(widthNeeded, columns.length);
      let next = prev.map((row) => row.slice());
      block.forEach((brow, i) => {
        const rr = r + i;
        if (rr >= MAX_ROWS) return;
        while (next.length <= rr) next.push(Array(width).fill(''));
        brow.forEach((val, j) => {
          const cc = c + j;
          if (cc < MAX_COLS) next[rr][cc] = val;
        });
      });
      return rectangular(next, width);
    });
  };

  // In-cell paste of a multi-cell block (the natural Excel gesture).
  const onCellPaste = (e: React.ClipboardEvent, r: number, c: number) => {
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // single value → let default paste happen
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
      setColumns(pasteHasHeader ? rectangular([header], width)[0] : Array.from({ length: width }, (_, i) => `var${i + 1}`));
      setRows(rectangular(body.length ? body : [Array(width).fill('')], width));
    } else {
      writeBlock(body, rows.length, 0);
    }
    setPasteText('');
    setShowPaste(false);
  };

  const nonEmptyRows = useMemo(() => rows.filter((r) => r.some((v) => v.trim() !== '')).length, [rows]);

  const handleSave = async () => {
    setError('');
    const trimmedCols = columns.map((c) => c.trim());
    if (!name.trim()) return setError('Please give the dataset a name.');
    if (trimmedCols.some((c) => !c)) return setError('Every column needs a variable name.');
    if (new Set(trimmedCols.map((c) => c.toLowerCase())).size !== trimmedCols.length)
      return setError('Variable names must be unique.');
    const dataRows = rows.filter((r) => r.some((v) => v.trim() !== ''));
    if (!dataRows.length) return setError('Enter at least one row of data.');
    try {
      setBusy(true);
      await onSave(name.trim(), trimmedCols, dataRows);
    } catch (e: any) {
      setError(e?.message || 'Could not save the dataset. Please try again.');
    } finally {
      setBusy(false);
    }
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

      <p className="text-xs text-gray-500">
        Type directly into any cell, or paste a block copied from Excel/Google Sheets. Click a variable name to rename it.
        Empty rows are ignored on save. {rows.length} row{rows.length !== 1 ? 's' : ''} · {nonEmptyRows} with data · {columns.length} variables.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 overflow-auto max-h-[60vh]">
        <table className="text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-20 bg-gray-100 border-b border-r border-gray-200 px-2 py-1 text-gray-400 font-normal w-12">#</th>
              {columns.map((col, c) => (
                <th key={c} className="border-b border-r border-gray-200 p-1 min-w-[120px]">
                  <div className="flex items-center gap-1">
                    <input
                      value={col} onChange={(e) => renameColumn(c, e.target.value)}
                      className="w-full px-2 py-1 text-xs font-semibold text-gray-800 bg-blue-50 border border-blue-100 rounded focus:ring-1 focus:ring-blue-400 focus:bg-white"
                    />
                    <button onClick={() => deleteColumn(c)} title="Delete variable" className="text-gray-300 hover:text-red-600 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="hover:bg-blue-50/40 group">
                <td className="sticky left-0 z-10 bg-gray-50 group-hover:bg-blue-50 border-b border-r border-gray-200 px-1 text-center text-gray-400 text-xs">
                  <div className="flex items-center justify-between gap-1">
                    <span className="w-6 text-right">{r + 1}</span>
                    <button onClick={() => deleteRow(r)} title="Delete row" className="text-gray-300 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </td>
                {columns.map((_, c) => (
                  <td key={c} className="border-b border-r border-gray-100 p-0">
                    <input
                      value={row[c] ?? ''}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      onPaste={(e) => onCellPaste(e, r, c)}
                      className="w-full px-2 py-1 text-gray-800 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-400"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
