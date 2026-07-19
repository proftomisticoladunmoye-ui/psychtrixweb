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

export interface DiagramFitIndices {
  chisq?: number;
  df?: number;
  cfi?: number;
  tli?: number;
  rmsea?: number;
  srmr?: number;
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
  /** Rendered in the Model Fit Summary box (top right), AMOS style. */
  fitIndices?: DiagramFitIndices;
  /** Footer note, e.g. "Maximum Likelihood" — defaults to the app's estimator. */
  estimationLabel?: string;
  /** Diagram title; defaults to "CFA Model — N-Factor Model". */
  title?: string;
}

interface NodePos { x: number; y: number; locked?: boolean }
type HistoryEntry = { factorPos: Record<string, NodePos>; indicatorPos: Record<string, NodePos> };

// ─── Constants ────────────────────────────────────────────────────────────────
// Classic AMOS textbook layout: error circles far left → indicator rectangles
// in one vertical column → factor ellipses to their right → covariance arcs
// bowing out on the far right, fit summary box top-right.

const FRX = 78, FRY = 40;          // factor ellipse radii
const IND_W = 112, IND_H = 34;     // indicator rectangle size
const ERR_R = 15;                   // error circle radius
const SO_RX = 66, SO_RY = 34;      // second-order ellipse radii
const IND_GAP = 50;                 // vertical gap between indicator centers
const GROUP_GAP = 44;               // extra gap between factor indicator groups
const ERR_X = 64;                   // error-circle column x
const IND_X = 220;                  // indicator column x (center)
const FACT_X = 560;                 // factor ellipse column x (center)
const TOP_MARGIN = 88;              // room for the title
const BOTTOM_MARGIN = 70;           // room for the estimation footer

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
  _modelType: string,
  _canvasW: number,
  _canvasH: number,
): { factorPos: Record<string, NodePos>; indicatorPos: Record<string, NodePos> } {
  const factors = Object.keys(factorStructure);
  const n = factors.length;
  if (n === 0) return { factorPos: {}, indicatorPos: {} };

  // Vertical AMOS layout: one column of indicators grouped by factor; each
  // factor ellipse sits to the RIGHT, vertically centered on its group.
  const factorPos: Record<string, NodePos> = {};
  const indicatorPos: Record<string, NodePos> = {};

  let y = TOP_MARGIN + IND_H / 2;
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
  fitIndices,
  estimationLabel = 'Unweighted Least Squares (ULS)',
  title,
}: AdvancedPathDiagramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const factors = useMemo(() => Object.keys(factorStructure), [factorStructure]);
  const allItems = useMemo(() => factors.flatMap(f => factorStructure[f] || []), [factors, factorStructure]);

  // Dynamic canvas size for the vertical AMOS layout: height grows with the
  // total number of indicators; width leaves room for covariance arcs on the
  // right plus the fit summary box.
  const canvasW = useMemo(() => {
    const arcMax = 56 + 52 * Math.max(factors.length - 1, 1);
    const soExtra = modelType === 'second-order' ? 320 : 0;
    return Math.max(960, FACT_X + FRX + arcMax + soExtra + 280);
  }, [factors, modelType]);
  const canvasH = useMemo(() => {
    const totalItems = allItems.length;
    return Math.max(
      520,
      TOP_MARGIN + totalItems * IND_GAP + Math.max(factors.length - 1, 0) * GROUP_GAP + BOTTOM_MARGIN
    );
  }, [allItems, factors]);

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

    // Plain white background — publication/AMOS convention (no grid).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-pan.x, -pan.y, canvasW + Math.abs(pan.x) * 2, canvasH + Math.abs(pan.y) * 2);

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

    // ── 1. Double-headed factor covariance arcs (bowing RIGHT, AMOS style) ───
    // Arc depth grows with the vertical distance between the pair so that
    // adjacent-factor arcs stay tight and distant pairs bow further out.
    const factorOrder = new Map(factors.map((f, i) => [f, i]));
    factorCorrelations.forEach(fc => {
      const p1 = factorPos[fc.factor1], p2 = factorPos[fc.factor2];
      if (!p1 || !p2) return;

      ctx.save();
      ctx.strokeStyle = pal.corrColor;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([]);

      const span = Math.abs((factorOrder.get(fc.factor1) ?? 0) - (factorOrder.get(fc.factor2) ?? 0));
      const bow = 52 + 52 * Math.max(span - 1, 0) + 18 * Math.min(span, 1);
      const cpX = Math.max(p1.x, p2.x) + FRX + bow;
      const midY = (p1.y + p2.y) / 2;

      // Anchor on the right edge of each ellipse, angled toward the control point
      const a1 = Math.atan2(midY - p1.y, cpX - p1.x);
      const a2 = Math.atan2(midY - p2.y, cpX - p2.x);
      const [sx, sy] = ellipseEdge(p1.x, p1.y, FRX, FRY, a1);
      const [ex, ey] = ellipseEdge(p2.x, p2.y, FRX, FRY, a2);

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cpX, midY, ex, ey);
      ctx.stroke();

      // Double arrowheads pointing INTO each ellipse
      const t = 0.06;
      const q1x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cpX + t * t * ex;
      const q1y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * midY + t * t * ey;
      const s2 = 1 - t;
      const q2x = (1 - s2) * (1 - s2) * sx + 2 * (1 - s2) * s2 * cpX + s2 * s2 * ex;
      const q2y = (1 - s2) * (1 - s2) * sy + 2 * (1 - s2) * s2 * midY + s2 * s2 * ey;

      arrowhead(ctx, sx, sy, Math.atan2(sy - q1y, sx - q1x), pal.corrColor, 9);
      arrowhead(ctx, ex, ey, Math.atan2(ey - q2y, ex - q2x), pal.corrColor, 9);

      // Correlation label at the arc's outermost point (curve midpoint)
      const labX = 0.25 * sx + 0.5 * cpX + 0.25 * ex + 16;
      const labY = 0.25 * sy + 0.5 * midY + 0.25 * ey;
      drawValueLabel(ctx, fc.correlation.toFixed(2).replace(/^(-?)0\./, '$1.') + pStar(fc.pvalue), labX, labY, pal.corrColor);

      ctx.restore();
    });

    // ── 2. Measurement paths (factor → indicator, pointing LEFT) ─────────────
    const itemIndex = new Map(allItems.map((it, i) => [it, i]));
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
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        arrowhead(ctx, ex, ey, angle, pal.arrowColor, 8);

        if (showLoadings) {
          const fl = loadingMap.get(`${factor}::${item}`);
          if (fl !== undefined) {
            // AMOS convention: coefficient near the indicator end, above the arrow
            const t = 0.30;
            const mx = ex + (sx - ex) * t;
            const my = ey + (sy - ey) * t - 12;
            const sig = fl.pvalue === undefined || fl.pvalue < 0.05;
            const lcolor = sig ? pal.coefColor : '#9ca3af';
            drawValueLabel(ctx, fl.std_loading.toFixed(2).replace(/^(-?)0\./, '$1.') + pStar(fl.pvalue), mx, my, lcolor);
          }
        }
        ctx.restore();

        // Error term: circle on the FAR LEFT, arrow pointing right into the item
        if (showErrors) {
          const errX = ERR_X;
          const errY = ip.y;
          const esx = errX + ERR_R;
          const eex = ip.x - IND_W / 2;

          ctx.save();
          ctx.strokeStyle = pal.errStroke;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(esx, errY); ctx.lineTo(eex, errY); ctx.stroke();
          arrowhead(ctx, eex, errY, 0, pal.errStroke, 7);

          ctx.beginPath(); ctx.arc(errX, errY, ERR_R, 0, Math.PI * 2);
          ctx.fillStyle = pal.errFill; ctx.fill();
          ctx.strokeStyle = pal.errStroke; ctx.lineWidth = 1.4; ctx.stroke();

          ctx.fillStyle = pal.errText;
          ctx.font = 'bold 9.5px system-ui,Arial,sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(`e${(itemIndex.get(item) ?? 0) + 1}`, errX, errY);
          ctx.restore();
        }
      });
    });

    // ── 3. Second-order factors (further right, arrows pointing left) ────────
    if (modelType === 'second-order' && secondOrderFactors.length > 0) {
      const soX = FACT_X + FRX + 240;

      secondOrderFactors.forEach(sof => {
        const memberYs = sof.firstOrderFactors
          .map(f => factorPos[f]?.y)
          .filter((v): v is number => v !== undefined);
        const soY = memberYs.length
          ? memberYs.reduce((s, v) => s + v, 0) / memberYs.length
          : canvasH / 2;

        // Paths into first-order factors
        sof.firstOrderFactors.forEach(fof => {
          const fp = factorPos[fof];
          if (!fp) return;
          const angle = Math.atan2(fp.y - soY, fp.x - soX);
          const [ssx, ssy] = ellipseEdge(soX, soY, SO_RX, SO_RY, angle);
          const [ex, ey] = ellipseEdge(fp.x, fp.y, FRX, FRY, angle + Math.PI);

          ctx.save();
          ctx.strokeStyle = pal.soStroke ?? '#7c3aed';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(ssx, ssy); ctx.lineTo(ex, ey); ctx.stroke();
          arrowhead(ctx, ex, ey, angle, pal.soStroke ?? '#7c3aed', 9);
          const lv = sof.loadings?.find(l => l.factor === fof)?.loading;
          if (lv !== undefined) {
            drawValueLabel(ctx, lv.toFixed(2).replace(/^(-?)0\./, '$1.'), (ssx + ex) / 2, (ssy + ey) / 2 - 11, pal.soStroke ?? '#7c3aed');
          }
          ctx.restore();
        });

        // Second-order ellipse
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.10)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        ctx.beginPath();
        ctx.ellipse(soX, soY, SO_RX, SO_RY, 0, 0, Math.PI * 2);
        ctx.fillStyle = pal.soFill ?? '#ede9fe';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = pal.soStroke ?? '#7c3aed';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = pal.soText ?? '#4c1d95';
        ctx.font = 'bold 11px system-ui,Arial,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const soName = sof.name.length > 14 ? sof.name.slice(0, 13) + '…' : sof.name;
        ctx.fillText(soName, soX, soY);
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
      ctx.beginPath();
      ctx.ellipse(fp.x, fp.y, FRX, FRY, 0, 0, Math.PI * 2);
      ctx.fillStyle = pal.factorFill;
      ctx.fill();
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

    // ── 6. Title (top center) ────────────────────────────────────────────────
    ctx.save();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 19px system-ui,Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nWords = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
    const defaultTitle = `CFA Model — ${nWords[factors.length] ?? factors.length} Factor Model`;
    ctx.fillText(title || defaultTitle, canvasW / 2, 32);
    ctx.restore();

    // ── 7. Model Fit Summary box (top right, AMOS style) ─────────────────────
    if (fitIndices) {
      const rows: Array<[string, string]> = [];
      if (fitIndices.chisq !== undefined) rows.push(['Chi-square (χ²)', fitIndices.chisq.toFixed(2)]);
      if (fitIndices.df !== undefined) rows.push(['df', String(fitIndices.df)]);
      if (fitIndices.chisq !== undefined && fitIndices.df) rows.push(['χ²/df', (fitIndices.chisq / fitIndices.df).toFixed(2)]);
      if (fitIndices.cfi !== undefined) rows.push(['CFI', fitIndices.cfi.toFixed(2)]);
      if (fitIndices.tli !== undefined) rows.push(['TLI', fitIndices.tli.toFixed(2)]);
      if (fitIndices.rmsea !== undefined) rows.push(['RMSEA', fitIndices.rmsea.toFixed(3)]);
      if (fitIndices.srmr !== undefined) rows.push(['SRMR', fitIndices.srmr.toFixed(3)]);

      if (rows.length > 0) {
        const boxW = 218;
        const boxH = 30 + rows.length * 19;
        const bx = canvasW - boxW - 20;
        const by = 22;

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); // without this, the previous shape's path leaks into the box fill
        (ctx as any).roundRect?.(bx, by, boxW, boxH, 6) ?? ctx.rect(bx, by, boxW, boxH);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#111827';
        ctx.font = 'bold 12px system-ui,Arial,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Model Fit Summary', bx + boxW / 2, by + 15);

        ctx.font = '11px system-ui,Arial,sans-serif';
        rows.forEach(([k, v], i) => {
          const ry = by + 34 + i * 19;
          ctx.textAlign = 'left';
          ctx.fillText(k, bx + 12, ry);
          ctx.textAlign = 'center';
          ctx.fillText('=', bx + boxW - 62, ry);
          ctx.textAlign = 'right';
          ctx.fillText(v, bx + boxW - 12, ry);
        });
        ctx.restore();
      }
    }

    // ── 8. Estimation footer + significance legend ───────────────────────────
    ctx.save();
    ctx.fillStyle = '#374151';
    ctx.font = '12px system-ui,Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Estimation Method: ${estimationLabel}`, canvasW / 2, canvasH - 26);
    ctx.font = '8.5px system-ui,Arial,sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.textAlign = 'left';
    ctx.fillText('* p<.05  ** p<.01  *** p<.001   |   Double-click ellipse to rename  ·  Drag to reposition', 14, canvasH - 10);
    ctx.restore();

    ctx.restore();
  }, [factorPos, indicatorPos, factorStructure, factorCorrelations, factorLoadings,
      secondOrderFactors, modelType, showLoadings, showErrors, zoom, pan,
      canvasW, canvasH, factors, allItems, loadingMap, pal,
      latentLabels, groupName, invarianceLevel, fitIndices, estimationLabel, title]);

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
