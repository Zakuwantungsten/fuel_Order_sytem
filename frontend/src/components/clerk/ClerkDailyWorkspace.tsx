import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import {
  List,
  BookOpen,
  Copy,
  Download,
  MessageSquare,
  FileSpreadsheet,
  MoreHorizontal,
  Search,
  X,
  Inbox,
  Clock,
  Wand2,
  Truck,
  BarChart2,
  Plus,
  Trash2,
  Eye,
  Pencil,
  Check,
  Flag,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { visaOverstayAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import UnifiedTabLoader from '../SuperAdmin/common/UnifiedTabLoader';
import ClerkDayWorkbook from './ClerkDayWorkbook';
import ClerkSummary from './ClerkSummary';
import {
  DaySheetRow,
  copyText,
  downloadTextFile,
  formatSheetDate,
  generateDaySheetCsv,
  generateDaySheetWhatsAppText,
} from '../../utils/visaOverstayTextGenerator';
import {
  downloadBuildReviewExport,
  downloadDaySheetExport,
  estimateBuildReviewPages,
  estimateDaySheetPages,
  exportAvailability,
} from '../../utils/visaOverstayExport';

type ListEntry = DaySheetRow & {
  date: string;
  rowStatus?: string;
  passportDueDate?: string | null;
};

type CaseRow = {
  _id: string;
  truckNo: string;
  driverName: string;
  passportDueDate: string;
  dateSubmitted?: string;
  position?: string;
  status: string;
};

type TruckHistoryCase = {
  _id: string;
  truckNo: string;
  driverName: string;
  passportDueDate: string | null;
  dateSubmitted?: string | null;
  position?: string;
  status: string;
  payoutRule?: string;
  firstPaidAt?: string | null;
  lastOverstayPaidAt?: string | null;
  crossedAt?: string | null;
  notes?: string;
  matchesDueDate?: boolean;
  matchesCaseId?: boolean;
  payments: Array<{
    _id: string;
    type: string;
    status: string;
    amount: number;
    paymentDate: string | null;
    overstaySequence?: number;
  }>;
  buildItems: Array<{
    _id: string;
    buildDate: string | null;
    passportDueDate?: string | null;
    status: string;
    source?: string;
    position?: string;
    includeOverstay?: boolean;
    includeVisa?: boolean;
    overstayAmount?: number;
    visaAmount?: number;
  }>;
};

type RawEditDraft = {
  truckNo: string;
  driverName: string;
  passportDueDate: string;
  position: string;
};

type AddTruckDest = 'raw' | 'waiting' | 'build' | 'crossed';
type AddTruckRow = {
  key: string;
  truckNo: string;
  driverName: string;
  passportDueDate: string;
  position: string;
  destination: AddTruckDest;
  ignoreTruckFlag?: boolean;
  ignoreNameFlag?: boolean;
};

type IntakeMatchCase = {
  _id: string;
  truckNo: string;
  driverName: string;
  passportDueDate?: string | null;
  position?: string | null;
  status: string;
  dateSubmitted?: string | null;
  crossedAt?: string | null;
  similarity?: number;
};

type IntakeCheckResult = {
  key: string;
  flags: string[];
  truckInRaw: IntakeMatchCase[];
  truckRecent: IntakeMatchCase[];
  nameMatches: IntakeMatchCase[];
};

const ADD_PASTE_FIELDS = ['truckNo', 'driverName', 'passportDueDate', 'position'] as const;
type AddPasteField = (typeof ADD_PASTE_FIELDS)[number];

/** Normalize Excel / WhatsApp date text → YYYY-MM-DD for <input type="date"> */
const parsePastedDate = (raw: string): string => {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const slash = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (slash) {
    let day = Number(slash[1]);
    let month = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    // Prefer D/M/Y (East Africa); swap if month looks like day
    if (month > 12 && day <= 12) {
      const tmp = day;
      day = month;
      month = tmp;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  if (/^\d{5}$/.test(s)) {
    const serial = Number(s);
    const excelEpoch = Date.UTC(1899, 11, 30);
    const dt = new Date(excelEpoch + serial * 86400000);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  return '';
};

const rowStatusLabel = (
  row: AddTruckRow,
  check?: IntakeCheckResult | null
): { label: string; tone: string; alert?: boolean } => {
  const hasAny = !!(row.truckNo.trim() || row.driverName.trim() || row.passportDueDate || row.position.trim());
  if (!hasAny) return { label: '—', tone: '#94A3B8' };

  const flags = check?.flags || [];
  const truckFlag =
    (flags.includes('truck_in_raw') ||
      flags.includes('truck_recent') ||
      flags.includes('truck_in_form')) &&
    !row.ignoreTruckFlag;
  const nameFlag =
    (flags.includes('name_exact') ||
      flags.includes('name_fuzzy') ||
      flags.includes('name_in_form')) &&
    !row.ignoreNameFlag;

  if (truckFlag && flags.includes('truck_in_raw')) {
    return { label: 'Truck in raw', tone: '#DC2626', alert: true };
  }
  if (truckFlag && flags.includes('truck_in_form')) {
    return { label: 'Truck dup row', tone: '#DC2626', alert: true };
  }
  if (truckFlag && flags.includes('truck_recent')) {
    return { label: 'Truck recent', tone: '#EA580C', alert: true };
  }
  if (nameFlag && (flags.includes('name_exact') || flags.includes('name_in_form'))) {
    return { label: 'Name used', tone: '#DC2626', alert: true };
  }
  if (nameFlag && flags.includes('name_fuzzy')) {
    return { label: 'Name similar', tone: '#D97706', alert: true };
  }

  const ready = !!(row.truckNo.trim() && row.passportDueDate);
  if (row.destination === 'crossed' && ready) {
    const preview = borderCrossPreview(row.passportDueDate);
    return {
      label: preview ? `$${preview.amount} (${preview.billable}d)` : 'Cross',
      tone: '#EA580C',
    };
  }
  if (row.ignoreTruckFlag || row.ignoreNameFlag) {
    if (ready) return { label: 'Ignored · Ready', tone: '#059669' };
  }
  if (ready) return { label: 'Ready', tone: '#059669' };
  return { label: 'Incomplete', tone: '#D97706' };
};

/** Border intake: max(0, days to due − 10) × $5 */
function borderCrossPreview(due: string): { daysRemaining: number; billable: number; amount: number } | null {
  if (!due) return null;
  const now = new Date();
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const today = new Date(`${todayYmd}T12:00:00`);
  const dueD = new Date(`${due}T12:00:00`);
  if (Number.isNaN(dueD.getTime())) return null;
  const daysRemaining = Math.round((dueD.getTime() - today.getTime()) / 86400000);
  const billable = Math.max(0, daysRemaining - 10);
  return { daysRemaining, billable, amount: billable * 5 };
}

type WorkspaceTab = 'list' | 'raw' | 'waiting' | 'build' | 'crossed';
type MainView = 'list' | 'workbook' | 'summary';

type CrossedListRow = {
  _id: string;
  truckNo: string;
  driverName: string;
  position?: string;
  passportDueDate?: string | null;
  dateSubmitted?: string | null;
  crossedAt?: string | null;
  crossSource?: string;
  extraDays?: number;
  extraAmount?: number;
  daysSinceLastOverstay?: number;
  crossedBy?: string;
  notes?: string;
  lastOverstayPaidAt?: string | null;
};

type BuildItem = {
  _id: string;
  buildDate: string;
  caseId: string;
  truckNo: string;
  driverName: string;
  passportDueDate: string;
  position?: string;
  source: 'due_date' | 'cycle' | 'reserve_raw' | 'late_add';
  includeOverstay: boolean;
  includeVisa: boolean;
  overstayAmount: number;
  visaAmount: number;
  status: string;
  lastOverstayPaidAt?: string | null;
  firstPaidAt?: string | null;
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Stable YYYY-MM-DD from API date (avoids timezone shifting display). */
function toYmd(value?: string | Date | null): string {
  if (!value) return '';
  const s = String(value);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function fmtDate(value?: string) {
  if (!value) return '—';
  const ymd = toYmd(value);
  if (!ymd) return '—';
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const BUILD_SOURCE_STYLE: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  due_date: { label: 'Due date', bg: 'rgba(13,148,136,0.15)', color: '#0F766E' },
  cycle: { label: 'Cycle 10d', bg: 'rgba(99,102,241,0.15)', color: '#4338CA' },
  reserve_raw: { label: 'Raw reserve', bg: 'rgba(245,158,11,0.18)', color: '#B45309' },
  late_add: { label: 'Late add', bg: 'rgba(236,72,153,0.15)', color: '#BE185D' },
};

export default function ClerkDailyWorkspace() {
  const { isDark } = useAuth();
  const [viewMode, setViewMode] = useState<MainView>('list');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('list');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [entries, setEntries] = useState<ListEntry[]>([]);
  const [totals, setTotals] = useState({ trucks: 0, overstay: 0, visa: 0, all: 0, harrison: 0 });
  const [rawInput, setRawInput] = useState<CaseRow[]>([]);
  const [waiting, setWaiting] = useState<CaseRow[]>([]);
  const [crossedList, setCrossedList] = useState<CrossedListRow[]>([]);
  const [crossedTotals, setCrossedTotals] = useState({ trucks: 0, extraAmount: 0 });
  const [buildItems, setBuildItems] = useState<BuildItem[]>([]);
  const [buildDate, setBuildDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{
    top: number;
    left: number;
    openUp: boolean;
  } | null>(null);
  const [buildExportOpen, setBuildExportOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [allowMultiBuild, setAllowMultiBuild] = useState(false);
  const [dayAlreadyBuilt, setDayAlreadyBuilt] = useState(false);
  const [rebuildAck, setRebuildAck] = useState(false);
  const [buildProgress, setBuildProgress] = useState<{
    active: boolean;
    step: number;
    percent: number;
    label: string;
    done?: boolean;
    alreadyBuilt?: boolean;
    message?: string;
  } | null>(null);
  const [showAddTruck, setShowAddTruck] = useState(false);
  const [newDate, setNewDate] = useState(todayISO());
  const [addBuildDate, setAddBuildDate] = useState(todayISO());
  const [addRows, setAddRows] = useState<AddTruckRow[]>([]);
  const [addRowChecks, setAddRowChecks] = useState<Record<string, IntakeCheckResult>>({});
  const [intakeCheckBusy, setIntakeCheckBusy] = useState(false);
  const intakeCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nameInspect, setNameInspect] = useState<{
    rowKey: string;
    enteredName: string;
    enteredTruck: string;
    matches: IntakeMatchCase[];
  } | null>(null);
  const [fillDrag, setFillDrag] = useState<{
    field: 'passportDueDate';
    startIdx: number;
    hoverIdx: number;
    value: string;
  } | null>(null);
  const fillDragRef = useRef(fillDrag);
  fillDragRef.current = fillDrag;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editingRawId, setEditingRawId] = useState<string | null>(null);
  const [rawEditDraft, setRawEditDraft] = useState<RawEditDraft | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTruck, setHistoryTruck] = useState('');
  const [historyDue, setHistoryDue] = useState<string | undefined>();
  const [historyCases, setHistoryCases] = useState<TruckHistoryCase[]>([]);
  const [selectedBuildIds, setSelectedBuildIds] = useState<string[]>([]);
  const [crossModal, setCrossModal] = useState<{
    ids: string[];
    trucks: Array<{
      truckNo: string;
      driverName: string;
      passportDueDate?: string;
      lastOverstayPaidAt?: string | null;
    }>;
  } | null>(null);
  const [crossDate, setCrossDate] = useState(todayISO());
  const [crossTime, setCrossTime] = useState('12:00');
  const [crossPreviewCfg, setCrossPreviewCfg] = useState({ graceDays: 5, cycleDays: 10 });

  const card = {
    background: isDark ? '#1E293B' : '#FFFFFF',
    borderColor: isDark ? '#334155' : '#E2E8F0',
  };
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const muted = '#64748B';
  const fieldCls = `w-full px-3 h-[38px] text-sm rounded-lg border ${
    isDark ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-slate-900'
  } focus:ring-2 focus:ring-teal-500 focus:border-transparent`;
  const iconBtnCls = `w-7 h-7 inline-flex items-center justify-center rounded-[7px] border cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
    isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-[#e6eaf1]'
  }`;
  const iconBtnDangerCls = `${iconBtnCls} ${
    isDark
      ? 'border-[#7f1d1d] text-red-400 hover:bg-red-900/30'
      : 'border-[#f3dada] text-[#dc2626] hover:bg-red-50'
  }`;
  const iconBtnInspectCls = `${iconBtnCls} ${
    isDark
      ? 'text-blue-400 hover:bg-blue-900/30'
      : 'text-[#2563eb] hover:bg-blue-50'
  }`;
  const iconBtnEditCls = `${iconBtnCls} ${
    isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'
  }`;

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await visaOverstayAPI.listEntries({
        limit: 500,
        search: search.trim() || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      setEntries(data?.entries || []);
      setTotals(data?.totals || { trucks: 0, overstay: 0, visa: 0, all: 0, harrison: 0 });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load truck entries');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, dateFrom, dateTo]);

  const loadQueues = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [rawRes, waitRes] = await Promise.all([
        visaOverstayAPI.listCases({ status: 'intake', limit: 200 }),
        visaOverstayAPI.listCases({ status: 'waiting_due', limit: 200 }),
      ]);
      setRawInput(rawRes.data || []);
      setWaiting(waitRes.data || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load queues');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  const loadBuild = useCallback(async (date?: string, opts?: { silent?: boolean }) => {
    const d = date || buildDate;
    if (!opts?.silent) setLoading(true);
    try {
      const data = await visaOverstayAPI.listBuild(d, 'pending');
      const items = (data?.items || []).map((i: BuildItem) => ({
        ...i,
        passportDueDate: toYmd(i.passportDueDate) || i.passportDueDate,
        lastOverstayPaidAt: toYmd(i.lastOverstayPaidAt) || null,
        firstPaidAt: toYmd(i.firstPaidAt) || null,
      }));
      setBuildItems(items);
      if (data?.date) setBuildDate(data.date);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load build review');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [buildDate]);

  const loadCrossed = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const data = await visaOverstayAPI.listCrossed({ lookbackDays: 180 });
      setCrossedList(data?.items || []);
      setCrossedTotals(data?.totals || { trucks: 0, extraAmount: 0 });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load crossed');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode !== 'list') return;
    if (workspaceTab === 'list') {
      loadEntries();
      loadQueues({ silent: true });
      loadBuild(undefined, { silent: true });
      loadCrossed({ silent: true });
    } else if (workspaceTab === 'build') {
      loadBuild();
    } else if (workspaceTab === 'crossed') {
      loadCrossed();
    } else {
      loadQueues();
    }
  }, [viewMode, workspaceTab, loadEntries, loadQueues, loadBuild, loadCrossed]);

  useRealtimeSync('visa_overstays', () => {
    if (viewMode !== 'list') return;
    if (workspaceTab === 'list') {
      loadEntries();
      loadQueues({ silent: true });
      loadBuild(undefined, { silent: true });
      loadCrossed({ silent: true });
    } else if (workspaceTab === 'build') {
      loadBuild();
    } else if (workspaceTab === 'crossed') {
      loadCrossed();
    } else {
      loadQueues();
    }
  });

  const hasFilters = !!(search.trim() || statusFilter !== 'all' || dateFrom || dateTo);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const openSheet = (date: string) => {
    setSelectedDate(date);
    setViewMode('workbook');
    setMenuFor(null);
  };

  const latestDate = useMemo(() => entries[0]?.date || todayISO(), [entries]);

  const goToWorkbookTab = () => {
    setSelectedDate((prev) => prev || latestDate || todayISO());
    setViewMode('workbook');
  };

  const BUILD_STEPS = [
    'Preparing build…',
    'Finding passport due dates…',
    'Looking back for cycle overstays…',
    'Pulling raw input in reserve window…',
    'Consolidating review list…',
    'Finalizing…',
  ];

  const createOrOpenDay = async (opts?: { rebuild?: boolean }) => {
    if (!newDate) {
      toast.error('Choose a build date');
      return;
    }
    const isRebuild = Boolean(opts?.rebuild);
    if (isRebuild && !rebuildAck) {
      toast.error('Confirm that you understand rebuild will clear and redo');
      return;
    }

    setBusy(true);
    setBuildProgress({
      active: true,
      step: 0,
      percent: 8,
      label: isRebuild ? 'Restoring trucks to Raw / Waiting…' : BUILD_STEPS[0],
    });

    let stepTimer: ReturnType<typeof setInterval> | undefined;
    let stepIdx = 0;
    stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, BUILD_STEPS.length - 2);
      setBuildProgress((prev) =>
        prev && prev.active && !prev.done
          ? {
              ...prev,
              step: stepIdx,
              percent: Math.min(85, 8 + stepIdx * 15),
              label: isRebuild && stepIdx === 0
                ? 'Restoring trucks to Raw / Waiting…'
                : BUILD_STEPS[stepIdx],
            }
          : prev
      );
    }, 450);

    try {
      const result = await visaOverstayAPI.buildDay({
        date: newDate,
        includeVisa: true,
        rebuild: isRebuild || undefined,
      });
      if (stepTimer) clearInterval(stepTimer);

      if (result?.alreadyBuilt) {
        setAllowMultiBuild(Boolean(result.allowMultiBuild));
        setDayAlreadyBuilt(true);
        setBuildProgress({
          active: true,
          step: BUILD_STEPS.length - 1,
          percent: 100,
          label: 'Already built for this day',
          done: true,
          alreadyBuilt: true,
          message: `Build already ran for ${formatSheetDate(newDate)}${
            result.pendingCount != null ? ` · ${result.pendingCount} still pending review` : ''
          }.${
            result.allowMultiBuild
              ? ' Multi-build is on — you can Rebuild to restore pending trucks and run again.'
              : ' Rebuild is disabled in Configuration.'
          }`,
        });
        setBuildDate(newDate);
        return;
      }

      const n = result?.created?.length || 0;
      const restored = result?.unwind?.restored ?? 0;
      setDayAlreadyBuilt(false);
      setRebuildAck(false);
      setBuildProgress({
        active: true,
        step: BUILD_STEPS.length - 1,
        percent: 100,
        label: isRebuild ? 'Rebuild complete' : 'Build complete',
        done: true,
        alreadyBuilt: false,
        message: isRebuild
          ? `Restored ${restored} truck(s), then prepared ${n} for ${formatSheetDate(newDate)}. Fill positions in Build review.`
          : n > 0
            ? `Prepared ${n} truck(s) for ${formatSheetDate(newDate)}. Fill positions in Build review.`
            : `Build finished for ${formatSheetDate(newDate)} — no new candidates found.`,
      });
      setBuildDate(newDate);
      await loadBuild(newDate);
      await loadQueues({ silent: true });
    } catch (err: any) {
      if (stepTimer) clearInterval(stepTimer);
      setBuildProgress(null);
      toast.error(err?.response?.data?.message || 'Build failed');
    } finally {
      setBusy(false);
    }
  };

  const openBuildModal = async () => {
    const date = todayISO();
    setNewDate(date);
    setBuildProgress(null);
    setRebuildAck(false);
    setDayAlreadyBuilt(false);
    setShowCreate(true);
    try {
      const [cfg, build] = await Promise.all([
        visaOverstayAPI.getConfig(),
        visaOverstayAPI.listBuild(date, 'pending'),
      ]);
      setAllowMultiBuild(Boolean(cfg?.allowMultiBuild));
      setDayAlreadyBuilt(Boolean(build?.runExists));
    } catch {
      // non-blocking
    }
  };

  const onBuildDateChange = async (date: string) => {
    setNewDate(date);
    setRebuildAck(false);
    setBuildProgress(null);
    try {
      const build = await visaOverstayAPI.listBuild(date, 'pending');
      setDayAlreadyBuilt(Boolean(build?.runExists));
      if (build?.allowMultiBuild != null) setAllowMultiBuild(Boolean(build.allowMultiBuild));
    } catch {
      setDayAlreadyBuilt(false);
    }
  };

  const finishBuildModal = () => {
    const goReview = !!buildProgress?.done;
    setShowCreate(false);
    setBuildProgress(null);
    if (goReview) {
      setWorkspaceTab('build');
      setViewMode('list');
      loadBuild(newDate);
    }
  };

  const patchBuildItem = async (
    id: string,
    patch: Partial<
      Pick<
        BuildItem,
        | 'truckNo'
        | 'driverName'
        | 'position'
        | 'includeOverstay'
        | 'includeVisa'
        | 'overstayAmount'
        | 'visaAmount'
      >
    >
  ) => {
    const normalized = {
      ...patch,
      ...(patch.truckNo != null ? { truckNo: String(patch.truckNo).trim().toUpperCase() } : {}),
      ...(patch.driverName != null ? { driverName: String(patch.driverName).trim() } : {}),
      ...(patch.position != null ? { position: String(patch.position).trim() } : {}),
    };
    setBuildItems((prev) => prev.map((i) => (i._id === id ? { ...i, ...normalized } : i)));
    try {
      await visaOverstayAPI.updateBuildItem(id, normalized);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Update failed');
      await loadBuild();
    }
  };

  type BuildPasteField = 'truckNo' | 'driverName' | 'position';
  const BUILD_PASTE_FIELDS: BuildPasteField[] = ['truckNo', 'driverName', 'position'];

  /** Excel-style paste into build review: fill truck / name / position down (and across). */
  const handleBuildPaste = (
    startIndex: number,
    startField: BuildPasteField,
    event: ClipboardEvent<HTMLInputElement>
  ) => {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) return;

    const hasGrid =
      pastedText.includes('\t') || pastedText.includes('\n') || pastedText.includes('\r');
    if (!hasGrid) return;

    event.preventDefault();
    event.stopPropagation();

    const matrix = pastedText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''))
      .map((line) => line.split('\t').map((cell) => cell.trim()))
      .filter((cols) => cols.some((c) => c.length > 0));

    if (!matrix.length) return;

    const startCol = BUILD_PASTE_FIELDS.indexOf(startField);
    if (startCol < 0) return;

    const updates: Array<{ id: string; patch: Partial<BuildItem> }> = [];
    const next = buildItems.map((r) => ({ ...r }));

    matrix.forEach((cols, rOffset) => {
      const rowIdx = startIndex + rOffset;
      if (rowIdx >= next.length) return;
      const row = { ...next[rowIdx] };
      const patch: Partial<BuildItem> = {};
      cols.forEach((value, cOffset) => {
        const fieldIdx = cols.length === 1 ? startCol : startCol + cOffset;
        if (fieldIdx < 0 || fieldIdx >= BUILD_PASTE_FIELDS.length) return;
        const field = BUILD_PASTE_FIELDS[fieldIdx];
        if (field === 'truckNo') {
          row.truckNo = value.toUpperCase();
          patch.truckNo = row.truckNo;
        } else if (field === 'driverName') {
          row.driverName = value;
          patch.driverName = value;
        } else if (field === 'position') {
          row.position = value;
          patch.position = value;
        }
      });
      next[rowIdx] = row;
      if (Object.keys(patch).length) updates.push({ id: row._id, patch });
    });

    if (!updates.length) return;
    setBuildItems(next);

    void (async () => {
      let ok = 0;
      let fail = 0;
      for (const u of updates) {
        try {
          await visaOverstayAPI.updateBuildItem(u.id, u.patch);
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      if (ok) toast.success(`Pasted ${ok} row(s)`);
      if (fail) {
        toast.warn(`${fail} row(s) failed to save`);
        await loadBuild();
      }
    })();
  };

  const resolveBuild = async (
    item: BuildItem,
    action: 'confirm' | 'waiting' | 'crossed' | 'dismiss',
    extra?: { crossedAt?: string }
  ) => {
    if ((action === 'confirm' || action === 'waiting') && !item.position?.trim()) {
      toast.error(
        action === 'confirm'
          ? 'Fill position before confirming to day'
          : 'Fill position before moving to waiting'
      );
      return;
    }
    if (action === 'confirm' && !item.includeOverstay && !item.includeVisa) {
      toast.error('Enable overstay and/or visa, or dismiss');
      return;
    }
    if (action === 'crossed') {
      openCrossModal([item]);
      return;
    }
    setBusy(true);
    try {
      await visaOverstayAPI.resolveBuildItem(item._id, {
        action,
        truckNo: item.truckNo,
        driverName: item.driverName,
        position: item.position,
        includeOverstay: item.includeOverstay,
        includeVisa: item.includeVisa,
        crossedAt: extra?.crossedAt,
      });
      const labels = {
        confirm: 'Added to day sheet',
        waiting: 'Moved to waiting due date',
        crossed: 'Marked crossed',
        dismiss: 'Dismissed',
      };
      toast.success(`${item.truckNo}: ${labels[action]}`);
      setSelectedBuildIds((prev) => prev.filter((id) => id !== item._id));
      await loadBuild();
      if (action === 'confirm') loadEntries();
      if (action === 'waiting' || action === 'dismiss' || action === 'confirm') {
        loadQueues({ silent: true });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const openCrossModal = async (items: BuildItem[]) => {
    if (!items.length) return;
    try {
      const cfg = await visaOverstayAPI.getConfig();
      setCrossPreviewCfg({
        graceDays: cfg?.graceDays ?? 5,
        cycleDays: cfg?.overstayCycleDays ?? 10,
      });
    } catch {
      /* defaults */
    }
    setCrossDate(todayISO());
    setCrossTime('12:00');
    setCrossModal({
      ids: items.map((i) => i._id),
      trucks: items.map((i) => ({
        truckNo: i.truckNo,
        driverName: i.driverName,
        passportDueDate: toYmd(i.passportDueDate),
        lastOverstayPaidAt: toYmd(i.lastOverstayPaidAt) || null,
      })),
    });
  };

  const previewCrossAmount = (passportDue?: string, lastOverstayPaidAt?: string | null) => {
    const crossed = new Date(`${crossDate}T${crossTime || '12:00'}:00`);
    if (Number.isNaN(crossed.getTime())) return { days: 0, amount: 0, label: '—' };

    const lastPaid = toYmd(lastOverstayPaidAt);
    if (lastPaid) {
      const lastD = new Date(`${lastPaid}T12:00:00`);
      const daysSince = Math.round((crossed.getTime() - lastD.getTime()) / 86400000);
      const billable = Math.max(0, daysSince - crossPreviewCfg.graceDays);
      return {
        days: billable,
        amount: billable * 5,
        label: `${daysSince}d since last − ${crossPreviewCfg.graceDays} grace = ${billable}d × $5`,
      };
    }

    const due = toYmd(passportDue);
    if (!due) return { days: 0, amount: 0, label: '—' };
    const dueD = new Date(`${due}T12:00:00`);
    const daysRemaining = Math.round((dueD.getTime() - crossed.getTime()) / 86400000);
    const billable = Math.max(0, daysRemaining - crossPreviewCfg.cycleDays);
    return {
      days: billable,
      amount: billable * 5,
      label: `${daysRemaining}d to due − ${crossPreviewCfg.cycleDays} = ${billable}d × $5`,
    };
  };

  const submitCrossModal = async () => {
    if (!crossModal?.ids.length) return;
    const crossedAt = `${crossDate}T${crossTime || '12:00'}`;
    setBusy(true);
    try {
      if (crossModal.ids.length === 1) {
        const item = buildItems.find((b) => b._id === crossModal.ids[0]);
        if (!item) throw new Error('Item missing');
        const result = await visaOverstayAPI.resolveBuildItem(item._id, {
          action: 'crossed',
          position: item.position,
          crossedAt,
        });
        const amt = result?.settlement?.extraAmount;
        toast.success(
          amt != null ? `${item.truckNo} crossed — $${amt}` : `${item.truckNo} crossed`
        );
      } else {
        const result = await visaOverstayAPI.resolveBuildBatch({
          ids: crossModal.ids,
          action: 'crossed',
          crossedAt,
        });
        toast.success(`Crossed ${result?.resolved?.length || 0} truck(s)`);
        if (result?.errors?.length) toast.warn(`${result.errors.length} skipped`);
      }
      setCrossModal(null);
      setSelectedBuildIds([]);
      await loadBuild();
      loadCrossed({ silent: true });
      loadQueues({ silent: true });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Cross failed');
    } finally {
      setBusy(false);
    }
  };

  const bulkResolve = async (action: 'waiting' | 'confirm' | 'dismiss') => {
    const selected = buildItems.filter((i) => selectedBuildIds.includes(i._id));
    if (!selected.length) {
      toast.info('Select trucks first');
      return;
    }
    if ((action === 'waiting' || action === 'confirm') && selected.some((i) => !i.position?.trim())) {
      toast.error('All selected trucks need a position');
      return;
    }
    setBusy(true);
    try {
      const result = await visaOverstayAPI.resolveBuildBatch({
        ids: selected.map((i) => i._id),
        action,
      });
      toast.success(`${action}: ${result?.resolved?.length || 0} done`);
      if (result?.errors?.length) toast.warn(`${result.errors.length} skipped`);
      setSelectedBuildIds([]);
      await loadBuild();
      if (action === 'confirm') loadEntries();
      loadQueues({ silent: true });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Bulk action failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmAllReady = async () => {
    const ready = buildItems.filter(
      (i) => i.position?.trim() && (i.includeOverstay || i.includeVisa)
    );
    if (!ready.length) {
      toast.info('No items with position + overstay/visa ready');
      return;
    }
    const missing = buildItems.filter((i) => !i.position?.trim());
    if (missing.length) {
      toast.warn(`${missing.length} row(s) still need position — confirming only ready ones`);
    }
    setBusy(true);
    try {
      const result = await visaOverstayAPI.confirmBuildBatch(ready.map((i) => i._id));
      const n = result?.confirmed?.length || 0;
      toast.success(`Confirmed ${n} to day sheet`);
      if (result?.errors?.length) toast.warn(`${result.errors.length} skipped`);
      setSelectedBuildIds([]);
      await loadBuild();
      loadEntries();
      loadQueues({ silent: true });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Batch confirm failed');
    } finally {
      setBusy(false);
    }
  };

  const makeAddRow = (destination: AddTruckDest = 'raw'): AddTruckRow => ({
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    truckNo: '',
    driverName: '',
    passportDueDate: '',
    position: '',
    destination,
    ignoreTruckFlag: false,
    ignoreNameFlag: false,
  });

  const openAddTruck = () => {
    setAddBuildDate(buildDate || todayISO());
    setAddRowChecks({});
    setNameInspect(null);
    setAddRows([makeAddRow('raw'), makeAddRow('raw')]);
    setShowAddTruck(true);
  };

  const runIntakeChecks = useCallback(async (rows: AddTruckRow[]) => {
    const payload = rows
      .filter((r) => r.truckNo.trim().length >= 3 || r.driverName.trim().length >= 3)
      .map((r) => ({
        key: r.key,
        truckNo: r.truckNo.trim() || undefined,
        driverName: r.driverName.trim() || undefined,
      }));
    if (!payload.length) {
      setAddRowChecks({});
      return;
    }
    setIntakeCheckBusy(true);
    try {
      const data = await visaOverstayAPI.checkIntakeDuplicates(payload);
      const next: Record<string, IntakeCheckResult> = {};
      for (const r of data?.results || []) {
        next[r.key] = r;
      }
      // Also flag duplicates inside the form itself
      const truckSeen = new Map<string, string>();
      const nameSeen = new Map<string, string>();
      for (const row of rows) {
        const t = row.truckNo.trim().toUpperCase();
        const n = row.driverName.trim().toUpperCase().replace(/\s+/g, ' ');
        if (t.length >= 3) {
          if (truckSeen.has(t)) {
            const existing = next[row.key] || {
              key: row.key,
              flags: [],
              truckInRaw: [],
              truckRecent: [],
              nameMatches: [],
            };
            if (!existing.flags.includes('truck_in_form')) existing.flags.push('truck_in_form');
            next[row.key] = existing;
          } else truckSeen.set(t, row.key);
        }
        if (n.length >= 4) {
          if (nameSeen.has(n)) {
            const existing = next[row.key] || {
              key: row.key,
              flags: [],
              truckInRaw: [],
              truckRecent: [],
              nameMatches: [],
            };
            if (!existing.flags.includes('name_in_form')) existing.flags.push('name_in_form');
            next[row.key] = existing;
          } else nameSeen.set(n, row.key);
        }
      }
      setAddRowChecks(next);
    } catch {
      // Non-blocking — clerk can still save; toast only if modal open
    } finally {
      setIntakeCheckBusy(false);
    }
  }, []);

  const scheduleIntakeChecks = useCallback(
    (rows: AddTruckRow[]) => {
      if (intakeCheckTimer.current) clearTimeout(intakeCheckTimer.current);
      intakeCheckTimer.current = setTimeout(() => {
        runIntakeChecks(rows);
      }, 450);
    },
    [runIntakeChecks]
  );

  useEffect(() => {
    return () => {
      if (intakeCheckTimer.current) clearTimeout(intakeCheckTimer.current);
    };
  }, []);

  const updateAddRow = (key: string, patch: Partial<AddTruckRow>) => {
    setAddRows((prev) => {
      const next = prev.map((r) => {
        if (r.key !== key) return r;
        const updated = { ...r, ...patch };
        // Re-arm flags when truck/name changes
        if (patch.truckNo != null) updated.ignoreTruckFlag = false;
        if (patch.driverName != null) updated.ignoreNameFlag = false;
        return updated;
      });
      scheduleIntakeChecks(next);
      return next;
    });
  };

  /** Excel-style fill: copy a field value from startIdx through endIdx (adds rows if needed). */
  const applyColumnFill = useCallback(
    (field: 'passportDueDate', startIdx: number, endIdx: number, value: string) => {
      if (!value) return;
      const from = Math.min(startIdx, endIdx);
      const to = Math.max(startIdx, endIdx);
      setAddRows((prev) => {
        const next = prev.map((r) => ({ ...r }));
        while (next.length <= to) {
          next.push(makeAddRow(next[Math.max(0, next.length - 1)]?.destination || 'raw'));
        }
        for (let i = from; i <= to; i++) {
          next[i] = { ...next[i], [field]: value };
        }
        // Keep a blank row at the end
        if (next[next.length - 1].truckNo.trim() || next[next.length - 1].passportDueDate) {
          next.push(makeAddRow(next[next.length - 1]?.destination || 'raw'));
        }
        scheduleIntakeChecks(next);
        return next;
      });
    },
    [scheduleIntakeChecks]
  );

  const startDateFillDrag = (idx: number, value: string, e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!value) {
      toast.info('Enter a date first, then drag the handle down');
      return;
    }
    setFillDrag({ field: 'passportDueDate', startIdx: idx, hoverIdx: idx, value });
  };

  /** Double-click fill handle: copy date down through the last row that has a truck. */
  const fillDateThroughTrucks = (idx: number, value: string) => {
    if (!value) return;
    let lastTruckIdx = idx;
    addRows.forEach((r, i) => {
      if (i >= idx && r.truckNo.trim()) lastTruckIdx = i;
    });
    if (lastTruckIdx === idx && idx < addRows.length - 1) {
      lastTruckIdx = addRows.length - 1;
    }
    if (lastTruckIdx === idx) return;
    applyColumnFill('passportDueDate', idx, lastTruckIdx, value);
    toast.success(`Filled date down ${lastTruckIdx - idx + 1} row(s)`);
  };

  useEffect(() => {
    if (!fillDrag) return;

    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest('[data-fill-row]') as HTMLElement | null;
      if (!cell) return;
      const idx = Number(cell.getAttribute('data-fill-row'));
      if (Number.isNaN(idx)) return;
      setFillDrag((d) => (d ? { ...d, hoverIdx: idx } : null));
    };

    const onUp = () => {
      const d = fillDragRef.current;
      setFillDrag(null);
      if (d && d.hoverIdx !== d.startIdx) {
        applyColumnFill(d.field, d.startIdx, d.hoverIdx, d.value);
        toast.success(`Filled date on ${Math.abs(d.hoverIdx - d.startIdx) + 1} row(s)`);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'crosshair';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [fillDrag, applyColumnFill]);

  const openNameInspect = (row: AddTruckRow) => {
    const check = addRowChecks[row.key];
    if (check?.flags?.includes('name_in_form') && !check?.nameMatches?.length) {
      toast.warn('Same name appears on another row in this form');
      return;
    }
    if (!check?.nameMatches?.length) {
      toast.info('No name matches to inspect');
      return;
    }
    setNameInspect({
      rowKey: row.key,
      enteredName: row.driverName,
      enteredTruck: row.truckNo,
      matches: check.nameMatches,
    });
  };

  const openTruckInspect = (row: AddTruckRow) => {
    const check = addRowChecks[row.key];
    if (check?.flags?.includes('truck_in_form') && !check?.truckInRaw?.length && !check?.truckRecent?.length) {
      toast.warn('Same truck appears on another row in this form');
      return;
    }
    const matches = [...(check?.truckInRaw || []), ...(check?.truckRecent || [])];
    if (!matches.length) {
      toast.info('No truck matches to inspect');
      return;
    }
    setNameInspect({
      rowKey: row.key,
      enteredName: row.driverName || '(no name yet)',
      enteredTruck: row.truckNo,
      matches,
    });
  };

  const applyPasteValue = (field: AddPasteField, raw: string): string => {
    const value = String(raw || '').trim();
    if (field === 'truckNo') return value.toUpperCase();
    if (field === 'passportDueDate') return parsePastedDate(value) || value;
    return value;
  };

  /** Excel-style paste: fill down a column, or across truck→name→passport→position when tabs present */
  const handleAddRowPaste = (
    startIndex: number,
    startField: AddPasteField,
    event: ClipboardEvent<HTMLInputElement>
  ) => {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) return;

    const hasGrid = pastedText.includes('\t') || pastedText.includes('\n') || pastedText.includes('\r');

    // Single-value date paste: normalize Excel / DD-MM-YYYY into the date input
    if (!hasGrid && startField === 'passportDueDate') {
      const parsed = parsePastedDate(pastedText);
      if (parsed) {
        event.preventDefault();
        updateAddRow(addRows[startIndex].key, { passportDueDate: parsed });
      }
      return;
    }

    if (!hasGrid) return;

    event.preventDefault();
    event.stopPropagation();

    const matrix = pastedText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''))
      .map((line) => line.split('\t').map((cell) => cell.trim()))
      .filter((cols) => cols.some((c) => c.length > 0));

    if (!matrix.length) return;

    const startCol = ADD_PASTE_FIELDS.indexOf(startField);
    if (startCol < 0) return;

    setAddRows((prev) => {
      const next = prev.map((r) => ({ ...r }));
      const needed = startIndex + matrix.length;
      while (next.length < needed) {
        next.push(makeAddRow(next[Math.max(0, next.length - 1)]?.destination || 'raw'));
      }

      matrix.forEach((cols, rOffset) => {
        const rowIdx = startIndex + rOffset;
        const row = { ...next[rowIdx] };
        cols.forEach((value, cOffset) => {
          // Single-column paste (newlines only): always fill the focused field
          const fieldIdx = cols.length === 1 ? startCol : startCol + cOffset;
          if (fieldIdx < 0 || fieldIdx >= ADD_PASTE_FIELDS.length) return;
          const field = ADD_PASTE_FIELDS[fieldIdx];
          (row as any)[field] = applyPasteValue(field, value);
        });
        next[rowIdx] = row;
      });

      if (
        next.length === 0 ||
        next[next.length - 1].truckNo.trim() ||
        next[next.length - 1].driverName.trim()
      ) {
        next.push(makeAddRow(next[next.length - 1]?.destination || 'raw'));
      }

      return next;
    });

    toast.success(`Pasted ${matrix.length} row(s)`);
    // Re-check after paste settles
    setTimeout(() => {
      setAddRows((current) => {
        scheduleIntakeChecks(current);
        return current;
      });
    }, 0);
  };

  const submitAddTruck = async () => {
    const filled = addRows.filter(
      (r) => r.truckNo.trim() || r.driverName.trim() || r.passportDueDate || r.position.trim()
    );
    if (!filled.length) {
      toast.error('Enter at least one truck row');
      return;
    }

    for (let i = 0; i < filled.length; i++) {
      const r = filled[i];
      const truckNo = r.truckNo.trim().toUpperCase();
      if (!truckNo || !r.passportDueDate) {
        toast.error(`Row ${i + 1}: truck and passport due are required`);
        return;
      }
      if (!/^[A-Z0-9 ]{3,20}$/.test(truckNo)) {
        toast.error(`Row ${i + 1}: truck no. looks invalid`);
        return;
      }

      const check = addRowChecks[r.key];
      const flags = check?.flags || [];
      const truckBlocked =
        (flags.includes('truck_in_raw') ||
          flags.includes('truck_recent') ||
          flags.includes('truck_in_form')) &&
        !r.ignoreTruckFlag;
      const nameBlocked =
        (flags.includes('name_exact') ||
          flags.includes('name_fuzzy') ||
          flags.includes('name_in_form')) &&
        !r.ignoreNameFlag;
      if (truckBlocked || nameBlocked) {
        toast.error(
          `Row ${i + 1}: resolve flags first — View match, then Ignore if you still want to continue`
        );
        return;
      }
    }

    const needsBuild = filled.some((r) => r.destination === 'build');
    if (needsBuild && !addBuildDate) {
      toast.error('Choose the build review date for late adds');
      return;
    }

    setBusy(true);
    try {
      const result = await visaOverstayAPI.createCasesBulk({
        buildDate: needsBuild ? addBuildDate : undefined,
        items: filled.map((r) => ({
          truckNo: r.truckNo.trim().toUpperCase(),
          driverName: r.driverName.trim() || undefined,
          passportDueDate: r.passportDueDate,
          dateSubmitted: todayISO(),
          position: r.position.trim() || undefined,
          destination: r.destination,
        })),
      });

      const n = result?.cases?.length || 0;
      const errN = result?.errors?.length || 0;
      const counts = result?.counts || {};
      if (n) {
        const parts = [
          counts.raw ? `${counts.raw} raw` : null,
          counts.waiting ? `${counts.waiting} waiting` : null,
          counts.build ? `${counts.build} build` : null,
          counts.crossed ? `${counts.crossed} crossed` : null,
        ].filter(Boolean);
        toast.success(`Saved ${n} truck(s)${parts.length ? ` (${parts.join(', ')})` : ''}`);
      }
      if (errN) toast.warn(`${errN} row(s) skipped`);

      setShowAddTruck(false);
      if (counts.crossed && !counts.build && !counts.raw && !counts.waiting) {
        setWorkspaceTab('crossed');
        await loadCrossed();
      } else if (counts.build) {
        setBuildDate(addBuildDate);
        setWorkspaceTab('build');
        await loadBuild(addBuildDate);
      } else if (counts.waiting && !counts.raw) {
        setWorkspaceTab('waiting');
        await loadQueues();
      } else if (counts.crossed) {
        setWorkspaceTab('crossed');
        await loadCrossed();
      } else {
        setWorkspaceTab('raw');
        await loadQueues();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save trucks');
    } finally {
      setBusy(false);
    }
  };

  const toDateInputValue = (value?: string | null) => toYmd(value);

  const openTruckHistory = async (
    truckNo: string,
    passportDueDate?: string,
    caseId?: string
  ) => {
    const truck = truckNo.trim().toUpperCase();
    if (!truck) {
      toast.error('Enter a truck number first');
      return;
    }
    const dueYmd = toYmd(passportDueDate) || undefined;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryTruck(truck);
    setHistoryDue(dueYmd);
    setHistoryCases([]);
    try {
      const data = await visaOverstayAPI.getTruckHistory({
        truckNo: truck,
        passportDueDate: dueYmd,
        caseId: caseId || undefined,
      });
      const cases = (data?.cases || []).map((hc: TruckHistoryCase) => ({
        ...hc,
        passportDueDate: toYmd(hc.passportDueDate) || null,
        dateSubmitted: toYmd(hc.dateSubmitted) || null,
        firstPaidAt: toYmd(hc.firstPaidAt) || null,
        lastOverstayPaidAt: toYmd(hc.lastOverstayPaidAt) || null,
        crossedAt: toYmd(hc.crossedAt) || null,
        payments: (hc.payments || []).map((p) => ({
          ...p,
          paymentDate: toYmd(p.paymentDate) || null,
        })),
        buildItems: (hc.buildItems || []).map((b) => ({
          ...b,
          buildDate: toYmd(b.buildDate) || null,
          passportDueDate: toYmd(b.passportDueDate) || null,
        })),
      }));
      setHistoryCases(cases);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load truck history');
      setHistoryOpen(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  const startEditRaw = (c: CaseRow) => {
    setEditingRawId(c._id);
    setRawEditDraft({
      truckNo: c.truckNo,
      driverName: c.driverName,
      passportDueDate: toDateInputValue(c.passportDueDate),
      position: c.position || '',
    });
  };

  const cancelEditRaw = () => {
    setEditingRawId(null);
    setRawEditDraft(null);
  };

  const saveEditRaw = async () => {
    if (!editingRawId || !rawEditDraft) return;
    const truckNo = rawEditDraft.truckNo.trim().toUpperCase();
    if (!truckNo || !rawEditDraft.driverName.trim() || !rawEditDraft.passportDueDate) {
      toast.error('Truck, name, and passport due are required');
      return;
    }
    setBusy(true);
    try {
      const result = await visaOverstayAPI.updateCase(editingRawId, {
        truckNo,
        driverName: rawEditDraft.driverName.trim(),
        passportDueDate: rawEditDraft.passportDueDate,
        position: rawEditDraft.position.trim() || undefined,
      });
      const cascaded = result?.cascaded || {};
      const buildN = cascaded.buildItems || 0;
      const payN = cascaded.payments || 0;
      toast.success(
        buildN || payN
          ? `Updated — synced ${buildN} build preview, ${payN} payment row(s)`
          : 'Raw entry updated'
      );
      cancelEditRaw();
      await loadQueues();
      if (buildN) await loadBuild(buildDate);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update');
    } finally {
      setBusy(false);
    }
  };

  const addToDay = async (c: CaseRow) => {
    const day = todayISO();
    setBusy(true);
    try {
      await visaOverstayAPI.addCaseToDay(c._id, { date: day, includeVisa: true });
      toast.success(`${c.truckNo} added to ${formatSheetDate(day)}`);
      openSheet(day);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to add to day');
    } finally {
      setBusy(false);
    }
  };

  const moveToWaiting = async (c: CaseRow) => {
    setBusy(true);
    try {
      await visaOverstayAPI.markWaitingDue(c._id);
      toast.success(`${c.truckNo} → waiting due date`);
      setWorkspaceTab('waiting');
      await loadQueues();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const moveToRaw = async (c: CaseRow) => {
    setBusy(true);
    try {
      await visaOverstayAPI.markRawInput(c._id);
      toast.success(`${c.truckNo} → raw input`);
      setWorkspaceTab('raw');
      await loadQueues();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const withSheetRows = async (date: string) => {
    const sheet = await visaOverstayAPI.getSheet(date);
    return {
      rows: sheet.rows || [],
      totals: sheet.totals || { overstay: 0, visa: 0, all: 0 },
    };
  };

  const openEntryMenu = (key: string, el: HTMLElement) => {
    if (menuFor === key) {
      setMenuFor(null);
      setMenuAnchor(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const menuH = 280;
    const menuW = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuH && rect.top > menuH;
    const left = Math.min(Math.max(8, rect.right - menuW), window.innerWidth - menuW - 8);
    setMenuAnchor({
      top: openUp ? rect.top - 8 : rect.bottom + 4,
      left,
      openUp,
    });
    setMenuFor(key);
  };

  const handleDownloadXlsx = async (date: string) => {
    try {
      await downloadDaySheetExport(date, 'xlsx');
      toast.success('Excel workbook downloaded');
      setMenuFor(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Excel export failed');
    }
  };

  const handleDownloadPdf = async (date: string) => {
    const count = entries.filter((e) => e.date === date).length;
    const opts = exportAvailability(estimateDaySheetPages(count || 1));
    if (!opts.pdfAllowed) {
      toast.info(opts.pdfHint);
      return;
    }
    try {
      await downloadDaySheetExport(date, 'pdf');
      toast.success('PDF downloaded');
      setMenuFor(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'PDF export failed');
    }
  };

  const handleDownloadImage = async (date: string) => {
    const count = entries.filter((e) => e.date === date).length;
    const opts = exportAvailability(estimateDaySheetPages(count || 1));
    if (!opts.imageAllowed) {
      toast.info(opts.imageHint);
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
      setMenuFor(null);
    } catch (err: any) {
      toast.update(toastId, {
        render: err?.response?.data?.message || err?.message || 'Image export failed',
        type: 'error',
        isLoading: false,
        autoClose: 5000,
      });
    }
  };

  const exportBuild = async (kind: 'xlsx' | 'pdf' | 'image') => {
    if (!buildItems.length) {
      toast.info('No build rows to export');
      return;
    }
    const opts = exportAvailability(estimateBuildReviewPages(buildItems.length));
    if (kind === 'image' && !opts.imageAllowed) {
      toast.info(opts.imageHint);
      return;
    }
    if (kind === 'pdf' && !opts.pdfAllowed) {
      toast.info(opts.pdfHint);
      return;
    }
    setBusy(true);
    setBuildExportOpen(false);
    const toastId =
      kind === 'image' ? toast.loading('Rendering PNG from PDF…') : null;
    try {
      await downloadBuildReviewExport(buildDate, kind);
      if (toastId) {
        toast.update(toastId, {
          render: 'Image (PNG) downloaded',
          type: 'success',
          isLoading: false,
          autoClose: 3000,
        });
      } else {
        toast.success(kind === 'xlsx' ? 'Excel downloaded' : 'PDF downloaded');
      }
    } catch (err: any) {
      if (toastId) {
        toast.update(toastId, {
          render: err?.response?.data?.message || err?.message || 'Export failed',
          type: 'error',
          isLoading: false,
          autoClose: 5000,
        });
      } else {
        toast.error(err?.response?.data?.message || err?.message || 'Export failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCopyWhatsApp = async (date: string) => {
    try {
      const { rows, totals: t } = await withSheetRows(date);
      await copyText(generateDaySheetWhatsAppText(date, rows, t));
      toast.success('WhatsApp text copied');
      setMenuFor(null);
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleCopyCsv = async (date: string) => {
    try {
      const { rows } = await withSheetRows(date);
      await copyText(generateDaySheetCsv(date, rows));
      toast.success('CSV text copied');
      setMenuFor(null);
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleDownloadCsv = async (date: string) => {
    try {
      const { rows } = await withSheetRows(date);
      downloadTextFile(`Visas_Overstays_${date}.csv`, generateDaySheetCsv(date, rows), 'text/csv;charset=utf-8');
      toast.success('CSV downloaded');
      setMenuFor(null);
    } catch {
      toast.error('Download failed');
    }
  };

  const handleDownloadTxt = async (date: string) => {
    try {
      const { rows, totals: t } = await withSheetRows(date);
      downloadTextFile(`Visas_Overstays_${date}.txt`, generateDaySheetWhatsAppText(date, rows, t));
      toast.success('Text downloaded');
      setMenuFor(null);
    } catch {
      toast.error('Download failed');
    }
  };

  const queueTabs: { id: WorkspaceTab; label: string; icon: typeof List; count?: number }[] = [
    { id: 'list', label: 'Day entries', icon: List },
    { id: 'build', label: 'Build review', icon: Wand2, count: buildItems.length },
    { id: 'raw', label: 'Raw input', icon: Inbox, count: rawInput.length },
    { id: 'waiting', label: 'Waiting due date', icon: Clock, count: waiting.length },
    { id: 'crossed', label: 'Crossed', icon: Flag, count: crossedList.length },
  ];

  const mainViews: { id: MainView; label: string; icon: typeof List; onClick: () => void }[] = [
    { id: 'list', label: 'List', icon: List, onClick: () => setViewMode('list') },
    { id: 'workbook', label: 'Open sheet', icon: BookOpen, onClick: goToWorkbookTab },
    { id: 'summary', label: 'Summary', icon: BarChart2, onClick: () => setViewMode('summary') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: text }}>
            Visas & Overstays
          </h2>
          <p className="text-sm" style={{ color: muted }}>
            Day sheets + WhatsApp raw input + waiting due date queues
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="flex rounded-lg border overflow-hidden"
            style={{ borderColor: card.borderColor }}
          >
            {mainViews.map((v, idx) => (
              <button
                key={v.id}
                onClick={v.onClick}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                  idx > 0 ? 'border-l' : ''
                } ${
                  viewMode === v.id
                    ? 'bg-teal-600 text-white'
                    : isDark
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-white text-slate-600 hover:bg-gray-50'
                }`}
                style={idx > 0 ? { borderColor: card.borderColor } : undefined}
              >
                <v.icon className="w-3.5 h-3.5" /> {v.label}
              </button>
            ))}
          </div>
          {viewMode === 'list' && (
            <>
              <button
                onClick={openAddTruck}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700"
              >
                <Truck className="w-3.5 h-3.5" /> Add truck
              </button>
              <button
                onClick={openBuildModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border"
                style={{ borderColor: card.borderColor, color: text }}
              >
                <Wand2 className="w-3.5 h-3.5" /> Build day
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'workbook' && (
        <ClerkDayWorkbook
          key={selectedDate || latestDate || todayISO()}
          initialDate={selectedDate || latestDate || todayISO()}
          onBack={() => {
            setViewMode('list');
            if (workspaceTab === 'list') loadEntries();
            else if (workspaceTab === 'build') loadBuild();
            else if (workspaceTab === 'crossed') loadCrossed();
            else loadQueues();
          }}
        />
      )}

      {viewMode === 'summary' && <ClerkSummary />}

      {viewMode === 'list' && (
        <>
      <div className="flex gap-1 border-b" style={{ borderColor: card.borderColor }}>
        {queueTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setWorkspaceTab(t.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px"
            style={{
              borderColor: workspaceTab === t.id ? '#0D9488' : 'transparent',
              color: workspaceTab === t.id ? '#0D9488' : muted,
            }}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {typeof t.count === 'number' && (
              <span className="text-xs opacity-70">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {workspaceTab === 'list' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Trucks', value: String(totals.trucks) },
              { label: 'Overstay', value: `$${totals.overstay}` },
              { label: 'Visa', value: `$${totals.visa}` },
              { label: 'Harrison', value: `$${totals.harrison || 0}` },
              { label: 'Total', value: `$${totals.all}` },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border px-4 py-3" style={card}>
                <p className="text-xs" style={{ color: muted }}>{s.label}</p>
                <p className="text-lg font-semibold" style={{ color: text }}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border overflow-hidden" style={card}>
            <div className="p-4 border-b" style={{ borderColor: card.borderColor }}>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="relative col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search truck, name, position…"
                    className={`${fieldCls} pl-9`}
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={fieldCls} title="From" />
                  <span style={{ color: muted }}>—</span>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={fieldCls} title="To" />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'confirmed')}
                  className={fieldCls}
                >
                  <option value="all">All status</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                </select>
                <button
                  onClick={clearFilters}
                  disabled={!hasFilters}
                  className="inline-flex items-center justify-center gap-1 px-3 h-[38px] text-sm rounded-lg border disabled:opacity-40"
                  style={{ borderColor: card.borderColor, color: text }}
                >
                  <X className="w-4 h-4" /> Clear
                </button>
              </div>
            </div>

            {loading ? (
              <UnifiedTabLoader label="Loading truck entries..." heightClassName="h-48" />
            ) : entries.length === 0 ? (
              <div className="py-16 text-center" style={{ color: muted }}>
                {hasFilters ? 'No trucks match your filters' : 'No day entries yet. Use Raw input, then add to a day sheet.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr style={{ background: isDark ? '#0F172A' : '#F8FAFC', color: muted }}>
                      <th className="px-2 py-1.5 text-left font-medium">S/N</th>
                      <th className="px-2 py-1.5 text-left font-medium">Date</th>
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
                    {entries.map((row, index) => {
                      const key = `${row.date}-${row.caseId}-${row.overstayPaymentId || row.visaPaymentId || index}`;
                      const status = row.rowStatus || row.overstayStatus || row.visaStatus || '—';
                      const dayCount = entries.filter((e) => e.date === row.date).length;
                      const dayExport = exportAvailability(estimateDaySheetPages(dayCount || 1));
                      return (
                        <tr
                          key={key}
                          className="border-t cursor-pointer hover:bg-black/[0.03]"
                          style={{ borderColor: card.borderColor }}
                          onClick={() => openSheet(row.date)}
                        >
                          <td className="px-2 py-1 text-xs" style={{ color: muted }}>{index + 1}</td>
                          <td className="px-2 py-1 text-xs font-semibold text-teal-600">
                            {formatSheetDate(row.date)}
                          </td>
                          <td className="px-2 py-1 text-xs font-medium" style={{ color: text }}>
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              {row.truckNo}
                              {row.isCrossed && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-600">
                                  Crossed
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-xs" style={{ color: text }}>{row.driverName}</td>
                          <td className="px-2 py-1 text-xs" style={{ color: text }}>
                            {row.passportDueDate
                              ? formatSheetDate(toYmd(row.passportDueDate) || row.passportDueDate)
                              : '—'}
                          </td>
                          <td className="px-2 py-1 text-xs" style={{ color: text }}>{row.overstayLabel}</td>
                          <td className="px-2 py-1 text-xs" style={{ color: text }}>
                            {row.overstayAmount != null ? `$${row.overstayAmount}` : '—'}
                          </td>
                          <td className="px-2 py-1 text-xs" style={{ color: text }}>
                            {row.visaAmount != null ? `$${row.visaAmount}` : '—'}
                          </td>
                          <td className="px-2 py-1 text-xs" style={{ color: muted }}>{row.position || '—'}</td>
                          <td className="px-2 py-1 text-xs font-semibold text-teal-600">${row.rowTotal}</td>
                          <td className="px-2 py-1 text-xs font-semibold text-indigo-600">
                            {(row.harrisonAmount || 0) > 0 ? `$${row.harrisonAmount}` : '—'}
                          </td>
                          <td className="px-2 py-1 text-xs capitalize" style={{ color: status === 'confirmed' ? '#059669' : status === 'pending' ? '#D97706' : muted }}>
                            {status}
                          </td>
                          <td className="px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => openEntryMenu(key, e.currentTarget)}
                              className="p-1 rounded hover:bg-black/5"
                              style={{ color: muted }}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {menuFor === key && menuAnchor && (
                              <>
                                <div
                                  className="fixed inset-0 z-[100]"
                                  onClick={() => {
                                    setMenuFor(null);
                                    setMenuAnchor(null);
                                  }}
                                />
                                <div
                                  className="fixed w-60 rounded-md border shadow-xl z-[110] py-1 text-left"
                                  style={{
                                    ...card,
                                    left: menuAnchor.left,
                                    ...(menuAnchor.openUp
                                      ? { bottom: window.innerHeight - menuAnchor.top }
                                      : { top: menuAnchor.top }),
                                  }}
                                >
                                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: muted }}>
                                    Copy
                                  </div>
                                  <button onClick={() => handleCopyWhatsApp(row.date)} className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5" style={{ color: text }}>
                                    <MessageSquare className="w-4 h-4 mr-2 text-green-500" /> Copy for WhatsApp
                                  </button>
                                  <button onClick={() => handleCopyCsv(row.date)} className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5" style={{ color: text }}>
                                    <FileSpreadsheet className="w-4 h-4 mr-2" /> Copy as CSV text
                                  </button>
                                  <div className="border-t my-1" style={{ borderColor: card.borderColor }} />
                                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: muted }}>
                                    Download
                                  </div>
                                  <button onClick={() => handleDownloadXlsx(row.date)} className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5" style={{ color: text }}>
                                    <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" /> Excel (.xlsx)
                                  </button>
                                  <button
                                    onClick={() => handleDownloadPdf(row.date)}
                                    disabled={!dayExport.pdfAllowed}
                                    title={dayExport.pdfHint}
                                    className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                    style={{ color: text }}
                                  >
                                    <FileText className="w-4 h-4 mr-2 text-rose-600" /> PDF
                                    {dayExport.pages > 1 && dayExport.pdfAllowed ? (
                                      <span className="ml-auto text-[10px]" style={{ color: muted }}>
                                        {dayExport.pages}p
                                      </span>
                                    ) : null}
                                  </button>
                                  <button
                                    onClick={() => handleDownloadImage(row.date)}
                                    disabled={!dayExport.imageAllowed}
                                    title={dayExport.imageHint}
                                    className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                    style={{ color: text }}
                                  >
                                    <ImageIcon className="w-4 h-4 mr-2 text-sky-600" /> Image (PNG)
                                    {!dayExport.imageAllowed ? (
                                      <span className="ml-auto text-[10px]" style={{ color: muted }}>
                                        PDF only
                                      </span>
                                    ) : null}
                                  </button>
                                  <button onClick={() => handleDownloadCsv(row.date)} className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5" style={{ color: text }}>
                                    <Download className="w-4 h-4 mr-2 text-teal-600" /> CSV
                                  </button>
                                  <button onClick={() => handleDownloadTxt(row.date)} className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5" style={{ color: text }}>
                                    <Copy className="w-4 h-4 mr-2" /> Text
                                  </button>
                                  <div className="border-t my-1" style={{ borderColor: card.borderColor }} />
                                  <button onClick={() => openSheet(row.date)} className="flex items-center w-full px-4 py-2 text-sm hover:bg-black/5" style={{ color: text }}>
                                    <BookOpen className="w-4 h-4 mr-2" /> Open sheet
                                  </button>
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {workspaceTab === 'build' && (
        <div className="rounded-xl border" style={card}>
          <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3 rounded-t-xl" style={{ borderColor: card.borderColor }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: text }}>
                Build review — {formatSheetDate(buildDate)}
              </h3>
              <p className="text-xs" style={{ color: muted }}>
                Edit truck / name / position (Excel paste fills down). Changes save to the case — Wait, Raw, day sheet, and rebuild keep them. Visa default: Raw on · Due/Cycle off.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={buildDate}
                onChange={(e) => {
                  setBuildDate(e.target.value);
                  setSelectedBuildIds([]);
                  loadBuild(e.target.value);
                }}
                className={fieldCls}
                style={{ width: 160 }}
              />
              <div className="relative">
                <button
                  disabled={busy || !buildItems.length}
                  onClick={() => setBuildExportOpen((v) => !v)}
                  className="text-xs px-3 py-1.5 rounded-md border inline-flex items-center gap-1.5 disabled:opacity-50"
                  style={{ borderColor: card.borderColor, color: text }}
                >
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
                {buildExportOpen && (
                  <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setBuildExportOpen(false)} />
                    <div
                      className="absolute right-0 mt-1 w-52 rounded-md border shadow-xl z-[110] py-1"
                      style={card}
                    >
                      {(() => {
                        const buildExport = exportAvailability(
                          estimateBuildReviewPages(buildItems.length)
                        );
                        return (
                          <>
                      <button
                        onClick={() => exportBuild('xlsx')}
                        className="flex items-center w-full px-3 py-2 text-xs hover:bg-black/5"
                        style={{ color: text }}
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Excel (.xlsx)
                      </button>
                      <button
                        onClick={() => exportBuild('pdf')}
                        disabled={!buildExport.pdfAllowed}
                        title={buildExport.pdfHint}
                        className="flex items-center w-full px-3 py-2 text-xs hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        style={{ color: text }}
                      >
                        <FileText className="w-3.5 h-3.5 mr-2 text-rose-600" /> PDF
                        {buildExport.pages > 1 && buildExport.pdfAllowed ? (
                          <span className="ml-auto text-[10px]" style={{ color: muted }}>
                            {buildExport.pages}p
                          </span>
                        ) : null}
                      </button>
                      <button
                        onClick={() => exportBuild('image')}
                        disabled={!buildExport.imageAllowed}
                        title={buildExport.imageHint}
                        className="flex items-center w-full px-3 py-2 text-xs hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        style={{ color: text }}
                      >
                        <ImageIcon className="w-3.5 h-3.5 mr-2 text-sky-600" /> Image (PNG)
                        {!buildExport.imageAllowed ? (
                          <span className="ml-auto text-[10px]" style={{ color: muted }}>
                            PDF only
                          </span>
                        ) : null}
                      </button>
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
              <button
                disabled={busy}
                onClick={confirmAllReady}
                className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white disabled:opacity-50"
              >
                Confirm ready → day
              </button>
            </div>
          </div>

          {selectedBuildIds.length > 0 && (
            <div
              className="px-4 py-2 border-b flex flex-wrap items-center gap-2 text-xs"
              style={{ borderColor: card.borderColor, background: isDark ? '#0F172A' : '#F8FAFC' }}
            >
              <span style={{ color: text }}>{selectedBuildIds.length} selected</span>
              <button
                disabled={busy}
                onClick={() => bulkResolve('waiting')}
                className="px-2 py-1 rounded border text-amber-700 border-amber-300 disabled:opacity-50"
              >
                → Waiting
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  const selected = buildItems.filter((i) => selectedBuildIds.includes(i._id));
                  openCrossModal(selected);
                }}
                className="px-2 py-1 rounded border text-orange-700 border-orange-300 disabled:opacity-50"
              >
                → Crossed
              </button>
              <button
                disabled={busy}
                onClick={() => bulkResolve('confirm')}
                className="px-2 py-1 rounded border text-teal-700 border-teal-300 disabled:opacity-50"
              >
                → Day
              </button>
              <button
                disabled={busy}
                onClick={() => bulkResolve('dismiss')}
                className="px-2 py-1 rounded border disabled:opacity-50"
                style={{ color: muted, borderColor: card.borderColor }}
              >
                Skip
              </button>
              <button
                onClick={() => setSelectedBuildIds([])}
                className="px-2 py-1 hover:underline"
                style={{ color: muted }}
              >
                Clear
              </button>
            </div>
          )}

          {loading ? (
            <UnifiedTabLoader label="Loading build review..." heightClassName="h-40" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ background: isDark ? '#0F172A' : '#F8FAFC', color: muted }}>
                    <th className="px-2 py-1.5 text-left font-medium w-8">
                      <input
                        type="checkbox"
                        checked={
                          buildItems.length > 0 && selectedBuildIds.length === buildItems.length
                        }
                        onChange={(e) =>
                          setSelectedBuildIds(
                            e.target.checked ? buildItems.map((i) => i._id) : []
                          )
                        }
                      />
                    </th>
                    <th className="px-2 py-1.5 text-left font-medium">S/N</th>
                    <th className="px-2 py-1.5 text-left font-medium">Source</th>
                    <th className="px-2 py-1.5 text-left font-medium">Truck</th>
                    <th className="px-2 py-1.5 text-left font-medium">Name</th>
                    <th className="px-2 py-1.5 text-left font-medium">Passport due</th>
                    <th className="px-2 py-1.5 text-left font-medium">Position *</th>
                    <th className="px-2 py-1.5 text-left font-medium">Overstay</th>
                    <th className="px-2 py-1.5 text-left font-medium">Visa</th>
                    <th className="px-2 py-1.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {buildItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-10 text-center" style={{ color: muted }}>
                        No pending build items. Use Build day to generate today’s review list.
                      </td>
                    </tr>
                  ) : (
                    buildItems.map((item, idx) => {
                      const src = BUILD_SOURCE_STYLE[item.source] || {
                        label: item.source,
                        bg: 'rgba(100,116,139,0.12)',
                        color: '#475569',
                      };
                      const dueYmd = toYmd(item.passportDueDate);
                      return (
                        <tr
                          key={item._id}
                          className="border-t"
                          style={{
                            borderColor: card.borderColor,
                            background: src.bg.replace(/[\d.]+\)$/, '0.06)'),
                          }}
                        >
                          <td className="px-2 py-1">
                            <input
                              type="checkbox"
                              checked={selectedBuildIds.includes(item._id)}
                              onChange={(e) =>
                                setSelectedBuildIds((prev) =>
                                  e.target.checked
                                    ? [...prev, item._id]
                                    : prev.filter((id) => id !== item._id)
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-1 text-xs" style={{ color: muted }}>{idx + 1}</td>
                          <td className="px-2 py-1">
                            <span
                              className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                              style={{ background: src.bg, color: src.color }}
                            >
                              {src.label}
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            <input
                              className={`${fieldCls} h-[32px] text-xs font-medium uppercase`}
                              value={item.truckNo || ''}
                              onChange={(e) =>
                                setBuildItems((prev) =>
                                  prev.map((b) =>
                                    b._id === item._id
                                      ? { ...b, truckNo: e.target.value.toUpperCase() }
                                      : b
                                  )
                                )
                              }
                              onBlur={(e) => {
                                const v = e.target.value.trim().toUpperCase();
                                if (!v) {
                                  toast.error('Truck cannot be empty');
                                  loadBuild();
                                  return;
                                }
                                patchBuildItem(item._id, { truckNo: v });
                              }}
                              onPaste={(e) => handleBuildPaste(idx, 'truckNo', e)}
                              title="Edit truck — paste column from Excel to fill down"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              className={`${fieldCls} h-[32px] text-xs`}
                              value={item.driverName || ''}
                              onChange={(e) =>
                                setBuildItems((prev) =>
                                  prev.map((b) =>
                                    b._id === item._id ? { ...b, driverName: e.target.value } : b
                                  )
                                )
                              }
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (!v) {
                                  toast.error('Name cannot be empty');
                                  loadBuild();
                                  return;
                                }
                                patchBuildItem(item._id, { driverName: v });
                              }}
                              onPaste={(e) => handleBuildPaste(idx, 'driverName', e)}
                              title="Edit name — paste column from Excel to fill down"
                            />
                          </td>
                          <td className="px-2 py-1 text-xs" style={{ color: text }} title={dueYmd || undefined}>
                            {dueYmd ? formatSheetDate(dueYmd) : '—'}
                          </td>
                          <td className="px-2 py-1">
                            <input
                              className={`${fieldCls} h-[32px] text-xs ${
                                !item.position?.trim() ? 'ring-1 ring-amber-400' : ''
                              }`}
                              placeholder="Position required"
                              value={item.position || ''}
                              onChange={(e) =>
                                setBuildItems((prev) =>
                                  prev.map((b) =>
                                    b._id === item._id ? { ...b, position: e.target.value } : b
                                  )
                                )
                              }
                              onBlur={(e) =>
                                patchBuildItem(item._id, { position: e.target.value.trim() })
                              }
                              onPaste={(e) => handleBuildPaste(idx, 'position', e)}
                              title="Paste positions from Excel to fill down rows"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <label className="inline-flex items-center gap-1 text-xs" style={{ color: text }}>
                              <input
                                type="checkbox"
                                checked={item.includeOverstay}
                                onChange={(e) =>
                                  patchBuildItem(item._id, { includeOverstay: e.target.checked })
                                }
                              />
                              ${item.overstayAmount}
                            </label>
                          </td>
                          <td className="px-2 py-1">
                            <label className="inline-flex items-center gap-1 text-xs" style={{ color: text }}>
                              <input
                                type="checkbox"
                                checked={item.includeVisa}
                                onChange={(e) =>
                                  patchBuildItem(item._id, { includeVisa: e.target.checked })
                                }
                              />
                              ${item.visaAmount}
                            </label>
                          </td>
                          <td className="px-2 py-1 text-right whitespace-nowrap">
                            <span className="inline-flex gap-1 items-center justify-end mr-1.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  openTruckHistory(
                                    item.truckNo,
                                    dueYmd || undefined,
                                    item.caseId
                                  )
                                }
                                className={iconBtnInspectCls}
                                title={`Inspect ${item.truckNo}${dueYmd ? ` · due ${dueYmd}` : ''}`}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </span>
                            <button
                              disabled={busy}
                              onClick={() => resolveBuild(item, 'confirm')}
                              className="text-xs text-teal-600 hover:underline mr-2"
                            >
                              → Day
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => resolveBuild(item, 'waiting')}
                              className="text-xs text-amber-600 hover:underline mr-2"
                            >
                              Wait
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => resolveBuild(item, 'crossed')}
                              className="text-xs text-orange-600 hover:underline mr-2"
                            >
                              Crossed
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => resolveBuild(item, 'dismiss')}
                              className="text-xs hover:underline"
                              style={{ color: muted }}
                            >
                              Skip
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {workspaceTab === 'raw' && (
        <div className="rounded-xl border overflow-hidden" style={card}>
          <div className="px-4 py-3 border-b flex justify-between gap-3" style={{ borderColor: card.borderColor }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: text }}>Raw input (WhatsApp)</h3>
              <p className="text-xs" style={{ color: muted }}>
                Edit truck / due date / name here — pending Build preview rows update automatically
              </p>
            </div>
            <button onClick={openAddTruck} className="text-xs px-3 py-1.5 rounded-md bg-teal-600 text-white">
              + Add truck
            </button>
          </div>
          {loading ? (
            <UnifiedTabLoader label="Loading raw input..." heightClassName="h-40" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ background: isDark ? '#0F172A' : '#F8FAFC', color: muted }}>
                    <th className="px-3 py-2 text-left font-medium">S/N</th>
                    <th className="px-3 py-2 text-left font-medium">Submitted</th>
                    <th className="px-3 py-2 text-left font-medium">Truck</th>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Passport due</th>
                    <th className="px-3 py-2 text-left font-medium">Position</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rawInput.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-10 text-center" style={{ color: muted }}>No raw WhatsApp entries</td></tr>
                  ) : rawInput.map((c, idx) => {
                    const editing = editingRawId === c._id && rawEditDraft;
                    return (
                      <tr key={c._id} className="border-t" style={{ borderColor: card.borderColor }}>
                        <td className="px-3 py-2" style={{ color: muted }}>{idx + 1}</td>
                        <td className="px-3 py-2" style={{ color: muted }}>{fmtDate(c.dateSubmitted)}</td>
                        {editing ? (
                          <>
                            <td className="px-2 py-1.5">
                              <input
                                className={`${fieldCls} h-[32px] text-xs`}
                                value={rawEditDraft.truckNo}
                                onChange={(e) =>
                                  setRawEditDraft({
                                    ...rawEditDraft,
                                    truckNo: e.target.value.toUpperCase(),
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                className={`${fieldCls} h-[32px] text-xs`}
                                value={rawEditDraft.driverName}
                                onChange={(e) =>
                                  setRawEditDraft({ ...rawEditDraft, driverName: e.target.value })
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="date"
                                className={`${fieldCls} h-[32px] text-xs`}
                                value={rawEditDraft.passportDueDate}
                                onChange={(e) =>
                                  setRawEditDraft({
                                    ...rawEditDraft,
                                    passportDueDate: e.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                className={`${fieldCls} h-[32px] text-xs`}
                                value={rawEditDraft.position}
                                onChange={(e) =>
                                  setRawEditDraft({ ...rawEditDraft, position: e.target.value })
                                }
                              />
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <button
                                disabled={busy}
                                onClick={saveEditRaw}
                                className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline mr-2"
                                title="Save (cascades to build preview)"
                              >
                                <Check className="w-3.5 h-3.5" /> Save
                              </button>
                              <button
                                disabled={busy}
                                onClick={cancelEditRaw}
                                className="text-xs hover:underline"
                                style={{ color: muted }}
                              >
                                Cancel
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-medium" style={{ color: text }}>{c.truckNo}</td>
                            <td className="px-3 py-2" style={{ color: text }}>{c.driverName}</td>
                            <td className="px-3 py-2" style={{ color: text }}>{fmtDate(c.passportDueDate)}</td>
                            <td className="px-3 py-2" style={{ color: muted }}>{c.position || '—'}</td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <span className="inline-flex gap-1 items-center justify-end mr-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    openTruckHistory(
                                      c.truckNo,
                                      toDateInputValue(c.passportDueDate),
                                      c._id
                                    )
                                  }
                                  className={iconBtnInspectCls}
                                  title="Inspect truck history"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => startEditRaw(c)}
                                  className={iconBtnEditCls}
                                  title="Edit raw entry"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              </span>
                              <button disabled={busy} onClick={() => addToDay(c)} className="text-xs text-teal-600 hover:underline mr-2">Add to today</button>
                              <button disabled={busy} onClick={() => moveToWaiting(c)} className="text-xs text-amber-600 hover:underline">Wait due date</button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {workspaceTab === 'waiting' && (
        <div className="rounded-xl border overflow-hidden" style={card}>
          <div className="px-4 py-3 border-b" style={{ borderColor: card.borderColor }}>
            <h3 className="text-sm font-semibold" style={{ color: text }}>Waiting due date</h3>
            <p className="text-xs" style={{ color: muted }}>
              Held until passport due — then add into the main day sheet
            </p>
          </div>
          {loading ? (
            <UnifiedTabLoader label="Loading waiting..." heightClassName="h-40" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ background: isDark ? '#0F172A' : '#F8FAFC', color: muted }}>
                    <th className="px-3 py-2 text-left font-medium">S/N</th>
                    <th className="px-3 py-2 text-left font-medium">Truck</th>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Passport due</th>
                    <th className="px-3 py-2 text-left font-medium">Position</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {waiting.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-10 text-center" style={{ color: muted }}>No trucks waiting on due date</td></tr>
                  ) : waiting.map((c, idx) => (
                    <tr key={c._id} className="border-t" style={{ borderColor: card.borderColor }}>
                      <td className="px-3 py-2" style={{ color: muted }}>{idx + 1}</td>
                      <td className="px-3 py-2 font-medium" style={{ color: text }}>{c.truckNo}</td>
                      <td className="px-3 py-2" style={{ color: text }}>{c.driverName}</td>
                      <td className="px-3 py-2" style={{ color: text }}>{fmtDate(c.passportDueDate)}</td>
                      <td className="px-3 py-2" style={{ color: muted }}>{c.position || '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span className="inline-flex gap-1 items-center justify-end mr-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              openTruckHistory(
                                c.truckNo,
                                toDateInputValue(c.passportDueDate),
                                c._id
                              )
                            }
                            className={iconBtnInspectCls}
                            title="Inspect truck history"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </span>
                        <button disabled={busy} onClick={() => addToDay(c)} className="text-xs text-teal-600 hover:underline mr-2">Add to today</button>
                        <button disabled={busy} onClick={() => moveToRaw(c)} className="text-xs hover:underline" style={{ color: muted }}>Back to raw</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {workspaceTab === 'crossed' && (
        <div className="rounded-xl border overflow-hidden" style={card}>
          <div className="px-4 py-3 border-b flex flex-wrap items-start justify-between gap-3" style={{ borderColor: card.borderColor }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: text }}>Crossed / crossing</h3>
              <p className="text-xs" style={{ color: muted }}>
                Border intake (days to due − 10) × $5 — not on day entries. Also includes trucks marked crossed from sheets / build.
              </p>
            </div>
            <div className="text-right text-xs" style={{ color: muted }}>
              <div>
                <span className="font-semibold" style={{ color: text }}>{crossedTotals.trucks}</span> trucks
              </div>
              <div>
                Settlement total{' '}
                <span className="font-semibold text-orange-600">
                  ${Number(crossedTotals.extraAmount || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          {loading ? (
            <UnifiedTabLoader label="Loading crossed..." heightClassName="h-40" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ background: isDark ? '#0F172A' : '#F8FAFC', color: muted }}>
                    <th className="px-3 py-2 text-left font-medium">S/N</th>
                    <th className="px-3 py-2 text-left font-medium">Crossed</th>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                    <th className="px-3 py-2 text-left font-medium">Truck</th>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Passport due</th>
                    <th className="px-3 py-2 text-left font-medium">Position</th>
                    <th className="px-3 py-2 text-right font-medium">Days</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {crossedList.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-10 text-center" style={{ color: muted }}>
                        No crossed trucks yet — add with destination “Crossed / crossing”, or mark crossed from a day sheet
                      </td>
                    </tr>
                  ) : (
                    crossedList.map((c, idx) => (
                      <tr key={c._id} className="border-t" style={{ borderColor: card.borderColor }}>
                        <td className="px-3 py-2" style={{ color: muted }}>{idx + 1}</td>
                        <td className="px-3 py-2" style={{ color: muted }}>{fmtDate(c.crossedAt || undefined)}</td>
                        <td className="px-3 py-2">
                          <span
                            className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded"
                            style={{
                              color: c.crossSource === 'intake' ? '#EA580C' : '#0D9488',
                              background:
                                c.crossSource === 'intake'
                                  ? 'rgba(234,88,12,0.1)'
                                  : 'rgba(13,148,136,0.1)',
                            }}
                          >
                            {c.crossSource === 'intake'
                              ? 'Border intake'
                              : c.crossSource === 'build'
                                ? 'Build'
                                : 'Settlement'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium" style={{ color: text }}>{c.truckNo}</td>
                        <td className="px-3 py-2" style={{ color: text }}>{c.driverName}</td>
                        <td className="px-3 py-2" style={{ color: text }}>{fmtDate(c.passportDueDate || undefined)}</td>
                        <td className="px-3 py-2" style={{ color: muted }}>{c.position || '—'}</td>
                        <td className="px-3 py-2 text-right" style={{ color: muted }}>
                          {c.extraDays ?? 0}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-orange-600">
                          ${Number(c.extraAmount || 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              openTruckHistory(
                                c.truckNo,
                                toDateInputValue(c.passportDueDate),
                                c._id
                              )
                            }
                            className={iconBtnInspectCls}
                            title="Inspect truck history"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
        </>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl border shadow-xl p-5 space-y-4" style={card}>
            <div>
              <h3 className="font-semibold" style={{ color: text }}>
                {buildProgress?.done
                  ? buildProgress.alreadyBuilt
                    ? 'Already built'
                    : buildProgress.label === 'Rebuild complete'
                      ? 'Rebuild complete'
                      : 'Build complete'
                  : buildProgress?.active
                    ? dayAlreadyBuilt && rebuildAck
                      ? 'Rebuilding day…'
                      : 'Building day…'
                    : dayAlreadyBuilt && allowMultiBuild
                      ? 'Rebuild day'
                      : 'Confirm Build day'}
              </h3>
              <p className="text-xs mt-1" style={{ color: muted }}>
                {buildProgress?.active
                  ? 'Preparing and consolidating due, cycle, and reserve trucks.'
                  : dayAlreadyBuilt && allowMultiBuild
                    ? 'This date was already built. Rebuild restores pending trucks to Raw / Waiting, clears Build review, then runs Build day again.'
                    : dayAlreadyBuilt && !allowMultiBuild
                      ? 'This date was already built. Enable “Allow multi-build / rebuild” in Configuration to rebuild.'
                      : 'Choose the date to build. Trucks taken into Build review leave Raw / Waiting until confirmed or rebuilt.'}
              </p>
            </div>

            {!buildProgress?.active && (
              <>
                <label className="block text-xs font-medium" style={{ color: muted }}>
                  Build date *
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => onBuildDateChange(e.target.value)}
                    className={`${fieldCls} mt-1`}
                  />
                </label>
                <div
                  className="rounded-lg border px-3 py-2 text-xs space-y-1"
                  style={{ borderColor: card.borderColor, color: muted }}
                >
                  <p>
                    Will prepare for{' '}
                    <span className="font-semibold text-teal-600">{formatSheetDate(newDate)}</span>:
                  </p>
                  <p>· Passport due that day</p>
                  <p>· Not-crossed cycle lookback</p>
                  <p>· Raw / Waiting in reserve window</p>
                  <p className="pt-1">
                    Results go to <strong>Build review</strong> — not the day sheet yet.
                  </p>
                </div>

                {dayAlreadyBuilt && allowMultiBuild && (
                  <label
                    className="flex items-start gap-2 text-xs rounded-lg border px-3 py-2 cursor-pointer"
                    style={{
                      borderColor: '#F59E0B',
                      background: 'rgba(245,158,11,0.08)',
                      color: text,
                    }}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={rebuildAck}
                      onChange={(e) => setRebuildAck(e.target.checked)}
                    />
                    <span>
                      I understand Rebuild will <strong>return pending trucks</strong> to Raw /
                      Waiting, <strong>clear</strong> this day’s Build review, and{' '}
                      <strong>redo Build day</strong> from scratch.
                    </span>
                  </label>
                )}

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setShowCreate(false);
                      setBuildProgress(null);
                      setRebuildAck(false);
                    }}
                    className="px-3 py-2 text-sm rounded-md border"
                    style={{ borderColor: card.borderColor, color: text }}
                  >
                    Cancel
                  </button>
                  {dayAlreadyBuilt && !allowMultiBuild ? (
                    <button
                      onClick={() => {
                        setBuildDate(newDate);
                        setShowCreate(false);
                        setWorkspaceTab('build');
                      }}
                      className="px-3 py-2 text-sm rounded-md bg-teal-600 text-white"
                    >
                      Open Build review
                    </button>
                  ) : dayAlreadyBuilt && allowMultiBuild ? (
                    <button
                      disabled={busy || !newDate || !rebuildAck}
                      onClick={() => createOrOpenDay({ rebuild: true })}
                      className="px-3 py-2 text-sm rounded-md bg-amber-600 text-white disabled:opacity-50"
                    >
                      Confirm & rebuild
                    </button>
                  ) : (
                    <button
                      disabled={busy || !newDate}
                      onClick={() => createOrOpenDay()}
                      className="px-3 py-2 text-sm rounded-md bg-teal-600 text-white disabled:opacity-50"
                    >
                      Confirm & build
                    </button>
                  )}
                </div>
              </>
            )}

            {buildProgress?.active && (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1.5" style={{ color: muted }}>
                    <span>{buildProgress.label}</span>
                    <span>{buildProgress.percent}%</span>
                  </div>
                  <div
                    className="h-2.5 rounded-full overflow-hidden"
                    style={{ background: isDark ? '#334155' : '#E2E8F0' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300 ease-out"
                      style={{
                        width: `${buildProgress.percent}%`,
                        background: buildProgress.alreadyBuilt ? '#D97706' : '#0D9488',
                      }}
                    />
                  </div>
                </div>

                <ul className="space-y-1">
                  {BUILD_STEPS.map((label, idx) => {
                    const reached = idx <= buildProgress.step || buildProgress.done;
                    return (
                      <li
                        key={label}
                        className="text-xs flex items-center gap-2"
                        style={{ color: reached ? text : muted, opacity: reached ? 1 : 0.55 }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{
                            background: reached
                              ? buildProgress.alreadyBuilt && buildProgress.done
                                ? '#D97706'
                                : '#0D9488'
                              : '#94A3B8',
                          }}
                        />
                        {label}
                      </li>
                    );
                  })}
                </ul>

                {buildProgress.done && buildProgress.message && (
                  <p
                    className="text-sm rounded-lg border px-3 py-2"
                    style={{
                      borderColor: buildProgress.alreadyBuilt ? '#F59E0B' : card.borderColor,
                      color: text,
                      background: buildProgress.alreadyBuilt
                        ? 'rgba(245,158,11,0.08)'
                        : 'transparent',
                    }}
                  >
                    {buildProgress.message}
                  </p>
                )}

                {buildProgress.done && (
                  <div className="flex flex-wrap justify-end gap-2">
                    {buildProgress.alreadyBuilt && allowMultiBuild && (
                      <button
                        onClick={() => {
                          setBuildProgress(null);
                          setRebuildAck(false);
                        }}
                        className="px-3 py-2 text-sm rounded-md border border-amber-500 text-amber-700"
                      >
                        Back to Rebuild
                      </button>
                    )}
                    <button
                      onClick={finishBuildModal}
                      className="px-3 py-2 text-sm rounded-md bg-teal-600 text-white"
                    >
                      {buildProgress.alreadyBuilt ? 'Open Build review' : 'Go to Build review'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddTruck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50">
          <div
            className="w-[min(1400px,96vw)] rounded-xl border shadow-xl max-h-[92vh] overflow-hidden flex flex-col"
            style={card}
          >
            <div className="px-5 py-4 border-b flex items-start justify-between gap-3" style={{ borderColor: card.borderColor }}>
              <div>
                <h3 className="font-semibold" style={{ color: text }}>Add trucks</h3>
                <p className="text-xs mt-0.5" style={{ color: muted }}>
                  Paste dates from Excel into Passport due, or drag the teal corner handle down to fill
                  the same date (double-click fills through rows with trucks).
                </p>
              </div>
              <button onClick={() => setShowAddTruck(false)} style={{ color: muted }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {addRows.some((r) => r.destination === 'build') && (
              <div className="px-5 py-3 border-b" style={{ borderColor: card.borderColor }}>
                <label className="block text-xs" style={{ color: muted }}>
                  Build review date * (for late-add rows)
                  <input
                    type="date"
                    className={`${fieldCls} mt-1 max-w-xs`}
                    value={addBuildDate}
                    onChange={(e) => setAddBuildDate(e.target.value)}
                  />
                </label>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-3">
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: card.borderColor }}>
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: '36px' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '140px' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '140px' }} />
                    <col style={{ width: '168px' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: isDark ? '#0F172A' : '#F8FAFC', color: muted }}>
                      <th className="px-2 py-2 text-left font-medium">#</th>
                      <th className="px-2 py-2 text-left font-medium">Truck *</th>
                      <th className="px-2 py-2 text-left font-medium">Driver name</th>
                      <th className="px-2 py-2 text-left font-medium">Passport due *</th>
                      <th className="px-2 py-2 text-left font-medium">Position</th>
                      <th className="px-2 py-2 text-left font-medium">Destination *</th>
                      <th className="px-2 py-2 text-right font-medium">Status / Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addRows.map((row, idx) => {
                      const check = addRowChecks[row.key];
                      const st = rowStatusLabel(row, check);
                      const hasTruckAlert =
                        st.alert &&
                        (check?.flags?.includes('truck_in_raw') ||
                          check?.flags?.includes('truck_recent') ||
                          check?.flags?.includes('truck_in_form')) &&
                        !row.ignoreTruckFlag;
                      const hasNameAlert =
                        st.alert &&
                        (check?.flags?.includes('name_exact') ||
                          check?.flags?.includes('name_fuzzy') ||
                          check?.flags?.includes('name_in_form')) &&
                        !row.ignoreNameFlag;
                      return (
                        <tr key={row.key} className="border-t" style={{ borderColor: card.borderColor }}>
                          <td className="px-2 py-1.5 text-xs" style={{ color: muted }}>{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`${fieldCls} h-[34px] text-xs w-full min-w-0 ${
                                hasTruckAlert ? 'ring-1 ring-red-400' : ''
                              }`}
                              placeholder="T000 XXX"
                              title="Paste multiple trucks (one per line) or Excel block"
                              value={row.truckNo}
                              onChange={(e) =>
                                updateAddRow(row.key, { truckNo: e.target.value.toUpperCase() })
                              }
                              onPaste={(e) => handleAddRowPaste(idx, 'truckNo', e)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`${fieldCls} h-[34px] text-sm w-full min-w-0 ${
                                hasNameAlert ? 'ring-1 ring-amber-400' : ''
                              }`}
                              placeholder="Full driver name"
                              title="Paste multiple names (one per line)"
                              value={row.driverName}
                              onChange={(e) => updateAddRow(row.key, { driverName: e.target.value })}
                              onPaste={(e) => handleAddRowPaste(idx, 'driverName', e)}
                            />
                          </td>
                          <td
                            className="px-2 py-1.5"
                            data-fill-row={idx}
                            style={{
                              background:
                                fillDrag &&
                                idx >= Math.min(fillDrag.startIdx, fillDrag.hoverIdx) &&
                                idx <= Math.max(fillDrag.startIdx, fillDrag.hoverIdx)
                                  ? isDark
                                    ? 'rgba(13,148,136,0.18)'
                                    : 'rgba(13,148,136,0.12)'
                                  : undefined,
                            }}
                          >
                            <div className="relative group/datefill">
                              <input
                                type="date"
                                className={`${fieldCls} h-[34px] text-xs w-full min-w-0`}
                                title="Paste a date column, or drag the corner handle down to fill"
                                value={row.passportDueDate}
                                onChange={(e) =>
                                  updateAddRow(row.key, { passportDueDate: e.target.value })
                                }
                                onPaste={(e) => handleAddRowPaste(idx, 'passportDueDate', e)}
                              />
                              <button
                                type="button"
                                aria-label="Drag to fill date down"
                                title="Drag down to fill · double-click to fill through trucks"
                                className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-[2px] border border-teal-700 bg-teal-500 cursor-crosshair z-10 ${
                                  row.passportDueDate
                                    ? 'opacity-100'
                                    : 'opacity-0 group-hover/datefill:opacity-60'
                                } ${fillDrag?.startIdx === idx ? 'ring-2 ring-teal-300 scale-110' : ''}`}
                                onMouseDown={(e) => startDateFillDrag(idx, row.passportDueDate, e)}
                                onDoubleClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  fillDateThroughTrucks(idx, row.passportDueDate);
                                }}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`${fieldCls} h-[34px] text-xs w-full min-w-0`}
                              placeholder="Whisky / Kolwezi"
                              title="Paste multiple positions (one per line)"
                              value={row.position}
                              onChange={(e) => updateAddRow(row.key, { position: e.target.value })}
                              onPaste={(e) => handleAddRowPaste(idx, 'position', e)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className={`${fieldCls} h-[34px] text-xs w-full min-w-0`}
                              value={row.destination}
                              onChange={(e) =>
                                updateAddRow(row.key, {
                                  destination: e.target.value as AddTruckDest,
                                })
                              }
                            >
                              <option value="raw">Raw input</option>
                              <option value="waiting">Waiting due</option>
                              <option value="build">Build review</option>
                              <option value="crossed">Crossed / crossing</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-start justify-end gap-2">
                              <div className="flex flex-col items-end gap-0.5 min-w-0">
                                <span className="text-xs font-medium text-right" style={{ color: st.tone }}>
                                  {intakeCheckBusy && !st.alert ? 'Checking…' : st.label}
                                </span>
                                {st.alert && (
                                  <span className="inline-flex flex-wrap justify-end gap-1">
                                    {hasTruckAlert && (
                                      <>
                                        <button
                                          type="button"
                                          className="text-[10px] text-blue-600 hover:underline"
                                          onClick={() => openTruckInspect(row)}
                                        >
                                          View truck
                                        </button>
                                        <button
                                          type="button"
                                          className="text-[10px] hover:underline"
                                          style={{ color: muted }}
                                          onClick={() =>
                                            updateAddRow(row.key, { ignoreTruckFlag: true })
                                          }
                                        >
                                          Ignore
                                        </button>
                                      </>
                                    )}
                                    {hasNameAlert && (
                                      <>
                                        <button
                                          type="button"
                                          className="text-[10px] text-amber-700 hover:underline"
                                          onClick={() => openNameInspect(row)}
                                        >
                                          View name
                                        </button>
                                        <button
                                          type="button"
                                          className="text-[10px] hover:underline"
                                          style={{ color: muted }}
                                          onClick={() =>
                                            updateAddRow(row.key, { ignoreNameFlag: true })
                                          }
                                        >
                                          Ignore
                                        </button>
                                      </>
                                    )}
                                  </span>
                                )}
                              </div>
                              <span className="inline-flex gap-1 flex-shrink-0">
                                <button
                                  type="button"
                                  disabled={!row.truckNo.trim()}
                                  onClick={() =>
                                    openTruckHistory(row.truckNo, row.passportDueDate || undefined)
                                  }
                                  className={iconBtnInspectCls}
                                  title="Inspect previous overstay records for this truck"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={addRows.length <= 1}
                                  onClick={() =>
                                    setAddRows((prev) => prev.filter((r) => r.key !== row.key))
                                  }
                                  className={iconBtnDangerCls}
                                  title="Remove row"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: isDark ? '1px dashed #334155' : '1px dashed #99F6E4' }}>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <button
                          type="button"
                          onClick={() =>
                            setAddRows((prev) => [
                              ...prev,
                              makeAddRow(prev[prev.length - 1]?.destination || 'raw'),
                            ])
                          }
                          className="w-full py-[13px] border-0 text-[13px] font-bold inline-flex items-center justify-center gap-[7px] cursor-pointer hover:opacity-90"
                          style={{
                            background: isDark ? '#0F172A' : '#F0FDFA',
                            color: isDark ? '#5EEAD4' : '#0D9488',
                          }}
                        >
                          <Plus className="w-4 h-4" />
                          Add new row
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div
              className="px-5 py-4 border-t flex items-center justify-between gap-3"
              style={{ borderColor: card.borderColor }}
            >
              <p className="text-xs" style={{ color: muted }}>
                {
                  addRows.filter(
                    (r) => r.truckNo.trim() && r.passportDueDate
                  ).length
                }{' '}
                ready · name & position optional · submitted = today
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddTruck(false)}
                  className="px-3 py-2 text-sm rounded-md border"
                  style={{ borderColor: card.borderColor, color: text }}
                >
                  Cancel
                </button>
                <button
                  disabled={busy}
                  onClick={submitAddTruck}
                  className="px-3 py-2 text-sm rounded-md bg-teal-600 text-white disabled:opacity-50"
                >
                  Save trucks
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {crossModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
          <div
            className="w-full max-w-lg rounded-xl border shadow-xl max-h-[88vh] overflow-hidden flex flex-col"
            style={card}
          >
            <div
              className="px-5 py-4 border-b flex items-start justify-between gap-3"
              style={{ borderColor: card.borderColor }}
            >
              <div>
                <h3 className="font-semibold" style={{ color: text }}>Mark crossed</h3>
                <p className="text-xs mt-0.5" style={{ color: muted }}>
                  Enter when they crossed. Amount = (days to passport due − {crossPreviewCfg.cycleDays}) × $5
                  when no prior overstay payout; otherwise days since last overstay − grace.
                </p>
              </div>
              <button onClick={() => setCrossModal(null)} style={{ color: muted }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs" style={{ color: muted }}>
                  Crossed date *
                  <input
                    type="date"
                    className={`${fieldCls} mt-1`}
                    value={crossDate}
                    onChange={(e) => setCrossDate(e.target.value)}
                  />
                </label>
                <label className="block text-xs" style={{ color: muted }}>
                  Time *
                  <input
                    type="time"
                    className={`${fieldCls} mt-1`}
                    value={crossTime}
                    onChange={(e) => setCrossTime(e.target.value)}
                  />
                </label>
              </div>
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: card.borderColor }}>
                <table className="min-w-full text-xs">
                  <thead>
                    <tr style={{ background: isDark ? '#0F172A' : '#F8FAFC', color: muted }}>
                      <th className="px-2 py-1.5 text-left">Truck</th>
                      <th className="px-2 py-1.5 text-left">Due</th>
                      <th className="px-2 py-1.5 text-left">Calc</th>
                      <th className="px-2 py-1.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crossModal.trucks.map((t) => {
                      const prev = previewCrossAmount(t.passportDueDate, t.lastOverstayPaidAt);
                      return (
                        <tr key={t.truckNo + (t.passportDueDate || '')} className="border-t" style={{ borderColor: card.borderColor }}>
                          <td className="px-2 py-1.5" style={{ color: text }}>
                            {t.truckNo}
                            <span className="block" style={{ color: muted }}>{t.driverName}</span>
                          </td>
                          <td className="px-2 py-1.5" style={{ color: text }}>
                            {fmtDate(t.passportDueDate)}
                          </td>
                          <td className="px-2 py-1.5" style={{ color: muted }}>
                            {prev.label}
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold text-orange-600">
                            ${prev.amount}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div
              className="px-5 py-3 border-t flex justify-end gap-2"
              style={{ borderColor: card.borderColor }}
            >
              <button
                onClick={() => setCrossModal(null)}
                className="px-3 py-2 text-sm rounded-md border"
                style={{ borderColor: card.borderColor, color: text }}
              >
                Cancel
              </button>
              <button
                disabled={busy || !crossDate}
                onClick={submitCrossModal}
                className="px-3 py-2 text-sm rounded-md bg-orange-600 text-white disabled:opacity-50"
              >
                Confirm crossed
              </button>
            </div>
          </div>
        </div>
      )}

      {nameInspect && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
          <div
            className="w-full max-w-2xl rounded-xl border shadow-xl max-h-[85vh] overflow-hidden flex flex-col"
            style={card}
          >
            <div
              className="px-5 py-4 border-b flex items-start justify-between gap-3"
              style={{ borderColor: card.borderColor }}
            >
              <div>
                <h3 className="font-semibold" style={{ color: text }}>Compare match</h3>
                <p className="text-xs mt-0.5" style={{ color: muted }}>
                  Entered: <span style={{ color: text }}>{nameInspect.enteredTruck || '—'}</span>
                  {' · '}
                  <span style={{ color: text }}>{nameInspect.enteredName}</span>
                </p>
              </div>
              <button onClick={() => setNameInspect(null)} style={{ color: muted }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {nameInspect.matches.map((m) => (
                <div
                  key={m._id}
                  className="rounded-lg border p-3 text-sm"
                  style={{ borderColor: card.borderColor }}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-semibold" style={{ color: text }}>
                      {m.truckNo} — {m.driverName}
                    </p>
                    {m.similarity != null && (
                      <span className="text-xs font-medium text-amber-700">
                        {m.similarity}% similar
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: muted }}>
                    Status: {m.status}
                    {m.passportDueDate ? ` · due ${fmtDate(m.passportDueDate)}` : ''}
                    {m.dateSubmitted ? ` · submitted ${fmtDate(m.dateSubmitted)}` : ''}
                    {m.position ? ` · ${m.position}` : ''}
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-xs text-teal-600 hover:underline"
                    onClick={() => {
                      openTruckHistory(
                        m.truckNo,
                        toYmd(m.passportDueDate) || undefined,
                        m._id
                      );
                    }}
                  >
                    Open full history
                  </button>
                </div>
              ))}
            </div>
            <div
              className="px-5 py-3 border-t flex flex-wrap justify-end gap-2"
              style={{ borderColor: card.borderColor }}
            >
              <button
                type="button"
                className="px-3 py-2 text-sm rounded-md border"
                style={{ borderColor: card.borderColor, color: text }}
                onClick={() => {
                  setAddRows((prev) =>
                    prev.map((r) =>
                      r.key === nameInspect.rowKey
                        ? { ...r, ignoreTruckFlag: true, ignoreNameFlag: true }
                        : r
                    )
                  );
                  setNameInspect(null);
                  toast.success('Flags ignored for this row — you can continue');
                }}
              >
                Ignore & continue
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm rounded-md bg-teal-600 text-white"
                onClick={() => setNameInspect(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div
            className="w-full max-w-3xl rounded-xl border shadow-xl max-h-[88vh] overflow-hidden flex flex-col"
            style={card}
          >
            <div
              className="px-5 py-4 border-b flex items-start justify-between gap-3"
              style={{ borderColor: card.borderColor }}
            >
              <div>
                <h3 className="font-semibold" style={{ color: text }}>
                  Truck history — {historyTruck}
                  {historyDue ? ` · filter due ${historyDue}` : ''}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: muted }}>
                  {historyDue
                    ? `Cases matching passport due ${fmtDate(historyDue)} listed first. Each row shows its own due date and payments.`
                    : 'All overstay / visa cases and payments for this truck — each with its own dates.'}
                </p>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                style={{ color: muted }}
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {historyLoading ? (
                <UnifiedTabLoader label="Loading history..." heightClassName="h-40" />
              ) : historyCases.length === 0 ? (
                <p className="text-sm text-center py-10" style={{ color: muted }}>
                  No previous records for this truck
                </p>
              ) : (
                historyCases.map((hc) => {
                  const dueYmd = toYmd(hc.passportDueDate);
                  const highlighted = !!(hc.matchesCaseId || hc.matchesDueDate);
                  return (
                  <div
                    key={hc._id}
                    className="rounded-lg border p-3 space-y-2"
                    style={{
                      borderColor: highlighted ? '#0D9488' : card.borderColor,
                      background: highlighted
                        ? isDark
                          ? 'rgba(13,148,136,0.08)'
                          : 'rgba(13,148,136,0.04)'
                        : 'transparent',
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: text }}>
                          {hc.driverName}{' '}
                          <span className="font-normal" style={{ color: muted }}>
                            · passport due {dueYmd ? fmtDate(dueYmd) : '—'}
                            {dueYmd ? ` (${dueYmd})` : ''}
                          </span>
                        </p>
                        <p className="text-xs" style={{ color: muted }}>
                          Case {String(hc._id).slice(-6)} · {hc.position || 'No position'} · {hc.status}
                          {hc.firstPaidAt ? ` · first paid ${fmtDate(hc.firstPaidAt)}` : ''}
                          {hc.lastOverstayPaidAt
                            ? ` · last overstay ${fmtDate(hc.lastOverstayPaidAt)}`
                            : ''}
                          {hc.crossedAt ? ` · crossed ${fmtDate(hc.crossedAt)}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {hc.matchesCaseId && (
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                            This case
                          </span>
                        )}
                        {hc.matchesDueDate && !hc.matchesCaseId && (
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                            Same due date
                          </span>
                        )}
                      </div>
                    </div>

                    {hc.payments.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium mb-1" style={{ color: muted }}>
                          Day sheet payments
                        </p>
                        <div className="overflow-x-auto rounded border" style={{ borderColor: card.borderColor }}>
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr style={{ background: isDark ? '#0F172A' : '#F8FAFC', color: muted }}>
                                <th className="px-2 py-1.5 text-left">Pay date</th>
                                <th className="px-2 py-1.5 text-left">Type</th>
                                <th className="px-2 py-1.5 text-right">Amount</th>
                                <th className="px-2 py-1.5 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {hc.payments.map((p) => (
                                <tr key={p._id} className="border-t" style={{ borderColor: card.borderColor }}>
                                  <td className="px-2 py-1.5" style={{ color: text }}>
                                    {fmtDate(p.paymentDate || undefined)}
                                    {p.paymentDate ? (
                                      <span className="ml-1" style={{ color: muted }}>
                                        ({toYmd(p.paymentDate)})
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="px-2 py-1.5" style={{ color: text }}>
                                    {p.type}
                                    {p.type === 'overstay' && p.overstaySequence != null
                                      ? ` #${p.overstaySequence}`
                                      : ''}
                                  </td>
                                  <td className="px-2 py-1.5 text-right" style={{ color: text }}>
                                    ${p.amount}
                                  </td>
                                  <td className="px-2 py-1.5" style={{ color: muted }}>
                                    {p.status}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {hc.buildItems.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium mb-1" style={{ color: muted }}>
                          Build preview
                        </p>
                        <ul className="space-y-1">
                          {hc.buildItems.map((b) => (
                            <li
                              key={b._id}
                              className="text-xs flex flex-wrap gap-x-2"
                              style={{ color: text }}
                            >
                              <span>build {fmtDate(b.buildDate || undefined)}</span>
                              <span style={{ color: muted }}>
                                due {fmtDate(b.passportDueDate || dueYmd || undefined)}
                              </span>
                              <span style={{ color: muted }}>{b.status}</span>
                              <span style={{ color: muted }}>{b.source || ''}</span>
                              {b.includeOverstay ? <span>overstay ${b.overstayAmount}</span> : null}
                              {b.includeVisa ? <span>visa ${b.visaAmount}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!hc.payments.length && !hc.buildItems.length && (
                      <p className="text-xs" style={{ color: muted }}>
                        Case only — no payments or build rows yet
                      </p>
                    )}
                  </div>
                  );
                })
              )}
            </div>

            <div
              className="px-5 py-3 border-t flex justify-end"
              style={{ borderColor: card.borderColor }}
            >
              <button
                onClick={() => setHistoryOpen(false)}
                className="px-3 py-2 text-sm rounded-md bg-teal-600 text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
