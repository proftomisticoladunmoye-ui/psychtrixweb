import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart3, TrendingUp, AlertCircle, Download, FileImage, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { exportToCSV, exportToJSON, exportChartAsImage } from '../lib/exportUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
}

interface ItemStatistic {
  name: string;
  mean: number;
  sd: number;
  itemTotalCorrelation: number;
  alphaIfDeleted: number;
  difficulty: number;
  interpretation: string;
}

export function CTTAnalysis() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const chartRef = useRef<ChartJS<'bar'>>(null);

  const handleExport = (format: 'csv' | 'json' | 'chart') => {
    if (!results) return;

    switch (format) {
      case 'csv':
        exportToCSV(results.itemStatistics, 'CTT_Item_Statistics');
        break;
      case 'json':
        exportToJSON(results, 'CTT_Analysis_Results');
        break;
      case 'chart':
        exportChartAsImage(chartRef, 'CTT_Item_Correlations_Chart');
        break;
    }
  };

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

  const runAnalysis = async () => {
    if (!selectedDataset || selectedItems.length < 2) {
      setError('Please select a dataset and at least 2 items for reliability analysis');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const dataset = datasets.find((d) => d.id === selectedDataset);
      if (!dataset) throw new Error('Dataset not found');

      const itemData = dataset.data.map((row: any) =>
        selectedItems.map((item) => parseFloat(row[item]) || 0)
      );

      const validData = itemData.filter(row => row.every(val => !isNaN(val)));

      if (validData.length < 2) {
        throw new Error('Insufficient valid data for analysis');
      }

      const cronbachAlpha = calculateCronbachAlpha(validData);
      const itemStats = calculateItemStatistics(validData, selectedItems);
      const meanInterItemCorr = calculateMeanInterItemCorrelation(validData);
      const standardizedAlpha = calculateStandardizedAlpha(validData);

      const interpretation = getAlphaInterpretation(cronbachAlpha);

      const analysisResults = {
        cronbachAlpha,
        standardizedAlpha,
        meanInterItemCorrelation: meanInterItemCorr,
        itemStatistics: itemStats,
        interpretation,
        nItems: selectedItems.length,
        nRespondents: validData.length,
      };

      setResults(analysisResults);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateCronbachAlpha = (itemData: number[][]): number => {
    const n = itemData.length;
    const k = itemData[0].length;

    if (k < 2) return 0;

    const itemVariances: number[] = [];
    for (let j = 0; j < k; j++) {
      const itemScores = itemData.map((row) => row[j]);
      const mean = itemScores.reduce((a, b) => a + b, 0) / n;
      const variance =
        itemScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / (n - 1);
      itemVariances.push(variance);
    }

    const totalScores = itemData.map((row) => row.reduce((a, b) => a + b, 0));
    const totalMean = totalScores.reduce((a, b) => a + b, 0) / n;
    const totalVariance =
      totalScores.reduce((sum, score) => sum + Math.pow(score - totalMean, 2), 0) / (n - 1);

    const sumItemVariances = itemVariances.reduce((a, b) => a + b, 0);
    const alpha = (k / (k - 1)) * (1 - sumItemVariances / totalVariance);

    return Math.max(0, Math.min(1, alpha));
  };

  const calculateStandardizedAlpha = (itemData: number[][]): number => {
    const k = itemData[0].length;
    const meanR = calculateMeanInterItemCorrelation(itemData);
    return (k * meanR) / (1 + (k - 1) * meanR);
  };

  const calculateMeanInterItemCorrelation = (itemData: number[][]): number => {
    const k = itemData[0].length;
    const n = itemData.length;

    const correlations: number[] = [];

    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const item1 = itemData.map(row => row[i]);
        const item2 = itemData.map(row => row[j]);

        const mean1 = item1.reduce((a, b) => a + b, 0) / n;
        const mean2 = item2.reduce((a, b) => a + b, 0) / n;

        let numerator = 0;
        let sumSq1 = 0;
        let sumSq2 = 0;

        for (let idx = 0; idx < n; idx++) {
          const diff1 = item1[idx] - mean1;
          const diff2 = item2[idx] - mean2;
          numerator += diff1 * diff2;
          sumSq1 += diff1 * diff1;
          sumSq2 += diff2 * diff2;
        }

        const denominator = Math.sqrt(sumSq1 * sumSq2);
        if (denominator > 0) {
          correlations.push(numerator / denominator);
        }
      }
    }

    return correlations.length > 0
      ? correlations.reduce((a, b) => a + b, 0) / correlations.length
      : 0;
  };

  const calculateItemStatistics = (itemData: number[][], itemNames: string[]): ItemStatistic[] => {
    const n = itemData.length;
    const k = itemData[0].length;

    return itemNames.map((name, index) => {
      const itemScores = itemData.map((row) => row[index]);
      const mean = itemScores.reduce((a, b) => a + b, 0) / n;
      const variance = itemScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / (n - 1);
      const sd = Math.sqrt(variance);

      const totalScores = itemData.map((row) => row.reduce((a, b) => a + b, 0));
      const totalMean = totalScores.reduce((a, b) => a + b, 0) / n;

      let covariance = 0;
      for (let i = 0; i < n; i++) {
        covariance += (itemScores[i] - mean) * (totalScores[i] - totalMean);
      }
      covariance = covariance / (n - 1);

      const totalVariance = totalScores.reduce((sum, score) => sum + Math.pow(score - totalMean, 2), 0) / (n - 1);
      const totalSD = Math.sqrt(totalVariance);

      const itemTotalCorrelation = sd > 0 && totalSD > 0 ? covariance / (sd * totalSD) : 0;

      const dataWithoutItem = itemData.map((row) => row.filter((_, i) => i !== index));
      const alphaIfDeleted = k > 2 ? calculateCronbachAlpha(dataWithoutItem) : 0;

      const maxScore = Math.max(...itemScores);
      const minScore = Math.min(...itemScores);
      const range = maxScore - minScore;
      const difficulty = range > 0 ? (mean - minScore) / range : 0.5;

      let interpretation = '';
      if (itemTotalCorrelation >= 0.30) {
        interpretation = 'Good';
      } else if (itemTotalCorrelation >= 0.20) {
        interpretation = 'Marginal';
      } else {
        interpretation = 'Poor';
      }

      return {
        name,
        mean,
        sd,
        itemTotalCorrelation,
        alphaIfDeleted,
        difficulty,
        interpretation,
      };
    });
  };

  const getAlphaInterpretation = (alpha: number): string => {
    if (alpha >= 0.90) return 'Excellent';
    if (alpha >= 0.80) return 'Good';
    if (alpha >= 0.70) return 'Acceptable';
    if (alpha >= 0.60) return 'Questionable';
    if (alpha >= 0.50) return 'Poor';
    return 'Unacceptable';
  };

  const getAlphaColor = (alpha: number): string => {
    if (alpha >= 0.90) return 'text-green-700 bg-green-50 border-green-200';
    if (alpha >= 0.80) return 'text-blue-700 bg-blue-50 border-blue-200';
    if (alpha >= 0.70) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  const getItemIcon = (interpretation: string) => {
    if (interpretation === 'Good') return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (interpretation === 'Marginal') return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    return <XCircle className="w-4 h-4 text-red-600" />;
  };

  const currentDataset = datasets.find((d) => d.id === selectedDataset);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Classical Test Theory Analysis</h1>
        <p className="text-gray-600 mt-1">Comprehensive reliability and item statistics based on CTT framework</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Dataset</label>
          <select
            value={selectedDataset}
            onChange={(e) => {
              setSelectedDataset(e.target.value);
              setSelectedItems([]);
              setResults(null);
            }}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Items ({selectedItems.length} selected)
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-4 border border-gray-200 rounded-lg">
              {currentDataset.columns.map((col) => (
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
        )}

        <button
          onClick={runAnalysis}
          disabled={loading || !selectedDataset || selectedItems.length < 2}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Analyzing...' : 'Run CTT Analysis'}
        </button>
      </div>

      {results && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Reliability Analysis</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className={`p-4 rounded-lg border-2 ${getAlphaColor(results.cronbachAlpha)}`}>
                <p className="text-xs font-medium mb-1">Cronbach's Alpha (α)</p>
                <p className="text-3xl font-bold">
                  {results.cronbachAlpha.toFixed(3)}
                </p>
                <p className="text-xs mt-1 font-medium">{results.interpretation}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                <p className="text-xs text-gray-600 mb-1">Standardized α</p>
                <p className="text-3xl font-bold text-gray-900">
                  {results.standardizedAlpha.toFixed(3)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Based on correlations</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Mean Inter-Item r</p>
                <p className="text-3xl font-bold text-gray-900">
                  {results.meanInterItemCorrelation.toFixed(3)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Average correlation</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <p className="text-xs text-gray-600 mb-1">Scale Information</p>
                <p className="text-lg font-bold text-gray-900">
                  {results.nItems} items
                </p>
                <p className="text-xs text-gray-500 mt-1">{results.nRespondents} respondents</p>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-600">
              <h3 className="font-semibold text-sm text-gray-900 mb-2">Interpretation Guidelines</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700">
                <div>α ≥ 0.90: Excellent (high-stakes decisions)</div>
                <div>α ≥ 0.80: Good (research purposes)</div>
                <div>α ≥ 0.70: Acceptable (exploratory research)</div>
                <div>α &lt; 0.70: Questionable/Poor (needs improvement)</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Item Statistics</h2>
            </div>

            <div className="mb-8">
              <h3 className="text-sm font-medium text-gray-700 mb-4">Item-Total Correlations</h3>
              <Bar
                ref={chartRef}
                data={{
                  labels: results.itemStatistics.map((item: ItemStatistic) => item.name),
                  datasets: [
                    {
                      label: 'Item-Total Correlation',
                      data: results.itemStatistics.map((item: ItemStatistic) => item.itemTotalCorrelation),
                      backgroundColor: results.itemStatistics.map((item: ItemStatistic) => {
                        if (item.itemTotalCorrelation >= 0.30) return 'rgba(34, 197, 94, 0.7)';
                        if (item.itemTotalCorrelation >= 0.20) return 'rgba(234, 179, 8, 0.7)';
                        return 'rgba(239, 68, 68, 0.7)';
                      }),
                      borderColor: results.itemStatistics.map((item: ItemStatistic) => {
                        if (item.itemTotalCorrelation >= 0.30) return 'rgb(34, 197, 94)';
                        if (item.itemTotalCorrelation >= 0.20) return 'rgb(234, 179, 8)';
                        return 'rgb(239, 68, 68)';
                      }),
                      borderWidth: 2,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: true,
                  plugins: {
                    legend: {
                      display: false,
                    },
                    title: {
                      display: false,
                    },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          const value = context.parsed.y.toFixed(3);
                          const item = results.itemStatistics[context.dataIndex];
                          return [
                            `Correlation: ${value}`,
                            `Quality: ${item.interpretation}`,
                            `Difficulty: ${item.difficulty.toFixed(2)}`
                          ];
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
                        text: 'Correlation Coefficient (r)',
                        font: {
                          size: 12,
                          weight: 'bold'
                        }
                      },
                      grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                      }
                    },
                    x: {
                      title: {
                        display: true,
                        text: 'Items',
                        font: {
                          size: 12,
                          weight: 'bold'
                        }
                      },
                      grid: {
                        display: false
                      }
                    },
                  },
                }}
              />
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <h4 className="font-semibold text-xs text-gray-900 mb-2">Item Quality Indicators:</h4>
              <div className="flex flex-wrap gap-4 text-xs text-gray-700">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-green-600 rounded"></div>
                  <span>Good (r ≥ 0.30)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                  <span>Marginal (0.20 ≤ r &lt; 0.30)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-red-500 rounded"></div>
                  <span>Poor (r &lt; 0.20)</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-300 bg-gray-50">
                    <th className="text-left py-3 px-4 text-xs font-bold text-gray-700">
                      Item
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-bold text-gray-700">
                      Mean
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-bold text-gray-700">
                      SD
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-bold text-gray-700">
                      Item-Total r
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-bold text-gray-700">
                      α if Deleted
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-bold text-gray-700">
                      Difficulty
                    </th>
                    <th className="text-center py-3 px-4 text-xs font-bold text-gray-700">
                      Quality
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.itemStatistics.map((item: ItemStatistic, index: number) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm font-medium text-gray-900">{item.name}</td>
                      <td className="py-3 px-4 text-sm text-right text-gray-700">{item.mean.toFixed(2)}</td>
                      <td className="py-3 px-4 text-sm text-right text-gray-700">{item.sd.toFixed(2)}</td>
                      <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">
                        {item.itemTotalCorrelation.toFixed(3)}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-700">
                        {item.alphaIfDeleted.toFixed(3)}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-700">
                        {item.difficulty.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {getItemIcon(item.interpretation)}
                          <span className={`text-xs font-medium ${
                            item.interpretation === 'Good' ? 'text-green-700' :
                            item.interpretation === 'Marginal' ? 'text-yellow-700' :
                            'text-red-700'
                          }`}>
                            {item.interpretation}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 p-4 bg-amber-50 rounded-lg border-l-4 border-amber-500">
              <h4 className="font-semibold text-sm text-gray-900 mb-2">Recommendations</h4>
              <ul className="text-xs text-gray-700 space-y-1">
                <li>• Items with r &lt; 0.20 should be reviewed or removed</li>
                <li>• If α if Deleted is higher than overall α, consider removing that item</li>
                <li>• Difficulty values near 0.50 indicate optimal item difficulty</li>
                <li>• Consider item revision if SD is very low (lack of variance)</li>
              </ul>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              <button
                onClick={() => handleExport('csv')}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
              >
                <Download className="w-4 h-4" />
                Export JSON
              </button>
              <button
                onClick={() => handleExport('chart')}
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
  );
}
