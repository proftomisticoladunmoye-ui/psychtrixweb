import { EigenDecomposition, FactorRotation, KMO, MatrixOps } from './psychometricStats';

// Unbiased sample variance (÷ n-1)
function sampleVariance(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = values.reduce((s, v) => s + v, 0) / n;
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1);
}

function sampleSD(values: number[]): number {
  return Math.sqrt(sampleVariance(values));
}

function pearsonR(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy; sx += dx * dx; sy += dy * dy;
  }
  const denom = Math.sqrt(sx * sy);
  return denom === 0 ? 0 : num / denom;
}

export function calculateCronbachAlpha(responses: number[][]): number {
  const numItems = responses[0]?.length || 0;
  const n = responses.length;
  if (numItems < 2 || n < 2) return 0;

  const itemVars = Array.from({ length: numItems }, (_, k) =>
    sampleVariance(responses.map(r => r[k]))
  );
  const totalScores = responses.map(r => r.reduce((s, v) => s + v, 0));
  const totalVar = sampleVariance(totalScores);
  if (totalVar === 0) return 0;

  const alpha = (numItems / (numItems - 1)) * (1 - itemVars.reduce((s, v) => s + v, 0) / totalVar);
  return Math.max(0, Math.min(1, alpha));
}

export function calculateItemTotalCorrelation(responses: number[][], itemIndex: number): number {
  const item = responses.map(r => r[itemIndex]);
  const total = responses.map(r => r.reduce((s, v) => s + v, 0));
  return pearsonR(item, total);
}

export function calculateCorrectedItemTotalCorrelation(responses: number[][], itemIndex: number): number {
  const item = responses.map(r => r[itemIndex]);
  const rest = responses.map(r => r.reduce((s, v, i) => i !== itemIndex ? s + v : s, 0));
  return pearsonR(item, rest);
}

export function calculateInterItemCorrelationMatrix(responses: number[][]): number[][] {
  const numItems = responses[0]?.length || 0;
  const matrix: number[][] = Array.from({ length: numItems }, () => Array(numItems).fill(0));
  for (let i = 0; i < numItems; i++) {
    for (let j = 0; j < numItems; j++) {
      if (i === j) matrix[i][j] = 1;
      else matrix[i][j] = pearsonR(responses.map(r => r[i]), responses.map(r => r[j]));
    }
  }
  return matrix;
}

export function calculateAverageInterItemCorrelation(responses: number[][]): number {
  const numItems = responses[0]?.length || 0;
  if (numItems < 2) return 0;
  const matrix = calculateInterItemCorrelationMatrix(responses);
  let sum = 0, count = 0;
  for (let i = 0; i < numItems; i++) {
    for (let j = i + 1; j < numItems; j++) {
      sum += matrix[i][j]; count++;
    }
  }
  return count === 0 ? 0 : sum / count;
}

export function calculateItemDifficulty(responses: number[][], itemIndex: number, maxScore: number): number {
  const scores = responses.map(r => r[itemIndex]);
  return scores.reduce((s, v) => s + v, 0) / (scores.length * maxScore);
}

export function calculateItemDiscrimination(responses: number[][], itemIndex: number): number {
  const totals = responses.map(r => r.reduce((s, v) => s + v, 0));
  const sorted = responses.map((r, i) => ({ r, t: totals[i] })).sort((a, b) => b.t - a.t);
  const cutN = Math.floor(sorted.length * 0.27);
  if (cutN === 0) return 0;
  const upper = sorted.slice(0, cutN).map(x => x.r[itemIndex]);
  const lower = sorted.slice(sorted.length - cutN).map(x => x.r[itemIndex]);
  return (upper.reduce((s, v) => s + v, 0) / cutN) - (lower.reduce((s, v) => s + v, 0) / cutN);
}

export function bootstrapConfidenceInterval(
  responses: number[][],
  nBootstrap: number = 1000,
  alpha: number = 0.05
): { lower: number; upper: number; mean: number } {
  const n = responses.length;
  const boots = Array.from({ length: nBootstrap }, () => {
    const sample = Array.from({ length: n }, () => responses[Math.floor(Math.random() * n)]);
    return calculateCronbachAlpha(sample);
  });
  boots.sort((a, b) => a - b);
  // Use nearest-rank method for bootstrap percentiles
  const loIdx = Math.max(0, Math.round(nBootstrap * (alpha / 2)) - 1);
  const hiIdx = Math.min(nBootstrap - 1, Math.round(nBootstrap * (1 - alpha / 2)) - 1);
  return {
    lower: boots[loIdx],
    upper: boots[hiIdx],
    mean: boots.reduce((s, v) => s + v, 0) / nBootstrap,
  };
}

export function calculateSplitHalfReliability(responses: number[][]): number {
  const numItems = responses[0]?.length || 0;
  if (numItems < 2 || responses.length < 2) return 0;
  const half = Math.floor(numItems / 2);
  const first = responses.map(r => r.slice(0, half).reduce((s, v) => s + v, 0));
  const second = responses.map(r => r.slice(half).reduce((s, v) => s + v, 0));
  const r = pearsonR(first, second);
  return Math.max(0, Math.min(1, (2 * r) / (1 + r)));
}

export function calculateGuttmanLambda6(responses: number[][]): number {
  const numItems = responses[0]?.length || 0;
  const n = responses.length;
  if (numItems < 2 || n < 2) return 0;

  const totalScores = responses.map(r => r.reduce((s, v) => s + v, 0));
  const totalVar = sampleVariance(totalScores);
  if (totalVar === 0) return 0;

  // SMC via precision matrix: smc_j = 1 - 1/R^{-1}_{jj}
  const R = calculateInterItemCorrelationMatrix(responses);
  const Rinv = MatrixOps.inverse(R);
  let sumErrorVar = 0;
  for (let j = 0; j < numItems; j++) {
    const itemVar = sampleVariance(responses.map(r => r[j]));
    const smc = Rinv[j][j] > 0 ? 1 - 1 / Rinv[j][j] : 0;
    sumErrorVar += itemVar * Math.max(0, 1 - smc);
  }

  return Math.max(0, Math.min(1, 1 - sumErrorVar / totalVar));
}

export function performEFA(
  correlationMatrix: number[][],
  numFactors: number = 1
): {
  loadings: number[][];
  communalities: number[];
  eigenvalues: number[];
  varianceExplained: number[];
  rotatedLoadings?: number[][];
} {
  const n = correlationMatrix.length;
  const eigen = EigenDecomposition.compute(correlationMatrix, 500, 1e-8);
  const allEigenvalues = eigen.values;
  const keptFactors = Math.min(numFactors, allEigenvalues.length);

  // L[i][f] = eigenvector[f][i] * sqrt(eigenvalue[f])
  const loadings: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: keptFactors }, (_, f) =>
      (eigen.vectors[f]?.[i] ?? 0) * Math.sqrt(Math.max(0, allEigenvalues[f] ?? 0))
    )
  );

  const communalities = loadings.map(row => row.reduce((s, v) => s + v * v, 0));
  const varianceExplained = Array.from({ length: keptFactors }, (_, f) =>
    (allEigenvalues[f] ?? 0) / n * 100
  );

  let rotatedLoadings: number[][] | undefined;
  if (keptFactors > 1) {
    try { rotatedLoadings = FactorRotation.varimax(loadings); } catch { /* fallback */ }
  }

  return {
    loadings,
    communalities,
    eigenvalues: allEigenvalues.slice(0, keptFactors),
    varianceExplained,
    rotatedLoadings,
  };
}

export function calculateMcDonaldOmega(
  responses: number[][],
  factorLoadings?: number[][]
): number {
  const numItems = responses[0]?.length || 0;
  if (numItems < 2) return 0;

  let lambdas: number[];

  if (factorLoadings && factorLoadings.length === numItems) {
    // Use first-factor loadings
    lambdas = factorLoadings.map(row => row[0] ?? 0);
  } else {
    // Run single-factor EFA internally
    const R = calculateInterItemCorrelationMatrix(responses);
    const efa = performEFA(R, 1);
    lambdas = efa.loadings.map(row => row[0] ?? 0);
  }

  const sumL = lambdas.reduce((s, v) => s + v, 0);
  const sumL2 = lambdas.reduce((s, v) => s + v * v, 0);
  const denom = sumL * sumL + (numItems - sumL2);
  if (denom === 0) return 0;

  return Math.max(0, Math.min(1, (sumL * sumL) / denom));
}

export function calculateKMO(correlationMatrix: number[][]): { overall: number; individual: number[] } {
  return KMO.compute(correlationMatrix);
}

export function calculateBartlett(
  correlationMatrix: number[][],
  n: number
): { chisq: number; df: number; p: number } {
  const p = correlationMatrix.length;

  // Compute log|R| via eigenvalues of the correlation matrix directly
  const eigen = EigenDecomposition.compute(correlationMatrix, 300, 1e-8);
  const logDetR = eigen.values.reduce((sum, v) => sum + Math.log(Math.max(v, 1e-30)), 0);

  const chisq = -(n - 1 - (2 * p + 5) / 6) * logDetR;
  const df = (p * (p - 1)) / 2;

  // Chi-squared p-value via regularised incomplete gamma
  const p_val = 1 - regularisedIncompleteGamma(df / 2, chisq / 2);

  return { chisq, df, p: p_val };
}

// Regularised lower incomplete gamma P(a, x) for Bartlett p-value
function regularisedIncompleteGamma(a: number, x: number): number {
  if (x < 0 || a <= 0) return 0;
  if (x === 0) return 0;
  if (x > a + 1) return 1 - regularisedIncompleteGammaUpper(a, x);
  // Series expansion
  let sum = 1 / a, term = 1 / a;
  for (let n2 = 1; n2 < 300; n2++) {
    term *= x / (a + n2);
    sum += term;
    if (Math.abs(term) < 1e-10 * Math.abs(sum)) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function regularisedIncompleteGammaUpper(a: number, x: number): number {
  // Continued fraction (Lentz)
  let fprev = 0, f = 1e-30, C = f, D = 0;
  for (let i = 1; i <= 300; i++) {
    const b = x + i - a; const an = i * (a - i);
    D = b + an * D; if (Math.abs(D) < 1e-30) D = 1e-30; D = 1 / D;
    C = b + an / C; if (Math.abs(C) < 1e-30) C = 1e-30;
    const delta = C * D; f *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) / f;
}

function logGamma(z: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const ci of c) { y++; ser += ci / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

export function calculatePercentiles(scores: number[]): { [key: number]: number } {
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  const percentiles: { [key: number]: number } = {};

  [5, 10, 25, 50, 75, 90, 95].forEach(p => {
    const pos = (p / 100) * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, n - 1);
    percentiles[p] = sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
  });

  return percentiles;
}

export function calculateZScore(rawScore: number, mean: number, sd: number): number {
  return sd === 0 ? 0 : (rawScore - mean) / sd;
}

export function calculateTScore(rawScore: number, mean: number, sd: number): number {
  return 50 + 10 * calculateZScore(rawScore, mean, sd);
}

export function calculateStanine(rawScore: number, mean: number, sd: number): number {
  const z = calculateZScore(rawScore, mean, sd);
  if (z <= -1.75) return 1;
  if (z <= -1.25) return 2;
  if (z <= -0.75) return 3;
  if (z <= -0.25) return 4;
  if (z <= 0.25) return 5;
  if (z <= 0.75) return 6;
  if (z <= 1.25) return 7;
  if (z <= 1.75) return 8;
  return 9;
}

export function calculateContentValidityIndex(
  itemRatings: number[][],
  threshold: number = 3,
): { itemCVI: number[]; scaleCVI: number } {
  const numExperts = itemRatings[0]?.length || 0;
  const itemCVI = itemRatings.map(ratings => ratings.filter(r => r >= threshold).length / numExperts);
  const scaleCVI = itemCVI.reduce((s, v) => s + v, 0) / itemCVI.length;
  return { itemCVI, scaleCVI };
}

export function generateShareableLink(baseUrl: string, token: string): string {
  return `${baseUrl}/survey/${token}`;
}

export function getWhatsAppShareUrl(message: string, link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${message}\n\n${link}`)}`;
}

export function getEmailShareUrl(subject: string, body: string, link: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${body}\n\n${link}`)}`;
}

export function getFacebookShareUrl(link: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
}

export function getTwitterShareUrl(text: string, link: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${text} ${link}`)}`;
}
