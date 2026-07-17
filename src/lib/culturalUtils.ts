import { MeasurementInvarianceTester } from './measurementInvariance';
import { chiSqPValue, normalCDF, noncentralChisqCDF } from './statDistributions';

export interface GroupData {
  id: string;
  name: string;
  language: string;
  responses: number[][];
  sampleSize: number;
}

// ── Small OLS helper for the regression-based DIF models ─────────────────────
function olsRSS(y: number[], X: number[][]): { rss: number; beta: number[] } {
  const n = y.length;
  const p = X[0].length + 1;
  const D = X.map(row => [1, ...row]);
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += D[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += D[i][a] * D[i][b];
    }
  }
  // Solve XtX beta = Xty (Gaussian elimination with pivoting)
  const aug = XtX.map((row, i) => [...row, Xty[i]]);
  for (let c = 0; c < p; c++) {
    let mr = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(aug[r][c]) > Math.abs(aug[mr][c])) mr = r;
    [aug[c], aug[mr]] = [aug[mr], aug[c]];
    if (Math.abs(aug[c][c]) < 1e-12) continue;
    for (let r = 0; r < p; r++) {
      if (r === c) continue;
      const f = aug[r][c] / aug[c][c];
      for (let k = c; k <= p; k++) aug[r][k] -= f * aug[c][k];
    }
  }
  const beta = aug.map((row, i) => (Math.abs(row[i]) > 1e-12 ? row[p] / row[i] : 0));
  let rss = 0;
  for (let i = 0; i < n; i++) {
    const pred = D[i].reduce((s, v, j) => s + v * beta[j], 0);
    rss += (y[i] - pred) ** 2;
  }
  return { rss, beta };
}

/**
 * Regression-based DIF for ordinal/Likert items (Zumbo, 1999, OLS variant):
 *   M0: item ~ restScore              (matching on ability)
 *   M2: item ~ restScore + group + group×restScore
 * Chi-square = n·ln(RSS0/RSS2) with 2 df (likelihood-ratio form);
 * effect size = ΔR² with Jodoin & Gierl (2001) thresholds (.035/.070).
 * The rest score (total minus the studied item) avoids contaminating the
 * matching criterion with the item under test.
 */
export function regressionDIF(
  focalResponses: number[][],
  referenceResponses: number[][],
  itemIndex: number
): { chiSq: number; pValue: number; deltaR2: number; classification: 'A' | 'B' | 'C' } {
  const all = [...focalResponses, ...referenceResponses];
  const group = [...focalResponses.map(() => 1), ...referenceResponses.map(() => 0)];
  const y = all.map(r => r[itemIndex]);
  const rest = all.map(r => r.reduce((s, v, j) => s + (j === itemIndex ? 0 : v), 0));
  const n = y.length;

  const m0 = olsRSS(y, rest.map(v => [v]));
  const m2 = olsRSS(y, rest.map((v, i) => [v, group[i], v * group[i]]));

  const yMean = y.reduce((s, v) => s + v, 0) / n;
  const tss = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const r20 = tss > 0 ? 1 - m0.rss / tss : 0;
  const r22 = tss > 0 ? 1 - m2.rss / tss : 0;
  const deltaR2 = Math.max(0, r22 - r20);

  const chiSq = m2.rss > 0 ? n * Math.log(Math.max(m0.rss, 1e-12) / Math.max(m2.rss, 1e-12)) : 0;
  const pValue = chiSqPValue(chiSq, 2);

  const classification: 'A' | 'B' | 'C' = deltaR2 < 0.035 ? 'A' : deltaR2 < 0.07 ? 'B' : 'C';
  return { chiSq, pValue, deltaR2, classification };
}

export interface DIFResult {
  itemIndex: number;
  itemName: string;
  focalGroup: string;
  referenceGroup: string;
  difMagnitude: number;
  pValue: number;
  effectSize: number;
  classification: 'negligible' | 'moderate' | 'large';
  interpretation: string;
}

export interface InvarianceResult {
  level: 'configural' | 'metric' | 'scalar' | 'strict';
  chisq: number;
  df: number;
  pValue: number;
  cfi: number;
  rmsea: number;
  srmr: number;
  deltaCFI?: number;
  deltaRMSEA?: number;
  conclusion: 'supported' | 'not_supported' | 'partial';
}

export function calculateMantelHaenszelDIF(
  focalResponses: number[][],
  referenceResponses: number[][],
  itemIndex: number
): { mhStatistic: number; pValue: number; alpha: number } {
  const focalItem = focalResponses.map(r => r[itemIndex]);
  const refItem = referenceResponses.map(r => r[itemIndex]);

  const focalTotal = focalResponses.map(r => r.reduce((sum, val) => sum + val, 0));
  const refTotal = referenceResponses.map(r => r.reduce((sum, val) => sum + val, 0));

  const allScores = [...focalTotal, ...refTotal];
  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);

  let alphaMH = 0;
  let varAlphaMH = 0;

  for (let k = minScore; k <= maxScore; k++) {
    const focalAtK = focalItem.filter((_, i) => Math.round(focalTotal[i]) === k);
    const refAtK = refItem.filter((_, i) => Math.round(refTotal[i]) === k);

    if (focalAtK.length === 0 || refAtK.length === 0) continue;

    const nFocal = focalAtK.length;
    const nRef = refAtK.length;
    const n = nFocal + nRef;

    const focalCorrect = focalAtK.filter(x => x === 1).length;
    const refCorrect = refAtK.filter(x => x === 1).length;
    const totalCorrect = focalCorrect + refCorrect;

    const expectedFocal = (nFocal * totalCorrect) / n;
    const varK = (nFocal * nRef * totalCorrect * (n - totalCorrect)) / (n * n * (n - 1));

    alphaMH += (focalCorrect - expectedFocal);
    varAlphaMH += varK;
  }

  const mhStatistic = varAlphaMH > 0 ? (alphaMH * alphaMH) / varAlphaMH : 0;

  const pValue = 1 - chiSquareCDF(mhStatistic, 1);

  const alpha = Math.exp(alphaMH / Math.sqrt(varAlphaMH));

  return { mhStatistic, pValue, alpha };
}

/**
 * Uniform + non-uniform DIF via the regression approach. Previously this used
 * HARDCODED regression coefficients (slope .1, group effect .2) and a
 * hardcoded p-value (.01 or .5); it now fits the actual models.
 */
export function calculateLogisticDIF(
  focalResponses: number[][],
  referenceResponses: number[][],
  itemIndex: number
): { r2Difference: number; pValue: number; classification: 'A' | 'B' | 'C' } {
  const res = regressionDIF(focalResponses, referenceResponses, itemIndex);
  return { r2Difference: res.deltaR2, pValue: res.pValue, classification: res.classification };
}

/**
 * Ability-conditioned group comparison (2-df test of group main effect and
 * group×ability interaction). The previous version compared RAW item means —
 * no ability conditioning — which confounds DIF with true group differences.
 */
export function calculateLordDIF(
  focalResponses: number[][],
  referenceResponses: number[][],
  itemIndex: number
): { chiSq: number; pValue: number; effectSize: number } {
  const res = regressionDIF(focalResponses, referenceResponses, itemIndex);
  // Report ΔR² rescaled to an SMD-like magnitude for continuity with the UI.
  return { chiSq: res.chiSq, pValue: res.pValue, effectSize: Math.sqrt(Math.max(0, res.deltaR2) * 10) };
}

export function performDIFAnalysis(
  focalGroup: GroupData,
  referenceGroup: GroupData,
  itemNames: string[],
  method: 'mantel-haenszel' | 'logistic' | 'lord' | 'all' = 'all'
): DIFResult[] {
  const results: DIFResult[] = [];
  const numItems = focalGroup.responses[0].length;

  // Mantel–Haenszel assumes dichotomous (0/1) items; for ordinal/Likert data
  // the regression approach is the appropriate default.
  const isBinary = [...focalGroup.responses, ...referenceGroup.responses]
    .every(r => r.every(v => v === 0 || v === 1));

  for (let i = 0; i < numItems; i++) {
    let difMagnitude = 0;
    let pValue = 0;
    let classification: 'negligible' | 'moderate' | 'large';
    let effectSize = 0;

    if (isBinary && (method === 'mantel-haenszel' || method === 'all')) {
      const mh = calculateMantelHaenszelDIF(focalGroup.responses, referenceGroup.responses, i);
      difMagnitude = Math.abs(Math.log(mh.alpha));
      pValue = mh.pValue;
      // ETS delta scale: ΔMH = −2.35·ln(αMH); |Δ|<1 = A, 1–1.5 = B, >1.5 = C.
      const etsDelta = 2.35 * Math.abs(Math.log(mh.alpha));
      effectSize = etsDelta;
      classification = etsDelta < 1 ? 'negligible' : etsDelta < 1.5 ? 'moderate' : 'large';
    } else {
      const reg = regressionDIF(focalGroup.responses, referenceGroup.responses, i);
      difMagnitude = reg.deltaR2;
      pValue = reg.pValue;
      effectSize = reg.deltaR2;
      // Jodoin & Gierl (2001) ΔR² thresholds
      classification = reg.deltaR2 < 0.035 ? 'negligible' : reg.deltaR2 < 0.07 ? 'moderate' : 'large';
    }

    let interpretation = '';
    if (classification === 'negligible') {
      interpretation = 'No significant DIF detected. Item functions similarly across groups.';
    } else if (classification === 'moderate') {
      interpretation = 'Moderate DIF detected. Review item for cultural bias.';
    } else {
      interpretation = 'Large DIF detected. Item shows substantial bias - consider revision or removal.';
    }

    results.push({
      itemIndex: i,
      itemName: itemNames[i] || `Item ${i + 1}`,
      focalGroup: focalGroup.name,
      referenceGroup: referenceGroup.name,
      difMagnitude,
      pValue,
      effectSize,
      classification,
      interpretation,
    });
  }

  return results;
}

/**
 * Real multi-group invariance testing — delegates to the constrained ULS
 * estimator in measurementInvariance.ts (a one-factor model over all items).
 * This function previously fabricated every fit index with Math.random().
 */
function runRealInvariance(group1: GroupData, group2: GroupData) {
  const numItems = group1.responses[0]?.length || 0;
  const itemNames = Array.from({ length: numItems }, (_, i) => `item${i + 1}`);
  const data = [...group1.responses, ...group2.responses];
  const groupVariable = [
    ...group1.responses.map(() => 0),
    ...group2.responses.map(() => 1),
  ];
  return MeasurementInvarianceTester.test(
    data,
    groupVariable,
    { factorStructure: { Factor1: itemNames }, groups: [group1.name || 'Group1', group2.name || 'Group2'] },
    itemNames,
  );
}

function toInvarianceResult(
  level: 'configural' | 'metric' | 'scalar' | 'strict',
  fit: { chisq: number; df: number; pvalue: number; cfi: number; rmsea: number; srmr: number },
): InvarianceResult {
  let conclusion: 'supported' | 'not_supported' | 'partial';
  if (fit.cfi >= 0.95 && fit.rmsea <= 0.06 && fit.srmr <= 0.08) {
    conclusion = 'supported';
  } else if (fit.cfi >= 0.90 && fit.rmsea <= 0.08) {
    conclusion = 'partial';
  } else {
    conclusion = 'not_supported';
  }
  return {
    level,
    chisq: fit.chisq,
    df: fit.df,
    pValue: fit.pvalue,
    cfi: fit.cfi,
    rmsea: fit.rmsea,
    srmr: fit.srmr,
    conclusion,
  };
}

export function testMeasurementInvariance(
  group1: GroupData,
  group2: GroupData,
  level: 'configural' | 'metric' | 'scalar' | 'strict' = 'scalar'
): InvarianceResult {
  const res = runRealInvariance(group1, group2);
  return toInvarianceResult(level, res.models[level]);
}

export function testInvarianceSequence(
  group1: GroupData,
  group2: GroupData
): {
  configural: InvarianceResult;
  metric: InvarianceResult & { deltaCFI: number; deltaRMSEA: number };
  scalar: InvarianceResult & { deltaCFI: number; deltaRMSEA: number };
  recommendation: string;
} {
  const res = runRealInvariance(group1, group2);
  const configural = toInvarianceResult('configural', res.models.configural);
  const metric = toInvarianceResult('metric', res.models.metric);
  const scalar = toInvarianceResult('scalar', res.models.scalar);

  // Nested-model deltas from the real fits (Cheung & Rensvold decision rule:
  // a CFI drop > .01 means the added constraints are violated).
  const deltaCFI_metric = configural.cfi - metric.cfi;
  const deltaRMSEA_metric = metric.rmsea - configural.rmsea;
  const deltaCFI_scalar = metric.cfi - scalar.cfi;
  const deltaRMSEA_scalar = scalar.rmsea - metric.rmsea;

  const metricHolds = deltaCFI_metric <= 0.01 && deltaRMSEA_metric <= 0.015;
  const scalarHolds = metricHolds && deltaCFI_scalar <= 0.01 && deltaRMSEA_scalar <= 0.015;

  let recommendation = '';
  if (scalarHolds && scalar.conclusion !== 'not_supported') {
    recommendation = 'Full scalar invariance achieved. Groups can be meaningfully compared on mean scores.';
  } else if (metricHolds && metric.conclusion !== 'not_supported') {
    recommendation = 'Metric invariance achieved. Relationships between variables can be compared, but not mean scores.';
  } else if (configural.conclusion !== 'not_supported') {
    recommendation = 'Only configural invariance achieved. Factor structure is similar but comparisons should be made with caution.';
  } else {
    recommendation = 'Invariance not achieved. Groups may have fundamentally different constructs. Do not compare scores.';
  }

  return {
    configural,
    metric: { ...metric, deltaCFI: deltaCFI_metric, deltaRMSEA: deltaRMSEA_metric },
    scalar: { ...scalar, deltaCFI: deltaCFI_scalar, deltaRMSEA: deltaRMSEA_scalar },
    recommendation,
  };
}

function chiSquareCDF(x: number, df: number): number {
  // Exact CDF via the shared regularized incomplete gamma implementation.
  return 1 - chiSqPValue(x, df);
}

export function calculateCohensD(
  group1Scores: number[],
  group2Scores: number[]
): number {
  const mean1 = group1Scores.reduce((sum, val) => sum + val, 0) / group1Scores.length;
  const mean2 = group2Scores.reduce((sum, val) => sum + val, 0) / group2Scores.length;

  const var1 = group1Scores.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0) / (group1Scores.length - 1);
  const var2 = group2Scores.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0) / (group2Scores.length - 1);

  const pooledSD = Math.sqrt((var1 + var2) / 2);

  return (mean1 - mean2) / pooledSD;
}

export function performEquivalenceTest(
  group1Scores: number[],
  group2Scores: number[],
  equivalenceMargin: number = 0.5
): {
  cohensD: number;
  isEquivalent: boolean;
  lowerBound: number;
  upperBound: number;
  interpretation: string;
} {
  const cohensD = calculateCohensD(group1Scores, group2Scores);
  const se = Math.sqrt((group1Scores.length + group2Scores.length) / (group1Scores.length * group2Scores.length));

  const lowerBound = cohensD - 1.96 * se;
  const upperBound = cohensD + 1.96 * se;

  const isEquivalent = Math.abs(cohensD) < equivalenceMargin &&
                       lowerBound > -equivalenceMargin &&
                       upperBound < equivalenceMargin;

  let interpretation = '';
  if (isEquivalent) {
    interpretation = 'Groups are statistically equivalent. Cross-cultural comparison is appropriate.';
  } else if (Math.abs(cohensD) < 0.2) {
    interpretation = 'Trivial difference detected. Groups are practically equivalent.';
  } else if (Math.abs(cohensD) < 0.5) {
    interpretation = 'Small difference detected. Consider cultural factors in interpretation.';
  } else if (Math.abs(cohensD) < 0.8) {
    interpretation = 'Medium difference detected. Cultural adaptation may be needed.';
  } else {
    interpretation = 'Large difference detected. Substantial cultural adaptation required.';
  }

  return {
    cohensD,
    isEquivalent,
    lowerBound,
    upperBound,
    interpretation,
  };
}

export function performIRTDIF(
  focalResponses: number[][],
  referenceResponses: number[][],
  itemIndex: number
): {
  betaDif: number;
  classification: 'A' | 'B' | 'C';
  pValue: number;
  interpretation: string;
} {
  const focalItem = focalResponses.map(r => r[itemIndex]);
  const refItem = referenceResponses.map(r => r[itemIndex]);

  const focalTotal = focalResponses.map(r => r.reduce((sum, val) => sum + val, 0));
  const refTotal = referenceResponses.map(r => r.reduce((sum, val) => sum + val, 0));

  const focalMean = focalItem.reduce((sum, val) => sum + val, 0) / focalItem.length;
  const refMean = refItem.reduce((sum, val) => sum + val, 0) / refItem.length;

  const betaDif = Math.abs(focalMean - refMean) * 1.7;

  const pooledVar = 0.25;
  const sePooled = Math.sqrt(pooledVar * (1 / focalItem.length + 1 / refItem.length));
  const zScore = betaDif / sePooled;
  const pValue = 2 * (1 - standardNormalCDF(Math.abs(zScore)));

  let classification: 'A' | 'B' | 'C';
  if (betaDif < 0.43) {
    classification = 'A';
  } else if (betaDif < 0.64) {
    classification = 'B';
  } else {
    classification = 'C';
  }

  let interpretation = '';
  if (classification === 'A') {
    interpretation = 'Negligible DIF (Jodoin-Gierl Category A). Item functions equivalently across groups.';
  } else if (classification === 'B') {
    interpretation = 'Moderate DIF (Jodoin-Gierl Category B). Review item for potential cultural bias.';
  } else {
    interpretation = 'Large DIF (Jodoin-Gierl Category C). Substantial bias detected - consider item revision.';
  }

  return {
    betaDif,
    classification,
    pValue,
    interpretation,
  };
}

function standardNormalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - probability : probability;
}

export interface MultigroupCFAResult {
  model: 'configural' | 'metric' | 'scalar';
  chisq: number;
  df: number;
  pValue: number;
  cfi: number;
  rmsea: number;
  srmr: number;
  aic: number;
  bic: number;
  modificationIndices: Array<{
    parameter: string;
    mi: number;
    expectedChange: number;
    recommendation: string;
  }>;
}

export function performMultigroupCFA(
  group1: GroupData,
  group2: GroupData,
  model: 'configural' | 'metric' | 'scalar'
): MultigroupCFAResult {
  // Real multi-group estimation (previously fabricated with Math.random()).
  const res = runRealInvariance(group1, group2);
  const fit = res.models[model];

  // Modification indices require per-constraint release refits, which the
  // engine does not expose yet — return an empty list rather than invented
  // numbers. The UI hides the section when empty.
  return {
    model,
    chisq: fit.chisq,
    df: fit.df,
    pValue: fit.pvalue,
    cfi: fit.cfi,
    rmsea: fit.rmsea,
    srmr: fit.srmr,
    aic: fit.aic,
    bic: fit.bic,
    modificationIndices: [],
  };
}

export interface AlignmentResult {
  method: 'alignment';
  simplicity: number;
  noninvariantParameters: string[];
  r2: number;
  scaleDifference: number;
  recommendation: string;
}

/**
 * Approximate-invariance diagnostics (previously fabricated). Uses the REAL
 * configural solution: per-item loading differences between groups and
 * standardized item-mean differences. Parameters beyond threshold
 * (|Δλ| > .10 standardized, |Δmean| > .25 SD) are flagged.
 * "simplicity" = the observed fraction of parameters within threshold;
 * r2 = squared correlation of the two groups' item-mean profiles;
 * scaleDifference = |Cohen's d| of total scores.
 */
export function performAlignmentOptimization(
  group1: GroupData,
  group2: GroupData
): AlignmentResult {
  const numItems = group1.responses[0]?.length || 0;
  const res = runRealInvariance(group1, group2);
  const g1 = res.groups[0];
  const g2 = res.groups[1];
  const p1 = res.groupParameters[g1];
  const p2 = res.groupParameters[g2];

  const noninvariantParameters: string[] = [];
  let totalParams = 0;
  let invariantParams = 0;

  for (let i = 0; i < numItems; i++) {
    const l1 = p1?.factorLoadings?.[i]?.loading ?? 0;
    const l2 = p2?.factorLoadings?.[i]?.loading ?? 0;
    totalParams++;
    if (Math.abs(l1 - l2) > 0.10) {
      noninvariantParameters.push(`Item ${i + 1} loading (Δλ = ${(l2 - l1).toFixed(3)})`);
    } else {
      invariantParams++;
    }

    // Standardized item-mean difference (pooled item SD)
    const m1 = group1.responses.reduce((s, r) => s + r[i], 0) / group1.responses.length;
    const m2 = group2.responses.reduce((s, r) => s + r[i], 0) / group2.responses.length;
    const v1 = group1.responses.reduce((s, r) => s + (r[i] - m1) ** 2, 0) / Math.max(group1.responses.length - 1, 1);
    const v2 = group2.responses.reduce((s, r) => s + (r[i] - m2) ** 2, 0) / Math.max(group2.responses.length - 1, 1);
    const sd = Math.sqrt((v1 + v2) / 2) || 1;
    totalParams++;
    if (Math.abs(m2 - m1) / sd > 0.25) {
      noninvariantParameters.push(`Item ${i + 1} intercept (Δ = ${((m2 - m1) / sd).toFixed(3)} SD)`);
    } else {
      invariantParams++;
    }
  }

  const simplicity = totalParams > 0 ? invariantParams / totalParams : 1;

  // Profile similarity of item means across groups
  const means1 = Array.from({ length: numItems }, (_, i) => group1.responses.reduce((s, r) => s + r[i], 0) / group1.responses.length);
  const means2 = Array.from({ length: numItems }, (_, i) => group2.responses.reduce((s, r) => s + r[i], 0) / group2.responses.length);
  const mm1 = means1.reduce((s, v) => s + v, 0) / numItems;
  const mm2 = means2.reduce((s, v) => s + v, 0) / numItems;
  let num = 0, d1 = 0, d2 = 0;
  for (let i = 0; i < numItems; i++) {
    num += (means1[i] - mm1) * (means2[i] - mm2);
    d1 += (means1[i] - mm1) ** 2;
    d2 += (means2[i] - mm2) ** 2;
  }
  const r = d1 > 0 && d2 > 0 ? num / Math.sqrt(d1 * d2) : 0;
  const r2 = r * r;

  const totals1 = group1.responses.map(row => row.reduce((s, v) => s + v, 0));
  const totals2 = group2.responses.map(row => row.reduce((s, v) => s + v, 0));
  const scaleDifference = Math.abs(calculateCohensD(totals1, totals2));

  let recommendation = '';
  if (simplicity > 0.90) {
    recommendation = 'High parameter agreement across groups. Strong evidence for approximate invariance. Groups can be compared.';
  } else if (simplicity > 0.75) {
    recommendation = 'Moderate parameter agreement. Partial invariance likely. Comparisons appropriate with caution.';
  } else {
    recommendation = 'Low parameter agreement. Substantial noninvariance detected. Consider item-level adjustments before comparison.';
  }

  return {
    method: 'alignment',
    simplicity,
    noninvariantParameters,
    r2,
    scaleDifference,
    recommendation,
  };
}

export interface PartialInvarianceResult {
  noninvariantItems: number[];
  noninvariantItemNames: string[];
  partialMetricModel: InvarianceResult;
  partialScalarModel: InvarianceResult;
  fullModel: InvarianceResult;
  recommendation: string;
  freedParameters: string[];
}

export function detectPartialInvariance(
  group1: GroupData,
  group2: GroupData,
  itemNames: string[]
): PartialInvarianceResult {
  const numItems = group1.responses[0]?.length || 0;

  const difResults = performDIFAnalysis(group1, group2, itemNames, 'all');

  const noninvariantItems = difResults
    .filter(r => r.classification === 'moderate' || r.classification === 'large')
    .map(r => r.itemIndex);

  const noninvariantItemNames = difResults
    .filter(r => r.classification === 'moderate' || r.classification === 'large')
    .map(r => r.itemName);

  const fullInvariance = testInvarianceSequence(group1, group2);
  const metricFailed = fullInvariance.metric.conclusion !== 'supported';
  const scalarFailed = fullInvariance.scalar.conclusion !== 'supported';

  let recommendation = '';
  const freedParameters: string[] = [];

  if (!metricFailed && !scalarFailed) {
    recommendation = 'Full measurement invariance achieved. No partial invariance testing needed.';

    return {
      noninvariantItems: [],
      noninvariantItemNames: [],
      partialMetricModel: fullInvariance.metric,
      partialScalarModel: fullInvariance.scalar,
      fullModel: fullInvariance.scalar,
      recommendation,
      freedParameters
    };
  }

  let partialMetric = { ...fullInvariance.metric };
  let partialScalar = { ...fullInvariance.scalar };

  // REAL partial-invariance models: refit the invariance sequence with the
  // DIF-flagged items removed (equivalent to freeing their parameters, in the
  // strict sense of exempting them from the cross-group constraints).
  const invariantIdx = Array.from({ length: numItems }, (_, i) => i)
    .filter(i => !noninvariantItems.includes(i));

  if ((metricFailed || scalarFailed) && noninvariantItems.length > 0 && invariantIdx.length >= 3) {
    const subset = (g: GroupData): GroupData => ({
      ...g,
      responses: g.responses.map(row => invariantIdx.map(i => row[i])),
    });
    const partialFit = testInvarianceSequence(subset(group1), subset(group2));

    if (metricFailed) {
      partialMetric = {
        ...partialFit.metric,
        conclusion: partialFit.metric.conclusion === 'not_supported' ? 'not_supported' : 'partial',
      };
      noninvariantItems.forEach(idx => freedParameters.push(`loading_item${idx + 1}`));
      recommendation += `Partial metric invariance: ${noninvariantItems.length} item(s) freed (${noninvariantItemNames.join(', ')}). `;
    }
    if (scalarFailed) {
      partialScalar = {
        ...partialFit.scalar,
        conclusion: partialFit.scalar.conclusion === 'not_supported' ? 'not_supported' : 'partial',
      };
      noninvariantItems.forEach(idx => {
        if (!freedParameters.includes(`intercept_item${idx + 1}`)) {
          freedParameters.push(`intercept_item${idx + 1}`);
        }
      });
      recommendation += `Partial scalar invariance: ${noninvariantItems.length} item intercept(s) freed. `;
    }
  } else if ((metricFailed || scalarFailed) && invariantIdx.length < 3) {
    recommendation += 'Too few invariant items remain for a partial-invariance refit. ';
  }

  if (noninvariantItems.length <= numItems * 0.2) {
    recommendation += `With ${(noninvariantItems.length / numItems * 100).toFixed(1)}% of items freed, partial invariance is acceptable for group comparisons.`;
  } else {
    recommendation += `Warning: ${(noninvariantItems.length / numItems * 100).toFixed(1)}% of items are noninvariant. Consider substantial item revision or separate group norms.`;
  }

  return {
    noninvariantItems,
    noninvariantItemNames,
    partialMetricModel: partialMetric,
    partialScalarModel: partialScalar,
    fullModel: fullInvariance.scalar,
    recommendation,
    freedParameters
  };
}

export interface PowerAnalysisResult {
  analysis: 'dif' | 'invariance';
  currentSampleSize: number;
  currentPower: number;
  recommendedSampleSize: number;
  effectSize: number;
  alpha: number;
  interpretation: string;
  adequate: boolean;
}

export function calculateDIFPower(
  sampleSize: number,
  expectedEffectSize: number,
  alpha: number = 0.05
): PowerAnalysisResult {
  // Two-group comparison of a standardized effect d with n per group:
  // z = d / sqrt(2/n); power = Φ(z − z_crit) + Φ(−z − z_crit).
  const zCrit = 1.959963985; // z_{alpha/2} for alpha = .05
  const z = Math.abs(expectedEffectSize) / Math.sqrt(2 / Math.max(sampleSize, 2));
  let power = normalCDF(z - zCrit) + normalCDF(-z - zCrit);
  power = Math.min(0.999, Math.max(0.001, power));

  const targetPower = 0.80;
  let recommendedN = sampleSize;
  if (power < targetPower) {
    const zBeta = 0.8416212; // z for 80% power
    recommendedN = Math.ceil(2 * Math.pow((zCrit + zBeta) / Math.max(Math.abs(expectedEffectSize), 1e-6), 2));
  }

  const adequate = power >= 0.80;
  let interpretation = '';

  if (power >= 0.90) {
    interpretation = 'Excellent power. Very likely to detect DIF if present.';
  } else if (power >= 0.80) {
    interpretation = 'Adequate power. Good chance of detecting DIF if present.';
  } else if (power >= 0.60) {
    interpretation = 'Moderate power. May miss small to moderate DIF effects.';
  } else {
    interpretation = `Low power. Increase sample size to at least ${recommendedN} per group for adequate power.`;
  }

  return {
    analysis: 'dif',
    currentSampleSize: sampleSize,
    currentPower: power,
    recommendedSampleSize: recommendedN,
    effectSize: expectedEffectSize,
    alpha,
    interpretation,
    adequate
  };
}

export function calculateInvariancePower(
  sampleSizePerGroup: number,
  numItems: number,
  expectedRMSEADiff: number = 0.015,
  alpha: number = 0.05
): PowerAnalysisResult {
  // MacCallum, Browne & Sugawara (1996): the constrained-vs-free comparison is
  // a chi-square test with df = number of added constraints (≈ items − 1 for
  // metric invariance); non-centrality λ = (N − 2) · df · ε² where ε is the
  // RMSEA-scale misfit of the constraints.
  const df = Math.max(numItems - 1, 1);
  const totalN = sampleSizePerGroup * 2;

  const powerAtN = (nTotal: number): number => {
    const ncp = Math.max(0, (nTotal - 2) * df * expectedRMSEADiff * expectedRMSEADiff);
    // Critical value of the central chi-square at 1 − alpha (bisection).
    let lo = 0, hi = df + 200;
    while (chiSqPValue(hi, df) > alpha) hi *= 2;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (chiSqPValue(mid, df) > alpha) lo = mid; else hi = mid;
    }
    const crit = (lo + hi) / 2;
    return Math.min(0.999, Math.max(0.001, 1 - noncentralChisqCDF(crit, df, ncp)));
  };

  const power = powerAtN(totalN);

  const targetPower = 0.80;
  let recommendedN = sampleSizePerGroup;
  if (power < targetPower) {
    let n = sampleSizePerGroup;
    while (powerAtN(n * 2) < targetPower && n < 100000) n = Math.ceil(n * 1.25);
    recommendedN = n;
  }

  const adequate = power >= 0.80;
  let interpretation = '';

  if (sampleSizePerGroup >= 500) {
    interpretation = 'Excellent sample size for invariance testing. High power to detect lack of invariance.';
  } else if (sampleSizePerGroup >= 300) {
    interpretation = 'Good sample size. Adequate power for most invariance tests.';
  } else if (sampleSizePerGroup >= 200) {
    interpretation = 'Adequate sample size. May have moderate power for some tests.';
  } else if (sampleSizePerGroup >= 100) {
    interpretation = `Marginal sample size. Consider increasing to ${recommendedN} per group.`;
  } else {
    interpretation = `Insufficient sample size. Strongly recommend ${recommendedN}+ per group for reliable invariance testing.`;
  }

  return {
    analysis: 'invariance',
    currentSampleSize: sampleSizePerGroup,
    currentPower: power,
    recommendedSampleSize: recommendedN,
    effectSize: expectedRMSEADiff,
    alpha,
    interpretation,
    adequate
  };
}

export interface DataQualityReport {
  missingDataPercentage: number;
  straightliningCount: number;
  straightliningPercentage: number;
  multivariateOutliers: number[];
  outlierPercentage: number;
  reliability: number;
  responseVariability: number;
  recommendation: string;
  issues: string[];
  passesQualityCheck: boolean;
}

export function runDataQualityChecks(responses: number[][]): DataQualityReport {
  const n = responses.length;
  const numItems = responses[0]?.length || 0;
  const issues: string[] = [];

  let totalCells = 0;
  let missingCells = 0;
  responses.forEach(row => {
    row.forEach(val => {
      totalCells++;
      if (val === null || val === undefined || isNaN(val)) {
        missingCells++;
      }
    });
  });
  const missingDataPercentage = totalCells > 0 ? (missingCells / totalCells) * 100 : 0;

  if (missingDataPercentage > 5) {
    issues.push(`High missing data: ${missingDataPercentage.toFixed(1)}% (threshold: 5%)`);
  }

  let straightliningCount = 0;
  responses.forEach(row => {
    const uniqueValues = new Set(row.filter(v => v !== null && v !== undefined && !isNaN(v)));
    if (uniqueValues.size === 1) {
      straightliningCount++;
    }
  });
  const straightliningPercentage = n > 0 ? (straightliningCount / n) * 100 : 0;

  if (straightliningPercentage > 10) {
    issues.push(`High straightlining: ${straightliningPercentage.toFixed(1)}% (threshold: 10%)`);
  }

  const itemMeans = Array.from({ length: numItems }, (_, i) => {
    const itemValues = responses.map(r => r[i]).filter(v => v !== null && v !== undefined && !isNaN(v));
    return itemValues.reduce((sum, val) => sum + val, 0) / itemValues.length;
  });

  const itemSds = Array.from({ length: numItems }, (_, i) => {
    const itemValues = responses.map(r => r[i]).filter(v => v !== null && v !== undefined && !isNaN(v));
    const mean = itemMeans[i];
    const variance = itemValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / itemValues.length;
    return Math.sqrt(variance);
  });

  const totalScores = responses.map(row =>
    row.filter(v => v !== null && v !== undefined && !isNaN(v)).reduce((sum, val) => sum + val, 0)
  );
  const meanTotal = totalScores.reduce((sum, val) => sum + val, 0) / totalScores.length;
  const sdTotal = Math.sqrt(
    totalScores.reduce((sum, val) => sum + Math.pow(val - meanTotal, 2), 0) / totalScores.length
  );

  const multivariateOutliers: number[] = [];
  totalScores.forEach((score, idx) => {
    const zScore = Math.abs((score - meanTotal) / sdTotal);
    if (zScore > 3.5) {
      multivariateOutliers.push(idx);
    }
  });
  const outlierPercentage = n > 0 ? (multivariateOutliers.length / n) * 100 : 0;

  if (outlierPercentage > 5) {
    issues.push(`High outlier rate: ${outlierPercentage.toFixed(1)}% (threshold: 5%)`);
  }

  const correlationMatrix: number[][] = [];
  for (let i = 0; i < numItems; i++) {
    correlationMatrix[i] = [];
    for (let j = 0; j < numItems; j++) {
      if (i === j) {
        correlationMatrix[i][j] = 1;
      } else {
        const item1 = responses.map(r => r[i]);
        const item2 = responses.map(r => r[j]);
        const mean1 = itemMeans[i];
        const mean2 = itemMeans[j];
        const sd1 = itemSds[i];
        const sd2 = itemSds[j];

        let covariance = 0;
        for (let k = 0; k < n; k++) {
          covariance += (item1[k] - mean1) * (item2[k] - mean2);
        }
        covariance /= n;

        const r = sd1 > 0 && sd2 > 0 ? covariance / (sd1 * sd2) : 0;
        correlationMatrix[i][j] = r;
      }
    }
  }

  let sumOfCovariances = 0;
  let sumOfVariances = 0;
  for (let i = 0; i < numItems; i++) {
    for (let j = 0; j < numItems; j++) {
      const cov = correlationMatrix[i][j] * itemSds[i] * itemSds[j];
      if (i === j) {
        sumOfVariances += cov;
      } else {
        sumOfCovariances += cov;
      }
    }
  }

  const reliability = numItems > 1
    ? (numItems / (numItems - 1)) * (sumOfCovariances / (sumOfVariances + sumOfCovariances))
    : 0;

  if (reliability < 0.70) {
    issues.push(`Low reliability: α = ${reliability.toFixed(3)} (threshold: 0.70)`);
  }

  const avgSd = itemSds.reduce((sum, sd) => sum + sd, 0) / itemSds.length;
  const responseVariability = avgSd;

  if (responseVariability < 0.3) {
    issues.push(`Low response variability: SD = ${responseVariability.toFixed(3)} (may indicate restricted range)`);
  }

  let recommendation = '';
  const passesQualityCheck = issues.length === 0;

  if (passesQualityCheck) {
    recommendation = 'Excellent data quality. All checks passed. Data is suitable for advanced psychometric analysis.';
  } else if (issues.length === 1) {
    recommendation = `Minor quality issue detected. ${issues[0]}. Consider reviewing and potentially excluding problematic cases.`;
  } else if (issues.length === 2) {
    recommendation = `Multiple quality issues detected. Review data carefully before proceeding with analysis. Consider data cleaning or exclusion criteria.`;
  } else {
    recommendation = `Serious data quality concerns. ${issues.length} issues detected. Strongly recommend thorough data cleaning, reviewing collection procedures, and potentially re-collecting data.`;
  }

  return {
    missingDataPercentage,
    straightliningCount,
    straightliningPercentage,
    multivariateOutliers,
    outlierPercentage,
    reliability,
    responseVariability,
    recommendation,
    issues,
    passesQualityCheck
  };
}

export function generateSPSSSyntax(
  analysis: 'dif' | 'invariance',
  groups: { focal: string; reference: string },
  itemNames: string[]
): string {
  if (analysis === 'dif') {
    const itemSyntax = itemNames.map(item => `
* DIF Analysis for ${item}
LOGISTIC REGRESSION VARIABLES ${item}
  /METHOD=ENTER total_score
  /METHOD=ENTER group_coded
  /METHOD=ENTER total_score*group_coded
  /CRITERIA=PIN(0.05) POUT(0.10) ITERATE(20) CUT(0.5).
`).join('\n');

    return `* SPSS Syntax for DIF Analysis using Logistic Regression
* Generated by PsychTrix Cultural Adaptation Module
* Reference: Swaminathan & Rogers (1990)

* Step 1: Compute total score (excluding focal item)
COMPUTE total_score = ${itemNames.join(' + ')}.
EXECUTE.

* Step 2: Recode group variable
RECODE group ('${groups.reference}' = 0) ('${groups.focal}' = 1) INTO group_coded.
EXECUTE.

* Step 3: Run logistic regression for each item
${itemSyntax}

* Step 4: Compare nested models using chi-square difference test
* Model 1: Item ~ TotalScore
* Model 2: Item ~ TotalScore + Group (tests uniform DIF)
* Model 3: Item ~ TotalScore + Group + TotalScore*Group (tests non-uniform DIF)

* Interpretation:
* - Significant Model 2 vs Model 1: Uniform DIF present
* - Significant Model 3 vs Model 2: Non-uniform DIF present
* - ΔR² > 0.035: Moderate DIF (Jodoin & Gierl, 2001)
* - ΔR² > 0.070: Large DIF
`;
  } else {
    const itemList = itemNames.map((name, i) => `* ${i + 1}. ${name}`).join('\n');
    return `* SPSS Syntax for Measurement Invariance Testing
* Generated by PsychTrix Cultural Adaptation Module
* Reference: Cheung & Rensvold (2002)

* Note: SPSS does not have built-in CFA/SEM capabilities
* Install AMOS or use alternative software (R lavaan, Mplus)

* Recommended R syntax (see R export option)
* Or use AMOS with the following model specifications:

* Model 1: Configural Invariance
* - Same factor structure in both groups
* - All parameters freely estimated in each group

* Model 2: Metric Invariance (Weak Invariance)
* - Constrain factor loadings equal across groups
* - Test: ΔCFI < 0.010, ΔRMSEA < 0.015

* Model 3: Scalar Invariance (Strong Invariance)
* - Constrain factor loadings AND intercepts equal
* - Test: ΔCFI < 0.010, ΔRMSEA < 0.015

* Items to include:
${itemList}
`;
  }
}

export function generateRScript(
  analysis: 'dif' | 'invariance',
  groups: { focal: string; reference: string },
  itemNames: string[]
): string {
  if (analysis === 'dif') {
    const itemsArray = itemNames.map(name => `"${name}"`).join(', ');
    const refVar = groups.reference.toLowerCase().replace(/\s+/g, '_');
    const focalVar = groups.focal.toLowerCase().replace(/\s+/g, '_');

    return `# R Script for DIF Analysis using mirt package
# Generated by PsychTrix Cultural Adaptation Module

# Load required packages
library(mirt)
library(difR)

# Load your data
# data <- read.csv("your_data.csv")
# Ensure group variable is factor: data$group <- factor(data$group)

# Items to analyze
items <- c(${itemsArray})

# Method 1: Mantel-Haenszel DIF
mh_results <- difMH(
  Data = data[, items],
  group = data$group,
  focal.name = "${groups.focal}",
  purify = TRUE
)
print(mh_results)

# Method 2: Logistic Regression DIF
lr_results <- difLogistic(
  Data = data[, items],
  group = data$group,
  focal.name = "${groups.focal}",
  type = "both",  # Tests both uniform and non-uniform DIF
  purify = TRUE
)
print(lr_results)

# Method 3: IRT-based DIF using Lord's chi-square
# Fit 2PL model separately for each group
model_${refVar} <- mirt(
  data[data$group == "${groups.reference}", items],
  model = 1,
  itemtype = "2PL"
)

model_${focalVar} <- mirt(
  data[data$group == "${groups.focal}", items],
  model = 1,
  itemtype = "2PL"
)

# Extract item parameters and compare
params_ref <- coef(model_${refVar}, simplify = TRUE)$items
params_focal <- coef(model_${focalVar}, simplify = TRUE)$items

# Plot item characteristic curves for comparison
for (i in 1:length(items)) {
  itemplot(model_${refVar}, i, main = items[i])
  itemplot(model_${focalVar}, i, add = TRUE, col = "red")
}

# Interpretation:
# - Flagged items show significant DIF
# - Review item wording for cultural bias
# - Consider removing or revising flagged items
`;
  } else {
    return `# R Script for Measurement Invariance Testing
# Generated by PsychTrix Cultural Adaptation Module
# Using lavaan package

# Load required packages
library(lavaan)
library(semTools)

# Load your data
# data <- read.csv("your_data.csv")

# Define measurement model (MODIFY THIS!)
model <- '
  # Latent factor
  factor =~ ${itemNames.join(' + ')}
'

# Step 1: Configural Invariance
fit_configural <- cfa(
  model,
  data = data,
  group = "group",
  std.lv = TRUE
)
summary(fit_configural, fit.measures = TRUE, standardized = TRUE)

# Step 2: Metric Invariance (constrain loadings)
fit_metric <- cfa(
  model,
  data = data,
  group = "group",
  group.equal = c("loadings"),
  std.lv = TRUE
)
summary(fit_metric, fit.measures = TRUE, standardized = TRUE)

# Step 3: Scalar Invariance (constrain loadings + intercepts)
fit_scalar <- cfa(
  model,
  data = data,
  group = "group",
  group.equal = c("loadings", "intercepts"),
  std.lv = TRUE
)
summary(fit_scalar, fit.measures = TRUE, standardized = TRUE)

# Step 4: Strict Invariance (constrain residuals too)
fit_strict <- cfa(
  model,
  data = data,
  group = "group",
  group.equal = c("loadings", "intercepts", "residuals"),
  std.lv = TRUE
)
summary(fit_strict, fit.measures = TRUE, standardized = TRUE)

# Compare nested models
compareFit(fit_configural, fit_metric, fit_scalar, fit_strict)

# Use semTools for automatic testing
measurementInvariance(
  model = model,
  data = data,
  group = "group",
  strict = TRUE
)

# Interpretation criteria (Cheung & Rensvold, 2002):
# - ΔCFI ≤ 0.010: Invariance supported
# - ΔRMSEA ≤ 0.015: Invariance supported
# - If scalar invariance fails, test partial invariance

# Partial Invariance (if needed)
# Use modindices() to identify problematic items
mod_indices <- modindices(fit_scalar)
print(mod_indices[order(-mod_indices$mi), ][1:10, ])

# Free specific item constraints based on modification indices
# Then re-run scalar model with partial constraints
`;
  }
}
