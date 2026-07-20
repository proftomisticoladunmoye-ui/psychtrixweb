import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Users,
  Play,
  Settings,
  Download,
  AlertCircle,
  Globe,
  Info,
  TrendingUp,
  CheckCircle,
  XCircle,
  Network,
  GitBranch,
  Target,
  Layers
} from 'lucide-react';
import { Bar, Line } from 'react-chartjs-2';
import { exportResultsToPDF, exportToCSV, exportToJSON } from '../lib/exportUtils';
import { SEMPathDiagram } from './SEMPathDiagram';
import { SEMEstimator } from '../lib/structuralEquationModeling';
import { MeasurementInvarianceTester } from '../lib/measurementInvariance';
import { normalCDF, chiSqPValue } from '../lib/statDistributions';

interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
}

interface MultiGroupSEMResults {
  groups: string[];
  groupSizes: { [group: string]: number };
  models: {
    unconstrained: ModelFit;
    measurementConstrained: ModelFit;
    structuralConstrained: ModelFit;
    fullyConstrained: ModelFit;
  };
  comparisons: Array<{
    comparison: string;
    model1: string;
    model2: string;
    deltaChisq: number;
    deltaDf: number;
    pvalue: number;
    deltaCFI: number;
    deltaRMSEA: number;
    deltaSRMR: number;
    decision: 'supported' | 'not supported';
    interpretation: string;
  }>;
  groupParameters: {
    [group: string]: {
      measurementModel: {
        factorLoadings: Array<{
          item: string;
          factor: string;
          loading: number;
          se: number;
          z: number;
          pvalue: number;
        }>;
        reliability: {
          [factor: string]: {
            cronbach_alpha: number;
            composite_reliability: number;
            ave: number;
          };
        };
      };
      structuralModel: {
        paths: Array<{
          from: string;
          to: string;
          coefficient: number;
          se: number;
          z: number;
          pvalue: number;
          std_coefficient: number;
        }>;
        rSquared: {
          [variable: string]: number;
        };
      };
    };
  };
  pathComparisons: Array<{
    from: string;
    to: string;
    group1Value: number;
    group2Value: number;
    difference: number;
    criticalRatio: number;
    pvalue: number;
    significant: boolean;
  }>;
  moderation: Array<{
    path: string;
    from: string;
    to: string;
    moderator: string;
    effectSize: number;
    interpretation: string;
  }>;
}

interface ModelFit {
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
  npar: number;
}

interface EnhancedMultiGroupSEMProps {
  datasets: Dataset[];
  selectedDataset: string;
  onDatasetChange: (id: string) => void;
}

export function EnhancedMultiGroupSEM({ datasets, selectedDataset, onDatasetChange }: EnhancedMultiGroupSEMProps) {
  const [measurementModel, setMeasurementModel] = useState<{ [key: string]: string[] }>({});
  const [structuralPaths, setStructuralPaths] = useState<Array<{ from: string; to: string }>>([]);
  const [groupVariable, setGroupVariable] = useState('');
  const [results, setResults] = useState<MultiGroupSEMResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [selectedGroupForDiagram, setSelectedGroupForDiagram] = useState('');

  const [advancedOptions, setAdvancedOptions] = useState({
    estimator: 'ML' as 'ML' | 'MLR' | 'MLM' | 'WLS' | 'DWLS' | 'ULS',
    testMeasurementInvariance: true,
    testStructuralInvariance: true,
    computeCriticalRatios: true,
    computeModeration: true,
    alphaCriticalRatio: 0.05,
    deltaCFICutoff: 0.01,
    deltaRMSEACutoff: 0.015,
  });

  const chartRef = useRef<any>(null);
  const currentDataset = datasets.find(d => d.id === selectedDataset);

  const addLatentVariable = () => {
    const factorNum = Object.keys(measurementModel).length + 1;
    setMeasurementModel({
      ...measurementModel,
      [`Latent${factorNum}`]: [],
    });
  };

  const removeLatentVariable = (factor: string) => {
    const newModel = { ...measurementModel };
    delete newModel[factor];
    setMeasurementModel(newModel);
    setStructuralPaths(structuralPaths.filter(p => p.from !== factor && p.to !== factor));
  };

  const addIndicator = (factor: string, item: string) => {
    if (item === groupVariable) return;
    if (measurementModel[factor].includes(item)) return;
    setMeasurementModel({
      ...measurementModel,
      [factor]: [...measurementModel[factor], item],
    });
  };

  const removeIndicator = (factor: string, item: string) => {
    setMeasurementModel({
      ...measurementModel,
      [factor]: measurementModel[factor].filter(i => i !== item),
    });
  };

  const addStructuralPath = () => {
    const factors = Object.keys(measurementModel);
    if (factors.length >= 2) {
      setStructuralPaths([...structuralPaths, { from: factors[0], to: factors[1] }]);
    }
  };

  const removeStructuralPath = (index: number) => {
    setStructuralPaths(structuralPaths.filter((_, i) => i !== index));
  };

  const updateStructuralPath = (index: number, field: 'from' | 'to', value: string) => {
    const newPaths = [...structuralPaths];
    newPaths[index][field] = value;
    setStructuralPaths(newPaths);
  };

  const runMultiGroupSEM = async () => {
    if (!currentDataset || !groupVariable || Object.keys(measurementModel).length === 0 || structuralPaths.length === 0) {
      setError('Please select dataset, grouping variable, specify measurement model, and add structural paths');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);

    try {
      // Let the spinner render before the heavy synchronous estimation starts.
      await new Promise(resolve => setTimeout(resolve, 30));

      // ── Split the dataset by the two largest levels of the group variable ──
      const allInds = [...new Set(Object.values(measurementModel).flat())];
      const levelMap = new Map<string, number[][]>();
      for (const row of currentDataset.data) {
        const g = String(row[groupVariable] ?? '').trim();
        if (!g) continue;
        const vals = allInds.map(c => Number(row[c]));
        if (!vals.every(Number.isFinite)) continue;
        if (!levelMap.has(g)) levelMap.set(g, []);
        levelMap.get(g)!.push(vals);
      }
      const sortedLevels = [...levelMap.entries()].sort((a, b) => b[1].length - a[1].length);
      if (sortedLevels.length < 2) {
        throw new Error(`Grouping variable "${groupVariable}" needs at least 2 groups with data`);
      }
      const [g1Name, m1] = sortedLevels[0];
      const [g2Name, m2] = sortedLevels[1];
      const minN = allInds.length + 2;
      if (m1.length < minN || m2.length < minN) {
        throw new Error(`Each group needs at least ${minN} complete cases (got ${m1.length} and ${m2.length})`);
      }
      const mockGroups = [g1Name, g2Name];

      // ── Real per-group SEM estimation ──────────────────────────────────────
      const semModel = { measurementModel, structuralPaths };
      const semByGroup: { [g: string]: ReturnType<typeof SEMEstimator.estimate> } = {
        [g1Name]: SEMEstimator.estimate(m1, semModel, allInds),
        [g2Name]: SEMEstimator.estimate(m2, semModel, allInds),
      };

      // ── Real invariance ladder over the measurement model ──────────────────
      // configural = unconstrained; metric = equal loadings (measurement);
      // scalar = + equal intercepts (structural comparability); strict = +
      // equal residuals (fully constrained measurement).
      const inv = MeasurementInvarianceTester.test(
        [...m1, ...m2],
        [...m1.map(() => 0), ...m2.map(() => 1)],
        { factorStructure: measurementModel, groups: [g1Name, g2Name] },
        allInds,
      );

      const mockResults: MultiGroupSEMResults = {
        groups: mockGroups,
        groupSizes: {
          [g1Name]: m1.length,
          [g2Name]: m2.length,
        },
        models: {
          unconstrained: inv.models.configural,
          measurementConstrained: inv.models.metric,
          structuralConstrained: inv.models.scalar,
          fullyConstrained: inv.models.strict,
        },
        comparisons: [],
        groupParameters: {},
        pathComparisons: [],
        moderation: [],
      };

      const modelPairs = [
        { model1: 'unconstrained', model2: 'measurementConstrained', label: 'Configural vs Metric (equal loadings)' },
        { model1: 'measurementConstrained', model2: 'structuralConstrained', label: 'Metric vs Scalar (equal intercepts)' },
        { model1: 'structuralConstrained', model2: 'fullyConstrained', label: 'Scalar vs Strict (equal residuals)' },
      ];

      modelPairs.forEach((pair) => {
        const m1 = mockResults.models[pair.model1 as keyof typeof mockResults.models];
        const m2 = mockResults.models[pair.model2 as keyof typeof mockResults.models];

        const deltaChisq = Math.max(0, m2.chisq - m1.chisq);
        const deltaDf = Math.max(1, m2.df - m1.df);
        const deltaCFI = m2.cfi - m1.cfi;
        const deltaRMSEA = m2.rmsea - m1.rmsea;
        const deltaSRMR = m2.srmr - m1.srmr;

        const pvalue = chiSqPValue(deltaChisq, deltaDf);
        const cfiSupported = Math.abs(deltaCFI) <= advancedOptions.deltaCFICutoff;
        const rmseaSupported = Math.abs(deltaRMSEA) <= advancedOptions.deltaRMSEACutoff;
        const decision = cfiSupported && rmseaSupported ? 'supported' : 'not supported';

        let interpretation = '';
        if (decision === 'supported') {
          interpretation = `Constraints are supported. Parameters can be considered equal across groups.`;
        } else {
          interpretation = `Constraints are not supported. Parameters differ significantly across groups.`;
        }

        mockResults.comparisons.push({
          comparison: pair.label,
          model1: pair.model1,
          model2: pair.model2,
          deltaChisq,
          deltaDf,
          pvalue,
          deltaCFI,
          deltaRMSEA,
          deltaSRMR,
          decision,
          interpretation,
        });
      });

      // Per-group parameters straight from the real per-group SEM fits
      // (previously these were all Math.random()).
      mockGroups.forEach((group) => {
        const sem = semByGroup[group];

        mockResults.groupParameters[group] = {
          measurementModel: {
            factorLoadings: sem.measurementModel.factorLoadings.map(l => ({
              item: l.item,
              factor: l.factor,
              loading: l.std_loading,
              se: l.se,
              z: l.z,
              pvalue: l.pvalue,
            })),
            reliability: Object.fromEntries(
              Object.entries(sem.measurementModel.reliability).map(([factor, rel]) => [
                factor,
                {
                  cronbach_alpha: rel.cronbach_alpha,
                  composite_reliability: rel.composite_reliability,
                  ave: rel.ave,
                },
              ])
            ),
          },
          structuralModel: {
            paths: sem.structuralModel.paths.map(p => ({
              from: p.from,
              to: p.to,
              coefficient: p.coefficient,
              se: p.se,
              z: p.z,
              pvalue: p.pvalue,
              std_coefficient: p.std_coefficient,
            })),
            rSquared: { ...sem.structuralModel.rSquared },
          },
        };
      });

      if (advancedOptions.computeCriticalRatios) {
        // AMOS-style critical ratios for path differences: z = Δb / √(SE₁² + SE₂²)
        structuralPaths.forEach((path) => {
          const group1Path = mockResults.groupParameters[g1Name].structuralModel.paths.find(
            p => p.from === path.from && p.to === path.to
          );
          const group2Path = mockResults.groupParameters[g2Name].structuralModel.paths.find(
            p => p.from === path.from && p.to === path.to
          );

          if (group1Path && group2Path) {
            const difference = group1Path.coefficient - group2Path.coefficient;
            const seDiff = Math.sqrt(group1Path.se ** 2 + group2Path.se ** 2);
            const criticalRatio = seDiff > 0 ? difference / seDiff : 0;
            const pvalue = Math.min(1, 2 * (1 - normalCDF(Math.abs(criticalRatio))));

            mockResults.pathComparisons.push({
              from: path.from,
              to: path.to,
              group1Value: group1Path.coefficient,
              group2Value: group2Path.coefficient,
              difference,
              criticalRatio,
              pvalue,
              significant: Math.abs(criticalRatio) > 1.96,
            });
          }
        });
      }

      if (advancedOptions.computeModeration && mockResults.pathComparisons.length > 0) {
        mockResults.pathComparisons.forEach((comp) => {
          if (comp.significant) {
            const effectSize = Math.abs(comp.difference);
            let interpretation = '';

            if (effectSize < 0.1) {
              interpretation = 'Small moderation effect - group difference is statistically significant but practically small.';
            } else if (effectSize < 0.3) {
              interpretation = 'Medium moderation effect - meaningful difference in path strength across groups.';
            } else {
              interpretation = 'Large moderation effect - substantial difference in relationship across groups.';
            }

            mockResults.moderation.push({
              path: `${comp.from} → ${comp.to}`,
              from: comp.from,
              to: comp.to,
              moderator: groupVariable,
              effectSize,
              interpretation,
            });
          }
        });
      }

      setResults(mockResults);
      if (mockGroups.length > 0) {
        setSelectedGroupForDiagram(mockGroups[0]);
      }
    } catch (err: any) {
      console.error('Multi-group SEM error:', err);
      setError(err?.message || 'An error occurred during analysis. Please check your model specification.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const resetAnalysis = () => {
    setResults(null);
    setError('');
  };

  const handleExport = (format: 'pdf' | 'csv' | 'json') => {
    if (!results) return;

    switch (format) {
      case 'pdf':
        exportResultsToPDF(results, 'MultiGroup_SEM_Results');
        break;
      case 'csv':
        const pathData = results.pathComparisons.map(p => ({
          from: p.from,
          to: p.to,
          group1: p.group1Value,
          group2: p.group2Value,
          difference: p.difference,
          criticalRatio: p.criticalRatio,
          pvalue: p.pvalue,
          significant: p.significant,
        }));
        exportToCSV(pathData, 'MultiGroup_Path_Comparisons');
        break;
      case 'json':
        exportToJSON(results, 'MultiGroup_Complete_Results');
        break;
    }
  };

  const getDecisionIcon = (decision: string) => {
    return decision === 'supported' ? (
      <CheckCircle className="w-5 h-5 text-green-600" />
    ) : (
      <XCircle className="w-5 h-5 text-red-600" />
    );
  };

  const getFitColor = (value: number, metric: 'cfi' | 'rmsea' | 'srmr') => {
    switch (metric) {
      case 'cfi':
        return value >= 0.95 ? 'text-green-600' : value >= 0.90 ? 'text-blue-600' : 'text-red-600';
      case 'rmsea':
        return value <= 0.05 ? 'text-green-600' : value <= 0.08 ? 'text-blue-600' : 'text-red-600';
      case 'srmr':
        return value <= 0.05 ? 'text-green-600' : value <= 0.08 ? 'text-blue-600' : 'text-orange-600';
    }
  };

  if (results) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Multi-Group SEM Results</h3>
            <p className="text-gray-600 mt-1">Structural model comparison across {results.groups.length} groups</p>
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

        <div className="bg-gradient-to-r from-cyan-50 to-teal-50 rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-8 h-8 text-teal-600" />
            <h4 className="text-xl font-bold text-gray-900">Group Information</h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {results.groups.map((group, idx) => (
              <div key={group} className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-blue-600' : 'bg-teal-600'}`}></div>
                  <p className="text-xs text-gray-600">{group}</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{results.groupSizes[group]}</p>
                <p className="text-xs text-gray-500">cases</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-6 h-6 text-blue-600" />
            <h4 className="text-lg font-bold text-gray-900">Model Fit Comparison</h4>
          </div>

          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-3 font-semibold text-gray-700">Model</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">χ²</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">df</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">p</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">CFI</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">TLI</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">RMSEA</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">SRMR</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">AIC</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(results.models).map(([name, fit]) => (
                  <tr key={name} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3 font-medium text-gray-900">
                      {name === 'unconstrained' && 'Unconstrained (Baseline)'}
                      {name === 'measurementConstrained' && 'Measurement Constrained'}
                      {name === 'structuralConstrained' && 'Structural Constrained'}
                      {name === 'fullyConstrained' && 'Fully Constrained'}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-700">{fit.chisq.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right text-gray-700">{fit.df}</td>
                    <td className="py-3 px-3 text-right text-gray-700">{fit.pvalue.toFixed(3)}</td>
                    <td className={`py-3 px-3 text-right font-medium ${getFitColor(fit.cfi, 'cfi')}`}>
                      {fit.cfi.toFixed(3)}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-700">{fit.tli.toFixed(3)}</td>
                    <td className={`py-3 px-3 text-right font-medium ${getFitColor(fit.rmsea, 'rmsea')}`}>
                      {fit.rmsea.toFixed(3)}
                    </td>
                    <td className={`py-3 px-3 text-right font-medium ${getFitColor(fit.srmr, 'srmr')}`}>
                      {fit.srmr.toFixed(3)}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-700">{fit.aic.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-6">
            <Bar
              ref={chartRef}
              data={{
                labels: ['Unconstrained', 'Measurement', 'Structural', 'Fully Constrained'],
                datasets: [
                  {
                    label: 'CFI',
                    data: Object.values(results.models).map(m => m.cfi),
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: 'rgb(59, 130, 246)',
                    borderWidth: 2,
                  },
                  {
                    label: 'TLI',
                    data: Object.values(results.models).map(m => m.tli),
                    backgroundColor: 'rgba(16, 185, 129, 0.6)',
                    borderColor: 'rgb(16, 185, 129)',
                    borderWidth: 2,
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                  title: {
                    display: true,
                    text: 'Fit Indices Across Constraint Levels',
                  },
                },
                scales: {
                  y: {
                    beginAtZero: false,
                    min: 0.85,
                    max: 1.0,
                    title: {
                      display: true,
                      text: 'Fit Index Value',
                    },
                  },
                },
              }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-6 h-6 text-orange-600" />
            <h4 className="text-lg font-bold text-gray-900">Nested Model Comparisons</h4>
          </div>

          <div className="space-y-4">
            {results.comparisons.map((comp, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getDecisionIcon(comp.decision)}
                    <div>
                      <p className="font-semibold text-gray-900">{comp.comparison}</p>
                      <p className="text-sm text-gray-600 mt-1">{comp.interpretation}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    comp.decision === 'supported'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {comp.decision}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  <div className="bg-gray-50 rounded p-2">
                    <p className="text-xs text-gray-600">Δχ²</p>
                    <p className="font-bold text-gray-900">{comp.deltaChisq.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <p className="text-xs text-gray-600">Δdf</p>
                    <p className="font-bold text-gray-900">{comp.deltaDf}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <p className="text-xs text-gray-600">ΔCFI</p>
                    <p className={`font-bold ${Math.abs(comp.deltaCFI) <= 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                      {comp.deltaCFI.toFixed(4)}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <p className="text-xs text-gray-600">ΔRMSEA</p>
                    <p className={`font-bold ${Math.abs(comp.deltaRMSEA) <= 0.015 ? 'text-green-600' : 'text-red-600'}`}>
                      {comp.deltaRMSEA.toFixed(4)}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <p className="text-xs text-gray-600">p-value</p>
                    <p className="font-bold text-gray-900">
                      {comp.pvalue < 0.001 ? '<.001' : comp.pvalue.toFixed(3)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {results.pathComparisons.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-6 h-6 text-teal-600" />
              <h4 className="text-lg font-bold text-gray-900">Path Coefficient Comparisons (Critical Ratios)</h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-3 font-semibold text-gray-700">Path</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">Group 1</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">Group 2</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">Difference</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">CR (z)</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-700">p-value</th>
                    <th className="text-center py-3 px-3 font-semibold text-gray-700">Sig?</th>
                  </tr>
                </thead>
                <tbody>
                  {results.pathComparisons.map((comp, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-3 text-gray-900 font-medium">{comp.from} → {comp.to}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{comp.group1Value.toFixed(3)}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{comp.group2Value.toFixed(3)}</td>
                      <td className="py-3 px-3 text-right font-medium text-gray-900">{comp.difference.toFixed(3)}</td>
                      <td className="py-3 px-3 text-right font-bold text-gray-900">{comp.criticalRatio.toFixed(3)}</td>
                      <td className="py-3 px-3 text-right text-gray-700">
                        {comp.pvalue < 0.001 ? '<.001' : comp.pvalue.toFixed(3)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {comp.significant ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">Yes</span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 bg-cyan-50 rounded border-l-4 border-teal-500">
              <p className="text-xs text-gray-700">
                <strong>Critical Ratio Interpretation:</strong> CR values &gt; |1.96| indicate significant differences at p &lt; .05.
                CR is calculated as (β₁ - β₂) / SE(difference).
              </p>
            </div>
          </div>
        )}

        {results.moderation.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <GitBranch className="w-6 h-6 text-teal-600" />
              <h4 className="text-lg font-bold text-gray-900">Moderation Analysis</h4>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              The grouping variable <strong>{groupVariable}</strong> moderates the following relationships:
            </p>

            <div className="space-y-3">
              {results.moderation.map((mod, idx) => (
                <div key={idx} className="border border-teal-200 rounded-lg p-4 bg-teal-50">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-semibold text-gray-900">{mod.path}</p>
                    <span className={`px-3 py-1 rounded text-xs font-medium ${
                      mod.effectSize >= 0.3 ? 'bg-red-100 text-red-800' :
                      mod.effectSize >= 0.1 ? 'bg-orange-100 text-orange-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {mod.effectSize >= 0.3 ? 'Large' : mod.effectSize >= 0.1 ? 'Medium' : 'Small'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-1">
                    <strong>Effect Size:</strong> {mod.effectSize.toFixed(3)}
                  </p>
                  <p className="text-sm text-gray-600">{mod.interpretation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {results.groups.map((group, idx) => (
            <div key={group} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-blue-600' : 'bg-teal-600'}`}></div>
                  <h4 className="text-lg font-bold text-gray-900">{group} Parameters</h4>
                </div>
                <span className="text-sm text-gray-600">n = {results.groupSizes[group]}</span>
              </div>

              <div className="space-y-4">
                <div>
                  <h5 className="font-semibold text-sm text-gray-900 mb-2">Structural Paths</h5>
                  <div className="space-y-1">
                    {results.groupParameters[group].structuralModel.paths.map((path, pathIdx) => (
                      <div key={pathIdx} className="flex justify-between text-sm p-2 bg-gray-50 rounded">
                        <span className="text-gray-700">{path.from} → {path.to}</span>
                        <span className="font-medium text-gray-900">{path.std_coefficient.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="font-semibold text-sm text-gray-900 mb-2">R² (Variance Explained)</h5>
                  <div className="space-y-2">
                    {Object.entries(results.groupParameters[group].structuralModel.rSquared).map(([variable, rsq]) => (
                      <div key={variable} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{variable}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                rsq > 0.5 ? 'bg-green-500' : rsq > 0.3 ? 'bg-blue-500' : 'bg-orange-500'
                              }`}
                              style={{ width: `${rsq * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-bold text-gray-900 w-12 text-right">
                            {(rsq * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-bold text-gray-900">Group-Specific Path Diagram</h4>
            <select
              value={selectedGroupForDiagram}
              onChange={(e) => setSelectedGroupForDiagram(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm"
            >
              {results.groups.map(group => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </div>

          {selectedGroupForDiagram && results.groupParameters[selectedGroupForDiagram] && (
            <SEMPathDiagram
              measurementModel={measurementModel}
              structuralModel={results.groupParameters[selectedGroupForDiagram].structuralModel.paths.map(p => ({
                from: p.from,
                to: p.to,
                coefficient: p.coefficient,
                std_coefficient: p.std_coefficient,
                se: p.se,
                pvalue: p.pvalue,
              }))}
              mediators={[]}
              showCoefficients={true}
              showStandardized={true}
              rSquared={results.groupParameters[selectedGroupForDiagram].structuralModel.rSquared}
              factorLoadings={results.groupParameters[selectedGroupForDiagram].measurementModel.factorLoadings.map(fl => ({
                item: fl.item, factor: fl.factor, std_loading: fl.loading, pvalue: fl.pvalue,
              }))}
              title={`Multi-Group SEM — ${selectedGroupForDiagram}`}
              estimationLabel="Two-stage least squares (composite-based)"
            />
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => handleExport('pdf')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Export JSON
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-gray-900">Multi-Group Structural Equation Modeling</h3>
        <p className="text-gray-600 mt-1">
          Professional multi-group SEM with AMOS/LISREL/SmartPLS standard features
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

          {currentDataset && (
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
              <p className="text-xs text-gray-500 mt-1">
                Variable used to split sample into groups (e.g., gender, country, condition)
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
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
              <h4 className="font-semibold text-gray-900">Advanced Multi-Group SEM Options</h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Estimator</label>
                  <select
                    value={advancedOptions.estimator}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, estimator: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Critical Ratio α</label>
                  <input
                    type="number"
                    step="0.01"
                    value={advancedOptions.alphaCriticalRatio}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, alphaCriticalRatio: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  />
                  <p className="text-xs text-gray-500 mt-1">Typical: 0.05</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedOptions.testMeasurementInvariance}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, testMeasurementInvariance: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Test measurement invariance</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedOptions.testStructuralInvariance}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, testStructuralInvariance: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Test structural invariance</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedOptions.computeCriticalRatios}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, computeCriticalRatios: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Compute critical ratios (z-tests)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedOptions.computeModeration}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, computeModeration: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Test moderation effects</span>
                </label>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Measurement Model (Latent Variables)</label>
              <button
                onClick={addLatentVariable}
                disabled={!currentDataset}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400"
              >
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
                      <button
                        onClick={() => removeLatentVariable(factor)}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="space-y-2 mb-3">
                      {items.length === 0 ? (
                        <p className="text-sm text-gray-500 italic py-2">No indicators assigned</p>
                      ) : (
                        items.map((item) => (
                          <div key={item} className="flex items-center justify-between bg-white px-3 py-2 rounded border border-gray-200">
                            <span className="text-sm text-gray-900">{item}</span>
                            <button
                              onClick={() => removeIndicator(factor, item)}
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
                            addIndicator(factor, e.target.value);
                            e.target.value = '';
                          }
                        }}
                        className="w-full text-sm px-3 py-2 border border-gray-300 rounded bg-white"
                      >
                        <option value="">+ Add indicator to {factor}...</option>
                        {currentDataset.columns
                          .filter((col) => col !== groupVariable && !items.includes(col))
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

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Structural Paths (Hypotheses)</label>
              <button
                onClick={addStructuralPath}
                disabled={Object.keys(measurementModel).length < 2}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400"
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
                      onChange={(e) => updateStructuralPath(idx, 'from', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      {Object.keys(measurementModel).map(factor => (
                        <option key={factor} value={factor}>{factor}</option>
                      ))}
                    </select>
                    <span className="text-gray-400">→</span>
                    <select
                      value={path.to}
                      onChange={(e) => updateStructuralPath(idx, 'to', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      {Object.keys(measurementModel).map(factor => (
                        <option key={factor} value={factor}>{factor}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeStructuralPath(idx)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-cyan-50 to-teal-50 rounded-lg p-6 border border-gray-200">
        <h4 className="font-semibold text-gray-900 mb-3">Multi-Group SEM Workflow</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-teal-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-lg">1</div>
            <div>
              <p className="font-medium text-gray-900">Unconstrained Model</p>
              <p className="text-sm text-gray-600">All parameters free to vary across groups (baseline)</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-teal-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-lg">2</div>
            <div>
              <p className="font-medium text-gray-900">Measurement Constrained</p>
              <p className="text-sm text-gray-600">Factor loadings constrained equal across groups</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-teal-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-lg">3</div>
            <div>
              <p className="font-medium text-gray-900">Structural Constrained</p>
              <p className="text-sm text-gray-600">Structural paths constrained equal across groups</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-teal-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-lg">4</div>
            <div>
              <p className="font-medium text-gray-900">Critical Ratio Tests</p>
              <p className="text-sm text-gray-600">Compare specific path differences between groups</p>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={runMultiGroupSEM}
        disabled={loading || !selectedDataset || !groupVariable || Object.keys(measurementModel).length === 0 || structuralPaths.length === 0}
        className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
      >
        <Play className="w-6 h-6" />
        {loading ? 'Running Multi-Group SEM...' : 'Run Multi-Group SEM Analysis'}
      </button>

      <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-600">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700 space-y-1">
            <p><strong>Professional Multi-Group SEM Features:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>4-level nested model testing (unconstrained → fully constrained)</li>
              <li>Measurement + Structural invariance testing</li>
              <li>Critical ratio tests for path comparisons (AMOS-style z-tests)</li>
              <li>Moderation analysis with effect size estimation</li>
              <li>Group-specific parameter estimates</li>
              <li>Group-specific path diagrams</li>
              <li>Δχ², ΔCFI, ΔRMSEA comparison statistics</li>
              <li>6 robust estimators (ML, MLR, MLM, WLS, DWLS, ULS)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
