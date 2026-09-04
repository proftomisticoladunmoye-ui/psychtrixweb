import React, { useState, useEffect } from 'react';
import { Play, AlertCircle, Users, ScanSearch, CheckCircle } from 'lucide-react';
import { runDIF, DIFOutput } from '../lib/dif';
import { peekHandoff, clearHandoff } from '../lib/analysisHandoff';
import { exportToCSV } from '../lib/exportUtils';

interface Dataset { id: string; name: string; columns: string[]; data: any[] }
interface Props {
  datasets: Dataset[];
  selectedDataset: string;
  onDatasetChange: (id: string) => void;
}

const CLASS_STYLE: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-amber-100 text-amber-800',
  C: 'bg-red-100 text-red-700',
};
const CLASS_LABEL: Record<string, string> = { A: 'A · negligible', B: 'B · moderate', C: 'C · large' };

export function EnhancedDIF({ datasets, selectedDataset, onDatasetChange }: Props) {
  const [family, setFamily] = useState<'score' | 'irt'>('score');
  const [groupVariable, setGroupVariable] = useState('');
  const [items, setItems] = useState<string[]>([]);
  const [results, setResults] = useState<DIFOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentDataset = datasets.find((d) => d.id === selectedDataset);
  const columns = currentDataset?.columns ?? [];

  // Pre-fill from the Scale Sandbox hand-off (grouping variable + the item
  // columns across all factors).
  useEffect(() => {
    const ho = peekHandoff();
    if (ho && ho.target === 'dif' && ho.datasetId === selectedDataset) {
      if (ho.groupVariable) setGroupVariable(ho.groupVariable);
      if (ho.factorStructure) setItems([...new Set(Object.values(ho.factorStructure).flat())]);
      clearHandoff();
    }
  }, [selectedDataset]);

  const toggleItem = (c: string) => setItems((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const run = () => {
    if (!currentDataset) { setError('Select a dataset.'); return; }
    if (!groupVariable) { setError('Select a grouping variable.'); return; }
    const cols = items.filter((c) => c !== groupVariable);
    if (cols.length < 3) { setError('Select at least 3 items.'); return; }
    setLoading(true); setError(''); setResults(null);
    // Defer so the spinner can paint before the (synchronous) computation.
    setTimeout(() => {
      try {
        const out = runDIF(currentDataset.data, cols, groupVariable, family);
        if ('error' in out) { setError(out.error); return; }
        setResults(out);
      } catch (e: any) {
        setError(e?.message || 'DIF analysis failed.');
      } finally {
        setLoading(false);
      }
    }, 30);
  };

  const flagged = results ? results.rows.filter((r) => r.classification !== 'A') : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <ScanSearch className="w-5 h-5 text-blue-600" /> Differential Item Functioning (DIF)
        </h3>
        <p className="text-gray-600 text-sm">
          Test whether items function differently across groups (e.g., gender) at the same trait level. Two-group analysis;
          the two most frequent categories of the grouping variable are used as reference and focal groups.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        {/* Dataset + grouping variable */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dataset</label>
            <select value={selectedDataset} onChange={(e) => { onDatasetChange(e.target.value); setResults(null); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500">
              <option value="">Choose a dataset…</option>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grouping variable</label>
            <select value={groupVariable} onChange={(e) => setGroupVariable(e.target.value)} disabled={!currentDataset}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100">
              <option value="">Select grouping variable…</option>
              {columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Method family */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">DIF method</label>
          <div className="grid sm:grid-cols-2 gap-2">
            <button onClick={() => setFamily('score')}
              className={`text-left px-3 py-2 rounded-lg border text-sm ${family === 'score' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400' : 'border-gray-200 hover:bg-gray-50'}`}>
              <span className="font-medium text-gray-800">A · Score-based</span>
              <span className="block text-[11px] text-gray-500 mt-0.5">Mantel–Haenszel (binary) + logistic/moderated regression (Likert)</span>
            </button>
            <button onClick={() => setFamily('irt')}
              className={`text-left px-3 py-2 rounded-lg border text-sm ${family === 'irt' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400' : 'border-gray-200 hover:bg-gray-50'}`}>
              <span className="font-medium text-gray-800">B · IRT-based</span>
              <span className="block text-[11px] text-gray-500 mt-0.5">2PL per group, mean–sigma linked, item-parameter comparison (Δb, Δa)</span>
            </button>
          </div>
        </div>

        {/* Items */}
        {currentDataset && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Items ({items.filter((c) => c !== groupVariable).length} selected)</label>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setItems(columns.filter((c) => c !== groupVariable))} className="text-blue-600 hover:underline">Select all</button>
                <button onClick={() => setItems([])} className="text-gray-500 hover:underline">Clear</button>
              </div>
            </div>
            <div className="max-h-52 overflow-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {columns.filter((c) => c !== groupVariable).map((c) => (
                <label key={c} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={items.includes(c)} onChange={() => toggleItem(c)} className="rounded" />
                  <span className="text-gray-800">{c}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <button onClick={run} disabled={loading || !currentDataset}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2">
          {loading ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Analysing…</> : <><Play className="w-5 h-5" />Run DIF Analysis</>}
        </button>
      </div>

      {/* Results */}
      {results && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-lg font-bold text-gray-900">DIF Results</h4>
              <p className="text-sm text-gray-600">
                {results.method} · <Users className="w-3.5 h-3.5 inline" /> {results.g1Name} (n={results.n1}) vs {results.g2Name} (n={results.n2})
              </p>
            </div>
            <button onClick={() => exportToCSV(results.rows.map((r) => ({ item: r.item, statistic: r.statistic.toFixed(4), pValue: r.pValue?.toFixed(4) ?? '', effectSize: r.effectSize.toFixed(4), classification: r.classification, detail: r.detail })), 'DIF_Results')}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">Export CSV</button>
          </div>

          <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${flagged.length ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
            {flagged.length ? <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            <span>{flagged.length ? `${flagged.length} item${flagged.length > 1 ? 's' : ''} show moderate-to-large DIF: ${flagged.map((r) => r.item).join(', ')}. Review these for bias.` : 'No item shows more than negligible DIF — measurement is comparable across the groups.'}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-600">
                  <th className="py-2">Item</th>
                  <th className="text-right py-2">Statistic</th>
                  {results.rows.some((r) => r.pValue !== undefined) && <th className="text-right py-2">p</th>}
                  <th className="text-right py-2">Effect size</th>
                  <th className="text-center py-2">DIF</th>
                  <th className="py-2 pl-4">Detail</th>
                </tr>
              </thead>
              <tbody>
                {results.rows.map((r) => (
                  <tr key={r.item} className="border-b hover:bg-gray-50">
                    <td className="py-2 font-medium">{r.item}</td>
                    <td className="text-right">{r.statistic.toFixed(3)}</td>
                    {results.rows.some((x) => x.pValue !== undefined) && <td className="text-right">{r.pValue !== undefined ? r.pValue.toFixed(3) : '—'}</td>}
                    <td className="text-right">{r.effectSize.toFixed(3)}</td>
                    <td className="text-center"><span className={`px-2 py-0.5 rounded text-xs font-medium ${CLASS_STYLE[r.classification]}`}>{CLASS_LABEL[r.classification]}</span></td>
                    <td className="py-2 pl-4 text-xs text-gray-600">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {results.note && <p className="text-xs text-gray-500">{results.note}</p>}
        </div>
      )}
    </div>
  );
}
