// Differential Item Functioning (DIF) for a two-group comparison. Two families:
//   A. Score-based — Mantel–Haenszel (binary) + logistic/moderated regression
//      (Likert), reusing the tested engine in culturalUtils.
//   B. IRT-based — a 2PL calibrated separately per group, mean–sigma linked,
//      then compared item-by-item (uniform Δb, non-uniform Δa).
// Both take a dataset (rows keyed by column name), the item columns and a
// grouping column; the two most frequent group values become reference/focal.

import { performDIFAnalysis, GroupData } from './culturalUtils';
import { IRTEstimator } from './itemResponseTheory';

export type DIFClass = 'A' | 'B' | 'C'; // negligible / moderate / large (ETS-style)

export interface DIFRow {
  item: string;
  statistic: number;      // MH χ² / ΔR² / |Δb|
  pValue?: number;
  effectSize: number;
  classification: DIFClass;
  uniform?: number;       // IRT: linked difficulty shift Δb
  nonUniform?: number;    // IRT: discrimination shift Δa
  detail: string;
}

export interface DIFOutput {
  method: string;
  g1Name: string;
  g2Name: string;
  n1: number;
  n2: number;
  rows: DIFRow[];
  note?: string;
}

const mean = (x: number[]) => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : 0);
const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, x.length - 1)); };
const isBinaryMatrix = (m: number[][]) => m.every(r => r.every(v => v === 0 || v === 1));

/** Split a dataset into the two most frequent groups on `groupCol`. */
export function splitGroups(
  data: Array<Record<string, unknown>>,
  itemCols: string[],
  groupCol: string,
): { g1Name: string; g2Name: string; g1: number[][]; g2: number[][] } | { error: string } {
  const counts = new Map<string, number>();
  for (const row of data) {
    const v = String(row[groupCol] ?? '').trim();
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const vals = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  if (vals.length < 2) return { error: `Grouping variable "${groupCol}" needs at least two groups with data.` };
  const [g1Name, g2Name] = vals;
  const toMatrix = (target: string) => data
    .filter((r) => String(r[groupCol] ?? '').trim() === target)
    .map((r) => itemCols.map((c) => {
      const raw = r[c];
      if (raw === '' || raw === null || raw === undefined) return NaN; // empty ≠ 0
      const n = Number(raw);
      return Number.isFinite(n) ? n : NaN;
    }))
    .filter((r) => r.every((v) => Number.isFinite(v)));
  return { g1Name, g2Name, g1: toMatrix(g1Name), g2: toMatrix(g2Name) };
}

const clsToLetter = (c: 'negligible' | 'moderate' | 'large'): DIFClass => (c === 'negligible' ? 'A' : c === 'moderate' ? 'B' : 'C');

/** Option A — score-based DIF (Mantel–Haenszel + logistic/moderated regression). */
export function runScoreDIF(
  g1: number[][], g2: number[][], itemNames: string[], g1Name: string, g2Name: string,
): DIFOutput {
  const mk = (name: string, responses: number[][]): GroupData => ({ id: name, name, language: '', responses, sampleSize: responses.length });
  const res = performDIFAnalysis(mk(g2Name, g2), mk(g1Name, g1), itemNames, 'all'); // focal = g2, reference = g1
  const binary = isBinaryMatrix(g1) && isBinaryMatrix(g2);
  const rows: DIFRow[] = res.map((r) => ({
    item: r.itemName,
    statistic: r.difMagnitude,
    pValue: r.pValue,
    effectSize: r.effectSize,
    classification: clsToLetter(r.classification),
    detail: r.interpretation,
  }));
  return {
    method: binary ? 'Mantel–Haenszel (binary items)' : 'Logistic / moderated regression (ΔR²)',
    g1Name, g2Name, n1: g1.length, n2: g2.length, rows,
    note: binary
      ? 'ETS Δ scale: |Δ| < 1 = A (negligible), 1–1.5 = B, > 1.5 = C.'
      : 'Likert items — regression-based DIF with Jodoin & Gierl (2001) ΔR² thresholds (< .035 A, .035–.07 B, > .07 C).',
  };
}

/** Option B — IRT DIF: 2PL per group, mean–sigma linked, parameters compared. */
export function runIRTDIF(
  g1: number[][], g2: number[][], itemNames: string[], g1Name: string, g2Name: string,
): DIFOutput {
  const k = itemNames.length;
  // Dichotomize each item at its pooled median so a dichotomous 2PL applies.
  const medians = Array.from({ length: k }, (_, j) => {
    const vals = [...g1, ...g2].map((r) => r[j]).filter(Number.isFinite).sort((a, b) => a - b);
    return vals.length ? vals[Math.floor(vals.length / 2)] : 0.5;
  });
  const dich = (m: number[][]) => m.map((r) => r.map((v, j) => (v >= medians[j] ? 1 : 0)));
  const r1 = IRTEstimator.estimate(dich(g1), itemNames, '2PL');
  const r2 = IRTEstimator.estimate(dich(g2), itemNames, '2PL');
  const b1 = r1.itemParameters.map((p) => p.difficulty), a1 = r1.itemParameters.map((p) => p.discrimination);
  const b2 = r2.itemParameters.map((p) => p.difficulty), a2 = r2.itemParameters.map((p) => p.discrimination);

  // Mean–sigma linking: put group-2 parameters on group-1's scale.
  const A = sd(b2) > 1e-6 ? sd(b1) / sd(b2) : 1;
  const B = mean(b1) - A * mean(b2);

  const rows: DIFRow[] = itemNames.map((name, j) => {
    const b2s = A * b2[j] + B, a2s = a2[j] / A;
    const db = b1[j] - b2s, da = a1[j] - a2s;
    const mag = Math.abs(db);
    const classification: DIFClass = mag < 0.5 ? 'A' : mag < 1.0 ? 'B' : 'C';
    return { item: name, statistic: mag, effectSize: mag, classification, uniform: db, nonUniform: da,
      detail: `Δb = ${db.toFixed(3)} (uniform), Δa = ${da.toFixed(3)} (non-uniform)` };
  });

  return {
    method: 'IRT 2PL — parameter comparison (mean–sigma linked)',
    g1Name, g2Name, n1: g1.length, n2: g2.length, rows,
    note: 'Items dichotomized at their median for a 2PL model. Δb is the linked difficulty shift; classification is descriptive (|Δb| < 0.5 A, 0.5–1.0 B, > 1.0 C).',
  };
}

export function runDIF(
  data: Array<Record<string, unknown>>,
  itemCols: string[],
  groupCol: string,
  family: 'score' | 'irt',
): DIFOutput | { error: string } {
  if (itemCols.length < 3) return { error: 'Select at least 3 items for DIF analysis.' };
  const split = splitGroups(data, itemCols, groupCol);
  if ('error' in split) return split;
  if (split.g1.length < 10 || split.g2.length < 10) return { error: 'Each group needs at least 10 complete cases.' };
  return family === 'irt'
    ? runIRTDIF(split.g1, split.g2, itemCols, split.g1Name, split.g2Name)
    : runScoreDIF(split.g1, split.g2, itemCols, split.g1Name, split.g2Name);
}
