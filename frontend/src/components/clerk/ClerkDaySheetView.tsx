import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Copy,
  Download,
  MessageSquare,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Flag,
  Clock,
  MoreHorizontal,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { visaOverstayAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import UnifiedTabLoader from '../SuperAdmin/common/UnifiedTabLoader';
import {
  DaySheetRow,
  copyText,
  downloadTextFile,
  formatSheetDate,
  generateDaySheetCsv,
  generateDaySheetWhatsAppText,
} from '../../utils/visaOverstayTextGenerator';
import {
  downloadDaySheetExport,
  estimateDaySheetPages,
  exportAvailability,
} from '../../utils/visaOverstayExport';

interface CrossedRow {
  _id: string;
  caseId?: string;
  truckNo: string;
  driverName: string;
  passportDueDate?: string;
  position?: string;
  crossedAt?: string;
  daysSinceLastOverstay?: number;
  extraDays?: number;
  extraAmount?: number;
  harrisonAmount?: number;
  dayTotal?: number;
  overstayLabel?: string;
  crossedBy?: string;
}

type SheetTab = 'entries' | 'crossed';
type ModalMode = 'confirm-row' | 'remove-row' | 'amend' | 'cross' | 'wait' | null;

interface Props {
  date: string;
  onBack: () => void;
}

function fmtDate(value?: string | null) {
  if (!value) return '—';
  const raw = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatSheetDate(raw);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ClerkDaySheetView({ date, onBack }: Props) {
  const { isDark } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<SheetTab>('entries');
  const [rows, setRows] = useState<DaySheetRow[]>([]);
  const [totals, setTotals] = useState({ overstay: 0, visa: 0, all: 0, harrison: 0 });
  const [crossed, setCrossed] = useState<CrossedRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [rowMenuAnchor, setRowMenuAnchor] = useState<{
    top: number;
    left: number;
    openUp: boolean;
  } | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [focusRow, setFocusRow] = useState<DaySheetRow | null>(null);
  const [amendAmount, setAmendAmount] = useState('50');
  const [amendTarget, setAmendTarget] = useState<'overstay' | 'visa'>('overstay');

  const exportOpts = useMemo(
    () => exportAvailability(estimateDaySheetPages(rows.length)),
    [rows.length]
  );

  const card = {
    background: isDark ? '#1E293B' : '#FFFFFF',
    borderColor: isDark ? '#334155' : '#E2E8F0',
  };
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const muted = '#64748B';
  const inputCls = `w-full px-3 h-[38px] text-sm rounded-lg border ${
    isDark ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-slate-900'
  }`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sheet = await visaOverstayAPI.getSheet(date);
      setRows(sheet.rows || []);
      setTotals(sheet.totals || { overstay: 0, visa: 0, all: 0, harrison: 0 });
      setCrossed(sheet.crossed || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load day sheet');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeSync('visa_overstays', () => load());

  const pendingIds = useMemo(() => {
    const ids: string[] = [];
    rows.forEach((r) => {
      if (r.overstayStatus === 'pending' && r.overstayPaymentId) ids.push(r.overstayPaymentId);
      if (r.visaStatus === 'pending' && r.visaPaymentId) ids.push(r.visaPaymentId);
    });
    return ids;
  }, [rows]);

  const handleCopyWhatsApp = async () => {
    try {
      await copyText(generateDaySheetWhatsAppText(date, rows, totals));
      toast.success('WhatsApp text copied');
      setMenuOpen(false);
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleCopyCsv = async () => {
    try {
      await copyText(generateDaySheetCsv(date, rows));
      toast.success('CSV text copied');
      setMenuOpen(false);
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleDownloadCsv = () => {
    downloadTextFile(`Visas_Overstays_${date}.csv`, generateDaySheetCsv(date, rows), 'text/csv;charset=utf-8');
    toast.success('CSV downloaded');
    setMenuOpen(false);
  };

  const handleDownloadTxt = () => {
    downloadTextFile(
      `Visas_Overstays_${date}.txt`,
      generateDaySheetWhatsAppText(date, rows, totals)
    );
    toast.success('Text downloaded');
    setMenuOpen(false);
  };

  const handleDownloadXlsx = async () => {
    try {
      await downloadDaySheetExport(date, 'xlsx');
      toast.success('Excel workbook downloaded');
      setMenuOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Excel export failed');
    }
  };

  const handleDownloadPdf = async () => {
    if (!exportOpts.pdfAllowed) {
      toast.info(exportOpts.pdfHint);
      return;
    }
    try {
      await downloadDaySheetExport(date, 'pdf');
      toast.success('PDF downloaded');
      setMenuOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'PDF export failed');
    }
  };

  const handleDownloadImage = async () => {
    if (!exportOpts.imageAllowed) {
      toast.info(exportOpts.imageHint);
      return;
    }
    const toastId = toast.loading('Rendering PNG from PDF…');
    try {
      await downloadDaySheetExport(date, 'image');
      toast.update(toastId, {
        render: 'Image (PNG) downloaded',
        type: 'success',
        isLoading: false,
        autoClose: 3000,
      });
      setMenuOpen(false);
    } catch (err: any) {
      toast.update(toastId, {
        render: err?.response?.data?.message || err?.message || 'Image export failed',
        type: 'error',
        isLoading: false,
        autoClose: 5000,
      });
    }
  };

  const openRowMenu = (caseId: string, el: HTMLElement) => {
    if (rowMenu === caseId) {
      setRowMenu(null);
      setRowMenuAnchor(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const menuH = 260;
    const menuW = 200;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuH && rect.top > menuH;
    setRowMenuAnchor({
      top: openUp ? rect.top - 8 : rect.bottom + 4,
      left: Math.min(Math.max(8, rect.right - menuW), window.innerWidth - menuW - 8),
      openUp,
    });
    setRowMenu(caseId);
  };

  const confirmAllPending = async () => {
    if (!pendingIds.length) {
      toast.info('No pending lines');
      return;
    }
    setBusy(true);
    try {
      await visaOverstayAPI.confirmBatch(pendingIds);
      toast.success(`Confirmed ${pendingIds.length} payment(s)`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Confirm failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmFocusRow = async () => {
    if (!focusRow) return;
    setBusy(true);
    try {
      await visaOverstayAPI.confirmRow({
        overstayPaymentId: focusRow.overstayPaymentId,
        visaPaymentId: focusRow.visaPaymentId,
        passportPaymentId: focusRow.passportPaymentId,
      });
      toast.success('Row marked paid');
      setModal(null);
      setFocusRow(null);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Confirm failed');
    } finally {
      setBusy(false);
    }
  };

  const removeFocusRow = async () => {
    if (!focusRow) return;
    setBusy(true);
    try {
      await visaOverstayAPI.removeRow({ caseId: focusRow.caseId, date });
      toast.success('Removed from day sheet');
      setModal(null);
      setFocusRow(null);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Remove failed');
    } finally {
      setBusy(false);
    }
  };

  const assignVisa = async (row: DaySheetRow) => {
    setBusy(true);
    try {
      await visaOverstayAPI.assignVisa({ caseId: row.caseId, date, amount: 50, position: row.position });
      toast.success('Visa assigned');
      setRowMenu(null);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Assign visa failed');
    } finally {
      setBusy(false);
    }
  };

  const submitAmend = async () => {
    if (!focusRow) return;
    const id = amendTarget === 'visa' ? focusRow.visaPaymentId : focusRow.overstayPaymentId;
    if (!id) {
      toast.error(`No ${amendTarget} line on this row`);
      return;
    }
    setBusy(true);
    try {
      await visaOverstayAPI.amendPayment(id, { amount: Number(amendAmount) || 0 });
      toast.success('Amended');
      setModal(null);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Amend failed');
    } finally {
      setBusy(false);
    }
  };

  const submitWait = async () => {
    if (!focusRow) return;
    setBusy(true);
    try {
      await visaOverstayAPI.markWaitingDue(focusRow.caseId);
      toast.success('Marked waiting due date');
      setModal(null);
      setFocusRow(null);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const submitCross = async () => {
    if (!focusRow) return;
    setBusy(true);
    try {
      const result = await visaOverstayAPI.markCrossed(focusRow.caseId, { crossedAt: date });
      const amt = result?.settlement?.extraAmount ?? 0;
      toast.success(amt > 0 ? `Crossed — extra $${amt}` : 'Marked crossed');
      setModal(null);
      setFocusRow(null);
      setTab('crossed');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Cross failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <UnifiedTabLoader label="Loading day sheet..." />;

  const tabs: { id: SheetTab; label: string; count: number }[] = [
    { id: 'entries', label: 'Day entries', count: rows.length },
    { id: 'crossed', label: 'Crossed', count: crossed.length },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4" style={card}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <button
              onClick={onBack}
              className="mt-0.5 p-2 rounded-lg border"
              style={{ borderColor: card.borderColor, color: muted }}
              title="Back to list"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: muted }}>
                Day sheet
              </p>
              <h2 className="text-xl font-bold" style={{ color: text }}>
                {formatSheetDate(date)}
              </h2>
              <p className="text-sm" style={{ color: muted }}>
                {rows.length} truck(s) · Overstay ${totals.overstay} · Visa ${totals.visa} · Harrison $
                {totals.harrison ?? 0} · Total ${totals.all}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border"
              style={{ borderColor: card.borderColor, color: text }}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={confirmAllPending}
              disabled={busy || !pendingIds.length}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirm pending
            </button>

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border"
                style={{ borderColor: card.borderColor, color: text }}
              >
                <Copy className="w-3.5 h-3.5" /> Copy / Download
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-56 rounded-md border shadow-xl z-50 py-1" style={card}>
                    <div className="px-3 py-2 text-xs font-semibold uppercase" style={{ color: muted }}>
                      Copy
                    </div>
                    <button onClick={handleCopyWhatsApp} className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5" style={{ color: text }}>
                      <MessageSquare className="w-4 h-4 mr-2 text-green-500" /> Copy for WhatsApp
                    </button>
                    <button onClick={handleCopyCsv} className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5" style={{ color: text }}>
                      <FileSpreadsheet className="w-4 h-4 mr-2" /> Copy as CSV text
                    </button>
                    <div className="border-t my-1" style={{ borderColor: card.borderColor }} />
                    <div className="px-3 py-2 text-xs font-semibold uppercase" style={{ color: muted }}>
                      Download
                    </div>
                    <button onClick={handleDownloadXlsx} className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5" style={{ color: text }}>
                      <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" /> Excel (.xlsx)
                    </button>
                    <button
                      onClick={handleDownloadPdf}
                      disabled={!exportOpts.pdfAllowed}
                      title={exportOpts.pdfHint}
                      className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      style={{ color: text }}
                    >
                      <FileText className="w-4 h-4 mr-2 text-rose-600" /> PDF
                      {exportOpts.pages > 1 && exportOpts.pdfAllowed ? (
                        <span className="ml-auto text-[10px]" style={{ color: muted }}>
                          {exportOpts.pages}p
                        </span>
                      ) : null}
                    </button>
                    <button
                      onClick={handleDownloadImage}
                      disabled={!exportOpts.imageAllowed}
                      title={exportOpts.imageHint}
                      className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      style={{ color: text }}
                    >
                      <ImageIcon className="w-4 h-4 mr-2 text-sky-600" /> Image (PNG)
                      {!exportOpts.imageAllowed ? (
                        <span className="ml-auto text-[10px]" style={{ color: muted }}>
                          PDF only
                        </span>
                      ) : null}
                    </button>
                    <button onClick={handleDownloadCsv} className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5" style={{ color: text }}>
                      <Download className="w-4 h-4 mr-2 text-teal-600" /> Download CSV
                    </button>
                    <button onClick={handleDownloadTxt} className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5" style={{ color: text }}>
                      <Download className="w-4 h-4 mr-2" /> Download text
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-1 mt-4 border-b" style={{ borderColor: card.borderColor }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
              style={{
                borderColor: tab === t.id ? '#0D9488' : 'transparent',
                color: tab === t.id ? '#0D9488' : muted,
              }}
            >
              {t.label}
              <span className="ml-1.5 text-xs opacity-70">({t.count})</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'entries' && (
        <div className="rounded-xl border overflow-hidden" style={card}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ background: isDark ? '#0F172A' : '#F8FAFC', color: muted }}>
                  <th className="px-2 py-1.5 text-left font-medium">S/N</th>
                  <th className="px-2 py-1.5 text-left font-medium">Truck</th>
                  <th className="px-2 py-1.5 text-left font-medium">Name</th>
                  <th className="px-2 py-1.5 text-left font-medium">Passport due</th>
                  <th className="px-2 py-1.5 text-left font-medium">Particular</th>
                  <th className="px-2 py-1.5 text-left font-medium">Overstay</th>
                  <th className="px-2 py-1.5 text-left font-medium">Visa</th>
                  <th className="px-2 py-1.5 text-left font-medium">Position</th>
                  <th className="px-2 py-1.5 text-left font-medium">Total</th>
                  <th className="px-2 py-1.5 text-left font-medium">Harrison</th>
                  <th className="px-2 py-1.5 text-left font-medium">Status</th>
                  <th className="px-2 py-1.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-10 text-center" style={{ color: muted }}>
                      No entries for this date. Add trucks from the list view (Add truck / Build day).
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const status = row.overstayStatus || row.visaStatus || '—';
                    return (
                      <tr
                        key={`${row.caseId}-${row.overstayPaymentId || row.visaPaymentId}`}
                        className="border-t"
                        style={{ borderColor: card.borderColor }}
                      >
                        <td className="px-2 py-1" style={{ color: muted }}>{idx + 1}</td>
                        <td className="px-2 py-1 font-medium" style={{ color: text }}>
                          <span className="inline-flex items-center gap-1.5">
                            {row.truckNo}
                            {row.isCrossed && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-600">
                                Crossed
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-2 py-1" style={{ color: text }}>{row.driverName}</td>
                        <td className="px-2 py-1" style={{ color: text }}>{fmtDate(row.passportDueDate)}</td>
                        <td className="px-2 py-1" style={{ color: text }}>{row.overstayLabel}</td>
                        <td className="px-2 py-1" style={{ color: text }}>
                          {row.overstayAmount != null ? `$${row.overstayAmount}` : '—'}
                        </td>
                        <td className="px-2 py-1" style={{ color: text }}>
                          {row.visaAmount != null ? `$${row.visaAmount}` : '—'}
                        </td>
                        <td className="px-2 py-1" style={{ color: muted }}>{row.position || '—'}</td>
                        <td className="px-2 py-1 font-medium text-teal-600">${row.rowTotal}</td>
                        <td className="px-2 py-1 font-semibold text-indigo-600">
                          {(row.harrisonAmount || 0) > 0 ? `$${row.harrisonAmount}` : '—'}
                        </td>
                        <td
                          className="px-2 py-1 capitalize"
                          style={{
                            color:
                              status === 'confirmed' ? '#059669' : status === 'pending' ? '#D97706' : muted,
                          }}
                        >
                          {status}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <button
                            onClick={(e) => openRowMenu(row.caseId, e.currentTarget)}
                            className="p-1 rounded hover:bg-black/5"
                            style={{ color: muted }}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {rowMenu === row.caseId && rowMenuAnchor && (
                            <>
                              <div
                                className="fixed inset-0 z-[100]"
                                onClick={() => {
                                  setRowMenu(null);
                                  setRowMenuAnchor(null);
                                }}
                              />
                              <div
                                className="fixed w-48 rounded-md border shadow-xl z-[110] py-1 text-left"
                                style={{
                                  ...card,
                                  left: rowMenuAnchor.left,
                                  ...(rowMenuAnchor.openUp
                                    ? { bottom: window.innerHeight - rowMenuAnchor.top }
                                    : { top: rowMenuAnchor.top }),
                                }}
                              >
                                {status === 'pending' && (
                                  <button
                                    className="flex w-full items-center px-3 py-2 text-sm hover:bg-black/5"
                                    style={{ color: text }}
                                    onClick={() => {
                                      setFocusRow(row);
                                      setModal('confirm-row');
                                      setRowMenu(null);
                                    }}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Confirm pay
                                  </button>
                                )}
                                {!row.visaPaymentId && (
                                  <button
                                    className="flex w-full items-center px-3 py-2 text-sm hover:bg-black/5"
                                    style={{ color: text }}
                                    onClick={() => assignVisa(row)}
                                  >
                                    <Plus className="w-3.5 h-3.5 mr-2" /> Assign visa
                                  </button>
                                )}
                                <button
                                  className="flex w-full items-center px-3 py-2 text-sm hover:bg-black/5"
                                  style={{ color: text }}
                                  onClick={() => {
                                    setFocusRow(row);
                                    setAmendTarget(row.overstayPaymentId ? 'overstay' : 'visa');
                                    setAmendAmount(String(row.overstayAmount ?? row.visaAmount ?? 50));
                                    setModal('amend');
                                    setRowMenu(null);
                                  }}
                                >
                                  Amend amount
                                </button>
                                {!row.isCrossed && (
                                  <>
                                    <button
                                      className="flex w-full items-center px-3 py-2 text-sm hover:bg-black/5"
                                      style={{ color: text }}
                                      onClick={() => {
                                        setFocusRow(row);
                                        setModal('wait');
                                        setRowMenu(null);
                                      }}
                                    >
                                      <Clock className="w-3.5 h-3.5 mr-2 text-amber-500" /> Wait due date
                                    </button>
                                    <button
                                      className="flex w-full items-center px-3 py-2 text-sm hover:bg-black/5"
                                      style={{ color: text }}
                                      onClick={() => {
                                        setFocusRow(row);
                                        setModal('cross');
                                        setRowMenu(null);
                                      }}
                                    >
                                      <Flag className="w-3.5 h-3.5 mr-2 text-orange-500" /> Mark crossed
                                    </button>
                                  </>
                                )}
                                <button
                                  className="flex w-full items-center px-3 py-2 text-sm hover:bg-black/5 text-red-600"
                                  onClick={() => {
                                    setFocusRow(row);
                                    setModal('remove-row');
                                    setRowMenu(null);
                                  }}
                                >
                                  <XCircle className="w-3.5 h-3.5 mr-2" /> Remove from day
                                </button>
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'crossed' && (
        <div className="rounded-xl border overflow-hidden" style={card}>
          <div className="px-4 py-3 border-b" style={{ borderColor: card.borderColor }}>
            <h3 className="text-sm font-semibold" style={{ color: text }}>
              Crossed on this day sheet
            </h3>
            <p className="text-xs" style={{ color: muted }}>
              Trucks from {formatSheetDate(date)} entries that crossed — Harrison $ disbursed + extra settlement
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ background: isDark ? '#0F172A' : '#F8FAFC', color: muted }}>
                  <th className="px-2 py-1.5 text-left font-medium">S/N</th>
                  <th className="px-2 py-1.5 text-left font-medium">Truck</th>
                  <th className="px-2 py-1.5 text-left font-medium">Name</th>
                  <th className="px-2 py-1.5 text-left font-medium">Passport due</th>
                  <th className="px-2 py-1.5 text-left font-medium">Position</th>
                  <th className="px-2 py-1.5 text-left font-medium">Crossed</th>
                  <th className="px-2 py-1.5 text-left font-medium">Harrison</th>
                  <th className="px-2 py-1.5 text-left font-medium">Extra $</th>
                  <th className="px-2 py-1.5 text-left font-medium">Extra days</th>
                </tr>
              </thead>
              <tbody>
                {crossed.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center" style={{ color: muted }}>
                      No trucks from this day’s entries have crossed yet
                    </td>
                  </tr>
                ) : (
                  crossed.map((c, idx) => (
                    <tr key={c._id} className="border-t" style={{ borderColor: card.borderColor }}>
                      <td className="px-2 py-1" style={{ color: muted }}>{idx + 1}</td>
                      <td className="px-2 py-1 font-medium" style={{ color: text }}>
                        <span className="inline-flex items-center gap-1.5">
                          {c.truckNo}
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-600">
                            Crossed
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-1" style={{ color: text }}>{c.driverName}</td>
                      <td className="px-2 py-1" style={{ color: text }}>{fmtDate(c.passportDueDate)}</td>
                      <td className="px-2 py-1" style={{ color: muted }}>{c.position || '—'}</td>
                      <td className="px-2 py-1" style={{ color: muted }}>{fmtDate(c.crossedAt)}</td>
                      <td className="px-2 py-1 font-semibold text-indigo-600">
                        {(c.harrisonAmount || 0) > 0 ? `$${c.harrisonAmount}` : '—'}
                      </td>
                      <td className="px-2 py-1 font-semibold text-orange-600">${c.extraAmount ?? 0}</td>
                      <td className="px-2 py-1" style={{ color: muted }}>
                        {c.extraDays ?? 0}d ({c.daysSinceLastOverstay ?? 0}d since last)
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-lg rounded-xl border shadow-xl max-h-[90vh] overflow-y-auto" style={card}>
            <div className="px-5 py-4 border-b flex justify-between" style={{ borderColor: card.borderColor }}>
              <h3 className="font-semibold" style={{ color: text }}>
                {modal === 'confirm-row' && 'Confirm payout'}
                {modal === 'remove-row' && 'Remove from day'}
                {modal === 'amend' && 'Amend amount'}
                {modal === 'wait' && 'Mark waiting due date'}
                {modal === 'cross' && 'Mark border crossed'}
              </h3>
              <button onClick={() => setModal(null)} style={{ color: muted }}>Close</button>
            </div>
            <div className="p-5 space-y-3">
              {modal === 'confirm-row' && focusRow && (
                <>
                  <p className="text-sm" style={{ color: text }}>
                    {focusRow.truckNo} · {focusRow.overstayLabel} ${focusRow.overstayAmount ?? 0} · Visa{' '}
                    {focusRow.visaAmount != null ? `$${focusRow.visaAmount}` : '—'}
                  </p>
                  <p className="text-lg font-bold" style={{ color: text }}>Total ${focusRow.rowTotal}</p>
                  <button
                    disabled={busy}
                    onClick={confirmFocusRow}
                    className="w-full py-2.5 rounded-md bg-emerald-600 text-white text-sm font-medium"
                  >
                    Confirm money given
                  </button>
                </>
              )}

              {modal === 'remove-row' && focusRow && (
                <>
                  <p className="text-sm" style={{ color: text }}>
                    Remove {focusRow.truckNo} from {date}?
                  </p>
                  <button
                    disabled={busy}
                    onClick={removeFocusRow}
                    className="w-full py-2.5 rounded-md bg-red-600 text-white text-sm font-medium"
                  >
                    Remove
                  </button>
                </>
              )}

              {modal === 'amend' && focusRow && (
                <>
                  <select
                    className={inputCls}
                    value={amendTarget}
                    onChange={(e) => setAmendTarget(e.target.value as 'overstay' | 'visa')}
                  >
                    <option value="overstay">Overstay</option>
                    <option value="visa">Visa</option>
                  </select>
                  <input
                    type="number"
                    className={inputCls}
                    value={amendAmount}
                    onChange={(e) => setAmendAmount(e.target.value)}
                  />
                  <button
                    disabled={busy}
                    onClick={submitAmend}
                    className="w-full py-2.5 rounded-md bg-teal-600 text-white text-sm font-medium"
                  >
                    Save
                  </button>
                </>
              )}

              {modal === 'wait' && focusRow && (
                <>
                  <p className="text-sm" style={{ color: text }}>
                    Hold {focusRow.truckNo} until passport due date?
                  </p>
                  <button
                    disabled={busy}
                    onClick={submitWait}
                    className="w-full py-2.5 rounded-md bg-amber-500 text-white text-sm font-medium"
                  >
                    Mark waiting
                  </button>
                </>
              )}

              {modal === 'cross' && focusRow && (
                <>
                  <p className="text-sm" style={{ color: text }}>
                    Mark {focusRow.truckNo} — {focusRow.driverName} as crossed? Extra days go to settlement
                    output only.
                  </p>
                  <button
                    disabled={busy}
                    onClick={submitCross}
                    className="w-full py-2.5 rounded-md bg-orange-500 text-white text-sm font-medium"
                  >
                    Confirm crossed
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
