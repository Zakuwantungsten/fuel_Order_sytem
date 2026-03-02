import api from './api';

export interface WebhookLog {
  timestamp: string;
  event: string;
  statusCode: number;
  success: boolean;
  error?: string;
  durationMs: number;
}

export interface Webhook {
  _id: string;
  name: string;
  url: string;
  events: string[];
  secret: string;
  isEnabled: boolean;
  headers?: Record<string, string>;
  createdBy: string;
  lastTriggeredAt?: string;
  lastStatus?: 'success' | 'error';
  lastStatusCode?: number;
  failureCount: number;
  logs: WebhookLog[];
  createdAt: string;
  updatedAt: string;
}

const webhookService = {
  list: async (): Promise<Webhook[]> => {
    const res = await api.get('/system-admin/webhooks');
    return res.data.data;
  },

  getEvents: async (): Promise<string[]> => {
    const res = await api.get('/system-admin/webhooks/events');
    return res.data.data;
  },

  create: async (payload: {
    name: string;
    url: string;
    events: string[];
    headers?: Record<string, string>;
  }): Promise<Webhook> => {
    const res = await api.post('/system-admin/webhooks', payload);
    return res.data.data;
  },

  update: async (id: string, payload: Partial<Webhook>): Promise<Webhook> => {
    const res = await api.put(`/system-admin/webhooks/${id}`, payload);
    return res.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/system-admin/webhooks/${id}`);
  },

  test: async (id: string): Promise<{ success: boolean; statusCode: number; durationMs: number; error?: string }> => {
    const res = await api.post(`/system-admin/webhooks/${id}/test`);
    return res.data.data;
  },

  regenerateSecret: async (id: string): Promise<{ secret: string }> => {
    const res = await api.post(`/system-admin/webhooks/${id}/regenerate-secret`);
    return res.data.data;
  },
};

export default webhookService;
