import { ebicGlasso, estimateIsingModel, calculateGlobalStrength } from './networkEstimation';

export interface NCTResult {
  globalTest: {
    observedDiff: number;
    pValue: number;
    significant: boolean;
  };
  edgeTests: EdgeComparisonResult[];
  networkInvariance: boolean;
  method: string;
}

export interface EdgeComparisonResult {
  edge: string;
  node1: string;
  node2: string;
  weight1: number;
  weight2: number;
  difference: number;
  pValue: number;
  significant: boolean;
}

export function networkComparisonTest(
  data1: number[][],
  data2: number[][],
  variables: string[],
  method: 'ebicglasso' | 'ising',
  gamma: number = 0.5,
  nPermutations: number = 1000,
  alpha: number = 0.05
): NCTResult {
  const network1 = method === 'ebicglasso'
    ? ebicGlasso(data1, variables, gamma)
    : estimateIsingModel(data1, variables, gamma);

  const network2 = method === 'ebicglasso'
    ? ebicGlasso(data2, variables, gamma)
    : estimateIsingModel(data2, variables, gamma);

  const observedGlobalDiff = Math.abs(
    calculateGlobalStrength(network1.adjacency) -
    calculateGlobalStrength(network2.adjacency)
  );

  const combinedData = [...data1, ...data2];
  const n1 = data1.length;
  const n2 = data2.length;

  const permutedGlobalDiffs: number[] = [];

  for (let p = 0; p < nPermutations; p++) {
    const shuffled = [...combinedData];
    for (let k = shuffled.length - 1; k > 0; k--) {
      const r = Math.floor(Math.random() * (k + 1));
      [shuffled[k], shuffled[r]] = [shuffled[r], shuffled[k]];
    }

    const perm1 = shuffled.slice(0, n1);
    const perm2 = shuffled.slice(n1);

    try {
      const permNet1 = method === 'ebicglasso'
        ? ebicGlasso(perm1, variables, gamma)
        : estimateIsingModel(perm1, variables, gamma);

      const permNet2 = method === 'ebicglasso'
        ? ebicGlasso(perm2, variables, gamma)
        : estimateIsingModel(perm2, variables, gamma);

      const permDiff = Math.abs(
        calculateGlobalStrength(permNet1.adjacency) -
        calculateGlobalStrength(permNet2.adjacency)
      );

      permutedGlobalDiffs.push(permDiff);
    } catch (e) {
      continue;
    }
  }

  const globalPValue = permutedGlobalDiffs.filter(d => d >= observedGlobalDiff).length / permutedGlobalDiffs.length;
  const globalSignificant = globalPValue < alpha;

  const edgeTests: EdgeComparisonResult[] = [];
  const p = variables.length;

  for (let i = 0; i < p; i++) {
    for (let j = i + 1; j < p; j++) {
      const weight1 = network1.adjacency[i][j];
      const weight2 = network2.adjacency[i][j];

      if (Math.abs(weight1) > 1e-6 || Math.abs(weight2) > 1e-6) {
        const observedEdgeDiff = Math.abs(weight1 - weight2);

        const permutedEdgeDiffs: number[] = [];

        for (let perm = 0; perm < Math.min(500, nPermutations); perm++) {
          const shuffled = [...combinedData];
          for (let k = shuffled.length - 1; k > 0; k--) {
            const r = Math.floor(Math.random() * (k + 1));
            [shuffled[k], shuffled[r]] = [shuffled[r], shuffled[k]];
          }
          const perm1 = shuffled.slice(0, n1);
          const perm2 = shuffled.slice(n1);

          try {
            const permNet1 = method === 'ebicglasso'
              ? ebicGlasso(perm1, variables, gamma)
              : estimateIsingModel(perm1, variables, gamma);

            const permNet2 = method === 'ebicglasso'
              ? ebicGlasso(perm2, variables, gamma)
              : estimateIsingModel(perm2, variables, gamma);

            const permDiff = Math.abs(permNet1.adjacency[i][j] - permNet2.adjacency[i][j]);
            permutedEdgeDiffs.push(permDiff);
          } catch (e) {
            continue;
          }
        }

        const edgePValue = permutedEdgeDiffs.length > 0
          ? permutedEdgeDiffs.filter(d => d >= observedEdgeDiff).length / permutedEdgeDiffs.length
          : 1;

        const bonferroniAlpha = alpha / ((p * (p - 1)) / 2);
        const edgeSignificant = edgePValue < bonferroniAlpha;

        edgeTests.push({
          edge: `${variables[i]}--${variables[j]}`,
          node1: variables[i],
          node2: variables[j],
          weight1,
          weight2,
          difference: weight1 - weight2,
          pValue: edgePValue,
          significant: edgeSignificant,
        });
      }
    }
  }

  const networkInvariance = !globalSignificant && edgeTests.every(e => !e.significant);

  return {
    globalTest: {
      observedDiff: observedGlobalDiff,
      pValue: globalPValue,
      significant: globalSignificant,
    },
    edgeTests,
    networkInvariance,
    method,
  };
}

export function compareNetworkDensity(
  adjacency1: number[][],
  adjacency2: number[][]
): {
  density1: number;
  density2: number;
  difference: number;
} {
  const n = adjacency1.length;

  let edges1 = 0;
  let edges2 = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(adjacency1[i][j]) > 1e-6) edges1++;
      if (Math.abs(adjacency2[i][j]) > 1e-6) edges2++;
    }
  }

  const possibleEdges = (n * (n - 1)) / 2;
  const density1 = edges1 / possibleEdges;
  const density2 = edges2 / possibleEdges;

  return {
    density1,
    density2,
    difference: density1 - density2,
  };
}

export function calculateJaccardSimilarity(
  adjacency1: number[][],
  adjacency2: number[][]
): number {
  const n = adjacency1.length;
  let intersection = 0;
  let union = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const edge1 = Math.abs(adjacency1[i][j]) > 1e-6;
      const edge2 = Math.abs(adjacency2[i][j]) > 1e-6;

      if (edge1 && edge2) intersection++;
      if (edge1 || edge2) union++;
    }
  }

  return union > 0 ? intersection / union : 0;
}

export function calculateCorrelationOfEdges(
  adjacency1: number[][],
  adjacency2: number[][]
): number {
  const n = adjacency1.length;
  const edges1: number[] = [];
  const edges2: number[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges1.push(adjacency1[i][j]);
      edges2.push(adjacency2[i][j]);
    }
  }

  const mean1 = edges1.reduce((a, b) => a + b, 0) / edges1.length;
  const mean2 = edges2.reduce((a, b) => a + b, 0) / edges2.length;

  let numerator = 0;
  let denom1 = 0;
  let denom2 = 0;

  for (let i = 0; i < edges1.length; i++) {
    const d1 = edges1[i] - mean1;
    const d2 = edges2[i] - mean2;
    numerator += d1 * d2;
    denom1 += d1 * d1;
    denom2 += d2 * d2;
  }

  if (denom1 === 0 || denom2 === 0) return 0;

  return numerator / Math.sqrt(denom1 * denom2);
}

export interface NetworkComparisonSummary {
  globalStrengthDiff: number;
  globalStrengthPValue: number;
  networkInvariant: boolean;
  significantEdges: number;
  totalEdges: number;
  densityDiff: number;
  jaccardSimilarity: number;
  edgeCorrelation: number;
  interpretation: string;
}

export function summarizeNCT(nctResult: NCTResult, adjacency1: number[][], adjacency2: number[][]): NetworkComparisonSummary {
  const densityComparison = compareNetworkDensity(adjacency1, adjacency2);
  const jaccardSim = calculateJaccardSimilarity(adjacency1, adjacency2);
  const edgeCor = calculateCorrelationOfEdges(adjacency1, adjacency2);

  const significantEdges = nctResult.edgeTests.filter(e => e.significant).length;

  let interpretation = '';
  if (nctResult.networkInvariance) {
    interpretation = 'Networks are statistically equivalent - no significant differences detected';
  } else if (nctResult.globalTest.significant) {
    interpretation = `Networks differ in global strength (p = ${nctResult.globalTest.pValue.toFixed(4)})`;
    if (significantEdges > 0) {
      interpretation += `. ${significantEdges} specific edges show significant differences`;
    }
  } else if (significantEdges > 0) {
    interpretation = `${significantEdges} edges differ significantly between networks, though global strength is similar`;
  }

  return {
    globalStrengthDiff: nctResult.globalTest.observedDiff,
    globalStrengthPValue: nctResult.globalTest.pValue,
    networkInvariant: nctResult.networkInvariance,
    significantEdges,
    totalEdges: nctResult.edgeTests.length,
    densityDiff: densityComparison.difference,
    jaccardSimilarity: jaccardSim,
    edgeCorrelation: edgeCor,
    interpretation,
  };
}
