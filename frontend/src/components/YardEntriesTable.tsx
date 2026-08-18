/**
 * Yard-station entries UI for LPODetailForm (Tanga Yard / Dar Yard).
 * Truck fetch uses the same journey lookup as regular stations, but defaults
 * to Queued (Q1…) before Active. Tanga/Dar tab forms keep their own yard
 * candidate fetch — this component is LPODetailForm-only.
 */
import { useState, useCallback, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { Plus, Trash2, Loader2, Search, Eye, CheckCircle, UserPlus } from 'lucide-react';
import { toast } from 'react-toastify';
import { configAPI, fuelRecordsAPI } from '../services/api';
import FuelRecordInspectModal from './FuelRecordInspectModal';
import {
  fetchYardJourneysForTruck,
  fetchYardJourneyByDo,
  applyJourneyToEntryFields,
  yardColumnLiters,
  fuelRecordIdOf,
  type YardJourneyWarning,
} from '../utils/yardJourneyLookup';
import type { YardKey } from '../services/yardLpoFetchService';
import type { FuelRecord } from '../types';
import { shouldOfferPendingGoingCreate } from '../utils/pendingDo';

// ── Types exposed to the parent (LPODetailForm) ─────────────────────────────

export interface YardEntryPayload {
  doNo: string;
  truckNo: string;
  liters: number;
  rate: number;
  amount: number;
  dest: string;
  dispenseLiters: number | null;
  context: string | null;
}

export interface YardLinkSelection {
  index: number;
  fuelRecordId: string;
  topUp: boolean;
  /** Override liters written to the fuel-record yard column on bulk-link. */
  dispenseLiters?: number;
}

export interface YardSubmission {
  entries: YardEntryPayload[];
  linkSelections: YardLinkSelection[];
}

export interface YardEntriesTableHandle {
  getSubmission: () => YardSubmission | null;
  hasPendingChoice: () => boolean;
}

interface DraftEntry {
  doNo: string;
  truckNo: string;
  liters: number;
  rate: number;
  amount: number;
  dest: string;
  /** Liters applied to the fuel record; null = dispense full billed liters. */
  dispenseLiters: number | null;
  /** Required when billed liters differ from dispense. */
  context: string | null;
}

export type YardDraftEntry = DraftEntry;

interface RowState {
  autoFetching: boolean;
  fetched: boolean;
  fuelRecord: FuelRecord | null;
  fuelRecordId?: string;
  alreadyDispensed: number;
  warningType?: YardJourneyWarning;
  warningMessage?: string;
  linked: boolean;
  allJourneys: { active: FuelRecord | null; queued: FuelRecord[] };
  selectedJourneyType: 'active' | 'queued' | null;
  selectedJourneyIndex: number;
  creatingPendingDo?: boolean;
}

const makeEmptyEntry = (rate = 0): DraftEntry => ({
  doNo: '', truckNo: '', liters: 0, rate, amount: 0, dest: '',
  dispenseLiters: null, context: null,
});

const makeEmptyRow = (): RowState => ({
  autoFetching: false,
  fetched: false,
  fuelRecord: null,
  alreadyDispensed: 0,
  warningType: null,
  linked: false,
  allJourneys: { active: null, queued: [] },
  selectedJourneyType: null,
  selectedJourneyIndex: -1,
});

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

/** Effective dispense = override or full billed liters. */
function effectiveDispense(e: DraftEntry): number {
  return e.dispenseLiters != null ? e.dispenseLiters : e.liters;
}

/** Billed − dispensed (positive = billed more than written to fuel record). */
function entryDiff(e: DraftEntry): number {
  return +(Number(e.liters) - effectiveDispense(e)).toFixed(2);
}

interface Props {
  yard: YardKey;
  date: string;
  disabled?: boolean;
  initialEntries?: YardDraftEntry[];
  onSummaryChange?: (summary: { count: number; total: number; totalLiters: number }) => void;
  onEntriesChange?: (entries: YardDraftEntry[]) => void;
}

const YardEntriesTable = forwardRef<YardEntriesTableHandle, Props>(({
  yard, date, disabled, initialEntries, onSummaryChange, onEntriesChange,
}, ref) => {
  const [entries, setEntries] = useState<DraftEntry[]>(() =>
    initialEntries && initialEntries.length > 0
      ? initialEntries.map((e) => ({ ...makeEmptyEntry(), ...e }))
      : [makeEmptyEntry()]
  );
  const [rows, setRows] = useState<RowState[]>(() => {
    const n = initialEntries && initialEntries.length > 0 ? initialEntries.length : 1;
    return Array.from({ length: n }, () => makeEmptyRow());
  });
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [inspectModal, setInspectModal] = useState<{ isOpen: boolean; fuelRecordId: string | number; truckNumber?: string }>({
    isOpen: false, fuelRecordId: '',
  });

  const accent = yard === 'darYard' ? '#16a34a' : '#1d6fc9';

  useEffect(() => {
    const yardCode = yard === 'darYard' ? 'DAR' : 'TANGA';
    configAPI.getYardConfigs().then(configs => {
      const cfg = configs.find(c => c.yard === yardCode);
      if (cfg && cfg.rate > 0) {
        setEntries(prev => prev.map(e => (e.rate === 0 ? { ...e, rate: cfg.rate } : e)));
      }
    }).catch(() => {});
  }, [yard]);

  const updateEntry = (idx: number, field: keyof DraftEntry, value: string | number | null) => {
    setEntries(prev => prev.map((e, i) => {
      if (i !== idx) return e;
      const u = { ...e, [field]: value } as DraftEntry;
      if (field === 'liters' || field === 'rate') {
        u.amount = +(Number(u.liters) * Number(u.rate)).toFixed(2);
      }
      return u;
    }));
  };

  const updateRow = (idx: number, patch: Partial<RowState>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const applySelectedJourney = useCallback((
    idx: number,
    record: FuelRecord,
    journeys: { active: FuelRecord | null; queued: FuelRecord[] },
    selectedType: 'active' | 'queued',
    selectedIndex: number,
    autoLink = true,
    alsoSetTruck = false,
  ) => {
    const { doNo, dest } = applyJourneyToEntryFields(record);
    const already = yardColumnLiters(record, yard);
    setEntries(prev => prev.map((e, i) => {
      if (i !== idx) return e;
      return {
        ...e,
        doNo,
        dest,
        ...(alsoSetTruck && record.truckNo
          ? { truckNo: String(record.truckNo).toUpperCase() }
          : {}),
      };
    }));
    updateRow(idx, {
      autoFetching: false,
      fetched: true,
      fuelRecord: record,
      fuelRecordId: fuelRecordIdOf(record),
      alreadyDispensed: already,
      warningType: null,
      warningMessage: undefined,
      linked: autoLink,
      allJourneys: journeys,
      selectedJourneyType: selectedType,
      selectedJourneyIndex: selectedIndex,
    });
  }, [yard]);

  const doFetchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const fetchByDo = useCallback(async (idx: number, rawDo: string, truckHint?: string) => {
    const doUp = rawDo.trim().toUpperCase();
    if (!doUp || doUp === 'NIL' || doUp === 'N/A' || doUp.length < 3) return;

    updateRow(idx, {
      autoFetching: true,
      fetched: false,
      warningType: null,
      warningMessage: undefined,
    });

    try {
      const result = await fetchYardJourneyByDo(doUp, truckHint);
      const journeys = { active: result.active, queued: result.queued };

      if (!result.selected || !result.selectedType) {
        updateRow(idx, {
          autoFetching: false,
          fetched: true,
          warningType: result.warningType,
          warningMessage: result.message,
          fuelRecord: null,
          fuelRecordId: undefined,
          linked: false,
          allJourneys: journeys,
          selectedJourneyType: null,
          selectedJourneyIndex: -1,
        });
        return;
      }

      if (result.ambiguous) {
        toast.info(`DO ${doUp} matched more than one truck — using ${result.truckNo || 'best match'}`);
      }

      applySelectedJourney(
        idx,
        result.selected,
        journeys,
        result.selectedType,
        result.selectedIndex,
        true,
        true, // fill truck from DO match
      );
    } catch {
      updateRow(idx, {
        autoFetching: false,
        fetched: true,
        warningType: 'not_found',
        warningMessage: `Failed to look up DO ${doUp}`,
        fuelRecord: null,
        linked: false,
      });
    }
  }, [applySelectedJourney]);

  const handleDoChange = (idx: number, value: string) => {
    const doUp = value.toUpperCase();
    updateEntry(idx, 'doNo', doUp);

    if (doFetchTimers.current[idx]) clearTimeout(doFetchTimers.current[idx]);

    const trimmed = doUp.trim();
    if (!trimmed || trimmed === 'NIL' || trimmed === 'N/A' || trimmed.length < 3) {
      return;
    }

    doFetchTimers.current[idx] = setTimeout(() => {
      const truckHint = entriesRef.current[idx]?.truckNo;
      fetchByDo(idx, trimmed, truckHint);
    }, 400);
  };

  const fetchTruck = useCallback(async (idx: number, rawTruckNo: string) => {
    const truckNo = rawTruckNo.trim();
    if (truckNo.length < 3) return;

    updateRow(idx, {
      autoFetching: true,
      fetched: false,
      fuelRecord: null,
      fuelRecordId: undefined,
      warningType: null,
      warningMessage: undefined,
      linked: false,
      allJourneys: { active: null, queued: [] },
      selectedJourneyType: null,
      selectedJourneyIndex: -1,
      alreadyDispensed: 0,
    });

    try {
      const result = await fetchYardJourneysForTruck(truckNo);
      const journeys = { active: result.active, queued: result.queued };

      if (!result.selected || !result.selectedType) {
        updateRow(idx, {
          autoFetching: false,
          fetched: true,
          warningType: result.warningType,
          warningMessage: result.message,
          fuelRecord: null,
          linked: false,
          allJourneys: journeys,
          selectedJourneyType: null,
          selectedJourneyIndex: -1,
        });
        return;
      }

      applySelectedJourney(
        idx,
        result.selected,
        journeys,
        result.selectedType,
        result.selectedIndex,
        true,
      );
    } catch {
      updateRow(idx, {
        autoFetching: false,
        fetched: true,
        warningType: 'not_found',
        warningMessage: 'Failed to look up truck journeys',
        fuelRecord: null,
        linked: false,
        allJourneys: { active: null, queued: [] },
        selectedJourneyType: null,
        selectedJourneyIndex: -1,
      });
    }
  }, [applySelectedJourney]);

  const restoredFetchDone = useRef(false);
  useEffect(() => {
    if (restoredFetchDone.current) return;
    restoredFetchDone.current = true;
    entries.forEach((e, i) => {
      if ((e.truckNo || '').trim().length >= 3) fetchTruck(i, e.truckNo);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTruck]);

  const handleJourneySelect = (idx: number, type: 'active' | 'queued', qIdx = 0) => {
    const row = rows[idx];
    if (!row) return;
    const record =
      type === 'active'
        ? row.allJourneys.active
        : row.allJourneys.queued[qIdx];
    if (!record) return;
    applySelectedJourney(idx, record, row.allJourneys, type, type === 'active' ? -1 : qIdx, true);
  };

  const handleCreatePendingDo = async (idx: number) => {
    const truckNo = (entries[idx]?.truckNo || '').trim().toUpperCase();
    if (!truckNo || truckNo.length < 4) {
      toast.error('Enter a valid truck number first');
      return;
    }
    updateRow(idx, { creatingPendingDo: true });
    try {
      const res = await fuelRecordsAPI.createPendingGoingDo({ truckNo, date: date || undefined });
      toast.success(res?.message || `Pending going DO created for ${truckNo}`);
      await fetchTruck(idx, truckNo);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create pending DO');
    } finally {
      updateRow(idx, { creatingPendingDo: false });
    }
  };

  const handleLinkToggle = (idx: number, checked: boolean) => {
    const row = rows[idx];
    if (!checked) {
      setEntries(prev => prev.map((e, i) => (
        i !== idx ? e : { ...e, dispenseLiters: null }
      )));
      updateRow(idx, { linked: false });
      return;
    }
    if (!row?.fuelRecord) {
      toast.warn('Select an active or queued journey first');
      return;
    }
    updateRow(idx, { linked: true });
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
  };

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
        if (rowIdx < next.length) next[rowIdx] = { ...next[rowIdx], truckNo: line.toUpperCase() };
        else next.push({ ...makeEmptyEntry(lastRate), truckNo: line.toUpperCase() });
      });
      return next;
    });
    setRows(prev => {
      const next = [...prev];
      for (let i = 1; i < lines.length; i++) if (idx + i >= next.length) next.push(makeEmptyRow());
      return next;
    });
    lines.forEach((line, i) => {
      setTimeout(() => fetchTruck(idx + i, line), i * 80);
    });
  }, [fetchTruck]);

  /** Multi-line DO paste → one row per DO, then stagger DO→truck fetch (like LPODetailForm). */
  const handleDoPaste = useCallback((idx: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/[\r\n\t]+/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return;
    e.preventDefault();
    setEntries(prev => {
      const lastRate = prev[prev.length - 1]?.rate || 0;
      const next = [...prev];
      lines.forEach((line, i) => {
        const rowIdx = idx + i;
        if (rowIdx < next.length) next[rowIdx] = { ...next[rowIdx], doNo: line.toUpperCase() };
        else next.push({ ...makeEmptyEntry(lastRate), doNo: line.toUpperCase() });
      });
      return next;
    });
    setRows(prev => {
      const next = [...prev];
      for (let i = 1; i < lines.length; i++) if (idx + i >= next.length) next.push(makeEmptyRow());
      return next;
    });
    lines.forEach((line, i) => {
      setTimeout(() => {
        if (doFetchTimers.current[idx + i]) clearTimeout(doFetchTimers.current[idx + i]);
        fetchByDo(idx + i, line);
      }, i * 80);
    });
  }, [fetchByDo]);

  useImperativeHandle(ref, () => ({
    getSubmission: () => {
      const validIdx = entries
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.truckNo.trim() && e.liters > 0 && e.rate > 0);
      if (validIdx.length === 0) return null;

      // Context required when billed liters differ from dispense (same rule as yard amend).
      const missingContext = validIdx.find(({ e }) => {
        const diff = entryDiff(e);
        return Math.abs(diff) > 0.001 && !(e.context && e.context.trim());
      });
      if (missingContext) {
        toast.error(
          `Context is required when billed liters differ from dispense (row ${missingContext.i + 1})`
        );
        return null;
      }

      const payloadEntries: YardEntryPayload[] = validIdx.map(({ e }) => {
        const liters = Number(e.liters) || 0;
        // Clamp dispense so it never exceeds billed liters; null = full billed.
        let dispenseLiters: number | null = e.dispenseLiters;
        if (dispenseLiters != null) {
          dispenseLiters = Math.min(Math.max(0, Number(dispenseLiters) || 0), liters);
          if (Math.abs(dispenseLiters - liters) < 0.001) dispenseLiters = null;
        }
        const context =
          e.context != null && String(e.context).trim() !== ''
            ? String(e.context).trim()
            : null;

        return {
          doNo: e.doNo.trim() || 'NIL',
          truckNo: e.truckNo.trim().toUpperCase(),
          liters,
          rate: Number(e.rate) || 0,
          amount: +(liters * (Number(e.rate) || 0)).toFixed(2),
          dest: e.dest.trim() || '-',
          dispenseLiters,
          context,
        };
      });

      const linkSelections: YardLinkSelection[] = [];
      validIdx.forEach(({ e, i }, order) => {
        const row = rows[i];
        if (row?.linked && row.fuelRecordId) {
          const liters = Number(e.liters) || 0;
          const disp =
            e.dispenseLiters != null
              ? Math.min(Math.max(0, Number(e.dispenseLiters) || 0), liters)
              : liters;
          linkSelections.push({
            index: order,
            fuelRecordId: row.fuelRecordId,
            topUp: (row.alreadyDispensed ?? 0) > 0,
            dispenseLiters: disp,
          });
        }
      });

      return { entries: payloadEntries, linkSelections };
    },
    // Journey chips replace the old multi-candidate modal — nothing blocks submit.
    hasPendingChoice: () => false,
  }), [entries, rows]);

  const total = entries.reduce((s, e) => s + (e.amount || 0), 0);

  useEffect(() => {
    const valid = entries.filter(e => e.truckNo.trim() && e.liters > 0 && e.rate > 0);
    onSummaryChange?.({
      count: valid.length,
      total: valid.reduce((s, e) => s + (e.amount || 0), 0),
      totalLiters: valid.reduce((s, e) => s + (Number(e.liters) || 0), 0),
    });
    onEntriesChange?.(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  /**
   * Status text shown next to the chips. When the selected chip already says
   * "Active", we avoid repeating that word — show the DO number (or "Linked"
   * once linked) instead so the row communicates something new.
   */
  const statusLabel = (row: RowState, doNo: string): { text: string; tone: 'ok' | 'warn' | 'muted' | 'link' } => {
    if (row.autoFetching) return { text: 'Looking up…', tone: 'muted' };
    if (row.warningType === 'journey_completed') return { text: 'Completed', tone: 'warn' };
    if (row.warningType === 'no_active_record') return { text: 'No journey', tone: 'warn' };
    if (row.warningType === 'not_found') return { text: 'Not found', tone: 'warn' };
    if (row.fetched && row.fuelRecord) {
      if (row.linked) return { text: 'Linked', tone: 'link' };
      if (row.selectedJourneyType === 'active') {
        const trimmedDo = doNo && doNo.length > 10 ? `${doNo.slice(0, 10)}…` : doNo;
        return { text: trimmedDo || 'Ready', tone: 'ok' };
      }
      return { text: 'Queued', tone: 'ok' };
    }
    return { text: '—', tone: 'muted' };
  };

  /** Status column: chips + label + pending-DO action all SIDE BY SIDE on one row. */
  const renderStatusCell = (idx: number, row: RowState, doNo: string, size: 'sm' | 'xs' = 'sm') => {
    const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[10px]';
    const st = statusLabel(row, doNo);
    const toneClass =
      st.tone === 'ok'
        ? 'text-green-600 dark:text-green-400'
        : st.tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : st.tone === 'link'
        ? 'text-indigo-600 dark:text-indigo-400'
        : 'text-gray-400';

    return (
      <div className="flex items-center gap-1 flex-wrap min-w-0">
        {row.allJourneys.active && (
          <button
            type="button"
            onClick={() => handleJourneySelect(idx, 'active')}
            disabled={disabled}
            className={`${pad} rounded font-semibold transition-colors shrink-0 ${
              row.selectedJourneyType === 'active'
                ? 'bg-green-500 text-white'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
            }`}
            title={row.allJourneys.active.goingDo || 'Active journey'}
          >
            Active
          </button>
        )}
        {row.allJourneys.queued.map((qJ, qIdx) => (
          <button
            key={fuelRecordIdOf(qJ) || qIdx}
            type="button"
            onClick={() => handleJourneySelect(idx, 'queued', qIdx)}
            disabled={disabled}
            className={`${pad} rounded font-semibold transition-colors shrink-0 ${
              row.selectedJourneyType === 'queued' && row.selectedJourneyIndex === qIdx
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
            }`}
            title={qJ.goingDo || `Queued #${qJ.queueOrder || qIdx + 1}`}
          >
            Q{qJ.queueOrder || qIdx + 1}
          </button>
        ))}
        <span className={`text-[10px] font-semibold truncate ${toneClass}`} title={st.text}>{st.text}</span>
        {shouldOfferPendingGoingCreate({
          warningType: row.warningType,
          active: row.allJourneys.active,
          queued: row.allJourneys.queued,
        }) && (entries[idx]?.truckNo || '').trim().length >= 4 && (
          <button
            type="button"
            onClick={() => handleCreatePendingDo(idx)}
            disabled={disabled || row.creatingPendingDo}
            title="Create temporary PG#### going DO (queued if this truck already has an active journey)"
            className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
          >
            {row.creatingPendingDo ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
            Pending DO
          </button>
        )}
      </div>
    );
  };

  /** Fuel / Link column: balance + yard liters + link checkbox on one row. */
  const renderFuelLinkCell = (idx: number, row: RowState) => {
    const showFuel = row.fetched && !!row.fuelRecord && !row.warningType;
    if (!showFuel) {
      return <span className="text-[12px] text-[#cbd5e1]">—</span>;
    }
    return (
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <div className="flex items-center gap-1 text-[11px] font-medium shrink-0" style={{ color: accent }} title={`Balance ${fmt(row.fuelRecord!.balance)}L · Yard column ${fmt(row.alreadyDispensed)}L`}>
          <CheckCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{fmt(row.fuelRecord!.balance)}/{fmt(row.alreadyDispensed)}</span>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
          <input
            type="checkbox"
            checked={row.linked}
            onChange={e => handleLinkToggle(idx, e.target.checked)}
            disabled={disabled}
            className="w-3.5 h-3.5 cursor-pointer shrink-0"
            style={{ accentColor: accent }}
          />
          <span className="text-[11px] text-[#64748b] font-medium whitespace-nowrap">Link</span>
        </label>
      </div>
    );
  };

  return (
    <div className="panel overflow-hidden w-full max-w-full">
      {/* ── Mobile cards ── */}
      <div className="md:hidden space-y-1.5 p-2">
        {entries.map((entry, idx) => {
          const row = rows[idx] || makeEmptyRow();
          const hasWarning = !!row.warningType && row.fetched && !row.autoFetching;
          const ok = row.fetched && !hasWarning && !!row.fuelRecord;

          return (
            <div
              key={idx}
              className={`border rounded-lg p-2.5 transition-colors ${
                ok
                  ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10'
                  : hasWarning
                  ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10'
                  : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">#{idx + 1}</span>
                <div className="flex items-center gap-1">
                  {row.fuelRecordId && (
                    <button
                      type="button"
                      onClick={() => setInspectModal({ isOpen: true, fuelRecordId: row.fuelRecordId!, truckNumber: entry.truckNo })}
                      className="p-1 text-blue-600"
                      title="Inspect fuel record"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={disabled || entries.length === 1}
                    className="p-1 text-red-500 disabled:opacity-30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <div>
                  <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Truck</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={entry.truckNo}
                      onChange={e => updateEntry(idx, 'truckNo', e.target.value.toUpperCase())}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchTruck(idx, entry.truckNo); } }}
                      onPaste={e => handleTruckPaste(idx, e)}
                      placeholder="Truck"
                      disabled={disabled}
                      className={`w-full min-w-0 px-1.5 py-1 border rounded text-[11px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                        hasWarning ? 'border-amber-500' : 'border-gray-300 dark:border-gray-600'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => fetchTruck(idx, entry.truckNo)}
                      disabled={disabled || row.autoFetching || !entry.truckNo.trim()}
                      className="shrink-0 p-1 rounded text-primary-600 disabled:opacity-50"
                    >
                      {row.autoFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">DO#</label>
                  <input
                    type="text"
                    value={entry.doNo}
                    onChange={e => handleDoChange(idx, e.target.value)}
                    onPaste={e => handleDoPaste(idx, e)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (doFetchTimers.current[idx]) clearTimeout(doFetchTimers.current[idx]);
                        fetchByDo(idx, entry.doNo, entry.truckNo);
                      }
                    }}
                    placeholder="DO#"
                    disabled={disabled}
                    title="Type or paste DO(s) to fetch truck details"
                    className="w-full min-w-0 px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              {/* Status row */}
              <div className="mb-2 p-1.5 rounded-md bg-white/70 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-700">
                <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-1">Status</div>
                {renderStatusCell(idx, row, entry.doNo, 'xs')}
              </div>

              {/* Fuel / link */}
              {ok && (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium" style={{ color: accent }}>
                    Bal {fmt(row.fuelRecord!.balance)}L · Yard {fmt(row.alreadyDispensed)}L
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-medium text-gray-600 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={row.linked}
                      onChange={e => handleLinkToggle(idx, e.target.checked)}
                      disabled={disabled}
                      className="w-3.5 h-3.5"
                      style={{ accentColor: accent }}
                    />
                    Link &amp; dispense
                  </label>
                </div>
              )}

              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Ltrs</label>
                  <input
                    type="number"
                    value={entry.liters || ''}
                    onChange={e => updateEntry(idx, 'liters', parseFloat(e.target.value) || 0)}
                    disabled={disabled}
                    className="w-full min-w-0 px-1 py-1 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Rate</label>
                  <input
                    type="number"
                    value={entry.rate || ''}
                    onChange={e => updateEntry(idx, 'rate', parseFloat(e.target.value) || 0)}
                    disabled={disabled}
                    className="w-full min-w-0 px-1 py-1 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Dest</label>
                  <input
                    type="text"
                    value={entry.dest}
                    onChange={e => updateEntry(idx, 'dest', e.target.value)}
                    placeholder="Dest"
                    disabled={disabled}
                    className="w-full min-w-0 px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              {/* Dispense / Diff / Context — shown when linked (mirrors yard LPO forms) */}
              {ok && row.linked && (() => {
                const diff = entryDiff(entry);
                const contextRequired = Math.abs(diff) > 0.001;
                return (
                  <div className="mt-2 space-y-1.5 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <label className="block text-[9px] font-semibold text-amber-700 dark:text-amber-400 mb-0.5">Disp</label>
                        <input
                          type="number"
                          value={(entry.dispenseLiters ?? entry.liters) || ''}
                          onChange={e => updateEntry(
                            idx,
                            'dispenseLiters',
                            e.target.value === '' ? null : (parseFloat(e.target.value) || 0)
                          )}
                          placeholder={String(entry.liters || 0)}
                          min={0}
                          step="0.01"
                          disabled={disabled}
                          title="Liters dispensed to the fuel record (defaults to full liters)"
                          className="w-full min-w-0 px-1 py-1 border border-amber-300 dark:border-amber-700 rounded text-[11px] bg-amber-50 dark:bg-amber-900/20 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Diff</label>
                        <div
                          className={`px-1 py-1 text-[11px] font-semibold tabular-nums ${
                            diff === 0
                              ? 'text-gray-400'
                              : diff > 0
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                          title="Billed liters minus dispensed liters"
                        >
                          {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${diff}`}
                        </div>
                      </div>
                      <div className="flex items-end justify-end">
                        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 pb-1">
                          Amt {entry.amount > 0 ? fmt(entry.amount) : '—'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className={`block text-[9px] mb-0.5 ${
                        contextRequired
                          ? 'font-semibold text-amber-700 dark:text-amber-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        Context{contextRequired ? ' *' : ''}
                      </label>
                      <input
                        type="text"
                        value={entry.context || ''}
                        onChange={e => updateEntry(idx, 'context', e.target.value || null)}
                        placeholder={contextRequired ? 'Why billed ≠ dispense…' : 'Optional note'}
                        disabled={disabled}
                        className={`w-full min-w-0 px-1.5 py-1 border rounded text-[11px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                          contextRequired
                            ? 'border-amber-400 dark:border-amber-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      />
                    </div>
                  </div>
                );
              })()}

              {!(ok && row.linked) && (
                <div className="flex items-center justify-end pt-2 mt-2 border-t border-gray-200 dark:border-gray-600">
                  <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">
                    Amt {entry.amount > 0 ? fmt(entry.amount) : '—'}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Desktop table: flexible columns, no forced wide mins ── */}
      <div className="hidden md:block w-full overflow-x-auto">
        <table className="lpo-table w-full" style={{ tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th className="lpo-th w-8">#</th>
              <th className="lpo-th" style={{ width: '11%' }}>Truck</th>
              <th className="lpo-th" style={{ width: '8%' }}>DO</th>
              <th className="lpo-th" style={{ width: '14%' }}>Status</th>
              <th className="lpo-th" style={{ width: '10%' }}>Fuel / Link</th>
              <th className="lpo-th text-right" style={{ width: '7%' }}>Liters</th>
              <th className="lpo-th text-right" style={{ width: '7%' }} title="Liters written to fuel record">Disp</th>
              <th className="lpo-th text-right" style={{ width: '5%' }} title="Billed liters minus dispensed liters">Diff</th>
              <th className="lpo-th text-right" style={{ width: '6%' }}>Rate</th>
              <th className="lpo-th text-right" style={{ width: '7%' }}>Amt</th>
              <th className="lpo-th" style={{ width: '12%' }}>Context</th>
              <th className="lpo-th" style={{ width: '8%' }}>Dest</th>
              <th className="lpo-th text-center w-14"> </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => {
              const row = rows[idx] || makeEmptyRow();
              const showFuel = row.fetched && !!row.fuelRecord && !row.warningType;
              const rowClass = row.warningType
                ? 'row-amber'
                : showFuel
                ? 'row-blue'
                : '';

              return (
                <tr key={idx} className={`lpo-row ${rowClass}`}>
                  <td className="text-[11px] text-[#94a3b8] font-mono">{String(idx + 1).padStart(2, '0')}</td>

                  <td className="min-w-0">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={entry.truckNo}
                        onChange={e => updateEntry(idx, 'truckNo', e.target.value.toUpperCase())}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchTruck(idx, entry.truckNo); } }}
                        onPaste={e => handleTruckPaste(idx, e)}
                        placeholder="T 000 XXX"
                        disabled={disabled}
                        className="cell-input mono min-w-0"
                      />
                      <button
                        type="button"
                        onClick={() => fetchTruck(idx, entry.truckNo)}
                        disabled={disabled || row.autoFetching || !entry.truckNo.trim()}
                        title="Fetch journeys (Enter)"
                        className="icon-btn disabled:opacity-50 shrink-0"
                        style={{ color: accent }}
                      >
                        {row.autoFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>

                  <td className="min-w-0">
                    <input
                      type="text"
                      value={entry.doNo}
                      onChange={e => handleDoChange(idx, e.target.value)}
                      onPaste={e => handleDoPaste(idx, e)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (doFetchTimers.current[idx]) clearTimeout(doFetchTimers.current[idx]);
                          fetchByDo(idx, entry.doNo, entry.truckNo);
                        }
                      }}
                      placeholder="DO #"
                      disabled={disabled}
                      className="cell-input mono min-w-0"
                      title={entry.doNo || 'Type or paste DO(s) to fetch truck details'}
                    />
                  </td>

                  <td className="min-w-0 align-top py-1.5">
                    {renderStatusCell(idx, row, entry.doNo, 'sm')}
                  </td>

                  <td className="min-w-0 align-top py-1.5">
                    {renderFuelLinkCell(idx, row)}
                  </td>

                  <td className="min-w-0">
                    <input
                      type="number"
                      value={entry.liters || ''}
                      onChange={e => updateEntry(idx, 'liters', parseFloat(e.target.value) || 0)}
                      placeholder="0" min={0.01} step="0.01"
                      disabled={disabled}
                      className="cell-input text-right min-w-0"
                    />
                  </td>

                  {/* Disp — editable when linked */}
                  <td className="min-w-0">
                    {showFuel && row.linked ? (
                      <input
                        type="number"
                        value={(entry.dispenseLiters ?? entry.liters) || ''}
                        onChange={e => updateEntry(
                          idx,
                          'dispenseLiters',
                          e.target.value === '' ? null : (parseFloat(e.target.value) || 0)
                        )}
                        placeholder={String(entry.liters || 0)}
                        min={0}
                        step="0.01"
                        disabled={disabled}
                        title="Liters dispensed to the fuel record (defaults to full liters)"
                        className="cell-input text-right min-w-0"
                        style={{ borderColor: '#ecc98f', background: '#fdf6e8' }}
                      />
                    ) : (
                      <span className="text-[#cbd5e1] text-[12px]">—</span>
                    )}
                  </td>

                  {/* Diff — billed − dispense */}
                  <td className="text-right min-w-0 tabular-nums text-[12px] font-semibold">
                    {showFuel && row.linked ? (() => {
                      const diff = entryDiff(entry);
                      if (diff === 0) return <span className="text-[#cbd5e1] font-normal">—</span>;
                      return (
                        <span
                          title="Billed liters minus dispensed liters"
                          style={{ color: diff > 0 ? '#b4690e' : '#dc2626' }}
                        >
                          {diff > 0 ? '+' : ''}{diff}
                        </span>
                      );
                    })() : (
                      <span className="text-[#cbd5e1] font-normal">—</span>
                    )}
                  </td>

                  <td className="min-w-0">
                    <input
                      type="number"
                      value={entry.rate || ''}
                      onChange={e => updateEntry(idx, 'rate', parseFloat(e.target.value) || 0)}
                      placeholder="0" min={0.01} step="0.01"
                      disabled={disabled}
                      className="cell-input text-right min-w-0"
                    />
                  </td>

                  <td className="amount-cell text-right min-w-0">
                    {entry.amount > 0 ? fmt(entry.amount) : <span className="text-[#cbd5e1] font-normal">—</span>}
                  </td>

                  {/* Context — required when Diff ≠ 0 */}
                  <td className="min-w-0">
                    {showFuel && row.linked ? (() => {
                      const contextRequired = Math.abs(entryDiff(entry)) > 0.001;
                      return (
                        <input
                          type="text"
                          value={entry.context || ''}
                          onChange={e => updateEntry(idx, 'context', e.target.value || null)}
                          placeholder={contextRequired ? 'Required…' : 'Optional'}
                          disabled={disabled}
                          title={contextRequired ? 'Context is required when billed ≠ dispense' : 'Optional note for this entry'}
                          className="cell-input min-w-0"
                          style={contextRequired ? { borderColor: '#ecc98f', background: '#fdf6e8' } : undefined}
                        />
                      );
                    })() : (
                      <span className="text-[#cbd5e1] text-[12px]">—</span>
                    )}
                  </td>

                  <td className="min-w-0">
                    <input
                      type="text"
                      value={entry.dest}
                      onChange={e => updateEntry(idx, 'dest', e.target.value)}
                      placeholder="Dest"
                      disabled={disabled}
                      className="cell-input min-w-0"
                    />
                  </td>

                  <td>
                    <div className="flex items-center justify-center gap-0.5">
                      {row.fetched && row.fuelRecordId && (
                        <button
                          type="button"
                          title="Inspect fuel record"
                          onClick={() => setInspectModal({ isOpen: true, fuelRecordId: row.fuelRecordId!, truckNumber: entry.truckNo })}
                          className="icon-btn"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#94a3b8]" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        disabled={disabled || entries.length === 1}
                        title="Remove row"
                        className="icon-btn icon-btn-danger disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[#ef4444]" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={addRow} disabled={disabled} className="addrow-btn disabled:opacity-50">
        <Plus className="w-4 h-4" /> Add Row
      </button>

      <div className="flex items-center justify-end px-4 py-2.5 border-t border-[#eef1f6] dark:border-[#1e293b] text-[13px] font-bold text-[#0f1729] dark:text-gray-100">
        Total: {fmt(total)}
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
});

YardEntriesTable.displayName = 'YardEntriesTable';

export default YardEntriesTable;
