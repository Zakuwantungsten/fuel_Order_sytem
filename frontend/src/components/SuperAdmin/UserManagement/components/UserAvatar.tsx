import { useMemo } from 'react';

interface UserAvatarProps {
  firstName?: string;
  lastName?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Deterministic color from name hash (consistent for the same user)
const AVATAR_COLORS = [
  'bg-indigo-600',
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-purple-600',
  'bg-cyan-600',
  'bg-teal-600',
  'bg-orange-600',
  'bg-pink-600',
  'bg-violet-600',
  'bg-sky-600',
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const SIZE_MAP = {
  sm: { container: 'w-8 h-8', text: 'text-xs' },
  md: { container: 'w-9 h-9', text: 'text-sm' },
  lg: { container: 'w-12 h-12', text: 'text-base' },
};

export default function UserAvatar({
  firstName = '',
  lastName = '',
  size = 'md',
  className = '',
}: UserAvatarProps) {
  const { initials, colorClass } = useMemo(() => {
    const f = firstName.trim();
    const l = lastName.trim();
    const init = ((f[0] || '') + (l[0] || '')).toUpperCase() || '?';
    const fullName = `${f} ${l}`.trim();
    const color = AVATAR_COLORS[hashString(fullName) % AVATAR_COLORS.length];
    return { initials: init, colorClass: color };
  }, [firstName, lastName]);

  const sizeConfig = SIZE_MAP[size];

  return (
    <div
      className={`${sizeConfig.container} ${colorClass} rounded-full flex items-center justify-center flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      <span className={`${sizeConfig.text} font-semibold text-white leading-none select-none`}>
        {initials}
      </span>
    </div>
  );
}
