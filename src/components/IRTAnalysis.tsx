import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { LineChart, AlertCircle, TrendingUp, Download, FileImage, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { exportToCSV, exportToJSON, exportChartAsImage, exportIRTResults } from '../lib/exportUtils';
import { IRTEstimator } from '../lib/itemResponseTheory';
import { saveAnalysisHistory } from '../lib/analysisHistory';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
}

interface ItemParameter {
  name: string;
  difficulty: number;
  discrimination: number;
  guessing: number;
  quality: string;
}

export function IRTAnalysis() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [model, setModel] = useState<'1PL' | '2PL' | '3PL'>('2PL');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const iccChartRef = useRef<ChartJS<'line'>>(null);
  const tifChartRef = useRef<ChartJS<'line'>>(null);

  const handleExport = (format: 'csv' | 'json' | 'icc' | 'tif' | 'report') => {
    if (!results) return;

    switch (format) {
      case 'csv':
        exportToCSV(results.itemParameters, 'IRT_Item_Parameters');
        break;
      case 'json':
        exportToJSON(results, 'IRT_Analysis_Results');
        break;
      case 'icc':
        exportChartAsImage(iccChartRef, 'IRT_Item_Characteristic_Curves');
        break;
      case 'tif':
        exportChartAsImage(tifChartRef, 'IRT_Test_Information_Function');
        break;
      case 'report':
        exportIRTResults(results, model);
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
    if (!selectedDataset || selectedItems.length < 3) {
      setError('Please select a dataset and at least 3 items for IRT analysis');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const dataset = datasets.find((d) => d.id === selectedDataset);
      if (!dataset) throw new Error('Dataset not found');

      const itemData = dataset.data.map((row: any) =>
        selectedItems.map((item) => {
          const val = parseFloat(row[item]);
          return isNaN(val) ? 0 : Math.round(val);
        })
      );

      const validData = itemData.filter(row =>
        row.every(val => !isNaN(val) && isFinite(val) && (val === 0 || val === 1))
      );

      if (validData.length < 30) {
        throw new Error('Insufficient valid data for IRT analysis (need at least 30 respondents with binary responses)');
      }

      const irtResults = IRTEstimator.estimate(validData, selectedItems, model, 100, 0.001);

      const itemParams: ItemParameter[] = irtResults.itemParameters.map(item => {
        const quality =
          item.discrimination > 1.5 ? 'Excellent' :
          item.discrimination > 1.0 ? 'Good' :
          item.discrimination > 0.5 ? 'Moderate' : 'Low';

        return {
          name: item.item,
          difficulty: item.difficulty,
          discrimination: item.discrimination,
          guessing: item.guessing,
          quality
        };
      });

      const abilityEstimates = irtResults.personAbilities.map(person => ({
        person: person.person,
        ability: person.ability,
        se: person.se,
        reliability: 1 - (person.se * person.se)
      }));

      const analysisResults = {
        model,
        itemParameters: itemParams,
        abilityEstimates,
        modelFit: {
          logLikelihood: irtResults.fitStatistics.logLikelihood,
          aic: irtResults.fitStatistics.aic,
          bic: irtResults.fitStatistics.bic,
          itemFit: irtResults.fitStatistics.itemFit
        },
        itemInformation: irtResults.icc,
        testInformation: {
          abilityLevels: irtResults.tif.abilityLevels,
          information: irtResults.tif.information,
          se: irtResults.tif.se
        },
        reliability: irtResults.reliabilityIndices,
        nItems: selectedItems.length,
        nRespondents: validData.length,
      };

      setResults(analysisResults);

      const currentDataset = datasets.find(d => d.id === selectedDataset);
      await saveAnalysisHistory({
        analysis_type: 'irt',
        analysis_name: `IRT ${model} Analysis - ${currentDataset?.name} (${selectedItems.length} items)`,
        dataset_id: selectedDataset,
        dataset_name: currentDataset?.name,
        configuration: {
          model,
          selectedItems,
          numItems: selectedItems.length,
          numRespondents: validData.length
        },
        results: analysisResults,
        status: 'completed'
      });
    } catch (err: any) {
      console.error('IRT Analysis Error:', err);
      setError(err.message || 'An error occurred during IRT analysis');
    } finally {
      setLoading(false);
    }
  };

  const estimateIRTParameters = (itemData: number[][], itemNames: string[], modelType: string): ItemParameter[] => {
    const n = itemData.length;
    const k = itemData[0].length;

    return itemNames.map((name, itemIdx) => {
      const itemScores = itemData.map(row => row[itemIdx]);
      const mean = itemScores.reduce((a, b) => a + b, 0) / n;
      const variance = itemScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / (n - 1);
      const sd = Math.sqrt(variance);

      const totalScores = itemData.map(row => row.reduce((a, b) => a + b, 0));
      const sortedIndices = totalScores
        .map((score, idx) => ({ score, idx }))
        .sort((a, b) => a.score - b.score)
        .map(x => x.idx);

      const lowerGroup = sortedIndices.slice(0, Math.floor(n * 0.27));
      const upperGroup = sortedIndices.slice(-Math.floor(n * 0.27));

      const pLower = lowerGroup.reduce((sum, idx) => sum + itemScores[idx], 0) / lowerGroup.length;
      const pUpper = upperGroup.reduce((sum, idx) => sum + itemScores[idx], 0) / upperGroup.length;

      const maxScore = Math.max(...itemScores);
      const minScore = Math.min(...itemScores);
      const range = maxScore - minScore || 1;

      const p = (mean - minScore) / range;

      let difficulty: number;
      if (p <= 0.01) {
        difficulty = 2.5;
      } else if (p >= 0.99) {
        difficulty = -2.5;
      } else {
        difficulty = -Math.log(p / (1 - p));
      }

      let discrimination: number;
      if (modelType === '1PL') {
        discrimination = 1.0;
      } else {
        const discriminationIndex = (pUpper - pLower);
        discrimination = Math.max(0.1, Math.min(3.0, discriminationIndex * 3.5));
      }

      let guessing = 0;
      if (modelType === '3PL') {
        const lowerBound = Math.min(...itemScores.map((score, idx) => {
          const totalScore = totalScores[idx];
          return totalScore < totalScores[Math.floor(n * 0.1)] ? score : Infinity;
        }).filter(x => x !== Infinity));

        guessing = Math.max(0, Math.min(0.35, (lowerBound / range) * 0.8));
      }

      let quality = 'Good';
      if (modelType !== '1PL') {
        if (discrimination < 0.5) {
          quality = 'Poor';
        } else if (discrimination < 0.8) {
          quality = 'Marginal';
        }
      }

      if (Math.abs(difficulty) > 3) {
        quality = 'Extreme';
      }

      if (modelType === '3PL' && guessing > 0.35) {
        quality = 'Problematic';
      }

      return {
        name,
        difficulty,
        discrimination,
        guessing,
        quality,
      };
    });
  };

  const estimateAbilities = (itemData: number[][], itemParams: ItemParameter[], modelType: string): number[] => {
    return itemData.map(responses => {
      const totalScore = responses.reduce((a, b) => a + b, 0);
      const maxScore = responses.length;
      const proportion = totalScore / maxScore;

      if (proportion <= 0.01) return -3.0;
      if (proportion >= 0.99) return 3.0;

      let theta = -Math.log((1 - proportion) / proportion);

      for (let iter = 0; iter < 10; iter++) {
        let logLikelihoodDerivative = 0;
        let logLikelihoodSecondDerivative = 0;

        responses.forEach((response, idx) => {
          const { difficulty, discrimination, guessing } = itemParams[idx];
          const a = modelType === '1PL' ? 1.0 : discrimination;
          const b = difficulty;
          const c = modelType === '3PL' ? guessing : 0;

          const exp_val = Math.max(-500, Math.min(500, a * (theta - b)));
          const prob = c + (1 - c) / (1 + Math.exp(-exp_val));
          const q = 1 - prob;

          if (c > 0 && prob > c + 1e-10 && q > 1e-10) {
            // Correct 3PL score equations (Bock & Aitkin 1981)
            const pMinusC = prob - c;
            const oneMinusC = 1 - c;
            const weight = a * pMinusC * q / (oneMinusC * prob);
            logLikelihoodDerivative += weight * (response - prob);
            logLikelihoodSecondDerivative -= weight * weight * prob * q;
          } else {
            logLikelihoodDerivative += a * (response - prob);
            logLikelihoodSecondDerivative -= a * a * prob * q;
          }
        });

        if (Math.abs(logLikelihoodDerivative) < 0.001) break;
        if (Math.abs(logLikelihoodSecondDerivative) < 1e-10) break;

        const adjustment = logLikelihoodDerivative / logLikelihoodSecondDerivative;
        theta = theta - adjustment;

        theta = Math.max(-4, Math.min(4, theta));
      }

      return theta;
    });
  };

  const calculateModelFit = (itemData: number[][], itemParams: ItemParameter[], abilities: number[], modelType: string) => {
    let logLikelihood = 0;

    itemData.forEach((responses, personIdx) => {
      const theta = abilities[personIdx];

      responses.forEach((response, itemIdx) => {
        const { difficulty, discrimination, guessing } = itemParams[itemIdx];
        const a = modelType === '1PL' ? 1.0 : discrimination;
        const b = difficulty;
        const c = modelType === '3PL' ? guessing : 0;

        const prob = c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
        const itemLL = response * Math.log(prob + 1e-10) + (1 - response) * Math.log(1 - prob + 1e-10);
        logLikelihood += itemLL;
      });
    });

    const nParams = modelType === '1PL' ? itemParams.length :
                     modelType === '2PL' ? itemParams.length * 2 :
                     itemParams.length * 3;

    const aic = -2 * logLikelihood + 2 * nParams;
    const bic = -2 * logLikelihood + nParams * Math.log(itemData.length);

    return {
      logLikelihood: logLikelihood.toFixed(2),
      aic: aic.toFixed(2),
      bic: bic.toFixed(2),
      nParameters: nParams,
    };
  };

  const calculateItemInformation = (itemParams: ItemParameter[], modelType: string) => {
    const thetaRange = Array.from({ length: 61 }, (_, i) => (i - 30) / 10);

    return itemParams.map(item => {
      const { difficulty, discrimination, guessing } = item;
      const a = modelType === '1PL' ? 1.0 : discrimination;
      const b = difficulty;
      const c = modelType === '3PL' ? guessing : 0;

      const information = thetaRange.map(theta => {
        const exp_val = Math.max(-500, Math.min(500, a * (theta - b)));
        const prob = c + (1 - c) / (1 + Math.exp(-exp_val));
        const q = 1 - prob;

        if (modelType === '3PL' && c > 0) {
          // I(θ) = a²·(P-c)²·Q / ((1-c)²·P)  [Baker & Kim 2004, eq. 6.3]
          const oneMinusC = 1 - c;
          if (prob < 1e-10 || q < 1e-10 || oneMinusC < 1e-10) return 0;
          return (a * a * (prob - c) * (prob - c) * q) / (oneMinusC * oneMinusC * prob);
        } else {
          return a * a * prob * q;
        }
      });

      return {
        item: item.name,
        information,
      };
    });
  };

  const calculateTestInformation = (itemParams: ItemParameter[], modelType: string) => {
    const thetaRange = Array.from({ length: 61 }, (_, i) => (i - 30) / 10);

    const testInfo = thetaRange.map((theta, idx) => {
      let totalInfo = 0;

      itemParams.forEach(item => {
        const { difficulty, discrimination, guessing } = item;
        const a = modelType === '1PL' ? 1.0 : discrimination;
        const b = difficulty;
        const c = modelType === '3PL' ? guessing : 0;

        const exp_val = Math.max(-500, Math.min(500, a * (theta - b)));
        const prob = c + (1 - c) / (1 + Math.exp(-exp_val));
        const q = 1 - prob;

        if (modelType === '3PL' && c > 0) {
          const oneMinusC = 1 - c;
          if (prob > 1e-10 && q > 1e-10 && oneMinusC > 1e-10) {
            totalInfo += (a * a * (prob - c) * (prob - c) * q) / (oneMinusC * oneMinusC * prob);
          }
        } else {
          totalInfo += a * a * prob * q;
        }
      });

      return totalInfo;
    });

    return {
      theta: thetaRange,
      information: testInfo,
      standardError: testInfo.map(info => 1 / Math.sqrt(info)),
    };
  };

  const getParameterInterpretation = (param: ItemParameter, modelType: string) => {
    const { difficulty, discrimination, guessing } = param;
    const issues: string[] = [];

    if (Math.abs(difficulty) > 3) {
      issues.push('Extreme difficulty');
    }

    if (modelType !== '1PL' && discrimination < 0.5) {
      issues.push('Low discrimination');
    }

    if (modelType === '3PL' && guessing > 0.35) {
      issues.push('High guessing');
    }

    return issues.length > 0 ? issues.join(', ') : 'Good item';
  };

  const getQualityIcon = (quality: string) => {
    if (quality === 'Good') return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (quality === 'Marginal') return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    return <XCircle className="w-4 h-4 text-red-600" />;
  };

  const currentDataset = datasets.find((d) => d.id === selectedDataset);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Item Response Theory Analysis</h1>
        <p className="text-gray-600 mt-1">Advanced psychometric modeling with IRT framework</p>
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">IRT Model</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div
              className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                model === '1PL' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setModel('1PL')}
            >
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="radio"
                  name="model"
                  value="1PL"
                  checked={model === '1PL'}
                  onChange={() => {}}
                  className="text-blue-600"
                />
                <span className="font-semibold text-gray-900">1PL (Rasch)</span>
              </div>
              <p className="text-xs text-gray-600">Difficulty only. Equal discrimination.</p>
            </div>

            <div
              className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                model === '2PL' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setModel('2PL')}
            >
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="radio"
                  name="model"
                  value="2PL"
                  checked={model === '2PL'}
                  onChange={() => {}}
                  className="text-blue-600"
                />
                <span className="font-semibold text-gray-900">2PL Model</span>
              </div>
              <p className="text-xs text-gray-600">Difficulty + Discrimination. Most common.</p>
            </div>

            <div
              className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                model === '3PL' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setModel('3PL')}
            >
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="radio"
                  name="model"
                  value="3PL"
                  checked={model === '3PL'}
                  onChange={() => {}}
                  className="text-blue-600"
                />
                <span className="font-semibold text-gray-900">3PL Model</span>
              </div>
              <p className="text-xs text-gray-600">Difficulty + Discrimination + Guessing.</p>
            </div>
          </div>
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
          disabled={loading || !selectedDataset || selectedItems.length < 3}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Analyzing...' : 'Run IRT Analysis'}
        </button>
      </div>

      {results && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Model Fit Statistics</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Model</p>
                <p className="text-2xl font-bold text-gray-900">{model}</p>
                <p className="text-xs text-gray-500 mt-1">{results.nItems} items</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <p className="text-xs text-gray-600 mb-1">Log-Likelihood</p>
                <p className="text-2xl font-bold text-gray-900">{results.modelFit.logLikelihood}</p>
                <p className="text-xs text-gray-500 mt-1">Model fit</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
                <p className="text-xs text-gray-600 mb-1">AIC</p>
                <p className="text-2xl font-bold text-gray-900">{results.modelFit.aic}</p>
                <p className="text-xs text-gray-500 mt-1">Lower is better</p>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg border-2 border-orange-200">
                <p className="text-xs text-gray-600 mb-1">BIC</p>
                <p className="text-2xl font-bold text-gray-900">{results.modelFit.bic}</p>
                <p className="text-xs text-gray-500 mt-1">Penalizes complexity</p>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-600">
              <h3 className="font-semibold text-sm text-gray-900 mb-2">Model Comparison Guidelines</h3>
              <div className="text-xs text-gray-700 space-y-1">
                <p>• <strong>Lower AIC/BIC:</strong> Better model fit</p>
                <p>• <strong>ΔAIC &gt; 10:</strong> Strong evidence for better model</p>
                <p>• <strong>BIC:</strong> More conservative, penalizes parameters more heavily</p>
                <p>• Compare models on same data to select best fit</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <LineChart className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Item Characteristic Curves</h2>
              </div>
              <button
                onClick={() => exportChartAsImage(iccChartRef, `IRT_${model}_Item_Characteristic_Curves`)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                <FileImage className="w-4 h-4" />
                Export PNG
              </button>
            </div>

            <div className="mb-6">
              <Line
                ref={iccChartRef}
                data={{
                  labels: Array.from({ length: 61 }, (_, i) => ((i - 30) / 10).toFixed(1)),
                  datasets: results.itemParameters.slice(0, 8).map((item: ItemParameter, index: number) => {
                    const colors = [
                      'rgb(59, 130, 246)', 'rgb(16, 185, 129)', 'rgb(245, 158, 11)',
                      'rgb(239, 68, 68)', 'rgb(139, 92, 246)', 'rgb(236, 72, 153)',
                      'rgb(14, 165, 233)', 'rgb(34, 197, 94)'
                    ];
                    const ability = Array.from({ length: 61 }, (_, i) => (i - 30) / 10);
                    const a = model === '1PL' ? 1.0 : item.discrimination;
                    const b = item.difficulty;
                    const c = model === '3PL' ? item.guessing : 0;

                    const probabilities = ability.map(theta => {
                      const prob = c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
                      return prob;
                    });

                    return {
                      label: item.name,
                      data: probabilities,
                      borderColor: colors[index % colors.length],
                      backgroundColor: 'transparent',
                      borderWidth: 2,
                      tension: 0.4,
                      pointRadius: 0,
                    };
                  }),
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: true,
                  plugins: {
                    legend: {
                      position: 'right' as const,
                      labels: {
                        boxWidth: 12,
                        font: {
                          size: 10
                        }
                      }
                    },
                    title: {
                      display: true,
                      text: `Item Characteristic Curves - ${model} Model (First 8 Items)`,
                      font: {
                        size: 14,
                        weight: 'bold'
                      }
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 1,
                      title: {
                        display: true,
                        text: 'P(θ) - Probability of Correct Response',
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
                        text: 'Ability (θ)',
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

            <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-700">
              <strong>Interpretation:</strong> Each curve shows the probability of a correct response at different ability levels.
              Steeper curves indicate better discrimination. Curves shifted right are more difficult items.
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <LineChart className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Test Information Function</h2>
              </div>
              <button
                onClick={() => exportChartAsImage(tifChartRef, `IRT_${model}_Test_Information_Function`)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                <FileImage className="w-4 h-4" />
                Export PNG
              </button>
            </div>

            <div className="mb-6">
              <Line
                ref={tifChartRef}
                data={{
                  labels: results.testInformation.theta.map((t: number) => t.toFixed(1)),
                  datasets: [
                    {
                      label: 'Test Information',
                      data: results.testInformation.information,
                      borderColor: 'rgb(59, 130, 246)',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      borderWidth: 3,
                      fill: true,
                      tension: 0.4,
                      pointRadius: 0,
                      yAxisID: 'y',
                    },
                    {
                      label: 'Standard Error (SE)',
                      data: results.testInformation.standardError,
                      borderColor: 'rgb(239, 68, 68)',
                      backgroundColor: 'transparent',
                      borderWidth: 2,
                      borderDash: [5, 5],
                      tension: 0.4,
                      pointRadius: 0,
                      yAxisID: 'y1',
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: true,
                  interaction: {
                    mode: 'index' as const,
                    intersect: false,
                  },
                  plugins: {
                    legend: {
                      position: 'top' as const,
                    },
                    title: {
                      display: true,
                      text: 'Test Information and Standard Error',
                      font: {
                        size: 14,
                        weight: 'bold'
                      }
                    },
                  },
                  scales: {
                    y: {
                      type: 'linear' as const,
                      display: true,
                      position: 'left' as const,
                      title: {
                        display: true,
                        text: 'Information I(θ)',
                        font: {
                          size: 12,
                          weight: 'bold'
                        }
                      },
                      grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                      }
                    },
                    y1: {
                      type: 'linear' as const,
                      display: true,
                      position: 'right' as const,
                      title: {
                        display: true,
                        text: 'Standard Error SE(θ)',
                        font: {
                          size: 12,
                          weight: 'bold'
                        }
                      },
                      grid: {
                        drawOnChartArea: false,
                      },
                    },
                    x: {
                      title: {
                        display: true,
                        text: 'Ability (θ)',
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

            <div className="p-3 bg-amber-50 rounded-lg border-l-4 border-amber-500 text-xs text-gray-700">
              <strong>Interpretation:</strong> The test information function shows measurement precision at different ability levels.
              Higher information = more precise measurement (lower standard error). SE(θ) = 1/√I(θ).
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <LineChart className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Item Parameters ({model} Model)</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-300 bg-gray-50">
                    <th className="text-left py-3 px-4 text-xs font-bold text-gray-700">
                      Item
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-bold text-gray-700">
                      Difficulty (b)
                    </th>
                    {(model === '2PL' || model === '3PL') && (
                      <th className="text-right py-3 px-4 text-xs font-bold text-gray-700">
                        Discrimination (a)
                      </th>
                    )}
                    {model === '3PL' && (
                      <th className="text-right py-3 px-4 text-xs font-bold text-gray-700">
                        Guessing (c)
                      </th>
                    )}
                    <th className="text-center py-3 px-4 text-xs font-bold text-gray-700">
                      Quality
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-gray-700">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.itemParameters.map((item: ItemParameter, index: number) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm font-medium text-gray-900">{item.name}</td>
                      <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">
                        {item.difficulty.toFixed(3)}
                      </td>
                      {(model === '2PL' || model === '3PL') && (
                        <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">
                          {item.discrimination.toFixed(3)}
                        </td>
                      )}
                      {model === '3PL' && (
                        <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">
                          {item.guessing.toFixed(3)}
                        </td>
                      )}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {getQualityIcon(item.quality)}
                          <span className={`text-xs font-medium ${
                            item.quality === 'Good' ? 'text-green-700' :
                            item.quality === 'Marginal' ? 'text-yellow-700' :
                            'text-red-700'
                          }`}>
                            {item.quality}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600">
                        {getParameterInterpretation(item, model)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-600">
              <h3 className="font-semibold text-sm text-gray-900 mb-3">Parameter Interpretation Guidelines</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-700">
                <div>
                  <strong>Difficulty (b):</strong>
                  <ul className="mt-1 space-y-0.5 ml-2">
                    <li>• b &gt; 2: Very difficult</li>
                    <li>• -1 &lt; b &lt; 1: Moderate (ideal)</li>
                    <li>• b &lt; -2: Very easy</li>
                  </ul>
                </div>
                {model !== '1PL' && (
                  <div>
                    <strong>Discrimination (a):</strong>
                    <ul className="mt-1 space-y-0.5 ml-2">
                      <li>• a &gt; 1.5: Excellent</li>
                      <li>• 0.8 &lt; a &lt; 1.5: Good</li>
                      <li>• a &lt; 0.5: Poor (remove)</li>
                    </ul>
                  </div>
                )}
                {model === '3PL' && (
                  <div>
                    <strong>Guessing (c):</strong>
                    <ul className="mt-1 space-y-0.5 ml-2">
                      <li>• 4-option: c ≈ 0.25</li>
                      <li>• 5-option: c ≈ 0.20</li>
                      <li>• c &gt; 0.35: Problematic</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
              <button
                onClick={() => handleExport('report')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                HTML Report
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                CSV Data
              </button>
              <button
                onClick={() => handleExport('json')}
                className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                JSON
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Individual charts can be exported using the "Export PNG" buttons above each chart
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
