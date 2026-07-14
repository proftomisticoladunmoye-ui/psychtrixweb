import React, { useState, useEffect } from 'react';
import {
  Play,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Download,
  RefreshCw,
  Layers,
  Code,
  TrendingUp,
  Activity,
  Upload,
} from 'lucide-react';
import { rAnalysisClient, RAnalysisJob, RAnalysisTemplate } from '../lib/rAnalysisClient';

export function RAnalysisDashboard() {
  const [view, setView] = useState<'overview' | 'submit' | 'monitor'>('overview');
  const [jobs, setJobs] = useState<RAnalysisJob[]>([]);
  const [templates, setTemplates] = useState<RAnalysisTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<RAnalysisTemplate | null>(null);
  const [selectedJob, setSelectedJob] = useState<RAnalysisJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState<{
    inputData: any;
    parameters: Record<string, any>;
  }>({
    inputData: null,
    parameters: {},
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedJob && (selectedJob.status === 'queued' || selectedJob.status === 'processing')) {
      const unsubscribe = rAnalysisClient.subscribeToJobUpdates(selectedJob.id, (update) => {
        setSelectedJob(prev => prev ? { ...prev, ...update } : null);
        if (update.status === 'completed' || update.status === 'failed') {
          loadJobs();
        }
      });

      return unsubscribe;
    }
  }, [selectedJob?.id]);

  const loadData = async () => {
    await Promise.all([loadJobs(), loadTemplates()]);
  };

  const loadJobs = async () => {
    const userJobs = await rAnalysisClient.getUserJobs(50);
    setJobs(userJobs);
  };

  const loadTemplates = async () => {
    const availableTemplates = await rAnalysisClient.getTemplates();
    setTemplates(availableTemplates);
  };

  const handleSubmitJob = async () => {
    if (!selectedTemplate || !formData.inputData) {
      setError('Please select a template and provide input data');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await rAnalysisClient.submitJob({
        jobType: selectedTemplate.job_type,
        inputData: formData.inputData,
        parameters: formData.parameters,
        useCache: true,
      });

      if (result.cached) {
        setSuccess('Results retrieved from cache!');
        setSelectedJob({
          id: 'cached',
          status: 'completed',
          output_data: result.data,
          output_images: result.images,
        } as RAnalysisJob);
      } else {
        setSuccess(`Job submitted successfully! Job ID: ${result.jobId}`);
        await loadJobs();
        const job = await rAnalysisClient.getJobStatus(result.jobId!);
        setSelectedJob(job);
        setView('monitor');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rows = text.split('\n').map(row => row.split(','));
        const headers = rows[0];
        const data = rows.slice(1).filter(row => row.length === headers.length);

        setFormData(prev => ({
          ...prev,
          inputData: {
            variables: headers,
            data: data.map(row => row.map(val => parseFloat(val))),
          },
        }));

        setSuccess('Data loaded successfully');
      } catch (err) {
        setError('Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
  };

  const downloadReport = async (job: RAnalysisJob) => {
    const reportId = await rAnalysisClient.generateReport(job.id, 'html');
    if (reportId) {
      setSuccess('Report generated successfully');
    }
  };

  const getStatusIcon = (status: RAnalysisJob['status']) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-5 h-5 text-gray-500" />;
      case 'processing':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
    }
  };

  const getStatusBadge = (status: RAnalysisJob['status']) => {
    const baseClasses = 'px-3 py-1 rounded-full text-xs font-semibold';
    switch (status) {
      case 'queued':
        return <span className={`${baseClasses} bg-gray-100 text-gray-700`}>Queued</span>;
      case 'processing':
        return <span className={`${baseClasses} bg-blue-100 text-blue-700`}>Processing</span>;
      case 'completed':
        return <span className={`${baseClasses} bg-green-100 text-green-700`}>Completed</span>;
      case 'failed':
        return <span className={`${baseClasses} bg-red-100 text-red-700`}>Failed</span>;
      case 'cancelled':
        return <span className={`${baseClasses} bg-orange-100 text-orange-700`}>Cancelled</span>;
    }
  };

  if (view === 'submit') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold text-gray-900">Submit R Analysis Job</h3>
          <button
            onClick={() => setView('overview')}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            Back
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

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Select Analysis Type</h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className={`p-4 rounded-lg border-2 transition text-left ${
                  selectedTemplate?.id === template.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Layers className="w-6 h-6 text-blue-600 flex-shrink-0" />
                  <div>
                    <h5 className="font-semibold text-gray-900">{template.template_name}</h5>
                    <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {template.required_packages.map((pkg: string) => (
                        <span key={pkg} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                          {pkg}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {selectedTemplate && (
            <>
              <h4 className="text-lg font-bold text-gray-900 mb-4">Upload Data</h4>

              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition mb-6">
                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">Click to upload CSV file</p>
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>

              {formData.inputData && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-6">
                  <p className="text-sm text-green-800">
                    Data loaded: {formData.inputData.data?.length} observations, {formData.inputData.variables?.length} variables
                  </p>
                </div>
              )}

              <h4 className="text-lg font-bold text-gray-900 mb-4">Parameters</h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {selectedTemplate.job_type === 'network' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        EBIC Gamma
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        value={formData.parameters.gamma || 0.5}
                        onChange={(e) =>
                          setFormData(prev => ({
                            ...prev,
                            parameters: { ...prev.parameters, gamma: parseFloat(e.target.value) },
                          }))
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bootstrap Iterations
                      </label>
                      <input
                        type="number"
                        min="100"
                        max="10000"
                        step="100"
                        value={formData.parameters.n_boots || 1000}
                        onChange={(e) =>
                          setFormData(prev => ({
                            ...prev,
                            parameters: { ...prev.parameters, n_boots: parseInt(e.target.value) },
                          }))
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </>
                )}

                {selectedTemplate.job_type === 'reliability' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Number of Factors
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.parameters.n_factors || 1}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          parameters: { ...prev.parameters, n_factors: parseInt(e.target.value) },
                        }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                )}
              </div>

              <button
                onClick={handleSubmitJob}
                disabled={loading || !formData.inputData}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" />
                {loading ? 'Submitting...' : 'Submit Analysis Job'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (view === 'monitor' && selectedJob) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold text-gray-900">Job Monitor</h3>
          <button
            onClick={() => {
              setView('overview');
              setSelectedJob(null);
            }}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            Back to Overview
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {getStatusIcon(selectedJob.status)}
              <div>
                <h4 className="text-lg font-bold text-gray-900">
                  {selectedJob.job_type.toUpperCase()} Analysis
                </h4>
                <p className="text-sm text-gray-600">Job ID: {selectedJob.id}</p>
              </div>
            </div>
            {getStatusBadge(selectedJob.status)}
          </div>

          {selectedJob.status === 'processing' && (
            <div className="mb-6">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <p className="text-sm text-gray-600 mt-2 text-center">
                Processing R analysis... This may take a few minutes.
              </p>
            </div>
          )}

          {selectedJob.status === 'completed' && selectedJob.output_data && (
            <div className="space-y-6">
              <div>
                <h5 className="font-semibold text-gray-900 mb-3">Analysis Results</h5>
                <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm">
                  {JSON.stringify(selectedJob.output_data, null, 2)}
                </pre>
              </div>

              {selectedJob.output_images && selectedJob.output_images.length > 0 && (
                <div>
                  <h5 className="font-semibold text-gray-900 mb-3">Visualizations</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedJob.output_images.map((img, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-4">
                        <img src={img} alt={`Visualization ${idx + 1}`} className="w-full h-auto" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => downloadReport(selectedJob)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
                >
                  <Download className="w-4 h-4" />
                  Generate Report
                </button>
              </div>
            </div>
          )}

          {selectedJob.status === 'failed' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                <strong>Error:</strong> {selectedJob.error_message || 'Unknown error occurred'}
              </p>
            </div>
          )}

          {selectedJob.execution_time && (
            <div className="mt-6 text-sm text-gray-600">
              Execution time: {selectedJob.execution_time.toFixed(2)}s
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-gray-900">R Analysis Backend</h3>
        <p className="text-gray-600 mt-1">
          Execute advanced psychometric analyses using R statistical computing
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
          <Code className="w-8 h-8 text-blue-600 mb-2" />
          <p className="text-sm text-gray-600">Total Jobs</p>
          <p className="text-3xl font-bold text-gray-900">{jobs.length}</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
          <CheckCircle className="w-8 h-8 text-green-600 mb-2" />
          <p className="text-sm text-gray-600">Completed</p>
          <p className="text-3xl font-bold text-gray-900">
            {jobs.filter(j => j.status === 'completed').length}
          </p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
          <RefreshCw className="w-8 h-8 text-orange-600 mb-2" />
          <p className="text-sm text-gray-600">In Progress</p>
          <p className="text-3xl font-bold text-gray-900">
            {jobs.filter(j => j.status === 'processing' || j.status === 'queued').length}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setView('submit')}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
        >
          <Play className="w-5 h-5" />
          Submit New Job
        </button>

        <button
          onClick={loadJobs}
          className="flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition"
        >
          <RefreshCw className="w-5 h-5" />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h4 className="text-lg font-bold text-gray-900 mb-4">Recent Jobs</h4>

        <div className="space-y-3">
          {jobs.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No jobs yet. Submit your first R analysis!</p>
          ) : (
            jobs.map((job) => (
              <div
                key={job.id}
                onClick={() => {
                  setSelectedJob(job);
                  setView('monitor');
                }}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <p className="font-semibold text-gray-900">{job.job_type.toUpperCase()}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(job.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {job.execution_time && (
                    <span className="text-sm text-gray-600">{job.execution_time.toFixed(2)}s</span>
                  )}
                  {getStatusBadge(job.status)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-gray-200 p-6">
        <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          Available R Analysis Capabilities
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
          {templates.map((template) => (
            <div key={template.id} className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{template.template_name}</p>
                <p className="text-xs text-gray-600">{template.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
