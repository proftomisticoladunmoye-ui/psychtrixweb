export interface NetworkMatrix {
  nodes: string[];
  adjacency: number[][];
  sparsity: number;
}

export interface EBICglassoResult extends NetworkMatrix {
  lambda: number;
  ebic: number;
  gamma: number;
}

export interface IsingResult extends NetworkMatrix {
  thresholds: number[];
}

export function validateNetworkData(data: number[][], variables: string[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (data.length < 3) {
    errors.push('Minimum sample size of 3 required');
  }

  if (data.length < 50) {
    warnings.push('Sample size < 50 may produce unstable estimates');
  }

  const nVars = variables.length;
  if (nVars < 3) {
    errors.push('Minimum of 3 variables required for network analysis');
  }

  if (data.length < nVars) {
    warnings.push(`Sample size (${data.length}) is less than number of variables (${nVars})`);
  }

  data.forEach((row, i) => {
    if (row.length !== nVars) {
      errors.push(`Row ${i + 1} has ${row.length} values, expected ${nVars}`);
    }
  });

  const colStds = Array(nVars).fill(0);
  for (let j = 0; j < nVars; j++) {
    const col = data.map(row => row[j]);
    const mean = col.reduce((a, b) => a + b, 0) / col.length;
    const variance = col.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / col.length;
    colStds[j] = Math.sqrt(variance);

    if (colStds[j] === 0) {
      errors.push(`Variable "${variables[j]}" has zero variance`);
    }
  }

  const corrMatrix = calculateCorrelationMatrix(data);
  for (let i = 0; i < nVars; i++) {
    for (let j = i + 1; j < nVars; j++) {
      if (Math.abs(corrMatrix[i][j]) > 0.99) {
        warnings.push(`Variables "${variables[i]}" and "${variables[j]}" are highly collinear (r = ${corrMatrix[i][j].toFixed(3)})`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function standardizeData(data: number[][]): number[][] {
  const n = data.length;
  const p = data[0].length;
  const standardized: number[][] = [];

  for (let j = 0; j < p; j++) {
    const col = data.map(row => row[j]);
    const mean = col.reduce((a, b) => a + b, 0) / n;
    const variance = col.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const sd = Math.sqrt(variance);

    if (sd === 0) {
      throw new Error(`Variable ${j + 1} has zero variance`);
    }

    for (let i = 0; i < n; i++) {
      if (!standardized[i]) standardized[i] = [];
      standardized[i][j] = (data[i][j] - mean) / sd;
    }
  }

  return standardized;
}

export function calculateCorrelationMatrix(data: number[][]): number[][] {
  const n = data.length;
  const p = data[0].length;
  const corr: number[][] = Array(p).fill(0).map(() => Array(p).fill(0));

  const standardized = standardizeData(data);

  for (let i = 0; i < p; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += standardized[k][i] * standardized[k][j];
      }
      corr[i][j] = corr[j][i] = sum / (n - 1);
    }
  }

  return corr;
}

export function calculateCovarianceMatrix(data: number[][]): number[][] {
  const n = data.length;
  const p = data[0].length;
  const cov: number[][] = Array(p).fill(0).map(() => Array(p).fill(0));

  const means = Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    for (let i = 0; i < n; i++) {
      means[j] += data[i][j];
    }
    means[j] /= n;
  }

  for (let i = 0; i < p; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += (data[k][i] - means[i]) * (data[k][j] - means[j]);
      }
      cov[i][j] = cov[j][i] = sum / (n - 1);
    }
  }

  return cov;
}

export function invertMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const augmented: number[][] = matrix.map((row, i) =>
    [...row, ...Array(n).fill(0).map((_, j) => (i === j ? 1 : 0))]
  );

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }

    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    const pivot = augmented[i][i];
    if (Math.abs(pivot) < 1e-10) {
      throw new Error('Matrix is singular or near-singular');
    }

    for (let j = 0; j < 2 * n; j++) {
      augmented[i][j] /= pivot;
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = augmented[k][i];
        for (let j = 0; j < 2 * n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
  }

  return augmented.map(row => row.slice(n));
}

export function partialCorrelationMatrix(correlationMatrix: number[][]): number[][] {
  const precision = invertMatrix(correlationMatrix);
  const n = precision.length;
  const partialCorr: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        partialCorr[i][j] = 1;
      } else {
        partialCorr[i][j] = -precision[i][j] / Math.sqrt(precision[i][i] * precision[j][j]);
      }
    }
  }

  return partialCorr;
}

export function graphicalLassoCoordinate(
  S: number[][],
  lambda: number,
  maxIter: number = 100,
  tol: number = 1e-4
): number[][] {
  const p = S.length;
  let Theta: number[][] = Array(p).fill(0).map(() => Array(p).fill(0));

  for (let i = 0; i < p; i++) {
    Theta[i][i] = 1 / S[i][i];
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const ThetaOld = Theta.map(row => [...row]);

    for (let j = 0; j < p; j++) {
      const S11 = S.filter((_, i) => i !== j).map(row => row.filter((_, k) => k !== j));
      const s12 = S.filter((_, i) => i !== j).map(row => row[j]);

      const W11 = Theta.filter((_, i) => i !== j).map(row => row.filter((_, k) => k !== j));

      try {
        const W11inv = invertMatrix(W11);

        const beta: number[] = Array(p - 1).fill(0);
        for (let i = 0; i < p - 1; i++) {
          let sum = 0;
          for (let k = 0; k < p - 1; k++) {
            sum += W11inv[i][k] * s12[k];
          }

          const threshold = lambda;
          if (Math.abs(sum) > threshold) {
            beta[i] = sum > 0 ? sum - threshold : sum + threshold;
          } else {
            beta[i] = 0;
          }
        }

        let idx = 0;
        for (let i = 0; i < p; i++) {
          if (i !== j) {
            Theta[i][j] = -beta[idx];
            Theta[j][i] = -beta[idx];
            idx++;
          }
        }

        // Theta[j][j] = 1 / (S[j][j] - s12' * beta)  [Friedman et al. 2008, eq. 9]
        let s12Beta = 0;
        for (let i = 0; i < p - 1; i++) {
          s12Beta += s12[i] * beta[i];
        }
        const diagDenom = S[j][j] - s12Beta;
        Theta[j][j] = Math.abs(diagDenom) > 1e-10 ? 1 / diagDenom : Theta[j][j];

      } catch (e) {
        continue;
      }
    }

    let maxDiff = 0;
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        const diff = Math.abs(Theta[i][j] - ThetaOld[i][j]);
        if (diff > maxDiff) maxDiff = diff;
      }
    }

    if (maxDiff < tol) break;
  }

  return Theta;
}

export function ebicGlasso(
  data: number[][],
  variables: string[],
  gamma: number = 0.5,
  nLambda: number = 50
): EBICglassoResult {
  const standardized = standardizeData(data);
  const S = calculateCorrelationMatrix(data);
  const n = data.length;
  const p = variables.length;

  const maxLambda = Math.max(...S.map((row, i) =>
    Math.max(...row.map((val, j) => i !== j ? Math.abs(val) : 0))
  ));

  const minLambda = 0.01;
  const lambdaSeq: number[] = [];
  for (let i = 0; i < nLambda; i++) {
    lambdaSeq.push(maxLambda * Math.pow(minLambda / maxLambda, i / (nLambda - 1)));
  }

  let bestLambda = lambdaSeq[0];
  let bestEBIC = Infinity;
  let bestTheta: number[][] = [];

  for (const lambda of lambdaSeq) {
    try {
      const Theta = graphicalLassoCoordinate(S, lambda);

      let logLik = 0;
      const det = determinant(Theta);
      if (det > 0) {
        logLik = n * (Math.log(det) - trace(matrixMultiply(S, Theta)));
      } else {
        continue;
      }

      let E = 0;
      for (let i = 0; i < p; i++) {
        for (let j = i + 1; j < p; j++) {
          if (Math.abs(Theta[i][j]) > 1e-6) {
            E++;
          }
        }
      }

      const ebic = -2 * logLik + E * Math.log(n) + 4 * E * gamma * Math.log(p);

      if (ebic < bestEBIC) {
        bestEBIC = ebic;
        bestLambda = lambda;
        bestTheta = Theta;
      }
    } catch (e) {
      continue;
    }
  }

  const adjacency: number[][] = Array(p).fill(0).map(() => Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      if (i !== j && Math.abs(bestTheta[i][j]) > 1e-6) {
        adjacency[i][j] = -bestTheta[i][j] / Math.sqrt(bestTheta[i][i] * bestTheta[j][j]);
      }
    }
  }

  let edgeCount = 0;
  for (let i = 0; i < p; i++) {
    for (let j = i + 1; j < p; j++) {
      if (Math.abs(adjacency[i][j]) > 1e-6) edgeCount++;
    }
  }
  const sparsity = 1 - (2 * edgeCount) / (p * (p - 1));

  return {
    nodes: variables,
    adjacency,
    lambda: bestLambda,
    ebic: bestEBIC,
    gamma,
    sparsity,
  };
}

function determinant(matrix: number[][]): number {
  const n = matrix.length;
  if (n === 1) return matrix[0][0];
  if (n === 2) return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];

  let det = 0;
  for (let j = 0; j < n; j++) {
    const minor = matrix.slice(1).map(row =>
      row.filter((_, colIdx) => colIdx !== j)
    );
    det += Math.pow(-1, j) * matrix[0][j] * determinant(minor);
  }
  return det;
}

function trace(matrix: number[][]): number {
  return matrix.reduce((sum, row, i) => sum + row[i], 0);
}

function matrixMultiply(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < A.length; i++) {
    result[i] = [];
    for (let j = 0; j < B[0].length; j++) {
      let sum = 0;
      for (let k = 0; k < A[0].length; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

export function estimateIsingModel(
  data: number[][],
  variables: string[],
  gamma: number = 0.25
): IsingResult {
  const n = data.length;
  const p = variables.length;

  for (const row of data) {
    for (const val of row) {
      if (val !== 0 && val !== 1) {
        throw new Error('Ising model requires binary data (0 or 1)');
      }
    }
  }

  const adjacency: number[][] = Array(p).fill(0).map(() => Array(p).fill(0));
  const thresholds: number[] = Array(p).fill(0);

  for (let j = 0; j < p; j++) {
    const y = data.map(row => row[j] === 1 ? 1 : -1);
    const mean = y.reduce((a, b) => a + b, 0) / n;
    thresholds[j] = Math.log((1 + mean) / (1 - mean)) / 2;
  }

  for (let i = 0; i < p; i++) {
    for (let j = i + 1; j < p; j++) {
      const xi = data.map(row => row[i] === 1 ? 1 : -1);
      const xj = data.map(row => row[j] === 1 ? 1 : -1);

      let cov = 0;
      for (let k = 0; k < n; k++) {
        cov += xi[k] * xj[k];
      }
      cov /= n;

      const meani = xi.reduce((a, b) => a + b, 0) / n;
      const meanj = xj.reduce((a, b) => a + b, 0) / n;

      // Tetrachoric-like association: normalize by marginal SDs
      const vari = 1 - meani * meani;  // Var(X) = E[X²] - E[X]² for ±1 variables
      const varj = 1 - meanj * meanj;
      const association = (vari > 0 && varj > 0)
        ? (cov - meani * meanj) / Math.sqrt(vari * varj)
        : 0;

      // Threshold scales with sqrt(log(p)/n) — data-adaptive sparsity
      const threshold = gamma * Math.sqrt(Math.log(p) / n);
      if (Math.abs(association) > threshold) {
        adjacency[i][j] = adjacency[j][i] = association;
      }
    }
  }

  let edgeCount = 0;
  for (let i = 0; i < p; i++) {
    for (let j = i + 1; j < p; j++) {
      if (Math.abs(adjacency[i][j]) > 1e-6) edgeCount++;
    }
  }
  const sparsity = 1 - (2 * edgeCount) / (p * (p - 1));

  return {
    nodes: variables,
    adjacency,
    thresholds,
    sparsity,
  };
}

export function thresholdNetwork(
  adjacency: number[][],
  threshold: number
): number[][] {
  return adjacency.map(row =>
    row.map(val => Math.abs(val) > threshold ? val : 0)
  );
}

export function calculateNetworkDensity(adjacency: number[][]): number {
  const n = adjacency.length;
  let edges = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(adjacency[i][j]) > 1e-6) edges++;
    }
  }
  const possibleEdges = (n * (n - 1)) / 2;
  return edges / possibleEdges;
}

export function calculateGlobalStrength(adjacency: number[][]): number {
  let sum = 0;
  const n = adjacency.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sum += Math.abs(adjacency[i][j]);
    }
  }
  return sum;
}
