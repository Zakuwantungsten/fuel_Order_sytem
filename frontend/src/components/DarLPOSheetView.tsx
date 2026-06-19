import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  Plus, Edit2, X, Ban, Copy, ChevronDown,
  Loader2, XCircle, Search, AlertTriangle, Lock, Scissors, Link2,
  MessageSquare, FileDown, Printer, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { darLPOAPI } from '../services/api';
import DarLPOEntryForm from './DarLPOEntryForm';
import DarLPOPrint from './DarLPOPrint';
import { copyDarLPOForWhatsApp } from '../utils/darLPOTextGenerator';
import type { DarLPO, DarLPOEntry } from '../types';

const WRITE_ROLES = ['super_admin', 'admin', 'manager', 'supervisor', 'dar_yard'];

interface Props {
  lpo: DarLPO;
  onUpdated: () => void;
  onBack?: () => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

function generateCopyText(lpo: DarLPO): string {
  const active = lpo.entries.filter(e => !e.isCancelled);
  const totalLiters = active.reduce((s, e) => s + e.liters, 0);
  const totalAmount = active.reduce((s, e) => s + e.amount, 0);

  const header = [
    `*DAR YARD LPO*`,
    `LPO No: ${lpo.lpoNo}`,
    `Date: ${new Date(lpo.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    `Currency: ${lpo.currency}`,
    ``,
  ].join('\n');

  const rows = active.map((e, i) =>
    `${i + 1}. ${e.truckNo} | DO: ${e.doNo} | ${e.liters.toFixed(0)}L × ${e.rate} = ${fmt(e.amount)} | ${e.dest}`
  ).join('\n');

  const footer = [
    ``,
    `Total Liters: ${totalLiters.toLocaleString()} L`,
    `*Total Amount: ${fmt(totalAmount)} ${lpo.currency}*`,
    lpo.notes ? `Notes: ${lpo.notes}` : '',
  ].filter(Boolean).join('\n');

  return header + rows + footer;
}

// ── Amend Modal ────────────────────────────────────────────────────────────────
function AmendModal({
  entry,
  lpoId,
  onDone,
  onClose,
}: {
  entry: DarLPOEntry;
  lpoId: string;
  onDone: (updatedLpo: DarLPO) => void;
  onClose: () => void;
}) {
  const [newLiters, setNewLiters] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const liters = parseFloat(newLiters);
    if (isNaN(liters) || liters <= 0) { toast.error('Enter valid liters'); return; }
    if (liters >= entry.liters) { toast.error(`New liters must be less than current (${entry.liters})`); return; }
    setSaving(true);
    try {
      const updated = await darLPOAPI.amendEntry({
        lpoId,
        entryId: entry._id!,
        newLiters: liters,
        amendReason: reason || undefined,
      });
      toast.success(`Entry amended: ${entry.liters}L → ${liters}L`);
      onDone(updated);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to amend entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Amend Entry</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{entry.truckNo} — current: {entry.liters}L</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New Liters <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={newLiters}
              onChange={e => setNewLiters(e.target.value)}
              step="0.01"
              min={0.01}
              max={entry.liters - 0.01}
              placeholder={`Less than ${entry.liters}`}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
              autoFocus
              required
            />
            {newLiters && parseFloat(newLiters) > 0 && parseFloat(newLiters) < entry.liters && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Delta: −{(entry.liters - parseFloat(newLiters)).toFixed(2)}L
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Brief reason for amendment"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-3 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}
              Amend
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Cancel Entry Modal ─────────────────────────────────────────────────────────
function CancelEntryModal({
  entry,
  lpoId,
  onDone,
  onClose,
}: {
  entry: DarLPOEntry;
  lpoId: string;
  onDone: (updatedLpo: DarLPO) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const updated = await darLPOAPI.cancelEntry({ lpoId, entryId: entry._id!, cancellationReason: reason || undefined });
      toast.success(`Entry for ${entry.truckNo} cancelled`);
      onDone(updated);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to cancel entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
            <Ban className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Cancel Entry</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {entry.truckNo} · {entry.liters}L · {fmt(entry.amount)}
            </p>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This will reverse <strong>{entry.liters}L</strong> from the linked fuel record's <span className="font-mono text-green-600 dark:text-green-400">darYard</span> field and recalculate the balance.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Duplicate entry"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
              Back
            </button>
            <button onClick={handleConfirm} disabled={saving} className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
              Cancel Entry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cancel All Modal ───────────────────────────────────────────────────────────
function CancelAllModal({
  lpoNo,
  lpoId,
  onDone,
  onClose,
}: {
  lpoNo: string;
  lpoId: string;
  onDone: (updatedLpo: DarLPO) => void;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const updated = await darLPOAPI.cancelAll(lpoId, 'Bulk LPO cancellation');
      toast.success(`LPO ${lpoNo} — all entries cancelled`);
      onDone(updated);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to cancel LPO');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Cancel All Entries</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">LPO {lpoNo}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            All active entries will be cancelled and their liters reversed on the linked fuel records. This cannot be undone in bulk.
          </p>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
              Back
            </button>
            <button onClick={handleConfirm} disabled={saving} className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Cancel All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Manual Link Modal ──────────────────────────────────────────────────────────
function ManualLinkModal({
  entry,
  lpoId,
  onDone,
  onClose,
}: {
  entry: DarLPOEntry;
  lpoId: string;
  onDone: (updatedLpo: DarLPO) => void;
  onClose: () => void;
}) {
  const [doNo, setDoNo] = useState(entry.doNo);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doNo.trim()) { toast.error('DO number is required'); return; }
    setSaving(true);
    try {
      const updated = await darLPOAPI.manualLink({ lpoId, entryId: entry._id!, doNo: doNo.trim() });
      toast.success(`Entry linked — ${entry.liters}L added to darYard`);
      onDone(updated as DarLPO);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to link entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Link Entry Manually</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{entry.truckNo} · {entry.liters}L</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Enter the correct DO number to find the matching FuelRecord. <strong>{entry.liters}L</strong> will be added to{' '}
            <span className="font-mono text-green-600 dark:text-green-400">darYard</span> and the balance recalculated.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              DO Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={doNo}
              onChange={e => setDoNo(e.target.value)}
              placeholder="e.g. DO-2026-001"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm font-mono"
              autoFocus
              required
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Link
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Sheet View ────────────────────────────────────────────────────────────
export default function DarLPOSheetView({ lpo: initialLpo, onUpdated, onBack }: Props) {
  const { user } = useAuth();
  const canWrite = WRITE_ROLES.includes(user?.role ?? '');

  const [lpo, setLpo] = useState<DarLPO>(initialLpo);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [entrySearch, setEntrySearch] = useState('');
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<{ index: number; entry: DarLPOEntry } | null>(null);
  const [amendingEntry, setAmendingEntry] = useState<DarLPOEntry | null>(null);
  const [cancellingEntry, setCancellingEntry] = useState<DarLPOEntry | null>(null);
  const [linkingEntry, setLinkingEntry] = useState<DarLPOEntry | null>(null);
  const [showCancelAll, setShowCancelAll] = useState(false);

  const lpoId = (lpo._id ?? lpo.id) as string;

  useEffect(() => {
    setEntrySearch('');
    if (!lpo.lpoNo) return;
    let cancelled = false;
    setIsFetching(true);
    darLPOAPI.getByLPONo(lpo.lpoNo).then(fresh => {
      if (!cancelled && fresh) setLpo(fresh as DarLPO);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setIsFetching(false);
    });
    return () => { cancelled = true; };
  }, [lpo.lpoNo]);

  useEffect(() => {
    if (!isSaving && !showAddForm && !editingEntry && !amendingEntry && !cancellingEntry) {
      setLpo(initialLpo);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLpo.lpoNo]);

  const handleMutationResult = useCallback((updated: DarLPO) => {
    setLpo(updated);
    onUpdated();
  }, [onUpdated]);

  const handleAddEntry = async (newEntry: Omit<DarLPOEntry, '_id'>) => {
    setIsSaving(true);
    try {
      await darLPOAPI.acquireLock(lpoId);
      try {
        const updatedEntries = [...lpo.entries, newEntry];
        const updated = await darLPOAPI.update(lpoId, { entries: updatedEntries });
        toast.success('Entry added and fuel record updated');
        handleMutationResult(updated as DarLPO);
        setShowAddForm(false);
      } finally {
        await darLPOAPI.releaseLock(lpoId).catch(() => {});
      }
    } catch (err: any) {
      if (err?.response?.status === 423) {
        const holder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
        toast.error(`Locked by ${holder} — try again later`);
      } else {
        toast.error(err?.response?.data?.message || 'Failed to add entry');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditEntry = async (updatedEntry: Omit<DarLPOEntry, '_id'>) => {
    if (!editingEntry) return;
    setIsSaving(true);
    try {
      await darLPOAPI.acquireLock(lpoId);
      try {
        const updatedEntries = lpo.entries.map((e, i) =>
          i === editingEntry.index ? { ...editingEntry.entry, ...updatedEntry } : e
        );
        const updated = await darLPOAPI.update(lpoId, { entries: updatedEntries });
        toast.success('Entry updated');
        handleMutationResult(updated as DarLPO);
        setEditingEntry(null);
      } finally {
        await darLPOAPI.releaseLock(lpoId).catch(() => {});
      }
    } catch (err: any) {
      if (err?.response?.status === 423) {
        const holder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
        toast.error(`Locked by ${holder} — try again later`);
      } else {
        toast.error(err?.response?.data?.message || 'Failed to update entry');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(generateCopyText(lpo));
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed — please try manually');
    }
    setShowCopyDropdown(false);
  };

  const handleCopyWhatsApp = async () => {
    setShowCopyDropdown(false);
    const ok = await copyDarLPOForWhatsApp(lpo);
    if (ok) toast.success('WhatsApp text copied to clipboard');
    else toast.error('Copy failed — please try manually');
  };

  const handleExportPdf = async () => {
    if (!printRef.current) return;
    setDownloadingPdf(true);
    setShowCopyDropdown(false);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');
      const el = printRef.current;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 794,
        height: el.scrollHeight,
        windowWidth: 794,
        windowHeight: el.scrollHeight,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const imgWidthMm = 210;
      const pageHeightMm = 297;
      const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;
      const pdf = new jsPDF('p', 'mm', 'a4');
      let position = 0;
      let remaining = imgHeightMm;
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidthMm, imgHeightMm);
      remaining -= pageHeightMm;
      while (remaining > 0) {
        position -= pageHeightMm;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidthMm, imgHeightMm);
        remaining -= pageHeightMm;
      }
      pdf.save(`${lpo.lpoNo}-${lpo.date}.pdf`);
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('PDF export failed:', err);
      toast.error('Failed to generate PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    setShowCopyDropdown(false);
    const content = printRef.current.outerHTML;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
      toast.error('Pop-up blocked — please allow pop-ups and try again');
      return;
    }
    win.document.write(
      `<!DOCTYPE html><html><head><title>${lpo.lpoNo} — Dar Yard LPO</title></head><body style="margin:0">${content}</body></html>`
    );
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); win.close(); }, 500);
  };

  const activeEntries = lpo.entries.filter(e => !e.isCancelled);
  const totalLiters = activeEntries.reduce((s, e) => s + e.liters, 0);
  const allCancelled = lpo.entries.length > 0 && activeEntries.length === 0;

  const visibleEntries = entrySearch.trim()
    ? lpo.entries.filter(e => {
        const t = entrySearch.toLowerCase();
        return (
          e.truckNo.toLowerCase().includes(t) ||
          e.doNo.toLowerCase().includes(t) ||
          e.dest.toLowerCase().includes(t)
        );
      })
    : lpo.entries;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 relative">
      {isFetching && (
        <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 flex items-center justify-center z-10">
          <Loader2 className="w-7 h-7 text-green-500 animate-spin" />
        </div>
      )}

      {/* ── Mobile Header ── */}
      <div className="lg:hidden bg-gradient-to-br from-[#0f2318] to-[#071510] px-4 pt-4 pb-6 rounded-b-[20px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)' }}
                aria-label="Back to list"
              >
                <ArrowLeft className="w-4 h-4 text-[#c4cedd]" />
              </button>
            )}
            <div>
              <div className="text-[17px] font-extrabold text-white tracking-tight">{lpo.lpoNo}</div>
              <div className="text-xs text-[#6b9a7a] mt-0.5">{lpo.date} · {lpo.currency}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canWrite && !allCancelled && (
              <button
                onClick={() => setShowAddForm(true)}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-[10px] text-xs font-bold disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setShowCopyDropdown(v => !v)}
                className="w-9 h-9 rounded-[10px] flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)' }}
              >
                <ChevronDown className="w-4 h-4 text-[#c4cedd]" />
              </button>
              {showCopyDropdown && (
                <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50">
                  <button onClick={handleCopyText} className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Copy className="w-4 h-4 mr-3 text-gray-400" /> Copy as Text
                  </button>
                  <button onClick={handleCopyWhatsApp} className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <MessageSquare className="w-4 h-4 mr-3 text-green-500" /> Copy for WhatsApp
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700" />
                  <button onClick={handleExportPdf} disabled={downloadingPdf} className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                    {downloadingPdf ? <Loader2 className="w-4 h-4 mr-3 text-red-500 animate-spin" /> : <FileDown className="w-4 h-4 mr-3 text-red-500" />}
                    {downloadingPdf ? 'Generating…' : 'Export PDF'}
                  </button>
                  <button onClick={handlePrint} className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Printer className="w-4 h-4 mr-3 text-blue-500" /> Print
                  </button>
                  {canWrite && !allCancelled && (
                    <>
                      <div className="border-t border-gray-100 dark:border-gray-700" />
                      <button onClick={() => { setShowCopyDropdown(false); setShowCancelAll(true); }} className="flex items-center w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <XCircle className="w-4 h-4 mr-3" /> Cancel LPO
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[9.5px] font-semibold text-[#4a7a5a] uppercase tracking-wide mb-0.5">Trucks</div>
            <div className="text-[15px] font-bold text-[#eef2f8]">{activeEntries.length}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-semibold text-[#4a7a5a] uppercase tracking-wide mb-0.5">Liters</div>
            <div className="text-[15px] font-bold text-[#eef2f8]">{totalLiters.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-semibold text-[#4a7a5a] uppercase tracking-wide mb-0.5">Total</div>
            <div className="text-[15px] font-bold text-[#4ade80]">{fmt(lpo.total)}</div>
          </div>
        </div>
      </div>

      {/* ── Desktop Header ── */}
      <div className="hidden lg:flex items-center justify-between gap-4 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-4 flex-wrap">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-2 py-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Back to list"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}
          <span className="font-bold text-green-600 dark:text-green-400 font-mono">{lpo.lpoNo}</span>
          <span className="text-sm text-gray-600 dark:text-gray-400">Date: <strong className="text-gray-900 dark:text-gray-100">{lpo.date}</strong></span>
          <span className="text-sm text-gray-600 dark:text-gray-400">Currency: <strong className="text-gray-900 dark:text-gray-100">{lpo.currency}</strong></span>
          {lpo.notes && <span className="text-sm text-gray-500 dark:text-gray-400 italic truncate max-w-xs">{lpo.notes}</span>}
          {allCancelled && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
              Fully Cancelled
            </span>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={entrySearch}
              onChange={e => setEntrySearch(e.target.value)}
              placeholder="Search truck, DO…"
              className="pl-8 pr-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 w-36"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative">
            <button
              onClick={() => setShowCopyDropdown(v => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              <Copy className="w-3.5 h-3.5" /> Copy <ChevronDown className="w-3 h-3 ml-0.5" />
            </button>
            {showCopyDropdown && (
              <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Copy</div>
                <button onClick={handleCopyText} className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Copy className="w-4 h-4 mr-2 text-gray-400" /> Copy as Text
                </button>
                <button onClick={handleCopyWhatsApp} className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <MessageSquare className="w-4 h-4 mr-2 text-green-500" /> Copy for WhatsApp
                </button>
                <div className="border-t border-gray-100 dark:border-gray-700 my-0.5" />
                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Export</div>
                <button onClick={handleExportPdf} disabled={downloadingPdf} className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
                  {downloadingPdf ? <Loader2 className="w-4 h-4 mr-2 text-red-500 animate-spin" /> : <FileDown className="w-4 h-4 mr-2 text-red-500" />}
                  {downloadingPdf ? 'Generating…' : 'Export PDF'}
                </button>
                <button onClick={handlePrint} className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Printer className="w-4 h-4 mr-2 text-blue-500" /> Print
                </button>
              </div>
            )}
          </div>

          {canWrite && !allCancelled && (
            <>
              <button
                onClick={() => setShowAddForm(true)}
                disabled={isSaving}
                className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Entry
              </button>
              <button
                onClick={() => setShowCancelAll(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/40 rounded-lg transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel LPO
              </button>
            </>
          )}
        </div>
      </div>

      {allCancelled && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">All entries in this LPO have been cancelled</p>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {/* Mobile cards */}
        <div className="lg:hidden bg-[#eef1f5] dark:bg-gray-900 min-h-full">
          <div className="px-4 pt-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#97a3b6]" />
              <input
                type="text"
                value={entrySearch}
                onChange={e => setEntrySearch(e.target.value)}
                placeholder="Search truck, DO or destination"
                className="w-full h-11 pl-10 pr-4 border border-[#e3e8f0] rounded-[13px] bg-white text-[13.5px] font-semibold text-[#1f2937] placeholder-[#97a3b6] outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-2">
            <div className="text-[11px] font-extrabold tracking-wide uppercase text-[#56627a]">Entries</div>
            <div className="text-[10px] font-bold text-[#8a95a8] bg-[#e2e7ef] px-2 py-0.5 rounded-full">
              {lpo.entries.length} total
            </div>
          </div>

          <div className="flex flex-col gap-3 px-4 pb-4">
            {visibleEntries.map((entry, idx) => {
              const realIdx = lpo.entries.indexOf(entry);
              const isCancelled = entry.isCancelled;
              return (
                <div
                  key={entry._id ?? idx}
                  className="bg-white border border-[#eaeef4] rounded-[16px]"
                  style={{ opacity: isCancelled ? 0.65 : 1, boxShadow: '0 4px 16px -10px rgba(28,40,64,0.25)' }}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[16px] font-extrabold tracking-tight ${isCancelled ? 'line-through text-[#9aa4b6]' : 'text-[#1f2937]'}`}>
                            {entry.truckNo}
                          </span>
                          <span style={{
                            fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const,
                            padding: '2px 7px', borderRadius: '6px',
                            color: isCancelled ? '#dc2626' : entry.originalLiters ? '#d97706' : '#15924f',
                            background: isCancelled ? '#fdeaea' : entry.originalLiters ? '#fef3c7' : '#e7f7ee',
                          }}>
                            {isCancelled ? 'Cancelled' : entry.originalLiters ? 'Amended' : 'Active'}
                          </span>
                          {!entry.linkedFuelRecordId && !isCancelled && (
                            <span style={{ fontSize: '9.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', color: '#b45309', background: '#fef3c7' }}>
                              Unlinked
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[12px] font-semibold text-[#8893a6]">
                          <span>DO {entry.doNo}</span>
                          <span className="text-[#cbd3e0]">·</span>
                          <span>{entry.dest}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[9px] font-bold uppercase text-[#aab3c4] tracking-wide">Amount</div>
                        <div className={`text-[17px] font-extrabold tabular-nums ${isCancelled ? 'line-through text-[#9aa4b6]' : 'text-[#16202f]'}`}>
                          {fmt(entry.amount)}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2.5 mt-3">
                      <div className="flex-1 bg-[#f5f7fa] rounded-[10px] px-3 py-2">
                        <div className="text-[9px] font-bold uppercase text-[#9aa4b6] mb-0.5 tracking-wide">Liters</div>
                        <div className="text-[14px] font-extrabold text-[#2a3343] tabular-nums">
                          {entry.originalLiters != null && entry.originalLiters !== entry.liters && (
                            <span className="line-through text-[#9aa4b6] mr-1 text-xs">{entry.originalLiters}</span>
                          )}
                          {entry.liters.toFixed(0)}<span className="text-[10px] text-[#9aa4b6] ml-0.5">L</span>
                        </div>
                      </div>
                      <div className="flex-1 bg-[#f5f7fa] rounded-[10px] px-3 py-2">
                        <div className="text-[9px] font-bold uppercase text-[#9aa4b6] mb-0.5 tracking-wide">Rate</div>
                        <div className="text-[14px] font-extrabold text-[#2a3343] tabular-nums">
                          {entry.rate}<span className="text-[10px] text-[#9aa4b6] ml-0.5">/L</span>
                        </div>
                      </div>
                    </div>

                    {canWrite && (
                      <div className="flex gap-2 mt-3">
                        {isCancelled ? (
                          <div className="flex-1 flex items-center justify-center h-9 rounded-[10px] text-[12px] font-bold text-[#9aa4b6]">
                            Cancelled
                          </div>
                        ) : (
                          <>
                            {!entry.linkedFuelRecordId && (
                              <button
                                onClick={() => setLinkingEntry(entry)}
                                disabled={isSaving}
                                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d] text-[12px] font-bold disabled:opacity-50"
                              >
                                <Link2 className="w-3.5 h-3.5" /> Link
                              </button>
                            )}
                            <button
                              onClick={() => setEditingEntry({ index: realIdx, entry })}
                              disabled={isSaving}
                              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[10px] border border-[#dde3ec] bg-white text-[#344256] text-[12px] font-bold disabled:opacity-50"
                            >
                              <Edit2 className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              onClick={() => setAmendingEntry(entry)}
                              disabled={isSaving}
                              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[10px] border border-[#fde9c0] bg-[#fffbeb] text-[#b45309] text-[12px] font-bold disabled:opacity-50"
                            >
                              <Scissors className="w-3.5 h-3.5" /> Amend
                            </button>
                            <button
                              onClick={() => setCancellingEntry(entry)}
                              disabled={isSaving}
                              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[10px] border border-[#fbd0d0] bg-[#fef2f2] text-[#dc2626] text-[12px] font-bold disabled:opacity-50"
                            >
                              <Ban className="w-3.5 h-3.5" /> Void
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {visibleEntries.length === 0 && lpo.entries.length === 0 && (
              <div className="text-center py-10 text-[#9aa4b6]">
                <div className="text-[13px] font-semibold">No entries yet</div>
                {canWrite && (
                  <button onClick={() => setShowAddForm(true)} className="mt-2 text-[13px] font-bold text-[#16a34a] bg-transparent border-none cursor-pointer">
                    Add the first entry
                  </button>
                )}
              </div>
            )}

            {visibleEntries.length === 0 && entrySearch.trim() && (
              <div className="text-center py-8 text-[#9aa4b6]">
                <Search className="w-6 h-6 mx-auto mb-2 opacity-40" />
                <div className="text-[13px] font-semibold">No entries match</div>
                <button onClick={() => setEntrySearch('')} className="mt-1.5 text-[12px] font-bold text-[#16a34a] bg-transparent border-none cursor-pointer">
                  Clear search
                </button>
              </div>
            )}
          </div>

          <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[12px] text-[#15803d]">
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-[11px] font-semibold">Edit lock required for add / edit operations</span>
          </div>

          <div className="px-4 pb-6">
            <div className="flex items-center justify-between rounded-[18px] px-4 py-3" style={{ background: 'linear-gradient(160deg,#0f2318,#071510)', boxShadow: '0 16px 32px -12px rgba(7,21,16,0.7)' }}>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wide text-[#4a7a5a]">
                  {activeEntries.length} active · {totalLiters.toLocaleString()} L
                </div>
                <div className="text-[11px] font-semibold text-[#6aad82] mt-0.5">Active entries</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-bold uppercase tracking-wide text-[#4a7a5a]">Grand Total ({lpo.currency})</div>
                <div className="text-[20px] font-extrabold text-white tabular-nums">{fmt(lpo.total)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block p-5">
          <div className="max-w-5xl mx-auto border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[2rem_1fr_1fr_5rem_5rem_6rem_1fr_6rem] bg-green-50 dark:bg-green-900/30 border-b border-gray-200 dark:border-gray-700">
              {['#', 'DO No', 'Truck', 'Liters', 'Rate', 'Amount', 'Destination', 'Actions'].map((h, i) => (
                <div
                  key={h}
                  className={`px-2 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide ${i > 1 && i < 6 ? 'text-right' : ''} ${i < 7 ? 'border-r border-gray-200 dark:border-gray-700' : 'text-center'}`}
                >
                  {h}
                </div>
              ))}
            </div>

            {visibleEntries.map((entry, idx) => {
              const realIdx = lpo.entries.indexOf(entry);
              const isCancelled = entry.isCancelled;
              const rowCls = isCancelled
                ? 'bg-red-50 dark:bg-red-900/15 border-b border-red-100 dark:border-red-900/30'
                : 'border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50';
              return (
                <div key={entry._id ?? idx} className={`grid grid-cols-[2rem_1fr_1fr_5rem_5rem_6rem_1fr_6rem] ${rowCls}`}>
                  <div className="px-2 py-2 text-xs text-gray-400 border-r border-gray-200 dark:border-gray-700">{realIdx + 1}</div>
                  <div className="px-2 py-2 border-r border-gray-200 dark:border-gray-700">
                    <span className={`text-sm font-mono ${isCancelled ? 'line-through text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>
                      {entry.doNo}
                    </span>
                  </div>
                  <div className="px-2 py-2 border-r border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-medium ${isCancelled ? 'line-through text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>
                        {entry.truckNo}
                      </span>
                      {!entry.linkedFuelRecordId && !isCancelled && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-medium">
                          unlinked
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="px-2 py-2 border-r border-gray-200 dark:border-gray-700 text-right">
                    <span className={`text-sm ${isCancelled ? 'line-through text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>
                      {entry.originalLiters != null && entry.originalLiters !== entry.liters && (
                        <span className="text-gray-400 line-through mr-1 text-xs">{entry.originalLiters}</span>
                      )}
                      {entry.liters.toFixed(0)}
                    </span>
                  </div>
                  <div className="px-2 py-2 border-r border-gray-200 dark:border-gray-700 text-right">
                    <span className={`text-sm ${isCancelled ? 'line-through text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>
                      {entry.rate}
                    </span>
                  </div>
                  <div className="px-2 py-2 border-r border-gray-200 dark:border-gray-700 text-right">
                    <span className={`text-sm font-medium ${isCancelled ? 'line-through text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>
                      {fmt(entry.amount)}
                    </span>
                  </div>
                  <div className="px-2 py-2 border-r border-gray-200 dark:border-gray-700">
                    <span className={`text-sm ${isCancelled ? 'text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>{entry.dest}</span>
                  </div>
                  <div className="px-2 py-2 flex items-center justify-center gap-1">
                    {isCancelled ? (
                      <span className="text-xs text-red-500 font-medium">Cancelled</span>
                    ) : canWrite ? (
                      <>
                        {!entry.linkedFuelRecordId && (
                          <button
                            onClick={() => setLinkingEntry(entry)}
                            disabled={isSaving}
                            className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 disabled:opacity-40"
                            title="Link to FuelRecord manually"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setEditingEntry({ index: realIdx, entry })}
                          disabled={isSaving}
                          className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 disabled:opacity-40"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setAmendingEntry(entry)}
                          disabled={isSaving}
                          className="p-1 text-amber-600 hover:text-amber-800 dark:text-amber-400 disabled:opacity-40"
                          title="Amend (reduce liters)"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setCancellingEntry(entry)}
                          disabled={isSaving}
                          className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 disabled:opacity-40"
                          title="Cancel"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {lpo.entries.length === 0 && (
              <div className="py-12 text-center text-gray-400 dark:text-gray-500">
                <p className="text-sm font-medium">No entries</p>
                {canWrite && (
                  <button onClick={() => setShowAddForm(true)} className="mt-2 text-sm text-green-600 hover:underline">
                    Add the first entry
                  </button>
                )}
              </div>
            )}

            {visibleEntries.length === 0 && entrySearch.trim() && (
              <div className="py-8 text-center text-gray-400 dark:text-gray-500">
                <Search className="w-5 h-5 mx-auto mb-1.5 opacity-50" />
                <p className="text-sm">No entries match &ldquo;{entrySearch}&rdquo;</p>
                <button onClick={() => setEntrySearch('')} className="text-sm text-green-600 hover:underline mt-1">Clear</button>
              </div>
            )}

            <div className="bg-green-50 dark:bg-green-900/20 border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              <span className="text-xs font-medium text-green-700 dark:text-green-400">
                An edit lock is acquired automatically when you add or edit entries
              </span>
            </div>

            <div className="grid grid-cols-[2rem_1fr_1fr_5rem_5rem_6rem_1fr_6rem] bg-green-50 dark:bg-green-900/30 font-semibold">
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700" />
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700" />
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 uppercase">
                {activeEntries.length} active
              </div>
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700 text-right text-sm font-bold text-green-700 dark:text-green-300">
                {totalLiters.toLocaleString()}
              </div>
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700" />
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700 text-right text-sm font-bold text-green-900 dark:text-green-200">
                {fmt(lpo.total)}
              </div>
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">{lpo.currency}</div>
              <div className="px-2 py-2.5" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-4 max-w-5xl mx-auto">
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Active Entries</div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">{activeEntries.length}</div>
            </div>
            <div className="bg-cyan-50 dark:bg-cyan-900/20 p-3 rounded-lg">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Total Liters</div>
              <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400">{totalLiters.toLocaleString()}</div>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Total ({lpo.currency})</div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(lpo.total)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Hidden print target (off-screen, always mounted) ── */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '794px', pointerEvents: 'none' }}>
        <DarLPOPrint ref={printRef} data={lpo} preparedBy={user?.username} />
      </div>

      {showAddForm && (
        <DarLPOEntryForm
          defaultRate={lpo.entries.length > 0 ? lpo.entries[lpo.entries.length - 1].rate : undefined}
          onSave={handleAddEntry}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {editingEntry && (
        <DarLPOEntryForm
          entry={editingEntry.entry}
          defaultRate={editingEntry.entry.rate}
          onSave={handleEditEntry}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {amendingEntry && (
        <AmendModal
          entry={amendingEntry}
          lpoId={lpoId}
          onDone={updated => { setAmendingEntry(null); handleMutationResult(updated); }}
          onClose={() => setAmendingEntry(null)}
        />
      )}

      {cancellingEntry && (
        <CancelEntryModal
          entry={cancellingEntry}
          lpoId={lpoId}
          onDone={updated => { setCancellingEntry(null); handleMutationResult(updated); }}
          onClose={() => setCancellingEntry(null)}
        />
      )}

      {showCancelAll && (
        <CancelAllModal
          lpoNo={lpo.lpoNo}
          lpoId={lpoId}
          onDone={updated => { setShowCancelAll(false); handleMutationResult(updated); }}
          onClose={() => setShowCancelAll(false)}
        />
      )}

      {linkingEntry && (
        <ManualLinkModal
          entry={linkingEntry}
          lpoId={lpoId}
          onDone={updated => { setLinkingEntry(null); handleMutationResult(updated); }}
          onClose={() => setLinkingEntry(null)}
        />
      )}
    </div>
  );
}
