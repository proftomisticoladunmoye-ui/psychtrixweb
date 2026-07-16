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

  let communities: number[] = Array(n).fill(0).map((_, i) => i);

  // Agglomerate all the way to one community, keeping a snapshot at every
  // level; the returned partition is the cut with MAXIMUM modularity
  // (Pons & Latapy, 2005) — not an arbitrary fixed community count.
  const snapshots: number[][] = [communities.slice()];

  while (new Set(communities).size > 1) {
    let minDist = Infinity;
    let bestPair: [number, number] = [-1, -1];

    const uniqueCommunities = [...new Set(communities)];
    for (let i = 0; i < uniqueCommunities.length; i++) {
      for (let j = i + 1; j < uniqueCommunities.length; j++) {
        const dist = calculateCommunityDistance(distances, communities, uniqueCommunities[i], uniqueCommunities[j]);
        if (dist < minDist) {
          minDist = dist;
          bestPair = [uniqueCommunities[i], uniqueCommunities[j]];
        }
      }
    }
    if (bestPair[0] === -1) break;

    communities = communities.map(c => (c === bestPair[1] ? bestPair[0] : c));
    snapshots.push(communities.slice());
  }

  // Pick the max-modularity level.
  const modularityOf = (assign: number[]): number => {
    const map: { [node: string]: number } = {};
    nodes.forEach((node, idx) => { map[node] = assign[idx]; });
    return calculateModularity(adjacency, map, nodes);
  };
  let best = snapshots[0];
  let bestQ = -Infinity;
  for (const snap of snapshots) {
    const q = modularityOf(snap);
    if (q > bestQ) { bestQ = q; best = snap; }
  }
  communities = best;

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

  // Walktrap distance (Pons & Latapy, 2005, eq. 3):
  //   r(i,j) = sqrt( Σ_k (P^t[i,k] − P^t[j,k])² / d(k) )
  // The previous version multiplied by d(k) and rescaled the rows by sqrt(d),
  // which distorts the metric and produces wrong merges.
  const distances: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (degrees[i] === 0 || degrees[j] === 0) continue;

      let rij = 0;
      for (let k = 0; k < n; k++) {
        if (degrees[k] === 0) continue;
        const diff = Pk[i][k] - Pk[j][k];
        rij += (diff * diff) / degrees[k];
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

  // Node degrees (sum of absolute edge weights).
  const k = adjacency.map(row => row.reduce((s, w) => s + Math.abs(w), 0));

  let improved = true;
  let iteration = 0;

  while (improved && iteration < 100) {
    improved = false;
    iteration++;

    for (let i = 0; i < n; i++) {
      const currentCommunity = communities[i];

      // Standard Louvain move: take the node OUT of its community first, then
      // evaluate the modularity gain of inserting it into each candidate
      // community (including the one it came from). The previous version only
      // scored joining and ignored the cost of leaving, so moves were wrong.
      communities[i] = -1;

      const candidates = new Set<number>([currentCommunity]);
      for (let j = 0; j < n; j++) {
        if (j !== i && Math.abs(adjacency[i][j]) > 1e-6) candidates.add(communities[j]);
      }
      candidates.delete(-1);

      let bestCommunity = currentCommunity;
      let bestGain = -Infinity;
      for (const c of candidates) {
        let kiIn = 0;
        let sigmaTot = 0;
        for (let j = 0; j < n; j++) {
          if (communities[j] === c) {
            kiIn += Math.abs(adjacency[i][j]);
            sigmaTot += k[j];
          }
        }
        const gain = m > 0 ? kiIn - (resolution * sigmaTot * k[i]) / (2 * m) : 0;
        if (gain > bestGain + 1e-12) {
          bestGain = gain;
          bestCommunity = c;
        }
      }

      communities[i] = bestCommunity;
      if (bestCommunity !== currentCommunity) improved = true;
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
