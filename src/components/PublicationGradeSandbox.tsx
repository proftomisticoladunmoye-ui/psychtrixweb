import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  FlaskConical, Plus, Edit, Trash2, AlertCircle, CheckCircle, Play, Download,
  BarChart3, Share2, Link as LinkIcon, Copy, Users, TrendingUp, Target,
  MessageCircle, Mail, Info, Eye, Save, Sparkles, ArrowLeft, ExternalLink, Database, X, Layers
} from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { exportResultsToPDF, exportToCSV, exportToJSON } from '../lib/exportUtils';
import { buildSandboxDataset, resolveHierarchy, parseQuestionnaireImport, validateInstrument, DemographicVariable, DemographicType, DemographicRole, SandboxConstruct, ValidationIssue } from '../lib/sandboxDataset';
import {
  calculateCronbachAlpha,
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
  subscale?: string;        // legacy flat grouping
  constructId?: string;
  subconstructId?: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'collecting' | 'analyzed';
  items: ScaleItem[];
  subscales: string[];
  constructs?: SandboxConstruct[];
  demographics?: DemographicVariable[];
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
  const [datasetBusy, setDatasetBusy] = useState(false);

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

  const [newDemographic, setNewDemographic] = useState<{
    name: string; type: DemographicType; role: DemographicRole; optionsText: string;
  }>({ name: '', type: 'categorical', role: 'grouping', optionsText: '' });

  // Construct hierarchy editor drafts (keyed by construct id).
  const [newConstructName, setNewConstructName] = useState('');
  const [subInput, setSubInput] = useState<Record<string, string>>({});
  const [itemDraft, setItemDraft] = useState<Record<string, { content: string; subId: string; reversed: boolean }>>({});

  // Phase 3: questionnaire import / preview / validate.
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const [showPreview, setShowPreview] = useState(false);
  const [showValidate, setShowValidate] = useState(false);

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

  // ---- demographic / grouping variables --------------------------------------
  const addDemographic = () => {
    if (!currentProject || !newDemographic.name.trim()) { setError('Demographic variable needs a name'); return; }
    const options = newDemographic.type === 'continuous'
      ? undefined
      : newDemographic.optionsText.split(',').map(o => o.trim()).filter(Boolean);
    if (newDemographic.type !== 'continuous' && (!options || options.length < 2)) {
      setError('Categorical / ordinal variables need at least two comma-separated options');
      return;
    }
    const demo: DemographicVariable = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
      name: newDemographic.name.trim(),
      type: newDemographic.type,
      role: newDemographic.role,
      options,
    };
    setCurrentProject({ ...currentProject, demographics: [...(currentProject.demographics ?? []), demo] });
    setNewDemographic({ name: '', type: 'categorical', role: 'grouping', optionsText: '' });
    setSuccess('Grouping variable added'); setTimeout(() => setSuccess(''), 2000);
  };

  const removeDemographic = (id: string) => {
    if (!currentProject) return;
    setCurrentProject({ ...currentProject, demographics: (currentProject.demographics ?? []).filter(d => d.id !== id) });
  };

  // ---- construct / subconstruct hierarchy ------------------------------------
  const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Populate the construct tree when an instrument is opened for editing —
  // deriving it from the legacy flat subscales the first time, so old projects
  // migrate seamlessly and keep working.
  const withConstructs = (p: Project): Project => {
    if (p.constructs && p.constructs.length) return p;
    const names = [...new Set(p.items.map(i => i.subscale).filter(Boolean))] as string[];
    const constructs: SandboxConstruct[] = names.map(n => ({ id: uid('c_'), name: n, subconstructs: [] }));
    const nameToId = new Map(constructs.map(c => [c.name, c.id]));
    const items = p.items.map(i => (i.subscale ? { ...i, constructId: nameToId.get(i.subscale) } : i));
    return { ...p, constructs, items };
  };

  const openForEdit = (project: Project) => { setCurrentProject(withConstructs(project)); setView('edit'); };

  const addConstruct = () => {
    if (!currentProject || !newConstructName.trim()) { setError('Construct needs a name'); return; }
    const c: SandboxConstruct = { id: uid('c_'), name: newConstructName.trim(), subconstructs: [] };
    setCurrentProject({ ...currentProject, constructs: [...(currentProject.constructs ?? []), c] });
    setNewConstructName('');
  };
  const renameConstruct = (cId: string, name: string) => {
    if (!currentProject) return;
    setCurrentProject({ ...currentProject, constructs: (currentProject.constructs ?? []).map(c => c.id === cId ? { ...c, name } : c) });
  };
  const removeConstruct = (cId: string) => {
    if (!currentProject) return;
    setCurrentProject({
      ...currentProject,
      constructs: (currentProject.constructs ?? []).filter(c => c.id !== cId),
      items: currentProject.items.filter(i => i.constructId !== cId),
    });
  };
  const addSubconstruct = (cId: string) => {
    if (!currentProject) return;
    const name = (subInput[cId] ?? '').trim();
    if (!name) return;
    setCurrentProject({
      ...currentProject,
      constructs: (currentProject.constructs ?? []).map(c => c.id === cId ? { ...c, subconstructs: [...c.subconstructs, { id: uid('s_'), name }] } : c),
    });
    setSubInput({ ...subInput, [cId]: '' });
  };
  const removeSubconstruct = (cId: string, sId: string) => {
    if (!currentProject) return;
    setCurrentProject({
      ...currentProject,
      constructs: (currentProject.constructs ?? []).map(c => c.id === cId ? { ...c, subconstructs: c.subconstructs.filter(s => s.id !== sId) } : c),
      items: currentProject.items.map(i => i.subconstructId === sId ? { ...i, subconstructId: undefined } : i),
    });
  };
  const addHierItem = (cId: string) => {
    if (!currentProject) return;
    const draft = itemDraft[cId] ?? { content: '', subId: '', reversed: false };
    if (!draft.content.trim()) { setError('Item content is required'); return; }
    const item: ScaleItem = { id: uid('i_'), content: draft.content.trim(), reversed: draft.reversed, constructId: cId, subconstructId: draft.subId || undefined };
    setCurrentProject({ ...currentProject, items: [...currentProject.items, item] });
    setItemDraft({ ...itemDraft, [cId]: { content: '', subId: '', reversed: false } });
  };
  const toggleReverse = (itemId: string) => {
    if (!currentProject) return;
    setCurrentProject({ ...currentProject, items: currentProject.items.map(i => i.id === itemId ? { ...i, reversed: !i.reversed } : i) });
  };

  // Import a pasted questionnaire structure into the hierarchy.
  const applyImport = () => {
    if (!currentProject) return;
    const parsed = parseQuestionnaireImport(importText);
    if ('error' in parsed) { setError(parsed.error); return; }
    if (importMode === 'replace') {
      setCurrentProject({ ...currentProject, constructs: parsed.constructs, items: parsed.items });
    } else {
      setCurrentProject({
        ...currentProject,
        constructs: [...(currentProject.constructs ?? []), ...parsed.constructs],
        items: [...currentProject.items, ...parsed.items],
      });
    }
    setShowImport(false);
    setImportText('');
    setSuccess(`Imported ${parsed.items.length} items across ${parsed.constructs.length} construct(s).${parsed.warnings.length ? ' ' + parsed.warnings.join(' ') : ''}`);
    setTimeout(() => setSuccess(''), 5000);
  };

  const validationIssues: ValidationIssue[] = currentProject ? validateInstrument(currentProject as any) : [];

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
          constructs: currentProject.constructs ?? [],
          demographics: currentProject.demographics ?? [],
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

      // Per-construct and per-subconstruct alpha (groups with ≥ 2 items), using
      // the Construct › Subconstruct hierarchy (falls back to legacy subscales).
      const { constructs: hierC, placement } = resolveHierarchy(currentProject as any);
      const relFor = (idxs: number[]) => calculateCronbachAlpha(responseMatrix.map(r => idxs.map(i => r[i])));
      const subscaleReliability: Array<{ subscale: string; nItems: number; alpha: number }> = [];
      for (const c of hierC) {
        for (const sc of c.subconstructs) {
          const idxs = currentProject.items.map((_, i) => (placement[i].scId === sc.id ? i : -1)).filter(i => i >= 0);
          if (idxs.length >= 2) subscaleReliability.push({ subscale: `${c.name} / ${sc.name}`, nItems: idxs.length, alpha: relFor(idxs) });
        }
        const cIdxs = currentProject.items.map((_, i) => (placement[i].cId === c.id ? i : -1)).filter(i => i >= 0);
        if (cIdxs.length >= 2) subscaleReliability.push({ subscale: c.name, nItems: cIdxs.length, alpha: relFor(cIdxs) });
      }

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

        // Corrected item-total correlation (item excluded from the total) —
        // the SPSS / psych::alpha standard; the ≥.30/≥.50 thresholds below assume it.
        const itemTotal = calculateCorrectedItemTotalCorrelation(responseMatrix, idx);

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

  // Pull every completed respondent's raw answers + demographic answers.
  const fetchRawResponses = async (): Promise<{ responses: number[][]; demographics: Array<Record<string, unknown>> }> => {
    if (!currentProject) return { responses: [], demographics: [] };
    const { data, error } = await supabase
      .from('scale_responses')
      .select('responses, demographic_data')
      .eq('project_id', currentProject.id)
      .eq('completed', true);
    if (error) throw error;
    const rows = data || [];
    return {
      responses: rows.map((r: any) => (r.responses as number[]) ?? []),
      demographics: rows.map((r: any) => (r.demographic_data as Record<string, unknown>) ?? {}),
    };
  };

  // Save the collected responses as a reusable dataset (reverse-scoring applied,
  // item + subscale/total score columns) so it flows into any analysis module.
  const saveCollectedAsDataset = async () => {
    if (!currentProject) return;
    try {
      setDatasetBusy(true);
      setError('');
      const rows = await fetchRawResponses();
      if (rows.responses.length === 0) { setError('No collected responses to save yet.'); return; }
      const built = buildSandboxDataset(currentProject, rows.responses, rows.demographics);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error: insertError } = await supabase.from('datasets').insert({
        user_id: user.id,
        name: `${currentProject.name} (Collected Data)`,
        file_name: `${currentProject.name}_collected.csv`,
        file_size: JSON.stringify(built.data).length,
        columns: built.columns,
        data: built.data,
        rows_count: built.data.length,
        metadata: {
          source: 'sandbox',
          sandboxProjectId: currentProject.id,
          reverseScored: true,
          variables: built.variables,
          uploadedAt: new Date().toISOString(),
        },
      });
      if (insertError) throw insertError;
      setSuccess(`Saved “${currentProject.name} (Collected Data)” — ${built.data.length} cases × ${built.columns.length} variables. It's now in Data Import, ready for path analysis, SEM and more.`);
    } catch (e: any) {
      setError(e?.message || 'Could not save the dataset.');
    } finally {
      setDatasetBusy(false);
    }
  };

  // Download the raw case × item matrix (with scores) as CSV.
  const downloadRawData = async () => {
    if (!currentProject) return;
    try {
      setDatasetBusy(true);
      setError('');
      const rows = await fetchRawResponses();
      if (rows.responses.length === 0) { setError('No collected responses to download yet.'); return; }
      const built = buildSandboxDataset(currentProject, rows.responses, rows.demographics);
      exportToCSV(built.data, `${currentProject.name}_RawData`);
    } catch (e: any) {
      setError(e?.message || 'Could not export the data.');
    } finally {
      setDatasetBusy(false);
    }
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
      case 'csv': {
        // Export readable item text + subscale alongside the statistics,
        // rather than the internal item ids.
        const rows = validationResults.itemAnalysis.map((a, i) => {
          const item = currentProject.items.find(it => it.id === a.itemId);
          return {
            item: i + 1,
            content: item?.content ?? a.itemId,
            subscale: item?.subscale ?? '',
            reversed: item?.reversed ? 'yes' : 'no',
            mean: a.mean.toFixed(3),
            sd: a.sd.toFixed(3),
            corrected_item_total: a.itemTotal.toFixed(3),
            alpha_if_deleted: a.alpha_if_deleted.toFixed(3),
          };
        });
        exportToCSV(rows, `${currentProject.name}_ItemAnalysis`);
        break;
      }
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

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}

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

        {/* Move the collected data into the analysis pipeline. */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <div className="flex items-start gap-2 mb-3">
            <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-indigo-900">
              <strong>Use this data elsewhere.</strong> Reverse-scored items are recoded and subscale/total
              scores are added, so you can run path analysis, SEM, factor analysis and more — or compute new
              variables — on the responses you just collected.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={saveCollectedAsDataset}
              disabled={datasetBusy}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition font-medium"
            >
              <Database className="w-4 h-4" />
              {datasetBusy ? 'Working…' : 'Save as Dataset'}
            </button>
            <button
              onClick={downloadRawData}
              disabled={datasetBusy}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-indigo-300 hover:bg-indigo-100 disabled:opacity-50 text-indigo-700 rounded-lg transition font-medium"
            >
              <Download className="w-4 h-4" />
              Download Raw Data (CSV)
            </button>
          </div>
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
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition text-sm"
              title="Import a questionnaire structure from a pasted table"
            >
              <Download className="w-4 h-4 rotate-180" />
              Import
            </button>
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition text-sm"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
            <button
              onClick={() => setShowValidate(true)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition text-sm border ${
                validationIssues.some(i => i.level === 'error') ? 'bg-red-50 border-red-300 text-red-700'
                : validationIssues.length ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              <CheckCircle className="w-4 h-4" />
              Validate{validationIssues.length ? ` (${validationIssues.length})` : ''}
            </button>
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

        {/* ── Import modal ─────────────────────────────────────────────── */}
        {showImport && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowImport(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Download className="w-5 h-5 text-blue-600 rotate-180" />Import Questionnaire Structure</h3>
              <p className="text-sm text-gray-600">
                Paste a table (from Excel/Sheets) with one row per item. Columns: <b>item</b>, <b>construct</b>, <b>dimension</b> (optional), <b>reverse</b> (optional; yes/no).
                A header row is auto-detected; otherwise columns are read in that order.
              </p>
              <textarea
                value={importText} onChange={(e) => setImportText(e.target.value)} rows={9} autoFocus
                placeholder={'item\tconstruct\tdimension\treverse\nI feel tense\tAcademic Stress\tWorkload\tno\nI feel calm\tAcademic Stress\tWorkload\tyes'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />Replace current structure</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={importMode === 'append'} onChange={() => setImportMode('append')} />Append</label>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowImport(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-800">Cancel</button>
                <button onClick={applyImport} disabled={!importText.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg">Import</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Preview modal ────────────────────────────────────────────── */}
        {showPreview && (() => {
          const { constructs, placement } = resolveHierarchy(currentProject as any);
          const items = currentProject.items;
          const scale = currentProject.response_scale;
          return (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowPreview(false)}>
              <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Layers className="w-5 h-5 text-blue-600" />Questionnaire Preview</h3>
                  <button onClick={() => setShowPreview(false)}><X className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="px-2 py-1 bg-gray-100 rounded">{constructs.length} constructs</span>
                  <span className="px-2 py-1 bg-gray-100 rounded">{constructs.reduce((s, c) => s + c.subconstructs.length, 0)} dimensions</span>
                  <span className="px-2 py-1 bg-gray-100 rounded">{items.length} items</span>
                  <span className="px-2 py-1 bg-gray-100 rounded">{(currentProject.demographics ?? []).length} grouping vars</span>
                  <span className="px-2 py-1 bg-gray-100 rounded">Scale: {scale.type} {scale.min}–{scale.max}</span>
                </div>
                {(currentProject.demographics ?? []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Demographics & Grouping</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(currentProject.demographics ?? []).map((d) => (
                        <span key={d.id} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded">{d.name} · {d.type} · {d.role}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  {constructs.map((c) => (
                    <div key={c.id} className="border border-gray-200 rounded-lg p-3">
                      <p className="font-semibold text-gray-900">{c.name} <span className="text-xs font-normal text-gray-500">({items.filter((_, i) => placement[i].cId === c.id).length} items)</span></p>
                      {/* items grouped by dimension */}
                      {[{ id: undefined as string | undefined, name: '(no dimension)' }, ...c.subconstructs].map((sc) => {
                        const grp = items.filter((_, i) => placement[i].cId === c.id && placement[i].scId === sc.id);
                        if (!grp.length) return null;
                        return (
                          <div key={sc.id ?? 'none'} className="mt-2 ml-2">
                            {c.subconstructs.length > 0 && <p className="text-xs font-medium text-indigo-700">{sc.name}</p>}
                            <ol className="list-decimal list-inside text-sm text-gray-700 ml-1">
                              {grp.map((it) => <li key={it.id}>{it.content}{it.reversed && <span className="ml-1 text-xs text-orange-700">(R)</span>}</li>)}
                            </ol>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {constructs.length === 0 && <p className="text-sm text-gray-500">No constructs defined yet.</p>}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Validate modal ───────────────────────────────────────────── */}
        {showValidate && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowValidate(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-blue-600" />Structure Validation</h3>
                <button onClick={() => setShowValidate(false)}><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              {validationIssues.length === 0 ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-800">The instrument structure looks good — ready for analysis.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {validationIssues.map((iss, i) => (
                    <div key={i} className={`p-3 rounded-lg flex items-start gap-2 border ${iss.level === 'error' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                      <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iss.level === 'error' ? 'text-red-600' : 'text-amber-600'}`} />
                      <p className={`text-sm ${iss.level === 'error' ? 'text-red-800' : 'text-amber-800'}`}>{iss.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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
              <h4 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                Constructs, Dimensions &amp; Items ({currentProject.items.length} items)
              </h4>
              <p className="text-sm text-gray-600 mb-4">
                Build the instrument hierarchy — <b>Construct → Subconstruct/Dimension → Item</b>. A questionnaire can hold several constructs, each with several dimensions.
              </p>

              <div className="flex gap-2 mb-4">
                <input
                  type="text" value={newConstructName}
                  onChange={(e) => setNewConstructName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addConstruct(); }}
                  placeholder="New construct, e.g., Academic Stress"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={addConstruct} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Construct
                </button>
              </div>

              {(currentProject.constructs ?? []).length === 0 ? (
                <div className="p-10 border-2 border-dashed border-gray-300 rounded-lg text-center">
                  <Layers className="w-14 h-14 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium mb-1">No constructs yet</p>
                  <p className="text-sm text-gray-500">Add a construct above, then add its dimensions and items.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(currentProject.constructs ?? []).map((c) => {
                    const cItems = currentProject.items.filter((i) => i.constructId === c.id);
                    const draft = itemDraft[c.id] ?? { content: '', subId: '', reversed: false };
                    return (
                      <div key={c.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50/60">
                        <div className="flex items-center gap-2 mb-3">
                          <input
                            value={c.name}
                            onChange={(e) => renameConstruct(c.id, e.target.value)}
                            className="flex-1 px-3 py-1.5 text-base font-semibold text-gray-900 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-500 whitespace-nowrap">{cItems.length} item{cItems.length !== 1 ? 's' : ''}</span>
                          <button onClick={() => removeConstruct(c.id)} title="Remove construct" className="text-gray-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          <span className="text-xs font-medium text-gray-500">Dimensions:</span>
                          {c.subconstructs.length === 0 && <span className="text-xs text-gray-400">none</span>}
                          {c.subconstructs.map((s) => (
                            <span key={s.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-indigo-100 text-indigo-800 rounded-full">
                              {s.name}
                              <button onClick={() => removeSubconstruct(c.id, s.id)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                          <input
                            value={subInput[c.id] ?? ''}
                            onChange={(e) => setSubInput({ ...subInput, [c.id]: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') addSubconstruct(c.id); }}
                            placeholder="+ dimension"
                            className="px-2 py-0.5 text-xs border border-gray-300 rounded-full w-28 focus:ring-1 focus:ring-indigo-400"
                          />
                        </div>

                        {cItems.length > 0 && (
                          <div className="space-y-1.5 mb-3">
                            {cItems.map((item) => {
                              const sub = c.subconstructs.find((s) => s.id === item.subconstructId);
                              return (
                                <div key={item.id} className="flex items-start gap-2 p-2 bg-white border border-gray-200 rounded-lg">
                                  <p className="flex-1 text-sm text-gray-800">{item.content}</p>
                                  {sub && <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded self-center">{sub.name}</span>}
                                  <button onClick={() => toggleReverse(item.id)} title="Toggle reverse scoring"
                                    className={`text-xs px-2 py-0.5 rounded self-center ${item.reversed ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-500'}`}>
                                    {item.reversed ? 'Reversed' : 'Reverse?'}
                                  </button>
                                  <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-600 self-center"><Trash2 className="w-4 h-4" /></button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="space-y-2">
                          <textarea
                            value={draft.content}
                            onChange={(e) => setItemDraft({ ...itemDraft, [c.id]: { ...draft, content: e.target.value } })}
                            rows={2} placeholder="New item text…"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            {c.subconstructs.length > 0 && (
                              <select
                                value={draft.subId}
                                onChange={(e) => setItemDraft({ ...itemDraft, [c.id]: { ...draft, subId: e.target.value } })}
                                className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                              >
                                <option value="">(no dimension)</option>
                                {c.subconstructs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            )}
                            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                              <input type="checkbox" checked={draft.reversed}
                                onChange={(e) => setItemDraft({ ...itemDraft, [c.id]: { ...draft, reversed: e.target.checked } })} className="rounded" />
                              Reversed
                            </label>
                            <button onClick={() => addHierItem(c.id)} className="ml-auto px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5">
                              <Plus className="w-4 h-4" /> Add item
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Demographic & grouping variables — kept separate from the items */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h4 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                Demographic & Grouping Variables ({(currentProject.demographics ?? []).length})
              </h4>
              <p className="text-sm text-gray-600 mb-4">
                Kept separate from the scale items. Collected from respondents and flow into the dataset as their own columns —
                ready to use as the grouping/criterion variable for DIF, measurement invariance, multi-group CFA and group comparisons.
              </p>

              {(currentProject.demographics ?? []).length > 0 && (
                <div className="space-y-2 mb-4">
                  {(currentProject.demographics ?? []).map((d) => (
                    <div key={d.id} className="flex items-start justify-between gap-2 p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{d.name}</p>
                        <p className="text-xs text-gray-600">
                          {d.type} · {d.role}{d.options?.length ? ` · ${d.options.join(', ')}` : ''}
                        </p>
                      </div>
                      <button onClick={() => removeDemographic(d.id)} title="Remove" className="text-gray-300 hover:text-red-600 flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text" value={newDemographic.name}
                    onChange={(e) => setNewDemographic({ ...newDemographic, name: e.target.value })}
                    placeholder="e.g., Gender" className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                  <select
                    value={newDemographic.type}
                    onChange={(e) => setNewDemographic({ ...newDemographic, type: e.target.value as DemographicType })}
                    className="px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="categorical">Categorical</option>
                    <option value="ordinal">Ordinal</option>
                    <option value="continuous">Continuous</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={newDemographic.role}
                    onChange={(e) => setNewDemographic({ ...newDemographic, role: e.target.value as DemographicRole })}
                    className="px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                    title="How the variable is used downstream"
                  >
                    <option value="grouping">Grouping (DIF / invariance)</option>
                    <option value="criterion">Criterion (regression / validity)</option>
                    <option value="descriptive">Descriptive</option>
                  </select>
                  {newDemographic.type !== 'continuous' && (
                    <input
                      type="text" value={newDemographic.optionsText}
                      onChange={(e) => setNewDemographic({ ...newDemographic, optionsText: e.target.value })}
                      placeholder="Options: Male, Female" className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>
                <button
                  onClick={addDemographic}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add Grouping Variable
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
                  onClick={() => openForEdit(project)}
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
