import React from 'react';
import { AlertTriangle, Activity, TrendingUp, ScatterChart } from 'lucide-react';
import { normalInv } from '../lib/polychoric';

// ─── Shared types (subset of PathAnalysisResults) ────────────────────────────

interface ModPlot {
  b0: number; b1: number; b2: number; b3: number;
  v11: number; v33: number; v13: number;
  tCrit: number; df: number;
  xMin: number; xMax: number; wMin: number; wMax: number;
  wLow: number; wHigh: number;
}
interface Moderation {
  iv: string; moderator: string; dv: string;
  interactionEffect: number; interactionP: number;
  johnsonNeyman?: { lowerBound: number | null; upperBound: number | null; significance: string };
  plot?: ModPlot;
}
interface VifRow { dv: string; predictor: string; vif: number }
interface ResidualSet { dv: string; fitted: number[]; residuals: number[]; stdResiduals: number[] }

interface Props {
  moderation?: Moderation[];
  vif?: VifRow[];
  residuals?: ResidualSet[];
}

// ─── SVG plot helpers ────────────────────────────────────────────────────────

const W = 340, H = 220, ML = 44, MR = 14, MT = 16, MB = 34;
const PW = W - ML - MR, PH = H - MT - MB;

function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!isFinite(lo) || !isFinite(hi) || lo === hi) return [lo];
  const span = hi - lo;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}
const fmt = (v: number) => Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2);

function Axes({ xlo, xhi, ylo, yhi, xlab, ylab, children }: {
  xlo: number; xhi: number; ylo: number; yhi: number; xlab: string; ylab: string; children: React.ReactNode;
}) {
  const sx = (x: number) => ML + ((x - xlo) / (xhi - xlo || 1)) * PW;
  const sy = (y: number) => MT + PH - ((y - ylo) / (yhi - ylo || 1)) * PH;
  const xticks = niceTicks(xlo, xhi), yticks = niceTicks(ylo, yhi);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W }}>
      {/* grid + ticks */}
      {yticks.map(t => (
        <g key={'y' + t}>
          <line x1={ML} y1={sy(t)} x2={ML + PW} y2={sy(t)} stroke="#f1f5f9" />
          <text x={ML - 5} y={sy(t) + 3} fontSize="9" textAnchor="end" fill="#94a3b8">{fmt(t)}</text>
        </g>
      ))}
      {xticks.map(t => (
        <g key={'x' + t}>
          <line x1={sx(t)} y1={MT} x2={sx(t)} y2={MT + PH} stroke="#f8fafc" />
          <text x={sx(t)} y={MT + PH + 12} fontSize="9" textAnchor="middle" fill="#94a3b8">{fmt(t)}</text>
        </g>
      ))}
      {/* frame */}
      <rect x={ML} y={MT} width={PW} height={PH} fill="none" stroke="#e2e8f0" />
      <text x={ML + PW / 2} y={H - 4} fontSize="10" textAnchor="middle" fill="#475569">{xlab}</text>
      <text x={11} y={MT + PH / 2} fontSize="10" textAnchor="middle" fill="#475569" transform={`rotate(-90 11 ${MT + PH / 2})`}>{ylab}</text>
      {typeof children === 'function' ? (children as any)(sx, sy) : children}
    </svg>
  );
}

// ─── Simple-slopes / interaction plot ────────────────────────────────────────

function InteractionPlot({ m }: { m: Moderation }) {
  const p = m.plot!;
  const yAt = (x: number, w: number) => p.b0 + p.b1 * x + p.b2 * w + p.b3 * x * w;
  const levels = [
    { w: p.wLow, label: `Low ${m.moderator} (−1 SD)`, color: '#2563eb' },
    { w: 0, label: `Mean ${m.moderator}`, color: '#059669' },
    { w: p.wHigh, label: `High ${m.moderator} (+1 SD)`, color: '#dc2626' },
  ];
  const xs = [p.xMin, p.xMax];
  const ys = levels.flatMap(l => xs.map(x => yAt(x, l.w)));
  const ylo = Math.min(...ys), yhi = Math.max(...ys);
  const pad = (yhi - ylo) * 0.08 || 1;

  return (
    <div>
      <p className="text-sm font-semibold text-gray-800 mb-1">Interaction / Simple-slopes plot</p>
      <Axes xlo={p.xMin} xhi={p.xMax} ylo={ylo - pad} yhi={yhi + pad} xlab={`${m.iv} (centered)`} ylab={m.dv}>
        {((sx: (x: number) => number, sy: (y: number) => number) => (
          <>
            {levels.map(l => (
              <line key={l.label} x1={sx(p.xMin)} y1={sy(yAt(p.xMin, l.w))} x2={sx(p.xMax)} y2={sy(yAt(p.xMax, l.w))} stroke={l.color} strokeWidth={2} />
            ))}
          </>
        )) as any}
      </Axes>
      <div className="flex flex-wrap gap-3 mt-1">
        {levels.map(l => (
          <span key={l.label} className="flex items-center gap-1 text-xs text-gray-600">
            <span className="inline-block w-3 h-0.5" style={{ background: l.color }} />{l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Johnson–Neyman region-of-significance plot ──────────────────────────────

function JohnsonNeymanPlot({ m }: { m: Moderation }) {
  const p = m.plot!;
  const N = 60;
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const w = p.wMin + (i / N) * (p.wMax - p.wMin);
    const theta = p.b1 + p.b3 * w;
    const se = Math.sqrt(Math.max(0, p.v11 + w * w * p.v33 + 2 * w * p.v13));
    return { w, theta, lo: theta - p.tCrit * se, hi: theta + p.tCrit * se };
  });
  const ys = pts.flatMap(q => [q.lo, q.hi, 0]);
  const ylo = Math.min(...ys), yhi = Math.max(...ys);
  const pad = (yhi - ylo) * 0.08 || 1;
  const jn = m.johnsonNeyman;

  return (
    <div>
      <p className="text-sm font-semibold text-gray-800 mb-1">Johnson–Neyman (region of significance)</p>
      <Axes xlo={p.wMin} xhi={p.wMax} ylo={ylo - pad} yhi={yhi + pad} xlab={`${m.moderator} (centered)`} ylab={`Effect of ${m.iv} on ${m.dv}`}>
        {((sx: (x: number) => number, sy: (y: number) => number) => {
          const bandTop = pts.map(q => `${sx(q.w).toFixed(1)},${sy(q.hi).toFixed(1)}`).join(' ');
          const bandBot = pts.slice().reverse().map(q => `${sx(q.w).toFixed(1)},${sy(q.lo).toFixed(1)}`).join(' ');
          const line = pts.map(q => `${sx(q.w).toFixed(1)},${sy(q.theta).toFixed(1)}`).join(' ');
          return (
            <>
              <polygon points={`${bandTop} ${bandBot}`} fill="#93c5fd" fillOpacity={0.3} />
              <line x1={ML} y1={sy(0)} x2={ML + PW} y2={sy(0)} stroke="#94a3b8" strokeDasharray="4 3" />
              <polyline points={line} fill="none" stroke="#1d4ed8" strokeWidth={2} />
              {jn?.lowerBound != null && jn.lowerBound >= p.wMin && jn.lowerBound <= p.wMax && (
                <line x1={sx(jn.lowerBound)} y1={MT} x2={sx(jn.lowerBound)} y2={MT + PH} stroke="#dc2626" strokeDasharray="3 3" />
              )}
              {jn?.upperBound != null && jn.upperBound >= p.wMin && jn.upperBound <= p.wMax && (
                <line x1={sx(jn.upperBound)} y1={MT} x2={sx(jn.upperBound)} y2={MT + PH} stroke="#dc2626" strokeDasharray="3 3" />
              )}
            </>
          );
        }) as any}
      </Axes>
      <p className="text-xs text-gray-500 mt-1">
        Shaded = 95% CI of the conditional effect; where it excludes 0 the effect is significant.
        {jn?.significance === 'conditional' && jn.lowerBound != null && jn.upperBound != null &&
          ` J–N points at ${fmt(jn.lowerBound)} and ${fmt(jn.upperBound)}.`}
        {jn?.significance === 'always' && ' Effect significant across the whole range.'}
        {jn?.significance === 'never' && ' Effect not significant at any moderator value.'}
      </p>
    </div>
  );
}

// ─── Residual diagnostics (residual-vs-fitted + normal Q–Q) ──────────────────

function downsample<T>(arr: T[], max = 400): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

function ResidualDiagnostics({ r }: { r: ResidualSet }) {
  // residual vs fitted
  const pts = downsample(r.fitted.map((f, i) => ({ f, e: r.residuals[i] })));
  const fLo = Math.min(...r.fitted), fHi = Math.max(...r.fitted);
  const eAbs = Math.max(...r.residuals.map(Math.abs)) || 1;

  // normal Q–Q of standardised residuals
  const sorted = [...r.stdResiduals].sort((a, b) => a - b);
  const n = sorted.length;
  const qq = downsample(sorted.map((s, i) => ({ theo: normalInv((i + 0.5) / n), samp: s })));
  const qLim = Math.max(3, ...qq.map(p => Math.max(Math.abs(p.theo), Math.abs(p.samp))));

  return (
    <div>
      <p className="text-sm font-semibold text-gray-800 mb-1">Residual diagnostics — {r.dv}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-gray-500 mb-1">Residuals vs fitted</p>
          <Axes xlo={fLo} xhi={fHi} ylo={-eAbs * 1.05} yhi={eAbs * 1.05} xlab="Fitted" ylab="Residual">
            {((sx: (x: number) => number, sy: (y: number) => number) => (
              <>
                <line x1={ML} y1={sy(0)} x2={ML + PW} y2={sy(0)} stroke="#94a3b8" strokeDasharray="4 3" />
                {pts.map((p, i) => <circle key={i} cx={sx(p.f)} cy={sy(p.e)} r={1.7} fill="#2563eb" fillOpacity={0.5} />)}
              </>
            )) as any}
          </Axes>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Normal Q–Q (standardised residuals)</p>
          <Axes xlo={-qLim} xhi={qLim} ylo={-qLim} yhi={qLim} xlab="Theoretical quantiles" ylab="Sample quantiles">
            {((sx: (x: number) => number, sy: (y: number) => number) => (
              <>
                <line x1={sx(-qLim)} y1={sy(-qLim)} x2={sx(qLim)} y2={sy(qLim)} stroke="#94a3b8" strokeDasharray="4 3" />
                {qq.map((p, i) => <circle key={i} cx={sx(p.theo)} cy={sy(p.samp)} r={1.7} fill="#059669" fillOpacity={0.5} />)}
              </>
            )) as any}
          </Axes>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Look for no pattern / constant spread in residuals-vs-fitted (homoscedasticity) and points on the diagonal in the Q–Q plot (normality).
      </p>
    </div>
  );
}

// ─── VIF table ────────────────────────────────────────────────────────────────

function VifTable({ vif }: { vif: VifRow[] }) {
  const flag = (v: number) => v >= 10 ? { t: 'Serious', c: 'text-red-600' } : v >= 5 ? { t: 'Elevated', c: 'text-amber-600' } : { t: 'OK', c: 'text-green-600' };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
        <h4 className="text-lg font-bold text-gray-900">Multicollinearity (VIF)</h4>
        <span className="ml-auto text-xs text-gray-500">VIF &lt; 5 preferred · ≥ 10 indicates a problem</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 text-left">
              <th className="py-2 px-3 font-semibold text-gray-700">Outcome</th>
              <th className="py-2 px-3 font-semibold text-gray-700">Predictor</th>
              <th className="py-2 px-3 font-semibold text-gray-700 text-right">VIF</th>
              <th className="py-2 px-3 font-semibold text-gray-700 text-right">Tolerance</th>
              <th className="py-2 px-3 font-semibold text-gray-700">Assessment</th>
            </tr>
          </thead>
          <tbody>
            {vif.map((r, i) => {
              const f = flag(r.vif);
              return (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 px-3 text-gray-700">{r.dv}</td>
                  <td className="py-2 px-3 text-gray-700">{r.predictor}</td>
                  <td className="py-2 px-3 text-right font-medium">{r.vif.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right text-gray-500">{(1 / r.vif).toFixed(3)}</td>
                  <td className={`py-2 px-3 font-medium ${f.c}`}>{f.t}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function PathDiagnostics({ moderation, vif, residuals }: Props) {
  const mods = (moderation || []).filter(m => m.plot);
  const hasVif = (vif || []).length > 0;
  const resids = (residuals || []).filter(r => r.residuals.length > 5);
  if (!hasVif && mods.length === 0 && resids.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-blue-600" />
        <h3 className="text-xl font-bold text-gray-900">Diagnostics &amp; Visualizations</h3>
      </div>

      {hasVif && <VifTable vif={vif!} />}

      {resids.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div className="flex items-center gap-2">
            <ScatterChart className="w-5 h-5 text-blue-600" />
            <h4 className="text-lg font-bold text-gray-900">Residual Diagnostics</h4>
          </div>
          {resids.map((r, i) => <ResidualDiagnostics key={i} r={r} />)}
        </div>
      )}

      {mods.map((m, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <h4 className="text-lg font-bold text-gray-900">{m.iv} × {m.moderator} → {m.dv}</h4>
            <span className="ml-auto text-xs text-gray-500">
              interaction b = {m.interactionEffect.toFixed(3)} (p {m.interactionP < 0.001 ? '< .001' : '= ' + m.interactionP.toFixed(3)})
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <InteractionPlot m={m} />
            <JohnsonNeymanPlot m={m} />
          </div>
        </div>
      ))}
    </div>
  );
}
