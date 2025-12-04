import {
  FileText,
  ClipboardList,
  Fuel,
  CheckCircle,
  TruckIcon,
  Zap,
  Clock,
  AlertCircle,
} from 'lucide-react';

interface QuickActionsPanelProps {
  user: any;
  showMessage: (type: 'success' | 'error', message: string) => void;
}

export default function QuickActionsPanel({ showMessage }: QuickActionsPanelProps) {
  const handleQuickAction = (action: string) => {
    showMessage('success', `Redirecting to ${action}...`);
    // In a real implementation, this would navigate to the appropriate page
  };

  const quickActions = [
    {
      id: 'create-do',
      title: 'Create New DO',
      description: 'Generate a new delivery order',
      icon: FileText,
      color: 'blue',
      action: () => handleQuickAction('DO creation page'),
    },
    {
      id: 'generate-fuel',
      title: 'Generate Fuel Record',
      description: 'Create a fuel record entry',
      icon: Fuel,
      color: 'orange',
      action: () => handleQuickAction('Fuel Record creation page'),
    },
    {
      id: 'batch-lpo',
      title: 'Batch Create LPOs',
      description: 'Create multiple LPO entries',
      icon: ClipboardList,
      color: 'purple',
      action: () => handleQuickAction('Batch LPO creation page'),
    },
    {
      id: 'view-approvals',
      title: 'View Pending Approvals',
      description: 'Review items awaiting approval',
      icon: CheckCircle,
      color: 'green',
      action: () => handleQuickAction('Approvals page'),
    },
    {
      id: 'yard-dispense',
      title: 'Yard Fuel Dispense',
      description: 'Record yard fuel dispensing',
      icon: TruckIcon,
      color: 'teal',
      action: () => handleQuickAction('Yard Fuel page'),
    },
    {
      id: 'quick-report',
      title: 'Quick Report',
      description: 'Generate instant daily summary',
      icon: Zap,
      color: 'yellow',
      action: () => handleQuickAction('Quick Report generation'),
    },
  ];

  const pendingItems = [
    {
      type: 'Delivery Orders',
      count: 0,
      icon: FileText,
      color: 'blue',
    },
    {
      type: 'LPO Approvals',
      count: 0,
      icon: ClipboardList,
      color: 'purple',
    },
    {
      type: 'Fuel Records',
      count: 0,
      icon: Fuel,
      color: 'orange',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Actions Grid */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={action.action}
                className={`p-6 bg-gradient-to-br from-${action.color}-50 to-${action.color}-100 dark:from-${action.color}-900/20 dark:to-${action.color}-900/10 border-2 border-${action.color}-200 dark:border-${action.color}-800 rounded-lg hover:shadow-lg transition-all text-left group`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 bg-${action.color}-500 text-white rounded-lg group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-semibold text-${action.color}-900 dark:text-${action.color}-100 mb-1`}>
                      {action.title}
                    </h4>
                    <p className={`text-sm text-${action.color}-700 dark:text-${action.color}-300`}>
                      {action.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pending Items Overview */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          Pending Items
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pendingItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.type}
                className={`p-4 border-2 border-${item.color}-200 dark:border-${item.color}-800 rounded-lg bg-${item.color}-50 dark:bg-${item.color}-900/20`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-5 h-5 text-${item.color}-600 dark:text-${item.color}-400`} />
                  <span className={`text-2xl font-bold text-${item.color}-900 dark:text-${item.color}-100`}>
                    {item.count}
                  </span>
                </div>
                <p className={`text-sm font-medium text-${item.color}-800 dark:text-${item.color}-200`}>
                  {item.type}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Common Tasks Shortcuts */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Common Tasks
        </h3>
        <div className="space-y-2">
          <button
            onClick={() => handleQuickAction('User creation')}
            className="w-full p-3 text-left bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-gray-900 dark:text-gray-100">Create New User</span>
              <span className="text-gray-400">→</span>
            </div>
          </button>
          <button
            onClick={() => handleQuickAction('Password reset')}
            className="w-full p-3 text-left bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-gray-900 dark:text-gray-100">Reset User Password</span>
              <span className="text-gray-400">→</span>
            </div>
          </button>
          <button
            onClick={() => handleQuickAction('Data export')}
            className="w-full p-3 text-left bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-gray-900 dark:text-gray-100">Export Data to Excel</span>
              <span className="text-gray-400">→</span>
            </div>
          </button>
          <button
            onClick={() => handleQuickAction('System status')}
            className="w-full p-3 text-left bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-gray-900 dark:text-gray-100">View System Status</span>
              <span className="text-gray-400">→</span>
            </div>
          </button>
        </div>
      </div>

      {/* Help & Documentation */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
              Need Help?
            </h4>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
              Access documentation, guides, and support resources to help you manage daily operations.
            </p>
            <button
              onClick={() => showMessage('success', 'Opening help documentation...')}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
            >
              View Documentation →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
