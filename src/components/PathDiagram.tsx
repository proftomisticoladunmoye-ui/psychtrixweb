import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Download, ZoomIn, ZoomOut, GitBranch, Lock, Unlock, RefreshCw, Maximize2, Move } from 'lucide-react';

type NodeType = 'exogenous' | 'mediator' | 'moderator' | 'endogenous';
interface NodePos { x: number; y: number; type: NodeType }
type NodesMap = { [key: string]: NodePos };

interface PathInfo {
  from: string;
  to: string;
  coefficient: number;
  beta: number;
  se: number;
  pvalue: number;
}

interface PathDiagramFitIndices {
  chisq?: number;
  df?: number;
  pvalue?: number;
  cfi?: number;
  tli?: number;
  rmsea?: number;
  srmr?: number;
}

interface PathDiagramProps {
  paths: PathInfo[];
  mediators?: string[];
  moderators?: string[];
  rSquared?: { [variable: string]: number };
  exogenousVars?: string[];
  fitIndices?: PathDiagramFitIndices;
  estimationLabel?: string;
  title?: string;
}

function pStar(p?: number): string {
  if (p == null) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

// AMOS convention: two decimals, no leading zero (.85, -.31)
function fmtCoef(v: number): string {
  return v.toFixed(2).replace(/^(-?)0\./, '$1.');
}

export function PathDiagram({
  paths,
  mediators = [],
  moderators = [],
  rSquared = {},
  exogenousVars = [],
  fitIndices,
  estimationLabel = 'Ordinary Least Squares (OLS)',
  title = 'Path Model'
}: PathDiagramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [locked, setLocked] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showCoefficients, setShowCoefficients] = useState(true);
  const [showErrors, setShowErrors] = useState(true);
  const [showRSquared, setShowRSquared] = useState(true);
  const [showStandardized, setShowStandardized] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 1400, height: 800 });
  // Draggable node positions (initialised from the auto-layout, then user-movable).
  const [nodes, setNodes] = useState<NodesMap>({});
  const dragRef = useRef<{ type: 'node' | 'pan'; key: string; ox: number; oy: number; mx: number; my: number } | null>(null);
  const layoutSigRef = useRef<string>('');

  useEffect(() => {
    const updateDimensions = () => {
      if (canvasRef.current?.parentElement) {
        const width = Math.max(1400, canvasRef.current.parentElement.offsetWidth - 64);
        const allVars = new Set([...paths.map(p => p.from), ...paths.map(p => p.to)]);
        const height = Math.max(800, allVars.size * 100 + 300);
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [paths]);

  // ── Default auto-layout: exogenous left, mediators centre, moderators top,
  //    endogenous right — the initial arrangement users can then drag/lock. ──
  const buildDefaultNodes = useCallback((dims: { width: number; height: number }): NodesMap => {
    const allVars = new Set<string>();
    paths.forEach(p => { allVars.add(p.from); allVars.add(p.to); });
    const endogenousVars = new Set<string>();
    paths.forEach(p => endogenousVars.add(p.to));
    const exogenousSet = new Set(exogenousVars);
    const mediatorSet = new Set(mediators);
    const moderatorSet = new Set(moderators);
    if (exogenousVars.length === 0) {
      allVars.forEach(v => { if (!endogenousVars.has(v) && !mediatorSet.has(v)) exogenousSet.add(v); });
    }
    const leftPadding = 180, rightPadding = 180, topPadding = 120, bottomPadding = 100;
    const usableWidth = dims.width - leftPadding - rightPadding;
    const usableHeight = dims.height - topPadding - bottomPadding;
    const result: NodesMap = {};

    const exoVars = Array.from(allVars).filter(v => exogenousSet.has(v) && !mediatorSet.has(v) && !moderatorSet.has(v));
    const medVars = Array.from(allVars).filter(v => mediatorSet.has(v));
    const modVars = Array.from(allVars).filter(v => moderatorSet.has(v));
    const endoVars = Array.from(allVars).filter(v => endogenousVars.has(v) && !mediatorSet.has(v) && !moderatorSet.has(v));

    const exoX = leftPadding + 90;
    const exoSpacing = exoVars.length > 1 ? usableHeight / (exoVars.length + 1) : usableHeight / 2;
    exoVars.forEach((v, idx) => { result[v] = { x: exoX, y: topPadding + exoSpacing * (idx + 1), type: 'exogenous' }; });

    if (medVars.length > 0) {
      const medX = leftPadding + usableWidth / 2;
      const medSpacing = medVars.length > 1 ? usableHeight / (medVars.length + 1) : usableHeight / 2;
      medVars.forEach((v, idx) => { result[v] = { x: medX, y: topPadding + medSpacing * (idx + 1), type: 'mediator' }; });
    }
    if (modVars.length > 0) {
      const modStartX = leftPadding + usableWidth * 0.3;
      const modSpacing = usableWidth * 0.4 / Math.max(1, modVars.length - 1);
      modVars.forEach((v, idx) => { result[v] = { x: modStartX + modSpacing * idx, y: topPadding - 30, type: 'moderator' }; });
    }
    const endoX = dims.width - rightPadding - 90;
    const endoSpacing = endoVars.length > 1 ? usableHeight / (endoVars.length + 1) : usableHeight / 2;
    endoVars.forEach((v, idx) => { result[v] = { x: endoX, y: topPadding + endoSpacing * (idx + 1), type: 'endogenous' }; });

    return result;
  }, [paths, mediators, moderators, exogenousVars]);

  // Rebuild the layout only when the variable set / model structure / size
  // changes — user drags are preserved across unrelated re-renders.
  useEffect(() => {
    const sig = JSON.stringify({
      v: Object.keys(buildDefaultNodes(dimensions)).sort(),
      w: dimensions.width, h: dimensions.height,
    });
    if (sig !== layoutSigRef.current) {
      layoutSigRef.current = sig;
      setNodes(buildDefaultNodes(dimensions));
      setPan({ x: 0, y: 0 });
    }
  }, [dimensions, buildDefaultNodes]);

  useEffect(() => {
    if (!canvasRef.current || Object.keys(nodes).length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr * zoom;
    canvas.height = dimensions.height * dpr * zoom;
    canvas.style.width = `${dimensions.width * zoom}px`;
    canvas.style.height = `${dimensions.height * zoom}px`;

    // Fill the whole physical canvas white first so panning never reveals
    // empty regions, then apply device-pixel-ratio, zoom and pan for drawing.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, pan.x * dpr * zoom, pan.y * dpr * zoom);

    drawPathDiagram(ctx);
  }, [dimensions, zoom, pan, nodes, paths, mediators, moderators, showCoefficients, showErrors, showRSquared, showStandardized, rSquared, fitIndices, estimationLabel, title]);

  // ── Pointer interaction: drag nodes to reposition, drag background to pan;
  //    node dragging is disabled while the layout is Locked. ──
  const getCanvasPoint = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom - pan.x, y: (e.clientY - rect.top) / zoom - pan.y };
  }, [zoom, pan]);

  const hitTestNode = useCallback((x: number, y: number): string | null => {
    for (const [v, pos] of Object.entries(nodes)) {
      if (Math.abs(x - pos.x) <= 50 + 3 && Math.abs(y - pos.y) <= 32 + 3) return v;
    }
    return null;
  }, [nodes]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const p = getCanvasPoint(e);
    const hit = locked ? null : hitTestNode(p.x, p.y);
    if (hit) {
      dragRef.current = { type: 'node', key: hit, ox: nodes[hit].x, oy: nodes[hit].y, mx: p.x, my: p.y };
    } else {
      dragRef.current = { type: 'pan', key: '', ox: pan.x, oy: pan.y, mx: e.clientX, my: e.clientY };
    }
    setIsDragging(true);
  }, [locked, getCanvasPoint, hitTestNode, nodes, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    // Guard: button released off-canvas means we never saw mouseup.
    if (!(e.buttons & 1)) { dragRef.current = null; setIsDragging(false); return; }
    if (d.type === 'pan') {
      setPan({ x: d.ox + (e.clientX - d.mx) / zoom, y: d.oy + (e.clientY - d.my) / zoom });
      return;
    }
    const p = getCanvasPoint(e);
    const nx = d.ox + (p.x - d.mx), ny = d.oy + (p.y - d.my);
    setNodes(prev => prev[d.key] ? { ...prev, [d.key]: { ...prev[d.key], x: nx, y: ny } } : prev);
  }, [getCanvasPoint, zoom]);

  const handleMouseUp = useCallback(() => { dragRef.current = null; setIsDragging(false); }, []);

  const autoLayout = useCallback(() => {
    setNodes(buildDefaultNodes(dimensions));
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [buildDefaultNodes, dimensions]);

  const drawPathDiagram = (ctx: CanvasRenderingContext2D) => {
    // Positions come from the (draggable) node state; category lists are derived
    // by type, preserving insertion order for stable e1..eN error numbering.
    const keysByType = (t: NodeType) => Object.keys(nodes).filter(v => nodes[v].type === t);
    const exoVars = keysByType('exogenous');
    const medVars = keysByType('mediator');
    const endoVars = keysByType('endogenous');

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // White publication background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Title (top-left, AMOS style)
    ctx.save();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 17px system-ui, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, 24, 20);
    ctx.restore();

    // Exogenous covariances: solid double-headed arcs bowing LEFT of the exo
    // column with arrowheads at BOTH ENDS (AMOS convention)
    for (let i = 0; i < exoVars.length; i++) {
      for (let j = i + 1; j < exoVars.length; j++) {
        const node1 = nodes[exoVars[i]];
        const node2 = nodes[exoVars[j]];
        if (!node1 || !node2) continue;

        const span = Math.abs(j - i);
        const bow = 46 + 34 * Math.max(span - 1, 0);
        const startX = node1.x - 52, startY = node1.y;
        const endX = node2.x - 52, endY = node2.y;
        const cpX = Math.min(node1.x, node2.x) - 52 - bow;
        const cpY = (startY + endY) / 2;

        ctx.save();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        ctx.stroke();

        const tA = 0.05, tB = 0.95;
        const qx = (t: number) => (1 - t) ** 2 * startX + 2 * (1 - t) * t * cpX + t * t * endX;
        const qy = (t: number) => (1 - t) ** 2 * startY + 2 * (1 - t) * t * cpY + t * t * endY;
        drawDoubleArrowHead(ctx, startX, startY, Math.atan2(startY - qy(tA), startX - qx(tA)), 8);
        drawDoubleArrowHead(ctx, endX, endY, Math.atan2(endY - qy(tB), endX - qx(tB)), 8);
        ctx.restore();
      }
    }

    // Directed paths — restrained AMOS palette: dark for significant, light
    // gray dashed for non-significant; constant modest line width
    paths.forEach(path => {
      const fromNode = nodes[path.from];
      const toNode = nodes[path.to];
      if (!fromNode || !toNode) return;

      const isSignificant = path.pvalue < 0.05;
      const coefficient = showStandardized ? path.beta : path.coefficient;
      const pathColor = isSignificant ? '#334155' : '#9ca3af';

      ctx.save();
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = isSignificant ? 1.8 : 1.4;
      if (!isSignificant) ctx.setLineDash([6, 4]);

      const label = fmtCoef(coefficient) + pStar(path.pvalue);
      const isCurved = Math.abs(fromNode.y - toNode.y) > 60;

      if (isCurved) {
        const cpX = (fromNode.x + toNode.x) / 2;
        const cpY = (fromNode.y + toNode.y) / 2 - 40;
        const endX = toNode.x - 52;
        const endY = toNode.y;

        ctx.beginPath();
        ctx.moveTo(fromNode.x + 52, fromNode.y);
        ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        const angle = Math.atan2(endY - cpY, endX - cpX);
        const arrowStartX = endX - 15 * Math.cos(angle);
        const arrowStartY = endY - 15 * Math.sin(angle);
        drawArrowHead(ctx, arrowStartX, arrowStartY, endX, endY, 10);

        if (showCoefficients) {
          drawLabel(ctx, label, cpX, cpY - 13, isSignificant);
        }
      } else {
        const startX = fromNode.x + 52;
        const startY = fromNode.y;
        const endX = toNode.x - 52;
        const endY = toNode.y;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        const angle = Math.atan2(endY - startY, endX - startX);
        const arrowStartX = endX - 15 * Math.cos(angle);
        const arrowStartY = endY - 15 * Math.sin(angle);
        drawArrowHead(ctx, arrowStartX, arrowStartY, endX, endY, 10);

        if (showCoefficients) {
          // AMOS convention: label near the arrowhead end, above the line
          const lx = startX + (endX - startX) * 0.68;
          const ly = startY + (endY - startY) * 0.68 - 16;
          drawLabel(ctx, label, lx, ly, isSignificant);
        }
      }
      ctx.restore();
    });

    // Error terms — e1..eN numbering (AMOS convention)
    if (showErrors) {
      const errVars = [...medVars, ...endoVars];
      errVars.forEach((v, errIdx) => {
        const node = nodes[v];
        if (!node) return;

        const errorX = node.x;
        const errorY = node.y - 88;

        const errorStartY = errorY + 18;
        const errorEndY = node.y - 34;

        ctx.beginPath();
        ctx.moveTo(errorX, errorStartY);
        ctx.lineTo(errorX, errorEndY);
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        drawArrowHead(ctx, errorX, errorEndY - 10, errorX, errorEndY, 8);

        ctx.beginPath();
        ctx.arc(errorX, errorY, 18, 0, Math.PI * 2);
        ctx.fillStyle = '#fef9c3';
        ctx.fill();
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.save();
        ctx.font = 'bold 11px system-ui, Arial, sans-serif';
        ctx.fillStyle = '#92400e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`e${errIdx + 1}`, errorX, errorY);
        ctx.restore();
      });
    }

    // Draw nodes
    Object.entries(nodes).forEach(([variable, node]) => {
      const width = 100;
      const height = 65;

      let fillColor, strokeColor, textColor;
      switch (node.type) {
        case 'exogenous':
          fillColor = '#dbeafe';
          strokeColor = '#2563eb';
          textColor = '#1e40af';
          break;
        case 'mediator':
          fillColor = '#fef3c7';
          strokeColor = '#f59e0b';
          textColor = '#92400e';
          break;
        case 'moderator':
          fillColor = '#f3e8ff';
          strokeColor = '#a855f7';
          textColor = '#7e22ce';
          break;
        case 'endogenous':
          fillColor = '#dcfce7';
          strokeColor = '#10b981';
          textColor = '#065f46';
          break;
      }

      ctx.fillStyle = fillColor;
      ctx.fillRect(node.x - width / 2, node.y - height / 2, width, height);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(node.x - width / 2, node.y - height / 2, width, height);

      ctx.save();
      ctx.font = 'bold 13px Arial';
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      let displayText = variable;
      const maxWidth = width - 12;
      if (ctx.measureText(variable).width > maxWidth) {
        while (ctx.measureText(displayText + '...').width > maxWidth && displayText.length > 0) {
          displayText = displayText.slice(0, -1);
        }
        displayText += '...';
      }

      ctx.fillText(displayText, node.x, node.y);
      ctx.restore();

      if (showRSquared && (node.type === 'endogenous' || node.type === 'mediator')) {
        const r2 = rSquared[variable] || 0;
        ctx.save();
        ctx.font = 'bold 11px system-ui, Arial, sans-serif';
        ctx.fillStyle = '#4b5563';
        ctx.textAlign = 'center';
        ctx.fillText(`R² = ${fmtCoef(r2)}`, node.x, node.y + 50);
        ctx.restore();
      }
    });

    // Model Fit Summary box (bottom-left) + estimation footer, matching the
    // CFA/SEM/Invariance diagram engines
    if (fitIndices && fitIndices.chisq !== undefined) {
      const lines: string[] = [];
      if (fitIndices.chisq !== undefined && fitIndices.df !== undefined)
        lines.push(`χ² = ${fitIndices.chisq.toFixed(2)}   df = ${fitIndices.df}${fitIndices.pvalue !== undefined ? `   p = ${fitIndices.pvalue < 0.001 ? '<.001' : fitIndices.pvalue.toFixed(3)}` : ''}`);
      const l2: string[] = [];
      if (fitIndices.cfi !== undefined) l2.push(`CFI = ${fitIndices.cfi.toFixed(3)}`);
      if (fitIndices.tli !== undefined) l2.push(`TLI = ${fitIndices.tli.toFixed(3)}`);
      if (l2.length) lines.push(l2.join('   '));
      const l3: string[] = [];
      if (fitIndices.rmsea !== undefined) l3.push(`RMSEA = ${fitIndices.rmsea.toFixed(3)}`);
      if (fitIndices.srmr !== undefined) l3.push(`SRMR = ${fitIndices.srmr.toFixed(3)}`);
      if (l3.length) lines.push(l3.join('   '));

      const boxW = 240;
      const boxH = 22 + lines.length * 17;
      const bx = 24, by = dimensions.height - boxH - 46;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); // canvas paths survive save/restore — prevents the previous shape leaking into this fill
      (ctx as any).roundRect?.(bx, by, boxW, boxH, 4) ?? ctx.rect(bx, by, boxW, boxH);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 11px system-ui, Arial, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Model Fit Summary', bx + 10, by + 7);
      ctx.font = '10.5px system-ui, Arial, sans-serif';
      ctx.fillStyle = '#374151';
      lines.forEach((ln, i) => ctx.fillText(ln, bx + 10, by + 24 + i * 17));
      ctx.restore();
    }

    // Estimation footer
    ctx.save();
    ctx.fillStyle = '#6b7280';
    ctx.font = 'italic 11px system-ui, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Estimation: ${estimationLabel}   |   * p<.05  ** p<.01  *** p<.001`, 24, dimensions.height - 16);
    ctx.restore();
  };

  const drawArrowHead = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    size: number
  ) => {
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.save();
    ctx.translate(toX, toY);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size / 2);
    ctx.lineTo(-size, size / 2);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();

    ctx.restore();
  };

  const drawDoubleArrowHead = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    size: number
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(-size / 2, 0);
    ctx.lineTo(-size / 2 - size, -size / 2);
    ctx.lineTo(-size / 2 - size, size / 2);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2 + size, -size / 2);
    ctx.lineTo(size / 2 + size, size / 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };

  const drawLabel = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    isSignificant: boolean
  ) => {
    ctx.save();
    ctx.font = 'bold 11px system-ui, Arial, sans-serif';
    ctx.textAlign = 'center';

    const metrics = ctx.measureText(text);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    (ctx as any).roundRect?.(x - metrics.width / 2 - 5, y - 10, metrics.width + 10, 18, 3)
      ?? ctx.rect(x - metrics.width / 2 - 5, y - 10, metrics.width + 10, 18);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = isSignificant ? '#1f2937' : '#6b7280';
    ctx.fillText(text, x, y + 3);
    ctx.restore();
  };

  // Export the arranged layout cleanly (2×, no pan/zoom baked in).
  const handleDownload = () => {
    const off = document.createElement('canvas');
    off.width = dimensions.width * 2;
    off.height = dimensions.height * 2;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);
    drawPathDiagram(ctx);
    const link = document.createElement('a');
    link.download = 'path-analysis-diagram.png';
    link.href = off.toDataURL('image/png', 1.0);
    link.click();
  };

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.1, 3));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.1, 0.4));
  const handleResetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-blue-600" />
            Path Diagram (Observed Variables)
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {mediators.length > 0 && `${mediators.length} mediator(s) • `}
            {moderators.length > 0 && `${moderators.length} moderator(s) • `}
            All variables are directly observed
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleZoomOut} className="p-2 hover:bg-gray-100 rounded-lg transition" title="Zoom Out">
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
          <button onClick={handleResetView}
            className="px-3 py-2 text-sm hover:bg-gray-100 rounded-lg transition font-medium text-gray-700"
            title="Reset zoom & pan">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={handleZoomIn} className="p-2 hover:bg-gray-100 rounded-lg transition" title="Zoom In">
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>
          <button onClick={handleResetView} className="p-2 hover:bg-gray-100 rounded-lg transition" title="Reset View">
            <Maximize2 className="w-4 h-4 text-gray-600" />
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          <button onClick={autoLayout}
            className="flex items-center gap-1 px-2.5 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition font-medium"
            title="Re-apply the automatic layout">
            <RefreshCw className="w-4 h-4" />
            Auto-Layout
          </button>
          <button onClick={() => setLocked(l => !l)}
            className={`flex items-center gap-1 px-2.5 py-2 text-sm rounded-lg transition font-medium ${
              locked ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
            }`}
            title={locked ? 'Layout locked — nodes cannot be moved' : 'Lock the layout to prevent accidental moves'}>
            {locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            {locked ? 'Locked' : 'Lock'}
          </button>

          <button onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium text-sm">
            <Download className="w-4 h-4" />
            PNG
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
        <Move className="w-3.5 h-3.5" />
        {locked
          ? 'Layout is locked. Click Lock again to move nodes.'
          : 'Drag any box to reposition it and avoid overlaps · drag the background to pan · Lock when done.'}
      </p>

      {/* Controls */}
      <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showCoefficients}
            onChange={(e) => setShowCoefficients(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Show Coefficients</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showStandardized}
            onChange={(e) => setShowStandardized(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Standardized (β)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showErrors}
            onChange={(e) => setShowErrors(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Show Errors</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showRSquared}
            onChange={(e) => setShowRSquared(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Show R²</span>
        </label>
      </div>

      {/* Legend */}
      <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 via-amber-50 to-green-50 rounded-lg border border-blue-200">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Legend</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="font-medium text-gray-700 mb-2">Observed Variables:</p>
            <p className="text-blue-600 mb-1">• Blue = Exogenous (IV)</p>
            <p className="text-amber-600 mb-1">• Amber = Mediator</p>
            <p className="text-purple-600 mb-1">• Purple = Moderator</p>
            <p className="text-green-600">• Green = Endogenous (DV)</p>
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-2">Paths:</p>
            <p className="text-gray-600 mb-1">• Solid = significant (p &lt; .05)</p>
            <p className="text-gray-600 mb-1">• Dashed gray = not significant</p>
            <p className="text-gray-600">• Double-headed arc = covariance</p>
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-2">Labels:</p>
            <p className="text-gray-600 mb-1">• .xx = coefficient (AMOS format)</p>
            <p className="text-gray-600 mb-1">• * p&lt;.05 ** p&lt;.01 *** p&lt;.001</p>
            <p className="text-gray-600">• Fit summary box (χ², CFI, RMSEA…)</p>
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-2">Notation:</p>
            <p className="text-gray-600 mb-1">• e1…eN = Error terms</p>
            <p className="text-gray-600 mb-1">• R² = Var. explained</p>
            <p className="text-gray-600">• β = Std. coef.</p>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="border border-gray-300 rounded-lg overflow-auto bg-white" style={{ maxHeight: '800px' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ display: 'block', cursor: locked ? 'default' : (isDragging ? 'grabbing' : 'grab') }}
        />
      </div>

      {/* Info Card */}
      <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Path Analysis Model</h4>
        <p className="text-sm text-gray-700">
          <strong>Key:</strong> All variables are <span className="font-semibold">observed/measured directly</span> (rectangles).
          Each has a single measurement. Error terms (e) represent unexplained variance.
          {mediators.length > 0 && <span className="block mt-1"><strong>Mediation:</strong> Indirect effects via {mediators.join(', ')}.</span>}
          {moderators.length > 0 && <span className="block mt-1"><strong>Moderation:</strong> {moderators.join(', ')} affect(s) relationship strength.</span>}
        </p>
      </div>
    </div>
  );
}
