import { useState, useRef, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { getRoleDefinition } from '../constants';

interface RoleBadgeProps {
  role: string;
  size?: 'sm' | 'md';
  showTooltip?: boolean;
}

export default function RoleBadge({ role, size = 'sm', showTooltip = true }: RoleBadgeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const def = getRoleDefinition(role);

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-xs gap-1'
    : 'px-2.5 py-1 text-sm gap-1.5';

  const handleMouseEnter = () => {
    if (!showTooltip) return;
    timeoutRef.current = setTimeout(() => setTooltipVisible(true), 300);
  };

  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    setTooltipVisible(false);
  };

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  return (
    <span
      ref={badgeRef}
      className={`relative inline-flex items-center font-medium rounded-full ${sizeClasses} ${def.bgColor} ${def.color}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      tabIndex={showTooltip ? 0 : undefined}
      role={showTooltip ? 'button' : undefined}
      aria-label={showTooltip ? `${def.label}: ${def.description}` : def.label}
    >
      <Shield className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {def.label}

      {/* Tooltip */}
      {tooltipVisible && showTooltip && (
        <div
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 pointer-events-none"
        >
          <div className="bg-gray-900 dark:bg-gray-100 rounded-lg shadow-xl p-3 text-left">
            <p className="text-sm font-semibold text-white dark:text-gray-900 mb-1">
              {def.label}
            </p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mb-2">
              {def.description}
            </p>
            <div className="border-t border-gray-700 dark:border-gray-300 pt-2">
              <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                Permissions
              </p>
              <ul className="space-y-0.5">
                {def.permissionSummary.map((perm, i) => (
                  <li key={i} className="text-xs text-gray-300 dark:text-gray-600 flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-gray-500 flex-shrink-0" />
                    {perm}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {/* Arrow */}
          <div className="flex justify-center">
            <div className="w-2 h-2 bg-gray-900 dark:bg-gray-100 rotate-45 -mt-1" />
          </div>
        </div>
      )}
    </span>
  );
}
