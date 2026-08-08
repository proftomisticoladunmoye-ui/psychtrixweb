import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Download, ZoomIn, ZoomOut, RefreshCw, Move, MousePointerClick, Trash2, Play, X } from 'lucide-react';
import { PLSSEMModel, PLSSEMPath } from '../lib/plssemUtils';

interface PLSSEMDiagramProps {
  model: PLSSEMModel;
  measurementResults?: any;
  structuralResults?: any;
  diagramType: 'measurement' | 'structural' | 'full';
  // Interactive editing (optional). When provided, an "Edit" mode lets the user
  // click a path / indicator / construct and remove it, then re-run.
  onRemovePath?: (from: string, to: string) => void;
  onRemoveConstruct?: (id: string) => void;
  onRemoveIndicator?: (constructId: string, indicator: string) => void;
  onRerun?: () => void;
  rerunning?: boolean;
  edited?: boolean; // model changed since last run → prompt a re-run
}

interface NodePos { x: number; y: number; }

type HitRegion =
  | { kind: 'construct'; id: string; cx: number; cy: number }
  | { kind: 'indicator'; constructId: string; name: string; x: number; y: number }
  | { kind: 'path'; from: string; to: string; samples: Array<[number, number]> };

// Logical canvas dimensions — positions computed in this coordinate space
const CW = 1400;
const CH = 800;
const CONSTRUCT_RX = 68;
const CONSTRUCT_RY = 36;
const IND_W = 92;
const IND_H = 30;

function pStar(p?: number): string {
  if (p === undefined) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

function ellipseEdge(cx: number, cy: number, angle: number): [number, number] {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const denom = Math.sqrt((cos / CONSTRUCT_RX) ** 2 + (sin / CONSTRUCT_RY) ** 2);
  if (denom === 0) return [cx, cy];
  return [cx + cos / denom, cy + sin / denom];
}

function rectEdge(cx: number, cy: number, angle: number): [number, number] {
  const hw = IND_W / 2, hh = IND_H / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  if (Math.abs(cos) < 1e-9) return [cx, cy + (sin > 0 ? hh : -hh)];
  if (Math.abs(sin) < 1e-9) return [cx + (cos > 0 ? hw : -hw), cy];
  const tx = hw / Math.abs(cos), ty = hh / Math.abs(sin);
  return [cx + cos * Math.min(tx, ty), cy + sin * Math.min(tx, ty)];
}

function drawArrowhead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, size = 9) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - 0.38), y - size * Math.sin(angle - 0.38));
  ctx.lineTo(x - size * Math.cos(angle + 0.38), y - size * Math.sin(angle + 0.38));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, textColor = '#1e293b') {
  ctx.save();
  ctx.font = 'bold 10px system-ui,sans-serif';
  const w = ctx.measureText(text).width + 10;
  const h = 16;
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  (ctx as any).roundRect?.(x - w / 2, y - h / 2, w, h, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function pathColor(coef?: number, pVal?: number): string {
  if (coef === undefined) return '#94a3b8';
  if (pVal !== undefined && pVal > 0.05) return '#94a3b8';
  const abs = Math.abs(coef);
  if (abs >= 0.3) return '#059669';
  if (abs >= 0.1) return '#2563eb';
  return '#94a3b8';
}

function pathWidth(coef?: number): number {
  if (coef === undefined) return 1.5;
  const abs = Math.abs(coef);
  if (abs >= 0.5) return 4;
  if (abs >= 0.3) return 3;
  if (abs >= 0.1) return 2;
  return 1.5;
}

function topoLayers(model: PLSSEMModel): string[][] {
  const inDeg = new Map<string, number>();
  model.constructs.forEach(c => inDeg.set(c.id, 0));
  model.paths.forEach(p => inDeg.set(p.to, (inDeg.get(p.to) || 0) + 1));

  const layers: string[][] = [];
  const placed = new Set<string>();

  let frontier = model.constructs.filter(c => (inDeg.get(c.id) || 0) === 0).map(c => c.id);
  while (frontier.length > 0) {
    layers.push([...frontier]);
    frontier.forEach(id => placed.add(id));
    const next: string[] = [];
    model.constructs.forEach(c => {
      if (placed.has(c.id)) return;
      if (model.paths.filter(p => p.to === c.id).every(p => placed.has(p.from))) next.push(c.id);
    });
    frontier = next;
  }

  model.constructs.forEach(c => {
    if (!placed.has(c.id)) {
      if (layers.length === 0) layers.push([]);
      layers[layers.length - 1].push(c.id);
    }
  });

  return layers;
}

function computePositions(model: PLSSEMModel): Map<string, NodePos> {
  const pos = new Map<string, NodePos>();
  if (model.constructs.length === 0) return pos;

  const layers = topoLayers(model);
  const nLayers = layers.length;
  const marginX = 260, marginY = 90;
  const usableW = CW - marginX * 2;
  const usableH = CH - marginY * 2;
  const MIN_VERT_GAP = 150;

  layers.forEach((layer, li) => {
    const x = nLayers === 1 ? CW / 2 : marginX + (usableW / Math.max(1, nLayers - 1)) * li;
    const nNodes = layer.length;
    const span = Math.max(usableH, (nNodes - 1) * MIN_VERT_GAP);
    const startY = CH / 2 - span / 2;
    layer.forEach((id, ni) => {
      const y = nNodes === 1 ? CH / 2 : startY + (span / Math.max(1, nNodes - 1)) * ni;
      pos.set(id, { x, y });
    });
  });

  return pos;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  model: PLSSEMModel,
  positions: Map<string, NodePos>,
  measurementResults: any,
  structuralResults: any,
  diagramType: string,
  draggingId: string | null,
  regions?: HitRegion[],
) {
  ctx.clearRect(0, 0, CW, CH);
  // White background — publication/SmartPLS convention (also what exports show)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CW, CH);

  // ── Measurement paths ──────────────────────────────────────────────────
  if (diagramType !== 'structural') {
    model.constructs.forEach(construct => {
      const pos = positions.get(construct.id);
      if (!pos) return;

      const reflData = measurementResults?.reflective?.[construct.name];
      const formData = measurementResults?.formative?.[construct.name];
      const nInd = construct.indicators.length;
      const indGap = Math.min(46, Math.max(26, 160 / Math.max(1, nInd)));
      const totalH = (nInd - 1) * indGap;
      const startY = pos.y - totalH / 2;

      const isFormative = construct.type === 'formative';
      const isExogenous = !model.paths.some(p => p.to === construct.id);
      const indSide = isFormative ? -1 : (isExogenous ? -1 : 1);
      const indX = pos.x + indSide * 230;

      construct.indicators.forEach((indName, k) => {
        const iy = startY + k * indGap;
        regions?.push({ kind: 'indicator', constructId: construct.id, name: indName, x: indX, y: iy });
        const loadingObj = reflData?.indicators?.find((i: any) => i.name === indName);
        const weightObj = formData?.indicators?.find((i: any) => i.name === indName);
        const value = loadingObj?.loading ?? weightObj?.weight;
        const pVal = loadingObj?.pValue ?? weightObj?.pValue;
        const angle = Math.atan2(iy - pos.y, indX - pos.x);
        let ax: number, ay: number, bx: number, by: number;

        if (isFormative) {
          [ax, ay] = rectEdge(indX, iy, angle);
          [bx, by] = ellipseEdge(pos.x, pos.y, angle + Math.PI);
        } else {
          [ax, ay] = ellipseEdge(pos.x, pos.y, angle);
          [bx, by] = rectEdge(indX, iy, angle + Math.PI);
        }
        const arrowAngle = Math.atan2(by - ay, bx - ax);

        ctx.save();
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.restore();
        drawArrowhead(ctx, bx, by, arrowAngle, '#64748b', 7);

        if (value !== undefined) {
          const mx = (ax + bx) / 2 - Math.sin(arrowAngle) * 14;
          const my = (ay + by) / 2 + Math.cos(arrowAngle) * 14;
          drawLabel(ctx, value.toFixed(3) + pStar(pVal), mx, my,
            pVal !== undefined && pVal < 0.05 ? '#1d4ed8' : '#475569');
        }

        // Indicator box
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = isFormative ? '#f59e0b' : '#64748b';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = 'rgba(0,0,0,0.07)'; ctx.shadowBlur = 4;
        ctx.beginPath();
        (ctx as any).roundRect?.(indX - IND_W / 2, iy - IND_H / 2, IND_W, IND_H, 4);
        ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#1e293b';
        ctx.font = '9px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(indName.length > 12 ? indName.slice(0, 11) + '\u2026' : indName, indX, iy);
        ctx.restore();
      });
    });
  }

  // ── Structural paths ───────────────────────────────────────────────────
  model.paths.forEach(path => {
    const fromPos = positions.get(path.from);
    const toPos = positions.get(path.to);
    if (!fromPos || !toPos) return;

    const pathData = structuralResults?.paths?.find(
      (p: PLSSEMPath) => p.from === path.from && p.to === path.to
    );
    const coef = pathData?.coefficient;
    const pVal = pathData?.pValue;
    const color = pathColor(coef, pVal);
    const lw = pathWidth(coef);

    const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
    const angle = Math.atan2(dy, dx);
    const [sx, sy] = ellipseEdge(fromPos.x, fromPos.y, angle);
    const [ex, ey] = ellipseEdge(toPos.x, toPos.y, angle + Math.PI);
    const hasReverse = model.paths.some(p => p.from === path.to && p.to === path.from);
    const dist = Math.sqrt(dx * dx + dy * dy);

    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = lw;

    if (hasReverse || dist < 160) {
      const perp = angle + Math.PI / 2;
      const bend = Math.min(dist * 0.25, 70);
      const cpx = (sx + ex) / 2 + Math.cos(perp) * bend;
      const cpy = (sy + ey) / 2 + Math.sin(perp) * bend;
      if (regions) {
        const samples: Array<[number, number]> = [];
        for (let t = 0; t <= 1.0001; t += 0.1) {
          samples.push([(1 - t) ** 2 * sx + 2 * (1 - t) * t * cpx + t * t * ex,
                        (1 - t) ** 2 * sy + 2 * (1 - t) * t * cpy + t * t * ey]);
        }
        regions.push({ kind: 'path', from: path.from, to: path.to, samples });
      }
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cpx, cpy, ex, ey); ctx.stroke();
      const t = 0.97;
      const arx = (1-t)**2*sx + 2*(1-t)*t*cpx + t*t*ex;
      const ary = (1-t)**2*sy + 2*(1-t)*t*cpy + t*t*ey;
      drawArrowhead(ctx, ex, ey, Math.atan2(ey - ary, ex - arx), color);
      if (coef !== undefined) {
        const mx = 0.25*sx + 0.5*cpx + 0.25*ex + Math.cos(perp)*12;
        const my = 0.25*sy + 0.5*cpy + 0.25*ey + Math.sin(perp)*12;
        drawLabel(ctx, coef.toFixed(3) + pStar(pVal), mx, my,
          pVal !== undefined && pVal < 0.05 ? '#059669' : '#475569');
      }
    } else {
      if (regions) {
        const samples: Array<[number, number]> = [];
        for (let t = 0; t <= 1.0001; t += 0.1) samples.push([sx + (ex - sx) * t, sy + (ey - sy) * t]);
        regions.push({ kind: 'path', from: path.from, to: path.to, samples });
      }
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      drawArrowhead(ctx, ex, ey, angle, color);
      if (coef !== undefined) {
        drawLabel(ctx, coef.toFixed(3) + pStar(pVal),
          (sx+ex)/2 - Math.sin(angle)*16, (sy+ey)/2 + Math.cos(angle)*16,
          pVal !== undefined && pVal < 0.05 ? '#059669' : '#475569');
      }
    }
    ctx.restore();
  });

  // ── Construct ellipses ─────────────────────────────────────────────────
  model.constructs.forEach(construct => {
    const pos = positions.get(construct.id);
    if (!pos) return;
    regions?.push({ kind: 'construct', id: construct.id, cx: pos.x, cy: pos.y });
    const isReflective = construct.type === 'reflective';
    const isEndo = model.paths.some(p => p.to === construct.id);
    const rSq = structuralResults?.rSquared?.[construct.name];
    const isDragging = construct.id === draggingId;

    ctx.save();
    ctx.shadowColor = isDragging ? 'rgba(59,130,246,0.4)' : 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = isDragging ? 18 : 10;
    ctx.shadowOffsetY = isDragging ? 0 : 2;
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, CONSTRUCT_RX, CONSTRUCT_RY, 0, 0, Math.PI * 2);
    ctx.fillStyle = isReflective ? '#dbeafe' : '#fef3c7';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isDragging ? '#2563eb' : (isReflective ? '#3b82f6' : '#f59e0b');
    ctx.lineWidth = (isDragging || isEndo) ? 2.5 : 1.8;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 12px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const dName = construct.name.length > 12 ? construct.name.slice(0, 11) + '\u2026' : construct.name;
    ctx.fillText(dName, pos.x, pos.y - (rSq !== undefined ? 8 : 0));
    if (rSq !== undefined) {
      ctx.font = '10px system-ui,sans-serif';
      ctx.fillStyle = '#059669';
      ctx.fillText(`R\u00B2=${rSq.toFixed(3)}`, pos.x, pos.y + 9);
    }
    ctx.restore();
  });

  // ── Legend ─────────────────────────────────────────────────────────────
  const lx = 12, ly = CH - 96;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
  ctx.beginPath(); // canvas paths survive save/restore — prevents the previous shape leaking into this fill
  (ctx as any).roundRect?.(lx, ly, 320, 84, 6);
  ctx.fill(); ctx.stroke();
  ctx.font = '9px system-ui,sans-serif'; ctx.textBaseline = 'middle';
  const items = [
    ['#3b82f6', 'Reflective construct'],
    ['#f59e0b', 'Formative construct'],
    ['#059669', '|β| ≥ 0.3, p < 0.05'],
    ['#2563eb', '0.1 ≤ |β| < 0.3, p < 0.05'],
  ];
  items.forEach(([color, label], i) => {
    const ix = lx + 10 + (i % 2) * 158, iy = ly + 18 + Math.floor(i / 2) * 22;
    ctx.beginPath(); ctx.arc(ix, iy, 6, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = '#475569'; ctx.fillText(label, ix + 12, iy);
  });
  ctx.font = '8px system-ui,sans-serif'; ctx.fillStyle = '#94a3b8';
  ctx.fillText('* p<.05  ** p<.01  *** p<.001', lx + 10, ly + 72);
  ctx.restore();
}

export const PLSSEMDiagram: React.FC<PLSSEMDiagramProps> = ({
  model,
  measurementResults,
  structuralResults,
  diagramType,
  onRemovePath,
  onRemoveConstruct,
  onRemoveIndicator,
  onRerun,
  rerunning,
  edited,
}) => {
  const editable = !!(onRemovePath || onRemoveConstruct || onRemoveIndicator);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [positions, setPositions] = useState<Map<string, NodePos>>(new Map());
  const [dragMode, setDragMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<HitRegion | null>(null);
  const [containerW, setContainerW] = useState(900);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const regionsRef = useRef<HitRegion[]>([]);

  // Track container width for responsive scaling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      // Guard against a layout feedback loop (container width driven by the
      // canvas it contains): never let the drawing width exceed the viewport,
      // and ignore sub-pixel jitter so we don't re-render on every frame.
      if (!w) return;
      const capped = Math.min(w, typeof window !== 'undefined' ? window.innerWidth : w);
      setContainerW(prev => (Math.abs(prev - capped) > 1 ? capped : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const recalcPositions = useCallback(() => {
    setPositions(computePositions(model));
  }, [model]);

  useEffect(() => { recalcPositions(); }, [recalcPositions]);

  // Physical canvas dimensions — DPR-aware, fills container width
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const displayW = Math.round(containerW);
  const displayH = Math.round(containerW * (CH / CW));
  const physW = displayW * dpr;
  const physH = displayH * dpr;
  // Scale factor: logical CW→displayW
  const scale = (displayW / CW) * zoom;

  // Redraw whenever anything changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || positions.size === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = physW;
    canvas.height = physH;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);

    const regions: HitRegion[] = [];
    drawFrame(ctx, model, positions, measurementResults, structuralResults, diagramType,
      dragRef.current?.id ?? null, regions);
    regionsRef.current = regions;
  }, [model, measurementResults, structuralResults, positions, zoom, diagramType, physW, physH, scale, dpr]);

  // Hit-test in logical space
  const toLogical = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  }, [scale]);

  const hitConstruct = useCallback((lx: number, ly: number): string | null => {
    for (const [id, pos] of positions.entries()) {
      const dx = (lx - pos.x) / CONSTRUCT_RX, dy = (ly - pos.y) / CONSTRUCT_RY;
      if (dx * dx + dy * dy <= 1) return id;
    }
    return null;
  }, [positions]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragMode) return;
    const { x, y } = toLogical(e.clientX, e.clientY);
    const id = hitConstruct(x, y);
    if (id) {
      const pos = positions.get(id)!;
      dragRef.current = { id, offsetX: x - pos.x, offsetY: y - pos.y };
      e.preventDefault();
    }
  }, [dragMode, toLogical, hitConstruct, positions]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragMode) return;
    if (canvasRef.current) {
      const { x, y } = toLogical(e.clientX, e.clientY);
      const over = hitConstruct(x, y);
      canvasRef.current.style.cursor = over ? (dragRef.current ? 'grabbing' : 'grab') : 'default';
    }
    if (!dragRef.current) return;
    // Button released outside the canvas means we never saw mouseup — stop dragging.
    if (!(e.buttons & 1)) { dragRef.current = null; return; }
    const { x, y } = toLogical(e.clientX, e.clientY);
    const { id, offsetX, offsetY } = dragRef.current;
    const nx = Math.max(CONSTRUCT_RX + 8, Math.min(CW - CONSTRUCT_RX - 8, x - offsetX));
    const ny = Math.max(CONSTRUCT_RY + 8, Math.min(CH - CONSTRUCT_RY - 8, y - offsetY));
    setPositions(prev => { const m = new Map(prev); m.set(id, { x: nx, y: ny }); return m; });
  }, [dragMode, toLogical, hitConstruct]);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  // Click-to-select (Edit mode): indicator rect → path proximity → construct ellipse.
  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editMode) return;
    const { x, y } = toLogical(e.clientX, e.clientY);
    const regions = regionsRef.current;
    for (const r of regions) {
      if (r.kind === 'indicator' && Math.abs(x - r.x) <= IND_W / 2 && Math.abs(y - r.y) <= IND_H / 2) { setSelected(r); return; }
    }
    let best: HitRegion | null = null, bestD = 12;
    for (const r of regions) {
      if (r.kind !== 'path') continue;
      for (const [px, py] of r.samples) { const d = Math.hypot(x - px, y - py); if (d < bestD) { bestD = d; best = r; } }
    }
    if (best) { setSelected(best); return; }
    for (const r of regions) {
      if (r.kind === 'construct') { const dx = (x - r.cx) / CONSTRUCT_RX, dy = (y - r.cy) / CONSTRUCT_RY; if (dx * dx + dy * dy <= 1) { setSelected(r); return; } }
    }
    setSelected(null);
  }, [editMode, toLogical]);

  // Clear selection whenever the model changes (e.g. after a removal).
  useEffect(() => { setSelected(null); }, [model]);

  const nameOf = (id: string) => model.constructs.find(c => c.id === id)?.name ?? id;

  // Look up the stats shown in the selection panel.
  const selectedInfo = (): { title: string; detail: string; onRemove?: () => void; removeLabel: string } | null => {
    if (!selected) return null;
    if (selected.kind === 'path') {
      const pd = structuralResults?.paths?.find((p: PLSSEMPath) => p.from === selected.from && p.to === selected.to);
      const b = pd?.coefficient, p = pd?.pValue;
      const sig = p !== undefined ? (p < 0.05 ? `significant (p=${p.toFixed(3)})` : `not significant (p=${p.toFixed(3)})`) : 'run analysis for p-value';
      return {
        title: `Path: ${nameOf(selected.from)} → ${nameOf(selected.to)}`,
        detail: b !== undefined ? `β = ${b.toFixed(3)} · ${sig}` : 'No estimate yet — run the analysis.',
        onRemove: onRemovePath ? () => { onRemovePath(selected.from, selected.to); setSelected(null); } : undefined,
        removeLabel: 'Remove path',
      };
    }
    if (selected.kind === 'indicator') {
      const c = model.constructs.find(cc => cc.id === selected.constructId);
      const refl = measurementResults?.reflective?.[c?.name ?? '']?.indicators?.find((i: any) => i.name === selected.name);
      const form = measurementResults?.formative?.[c?.name ?? '']?.indicators?.find((i: any) => i.name === selected.name);
      const val = refl ? `loading = ${refl.loading?.toFixed(3)} (p=${refl.pValue?.toFixed(3)})`
        : form ? `weight = ${form.weight?.toFixed(3)} (p=${form.pValue?.toFixed(3)}), VIF=${form.vif?.toFixed(2)}`
        : 'No estimate yet — run the analysis.';
      const isLast = (c?.indicators.length ?? 0) <= 1;
      return {
        title: `Indicator: ${selected.name}`,
        detail: `${c?.name ?? ''} · ${val}${isLast ? ' · (last indicator — remove the construct instead)' : ''}`,
        onRemove: onRemoveIndicator && !isLast ? () => { onRemoveIndicator(selected.constructId, selected.name); setSelected(null); } : undefined,
        removeLabel: 'Remove indicator',
      };
    }
    // construct
    const c = model.constructs.find(cc => cc.id === selected.id);
    const rSq = structuralResults?.rSquared?.[c?.name ?? ''];
    return {
      title: `Construct: ${c?.name ?? selected.id}`,
      detail: `${c?.type ?? ''}${rSq !== undefined ? ` · R² = ${rSq.toFixed(3)}` : ''} · removes its indicators and connected paths`,
      onRemove: onRemoveConstruct ? () => { onRemoveConstruct(selected.id); setSelected(null); } : undefined,
      removeLabel: 'Remove construct',
    };
  };

  const exportDiagram = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Export at 2× resolution for crispness
    const offscreen = document.createElement('canvas');
    offscreen.width = CW * 2; offscreen.height = CH * 2;
    const ctx = offscreen.getContext('2d')!;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    drawFrame(ctx, model, positions, measurementResults, structuralResults, diagramType, null);
    const link = document.createElement('a');
    link.download = `plssem-${diagramType}-model.png`;
    link.href = offscreen.toDataURL('image/png', 1.0);
    link.click();
  };

  return (
    <div className="space-y-3 w-full min-w-0" ref={containerRef}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200">
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(1)))}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Zoom Out">
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-medium text-gray-700 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(1)))}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Zoom In">
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>
          <button onClick={() => { setZoom(1); recalcPositions(); }}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Reset">
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button
            onClick={() => { setDragMode(d => !d); if (!dragMode) setEditMode(false); dragRef.current = null; }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              dragMode ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title="Toggle drag mode"
          >
            <Move className="w-4 h-4" />
            <span className="hidden sm:inline">{dragMode ? 'Drag On' : 'Drag'}</span>
          </button>
          {editable && (
            <button
              onClick={() => { setEditMode(m => !m); if (!editMode) setDragMode(false); setSelected(null); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                editMode ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Edit model — click a path, indicator or construct to remove it"
            >
              <MousePointerClick className="w-4 h-4" />
              <span className="hidden sm:inline">{editMode ? 'Editing' : 'Edit'}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editable && onRerun && (
            <button onClick={onRerun} disabled={rerunning}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                edited ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Re-estimate the model with the current constructs and paths">
              <Play className="w-4 h-4" />
              {rerunning ? 'Running…' : 'Re-run'}
            </button>
          )}
          <button onClick={exportDiagram}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export PNG</span>
          </button>
        </div>
      </div>

      {editMode && (
        <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          Edit mode — click a <b>path</b>, <b>indicator</b>, or <b>construct</b> to select it, then remove non-significant pieces and press <b>Re-run</b>. No need to start over.
        </p>
      )}

      {editMode && edited && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Model edited — estimates below are stale. Press <b>Re-run</b> to update.
        </p>
      )}

      {selected && (() => {
        const info = selectedInfo();
        if (!info) return null;
        return (
          <div className="flex items-start justify-between gap-3 bg-white border border-indigo-200 rounded-lg px-4 py-3 shadow-sm">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{info.title}</p>
              <p className="text-xs text-gray-600 mt-0.5 break-words">{info.detail}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {info.onRemove && (
                <button onClick={info.onRemove}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg">
                  <Trash2 className="w-4 h-4" />{info.removeLabel}
                </button>
              )}
              <button onClick={() => setSelected(null)} className="p-1.5 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
            </div>
          </div>
        );
      })()}

      {dragMode && (
        <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          Drag mode — click and drag any construct ellipse to reposition it. Press Drag again or Reset to exit.
        </p>
      )}

      {/* Canvas — fills container, scrollable only when zoomed */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto min-w-0 w-full">
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: `${displayW * zoom}px`,
            height: `${displayH * zoom}px`,
            cursor: editMode ? 'pointer' : 'default',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onClick={onCanvasClick}
        />
      </div>
    </div>
  );
};
