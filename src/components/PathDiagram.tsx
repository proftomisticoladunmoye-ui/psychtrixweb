import React, { useEffect, useRef, useState } from 'react';
import { Download, ZoomIn, ZoomOut, GitBranch } from 'lucide-react';

interface PathInfo {
  from: string;
  to: string;
  coefficient: number;
  beta: number;
  se: number;
  pvalue: number;
}

interface PathDiagramProps {
  paths: PathInfo[];
  mediators?: string[];
  moderators?: string[];
  rSquared?: { [variable: string]: number };
  exogenousVars?: string[];
}

export function PathDiagram({
  paths,
  mediators = [],
  moderators = [],
  rSquared = {},
  exogenousVars = []
}: PathDiagramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [showCoefficients, setShowCoefficients] = useState(true);
  const [showErrors, setShowErrors] = useState(true);
  const [showRSquared, setShowRSquared] = useState(true);
  const [showStandardized, setShowStandardized] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 1400, height: 800 });

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

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr * zoom;
    canvas.height = dimensions.height * dpr * zoom;
    canvas.style.width = `${dimensions.width * zoom}px`;
    canvas.style.height = `${dimensions.height * zoom}px`;
    ctx.scale(dpr * zoom, dpr * zoom);

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    drawPathDiagram(ctx);
  }, [dimensions, zoom, paths, mediators, moderators, showCoefficients, showErrors, showRSquared, showStandardized, rSquared]);

  const drawPathDiagram = (ctx: CanvasRenderingContext2D) => {
    // Collect all unique variables
    const allVars = new Set<string>();
    paths.forEach(p => {
      allVars.add(p.from);
      allVars.add(p.to);
    });

    // Classify variables
    const endogenousVars = new Set<string>();
    paths.forEach(p => endogenousVars.add(p.to));

    const exogenousSet = new Set(exogenousVars);
    const mediatorSet = new Set(mediators);
    const moderatorSet = new Set(moderators);

    // Auto-detect if not specified
    if (exogenousVars.length === 0) {
      allVars.forEach(v => {
        if (!endogenousVars.has(v) && !mediatorSet.has(v)) {
          exogenousSet.add(v);
        }
      });
    }

    // Enhanced padding
    const leftPadding = 180;
    const rightPadding = 180;
    const topPadding = 120;
    const bottomPadding = 100;

    const usableWidth = dimensions.width - leftPadding - rightPadding;
    const usableHeight = dimensions.height - topPadding - bottomPadding;

    // Position nodes
    const nodes: { [key: string]: { x: number; y: number; type: 'exogenous' | 'mediator' | 'moderator' | 'endogenous' } } = {};

    // Separate variables by type
    const exoVars = Array.from(allVars).filter(v => exogenousSet.has(v) && !mediatorSet.has(v) && !moderatorSet.has(v));
    const medVars = Array.from(allVars).filter(v => mediatorSet.has(v));
    const modVars = Array.from(allVars).filter(v => moderatorSet.has(v));
    const endoVars = Array.from(allVars).filter(v => endogenousVars.has(v) && !mediatorSet.has(v) && !moderatorSet.has(v));

    // Position exogenous (left)
    const exoX = leftPadding + 90;
    const exoSpacing = exoVars.length > 1 ? usableHeight / (exoVars.length + 1) : usableHeight / 2;
    exoVars.forEach((v, idx) => {
      nodes[v] = {
        x: exoX,
        y: topPadding + exoSpacing * (idx + 1),
        type: 'exogenous'
      };
    });

    // Position mediators (center)
    if (medVars.length > 0) {
      const medX = leftPadding + usableWidth / 2;
      const medSpacing = medVars.length > 1 ? usableHeight / (medVars.length + 1) : usableHeight / 2;
      medVars.forEach((v, idx) => {
        nodes[v] = {
          x: medX,
          y: topPadding + medSpacing * (idx + 1),
          type: 'mediator'
        };
      });
    }

    // Position moderators (top center)
    if (modVars.length > 0) {
      const modStartX = leftPadding + usableWidth * 0.3;
      const modSpacing = usableWidth * 0.4 / Math.max(1, modVars.length - 1);
      modVars.forEach((v, idx) => {
        nodes[v] = {
          x: modStartX + modSpacing * idx,
          y: topPadding - 30,
          type: 'moderator'
        };
      });
    }

    // Position endogenous (right)
    const endoX = dimensions.width - rightPadding - 90;
    const endoSpacing = endoVars.length > 1 ? usableHeight / (endoVars.length + 1) : usableHeight / 2;
    endoVars.forEach((v, idx) => {
      nodes[v] = {
        x: endoX,
        y: topPadding + endoSpacing * (idx + 1),
        type: 'endogenous'
      };
    });

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw correlation curves between exogenous variables
    for (let i = 0; i < exoVars.length; i++) {
      for (let j = i + 1; j < exoVars.length; j++) {
        const node1 = nodes[exoVars[i]];
        const node2 = nodes[exoVars[j]];

        if (node1 && node2) {
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 3]);

          const cpX = node1.x - 70;
          const cpY = (node1.y + node2.y) / 2;
          const startX = node1.x - 50;
          const startY = node1.y;
          const endX = node2.x - 50;
          const endY = node2.y;

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.quadraticCurveTo(cpX, cpY, endX, endY);
          ctx.stroke();

          const t = 0.3;
          const arrowX1 = Math.pow(1-t, 2) * startX + 2*(1-t)*t * cpX + Math.pow(t, 2) * endX;
          const arrowY1 = Math.pow(1-t, 2) * startY + 2*(1-t)*t * cpY + Math.pow(t, 2) * endY;
          const angle1 = Math.atan2(
            2*(1-t)*(cpY - startY) + 2*t*(endY - cpY),
            2*(1-t)*(cpX - startX) + 2*t*(endX - cpX)
          );
          drawDoubleArrowHead(ctx, arrowX1, arrowY1, angle1, 8);

          const t2 = 0.7;
          const arrowX2 = Math.pow(1-t2, 2) * startX + 2*(1-t2)*t2 * cpX + Math.pow(t2, 2) * endX;
          const arrowY2 = Math.pow(1-t2, 2) * startY + 2*(1-t2)*t2 * cpY + Math.pow(t2, 2) * endY;
          const angle2 = Math.atan2(
            2*(1-t2)*(cpY - startY) + 2*t2*(endY - cpY),
            2*(1-t2)*(cpX - startX) + 2*t2*(endX - cpX)
          );
          drawDoubleArrowHead(ctx, arrowX2, arrowY2, angle2 + Math.PI, 8);

          ctx.setLineDash([]);
        }
      }
    }

    // Draw paths
    paths.forEach(path => {
      const fromNode = nodes[path.from];
      const toNode = nodes[path.to];

      if (!fromNode || !toNode) return;

      const isSignificant = path.pvalue < 0.05;
      const coefficient = showStandardized ? path.beta : path.coefficient;

      // Color by significance and effect size
      let pathColor = '#9ca3af';
      if (isSignificant) {
        const absCoef = Math.abs(coefficient);
        if (absCoef >= 0.5) pathColor = '#10b981';
        else if (absCoef >= 0.3) pathColor = '#3b82f6';
        else pathColor = '#f59e0b';
      }

      ctx.strokeStyle = pathColor;
      ctx.lineWidth = isSignificant ? Math.max(2.5, Math.abs(coefficient) * 7) : 2;

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

        const angle = Math.atan2(endY - cpY, endX - cpX);
        const arrowStartX = endX - 15 * Math.cos(angle);
        const arrowStartY = endY - 15 * Math.sin(angle);
        drawArrowHead(ctx, arrowStartX, arrowStartY, endX, endY, 12);

        if (showCoefficients) {
          drawLabel(ctx, coefficient.toFixed(3), cpX, cpY - 15, isSignificant);
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

        const angle = Math.atan2(endY - startY, endX - startX);
        const arrowStartX = endX - 15 * Math.cos(angle);
        const arrowStartY = endY - 15 * Math.sin(angle);
        drawArrowHead(ctx, arrowStartX, arrowStartY, endX, endY, 12);

        if (showCoefficients) {
          const midX = (startX + endX) / 2;
          const midY = startY - 20;
          drawLabel(ctx, coefficient.toFixed(3), midX, midY, isSignificant);
        }
      }
    });

    // Draw error terms
    if (showErrors) {
      [...endoVars, ...medVars].forEach(v => {
        const node = nodes[v];
        if (!node) return;

        const errorX = node.x;
        const errorY = node.y - 90;

        ctx.beginPath();
        ctx.arc(errorX, errorY, 20, 0, Math.PI * 2);
        ctx.fillStyle = '#fef3c7';
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#92400e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('e', errorX, errorY);
        ctx.restore();

        const errorStartY = errorY + 20;
        const errorEndY = node.y - 35;

        ctx.beginPath();
        ctx.moveTo(errorX, errorStartY);
        ctx.lineTo(errorX, errorEndY);
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2;
        ctx.stroke();

        drawArrowHead(ctx, errorX, errorEndY - 10, errorX, errorEndY, 8);
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
        ctx.font = 'bold 11px Arial';
        ctx.fillStyle = '#4b5563';
        ctx.textAlign = 'center';
        ctx.fillText(`R² = ${r2.toFixed(3)}`, node.x, node.y + 50);
        ctx.restore();
      }
    });
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
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';

    const metrics = ctx.measureText(text);
    ctx.fillStyle = 'white';
    ctx.fillRect(x - metrics.width / 2 - 5, y - 11, metrics.width + 10, 20);

    ctx.fillStyle = isSignificant ? '#1f2937' : '#6b7280';
    ctx.fillText(text, x, y + 3);
    ctx.restore();
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'path-analysis-diagram.png';
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  const handleZoomIn = () => setZoom(Math.min(zoom + 0.1, 2));
  const handleZoomOut = () => setZoom(Math.max(zoom - 0.1, 0.5));
  const handleResetZoom = () => setZoom(1);

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
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={handleResetZoom}
            className="px-3 py-2 text-sm hover:bg-gray-100 rounded-lg transition font-medium text-gray-700"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium text-sm"
          >
            <Download className="w-4 h-4" />
            Download PNG
          </button>
        </div>
      </div>

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
            <p className="text-gray-600 mb-1">• Solid = Direct effect</p>
            <p className="text-gray-600 mb-1">• Dashed = Correlation</p>
            <p className="text-gray-600">• Arrow = Directional</p>
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-2">Path Strength:</p>
            <p className="text-green-600 mb-1">• Green: |β| ≥ 0.5</p>
            <p className="text-blue-600 mb-1">• Blue: |β| ≥ 0.3</p>
            <p className="text-amber-600 mb-1">• Amber: |β| &lt; 0.3</p>
            <p className="text-gray-600">• Gray: Not sig.</p>
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-2">Notation:</p>
            <p className="text-gray-600 mb-1">• e = Error term</p>
            <p className="text-gray-600 mb-1">• R² = Var. explained</p>
            <p className="text-gray-600">• β = Std. coef.</p>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="border border-gray-300 rounded-lg overflow-auto bg-white" style={{ maxHeight: '800px' }}>
        <canvas ref={canvasRef} />
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
