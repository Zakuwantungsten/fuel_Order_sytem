import api from './api';

export interface MaintenanceStatus {
  enabled: boolean;
  message: string;
  allowedRoles: string[];
  scheduledStart?: string;
  scheduledEnd?: string;
}

const maintenanceModeService = {
  getStatus: async (): Promise<MaintenanceStatus> => {
    const res = await api.get('/admin/maintenance-mode/status');
    return res.data.data;
  },

  toggle: async (): Promise<MaintenanceStatus> => {
    const res = await api.post('/admin/maintenance-mode/toggle');
    return res.data.data;
  },

  updateMessage: async (message: string, allowedRoles: string[]): Promise<MaintenanceStatus> => {
    const res = await api.put('/system-config/settings/maintenance', {
      maintenance: { message, allowedRoles },
    });
    return res.data.data?.maintenance ?? res.data.data;
  },
};

export default maintenanceModeService;
