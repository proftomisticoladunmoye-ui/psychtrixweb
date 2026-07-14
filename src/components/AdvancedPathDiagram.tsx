import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Download, ZoomIn, ZoomOut, Maximize2, Layers, Pencil,
  Lock, Unlock, RotateCcw, RotateCw, RefreshCw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FactorLoading {
  item: string;
  factor: string;
  loading: number;
  se?: number;
  z?: number;
  pvalue?: number;
  std_loading: number;
}

export interface FactorCorrelation {
  factor1: string;
  factor2: string;
  correlation: number;
  se?: number;
  pvalue?: number;
}

export interface SecondOrderFactor {
  name: string;
  firstOrderFactors: string[];
  loadings?: { factor: string; loading: number }[];
}

export interface AdvancedPathDiagramProps {
  factorStructure: { [factor: string]: string[] };
  factorLoadings: FactorLoading[];
  factorCorrelations: FactorCorrelation[];
  secondOrderFactors?: SecondOrderFactor[];
  modelType?: 'first-order' | 'second-order';
  invarianceLevel?: 'configural' | 'metric' | 'scalar' | 'strict';
  groupName?: string;
  latentLabels?: { [key: string]: string };
  onLabelChange?: (key: string, value: string) => void;
  theme?: 'amos' | 'smartpls' | 'journal';
}

interface NodePos { x: number; y: number; locked?: boolean }
type HistoryEntry = { factorPos: Record<string, NodePos>; indicatorPos: Record<string, NodePos> };

// ─── Constants ────────────────────────────────────────────────────────────────

const FRX = 64, FRY = 34;          // factor ellipse radii
const IND_W = 78, IND_H = 32;      // indicator rectangle size
const ERR_R = 14;                   // error circle radius
const SO_RX = 58, SO_RY = 28;      // second-order ellipse radii
const IND_GAP = 54;                 // vertical gap between indicator centers
const FACTOR_COL_W = 300;          // horizontal column width per factor

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pStar(p?: number) {
  if (p === undefined) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

function ellipseEdge(cx: number, cy: number, rx: number, ry: number, angle: number): [number, number] {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const denom = Math.sqrt((cos / rx) ** 2 + (sin / ry) ** 2);
  return denom > 0 ? [cx + cos / denom, cy + sin / denom] : [cx, cy];
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
  ctx.lineTo(x - sz * Math.cos(angle - 0.38), y - sz * Math.sin(angle - 0.38));
  ctx.lineTo(x - sz * Math.cos(angle + 0.38), y - sz * Math.sin(angle + 0.38));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawValueLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.font = 'bold 9.5px system-ui,Arial,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  (ctx as any).roundRect?.(x - w / 2, y - 8, w, 16, 3) ?? ctx.rect(x - w / 2, y - 8, w, 16);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ─── Layout computation ───────────────────────────────────────────────────────

function computeCFAPositions(
  factorStructure: Record<string, string[]>,
  modelType: string,
  canvasW: number,
  canvasH: number,
): { factorPos: Record<string, NodePos>; indicatorPos: Record<string, NodePos> } {
  const factors = Object.keys(factorStructure);
  const n = factors.length;
  if (n === 0) return { factorPos: {}, indicatorPos: {} };

  const hasSecondOrder = modelType === 'second-order';
  const marginX = 80;
  const factorY = hasSecondOrder ? canvasH * 0.45 : canvasH * 0.32;

  const colW = (canvasW - marginX * 2) / Math.max(n, 1);

  const factorPos: Record<string, NodePos> = {};
  factors.forEach((f, i) => {
    factorPos[f] = { x: marginX + colW * i + colW / 2, y: factorY };
  });

  const indicatorPos: Record<string, NodePos> = {};
  factors.forEach(f => {
    const fp = factorPos[f];
    const items = factorStructure[f] || [];
    const totalH = Math.max(items.length - 1, 0) * IND_GAP;
    const startY = fp.y + FRY + 48;
    items.forEach((item, k) => {
      indicatorPos[item] = { x: fp.x, y: startY + k * IND_GAP };
    });
  });

  return { factorPos, indicatorPos };
}

// ─── Theme palettes ───────────────────────────────────────────────────────────

const THEMES = {
  amos: {
    factorFill: '#dbeafe', factorStroke: '#2563eb', factorText: '#1e40af',
    soFill: '#ede9fe', soStroke: '#7c3aed', soText: '#4c1d95',
    indFill: '#f0fdf4', indStroke: '#16a34a', indText: '#14532d',
    errFill: '#fef9c3', errStroke: '#ca8a04', errText: '#92400e',
    arrowColor: '#2563eb', corrColor: '#64748b', coefColor: '#1d4ed8',
    labelBg: 'rgba(255,255,255,0.93)', gridColor: '#f0f0f0',
  },
  smartpls: {
    factorFill: '#eff6ff', factorStroke: '#3b82f6', factorText: '#1d4ed8',
    soFill: '#f5f3ff', soStroke: '#8b5cf6', soText: '#5b21b6',
    indFill: '#ffffff', indStroke: '#94a3b8', indText: '#1e293b',
    errFill: '#fff7ed', errStroke: '#f97316', errText: '#c2410c',
    arrowColor: '#3b82f6', corrColor: '#64748b', coefColor: '#1d4ed8',
    labelBg: 'rgba(255,255,255,0.93)', gridColor: '#f5f5f5',
  },
  journal: {
    factorFill: '#f8f9fa', factorStroke: '#343a40', factorText: '#212529',
    soFill: '#f1f3f5', soStroke: '#495057', soText: '#212529',
    indFill: '#ffffff', indStroke: '#343a40', indText: '#212529',
    errFill: '#f8f9fa', errStroke: '#6c757d', errText: '#343a40',
    arrowColor: '#343a40', corrColor: '#6c757d', coefColor: '#212529',
    labelBg: 'rgba(255,255,255,0.95)', gridColor: '#eeeeee',
  },
};

const INVARIANCE_BADGE = {
  configural: { label: 'Configural', color: '#3b82f6', bg: '#dbeafe' },
  metric:     { label: 'Metric',     color: '#8b5cf6', bg: '#ede9fe' },
  scalar:     { label: 'Scalar',     color: '#059669', bg: '#d1fae5' },
  strict:     { label: 'Strict',     color: '#dc2626', bg: '#fee2e2' },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdvancedPathDiagram({
  factorStructure,
  factorLoadings,
  factorCorrelations,
  secondOrderFactors = [],
  modelType = 'first-order',
  invarianceLevel,
  groupName,
  latentLabels = {},
  onLabelChange,
  theme = 'amos',
}: AdvancedPathDiagramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const factors = useMemo(() => Object.keys(factorStructure), [factorStructure]);
  const allItems = useMemo(() => factors.flatMap(f => factorStructure[f] || []), [factors, factorStructure]);

  // Dynamic canvas size
  const canvasW = useMemo(() => Math.max(800, factors.length * FACTOR_COL_W), [factors]);
  const canvasH = useMemo(() => {
    const maxInds = Math.max(...factors.map(f => (factorStructure[f] || []).length), 1);
    const soExtra = modelType === 'second-order' ? 120 : 0;
    return Math.max(600, soExtra + 120 + maxInds * IND_GAP + 180);
  }, [factors, factorStructure, modelType]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showLoadings, setShowLoadings] = useState(true);
  const [showErrors, setShowErrors] = useState(true);
  const [currentTheme, setCurrentTheme] = useState<'amos' | 'smartpls' | 'journal'>(theme);
  const [locked, setLocked] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { setCurrentTheme(theme); }, [theme]);

  const [factorPos, setFactorPos] = useState<Record<string, NodePos>>({});
  const [indicatorPos, setIndicatorPos] = useState<Record<string, NodePos>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [histIdx, setHistIdx] = useState(-1);

  const dragRef = useRef<{ type: 'factor' | 'indicator' | 'pan'; key: string; ox: number; oy: number; mx: number; my: number } | null>(null);
  const [editing, setEditing] = useState<{ key: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const loadingMap = useMemo(() => {
    const m = new Map<string, FactorLoading>();
    factorLoadings.forEach(fl => m.set(`${fl.factor}::${fl.item}`, fl));
    return m;
  }, [factorLoadings]);

  const pal = THEMES[currentTheme];

  // Initialize positions
  useEffect(() => {
    const { factorPos: fp, indicatorPos: ip } = computeCFAPositions(
      factorStructure, modelType, canvasW, canvasH
    );
    setFactorPos(fp);
    setIndicatorPos(ip);
    setHistory([{ factorPos: JSON.parse(JSON.stringify(fp)), indicatorPos: JSON.parse(JSON.stringify(ip)) }]);
    setHistIdx(0);
  }, [factorStructure, modelType, canvasW, canvasH]);

  const pushHistory = useCallback((fp: Record<string, NodePos>, ip: Record<string, NodePos>) => {
    const entry: HistoryEntry = {
      factorPos: JSON.parse(JSON.stringify(fp)),
      indicatorPos: JSON.parse(JSON.stringify(ip)),
    };
    setHistIdx(prevIdx => {
      setHistory(prevH => {
        const next = prevH.slice(0, prevIdx + 1);
        next.push(entry);
        return next.slice(-50);
      });
      return Math.min(prevIdx + 1, 49);
    });
  }, []);

  const undo = useCallback(() => {
    if (histIdx <= 0) return;
    const e = history[histIdx - 1];
    setFactorPos(JSON.parse(JSON.stringify(e.factorPos)));
    setIndicatorPos(JSON.parse(JSON.stringify(e.indicatorPos)));
    setHistIdx(histIdx - 1);
  }, [history, histIdx]);

  const redo = useCallback(() => {
    if (histIdx >= history.length - 1) return;
    const e = history[histIdx + 1];
    setFactorPos(JSON.parse(JSON.stringify(e.factorPos)));
    setIndicatorPos(JSON.parse(JSON.stringify(e.indicatorPos)));
    setHistIdx(histIdx + 1);
  }, [history, histIdx]);

  // ─── Draw ─────────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== canvasW * dpr * zoom || canvas.height !== canvasH * dpr * zoom) {
      canvas.width = canvasW * dpr * zoom;
      canvas.height = canvasH * dpr * zoom;
      canvas.style.width = `${canvasW * zoom}px`;
      canvas.style.height = `${canvasH * zoom}px`;
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr * zoom, dpr * zoom);
    ctx.translate(pan.x, pan.y);

    // Background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(-pan.x, -pan.y, canvasW, canvasH);

    // Grid
    ctx.strokeStyle = pal.gridColor;
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx < canvasW; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvasH); ctx.stroke();
    }
    for (let gy = 0; gy < canvasH; gy += 40) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvasW, gy); ctx.stroke();
    }

    // ── Group/invariance badge ───────────────────────────────────────────────
    if (groupName || invarianceLevel) {
      ctx.save();
      const badge = invarianceLevel ? INVARIANCE_BADGE[invarianceLevel] : null;
      const badgeText = [groupName, badge?.label].filter(Boolean).join(' · ');
      ctx.font = 'bold 11px system-ui,Arial,sans-serif';
      const bw = ctx.measureText(badgeText).width + 20;
      const bx = canvasW - bw - 12, by = 10;
      ctx.fillStyle = badge?.bg ?? '#f3f4f6';
      ctx.strokeStyle = badge?.color ?? '#9ca3af';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      (ctx as any).roundRect?.(bx, by, bw, 24, 6) ?? ctx.rect(bx, by, bw, 24);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = badge?.color ?? '#374151';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx + bw / 2, by + 12);
      ctx.restore();
    }

    // ── 1. Double-headed factor correlation arcs ─────────────────────────────
    factorCorrelations.forEach(fc => {
      const p1 = factorPos[fc.factor1], p2 = factorPos[fc.factor2];
      if (!p1 || !p2) return;

      ctx.save();
      ctx.strokeStyle = pal.corrColor;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([]);

      // Determine arc direction: curve above (smaller y = higher on screen)
      const midX = (p1.x + p2.x) / 2;
      const arcLift = Math.abs(p2.x - p1.x) * 0.35 + 40;
      const cpY = Math.min(p1.y, p2.y) - arcLift;

      // Start/end angles — top of each ellipse, slightly inward
      const a1 = Math.atan2(cpY - p1.y, midX - p1.x);
      const a2 = Math.atan2(cpY - p2.y, midX - p2.x);
      const [sx, sy] = ellipseEdge(p1.x, p1.y, FRX, FRY, a1);
      const [ex, ey] = ellipseEdge(p2.x, p2.y, FRX, FRY, a2);

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(midX, cpY, ex, ey);
      ctx.stroke();

      // Double arrowheads at both ends
      const t = 0.05;
      const q1x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * midX + t * t * ex;
      const q1y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cpY + t * t * ey;
      const q2x = (1 - (1 - t)) * (1 - (1 - t)) * sx + 2 * (1 - (1 - t)) * (1 - t) * midX + (1 - t) * (1 - t) * ex;
      const q2y = (1 - (1 - t)) * (1 - (1 - t)) * sy + 2 * (1 - (1 - t)) * (1 - t) * cpY + (1 - t) * (1 - t) * ey;

      arrowhead(ctx, sx, sy, Math.atan2(sy - q1y, sx - q1x), pal.corrColor, 9);
      arrowhead(ctx, ex, ey, Math.atan2(ey - q2y, ex - q2x), pal.corrColor, 9);

      // φ label at arc midpoint
      const phiX = midX, phiY = cpY + 8;
      const label = `φ=${fc.correlation.toFixed(3)}${pStar(fc.pvalue)}`;
      drawValueLabel(ctx, label, phiX, phiY, pal.corrColor);

      ctx.restore();
    });

    // ── 2. Measurement paths (factor → indicator) ────────────────────────────
    factors.forEach(factor => {
      const fp = factorPos[factor];
      if (!fp) return;

      (factorStructure[factor] || []).forEach(item => {
        const ip = indicatorPos[item];
        if (!ip) return;

        const angle = Math.atan2(ip.y - fp.y, ip.x - fp.x);
        const [sx, sy] = ellipseEdge(fp.x, fp.y, FRX, FRY, angle);
        const [ex, ey] = rectEdge(ip.x, ip.y, angle + Math.PI);

        ctx.save();
        ctx.strokeStyle = pal.arrowColor;
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        arrowhead(ctx, ex, ey, angle, pal.arrowColor, 8);

        if (showLoadings) {
          const fl = loadingMap.get(`${factor}::${item}`);
          if (fl !== undefined) {
            const mx = (sx + ex) / 2 - Math.sin(angle) * 14;
            const my = (sy + ey) / 2 + Math.cos(angle) * 14;
            const sig = fl.pvalue === undefined || fl.pvalue < 0.05;
            const lcolor = sig ? pal.arrowColor : '#9ca3af';
            drawValueLabel(ctx, fl.std_loading.toFixed(3) + pStar(fl.pvalue), mx, my, lcolor);
          }
        }
        ctx.restore();

        // Error term: circle to the right of indicator
        if (showErrors) {
          const errX = ip.x + IND_W / 2 + ERR_R + 8;
          const errY = ip.y;
          const errAngle = Math.atan2(ip.y - errY, ip.x - errX);
          const esx = errX + Math.cos(errAngle) * ERR_R;
          const esy = errY + Math.sin(errAngle) * ERR_R;
          const [eex, eey] = rectEdge(ip.x, ip.y, errAngle + Math.PI);

          ctx.save();
          ctx.strokeStyle = pal.errStroke;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(esx, esy); ctx.lineTo(eex, eey); ctx.stroke();
          arrowhead(ctx, eex, eey, errAngle, pal.errStroke, 7);

          ctx.beginPath(); ctx.arc(errX, errY, ERR_R, 0, Math.PI * 2);
          ctx.fillStyle = pal.errFill; ctx.fill();
          ctx.strokeStyle = pal.errStroke; ctx.lineWidth = 1.4; ctx.stroke();

          ctx.fillStyle = pal.errText;
          ctx.font = 'bold 9px system-ui,Arial,sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('ε', errX, errY);
          ctx.restore();
        }
      });
    });

    // ── 3. Second-order factors ──────────────────────────────────────────────
    if (modelType === 'second-order' && secondOrderFactors.length > 0) {
      const soY = 60;
      const soSpacing = canvasW / (secondOrderFactors.length + 1);

      secondOrderFactors.forEach((sof, idx) => {
        const sx = soSpacing * (idx + 1);

        // Paths to first-order factors
        sof.firstOrderFactors.forEach(fof => {
          const fp = factorPos[fof];
          if (!fp) return;
          const angle = Math.atan2(fp.y - soY, fp.x - sx);
          const [ex, ey] = ellipseEdge(fp.x, fp.y, FRX, FRY, angle + Math.PI);
          const startY = soY + SO_RY;

          ctx.save();
          ctx.strokeStyle = pal.soStroke ?? '#7c3aed';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(sx, startY); ctx.lineTo(ex, ey); ctx.stroke();
          arrowhead(ctx, ex, ey, Math.atan2(ey - startY, ex - sx), pal.soStroke ?? '#7c3aed', 9);
          const lv = sof.loadings?.find(l => l.factor === fof)?.loading;
          if (lv !== undefined) {
            drawValueLabel(ctx, lv.toFixed(3), (sx + ex) / 2, (startY + ey) / 2 - 8, pal.soStroke ?? '#7c3aed');
          }
          ctx.restore();
        });

        // Second-order ellipse
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.10)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        ctx.beginPath();
        ctx.ellipse(sx, soY, SO_RX, SO_RY, 0, 0, Math.PI * 2);
        ctx.fillStyle = pal.soFill ?? '#ede9fe';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = pal.soStroke ?? '#7c3aed';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = pal.soText ?? '#4c1d95';
        ctx.font = 'bold 11px system-ui,Arial,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const soName = sof.name.length > 12 ? sof.name.slice(0, 11) + '…' : sof.name;
        ctx.fillText(soName, sx, soY);
        ctx.restore();
      });
    }

    // ── 4. Indicator rectangles ──────────────────────────────────────────────
    allItems.forEach(item => {
      const ip = indicatorPos[item];
      if (!ip) return;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.06)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.fillStyle = pal.indFill;
      ctx.strokeStyle = pal.indStroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      (ctx as any).roundRect?.(ip.x - IND_W / 2, ip.y - IND_H / 2, IND_W, IND_H, 4)
        ?? ctx.rect(ip.x - IND_W / 2, ip.y - IND_H / 2, IND_W, IND_H);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = pal.indText;
      ctx.font = '9.5px system-ui,Arial,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const maxW = IND_W - 8;
      let txt = item;
      while (ctx.measureText(txt).width > maxW && txt.length > 1) txt = txt.slice(0, -1);
      if (txt !== item) txt = txt.slice(0, -1) + '…';
      ctx.fillText(txt, ip.x, ip.y);
      ctx.restore();
    });

    // ── 5. Factor ellipses ───────────────────────────────────────────────────
    factors.forEach(factor => {
      const fp = factorPos[factor];
      if (!fp) return;
      const displayName = latentLabels[factor] || factor;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      ctx.beginPath();
      ctx.ellipse(fp.x, fp.y, FRX, FRY, 0, 0, Math.PI * 2);
      ctx.fillStyle = pal.factorFill;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = pal.factorStroke;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = pal.factorText;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const words = displayName.split(' ');
      if (words.length > 1 && ctx.measureText(displayName).width > FRX * 1.7) {
        const half = Math.ceil(words.length / 2);
        const line1 = words.slice(0, half).join(' ');
        const line2 = words.slice(half).join(' ');
        ctx.font = 'bold 10px system-ui,Arial,sans-serif';
        ctx.fillText(line1, fp.x, fp.y - 7);
        ctx.fillText(line2, fp.x, fp.y + 7);
      } else {
        ctx.font = 'bold 11px system-ui,Arial,sans-serif';
        let name = displayName;
        while (ctx.measureText(name).width > FRX * 1.8 && name.length > 1) name = name.slice(0, -1);
        if (name !== displayName) name = name.slice(0, -1) + '…';
        ctx.fillText(name, fp.x, fp.y);
      }
      ctx.restore();
    });

    // ── 6. Legend ────────────────────────────────────────────────────────────
    ctx.save();
    const lx = 12, ly = canvasH - 56;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    (ctx as any).roundRect?.(lx, ly, 360, 44, 5) ?? ctx.rect(lx, ly, 360, 44);
    ctx.fill(); ctx.stroke();
    ctx.font = '8.5px system-ui,Arial,sans-serif'; ctx.fillStyle = '#64748b';
    ctx.textBaseline = 'middle';
    ctx.fillText('* p<.05  ** p<.01  *** p<.001', lx + 8, ly + 12);
    ctx.fillText('Double-click to rename latent  |  Drag to reposition', lx + 8, ly + 30);
    ctx.restore();

    ctx.restore();
  }, [factorPos, indicatorPos, factorStructure, factorCorrelations, factorLoadings,
      secondOrderFactors, modelType, showLoadings, showErrors, zoom, pan,
      canvasW, canvasH, factors, allItems, loadingMap, pal,
      latentLabels, groupName, invarianceLevel]);

  useEffect(() => { draw(); }, [draw]);

  // ─── Mouse interactions ───────────────────────────────────────────────────

  const getCanvasPoint = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom - pan.x,
      y: (e.clientY - rect.top) / zoom - pan.y,
    };
  }, [zoom, pan]);

  const hitTestFactor = useCallback((x: number, y: number): string | null => {
    for (const [f, pos] of Object.entries(factorPos)) {
      const dx = x - pos.x, dy = y - pos.y;
      if ((dx / FRX) ** 2 + (dy / FRY) ** 2 <= 1.1) return f;
    }
    return null;
  }, [factorPos]);

  const hitTestIndicator = useCallback((x: number, y: number): string | null => {
    for (const [item, pos] of Object.entries(indicatorPos)) {
      if (Math.abs(x - pos.x) <= IND_W / 2 + 3 && Math.abs(y - pos.y) <= IND_H / 2 + 3) return item;
    }
    return null;
  }, [indicatorPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (locked) return;
    const p = getCanvasPoint(e);
    const factor = hitTestFactor(p.x, p.y);
    if (factor) {
      if (factorPos[factor]?.locked) return;
      dragRef.current = { type: 'factor', key: factor, ox: factorPos[factor].x, oy: factorPos[factor].y, mx: p.x, my: p.y };
      setIsDragging(true);
      return;
    }
    const item = hitTestIndicator(p.x, p.y);
    if (item) {
      dragRef.current = { type: 'indicator', key: item, ox: indicatorPos[item].x, oy: indicatorPos[item].y, mx: p.x, my: p.y };
      setIsDragging(true);
      return;
    }
    dragRef.current = { type: 'pan', key: '', ox: pan.x, oy: pan.y, mx: e.clientX, my: e.clientY };
    setIsDragging(true);
  }, [locked, getCanvasPoint, hitTestFactor, hitTestIndicator, factorPos, indicatorPos, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;

    if (d.type === 'pan') {
      setPan({ x: d.ox + (e.clientX - d.mx) / zoom, y: d.oy + (e.clientY - d.my) / zoom });
      return;
    }

    const p = getCanvasPoint(e);
    const dx = p.x - d.mx, dy = p.y - d.my;

    if (d.type === 'factor') {
      const newX = d.ox + dx, newY = d.oy + dy;
      const oldPos = factorPos[d.key];
      const deltaX = newX - oldPos.x, deltaY = newY - oldPos.y;
      const items = factorStructure[d.key] || [];
      setFactorPos(prev => ({ ...prev, [d.key]: { ...prev[d.key], x: newX, y: newY } }));
      setIndicatorPos(prev => {
        const next = { ...prev };
        items.forEach(item => {
          if (next[item]) next[item] = { ...next[item], x: next[item].x + deltaX, y: next[item].y + deltaY };
        });
        return next;
      });
    } else if (d.type === 'indicator') {
      setIndicatorPos(prev => ({ ...prev, [d.key]: { ...prev[d.key], x: d.ox + dx, y: d.oy + dy } }));
    }
  }, [getCanvasPoint, factorPos, indicatorPos, factorStructure, zoom]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current && (dragRef.current.type === 'factor' || dragRef.current.type === 'indicator')) {
      pushHistory(factorPos, indicatorPos);
    }
    dragRef.current = null;
    setIsDragging(false);
  }, [factorPos, indicatorPos, pushHistory]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (locked) return;
    const p = getCanvasPoint(e);
    const factor = hitTestFactor(p.x, p.y);
    if (factor) {
      setEditing({ key: factor });
      setEditValue(latentLabels[factor] || factor);
    }
  }, [locked, getCanvasPoint, hitTestFactor, latentLabels]);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const val = editValue.trim();
    if (val && onLabelChange) onLabelChange(editing.key, val);
    setEditing(null);
  }, [editing, editValue, onLabelChange]);

  const optimizeLayout = useCallback(() => {
    const { factorPos: fp, indicatorPos: ip } = computeCFAPositions(
      factorStructure, modelType, canvasW, canvasH
    );
    setFactorPos(fp);
    setIndicatorPos(ip);
    setPan({ x: 0, y: 0 });
    pushHistory(fp, ip);
  }, [factorStructure, modelType, canvasW, canvasH, pushHistory]);

  // ─── Export ───────────────────────────────────────────────────────────────

  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `cfa-diagram${groupName ? `-${groupName}` : ''}.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
  }, [groupName]);

  const exportSVG = useCallback(() => {
    const mkArrow = (x: number, y: number, angle: number, color: string, sz = 8) => {
      const p1 = [x - sz * Math.cos(angle - 0.38), y - sz * Math.sin(angle - 0.38)];
      const p2 = [x - sz * Math.cos(angle + 0.38), y - sz * Math.sin(angle + 0.38)];
      return `<polygon points="${x},${y} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}" fill="${color}"/>`;
    };

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" style="background:#fafafa">`;
    svg += `<defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="${pal.gridColor}" stroke-width="0.5"/></pattern></defs>`;
    svg += `<rect width="${canvasW}" height="${canvasH}" fill="url(#g)"/>`;

    // Factor correlations — double-headed arcs
    factorCorrelations.forEach(fc => {
      const p1 = factorPos[fc.factor1], p2 = factorPos[fc.factor2];
      if (!p1 || !p2) return;
      const midX = (p1.x + p2.x) / 2;
      const arcLift = Math.abs(p2.x - p1.x) * 0.35 + 40;
      const cpY = Math.min(p1.y, p2.y) - arcLift;
      const a1 = Math.atan2(cpY - p1.y, midX - p1.x);
      const a2 = Math.atan2(cpY - p2.y, midX - p2.x);
      const [sx, sy] = ellipseEdge(p1.x, p1.y, FRX, FRY, a1);
      const [ex, ey] = ellipseEdge(p2.x, p2.y, FRX, FRY, a2);
      svg += `<path d="M${sx.toFixed(1)},${sy.toFixed(1)} Q${midX},${cpY} ${ex.toFixed(1)},${ey.toFixed(1)}" stroke="${pal.corrColor}" stroke-width="1.8" fill="none"/>`;
      const t = 0.05;
      const q1x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * midX + t * t * ex;
      const q1y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * cpY + t * t * ey;
      const q2t = 1 - t;
      const q2x = (1 - q2t) ** 2 * sx + 2 * (1 - q2t) * q2t * midX + q2t * q2t * ex;
      const q2y = (1 - q2t) ** 2 * sy + 2 * (1 - q2t) * q2t * cpY + q2t * q2t * ey;
      svg += mkArrow(sx, sy, Math.atan2(sy - q1y, sx - q1x), pal.corrColor, 9);
      svg += mkArrow(ex, ey, Math.atan2(ey - q2y, ex - q2x), pal.corrColor, 9);
      svg += `<text x="${midX.toFixed(1)}" y="${(cpY + 6).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui" font-size="9" fill="${pal.corrColor}">φ=${fc.correlation.toFixed(3)}${pStar(fc.pvalue)}</text>`;
    });

    // Measurement paths
    factors.forEach(factor => {
      const fp = factorPos[factor];
      if (!fp) return;
      (factorStructure[factor] || []).forEach(item => {
        const ip = indicatorPos[item];
        if (!ip) return;
        const angle = Math.atan2(ip.y - fp.y, ip.x - fp.x);
        const [sx, sy] = ellipseEdge(fp.x, fp.y, FRX, FRY, angle);
        const [ex, ey] = rectEdge(ip.x, ip.y, angle + Math.PI);
        svg += `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${pal.arrowColor}" stroke-width="1.8"/>`;
        svg += mkArrow(ex, ey, angle, pal.arrowColor, 8);
        const fl = loadingMap.get(`${factor}::${item}`);
        if (fl) {
          const mx = (sx + ex) / 2 - Math.sin(angle) * 14;
          const my = (sy + ey) / 2 + Math.cos(angle) * 14;
          svg += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui" font-size="9" fill="${pal.arrowColor}">${fl.std_loading.toFixed(3)}${pStar(fl.pvalue)}</text>`;
        }
        // Error circle
        const errX = ip.x + IND_W / 2 + ERR_R + 8;
        const errY = ip.y;
        const errA = Math.atan2(ip.y - errY, ip.x - errX);
        const [eex, eey] = rectEdge(ip.x, ip.y, errA + Math.PI);
        const esx = errX + Math.cos(errA) * ERR_R;
        const esy = errY + Math.sin(errA) * ERR_R;
        svg += `<line x1="${esx.toFixed(1)}" y1="${esy.toFixed(1)}" x2="${eex.toFixed(1)}" y2="${eey.toFixed(1)}" stroke="${pal.errStroke}" stroke-width="1.4"/>`;
        svg += mkArrow(eex, eey, errA, pal.errStroke, 7);
        svg += `<circle cx="${errX.toFixed(1)}" cy="${errY.toFixed(1)}" r="${ERR_R}" fill="${pal.errFill}" stroke="${pal.errStroke}" stroke-width="1.4"/>`;
        svg += `<text x="${errX.toFixed(1)}" y="${errY.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui" font-size="9" font-weight="bold" fill="${pal.errText}">ε</text>`;
      });
    });

    // Indicator rectangles
    allItems.forEach(item => {
      const ip = indicatorPos[item];
      if (!ip) return;
      svg += `<rect x="${(ip.x - IND_W / 2).toFixed(1)}" y="${(ip.y - IND_H / 2).toFixed(1)}" width="${IND_W}" height="${IND_H}" rx="4" fill="${pal.indFill}" stroke="${pal.indStroke}" stroke-width="1.5"/>`;
      svg += `<text x="${ip.x.toFixed(1)}" y="${ip.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui" font-size="9.5" fill="${pal.indText}">${item}</text>`;
    });

    // Factor ellipses
    factors.forEach(factor => {
      const fp = factorPos[factor];
      if (!fp) return;
      const name = latentLabels[factor] || factor;
      svg += `<ellipse cx="${fp.x.toFixed(1)}" cy="${fp.y.toFixed(1)}" rx="${FRX}" ry="${FRY}" fill="${pal.factorFill}" stroke="${pal.factorStroke}" stroke-width="2.5"/>`;
      svg += `<text x="${fp.x.toFixed(1)}" y="${fp.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui" font-weight="bold" font-size="11" fill="${pal.factorText}">${name}</text>`;
    });

    svg += '</svg>';
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `cfa-diagram${groupName ? `-${groupName}` : ''}.svg`;
    link.href = url; link.click();
    URL.revokeObjectURL(url);
  }, [factors, factorStructure, factorCorrelations, factorPos, indicatorPos, allItems,
      canvasW, canvasH, pal, latentLabels, loadingMap, groupName]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (factors.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-wrap">
        <div className="flex items-center gap-1.5 mr-2">
          <Layers className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-sm text-gray-800">CFA Path Diagram</span>
          {groupName && (
            <span className="ml-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
              {groupName}
            </span>
          )}
          {invarianceLevel && (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium"
              style={{ backgroundColor: INVARIANCE_BADGE[invarianceLevel].bg, color: INVARIANCE_BADGE[invarianceLevel].color }}>
              {INVARIANCE_BADGE[invarianceLevel].label}
            </span>
          )}
        </div>

        <button onClick={undo} disabled={histIdx <= 0}
          className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-40 transition" title="Undo">
          <RotateCcw className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <button onClick={redo} disabled={histIdx >= history.length - 1}
          className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-40 transition" title="Redo">
          <RotateCw className="w-3.5 h-3.5 text-gray-600" />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}
          className="p-1.5 hover:bg-gray-200 rounded transition" title="Zoom Out">
          <ZoomOut className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <span className="text-xs font-medium text-gray-600 min-w-[36px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.1))}
          className="p-1.5 hover:bg-gray-200 rounded transition" title="Zoom In">
          <ZoomIn className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="p-1.5 hover:bg-gray-200 rounded transition" title="Reset View">
          <Maximize2 className="w-3.5 h-3.5 text-gray-600" />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <button onClick={optimizeLayout}
          className="flex items-center gap-1 px-2 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition font-medium">
          <RefreshCw className="w-3.5 h-3.5" />
          Auto-Layout
        </button>

        <button onClick={() => setLocked(l => !l)}
          className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg transition font-medium ${
            locked ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
          }`}>
          {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          {locked ? 'Locked' : 'Lock'}
        </button>

        <select value={currentTheme} onChange={e => setCurrentTheme(e.target.value as any)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700">
          <option value="amos">AMOS Style</option>
          <option value="smartpls">SmartPLS Style</option>
          <option value="journal">Journal B&W</option>
        </select>

        <div className="flex items-center gap-3 text-xs text-gray-600">
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input type="checkbox" checked={showLoadings}
              onChange={e => setShowLoadings(e.target.checked)} className="rounded text-blue-600" />
            Loadings
          </label>
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input type="checkbox" checked={showErrors}
              onChange={e => setShowErrors(e.target.checked)} className="rounded text-blue-600" />
            Residuals (ε)
          </label>
        </div>

        <div className="ml-auto flex gap-2">
          <button onClick={exportSVG}
            className="flex items-center gap-1 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition font-medium">
            <Download className="w-3.5 h-3.5" />SVG
          </button>
          <button onClick={exportPNG}
            className="flex items-center gap-1 px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium">
            <Download className="w-3.5 h-3.5" />PNG
          </button>
        </div>
      </div>

      {/* Inline rename editor */}
      {editing && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 flex items-center gap-3 text-sm">
          <Pencil className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="text-blue-800 font-medium">
            Rename: <code className="bg-blue-100 px-1 rounded">{editing.key}</code>
          </span>
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
            className="flex-1 max-w-xs border border-blue-300 rounded-lg px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter new name..."
          />
          <button onClick={commitEdit}
            className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition">
            Apply
          </button>
          <button onClick={() => setEditing(null)}
            className="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      )}

      {/* Canvas */}
      <div className="overflow-auto bg-gray-50" style={{ maxHeight: 680 }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', cursor: locked ? 'default' : isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        />
      </div>

      {/* Status bar */}
      <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span>
          {factors.length} factor{factors.length !== 1 ? 's' : ''} &middot;&nbsp;
          {allItems.length} indicators &middot;&nbsp;
          {factorCorrelations.length} correlation{factorCorrelations.length !== 1 ? 's' : ''}
        </span>
        <span className="text-gray-400">
          Double-click ellipse to rename &nbsp;|&nbsp; Drag to reposition &nbsp;|&nbsp; Drag background to pan
        </span>
      </div>
    </div>
  );
}
