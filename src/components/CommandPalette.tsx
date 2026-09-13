import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Plus, Crosshair, Sparkles, CornerDownLeft, ArrowRight, Wand2, AlertTriangle } from 'lucide-react';
import { type VariableInfo } from '../lib/pathVariableUtils';
import {
  parseModelSpec, edgesFromRoles, ROLE_LABEL,
  type ProposedModel, type ProposedItem, type ProposedPath, type ProposedRole,
} from '../lib/modelFromText';

interface Action { id: string; label: string; hint?: string; run: () => void }
interface Props {
  open: boolean;
  onClose: () => void;
  variables: VariableInfo[];
  inModel: string[];
  onAdd: (name: string) => void;
  onFind: (name: string) => void;
  actions: Action[];
  onApplyModel: (nodes: string[], edges: ProposedPath[]) => void;
}

const MODEL_CUE = /\b(mediat|moderat|predict|effect of|relationship between|association between|influenc|impact of|controlling for|covariat|regress)/i;
const ROLE_ORDER: ProposedRole[] = ['predictor', 'mediator', 'moderator', 'outcome', 'covariate'];

export function CommandPalette({ open, onClose, variables, inModel, onAdd, onFind, actions, onApplyModel }: Props) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<'command' | 'propose'>('command');
  const [propItems, setPropItems] = useState<ProposedItem[]>([]);
  const [propSummary, setPropSummary] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inModelSet = useMemo(() => new Set(inModel), [inModel.join('')]);

  useEffect(() => { if (open) { setQuery(''); setSel(0); setMode('command'); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);

  const q = query.trim().toLowerCase();
  const looksLikeModel = MODEL_CUE.test(query) && query.trim().split(/\s+/).length >= 4;

  // Flat command list: [propose?] + variables + actions, filtered by query.
  const items = useMemo(() => {
    const list: Array<{ key: string; kind: 'propose' | 'var-add' | 'var-find' | 'action'; label: string; sub?: string; run: () => void }> = [];
    if (looksLikeModel) list.push({ key: 'propose', kind: 'propose', label: 'Propose a model from this description', sub: query, run: () => startPropose(query) });
    const vmatch = variables.filter((v) => !q || v._h.includes(q)).slice(0, 8);
    for (const v of vmatch) {
      if (inModelSet.has(v.name)) list.push({ key: 'f-' + v.name, kind: 'var-find', label: v.name, sub: 'Find on canvas' + (v.label ? ` · ${v.label}` : ''), run: () => { onFind(v.name); onClose(); } });
      else list.push({ key: 'a-' + v.name, kind: 'var-add', label: v.name, sub: 'Add to model' + (v.label ? ` · ${v.label}` : ''), run: () => { onAdd(v.name); onClose(); } });
    }
    for (const a of actions.filter((a) => !q || a.label.toLowerCase().includes(q))) list.push({ key: 'act-' + a.id, kind: 'action', label: a.label, sub: a.hint, run: () => { a.run(); onClose(); } });
    return list;
  }, [q, looksLikeModel, variables, inModelSet, actions, query]);

  useEffect(() => { setSel(0); }, [query]);

  const startPropose = (text: string) => {
    const p: ProposedModel = parseModelSpec(text, variables);
    setPropItems(p.items); setPropSummary(p.summary); setMode('propose');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { mode === 'propose' ? setMode('command') : onClose(); return; }
    if (mode !== 'command') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[sel]?.run(); }
  };

  if (!open) return null;

  // ── Propose view helpers ──────────────────────────────────────────────────
  const setMatch = (idx: number, name: string) => setPropItems((its) => its.map((it, i) => i === idx ? { ...it, match: name || null } : it));
  const roles = () => ({
    predictor: propItems.find((i) => i.role === 'predictor')?.match ?? null,
    outcome: propItems.find((i) => i.role === 'outcome')?.match ?? null,
    mediator: propItems.find((i) => i.role === 'mediator')?.match ?? null,
    moderator: propItems.find((i) => i.role === 'moderator')?.match ?? null,
    covariates: propItems.filter((i) => i.role === 'covariate').map((i) => i.match).filter((x): x is string => !!x),
  });
  const proposedEdges = mode === 'propose' ? edgesFromRoles(roles()) : [];
  const canApply = proposedEdges.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          {mode === 'propose' ? <Wand2 className="w-4 h-4 text-blue-600" /> : <Search className="w-4 h-4 text-gray-400" />}
          <input
            ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'propose' ? 'Describe your model…' : 'Search variables, actions, or describe a model…'}
            className="flex-1 text-sm outline-none bg-transparent" aria-label="Command palette"
          />
          <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1">esc</kbd>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>
        </div>

        {mode === 'command' ? (
          <div className="max-h-[50vh] overflow-y-auto py-1">
            {items.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-400 text-center">No matches. Try a variable name, an action, or describe a model.</div>
            ) : items.map((it, i) => (
              <button key={it.key} onMouseEnter={() => setSel(i)} onClick={it.run}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-left ${i === sel ? 'bg-blue-50' : ''}`}>
                <span className={`flex-shrink-0 ${it.kind === 'propose' ? 'text-purple-600' : it.kind === 'var-find' ? 'text-blue-600' : it.kind === 'var-add' ? 'text-green-600' : 'text-gray-400'}`}>
                  {it.kind === 'propose' ? <Sparkles className="w-4 h-4" /> : it.kind === 'var-find' ? <Crosshair className="w-4 h-4" /> : it.kind === 'var-add' ? <Plus className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-gray-800 block truncate">{it.label}</span>
                  {it.sub && <span className="text-xs text-gray-400 block truncate">{it.sub}</span>}
                </span>
                {i === sel && <CornerDownLeft className="w-3.5 h-3.5 text-gray-300" />}
              </button>
            ))}
          </div>
        ) : (
          // ── Proposed model view ──────────────────────────────────────────────
          <div className="max-h-[62vh] overflow-y-auto">
            <div className="px-4 py-3 bg-blue-50/50 border-b border-blue-100">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-900"><Sparkles className="w-4 h-4" /> Proposed model</div>
              <p className="text-xs text-blue-800/80 mt-0.5">{propSummary}</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                This interprets your sentence to propose a <strong>starting structure</strong> — it makes no causal or statistical claim. Review, adjust the variable for each role, then confirm. The final model is yours.
              </p>
              {ROLE_ORDER.flatMap((role) => propItems.map((it, i) => ({ it, i })).filter(({ it }) => it.role === role)).map(({ it, i }) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-20 text-xs font-semibold text-gray-500 flex-shrink-0">{ROLE_LABEL[it.role]}</span>
                  <span className="text-xs text-gray-400 truncate flex-shrink-0 max-w-[110px]" title={it.phrase}>“{it.phrase}”</span>
                  <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                  <select value={it.match ?? ''} onChange={(e) => setMatch(i, e.target.value)}
                    className={`flex-1 min-w-0 text-xs border rounded px-1.5 py-1 ${it.match ? 'border-gray-300' : 'border-amber-300 bg-amber-50'}`}>
                    <option value="">— pick a variable —</option>
                    {variables.map((v) => <option key={v.name} value={v.name}>{v.name}{v.label ? ` · ${v.label}` : ''}</option>)}
                  </select>
                </div>
              ))}
              {proposedEdges.length > 0 && (
                <div className="text-[11px] text-gray-500 pt-1">
                  <span className="font-semibold">Paths:</span> {proposedEdges.map((e, k) => (
                    <span key={k} className="inline-block mr-2">{e.from} {e.type === 'moderation' ? '⟿' : '→'} {e.to}{e.type !== 'direct' && e.type !== 'moderation' ? ` (${e.type})` : ''}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <button onClick={() => setMode('command')} className="text-xs text-gray-500 hover:text-gray-700">← Back to search</button>
              <button onClick={() => { const r = roles(); onApplyModel([...new Set([r.predictor, r.mediator, r.moderator, r.outcome, ...r.covariates].filter((x): x is string => !!x))], proposedEdges); onClose(); }}
                disabled={!canApply}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                <Wand2 className="w-4 h-4" /> Apply to canvas
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
