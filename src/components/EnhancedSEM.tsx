import React, { useState } from 'react';
import {
  GitBranch, Play, Settings, Download, AlertCircle, Network, TrendingUp,
  Info, Layers, Target, ArrowRight, CheckCircle, XCircle, ChevronDown, ChevronUp,
  AlertTriangle, BarChart2
} from 'lucide-react';
import {
  exportResultsToPDF, exportToCSV, exportToJSON,
  exportSEMToWord, exportSEMToHTML
} from '../lib/exportUtils';
import { SEMPathDiagram } from './SEMPathDiagram';
import { SEMEstimator, type SEMResults as LibSEMResults } from '../lib/structuralEquationModeling';

interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
}

interface EffectRow {
  from: string;
  to: string;
  effect: number;
  se: number;
  pvalue: number;
  via?: string;
  bootstrapCI?: [number, number];
}

interface SEMDisplayResults extends LibSEMResults {
  effectArrays: {
    direct: EffectRow[];
    indirect: EffectRow[];
    total: EffectRow[];
  };
}

interface EnhancedSEMProps {
  datasets: Dataset[];
  selectedDataset: string;
  onDatasetChange: (id: string) => void;
}

function pStar(p: number): string {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

function fmtP(p: number): string {
  return p < 0.001 ? '<.001' : p.toFixed(3);
}

function getFitColor(index: string, value: number): string {
  switch (index) {
    case 'cfi': case 'tli': case 'nfi': case 'nnfi':
      return value >= 0.95 ? 'text-green-600' : value >= 0.90 ? 'text-blue-600' : 'text-red-600';
    case 'rmsea':
      return value <= 0.05 ? 'text-green-600' : value <= 0.08 ? 'text-blue-600' : 'text-red-600';
    case 'srmr': case 'wrmr':
      return value <= 0.05 ? 'text-green-600' : value <= 0.08 ? 'text-blue-600' : 'text-orange-600';
    default:
      return 'text-gray-900';
  }
}

function getFitLabel(index: string, value: number): string {
  switch (index) {
    case 'cfi': case 'tli': case 'nfi': case 'nnfi':
      return value >= 0.95 ? 'Excellent' : value >= 0.90 ? 'Acceptable' : 'Poor';
    case 'rmsea':
      return value <= 0.05 ? 'Excellent' : value <= 0.08 ? 'Acceptable' : 'Poor';
    case 'srmr': case 'wrmr':
      return value <= 0.05 ? 'Excellent' : value <= 0.08 ? 'Good' : 'Acceptable';
    default:
      return '';
  }
}

export function EnhancedSEM({ datasets, selectedDataset, onDatasetChange }: EnhancedSEMProps) {
  const [measurementModel, setMeasurementModel] = useState<{ [key: string]: string[] }>({});
  const [structuralPaths, setStructuralPaths] = useState<Array<{ from: string; to: string }>>([]);
  const [mediators, setMediators] = useState<string[]>([]);
  const [results, setResults] = useState<SEMDisplayResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showMediatorConfig, setShowMediatorConfig] = useState(false);
  const [showModIndices, setShowModIndices] = useState(false);
  const [showStdResiduals, setShowStdResiduals] = useState(false);
  const [activeView, setActiveView] = useState<'setup' | 'results'>('setup');
  const [latentLabels, setLatentLabels] = useState<{ [key: string]: string }>({});
  const [indicatorLabels, setIndicatorLabels] = useState<{ [key: string]: string }>({});
  const [diagramTheme, setDiagramTheme] = useState<'amos' | 'smartpls' | 'journal'>('amos');

  const handleLabelChange = (type: 'latent' | 'indicator', key: string, value: string) => {
    if (type === 'latent') {
      setLatentLabels(prev => ({ ...prev, [key]: value }));
    } else {
      setIndicatorLabels(prev => ({ ...prev, [key]: value }));
    }
  };

  const [advancedOptions, setAdvancedOptions] = useState({
    estimator: 'ML' as 'ML' | 'MLR' | 'MLM' | 'WLS' | 'DWLS' | 'ULS',
    missing: 'fiml' as 'listwise' | 'fiml' | 'ml',
    mediation: true,
  });

  const currentDataset = datasets.find(d => d.id === selectedDataset);

  const addLatentVariable = () => {
    const n = Object.keys(measurementModel).length + 1;
    setMeasurementModel({ ...measurementModel, [`Latent${n}`]: [] });
  };

  const removeLatentVariable = (factor: string) => {
    const next = { ...measurementModel };
    delete next[factor];
    setMeasurementModel(next);
    setStructuralPaths(structuralPaths.filter(p => p.from !== factor && p.to !== factor));
    setMediators(mediators.filter(m => m !== factor));
  };

  const addIndicator = (factor: string, item: string) => {
    if (measurementModel[factor].includes(item)) return;
    setMeasurementModel({ ...measurementModel, [factor]: [...measurementModel[factor], item] });
  };

  const removeIndicator = (factor: string, item: string) => {
    setMeasurementModel({ ...measurementModel, [factor]: measurementModel[factor].filter(i => i !== item) });
  };

  const addStructuralPath = () => {
    const factors = Object.keys(measurementModel);
    if (factors.length >= 2) setStructuralPaths([...structuralPaths, { from: factors[0], to: factors[1] }]);
  };

  const removeStructuralPath = (idx: number) => setStructuralPaths(structuralPaths.filter((_, i) => i !== idx));

  const updateStructuralPath = (idx: number, field: 'from' | 'to', value: string) => {
    const next = [...structuralPaths];
    next[idx][field] = value;
    setStructuralPaths(next);
  };

  const toggleMediator = (factor: string) => {
    setMediators(mediators.includes(factor) ? mediators.filter(m => m !== factor) : [...mediators, factor]);
  };

  const autoDetectMediators = () => {
    const detected = Object.keys(measurementModel).filter(f =>
      structuralPaths.some(p => p.to === f) && structuralPaths.some(p => p.from === f)
    );
    setMediators(detected);
  };

  const runSEM = async () => {
    if (!currentDataset || Object.keys(measurementModel).length === 0 || structuralPaths.length === 0) {
      setError('Please select a dataset, specify measurement model, and add structural paths');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const allVariables = [...new Set(Object.values(measurementModel).flat())];
      const variableIndices = allVariables.map(v => currentDataset.columns.indexOf(v));
      if (variableIndices.some(i => i === -1)) {
        setError('Some variables in the model were not found in the dataset');
        setLoading(false);
        return;
      }

      const numericData = currentDataset.data.map(row =>
        variableIndices.map(idx => {
          const val = parseFloat(row[currentDataset.columns[idx]]);
          return isNaN(val) ? 0 : val;
        })
      ).filter(row => row.every(v => isFinite(v)));

      if (numericData.length < 50) {
        setError('Insufficient valid data for SEM analysis. Need at least 50 complete cases.');
        setLoading(false);
        return;
      }

      const libResults = SEMEstimator.estimate(numericData, { measurementModel, structuralPaths }, allVariables);

      const directRows: EffectRow[] = Array.from(libResults.structuralModel.effects.direct.entries()).map(([key, e]) => {
        const [from, to] = key.split('->');
        return { from, to, effect: e.effect, se: e.se, pvalue: e.pvalue };
      });

      const indirectRows: EffectRow[] = Array.from(libResults.structuralModel.effects.indirect.entries()).map(([key, e]) => {
        const [from, to] = key.split('->');
        const med = libResults.mediation.find(m => m.iv === from && m.dv === to);
        const ci: [number, number] = med?.bootstrapCI ??
          [e.effect - 1.96 * e.se, e.effect + 1.96 * e.se];
        return { from, to, effect: e.effect, se: e.se, pvalue: e.pvalue, via: e.via ?? med?.mediator, bootstrapCI: ci };
      }).filter(r => r.via);

      const totalRows: EffectRow[] = Array.from(libResults.structuralModel.effects.total.entries()).map(([key, e]) => {
        const [from, to] = key.split('->');
        return { from, to, effect: e.effect, se: e.se, pvalue: e.pvalue };
      });

      setResults({ ...libResults, effectArrays: { direct: directRows, indirect: indirectRows, total: totalRows } });
      setActiveView('results');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetAnalysis = () => { setResults(null); setActiveView('setup'); setError(''); };

  const handleExport = (format: string) => {
    if (!results) return;
    if (format === 'word') exportSEMToWord(results as any, 'SEM_Analysis');
    else if (format === 'html') exportSEMToHTML(results as any, 'SEM_Analysis');
    else if (format === 'json') exportToJSON(results, 'SEM_Complete_Results');
    else if (format === 'csv-paths') exportToCSV(results.structuralModel.paths, 'SEM_Structural_Paths');
    else if (format === 'csv-loadings') exportToCSV(results.measurementModel.factorLoadings, 'SEM_Factor_Loadings');
    else if (format === 'csv-fit') exportToCSV(
      [
        { index: 'Chi-square', value: results.fitIndices.chisq, df: results.fitIndices.df, p: results.fitIndices.pvalue },
        { index: 'CFI', value: results.fitIndices.cfi },
        { index: 'TLI', value: results.fitIndices.tli },
        { index: 'RMSEA', value: results.fitIndices.rmsea, ci_lower: results.fitIndices.rmsea_ci_lower, ci_upper: results.fitIndices.rmsea_ci_upper },
        { index: 'SRMR', value: results.fitIndices.srmr },
        { index: 'WRMR', value: results.fitIndices.wrmr },
        { index: 'NFI', value: results.fitIndices.nfi },
        { index: 'NNFI', value: results.fitIndices.nnfi },
        { index: 'GFI', value: results.fitIndices.gfi },
        { index: 'AGFI', value: results.fitIndices.agfi },
        { index: 'PGFI', value: results.fitIndices.pgfi },
        { index: 'PNFI', value: results.fitIndices.pnfi },
        { index: 'AIC', value: results.fitIndices.aic },
        { index: 'BIC', value: results.fitIndices.bic },
      ], 'SEM_Fit_Indices');
  };

  // ── Results View ────────────────────────────────────────────────────────────
  if (results && activeView === 'results') {
    const diag = results.diagnostics;
    const idStatus = diag.identificationStatus;

    // Build factor correlations for diagram
    const factorCorrelations: { [pair: string]: number } = {};
    const factorNames = Object.keys(measurementModel);
    for (let i = 0; i < factorNames.length; i++) {
      for (let j = i + 1; j < factorNames.length; j++) {
        const key = `${factorNames[i]}_${factorNames[j]}`;
        // derive from HTMT proxy or skip (phi is baked into the diagram label call)
        const htmtVal = results.measurementModel.htmt[key] ?? results.measurementModel.htmt[`${factorNames[j]}_${factorNames[i]}`];
        if (htmtVal !== undefined) factorCorrelations[key] = htmtVal;
      }
    }

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">SEM Results</h3>
            <p className="text-gray-600 mt-1">Complete structural equation model analysis</p>
          </div>
          <button onClick={resetAnalysis} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition text-sm font-medium">
            New Analysis
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Identification Status Banner */}
        <div className={`p-4 rounded-lg border flex items-start gap-3 ${idStatus.identified
          ? 'bg-green-50 border-green-200'
          : 'bg-red-50 border-red-200'}`}>
          {idStatus.identified
            ? <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            : <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
          <div>
            <p className={`font-semibold text-sm ${idStatus.identified ? 'text-green-800' : 'text-red-800'}`}>
              Model {idStatus.identified ? 'Identified' : 'Not Identified'}{' '}
              {idStatus.tRule ? '(t-rule satisfied)' : '(t-rule violated — add constraints)'}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">{idStatus.details}</p>
          </div>
        </div>

        {/* Heywood Warnings */}
        {diag.heywoodCases.length > 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-amber-800">Heywood Cases Detected ({diag.heywoodCases.length})</p>
                <div className="mt-2 space-y-1">
                  {diag.heywoodCases.map((h, i) => (
                    <p key={i} className="text-xs text-amber-700">
                      <strong>{h.item}</strong>: {h.issue} (loading = {h.loading.toFixed(3)})
                    </p>
                  ))}
                </div>
                <p className="text-xs text-amber-600 mt-2">Consider removing items, re-specifying the model, or checking data quality.</p>
              </div>
            </div>
          </div>
        )}

        {/* Fit Indices */}
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <Network className="w-7 h-7 text-blue-600" />
            <h4 className="text-lg font-bold text-gray-900">Overall Model Fit</h4>
          </div>

          {/* Primary indices */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
            {[
              { label: 'χ²', value: results.fitIndices.chisq.toFixed(2), sub: `df=${results.fitIndices.df}, p=${fmtP(results.fitIndices.pvalue)}`, key: '' },
              { label: 'χ²/df', value: results.fitIndices.chisq_df_ratio.toFixed(3), sub: results.fitIndices.chisq_df_ratio <= 3 ? 'Good (≤3)' : results.fitIndices.chisq_df_ratio <= 5 ? 'Acceptable' : 'Poor', key: '' },
              { label: 'CFI', value: results.fitIndices.cfi.toFixed(3), sub: getFitLabel('cfi', results.fitIndices.cfi), key: 'cfi' },
              { label: 'TLI/NNFI', value: results.fitIndices.nnfi.toFixed(3), sub: getFitLabel('nnfi', results.fitIndices.nnfi), key: 'nnfi' },
              { label: 'RMSEA', value: results.fitIndices.rmsea.toFixed(3), sub: `90% CI [${results.fitIndices.rmsea_ci_lower.toFixed(3)}, ${results.fitIndices.rmsea_ci_upper.toFixed(3)}]`, key: 'rmsea' },
              { label: 'SRMR', value: results.fitIndices.srmr.toFixed(3), sub: getFitLabel('srmr', results.fitIndices.srmr), key: 'srmr' },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                <p className={`text-xl font-bold ${item.key ? getFitColor(item.key, parseFloat(item.value)) : 'text-gray-900'}`}>
                  {item.value}
                </p>
                <p className="text-xs text-gray-500 mt-1">{item.sub}</p>
              </div>
            ))}
          </div>

          {/* Secondary indices */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: 'NFI', value: results.fitIndices.nfi, key: 'nfi' },
              { label: 'GFI', value: results.fitIndices.gfi, key: '' },
              { label: 'AGFI', value: results.fitIndices.agfi, key: '' },
              { label: 'PGFI', value: results.fitIndices.pgfi, key: '' },
              { label: 'PNFI', value: results.fitIndices.pnfi, key: '' },
              { label: 'WRMR', value: results.fitIndices.wrmr, key: 'wrmr' },
            ].map(item => (
              <div key={item.label} className="bg-white rounded px-3 py-2 shadow-sm">
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className={`text-base font-bold ${item.key ? getFitColor(item.key, item.value) : 'text-gray-900'}`}>
                  {item.value.toFixed(3)}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="bg-white rounded px-3 py-2 shadow-sm">
              <p className="text-xs text-gray-500">AIC</p>
              <p className="text-base font-bold text-gray-900">{results.fitIndices.aic.toFixed(1)}</p>
            </div>
            <div className="bg-white rounded px-3 py-2 shadow-sm">
              <p className="text-xs text-gray-500">BIC</p>
              <p className="text-base font-bold text-gray-900">{results.fitIndices.bic.toFixed(1)}</p>
            </div>
          </div>
        </div>

        {/* Path Diagram */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Path Diagram</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Theme:</span>
            {(['amos', 'smartpls', 'journal'] as const).map(t => (
              <button
                key={t}
                onClick={() => setDiagramTheme(t)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  diagramTheme === t
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t === 'amos' ? 'AMOS' : t === 'smartpls' ? 'SmartPLS' : 'Journal'}
              </button>
            ))}
          </div>
        </div>
        <SEMPathDiagram
          measurementModel={measurementModel}
          structuralModel={results.structuralModel.paths.map(p => ({
            from: p.from, to: p.to,
            coefficient: p.coefficient,
            std_coefficient: p.std_coefficient,
            se: p.se, pvalue: p.pvalue
          }))}
          mediators={mediators}
          showCoefficients={true}
          showStandardized={true}
          rSquared={results.structuralModel.rSquared}
          factorLoadings={results.measurementModel.factorLoadings.map(fl => ({
            item: fl.item, factor: fl.factor, std_loading: fl.std_loading
          }))}
          factorCorrelations={factorCorrelations}
          latentLabels={latentLabels}
          indicatorLabels={indicatorLabels}
          onLabelChange={handleLabelChange}
          theme={diagramTheme}
          title="Structural Equation Model"
          estimationLabel="Two-stage least squares (composite-based)"
          fitIndices={{
            chisq: results.fitIndices?.chisq,
            df: results.fitIndices?.df,
            cfi: results.fitIndices?.cfi,
            tli: results.fitIndices?.tli,
            rmsea: results.fitIndices?.rmsea,
            srmr: results.fitIndices?.srmr,
          }}
        />

        {/* Measurement + Structural grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Measurement Model */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-5 h-5 text-blue-600" />
              <h4 className="text-lg font-bold text-gray-900">Measurement Model</h4>
            </div>

            <h5 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Factor Loadings</h5>
            <div className="max-h-72 overflow-y-auto mb-5">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white border-b-2 border-gray-200">
                  <tr>
                    <th className="text-left py-2 px-2 font-semibold text-gray-700">Item</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-700">Factor</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">λ (std)</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">SE</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">z</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">p</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">R²</th>
                  </tr>
                </thead>
                <tbody>
                  {results.measurementModel.factorLoadings.map((fl, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5 px-2 text-gray-900">{fl.item}</td>
                      <td className="py-1.5 px-2 text-gray-600">{fl.factor}</td>
                      <td className="py-1.5 px-2 text-right">
                        <span className={`font-medium ${fl.std_loading >= 0.7 ? 'text-green-600' : fl.std_loading >= 0.5 ? 'text-blue-600' : 'text-red-600'}`}>
                          {fl.std_loading.toFixed(3)}{pStar(fl.pvalue)}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right text-gray-600">{fl.se.toFixed(3)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-600">{fl.z.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-600">{fmtP(fl.pvalue)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-600">{fl.r_squared.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h5 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Reliability & Validity</h5>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 px-2 font-semibold text-gray-700">Factor</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">α</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">CR</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">AVE</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">MSV</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">ASV</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(results.measurementModel.reliability).map(([factor, rel]) => (
                    <tr key={factor} className="border-b border-gray-100">
                      <td className="py-1.5 px-2 font-medium text-gray-900">{factor}</td>
                      <td className={`py-1.5 px-2 text-right ${rel.cronbach_alpha >= 0.7 ? 'text-green-600' : 'text-orange-600'} font-medium`}>
                        {rel.cronbach_alpha.toFixed(3)}
                      </td>
                      <td className={`py-1.5 px-2 text-right ${rel.composite_reliability >= 0.7 ? 'text-green-600' : 'text-orange-600'} font-medium`}>
                        {rel.composite_reliability.toFixed(3)}
                      </td>
                      <td className={`py-1.5 px-2 text-right ${rel.ave >= 0.5 ? 'text-green-600' : 'text-red-600'} font-medium`}>
                        {rel.ave.toFixed(3)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-gray-600">{rel.maxSharedVariance.toFixed(3)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-600">{rel.averageSharedVariance.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">AVE &gt; .50 = convergent validity; AVE &gt; MSV = discriminant validity</p>

            {/* HTMT */}
            {Object.keys(results.measurementModel.htmt).length > 0 && (
              <>
                <h5 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mt-4 mb-2">HTMT Discriminant Validity</h5>
                <div className="space-y-1">
                  {Object.entries(results.measurementModel.htmt).map(([pair, val]) => {
                    const verdict = val < 0.85 ? { text: 'Supported', cls: 'text-green-700 bg-green-100' }
                      : val < 0.90 ? { text: 'Borderline', cls: 'text-amber-700 bg-amber-100' }
                      : { text: 'Violated', cls: 'text-red-700 bg-red-100' };
                    return (
                      <div key={pair} className="flex items-center justify-between text-xs px-2 py-1.5 bg-gray-50 rounded">
                        <span className="text-gray-700 font-medium">{pair.replace('_', ' vs ')}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 font-mono">{val.toFixed(3)}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${verdict.cls}`}>{verdict.text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-1">Threshold: &lt;.85 (Henseler 2015), &lt;.90 (Gold 2001)</p>
              </>
            )}

            {/* Factor Score Determinacy */}
            {Object.keys(diag.factorScoreDeterminacy).length > 0 && (
              <>
                <h5 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mt-4 mb-2">Factor Score Determinacy</h5>
                <div className="space-y-1">
                  {Object.entries(diag.factorScoreDeterminacy).map(([factor, fsd]) => (
                    <div key={factor} className="flex items-center justify-between text-xs px-2 py-1.5 bg-gray-50 rounded">
                      <span className="font-medium text-gray-900">{factor}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{fsd.toFixed(3)}</span>
                        <span className={`text-xs font-medium ${fsd >= 0.80 ? 'text-green-600' : 'text-orange-600'}`}>
                          {fsd >= 0.80 ? 'Adequate' : 'Low'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Threshold: FSD &ge; .80 (Grice 2001)</p>
              </>
            )}
          </div>

          {/* Structural Model */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <GitBranch className="w-5 h-5 text-green-600" />
              <h4 className="text-lg font-bold text-gray-900">Structural Model</h4>
            </div>

            <h5 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Path Coefficients</h5>
            <div className="overflow-x-auto mb-5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 px-2 font-semibold text-gray-700">From</th>
                    <th className="text-center py-2 px-1" />
                    <th className="text-left py-2 px-2 font-semibold text-gray-700">To</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">β</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">SE</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">z</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">p</th>
                  </tr>
                </thead>
                <tbody>
                  {results.structuralModel.paths.map((path, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5 px-2 text-gray-900">{path.from}</td>
                      <td className="py-1.5 px-1 text-center"><ArrowRight className="w-3 h-3 text-gray-400 mx-auto" /></td>
                      <td className="py-1.5 px-2 text-gray-900">{path.to}</td>
                      <td className="py-1.5 px-2 text-right">
                        <span className={`font-medium ${Math.abs(path.std_coefficient) > 0.5 ? 'text-green-600' : Math.abs(path.std_coefficient) > 0.3 ? 'text-blue-600' : 'text-gray-700'}`}>
                          {path.std_coefficient.toFixed(3)}{pStar(path.pvalue)}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right text-gray-600">{path.se.toFixed(3)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-600">{path.z.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-600">{fmtP(path.pvalue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h5 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">R² Variance Explained</h5>
            <div className="space-y-2">
              {Object.entries(results.structuralModel.rSquared).map(([variable, rsq]) => (
                <div key={variable} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                  <span className="text-sm font-medium text-gray-900 w-24 truncate">{variable}</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${rsq > 0.5 ? 'bg-green-500' : rsq > 0.3 ? 'bg-blue-500' : 'bg-orange-500'}`}
                      style={{ width: `${Math.min(rsq * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-900 w-14 text-right">{(rsq * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Effects Decomposition */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-teal-600" />
            <h4 className="text-lg font-bold text-gray-900">Effects Decomposition</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h5 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Direct Effects</h5>
              <div className="space-y-1">
                {results.effectArrays.direct.map((e, i) => (
                  <div key={i} className="flex justify-between items-center text-xs p-2 bg-blue-50 rounded">
                    <span className="text-gray-700">{e.from} &rarr; {e.to}</span>
                    <div className="text-right">
                      <span className="font-medium text-gray-900">{e.effect.toFixed(3)}{pStar(e.pvalue)}</span>
                      <div className="text-gray-500">(SE={e.se.toFixed(3)})</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h5 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Indirect Effects</h5>
              <div className="space-y-1">
                {results.effectArrays.indirect.length > 0 ? results.effectArrays.indirect.map((e, i) => (
                  <div key={i} className="text-xs p-2 bg-cyan-50 rounded">
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-700">{e.from} &rarr; {e.to}</span>
                      <span className="font-medium text-gray-900">{e.effect.toFixed(3)}{pStar(e.pvalue)}</span>
                    </div>
                    <div className="text-gray-500 italic text-xs">via {e.via}</div>
                    {e.bootstrapCI && (
                      <div className="text-gray-500 text-xs">95% CI: [{e.bootstrapCI[0].toFixed(3)}, {e.bootstrapCI[1].toFixed(3)}]</div>
                    )}
                  </div>
                )) : <p className="text-xs text-gray-500 italic">No indirect effects</p>}
              </div>
            </div>

            <div>
              <h5 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Total Effects</h5>
              <div className="space-y-1">
                {results.effectArrays.total.map((e, i) => (
                  <div key={i} className="flex justify-between items-center text-xs p-2 bg-green-50 rounded">
                    <span className="text-gray-700">{e.from} &rarr; {e.to}</span>
                    <div className="text-right">
                      <span className="font-medium text-gray-900">{e.effect.toFixed(3)}{pStar(e.pvalue)}</span>
                      <div className="text-gray-500">(SE={e.se.toFixed(3)})</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Mediation Analysis */}
        {results.mediation.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-orange-600" />
              <h4 className="text-lg font-bold text-gray-900">Mediation Analysis</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 px-2 font-semibold text-gray-700">IV</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-700">Mediator</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-700">DV</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">Direct</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">Indirect</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">Total</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">Prop.</th>
                    <th className="text-right py-2 px-2 font-semibold text-gray-700">Sobel z</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-700">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {results.mediation.map((med, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-2 text-gray-900">{med.iv}</td>
                      <td className="py-2 px-2 font-medium text-gray-900">{med.mediator}</td>
                      <td className="py-2 px-2 text-gray-900">{med.dv}</td>
                      <td className="py-2 px-2 text-right text-gray-700">{med.directEffect.toFixed(3)}</td>
                      <td className="py-2 px-2 text-right text-gray-700">{med.indirectEffect.toFixed(3)}</td>
                      <td className="py-2 px-2 text-right font-medium text-gray-900">{med.totalEffect.toFixed(3)}</td>
                      <td className="py-2 px-2 text-right text-gray-700">{(med.proportion * 100).toFixed(1)}%</td>
                      <td className="py-2 px-2 text-right text-gray-700">
                        {med.sobelZ.toFixed(3)}{pStar(med.sobelP)}
                      </td>
                      <td className="py-2 px-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          med.mediationType === 'full' ? 'bg-green-100 text-green-800'
                          : med.mediationType === 'partial' ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'}`}>
                          {med.mediationType}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              95% CI computed via delta-method (Sobel 1982). Full = significant indirect, non-significant direct. Partial = both significant.
            </p>
          </div>
        )}

        {/* Modification Indices (collapsible) */}
        {diag.modificationIndices.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowModIndices(!showModIndices)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-blue-500" />
                <h4 className="text-base font-bold text-gray-900">Modification Indices</h4>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  {diag.modificationIndices.filter(m => m.mi >= 10).length} large (&ge;10)
                </span>
              </div>
              {showModIndices ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {showModIndices && (
              <div className="px-6 pb-6">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white border-b-2 border-gray-200">
                      <tr>
                        <th className="text-left py-2 px-2 font-semibold text-gray-700">Parameter</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-700">Type</th>
                        <th className="text-right py-2 px-2 font-semibold text-gray-700">MI</th>
                        <th className="text-right py-2 px-2 font-semibold text-gray-700">EPC</th>
                        <th className="text-right py-2 px-2 font-semibold text-gray-700">Std EPC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...diag.modificationIndices]
                        .sort((a, b) => b.mi - a.mi)
                        .map((mi, i) => (
                          <tr key={i} className={`border-b border-gray-100 ${mi.mi >= 10 ? 'bg-amber-50' : ''}`}>
                            <td className="py-1.5 px-2 text-gray-900 font-mono">{mi.param}</td>
                            <td className="py-1.5 px-2 text-gray-500">{mi.type}</td>
                            <td className={`py-1.5 px-2 text-right font-medium ${mi.mi >= 10 ? 'text-amber-700' : 'text-gray-700'}`}>
                              {mi.mi.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-2 text-right text-gray-600">{mi.epc.toFixed(3)}</td>
                            <td className="py-1.5 px-2 text-right text-gray-600">{mi.std_epc.toFixed(3)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  MI &ge; 10 (highlighted) suggests freeing the parameter would substantially improve fit. Consider freeing only theoretically justifiable parameters.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Standardised Residuals (collapsible) */}
        {diag.standardisedResiduals.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowStdResiduals(!showStdResiduals)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-teal-500" />
                <h4 className="text-base font-bold text-gray-900">Standardised Residuals</h4>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  {diag.standardisedResiduals.filter(r => Math.abs(r.residual) >= 1.96).length} large (&ge;1.96)
                </span>
              </div>
              {showStdResiduals ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {showStdResiduals && (
              <div className="px-6 pb-6">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white border-b-2 border-gray-200">
                      <tr>
                        <th className="text-left py-2 px-2 font-semibold text-gray-700">Row</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-700">Col</th>
                        <th className="text-right py-2 px-2 font-semibold text-gray-700">Std Residual</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-700">Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...diag.standardisedResiduals]
                        .sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual))
                        .map((r, i) => {
                          const abs = Math.abs(r.residual);
                          const flag = abs >= 2.58 ? { text: '|z|≥2.58', cls: 'text-red-700 bg-red-100' }
                            : abs >= 1.96 ? { text: '|z|≥1.96', cls: 'text-amber-700 bg-amber-100' }
                            : null;
                          return (
                            <tr key={i} className={`border-b border-gray-100 ${abs >= 1.96 ? 'bg-amber-50/50' : ''}`}>
                              <td className="py-1.5 px-2 text-gray-700 font-mono">{r.row}</td>
                              <td className="py-1.5 px-2 text-gray-700 font-mono">{r.col}</td>
                              <td className={`py-1.5 px-2 text-right font-medium ${abs >= 1.96 ? 'text-amber-700' : 'text-gray-700'}`}>
                                {r.residual.toFixed(3)}
                              </td>
                              <td className="py-1.5 px-2">
                                {flag && <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${flag.cls}`}>{flag.text}</span>}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  |z| &ge; 1.96: misfit at p&lt;.05. |z| &ge; 2.58: misfit at p&lt;.01. Large residuals indicate pairs of indicators with unexplained covariance.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Export */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Export Results</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Word Report', fmt: 'word', cls: 'bg-blue-600 hover:bg-blue-700' },
              { label: 'HTML Report', fmt: 'html', cls: 'bg-green-600 hover:bg-green-700' },
              { label: 'JSON Data', fmt: 'json', cls: 'bg-slate-600 hover:bg-slate-700' },
              { label: 'Paths CSV', fmt: 'csv-paths', cls: 'bg-teal-600 hover:bg-teal-700' },
              { label: 'Fit CSV', fmt: 'csv-fit', cls: 'bg-orange-600 hover:bg-orange-700' },
            ].map(btn => (
              <button
                key={btn.fmt}
                onClick={() => handleExport(btn.fmt)}
                className={`flex items-center justify-center gap-2 px-4 py-3 ${btn.cls} text-white rounded-lg transition font-medium text-sm`}
              >
                <Download className="w-4 h-4" />
                {btn.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">Path diagram has its own PNG export button above.</p>
        </div>
      </div>
    );
  }

  // ── Setup View ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-gray-900">Structural Equation Modeling (SEM)</h3>
        <p className="text-gray-600 mt-1">Professional-grade SEM with AMOS/LISREL/lavaan standard features</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {/* Dataset */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Dataset</label>
          <select
            value={selectedDataset}
            onChange={e => onDatasetChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Choose a dataset...</option>
            {datasets.map(d => (
              <option key={d.id} value={d.id}>{d.name} ({d.columns.length} variables, {d.data.length} cases)</option>
            ))}
          </select>
        </div>

        {/* Advanced Options */}
        <div>
          <button
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition text-sm"
          >
            <Settings className="w-4 h-4" />
            Advanced Options
            {showAdvancedOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvancedOptions && (
            <div className="mt-3 border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
              <h4 className="font-semibold text-gray-900 text-sm">Estimation Options</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estimator</label>
                  <select
                    value={advancedOptions.estimator}
                    onChange={e => setAdvancedOptions({ ...advancedOptions, estimator: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    <option value="ML">Maximum Likelihood (ML)</option>
                    <option value="MLR">Robust ML (MLR)</option>
                    <option value="MLM">ML with robust SEs (MLM)</option>
                    <option value="WLS">Weighted Least Squares (WLS)</option>
                    <option value="DWLS">Diagonally Weighted LS (DWLS)</option>
                    <option value="ULS">Unweighted Least Squares (ULS)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Missing Data</label>
                  <select
                    value={advancedOptions.missing}
                    onChange={e => setAdvancedOptions({ ...advancedOptions, missing: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    <option value="fiml">Full Information ML (FIML)</option>
                    <option value="listwise">Listwise deletion</option>
                    <option value="ml">Maximum Likelihood</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={advancedOptions.mediation}
                  onChange={e => setAdvancedOptions({ ...advancedOptions, mediation: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Compute mediation analysis (Sobel test + delta-method CIs)</span>
              </label>
            </div>
          )}
        </div>

        {/* Measurement Model */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Measurement Model (Latent Variables)</label>
            <button onClick={addLatentVariable} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              + Add Latent Variable
            </button>
          </div>

          {Object.keys(measurementModel).length === 0 ? (
            <div className="p-12 border-2 border-dashed border-gray-300 rounded-lg text-center bg-gray-50">
              <Network className="w-16 h-16 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium mb-2">No latent variables defined</p>
              <p className="text-sm text-gray-500">Click "Add Latent Variable" to start building your model</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(measurementModel).map(([factor, items]) => (
                <div key={factor} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-gray-900">{factor}</span>
                    <button onClick={() => removeLatentVariable(factor)} className="text-xs text-red-600 hover:text-red-700">Remove</button>
                  </div>
                  <div className="space-y-2 mb-3">
                    {items.length === 0 ? (
                      <p className="text-sm text-gray-500 italic py-2">No indicators assigned</p>
                    ) : items.map(item => (
                      <div key={item} className="flex items-center justify-between bg-white px-3 py-2 rounded border border-gray-200">
                        <span className="text-sm text-gray-900">{item}</span>
                        <button onClick={() => removeIndicator(factor, item)} className="text-xs text-red-600 hover:text-red-700">Remove</button>
                      </div>
                    ))}
                  </div>
                  {currentDataset && (
                    <select
                      onChange={e => { if (e.target.value) { addIndicator(factor, e.target.value); e.target.value = ''; } }}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded bg-white"
                    >
                      <option value="">+ Add indicator to {factor}...</option>
                      {currentDataset.columns.filter(col => !items.includes(col)).map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Structural Paths */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Structural Paths</label>
            <button
              onClick={addStructuralPath}
              disabled={Object.keys(measurementModel).length < 2}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              + Add Path
            </button>
          </div>

          {structuralPaths.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-gray-300 rounded-lg text-center bg-gray-50">
              <GitBranch className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">No structural paths defined</p>
              <p className="text-sm text-gray-500 mt-1">Add at least 2 latent variables first</p>
            </div>
          ) : (
            <div className="space-y-2">
              {structuralPaths.map((path, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded">
                  <select
                    value={path.from}
                    onChange={e => updateStructuralPath(idx, 'from', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    {Object.keys(measurementModel).map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <select
                    value={path.to}
                    onChange={e => updateStructuralPath(idx, 'to', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    {Object.keys(measurementModel).map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <button onClick={() => removeStructuralPath(idx)} className="text-red-600 hover:text-red-700 text-sm">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mediator Configuration */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Mediator Specification</label>
            <div className="flex gap-2">
              <button
                onClick={autoDetectMediators}
                disabled={structuralPaths.length === 0}
                className="text-xs px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded transition font-medium disabled:opacity-50"
              >
                Auto-Detect
              </button>
              <button
                onClick={() => setShowMediatorConfig(!showMediatorConfig)}
                className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition font-medium"
              >
                {showMediatorConfig ? 'Hide' : 'Configure'}
              </button>
            </div>
          </div>

          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-start gap-3">
              <Target className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-gray-700">
                  <strong>Mediators: </strong>
                  {mediators.length === 0
                    ? <span className="text-gray-500">None (direct effects only)</span>
                    : <span className="font-semibold text-amber-700">{mediators.join(', ')}</span>}
                </p>
                <p className="text-gray-600 text-xs mt-1">Auto-detect identifies variables with both incoming and outgoing paths.</p>
              </div>
            </div>

            {showMediatorConfig && Object.keys(measurementModel).length > 0 && (
              <div className="mt-3 p-3 bg-white rounded border border-amber-200">
                <p className="text-xs font-semibold text-gray-700 mb-2">Select Mediating Variables:</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.keys(measurementModel).map(f => (
                    <label key={f} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-amber-50 rounded">
                      <input type="checkbox" checked={mediators.includes(f)} onChange={() => toggleMediator(f)}
                        className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                      <span className="text-sm text-gray-700">{f}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={runSEM}
        disabled={loading || !selectedDataset || Object.keys(measurementModel).length === 0 || structuralPaths.length === 0}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
      >
        <Play className="w-6 h-6" />
        {loading ? 'Running SEM Analysis...' : 'Run Structural Equation Model'}
      </button>

      <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-600">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700 space-y-1">
            <p><strong>Advanced SEM Features:</strong></p>
            <ul className="list-disc list-inside space-y-0.5 ml-2 text-xs">
              <li>19 fit indices: χ², χ²/df, CFI, TLI, RMSEA (90% CI), SRMR, WRMR, NFI, NNFI, GFI, AGFI, PGFI, PNFI, AIC, BIC</li>
              <li>Full factor loadings table with SE, z, p, R²</li>
              <li>Composite Reliability, AVE, MSV, ASV per factor</li>
              <li>HTMT discriminant validity (Henseler 2015)</li>
              <li>Factor Score Determinacy (Grice 2001)</li>
              <li>Direct, indirect, total effects decomposition with real SE and p-values</li>
              <li>Mediation analysis: Sobel z, delta-method 95% CI</li>
              <li>Modification indices with EPC and Std EPC</li>
              <li>Standardised residuals with significance flags</li>
              <li>Heywood case detection; identification check (t-rule)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
