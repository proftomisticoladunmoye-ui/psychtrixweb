/**
 * Classical Test Theory (CTT) Implementation
 * Item analysis, reliability, and test statistics
 */

import { Statistics } from './psychometricStats';

export interface CTTResults {
  reliability: {
    cronbachAlpha: number;
    standardizedAlpha: number;
    guttmanLambda2: number;
    guttmanLambda6: number;
    splitHalf: {
      spearmanBrown: number;
      guttmanSplit: number;
    };
  };
  itemAnalysis: Array<{
    item: string;
    mean: number;
    sd: number;
    itemTotal: number;
    itemRest: number;
    alphaIfDeleted: number;
    difficulty: number;
    discrimination: number;
  }>;
  descriptiveStats: {
    n: number;
    mean: number;
    median: number;
    sd: number;
    variance: number;
    min: number;
    max: number;
    skewness: number;
    kurtosis: number;
    sem: number;
  };
  scoringDistribution: Array<{
    score: number;
    frequency: number;
    percentage: number;
    cumulative: number;
  }>;
}

/**
 * CTT Analyzer
 */
export class CTTAnalyzer {
  /**
   * Comprehensive CTT analysis
   */
  static analyze(data: number[][], itemNames: string[]): CTTResults {
    const n = data.length;
    const p = data[0].length;

    const totalScores = data.map(row => row.reduce((sum, val) => sum + val, 0));

    const descriptiveStats = this.calculateDescriptiveStats(totalScores);

    const itemAnalysis = this.analyzeItems(data, itemNames, totalScores);

    const reliability = this.calculateReliability(data, itemAnalysis);

    const scoringDistribution = this.calculateScoringDistribution(totalScores);

    return {
      reliability,
      itemAnalysis,
      descriptiveStats,
      scoringDistribution
    };
  }

  /**
   * Calculate Cronbach's Alpha
   */
  static calculateCronbachAlpha(data: number[][]): number {
    const k = data[0].length;

    const itemVariances = Array(k).fill(0).map((_, i) => {
      const column = data.map(row => row[i]);
      return Statistics.variance(column);
    });

    const totalScores = data.map(row => row.reduce((sum, val) => sum + val, 0));
    const totalVariance = Statistics.variance(totalScores);

    const sumItemVar = itemVariances.reduce((sum, v) => sum + v, 0);

    if (k < 2 || totalVariance === 0) return 0;

    return (k / (k - 1)) * (1 - sumItemVar / totalVariance);
  }

  /**
   * Calculate standardized alpha
   */
  static calculateStandardizedAlpha(correlationMatrix: number[][]): number {
    const k = correlationMatrix.length;

    let sumCorr = 0;
    let count = 0;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        if (i !== j) {
          sumCorr += correlationMatrix[i][j];
          count++;
        }
      }
    }

    const avgCorr = count > 0 ? sumCorr / count : 0;

    return (k * avgCorr) / (1 + (k - 1) * avgCorr);
  }

  /**
   * Calculate Guttman's Lambda-2
   * λ₂ = α + sqrt(k/(k-1) * (E_ii^2) / σ_t^4)
   * where E_ii^2 = sum of squared off-diagonal elements of the covariance matrix
   * Lambda-2 is always >= Cronbach's Alpha and is a better lower bound for reliability.
   */
  static calculateGuttmanLambda2(data: number[][]): number {
    const k = data[0].length;
    const columns = Array.from({ length: k }, (_, i) => data.map(row => row[i]));

    const totalScores = data.map(row => row.reduce((sum, val) => sum + val, 0));
    const totalVar = Statistics.variance(totalScores);
    if (totalVar === 0) return 0;

    // Build covariance matrix
    const cov: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < k; i++) {
      for (let j = i; j < k; j++) {
        const c = Statistics.covariance(columns[i], columns[j]);
        cov[i][j] = c;
        cov[j][i] = c;
      }
    }

    // Sum of squared off-diagonal covariances
    let sumSqOffDiag = 0;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        if (i !== j) sumSqOffDiag += cov[i][j] * cov[i][j];
      }
    }

    const alpha = this.calculateCronbachAlpha(data);
    const correction = Math.sqrt((k / (k - 1)) * sumSqOffDiag / (totalVar * totalVar));
    return Math.min(1, alpha + correction);
  }

  /**
   * Calculate Guttman's Lambda-6
   * λ₆ = 1 - (Σ unique_variance_i) / σ_t²
   * where unique_variance_i = σ_i² × (1 - SMC_i)
   * and SMC_i = squared multiple correlation of item i with all others
   */
  static calculateGuttmanLambda6(data: number[][]): number {
    const k = data[0].length;
    const totalScores = data.map(row => row.reduce((sum, val) => sum + val, 0));
    const totalVar = Statistics.variance(totalScores);
    if (totalVar === 0) return 0;

    let sumUniqueVar = 0;
    for (let i = 0; i < k; i++) {
      const itemColumn = data.map(row => row[i]);
      const itemVar = Statistics.variance(itemColumn);

      // SMC: squared correlation of item i with the sum of all other items
      const otherItems = data.map(row =>
        row.reduce((sum, val, idx) => idx !== i ? sum + val : sum, 0)
      );
      const corr = Statistics.correlation(itemColumn, otherItems);
      const smc = corr * corr;

      // Unique variance = item variance × (1 - SMC)
      sumUniqueVar += itemVar * (1 - smc);
    }

    return Math.min(1, Math.max(0, 1 - sumUniqueVar / totalVar));
  }

  /**
   * Split-half reliability
   */
  static calculateSplitHalf(data: number[][]): { spearmanBrown: number; guttmanSplit: number } {
    const k = data[0].length;
    const halfPoint = Math.floor(k / 2);

    const half1Scores = data.map(row =>
      row.slice(0, halfPoint).reduce((sum, val) => sum + val, 0)
    );

    const half2Scores = data.map(row =>
      row.slice(halfPoint).reduce((sum, val) => sum + val, 0)
    );

    const corr = Statistics.correlation(half1Scores, half2Scores);

    const spearmanBrown = (2 * corr) / (1 + corr);

    const var1 = Statistics.variance(half1Scores);
    const var2 = Statistics.variance(half2Scores);
    const totalScores = data.map((_, i) => half1Scores[i] + half2Scores[i]);
    const totalVar = Statistics.variance(totalScores);

    const guttmanSplit = 2 * (1 - (var1 + var2) / totalVar);

    return {
      spearmanBrown,
      guttmanSplit
    };
  }

  /**
   * Item-total correlation
   */
  static calculateItemTotalCorrelation(itemScores: number[], totalScores: number[]): number {
    return Statistics.correlation(itemScores, totalScores);
  }

  /**
   * Item-rest correlation (corrected item-total)
   */
  static calculateItemRestCorrelation(itemScores: number[], totalScores: number[]): number {
    const restScores = itemScores.map((score, i) => totalScores[i] - score);
    return Statistics.correlation(itemScores, restScores);
  }

  /**
   * Item difficulty (proportion correct for binary items, or mean for Likert)
   */
  static calculateItemDifficulty(itemScores: number[], maxScore: number = 1): number {
    if (maxScore === 0) return 0;
    const mean = Statistics.mean(itemScores);
    return mean / maxScore;
  }

  /**
   * Item discrimination (correlation with total score)
   */
  static calculateItemDiscrimination(itemScores: number[], totalScores: number[]): number {
    return Math.abs(this.calculateItemTotalCorrelation(itemScores, totalScores));
  }

  /**
   * Alpha if item deleted
   */
  static calculateAlphaIfDeleted(data: number[][], itemIndex: number): number {
    const reducedData = data.map(row =>
      row.filter((_, idx) => idx !== itemIndex)
    );

    return this.calculateCronbachAlpha(reducedData);
  }

  /**
   * Comprehensive item analysis
   */
  private static analyzeItems(
    data: number[][],
    itemNames: string[],
    totalScores: number[]
  ): Array<any> {
    const results: Array<any> = [];

    const k = data[0].length;
    for (let i = 0; i < k; i++) {
      const itemScores = data.map(row => row[i]);

      const mean = Statistics.mean(itemScores);
      const sd = Statistics.standardDeviation(itemScores);

      const itemTotal = this.calculateItemTotalCorrelation(itemScores, totalScores);
      const itemRest = this.calculateItemRestCorrelation(itemScores, totalScores);

      const alphaIfDeleted = this.calculateAlphaIfDeleted(data, i);

      const maxScore = Math.max(...itemScores);
      const difficulty = this.calculateItemDifficulty(itemScores, maxScore);

      const discrimination = this.calculateItemDiscrimination(itemScores, totalScores);

      results.push({
        item: itemNames[i] || `Item_${i + 1}`,
        mean: parseFloat(mean.toFixed(3)),
        sd: parseFloat(sd.toFixed(3)),
        itemTotal: parseFloat(itemTotal.toFixed(3)),
        itemRest: parseFloat(itemRest.toFixed(3)),
        alphaIfDeleted: parseFloat(alphaIfDeleted.toFixed(3)),
        difficulty: parseFloat(difficulty.toFixed(3)),
        discrimination: parseFloat(discrimination.toFixed(3))
      });
    }

    return results;
  }

  /**
   * Calculate reliability metrics
   */
  private static calculateReliability(
    data: number[][],
    itemAnalysis: Array<any>
  ): any {
    const cronbachAlpha = this.calculateCronbachAlpha(data);

    const correlationMatrix = this.buildCorrelationMatrix(data);
    const standardizedAlpha = this.calculateStandardizedAlpha(correlationMatrix);

    const guttmanLambda2 = this.calculateGuttmanLambda2(data);
    const guttmanLambda6 = this.calculateGuttmanLambda6(data);

    const splitHalf = this.calculateSplitHalf(data);

    return {
      cronbachAlpha: parseFloat(cronbachAlpha.toFixed(3)),
      standardizedAlpha: parseFloat(standardizedAlpha.toFixed(3)),
      guttmanLambda2: parseFloat(guttmanLambda2.toFixed(3)),
      guttmanLambda6: parseFloat(guttmanLambda6.toFixed(3)),
      splitHalf: {
        spearmanBrown: parseFloat(splitHalf.spearmanBrown.toFixed(3)),
        guttmanSplit: parseFloat(splitHalf.guttmanSplit.toFixed(3))
      }
    };
  }

  /**
   * Build correlation matrix for items
   */
  private static buildCorrelationMatrix(data: number[][]): number[][] {
    const k = data[0].length;
    const matrix: number[][] = Array(k).fill(0).map(() => Array(k).fill(0));

    const columns = Array(k).fill(0).map((_, i) => data.map(row => row[i]));

    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else {
          matrix[i][j] = Statistics.correlation(columns[i], columns[j]);
        }
      }
    }

    return matrix;
  }

  /**
   * Calculate descriptive statistics
   */
  private static calculateDescriptiveStats(scores: number[]): any {
    const n = scores.length;
    const mean = Statistics.mean(scores);
    const sd = Statistics.standardDeviation(scores);
    const variance = Statistics.variance(scores);

    const sorted = [...scores].sort((a, b) => a - b);
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    const min = Math.min(...scores);
    const max = Math.max(...scores);

    const skewness = this.calculateSkewness(scores, mean, sd);
    const kurtosis = this.calculateKurtosis(scores, mean, sd);

    // sem here is the standard error of the mean (sampling precision of the mean estimate)
    const sem = sd / Math.sqrt(n);

    return {
      n,
      mean: parseFloat(mean.toFixed(2)),
      median: parseFloat(median.toFixed(2)),
      sd: parseFloat(sd.toFixed(2)),
      variance: parseFloat(variance.toFixed(2)),
      min: parseFloat(min.toFixed(2)),
      max: parseFloat(max.toFixed(2)),
      skewness: parseFloat(skewness.toFixed(3)),
      kurtosis: parseFloat(kurtosis.toFixed(3)),
      sem: parseFloat(sem.toFixed(3))
    };
  }

  /**
   * Calculate skewness
   */
  private static calculateSkewness(values: number[], mean: number, sd: number): number {
    const n = values.length;
    if (n < 3 || sd === 0) return 0;

    const sum = values.reduce((acc, val) => acc + Math.pow((val - mean) / sd, 3), 0);

    return (n / ((n - 1) * (n - 2))) * sum;
  }

  /**
   * Calculate kurtosis
   */
  private static calculateKurtosis(values: number[], mean: number, sd: number): number {
    const n = values.length;
    if (n < 4 || sd === 0) return 0;

    const sum = values.reduce((acc, val) => acc + Math.pow((val - mean) / sd, 4), 0);

    const numerator = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
    const adjustment = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));

    return numerator * sum - adjustment;
  }

  /**
   * Calculate scoring distribution
   */
  private static calculateScoringDistribution(scores: number[]): Array<any> {
    const freq: Map<number, number> = new Map();

    scores.forEach(score => {
      const rounded = Math.round(score * 10) / 10;
      freq.set(rounded, (freq.get(rounded) || 0) + 1);
    });

    const total = scores.length;
    const distribution: Array<any> = [];

    const sortedScores = Array.from(freq.keys()).sort((a, b) => a - b);
    let cumulative = 0;

    sortedScores.forEach(score => {
      const frequency = freq.get(score) || 0;
      const percentage = (frequency / total) * 100;
      cumulative += percentage;

      distribution.push({
        score: parseFloat(score.toFixed(1)),
        frequency,
        percentage: parseFloat(percentage.toFixed(2)),
        cumulative: parseFloat(cumulative.toFixed(2))
      });
    });

    return distribution;
  }

  /**
   * Calculate standard error of measurement
   */
  static calculateSEM(sd: number, reliability: number): number {
    return sd * Math.sqrt(1 - reliability);
  }

  /**
   * Calculate confidence interval for true score
   */
  static calculateConfidenceInterval(
    observedScore: number,
    sem: number,
    confidenceLevel: number = 0.95
  ): { lower: number; upper: number } {
    const zScore = confidenceLevel === 0.95 ? 1.96 :
                   confidenceLevel === 0.99 ? 2.576 : 1.645;

    const margin = zScore * sem;

    return {
      lower: observedScore - margin,
      upper: observedScore + margin
    };
  }
}
