import { ebicGlasso, estimateIsingModel, standardizeData } from './networkEstimation';
import { calculateAllCentrality, CentralityMetrics } from './networkCentrality';

export interface EdgeAccuracyResult {
  edge: string;
  node1: string;
  node2: string;
  weight: number;
  lowerCI: number;
  upperCI: number;
  stable: boolean;
}

export interface CentralityStabilityResult {
  metric: string;
  csCoefficient: number;
  correlations: number[];
  sampleProportions: number[];
  interpretation: string;
}

export interface BootstrapResult {
  edgeAccuracy: EdgeAccuracyResult[];
  centralityStability: CentralityStabilityResult[];
  nBootstraps: number;
  method: string;
}

export function bootstrapEdgeWeights(
  data: number[][],
  variables: string[],
  method: 'ebicglasso' | 'ising',
  nBootstraps: number = 1000,
  ciLevel: number = 0.95,
  gamma: number = 0.5
): EdgeAccuracyResult[] {
  const n = data.length;
  const p = variables.length;

  const originalResult = method === 'ebicglasso'
    ? ebicGlasso(data, variables, gamma)
    : estimateIsingModel(data, variables, gamma);

  const bootstrapWeights: number[][][] = [];

  for (let b = 0; b < nBootstraps; b++) {
    const bootIndices: number[] = [];
    for (let i = 0; i < n; i++) {
      bootIndices.push(Math.floor(Math.random() * n));
    }

    const bootData = bootIndices.map(idx => [...data[idx]]);

    try {
      const bootResult = method === 'ebicglasso'
        ? ebicGlasso(bootData, variables, gamma)
        : estimateIsingModel(bootData, variables, gamma);

      bootstrapWeights.push(bootResult.adjacency);
    } catch (e) {
      continue;
    }
  }

  const edgeAccuracy: EdgeAccuracyResult[] = [];

  for (let i = 0; i < p; i++) {
    for (let j = i + 1; j < p; j++) {
      const originalWeight = originalResult.adjacency[i][j];

      if (Math.abs(originalWeight) > 1e-6) {
        const bootWeights = bootstrapWeights.map(adj => adj[i][j]);
        bootWeights.sort((a, b) => a - b);

        const alpha = 1 - ciLevel;
        const lowerIdx = Math.floor(bootWeights.length * (alpha / 2));
        const upperIdx = Math.floor(bootWeights.length * (1 - alpha / 2));

        const lowerCI = bootWeights[lowerIdx];
        const upperCI = bootWeights[upperIdx];

        const stable = (lowerCI > 0 && upperCI > 0) || (lowerCI < 0 && upperCI < 0);

        edgeAccuracy.push({
          edge: `${variables[i]}--${variables[j]}`,
          node1: variables[i],
          node2: variables[j],
          weight: originalWeight,
          lowerCI,
          upperCI,
          stable,
        });
      }
    }
  }

  return edgeAccuracy;
}

export function caseDropBootstrap(
  data: number[][],
  variables: string[],
  method: 'ebicglasso' | 'ising',
  sampleProportions: number[] = [0.25, 0.5, 0.75],
  nBootstraps: number = 100,
  gamma: number = 0.5
): CentralityStabilityResult[] {
  const n = data.length;

  const originalResult = method === 'ebicglasso'
    ? ebicGlasso(data, variables, gamma)
    : estimateIsingModel(data, variables, gamma);

  const originalCentrality = calculateAllCentrality(originalResult.adjacency, variables);

  const metrics: (keyof Omit<CentralityMetrics, 'node' | 'bridgeStrength'>)[] = [
    'strength',
    'betweenness',
    'closeness',
    'expectedInfluence'
  ];

  const stabilityResults: CentralityStabilityResult[] = [];

  for (const metric of metrics) {
    const correlations: number[] = [];

    for (const proportion of sampleProportions) {
      const subsampleSize = Math.floor(n * proportion);
      const subsampleCorrelations: number[] = [];

      for (let b = 0; b < nBootstraps; b++) {
        const indices = Array.from({ length: n }, (_, i) => i);
        // Fisher-Yates shuffle for unbiased random permutation
        for (let k = indices.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1));
          [indices[k], indices[r]] = [indices[r], indices[k]];
        }
        const subsampleIndices = indices.slice(0, subsampleSize);

        const subsampleData = subsampleIndices.map(idx => [...data[idx]]);

        try {
          const subsampleResult = method === 'ebicglasso'
            ? ebicGlasso(subsampleData, variables, gamma)
            : estimateIsingModel(subsampleData, variables, gamma);

          const subsampleCentrality = calculateAllCentrality(subsampleResult.adjacency, variables);

          const originalValues = originalCentrality.map(c => c[metric] as number);
          const subsampleValues = subsampleCentrality.map(c => c[metric] as number);

          const corr = calculateCorrelation(originalValues, subsampleValues);
          subsampleCorrelations.push(corr);
        } catch (e) {
          continue;
        }
      }

      const avgCorr = subsampleCorrelations.reduce((a, b) => a + b, 0) / subsampleCorrelations.length;
      correlations.push(avgCorr);
    }

    let csCoefficient = 0;
    for (let i = 0; i < correlations.length; i++) {
      if (correlations[i] >= 0.7) {
        csCoefficient = Math.max(csCoefficient, sampleProportions[i]);
      }
    }

    let interpretation = '';
    if (csCoefficient >= 0.5) {
      interpretation = 'High stability - centrality order likely to remain stable';
    } else if (csCoefficient >= 0.25) {
      interpretation = 'Moderate stability - interpret centrality with caution';
    } else {
      interpretation = 'Low stability - centrality order should not be interpreted';
    }

    stabilityResults.push({
      metric,
      csCoefficient,
      correlations,
      sampleProportions,
      interpretation,
    });
  }

  return stabilityResults;
}

function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;

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

  if (denomX === 0 || denomY === 0) return 0;

  return numerator / Math.sqrt(denomX * denomY);
}

export function performFullBootstrapAnalysis(
  data: number[][],
  variables: string[],
  method: 'ebicglasso' | 'ising',
  gamma: number = 0.5,
  nBootstraps: number = 1000,
  onProgress?: (progress: number, stage: string) => void
): BootstrapResult {
  onProgress?.(0, 'Computing edge accuracy...');

  const edgeAccuracy = bootstrapEdgeWeights(
    data,
    variables,
    method,
    nBootstraps,
    0.95,
    gamma
  );

  onProgress?.(50, 'Computing centrality stability...');

  const centralityStability = caseDropBootstrap(
    data,
    variables,
    method,
    [0.25, 0.5, 0.75],
    Math.min(100, nBootstraps / 10),
    gamma
  );

  onProgress?.(100, 'Bootstrap analysis complete');

  return {
    edgeAccuracy,
    centralityStability,
    nBootstraps,
    method,
  };
}

export function interpretStability(bootstrapResult: BootstrapResult): {
  overallStability: 'high' | 'moderate' | 'low';
  recommendations: string[];
  warnings: string[];
} {
  const recommendations: string[] = [];
  const warnings: string[] = [];

  const avgCS = bootstrapResult.centralityStability.reduce(
    (sum, s) => sum + s.csCoefficient, 0
  ) / bootstrapResult.centralityStability.length;

  const unstableEdges = bootstrapResult.edgeAccuracy.filter(e => !e.stable).length;
  const totalEdges = bootstrapResult.edgeAccuracy.length;
  const stableEdgeRatio = totalEdges > 0 ? 1 - (unstableEdges / totalEdges) : 0;

  let overallStability: 'high' | 'moderate' | 'low';

  if (avgCS >= 0.5 && stableEdgeRatio >= 0.7) {
    overallStability = 'high';
    recommendations.push('Network structure appears robust and reliable');
    recommendations.push('Both edge weights and centrality metrics are stable');
  } else if (avgCS >= 0.25 && stableEdgeRatio >= 0.5) {
    overallStability = 'moderate';
    recommendations.push('Interpret results with appropriate caution');
    warnings.push('Consider increasing sample size for more stable estimates');
  } else {
    overallStability = 'low';
    warnings.push('Network estimates are unstable - interpret with extreme caution');
    warnings.push('Sample size may be insufficient for reliable network estimation');
    warnings.push('Consider collecting more data before drawing substantive conclusions');
  }

  if (unstableEdges > totalEdges * 0.3) {
    warnings.push(`${unstableEdges} of ${totalEdges} edges have confidence intervals crossing zero`);
  }

  for (const cs of bootstrapResult.centralityStability) {
    if (cs.csCoefficient < 0.25) {
      warnings.push(`${cs.metric} centrality shows low stability (CS=${cs.csCoefficient.toFixed(2)})`);
    }
  }

  return {
    overallStability,
    recommendations,
    warnings,
  };
}
