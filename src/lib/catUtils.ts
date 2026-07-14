/**
 * CAT (Computerized Adaptive Testing) Utility Functions
 * Implements IRT-based algorithms for adaptive testing
 */

export interface ItemParameters {
  a: number;
  b: number;
  c: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate item parameters according to IRT 3PL model constraints
 */
export function validateItemParameters(params: ItemParameters): ValidationResult {
  const errors: string[] = [];

  if (params.a <= 0) {
    errors.push('Discrimination parameter (a) must be positive');
  }
  if (params.a > 3) {
    errors.push('Discrimination parameter (a) typically should be ≤ 3.0 (warning)');
  }

  if (params.b < -4 || params.b > 4) {
    errors.push('Difficulty parameter (b) should be between -4 and +4');
  }

  if (params.c < 0 || params.c >= 1) {
    errors.push('Guessing parameter (c) must be in range [0, 1)');
  }
  if (params.c > 0.35) {
    errors.push('Guessing parameter (c) typically should be ≤ 0.35 (warning)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 3PL IRT probability function
 */
export function irt3pl(theta: number, a: number, b: number, c: number): number {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

/**
 * Fisher Information for 3PL model
 */
export function calculateInformation(theta: number, a: number, b: number, c: number): number {
  const p = irt3pl(theta, a, b, c);
  const q = 1 - p;
  const numerator = a * a * q * Math.pow(p - c, 2);
  const denominator = p * Math.pow(1 - c, 2);
  return numerator / denominator;
}

/**
 * Calculate Kullback-Leibler information for item selection
 * Measures expected information gain from administering an item
 *
 * Uses numerical integration to compute KL divergence between
 * prior and posterior distributions
 */
export function calculateKLInformation(
  theta: number,
  a: number,
  b: number,
  c: number,
  priorMean: number = 0,
  priorSD: number = 1
): number {
  const numPoints = 21;
  const range = 4;
  const step = (2 * range) / (numPoints - 1);

  let klSum = 0;

  for (let i = 0; i < numPoints; i++) {
    const thetaPoint = theta - range + i * step;

    const prior = (1 / (priorSD * Math.sqrt(2 * Math.PI))) *
      Math.exp(-0.5 * Math.pow((thetaPoint - priorMean) / priorSD, 2));

    const p1 = irt3pl(thetaPoint, a, b, c);
    const p0 = 1 - p1;

    const posterior1 = prior * p1;
    const posterior0 = prior * p0;

    const priorAtTheta = (1 / (priorSD * Math.sqrt(2 * Math.PI))) *
      Math.exp(-0.5 * Math.pow((theta - priorMean) / priorSD, 2));

    if (posterior1 > 1e-10 && priorAtTheta > 1e-10) {
      klSum += posterior1 * Math.log(posterior1 / priorAtTheta) * step;
    }
    if (posterior0 > 1e-10 && priorAtTheta > 1e-10) {
      klSum += posterior0 * Math.log(posterior0 / priorAtTheta) * step;
    }
  }

  return Math.abs(klSum);
}

/**
 * Maximum Posterior Weighted Information
 * Combines information with expected probability of correct response
 */
export function calculateMPWI(
  theta: number,
  a: number,
  b: number,
  c: number
): number {
  const info = calculateInformation(theta, a, b, c);
  const pCorrect = irt3pl(theta, a, b, c);
  return info * pCorrect;
}

/**
 * Sequential Probability Ratio Test (SPRT) for classification
 * Used for pass/fail decision making in CAT
 *
 * @param theta Current ability estimate
 * @param se Standard error
 * @param cutoff Classification cutoff (pass/fail threshold)
 * @param alpha Type I error rate (false positive)
 * @param beta Type II error rate (false negative)
 * @param indifference Indifference region width around cutoff
 * @returns Decision: 'pass', 'fail', or 'continue'
 */
export function sprtClassification(
  theta: number,
  se: number,
  cutoff: number,
  alpha: number = 0.05,
  beta: number = 0.05,
  indifference: number = 0.5
): { decision: 'pass' | 'fail' | 'continue'; confidence: number } {
  const theta0 = cutoff - indifference / 2;
  const theta1 = cutoff + indifference / 2;

  const upperBound = (1 - beta) / alpha;
  const lowerBound = beta / (1 - alpha);

  const z = (theta - cutoff) / se;
  const likelihoodRatio = Math.exp(z * z / 2);

  let decision: 'pass' | 'fail' | 'continue' = 'continue';
  let confidence = 0;

  if (likelihoodRatio >= upperBound) {
    decision = theta > cutoff ? 'pass' : 'fail';
    confidence = 1 - alpha;
  } else if (likelihoodRatio <= lowerBound) {
    decision = theta < cutoff ? 'fail' : 'pass';
    confidence = 1 - beta;
  } else {
    const position = (likelihoodRatio - lowerBound) / (upperBound - lowerBound);
    confidence = 0.5 + 0.5 * (position - 0.5);
  }

  return { decision, confidence };
}

/**
 * Exposure control using Sympson-Hetter method
 * Filters items based on exposure rate to prevent overuse
 */
export function filterItemsByExposure<T extends { exposureCount: number }>(
  items: T[],
  maxExposureRate: number,
  totalAdministrations: number
): T[] {
  if (totalAdministrations === 0) return items;

  return items.filter(item => {
    const currentRate = item.exposureCount / totalAdministrations;
    return currentRate < maxExposureRate;
  });
}

/**
 * Content balancing using Kingsbury-Zara algorithm
 * Ensures proportional representation of content categories
 */
export function selectItemWithContentBalancing<T extends { contentCategory?: string }>(
  candidates: T[],
  usedItems: T[],
  targetProportions: { [category: string]: number },
  scoreFunction: (item: T) => number
): T | null {
  if (candidates.length === 0) return null;

  const currentCounts: { [category: string]: number } = {};
  usedItems.forEach(item => {
    const cat = item.contentCategory || 'General';
    currentCounts[cat] = (currentCounts[cat] || 0) + 1;
  });

  const totalUsed = usedItems.length;
  const underrepresented: string[] = [];

  Object.keys(targetProportions).forEach(category => {
    const targetCount = totalUsed * targetProportions[category];
    const actualCount = currentCounts[category] || 0;
    if (actualCount < targetCount) {
      underrepresented.push(category);
    }
  });

  let filteredCandidates = candidates;
  if (underrepresented.length > 0) {
    const balanced = candidates.filter(item =>
      underrepresented.includes(item.contentCategory || 'General')
    );
    if (balanced.length > 0) {
      filteredCandidates = balanced;
    }
  }

  let bestItem = filteredCandidates[0];
  let bestScore = scoreFunction(bestItem);

  filteredCandidates.forEach(item => {
    const score = scoreFunction(item);
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  });

  return bestItem;
}

/**
 * Calculate test efficiency compared to fixed-form test
 */
export function calculateTestEfficiency(
  totalInformation: number,
  numItems: number,
  fixedFormAvgInfo: number = 0.5
): number {
  const fixedFormTotalInfo = numItems * fixedFormAvgInfo;
  return (totalInformation / fixedFormTotalInfo) * 100;
}

/**
 * Calculate measurement precision (inverse of SE)
 */
export function calculateMeasurementPrecision(se: number): number {
  return 1 / se;
}

/**
 * Estimate theta bounds for numerical stability
 */
export function constrainTheta(theta: number, min: number = -4, max: number = 4): number {
  return Math.max(min, Math.min(max, theta));
}

/**
 * Calculate confidence interval for theta
 */
export function calculateConfidenceInterval(
  theta: number,
  se: number,
  confidence: number = 0.95
): { lower: number; upper: number } {
  const z = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.576 : 1.645;
  return {
    lower: theta - z * se,
    upper: theta + z * se
  };
}
