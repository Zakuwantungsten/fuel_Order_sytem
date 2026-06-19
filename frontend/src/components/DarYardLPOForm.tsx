import { useState, useCallback } from 'react';
import {
  X, Plus, Trash2, Loader2, Search, Eye,
  CheckCircle, AlertTriangle, Save,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';
import { darLPOAPI, fuelRecordsAPI } from '../services/api';
import { darLPOKeys } from '../hooks/useDarLPOs';
import FuelRecordInspectModal from './FuelRecordInspectModal';
import type { DarLPO, DarLPOEntry, FuelRecord } from '../types';

interface Props {
  mode: 'new' | 'add-entries';
  nextLpoNo?: string;
  existingLpo?: DarLPO;
  onClose: () => void;
  onSuccess?: () => void;
}

type DraftEntry = Omit<DarLPOEntry, '_id'>;

interface RowState {
  autoFetching: boolean;
  fetched: boolean;
  fuelRecord: FuelRecord | null;
  fuelRecordId?: string | number;
  alreadyDispensed: number;
  warningType?: 'not_found' | null;
  linked: boolean;
}

const makeEmptyEntry = (rate = 0): DraftEntry => ({
  doNo: '', truckNo: '', liters: 0, rate, amount: 0, dest: '', isCancelled: false,
});
const makeEmptyRow = (): RowState => ({
  autoFetching: false, fetched: false, fuelRecord: null, alreadyDispensed: 0, warningType: null, linked: false,
});

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

function isRecordComplete(r: FuelRecord): boolean {
  if (r.journeyStatus === 'completed') return true;
  if (r.journeyStatus === 'active' || r.journeyStatus === 'queued') return false;
  const dest = (r.originalGoingTo || r.to || '').toUpperCase();
  const isMSA = dest.includes('MSA') || dest.includes('MOMBASA');
  return isMSA ? !!(r.tangaReturn) : !!(r.mbeyaReturn);
}

export default function DarYardLPOForm({
  mode, nextLpoNo, existingLpo, onClose, onSuccess,
}: Props) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(mode === 'new' ? today : (existingLpo?.date ?? today));
  const [currency, setCurrency] = useState<'TZS' | 'USD'>(
    mode === 'new' ? 'TZS' : (existingLpo?.currency ?? 'TZS')
  );
  const [notes, setNotes] = useState(mode === 'new' ? '' : (existingLpo?.notes ?? ''));

  const [entries, setEntries] = useState<DraftEntry[]>([makeEmptyEntry()]);
  const [rows, setRows] = useState<RowState[]>([makeEmptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [bulkLiters, setBulkLiters] = useState('');
  const [bulkRate, setBulkRate] = useState('');

  const [inspectModal, setInspectModal] = useState<{
    isOpen: boolean; fuelRecordId: string | number; truckNumber?: string;
  }>({ isOpen: false, fuelRecordId: '' });

  const updateEntry = (idx: number, field: keyof DraftEntry, value: string | number | boolean) => {
    setEntries(prev => prev.map((e, i) => {
      if (i !== idx) return e;
      const u = { ...e, [field]: value };
      if (field === 'liters' || field === 'rate') {
        u.amount = +(u.liters * u.rate).toFixed(2);
      }
      return u;
    }));
  };

  const updateRow = (idx: number, patch: Partial<RowState>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    const lastRate = entries.length > 0 ? entries[entries.length - 1].rate : 0;
    setEntries(prev => [...prev, makeEmptyEntry(lastRate)]);
    setRows(prev => [...prev, makeEmptyRow()]);
  };

  const removeRow = (idx: number) => {
    if (entries.length === 1) return;
    setEntries(prev => prev.filter((_, i) => i !== idx));
    setRows(prev => prev.filter((_, i) => i !== idx));
    setSelectedRows(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1); });
      return next;
    });
  };

  const fetchTruck = useCallback(async (idx: number, rawTruckNo: string) => {
    const truckNo = rawTruckNo.trim();
    if (truckNo.length < 3) return;

    updateRow(idx, { autoFetching: true, fetched: false, fuelRecord: null, warningType: null });

    try {
      const response = await fuelRecordsAPI.getAll({ truckNo, limit: 10000 });
      const all: FuelRecord[] = response.data;
      const active = all.filter(r => !r.isCancelled);

      if (!active.length) {
        updateRow(idx, { autoFetching: false, fetched: true, warningType: 'not_found' });
        return;
      }

      const sorted = [...active].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      const record =
        sorted.find(r => r.journeyStatus === 'active') ||
        sorted.find(r => !isRecordComplete(r)) ||
        sorted[0];

      const fuelRecordId = (record._id ?? record.id) as string | number;

      setEntries(prev => prev.map((e, i) => {
        if (i !== idx) return e;
        return {
          ...e,
          doNo: e.doNo || record.goingDo || '',
          dest: e.dest || record.originalGoingTo || record.to || '',
        };
      }));

      updateRow(idx, {
        autoFetching: false,
        fetched: true,
        fuelRecord: record,
        fuelRecordId,
        alreadyDispensed: record.darYard || 0,
        warningType: null,
        linked: true,
      });
    } catch {
      updateRow(idx, { autoFetching: false, fetched: true, warningType: 'not_found' });
    }
  }, []);

  const handleTruckPaste = useCallback((idx: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return;
    e.preventDefault();
    setEntries(prev => {
      const lastRate = prev[prev.length - 1]?.rate || 0;
      const next = [...prev];
      lines.forEach((line, i) => {
        const rowIdx = idx + i;
        if (rowIdx < next.length) {
          next[rowIdx] = { ...next[rowIdx], truckNo: line.toUpperCase() };
        } else {
          next.push({ ...makeEmptyEntry(lastRate), truckNo: line.toUpperCase() });
        }
      });
      return next;
    });
    setRows(prev => {
      const next = [...prev];
      for (let i = 1; i < lines.length; i++) {
        if (idx + i >= next.length) next.push(makeEmptyRow());
      }
      return next;
    });
    lines.forEach((line, i) => {
      setTimeout(() => fetchTruck(idx + i, line), i * 80);
    });
  }, [fetchTruck]);

  const validEntries = entries.filter(
    e => e.truckNo.trim() && e.liters > 0 && e.rate > 0
  );
  const total = entries.reduce((s, e) => s + (e.amount || 0), 0);

  const resetEntries = () => {
    const lastRate = entries.length > 0 ? entries[entries.length - 1].rate : 0;
    setEntries([makeEmptyEntry(lastRate)]);
    setRows([makeEmptyRow()]);
    setSelectedRows(new Set());
  };

  const allSelected = entries.length > 0 && selectedRows.size === entries.length;
  const toggleSelectRow = (idx: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const toggleSelectAll = () => setSelectedRows(allSelected ? new Set() : new Set(entries.map((_, i) => i)));
  const handleBulkDelete = () => {
    const remaining = entries.filter((_, i) => !selectedRows.has(i));
    const remainingRows = rows.filter((_, i) => !selectedRows.has(i));
    if (remaining.length === 0) {
      setEntries([makeEmptyEntry(entries[entries.length - 1]?.rate || 0)]);
      setRows([makeEmptyRow()]);
    } else {
      setEntries(remaining);
      setRows(remainingRows);
    }
    setSelectedRows(new Set());
  };
  const handleBulkApply = () => {
    const liters = bulkLiters !== '' ? parseFloat(bulkLiters) : null;
    const rate = bulkRate !== '' ? parseFloat(bulkRate) : null;
    if (liters === null && rate === null) return;
    setEntries(prev => prev.map((e, i) => {
      if (!selectedRows.has(i)) return e;
      const nl = liters !== null ? liters : e.liters;
      const nr = rate !== null ? rate : e.rate;
      return { ...e, liters: nl, rate: nr, amount: +(nl * nr).toFixed(2) };
    }));
    setBulkLiters('');
    setBulkRate('');
  };

  const applyFuelLinks = async (lpoId: string, responseEntries: any[], validWithIdx: { i: number }[]) => {
    const linkedEntryIds: string[] = [];
    const topUpEntryIds: string[] = [];
    validWithIdx.forEach(({ i }, j) => {
      const respEntry = responseEntries[j];
      if (rows[i]?.linked && respEntry?._id) {
        const eid = respEntry._id.toString();
        linkedEntryIds.push(eid);
        if ((rows[i].alreadyDispensed ?? 0) > 0) topUpEntryIds.push(eid);
      }
    });
    if (linkedEntryIds.length === 0) return;
    try {
      const linkResult = await darLPOAPI.bulkLink(lpoId, { entryIds: linkedEntryIds, topUpEntryIds });
      const linked = (linkResult.results || []).filter((r: any) => r.status === 'linked' || r.status === 'topped_up').length;
      const notFound = (linkResult.results || []).filter((r: any) => r.status === 'not_found').length;
      if (linked > 0) toast.info(`${linked} ${linked === 1 ? 'entry' : 'entries'} linked to fuel record`);
      if (notFound > 0) toast.warn(`${notFound} ${notFound === 1 ? 'entry' : 'entries'} could not be linked — DO number not matched`);
    } catch {
      toast.warn('Saved but fuel linking failed — use manual link from the LPO sheet');
    }
  };

  const handleSubmit = async () => {
    if (validEntries.length === 0) {
      toast.error('Add at least one entry with truck, liters, and rate');
      return;
    }
    setSubmitting(true);
    try {
      const validWithIdx = entries
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.truckNo.trim() && e.liters > 0 && e.rate > 0);

      if (mode === 'new') {
        const result = await darLPOAPI.create({ date, currency, notes: notes || undefined, entries: validEntries });
        if (result.warnings?.length) {
          result.warnings.forEach((w: string) => toast.warn(w, { autoClose: 6000 }));
        }
        toast.success(`Dar LPO ${result.data?.lpoNo ?? nextLpoNo} created`);
        const lpoId = (result.data?._id ?? result.data?.id)?.toString();
        if (lpoId) {
          await applyFuelLinks(lpoId, result.data?.entries || [], validWithIdx);
        }
        queryClient.invalidateQueries({ queryKey: darLPOKeys.all });
        onSuccess?.();
        onClose();
      } else {
        if (!existingLpo) return;
        const lpoId = (existingLpo._id ?? existingLpo.id) as string;
        await darLPOAPI.acquireLock(lpoId);
        try {
          const updatedEntries = [...existingLpo.entries, ...validEntries];
          const updateResult = await darLPOAPI.update(lpoId, { entries: updatedEntries });
          toast.success(
            `${validEntries.length} ${validEntries.length === 1 ? 'entry' : 'entries'} added to ${existingLpo.lpoNo}`
          );
          const existingCount = existingLpo.entries.length;
          const newResponseEntries = (updateResult?.entries || []).slice(existingCount);
          await applyFuelLinks(lpoId, newResponseEntries, validWithIdx);
          queryClient.invalidateQueries({ queryKey: darLPOKeys.all });
          onSuccess?.();
          resetEntries();
        } finally {
          await darLPOAPI.releaseLock(lpoId).catch(() => {});
        }
      }
    } catch (err: any) {
      if (err?.response?.status === 423) {
        const holder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
        toast.error(`LPO is locked by ${holder} — try again shortly`);
      } else {
        toast.error(err?.response?.data?.message || 'Failed to save');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {mode === 'new' ? 'New Dar Yard LPO' : `Add Entries → ${existingLpo?.lpoNo}`}
            </h2>
            {mode === 'new' && nextLpoNo && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                LPO Number:{' '}
                <span className="font-mono font-semibold text-green-600 dark:text-green-400">{nextLpoNo}</span>
              </p>
            )}
            {mode === 'add-entries' && existingLpo && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {existingLpo.date} · {existingLpo.currency} ·{' '}
                {existingLpo.entries.filter(e => !e.isCancelled).length} existing{' '}
                {existingLpo.entries.filter(e => !e.isCancelled).length === 1 ? 'entry' : 'entries'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* ── LPO Header Fields (new mode only) ── */}
        {mode === 'new' && (
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Date</label>
                <input
                  type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Currency</label>
                <select
                  value={currency} onChange={e => setCurrency(e.target.value as 'TZS' | 'USD')}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="TZS">TZS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notes</label>
                <input
                  type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Entry Table ── */}
        <div className="flex-1 overflow-auto">

          {/* Desktop table */}
          <div className="hidden sm:block p-4">
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1.5rem_2rem_1fr_10rem_minmax(6rem,7rem)_5.5rem_5.5rem_6.5rem_1fr_5rem] bg-green-50 dark:bg-green-900/20 border-b border-gray-200 dark:border-gray-700">
                <div className="px-1 py-2 flex items-center justify-center">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-3.5 h-3.5 accent-green-600" />
                </div>
                {['#', 'Truck / Entity', 'Fuel Info', 'DO No', 'Liters', 'Rate', 'Amount', 'Destination', 'Actions'].map((h, i) => (
                  <div key={h + i} className={`px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i >= 4 && i <= 6 ? 'text-right' : ''}`}>
                    {h}
                  </div>
                ))}
              </div>

              {selectedRows.size > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-700 flex-wrap">
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400">{selectedRows.size} selected</span>
                  <input
                    type="number"
                    value={bulkLiters}
                    onChange={e => setBulkLiters(e.target.value)}
                    placeholder="New liters"
                    className="w-24 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-green-500"
                  />
                  <input
                    type="number"
                    value={bulkRate}
                    onChange={e => setBulkRate(e.target.value)}
                    placeholder="New rate"
                    className="w-24 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-green-500"
                  />
                  <button
                    type="button"
                    onClick={handleBulkApply}
                    disabled={bulkLiters === '' && bulkRate === ''}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded disabled:opacity-40 transition-colors"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRows(new Set())}
                    className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}

              {entries.map((entry, idx) => {
                const row = rows[idx] || makeEmptyRow();
                const rowBorderCls =
                  row.fetched && !row.warningType
                    ? 'border-l-2 border-l-green-400'
                    : row.warningType
                    ? 'border-l-2 border-l-amber-400'
                    : '';
                const isSelected = selectedRows.has(idx);

                return (
                  <div
                    key={idx}
                    className={`grid grid-cols-[1.5rem_2rem_1fr_10rem_minmax(6rem,7rem)_5.5rem_5.5rem_6.5rem_1fr_5rem] border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${rowBorderCls} ${isSelected ? 'bg-green-50/50 dark:bg-green-900/10' : ''}`}
                  >
                    {/* Select */}
                    <div className="px-1 py-2 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(idx)}
                        className="w-3.5 h-3.5 accent-green-600"
                      />
                    </div>

                    {/* # */}
                    <div className="px-2 py-2 flex items-center text-xs text-gray-400 font-mono">
                      {idx + 1}
                    </div>

                    {/* Truck / Entity + fetch */}
                    <div className="px-1.5 py-1.5">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={entry.truckNo}
                          onChange={e => updateEntry(idx, 'truckNo', e.target.value.toUpperCase())}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); fetchTruck(idx, entry.truckNo); }
                          }}
                          onPaste={e => handleTruckPaste(idx, e)}
                          placeholder="T 000 XXX / Entity"
                          className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-green-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => fetchTruck(idx, entry.truckNo)}
                          disabled={row.autoFetching || !entry.truckNo.trim()}
                          title="Fetch details (Enter)"
                          className="flex-shrink-0 p-1 rounded text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-40 transition-colors"
                        >
                          {row.autoFetching
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Search className="w-4 h-4" />}
                        </button>
                      </div>
                      {row.fetched && row.warningType && (
                        <div className="flex items-center gap-1 mt-0.5 px-0.5">
                          <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                          <span className="text-[10px] text-amber-600 dark:text-amber-400">No active record</span>
                        </div>
                      )}
                    </div>

                    {/* Fuel Info */}
                    <div className="px-1.5 py-1.5 flex flex-col justify-center">
                      {row.fetched && !row.warningType && row.fuelRecord && (
                        <>
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                            <span className="text-[10px] text-green-700 dark:text-green-400 whitespace-nowrap">
                              Dar Yard: {row.alreadyDispensed}L · Bal: {row.fuelRecord.balance}L
                            </span>
                          </div>
                          <label className="flex items-center gap-1 mt-1 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={row.linked}
                              onChange={e => updateRow(idx, { linked: e.target.checked })}
                              className="w-3 h-3 accent-green-600"
                            />
                            <span className="text-[10px] text-gray-500 dark:text-gray-400">Link &amp; dispense</span>
                          </label>
                        </>
                      )}
                    </div>

                    {/* DO No */}
                    <div className="px-1.5 py-1.5 flex items-center">
                      <input
                        type="text"
                        value={entry.doNo}
                        onChange={e => updateEntry(idx, 'doNo', e.target.value.toUpperCase())}
                        placeholder="DO #"
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-green-500 font-mono"
                      />
                    </div>

                    {/* Liters */}
                    <div className="px-1.5 py-1.5 flex items-center">
                      <input
                        type="number"
                        value={entry.liters || ''}
                        onChange={e => updateEntry(idx, 'liters', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        min={0.01}
                        step="0.01"
                        className="w-full px-2 py-1 text-sm text-right border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-green-500"
                      />
                    </div>

                    {/* Rate */}
                    <div className="px-1.5 py-1.5 flex items-center">
                      <input
                        type="number"
                        value={entry.rate || ''}
                        onChange={e => updateEntry(idx, 'rate', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        min={0.01}
                        step="0.01"
                        className="w-full px-2 py-1 text-sm text-right border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-green-500"
                      />
                    </div>

                    {/* Amount */}
                    <div className="px-2 py-2 flex items-center justify-end text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                      {entry.amount > 0 ? fmt(entry.amount) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </div>

                    {/* Destination */}
                    <div className="px-1.5 py-1.5 flex items-center">
                      <input
                        type="text"
                        value={entry.dest}
                        onChange={e => updateEntry(idx, 'dest', e.target.value)}
                        placeholder="Destination"
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-green-500"
                      />
                    </div>

                    {/* Actions */}
                    <div className="px-1 py-1.5 flex items-center justify-center gap-0.5">
                      {row.fetched && row.fuelRecordId && (
                        <button
                          type="button"
                          title="Inspect fuel record"
                          onClick={() => setInspectModal({
                            isOpen: true,
                            fuelRecordId: row.fuelRecordId!,
                            truckNumber: entry.truckNo,
                          })}
                          className="p-1.5 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        disabled={entries.length === 1}
                        className="p-1.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addRow}
              className="mt-3 w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-green-400 dark:hover:border-green-600 hover:text-green-600 dark:hover:text-green-400 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Row
            </button>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden p-3 space-y-3">
            {selectedRows.size > 0 && (
              <div className="flex items-center gap-2 p-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl flex-wrap">
                <span className="text-xs font-semibold text-green-700 dark:text-green-400">{selectedRows.size} selected</span>
                <input type="number" value={bulkLiters} onChange={e => setBulkLiters(e.target.value)} placeholder="Liters" className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                <input type="number" value={bulkRate} onChange={e => setBulkRate(e.target.value)} placeholder="Rate" className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                <button type="button" onClick={handleBulkApply} disabled={bulkLiters === '' && bulkRate === ''} className="px-2.5 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded disabled:opacity-40 transition-colors">Apply</button>
                <button type="button" onClick={handleBulkDelete} className="px-2.5 py-1 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded transition-colors">Delete</button>
                <button type="button" onClick={() => setSelectedRows(new Set())} className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">Clear</button>
              </div>
            )}
            {entries.map((entry, idx) => {
              const row = rows[idx] || makeEmptyRow();
              const isSelected = selectedRows.has(idx);
              const borderCls =
                row.fetched && !row.warningType
                  ? 'border-green-300 dark:border-green-700'
                  : row.warningType
                  ? 'border-amber-300 dark:border-amber-700'
                  : 'border-gray-200 dark:border-gray-600';

              return (
                <div key={idx} className={`bg-white dark:bg-gray-700 border rounded-xl p-3 ${borderCls} ${isSelected ? 'ring-1 ring-green-400 dark:ring-green-600' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(idx)}
                        className="w-4 h-4 accent-green-600"
                      />
                      <span className="text-xs font-bold text-gray-400 font-mono">#{String(idx + 1).padStart(2, '0')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={entries.length === 1}
                      className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Truck / Entity + Fetch */}
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={entry.truckNo}
                      onChange={e => updateEntry(idx, 'truckNo', e.target.value.toUpperCase())}
                      onPaste={e => handleTruckPaste(idx, e)}
                      placeholder="Truck / Entity"
                      className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono focus:ring-1 focus:ring-green-500"
                    />
                    <button
                      type="button"
                      onClick={() => fetchTruck(idx, entry.truckNo)}
                      disabled={row.autoFetching || !entry.truckNo.trim()}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg disabled:opacity-40 transition-colors"
                    >
                      {row.autoFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                      Fetch
                    </button>
                  </div>

                  {/* Fetch result */}
                  {row.fetched && !row.warningType && row.fuelRecord && (
                    <div className="flex flex-col gap-1.5 mb-2 px-2.5 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                          <span className="text-[11px] font-semibold text-green-700 dark:text-green-400">
                            Dar Yard: {row.alreadyDispensed}L · Bal: {row.fuelRecord.balance}L
                          </span>
                        </div>
                        <button
                          type="button"
                          title="Inspect fuel record"
                          onClick={() => setInspectModal({
                            isOpen: true,
                            fuelRecordId: row.fuelRecordId!,
                            truckNumber: entry.truckNo,
                          })}
                          className="p-0.5 text-gray-400 hover:text-green-600 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={row.linked}
                          onChange={e => updateRow(idx, { linked: e.target.checked })}
                          className="w-3.5 h-3.5 accent-green-600"
                        />
                        <span className="text-[11px] font-semibold text-green-700 dark:text-green-400">
                          Link &amp; dispense{entry.liters > 0 ? ` ${entry.liters}L` : ''}
                        </span>
                      </label>
                    </div>
                  )}
                  {row.fetched && row.warningType && (
                    <div className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                      <span className="text-[11px] text-amber-700 dark:text-amber-400">No active fuel record — manual entry allowed</span>
                    </div>
                  )}

                  {/* DO + Dest */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">DO No</label>
                      <input
                        type="text"
                        value={entry.doNo}
                        onChange={e => updateEntry(idx, 'doNo', e.target.value.toUpperCase())}
                        placeholder="DO #"
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Destination</label>
                      <input
                        type="text"
                        value={entry.dest}
                        onChange={e => updateEntry(idx, 'dest', e.target.value)}
                        placeholder="Destination"
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                  </div>

                  {/* Liters / Rate / Amount */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Liters</label>
                      <input
                        type="number"
                        value={entry.liters || ''}
                        onChange={e => updateEntry(idx, 'liters', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        min={0.01}
                        step="0.01"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Rate</label>
                      <input
                        type="number"
                        value={entry.rate || ''}
                        onChange={e => updateEntry(idx, 'rate', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        min={0.01}
                        step="0.01"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Amount</label>
                      <div className="px-2 py-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                        {entry.amount > 0 ? fmt(entry.amount) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={addRow}
              className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-green-400 hover:text-green-600 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Row
            </button>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Total · {validEntries.length} valid {validEntries.length === 1 ? 'entry' : 'entries'}
              </div>
              <div className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                {mode === 'new' ? currency : (existingLpo?.currency ?? 'TZS')} {fmt(total)}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                {mode === 'add-entries' ? 'Done' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || validEntries.length === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {mode === 'new' ? 'Create LPO' : 'Save Entries'}
              </button>
            </div>
          </div>
          {mode === 'add-entries' && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
              After saving, the form resets so you can immediately add more entries to the same LPO.
            </p>
          )}
        </div>
      </div>

      {inspectModal.isOpen && inspectModal.fuelRecordId && (
        <FuelRecordInspectModal
          isOpen={inspectModal.isOpen}
          onClose={() => setInspectModal(prev => ({ ...prev, isOpen: false }))}
          fuelRecordId={inspectModal.fuelRecordId}
          truckNumber={inspectModal.truckNumber}
        />
      )}
    </div>
  );
}
