export interface CommunityDetectionResult {
  communities: { [node: string]: number };
  modularity: number;
  nCommunities: number;
  algorithm: string;
  communityLabels: { [communityId: number]: string };
}

export function detectCommunitiesWalktrap(
  adjacency: number[][],
  nodes: string[],
  steps: number = 4
): CommunityDetectionResult {
  const n = nodes.length;

  const distances = calculateRandomWalkDistances(adjacency, steps);

  const communities: number[] = Array(n).fill(0).map((_, i) => i);

  const mergeHistory: Array<{ c1: number; c2: number; dist: number }> = [];

  while (true) {
    let minDist = Infinity;
    let bestPair: [number, number] = [-1, -1];

    const uniqueCommunities = [...new Set(communities)];

    if (uniqueCommunities.length <= 1) break;

    for (let i = 0; i < uniqueCommunities.length; i++) {
      for (let j = i + 1; j < uniqueCommunities.length; j++) {
        const c1 = uniqueCommunities[i];
        const c2 = uniqueCommunities[j];

        const dist = calculateCommunityDistance(distances, communities, c1, c2);

        if (dist < minDist) {
          minDist = dist;
          bestPair = [c1, c2];
        }
      }
    }

    if (bestPair[0] === -1) break;

    for (let i = 0; i < n; i++) {
      if (communities[i] === bestPair[1]) {
        communities[i] = bestPair[0];
      }
    }

    mergeHistory.push({ c1: bestPair[0], c2: bestPair[1], dist: minDist });

    if (uniqueCommunities.length <= 3) break;
  }

  const communityMap: { [node: string]: number } = {};
  const uniqueComms = [...new Set(communities)];
  const commMapping: { [old: number]: number } = {};

  uniqueComms.forEach((comm, idx) => {
    commMapping[comm] = idx;
  });

  nodes.forEach((node, idx) => {
    communityMap[node] = commMapping[communities[idx]];
  });

  const modularity = calculateModularity(adjacency, communityMap, nodes);

  const communityLabels: { [communityId: number]: string } = {};
  uniqueComms.forEach((_, idx) => {
    const nodesInCommunity = nodes.filter(node => communityMap[node] === idx);
    communityLabels[idx] = `Community ${idx + 1} (n=${nodesInCommunity.length})`;
  });

  return {
    communities: communityMap,
    modularity,
    nCommunities: uniqueComms.length,
    algorithm: 'walktrap',
    communityLabels,
  };
}

function calculateRandomWalkDistances(adjacency: number[][], steps: number): number[][] {
  const n = adjacency.length;

  const P = transitionMatrix(adjacency);

  // Compute P^steps directly (walk of exactly `steps` steps)
  let Pk = P;
  for (let step = 1; step < steps; step++) {
    Pk = matrixMultiply(Pk, P);
  }

  // Precompute degrees once
  const degrees = adjacency.map(row => row.reduce((sum, w) => sum + Math.abs(w), 0));

  // Walktrap distance: r(i,j) = sqrt( Σ_k d_k * (P^t[i,k]/sqrt(d_i) - P^t[j,k]/sqrt(d_j))^2 )
  const distances: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (degrees[i] === 0 || degrees[j] === 0) continue;

      let rij = 0;
      for (let k = 0; k < n; k++) {
        if (degrees[k] === 0) continue;
        const diff = Pk[i][k] / Math.sqrt(degrees[i]) - Pk[j][k] / Math.sqrt(degrees[j]);
        rij += degrees[k] * diff * diff;
      }
      distances[i][j] = Math.sqrt(rij);
    }
  }

  return distances;
}

function transitionMatrix(adjacency: number[][]): number[][] {
  const n = adjacency.length;
  const P: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    const degree = adjacency[i].reduce((sum, w) => sum + Math.abs(w), 0);

    if (degree > 0) {
      for (let j = 0; j < n; j++) {
        P[i][j] = Math.abs(adjacency[i][j]) / degree;
      }
    }
  }

  return P;
}

function matrixMultiply(A: number[][], B: number[][]): number[][] {
  const n = A.length;
  const result: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }

  return result;
}

function calculateCommunityDistance(
  distances: number[][],
  communities: number[],
  c1: number,
  c2: number
): number {
  let sum = 0;
  let count = 0;

  for (let i = 0; i < communities.length; i++) {
    if (communities[i] === c1) {
      for (let j = 0; j < communities.length; j++) {
        if (communities[j] === c2) {
          sum += distances[i][j];
          count++;
        }
      }
    }
  }

  return count > 0 ? sum / count : Infinity;
}

export function detectCommunitiesLouvain(
  adjacency: number[][],
  nodes: string[],
  resolution: number = 1.0
): CommunityDetectionResult {
  const n = nodes.length;

  let communities: number[] = Array(n).fill(0).map((_, i) => i);

  const m = adjacency.reduce((sum, row, i) =>
    sum + row.slice(i + 1).reduce((s, w) => s + Math.abs(w), 0), 0
  );

  let improved = true;
  let iteration = 0;

  while (improved && iteration < 100) {
    improved = false;
    iteration++;

    for (let i = 0; i < n; i++) {
      const currentCommunity = communities[i];
      let bestCommunity = currentCommunity;
      let bestGain = 0;

      const neighborCommunities = new Set<number>();
      for (let j = 0; j < n; j++) {
        if (Math.abs(adjacency[i][j]) > 1e-6) {
          neighborCommunities.add(communities[j]);
        }
      }

      for (const targetCommunity of neighborCommunities) {
        if (targetCommunity === currentCommunity) continue;

        const gain = modularityGain(adjacency, communities, i, targetCommunity, m, resolution);

        if (gain > bestGain) {
          bestGain = gain;
          bestCommunity = targetCommunity;
        }
      }

      if (bestCommunity !== currentCommunity) {
        communities[i] = bestCommunity;
        improved = true;
      }
    }
  }

  const uniqueCommunities = [...new Set(communities)];
  const commMapping: { [old: number]: number } = {};

  uniqueCommunities.forEach((comm, idx) => {
    commMapping[comm] = idx;
  });

  const communityMap: { [node: string]: number } = {};
  nodes.forEach((node, idx) => {
    communityMap[node] = commMapping[communities[idx]];
  });

  const modularity = calculateModularity(adjacency, communityMap, nodes);

  const communityLabels: { [communityId: number]: string } = {};
  uniqueCommunities.forEach((_, idx) => {
    const nodesInCommunity = nodes.filter(node => communityMap[node] === idx);
    communityLabels[idx] = `Community ${idx + 1} (n=${nodesInCommunity.length})`;
  });

  return {
    communities: communityMap,
    modularity,
    nCommunities: uniqueCommunities.length,
    algorithm: 'louvain',
    communityLabels,
  };
}

function modularityGain(
  adjacency: number[][],
  communities: number[],
  node: number,
  targetCommunity: number,
  m: number,
  resolution: number
): number {
  const n = adjacency.length;
  const ki = adjacency[node].reduce((sum, w) => sum + Math.abs(w), 0);

  let sigmaTot = 0;
  let kiIn = 0;

  for (let j = 0; j < n; j++) {
    if (communities[j] === targetCommunity) {
      sigmaTot += adjacency[j].reduce((sum, w) => sum + Math.abs(w), 0);

      if (Math.abs(adjacency[node][j]) > 1e-6) {
        kiIn += Math.abs(adjacency[node][j]);
      }
    }
  }

  if (m === 0) return 0;

  return (kiIn - resolution * sigmaTot * ki / (2 * m)) / (2 * m);
}

export function calculateModularity(
  adjacency: number[][],
  communities: { [node: string]: number },
  nodes: string[]
): number {
  const n = nodes.length;
  const m = adjacency.reduce((sum, row, i) =>
    sum + row.slice(i + 1).reduce((s, w) => s + Math.abs(w), 0), 0
  );

  if (m === 0) return 0;

  let Q = 0;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (communities[nodes[i]] === communities[nodes[j]]) {
        const Aij = adjacency[i][j];
        const ki = adjacency[i].reduce((sum, w) => sum + Math.abs(w), 0);
        const kj = adjacency[j].reduce((sum, w) => sum + Math.abs(w), 0);

        Q += Aij - (ki * kj) / (2 * m);
      }
    }
  }

  return Q / (2 * m);
}

export function getCommunityColors(nCommunities: number): string[] {
  const colors = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#84cc16',
  ];

  if (nCommunities <= colors.length) {
    return colors.slice(0, nCommunities);
  }

  const result: string[] = [];
  for (let i = 0; i < nCommunities; i++) {
    const hue = (i * 360) / nCommunities;
    result.push(`hsl(${hue}, 70%, 50%)`);
  }

  return result;
}
