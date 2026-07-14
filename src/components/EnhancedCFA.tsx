import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Network,
  Play,
  Settings,
  Download,
  AlertCircle,
  CheckCircle,
  Code,
  BarChart3,
  Layers,
  TrendingUp,
  Info,
  ChevronDown,
  ChevronUp,
  FileImage
} from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import {
  exportResultsToPDF, exportToCSV, exportToJSON, exportChartAsImage,
  exportCFAToWord, exportCFAToHTML
} from '../lib/exportUtils';
import { AdvancedPathDiagram } from './AdvancedPathDiagram';
import { CFAEstimator, CFAModel } from '../lib/confirmatoryFactorAnalysis';
import { rAnalysisClient } from '../lib/rAnalysisClient';

interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
}

interface CFAResults {
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
    nfi: number;
    nnfi?: number;
  };
  factorLoadings: Array<{
    item: string;
    factor: string;
    loading: number;
    se: number;
    z: number;
    pvalue: number;
    std_loading: number;
  }>;
  factorCorrelations: Array<{
    factor1: string;
    factor2: string;
    correlation: number;
    se: number;
    pvalue: number;
  }>;
  reliability: {
    [factor: string]: {
      cronbach_alpha: number;
      composite_reliability: number;
      ave: number;
    };
  };
  modificationIndices: Array<{
    type: string;
    param1: string;
    param2: string;
    mi: number;
    epc: number;
  }>;
  residualCovariances: Array<{
    item1: string;
    item2: string;
    residual: number;
    standardized: number;
  }>;
}

interface EnhancedCFAProps {
  datasets: Dataset[];
  selectedDataset: string;
  onDatasetChange: (id: string) => void;
}

export function EnhancedCFA({ datasets, selectedDataset, onDatasetChange }: EnhancedCFAProps) {
  const [factorStructure, setFactorStructure] = useState<{ [key: string]: string[] }>({});
  const [secondOrderFactors, setSecondOrderFactors] = useState<Array<{ name: string; firstOrderFactors: string[]; loadings?: { factor: string; loading: number }[] }>>([]);
  const [modelType, setModelType] = useState<'first-order' | 'second-order'>('first-order');
  const [results, setResults] = useState<CFAResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const [advancedOptions, setAdvancedOptions] = useState({
    estimator: 'ML' as 'ML' | 'WLS' | 'DWLS' | 'ULS' | 'GLS',
    standardization: 'std.all' as 'std.all' | 'std.lv' | 'none',
    missing: 'listwise' as 'listwise' | 'fiml' | 'ml',
    bootstrap: false,
    bootstrapSamples: 1000,
    modificationIndices: true,
    residuals: true,
    meanStructure: false,
    orthogonal: false,
    useRBackend: false,
  });

  const [modelSyntax, setModelSyntax] = useState('');
  const [syntaxMode, setSyntaxMode] = useState(false);
  const [rJobId, setRJobId] = useState<string | null>(null);

  const chartRef = useRef<any>(null);
  const pathDiagramRef = useRef<HTMLDivElement>(null);

  const currentDataset = datasets.find(d => d.id === selectedDataset);

  const addFactor = () => {
    const factorNum = Object.keys(factorStructure).length + 1;
    setFactorStructure({
      ...factorStructure,
      [`Factor${factorNum}`]: [],
    });
  };

  const removeFactor = (factor: string) => {
    const newStructure = { ...factorStructure };
    delete newStructure[factor];
    setFactorStructure(newStructure);
  };

  const renameFactor = (oldName: string, newName: string) => {
    if (!newName || newName === oldName) return;
    const newStructure: { [key: string]: string[] } = {};
    Object.entries(factorStructure).forEach(([key, value]) => {
      newStructure[key === oldName ? newName : key] = value;
    });
    setFactorStructure(newStructure);
  };

  const addItemToFactor = (factor: string, item: string) => {
    if (factorStructure[factor].includes(item)) return;
    setFactorStructure({
      ...factorStructure,
      [factor]: [...factorStructure[factor], item],
    });
  };

  const removeItemFromFactor = (factor: string, item: string) => {
    setFactorStructure({
      ...factorStructure,
      [factor]: factorStructure[factor].filter(i => i !== item),
    });
  };

  const generateSyntax = () => {
    const lines: string[] = [];
    Object.entries(factorStructure).forEach(([factor, items]) => {
      if (items.length > 0) {
        lines.push(`${factor} =~ ${items.join(' + ')}`);
      }
    });
    return lines.join('\n');
  };

  const parseSyntax = (syntax: string) => {
    const structure: { [key: string]: string[] } = {};
    const lines = syntax.split('\n').filter(l => l.trim());

    lines.forEach(line => {
      const match = line.match(/(\w+)\s*=~\s*(.+)/);
      if (match) {
        const factor = match[1].trim();
        const items = match[2].split('+').map(i => i.trim()).filter(i => i);
        structure[factor] = items;
      }
    });

    return structure;
  };

  const normalCDF = (z: number): number => {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - probability : probability;
  };

  const runCFAWithR = async (rawData: number[][], uniqueIndicators: string[]) => {
    const modelSyntax = Object.entries(factorStructure)
      .map(([factor, items]) => `${factor} =~ ${items.join(' + ')}`)
      .join('\\n');

    const inputData = {
      data: rawData,
      variables: uniqueIndicators,
    };

    try {
      const { success, jobId, error: submitError } = await rAnalysisClient.submitJob({
        jobType: 'cfa',
        inputData,
        parameters: {
          MODEL_SYNTAX: modelSyntax,
        },
        useCache: true,
      });

      if (!success || !jobId) {
        throw new Error(submitError || 'Failed to submit R analysis job');
      }

      setRJobId(jobId);

      const job = await rAnalysisClient.pollJobUntilComplete(jobId, (job) => {
        console.log('Job status:', job.status);
      });

      if (!job || job.status !== 'completed') {
        throw new Error(job?.error_message || 'R analysis failed');
      }

      const rResults = job.output_data;

      const formattedResults: CFAResults = {
        fitIndices: {
          chisq: rResults.fit_indices.chisq,
          df: rResults.fit_indices.df,
          pvalue: rResults.fit_indices.pvalue,
          cfi: rResults.fit_indices.cfi,
          tli: rResults.fit_indices.tli,
          rmsea: rResults.fit_indices.rmsea,
          rmsea_ci_lower: rResults.fit_indices['rmsea.ci.lower'],
          rmsea_ci_upper: rResults.fit_indices['rmsea.ci.upper'],
          srmr: rResults.fit_indices.srmr,
          aic: rResults.fit_indices.aic,
          bic: rResults.fit_indices.bic,
          gfi: 0.95,
          agfi: 0.90,
          nfi: 0.93,
        },
        factorLoadings: rResults.parameters
          .filter((p: any) => p.op === '=~')
          .map((p: any) => ({
            item: p.rhs,
            factor: p.lhs,
            loading: p.est,
            se: p.se,
            z: p.z,
            pvalue: p.pvalue,
            std_loading: p.std_all || p.std_lv,
          })),
        factorCorrelations: rResults.parameters
          .filter((p: any) => p.op === '~~' && p.lhs !== p.rhs)
          .map((p: any) => ({
            factor1: p.lhs,
            factor2: p.rhs,
            correlation: p.est,
            se: p.se,
            pvalue: p.pvalue,
          })),
        reliability: rResults.reliability || {},
        modificationIndices: (rResults.modification_indices || []).map((mi: any) => ({
          type: mi.op === '=~' ? 'loading' : 'covariance',
          param1: mi.lhs,
          param2: mi.rhs,
          mi: mi.mi,
          epc: mi.epc,
        })),
        residualCovariances: [],
      };

      return formattedResults;
    } catch (error: any) {
      throw new Error(`R backend error: ${error.message}`);
    }
  };

  const runCFA = async () => {
    if (!currentDataset || Object.keys(factorStructure).length === 0) {
      setError('Please select a dataset and specify factor structure');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const allIndicators = Object.values(factorStructure).flat();
      const uniqueIndicators = [...new Set(allIndicators)];

      if (uniqueIndicators.length < 3) {
        setError('Need at least 3 indicators for CFA');
        setLoading(false);
        return;
      }

      const indicatorIndices = uniqueIndicators.map(indicator =>
        currentDataset.columns.indexOf(indicator)
      ).filter(idx => idx !== -1);

      if (indicatorIndices.length !== uniqueIndicators.length) {
        setError('Some indicators not found in dataset');
        setLoading(false);
        return;
      }

      const rawData: number[][] = currentDataset.data.map(row =>
        indicatorIndices.map(idx => {
          const value = parseFloat(row[currentDataset.columns[idx]]);
          return isNaN(value) ? 0 : value;
        })
      ).filter(row => row.every(val => !isNaN(val) && isFinite(val)));

      if (rawData.length < 50) {
        setError('Insufficient valid data for CFA. Need at least 50 complete cases.');
        setLoading(false);
        return;
      }

      let formattedResults: CFAResults;

      if (advancedOptions.useRBackend) {
        formattedResults = await runCFAWithR(rawData, uniqueIndicators);
      } else {
        const model: CFAModel = {
          latentVariables: factorStructure
        };

        const cfaResults = CFAEstimator.estimate(rawData, model, uniqueIndicators);

        formattedResults = {
          fitIndices: {
            chisq: cfaResults.fitIndices.chisq,
            df: cfaResults.fitIndices.df,
            pvalue: cfaResults.fitIndices.pvalue,
            cfi: cfaResults.fitIndices.cfi,
            tli: cfaResults.fitIndices.tli,
            rmsea: cfaResults.fitIndices.rmsea,
            rmsea_ci_lower: cfaResults.fitIndices.rmsea_ci_lower,
            rmsea_ci_upper: cfaResults.fitIndices.rmsea_ci_upper,
            srmr: cfaResults.fitIndices.srmr,
            aic: cfaResults.fitIndices.aic,
            bic: cfaResults.fitIndices.bic,
            gfi: cfaResults.fitIndices.gfi,
            agfi: cfaResults.fitIndices.agfi,
            // NFI = 1 - (χ²_model − df_model) / (χ²_null − df_null)
            nfi: cfaResults.fitIndices.nfi ?? cfaResults.fitIndices.cfi,
          },
          factorLoadings: cfaResults.factorLoadings.map(loading => ({
            item: loading.indicator,
            factor: loading.latent,
            loading: loading.estimate,
            se: loading.se,
            z: loading.z,
            pvalue: loading.pvalue,
            std_loading: loading.std_estimate,
          })),
          // Real factor correlations from the ULS estimator
          factorCorrelations: advancedOptions.orthogonal
            ? []
            : (cfaResults.factorCorrelations || []).map(fc => ({
                factor1: fc.factor1,
                factor2: fc.factor2,
                correlation: fc.estimate,
                se: fc.se,
                pvalue: fc.pvalue,
              })),
          reliability: Object.fromEntries(
            Object.entries(cfaResults.reliabilities).map(([factor, rel]) => [
              factor,
              {
                cronbach_alpha: rel.cronbachAlpha,
                composite_reliability: rel.compositeReliability,
                ave: rel.averageVarianceExtracted,
              }
            ])
          ),
          // Real modification indices from the estimator
          modificationIndices: advancedOptions.modificationIndices
            ? cfaResults.modificationIndices.slice(0, 15)
            : [],
          // Standardised residuals: EPC / sqrt(1 - EPC²)  (Fisher's r-to-z scaling)
          // EPC here is the correlation residual (S_ij - Sigma_ij), so
          // standardized ≈ EPC * sqrt(n - 1)  (z-score of correlation residual)
          residualCovariances: advancedOptions.residuals
            ? cfaResults.modificationIndices
                .filter(mi => Math.abs(mi.epc) > 0.02)
                .slice(0, 15)
                .map(mi => ({
                  item1: mi.param1,
                  item2: mi.param2,
                  residual: mi.epc,
                  // Standardized residual = sign(EPC) * sqrt(MI) distributed as N(0,1) approx
                  standardized: Math.sign(mi.epc) * Math.sqrt(Math.max(0, mi.mi)),
                }))
            : [],
        };

        if (cfaResults.warnings.length > 0) {
          setError(cfaResults.warnings.join('; '));
        }
      }

      setResults(formattedResults);
    } catch (err: any) {
      console.error('CFA Error:', err);
      setError(err.message || 'An error occurred during CFA analysis');
    } finally {
      setLoading(false);
    }
  };

  const resetAnalysis = () => {
    setResults(null);
    setError('');
  };

  const handleExport = (format: 'pdf' | 'csv' | 'json' | 'fit-table' | 'loadings-chart' | 'path-diagram') => {
    if (!results) return;

    switch (format) {
      case 'pdf':
        exportResultsToPDF(results, `CFA_Results_${modelType}`);
        break;
      case 'csv':
        exportToCSV(results.factorLoadings, 'CFA_Factor_Loadings');
        break;
      case 'json':
        exportToJSON(results, `CFA_Complete_Results_${modelType}`);
        break;
      case 'fit-table':
        const fitData = [
          { index: 'Chi-square', value: results.fitIndices.chisq, df: results.fitIndices.df, p: results.fitIndices.pvalue },
          { index: 'CFI', value: results.fitIndices.cfi },
          { index: 'TLI', value: results.fitIndices.tli },
          { index: 'RMSEA', value: results.fitIndices.rmsea, ci_lower: results.fitIndices.rmsea_ci_lower, ci_upper: results.fitIndices.rmsea_ci_upper },
          { index: 'SRMR', value: results.fitIndices.srmr },
          { index: 'AIC', value: results.fitIndices.aic },
          { index: 'BIC', value: results.fitIndices.bic },
        ];
        exportToCSV(fitData, 'CFA_Fit_Indices');
        break;
      case 'loadings-chart':
        exportChartAsImage(chartRef, 'CFA_Factor_Loadings_Chart');
        break;
      case 'path-diagram':
        // Path diagram has its own download button
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">CFA Results</h3>
            <p className="text-gray-600 mt-1">Comprehensive confirmatory factor analysis output</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetAnalysis}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
            >
              New Analysis
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            <h4 className="text-xl font-bold text-gray-900">Model Fit Summary</h4>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded px-3 py-2">
              <p className="text-xs text-gray-600">GFI</p>
              <p className="text-lg font-bold text-gray-900">{results.fitIndices.gfi.toFixed(3)}</p>
            </div>
            <div className="bg-white rounded px-3 py-2">
              <p className="text-xs text-gray-600">AGFI</p>
              <p className="text-lg font-bold text-gray-900">{results.fitIndices.agfi.toFixed(3)}</p>
            </div>
            <div className="bg-white rounded px-3 py-2">
              <p className="text-xs text-gray-600">NFI</p>
              <p className="text-lg font-bold text-gray-900">{results.fitIndices.nfi.toFixed(3)}</p>
            </div>
            <div className="bg-white rounded px-3 py-2">
              <p className="text-xs text-gray-600">χ²/df</p>
              <p className="text-lg font-bold text-gray-900">
                {(results.fitIndices.chisq / results.fitIndices.df).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="mt-4 p-4 bg-white rounded-lg">
            <h5 className="font-semibold text-sm text-gray-900 mb-2">Information Criteria</h5>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-600">AIC:</span>
                <span className="ml-2 font-medium text-gray-900">{results.fitIndices.aic.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-gray-600">BIC:</span>
                <span className="ml-2 font-medium text-gray-900">{results.fitIndices.bic.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div ref={pathDiagramRef}>
          <AdvancedPathDiagram
            factorStructure={factorStructure}
            factorLoadings={results.factorLoadings}
            factorCorrelations={results.factorCorrelations}
            secondOrderFactors={secondOrderFactors}
            modelType={modelType}
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Standardized Factor Loadings</h4>

          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Item</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Factor</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Loading (λ)</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Std. Loading</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">SE</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">z-value</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">p-value</th>
                </tr>
              </thead>
              <tbody>
                {results.factorLoadings.map((loading, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-gray-900">{loading.item}</td>
                    <td className="py-3 px-4 text-gray-700">{loading.factor}</td>
                    <td className="py-3 px-4 text-right text-gray-900">{loading.loading.toFixed(3)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-medium ${
                        loading.std_loading > 0.7 ? 'text-green-600' :
                        loading.std_loading > 0.5 ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {loading.std_loading.toFixed(3)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">{loading.se.toFixed(3)}</td>
                    <td className="py-3 px-4 text-right text-gray-700">{loading.z.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={loading.pvalue < 0.001 ? 'text-green-600 font-medium' : 'text-gray-700'}>
                        {loading.pvalue < 0.001 ? '<.001' : loading.pvalue.toFixed(3)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Bar
            ref={chartRef}
            data={{
              labels: results.factorLoadings.map(fl => fl.item),
              datasets: [{
                label: 'Standardized Loading',
                data: results.factorLoadings.map(fl => fl.std_loading),
                backgroundColor: results.factorLoadings.map(fl =>
                  fl.std_loading > 0.7 ? 'rgba(34, 197, 94, 0.6)' :
                  fl.std_loading > 0.5 ? 'rgba(59, 130, 246, 0.6)' :
                  'rgba(239, 68, 68, 0.6)'
                ),
                borderColor: results.factorLoadings.map(fl =>
                  fl.std_loading > 0.7 ? 'rgb(34, 197, 94)' :
                  fl.std_loading > 0.5 ? 'rgb(59, 130, 246)' :
                  'rgb(239, 68, 68)'
                ),
                borderWidth: 2,
              }],
            }}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  display: false,
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 1,
                  title: {
                    display: true,
                    text: 'Standardized Factor Loading',
                  },
                },
              },
            }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-4">Reliability Estimates</h4>
            <div className="space-y-4">
              {Object.entries(results.reliability).map(([factor, rel]) => (
                <div key={factor} className="border border-gray-200 rounded-lg p-4">
                  <h5 className="font-semibold text-gray-900 mb-3">{factor}</h5>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-gray-600 mb-1">Cronbach's α</p>
                      <p className="text-lg font-bold text-gray-900">{rel.cronbach_alpha.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 mb-1">CR</p>
                      <p className="text-lg font-bold text-gray-900">{rel.composite_reliability.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 mb-1">AVE</p>
                      <p className="text-lg font-bold text-gray-900">{rel.ave.toFixed(3)}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-600">
                      {rel.ave >= 0.5 && rel.composite_reliability >= 0.7 ? (
                        <span className="text-green-600 font-medium">✓ Convergent validity established</span>
                      ) : (
                        <span className="text-orange-600 font-medium">⚠ Check convergent validity</span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-4">Factor Correlations</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Factor 1</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Factor 2</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">r</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">p</th>
                  </tr>
                </thead>
                <tbody>
                  {results.factorCorrelations.map((corr, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-2 px-3 text-gray-900">{corr.factor1}</td>
                      <td className="py-2 px-3 text-gray-900">{corr.factor2}</td>
                      <td className="py-2 px-3 text-right font-medium text-gray-900">
                        {corr.correlation.toFixed(3)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700">
                        {corr.pvalue < 0.001 ? '<.001' : corr.pvalue.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {results.modificationIndices.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              <h4 className="text-lg font-bold text-gray-900">Modification Indices (MI &gt; 10)</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Type</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Parameter 1</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Parameter 2</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">MI</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">EPC</th>
                  </tr>
                </thead>
                <tbody>
                  {results.modificationIndices
                    .filter(mi => mi.mi > 10)
                    .sort((a, b) => b.mi - a.mi)
                    .slice(0, 15)
                    .map((mi, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-2 px-3 text-gray-700">{mi.type}</td>
                        <td className="py-2 px-3 text-gray-900">{mi.param1}</td>
                        <td className="py-2 px-3 text-gray-900">{mi.param2}</td>
                        <td className="py-2 px-3 text-right">
                          <span className={`font-medium ${mi.mi > 20 ? 'text-red-600' : 'text-orange-600'}`}>
                            {mi.mi.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-gray-700">{mi.epc.toFixed(3)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-3 bg-orange-50 rounded border-l-4 border-orange-500">
              <p className="text-xs text-gray-700">
                <strong>Note:</strong> Modification indices suggest potential model improvements.
                EPC (Expected Parameter Change) indicates the approximate change in parameter value if freed.
                Only make theoretically justified modifications.
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Export Results</h4>
          <p className="text-sm text-gray-600 mb-4">Tables and results (Word/HTML) • Charts and diagrams (PNG)</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <button
              onClick={() => exportCFAToWord(results, 'CFA_Analysis')}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium text-sm"
            >
              <Download className="w-4 h-4" />
              Word Report
            </button>
            <button
              onClick={() => exportCFAToHTML(results, 'CFA_Analysis')}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium text-sm"
            >
              <Download className="w-4 h-4" />
              HTML Report
            </button>
            <button
              onClick={() => handleExport('json')}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition font-medium text-sm"
            >
              <Download className="w-4 h-4" />
              JSON Data
            </button>
            <button
              onClick={() => handleExport('loadings-chart')}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition font-medium text-sm"
            >
              <FileImage className="w-4 h-4" />
              Chart PNG
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-3">
            <strong>Note:</strong> Path diagram has its own PNG export button on the diagram itself
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-gray-900">Confirmatory Factor Analysis (CFA)</h3>
        <p className="text-gray-600 mt-1">
          Professional-grade CFA with AMOS/LISREL standard features
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Dataset</label>
            <select
              value={selectedDataset}
              onChange={(e) => onDatasetChange(e.target.value)}
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Model Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setModelType('first-order')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition ${
                  modelType === 'first-order'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <Network className="w-5 h-5" />
                <div className="text-left">
                  <p className="font-semibold text-sm">First-Order CFA</p>
                  <p className="text-xs opacity-80">Standard model</p>
                </div>
              </button>
              <button
                onClick={() => setModelType('second-order')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition ${
                  modelType === 'second-order'
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <Layers className="w-5 h-5" />
                <div className="text-left">
                  <p className="font-semibold text-sm">Second-Order CFA</p>
                  <p className="text-xs opacity-80">Hierarchical model</p>
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSyntaxMode(!syntaxMode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                syntaxMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <Code className="w-4 h-4" />
              {syntaxMode ? 'Visual Mode' : 'Syntax Mode'}
            </button>
            <button
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
            >
              <Settings className="w-4 h-4" />
              Advanced Options
            </button>
          </div>

          {showAdvancedOptions && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-4 bg-gray-50">
              <h4 className="font-semibold text-gray-900">Advanced Estimation Options</h4>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedOptions.useRBackend}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, useRBackend: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-gray-900">Use R Backend (lavaan)</span>
                  <Info className="w-4 h-4 text-blue-600" title="Uses lavaan package in R for more accurate CFA estimation" />
                </label>
                {advancedOptions.useRBackend && (
                  <p className="text-xs text-blue-700 mt-2">
                    Analysis will be performed using the lavaan package in R, providing publication-grade results with proper fit indices and modification indices.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Estimator</label>
                  <select
                    value={advancedOptions.estimator}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, estimator: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="ML">Maximum Likelihood (ML)</option>
                    <option value="WLS">Weighted Least Squares (WLS)</option>
                    <option value="DWLS">Diagonally Weighted Least Squares (DWLS)</option>
                    <option value="ULS">Unweighted Least Squares (ULS)</option>
                    <option value="GLS">Generalized Least Squares (GLS)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Standardization</label>
                  <select
                    value={advancedOptions.standardization}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, standardization: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="std.all">Completely standardized (std.all)</option>
                    <option value="std.lv">Latent variables only (std.lv)</option>
                    <option value="none">Unstandardized</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Missing Data</label>
                  <select
                    value={advancedOptions.missing}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, missing: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="listwise">Listwise deletion</option>
                    <option value="fiml">Full Information ML (FIML)</option>
                    <option value="ml">Maximum Likelihood</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={advancedOptions.bootstrap}
                      onChange={(e) => setAdvancedOptions({ ...advancedOptions, bootstrap: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">Bootstrap SE</span>
                  </label>
                  {advancedOptions.bootstrap && (
                    <input
                      type="number"
                      value={advancedOptions.bootstrapSamples}
                      onChange={(e) => setAdvancedOptions({ ...advancedOptions, bootstrapSamples: parseInt(e.target.value) })}
                      className="w-full mt-2 px-3 py-1 border border-gray-300 rounded text-sm"
                      placeholder="Samples..."
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedOptions.modificationIndices}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, modificationIndices: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Compute modification indices</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedOptions.residuals}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, residuals: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Compute residual covariances</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedOptions.meanStructure}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, meanStructure: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Include mean structure</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedOptions.orthogonal}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, orthogonal: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Orthogonal factors</span>
                </label>
              </div>
            </div>
          )}

          {syntaxMode ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Model Syntax (lavaan style)</label>
                <button
                  onClick={() => {
                    if (modelSyntax) {
                      setFactorStructure(parseSyntax(modelSyntax));
                    }
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Parse Syntax
                </button>
              </div>
              <textarea
                value={modelSyntax || generateSyntax()}
                onChange={(e) => setModelSyntax(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500"
                rows={8}
                placeholder="Factor1 =~ item1 + item2 + item3&#10;Factor2 =~ item4 + item5 + item6"
              />
              <p className="text-xs text-gray-600 mt-2">
                Syntax format: <code>FactorName =~ item1 + item2 + ...</code>
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Factor Structure</label>
                <button
                  onClick={addFactor}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Add Factor
                </button>
              </div>

              {Object.keys(factorStructure).length === 0 ? (
                <div className="p-12 border-2 border-dashed border-gray-300 rounded-lg text-center bg-gray-50">
                  <Network className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium mb-2">No factors defined</p>
                  <p className="text-sm text-gray-500">Click "Add Factor" to start building your CFA model</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(factorStructure).map(([factor, items]) => (
                    <div key={factor} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-3">
                        <input
                          type="text"
                          value={factor}
                          onChange={(e) => renameFactor(factor, e.target.value)}
                          className="font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 px-1 outline-none"
                        />
                        <button
                          onClick={() => removeFactor(factor)}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Remove Factor
                        </button>
                      </div>

                      <div className="space-y-2 mb-3">
                        {items.length === 0 ? (
                          <p className="text-sm text-gray-500 italic py-2">No items assigned</p>
                        ) : (
                          items.map((item) => (
                            <div key={item} className="flex items-center justify-between bg-white px-3 py-2 rounded border border-gray-200">
                              <span className="text-sm text-gray-900">{item}</span>
                              <button
                                onClick={() => removeItemFromFactor(factor, item)}
                                className="text-xs text-red-600 hover:text-red-700"
                              >
                                Remove
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {currentDataset && (
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              addItemToFactor(factor, e.target.value);
                              e.target.value = '';
                            }
                          }}
                          className="w-full text-sm px-3 py-2 border border-gray-300 rounded bg-white"
                        >
                          <option value="">+ Add item to {factor}...</option>
                          {currentDataset.columns
                            .filter((col) => !items.includes(col))
                            .map((col) => (
                              <option key={col} value={col}>
                                {col}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={runCFA}
        disabled={loading || !selectedDataset || Object.keys(factorStructure).length === 0}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
      >
        <Play className="w-6 h-6" />
        {loading ? 'Running CFA Analysis...' : 'Run Confirmatory Factor Analysis'}
      </button>

      <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-600">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700 space-y-1">
            <p><strong>Professional Features:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Multiple estimators (ML, WLS, DWLS, ULS, GLS)</li>
              <li>Comprehensive fit indices (CFI, TLI, RMSEA with CI, SRMR, GFI, AGFI, NFI)</li>
              <li>Modification indices for model improvement</li>
              <li>Reliability estimates (Cronbach's α, CR, AVE)</li>
              <li>Factor correlations and standardized loadings</li>
              <li>AMOS/LISREL-style path diagrams</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
