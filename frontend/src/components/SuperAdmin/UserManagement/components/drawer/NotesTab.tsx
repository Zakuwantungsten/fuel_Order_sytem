import { useState, useCallback } from 'react';
import { Save, Loader2, StickyNote } from 'lucide-react';
import { toast } from 'react-toastify';
import { usersAPI } from '../../../../../services/api';
import type { User } from '../../../../../types';

interface NotesTabProps {
  user: User;
  onRefresh: () => void;
}

export default function NotesTab({ user, onRefresh }: NotesTabProps) {
  const [notes, setNotes] = useState(user.notes || '');
  const [saving, setSaving] = useState(false);
  const isDirty = notes !== (user.notes || '');

  const handleSave = useCallback(async () => {
    const userId = String(user.id || (user as any)._id);
    setSaving(true);
    try {
      await usersAPI.updateNotes(userId, notes);
      toast.success('Notes saved');
      onRefresh();
    } catch {
      toast.error('Failed to save notes');
    } finally {
      setSaving(false);
    }
  }, [user, notes, onRefresh]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (isDirty && !saving) handleSave();
    }
  }, [isDirty, saving, handleSave]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Admin Notes
        </h3>
        {isDirty && (
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Unsaved changes</span>
        )}
      </div>

      <div className="relative">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add internal notes about this user..."
          rows={8}
          className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors resize-y"
        />
        <div className="absolute bottom-2 right-2 text-[10px] text-gray-400 dark:text-gray-500">
          Ctrl+S to save
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!isDirty || saving}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        Save Notes
      </button>

      {!user.notes && !notes && (
        <div className="text-center py-6">
          <StickyNote className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No notes yet. Add internal documentation or observations about this user.
          </p>
        </div>
      )}
    </div>
  );
}
