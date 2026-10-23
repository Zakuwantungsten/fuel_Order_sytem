import type { ReactNode } from 'react';

// text-base on mobile keeps iOS Safari from zooming in when an input is focused
export const inputClass =
  'w-full h-10 px-2.5 sm:px-3 text-base sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent';
export const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1';

export const SectionTitle = ({
  children,
  first,
  className = 'col-span-2',
}: {
  children: ReactNode;
  first?: boolean;
  className?: string;
}) => (
  <h4
    className={`${className} text-[11px] font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400 ${
      first ? '' : 'mt-2 pt-4 border-t border-gray-100 dark:border-gray-700'
    }`}
  >
    {children}
  </h4>
);

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel, disabled }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`grid grid-flow-col auto-cols-fr gap-1 h-10 p-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/60 ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(opt.value)}
            className={`px-1 sm:px-2 rounded-md text-xs sm:text-sm font-medium truncate transition-colors disabled:cursor-not-allowed ${
              active
                ? 'bg-white dark:bg-gray-900 text-primary-700 dark:text-primary-300 shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
