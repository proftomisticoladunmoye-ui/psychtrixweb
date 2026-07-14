/**
 * Core Psychometric Statistics Library
 * Real implementations of statistical methods for psychometric analysis
 */

export interface Matrix {
  data: number[][];
  rows: number;
  cols: number;
}

export interface EigenResult {
  values: number[];
  vectors: number[][];
}

export interface CorrelationResult {
  matrix: number[][];
  variables: string[];
}

export interface FactorAnalysisResult {
  loadings: number[][];
  communalities: number[];
  eigenvalues: number[];
  varianceExplained: number[];
  cumulativeVariance: number[];
  rotatedLoadings?: number[][];
  factorCorrelations?: number[][];
}

/**
 * Matrix Operations
 */
export class MatrixOps {
  static create(rows: number, cols: number, fillValue: number = 0): Matrix {
    return {
      data: Array(rows).fill(0).map(() => Array(cols).fill(fillValue)),
      rows,
      cols
    };
  }

  static transpose(matrix: number[][]): number[][] {
    if (!matrix || matrix.length === 0 || !matrix[0]) return [];
    const rows = matrix.length;
    const cols = matrix[0].length;
    const result: number[][] = Array(cols).fill(0).map(() => Array(rows).fill(0));

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        result[j][i] = matrix[i][j];
      }
    }
    return result;
  }

  static multiply(a: number[][], b: number[][]): number[][] {
    if (!a || a.length === 0 || !a[0] || !b || b.length === 0 || !b[0]) return [];
    const aRows = a.length;
    const aCols = a[0].length;
    const bCols = b[0].length;

    const result: number[][] = Array(aRows).fill(0).map(() => Array(bCols).fill(0));

    for (let i = 0; i < aRows; i++) {
      for (let j = 0; j < bCols; j++) {
        let sum = 0;
        for (let k = 0; k < aCols; k++) {
          sum += a[i][k] * b[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  static identity(size: number): number[][] {
    const result: number[][] = Array(size).fill(0).map(() => Array(size).fill(0));
    for (let i = 0; i < size; i++) {
      result[i][i] = 1;
    }
    return result;
  }

  static copy(matrix: number[][]): number[][] {
    return matrix.map(row => [...row]);
  }

  static subtract(a: number[][], b: number[][]): number[][] {
    const rows = a.length;
    const cols = a[0].length;
    const result: number[][] = Array(rows).fill(0).map(() => Array(cols).fill(0));

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        result[i][j] = a[i][j] - b[i][j];
      }
    }
    return result;
  }

  static scalarMultiply(matrix: number[][], scalar: number): number[][] {
    return matrix.map(row => row.map(val => val * scalar));
  }

  /**
   * Matrix inverse via Gauss-Jordan elimination with partial pivoting.
   * If the matrix is singular or near-singular, applies Tikhonov regularization
   * (adds a small ridge λ=1e-6 to the diagonal) and retries, which is the
   * standard approach in psychometric software for ill-conditioned correlation matrices.
   */
  static inverse(matrix: number[][]): number[][] {
    const n = matrix.length;
    return this._gaussJordanInverse(matrix) ?? this._gaussJordanInverse(
      matrix.map((row, i) => row.map((val, j) => i === j ? val + 1e-6 : val))
    ) ?? this.identity(n);
  }

  private static _gaussJordanInverse(matrix: number[][]): number[][] | null {
    const n = matrix.length;
    const a = matrix.map((row, i) => {
      const augRow = [...row, ...Array(n).fill(0)];
      augRow[n + i] = 1;
      return augRow;
    });

    for (let col = 0; col < n; col++) {
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(a[row][col]) > Math.abs(a[maxRow][col])) maxRow = row;
      }
      [a[col], a[maxRow]] = [a[maxRow], a[col]];

      const pivot = a[col][col];
      if (Math.abs(pivot) < 1e-14) return null;

      for (let k = 0; k < 2 * n; k++) a[col][k] /= pivot;

      for (let row = 0; row < n; row++) {
        if (row !== col) {
          const factor = a[row][col];
          for (let k = 0; k < 2 * n; k++) {
            a[row][k] -= factor * a[col][k];
          }
        }
      }
    }

    return a.map(row => row.slice(n));
  }
}

/**
 * Statistical Functions
 */
export class Statistics {
  static mean(values: number[]): number {
    if (!values || values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  static variance(values: number[], unbiased: boolean = true): number {
    if (!values || values.length === 0) return 0;
    const m = this.mean(values);
    const squaredDiffs = values.map(val => Math.pow(val - m, 2));
    const divisor = unbiased ? Math.max(1, values.length - 1) : values.length;
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / divisor;
  }

  static standardDeviation(values: number[], unbiased: boolean = true): number {
    return Math.sqrt(Math.max(0, this.variance(values, unbiased)));
  }

  static covariance(x: number[], y: number[], unbiased: boolean = true): number {
    const n = x.length;
    const meanX = this.mean(x);
    const meanY = this.mean(y);

    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += (x[i] - meanX) * (y[i] - meanY);
    }

    const divisor = unbiased ? n - 1 : n;
    return sum / divisor;
  }

  static correlation(x: number[], y: number[]): number {
    const cov = this.covariance(x, y);
    const stdX = this.standardDeviation(x);
    const stdY = this.standardDeviation(y);

    if (stdX === 0 || stdY === 0) return 0;
    return cov / (stdX * stdY);
  }

  static zScore(values: number[]): number[] {
    const m = this.mean(values);
    const sd = this.standardDeviation(values);

    if (sd === 0) return values.map(() => 0);
    return values.map(val => (val - m) / sd);
  }

  static standardize(data: number[][]): number[][] {
    const transposed = MatrixOps.transpose(data);
    const standardized = transposed.map(column => this.zScore(column));
    return MatrixOps.transpose(standardized);
  }
}

/**
 * Correlation Matrix Computation
 */
export class CorrelationMatrix {
  static compute(data: number[][], variables: string[]): CorrelationResult {
    const n = data.length;
    const p = data[0].length;
    const matrix: number[][] = Array(p).fill(0).map(() => Array(p).fill(0));

    const transposed = MatrixOps.transpose(data);

    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else {
          matrix[i][j] = Statistics.correlation(transposed[i], transposed[j]);
        }
      }
    }

    return { matrix, variables };
  }

  static computeCovariance(data: number[][], unbiased: boolean = true): number[][] {
    const transposed = MatrixOps.transpose(data);
    const p = transposed.length;
    const covMatrix: number[][] = Array(p).fill(0).map(() => Array(p).fill(0));

    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        covMatrix[i][j] = Statistics.covariance(transposed[i], transposed[j], unbiased);
      }
    }

    return covMatrix;
  }
}

/**
 * Eigenvalue Decomposition using Power Iteration and Deflation
 * This is a simplified implementation suitable for psychometric analysis
 */
export class EigenDecomposition {
  static compute(matrix: number[][], maxIterations: number = 1000, tolerance: number = 1e-6): EigenResult {
    const n = matrix.length;
    const eigenvalues: number[] = [];
    const eigenvectors: number[][] = [];

    let workingMatrix = MatrixOps.copy(matrix);

    for (let k = 0; k < n; k++) {
      const result = this.powerIteration(workingMatrix, maxIterations, tolerance);

      if (result.value < tolerance) break;

      eigenvalues.push(result.value);
      eigenvectors.push(result.vector);

      workingMatrix = this.deflate(workingMatrix, result.value, result.vector);
    }

    return {
      values: eigenvalues,
      vectors: eigenvectors
    };
  }

  private static powerIteration(matrix: number[][], maxIterations: number, tolerance: number): { value: number; vector: number[] } {
    const n = matrix.length;
    let vector = Array(n).fill(0).map(() => Math.random() - 0.5);
    vector = this.normalize(vector);

    let eigenvalue = 0;

    for (let iter = 0; iter < maxIterations; iter++) {
      const newVector = this.matrixVectorMultiply(matrix, vector);
      const newEigenvalue = this.dotProduct(newVector, vector);

      const normalizedNew = this.normalize(newVector);

      if (Math.abs(newEigenvalue - eigenvalue) < tolerance) {
        return { value: newEigenvalue, vector: normalizedNew };
      }

      eigenvalue = newEigenvalue;
      vector = normalizedNew;
    }

    return { value: eigenvalue, vector };
  }

  private static deflate(matrix: number[][], eigenvalue: number, eigenvector: number[]): number[][] {
    const n = matrix.length;
    const result = MatrixOps.copy(matrix);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result[i][j] -= eigenvalue * eigenvector[i] * eigenvector[j];
      }
    }

    return result;
  }

  private static matrixVectorMultiply(matrix: number[][], vector: number[]): number[] {
    const n = matrix.length;
    const result = Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result[i] += matrix[i][j] * vector[j];
      }
    }

    return result;
  }

  private static normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) return vector;
    return vector.map(val => val / norm);
  }

  private static dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }
}

/**
 * Factor Rotation - Varimax
 */
export class FactorRotation {
  /**
   * Varimax rotation (Kaiser, 1958) with Kaiser row normalization, using the
   * classical planar-rotation criterion — matches R's stats::varimax defaults.
   */
  static varimax(loadings: number[][], maxIterations: number = 100, tolerance: number = 1e-8): number[][] {
    const p = loadings.length;      // items
    const m = loadings[0].length;   // factors
    if (m < 2) return MatrixOps.copy(loadings);

    // Kaiser normalization: scale each row to unit communality before rotating.
    const h = loadings.map((row) => Math.sqrt(row.reduce((s, v) => s + v * v, 0)) || 1);
    let A = loadings.map((row, k) => row.map((v) => v / h[k]));

    for (let iter = 0; iter < maxIterations; iter++) {
      let rotated = false;
      for (let i = 0; i < m - 1; i++) {
        for (let j = i + 1; j < m; j++) {
          // Classical pairwise varimax angle (e.g., Harman, 1976, ch. 14):
          //   u_k = x_ki^2 - x_kj^2,  v_k = 2 x_ki x_kj
          //   num = 2( p*Σuv - Σu Σv ),  den = p*Σ(u²-v²) - ((Σu)² - (Σv)²)
          let su = 0, sv = 0, suv = 0, su2v2 = 0;
          for (let k = 0; k < p; k++) {
            const u = A[k][i] * A[k][i] - A[k][j] * A[k][j];
            const v = 2 * A[k][i] * A[k][j];
            su += u; sv += v; suv += u * v; su2v2 += u * u - v * v;
          }
          const num = 2 * (p * suv - su * sv);
          const den = p * su2v2 - (su * su - sv * sv);
          const angle = 0.25 * Math.atan2(num, den);
          if (Math.abs(angle) <= tolerance) continue;

          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          for (let k = 0; k < p; k++) {
            const xi = A[k][i];
            const xj = A[k][j];
            A[k][i] = xi * cos + xj * sin;
            A[k][j] = -xi * sin + xj * cos;
          }
          rotated = true;
        }
      }
      if (!rotated) break;
    }

    // Undo Kaiser normalization.
    return A.map((row, k) => row.map((v) => v * h[k]));
  }

  /**
   * Promax oblique rotation (Hendrickson & White, 1964) — the same algorithm
   * as R psych::Promax. Returns the pattern matrix and factor correlations.
   */
  static promax(loadings: number[][], power: number = 4): { loadings: number[][]; correlations: number[][] } {
    const V = this.varimax(loadings);
    const p = V.length;
    const m = V[0].length;
    if (m < 2) return { loadings: V, correlations: MatrixOps.identity(m) };

    // Target: element-wise |v|^power with original signs.
    const Q: number[][] = V.map((row) => row.map((v) => Math.sign(v) * Math.pow(Math.abs(v), power)));

    // Least-squares transformation U = (V'V)^-1 V'Q
    const Vt = MatrixOps.transpose(V);
    const VtV = MatrixOps.multiply(Vt, V);
    let U = MatrixOps.multiply(MatrixOps.multiply(MatrixOps.inverse(VtV), Vt), Q);

    // Rescale columns of U so the implied factor variances are 1:
    // d = diag((U'U)^-1); U <- U * diag(sqrt(d))
    const UtUinv = MatrixOps.inverse(MatrixOps.multiply(MatrixOps.transpose(U), U));
    const d = UtUinv.map((row, i) => Math.sqrt(row[i]));
    U = U.map((row) => row.map((v, j) => v * d[j]));

    // Pattern matrix and factor correlation matrix.
    const pattern = MatrixOps.multiply(V, U);
    const Uinv = MatrixOps.inverse(U);
    const phi = MatrixOps.multiply(Uinv, MatrixOps.transpose(Uinv));

    // Clean tiny numerical noise on the diagonal.
    for (let i = 0; i < m; i++) phi[i][i] = 1;

    return { loadings: pattern, correlations: phi };
  }
}

/**
 * Kaiser-Meyer-Olkin (KMO) Measure of Sampling Adequacy
 */
export class KMO {
  static compute(correlationMatrix: number[][]): { overall: number; individual: number[] } {
    const n = correlationMatrix.length;
    const partialCorrelations = this.computePartialCorrelations(correlationMatrix);

    let sumR2 = 0;
    let sumP2 = 0;
    const individual: number[] = Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      let rowR2 = 0;
      let rowP2 = 0;

      for (let j = 0; j < n; j++) {
        if (i !== j) {
          rowR2 += Math.pow(correlationMatrix[i][j], 2);
          rowP2 += Math.pow(partialCorrelations[i][j], 2);
        }
      }

      sumR2 += rowR2;
      sumP2 += rowP2;
      individual[i] = rowR2 / (rowR2 + rowP2);
    }

    const overall = sumR2 / (sumR2 + sumP2);

    return { overall, individual };
  }

  /**
   * Compute partial correlations using the precision matrix (inverse of the correlation matrix).
   * True partial correlation: r_{ij|rest} = -P_{ij} / sqrt(P_{ii} * P_{jj})
   * where P = R^{-1} (the precision matrix).
   */
  private static computePartialCorrelations(correlationMatrix: number[][]): number[][] {
    const n = correlationMatrix.length;
    const inv = MatrixOps.inverse(correlationMatrix);
    const result: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          result[i][j] = 1;
        } else {
          const denom = Math.sqrt(inv[i][i] * inv[j][j]);
          result[i][j] = denom > 0 ? -inv[i][j] / denom : 0;
        }
      }
    }

    return result;
  }
}

/**
 * Bartlett's Test of Sphericity
 */
export class BartlettTest {
  static compute(correlationMatrix: number[][], n: number): { chisq: number; df: number; p: number } {
    const p = correlationMatrix.length;

    let logDet = this.logDeterminantLU(correlationMatrix);
    // Clamp to avoid log(0)
    if (!isFinite(logDet)) logDet = Math.log(1e-10);

    const chisq = -(n - 1 - (2 * p + 5) / 6) * logDet;
    const df = (p * (p - 1)) / 2;

    const p_value = this.chiSquarePValue(chisq, df);

    return { chisq, df, p: p_value };
  }

  /**
   * Compute log(|det(A)|) using LU decomposition with partial pivoting.
   * O(n^3) — numerically stable even for large matrices.
   */
  private static logDeterminantLU(matrix: number[][]): number {
    const n = matrix.length;
    const a = matrix.map(row => [...row]);
    let swaps = 0;
    let logAbsDet = 0;

    for (let col = 0; col < n; col++) {
      // Partial pivoting
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(a[row][col]) > Math.abs(a[maxRow][col])) maxRow = row;
      }
      if (maxRow !== col) {
        [a[col], a[maxRow]] = [a[maxRow], a[col]];
        swaps++;
      }
      if (Math.abs(a[col][col]) < 1e-14) return -Infinity;
      logAbsDet += Math.log(Math.abs(a[col][col]));
      for (let row = col + 1; row < n; row++) {
        const factor = a[row][col] / a[col][col];
        for (let k = col; k < n; k++) {
          a[row][k] -= factor * a[col][k];
        }
      }
    }
    return logAbsDet;
  }

  private static chiSquarePValue(chisq: number, df: number): number {
    if (chisq <= 0 || df <= 0) return 1;
    // p = Q(df/2, chisq/2), the upper regularized incomplete gamma function.
    return Math.max(0, Math.min(1, this.gammaQ(df / 2, chisq / 2)));
  }

  /**
   * Upper regularized incomplete gamma Q(k, x) = 1 - P(k, x).
   * Series expansion for x < k+1, Lentz continued fraction otherwise
   * (Numerical Recipes §6.2) — stable for arbitrarily large x, where the
   * naive series underflows and wrongly returns p = 1.
   */
  private static gammaQ(k: number, x: number): number {
    if (x < 0 || k <= 0) return 1;
    if (x === 0) return 1;

    if (x < k + 1) {
      // P(k,x) by series: P = e^{-x} x^k / Γ(k) · Σ x^n / (k(k+1)...(k+n))
      let ap = k;
      let sum = 1 / k;
      let del = sum;
      for (let i = 0; i < 500; i++) {
        ap += 1;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
      }
      const logP = -x + k * Math.log(x) - this.logGamma(k);
      return 1 - sum * Math.exp(logP);
    }

    // Q(k,x) by modified Lentz continued fraction.
    const FPMIN = 1e-300;
    let b = x + 1 - k;
    let c = 1 / FPMIN;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= 500; i++) {
      const an = -i * (i - k);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-14) break;
    }
    const logQ = -x + k * Math.log(x) - this.logGamma(k);
    return Math.exp(logQ) * h;
  }

  private static logGamma(z: number): number {
    // Lanczos approximation for log(Gamma(z))
    const g = 7;
    const c = [
      0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
    ];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - this.logGamma(1 - z);
    z -= 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
}
