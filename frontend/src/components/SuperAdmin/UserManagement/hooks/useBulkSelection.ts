import { useState, useCallback, useRef, useEffect } from 'react';
import type { SelectionScope } from '../types';

interface UseBulkSelectionOptions {
  /** IDs of items on the current page */
  pageIds: string[];
  /** Total number of items matching the current filters (across all pages) */
  totalMatching: number;
}

export function useBulkSelection({ pageIds, totalMatching }: UseBulkSelectionOptions) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionScope, setSelectionScope] = useState<SelectionScope>('page');
  const checkboxRef = useRef<HTMLInputElement>(null);

  // Clear selection when page data changes
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectionScope('page');
  }, [pageIds.join(',')]);

  const selectedCount = selectionScope === 'all' ? totalMatching : selectedIds.size;
  const pageSelectedCount = pageIds.filter(id => selectedIds.has(id)).length;
  const allPageSelected = pageIds.length > 0 && pageSelectedCount === pageIds.length;
  const somePageSelected = pageSelectedCount > 0 && pageSelectedCount < pageIds.length;

  // Native indeterminate state on the header checkbox
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = somePageSelected;
    }
  }, [somePageSelected]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectionScope('page');
  }, []);

  const togglePage = useCallback(() => {
    if (allPageSelected) {
      setSelectedIds(new Set());
      setSelectionScope('page');
    } else {
      setSelectedIds(new Set(pageIds));
      setSelectionScope('page');
    }
  }, [allPageSelected, pageIds]);

  const selectAllMatching = useCallback(() => {
    setSelectedIds(new Set(pageIds));
    setSelectionScope('all');
  }, [pageIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionScope('page');
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  return {
    selectedIds,
    selectedCount,
    selectionScope,
    allPageSelected,
    somePageSelected,
    checkboxRef,
    toggleOne,
    togglePage,
    selectAllMatching,
    clearSelection,
    isSelected,
  };
}
