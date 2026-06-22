import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import type { TangaLPOEntry } from '../types';

interface Props {
  entry?: Partial<TangaLPOEntry>;
  onSave: (entry: Omit<TangaLPOEntry, '_id'>) => void;
  onClose: () => void;
  defaultRate?: number;
}

const EMPTY: Omit<TangaLPOEntry, '_id'> = {
  doNo: '',
  truckNo: '',
  liters: 0,
  rate: 0,
  amount: 0,
  dest: '',
  isCancelled: false,
};

export default function TangaLPOEntryForm({ entry, onSave, onClose, defaultRate }: Props) {
  const [form, setForm] = useState<Omit<TangaLPOEntry, '_id'>>({
    ...EMPTY,
    rate: defaultRate ?? 0,
    ...entry,
  });

  // Sync rate when defaultRate arrives after async fetch (only for new entries with no rate typed yet)
  useEffect(() => {
    if (defaultRate !== undefined && defaultRate > 0 && !entry) {
      setForm(prev => ({ ...prev, rate: prev.rate === 0 ? defaultRate : prev.rate }));
    }
  }, [defaultRate]);

  useEffect(() => {
    setForm(prev => ({ ...prev, amount: +(prev.liters * prev.rate).toFixed(2) }));
  }, [form.liters, form.rate]);

  const set = (field: keyof typeof form, value: string | number) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.truckNo.trim()) return;
    if (form.liters <= 0 || form.rate <= 0) return;
    onSave({ ...form, amount: +(form.liters * form.rate).toFixed(2) });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {entry ? 'Edit Entry' : 'Add Entry'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                DO Number
              </label>
              <input
                type="text"
                value={form.doNo}
                onChange={e => set('doNo', e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. DO-2026-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Truck No <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.truckNo}
                onChange={e => set('truckNo', e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. T123ABC"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Liters <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.liters || ''}
                onChange={e => set('liters', parseFloat(e.target.value) || 0)}
                min={0.01}
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rate <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.rate || ''}
                onChange={e => set('rate', parseFloat(e.target.value) || 0)}
                min={0.01}
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Amount
              </label>
              <input
                type="text"
                value={form.amount.toLocaleString()}
                readOnly
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-750 text-gray-700 dark:text-gray-300 cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Destination
            </label>
            <input
              type="text"
              value={form.dest}
              onChange={e => set('dest', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. Mombasa"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
