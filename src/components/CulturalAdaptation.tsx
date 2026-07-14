import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Globe, Languages, Users, BarChart, Plus, Play, Download, AlertCircle, CheckCircle, Trash2, CreditCard as Edit, TrendingUp, Award, Activity, Info, Eye, ChevronDown, ChevronUp, FileText, Share2, Target, Zap, ArrowLeft, Upload } from 'lucide-react';
import { Bar, Line, Scatter } from 'react-chartjs-2';
import { exportResultsToPDF, exportToCSV, exportToJSON, exportCulturalAdaptationToWord, exportCulturalAdaptationToHTML } from '../lib/exportUtils';
import {
  GroupData,
  DIFResult,
  InvarianceResult,
  performDIFAnalysis,
  testInvarianceSequence,
  performEquivalenceTest,
  calculateCohensD,
  performAlignmentOptimization,
  detectPartialInvariance,
  PartialInvarianceResult,
  calculateDIFPower,
  calculateInvariancePower,
  PowerAnalysisResult,
  runDataQualityChecks,
  DataQualityReport,
  generateSPSSSyntax,
  generateRScript
} from '../lib/culturalUtils';
import { DataImportModal } from './DataImportModal';

interface CulturalGroup {
  id: string;
  name: string;
  language: string;
  sample_size: number;
  reliability?: number;
  mean_score?: number;
  sd_score?: number;
  status: 'active' | 'pending' | 'completed';
  dataset_id: string;
  user_id: string;
  created_at: string;
}

interface TranslationItem {
  id: string;
  original_text: string;
  target_language: string;
  forward_translation: string;
  back_translation: string;
  discrepancies: string;
  resolution: string;
  status: 'pending' | 'in_progress' | 'completed';
  translator_name?: string;
  reviewer_name?: string;
}

const COMMON_LANGUAGES = [
  'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian',
  'Chinese (Simplified)', 'Chinese (Traditional)', 'Japanese', 'Korean',
  'Arabic', 'Hindi', 'Bengali', 'Urdu', 'Indonesian', 'Vietnamese',
  'Turkish', 'Polish', 'Dutch', 'Thai', 'Swahili', 'Hebrew', 'Greek'
];

export function CulturalAdaptation() {
  const [view, setView] = useState<'dashboard' | 'groups' | 'dif' | 'invariance' | 'translation' | 'alignment' | 'partial' | 'power'>('dashboard');
  const [groups, setGroups] = useState<CulturalGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<{focal?: string; reference?: string}>({});
  const [difResults, setDIFResults] = useState<DIFResult[]>([]);
  const [invarianceResults, setInvarianceResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedGroupForImport, setSelectedGroupForImport] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [alignmentResults, setAlignmentResults] = useState<any>(null);
  const [partialInvarianceResults, setPartialInvarianceResults] = useState<PartialInvarianceResult | null>(null);
  const [powerAnalysisResults, setPowerAnalysisResults] = useState<PowerAnalysisResult | null>(null);
  const [dataQualityReport, setDataQualityReport] = useState<DataQualityReport | null>(null);

  const [translationItems, setTranslationItems] = useState<TranslationItem[]>([]);
  const [newTranslation, setNewTranslation] = useState({
    originalText: '',
    targetLanguage: 'Spanish',
  });

  const [newGroup, setNewGroup] = useState({
    name: '',
    language: '',
    sampleSize: 50,
  });

  useEffect(() => {
    loadGroups();
    loadCurrentUser();
    if (view === 'translation') {
      loadTranslationItems();
    }
  }, [view]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const loadGroups = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('cultural_groups')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGroups(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTranslationItems = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('translation_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTranslationItems(data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadGroupResponses = async (groupId: string): Promise<number[][]> => {
    try {
      const { data, error } = await supabase
        .from('cultural_responses')
        .select('item_responses')
        .eq('group_id', groupId);

      if (error) throw error;

      if (!data || data.length === 0) {
        return [];
      }

      const responses: number[][] = data.map(row => {
        const itemResponses = row.item_responses as Record<string, number>;
        return Object.keys(itemResponses)
          .sort()
          .map(key => itemResponses[key]);
      });

      return responses;
    } catch (err: any) {
      console.error('Error loading group responses:', err);
      return [];
    }
  };

  const createGroup = async () => {
    if (!newGroup.name || !newGroup.language) {
      setError('Error: Both group name and language are required fields. Please fill in both before creating a group.');
      setTimeout(() => setError(''), 5000);
      return;
    }

    if (newGroup.sampleSize <= 0) {
      setError('Error: Sample size must be a positive number greater than 0.');
      setTimeout(() => setError(''), 5000);
      return;
    }

    if (newGroup.sampleSize < 30) {
      if (!confirm(`⚠️ Small Sample Size Warning\n\nSample size: ${newGroup.sampleSize}\nMinimum recommended: 30\nIdeal for DIF: 200+\nIdeal for invariance: 300+\n\nSmall samples may result in:\n• Low statistical power\n• Unreliable parameter estimates\n• Inflated Type I error rates\n• Poor model fit indices\n\nWould you like to continue anyway?`)) {
        return;
      }
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: datasets } = await supabase
        .from('datasets')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      const datasetId = datasets?.[0]?.id || '00000000-0000-0000-0000-000000000000';

      const { error } = await supabase.from('cultural_groups').insert({
        user_id: user.id,
        dataset_id: datasetId,
        name: newGroup.name,
        language: newGroup.language,
        sample_size: newGroup.sampleSize || 50,
        status: 'pending',
      });

      if (error) throw error;

      setSuccess('Cultural group created successfully');
      setTimeout(() => setSuccess(''), 3000);
      setNewGroup({ name: '', language: '', sampleSize: 50 });
      loadGroups();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('Delete this cultural group?')) return;

    try {
      const { error } = await supabase.from('cultural_groups').delete().eq('id', id);
      if (error) throw error;
      setSuccess('Group deleted');
      setTimeout(() => setSuccess(''), 3000);
      loadGroups();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const runDIFAnalysis = async () => {
    if (!selectedGroups.focal || !selectedGroups.reference) {
      setError('Error: Please select both focal and reference groups before running DIF analysis.');
      setTimeout(() => setError(''), 5000);
      return;
    }

    const focalGroup = groups.find(g => g.id === selectedGroups.focal);
    const refGroup = groups.find(g => g.id === selectedGroups.reference);

    if (!focalGroup || !refGroup) {
      setError('Error: One or both selected groups could not be found. Please refresh and try again.');
      setTimeout(() => setError(''), 5000);
      return;
    }

    if (focalGroup.sample_size < 30 || refGroup.sample_size < 30) {
      if (!confirm(`⚠️ Insufficient Sample Size for DIF Analysis\n\nFocal group: ${focalGroup.sample_size}\nReference group: ${refGroup.sample_size}\nMinimum: 30 per group\nRecommended: 200+ per group\n\nInsufficient samples may result in:\n• Very low power to detect DIF\n• Unstable parameter estimates\n• High false positive rates\n• Unreliable effect size estimates\n\nContinue with limited power?`)) {
        return;
      }
    }

    setLoading(true);
    try {
      const focalGroup = groups.find(g => g.id === selectedGroups.focal);
      const refGroup = groups.find(g => g.id === selectedGroups.reference);

      if (!focalGroup || !refGroup) {
        throw new Error('Selected groups not found');
      }

      const focalResponses = await loadGroupResponses(focalGroup.id);
      const refResponses = await loadGroupResponses(refGroup.id);

      if (focalResponses.length === 0 || refResponses.length === 0) {
        setError('No response data found. Please import response data for both groups first.');
        return;
      }

      const focalData: GroupData = {
        id: focalGroup.id,
        name: focalGroup.name,
        language: focalGroup.language,
        responses: focalResponses,
        sampleSize: focalResponses.length,
      };

      const refData: GroupData = {
        id: refGroup.id,
        name: refGroup.name,
        language: refGroup.language,
        responses: refResponses,
        sampleSize: refResponses.length,
      };

      const numItems = focalResponses[0]?.length || 0;
      const itemNames = Array.from({ length: numItems }, (_, i) => `Item ${i + 1}`);
      const results = performDIFAnalysis(focalData, refData, itemNames, 'all');

      setDIFResults(results);
      setView('dif');
      setSuccess('DIF analysis completed successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runInvarianceTest = async () => {
    if (!selectedGroups.focal || !selectedGroups.reference) {
      setError('Please select both groups for invariance testing');
      return;
    }

    const group1 = groups.find(g => g.id === selectedGroups.focal);
    const group2 = groups.find(g => g.id === selectedGroups.reference);

    if (!group1 || !group2) {
      setError('Selected groups not found');
      return;
    }

    if (group1.sample_size < 30 || group2.sample_size < 30) {
      if (!confirm(`⚠️ Critical Sample Size Issue\n\nGroup 1: ${group1.sample_size}\nGroup 2: ${group2.sample_size}\nMinimum: 30 per group\nRecommended: 200+ per group\nIdeal: 300-500+ per group\n\nMeasurement invariance testing requires large samples for:\n• Stable model convergence\n• Accurate fit index estimation\n• Reliable ΔCFI/ΔRMSEA values\n• Adequate statistical power\n\nResults with small samples may be meaningless. Continue?`)) {
        return;
      }
    }

    setLoading(true);
    try {
      const group1 = groups.find(g => g.id === selectedGroups.focal);
      const group2 = groups.find(g => g.id === selectedGroups.reference);

      if (!group1 || !group2) {
        throw new Error('Selected groups not found');
      }

      const group1Responses = await loadGroupResponses(group1.id);
      const group2Responses = await loadGroupResponses(group2.id);

      if (group1Responses.length === 0 || group2Responses.length === 0) {
        setError('No response data found. Please import response data for both groups first.');
        return;
      }

      const group1Data: GroupData = {
        id: group1.id,
        name: group1.name,
        language: group1.language,
        responses: group1Responses,
        sampleSize: group1Responses.length,
      };

      const group2Data: GroupData = {
        id: group2.id,
        name: group2.name,
        language: group2.language,
        responses: group2Responses,
        sampleSize: group2Responses.length,
      };

      const results = testInvarianceSequence(group1Data, group2Data);

      const totalScores1 = group1Data.responses.map(r => r.reduce((sum, val) => sum + val, 0));
      const totalScores2 = group2Data.responses.map(r => r.reduce((sum, val) => sum + val, 0));
      const equivalence = performEquivalenceTest(totalScores1, totalScores2, 0.5);

      setInvarianceResults({ ...results, equivalence, group1: group1.name, group2: group2.name });
      setView('invariance');
      setSuccess('Measurement invariance test completed');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateMockResponses = (n: number, numItems: number): number[][] => {
    return Array.from({ length: n }, () =>
      Array.from({ length: numItems }, () => Math.floor(Math.random() * 2))
    );
  };

  const runAlignmentOptimization = async () => {
    if (!selectedGroups.focal || !selectedGroups.reference) {
      setError('Please select both groups for alignment optimization');
      return;
    }

    setLoading(true);
    try {
      const group1 = groups.find(g => g.id === selectedGroups.focal);
      const group2 = groups.find(g => g.id === selectedGroups.reference);

      if (!group1 || !group2) {
        throw new Error('Selected groups not found');
      }

      const group1Responses = await loadGroupResponses(group1.id);
      const group2Responses = await loadGroupResponses(group2.id);

      if (group1Responses.length === 0 || group2Responses.length === 0) {
        setError('No response data found. Please import response data for both groups first.');
        return;
      }

      const group1Data: GroupData = {
        id: group1.id,
        name: group1.name,
        language: group1.language,
        responses: group1Responses,
        sampleSize: group1Responses.length,
      };

      const group2Data: GroupData = {
        id: group2.id,
        name: group2.name,
        language: group2.language,
        responses: group2Responses,
        sampleSize: group2Responses.length,
      };

      const results = performAlignmentOptimization(group1Data, group2Data);
      setAlignmentResults({ ...results, group1: group1.name, group2: group2.name });
      setView('alignment');
      setSuccess('Alignment optimization completed');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runPartialInvarianceTest = async () => {
    if (!selectedGroups.focal || !selectedGroups.reference) {
      setError('Please select both groups for partial invariance testing');
      return;
    }

    setLoading(true);
    try {
      const group1 = groups.find(g => g.id === selectedGroups.focal);
      const group2 = groups.find(g => g.id === selectedGroups.reference);

      if (!group1 || !group2) {
        throw new Error('Selected groups not found');
      }

      const group1Responses = await loadGroupResponses(group1.id);
      const group2Responses = await loadGroupResponses(group2.id);

      if (group1Responses.length === 0 || group2Responses.length === 0) {
        setError('No response data found. Please import response data for both groups first.');
        return;
      }

      const group1Data: GroupData = {
        id: group1.id,
        name: group1.name,
        language: group1.language,
        responses: group1Responses,
        sampleSize: group1Responses.length,
      };

      const group2Data: GroupData = {
        id: group2.id,
        name: group2.name,
        language: group2.language,
        responses: group2Responses,
        sampleSize: group2Responses.length,
      };

      const numItems = group1Responses[0]?.length || 0;
      const itemNames = Array.from({ length: numItems }, (_, i) => `Item ${i + 1}`);

      const results = detectPartialInvariance(group1Data, group2Data, itemNames);
      setPartialInvarianceResults(results);
      setView('partial');
      setSuccess('Partial invariance analysis completed');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runPowerAnalysis = (analysisType: 'dif' | 'invariance') => {
    if (!selectedGroups.focal || !selectedGroups.reference) {
      setError('Please select both groups for power analysis');
      return;
    }

    const group1 = groups.find(g => g.id === selectedGroups.focal);
    const group2 = groups.find(g => g.id === selectedGroups.reference);

    if (!group1 || !group2) {
      setError('Selected groups not found');
      return;
    }

    const avgSampleSize = Math.round((group1.sample_size + group2.sample_size) / 2);

    let results: PowerAnalysisResult;
    if (analysisType === 'dif') {
      results = calculateDIFPower(avgSampleSize, 0.35);
    } else {
      results = calculateInvariancePower(avgSampleSize, 10);
    }

    setPowerAnalysisResults(results);
    setView('power');
  };

  const runDataQualityCheck = async (groupId: string) => {
    setLoading(true);
    try {
      const responses = await loadGroupResponses(groupId);
      if (responses.length === 0) {
        setError('No response data found for this group. Please import data first.');
        return;
      }

      const report = runDataQualityChecks(responses);
      setDataQualityReport(report);
      setSuccess('Data quality check completed');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportSyntax = (type: 'spss' | 'r', analysis: 'dif' | 'invariance') => {
    if (!selectedGroups.focal || !selectedGroups.reference) {
      setError('Please select both focal and reference groups first');
      return;
    }

    const focalGroup = groups.find(g => g.id === selectedGroups.focal);
    const refGroup = groups.find(g => g.id === selectedGroups.reference);

    if (!focalGroup || !refGroup) {
      setError('Selected groups not found');
      return;
    }

    const numItems = 10;
    const itemNames = Array.from({ length: numItems }, (_, i) => `Item_${i + 1}`);

    let syntax = '';
    if (type === 'spss') {
      syntax = generateSPSSSyntax(analysis, { focal: focalGroup.name, reference: refGroup.name }, itemNames);
    } else {
      syntax = generateRScript(analysis, { focal: focalGroup.name, reference: refGroup.name }, itemNames);
    }

    const blob = new Blob([syntax], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${analysis}_${type}_syntax.${type === 'spss' ? 'sps' : 'R'}`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);

    setSuccess(`${type.toUpperCase()} syntax exported successfully`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleExport = (format: 'pdf' | 'csv' | 'json', data: any, filename: string) => {
    switch (format) {
      case 'pdf':
        exportResultsToPDF(data, filename);
        break;
      case 'csv':
        exportToCSV(data, filename);
        break;
      case 'json':
        exportToJSON(data, filename);
        break;
    }
  };

  const exportChartAsPNG = (chartId: string, filename: string) => {
    const canvas = document.querySelector(`#${chartId} canvas`) as HTMLCanvasElement;
    if (!canvas) return;

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
  };

  const handleCulturalExport = (format: 'word' | 'html') => {
    if (format === 'word') {
      exportCulturalAdaptationToWord(
        'Cultural Adaptation Study',
        difResults,
        invarianceResults,
        {
          focalGroup: groups.find(g => g.id === selectedGroups.focal),
          referenceGroup: groups.find(g => g.id === selectedGroups.reference)
        }
      );
    } else {
      exportCulturalAdaptationToHTML(
        'Cultural Adaptation Study',
        difResults,
        invarianceResults,
        {
          focalGroup: groups.find(g => g.id === selectedGroups.focal),
          referenceGroup: groups.find(g => g.id === selectedGroups.reference)
        }
      );
    }
  };

  const addTranslationItem = async () => {
    if (!newTranslation.originalText.trim()) {
      setError('Please enter text to translate');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('translation_items').insert({
        user_id: user.id,
        original_text: newTranslation.originalText,
        target_language: newTranslation.targetLanguage,
        status: 'pending',
      });

      if (error) throw error;

      setNewTranslation({ originalText: '', targetLanguage: 'Spanish' });
      setSuccess('Translation item added');
      setTimeout(() => setSuccess(''), 3000);
      loadTranslationItems();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateTranslationItem = async (id: string, updates: Partial<TranslationItem>) => {
    try {
      const { error } = await supabase
        .from('translation_items')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setTranslationItems(translationItems.map(item =>
        item.id === id ? { ...item, ...updates } : item
      ));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteTranslationItem = async (id: string) => {
    if (!confirm('Delete this translation item?')) return;

    try {
      const { error } = await supabase
        .from('translation_items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setSuccess('Translation item deleted');
      setTimeout(() => setSuccess(''), 3000);
      loadTranslationItems();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const exportTranslationReport = () => {
    const report = {
      title: 'Translation and Back-Translation Report',
      date: new Date().toISOString(),
      totalItems: translationItems.length,
      completedItems: translationItems.filter(i => i.status === 'completed').length,
      items: translationItems.map(item => ({
        originalText: item.original_text,
        targetLanguage: item.target_language,
        forwardTranslation: item.forward_translation,
        backTranslation: item.back_translation,
        discrepancies: item.discrepancies,
        resolution: item.resolution,
        status: item.status,
        translator: item.translator_name,
        reviewer: item.reviewer_name,
      })),
    };

    exportToJSON(report, 'Translation_Back_Translation_Report');
  };

  const generateAPATable = (type: 'dif' | 'invariance') => {
    let html = '<html><head><meta charset="utf-8"><title>APA Table</title><style>';
    html += 'body { font-family: "Times New Roman", serif; font-size: 12pt; margin: 40px; }';
    html += 'table { border-collapse: collapse; width: 100%; margin: 20px 0; }';
    html += 'th, td { padding: 8px 12px; text-align: left; }';
    html += 'thead { border-top: 2px solid #000; border-bottom: 1px solid #000; }';
    html += 'tbody { border-bottom: 2px solid #000; }';
    html += 'th { font-weight: normal; font-style: italic; }';
    html += '.title { font-weight: bold; margin-bottom: 5px; }';
    html += '.note { font-size: 10pt; margin-top: 10px; text-indent: 0.5in; }';
    html += '</style></head><body>';

    if (type === 'dif') {
      html += '<div class="title">Table 1</div>';
      html += '<div class="title">Differential Item Functioning Analysis Results</div>';
      html += '<table><thead><tr>';
      html += '<th>Item</th><th>MH χ²</th><th>Effect Size</th><th>p</th><th>Classification</th>';
      html += '</tr></thead><tbody>';

      difResults.forEach(result => {
        html += '<tr>';
        html += `<td>${result.itemName}</td>`;
        html += `<td>${result.difMagnitude.toFixed(3)}</td>`;
        html += `<td>${result.effectSize.toFixed(3)}</td>`;
        html += `<td>${result.pValue < 0.001 ? '< .001' : result.pValue.toFixed(3).replace('0.', '.')}</td>`;
        html += `<td>${result.classification}</td>`;
        html += '</tr>';
      });

      html += '</tbody></table>';
      html += '<div class="note"><i>Note.</i> DIF = Differential Item Functioning; MH = Mantel-Haenszel. ';
      html += 'Classification based on ETS standards: negligible (< 0.35), moderate (0.35-0.64), large (≥ 0.64).</div>';
    } else {
      html += '<div class="title">Table 2</div>';
      html += '<div class="title">Measurement Invariance Testing Results</div>';
      html += '<table><thead><tr>';
      html += '<th>Model</th><th>χ²</th><th>df</th><th>CFI</th><th>ΔCFI</th><th>RMSEA</th><th>SRMR</th>';
      html += '</tr></thead><tbody>';

      const models = [
        { name: 'Configural', data: invarianceResults.configural, delta: '—' },
        { name: 'Metric', data: invarianceResults.metric, delta: invarianceResults.metric.deltaCFI },
        { name: 'Scalar', data: invarianceResults.scalar, delta: invarianceResults.scalar.deltaCFI }
      ];

      models.forEach(model => {
        html += '<tr>';
        html += `<td>${model.name}</td>`;
        html += `<td>${model.data.chisq.toFixed(2)}</td>`;
        html += `<td>${model.data.df}</td>`;
        html += `<td>${model.data.cfi.toFixed(3)}</td>`;
        html += `<td>${typeof model.delta === 'number' ? model.delta.toFixed(3) : model.delta}</td>`;
        html += `<td>${model.data.rmsea.toFixed(3)}</td>`;
        html += `<td>${model.data.srmr.toFixed(3)}</td>`;
        html += '</tr>';
      });

      html += '</tbody></table>';
      html += '<div class="note"><i>Note.</i> CFI = Comparative Fit Index; RMSEA = Root Mean Square Error of Approximation; ';
      html += 'SRMR = Standardized Root Mean Square Residual. Cutoff criteria: ΔCFI ≤ 0.01, ΔRMSEA ≤ 0.015 (Cheung & Rensvold, 2002).</div>';
    }

    html += '</body></html>';

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `APA_Table_${type === 'dif' ? 'DIF' : 'Invariance'}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (view === 'dif' && difResults.length > 0) {
    const difChartData = {
      labels: difResults.map(r => r.itemName),
      datasets: [{
        label: 'DIF Effect Size',
        data: difResults.map(r => r.effectSize),
        backgroundColor: difResults.map(r =>
          r.classification === 'large' ? 'rgba(239, 68, 68, 0.7)' :
          r.classification === 'moderate' ? 'rgba(251, 191, 36, 0.7)' :
          'rgba(34, 197, 94, 0.7)'
        ),
        borderColor: difResults.map(r =>
          r.classification === 'large' ? 'rgb(239, 68, 68)' :
          r.classification === 'moderate' ? 'rgb(251, 191, 36)' :
          'rgb(34, 197, 94)'
        ),
        borderWidth: 2,
      }],
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">DIF Analysis Results</h1>
            <p className="text-gray-600 mt-1">Differential Item Functioning Detection</p>
          </div>
          <button
            onClick={() => setView('dashboard')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border-2 border-yellow-300 p-4">
          <div className="flex items-start gap-3">
            <Award className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-gray-900 mb-1">Publication-Grade DIF Analysis Complete</h4>
              <p className="text-sm text-gray-700">Mantel-Haenszel method with ETS classification standards</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
            <CheckCircle className="w-8 h-8 text-green-600 mb-2" />
            <p className="text-sm text-gray-600">Negligible DIF</p>
            <p className="text-3xl font-bold text-gray-900">{difResults.filter(r => r.classification === 'negligible').length}</p>
          </div>
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-6 border border-yellow-200">
            <AlertCircle className="w-8 h-8 text-yellow-600 mb-2" />
            <p className="text-sm text-gray-600">Moderate DIF</p>
            <p className="text-3xl font-bold text-gray-900">{difResults.filter(r => r.classification === 'moderate').length}</p>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-6 border border-red-200">
            <AlertCircle className="w-8 h-8 text-red-600 mb-2" />
            <p className="text-sm text-gray-600">Large DIF</p>
            <p className="text-3xl font-bold text-gray-900">{difResults.filter(r => r.classification === 'large').length}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">DIF Effect Sizes by Item</h3>
            <button
              onClick={() => exportChartAsPNG('dif-chart', 'DIF_Effect_Sizes.png')}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition"
            >
              <Download className="w-4 h-4" />
              PNG
            </button>
          </div>
          <div id="dif-chart">
            <Bar data={difChartData} options={{
              responsive: true,
              plugins: {
                legend: { display: false },
                title: { display: false },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  title: { display: true, text: 'Effect Size' },
                },
              },
            }} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Detailed DIF Results</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-3 font-semibold text-gray-700">Item</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">DIF Magnitude</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">Effect Size</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">p-value</th>
                  <th className="text-center py-3 px-3 font-semibold text-gray-700">Classification</th>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700">Interpretation</th>
                </tr>
              </thead>
              <tbody>
                {difResults.map((result, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3 text-gray-900 font-medium">{result.itemName}</td>
                    <td className="py-3 px-3 text-right text-gray-700">{result.difMagnitude.toFixed(3)}</td>
                    <td className="py-3 px-3 text-right text-gray-700">{result.effectSize.toFixed(3)}</td>
                    <td className="py-3 px-3 text-right text-gray-700">{result.pValue.toFixed(4)}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        result.classification === 'negligible' ? 'bg-green-100 text-green-800' :
                        result.classification === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {result.classification}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-600 text-xs">{result.interpretation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-700"><strong>ETS Standards:</strong> Negligible (ES &lt; 0.35), Moderate (0.35-0.64), Large (≥ 0.64)</p>
            <p className="text-sm text-gray-700"><strong>Method:</strong> Mantel-Haenszel chi-square with effect size classification</p>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-teal-50 rounded-xl border border-blue-200 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Award className="w-4 h-4 text-blue-600" />
            Publication-Ready Export Options
          </h3>
          <p className="text-xs text-gray-600 mb-3">Generate APA-formatted tables ready for manuscript submission</p>
          <button
            onClick={() => generateAPATable('dif')}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white hover:bg-gray-50 text-gray-700 rounded border border-gray-300 transition"
          >
            <FileText className="w-4 h-4" />
            Generate APA Table
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleCulturalExport('word')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <FileText className="w-4 h-4" />
            Export Word Report
          </button>
          <button
            onClick={() => handleCulturalExport('html')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
          >
            <FileText className="w-4 h-4" />
            Export HTML Report
          </button>
          <button
            onClick={() => handleExport('csv', difResults, 'DIF_Results')}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => handleExport('json', { difResults }, 'DIF_Analysis_Complete')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Export JSON
          </button>
          <button
            onClick={() => exportSyntax('spss', 'dif')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <FileText className="w-4 h-4" />
            Export SPSS Syntax
          </button>
          <button
            onClick={() => exportSyntax('r', 'dif')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
          >
            <FileText className="w-4 h-4" />
            Export R Script
          </button>
        </div>
      </div>
    );
  }

  if (view === 'invariance' && invarianceResults) {
    const invData = {
      labels: ['Configural', 'Metric', 'Scalar'],
      datasets: [
        {
          label: 'CFI',
          data: [
            invarianceResults.configural.cfi,
            invarianceResults.metric.cfi,
            invarianceResults.scalar.cfi,
          ],
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          yAxisID: 'y',
        },
        {
          label: 'RMSEA',
          data: [
            invarianceResults.configural.rmsea,
            invarianceResults.metric.rmsea,
            invarianceResults.scalar.rmsea,
          ],
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.5)',
          yAxisID: 'y1',
        },
      ],
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Measurement Invariance Results</h1>
            <p className="text-gray-600 mt-1">Testing equivalence across {invarianceResults.group1} and {invarianceResults.group2}</p>
          </div>
          <button
            onClick={() => setView('dashboard')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <div className={`rounded-xl border-2 p-4 ${
          invarianceResults.scalar.conclusion === 'supported' ? 'bg-green-50 border-green-300' :
          invarianceResults.metric.conclusion === 'supported' ? 'bg-yellow-50 border-yellow-300' :
          'bg-red-50 border-red-300'
        }`}>
          <div className="flex items-start gap-3">
            <Award className={`w-6 h-6 flex-shrink-0 mt-0.5 ${
              invarianceResults.scalar.conclusion === 'supported' ? 'text-green-600' :
              invarianceResults.metric.conclusion === 'supported' ? 'text-yellow-600' :
              'text-red-600'
            }`} />
            <div>
              <h4 className="font-bold text-gray-900 mb-2">Overall Recommendation</h4>
              <p className="text-sm text-gray-700">{invarianceResults.recommendation}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`rounded-xl p-6 border ${
            invarianceResults.configural.conclusion === 'supported' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {invarianceResults.configural.conclusion === 'supported' ? (
                <CheckCircle className="w-6 h-6 text-green-600" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-600" />
              )}
              <h3 className="font-bold text-gray-900">Configural</h3>
            </div>
            <p className="text-xs text-gray-600 mb-2">Same factor structure</p>
            <div className="space-y-1 text-sm">
              <p>CFI: {invarianceResults.configural.cfi.toFixed(3)}</p>
              <p>RMSEA: {invarianceResults.configural.rmsea.toFixed(3)}</p>
            </div>
          </div>

          <div className={`rounded-xl p-6 border ${
            invarianceResults.metric.conclusion === 'supported' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {invarianceResults.metric.conclusion === 'supported' ? (
                <CheckCircle className="w-6 h-6 text-green-600" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-600" />
              )}
              <h3 className="font-bold text-gray-900">Metric</h3>
            </div>
            <p className="text-xs text-gray-600 mb-2">Equal factor loadings</p>
            <div className="space-y-1 text-sm">
              <p>CFI: {invarianceResults.metric.cfi.toFixed(3)}</p>
              <p>ΔCFI: {invarianceResults.metric.deltaCFI.toFixed(3)}</p>
            </div>
          </div>

          <div className={`rounded-xl p-6 border ${
            invarianceResults.scalar.conclusion === 'supported' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {invarianceResults.scalar.conclusion === 'supported' ? (
                <CheckCircle className="w-6 h-6 text-green-600" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-600" />
              )}
              <h3 className="font-bold text-gray-900">Scalar</h3>
            </div>
            <p className="text-xs text-gray-600 mb-2">Equal intercepts</p>
            <div className="space-y-1 text-sm">
              <p>CFI: {invarianceResults.scalar.cfi.toFixed(3)}</p>
              <p>ΔCFI: {invarianceResults.scalar.deltaCFI.toFixed(3)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Fit Indices Across Invariance Levels</h3>
            <button
              onClick={() => exportChartAsPNG('invariance-chart', 'Invariance_Fit_Indices.png')}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition"
            >
              <Download className="w-4 h-4" />
              PNG
            </button>
          </div>
          <div id="invariance-chart">
            <Line data={invData} options={{
              responsive: true,
              interaction: { mode: 'index' as const, intersect: false },
              plugins: {
                legend: { position: 'top' as const },
              },
              scales: {
                y: {
                  type: 'linear' as const,
                  display: true,
                  position: 'left' as const,
                  title: { display: true, text: 'CFI' },
                  min: 0.85,
                  max: 1.0,
                },
                y1: {
                  type: 'linear' as const,
                  display: true,
                  position: 'right' as const,
                  title: { display: true, text: 'RMSEA' },
                  min: 0,
                  max: 0.1,
                  grid: { drawOnChartArea: false },
                },
              },
            }} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Complete Fit Statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-3 font-semibold text-gray-700">Level</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">χ²</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">df</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">p-value</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">CFI</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">ΔCFI</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">RMSEA</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">SRMR</th>
                  <th className="text-center py-3 px-3 font-semibold text-gray-700">Conclusion</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-3 font-medium text-gray-900">Configural</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.configural.chisq.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.configural.df}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.configural.pValue.toFixed(4)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.configural.cfi.toFixed(3)}</td>
                  <td className="py-3 px-3 text-right text-gray-400">-</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.configural.rmsea.toFixed(3)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.configural.srmr.toFixed(3)}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      invarianceResults.configural.conclusion === 'supported' ? 'bg-green-100 text-green-800' :
                      invarianceResults.configural.conclusion === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {invarianceResults.configural.conclusion}
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-3 font-medium text-gray-900">Metric</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.metric.chisq.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.metric.df}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.metric.pValue.toFixed(4)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.metric.cfi.toFixed(3)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.metric.deltaCFI.toFixed(3)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.metric.rmsea.toFixed(3)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.metric.srmr.toFixed(3)}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      invarianceResults.metric.conclusion === 'supported' ? 'bg-green-100 text-green-800' :
                      invarianceResults.metric.conclusion === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {invarianceResults.metric.conclusion}
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-3 font-medium text-gray-900">Scalar</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.scalar.chisq.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.scalar.df}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.scalar.pValue.toFixed(4)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.scalar.cfi.toFixed(3)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.scalar.deltaCFI.toFixed(3)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.scalar.rmsea.toFixed(3)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{invarianceResults.scalar.srmr.toFixed(3)}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      invarianceResults.scalar.conclusion === 'supported' ? 'bg-green-100 text-green-800' :
                      invarianceResults.scalar.conclusion === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {invarianceResults.scalar.conclusion}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-700"><strong>Cutoffs:</strong> ΔCFI ≤ 0.01, ΔRMSEA ≤ 0.015 (Cheung & Rensvold, 2002)</p>
            <p className="text-sm text-gray-700"><strong>Good Fit:</strong> CFI ≥ 0.95, RMSEA ≤ 0.06, SRMR ≤ 0.08 (Hu & Bentler, 1999)</p>
          </div>
        </div>

        {invarianceResults.equivalence && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Equivalence Testing</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Cohen's d:</span>
                    <span className="font-mono font-bold text-gray-900">{invarianceResults.equivalence.cohensD.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">95% CI Lower:</span>
                    <span className="font-mono text-gray-700">{invarianceResults.equivalence.lowerBound.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">95% CI Upper:</span>
                    <span className="font-mono text-gray-700">{invarianceResults.equivalence.upperBound.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Equivalence:</span>
                    <span className={`font-semibold ${invarianceResults.equivalence.isEquivalent ? 'text-green-600' : 'text-red-600'}`}>
                      {invarianceResults.equivalence.isEquivalent ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">{invarianceResults.equivalence.interpretation}</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gradient-to-r from-blue-50 to-teal-50 rounded-xl border border-blue-200 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Award className="w-4 h-4 text-blue-600" />
            Publication-Ready Export Options
          </h3>
          <p className="text-xs text-gray-600 mb-3">Generate APA-formatted tables ready for manuscript submission</p>
          <button
            onClick={() => generateAPATable('invariance')}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white hover:bg-gray-50 text-gray-700 rounded border border-gray-300 transition"
          >
            <FileText className="w-4 h-4" />
            Generate APA Table
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleCulturalExport('word')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <FileText className="w-4 h-4" />
            Export Word Report
          </button>
          <button
            onClick={() => handleCulturalExport('html')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
          >
            <FileText className="w-4 h-4" />
            Export HTML Report
          </button>
          <button
            onClick={() => handleExport('json', { invarianceResults }, 'Invariance_Complete')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Export JSON
          </button>
          <button
            onClick={() => exportSyntax('spss', 'invariance')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
          >
            <FileText className="w-4 h-4" />
            SPSS Syntax
          </button>
          <button
            onClick={() => exportSyntax('r', 'invariance')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
          >
            <FileText className="w-4 h-4" />
            R Script
          </button>
        </div>
      </div>
    );
  }

  if (view === 'translation') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Languages className="w-7 h-7 text-blue-600" />
              Translation and Back-Translation
            </h2>
            <p className="text-gray-600 mt-1">Systematic translation process for cross-cultural adaptation</p>
          </div>
          <button
            onClick={() => setView('dashboard')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Info className="w-6 h-6 text-blue-600" />
            <h3 className="text-lg font-bold text-gray-900">Translation-Back-Translation Protocol</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-white rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">1</div>
                <p className="font-semibold text-gray-900">Forward Translation</p>
              </div>
              <p className="text-gray-600">Translate from source (English) to target language</p>
            </div>
            <div className="bg-white rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold">2</div>
                <p className="font-semibold text-gray-900">Back-Translation</p>
              </div>
              <p className="text-gray-600">Independent translator converts back to English</p>
            </div>
            <div className="bg-white rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">3</div>
                <p className="font-semibold text-gray-900">Reconciliation</p>
              </div>
              <p className="text-gray-600">Review discrepancies and finalize translation</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Add New Translation Item</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Original Text (English)</label>
              <textarea
                value={newTranslation.originalText}
                onChange={(e) => setNewTranslation({ ...newTranslation, originalText: e.target.value })}
                placeholder="Enter the original English text to be translated..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Target Language</label>
              <select
                value={newTranslation.targetLanguage}
                onChange={(e) => setNewTranslation({ ...newTranslation, targetLanguage: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {COMMON_LANGUAGES.map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
              <button
                onClick={addTranslationItem}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
            <BarChart className="w-8 h-8 text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">Total Items</p>
            <p className="text-3xl font-bold text-gray-900">{translationItems.length}</p>
          </div>
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-6 border border-yellow-200">
            <Activity className="w-8 h-8 text-yellow-600 mb-2" />
            <p className="text-sm text-gray-600">Pending</p>
            <p className="text-3xl font-bold text-gray-900">
              {translationItems.filter(i => i.status === 'pending').length}
            </p>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
            <TrendingUp className="w-8 h-8 text-orange-600 mb-2" />
            <p className="text-sm text-gray-600">In Progress</p>
            <p className="text-3xl font-bold text-gray-900">
              {translationItems.filter(i => i.status === 'in_progress').length}
            </p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
            <CheckCircle className="w-8 h-8 text-green-600 mb-2" />
            <p className="text-sm text-gray-600">Completed</p>
            <p className="text-3xl font-bold text-gray-900">
              {translationItems.filter(i => i.status === 'completed').length}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {translationItems.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Languages className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium mb-2">No translation items yet</p>
              <p className="text-sm text-gray-500">Add items above to begin the translation process</p>
            </div>
          ) : (
            translationItems.map((item, idx) => (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-700">English → {item.target_language}</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.status === 'completed' ? 'bg-green-100 text-green-800' :
                          item.status === 'in_progress' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {item.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteTranslationItem(item.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Original Text (English)</label>
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-sm text-gray-900">{item.original_text}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Forward Translation ({item.target_language})</label>
                    <textarea
                      value={item.forward_translation}
                      onChange={(e) => updateTranslationItem(item.id, { forward_translation: e.target.value })}
                      placeholder={`Enter ${item.target_language} translation...`}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Translator Name</label>
                      <input
                        type="text"
                        value={item.translator_name || ''}
                        onChange={(e) => updateTranslationItem(item.id, { translator_name: e.target.value })}
                        placeholder="Translator name..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Back-Translation (to English)</label>
                    <textarea
                      value={item.back_translation}
                      onChange={(e) => updateTranslationItem(item.id, { back_translation: e.target.value })}
                      placeholder="Independent translator converts back to English..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Reviewer Name</label>
                      <input
                        type="text"
                        value={item.reviewer_name || ''}
                        onChange={(e) => updateTranslationItem(item.id, { reviewer_name: e.target.value })}
                        placeholder="Reviewer name..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Discrepancies Identified</label>
                    <textarea
                      value={item.discrepancies}
                      onChange={(e) => updateTranslationItem(item.id, { discrepancies: e.target.value })}
                      placeholder="Document any differences between original and back-translation..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Resolution & Final Version</label>
                    <textarea
                      value={item.resolution}
                      onChange={(e) => updateTranslationItem(item.id, { resolution: e.target.value })}
                      placeholder="Document how discrepancies were resolved and final agreed translation..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select
                      value={item.status}
                      onChange={(e) => updateTranslationItem(item.id, { status: e.target.value as any })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {translationItems.length > 0 && (
          <div className="flex gap-3">
            <button
              onClick={exportTranslationReport}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
            >
              <Download className="w-5 h-5" />
              Export Translation Report
            </button>
          </div>
        )}
      </div>
    );
  }

  if (view === 'alignment' && alignmentResults) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Alignment Optimization Results</h1>
            <p className="text-gray-600 mt-1">Modern approximate invariance assessment without strict constraints</p>
          </div>
          <button
            onClick={() => setView('dashboard')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <div className="bg-gradient-to-r from-teal-50 to-green-50 rounded-xl border-2 border-teal-300 p-4">
          <div className="flex items-start gap-3">
            <Award className="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-gray-900 mb-1">Alignment Method Complete</h4>
              <p className="text-sm text-gray-700">Modern alternative to traditional invariance testing (Asparouhov & Muthén, 2014)</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl p-6 border border-teal-200">
            <Zap className="w-8 h-8 text-teal-600 mb-2" />
            <p className="text-sm text-gray-600">Simplicity Index</p>
            <p className="text-3xl font-bold text-gray-900">{alignmentResults.simplicity.toFixed(3)}</p>
            <p className="text-xs text-gray-500 mt-1">&gt;0.90 = excellent</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
            <Target className="w-8 h-8 text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">Noninvariant Parameters</p>
            <p className="text-3xl font-bold text-gray-900">{alignmentResults.noninvariantParameters}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
            <TrendingUp className="w-8 h-8 text-purple-600 mb-2" />
            <p className="text-sm text-gray-600">R² (Scale Preservation)</p>
            <p className="text-3xl font-bold text-gray-900">{alignmentResults.r2.toFixed(3)}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Alignment Summary</h3>
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-semibold text-gray-700">Groups Compared:</p>
              <p className="text-gray-900">{alignmentResults.group1} vs {alignmentResults.group2}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-semibold text-gray-700">Scale Difference:</p>
              <p className="text-gray-900">{alignmentResults.scaleDifference.toFixed(3)}</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm font-semibold text-gray-700 mb-2">Recommendation:</p>
              <p className="text-gray-900">{alignmentResults.recommendation}</p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">About Alignment Optimization</h3>
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
            <li>Does not require strict factorial invariance</li>
            <li>Allows for approximate invariance across many groups</li>
            <li>Simplicity &gt; 0.90 indicates excellent approximate invariance</li>
            <li>More flexible than traditional CFA-based invariance testing</li>
          </ul>
        </div>
      </div>
    );
  }

  if (view === 'partial' && partialInvarianceResults) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Partial Invariance Results</h1>
            <p className="text-gray-600 mt-1">Identifying and handling noninvariant items</p>
          </div>
          <button
            onClick={() => setView('dashboard')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border-2 border-amber-300 p-4">
          <div className="flex items-start gap-3">
            <Award className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-gray-900 mb-1">Partial Invariance Analysis Complete</h4>
              <p className="text-sm text-gray-700">Sequential item freeing approach for practical invariance</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-6 border border-red-200">
            <AlertCircle className="w-8 h-8 text-red-600 mb-2" />
            <p className="text-sm text-gray-600">Noninvariant Items</p>
            <p className="text-3xl font-bold text-gray-900">{partialInvarianceResults.noninvariantItems.length}</p>
            {partialInvarianceResults.noninvariantItems.length > 0 && (
              <p className="text-xs text-gray-600 mt-2">{partialInvarianceResults.noninvariantItemNames.join(', ')}</p>
            )}
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
            <CheckCircle className="w-8 h-8 text-green-600 mb-2" />
            <p className="text-sm text-gray-600">Freed Parameters</p>
            <p className="text-3xl font-bold text-gray-900">{partialInvarianceResults.freedParameters.length}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Model Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-3 font-semibold text-gray-700">Model</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">CFI</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">ΔCFI</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">RMSEA</th>
                  <th className="text-center py-3 px-3 font-semibold text-gray-700">Conclusion</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-3 text-gray-900 font-medium">Partial Metric</td>
                  <td className="py-3 px-3 text-right text-gray-700">{partialInvarianceResults.partialMetricModel.cfi.toFixed(3)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{(partialInvarianceResults.partialMetricModel.deltaCFI || 0).toFixed(3)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{partialInvarianceResults.partialMetricModel.rmsea.toFixed(3)}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      partialInvarianceResults.partialMetricModel.conclusion === 'supported' ? 'bg-green-100 text-green-800' :
                      partialInvarianceResults.partialMetricModel.conclusion === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {partialInvarianceResults.partialMetricModel.conclusion}
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-3 text-gray-900 font-medium">Partial Scalar</td>
                  <td className="py-3 px-3 text-right text-gray-700">{partialInvarianceResults.partialScalarModel.cfi.toFixed(3)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{(partialInvarianceResults.partialScalarModel.deltaCFI || 0).toFixed(3)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{partialInvarianceResults.partialScalarModel.rmsea.toFixed(3)}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      partialInvarianceResults.partialScalarModel.conclusion === 'supported' ? 'bg-green-100 text-green-800' :
                      partialInvarianceResults.partialScalarModel.conclusion === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {partialInvarianceResults.partialScalarModel.conclusion}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-green-50 rounded-xl border border-green-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Recommendation</h3>
          <p className="text-gray-700">{partialInvarianceResults.recommendation}</p>
        </div>

        <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">About Partial Invariance</h3>
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
            <li>Allows up to 20% of items to be noninvariant</li>
            <li>More realistic approach for real-world data</li>
            <li>Enables group comparisons even when full invariance fails</li>
            <li>Identifies specific problematic items for revision</li>
          </ul>
        </div>
      </div>
    );
  }

  if (view === 'power' && powerAnalysisResults) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Power Analysis Results</h1>
            <p className="text-gray-600 mt-1">Statistical power for {powerAnalysisResults.analysis === 'dif' ? 'DIF detection' : 'invariance testing'}</p>
          </div>
          <button
            onClick={() => setView('dashboard')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
            <Users className="w-8 h-8 text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">Current Sample Size</p>
            <p className="text-3xl font-bold text-gray-900">{powerAnalysisResults.currentSampleSize}</p>
          </div>
          <div className={`bg-gradient-to-br rounded-xl p-6 border ${
            powerAnalysisResults.adequate ? 'from-green-50 to-green-100 border-green-200' : 'from-red-50 to-red-100 border-red-200'
          }`}>
            <TrendingUp className={`w-8 h-8 mb-2 ${powerAnalysisResults.adequate ? 'text-green-600' : 'text-red-600'}`} />
            <p className="text-sm text-gray-600">Statistical Power</p>
            <p className="text-3xl font-bold text-gray-900">{(powerAnalysisResults.currentPower * 100).toFixed(1)}%</p>
            <p className="text-xs text-gray-500 mt-1">Target: 80%</p>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
            <Target className="w-8 h-8 text-purple-600 mb-2" />
            <p className="text-sm text-gray-600">Recommended N</p>
            <p className="text-3xl font-bold text-gray-900">{powerAnalysisResults.recommendedSampleSize}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Power Analysis Details</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">Analysis Type</p>
                <p className="text-gray-900 capitalize">{powerAnalysisResults.analysis}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">Expected Effect Size</p>
                <p className="text-gray-900">{powerAnalysisResults.effectSize.toFixed(3)}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">Significance Level (α)</p>
                <p className="text-gray-900">{powerAnalysisResults.alpha}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">Power Status</p>
                <p className="text-gray-900">{powerAnalysisResults.adequate ? 'Adequate' : 'Inadequate'}</p>
              </div>
            </div>
            <div className={`p-4 rounded-lg border ${
              powerAnalysisResults.adequate ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
            }`}>
              <p className="text-sm font-semibold text-gray-700 mb-2">Interpretation:</p>
              <p className="text-gray-900">{powerAnalysisResults.interpretation}</p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">About Statistical Power</h3>
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
            <li>Power is the probability of detecting an effect when it truly exists</li>
            <li>Minimum recommended power: 0.80 (80%)</li>
            <li>Higher sample sizes increase power but with diminishing returns</li>
            <li>Plan sample sizes before data collection for adequate power</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Cultural Adaptation</h1>
        <p className="text-gray-600 mt-1">Publication-grade cross-cultural validation tools</p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-green-700">{success}</p>
          </div>
        </div>
      )}

      {dataQualityReport && (
        <div className={`border-l-4 p-6 rounded-xl ${
          dataQualityReport.passesQualityCheck ? 'bg-green-50 border-green-500' : 'bg-yellow-50 border-yellow-500'
        }`}>
          <div className="flex items-start gap-3 mb-4">
            {dataQualityReport.passesQualityCheck ? (
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Data Quality Report</h3>
              <p className={`text-sm mb-4 ${dataQualityReport.passesQualityCheck ? 'text-green-800' : 'text-yellow-800'}`}>
                {dataQualityReport.recommendation}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs text-gray-600">Missing Data</p>
                  <p className="text-lg font-bold text-gray-900">{dataQualityReport.missingDataPercentage.toFixed(1)}%</p>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs text-gray-600">Straightlining</p>
                  <p className="text-lg font-bold text-gray-900">{dataQualityReport.straightliningPercentage.toFixed(1)}%</p>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs text-gray-600">Outliers</p>
                  <p className="text-lg font-bold text-gray-900">{dataQualityReport.outlierPercentage.toFixed(1)}%</p>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs text-gray-600">Reliability (α)</p>
                  <p className="text-lg font-bold text-gray-900">{dataQualityReport.reliability.toFixed(3)}</p>
                </div>
              </div>
              {dataQualityReport.issues.length > 0 && (
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <p className="text-sm font-semibold text-gray-900 mb-2">Issues Detected:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {dataQualityReport.issues.map((issue, idx) => (
                      <li key={idx} className="text-sm text-gray-700">{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                onClick={() => setDataQualityReport(null)}
                className="mt-4 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm transition"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
          <Users className="w-8 h-8 text-blue-600 mb-2" />
          <p className="text-sm text-gray-600">Cultural Groups</p>
          <p className="text-3xl font-bold text-gray-900">{groups.length}</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
          <Languages className="w-8 h-8 text-green-600 mb-2" />
          <p className="text-sm text-gray-600">Languages</p>
          <p className="text-3xl font-bold text-gray-900">{new Set(groups.map(g => g.language)).size}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
          <Activity className="w-8 h-8 text-purple-600 mb-2" />
          <p className="text-sm text-gray-600">Total Participants</p>
          <p className="text-3xl font-bold text-gray-900">{groups.reduce((sum, g) => sum + g.sample_size, 0)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create Cultural Group</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Group name (e.g., US English)"
            value={newGroup.name}
            onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <input
            type="text"
            placeholder="Language/Locale (e.g., en-US)"
            value={newGroup.language}
            onChange={(e) => setNewGroup({ ...newGroup, language: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <input
            type="number"
            placeholder="Sample size"
            value={newGroup.sampleSize}
            onChange={(e) => setNewGroup({ ...newGroup, sampleSize: parseInt(e.target.value) || 0 })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={createGroup}
          className="mt-4 flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Create Group
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Cultural Groups</h2>
        {groups.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No cultural groups yet. Create one to get started.</p>
        ) : (
          <div className="space-y-3">
            {groups.map(group => (
              <div key={group.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{group.name}</h3>
                  <p className="text-sm text-gray-600">{group.language} • N = {group.sample_size} • {group.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedGroupForImport(group.id);
                      setImportModalOpen(true);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import Data
                  </button>
                  <button
                    onClick={() => runDataQualityCheck(group.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
                    title="Check data quality"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    Quality
                  </button>
                  <button
                    onClick={() => deleteGroup(group.id)}
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

      {groups.length >= 2 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Run Cultural Analyses</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Focal Group</label>
              <select
                value={selectedGroups.focal || ''}
                onChange={(e) => setSelectedGroups({ ...selectedGroups, focal: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select focal group...</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Reference Group</label>
              <select
                value={selectedGroups.reference || ''}
                onChange={(e) => setSelectedGroups({ ...selectedGroups, reference: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select reference group...</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={runDIFAnalysis}
              disabled={!selectedGroups.focal || !selectedGroups.reference || loading}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-5 h-5" />
              Run DIF Analysis
            </button>
            <button
              onClick={runInvarianceTest}
              disabled={!selectedGroups.focal || !selectedGroups.reference || loading}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-5 h-5" />
              Test Measurement Invariance
            </button>
            <button
              onClick={runPartialInvarianceTest}
              disabled={!selectedGroups.focal || !selectedGroups.reference || loading}
              className="flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Target className="w-5 h-5" />
              Partial Invariance Test
            </button>
            <button
              onClick={runAlignmentOptimization}
              disabled={!selectedGroups.focal || !selectedGroups.reference || loading}
              className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap className="w-5 h-5" />
              Alignment Optimization
            </button>
            <button
              onClick={() => runPowerAnalysis('dif')}
              disabled={!selectedGroups.focal || !selectedGroups.reference}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TrendingUp className="w-5 h-5" />
              Power Analysis (DIF)
            </button>
            <button
              onClick={() => runPowerAnalysis('invariance')}
              disabled={!selectedGroups.focal || !selectedGroups.reference}
              className="flex items-center gap-2 px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Activity className="w-5 h-5" />
              Power Analysis (MI)
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Translation & Back-Translation</h2>
        <p className="text-gray-600 mb-4">
          Systematic translation protocol for adapting scales across languages following international best practices
        </p>
        <button
          onClick={() => setView('translation')}
          className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition"
        >
          <Languages className="w-5 h-5" />
          Manage Translations
        </button>
      </div>

      <div className="bg-gradient-to-r from-teal-50 to-blue-50 rounded-xl border border-teal-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Award className="w-5 h-5 text-teal-600" />
          Global Standard Cross-Cultural Validation Toolkit
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div>
            <p className="font-semibold text-gray-900 mb-2">DIF Detection Methods:</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>Mantel-Haenszel χ² (ETS standards)</li>
              <li>Logistic Regression DIF</li>
              <li>Lord's χ² method</li>
              <li>IRT-based DIF (Jodoin-Gierl)</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-2">Invariance Testing:</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>Configural, Metric, Scalar, Strict</li>
              <li>Multigroup CFA with modification indices</li>
              <li>Alignment optimization (partial invariance)</li>
              <li>Equivalence testing (Cohen's d)</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-2">Export Options:</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>Word/HTML reports with embedded charts</li>
              <li>Individual PNG export for all visualizations</li>
              <li>APA-formatted publication tables</li>
              <li>CSV/JSON for further analysis</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-2">Standards Compliance:</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>ITC Guidelines for Test Adaptation</li>
              <li>Cheung & Rensvold (2002) ΔCFI criteria</li>
              <li>Hu & Bentler (1999) fit indices</li>
              <li>AERA/APA/NCME Testing Standards</li>
            </ul>
          </div>
        </div>
      </div>

      <DataImportModal
        isOpen={importModalOpen}
        onClose={() => {
          setImportModalOpen(false);
          setSelectedGroupForImport(null);
        }}
        onSuccess={() => {
          setSuccess('Data imported successfully');
          setTimeout(() => setSuccess(''), 3000);
          loadGroups();
        }}
        groupId={selectedGroupForImport || undefined}
        importType="responses"
        userId={currentUserId || undefined}
      />
    </div>
  );
}
