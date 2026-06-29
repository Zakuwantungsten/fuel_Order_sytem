import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  Plus, Edit2, X, Ban, Copy, ChevronDown, Check,
  Loader2, XCircle, Search, AlertTriangle, Lock, Scissors, Link2,
  MessageSquare, FileDown, Printer, ArrowLeft, Eye,
} from 'lucide-react';
import FuelRecordInspectModal from './FuelRecordInspectModal';
import { useAuth } from '../contexts/AuthContext';
import { tangaLPOAPI } from '../services/api';
import TangaYardLPOForm from './TangaYardLPOForm';
import TangaLPOEntryForm from './TangaLPOEntryForm';
import TangaLPOPrint from './TangaLPOPrint';
import { copyTangaLPOForWhatsApp } from '../utils/tangaLPOTextGenerator';
import type { TangaLPO, TangaLPOEntry } from '../types';

const WRITE_ROLES = ['super_admin', 'admin', 'manager', 'supervisor', 'tanga_yard'];

interface Props {
  lpo: TangaLPO;
  onUpdated: () => void;
  onBack?: () => void;
  initialTruckNo?: string;
}

type BulkLinkResult = {
  entryId: string;
  status: 'linked' | 'topped_up' | 'conflict' | 'not_found' | 'already_linked';
  truckNo: string;
  doNo: string;
  liters: number;
  dispenseLiters?: number;
  existingValue?: number;
};

// One candidate fuel record the user can pick for an entry. Auto-link matches by
// truck, so an entry can have several candidates within the time window.
type PreviewCandidate = {
  fuelRecordId: string;
  date: string;
  goingDo: string;
  returnDo?: string;
  existingValue: number;
  fuelRecord: any;
};

type BulkPreviewResult = {
  entryId: string;
  status: 'found' | 'not_found';
  truckNo: string;
  doNo: string;
  liters: number;
  dispenseLiters: number;
  candidates: PreviewCandidate[];
};

// One confirmed selection sent to the bulk-link endpoint.
type BulkSelection = { entryId: string; fuelRecordId: string; dispenseLiters: number; topUp: boolean };

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

function generateCopyText(lpo: TangaLPO): string {
  const active = lpo.entries.filter(e => !e.isCancelled);
  const totalLiters = active.reduce((s, e) => s + e.liters, 0);
  const totalAmount = active.reduce((s, e) => s + e.amount, 0);

  const header = [
    `*TANGA YARD LPO*`,
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
  entry: TangaLPOEntry;
  lpoId: string;
  onDone: (updatedLpo: TangaLPO) => void;
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
      const updated = await tangaLPOAPI.amendEntry({
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
  entry: TangaLPOEntry;
  lpoId: string;
  onDone: (updatedLpo: TangaLPO) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const updated = await tangaLPOAPI.cancelEntry({ lpoId, entryId: entry._id!, cancellationReason: reason || undefined });
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
            This will reverse <strong>{entry.liters}L</strong> from the linked fuel record's <span className="font-mono text-blue-600 dark:text-blue-400">tangaYard</span> field and recalculate the balance.
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
  onDone: (updatedLpo: TangaLPO) => void;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const updated = await tangaLPOAPI.cancelAll(lpoId, 'Bulk LPO cancellation');
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

// ── Manual Link Modal (2-step: search → preview → confirm) ────────────────────
function ManualLinkModal({
  entry,
  lpoId,
  onDone,
  onClose,
}: {
  entry: TangaLPOEntry;
  lpoId: string;
  onDone: (updatedLpo: TangaLPO) => void;
  onClose: () => void;
}) {
  const [doNo, setDoNo] = useState(entry.doNo ?? '');
  const [dispense, setDispense] = useState(String(entry.dispenseLiters ?? entry.liters));
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [searching, setSearching] = useState(false);
  const [previewRecord, setPreviewRecord] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [inspectFrId, setInspectFrId] = useState<string | null>(null);

  const dispenseNum = dispense === '' ? entry.liters : (parseFloat(dispense) || 0);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doNo.trim()) { toast.error('DO number is required'); return; }
    setSearching(true);
    try {
      const result = await tangaLPOAPI.previewManualLink({ lpoId, entryId: entry._id!, doNo: doNo.trim() });
      setPreviewRecord(result.fuelRecord);
      setStep('preview');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No matching fuel record found');
    } finally {
      setSearching(false);
    }
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const updated = await tangaLPOAPI.manualLink({ lpoId, entryId: entry._id!, doNo: doNo.trim(), dispenseLiters: dispenseNum });
      toast.success(`Entry linked — ${dispenseNum}L added to tangaYard`);
      onDone(updated as TangaLPO);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to link entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {step === 'input' ? 'Link Entry Manually' : 'Confirm Link'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{entry.truckNo} · {entry.liters}L</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {step === 'input' ? (
            <form onSubmit={handleSearch} className="p-4 space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Enter the DO number to find the matching FuelRecord. The dispensed liters (default{' '}
                <strong>{entry.liters}L</strong>) will be added to{' '}
                <span className="font-mono text-blue-600 dark:text-blue-400">tangaYard</span> and the balance recalculated.
                You can adjust the amount on the next step.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">DO Number <span className="text-red-500">*</span></label>
                <input type="text" value={doNo} onChange={e => setDoNo(e.target.value)} placeholder="e.g. DO-2026-001"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm font-mono"
                  autoFocus required />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={searching} className="flex-1 px-3 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5">
                  {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Search
                </button>
              </div>
            </form>
          ) : (
            <div className="p-4 space-y-3">
              {previewRecord && (
                <div className="border border-amber-200 dark:border-amber-800 rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{previewRecord.truckNo}</span>
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{previewRecord.date}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectFrId(String(previewRecord._id || previewRecord.id))}
                      className="p-1 rounded text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
                      title="View full fuel record breakdown"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div><span className="text-gray-500 dark:text-gray-400">Going DO:</span><span className="ml-1 font-mono text-gray-800 dark:text-gray-200">{previewRecord.goingDo || '—'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Return DO:</span><span className="ml-1 font-mono text-gray-800 dark:text-gray-200">{previewRecord.returnDo || '—'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Balance:</span>
                      <span className={`ml-1 font-bold ${(previewRecord.balance ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {previewRecord.balance?.toFixed(0) ?? 'N/A'}L
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Tanga Yard now:</span>
                      <span className={`ml-1 font-bold ${(previewRecord.tangaYard ?? 0) > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'}`}>
                        {previewRecord.tangaYard ?? 0}L
                      </span>
                    </div>
                  </div>
                  {(previewRecord.tangaYard ?? 0) > 0 && (
                    <p className="text-xs text-orange-600 dark:text-orange-400">
                      Top-up: {previewRecord.tangaYard}L + {dispenseNum}L = {(previewRecord.tangaYard ?? 0) + dispenseNum}L
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 px-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Dispense to journey</label>
                <input
                  type="number"
                  value={dispense}
                  onChange={e => setDispense(e.target.value)}
                  min={0}
                  step="0.01"
                  placeholder={String(entry.liters)}
                  title="Liters added to tangaYard (defaults to the full liters)"
                  className="w-24 px-2 py-1.5 text-sm text-right border border-amber-300 dark:border-amber-700 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
                <span className="text-xs text-gray-400">L · billed {entry.liters}L</span>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setStep('input')} className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">Back</button>
                <button type="button" onClick={handleConfirm} disabled={saving} className="flex-1 px-3 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  Confirm Link
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {inspectFrId && (
        <FuelRecordInspectModal
          isOpen
          onClose={() => setInspectFrId(null)}
          fuelRecordId={inspectFrId}
          truckNumber={previewRecord?.truckNo}
        />
      )}
    </>
  );
}

// ── Bulk Link Conflict Modal ───────────────────────────────────────────────────
function BulkLinkConflictModal({
  conflicts, onConfirm, onClose,
}: {
  conflicts: BulkLinkResult[];
  onConfirm: (topUpIds: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(conflicts.map(c => c.entryId)));

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Tanga Yard Already Has Values</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {conflicts.length} {conflicts.length === 1 ? 'entry' : 'entries'} already have fuel recorded. Choose which to top-up.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-2 max-h-72 overflow-auto">
          {conflicts.map(c => {
            const checked = selected.has(c.entryId);
            const disp = c.dispenseLiters ?? c.liters;
            const newTotal = (c.existingValue ?? 0) + disp;
            return (
              <button
                key={c.entryId}
                type="button"
                onClick={() => toggle(c.entryId)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                  checked
                    ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30'
                }`}
              >
                <div className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                  checked ? 'border-blue-600 bg-blue-600' : 'border-gray-400 dark:border-gray-500'
                }`}>
                  {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.truckNo}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{c.doNo}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs flex-wrap">
                    <span className="text-gray-500">Current:</span>
                    <span className="font-semibold text-orange-600 dark:text-orange-400">{c.existingValue}L</span>
                    <span className="text-gray-400">+</span>
                    <span className="text-gray-500">Dispense:</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">{disp}L</span>
                    <span className="text-gray-400">=</span>
                    <span className="font-bold text-blue-700 dark:text-blue-300">{newTotal}L</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose}
            className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
            Skip All
          </button>
          <button
            type="button"
            onClick={() => onConfirm(Array.from(selected))}
            disabled={selected.size === 0}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <Link2 className="w-3.5 h-3.5" />
            Top-up {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Link Preview Modal ────────────────────────────────────────────────────
function BulkLinkPreviewModal({
  results,
  onConfirm,
  onClose,
}: {
  results: BulkPreviewResult[];
  onConfirm: (selections: BulkSelection[]) => void;
  onClose: () => void;
}) {
  const actionable = results.filter(r => r.status === 'found' && r.candidates.length > 0);
  const notFound = results.filter(r => r.status === 'not_found');
  const [selected, setSelected] = useState<Set<string>>(new Set(actionable.map(r => r.entryId)));
  // Default chosen candidate per entry: the most recent (candidates[0]).
  const [chosen, setChosen] = useState<Record<string, string>>(
    () => Object.fromEntries(actionable.map(r => [r.entryId, r.candidates[0].fuelRecordId]))
  );
  const [dispense, setDispense] = useState<Record<string, string>>(
    () => Object.fromEntries(actionable.map(r => [r.entryId, String(r.dispenseLiters ?? r.liters)]))
  );
  const [inspectFrId, setInspectFrId] = useState<string | null>(null);
  const [inspectTruckNo, setInspectTruckNo] = useState<string | undefined>(undefined);

  const setDisp = (id: string, v: string) => setDispense(prev => ({ ...prev, [id]: v }));
  const dispVal = (r: BulkPreviewResult) => {
    const raw = dispense[r.entryId];
    return raw === '' || raw == null ? (r.dispenseLiters ?? r.liters) : (parseFloat(raw) || 0);
  };
  const chosenCand = (r: BulkPreviewResult): PreviewCandidate =>
    r.candidates.find(c => c.fuelRecordId === chosen[r.entryId]) ?? r.candidates[0];

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const allChecked = selected.size === actionable.length && actionable.length > 0;
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(actionable.map(r => r.entryId)));

  const handleConfirm = () => {
    const selections: BulkSelection[] = actionable
      .filter(r => selected.has(r.entryId))
      .map(r => {
        const cand = chosenCand(r);
        return {
          entryId: r.entryId,
          fuelRecordId: cand.fuelRecordId,
          dispenseLiters: dispVal(r),
          // Selecting an entry whose chosen record already has a yard value
          // approves the top-up (keeps the conflict/top-up flow).
          topUp: (cand.existingValue ?? 0) > 0,
        };
      });
    onConfirm(selections);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Auto-Link Preview</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {actionable.length} matched · {notFound.length} not found — pick a fuel record per truck
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-4">
            {actionable.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <button type="button" onClick={toggleAll}
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${allChecked ? 'border-blue-600 bg-blue-600' : 'border-gray-400 dark:border-gray-500'}`}>
                    {allChecked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </button>
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                    Matched ({actionable.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {actionable.map(r => {
                    const checked = selected.has(r.entryId);
                    const cand = chosenCand(r);
                    const isConflict = (cand.existingValue ?? 0) > 0;
                    return (
                      <div key={r.entryId}
                        className={`p-2.5 rounded-lg border ${
                          checked
                            ? isConflict
                              ? 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20'
                              : 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20'
                        }`}>
                        <div className="flex items-center gap-2.5">
                          <button type="button" onClick={() => toggle(r.entryId)}
                            className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                              checked
                                ? isConflict ? 'border-orange-600 bg-orange-600' : 'border-blue-600 bg-blue-600'
                                : 'border-gray-400 dark:border-gray-500'
                            }`}>
                            {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{r.truckNo}</span>
                              <span className="text-[11px] text-gray-400">{r.candidates.length} record{r.candidates.length === 1 ? '' : 's'}</span>
                              {isConflict && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 rounded font-medium">top-up</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[11px] text-gray-500 dark:text-gray-400">Dispense</span>
                              <input
                                type="number"
                                value={dispense[r.entryId] ?? ''}
                                onChange={e => setDisp(r.entryId, e.target.value)}
                                onClick={e => e.stopPropagation()}
                                min={0}
                                step="0.01"
                                placeholder={String(r.liters)}
                                title={`Liters added to tangaYard (billed ${r.liters}L)`}
                                className="w-16 px-1.5 py-0.5 text-xs text-right border border-amber-300 dark:border-amber-700 rounded bg-amber-50/50 dark:bg-amber-900/10 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-amber-500"
                              />
                              <span className="text-[11px] text-gray-400">L → tangaYard</span>
                              {isConflict && (
                                <span className="text-[11px] text-orange-600 dark:text-orange-400">({cand.existingValue}L + {dispVal(r)}L = {cand.existingValue + dispVal(r)}L)</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Candidate picker — one fuel record to link this entry to */}
                        <div className="mt-2 pl-6 space-y-1">
                          {r.candidates.map(c => {
                            const picked = cand.fuelRecordId === c.fuelRecordId;
                            return (
                              <div key={c.fuelRecordId}
                                className={`flex items-center gap-2 p-1.5 rounded-md border text-xs cursor-pointer ${
                                  picked
                                    ? 'border-blue-400 dark:border-blue-600 bg-white dark:bg-gray-800'
                                    : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/40'
                                }`}
                                onClick={() => setChosen(prev => ({ ...prev, [r.entryId]: c.fuelRecordId }))}>
                                <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border ${
                                  picked ? 'border-blue-600' : 'border-gray-400 dark:border-gray-500'
                                }`}>
                                  {picked && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
                                </span>
                                <span className="text-gray-700 dark:text-gray-300 whitespace-nowrap">{c.date}</span>
                                <span className="font-mono text-gray-500 dark:text-gray-400 truncate">
                                  {c.goingDo}{c.returnDo && c.returnDo !== c.goingDo ? ` → ${c.returnDo}` : ''}
                                </span>
                                {(c.existingValue ?? 0) > 0 && (
                                  <span className="text-[10px] px-1 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 rounded">{c.existingValue}L</span>
                                )}
                                <button type="button"
                                  onClick={e => { e.stopPropagation(); setInspectFrId(c.fuelRecordId); setInspectTruckNo(r.truckNo); }}
                                  className="ml-auto p-0.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 flex-shrink-0"
                                  title="View fuel record breakdown">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {notFound.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Not Found ({notFound.length})
                </div>
                <div className="space-y-1">
                  {notFound.map(r => (
                    <div key={r.entryId} className="flex items-center gap-2 p-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10">
                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{r.truckNo}</span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">no fuel record in window</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.length === 0 && (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                <p className="text-sm">No results to preview</p>
              </div>
            )}
          </div>

          <div className="flex gap-2 p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <button type="button" onClick={onClose}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleConfirm} disabled={selected.size === 0}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              {selected.size > 0 ? `Link (${selected.size})` : 'Link'}
            </button>
          </div>
        </div>
      </div>
      {inspectFrId && (
        <FuelRecordInspectModal
          isOpen
          onClose={() => setInspectFrId(null)}
          fuelRecordId={inspectFrId}
          truckNumber={inspectTruckNo}
        />
      )}
    </>
  );
}

// ── Main Sheet View ────────────────────────────────────────────────────────────
export default function TangaLPOSheetView({ lpo: initialLpo, onUpdated, onBack, initialTruckNo }: Props) {
  const { user } = useAuth();
  const canWrite = WRITE_ROLES.includes(user?.role ?? '');

  const [lpo, setLpo] = useState<TangaLPO>(initialLpo);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [entrySearch, setEntrySearch] = useState('');
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Row highlight state (driven by initialTruckNo from list-view navigation)
  const [highlightedTruckNo, setHighlightedTruckNo] = useState<string | null>(null);
  const entryRowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const highlightedForRef = useRef<string | null>(null);

  // Entry modals
  const [showYardAddForm, setShowYardAddForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<{ index: number; entry: TangaLPOEntry } | null>(null);
  const [amendingEntry, setAmendingEntry] = useState<TangaLPOEntry | null>(null);
  const [cancellingEntry, setCancellingEntry] = useState<TangaLPOEntry | null>(null);
  const [linkingEntry, setLinkingEntry] = useState<TangaLPOEntry | null>(null);
  const [showCancelAll, setShowCancelAll] = useState(false);

  // Bulk link state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLinking, setBulkLinking] = useState(false);
  const [bulkConflicts, setBulkConflicts] = useState<BulkLinkResult[]>([]);
  const [showBulkConflict, setShowBulkConflict] = useState(false);
  const [showBulkPreview, setShowBulkPreview] = useState(false);
  const [bulkPreviewResults, setBulkPreviewResults] = useState<BulkPreviewResult[]>([]);
  // Selections from the last bulk-link attempt, so the conflict modal can resend
  // the same chosen fuel records with top-up approved.
  const [lastSelections, setLastSelections] = useState<BulkSelection[]>([]);
  const [editingDate, setEditingDate] = useState(false);
  const [dateValue, setDateValue] = useState(lpo.date);
  const [savingDate, setSavingDate] = useState(false);

  const lpoId = (lpo._id ?? lpo.id) as string;

  useEffect(() => {
    setEntrySearch('');
    setSelectedIds(new Set());
    if (!lpo.lpoNo) return;
    let cancelled = false;
    setIsFetching(true);
    tangaLPOAPI.getByLPONo(lpo.lpoNo).then(fresh => {
      if (!cancelled && fresh) setLpo(fresh as TangaLPO);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setIsFetching(false);
    });
    return () => { cancelled = true; };
  }, [lpo.lpoNo]);

  useEffect(() => {
    if (!isSaving && !showYardAddForm && !editingEntry && !amendingEntry && !cancellingEntry) {
      setLpo(initialLpo);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLpo.lpoNo]);

  useEffect(() => {
    if (!initialTruckNo || lpo.entries.length === 0) return;
    if (highlightedForRef.current === initialTruckNo) return;
    const idx = lpo.entries.findIndex(
      e => (e.truckNo || '').toLowerCase() === initialTruckNo.toLowerCase()
    );
    if (idx === -1) return;
    highlightedForRef.current = initialTruckNo;
    setHighlightedTruckNo(initialTruckNo);
    setTimeout(() => {
      const el = entryRowRefs.current.get(idx);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    const clearTimer = setTimeout(() => setHighlightedTruckNo(null), 3500);
    return () => clearTimeout(clearTimer);
  }, [initialTruckNo, lpo.entries]);

  const handleMutationResult = useCallback((updated: TangaLPO) => {
    setLpo(updated);
    onUpdated();
  }, [onUpdated]);

  const refreshLpo = useCallback(() => {
    tangaLPOAPI.getByLPONo(lpo.lpoNo).then(fresh => {
      if (fresh) setLpo(fresh as TangaLPO);
    }).catch(() => {});
    onUpdated();
  }, [lpo.lpoNo, onUpdated]);

  const handleSaveDate = async () => {
    if (!dateValue || dateValue === lpo.date) { setEditingDate(false); return; }
    setSavingDate(true);
    try {
      await tangaLPOAPI.acquireLock(lpoId);
      try {
        const updated = await tangaLPOAPI.update(lpoId, { date: dateValue } as any);
        toast.success('Date updated');
        handleMutationResult(updated as TangaLPO);
        setEditingDate(false);
      } finally {
        await tangaLPOAPI.releaseLock(lpoId).catch(() => {});
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update date');
    } finally {
      setSavingDate(false);
    }
  };

  const handleEditEntry = async (updatedEntry: Omit<TangaLPOEntry, '_id'>) => {
    if (!editingEntry) return;
    setIsSaving(true);
    try {
      await tangaLPOAPI.acquireLock(lpoId);
      try {
        const updatedEntries = lpo.entries.map((e, i) =>
          i === editingEntry.index ? { ...editingEntry.entry, ...updatedEntry } : e
        );
        const updated = await tangaLPOAPI.update(lpoId, { entries: updatedEntries });
        toast.success('Entry updated');
        handleMutationResult(updated as TangaLPO);
        setEditingEntry(null);
      } finally {
        await tangaLPOAPI.releaseLock(lpoId).catch(() => {});
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

  // ── Bulk link ──────────────────────────────────────────────────────────────
  const unlinkableEntries = lpo.entries.filter(e => !e.isCancelled && !e.linkedFuelRecordId && e._id);
  const allUnlinkedSelected = unlinkableEntries.length > 0 && unlinkableEntries.every(e => selectedIds.has(e._id!));

  const toggleEntry = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (allUnlinkedSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unlinkableEntries.map(e => e._id!)));
    }
  };

  const handlePreviewBulkLink = async () => {
    const entryIds = Array.from(selectedIds);
    if (entryIds.length === 0) return;
    setBulkLinking(true);
    try {
      const res = await tangaLPOAPI.previewBulkLink(lpoId, { entryIds });
      setBulkPreviewResults(res.results || []);
      setShowBulkPreview(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Preview failed');
    } finally {
      setBulkLinking(false);
    }
  };

  const handleBulkLink = async (selections: BulkSelection[]) => {
    if (selections.length === 0) return;
    setBulkLinking(true);
    setLastSelections(selections);
    try {
      const res = await tangaLPOAPI.bulkLink(lpoId, { selections });
      handleMutationResult(res.data as TangaLPO);

      const results: BulkLinkResult[] = res.results || [];
      const linked = results.filter(r => r.status === 'linked').length;
      const toppedUp = results.filter(r => r.status === 'topped_up').length;
      const notFound = results.filter(r => r.status === 'not_found');
      const conflicts = results.filter(r => r.status === 'conflict');

      if (linked + toppedUp > 0) {
        toast.success(`${linked + toppedUp} ${linked + toppedUp === 1 ? 'entry' : 'entries'} linked to fuel records`);
      }
      if (notFound.length > 0) {
        toast.warn(`${notFound.length} not found: ${notFound.map(r => r.truckNo).join(', ')}`);
      }

      setSelectedIds(new Set());

      if (conflicts.length > 0) {
        setBulkConflicts(conflicts);
        setShowBulkConflict(true);
      } else {
        setBulkConflicts([]);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Bulk link failed');
    } finally {
      setBulkLinking(false);
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
    const ok = await copyTangaLPOForWhatsApp(lpo);
    if (ok) toast.success('WhatsApp text copied to clipboard');
    else toast.error('Copy failed — please try manually');
  };

  const handleExportPdf = async () => {
    setDownloadingPdf(true);
    setShowCopyDropdown(false);
    try {
      const id = lpoId;
      await tangaLPOAPI.downloadPDF(id);
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
      `<!DOCTYPE html><html><head><title>${lpo.lpoNo} — Tanga Yard LPO</title></head><body style="margin:0">${content}</body></html>`
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
          (e.doNo ?? '').toLowerCase().includes(t) ||
          (e.dest ?? '').toLowerCase().includes(t)
        );
      })
    : lpo.entries;

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 relative">
      {isFetching && (
        <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 flex items-center justify-center z-10">
          <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
        </div>
      )}

      {/* ── Mobile Header ── */}
      <div className="lg:hidden bg-gradient-to-br from-[#1b2433] to-[#0f1722] px-4 pt-4 pb-6 rounded-b-[20px]">
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
              <div className="text-xs text-[#7a8fa8] mt-0.5 flex items-center gap-1">
                {editingDate ? (
                  <>
                    <input
                      type="date"
                      value={dateValue}
                      onChange={e => setDateValue(e.target.value)}
                      className="px-1 py-0.5 text-xs border border-blue-400/60 rounded bg-white/10 text-white focus:outline-none w-28"
                      disabled={savingDate}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveDate(); if (e.key === 'Escape') setEditingDate(false); }}
                    />
                    <button onClick={handleSaveDate} disabled={savingDate} className="text-blue-400 disabled:opacity-50">
                      {savingDate ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    </button>
                    <button onClick={() => setEditingDate(false)} disabled={savingDate} className="text-[#7a8fa8]">
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <span>{lpo.date}</span>
                    {canWrite && !allCancelled && (
                      <button onClick={() => { setDateValue(lpo.date); setEditingDate(true); }} className="text-[#5a7a98] hover:text-blue-400">
                        <Edit2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                    <span>· {lpo.currency}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canWrite && !allCancelled && (
              <button
                onClick={() => setShowYardAddForm(true)}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[10px] text-xs font-bold disabled:opacity-50"
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
            <div className="text-[9.5px] font-semibold text-[#6b7990] uppercase tracking-wide mb-0.5">Trucks</div>
            <div className="text-[15px] font-bold text-[#eef2f8]">{activeEntries.length}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-semibold text-[#6b7990] uppercase tracking-wide mb-0.5">Liters</div>
            <div className="text-[15px] font-bold text-[#eef2f8]">{totalLiters.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-semibold text-[#6b7990] uppercase tracking-wide mb-0.5">Total</div>
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
          <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">{lpo.lpoNo}</span>
          <span className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
            Date:
            {editingDate ? (
              <>
                <input
                  type="date"
                  value={dateValue}
                  onChange={e => setDateValue(e.target.value)}
                  className="ml-1 px-1.5 py-0.5 text-sm border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={savingDate}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveDate(); if (e.key === 'Escape') setEditingDate(false); }}
                />
                <button onClick={handleSaveDate} disabled={savingDate} className="p-0.5 text-blue-600 hover:text-blue-700 disabled:opacity-50">
                  {savingDate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setEditingDate(false)} disabled={savingDate} className="p-0.5 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <strong className="text-gray-900 dark:text-gray-100 ml-1">{lpo.date}</strong>
                {canWrite && !allCancelled && (
                  <button onClick={() => { setDateValue(lpo.date); setEditingDate(true); }} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
          </span>
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
          {/* Auto-link selected */}
          {canWrite && hasSelection && (
            <button
              onClick={handlePreviewBulkLink}
              disabled={bulkLinking}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              {bulkLinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Auto-Link ({selectedIds.size})
            </button>
          )}
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
                onClick={() => setShowYardAddForm(true)}
                disabled={isSaving}
                className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
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

          {/* Mobile bulk-link bar */}
          {canWrite && unlinkableEntries.length > 0 && (
            <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-[12px]">
              <button type="button" onClick={toggleSelectAll}
                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${allUnlinkedSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-400'}`}>
                {allUnlinkedSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              </button>
              <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 flex-1">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select unlinked entries to auto-link'}
              </span>
              {hasSelection && (
                <button onClick={handlePreviewBulkLink} disabled={bulkLinking}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors">
                  {bulkLinking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                  Auto-Link
                </button>
              )}
            </div>
          )}

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
              const isSelectable = canWrite && !isCancelled && !entry.linkedFuelRecordId && !!entry._id;
              const isSelected = isSelectable && selectedIds.has(entry._id!);
              const isHighlighted = highlightedTruckNo !== null && (entry.truckNo || '').toLowerCase() === highlightedTruckNo.toLowerCase();
              return (
                <div
                  key={entry._id ?? idx}
                  ref={(el) => { if (el) entryRowRefs.current.set(realIdx, el); else entryRowRefs.current.delete(realIdx); }}
                  className={`border rounded-[16px] transition-all ${isHighlighted ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-400' : 'border-[#eaeef4] bg-white'}`}
                  style={{ opacity: isCancelled ? 0.65 : 1, boxShadow: '0 4px 16px -10px rgba(28,40,64,0.25)' }}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-start gap-2">
                        {isSelectable && (
                          <button type="button" onClick={() => toggleEntry(entry._id!)}
                            className={`mt-1 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-400'}`}>
                            {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                          </button>
                        )}
                        <div>
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
                                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[10px] border border-[#fde9c0] bg-[#fffbeb] text-[#b45309] text-[12px] font-bold disabled:opacity-50"
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
                  <button onClick={() => setShowYardAddForm(true)} className="mt-2 text-[13px] font-bold text-[#2563eb] bg-transparent border-none cursor-pointer">
                    Add the first entry
                  </button>
                )}
              </div>
            )}

            {visibleEntries.length === 0 && entrySearch.trim() && (
              <div className="text-center py-8 text-[#9aa4b6]">
                <Search className="w-6 h-6 mx-auto mb-2 opacity-40" />
                <div className="text-[13px] font-semibold">No entries match</div>
                <button onClick={() => setEntrySearch('')} className="mt-1.5 text-[12px] font-bold text-[#2563eb] bg-transparent border-none cursor-pointer">
                  Clear search
                </button>
              </div>
            )}
          </div>

          <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2.5 bg-[#fff8eb] border border-[#fde9c0] rounded-[12px] text-[#b07a17]">
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-[11px] font-semibold">Edit lock required for add / edit operations</span>
          </div>

          <div className="px-4 pb-6">
            <div className="flex items-center justify-between rounded-[18px] px-4 py-3" style={{ background: 'linear-gradient(160deg,#1b2433,#0f1722)', boxShadow: '0 16px 32px -12px rgba(15,23,34,0.6)' }}>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wide text-[#6b7990]">
                  {activeEntries.length} active · {totalLiters.toLocaleString()} L
                </div>
                <div className="text-[11px] font-semibold text-[#aab4c6] mt-0.5">Active entries</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-bold uppercase tracking-wide text-[#6b7990]">Grand Total ({lpo.currency})</div>
                <div className="text-[20px] font-extrabold text-white tabular-nums">{fmt(lpo.total)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block p-5">
          <div className="max-w-5xl mx-auto border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1.5rem_2rem_1fr_1fr_5rem_5rem_6rem_1fr_6rem] bg-blue-50 dark:bg-blue-900/30 border-b border-gray-200 dark:border-gray-700">
              {/* Checkbox select-all header */}
              <div className="px-1 py-2 flex items-center justify-center border-r border-gray-200 dark:border-gray-700">
                {canWrite && unlinkableEntries.length > 0 && (
                  <button type="button" onClick={toggleSelectAll}
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${allUnlinkedSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-400'}`}>
                    {allUnlinkedSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </button>
                )}
              </div>
              {['#', 'DO No', 'Truck', 'Liters', 'Rate', 'Amount', 'Destination', 'Actions'].map((h, i) => (
                <div
                  key={h}
                  className={`px-2 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide ${i > 2 && i < 6 ? 'text-right' : ''} ${i < 7 ? 'border-r border-gray-200 dark:border-gray-700' : 'text-center'}`}
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {visibleEntries.map((entry, idx) => {
              const realIdx = lpo.entries.indexOf(entry);
              const isCancelled = entry.isCancelled;
              const isSelectable = canWrite && !isCancelled && !entry.linkedFuelRecordId && !!entry._id;
              const isSelected = isSelectable && selectedIds.has(entry._id!);
              const isHighlighted = highlightedTruckNo !== null && (entry.truckNo || '').toLowerCase() === highlightedTruckNo.toLowerCase();
              const rowCls = isCancelled
                ? 'bg-red-50 dark:bg-red-900/15 border-b border-red-100 dark:border-red-900/30'
                : isHighlighted
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 ring-2 ring-inset ring-blue-400 dark:ring-blue-500'
                  : isSelected
                    ? 'bg-blue-50/60 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/20'
                    : 'border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50';
              return (
                <div key={entry._id ?? idx} ref={(el) => { if (el) entryRowRefs.current.set(realIdx, el); else entryRowRefs.current.delete(realIdx); }} className={`grid grid-cols-[1.5rem_2rem_1fr_1fr_5rem_5rem_6rem_1fr_6rem] ${rowCls}`}>
                  {/* Checkbox cell */}
                  <div className="px-1 py-2 flex items-center justify-center border-r border-gray-200 dark:border-gray-700">
                    {isSelectable && (
                      <button type="button" onClick={() => toggleEntry(entry._id!)}
                        className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-400'}`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </button>
                    )}
                  </div>
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
                            className="p-1 text-amber-600 hover:text-amber-800 dark:text-amber-400 disabled:opacity-40"
                            title="Link to FuelRecord manually"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setEditingEntry({ index: realIdx, entry })}
                          disabled={isSaving}
                          className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 disabled:opacity-40"
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
                  <button onClick={() => setShowYardAddForm(true)} className="mt-2 text-sm text-blue-600 hover:underline">
                    Add the first entry
                  </button>
                )}
              </div>
            )}

            {visibleEntries.length === 0 && entrySearch.trim() && (
              <div className="py-8 text-center text-gray-400 dark:text-gray-500">
                <Search className="w-5 h-5 mx-auto mb-1.5 opacity-50" />
                <p className="text-sm">No entries match &ldquo;{entrySearch}&rdquo;</p>
                <button onClick={() => setEntrySearch('')} className="text-sm text-blue-600 hover:underline mt-1">Clear</button>
              </div>
            )}

            <div className="bg-amber-50 dark:bg-amber-900/20 border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                An edit lock is acquired automatically when you add or edit entries
              </span>
            </div>

            {/* Total row */}
            <div className="grid grid-cols-[1.5rem_2rem_1fr_1fr_5rem_5rem_6rem_1fr_6rem] bg-blue-50 dark:bg-blue-900/30 font-semibold">
              <div className="px-1 py-2.5 border-r border-gray-200 dark:border-gray-700" />
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700" />
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700" />
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 uppercase">
                {activeEntries.length} active
              </div>
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700 text-right text-sm font-bold text-blue-700 dark:text-blue-300">
                {totalLiters.toLocaleString()}
              </div>
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700" />
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700 text-right text-sm font-bold text-blue-900 dark:text-blue-200">
                {fmt(lpo.total)}
              </div>
              <div className="px-2 py-2.5 border-r border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">{lpo.currency}</div>
              <div className="px-2 py-2.5" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-4 max-w-5xl mx-auto">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Active Entries</div>
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{activeEntries.length}</div>
            </div>
            <div className="bg-cyan-50 dark:bg-cyan-900/20 p-3 rounded-lg">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Total Liters</div>
              <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400">{totalLiters.toLocaleString()}</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Total ({lpo.currency})</div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">{fmt(lpo.total)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Hidden print target (off-screen, always mounted) ── */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '794px', pointerEvents: 'none' }}>
        <TangaLPOPrint ref={printRef} data={lpo} preparedBy={user?.username} />
      </div>

      {/* ── Modals ── */}

      {showYardAddForm && (
        <TangaYardLPOForm
          mode="add-entries"
          existingLpo={lpo}
          onClose={() => setShowYardAddForm(false)}
          onSuccess={refreshLpo}
        />
      )}

      {editingEntry && (
        <TangaLPOEntryForm
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

      {showBulkPreview && (
        <BulkLinkPreviewModal
          results={bulkPreviewResults}
          onConfirm={(selections) => {
            setShowBulkPreview(false);
            setBulkPreviewResults([]);
            if (selections.length > 0) handleBulkLink(selections);
          }}
          onClose={() => { setShowBulkPreview(false); setBulkPreviewResults([]); }}
        />
      )}

      {showBulkConflict && bulkConflicts.length > 0 && (
        <BulkLinkConflictModal
          conflicts={bulkConflicts}
          onConfirm={topUpIds => {
            setShowBulkConflict(false);
            setBulkConflicts([]);
            // Resend the same chosen fuel records for the approved entries, now
            // with top-up confirmed.
            const resend = lastSelections
              .filter(s => topUpIds.includes(s.entryId))
              .map(s => ({ ...s, topUp: true }));
            if (resend.length > 0) handleBulkLink(resend);
          }}
          onClose={() => { setShowBulkConflict(false); setBulkConflicts([]); }}
        />
      )}
    </div>
  );
}
