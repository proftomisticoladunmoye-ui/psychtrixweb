import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Download, ZoomIn, ZoomOut, Maximize2, Layers, Pencil, Lock, Unlock, RotateCcw, RotateCw, RefreshCw } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PathCoefficient {
  from: string;
  to: string;
  coefficient: number;
  std_coefficient?: number;
  se?: number;
  pvalue?: number;
}

export interface FactorLoadingEntry {
  item: string;
  factor: string;
  std_loading: number;
  pvalue?: number;
}

export interface SEMPathDiagramProps {
  measurementModel: { [factor: string]: string[] };
  structuralModel: PathCoefficient[];
  mediators?: string[];
  showCoefficients?: boolean;
  showStandardized?: boolean;
  rSquared?: { [variable: string]: number };
  factorLoadings?: FactorLoadingEntry[];
  factorCorrelations?: { [pair: string]: number };
  latentLabels?: { [key: string]: string };      // editable latent names
  indicatorLabels?: { [key: string]: string };   // editable indicator names
  onLabelChange?: (type: 'latent' | 'indicator', key: string, value: string) => void;
  theme?: 'amos' | 'smartpls' | 'journal';
}

interface NodePos { x: number; y: number; locked?: boolean }

type HistoryEntry = { latentPos: Record<string, NodePos>; indicatorPos: Record<string, NodePos> };

// ─── Constants ───────────────────────────────────────────────────────────────

const LATENT_RX = 72, LATENT_RY = 38;
const IND_W = 80, IND_H = 36;
const ERROR_R = 16;
const DIST_R = 18;
const MIN_IND_GAP = 58;
const INDICATOR_SIDE_OFFSET = 210; // px from factor center to indicator center

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pStar(p?: number) {
  if (p === undefined) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

function ellipseEdge(cx: number, cy: number, angle: number): [number, number] {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const denom = Math.sqrt((cos / LATENT_RX) ** 2 + (sin / LATENT_RY) ** 2);
  return denom > 0 ? [cx + cos / denom, cy + sin / denom] : [cx, cy];
}

function rectEdge(cx: number, cy: number, angle: number): [number, number] {
  const hw = IND_W / 2, hh = IND_H / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  if (Math.abs(cos) < 1e-9) return [cx, cy + (sin > 0 ? hh : -hh)];
  if (Math.abs(sin) < 1e-9) return [cx + (cos > 0 ? hw : -hw), cy];
  const tx = hw / Math.abs(cos), ty = hh / Math.abs(sin);
  const t = Math.min(tx, ty);
  return [cx + cos * t, cy + sin * t];
}

function arrowhead(
  ctx: CanvasRenderingContext2D, x: number, y: number, angle: number,
  color: string, size = 10
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - 0.35), y - size * Math.sin(angle - 0.35));
  ctx.lineTo(x - size * Math.cos(angle + 0.35), y - size * Math.sin(angle + 0.35));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawValueLabel(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string
) {
  ctx.save();
  ctx.font = 'bold 10px system-ui,Arial,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  (ctx as any).roundRect?.(x - w / 2, y - 8, w, 16, 3) ?? ctx.rect(x - w / 2, y - 8, w, 16);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Topological layers: sources left, sinks right */
function computeLayers(
  factors: string[],
  paths: PathCoefficient[]
): string[][] {
  if (factors.length === 0) return [];
  const inDeg = new Map<string, number>(factors.map(f => [f, 0]));
  paths.forEach(p => { if (inDeg.has(p.to)) inDeg.set(p.to, (inDeg.get(p.to) || 0) + 1); });

  const placed = new Set<string>();
  const layers: string[][] = [];
  let frontier = factors.filter(f => (inDeg.get(f) || 0) === 0);
  if (frontier.length === 0) frontier = [factors[0]]; // cycle fallback

  while (frontier.length) {
    layers.push([...frontier]);
    frontier.forEach(f => placed.add(f));
    const next = factors.filter(f => {
      if (placed.has(f)) return false;
      return paths.filter(p => p.to === f).every(p => placed.has(p.from));
    });
    if (next.length === 0) {
      // Add any remaining unplaced to last layer
      factors.filter(f => !placed.has(f)).forEach(f => {
        placed.add(f); if (!layers[layers.length - 1]) layers.push([]);
        layers[layers.length - 1].push(f);
      });
      break;
    }
    frontier = next;
  }
  return layers;
}

/** Compute initial positions with zero-overlap guarantee */
function computeInitialPositions(
  measurementModel: Record<string, string[]>,
  structuralModel: PathCoefficient[],
  canvasW: number,
  canvasH: number
): { latentPos: Record<string, NodePos>; indicatorPos: Record<string, NodePos> } {
  const factors = Object.keys(measurementModel);
  const layers = computeLayers(factors, structuralModel);
  const nLayers = Math.max(layers.length, 1);

  const marginX = 230, marginY = 100;
  const usableW = canvasW - marginX * 2;
  const usableH = canvasH - marginY * 2;

  const latentPos: Record<string, NodePos> = {};
  layers.forEach((layer, li) => {
    const x = nLayers === 1 ? canvasW / 2 : marginX + (usableW / Math.max(1, nLayers - 1)) * li;
    const nNodes = layer.length;
    layer.forEach((id, ni) => {
      const y = nNodes === 1 ? canvasH / 2 : marginY + (usableH / Math.max(1, nNodes - 1)) * ni;
      latentPos[id] = { x, y };
    });
  });

  // Place indicators: left side for exogenous (first layer), right side for endogenous (last layer)
  // Middle layers: right side by default
  const indicatorPos: Record<string, NodePos> = {};
  const firstLayerSet = new Set(layers[0] || []);
  const lastLayerSet = new Set(layers[layers.length - 1] || []);

  factors.forEach(factor => {
    const fp = latentPos[factor];
    if (!fp) return;
    const items = measurementModel[factor] || [];
    const nItems = items.length;
    const totalH = Math.max(nItems - 1, 0) * MIN_IND_GAP;
    const startY = fp.y - totalH / 2;

    // Indicators go left of first-layer (pure exogenous), right of others
    const side = firstLayerSet.has(factor) && !lastLayerSet.has(factor) ? -1 : 1;
    const indX = fp.x + side * INDICATOR_SIDE_OFFSET;

    items.forEach((item, k) => {
      indicatorPos[item] = { x: indX, y: startY + k * MIN_IND_GAP };
    });
  });

  return { latentPos, indicatorPos };
}

// ─── Theme palettes ───────────────────────────────────────────────────────────

const THEMES = {
  amos: {
    latentFill: (type: string) => type === 'exogenous' ? '#dbeafe' : type === 'mediator' ? '#fef3c7' : '#dcfce7',
    latentStroke: (type: string) => type === 'exogenous' ? '#2563eb' : type === 'mediator' ? '#d97706' : '#059669',
    latentText: (type: string) => type === 'exogenous' ? '#1e40af' : type === 'mediator' ? '#92400e' : '#065f46',
    indFill: '#f9fafb', indStroke: '#6b7280', indText: '#111827',
    errorFill: '#fef3c7', errorStroke: '#d97706', errorText: '#92400e',
    pathBlue: '#2563eb', pathGreen: '#059669', pathOrange: '#d97706', pathGray: '#9ca3af',
    loadingColor: '#2563eb', covarColor: '#64748b',
  },
  smartpls: {
    latentFill: (type: string) => type === 'exogenous' ? '#eff6ff' : type === 'mediator' ? '#fff7ed' : '#f0fdf4',
    latentStroke: (type: string) => type === 'exogenous' ? '#3b82f6' : type === 'mediator' ? '#f97316' : '#22c55e',
    latentText: (type: string) => type === 'exogenous' ? '#1d4ed8' : type === 'mediator' ? '#c2410c' : '#15803d',
    indFill: '#ffffff', indStroke: '#94a3b8', indText: '#1e293b',
    errorFill: '#fff7ed', errorStroke: '#f97316', errorText: '#c2410c',
    pathBlue: '#3b82f6', pathGreen: '#22c55e', pathOrange: '#f97316', pathGray: '#94a3b8',
    loadingColor: '#3b82f6', covarColor: '#64748b',
  },
  journal: {
    latentFill: (_: string) => '#f8f9fa',
    latentStroke: (_: string) => '#343a40',
    latentText: (_: string) => '#212529',
    indFill: '#ffffff', indStroke: '#343a40', indText: '#212529',
    errorFill: '#f8f9fa', errorStroke: '#6c757d', errorText: '#343a40',
    pathBlue: '#343a40', pathGreen: '#343a40', pathOrange: '#343a40', pathGray: '#adb5bd',
    loadingColor: '#495057', covarColor: '#6c757d',
  },
};

// ─── Main Component ──────────────────────────────────────────────────────────

export function SEMPathDiagram({
  measurementModel,
  structuralModel,
  mediators = [],
  showCoefficients = true,
  showStandardized = true,
  rSquared = {},
  factorLoadings = [],
  factorCorrelations = {},
  latentLabels = {},
  indicatorLabels = {},
  onLabelChange,
  theme = 'amos',
}: SEMPathDiagramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showLoadings, setShowLoadings] = useState(true);
  const [showErrors, setShowErrors] = useState(true);
  const [showRSquared, setShowRSquared] = useState(true);
  const [currentTheme, setCurrentTheme] = useState<'amos' | 'smartpls' | 'journal'>(theme);

  // Sync theme prop → internal state when parent changes it
  useEffect(() => { setCurrentTheme(theme); }, [theme]);
  const [locked, setLocked] = useState(false);

  // Canvas size: dynamic
  const canvasW = useMemo(() => {
    const factors = Object.keys(measurementModel);
    const layers = computeLayers(factors, structuralModel);
    return Math.max(1200, layers.length * 380);
  }, [measurementModel, structuralModel]);

  const canvasH = useMemo(() => {
    const maxInLayer = computeLayers(Object.keys(measurementModel), structuralModel)
      .reduce((m, l) => Math.max(m, l.length), 1);
    const maxInds = Math.max(...Object.values(measurementModel).map(v => v.length), 1);
    return Math.max(700, Math.max(maxInLayer, maxInds) * 90 + 300);
  }, [measurementModel, structuralModel]);

  // Node positions (draggable)
  const [latentPos, setLatentPos] = useState<Record<string, NodePos>>({});
  const [indicatorPos, setIndicatorPos] = useState<Record<string, NodePos>>({});

  // History for undo/redo
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [histIdx, setHistIdx] = useState(-1);

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ type: 'latent' | 'indicator' | 'pan'; key: string; ox: number; oy: number; mx: number; my: number } | null>(null);

  // Rename editing
  const [editing, setEditing] = useState<{ type: 'latent' | 'indicator'; key: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Loading map
  const loadingMap = useMemo(() => {
    const m = new Map<string, { value: number; pvalue?: number }>();
    factorLoadings.forEach(fl => m.set(fl.item, { value: fl.std_loading, pvalue: fl.pvalue }));
    return m;
  }, [factorLoadings]);

  const pal = THEMES[currentTheme];

  // Initialize positions when model changes
  useEffect(() => {
    const { latentPos: lp, indicatorPos: ip } = computeInitialPositions(
      measurementModel, structuralModel, canvasW, canvasH
    );
    setLatentPos(lp);
    setIndicatorPos(ip);
    setHistory([{ latentPos: JSON.parse(JSON.stringify(lp)), indicatorPos: JSON.parse(JSON.stringify(ip)) }]);
    setHistIdx(0);
  }, [measurementModel, structuralModel]);

  // Push history snapshot — use functional setHistIdx to avoid stale closure
  const pushHistory = useCallback((lp: Record<string, NodePos>, ip: Record<string, NodePos>) => {
    const entry: HistoryEntry = {
      latentPos: JSON.parse(JSON.stringify(lp)),
      indicatorPos: JSON.parse(JSON.stringify(ip)),
    };
    setHistIdx(prevIdx => {
      setHistory(prevHist => {
        const next = prevHist.slice(0, prevIdx + 1);
        next.push(entry);
        return next.slice(-50);
      });
      return Math.min(prevIdx + 1, 49);
    });
  }, []);

  const undo = useCallback(() => {
    if (histIdx <= 0) return;
    const entry = history[histIdx - 1];
    setLatentPos(JSON.parse(JSON.stringify(entry.latentPos)));
    setIndicatorPos(JSON.parse(JSON.stringify(entry.indicatorPos)));
    setHistIdx(histIdx - 1);
  }, [history, histIdx]);

  const redo = useCallback(() => {
    if (histIdx >= history.length - 1) return;
    const entry = history[histIdx + 1];
    setLatentPos(JSON.parse(JSON.stringify(entry.latentPos)));
    setIndicatorPos(JSON.parse(JSON.stringify(entry.indicatorPos)));
    setHistIdx(histIdx + 1);
  }, [history, histIdx]);

  // Determine factor type
  const factorType = useCallback((factor: string): 'exogenous' | 'mediator' | 'endogenous' => {
    if (mediators.includes(factor)) return 'mediator';
    const isEndogenous = structuralModel.some(p => p.to === factor);
    return isEndogenous ? 'endogenous' : 'exogenous';
  }, [mediators, structuralModel]);

  // ─── Draw ──────────────────────────────────────────────────────────────────

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
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;
    const gridSize = 40;
    for (let gx = 0; gx < canvasW; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvasH); ctx.stroke();
    }
    for (let gy = 0; gy < canvasH; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvasW, gy); ctx.stroke();
    }

    const factors = Object.keys(measurementModel);

    // ── 1. Exogenous covariance arcs ─────────────────────────────────────────
    const exogenous = factors.filter(f => factorType(f) === 'exogenous');
    for (let i = 0; i < exogenous.length; i++) {
      for (let j = i + 1; j < exogenous.length; j++) {
        const f1 = exogenous[i], f2 = exogenous[j];
        const p1 = latentPos[f1], p2 = latentPos[f2];
        if (!p1 || !p2) continue;

        ctx.save();
        ctx.strokeStyle = pal.covarColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);

        const cpx = Math.min(p1.x, p2.x) - 70;
        const cpy = (p1.y + p2.y) / 2;

        ctx.beginPath();
        ctx.moveTo(p1.x - LATENT_RX + 5, p1.y);
        ctx.quadraticCurveTo(cpx, cpy, p2.x - LATENT_RX + 5, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        arrowhead(ctx, p1.x - LATENT_RX + 5, p1.y, Math.atan2(p1.y - cpy, p1.x - LATENT_RX + 5 - cpx), pal.covarColor, 9);
        arrowhead(ctx, p2.x - LATENT_RX + 5, p2.y, Math.atan2(p2.y - cpy, p2.x - LATENT_RX + 5 - cpx), pal.covarColor, 9);

        const pairKey = `${f1}_${f2}`;
        const phi = factorCorrelations[pairKey] ?? factorCorrelations[`${f2}_${f1}`];
        if (phi !== undefined) {
          drawValueLabel(ctx, `φ=${phi.toFixed(3)}`, cpx - 20, cpy, pal.covarColor);
        }
        ctx.restore();
      }
    }

    // ── 2. Structural paths ──────────────────────────────────────────────────
    structuralModel.forEach(path => {
      const fp = latentPos[path.from], tp = latentPos[path.to];
      if (!fp || !tp) return;

      const coef = showStandardized && path.std_coefficient !== undefined
        ? path.std_coefficient : path.coefficient;
      const absCoef = Math.abs(coef);
      const sig = path.pvalue !== undefined && path.pvalue < 0.05;

      let pathColor = pal.pathGray;
      if (sig) {
        if (absCoef >= 0.5) pathColor = pal.pathGreen;
        else if (absCoef >= 0.3) pathColor = pal.pathBlue;
        else pathColor = pal.pathOrange;
      }

      const angle = Math.atan2(tp.y - fp.y, tp.x - fp.x);
      const [sx, sy] = ellipseEdge(fp.x, fp.y, angle);
      const [ex, ey] = ellipseEdge(tp.x, tp.y, angle + Math.PI);

      // Check for reverse path — curve if so
      const hasReverse = structuralModel.some(q => q.from === path.to && q.to === path.from);
      const dist = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);

      ctx.save();
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = sig ? Math.max(2, absCoef * 5) : 1.5;
      ctx.setLineDash([]);

      if (hasReverse || dist < 120) {
        const perp = angle + Math.PI / 2;
        const bend = 60;
        const cpx2 = (sx + ex) / 2 + Math.cos(perp) * bend;
        const cpy2 = (sy + ey) / 2 + Math.sin(perp) * bend;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cpx2, cpy2, ex, ey);
        ctx.stroke();
        const t = 0.97;
        const qx = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cpx2 + t * t * ex;
        const qy = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cpy2 + t * t * ey;
        arrowhead(ctx, ex, ey, Math.atan2(ey - qy, ex - qx), pathColor);
        if (showCoefficients) {
          drawValueLabel(ctx,
            coef.toFixed(3) + pStar(path.pvalue),
            (sx + ex) / 2 + Math.cos(perp) * (bend + 16),
            (sy + ey) / 2 + Math.sin(perp) * (bend + 16),
            pathColor
          );
        }
      } else {
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        arrowhead(ctx, ex, ey, angle, pathColor);
        if (showCoefficients) {
          const mx = (sx + ex) / 2 - Math.sin(angle) * 18;
          const my = (sy + ey) / 2 + Math.cos(angle) * 18;
          drawValueLabel(ctx, coef.toFixed(3) + pStar(path.pvalue), mx, my, pathColor);
        }
      }
      ctx.restore();
    });

    // ── 3. Measurement model paths ───────────────────────────────────────────
    factors.forEach(factor => {
      const fp = latentPos[factor];
      if (!fp) return;
      const items = measurementModel[factor] || [];
      const fType = factorType(factor);

      items.forEach(item => {
        const ip = indicatorPos[item];
        if (!ip) return;

        const angle = Math.atan2(ip.y - fp.y, ip.x - fp.x);
        const [sx, sy] = ellipseEdge(fp.x, fp.y, angle);
        const [ex, ey] = rectEdge(ip.x, ip.y, angle + Math.PI);

        ctx.save();
        ctx.strokeStyle = pal.loadingColor;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        arrowhead(ctx, ex, ey, angle, pal.loadingColor, 9);

        if (showLoadings) {
          const ld = loadingMap.get(item);
          if (ld !== undefined) {
            const mx = (sx + ex) / 2 - Math.sin(angle) * 14;
            const my = (sy + ey) / 2 + Math.cos(angle) * 14;
            const lcolor = ld.pvalue !== undefined && ld.pvalue < 0.05 ? pal.loadingColor : pal.pathGray;
            drawValueLabel(ctx, ld.value.toFixed(3) + pStar(ld.pvalue), mx, my, lcolor);
          }
        }
        ctx.restore();

        // Error term: place directly to the opposite side of the indicator from the factor
        // (right of indicator if indicator is right of factor, left if left)
        // This prevents overlap between vertically-stacked indicator error circles.
        if (showErrors) {
          const errSide = ip.x >= fp.x ? 1 : -1;
          const errX = ip.x + errSide * (IND_W / 2 + ERROR_R + 10);
          const errY = ip.y;

          const errToIndAngle = Math.atan2(ip.y - errY, ip.x - errX);
          const esx = errX + Math.cos(errToIndAngle) * ERROR_R;
          const esy = errY + Math.sin(errToIndAngle) * ERROR_R;
          const [eex, eey] = rectEdge(ip.x, ip.y, errToIndAngle + Math.PI);

          ctx.save();
          ctx.strokeStyle = pal.errorStroke;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(esx, esy); ctx.lineTo(eex, eey); ctx.stroke();
          arrowhead(ctx, eex, eey, errToIndAngle, pal.errorStroke, 7);

          ctx.beginPath(); ctx.arc(errX, errY, ERROR_R, 0, Math.PI * 2);
          ctx.fillStyle = pal.errorFill; ctx.fill();
          ctx.strokeStyle = pal.errorStroke; ctx.lineWidth = 1.5; ctx.stroke();

          ctx.fillStyle = pal.errorText; ctx.font = 'bold 10px system-ui';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('e', errX, errY);
          ctx.restore();
        }
      });

      // Disturbance for endogenous/mediator factors
      if (showErrors && (fType === 'endogenous' || fType === 'mediator')) {
        const distX = fp.x;
        const distY = fp.y - LATENT_RY - DIST_R - 24;

        ctx.save();
        ctx.strokeStyle = pal.errorStroke;
        ctx.lineWidth = 1.5;
        const [dsx, dsy] = [distX, distY + DIST_R];
        const [dex, dey] = ellipseEdge(fp.x, fp.y, -Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(dsx, dsy); ctx.lineTo(dex, dey); ctx.stroke();
        arrowhead(ctx, dex, dey, Math.atan2(dey - dsy, dex - dsx), pal.errorStroke, 8);

        ctx.beginPath(); ctx.arc(distX, distY, DIST_R, 0, Math.PI * 2);
        ctx.fillStyle = pal.errorFill; ctx.fill();
        ctx.strokeStyle = pal.errorStroke; ctx.lineWidth = 1.5; ctx.stroke();

        ctx.fillStyle = pal.errorText; ctx.font = 'bold 12px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ζ', distX, distY);
        ctx.restore();
      }
    });

    // ── 4. Indicator rectangles ──────────────────────────────────────────────
    Object.entries(indicatorPos).forEach(([item, pos]) => {
      const displayName = indicatorLabels[item] || item;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.fillStyle = pal.indFill;
      ctx.strokeStyle = pal.indStroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      (ctx as any).roundRect?.(pos.x - IND_W / 2, pos.y - IND_H / 2, IND_W, IND_H, 4)
        ?? ctx.rect(pos.x - IND_W / 2, pos.y - IND_H / 2, IND_W, IND_H);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = pal.indText;
      ctx.font = '10px system-ui,Arial,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const maxW = IND_W - 8;
      let txt = displayName;
      while (ctx.measureText(txt).width > maxW && txt.length > 1) txt = txt.slice(0, -1);
      if (txt !== displayName) txt = txt.slice(0, -1) + '…';
      ctx.fillText(txt, pos.x, pos.y);
      ctx.restore();
    });

    // ── 5. Latent ellipses ───────────────────────────────────────────────────
    factors.forEach(factor => {
      const fp = latentPos[factor];
      if (!fp) return;
      const fType = factorType(factor);
      const displayName = latentLabels[factor] || factor;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.10)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      ctx.beginPath();
      ctx.ellipse(fp.x, fp.y, LATENT_RX, LATENT_RY, 0, 0, Math.PI * 2);
      ctx.fillStyle = pal.latentFill(fType);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = pal.latentStroke(fType);
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = pal.latentText(fType);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // Multi-line if name long
      const words = displayName.split(' ');
      if (words.length > 1 && ctx.measureText(displayName).width > LATENT_RX * 1.7) {
        // Two-line split
        const half = Math.ceil(words.length / 2);
        const line1 = words.slice(0, half).join(' ');
        const line2 = words.slice(half).join(' ');
        ctx.font = 'bold 11px system-ui,Arial,sans-serif';
        ctx.fillText(line1, fp.x, fp.y - 7);
        ctx.fillText(line2, fp.x, fp.y + 7);
      } else {
        ctx.font = 'bold 12px system-ui,Arial,sans-serif';
        let name = displayName;
        while (ctx.measureText(name).width > LATENT_RX * 1.8 && name.length > 1) name = name.slice(0, -1);
        if (name !== displayName) name = name.slice(0, -1) + '…';
        ctx.fillText(name, fp.x, fp.y);
      }

      // R² badge
      if (showRSquared && (fType === 'endogenous' || fType === 'mediator')) {
        const r2 = rSquared[factor] ?? 0;
        ctx.font = '10px system-ui,Arial,sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(`R²=${r2.toFixed(3)}`, fp.x, fp.y + LATENT_RY + 14);
      }

      // Lock indicator
      if (fp.locked) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px system-ui';
        ctx.fillText('🔒', fp.x + LATENT_RX - 10, fp.y - LATENT_RY + 10);
      }
      ctx.restore();
    });

    // ── 6. Legend ─────────────────────────────────────────────────────────────
    const lx = 12, ly = canvasH - 78;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    (ctx as any).roundRect?.(lx, ly, 320, 66, 6) ?? ctx.rect(lx, ly, 320, 66);
    ctx.fill(); ctx.stroke();
    ctx.font = '9px system-ui,Arial,sans-serif'; ctx.fillStyle = '#475569';
    ctx.textBaseline = 'middle';
    const legendItems = [
      [pal.latentStroke('exogenous'), 'Exogenous (ξ)'],
      [pal.latentStroke('mediator'), 'Mediator'],
      [pal.latentStroke('endogenous'), 'Endogenous (η)'],
      [pal.covarColor, 'Covariance (φ)'],
    ];
    legendItems.forEach(([color, label], i) => {
      const ix = lx + 12 + (i % 2) * 158, iy = ly + 18 + Math.floor(i / 2) * 24;
      ctx.beginPath(); ctx.arc(ix, iy, 6, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.fillStyle = '#475569'; ctx.fillText(label, ix + 10, iy);
    });
    ctx.fillStyle = '#94a3b8'; ctx.font = '8px system-ui';
    ctx.fillText('* p<.05  ** p<.01  *** p<.001 | Double-click to rename | Drag to reposition', lx + 8, ly + 58);
    ctx.restore();

    ctx.restore(); // restore main transform
  }, [latentPos, indicatorPos, measurementModel, structuralModel, factorLoadings,
      factorCorrelations, rSquared, showLoadings, showErrors, showRSquared,
      showCoefficients, showStandardized, zoom, pan, canvasW, canvasH,
      loadingMap, pal, mediators, latentLabels, indicatorLabels, factorType]);

  useEffect(() => { draw(); }, [draw]);

  // ── Mouse interactions ──────────────────────────────────────────────────────

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
    for (const [factor, pos] of Object.entries(latentPos)) {
      const dx = x - pos.x, dy = y - pos.y;
      if ((dx / LATENT_RX) ** 2 + (dy / LATENT_RY) ** 2 <= 1.1) return factor;
    }
    return null;
  }, [latentPos]);

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
      if (latentPos[factor]?.locked) return;
      dragRef.current = { type: 'latent', key: factor, ox: latentPos[factor].x, oy: latentPos[factor].y, mx: p.x, my: p.y };
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
  }, [locked, getCanvasPoint, hitTestFactor, hitTestIndicator, latentPos, indicatorPos, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;

    if (d.type === 'pan') {
      setPan({ x: d.ox + (e.clientX - d.mx) / zoom, y: d.oy + (e.clientY - d.my) / zoom });
      return;
    }

    const p = getCanvasPoint(e);
    const dx = p.x - d.mx, dy = p.y - d.my;

    if (d.type === 'latent') {
      const newX = d.ox + dx, newY = d.oy + dy;
      const oldPos = latentPos[d.key];
      const deltaX = newX - oldPos.x, deltaY = newY - oldPos.y;

      // Move factor and its indicators together
      const items = measurementModel[d.key] || [];
      setLatentPos(prev => ({ ...prev, [d.key]: { ...prev[d.key], x: newX, y: newY } }));
      setIndicatorPos(prev => {
        const next = { ...prev };
        items.forEach(item => {
          if (next[item]) next[item] = { ...next[item], x: next[item].x + deltaX, y: next[item].y + deltaY };
        });
        return next;
      });
    } else if (d.type === 'indicator') {
      const newX = d.ox + dx, newY = d.oy + dy;
      setIndicatorPos(prev => ({ ...prev, [d.key]: { ...prev[d.key], x: newX, y: newY } }));
    }
  }, [getCanvasPoint, latentPos, indicatorPos, measurementModel, zoom]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current && (dragRef.current.type === 'latent' || dragRef.current.type === 'indicator')) {
      pushHistory(latentPos, indicatorPos);
    }
    dragRef.current = null;
    setIsDragging(false);
  }, [latentPos, indicatorPos, pushHistory]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (locked) return;
    const p = getCanvasPoint(e);
    const factor = hitTestFactor(p.x, p.y);
    if (factor) {
      setEditing({ type: 'latent', key: factor });
      setEditValue(latentLabels[factor] || factor);
      return;
    }
    const item = hitTestIndicator(p.x, p.y);
    if (item) {
      setEditing({ type: 'indicator', key: item });
      setEditValue(indicatorLabels[item] || item);
    }
  }, [locked, getCanvasPoint, hitTestFactor, hitTestIndicator, latentLabels, indicatorLabels]);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const val = editValue.trim();
    if (val && onLabelChange) onLabelChange(editing.type, editing.key, val);
    setEditing(null);
  }, [editing, editValue, onLabelChange]);

  // ── Auto-optimize layout ────────────────────────────────────────────────────
  const optimizeLayout = useCallback(() => {
    const { latentPos: lp, indicatorPos: ip } = computeInitialPositions(
      measurementModel, structuralModel, canvasW, canvasH
    );
    setLatentPos(lp);
    setIndicatorPos(ip);
    setPan({ x: 0, y: 0 });
    pushHistory(lp, ip);
  }, [measurementModel, structuralModel, canvasW, canvasH, pushHistory]);

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'sem-path-diagram.png';
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
  }, []);

  const exportSVG = useCallback(() => {
    const factors = Object.keys(measurementModel);
    const width = canvasW, height = canvasH;

    const mkArrow = (x: number, y: number, angle: number, color: string, size = 9) => {
      const p1 = [x - size * Math.cos(angle - 0.35), y - size * Math.sin(angle - 0.35)];
      const p2 = [x - size * Math.cos(angle + 0.35), y - size * Math.sin(angle + 0.35)];
      return `<polygon points="${x},${y} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}" fill="${color}"/>`;
    };

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background:#fafafa">`;
    svg += `<defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f0f0f0" stroke-width="0.5"/></pattern></defs>`;
    svg += `<rect width="${width}" height="${height}" fill="url(#grid)"/>`;

    // Structural paths
    structuralModel.forEach(path => {
      const fp = latentPos[path.from], tp = latentPos[path.to];
      if (!fp || !tp) return;
      const coef = showStandardized && path.std_coefficient !== undefined ? path.std_coefficient : path.coefficient;
      const absCoef = Math.abs(coef);
      const sig = path.pvalue !== undefined && path.pvalue < 0.05;
      let color = pal.pathGray;
      if (sig) color = absCoef >= 0.5 ? pal.pathGreen : absCoef >= 0.3 ? pal.pathBlue : pal.pathOrange;

      const angle = Math.atan2(tp.y - fp.y, tp.x - fp.x);
      const [sx, sy] = ellipseEdge(fp.x, fp.y, angle);
      const [ex, ey] = ellipseEdge(tp.x, tp.y, angle + Math.PI);
      const sw = sig ? Math.max(2, absCoef * 5) : 1.5;
      svg += `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${color}" stroke-width="${sw}"/>`;
      svg += mkArrow(ex, ey, angle, color);
      if (showCoefficients) {
        const mx = (sx + ex) / 2 - Math.sin(angle) * 18;
        const my = (sy + ey) / 2 + Math.cos(angle) * 18;
        svg += `<rect x="${(mx - 20).toFixed(1)}" y="${(my - 8).toFixed(1)}" width="40" height="16" rx="3" fill="rgba(255,255,255,0.9)" stroke="#e5e7eb" stroke-width="0.5"/>`;
        svg += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui" font-size="9" font-weight="bold" fill="${color}">${coef.toFixed(3)}${pStar(path.pvalue)}</text>`;
      }
    });

    // Measurement paths
    factors.forEach(factor => {
      const fp = latentPos[factor];
      if (!fp) return;
      (measurementModel[factor] || []).forEach(item => {
        const ip = indicatorPos[item];
        if (!ip) return;
        const angle = Math.atan2(ip.y - fp.y, ip.x - fp.x);
        const [sx, sy] = ellipseEdge(fp.x, fp.y, angle);
        const [ex, ey] = rectEdge(ip.x, ip.y, angle + Math.PI);
        svg += `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${pal.loadingColor}" stroke-width="2"/>`;
        svg += mkArrow(ex, ey, angle, pal.loadingColor);
        if (showLoadings) {
          const ld = loadingMap.get(item);
          if (ld !== undefined) {
            const mx = (sx + ex) / 2 - Math.sin(angle) * 14;
            const my = (sy + ey) / 2 + Math.cos(angle) * 14;
            svg += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui" font-size="9" fill="${pal.loadingColor}">${ld.value.toFixed(3)}</text>`;
          }
        }
        // Error term
        const errSide = ip.x >= fp.x ? 1 : -1;
        const errX = ip.x + errSide * (IND_W / 2 + ERROR_R + 10);
        const errY = ip.y;
        const errAngle = Math.atan2(ip.y - errY, ip.x - errX);
        const [eex, eey] = rectEdge(ip.x, ip.y, errAngle + Math.PI);
        const esx = errX + Math.cos(errAngle) * ERROR_R;
        const esy = errY + Math.sin(errAngle) * ERROR_R;
        svg += `<line x1="${esx.toFixed(1)}" y1="${esy.toFixed(1)}" x2="${eex.toFixed(1)}" y2="${eey.toFixed(1)}" stroke="${pal.errorStroke}" stroke-width="1.5"/>`;
        svg += mkArrow(eex, eey, errAngle, pal.errorStroke, 7);
        svg += `<circle cx="${errX.toFixed(1)}" cy="${errY.toFixed(1)}" r="${ERROR_R}" fill="${pal.errorFill}" stroke="${pal.errorStroke}" stroke-width="1.5"/>`;
        svg += `<text x="${errX.toFixed(1)}" y="${errY.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui" font-size="10" font-weight="bold" fill="${pal.errorText}">e</text>`;
      });
    });

    // Indicator rectangles
    Object.entries(indicatorPos).forEach(([item, pos]) => {
      const name = indicatorLabels[item] || item;
      svg += `<rect x="${(pos.x - IND_W / 2).toFixed(1)}" y="${(pos.y - IND_H / 2).toFixed(1)}" width="${IND_W}" height="${IND_H}" rx="4" fill="${pal.indFill}" stroke="${pal.indStroke}" stroke-width="1.5"/>`;
      svg += `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui" font-size="10" fill="${pal.indText}">${name}</text>`;
    });

    // Latent ellipses (on top)
    factors.forEach(factor => {
      const fp = latentPos[factor];
      if (!fp) return;
      const fType = factorType(factor);
      const fill = pal.latentFill(fType);
      const stroke = pal.latentStroke(fType);
      const name = latentLabels[factor] || factor;
      svg += `<ellipse cx="${fp.x.toFixed(1)}" cy="${fp.y.toFixed(1)}" rx="${LATENT_RX}" ry="${LATENT_RY}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>`;
      svg += `<text x="${fp.x.toFixed(1)}" y="${fp.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui" font-weight="bold" font-size="12" fill="${pal.latentText(fType)}">${name}</text>`;
      if (showRSquared && (fType === 'endogenous' || fType === 'mediator')) {
        const r2 = rSquared[factor] ?? 0;
        svg += `<text x="${fp.x.toFixed(1)}" y="${(fp.y + LATENT_RY + 14).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui" font-size="10" fill="#6b7280">R²=${r2.toFixed(3)}</text>`;
      }
    });

    svg += '</svg>';
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'sem-path-diagram.svg'; link.href = url; link.click();
    URL.revokeObjectURL(url);
  }, [measurementModel, structuralModel, latentPos, indicatorPos, canvasW, canvasH,
      pal, latentLabels, indicatorLabels, factorType, loadingMap,
      showCoefficients, showStandardized, showLoadings, showRSquared, rSquared]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  const factors = Object.keys(measurementModel);
  if (factors.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50 flex-wrap">
        <div className="flex items-center gap-1 mr-2">
          <Layers className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-sm text-gray-800">SEM Path Diagram</span>
        </div>

        {/* Undo/Redo */}
        <button onClick={undo} disabled={histIdx <= 0}
          className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-40 transition" title="Undo">
          <RotateCcw className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <button onClick={redo} disabled={histIdx >= history.length - 1}
          className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-40 transition" title="Redo">
          <RotateCw className="w-3.5 h-3.5 text-gray-600" />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Zoom */}
        <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}
          className="p-1.5 hover:bg-gray-200 rounded transition" title="Zoom Out">
          <ZoomOut className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <span className="text-xs font-medium text-gray-600 min-w-[40px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.1))}
          className="p-1.5 hover:bg-gray-200 rounded transition" title="Zoom In">
          <ZoomIn className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="p-1.5 hover:bg-gray-200 rounded transition" title="Fit to Screen">
          <Maximize2 className="w-3.5 h-3.5 text-gray-600" />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Optimize */}
        <button onClick={optimizeLayout}
          className="flex items-center gap-1 px-2 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition font-medium">
          <RefreshCw className="w-3.5 h-3.5" />
          Auto-Layout
        </button>

        {/* Lock all */}
        <button onClick={() => setLocked(l => !l)}
          className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg transition font-medium ${locked ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
          {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          {locked ? 'Locked' : 'Lock'}
        </button>

        {/* Theme */}
        <select value={currentTheme} onChange={e => setCurrentTheme(e.target.value as any)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700">
          <option value="amos">AMOS Style</option>
          <option value="smartpls">SmartPLS Style</option>
          <option value="journal">Journal B&W</option>
        </select>

        {/* Display options */}
        <div className="flex items-center gap-3 text-xs text-gray-600 ml-1">
          {[['showLoadings', 'Loadings'], ['showErrors', 'Errors'], ['showRSquared', 'R²']].map(([key, label]) => (
            <label key={key} className="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox"
                checked={key === 'showLoadings' ? showLoadings : key === 'showErrors' ? showErrors : showRSquared}
                onChange={e => {
                  if (key === 'showLoadings') setShowLoadings(e.target.checked);
                  else if (key === 'showErrors') setShowErrors(e.target.checked);
                  else setShowRSquared(e.target.checked);
                }}
                className="rounded text-blue-600" />
              <span>{label}</span>
            </label>
          ))}
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
            Rename {editing.type === 'latent' ? 'Latent Variable' : 'Indicator'}: <code className="bg-blue-100 px-1 rounded">{editing.key}</code>
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
      <div ref={containerRef} className="overflow-auto bg-gray-50" style={{ maxHeight: 720 }}>
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
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span>
          {factors.length} latent variable{factors.length !== 1 ? 's' : ''} &middot;&nbsp;
          {Object.values(measurementModel).flat().length} indicators &middot;&nbsp;
          {structuralModel.length} structural path{structuralModel.length !== 1 ? 's' : ''}
        </span>
        <span className="text-gray-400">
          Double-click to rename &nbsp;|&nbsp; Drag to reposition &nbsp;|&nbsp; Drag background to pan
        </span>
      </div>
    </div>
  );
}
