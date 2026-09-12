import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Check, Crosshair, ChevronRight, ChevronDown, X, Layers, Star, Info, Clock } from 'lucide-react';
import {
  type VariableInfo, type VarFilter, type VarStats, searchVariables, groupVariables, TYPE_BADGE,
} from '../lib/pathVariableUtils';

interface Props {
  variables: VariableInfo[];
  inModel: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  onFind: (name: string) => void;
  hasMeasureMeta?: boolean;
  getStats?: (name: string) => VarStats | null;   // lazy, cached descriptives for the ⓘ preview
}

const MAX_ROWS = 300;
const FAV_KEY = 'ptx_path_fav_vars';
const RECENT_KEY = 'ptx_path_recent_vars';

function loadArr(k: string): string[] { try { const a = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function saveArr(k: string, a: string[]) { try { localStorage.setItem(k, JSON.stringify(a)); } catch { /* ignore */ } }

function useDebounced<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function VariableExplorer({ variables, inModel, onAdd, onRemove, onFind, hasMeasureMeta, getStats }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<VarFilter>('all');
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());
  const [favs, setFavs] = useState<Set<string>>(() => new Set(loadArr(FAV_KEY)));
  const [recent, setRecent] = useState<string[]>(() => loadArr(RECENT_KEY));
  const [preview, setPreview] = useState<string | null>(null);
  const dq = useDebounced(query, 150);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const inModelSet = useMemo(() => new Set(inModel), [inModel.join('')]);

  // Recently-used: record when a variable is added.
  const handleAdd = (name: string) => {
    onAdd(name);
    setRecent((r) => { const nr = [name, ...r.filter((x) => x !== name)].slice(0, 20); saveArr(RECENT_KEY, nr); return nr; });
  };
  const toggleFav = (name: string) => setFavs((f) => {
    const nf = new Set(f); nf.has(name) ? nf.delete(name) : nf.add(name); saveArr(FAV_KEY, [...nf]); return nf;
  });

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (filter === 'recent') {
      const byName = new Map(variables.map((v) => [v.name, v]));
      const q = dq.trim().toLowerCase();
      return recent.map((n) => byName.get(n)).filter((v): v is VariableInfo => !!v && (!q || v._h.includes(q)));
    }
    const base = searchVariables(variables, dq, filter === 'favorites' ? 'all' : filter, inModelSet);
    return filter === 'favorites' ? base.filter((v) => favs.has(v.name)) : base;
  }, [variables, dq, filter, inModelSet, recent, favs]);

  // Recent is shown flat in recency order; everything else is grouped.
  const grouped = useMemo(() => filter === 'recent' ? null : groupVariables(filtered), [filtered, filter]);

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
    { id: 'favorites', label: '★ Favorites' },
    { id: 'recent', label: 'Recent' },
  ];

  // Flat visible order (for Enter-to-add and Showing X of Y).
  const flatVisible = useMemo(() => {
    if (filter === 'recent') return filtered;
    if (!grouped) return filtered;
    const openItems = grouped.groups.filter((g) => isOpen(g.key)).flatMap((g) => g.items);
    return [...openItems, ...grouped.ungrouped];
  }, [filtered, grouped, filter, toggled, searching, variables.length]);

  // ── Keyboard: Cmd/Ctrl+K focuses search ──────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const el = searchRef.current;
        if (el && el.offsetParent !== null) { e.preventDefault(); el.focus(); el.select(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setQuery(''); }
    else if (e.key === 'Enter') {
      const top = flatVisible.find((v) => !inModelSet.has(v.name));
      if (top) { e.preventDefault(); handleAdd(top.name); }
    } else if (e.key === 'ArrowDown') {
      const btn = listRef.current?.querySelector('button') as HTMLButtonElement | null;
      if (btn) { e.preventDefault(); btn.focus(); }
    }
  };

  // ── Row ───────────────────────────────────────────────────────────────────────
  let budget = MAX_ROWS;
  const Row = (v: VariableInfo) => {
    const added = inModelSet.has(v.name);
    const badge = TYPE_BADGE[v.type];
    const isFav = favs.has(v.name);
    const open = preview === v.name;
    return (
      <div key={v.name}>
        <div className="group flex items-center gap-1 pl-1.5 pr-1 py-1 rounded hover:bg-blue-50/60"
          draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', v.name); e.dataTransfer.effectAllowed = 'copy'; }}
          title="Drag onto the canvas to add">
          <button onClick={() => toggleFav(v.name)} title={isFav ? 'Unfavorite' : 'Favorite'}
            className={`p-0.5 ${isFav ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}>
            <Star className="w-3.5 h-3.5" fill={isFav ? 'currentColor' : 'none'} />
          </button>
          <span className="flex-1 min-w-0">
            <span className="text-sm text-gray-800 truncate block" title={v.label ? `${v.name} — ${v.label}` : v.name}>
              {v.name}{v.label && <span className="text-gray-400 font-normal"> · {v.label}</span>}
            </span>
          </span>
          {getStats && (
            <button onClick={() => setPreview(open ? null : v.name)} title="Variable details"
              className={`p-0.5 ${open ? 'text-blue-600' : 'text-gray-300 hover:text-blue-500'}`}><Info className="w-3.5 h-3.5" /></button>
          )}
          <span className={`hidden md:inline text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
          {added ? (
            <>
              <button onClick={() => onFind(v.name)} title="Find on canvas" className="p-1 rounded text-blue-600 hover:bg-blue-100"><Crosshair className="w-4 h-4" /></button>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5"><Check className="w-3 h-3" /> In model</span>
              <button onClick={() => onRemove(v.name)} title="Remove from model" className="p-1 rounded text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100"><X className="w-4 h-4" /></button>
            </>
          ) : (
            <button onClick={() => handleAdd(v.name)}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-white border border-gray-300 rounded px-2 py-0.5 hover:border-blue-400 hover:bg-blue-50">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          )}
        </div>
        {open && getStats && <MetaPreview name={v.name} getStats={getStats} />}
      </div>
    );
  };

  const rendered: React.ReactNode[] = [];
  if (filter === 'recent') {
    if (!filtered.length) rendered.push(<div key="rec-empty" className="text-xs text-gray-400 px-2 py-3">No recently-used variables yet.</div>);
    for (const v of filtered) { if (budget <= 0) break; rendered.push(Row(v)); budget--; }
  } else if (grouped) {
    for (const g of grouped.groups) {
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
      if (open) for (const v of g.items) { if (budget <= 0) break; rendered.push(<div key={g.key + ':' + v.name} className="pl-3">{Row(v)}</div>); budget--; }
    }
    if (grouped.ungrouped.length) {
      if (grouped.groups.length) rendered.push(<div key="ung-h" className="px-1.5 py-1 mt-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Other variables</div>);
      for (const v of grouped.ungrouped) { if (budget <= 0) break; rendered.push(Row(v)); budget--; }
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
            ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} aria-label="Search variables"
            placeholder={`Search ${variables.length} variables…  (⌘K)`}
            className="flex-1 min-w-0 text-sm outline-none bg-transparent"
          />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>}
        </div>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-2 py-0.5 text-[11px] rounded-full border transition ${filter === f.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              {f.id === 'recent' ? <span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" />Recent</span> : f.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-1.5">
        {totalMatches === 0 && filter !== 'recent' ? (
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

// Compact, lazily-computed descriptives shown inline under a variable row.
function MetaPreview({ name, getStats }: { name: string; getStats: (n: string) => VarStats | null }) {
  const s = useMemo(() => getStats(name), [name, getStats]);
  if (!s) return null;
  const fmt = (n?: number) => (n == null ? '—' : Math.abs(n) >= 1000 || (n !== 0 && Math.abs(n) < 0.01) ? n.toPrecision(4) : (+n.toFixed(2)).toString());
  const rows: Array<[string, string]> = [
    ['Type', s.type === 'unknown' ? 'Type not determined' : s.type[0].toUpperCase() + s.type.slice(1)],
    ['Valid N', s.validN.toLocaleString()],
    ['Missing', `${s.missing.toLocaleString()} (${s.missingPct}%)`],
    ['Distinct', s.distinct + (s.distinctCapped ? '+' : '')],
    ...(s.type === 'numeric' ? [
      ['Mean', fmt(s.mean)], ['SD', fmt(s.sd)], ['Min', fmt(s.min)], ['Max', fmt(s.max)],
    ] as Array<[string, string]> : []),
  ];
  return (
    <div className="ml-6 mr-1 mb-1 px-2.5 py-2 bg-gray-50 border border-gray-200 rounded text-[11px] grid grid-cols-2 gap-x-3 gap-y-0.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="text-gray-800 font-medium">{v}</span></div>
      ))}
    </div>
  );
}
