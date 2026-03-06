import { LIFECYCLE_STATES } from '../constants';
import type { UserLifecycleState } from '../types';
import type { User } from '../../../../types';

interface StatusBadgeProps {
  user: User;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

export function resolveLifecycleState(user: User): UserLifecycleState {
  if (user.isBanned) return 'banned';
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) return 'locked';
  if (user.pendingActivation) return 'pending_activation';
  if (user.isActive) return 'active';
  return 'inactive';
}

export default function StatusBadge({ user, size = 'sm', showIcon = true }: StatusBadgeProps) {
  const state = resolveLifecycleState(user);
  const config = LIFECYCLE_STATES[state];
  const Icon = config.icon;

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-xs gap-1'
    : 'px-2.5 py-1 text-sm gap-1.5';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${sizeClasses} ${config.bgColor} ${config.textColor}`}
    >
      {showIcon ? (
        <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} aria-hidden="true" />
      )}
      {config.label}
    </span>
  );
}
