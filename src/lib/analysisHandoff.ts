// A one-shot hand-off from the Scale Sandbox into a group-based analysis
// module. The Sandbox saves the collected data as a dataset, then stores the
// dataset id + grouping variable + factor structure here and navigates to the
// target module, which reads and clears the hand-off on arrival — so the
// researcher doesn't re-specify a model they've already built.

export type HandoffTarget = 'invariance' | 'multigroup' | 'cfa' | 'dif';

export interface AnalysisHandoff {
  target: HandoffTarget;
  datasetId: string;
  datasetName?: string;
  groupVariable?: string;
  factorStructure?: { [factor: string]: string[] };
  ts: number;
}

const KEY = 'ptx_analysis_handoff';

export function setHandoff(h: Omit<AnalysisHandoff, 'ts'>): void {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...h, ts: Date.now() })); } catch { /* ignore */ }
}

export function peekHandoff(): AnalysisHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as AnalysisHandoff;
    // Ignore stale hand-offs (older than 5 minutes) so a long-dormant tab
    // doesn't suddenly reconfigure a module.
    if (!h || Date.now() - (h.ts || 0) > 5 * 60 * 1000) { clearHandoff(); return null; }
    return h;
  } catch { return null; }
}

export function clearHandoff(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
