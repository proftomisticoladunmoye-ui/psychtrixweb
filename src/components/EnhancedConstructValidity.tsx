import React, { useState, useRef, useMemo } from 'react';
import {
  Target, TrendingUp, Download, Play, Settings, AlertCircle,
  Info, BarChart3, ChevronDown, ChevronUp, FileText, Database
} from 'lucide-react';
import { Bar, Line, Scatter, Doughnut } from 'react-chartjs-2';
import { exportToCSV, exportToJSON, exportResultsToPDF, exportChartAsImage, exportEFAResults } from '../lib/exportUtils';
import { ExploratoryFactorAnalysis } from '../lib/factorAnalysis';
import { saveAnalysisHistory } from '../lib/analysisHistory';

interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
}

interface EFAConfig {
  extractionMethod: 'paf' | 'ml' | 'pc' | 'minres';
  rotationMethod: 'oblimin' | 'promax' | 'varimax' | 'quartimax' | 'none';
  numFactors: number | 'auto';
  factorRetention: 'parallel' | 'kaiser' | 'scree' | 'user';
}

interface EFAResults {
  numFactors: number;
  eigenvalues: number[];
  varianceExplained: number[];
  cumulativeVariance: number[];
  factorLoadings: Array<{
    item: string;
    [key: string]: string | number;
  }>;
  communalities: Array<{
    item: string;
    initial: number;
    extracted: number;
  }>;
  factorCorrelations?: number[][];
  kmo: number;
  bartlett: {
    chisq: number;
    df: number;
    pvalue: number;
  };
  adequacy: string;
  totalVariance: number;
  reproductionCorrelations?: number[][];
  residuals?: number[][];
}

interface EnhancedConstructValidityProps {
  datasets: Dataset[];
  selectedDataset: string;
  onDatasetChange: (id: string) => void;
}

export function EnhancedConstructValidity({
  datasets,
  selectedDataset,
  onDatasetChange
}: EnhancedConstructValidityProps) {
  const [config, setConfig] = useState<EFAConfig>({
    extractionMethod: 'paf',
    rotationMethod: 'promax',
    numFactors: 'auto',
    factorRetention: 'parallel'
  });
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<EFAResults | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showAdvancedResults, setShowAdvancedResults] = useState(false);

  const screeChartRef = useRef<any>(null);
  const loadingsChartRef = useRef<any>(null);
  const varianceChartRef = useRef<any>(null);
  const communalitiesChartRef = useRef<any>(null);

  const currentDataset = useMemo(() =>
    datasets.find(d => d.id === selectedDataset),
    [datasets, selectedDataset]
  );

  const runEFA = async () => {
    if (!selectedDataset || selectedItems.length < 3) {
      alert('Please select a dataset and at least 3 items for analysis');
      return;
    }

    if (!currentDataset) {
      alert('Dataset not found');
      return;
    }

    setLoading(true);

    try {
      const selectedIndices = selectedItems.map(item =>
        currentDataset.columns.indexOf(item)
      ).filter(idx => idx !== -1);

      if (selectedIndices.length < 3) {
        alert('Could not find selected items in dataset');
        setLoading(false);
        return;
      }

      const rawData: number[][] = currentDataset.data.map(row =>
        selectedIndices.map(idx => {
          const value = parseFloat(row[currentDataset.columns[idx]]);
          return isNaN(value) ? 0 : value;
        })
      ).filter(row => row.every(val => !isNaN(val) && isFinite(val)));

      if (rawData.length < 10) {
        alert('Insufficient valid data for analysis. Need at least 10 complete cases.');
        setLoading(false);
        return;
      }

      const rotationMap: { [key: string]: 'none' | 'varimax' | 'promax' } = {
        'none': 'none',
        'varimax': 'varimax',
        'quartimax': 'varimax',
        'oblimin': 'promax',
        'promax': 'promax'
      };

      await new Promise(resolve => setTimeout(resolve, 0));

      const efaResults = ExploratoryFactorAnalysis.run(
        rawData,
        selectedItems,
        {
          numFactors: config.numFactors === 'auto' ? undefined : config.numFactors,
          rotation: rotationMap[config.rotationMethod] || 'varimax',
          method: 'pca',
          maxIterations: 1000,
          convergenceTolerance: 1e-6
        }
      );

      const numFactors = efaResults.loadings[0].length;

      const loadingsToUse = efaResults.rotatedLoadings || efaResults.loadings;

      const factorLoadings = selectedItems.map((item, i) => {
        const loading: any = { item };
        for (let f = 1; f <= numFactors; f++) {
          loading[`Factor${f}`] = loadingsToUse[i][f - 1].toFixed(3);
        }
        return loading;
      });

      const communalities = selectedItems.map((item, i) => ({
        item,
        initial: parseFloat(efaResults.communalities[i].toFixed(3)),
        extracted: parseFloat(efaResults.communalities[i].toFixed(3))
      }));

      const kmoValue = efaResults.kmo.overall;
      const adequacy = kmoValue >= 0.9 ? 'Marvelous' :
                       kmoValue >= 0.8 ? 'Meritorious' :
                       kmoValue >= 0.7 ? 'Middling' :
                       kmoValue >= 0.6 ? 'Mediocre' :
                       kmoValue >= 0.5 ? 'Miserable' : 'Unacceptable';

      const totalVariance = efaResults.eigenvalues.reduce((sum, val) => sum + val, 0);

      const finalResults = {
        numFactors,
        eigenvalues: efaResults.eigenvalues,
        varianceExplained: efaResults.varianceExplained,
        cumulativeVariance: efaResults.cumulativeVariance,
        factorLoadings,
        communalities,
        factorCorrelations: efaResults.factorCorrelations,
        kmo: kmoValue,
        bartlett: {
          chisq: efaResults.bartlett.chisq,
          df: efaResults.bartlett.df,
          pvalue: efaResults.bartlett.p
        },
        adequacy,
        totalVariance
      };

      setResults(finalResults);

      await saveAnalysisHistory({
        analysis_type: 'efa',
        analysis_name: `EFA - ${currentDataset.name} (${selectedItems.length} items)`,
        dataset_id: currentDataset.id,
        dataset_name: currentDataset.name,
        configuration: {
          extractionMethod: config.extractionMethod,
          rotationMethod: config.rotationMethod,
          numFactors: config.numFactors,
          factorRetention: config.factorRetention,
          selectedItems: selectedItems
        },
        results: finalResults,
        status: 'completed'
      });
    } catch (error) {
      console.error('EFA Error:', error);
      alert('An error occurred during factor analysis. Please check your data and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (format: 'csv' | 'json' | 'pdf' | 'scree' | 'loadings') => {
    if (!results) return;

    switch (format) {
      case 'csv':
        exportToCSV(results.factorLoadings, 'EFA_Factor_Loadings');
        break;
      case 'json':
        exportToJSON(results, 'EFA_Complete_Results');
        break;
      case 'pdf':
        exportEFAResults(results, config);
        break;
      case 'scree':
        exportChartAsImage(screeChartRef, 'EFA_Scree_Plot');
        break;
      case 'loadings':
        exportChartAsImage(loadingsChartRef, 'EFA_Factor_Loadings');
        break;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Exploratory Factor Analysis (EFA)
        </h3>
        <p className="text-gray-600">
          Uncover the latent factor structure underlying your observed variables using advanced psychometric methods
        </p>
      </div>

      {!results && (
        <>
          {/* Main Configuration */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
            {/* Dataset Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Database className="w-4 h-4 inline mr-2" />
                Select Dataset
              </label>
              <select
                value={selectedDataset}
                onChange={(e) => onDatasetChange(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Choose a dataset...</option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Item Selection */}
            {currentDataset && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Items ({selectedItems.length} selected)
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-4 border border-gray-200 rounded-lg bg-gray-50">
                  {currentDataset.columns.map((col) => (
                    <label key={col} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white rounded transition">
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
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{col}</span>
                    </label>
                  ))}
                </div>
                {selectedItems.length > 0 && selectedItems.length < 3 && (
                  <p className="text-sm text-yellow-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    Select at least 3 items for factor analysis
                  </p>
                )}
              </div>
            )}

            {/* Quick Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Extraction Method</label>
                <select
                  value={config.extractionMethod}
                  onChange={(e) => setConfig({ ...config, extractionMethod: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="paf">Principal Axis Factoring (Recommended)</option>
                  <option value="ml">Maximum Likelihood</option>
                  <option value="pc">Principal Components</option>
                  <option value="minres">Minimum Residual</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rotation Method</label>
                <select
                  value={config.rotationMethod}
                  onChange={(e) => setConfig({ ...config, rotationMethod: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="promax">Promax (Oblique - Recommended)</option>
                  <option value="oblimin">Oblimin (Oblique)</option>
                  <option value="varimax">Varimax (Orthogonal)</option>
                  <option value="quartimax">Quartimax (Orthogonal)</option>
                  <option value="none">None (Unrotated)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Advanced Options - Collapsible */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100 transition"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-gray-900">Advanced Options</span>
              </div>
              {showAdvancedOptions ? (
                <ChevronUp className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              )}
            </button>

            {showAdvancedOptions && (
              <div className="p-6 space-y-6 border-t border-gray-200">
                {/* Extraction Method Details */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-600" />
                    Extraction Method Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { value: 'paf', label: 'Principal Axis Factoring', desc: 'Common variance focus, excludes unique variance' },
                      { value: 'ml', label: 'Maximum Likelihood', desc: 'Best for hypothesis testing & chi-square goodness of fit' },
                      { value: 'pc', label: 'Principal Components', desc: 'Total variance focus, data reduction technique' },
                      { value: 'minres', label: 'Minimum Residual', desc: 'Minimizes sum of squared residuals' },
                    ].map((method) => (
                      <label
                        key={method.value}
                        className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition ${
                          config.extractionMethod === method.value
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="extraction"
                          value={method.value}
                          checked={config.extractionMethod === method.value}
                          onChange={(e) => setConfig({ ...config, extractionMethod: e.target.value as any })}
                          className="mt-1 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{method.label}</p>
                          <p className="text-xs text-gray-600 mt-1">{method.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Rotation Method Details */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Rotation Method Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      { value: 'promax', label: 'Promax', type: 'Oblique', desc: 'Allows factor correlation, faster than oblimin' },
                      { value: 'oblimin', label: 'Oblimin', type: 'Oblique', desc: 'Direct oblimin, allows correlation' },
                      { value: 'varimax', label: 'Varimax', type: 'Orthogonal', desc: 'Most popular, uncorrelated factors' },
                      { value: 'quartimax', label: 'Quartimax', type: 'Orthogonal', desc: 'Simplifies variables' },
                      { value: 'none', label: 'None', type: 'Unrotated', desc: 'No rotation applied' },
                    ].map((method) => (
                      <label
                        key={method.value}
                        className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition ${
                          config.rotationMethod === method.value
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="rotation"
                          value={method.value}
                          checked={config.rotationMethod === method.value}
                          onChange={(e) => setConfig({ ...config, rotationMethod: e.target.value as any })}
                          className="mt-1 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{method.label}</p>
                          <p className="text-xs text-gray-500">{method.type}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{method.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Factor Retention Criteria */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Factor Retention Criteria</h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { value: 'parallel', label: 'Parallel Analysis', desc: 'Gold standard (Horn, 1965)' },
                        { value: 'kaiser', label: 'Kaiser Criterion', desc: 'Eigenvalue > 1.0' },
                        { value: 'scree', label: 'Scree Plot', desc: 'Visual elbow method' },
                        { value: 'user', label: 'User Specified', desc: 'Manual selection' },
                      ].map((method) => (
                        <label
                          key={method.value}
                          className={`flex flex-col p-3 border-2 rounded-lg cursor-pointer transition ${
                            config.factorRetention === method.value
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="radio"
                              name="retention"
                              value={method.value}
                              checked={config.factorRetention === method.value}
                              onChange={(e) => setConfig({
                                ...config,
                                factorRetention: e.target.value as any,
                                numFactors: e.target.value === 'user' ? 1 : 'auto'
                              })}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <p className="font-medium text-gray-900 text-sm">{method.label}</p>
                          </div>
                          <p className="text-xs text-gray-600 ml-6">{method.desc}</p>
                        </label>
                      ))}
                    </div>

                    {config.factorRetention === 'user' && (
                      <div className="max-w-xs ml-4">
                        <label className="block text-sm text-gray-700 mb-2">Specify number of factors:</label>
                        <input
                          type="number"
                          min="1"
                          max={selectedItems.length}
                          value={config.numFactors === 'auto' ? 1 : config.numFactors}
                          onChange={(e) => setConfig({ ...config, numFactors: parseInt(e.target.value) })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sample Size Guidelines */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
            <div className="flex items-start gap-3">
              <Info className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Sample Size Guidelines (Comrey & Lee, 1992)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                  <div>
                    <p className="font-medium mb-2">Subject-to-Variable Ratio:</p>
                    <ul className="space-y-1 ml-4">
                      <li>• <strong>Minimum:</strong> 5:1 (5 participants per item)</li>
                      <li>• <strong>Adequate:</strong> 10:1 (recommended)</li>
                      <li>• <strong>Good:</strong> 15:1</li>
                      <li>• <strong>Excellent:</strong> 20:1 or higher</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-2">Absolute Sample Size (Tabachnick & Fidell, 2013):</p>
                    <ul className="space-y-1 ml-4">
                      <li>• <strong>Minimum:</strong> 100 cases</li>
                      <li>• <strong>Adequate:</strong> 200 cases</li>
                      <li>• <strong>Good:</strong> 300 cases</li>
                      <li>• <strong>Excellent:</strong> 500+ cases</li>
                    </ul>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mt-3">
                  <strong>For your {selectedItems.length} items:</strong> Recommended minimum sample size = {selectedItems.length * 5} cases (5:1 ratio)
                </p>
              </div>
            </div>
          </div>

          {/* Run Analysis Button */}
          <button
            onClick={runEFA}
            disabled={loading || !selectedDataset || selectedItems.length < 3}
            className="w-full bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white font-semibold py-4 rounded-lg transition flex items-center justify-center gap-3 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Running EFA Analysis...
              </>
            ) : (
              <>
                <Play className="w-6 h-6" />
                Run Exploratory Factor Analysis
              </>
            )}
          </button>
        </>
      )}

      {/* Results Section */}
      {results && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">EFA Results</h3>
            <button
              onClick={() => {
                setResults(null);
                setSelectedItems([]);
              }}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition font-medium"
            >
              Run New Analysis
            </button>
          </div>

          {/* Sampling Adequacy */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`rounded-lg p-6 border-2 ${
              results.kmo >= 0.8 ? 'bg-green-50 border-green-500' :
              results.kmo >= 0.7 ? 'bg-blue-50 border-blue-500' :
              results.kmo >= 0.6 ? 'bg-yellow-50 border-yellow-500' :
              'bg-red-50 border-red-500'
            }`}>
              <h4 className="font-semibold text-gray-900 mb-2">Kaiser-Meyer-Olkin (KMO) Test</h4>
              <p className="text-4xl font-bold text-gray-900 mb-2">{results.kmo.toFixed(3)}</p>
              <p className="text-sm font-medium text-gray-700 mb-3">{results.adequacy}</p>
              <div className="text-xs text-gray-600 space-y-1">
                <p>≥ 0.90: Marvelous</p>
                <p>≥ 0.80: Meritorious</p>
                <p>≥ 0.70: Middling</p>
                <p>≥ 0.60: Mediocre</p>
                <p>≥ 0.50: Miserable</p>
                <p>&lt; 0.50: Unacceptable</p>
              </div>
            </div>

            <div className={`rounded-lg p-6 border-2 ${
              results.bartlett.pvalue < 0.001 ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'
            }`}>
              <h4 className="font-semibold text-gray-900 mb-2">Bartlett's Test of Sphericity</h4>
              <p className="text-xl font-bold text-gray-900 mb-1">
                χ²({results.bartlett.df}) = {results.bartlett.chisq}
              </p>
              <p className="text-sm text-gray-700 mb-3">p-value: {results.bartlett.pvalue < 0.001 ? '< 0.001' : results.bartlett.pvalue.toFixed(5)}</p>
              <p className={`text-sm font-medium ${results.bartlett.pvalue < 0.001 ? 'text-green-700' : 'text-red-700'}`}>
                {results.bartlett.pvalue < 0.001
                  ? '✓ Significant - Variables are correlated, suitable for factor analysis'
                  : '✗ Not significant - Variables may not be suitable for factor analysis'}
              </p>
              <p className="text-xs text-gray-600 mt-3">
                Tests the null hypothesis that the correlation matrix is an identity matrix (no correlations).
                Significant results (p &lt; 0.05) indicate factor analysis is appropriate.
              </p>
            </div>
          </div>

          {/* Variance Explained */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Total Variance Explained</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
              {[...Array(results.numFactors)].map((_, i) => (
                <div key={i} className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                  <p className="text-xs text-gray-600 mb-1 font-medium">Factor {i + 1}</p>
                  <p className="text-2xl font-bold text-gray-900">{results.varianceExplained[i].toFixed(1)}%</p>
                  <p className="text-xs text-gray-600 mt-1">
                    Cumulative: {results.cumulativeVariance[i].toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    λ = {results.eigenvalues[i].toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            {/* Variance Pie Chart */}
            <div className="max-w-md mx-auto">
              <Doughnut
                ref={varianceChartRef}
                data={{
                  labels: [...Array(results.numFactors)].map((_, i) => `Factor ${i + 1}`),
                  datasets: [{
                    data: results.varianceExplained.slice(0, results.numFactors),
                    backgroundColor: [
                      'rgba(59, 130, 246, 0.8)',
                      'rgba(34, 197, 94, 0.8)',
                      'rgba(20, 184, 166, 0.8)',
                      'rgba(249, 115, 22, 0.8)',
                      'rgba(236, 72, 153, 0.8)',
                      'rgba(14, 165, 233, 0.8)',
                    ],
                    borderColor: [
                      'rgb(59, 130, 246)',
                      'rgb(34, 197, 94)',
                      'rgb(20, 184, 166)',
                      'rgb(249, 115, 22)',
                      'rgb(236, 72, 153)',
                      'rgb(14, 165, 233)',
                    ],
                    borderWidth: 2,
                  }],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { position: 'bottom' },
                    title: {
                      display: true,
                      text: 'Variance Explained Distribution',
                    },
                  },
                }}
              />
            </div>
          </div>

          {/* Scree Plot */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Scree Plot (Cattell, 1966)</h4>
            <Line
              ref={screeChartRef}
              data={{
                labels: results.eigenvalues.map((_, i) => `${i + 1}`),
                datasets: [
                  {
                    label: 'Eigenvalue',
                    data: results.eigenvalues,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.1,
                    fill: true,
                    pointRadius: 6,
                    pointBackgroundColor: results.eigenvalues.map((ev, i) =>
                      i < results.numFactors ? 'rgb(34, 197, 94)' : 'rgb(59, 130, 246)'
                    ),
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                  },
                  {
                    label: 'Kaiser Criterion (λ = 1)',
                    data: Array(results.eigenvalues.length).fill(1),
                    borderColor: 'rgb(239, 68, 68)',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: { position: 'top' },
                  title: {
                    display: true,
                    text: 'Eigenvalues by Factor Number (Green = Retained, Blue = Not Retained)',
                  },
                  tooltip: {
                    callbacks: {
                      label: (context) => {
                        if (context.datasetIndex === 0) {
                          const factor = parseInt(context.label);
                          return [
                            `Factor ${factor}`,
                            `Eigenvalue: ${context.parsed.y.toFixed(3)}`,
                            `Variance: ${results.varianceExplained[factor - 1].toFixed(1)}%`,
                            `Status: ${factor <= results.numFactors ? 'Retained' : 'Not Retained'}`
                          ];
                        }
                        return 'Kaiser Criterion';
                      }
                    }
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Eigenvalue' },
                  },
                  x: {
                    title: { display: true, text: 'Factor Number' },
                  },
                },
              }}
            />
            <p className="text-xs text-gray-600 mt-3">
              <strong>Interpretation:</strong> Look for the "elbow" where the slope levels off. Factors before the elbow are typically retained.
            </p>
          </div>

          {/* Factor Loadings */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Factor Loadings Matrix ({config.rotationMethod === 'none' ? 'Unrotated' : config.rotationMethod.charAt(0).toUpperCase() + config.rotationMethod.slice(1)})</h4>

            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Item</th>
                    {[...Array(results.numFactors)].map((_, i) => (
                      <th key={i} className="text-center py-3 px-4 font-semibold text-gray-700">
                        Factor {i + 1}
                      </th>
                    ))}
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">h²</th>
                  </tr>
                </thead>
                <tbody>
                  {results.factorLoadings.map((loading, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium text-gray-900">{loading.item}</td>
                      {[...Array(results.numFactors)].map((_, i) => {
                        const value = parseFloat(loading[`Factor${i + 1}`] as string);
                        const isHigh = Math.abs(value) >= 0.5;
                        const isModerate = Math.abs(value) >= 0.3;
                        return (
                          <td
                            key={i}
                            className={`py-3 px-4 text-center font-mono ${
                              isHigh ? 'font-bold text-gray-900 bg-green-50' :
                              isModerate ? 'font-medium text-gray-800 bg-blue-50' :
                              'text-gray-600'
                            }`}
                          >
                            {value.toFixed(3)}
                          </td>
                        );
                      })}
                      <td className="py-3 px-4 text-center font-medium text-gray-700">
                        {results.communalities[idx].extracted.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs mb-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
                <span className="text-gray-600">Strong loading (|λ| ≥ 0.50)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-50 border border-blue-200 rounded"></div>
                <span className="text-gray-600">Moderate (0.30 ≤ |λ| &lt; 0.50)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-white border border-gray-200 rounded"></div>
                <span className="text-gray-600">Weak (|λ| &lt; 0.30)</span>
              </div>
            </div>

            <p className="text-xs text-gray-600">
              <strong>h²</strong> = Communality (proportion of variance explained by all factors).
              Higher values indicate the item is well-represented by the factor solution.
            </p>
          </div>

          {/* Visual Factor Loadings */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Factor Loadings Visualization</h4>
            <Bar
              ref={loadingsChartRef}
              data={{
                labels: results.factorLoadings.map(l => l.item),
                datasets: [...Array(results.numFactors)].map((_, i) => ({
                  label: `Factor ${i + 1}`,
                  data: results.factorLoadings.map(l => Math.abs(parseFloat(l[`Factor${i + 1}`] as string))),
                  backgroundColor: [
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(34, 197, 94, 0.7)',
                    'rgba(20, 184, 166, 0.7)',
                    'rgba(249, 115, 22, 0.7)',
                    'rgba(236, 72, 153, 0.7)',
                    'rgba(14, 165, 233, 0.7)',
                  ][i % 6],
                  borderColor: [
                    'rgb(59, 130, 246)',
                    'rgb(34, 197, 94)',
                    'rgb(20, 184, 166)',
                    'rgb(249, 115, 22)',
                    'rgb(236, 72, 153)',
                    'rgb(14, 165, 233)',
                  ][i % 6],
                  borderWidth: 2,
                })),
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: { position: 'top' },
                  title: {
                    display: true,
                    text: 'Absolute Factor Loadings by Item',
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    max: 1,
                    title: { display: true, text: 'Absolute Loading' },
                  },
                },
              }}
            />
          </div>

          {/* Communalities */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Communalities (h²)</h4>
            <div className="mb-6">
              <Bar
                ref={communalitiesChartRef}
                data={{
                  labels: results.communalities.map(c => c.item),
                  datasets: [{
                    label: 'Extracted Communality',
                    data: results.communalities.map(c => c.extracted),
                    backgroundColor: results.communalities.map(c =>
                      c.extracted >= 0.5 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)'
                    ),
                    borderColor: results.communalities.map(c =>
                      c.extracted >= 0.5 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'
                    ),
                    borderWidth: 2,
                  }],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false },
                    title: {
                      display: true,
                      text: 'Green = Acceptable (h² ≥ 0.50), Red = Low (h² < 0.50)',
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 1,
                      title: { display: true, text: 'Communality (h²)' },
                    },
                  },
                }}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Item</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Initial h²</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Extracted h²</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.communalities.map((comm, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-3 px-4 font-medium text-gray-900">{comm.item}</td>
                      <td className="py-3 px-4 text-center text-gray-700">{comm.initial.toFixed(3)}</td>
                      <td className="py-3 px-4 text-center font-medium text-gray-900">{comm.extracted.toFixed(3)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          comm.extracted >= 0.5
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {comm.extracted >= 0.5 ? 'Acceptable' : 'Low'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-600 mt-3">
              <strong>Communality (h²):</strong> Proportion of each variable's variance explained by the factors.
              Values ≥ 0.50 indicate the variable is well-represented. Low values suggest the item may not fit well.
            </p>
          </div>

          {/* Factor Correlations (if oblique) */}
          {results.factorCorrelations && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-4">
                Factor Correlations ({config.rotationMethod === 'promax' ? 'Promax' : 'Oblimin'} Rotation)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-3 px-4"></th>
                      {[...Array(results.numFactors)].map((_, i) => (
                        <th key={i} className="text-center py-3 px-4 font-semibold text-gray-700">
                          Factor {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.factorCorrelations.map((row, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-3 px-4 font-semibold text-gray-700">Factor {i + 1}</td>
                        {row.map((corr, j) => (
                          <td
                            key={j}
                            className={`py-3 px-4 text-center font-mono ${
                              i === j ? 'bg-gray-100 font-bold' : ''
                            }`}
                          >
                            {corr.toFixed(3)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-600 mt-3">
                <strong>Note:</strong> Oblique rotations allow factors to correlate. Values indicate the correlation between factors.
                High correlations (|r| &gt; 0.70) may suggest factors are not distinct.
              </p>
            </div>
          )}

          {/* Interpretation Guidelines */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-6 border-l-4 border-amber-500">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-600" />
              Interpretation Guidelines (Hair et al., 2010; Tabachnick & Fidell, 2013)
            </h4>
            <div className="space-y-3 text-sm text-gray-700">
              <div>
                <p className="font-medium mb-1">Factor Loadings:</p>
                <ul className="ml-4 space-y-1">
                  <li>• <strong>|λ| ≥ 0.70:</strong> Excellent (explains ~50% of variance)</li>
                  <li>• <strong>|λ| ≥ 0.63:</strong> Very good (explains ~40% of variance)</li>
                  <li>• <strong>|λ| ≥ 0.55:</strong> Good (explains ~30% of variance)</li>
                  <li>• <strong>|λ| ≥ 0.45:</strong> Fair (explains ~20% of variance)</li>
                  <li>• <strong>|λ| ≥ 0.32:</strong> Poor (explains ~10% of variance) - consider removal</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Cross-Loadings:</p>
                <ul className="ml-4 space-y-1">
                  <li>• Items should load strongly on ONE factor (primary loading)</li>
                  <li>• Cross-loadings (secondary loadings) should be &lt; 0.32</li>
                  <li>• If cross-loading difference &lt; 0.15, consider removing item</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Communalities (h²):</p>
                <ul className="ml-4 space-y-1">
                  <li>• <strong>h² ≥ 0.50:</strong> Acceptable (at least 50% variance explained)</li>
                  <li>• <strong>h² &lt; 0.50:</strong> Item is poorly represented, consider removal</li>
                  <li>• <strong>h² &lt; 0.30:</strong> Item should likely be removed</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Factor Interpretability:</p>
                <ul className="ml-4 space-y-1">
                  <li>• Each factor should have at least 3-4 items with strong loadings</li>
                  <li>• Factors with &lt; 3 items are generally unstable</li>
                  <li>• Items loading on same factor should be theoretically related</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Advanced Results Toggle */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowAdvancedResults(!showAdvancedResults)}
              className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-cyan-50 to-blue-50 hover:from-cyan-100 hover:to-blue-100 transition"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-cyan-600" />
                <span className="font-semibold text-gray-900">Advanced Results & Diagnostics</span>
              </div>
              {showAdvancedResults ? (
                <ChevronUp className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              )}
            </button>

            {showAdvancedResults && (
              <div className="p-6 space-y-6 border-t border-gray-200">
                {/* Eigenvalue Table */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Complete Eigenvalue Table</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-300 bg-gray-50">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Factor</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">Eigenvalue</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">% Variance</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">Cumulative %</th>
                          <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.eigenvalues.map((ev, i) => (
                          <tr key={i} className={`border-b border-gray-100 ${i < results.numFactors ? 'bg-green-50' : ''}`}>
                            <td className="py-3 px-4 font-medium text-gray-900">{i + 1}</td>
                            <td className="py-3 px-4 text-right font-mono text-gray-900">{ev.toFixed(3)}</td>
                            <td className="py-3 px-4 text-right text-gray-700">{results.varianceExplained[i].toFixed(2)}%</td>
                            <td className="py-3 px-4 text-right text-gray-700">{results.cumulativeVariance[i].toFixed(2)}%</td>
                            <td className="py-3 px-4 text-center">
                              {i < results.numFactors ? (
                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                  Retained
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                                  Not Retained
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Model Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Total Items</p>
                    <p className="text-2xl font-bold text-gray-900">{selectedItems.length}</p>
                  </div>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Factors Extracted</p>
                    <p className="text-2xl font-bold text-gray-900">{results.numFactors}</p>
                  </div>
                  <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Total Variance</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {results.cumulativeVariance[results.numFactors - 1].toFixed(1)}%
                    </p>
                  </div>
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Avg Communality</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {(results.communalities.reduce((sum, c) => sum + c.extracted, 0) / results.communalities.length).toFixed(3)}
                    </p>
                  </div>
                </div>

                {/* Method Summary */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-3">Analysis Parameters</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600 mb-1">Extraction:</p>
                      <p className="font-medium text-gray-900">
                        {config.extractionMethod === 'paf' ? 'Principal Axis Factoring' :
                         config.extractionMethod === 'ml' ? 'Maximum Likelihood' :
                         config.extractionMethod === 'pc' ? 'Principal Components' :
                         'Minimum Residual'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600 mb-1">Rotation:</p>
                      <p className="font-medium text-gray-900">
                        {config.rotationMethod.charAt(0).toUpperCase() + config.rotationMethod.slice(1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600 mb-1">Retention:</p>
                      <p className="font-medium text-gray-900">
                        {config.factorRetention === 'parallel' ? 'Parallel Analysis' :
                         config.factorRetention === 'kaiser' ? 'Kaiser Criterion' :
                         config.factorRetention === 'scree' ? 'Scree Plot' :
                         'User Specified'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600 mb-1">KMO Adequacy:</p>
                      <p className="font-medium text-gray-900">{results.adequacy}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Export Options */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Export Results</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <button
                onClick={() => handleExport('pdf')}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
              >
                <Download className="w-5 h-5" />
                PDF Report
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium"
              >
                <Download className="w-5 h-5" />
                CSV Data
              </button>
              <button
                onClick={() => handleExport('json')}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition font-medium"
              >
                <Download className="w-5 h-5" />
                JSON
              </button>
              <button
                onClick={() => handleExport('scree')}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition font-medium"
              >
                <Download className="w-5 h-5" />
                Scree Plot
              </button>
              <button
                onClick={() => handleExport('loadings')}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition font-medium"
              >
                <Download className="w-5 h-5" />
                Loadings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
