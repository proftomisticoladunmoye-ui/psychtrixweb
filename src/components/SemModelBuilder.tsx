import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  MousePointer2, Spline, GitBranch, Trash2, Undo2, Redo2, LayoutGrid,
  Maximize2, Plus, Play, CheckCircle2, AlertTriangle, XCircle, Info, ZoomIn, ZoomOut, Circle, Square,
  Code2, Copy, Check, FileStack,
} from 'lucide-react';
import { VariableExplorer } from './VariableExplorer';
import { type VariableInfo, type VarStats } from '../lib/pathVariableUtils';
import {
  type SemGraph, type SemNode, type SemFamily, type SemOptions, type TranslatedModel,
  SEM_FAMILIES, SEM_TEMPLATES, emptyGraph, makeId, nodeById, toSEMModel, validateGraph, toLavaanSyntax,
} from '../lib/semGraph';

type Mode = 'select' | 'loading' | 'path' | 'delete';

interface Props {
  variables: VariableInfo[];
  hasMeasureMeta?: boolean;
  getStats?: (name: string) => VarStats | null;
  onEstimate: (model: TranslatedModel, options: SemOptions) => void;
  loading?: boolean;
}

const LAT_W = 132, LAT_H = 68, OBS_W = 104, OBS_H = 44;

// Node geometry (logical space). Latents are ellipses, observed are rounded rects.
const nodeSize = (n: SemNode) => n.kind === 'latent' ? { w: LAT_W, h: LAT_H } : { w: OBS_W, h: OBS_H };
const nodeCenter = (n: SemNode) => { const s = nodeSize(n); return { cx: n.x + s.w / 2, cy: n.y + s.h / 2 }; };

// Clip a center→center segment to the boundary of the target node so the
// arrowhead sits on the edge rather than the centre.
function clipToNode(fromC: { cx: number; cy: number }, n: SemNode) {
  const { cx, cy } = nodeCenter(n);
  const s = nodeSize(n);
  const dx = fromC.cx - cx, dy = fromC.cy - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = s.w / 2, hh = s.h / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export function SemModelBuilder({ variables, hasMeasureMeta, getStats, onEstimate, loading }: Props) {
  const [family, setFamily] = useState<SemFamily>('full');
  const [graph, setGraph] = useState<SemGraph>(() => emptyGraph('full'));
  const [mode, setMode] = useState<Mode>('select');
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [view, setView] = useState({ x: 40, y: 20, scale: 1 });
  const [history, setHistory] = useState<SemGraph[]>([]);
  const [future, setFuture] = useState<SemGraph[]>([]);
  const [showIssues, setShowIssues] = useState(false);
  const [showSyntax, setShowSyntax] = useState(false);
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string | null; dx: number; dy: number; panX: number; panY: number; panning: boolean } | null>(null);

  // ── History-aware graph mutation ────────────────────────────────────────────
  const commit = useCallback((next: SemGraph) => {
    setGraph((prev) => { setHistory((h) => [...h.slice(-49), prev]); setFuture([]); return next; });
  }, []);
  const undo = () => setHistory((h) => { if (!h.length) return h; const prev = h[h.length - 1]; setFuture((f) => [graph, ...f]); setGraph(prev); return h.slice(0, -1); });
  const redo = () => setFuture((f) => { if (!f.length) return f; const nxt = f[0]; setHistory((hh) => [...hh, graph]); setGraph(nxt); return f.slice(1); });

  const inModel = useMemo(() => graph.nodes.filter((n) => n.kind === 'observed').map((n) => n.name), [graph.nodes]);
  const issues = useMemo(() => validateGraph({ ...graph, family }), [graph, family]);
  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warnCount = issues.filter((i) => i.level === 'warning').length;
  const translated = useMemo(() => toSEMModel({ ...graph, family }), [graph, family]);
  const syntax = useMemo(() => toLavaanSyntax({ ...graph, family }), [graph, family]);

  const applyTemplate = (id: string) => {
    const tpl = SEM_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    if (graph.nodes.length && !confirm(`Replace the current model with the ${tpl.label} template?`)) return;
    const g = tpl.build();
    commit(g);
    setFamily(g.family);
    setSelected(null);
    setPendingSource(null);
    setTimeout(fitToScreen, 0);
  };

  const copySyntax = async () => {
    try { await navigator.clipboard.writeText(syntax); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };

  // ── Screen → logical coordinate ──────────────────────────────────────────────
  const toLogical = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.scale, y: (clientY - r.top - view.y) / view.scale };
  };

  const freeSpot = () => {
    const n = graph.nodes.length;
    return { x: 60 + (n % 5) * 150, y: 90 + Math.floor(n / 5) * 120 };
  };

  // ── Node / edge operations ────────────────────────────────────────────────────
  const addLatent = () => {
    const count = graph.nodes.filter((n) => n.kind === 'latent').length + 1;
    const name = `Latent${count}`;
    const spot = freeSpot();
    commit({ ...graph, nodes: [...graph.nodes, { id: makeId('lat'), kind: 'latent', name, x: spot.x, y: spot.y }] });
  };

  const addObserved = (colName: string) => {
    if (graph.nodes.some((n) => n.kind === 'observed' && n.name === colName)) return;
    const spot = freeSpot();
    commit({ ...graph, nodes: [...graph.nodes, { id: makeId('obs'), kind: 'observed', name: colName, x: spot.x, y: spot.y }] });
  };

  const removeObservedByName = (colName: string) => {
    const node = graph.nodes.find((n) => n.kind === 'observed' && n.name === colName);
    if (node) removeNode(node.id);
  };

  const removeNode = (id: string) => {
    commit({ ...graph, nodes: graph.nodes.filter((n) => n.id !== id), edges: graph.edges.filter((e) => e.from !== id && e.to !== id) });
    if (selected === id) setSelected(null);
  };

  const removeEdge = (id: string) => commit({ ...graph, edges: graph.edges.filter((e) => e.id !== id) });

  const tryConnect = (targetId: string) => {
    if (!pendingSource) { setPendingSource(targetId); return; }
    if (pendingSource === targetId) { setPendingSource(null); return; }
    const a = nodeById(graph, pendingSource)!, b = nodeById(graph, targetId)!;
    if (mode === 'loading') {
      // Exactly one latent + one observed.
      const latent = a.kind === 'latent' ? a : b.kind === 'latent' ? b : null;
      const observed = a.kind === 'observed' ? a : b.kind === 'observed' ? b : null;
      if (latent && observed) {
        const exists = graph.edges.some((e) => e.kind === 'loading' && ((e.from === latent.id && e.to === observed.id) || (e.from === observed.id && e.to === latent.id)));
        if (!exists) commit({ ...graph, edges: [...graph.edges, { id: makeId('load'), from: latent.id, to: observed.id, kind: 'loading' }] });
      }
    } else if (mode === 'path') {
      // Structural regression between two latents (what the estimator fits).
      if (a.kind === 'latent' && b.kind === 'latent') {
        const exists = graph.edges.some((e) => e.kind === 'regression' && e.from === a.id && e.to === b.id);
        if (!exists) commit({ ...graph, edges: [...graph.edges, { id: makeId('reg'), from: a.id, to: b.id, kind: 'regression' }] });
      }
    }
    setPendingSource(null);
  };

  const renameLatent = (id: string, label: string) => {
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => n.id === id ? { ...n, label } : n) }));
  };

  // ── Pointer handlers ───────────────────────────────────────────────────────────
  const onNodePointerDown = (e: React.MouseEvent, node: SemNode) => {
    e.stopPropagation();
    if (mode === 'delete') { removeNode(node.id); return; }
    if (mode === 'loading' || mode === 'path') { setSelected(node.id); tryConnect(node.id); return; }
    setSelected(node.id);
    const p = toLogical(e.clientX, e.clientY);
    drag.current = { id: node.id, dx: p.x - node.x, dy: p.y - node.y, panX: 0, panY: 0, panning: false };
  };

  const onCanvasPointerDown = (e: React.MouseEvent) => {
    if (mode !== 'select') { setPendingSource(null); return; }
    setSelected(null);
    drag.current = { id: null, dx: e.clientX, dy: e.clientY, panX: view.x, panY: view.y, panning: true };
  };

  const onPointerMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.panning) { setView((v) => ({ ...v, x: d.panX + (e.clientX - d.dx), y: d.panY + (e.clientY - d.dy) })); return; }
    if (d.id) {
      const p = toLogical(e.clientX, e.clientY);
      const nx = Math.max(0, p.x - d.dx), ny = Math.max(0, p.y - d.dy);
      setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => n.id === d.id ? { ...n, x: nx, y: ny } : n) }));
    }
  };

  const onPointerUp = () => {
    // Persist a drag as one history entry (positions changed on the live graph).
    if (drag.current?.id) setHistory((h) => [...h.slice(-49), graph]);
    drag.current = null;
  };

  // ── Layout helpers ───────────────────────────────────────────────────────────
  const autoLayout = () => {
    const latents = graph.nodes.filter((n) => n.kind === 'latent');
    const nodes = [...graph.nodes];
    latents.forEach((lv, i) => {
      const lx = 200 + i * 240, ly = 90;
      const idx = nodes.findIndex((n) => n.id === lv.id);
      nodes[idx] = { ...nodes[idx], x: lx, y: ly };
      const inds = graph.edges.filter((e) => e.kind === 'loading' && (e.from === lv.id || e.to === lv.id))
        .map((e) => (e.from === lv.id ? e.to : e.from));
      inds.forEach((oid, j) => {
        const oi = nodes.findIndex((n) => n.id === oid);
        if (oi >= 0) nodes[oi] = { ...nodes[oi], x: lx - 40 + j * 40, y: ly + 150 + j * 8 };
      });
    });
    commit({ ...graph, nodes });
    setTimeout(fitToScreen, 0);
  };

  const fitToScreen = () => {
    if (!graph.nodes.length) { setView({ x: 40, y: 20, scale: 1 }); return; }
    const xs = graph.nodes.map((n) => n.x), ys = graph.nodes.map((n) => n.y);
    const maxX = Math.max(...graph.nodes.map((n) => n.x + nodeSize(n).w));
    const maxY = Math.max(...graph.nodes.map((n) => n.y + nodeSize(n).h));
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const r = canvasRef.current!.getBoundingClientRect();
    const scale = Math.min(1, (r.width - 60) / Math.max(1, maxX - minX), (r.height - 60) / Math.max(1, maxY - minY));
    setView({ x: 30 - minX * scale, y: 20 - minY * scale, scale: Math.max(0.3, scale) });
  };

  const focusNode = (name: string) => {
    const n = graph.nodes.find((nn) => nn.name === name);
    if (n) { setSelected(n.id); }
  };

  const clearModel = () => { if (graph.nodes.length && confirm('Clear the entire model?')) commit(emptyGraph(family)); };

  const changeFamily = (f: SemFamily) => {
    const info = SEM_FAMILIES.find((x) => x.id === f);
    if (info && !info.supported) return;
    setFamily(f);
    setGraph((g) => ({ ...g, family: f }));
  };

  const selNode = selected ? nodeById(graph, selected) : null;

  const modeBtn = (m: Mode, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => { setMode(m); setPendingSource(null); }}
      title={label}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${mode === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
    >{icon}<span className="hidden sm:inline">{label}</span></button>
  );

  return (
    <div className="space-y-3">
      {/* Family selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Model Type:</span>
        {/* Start Model / templates */}
        <div className="relative inline-flex items-center">
          <FileStack className="w-3.5 h-3.5 text-gray-400 absolute left-2 pointer-events-none" />
          <select
            value=""
            onChange={(e) => { if (e.target.value) { applyTemplate(e.target.value); e.target.value = ''; } }}
            title="Start from a template structure (no variables are fabricated)"
            className="pl-7 pr-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 cursor-pointer"
          >
            <option value="">Start Model…</option>
            {SEM_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label} — {t.description}</option>)}
          </select>
        </div>
        <div className="w-px h-5 bg-gray-200" />
        <div className="flex flex-wrap gap-1.5">
          {SEM_FAMILIES.map((f) => (
            <button
              key={f.id}
              onClick={() => changeFamily(f.id)}
              disabled={!f.supported}
              title={f.supported ? f.label : f.note}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                family === f.id ? 'bg-blue-600 text-white'
                : f.supported ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-gray-50 text-gray-400 cursor-not-allowed border border-dashed border-gray-300'}`}
            >
              {f.label}{!f.supported && ' · roadmap'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 items-stretch">
        {/* Variable Explorer */}
        <div className="lg:w-72 flex-shrink-0 border border-gray-200 rounded-xl overflow-hidden bg-white">
          <VariableExplorer
            variables={variables}
            inModel={inModel}
            onAdd={addObserved}
            onRemove={removeObservedByName}
            onFind={focusNode}
            hasMeasureMeta={hasMeasureMeta}
            getStats={getStats}
          />
        </div>

        {/* Canvas column */}
        <div className="flex-1 min-w-0 flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
            {modeBtn('select', <MousePointer2 className="w-3.5 h-3.5" />, 'Select')}
            {modeBtn('loading', <Spline className="w-3.5 h-3.5" />, 'Measurement')}
            {modeBtn('path', <GitBranch className="w-3.5 h-3.5" />, 'Path')}
            {modeBtn('delete', <Trash2 className="w-3.5 h-3.5" />, 'Delete')}
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <button onClick={addLatent} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition"><Plus className="w-3.5 h-3.5" /> Latent</button>
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <button onClick={undo} disabled={!history.length} title="Undo" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30"><Undo2 className="w-3.5 h-3.5" /></button>
            <button onClick={redo} disabled={!future.length} title="Redo" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30"><Redo2 className="w-3.5 h-3.5" /></button>
            <button onClick={autoLayout} title="Auto-layout" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200"><LayoutGrid className="w-3.5 h-3.5" /></button>
            <button onClick={fitToScreen} title="Fit to screen" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200"><Maximize2 className="w-3.5 h-3.5" /></button>
            <button onClick={() => setView((v) => ({ ...v, scale: Math.min(2, v.scale + 0.15) }))} title="Zoom in" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200"><ZoomIn className="w-3.5 h-3.5" /></button>
            <button onClick={() => setView((v) => ({ ...v, scale: Math.max(0.3, v.scale - 0.15) }))} title="Zoom out" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200"><ZoomOut className="w-3.5 h-3.5" /></button>
            <div className="flex-1" />
            <button
              onClick={() => setShowSyntax((s) => !s)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${showSyntax ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            ><Code2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Syntax</span></button>
            <button onClick={clearModel} className="text-xs text-gray-400 hover:text-red-600">Clear</button>
          </div>

          {/* Mode hint */}
          {(mode === 'loading' || mode === 'path') && (
            <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100 text-xs text-blue-800 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              {mode === 'loading'
                ? 'Click a latent variable, then an observed variable, to connect an indicator.'
                : 'Click a predictor latent variable, then an outcome latent variable, to draw a structural path.'}
              {pendingSource && <span className="font-medium">· source: {nodeById(graph, pendingSource)?.label || nodeById(graph, pendingSource)?.name}</span>}
            </div>
          )}

          {/* Canvas */}
          <div
            ref={canvasRef}
            className="relative overflow-hidden bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]"
            style={{ height: 460, cursor: mode === 'select' ? 'grab' : 'crosshair' }}
            onMouseDown={onCanvasPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
          >
            {graph.nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-gray-400 pointer-events-none px-6">
                <GitBranch className="w-12 h-12 mb-2 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">Build your model visually</p>
                <p className="text-xs mt-1">Add a latent variable, drag observed variables from the explorer, then use Measurement and Path modes to connect them.</p>
              </div>
            )}
            <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
              {/* Edge layer */}
              <svg className="absolute top-0 left-0 overflow-visible" style={{ width: 1, height: 1 }}>
                <defs>
                  <marker id="sem-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#475569" /></marker>
                </defs>
                {graph.edges.map((e) => {
                  const a = nodeById(graph, e.from), b = nodeById(graph, e.to);
                  if (!a || !b) return null;
                  const ac = nodeCenter(a), bc = nodeCenter(b);
                  const end = clipToNode(ac, b);
                  const start = clipToNode(bc, a);
                  const isLoad = e.kind === 'loading';
                  return (
                    <line
                      key={e.id}
                      x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                      stroke={isLoad ? '#94a3b8' : '#475569'}
                      strokeWidth={isLoad ? 1.5 : 2}
                      strokeDasharray={isLoad ? '4 3' : undefined}
                      markerEnd="url(#sem-arrow)"
                      style={{ cursor: mode === 'delete' ? 'pointer' : 'default', pointerEvents: 'stroke' }}
                      onMouseDown={(ev) => { if (mode === 'delete') { ev.stopPropagation(); removeEdge(e.id); } }}
                    />
                  );
                })}
              </svg>

              {/* Node layer */}
              {graph.nodes.map((n) => {
                const s = nodeSize(n);
                const isSel = selected === n.id;
                const isPending = pendingSource === n.id;
                return (
                  <div
                    key={n.id}
                    onMouseDown={(e) => onNodePointerDown(e, n)}
                    className="absolute flex items-center justify-center text-center select-none"
                    style={{ left: n.x, top: n.y, width: s.w, height: s.h, cursor: mode === 'delete' ? 'pointer' : mode === 'select' ? 'move' : 'pointer' }}
                  >
                    <div
                      className={`w-full h-full flex items-center justify-center px-2 text-xs font-medium border-2 transition ${
                        n.kind === 'latent'
                          ? `rounded-full ${isSel ? 'border-blue-600 bg-blue-50' : isPending ? 'border-amber-500 bg-amber-50' : 'border-blue-400 bg-white'} text-blue-900`
                          : `rounded-lg ${isSel ? 'border-emerald-600 bg-emerald-50' : isPending ? 'border-amber-500 bg-amber-50' : 'border-gray-300 bg-white'} text-gray-800`
                      }`}
                    >
                      <span className="truncate">{n.label || n.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Zoom badge */}
            <div className="absolute bottom-2 right-2 text-[10px] text-gray-400 bg-white/80 rounded px-1.5 py-0.5">{Math.round(view.scale * 100)}%</div>
          </div>

          {/* Status bar */}
          <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>
              {graph.nodes.filter((n) => n.kind === 'latent').length} latent · {graph.nodes.filter((n) => n.kind === 'observed').length} observed · {graph.edges.filter((e) => e.kind === 'loading').length} loadings · {graph.edges.filter((e) => e.kind === 'regression').length} paths
            </span>
            <span className="text-gray-400">Drag background to pan · drag node to move</span>
          </div>

          {/* Syntax panel — live, faithful mirror of the model that will be estimated */}
          {showSyntax && (
            <div className="border-t border-gray-100 bg-gray-900">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800">
                <span className="text-xs font-medium text-gray-300 flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5" /> lavaan-style syntax <span className="text-gray-500">· reflects exactly what will be estimated</span></span>
                <button onClick={copySyntax} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                  {copied ? <><Check className="w-3.5 h-3.5 text-green-400" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
              </div>
              <pre className="px-3 py-2 text-xs text-gray-100 font-mono overflow-x-auto whitespace-pre max-h-40">{syntax}</pre>
            </div>
          )}
        </div>

        {/* Inspector */}
        <div className="lg:w-64 flex-shrink-0 border border-gray-200 rounded-xl bg-white p-4 space-y-3">
          <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Info className="w-4 h-4 text-blue-600" /> Model Inspector</h4>
          {selNode ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                {selNode.kind === 'latent' ? <Circle className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4 text-emerald-500" />}
                <span className="font-semibold text-gray-900">{selNode.label || selNode.name}</span>
              </div>
              <p className="text-gray-500">Type: <span className="text-gray-800">{selNode.kind === 'latent' ? 'Latent variable' : 'Observed variable'}</span></p>
              {selNode.kind === 'latent' ? (
                <>
                  <label className="block text-gray-500">Display label
                    <input
                      value={selNode.label || ''} placeholder={selNode.name}
                      onChange={(e) => renameLatent(selNode.id, e.target.value)}
                      className="mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <div>
                    <p className="text-gray-500 mb-1">Indicators ({translated.measurementModel[selNode.name]?.length || 0})</p>
                    <div className="flex flex-wrap gap-1">
                      {(translated.measurementModel[selNode.name] || []).map((ind) => (
                        <span key={ind} className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700">{ind}</span>
                      ))}
                      {!(translated.measurementModel[selNode.name] || []).length && <span className="text-gray-400 italic">none — use Measurement mode</span>}
                    </div>
                  </div>
                  <p className="text-gray-500">Identification: <span className="text-gray-800">marker / fixed-variance (std. solution)</span></p>
                </>
              ) : (
                <>
                  {(() => { const st = getStats?.(selNode.name); return st ? (
                    <div className="text-gray-600 space-y-0.5">
                      <p>Valid N: <span className="text-gray-900">{st.validN}</span> · Missing: <span className="text-gray-900">{st.missingPct}%</span></p>
                      <p>Distinct: <span className="text-gray-900">{st.distinct}{st.distinctCapped ? '+' : ''}</span></p>
                      {st.mean !== undefined && <p>M = {st.mean.toFixed(2)} · SD = {st.sd?.toFixed(2)}</p>}
                    </div>
                  ) : <p className="text-gray-400 italic">Measurement info not available</p>; })()}
                </>
              )}
              <button onClick={() => removeNode(selNode.id)} className="text-red-600 hover:text-red-700 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Remove from model</button>
            </div>
          ) : (
            <p className="text-xs text-gray-400">Select a node to inspect its properties.</p>
          )}

          {/* Validation */}
          <div className="pt-3 border-t border-gray-100">
            <button onClick={() => setShowIssues((s) => !s)} className="w-full flex items-center justify-between text-sm font-semibold text-gray-900">
              <span className="flex items-center gap-1.5">
                {errorCount ? <XCircle className="w-4 h-4 text-red-500" /> : warnCount ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-green-500" />}
                Validation
              </span>
              <span className="text-xs text-gray-400">{errorCount ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : warnCount ? `${warnCount} note${warnCount > 1 ? 's' : ''}` : 'valid'}</span>
            </button>
            {(showIssues || errorCount > 0) && (
              <ul className="mt-2 space-y-1.5">
                {issues.length === 0 && <li className="text-xs text-green-700">✓ Model structure valid</li>}
                {issues.map((iss, i) => (
                  <li key={i} className={`text-xs flex gap-1.5 ${iss.level === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                    {iss.level === 'error' ? <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                    <span>{iss.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={() => onEstimate(translated, graph.options)}
            disabled={loading || errorCount > 0}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition disabled:opacity-40"
          >
            <Play className="w-4 h-4" /> {loading ? 'Estimating…' : 'Estimate Model'}
          </button>
          {errorCount > 0 && <p className="text-[11px] text-red-500 text-center">Resolve errors before estimating.</p>}
        </div>
      </div>
    </div>
  );
}
