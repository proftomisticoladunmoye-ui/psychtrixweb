import { supabase } from './supabase';

export interface AnalysisHistoryEntry {
  id?: string;
  user_id?: string;
  analysis_type: 'ctt' | 'irt' | 'efa' | 'cfa' | 'sem' | 'path' | 'mediation' | 'invariance' | 'multigroup' | 'content_validity' | 'cvr' | 'cvi' | 'cat' | 'plssem' | 'cultural_adaptation';
  analysis_name: string;
  dataset_id?: string | null;
  dataset_name?: string | null;
  configuration: any;
  results: any;
  status?: 'completed' | 'failed' | 'partial';
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function saveAnalysisHistory(entry: AnalysisHistoryEntry): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const record = {
      user_id: user.id,
      analysis_type: entry.analysis_type,
      analysis_name: entry.analysis_name,
      dataset_id: entry.dataset_id,
      dataset_name: entry.dataset_name,
      configuration: entry.configuration,
      results: entry.results,
      status: entry.status || 'completed',
      error_message: entry.error_message
    };

    const { data, error } = await supabase
      .from('analysis_history')
      .insert(record)
      .select()
      .single();

    if (error) throw error;

    return { success: true, id: data.id };
  } catch (error: any) {
    console.error('Error saving analysis history:', error);
    return { success: false, error: error.message };
  }
}

export async function loadAnalysisHistory(filters?: {
  analysis_type?: string;
  limit?: number;
}): Promise<{ success: boolean; data?: AnalysisHistoryEntry[]; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    let query = supabase
      .from('analysis_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (filters?.analysis_type) {
      query = query.eq('analysis_type', filters.analysis_type);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error loading analysis history:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteAnalysisHistory(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('analysis_history')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting analysis history:', error);
    return { success: false, error: error.message };
  }
}

export async function getAnalysisHistory(id: string): Promise<{ success: boolean; data?: AnalysisHistoryEntry; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('analysis_history')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (error: any) {
    console.error('Error getting analysis history:', error);
    return { success: false, error: error.message };
  }
}
