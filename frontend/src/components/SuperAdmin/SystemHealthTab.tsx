import { useState, useEffect } from 'react';
import { Activity, TrendingUp, Users, Database } from 'lucide-react';
import { systemAdminAPI } from '../../services/api';

interface SystemHealthTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function SystemHealthTab({ onMessage }: SystemHealthTabProps) {
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    loadHealth();
  }, []);

  const loadHealth = async () => {
    try {
      const data = await systemAdminAPI.getDatabaseHealth();
      setHealth(data);
    } catch (error) {
      onMessage('error', 'Failed to load system health');
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        System Health Overview
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Server Status</h4>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
            {health?.healthy ? '✅ Healthy' : '❌ Issues Detected'}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Database</h4>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
            {health?.status || 'Unknown'}
          </p>
        </div>
      </div>
    </div>
  );
}
