import apiClient from './api';

export interface SystemHealth {
  timestamp: string;
  process: {
    uptimeSeconds: number;
    // Omitted by the backend by design (fingerprint defense) — optional here.
    nodeVersion?: string;
    platform?: string;
    pid?: number;
    memory: {
      heapUsedMB: number;
      heapTotalMB: number;
      // Real V8 heap ceiling (--max-old-space-size). Use this, not heapTotal,
      // for "how close are we to OOM".
      heapLimitMB: number;
      rssMB: number;
      externalMB: number;
    };
  };
  database: {
    status: string;
    connections: { current: number; available: number; totalCreated: number } | null;
    storage: { dataSize: number; storageSize: number; indexSize: number } | null;
    collections: number | null;
  };
  sessions: { active: number };
  jobs: {
    total: number;
    enabled: number;
    running: number;
    list: { id: string; name: string; status: string; isEnabled: boolean; lastRunAt?: string; lastRunStatus?: string }[];
  };
}

const systemHealthService = {
  get: async (): Promise<SystemHealth> => {
    const res = await apiClient.get('/system-admin/system-health');
    return res.data.data;
  },
};

export default systemHealthService;
