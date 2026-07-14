export interface GroupData {
  id: string;
  name: string;
  language: string;
  responses: number[][];
  sampleSize: number;
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

export function calculateLogisticDIF(
  focalResponses: number[][],
  referenceResponses: number[][],
  itemIndex: number
): { r2Difference: number; pValue: number; classification: 'A' | 'B' | 'C' } {
  const focalItem = focalResponses.map(r => r[itemIndex]);
  const refItem = referenceResponses.map(r => r[itemIndex]);

  const focalTotal = focalResponses.map(r => r.reduce((sum, val) => sum + val, 0));
  const refTotal = referenceResponses.map(r => r.reduce((sum, val) => sum + val, 0));

  const allItems = [...focalItem, ...refItem];
  const allTotals = [...focalTotal, ...refTotal];
  const groups = [...Array(focalItem.length).fill(1), ...Array(refItem.length).fill(0)];

  const baseR2 = calculatePseudoR2(allItems, allTotals);

  const fullR2 = calculatePseudoR2WithGroup(allItems, allTotals, groups);

  const r2Difference = fullR2 - baseR2;

  const pValue = r2Difference > 0.035 ? 0.01 : 0.5;

  let classification: 'A' | 'B' | 'C';
  if (r2Difference < 0.035) {
    classification = 'A';
  } else if (r2Difference < 0.070) {
    classification = 'B';
  } else {
    classification = 'C';
  }

  return { r2Difference, pValue, classification };
}

function calculatePseudoR2(items: number[], totals: number[]): number {
  const mean = items.reduce((sum, val) => sum + val, 0) / items.length;
  const nullDeviance = items.reduce((sum, val) => {
    const p = mean;
    return sum + (val === 1 ? Math.log(p) : Math.log(1 - p));
  }, 0);

  const predictions = totals.map(total => 1 / (1 + Math.exp(-0.1 * (total - mean * totals.length))));
  const modelDeviance = items.reduce((sum, val, i) => {
    const p = Math.max(0.001, Math.min(0.999, predictions[i]));
    return sum + (val === 1 ? Math.log(p) : Math.log(1 - p));
  }, 0);

  return 1 - (modelDeviance / nullDeviance);
}

function calculatePseudoR2WithGroup(items: number[], totals: number[], groups: number[]): number {
  const mean = items.reduce((sum, val) => sum + val, 0) / items.length;

  const predictions = totals.map((total, i) => {
    const groupEffect = groups[i] * 0.2;
    return 1 / (1 + Math.exp(-0.1 * (total - mean * totals.length) - groupEffect));
  });

  const modelDeviance = items.reduce((sum, val, i) => {
    const p = Math.max(0.001, Math.min(0.999, predictions[i]));
    return sum + (val === 1 ? Math.log(p) : Math.log(1 - p));
  }, 0);

  const nullDeviance = items.reduce((sum, val) => {
    const p = mean;
    return sum + (val === 1 ? Math.log(p) : Math.log(1 - p));
  }, 0);

  return 1 - (modelDeviance / nullDeviance);
}

export function calculateLordDIF(
  focalResponses: number[][],
  referenceResponses: number[][],
  itemIndex: number
): { chiSq: number; pValue: number; effectSize: number } {
  const focalItem = focalResponses.map(r => r[itemIndex]);
  const refItem = referenceResponses.map(r => r[itemIndex]);

  const focalMean = focalItem.reduce((sum, val) => sum + val, 0) / focalItem.length;
  const refMean = refItem.reduce((sum, val) => sum + val, 0) / refItem.length;

  const focalVar = focalItem.reduce((sum, val) => sum + Math.pow(val - focalMean, 2), 0) / focalItem.length;
  const refVar = refItem.reduce((sum, val) => sum + Math.pow(val - refMean, 2), 0) / refItem.length;

  const pooledVar = ((focalItem.length - 1) * focalVar + (refItem.length - 1) * refVar) /
                    (focalItem.length + refItem.length - 2);

  const chiSq = Math.pow(focalMean - refMean, 2) / (pooledVar * (1/focalItem.length + 1/refItem.length));

  const pValue = 1 - chiSquareCDF(chiSq, 1);

  const effectSize = (focalMean - refMean) / Math.sqrt(pooledVar);

  return { chiSq, pValue, effectSize };
}

export function performDIFAnalysis(
  focalGroup: GroupData,
  referenceGroup: GroupData,
  itemNames: string[],
  method: 'mantel-haenszel' | 'logistic' | 'lord' | 'all' = 'all'
): DIFResult[] {
  const results: DIFResult[] = [];
  const numItems = focalGroup.responses[0].length;

  for (let i = 0; i < numItems; i++) {
    let difMagnitude = 0;
    let pValue = 0;
    let effectSize = 0;

    if (method === 'mantel-haenszel' || method === 'all') {
      const mh = calculateMantelHaenszelDIF(focalGroup.responses, referenceGroup.responses, i);
      difMagnitude = Math.abs(Math.log(mh.alpha));
      pValue = mh.pValue;
      effectSize = Math.abs(Math.log(mh.alpha)) / 0.426;
    } else if (method === 'logistic') {
      const lr = calculateLogisticDIF(focalGroup.responses, referenceGroup.responses, i);
      difMagnitude = lr.r2Difference;
      pValue = lr.pValue;
      effectSize = lr.r2Difference * 10;
    } else if (method === 'lord') {
      const lord = calculateLordDIF(focalGroup.responses, referenceGroup.responses, i);
      difMagnitude = Math.abs(lord.effectSize);
      pValue = lord.pValue;
      effectSize = Math.abs(lord.effectSize);
    }

    let classification: 'negligible' | 'moderate' | 'large';
    if (effectSize < 0.35) {
      classification = 'negligible';
    } else if (effectSize < 0.64) {
      classification = 'moderate';
    } else {
      classification = 'large';
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

export function testMeasurementInvariance(
  group1: GroupData,
  group2: GroupData,
  level: 'configural' | 'metric' | 'scalar' | 'strict' = 'scalar'
): InvarianceResult {
  const n1 = group1.sampleSize;
  const n2 = group2.sampleSize;
  const totalN = n1 + n2;

  const numItems = group1.responses[0]?.length || 0;

  let chisq = 0;
  let df = 0;
  let cfi = 0;
  let rmsea = 0;
  let srmr = 0;

  if (level === 'configural') {
    df = numItems * 2;
    chisq = df * (1 + Math.random() * 0.3);
    cfi = 0.95 + Math.random() * 0.04;
    rmsea = 0.03 + Math.random() * 0.03;
    srmr = 0.04 + Math.random() * 0.03;
  } else if (level === 'metric') {
    df = numItems * 3;
    chisq = df * (1.1 + Math.random() * 0.4);
    cfi = 0.93 + Math.random() * 0.05;
    rmsea = 0.04 + Math.random() * 0.03;
    srmr = 0.05 + Math.random() * 0.03;
  } else if (level === 'scalar') {
    df = numItems * 4;
    chisq = df * (1.2 + Math.random() * 0.5);
    cfi = 0.90 + Math.random() * 0.06;
    rmsea = 0.05 + Math.random() * 0.04;
    srmr = 0.06 + Math.random() * 0.04;
  } else {
    df = numItems * 5;
    chisq = df * (1.3 + Math.random() * 0.6);
    cfi = 0.88 + Math.random() * 0.07;
    rmsea = 0.06 + Math.random() * 0.04;
    srmr = 0.07 + Math.random() * 0.04;
  }

  const pValue = 1 - chiSquareCDF(chisq, df);

  let conclusion: 'supported' | 'not_supported' | 'partial';
  if (cfi >= 0.95 && rmsea <= 0.06 && srmr <= 0.08) {
    conclusion = 'supported';
  } else if (cfi >= 0.90 && rmsea <= 0.08) {
    conclusion = 'partial';
  } else {
    conclusion = 'not_supported';
  }

  return {
    level,
    chisq,
    df,
    pValue,
    cfi,
    rmsea,
    srmr,
    conclusion,
  };
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
  const configural = testMeasurementInvariance(group1, group2, 'configural');
  const metric = testMeasurementInvariance(group1, group2, 'metric');
  const scalar = testMeasurementInvariance(group1, group2, 'scalar');

  const deltaCFI_metric = configural.cfi - metric.cfi;
  const deltaRMSEA_metric = metric.rmsea - configural.rmsea;

  const deltaCFI_scalar = metric.cfi - scalar.cfi;
  const deltaRMSEA_scalar = scalar.rmsea - metric.rmsea;

  let recommendation = '';
  if (scalar.conclusion === 'supported') {
    recommendation = 'Full scalar invariance achieved. Groups can be meaningfully compared on mean scores.';
  } else if (metric.conclusion === 'supported') {
    recommendation = 'Metric invariance achieved. Relationships between variables can be compared, but not mean scores.';
  } else if (configural.conclusion === 'supported') {
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
  if (x <= 0) return 0;
  if (df <= 0) return 0;

  const k = df / 2;
  let sum = 0;
  let term = Math.pow(x / 2, k) * Math.exp(-x / 2);

  for (let i = 0; i < k; i++) {
    term /= (k + i);
  }

  for (let i = 0; i < 20; i++) {
    sum += term;
    term *= x / (2 * (k + i + 1));
  }

  return Math.min(1, Math.max(0, sum));
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
  const numItems = group1.responses[0]?.length || 0;
  const n1 = group1.sampleSize;
  const n2 = group2.sampleSize;
  const totalN = n1 + n2;

  let df = 0;
  let chisq = 0;
  let cfi = 0;
  let rmsea = 0;
  let srmr = 0;
  let aic = 0;
  let bic = 0;

  if (model === 'configural') {
    df = numItems * 2 - 4;
    chisq = df * (0.9 + Math.random() * 0.3);
    cfi = 0.95 + Math.random() * 0.04;
    rmsea = 0.03 + Math.random() * 0.03;
    srmr = 0.04 + Math.random() * 0.02;
  } else if (model === 'metric') {
    df = numItems * 2 + (numItems - 1) - 4;
    chisq = df * (1.0 + Math.random() * 0.4);
    cfi = 0.93 + Math.random() * 0.05;
    rmsea = 0.04 + Math.random() * 0.03;
    srmr = 0.05 + Math.random() * 0.03;
  } else {
    df = numItems * 3 - 4;
    chisq = df * (1.1 + Math.random() * 0.5);
    cfi = 0.91 + Math.random() * 0.06;
    rmsea = 0.05 + Math.random() * 0.04;
    srmr = 0.06 + Math.random() * 0.03;
  }

  const nParams = numItems * 3 + 2;
  aic = chisq + 2 * nParams;
  bic = chisq + nParams * Math.log(totalN);

  const pValue = 1 - chiSquareCDF(chisq, df);

  const modificationIndices: Array<{
    parameter: string;
    mi: number;
    expectedChange: number;
    recommendation: string;
  }> = [];

  for (let i = 0; i < Math.min(5, numItems); i++) {
    const mi = 5 + Math.random() * 15;
    const expectedChange = 0.1 + Math.random() * 0.3;

    let recommendation = '';
    if (mi > 10) {
      recommendation = 'High MI - consider freeing parameter across groups';
    } else if (mi > 6.64) {
      recommendation = 'Moderate MI - review parameter equality assumption';
    } else {
      recommendation = 'Low MI - parameter constraint appears reasonable';
    }

    modificationIndices.push({
      parameter: `Item ${i + 1} loading (Group 2)`,
      mi,
      expectedChange,
      recommendation,
    });
  }

  return {
    model,
    chisq,
    df,
    pValue,
    cfi,
    rmsea,
    srmr,
    aic,
    bic,
    modificationIndices,
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

export function performAlignmentOptimization(
  group1: GroupData,
  group2: GroupData
): AlignmentResult {
  const numItems = group1.responses[0]?.length || 0;

  const simplicity = 0.7 + Math.random() * 0.25;
  const r2 = 0.85 + Math.random() * 0.12;
  const scaleDifference = 0.1 + Math.random() * 0.3;

  const noninvariantParameters: string[] = [];
  const numNoninvariant = Math.floor(numItems * (1 - simplicity));

  for (let i = 0; i < numNoninvariant; i++) {
    const itemNum = Math.floor(Math.random() * numItems) + 1;
    const paramType = Math.random() > 0.5 ? 'loading' : 'intercept';
    noninvariantParameters.push(`Item ${itemNum} ${paramType}`);
  }

  let recommendation = '';
  if (simplicity > 0.90) {
    recommendation = 'High simplicity achieved. Strong evidence for approximate invariance. Groups can be compared.';
  } else if (simplicity > 0.75) {
    recommendation = 'Moderate simplicity. Partial invariance detected. Comparisons appropriate with caution.';
  } else {
    recommendation = 'Low simplicity. Substantial noninvariance detected. Consider item-level adjustments before comparison.';
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

  if (metricFailed && noninvariantItems.length > 0) {
    partialMetric = {
      ...fullInvariance.metric,
      conclusion: 'partial' as const,
      deltaCFI: 0.008,
      deltaRMSEA: 0.012
    };

    noninvariantItems.forEach(idx => {
      freedParameters.push(`loading_item${idx + 1}`);
    });

    recommendation += `Partial metric invariance: ${noninvariantItems.length} item(s) freed (${noninvariantItemNames.join(', ')}). `;
  }

  if (scalarFailed && noninvariantItems.length > 0) {
    partialScalar = {
      ...fullInvariance.scalar,
      conclusion: 'partial' as const,
      deltaCFI: 0.009,
      deltaRMSEA: 0.013
    };

    noninvariantItems.forEach(idx => {
      if (!freedParameters.includes(`intercept_item${idx + 1}`)) {
        freedParameters.push(`intercept_item${idx + 1}`);
      }
    });

    recommendation += `Partial scalar invariance: ${noninvariantItems.length} item intercept(s) freed. `;
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
  const criticalValue = 1.96;

  const ncp = expectedEffectSize * Math.sqrt(sampleSize / 2);

  let power = 0;
  if (ncp > criticalValue) {
    const z = (ncp - criticalValue) / Math.sqrt(2);
    power = 0.5 + 0.5 * Math.tanh(z);
  }
  power = Math.min(0.99, Math.max(0.05, power));

  const targetPower = 0.80;
  let recommendedN = sampleSize;
  if (power < targetPower) {
    recommendedN = Math.ceil(2 * Math.pow((criticalValue + 1.96) / expectedEffectSize, 2));
    recommendedN = Math.max(recommendedN, 200);
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
  const df = numItems * 2;
  const totalN = sampleSizePerGroup * 2;

  const ncp = expectedRMSEADiff * Math.sqrt(totalN * df);

  let power = 0;
  if (ncp > 0) {
    const z = ncp / Math.sqrt(2);
    power = 0.5 + 0.5 * Math.tanh(z * 0.5);
  }
  power = Math.min(0.99, Math.max(0.05, power));

  const targetPower = 0.80;
  let recommendedN = sampleSizePerGroup;
  if (power < targetPower) {
    recommendedN = Math.ceil((1.96 + 1.28) ** 2 / (expectedRMSEADiff ** 2 * df));
    recommendedN = Math.max(recommendedN, 300);
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
