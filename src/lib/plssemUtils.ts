export interface PLSSEMConstruct {
  id: string;
  name: string;
  type: 'reflective' | 'formative';
  order: 1 | 2 | 3;
  indicators: string[];
  higherOrderOf?: string[];
}

export interface PLSSEMPath {
  from: string;
  to: string;
  coefficient?: number;
  tValue?: number;
  pValue?: number;
  ci?: [number, number];
}

export interface PLSSEMModel {
  constructs: PLSSEMConstruct[];
  paths: PLSSEMPath[];
  groupVariable?: string;
}

export interface MeasurementModelResults {
  reflective: {
    [construct: string]: {
      indicators: Array<{
        name: string;
        loading: number;
        tValue: number;
        pValue: number;
        reliability: number;
      }>;
      cronbachAlpha: number;
      compositeReliability: number;
      rhoA: number;
      ave: number;
    };
  };
  formative: {
    [construct: string]: {
      indicators: Array<{
        name: string;
        weight: number;
        loading: number;
        tValue: number;
        pValue: number;
        vif: number;
      }>;
    };
  };
  discriminantValidity: {
    fornellLarcker: number[][];
    htmt: number[][];
    constructNames: string[];
  };
}

export interface StructuralModelResults {
  paths: PLSSEMPath[];
  rSquared: { [construct: string]: number };
  adjustedRSquared: { [construct: string]: number };
  fSquared: { [path: string]: number };
  vif: { [construct: string]: number };
  qSquared: { [construct: string]: number };
  globalFit: {
    srmr: number;
    nfi: number;
    dULS: number;
    dG: number;
  };
}

export function calculateCorrelationMatrix(data: number[][]): number[][] {
  if (!data || data.length === 0 || !data[0]) {
    return [];
  }

  const n = data.length;
  const m = data[0].length;
  const corr: number[][] = [];

  for (let i = 0; i < m; i++) {
    corr[i] = [];
    for (let j = 0; j < m; j++) {
      if (i === j) {
        corr[i][j] = 1;
      } else {
        const xi = data.map(row => row[i]).filter(v => isFinite(v));
        const xj = data.map(row => row[j]).filter(v => isFinite(v));
        corr[i][j] = pearsonCorrelation(xi, xj);
      }
    }
  }

  return corr;
}

export function pearsonCorrelation(x: number[], y: number[]): number {
  if (!x || !y || x.length === 0 || y.length === 0 || x.length !== y.length) {
    return 0;
  }

  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

export function standardize(data: number[][]): number[][] {
  if (!data || data.length === 0 || !data[0]) {
    return [];
  }

  const standardized: number[][] = [];
  const m = data[0].length;

  for (let j = 0; j < m; j++) {
    const col = data.map(row => row[j]).filter(v => isFinite(v));
    if (col.length === 0) continue;

    const mean = col.reduce((a, b) => a + b, 0) / col.length;
    const std = Math.sqrt(
      col.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / Math.max(1, col.length - 1)
    );

    data.forEach((row, i) => {
      if (!standardized[i]) standardized[i] = [];
      standardized[i][j] = std === 0 ? 0 : (row[j] - mean) / std;
    });
  }

  return standardized;
}

function multipleRegression(y: number[], X: number[][]): number[] {
  if (!y || y.length === 0 || !X || X.length === 0 || !X[0] || X[0].length === 0) return [];
  const n = y.length;
  const m = X[0].length;

  const XtX: number[][] = Array(m).fill(0).map(() => Array(m).fill(0));
  const Xty: number[] = Array(m).fill(0);

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      for (let k = 0; k < n; k++) {
        XtX[i][j] += X[k][i] * X[k][j];
      }
    }
    for (let k = 0; k < n; k++) {
      Xty[i] += X[k][i] * y[k];
    }
  }

  const coefficients = solveLinearSystem(XtX, Xty);
  return coefficients;
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }

    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    if (Math.abs(augmented[i][i]) < 1e-10) continue;

    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }

  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= augmented[i][j] * x[j];
    }
    if (Math.abs(augmented[i][i]) > 1e-10) {
      x[i] /= augmented[i][i];
    }
  }

  return x;
}

export function runPLSAlgorithm(
  data: number[][],
  model: PLSSEMModel,
  settings: {
    weightingScheme: 'centroid' | 'factorial' | 'path';
    maxIterations: number;
    convergenceCriterion: number;
  },
  columns?: string[]
): {
  outerWeights: { [construct: string]: number[] };
  innerWeights: { [construct: string]: number };
  latentScores: { [construct: string]: number[] };
  converged: boolean;
  iterations: number;
} {
  const { weightingScheme, maxIterations, convergenceCriterion } = settings;
  const constructs = model.constructs;
  const n = data.length;

  const standardizedData = standardize(data);

  const indicatorIndices: { [constructId: string]: number[] } = {};

  if (columns && columns.length > 0) {
    constructs.forEach(construct => {
      indicatorIndices[construct.id] = construct.indicators.map(indName => {
        const idx = columns.indexOf(indName);
        if (idx === -1) {
          console.warn(`Indicator "${indName}" not found in dataset columns. Using sequential index as fallback.`);
          return 0;
        }
        return idx;
      });
    });
  } else {
    let currentIdx = 0;
    constructs.forEach(construct => {
      indicatorIndices[construct.id] = construct.indicators.map(() => currentIdx++);
    });
  }

  let outerWeights: { [construct: string]: number[] } = {};
  let latentScores: { [construct: string]: number[] } = {};

  constructs.forEach(construct => {
    outerWeights[construct.id] = construct.indicators.map(() => 1 / Math.sqrt(construct.indicators.length));
  });

  let converged = false;
  let iterations = 0;

  for (iterations = 0; iterations < maxIterations; iterations++) {
    const oldWeights = JSON.parse(JSON.stringify(outerWeights));

    constructs.forEach(construct => {
      const indices = indicatorIndices[construct.id];
      const scores: number[] = new Array(n).fill(0);

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < indices.length; j++) {
          scores[i] += standardizedData[i][indices[j]] * outerWeights[construct.id][j];
        }
      }

      // Standardize to mean=0, sd=1 so inner correlations are well-defined
      const mean = scores.reduce((a, b) => a + b, 0) / n;
      const sd = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1));
      latentScores[construct.id] = scores.map(s => sd > 0 ? (s - mean) / sd : 0);
    });

    // Step 2: Inner approximation — compute inner proxy z̃_j = Σ_i e_ij * z_i
    // where e_ij = inner weight for adjacent construct i with respect to j
    // Lohmöller (1989): path weighting, centroid, or factorial scheme
    const innerProxyScores: { [constructId: string]: number[] } = {};

    constructs.forEach(construct => {
      const predecessors = model.paths.filter(p => p.to === construct.id).map(p => p.from);
      const successors = model.paths.filter(p => p.from === construct.id).map(p => p.to);

      if (predecessors.length === 0 && successors.length === 0) {
        // Isolated construct: inner proxy = outer latent score (no adjacent constructs)
        innerProxyScores[construct.id] = [...latentScores[construct.id]];
        return;
      }

      // Build inner weights (scalars) for each adjacent construct
      const innerWeightMap: { [connectedId: string]: number } = {};

      predecessors.forEach(connectedId => {
        const corr = pearsonCorrelation(latentScores[construct.id], latentScores[connectedId]);
        if (weightingScheme === 'centroid') {
          innerWeightMap[connectedId] = Math.sign(corr);
        } else if (weightingScheme === 'factorial') {
          innerWeightMap[connectedId] = corr;
        } else {
          // Path weighting — predecessor: use OLS regression weight (corr for simple regression)
          innerWeightMap[connectedId] = corr;
        }
      });

      successors.forEach(connectedId => {
        const corr = pearsonCorrelation(latentScores[construct.id], latentScores[connectedId]);
        if (weightingScheme === 'centroid') {
          innerWeightMap[connectedId] = Math.sign(corr);
        } else if (weightingScheme === 'factorial') {
          innerWeightMap[connectedId] = corr;
        } else {
          // Path weighting — successor: sign of correlation (Lohmöller 1989)
          innerWeightMap[connectedId] = Math.sign(corr);
        }
      });

      // For path weighting with multiple predecessors: use regression coefficients
      if (weightingScheme === 'path' && predecessors.length > 1) {
        const yScores = latentScores[construct.id];
        const X: number[][] = [];
        for (let i = 0; i < n; i++) {
          X[i] = predecessors.map(pid => latentScores[pid]?.[i] || 0);
        }
        try {
          const coeffs = multipleRegression(yScores, X);
          predecessors.forEach((pid, k) => { innerWeightMap[pid] = coeffs[k]; });
        } catch { /* keep correlation-based weights */ }
      }

      // Inner proxy: z̃_j = Σ_i e_ij * z_i (weighted sum of adjacent latent scores)
      const proxy: number[] = new Array(n).fill(0);
      for (const [connectedId, w] of Object.entries(innerWeightMap)) {
        const connectedScores = latentScores[connectedId];
        if (!connectedScores) continue;
        for (let i = 0; i < n; i++) {
          proxy[i] += w * connectedScores[i];
        }
      }
      innerProxyScores[construct.id] = proxy;
    });

    // Step 3: Update outer weights using inner proxy scores
    // Reflective: w_j = (1/n) * X_j' * z̃_j  (unnormalized, then scale so E[z_j²] ≈ 1)
    // Formative:  w_j = (X_j'X_j)^{-1} X_j' z̃_j  (OLS coefficients)
    constructs.forEach(construct => {
      const indices = indicatorIndices[construct.id];
      const proxy = innerProxyScores[construct.id] || latentScores[construct.id];

      if (construct.type === 'reflective') {
        // Outer weights ∝ covariance(indicator, inner proxy)
        const newWeights: number[] = indices.map(colIdx => {
          const col = standardizedData.map(row => row[colIdx]);
          return pearsonCorrelation(col, proxy);
        });
        // Normalize so the resulting latent score has unit variance
        const norm = Math.sqrt(newWeights.reduce((s, w) => s + w * w, 0));
        outerWeights[construct.id] = newWeights.map(w => norm > 0 ? w / norm : 0);
      } else {
        // Formative: OLS of inner proxy on standardized indicators (no intercept)
        const X: number[][] = new Array(n);
        for (let i = 0; i < n; i++) {
          X[i] = indices.map(idx => standardizedData[i][idx]);
        }
        try {
          outerWeights[construct.id] = multipleRegression(proxy, X);
        } catch {
          // Fallback: use correlations
          outerWeights[construct.id] = indices.map(colIdx => {
            const col = standardizedData.map(row => row[colIdx]);
            return pearsonCorrelation(col, proxy);
          });
        }
      }
    });

    let maxChange = 0;
    constructs.forEach(construct => {
      outerWeights[construct.id].forEach((weight, idx) => {
        const change = Math.abs(weight - oldWeights[construct.id][idx]);
        maxChange = Math.max(maxChange, change);
      });
    });

    if (maxChange < convergenceCriterion) {
      converged = true;
      break;
    }
  }

  constructs.forEach(construct => {
    const indices = indicatorIndices[construct.id];
    const scores: number[] = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < indices.length; j++) {
        scores[i] += standardizedData[i][indices[j]] * outerWeights[construct.id][j];
      }
    }

    latentScores[construct.id] = scores;
  });

  return {
    outerWeights,
    innerWeights: {},
    latentScores,
    converged,
    iterations: iterations + 1
  };
}

export function calculateOuterLoadings(
  data: number[][],
  construct: PLSSEMConstruct,
  latentScores: number[],
  columns?: string[]
): number[] {
  const standardizedData = standardize(data);

  return construct.indicators.map((indicatorName, idx) => {
    let colIdx = idx;
    if (columns && columns.length > 0) {
      colIdx = columns.indexOf(indicatorName);
      if (colIdx === -1) {
        console.warn(`Indicator "${indicatorName}" not found in dataset columns`);
        colIdx = idx;
      }
    }
    const indicatorData = standardizedData.map(row => row[colIdx]);
    return pearsonCorrelation(indicatorData, latentScores);
  });
}

/**
 * Calculate Cronbach's Alpha from item correlations
 * @param correlations - Correlation matrix for the items in a construct
 * @returns Cronbach's Alpha coefficient
 */
export function calculateCronbachAlpha(correlations: number[][]): number {
  const k = correlations.length;
  if (k < 2) return 0;

  // Sum unique pairs only (i < j); matrix is symmetric
  let sumCorr = 0;
  let pairCount = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      sumCorr += correlations[i][j];
      pairCount++;
    }
  }

  if (pairCount === 0) return 0;
  const avgCorr = sumCorr / pairCount;
  return (k * avgCorr) / (1 + (k - 1) * avgCorr);
}

/**
 * Calculate Cronbach's Alpha directly from data
 * @param data - Numeric data matrix
 * @param indicatorIndices - Indices of the indicators for this construct
 * @returns Cronbach's Alpha coefficient
 */
export function calculateCronbachAlphaFromData(data: number[][], indicatorIndices: number[]): number {
  const k = indicatorIndices.length;
  if (k < 2) return 0;

  // Extract only the relevant columns
  const itemData = data.map(row => indicatorIndices.map(idx => row[idx]));

  // Calculate item variances and covariances
  const itemVariances = indicatorIndices.map(idx => {
    const col = data.map(row => row[idx]);
    const mean = col.reduce((a, b) => a + b, 0) / col.length;
    return col.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (col.length - 1);
  });

  // Calculate total score variance
  const totalScores = itemData.map(row => row.reduce((a, b) => a + b, 0));
  const totalMean = totalScores.reduce((a, b) => a + b, 0) / totalScores.length;
  const totalVariance = totalScores.reduce((sum, val) => sum + Math.pow(val - totalMean, 2), 0) / (totalScores.length - 1);

  const sumItemVariances = itemVariances.reduce((a, b) => a + b, 0);

  if (totalVariance === 0) return 0;

  return (k / (k - 1)) * (1 - sumItemVariances / totalVariance);
}

export function calculateCompositeReliability(loadings: number[]): number {
  const sumLoadings = loadings.reduce((a, b) => a + Math.abs(b), 0);
  const sumSquaredLoadings = loadings.reduce((a, b) => a + b * b, 0);
  const sumErrors = loadings.reduce((a, b) => a + (1 - b * b), 0);

  if (sumLoadings === 0) return 0;
  return (sumLoadings * sumLoadings) / (sumLoadings * sumLoadings + sumErrors);
}

export function calculateRhoA(loadings: number[], correlations: number[][]): number {
  // Dijkstra-Henseler's ρ_A (Dijkstra & Henseler 2015)
  // ρ_A = (Σλᵢ)² · r̄ / [(Σλᵢ)² · r̄ + Σ(1-λᵢ²)]
  // where r̄ = average off-diagonal inter-indicator correlation
  const k = loadings.length;
  if (k < 2) return 0;

  // Use unique pairs (i < j) only — symmetric matrix, avoid double-counting
  let sumOffDiagCorr = 0;
  let offDiagCount = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      if (correlations[i] && correlations[i][j] !== undefined) {
        sumOffDiagCorr += correlations[i][j];
        offDiagCount++;
      }
    }
  }
  const rBar = offDiagCount > 0 ? sumOffDiagCorr / offDiagCount : 0;

  const sumLoadings = loadings.reduce((a, b) => a + Math.abs(b), 0);
  const sumLoadingsSq = sumLoadings * sumLoadings;
  const sumErrors = loadings.reduce((a, b) => a + (1 - b * b), 0);

  const numerator = sumLoadingsSq * rBar;
  const denominator = sumLoadingsSq * rBar + sumErrors;

  return denominator > 0 ? Math.max(0, Math.min(1, numerator / denominator)) : 0;
}

export function calculateAVE(loadings: number[]): number {
  if (loadings.length === 0) return 0;
  const sumSq = loadings.reduce((a, b) => a + b * b, 0);
  const sumErr = loadings.reduce((a, b) => a + (1 - b * b), 0);
  return (sumSq + sumErr) > 0 ? sumSq / (sumSq + sumErr) : 0;
}

export function calculateVIF(data: number[][]): number[] {
  if (!data || data.length === 0 || !data[0]) return [];
  const n = data.length;
  const m = data[0].length;
  const vifs: number[] = [];

  for (let i = 0; i < m; i++) {
    if (m === 1) {
      vifs[i] = 1.0;
      continue;
    }

    const y = data.map(row => row[i]);
    const X: number[][] = data.map(row =>
      row.filter((_, j) => j !== i)
    );

    if (X[0].length === 0) {
      vifs[i] = 1.0;
      continue;
    }

    try {
      const rSquared = calculateRSquaredForRegression(y, X);
      const vif = 1 / Math.max(1 - rSquared, 0.001);
      vifs[i] = Math.min(vif, 100);
    } catch (e) {
      vifs[i] = 1.5;
    }
  }

  return vifs;
}

function calculateRSquaredForRegression(y: number[], X: number[][]): number {
  if (!y || y.length === 0 || !X || X.length === 0 || !X[0]) return 0;
  const n = y.length;
  const meanY = y.reduce((a, b) => a + b) / n;

  try {
    const coefficients = multipleRegression(y, X);

    const yPred: number[] = [];
    for (let i = 0; i < n; i++) {
      let pred = 0;
      for (let j = 0; j < X[i].length; j++) {
        pred += X[i][j] * coefficients[j];
      }
      yPred.push(pred);
    }

    const ssTot = y.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0);
    const ssRes = y.reduce((sum, val, i) => sum + Math.pow(val - yPred[i], 2), 0);

    if (ssTot === 0) return 0;
    return Math.max(0, Math.min(1, 1 - (ssRes / ssTot)));
  } catch (e) {
    return 0;
  }
}

export function calculatePathCoefficients(
  latentScores: { [construct: string]: number[] },
  paths: PLSSEMPath[]
): PLSSEMPath[] {
  // Group paths by endogenous construct and run joint OLS for each
  const endogenousConstructs = [...new Set(paths.map(p => p.to))];

  const jointCoefficients: { [pathKey: string]: number } = {};

  endogenousConstructs.forEach(endoId => {
    const incomingPaths = paths.filter(p => p.to === endoId);
    const toScores = latentScores[endoId];
    if (!toScores || incomingPaths.length === 0) return;

    const predictorIds = incomingPaths.map(p => p.from);
    const allPresent = predictorIds.every(id => latentScores[id]);
    if (!allPresent) return;

    const n = toScores.length;

    if (incomingPaths.length === 1) {
      // Simple regression
      const fromScores = latentScores[predictorIds[0]];
      const X = fromScores.map(s => [s]);
      try {
        const coeffs = multipleRegression(toScores, X);
        jointCoefficients[`${predictorIds[0]}->${endoId}`] = coeffs[0];
      } catch {
        jointCoefficients[`${predictorIds[0]}->${endoId}`] = pearsonCorrelation(fromScores, toScores);
      }
    } else {
      // Joint OLS: regress endogenous on ALL predictors simultaneously
      const X: number[][] = [];
      for (let i = 0; i < n; i++) {
        X[i] = predictorIds.map(id => latentScores[id][i]);
      }
      try {
        const coeffs = multipleRegression(toScores, X);
        predictorIds.forEach((id, idx) => {
          jointCoefficients[`${id}->${endoId}`] = coeffs[idx];
        });
      } catch {
        // Fallback to simple correlations
        predictorIds.forEach(id => {
          jointCoefficients[`${id}->${endoId}`] = pearsonCorrelation(latentScores[id], toScores);
        });
      }
    }
  });

  return paths.map(path => ({
    ...path,
    coefficient: jointCoefficients[`${path.from}->${path.to}`] ??
      (latentScores[path.from] && latentScores[path.to]
        ? pearsonCorrelation(latentScores[path.from], latentScores[path.to])
        : 0)
  }));
}

export function calculateRSquared(
  latentScores: { [construct: string]: number[] },
  construct: string,
  predictors: string[]
): number {
  const y = latentScores[construct];
  if (!y || predictors.length === 0) return 0;

  const n = y.length;
  const X: number[][] = [];

  for (let i = 0; i < n; i++) {
    X[i] = predictors.map(pred => latentScores[pred]?.[i] || 0);
  }

  return calculateRSquaredForRegression(y, X);
}

export function bootstrap(
  data: number[][],
  model: PLSSEMModel,
  settings: any,
  numSamples: number,
  columns?: string[]
): {
  pathCoefficients: { [path: string]: number[] };
  loadings: { [construct: string]: number[][] };
  outerWeights: { [construct: string]: number[][] };
} {
  const results = {
    pathCoefficients: {} as { [path: string]: number[] },
    loadings: {} as { [construct: string]: number[][] },
    outerWeights: {} as { [construct: string]: number[][] }
  };

  model.paths.forEach(path => {
    const key = `${path.from}->${path.to}`;
    results.pathCoefficients[key] = [];
  });

  model.constructs.forEach(construct => {
    results.loadings[construct.id] = [];
    results.outerWeights[construct.id] = [];
  });

  for (let i = 0; i < numSamples; i++) {
    const sampleIndices = Array.from(
      { length: data.length },
      () => Math.floor(Math.random() * data.length)
    );
    const sample = sampleIndices.map(idx => [...data[idx]]);

    try {
      const plsResults = runPLSAlgorithm(sample, model, settings, columns);

      if (!plsResults.converged) continue;

      // Joint OLS per endogenous construct (matches calculatePathCoefficients)
      const endogenousIds = [...new Set(model.paths.map(p => p.to))];
      endogenousIds.forEach(endoId => {
        const incomingPaths = model.paths.filter(p => p.to === endoId);
        const toScores = plsResults.latentScores[endoId];
        if (!toScores || incomingPaths.length === 0) return;

        const predictorIds = incomingPaths.map(p => p.from);
        if (!predictorIds.every(id => plsResults.latentScores[id])) return;

        const n = toScores.length;
        if (incomingPaths.length === 1) {
          const fromScores = plsResults.latentScores[predictorIds[0]];
          const X = fromScores.map(s => [s]);
          try {
            const coeffs = multipleRegression(toScores, X);
            results.pathCoefficients[`${predictorIds[0]}->${endoId}`].push(coeffs[0]);
          } catch {
            results.pathCoefficients[`${predictorIds[0]}->${endoId}`].push(
              pearsonCorrelation(fromScores, toScores)
            );
          }
        } else {
          const X: number[][] = [];
          for (let row = 0; row < n; row++) {
            X[row] = predictorIds.map(id => plsResults.latentScores[id][row]);
          }
          try {
            const coeffs = multipleRegression(toScores, X);
            predictorIds.forEach((id, idx) => {
              results.pathCoefficients[`${id}->${endoId}`].push(coeffs[idx]);
            });
          } catch {
            predictorIds.forEach(id => {
              results.pathCoefficients[`${id}->${endoId}`].push(
                pearsonCorrelation(plsResults.latentScores[id], toScores)
              );
            });
          }
        }
      });

      model.constructs.forEach(construct => {
        const latentScores = plsResults.latentScores[construct.id];
        if (latentScores) {
          const loadings = calculateOuterLoadings(sample, construct, latentScores, columns);
          results.loadings[construct.id].push(loadings);

          const weights = plsResults.outerWeights[construct.id] || [];
          results.outerWeights[construct.id].push(weights);
        }
      });
    } catch (e) {
      continue;
    }
  }

  return results;
}

/**
 * Calculate standard errors from bootstrap distribution
 */
export function calculateStandardError(values: number[]): number {
  if (values.length < 2) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  // Use n-1 denominator: SE from bootstrap is the SD of the bootstrap distribution
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);

  return Math.sqrt(variance);
}

export function calculateConfidenceInterval(
  values: number[],
  confidenceLevel: number
): [number, number] {
  if (values.length === 0) return [0, 0];

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const alpha = 1 - confidenceLevel;

  const lowerIndex = Math.max(0, Math.floor(n * (alpha / 2)));
  const upperIndex = Math.min(n - 1, Math.floor(n * (1 - alpha / 2)));

  return [sorted[lowerIndex], sorted[upperIndex]];
}

/**
 * Calculate Fornell-Larcker criterion for discriminant validity
 * Each construct's AVE square root should be greater than its correlations with other constructs
 */
export function calculateFornellLarcker(
  latentScores: { [construct: string]: number[] },
  aveValues: { [construct: string]: number },
  constructs: PLSSEMConstruct[]
): number[][] {
  const n = constructs.length;
  const fl: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        fl[i][j] = Math.sqrt(aveValues[constructs[i].name] || 0);
      } else {
        const scoresI = latentScores[constructs[i].id];
        const scoresJ = latentScores[constructs[j].id];
        if (scoresI && scoresJ) {
          fl[i][j] = Math.abs(pearsonCorrelation(scoresI, scoresJ));
        } else {
          fl[i][j] = 0;
        }
      }
    }
  }

  return fl;
}

export function calculateHTMT(
  data: number[][],
  constructs: PLSSEMConstruct[],
  columns?: string[]
): number[][] {
  const n = constructs.length;
  const htmt: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  const standardizedData = standardize(data);

  const constructIndicatorIndices: number[][] = [];

  if (columns && columns.length > 0) {
    constructs.forEach((construct) => {
      const indices = construct.indicators.map(indName => {
        const idx = columns.indexOf(indName);
        if (idx === -1) {
          console.warn(`Indicator "${indName}" not found in dataset columns for HTMT calculation`);
          return 0;
        }
        return idx;
      });
      constructIndicatorIndices.push(indices);
    });
  } else {
    let currentIdx = 0;
    constructs.forEach((construct) => {
      const indices: number[] = [];
      construct.indicators.forEach(() => {
        indices.push(currentIdx++);
      });
      constructIndicatorIndices.push(indices);
    });
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        htmt[i][j] = 1;
        continue;
      }

      const indicesI = constructIndicatorIndices[i];
      const indicesJ = constructIndicatorIndices[j];

      let betweenSum = 0;
      let betweenCount = 0;
      for (const idxI of indicesI) {
        for (const idxJ of indicesJ) {
          const xi = standardizedData.map(row => row[idxI]);
          const xj = standardizedData.map(row => row[idxJ]);
          betweenSum += Math.abs(pearsonCorrelation(xi, xj));
          betweenCount++;
        }
      }
      const betweenAvg = betweenCount > 0 ? betweenSum / betweenCount : 0;

      let withinSumI = 0;
      let withinCountI = 0;
      for (let k1 = 0; k1 < indicesI.length; k1++) {
        for (let k2 = k1 + 1; k2 < indicesI.length; k2++) {
          const x1 = standardizedData.map(row => row[indicesI[k1]]);
          const x2 = standardizedData.map(row => row[indicesI[k2]]);
          withinSumI += Math.abs(pearsonCorrelation(x1, x2));
          withinCountI++;
        }
      }
      const withinAvgI = withinCountI > 0 ? withinSumI / withinCountI : 1;

      let withinSumJ = 0;
      let withinCountJ = 0;
      for (let k1 = 0; k1 < indicesJ.length; k1++) {
        for (let k2 = k1 + 1; k2 < indicesJ.length; k2++) {
          const x1 = standardizedData.map(row => row[indicesJ[k1]]);
          const x2 = standardizedData.map(row => row[indicesJ[k2]]);
          withinSumJ += Math.abs(pearsonCorrelation(x1, x2));
          withinCountJ++;
        }
      }
      const withinAvgJ = withinCountJ > 0 ? withinSumJ / withinCountJ : 1;

      const withinAvg = Math.sqrt(withinAvgI * withinAvgJ);
      htmt[i][j] = withinAvg > 0 ? betweenAvg / withinAvg : 0;
    }
  }

  return htmt;
}

/**
 * Calculate Cohen's f-squared effect size for each path
 * f² = (R²_included - R²_excluded) / (1 - R²_included)
 */
export function calculateFSquared(
  latentScores: { [construct: string]: number[] },
  model: PLSSEMModel
): { [pathKey: string]: number } {
  const fSquared: { [pathKey: string]: number } = {};

  model.constructs.forEach(endogenous => {
    const predecessors = model.paths
      .filter(p => p.to === endogenous.id)
      .map(p => p.from);

    if (predecessors.length === 0) return;

    const rSquaredFull = calculateRSquared(latentScores, endogenous.id, predecessors);

    predecessors.forEach(predId => {
      const reducedPredictors = predecessors.filter(p => p !== predId);

      let rSquaredReduced = 0;
      if (reducedPredictors.length > 0) {
        rSquaredReduced = calculateRSquared(latentScores, endogenous.id, reducedPredictors);
      }

      const fSq = (rSquaredFull - rSquaredReduced) / Math.max(1 - rSquaredFull, 0.001);
      const pathKey = `${predId}->${endogenous.id}`;
      fSquared[pathKey] = Math.max(0, fSq);
    });
  });

  return fSquared;
}

export function blindfolding(
  data: number[][],
  model: PLSSEMModel,
  settings: any,
  omissionDistance: number,
  columns?: string[]
): { [construct: string]: number } {
  const qSquared: { [construct: string]: number } = {};
  const n = data.length;

  const endogenousConstructs = model.constructs.filter(c =>
    model.paths.some(p => p.to === c.id)
  );

  endogenousConstructs.forEach(construct => {
    // Collect all actual indicator means and predictions across folds
    const allActuals: number[] = [];
    const allPredicted: number[] = [];

    for (let fold = 0; fold < omissionDistance; fold++) {
      const omittedIndices: number[] = [];
      for (let i = fold; i < n; i += omissionDistance) {
        omittedIndices.push(i);
      }

      const trainingData = data.filter((_, i) => !omittedIndices.includes(i));

      if (trainingData.length < 10) continue;

      try {
        const plsResults = runPLSAlgorithm(trainingData, model, settings, columns);

        if (!plsResults.converged) continue;

        // Compute path coefficients on training data
        const predictors = model.paths
          .filter(p => p.to === construct.id)
          .map(p => p.from);

        if (predictors.length === 0) continue;

        // Estimate path coefficients from training latent scores
        const trainingEndogenous = plsResults.latentScores[construct.id];
        if (!trainingEndogenous) continue;

        const pathCoeffs = predictors.map(predId => {
          const predScores = plsResults.latentScores[predId];
          if (!predScores) return 0;
          return pearsonCorrelation(predScores, trainingEndogenous);
        });

        // Get standardization parameters from training data
        const trainStd = standardize(trainingData);
        const colMeans: number[] = [];
        const colSds: number[] = [];
        const totalCols = trainingData[0]?.length || 0;
        for (let ci = 0; ci < totalCols; ci++) {
          const col = trainingData.map(r => r[ci]).filter(v => isFinite(v));
          const m = col.reduce((a, b) => a + b, 0) / Math.max(1, col.length);
          const s = Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, col.length - 1));
          colMeans[ci] = m;
          colSds[ci] = s || 1;
        }

        // Helper: standardize a single observation using training statistics
        const stdObs = (obs: number[], idx: number) => colSds[idx] > 0 ? (obs[idx] - colMeans[idx]) / colSds[idx] : 0;

        // For each omitted observation: use outer weights to compute latent score proxy
        omittedIndices.forEach(omittedIdx => {
          const obs = data[omittedIdx];

          // Actual latent score: outer weight projection of construct indicators
          const indIndices = construct.indicators
            .map(ind => columns ? columns.indexOf(ind) : -1)
            .filter(idx => idx !== -1);
          if (indIndices.length === 0) return;

          const weights = plsResults.outerWeights[construct.id] || [];
          let actualScore = 0;
          let weightSum = 0;
          indIndices.forEach((idx, k) => {
            const w = weights[k] ?? (1 / indIndices.length);
            actualScore += w * stdObs(obs, idx);
            weightSum += Math.abs(w);
          });
          if (weightSum > 0) actualScore /= weightSum;

          // Predicted: path coefficient × predictor outer weight projection
          let predictedScore = 0;
          predictors.forEach((predId, pIdx) => {
            const predConstruct = model.constructs.find(c => c.id === predId);
            if (!predConstruct) return;
            const predIndices = predConstruct.indicators
              .map(ind => columns ? columns.indexOf(ind) : -1)
              .filter(idx => idx !== -1);
            if (predIndices.length === 0) return;
            const predWeights = plsResults.outerWeights[predId] || [];
            let predScore = 0;
            let predWeightSum = 0;
            predIndices.forEach((idx, k) => {
              const w = predWeights[k] ?? (1 / predIndices.length);
              predScore += w * stdObs(obs, idx);
              predWeightSum += Math.abs(w);
            });
            if (predWeightSum > 0) predScore /= predWeightSum;
            predictedScore += pathCoeffs[pIdx] * predScore;
          });

          allActuals.push(actualScore);
          allPredicted.push(predictedScore);
        });
      } catch (e) {
        continue;
      }
    }

    if (allActuals.length === 0) {
      qSquared[construct.id] = 0;
      return;
    }

    // Q² = 1 - SSE / SSO where SSO = Σ(actual - mean(actual))²
    const meanActual = allActuals.reduce((a, b) => a + b, 0) / allActuals.length;
    const sso = allActuals.reduce((sum, a) => sum + Math.pow(a - meanActual, 2), 0);
    const sse = allActuals.reduce((sum, a, i) => sum + Math.pow(a - allPredicted[i], 2), 0);

    qSquared[construct.id] = sso > 0 ? 1 - (sse / sso) : 0;
  });

  return qSquared;
}

export function plsPredict(
  data: number[][],
  model: PLSSEMModel,
  settings: any,
  trainRatio: number = 0.8,
  columns?: string[]
): {
  rmse: { [construct: string]: number };
  mae: { [construct: string]: number };
  qSquaredPredict: { [construct: string]: number };
} {
  const n = data.length;
  const splitIndex = Math.floor(n * trainRatio);

  const trainData = data.slice(0, splitIndex);
  const testData = data.slice(splitIndex);

  const results = {
    rmse: {} as { [construct: string]: number },
    mae: {} as { [construct: string]: number },
    qSquaredPredict: {} as { [construct: string]: number }
  };

  if (testData.length === 0) {
    model.constructs.forEach(construct => {
      if (model.paths.some(p => p.to === construct.id)) {
        results.rmse[construct.id] = 0;
        results.mae[construct.id] = 0;
        results.qSquaredPredict[construct.id] = 0;
      }
    });
    return results;
  }

  try {
    const plsResults = runPLSAlgorithm(trainData, model, settings, columns);

    if (!plsResults.converged) {
      model.constructs.forEach(construct => {
        if (model.paths.some(p => p.to === construct.id)) {
          results.rmse[construct.id] = 999;
          results.mae[construct.id] = 999;
          results.qSquaredPredict[construct.id] = -999;
        }
      });
      return results;
    }

    model.constructs.forEach(construct => {
      const isEndogenous = model.paths.some(p => p.to === construct.id);
      if (!isEndogenous) return;

      const predictors = model.paths
        .filter(p => p.to === construct.id)
        .map(p => p.from);

      // Estimate path coefficients from training latent scores
      const trainingEndogenous = plsResults.latentScores[construct.id];
      const pathCoeffs: number[] = predictors.map(predId => {
        const predScores = plsResults.latentScores[predId];
        if (!predScores || !trainingEndogenous) return 0;
        return pearsonCorrelation(predScores, trainingEndogenous);
      });

      // Compute standardization parameters from training data
      const totalCols = trainData[0]?.length || 0;
      const colMeans: number[] = [];
      const colSds: number[] = [];
      for (let ci = 0; ci < totalCols; ci++) {
        const col = trainData.map(r => r[ci]).filter(v => isFinite(v));
        const m = col.reduce((a, b) => a + b, 0) / Math.max(1, col.length);
        const s = Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, col.length - 1));
        colMeans[ci] = m;
        colSds[ci] = s || 1;
      }
      const stdObs = (obs: number[], idx: number) => colSds[idx] > 0 ? (obs[idx] - colMeans[idx]) / colSds[idx] : 0;

      const errors: number[] = [];
      const actuals: number[] = [];

      testData.forEach((testRow) => {
        // Actual: outer weight projection of construct indicators
        const indIndices = construct.indicators
          .map(ind => columns ? columns.indexOf(ind) : -1)
          .filter(idx => idx !== -1);
        if (indIndices.length === 0) return;

        const weights = plsResults.outerWeights[construct.id] || [];
        let actualScore = 0;
        let weightSum = 0;
        indIndices.forEach((idx, k) => {
          const w = weights[k] ?? (1 / indIndices.length);
          actualScore += w * stdObs(testRow, idx);
          weightSum += Math.abs(w);
        });
        if (weightSum > 0) actualScore /= weightSum;

        // Predicted: path coefficients × predictor outer weight projections
        let predictedScore = 0;
        predictors.forEach((predId, pIdx) => {
          const predConstruct = model.constructs.find(c => c.id === predId);
          if (!predConstruct) return;
          const predIndices = predConstruct.indicators
            .map(ind => columns ? columns.indexOf(ind) : -1)
            .filter(idx => idx !== -1);
          if (predIndices.length === 0) return;
          const predWeights = plsResults.outerWeights[predId] || [];
          let predScore = 0;
          let predWeightSum = 0;
          predIndices.forEach((idx, k) => {
            const w = predWeights[k] ?? (1 / predIndices.length);
            predScore += w * stdObs(testRow, idx);
            predWeightSum += Math.abs(w);
          });
          if (predWeightSum > 0) predScore /= predWeightSum;
          predictedScore += pathCoeffs[pIdx] * predScore;
        });

        errors.push(actualScore - predictedScore);
        actuals.push(actualScore);
      });

      const rmse = Math.sqrt(
        errors.reduce((sum, e) => sum + e * e, 0) / errors.length
      );
      const mae = errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length;

      const meanActual = actuals.reduce((a, b) => a + b, 0) / actuals.length;
      const sso = actuals.reduce((sum, a) => sum + Math.pow(a - meanActual, 2), 0);
      const sse = errors.reduce((sum, e) => sum + e * e, 0);

      const qSquaredPred = sso > 0 ? 1 - (sse / sso) : 0;

      results.rmse[construct.id] = rmse;
      results.mae[construct.id] = mae;
      results.qSquaredPredict[construct.id] = qSquaredPred;
    });
  } catch (e) {
    model.constructs.forEach(construct => {
      if (model.paths.some(p => p.to === construct.id)) {
        results.rmse[construct.id] = 999;
        results.mae[construct.id] = 999;
        results.qSquaredPredict[construct.id] = -999;
      }
    });
  }

  return results;
}

export function calculateSRMR(
  observedCorr: number[][],
  impliedCorr: number[][]
): number {
  let sumSquaredResiduals = 0;
  let count = 0;

  for (let i = 0; i < observedCorr.length; i++) {
    for (let j = i + 1; j < observedCorr[i].length; j++) {
      const residual = observedCorr[i][j] - impliedCorr[i][j];
      sumSquaredResiduals += residual * residual;
      count++;
    }
  }

  return count > 0 ? Math.sqrt(sumSquaredResiduals / count) : 0;
}

/**
 * Calculate global fit indices for PLS-SEM
 * @param data - Numeric data matrix
 * @param model - PLS-SEM model
 * @param latentScores - Latent variable scores
 * @param columns - Column names
 * @returns Global fit indices (SRMR, NFI, dULS, dG)
 */
/**
 * Calculate implied correlation matrix from PLS-SEM model
 * Uses path tracing rules to compute expected correlations
 */
function calculateImpliedCorrelationMatrix(
  data: number[][],
  model: PLSSEMModel,
  latentScores: { [construct: string]: number[] },
  outerLoadings: { [construct: string]: number[] },
  pathCoefficients: { [pathKey: string]: number },
  columns?: string[]
): number[][] {
  const nVars = data[0].length;
  const impliedCorr: number[][] = Array(nVars).fill(0).map(() => Array(nVars).fill(0));

  for (let i = 0; i < nVars; i++) {
    impliedCorr[i][i] = 1;
  }

  const varToConstruct: { [varIdx: number]: { constructId: string; indIdx: number } } = {};

  if (columns && columns.length > 0) {
    model.constructs.forEach(construct => {
      construct.indicators.forEach((indName, indIdx) => {
        const varIdx = columns.indexOf(indName);
        if (varIdx !== -1) {
          varToConstruct[varIdx] = { constructId: construct.id, indIdx };
        }
      });
    });
  } else {
    let currentIdx = 0;
    model.constructs.forEach(construct => {
      construct.indicators.forEach((_, indIdx) => {
        varToConstruct[currentIdx] = { constructId: construct.id, indIdx };
        currentIdx++;
      });
    });
  }

  for (let i = 0; i < nVars; i++) {
    for (let j = i + 1; j < nVars; j++) {
      const varI = varToConstruct[i];
      const varJ = varToConstruct[j];

      if (!varI || !varJ) continue;

      const loadingI = outerLoadings[varI.constructId]?.[varI.indIdx] || 0;
      const loadingJ = outerLoadings[varJ.constructId]?.[varJ.indIdx] || 0;

      let constructCorr = 0;
      if (varI.constructId === varJ.constructId) {
        constructCorr = 1;
      } else {
        const pathKey1 = `${varI.constructId}->${varJ.constructId}`;
        const pathKey2 = `${varJ.constructId}->${varI.constructId}`;

        if (pathCoefficients[pathKey1]) {
          constructCorr = pathCoefficients[pathKey1];
        } else if (pathCoefficients[pathKey2]) {
          constructCorr = pathCoefficients[pathKey2];
        } else {
          const latentI = latentScores[varI.constructId];
          const latentJ = latentScores[varJ.constructId];
          if (latentI && latentJ) {
            constructCorr = pearsonCorrelation(latentI, latentJ);
          }
        }
      }

      impliedCorr[i][j] = impliedCorr[j][i] = loadingI * loadingJ * constructCorr;
    }
  }

  return impliedCorr;
}

export function calculateGlobalFit(
  data: number[][],
  model: PLSSEMModel,
  latentScores: { [construct: string]: number[] },
  columns?: string[]
): {
  srmr: number;
  nfi: number;
  dULS: number;
  dG: number;
} {
  const observedCorr = calculateCorrelationMatrix(data);

  const outerLoadings: { [construct: string]: number[] } = {};
  model.constructs.forEach(construct => {
    const scores = latentScores[construct.id];
    if (scores) {
      outerLoadings[construct.id] = calculateOuterLoadings(data, construct, scores, columns);
    }
  });

  const pathCoefficients: { [pathKey: string]: number } = {};
  model.paths.forEach(path => {
    const fromScores = latentScores[path.from];
    const toScores = latentScores[path.to];
    if (fromScores && toScores) {
      const key = `${path.from}->${path.to}`;
      pathCoefficients[key] = pearsonCorrelation(fromScores, toScores);
    }
  });

  const impliedCorr = calculateImpliedCorrelationMatrix(
    data,
    model,
    latentScores,
    outerLoadings,
    pathCoefficients,
    columns
  );

  const srmr = calculateSRMR(observedCorr, impliedCorr);

  const nVars = data[0].length;

  // dULS = sum of squared residuals in lower triangle (unweighted least squares discrepancy)
  let dULS = 0;
  for (let i = 0; i < nVars; i++) {
    for (let j = 0; j < i; j++) {
      const diff = observedCorr[i][j] - impliedCorr[i][j];
      dULS += diff * diff;
    }
  }

  // dG = geodesic discrepancy (Fisher z-transform residuals)
  let dG = 0;
  for (let i = 0; i < nVars; i++) {
    for (let j = 0; j < i; j++) {
      const obs = observedCorr[i][j];
      const imp = impliedCorr[i][j];
      if (Math.abs(obs) < 0.9999 && Math.abs(imp) < 0.9999) {
        const diff = Math.atanh(obs) - Math.atanh(imp);
        dG += diff * diff;
      }
    }
  }

  // NFI (Lohmöller 1989): NFI = 1 - dULS_model / dULS_null
  // Null model: all off-diagonal correlations = 0 (independence model)
  let dULS_null = 0;
  for (let i = 0; i < nVars; i++) {
    for (let j = 0; j < i; j++) {
      // Implied = 0 under null (independence), so residual = observedCorr[i][j]
      dULS_null += observedCorr[i][j] * observedCorr[i][j];
    }
  }
  const nfi = dULS_null > 0 ? Math.max(0, Math.min(1, 1 - dULS / dULS_null)) : 0;

  return {
    srmr: Math.max(0, Math.min(1, srmr)),
    nfi,
    dULS: Math.sqrt(dULS),
    dG: Math.sqrt(dG)
  };
}

/**
 * Calculate p-value from t-statistic using t-distribution
 * @param tValue - t-statistic
 * @param df - degrees of freedom
 * @returns two-tailed p-value
 */
export function tTestPValue(tValue: number, df: number): number {
  if (df <= 0) return 1;

  const absT = Math.abs(tValue);

  // Approximation using normal distribution for large df
  if (df > 100) {
    return 2 * normalCDF(-absT);
  }

  // Use Abramowitz and Stegun approximation for t-distribution
  const x = df / (df + absT * absT);
  const a = 0.5 * df;

  // Two-tailed p-value via regularized incomplete beta function
  const p = incompleteBeta(x, a, 0.5) / 2;

  return 2 * Math.min(p, 1 - p);
}

/**
 * Normal CDF (cumulative distribution function)
 */
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - prob : prob;
}

/**
 * Incomplete beta function approximation for t-distribution
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use symmetry relation to ensure convergence: I_x(a,b) = 1 - I_{1-x}(b,a)
  // Continued fraction converges best when x < (a+1)/(a+b+2)
  const symmetry = x > (a + 1) / (a + b + 2);
  if (symmetry) return 1 - incompleteBeta(1 - x, b, a);

  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;

  // Modified Lentz continued fraction (Numerical Recipes 6.4)
  const tiny = 1e-30;
  let f = tiny;
  let c = tiny;
  let d = 0;

  for (let i = 0; i <= 200; i++) {
    const m = Math.floor(i / 2);
    let num: number;

    if (i === 0) {
      num = 1;
    } else if (i % 2 === 1) {
      // Odd step: d_{2m+1}
      num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    } else {
      // Even step: d_{2m}
      num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    }

    d = 1 + num * d;
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;

    c = 1 + num / c;
    if (Math.abs(c) < tiny) c = tiny;

    const cd = c * d;
    f *= cd;

    if (Math.abs(cd - 1) < 1e-10) break;
  }

  return front * f;
}

/**
 * Log gamma function (Lanczos approximation)
 */
function lgamma(z: number): number {
  const g = 7;
  const coef = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  }

  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) {
    x += coef[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function imputeMissingData(
  data: any[][],
  method: 'mean' | 'median' | 'mode' | 'listwise' | 'pairwise'
): number[][] {
  // Safety checks
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.warn('imputeMissingData: Invalid or empty data');
    return [];
  }

  if (!data[0] || !Array.isArray(data[0])) {
    console.warn('imputeMissingData: First row is not an array');
    return [];
  }

  if (method === 'listwise') {
    const filtered = data
      .filter(row => Array.isArray(row) && row.every(val => val !== null && val !== undefined && !isNaN(Number(val))))
      .map(row => row.map(val => Number(val)));

    if (filtered.length === 0) {
      console.warn('imputeMissingData: No complete cases found in listwise deletion');
    }

    return filtered;
  }

  const numericData: number[][] = [];
  const cols = data[0].length;

  for (let j = 0; j < cols; j++) {
    const colValues = data
      .filter(row => Array.isArray(row) && row.length > j)
      .map(row => Number(row[j]))
      .filter(val => !isNaN(val) && isFinite(val));

    let fillValue: number;
    if (method === 'mean') {
      fillValue = colValues.length > 0
        ? colValues.reduce((a, b) => a + b, 0) / colValues.length
        : 0;
    } else if (method === 'median') {
      const sorted = [...colValues].sort((a, b) => a - b);
      fillValue = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    } else {
      fillValue = colValues[0] || 0;
    }

    data.forEach((row, i) => {
      if (!Array.isArray(row) || row.length <= j) return;
      if (!numericData[i]) numericData[i] = [];
      const val = Number(row[j]);
      numericData[i][j] = (isNaN(val) || !isFinite(val)) ? fillValue : val;
    });
  }

  return numericData.filter(row => row && row.length > 0);
}

export function detectVariableTypes(
  data: any[][],
  columns: string[]
): { [column: string]: 'continuous' | 'ordinal' | 'categorical' } {
  const types: { [column: string]: 'continuous' | 'ordinal' | 'categorical' } = {};

  if (!data || !Array.isArray(data) || data.length === 0 || !columns || !Array.isArray(columns)) {
    console.warn('detectVariableTypes: Invalid data or columns');
    return types;
  }

  columns.forEach((col, idx) => {
    const values = data
      .filter(row => Array.isArray(row) && row.length > idx)
      .map(row => row[idx])
      .filter(v => v !== null && v !== undefined);

    if (values.length === 0) {
      types[col] = 'continuous';
      return;
    }

    const uniqueValues = new Set(values);
    const numericValues = values.filter(v => !isNaN(Number(v)));

    if (uniqueValues.size < 10 && numericValues.length < values.length * 0.5) {
      types[col] = 'categorical';
    } else if (uniqueValues.size < 20) {
      types[col] = 'ordinal';
    } else {
      types[col] = 'continuous';
    }
  });

  return types;
}

export function calculateDescriptiveStats(data: number[][]): {
  [index: number]: {
    n: number;
    mean: number;
    sd: number;
    skewness: number;
    kurtosis: number;
  };
} {
  const stats: any = {};
  const cols = data[0]?.length || 0;

  for (let j = 0; j < cols; j++) {
    const values = data.map(row => row[j]).filter(v => isFinite(v));
    const n = values.length;

    if (n === 0) {
      stats[j] = { n: 0, mean: 0, sd: 0, skewness: 0, kurtosis: 0 };
      continue;
    }

    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = n > 1
      ? values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1)
      : 0;
    const sd = Math.sqrt(variance);

    let skewness = 0;
    let kurtosis = 0;

    if (sd > 0 && n >= 3) {
      const m3 = values.reduce((sum, val) => sum + Math.pow((val - mean) / sd, 3), 0);
      // Fisher-Pearson adjusted skewness (SPSS/R compatible)
      skewness = (n / ((n - 1) * (n - 2))) * m3;
    }

    if (sd > 0 && n >= 4) {
      const m4 = values.reduce((sum, val) => sum + Math.pow((val - mean) / sd, 4), 0);
      // Fisher-Pearson adjusted excess kurtosis
      kurtosis = (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * m4
        - (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
    }

    stats[j] = {
      n,
      mean,
      sd,
      skewness,
      kurtosis
    };
  }

  return stats;
}
