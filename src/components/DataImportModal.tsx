import React, { useState } from 'react';
import { Upload, X, Download, AlertCircle, CheckCircle, FileText } from 'lucide-react';
import { importCulturalResponses, downloadResponseTemplate, downloadTranslationTemplate, importTranslationItems } from '../lib/culturalDataImport';

interface DataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  groupId?: string;
  importType: 'responses' | 'translations';
  targetLanguage?: string;
  userId?: string;
}

export function DataImportModal({ isOpen, onClose, onSuccess, groupId, importType, targetLanguage, userId }: DataImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; rowsImported?: number; itemsIdentified?: string[]; errors?: string[] } | null>(null);

  const [participantIdColumn, setParticipantIdColumn] = useState('participant_id');
  const [itemPrefix, setItemPrefix] = useState('Q');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      if (importType === 'responses') {
        if (!groupId) {
          setResult({ success: false, message: 'Group ID is required' });
          return;
        }

        const importResult = await importCulturalResponses(file, groupId, {
          participantIdColumn,
          itemPrefix
        });
        setResult(importResult);
      } else {
        if (!targetLanguage || !userId) {
          setResult({ success: false, message: 'Target language and user ID are required' });
          return;
        }

        const importResult = await importTranslationItems(file, targetLanguage, userId);
        setResult(importResult);
      }

      if (result?.success) {
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Import failed'
      });
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    if (importType === 'responses') {
      downloadResponseTemplate(10);
    } else {
      downloadTranslationTemplate();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Import {importType === 'responses' ? 'Response Data' : 'Translation Items'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">Import Format</h3>
                <p className="text-sm text-gray-700 mb-2">
                  {importType === 'responses' ? (
                    <>Upload a CSV file with participant responses. First column should be participant IDs, and subsequent columns should be item responses (e.g., Q1, Q2, Q3).</>
                  ) : (
                    <>Upload a CSV file with translation items. Required columns: original_text. Optional: forward_translation, back_translation, translator_name, reviewer_name.</>
                  )}
                </p>
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Download className="w-4 h-4" />
                  Download Template
                </button>
              </div>
            </div>
          </div>

          {importType === 'responses' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Participant ID Column
                </label>
                <input
                  type="text"
                  value={participantIdColumn}
                  onChange={(e) => setParticipantIdColumn(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="participant_id"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Item Column Prefix
                </label>
                <input
                  type="text"
                  value={itemPrefix}
                  onChange={(e) => setItemPrefix(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Q"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select CSV File
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-3"
              >
                <div className="p-3 bg-blue-50 rounded-full">
                  <Upload className="w-8 h-8 text-blue-600" />
                </div>
                {file ? (
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <span className="text-sm font-medium text-gray-900">{file.name}</span>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-medium text-gray-900">
                      Click to upload or drag and drop
                    </span>
                    <span className="text-xs text-gray-500">CSV files only</span>
                  </>
                )}
              </label>
            </div>
          </div>

          {result && (
            <div className={`rounded-lg p-4 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                    {result.message}
                  </p>
                  {result.success && result.rowsImported && (
                    <p className="text-sm text-green-700 mt-1">
                      Imported {result.rowsImported} rows
                    </p>
                  )}
                  {result.success && result.itemsIdentified && (
                    <p className="text-sm text-green-700 mt-1">
                      Items detected: {result.itemsIdentified.join(', ')}
                    </p>
                  )}
                  {result.errors && result.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-red-800">Errors:</p>
                      <ul className="list-disc list-inside text-sm text-red-700 mt-1">
                        {result.errors.map((error, i) => (
                          <li key={i}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {importing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Import Data
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
