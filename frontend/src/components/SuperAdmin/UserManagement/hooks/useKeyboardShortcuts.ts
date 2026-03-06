import { useEffect, useCallback } from 'react';

interface ShortcutHandler {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  handler: () => void;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: ShortcutHandler[];
  enabled?: boolean;
}

export function useKeyboardShortcuts({ shortcuts, enabled = true }: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Don't intercept when user is typing in an input/textarea/contenteditable
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      // Allow Escape to still work inside inputs
      if (e.key !== 'Escape') return;
    }

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

      if (keyMatch && ctrlMatch && shiftMatch) {
        e.preventDefault();
        e.stopPropagation();
        shortcut.handler();
        return;
      }
    }
  }, [shortcuts, enabled]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
