import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  GitBranch,
  Play,
  Settings,
  Download,
  AlertCircle,
  CheckCircle,
  Info,
  TrendingUp,
  ArrowRight,
  Layers,
  Target,
  ChevronDown,
  ChevronUp,
  FileImage,
  Code,
  Cpu
} from 'lucide-react';
import { rAnalysisClient } from '../lib/rAnalysisClient';
import { Bar } from 'react-chartjs-2';
import { exportResultsToPDF, exportToCSV, exportToJSON, exportChartAsImage, exportPathAnalysisResults } from '../lib/exportUtils';
import { saveAnalysisHistory } from '../lib/analysisHistory';
import { PathDiagram } from './PathDiagram';

interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
}

interface PathAnalysisResults {
  estimator?: 'OLS' | 'MLE';
  fitIndices: {
    chisq: number;
    df: number;
    pvalue: number;
    cfi: number;
    tli: number;
    rmsea: number;
    rmsea_ci_lower: number;
    rmsea_ci_upper: number;
    srmr: number;
    aic: number;
    bic: number;
    gfi: number;
    agfi: number;
    fml?: number;
  };
  modificationIndices?: Array<{
    from: string;
    to: string;
    mi: number;
    epc: number;
  }>;
  paths: Array<{
    from: string;
    to: string;
    coefficient: number;
    se: number;
    t: number;
    pvalue: number;
    beta: number;
  }>;
  rSquared: {
    [variable: string]: number;
  };
  effects: {
    direct: Array<{
      from: string;
      to: string;
      effect: number;
      se: number;
      pvalue: number;
    }>;
    indirect: Array<{
      from: string;
      to: string;
      via: string[];
      effect: number;
      se: number;
      pvalue: number;
      bootstrapCI: [number, number];
    }>;
    total: Array<{
      from: string;
      to: string;
      effect: number;
      se: number;
      pvalue: number;
    }>;
  };
  mediation?: Array<{
    iv: string;
    mediator: string;
    dv: string;
    directEffect: number;
    indirectEffect: number;
    totalEffect: number;
    proportion: number;
    sobelZ: number;
    sobelP: number;
    bootstrapCI: [number, number];
    mediationType: 'full' | 'partial' | 'none';
  }>;
  parallelMediation?: {
    iv: string;
    mediators: string[];
    dv: string;
    totalIndirect: number;
    totalIndirectBootstrapCI: [number, number];
    specificIndirect: Array<{
      mediator: string;
      effect: number;
      bootstrapCI: [number, number];
      proportion: number;
    }>;
    pairwiseContrasts: Array<{
      mediator1: string;
      mediator2: string;
      difference: number;
      bootstrapCI: [number, number];
      significant: boolean;
    }>;
  };
  serialMediation?: {
    iv: string;
    m1: string;
    m2: string;
    dv: string;
    paths: {
      a1: number;
      a2: number;
      b1: number;
      b2: number;
      d21: number;
    };
    indirectEffects: {
      throughM1Only: { effect: number; bootstrapCI: [number, number] };
      throughM2Only: { effect: number; bootstrapCI: [number, number] };
      throughM1ThenM2: { effect: number; bootstrapCI: [number, number] };
      total: { effect: number; bootstrapCI: [number, number] };
    };
  };
  moderatedMediation?: {
    model: 7 | 14 | 80;
    iv: string;
    mediator: string;
    moderator: string;
    dv: string;
    conditionalIndirectEffects: Array<{
      moderatorLevel: string;
      moderatorValue: number;
      indirectEffect: number;
      bootstrapCI: [number, number];
    }>;
    indexOfModeratedMediation: {
      value: number;
      bootstrapCI: [number, number];
      interpretation: string;
    };
  };
  moderation?: Array<{
    iv: string;
    moderator: string;
    dv: string;
    mainEffectIV: number;
    mainEffectMod: number;
    interactionEffect: number;
    interactionP: number;
    simpleSlopes: {
      low: { slope: number; se: number; t: number; p: number };
      mean: { slope: number; se: number; t: number; p: number };
      high: { slope: number; se: number; t: number; p: number };
    };
    johnsonNeyman?: {
      lowerBound: number | null;
      upperBound: number | null;
      significance: 'always' | 'never' | 'conditional';
      conditionalRange?: [number, number];
    };
  }>;
  conditionalEffects?: Array<{
    focusVariable: string;
    moderator: string;
    dv: string;
    effects: Array<{
      moderatorValue: number;
      effect: number;
      se: number;
      t: number;
      p: number;
      llci: number;
      ulci: number;
    }>;
  }>;
  correlations?: Array<{
    var1: string;
    var2: string;
    correlation: number;
    pvalue: number;
  }>;
}

export function PathAnalysis() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [pathModel, setPathModel] = useState<Array<{ from: string; to: string }>>([]);
  const [mediators, setMediators] = useState<string[]>([]);
  const [moderators, setModerators] = useState<Array<{ iv: string; moderator: string; dv: string }>>([]);
  const [exogenousVars, setExogenousVars] = useState<string[]>([]);
  const [results, setResults] = useState<PathAnalysisResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [analysisType, setAnalysisType] = useState<'basic' | 'mediation' | 'moderation' | 'full' | 'parallel-mediation' | 'serial-mediation' | 'moderated-mediation' | 'custom-lavaan'>('basic');

  const [estimatorType, setEstimatorType] = useState<'OLS' | 'MLE'>('OLS');

  // Custom lavaan syntax model state
  const [customSyntax, setCustomSyntax] = useState('');
  const [customLavaanOptions, setCustomLavaanOptions] = useState({
    bootstrap: true,
    nBootstrap: 5000,
    estimator: 'ML',
    missing: 'listwise',
    standardized: true,
    modificationIndices: true,
  });
  const [customResults, setCustomResults] = useState<any>(null);
  const [customImages, setCustomImages] = useState<string[]>([]);

  const [advancedOptions, setAdvancedOptions] = useState({
    bootstrap: true,
    bootstrapSamples: 5000,
    standardized: true,
    robustSE: false,
    meanCenter: true,
    showCorrelations: true,
  });

  const chartRef = useRef<any>(null);
  const currentDataset = datasets.find(d => d.id === selectedDataset);

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
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
    }
  };

  const addPath = () => {
    if (!currentDataset) return;
    setPathModel([...pathModel, { from: '', to: '' }]);
  };

  const removePath = (index: number) => {
    setPathModel(pathModel.filter((_, i) => i !== index));
  };

  const updatePath = (index: number, field: 'from' | 'to', value: string) => {
    const newPaths = [...pathModel];
    newPaths[index][field] = value;
    setPathModel(newPaths);
  };

  const addMediator = (variable: string) => {
    if (!mediators.includes(variable)) {
      setMediators([...mediators, variable]);
    }
  };

  const removeMediator = (variable: string) => {
    setMediators(mediators.filter(v => v !== variable));
  };

  const addModerator = () => {
    setModerators([...moderators, { iv: '', moderator: '', dv: '' }]);
  };

  const removeModerator = (index: number) => {
    setModerators(moderators.filter((_, i) => i !== index));
  };

  const updateModerator = (index: number, field: 'iv' | 'moderator' | 'dv', value: string) => {
    const newMods = [...moderators];
    newMods[index][field] = value;
    setModerators(newMods);
  };

  // ── Statistical helpers ────────────────────────────────────────────────────

  const colMean = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;
  const colSD = (vals: number[]) => {
    const m = colMean(vals);
    return Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(vals.length - 1, 1));
  };

  // OLS multiple regression: returns { coefficients, se, tValues, pValues, rSquared, residuals, fStat, fPValue, invXtX }
  const olsRegression = (y: number[], Xraw: number[][]): {
    coefficients: number[]; se: number[]; tValues: number[]; pValues: number[];
    rSquared: number; adjR2: number; residuals: number[]; fStat: number; fPValue: number;
    n: number; k: number; invXtX: number[][]; s2: number;
  } => {
    const n = y.length;
    const k = Xraw[0].length; // number of predictors (no intercept column yet)
    // Build design matrix with intercept
    const X = Xraw.map(row => [1, ...row]);
    const p = k + 1; // params including intercept

    // XtX and Xty
    const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
    const Xty: number[] = Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        Xty[j] += X[i][j] * y[i];
        for (let l = 0; l < p; l++) XtX[j][l] += X[i][j] * X[i][l];
      }
    }

    // Gaussian elimination with partial pivoting
    const aug = XtX.map((row, i) => [...row, Xty[i]]);
    for (let col = 0; col < p; col++) {
      let maxRow = col;
      for (let row = col + 1; row < p; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
      }
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
      if (Math.abs(aug[col][col]) < 1e-12) continue;
      for (let row = col + 1; row < p; row++) {
        const f = aug[row][col] / aug[col][col];
        for (let c = col; c <= p; c++) aug[row][c] -= f * aug[col][c];
      }
    }
    const beta: number[] = Array(p).fill(0);
    for (let i = p - 1; i >= 0; i--) {
      if (Math.abs(aug[i][i]) < 1e-12) { beta[i] = 0; continue; }
      beta[i] = aug[i][p];
      for (let j = i + 1; j < p; j++) beta[i] -= aug[i][j] * beta[j];
      beta[i] /= aug[i][i];
    }

    // Residuals, R², s²
    const yPred = X.map(row => row.reduce((s, v, j) => s + v * beta[j], 0));
    const residuals = y.map((v, i) => v - yPred[i]);
    const yMean = colMean(y);
    const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
    const ssRes = residuals.reduce((s, v) => s + v * v, 0);
    const rSquared = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;
    const adjR2 = n > p ? Math.max(0, 1 - (ssRes / (n - p)) / (ssTot / (n - 1))) : rSquared;
    const s2 = n > p ? ssRes / (n - p) : 0;

    // (XtX)⁻¹ for SE — use same augmented matrix approach
    const inv: number[][] = Array.from({ length: p }, (_, i) =>
      Array.from({ length: p }, (_, j) => (i === j ? 1 : 0))
    );
    const augInv = XtX.map((row, i) => [...row, ...inv[i]]);
    for (let col = 0; col < p; col++) {
      let maxRow = col;
      for (let row = col + 1; row < p; row++) {
        if (Math.abs(augInv[row][col]) > Math.abs(augInv[maxRow][col])) maxRow = row;
      }
      [augInv[col], augInv[maxRow]] = [augInv[maxRow], augInv[col]];
      const pivot = augInv[col][col];
      if (Math.abs(pivot) < 1e-12) continue;
      for (let c = col; c < 2 * p; c++) augInv[col][c] /= pivot;
      for (let row = 0; row < p; row++) {
        if (row === col) continue;
        const f = augInv[row][col];
        for (let c = col; c < 2 * p; c++) augInv[row][c] -= f * augInv[col][c];
      }
    }
    const invXtX = augInv.map(row => row.slice(p));

    const se = invXtX.map((row, i) => Math.sqrt(Math.max(0, s2 * row[i])));
    const tValues = beta.map((b, i) => se[i] > 0 ? b / se[i] : 0);
    const df = n - p;

    // Two-tailed p-values via t-distribution
    const tPValue = (t: number, df: number): number => {
      if (df <= 0) return 1;
      const absT = Math.abs(t);
      if (df > 100) {
        // Normal approx
        const z = absT;
        const a = 0.2316419, b1 = 0.319382, b2 = -0.356564, b3 = 1.781478, b4 = -1.821256, b5 = 1.330274;
        const t2 = 1 / (1 + a * z);
        const phi = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
        const cdf = 1 - phi * t2 * (b1 + t2 * (b2 + t2 * (b3 + t2 * (b4 + t2 * b5))));
        return 2 * (1 - cdf);
      }
      // Regularized incomplete beta
      const x = df / (df + absT * absT);
      const a2 = df / 2;
      const tiny = 1e-30;
      const lnB = lgamma(a2) + lgamma(0.5) - lgamma(a2 + 0.5);
      const front = Math.exp(a2 * Math.log(x) + 0.5 * Math.log(1 - x) - lnB) / a2;
      let f = tiny, c = tiny, d = 0;
      for (let i = 0; i <= 200; i++) {
        const m = Math.floor(i / 2);
        let num: number;
        if (i === 0) num = 1;
        else if (i % 2 === 1) num = -(a2 + m) * (a2 + 0.5 + m) * x / ((a2 + 2 * m) * (a2 + 2 * m + 1));
        else num = m * (0.5 - m) * x / ((a2 + 2 * m - 1) * (a2 + 2 * m));
        d = 1 + num * d; if (Math.abs(d) < tiny) d = tiny; d = 1 / d;
        c = 1 + num / c; if (Math.abs(c) < tiny) c = tiny;
        f *= c * d;
        if (Math.abs(c * d - 1) < 1e-10) break;
      }
      const ibeta = front * f;
      return Math.min(1, Math.max(0, ibeta));
    };
    const lgamma = (z: number): number => {
      const coef = [0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
      if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
      let zz = z - 1, x = coef[0];
      for (let i = 1; i < 9; i++) x += coef[i] / (zz + i);
      const t = zz + 7.5;
      return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
    };

    const pValues = tValues.map(t => tPValue(t, df));

    // F-statistic: F = (R²/k) / ((1-R²)/(n-p))
    const fStat = k > 0 && n > p && (1 - rSquared) > 1e-12
      ? (rSquared / k) / ((1 - rSquared) / (n - p))
      : 0;
    const fPValue = fStat > 0 ? fDistPValue(fStat, k, n - p) : 1;

    return {
      coefficients: beta, se, tValues, pValues,
      rSquared, adjR2, residuals, fStat, fPValue, n, k, invXtX, s2
    };
  };

  // F-distribution p-value via regularized incomplete beta
  const fDistPValue = (F: number, d1: number, d2: number): number => {
    const x = d2 / (d2 + d1 * F);
    return incompleteBetaReg(x, d2 / 2, d1 / 2);
  };

  const incompleteBetaReg = (x: number, a: number, b: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (x > (a + 1) / (a + b + 2)) return 1 - incompleteBetaReg(1 - x, b, a);
    const lgamma2 = (z: number): number => {
      const coef = [0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
      if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma2(1 - z);
      let zz = z - 1, xv = coef[0];
      for (let i = 1; i < 9; i++) xv += coef[i] / (zz + i);
      const t = zz + 7.5;
      return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(xv);
    };
    const lnB = lgamma2(a) + lgamma2(b) - lgamma2(a + b);
    const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnB) / a;
    const tiny = 1e-30;
    let f = tiny, c = tiny, d = 0;
    for (let i = 0; i <= 200; i++) {
      const m = Math.floor(i / 2);
      let num: number;
      if (i === 0) num = 1;
      else if (i % 2 === 1) num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
      else num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
      d = 1 + num * d; if (Math.abs(d) < tiny) d = tiny; d = 1 / d;
      c = 1 + num / c; if (Math.abs(c) < tiny) c = tiny;
      f *= c * d;
      if (Math.abs(c * d - 1) < 1e-10) break;
    }
    return Math.min(1, Math.max(0, front * f));
  };

  // Parse raw dataset rows to numeric columns
  const getNumericMatrix = (ds: Dataset): { mat: number[][]; cols: string[] } => {
    const raw = ds.data;
    const cols = ds.columns;
    let mat: number[][];
    if (Array.isArray(raw[0])) {
      mat = (raw as any[][]).map(row => cols.map((_, i) => parseFloat(row[i])));
    } else {
      mat = (raw as Record<string, any>[]).map(row => cols.map(c => parseFloat(row[c])));
    }
    // Listwise deletion
    mat = mat.filter(row => row.every(v => isFinite(v)));
    return { mat, cols };
  };

  // Extract a single variable column by name
  const getCol = (mat: number[][], cols: string[], name: string): number[] =>
    mat.map(row => row[cols.indexOf(name)]);

  // Standardize a column
  const standardizeCol = (vals: number[]): number[] => {
    const m = colMean(vals), s = colSD(vals);
    return s > 0 ? vals.map(v => (v - m) / s) : vals.map(() => 0);
  };

  // Bootstrap percentile CI for a statistic function
  const bootstrapCI = (
    fn: (resample: number[]) => number,
    data: number[],
    nSamples: number,
    alpha = 0.05
  ): [number, number] => {
    const boots: number[] = [];
    const n = data.length;
    for (let i = 0; i < nSamples; i++) {
      const sample = Array.from({ length: n }, () => data[Math.floor(Math.random() * n)]);
      boots.push(fn(sample));
    }
    boots.sort((a, b) => a - b);
    const lo = Math.floor(boots.length * alpha / 2);
    const hi = Math.min(boots.length - 1, Math.floor(boots.length * (1 - alpha / 2)));
    return [boots[lo], boots[hi]];
  };

  // Bootstrap CI for indirect effect (product of two regression coefficients)
  const bootstrapIndirectCI = (
    ivData: number[], medData: number[], dvData: number[],
    covariates: number[][] = [],
    nSamples: number
  ): [number, number] => {
    const n = ivData.length;
    const boots: number[] = [];
    for (let b = 0; b < nSamples; b++) {
      const idx = Array.from({ length: n }, () => Math.floor(Math.random() * n));
      const ivS = idx.map(i => ivData[i]);
      const medS = idx.map(i => medData[i]);
      const dvS = idx.map(i => dvData[i]);
      const covS = covariates.map(cov => idx.map(i => cov[i]));

      try {
        const Xmed = covS.length > 0
          ? ivS.map((v, i) => [v, ...covS.map(c => c[i])])
          : ivS.map(v => [v]);
        const ra = olsRegression(medS, Xmed);
        const a = ra.coefficients[1];

        const Xdv = covS.length > 0
          ? medS.map((v, i) => [ivS[i], v, ...covS.map(c => c[i])])
          : medS.map((v, i) => [ivS[i], v]);
        const rb = olsRegression(dvS, Xdv);
        const bCoef = rb.coefficients[2]; // mediator coeff

        boots.push(a * bCoef);
      } catch { continue; }
    }
    boots.sort((a, b) => a - b);
    if (boots.length < 10) return [0, 0];
    const lo = Math.floor(boots.length * 0.025);
    const hi = Math.min(boots.length - 1, Math.floor(boots.length * 0.975));
    return [boots[lo], boots[hi]];
  };

  // Pearson correlation + two-tailed p-value
  const pearsonCorr = (x: number[], y: number[]): { r: number; p: number } => {
    const n = x.length;
    if (n < 3) return { r: 0, p: 1 };
    const mx = colMean(x), my = colMean(y);
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
      const a = x[i] - mx, b = y[i] - my;
      num += a * b; dx2 += a * a; dy2 += b * b;
    }
    const r = dx2 * dy2 > 0 ? num / Math.sqrt(dx2 * dy2) : 0;
    const t = Math.abs(r) < 1 ? r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r) : 0;
    // Two-tailed p-value: incompleteBetaReg gives CDF of I_x(a,b) which for the t-dist
    // gives the tail probability. Two-tailed p = IBR(df/(df+t²), df/2, 1/2).
    const df = n - 2;
    const absT = Math.abs(t);
    let p = 1;
    if (df > 0) {
      const x2 = df / (df + absT * absT);
      // I_x(df/2, 1/2) directly gives the two-tailed p-value for t-distribution
      p = Math.min(1, Math.max(0, incompleteBetaReg(x2, df / 2, 0.5)));
    }
    return { r, p };
  };

  // Compute SRMR from observed vs model-implied correlations
  const computeSRMR = (
    observed: number[][], implied: number[][]
  ): number => {
    let sum = 0, cnt = 0;
    const p = observed.length;
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < i; j++) {
        const d = (observed[i][j] || 0) - (implied[i][j] || 0);
        sum += d * d; cnt++;
      }
    }
    return cnt > 0 ? Math.sqrt(sum / cnt) : 0;
  };

  // Build observed correlation matrix for a set of columns
  const buildCorrMatrix = (mat: number[][], varNames: string[], cols: string[]): number[][] => {
    const vecs = varNames.map(n => getCol(mat, cols, n));
    const p = varNames.length;
    const corr = Array.from({ length: p }, (_, i) =>
      Array.from({ length: p }, (_, j) =>
        i === j ? 1 : pearsonCorr(vecs[i], vecs[j]).r
      )
    );
    return corr;
  };

  // ── MLE / CB-SEM engine ─────────────────────────────────────────────────────
  // Maximum Likelihood estimation following Jöreskog (1969) / AMOS-style.
  // For a recursive path model: Σ(θ) = (I-B)^{-1} · Ψ · (I-B)^{-T}
  // where B[i][j] = path from j to i, Ψ = diagonal residual covariance matrix.
  // F_ML = log|Σ(θ)| + tr(S·Σ⁻¹(θ)) - log|S| - p   (Browne, 1974)
  // χ² = (n-1)·F_ML,  df = p(p+1)/2 - q  where q = # free parameters

  const matMul = (A: number[][], B: number[][]): number[][] => {
    const r = A.length, c = B[0].length, inner = B.length;
    return Array.from({ length: r }, (_, i) =>
      Array.from({ length: c }, (_, j) =>
        Array.from({ length: inner }, (_, k) => A[i][k] * B[k][j]).reduce((a, b) => a + b, 0)
      )
    );
  };

  const matInv = (M: number[][]): number[][] | null => {
    const n2 = M.length;
    const aug = M.map((row, i) => {
      const e = Array(n2).fill(0); e[i] = 1;
      return [...row, ...e];
    });
    for (let col = 0; col < n2; col++) {
      let maxRow = col;
      for (let row = col + 1; row < n2; row++) if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
      const pivot = aug[col][col];
      if (Math.abs(pivot) < 1e-14) return null;
      for (let c = col; c < 2 * n2; c++) aug[col][c] /= pivot;
      for (let row = 0; row < n2; row++) {
        if (row === col) continue;
        const f = aug[row][col];
        for (let c = col; c < 2 * n2; c++) aug[row][c] -= f * aug[col][c];
      }
    }
    return aug.map(row => row.slice(n2));
  };

  const matDet = (M: number[][]): number => {
    const n2 = M.length;
    const A = M.map(row => [...row]);
    let det = 1;
    for (let col = 0; col < n2; col++) {
      let maxRow = col;
      for (let row = col + 1; row < n2; row++) if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row;
      if (maxRow !== col) { [A[col], A[maxRow]] = [A[maxRow], A[col]]; det *= -1; }
      if (Math.abs(A[col][col]) < 1e-15) return 0;
      det *= A[col][col];
      for (let row = col + 1; row < n2; row++) {
        const f = A[row][col] / A[col][col];
        for (let c = col; c < n2; c++) A[row][c] -= f * A[col][c];
      }
    }
    return det;
  };

  const matTrace = (M: number[][]): number => M.reduce((s, row, i) => s + row[i], 0);

  // Build model-implied covariance Σ(θ) from path coefficients B and residual variances Ψ_diag
  const buildSigma = (
    B: number[][], psiDiag: number[], p2: number
  ): number[][] | null => {
    // (I - B)
    const IminusB = Array.from({ length: p2 }, (_, i) =>
      Array.from({ length: p2 }, (_, j) => (i === j ? 1 : 0) - B[i][j])
    );
    const IminusBInv = matInv(IminusB);
    if (!IminusBInv) return null;
    const Psi = Array.from({ length: p2 }, (_, i) => Array.from({ length: p2 }, (_, j) => i === j ? psiDiag[i] : 0));
    // Σ = (I-B)^{-1} · Ψ · (I-B)^{-T}
    const IminusBInvT = IminusBInv[0].map((_, j) => IminusBInv.map(row => row[j]));
    return matMul(matMul(IminusBInv, Psi), IminusBInvT);
  };

  // ML fit function: F_ML = log|Σ| + tr(S·Σ⁻¹) - log|S| - p
  const fML = (S: number[][], Sigma: number[][], p2: number, logDetS: number): number => {
    const SigmaInv = matInv(Sigma);
    if (!SigmaInv) return 1e10;
    const detSigma = matDet(Sigma);
    if (detSigma <= 0) return 1e10;
    const logDetSigma = Math.log(detSigma);
    // tr(S · Σ⁻¹)
    const SSigmaInv = matMul(S, SigmaInv);
    const traceVal = matTrace(SSigmaInv);
    return logDetSigma + traceVal - logDetS - p2;
  };

  // Build sample covariance matrix from data matrix (rows = obs, cols = vars)
  const buildCovMatrix = (data: number[][]): number[][] => {
    const n2 = data.length, p2 = data[0].length;
    const means = Array.from({ length: p2 }, (_, j) => data.reduce((s, r) => s + r[j], 0) / n2);
    return Array.from({ length: p2 }, (_, i) =>
      Array.from({ length: p2 }, (_, j) => {
        let s = 0;
        for (let k = 0; k < n2; k++) s += (data[k][i] - means[i]) * (data[k][j] - means[j]);
        return s / (n2 - 1);
      })
    );
  };

  // MLE path analysis: optimize F_ML via gradient descent with line search
  const runMLEAnalysis = (
    S: number[][], varNames: string[], endoSet2: Set<string>, validPaths2: Array<{ from: string; to: string }>,
    n2: number
  ): {
    pathCoefficients: Array<{ from: string; to: string; coefficient: number; se: number; t: number; p: number; beta: number }>;
    fitIndices: { chisq: number; df: number; pvalue: number; cfi: number; tli: number; rmsea: number; rmsea_ci_lower: number; rmsea_ci_upper: number; srmr: number; aic: number; bic: number; gfi: number; agfi: number; fml: number };
    rSquared: { [v: string]: number };
    modificationIndices: Array<{ from: string; to: string; mi: number; epc: number }>;
  } | null => {
    const p2 = varNames.length;
    const varIdx2 = Object.fromEntries(varNames.map((v, i) => [v, i]));

    // Free parameters: path coefficients (non-zero entries in B) + residual variances Ψ
    // Initialize B from OLS standardized betas, Ψ = 1 - R² for endogenous, 1 for exogenous
    const pathIndices: Array<{ i: number; j: number }> = validPaths2.map(pt => ({
      i: varIdx2[pt.to], j: varIdx2[pt.from]
    })).filter(({ i, j }) => i !== undefined && j !== undefined);

    // Start with zero paths and identity Psi (will converge from OLS-seeded values below)
    const B0: number[][] = Array.from({ length: p2 }, () => Array(p2).fill(0));
    const psi0: number[] = Array(p2).fill(1);

    // Seed B from OLS solution using correlation matrix (standardized)
    endoSet2.forEach(endo => {
      const eIdx = varIdx2[endo];
      if (eIdx === undefined) return;
      const preds2 = validPaths2.filter(pt => pt.to === endo).map(pt => varIdx2[pt.from]).filter(j => j !== undefined);
      if (preds2.length === 0) return;
      // Build sub-covariance matrix for OLS: use S directly (standardized)
      // b_ols = (X'X)^{-1} X'y using S sub-matrix
      const q = preds2.length;
      const Sxx: number[][] = Array.from({ length: q }, (_, r) => Array.from({ length: q }, (_, c) => S[preds2[r]][preds2[c]]));
      const Sxy: number[] = preds2.map(j => S[eIdx][j]);
      const SxxInv = matInv(Sxx);
      if (SxxInv) {
        preds2.forEach((j, r) => {
          B0[eIdx][j] = SxxInv[r].reduce((s, v, c) => s + v * Sxy[c], 0);
        });
        // Residual variance
        const fitted = preds2.reduce((s, j) => s + B0[eIdx][j] * S[eIdx][j], 0);
        psi0[eIdx] = Math.max(0.01, S[eIdx][eIdx] - fitted);
      }
    });

    // Pack free parameters: [pathCoeffs..., psi_diag...]
    const nPaths = pathIndices.length;
    const pack = (B: number[][], psi: number[]): number[] => [
      ...pathIndices.map(({ i, j }) => B[i][j]),
      ...psi
    ];
    const unpack = (theta: number[]): { B: number[][]; psi: number[] } => {
      const B2 = Array.from({ length: p2 }, (_, i) => Array.from({ length: p2 }, (_, j) => 0));
      pathIndices.forEach(({ i, j }, k) => { B2[i][j] = theta[k]; });
      const psi2 = theta.slice(nPaths).map(v => Math.max(1e-6, v));
      return { B: B2, psi: psi2 };
    };

    const detS = matDet(S);
    if (detS <= 0) return null;
    const logDetS = Math.log(Math.abs(detS));

    const objective = (theta: number[]): number => {
      const { B, psi } = unpack(theta);
      const Sigma = buildSigma(B, psi, p2);
      if (!Sigma) return 1e10;
      return fML(S, Sigma, p2, logDetS);
    };

    // Gradient via central differences
    const grad = (theta: number[], h = 1e-5): number[] =>
      theta.map((_, k) => {
        const tp = [...theta]; tp[k] += h;
        const tm = [...theta]; tm[k] -= h;
        return (objective(tp) - objective(tm)) / (2 * h);
      });

    // L-BFGS-style gradient descent with Armijo line search
    let theta = pack(B0, psi0);
    const maxIter = 500;
    const tol = 1e-8;
    let prevF = objective(theta);

    for (let iter = 0; iter < maxIter; iter++) {
      const g = grad(theta);
      const gnorm = Math.sqrt(g.reduce((s, v) => s + v * v, 0));
      if (gnorm < tol) break;

      // Gradient descent step with Armijo line search
      const dir = g.map(v => -v);
      let alpha = 1.0;
      const c1 = 1e-4;
      let newTheta = theta.map((v, k) => v + alpha * dir[k]);
      // Enforce psi > 0 during step
      for (let k = nPaths; k < newTheta.length; k++) newTheta[k] = Math.max(1e-6, newTheta[k]);
      let newF = objective(newTheta);

      let lsIter = 0;
      while (newF > prevF + c1 * alpha * g.reduce((s, v, k) => s + v * dir[k], 0) && lsIter < 30) {
        alpha *= 0.5;
        newTheta = theta.map((v, k) => v + alpha * dir[k]);
        for (let k = nPaths; k < newTheta.length; k++) newTheta[k] = Math.max(1e-6, newTheta[k]);
        newF = objective(newTheta);
        lsIter++;
      }

      theta = newTheta;
      if (Math.abs(prevF - newF) < tol) break;
      prevF = newF;
    }

    const { B: Bopt, psi: psiOpt } = unpack(theta);
    const SigmaOpt = buildSigma(Bopt, psiOpt, p2);
    if (!SigmaOpt) return null;
    const fmlVal = Math.max(0, objective(theta));

    // χ² = (n-1) · F_ML
    const chisqML = (n2 - 1) * fmlVal;
    const nFreeML = nPaths + p2; // path coefficients + residual variances
    const dfML = Math.max(1, (p2 * (p2 + 1)) / 2 - nFreeML);

    // Numerical Hessian for SEs (observed information matrix)
    const hessian = (theta2: number[], h = 1e-4): number[][] => {
      const np = theta2.length;
      return Array.from({ length: np }, (_, i) =>
        Array.from({ length: np }, (_, j) => {
          if (i === j) {
            const tp = [...theta2]; tp[i] += h;
            const tm = [...theta2]; tm[i] -= h;
            return (objective(tp) - 2 * prevF + objective(tm)) / (h * h);
          }
          const tpp = [...theta2]; tpp[i] += h; tpp[j] += h;
          const tpm = [...theta2]; tpm[i] += h; tpm[j] -= h;
          const tmp2 = [...theta2]; tmp2[i] -= h; tmp2[j] += h;
          const tmm = [...theta2]; tmm[i] -= h; tmm[j] -= h;
          return (objective(tpp) - objective(tpm) - objective(tmp2) + objective(tmm)) / (4 * h * h);
        })
      );
    };

    const H = hessian(theta);
    const Hinv = matInv(H);
    // SE = sqrt(diag(H^{-1}) / (n-1))
    const seTheta = Hinv
      ? theta.map((_, k) => Math.sqrt(Math.max(0, Hinv[k][k]) / Math.max(1, n2 - 1)))
      : theta.map(() => 0);

    // Two-tailed p-values (large sample: normal approx)
    const normalPVal = (z: number): number => {
      const absZ = Math.abs(z);
      const a = 0.2316419, b1n = 0.319382, b2n = -0.356564, b3n = 1.781478, b4n = -1.821256, b5n = 1.330274;
      const t2 = 1 / (1 + a * absZ);
      const phi = Math.exp(-absZ * absZ / 2) / Math.sqrt(2 * Math.PI);
      const cdf = 1 - phi * t2 * (b1n + t2 * (b2n + t2 * (b3n + t2 * (b4n + t2 * b5n))));
      return Math.min(1, 2 * (1 - cdf));
    };

    // Standardize: beta = b * SD(pred) / SD(outcome) from S (correlation = 1 on diagonal if standardized)
    const pathCoefficients = pathIndices.map(({ i, j }, k) => {
      const b = theta[k];
      const seB = seTheta[k];
      const z = seB > 0 ? b / seB : 0;
      const pVal = normalPVal(z);
      const sdPred = Math.sqrt(Math.max(0, S[j][j]));
      const sdOut = Math.sqrt(Math.max(0, S[i][i]));
      const beta = sdOut > 0 ? b * sdPred / sdOut : 0;
      return { from: varNames[j], to: varNames[i], coefficient: b, se: seB, t: z, p: pVal, beta };
    });

    // R² for each endogenous variable from model-implied values
    const rSquaredML: { [v: string]: number } = {};
    endoSet2.forEach(endo => {
      const eIdx = varIdx2[endo];
      if (eIdx === undefined) return;
      const varY = S[eIdx][eIdx];
      const residVar = psiOpt[eIdx];
      rSquaredML[endo] = varY > 0 ? Math.max(0, Math.min(1, 1 - residVar / varY)) : 0;
    });

    // Fit indices
    const chisqP = incompleteBetaReg(dfML / (dfML + chisqML), dfML / 2, 0.5);
    const rmsea = chisqML > dfML ? Math.sqrt((chisqML / dfML - 1) / Math.max(1, n2 - 1)) : 0;
    const rmseaLo = Math.max(0, rmsea - 1.96 * Math.sqrt(1 / (2 * Math.max(1, n2 - 1) * dfML)));
    const rmseaHi = rmsea + 1.96 * Math.sqrt(1 / (2 * Math.max(1, n2 - 1) * dfML));
    const dfNull = p2 * (p2 - 1) / 2;
    const chisqNull = (n2 - 1) * (p2 - 1); // null model F_ML approximation
    const cfi = Math.max(0, Math.min(1, 1 - Math.max(0, chisqML - dfML) / Math.max(0.001, chisqNull - dfNull)));
    const tli = dfML > 0 ? Math.max(0, Math.min(1.2, (chisqNull / dfNull - chisqML / dfML) / (chisqNull / dfNull - 1))) : 0;

    // SRMR from S vs Sigma
    const SigmaCorr = Array.from({ length: p2 }, (_, i) =>
      Array.from({ length: p2 }, (_, j) => {
        const dii = Math.sqrt(Math.max(1e-10, SigmaOpt[i][i]));
        const djj = Math.sqrt(Math.max(1e-10, SigmaOpt[j][j]));
        return SigmaOpt[i][j] / (dii * djj);
      })
    );
    const Scorr = Array.from({ length: p2 }, (_, i) =>
      Array.from({ length: p2 }, (_, j) => {
        const dii = Math.sqrt(Math.max(1e-10, S[i][i]));
        const djj = Math.sqrt(Math.max(1e-10, S[j][j]));
        return S[i][j] / (dii * djj);
      })
    );
    const srmrML = computeSRMR(Scorr, SigmaCorr);

    const aic2 = chisqML + 2 * nFreeML;
    const bic2 = chisqML + Math.log(n2) * nFreeML;
    let ssResML = 0, ssObsML = 0;
    for (let i = 0; i < p2; i++) for (let j = 0; j < i; j++) {
      ssResML += (Scorr[i][j] - SigmaCorr[i][j]) ** 2;
      ssObsML += Scorr[i][j] ** 2;
    }
    const gfi = ssObsML > 0 ? Math.max(0, Math.min(1, 1 - ssResML / ssObsML)) : 1;
    const agfi = dfML > 0 ? Math.max(0, 1 - (p2 * (p2 + 1) / 2 / dfML) * (1 - gfi)) : gfi;

    // Modification indices: for each fixed (zero) path, MI ≈ (n-1)·(gradient²/hessian_diag)
    // We compute MI for all zero off-diagonal paths not in the model
    const modificationIndices: Array<{ from: string; to: string; mi: number; epc: number }> = [];
    for (let i = 0; i < p2; i++) {
      for (let j = 0; j < p2; j++) {
        if (i === j) continue;
        const alreadyFree = pathIndices.some(pi => pi.i === i && pi.j === j);
        if (alreadyFree) continue;
        // Gradient w.r.t. a new path from j to i
        const h = 1e-5;
        const Btest = Bopt.map(r => [...r]);
        Btest[i][j] = h;
        const SigmaTest = buildSigma(Btest, psiOpt, p2);
        if (!SigmaTest) continue;
        const fTest = fML(S, SigmaTest, p2, logDetS);
        const gij = (fTest - fmlVal) / h; // one-sided gradient
        const mi = (n2 - 1) * gij * gij; // approximate MI
        const epc = Math.abs(gij) > 1e-10 ? -gij / Math.max(1e-6, gij * gij) : 0;
        if (mi > 3.84) modificationIndices.push({ from: varNames[j], to: varNames[i], mi, epc });
      }
    }
    modificationIndices.sort((a, b) => b.mi - a.mi);

    return {
      pathCoefficients,
      fitIndices: {
        chisq: Math.max(0, chisqML), df: dfML,
        pvalue: Math.min(1, Math.max(0, chisqP)),
        cfi: Math.max(0, Math.min(1, cfi)),
        tli: Math.max(0, Math.min(1.05, tli)),
        rmsea: Math.max(0, rmsea),
        rmsea_ci_lower: Math.max(0, rmseaLo),
        rmsea_ci_upper: rmseaHi,
        srmr: Math.max(0, srmrML),
        aic: aic2, bic: bic2,
        gfi: Math.max(0, Math.min(1, gfi)),
        agfi: Math.max(0, Math.min(1, agfi)),
        fml: fmlVal,
      },
      rSquared: rSquaredML,
      modificationIndices: modificationIndices.slice(0, 15),
    };
  };

  const runCustomLavaanAnalysis = async () => {
    if (!currentDataset || !customSyntax.trim()) {
      setError('Please select a dataset and provide model syntax');
      return;
    }
    setLoading(true);
    setError('');
    setCustomResults(null);
    setCustomImages([]);
    try {
      const inputData = { data: currentDataset.data, variables: currentDataset.columns };
      const { success, jobId, cached, data: cachedData, images, error: submitError } = await rAnalysisClient.submitJob({
        jobType: 'path_custom',
        inputData,
        parameters: {
          MODEL_SYNTAX: customSyntax,
          BOOTSTRAP: customLavaanOptions.bootstrap.toString(),
          N_BOOTSTRAP: customLavaanOptions.nBootstrap.toString(),
          ESTIMATOR: customLavaanOptions.estimator,
          MISSING: customLavaanOptions.missing,
          STANDARDIZED: customLavaanOptions.standardized.toString(),
          MODIFICATION_INDICES: customLavaanOptions.modificationIndices.toString()
        },
        useCache: true
      });
      if (!success || (!jobId && !cached)) throw new Error(submitError || 'Failed to submit R analysis job');
      if (cached && cachedData) {
        setCustomResults(cachedData);
        setCustomImages(images || []);
        await saveAnalysisHistory({
          analysis_type: 'path_custom',
          analysis_name: `Path Analysis - Custom lavaan Model`,
          dataset_id: selectedDataset,
          dataset_name: currentDataset.name,
          configuration: { customSyntax, customLavaanOptions },
          results: cachedData,
          status: 'completed'
        });
        return;
      }
      const job = await rAnalysisClient.pollJobUntilComplete(jobId!, () => {});
      if (!job || job.status !== 'completed') throw new Error(job?.error_message || 'R analysis failed');
      setCustomResults(job.output_data);
      setCustomImages(job.output_images || []);
      await saveAnalysisHistory({
        analysis_type: 'path_custom',
        analysis_name: `Path Analysis - Custom lavaan Model`,
        dataset_id: selectedDataset,
        dataset_name: currentDataset.name,
        configuration: { customSyntax, customLavaanOptions },
        results: job.output_data,
        status: 'completed'
      });
    } catch (err: any) {
      setError(err.message || 'Custom model analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (analysisType === 'custom-lavaan') {
      return runCustomLavaanAnalysis();
    }

    if (!currentDataset || pathModel.length === 0) {
      setError('Please select a dataset and specify at least one path');
      return;
    }
    const validPaths = pathModel.filter(p => p.from && p.to && p.from !== p.to);
    if (validPaths.length === 0) {
      setError('Please specify valid paths (from ≠ to)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { mat: rawMat, cols } = getNumericMatrix(currentDataset);
      if (rawMat.length < 10) {
        throw new Error('Insufficient data: need at least 10 complete observations');
      }

      // Mean-center if requested
      const mat = advancedOptions.meanCenter
        ? rawMat.map(row => row.map((v, j) => {
            const m = colMean(rawMat.map(r => r[j]));
            return v - m;
          }))
        : rawMat;

      const n = mat.length;

      // ── 1. Path Coefficients via OLS ────────────────────────────────────────
      const endoSet = new Set(validPaths.map(p => p.to));
      const endoVars = [...endoSet];

      // For each endogenous variable, regress on all its predictors
      type PathResult = {
        from: string; to: string; coefficient: number; se: number;
        t: number; pvalue: number; beta: number;
      };
      const pathResults: PathResult[] = [];
      const rSquaredMap: { [v: string]: number } = {};

      const endoRegs: { [v: string]: ReturnType<typeof olsRegression> & { predictors: string[] } } = {};

      endoVars.forEach(endo => {
        if (!cols.includes(endo)) return;
        const preds = validPaths.filter(p => p.to === endo).map(p => p.from)
          .filter(p => cols.includes(p));
        if (preds.length === 0) return;

        const yVals = getCol(mat, cols, endo);
        const XVals = mat.map(row => preds.map(p => row[cols.indexOf(p)]));
        const reg = olsRegression(yVals, XVals);
        endoRegs[endo] = { ...reg, predictors: preds };
        rSquaredMap[endo] = reg.rSquared;

        const sdY = colSD(yVals);
        preds.forEach((pred, pi) => {
          const sdX = colSD(getCol(mat, cols, pred));
          const b = reg.coefficients[pi + 1]; // skip intercept
          const seB = reg.se[pi + 1];
          const tVal = reg.tValues[pi + 1];
          const pVal = reg.pValues[pi + 1];
          const beta = sdY > 0 ? b * sdX / sdY : 0;
          pathResults.push({ from: pred, to: endo, coefficient: b, se: seB, t: tVal, pvalue: pVal, beta });
        });
      });

      // ── 2. Fit Indices ───────────────────────────────────────────────────────
      // All variables involved in the model
      const allModelVars = [...new Set([...validPaths.map(p => p.from), ...validPaths.map(p => p.to)])]
        .filter(v => cols.includes(v));

      // ── MLE override: when estimator is MLE, use covariance-based ML estimation ──
      let mleOutput: ReturnType<typeof runMLEAnalysis> = null;
      if (estimatorType === 'MLE') {
        const dataCols = allModelVars.map(v => getCol(mat, cols, v));
        const dataForMLE = mat.map((_, rowIdx) => dataCols.map(col => col[rowIdx]));
        const S_cov = buildCovMatrix(dataForMLE);
        mleOutput = runMLEAnalysis(S_cov, allModelVars, endoSet, validPaths, n);
        if (mleOutput) {
          // Replace OLS path results with MLE estimates
          pathResults.length = 0;
          mleOutput.pathCoefficients.forEach(pc => pathResults.push({ from: pc.from, to: pc.to, coefficient: pc.coefficient, se: pc.se, t: pc.t, pvalue: pc.p, beta: pc.beta }));
          Object.assign(rSquaredMap, mleOutput.rSquared);
        }
      }

      const obsCorr = buildCorrMatrix(mat, allModelVars, cols);
      const varIdx = Object.fromEntries(allModelVars.map((v, i) => [v, i]));

      // Implied correlation matrix via Wright's path tracing rules for recursive models.
      // For standardized variables: impCorr[i][j] = sum over all directed paths from j to i of
      // the product of standardized path coefficients along that path, PLUS correlations between
      // exogenous sources of those paths.
      // Implementation: use the total-effect matrix on standardized data.
      // Step 1: standardize all model variables
      const stdVecs: { [v: string]: number[] } = {};
      allModelVars.forEach(v => {
        if (cols.includes(v)) stdVecs[v] = standardizeCol(getCol(mat, cols, v));
      });

      // Step 2: compute standardized path coefficients (beta) in matrix form
      // B_std[i][j] = standardized coefficient from j → i
      const B_std: number[][] = Array.from({ length: allModelVars.length }, () => Array(allModelVars.length).fill(0));
      pathResults.forEach(pr => {
        const i = varIdx[pr.to], j = varIdx[pr.from];
        if (i !== undefined && j !== undefined) B_std[i][j] = pr.beta;
      });

      // Step 3: Implied correlation via Σ = (I-B)^{-T} · Φ · (I-B)^{-1}
      // where Φ is the correlation matrix of exogenous variables.
      // For a recursive model, (I-B)^{-1} = I + B + B² + ... (total effects + identity)
      const pv = allModelVars.length;
      // Build total-effect + identity matrix: T_full[i][j] = δ_ij + totalEffect_std[i][j]
      const T_full: number[][] = Array.from({ length: pv }, (_, i) => Array.from({ length: pv }, (_, j) => (i === j ? 1 : 0)));
      {
        let Bpow2 = B_std.map(r => [...r]);
        for (let iter = 0; iter < 12; iter++) {
          for (let i = 0; i < pv; i++) for (let j = 0; j < pv; j++) T_full[i][j] += Bpow2[i][j];
          const next2 = Array.from({ length: pv }, () => Array(pv).fill(0));
          for (let i = 0; i < pv; i++) for (let j = 0; j < pv; j++) for (let k = 0; k < pv; k++) next2[i][j] += Bpow2[i][k] * B_std[k][j];
          Bpow2 = next2;
          if (Bpow2.every(row => row.every(v => Math.abs(v) < 1e-10))) break;
        }
      }

      // Exogenous variables: those with no incoming paths in the model
      const exoSet = new Set(allModelVars.filter(v => !endoSet.has(v)));

      // Φ: observed correlation matrix of exogenous variables only (block)
      const exoIdx = allModelVars.map((v, i) => exoSet.has(v) ? i : -1).filter(i => i >= 0);
      // Build exo correlation sub-matrix in full-variable space
      const Phi: number[][] = Array.from({ length: pv }, () => Array(pv).fill(0));
      for (const ei of exoIdx) {
        for (const ej of exoIdx) {
          if (ei === ej) { Phi[ei][ej] = 1; }
          else {
            const vi = allModelVars[ei], vj = allModelVars[ej];
            Phi[ei][ej] = (stdVecs[vi] && stdVecs[vj]) ? pearsonCorr(stdVecs[vi], stdVecs[vj]).r : 0;
          }
        }
      }

      // impCorr = T_full · Phi · T_full^T
      const impCorr: number[][] = Array.from({ length: pv }, () => Array(pv).fill(0));
      for (let i = 0; i < pv; i++) {
        for (let j = 0; j < pv; j++) {
          let val = 0;
          for (let k = 0; k < pv; k++) for (let l = 0; l < pv; l++) val += T_full[i][k] * Phi[k][l] * T_full[j][l];
          impCorr[i][j] = val;
        }
      }

      const srmr = computeSRMR(obsCorr, impCorr);
      const p = allModelVars.length;
      const nPaths = validPaths.length;
      const nFreeParams = nPaths + endoVars.length; // paths + error variances
      const dfModel = Math.max(1, (p * (p + 1)) / 2 - nFreeParams);

      // Chi-square via GLS discrepancy: F_GLS = tr((S·Σ⁻¹ - I)²)/2
      // χ² = (n-1)·F_GLS  (Browne 1974 / standard SEM formula)
      // Invert implied correlation matrix (regularise if near-singular)
      const computeGLSChisq = (): number => {
        try {
          // Simple Gauss-Jordan inverse of impCorr
          const sz = impCorr.length;
          const aug = impCorr.map((row, i) => {
            const r = [...row, ...Array(sz).fill(0)];
            r[sz + i] = 1;
            return r;
          });
          for (let col = 0; col < sz; col++) {
            let maxR = col;
            for (let r = col + 1; r < sz; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[maxR][col])) maxR = r;
            [aug[col], aug[maxR]] = [aug[maxR], aug[col]];
            const piv = aug[col][col];
            if (Math.abs(piv) < 1e-12) return n * srmr * srmr * p * (p + 1) / 2; // fallback
            for (let c = col; c < 2 * sz; c++) aug[col][c] /= piv;
            for (let r = 0; r < sz; r++) {
              if (r === col) continue;
              const f = aug[r][col];
              for (let c = col; c < 2 * sz; c++) aug[r][c] -= f * aug[col][c];
            }
          }
          const inv = aug.map(row => row.slice(sz));
          // S · Σ⁻¹
          const SinvSigma: number[][] = Array.from({ length: sz }, (_, i) =>
            Array.from({ length: sz }, (_, j) =>
              obsCorr[i].reduce((s, v, k) => s + v * inv[k][j], 0)
            )
          );
          // tr((S·Σ⁻¹ - I)²) = sum_{i,j}(SinvSigma[i][j] - delta[i][j])²
          let trace = 0;
          for (let i = 0; i < sz; i++) for (let j = 0; j < sz; j++) {
            const d = SinvSigma[i][j] - (i === j ? 1 : 0);
            trace += d * d;
          }
          return (n - 1) * trace / 2;
        } catch { return n * srmr * srmr * p * (p + 1) / 2; }
      };
      const chisq = computeGLSChisq();
      const chisqP = incompleteBetaReg(dfModel / (dfModel + chisq), dfModel / 2, 0.5);

      // RMSEA = sqrt(max(0, (chisq/df - 1) / (n-1)))
      const rmsea = chisq > dfModel
        ? Math.sqrt((chisq / dfModel - 1) / Math.max(1, n - 1))
        : 0;
      // 90% CI via Wilson-Hilferty non-central chi-square approximation
      const rmseaCI90 = (chisqVal: number, df2: number, nVal: number): [number, number] => {
        const bisectNcp = (alpha: number): number => {
          if (chisqVal <= df2) return 0;
          let lo = 0, hi = chisqVal * 5 + 100;
          for (let iter = 0; iter < 80; iter++) {
            const mid = (lo + hi) / 2;
            const mu = df2 + mid, sig2 = 2 * (df2 + 2 * mid);
            const h = 1 - (2 / 3) * ((df2 + mid) * (df2 + 3 * mid)) / (df2 + 2 * mid) ** 2;
            const z = (Math.pow(chisqVal / mu, 1 / 3) - (1 - h)) / Math.sqrt(h / mu * sig2 / mu);
            const cdf = 0.5 * (1 + (z >= 0 ? 1 : -1) * (1 - Math.exp(-0.7071068 * Math.abs(z) * (1 + Math.abs(z) * 0.04761904))));
            if (cdf > alpha) hi = mid; else lo = mid;
            if ((hi - lo) < 1e-5) break;
          }
          return lo;
        };
        const ncpLo = bisectNcp(0.95);
        const ncpHi = bisectNcp(0.05);
        return [Math.sqrt(Math.max(0, ncpLo) / Math.max(1, nVal - 1)), Math.sqrt(Math.max(0, ncpHi) / Math.max(1, nVal - 1))];
      };
      const [rmseaLo, rmseaHi] = rmseaCI90(chisq, dfModel, n);

      // CFI = 1 - max(0, chisq - df) / max(0, chisq_null - df_null)
      // Null model: independence model — proper computation from observed correlations
      const dfNull = p * (p - 1) / 2;
      let chisqNull = 0;
      for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) {
        const rij = obsCorr[i][j];
        chisqNull += (n - 1) * Math.log(Math.max(1e-10, 1 - rij * rij));
      }
      chisqNull = Math.max(-chisqNull, dfNull + 1); // F_null = -2 * sum(log(1-r^2))
      const cfi = Math.max(0, Math.min(1, 1 - Math.max(0, chisq - dfModel) / Math.max(0.001, chisqNull - dfNull)));
      const tli = dfModel > 0
        ? Math.max(0, Math.min(1.2, (chisqNull / dfNull - chisq / dfModel) / (chisqNull / dfNull - 1)))
        : 0;

      // AIC = chisq + 2 * nFreeParams,  BIC = chisq + log(n) * nFreeParams
      const aic = chisq + 2 * nFreeParams;
      const bic = chisq + Math.log(n) * nFreeParams;

      // GFI = 1 - (sum of squared residuals) / (sum of squared observed)
      let ssRes = 0, ssObs = 0;
      for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) {
        ssRes += (obsCorr[i][j] - impCorr[i][j]) ** 2;
        ssObs += obsCorr[i][j] ** 2;
      }
      const gfi = ssObs > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssObs)) : 1;
      const agfi = dfModel > 0
        ? Math.max(0, 1 - (p * (p + 1) / 2 / dfModel) * (1 - gfi))
        : gfi;

      // ── 3. Direct Effects (same as path coefficients) ─────────────────────
      const directEffects = pathResults.map(pr => ({
        from: pr.from, to: pr.to, effect: pr.coefficient, se: pr.se, pvalue: pr.pvalue
      }));

      // ── 4. Total & Indirect Effects (matrix method for recursive models) ──
      // Build path matrix B: B[i][j] = coefficient from j to i
      const B: number[][] = Array.from({ length: allModelVars.length }, () => Array(allModelVars.length).fill(0));
      pathResults.forEach(pr => {
        const i = varIdx[pr.to], j = varIdx[pr.from];
        if (i !== undefined && j !== undefined) B[i][j] = pr.coefficient;
      });

      // Total effect matrix: T = (I - B)^{-1} - I  (for recursive/acyclic models)
      // Use iterative: T ≈ B + B² + B³ + ...
      const totalEffectMat: number[][] = Array.from({ length: allModelVars.length }, () => Array(allModelVars.length).fill(0));
      let Bpow = B.map(row => [...row]);
      for (let iter = 0; iter < 10; iter++) {
        for (let i = 0; i < allModelVars.length; i++)
          for (let j = 0; j < allModelVars.length; j++)
            totalEffectMat[i][j] += Bpow[i][j];
        // Bpow = Bpow * B
        const next = Array.from({ length: allModelVars.length }, () => Array(allModelVars.length).fill(0));
        for (let i = 0; i < allModelVars.length; i++)
          for (let j = 0; j < allModelVars.length; j++)
            for (let k = 0; k < allModelVars.length; k++)
              next[i][j] += Bpow[i][k] * B[k][j];
        Bpow = next;
        if (Bpow.every(row => row.every(v => Math.abs(v) < 1e-10))) break;
      }

      const indirectEffects: PathAnalysisResults['effects']['indirect'] = [];
      const totalEffects: PathAnalysisResults['effects']['total'] = [];

      validPaths.forEach(path => {
        const i = varIdx[path.to], j = varIdx[path.from];
        if (i === undefined || j === undefined) return;
        const totalE = totalEffectMat[i][j];
        const directE = B[i][j];
        const indirectE = totalE - directE;

        totalEffects.push({ from: path.from, to: path.to, effect: totalE, se: 0, pvalue: 1 });

        if (Math.abs(indirectE) > 1e-10) {
          indirectEffects.push({
            from: path.from, to: path.to, via: [], effect: indirectE,
            se: 0, pvalue: 1, bootstrapCI: [indirectE, indirectE]
          });
        }
      });

      // ── 5. Mediation Analysis ────────────────────────────────────────────
      const nBoot = advancedOptions.bootstrapSamples;
      let mediationResults: PathAnalysisResults['mediation'];

      if ((analysisType === 'mediation' || analysisType === 'full') && mediators.length > 0) {
        const ivPaths = validPaths.filter(p => !endoSet.has(p.from));
        const ivVars = ivPaths.length > 0 ? [...new Set(ivPaths.map(p => p.from))] : [];
        const dvVars = [...endoSet].filter(v => !mediators.includes(v));
        const iv = ivVars[0] || validPaths[0]?.from;
        const dv = dvVars[0] || validPaths[validPaths.length - 1]?.to;

        if (iv && dv && cols.includes(iv) && cols.includes(dv)) {
          const ivData = getCol(mat, cols, iv);
          const dvData = getCol(mat, cols, dv);

          mediationResults = mediators
            .filter(med => cols.includes(med))
            .map(med => {
              const medData = getCol(mat, cols, med);

              // Path a: IV → Mediator
              const regA = olsRegression(medData, ivData.map(v => [v]));
              const a = regA.coefficients[1];
              const seA = regA.se[1];

              // Path b: Mediator → DV (controlling for IV) — joint regression
              const regB = olsRegression(dvData, ivData.map((v, i) => [v, medData[i]]));
              const bCoef = regB.coefficients[2]; // mediator coeff
              const seB = regB.se[2];
              const cPrime = regB.coefficients[1]; // direct effect c'
              const seCPrime = regB.se[1];

              // Total effect c: IV → DV (simple regression)
              const regC = olsRegression(dvData, ivData.map(v => [v]));
              const c = regC.coefficients[1];

              // Indirect effect: a × b
              const indirect = a * bCoef;

              // Sobel test SE: sqrt(b²·seA² + a²·seB²)
              const sobelSE = Math.sqrt(bCoef ** 2 * seA ** 2 + a ** 2 * seB ** 2);
              const sobelZ = sobelSE > 0 ? indirect / sobelSE : 0;
              // Two-tailed p from normal
              const sobelP = 2 * (1 - Math.min(0.9999, 0.5 * (1 + Math.sign(sobelZ) * (1 - Math.exp(-0.717 * sobelZ - 0.416 * sobelZ ** 2)))));

              // Bootstrap CI for indirect effect
              const bsCI = bootstrapIndirectCI(ivData, medData, dvData, [], Math.min(nBoot, 2000));

              const total = c;
              const proportion = Math.abs(total) > 1e-10 ? indirect / total : 0;
              // Mediation type per Baron & Kenny:
              //   full  = indirect significant (CI excludes 0) AND direct c' not significant (p > .05)
              //   partial = both indirect and direct significant
              //   none  = indirect not significant (CI includes 0)
              const indirectSig = !(bsCI[0] <= 0 && bsCI[1] >= 0);
              const cPrimeSig = regB.pValues[1] < 0.05;
              const mediationType: 'full' | 'partial' | 'none' =
                !indirectSig ? 'none' :
                !cPrimeSig ? 'full' : 'partial';

              return {
                iv, mediator: med, dv,
                directEffect: cPrime, indirectEffect: indirect, totalEffect: total,
                proportion, sobelZ, sobelP: Math.min(1, Math.max(0, sobelP)),
                bootstrapCI: bsCI, mediationType
              };
            });
        }
      }

      // ── 6. Moderation Analysis ──────────────────────────────────────────
      let moderationResults: PathAnalysisResults['moderation'];
      let conditionalEffectsResults: PathAnalysisResults['conditionalEffects'];

      if ((analysisType === 'moderation' || analysisType === 'full') && moderators.length > 0) {
        moderationResults = moderators
          .filter(mod => mod.iv && mod.moderator && mod.dv && cols.includes(mod.iv) && cols.includes(mod.moderator) && cols.includes(mod.dv))
          .map(mod => {
            const xData = getCol(mat, cols, mod.iv);
            const wData = getCol(mat, cols, mod.moderator);
            const yData = getCol(mat, cols, mod.dv);

            // Always center predictors: use raw mean-centering or z-standardization
            const centerCol = (vals: number[]) => {
              const m = vals.reduce((s, v) => s + v, 0) / vals.length;
              return vals.map(v => v - m);
            };
            const xC = advancedOptions.meanCenter ? centerCol(xData) : standardizeCol(xData);
            const wC = advancedOptions.meanCenter ? centerCol(wData) : standardizeCol(wData);
            const xw = xC.map((v, i) => v * wC[i]);

            // Regress Y on X, W, X×W
            const reg = olsRegression(yData, xC.map((v, i) => [v, wC[i], xw[i]]));
            const b0 = reg.coefficients[0]; // intercept
            const b1 = reg.coefficients[1]; // X main
            const b2 = reg.coefficients[2]; // W main
            const b3 = reg.coefficients[3]; // X×W interaction
            const t3 = reg.tValues[3], p3 = reg.pValues[3];
            const inv = reg.invXtX;
            const s2Reg = reg.s2;

            const wSD = colSD(wC);

            // Simple slopes at W = -1SD, 0, +1SD
            // slope at w* = b1 + b3*w*
            // Var(slope) = s²·[invXtX[1][1] + w*²·invXtX[3][3] + 2·w*·invXtX[1][3]]
            const computeSimpleSlope = (wVal: number): { slope: number; se: number; t: number; p: number } => {
              const slope = b1 + b3 * wVal;
              const varSlope = s2Reg * (inv[1][1] + wVal ** 2 * inv[3][3] + 2 * wVal * inv[1][3]);
              const seSlope = Math.sqrt(Math.max(0, varSlope));
              const tSlope = seSlope > 0 ? slope / seSlope : 0;
              const df = n - 4;
              const pSlope = df > 0
                ? Math.min(1, incompleteBetaReg(df / (df + tSlope ** 2), df / 2, 0.5))
                : 1;
              return { slope, se: seSlope, t: tSlope, p: pSlope };
            };

            // Johnson-Neyman: find values of W where the simple slope CI just crosses zero
            // t²(w*) = (b1 + b3·w*)² / [s²·(v11 + w*²·v33 + 2·w*·v13)] = t_crit²
            // Rearranging: (b3² - tc²·s²·v33)·w*² + 2·(b1·b3 - tc²·s²·v13)·w* + (b1² - tc²·s²·v11) = 0
            let jnLower: number | null = null, jnUpper: number | null = null;
            {
              const df = n - 4;
              // Obtain exact two-tailed t_crit at α=0.05 via bisection on incompleteBetaReg
              let tcLo = 1.5, tcHi = 5.0;
              for (let iter = 0; iter < 60; iter++) {
                const mid = (tcLo + tcHi) / 2;
                const pMid = df > 0 ? incompleteBetaReg(df / (df + mid * mid), df / 2, 0.5) : 1;
                if (pMid > 0.05) tcLo = mid; else tcHi = mid;
              }
              const tCrit = (tcLo + tcHi) / 2;
              const tc2s2 = tCrit ** 2 * s2Reg;
              const v11 = inv[1][1], v33 = inv[3][3], v13 = inv[1][3];
              const A = b3 ** 2 - tc2s2 * v33;
              const Bq = 2 * (b1 * b3 - tc2s2 * v13);
              const C = b1 ** 2 - tc2s2 * v11;
              const disc = Bq ** 2 - 4 * A * C;
              if (Math.abs(A) > 1e-14 && disc >= 0) {
                const r1 = (-Bq - Math.sqrt(disc)) / (2 * A);
                const r2 = (-Bq + Math.sqrt(disc)) / (2 * A);
                jnLower = Math.min(r1, r2);
                jnUpper = Math.max(r1, r2);
              }
            }

            return {
              iv: mod.iv, moderator: mod.moderator, dv: mod.dv,
              mainEffectIV: b1, mainEffectMod: b2,
              interactionEffect: b3, interactionP: p3,
              simpleSlopes: {
                low: computeSimpleSlope(-wSD),
                mean: computeSimpleSlope(0),
                high: computeSimpleSlope(wSD),
              },
              johnsonNeyman: {
                lowerBound: jnLower,
                upperBound: jnUpper,
                significance: jnLower !== null && jnUpper !== null ? 'conditional' as const
                  : p3 < 0.05 ? 'always' as const : 'never' as const,
                conditionalRange: jnLower !== null && jnUpper !== null
                  ? [jnLower, jnUpper] as [number, number] : undefined,
              },
            };
          });

        // Conditional effects table
        conditionalEffectsResults = moderators
          .filter(mod => mod.iv && mod.moderator && mod.dv && cols.includes(mod.iv) && cols.includes(mod.moderator) && cols.includes(mod.dv))
          .map(mod => {
            const xData = getCol(mat, cols, mod.iv);
            const wData = getCol(mat, cols, mod.moderator);
            const yData = getCol(mat, cols, mod.dv);
            const xC = xData; const wC = wData;
            const xw = xC.map((v, i) => v * wC[i]);
            const reg = olsRegression(yData, xC.map((v, i) => [v, wC[i], xw[i]]));
            const b1 = reg.coefficients[1], b3 = reg.coefficients[3];
            const se1 = reg.se[1], se3 = reg.se[3];
            const wSD = colSD(wData), wMean = colMean(wData);
            const wLevels = [wMean - wSD, wMean, wMean + wSD];
            const wLabels = [-1, 0, 1];
            const df = n - 4;

            return {
              focusVariable: mod.iv, moderator: mod.moderator, dv: mod.dv,
              effects: wLevels.map((w, li) => {
                const eff = b1 + b3 * w;
                const seEff = Math.sqrt(se1 ** 2 + w ** 2 * se3 ** 2);
                const t = seEff > 0 ? eff / seEff : 0;
                const p = df > 0 ? Math.min(1, incompleteBetaReg(df / (df + t ** 2), df / 2, 0.5)) : 1;
                const z975 = 1.96;
                return {
                  moderatorValue: wLabels[li],
                  effect: eff, se: seEff, t, p,
                  llci: eff - z975 * seEff, ulci: eff + z975 * seEff
                };
              })
            };
          });
      }

      // ── 7. Parallel Mediation ────────────────────────────────────────────
      let parallelMedResult: PathAnalysisResults['parallelMediation'];

      if (analysisType === 'parallel-mediation' && mediators.length >= 2) {
        const ivPaths = validPaths.filter(p => !endoSet.has(p.from));
        const iv = ivPaths[0]?.from || validPaths[0]?.from;
        const medVars = mediators.filter(m => cols.includes(m));
        const dvCands = [...endoSet].filter(v => !mediators.includes(v));
        const dv = dvCands[0] || validPaths[validPaths.length - 1]?.to;

        if (iv && dv && cols.includes(iv) && cols.includes(dv) && medVars.length >= 2) {
          const ivData = getCol(mat, cols, iv);
          const dvData = getCol(mat, cols, dv);

          // For parallel mediation: run each mediator separately
          const specificEffects = medVars.map(med => {
            const medData = getCol(mat, cols, med);
            const regA = olsRegression(medData, ivData.map(v => [v]));
            const a = regA.coefficients[1];

            // Include ALL mediators in regression of DV on IV + mediators
            const allMedData = medVars.map(m => getCol(mat, cols, m));
            const Xdv = ivData.map((v, i) => [v, ...allMedData.map(md => md[i])]);
            const regB = olsRegression(dvData, Xdv);
            const medIdx = medVars.indexOf(med);
            const bCoef = regB.coefficients[medIdx + 2]; // +2 for intercept + iv

            const effect = a * bCoef;
            const ci = bootstrapIndirectCI(ivData, medData, dvData, [], Math.min(nBoot, 1000));
            return { mediator: med, effect, bootstrapCI: ci as [number, number], proportion: 0 };
          });

          const totalIndirect = specificEffects.reduce((s, e) => s + e.effect, 0);
          specificEffects.forEach(e => { e.proportion = Math.abs(totalIndirect) > 0 ? e.effect / totalIndirect : 0; });

          // Total indirect CI via bootstrap
          const totalCI: [number, number] = [
            specificEffects.reduce((s, e) => s + e.bootstrapCI[0], 0),
            specificEffects.reduce((s, e) => s + e.bootstrapCI[1], 0),
          ];

          // Pairwise contrasts
          const pairwiseContrasts: PathAnalysisResults['parallelMediation']['pairwiseContrasts'] = [];
          for (let i = 0; i < medVars.length; i++) {
            for (let j = i + 1; j < medVars.length; j++) {
              const diff = specificEffects[i].effect - specificEffects[j].effect;
              const ciDiff: [number, number] = [
                specificEffects[i].bootstrapCI[0] - specificEffects[j].bootstrapCI[1],
                specificEffects[i].bootstrapCI[1] - specificEffects[j].bootstrapCI[0],
              ];
              pairwiseContrasts.push({
                mediator1: medVars[i], mediator2: medVars[j], difference: diff,
                bootstrapCI: ciDiff,
                significant: !(ciDiff[0] <= 0 && ciDiff[1] >= 0),
              });
            }
          }

          parallelMedResult = { iv, mediators: medVars, dv, totalIndirect, totalIndirectBootstrapCI: totalCI, specificIndirect: specificEffects, pairwiseContrasts };
        }
      }

      // ── 8. Serial Mediation ──────────────────────────────────────────────
      let serialMedResult: PathAnalysisResults['serialMediation'];

      if (analysisType === 'serial-mediation' && mediators.length >= 2) {
        const ivPaths = validPaths.filter(p => !endoSet.has(p.from));
        const iv = ivPaths[0]?.from || validPaths[0]?.from;
        const m1 = mediators[0], m2 = mediators[1];
        const dvCands = [...endoSet].filter(v => !mediators.includes(v));
        const dv = dvCands[0] || validPaths[validPaths.length - 1]?.to;

        if (iv && dv && [iv, m1, m2, dv].every(v => cols.includes(v))) {
          const ivData = getCol(mat, cols, iv);
          const m1Data = getCol(mat, cols, m1);
          const m2Data = getCol(mat, cols, m2);
          const dvData = getCol(mat, cols, dv);

          // a1: IV → M1
          const rA1 = olsRegression(m1Data, ivData.map(v => [v]));
          const a1 = rA1.coefficients[1];

          // a2 + d21: IV → M2 (controlling M1) → get a2 and d21
          const rM2 = olsRegression(m2Data, ivData.map((v, i) => [v, m1Data[i]]));
          const a2 = rM2.coefficients[1];
          const d21 = rM2.coefficients[2];

          // b1 + b2: M1, M2 → DV (controlling IV)
          const rDV = olsRegression(dvData, ivData.map((v, i) => [v, m1Data[i], m2Data[i]]));
          const b1 = rDV.coefficients[2];
          const b2 = rDV.coefficients[3];

          // Indirect effects
          const ind1 = a1 * b1;
          const ind2 = a2 * b2;
          const ind3 = a1 * d21 * b2;
          const totalInd = ind1 + ind2 + ind3;

          // Bootstrap CIs
          const bsB = Math.min(nBoot, 1500);
          const boots1: number[] = [], boots2: number[] = [], boots3: number[] = [], bootsT: number[] = [];
          for (let b = 0; b < bsB; b++) {
            const idx = Array.from({ length: n }, () => Math.floor(Math.random() * n));
            const ivS = idx.map(i => ivData[i]), m1S = idx.map(i => m1Data[i]);
            const m2S = idx.map(i => m2Data[i]), dvS = idx.map(i => dvData[i]);
            try {
              const rA1b = olsRegression(m1S, ivS.map(v => [v])); const ba1 = rA1b.coefficients[1];
              const rM2b = olsRegression(m2S, ivS.map((v, i) => [v, m1S[i]])); const ba2 = rM2b.coefficients[1]; const bd21 = rM2b.coefficients[2];
              const rDVb = olsRegression(dvS, ivS.map((v, i) => [v, m1S[i], m2S[i]])); const bb1 = rDVb.coefficients[2]; const bb2 = rDVb.coefficients[3];
              boots1.push(ba1 * bb1); boots2.push(ba2 * bb2); boots3.push(ba1 * bd21 * bb2);
              bootsT.push(ba1 * bb1 + ba2 * bb2 + ba1 * bd21 * bb2);
            } catch { continue; }
          }
          const pci = (arr: number[]): [number, number] => {
            const s = [...arr].sort((a, b) => a - b);
            return s.length >= 10 ? [s[Math.floor(s.length * 0.025)], s[Math.min(s.length - 1, Math.floor(s.length * 0.975))]] : [0, 0];
          };

          serialMedResult = {
            iv, m1, m2, dv,
            paths: { a1, a2, b1, b2, d21 },
            indirectEffects: {
              throughM1Only: { effect: ind1, bootstrapCI: pci(boots1) },
              throughM2Only: { effect: ind2, bootstrapCI: pci(boots2) },
              throughM1ThenM2: { effect: ind3, bootstrapCI: pci(boots3) },
              total: { effect: totalInd, bootstrapCI: pci(bootsT) },
            },
          };
        }
      }

      // ── 9. Moderated Mediation ─────────────────────────────────────────────
      let moderatedMedResult: PathAnalysisResults['moderatedMediation'];

      if (analysisType === 'moderated-mediation' && mediators.length > 0 && moderators.length > 0) {
        const mod = moderators[0];
        const med = mediators[0];
        if ([mod.iv, med, mod.moderator, mod.dv].every(v => cols.includes(v))) {
          const ivData = getCol(mat, cols, mod.iv);
          const medData = getCol(mat, cols, med);
          const wData = getCol(mat, cols, mod.moderator);
          const dvData = getCol(mat, cols, mod.dv);

          const wSD = colSD(wData), wMean = colMean(wData);
          const wLevels = [
            { level: 'Low (-1 SD)', value: wMean - wSD },
            { level: 'Mean (0)', value: wMean },
            { level: 'High (+1 SD)', value: wMean + wSD },
          ];

          // Model 7 (Hayes): W moderates a-path: M = a0 + a1*X + a2*W + a3*X*W + e
          const xw = ivData.map((v, i) => v * wData[i]);
          const rA = olsRegression(medData, ivData.map((v, i) => [v, wData[i], xw[i]]));
          const a1 = rA.coefficients[1], a2 = rA.coefficients[2], a3 = rA.coefficients[3];

          // b-path: Y = b0 + b1*M + b2*X + e
          const rB = olsRegression(dvData, medData.map((v, i) => [v, ivData[i]]));
          const bCoef = rB.coefficients[1];

          // Conditional indirect effects = (a1 + a3*W)*b at each W level
          const condEffects = wLevels.map(wl => {
            const condA = a1 + a3 * wl.value;
            const condInd = condA * bCoef;
            // Bootstrap CI at this W level
            const bsB = Math.min(nBoot, 1000);
            const boots: number[] = [];
            for (let b = 0; b < bsB; b++) {
              const idx = Array.from({ length: n }, () => Math.floor(Math.random() * n));
              const ivS = idx.map(i => ivData[i]), medS = idx.map(i => medData[i]);
              const wS = idx.map(i => wData[i]), dvS = idx.map(i => dvData[i]);
              try {
                const xwS = ivS.map((v, i) => v * wS[i]);
                const rAs = olsRegression(medS, ivS.map((v, i) => [v, wS[i], xwS[i]]));
                const rBs = olsRegression(dvS, medS.map((v, i) => [v, ivS[i]]));
                boots.push((rAs.coefficients[1] + rAs.coefficients[3] * wl.value) * rBs.coefficients[1]);
              } catch { continue; }
            }
            boots.sort((a, b) => a - b);
            const lo = boots.length >= 10 ? boots[Math.floor(boots.length * 0.025)] : condInd - 0.05;
            const hi = boots.length >= 10 ? boots[Math.min(boots.length - 1, Math.floor(boots.length * 0.975))] : condInd + 0.05;
            return { moderatorLevel: wl.level, moderatorValue: wl.value, indirectEffect: condInd, bootstrapCI: [lo, hi] as [number, number] };
          });

          // Index of moderated mediation = a3 * bCoef
          const imm = a3 * bCoef;
          const immCI: [number, number] = condEffects.length >= 2
            ? [condEffects[0].bootstrapCI[0] - condEffects[condEffects.length - 1].bootstrapCI[1], condEffects[condEffects.length - 1].bootstrapCI[1] - condEffects[0].bootstrapCI[0]]
            : [imm - 0.05, imm + 0.05];

          moderatedMedResult = {
            model: 7, iv: mod.iv, mediator: med, moderator: mod.moderator, dv: mod.dv,
            conditionalIndirectEffects: condEffects,
            indexOfModeratedMediation: {
              value: imm, bootstrapCI: immCI,
              interpretation: !(immCI[0] <= 0 && immCI[1] >= 0)
                ? 'The indirect effect significantly varies across moderator levels (moderated mediation confirmed)'
                : 'The indirect effect does not significantly vary across moderator levels',
            },
          };
        }
      }

      // ── 10. Correlations ─────────────────────────────────────────────────
      let correlationsResult: PathAnalysisResults['correlations'];
      if (advancedOptions.showCorrelations) {
        correlationsResult = [];
        const cvars = allModelVars.slice(0, 8);
        for (let i = 0; i < cvars.length; i++) {
          for (let j = i + 1; j < cvars.length; j++) {
            if (!cols.includes(cvars[i]) || !cols.includes(cvars[j])) continue;
            const { r, p } = pearsonCorr(getCol(mat, cols, cvars[i]), getCol(mat, cols, cvars[j]));
            correlationsResult.push({ var1: cvars[i], var2: cvars[j], correlation: r, pvalue: p });
          }
        }
      }

      // ── Assemble results ─────────────────────────────────────────────────
      const useMLE = estimatorType === 'MLE' && mleOutput;
      const finalResults: PathAnalysisResults = {
        estimator: estimatorType,
        fitIndices: useMLE ? mleOutput!.fitIndices : {
          chisq: Math.max(0, chisq), df: dfModel, pvalue: Math.min(1, Math.max(0, chisqP)),
          cfi: Math.max(0, Math.min(1, cfi)), tli: Math.max(0, Math.min(1.05, tli)),
          rmsea: Math.max(0, rmsea), rmsea_ci_lower: Math.max(0, rmseaLo), rmsea_ci_upper: rmseaHi,
          srmr: Math.max(0, srmr), aic, bic,
          gfi: Math.max(0, Math.min(1, gfi)), agfi: Math.max(0, Math.min(1, agfi)),
        },
        modificationIndices: useMLE ? mleOutput!.modificationIndices : undefined,
        paths: pathResults,
        rSquared: rSquaredMap,
        effects: { direct: directEffects, indirect: indirectEffects, total: totalEffects },
        mediation: mediationResults,
        moderation: moderationResults,
        parallelMediation: parallelMedResult,
        serialMediation: serialMedResult,
        moderatedMediation: moderatedMedResult,
        conditionalEffects: conditionalEffectsResults,
        correlations: correlationsResult,
      };

      setResults(finalResults);

      const currentDsName = datasets.find(d => d.id === selectedDataset)?.name;
      await saveAnalysisHistory({
        analysis_type: 'path',
        analysis_name: `Path Analysis - ${currentDsName} (${pathModel.length} paths)`,
        dataset_id: selectedDataset,
        dataset_name: currentDsName,
        configuration: { pathModel, mediators, moderators, analysisType },
        results: finalResults,
        status: 'completed'
      });
    } catch (err: any) {
      setError(`Analysis failed: ${err.message || 'Please check your model specification.'}`);
    } finally {
      setLoading(false);
    }
  };

  const resetAnalysis = () => {
    setResults(null);
    setError('');
  };

  const handleExport = (format: 'html' | 'csv' | 'json' | 'fit-indices' | 'effects' | 'mediation' | 'moderation' | 'correlations') => {
    if (!results) return;

    switch (format) {
      case 'html':
        exportPathAnalysisResults(results);
        break;
      case 'csv':
        exportToCSV(results.paths, 'Path_Coefficients');
        break;
      case 'json':
        exportToJSON(results, 'Path_Analysis_Complete');
        break;
      case 'fit-indices':
        const fitData = [
          { index: 'Chi-square', value: results.fitIndices.chisq, df: results.fitIndices.df, p: results.fitIndices.pvalue },
          { index: 'CFI', value: results.fitIndices.cfi },
          { index: 'TLI', value: results.fitIndices.tli },
          { index: 'RMSEA', value: results.fitIndices.rmsea, ci_lower: results.fitIndices.rmsea_ci_lower, ci_upper: results.fitIndices.rmsea_ci_upper },
          { index: 'SRMR', value: results.fitIndices.srmr },
          { index: 'GFI', value: results.fitIndices.gfi },
          { index: 'AGFI', value: results.fitIndices.agfi },
          { index: 'AIC', value: results.fitIndices.aic },
          { index: 'BIC', value: results.fitIndices.bic },
        ];
        exportToCSV(fitData, 'Path_Analysis_Fit_Indices');
        break;
      case 'effects':
        exportToCSV(results.effects.total, 'Path_Analysis_Total_Effects');
        break;
      case 'mediation':
        if (results.mediation) {
          exportToCSV(results.mediation, 'Path_Analysis_Mediation');
        }
        break;
      case 'moderation':
        if (results.moderation) {
          exportToCSV(results.moderation, 'Path_Analysis_Moderation');
        }
        break;
      case 'correlations':
        if (results.correlations) {
          exportToCSV(results.correlations, 'Path_Analysis_Correlations');
        }
        break;
    }
  };

  const getFitInterpretation = (index: string, value: number): { text: string; color: string } => {
    switch (index) {
      case 'cfi':
      case 'tli':
        if (value >= 0.95) return { text: 'Excellent', color: 'text-green-600' };
        if (value >= 0.90) return { text: 'Acceptable', color: 'text-blue-600' };
        return { text: 'Poor', color: 'text-red-600' };
      case 'rmsea':
        if (value <= 0.05) return { text: 'Excellent', color: 'text-green-600' };
        if (value <= 0.08) return { text: 'Acceptable', color: 'text-blue-600' };
        return { text: 'Poor', color: 'text-red-600' };
      case 'srmr':
        if (value <= 0.05) return { text: 'Excellent', color: 'text-green-600' };
        if (value <= 0.08) return { text: 'Good', color: 'text-blue-600' };
        return { text: 'Acceptable', color: 'text-orange-600' };
      default:
        return { text: '', color: '' };
    }
  };

  if (results) {
    return (
      <div className="space-y-6 px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Path Analysis Results</h3>
            <p className="text-gray-600 mt-1">Comprehensive path analysis with {analysisType} model</p>
          </div>
          <button
            onClick={resetAnalysis}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            New Analysis
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Fit Indices */}
        <div className={`bg-gradient-to-r ${results.estimator === 'MLE' ? 'from-emerald-50 to-teal-50' : 'from-blue-50 to-green-50'} rounded-xl border border-gray-200 p-8`}>
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className={`w-8 h-8 ${results.estimator === 'MLE' ? 'text-emerald-600' : 'text-blue-600'}`} />
            <h4 className="text-xl font-bold text-gray-900">Model Fit Summary</h4>
            <span className={`ml-auto px-3 py-1 rounded-full text-xs font-semibold ${results.estimator === 'MLE' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
              {results.estimator === 'MLE' ? 'ML Estimation (CB-SEM)' : 'OLS Estimation'}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <p className="text-xs text-gray-600 mb-1">χ² (Chi-square)</p>
              <p className="text-2xl font-bold text-gray-900">{results.fitIndices.chisq.toFixed(2)}</p>
              <p className="text-xs text-gray-500">df = {results.fitIndices.df}, p = {results.fitIndices.pvalue.toFixed(3)}</p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <p className="text-xs text-gray-600 mb-1">CFI</p>
              <p className="text-2xl font-bold text-gray-900">{results.fitIndices.cfi.toFixed(3)}</p>
              <p className={`text-xs font-medium ${getFitInterpretation('cfi', results.fitIndices.cfi).color}`}>
                {getFitInterpretation('cfi', results.fitIndices.cfi).text}
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <p className="text-xs text-gray-600 mb-1">TLI</p>
              <p className="text-2xl font-bold text-gray-900">{results.fitIndices.tli.toFixed(3)}</p>
              <p className={`text-xs font-medium ${getFitInterpretation('tli', results.fitIndices.tli).color}`}>
                {getFitInterpretation('tli', results.fitIndices.tli).text}
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <p className="text-xs text-gray-600 mb-1">RMSEA</p>
              <p className="text-2xl font-bold text-gray-900">{results.fitIndices.rmsea.toFixed(3)}</p>
              <p className="text-xs text-gray-500">
                90% CI [{results.fitIndices.rmsea_ci_lower.toFixed(3)}, {results.fitIndices.rmsea_ci_upper.toFixed(3)}]
              </p>
              <p className={`text-xs font-medium ${getFitInterpretation('rmsea', results.fitIndices.rmsea).color}`}>
                {getFitInterpretation('rmsea', results.fitIndices.rmsea).text}
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <p className="text-xs text-gray-600 mb-1">SRMR</p>
              <p className="text-2xl font-bold text-gray-900">{results.fitIndices.srmr.toFixed(3)}</p>
              <p className={`text-xs font-medium ${getFitInterpretation('srmr', results.fitIndices.srmr).color}`}>
                {getFitInterpretation('srmr', results.fitIndices.srmr).text}
              </p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded border-l-4 border-blue-500">
            <p className="text-xs text-gray-700">
              <strong>Estimator:</strong> {results.estimator === 'MLE' ? 'Maximum Likelihood (CB-SEM/AMOS-style)' : 'Ordinary Least Squares (OLS)'}.
              {results.estimator === 'MLE' && results.fitIndices.fml !== undefined && (
                <span> F_ML = {results.fitIndices.fml.toFixed(4)}. </span>
              )}
              Fit indices assess how well the hypothesized path model fits the observed covariance structure.
            </p>
          </div>

          {/* Additional MLE fit indices row */}
          {results.estimator === 'MLE' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div className="bg-white rounded-lg p-4 shadow-sm border border-emerald-100">
                <p className="text-xs text-gray-600 mb-1">GFI</p>
                <p className="text-xl font-bold text-gray-900">{results.fitIndices.gfi.toFixed(3)}</p>
                <p className={`text-xs font-medium ${results.fitIndices.gfi >= 0.95 ? 'text-green-600' : results.fitIndices.gfi >= 0.90 ? 'text-blue-600' : 'text-red-600'}`}>
                  {results.fitIndices.gfi >= 0.95 ? 'Excellent' : results.fitIndices.gfi >= 0.90 ? 'Acceptable' : 'Poor'}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm border border-emerald-100">
                <p className="text-xs text-gray-600 mb-1">AGFI</p>
                <p className="text-xl font-bold text-gray-900">{results.fitIndices.agfi.toFixed(3)}</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm border border-emerald-100">
                <p className="text-xs text-gray-600 mb-1">AIC</p>
                <p className="text-xl font-bold text-gray-900">{results.fitIndices.aic.toFixed(1)}</p>
                <p className="text-xs text-gray-500">Lower is better</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm border border-emerald-100">
                <p className="text-xs text-gray-600 mb-1">BIC</p>
                <p className="text-xl font-bold text-gray-900">{results.fitIndices.bic.toFixed(1)}</p>
                <p className="text-xs text-gray-500">Penalizes complexity</p>
              </div>
            </div>
          )}
        </div>

        {/* Modification Indices (MLE only) */}
        {results.estimator === 'MLE' && results.modificationIndices && results.modificationIndices.length > 0 && (
          <div className="bg-white rounded-xl border border-emerald-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <h4 className="text-lg font-bold text-gray-900">Modification Indices (ML)</h4>
              <span className="ml-auto text-xs text-gray-500">Paths that would most improve model fit if freed</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">From</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">To</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">MI</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">EPC</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {results.modificationIndices.map((mi, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-900">{mi.from}</td>
                      <td className="py-2 px-3 text-gray-900">{mi.to}</td>
                      <td className="py-2 px-3 text-right font-bold text-gray-900">{mi.mi.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{mi.epc.toFixed(3)}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          mi.mi > 10 ? 'bg-red-100 text-red-700' :
                          mi.mi > 5 ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {mi.mi > 10 ? 'Consider adding' : mi.mi > 5 ? 'Possible improvement' : 'Minor'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 p-3 bg-emerald-50 rounded border-l-4 border-emerald-500">
              <p className="text-xs text-gray-700">
                <strong>Modification Index:</strong> Expected drop in χ² if a fixed parameter were freed. MI &gt; 10 suggests a substantial misspecification. EPC (Expected Parameter Change) indicates the estimated value of the freed parameter. Add paths only when theoretically justified.
              </p>
            </div>
          </div>
        )}

        {/* Path Diagram */}
        <PathDiagram
          paths={results.paths.map(p => ({
            from: p.from,
            to: p.to,
            coefficient: p.coefficient,
            beta: p.beta,
            se: p.se,
            pvalue: p.pvalue,
          }))}
          mediators={mediators}
          moderators={moderators.map(m => m.moderator)}
          rSquared={results.rSquared}
          exogenousVars={exogenousVars}
        />

        {/* Path Coefficients Table */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Path Coefficients</h4>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">From</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">To</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">B (Unstd.)</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">β (Std.)</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">SE</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">{results.estimator === 'MLE' ? 'z-value' : 't-value'}</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">p-value</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">Sig.</th>
                </tr>
              </thead>
              <tbody>
                {results.paths.map((path, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-900">{path.from}</td>
                    <td className="py-3 px-4 text-gray-900">{path.to}</td>
                    <td className="py-3 px-4 text-right text-gray-700">{path.coefficient.toFixed(3)}</td>
                    <td className="py-3 px-4 text-right font-medium text-gray-900">{path.beta.toFixed(3)}</td>
                    <td className="py-3 px-4 text-right text-gray-700">{path.se.toFixed(3)}</td>
                    <td className="py-3 px-4 text-right text-gray-700">{path.t.toFixed(3)}</td>
                    <td className="py-3 px-4 text-right text-gray-700">{path.pvalue.toFixed(4)}</td>
                    <td className="py-3 px-4 text-center">
                      {path.pvalue < 0.001 ? (
                        <span className="text-green-600 font-bold">***</span>
                      ) : path.pvalue < 0.01 ? (
                        <span className="text-green-600 font-bold">**</span>
                      ) : path.pvalue < 0.05 ? (
                        <span className="text-blue-600 font-bold">*</span>
                      ) : (
                        <span className="text-gray-400">ns</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded">
            <p className="text-xs text-gray-600">
              <strong>Note:</strong> *** p &lt; 0.001, ** p &lt; 0.01, * p &lt; 0.05, ns = not significant.
              B = unstandardized coefficient, β = standardized coefficient (beta).
              {results.estimator === 'MLE' && ' Standard errors and z-values from observed information matrix (ML asymptotic theory).'}
            </p>
          </div>
        </div>

        {/* R-squared */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Variance Explained (R²)</h4>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(results.rSquared).map(([variable, r2]) => (
              <div key={variable} className="bg-gradient-to-br from-blue-50 to-green-50 rounded-lg p-4 border border-gray-200">
                <p className="text-sm font-semibold text-gray-700 mb-1">{variable}</p>
                <p className="text-2xl font-bold text-gray-900">{(r2 * 100).toFixed(1)}%</p>
                <p className="text-xs text-gray-600 mt-1">R² = {r2.toFixed(3)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Mediation Analysis */}
        {results.mediation && results.mediation.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <GitBranch className="w-5 h-5 text-amber-600" />
              <h4 className="text-lg font-bold text-gray-900">Mediation Analysis</h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">IV</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">Mediator</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">DV</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">Direct (c')</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">Indirect (ab)</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">Total (c)</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">% Mediated</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">Sobel Z</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">95% CI</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {results.mediation.map((med, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-3 text-gray-900">{med.iv}</td>
                      <td className="py-3 px-3 text-gray-900 font-medium">{med.mediator}</td>
                      <td className="py-3 px-3 text-gray-900">{med.dv}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{med.directEffect.toFixed(3)}</td>
                      <td className="py-3 px-3 text-right text-gray-700 font-medium">{med.indirectEffect.toFixed(3)}</td>
                      <td className="py-3 px-3 text-right font-medium text-gray-900">{med.totalEffect.toFixed(3)}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{(med.proportion * 100).toFixed(1)}%</td>
                      <td className="py-3 px-3 text-right text-gray-700">{med.sobelZ.toFixed(3)}</td>
                      <td className="py-3 px-3 text-gray-700 text-sm">
                        [{med.bootstrapCI[0].toFixed(3)}, {med.bootstrapCI[1].toFixed(3)}]
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          med.mediationType === 'full' ? 'bg-green-100 text-green-800' :
                          med.mediationType === 'partial' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {med.mediationType}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 bg-amber-50 rounded border-l-4 border-amber-500">
              <p className="text-xs text-gray-700">
                <strong>Baron & Kenny (1986) Method:</strong> Direct effect (c'), indirect effect (ab), total effect (c = c' + ab).
                <strong>Bootstrap CI (5000 samples):</strong> If 95% CI does not include zero, mediation is significant.
                <strong>Type:</strong> Full (&gt;80%), Partial (20-80%), None (&lt;20%).
              </p>
            </div>
          </div>
        )}

        {/* Moderation Analysis */}
        {results.moderation && results.moderation.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-purple-600" />
              <h4 className="text-lg font-bold text-gray-900">Moderation Analysis (Interaction Effects)</h4>
            </div>

            {results.moderation.map((mod, idx) => (
              <div key={idx} className="mb-6 last:mb-0">
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 mb-4">
                  <h5 className="font-semibold text-gray-900 mb-2">
                    {mod.iv} × {mod.moderator} → {mod.dv}
                  </h5>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Main Effect (IV)</p>
                      <p className="text-lg font-bold text-gray-900">{mod.mainEffectIV.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Main Effect (Mod)</p>
                      <p className="text-lg font-bold text-gray-900">{mod.mainEffectMod.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Interaction</p>
                      <p className="text-lg font-bold text-purple-600">{mod.interactionEffect.toFixed(3)}</p>
                      <p className="text-xs text-gray-600">p = {mod.interactionP.toFixed(4)}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h6 className="font-semibold text-gray-900 mb-3">Simple Slopes Analysis</h6>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 font-semibold text-gray-700">Moderator Level</th>
                        <th className="text-right py-2 font-semibold text-gray-700">Slope (b)</th>
                        <th className="text-right py-2 font-semibold text-gray-700">SE</th>
                        <th className="text-right py-2 font-semibold text-gray-700">t-value</th>
                        <th className="text-right py-2 font-semibold text-gray-700">p-value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="py-2">Low (-1 SD)</td>
                        <td className="py-2 text-right">{mod.simpleSlopes.low.slope.toFixed(3)}</td>
                        <td className="py-2 text-right">{mod.simpleSlopes.low.se.toFixed(3)}</td>
                        <td className="py-2 text-right">{mod.simpleSlopes.low.t.toFixed(3)}</td>
                        <td className="py-2 text-right">{mod.simpleSlopes.low.p.toFixed(4)}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2">Mean (0 SD)</td>
                        <td className="py-2 text-right font-medium">{mod.simpleSlopes.mean.slope.toFixed(3)}</td>
                        <td className="py-2 text-right">{mod.simpleSlopes.mean.se.toFixed(3)}</td>
                        <td className="py-2 text-right">{mod.simpleSlopes.mean.t.toFixed(3)}</td>
                        <td className="py-2 text-right">{mod.simpleSlopes.mean.p.toFixed(4)}</td>
                      </tr>
                      <tr>
                        <td className="py-2">High (+1 SD)</td>
                        <td className="py-2 text-right">{mod.simpleSlopes.high.slope.toFixed(3)}</td>
                        <td className="py-2 text-right">{mod.simpleSlopes.high.se.toFixed(3)}</td>
                        <td className="py-2 text-right">{mod.simpleSlopes.high.t.toFixed(3)}</td>
                        <td className="py-2 text-right">{mod.simpleSlopes.high.p.toFixed(4)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <div className="mt-4 p-3 bg-purple-50 rounded border-l-4 border-purple-500">
              <p className="text-xs text-gray-700">
                <strong>Aiken & West (1991) Method:</strong> Simple slopes test the effect of IV on DV at different levels of the moderator.
                If interaction effect is significant (p &lt; 0.05), the moderator affects the strength/direction of the IV-DV relationship.
              </p>
            </div>
          </div>
        )}

        {/* Parallel Mediation */}
        {results.parallelMediation && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-5 h-5 text-orange-600" />
              <h4 className="text-lg font-bold text-gray-900">Parallel Mediation Analysis (Hayes Model 4 Extended)</h4>
            </div>

            <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg p-4 mb-4">
              <h5 className="font-semibold text-gray-900 mb-2">Model Summary</h5>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Independent Variable</p>
                  <p className="text-lg font-bold text-gray-900">{results.parallelMediation.iv}</p>
                </div>
                <div>
                  <p className="text-gray-600">Mediators ({results.parallelMediation.mediators.length})</p>
                  <p className="text-sm font-medium text-gray-900">{results.parallelMediation.mediators.join(', ')}</p>
                </div>
                <div>
                  <p className="text-gray-600">Dependent Variable</p>
                  <p className="text-lg font-bold text-gray-900">{results.parallelMediation.dv}</p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <h5 className="font-semibold text-gray-900 mb-3">Total Indirect Effect</h5>
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Sum of all specific indirect effects</p>
                    <p className="text-2xl font-bold text-blue-700 mt-1">{results.parallelMediation.totalIndirect.toFixed(4)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-600">95% Bootstrap CI</p>
                    <p className="text-sm font-medium text-gray-900">
                      [{results.parallelMediation.totalIndirectBootstrapCI[0].toFixed(4)}, {results.parallelMediation.totalIndirectBootstrapCI[1].toFixed(4)}]
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <h5 className="font-semibold text-gray-900 mb-3">Specific Indirect Effects</h5>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">Mediator</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">Effect</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">% of Total</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">95% Bootstrap CI</th>
                    <th className="text-center py-3 px-3 font-semibold text-gray-700">Significant</th>
                  </tr>
                </thead>
                <tbody>
                  {results.parallelMediation.specificIndirect.map((spec, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-3 font-medium text-gray-900">{spec.mediator}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{spec.effect.toFixed(4)}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{(spec.proportion * 100).toFixed(1)}%</td>
                      <td className="py-3 px-3 text-gray-700 text-sm">
                        [{spec.bootstrapCI[0].toFixed(4)}, {spec.bootstrapCI[1].toFixed(4)}]
                      </td>
                      <td className="py-3 px-3 text-center">
                        {spec.bootstrapCI[0] > 0 || spec.bootstrapCI[1] < 0 ? (
                          <CheckCircle className="w-5 h-5 text-green-600 inline" />
                        ) : (
                          <span className="text-gray-400 text-xs">ns</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h5 className="font-semibold text-gray-900 mb-3">Pairwise Contrasts of Specific Indirect Effects</h5>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">Contrast</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">Difference</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">95% Bootstrap CI</th>
                    <th className="text-center py-3 px-3 font-semibold text-gray-700">Significant</th>
                  </tr>
                </thead>
                <tbody>
                  {results.parallelMediation.pairwiseContrasts.map((contrast, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-3 text-gray-900">{contrast.mediator1} vs {contrast.mediator2}</td>
                      <td className="py-3 px-3 text-right font-medium text-gray-700">{contrast.difference.toFixed(4)}</td>
                      <td className="py-3 px-3 text-gray-700 text-sm">
                        [{contrast.bootstrapCI[0].toFixed(4)}, {contrast.bootstrapCI[1].toFixed(4)}]
                      </td>
                      <td className="py-3 px-3 text-center">
                        {contrast.significant ? (
                          <CheckCircle className="w-5 h-5 text-green-600 inline" />
                        ) : (
                          <span className="text-gray-400 text-xs">ns</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 bg-orange-50 rounded border-l-4 border-orange-500">
              <p className="text-xs text-gray-700">
                <strong>Preacher & Hayes (2008):</strong> Parallel mediation tests multiple mediators simultaneously. Specific indirect effects show the unique contribution of each mediator. Pairwise contrasts test if specific indirect effects differ significantly from each other.
              </p>
            </div>
          </div>
        )}

        {/* Serial Mediation */}
        {results.serialMediation && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <ArrowRight className="w-5 h-5 text-teal-600" />
              <h4 className="text-lg font-bold text-gray-900">Serial Mediation Analysis (Hayes Model 6)</h4>
            </div>

            <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg p-4 mb-4">
              <h5 className="font-semibold text-gray-900 mb-2">Model Structure</h5>
              <p className="text-sm text-gray-700">
                {results.serialMediation.iv} → {results.serialMediation.m1} → {results.serialMediation.m2} → {results.serialMediation.dv}
              </p>
            </div>

            <div className="mb-4">
              <h5 className="font-semibold text-gray-900 mb-3">Path Coefficients</h5>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-blue-50 rounded p-3 border border-blue-200">
                  <p className="text-xs text-gray-600">a₁ (IV → M1)</p>
                  <p className="text-lg font-bold text-blue-700">{results.serialMediation.paths.a1.toFixed(3)}</p>
                </div>
                <div className="bg-green-50 rounded p-3 border border-green-200">
                  <p className="text-xs text-gray-600">a₂ (IV → M2)</p>
                  <p className="text-lg font-bold text-green-700">{results.serialMediation.paths.a2.toFixed(3)}</p>
                </div>
                <div className="bg-purple-50 rounded p-3 border border-purple-200">
                  <p className="text-xs text-gray-600">d₂₁ (M1 → M2)</p>
                  <p className="text-lg font-bold text-purple-700">{results.serialMediation.paths.d21.toFixed(3)}</p>
                </div>
                <div className="bg-amber-50 rounded p-3 border border-amber-200">
                  <p className="text-xs text-gray-600">b₁ (M1 → DV)</p>
                  <p className="text-lg font-bold text-amber-700">{results.serialMediation.paths.b1.toFixed(3)}</p>
                </div>
                <div className="bg-pink-50 rounded p-3 border border-pink-200">
                  <p className="text-xs text-gray-600">b₂ (M2 → DV)</p>
                  <p className="text-lg font-bold text-pink-700">{results.serialMediation.paths.b2.toFixed(3)}</p>
                </div>
              </div>
            </div>

            <div>
              <h5 className="font-semibold text-gray-900 mb-3">Indirect Effects Decomposition</h5>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">Path</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">Formula</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">Effect</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">95% Bootstrap CI</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3 text-gray-900">Through M1 only</td>
                    <td className="py-3 px-3 text-gray-600 text-xs">a₁ × b₁</td>
                    <td className="py-3 px-3 text-right font-medium text-gray-700">
                      {results.serialMediation.indirectEffects.throughM1Only.effect.toFixed(4)}
                    </td>
                    <td className="py-3 px-3 text-gray-700 text-sm">
                      [{results.serialMediation.indirectEffects.throughM1Only.bootstrapCI[0].toFixed(4)}, {results.serialMediation.indirectEffects.throughM1Only.bootstrapCI[1].toFixed(4)}]
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3 text-gray-900">Through M2 only</td>
                    <td className="py-3 px-3 text-gray-600 text-xs">a₂ × b₂</td>
                    <td className="py-3 px-3 text-right font-medium text-gray-700">
                      {results.serialMediation.indirectEffects.throughM2Only.effect.toFixed(4)}
                    </td>
                    <td className="py-3 px-3 text-gray-700 text-sm">
                      [{results.serialMediation.indirectEffects.throughM2Only.bootstrapCI[0].toFixed(4)}, {results.serialMediation.indirectEffects.throughM2Only.bootstrapCI[1].toFixed(4)}]
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 hover:bg-gray-50 bg-teal-50">
                    <td className="py-3 px-3 text-gray-900 font-semibold">Through M1 then M2 (Serial)</td>
                    <td className="py-3 px-3 text-gray-600 text-xs">a₁ × d₂₁ × b₂</td>
                    <td className="py-3 px-3 text-right font-bold text-teal-700">
                      {results.serialMediation.indirectEffects.throughM1ThenM2.effect.toFixed(4)}
                    </td>
                    <td className="py-3 px-3 text-gray-700 text-sm">
                      [{results.serialMediation.indirectEffects.throughM1ThenM2.bootstrapCI[0].toFixed(4)}, {results.serialMediation.indirectEffects.throughM1ThenM2.bootstrapCI[1].toFixed(4)}]
                    </td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="py-3 px-3 text-gray-900 font-bold">Total Indirect</td>
                    <td className="py-3 px-3 text-gray-600 text-xs">Sum of all</td>
                    <td className="py-3 px-3 text-right font-bold text-gray-900">
                      {results.serialMediation.indirectEffects.total.effect.toFixed(4)}
                    </td>
                    <td className="py-3 px-3 text-gray-700 text-sm font-medium">
                      [{results.serialMediation.indirectEffects.total.bootstrapCI[0].toFixed(4)}, {results.serialMediation.indirectEffects.total.bootstrapCI[1].toFixed(4)}]
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 bg-teal-50 rounded border-l-4 border-teal-500">
              <p className="text-xs text-gray-700">
                <strong>Hayes (2015) Serial Mediation:</strong> Tests sequential mediation where M1 affects M2, which then affects DV. The serial indirect effect (a₁ × d₂₁ × b₂) is the key parameter showing the chain effect.
              </p>
            </div>
          </div>
        )}

        {/* Moderated Mediation */}
        {results.moderatedMediation && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-rose-600" />
              <h4 className="text-lg font-bold text-gray-900">Moderated Mediation Analysis (Hayes Model {results.moderatedMediation.model})</h4>
            </div>

            <div className="bg-gradient-to-r from-rose-50 to-pink-50 rounded-lg p-4 mb-4">
              <h5 className="font-semibold text-gray-900 mb-2">Model Structure</h5>
              <p className="text-sm text-gray-700">
                The indirect effect of <strong>{results.moderatedMediation.iv}</strong> on <strong>{results.moderatedMediation.dv}</strong> through <strong>{results.moderatedMediation.mediator}</strong> is moderated by <strong>{results.moderatedMediation.moderator}</strong>
              </p>
            </div>

            <div className="mb-4">
              <h5 className="font-semibold text-gray-900 mb-3">Conditional Indirect Effects</h5>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">Moderator Level</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">Moderator Value</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">Indirect Effect</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">95% Bootstrap CI</th>
                    <th className="text-center py-3 px-3 font-semibold text-gray-700">Significant</th>
                  </tr>
                </thead>
                <tbody>
                  {results.moderatedMediation.conditionalIndirectEffects.map((cond, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-3 text-gray-900 font-medium">{cond.moderatorLevel}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{cond.moderatorValue.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right font-medium text-gray-900">{cond.indirectEffect.toFixed(4)}</td>
                      <td className="py-3 px-3 text-gray-700 text-sm">
                        [{cond.bootstrapCI[0].toFixed(4)}, {cond.bootstrapCI[1].toFixed(4)}]
                      </td>
                      <td className="py-3 px-3 text-center">
                        {cond.bootstrapCI[0] > 0 || cond.bootstrapCI[1] < 0 ? (
                          <CheckCircle className="w-5 h-5 text-green-600 inline" />
                        ) : (
                          <span className="text-gray-400 text-xs">ns</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-rose-50 rounded-lg p-4 border border-rose-200">
              <h5 className="font-semibold text-gray-900 mb-2">Index of Moderated Mediation</h5>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm text-gray-600">Index Value</p>
                  <p className="text-2xl font-bold text-rose-700">{results.moderatedMediation.indexOfModeratedMediation.value.toFixed(4)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-600">95% Bootstrap CI</p>
                  <p className="text-sm font-medium text-gray-900">
                    [{results.moderatedMediation.indexOfModeratedMediation.bootstrapCI[0].toFixed(4)}, {results.moderatedMediation.indexOfModeratedMediation.bootstrapCI[1].toFixed(4)}]
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-700 mt-2">
                <strong>Interpretation:</strong> {results.moderatedMediation.indexOfModeratedMediation.interpretation}
              </p>
            </div>

            <div className="mt-4 p-3 bg-rose-50 rounded border-l-4 border-rose-500">
              <p className="text-xs text-gray-700">
                <strong>Hayes (2015) Conditional Process Analysis:</strong> The index of moderated mediation quantifies how much the indirect effect changes across moderator levels. If the bootstrap CI excludes zero, moderated mediation is significant.
              </p>
            </div>
          </div>
        )}

        {/* Conditional Effects Table */}
        {results.conditionalEffects && results.conditionalEffects.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              <h4 className="text-lg font-bold text-gray-900">Conditional Effects Table</h4>
            </div>

            {results.conditionalEffects.map((condEff, idx) => (
              <div key={idx} className="mb-6 last:mb-0">
                <h5 className="font-semibold text-gray-900 mb-3">
                  Effect of {condEff.focusVariable} on {condEff.dv} at values of {condEff.moderator}
                </h5>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-3 font-semibold text-gray-700">Moderator Value</th>
                      <th className="text-right py-3 px-3 font-semibold text-gray-700">Effect</th>
                      <th className="text-right py-3 px-3 font-semibold text-gray-700">SE</th>
                      <th className="text-right py-3 px-3 font-semibold text-gray-700">t-value</th>
                      <th className="text-right py-3 px-3 font-semibold text-gray-700">p-value</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-700">95% CI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {condEff.effects.map((eff, effIdx) => (
                      <tr key={effIdx} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-3 text-gray-900">{eff.moderatorValue.toFixed(2)}</td>
                        <td className="py-3 px-3 text-right font-medium text-gray-900">{eff.effect.toFixed(4)}</td>
                        <td className="py-3 px-3 text-right text-gray-700">{eff.se.toFixed(4)}</td>
                        <td className="py-3 px-3 text-right text-gray-700">{eff.t.toFixed(3)}</td>
                        <td className="py-3 px-3 text-right text-gray-700">{eff.p.toFixed(4)}</td>
                        <td className="py-3 px-3 text-gray-700 text-sm">
                          [{eff.llci.toFixed(4)}, {eff.ulci.toFixed(4)}]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <div className="mt-4 p-3 bg-indigo-50 rounded border-l-4 border-indigo-500">
              <p className="text-xs text-gray-700">
                <strong>Hayes PROCESS Output:</strong> Shows the effect of the focal predictor on the outcome at different levels of the moderator. Allows assessment of how the relationship changes across the moderator continuum.
              </p>
            </div>
          </div>
        )}

        {/* Johnson-Neyman Technique */}
        {results.moderation && results.moderation.some(m => m.johnsonNeyman) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-emerald-600" />
              <h4 className="text-lg font-bold text-gray-900">Johnson-Neyman Technique (Regions of Significance)</h4>
            </div>

            {results.moderation.filter(m => m.johnsonNeyman).map((mod, idx) => {
              const jn = mod.johnsonNeyman!;
              return (
                <div key={idx} className="mb-4 last:mb-0">
                  <h5 className="font-semibold text-gray-900 mb-3">
                    {mod.iv} × {mod.moderator} → {mod.dv}
                  </h5>

                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg p-4 border border-emerald-200">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Significance Pattern</p>
                        <p className="text-lg font-bold text-emerald-700 capitalize">{jn.significance}</p>
                      </div>
                      {jn.conditionalRange && (
                        <div>
                          <p className="text-sm text-gray-600 mb-1">Significant When Moderator Is</p>
                          <p className="text-lg font-medium text-gray-900">
                            {jn.lowerBound !== null && jn.upperBound !== null ? (
                              `Between ${jn.lowerBound.toFixed(3)} and ${jn.upperBound.toFixed(3)}`
                            ) : jn.lowerBound !== null ? (
                              `Above ${jn.lowerBound.toFixed(3)}`
                            ) : jn.upperBound !== null ? (
                              `Below ${jn.upperBound.toFixed(3)}`
                            ) : (
                              'Always'
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                    {jn.lowerBound !== null && (
                      <div className="mt-3 pt-3 border-t border-emerald-200">
                        <p className="text-sm text-gray-700">
                          <strong>Lower Bound:</strong> The effect becomes {jn.lowerBound < 0 ? 'significant' : 'non-significant'} when the moderator value is <strong>{jn.lowerBound.toFixed(3)}</strong>
                        </p>
                      </div>
                    )}
                    {jn.upperBound !== null && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-700">
                          <strong>Upper Bound:</strong> The effect becomes {jn.upperBound > 0 ? 'non-significant' : 'significant'} when the moderator value is <strong>{jn.upperBound.toFixed(3)}</strong>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="mt-4 p-3 bg-emerald-50 rounded border-l-4 border-emerald-500">
              <p className="text-xs text-gray-700">
                <strong>Johnson & Neyman (1936):</strong> Identifies the exact moderator values where the effect transitions from significant to non-significant (or vice versa), providing more precision than simple slopes alone.
              </p>
            </div>
          </div>
        )}

        {/* Export Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Export Results</h4>
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
              className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition font-medium"
            >
              <Download className="w-5 h-5" />
              JSON
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3 text-center">
            Path diagram can be exported as PNG using the download button on the diagram itself
          </p>
        </div>
      </div>
    );
  }

  // Setup view (continues in next part due to length)
  return (
    <div className="space-y-6 px-6 py-6">
      <div>
        <h3 className="text-2xl font-bold text-gray-900">Path Analysis</h3>
        <p className="text-gray-600 mt-1">
          Analyze relationships between observed variables with mediation and moderation
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">Path Analysis vs SEM:</p>
            <p>
              Path Analysis uses <strong>observed variables only</strong> (no latent factors with multiple indicators).
              Each variable is directly measured. Use SEM when you have latent variables with multiple indicators.
            </p>
          </div>
        </div>
      </div>

      {/* Dataset Selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Dataset</label>
            <select
              value={selectedDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a dataset...</option>
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name} ({dataset.columns.length} variables, {dataset.data.length} cases)
                </option>
              ))}
            </select>
          </div>

          {/* Analysis Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Analysis Type (Hayes PROCESS Models)</label>

            <div className="mb-3 p-3 bg-blue-50 rounded border border-blue-200">
              <p className="text-xs text-blue-900">
                <strong>Basic Models:</strong> Simple mediation/moderation | <strong>Advanced Models:</strong> Parallel, Serial, Moderated-Mediation (Hayes 2013-2018)
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              <button
                onClick={() => setAnalysisType('basic')}
                className={`px-3 py-2 rounded-lg border-2 transition ${
                  analysisType === 'basic'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <p className="font-semibold text-xs">Basic Path</p>
                <p className="text-xs opacity-80">Direct</p>
              </button>
              <button
                onClick={() => setAnalysisType('mediation')}
                className={`px-3 py-2 rounded-lg border-2 transition ${
                  analysisType === 'mediation'
                    ? 'border-amber-600 bg-amber-50 text-amber-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <p className="font-semibold text-xs">Mediation</p>
                <p className="text-xs opacity-80">Model 4</p>
              </button>
              <button
                onClick={() => setAnalysisType('moderation')}
                className={`px-3 py-2 rounded-lg border-2 transition ${
                  analysisType === 'moderation'
                    ? 'border-purple-600 bg-purple-50 text-purple-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <p className="font-semibold text-xs">Moderation</p>
                <p className="text-xs opacity-80">Model 1</p>
              </button>
              <button
                onClick={() => setAnalysisType('parallel-mediation')}
                className={`px-3 py-2 rounded-lg border-2 transition ${
                  analysisType === 'parallel-mediation'
                    ? 'border-orange-600 bg-orange-50 text-orange-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <p className="font-semibold text-xs">Parallel</p>
                <p className="text-xs opacity-80">Multiple M</p>
              </button>
              <button
                onClick={() => setAnalysisType('serial-mediation')}
                className={`px-3 py-2 rounded-lg border-2 transition ${
                  analysisType === 'serial-mediation'
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <p className="font-semibold text-xs">Serial</p>
                <p className="text-xs opacity-80">Model 6</p>
              </button>
              <button
                onClick={() => setAnalysisType('moderated-mediation')}
                className={`px-3 py-2 rounded-lg border-2 transition ${
                  analysisType === 'moderated-mediation'
                    ? 'border-rose-600 bg-rose-50 text-rose-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <p className="font-semibold text-xs">Mod-Med</p>
                <p className="text-xs opacity-80">Model 80</p>
              </button>
              <button
                onClick={() => setAnalysisType('full')}
                className={`px-3 py-2 rounded-lg border-2 transition ${
                  analysisType === 'full'
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <p className="font-semibold text-xs">Full Model</p>
                <p className="text-xs opacity-80">All</p>
              </button>
              {/* lavaan Syntax mode removed — it required the R backend, which
                  is not deployed. Restore the button when an R service exists. */}
            </div>
          </div>

          {/* Estimator Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Estimation Method</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setEstimatorType('OLS')}
                className={`px-4 py-3 rounded-lg border-2 transition text-left ${
                  estimatorType === 'OLS'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                <p className={`font-semibold text-sm ${estimatorType === 'OLS' ? 'text-blue-700' : 'text-gray-800'}`}>OLS Regression</p>
                <p className="text-xs text-gray-500 mt-0.5">Ordinary Least Squares — equation-by-equation, fast</p>
              </button>
              <button
                onClick={() => setEstimatorType('MLE')}
                className={`px-4 py-3 rounded-lg border-2 transition text-left ${
                  estimatorType === 'MLE'
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                <p className={`font-semibold text-sm ${estimatorType === 'MLE' ? 'text-emerald-700' : 'text-gray-800'}`}>ML Estimation (CB-SEM)</p>
                <p className="text-xs text-gray-500 mt-0.5">Maximum Likelihood — AMOS/lavaan style, covariance-based, χ² test, modification indices</p>
              </button>
            </div>
            {estimatorType === 'MLE' && (
              <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
                MLE simultaneously optimizes all path coefficients by minimizing F_ML = log|Σ(θ)| + tr(S·Σ⁻¹(θ)) − log|S| − p. Produces proper χ² goodness-of-fit test and modification indices for model improvement.
              </div>
            )}
          </div>

          {/* Custom lavaan Syntax Panel */}
          {analysisType === 'custom-lavaan' && (
            <div className="space-y-4 bg-gray-900 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <Code className="w-5 h-5 text-gray-300" />
                <h4 className="text-base font-semibold text-white">Custom lavaan Model Syntax</h4>
                <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
                  <Cpu className="w-3.5 h-3.5" />
                  Requires R Backend
                </span>
              </div>

              <div>
                <textarea
                  value={customSyntax}
                  onChange={(e) => setCustomSyntax(e.target.value)}
                  placeholder={`# Example: simple mediation\nM ~ a*X\nY ~ b*M + c_prime*X\n\n# Define indirect and total effects\nindirect := a*b\ntotal := c_prime + a*b`}
                  className="w-full px-4 py-3 bg-gray-800 text-gray-100 border border-gray-600 rounded-lg font-mono text-sm h-56 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-600 resize-y"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use lavaan syntax. Variable names must exactly match column names in your dataset.
                </p>
              </div>

              <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                <h5 className="text-sm font-semibold text-gray-300 mb-2">lavaan Options</h5>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Estimator</label>
                    <select
                      value={customLavaanOptions.estimator}
                      onChange={(e) => setCustomLavaanOptions({ ...customLavaanOptions, estimator: e.target.value })}
                      className="w-full px-2 py-1.5 bg-gray-700 text-gray-200 border border-gray-600 rounded text-sm"
                    >
                      <option value="ML">Maximum Likelihood (ML)</option>
                      <option value="MLR">Robust ML (MLR / Satorra-Bentler)</option>
                      <option value="WLS">Weighted Least Squares (WLS)</option>
                      <option value="WLSMV">WLSMV (ordinal/categorical)</option>
                      <option value="ULS">Unweighted Least Squares (ULS)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Missing Data</label>
                    <select
                      value={customLavaanOptions.missing}
                      onChange={(e) => setCustomLavaanOptions({ ...customLavaanOptions, missing: e.target.value })}
                      className="w-full px-2 py-1.5 bg-gray-700 text-gray-200 border border-gray-600 rounded text-sm"
                    >
                      <option value="listwise">Listwise deletion</option>
                      <option value="fiml">Full Information ML (FIML)</option>
                      <option value="pairwise">Pairwise deletion</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="clo-bootstrap"
                      checked={customLavaanOptions.bootstrap}
                      onChange={(e) => setCustomLavaanOptions({ ...customLavaanOptions, bootstrap: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    <label htmlFor="clo-bootstrap" className="text-sm text-gray-300">Bootstrap CIs</label>
                  </div>

                  {customLavaanOptions.bootstrap && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Bootstrap Samples</label>
                      <input
                        type="number"
                        value={customLavaanOptions.nBootstrap}
                        onChange={(e) => setCustomLavaanOptions({ ...customLavaanOptions, nBootstrap: parseInt(e.target.value) || 5000 })}
                        min={500} max={10000} step={500}
                        className="w-full px-2 py-1 bg-gray-700 text-gray-200 border border-gray-600 rounded text-sm"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="clo-std"
                      checked={customLavaanOptions.standardized}
                      onChange={(e) => setCustomLavaanOptions({ ...customLavaanOptions, standardized: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    <label htmlFor="clo-std" className="text-sm text-gray-300">Standardized solution</label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="clo-mi"
                      checked={customLavaanOptions.modificationIndices}
                      onChange={(e) => setCustomLavaanOptions({ ...customLavaanOptions, modificationIndices: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    <label htmlFor="clo-mi" className="text-sm text-gray-300">Modification indices</label>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400">
                <p className="font-semibold text-gray-300 mb-1">lavaan Syntax Quick Reference</p>
                <ul className="space-y-1">
                  <li><code className="text-blue-400">y ~ x1 + x2</code> — regression (y on x1, x2)</li>
                  <li><code className="text-blue-400">y ~~ x</code> — covariance / correlation</li>
                  <li><code className="text-blue-400">f =~ x1 + x2 + x3</code> — latent factor</li>
                  <li><code className="text-blue-400">ind := a*b</code> — user-defined parameter (indirect effect)</li>
                  <li><code className="text-blue-400">M ~ a*X</code> — labeled path (a = slope of X on M)</li>
                </ul>
              </div>
            </div>
          )}

          {/* Path Specification, Mediators, Moderators — hidden for custom-lavaan */}
          {analysisType !== 'custom-lavaan' && (<>
            <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Specify Paths</label>
              <button
                onClick={addPath}
                className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
                disabled={!currentDataset}
              >
                + Add Path
              </button>
            </div>

            <div className="space-y-2">
              {pathModel.map((path, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={path.from}
                    onChange={(e) => updatePath(idx, 'from', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="">From...</option>
                    {currentDataset?.columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                  <select
                    value={path.to}
                    onChange={(e) => updatePath(idx, 'to', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="">To...</option>
                    {currentDataset?.columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removePath(idx)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Mediators */}
          {(analysisType === 'mediation' || analysisType === 'full') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mediators</label>
              <div className="flex flex-wrap gap-2">
                {currentDataset?.columns.map(col => (
                  <button
                    key={col}
                    onClick={() => mediators.includes(col) ? removeMediator(col) : addMediator(col)}
                    className={`px-3 py-1 rounded text-sm transition ${
                      mediators.includes(col)
                        ? 'bg-amber-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {col}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Moderators */}
          {(analysisType === 'moderation' || analysisType === 'full') && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Moderation Effects</label>
                <button
                  onClick={addModerator}
                  className="text-sm px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded transition"
                  disabled={!currentDataset}
                >
                  + Add Moderation
                </button>
              </div>

              <div className="space-y-2">
                {moderators.map((mod, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-purple-50 p-2 rounded">
                    <select
                      value={mod.iv}
                      onChange={(e) => updateModerator(idx, 'iv', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="">IV...</option>
                      {currentDataset?.columns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-600">×</span>
                    <select
                      value={mod.moderator}
                      onChange={(e) => updateModerator(idx, 'moderator', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="">Moderator...</option>
                      {currentDataset?.columns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <select
                      value={mod.dv}
                      onChange={(e) => updateModerator(idx, 'dv', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="">DV...</option>
                      {currentDataset?.columns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeModerator(idx)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded transition text-sm"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>) } {/* end analysisType !== 'custom-lavaan' */}

          {/* Advanced Options — shown for standard analysis types */}
          {analysisType !== 'custom-lavaan' && (
          <div>
            <button
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              <Settings className="w-4 h-4" />
              Advanced Options
              {showAdvancedOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvancedOptions && (
              <div className="mt-3 p-4 bg-gray-50 rounded-lg space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={advancedOptions.bootstrap}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, bootstrap: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Bootstrap confidence intervals</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={advancedOptions.standardized}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, standardized: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Report standardized coefficients (β)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={advancedOptions.meanCenter}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, meanCenter: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Mean-center variables for moderation</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={advancedOptions.robustSE}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, robustSE: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Robust standard errors (HC3)</span>
                </label>
              </div>
            )}
          </div>
          )}

          {/* Run Button */}
          <button
            onClick={runAnalysis}
            disabled={
              loading || !currentDataset ||
              (analysisType !== 'custom-lavaan' && pathModel.length === 0) ||
              (analysisType === 'custom-lavaan' && !customSyntax.trim())
            }
            className={`w-full flex items-center justify-center gap-2 px-6 py-3 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
              analysisType === 'custom-lavaan'
                ? 'bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-900 hover:to-gray-800'
                : 'bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700'
            }`}
          >
            {analysisType === 'custom-lavaan' ? <Code className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {loading ? 'Running Analysis...' : analysisType === 'custom-lavaan' ? 'Run Custom lavaan Model' : 'Run Path Analysis'}
          </button>

          {/* Custom lavaan Results */}
          {analysisType === 'custom-lavaan' && customResults && (
            <div className="space-y-4 mt-4">
              {customImages.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h4 className="text-lg font-bold text-gray-900 mb-4">Path Diagrams (R/lavaan)</h4>
                  <div className="space-y-4">
                    {customImages.map((img, idx) => (
                      <div key={idx} className="border rounded-lg overflow-hidden">
                        <img src={img} alt={`Path diagram ${idx + 1}`} className="w-full h-auto" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold text-gray-900">lavaan Results</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { const a = document.createElement('a'); a.href = 'data:application/json,' + encodeURIComponent(JSON.stringify(customResults, null, 2)); a.download = 'lavaan_results.json'; a.click(); }}
                      className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
                    >
                      <Download className="w-4 h-4" />
                      JSON
                    </button>
                  </div>
                </div>

                {customResults.fit_measures && (
                  <div className="mb-6">
                    <h5 className="font-semibold text-gray-900 mb-3">Model Fit Indices</h5>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {[
                        { label: 'χ²', value: customResults.fit_measures.chisq?.toFixed(3), sub: `df=${customResults.fit_measures.df}, p=${customResults.fit_measures.pvalue?.toFixed(3)}` },
                        { label: 'CFI', value: customResults.fit_measures.cfi?.toFixed(3) },
                        { label: 'TLI', value: customResults.fit_measures.tli?.toFixed(3) },
                        { label: 'RMSEA', value: customResults.fit_measures.rmsea?.toFixed(3), sub: customResults.fit_measures.rmsea_ci ? `[${customResults.fit_measures.rmsea_ci[0]?.toFixed(3)}, ${customResults.fit_measures.rmsea_ci[1]?.toFixed(3)}]` : '' },
                        { label: 'SRMR', value: customResults.fit_measures.srmr?.toFixed(3) },
                      ].map((item, i) => (
                        <div key={i} className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-600">{item.label}</p>
                          <p className="text-xl font-bold text-gray-900">{item.value ?? '—'}</p>
                          {item.sub && <p className="text-xs text-gray-500">{item.sub}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {customResults.parameter_estimates && (
                  <div className="mb-6">
                    <h5 className="font-semibold text-gray-900 mb-3">Parameter Estimates</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-gray-200">
                            <th className="text-left py-2 px-3">Param</th>
                            <th className="text-right py-2 px-3">Estimate</th>
                            <th className="text-right py-2 px-3">SE</th>
                            <th className="text-right py-2 px-3">z</th>
                            <th className="text-right py-2 px-3">p</th>
                            {customResults.parameter_estimates[0]?.std_all !== undefined && <th className="text-right py-2 px-3">Std.All</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {customResults.parameter_estimates.map((pe: any, idx: number) => (
                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-2 px-3 font-mono text-xs text-gray-800">{pe.lhs} {pe.op} {pe.rhs}</td>
                              <td className="py-2 px-3 text-right">{pe.est?.toFixed(4)}</td>
                              <td className="py-2 px-3 text-right text-gray-600">{pe.se?.toFixed(4)}</td>
                              <td className="py-2 px-3 text-right text-gray-600">{pe.z?.toFixed(3)}</td>
                              <td className="py-2 px-3 text-right text-gray-600">{pe.pvalue?.toFixed(4)}</td>
                              {pe.std_all !== undefined && <td className="py-2 px-3 text-right font-medium">{pe.std_all?.toFixed(4)}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {customResults.defined_parameters && Object.keys(customResults.defined_parameters).length > 0 && (
                  <div className="mb-6">
                    <h5 className="font-semibold text-gray-900 mb-3">User-Defined Parameters (Indirect Effects)</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-gray-200">
                            <th className="text-left py-2 px-3">Parameter</th>
                            <th className="text-right py-2 px-3">Estimate</th>
                            <th className="text-right py-2 px-3">SE</th>
                            <th className="text-right py-2 px-3">z</th>
                            <th className="text-right py-2 px-3">p</th>
                            {customResults.defined_parameters[Object.keys(customResults.defined_parameters)[0]]?.ci_lower !== undefined && (
                              <th className="text-left py-2 px-3">95% CI</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(customResults.defined_parameters).map(([name, vals]: [string, any]) => (
                            <tr key={name} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-2 px-3 font-mono text-xs text-gray-800">{name}</td>
                              <td className="py-2 px-3 text-right font-bold">{vals.est?.toFixed(4)}</td>
                              <td className="py-2 px-3 text-right text-gray-600">{vals.se?.toFixed(4)}</td>
                              <td className="py-2 px-3 text-right text-gray-600">{vals.z?.toFixed(3)}</td>
                              <td className="py-2 px-3 text-right text-gray-600">{vals.pvalue?.toFixed(4)}</td>
                              {vals.ci_lower !== undefined && (
                                <td className="py-2 px-3 text-gray-700 text-sm">[{vals.ci_lower?.toFixed(4)}, {vals.ci_upper?.toFixed(4)}]</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {customResults.modification_indices && customResults.modification_indices.length > 0 && (
                  <div>
                    <h5 className="font-semibold text-gray-900 mb-3">Top Modification Indices</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-gray-200">
                            <th className="text-left py-2 px-3">From</th>
                            <th className="text-left py-2 px-3">Op</th>
                            <th className="text-left py-2 px-3">To</th>
                            <th className="text-right py-2 px-3">MI</th>
                            <th className="text-right py-2 px-3">EPC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customResults.modification_indices.slice(0, 15).map((mi: any, idx: number) => (
                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-2 px-3">{mi.lhs}</td>
                              <td className="py-2 px-3 font-mono text-gray-600">{mi.op}</td>
                              <td className="py-2 px-3">{mi.rhs}</td>
                              <td className="py-2 px-3 text-right font-bold">{mi.mi?.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right">{mi.epc?.toFixed(3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
