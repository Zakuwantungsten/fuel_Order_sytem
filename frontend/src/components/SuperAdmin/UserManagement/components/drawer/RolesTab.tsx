import { Shield, ArrowRight, Info } from 'lucide-react';
import type { User } from '../../../../../types';
import { getRoleDefinition, USER_ROLES } from '../../constants';

interface RolesTabProps {
  user: User;
}

export default function RolesTab({ user }: RolesTabProps) {
  const currentRole = getRoleDefinition(user.role);

  // Build a simple role hierarchy visualization
  const hierarchy = USER_ROLES.slice(0, 12); // Main roles (not yard-specific)

  return (
    <div className="space-y-6">
      {/* Current Role */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Current Role
        </h3>
        <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${currentRole.bgColor}`}>
              <Shield className={`w-5 h-5 ${currentRole.color}`} />
            </div>
            <div>
              <div className={`text-sm font-semibold ${currentRole.color}`}>{currentRole.label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{currentRole.description}</div>
            </div>
          </div>

          {currentRole.permissionSummary.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Permissions</div>
              <ul className="space-y-1">
                {currentRole.permissionSummary.map((perm, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                    <ArrowRight className="w-3 h-3 text-indigo-400 mt-0.5 flex-shrink-0" />
                    {perm}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Role Hierarchy */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Role Hierarchy
        </h3>
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
          <div className="space-y-1">
            {hierarchy.map((role) => {
              const isCurrent = role.value === user.role;
              return (
                <div
                  key={role.value}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isCurrent
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-200 dark:ring-indigo-700'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isCurrent ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-gray-300 dark:bg-gray-600'
                  }`} />
                  <span className={`flex-1 ${
                    isCurrent
                      ? 'font-semibold text-indigo-700 dark:text-indigo-300'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {role.label}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 px-1.5 py-0.5 rounded">
                      Current
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Info note */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>Role changes can be made from the Edit User modal or via Bulk Operations.</span>
      </div>
    </div>
  );
}
