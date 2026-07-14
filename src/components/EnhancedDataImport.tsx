import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import Papa from 'papaparse';
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Trash2,
  Download,
  Eye,
  BarChart3,
  RefreshCw,
  Filter,
  X,
  Save,
  FileSpreadsheet
} from 'lucide-react';

interface Dataset {
  id: string;
  name: string;
  file_name: string;
  file_size: number;
  rows_count: number;
  columns: string[];
  data: any[];
  created_at: string;
}

interface DataQualityReport {
  totalRows: number;
  totalColumns: number;
  missingValues: { [key: string]: number };
  missingPercentage: { [key: string]: number };
  outliers: { [key: string]: number[] };
  columnStats: {
    [key: string]: {
      mean: number;
      median: number;
      std: number;
      min: number;
      max: number;
      unique: number;
    };
  };
}

export function EnhancedDataImport() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  const [viewingDataset, setViewingDataset] = useState<Dataset | null>(null);
  const [qualityReport, setQualityReport] = useState<DataQualityReport | null>(null);
  const [showQualityReport, setShowQualityReport] = useState(false);
  const [reverseCodeColumns, setReverseCodeColumns] = useState<string[]>([]);
  const [maxValue, setMaxValue] = useState<number>(5);
  const [cleanedData, setCleanedData] = useState<any[] | null>(null);
  const [dataView, setDataView] = useState<'list' | 'spreadsheet' | 'quality'>('list');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    loadDatasets();
  }, []);

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const loadDatasets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('datasets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDatasets(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const processFile = async (file: File) => {
    const MAX_FILE_SIZE = 50 * 1024 * 1024;

    if (file.size > MAX_FILE_SIZE) {
      setError('File size exceeds 50MB limit');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');
    setUploadProgress('Reading file...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      setUploadProgress('Parsing CSV data...');

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            if (results.errors.length > 0) {
              const criticalErrors = results.errors.filter(e => e.type === 'FieldMismatch');
              if (criticalErrors.length > 0) {
                throw new Error(`CSV parsing errors: ${criticalErrors[0].message}`);
              }
            }

            const columns = results.meta.fields || [];

            if (columns.length === 0) {
              throw new Error('No columns found in CSV file');
            }

            const data = results.data.filter((row: any) =>
              Object.values(row).some(val => val !== null && val !== '')
            );

            if (data.length === 0) {
              throw new Error('No valid data rows found in CSV file');
            }

            setUploadProgress('Saving to database...');

            const { error: insertError } = await supabase.from('datasets').insert({
              user_id: user.id,
              name: file.name.replace(/\.[^/.]+$/, ''),
              file_name: file.name,
              file_size: file.size,
              columns: columns,
              data: data,
              rows_count: data.length,
              metadata: {
                uploadedAt: new Date().toISOString(),
                columnTypes: columns.map((col) => ({ name: col, type: detectColumnType(data, col) })),
              },
            });

            if (insertError) throw insertError;

            setSuccess(`Dataset uploaded successfully! ${data.length} rows, ${columns.length} columns`);
            setUploadProgress('');
            loadDatasets();
          } catch (err: any) {
            setError(err.message);
            setUploadProgress('');
          } finally {
            setUploading(false);
          }
        },
        error: (err) => {
          setError(`Failed to parse CSV: ${err.message}`);
          setUploading(false);
          setUploadProgress('');
        },
      });
    } catch (err: any) {
      setError(err.message);
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      processFile(file);
    }
  };

  const detectColumnType = (data: any[], column: string): string => {
    const values = data.map(row => row[column]).filter(v => v !== null && v !== '');
    if (values.length === 0) return 'unknown';

    const allNumeric = values.every(v => !isNaN(Number(v)));
    if (allNumeric) return 'numeric';

    const uniqueCount = new Set(values).size;
    if (uniqueCount < values.length * 0.1) return 'categorical';

    return 'text';
  };

  const generateQualityReport = (dataset: Dataset): DataQualityReport => {
    const report: DataQualityReport = {
      totalRows: dataset.data.length,
      totalColumns: dataset.columns.length,
      missingValues: {},
      missingPercentage: {},
      outliers: {},
      columnStats: {},
    };

    dataset.columns.forEach(col => {
      const values = dataset.data.map(row => row[col]);
      const missing = values.filter(v => v === null || v === '' || v === undefined).length;
      report.missingValues[col] = missing;
      report.missingPercentage[col] = (missing / dataset.data.length) * 100;

      const numericValues = values
        .filter(v => v !== null && v !== '' && !isNaN(Number(v)))
        .map(v => Number(v));

      if (numericValues.length > 0) {
        const sorted = [...numericValues].sort((a, b) => a - b);
        const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        const median = sorted[Math.floor(sorted.length / 2)];
        const variance = numericValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numericValues.length;
        const std = Math.sqrt(variance);

        report.columnStats[col] = {
          mean: Number(mean.toFixed(2)),
          median: Number(median.toFixed(2)),
          std: Number(std.toFixed(2)),
          min: sorted[0],
          max: sorted[sorted.length - 1],
          unique: new Set(numericValues).size,
        };

        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;

        report.outliers[col] = numericValues
          .map((val, idx) => (val < lowerBound || val > upperBound) ? idx : -1)
          .filter(idx => idx !== -1);
      }
    });

    return report;
  };

  const handleViewDataset = (dataset: Dataset) => {
    setViewingDataset(dataset);
    setDataView('spreadsheet');
    const report = generateQualityReport(dataset);
    setQualityReport(report);
    setCleanedData(null);
    setReverseCodeColumns([]);
  };

  const handleReverseCode = () => {
    if (!viewingDataset) return;

    const reversed = viewingDataset.data.map(row => {
      const newRow = { ...row };
      reverseCodeColumns.forEach(col => {
        const val = Number(row[col]);
        if (!isNaN(val)) {
          newRow[col] = maxValue + 1 - val;
        }
      });
      return newRow;
    });

    setCleanedData(reversed);
    setSuccess(`Reverse coded ${reverseCodeColumns.length} columns`);
  };

  const handleRemoveMissing = () => {
    if (!viewingDataset) return;

    const cleaned = viewingDataset.data.filter(row =>
      viewingDataset.columns.every(col => row[col] !== null && row[col] !== '' && row[col] !== undefined)
    );

    setCleanedData(cleaned);
    setSuccess(`Removed ${viewingDataset.data.length - cleaned.length} rows with missing values`);
  };

  const handleExportCleanedData = () => {
    if (!cleanedData || !viewingDataset) return;

    const csv = Papa.unparse(cleanedData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${viewingDataset.name}_cleaned.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setSuccess('Clean data exported successfully');
  };

  const handleSaveCleanedData = async () => {
    if (!cleanedData || !viewingDataset) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: insertError } = await supabase.from('datasets').insert({
        user_id: user.id,
        name: `${viewingDataset.name} (Cleaned)`,
        file_name: `${viewingDataset.file_name}_cleaned.csv`,
        file_size: JSON.stringify(cleanedData).length,
        columns: viewingDataset.columns,
        data: cleanedData,
        rows_count: cleanedData.length,
        metadata: {
          cleanedAt: new Date().toISOString(),
          originalDatasetId: viewingDataset.id,
        },
      });

      if (insertError) throw insertError;

      setSuccess('Cleaned dataset saved successfully!');
      loadDatasets();
      setViewingDataset(null);
      setDataView('list');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this dataset?')) return;

    try {
      const { error } = await supabase.from('datasets').delete().eq('id', id);
      if (error) throw error;

      setSuccess('Dataset deleted successfully');
      loadDatasets();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (dataView === 'spreadsheet' && viewingDataset) {
    const displayData = cleanedData || viewingDataset.data;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{viewingDataset.name}</h1>
            <p className="text-gray-600 mt-1">
              {displayData.length} rows × {viewingDataset.columns.length} columns
              {cleanedData && <span className="ml-2 text-green-600 font-medium">(Cleaned Data)</span>}
            </p>
          </div>
          <button
            onClick={() => {
              setViewingDataset(null);
              setDataView('list');
              setCleanedData(null);
            }}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-green-800">{success}</p>
            </div>
            <button onClick={() => setSuccess('')} className="text-green-600 hover:text-green-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowQualityReport(!showQualityReport)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition flex items-center gap-2"
          >
            <BarChart3 className="w-5 h-5" />
            {showQualityReport ? 'Hide' : 'Show'} Quality Report
          </button>
          <button
            onClick={handleRemoveMissing}
            className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition flex items-center gap-2"
          >
            <Filter className="w-5 h-5" />
            Remove Missing Values
          </button>
          {cleanedData && (
            <>
              <button
                onClick={handleExportCleanedData}
                className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                Export Clean Data
              </button>
              <button
                onClick={handleSaveCleanedData}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                Save as New Dataset
              </button>
            </>
          )}
        </div>

        {showQualityReport && qualityReport && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
            <h3 className="text-xl font-bold text-gray-900">Data Quality Report</h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Total Rows</p>
                <p className="text-2xl font-bold text-blue-600">{qualityReport.totalRows}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Total Columns</p>
                <p className="text-2xl font-bold text-green-600">{qualityReport.totalColumns}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Missing Values</p>
                <p className="text-2xl font-bold text-orange-600">
                  {Object.values(qualityReport.missingValues).reduce((a, b) => a + b, 0)}
                </p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Columns with Outliers</p>
                <p className="text-2xl font-bold text-red-600">
                  {Object.values(qualityReport.outliers).filter(arr => arr.length > 0).length}
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Missing Values by Column</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.entries(qualityReport.missingPercentage)
                  .filter(([_, pct]) => pct > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([col, pct]) => (
                    <div key={col} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-700 w-32 truncate">{col}</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">
                        <div
                          className={`h-full ${
                            pct > 20 ? 'bg-red-500' : pct > 10 ? 'bg-orange-500' : 'bg-yellow-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-600 w-16 text-right">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                {Object.entries(qualityReport.missingPercentage).filter(([_, pct]) => pct > 0).length === 0 && (
                  <p className="text-sm text-green-600 text-center py-4">No missing values detected!</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Descriptive Statistics</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">Column</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Mean</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Median</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">SD</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Min</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Max</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Outliers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(qualityReport.columnStats).map(([col, stats]) => (
                      <tr key={col} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-medium text-gray-900">{col}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{stats.mean}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{stats.median}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{stats.std}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{stats.min}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{stats.max}</td>
                        <td className="py-2 px-3 text-right">
                          {qualityReport.outliers[col]?.length > 0 ? (
                            <span className="text-red-600 font-medium">
                              {qualityReport.outliers[col].length}
                            </span>
                          ) : (
                            <span className="text-green-600">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900">Reverse Coding</h3>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Max Value:</label>
              <input
                type="number"
                value={maxValue}
                onChange={(e) => setMaxValue(Number(e.target.value))}
                className="w-20 px-3 py-1 border border-gray-300 rounded"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
            {viewingDataset.columns.map(col => (
              <label key={col} className="flex items-center gap-2 cursor-pointer p-2 border rounded hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={reverseCodeColumns.includes(col)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setReverseCodeColumns([...reverseCodeColumns, col]);
                    } else {
                      setReverseCodeColumns(reverseCodeColumns.filter(c => c !== col));
                    }
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700 truncate">{col}</span>
              </label>
            ))}
          </div>

          <button
            onClick={handleReverseCode}
            disabled={reverseCodeColumns.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-5 h-5" />
            Apply Reverse Coding ({reverseCodeColumns.length} columns)
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Data Spreadsheet View
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="py-2 px-4 text-left font-semibold text-gray-700 border-b">#</th>
                  {viewingDataset.columns.map(col => (
                    <th key={col} className="py-2 px-4 text-left font-semibold text-gray-700 border-b whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayData.slice(0, 100).map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 border-b border-gray-100">
                    <td className="py-2 px-4 text-gray-500 font-medium">{idx + 1}</td>
                    {viewingDataset.columns.map(col => {
                      const value = row[col];
                      const isMissing = value === null || value === '' || value === undefined;

                      return (
                        <td
                          key={col}
                          className={`py-2 px-4 ${
                            isMissing ? 'bg-red-50 text-red-600 italic' : 'text-gray-700'
                          }`}
                        >
                          {isMissing ? 'missing' : String(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {displayData.length > 100 && (
            <div className="p-4 bg-gray-50 border-t border-gray-200 text-center text-sm text-gray-600">
              Showing first 100 rows of {displayData.length} total rows
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Data Import</h1>
        <p className="text-gray-600 mt-1">Upload and manage your datasets for analysis</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-800">{error}</p>
          </div>
          <button onClick={() => setError('')} className="text-red-600 hover:text-red-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-green-800">{success}</p>
          </div>
          <button onClick={() => setSuccess('')} className="text-green-600 hover:text-green-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`bg-white rounded-xl border-2 border-dashed p-12 text-center transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-50 scale-105'
            : uploading
            ? 'border-gray-300 bg-gray-50'
            : 'border-gray-300 hover:border-blue-400'
        }`}
      >
        {uploading ? (
          <div className="space-y-4">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-gray-700 font-medium">{uploadProgress || 'Uploading...'}</p>
          </div>
        ) : (
          <>
            <Upload className={`w-16 h-16 mx-auto mb-4 ${isDragging ? 'text-blue-600' : 'text-gray-400'}`} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Dataset</h3>
            <p className="text-gray-600 mb-4">
              {isDragging ? 'Drop your file here...' : 'Drag and drop or click to browse CSV files'}
            </p>
            <p className="text-sm text-gray-500 mb-4">Maximum file size: 50MB</p>
            <label className="inline-block">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
              <span className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg cursor-pointer inline-block transition disabled:opacity-50">
                Select CSV File
              </span>
            </label>
          </>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Datasets</h2>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : datasets.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No datasets uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {datasets.map((dataset) => (
              <div
                key={dataset.id}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <FileText className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {dataset.name}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">{dataset.file_name}</p>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                        <span>{dataset.rows_count} rows</span>
                        <span>{dataset.columns.length} columns</span>
                        <span>{formatFileSize(dataset.file_size)}</span>
                        <span>{new Date(dataset.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleViewDataset(dataset)}
                      className="p-2 hover:bg-blue-50 rounded-lg transition"
                      title="View & Clean Data"
                    >
                      <Eye className="w-5 h-5 text-blue-600" />
                    </button>
                    <button
                      onClick={() => {
                        const csv = Papa.unparse(dataset.data);
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = dataset.file_name;
                        link.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="p-2 hover:bg-green-50 rounded-lg transition"
                      title="Download"
                    >
                      <Download className="w-5 h-5 text-green-600" />
                    </button>
                    <button
                      onClick={() => handleDelete(dataset.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5 text-red-600" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
