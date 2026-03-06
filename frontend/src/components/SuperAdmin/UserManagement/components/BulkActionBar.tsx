import { useState, useRef, useEffect } from 'react';
import {
  UserCheck, UserX, Shield, Trash2, Key, Download,
  ChevronDown, X,
} from 'lucide-react';
import type { BulkActionType, SelectionScope } from '../types';
import { ALL_ROLE_VALUES, getRoleDefinition } from '../constants';

interface BulkActionBarProps {
  selectedCount: number;
  selectionScope: SelectionScope;
  totalMatching: number;
  pageCount: number;
  onSelectAllMatching: () => void;
  onClearSelection: () => void;
  onBulkAction: (action: BulkActionType, targetRole?: string) => void;
}

export default function BulkActionBar({
  selectedCount,
  selectionScope,
  totalMatching,
  pageCount,
  onSelectAllMatching,
  onClearSelection,
  onBulkAction,
}: BulkActionBarProps) {
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [roleFocusIdx, setRoleFocusIdx] = useState(-1);
  const roleRef = useRef<HTMLDivElement>(null);
  const roleButtonRef = useRef<HTMLButtonElement>(null);
  const roleItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const filteredRoles = ALL_ROLE_VALUES.filter(r => r !== 'super_admin');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) {
        setRoleMenuOpen(false);
        setRoleFocusIdx(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus active role menu item
  useEffect(() => {
    if (roleMenuOpen && roleFocusIdx >= 0) {
      roleItemRefs.current[roleFocusIdx]?.focus();
    }
  }, [roleFocusIdx, roleMenuOpen]);

  const handleRoleKeyDown = (e: React.KeyboardEvent) => {
    const count = filteredRoles.length;
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setRoleMenuOpen(false);
        setRoleFocusIdx(-1);
        roleButtonRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setRoleFocusIdx(prev => (prev + 1) % count);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setRoleFocusIdx(prev => (prev - 1 + count) % count);
        break;
      case 'Home':
        e.preventDefault();
        setRoleFocusIdx(0);
        break;
      case 'End':
        e.preventDefault();
        setRoleFocusIdx(count - 1);
        break;
    }
  };

  if (selectedCount === 0) return null;

  const isAllSelected = selectionScope === 'all';
  const displayCount = isAllSelected ? totalMatching : selectedCount;

  return (
    <div className="bg-indigo-50 dark:bg-indigo-900/15 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Selection info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2" aria-live="polite" aria-atomic="true">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold">
              {displayCount > 99 ? '99+' : displayCount}
            </span>
            <div>
              <span className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
                {displayCount.toLocaleString()} user{displayCount !== 1 ? 's' : ''} selected
              </span>
              {!isAllSelected && selectedCount < totalMatching && selectedCount === pageCount && (
                <span className="text-xs text-indigo-600 dark:text-indigo-400 block">
                  All {pageCount} on this page selected.{' '}
                  <button
                    onClick={onSelectAllMatching}
                    className="underline underline-offset-2 font-medium hover:text-indigo-800 dark:hover:text-indigo-300"
                  >
                    Select all {totalMatching.toLocaleString()} matching
                  </button>
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClearSelection}
            className="p-1 rounded-md text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
            aria-label="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Bulk actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onBulkAction('activate')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <UserCheck className="w-3.5 h-3.5" />
            Activate
          </button>
          <button
            onClick={() => onBulkAction('deactivate')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors shadow-sm"
          >
            <UserX className="w-3.5 h-3.5" />
            Deactivate
          </button>

          {/* Change role dropdown */}
          <div className="relative" ref={roleRef}>
            <button
              ref={roleButtonRef}
              onClick={() => { setRoleMenuOpen(!roleMenuOpen); if (!roleMenuOpen) setRoleFocusIdx(0); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
              aria-haspopup="menu"
              aria-expanded={roleMenuOpen}
            >
              <Shield className="w-3.5 h-3.5" />
              Change Role
              <ChevronDown className={`w-3 h-3 transition-transform ${roleMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {roleMenuOpen && (
              <div
                role="menu"
                onKeyDown={handleRoleKeyDown}
                className="absolute top-full mt-1 right-0 z-30 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 max-h-64 overflow-y-auto"
              >
                {filteredRoles.map((role, idx) => {
                  const def = getRoleDefinition(role);
                  return (
                    <button
                      key={role}
                      ref={el => { roleItemRefs.current[idx] = el; }}
                      role="menuitem"
                      tabIndex={roleFocusIdx === idx ? 0 : -1}
                      onClick={() => {
                        setRoleMenuOpen(false);
                        setRoleFocusIdx(-1);
                        onBulkAction('change_role', role);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Shield className={`w-3.5 h-3.5 ${def.color}`} />
                      {def.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-indigo-200 dark:bg-indigo-700 mx-1" />

          <button
            onClick={() => onBulkAction('reset_password')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm"
          >
            <Key className="w-3.5 h-3.5" />
            Reset Passwords
          </button>
          <button
            onClick={() => onBulkAction('export')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={() => onBulkAction('delete')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
