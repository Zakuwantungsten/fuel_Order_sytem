import apiClient from './api';

const API_BASE = '/system-admin/cron-jobs';

export type JobStatus = 'idle' | 'running' | 'error' | 'disabled';

export interface JobRunRecord {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  success: boolean;
  message?: string;
}

export interface CronJob {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  isEnabled: boolean;
  status: JobStatus;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'error';
  lastRunDuration?: number;
  nextRunAt?: string;
  runHistory: JobRunRecord[];
}

const cronJobService = {
  list: async (): Promise<CronJob[]> => {
    const res = await apiClient.get(`${API_BASE}`);
    return res.data.data;
  },

  trigger: async (id: string): Promise<JobRunRecord> => {
    const res = await apiClient.post(`${API_BASE}/${id}/trigger`);
    return res.data.data;
  },

  toggle: async (id: string): Promise<CronJob> => {
    const res = await apiClient.patch(`${API_BASE}/${id}/toggle`);
    return res.data.data;
  },
};

export default cronJobService;
