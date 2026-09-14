import React, { useState, useEffect, useRef, useMemo } from 'react';
import { peekHandoff } from '../lib/analysisHandoff';
import { supabase } from '../lib/supabase';
import { buildVariableIndex, computeVarStats, type VarStats } from '../lib/pathVariableUtils';
import {
  Target, Users, Network, GitBranch, Globe, AlertCircle, CheckCircle, ScanSearch,
} from 'lucide-react';
import { EnhancedCFA } from './EnhancedCFA';
import { EnhancedSEM } from './EnhancedSEM';
import { EnhancedInvariance } from './EnhancedInvariance';
import { EnhancedMultiGroupSEM } from './EnhancedMultiGroupSEM';
import { EnhancedDIF } from './EnhancedDIF';
import { EnhancedContentValidity } from './EnhancedContentValidity';
import { EnhancedConstructValidity } from './EnhancedConstructValidity';

interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
  metadata?: any;
}

type TabType = 'content' | 'construct' | 'cfa' | 'sem' | 'invariance' | 'multigroup' | 'dif';

export default function ValidityAnalysisTabs() {
  const [activeTab, setActiveTab] = useState<TabType>('construct');
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [error, setError] = useState('');

  const tabs = [
    { id: 'content', label: 'Content Validity', icon: CheckCircle },
    { id: 'construct', label: 'Construct Validity', icon: Target },
    { id: 'cfa', label: 'CFA', icon: Network },
    { id: 'sem', label: 'SEM', icon: GitBranch },
    { id: 'invariance', label: 'Measurement Invariance', icon: Globe },
    { id: 'multigroup', label: 'Multi-group SEM', icon: Users },
    { id: 'dif', label: 'DIF', icon: ScanSearch },
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
        .select('id, name, columns, data, metadata')
        .eq('user_id', user.id);

      if (error) throw error;
      setDatasets(data || []);

      // Hand-off from the Scale Sandbox / SEM builder: jump to the requested tab
      // and select the dataset it just created. The analysis component pre-fills
      // the rest (grouping variable + factor structure).
      const ho = peekHandoff();
      if (ho && (data || []).some((d: Dataset) => d.id === ho.datasetId)) {
        setSelectedDataset(ho.datasetId);
        const tab: TabType = ho.target === 'multigroup' ? 'multigroup' : ho.target === 'cfa' ? 'cfa' : ho.target === 'dif' ? 'dif' : 'invariance';
        setActiveTab(tab);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const currentDataset = datasets.find(d => d.id === selectedDataset);

  // Variable index for the SEM Visual Builder's Variable Explorer. Types/labels
  // come from real SPSS-style metadata when present; otherwise inferred from a
  // data sample. Never fabricated.
  const variableIndex = useMemo(() => {
    if (!currentDataset) return [];
    return buildVariableIndex(currentDataset.columns, {
      meta: currentDataset.metadata?.variables,
      columnTypes: currentDataset.metadata?.columnTypes,
      data: currentDataset.data,
    });
  }, [currentDataset?.id]);

  const hasMeasureMeta = !!(currentDataset?.metadata?.variables?.some((v: any) => v?.measure));

  // Lazy, cached descriptive stats keyed by dataset id.
  const statsCache = useRef<Map<string, VarStats>>(new Map());
  useEffect(() => { statsCache.current = new Map(); }, [selectedDataset]);
  const getVarStats = React.useCallback((name: string): VarStats | null => {
    if (!currentDataset) return null;
    const hit = statsCache.current.get(name);
    if (hit) return hit;
    const s = computeVarStats(name, currentDataset.data);
    statsCache.current.set(name, s);
    return s;
  }, [currentDataset?.id]);

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
                  onClick={() => setActiveTab(tab.id as TabType)}
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
          {activeTab === 'content' && (
            <EnhancedContentValidity />
          )}

          {activeTab === 'construct' && (
            <EnhancedConstructValidity
              datasets={datasets}
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
            />
          )}

          {activeTab === 'cfa' && (
            <EnhancedCFA
              datasets={datasets}
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
            />
          )}

          {activeTab === 'sem' && (
            <EnhancedSEM
              datasets={datasets}
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
              variables={variableIndex}
              hasMeasureMeta={hasMeasureMeta}
              getStats={getVarStats}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'invariance' && (
            <EnhancedInvariance
              datasets={datasets}
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
            />
          )}

          {activeTab === 'multigroup' && (
            <EnhancedMultiGroupSEM
              datasets={datasets}
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
            />
          )}

          {activeTab === 'dif' && (
            <EnhancedDIF
              datasets={datasets}
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
            />
          )}
        </div>
      </div>
    </div>
  );
}
