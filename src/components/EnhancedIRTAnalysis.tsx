import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  LineChart, AlertCircle, TrendingUp, Download, CheckCircle,
  XCircle, Settings, RefreshCw, Link, GitCompare, Users
} from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  IRTEstimator,
  IRTParameters,
  EquatingResults,
  LinkingResults,
  DIFResults
} from '../lib/itemResponseTheory';
import { exportToCSV, exportToJSON, exportChartAsImage } from '../lib/exportUtils';
import { saveAnalysisHistory } from '../lib/analysisHistory';
import { rAnalysisClient } from '../lib/rAnalysisClient';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
}

type AnalysisTab = 'calibration' | 'equating' | 'linking' | 'dif';

export function EnhancedIRTAnalysis() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeTab, setActiveTab] = useState<AnalysisTab>('calibration');
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [model, setModel] = useState<'1PL' | '2PL' | '3PL' | '4PL'>('2PL');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [useRBackend, setUseRBackend] = useState(false);
  const [rJobId, setRJobId] = useState<string | null>(null);
  const [rImages, setRImages] = useState<string[]>([]);

  const [secondDataset, setSecondDataset] = useState<string>('');
  const [secondItems, setSecondItems] = useState<string[]>([]);
  const [equatingResults, setEquatingResults] = useState<EquatingResults | null>(null);
  const [linkingResults, setLinkingResults] = useState<LinkingResults | null>(null);
  const [difResults, setDIFResults] = useState<DIFResults[]>([]);
  const [groupVariable, setGroupVariable] = useState<string>('');

  const iccChartRef = useRef<ChartJS<'line'>>(null);
  const tifChartRef = useRef<ChartJS<'line'>>(null);

  const currentDataset = datasets.find(d => d.id === selectedDataset);
  const availableColumns = currentDataset?.columns || [];

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

  const runIRTCalibrationWithR = async () => {
    if (!currentDataset || selectedItems.length < 3) {
      setError('Please select at least 3 items for IRT analysis');
      return;
    }

    const itemData = currentDataset.data.map((row: any) =>
      selectedItems.map((item) => {
        const val = parseFloat(row[item]);
        return isNaN(val) ? 0 : Math.round(val);
      })
    );

    const validData = itemData.filter(row =>
      row.every(val => !isNaN(val) && isFinite(val) && (val === 0 || val === 1))
    );

    if (validData.length < 30) {
      throw new Error('Need at least 30 respondents with binary responses');
    }

    const inputData = {
      data: validData,
      variables: selectedItems
    };

    const jobType = model === '3PL' ? 'irt_3pl_model' : 'irt_2pl_model';

    try {
      const { success, jobId, cached, data: cachedData, images, error: submitError } = await rAnalysisClient.submitJob({
        jobType,
        inputData,
        parameters: {},
        useCache: true
      });

      if (!success || (!jobId && !cached)) {
        throw new Error(submitError || 'Failed to submit R analysis job');
      }

      if (cached && cachedData) {
        setResults(cachedData);
        setRImages(images || []);
        return;
      }

      setRJobId(jobId!);

      const job = await rAnalysisClient.pollJobUntilComplete(jobId!, (job) => {
        console.log('IRT job status:', job.status);
      });

      if (!job || job.status !== 'completed') {
        throw new Error(job?.error_message || 'R analysis failed');
      }

      const rResults = job.output_data;
      setResults(rResults);
      setRImages(job.output_images || []);

      return rResults;
    } catch (error: any) {
      throw new Error(`R backend error: ${error.message}`);
    }
  };

  const runIRTCalibration = async () => {
    if (!currentDataset || selectedItems.length < 3) {
      setError('Please select at least 3 items for IRT analysis');
      return;
    }

    setLoading(true);
    setError('');
    setRImages([]);

    try {
      let irtResults;

      if (useRBackend) {
        irtResults = await runIRTCalibrationWithR();
      } else {
        const itemData = currentDataset.data.map((row: any) =>
          selectedItems.map((item) => {
            const val = parseFloat(row[item]);
            return isNaN(val) ? 0 : Math.round(val);
          })
        );

        const validData = itemData.filter(row =>
          row.every(val => !isNaN(val) && isFinite(val) && (val === 0 || val === 1))
        );

        if (validData.length < 30) {
          throw new Error('Need at least 30 respondents with binary responses');
        }

        irtResults = IRTEstimator.estimate(validData, selectedItems, model, 100, 0.001);
        setResults(irtResults);
      }

      setResults(irtResults);

      await saveAnalysisHistory({
        analysis_type: 'irt',
        analysis_name: `IRT ${model} Calibration - ${currentDataset.name}`,
        dataset_id: selectedDataset,
        dataset_name: currentDataset.name,
        configuration: { model, selectedItems, numItems: selectedItems.length },
        results: irtResults,
        status: 'completed'
      });
    } catch (err: any) {
      setError(err.message || 'Error during IRT calibration');
    } finally {
      setLoading(false);
    }
  };

  const runTestEquating = async () => {
    if (!currentDataset || !secondDataset || selectedItems.length < 3 || secondItems.length < 3) {
      setError('Please select two datasets with items for equating');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const dataset1 = datasets.find(d => d.id === selectedDataset);
      const dataset2 = datasets.find(d => d.id === secondDataset);

      if (!dataset1 || !dataset2) throw new Error('Datasets not found');

      const scores1 = dataset1.data.map((row: any) =>
        selectedItems.reduce((sum, item) => sum + (parseFloat(row[item]) || 0), 0)
      );

      const scores2 = dataset2.data.map((row: any) =>
        secondItems.reduce((sum, item) => sum + (parseFloat(row[item]) || 0), 0)
      );

      const meanSigmaResults = IRTEstimator.equateMeanSigma(scores1, scores2);
      const linearResults = IRTEstimator.equateLinear(scores1, scores2);
      const equipercentileResults = IRTEstimator.equateEquipercentile(scores1, scores2);

      setEquatingResults({
        meanSigma: meanSigmaResults,
        linear: linearResults,
        equipercentile: equipercentileResults
      } as any);

      await saveAnalysisHistory({
        analysis_type: 'irt_equating',
        analysis_name: `Test Equating - ${dataset1.name} & ${dataset2.name}`,
        dataset_id: selectedDataset,
        dataset_name: dataset1.name,
        configuration: { dataset1: selectedDataset, dataset2: secondDataset, selectedItems, secondItems },
        results: { meanSigmaResults, linearResults, equipercentileResults },
        status: 'completed'
      });
    } catch (err: any) {
      setError(err.message || 'Error during test equating');
    } finally {
      setLoading(false);
    }
  };

  const runTestLinking = async () => {
    if (!currentDataset || !secondDataset || selectedItems.length < 5 || secondItems.length < 5) {
      setError('Please select two datasets with at least 5 common items for linking');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const dataset1 = datasets.find(d => d.id === selectedDataset);
      const dataset2 = datasets.find(d => d.id === secondDataset);

      if (!dataset1 || !dataset2) throw new Error('Datasets not found');

      const itemData1 = dataset1.data.map((row: any) =>
        selectedItems.map((item) => Math.round(parseFloat(row[item]) || 0))
      );

      const itemData2 = dataset2.data.map((row: any) =>
        secondItems.map((item) => Math.round(parseFloat(row[item]) || 0))
      );

      const params1 = IRTEstimator.estimate(itemData1, selectedItems, model, 100, 0.001).itemParameters;
      const params2 = IRTEstimator.estimate(itemData2, secondItems, model, 100, 0.001).itemParameters;

      const irtParams1: IRTParameters[] = params1.map(p => ({
        discrimination: p.discrimination,
        difficulty: p.difficulty,
        guessing: p.guessing,
        slipping: p.slipping
      }));

      const irtParams2: IRTParameters[] = params2.map(p => ({
        discrimination: p.discrimination,
        difficulty: p.difficulty,
        guessing: p.guessing,
        slipping: p.slipping
      }));

      const meanSigmaLink = IRTEstimator.linkMeanSigma(irtParams1, irtParams2);
      const stockingLordLink = IRTEstimator.linkStockingLord(irtParams1, irtParams2, model);

      setLinkingResults({
        meanSigma: meanSigmaLink,
        stockingLord: stockingLordLink
      } as any);

      await saveAnalysisHistory({
        analysis_type: 'irt_linking',
        analysis_name: `Test Linking - ${dataset1.name} & ${dataset2.name}`,
        dataset_id: selectedDataset,
        dataset_name: dataset1.name,
        configuration: { dataset1: selectedDataset, dataset2: secondDataset, model },
        results: { meanSigmaLink, stockingLordLink },
        status: 'completed'
      });
    } catch (err: any) {
      setError(err.message || 'Error during test linking');
    } finally {
      setLoading(false);
    }
  };

  const runDIFAnalysis = async () => {
    if (!currentDataset || selectedItems.length < 3 || !groupVariable) {
      setError('Please select items and a group variable for DIF analysis');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const itemData = currentDataset.data.map((row: any) =>
        selectedItems.map((item) => Math.round(parseFloat(row[item]) || 0))
      );

      const groupIndicator = currentDataset.data.map((row: any) =>
        Math.round(parseFloat(row[groupVariable]) || 0)
      );

      const difResultsArray: DIFResults[] = [];

      for (let i = 0; i < selectedItems.length; i++) {
        const difResult = IRTEstimator.analyzeDIFMantelHaenszel(itemData, groupIndicator, i);
        difResultsArray.push(difResult);
      }

      setDIFResults(difResultsArray);

      await saveAnalysisHistory({
        analysis_type: 'irt_dif',
        analysis_name: `DIF Analysis - ${currentDataset.name}`,
        dataset_id: selectedDataset,
        dataset_name: currentDataset.name,
        configuration: { selectedItems, groupVariable },
        results: difResultsArray,
        status: 'completed'
      });
    } catch (err: any) {
      setError(err.message || 'Error during DIF analysis');
    } finally {
      setLoading(false);
    }
  };

  const renderCalibrationTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          IRT Model Configuration
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Dataset
            </label>
            <select
              value={selectedDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Choose a dataset...</option>
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              IRT Model {!useRBackend && <span className="text-xs text-gray-500">(JS approx.)</span>}
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              disabled={useRBackend && (model === '1PL' || model === '4PL')}
            >
              <option value="1PL">1PL (Rasch) {useRBackend && '(not available in R)'}</option>
              <option value="2PL">2PL</option>
              <option value="3PL">3PL</option>
              <option value="4PL">4PL {useRBackend && '(not available in R)'}</option>
            </select>
            {useRBackend && (model === '1PL' || model === '4PL') && (
              <p className="text-xs text-amber-600 mt-1">
                R backend supports 2PL and 3PL models. Select 2PL or 3PL for R analysis.
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Items ({selectedItems.length} selected)
            </label>
            <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-lg p-3">
              {availableColumns.map((col) => (
                <label key={col} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(col)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItems([...selectedItems, col]);
                      } else {
                        setSelectedItems(selectedItems.filter(item => item !== col));
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{col}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={runIRTCalibration}
          disabled={loading || !selectedDataset || selectedItems.length < 3}
          className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
        >
          {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
          {loading ? 'Running Calibration...' : 'Run IRT Calibration'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {results && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Model Fit Indices</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Log-Likelihood</p>
                <p className="text-2xl font-bold">{results.fitStatistics.logLikelihood}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">AIC</p>
                <p className="text-2xl font-bold">{results.fitStatistics.aic}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">BIC</p>
                <p className="text-2xl font-bold">{results.fitStatistics.bic}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Item Parameters</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Item</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Discrimination (a)</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Difficulty (b)</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Guessing (c)</th>
                    {model === '4PL' && (
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Slipping (d)</th>
                    )}
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Information</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {results.itemParameters.map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm">{item.item}</td>
                      <td className="px-4 py-2 text-sm">{item.discrimination}</td>
                      <td className="px-4 py-2 text-sm">{item.difficulty}</td>
                      <td className="px-4 py-2 text-sm">{item.guessing}</td>
                      {model === '4PL' && (
                        <td className="px-4 py-2 text-sm">{item.slipping || 'N/A'}</td>
                      )}
                      <td className="px-4 py-2 text-sm">{item.information}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Test Information Function</h3>
            <Line
              ref={tifChartRef}
              data={{
                labels: results.tif.abilityLevels.map((a: number) => a.toFixed(1)),
                datasets: [{
                  label: 'Test Information',
                  data: results.tif.information,
                  borderColor: 'rgb(59, 130, 246)',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  tension: 0.4
                }]
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: { display: true },
                  title: { display: true, text: 'Test Information Function' }
                },
                scales: {
                  x: { title: { display: true, text: 'Ability (θ)' } },
                  y: { title: { display: true, text: 'Information' } }
                }
              }}
            />
          </div>
        </div>
      )}

      {rImages && rImages.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <LineChart className="w-5 h-5" />
            R-Generated Diagnostic Plots
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rImages.map((imageUrl, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <img
                  src={imageUrl}
                  alt={`IRT Plot ${idx + 1}`}
                  className="w-full h-auto rounded"
                />
                <p className="text-xs text-gray-600 mt-2 text-center">
                  {idx === 0 ? 'Item Characteristic Curves (ICC)' :
                   idx === 1 ? 'Test Information Function (TIF)' :
                   idx === 2 ? 'Item Information Functions (IIF)' :
                   `Plot ${idx + 1}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderEquatingTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GitCompare className="w-5 h-5" />
          Test Equating Configuration
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Form X Dataset
            </label>
            <select
              value={selectedDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Choose dataset...</option>
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Form Y Dataset
            </label>
            <select
              value={secondDataset}
              onChange={(e) => setSecondDataset(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Choose dataset...</option>
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={runTestEquating}
          disabled={loading || !selectedDataset || !secondDataset}
          className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
        >
          {loading ? 'Running Equating...' : 'Run Test Equating'}
        </button>
      </div>

      {equatingResults && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Equating Results</h3>
          <div className="space-y-4">
            {Object.entries(equatingResults).map(([method, result]: [string, any]) => (
              <div key={method} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium mb-2 capitalize">{method.replace(/([A-Z])/g, ' $1')}</h4>
                <p className="text-sm text-gray-600">RMSE: {result.rmse?.toFixed(3)}</p>
                {result.constants && (
                  <div className="mt-2 text-sm">
                    <p>Slope: {result.constants.slope?.toFixed(3)}</p>
                    <p>Intercept: {result.constants.intercept?.toFixed(3)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderLinkingTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Link className="w-5 h-5" />
          Test Linking Configuration
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Form 1 Dataset
            </label>
            <select
              value={selectedDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Choose dataset...</option>
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Form 2 Dataset
            </label>
            <select
              value={secondDataset}
              onChange={(e) => setSecondDataset(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Choose dataset...</option>
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={runTestLinking}
          disabled={loading || !selectedDataset || !secondDataset}
          className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
        >
          {loading ? 'Running Linking...' : 'Run Test Linking'}
        </button>
      </div>

      {linkingResults && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Linking Results</h3>
          <div className="space-y-4">
            {Object.entries(linkingResults).map(([method, result]: [string, any]) => (
              <div key={method} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium mb-2 capitalize">{method.replace(/([A-Z])/g, ' $1')}</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Slope (A)</p>
                    <p className="text-lg font-semibold">{result.A?.toFixed(3)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Intercept (B)</p>
                    <p className="text-lg font-semibold">{result.B?.toFixed(3)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">RMSE</p>
                    <p className="text-lg font-semibold">{result.rmse?.toFixed(3)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderDIFTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          DIF Analysis Configuration
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Group Variable
            </label>
            <select
              value={groupVariable}
              onChange={(e) => setGroupVariable(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Choose variable...</option>
              {availableColumns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={runDIFAnalysis}
          disabled={loading || !selectedDataset || selectedItems.length < 3 || !groupVariable}
          className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
        >
          {loading ? 'Running DIF Analysis...' : 'Run DIF Analysis'}
        </button>
      </div>

      {difResults.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">DIF Results</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Item</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Chi-Square</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">p-value</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Effect Size</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Classification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {difResults.map((result, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2 text-sm">{result.item}</td>
                    <td className="px-4 py-2 text-sm">{result.chiSquare}</td>
                    <td className="px-4 py-2 text-sm">{result.pValue}</td>
                    <td className="px-4 py-2 text-sm">{result.effectSize}</td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        result.classification === 'Negligible' ? 'bg-green-100 text-green-800' :
                        result.classification === 'Moderate' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {result.classification}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-2">Enhanced IRT Analysis</h2>
        <p className="text-gray-600">
          Advanced Item Response Theory with 4PL model, test equating, linking, and DIF analysis
        </p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {[
          { id: 'calibration', label: 'IRT Calibration', icon: TrendingUp },
          { id: 'equating', label: 'Test Equating', icon: GitCompare },
          { id: 'linking', label: 'Test Linking', icon: Link },
          { id: 'dif', label: 'DIF Analysis', icon: Users }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as AnalysisTab)}
            className={`px-4 py-2 font-medium flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'calibration' && renderCalibrationTab()}
      {activeTab === 'equating' && renderEquatingTab()}
      {activeTab === 'linking' && renderLinkingTab()}
      {activeTab === 'dif' && renderDIFTab()}
    </div>
  );
}
