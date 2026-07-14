import Papa from 'papaparse';
import { supabase } from './supabase';

export interface ImportedResponseRow {
  participant_id: string;
  [itemColumn: string]: string | number;
}

export interface ImportResult {
  success: boolean;
  message: string;
  rowsImported?: number;
  itemsIdentified?: string[];
  errors?: string[];
}

export async function importCulturalResponses(
  file: File,
  groupId: string,
  options: {
    participantIdColumn?: string;
    itemPrefix?: string;
    excludeColumns?: string[];
  } = {}
): Promise<ImportResult> {
  const {
    participantIdColumn = 'participant_id',
    itemPrefix = 'Q',
    excludeColumns = []
  } = options;

  try {
    const text = await file.text();

    const parseResult = await new Promise<Papa.ParseResult<ImportedResponseRow>>((resolve, reject) => {
      Papa.parse<ImportedResponseRow>(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: resolve,
        error: reject
      });
    });

    if (parseResult.errors.length > 0) {
      return {
        success: false,
        message: 'CSV parsing errors detected',
        errors: parseResult.errors.map(e => e.message)
      };
    }

    const data = parseResult.data;
    if (data.length === 0) {
      return {
        success: false,
        message: 'No data rows found in CSV file'
      };
    }

    const allColumns = Object.keys(data[0] || {});
    const itemColumns = allColumns.filter(col =>
      col.startsWith(itemPrefix) &&
      !excludeColumns.includes(col) &&
      col !== participantIdColumn
    );

    if (itemColumns.length === 0) {
      return {
        success: false,
        message: `No item columns found with prefix "${itemPrefix}"`
      };
    }

    const responses = data.map(row => {
      const participantId = String(row[participantIdColumn] || '');
      if (!participantId) {
        throw new Error('Participant ID missing in one or more rows');
      }

      const itemResponses: Record<string, number> = {};
      itemColumns.forEach(col => {
        const value = row[col];
        if (typeof value === 'number') {
          itemResponses[col] = value;
        } else if (typeof value === 'string' && !isNaN(parseFloat(value))) {
          itemResponses[col] = parseFloat(value);
        }
      });

      return {
        group_id: groupId,
        participant_id: participantId,
        item_responses: itemResponses,
        metadata: {
          imported_at: new Date().toISOString(),
          source_file: file.name
        }
      };
    });

    const { error } = await supabase
      .from('cultural_responses')
      .insert(responses);

    if (error) {
      return {
        success: false,
        message: `Database error: ${error.message}`
      };
    }

    const { data: group, error: groupError } = await supabase
      .from('cultural_groups')
      .update({
        sample_size: responses.length,
        status: 'active'
      })
      .eq('id', groupId)
      .select()
      .maybeSingle();

    if (groupError) {
      console.warn('Failed to update group sample size:', groupError);
    }

    return {
      success: true,
      message: 'Data imported successfully',
      rowsImported: responses.length,
      itemsIdentified: itemColumns
    };

  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function importTranslationItems(
  file: File,
  targetLanguage: string,
  userId: string
): Promise<ImportResult> {
  try {
    const text = await file.text();

    const parseResult = await new Promise<Papa.ParseResult<any>>((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: resolve,
        error: reject
      });
    });

    if (parseResult.errors.length > 0) {
      return {
        success: false,
        message: 'CSV parsing errors detected',
        errors: parseResult.errors.map(e => e.message)
      };
    }

    const data = parseResult.data;
    if (data.length === 0) {
      return {
        success: false,
        message: 'No data rows found in CSV file'
      };
    }

    const requiredColumns = ['original_text'];
    const optionalColumns = ['forward_translation', 'back_translation', 'translator_name', 'reviewer_name'];

    const columns = Object.keys(data[0] || {});
    const missingRequired = requiredColumns.filter(col => !columns.includes(col));

    if (missingRequired.length > 0) {
      return {
        success: false,
        message: `Missing required columns: ${missingRequired.join(', ')}`
      };
    }

    const translations = data.map((row, index) => ({
      user_id: userId,
      original_text: row.original_text || '',
      target_language: targetLanguage,
      forward_translation: row.forward_translation || '',
      back_translation: row.back_translation || '',
      translator_name: row.translator_name || null,
      reviewer_name: row.reviewer_name || null,
      status: row.back_translation ? 'completed' : 'pending'
    }));

    const { error } = await supabase
      .from('translation_items')
      .insert(translations);

    if (error) {
      return {
        success: false,
        message: `Database error: ${error.message}`
      };
    }

    return {
      success: true,
      message: 'Translation items imported successfully',
      rowsImported: translations.length
    };

  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export function downloadResponseTemplate(itemCount: number = 10) {
  const headers = ['participant_id', ...Array.from({ length: itemCount }, (_, i) => `Q${i + 1}`)];
  const sampleRows = [
    ['P001', ...Array.from({ length: itemCount }, () => Math.floor(Math.random() * 5) + 1)],
    ['P002', ...Array.from({ length: itemCount }, () => Math.floor(Math.random() * 5) + 1)],
    ['P003', ...Array.from({ length: itemCount }, () => Math.floor(Math.random() * 5) + 1)]
  ];

  const csv = [
    headers.join(','),
    ...sampleRows.map(row => row.join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'response_data_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTranslationTemplate() {
  const csv = [
    'original_text,forward_translation,back_translation,translator_name,reviewer_name',
    '"I feel confident in my abilities.","","","",""',
    '"I can handle difficult situations.","","","",""',
    '"I believe in myself.","","",""'
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'translation_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
