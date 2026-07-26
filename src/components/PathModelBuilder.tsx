import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MousePointer2, Spline, GitBranch, Zap, Link2, Trash2,
  Undo2, Redo2, Maximize2, ZoomIn, ZoomOut, Plus,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type RelType = 'direct' | 'mediation' | 'moderation' | 'covariance';

export interface BuilderNode { id: string; x: number; y: number }
export interface BuilderEdge {
  id: string;
  from: string;
  to: string;
  type: RelType;
  moderates?: string; // for moderation: the IV whose path (IV→to) is moderated
}
export interface BuilderGraph { nodes: BuilderNode[]; edges: BuilderEdge[] }

export interface DerivedModel {
  pathModel: Array<{ from: string; to: string }>;
  mediators: string[];
  moderators: Array<{ iv: string; moderator: string; dv: string }>;
  analysisType:
    | 'basic' | 'mediation' | 'moderation' | 'full'
    | 'parallel-mediation' | 'serial-mediation' | 'moderated-mediation';
}

interface Props {
  columns: string[];
  graph: BuilderGraph;
  onGraphChange: (g: BuilderGraph) => void;
  onModelDerived: (m: DerivedModel) => void;
}

// ─── Model derivation (feeds the existing OLS/MLE engine) ─────────────────────

export function deriveModel(graph: BuilderGraph): DerivedModel {
  const directed = graph.edges.filter(e => e.type === 'direct' || e.type === 'mediation');
  const pathModel = directed.map(e => ({ from: e.from, to: e.to }));

  const moderatorEdges = graph.edges.filter(e => e.type === 'moderation' && e.moderates);
  const moderators = moderatorEdges.map(e => ({ iv: e.moderates!, moderator: e.from, dv: e.to }));

  // Mediators = interior nodes: at least one incoming AND one outgoing directed path.
  const hasIn = new Set(directed.map(e => e.to));
  const hasOut = new Set(directed.map(e => e.from));
  const mediators = graph.nodes
    .map(n => n.id)
    .filter(id => hasIn.has(id) && hasOut.has(id));

  // Auto-detect the analysis type so the specialised engine paths are used.
  let analysisType: DerivedModel['analysisType'] = 'basic';
  const hasMod = moderators.length > 0;
  const hasMed = mediators.length > 0;
  const serialLink = directed.some(e => mediators.includes(e.from) && mediators.includes(e.to));

  if (hasMod && hasMed) {
    analysisType = (mediators.length === 1 && moderators.length === 1) ? 'moderated-mediation' : 'full';
  } else if (hasMod) {
    analysisType = 'moderation';
  } else if (mediators.length >= 2) {
    analysisType = serialLink ? 'serial-mediation' : 'parallel-mediation';
  } else if (mediators.length === 1) {
    analysisType = 'mediation';
  }

  return { pathModel, mediators, moderators, analysisType };
}

// ─── Geometry / drawing constants ─────────────────────────────────────────────

const NODE_W = 104, NODE_H = 40;
const LOGICAL_W = 1200, LOGICAL_H = 640;

const TYPE_META: Record<RelType, { color: string; label: string }> = {
  direct:     { color: '#334155', label: 'Direct effect' },
  mediation:  { color: '#2563eb', label: 'Mediation path' },
  moderation: { color: '#7c3aed', label: 'Moderation' },
  covariance: { color: '#0d9488', label: 'Covariance' },
};

function rectEdgePoint(cx: number, cy: number, angle: number): [number, number] {
  const hw = NODE_W / 2, hh = NODE_H / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  if (Math.abs(cos) < 1e-9) return [cx, cy + (sin > 0 ? hh : -hh)];
  if (Math.abs(sin) < 1e-9) return [cx + (cos > 0 ? hw : -hw), cy];
  const t = Math.min(hw / Math.abs(cos), hh / Math.abs(sin));
  return [cx + cos * t, cy + sin * t];
}

function arrowhead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, sz = 10) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - sz * Math.cos(angle - 0.4), y - sz * Math.sin(angle - 0.4));
  ctx.lineTo(x - sz * Math.cos(angle + 0.4), y - sz * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PathModelBuilder({ columns, graph, onGraphChange, onModelDerived }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerW, setContainerW] = useState(900);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<'select' | 'connect'>('select');
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);

  // Undo/redo history of graph snapshots
  const history = useRef<BuilderGraph[]>([]);
  const future = useRef<BuilderGraph[]>([]);

  const derive = useCallback((g: BuilderGraph) => onModelDerived(deriveModel(g)), [onModelDerived]);

  const commit = useCallback((next: BuilderGraph, pushHistory = true) => {
    if (pushHistory) { history.current.push(graph); future.current = []; }
    onGraphChange(next);
    derive(next);
  }, [graph, onGraphChange, derive]);

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    future.current.push(graph);
    onGraphChange(prev); derive(prev);
  };
  const redo = () => {
    const nxt = future.current.pop();
    if (!nxt) return;
    history.current.push(graph);
    onGraphChange(nxt); derive(nxt);
  };

  // Responsive width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => { const w = entries[0]?.contentRect.width; if (w) setContainerW(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const displayW = Math.round(containerW);
  const displayH = Math.round(containerW * (LOGICAL_H / LOGICAL_W));
  const scale = (displayW / LOGICAL_W) * zoom;

  const derived = deriveModel(graph);
  const roleOf = (id: string): 'exo' | 'med' | 'out' | 'mod' => {
    if (graph.edges.some(e => e.type === 'moderation' && e.from === id)) return 'mod';
    if (derived.mediators.includes(id)) return 'med';
    const hasOut = graph.edges.some(e => (e.type === 'direct' || e.type === 'mediation') && e.from === id);
    const hasIn = graph.edges.some(e => (e.type === 'direct' || e.type === 'mediation') && e.to === id);
    if (hasIn && !hasOut) return 'out';
    return 'exo';
  };

  // ── Drawing ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, pan.x * scale * dpr, pan.y * scale * dpr);
    ctx.clearRect(-pan.x, -pan.y, LOGICAL_W * 3, LOGICAL_H * 3);

    // background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-pan.x - LOGICAL_W, -pan.y - LOGICAL_H, LOGICAL_W * 3, LOGICAL_H * 3);
    // subtle grid
    ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
    for (let x = 0; x < LOGICAL_W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, LOGICAL_H); ctx.stroke(); }
    for (let y = 0; y < LOGICAL_H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(LOGICAL_W, y); ctx.stroke(); }

    const pos = new Map(graph.nodes.map(n => [n.id, n]));

    // edges
    graph.edges.forEach(edge => {
      const a = pos.get(edge.from), b = pos.get(edge.to);
      if (!a || !b) return;
      const meta = TYPE_META[edge.type];
      const sel = edge.id === selectedEdge;
      ctx.save();
      ctx.strokeStyle = meta.color; ctx.lineWidth = sel ? 3 : 2;

      if (edge.type === 'covariance') {
        // dashed double-headed arc
        const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2 - 46;
        ctx.setLineDash([6, 4]);
        const [sx, sy] = rectEdgePoint(a.x, a.y, Math.atan2(midY - a.y, midX - a.x));
        const [ex, ey] = rectEdgePoint(b.x, b.y, Math.atan2(midY - b.y, midX - b.x));
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(midX, midY, ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        arrowhead(ctx, sx, sy, Math.atan2(sy - midY, sx - midX), meta.color, 8);
        arrowhead(ctx, ex, ey, Math.atan2(ey - midY, ex - midX), meta.color, 8);
      } else if (edge.type === 'moderation') {
        // arrow from moderator to the midpoint of the moderated path (or to the DV)
        const iv = edge.moderates ? pos.get(edge.moderates) : null;
        const target = iv ? { x: (iv.x + b.x) / 2, y: (iv.y + b.y) / 2 } : b;
        const ang = Math.atan2(target.y - a.y, target.x - a.x);
        const [sx, sy] = rectEdgePoint(a.x, a.y, ang);
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(target.x, target.y); ctx.stroke();
        ctx.setLineDash([]);
        arrowhead(ctx, target.x, target.y, ang, meta.color, 9);
      } else {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const [sx, sy] = rectEdgePoint(a.x, a.y, ang);
        const [ex, ey] = rectEdgePoint(b.x, b.y, ang + Math.PI);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        arrowhead(ctx, ex, ey, ang, meta.color, 10);
      }
      ctx.restore();
    });

    // pending connect preview
    if (mode === 'connect' && pendingFrom && hoverPoint) {
      const a = pos.get(pendingFrom);
      if (a) {
        ctx.save(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(hoverPoint.x, hoverPoint.y); ctx.stroke(); ctx.restore();
      }
    }

    // nodes
    graph.nodes.forEach(n => {
      const role = roleOf(n.id);
      const fill = role === 'med' ? '#fef9c3' : role === 'out' ? '#dcfce7' : role === 'mod' ? '#f3e8ff' : '#dbeafe';
      const stroke = role === 'med' ? '#b45309' : role === 'out' ? '#16a34a' : role === 'mod' ? '#7c3aed' : '#2563eb';
      const isPending = n.id === pendingFrom;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.fillStyle = fill;
      ctx.strokeStyle = isPending ? '#ef4444' : stroke;
      ctx.lineWidth = isPending ? 3 : 2;
      ctx.beginPath();
      (ctx as any).roundRect?.(n.x - NODE_W / 2, n.y - NODE_H / 2, NODE_W, NODE_H, 6) ?? ctx.rect(n.x - NODE_W / 2, n.y - NODE_H / 2, NODE_W, NODE_H);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 12px system-ui,Arial,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let txt = n.id; const maxW = NODE_W - 12;
      while (ctx.measureText(txt).width > maxW && txt.length > 1) txt = txt.slice(0, -1);
      if (txt !== n.id) txt = txt.slice(0, -1) + '…';
      ctx.fillText(txt, n.x, n.y);
      ctx.restore();
    });
  }, [graph, displayW, displayH, scale, pan, zoom, mode, pendingFrom, hoverPoint, selectedEdge]);

  // ── Hit testing ──────────────────────────────────────────────────────────────
  const toLogical = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / scale - pan.x, y: (clientY - rect.top) / scale - pan.y };
  };
  const nodeAt = (x: number, y: number): string | null => {
    for (let i = graph.nodes.length - 1; i >= 0; i--) {
      const n = graph.nodes[i];
      if (Math.abs(x - n.x) <= NODE_W / 2 && Math.abs(y - n.y) <= NODE_H / 2) return n.id;
    }
    return null;
  };
  const edgeAt = (x: number, y: number): string | null => {
    const pos = new Map(graph.nodes.map(n => [n.id, n]));
    for (const e of graph.edges) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) continue;
      // distance to segment a-b
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + t * dx, py = a.y + t * dy;
      if (Math.hypot(x - px, y - py) < 10) return e.id;
    }
    return null;
  };

  // ── Pointer interaction ──────────────────────────────────────────────────────
  const drag = useRef<{ kind: 'node' | 'pan'; id?: string; ox: number; oy: number; sx: number; sy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toLogical(e.clientX, e.clientY);
    const nid = nodeAt(p.x, p.y);

    if (mode === 'connect') {
      if (nid) {
        if (!pendingFrom) { setPendingFrom(nid); }
        else if (pendingFrom !== nid) {
          const newEdge: BuilderEdge = { id: `e${Date.now()}`, from: pendingFrom, to: nid, type: 'direct' };
          commit({ ...graph, edges: [...graph.edges, newEdge] });
          setPendingFrom(null); setSelectedEdge(newEdge.id);
        } else { setPendingFrom(null); }
      } else { setPendingFrom(null); }
      return;
    }

    // select mode
    if (nid) {
      const n = graph.nodes.find(nn => nn.id === nid)!;
      drag.current = { kind: 'node', id: nid, ox: n.x, oy: n.y, sx: e.clientX, sy: e.clientY };
      setSelectedEdge(null);
      return;
    }
    const eid = edgeAt(p.x, p.y);
    if (eid) { setSelectedEdge(eid); return; }
    setSelectedEdge(null);
    drag.current = { kind: 'pan', ox: pan.x, oy: pan.y, sx: e.clientX, sy: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === 'connect' && pendingFrom) setHoverPoint(toLogical(e.clientX, e.clientY));
    const d = drag.current;
    if (!d) return;
    if (!(e.buttons & 1)) { drag.current = null; return; }
    if (d.kind === 'pan') {
      setPan({ x: d.ox + (e.clientX - d.sx) / scale, y: d.oy + (e.clientY - d.sy) / scale });
    } else if (d.kind === 'node' && d.id) {
      const nx = d.ox + (e.clientX - d.sx) / scale;
      const ny = d.oy + (e.clientY - d.sy) / scale;
      onGraphChange({ ...graph, nodes: graph.nodes.map(n => n.id === d.id ? { ...n, x: nx, y: ny } : n) });
    }
  };

  const onPointerUp = () => {
    if (drag.current?.kind === 'node') { history.current.push(graph); future.current = []; derive(graph); }
    drag.current = null;
  };

  // ── Node palette ─────────────────────────────────────────────────────────────
  const addNode = (col: string) => {
    if (graph.nodes.some(n => n.id === col)) return;
    const count = graph.nodes.length;
    const x = 160 + (count % 5) * 200;
    const y = 120 + Math.floor(count / 5) * 130;
    commit({ ...graph, nodes: [...graph.nodes, { id: col, x, y }] });
  };
  const removeSelectedEdge = () => {
    if (!selectedEdge) return;
    commit({ ...graph, edges: graph.edges.filter(e => e.id !== selectedEdge) });
    setSelectedEdge(null);
  };
  const removeNode = (id: string) => {
    commit({ nodes: graph.nodes.filter(n => n.id !== id), edges: graph.edges.filter(e => e.from !== id && e.to !== id && e.moderates !== id) });
  };
  const setEdgeType = (type: RelType) => {
    if (!selectedEdge) return;
    const edge = graph.edges.find(e => e.id === selectedEdge);
    if (!edge) return;
    // moderation needs a moderated IV — default to the first other incoming path to `to`
    let moderates = edge.moderates;
    if (type === 'moderation') {
      const candidates = graph.edges.filter(e => (e.type === 'direct' || e.type === 'mediation') && e.to === edge.to && e.from !== edge.from).map(e => e.from);
      moderates = moderates && candidates.includes(moderates) ? moderates : candidates[0];
    }
    commit({ ...graph, edges: graph.edges.map(e => e.id === selectedEdge ? { ...e, type, moderates } : e) });
  };
  const setModerates = (iv: string) => {
    if (!selectedEdge) return;
    commit({ ...graph, edges: graph.edges.map(e => e.id === selectedEdge ? { ...e, moderates: iv } : e) });
  };

  const availableCols = columns.filter(c => !graph.nodes.some(n => n.id === c));
  const selEdge = graph.edges.find(e => e.id === selectedEdge) || null;
  const modCandidates = selEdge
    ? graph.edges.filter(e => (e.type === 'direct' || e.type === 'mediation') && e.to === selEdge.to && e.from !== selEdge.from).map(e => e.from)
    : [];

  return (
    <div className="space-y-3" ref={containerRef}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <button onClick={() => { setMode('select'); setPendingFrom(null); }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition ${mode === 'select' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}>
          <MousePointer2 className="w-4 h-4" /> Select / Move
        </button>
        <button onClick={() => { setMode('connect'); setPendingFrom(null); }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition ${mode === 'connect' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}>
          <Spline className="w-4 h-4" /> Draw path
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button onClick={undo} disabled={history.current.length === 0} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40" title="Undo"><Undo2 className="w-4 h-4 text-gray-600" /></button>
        <button onClick={redo} disabled={future.current.length === 0} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40" title="Redo"><Redo2 className="w-4 h-4 text-gray-600" /></button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(1)))} className="p-1.5 rounded hover:bg-gray-200" title="Zoom out"><ZoomOut className="w-4 h-4 text-gray-600" /></button>
        <span className="text-xs font-medium text-gray-600 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(1)))} className="p-1.5 rounded hover:bg-gray-200" title="Zoom in"><ZoomIn className="w-4 h-4 text-gray-600" /></button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1.5 rounded hover:bg-gray-200" title="Reset view"><Maximize2 className="w-4 h-4 text-gray-600" /></button>
        {mode === 'connect' && (
          <span className="text-xs text-blue-700 ml-1">{pendingFrom ? `Click a target node to link from “${pendingFrom}”` : 'Click a source node, then a target node'}</span>
        )}
      </div>

      {/* Variable palette */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-gray-500 mr-1">Add variable:</span>
        {availableCols.length === 0 && <span className="text-xs text-gray-400">all variables added</span>}
        {availableCols.slice(0, 40).map(col => (
          <button key={col} onClick={() => addNode(col)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded-md hover:border-blue-400 hover:bg-blue-50 transition">
            <Plus className="w-3 h-3 text-blue-500" />{col}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: displayW, height: displayH, cursor: mode === 'connect' ? 'crosshair' : 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="touch-none"
        />
      </div>

      {/* Selected-edge inspector */}
      {selEdge && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-800">{selEdge.from} → {selEdge.to}</span>
          <div className="flex items-center gap-1">
            {(['direct', 'mediation', 'moderation', 'covariance'] as RelType[]).map(t => (
              <button key={t} onClick={() => setEdgeType(t)}
                className={`px-2 py-1 text-xs rounded-md font-medium transition ${selEdge.type === t ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}
                style={selEdge.type === t ? { background: TYPE_META[t].color } : undefined}>
                {TYPE_META[t].label}
              </button>
            ))}
          </div>
          {selEdge.type === 'moderation' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">moderates path from</span>
              <select value={selEdge.moderates || ''} onChange={e => setModerates(e.target.value)} className="text-xs border border-gray-300 rounded px-1.5 py-1">
                {modCandidates.length === 0 && <option value="">(no candidate IV → {selEdge.to})</option>}
                {modCandidates.map(iv => <option key={iv} value={iv}>{iv} → {selEdge.to}</option>)}
              </select>
            </div>
          )}
          <button onClick={removeSelectedEdge} className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-md ml-auto">
            <Trash2 className="w-3.5 h-3.5" /> Delete path
          </button>
        </div>
      )}

      {/* Node list / delete */}
      {graph.nodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500 mr-1">Variables in model:</span>
          {graph.nodes.map(n => (
            <span key={n.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 rounded-md">
              {n.id}
              <button onClick={() => removeNode(n.id)} className="text-gray-400 hover:text-red-600" title="Remove">×</button>
            </span>
          ))}
        </div>
      )}

      {/* Legend + derived summary */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1"><GitBranch className="w-3.5 h-3.5 text-slate-700" /> Direct</span>
        <span className="flex items-center gap-1"><Spline className="w-3.5 h-3.5 text-blue-600" /> Mediation</span>
        <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-purple-600" /> Moderation</span>
        <span className="flex items-center gap-1"><Link2 className="w-3.5 h-3.5 text-teal-600" /> Covariance</span>
        <span className="ml-auto text-gray-600">
          Model: <strong>{derived.analysisType.replace('-', ' ')}</strong> · {derived.pathModel.length} path(s)
          {derived.mediators.length > 0 && ` · ${derived.mediators.length} mediator(s)`}
          {derived.moderators.length > 0 && ` · ${derived.moderators.length} moderation(s)`}
        </span>
      </div>
    </div>
  );
}
