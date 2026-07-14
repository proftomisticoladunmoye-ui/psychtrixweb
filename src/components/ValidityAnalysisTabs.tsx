import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Target, Users, TrendingUp, CheckCircle, Network, GitBranch,
  Globe, AlertCircle, Download, Play, Settings, FileImage
} from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Scatter } from 'react-chartjs-2';
import {
  exportResultsToPDF, exportToCSV, exportToJSON, exportChartAsImage,
  exportCFAToWord, exportCFAToHTML, exportSEMToWord, exportSEMToHTML,
  exportInvarianceToWord, exportInvarianceToHTML, exportCanvasToPNG
} from '../lib/exportUtils';
import { PathDiagram } from './PathDiagram';
import { SEMPathDiagram } from './SEMPathDiagram';
import { EnhancedCFA } from './EnhancedCFA';
import { EnhancedSEM } from './EnhancedSEM';
import { EnhancedInvariance } from './EnhancedInvariance';
import { EnhancedMultiGroupSEM } from './EnhancedMultiGroupSEM';
import { EnhancedContentValidity } from './EnhancedContentValidity';
import { EnhancedConstructValidity } from './EnhancedConstructValidity';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement);

interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
}

type TabType = 'content' | 'construct' | 'cfa' | 'sem' | 'invariance' | 'multigroup';

export default function ValidityAnalysisTabs() {
  const [activeTab, setActiveTab] = useState<TabType>('construct');
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<any>(null);

  // CFA specific state
  const [cfaModel, setCfaModel] = useState<string>('');
  const [factorStructure, setFactorStructure] = useState<{[key: string]: string[]}>({});
  const [estimator, setEstimator] = useState<'ML' | 'WLS' | 'ULS'>('ML');

  // Invariance testing state
  const [groupVariable, setGroupVariable] = useState<string>('');
  const [invarianceLevel, setInvarianceLevel] = useState<'configural' | 'metric' | 'scalar' | 'strict'>('configural');

  // Chart refs for export
  const cfaChartRef = useRef<ChartJS<'bar'>>(null);
  const invarianceChartRef = useRef<ChartJS<'bar'>>(null);

  // Export handlers
  const handleExportCFA = (format: 'pdf' | 'csv' | 'json' | 'chart') => {
    if (!results) return;

    switch (format) {
      case 'pdf':
        exportResultsToPDF(results, 'CFA');
        break;
      case 'csv':
        exportToCSV(results.factorLoadings, 'CFA_Factor_Loadings');
        break;
      case 'json':
        exportToJSON(results, 'CFA_Results');
        break;
      case 'chart':
        exportChartAsImage(cfaChartRef, 'CFA_Factor_Loadings_Chart');
        break;
    }
  };

  const handleExportInvariance = (format: 'pdf' | 'csv' | 'json' | 'chart') => {
    if (!results) return;

    switch (format) {
      case 'pdf':
        exportResultsToPDF(results, 'Measurement Invariance');
        break;
      case 'csv':
        const invarianceData = [
          { model: 'Configural', ...results.configural },
          { model: 'Metric', ...results.metric },
          { model: 'Scalar', ...results.scalar },
          { model: 'Strict', ...results.strict },
        ];
        exportToCSV(invarianceData, 'Measurement_Invariance');
        break;
      case 'json':
        exportToJSON(results, 'Measurement_Invariance_Results');
        break;
      case 'chart':
        exportChartAsImage(invarianceChartRef, 'Measurement_Invariance_Fit_Comparison');
        break;
    }
  };

  const tabs = [
    { id: 'content', label: 'Content Validity', icon: CheckCircle },
    { id: 'construct', label: 'Construct Validity', icon: Target },
    { id: 'cfa', label: 'CFA', icon: Network },
    { id: 'sem', label: 'SEM', icon: GitBranch },
    { id: 'invariance', label: 'Measurement Invariance', icon: Globe },
    { id: 'multigroup', label: 'Multi-group SEM', icon: Users },
  ];

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('datasets')
        .select('id, name, columns, data')
        .eq('user_id', user.id);

      if (error) throw error;
      setDatasets(data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const runCFA = async () => {
    if (!selectedDataset || Object.keys(factorStructure).length === 0) {
      setError('Please select a dataset and specify factor structure');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const mockResults = {
        fitIndices: {
          chisq: (Math.random() * 100 + 50).toFixed(2),
          df: Object.values(factorStructure).flat().length * 2,
          pvalue: (Math.random() * 0.5).toFixed(3),
          cfi: (0.85 + Math.random() * 0.14).toFixed(3),
          tli: (0.83 + Math.random() * 0.15).toFixed(3),
          rmsea: (0.02 + Math.random() * 0.06).toFixed(3),
          srmr: (0.02 + Math.random() * 0.06).toFixed(3),
          aic: (Math.random() * 1000 + 500).toFixed(2),
          bic: (Math.random() * 1000 + 600).toFixed(2),
        },
        factorLoadings: Object.entries(factorStructure).flatMap(([factor, items]) =>
          items.map(item => ({
            item,
            factor,
            loading: (0.4 + Math.random() * 0.5).toFixed(3),
            se: (0.02 + Math.random() * 0.05).toFixed(3),
            zvalue: ((0.4 + Math.random() * 0.5) / (0.02 + Math.random() * 0.05)).toFixed(2),
            pvalue: '< 0.001',
          }))
        ),
        factorCorrelations: Object.keys(factorStructure).length > 1
          ? Object.keys(factorStructure).map((f1, i) =>
              Object.keys(factorStructure).slice(i + 1).map(f2 => ({
                factor1: f1,
                factor2: f2,
                correlation: (0.3 + Math.random() * 0.5).toFixed(3),
              }))
            ).flat()
          : [],
        modificationIndices: [
          { from: 'Item1', to: 'Item2', mi: (10 + Math.random() * 30).toFixed(2), epc: (0.1 + Math.random() * 0.3).toFixed(3) },
          { from: 'Item3', to: 'Item5', mi: (8 + Math.random() * 25).toFixed(2), epc: (0.08 + Math.random() * 0.25).toFixed(3) },
        ],
      };

      setResults(mockResults);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runInvariance = async () => {
    if (!selectedDataset || !groupVariable || selectedItems.length === 0) {
      setError('Please select dataset, items, and grouping variable');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const mockResults = {
        configural: {
          chisq: (Math.random() * 100 + 50).toFixed(2),
          df: 45,
          cfi: (0.92 + Math.random() * 0.07).toFixed(3),
          rmsea: (0.04 + Math.random() * 0.04).toFixed(3),
        },
        metric: {
          chisq: (Math.random() * 110 + 60).toFixed(2),
          df: 52,
          cfi: (0.90 + Math.random() * 0.08).toFixed(3),
          rmsea: (0.045 + Math.random() * 0.04).toFixed(3),
        },
        scalar: {
          chisq: (Math.random() * 125 + 70).toFixed(2),
          df: 59,
          cfi: (0.88 + Math.random() * 0.09).toFixed(3),
          rmsea: (0.05 + Math.random() * 0.04).toFixed(3),
        },
        strict: {
          chisq: (Math.random() * 140 + 80).toFixed(2),
          df: 66,
          cfi: (0.86 + Math.random() * 0.09).toFixed(3),
          rmsea: (0.055 + Math.random() * 0.04).toFixed(3),
        },
        comparisons: [
          {
            comparison: 'Configural vs Metric',
            deltaCFI: (-0.005 - Math.random() * 0.015).toFixed(4),
            deltaRMSEA: (0.002 + Math.random() * 0.008).toFixed(4),
            decision: 'Metric invariance supported',
          },
          {
            comparison: 'Metric vs Scalar',
            deltaCFI: (-0.008 - Math.random() * 0.018).toFixed(4),
            deltaRMSEA: (0.003 + Math.random() * 0.008).toFixed(4),
            decision: 'Scalar invariance supported',
          },
        ],
      };

      setResults(mockResults);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentDataset = datasets.find(d => d.id === selectedDataset);

  const addFactor = () => {
    const factorName = `Factor${Object.keys(factorStructure).length + 1}`;
    setFactorStructure({ ...factorStructure, [factorName]: [] });
  };

  const addItemToFactor = (factor: string, item: string) => {
    setFactorStructure({
      ...factorStructure,
      [factor]: [...(factorStructure[factor] || []), item],
    });
  };

  const removeItemFromFactor = (factor: string, item: string) => {
    setFactorStructure({
      ...factorStructure,
      [factor]: factorStructure[factor].filter(i => i !== item),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Validity Analysis</h1>
        <p className="text-gray-600 mt-1">Comprehensive construct validation with advanced SEM techniques</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 overflow-x-auto">
          <nav className="flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as TabType);
                    setResults(null);
                  }}
                  className={`flex-shrink-0 px-6 py-4 text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Icon className="w-5 h-5" />
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {/* Content Validity Tab - Enhanced Professional Version */}
          {activeTab === 'content' && (
            <EnhancedContentValidity />
          )}

          {/* Construct Validity Tab - Enhanced Professional EFA */}
          {activeTab === 'construct' && (
            <EnhancedConstructValidity
              datasets={datasets}
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
            />
          )}

          {/* CFA Tab - Enhanced Professional Version */}
          {activeTab === 'cfa' && (
            <EnhancedCFA
              datasets={datasets}
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
            />
          )}

          {/* OLD CFA (Backup - Remove after testing) */}
          {false && activeTab === 'cfa' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirmatory Factor Analysis (CFA)</h3>
                <p className="text-gray-600 mb-4">
                  Test hypothesized factor structures with comprehensive fit evaluation and modification indices.
                </p>
              </div>

              {!results && (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Select Dataset</label>
                      <select
                        value={selectedDataset}
                        onChange={(e) => setSelectedDataset(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Choose a dataset...</option>
                        {datasets.map((dataset) => (
                          <option key={dataset.id} value={dataset.id}>
                            {dataset.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Estimator</label>
                      <div className="flex gap-4">
                        {(['ML', 'WLS', 'ULS'] as const).map((est) => (
                          <label key={est} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="estimator"
                              value={est}
                              checked={estimator === est}
                              onChange={(e) => setEstimator(e.target.value as any)}
                              className="text-blue-600"
                            />
                            <span className="text-sm text-gray-700">
                              {est === 'ML' ? 'Maximum Likelihood' : est === 'WLS' ? 'Weighted Least Squares' : 'Unweighted Least Squares'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

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
                        <div className="p-8 border-2 border-dashed border-gray-300 rounded-lg text-center">
                          <Network className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                          <p className="text-gray-600">Click "Add Factor" to start building your model</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {Object.entries(factorStructure).map(([factor, items]) => (
                            <div key={factor} className="border border-gray-200 rounded-lg p-4">
                              <h4 className="font-medium text-gray-900 mb-3">{factor}</h4>
                              <div className="space-y-2">
                                {items.length === 0 ? (
                                  <p className="text-sm text-gray-500 italic">No items assigned</p>
                                ) : (
                                  items.map(item => (
                                    <div key={item} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                                      <span className="text-sm text-gray-700">{item}</span>
                                      <button
                                        onClick={() => removeItemFromFactor(factor, item)}
                                        className="text-xs text-red-600 hover:text-red-700"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))
                                )}
                                {currentDataset && (
                                  <select
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        addItemToFactor(factor, e.target.value);
                                        e.target.value = '';
                                      }
                                    }}
                                    className="w-full text-sm px-3 py-2 border border-gray-300 rounded"
                                  >
                                    <option value="">Add item to {factor}...</option>
                                    {currentDataset.columns
                                      .filter(col => !items.includes(col))
                                      .map(col => (
                                        <option key={col} value={col}>{col}</option>
                                      ))}
                                  </select>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={runCFA}
                    disabled={loading || !selectedDataset || Object.keys(factorStructure).length === 0}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Play className="w-5 h-5" />
                    {loading ? 'Running CFA...' : 'Run Confirmatory Factor Analysis'}
                  </button>
                </>
              )}

              {results && (
                <div className="space-y-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Model Fit Indices</h4>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-xs text-gray-600 mb-1">χ² (df={results.fitIndices.df})</p>
                        <p className="text-2xl font-bold text-gray-900">{results.fitIndices.chisq}</p>
                        <p className="text-xs text-gray-500">p = {results.fitIndices.pvalue}</p>
                      </div>
                      <div className="p-4 bg-green-50 rounded-lg">
                        <p className="text-xs text-gray-600 mb-1">CFI</p>
                        <p className="text-2xl font-bold text-gray-900">{results.fitIndices.cfi}</p>
                        <p className="text-xs text-gray-500">{parseFloat(results.fitIndices.cfi) > 0.95 ? 'Excellent' : parseFloat(results.fitIndices.cfi) > 0.90 ? 'Good' : 'Poor'}</p>
                      </div>
                      <div className="p-4 bg-teal-50 rounded-lg">
                        <p className="text-xs text-gray-600 mb-1">TLI</p>
                        <p className="text-2xl font-bold text-gray-900">{results.fitIndices.tli}</p>
                        <p className="text-xs text-gray-500">{parseFloat(results.fitIndices.tli) > 0.95 ? 'Excellent' : parseFloat(results.fitIndices.tli) > 0.90 ? 'Good' : 'Poor'}</p>
                      </div>
                      <div className="p-4 bg-orange-50 rounded-lg">
                        <p className="text-xs text-gray-600 mb-1">RMSEA</p>
                        <p className="text-2xl font-bold text-gray-900">{results.fitIndices.rmsea}</p>
                        <p className="text-xs text-gray-500">{parseFloat(results.fitIndices.rmsea) < 0.05 ? 'Excellent' : parseFloat(results.fitIndices.rmsea) < 0.08 ? 'Good' : 'Poor'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-3 border border-gray-200 rounded">
                        <p className="text-xs text-gray-600 mb-1">SRMR</p>
                        <p className="text-lg font-bold text-gray-900">{results.fitIndices.srmr}</p>
                      </div>
                      <div className="p-3 border border-gray-200 rounded">
                        <p className="text-xs text-gray-600 mb-1">AIC</p>
                        <p className="text-lg font-bold text-gray-900">{results.fitIndices.aic}</p>
                      </div>
                      <div className="p-3 border border-gray-200 rounded">
                        <p className="text-xs text-gray-600 mb-1">BIC</p>
                        <p className="text-lg font-bold text-gray-900">{results.fitIndices.bic}</p>
                      </div>
                    </div>

                    <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                      <h5 className="font-semibold text-sm text-gray-900 mb-2">Fit Guidelines</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
                        <div>CFI/TLI: &gt; 0.95 excellent, &gt; 0.90 acceptable</div>
                        <div>RMSEA: &lt; 0.05 excellent, &lt; 0.08 acceptable</div>
                        <div>SRMR: &lt; 0.08 good fit</div>
                        <div>χ²/df: &lt; 3 acceptable, &lt; 2 good</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <PathDiagram
                      factorStructure={factorStructure}
                      factorLoadings={results.factorLoadings}
                      factorCorrelations={results.factorCorrelations}
                      showLoadings={true}
                    />
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Standardized Factor Loadings</h4>

                    <div className="mb-6">
                      <Bar
                        ref={cfaChartRef}
                        data={{
                          labels: results.factorLoadings.map((fl: any) => fl.item),
                          datasets: [{
                            label: 'Standardized Loading',
                            data: results.factorLoadings.map((fl: any) => parseFloat(fl.loading)),
                            backgroundColor: results.factorLoadings.map((fl: any) =>
                              parseFloat(fl.loading) > 0.7 ? 'rgba(34, 197, 94, 0.6)' :
                              parseFloat(fl.loading) > 0.5 ? 'rgba(59, 130, 246, 0.6)' :
                              'rgba(239, 68, 68, 0.6)'
                            ),
                            borderColor: results.factorLoadings.map((fl: any) =>
                              parseFloat(fl.loading) > 0.7 ? 'rgb(34, 197, 94)' :
                              parseFloat(fl.loading) > 0.5 ? 'rgb(59, 130, 246)' :
                              'rgb(239, 68, 68)'
                            ),
                            borderWidth: 1,
                          }],
                        }}
                        options={{
                          responsive: true,
                          plugins: {
                            legend: { display: false },
                            title: {
                              display: true,
                              text: 'Color: Green (>0.7), Blue (0.5-0.7), Red (<0.5)',
                            },
                          },
                          scales: {
                            y: {
                              beginAtZero: true,
                              max: 1,
                              title: { display: true, text: 'Standardized Loading' },
                            },
                          },
                        }}
                      />
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">Item</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">Factor</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">Loading</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">SE</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">z-value</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">p-value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.factorLoadings.map((fl: any, idx: number) => (
                            <tr key={idx} className="border-b border-gray-100">
                              <td className="py-2 px-3 text-gray-900">{fl.item}</td>
                              <td className="py-2 px-3 text-gray-700">{fl.factor}</td>
                              <td className="py-2 px-3 text-gray-900 font-medium">{fl.loading}</td>
                              <td className="py-2 px-3 text-gray-600">{fl.se}</td>
                              <td className="py-2 px-3 text-gray-600">{fl.zvalue}</td>
                              <td className="py-2 px-3 text-gray-600">{fl.pvalue}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {results.factorCorrelations.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">Factor Correlations</h4>
                      <div className="space-y-2">
                        {results.factorCorrelations.map((fc: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                            <span className="text-sm text-gray-700">{fc.factor1} ↔ {fc.factor2}</span>
                            <span className="text-sm font-medium text-gray-900">{fc.correlation}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Modification Indices (MI &gt; 10)</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">From</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">To</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">MI</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">EPC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.modificationIndices.map((mi: any, idx: number) => (
                            <tr key={idx} className="border-b border-gray-100">
                              <td className="py-2 px-3 text-gray-900">{mi.from}</td>
                              <td className="py-2 px-3 text-gray-900">{mi.to}</td>
                              <td className="py-2 px-3 text-gray-700 font-medium">{mi.mi}</td>
                              <td className="py-2 px-3 text-gray-600">{mi.epc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">
                      MI: Modification Index | EPC: Expected Parameter Change
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => setResults(null)}
                        className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 rounded-lg transition"
                      >
                        Run New Analysis
                      </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <button
                        onClick={() => handleExportCFA('pdf')}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
                      >
                        <Download className="w-4 h-4" />
                        PDF Report
                      </button>
                      <button
                        onClick={() => handleExportCFA('csv')}
                        className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
                      >
                        <Download className="w-4 h-4" />
                        CSV Data
                      </button>
                      <button
                        onClick={() => handleExportCFA('json')}
                        className="bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
                      >
                        <Download className="w-4 h-4" />
                        JSON
                      </button>
                      <button
                        onClick={() => handleExportCFA('chart')}
                        className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
                      >
                        <FileImage className="w-4 h-4" />
                        Chart PNG
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SEM Tab - Enhanced Professional Version */}
          {activeTab === 'sem' && (
            <EnhancedSEM
              datasets={datasets}
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
            />
          )}

          {/* OLD SEM (Backup - Remove after testing) */}
          {false && activeTab === 'sem' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Structural Equation Modeling (SEM)</h3>
                <p className="text-gray-600 mb-6">
                  Test complex structural models with latent variables, direct and indirect effects, and mediation analysis.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 border border-gray-200 rounded-lg">
                  <GitBranch className="w-10 h-10 text-blue-600 mb-4" />
                  <h4 className="font-semibold text-gray-900 mb-2">Path Analysis</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Test direct and indirect effects between observed variables with bootstrapped confidence intervals.
                  </p>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• Direct effects estimation</li>
                    <li>• Indirect effects (mediation)</li>
                    <li>• Total effects decomposition</li>
                    <li>• Sobel test & bootstrap CIs</li>
                  </ul>
                </div>

                <div className="p-6 border border-gray-200 rounded-lg">
                  <Network className="w-10 h-10 text-green-600 mb-4" />
                  <h4 className="font-semibold text-gray-900 mb-2">Full SEM</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Combine measurement model (CFA) with structural model to test theoretical relationships.
                  </p>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• Latent variable modeling</li>
                    <li>• Measurement invariance</li>
                    <li>• Nested model comparison</li>
                    <li>• Model modification</li>
                  </ul>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-50 to-teal-50 rounded-lg p-6">
                <h4 className="font-semibold text-gray-900 mb-3">Advanced SEM Features</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                  <div>
                    <p className="font-medium mb-2">Model Specification:</p>
                    <ul className="space-y-1 ml-4">
                      <li>• Latent growth curve models</li>
                      <li>• Second-order factor models</li>
                      <li>• Bifactor models</li>
                      <li>• Cross-lagged panel models</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-2">Estimation Methods:</p>
                    <ul className="space-y-1 ml-4">
                      <li>• Maximum likelihood (ML)</li>
                      <li>• Robust ML (MLR, MLM)</li>
                      <li>• Weighted least squares (WLS)</li>
                      <li>• Bayesian estimation</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <SEMPathDiagram
                  measurementModel={{
                    'Exog1': ['X1', 'X2', 'X3'],
                    'Exog2': ['X4', 'X5', 'X6'],
                    'Endog1': ['Y1', 'Y2', 'Y3'],
                    'Endog2': ['Y4', 'Y5', 'Y6']
                  }}
                  structuralModel={[
                    { from: 'Exog1', to: 'Endog1', coefficient: 'γ11' },
                    { from: 'Exog2', to: 'Endog1', coefficient: 'γ21' },
                    { from: 'Endog1', to: 'Endog2', coefficient: 'β21' }
                  ]}
                  showCoefficients={true}
                />
              </div>

              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2">
                <Settings className="w-5 h-5" />
                Configure SEM Model
              </button>
            </div>
          )}

          {/* Measurement Invariance Tab - Enhanced Professional Version */}
          {activeTab === 'invariance' && (
            <EnhancedInvariance
              datasets={datasets}
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
            />
          )}

          {/* OLD Invariance (Backup - Remove after testing) */}
          {false && activeTab === 'invariance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Measurement Invariance Testing</h3>
                <p className="text-gray-600 mb-4">
                  Test configural, metric, scalar, and strict invariance across groups using multi-group CFA.
                </p>
              </div>

              {!results && (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Select Dataset</label>
                      <select
                        value={selectedDataset}
                        onChange={(e) => setSelectedDataset(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Choose a dataset...</option>
                        {datasets.map((dataset) => (
                          <option key={dataset.id} value={dataset.id}>
                            {dataset.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {currentDataset && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Grouping Variable</label>
                          <select
                            value={groupVariable}
                            onChange={(e) => setGroupVariable(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select grouping variable...</option>
                            {currentDataset.columns.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select Items for Analysis ({selectedItems.length} selected)
                          </label>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-4 border border-gray-200 rounded-lg">
                            {currentDataset.columns.filter(col => col !== groupVariable).map((col) => (
                              <label key={col} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedItems.includes(col)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedItems([...selectedItems, col]);
                                    } else {
                                      setSelectedItems(selectedItems.filter((item) => item !== col));
                                    }
                                  }}
                                  className="rounded border-gray-300"
                                />
                                <span className="text-sm text-gray-700">{col}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="bg-blue-50 rounded-lg p-6">
                    <h4 className="font-semibold text-gray-900 mb-3">Invariance Testing Sequence</h4>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">1</div>
                        <div>
                          <p className="font-medium text-gray-900">Configural Invariance</p>
                          <p className="text-sm text-gray-600">Same factor structure across groups</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">2</div>
                        <div>
                          <p className="font-medium text-gray-900">Metric Invariance (Weak)</p>
                          <p className="text-sm text-gray-600">Equal factor loadings across groups</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">3</div>
                        <div>
                          <p className="font-medium text-gray-900">Scalar Invariance (Strong)</p>
                          <p className="text-sm text-gray-600">Equal intercepts across groups</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">4</div>
                        <div>
                          <p className="font-medium text-gray-900">Strict Invariance</p>
                          <p className="text-sm text-gray-600">Equal residual variances across groups</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={runInvariance}
                    disabled={loading || !selectedDataset || !groupVariable || selectedItems.length === 0}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Play className="w-5 h-5" />
                    {loading ? 'Testing Invariance...' : 'Run Measurement Invariance Test'}
                  </button>
                </>
              )}

              {results && (
                <div className="space-y-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Invariance Test Results</h4>

                    <div className="overflow-x-auto mb-6">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-4 font-semibold text-gray-700">Model</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-700">χ²</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-700">df</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-700">CFI</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-700">RMSEA</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-gray-100">
                            <td className="py-3 px-4 font-medium text-gray-900">Configural</td>
                            <td className="py-3 px-4 text-gray-700">{results.configural.chisq}</td>
                            <td className="py-3 px-4 text-gray-700">{results.configural.df}</td>
                            <td className="py-3 px-4 text-gray-700">{results.configural.cfi}</td>
                            <td className="py-3 px-4 text-gray-700">{results.configural.rmsea}</td>
                          </tr>
                          <tr className="border-b border-gray-100">
                            <td className="py-3 px-4 font-medium text-gray-900">Metric</td>
                            <td className="py-3 px-4 text-gray-700">{results.metric.chisq}</td>
                            <td className="py-3 px-4 text-gray-700">{results.metric.df}</td>
                            <td className="py-3 px-4 text-gray-700">{results.metric.cfi}</td>
                            <td className="py-3 px-4 text-gray-700">{results.metric.rmsea}</td>
                          </tr>
                          <tr className="border-b border-gray-100">
                            <td className="py-3 px-4 font-medium text-gray-900">Scalar</td>
                            <td className="py-3 px-4 text-gray-700">{results.scalar.chisq}</td>
                            <td className="py-3 px-4 text-gray-700">{results.scalar.df}</td>
                            <td className="py-3 px-4 text-gray-700">{results.scalar.cfi}</td>
                            <td className="py-3 px-4 text-gray-700">{results.scalar.rmsea}</td>
                          </tr>
                          <tr className="border-b border-gray-100">
                            <td className="py-3 px-4 font-medium text-gray-900">Strict</td>
                            <td className="py-3 px-4 text-gray-700">{results.strict.chisq}</td>
                            <td className="py-3 px-4 text-gray-700">{results.strict.df}</td>
                            <td className="py-3 px-4 text-gray-700">{results.strict.cfi}</td>
                            <td className="py-3 px-4 text-gray-700">{results.strict.rmsea}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <h5 className="font-semibold text-sm text-gray-900 mb-3">Model Comparisons</h5>
                      <div className="space-y-3">
                        {results.comparisons.map((comp: any, idx: number) => (
                          <div key={idx} className="bg-white border border-gray-200 rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-900">{comp.comparison}</span>
                              <span className={`text-xs px-2 py-1 rounded ${
                                comp.decision.includes('supported')
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {comp.decision}
                              </span>
                            </div>
                            <div className="flex gap-4 text-xs text-gray-600">
                              <span>ΔCFI: {comp.deltaCFI}</span>
                              <span>ΔRMSEA: {comp.deltaRMSEA}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Visual Fit Comparison</h4>
                    <Bar
                      ref={invarianceChartRef}
                      data={{
                        labels: ['Configural', 'Metric', 'Scalar', 'Strict'],
                        datasets: [
                          {
                            label: 'CFI',
                            data: [
                              parseFloat(results.configural.cfi),
                              parseFloat(results.metric.cfi),
                              parseFloat(results.scalar.cfi),
                              parseFloat(results.strict.cfi)
                            ],
                            backgroundColor: 'rgba(59, 130, 246, 0.6)',
                            borderColor: 'rgb(59, 130, 246)',
                            borderWidth: 2,
                          },
                          {
                            label: 'RMSEA (scaled)',
                            data: [
                              parseFloat(results.configural.rmsea) * 10,
                              parseFloat(results.metric.rmsea) * 10,
                              parseFloat(results.scalar.rmsea) * 10,
                              parseFloat(results.strict.rmsea) * 10
                            ],
                            backgroundColor: 'rgba(239, 68, 68, 0.6)',
                            borderColor: 'rgb(239, 68, 68)',
                            borderWidth: 2,
                          }
                        ],
                      }}
                      options={{
                        responsive: true,
                        plugins: {
                          legend: {
                            position: 'top',
                          },
                          title: {
                            display: false,
                          },
                          tooltip: {
                            callbacks: {
                              label: (context) => {
                                let label = context.dataset.label || '';
                                if (label) {
                                  label += ': ';
                                }
                                const value = context.parsed.y;
                                label += context.dataset.label === 'RMSEA (scaled)'
                                  ? (value / 10).toFixed(3)
                                  : value.toFixed(3);
                                return label;
                              }
                            }
                          }
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            max: 1,
                            title: {
                              display: true,
                              text: 'Fit Index Value'
                            }
                          }
                        }
                      }}
                    />
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Multi-group Model Structure</h4>
                    <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg p-8">
                      <div className="text-center space-y-6">
                        <div className="flex justify-center gap-12">
                          <div className="text-center">
                            <div className="w-32 h-32 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                              Group 1
                            </div>
                            <p className="mt-2 text-sm font-medium text-gray-700">Same Factor Structure</p>
                          </div>
                          <div className="text-center">
                            <div className="w-32 h-32 bg-teal-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                              Group 2
                            </div>
                            <p className="mt-2 text-sm font-medium text-gray-700">Equal Loadings & Intercepts</p>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 max-w-lg mx-auto">
                          <p className="mb-2">
                            <strong>Configural:</strong> Both groups have the same items loading on the same factors
                          </p>
                          <p className="mb-2">
                            <strong>Metric:</strong> Factor loadings are constrained to be equal across groups
                          </p>
                          <p>
                            <strong>Scalar:</strong> Item intercepts are additionally constrained to be equal
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-6">
                    <h5 className="font-semibold text-gray-900 mb-3">Interpretation Guidelines</h5>
                    <ul className="text-sm text-gray-700 space-y-2">
                      <li>• <strong>ΔCFI ≤ -0.010:</strong> Invariance supported</li>
                      <li>• <strong>ΔRMSEA ≤ 0.015:</strong> Invariance supported</li>
                      <li>• If both criteria met, proceed to next level</li>
                      <li>• Partial invariance: Free non-invariant parameters</li>
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => setResults(null)}
                        className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 rounded-lg transition"
                      >
                        Run New Test
                      </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <button
                        onClick={() => handleExportInvariance('pdf')}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
                      >
                        <Download className="w-4 h-4" />
                        PDF Report
                      </button>
                      <button
                        onClick={() => handleExportInvariance('csv')}
                        className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
                      >
                        <Download className="w-4 h-4" />
                        CSV Data
                      </button>
                      <button
                        onClick={() => handleExportInvariance('json')}
                        className="bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
                      >
                        <Download className="w-4 h-4" />
                        JSON
                      </button>
                      <button
                        onClick={() => handleExportInvariance('chart')}
                        className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
                      >
                        <FileImage className="w-4 h-4" />
                        Chart PNG
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Multi-group SEM Tab - Enhanced Professional Version */}
          {activeTab === 'multigroup' && (
            <EnhancedMultiGroupSEM
              datasets={datasets}
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
            />
          )}

          {/* OLD Multi-group SEM (Backup - Remove after testing) */}
          {false && activeTab === 'multigroup' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Multi-group Structural Equation Modeling</h3>
                <p className="text-gray-600 mb-6">
                  Test structural relationships across multiple groups with invariance constraints and group comparisons.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 border border-gray-200 rounded-lg">
                  <Users className="w-10 h-10 text-teal-600 mb-4" />
                  <h4 className="font-semibold text-gray-900 mb-2">Group Comparisons</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Compare structural paths, factor loadings, and intercepts across groups.
                  </p>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• Path coefficient differences</li>
                    <li>• Moderation analysis</li>
                    <li>• Critical ratio tests</li>
                    <li>• Wald tests for constraints</li>
                  </ul>
                </div>

                <div className="p-6 border border-gray-200 rounded-lg">
                  <Globe className="w-10 h-10 text-teal-600 mb-4" />
                  <h4 className="font-semibold text-gray-900 mb-2">Cross-Cultural Analysis</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Validate measures and test theories across cultural or demographic groups.
                  </p>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• Cultural equivalence testing</li>
                    <li>• Latent mean comparisons</li>
                    <li>• Effect size estimation</li>
                    <li>• Partial invariance models</li>
                  </ul>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-50 to-teal-50 rounded-lg p-6">
                <h4 className="font-semibold text-gray-900 mb-4">Multi-group SEM Workflow</h4>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">1</div>
                    <div>
                      <p className="font-medium text-gray-900 mb-1">Establish Measurement Invariance</p>
                      <p className="text-sm text-gray-600">Test configural, metric, and scalar invariance first</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">2</div>
                    <div>
                      <p className="font-medium text-gray-900 mb-1">Fit Baseline Model</p>
                      <p className="text-sm text-gray-600">Structural model without equality constraints</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">3</div>
                    <div>
                      <p className="font-medium text-gray-900 mb-1">Test Path Equality</p>
                      <p className="text-sm text-gray-600">Constrain structural paths to be equal across groups</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">4</div>
                    <div>
                      <p className="font-medium text-gray-900 mb-1">Compare Group Differences</p>
                      <p className="text-sm text-gray-600">Use χ² difference tests and critical ratios</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h4 className="font-semibold text-gray-900 mb-3">Practical Considerations</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                  <div>
                    <p className="font-medium mb-2">Sample Size:</p>
                    <ul className="space-y-1 ml-4 text-gray-600">
                      <li>• Minimum 100-200 per group</li>
                      <li>• Larger for complex models</li>
                      <li>• Power analysis recommended</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-2">Model Identification:</p>
                    <ul className="space-y-1 ml-4 text-gray-600">
                      <li>• Fix scale in one group</li>
                      <li>• Check rank of information matrix</li>
                      <li>• Verify parameter estimates</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Example: Multi-group SEM Model</h4>
                <SEMPathDiagram
                  measurementModel={{
                    'Construct A': ['Item1', 'Item2', 'Item3'],
                    'Construct B': ['Item4', 'Item5', 'Item6'],
                  }}
                  structuralPaths={[
                    { from: 'Construct A', to: 'Construct B', coefficient: '0.45***' }
                  ]}
                />
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <strong>Note:</strong> In multi-group SEM, this model structure is fitted to multiple groups simultaneously.
                    Path coefficients and factor loadings can be constrained to be equal or allowed to vary across groups.
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg p-6">
                <h4 className="font-semibold text-gray-900 mb-3">Group-Specific Path Estimates</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                      <span className="font-semibold text-gray-900">Group 1 (n=250)</span>
                    </div>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div className="flex justify-between">
                        <span>Construct A → Construct B:</span>
                        <span className="font-mono font-medium">0.52***</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Factor Loading (Item1):</span>
                        <span className="font-mono font-medium">0.78</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Model Fit (CFI):</span>
                        <span className="font-mono font-medium">0.962</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-teal-200">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 bg-teal-600 rounded-full"></div>
                      <span className="font-semibold text-gray-900">Group 2 (n=230)</span>
                    </div>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div className="flex justify-between">
                        <span>Construct A → Construct B:</span>
                        <span className="font-mono font-medium">0.38**</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Factor Loading (Item1):</span>
                        <span className="font-mono font-medium">0.78</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Model Fit (CFI):</span>
                        <span className="font-mono font-medium">0.951</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-white rounded border border-gray-200">
                  <p className="text-sm text-gray-700">
                    <strong>Path Difference Test:</strong> χ² difference = 4.23, df = 1, p = 0.040
                    <br />
                    <span className="text-green-700 font-medium">→ Significant difference in path strength between groups</span>
                  </p>
                </div>
              </div>

              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2">
                <Settings className="w-5 h-5" />
                Configure Multi-group Model
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
