import { useState, useEffect, useRef, useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function FilterDropdown({
  label,
  value,
  options,
  onChange,
  placeholder,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const labelId = useId();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setFocusIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll focused option into view
  useEffect(() => {
    if (open && focusIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      items[focusIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusIndex, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setFocusIndex(0);
        } else {
          setFocusIndex(prev => Math.min(prev + 1, options.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) {
          setFocusIndex(prev => Math.max(prev - 1, 0));
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (open && focusIndex >= 0) {
          onChange(options[focusIndex].value);
          setOpen(false);
          setFocusIndex(-1);
          buttonRef.current?.focus();
        } else {
          setOpen(true);
          setFocusIndex(options.findIndex(o => o.value === value));
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setFocusIndex(-1);
        buttonRef.current?.focus();
        break;
      case 'Home':
        if (open) {
          e.preventDefault();
          setFocusIndex(0);
        }
        break;
      case 'End':
        if (open) {
          e.preventDefault();
          setFocusIndex(options.length - 1);
        }
        break;
      case 'Tab':
        setOpen(false);
        setFocusIndex(-1);
        break;
    }
  };

  const selected = options.find(o => o.value === value);
  const displayText = selected?.label || placeholder || 'Select...';

  return (
    <div className="relative" ref={ref}>
      <label
        id={labelId}
        className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
      >
        {label}
      </label>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-labelledby={labelId}
        aria-activedescendant={open && focusIndex >= 0 ? `${listboxId}-option-${focusIndex}` : undefined}
        onClick={() => {
          setOpen(!open);
          if (!open) setFocusIndex(options.findIndex(o => o.value === value));
        }}
        onKeyDown={handleKeyDown}
        className={`w-full px-3 py-2 border rounded-lg text-sm flex items-center justify-between transition-colors ${
          open
            ? 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/20'
            : 'border-gray-300 dark:border-gray-600'
        } bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:border-gray-400 dark:hover:border-gray-500`}
      >
        <span className={value ? '' : 'text-gray-400 dark:text-gray-500'}>{displayText}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={labelId}
          className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto py-1"
          onKeyDown={handleKeyDown}
        >
          {options.map((opt, idx) => {
            const isSelected = value === opt.value;
            const isFocused = idx === focusIndex;
            return (
              <div
                key={opt.value}
                id={`${listboxId}-option-${idx}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                  setFocusIndex(-1);
                  buttonRef.current?.focus();
                }}
                onMouseEnter={() => setFocusIndex(idx)}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between transition-colors ${
                  isFocused
                    ? 'bg-indigo-50 dark:bg-indigo-900/30'
                    : ''
                } ${
                  isSelected
                    ? 'text-indigo-700 dark:text-indigo-300 font-medium'
                    : 'text-gray-900 dark:text-gray-100'
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
