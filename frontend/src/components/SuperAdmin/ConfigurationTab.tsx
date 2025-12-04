import { useState } from 'react';
import { Settings } from 'lucide-react';
import { adminAPI } from '../../services/api';

interface ConfigurationTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function ConfigurationTab({ onMessage }: ConfigurationTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="w-6 h-6 text-purple-600 dark:text-purple-400" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          System Configuration
        </h2>
      </div>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <p className="text-gray-600 dark:text-gray-300">
          Configuration management coming soon. Use the existing Admin Dashboard for fuel stations, routes, and allocations.
        </p>
      </div>
    </div>
  );
}
