import { supabase } from './supabase';

export interface RAnalysisJob {
  id: string;
  user_id: string;
  job_type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  input_data: any;
  r_script?: string;
  output_data?: any;
  output_images?: string[];
  error_message?: string;
  execution_time?: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface RAnalysisTemplate {
  id: string;
  template_name: string;
  job_type: string;
  description: string;
  required_packages: string[];
  parameters_schema: any;
  version: string;
}

export interface SubmitJobParams {
  jobType: string;
  inputData: any;
  parameters?: Record<string, any>;
  useCache?: boolean;
}

export interface JobStatusUpdate {
  jobId: string;
  status: RAnalysisJob['status'];
  output_data?: any;
  output_images?: string[];
  error_message?: string;
}

export class RAnalysisClient {
  private async generateCacheKey(jobType: string, inputData: any, parameters: any): Promise<string> {
    const payload = JSON.stringify({ jobType, inputData, parameters });
    const msgBuffer = new TextEncoder().encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async submitJob(params: SubmitJobParams): Promise<{ success: boolean; jobId?: string; cached?: boolean; data?: any; images?: any[] }> {
    try {
      const { jobType, inputData, parameters = {}, useCache = true } = params;

      const cacheKey = useCache ? await this.generateCacheKey(jobType, inputData, parameters) : undefined;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r-analysis-executor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            jobType,
            inputData,
            parameters,
            cacheKey,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to submit job: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error: any) {
      console.error('Error submitting R analysis job:', error);
      throw error;
    }
  }

  async getJobStatus(jobId: string): Promise<RAnalysisJob | null> {
    try {
      const { data, error } = await supabase
        .from('r_analysis_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching job status:', error);
      return null;
    }
  }

  async getUserJobs(limit: number = 50): Promise<RAnalysisJob[]> {
    try {
      const { data, error } = await supabase
        .from('r_analysis_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user jobs:', error);
      return [];
    }
  }

  async getTemplates(): Promise<RAnalysisTemplate[]> {
    try {
      const { data, error } = await supabase
        .from('r_analysis_templates')
        .select('*')
        .order('job_type');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching templates:', error);
      return [];
    }
  }

  async getJobLogs(jobId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('r_analysis_logs')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching job logs:', error);
      return [];
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('r_analysis_jobs')
        .update({ status: 'cancelled' })
        .eq('id', jobId)
        .eq('status', 'queued');

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error cancelling job:', error);
      return false;
    }
  }

  subscribeToJobUpdates(jobId: string, callback: (update: JobStatusUpdate) => void) {
    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'r_analysis_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const job = payload.new as RAnalysisJob;
          callback({
            jobId: job.id,
            status: job.status,
            output_data: job.output_data,
            output_images: job.output_images,
            error_message: job.error_message,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  async generateReport(jobId: string, reportType: 'pdf' | 'html' | 'rmarkdown'): Promise<string | null> {
    try {
      const job = await this.getJobStatus(jobId);
      if (!job || job.status !== 'completed') {
        throw new Error('Job must be completed to generate report');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const reportContent = this.formatReportContent(job, reportType);

      const { data, error } = await supabase
        .from('r_analysis_reports')
        .insert({
          user_id: user.id,
          job_id: jobId,
          report_type: reportType,
          report_content: reportContent,
          metadata: {
            job_type: job.job_type,
            execution_time: job.execution_time,
            generated_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error('Error generating report:', error);
      return null;
    }
  }

  private formatReportContent(job: RAnalysisJob, reportType: string): string {
    if (reportType === 'html') {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>R Analysis Report - ${job.job_type}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #2563eb; }
            .metadata { background: #f3f4f6; padding: 20px; margin: 20px 0; }
            .results { margin: 20px 0; }
            pre { background: #1f2937; color: #f3f4f6; padding: 15px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>${job.job_type.toUpperCase()} Analysis Report</h1>

          <div class="metadata">
            <h2>Analysis Metadata</h2>
            <p><strong>Job ID:</strong> ${job.id}</p>
            <p><strong>Created:</strong> ${new Date(job.created_at).toLocaleString()}</p>
            <p><strong>Execution Time:</strong> ${job.execution_time?.toFixed(2)}s</p>
            <p><strong>Status:</strong> ${job.status}</p>
          </div>

          <div class="results">
            <h2>Results</h2>
            <pre>${JSON.stringify(job.output_data, null, 2)}</pre>
          </div>

          ${job.output_images && job.output_images.length > 0 ? `
            <div class="visualizations">
              <h2>Visualizations</h2>
              ${job.output_images.map((img: string, idx: number) => `
                <div>
                  <h3>Figure ${idx + 1}</h3>
                  <img src="${img}" alt="Visualization ${idx + 1}" style="max-width: 100%; height: auto;" />
                </div>
              `).join('')}
            </div>
          ` : ''}

          <div class="footer">
            <p><em>Generated by PsychtrixWeb R Analysis Engine</em></p>
            <p><em>Report generated on ${new Date().toLocaleString()}</em></p>
          </div>
        </body>
        </html>
      `;
    }

    return JSON.stringify(job, null, 2);
  }

  async pollJobUntilComplete(
    jobId: string,
    onProgress?: (job: RAnalysisJob) => void,
    maxWaitMs: number = 300000
  ): Promise<RAnalysisJob | null> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < maxWaitMs) {
      const job = await this.getJobStatus(jobId);

      if (!job) return null;

      if (onProgress) onProgress(job);

      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return job;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return null;
  }
}

export const rAnalysisClient = new RAnalysisClient();
