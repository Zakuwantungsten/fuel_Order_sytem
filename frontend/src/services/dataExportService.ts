import apiClient from './api';

const API_BASE = '/system-admin/data-export';

export interface ExportResource {
  id: string;
  label: string;
  description: string;
}

export type ExportFormat = 'json' | 'csv' | 'xlsx';

const dataExportService = {
  listResources: async (): Promise<ExportResource[]> => {
    const res = await apiClient.get(`${API_BASE}/resources`);
    return res.data.data;
  },

  exportData: async (params: {
    resource: string;
    format: ExportFormat;
    from?: string;
    to?: string;
  }): Promise<void> => {
    const res = await apiClient.post(`${API_BASE}`, params, {
      responseType: 'blob',
    });

    const ext = params.format;
    const contentDisposition = res.headers['content-disposition'] ?? '';
    const match = contentDisposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? `${params.resource}_export.${ext}`;

    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

export default dataExportService;
