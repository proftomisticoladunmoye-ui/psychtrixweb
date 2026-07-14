export interface CentralityMetrics {
  node: string;
  strength: number;
  betweenness: number;
  closeness: number;
  expectedInfluence: number;
  bridgeStrength?: number;
}

export function calculateStrength(adjacency: number[][], nodeIndex: number): number {
  let strength = 0;
  for (let j = 0; j < adjacency.length; j++) {
    if (j !== nodeIndex) {
      strength += Math.abs(adjacency[nodeIndex][j]);
    }
  }
  return strength;
}

export function calculateExpectedInfluence(adjacency: number[][], nodeIndex: number): number {
  let ei = 0;
  for (let j = 0; j < adjacency.length; j++) {
    if (j !== nodeIndex) {
      ei += adjacency[nodeIndex][j];
    }
  }
  return ei;
}

export function calculateAllShortestPaths(adjacency: number[][]): number[][] {
  const n = adjacency.length;
  const dist: number[][] = Array(n).fill(0).map(() => Array(n).fill(Infinity));

  for (let i = 0; i < n; i++) {
    dist[i][i] = 0;
    for (let j = 0; j < n; j++) {
      if (i !== j && Math.abs(adjacency[i][j]) > 1e-6) {
        dist[i][j] = 1;
      }
    }
  }

  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j];
        }
      }
    }
  }

  return dist;
}

export function calculateBetweenness(adjacency: number[][], nodeIndex: number): number {
  const n = adjacency.length;

  let betweenness = 0;

  // Brandes (2001) algorithm: for each source s, BFS to compute
  // sigma[v] = #shortest paths from s to v, then back-accumulate pair dependencies
  for (let s = 0; s < n; s++) {
    if (s === nodeIndex) continue;

    const sigma: number[] = Array(n).fill(0);
    const delta: number[] = Array(n).fill(0);
    const P: number[][] = Array(n).fill(0).map(() => []);
    const d: number[] = Array(n).fill(-1);

    sigma[s] = 1;
    d[s] = 0;

    const Q: number[] = [s];
    const S: number[] = [];

    // BFS forward pass
    while (Q.length > 0) {
      const v = Q.shift()!;
      S.push(v);

      for (let w = 0; w < n; w++) {
        if (Math.abs(adjacency[v][w]) < 1e-6) continue;

        if (d[w] < 0) {
          Q.push(w);
          d[w] = d[v] + 1;
        }

        if (d[w] === d[v] + 1) {
          sigma[w] += sigma[v];
          P[w].push(v);
        }
      }
    }

    // Back-propagation: accumulate pair-dependency for ALL nodes
    while (S.length > 0) {
      const w = S.pop()!;
      for (const v of P[w]) {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      }
      // Accumulate betweenness only for the target node (w ≠ source)
      if (w !== s && w === nodeIndex) {
        betweenness += delta[w];
      }
    }
  }

  // Normalise: divide by (n-1)(n-2)/2 for undirected networks
  const normalization = ((n - 1) * (n - 2)) / 2;
  return normalization > 0 ? betweenness / normalization : 0;
}

export function calculateCloseness(adjacency: number[][], nodeIndex: number): number {
  const dist = calculateAllShortestPaths(adjacency);
  const n = adjacency.length;

  let sum = 0;
  let reachable = 0;

  for (let j = 0; j < n; j++) {
    if (j !== nodeIndex && dist[nodeIndex][j] !== Infinity) {
      sum += dist[nodeIndex][j];
      reachable++;
    }
  }

  if (reachable === 0 || sum === 0) return 0;

  return (reachable / (n - 1)) * (reachable / sum);
}

export function calculateBridgeStrength(
  adjacency: number[][],
  nodeIndex: number,
  communities: { [node: string]: number },
  nodes: string[]
): number {
  const nodeCommunity = communities[nodes[nodeIndex]];

  let bridgeStrength = 0;
  for (let j = 0; j < adjacency.length; j++) {
    if (j !== nodeIndex) {
      const neighborCommunity = communities[nodes[j]];
      if (neighborCommunity !== nodeCommunity && Math.abs(adjacency[nodeIndex][j]) > 1e-6) {
        bridgeStrength += Math.abs(adjacency[nodeIndex][j]);
      }
    }
  }

  return bridgeStrength;
}

export function calculateAllCentrality(
  adjacency: number[][],
  nodes: string[],
  communities?: { [node: string]: number }
): CentralityMetrics[] {
  const n = nodes.length;
  const centrality: CentralityMetrics[] = [];

  for (let i = 0; i < n; i++) {
    const metrics: CentralityMetrics = {
      node: nodes[i],
      strength: calculateStrength(adjacency, i),
      betweenness: calculateBetweenness(adjacency, i),
      closeness: calculateCloseness(adjacency, i),
      expectedInfluence: calculateExpectedInfluence(adjacency, i),
    };

    if (communities) {
      metrics.bridgeStrength = calculateBridgeStrength(adjacency, i, communities, nodes);
    }

    centrality.push(metrics);
  }

  return centrality;
}

export function standardizeCentrality(centrality: CentralityMetrics[]): CentralityMetrics[] {
  const metrics: (keyof Omit<CentralityMetrics, 'node'>)[] = [
    'strength',
    'betweenness',
    'closeness',
    'expectedInfluence'
  ];

  const standardized = centrality.map(c => ({ ...c }));

  for (const metric of metrics) {
    const values = centrality.map(c => c[metric] as number);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const sd = Math.sqrt(variance);

    if (sd > 0) {
      standardized.forEach((c, i) => {
        (c[metric] as number) = ((centrality[i][metric] as number) - mean) / sd;
      });
    }
  }

  return standardized;
}

export function rankCentrality(
  centrality: CentralityMetrics[],
  metric: keyof Omit<CentralityMetrics, 'node'>
): CentralityMetrics[] {
  return [...centrality].sort((a, b) => (b[metric] as number) - (a[metric] as number));
}

export interface CentralityStability {
  metric: string;
  correlations: number[];
  csCoefficient: number;
  sampleSizeThresholds: number[];
}

export function calculateCentralityStability(
  originalCentrality: CentralityMetrics[],
  bootstrapCentralities: CentralityMetrics[][],
  sampleProportions: number[]
): CentralityStability[] {
  const metrics: (keyof Omit<CentralityMetrics, 'node' | 'bridgeStrength'>)[] = [
    'strength',
    'betweenness',
    'closeness',
    'expectedInfluence'
  ];

  const results: CentralityStability[] = [];

  for (const metric of metrics) {
    const originalValues = originalCentrality.map(c => c[metric] as number);
    const correlations: number[] = [];

    for (const bootCent of bootstrapCentralities) {
      const bootValues = bootCent.map(c => c[metric] as number);
      correlations.push(calculateCorrelation(originalValues, bootValues));
    }

    const csCoefficient = calculateCSCoefficient(correlations, sampleProportions);

    results.push({
      metric,
      correlations,
      csCoefficient,
      sampleSizeThresholds: sampleProportions,
    });
  }

  return results;
}

function calculateCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  return numerator / Math.sqrt(denomX * denomY);
}

function calculateCSCoefficient(correlations: number[], proportions: number[]): number {
  let csCoeff = 0;
  for (let i = 0; i < correlations.length; i++) {
    if (correlations[i] >= 0.7) {
      csCoeff = Math.max(csCoeff, proportions[i]);
    }
  }
  return csCoeff;
}
