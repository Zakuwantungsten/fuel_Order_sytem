import { Sun, Moon, Monitor } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ThemeToggleProps {
  variant?: 'button' | 'dropdown';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function ThemeToggle({ 
  variant = 'button', 
  size = 'md', 
  showLabel = false,
  className = ''
}: ThemeToggleProps) {
  const { theme, toggleTheme, isDark } = useAuth();

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3'
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  if (variant === 'button') {
    return (
      <button
        onClick={toggleTheme}
        className={`
          ${sizeClasses[size]}
          text-gray-500 dark:text-gray-400 
          hover:text-gray-700 dark:hover:text-gray-200 
          hover:bg-gray-100 dark:hover:bg-gray-700 
          rounded-lg transition-colors
          ${className}
        `}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <div className="flex items-center gap-2">
          {isDark ? (
            <Sun className={iconSizes[size]} />
          ) : (
            <Moon className={iconSizes[size]} />
          )}
          {showLabel && (
            <span className="text-sm font-medium">
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={toggleTheme}
        className={`
          flex items-center gap-2 px-3 py-2
          bg-gray-100 dark:bg-gray-700 
          hover:bg-gray-200 dark:hover:bg-gray-600
          rounded-lg transition-colors
          text-gray-700 dark:text-gray-200
        `}
      >
        {isDark ? (
          <>
            <Sun className={iconSizes[size]} />
            <span className="text-sm font-medium">Light</span>
          </>
        ) : (
          <>
            <Moon className={iconSizes[size]} />
            <span className="text-sm font-medium">Dark</span>
          </>
        )}
      </button>
    </div>
  );
}

export default ThemeToggle;
