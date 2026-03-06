import { Users, Search, XCircle } from 'lucide-react';

type EmptyStateVariant = 'no-results' | 'no-data' | 'error';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  icon?: React.ComponentType<{ className?: string }>;
}

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  actions?: EmptyStateAction[];
}

const VARIANTS: Record<EmptyStateVariant, { icon: React.ComponentType<{ className?: string }>; defaultTitle: string; defaultDescription: string; iconBg: string; iconColor: string }> = {
  'no-results': {
    icon: Search,
    defaultTitle: 'No users match your filters',
    defaultDescription: 'Try adjusting your search or filter criteria to find what you are looking for.',
    iconBg: 'bg-indigo-50 dark:bg-indigo-900/20',
    iconColor: 'text-indigo-400 dark:text-indigo-500',
  },
  'no-data': {
    icon: Users,
    defaultTitle: 'No users yet',
    defaultDescription: 'Get started by creating your first user or importing users from a CSV file.',
    iconBg: 'bg-gray-100 dark:bg-gray-800',
    iconColor: 'text-gray-400 dark:text-gray-500',
  },
  'error': {
    icon: XCircle,
    defaultTitle: 'Failed to load users',
    defaultDescription: 'An error occurred while loading the user list. Please try again.',
    iconBg: 'bg-red-50 dark:bg-red-900/20',
    iconColor: 'text-red-400 dark:text-red-500',
  },
};

export default function EmptyState({
  variant = 'no-results',
  title,
  description,
  actions,
}: EmptyStateProps) {
  const config = VARIANTS[variant];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6" role="status">
      <div className={`w-16 h-16 rounded-2xl ${config.iconBg} flex items-center justify-center mb-5`}>
        <Icon className={`w-8 h-8 ${config.iconColor}`} />
      </div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1.5">
        {title || config.defaultTitle}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm mb-6">
        {description || config.defaultDescription}
      </p>
      {actions && actions.length > 0 && (
        <div className="flex items-center gap-3">
          {actions.map((action, i) => {
            const ActionIcon = action.icon;
            return (
              <button
                key={i}
                onClick={action.onClick}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  action.variant === 'primary'
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {ActionIcon && <ActionIcon className="w-4 h-4" />}
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
