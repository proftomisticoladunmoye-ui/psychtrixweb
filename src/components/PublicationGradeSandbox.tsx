import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  FlaskConical, Plus, Edit, Trash2, AlertCircle, CheckCircle, Play, Download,
  BarChart3, Share2, Link as LinkIcon, Copy, Users, TrendingUp, Target,
  MessageCircle, Mail, Info, Eye, Save, Sparkles, ArrowLeft, ExternalLink
} from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { exportResultsToPDF, exportToCSV, exportToJSON } from '../lib/exportUtils';
import {
  calculateCronbachAlpha,
  calculateItemTotalCorrelation,
  calculateCorrectedItemTotalCorrelation,
  calculateSplitHalfReliability,
  calculateInterItemCorrelationMatrix,
  calculateItemDifficulty,
  calculateItemDiscrimination,
  bootstrapConfidenceInterval,
  calculateZScore,
  calculateTScore,
  performEFA,
  calculateMcDonaldOmega,
  calculatePercentiles,
  generateShareableLink,
  getWhatsAppShareUrl,
  getEmailShareUrl,
  getFacebookShareUrl,
  getTwitterShareUrl
} from '../lib/scaleUtils';

interface ScaleItem {
  id: string;
  content: string;
  reversed: boolean;
  subscale?: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'collecting' | 'analyzed';
  items: ScaleItem[];
  subscales: string[];
  response_scale: {
    type: 'likert' | 'binary';
    min: number;
    max: number;
    labels: string[];
  };
  shareable_link?: string;
  responseCount?: number;
  reliability?: {
    alpha?: number;
    omega?: number;
  };
  last_modified: string;
  user_id: string;
}

interface ValidationResults {
  reliability: {
    cronbach_alpha: number;
    alpha_ci: [number, number];
    omega_total: number;
    split_half: number;
    sem: number;
  };
  subscaleReliability: Array<{ subscale: string; nItems: number; alpha: number }>;
  itemAnalysis: Array<{
    itemId: string;
    mean: number;
    sd: number;
    itemTotal: number;
    alpha_if_deleted: number;
  }>;
  descriptives: {
    n: number;
    mean: number;
    sd: number;
    min: number;
    max: number;
    floorPct: number;
    ceilingPct: number;
  };
  percentiles: { [key: number]: number };
}

export function EnhancedPsychometricsSandbox() {
  const [view, setView] = useState<'list' | 'create' | 'edit' | 'analyze' | 'share'>('list');
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [validationResults, setValidationResults] = useState<ValidationResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    responseType: 'likert' as 'likert' | 'binary',
    responseMin: 1,
    responseMax: 5,
    responseLabels: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'],
  });

  const [newItem, setNewItem] = useState({
    content: '',
    reversed: false,
    subscale: '',
  });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('sandbox_scale_projects')
        .select('*')
        .eq('user_id', user.id)
        .order('last_modified', { ascending: false });

      if (error) throw error;

      const projectsWithCounts = await Promise.all(
        (data || []).map(async (project) => {
          const { count } = await supabase
            .from('scale_responses')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', project.id);

          return { ...project, responseCount: count || 0 };
        })
      );

      setProjects(projectsWithCounts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!newProject.name) {
      setError('Project name is required');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const shareToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      const project = {
        user_id: user.id,
        name: newProject.name,
        description: newProject.description,
        items: [],
        subscales: [],
        response_scale: {
          type: newProject.responseType,
          min: newProject.responseMin,
          max: newProject.responseMax,
          labels: newProject.responseLabels,
        },
        status: 'draft',
        shareable_link: shareToken,
      };

      const { error } = await supabase.from('sandbox_scale_projects').insert(project);

      if (error) throw error;

      setSuccess('Project created successfully');
      setTimeout(() => setSuccess(''), 3000);
      setNewProject({
        name: '',
        description: '',
        responseType: 'likert',
        responseMin: 1,
        responseMax: 5,
        responseLabels: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'],
      });
      loadProjects();
      setView('list');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addItemToProject = () => {
    if (!currentProject || !newItem.content) {
      setError('Item content is required');
      return;
    }

    const item: ScaleItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2),
      content: newItem.content,
      reversed: newItem.reversed,
      subscale: newItem.subscale || undefined,
    };

    const updatedItems = [...currentProject.items, item];
    const updatedSubscales = newItem.subscale && !currentProject.subscales.includes(newItem.subscale)
      ? [...currentProject.subscales, newItem.subscale]
      : currentProject.subscales;

    setCurrentProject({
      ...currentProject,
      items: updatedItems,
      subscales: updatedSubscales,
    });

    setNewItem({ content: '', reversed: false, subscale: '' });
    setSuccess('Item added');
    setTimeout(() => setSuccess(''), 2000);
  };

  const removeItem = (itemId: string) => {
    if (!currentProject) return;
    setCurrentProject({
      ...currentProject,
      items: currentProject.items.filter(item => item.id !== itemId),
    });
  };

  const saveProject = async () => {
    if (!currentProject) return;

    try {
      const { error } = await supabase
        .from('sandbox_scale_projects')
        .update({
          name: currentProject.name,
          description: currentProject.description,
          items: currentProject.items,
          subscales: currentProject.subscales,
          response_scale: currentProject.response_scale,
          status: currentProject.status,
          reliability: currentProject.reliability,
          last_modified: new Date().toISOString(),
        })
        .eq('id', currentProject.id);

      if (error) throw error;

      setSuccess('Project saved successfully');
      setTimeout(() => setSuccess(''), 3000);
      loadProjects();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;

    try {
      const { error} = await supabase.from('sandbox_scale_projects').delete().eq('id', id);
      if (error) throw error;
      setSuccess('Project deleted');
      setTimeout(() => setSuccess(''), 3000);
      loadProjects();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const runValidationAnalysis = async () => {
    if (!currentProject || currentProject.items.length < 3) {
      setError('Need at least 3 items to run analysis');
      return;
    }

    setLoading(true);

    try {
      const { data: responses, error } = await supabase
        .from('scale_responses')
        .select('responses')
        .eq('project_id', currentProject.id)
        .eq('completed', true);

      if (error) throw error;

      if (!responses || responses.length < 10) {
        setError('Need at least 10 responses for reliable analysis');
        setLoading(false);
        return;
      }

      // Reverse-score flagged items BEFORE any statistics — analyzing raw
      // values silently corrupts reliability for scales with reversed items.
      const scaleMin = currentProject.response_scale?.min ?? 1;
      const scaleMax = currentProject.response_scale?.max ?? 5;
      const responseMatrix: number[][] = responses.map(r =>
        (r.responses as number[]).map((v, idx) =>
          currentProject.items[idx]?.reversed ? scaleMin + scaleMax - v : v
        )
      );

      const alpha = calculateCronbachAlpha(responseMatrix);
      // Real estimators (omega was previously alpha*1.05 and split-half was
      // literally Math.random()).
      const omega = calculateMcDonaldOmega(responseMatrix);
      const splitHalf = calculateSplitHalfReliability(responseMatrix);
      const ciResult = bootstrapConfidenceInterval(responseMatrix, 1000, 0.05);
      const alphaCI: [number, number] = [ciResult.lower, ciResult.upper];

      // Per-subscale alpha (subscales with at least 2 items)
      const subscaleReliability = (currentProject.subscales ?? [])
        .map(sub => {
          const idxs = currentProject.items
            .map((item, i) => (item.subscale === sub ? i : -1))
            .filter(i => i >= 0);
          if (idxs.length < 2) return null;
          const subMatrix = responseMatrix.map(r => idxs.map(i => r[i]));
          return { subscale: sub, nItems: idxs.length, alpha: calculateCronbachAlpha(subMatrix) };
        })
        .filter((s): s is { subscale: string; nItems: number; alpha: number } => s !== null);

      const numItems = currentProject.items.length;
      const totalScores = responseMatrix.map(r => r.reduce((sum, s) => sum + s, 0));
      const totalMean = totalScores.reduce((sum, s) => sum + s, 0) / totalScores.length;
      const totalVariance = totalScores.reduce((sum, s) => sum + Math.pow(s - totalMean, 2), 0) / Math.max(totalScores.length - 1, 1);
      const sem = Math.sqrt(totalVariance) * Math.sqrt(Math.max(0, 1 - alpha));

      // Floor/ceiling effects (Terwee et al., 2007: flag when > 15%)
      const minPossible = numItems * scaleMin;
      const maxPossible = numItems * scaleMax;
      const floorPct = (totalScores.filter(s => s === minPossible).length / totalScores.length) * 100;
      const ceilingPct = (totalScores.filter(s => s === maxPossible).length / totalScores.length) * 100;

      const itemAnalysis = currentProject.items.map((item, idx) => {
        const itemScores = responseMatrix.map(r => r[idx]);
        const mean = itemScores.reduce((sum, s) => sum + s, 0) / itemScores.length;
        const variance = itemScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / itemScores.length;
        const sd = Math.sqrt(variance);

        const itemTotal = calculateItemTotalCorrelation(responseMatrix, idx);

        const responsesWithout = responseMatrix.map(r => r.filter((_, i) => i !== idx));
        const alphaWithout = calculateCronbachAlpha(responsesWithout);

        return {
          itemId: item.id,
          mean,
          sd,
          itemTotal,
          alpha_if_deleted: alphaWithout,
        };
      });

      const totalSD = Math.sqrt(totalVariance);
      const totalMin = Math.min(...totalScores);
      const totalMax = Math.max(...totalScores);

      const percentiles = calculatePercentiles(totalScores);

      const results: ValidationResults = {
        reliability: {
          cronbach_alpha: alpha,
          alpha_ci: alphaCI,
          omega_total: omega,
          split_half: splitHalf,
          sem,
        },
        subscaleReliability,
        itemAnalysis,
        descriptives: {
          n: responses.length,
          mean: totalMean,
          sd: totalSD,
          min: totalMin,
          max: totalMax,
          floorPct,
          ceilingPct,
        },
        percentiles,
      };

      setValidationResults(results);
      setCurrentProject({
        ...currentProject,
        reliability: {
          alpha: results.reliability.cronbach_alpha,
          omega: results.reliability.omega_total,
        },
        status: 'analyzed',
      });

      setView('analyze');
      setSuccess('Analysis completed');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyShareLink = () => {
    if (!currentProject?.shareable_link) return;
    const link = generateShareableLink(window.location.origin, currentProject.shareable_link);
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const shareToWhatsApp = () => {
    if (!currentProject?.shareable_link) return;
    const link = generateShareableLink(window.location.origin, currentProject.shareable_link);
    const message = `Please complete this survey: ${currentProject.name}`;
    window.open(getWhatsAppShareUrl(message, link), '_blank');
  };

  const shareToEmail = () => {
    if (!currentProject?.shareable_link) return;
    const link = generateShareableLink(window.location.origin, currentProject.shareable_link);
    const subject = `Survey: ${currentProject.name}`;
    const body = `Please help by completing this survey:\n\n${currentProject.description}`;
    window.open(getEmailShareUrl(subject, body, link), '_blank');
  };

  const shareToFacebook = () => {
    if (!currentProject?.shareable_link) return;
    const link = generateShareableLink(window.location.origin, currentProject.shareable_link);
    window.open(getFacebookShareUrl(link), '_blank');
  };

  const shareToTwitter = () => {
    if (!currentProject?.shareable_link) return;
    const link = generateShareableLink(window.location.origin, currentProject.shareable_link);
    const text = `Help with research: ${currentProject.name}`;
    window.open(getTwitterShareUrl(text, link), '_blank');
  };

  const handleExport = (format: 'pdf' | 'csv' | 'json') => {
    if (!currentProject || !validationResults) return;

    const exportData = {
      project: currentProject,
      results: validationResults,
    };

    switch (format) {
      case 'pdf':
        exportResultsToPDF(exportData, `${currentProject.name}_Analysis`);
        break;
      case 'csv':
        exportToCSV(validationResults.itemAnalysis, `${currentProject.name}_ItemAnalysis`);
        break;
      case 'json':
        exportToJSON(exportData, `${currentProject.name}_Complete`);
        break;
    }
  };

  const generateItemSuggestions = () => {
    const constructs = ['confidence', 'satisfaction', 'motivation', 'well-being'];
    const construct = constructs[Math.floor(Math.random() * constructs.length)];
    
    return [
      `I feel confident about my ${construct}`,
      `${construct} is important to me`,
      `I am satisfied with my ${construct}`,
      `I actively work on improving my ${construct}`,
      `Others recognize my ${construct}`,
    ];
  };

  if (view === 'share' && currentProject) {
    const shareLink = currentProject.shareable_link 
      ? generateShareableLink(window.location.origin, currentProject.shareable_link)
      : '';

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Share Survey: {currentProject.name}</h3>
            <p className="text-gray-600 mt-1">Collect responses from participants</p>
          </div>
          <button
            onClick={() => setView('edit')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border-2 border-blue-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <Share2 className="w-10 h-10 text-blue-600" />
            <div>
              <h4 className="text-xl font-bold text-gray-900">Survey Link</h4>
              <p className="text-sm text-gray-600">Share this link to collect responses</p>
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-gray-300 mb-6">
            <div className="flex items-center gap-3">
              <LinkIcon className="w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={shareLink}
                readOnly
                className="flex-1 bg-transparent text-sm text-gray-700 outline-none"
              />
              <button
                onClick={copyShareLink}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm"
              >
                {copiedLink ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedLink ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={shareToWhatsApp}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
            >
              <MessageCircle className="w-5 h-5" />
              WhatsApp
            </button>
            <button
              onClick={shareToEmail}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
            >
              <Mail className="w-5 h-5" />
              Email
            </button>
            <button
              onClick={shareToFacebook}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition"
            >
              <ExternalLink className="w-5 h-5" />
              Facebook
            </button>
            <button
              onClick={shareToTwitter}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition"
            >
              <ExternalLink className="w-5 h-5" />
              Twitter
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <Users className="w-10 h-10 text-blue-600 mb-3" />
            <p className="text-sm text-gray-600 mb-1">Total Responses</p>
            <p className="text-3xl font-bold text-gray-900">{currentProject.responseCount || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <BarChart3 className="w-10 h-10 text-green-600 mb-3" />
            <p className="text-sm text-gray-600 mb-1">Items</p>
            <p className="text-3xl font-bold text-gray-900">{currentProject.items.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <Target className="w-10 h-10 text-purple-600 mb-3" />
            <p className="text-sm text-gray-600 mb-1">Status</p>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              currentProject.status === 'collecting' ? 'bg-green-100 text-green-800' :
              currentProject.status === 'analyzed' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {currentProject.status}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Sharing Tips</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>Share the link via WhatsApp groups for quick responses</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>Email to your contact list for targeted sampling</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>Post on social media for broader reach</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>Aim for at least 100 responses for reliable analysis</span>
            </li>
          </ul>
        </div>
      </div>
    );
  }

  if (view === 'analyze' && validationResults && currentProject) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Analysis: {currentProject.name}</h3>
            <p className="text-gray-600 mt-1">Psychometric validation results</p>
          </div>
          <button
            onClick={() => setView('edit')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
            <CheckCircle className="w-8 h-8 text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">Cronbach's α</p>
            <p className="text-3xl font-bold text-gray-900">{validationResults.reliability.cronbach_alpha.toFixed(3)}</p>
            <p className="text-xs text-gray-600 mt-1">
              95% CI [{validationResults.reliability.alpha_ci[0].toFixed(3)}, {validationResults.reliability.alpha_ci[1].toFixed(3)}] ·{' '}
              {validationResults.reliability.cronbach_alpha >= 0.9 ? 'Excellent' :
               validationResults.reliability.cronbach_alpha >= 0.8 ? 'Good' :
               validationResults.reliability.cronbach_alpha >= 0.7 ? 'Acceptable' : 'Questionable'}
            </p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
            <Target className="w-8 h-8 text-green-600 mb-2" />
            <p className="text-sm text-gray-600">McDonald's ω</p>
            <p className="text-3xl font-bold text-gray-900">{validationResults.reliability.omega_total.toFixed(3)}</p>
            <p className="text-xs text-gray-600 mt-1">Split-half: {validationResults.reliability.split_half.toFixed(3)}</p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
            <Users className="w-8 h-8 text-purple-600 mb-2" />
            <p className="text-sm text-gray-600">Sample Size</p>
            <p className="text-3xl font-bold text-gray-900">{validationResults.descriptives.n}</p>
            <p className="text-xs text-gray-600 mt-1">Responses</p>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
            <TrendingUp className="w-8 h-8 text-orange-600 mb-2" />
            <p className="text-sm text-gray-600">SEM</p>
            <p className="text-3xl font-bold text-gray-900">{validationResults.reliability.sem.toFixed(2)}</p>
            <p className="text-xs text-gray-600 mt-1">Measurement error</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Item Analysis</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-3 font-semibold text-gray-700">Item</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">Mean</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">SD</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">r<sub>it</sub></th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">α if deleted</th>
                </tr>
              </thead>
              <tbody>
                {validationResults.itemAnalysis.map((analysis, idx) => {
                  const item = currentProject.items.find(i => i.id === analysis.itemId);
                  return (
                    <tr key={analysis.itemId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-3 text-gray-900 max-w-xs truncate">
                        {idx + 1}. {item?.content}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-700">{analysis.mean.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{analysis.sd.toFixed(2)}</td>
                      <td className={`py-3 px-3 text-right font-medium ${
                        analysis.itemTotal >= 0.5 ? 'text-green-600' :
                        analysis.itemTotal >= 0.3 ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {analysis.itemTotal.toFixed(3)}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-700">{analysis.alpha_if_deleted.toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Descriptive Statistics</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded">
              <p className="text-sm text-gray-600 mb-1">Mean Score</p>
              <p className="text-2xl font-bold text-gray-900">{validationResults.descriptives.mean.toFixed(2)}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded">
              <p className="text-sm text-gray-600 mb-1">Standard Deviation</p>
              <p className="text-2xl font-bold text-gray-900">{validationResults.descriptives.sd.toFixed(2)}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded">
              <p className="text-sm text-gray-600 mb-1">Range</p>
              <p className="text-2xl font-bold text-gray-900">
                {validationResults.descriptives.min} - {validationResults.descriptives.max}
              </p>
            </div>
            <div className={`p-4 rounded ${validationResults.descriptives.floorPct > 15 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <p className="text-sm text-gray-600 mb-1">Floor Effect</p>
              <p className="text-2xl font-bold text-gray-900">{validationResults.descriptives.floorPct.toFixed(1)}%</p>
              <p className="text-xs text-gray-500">{validationResults.descriptives.floorPct > 15 ? '⚠ Above 15% threshold' : 'OK (≤15%, Terwee 2007)'}</p>
            </div>
            <div className={`p-4 rounded ${validationResults.descriptives.ceilingPct > 15 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <p className="text-sm text-gray-600 mb-1">Ceiling Effect</p>
              <p className="text-2xl font-bold text-gray-900">{validationResults.descriptives.ceilingPct.toFixed(1)}%</p>
              <p className="text-xs text-gray-500">{validationResults.descriptives.ceilingPct > 15 ? '⚠ Above 15% threshold' : 'OK (≤15%, Terwee 2007)'}</p>
            </div>
          </div>
        </div>

        {validationResults.subscaleReliability.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-4">Subscale Reliability</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-600">
                  <th className="py-2 pr-4">Subscale</th>
                  <th className="py-2 pr-4">Items</th>
                  <th className="py-2 pr-4">Cronbach's α</th>
                </tr>
              </thead>
              <tbody>
                {validationResults.subscaleReliability.map(s => (
                  <tr key={s.subscale} className="border-b">
                    <td className="py-2 pr-4 font-medium">{s.subscale}</td>
                    <td className="py-2 pr-4">{s.nItems}</td>
                    <td className="py-2 pr-4 font-mono">{s.alpha.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Percentile Norms</h4>
          <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
            {Object.entries(validationResults.percentiles).map(([percentile, score]) => (
              <div key={percentile} className="p-3 bg-blue-50 rounded text-center">
                <p className="text-xs text-gray-600 mb-1">{percentile}th</p>
                <p className="text-xl font-bold text-gray-900">{score.toFixed(1)}</p>
              </div>
            ))}
          </div>
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
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Export JSON
          </button>
        </div>
      </div>
    );
  }

  if (view === 'edit' && currentProject) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Edit: {currentProject.name}</h3>
            <p className="text-gray-600 mt-1">Build and refine your scale</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveProject}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={() => setView('list')}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
            >
              Back
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h4 className="text-lg font-bold text-gray-900 mb-4">Scale Items ({currentProject.items.length})</h4>

              {currentProject.items.length === 0 ? (
                <div className="p-12 border-2 border-dashed border-gray-300 rounded-lg text-center">
                  <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium mb-2">No items yet</p>
                  <p className="text-sm text-gray-500">Add your first scale item below</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {currentProject.items.map((item, idx) => (
                    <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded hover:bg-gray-100 transition">
                      <span className="text-sm font-medium text-gray-600 mt-1">{idx + 1}.</span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">{item.content}</p>
                        <div className="flex gap-2 mt-1">
                          {item.reversed && (
                            <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded">Reversed</span>
                          )}
                          {item.subscale && (
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">{item.subscale}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h4 className="text-lg font-bold text-gray-900 mb-4">Add New Item</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Item Content</label>
                  <textarea
                    value={newItem.content}
                    onChange={(e) => setNewItem({ ...newItem, content: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="e.g., I feel confident in my abilities"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Subscale</label>
                    <input
                      type="text"
                      value={newItem.subscale}
                      onChange={(e) => setNewItem({ ...newItem, subscale: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newItem.reversed}
                        onChange={(e) => setNewItem({ ...newItem, reversed: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Reversed item</span>
                    </label>
                  </div>
                </div>

                <button
                  onClick={addItemToProject}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add Item
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-gray-200 p-6">
              <h4 className="text-lg font-bold text-gray-900 mb-4">Project Info</h4>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-600">Items</p>
                  <p className="text-2xl font-bold text-gray-900">{currentProject.items.length}</p>
                </div>
                <div>
                  <p className="text-gray-600">Responses</p>
                  <p className="text-2xl font-bold text-gray-900">{currentProject.responseCount || 0}</p>
                </div>
                {currentProject.reliability?.alpha && (
                  <div>
                    <p className="text-gray-600">Reliability (α)</p>
                    <p className="text-2xl font-bold text-gray-900">{currentProject.reliability.alpha.toFixed(3)}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-600" />
                Suggestions
              </h4>
              <div className="space-y-2">
                {generateItemSuggestions().slice(0, 3).map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => setNewItem({ ...newItem, content: suggestion })}
                    className="w-full text-left text-xs p-2 bg-gray-50 hover:bg-gray-100 rounded transition border border-gray-200"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setView('share')}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-4 rounded-lg transition flex items-center justify-center gap-2"
            >
              <Share2 className="w-5 h-5" />
              Share & Collect Data
            </button>

            <button
              onClick={runValidationAnalysis}
              disabled={currentProject.items.length < 3 || loading || (currentProject.responseCount || 0) < 10}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-4 rounded-lg transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Run Analysis
                </>
              )}
            </button>

            {(currentProject.items.length < 3 || (currentProject.responseCount || 0) < 10) && (
              <p className="text-xs text-center text-gray-500">
                {currentProject.items.length < 3 
                  ? 'Need 3+ items' 
                  : 'Need 10+ responses for analysis'}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">Create New Scale</h3>
          <p className="text-gray-600 mt-1">Set up a new measurement scale project</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Scale Name *</label>
            <input
              type="text"
              value={newProject.name}
              onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Self-Confidence Scale"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={newProject.description}
              onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Brief description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Response Type</label>
            <select
              value={newProject.responseType}
              onChange={(e) => setNewProject({ ...newProject, responseType: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="likert">Likert Scale</option>
              <option value="binary">Yes/No</option>
            </select>
          </div>

          {newProject.responseType === 'likert' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Min Value</label>
                <input
                  type="number"
                  value={newProject.responseMin}
                  onChange={(e) => setNewProject({ ...newProject, responseMin: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Value</label>
                <input
                  type="number"
                  value={newProject.responseMax}
                  onChange={(e) => setNewProject({ ...newProject, responseMax: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={createProject}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition"
          >
            Create Scale
          </button>
          <button
            onClick={() => setView('list')}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Scale Development Sandbox</h1>
          <p className="text-gray-600 mt-1">Professional scale development with real-time data collection</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Scale
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

      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-gray-200 p-6">
        <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-600" />
          Professional Features
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p>Real-time data collection with shareable links</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p>WhatsApp, Email, Social media sharing</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p>Reliability analysis (α, ω, split-half)</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p>Item analysis with discrimination indices</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p>Normative data & percentiles</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p>Export to PDF, CSV, JSON</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16">
          <FlaskConical className="w-24 h-24 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Scales Yet</h3>
          <p className="text-gray-600 mb-6">Create your first scale development project</p>
          <button
            onClick={() => setView('create')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create First Scale
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-gray-900 mb-1">{project.name}</h4>
                  <p className="text-sm text-gray-600 line-clamp-2">{project.description}</p>
                </div>
                <button
                  onClick={() => deleteProject(project.id)}
                  className="text-red-600 hover:text-red-700 ml-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Items:</span>
                  <span className="font-medium text-gray-900">{project.items?.length || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Responses:</span>
                  <span className="font-medium text-gray-900">{project.responseCount || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Status:</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    project.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                    project.status === 'collecting' ? 'bg-green-100 text-green-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {project.status}
                  </span>
                </div>
                {project.reliability?.alpha && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Reliability (α):</span>
                    <span className="font-medium text-gray-900">{project.reliability.alpha.toFixed(3)}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCurrentProject(project);
                    setView('edit');
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition flex items-center justify-center gap-2 text-sm"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    setCurrentProject(project);
                    setView('share');
                  }}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg transition flex items-center justify-center gap-2 text-sm"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
