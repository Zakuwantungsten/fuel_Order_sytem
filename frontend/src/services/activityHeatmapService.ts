import api from './api';

export interface HeatmapData {
  hours: { hour: number; count: number }[];
  weekdays: { day: number; label: string; count: number }[];
  topUsers: { username: string; count: number }[];
  topActions: { action: string; count: number }[];
  total: number;
  days: number;
}

const activityHeatmapService = {
  get: async (days = 30): Promise<HeatmapData> => {
    const res = await api.get('/system-admin/activity-heatmap', { params: { days } });
    return res.data.data;
  },
};

export default activityHeatmapService;
