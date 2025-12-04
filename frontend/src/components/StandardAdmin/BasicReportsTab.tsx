import { useState } from 'react';
import {
  TrendingUp,
  Download,
  Calendar,
  FileText,
  BarChart3,
  PieChart,
  Users,
  Fuel,
} from 'lucide-react';

interface BasicReportsTabProps {
  user: any;
  showMessage: (type: 'success' | 'error', message: string) => void;
}

export default function BasicReportsTab({ showMessage }: BasicReportsTabProps) {
  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const handleGenerateReport = () => {
    showMessage('success', 'Generating report... This will be available for download shortly.');
  };

  const handleExport = (format: 'excel' | 'pdf' | 'csv') => {
    showMessage('success', `Exporting report as ${format.toUpperCase()}...`);
  };

  const reportTypes = [
    {
      id: 'daily',
      label: 'Daily Summary',
      description: 'Daily operational summary',
      icon: Calendar,
      color: 'blue',
    },
    {
      id: 'weekly',
      label: 'Weekly Report',
      description: 'Week-over-week analysis',
      icon: BarChart3,
      color: 'green',
    },
    {
      id: 'monthly',
      label: 'Monthly Report',
      description: 'Monthly performance metrics',
      icon: TrendingUp,
      color: 'purple',
    },
  ];

  const availableReports = [
    {
      name: 'Delivery Orders Summary',
      description: 'Complete DO statistics and trends',
      icon: FileText,
      color: 'blue',
    },
    {
      name: 'LPO Activity Report',
      description: 'LPO creation and fulfillment metrics',
      icon: PieChart,
      color: 'purple',
    },
    {
      name: 'Fuel Consumption Report',
      description: 'Fuel usage and allocation analysis',
      icon: Fuel,
      color: 'orange',
    },
    {
      name: 'User Activity Report',
      description: 'System usage and user engagement',
      icon: Users,
      color: 'green',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Report Type Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Select Report Type
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {reportTypes.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.id}
                onClick={() => setReportType(type.id as any)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  reportType === type.id
                    ? `border-${type.color}-500 bg-${type.color}-50 dark:bg-${type.color}-900/20`
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Icon className={`w-8 h-8 mb-3 ${
                  reportType === type.id
                    ? `text-${type.color}-600 dark:text-${type.color}-400`
                    : 'text-gray-400'
                }`} />
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                  {type.label}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {type.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Date Range Selection */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Date Range
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleGenerateReport}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            Generate Report
          </button>
          <button
            onClick={() => {
              const today = new Date().toISOString().split('T')[0];
              setDateRange({ startDate: today, endDate: today });
            }}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Today
          </button>
          <button
            onClick={() => {
              const today = new Date();
              const weekAgo = new Date(today);
              weekAgo.setDate(weekAgo.getDate() - 7);
              setDateRange({
                startDate: weekAgo.toISOString().split('T')[0],
                endDate: today.toISOString().split('T')[0],
              });
            }}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Last 7 Days
          </button>
          <button
            onClick={() => {
              const today = new Date();
              const monthAgo = new Date(today);
              monthAgo.setMonth(monthAgo.getMonth() - 1);
              setDateRange({
                startDate: monthAgo.toISOString().split('T')[0],
                endDate: today.toISOString().split('T')[0],
              });
            }}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Last 30 Days
          </button>
        </div>
      </div>

      {/* Available Reports */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Available Reports
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableReports.map((report) => {
            const Icon = report.icon;
            return (
              <div
                key={report.name}
                className="p-4 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg bg-${report.color}-100 dark:bg-${report.color}-900/30`}>
                    <Icon className={`w-5 h-5 text-${report.color}-600 dark:text-${report.color}-400`} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                      {report.name}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {report.description}
                    </p>
                    <button
                      onClick={handleGenerateReport}
                      className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                    >
                      Generate →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Export Options */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          Export Options
        </h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleExport('excel')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Download className="w-4 h-4" />
            Export to Excel
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <Download className="w-4 h-4" />
            Export to PDF
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Download className="w-4 h-4" />
            Export to CSV
          </button>
        </div>
      </div>

      {/* Recent Reports */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Recent Reports
        </h3>
        <div className="text-center py-8">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No reports generated yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Generate your first report to see it here
          </p>
        </div>
      </div>
    </div>
  );
}
