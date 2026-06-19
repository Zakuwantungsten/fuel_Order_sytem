import { useState } from 'react';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { tangaLPOAPI } from '../services/api';
import { tangaLPOKeys } from '../hooks/useTangaLPOs';
import TangaLPOEntryForm from './TangaLPOEntryForm';
import type { TangaLPOEntry } from '../types';

interface Props {
  nextLpoNo: string;
  onClose: () => void;
}

type DraftEntry = Omit<TangaLPOEntry, '_id'>;

export default function TangaLPOForm({ nextLpoNo, onClose }: Props) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [currency, setCurrency] = useState<'TZS' | 'USD'>('TZS');
  const [notes, setNotes] = useState('');
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const lastRate = entries.length > 0 ? entries[entries.length - 1].rate : undefined;

  const total = entries.reduce((sum, e) => sum + (e.isCancelled ? 0 : e.amount), 0);

  const handleSaveEntry = (entry: DraftEntry) => {
    if (editIndex !== null) {
      setEntries(prev => prev.map((e, i) => (i === editIndex ? entry : e)));
      setEditIndex(null);
    } else {
      setEntries(prev => [...prev, entry]);
    }
    setShowEntryForm(false);
  };

  const handleRemoveEntry = (idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (entries.length === 0) {
      toast.error('Add at least one entry before saving');
      return;
    }

    setSubmitting(true);
    try {
      const result = await tangaLPOAPI.create({ date, currency, notes, entries });
      if (result.warnings?.length) {
        result.warnings.forEach((w: string) => toast.warn(w, { autoClose: 6000 }));
      }
      toast.success(`Tanga LPO ${result.data?.lpoNo ?? nextLpoNo} created`);
      queryClient.invalidateQueries({ queryKey: tangaLPOKeys.all });
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create LPO');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">New Tanga LPO</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Number: <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{nextLpoNo}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">
            {/* Top fields */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value as 'TZS' | 'USD')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="TZS">TZS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional remarks"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Entries section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  Entries ({entries.length})
                </h3>
                <button
                  type="button"
                  onClick={() => { setEditIndex(null); setShowEntryForm(true); }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Entry
                </button>
              </div>

              {entries.length === 0 ? (
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg py-8 text-center text-gray-500 dark:text-gray-400">
                  No entries yet. Click "Add Entry" to begin.
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">#</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">DO No</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Truck</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Liters</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Rate</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Dest</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {entries.map((e, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 font-mono text-gray-900 dark:text-gray-100">{e.doNo}</td>
                          <td className="px-3 py-2 font-mono text-gray-900 dark:text-gray-100">{e.truckNo}</td>
                          <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{e.liters.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{e.rate.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">{e.amount.toLocaleString()}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{e.dest}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => { setEditIndex(i); setShowEntryForm(true); }}
                                className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveEntry(i)}
                                className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 text-right">
                          Total ({currency})
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-gray-100">
                          {total.toLocaleString()}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || entries.length === 0}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? 'Saving…' : 'Create LPO'}
            </button>
          </div>
        </form>
      </div>

      {/* Entry sub-modal */}
      {showEntryForm && (
        <TangaLPOEntryForm
          entry={editIndex !== null ? entries[editIndex] : undefined}
          defaultRate={lastRate}
          onSave={handleSaveEntry}
          onClose={() => { setShowEntryForm(false); setEditIndex(null); }}
        />
      )}
    </div>
  );
}
