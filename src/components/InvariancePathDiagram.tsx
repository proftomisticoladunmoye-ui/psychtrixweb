import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ZoomIn, ZoomOut, Maximize2, RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvariancePathDiagramProps {
  factorStructure: { [factor: string]: string[] };
  factorLoadings: Array<{ item: string; factor: string; loading: number; se: number; pvalue: number }>;
  intercepts?: Array<{ item: string; value: number; se: number }>;
  residualVariances?: Array<{ item: string; variance: number; se: number }>;
  factorCorrelations: Array<{ factor1: string; factor2: string; correlation: number; pvalue?: number }>;
  invarianceLevel: 'configural' | 'metric' | 'scalar' | 'strict';
  groupName?: string;
  theme?: 'amos' | 'smartpls' | 'journal';
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Classic AMOS vertical layout: errors far left → indicator column → factor
// ellipses right → covariance arcs bowing right (matches the CFA diagram).
const FRX = 74, FRY = 38;
const IND_W = 104, IND_H = 34;
const ERR_R = 15;
const IND_GAP = 52;
const GROUP_GAP = 42;           // extra gap between factor indicator groups
const ERR_X = 58;               // error-circle column x
const IND_X = 205;              // indicator column x (center)
const FACT_X = 520;             // factor ellipse column x (center)
const TOP_PAD = 56;             // room above the first indicator (badge row)

// ─── Theme palettes ───────────────────────────────────────────────────────────

const THEMES = {
  amos: {
    factorFill: '#dbeafe', factorStroke: '#2563eb', factorText: '#1e40af',
    indFill: '#f0fdf4', indStroke: '#16a34a', indText: '#14532d',
    errFill: '#fef9c3', errStroke: '#b45309', errText: '#92400e',
    freeArrow: '#64748b', constrainedArrow: '#2563eb',
    corrColor: '#475569', tauColor: '#7c3aed', sigmaColor: '#b45309',
    bg: '#fafafa', grid: '#ebebeb',
  },
  smartpls: {
    factorFill: '#eff6ff', factorStroke: '#3b82f6', factorText: '#1d4ed8',
    indFill: '#ffffff', indStroke: '#94a3b8', indText: '#1e293b',
    errFill: '#fff7ed', errStroke: '#f97316', errText: '#c2410c',
    freeArrow: '#94a3b8', constrainedArrow: '#3b82f6',
    corrColor: '#64748b', tauColor: '#7c3aed', sigmaColor: '#f97316',
    bg: '#f8fafc', grid: '#f0f0f0',
  },
  journal: {
    factorFill: '#f8f9fa', factorStroke: '#343a40', factorText: '#212529',
    indFill: '#ffffff', indStroke: '#343a40', indText: '#212529',
    errFill: '#f8f9fa', errStroke: '#6c757d', errText: '#343a40',
    freeArrow: '#6c757d', constrainedArrow: '#212529',
    corrColor: '#6c757d', tauColor: '#495057', sigmaColor: '#6c757d',
    bg: '#ffffff', grid: '#eeeeee',
  },
};

const LEVEL_META: Record<string, { label: string; color: string; bg: string; constrained: string[] }> = {
  configural: { label: 'Configural', color: '#2563eb', bg: '#dbeafe', constrained: [] },
  metric:     { label: 'Metric (Weak)', color: '#7c3aed', bg: '#ede9fe', constrained: ['loadings (λ)'] },
  scalar:     { label: 'Scalar (Strong)', color: '#059669', bg: '#d1fae5', constrained: ['loadings (λ)', 'intercepts (τ)'] },
  strict:     { label: 'Strict', color: '#dc2626', bg: '#fee2e2', constrained: ['loadings (λ)', 'intercepts (τ)', 'residual variances (δ)'] },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pStar(p?: number) {
  if (p == null) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

function ellipseEdge(cx: number, cy: number, rx: number, ry: number, angle: number): [number, number] {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const d = Math.sqrt((cos / rx) ** 2 + (sin / ry) ** 2);
  return d > 0 ? [cx + cos / d, cy + sin / d] : [cx, cy];
}

function rectEdge(cx: number, cy: number, angle: number): [number, number] {
  const hw = IND_W / 2, hh = IND_H / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  if (Math.abs(cos) < 1e-9) return [cx, cy + (sin > 0 ? hh : -hh)];
  if (Math.abs(sin) < 1e-9) return [cx + (cos > 0 ? hw : -hw), cy];
  const t = Math.min(hw / Math.abs(cos), hh / Math.abs(sin));
  return [cx + cos * t, cy + sin * t];
}

function arrowhead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, sz = 9) {
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

function valuePill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, bgAlpha = 0.94) {
  ctx.save();
  ctx.font = 'bold 9px system-ui,Arial,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = `rgba(255,255,255,${bgAlpha})`;
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  (ctx as any).roundRect?.(x - w / 2, y - 8, w, 16, 3) ?? ctx.rect(x - w / 2, y - 8, w, 16);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ─── Layout ───────────────────────────────────────────────────────────────────

interface Pos { x: number; y: number }

function computeLayout(
  factorStructure: Record<string, string[]>,
  _cw: number,
): { factorPos: Record<string, Pos>; indicatorPos: Record<string, Pos>; logicalH: number } {
  const factors = Object.keys(factorStructure);
  const n = factors.length;
  if (n === 0) return { factorPos: {}, indicatorPos: {}, logicalH: 600 };

  // Vertical AMOS layout: one column of indicators grouped by factor; each
  // factor ellipse sits to the RIGHT, centered on its group.
  const factorPos: Record<string, Pos> = {};
  const indicatorPos: Record<string, Pos> = {};

  let y = TOP_PAD + IND_H / 2;
  factors.forEach(f => {
    const items = factorStructure[f] || [];
    const groupTop = y;
    items.forEach(item => {
      indicatorPos[item] = { x: IND_X, y };
      y += IND_GAP;
    });
    const groupBottom = y - IND_GAP;
    factorPos[f] = { x: FACT_X, y: items.length ? (groupTop + groupBottom) / 2 : y };
    y += GROUP_GAP;
  });

  const logicalH = y - GROUP_GAP + 70;
  return { factorPos, indicatorPos, logicalH };
}

// ─── Draw function (pure, no closures) ───────────────────────────────────────

function drawDiagram(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  factorStructure: Record<string, string[]>,
  factorPos: Record<string, Pos>,
  indicatorPos: Record<string, Pos>,
  loadingMap: Map<string, { loading: number; pvalue: number }>,
  interceptMap: Map<string, number>,
  residualMap: Map<string, number>,
  corrList: Array<{ factor1: string; factor2: string; correlation: number; pvalue?: number }>,
  invarianceLevel: 'configural' | 'metric' | 'scalar' | 'strict',
  groupName: string | undefined,
  pal: typeof THEMES['amos'],
) {
  const factors = Object.keys(factorStructure);
  const constrained = invarianceLevel !== 'configural';
  const showTau = invarianceLevel === 'scalar' || invarianceLevel === 'strict';
  const showSigma = invarianceLevel === 'strict';
  const meta = LEVEL_META[invarianceLevel];

  ctx.clearRect(0, 0, cw, ch);

  // Plain white background — publication/AMOS convention (no grid).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);

  // ── Group + level badge ──────────────────────────────────────────────────
  ctx.save();
  const badgeText = [groupName, meta.label].filter(Boolean).join(' · ');
  ctx.font = 'bold 11px system-ui,Arial,sans-serif';
  const bw = ctx.measureText(badgeText).width + 22;
  const bx = cw - bw - 12, by = 10;
  ctx.fillStyle = meta.bg;
  ctx.strokeStyle = meta.color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  (ctx as any).roundRect?.(bx, by, bw, 24, 6) ?? ctx.rect(bx, by, bw, 24);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = meta.color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, bx + bw / 2, by + 12);
  ctx.restore();

  // ── 1. Factor covariance arcs (bowing RIGHT, AMOS style) ──────────────────
  const factorOrderMap = new Map(factors.map((f, i) => [f, i]));
  corrList.forEach(fc => {
    const p1 = factorPos[fc.factor1], p2 = factorPos[fc.factor2];
    if (!p1 || !p2) return;

    const span = Math.abs((factorOrderMap.get(fc.factor1) ?? 0) - (factorOrderMap.get(fc.factor2) ?? 0));
    const bow = 50 + 50 * Math.max(span - 1, 0) + 16 * Math.min(span, 1);
    const cpX = Math.max(p1.x, p2.x) + FRX + bow;
    const midY = (p1.y + p2.y) / 2;

    const a1 = Math.atan2(midY - p1.y, cpX - p1.x);
    const a2 = Math.atan2(midY - p2.y, cpX - p2.x);
    const [sx, sy] = ellipseEdge(p1.x, p1.y, FRX, FRY, a1);
    const [ex, ey] = ellipseEdge(p2.x, p2.y, FRX, FRY, a2);

    ctx.save();
    ctx.strokeStyle = pal.corrColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cpX, midY, ex, ey); ctx.stroke();

    const t = 0.06;
    const q1x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * cpX + t ** 2 * ex;
    const q1y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * midY + t ** 2 * ey;
    const q2t = 1 - t;
    const q2x = (1 - q2t) ** 2 * sx + 2 * (1 - q2t) * q2t * cpX + q2t ** 2 * ex;
    const q2y = (1 - q2t) ** 2 * sy + 2 * (1 - q2t) * q2t * midY + q2t ** 2 * ey;
    arrowhead(ctx, sx, sy, Math.atan2(sy - q1y, sx - q1x), pal.corrColor, 9);
    arrowhead(ctx, ex, ey, Math.atan2(ey - q2y, ex - q2x), pal.corrColor, 9);

    const labX = 0.25 * sx + 0.5 * cpX + 0.25 * ex + 14;
    const labY = 0.25 * sy + 0.5 * midY + 0.25 * ey;
    const label = fc.correlation.toFixed(2).replace(/^(-?)0\./, '$1.') + pStar(fc.pvalue);
    valuePill(ctx, label, labX, labY, pal.corrColor);
    ctx.restore();
  });

  // ── 2. Measurement paths: factor → indicator ──────────────────────────────
  factors.forEach(factor => {
    const fp = factorPos[factor];
    if (!fp) return;

    (factorStructure[factor] || []).forEach(item => {
      const ip = indicatorPos[item];
      if (!ip) return;

      const angle = Math.atan2(ip.y - fp.y, ip.x - fp.x);
      const [sx, sy] = ellipseEdge(fp.x, fp.y, FRX, FRY, angle);
      const [ex, ey] = rectEdge(ip.x, ip.y, angle + Math.PI);

      const pathColor = constrained ? pal.constrainedArrow : pal.freeArrow;
      const lw = constrained ? 2.2 : 1.6;

      ctx.save();
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = lw;
      if (!constrained) ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      arrowhead(ctx, ex, ey, angle, pathColor, 9);

      // Loading label — AMOS convention: near the indicator end, above the arrow
      const fl = loadingMap.get(`${factor}::${item}`);
      if (fl !== undefined) {
        const t = 0.30;
        const mx = ex + (sx - ex) * t;
        const my = ey + (sy - ey) * t - 12;
        const sig = fl.pvalue < 0.05;
        const lc = sig ? pathColor : '#9ca3af';
        valuePill(ctx, fl.loading.toFixed(2).replace(/^(-?)0\./, '$1.') + pStar(fl.pvalue), mx, my, lc);
      }
      ctx.restore();
    });
  });

  // ── 3. Error/residual circles (far-left column, e1..eN, AMOS style) ───────
  const errIndexMap = new Map(
    factors.flatMap(f => factorStructure[f] || []).map((it, i) => [it, i])
  );
  factors.forEach(factor => {
    (factorStructure[factor] || []).forEach(item => {
      const ip = indicatorPos[item];
      if (!ip) return;

      const errX = ERR_X;
      const errY = ip.y;

      // Arrow from error circle right edge into the indicator's left edge
      const esx = errX + ERR_R;
      const eex = ip.x - IND_W / 2;

      const errColor = showSigma ? pal.sigmaColor : pal.errStroke;
      const errLw = showSigma ? 2 : 1.4;

      ctx.save();
      ctx.strokeStyle = errColor;
      ctx.lineWidth = errLw;
      ctx.beginPath(); ctx.moveTo(esx, errY); ctx.lineTo(eex, errY); ctx.stroke();
      arrowhead(ctx, eex, errY, 0, errColor, 7);

      // Error circle
      ctx.beginPath(); ctx.arc(errX, errY, ERR_R, 0, Math.PI * 2);
      ctx.fillStyle = showSigma ? '#fff7ed' : pal.errFill;
      ctx.fill();
      ctx.strokeStyle = errColor; ctx.lineWidth = errLw; ctx.stroke();

      // Label inside error circle
      ctx.fillStyle = pal.errText;
      ctx.font = showSigma ? 'bold 7.5px system-ui,Arial,sans-serif' : 'bold 9.5px system-ui,Arial,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

      if (showSigma) {
        const rv = residualMap.get(item);
        ctx.fillText(rv !== undefined ? rv.toFixed(2) : 'δ', errX, errY);
      } else {
        ctx.fillText(`e${(errIndexMap.get(item) ?? 0) + 1}`, errX, errY);
      }
      ctx.restore();
    });
  });

  // ── 4. Indicator rectangles ───────────────────────────────────────────────
  const allItems = factors.flatMap(f => factorStructure[f] || []);
  allItems.forEach(item => {
    const ip = indicatorPos[item];
    if (!ip) return;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.07)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.fillStyle = pal.indFill;
    ctx.strokeStyle = showTau ? pal.tauColor : pal.indStroke;
    ctx.lineWidth = showTau ? 2 : 1.5;
    ctx.beginPath();
    (ctx as any).roundRect?.(ip.x - IND_W / 2, ip.y - IND_H / 2, IND_W, IND_H, 4)
      ?? ctx.rect(ip.x - IND_W / 2, ip.y - IND_H / 2, IND_W, IND_H);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // Item name — upper portion of box
    ctx.fillStyle = pal.indText;
    const nameY = showTau ? ip.y - 7 : ip.y;
    ctx.font = '9px system-ui,Arial,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let txt = item;
    const maxW = IND_W - 8;
    while (ctx.measureText(txt).width > maxW && txt.length > 1) txt = txt.slice(0, -1);
    if (txt !== item) txt = txt.slice(0, -1) + '…';
    ctx.fillText(txt, ip.x, nameY);

    // τ value — lower portion of box (scalar/strict)
    if (showTau) {
      const tau = interceptMap.get(item);
      ctx.fillStyle = pal.tauColor;
      ctx.font = 'bold 7.5px system-ui,Arial,sans-serif';
      ctx.fillText(tau !== undefined ? `τ=${tau.toFixed(2)}` : 'τ=—', ip.x, ip.y + 7);
    }
    ctx.restore();
  });

  // ── 5. Factor ellipses ────────────────────────────────────────────────────
  factors.forEach(factor => {
    const fp = factorPos[factor];
    if (!fp) return;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.beginPath(); ctx.ellipse(fp.x, fp.y, FRX, FRY, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.factorFill; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = constrained ? pal.constrainedArrow : pal.factorStroke;
    ctx.lineWidth = constrained ? 2.8 : 2.2;
    ctx.stroke();

    // Factor name
    ctx.fillStyle = pal.factorText;
    ctx.font = 'bold 11px system-ui,Arial,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const words = factor.split(/[\s_]+/);
    if (words.length > 1 && ctx.measureText(factor).width > FRX * 1.7) {
      const h = Math.ceil(words.length / 2);
      ctx.font = 'bold 10px system-ui,Arial,sans-serif';
      ctx.fillText(words.slice(0, h).join(' '), fp.x, fp.y - 7);
      ctx.fillText(words.slice(h).join(' '), fp.x, fp.y + 7);
    } else {
      let name = factor;
      while (ctx.measureText(name).width > FRX * 1.8 && name.length > 1) name = name.slice(0, -1);
      if (name !== factor) name = name.slice(0, -1) + '…';
      ctx.fillText(name, fp.x, fp.y);
    }
    ctx.restore();
  });

  // ── 6. Legend ─────────────────────────────────────────────────────────────
  ctx.save();
  const lx = 10, ly = ch - 70;
  const lw = 340, lh = 62;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
  ctx.beginPath(); // canvas paths survive save/restore — prevents the previous shape leaking into this fill
  (ctx as any).roundRect?.(lx, ly, lw, lh, 5) ?? ctx.rect(lx, ly, lw, lh);
  ctx.fill(); ctx.stroke();

  ctx.font = 'bold 9px system-ui,Arial,sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#374151';
  ctx.textAlign = 'left';
  ctx.fillText('Constraints at this level:', lx + 8, ly + 12);

  const constList = meta.constrained;
  if (constList.length === 0) {
    ctx.font = '8.5px system-ui,Arial,sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('None — all parameters free across groups', lx + 8, ly + 30);
  } else {
    ctx.font = '8.5px system-ui,Arial,sans-serif';
    ctx.fillStyle = meta.color;
    ctx.fillText('= constrained equal across groups: ' + constList.join(', '), lx + 8, ly + 30);
  }

  ctx.font = '8px system-ui,Arial,sans-serif'; ctx.fillStyle = '#9ca3af';
  ctx.fillText('* p<.05  ** p<.01  *** p<.001   |   λ=loading  τ=intercept  δ=residual variance  φ=factor correlation', lx + 8, ly + 50);
  ctx.restore();
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InvariancePathDiagram({
  factorStructure,
  factorLoadings,
  intercepts = [],
  residualVariances = [],
  factorCorrelations,
  invarianceLevel,
  groupName,
  theme = 'amos',
}: InvariancePathDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerW, setContainerW] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const pal = THEMES[theme];
  const factors = Object.keys(factorStructure);

  // Logical canvas size — width fits factor column + covariance arcs
  const logicalW = Math.max(containerW, FACT_X + FRX + 190);

  // Maps for fast lookup
  const loadingMap = new Map<string, { loading: number; pvalue: number }>();
  factorLoadings.forEach(fl => loadingMap.set(`${fl.factor}::${fl.item}`, { loading: fl.loading, pvalue: fl.pvalue }));
  const interceptMap = new Map<string, number>();
  intercepts.forEach(it => interceptMap.set(it.item, it.value));
  const residualMap = new Map<string, number>();
  residualVariances.forEach(rv => residualMap.set(rv.item, rv.variance));

  // Layout positions (vertical AMOS layout; height driven by indicator count)
  const { factorPos, indicatorPos, logicalH: layoutH } = computeLayout(factorStructure, logicalW);
  const logicalH = layoutH + 80; // room for the legend box

  // Drag/pan state
  const pointerMode = useRef<'none' | 'pan'>('none');
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const displayW = Math.round(logicalW * zoomRef.current);
    const displayH = Math.round(logicalH * zoomRef.current);
    if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      canvas.style.width = `${displayW}px`;
      canvas.style.height = `${displayH}px`;
    }
    // Clear full physical canvas before drawing
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * zoomRef.current, 0, 0, dpr * zoomRef.current, panRef.current.x * dpr * zoomRef.current, panRef.current.y * dpr * zoomRef.current);
    drawDiagram(ctx, logicalW, logicalH, factorStructure, factorPos, indicatorPos, loadingMap, interceptMap, residualMap, factorCorrelations, invarianceLevel, groupName, pal);
  }, [factorStructure, factorPos, indicatorPos, loadingMap, interceptMap, residualMap, factorCorrelations, invarianceLevel, groupName, pal, logicalW, logicalH]);

  useEffect(() => {
    zoomRef.current = zoom;
    panRef.current = pan;
    redraw();
  }, [zoom, pan, redraw]);

  useEffect(() => { redraw(); }, [redraw]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // pan only with the primary button
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerMode.current = 'pan';
    panStart.current = { x: e.clientX, y: e.clientY, ox: panRef.current.x, oy: panRef.current.y };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerMode.current !== 'pan') return;
    // Stray pointermoves (hover, synthetic events) arrive with no button held —
    // without this guard they silently pan the diagram off-canvas.
    if (!(e.buttons & 1)) { pointerMode.current = 'none'; return; }
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    const np = { x: panStart.current.ox + dx / zoomRef.current, y: panStart.current.oy + dy / zoomRef.current };
    panRef.current = np;
    setPan(np);
  };

  const handlePointerUp = () => { pointerMode.current = 'none'; };

  const exportPNG = () => {
    const off = document.createElement('canvas');
    off.width = logicalW * 2; off.height = logicalH * 2;
    const ctx = off.getContext('2d')!;
    ctx.scale(2, 2);
    drawDiagram(ctx, logicalW, logicalH, factorStructure, factorPos, indicatorPos, loadingMap, interceptMap, residualMap, factorCorrelations, invarianceLevel, groupName, pal);
    const link = document.createElement('a');
    link.download = `invariance-${invarianceLevel}${groupName ? '-' + groupName : ''}.png`;
    link.href = off.toDataURL('image/png', 1.0);
    link.click();
  };

  if (factors.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-wrap">
        <div className="flex items-center gap-2 mr-2">
          <span className="font-semibold text-sm text-gray-800">Measurement Model</span>
          {groupName && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">{groupName}</span>
          )}
          <span className="px-2 py-0.5 text-xs rounded-full font-medium"
            style={{ background: LEVEL_META[invarianceLevel].bg, color: LEVEL_META[invarianceLevel].color }}>
            {LEVEL_META[invarianceLevel].label}
          </span>
        </div>

        <button onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}
          className="p-1.5 hover:bg-gray-200 rounded transition" title="Zoom Out">
          <ZoomOut className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <span className="text-xs font-medium text-gray-600 min-w-[36px] text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.15))}
          className="p-1.5 hover:bg-gray-200 rounded transition" title="Zoom In">
          <ZoomIn className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="p-1.5 hover:bg-gray-200 rounded transition" title="Reset View">
          <Maximize2 className="w-3.5 h-3.5 text-gray-600" />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="flex items-center gap-1 px-2 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition font-medium">
          <RefreshCw className="w-3.5 h-3.5" />
          Reset
        </button>

        <div className="ml-auto">
          <button onClick={exportPNG}
            className="flex items-center gap-1 px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium">
            <Download className="w-3.5 h-3.5" />PNG
          </button>
        </div>
      </div>

      {/* Constraint explanation strip */}
      {LEVEL_META[invarianceLevel].constrained.length > 0 && (
        <div className="px-4 py-2 border-b text-xs flex items-center gap-2 flex-wrap"
          style={{ background: LEVEL_META[invarianceLevel].bg + '60', borderColor: LEVEL_META[invarianceLevel].color + '40' }}>
          <span className="font-semibold" style={{ color: LEVEL_META[invarianceLevel].color }}>
            Constrained equal across groups:
          </span>
          {LEVEL_META[invarianceLevel].constrained.map(c => (
            <span key={c} className="px-2 py-0.5 rounded-full text-xs font-medium bg-white border"
              style={{ borderColor: LEVEL_META[invarianceLevel].color + '60', color: LEVEL_META[invarianceLevel].color }}>
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="overflow-auto bg-gray-50 w-full" style={{ maxHeight: 580 }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', cursor: 'grab' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="touch-none"
        />
      </div>

      {/* Status bar */}
      <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span>
          {factors.length} factor{factors.length !== 1 ? 's' : ''} &middot; {Object.values(factorStructure).flat().length} indicators &middot; {factorCorrelations.length} correlation{factorCorrelations.length !== 1 ? 's' : ''}
        </span>
        <span className="text-gray-400">Drag to pan &nbsp;|&nbsp; λ=loading &nbsp;|&nbsp; τ=intercept &nbsp;|&nbsp; δ=residual variance</span>
      </div>
    </div>
  );
}
