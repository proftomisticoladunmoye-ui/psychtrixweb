import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface NetworkNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  community?: number;
  centrality?: number;
}

interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
}

interface NetworkVisualizationProps {
  nodes: string[];
  adjacency: number[][];
  communities?: { [node: string]: number };
  centrality?: { [node: string]: number };
  showEdgeWeights?: boolean;
  threshold?: number;
}

const COMMUNITY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

function nodeRadius(node: NetworkNode) {
  return node.centrality != null ? Math.max(5, 5 + node.centrality * 15) : 8;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  nodes: NetworkNode[],
  edges: NetworkEdge[],
  pan: { x: number; y: number },
  zoom: number,
  selectedNode: string | null,
  showEdgeWeights: boolean,
  dragNodeId: string | null,
) {
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.scale(zoom, zoom);

  // Edges
  edges.forEach(edge => {
    const src = nodes.find(n => n.id === edge.source);
    const tgt = nodes.find(n => n.id === edge.target);
    if (!src || !tgt) return;

    const w = Math.abs(edge.weight);
    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);
    ctx.lineWidth = Math.max(0.5, w * 3);
    ctx.strokeStyle = edge.weight > 0
      ? `rgba(34,197,94,${Math.min(w, 1)})`
      : `rgba(239,68,68,${Math.min(w, 1)})`;
    ctx.stroke();

    if (showEdgeWeights && w > 0.1) {
      const mx = (src.x + tgt.x) / 2;
      const my = (src.y + tgt.y) / 2;
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(edge.weight.toFixed(2), mx, my);
    }
  });

  // Nodes
  nodes.forEach(node => {
    const r = nodeRadius(node);
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);

    if (node.id === selectedNode) {
      ctx.fillStyle = '#f59e0b';
    } else if (node.id === dragNodeId) {
      ctx.fillStyle = '#a78bfa';
    } else if (node.community != null) {
      ctx.fillStyle = COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length];
    } else {
      ctx.fillStyle = '#3b82f6';
    }
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(node.id, node.x, node.y + r + 12);
  });

  ctx.restore();
}

export function NetworkVisualization({
  nodes,
  adjacency,
  communities,
  centrality,
  showEdgeWeights = false,
  threshold = 0,
}: NetworkVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Live data refs (avoid stale closure in animation loop)
  const nodesRef = useRef<NetworkNode[]>([]);
  const edgesRef = useRef<NetworkEdge[]>([]);

  const [containerW, setContainerW] = useState(600);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const animationRef = useRef<number>();
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const selectedNodeRef = useRef<string | null>(null);

  // Pointer interaction state (all in refs to avoid re-renders during drag)
  const pointerModeRef = useRef<'none' | 'pan' | 'node'>('none');
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const dragNodeIdRef = useRef<string | null>(null);
  const dragStartClientRef = useRef({ x: 0, y: 0 });

  const canvasH = Math.round(containerW * 0.625); // 8:5 ratio

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

  // Initialize nodes/edges when props change
  useEffect(() => {
    const n = nodes.length;
    if (n === 0) return;

    const cx = containerW / 2;
    const cy = canvasH / 2;
    const radius = Math.min(containerW, canvasH) / 3;

    const newNodes: NetworkNode[] = nodes.map((id, i) => {
      const angle = (i * 2 * Math.PI) / n;
      return {
        id,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
        community: communities?.[id],
        centrality: centrality?.[id],
      };
    });

    const newEdges: NetworkEdge[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(adjacency[i]?.[j] ?? 0) > threshold) {
          newEdges.push({ source: nodes[i], target: nodes[j], weight: adjacency[i][j] });
        }
      }
    }

    nodesRef.current = newNodes;
    edgesRef.current = newEdges;
    startSimulation();
  }, [nodes, adjacency, communities, threshold]);

  const startSimulation = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    const alpha = { v: 0.3 };
    const alphaDecay = 0.012;
    const W = containerW;
    const H = canvasH;

    const tick = () => {
      if (alpha.v < 0.001) {
        redraw();
        return;
      }

      const ns = nodesRef.current;
      const es = edgesRef.current;

      for (let iter = 0; iter < 3; iter++) {
        for (const node of ns) {
          if (node.fx != null) { node.x = node.fx; node.y = node.fy!; continue; }

          node.vx *= 0.9;
          node.vy *= 0.9;

          let fx = 0, fy = 0;

          // Repulsion
          for (const other of ns) {
            if (other.id === node.id) continue;
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const dist2 = dx * dx + dy * dy;
            if (dist2 > 0) {
              const rep = 2000 / dist2;
              fx -= (dx / Math.sqrt(dist2)) * rep;
              fy -= (dy / Math.sqrt(dist2)) * rep;
            }
          }

          // Attraction along edges
          for (const edge of es) {
            const isSrc = edge.source === node.id;
            const isTgt = edge.target === node.id;
            if (!isSrc && !isTgt) continue;
            const otherId = isSrc ? edge.target : edge.source;
            const other = ns.find(n => n.id === otherId);
            if (!other) continue;
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
              const optimal = 100;
              const attraction = (dist - optimal) * 0.1 * Math.abs(edge.weight);
              fx += (dx / dist) * attraction;
              fy += (dy / dist) * attraction;
            }
          }

          // Centering
          const dcx = W / 2 - node.x;
          const dcy = H / 2 - node.y;
          const cd = Math.sqrt(dcx * dcx + dcy * dcy);
          if (cd > 0) { fx += (dcx / cd) * 0.01 * cd; fy += (dcy / cd) * 0.01 * cd; }

          node.vx += fx * alpha.v;
          node.vy += fy * alpha.v;
          node.x += node.vx;
          node.y += node.vy;

          const m = 50;
          node.x = Math.max(m, Math.min(W - m, node.x));
          node.y = Math.max(m, Math.min(H - m, node.y));
        }
      }

      alpha.v -= alphaDecay;
      redraw();
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    drawFrame(
      ctx,
      canvas.width / dpr,
      canvas.height / dpr,
      nodesRef.current,
      edgesRef.current,
      panRef.current,
      zoomRef.current,
      selectedNodeRef.current,
      showEdgeWeights,
      dragNodeIdRef.current,
    );
  }, [showEdgeWeights]);

  // Sync zoom/pan refs and redraw
  useEffect(() => { zoomRef.current = zoom; redraw(); }, [zoom, redraw]);
  useEffect(() => { panRef.current = pan; redraw(); }, [pan, redraw]);
  useEffect(() => { selectedNodeRef.current = selectedNode; redraw(); }, [selectedNode, redraw]);
  useEffect(() => { redraw(); }, [showEdgeWeights, redraw]);

  // Resize canvas with DPR
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(containerW * dpr);
    canvas.height = Math.round(canvasH * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }, [containerW, canvasH, redraw]);

  useEffect(() => {
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, []);

  const toLogical = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - panRef.current.y) / zoomRef.current,
    };
  };

  const hitNode = (lx: number, ly: number): NetworkNode | null => {
    for (const node of nodesRef.current) {
      const r = nodeRadius(node);
      const dx = node.x - lx, dy = node.y - ly;
      if (dx * dx + dy * dy <= r * r) return node;
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // drag/pan only with the primary button
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = toLogical(e.clientX, e.clientY);
    const hit = hitNode(x, y);

    if (hit) {
      pointerModeRef.current = 'node';
      dragNodeIdRef.current = hit.id;
      dragStartClientRef.current = { x: e.clientX, y: e.clientY };
      hit.fx = hit.x;
      hit.fy = hit.y;
    } else {
      pointerModeRef.current = 'pan';
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOriginRef.current = { ...panRef.current };
    }
    redraw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerModeRef.current === 'none') return;
    // Stray pointermoves (hover, missed pointerup) arrive with no button held —
    // without this guard they silently pan the graph or drag nodes.
    if (!(e.buttons & 1)) { handlePointerUp(e); return; }
    if (pointerModeRef.current === 'pan') {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const np = { x: panOriginRef.current.x + dx, y: panOriginRef.current.y + dy };
      panRef.current = np;
      setPan(np);
    } else if (pointerModeRef.current === 'node' && dragNodeIdRef.current) {
      const { x, y } = toLogical(e.clientX, e.clientY);
      const node = nodesRef.current.find(n => n.id === dragNodeIdRef.current);
      if (node) {
        node.x = x; node.y = y;
        node.fx = x; node.fy = y;
        node.vx = 0; node.vy = 0;
        redraw();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerModeRef.current === 'node' && dragNodeIdRef.current) {
      // Click (no significant drag) → select node
      const node = nodesRef.current.find(n => n.id === dragNodeIdRef.current);
      if (node) {
        const dx = e.clientX - dragStartClientRef.current.x;
        const dy = e.clientY - dragStartClientRef.current.y;
        const wasDrag = dx * dx + dy * dy > 9; // >3px client movement
        if (!wasDrag) {
          const sel = selectedNodeRef.current === node.id ? null : node.id;
          selectedNodeRef.current = sel;
          setSelectedNode(sel);
        }
        // Release pin so simulation can resume
        node.fx = null; node.fy = null;
      }
      dragNodeIdRef.current = null;
    }
    pointerModeRef.current = 'none';
    redraw();
  };

  const exportToPNG = () => {
    // Render at 2× logical size for crisp export
    const offscreen = document.createElement('canvas');
    offscreen.width = containerW * 2;
    offscreen.height = canvasH * 2;
    const ctx = offscreen.getContext('2d')!;
    ctx.scale(2, 2);
    drawFrame(ctx, containerW, canvasH, nodesRef.current, edgesRef.current, panRef.current, zoomRef.current, selectedNodeRef.current, showEdgeWeights, null);
    const link = document.createElement('a');
    link.download = 'network.png';
    link.href = offscreen.toDataURL();
    link.click();
  };

  const exportToSVG = () => {
    const W = containerW, H = canvasH;
    let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
    edgesRef.current.forEach(edge => {
      const src = nodesRef.current.find(n => n.id === edge.source);
      const tgt = nodesRef.current.find(n => n.id === edge.target);
      if (!src || !tgt) return;
      const w = Math.abs(edge.weight);
      const color = edge.weight > 0 ? '#22c55e' : '#ef4444';
      svg += `<line x1="${src.x}" y1="${src.y}" x2="${tgt.x}" y2="${tgt.y}" stroke="${color}" stroke-width="${Math.max(0.5, w * 3)}" opacity="${Math.min(w, 1)}" />`;
    });
    nodesRef.current.forEach(node => {
      const r = nodeRadius(node);
      const color = node.community != null ? COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length] : '#3b82f6';
      svg += `<circle cx="${node.x}" cy="${node.y}" r="${r}" fill="${color}" stroke="#ffffff" stroke-width="2" />`;
      svg += `<text x="${node.x}" y="${node.y + r + 12}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="bold" fill="#1f2937">${node.id}</text>`;
    });
    svg += '</svg>';
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'network.svg';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setZoom(z => Math.min(z + 0.2, 4))}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(z - 0.2, 0.25))}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            title="Reset View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={exportToPNG}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            PNG
          </button>
          <button
            onClick={exportToSVG}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            SVG
          </button>
        </div>
      </div>

      <div ref={containerRef} className="border border-gray-200 rounded-lg overflow-hidden bg-white w-full">
        <canvas
          ref={canvasRef}
          style={{ width: containerW, height: canvasH, display: 'block' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="cursor-grab active:cursor-grabbing touch-none"
        />
      </div>

      <p className="text-xs text-gray-400 text-center">
        Drag nodes to reposition &middot; Drag canvas to pan &middot; Click node to select
      </p>

      {selectedNode && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-semibold text-blue-900">Selected: {selectedNode}</p>
          {centrality?.[selectedNode] != null && (
            <p className="text-sm text-blue-700 mt-1">Centrality: {centrality[selectedNode].toFixed(3)}</p>
          )}
          {communities?.[selectedNode] != null && (
            <p className="text-sm text-blue-700 mt-1">Community: {(communities[selectedNode]) + 1}</p>
          )}
        </div>
      )}
    </div>
  );
}
