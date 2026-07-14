/**
 * Real Factor Analysis Implementation
 * Exploratory Factor Analysis with proper statistical methods
 */

import {
  MatrixOps,
  Statistics,
  CorrelationMatrix,
  EigenDecomposition,
  FactorRotation,
  KMO,
  BartlettTest,
  FactorAnalysisResult
} from './psychometricStats';

export interface EFAOptions {
  numFactors?: number;
  rotation?: 'none' | 'varimax' | 'promax';
  method?: 'pca' | 'pa';
  maxIterations?: number;
  convergenceTolerance?: number;
}

export interface ParallelAnalysisResult {
  observedEigenvalues: number[];
  simulatedEigenvalues: number[];
  suggestedFactors: number;
}

/**
 * Exploratory Factor Analysis
 */
export class ExploratoryFactorAnalysis {
  /**
   * Run EFA on raw data
   */
  static run(data: number[][], variables: string[], options: EFAOptions = {}): FactorAnalysisResult & {
    kmo: { overall: number; individual: number[] };
    bartlett: { chisq: number; df: number; p: number };
    parallelAnalysis?: ParallelAnalysisResult;
  } {
    const {
      rotation = 'varimax',
      method = 'pca',
      maxIterations = 1000,
      convergenceTolerance = 1e-6
    } = options;

    const n = data.length;
    const p = data[0].length;

    const correlationResult = CorrelationMatrix.compute(data, variables);
    const corrMatrix = correlationResult.matrix;

    const kmo = KMO.compute(corrMatrix);
    const bartlett = BartlettTest.compute(corrMatrix, n);

    const eigenResult = EigenDecomposition.compute(corrMatrix, maxIterations, convergenceTolerance);

    let numFactors = options.numFactors;
    if (!numFactors) {
      numFactors = this.determineFactors(eigenResult.values);
    }

    numFactors = Math.min(numFactors, eigenResult.values.length);

    const selectedEigenvalues = eigenResult.values.slice(0, numFactors);
    const selectedEigenvectors = eigenResult.vectors.slice(0, numFactors);

    let loadings: number[][] = Array(p).fill(0).map(() => Array(numFactors).fill(0));
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < numFactors; j++) {
        loadings[i][j] = selectedEigenvectors[j][i] * Math.sqrt(selectedEigenvalues[j]);
      }
    }

    const communalities = loadings.map(row =>
      row.reduce((sum, val) => sum + val * val, 0)
    );

    const varianceExplained = selectedEigenvalues.map(val => (val / p) * 100);
    const cumulativeVariance: number[] = [];
    let cumSum = 0;
    for (const ve of varianceExplained) {
      cumSum += ve;
      cumulativeVariance.push(cumSum);
    }

    let rotatedLoadings: number[][] | undefined;
    let factorCorrelations: number[][] | undefined;

    if (rotation === 'varimax' && numFactors > 1) {
      rotatedLoadings = FactorRotation.varimax(loadings);
    } else if (rotation === 'promax' && numFactors > 1) {
      const promaxResult = FactorRotation.promax(loadings);
      rotatedLoadings = promaxResult.loadings;
      factorCorrelations = promaxResult.correlations;
    }

    // Standardize factor signs (flip columns whose loadings sum negative) so
    // output matches the convention of SPSS/R — pure reflection, no change in fit.
    if (rotatedLoadings) {
      for (let j = 0; j < numFactors; j++) {
        const colSum = rotatedLoadings.reduce((s, row) => s + row[j], 0);
        if (colSum < 0) {
          rotatedLoadings.forEach((row) => { row[j] = -row[j]; });
          if (factorCorrelations) {
            for (let k = 0; k < numFactors; k++) {
              if (k !== j) {
                factorCorrelations[j][k] = -factorCorrelations[j][k];
                factorCorrelations[k][j] = -factorCorrelations[k][j];
              }
            }
          }
        }
      }
    }

    return {
      loadings,
      communalities,
      eigenvalues: eigenResult.values,
      varianceExplained,
      cumulativeVariance,
      rotatedLoadings,
      factorCorrelations,
      kmo,
      bartlett
    };
  }

  /**
   * Parallel Analysis for factor retention
   */
  static parallelAnalysis(
    data: number[][],
    numSimulations: number = 100,
    percentile: number = 95
  ): ParallelAnalysisResult {
    const n = data.length;
    const p = data[0].length;

    const correlationResult = CorrelationMatrix.compute(data, []);
    const eigenResult = EigenDecomposition.compute(correlationResult.matrix);
    const observedEigenvalues = eigenResult.values;

    const simulatedEigenvalues: number[][] = [];

    for (let sim = 0; sim < numSimulations; sim++) {
      const randomData = this.generateRandomData(n, p);
      const randomCorr = CorrelationMatrix.compute(randomData, []);
      const randomEigen = EigenDecomposition.compute(randomCorr.matrix);
      simulatedEigenvalues.push(randomEigen.values);
    }

    const percentileEigenvalues: number[] = [];
    for (let i = 0; i < p; i++) {
      const values = simulatedEigenvalues.map(sim => sim[i] || 0).sort((a, b) => a - b);
      const index = Math.floor((percentile / 100) * values.length);
      percentileEigenvalues.push(values[index]);
    }

    let suggestedFactors = 0;
    for (let i = 0; i < observedEigenvalues.length; i++) {
      if (observedEigenvalues[i] > percentileEigenvalues[i]) {
        suggestedFactors++;
      } else {
        break;
      }
    }

    return {
      observedEigenvalues,
      simulatedEigenvalues: percentileEigenvalues,
      suggestedFactors
    };
  }

  /**
   * Generate random normal data for parallel analysis
   */
  private static generateRandomData(n: number, p: number): number[][] {
    const data: number[][] = Array(n).fill(0).map(() => Array(p).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        data[i][j] = this.randomNormal();
      }
    }

    return data;
  }

  /**
   * Box-Muller transform for generating random normal values
   */
  private static randomNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Determine number of factors using Kaiser criterion (eigenvalue > 1)
   */
  private static determineFactors(eigenvalues: number[]): number {
    let count = 0;
    for (const val of eigenvalues) {
      if (val > 1.0) count++;
      else break;
    }
    return Math.max(count, 1);
  }

  /**
   * Compute adequacy measures
   */
  static computeAdequacy(data: number[][]): {
    kmo: { overall: number; individual: number[] };
    bartlett: { chisq: number; df: number; p: number };
    determinant: number;
  } {
    const n = data.length;
    const correlationResult = CorrelationMatrix.compute(data, []);
    const corrMatrix = correlationResult.matrix;

    const kmo = KMO.compute(corrMatrix);
    const bartlett = BartlettTest.compute(corrMatrix, n);

    const determinant = this.computeDeterminant(corrMatrix);

    return { kmo, bartlett, determinant };
  }

  private static computeDeterminant(matrix: number[][]): number {
    const n = matrix.length;

    if (n === 1) return matrix[0][0];
    if (n === 2) return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];

    let det = 0;
    for (let j = 0; j < n; j++) {
      const minor = matrix
        .slice(1)
        .map(row => row.filter((_, col) => col !== j));
      det += Math.pow(-1, j) * matrix[0][j] * this.computeDeterminant(minor);
    }
    return det;
  }
}

/**
 * Scree Plot Data Generator
 */
export class ScreePlot {
  static generateData(eigenvalues: number[]): {
    factors: number[];
    eigenvalues: number[];
    kaiserCriterion: number;
  } {
    return {
      factors: eigenvalues.map((_, i) => i + 1),
      eigenvalues,
      kaiserCriterion: 1.0
    };
  }
}
