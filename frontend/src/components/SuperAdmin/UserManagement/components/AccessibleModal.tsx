import { useEffect, useRef, useCallback, useId } from 'react';
import { X } from 'lucide-react';

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconBg?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
}

const SIZE_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export default function AccessibleModal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconBg = 'bg-indigo-100 dark:bg-indigo-900/30',
  size = 'md',
  children,
  footer,
  closeOnEscape = true,
  closeOnBackdrop = true,
}: AccessibleModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const subtitleId = useId();

  // Store the element that had focus before modal opened
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
  }, [isOpen]);

  // Focus first focusable element on open, restore focus on close
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const firstFocusable = dialogRef.current.querySelector<HTMLElement>(focusableSelector);

    // Small delay to ensure the modal is rendered
    const timer = setTimeout(() => {
      firstFocusable?.focus();
    }, 50);

    return () => {
      clearTimeout(timer);
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  // Focus trap
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen || !dialogRef.current) return;

    if (e.key === 'Escape' && closeOnEscape) {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'Tab') {
      const focusableSelector =
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector);
      const firstEl = focusableElements[0];
      const lastEl = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl?.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl?.focus();
        }
      }
    }
  }, [isOpen, closeOnEscape, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (closeOnBackdrop && e.target === overlayRef.current) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        className={`relative ${SIZE_MAP[size]} w-full bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-6 pb-4">
          {Icon && (
            <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2
              id={titleId}
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              {title}
            </h2>
            {subtitle && (
              <p id={subtitleId} className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
