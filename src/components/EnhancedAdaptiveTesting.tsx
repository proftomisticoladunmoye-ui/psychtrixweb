import React, { useState, useEffect, useRef } from 'react';
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
  Hash,
  Eye,
  Shield,
  Layers,
  Info,
  Database,
  Save
} from 'lucide-react';
import { Line, Scatter } from 'react-chartjs-2';
import { exportResultsToPDF, exportToCSV, exportToJSON } from '../lib/exportUtils';
import {
  validateItemParameters,
  irt3pl,
  calculateInformation,
  calculateKLInformation,
  calculateMPWI,
  sprtClassification,
  filterItemsByExposure,
  selectItemWithContentBalancing,
  calculateTestEfficiency,
  calculateMeasurementPrecision,
  constrainTheta,
  calculateConfidenceInterval
} from '../lib/catUtils';

interface ItemBankItem {
  id: string;
  content: string;
  a: number;
  b: number;
  c: number;
  used: boolean;
  exposureCount: number;
  contentCategory?: string;
}

interface CATSession {
  items: ItemBankItem[];
  responses: number[];
  abilityEstimates: number[];
  standardErrors: number[];
  informationValues: number[];
  currentItem: number;
  status: 'idle' | 'running' | 'completed';
  startTime: number;
  endTime?: number;
  stoppingReason?: string;
}

interface CATStatistics {
  finalTheta: number;
  finalSE: number;
  totalItems: number;
  testDuration: number;
  efficiency: number;
  averageInformation: number;
  measurementPrecision: number;
  itemExposureStats: {
    mean: number;
    max: number;
    sd: number;
  };
  contentBalance: {
    [category: string]: number;
  };
}

export function EnhancedAdaptiveTesting() {
  const [view, setView] = useState<'home' | 'itembank' | 'simulation' | 'results' | 'history' | 'analysis'>('home');
  const [itemBank, setItemBank] = useState<ItemBankItem[]>([]);
  const [currentItemBankId, setCurrentItemBankId] = useState<string | null>(null);
  const [itemBankName, setItemBankName] = useState('Default Item Bank');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);
  const [newItem, setNewItem] = useState({
    content: '',
    a: 1.0,
    b: 0.0,
    c: 0.0,
    contentCategory: 'General'
  });

  const [session, setSession] = useState<CATSession>({
    items: [],
    responses: [],
    abilityEstimates: [],
    standardErrors: [],
    informationValues: [],
    currentItem: 0,
    status: 'idle',
    startTime: 0,
  });

  const [settings, setSettings] = useState({
    startingAbility: 0.0,
    maxItems: 30,
    minItems: 10,
    seThreshold: 0.3,

    selectionMethod: 'mfi' as 'mfi' | 'mpwi' | 'kl' | 'random',

    abilityEstimation: 'mle' as 'mle' | 'eap' | 'map',

    exposureControl: true,
    maxExposureRate: 0.25,

    contentBalancing: false,
    contentCategories: ['General'],

    stoppingRule: 'combined' as 'se' | 'fixed' | 'classification' | 'combined',
    classificationCutoff: 0.0,
    classificationSE: 0.3,

    priorMean: 0.0,
    priorSD: 1.0,
  });

  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [statistics, setStatistics] = useState<CATStatistics | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const chartRef = useRef<any>(null);
  const infoChartRef = useRef<any>(null);

  useEffect(() => {
    loadItemBank();
  }, []);

  const loadItemBank = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: banks, error: bankError } = await supabase
        .from('cat_item_banks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bankError) throw bankError;

      if (banks) {
        setCurrentItemBankId(banks.id);
        setItemBankName(banks.name);

        const { data: items, error: itemsError } = await supabase
          .from('cat_items')
          .select('*')
          .eq('item_bank_id', banks.id)
          .order('created_at');

        if (itemsError) throw itemsError;

        const mappedItems: ItemBankItem[] = items?.map(item => ({
          id: item.id,
          content: item.content,
          a: parseFloat(item.a_param),
          b: parseFloat(item.b_param),
          c: parseFloat(item.c_param),
          used: false,
          exposureCount: item.exposure_count || 0,
          contentCategory: item.content_category
        })) || [];

        setItemBank(mappedItems);
      } else {
        const { data: newBank, error: createError } = await supabase
          .from('cat_item_banks')
          .insert({
            user_id: user.id,
            name: 'Default Item Bank',
            description: 'Auto-generated item bank'
          })
          .select()
          .single();

        if (createError) throw createError;

        setCurrentItemBankId(newBank.id);
        setItemBankName(newBank.name);

        const defaultItems = generateDefaultItemBank();

        const itemsToInsert = defaultItems.map(item => ({
          item_bank_id: newBank.id,
          content: item.content,
          a_param: item.a,
          b_param: item.b,
          c_param: item.c,
          content_category: item.contentCategory,
          exposure_count: 0
        }));

        const { data: insertedItems, error: insertError } = await supabase
          .from('cat_items')
          .insert(itemsToInsert)
          .select();

        if (insertError) throw insertError;

        const mappedItems: ItemBankItem[] = insertedItems?.map(item => ({
          id: item.id,
          content: item.content,
          a: parseFloat(item.a_param),
          b: parseFloat(item.b_param),
          c: parseFloat(item.c_param),
          used: false,
          exposureCount: 0,
          contentCategory: item.content_category
        })) || [];

        setItemBank(mappedItems);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const generateDefaultItemBank = (): ItemBankItem[] => {
    const items: ItemBankItem[] = [];
    const categories = ['Verbal', 'Quantitative', 'Logical'];

    for (let i = 0; i < 100; i++) {
      items.push({
        id: `item_${i + 1}`,
        content: `Item ${i + 1}: Sample question about the construct`,
        a: 0.5 + Math.random() * 2.0,
        b: -3 + Math.random() * 6,
        c: 0.10 + Math.random() * 0.20,
        used: false,
        exposureCount: 0,
        contentCategory: categories[Math.floor(Math.random() * categories.length)],
      });
    }
    return items;
  };

  const addItemToBank = async () => {
    if (!newItem.content) {
      setError('Item content is required');
      return;
    }

    const validation = validateItemParameters({
      a: newItem.a,
      b: newItem.b,
      c: newItem.c
    });

    if (!validation.valid) {
      setError(validation.errors.join(', '));
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (!currentItemBankId) throw new Error('No item bank selected');

      const { data: insertedItem, error: insertError } = await supabase
        .from('cat_items')
        .insert({
          item_bank_id: currentItemBankId,
          content: newItem.content,
          a_param: newItem.a,
          b_param: newItem.b,
          c_param: newItem.c,
          content_category: newItem.contentCategory,
          exposure_count: 0
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const item: ItemBankItem = {
        id: insertedItem.id,
        content: insertedItem.content,
        a: parseFloat(insertedItem.a_param),
        b: parseFloat(insertedItem.b_param),
        c: parseFloat(insertedItem.c_param),
        used: false,
        exposureCount: 0,
        contentCategory: insertedItem.content_category
      };

      setItemBank([...itemBank, item]);
      setNewItem({ content: '', a: 1.0, b: 0.0, c: 0.0, contentCategory: 'General' });
      setSuccess('Item added to bank successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };


  const selectNextItem = (
    currentTheta: number,
    currentSE: number,
    unusedItems: ItemBankItem[]
  ): ItemBankItem => {
    if (unusedItems.length === 0) {
      throw new Error('No more items available');
    }

    if (settings.selectionMethod === 'random') {
      return unusedItems[Math.floor(Math.random() * unusedItems.length)];
    }

    let candidateItems = unusedItems;

    if (settings.exposureControl) {
      const totalAdministrations = itemBank.reduce((sum, item) => sum + item.exposureCount, 0);
      candidateItems = filterItemsByExposure(unusedItems, settings.maxExposureRate, totalAdministrations);

      if (candidateItems.length === 0) {
        candidateItems = unusedItems;
      }
    }

    if (settings.contentBalancing && session.items.length > 0) {
      const targetProportions: { [key: string]: number } = {};
      settings.contentCategories.forEach(cat => {
        targetProportions[cat] = 1 / settings.contentCategories.length;
      });

      const scoreFunction = (item: ItemBankItem) => {
        switch (settings.selectionMethod) {
          case 'mfi':
            return calculateInformation(currentTheta, item.a, item.b, item.c);
          case 'mpwi':
            return calculateMPWI(currentTheta, item.a, item.b, item.c);
          case 'kl':
            return calculateKLInformation(currentTheta, item.a, item.b, item.c, settings.priorMean, settings.priorSD);
          default:
            return Math.random();
        }
      };

      const selected = selectItemWithContentBalancing(
        candidateItems,
        session.items,
        targetProportions,
        scoreFunction
      );

      if (selected) return selected;
    }

    let maxValue = -Infinity;
    let selectedItem = candidateItems[0];

    candidateItems.forEach(item => {
      let value = 0;

      switch (settings.selectionMethod) {
        case 'mfi':
          value = calculateInformation(currentTheta, item.a, item.b, item.c);
          break;
        case 'mpwi':
          value = calculateMPWI(currentTheta, item.a, item.b, item.c);
          break;
        case 'kl':
          value = calculateKLInformation(currentTheta, item.a, item.b, item.c, settings.priorMean, settings.priorSD);
          break;
      }

      if (value > maxValue) {
        maxValue = value;
        selectedItem = item;
      }
    });

    return selectedItem;
  };

  const estimateAbility = (
    items: ItemBankItem[],
    responses: number[]
  ): { theta: number; se: number } => {
    if (responses.length === 0) {
      return { theta: settings.startingAbility, se: 1.0 };
    }

    if (settings.abilityEstimation === 'eap') {
      return estimateEAP(items, responses);
    } else if (settings.abilityEstimation === 'map') {
      return estimateMAP(items, responses);
    } else {
      return estimateMLE(items, responses);
    }
  };

  const estimateMLE = (
    items: ItemBankItem[],
    responses: number[]
  ): { theta: number; se: number } => {
    let theta = settings.startingAbility;
    const maxIterations = 30;
    const tolerance = 0.0001;

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
      theta = constrainTheta(theta);
    }

    let totalInfo = 0;
    items.forEach((item, idx) => {
      if (idx >= responses.length) return;
      totalInfo += calculateInformation(theta, item.a, item.b, item.c);
    });

    const se = totalInfo > 0 ? 1 / Math.sqrt(totalInfo) : 1.0;

    return { theta, se };
  };

  const estimateEAP = (
    items: ItemBankItem[],
    responses: number[]
  ): { theta: number; se: number } => {
    const quadPoints = 41;
    const minTheta = -4;
    const maxTheta = 4;
    const step = (maxTheta - minTheta) / (quadPoints - 1);

    const thetas: number[] = [];
    const priors: number[] = [];
    const posteriors: number[] = [];

    for (let i = 0; i < quadPoints; i++) {
      const theta = minTheta + i * step;
      thetas.push(theta);

      const prior = (1 / (settings.priorSD * Math.sqrt(2 * Math.PI))) *
        Math.exp(-0.5 * Math.pow((theta - settings.priorMean) / settings.priorSD, 2));
      priors.push(prior);

      let likelihood = 1;
      items.forEach((item, idx) => {
        if (idx >= responses.length) return;
        const p = irt3pl(theta, item.a, item.b, item.c);
        likelihood *= responses[idx] === 1 ? p : (1 - p);
      });

      posteriors.push(likelihood * prior);
    }

    const totalPosterior = posteriors.reduce((sum, p) => sum + p, 0);
    const normalizedPosteriors = posteriors.map(p => p / totalPosterior);

    let eap = 0;
    normalizedPosteriors.forEach((p, i) => {
      eap += p * thetas[i];
    });

    let variance = 0;
    normalizedPosteriors.forEach((p, i) => {
      variance += p * Math.pow(thetas[i] - eap, 2);
    });

    const se = Math.sqrt(variance);

    return { theta: eap, se };
  };

  const estimateMAP = (
    items: ItemBankItem[],
    responses: number[]
  ): { theta: number; se: number } => {
    let theta = settings.priorMean;
    const maxIterations = 30;
    const tolerance = 0.0001;

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

      firstDeriv -= (theta - settings.priorMean) / (settings.priorSD * settings.priorSD);
      secondDeriv -= 1 / (settings.priorSD * settings.priorSD);

      if (Math.abs(firstDeriv) < tolerance) break;

      theta -= firstDeriv / secondDeriv;
    }

    let totalInfo = 0;
    items.forEach((item, idx) => {
      if (idx >= responses.length) return;
      totalInfo += calculateInformation(theta, item.a, item.b, item.c);
    });
    totalInfo += 1 / (settings.priorSD * settings.priorSD);

    const se = totalInfo > 0 ? 1 / Math.sqrt(totalInfo) : 1.0;

    return { theta, se };
  };

  const checkStoppingRules = (
    numItems: number,
    currentSE: number,
    currentTheta: number
  ): { shouldStop: boolean; reason: string } => {
    if (numItems >= settings.maxItems) {
      return { shouldStop: true, reason: 'Maximum items reached' };
    }

    if (numItems < settings.minItems) {
      return { shouldStop: false, reason: '' };
    }

    switch (settings.stoppingRule) {
      case 'se':
        if (currentSE <= settings.seThreshold) {
          return { shouldStop: true, reason: `SE threshold reached (${currentSE.toFixed(3)} ≤ ${settings.seThreshold})` };
        }
        break;

      case 'fixed':
        if (numItems >= settings.maxItems) {
          return { shouldStop: true, reason: 'Fixed length reached' };
        }
        break;

      case 'classification':
        const sprtResult = sprtClassification(
          currentTheta,
          currentSE,
          settings.classificationCutoff,
          0.05,
          0.05,
          0.5
        );
        if (sprtResult.decision !== 'continue') {
          return {
            shouldStop: true,
            reason: `Classification: ${sprtResult.decision} (confidence: ${(sprtResult.confidence * 100).toFixed(1)}%)`
          };
        }
        break;

      case 'combined':
        if (currentSE <= settings.seThreshold) {
          return { shouldStop: true, reason: `SE threshold reached (${currentSE.toFixed(3)})` };
        }
        const combinedSprt = sprtClassification(
          currentTheta,
          currentSE,
          settings.classificationCutoff,
          0.05,
          0.05,
          0.5
        );
        if (combinedSprt.decision !== 'continue' && currentSE <= settings.classificationSE) {
          return {
            shouldStop: true,
            reason: `Combined: ${combinedSprt.decision} + SE ≤ ${settings.classificationSE}`
          };
        }
        break;
    }

    return { shouldStop: false, reason: '' };
  };

  const startCAT = () => {
    const availableItems = itemBank.map(item => ({ ...item, used: false }));

    if (availableItems.length < settings.minItems) {
      setError(`Need at least ${settings.minItems} items in the bank to start CAT`);
      return;
    }

    setSession({
      items: [],
      responses: [],
      abilityEstimates: [settings.startingAbility],
      standardErrors: [1.0],
      informationValues: [0],
      currentItem: 0,
      status: 'running',
      startTime: Date.now(),
    });

    setError('');
    setSuccess('');
    setView('simulation');
  };

  const respondToItem = async (response: number) => {
    const newResponses = [...session.responses, response];
    const newItems = [...session.items];

    newItems[newItems.length - 1].used = true;
    newItems[newItems.length - 1].exposureCount++;

    const currentItem = newItems[newItems.length - 1];

    try {
      await supabase
        .from('cat_items')
        .update({ exposure_count: currentItem.exposureCount })
        .eq('id', currentItem.id);
    } catch (err) {
      console.error('Failed to update exposure count:', err);
    }

    const { theta, se } = estimateAbility(newItems, newResponses);

    const info = newItems.reduce((sum, item, idx) => {
      if (idx >= newResponses.length) return sum;
      return sum + calculateInformation(theta, item.a, item.b, item.c);
    }, 0);

    const newEstimates = [...session.abilityEstimates, theta];
    const newSEs = [...session.standardErrors, se];
    const newInfo = [...session.informationValues, info];

    const { shouldStop, reason } = checkStoppingRules(newResponses.length, se, theta);

    let updatedSession: CATSession = {
      ...session,
      items: newItems,
      responses: newResponses,
      abilityEstimates: newEstimates,
      standardErrors: newSEs,
      informationValues: newInfo,
      currentItem: session.currentItem + 1,
      status: shouldStop ? 'completed' : 'running',
    };

    if (shouldStop) {
      updatedSession.endTime = Date.now();
      updatedSession.stoppingReason = reason;
      calculateStatistics(updatedSession);
    }

    setSession(updatedSession);

    const updatedBank = itemBank.map(item => {
      const usedItem = newItems.find(ni => ni.id === item.id);
      return usedItem || item;
    });
    setItemBank(updatedBank);
  };

  const calculateStatistics = async (completedSession: CATSession) => {
    const finalTheta = completedSession.abilityEstimates[completedSession.abilityEstimates.length - 1];
    const finalSE = completedSession.standardErrors[completedSession.standardErrors.length - 1];
    const totalItems = completedSession.items.length;
    const testDuration = (completedSession.endTime! - completedSession.startTime) / 1000;

    const catInfo = completedSession.informationValues[completedSession.informationValues.length - 1];
    const efficiency = calculateTestEfficiency(catInfo, totalItems);

    const averageInformation = catInfo / totalItems;
    const measurementPrecision = calculateMeasurementPrecision(finalSE);

    const exposureCounts = completedSession.items.map(item => item.exposureCount);
    const meanExposure = exposureCounts.reduce((sum, c) => sum + c, 0) / exposureCounts.length;
    const maxExposure = Math.max(...exposureCounts);
    const varianceExposure = exposureCounts.reduce((sum, c) => sum + Math.pow(c - meanExposure, 2), 0) / exposureCounts.length;
    const sdExposure = Math.sqrt(varianceExposure);

    const contentBalance: { [category: string]: number } = {};
    completedSession.items.forEach(item => {
      const cat = item.contentCategory || 'General';
      contentBalance[cat] = (contentBalance[cat] || 0) + 1;
    });

    const stats: CATStatistics = {
      finalTheta,
      finalSE,
      totalItems,
      testDuration,
      efficiency,
      averageInformation,
      measurementPrecision,
      itemExposureStats: {
        mean: meanExposure,
        max: maxExposure,
        sd: sdExposure,
      },
      contentBalance,
    };

    setStatistics(stats);
    await saveSessionToDatabase(completedSession, stats);
    setView('results');
  };

  const saveSessionToDatabase = async (completedSession: CATSession, stats: CATStatistics) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const sessionData = {
        user_id: user.id,
        item_bank_id: currentItemBankId,
        configuration: settings,
        final_theta: stats.finalTheta,
        final_se: stats.finalSE,
        total_items: stats.totalItems,
        test_duration: stats.testDuration,
        stopping_reason: completedSession.stoppingReason,
        status: 'completed',
        started_at: new Date(completedSession.startTime).toISOString(),
        completed_at: new Date(completedSession.endTime!).toISOString(),
      };

      const { data: savedSession, error: sessionError } = await supabase
        .from('cat_sessions')
        .insert(sessionData)
        .select()
        .single();

      if (sessionError) throw sessionError;

      setCurrentSessionId(savedSession.id);

      const responsesData = completedSession.items.map((item, idx) => ({
        session_id: savedSession.id,
        item_id: item.id,
        item_number: idx + 1,
        response: completedSession.responses[idx],
        theta_before: completedSession.abilityEstimates[idx],
        theta_after: completedSession.abilityEstimates[idx + 1],
        se_before: completedSession.standardErrors[idx],
        se_after: completedSession.standardErrors[idx + 1],
        information: completedSession.informationValues[idx + 1],
        response_time: 0,
      }));

      const { error: responsesError } = await supabase
        .from('cat_session_responses')
        .insert(responsesData);

      if (responsesError) throw responsesError;

      setSuccess('Session saved successfully');
    } catch (err: any) {
      console.error('Failed to save session:', err);
      setError(`Failed to save session: ${err.message}`);
    }
  };

  const loadSessionHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: sessions, error } = await supabase
        .from('cat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Attach bank names (the old nested select 'cat_item_banks(name)')
      const bankIds = [...new Set((sessions || []).map((s: any) => s.item_bank_id).filter(Boolean))];
      let banksById: Record<string, { name: string }> = {};
      if (bankIds.length) {
        const { data: banks } = await supabase.from('cat_item_banks').select('*').in('id', bankIds);
        banksById = Object.fromEntries((banks || []).map((b: any) => [b.id, { name: b.name }]));
      }
      const withBanks = (sessions || []).map((s: any) => ({ ...s, cat_item_banks: banksById[s.item_bank_id] ?? null }));

      setSessionHistory(withBanks);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (view === 'history') {
      loadSessionHistory();
    }
  }, [view]);

  const resetCAT = () => {
    setSession({
      items: [],
      responses: [],
      abilityEstimates: [],
      standardErrors: [],
      informationValues: [],
      currentItem: 0,
      status: 'idle',
      startTime: 0,
    });
    setStatistics(null);
    setView('home');
  };

  const handleExport = (format: 'pdf' | 'csv' | 'json' | 'html') => {
    if (!statistics || !session) return;

    const exportData = {
      session,
      statistics,
      settings,
    };

    switch (format) {
      case 'pdf':
        exportResultsToPDF(exportData, 'CAT_Session_Results');
        break;
      case 'csv':
        const csvData = session.items.map((item, idx) => ({
          itemNumber: idx + 1,
          itemId: item.id,
          itemContent: item.content,
          aParam: item.a,
          bParam: item.b,
          cParam: item.c,
          response: session.responses[idx],
          thetaBefore: session.abilityEstimates[idx].toFixed(3),
          thetaAfter: session.abilityEstimates[idx + 1].toFixed(3),
          seBefore: session.standardErrors[idx].toFixed(3),
          seAfter: session.standardErrors[idx + 1].toFixed(3),
          information: session.informationValues[idx + 1].toFixed(3),
        }));
        exportToCSV(csvData, 'CAT_Item_Level_Data');
        break;
      case 'json':
        exportToJSON(exportData, 'CAT_Complete_Session');
        break;
      case 'html':
        exportDetailedHTMLReport(session, statistics, settings);
        break;
    }
  };

  const exportItemBank = (format: 'csv' | 'json') => {
    const bankData = itemBank.map(item => ({
      id: item.id,
      content: item.content,
      aParam: item.a,
      bParam: item.b,
      cParam: item.c,
      contentCategory: item.contentCategory,
      exposureCount: item.exposureCount,
    }));

    if (format === 'csv') {
      exportToCSV(bankData, `ItemBank_${itemBankName.replace(/\s+/g, '_')}`);
    } else {
      exportToJSON({ name: itemBankName, items: bankData }, `ItemBank_${itemBankName.replace(/\s+/g, '_')}`);
    }
  };

  const exportDetailedHTMLReport = (
    session: CATSession,
    stats: CATStatistics,
    config: typeof settings
  ) => {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CAT Session Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f9fafb;
      color: #1f2937;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding: 30px;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      color: white;
      border-radius: 12px;
    }
    h1 { margin: 0; font-size: 32px; }
    h2 { color: #1f2937; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; margin-top: 40px; }
    h3 { color: #374151; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin: 30px 0;
    }
    .metric-card {
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-left: 4px solid #3b82f6;
    }
    .metric-label { font-size: 14px; color: #6b7280; margin-bottom: 8px; }
    .metric-value { font-size: 36px; font-weight: bold; color: #1f2937; }
    .metric-unit { font-size: 14px; color: #9ca3af; margin-top: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      margin: 20px 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    th {
      background: #f3f4f6;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #374151;
    }
    td {
      padding: 12px;
      border-top: 1px solid #e5e7eb;
    }
    tr:hover { background: #f9fafb; }
    .config-section {
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin: 20px 0;
    }
    .config-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    .config-item { padding: 8px; background: #f9fafb; border-radius: 6px; }
    .config-label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
    .config-value { font-weight: 600; color: #1f2937; }
    .good { color: #10b981; font-weight: 600; }
    .warning { color: #f59e0b; font-weight: 600; }
    .poor { color: #ef4444; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Computerized Adaptive Testing Report</h1>
    <p style="margin-top: 10px; font-size: 18px;">Session Completed: ${new Date().toLocaleDateString()}</p>
  </div>

  <h2>Executive Summary</h2>
  <div class="summary-grid">
    <div class="metric-card">
      <div class="metric-label">Final Ability (θ)</div>
      <div class="metric-value">${stats.finalTheta.toFixed(3)}</div>
      <div class="metric-unit">SE = ${stats.finalSE.toFixed(3)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Items Administered</div>
      <div class="metric-value">${stats.totalItems}</div>
      <div class="metric-unit">of ${config.maxItems} maximum</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Test Efficiency</div>
      <div class="metric-value">${stats.efficiency.toFixed(1)}%</div>
      <div class="metric-unit">vs fixed-form</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Test Duration</div>
      <div class="metric-value">${stats.testDuration.toFixed(1)}</div>
      <div class="metric-unit">seconds</div>
    </div>
  </div>

  <h2>Item-Level Analysis</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Item ID</th>
        <th>Response</th>
        <th>θ Before</th>
        <th>θ After</th>
        <th>SE After</th>
        <th>Information</th>
        <th>a</th>
        <th>b</th>
        <th>c</th>
      </tr>
    </thead>
    <tbody>
      ${session.items.map((item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${item.id}</td>
          <td class="${session.responses[idx] === 1 ? 'good' : 'poor'}">${session.responses[idx] === 1 ? 'Correct' : 'Incorrect'}</td>
          <td>${session.abilityEstimates[idx].toFixed(3)}</td>
          <td>${session.abilityEstimates[idx + 1].toFixed(3)}</td>
          <td>${session.standardErrors[idx + 1].toFixed(3)}</td>
          <td>${session.informationValues[idx + 1].toFixed(3)}</td>
          <td>${item.a.toFixed(2)}</td>
          <td>${item.b.toFixed(2)}</td>
          <td>${item.c.toFixed(2)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>Performance Metrics</h2>
  <div class="summary-grid">
    <div class="metric-card">
      <div class="metric-label">Average Information</div>
      <div class="metric-value">${stats.averageInformation.toFixed(3)}</div>
      <div class="metric-unit">per item</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Measurement Precision</div>
      <div class="metric-value">${stats.measurementPrecision.toFixed(2)}</div>
      <div class="metric-unit">1 / SE</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Mean Exposure</div>
      <div class="metric-value">${stats.itemExposureStats.mean.toFixed(2)}</div>
      <div class="metric-unit">SD = ${stats.itemExposureStats.sd.toFixed(2)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Stopping Reason</div>
      <div class="metric-value" style="font-size: 16px;">${session.stoppingReason}</div>
    </div>
  </div>

  <h2>Configuration</h2>
  <div class="config-section">
    <div class="config-grid">
      <div class="config-item">
        <div class="config-label">Selection Method</div>
        <div class="config-value">${config.selectionMethod.toUpperCase()}</div>
      </div>
      <div class="config-item">
        <div class="config-label">Ability Estimation</div>
        <div class="config-value">${config.abilityEstimation.toUpperCase()}</div>
      </div>
      <div class="config-item">
        <div class="config-label">Stopping Rule</div>
        <div class="config-value">${config.stoppingRule}</div>
      </div>
      <div class="config-item">
        <div class="config-label">SE Threshold</div>
        <div class="config-value">${config.seThreshold}</div>
      </div>
      <div class="config-item">
        <div class="config-label">Starting Ability</div>
        <div class="config-value">${config.startingAbility}</div>
      </div>
      <div class="config-item">
        <div class="config-label">Exposure Control</div>
        <div class="config-value">${config.exposureControl ? 'Enabled' : 'Disabled'}</div>
      </div>
    </div>
  </div>

  <div style="margin-top: 60px; padding: 20px; background: #f3f4f6; border-radius: 12px; text-align: center; color: #6b7280; font-size: 14px;">
    <p>Generated by PsychTrix CAT System | ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
    `;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CAT_Detailed_Report_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getCurrentItem = (): ItemBankItem | null => {
    if (session.status !== 'running') return null;

    if (session.currentItem >= session.items.length) {
      const currentTheta = session.abilityEstimates[session.abilityEstimates.length - 1];
      const currentSE = session.standardErrors[session.standardErrors.length - 1];
      const unusedItems = itemBank.filter(item => !session.items.find(si => si.id === item.id));

      try {
        const nextItem = selectNextItem(currentTheta, currentSE, unusedItems);
        setSession({
          ...session,
          items: [...session.items, { ...nextItem }],
        });
        return nextItem;
      } catch (err: any) {
        setError(err.message);
        return null;
      }
    }

    return session.items[session.currentItem];
  };

  const currentItem = getCurrentItem();

  if (view === 'results' && statistics) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">CAT Session Results</h3>
            <p className="text-gray-600 mt-1">Comprehensive test statistics and performance metrics</p>
          </div>
          <button
            onClick={resetCAT}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            <RotateCcw className="w-4 h-4" />
            New Session
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
            <div className="flex items-center gap-3 mb-2">
              <Target className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Final Ability (θ)</p>
                <p className="text-3xl font-bold text-gray-900">{statistics.finalTheta.toFixed(3)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2">SE = {statistics.finalSE.toFixed(3)}</p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
            <div className="flex items-center gap-3 mb-2">
              <Hash className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Items Used</p>
                <p className="text-3xl font-bold text-gray-900">{statistics.totalItems}</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2">{session.stoppingReason}</p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Efficiency</p>
                <p className="text-3xl font-bold text-gray-900">{statistics.efficiency.toFixed(1)}%</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2">vs fixed-form</p>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600">Duration</p>
                <p className="text-3xl font-bold text-gray-900">{statistics.testDuration.toFixed(1)}s</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2">{(statistics.testDuration / statistics.totalItems).toFixed(1)}s per item</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Ability Estimate Trajectory</h4>
          <Line
            ref={chartRef}
            data={{
              labels: session.abilityEstimates.map((_, idx) => `Item ${idx}`),
              datasets: [
                {
                  label: 'θ Estimate',
                  data: session.abilityEstimates,
                  borderColor: 'rgb(59, 130, 246)',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  borderWidth: 3,
                  tension: 0.3,
                  fill: true,
                },
                {
                  label: 'Upper 95% CI',
                  data: session.abilityEstimates.map((theta, idx) => theta + 1.96 * session.standardErrors[idx]),
                  borderColor: 'rgba(59, 130, 246, 0.3)',
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderDash: [5, 5],
                  pointRadius: 0,
                  tension: 0.3,
                },
                {
                  label: 'Lower 95% CI',
                  data: session.abilityEstimates.map((theta, idx) => theta - 1.96 * session.standardErrors[idx]),
                  borderColor: 'rgba(59, 130, 246, 0.3)',
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderDash: [5, 5],
                  pointRadius: 0,
                  tension: 0.3,
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  position: 'top' as const,
                },
              },
              scales: {
                y: {
                  title: {
                    display: true,
                    text: 'Ability (θ)',
                  },
                },
              },
            }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-4">Standard Error Convergence</h4>
            <Line
              data={{
                labels: session.standardErrors.map((_, idx) => `Item ${idx}`),
                datasets: [
                  {
                    label: 'SE',
                    data: session.standardErrors,
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                  },
                  {
                    label: 'SE Threshold',
                    data: Array(session.standardErrors.length).fill(settings.seThreshold),
                    borderColor: 'rgb(34, 197, 94)',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                },
                scales: {
                  y: {
                    title: {
                      display: true,
                      text: 'Standard Error',
                    },
                    min: 0,
                  },
                },
              }}
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-4">Test Information Accumulation</h4>
            <Line
              ref={infoChartRef}
              data={{
                labels: session.informationValues.map((_, idx) => `Item ${idx}`),
                datasets: [
                  {
                    label: 'Cumulative Information',
                    data: session.informationValues,
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                },
                scales: {
                  y: {
                    title: {
                      display: true,
                      text: 'Information',
                    },
                    min: 0,
                  },
                },
              }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Performance Metrics</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Average Information</p>
              <p className="text-2xl font-bold text-gray-900">{statistics.averageInformation.toFixed(3)}</p>
              <p className="text-xs text-gray-500 mt-1">per item</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Measurement Precision</p>
              <p className="text-2xl font-bold text-gray-900">{statistics.measurementPrecision.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">1 / SE</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Item Pool Usage</p>
              <p className="text-2xl font-bold text-gray-900">{((statistics.totalItems / itemBank.length) * 100).toFixed(1)}%</p>
              <p className="text-xs text-gray-500 mt-1">{statistics.totalItems} of {itemBank.length}</p>
            </div>
          </div>
        </div>

        {settings.exposureControl && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-600" />
              Item Exposure Statistics
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Mean Exposure</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.itemExposureStats.mean.toFixed(2)}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Max Exposure</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.itemExposureStats.max}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Exposure SD</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.itemExposureStats.sd.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        {settings.contentBalancing && Object.keys(statistics.contentBalance).length > 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-600" />
              Content Balance
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(statistics.contentBalance).map(([category, count]) => (
                <div key={category} className="p-3 bg-purple-50 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">{category}</p>
                  <p className="text-xl font-bold text-gray-900">{count}</p>
                  <p className="text-xs text-gray-500">({((count / statistics.totalItems) * 100).toFixed(1)}%)</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Item-Level Detailed Analysis</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">#</th>
                  <th className="text-left py-2 px-3">Item ID</th>
                  <th className="text-center py-2 px-3">Response</th>
                  <th className="text-right py-2 px-3">θ Before</th>
                  <th className="text-right py-2 px-3">θ After</th>
                  <th className="text-right py-2 px-3">SE Before</th>
                  <th className="text-right py-2 px-3">SE After</th>
                  <th className="text-right py-2 px-3">Info</th>
                  <th className="text-right py-2 px-3">a</th>
                  <th className="text-right py-2 px-3">b</th>
                  <th className="text-right py-2 px-3">c</th>
                </tr>
              </thead>
              <tbody>
                {session.items.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{idx + 1}</td>
                    <td className="py-2 px-3 text-xs">{item.id.substring(0, 8)}...</td>
                    <td className={`py-2 px-3 text-center font-semibold ${
                      session.responses[idx] === 1 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {session.responses[idx] === 1 ? '✓' : '✗'}
                    </td>
                    <td className="py-2 px-3 text-right">{session.abilityEstimates[idx].toFixed(3)}</td>
                    <td className="py-2 px-3 text-right font-semibold">{session.abilityEstimates[idx + 1].toFixed(3)}</td>
                    <td className="py-2 px-3 text-right">{session.standardErrors[idx].toFixed(3)}</td>
                    <td className="py-2 px-3 text-right font-semibold">{session.standardErrors[idx + 1].toFixed(3)}</td>
                    <td className="py-2 px-3 text-right">{session.informationValues[idx + 1].toFixed(3)}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{item.a.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{item.b.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{item.c.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-4">Item Characteristic Curves</h4>
            <Scatter
              data={{
                datasets: session.items.slice(0, 5).map((item, idx) => {
                  const thetaRange = [];
                  const probabilities = [];
                  for (let theta = -4; theta <= 4; theta += 0.1) {
                    thetaRange.push(theta);
                    probabilities.push(irt3pl(theta, item.a, item.b, item.c));
                  }
                  return {
                    label: `Item ${idx + 1} (b=${item.b.toFixed(2)})`,
                    data: thetaRange.map((t, i) => ({ x: t, y: probabilities[i] })),
                    showLine: true,
                    pointRadius: 0,
                    borderWidth: 2,
                    tension: 0.4,
                  };
                }),
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                  title: {
                    display: true,
                    text: 'First 5 Items',
                  },
                },
                scales: {
                  x: {
                    title: {
                      display: true,
                      text: 'Ability (θ)',
                    },
                    min: -4,
                    max: 4,
                  },
                  y: {
                    title: {
                      display: true,
                      text: 'P(Correct)',
                    },
                    min: 0,
                    max: 1,
                  },
                },
              }}
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-4">Test Information Function</h4>
            <Line
              data={{
                labels: Array.from({ length: 81 }, (_, i) => (-4 + i * 0.1).toFixed(1)),
                datasets: [
                  {
                    label: 'Total Information',
                    data: Array.from({ length: 81 }, (_, i) => {
                      const theta = -4 + i * 0.1;
                      return session.items.reduce((sum, item) => {
                        return sum + calculateInformation(theta, item.a, item.b, item.c);
                      }, 0);
                    }),
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                },
                scales: {
                  x: {
                    title: {
                      display: true,
                      text: 'Ability (θ)',
                    },
                  },
                  y: {
                    title: {
                      display: true,
                      text: 'Information',
                    },
                    min: 0,
                  },
                },
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleExport('html')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Detailed HTML Report
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Item Data CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Complete JSON
          </button>
        </div>
      </div>
    );
  }

  if (view === 'history') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Session History</h3>
            <p className="text-gray-600 mt-1">Review previous CAT sessions</p>
          </div>
          <button
            onClick={() => setView('home')}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            Back
          </button>
        </div>

        {sessionHistory.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Database className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600 text-lg">No session history yet</p>
            <p className="text-gray-500 text-sm mt-2">Complete a CAT session to see it here</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Item Bank</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Final θ</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">SE</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Items</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Duration</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Stopping Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionHistory.map((sess) => (
                    <tr key={sess.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        {new Date(sess.completed_at).toLocaleDateString()}{' '}
                        {new Date(sess.completed_at).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-4">{sess.cat_item_banks?.name || 'Unknown'}</td>
                      <td className="py-3 px-4 text-right font-semibold">{parseFloat(sess.final_theta).toFixed(3)}</td>
                      <td className="py-3 px-4 text-right">{parseFloat(sess.final_se).toFixed(3)}</td>
                      <td className="py-3 px-4 text-right">{sess.total_items}</td>
                      <td className="py-3 px-4 text-right">{parseFloat(sess.test_duration).toFixed(1)}s</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{sess.stopping_reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">Session History</p>
              <p>All completed sessions are automatically saved. Use this history to track performance over time and compare different CAT configurations.</p>
            </div>
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
            <h3 className="text-2xl font-bold text-gray-900">CAT Simulation</h3>
            <p className="text-gray-600 mt-1">Adaptive item selection in progress</p>
          </div>
          <button
            onClick={resetCAT}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Current θ</p>
            <p className="text-2xl font-bold text-gray-900">
              {session.abilityEstimates.length > 0
                ? session.abilityEstimates[session.abilityEstimates.length - 1].toFixed(3)
                : '0.000'}
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Current SE</p>
            <p className="text-2xl font-bold text-gray-900">
              {session.standardErrors.length > 0
                ? session.standardErrors[session.standardErrors.length - 1].toFixed(3)
                : '1.000'}
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Items Given</p>
            <p className="text-2xl font-bold text-gray-900">{session.responses.length}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Items Remaining</p>
            <p className="text-2xl font-bold text-gray-900">
              {Math.max(0, settings.maxItems - session.responses.length)}
            </p>
          </div>
        </div>

        {session.status === 'running' && currentItem && (
          <div className="bg-white rounded-xl border-2 border-blue-500 p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold">
                {session.responses.length + 1}
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-900">Current Item</h4>
                <p className="text-sm text-gray-600">Difficulty (b): {currentItem.b.toFixed(2)}, Discrimination (a): {currentItem.a.toFixed(2)}</p>
              </div>
            </div>

            <div className="mb-8">
              <p className="text-lg text-gray-800">{currentItem.content}</p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => respondToItem(1)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-4 rounded-lg transition flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                Correct (1)
              </button>
              <button
                onClick={() => respondToItem(0)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-4 rounded-lg transition flex items-center justify-center gap-2"
              >
                <AlertCircle className="w-5 h-5" />
                Incorrect (0)
              </button>
            </div>
          </div>
        )}

        {session.abilityEstimates.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-lg font-bold text-gray-900 mb-4">Real-Time Ability Trajectory</h4>
            <Line
              data={{
                labels: session.abilityEstimates.map((_, idx) => idx),
                datasets: [
                  {
                    label: 'θ Estimate',
                    data: session.abilityEstimates,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                  },
                ],
              }}
              options={{
                responsive: true,
                animation: {
                  duration: 500,
                },
                scales: {
                  y: {
                    title: {
                      display: true,
                      text: 'Ability (θ)',
                    },
                  },
                  x: {
                    title: {
                      display: true,
                      text: 'Item Number',
                    },
                  },
                },
              }}
            />
          </div>
        )}
      </div>
    );
  }

  if (view === 'itembank') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Item Bank Management</h3>
            <p className="text-gray-600 mt-1">{itemBank.length} items in bank</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportItemBank('csv')}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={() => exportItemBank('json')}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
            >
              <Download className="w-4 h-4" />
              Export JSON
            </button>
            <button
              onClick={() => setView('home')}
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
                placeholder="Enter the item question or statement..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Difficulty (b)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={newItem.b}
                  onChange={(e) => setNewItem({ ...newItem, b: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Guessing (c)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newItem.c}
                  onChange={(e) => setNewItem({ ...newItem, c: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <input
                  type="text"
                  value={newItem.contentCategory}
                  onChange={(e) => setNewItem({ ...newItem, contentCategory: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              onClick={addItemToBank}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Item to Bank
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">Current Item Bank</h4>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b-2 border-gray-200">
                <tr>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700">ID</th>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700">Content</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">a</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">b</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">c</th>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700">Category</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700">Exposures</th>
                </tr>
              </thead>
              <tbody>
                {itemBank.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3 text-gray-600">{item.id}</td>
                    <td className="py-3 px-3 text-gray-900 max-w-md truncate">{item.content}</td>
                    <td className="py-3 px-3 text-right text-gray-700">{item.a.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right text-gray-700">{item.b.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right text-gray-700">{item.c.toFixed(2)}</td>
                    <td className="py-3 px-3 text-gray-700">{item.contentCategory || 'General'}</td>
                    <td className="py-3 px-3 text-right text-gray-700">{item.exposureCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-gray-900">Computerized Adaptive Testing (CAT)</h3>
        <p className="text-gray-600 mt-1">
          Professional CAT simulation with advanced IRT algorithms
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <button
          onClick={() => setView('itembank')}
          className="p-8 bg-white border-2 border-gray-200 hover:border-blue-500 rounded-xl transition group"
        >
          <BarChart3 className="w-16 h-16 text-blue-600 mx-auto mb-4 group-hover:scale-110 transition" />
          <h4 className="text-lg font-bold text-gray-900 mb-2">Item Bank</h4>
          <p className="text-sm text-gray-600">
            Manage your IRT-calibrated item bank ({itemBank.length} items)
          </p>
        </button>

        <button
          onClick={startCAT}
          className="p-8 bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-500 hover:border-blue-600 rounded-xl transition group"
        >
          <Play className="w-16 h-16 text-blue-600 mx-auto mb-4 group-hover:scale-110 transition" />
          <h4 className="text-lg font-bold text-gray-900 mb-2">Start CAT Session</h4>
          <p className="text-sm text-gray-600">
            Begin adaptive testing simulation with current settings
          </p>
        </button>

        <button
          onClick={() => setView('history')}
          className="p-8 bg-white border-2 border-gray-200 hover:border-green-500 rounded-xl transition group"
        >
          <Database className="w-16 h-16 text-green-600 mx-auto mb-4 group-hover:scale-110 transition" />
          <h4 className="text-lg font-bold text-gray-900 mb-2">Session History</h4>
          <p className="text-sm text-gray-600">
            Review and analyze previous CAT sessions
          </p>
        </button>

        <button
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
          className="p-8 bg-white border-2 border-gray-200 hover:border-purple-500 rounded-xl transition group"
        >
          <Settings className="w-16 h-16 text-purple-600 mx-auto mb-4 group-hover:scale-110 transition" />
          <h4 className="text-lg font-bold text-gray-900 mb-2">Advanced Settings</h4>
          <p className="text-sm text-gray-600">
            Configure CAT algorithms and stopping rules
          </p>
        </button>
      </div>

      {showAdvancedOptions && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">CAT Configuration</h4>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Item Selection Method</label>
                <select
                  value={settings.selectionMethod}
                  onChange={(e) => setSettings({ ...settings, selectionMethod: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="mfi">Maximum Fisher Information (MFI)</option>
                  <option value="mpwi">Maximum Posterior Weighted Information (MPWI)</option>
                  <option value="kl">Kullback-Leibler Information (KL)</option>
                  <option value="random">Random (for comparison)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">MFI is most common; MPWI for Bayesian; KL for global</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ability Estimation Method</label>
                <select
                  value={settings.abilityEstimation}
                  onChange={(e) => setSettings({ ...settings, abilityEstimation: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="mle">Maximum Likelihood (MLE)</option>
                  <option value="eap">Expected A Posteriori (EAP)</option>
                  <option value="map">Maximum A Posteriori (MAP)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">MLE is standard; EAP/MAP for Bayesian</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stopping Rule</label>
                <select
                  value={settings.stoppingRule}
                  onChange={(e) => setSettings({ ...settings, stoppingRule: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="se">Standard Error Threshold</option>
                  <option value="fixed">Fixed Length</option>
                  <option value="classification">Classification (Pass/Fail)</option>
                  <option value="combined">Combined (SE + Classification)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">SE Threshold</label>
                <input
                  type="number"
                  step="0.05"
                  value={settings.seThreshold}
                  onChange={(e) => setSettings({ ...settings, seThreshold: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Typical: 0.3 (high precision) to 0.5 (moderate)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Min Items</label>
                <input
                  type="number"
                  value={settings.minItems}
                  onChange={(e) => setSettings({ ...settings, minItems: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Items</label>
                <input
                  type="number"
                  value={settings.maxItems}
                  onChange={(e) => setSettings({ ...settings, maxItems: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Starting Ability (θ₀)</label>
                <input
                  type="number"
                  step="0.5"
                  value={settings.startingAbility}
                  onChange={(e) => setSettings({ ...settings, startingAbility: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Exposure Rate</label>
                <input
                  type="number"
                  step="0.05"
                  value={settings.maxExposureRate}
                  onChange={(e) => setSettings({ ...settings, maxExposureRate: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  disabled={!settings.exposureControl}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 cursor-pointer p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                <input
                  type="checkbox"
                  checked={settings.exposureControl}
                  onChange={(e) => setSettings({ ...settings, exposureControl: e.target.checked })}
                  className="rounded"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Item Exposure Control</span>
                  <p className="text-xs text-gray-600">Prevent overuse of specific items</p>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                <input
                  type="checkbox"
                  checked={settings.contentBalancing}
                  onChange={(e) => setSettings({ ...settings, contentBalancing: e.target.checked })}
                  className="rounded"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Content Balancing</span>
                  <p className="text-xs text-gray-600">Maintain proportional content representation</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-gray-200 p-6">
        <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-600" />
          Professional CAT Features
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">4 Selection Algorithms</p>
              <p className="text-xs text-gray-600">MFI, MPWI, KL, Random</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">3 Ability Estimators</p>
              <p className="text-xs text-gray-600">MLE, EAP, MAP</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">4 Stopping Rules</p>
              <p className="text-xs text-gray-600">SE, Fixed, Classification, Combined</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Exposure Control</p>
              <p className="text-xs text-gray-600">Sympson-Hetter method</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Content Balancing</p>
              <p className="text-xs text-gray-600">Proportional representation</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Real-Time Visualization</p>
              <p className="text-xs text-gray-600">Theta trajectory with CI</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Comprehensive Statistics</p>
              <p className="text-xs text-gray-600">Efficiency, precision, exposure</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Export Results</p>
              <p className="text-xs text-gray-600">PDF, CSV, JSON formats</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
