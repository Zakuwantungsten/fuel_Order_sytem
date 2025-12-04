import { useState } from 'react';
import {
  FileText,
  ClipboardList,
  Fuel,
  CheckCircle,
  Filter,
  Download,
  Plus,
} from 'lucide-react';

interface DataManagementTabProps {
  user: any;
  showMessage: (type: 'success' | 'error', message: string) => void;
}

export default function DataManagementTab({ showMessage }: DataManagementTabProps) {
  const [activeSection, setActiveSection] = useState<'do' | 'lpo' | 'fuel'>('do');

  const sections = [
    { id: 'do', label: 'Delivery Orders', icon: FileText, color: 'blue' },
    { id: 'lpo', label: 'LPOs', icon: ClipboardList, color: 'purple' },
    { id: 'fuel', label: 'Fuel Records', icon: Fuel, color: 'orange' },
  ];

  return (
    <div className="space-y-6">
      {/* Section Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeSection === section.id
                    ? `bg-${section.color}-100 dark:bg-${section.color}-900/30 text-${section.color}-700 dark:text-${section.color}-400`
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Data Management</h4>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              View, create, edit, and approve operational data for {activeSection === 'do' ? 'Delivery Orders' : activeSection === 'lpo' ? 'LPOs' : 'Fuel Records'}.
              You have full CRUD permissions but cannot modify system configuration.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => {
              // Navigate to create page
              showMessage('success', 'Redirecting to create page...');
            }}
            className="flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
          >
            <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div className="text-left">
              <p className="font-medium text-indigo-900 dark:text-indigo-100">Create New</p>
              <p className="text-sm text-indigo-700 dark:text-indigo-300">
                Add new {activeSection === 'do' ? 'DO' : activeSection === 'lpo' ? 'LPO' : 'Fuel Record'}
              </p>
            </div>
          </button>

          <button
            onClick={() => {
              showMessage('success', 'Generating report...');
            }}
            className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          >
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            <div className="text-left">
              <p className="font-medium text-green-900 dark:text-green-100">Review Pending</p>
              <p className="text-sm text-green-700 dark:text-green-300">
                View items awaiting approval
              </p>
            </div>
          </button>

          <button
            onClick={() => {
              showMessage('success', 'Preparing export...');
            }}
            className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
          >
            <Download className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <div className="text-left">
              <p className="font-medium text-purple-900 dark:text-purple-100">Export Data</p>
              <p className="text-sm text-purple-700 dark:text-purple-300">
                Download to Excel
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Data Table Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {activeSection === 'do' ? 'Delivery Orders' : activeSection === 'lpo' ? 'LPO Entries' : 'Fuel Records'}
          </h3>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
              <Filter className="w-4 h-4" />
              Filter
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Placeholder for actual data management */}
        <div className="border dark:border-gray-700 rounded-lg p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-2">
            This section would display a full data table with CRUD operations
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Navigate to the respective pages (DO Management, LPO Management, Fuel Records) <br />
            from the main sidebar for full functionality
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              Go to {activeSection === 'do' ? 'DO Management' : activeSection === 'lpo' ? 'LPO Management' : 'Fuel Records'}
            </button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Records</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">0</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Approved</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">0</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Pending</p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">0</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">This Month</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">0</p>
        </div>
      </div>
    </div>
  );
}
