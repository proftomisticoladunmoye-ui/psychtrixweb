import React, { useState } from 'react';
import {
  CheckCircle, Users, Calculator, TrendingUp, Download, Plus,
  Trash2, AlertCircle, Info, FileText, BarChart3, PieChart
} from 'lucide-react';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { exportToCSV, exportToJSON, exportResultsToPDF } from '../lib/exportUtils';

interface ExpertRating {
  expertId: string;
  expertName: string;
  ratings: { [itemId: string]: number };
}

interface Item {
  id: string;
  name: string;
  description: string;
}

interface CVRResult {
  itemId: string;
  itemName: string;
  essential: number;
  useful: number;
  notNecessary: number;
  cvr: number;
  isSignificant: boolean;
  criticalValue: number;
}

interface CVIResult {
  itemId: string;
  itemName: string;
  relevantCount: number;
  totalExperts: number;
  iCVI: number;
  isAcceptable: boolean;
}

export function EnhancedContentValidity() {
  const [activeMethod, setActiveMethod] = useState<'cvr' | 'cvi'>('cvr');
  const [items, setItems] = useState<Item[]>([]);
  const [experts, setExperts] = useState<ExpertRating[]>([]);
  const [cvrResults, setCvrResults] = useState<CVRResult[]>([]);
  const [cviResults, setCviResults] = useState<CVIResult[]>([]);
  const [scviAverage, setScviAverage] = useState<number>(0);
  const [showResults, setShowResults] = useState(false);

  // CVR critical values based on panel size (Lawshe, 1975)
  const getCriticalValue = (n: number): number => {
    const criticalValues: { [key: number]: number } = {
      5: 0.99, 6: 0.99, 7: 0.99, 8: 0.75, 9: 0.78,
      10: 0.62, 11: 0.59, 12: 0.56, 13: 0.54, 14: 0.51,
      15: 0.49, 20: 0.42, 25: 0.37, 30: 0.33, 35: 0.31, 40: 0.29
    };

    if (n in criticalValues) return criticalValues[n];
    if (n > 40) return 0.29;
    return 0.99;
  };

  const addItem = () => {
    const newItem: Item = {
      id: `item_${Date.now()}`,
      name: `Item ${items.length + 1}`,
      description: ''
    };
    setItems([...items, newItem]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
    setExperts(experts.map(expert => ({
      ...expert,
      ratings: Object.fromEntries(
        Object.entries(expert.ratings).filter(([itemId]) => itemId !== id)
      )
    })));
  };

  const updateItem = (id: string, field: 'name' | 'description', value: string) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const addExpert = () => {
    const newExpert: ExpertRating = {
      expertId: `expert_${Date.now()}`,
      expertName: `Expert ${experts.length + 1}`,
      ratings: {}
    };
    setExperts([...experts, newExpert]);
  };

  const removeExpert = (id: string) => {
    setExperts(experts.filter(expert => expert.expertId !== id));
  };

  const updateExpertName = (id: string, name: string) => {
    setExperts(experts.map(expert =>
      expert.expertId === id ? { ...expert, expertName: name } : expert
    ));
  };

  const updateRating = (expertId: string, itemId: string, rating: number) => {
    setExperts(experts.map(expert =>
      expert.expertId === expertId
        ? { ...expert, ratings: { ...expert.ratings, [itemId]: rating } }
        : expert
    ));
  };

  const calculateCVR = () => {
    if (experts.length < 5) {
      alert('Minimum 5 experts required for CVR calculation');
      return;
    }

    const results: CVRResult[] = items.map(item => {
      const ratings = experts.map(expert => expert.ratings[item.id] || 0);
      const essential = ratings.filter(r => r === 3).length;
      const useful = ratings.filter(r => r === 2).length;
      const notNecessary = ratings.filter(r => r === 1).length;

      const n = experts.length;
      const cvr = (essential - n / 2) / (n / 2);
      const criticalValue = getCriticalValue(n);

      return {
        itemId: item.id,
        itemName: item.name,
        essential,
        useful,
        notNecessary,
        cvr: parseFloat(cvr.toFixed(3)),
        isSignificant: cvr >= criticalValue,
        criticalValue
      };
    });

    setCvrResults(results);
    setShowResults(true);
  };

  const calculateCVI = () => {
    if (experts.length < 3) {
      alert('Minimum 3 experts required for CVI calculation');
      return;
    }

    const results: CVIResult[] = items.map(item => {
      const ratings = experts.map(expert => expert.ratings[item.id] || 0);
      const relevantCount = ratings.filter(r => r >= 3).length; // 3 or 4 = relevant
      const totalExperts = experts.length;
      const iCVI = relevantCount / totalExperts;

      // I-CVI ≥ 0.78 for 6+ experts, 1.0 for <6 experts
      const threshold = totalExperts >= 6 ? 0.78 : 1.0;

      return {
        itemId: item.id,
        itemName: item.name,
        relevantCount,
        totalExperts,
        iCVI: parseFloat(iCVI.toFixed(3)),
        isAcceptable: iCVI >= threshold
      };
    });

    const avgCVI = results.reduce((sum, r) => sum + r.iCVI, 0) / results.length;
    setScviAverage(parseFloat(avgCVI.toFixed(3)));
    setCviResults(results);
    setShowResults(true);
  };

  const handleExport = (format: 'csv' | 'json' | 'pdf') => {
    const data = activeMethod === 'cvr' ? cvrResults : cviResults;
    const methodName = activeMethod === 'cvr' ? 'CVR_Results' : 'CVI_Results';

    switch (format) {
      case 'csv':
        exportToCSV(data, methodName);
        break;
      case 'json':
        exportToJSON({ results: data, method: activeMethod, scviAverage }, methodName);
        break;
      case 'pdf':
        exportResultsToPDF({ results: data, method: activeMethod }, `Content_Validity_${methodName}`);
        break;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Content Validity Assessment</h3>
        <p className="text-gray-600">
          Quantify content validity using expert panel ratings with CVR and CVI methodologies.
        </p>
      </div>

      {/* Method Selection */}
      <div className="flex gap-4 bg-white border border-gray-200 rounded-lg p-2">
        <button
          onClick={() => {
            setActiveMethod('cvr');
            setShowResults(false);
          }}
          className={`flex-1 py-3 px-4 rounded-lg transition font-medium ${
            activeMethod === 'cvr'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Calculator className="w-5 h-5" />
            <span>CVR Method (Lawshe)</span>
          </div>
        </button>
        <button
          onClick={() => {
            setActiveMethod('cvi');
            setShowResults(false);
          }}
          className={`flex-1 py-3 px-4 rounded-lg transition font-medium ${
            activeMethod === 'cvi'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <TrendingUp className="w-5 h-5" />
            <span>CVI Method (Lynn)</span>
          </div>
        </button>
      </div>

      {/* Method Information */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <Info className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">
              {activeMethod === 'cvr' ? 'Content Validity Ratio (CVR)' : 'Content Validity Index (CVI)'}
            </h4>
            {activeMethod === 'cvr' ? (
              <div className="text-sm text-gray-700 space-y-2">
                <p><strong>Scale:</strong> 3-point (Essential | Useful | Not Necessary)</p>
                <p><strong>Formula:</strong> CVR = (n<sub>e</sub> - N/2) / (N/2)</p>
                <p><strong>Range:</strong> -1.00 to +1.00</p>
                <p><strong>Criterion:</strong> Must exceed critical value based on panel size</p>
                <p><strong>Minimum Experts:</strong> 5 (recommended: 7-10)</p>
              </div>
            ) : (
              <div className="text-sm text-gray-700 space-y-2">
                <p><strong>Scale:</strong> 4-point (1=Not relevant, 2=Somewhat relevant, 3=Quite relevant, 4=Highly relevant)</p>
                <p><strong>Formula:</strong> I-CVI = Number of experts rating 3 or 4 / Total number of experts</p>
                <p><strong>Range:</strong> 0.00 to 1.00</p>
                <p><strong>Criterion:</strong> I-CVI ≥ 0.78 for 6+ experts, 1.00 for &lt;6 experts</p>
                <p><strong>S-CVI/Ave:</strong> ≥ 0.90 recommended</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Setup Section */}
      {!showResults && (
        <>
          {/* Items Management */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Scale Items ({items.length})
              </h4>
              <button
                onClick={addItem}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No items added yet. Click "Add Item" to start.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                          placeholder="Item name"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <textarea
                          value={item.description}
                          onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                          placeholder="Item description (optional)"
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Experts Management */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-green-600" />
                Expert Panel ({experts.length})
              </h4>
              <button
                onClick={addExpert}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Expert
              </button>
            </div>

            {experts.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 mb-1">No experts added yet. Click "Add Expert" to start.</p>
                <p className="text-sm text-gray-500">
                  Minimum: {activeMethod === 'cvr' ? '5 experts' : '3 experts'} (Recommended: 7-10)
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {experts.map((expert, index) => (
                  <div key={expert.expertId} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-sm">
                        {index + 1}
                      </div>
                      <input
                        type="text"
                        value={expert.expertName}
                        onChange={(e) => updateExpertName(expert.expertId, e.target.value)}
                        placeholder="Expert name"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <button
                        onClick={() => removeExpert(expert.expertId)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {items.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-medium text-gray-600 uppercase">Rate Each Item:</p>
                        <div className="grid grid-cols-1 gap-2">
                          {items.map(item => (
                            <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded p-2">
                              <span className="text-sm text-gray-700 flex-1">{item.name}</span>
                              <select
                                value={expert.ratings[item.id] || 0}
                                onChange={(e) => updateRating(expert.expertId, item.id, parseInt(e.target.value))}
                                className="text-sm px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                              >
                                <option value={0}>Not Rated</option>
                                {activeMethod === 'cvr' ? (
                                  <>
                                    <option value={1}>Not Necessary</option>
                                    <option value={2}>Useful</option>
                                    <option value={3}>Essential</option>
                                  </>
                                ) : (
                                  <>
                                    <option value={1}>Not relevant</option>
                                    <option value={2}>Somewhat relevant</option>
                                    <option value={3}>Quite relevant</option>
                                    <option value={4}>Highly relevant</option>
                                  </>
                                )}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Calculate Button */}
          {items.length > 0 && experts.length >= (activeMethod === 'cvr' ? 5 : 3) && (
            <button
              onClick={activeMethod === 'cvr' ? calculateCVR : calculateCVI}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-4 rounded-lg transition flex items-center justify-center gap-3 shadow-lg"
            >
              <Calculator className="w-6 h-6" />
              Calculate {activeMethod === 'cvr' ? 'CVR' : 'CVI'} Values
            </button>
          )}

          {items.length > 0 && experts.length > 0 && experts.length < (activeMethod === 'cvr' ? 5 : 3) && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <p className="text-yellow-800">
                  Need at least {activeMethod === 'cvr' ? '5 experts for CVR' : '3 experts for CVI'} calculation.
                  Currently: {experts.length} expert{experts.length !== 1 ? 's' : ''}.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Results Section */}
      {showResults && activeMethod === 'cvr' && cvrResults.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">CVR Results</h3>
            <button
              onClick={() => setShowResults(false)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition"
            >
              Back to Setup
            </button>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <FileText className="w-6 h-6 text-blue-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{items.length}</p>
              <p className="text-sm text-gray-600">Total Items</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <CheckCircle className="w-6 h-6 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">
                {cvrResults.filter(r => r.isSignificant).length}
              </p>
              <p className="text-sm text-gray-600">Significant Items</p>
            </div>
            <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-4 border border-teal-200">
              <Users className="w-6 h-6 text-teal-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{experts.length}</p>
              <p className="text-sm text-gray-600">Expert Judges</p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
              <Calculator className="w-6 h-6 text-orange-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">
                {cvrResults[0]?.criticalValue.toFixed(2)}
              </p>
              <p className="text-sm text-gray-600">Critical Value</p>
            </div>
          </div>

          {/* CVR Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">CVR Values by Item</h4>
            <Bar
              data={{
                labels: cvrResults.map(r => r.itemName),
                datasets: [{
                  label: 'CVR Value',
                  data: cvrResults.map(r => r.cvr),
                  backgroundColor: cvrResults.map(r =>
                    r.isSignificant ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'
                  ),
                  borderColor: cvrResults.map(r =>
                    r.isSignificant ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'
                  ),
                  borderWidth: 2,
                }],
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: { display: false },
                  title: {
                    display: true,
                    text: `Green = Significant (≥ ${cvrResults[0]?.criticalValue.toFixed(2)}), Red = Not Significant`,
                  },
                },
                scales: {
                  y: {
                    min: -1,
                    max: 1,
                    title: { display: true, text: 'CVR Value' },
                  },
                },
              }}
            />
          </div>

          {/* CVR Table */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Detailed Results</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Item</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Essential</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Useful</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Not Necessary</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">CVR</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {cvrResults.map((result, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-3 px-4 font-medium text-gray-900">{result.itemName}</td>
                      <td className="py-3 px-4 text-center text-gray-700">{result.essential}</td>
                      <td className="py-3 px-4 text-center text-gray-700">{result.useful}</td>
                      <td className="py-3 px-4 text-center text-gray-700">{result.notNecessary}</td>
                      <td className="py-3 px-4 text-center font-bold text-gray-900">{result.cvr}</td>
                      <td className="py-3 px-4 text-center">
                        {result.isSignificant ? (
                          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            Significant
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                            Not Significant
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Export Options */}
          <div className="flex gap-3">
            <button
              onClick={() => handleExport('pdf')}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
            >
              <Download className="w-5 h-5" />
              Export PDF
            </button>
            <button
              onClick={() => handleExport('csv')}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium"
            >
              <Download className="w-5 h-5" />
              Export CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition font-medium"
            >
              <Download className="w-5 h-5" />
              Export JSON
            </button>
          </div>
        </div>
      )}

      {/* CVI Results */}
      {showResults && activeMethod === 'cvi' && cviResults.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">CVI Results</h3>
            <button
              onClick={() => setShowResults(false)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition"
            >
              Back to Setup
            </button>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <FileText className="w-6 h-6 text-blue-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{items.length}</p>
              <p className="text-sm text-gray-600">Total Items</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <CheckCircle className="w-6 h-6 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">
                {cviResults.filter(r => r.isAcceptable).length}
              </p>
              <p className="text-sm text-gray-600">Acceptable Items</p>
            </div>
            <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-4 border border-teal-200">
              <TrendingUp className="w-6 h-6 text-teal-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{scviAverage.toFixed(3)}</p>
              <p className="text-sm text-gray-600">S-CVI/Ave</p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
              <Users className="w-6 h-6 text-orange-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{experts.length}</p>
              <p className="text-sm text-gray-600">Expert Judges</p>
            </div>
          </div>

          {/* S-CVI Status */}
          <div className={`rounded-lg p-6 border-2 ${
            scviAverage >= 0.90
              ? 'bg-green-50 border-green-500'
              : 'bg-yellow-50 border-yellow-500'
          }`}>
            <div className="flex items-center gap-3">
              {scviAverage >= 0.90 ? (
                <CheckCircle className="w-8 h-8 text-green-600" />
              ) : (
                <AlertCircle className="w-8 h-8 text-yellow-600" />
              )}
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">
                  Scale-Level Content Validity Index (S-CVI/Ave): {scviAverage.toFixed(3)}
                </h4>
                <p className={`text-sm ${scviAverage >= 0.90 ? 'text-green-700' : 'text-yellow-700'}`}>
                  {scviAverage >= 0.90
                    ? 'Excellent! Scale demonstrates good content validity (≥ 0.90 recommended)'
                    : 'Below recommended threshold of 0.90. Consider revising items with low I-CVI values.'}
                </p>
              </div>
            </div>
          </div>

          {/* CVI Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">I-CVI Values by Item</h4>
            <Bar
              data={{
                labels: cviResults.map(r => r.itemName),
                datasets: [{
                  label: 'I-CVI Value',
                  data: cviResults.map(r => r.iCVI),
                  backgroundColor: cviResults.map(r =>
                    r.isAcceptable ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'
                  ),
                  borderColor: cviResults.map(r =>
                    r.isAcceptable ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'
                  ),
                  borderWidth: 2,
                }],
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: { display: false },
                  title: {
                    display: true,
                    text: `Green = Acceptable (≥ ${experts.length >= 6 ? '0.78' : '1.00'}), Red = Below Threshold`,
                  },
                },
                scales: {
                  y: {
                    min: 0,
                    max: 1,
                    title: { display: true, text: 'I-CVI Value' },
                  },
                },
              }}
            />
          </div>

          {/* CVI Table */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Item-Level Results</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Item</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Relevant Ratings</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Total Experts</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">I-CVI</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {cviResults.map((result, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-3 px-4 font-medium text-gray-900">{result.itemName}</td>
                      <td className="py-3 px-4 text-center text-gray-700">{result.relevantCount}</td>
                      <td className="py-3 px-4 text-center text-gray-700">{result.totalExperts}</td>
                      <td className="py-3 px-4 text-center font-bold text-gray-900">{result.iCVI}</td>
                      <td className="py-3 px-4 text-center">
                        {result.isAcceptable ? (
                          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            Acceptable
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                            Below Threshold
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Export Options */}
          <div className="flex gap-3">
            <button
              onClick={() => handleExport('pdf')}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
            >
              <Download className="w-5 h-5" />
              Export PDF
            </button>
            <button
              onClick={() => handleExport('csv')}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium"
            >
              <Download className="w-5 h-5" />
              Export CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition font-medium"
            >
              <Download className="w-5 h-5" />
              Export JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
