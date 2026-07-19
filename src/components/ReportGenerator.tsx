import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  FileText, Download, Eye, Plus, AlertCircle, Trash2, Settings,
  CheckCircle, Clock, XCircle, Filter, Search, Calendar,
  BarChart3, TrendingUp, Target, BookOpen, FileSpreadsheet,
  ChevronDown, ChevronUp, History, RefreshCw
} from 'lucide-react';
import { loadAnalysisHistory, deleteAnalysisHistory, AnalysisHistoryEntry } from '../lib/analysisHistory';
import { exportResultsToPDF, exportToCSV, exportToJSON, exportEFAResults } from '../lib/exportUtils';

interface Report {
  id: string;
  name: string;
  description?: string;
  template_type: 'ctt' | 'irt' | 'efa' | 'cfa' | 'path' | 'sem' | 'custom';
  status: 'draft' | 'ready' | 'generating' | 'error';
  created_at: string;
  user_id: string;
  content?: any;
}

interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: any[];
}

export function ReportGenerator() {
  const [reports, setReports] = useState<Report[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [view, setView] = useState<'list' | 'create' | 'history'>('history');
  const [filter, setFilter] = useState<'all' | 'ctt' | 'irt' | 'efa' | 'cfa' | 'path' | 'sem'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisHistoryEntry | null>(null);

  const [newReport, setNewReport] = useState({
    name: '',
    description: '',
    templateType: 'ctt' as 'ctt' | 'irt' | 'efa' | 'cfa' | 'path' | 'sem',
    datasetId: '',
    sections: {
      introduction: true,
      methodology: true,
      results: true,
      interpretation: true,
      recommendations: true,
      references: true,
    },
    options: {
      includeCharts: true,
      includeTables: true,
      includeRawData: false,
      confidenceLevel: 0.95,
    },
  });

  useEffect(() => {
    loadReports();
    loadDatasets();
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    const result = await loadAnalysisHistory();
    if (result.success && result.data) {
      setAnalysisHistory(result.data);
    } else if (result.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  const loadReports = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDatasets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Metadata only — full data blobs are never needed here (row counts
      // come from the stored rows_count column).
      const { data, error } = await supabase
        .from('datasets')
        .select('id, name, columns, rows_count')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDatasets(data || []);
    } catch (err: any) {
      console.error('Error loading datasets:', err.message);
    }
  };

  const createReport = async () => {
    if (!newReport.name) {
      setError('Report name is required');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const report = {
        user_id: user.id,
        name: newReport.name,
        description: newReport.description,
        template_type: newReport.templateType,
        status: 'draft',
        content: {
          sections: newReport.sections,
          options: newReport.options,
          datasetId: newReport.datasetId,
        },
      };

      const { error } = await supabase.from('reports').insert(report);

      if (error) throw error;

      setSuccess('Report created successfully');
      setTimeout(() => setSuccess(''), 3000);
      setNewReport({
        name: '',
        description: '',
        templateType: 'ctt',
        datasetId: '',
        sections: {
          introduction: true,
          methodology: true,
          results: true,
          interpretation: true,
          recommendations: true,
          references: true,
        },
        options: {
          includeCharts: true,
          includeTables: true,
          includeRawData: false,
          confidenceLevel: 0.95,
        },
      });
      loadReports();
      setView('list');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteReport = async (id: string) => {
    if (!confirm('Are you sure you want to delete this report?')) return;

    try {
      const { error } = await supabase.from('reports').delete().eq('id', id);
      if (error) throw error;
      setSuccess('Report deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      loadReports();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const generateReport = async (report: Report) => {
    setError('Report generation is a premium feature. Please export results directly from analysis pages.');
  };

  const handleDeleteHistory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this analysis?')) return;

    const result = await deleteAnalysisHistory(id);
    if (result.success) {
      setSuccess('Analysis deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      loadHistory();
    } else {
      setError(result.error || 'Failed to delete analysis');
    }
  };

  const handleExportAnalysis = (analysis: AnalysisHistoryEntry, format: 'pdf' | 'csv' | 'json') => {
    const fileName = `${analysis.analysis_type}_${analysis.analysis_name.replace(/\s+/g, '_')}`;

    switch (format) {
      case 'pdf':
        exportResultsToPDF(analysis.results, fileName);
        break;
      case 'csv':
        if (analysis.results.factorLoadings) {
          exportToCSV(analysis.results.factorLoadings, fileName);
        } else if (analysis.results.itemStats) {
          exportToCSV(analysis.results.itemStats, fileName);
        } else {
          exportToJSON(analysis.results, fileName);
        }
        break;
      case 'json':
        exportToJSON(analysis.results, fileName);
        break;
    }

    setSuccess('Analysis exported successfully');
    setTimeout(() => setSuccess(''), 3000);
  };

  const filteredReports = reports.filter(report => {
    const matchesFilter = filter === 'all' || report.template_type === filter;
    const matchesSearch = report.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         report.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredAnalysisHistory = analysisHistory.filter(analysis => {
    const matchesFilter = filter === 'all' || analysis.analysis_type === filter;
    const matchesSearch = analysis.analysis_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         analysis.dataset_name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getTemplateIcon = (type: string) => {
    switch (type) {
      case 'ctt': return <BarChart3 className="w-6 h-6 text-blue-600" />;
      case 'irt': return <TrendingUp className="w-6 h-6 text-green-600" />;
      case 'efa': return <Target className="w-6 h-6 text-purple-600" />;
      case 'cfa': return <CheckCircle className="w-6 h-6 text-orange-600" />;
      case 'path': return <Target className="w-6 h-6 text-pink-600" />;
      case 'sem': return <BookOpen className="w-6 h-6 text-teal-600" />;
      default: return <FileText className="w-6 h-6 text-gray-600" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'generating': return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'error': return <XCircle className="w-5 h-5 text-red-600" />;
      default: return <FileText className="w-5 h-5 text-gray-600" />;
    }
  };

  if (view === 'create') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Create New Report</h1>
            <p className="text-gray-600 mt-1">Configure your psychometric analysis report</p>
          </div>
          <button
            onClick={() => setView('list')}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            Cancel
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Report Name *
            </label>
            <input
              type="text"
              value={newReport.name}
              onChange={(e) => setNewReport({ ...newReport, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Anxiety Scale Validation Report"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={newReport.description}
              onChange={(e) => setNewReport({ ...newReport, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="Brief description of the report purpose..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Report Template
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { value: 'ctt', label: 'CTT Analysis', desc: 'Classical Test Theory' },
                { value: 'irt', label: 'IRT Analysis', desc: 'Item Response Theory' },
                { value: 'efa', label: 'EFA Report', desc: 'Exploratory Factor Analysis' },
                { value: 'cfa', label: 'CFA Report', desc: 'Confirmatory Factor Analysis' },
                { value: 'path', label: 'Path Analysis', desc: 'Path & Mediation Models' },
                { value: 'sem', label: 'SEM Report', desc: 'Structural Equation Modeling' },
              ].map((template) => (
                <button
                  key={template.value}
                  onClick={() => setNewReport({ ...newReport, templateType: template.value as any })}
                  className={`p-4 border-2 rounded-lg text-left transition ${
                    newReport.templateType === template.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <h4 className="font-semibold text-gray-900">{template.label}</h4>
                  <p className="text-sm text-gray-600 mt-1">{template.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Data Source (Optional)
            </label>
            <select
              value={newReport.datasetId}
              onChange={(e) => setNewReport({ ...newReport, datasetId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a dataset...</option>
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name} ({(dataset as any).rows_count ?? dataset.data?.length ?? 0} rows)
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Link this report to a dataset for quick analysis
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Report Sections
            </label>
            <div className="space-y-2">
              {Object.entries(newReport.sections).map(([key, value]) => (
                <label key={key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setNewReport({
                      ...newReport,
                      sections: { ...newReport.sections, [key]: e.target.checked }
                    })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-700 font-medium capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Report Options
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={newReport.options.includeCharts}
                  onChange={(e) => setNewReport({
                    ...newReport,
                    options: { ...newReport.options, includeCharts: e.target.checked }
                  })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-700 font-medium">Include Charts</span>
              </label>
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={newReport.options.includeTables}
                  onChange={(e) => setNewReport({
                    ...newReport,
                    options: { ...newReport.options, includeTables: e.target.checked }
                  })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-700 font-medium">Include Tables</span>
              </label>
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={newReport.options.includeRawData}
                  onChange={(e) => setNewReport({
                    ...newReport,
                    options: { ...newReport.options, includeRawData: e.target.checked }
                  })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-700 font-medium">Include Raw Data</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={createReport}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition"
            >
              Create Report
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'history') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Analysis History & Reports</h1>
            <p className="text-gray-600 mt-1">View past analyses and generate reports from saved results</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadHistory}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}

        <div className="bg-gradient-to-br from-blue-50 to-teal-50 rounded-xl p-6 border border-blue-200">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-600 rounded-lg">
              <History className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Your Analysis History</h3>
              <p className="text-gray-700 mb-3">
                All your analyses are automatically saved here. Select any analysis to view details and export reports in multiple formats.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-700">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Automatically saved</span>
                </div>
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-blue-600" />
                  <span>Export PDF, CSV, JSON</span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-purple-600" />
                  <span>Review past results</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search analyses by name or dataset..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg transition font-medium text-sm ${
                  filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {['ctt', 'irt', 'efa', 'cfa', 'path', 'sem'].map((type) => (
                <button
                  key={type}
                  onClick={() => setFilter(type as any)}
                  className={`px-4 py-2 rounded-lg transition font-medium text-sm uppercase ${
                    filter === type ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : filteredAnalysisHistory.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <History className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg mb-2">
                {searchTerm ? 'No analyses match your search' : 'No analyses yet'}
              </p>
              <p className="text-gray-500 text-sm">
                {searchTerm ? 'Try different keywords' : 'Run analyses from CTT, IRT, EFA, or other sections to see them here'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAnalysisHistory.map((analysis) => (
                <div
                  key={analysis.id}
                  className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="p-2 bg-gray-50 rounded-lg">
                          {getTemplateIcon(analysis.analysis_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {analysis.analysis_name}
                            </h3>
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded uppercase">
                              {analysis.analysis_type}
                            </span>
                            {analysis.status === 'completed' && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                                Completed
                              </span>
                            )}
                          </div>
                          {analysis.dataset_name && (
                            <p className="text-sm text-gray-600 mb-2">Dataset: {analysis.dataset_name}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(analysis.created_at!).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => setExpandedReport(expandedReport === analysis.id ? null : analysis.id!)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition"
                          title="Details"
                        >
                          {expandedReport === analysis.id ? (
                            <ChevronUp className="w-5 h-5 text-gray-600" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-600" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteHistory(analysis.id!)}
                          className="p-2 hover:bg-red-50 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 className="w-5 h-5 text-red-600" />
                        </button>
                      </div>
                    </div>

                    {expandedReport === analysis.id && (
                      <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">Export Analysis</h4>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleExportAnalysis(analysis, 'pdf')}
                              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
                            >
                              <Download className="w-4 h-4" />
                              PDF Report
                            </button>
                            <button
                              onClick={() => handleExportAnalysis(analysis, 'csv')}
                              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition"
                            >
                              <Download className="w-4 h-4" />
                              CSV Data
                            </button>
                            <button
                              onClick={() => handleExportAnalysis(analysis, 'json')}
                              className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition"
                            >
                              <Download className="w-4 h-4" />
                              JSON
                            </button>
                          </div>
                        </div>

                        {analysis.configuration && Object.keys(analysis.configuration).length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Analysis Configuration</h4>
                            <div className="bg-gray-50 rounded p-3 text-xs font-mono text-gray-700 max-h-40 overflow-auto">
                              {JSON.stringify(analysis.configuration, null, 2)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Report Generator</h1>
          <p className="text-gray-600 mt-1">Create and manage professional psychometric reports</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <Plus className="w-5 h-5" />
          New Report
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-600 rounded-lg">
            <FileSpreadsheet className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Export Reports Directly from Analysis</h3>
            <p className="text-gray-700 mb-3">
              For the best experience, generate reports directly from each analysis page:
            </p>
            <ul className="space-y-1 text-sm text-gray-700">
              <li>• <strong>CTT Analysis:</strong> Export HTML reports with reliability metrics and item analysis</li>
              <li>• <strong>IRT Analysis:</strong> Export comprehensive reports with item parameters and model fit</li>
              <li>• <strong>Path Analysis:</strong> Export mediation and moderation analysis reports</li>
              <li>• <strong>Scale Sandbox:</strong> Export scale development reports with validation metrics</li>
            </ul>
            <p className="text-sm text-gray-600 mt-3">
              Each analysis page has dedicated export buttons for HTML, CSV, and JSON formats.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search reports..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition font-medium text-sm ${
                filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {['ctt', 'irt', 'efa', 'cfa', 'path', 'sem'].map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type as any)}
                className={`px-4 py-2 rounded-lg transition font-medium text-sm uppercase ${
                  filter === type ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg mb-2">
              {searchTerm ? 'No reports match your search' : 'No reports created yet'}
            </p>
            <p className="text-gray-500 text-sm">
              {searchTerm ? 'Try different keywords' : 'Create your first report to get started'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReports.map((report) => (
              <div
                key={report.id}
                className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-2 bg-gray-50 rounded-lg">
                        {getTemplateIcon(report.template_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {report.name}
                          </h3>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded uppercase">
                            {report.template_type}
                          </span>
                        </div>
                        {report.description && (
                          <p className="text-sm text-gray-600 mb-2">{report.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {new Date(report.created_at).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            {getStatusIcon(report.status)}
                            {report.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition"
                        title="Details"
                      >
                        {expandedReport === report.id ? (
                          <ChevronUp className="w-5 h-5 text-gray-600" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-600" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteReport(report.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition"
                        title="Delete"
                      >
                        <Trash2 className="w-5 h-5 text-red-600" />
                      </button>
                    </div>
                  </div>

                  {expandedReport === report.id && report.content && (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Sections Included:</h4>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(report.content.sections || {}).map(([key, value]) => (
                            value && (
                              <span key={key} className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </span>
                            )
                          ))}
                        </div>
                      </div>
                      {report.content.datasetId && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700">
                            Linked Dataset: {datasets.find(d => d.id === report.content.datasetId)?.name || 'Unknown'}
                          </h4>
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => generateReport(report)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
                        >
                          Generate Report
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
