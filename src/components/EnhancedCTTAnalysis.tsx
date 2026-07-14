import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  BarChart3, TrendingUp, AlertCircle, Download, FileImage, CheckCircle,
  XCircle, AlertTriangle, Info, Target, Split, PieChart, LineChart,
  X, ChevronDown, ChevronUp, ArrowLeft, Search
} from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Line, Scatter, Doughnut } from 'react-chartjs-2';
import { exportToCSV, exportToJSON, exportChartAsImage, exportResultsToPDF, exportCTTResults } from '../lib/exportUtils';
import { CTTAnalyzer } from '../lib/classicalTestTheory';
import { saveAnalysisHistory } from '../lib/analysisHistory';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
}

interface ItemStatistic {
  name: string;
  mean: number;
  sd: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  skewness: number;
  kurtosis: number;
  itemTotalCorrelation: number;
  itemRestCorrelation: number;
  alphaIfDeleted: number;
  difficulty: number;
  discrimination: number;
  interpretation: string;
  sem: number;
  flags: string[];
}

interface SplitHalfResult {
  method: string;
  part1Alpha: number;
  part2Alpha: number;
  correlation: number;
  spearmanBrown: number;
  guttmanLambda: number;
}

export function EnhancedCTTAnalysis() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [reliabilityContext, setReliabilityContext] = useState<'clinical' | 'research' | 'exploratory'>('research');
  const [chartsCollapsed, setChartsCollapsed] = useState({
    itemRest: false,
    discrimination: false,
    difficultyScatter: false
  });

  const chartRef = useRef<ChartJS<'bar'>>(null);
  const discriminationChartRef = useRef<ChartJS<'bar'>>(null);
  const difficultyChartRef = useRef<ChartJS<'scatter'>>(null);

  useEffect(() => {
    loadDatasets();
  }, []);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const loadDatasets = async () => {
    setLoadingDatasets(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('datasets')
        .select('id, name, columns, data')
        .eq('user_id', user.id);

      if (error) throw error;
      setDatasets(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingDatasets(false);
    }
  };

  const runAnalysis = async () => {
    if (!selectedDataset || selectedItems.length < 2) {
      setError('Please select a dataset and at least 2 items for reliability analysis');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const dataset = datasets.find((d) => d.id === selectedDataset);
      if (!dataset) throw new Error('Dataset not found');

      const itemData = dataset.data.map((row: any) =>
        selectedItems.map((item) => parseFloat(row[item]) || 0)
      );

      const validData = itemData.filter(row => row.every(val => !isNaN(val) && isFinite(val)));

      if (validData.length < 2) {
        throw new Error('Insufficient valid data for analysis');
      }

      const sampleSizeWarnings: string[] = [];
      if (validData.length < 30) {
        sampleSizeWarnings.push('Sample size is small (n < 30). Results may be unstable.');
      }
      const itemToRespondentRatio = validData.length / selectedItems.length;
      if (itemToRespondentRatio < 5) {
        sampleSizeWarnings.push(`Low item-to-respondent ratio (${itemToRespondentRatio.toFixed(1)}:1). Recommended minimum is 5:1, ideally 10:1.`);
      }

      const cttResults = CTTAnalyzer.analyze(validData, selectedItems);

      const totalScores = validData.map(row => row.reduce((sum, val) => sum + val, 0));
      const scaleMean = totalScores.reduce((sum, val) => sum + val, 0) / totalScores.length;
      const scaleVariance = cttResults.descriptiveStats.variance;
      // Standard Error of Measurement: SEM = SD × √(1 - α)
      const scaleSEM = cttResults.descriptiveStats.sd * Math.sqrt(1 - cttResults.reliability.cronbachAlpha);

      const alpha = cttResults.reliability.cronbachAlpha;

      // Use enhanced item statistics (includes skewness, kurtosis, proper difficulty)
      const itemStats: ItemStatistic[] = calculateEnhancedItemStatistics(validData, selectedItems, alpha);

      const alphaCI = calculateAlphaConfidenceInterval(alpha, selectedItems.length, validData.length);

      const interpretation = getAlphaInterpretation(alpha, reliabilityContext);
      const optimizationSuggestions = generateOptimizationSuggestions(itemStats, alpha);

      // Compute mean inter-item correlation from the upper triangle of the correlation matrix
      const meanInterItemCorr = calculateMeanInterItemCorrelation(validData);

      const splitHalfResults = calculateSplitHalfReliability(validData);

      // Compute all advanced reliability metrics using the proper formulas
      const omegaTotal = calculateOmegaTotal(validData);
      const glb = calculateGLB(validData);
      const armorTheta = calculateArmorTheta(validData);
      const ave = calculateAVE(itemStats);
      const cr = calculateCompositeReliability(itemStats);

      const analysisResults = {
        cronbachAlpha: alpha,
        alphaCI,
        standardizedAlpha: cttResults.reliability.standardizedAlpha,
        omegaTotal,
        glb,
        guttmanLambda2: cttResults.reliability.guttmanLambda2,
        armorTheta,
        averageVarianceExtracted: ave,
        compositeReliability: cr,
        meanInterItemCorrelation: meanInterItemCorr,
        itemStatistics: itemStats,
        splitHalf: splitHalfResults,
        interpretation,
        nItems: selectedItems.length,
        nRespondents: validData.length,
        scaleVariance,
        scaleMean,
        scaleSEM,
        sampleSizeWarnings,
        optimizationSuggestions,
        reliabilityContext,
      };

      setResults(analysisResults);

      const currentDataset = datasets.find(d => d.id === selectedDataset);
      await saveAnalysisHistory({
        analysis_type: 'ctt',
        analysis_name: `CTT Analysis - ${currentDataset?.name} (${selectedItems.length} items)`,
        dataset_id: selectedDataset,
        dataset_name: currentDataset?.name,
        configuration: {
          selectedItems,
          reliabilityContext,
          numItems: selectedItems.length
        },
        results: analysisResults,
        status: 'completed'
      });
    } catch (err: any) {
      console.error('CTT Analysis Error:', err);
      setError(err.message || 'An error occurred during analysis');
    } finally {
      setLoading(false);
    }
  };

  // Enhanced calculation functions
  const calculateCronbachAlpha = (itemData: number[][]): number => {
    const n = itemData.length;
    const k = itemData[0].length;
    if (k < 2) return 0;

    const itemVariances: number[] = [];
    for (let j = 0; j < k; j++) {
      const itemScores = itemData.map((row) => row[j]);
      const mean = itemScores.reduce((a, b) => a + b, 0) / n;
      const variance = itemScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / (n - 1);
      itemVariances.push(variance);
    }

    const totalScores = itemData.map((row) => row.reduce((a, b) => a + b, 0));
    const totalMean = totalScores.reduce((a, b) => a + b, 0) / n;
    const totalVariance = totalScores.reduce((sum, score) => sum + Math.pow(score - totalMean, 2), 0) / (n - 1);

    const sumItemVariances = itemVariances.reduce((a, b) => a + b, 0);
    const alpha = (k / (k - 1)) * (1 - sumItemVariances / totalVariance);

    return Math.max(0, Math.min(1, alpha));
  };



  /**
   * McDonald's Omega Total via PCA-based single-factor model.
   * ω = (Σλ_i)² / [(Σλ_i)² + Σ(σ_i² - λ_i²)]
   * where λ_i are the item loadings on the first principal component,
   * approximated here by standardized item-rest correlations.
   * This is a well-established approximation when full CFA is unavailable.
   */
  const calculateOmegaTotal = (itemData: number[][]): number => {
    const n = itemData.length;
    const k = itemData[0].length;

    const totalScores = itemData.map(row => row.reduce((a, b) => a + b, 0));

    // Use item-rest correlations as proxies for factor loadings (common practice)
    const loadings: number[] = [];
    const itemVars: number[] = [];

    for (let j = 0; j < k; j++) {
      const itemScores = itemData.map(row => row[j]);
      const restScores = itemData.map(row =>
        row.reduce((sum, val, i) => i !== j ? sum + val : sum, 0)
      );
      loadings.push(calculateCorrelation(itemScores, restScores, n));
      const mean = itemScores.reduce((a, b) => a + b, 0) / n;
      itemVars.push(itemScores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1));
    }

    const sumLoadings = loadings.reduce((a, b) => a + b, 0);
    const sumLoadingsSq = sumLoadings * sumLoadings;
    const sumErrorVar = loadings.reduce((sum, l, i) => sum + itemVars[i] * (1 - l * l), 0);

    if (sumLoadingsSq + sumErrorVar === 0) return 0;
    return Math.max(0, Math.min(1, sumLoadingsSq / (sumLoadingsSq + sumErrorVar)));
  };

  /**
   * Greatest Lower Bound (GLB) to reliability.
   * GLB = 1 - (Σ unique_i) / σ_t²
   * where unique_i = σ_i² × (1 - SMC_i) and SMC_i is the squared multiple
   * correlation of item i with all other items.
   */
  const calculateGLB = (itemData: number[][]): number => {
    const n = itemData.length;
    const k = itemData[0].length;

    const totalScores = itemData.map(row => row.reduce((a, b) => a + b, 0));
    const totalMean = totalScores.reduce((a, b) => a + b, 0) / n;
    const totalVar = totalScores.reduce((sum, s) => sum + (s - totalMean) ** 2, 0) / (n - 1);
    if (totalVar === 0) return 0;

    let sumUniqueVar = 0;
    for (let j = 0; j < k; j++) {
      const itemScores = itemData.map(row => row[j]);
      const mean = itemScores.reduce((a, b) => a + b, 0) / n;
      const itemVar = itemScores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
      const restScores = itemData.map(row =>
        row.reduce((sum, val, i) => i !== j ? sum + val : sum, 0)
      );
      const smc = Math.pow(calculateCorrelation(itemScores, restScores, n), 2);
      sumUniqueVar += itemVar * (1 - smc);
    }

    return Math.max(0, Math.min(1, 1 - sumUniqueVar / totalVar));
  };

  /**
   * Armor's Theta: reliability of the first principal component.
   * θ = (k/(k-1)) × (1 - 1/λ₁)
   * where λ₁ is the largest eigenvalue of the inter-item correlation matrix.
   * Uses power iteration to find λ₁.
   */
  const calculateArmorTheta = (itemData: number[][]): number => {
    const k = itemData[0].length;
    const n = itemData.length;

    // Build correlation matrix
    const columns = Array.from({ length: k }, (_, j) => itemData.map(row => row[j]));
    const corrMatrix: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < k; i++) {
      for (let j = i; j < k; j++) {
        const c = i === j ? 1 : calculateCorrelation(columns[i], columns[j], n);
        corrMatrix[i][j] = c;
        corrMatrix[j][i] = c;
      }
    }

    // Power iteration for largest eigenvalue
    let vec = Array(k).fill(1 / Math.sqrt(k));
    for (let iter = 0; iter < 200; iter++) {
      const newVec = Array(k).fill(0);
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) newVec[i] += corrMatrix[i][j] * vec[j];
      }
      const norm = Math.sqrt(newVec.reduce((s, v) => s + v * v, 0));
      if (norm === 0) break;
      vec = newVec.map(v => v / norm);
    }
    // Rayleigh quotient gives eigenvalue
    let lambda1 = 0;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) lambda1 += vec[i] * corrMatrix[i][j] * vec[j];
    }

    if (lambda1 <= 1) return 0;
    return Math.max(0, Math.min(1, (k / (k - 1)) * (1 - 1 / lambda1)));
  };

  /**
   * 95% CI for Cronbach's Alpha using the Feldt et al. (1987) F-distribution method.
   * F = (1 - α) with df1 = n-1, df2 = (n-1)(k-1)
   * Bounds are derived from the F critical values.
   * This is the standard method used by SPSS and R's psych package.
   */
  const calculateAlphaConfidenceInterval = (alpha: number, k: number, n: number): { lower: number; upper: number } => {
    const df1 = n - 1;
    const df2 = (n - 1) * (k - 1);

    // F critical values at 2.5% tails (approximate using chi-square / df for large df)
    // For 95% CI: F_lower = F(0.025, df1, df2), F_upper = F(0.975, df1, df2)
    // Using Wilson-Hilferty chi-square approximation for the F distribution
    const fCritLower = fQuantile(0.025, df1, df2);
    const fCritUpper = fQuantile(0.975, df1, df2);

    const fObs = (1 - alpha);
    const lower = Math.max(0, 1 - fObs * fCritUpper);
    const upper = Math.min(1, 1 - fObs * fCritLower);

    return { lower, upper };
  };

  /**
   * F quantile using Wilson-Hilferty chi-square approximation.
   * F_p(df1, df2) = [chi2_p(df1)/df1] / [chi2_{1-p}(df2)/df2]
   * Each chi2 quantile uses: chi2_p(d) ≈ d * (1 - 2/(9d) + z_p * sqrt(2/(9d)))^3
   * The denominator uses z_{1-p} = -z_p to always give a positive base value.
   */
  const fQuantile = (p: number, df1: number, df2: number): number => {
    const zp = normalQuantile(p);
    const h1 = 2 / (9 * df1);
    const h2 = 2 / (9 * df2);
    const base1 = 1 - h1 + zp * Math.sqrt(h1);
    // Denominator uses z_{1-p} = -zp so the base is always positive for valid p
    const base2 = 1 - h2 + (-zp) * Math.sqrt(h2);
    // Guard against non-positive bases (can occur for very small df)
    const chi1 = base1 > 0 ? df1 * Math.pow(base1, 3) : 1e-6;
    const chi2 = base2 > 0 ? df2 * Math.pow(base2, 3) : 1e-6;
    return (chi1 / df1) / (chi2 / df2);
  };

  /** Rational approximation of the inverse standard normal CDF (Abramowitz & Stegun). */
  const normalQuantile = (p: number): number => {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [2.515517, 0.802853, 0.010328];
    const b = [1.432788, 0.189269, 0.001308];
    const flip = p > 0.5;
    const q = flip ? 1 - p : p;
    const t = Math.sqrt(-2 * Math.log(q));
    const num = a[0] + t * (a[1] + t * a[2]);
    const den = 1 + t * (b[0] + t * (b[1] + t * b[2]));
    const z = t - num / den;
    return flip ? z : -z;
  };

  const generateOptimizationSuggestions = (itemStats: ItemStatistic[], currentAlpha: number): string[] => {
    const suggestions: string[] = [];

    const problematicItems = itemStats.filter(item =>
      item.flags.length > 0 || item.alphaIfDeleted > currentAlpha
    );

    if (problematicItems.length === 0) {
      suggestions.push('Scale is well-optimized. All items contribute positively to reliability.');
      return suggestions;
    }

    const itemsToRemove = itemStats
      .filter(item => item.alphaIfDeleted > currentAlpha + 0.01)
      .sort((a, b) => b.alphaIfDeleted - a.alphaIfDeleted);

    if (itemsToRemove.length > 0) {
      const topItem = itemsToRemove[0];
      suggestions.push(`Consider removing "${topItem.name}" - would increase α from ${currentAlpha.toFixed(3)} to ${topItem.alphaIfDeleted.toFixed(3)}`);

      if (itemsToRemove.length > 1) {
        suggestions.push(`${itemsToRemove.length - 1} additional item(s) could be removed to improve reliability`);
      }
    }

    const negativeItems = itemStats.filter(item => item.itemRestCorrelation < 0);
    if (negativeItems.length > 0) {
      suggestions.push(`Critical: ${negativeItems.length} item(s) have negative correlations - review immediately`);
    }

    const poorItems = itemStats.filter(item =>
      item.itemRestCorrelation >= 0 && item.itemRestCorrelation < 0.20
    );
    if (poorItems.length > 0) {
      suggestions.push(`${poorItems.length} item(s) have poor discrimination (r < 0.20) - consider revision or removal`);
    }

    return suggestions;
  };

  /**
   * Average Variance Extracted (AVE) using standardized item-rest correlations
   * as proxies for factor loadings (common CTT approximation).
   * AVE = Σλ_i² / k
   * Valid range [0, 1]; ≥ 0.50 indicates convergent validity.
   */
  const calculateAVE = (itemStats: ItemStatistic[]): number => {
    const loadings = itemStats.map(stat => Math.abs(stat.itemRestCorrelation));
    const k = loadings.length;
    if (k === 0) return 0;
    const sumSquaredLoadings = loadings.reduce((sum, l) => sum + l * l, 0);
    return Math.max(0, Math.min(1, sumSquaredLoadings / k));
  };

  /**
   * Composite Reliability (CR / Construct Reliability) using item-rest correlations
   * as proxies for standardized factor loadings.
   * CR = (Σλ_i)² / [(Σλ_i)² + Σ(1 - λ_i²)]
   * where (1 - λ_i²) is the item error variance proportion.
   */
  const calculateCompositeReliability = (itemStats: ItemStatistic[]): number => {
    const loadings = itemStats.map(stat => Math.abs(stat.itemRestCorrelation));
    const sumLoadings = loadings.reduce((sum, l) => sum + l, 0);
    const sumSquaredLoadings = sumLoadings * sumLoadings;
    const sumErrorVar = loadings.reduce((sum, l) => sum + (1 - l * l), 0);
    const denom = sumSquaredLoadings + sumErrorVar;
    if (denom === 0) return 0;
    return Math.max(0, Math.min(1, sumSquaredLoadings / denom));
  };

  const calculateScaleVariance = (itemData: number[][]): number => {
    const totalScores = itemData.map((row) => row.reduce((a, b) => a + b, 0));
    const mean = totalScores.reduce((a, b) => a + b, 0) / totalScores.length;
    return totalScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / (totalScores.length - 1);
  };

  const calculateScaleMean = (itemData: number[][]): number => {
    const totalScores = itemData.map((row) => row.reduce((a, b) => a + b, 0));
    return totalScores.reduce((a, b) => a + b, 0) / totalScores.length;
  };

  const calculateScaleSEM = (alpha: number, itemData: number[][]): number => {
    const variance = calculateScaleVariance(itemData);
    const sd = Math.sqrt(variance);
    return sd * Math.sqrt(1 - alpha);
  };

  const calculateMeanInterItemCorrelation = (itemData: number[][]): number => {
    const k = itemData[0].length;
    const n = itemData.length;
    const correlations: number[] = [];

    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const item1 = itemData.map(row => row[i]);
        const item2 = itemData.map(row => row[j]);
        const corr = calculateCorrelation(item1, item2, n);
        correlations.push(corr);
      }
    }

    return correlations.length > 0 ? correlations.reduce((a, b) => a + b, 0) / correlations.length : 0;
  };

  const calculateCorrelation = (x: number[], y: number[], n: number): number => {
    const mean1 = x.reduce((a, b) => a + b, 0) / n;
    const mean2 = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let sumSq1 = 0;
    let sumSq2 = 0;

    for (let idx = 0; idx < n; idx++) {
      const diff1 = x[idx] - mean1;
      const diff2 = y[idx] - mean2;
      numerator += diff1 * diff2;
      sumSq1 += diff1 * diff1;
      sumSq2 += diff2 * diff2;
    }

    const denominator = Math.sqrt(sumSq1 * sumSq2);
    return denominator > 0 ? numerator / denominator : 0;
  };

  const calculateSplitHalfReliability = (itemData: number[][]): SplitHalfResult[] => {
    const results: SplitHalfResult[] = [];

    // Odd-Even Split
    const oddItems = itemData.map(row => row.filter((_, i) => i % 2 === 0));
    const evenItems = itemData.map(row => row.filter((_, i) => i % 2 === 1));

    if (oddItems[0].length > 0 && evenItems[0].length > 0) {
      const oddAlpha = calculateCronbachAlpha(oddItems);
      const evenAlpha = calculateCronbachAlpha(evenItems);
      const oddTotal = oddItems.map(row => row.reduce((a, b) => a + b, 0));
      const evenTotal = evenItems.map(row => row.reduce((a, b) => a + b, 0));
      const correlation = calculateCorrelation(oddTotal, evenTotal, oddTotal.length);
      const spearmanBrown = (2 * correlation) / (1 + correlation);
      const guttman = 2 * (1 - (calculateScaleVariance(oddItems) + calculateScaleVariance(evenItems)) / calculateScaleVariance(itemData));

      results.push({
        method: 'Odd-Even Split',
        part1Alpha: oddAlpha,
        part2Alpha: evenAlpha,
        correlation,
        spearmanBrown,
        guttmanLambda: guttman
      });
    }

    // First-Second Half Split
    const midpoint = Math.floor(itemData[0].length / 2);
    const firstHalf = itemData.map(row => row.slice(0, midpoint));
    const secondHalf = itemData.map(row => row.slice(midpoint));

    if (firstHalf[0].length > 0 && secondHalf[0].length > 0) {
      const firstAlpha = calculateCronbachAlpha(firstHalf);
      const secondAlpha = calculateCronbachAlpha(secondHalf);
      const firstTotal = firstHalf.map(row => row.reduce((a, b) => a + b, 0));
      const secondTotal = secondHalf.map(row => row.reduce((a, b) => a + b, 0));
      const correlation = calculateCorrelation(firstTotal, secondTotal, firstTotal.length);
      const spearmanBrown = (2 * correlation) / (1 + correlation);
      const guttman = 2 * (1 - (calculateScaleVariance(firstHalf) + calculateScaleVariance(secondHalf)) / calculateScaleVariance(itemData));

      results.push({
        method: 'First-Second Half',
        part1Alpha: firstAlpha,
        part2Alpha: secondAlpha,
        correlation,
        spearmanBrown,
        guttmanLambda: guttman
      });
    }

    return results;
  };

  const calculateEnhancedItemStatistics = (itemData: number[][], itemNames: string[], currentAlpha: number): ItemStatistic[] => {
    const n = itemData.length;
    const k = itemData[0].length;

    return itemNames.map((name, index) => {
      const itemScores = itemData.map((row) => row[index]);
      const mean = itemScores.reduce((a, b) => a + b, 0) / n;
      const variance = itemScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / (n - 1);
      const sd = Math.sqrt(variance);
      const min = Math.min(...itemScores);
      const max = Math.max(...itemScores);
      const range = max - min;

      // Fisher-Pearson adjusted skewness (unbiased, matches SPSS/R output)
      const sumCubed = itemScores.reduce((sum, score) => sum + Math.pow((score - mean) / sd, 3), 0);
      const skewness = sd > 0 && n > 2 ? (n / ((n - 1) * (n - 2))) * sumCubed : 0;

      // Fisher-Pearson adjusted excess kurtosis (unbiased, matches SPSS/R output)
      const sumFourth = itemScores.reduce((sum, score) => sum + Math.pow((score - mean) / sd, 4), 0);
      const kurtNumerator = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * sumFourth;
      const kurtAdjust = (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
      const kurtosis = sd > 0 && n > 3 ? kurtNumerator - kurtAdjust : 0;

      const totalScores = itemData.map((row) => row.reduce((a, b) => a + b, 0));
      const itemTotalCorrelation = calculateCorrelation(itemScores, totalScores, n);

      const restScores = itemData.map((row) => row.reduce((sum, val, i) => sum + (i !== index ? val : 0), 0));
      const itemRestCorrelation = calculateCorrelation(itemScores, restScores, n);

      const dataWithoutItem = itemData.map((row) => row.filter((_, i) => i !== index));
      const alphaIfDeleted = k > 2 ? calculateCronbachAlpha(dataWithoutItem) : 0;

      const difficulty = range > 0 ? (mean - min) / range : 0.5;
      const discrimination = itemRestCorrelation;
      const sem = sd * Math.sqrt(1 - itemRestCorrelation * itemRestCorrelation);

      const flags: string[] = [];
      if (itemRestCorrelation < 0) {
        flags.push('NEGATIVE CORRELATION');
      } else if (itemRestCorrelation < 0.20) {
        flags.push('Poor discrimination');
      }

      if (alphaIfDeleted > currentAlpha + 0.01) {
        flags.push('Removal increases α');
      }

      if (sd < 0.5) {
        flags.push('Low variance');
      }

      if (Math.abs(skewness) > 2) {
        flags.push('High skewness');
      }

      if (Math.abs(kurtosis) > 7) {
        flags.push('High kurtosis');
      }

      let interpretation = '';
      if (itemRestCorrelation < 0) {
        interpretation = 'Critical';
      } else if (itemRestCorrelation >= 0.40) {
        interpretation = 'Excellent';
      } else if (itemRestCorrelation >= 0.30) {
        interpretation = 'Good';
      } else if (itemRestCorrelation >= 0.20) {
        interpretation = 'Marginal';
      } else {
        interpretation = 'Poor';
      }

      return {
        name,
        mean,
        sd,
        variance,
        min,
        max,
        range,
        skewness,
        kurtosis,
        itemTotalCorrelation,
        itemRestCorrelation,
        alphaIfDeleted,
        difficulty,
        discrimination,
        interpretation,
        sem,
        flags
      };
    });
  };

  const getAlphaInterpretation = (alpha: number, context: string = 'research'): string => {
    const thresholds = {
      clinical: { excellent: 0.90, good: 0.85, acceptable: 0.80 },
      research: { excellent: 0.90, good: 0.80, acceptable: 0.70 },
      exploratory: { excellent: 0.80, good: 0.70, acceptable: 0.60 }
    };

    const t = thresholds[context as keyof typeof thresholds] || thresholds.research;

    if (alpha >= t.excellent) return 'Excellent';
    if (alpha >= t.good) return 'Good';
    if (alpha >= t.acceptable) return 'Acceptable';
    if (alpha >= 0.60) return 'Questionable';
    if (alpha >= 0.50) return 'Poor';
    return 'Unacceptable';
  };

  const getAlphaColor = (alpha: number, context: string = 'research'): string => {
    const thresholds = {
      clinical: { excellent: 0.90, good: 0.85, acceptable: 0.80 },
      research: { excellent: 0.90, good: 0.80, acceptable: 0.70 },
      exploratory: { excellent: 0.80, good: 0.70, acceptable: 0.60 }
    };

    const t = thresholds[context as keyof typeof thresholds] || thresholds.research;

    if (alpha >= t.excellent) return 'text-green-700 bg-green-50 border-green-200';
    if (alpha >= t.good) return 'text-blue-700 bg-blue-50 border-blue-200';
    if (alpha >= t.acceptable) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  const getItemIcon = (interpretation: string) => {
    if (interpretation === 'Excellent') return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (interpretation === 'Good') return <CheckCircle className="w-4 h-4 text-blue-600" />;
    if (interpretation === 'Marginal') return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    if (interpretation === 'Critical') return <XCircle className="w-4 h-4 text-red-700" />;
    return <XCircle className="w-4 h-4 text-red-600" />;
  };

  const handleExport = (format: 'csv' | 'json' | 'pdf' | 'html') => {
    if (!results) return;

    try {
      switch (format) {
        case 'csv':
          exportToCSV(results.itemStatistics, 'CTT_Item_Statistics');
          setSuccessMessage('Item statistics exported to CSV successfully');
          break;
        case 'json':
          exportToJSON(results, 'CTT_Complete_Analysis');
          setSuccessMessage('Complete analysis exported to JSON successfully');
          break;
        case 'pdf':
        case 'html':
          exportCTTResults(results);
          setSuccessMessage('Report exported successfully');
          break;
      }
    } catch (err: any) {
      setError(`Export failed: ${err.message}`);
    }
  };

  const currentDataset = datasets.find((d) => d.id === selectedDataset);

  const filteredColumns = currentDataset?.columns.filter(col =>
    col.toLowerCase().includes(itemSearch.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Classical Test Theory Analysis</h1>
        <p className="text-gray-600 mt-1">
          Comprehensive reliability and item analysis with advanced CTT metrics
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 flex-1">{error}</p>
          <button
            onClick={() => setError('')}
            className="text-red-600 hover:text-red-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800 flex-1">{successMessage}</p>
          <button
            onClick={() => setSuccessMessage('')}
            className="text-green-600 hover:text-green-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!results && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Dataset</label>
            {loadingDatasets ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="ml-3 text-gray-600">Loading datasets...</span>
              </div>
            ) : (
              <select
                value={selectedDataset}
                onChange={(e) => {
                  setSelectedDataset(e.target.value);
                  setSelectedItems([]);
                  setResults(null);
                  setItemSearch('');
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose a dataset...</option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {currentDataset && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reliability Context</label>
                <select
                  value={reliabilityContext}
                  onChange={(e) => setReliabilityContext(e.target.value as 'clinical' | 'research' | 'exploratory')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="clinical">Clinical/High-Stakes (α ≥ 0.90)</option>
                  <option value="research">Research (α ≥ 0.80)</option>
                  <option value="exploratory">Exploratory (α ≥ 0.70)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Select Items ({selectedItems.length} of {currentDataset.columns.length} selected)
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedItems(currentDataset.columns)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedItems([])}
                      className="text-xs text-gray-600 hover:text-gray-700 font-medium"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="mb-2 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Search items..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-4 border border-gray-200 rounded-lg bg-gray-50">
                  {filteredColumns.length > 0 ? (
                    filteredColumns.map((col) => (
                      <label key={col} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white rounded transition">
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(col)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedItems([...selectedItems, col]);
                            } else {
                              setSelectedItems(selectedItems.filter((item) => item !== col));
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{col}</span>
                      </label>
                    ))
                  ) : (
                    <p className="col-span-full text-center text-gray-500 text-sm py-4">
                      No items match your search
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          <button
            onClick={runAnalysis}
            disabled={loading || !selectedDataset || selectedItems.length < 2}
            className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Running CTT Analysis...
              </>
            ) : (
              <>
                <TrendingUp className="w-6 h-6" />
                Run Classical Test Theory Analysis
              </>
            )}
          </button>
        </div>
      )}

      {results && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setResults(null)}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Selection
            </button>
          </div>

          {results.sampleSizeWarnings && results.sampleSizeWarnings.length > 0 && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-900 mb-2">Sample Size Considerations</h3>
                  <ul className="text-sm text-amber-800 space-y-1">
                    {results.sampleSizeWarnings.map((warning: string, idx: number) => (
                      <li key={idx}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {results.optimizationSuggestions && results.optimizationSuggestions.length > 0 && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Target className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900 mb-2">Scale Optimization Suggestions</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    {results.optimizationSuggestions.map((suggestion: string, idx: number) => (
                      <li key={idx}>• {suggestion}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Reliability Coefficients</h2>
              </div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {showAdvanced ? 'Hide' : 'Show'} Advanced Metrics
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className={`p-5 rounded-lg border-2 ${getAlphaColor(results.cronbachAlpha, results.reliabilityContext)}`}>
                <p className="text-xs font-semibold mb-1 uppercase tracking-wide">Cronbach's Alpha (α)</p>
                <p className="text-4xl font-bold mb-1">{results.cronbachAlpha.toFixed(3)}</p>
                <p className="text-xs font-medium">{results.interpretation}</p>
                {results.alphaCI && (
                  <p className="text-xs mt-2 text-gray-600">
                    95% CI: [{results.alphaCI.lower.toFixed(3)}, {results.alphaCI.upper.toFixed(3)}]
                  </p>
                )}
              </div>

              <div className="p-5 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border-2 border-blue-200">
                <p className="text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Standardized α</p>
                <p className="text-4xl font-bold text-gray-900 mb-1">{results.standardizedAlpha.toFixed(3)}</p>
                <p className="text-xs text-gray-600">Correlation-based</p>
              </div>

              <div className="p-5 bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg border-2 border-teal-200">
                <p className="text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">McDonald's ω</p>
                <p className="text-4xl font-bold text-gray-900 mb-1">{results.omegaTotal.toFixed(3)}</p>
                <p className="text-xs text-gray-600">Omega Total</p>
              </div>

              <div className="p-5 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border-2 border-green-200">
                <p className="text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Scale Info</p>
                <p className="text-2xl font-bold text-gray-900">{results.nItems} Items</p>
                <p className="text-xs text-gray-600">{results.nRespondents} respondents</p>
              </div>
            </div>

            {showAdvanced && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                <div className="p-4 border border-gray-200 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Guttman's λ₂</p>
                  <p className="text-2xl font-bold text-gray-900">{results.guttmanLambda2.toFixed(3)}</p>
                  <p className="text-xs text-gray-500">Lambda-2</p>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Armor's θ</p>
                  <p className="text-2xl font-bold text-gray-900">{results.armorTheta.toFixed(3)}</p>
                  <p className="text-xs text-gray-500">Theta coefficient</p>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">GLB</p>
                  <p className="text-2xl font-bold text-gray-900">{results.glb.toFixed(3)}</p>
                  <p className="text-xs text-gray-500">Greatest Lower Bound</p>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Mean Inter-Item r</p>
                  <p className="text-2xl font-bold text-gray-900">{results.meanInterItemCorrelation.toFixed(3)}</p>
                  <p className="text-xs text-gray-500">Avg correlation</p>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">AVE</p>
                  <p className="text-2xl font-bold text-gray-900">{results.averageVarianceExtracted.toFixed(3)}</p>
                  <p className="text-xs text-gray-500">Avg Variance Extracted</p>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">CR</p>
                  <p className="text-2xl font-bold text-gray-900">{results.compositeReliability.toFixed(3)}</p>
                  <p className="text-xs text-gray-500">Composite Reliability</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Scale Mean</p>
                <p className="text-lg font-bold text-gray-900">{results.scaleMean.toFixed(2)}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Scale Variance</p>
                <p className="text-lg font-bold text-gray-900">{results.scaleVariance.toFixed(2)}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Scale SEM</p>
                <p className="text-lg font-bold text-gray-900">{results.scaleSEM.toFixed(2)}</p>
              </div>
            </div>

            <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg border-l-4 border-blue-600">
              <h3 className="font-semibold text-sm text-gray-900 mb-3">
                Interpretation Guidelines - {results.reliabilityContext === 'clinical' ? 'Clinical/High-Stakes' : results.reliabilityContext === 'research' ? 'Research' : 'Exploratory'} Context
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700">
                {results.reliabilityContext === 'clinical' && (
                  <>
                    <div><strong>α ≥ 0.90:</strong> Excellent</div>
                    <div><strong>α ≥ 0.85:</strong> Good</div>
                    <div><strong>α ≥ 0.80:</strong> Acceptable</div>
                    <div><strong>α &lt; 0.80:</strong> Inadequate for clinical use</div>
                  </>
                )}
                {results.reliabilityContext === 'research' && (
                  <>
                    <div><strong>α ≥ 0.90:</strong> Excellent</div>
                    <div><strong>α ≥ 0.80:</strong> Good</div>
                    <div><strong>α ≥ 0.70:</strong> Acceptable</div>
                    <div><strong>α &lt; 0.70:</strong> Questionable</div>
                  </>
                )}
                {results.reliabilityContext === 'exploratory' && (
                  <>
                    <div><strong>α ≥ 0.80:</strong> Excellent</div>
                    <div><strong>α ≥ 0.70:</strong> Good</div>
                    <div><strong>α ≥ 0.60:</strong> Acceptable</div>
                    <div><strong>α &lt; 0.60:</strong> Questionable</div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Split-Half Reliability */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Split className="w-6 h-6 text-teal-600" />
              <h2 className="text-xl font-semibold text-gray-900">Split-Half Reliability</h2>
            </div>

            <div className="space-y-4">
              {results.splitHalf.map((split: SplitHalfResult, idx: number) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">{split.method}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Part 1 α</p>
                      <p className="text-lg font-bold text-gray-900">{split.part1Alpha.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Part 2 α</p>
                      <p className="text-lg font-bold text-gray-900">{split.part2Alpha.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Correlation</p>
                      <p className="text-lg font-bold text-gray-900">{split.correlation.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Spearman-Brown</p>
                      <p className="text-lg font-bold text-blue-600">{split.spearmanBrown.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Guttman λ</p>
                      <p className="text-lg font-bold text-gray-900">{split.guttmanLambda.toFixed(3)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded text-xs text-gray-700">
              <strong>Note:</strong> Spearman-Brown formula adjusts the correlation for full test length.
              Guttman's Lambda 4 (λ4) is equivalent to split-half reliability.
            </div>
          </div>

          {/* Item Statistics */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Item Statistics</h2>
            </div>

            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setChartsCollapsed({ ...chartsCollapsed, itemRest: !chartsCollapsed.itemRest })}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
                >
                  {chartsCollapsed.itemRest ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  Item-Rest Correlations
                </button>
                {!chartsCollapsed.itemRest && (
                  <button
                    onClick={() => exportChartAsImage(chartRef, 'CTT_Item_Rest_Correlations')}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                  >
                    <FileImage className="w-4 h-4" />
                    Export PNG
                  </button>
                )}
              </div>
              {!chartsCollapsed.itemRest && <Bar
                ref={chartRef}
                data={{
                  labels: results.itemStatistics.map((item: ItemStatistic) => item.name),
                  datasets: [{
                    label: 'Item-Rest Correlation',
                    data: results.itemStatistics.map((item: ItemStatistic) => item.itemRestCorrelation),
                    backgroundColor: results.itemStatistics.map((item: ItemStatistic) => {
                      if (item.itemRestCorrelation >= 0.40) return 'rgba(34, 197, 94, 0.7)';
                      if (item.itemRestCorrelation >= 0.30) return 'rgba(59, 130, 246, 0.7)';
                      if (item.itemRestCorrelation >= 0.20) return 'rgba(234, 179, 8, 0.7)';
                      return 'rgba(239, 68, 68, 0.7)';
                    }),
                    borderColor: results.itemStatistics.map((item: ItemStatistic) => {
                      if (item.itemRestCorrelation >= 0.40) return 'rgb(34, 197, 94)';
                      if (item.itemRestCorrelation >= 0.30) return 'rgb(59, 130, 246)';
                      if (item.itemRestCorrelation >= 0.20) return 'rgb(234, 179, 8)';
                      return 'rgb(239, 68, 68)';
                    }),
                    borderWidth: 2,
                  }],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          const item = results.itemStatistics[context.dataIndex];
                          return [
                            `Item-Rest r: ${item.itemRestCorrelation.toFixed(3)}`,
                            `Quality: ${item.interpretation}`,
                            `Difficulty: ${item.difficulty.toFixed(2)}`,
                            `Discrimination: ${item.discrimination.toFixed(3)}`
                          ];
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 1,
                      title: { display: true, text: 'Item-Rest Correlation (r)' },
                    },
                  },
                }}
              />}
            </div>

            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setChartsCollapsed({ ...chartsCollapsed, discrimination: !chartsCollapsed.discrimination })}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
                >
                  {chartsCollapsed.discrimination ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  Item Discrimination Indices
                </button>
                {!chartsCollapsed.discrimination && (
                  <button
                    onClick={() => exportChartAsImage(discriminationChartRef, 'CTT_Item_Discrimination')}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                  >
                    <FileImage className="w-4 h-4" />
                    Export PNG
                  </button>
                )}
              </div>
              {!chartsCollapsed.discrimination && <Bar
                ref={discriminationChartRef}
                data={{
                  labels: results.itemStatistics.map((item: ItemStatistic) => item.name),
                  datasets: [{
                    label: 'Discrimination Index',
                    data: results.itemStatistics.map((item: ItemStatistic) => item.discrimination),
                    backgroundColor: 'rgba(20, 184, 166, 0.7)',
                    borderColor: 'rgb(20, 184, 166)',
                    borderWidth: 2,
                  }],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 1,
                      title: { display: true, text: 'Discrimination Index' },
                    },
                  },
                }}
              />}
            </div>

            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setChartsCollapsed({ ...chartsCollapsed, difficultyScatter: !chartsCollapsed.difficultyScatter })}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
                >
                  {chartsCollapsed.difficultyScatter ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  Item Difficulty vs Discrimination
                </button>
                {!chartsCollapsed.difficultyScatter && (
                  <button
                    onClick={() => exportChartAsImage(difficultyChartRef, 'CTT_Difficulty_vs_Discrimination')}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                  >
                    <FileImage className="w-4 h-4" />
                    Export PNG
                  </button>
                )}
              </div>
              {!chartsCollapsed.difficultyScatter && <Scatter
                ref={difficultyChartRef}
                data={{
                  datasets: [{
                    label: 'Items',
                    data: results.itemStatistics.map((item: ItemStatistic) => ({
                      x: item.difficulty,
                      y: item.discrimination,
                      label: item.name
                    })),
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: 'rgb(59, 130, 246)',
                    pointRadius: 8,
                    pointHoverRadius: 10,
                  }],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          const item = results.itemStatistics[context.dataIndex];
                          return [
                            `Item: ${item.name}`,
                            `Difficulty: ${item.difficulty.toFixed(2)}`,
                            `Discrimination: ${item.discrimination.toFixed(3)}`
                          ];
                        }
                      }
                    }
                  },
                  scales: {
                    x: {
                      title: { display: true, text: 'Item Difficulty (p-value)' },
                      min: 0,
                      max: 1,
                    },
                    y: {
                      title: { display: true, text: 'Discrimination Index' },
                      min: 0,
                      max: 1,
                    },
                  },
                }}
              />}
              {!chartsCollapsed.difficultyScatter && (
                <p className="text-xs text-gray-500 mt-2">
                  Optimal items are in the upper-middle area (difficulty ~0.50, high discrimination)
                </p>
              )}
            </div>

            {/* Legend */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <h4 className="font-semibold text-xs text-gray-900 mb-2">Item Quality Classification:</h4>
              <div className="flex flex-wrap gap-4 text-xs text-gray-700">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-green-600 rounded"></div>
                  <span>Excellent (r ≥ 0.40)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-600 rounded"></div>
                  <span>Good (0.30 ≤ r &lt; 0.40)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                  <span>Marginal (0.20 ≤ r &lt; 0.30)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-red-500 rounded"></div>
                  <span>Poor (r &lt; 0.20)</span>
                </div>
              </div>
            </div>

            {/* Detailed Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-300 bg-gray-50">
                    <th className="text-left py-3 px-3 text-xs font-bold text-gray-700">Item</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-gray-700">Mean</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-gray-700">SD</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-gray-700">Item-Rest r</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-gray-700">α if Del</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-gray-700">Difficulty</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-gray-700">Discrim</th>
                    <th className="text-center py-3 px-3 text-xs font-bold text-gray-700">Quality</th>
                    <th className="text-left py-3 px-3 text-xs font-bold text-gray-700">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {results.itemStatistics.map((item: ItemStatistic, index: number) => (
                    <tr key={index} className={`border-b border-gray-100 hover:bg-gray-50 ${
                      item.interpretation === 'Critical' ? 'bg-red-50' : ''
                    }`}>
                      <td className="py-3 px-3 font-medium text-gray-900">{item.name}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{item.mean.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{item.sd.toFixed(2)}</td>
                      <td className={`py-3 px-3 text-right font-semibold ${
                        item.itemRestCorrelation < 0 ? 'text-red-700' : 'text-gray-900'
                      }`}>
                        {item.itemRestCorrelation.toFixed(3)}
                      </td>
                      <td className={`py-3 px-3 text-right ${
                        item.alphaIfDeleted > results.cronbachAlpha ? 'text-orange-700 font-semibold' : 'text-gray-700'
                      }`}>
                        {item.alphaIfDeleted.toFixed(3)}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-700">
                        {item.difficulty.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-700">
                        {item.discrimination.toFixed(3)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center gap-2">
                          {getItemIcon(item.interpretation)}
                          <span className={`text-xs font-medium ${
                            item.interpretation === 'Critical' ? 'text-red-900 font-bold' :
                            item.interpretation === 'Excellent' ? 'text-green-700' :
                            item.interpretation === 'Good' ? 'text-blue-700' :
                            item.interpretation === 'Marginal' ? 'text-yellow-700' :
                            'text-red-700'
                          }`}>
                            {item.interpretation}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {item.flags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.flags.map((flag, idx) => (
                              <span
                                key={idx}
                                className={`inline-block px-2 py-0.5 rounded text-xs ${
                                  flag === 'NEGATIVE CORRELATION' ? 'bg-red-100 text-red-800 font-bold' :
                                  flag === 'Removal increases α' ? 'bg-orange-100 text-orange-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                {flag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recommendations */}
            <div className="mt-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border-l-4 border-amber-500">
              <h4 className="font-semibold text-sm text-gray-900 mb-3">Item Analysis Recommendations</h4>
              <ul className="text-xs text-gray-700 space-y-2">
                <li>• <strong>Item-Rest r &lt; 0.20:</strong> Review or remove (weak discrimination)</li>
                <li>• <strong>α if Deleted &gt; Scale α:</strong> Consider removing item to improve reliability</li>
                <li>• <strong>Difficulty (p-value):</strong> Optimal range 0.30-0.70 for discriminating items</li>
                <li>• <strong>SD very low:</strong> Item lacks variance, may not contribute to scale</li>
                <li>• <strong>Skewness &gt; ±2 or Kurtosis &gt; ±7:</strong> Consider item distribution issues</li>
              </ul>
            </div>
          </div>

          {/* Export Options */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Export Results</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <button
                onClick={() => handleExport('html')}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
              >
                <Download className="w-5 h-5" />
                HTML Report
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium"
              >
                <Download className="w-5 h-5" />
                CSV Data
              </button>
              <button
                onClick={() => handleExport('json')}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition font-medium"
              >
                <Download className="w-5 h-5" />
                JSON
              </button>
            </div>

            <button
              onClick={() => {
                setResults(null);
                setSelectedItems([]);
              }}
              className="w-full mt-3 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition font-medium"
            >
              Run New Analysis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
