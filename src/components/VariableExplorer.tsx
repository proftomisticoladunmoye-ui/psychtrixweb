import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Check, Crosshair, ChevronRight, ChevronDown, X, Layers } from 'lucide-react';
import {
  type VariableInfo, type VarFilter, searchVariables, groupVariables, TYPE_BADGE,
} from '../lib/pathVariableUtils';

interface Props {
  variables: VariableInfo[];
  inModel: string[];                 // variable names currently on the canvas
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  onFind: (name: string) => void;    // pan/zoom/highlight the node on the canvas
  hasMeasureMeta?: boolean;          // expose Scale/Ordinal/Nominal only when metadata supports it
}

const MAX_ROWS = 300;                // cap DOM rows for very large datasets

// Debounce a value (keeps search cheap on large dictionaries).
function useDebounced<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function VariableExplorer({ variables, inModel, onAdd, onRemove, onFind, hasMeasureMeta }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<VarFilter>('all');
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());
  const dq = useDebounced(query, 150);

  const inModelSet = useMemo(() => new Set(inModel), [inModel.join('')]);
  const filtered = useMemo(
    () => searchVariables(variables, dq, filter, inModelSet),
    [variables, dq, filter, inModelSet],
  );
  const { groups, ungrouped } = useMemo(() => groupVariables(filtered), [filtered]);

  const searching = dq.trim().length > 0;
  const collapseByDefault = variables.length > 60 && !searching;
  const baseOpen = !collapseByDefault;
  const isOpen = (key: string) => searching || (toggled.has(key) ? toggled.get(key)! : baseOpen);
  const toggle = (key: string) => setToggled((m) => new Map(m).set(key, !isOpen(key)));

  const filters: Array<{ id: VarFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'numeric', label: 'Numeric' },
    { id: 'categorical', label: 'Categorical' },
    ...(hasMeasureMeta ? ([{ id: 'scale', label: 'Scale' }, { id: 'ordinal', label: 'Ordinal' }, { id: 'nominal', label: 'Nominal' }] as const) : []),
    { id: 'inmodel', label: 'In model' },
    { id: 'unused', label: 'Unused' },
  ];

  // Build the capped render plan.
  let budget = MAX_ROWS;
  const Row = (v: VariableInfo) => {
    const added = inModelSet.has(v.name);
    const badge = TYPE_BADGE[v.type];
    return (
      <div key={v.name} className="group flex items-center gap-2 pl-2 pr-1.5 py-1 rounded hover:bg-blue-50/60">
        <span className="flex-1 min-w-0">
          <span className="text-sm text-gray-800 truncate block" title={v.label ? `${v.name} — ${v.label}` : v.name}>
            {v.name}{v.label && <span className="text-gray-400 font-normal"> · {v.label}</span>}
          </span>
        </span>
        <span className={`hidden sm:inline text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
        {added ? (
          <>
            <button onClick={() => onFind(v.name)} title="Find on canvas"
              className="p-1 rounded text-blue-600 hover:bg-blue-100"><Crosshair className="w-4 h-4" /></button>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5"><Check className="w-3 h-3" /> In model</span>
            <button onClick={() => onRemove(v.name)} title="Remove from model"
              className="p-1 rounded text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100"><X className="w-4 h-4" /></button>
          </>
        ) : (
          <button onClick={() => onAdd(v.name)}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-white border border-gray-300 rounded px-2 py-0.5 hover:border-blue-400 hover:bg-blue-50">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>
    );
  };

  const rendered: React.ReactNode[] = [];
  for (const g of groups) {
    const open = isOpen(g.key);
    rendered.push(
      <button key={'g-' + g.key} onClick={() => toggle(g.key)}
        className="w-full flex items-center gap-1.5 px-1.5 py-1 mt-1 text-left text-xs font-semibold text-gray-600 hover:bg-gray-50 rounded">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <Layers className="w-3.5 h-3.5 text-gray-400" />
        <span className="uppercase tracking-wide">{g.label}</span>
        <span className="text-gray-400 font-normal">({g.items.length})</span>
      </button>,
    );
    if (open) {
      for (const v of g.items) {
        if (budget <= 0) break;
        rendered.push(<div key={g.key + ':' + v.name} className="pl-3">{Row(v)}</div>);
        budget--;
      }
    }
  }
  if (ungrouped.length) {
    if (groups.length) rendered.push(<div key="ung-h" className="px-1.5 py-1 mt-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Other variables</div>);
    for (const v of ungrouped) {
      if (budget <= 0) break;
      rendered.push(Row(v));
      budget--;
    }
  }
  const shownItems = MAX_ROWS - budget;
  const totalMatches = filtered.length;

  return (
    <div className="flex flex-col h-full min-h-0 border border-gray-200 rounded-lg bg-white">
      <div className="p-2.5 border-b border-gray-100 space-y-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search variables"
            placeholder={`Search ${variables.length} variables…`}
            className="flex-1 min-w-0 text-sm outline-none bg-transparent"
          />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>}
        </div>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-2 py-0.5 text-[11px] rounded-full border transition ${filter === f.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
        {totalMatches === 0 ? (
          <div className="text-center text-sm text-gray-500 py-10 px-4">
            <p className="font-medium">No variables found.</p>
            <p className="text-xs mt-1 text-gray-400">Try a different search term or remove a filter.</p>
          </div>
        ) : rendered}
      </div>

      <div className="px-3 py-1.5 border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-between">
        <span>Showing {Math.min(shownItems, totalMatches)} of {variables.length}{totalMatches !== variables.length ? ` (${totalMatches} match)` : ''}</span>
        {shownItems < totalMatches && <span className="text-amber-600">Refine search to see more</span>}
      </div>
    </div>
  );
}
