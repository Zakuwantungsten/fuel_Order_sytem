import { useState, useCallback, useEffect } from 'react';
import type { CSSProperties } from 'react';
import {
  X, Plus, Trash2, Loader2, Search, Eye,
  CheckCircle, AlertTriangle, Save,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';
import { tangaLPOAPI, fuelRecordsAPI, configAPI } from '../services/api';
import { tangaLPOKeys } from '../hooks/useTangaLPOs';
import FuelRecordInspectModal from './FuelRecordInspectModal';
import type { TangaLPO, TangaLPOEntry, FuelRecord } from '../types';

interface Props {
  mode: 'new' | 'add-entries';
  nextLpoNo?: string;
  existingLpo?: TangaLPO;
  onClose: () => void;
  onSuccess?: () => void;
}

type DraftEntry = Omit<TangaLPOEntry, '_id'>;

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

// Imported "Dar Yard LPO Form" design — table layout (Tanga uses a blue accent)
const GRID_COLS = '34px 28px minmax(96px,1.4fr) minmax(104px,1.3fr) minmax(64px,1fr) minmax(48px,0.7fr) minmax(56px,0.8fr) minmax(48px,0.7fr) minmax(58px,0.9fr) minmax(72px,1.2fr) 60px';
const HEAD_CELL: CSSProperties = {
  fontSize: '10.5px', fontWeight: 600, color: '#8a8f84',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

function isRecordComplete(r: FuelRecord): boolean {
  if (r.journeyStatus === 'completed') return true;
  if (r.journeyStatus === 'active' || r.journeyStatus === 'queued') return false;
  const dest = (r.originalGoingTo || r.to || '').toUpperCase();
  const isMSA = dest.includes('MSA') || dest.includes('MOMBASA');
  return isMSA ? !!(r.tangaReturn) : !!(r.mbeyaReturn);
}

export default function TangaYardLPOForm({
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

  // Pre-fill rate from Tanga yard config
  useEffect(() => {
    configAPI.getYardConfigs().then(configs => {
      const cfg = configs.find(c => c.yard === 'TANGA');
      if (cfg && cfg.rate > 0) {
        setEntries(prev => prev.map(e => e.rate === 0 ? { ...e, rate: cfg.rate } : e));
      }
    }).catch(() => {});
  }, []);

  const updateEntry = (idx: number, field: keyof DraftEntry, value: string | number | boolean | null) => {
    setEntries(prev => prev.map((e, i) => {
      if (i !== idx) return e;
      const u = { ...e, [field]: value };
      // Billed amount always tracks the full liters × rate — never the dispense amount.
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
        alreadyDispensed: record.tangaYard || 0,
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
      const linkResult = await tangaLPOAPI.bulkLink(lpoId, { entryIds: linkedEntryIds, topUpEntryIds });
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
        const result = await tangaLPOAPI.create({ date, currency, notes: notes || undefined, entries: validEntries });
        if (result.warnings?.length) {
          result.warnings.forEach((w: string) => toast.warn(w, { autoClose: 6000 }));
        }
        toast.success(`Tanga LPO ${result.data?.lpoNo ?? nextLpoNo} created`);
        const lpoId = (result.data?._id ?? result.data?.id)?.toString();
        if (lpoId) {
          await applyFuelLinks(lpoId, result.data?.entries || [], validWithIdx);
        }
        queryClient.invalidateQueries({ queryKey: tangaLPOKeys.all });
        onSuccess?.();
        onClose();
      } else {
        if (!existingLpo) return;
        const lpoId = (existingLpo._id ?? existingLpo.id) as string;
        await tangaLPOAPI.acquireLock(lpoId);
        try {
          const updatedEntries = [...existingLpo.entries, ...validEntries];
          const updateResult = await tangaLPOAPI.update(lpoId, { entries: updatedEntries });
          toast.success(
            `${validEntries.length} ${validEntries.length === 1 ? 'entry' : 'entries'} added to ${existingLpo.lpoNo}`
          );
          const existingCount = existingLpo.entries.length;
          const newResponseEntries = (updateResult?.entries || []).slice(existingCount);
          await applyFuelLinks(lpoId, newResponseEntries, validWithIdx);
          queryClient.invalidateQueries({ queryKey: tangaLPOKeys.all });
          onSuccess?.();
          resetEntries();
        } finally {
          await tangaLPOAPI.releaseLock(lpoId).catch(() => {});
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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {mode === 'new' ? 'New Tanga Yard LPO' : `Add Entries → ${existingLpo?.lpoNo}`}
            </h2>
            {mode === 'new' && nextLpoNo && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                LPO Number:{' '}
                <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{nextLpoNo}</span>
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
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Currency</label>
                <select
                  value={currency} onChange={e => setCurrency(e.target.value as 'TZS' | 'USD')}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="TZS">TZS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notes</label>
                <input
                  type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Entry Table ── */}
        <div className="flex-1 overflow-auto">

          {/* Desktop table — imported "Dar Yard LPO Form" design (Tanga blue accent) */}
          <div className="tlpo-table hidden sm:block" style={{ padding: '16px 22px' }}>
            <style>{`
.tlpo-table input:focus, .tlpo-table select:focus { border-color:#1d6fc9 !important; box-shadow:0 0 0 3px rgba(29,111,201,0.14) !important; }
.tlpo-table input.disp-input:focus { border-color:#c2820a !important; box-shadow:0 0 0 3px rgba(180,105,14,0.14) !important; }
.tlpo-table input::placeholder { color:#b4b8ae; }
.tlpo-table .fetch-btn:hover:not(:disabled) { background:#e2edfb !important; }
.tlpo-table .row-action:hover:not(:disabled) { background:#fdf2f1 !important; color:#c2362c !important; }
.tlpo-table .inspect-btn:hover { background:#eaf1fb !important; color:#2563c9 !important; }
.tlpo-table .apply-btn:hover:not(:disabled) { background:#1a63b4 !important; }
.tlpo-table .delete-btn:hover { background:#fdf2f1 !important; }
.tlpo-table .clear-btn:hover { color:#161a16 !important; }
.tlpo-table .addrow-btn:hover { border-color:#9cc2e8 !important; color:#1d6fc9 !important; background:#f5f9fe !important; }
.tlpo-table input[type=number]::-webkit-inner-spin-button, .tlpo-table input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
.tlpo-table input[type=number] { -moz-appearance:textfield; }
            `}</style>
            <div style={{ border: '1px solid #e8eae3', borderRadius: '12px', overflow: 'hidden' }}>

              {/* Column header */}
              <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, background: '#eff5fc', borderBottom: '1px solid #dde8f5' }}>
                <div style={{ padding: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ width: 14, height: 14, accentColor: '#1d6fc9', cursor: 'pointer' }} />
                </div>
                <div style={{ ...HEAD_CELL, padding: '10px 4px' }}>#</div>
                <div style={{ ...HEAD_CELL, padding: '10px 8px' }}>Truck / Entity</div>
                <div style={{ ...HEAD_CELL, padding: '10px 8px' }}>Fuel Record</div>
                <div style={{ ...HEAD_CELL, padding: '10px 8px' }}>DO No</div>
                <div style={{ ...HEAD_CELL, padding: '10px 8px', textAlign: 'right' }}>Liters</div>
                <div style={{ ...HEAD_CELL, padding: '10px 8px', textAlign: 'right' }}>Dispense</div>
                <div style={{ ...HEAD_CELL, padding: '10px 8px', textAlign: 'right' }}>Rate</div>
                <div style={{ ...HEAD_CELL, padding: '10px 8px', textAlign: 'right' }}>Amount</div>
                <div style={{ ...HEAD_CELL, padding: '10px 8px' }}>Destination</div>
                <div style={{ ...HEAD_CELL, padding: '10px 8px', textAlign: 'center' }}>Actions</div>
              </div>

              {/* Bulk bar */}
              {selectedRows.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '9px 14px', background: '#eef5fc', borderBottom: '1px solid #d6e4f5' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#1d6fc9' }}>{selectedRows.size} selected</span>
                  <div style={{ width: '1px', height: '18px', background: '#cddff5' }} />
                  <input
                    type="number" value={bulkLiters} onChange={e => setBulkLiters(e.target.value)} placeholder="Set liters"
                    style={{ width: '104px', padding: '6px 9px', fontSize: '12px', border: '1px solid #cfdef2', borderRadius: '7px', background: '#fff', color: '#161a16', outline: 'none', textAlign: 'right' }}
                  />
                  <input
                    type="number" value={bulkRate} onChange={e => setBulkRate(e.target.value)} placeholder="Set rate"
                    style={{ width: '104px', padding: '6px 9px', fontSize: '12px', border: '1px solid #cfdef2', borderRadius: '7px', background: '#fff', color: '#161a16', outline: 'none', textAlign: 'right' }}
                  />
                  <button
                    type="button" className="apply-btn" onClick={handleBulkApply} disabled={bulkLiters === '' && bulkRate === ''}
                    style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, color: '#fff', background: '#1d6fc9', border: 'none', borderRadius: '7px', cursor: 'pointer', opacity: bulkLiters === '' && bulkRate === '' ? 0.4 : 1 }}
                  >
                    Apply
                  </button>
                  <button
                    type="button" className="delete-btn" onClick={handleBulkDelete}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, color: '#c2362c', background: '#fff', border: '1px solid #efcfca', borderRadius: '7px', cursor: 'pointer' }}
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                  <button
                    type="button" className="clear-btn" onClick={() => setSelectedRows(new Set())}
                    style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 500, color: '#7c8278', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Rows */}
              {entries.map((entry, idx) => {
                const row = rows[idx] || makeEmptyRow();
                const isSelected = selectedRows.has(idx);
                const showFuel = row.fetched && !row.warningType && !!row.fuelRecord;
                const showDispense = row.fetched && !row.warningType && row.linked;
                const accent = row.warningType ? '#e2b24a' : (showFuel ? '#5a9be0' : 'transparent');

                return (
                  <div
                    key={idx}
                    style={{ display: 'grid', gridTemplateColumns: GRID_COLS, borderBottom: '1px solid #f0f1ec', borderLeft: `3px solid ${accent}`, background: isSelected ? '#f2f7fd' : '#fff' }}
                  >
                    {/* Select */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelectRow(idx)} style={{ width: 14, height: 14, accentColor: '#1d6fc9', cursor: 'pointer' }} />
                    </div>

                    {/* # */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 4px', fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: '12px', color: '#aab0a4' }}>
                      {String(idx + 1).padStart(2, '0')}
                    </div>

                    {/* Truck / Entity + fetch */}
                    <div style={{ padding: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="text"
                          value={entry.truckNo}
                          onChange={e => updateEntry(idx, 'truckNo', e.target.value.toUpperCase())}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchTruck(idx, entry.truckNo); } }}
                          onPaste={e => handleTruckPaste(idx, e)}
                          placeholder="T 000 XXX / Entity"
                          style={{ flex: 1, minWidth: 0, padding: '7px 9px', fontSize: '13px', fontFamily: "'Geist Mono', ui-monospace, monospace", fontWeight: 500, border: '1px solid #e2e4dd', borderRadius: '7px', background: '#fff', color: '#161a16', outline: 'none' }}
                        />
                        <button
                          type="button"
                          className="fetch-btn"
                          onClick={() => fetchTruck(idx, entry.truckNo)}
                          disabled={row.autoFetching || !entry.truckNo.trim()}
                          title="Fetch details (Enter)"
                          style={{ flexShrink: 0, width: '30px', height: '30px', border: '1px solid #cfdef2', background: '#eef5fc', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#1d6fc9', opacity: row.autoFetching || !entry.truckNo.trim() ? 0.5 : 1 }}
                        >
                          {row.autoFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Fuel Record */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px' }}>
                      {showFuel ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <CheckCircle className="w-3 h-3" style={{ color: '#2575d6', flexShrink: 0 }} />
                            <span style={{ fontSize: '11px', color: '#3a6ea5', fontWeight: 500, whiteSpace: 'nowrap' }}>
                              Bal {fmt(row.fuelRecord!.balance)}L · Tanga {fmt(row.alreadyDispensed)}L
                            </span>
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px', cursor: 'pointer', userSelect: 'none' }}>
                            <input type="checkbox" checked={row.linked} onChange={e => updateRow(idx, { linked: e.target.checked })} style={{ width: 13, height: 13, accentColor: '#1d6fc9', cursor: 'pointer' }} />
                            <span style={{ fontSize: '11px', color: '#7c8278', fontWeight: 500 }}>Link &amp; dispense</span>
                          </label>
                        </div>
                      ) : row.warningType ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#fdf4e3', border: '1px solid #f2e0b8', borderRadius: '6px', padding: '4px 7px' }}>
                          <AlertTriangle className="w-3 h-3" style={{ color: '#b4690e', flexShrink: 0 }} />
                          <span style={{ fontSize: '11px', color: '#b4690e', fontWeight: 500 }}>No active record</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '13px', color: '#d3d6cf' }}>—</span>
                      )}
                    </div>

                    {/* DO No */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '8px' }}>
                      <input
                        type="text"
                        value={entry.doNo}
                        onChange={e => updateEntry(idx, 'doNo', e.target.value.toUpperCase())}
                        placeholder="DO #"
                        style={{ width: '100%', padding: '7px 9px', fontSize: '13px', fontFamily: "'Geist Mono', ui-monospace, monospace", border: '1px solid #e2e4dd', borderRadius: '7px', background: '#fff', color: '#161a16', outline: 'none' }}
                      />
                    </div>

                    {/* Liters */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '8px' }}>
                      <input
                        type="number"
                        value={entry.liters || ''}
                        onChange={e => updateEntry(idx, 'liters', parseFloat(e.target.value) || 0)}
                        placeholder="0" min={0.01} step="0.01"
                        style={{ width: '100%', padding: '7px 9px', fontSize: '13px', textAlign: 'right', border: '1px solid #e2e4dd', borderRadius: '7px', background: '#fff', color: '#161a16', outline: 'none' }}
                      />
                    </div>

                    {/* Dispense — liters that actually go to the fuel record (defaults to full liters) */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '8px' }}>
                      {showDispense ? (
                        <input
                          className="disp-input"
                          type="number"
                          value={(entry.dispenseLiters ?? entry.liters) || ''}
                          onChange={e => updateEntry(idx, 'dispenseLiters', e.target.value === '' ? null : (parseFloat(e.target.value) || 0))}
                          placeholder={String(entry.liters || 0)}
                          min={0} step="0.01"
                          title="Liters dispensed to the fuel record (defaults to the full liters)"
                          style={{ width: '100%', padding: '7px 9px', fontSize: '13px', textAlign: 'right', border: '1px solid #ecc98f', borderRadius: '7px', background: '#fdf6e8', color: '#161a16', outline: 'none' }}
                        />
                      ) : (
                        <span style={{ width: '100%', textAlign: 'right', fontSize: '13px', color: '#d3d6cf' }}>—</span>
                      )}
                    </div>

                    {/* Rate */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '8px' }}>
                      <input
                        type="number"
                        value={entry.rate || ''}
                        onChange={e => updateEntry(idx, 'rate', parseFloat(e.target.value) || 0)}
                        placeholder="0" min={0.01} step="0.01"
                        style={{ width: '100%', padding: '7px 9px', fontSize: '13px', textAlign: 'right', border: '1px solid #e2e4dd', borderRadius: '7px', background: '#fff', color: '#161a16', outline: 'none' }}
                      />
                    </div>

                    {/* Amount */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '8px', fontSize: '13px', fontWeight: 600, color: '#2a2f29', fontVariantNumeric: 'tabular-nums' }}>
                      {entry.amount > 0 ? <span>{fmt(entry.amount)}</span> : <span style={{ color: '#d3d6cf', fontWeight: 400 }}>—</span>}
                    </div>

                    {/* Destination */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '8px' }}>
                      <input
                        type="text"
                        value={entry.dest}
                        onChange={e => updateEntry(idx, 'dest', e.target.value)}
                        placeholder="Destination"
                        style={{ width: '100%', padding: '7px 9px', fontSize: '13px', border: '1px solid #e2e4dd', borderRadius: '7px', background: '#fff', color: '#161a16', outline: 'none' }}
                      />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', padding: '8px 4px' }}>
                      {row.fetched && row.fuelRecordId && (
                        <button
                          type="button"
                          className="inspect-btn"
                          title="Inspect fuel record"
                          onClick={() => setInspectModal({ isOpen: true, fuelRecordId: row.fuelRecordId!, truckNumber: entry.truckNo })}
                          style={{ width: '28px', height: '28px', border: 'none', background: 'none', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9aa094' }}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="row-action"
                        onClick={() => removeRow(idx)}
                        disabled={entries.length === 1}
                        title="Remove row"
                        style={{ width: '28px', height: '28px', border: 'none', background: 'none', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9aa094', opacity: entries.length === 1 ? 0.3 : 1 }}
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
              className="addrow-btn"
              onClick={addRow}
              style={{ marginTop: '12px', width: '100%', padding: '11px', border: '1.5px dashed #d4d8cf', background: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 500, color: '#7c8278', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', transition: 'all .15s' }}
            >
              <Plus className="w-4 h-4" /> Add Row
            </button>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden p-3 space-y-3">
            {selectedRows.size > 0 && (
              <div className="flex items-center gap-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl flex-wrap">
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">{selectedRows.size} selected</span>
                <input type="number" value={bulkLiters} onChange={e => setBulkLiters(e.target.value)} placeholder="Liters" className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                <input type="number" value={bulkRate} onChange={e => setBulkRate(e.target.value)} placeholder="Rate" className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                <button type="button" onClick={handleBulkApply} disabled={bulkLiters === '' && bulkRate === ''} className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40 transition-colors">Apply</button>
                <button type="button" onClick={handleBulkDelete} className="px-2.5 py-1 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded transition-colors">Delete</button>
                <button type="button" onClick={() => setSelectedRows(new Set())} className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">Clear</button>
              </div>
            )}
            {entries.map((entry, idx) => {
              const row = rows[idx] || makeEmptyRow();
              const isSelected = selectedRows.has(idx);
              const borderCls =
                row.fetched && !row.warningType
                  ? 'border-blue-300 dark:border-blue-700'
                  : row.warningType
                  ? 'border-amber-300 dark:border-amber-700'
                  : 'border-gray-200 dark:border-gray-600';

              return (
                <div key={idx} className={`bg-white dark:bg-gray-700 border rounded-xl p-3 ${borderCls} ${isSelected ? 'ring-1 ring-blue-400 dark:ring-blue-600' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(idx)}
                        className="w-4 h-4 accent-blue-600"
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
                      className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => fetchTruck(idx, entry.truckNo)}
                      disabled={row.autoFetching || !entry.truckNo.trim()}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg disabled:opacity-40 transition-colors"
                    >
                      {row.autoFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                      Fetch
                    </button>
                  </div>

                  {/* Fetch result */}
                  {row.fetched && !row.warningType && row.fuelRecord && (
                    <div className="flex flex-col gap-1.5 mb-2 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                          <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                            Tanga Yard: {row.alreadyDispensed}L · Bal: {row.fuelRecord.balance}L
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
                          className="p-0.5 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={row.linked}
                          onChange={e => updateRow(idx, { linked: e.target.checked })}
                          className="w-3.5 h-3.5 accent-blue-600"
                        />
                        <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                          Link &amp; dispense
                        </span>
                      </label>
                      {row.linked && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Dispense to journey</span>
                          <input
                            type="number"
                            value={(entry.dispenseLiters ?? entry.liters) || ''}
                            onChange={e => updateEntry(idx, 'dispenseLiters', e.target.value === '' ? null : (parseFloat(e.target.value) || 0))}
                            placeholder={String(entry.liters || 0)}
                            min={0}
                            step="0.01"
                            title="Liters dispensed to the fuel record (defaults to the full liters)"
                            className="w-20 px-2 py-1 text-xs text-right border border-amber-300 dark:border-amber-700 rounded bg-amber-50/40 dark:bg-amber-900/10 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-amber-500"
                          />
                          <span className="text-[11px] text-gray-400">L</span>
                        </div>
                      )}
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
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Destination</label>
                      <input
                        type="text"
                        value={entry.dest}
                        onChange={e => updateEntry(idx, 'dest', e.target.value)}
                        placeholder="Destination"
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500"
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
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500"
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
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500"
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
              className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-1.5"
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
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
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
