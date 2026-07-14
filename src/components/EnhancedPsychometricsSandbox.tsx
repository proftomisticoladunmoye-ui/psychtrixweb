import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FlaskConical, Plus, CreditCard as Edit, Trash2, AlertCircle, CheckCircle, Play, Download, BarChart3, Share2, Link as LinkIcon, Copy, Users, TrendingUp, Target, MessageCircle, Mail, Info, Eye, Save, Sparkles, ArrowLeft, ExternalLink, Activity, Layers } from 'lucide-react';
import { exportScaleSandboxResults, exportToCSV, exportToJSON } from '../lib/exportUtils';
import {
  calculateCronbachAlpha,
  calculateItemTotalCorrelation,
  calculateCorrectedItemTotalCorrelation,
  calculatePercentiles,
  calculateSplitHalfReliability,
  calculateMcDonaldOmega,
  calculateGuttmanLambda6,
  bootstrapConfidenceInterval,
  calculateItemDifficulty,
  calculateItemDiscrimination,
  calculateInterItemCorrelationMatrix,
  calculateAverageInterItemCorrelation,
  calculateKMO,
  calculateBartlett,
  performEFA,
  generateShareableLink,
  getWhatsAppShareUrl,
  getEmailShareUrl,
  getFacebookShareUrl,
  getTwitterShareUrl,
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
  reliability?: { alpha?: number; omega?: number };
  last_modified: string;
  user_id: string;
}

interface ValidationResults {
  reliability: {
    cronbach_alpha: number;
    alpha_ci?: { lower: number; upper: number; mean: number };
    omega_total: number;
    split_half: number;
    guttman_lambda6: number;
    sem: number;
    avg_inter_item_r: number;
  };
  itemAnalysis: Array<{
    itemId: string;
    mean: number;
    sd: number;
    itemTotal: number;
    correctedItemTotal: number;
    alpha_if_deleted: number;
    difficulty?: number;
    discrimination?: number;
  }>;
  descriptives: {
    n: number;
    mean: number;
    sd: number;
    min: number;
    max: number;
    skewness: number;
    kurtosis: number;
  };
  percentiles: { [key: number]: number };
  factorAnalysis?: {
    eigenvalues: number[];
    loadings: number[][];
    communalities: number[];
    varianceExplained: number[];
    rotatedLoadings?: number[][];
    kmo?: { overall: number; individual: number[] };
    bartlett?: { chisq: number; df: number; p: number };
  };
  interItemCorrelations?: number[][];
}

function alphaLabel(a: number) {
  if (a >= 0.9) return { text: 'Excellent', color: 'text-emerald-600' };
  if (a >= 0.8) return { text: 'Good', color: 'text-green-600' };
  if (a >= 0.7) return { text: 'Acceptable', color: 'text-yellow-600' };
  if (a >= 0.6) return { text: 'Questionable', color: 'text-orange-600' };
  return { text: 'Poor', color: 'text-red-600' };
}

function kmoLabel(k: number) {
  if (k >= 0.9) return { text: 'Marvelous', color: 'bg-emerald-100 text-emerald-800' };
  if (k >= 0.8) return { text: 'Meritorious', color: 'bg-green-100 text-green-800' };
  if (k >= 0.7) return { text: 'Middling', color: 'bg-yellow-100 text-yellow-800' };
  if (k >= 0.6) return { text: 'Mediocre', color: 'bg-orange-100 text-orange-800' };
  return { text: 'Unacceptable', color: 'bg-red-100 text-red-800' };
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

  const [newItem, setNewItem] = useState({ content: '', reversed: false, subscale: '' });

  useEffect(() => { loadProjects(); }, []);

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
    if (!newProject.name) { setError('Project name is required'); return; }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const shareToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const { error } = await supabase.from('sandbox_scale_projects').insert({
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
      });
      if (error) throw error;

      setSuccess('Project created successfully');
      setTimeout(() => setSuccess(''), 3000);
      setNewProject({ name: '', description: '', responseType: 'likert', responseMin: 1, responseMax: 5, responseLabels: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'] });
      loadProjects();
      setView('list');
    } catch (err: any) { setError(err.message); }
  };

  const addItemToProject = () => {
    if (!currentProject || !newItem.content) { setError('Item content is required'); return; }
    const item: ScaleItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2),
      content: newItem.content,
      reversed: newItem.reversed,
      subscale: newItem.subscale || undefined,
    };
    const updatedSubscales = newItem.subscale && !currentProject.subscales.includes(newItem.subscale)
      ? [...currentProject.subscales, newItem.subscale] : currentProject.subscales;
    setCurrentProject({ ...currentProject, items: [...currentProject.items, item], subscales: updatedSubscales });
    setNewItem({ content: '', reversed: false, subscale: '' });
    setSuccess('Item added'); setTimeout(() => setSuccess(''), 2000);
  };

  const removeItem = (itemId: string) => {
    if (!currentProject) return;
    setCurrentProject({ ...currentProject, items: currentProject.items.filter(i => i.id !== itemId) });
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
      setSuccess('Project saved'); setTimeout(() => setSuccess(''), 3000);
      loadProjects();
    } catch (err: any) { setError(err.message); }
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('sandbox_scale_projects').delete().eq('id', id);
      if (error) throw error;
      setSuccess('Project deleted'); setTimeout(() => setSuccess(''), 3000);
      loadProjects();
    } catch (err: any) { setError(err.message); }
  };

  const runValidationAnalysis = async () => {
    if (!currentProject || currentProject.items.length < 3) {
      setError('Need at least 3 items to run analysis'); return;
    }
    setLoading(true);
    try {
      const { data: rawResponses, error } = await supabase
        .from('scale_responses')
        .select('responses')
        .eq('project_id', currentProject.id)
        .eq('completed', true);

      if (error) throw error;
      if (!rawResponses || rawResponses.length < 10) {
        setError('Need at least 10 completed responses for reliable analysis');
        setLoading(false); return;
      }

      const numItems = currentProject.items.length;

      // Only include rows with the correct number of items (guards against jagged arrays)
      const responseMatrix: number[][] = rawResponses
        .map(r => r.responses as number[])
        .filter(row => Array.isArray(row) && row.length === numItems);

      if (responseMatrix.length < 10) {
        setError('Not enough valid responses (all items must be answered)');
        setLoading(false); return;
      }

      const n = responseMatrix.length;

      // --- Reliability ---
      const alpha = calculateCronbachAlpha(responseMatrix);
      const splitHalf = calculateSplitHalfReliability(responseMatrix);
      const lambda6 = calculateGuttmanLambda6(responseMatrix);
      const avgInterItemR = calculateAverageInterItemCorrelation(responseMatrix);

      // EFA for omega seeding
      const interItemCorrelations = calculateInterItemCorrelationMatrix(responseMatrix);
      const efaForOmega = performEFA(interItemCorrelations, 1);
      const omega = calculateMcDonaldOmega(responseMatrix, efaForOmega.loadings);

      // Bootstrap CI for alpha (n ≥ 30)
      const alphaCi = n >= 30 ? bootstrapConfidenceInterval(responseMatrix, 1000, 0.05) : undefined;

      // SEM with unbiased SD
      const totalScores = responseMatrix.map(r => r.reduce((s, v) => s + v, 0));
      const totalMean = totalScores.reduce((s, v) => s + v, 0) / n;
      const totalVar = totalScores.reduce((s, v) => s + (v - totalMean) ** 2, 0) / (n - 1);
      const totalSD = Math.sqrt(totalVar);
      const sem = totalSD * Math.sqrt(1 - alpha);

      // Skewness & kurtosis (Fisher-Pearson adjusted)
      const skewness = n > 2
        ? (n / ((n - 1) * (n - 2))) * totalScores.reduce((s, v) => s + ((v - totalMean) / (totalSD || 1)) ** 3, 0)
        : 0;
      const kurtosis = n > 3
        ? ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) *
          totalScores.reduce((s, v) => s + ((v - totalMean) / (totalSD || 1)) ** 4, 0) -
          (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
        : 0;

      // --- Item Analysis ---
      const maxScore = currentProject.response_scale.max;
      const itemAnalysis = currentProject.items.map((item, idx) => {
        const scores = responseMatrix.map(r => r[idx]);
        const mean = scores.reduce((s, v) => s + v, 0) / n;
        const sd = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));

        // Alpha-if-deleted — correct rectangular matrix
        const responsesWithout = responseMatrix.map(r => [...r.slice(0, idx), ...r.slice(idx + 1)]);
        return {
          itemId: item.id,
          mean,
          sd,
          itemTotal: calculateItemTotalCorrelation(responseMatrix, idx),
          correctedItemTotal: calculateCorrectedItemTotalCorrelation(responseMatrix, idx),
          alpha_if_deleted: calculateCronbachAlpha(responsesWithout),
          difficulty: calculateItemDifficulty(responseMatrix, idx, maxScore),
          discrimination: calculateItemDiscrimination(responseMatrix, idx),
        };
      });

      // --- EFA ---
      let factorAnalysis: ValidationResults['factorAnalysis'];
      if (numItems >= 3 && n >= 50) {
        const numFactors = Math.min(Math.max(1, Math.floor(numItems / 3)), 3);
        const efa = performEFA(interItemCorrelations, numFactors);
        const kmo = calculateKMO(interItemCorrelations);
        const bartlett = calculateBartlett(interItemCorrelations, n);
        factorAnalysis = { ...efa, kmo, bartlett };
      }

      const results: ValidationResults = {
        reliability: { cronbach_alpha: alpha, alpha_ci: alphaCi, omega_total: omega, split_half: splitHalf, guttman_lambda6: lambda6, sem, avg_inter_item_r: avgInterItemR },
        itemAnalysis,
        descriptives: { n, mean: totalMean, sd: totalSD, min: Math.min(...totalScores), max: Math.max(...totalScores), skewness, kurtosis },
        percentiles: calculatePercentiles(totalScores),
        interItemCorrelations,
        factorAnalysis,
      };

      setValidationResults(results);
      setCurrentProject({ ...currentProject, reliability: { alpha: results.reliability.cronbach_alpha, omega: results.reliability.omega_total }, status: 'analyzed' });
      setView('analyze');
      setSuccess('Analysis completed'); setTimeout(() => setSuccess(''), 3000);
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
    setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleExport = (format: 'html' | 'csv' | 'json') => {
    if (!currentProject || !validationResults) return;
    if (format === 'html') { exportScaleSandboxResults(currentProject, validationResults); return; }
    if (format === 'csv') {
      exportToCSV(
        validationResults.itemAnalysis.map((item, idx) => ({
          Item: idx + 1,
          Content: currentProject.items[idx]?.content || '',
          Mean: item.mean.toFixed(3),
          SD: item.sd.toFixed(3),
          r_it: item.itemTotal.toFixed(3),
          r_it_corrected: item.correctedItemTotal.toFixed(3),
          Difficulty: item.difficulty?.toFixed(3) || '',
          Discrimination: item.discrimination?.toFixed(3) || '',
          Alpha_if_Deleted: item.alpha_if_deleted.toFixed(3),
          Subscale: currentProject.items[idx]?.subscale || '',
          Reversed: currentProject.items[idx]?.reversed ? 'Yes' : 'No',
        })),
        `${currentProject.name}_ItemAnalysis`
      );
    }
    if (format === 'json') exportToJSON({ project: currentProject, results: validationResults }, `${currentProject.name}_Full`);
  };

  // ─── Share View ───────────────────────────────────────────────────────────
  if (view === 'share' && currentProject) {
    const shareLink = currentProject.shareable_link ? generateShareableLink(window.location.origin, currentProject.shareable_link) : '';
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Share Survey: {currentProject.name}</h3>
            <p className="text-gray-600 mt-1">Collect responses — no account required for participants</p>
          </div>
          <button onClick={() => setView('edit')} className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border-2 border-blue-200 p-8">
          <div className="flex items-center gap-3 mb-2">
            <Share2 className="w-10 h-10 text-blue-600" />
            <div>
              <h4 className="text-xl font-bold text-gray-900">Public Survey Link</h4>
              <p className="text-sm text-gray-600">Participants can respond without creating an account</p>
            </div>
          </div>
          <div className="mt-4 bg-white rounded-lg p-4 border border-gray-300 mb-6">
            <div className="flex items-center gap-3">
              <LinkIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <input type="text" value={shareLink} readOnly className="flex-1 bg-transparent text-sm text-gray-700 outline-none min-w-0" />
              <button onClick={copyShareLink} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm flex-shrink-0">
                {copiedLink ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedLink ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={() => window.open(getWhatsAppShareUrl(`Please complete this survey: ${currentProject.name}`, shareLink), '_blank')} className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition">
              <MessageCircle className="w-5 h-5" /> WhatsApp
            </button>
            <button onClick={() => window.open(getEmailShareUrl(`Survey: ${currentProject.name}`, currentProject.description || 'Please help with this survey.', shareLink), '_blank')} className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition">
              <Mail className="w-5 h-5" /> Email
            </button>
            <button onClick={() => window.open(getFacebookShareUrl(shareLink), '_blank')} className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition">
              <ExternalLink className="w-5 h-5" /> Facebook
            </button>
            <button onClick={() => window.open(getTwitterShareUrl(`Help with research: ${currentProject.name}`, shareLink), '_blank')} className="flex items-center justify-center gap-2 px-4 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition">
              <ExternalLink className="w-5 h-5" /> Twitter
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-4">
            <Users className="w-10 h-10 text-blue-600 flex-shrink-0" />
            <div><p className="text-sm text-gray-600">Responses</p><p className="text-3xl font-bold text-gray-900">{currentProject.responseCount || 0}</p></div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-4">
            <BarChart3 className="w-10 h-10 text-green-600 flex-shrink-0" />
            <div><p className="text-sm text-gray-600">Items</p><p className="text-3xl font-bold text-gray-900">{currentProject.items.length}</p></div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-4">
            <Target className="w-10 h-10 text-teal-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium ${currentProject.status === 'collecting' ? 'bg-green-100 text-green-800' : currentProject.status === 'analyzed' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                {currentProject.status}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Info className="w-4 h-4 text-blue-600" /> Data Collection Tips</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            {['Participants open the link on any device — no signup needed', 'Aim for at least 100 responses for robust psychometric analysis', 'Share across multiple channels for diverse, representative sampling', 'Responses are stored automatically and immediately available for analysis'].map((tip, i) => (
              <li key={i} className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />{tip}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // ─── Analysis View ────────────────────────────────────────────────────────
  if (view === 'analyze' && validationResults && currentProject) {
    const { reliability, descriptives, itemAnalysis, factorAnalysis, interItemCorrelations, percentiles } = validationResults;
    const aLabel = alphaLabel(reliability.cronbach_alpha);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Analysis: {currentProject.name}</h3>
            <p className="text-gray-600 mt-1">Psychometric validation results · n = {descriptives.n}</p>
          </div>
          <button onClick={() => setView('edit')} className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>

        {/* Reliability Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[
            {
              icon: <CheckCircle className="w-7 h-7 text-blue-600" />, bg: 'from-blue-50 to-blue-100 border-blue-200',
              label: "Cronbach's α", value: reliability.cronbach_alpha.toFixed(3),
              sub: reliability.alpha_ci
                ? <><span className={`font-semibold ${aLabel.color}`}>{aLabel.text}</span><br />95% CI [{reliability.alpha_ci.lower.toFixed(3)}, {reliability.alpha_ci.upper.toFixed(3)}]</>
                : <span className={`font-semibold ${aLabel.color}`}>{aLabel.text}</span>
            },
            { icon: <Target className="w-7 h-7 text-emerald-600" />, bg: 'from-emerald-50 to-emerald-100 border-emerald-200', label: "McDonald's ω", value: reliability.omega_total.toFixed(3), sub: 'Composite reliability' },
            { icon: <Layers className="w-7 h-7 text-cyan-600" />, bg: 'from-cyan-50 to-cyan-100 border-cyan-200', label: 'Split-Half', value: reliability.split_half.toFixed(3), sub: 'Spearman-Brown' },
            { icon: <BarChart3 className="w-7 h-7 text-teal-600" />, bg: 'from-teal-50 to-teal-100 border-teal-200', label: 'Guttman λ₆', value: reliability.guttman_lambda6.toFixed(3), sub: 'SMC-based' },
            { icon: <Activity className="w-7 h-7 text-orange-600" />, bg: 'from-orange-50 to-orange-100 border-orange-200', label: 'SEM', value: reliability.sem.toFixed(2), sub: 'Standard error of measurement' },
            { icon: <TrendingUp className="w-7 h-7 text-sky-600" />, bg: 'from-sky-50 to-sky-100 border-sky-200', label: 'Avg r̄ inter-item', value: reliability.avg_inter_item_r.toFixed(3), sub: 'Item intercorrelation' },
          ].map((card, i) => (
            <div key={i} className={`bg-gradient-to-br ${card.bg} rounded-xl p-5 border`}>
              {card.icon}
              <p className="text-xs text-gray-600 mt-2 font-medium">{card.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
              <p className="text-xs text-gray-600 mt-1 leading-snug">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Descriptive Statistics */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Descriptive Statistics</h4>
          <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
            {[
              { label: 'N', value: descriptives.n.toString() },
              { label: 'Mean', value: descriptives.mean.toFixed(2) },
              { label: 'SD', value: descriptives.sd.toFixed(2) },
              { label: 'Min', value: descriptives.min.toString() },
              { label: 'Max', value: descriptives.max.toString() },
              { label: 'Skewness', value: descriptives.skewness.toFixed(3) },
              { label: 'Ex. Kurtosis', value: descriptives.kurtosis.toFixed(3) },
            ].map((stat, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg text-center">
                <p className="text-xs text-gray-500 font-medium mb-1">{stat.label}</p>
                <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              </div>
            ))}
          </div>
          {(Math.abs(descriptives.skewness) > 1 || Math.abs(descriptives.kurtosis) > 2) && (
            <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">
              Note: Distribution shows notable non-normality (|skewness| &gt; 1 or |excess kurtosis| &gt; 2). Consider non-parametric reliability methods.
            </p>
          )}
        </div>

        {/* Item Analysis */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Comprehensive Item Analysis</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-3 font-semibold text-gray-700">Item</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">Mean</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">SD</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">r<sub>it</sub></th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">r<sub>it-c</sub></th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">Difficulty</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">Discrim.</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">α if del.</th>
                </tr>
              </thead>
              <tbody>
                {itemAnalysis.map((a, idx) => {
                  const item = currentProject.items.find(i => i.id === a.itemId);
                  return (
                    <tr key={a.itemId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-3 text-gray-900 max-w-xs">
                        <span className="font-medium text-gray-500 mr-1">{idx + 1}.</span>
                        <span className="text-sm">{item?.content}</span>
                        {item?.reversed && <span className="ml-2 text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">R</span>}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-700">{a.mean.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{a.sd.toFixed(2)}</td>
                      <td className={`py-3 px-3 text-right font-medium ${a.itemTotal >= 0.5 ? 'text-emerald-600' : a.itemTotal >= 0.3 ? 'text-blue-600' : 'text-red-600'}`}>{a.itemTotal.toFixed(3)}</td>
                      <td className={`py-3 px-3 text-right font-medium ${a.correctedItemTotal >= 0.5 ? 'text-emerald-600' : a.correctedItemTotal >= 0.3 ? 'text-blue-600' : 'text-red-600'}`}>{a.correctedItemTotal.toFixed(3)}</td>
                      <td className={`py-3 px-3 text-right ${a.difficulty !== undefined && a.difficulty >= 0.3 && a.difficulty <= 0.7 ? 'text-emerald-600' : 'text-amber-600'}`}>{a.difficulty?.toFixed(3) ?? '-'}</td>
                      <td className={`py-3 px-3 text-right ${a.discrimination !== undefined && a.discrimination >= 0.3 ? 'text-emerald-600' : 'text-amber-600'}`}>{a.discrimination?.toFixed(3) ?? '-'}</td>
                      <td className={`py-3 px-3 text-right ${a.alpha_if_deleted > reliability.cronbach_alpha ? 'text-red-600 font-medium' : 'text-gray-700'}`}>{a.alpha_if_deleted.toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-gray-600 grid grid-cols-1 md:grid-cols-2 gap-1">
            <div><span className="font-semibold">r<sub>it-c</sub> &gt; 0.3</span>: item discriminates well · &gt;0.5 excellent</div>
            <div><span className="font-semibold">Difficulty 0.3–0.7</span>: optimal range for Likert items</div>
            <div><span className="font-semibold">Discrimination &gt; 0.3</span>: good discriminating power</div>
            <div><span className="font-semibold text-red-600">α if deleted &gt; α</span>: item degrades reliability — review or remove</div>
          </div>
        </div>

        {/* Percentile Norms */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Percentile Norms</h4>
          <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
            {Object.entries(percentiles).map(([p, score]) => (
              <div key={p} className="p-3 bg-gray-50 rounded-lg text-center">
                <p className="text-xs text-gray-500 font-medium">{p}th</p>
                <p className="text-xl font-bold text-gray-900">{score.toFixed(1)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Factor Analysis */}
        {factorAnalysis && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-1">Exploratory Factor Analysis</h4>
            <p className="text-sm text-gray-500 mb-5">Principal Axis Factoring · Varimax rotation (when ≥ 2 factors)</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* KMO */}
              {factorAnalysis.kmo && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-semibold text-gray-700 mb-2">KMO Sampling Adequacy</p>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-bold text-gray-900">{factorAnalysis.kmo.overall.toFixed(3)}</span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${kmoLabel(factorAnalysis.kmo.overall).color}`}>
                      {kmoLabel(factorAnalysis.kmo.overall).text}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">≥ 0.8 meritorious · ≥ 0.6 mediocre · &lt; 0.6 unacceptable</p>
                </div>
              )}
              {/* Bartlett */}
              {factorAnalysis.bartlett && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Bartlett's Test of Sphericity</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-600">χ²</span><span className="font-semibold text-gray-900">{factorAnalysis.bartlett.chisq.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">df</span><span className="font-semibold text-gray-900">{factorAnalysis.bartlett.df}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">p-value</span>
                      <span className={`font-semibold ${factorAnalysis.bartlett.p < 0.05 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {factorAnalysis.bartlett.p < 0.001 ? '< .001' : factorAnalysis.bartlett.p.toFixed(3)}
                        {factorAnalysis.bartlett.p < 0.05 ? ' ✓' : ' ✗'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Eigenvalues */}
            <p className="text-sm font-semibold text-gray-700 mb-3">Eigenvalues (Kaiser criterion: &gt; 1.0)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {factorAnalysis.eigenvalues.map((ev, i) => (
                <div key={i} className={`p-3 rounded-lg border ${ev >= 1 ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">Factor {i + 1}</span>
                    {ev >= 1 && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 rounded font-semibold">Kaiser</span>}
                  </div>
                  <p className="text-xl font-bold text-gray-900">{ev.toFixed(3)}</p>
                  <p className="text-xs text-gray-500">{factorAnalysis.varianceExplained[i].toFixed(1)}% var.</p>
                </div>
              ))}
            </div>

            {/* Loadings tables */}
            <div className={`grid grid-cols-1 ${factorAnalysis.rotatedLoadings ? 'lg:grid-cols-2' : ''} gap-6`}>
              {[
                { title: 'Unrotated Loadings', data: factorAnalysis.loadings },
                ...(factorAnalysis.rotatedLoadings ? [{ title: 'Varimax-Rotated Loadings', data: factorAnalysis.rotatedLoadings }] : []),
              ].map(({ title, data }) => (
                <div key={title}>
                  <p className="text-sm font-semibold text-gray-700 mb-2">{title}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Item</th>
                          {data[0]?.map((_, fi) => <th key={fi} className="text-right py-2 px-3 font-medium text-gray-600">F{fi + 1}</th>)}
                          <th className="text-right py-2 px-3 font-medium text-gray-600">h²</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, ri) => {
                          const item = currentProject.items[ri];
                          return (
                            <tr key={ri} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-2 px-3 text-gray-700 max-w-[160px] truncate" title={item?.content}>{ri + 1}. {item?.content}</td>
                              {row.map((l, fi) => (
                                <td key={fi} className={`py-2 px-3 text-right font-mono font-medium ${Math.abs(l) >= 0.5 ? 'text-emerald-700' : Math.abs(l) >= 0.3 ? 'text-blue-600' : 'text-gray-400'}`}>{l.toFixed(3)}</td>
                              ))}
                              <td className="py-2 px-3 text-right text-gray-600">{factorAnalysis.communalities[ri].toFixed(3)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-500">Loading ≥ |0.5| strong (green) · ≥ |0.3| moderate (blue) · h² = communality</p>
          </div>
        )}

        {/* Inter-Item Correlation Matrix */}
        {interItemCorrelations && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-1">Inter-Item Correlation Matrix</h4>
            <p className="text-sm text-gray-500 mb-4">High correlations (&gt; 0.85) may indicate item redundancy.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 px-2 text-gray-500 text-left">Item</th>
                    {interItemCorrelations.map((_, i) => <th key={i} className="py-2 px-2 text-center text-gray-500">{i + 1}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {interItemCorrelations.map((row, ri) => (
                    <tr key={ri} className="border-b border-gray-100">
                      <td className="py-2 px-2 font-medium text-gray-600">{ri + 1}</td>
                      {row.map((r, ci) => (
                        <td key={ci} className={`py-2 px-2 text-center ${ri === ci ? 'bg-gray-100 text-gray-400' : Math.abs(r) >= 0.7 ? 'bg-emerald-100 text-emerald-800 font-medium' : Math.abs(r) >= 0.5 ? 'bg-blue-50 text-blue-700' : Math.abs(r) >= 0.3 ? 'text-gray-700' : 'text-gray-400'}`}>
                          {ri === ci ? '—' : r.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Export Buttons */}
        <div className="flex flex-wrap gap-3">
          <button onClick={() => handleExport('html')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm">
            <Download className="w-4 h-4" /> Export HTML Report
          </button>
          <button onClick={() => handleExport('csv')} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => handleExport('json')} className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition text-sm">
            <Download className="w-4 h-4" /> Export JSON
          </button>
        </div>
      </div>
    );
  }

  // ─── Edit View ────────────────────────────────────────────────────────────
  if (view === 'edit' && currentProject) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Edit: {currentProject.name}</h3>
            <p className="text-gray-600 mt-1">Build and refine your scale</p>
          </div>
          <div className="flex gap-2">
            <button onClick={saveProject} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition">
              <Save className="w-4 h-4" /> Save
            </button>
            <button onClick={() => setView('list')} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition">Back</button>
          </div>
        </div>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3"><AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" /><p className="text-sm text-red-800">{error}</p></div>}
        {success && <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /><p className="text-sm text-green-800">{success}</p></div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h4 className="text-lg font-bold text-gray-900 mb-4">Scale Items ({currentProject.items.length})</h4>
              {currentProject.items.length === 0 ? (
                <div className="p-12 border-2 border-dashed border-gray-300 rounded-lg text-center">
                  <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium mb-1">No items yet</p>
                  <p className="text-sm text-gray-500">Add your first scale item below</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {currentProject.items.map((item, idx) => (
                    <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded hover:bg-gray-100 transition">
                      <span className="text-sm font-medium text-gray-500 mt-0.5">{idx + 1}.</span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">{item.content}</p>
                        <div className="flex gap-2 mt-1">
                          {item.reversed && <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded">Reversed</span>}
                          {item.subscale && <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">{item.subscale}</span>}
                        </div>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h4 className="text-lg font-bold text-gray-900 mb-4">Add New Item</h4>
              <div className="space-y-4">
                <textarea value={newItem.content} onChange={e => setNewItem({ ...newItem, content: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" rows={3} placeholder="e.g., I feel confident in my abilities" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subscale</label>
                    <input type="text" value={newItem.subscale} onChange={e => setNewItem({ ...newItem, subscale: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" placeholder="Optional" />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={newItem.reversed} onChange={e => setNewItem({ ...newItem, reversed: e.target.checked })} className="rounded" />
                      <span className="text-sm text-gray-700">Reversed item</span>
                    </label>
                  </div>
                </div>
                <button onClick={addItemToProject} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2">
                  <Plus className="w-5 h-5" /> Add Item
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-gray-200 p-5">
              <h4 className="text-base font-bold text-gray-900 mb-3">Project Stats</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Items</span><span className="font-bold text-gray-900">{currentProject.items.length}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Responses</span><span className="font-bold text-gray-900">{currentProject.responseCount || 0}</span></div>
                {currentProject.reliability?.alpha && <div className="flex justify-between"><span className="text-gray-600">Reliability α</span><span className="font-bold text-gray-900">{currentProject.reliability.alpha.toFixed(3)}</span></div>}
              </div>
            </div>

            <button onClick={() => setView('share')} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2">
              <Share2 className="w-5 h-5" /> Share & Collect Data
            </button>

            <button
              onClick={runValidationAnalysis}
              disabled={currentProject.items.length < 3 || loading || (currentProject.responseCount || 0) < 10}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
              {loading ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing...</> : <><Play className="w-5 h-5" />Run Analysis</>}
            </button>
            {(currentProject.items.length < 3 || (currentProject.responseCount || 0) < 10) && (
              <p className="text-xs text-center text-gray-500">{currentProject.items.length < 3 ? 'Need ≥ 3 items' : 'Need ≥ 10 responses'}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Create View ──────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">Create New Scale</h3>
          <p className="text-gray-600 mt-1">Set up a new measurement scale project</p>
        </div>
        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3"><AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" /><p className="text-sm text-red-800">{error}</p></div>}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Scale Name *</label>
            <input type="text" value={newProject.name} onChange={e => setNewProject({ ...newProject, name: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="e.g., Self-Confidence Scale" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea value={newProject.description} onChange={e => setNewProject({ ...newProject, description: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" rows={3} placeholder="Brief description..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Response Type</label>
            <select value={newProject.responseType} onChange={e => setNewProject({ ...newProject, responseType: e.target.value as any })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="likert">Likert Scale</option>
              <option value="binary">Yes / No</option>
            </select>
          </div>
          {newProject.responseType === 'likert' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Min Value</label>
                <input type="number" value={newProject.responseMin} onChange={e => setNewProject({ ...newProject, responseMin: parseInt(e.target.value) })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Value</label>
                <input type="number" value={newProject.responseMax} onChange={e => setNewProject({ ...newProject, responseMax: parseInt(e.target.value) })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={createProject} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition">Create Scale</button>
          <button onClick={() => setView('list')} className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition">Cancel</button>
        </div>
      </div>
    );
  }

  // ─── List View ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Scale Development Sandbox</h1>
          <p className="text-gray-600 mt-1">Professional scale development with real-time data collection</p>
        </div>
        <button onClick={() => setView('create')} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition flex items-center gap-2">
          <Plus className="w-5 h-5" /> New Scale
        </button>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3"><AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" /><p className="text-sm text-red-800">{error}</p></div>}
      {success && <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /><p className="text-sm text-green-800">{success}</p></div>}

      <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-gray-200 p-6">
        <h4 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2"><Info className="w-5 h-5 text-blue-600" />Professional Features</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-700">
          {['Real-time data collection via public link — no participant signup', 'α, ω, λ₆, split-half, SEM, avg inter-item r reliability suite', 'Item analysis with difficulty, discrimination, α-if-deleted', 'EFA with KMO, Bartlett, eigenvalues, varimax-rotated loadings', 'Normative data & percentile norms (type-7 interpolation)', 'Export to HTML report, CSV item analysis, or full JSON'].map((f, i) => (
            <div key={i} className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" /><span>{f}</span></div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16">
          <FlaskConical className="w-24 h-24 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Scales Yet</h3>
          <p className="text-gray-600 mb-6">Create your first scale development project</p>
          <button onClick={() => setView('create')} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition inline-flex items-center gap-2">
            <Plus className="w-5 h-5" /> Create First Scale
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(project => (
            <div key={project.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-gray-900 mb-1">{project.name}</h4>
                  <p className="text-sm text-gray-500 line-clamp-2">{project.description}</p>
                </div>
                <button onClick={() => deleteProject(project.id)} className="text-red-400 hover:text-red-600 ml-2"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="space-y-1.5 mb-4 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Items</span><span className="font-semibold text-gray-900">{project.items?.length || 0}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Responses</span><span className="font-semibold text-gray-900">{project.responseCount || 0}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Status</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${project.status === 'draft' ? 'bg-gray-100 text-gray-700' : project.status === 'collecting' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{project.status}</span>
                </div>
                {project.reliability?.alpha && (
                  <div className="flex justify-between"><span className="text-gray-500">Reliability α</span><span className="font-semibold text-gray-900">{project.reliability.alpha.toFixed(3)}</span></div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setCurrentProject(project); setView('edit'); }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition flex items-center justify-center gap-1.5 text-sm">
                  <Edit className="w-4 h-4" /> Edit
                </button>
                <button onClick={() => { setCurrentProject(project); setView('share'); }} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 rounded-lg transition flex items-center justify-center gap-1.5 text-sm">
                  <Share2 className="w-4 h-4" /> Share
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
