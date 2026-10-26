import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import {
  X,
  Layers,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  XCircle,
  Loader2,
  ArrowRight,
  Calendar,
  ChevronDown,
  Lock,
  RotateCcw,
  Check,
  Plus,
  Info,
} from 'lucide-react';
import {
  deliveryOrdersAPI,
  DO_BULK_UPDATE_MAX,
  type DOBulkUpdateFields,
  type DOBulkUpdateResponse,
  type DOBulkItemStatus,
  type DOFlipImpact,
  type DORouteIssue,
} from '../services/api';
import { deliveryOrderKeys, periodsToDateRange, useDOAvailablePeriods } from '../hooks/useDeliveryOrders';
import { cleanDeliveryOrders } from '../utils/dataCleanup';
import type { DeliveryOrder } from '../types';
import RouteSuggestInput, { useRouteLocationSuggestions } from './RouteSuggestInput';
import { Segmented, inputClass, labelClass } from './DOFormControls';

type Step = 'select' | 'fields' | 'preview' | 'results';
type FieldKey = keyof DOBulkUpdateFields;

const PAGE_SIZE = 50;

const FIELD_LABELS: Record<FieldKey, string> = {
  loadingPoint: 'Loading Point',
  destination: 'Destination',
  ratePerTon: 'Rate',
  rateType: 'Rate Type',
  clientName: 'Client',
  haulier: 'Haulier',
  importOrExport: 'Import / Export',
};

const FIELD_ORDER: FieldKey[] = [
  'loadingPoint',
  'destination',
  'clientName',
  'haulier',
  'ratePerTon',
  'rateType',
  'importOrExport',
];

const ROUTE_FIELDS: FieldKey[] = ['loadingPoint', 'destination', 'importOrExport'];

/** Server message suffix that the per-row notice already shows. */
const NOTICE_NOTE_RE = /\. Note: (fuel-record automation is disabled|no linked fuel record).*$/;

type FieldValues = {
  loadingPoint: string;
  destination: string;
  ratePerTon: string;
  rateType: 'per_ton' | 'fixed_total';
  clientName: string;
  haulier: string;
  importOrExport: 'IMPORT' | 'EXPORT';
};

const EMPTY_ENABLED: Record<FieldKey, boolean> = {
  loadingPoint: false,
  destination: false,
  ratePerTon: false,
  rateType: false,
  clientName: false,
  haulier: false,
  importOrExport: false,
};

const EMPTY_VALUES: FieldValues = {
  loadingPoint: '',
  destination: '',
  ratePerTon: '',
  rateType: 'per_ton',
  clientName: '',
  haulier: '',
  importOrExport: 'IMPORT',
};

const RATE_TYPE_LABELS: Record<string, string> = {
  per_ton: 'Per ton',
  fixed_total: 'Fixed total',
};

interface BulkEditDOsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a bulk run with the server response and the DOs that were updated (with new values applied). */
  onCompleted?: (response: DOBulkUpdateResponse, updatedOrders: DeliveryOrder[]) => void;
}

const getOrderId = (order: DeliveryOrder): string => String(order.id ?? (order as any)._id ?? '');

type Period = { year: number; month: number };

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const currentPeriod = (): Period => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

const displayValue = (field: FieldKey, value: any): string => {
  if (value === undefined || value === null || value === '') return '—';
  if (field === 'rateType') return RATE_TYPE_LABELS[value] || String(value);
  if (field === 'ratePerTon') return Number(value).toLocaleString();
  return String(value);
};

const isSameValue = (field: FieldKey, current: any, next: any): boolean => {
  if (field === 'ratePerTon') return Number(current ?? 0) === Number(next);
  if (field === 'rateType') return String(current || 'per_ton') === String(next);
  return String(current ?? '').trim() === String(next ?? '').trim();
};

const STATUS_STYLES: Record<DOBulkItemStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  updated: {
    label: 'Updated',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    Icon: CheckCircle2,
  },
  unchanged: {
    label: 'Unchanged',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    Icon: MinusCircle,
  },
  skipped: {
    label: 'Skipped',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    Icon: AlertTriangle,
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    Icon: XCircle,
  },
};

const BulkEditDOsModal = ({ isOpen, onClose, onCompleted }: BulkEditDOsModalProps) => {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('select');

  // Picker filters
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [periods, setPeriods] = useState<Period[]>(() => [currentPeriod()]);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'IMPORT' | 'EXPORT'>('ALL');
  const [doTypeFilter, setDoTypeFilter] = useState<'ALL' | 'DO' | 'SDO'>('ALL');
  const [page, setPage] = useState(1);

  // Selection keeps the full row so preview works across pages/filters
  const [selected, setSelected] = useState<Map<string, DeliveryOrder>>(new Map());

  // Field editor
  const [enabled, setEnabled] = useState<Record<FieldKey, boolean>>(EMPTY_ENABLED);
  const [values, setValues] = useState<FieldValues>(EMPTY_VALUES);
  const [editReason, setEditReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DOBulkUpdateResponse | null>(null);

  // Server check of what a direction switch touches, keyed by DO id
  const [flipImpacts, setFlipImpacts] = useState<Map<string, DOFlipImpact>>(new Map());
  const [impactStatus, setImpactStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [proceedAnyway, setProceedAnyway] = useState(false);
  const [routeIssues, setRouteIssues] = useState<Map<string, DORouteIssue>>(new Map());
  const [proceedMissingRoutes, setProceedMissingRoutes] = useState(false);

  const resetFields = () => {
    setEnabled(EMPTY_ENABLED);
    setValues(EMPTY_VALUES);
    setEditReason('');
  };

  const resetAll = () => {
    setStep('select');
    setFlipImpacts(new Map());
    setImpactStatus('idle');
    setProceedAnyway(false);
    setRouteIssues(new Map());
    setProceedMissingRoutes(false);
    setSelected(new Map());
    resetFields();
    setResult(null);
  };

  useEffect(() => {
    if (!isOpen) resetAll();
  }, [isOpen]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      page,
      limit: PAGE_SIZE,
      sort: 'date',
      order: 'desc',
      status: 'active',
      ...periodsToDateRange(periods),
    };
    if (search) params.search = search;
    if (directionFilter !== 'ALL') params.importOrExport = directionFilter;
    if (doTypeFilter !== 'ALL') params.doType = doTypeFilter;
    return params;
  }, [page, periods, search, directionFilter, doTypeFilter]);

  const { data: availablePeriods = [] } = useDOAvailablePeriods(
    directionFilter,
    doTypeFilter === 'ALL' ? undefined : doTypeFilter,
    'active'
  );

  useEffect(() => {
    if (!showMonthDropdown) return;
    const handler = (e: MouseEvent) => {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target as Node)) {
        setShowMonthDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMonthDropdown]);

  const togglePeriod = (year: number, month: number) => {
    setPeriods((prev) => {
      const exists = prev.some((p) => p.year === year && p.month === month);
      if (exists) {
        if (prev.length === 1) return prev; // keep at least one selected
        return prev.filter((p) => !(p.year === year && p.month === month));
      }
      return [...prev, { year, month }].sort((a, b) => (b.year !== a.year ? b.year - a.year : a.month - b.month));
    });
    setPage(1);
  };

  const monthsDisplayText = (): string => {
    if (periods.length === 1) return `${MONTH_NAMES[periods[0].month - 1]} ${periods[0].year}`;
    if (availablePeriods.length > 0 && periods.length === availablePeriods.length) return 'All Periods';
    return `${periods.length} periods`;
  };

  const { data: pickerData, isFetching: pickerLoading } = useQuery({
    queryKey: [...deliveryOrderKeys.all, 'bulkEditPicker', queryParams],
    queryFn: async () => {
      const response = await deliveryOrdersAPI.getAll(queryParams);
      return {
        orders: cleanDeliveryOrders(response.data),
        totalPages: response.pagination?.totalPages ?? 1,
        total: response.pagination?.total ?? response.data.length,
      };
    },
    enabled: isOpen && step === 'select',
    placeholderData: (prev) => prev,
  });

  const pageOrders = useMemo(
    () => (pickerData?.orders ?? []).filter((o) => !o.isPendingDo && !o.isCancelled && getOrderId(o)),
    [pickerData]
  );
  const totalPages = pickerData?.totalPages ?? 1;

  const selectedOrders = useMemo(() => Array.from(selected.values()), [selected]);
  const atLimit = selected.size >= DO_BULK_UPDATE_MAX;

  const allPageSelected = pageOrders.length > 0 && pageOrders.every((o) => selected.has(getOrderId(o)));

  const toggleOrder = (order: DeliveryOrder) => {
    const id = getOrderId(order);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= DO_BULK_UPDATE_MAX) {
          toast.warning(`You can bulk edit at most ${DO_BULK_UPDATE_MAX} DOs at a time`);
          return prev;
        }
        next.set(id, order);
      }
      return next;
    });
  };

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allPageSelected) {
        pageOrders.forEach((o) => next.delete(getOrderId(o)));
        return next;
      }
      for (const o of pageOrders) {
        if (next.size >= DO_BULK_UPDATE_MAX) {
          toast.warning(`Selection capped at ${DO_BULK_UPDATE_MAX} DOs`);
          break;
        }
        next.set(getOrderId(o), o);
      }
      return next;
    });
  };

  // Suggestions follow the direction the DOs will have after the edit
  const suggestionRouteType: 'IMPORT' | 'EXPORT' = enabled.importOrExport
    ? values.importOrExport
    : selectedOrders.length > 0 && selectedOrders.every((o) => o.importOrExport === 'EXPORT')
      ? 'EXPORT'
      : 'IMPORT';
  const routeSuggestions = useRouteLocationSuggestions(suggestionRouteType);

  const clientSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          [...selectedOrders, ...pageOrders].map((o) => (o.clientName || '').trim().toUpperCase()).filter(Boolean)
        )
      ).sort(),
    [selectedOrders, pageOrders]
  );
  const haulierSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          [...selectedOrders, ...pageOrders].map((o) => (o.haulier || '').trim().toUpperCase()).filter(Boolean)
        )
      ).sort(),
    [selectedOrders, pageOrders]
  );

  const enabledFields = FIELD_ORDER.filter((f) => enabled[f]);

  const buildFields = (): DOBulkUpdateFields => {
    const fields: DOBulkUpdateFields = {};
    if (enabled.loadingPoint) fields.loadingPoint = values.loadingPoint.trim().toUpperCase();
    if (enabled.destination) fields.destination = values.destination.trim().toUpperCase();
    if (enabled.clientName) fields.clientName = values.clientName.trim().toUpperCase();
    if (enabled.haulier) fields.haulier = values.haulier.trim().toUpperCase();
    if (enabled.ratePerTon) fields.ratePerTon = Number(values.ratePerTon);
    if (enabled.rateType) fields.rateType = values.rateType;
    if (enabled.importOrExport) fields.importOrExport = values.importOrExport;
    return fields;
  };

  const fieldsError = (): string | null => {
    if (enabledFields.length === 0) return 'Tick at least one field to change';
    if (enabled.loadingPoint && !values.loadingPoint.trim()) return 'Enter the new loading point';
    if (enabled.destination && !values.destination.trim()) return 'Enter the new destination';
    if (enabled.clientName && !values.clientName.trim()) return 'Enter the new client';
    if (enabled.ratePerTon) {
      const n = Number(values.ratePerTon);
      if (values.ratePerTon.trim() === '' || !Number.isFinite(n) || n < 0) return 'Enter a valid rate (0 or more)';
    }
    return null;
  };

  const fields = buildFields();
  const previewRows = selectedOrders.map((order) => {
    const diffs = enabledFields.map((field) => {
      const current = (order as any)[field];
      const next = (fields as any)[field];
      return { field, current, next, changed: !isSameValue(field, current, next) };
    });
    return { order, diffs, willChange: diffs.some((d) => d.changed) };
  });
  const changingCount = previewRows.filter((r) => r.willChange).length;
  const fuelImpactCount = previewRows.filter(
    (r) =>
      r.order.doType === 'DO' &&
      r.diffs.some((d) => d.changed && ['importOrExport', 'loadingPoint', 'destination'].includes(d.field))
  ).length;
  const toExportCount = previewRows.filter(
    (r) => r.order.doType === 'DO' && r.diffs.some((d) => d.field === 'importOrExport' && d.changed && d.next === 'EXPORT')
  ).length;

  useEffect(() => {
    if (step !== 'preview') return;
    setProceedAnyway(false);
    setProceedMissingRoutes(false);
    setFlipImpacts(new Map());
    setRouteIssues(new Map());
    const routeChangeIds = previewRows
      .filter((r) => r.diffs.some((d) => d.changed && ROUTE_FIELDS.includes(d.field)))
      .map((r) => getOrderId(r.order));
    if (routeChangeIds.length === 0) {
      setImpactStatus('idle');
      return;
    }
    const routeFields: DOBulkUpdateFields = {};
    for (const f of ROUTE_FIELDS) if (fields[f] !== undefined) (routeFields as any)[f] = fields[f];
    let cancelled = false;
    setImpactStatus('loading');
    deliveryOrdersAPI
      .bulkUpdatePreview(routeChangeIds, routeFields)
      .then(({ items }) => {
        if (cancelled) return;
        const impacts = new Map<string, DOFlipImpact>();
        const issues = new Map<string, DORouteIssue>();
        for (const item of items) {
          if (item.flipImpact) impacts.set(item.id, item.flipImpact);
          if (item.routeIssue) issues.set(item.id, item.routeIssue);
        }
        setFlipImpacts(impacts);
        setRouteIssues(issues);
        setImpactStatus('idle');
      })
      .catch(() => {
        if (!cancelled) setImpactStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // Fields and selection cannot change while on the preview step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const flaggedImpacts = Array.from(flipImpacts.values()).filter((i) => i.requiresConfirmation);
  const revivingImpacts = Array.from(flipImpacts.values()).filter((i) => i.pendingToRevive);
  const needsProceedAnyway = flaggedImpacts.length > 0;
  const needsRouteConfirm = routeIssues.size > 0;
  const missingRouteGroups = useMemo(() => {
    const groups = new Map<string, { issue: DORouteIssue; count: number }>();
    for (const issue of routeIssues.values()) {
      const key = `${issue.direction}|${issue.loadingPoint}|${issue.destination}`;
      const g = groups.get(key);
      if (g) g.count += 1;
      else groups.set(key, { issue, count: 1 });
    }
    return Array.from(groups.values());
  }, [routeIssues]);
  const awaitingConfirm = (needsProceedAnyway && !proceedAnyway) || (needsRouteConfirm && !proceedMissingRoutes);
  const showFlagsColumn =
    needsRouteConfirm ||
    Array.from(flipImpacts.values()).some((i) => i.pendingToRevive || i.lpoLines.length > 0 || i.fuelIssuedLiters > 0);

  const handleApply = async () => {
    const ids = previewRows.filter((r) => r.willChange).map((r) => getOrderId(r.order));
    if (ids.length === 0) {
      toast.info('None of the selected DOs would change');
      return;
    }
    setSubmitting(true);
    try {
      const response = await deliveryOrdersAPI.bulkUpdate(ids, fields, editReason, {
        fuelImpact: needsProceedAnyway && proceedAnyway,
        missingRoutes: needsRouteConfirm && proceedMissingRoutes,
      });
      setResult(response);
      setStep('results');
      queryClient.invalidateQueries({ queryKey: [...deliveryOrderKeys.all, 'bulkEditPicker'] });

      const updatedIds = new Set(response.results.filter((r) => r.status === 'updated').map((r) => r.id));
      const updatedOrders = selectedOrders
        .filter((o) => updatedIds.has(getOrderId(o)))
        .map((o) => ({ ...o, ...fields }) as DeliveryOrder);

      const { updated, failed, skipped, fuelAutomationOff = 0 } = response.summary;
      if (fuelAutomationOff > 0) {
        toast.warning(
          `Bulk edit finished: ${updated} updated, ${skipped} skipped, ${failed} failed. ` +
            `Fuel automation is off — adjust the fuel record manually for ${fuelAutomationOff} DO(s).`,
          { autoClose: 12000 }
        );
      } else if (failed === 0 && skipped === 0) {
        toast.success(`Bulk edit complete: ${updated} DO(s) updated`);
      } else {
        toast.warning(`Bulk edit finished: ${updated} updated, ${skipped} skipped, ${failed} failed`);
      }
      onCompleted?.(response, updatedOrders);
    } catch (error: any) {
      const gate = error?.response?.status === 409 ? error.response.data?.data : undefined;
      const flagged: any[] = Array.isArray(gate?.flagged) ? gate.flagged : [];
      if (flagged.length > 0) {
        const idByDoNumber = new Map(selectedOrders.map((o) => [o.doNumber, getOrderId(o)]));
        if (gate.code === 'ROUTE_NOT_CONFIGURED_CONFIRMATION_REQUIRED') {
          setRouteIssues(new Map(flagged.map((i: DORouteIssue) => [idByDoNumber.get(i.doNumber) ?? i.doNumber, i])));
          setProceedMissingRoutes(false);
        } else if (gate.code === 'FLIP_FUEL_IMPACT_CONFIRMATION_REQUIRED') {
          setFlipImpacts((prev) => {
            const next = new Map(prev);
            for (const i of flagged as DOFlipImpact[]) next.set(idByDoNumber.get(i.doNumber) ?? i.doNumber, i);
            return next;
          });
          setProceedAnyway(false);
        }
      }
      toast.error(error?.response?.data?.message || error?.message || 'Bulk edit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  if (!isOpen) return null;

  const stepIndex = { select: 0, fields: 1, preview: 2, results: 3 }[step];
  const stepTitles = ['Select DOs', 'Choose fields', 'Preview', 'Results'];

  const badge = (text: string, className: string) => (
    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded ${className}`}>{text}</span>
  );

  const renderSelectStep = () => (
    <div className="flex flex-col gap-3 h-full">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search DO, truck, client, destination, haulier"
            className={`${inputClass} pl-8`}
          />
        </div>
        <div className="relative" ref={monthDropdownRef}>
          <button
            type="button"
            onClick={() => setShowMonthDropdown((v) => !v)}
            className={`${inputClass} flex items-center justify-between text-left`}
          >
            <span className="flex items-center truncate">
              <Calendar className="w-4 h-4 mr-2 text-gray-400 shrink-0" />
              {monthsDisplayText()}
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${showMonthDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showMonthDropdown && (
            <div className="absolute z-30 mt-1 w-full min-w-[12rem] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-64 overflow-y-auto">
              <div className="p-2 border-b border-gray-200 dark:border-gray-600">
                <button
                  type="button"
                  onClick={() => {
                    setPeriods([currentPeriod()]);
                    setPage(1);
                    setShowMonthDropdown(false);
                  }}
                  className="w-full text-left px-2 py-1 text-sm rounded text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                >
                  Current Month ({MONTH_NAMES[currentPeriod().month - 1]} {currentPeriod().year})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPeriods(availablePeriods.length > 0 ? [...availablePeriods] : [currentPeriod()]);
                    setPage(1);
                    setShowMonthDropdown(false);
                  }}
                  className="w-full text-left px-2 py-1 text-sm rounded text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                >
                  All Periods ({availablePeriods.length})
                </button>
              </div>
              <div className="p-2">
                {availablePeriods.length > 0 ? (
                  Object.entries(
                    availablePeriods.reduce<Record<number, number[]>>((acc, p) => {
                      (acc[p.year] ||= []).push(p.month);
                      return acc;
                    }, {})
                  )
                    .sort(([a], [b]) => Number(b) - Number(a))
                    .map(([yearStr, months]) => (
                      <div key={yearStr}>
                        <div className="px-2 pt-2 pb-0.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          {yearStr}
                        </div>
                        {months.map((monthNum) => (
                          <label
                            key={`${yearStr}-${monthNum}`}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={periods.some((p) => p.year === Number(yearStr) && p.month === monthNum)}
                              onChange={() => togglePeriod(Number(yearStr), monthNum)}
                              className="w-4 h-4 border-gray-300 rounded"
                              style={{ accentColor: '#0284c7' }}
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{MONTH_NAMES[monthNum - 1]}</span>
                          </label>
                        ))}
                      </div>
                    ))
                ) : (
                  <div className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400">No data available</div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={directionFilter}
            onChange={(e) => {
              setDirectionFilter(e.target.value as any);
              setPage(1);
            }}
            className={inputClass}
          >
            <option value="ALL">All dir.</option>
            <option value="IMPORT">Import</option>
            <option value="EXPORT">Export</option>
          </select>
          <select
            value={doTypeFilter}
            onChange={(e) => {
              setDoTypeFilter(e.target.value as any);
              setPage(1);
            }}
            className={inputClass}
          >
            <option value="ALL">DO + SDO</option>
            <option value="DO">DO</option>
            <option value="SDO">SDO</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={allPageSelected}
            onChange={togglePage}
            disabled={pageOrders.length === 0}
            className="w-4 h-4 rounded border-gray-300"
            style={{ accentColor: '#0284c7' }}
          />
          Select all on this page
        </label>
        <div className="flex items-center gap-3">
          <span className={`font-medium ${atLimit ? 'text-amber-600' : 'text-gray-600 dark:text-gray-400'}`}>
            {selected.size} selected{atLimit ? ` (max ${DO_BULK_UPDATE_MAX})` : ''}
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Map())}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="w-3.5 h-3.5" />
            Clear selection
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-[16rem] overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/60 sticky top-0 z-10">
            <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2">DO</th>
              <th className="px-3 py-2">Import/Export</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Truck</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2">Haulier</th>
              <th className="px-3 py-2 text-right">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {pageOrders.length === 0 && !pickerLoading && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-gray-500 dark:text-gray-400">
                  No active DOs match these filters
                </td>
              </tr>
            )}
            {pageOrders.map((order) => {
              const id = getOrderId(order);
              const isSelected = selected.has(id);
              return (
                <tr
                  key={id}
                  onClick={() => toggleOrder(order)}
                  className={`cursor-pointer ${
                    isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOrder(order)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300"
                      style={{ accentColor: '#0284c7' }}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-semibold text-gray-900 dark:text-white">
                    <span className="inline-flex items-center gap-1">
                      {order.doNumber}
                      {order.editLock?.lockedByName && (
                        <span title={`Being edited by ${order.editLock.lockedByName}`}>
                          <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {badge(
                      order.importOrExport,
                      order.importOrExport === 'IMPORT'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {badge(order.doType, 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300')}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">
                    {String(order.date || '').split('T')[0]}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">{order.truckNo}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">{order.clientName}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">
                    {order.loadingPoint} → {order.destination}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">{order.haulier || '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-gray-700 dark:text-gray-200">
                    {displayValue('ratePerTon', order.ratePerTon)}
                    {order.rateType === 'fixed_total' && <span className="text-xs text-gray-400"> fixed</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pickerLoading && (
          <div className="flex items-center justify-center py-4 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading DOs…
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>{pickerData ? `${pickerData.total} DO(s) found` : ''}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span>
            Page {page} of {Math.max(1, totalPages)}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const toggleField = (field: FieldKey) => setEnabled((prev) => ({ ...prev, [field]: !prev[field] }));

  const fieldRow = (field: FieldKey, input: ReactElement) =>
    enabled[field] ? (
      <div key={field}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{FIELD_LABELS[field]}</span>
          <button
            type="button"
            onClick={() => toggleField(field)}
            aria-label={`Stop changing ${FIELD_LABELS[field]}`}
            title="Remove"
            className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {input}
      </div>
    ) : null;

  const hasFieldInput =
    enabledFields.length > 0 || editReason !== '' || FIELD_ORDER.some((f) => values[f] !== EMPTY_VALUES[f]);

  const renderFieldsStep = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Pick the fields to change on all <strong>{selected.size}</strong> selected DO(s). Anything you don't pick
          stays as it is on each DO.
        </p>
        <button
          type="button"
          onClick={resetFields}
          disabled={!hasFieldInput}
          className="self-start shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-200 dark:border-red-800 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset fields
        </button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Fields to change">
        {FIELD_ORDER.map((f) => {
          const on = enabled[f];
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => toggleField(f)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-sm font-medium transition-colors ${
                on
                  ? 'bg-primary-600 border-primary-600 text-white hover:bg-primary-700'
                  : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300'
              }`}
            >
              {on ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {FIELD_LABELS[f]}
            </button>
          );
        })}
      </div>
      {enabledFields.length === 0 ? (
        <div className="px-4 py-8 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-center text-sm text-gray-500 dark:text-gray-400">
          Pick the fields you want to change.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/20">
          {fieldRow(
            'loadingPoint',
            <RouteSuggestInput
              name="bulkLoadingPoint"
              value={values.loadingPoint}
              onChange={(v) => setValues((p) => ({ ...p, loadingPoint: v.toUpperCase() }))}
              suggestions={routeSuggestions.origins}
              style={{ textTransform: 'uppercase' }}
              className={inputClass}
              placeholder="DAR"
            />
          )}
          {fieldRow(
            'destination',
            <RouteSuggestInput
              name="bulkDestination"
              value={values.destination}
              onChange={(v) => setValues((p) => ({ ...p, destination: v.toUpperCase() }))}
              suggestions={routeSuggestions.destinations}
              style={{ textTransform: 'uppercase' }}
              className={inputClass}
              placeholder="CCR KOLWEZI"
            />
          )}
          {fieldRow(
            'clientName',
            <RouteSuggestInput
              name="bulkClientName"
              value={values.clientName}
              onChange={(v) => setValues((p) => ({ ...p, clientName: v.toUpperCase() }))}
              suggestions={clientSuggestions}
              style={{ textTransform: 'uppercase' }}
              className={inputClass}
              placeholder="Client name"
            />
          )}
          {fieldRow(
            'haulier',
            <RouteSuggestInput
              name="bulkHaulier"
              value={values.haulier}
              onChange={(v) => setValues((p) => ({ ...p, haulier: v.toUpperCase() }))}
              suggestions={haulierSuggestions}
              style={{ textTransform: 'uppercase' }}
              className={inputClass}
              placeholder="Haulier (leave empty to clear)"
            />
          )}
          {fieldRow(
            'ratePerTon',
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={values.ratePerTon}
              onChange={(e) => setValues((p) => ({ ...p, ratePerTon: e.target.value }))}
              onWheel={(e) => e.currentTarget.blur()}
              className={inputClass}
              placeholder="Per ton, or total for fixed-total DOs"
            />
          )}
          {fieldRow(
            'rateType',
            <Segmented
              ariaLabel="Rate structure"
              value={values.rateType}
              options={[
                { value: 'per_ton', label: 'Per ton' },
                { value: 'fixed_total', label: 'Fixed total' },
              ]}
              onChange={(rateType) => setValues((p) => ({ ...p, rateType }))}
            />
          )}
          {fieldRow(
            'importOrExport',
            <Segmented
              ariaLabel="Direction"
              value={values.importOrExport}
              options={[
                { value: 'IMPORT', label: 'IMPORT' },
                { value: 'EXPORT', label: 'EXPORT' },
              ]}
              onChange={(importOrExport) => setValues((p) => ({ ...p, importOrExport }))}
            />
          )}
        </div>
      )}
      <div>
        <label className={labelClass}>Edit reason (optional, saved to each DO's history)</label>
        <textarea
          value={editReason}
          onChange={(e) => setEditReason(e.target.value.slice(0, 500))}
          rows={2}
          className={`${inputClass} h-auto py-2`}
          placeholder="e.g. Client changed destination for this batch"
        />
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="px-2 py-1 rounded bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300 font-medium">
          {changingCount} of {previewRows.length} DO(s) will change
        </span>
        {previewRows.length - changingCount > 0 && (
          <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            {previewRows.length - changingCount} already have these values
          </span>
        )}
      </div>

      {fuelImpactCount > 0 && (
        <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p>
              {fuelImpactCount} normal DO(s) have route or direction changes. Their fuel records will be updated
              exactly as when editing one DO (route liters recalculated; direction changes cancel the old fuel side
              and create/link the new one).
            </p>
            {toExportCount > 0 && (
              <p className="mt-1 font-medium">
                {toExportCount} DO(s) switching to EXPORT will fail if the truck has no active going fuel record —
                they will be listed as failed and the rest will still be applied.
              </p>
            )}
          </div>
        </div>
      )}

      {impactStatus === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking routes, LPO lines and issued fuel on the affected journeys…
        </div>
      )}
      {impactStatus === 'error' && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200 text-sm">
          Could not check routes / LPO lines / issued fuel for this change. You can still apply — the server will stop
          and report it if any DO needs confirmation.
        </div>
      )}
      {needsRouteConfirm && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200 text-sm">
          <p className="font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {routeIssues.size} DO(s) would move to a route that is not in the route configuration.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {missingRouteGroups.map(({ issue, count }) => (
              <li key={`${issue.direction}|${issue.loadingPoint}|${issue.destination}`}>
                <span className="font-semibold">
                  {issue.loadingPoint || '—'} → {issue.destination || '—'}
                </span>{' '}
                ({issue.direction}, {count} DO{count === 1 ? '' : 's'}) —{' '}
                {issue.effect === 'fuel_record_locked'
                  ? 'fuel records will be locked with no total liters until the route is configured'
                  : 'no outbound liters will be added to the journey'}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            As with any new route, a "New Configuration Needed" notification is raised for each IMPORT DO so the route
            can be added and the fuel record unlocked.
          </p>
          <label className="mt-2 flex items-center gap-2 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={proceedMissingRoutes}
              onChange={(e) => setProceedMissingRoutes(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
              style={{ accentColor: '#D97706' }}
            />
            Proceed anyway — the route will be configured afterwards
          </label>
        </div>
      )}
      {revivingImpacts.length > 0 && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200 text-sm">
          {revivingImpacts.length} DO(s) came from a pending DO — the pending number will be restored instead of the
          journey being cancelled ({revivingImpacts.map((i) => `${i.doNumber} → ${i.pendingToRevive!.pendingDo}`).join(', ')}).
          {revivingImpacts.some((i) => i.pendingToRevive!.kind === 'going') &&
            ' DOs switched to EXPORT this way are left unlinked — link them with the Link action afterwards.'}
        </div>
      )}
      {needsProceedAnyway && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-900 dark:bg-red-900/20 dark:border-red-700 dark:text-red-200 text-sm">
          <p className="font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {flaggedImpacts.length} DO(s) have LPO lines or issued fuel on the journey this direction change affects.
          </p>
          <p className="mt-1">
            Those LPO lines are not changed automatically — review them after applying. Flagged DOs are marked in the
            Flags column below.
          </p>
          <label className="mt-2 flex items-center gap-2 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={proceedAnyway}
              onChange={(e) => setProceedAnyway(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
              style={{ accentColor: '#DC2626' }}
            />
            Proceed anyway — I will review those LPOs / fuel records
          </label>
        </div>
      )}

      <div className="flex-1 min-h-[16rem] overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/60 sticky top-0 z-10">
            <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
              <th className="px-3 py-2">DO</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Truck</th>
              {enabledFields.map((f) => (
                <th key={f} className="px-3 py-2">
                  {FIELD_LABELS[f]}
                </th>
              ))}
              {showFlagsColumn && <th className="px-3 py-2">Flags</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {previewRows.map(({ order, diffs, willChange }) => {
              const impact = flipImpacts.get(getOrderId(order));
              const routeIssue = routeIssues.get(getOrderId(order));
              return (
                <tr key={getOrderId(order)} className={`whitespace-nowrap ${willChange ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-white">{order.doNumber}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{order.doType}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{order.truckNo}</td>
                  {diffs.map((d) => (
                    <td key={d.field} className="px-3 py-2">
                      {d.changed ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="line-through text-gray-400">{displayValue(d.field, d.current)}</span>
                          <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="font-medium text-primary-700 dark:text-primary-300">
                            {displayValue(d.field, d.next)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400" title="No change">
                          {displayValue(d.field, d.current)}
                        </span>
                      )}
                    </td>
                  ))}
                  {showFlagsColumn && (
                    <td className="px-3 py-2">
                      {(impact || routeIssue) && (
                        <div className="flex items-center gap-1">
                          {routeIssue &&
                            badge(
                              routeIssue.effect === 'fuel_record_locked' ? 'Route not configured' : 'No outbound route',
                              'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                            )}
                          {impact?.pendingToRevive &&
                            badge(`Restores ${impact.pendingToRevive.pendingDo}`, 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300')}
                          {impact && impact.lpoLines.length > 0 &&
                            badge(
                              `${impact.lpoLines.length} LPO line(s) · ${impact.lpoLiters.toLocaleString()} L`,
                              'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            )}
                          {impact && impact.fuelIssuedLiters > 0 &&
                            badge(
                              `${impact.fuelIssuedLiters.toLocaleString()} L fuel issued`,
                              'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editReason.trim() && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Reason saved to history: <em>Bulk edit: {editReason.trim()}</em>
        </p>
      )}
    </div>
  );

  const renderResultsStep = () => {
    if (!result) return null;
    const { summary } = result;
    return (
      <div className="flex flex-col gap-3 h-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['updated', 'unchanged', 'skipped', 'failed'] as DOBulkItemStatus[]).map((s) => {
            const { label, className, Icon } = STATUS_STYLES[s];
            return (
              <div key={s} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${className}`}>
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {label}: {summary[s]}
                </span>
              </div>
            );
          })}
        </div>
        {(summary.fuelAutomationOff ?? 0) > 0 && (
          <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Fuel automation is off: {summary.fuelAutomationOff} DO(s) were updated but their fuel records were not
              adjusted. Update those fuel records manually.
            </span>
          </div>
        )}
        {(summary.noFuelRecord ?? 0) > 0 && (
          <div className="flex gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 text-sm">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{summary.noFuelRecord} DO(s) have no linked fuel record — only the DO was updated.</span>
          </div>
        )}
        <div className="flex-1 min-h-[16rem] overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/60 sticky top-0 z-10">
              <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                <th className="px-3 py-2">DO</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2">Changes</th>
                <th className="px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {result.results.map((r) => {
                const { label, className, Icon } = STATUS_STYLES[r.status];
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold text-gray-900 dark:text-white">
                      {r.doNumber || r.id}
                      {r.doType && <span className="ml-1 text-xs font-normal text-gray-500">{r.doType}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${className}`}>
                        <Icon className="w-3 h-3" />
                        {label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                      {(r.changes || []).map((c) => (
                        <div key={c.field} className="text-xs">
                          {FIELD_LABELS[c.field as FieldKey] || c.field}:{' '}
                          <span className="text-gray-400">{displayValue(c.field as FieldKey, c.oldValue)}</span> →{' '}
                          <span className="font-medium">{displayValue(c.field as FieldKey, c.newValue)}</span>
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                      {r.notice ? r.message.replace(NOTICE_NOTE_RE, '') : r.message}
                      {r.cascadeMessage && (
                        <div className="mt-1 text-amber-700 dark:text-amber-300">{r.cascadeMessage}</div>
                      )}
                      {r.notice && (
                        <div
                          className={`mt-1 inline-flex items-center gap-1 ${
                            r.notice.kind === 'automation_off'
                              ? 'font-medium text-amber-700 dark:text-amber-300'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {r.notice.kind === 'automation_off' ? (
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                          ) : (
                            <Info className="w-3 h-3 shrink-0" />
                          )}
                          {r.notice.text}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const currentFieldsError = step === 'fields' ? fieldsError() : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                <Layers className="w-5 h-5 mr-2 text-primary-600" />
                Bulk Edit Delivery Orders
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Change loading point, destination, rate, client, haulier or direction on many DOs at once. Each DO is
                saved with its own edit history and audit entry.
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={submitting}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 disabled:opacity-40"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <ol className="flex items-center gap-2 mt-3 text-xs sm:text-sm">
            {stepTitles.map((title, i) => (
              <li key={title} className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${
                    i <= stepIndex ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {i + 1}
                </span>
                <span className={i === stepIndex ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-500'}>
                  {title}
                </span>
                {i < stepTitles.length - 1 && <ChevronRight className="w-3 h-3 text-gray-400" />}
              </li>
            ))}
          </ol>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
          {step === 'select' && renderSelectStep()}
          {step === 'fields' && renderFieldsStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'results' && renderResultsStep()}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/50">
          <div className="text-sm text-amber-700 dark:text-amber-300 min-h-[1.25rem]">{currentFieldsError}</div>
          <div className="flex gap-2">
            {step === 'select' && (
              <>
                <button type="button" onClick={handleClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep('fields')}
                  disabled={selected.size === 0}
                  className="px-4 py-2 rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Next: choose fields ({selected.size})
                </button>
              </>
            )}
            {step === 'fields' && (
              <>
                <button type="button" onClick={() => setStep('select')} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep('preview')}
                  disabled={!!currentFieldsError}
                  className="px-4 py-2 rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Next: preview
                </button>
              </>
            )}
            {step === 'preview' && (
              <>
                <button type="button" onClick={() => setStep('fields')} disabled={submitting} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={
                    submitting ||
                    changingCount === 0 ||
                    impactStatus === 'loading' ||
                    awaitingConfirm
                  }
                  title={awaitingConfirm ? 'Tick "Proceed anyway" to apply' : undefined}
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Applying to {changingCount} DO(s)…
                    </>
                  ) : (
                    `Apply to ${changingCount} DO(s)`
                  )}
                </button>
              </>
            )}
            {step === 'results' && (
              <>
                <button type="button" onClick={resetAll} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Start another bulk edit
                </button>
                <button type="button" onClick={handleClose} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700">
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkEditDOsModal;
