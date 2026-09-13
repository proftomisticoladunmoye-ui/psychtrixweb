// Common, serializable SEM specification graph — the single representation the
// Visual Builder edits and every downstream consumer reads. It is deliberately a
// FAITHFUL superset of what the existing estimators consume: `toSEMModel` emits
// exactly the `{ measurementModel, structuralPaths }` object that
// SEMEstimator.estimate (structuralEquationModeling.ts) already accepts, plus the
// derived mediator list EnhancedSEM already uses. Nothing is invented: the graph
// only carries what the researcher placed, and validation reports *potential*
// issues rather than asserting statistical certainty.

export type SemFamily =
  | 'cfa' | 'path' | 'full' | 'mediation' | 'moderation' | 'mimic'
  | 'lgm' | 'multigroup' | 'invariance' | 'second-order' | 'higher-order' | 'bifactor';

export interface SemFamilyInfo {
  id: SemFamily;
  label: string;
  /** true when the current client-side estimator can actually fit this family. */
  supported: boolean;
  /** short note shown for roadmap (unsupported) families. */
  note?: string;
}

// Honest capability map. `supported` families estimate through the existing
// SEMEstimator/CFAEstimator today; the rest are exposed as roadmap and disabled
// so nothing looks operational that isn't (per the design brief).
export const SEM_FAMILIES: SemFamilyInfo[] = [
  { id: 'cfa', label: 'CFA', supported: true },
  { id: 'path', label: 'Path Model', supported: true },
  { id: 'full', label: 'Full SEM', supported: true },
  { id: 'mediation', label: 'Mediation SEM', supported: true },
  { id: 'moderation', label: 'Moderation SEM', supported: false, note: 'Latent interactions are not yet estimable here — use Multi-group SEM for group moderation.' },
  { id: 'second-order', label: 'Second-Order CFA', supported: false, note: 'A higher-order factor is drawn, but the estimator fits first-order factors only — true higher-order estimation is planned.' },
  { id: 'multigroup', label: 'Multigroup SEM', supported: false, note: 'Use the Multi-group SEM tab; visual multigroup wiring is planned.' },
  { id: 'invariance', label: 'Measurement Invariance', supported: false, note: 'Use the Measurement Invariance tab; shared-graph wiring is planned.' },
  { id: 'mimic', label: 'MIMIC Model', supported: false, note: 'Covariates → latent direct effects are not yet estimable client-side.' },
  { id: 'higher-order', label: 'Higher-Order SEM', supported: false, note: 'Planned.' },
  { id: 'lgm', label: 'Latent Growth Model', supported: false, note: 'Growth factors require a dedicated estimator — planned.' },
  { id: 'bifactor', label: 'Bifactor Model', supported: false, note: 'Orthogonal general + specific factors — planned.' },
];

export type SemNodeKind = 'latent' | 'observed';

export interface SemNode {
  id: string;              // stable id; for observed nodes this is the column name
  kind: SemNodeKind;
  name: string;            // column name (observed) or latent key (latent)
  label?: string;          // optional display label
  x: number;
  y: number;
}

export type SemEdgeKind = 'loading' | 'regression' | 'covariance';

export interface SemEdge {
  id: string;
  from: string;            // node id
  to: string;              // node id
  kind: SemEdgeKind;       // loading: latent→observed · regression: directed · covariance: undirected
}

export interface SemOptions {
  estimator: 'auto' | 'DWLS' | 'ULS';
  missing: 'fiml' | 'listwise' | 'ml';
  mediation: boolean;
}

export interface SemGraph {
  family: SemFamily;
  nodes: SemNode[];
  edges: SemEdge[];
  options: SemOptions;
}

export const DEFAULT_OPTIONS: SemOptions = { estimator: 'auto', missing: 'fiml', mediation: true };

export function emptyGraph(family: SemFamily = 'full'): SemGraph {
  return { family, nodes: [], edges: [], options: { ...DEFAULT_OPTIONS } };
}

export function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export const nodeById = (g: SemGraph, id: string) => g.nodes.find((n) => n.id === id);

// ── Estimator translation ─────────────────────────────────────────────────────
// measurementModel: { latentName: [indicator columns] } from loading edges.
// structuralPaths:  regression edges between LATENT nodes (what the estimator fits).
// mediators:        latents with both an incoming and an outgoing structural path
//                   (matches EnhancedSEM's autoDetectMediators).
export interface TranslatedModel {
  measurementModel: { [latent: string]: string[] };
  structuralPaths: Array<{ from: string; to: string }>;
  mediators: string[];
}

export function toSEMModel(g: SemGraph): TranslatedModel {
  const latents = g.nodes.filter((n) => n.kind === 'latent');
  const measurementModel: { [latent: string]: string[] } = {};
  for (const lv of latents) measurementModel[lv.name] = [];

  for (const e of g.edges) {
    if (e.kind !== 'loading') continue;
    const from = nodeById(g, e.from);
    const to = nodeById(g, e.to);
    if (!from || !to) continue;
    // Orientation-tolerant: the latent end owns the indicator.
    const latent = from.kind === 'latent' ? from : to.kind === 'latent' ? to : null;
    const observed = from.kind === 'observed' ? from : to.kind === 'observed' ? to : null;
    if (!latent || !observed) continue;
    if (!measurementModel[latent.name].includes(observed.name)) measurementModel[latent.name].push(observed.name);
  }

  const latentNames = new Set(latents.map((l) => l.name));
  const structuralPaths: Array<{ from: string; to: string }> = [];
  for (const e of g.edges) {
    if (e.kind !== 'regression') continue;
    const from = nodeById(g, e.from);
    const to = nodeById(g, e.to);
    if (!from || !to) continue;
    if (latentNames.has(from.name) && latentNames.has(to.name)) {
      if (!structuralPaths.some((p) => p.from === from.name && p.to === to.name)) {
        structuralPaths.push({ from: from.name, to: to.name });
      }
    }
  }

  const mediators = latents
    .map((l) => l.name)
    .filter((f) => structuralPaths.some((p) => p.to === f) && structuralPaths.some((p) => p.from === f));

  return { measurementModel, structuralPaths, mediators };
}

// ── Validation ─────────────────────────────────────────────────────────────────
export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
  nodeId?: string;
}

// Detects structural problems only; never claims statistical certainty. Errors
// block estimation; warnings are advisory (e.g. two-indicator factors).
export function validateGraph(g: SemGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const latents = g.nodes.filter((n) => n.kind === 'latent');
  const observed = g.nodes.filter((n) => n.kind === 'observed');
  const { measurementModel, structuralPaths } = toSEMModel(g);

  if (latents.length === 0) {
    issues.push({ level: 'error', message: 'No latent variables. Add at least one latent variable with indicators.' });
  }

  // Indicators per latent.
  for (const lv of latents) {
    const inds = measurementModel[lv.name] || [];
    if (inds.length === 0) {
      issues.push({ level: 'error', message: `${lv.label || lv.name} has no indicators. Connect observed variables to it.`, nodeId: lv.id });
    } else if (inds.length < 3) {
      issues.push({ level: 'warning', message: `${lv.label || lv.name} has only ${inds.length} indicator${inds.length === 1 ? '' : 's'} — may require an identification constraint (≥3 recommended).`, nodeId: lv.id });
    }
  }

  // Cross-loadings (an indicator on more than one latent).
  const loadCount = new Map<string, number>();
  for (const [, inds] of Object.entries(measurementModel)) {
    for (const ind of inds) loadCount.set(ind, (loadCount.get(ind) || 0) + 1);
  }
  for (const [ind, c] of loadCount) {
    if (c > 1) issues.push({ level: 'warning', message: `${ind} loads on ${c} factors (cross-loading). Confirm this is intended.` });
  }

  // Isolated observed variables (dragged in but not connected).
  const connected = new Set<string>();
  for (const e of g.edges) { connected.add(e.from); connected.add(e.to); }
  for (const ov of observed) {
    if (!connected.has(ov.id)) issues.push({ level: 'warning', message: `${ov.name} is on the canvas but connected to nothing.`, nodeId: ov.id });
  }

  // Self-paths and duplicate regressions.
  const seenReg = new Set<string>();
  for (const e of g.edges) {
    if (e.kind !== 'regression') continue;
    if (e.from === e.to) issues.push({ level: 'error', message: 'A variable cannot predict itself (self-path).' });
    const key = `${e.from}->${e.to}`;
    if (seenReg.has(key)) issues.push({ level: 'warning', message: 'Duplicate structural path detected.' });
    seenReg.add(key);
  }

  // Family expectations.
  if ((g.family === 'full' || g.family === 'mediation') && structuralPaths.length === 0 && latents.length >= 2) {
    issues.push({ level: 'warning', message: 'No structural paths between latent variables — this is a CFA (measurement-only) model.' });
  }
  if (g.family === 'mediation' && toSEMModel(g).mediators.length === 0 && structuralPaths.length > 0) {
    issues.push({ level: 'warning', message: 'No mediator detected — a mediator needs both an incoming and an outgoing path.' });
  }

  return issues;
}

// ── Syntax synchronization (visual → lavaan-style) ─────────────────────────────
// One-way, always-faithful rendering of the CURRENT graph as lavaan syntax. It is
// derived from toSEMModel(), so what you read is exactly what the estimator fits —
// no separate representation that could drift out of sync. Read-only by design:
// the visual model stays the single source of truth (editing text back would risk
// inconsistency), so this is a live mirror, not a second editor.
export function toLavaanSyntax(g: SemGraph): string {
  const { measurementModel, structuralPaths } = toSEMModel(g);
  const labelOf = (latentName: string) => {
    const n = g.nodes.find((x) => x.kind === 'latent' && x.name === latentName);
    return n?.label && n.label !== n.name ? `  # ${n.label}` : '';
  };

  const lines: string[] = [];
  const latents = Object.keys(measurementModel);

  if (latents.length) {
    lines.push('# Measurement model');
    for (const lv of latents) {
      const inds = measurementModel[lv];
      if (inds.length) lines.push(`${lv} =~ ${inds.join(' + ')}${labelOf(lv)}`);
      else lines.push(`# ${lv} =~ (no indicators yet)`);
    }
  }

  if (structuralPaths.length) {
    // Group regressions by outcome: "Y ~ X1 + X2".
    const byOutcome = new Map<string, string[]>();
    for (const p of structuralPaths) {
      if (!byOutcome.has(p.to)) byOutcome.set(p.to, []);
      byOutcome.get(p.to)!.push(p.from);
    }
    lines.push('', '# Structural model');
    for (const [to, froms] of byOutcome) lines.push(`${to} ~ ${froms.join(' + ')}`);
  }

  // Explicit covariances, if the researcher drew any.
  const covs = g.edges.filter((e) => e.kind === 'covariance');
  if (covs.length) {
    lines.push('', '# Covariances');
    for (const e of covs) {
      const a = nodeById(g, e.from), b = nodeById(g, e.to);
      if (a && b) lines.push(`${a.name} ~~ ${b.name}`);
    }
  }

  return lines.length ? lines.join('\n') : '# Empty model — add latent variables and indicators.';
}

// ── Model templates ─────────────────────────────────────────────────────────────
// A template scaffolds the STRUCTURE (latent shells and the paths between them)
// so the researcher starts from a recognisable shape, then assigns their own
// variables as indicators. It never fabricates observed variables.
export interface SemTemplate {
  id: string;
  label: string;
  description: string;
  family: SemFamily;
  build: () => SemGraph;
}

const latentNode = (name: string, x: number, y: number): SemNode => ({ id: makeId('lat'), kind: 'latent', name, x, y });

export const SEM_TEMPLATES: SemTemplate[] = [
  {
    id: 'blank', label: 'Blank Model', family: 'full',
    description: 'Start from scratch.',
    build: () => emptyGraph('full'),
  },
  {
    id: 'cfa', label: 'CFA', family: 'cfa',
    description: 'One latent factor — add its indicators.',
    build: () => ({ ...emptyGraph('cfa'), nodes: [latentNode('Factor1', 260, 90)] }),
  },
  {
    id: 'cfa2', label: 'Two-Factor CFA', family: 'cfa',
    description: 'Two correlated latent factors.',
    build: () => ({ ...emptyGraph('cfa'), nodes: [latentNode('Factor1', 180, 90), latentNode('Factor2', 460, 90)] }),
  },
  {
    id: 'full', label: 'Full SEM', family: 'full',
    description: 'Predictor → outcome, each with indicators.',
    build: () => {
      const x = latentNode('Predictor', 160, 110);
      const y = latentNode('Outcome', 480, 110);
      return { ...emptyGraph('full'), nodes: [x, y], edges: [{ id: makeId('reg'), from: x.id, to: y.id, kind: 'regression' }] };
    },
  },
  {
    id: 'mediation', label: 'Mediation', family: 'mediation',
    description: 'X → M → Y with a direct X → Y path.',
    build: () => {
      const X = latentNode('X', 120, 210);
      const M = latentNode('M', 340, 80);
      const Y = latentNode('Y', 560, 210);
      return {
        ...emptyGraph('mediation'), nodes: [X, M, Y],
        edges: [
          { id: makeId('reg'), from: X.id, to: M.id, kind: 'regression' },
          { id: makeId('reg'), from: M.id, to: Y.id, kind: 'regression' },
          { id: makeId('reg'), from: X.id, to: Y.id, kind: 'regression' },
        ],
      };
    },
  },
];
