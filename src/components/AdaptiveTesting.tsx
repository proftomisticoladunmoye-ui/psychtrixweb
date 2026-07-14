import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Zap,
  Brain,
  Target,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Download,
  BarChart3,
  Settings,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Clock,
  Hash
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { exportResultsToPDF, exportToCSV, exportToJSON } from '../lib/exportUtils';

interface ItemBankItem {
  id: string;
  content: string;
  a: number;
  b: number;
  c: number;
  used: boolean;
}

interface CATSession {
  items: ItemBankItem[];
  responses: number[];
  abilityEstimates: number[];
  standardErrors: number[];
  currentItem: number;
  status: 'idle' | 'running' | 'completed';
}

export function AdaptiveTesting() {
  const [view, setView] = useState<'home' | 'itembank' | 'simulation'>('home');
  const [itemBank, setItemBank] = useState<ItemBankItem[]>([]);
  const [newItem, setNewItem] = useState({ content: '', a: 1.0, b: 0.0, c: 0.0 });
  const [session, setSession] = useState<CATSession>({
    items: [],
    responses: [],
    abilityEstimates: [],
    standardErrors: [],
    currentItem: 0,
    status: 'idle',
  });

  const [settings, setSettings] = useState({
    startingAbility: 0.0,
    maxItems: 20,
    seThreshold: 0.3,
    selectionMethod: 'mfi' as 'mfi' | 'random',
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadItemBank();
  }, []);

  const loadItemBank = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const savedItems = localStorage.getItem(`cat_items_${user.id}`);
      if (savedItems) {
        setItemBank(JSON.parse(savedItems));
      } else {
        const defaultItems = generateDefaultItemBank();
        setItemBank(defaultItems);
        localStorage.setItem(`cat_items_${user.id}`, JSON.stringify(defaultItems));
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const generateDefaultItemBank = (): ItemBankItem[] => {
    const items: ItemBankItem[] = [];
    for (let i = 0; i < 50; i++) {
      items.push({
        id: `item_${i + 1}`,
        content: `Item ${i + 1}: Sample question about the construct`,
        a: 0.5 + Math.random() * 1.5,
        b: -2 + Math.random() * 4,
        c: 0.15 + Math.random() * 0.15,
        used: false,
      });
    }
    return items;
  };

  const addItemToBank = async () => {
    if (!newItem.content) {
      setError('Item content is required');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const item: ItemBankItem = {
        id: `item_${Date.now()}`,
        content: newItem.content,
        a: newItem.a,
        b: newItem.b,
        c: newItem.c,
        used: false,
      };

      const updatedBank = [...itemBank, item];
      setItemBank(updatedBank);
      localStorage.setItem(`cat_items_${user.id}`, JSON.stringify(updatedBank));

      setNewItem({ content: '', a: 1.0, b: 0.0, c: 0.0 });
      setSuccess('Item added to bank successfully');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const irt3pl = (theta: number, a: number, b: number, c: number): number => {
    return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
  };

  const calculateInformation = (theta: number, a: number, b: number, c: number): number => {
    const p = irt3pl(theta, a, b, c);
    const q = 1 - p;
    const numerator = a * a * q * Math.pow(p - c, 2);
    const denominator = p * Math.pow(1 - c, 2);
    return numerator / denominator;
  };

  const selectNextItem = (currentTheta: number, unusedItems: ItemBankItem[]): ItemBankItem => {
    if (settings.selectionMethod === 'random') {
      return unusedItems[Math.floor(Math.random() * unusedItems.length)];
    }

    let maxInfo = -Infinity;
    let selectedItem = unusedItems[0];

    unusedItems.forEach(item => {
      const info = calculateInformation(currentTheta, item.a, item.b, item.c);
      if (info > maxInfo) {
        maxInfo = info;
        selectedItem = item;
      }
    });

    return selectedItem;
  };

  const estimateAbility = (items: ItemBankItem[], responses: number[]): { theta: number; se: number } => {
    if (responses.length === 0) {
      return { theta: settings.startingAbility, se: 1.0 };
    }

    let theta = settings.startingAbility;
    const maxIterations = 20;
    const tolerance = 0.001;

    for (let iter = 0; iter < maxIterations; iter++) {
      let firstDeriv = 0;
      let secondDeriv = 0;

      items.forEach((item, idx) => {
        if (idx >= responses.length) return;

        const p = irt3pl(theta, item.a, item.b, item.c);
        const q = 1 - p;
        const pMinusC = p - item.c;
        const oneMinusC = 1 - item.c;

        const dPdTheta = (item.a * q * pMinusC) / oneMinusC;
        const d2PdTheta2 = (item.a * item.a * q * pMinusC * (item.c - p)) / (oneMinusC * oneMinusC);

        firstDeriv += (responses[idx] - p) / (p * q) * dPdTheta;
        secondDeriv += d2PdTheta2 / (p * q) - Math.pow(dPdTheta, 2) / Math.pow(p * q, 2);
      });

      if (Math.abs(firstDeriv) < tolerance) break;

      theta -= firstDeriv / secondDeriv;
    }

    let totalInfo = 0;
    items.forEach((item, idx) => {
      if (idx >= responses.length) return;
      totalInfo += calculateInformation(theta, item.a, item.b, item.c);
    });

    const se = totalInfo > 0 ? 1 / Math.sqrt(totalInfo) : 1.0;

    return { theta, se };
  };

  const startCAT = () => {
    const availableItems = itemBank.map(item => ({ ...item, used: false }));

    if (availableItems.length < 5) {
      setError('Need at least 5 items in the bank to start CAT');
      return;
    }

    setSession({
      items: [],
      responses: [],
      abilityEstimates: [settings.startingAbility],
      standardErrors: [1.0],
      currentItem: 0,
      status: 'running',
    });

    setError('');
    setSuccess('');
  };

  const respondToItem = (response: number) => {
    const newResponses = [...session.responses, response];
    const newItems = [...session.items];

    const { theta, se } = estimateAbility(newItems, newResponses);

    const newEstimates = [...session.abilityEstimates, theta];
    const newSEs = [...session.standardErrors, se];

    const shouldStop =
      newResponses.length >= settings.maxItems ||
      se <= settings.seThreshold ||
      newItems.length >= itemBank.length;

    setSession({
      ...session,
      responses: newResponses,
      abilityEstimates: newEstimates,
      standardErrors: newSEs,
      currentItem: session.currentItem + 1,
      status: shouldStop ? 'completed' : 'running',
    });
  };

  const getCurrentItem = (): ItemBankItem | null => {
    if (session.status !== 'running') return null;

    const unusedItems = itemBank.filter(
      item => !session.items.find(usedItem => usedItem.id === item.id)
    );

    if (unusedItems.length === 0) return null;

    const currentTheta = session.abilityEstimates[session.abilityEstimates.length - 1];
    const nextItem = selectNextItem(currentTheta, unusedItems);

    if (!session.items.find(item => item.id === nextItem.id)) {
      setSession(prev => ({
        ...prev,
        items: [...prev.items, nextItem],
      }));
    }

    return nextItem;
  };

  const resetCAT = () => {
    setSession({
      items: [],
      responses: [],
      abilityEstimates: [],
      standardErrors: [],
      currentItem: 0,
      status: 'idle',
    });
    setError('');
    setSuccess('');
  };

  const handleExportResults = (format: 'pdf' | 'csv' | 'json') => {
    if (session.status !== 'completed') {
      setError('Complete the CAT session before exporting');
      return;
    }

    const results = {
      finalAbility: session.abilityEstimates[session.abilityEstimates.length - 1],
      finalSE: session.standardErrors[session.standardErrors.length - 1],
      itemsAdministered: session.items.length,
      responses: session.responses,
      abilityTrajectory: session.abilityEstimates,
      seTrajectory: session.standardErrors,
      items: session.items.map((item, idx) => ({
        itemId: item.id,
        content: item.content,
        a: item.a,
        b: item.b,
        c: item.c,
        response: session.responses[idx],
        abilityAfter: session.abilityEstimates[idx + 1],
        seAfter: session.standardErrors[idx + 1],
      })),
    };

    switch (format) {
      case 'pdf':
        exportResultsToPDF(results, 'CAT Session Results');
        break;
      case 'csv':
        exportToCSV(results.items, 'CAT_Session_Items');
        break;
      case 'json':
        exportToJSON(results, 'CAT_Session_Results');
        break;
    }

    setSuccess(`Results exported as ${format.toUpperCase()}`);
  };

  const currentItem = getCurrentItem();

  if (view === 'itembank') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Item Bank Management</h1>
            <p className="text-gray-600 mt-1">Manage your IRT calibrated item pool</p>
          </div>
          <button
            onClick={() => setView('home')}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition"
          >
            Back to Home
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
          <h2 className="text-xl font-bold text-gray-900 mb-4">Add New Item</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Item Content</label>
              <textarea
                value={newItem.content}
                onChange={(e) => setNewItem({ ...newItem, content: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Enter item question or statement..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Discrimination (a)
              </label>
              <input
                type="number"
                step="0.1"
                value={newItem.a}
                onChange={(e) => setNewItem({ ...newItem, a: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Typical range: 0.5 - 2.5</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty (b)</label>
              <input
                type="number"
                step="0.1"
                value={newItem.b}
                onChange={(e) => setNewItem({ ...newItem, b: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Typical range: -3 to +3</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Guessing (c)</label>
              <input
                type="number"
                step="0.01"
                value={newItem.c}
                onChange={(e) => setNewItem({ ...newItem, c: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Typical range: 0 - 0.35</p>
            </div>
          </div>
          <button
            onClick={addItemToBank}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Item
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Current Item Bank ({itemBank.length} items)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">ID</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Content</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">a</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">b</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">c</th>
                </tr>
              </thead>
              <tbody>
                {itemBank.slice(0, 20).map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-3 px-4 text-gray-700">{item.id}</td>
                    <td className="py-3 px-4 text-gray-700">{item.content.substring(0, 60)}...</td>
                    <td className="py-3 px-4 text-center text-gray-700">{item.a.toFixed(2)}</td>
                    <td className="py-3 px-4 text-center text-gray-700">{item.b.toFixed(2)}</td>
                    <td className="py-3 px-4 text-center text-gray-700">{item.c.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {itemBank.length > 20 && (
              <p className="text-sm text-gray-600 text-center mt-4">
                Showing 20 of {itemBank.length} items
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'simulation') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">CAT Simulation</h1>
            <p className="text-gray-600 mt-1">
              {session.status === 'idle' && 'Configure and start your adaptive test'}
              {session.status === 'running' && `Item ${session.currentItem + 1} of ${settings.maxItems} max`}
              {session.status === 'completed' && 'Session completed!'}
            </p>
          </div>
          <button
            onClick={() => setView('home')}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition"
          >
            Back to Home
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

        {session.status === 'idle' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Settings className="w-6 h-6" />
              CAT Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Starting Ability Estimate (θ)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={settings.startingAbility}
                  onChange={(e) =>
                    setSettings({ ...settings, startingAbility: parseFloat(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Items</label>
                <input
                  type="number"
                  value={settings.maxItems}
                  onChange={(e) => setSettings({ ...settings, maxItems: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SE Threshold (stopping rule)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.seThreshold}
                  onChange={(e) =>
                    setSettings({ ...settings, seThreshold: parseFloat(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Item Selection Method
                </label>
                <select
                  value={settings.selectionMethod}
                  onChange={(e) =>
                    setSettings({ ...settings, selectionMethod: e.target.value as 'mfi' | 'random' })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="mfi">Maximum Fisher Information (MFI)</option>
                  <option value="random">Random Selection</option>
                </select>
              </div>
            </div>
            <button
              onClick={startCAT}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              Start CAT Session
            </button>
          </div>
        )}

        {session.status === 'running' && currentItem && (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div className="max-w-2xl mx-auto">
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-blue-600" />
                    <span className="text-gray-700">
                      Item {session.currentItem + 1} / {settings.maxItems}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-600" />
                    <span className="text-gray-700">
                      θ = {session.abilityEstimates[session.abilityEstimates.length - 1].toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <span className="text-gray-700">
                      SE = {session.standardErrors[session.standardErrors.length - 1].toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{currentItem.content}</h3>
                <p className="text-sm text-gray-500">
                  Item parameters: a={currentItem.a.toFixed(2)}, b={currentItem.b.toFixed(2)}, c=
                  {currentItem.c.toFixed(2)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => respondToItem(1)}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium py-4 rounded-lg transition"
                >
                  Correct (1)
                </button>
                <button
                  onClick={() => respondToItem(0)}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium py-4 rounded-lg transition"
                >
                  Incorrect (0)
                </button>
              </div>
            </div>
          </div>
        )}

        {session.status === 'completed' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl border border-gray-200 p-8">
              <div className="text-center mb-6">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Session Completed!</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
                <div className="bg-white rounded-lg p-4 text-center">
                  <Target className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-1">Final Ability</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {session.abilityEstimates[session.abilityEstimates.length - 1].toFixed(2)}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <TrendingUp className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-1">Final SE</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {session.standardErrors[session.standardErrors.length - 1].toFixed(2)}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <Hash className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-1">Items Used</p>
                  <p className="text-2xl font-bold text-gray-900">{session.items.length}</p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <BarChart3 className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-1">Correct %</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {((session.responses.reduce((a, b) => a + b, 0) / session.responses.length) * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Ability Estimation Trajectory</h3>
              <Line
                data={{
                  labels: session.abilityEstimates.map((_, idx) => `Item ${idx}`),
                  datasets: [
                    {
                      label: 'Ability Estimate (θ)',
                      data: session.abilityEstimates,
                      borderColor: 'rgb(59, 130, 246)',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      tension: 0.4,
                    },
                    {
                      label: 'Standard Error',
                      data: session.standardErrors,
                      borderColor: 'rgb(239, 68, 68)',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      tension: 0.4,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'top',
                    },
                  },
                  scales: {
                    y: {
                      title: {
                        display: true,
                        text: 'Value',
                      },
                    },
                  },
                }}
              />
            </div>

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={resetCAT}
                className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 px-6 rounded-lg transition flex items-center gap-2"
              >
                <RotateCcw className="w-5 h-5" />
                New Session
              </button>
              <button
                onClick={() => handleExportResults('pdf')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                Export PDF
              </button>
              <button
                onClick={() => handleExportResults('csv')}
                className="bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                Export CSV
              </button>
              <button
                onClick={() => handleExportResults('json')}
                className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-6 rounded-lg transition flex items-center gap-2"
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Adaptive Testing</h1>
        <p className="text-gray-600 mt-1">Computer adaptive test (CAT) administration and simulation</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <button
          onClick={() => setView('itembank')}
          className="bg-white rounded-xl border-2 border-gray-200 p-8 hover:border-blue-500 hover:shadow-lg transition text-left"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Brain className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Item Bank</h2>
          <p className="text-gray-600 mb-4">
            Manage your IRT-calibrated item pool with discrimination, difficulty, and guessing parameters
          </p>
          <p className="text-sm text-blue-600 font-medium">{itemBank.length} items in bank →</p>
        </button>

        <button
          onClick={() => setView('simulation')}
          className="bg-white rounded-xl border-2 border-gray-200 p-8 hover:border-green-500 hover:shadow-lg transition text-left"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <Zap className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Run CAT</h2>
          <p className="text-gray-600 mb-4">
            Simulate adaptive testing with real-time ability estimation and stopping rules
          </p>
          <p className="text-sm text-green-600 font-medium">Start simulation →</p>
        </button>

        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border-2 border-purple-200 p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mb-4">
            <Target className="w-8 h-8 text-purple-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Features</h2>
          <ul className="text-sm text-gray-700 space-y-2">
            <li>• 3PL IRT model</li>
            <li>• Maximum Fisher Information</li>
            <li>• Real-time θ estimation</li>
            <li>• Flexible stopping rules</li>
            <li>• Export session results</li>
          </ul>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
              1
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Start with θ = 0</h3>
            <p className="text-sm text-gray-600">Begin with neutral ability estimate</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
              2
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Select Best Item</h3>
            <p className="text-sm text-gray-600">Use MFI to find optimal next item</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
              3
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Update Estimate</h3>
            <p className="text-sm text-gray-600">Re-estimate θ after each response</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
              4
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Check Stopping</h3>
            <p className="text-sm text-gray-600">Stop when SE threshold met</p>
          </div>
        </div>
      </div>
    </div>
  );
}
