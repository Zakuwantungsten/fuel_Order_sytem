import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useRoutes } from '../hooks/useRoutes';
import type { RouteConfig } from '../types';

/**
 * Loading-point / destination suggestions from configured routes of a given type.
 * Routes without a routeType are treated as IMPORT (same as backend matching).
 */
export function useRouteLocationSuggestions(routeType: 'IMPORT' | 'EXPORT' = 'IMPORT') {
  const { data: routes } = useRoutes();

  return useMemo(() => {
    const origins = new Set<string>();
    const destinations = new Set<string>();
    for (const route of (routes || []) as RouteConfig[]) {
      if (route.isActive === false) continue;
      if ((route.routeType || 'IMPORT') !== routeType) continue;
      const origin = (route.origin || '').trim().toUpperCase();
      if (origin) origins.add(origin);
      const destination = (route.destination || '').trim().toUpperCase();
      if (destination) destinations.add(destination);
      for (const alias of route.destinationAliases || []) {
        const a = alias.trim().toUpperCase();
        if (a) destinations.add(a);
      }
    }
    return {
      origins: [...origins].sort(),
      destinations: [...destinations].sort(),
    };
  }, [routes, routeType]);
}

interface RouteSuggestInputProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Free-text input with a narrowing suggestion list. Tab / Enter accept the
 * highlighted suggestion; any value not in the list is still accepted as typed.
 */
export default function RouteSuggestInput({
  name,
  value,
  onChange,
  suggestions,
  placeholder,
  required,
  className,
  style,
}: RouteSuggestInputProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toUpperCase();
    if (!q) return suggestions;
    const starts = suggestions.filter(s => s.startsWith(q));
    const contains = suggestions.filter(s => !s.startsWith(q) && s.includes(q));
    return [...starts, ...contains];
  }, [suggestions, value]);

  // Nothing to suggest once the value already equals the only match.
  const showList =
    open && filtered.length > 0 && !(filtered.length === 1 && filtered[0] === value.trim().toUpperCase());

  useEffect(() => {
    setHighlight(0);
  }, [value]);

  useEffect(() => {
    if (!showList) return;
    const item = listRef.current?.children[highlight] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlight, showList]);

  const accept = (suggestion: string) => {
    onChange(suggestion);
    setOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      if (e.key === 'ArrowDown' && filtered.length > 0) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlight(h => (h + 1) % filtered.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlight(h => (h - 1 + filtered.length) % filtered.length);
        break;
      case 'Enter':
        e.preventDefault();
        accept(filtered[highlight]);
        break;
      case 'Tab':
        // Only auto-complete what the user started typing; an empty field tabs through.
        if (value.trim()) accept(filtered[highlight]);
        else setOpen(false);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        name={name}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        className={className}
        style={style}
        placeholder={placeholder}
      />
      {showList && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 w-full mt-1 max-h-56 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg"
        >
          {filtered.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === highlight}
              // mousedown (not click) so the input doesn't blur and close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                accept(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`px-3 py-2 text-sm cursor-pointer ${
                i === highlight
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
