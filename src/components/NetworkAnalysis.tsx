import React, { useState, useEffect } from 'react';
import {
  Network, Upload, Play, BarChart3, GitCompare, Layers, Shield,
  AlertCircle, CheckCircle, Download, Info, Database, RefreshCw,
} from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { NetworkVisualization } from './NetworkVisualization';
import {
  validateNetworkData,
  ebicGlasso,
  estimateIsingModel,
  EBICglassoResult,
  IsingResult,
} from '../lib/networkEstimation';
import {
  calculateAllCentrality,
  rankCentrality,
  CentralityMetrics,
} from '../lib/networkCentrality';
import {
  performFullBootstrapAnalysis,
  interpretStability,
  BootstrapResult,
} from '../lib/networkBootstrap';
import {
  detectCommunitiesWalktrap,
  detectCommunitiesLouvain,
  CommunityDetectionResult,
} from '../lib/networkCommunity';
import { exportToCSV } from '../lib/exportUtils';

interface StoredDataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
}

// Robustly parse a cell value — returns a number or NaN
function parseCell(raw: any): number {
  if (raw === null || raw === undefined) return NaN;
  const s = String(raw).trim().replace(/,/g, ''); // remove thousands separators
  if (s === '' || s === 'NA' || s === 'N/A' || s === '.' || s === 'na') return NaN;
  return parseFloat(s);
}

// Impute missing values column-wise with column mean; returns cleaned matrix + warning counts
function imputeData(raw: number[][]): { data: number[][]; missingCount: number } {
  const nRows = raw.length;
  const nCols = raw[0]?.length ?? 0;
  let missingCount = 0;

  // Compute column means from non-NaN values
  const colMeans = Array(nCols).fill(0);
  const colCounts = Array(nCols).fill(0);
  for (let j = 0; j < nCols; j++) {
    for (let i = 0; i < nRows; i++) {
      if (!isNaN(raw[i][j])) {
        colMeans[j] += raw[i][j];
        colCounts[j]++;
      }
    }
    colMeans[j] = colCounts[j] > 0 ? colMeans[j] / colCounts[j] : 0;
  }

  const result = raw.map(row =>
    row.map((val, j) => {
      if (isNaN(val)) {
        missingCount++;
        return colMeans[j];
      }
      return val;
    })
  );

  return { data: result, missingCount };
}

export function NetworkAnalysis() {
  const [view, setView] = useState<'home' | 'data' | 'estimation' | 'results'>('home');
  const [projectName, setProjectName] = useState('Network Analysis Project');
  const [data, setData] = useState<number[][]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [dataType, setDataType] = useState<'continuous' | 'binary'>('continuous');
  const [dataSource, setDataSource] = useState<'csv' | 'supabase'>('csv');
  const [storedDatasets, setStoredDatasets] = useState<StoredDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [dataWarning, setDataWarning] = useState('');

  const [network, setNetwork] = useState<EBICglassoResult | IsingResult | null>(null);
  const [centrality, setCentrality] = useState<CentralityMetrics[]>([]);
  const [communities, setCommunities] = useState<CommunityDetectionResult | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapResult | null>(null);

  const [settings, setSettings] = useState({
    method: 'ebicglasso' as 'ebicglasso' | 'ising',
    gamma: 0.5,
    nBootstraps: 1000,
    communityAlgorithm: 'walktrap' as 'walktrap' | 'louvain',
    threshold: 0,
    correlationMethod: 'spearman' as 'spearman' | 'pearson',
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, stage: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load stored datasets from Supabase
  useEffect(() => {
    loadStoredDatasets();
  }, []);

  const loadStoredDatasets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: ds } = await supabase
        .from('datasets')
        .select('id, name, columns, data')
        .eq('user_id', user.id)
        .limit(50);
      if (ds) setStoredDatasets(ds);
    } catch { /* silent */ }
  };

  // Load a stored dataset by id
  const loadStoredDataset = (id: string) => {
    const ds = storedDatasets.find(d => d.id === id);
    if (!ds) return;
    setError('');
    setDataWarning('');

    const cols = ds.columns ?? [];
    // Dataset rows may be objects or arrays
    const rows: any[][] = (ds.data ?? []).map((row: any) => {
      if (Array.isArray(row)) return row;
      return cols.map((c: string) => row[c]);
    });

    processRawData(cols, rows, `Loaded "${ds.name}"`);
  };

  const processRawData = (headers: string[], rawRows: any[][], successMsg: string) => {
    // Filter out completely-blank rows
    const nonEmptyRows = rawRows.filter(row =>
      row.some(cell => String(cell ?? '').trim() !== '')
    );

    if (nonEmptyRows.length < 2) {
      setError('Not enough data rows (minimum 2 required)');
      return;
    }

    // Parse each cell
    const parsed: number[][] = nonEmptyRows.map(row =>
      headers.map((_, i) => parseCell(row[i]))
    );

    // Detect rows that are entirely NaN (skip them)
    const validRows = parsed.filter(row => row.some(v => !isNaN(v)));

    // Check how many cells are NaN
    const totalCells = validRows.length * headers.length;
    const nanCells = validRows.flat().filter(isNaN).length;

    if (nanCells === totalCells) {
      setError('Data contains no numeric values. Check that the CSV has numeric columns.');
      return;
    }

    // If more than 30% missing, hard warn but still allow
    if (nanCells / totalCells > 0.3) {
      setError(`Data has ${((nanCells / totalCells) * 100).toFixed(1)}% missing/non-numeric values (>30%). Please check your file.`);
      return;
    }

    // Impute remaining missing values
    const { data: imputed, missingCount } = imputeData(validRows);

    // Drop zero-variance columns (constant columns crash the estimator)
    const nRows = imputed.length;
    const keepCols: number[] = [];
    const droppedCols: string[] = [];
    for (let j = 0; j < headers.length; j++) {
      const col = imputed.map(r => r[j]);
      const mean = col.reduce((a, b) => a + b, 0) / nRows;
      const variance = col.reduce((s, v) => s + (v - mean) ** 2, 0) / nRows;
      if (variance < 1e-10) {
        droppedCols.push(headers[j]);
      } else {
        keepCols.push(j);
      }
    }

    const finalHeaders = keepCols.map(j => headers[j]);
    const finalData = imputed.map(row => keepCols.map(j => row[j]));

    if (finalHeaders.length < 3) {
      setError(
        `Only ${finalHeaders.length} variable(s) have numeric variance after cleaning` +
        (droppedCols.length ? ` (dropped: ${droppedCols.join(', ')})` : '') +
        `. Network analysis requires at least 3 variables.`
      );
      return;
    }

    const warnings: string[] = [];
    if (missingCount > 0) {
      warnings.push(`${missingCount} missing cell(s) imputed with column means.`);
    }
    if (droppedCols.length > 0) {
      warnings.push(`${droppedCols.length} constant/zero-variance column(s) removed: ${droppedCols.join(', ')}.`);
    }
    setDataWarning(warnings.join(' '));

    setVariables(finalHeaders);
    setData(finalData);
    setSuccess(`${successMsg}: ${finalData.length} rows × ${finalHeaders.length} variables`);
    setView('data');
    setTimeout(() => setSuccess(''), 4000);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setDataWarning('');

    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as string[][];
        if (rows.length < 2) {
          setError('File must contain at least 2 rows (header + data)');
          return;
        }
        // First row = headers; strip BOM and trim
        const headers = rows[0]
          .map(h => h.replace(/^\uFEFF/, '').trim())
          .filter(h => h !== '');
        const dataRows = rows.slice(1);
        processRawData(headers, dataRows, `Loaded "${file.name}"`);
      },
      error: (err: Error) => {
        setError(`Failed to parse file: ${err.message}`);
      },
    });

    // Reset input so the same file can be re-selected
    event.target.value = '';
  };

  const estimateNetwork = async () => {
    setError('');
    setIsProcessing(true);
    setProgress({ percent: 0, stage: 'Validating data...' });

    try {
      const validation = validateNetworkData(data, variables);
      if (!validation.valid) {
        setError(validation.errors.join('. '));
        setIsProcessing(false);
        return;
      }
      if (validation.warnings.length > 0) {
        console.warn('Validation warnings:', validation.warnings);
      }

      setProgress({ percent: 10, stage: 'Estimating network...' });

      const estimatedNetwork = settings.method === 'ebicglasso'
        ? ebicGlasso(data, variables, settings.gamma, 50, settings.correlationMethod)
        : estimateIsingModel(data, variables, settings.gamma);

      setNetwork(estimatedNetwork);
      setProgress({ percent: 30, stage: 'Calculating centrality...' });

      const centralityMetrics = calculateAllCentrality(estimatedNetwork.adjacency, variables);
      setCentrality(centralityMetrics);

      setProgress({ percent: 50, stage: 'Detecting communities...' });

      const communityResult = settings.communityAlgorithm === 'walktrap'
        ? detectCommunitiesWalktrap(estimatedNetwork.adjacency, variables)
        : detectCommunitiesLouvain(estimatedNetwork.adjacency, variables);
      setCommunities(communityResult);

      setProgress({ percent: 60, stage: 'Running bootstrap stability analysis...' });

      const bootstrapResult = await performFullBootstrapAnalysis(
        data,
        variables,
        settings.method,
        settings.gamma,
        settings.nBootstraps,
        (percent, stage) => {
          setProgress({ percent: 60 + percent * 0.4, stage });
        }
      );
      setBootstrap(bootstrapResult);

      await saveToDatabase(estimatedNetwork, centralityMetrics, communityResult, bootstrapResult);

      setProgress({ percent: 100, stage: 'Complete!' });
      setIsProcessing(false);
      setView('results');
    } catch (err: any) {
      setError(err.message);
      setIsProcessing(false);
    }
  };

  const saveToDatabase = async (
    net: EBICglassoResult | IsingResult,
    cent: CentralityMetrics[],
    comm: CommunityDetectionResult,
    boot: BootstrapResult
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: project, error: projectError } = await supabase
        .from('network_projects')
        .insert({ user_id: user.id, name: projectName, data_type: dataType, estimation_method: settings.method })
        .select().single();
      if (projectError) throw projectError;

      const { data: dataset, error: datasetError } = await supabase
        .from('network_datasets')
        .insert({ project_id: project.id, name: 'Main Dataset', variables, raw_data: data, sample_size: data.length })
        .select().single();
      if (datasetError) throw datasetError;

      const { data: estimation, error: estimationError } = await supabase
        .from('network_estimations')
        .insert({ project_id: project.id, dataset_id: dataset.id, method: settings.method, parameters: settings, edge_weights: net.adjacency })
        .select().single();
      if (estimationError) throw estimationError;

      await supabase.from('network_centrality').insert(
        cent.map(c => ({
          estimation_id: estimation.id,
          node_name: c.node,
          strength: c.strength,
          betweenness: c.betweenness,
          closeness: c.closeness,
          expected_influence: c.expectedInfluence,
          bridge_strength: c.bridgeStrength || 0,
        }))
      );

      await supabase.from('network_communities').insert({
        estimation_id: estimation.id,
        algorithm: comm.algorithm,
        communities: comm.communities,
        modularity: comm.modularity,
      });

      await supabase.from('network_stability').insert([
        { estimation_id: estimation.id, metric: 'edge_accuracy', results: boot.edgeAccuracy },
        { estimation_id: estimation.id, metric: 'centrality_stability', results: boot.centralityStability },
      ]);
    } catch (err: any) {
      console.error('Failed to save to database:', err);
    }
  };

  const exportNetwork = (format: 'edge_list' | 'adjacency' | 'centrality') => {
    if (!network) return;
    if (format === 'edge_list') {
      const edges: any[] = [];
      for (let i = 0; i < variables.length; i++) {
        for (let j = i + 1; j < variables.length; j++) {
          if (Math.abs(network.adjacency[i][j]) > settings.threshold) {
            edges.push({ from: variables[i], to: variables[j], weight: network.adjacency[i][j].toFixed(4) });
          }
        }
      }
      exportToCSV(edges, 'network_edges');
    } else if (format === 'adjacency') {
      exportToCSV(
        network.adjacency.map((row, i) => {
          const obj: any = { node: variables[i] };
          row.forEach((val, j) => { obj[variables[j]] = val.toFixed(4); });
          return obj;
        }),
        'network_adjacency'
      );
    } else {
      exportToCSV(centrality, 'network_centrality');
    }
  };

  // ── Results view ─────────────────────────────────────────────────────────
  if (view === 'results' && network && centrality.length > 0) {
    const stabilityInterpretation = bootstrap ? interpretStability(bootstrap) : null;
    const edgeCount = network.adjacency.flatMap((row, i) => row.slice(i + 1)).filter(w => Math.abs(w) > 1e-6).length;

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900">Network Analysis Results</h3>
            <p className="text-gray-600 mt-1 text-sm">{projectName}</p>
          </div>
          <button
            onClick={() => { setView('home'); setNetwork(null); setCentrality([]); }}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-lg transition"
          >
            New Analysis
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[
            { icon: Network, label: 'Nodes', value: variables.length, color: 'blue' },
            { icon: GitCompare, label: 'Edges', value: edgeCount, color: 'green' },
            { icon: Layers, label: 'Communities', value: communities?.nCommunities || 0, color: 'purple' },
            { icon: Shield, label: 'Sparsity', value: `${(network.sparsity * 100).toFixed(1)}%`, color: 'orange' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className={`bg-gradient-to-br from-${color}-50 to-${color}-100 rounded-xl p-4 sm:p-6 border border-${color}-200`}>
              <Icon className={`w-6 h-6 sm:w-8 sm:h-8 text-${color}-600 mb-2`} />
              <p className="text-xs sm:text-sm text-gray-600">{label}</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Visualization */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Network Visualization</h4>
          <NetworkVisualization
            nodes={variables}
            adjacency={network.adjacency}
            communities={communities?.communities}
            centrality={centrality.reduce((acc, c) => ({ ...acc, [c.node]: c.strength }), {})}
            threshold={settings.threshold}
          />
        </div>

        {/* Edge weight threshold slider */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Edge Display Threshold: {settings.threshold.toFixed(2)}
          </label>
          <input
            type="range" min="0" max="0.5" step="0.01"
            value={settings.threshold}
            onChange={e => setSettings({ ...settings, threshold: parseFloat(e.target.value) })}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">
            Edges with |weight| below this threshold are hidden in the visualization
          </p>
        </div>

        {/* Centrality table */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Centrality Metrics</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-3 px-3">Node</th>
                  <th className="text-right py-3 px-3">Strength</th>
                  <th className="text-right py-3 px-3">Betweenness</th>
                  <th className="text-right py-3 px-3">Closeness</th>
                  <th className="text-right py-3 px-3">Exp. Influence</th>
                  {network && 'predictability' in network && <th className="text-right py-3 px-3">Predictability (R²)</th>}
                  {communities && <th className="text-center py-3 px-3">Community</th>}
                </tr>
              </thead>
              <tbody>
                {rankCentrality(centrality, 'strength').map(c => (
                  <tr key={c.node} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3 font-semibold">{c.node}</td>
                    <td className="py-2 px-3 text-right font-mono">{c.strength.toFixed(3)}</td>
                    <td className="py-2 px-3 text-right font-mono">{c.betweenness.toFixed(3)}</td>
                    <td className="py-2 px-3 text-right font-mono">{c.closeness.toFixed(3)}</td>
                    <td className="py-2 px-3 text-right font-mono">{c.expectedInfluence.toFixed(3)}</td>
                    {network && 'predictability' in network && (
                      <td className="py-2 px-3 text-right font-mono">
                        {((network as EBICglassoResult).predictability[network.nodes.indexOf(c.node)] ?? 0).toFixed(3)}
                      </td>
                    )}
                    {communities && (
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                          {(communities.communities[c.node] || 0) + 1}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bootstrap stability */}
        {bootstrap && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Bootstrap Stability Analysis
            </h4>

            {stabilityInterpretation && (
              <div className={`p-4 rounded-lg mb-4 ${
                stabilityInterpretation.overallStability === 'high' ? 'bg-green-50 border border-green-200' :
                stabilityInterpretation.overallStability === 'moderate' ? 'bg-yellow-50 border border-yellow-200' :
                'bg-red-50 border border-red-200'
              }`}>
                <p className="font-semibold mb-2">
                  Overall Stability: <span className="uppercase">{stabilityInterpretation.overallStability}</span>
                </p>
                {stabilityInterpretation.recommendations.map((rec, i) => (
                  <p key={i} className="text-sm flex items-start gap-2 mt-1">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    {rec}
                  </p>
                ))}
                {stabilityInterpretation.warnings.map((warn, i) => (
                  <p key={i} className="text-sm flex items-start gap-2 mt-1">
                    <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                    {warn}
                  </p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {bootstrap.centralityStability.map(cs => (
                <div key={cs.metric} className="p-4 bg-gray-50 rounded-lg">
                  <p className="font-semibold text-gray-900 mb-1">{cs.metric}</p>
                  <p className="text-2xl font-bold text-blue-600">CS = {cs.csCoefficient.toFixed(2)}</p>
                  <p className="text-xs text-gray-600 mt-1">{cs.interpretation}</p>
                </div>
              ))}
            </div>

            <p className="text-sm text-gray-600">
              <strong>Edge Accuracy:</strong> {bootstrap.edgeAccuracy.filter(e => e.stable).length} of {bootstrap.edgeAccuracy.length} edges have CIs not crossing zero
            </p>
          </div>
        )}

        {/* Export */}
        <div className="flex flex-wrap gap-3">
          <button onClick={() => exportNetwork('edge_list')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition">
            <Download className="w-4 h-4" /> Edge List
          </button>
          <button onClick={() => exportNetwork('adjacency')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition">
            <Download className="w-4 h-4" /> Adjacency Matrix
          </button>
          <button onClick={() => exportNetwork('centrality')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition">
            <Download className="w-4 h-4" /> Centrality
          </button>
        </div>
      </div>
    );
  }

  // ── Settings / estimation view ───────────────────────────────────────────
  if (view === 'data') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900">Configure Network Estimation</h3>
            <p className="text-gray-600 mt-1 text-sm">{data.length} observations, {variables.length} variables</p>
          </div>
          <button onClick={() => setView('home')}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-lg transition">
            Back
          </button>
        </div>

        {dataWarning && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-800">{dataWarning}</p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Estimation Settings</h4>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Project Name</label>
              <input
                type="text" value={projectName}
                onChange={e => setProjectName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Estimation Method</label>
              <select value={settings.method}
                onChange={e => setSettings({ ...settings, method: e.target.value as any })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                <option value="ebicglasso">EBICglasso — Gaussian Graphical Model (continuous data)</option>
                <option value="ising">Ising Model (binary 0/1 data)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                EBIC Gamma (γ) = <span className="font-bold text-blue-600">{settings.gamma}</span>
              </label>
              <input type="range" min="0" max="1" step="0.05" value={settings.gamma}
                onChange={e => setSettings({ ...settings, gamma: parseFloat(e.target.value) })}
                className="w-full" />
              <p className="text-xs text-gray-500 mt-1">Higher = sparser network. Recommended: 0.5</p>
            </div>

            {settings.method === 'ebicglasso' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Correlation Input</label>
                <select value={settings.correlationMethod}
                  onChange={e => setSettings({ ...settings, correlationMethod: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="spearman">Spearman rank — recommended for ordinal/Likert data</option>
                  <option value="pearson">Pearson — continuous, normally distributed data</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Likert/ordinal items violate Pearson assumptions; Spearman avoids edge attenuation (cf. qgraph cor_auto)</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Bootstrap Iterations</label>
                <input type="number" value={settings.nBootstraps}
                  onChange={e => setSettings({ ...settings, nBootstraps: Math.max(100, parseInt(e.target.value) || 1000) })}
                  min="100" max="10000" step="100"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                <p className="text-xs text-gray-500 mt-1">Min 1000 recommended</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Community Detection</label>
                <select value={settings.communityAlgorithm}
                  onChange={e => setSettings({ ...settings, communityAlgorithm: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="walktrap">Walktrap</option>
                  <option value="louvain">Louvain</option>
                </select>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <button onClick={estimateNetwork} disabled={isProcessing}
            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2 text-sm">
            {isProcessing
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
              : <><Play className="w-4 h-4" /> Estimate Network</>}
          </button>

          {isProcessing && (
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="text-sm text-gray-600 mt-2 text-center">{progress.stage}</p>
            </div>
          )}
        </div>

        {/* Variable preview */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h4 className="text-sm font-bold text-gray-900 mb-3">Variables ({variables.length})</h4>
          <div className="flex flex-wrap gap-2">
            {variables.map(v => (
              <span key={v} className="px-2 py-1 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg font-medium">
                {v}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">{data.length} observations</p>
        </div>
      </div>
    );
  }

  // ── Home / upload view ───────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl sm:text-2xl font-bold text-gray-900">Network Analysis</h3>
        <p className="text-gray-600 mt-1 text-sm">
          Publication-ready network psychometrics with regularization and stability analysis
        </p>
      </div>

      {/* Data source tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex border-b">
          {[
            { id: 'csv', label: 'Upload CSV', icon: Upload },
            { id: 'supabase', label: 'My Datasets', icon: Database },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id}
              onClick={() => { setDataSource(id as any); setError(''); }}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition ${
                dataSource === id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {dataSource === 'csv' ? (
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition">
              <Upload className="w-12 h-12 text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-700">Click to upload CSV file</p>
              <p className="text-xs text-gray-500 mt-1">First row = variable names. Missing values are imputed automatically.</p>
              <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} className="hidden" />
            </label>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Select a stored dataset</p>
                <button onClick={loadStoredDatasets}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800">
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>

              {storedDatasets.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Database className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No datasets found. Import data from the Data Import section first.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {storedDatasets.map(ds => (
                    <button key={ds.id}
                      onClick={() => { setSelectedDatasetId(ds.id); loadStoredDataset(ds.id); }}
                      className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition ${
                        selectedDatasetId === ds.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}>
                      <p className="font-medium text-gray-900">{ds.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {(ds.data?.length || 0)} rows × {(ds.columns?.length || 0)} columns
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {success && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-800">{success}</p>
            </div>
          )}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Feature list */}
      <div className="bg-gradient-to-r from-blue-50 to-slate-50 rounded-xl border border-gray-200 p-6">
        <h4 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-600" />
          Network Psychometrics Features
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700">
          {[
            ['Gaussian Graphical Models', 'Partial correlation networks with LASSO regularization'],
            ['EBICglasso', 'Optimal tuning parameter selection via EBIC'],
            ['Comprehensive Centrality', 'Strength, betweenness, closeness, expected influence'],
            ['Bootstrap Stability', 'Edge accuracy & CS-coefficient (Epskamp et al. 2018)'],
            ['Community Detection', 'Walktrap & Louvain algorithms'],
            ['Responsive Visualization', 'Force-directed graph, pan, zoom, node drag, PNG/SVG export'],
          ].map(([title, desc]) => (
            <div key={title} className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
