import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { toast } from 'react-toastify';
import { PenSquare, Save, X, Calculator, Copy, MessageSquare, Image, ChevronDown, FileDown, Download, Lock, AlertTriangle, Clipboard, XCircle, RotateCcw, Loader2, Search, ArrowRightLeft, MapPin, Check } from 'lucide-react';
import { LPOSheet, LPODetail, LPOSummary, CancellationReport, CancellationPoint, FuelRecord } from '../types';
import { lpoWorkbookAPI, fuelRecordsAPI, lpoDocumentsAPI, FuelAutomationConfig } from '../services/api';
import { useJourneyConfig } from '../hooks/useJourneyConfig';
import { copyLPOImageToClipboard, downloadLPOImage } from '../utils/lpoImageGenerator';
import { copyLPOForWhatsApp, copyLPOTextToClipboard } from '../utils/lpoTextGenerator';
import { useAuth } from '../contexts/AuthContext';
import { formatTruckNumber } from '../utils/dataCleanup';
import { checkpointFieldLabel } from '../utils/checkpointLabels';
import {
  generateCancellationReport,
  formatEntryForDisplay,
  saveCancellationToHistory,
  getAutoCancellationPoint,
  getCancellationPointDisplayName,
  FUEL_RECORD_COLUMNS
} from '../services/cancellationService';
import {
  fetchTruckForLpo,
  fetchDoForLpo,
  isSpecialDo,
  TruckFetchResult,
} from '../utils/lpoJourneyLookup';
import PickupAtModal from './PickupAtModal';
import PickedAtModal from './PickedAtModal';
import FuelRecordInspectModal from './FuelRecordInspectModal';

/** Per-row journey lookup state while editing truck/DO in the sheet. */
interface RowLookupState {
  loading: boolean;
  fetched: boolean;
  direction: 'going' | 'returning';
  fuelRecord: FuelRecord | null;
  message?: string;
  warningType?: TruckFetchResult['warningType'];
  allJourneys?: { active: FuelRecord | null; queued: FuelRecord[] };
  selectedJourneyType?: 'active' | 'queued';
  selectedJourneyIndex?: number; // -1 active, 0+ queued
}

interface LPOSheetViewProps {
  sheet: LPOSheet;
  workbookId: string | number;
  onUpdate: (updatedSheet: LPOSheet) => void;
  lpoNo?: string;
  onBack?: () => void;
  initialTruckNo?: string;
}

const LPOSheetView: React.FC<LPOSheetViewProps> = ({ sheet, workbookId, onUpdate, lpoNo, onBack, initialTruckNo }) => {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedSheet, setEditedSheet] = useState<LPOSheet>(sheet);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Prevent double submissions
  const [cancellationReport, setCancellationReport] = useState<CancellationReport | null>(null);
  const [showCancellationReport, setShowCancellationReport] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  
  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingEntryIndex, setCancellingEntryIndex] = useState<number | null>(null);
  const [detectedDirection, setDetectedDirection] = useState<'going' | 'returning' | null>(null);
  const [detectedCancellationPoint, setDetectedCancellationPoint] = useState<CancellationPoint | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [entryTypeMessage, setEntryTypeMessage] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<'driver-account' | 'nil-do' | 'regular' | null>(null);
  // Manual checkpoint selection for cancel when lpoCancelRevert automation is OFF
  const [detectedFuelRecordId, setDetectedFuelRecordId] = useState<string | number | null>(null);
  const [cancelManualField, setCancelManualField] = useState<string>('');
  const [showCancelInspect, setShowCancelInspect] = useState(false);
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);
  const [showCancelAllModal, setShowCancelAllModal] = useState(false);
  const [isCancellingAll, setIsCancellingAll] = useState(false);
  // Cancel-All manual checkpoint state (when lpoCancelRevert automation is OFF).
  // Directions are resolved per active regular entry, then a checkpoint is chosen
  // once per direction (going / returning) that is present on the LPO.
  const [cancelAllDetecting, setCancelAllDetecting] = useState(false);
  const [cancelAllMeta, setCancelAllMeta] = useState<Record<string, 'going' | 'returning' | null>>({});
  const [cancelAllRevertGoing, setCancelAllRevertGoing] = useState('');
  const [cancelAllRevertReturning, setCancelAllRevertReturning] = useState('');
  // Restore (uncancel) manual checkpoint state — used when lpoCancelRevert is OFF
  // and the restored entry is a real fuel-record entry (must re-deduct fuel).
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoringEntryIndex, setRestoringEntryIndex] = useState<number | null>(null);
  const [restoreDetecting, setRestoreDetecting] = useState(false);
  const [restoreDirection, setRestoreDirection] = useState<'going' | 'returning' | null>(null);
  const [restoreManualField, setRestoreManualField] = useState('');
  const [restoreFuelRecordId, setRestoreFuelRecordId] = useState<string | number | null>(null);
  const [showRestoreInspect, setShowRestoreInspect] = useState(false);
  const [entrySearch, setEntrySearch] = useState('');
  const [fuelAutomation, setFuelAutomation] = useState<FuelAutomationConfig | null>(null);
  const [highlightedTruckNo, setHighlightedTruckNo] = useState<string | null>(null);
  const entryRowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const highlightedForRef = useRef<string | null>(null);

  // Pick-up-at multi-select (operates on the full-array originalIndex)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [pickedAtIndex, setPickedAtIndex] = useState<number | null>(null);

  // Truck / DO journey lookup while editing a row (parity with LPODetailForm)
  const [rowLookup, setRowLookup] = useState<Record<number, RowLookupState>>({});
  const lookupTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  /** Resolved going/returning per row (always-visible Dir column). */
  const [entryDirections, setEntryDirections] = useState<Record<number, 'going' | 'returning'>>({});
  /** Direction at edit-start — used to detect direction swaps on save. */
  const editOriginDirectionRef = useRef<Record<number, 'going' | 'returning'>>({});
  const [doAmbiguityModal, setDoAmbiguityModal] = useState<{
    open: boolean;
    index: number;
    doNo: string;
    matches: (TruckFetchResult & { truckNo?: string; direction?: 'going' | 'returning' })[];
  }>({ open: false, index: -1, doNo: '', matches: [] });

  // A regular entry backed by a fuel record (real DO, not DA/REF/NIL). Used to gate
  // the manual fuel-checkpoint prompt on edit — those special entries have no record.
  const hasFuelRecord = (entry: LPODetail): boolean => {
    const doUp = (entry.doNo || '').toUpperCase().trim();
    return (
      !entry.isCancelled &&
      !entry.isDriverAccount &&
      !(entry as any).isRefer &&
      doUp !== '' && doUp !== 'NIL' && doUp !== 'N/A' && doUp !== 'REF' && doUp !== 'DA' && doUp !== 'PENDING'
    );
  };

  /** DA / REF / NIL rows never fetch journeys or touch fuel records. */
  const isNonFuelEntry = (entry: LPODetail): boolean =>
    !!entry.isDriverAccount || !!(entry as any).isRefer || isSpecialDo(entry.doNo || '');

  const specialModeLabel = (entry: LPODetail): 'DA' | 'REF' | 'NIL' | null => {
    if (entry.isDriverAccount) return 'DA';
    if ((entry as any).isRefer || (entry.doNo || '').toUpperCase().trim() === 'REF') return 'REF';
    if (isSpecialDo(entry.doNo || '')) return 'NIL';
    return null;
  };

  /**
   * Desktop sheet grid — each column has a hard minimum so widening one
   * never steals from another; extra viewport width grows the flexible tracks.
   * Total mins ≈ 1480px; parent is full-bleed so side margins are used.
   */
  const sheetGridClass =
    'grid w-full min-w-[1480px] grid-cols-[40px_minmax(110px,1fr)_minmax(120px,1fr)_118px_minmax(80px,0.7fr)_minmax(88px,0.75fr)_minmax(120px,1fr)_minmax(130px,1.25fr)_minmax(110px,0.95fr)_minmax(220px,1.7fr)_minmax(110px,0.95fr)_80px_168px] gap-0';
  /** Shared cell: horizontal + vertical center */
  const sheetCell =
    'px-2 py-1.5 border-r border-gray-300 dark:border-gray-700 flex items-center justify-center min-w-0 overflow-hidden';
  const sheetCellLast =
    'px-2 py-1.5 flex items-center justify-center min-w-0 overflow-hidden';
  /** Match header cell typography for body text */
  const sheetCellText = 'text-[11px] leading-tight font-medium text-gray-900 dark:text-gray-100 text-center';
  const sheetCellMuted = 'text-[11px] leading-tight font-medium text-gray-500 dark:text-gray-400 text-center';

  const [contextModal, setContextModal] = useState<{
    open: boolean;
    index: number | null;
    text: string;
    readOnly: boolean;
  }>({ open: false, index: null, text: '', readOnly: false });

  // Any active entry is pickable — including REF / NIL / Driver-Account entries.
  // Those carry no fuel record, so pick-up just moves them (no fuel netting); the
  // modal and backend detect and skip the fuel/checkpoint steps for them.
  const isPickable = (entry: LPODetail): boolean =>
    !entry.isCancelled && (entry.truckNo || '').trim() !== '';

  const toggleSelect = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };
  const clearSelection = () => setSelectedIndices(new Set());
  const selectAllPickable = () => {
    setSelectedIndices(new Set(
      editedSheet.entries.map((e, i) => (isPickable(e) ? i : -1)).filter((i) => i >= 0)
    ));
  };

  // Memoized so the pickup modal doesn't see a fresh array reference on every render.
  const selectedEntries = useMemo(
    () => editedSheet.entries.filter((_, i) => selectedIndices.has(i)),
    [editedSheet.entries, selectedIndices]
  );

  // Stable source-LPO object for the pickup modal (same reason).
  const pickupSourceLpo = useMemo(
    () => ({
      id: editedSheet.id ? String(editedSheet.id) : undefined,
      lpoNo: editedSheet.lpoNo,
      station: editedSheet.station,
      orderOf: editedSheet.orderOf,
      date: editedSheet.date,
    }),
    [editedSheet.id, editedSheet.lpoNo, editedSheet.station, editedSheet.orderOf, editedSheet.date]
  );

  // Acquire the LPO edit lock before opening pickup (same lock the detail form / row
  // edit use) so another user can't edit or pick up this LPO until we close the modal.
  const handleOpenPickup = async () => {
    if (sheet.id) {
      try {
        await lpoDocumentsAPI.acquireLock(sheet.id);
      } catch (err: any) {
        if (err.response?.status === 423) {
          const lockHolder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
          toast.error(`This LPO is being edited by ${lockHolder}. Try again once they're done.`);
          return;
        }
      }
    }
    setShowPickupModal(true);
  };

  /** Single-truck pick-up-at (move to new LPO) without bulk checkbox select. */
  const handleOpenPickupForIndex = async (index: number) => {
    const entry = editedSheet.entries[index];
    if (!entry || !isPickable(entry)) {
      toast.error('This truck cannot be picked up');
      return;
    }
    setSelectedIndices(new Set([index]));
    await handleOpenPickup();
  };

  const handleOpenPickedAt = async (index: number) => {
    const entry = editedSheet.entries[index];
    if (!entry || entry.isCancelled) return;
    if (sheet.id) {
      try {
        await lpoDocumentsAPI.acquireLock(sheet.id);
      } catch (err: any) {
        if (err.response?.status === 423) {
          const lockHolder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
          toast.error(`This LPO is being edited by ${lockHolder}. Try again once they're done.`);
          return;
        }
      }
    }
    setPickedAtIndex(index);
  };

  const handleClosePickedAt = async () => {
    setPickedAtIndex(null);
    await releaseLockIfNeeded();
  };

  const handlePickedAtComplete = async () => {
    setPickedAtIndex(null);
    await releaseLockIfNeeded();
    await refreshSheet();
  };

  const handleClosePickup = async () => {
    setShowPickupModal(false);
    await releaseLockIfNeeded();
  };

  const handlePickupComplete = async () => {
    setShowPickupModal(false);
    clearSelection();
    await releaseLockIfNeeded();
    await refreshSheet();
  };

  // Reset selection whenever we switch to a different LPO.
  useEffect(() => { setSelectedIndices(new Set()); }, [lpoNo]);

  useEffect(() => {
    setEditedSheet(sheet);
    // Check for cancelled entries and generate report
    const hasCancelled = sheet.entries.some(e => e.isCancelled);
    if (hasCancelled) {
      const report = generateCancellationReport(sheet);
      setCancellationReport(report);
    } else {
      setCancellationReport(null);
    }
  }, [sheet]);

  // Server-side fetch: always get fresh data when lpoNo changes
  useEffect(() => {
    if (!lpoNo) return;

    const fetchFreshSheet = async () => {
      setIsFetchingSheet(true);
      setEntrySearch('');
      try {
        const freshLpo = await lpoDocumentsAPI.getByLpoNo(lpoNo);
        if (freshLpo) {
          setEditedSheet(freshLpo as unknown as LPOSheet);
          const hasCancelled = freshLpo.entries?.some((e: any) => e.isCancelled);
          if (hasCancelled) {
            setCancellationReport(generateCancellationReport(freshLpo as unknown as LPOSheet));
          } else {
            setCancellationReport(null);
          }
        }
      } catch (err) {
        console.error('Failed to refresh sheet data:', err);
        // Fall back to prop data — no crash
      } finally {
        setIsFetchingSheet(false);
      }
    };

    fetchFreshSheet();
  }, [lpoNo]);

  const { data: journeyConfig } = useJourneyConfig();
  const lpoTruckLookupMonths = journeyConfig?.lpoTruckLookupMonths ?? 4;
  useEffect(() => {
    if (journeyConfig?.fuelAutomation) setFuelAutomation(journeyConfig.fuelAutomation);
  }, [journeyConfig]);

  // Resolve going/returning for every regular entry so the Dir column is always populated.
  const directionFingerprint = editedSheet.entries
    .map((e) => `${e.doNo}|${e.truckNo}|${!!e.isDriverAccount}|${!!(e as any).isRefer}|${!!e.isCancelled}`)
    .join(';');
  useEffect(() => {
    let cancelled = false;
    const resolveAll = async () => {
      const next: Record<number, 'going' | 'returning'> = {};
      await Promise.all(
        editedSheet.entries.map(async (entry, index) => {
          if (entry.isCancelled || isNonFuelEntry(entry)) return;
          const doNo = (entry.doNo || '').trim();
          if (doNo.length < 3) return;
          try {
            const res = await fuelRecordsAPI.getByDoNumber(doNo);
            if (res?.direction) next[index] = res.direction;
          } catch {
            /* leave unresolved */
          }
        })
      );
      if (!cancelled) setEntryDirections(next);
    };
    void resolveAll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint captures entry identity
  }, [directionFingerprint]);

  // Scroll to and highlight the row for initialTruckNo once entries are loaded
  useEffect(() => {
    if (!initialTruckNo || editedSheet.entries.length === 0) return;
    if (highlightedForRef.current === initialTruckNo) return;
    const idx = editedSheet.entries.findIndex(
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
  }, [initialTruckNo, editedSheet.entries]);

  // Refresh sheet from server (used after save/cancel operations)
  const refreshSheet = async () => {
    if (!lpoNo) return;
    try {
      const freshLpo = await lpoDocumentsAPI.getByLpoNo(lpoNo);
      if (freshLpo) {
        setEditedSheet(freshLpo as unknown as LPOSheet);
        const hasCancelled = freshLpo.entries?.some((e: any) => e.isCancelled);
        if (hasCancelled) {
          setCancellationReport(generateCancellationReport(freshLpo as unknown as LPOSheet));
        } else {
          setCancellationReport(null);
        }
      }
    } catch (err) {
      console.error('Failed to refresh sheet:', err);
    }
  };

  useEffect(() => {
    // Calculate total when entries change (excluding cancelled entries)
    const total = editedSheet.entries
      .filter(entry => !entry.isCancelled)
      .reduce((sum, entry) => sum + entry.amount, 0);
    if (editedSheet.total !== total) {
      setEditedSheet(prev => ({ ...prev, total }));
    }
  }, [editedSheet.entries]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target as Element).closest('.relative')) {
        setShowCopyDropdown(false);
      }
    };

    const handleScroll = () => {
      setShowCopyDropdown(false);
    };

    const scrollEl = document.getElementById('main-scroll-container');
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    scrollEl?.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      scrollEl?.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Copy cancellation report to clipboard
  const handleCopyCancellationReport = async () => {
    if (!cancellationReport) return;
    try {
      await navigator.clipboard.writeText(cancellationReport.reportText);
      saveCancellationToHistory(cancellationReport);
      toast.success('Cancellation report copied to clipboard!');
    } catch (error) {
      console.error('Error copying cancellation report:', error);
      toast.error('Failed to copy. Please try again.');
    }
  };

  const handleHeaderEdit = async (field: keyof LPOSheet, value: string) => {
    setEditedSheet(prev => ({ ...prev, [field]: value }));
  };

  /** Acquire edit lock before entering edit mode */
  const handleStartEdit = async () => {
    const sheetId = sheet.id;
    if (sheetId) {
      try {
        await lpoDocumentsAPI.acquireLock(sheetId);
      } catch (err: any) {
        if (err.response?.status === 423) {
          const lockHolder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
          toast.error(`This LPO is being edited by ${lockHolder}.`);
        } else {
          toast.error('Could not acquire edit lock. Please try again.');
        }
        return;
      }
    }
    setIsEditing(true);
  };

  /** Release edit lock helper */
  const releaseLockIfNeeded = async () => {
    const sheetId = sheet.id;
    if (sheetId) {
      try { await lpoDocumentsAPI.releaseLock(sheetId); } catch { /* ignore */ }
    }
  };

  const handleSave = async () => {
    if (isSaving) return; // Prevent double submission
    setIsSaving(true);
    try {
      const updatedSheet = await lpoWorkbookAPI.updateSheet(workbookId, sheet.id!, editedSheet);
      onUpdate(updatedSheet);
      setIsEditing(false);
      await releaseLockIfNeeded();
      toast.success('Changes saved successfully! Fuel records have been updated.');
    } catch (error: any) {
      console.error('Error saving sheet:', error);
      if (error?.response?.status === 409) {
        toast.error('Edit session expired — click the edit button to start a new edit.');
        setIsEditing(false);
        await releaseLockIfNeeded();
      } else {
        toast.error('Error saving changes. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Save a single row edit to the backend. When a manual checkpoint is supplied
  // (lpoEditAdjust automation OFF), it's attached so the backend adjusts that column.
  // For truck/DO/direction identity changes, pass fields for both old and new keys so
  // revert (old) and deduct (new) hit the correct fuel records / checkpoints.
  const handleRowSave = async (
    index: number,
    manualField?: string,
    opts?: { revertField?: string }
  ) => {
    if (isSaving) return; // Prevent double submission
    setIsSaving(true);
    try {
      let payload: any = editedSheet;
      if (manualField) {
        const cur = editedSheet.entries[index];
        const orig = sheet.entries[index];
        const checkpoints: Record<string, string> = {
          [`${cur.doNo}-${cur.truckNo}`]: manualField,
        };
        if (
          orig &&
          ((orig.doNo || '') !== (cur.doNo || '') ||
            (orig.truckNo || '').toLowerCase() !== (cur.truckNo || '').toLowerCase())
        ) {
          checkpoints[`${orig.doNo}-${orig.truckNo}`] = opts?.revertField || manualField;
        }
        payload = { ...editedSheet, manualCheckpoints: checkpoints };
      }
      const updatedSheet = await lpoWorkbookAPI.updateSheet(workbookId, sheet.id!, payload);
      onUpdate(updatedSheet);
      setEditingRow(null);
      setRowLookup((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      delete editOriginDirectionRef.current[index];
      // Keep Dir column in sync after save
      const saved = updatedSheet.entries?.[index] ?? editedSheet.entries[index];
      if (saved && !isNonFuelEntry(saved)) {
        const dir = rowLookup[index]?.direction;
        if (dir) {
          setEntryDirections((prev) => ({ ...prev, [index]: dir }));
        }
      }
      setEditCheckpoint({
        open: false,
        index: null,
        direction: null,
        oldDirection: null,
        fuelRecordId: null,
        field: '',
        revertField: '',
        isDirectionSwap: false,
        loading: false,
      });
      await releaseLockIfNeeded();
      toast.success('Entry updated! Fuel records have been adjusted.');
    } catch (error: any) {
      console.error('Error saving entry:', error);
      if (error?.response?.status === 409) {
        toast.error('Edit session expired — click the edit button to start a new edit.');
        setEditingRow(null);
        setEditCheckpoint({
          open: false,
          index: null,
          direction: null,
          oldDirection: null,
          fuelRecordId: null,
          field: '',
          revertField: '',
          isDirectionSwap: false,
          loading: false,
        });
        await releaseLockIfNeeded();
      } else {
        toast.error('Error saving entry. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Edit-side manual checkpoint state (when lpoEditAdjust automation is OFF).
  // Direction swaps need separate revert (old dir) + add (new dir) columns.
  const [editCheckpoint, setEditCheckpoint] = useState<{
    open: boolean;
    index: number | null;
    direction: 'going' | 'returning' | null;
    oldDirection: 'going' | 'returning' | null;
    fuelRecordId: string | number | null;
    field: string;
    revertField: string;
    isDirectionSwap: boolean;
    loading: boolean;
  }>({
    open: false,
    index: null,
    direction: null,
    oldDirection: null,
    fuelRecordId: null,
    field: '',
    revertField: '',
    isDirectionSwap: false,
    loading: false,
  });
  const [showEditInspect, setShowEditInspect] = useState(false);

  // Decide whether a row save needs a manual checkpoint pick first.
  const requestRowSave = async (index: number) => {
    const orig = sheet.entries[index];
    const cur = editedSheet.entries[index];
    const litersChanged = !!orig && cur.liters !== orig.liters;
    const identityChanged =
      !!orig &&
      ((orig.doNo || '') !== (cur.doNo || '') ||
        (orig.truckNo || '').toLowerCase() !== (cur.truckNo || '').toLowerCase());
    const newDir = rowLookup[index]?.direction ?? entryDirections[index] ?? null;
    const oldDir = editOriginDirectionRef.current[index] ?? null;
    // Direction change usually changes DO; also detect via lookup vs resolved origin
    const directionChanged =
      !!orig &&
      !!newDir &&
      !!oldDir &&
      newDir !== oldDir &&
      hasFuelRecord(orig);
    const needsFuelAdjust =
      (litersChanged || identityChanged || directionChanged) &&
      (hasFuelRecord(cur) || ((identityChanged || directionChanged) && orig && hasFuelRecord(orig)));

    if (needsFuelAdjust) {
      if (fuelAutomation === null) {
        toast.error('Journey config still loading — please wait a moment and try again.');
        return;
      }
      if (fuelAutomation.lpoEditAdjust === false) {
        const isDirectionSwap = directionChanged || (identityChanged && !!oldDir && !!newDir && oldDir !== newDir);
        setEditCheckpoint({
          open: true,
          index,
          direction: null,
          oldDirection: oldDir,
          fuelRecordId: null,
          field: '',
          revertField: '',
          isDirectionSwap,
          loading: true,
        });
        try {
          const res = await fuelRecordsAPI.getByDoNumber(cur.doNo);
          const fr: any = res?.fuelRecord;
          setEditCheckpoint((p) => ({
            ...p,
            loading: false,
            direction: res?.direction ?? newDir ?? 'going',
            fuelRecordId: fr?.id ?? fr?._id ?? null,
          }));
        } catch {
          setEditCheckpoint((p) => ({
            ...p,
            loading: false,
            direction: newDir ?? 'going',
          }));
        }
        return;
      }
    }
    await handleRowSave(index);
  };

  // Cancel row edit - revert to original values
  const handleRowCancel = async (index: number) => {
    if (lookupTimers.current[index]) {
      clearTimeout(lookupTimers.current[index]);
      delete lookupTimers.current[index];
    }
    // Revert the edited entry back to original
    const originalEntry = sheet.entries[index];
    if (originalEntry) {
      const updatedEntries = [...editedSheet.entries];
      updatedEntries[index] = { ...originalEntry };
      setEditedSheet(prev => ({
        ...prev,
        entries: updatedEntries
      }));
    }
    setRowLookup((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    delete editOriginDirectionRef.current[index];
    setEditingRow(null);
    await releaseLockIfNeeded();
  };

  /** Acquire lock before starting row-level edit */
  const handleStartRowEdit = async (index: number) => {
    const sheetId = sheet.id;
    if (sheetId) {
      try {
        await lpoDocumentsAPI.acquireLock(sheetId);
      } catch (err: any) {
        if (err.response?.status === 423) {
          const lockHolder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
          toast.error(`This LPO is being edited by ${lockHolder}.`);
        } else {
          toast.error('Could not acquire edit lock. Please try again.');
        }
        return;
      }
    }
    setEditingRow(index);

    // Hydrate journey for direction toggle — do not overwrite liters/DO/truck on the row.
    const entry = editedSheet.entries[index];
    if (entryDirections[index]) {
      editOriginDirectionRef.current[index] = entryDirections[index];
    }
    if (!entry || isNonFuelEntry(entry) || !hasFuelRecord(entry)) return;

    setRowLookup((prev) => ({
      ...prev,
      [index]: {
        ...(prev[index] || { direction: entryDirections[index] || 'going' }),
        loading: true,
        fetched: false,
        fuelRecord: prev[index]?.fuelRecord ?? null,
      },
    }));
    try {
      let result = await fetchDoForLpo(entry.doNo);
      if ((!result.success || !result.fuelRecord) && entry.truckNo) {
        result = await fetchTruckForLpo(entry.truckNo, lpoTruckLookupMonths);
      }
      if (!result.fuelRecord) {
        setRowLookup((prev) => ({
          ...prev,
          [index]: {
            loading: false,
            fetched: true,
            direction: entryDirections[index] || 'going',
            fuelRecord: null,
            message: result.message,
            warningType: result.warningType || null,
          },
        }));
        return;
      }
      const direction =
        result.direction ||
        entryDirections[index] ||
        (result.fuelRecord.returnDo &&
        (result.fuelRecord.returnDo || '').toUpperCase() === (entry.doNo || '').toUpperCase()
          ? 'returning'
          : 'going');
      setEntryDirections((prev) => ({ ...prev, [index]: direction }));
      if (!editOriginDirectionRef.current[index]) {
        editOriginDirectionRef.current[index] = direction;
      }
      const queued = result.allJourneys?.queued || [];
      const fr = result.fuelRecord;
      const isQueued = fr.journeyStatus === 'queued';
      setRowLookup((prev) => ({
        ...prev,
        [index]: {
          loading: false,
          fetched: true,
          direction,
          fuelRecord: fr,
          message: result.message,
          warningType: result.warningType || null,
          allJourneys: result.allJourneys,
          selectedJourneyType: isQueued ? 'queued' : 'active',
          selectedJourneyIndex: isQueued
            ? Math.max(0, queued.findIndex((q) => (q.id || q._id) === (fr.id || fr._id)))
            : -1,
        },
      }));
    } catch {
      setRowLookup((prev) => ({
        ...prev,
        [index]: {
          loading: false,
          fetched: false,
          direction: entryDirections[index] || 'going',
          fuelRecord: null,
        },
      }));
    }
  };

  // Open cancel modal for an entry - auto-detect direction and checkpoint
  const openCancelModal = async (index: number) => {
    setCancellingEntryIndex(index);
    setDetectedDirection(null);
    setDetectedCancellationPoint(null);
    setDetectionError(null);
    setEntryTypeMessage(null);
    setEntryType(null);
    setDetectedFuelRecordId(null);
    setCancelManualField('');
    setIsDetecting(true);
    setShowCancelModal(true);

    const entry = editedSheet.entries[index];
    const doNo = entry.doNo?.trim().toUpperCase() || '';
    const isNilDO = isSpecialDo(doNo) && doNo !== 'REF' && doNo !== 'DA';
    const isDriverAccount = entry.isDriverAccount === true;
    
    try {
      // Check for Driver Account entries first
      if (isDriverAccount) {
        setEntryType('driver-account');
        setEntryTypeMessage('This is a Driver\'s Account entry (fuel misuse/theft). No fuel record exists or will be affected by this cancellation.');
        setDetectedDirection('going'); // Default, but irrelevant for driver account
        const cancellationPoint = getAutoCancellationPoint(editedSheet.station, 'going');
        setDetectedCancellationPoint(cancellationPoint);
        setIsDetecting(false);
        return;
      }
      
      // Check for NIL DO entries (skip API call to avoid 404)
      if (isNilDO) {
        setEntryType('nil-do');
        setEntryTypeMessage('⚠️ No Delivery Order assigned (NIL). No fuel record was found for this entry. Cancellation will only update this LPO sheet.');
        setDetectionError('No fuel record available - this entry has no valid DO number.');
        setDetectedDirection('going'); // Default fallback
        const cancellationPoint = getAutoCancellationPoint(editedSheet.station, 'going');
        setDetectedCancellationPoint(cancellationPoint);
        setIsDetecting(false);
        return;
      }
      
      // For regular entries with valid DO, try to find the fuel record
      const result = await fuelRecordsAPI.getByDoNumber(entry.doNo);
      
      if (result) {
        setEntryType('regular');
        setEntryTypeMessage('✓ Fuel record found. Cancelling this entry will revert the fuel allocation in the fuel record.');
        setDetectedDirection(result.direction);
        const fr: any = result.fuelRecord;
        setDetectedFuelRecordId(fr?.id ?? fr?._id ?? null);
        const cancellationPoint = getAutoCancellationPoint(editedSheet.station, result.direction);
        setDetectedCancellationPoint(cancellationPoint);
      } else {
        // Valid DO format but no fuel record found
        setEntryType('nil-do');
        setEntryTypeMessage('⚠️ No fuel record found for DO ' + entry.doNo + '. This may be a data inconsistency. Cancellation will only update the LPO.');
        setDetectionError('Fuel record not found for this DO number.');
        setDetectedDirection('going');
        const cancellationPoint = getAutoCancellationPoint(editedSheet.station, 'going');
        setDetectedCancellationPoint(cancellationPoint);
      }
      
    } catch (error) {
      console.error('Error detecting fuel record details:', error);
      // Fallback for unexpected errors
      setEntryType('nil-do');
      setDetectedDirection('going');
      const cancellationPoint = getAutoCancellationPoint(editedSheet.station, 'going');
      setDetectedCancellationPoint(cancellationPoint);
      setDetectionError('Could not verify fuel record. Proceeding with caution.');
      setEntryTypeMessage('⚠️ Unable to verify fuel record status. Cancellation will proceed but may not update fuel allocations.');
    } finally {
      setIsDetecting(false);
    }
  };

  // Handle cancelling an entry
  const handleCancelEntry = async () => {
    if (cancellingEntryIndex === null || !detectedCancellationPoint) {
      toast.error('Unable to determine cancellation point. Please try again.');
      return;
    }

    // When revert automation is OFF, a manual checkpoint must be chosen for regular entries.
    const needsManualCheckpoint = entryType === 'regular' && fuelAutomation?.lpoCancelRevert === false;
    if (needsManualCheckpoint && !cancelManualField) {
      toast.error('Please select the checkpoint to revert the fuel from.');
      return;
    }

    if (isSaving) return;
    setIsSaving(true);

    try {
      // Acquire edit lock before saving
      if (sheet.id) {
        try {
          await lpoDocumentsAPI.acquireLock(sheet.id);
        } catch (err: any) {
          if (err.response?.status === 423) {
            const lockHolder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
            toast.error(`This LPO is being edited by ${lockHolder}.`);
            return;
          }
        }
      }

      const updatedEntries = [...editedSheet.entries];
      updatedEntries[cancellingEntryIndex] = {
        ...updatedEntries[cancellingEntryIndex],
        isCancelled: true,
        cancellationPoint: detectedCancellationPoint
      };

      // Recalculate total (excluding cancelled entries)
      const newTotal = updatedEntries
        .filter(e => !e.isCancelled)
        .reduce((sum, e) => sum + e.amount, 0);

      const targetEntry = updatedEntries[cancellingEntryIndex];
      const updatedSheet: any = {
        ...editedSheet,
        entries: updatedEntries,
        total: newTotal
      };
      // Manual checkpoint override (automation OFF) — backend reverts the chosen column.
      if (needsManualCheckpoint && cancelManualField) {
        updatedSheet.manualCheckpoints = {
          [`${targetEntry.doNo}-${targetEntry.truckNo}`]: cancelManualField,
        };
      }

      // Save to backend
      const savedSheet = await lpoWorkbookAPI.updateSheet(workbookId, sheet.id!, updatedSheet);
      onUpdate(savedSheet);
      setEditedSheet(savedSheet);

      // Generate success message based on entry type
      let successMessage = '✓ Entry cancelled successfully!';
      if (entryType === 'driver-account') {
        successMessage = '✓ Driver Account entry cancelled successfully! (No fuel record affected)';
      } else if (entryType === 'regular') {
        successMessage = '✓ Entry cancelled successfully! Fuel record has been updated.';
      } else if (entryType === 'nil-do') {
        successMessage = '✓ Entry cancelled successfully! (No fuel record was affected)';
      }
      
      setShowCancelModal(false);
      setCancellingEntryIndex(null);
      setDetectedDirection(null);
      setDetectedCancellationPoint(null);
      setEntryType(null);
      setEntryTypeMessage(null);

      await releaseLockIfNeeded();
      toast.success(successMessage);
    } catch (error) {
      console.error('Error cancelling entry:', error);
      await releaseLockIfNeeded();
      toast.error('Error cancelling entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Is this entry a real fuel-record entry (not DA/REF/NIL)? Only these re-deduct
  // fuel on restore and therefore need a manual checkpoint when automation is OFF.
  const isRegularFuelEntry = (entry: any): boolean => {
    const doUp = (entry?.doNo || '').toUpperCase().trim();
    return !entry?.isDriverAccount && !entry?.isRefer &&
      doUp !== 'NIL' && doUp !== 'REF' && doUp !== 'DA' && doUp !== '' && doUp !== 'N/A';
  };

  // Entry point for the Restore button. When lpoCancelRevert automation is OFF and
  // the entry backs a fuel record, prompt for the re-deduct checkpoint; otherwise
  // restore immediately (automation ON, or DA/REF/NIL entries have no fuel record).
  const openRestoreEntry = async (index: number) => {
    const entry = editedSheet.entries[index];
    if (fuelAutomation?.lpoCancelRevert !== false || !isRegularFuelEntry(entry)) {
      await handleUncancelEntry(index);
      return;
    }

    setRestoringEntryIndex(index);
    setRestoreDirection(null);
    setRestoreManualField('');
    setRestoreFuelRecordId(null);
    setRestoreDetecting(true);
    setShowRestoreModal(true);
    try {
      const res = await fuelRecordsAPI.getByDoNumber(entry.doNo);
      if (res) {
        setRestoreDirection(res.direction);
        const fr: any = res.fuelRecord;
        setRestoreFuelRecordId(fr?.id ?? fr?._id ?? null);
      } else {
        setRestoreDirection('going');
      }
    } catch {
      setRestoreDirection('going');
    } finally {
      setRestoreDetecting(false);
    }
  };

  // Handle uncancelling an entry (restore it). When manualField is supplied
  // (automation OFF), it is sent so the backend re-deducts from that column.
  const handleUncancelEntry = async (index: number, manualField?: string) => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      // Acquire edit lock before saving
      if (sheet.id) {
        try {
          await lpoDocumentsAPI.acquireLock(sheet.id);
        } catch (err: any) {
          if (err.response?.status === 423) {
            const lockHolder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
            toast.error(`This LPO is being edited by ${lockHolder}.`);
            return;
          }
        }
      }

      const updatedEntries = [...editedSheet.entries];
      const originalEntry = updatedEntries[index];

      // Preserve the cancellationPoint - backend needs it to update the correct fuel field
      updatedEntries[index] = {
        ...originalEntry,
        isCancelled: false,
        // Keep cancellationPoint - don't set to undefined
        // Backend will use it to know which fuel field to update
      };

      // Recalculate total
      const newTotal = updatedEntries
        .filter(e => !e.isCancelled)
        .reduce((sum, e) => sum + e.amount, 0);

      const updatedSheet: any = {
        ...editedSheet,
        entries: updatedEntries,
        total: newTotal
      };
      // Manual checkpoint override (automation OFF) — backend re-deducts the chosen column.
      if (manualField) {
        updatedSheet.manualCheckpoints = {
          [`${originalEntry.doNo}-${originalEntry.truckNo}`]: manualField,
        };
      }

      // Save to backend
      const savedSheet = await lpoWorkbookAPI.updateSheet(workbookId, sheet.id!, updatedSheet);
      onUpdate(savedSheet);
      setEditedSheet(savedSheet);

      setShowRestoreModal(false);
      setRestoringEntryIndex(null);

      await releaseLockIfNeeded();
      toast.success('Entry restored successfully! Fuel record has been updated.');
    } catch (error) {
      console.error('Error restoring entry:', error);
      await releaseLockIfNeeded();
      toast.error('Error restoring entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm restore from the manual-checkpoint modal.
  const handleConfirmRestore = async () => {
    if (restoringEntryIndex === null) return;
    if (!restoreManualField) {
      toast.error('Please select the checkpoint to re-deduct the fuel from.');
      return;
    }
    await handleUncancelEntry(restoringEntryIndex, restoreManualField);
  };

  // Active regular entries (real fuel record) — the only ones whose fuel is reverted.
  const cancelAllRegularEntries = useMemo(
    () => editedSheet.entries.filter(e => {
      const doUp = (e.doNo || '').toUpperCase().trim();
      return !e.isCancelled && !e.isDriverAccount && !(e as any).isRefer &&
        doUp !== 'NIL' && doUp !== 'REF' && doUp !== 'DA' && doUp !== '' && doUp !== 'N/A' && doUp !== 'PENDING';
    }),
    [editedSheet.entries]
  );

  // Whether the operator must pick revert checkpoints for Cancel-All (automation OFF).
  const cancelAllNeedsManual = fuelAutomation?.lpoCancelRevert === false && cancelAllRegularEntries.length > 0;
  const cancelAllHasGoing = Object.values(cancelAllMeta).some(d => d === 'going');
  const cancelAllHasReturning = Object.values(cancelAllMeta).some(d => d === 'returning');
  const cancelAllManualReady =
    (!cancelAllHasGoing || !!cancelAllRevertGoing) && (!cancelAllHasReturning || !!cancelAllRevertReturning);

  // When the Cancel-All modal opens with automation OFF, resolve each regular
  // truck's direction so we know whether to show going / returning dropdowns.
  useEffect(() => {
    if (!showCancelAllModal || fuelAutomation?.lpoCancelRevert !== false) return;
    let cancelled = false;
    setCancelAllDetecting(true);
    setCancelAllMeta({});
    setCancelAllRevertGoing('');
    setCancelAllRevertReturning('');
    (async () => {
      const meta: Record<string, 'going' | 'returning' | null> = {};
      await Promise.all(cancelAllRegularEntries.map(async (e) => {
        const key = `${e.doNo}-${e.truckNo}`;
        try {
          const res = await fuelRecordsAPI.getByDoNumber(e.doNo);
          meta[key] = res ? res.direction : null;
        } catch {
          meta[key] = null;
        }
      }));
      if (!cancelled) {
        setCancelAllMeta(meta);
        setCancelAllDetecting(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCancelAllModal, fuelAutomation?.lpoCancelRevert]);

  // Handle cancelling ALL active entries in the LPO
  const handleCancelAll = async () => {
    // When automation is OFF, require a checkpoint for each present direction and
    // build the per-truck manual checkpoint map for the backend.
    let manualCheckpoints: Record<string, string> | undefined;
    if (cancelAllNeedsManual) {
      if (!cancelAllManualReady) {
        toast.error('Please select the checkpoint(s) to revert the fuel from.');
        return;
      }
      manualCheckpoints = {};
      for (const e of cancelAllRegularEntries) {
        const key = `${e.doNo}-${e.truckNo}`;
        const dir = cancelAllMeta[key];
        const field = dir === 'returning' ? cancelAllRevertReturning : dir === 'going' ? cancelAllRevertGoing : '';
        if (field) manualCheckpoints[key] = field;
      }
    }

    setIsCancellingAll(true);
    try {
      await lpoDocumentsAPI.cancelAll(editedSheet.id as string, 'Bulk LPO cancellation', manualCheckpoints);
      setShowCancelAllModal(false);
      // Refresh sheet from server to get updated state
      await refreshSheet();
      toast.success(`LPO ${editedSheet.lpoNo} — all entries cancelled successfully`);
    } catch (err: any) {
      toast.error(`Failed to cancel LPO: ${err?.response?.data?.message || err?.message || 'Unknown error'}`);
    } finally {
      setIsCancellingAll(false);
    }
  };

  const handleCancel = async () => {
    setEditedSheet(sheet);
    setIsEditing(false);
    setEditingRow(null);
    await releaseLockIfNeeded();
  };

  // Convert LPOSheet to LPOSummary format
  const convertToLPOSummary = (): LPOSummary => {
    return {
      id: sheet.id,
      lpoNo: editedSheet.lpoNo,
      date: editedSheet.date,
      station: editedSheet.station,
      orderOf: editedSheet.orderOf,
      entries: editedSheet.entries,
      total: editedSheet.total,
      currency: editedSheet.currency,
    };
  };

  // Handle copy LPO image to clipboard
  const handleCopyImageToClipboard = async () => {
    try {
      const lpoSummary = convertToLPOSummary();
      const success = await copyLPOImageToClipboard(lpoSummary, user?.username, sheet.approvedBy);
      
      if (success) {
        toast.success('LPO image copied to clipboard successfully!');
      } else {
        toast.error('Failed to copy LPO image to clipboard. Please try again.');
      }
    } catch (error) {
      console.error('Error copying image to clipboard:', error);
      toast.error('Failed to copy LPO image to clipboard. Your browser may not support this feature.');
    }
    setShowCopyDropdown(false);
  };

  // Handle copy LPO text for WhatsApp
  const handleCopyWhatsAppText = async () => {
    try {
      const lpoSummary = convertToLPOSummary();
      const success = await copyLPOForWhatsApp(lpoSummary);
      
      if (success) {
        toast.success('LPO text for WhatsApp copied to clipboard successfully!');
      } else {
        toast.error('Failed to copy LPO text to clipboard. Please try again.');
      }
    } catch (error) {
      console.error('Error copying WhatsApp text to clipboard:', error);
      toast.error('Failed to copy LPO text to clipboard.');
    }
    setShowCopyDropdown(false);
  };

  // Handle copy LPO as CSV text
  const handleCopyCsvText = async () => {
    try {
      const lpoSummary = convertToLPOSummary();
      const success = await copyLPOTextToClipboard(lpoSummary);
      
      if (success) {
        toast.success('LPO CSV text copied to clipboard successfully!');
      } else {
        toast.error('Failed to copy LPO CSV text to clipboard. Please try again.');
      }
    } catch (error) {
      console.error('Error copying CSV text to clipboard:', error);
      toast.error('Failed to copy LPO CSV text to clipboard.');
    }
    setShowCopyDropdown(false);
  };

  // Handle download LPO as PDF
  const handleDownloadPDF = async () => {
    setDownloadingPdf(true);
    try {
      await lpoDocumentsAPI.downloadPDF(sheet.id!);
      toast.success('LPO PDF downloaded successfully!');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download LPO as PDF. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
    setShowCopyDropdown(false);
  };

  // Handle download LPO as Image
  const handleDownloadImage = async () => {
    setDownloadingImage(true);
    try {
      const lpoSummary = convertToLPOSummary();
      await downloadLPOImage(lpoSummary, undefined, user?.username, sheet.approvedBy);
      toast.success('LPO image downloaded successfully!');
    } catch (error) {
      console.error('Error downloading image:', error);
      toast.error('Failed to download LPO as image. Please try again.');
    } finally {
      setDownloadingImage(false);
    }
    setShowCopyDropdown(false);
  };

  /** Apply a fetched journey onto a sheet row (preserves liters/rate — correction case). */
  const applyJourneyToRow = useCallback(
    (
      index: number,
      result: TruckFetchResult & { truckNo?: string; direction?: 'going' | 'returning' },
      opts?: { direction?: 'going' | 'returning'; preserveTruck?: boolean }
    ) => {
      const direction = opts?.direction || result.direction || 'going';
      const fr = result.fuelRecord;
      if (!fr) return;

      const doNumber =
        direction === 'going' ? result.goingDo || fr.goingDo : result.returnDo || fr.returnDo || fr.goingDo;
      const dest =
        direction === 'going'
          ? result.goingDestination || fr.originalGoingTo || fr.to || 'NIL'
          : result.destination || fr.to || 'NIL';

      setEditedSheet((prev) => {
        const updatedEntries = [...prev.entries];
        const cur = updatedEntries[index];
        if (!cur) return prev;
        const truckNo = opts?.preserveTruck
          ? cur.truckNo
          : formatTruckNumber(result.truckNo || fr.truckNo || cur.truckNo);
        updatedEntries[index] = {
          ...cur,
          truckNo,
          doNo: (doNumber || cur.doNo || '').toString().toUpperCase(),
          dest,
          amount: cur.liters * cur.rate,
        };
        return { ...prev, entries: updatedEntries };
      });

      const queued = result.allJourneys?.queued || [];
      const isQueued = fr.journeyStatus === 'queued';
      const queuedIdx = isQueued
        ? Math.max(0, queued.findIndex((q) => (q.id || q._id) === (fr.id || fr._id)))
        : -1;

      setRowLookup((prev) => ({
        ...prev,
        [index]: {
          loading: false,
          fetched: true,
          direction,
          fuelRecord: fr,
          message: result.message,
          warningType: result.warningType || null,
          allJourneys: result.allJourneys,
          selectedJourneyType: isQueued ? 'queued' : 'active',
          selectedJourneyIndex: isQueued ? queuedIdx : -1,
        },
      }));
      setEntryDirections((prev) => ({ ...prev, [index]: direction }));
    },
    []
  );

  const runTruckLookup = useCallback(
    async (index: number, truckNo: string) => {
      let priorDirection: 'going' | 'returning' = 'going';
      setRowLookup((prev) => {
        priorDirection = prev[index]?.direction || 'going';
        return {
          ...prev,
          [index]: {
            ...(prev[index] || { direction: 'going' as const }),
            loading: true,
            fetched: false,
            fuelRecord: null,
          },
        };
      });
      const result = await fetchTruckForLpo(truckNo, lpoTruckLookupMonths);
      if (!result.success || !result.fuelRecord) {
        setRowLookup((prev) => ({
          ...prev,
          [index]: {
            loading: false,
            fetched: true,
            direction: prev[index]?.direction || priorDirection,
            fuelRecord: result.fuelRecord,
            message: result.message,
            warningType: result.warningType || null,
            allJourneys: result.allJourneys,
          },
        }));
        if (result.message) toast.info(result.message);
        return;
      }
      applyJourneyToRow(
        index,
        { ...result, direction: priorDirection },
        { direction: priorDirection, preserveTruck: true }
      );
      toast.success(result.message || 'Truck journey loaded');
    },
    [applyJourneyToRow, lpoTruckLookupMonths]
  );

  const runDoLookup = useCallback(
    async (index: number, doNo: string) => {
      const doUp = doNo.trim().toUpperCase();
      if (isSpecialDo(doUp)) {
        setRowLookup((prev) => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
        return;
      }
      setRowLookup((prev) => ({
        ...prev,
        [index]: {
          ...(prev[index] || { direction: 'going' as const }),
          loading: true,
          fetched: false,
          fuelRecord: null,
        },
      }));
      const result = await fetchDoForLpo(doUp);
      if (result.ambiguous && result.matches && result.matches.length > 1) {
        setRowLookup((prev) => ({
          ...prev,
          [index]: {
            loading: false,
            fetched: true,
            direction: result.direction || 'going',
            fuelRecord: null,
            message: `DO ${doUp} matches ${result.matches!.length} trucks — pick one`,
            warningType: 'ambiguous_do',
          },
        }));
        setDoAmbiguityModal({ open: true, index, doNo: doUp, matches: result.matches });
        return;
      }
      if (!result.success || !result.fuelRecord) {
        setRowLookup((prev) => ({
          ...prev,
          [index]: {
            loading: false,
            fetched: true,
            direction: result.direction || 'going',
            fuelRecord: null,
            message: result.message,
            warningType: result.warningType || null,
          },
        }));
        if (result.message) toast.info(result.message);
        return;
      }
      applyJourneyToRow(index, result);
      toast.success(result.message || 'DO journey loaded');
    },
    [applyJourneyToRow]
  );

  const handleJourneySelect = (index: number, type: 'active' | 'queued', queuedIndex?: number) => {
    const lookup = rowLookup[index];
    if (!lookup?.allJourneys) return;
    const { active, queued } = lookup.allJourneys;
    let selected: FuelRecord | null = null;
    let journeyIndex = -1;
    if (type === 'active' && active) {
      selected = active;
      journeyIndex = -1;
    } else if (type === 'queued' && queued?.length) {
      const qi = queuedIndex ?? 0;
      if (qi < queued.length) {
        selected = queued[qi];
        journeyIndex = qi;
      }
    }
    if (!selected) return;

    const direction = lookup.direction || 'going';
    applyJourneyToRow(
      index,
      {
        fuelRecord: selected,
        goingDo: selected.goingDo || 'NIL',
        returnDo: selected.returnDo || 'NIL',
        destination: selected.to || 'NIL',
        goingDestination: selected.originalGoingTo || selected.to || 'NIL',
        balance: selected.balance || 0,
        message: type === 'queued' ? `Queued #${selected.queueOrder || journeyIndex + 1}` : 'Active journey',
        success: true,
        allJourneys: lookup.allJourneys,
        truckNo: selected.truckNo,
        direction,
      },
      { direction, preserveTruck: true }
    );
    setRowLookup((prev) => ({
      ...prev,
      [index]: {
        ...prev[index],
        selectedJourneyType: type,
        selectedJourneyIndex: journeyIndex,
        fuelRecord: selected,
      },
    }));
  };

  const handleDirectionToggle = (index: number, direction: 'going' | 'returning') => {
    const lookup = rowLookup[index];
    const fr = lookup?.fuelRecord;
    if (!fr) {
      toast.info('Loading journey… try again in a moment.');
      return;
    }
    if (direction === 'returning') {
      const rd = (fr.returnDo || '').trim().toUpperCase();
      if (!rd || rd === 'NIL' || rd === 'N/A') {
        toast.error('This journey has no return DO yet — cannot switch to returning.');
        return;
      }
    }
    // Updates DO/dest for the toggled direction; liters/rate stay as the user left them
    // so save reverts old checkpoint liters and deducts current (possibly edited) liters
    // onto the new direction checkpoint.
    applyJourneyToRow(
      index,
      {
        fuelRecord: fr,
        goingDo: fr.goingDo || 'NIL',
        returnDo: fr.returnDo || 'NIL',
        destination: fr.to || 'NIL',
        goingDestination: fr.originalGoingTo || fr.to || 'NIL',
        balance: fr.balance || 0,
        message: lookup.message || '',
        success: true,
        allJourneys: lookup.allJourneys,
        truckNo: fr.truckNo,
        direction,
      },
      { direction, preserveTruck: true }
    );
    setEntryDirections((prev) => ({ ...prev, [index]: direction }));
  };

  const handleEntryEdit = (index: number, field: keyof LPODetail, value: string | number) => {
    const updatedEntries = [...editedSheet.entries];
    
    // Format truck number to standard format
    const processedValue = field === 'truckNo' ? formatTruckNumber(value as string) : value;
    
    updatedEntries[index] = {
      ...updatedEntries[index],
      [field]: processedValue
    };

    // Recalculate amount if liters or rate changed
    if (field === 'liters' || field === 'rate') {
      updatedEntries[index].amount = updatedEntries[index].liters * updatedEntries[index].rate;
    }

    setEditedSheet(prev => ({
      ...prev,
      entries: updatedEntries
    }));

    // Debounced journey fetch for truck / DO corrections — never for DA / REF / NIL
    if (field === 'truckNo' || field === 'doNo') {
      if (lookupTimers.current[index]) clearTimeout(lookupTimers.current[index]);
      const entryAfterEdit = updatedEntries[index];
      if (isNonFuelEntry(entryAfterEdit)) {
        setRowLookup((prev) => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
        return;
      }
      const raw = String(processedValue || '').trim();
      if (field === 'doNo' && isSpecialDo(raw)) {
        setRowLookup((prev) => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
        return;
      }
      if (raw.length < 3) return;
      lookupTimers.current[index] = setTimeout(() => {
        if (field === 'truckNo') void runTruckLookup(index, raw);
        else void runDoLookup(index, raw.toUpperCase());
      }, 350);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Prefer stored LPO currency; fall back to station-name heuristic (same as LPOPrint)
  const sheetCurrency: 'USD' | 'TZS' = editedSheet.currency || (() => {
    const upper = (editedSheet.station || '').toUpperCase();
    return (upper.startsWith('LAKE') && !upper.includes('TUNDUMA')) ? 'USD' : 'TZS';
  })();
  const currencyPrefix = sheetCurrency === 'USD' ? '$' : 'TZS';
  const formatMoney = (amount: number): string =>
    `${currencyPrefix} ${formatCurrency(amount)}`;

  // Filtered entries for search — carries originalIndex so all handlers use the correct full-array position
  const visibleEntries = editedSheet.entries
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .filter(({ entry }) => {
      if (!entrySearch.trim()) return true;
      const term = entrySearch.toLowerCase();
      return (
        (entry.truckNo || '').toLowerCase().includes(term) ||
        (entry.doNo || '').toLowerCase().includes(term) ||
        (entry.dest || '').toLowerCase().includes(term)
      );
    });

  const rowNeedsJourneyPicker = (index: number) => {
    const lookup = rowLookup[index];
    if (!lookup?.allJourneys) return false;
    return (
      (lookup.allJourneys.active && lookup.allJourneys.queued.length > 0) ||
      (!lookup.allJourneys.active && lookup.allJourneys.queued.length > 1)
    );
  };

  const renderRowLookupPanel = (index: number) => {
    const lookup = rowLookup[index];
    if (!lookup || !rowNeedsJourneyPicker(index) || !lookup.allJourneys) return null;

    // Status column already shows loading + Found/Balance message; panel is journey picker only.
    return (
      <div className="mt-2 space-y-2 col-span-full">
        <div className="flex flex-wrap gap-1.5">
          {lookup.allJourneys.active && (
            <button
              type="button"
              onClick={() => handleJourneySelect(index, 'active')}
              className={`px-2 py-1 rounded text-[10px] font-bold border ${
                lookup.selectedJourneyType === 'active'
                  ? 'bg-green-500 text-white border-green-600'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600'
              }`}
            >
              Active · {lookup.allJourneys.active.goingDo}
            </button>
          )}
          {lookup.allJourneys.queued.map((qJ, qIdx) => (
            <button
              key={qJ.id || qJ._id || qIdx}
              type="button"
              onClick={() => handleJourneySelect(index, 'queued', qIdx)}
              className={`px-2 py-1 rounded text-[10px] font-bold border ${
                lookup.selectedJourneyType === 'queued' && lookup.selectedJourneyIndex === qIdx
                  ? 'bg-blue-500 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600'
              }`}
            >
              Queued #{qJ.queueOrder || qIdx + 1} · {qJ.goingDo}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderDirectionCell = (entry: LPODetail, index: number) => {
    const special = specialModeLabel(entry);
    if (special) {
      const color =
        special === 'DA'
          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
          : special === 'REF'
            ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
            : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
      return (
        <span className={`inline-block px-1.5 py-0.5 rounded font-medium ${color}`}>
          {special}
        </span>
      );
    }

    const dir = rowLookup[index]?.direction ?? entryDirections[index] ?? null;
    const editing = editingRow === index;
    const canToggle = editing && !!rowLookup[index]?.fuelRecord;

    if (canToggle) {
      return (
        <div className="inline-flex items-center justify-center rounded overflow-hidden border border-gray-300 dark:border-gray-600 text-[11px] leading-none mx-auto">
          <button
            type="button"
            onClick={() => handleDirectionToggle(index, 'going')}
            className={`px-1.5 py-1 font-medium transition-colors ${
              dir === 'going'
                ? 'bg-green-500 text-white'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-900/20'
            }`}
          >
            Going
          </button>
          <button
            type="button"
            onClick={() => handleDirectionToggle(index, 'returning')}
            className={`px-1.5 py-1 font-medium transition-colors border-l border-gray-300 dark:border-gray-600 ${
              dir === 'returning'
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20'
            }`}
          >
            Return
          </button>
        </div>
      );
    }

    if (!dir) {
      return <span className="font-medium text-gray-400 dark:text-gray-500">—</span>;
    }
    return (
      <span
        className={`inline-block px-1.5 py-0.5 rounded font-medium ${
          dir === 'returning'
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
            : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
        }`}
      >
        {dir === 'returning' ? 'Return' : 'Going'}
      </span>
    );
  };

  const renderStatusCell = (entry: LPODetail, index: number) => {
    if (specialModeLabel(entry)) {
      return <span className="font-medium text-gray-400 dark:text-gray-500">—</span>;
    }
    const lookup = rowLookup[index];
    if (editingRow === index && lookup?.loading) {
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 mx-auto" />;
    }
    // Prefer journey lookup message in Status (e.g. Found: DO …, Balance: …)
    if (editingRow === index && lookup?.message) {
      return (
        <span
          className={`block w-full max-w-full truncate whitespace-nowrap text-[11px] font-medium text-center ${
            lookup.warningType
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-green-700 dark:text-green-400'
          }`}
          title={lookup.message}
        >
          {lookup.message}
        </span>
      );
    }
    const type = lookup?.selectedJourneyType;
    const fr = lookup?.fuelRecord;
    if (type === 'queued' || fr?.journeyStatus === 'queued') {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
          Queued{fr?.queueOrder != null ? ` #${fr.queueOrder}` : ''}
        </span>
      );
    }
    if (type === 'active' || fr?.journeyStatus === 'active' || (lookup?.fetched && fr)) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
          Active
        </span>
      );
    }
    return <span className="font-medium text-gray-400 dark:text-gray-500">—</span>;
  };

  const openContextModal = (index: number, readOnly: boolean) => {
    const entry = editedSheet.entries[index];
    setContextModal({
      open: true,
      index,
      text: entry?.context || '',
      readOnly: readOnly && editingRow !== index,
    });
  };

  const saveContextModal = () => {
    if (contextModal.index === null) return;
    const idx = contextModal.index;
    const text = contextModal.text.trim();
    const nextEntries = editedSheet.entries.map((e, i) =>
      i === idx ? { ...e, context: text || null } : e
    );
    setEditedSheet((prev) => ({ ...prev, entries: nextEntries }));
    setContextModal({ open: false, index: null, text: '', readOnly: false });

    if (editingRow === idx) {
      toast.success(text ? 'Context saved on this entry — click Save to commit.' : 'Context cleared — click Save to commit.');
      return;
    }
    void (async () => {
      try {
        const next = { ...editedSheet, entries: nextEntries };
        const updated = await lpoWorkbookAPI.updateSheet(workbookId, sheet.id!, next);
        onUpdate(updated);
        setEditedSheet(updated);
        toast.success(text ? 'Context saved.' : 'Context cleared.');
      } catch {
        toast.error('Failed to save context.');
      }
    })();
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 transition-colors relative">
      {/* Loading overlay for server fetch */}
      {isFetchingSheet && (
        <div className="absolute inset-0 bg-white/60 dark:bg-gray-800/60 flex items-center justify-center z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {/* Mobile Header */}
      <div className="lg:hidden bg-gradient-to-br from-[#1d4ed8] to-[#1e3a8a] px-[18px] pt-[14px] pb-[22px] rounded-b-[26px] relative" style={{boxShadow: '0 12px 28px -14px rgba(30,58,138,0.6)'}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
            {onBack && (
              <button onClick={onBack} style={{width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)'}}>
                <X className="w-4 h-4 text-[#c4cedd]" />
              </button>
            )}
            <div className="text-[17px] font-extrabold text-white tracking-tight">LPO {editedSheet.lpoNo}</div>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowCopyDropdown(!showCopyDropdown)}
              style={{width: '38px', height: '38px', borderRadius: '11px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)'}}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c4cedd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
              </svg>
            </button>
            {showCopyDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50">
                <div className="py-1">
                  <div className="px-3 py-2 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Copy</div>
                  <button onClick={handleCopyImageToClipboard} className="flex items-center w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Image className="w-4 h-4 mr-3 text-gray-400" />Copy as Image
                  </button>
                  <button onClick={handleCopyWhatsAppText} className="flex items-center w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <MessageSquare className="w-4 h-4 mr-3 text-gray-400" />Copy for WhatsApp
                  </button>
                  <button onClick={handleCopyCsvText} className="flex items-center w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Calculator className="w-4 h-4 mr-3 text-gray-400" />Copy as CSV Text
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                  <div className="px-3 py-2 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Download</div>
                  <button onClick={handleDownloadPDF} disabled={downloadingPdf} className="flex items-center w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                    {downloadingPdf ? <Loader2 className="w-4 h-4 mr-3 text-red-500 animate-spin" /> : <FileDown className="w-4 h-4 mr-3 text-red-500" />}
                    {downloadingPdf ? 'Downloading...' : 'Download as PDF'}
                  </button>
                  <button onClick={handleDownloadImage} disabled={downloadingImage} className="flex items-center w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                    {downloadingImage ? <Loader2 className="w-4 h-4 mr-3 text-green-500 animate-spin" /> : <Download className="w-4 h-4 mr-3 text-green-500" />}
                    {downloadingImage ? 'Downloading...' : 'Download as Image'}
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                  <button onClick={handleStartEdit} className="flex items-center w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <PenSquare className="w-4 h-4 mr-3 text-blue-500" />Edit LPO
                  </button>
                  {editedSheet.entries.some(e => !e.isCancelled) && (
                    <button onClick={() => { setShowCopyDropdown(false); setShowCancelAllModal(true); }} className="flex items-center w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                      <XCircle className="w-4 h-4 mr-3" />Cancel LPO
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <div className="text-[9.5px] font-semibold tracking-[0.1em] uppercase text-[#bfdbfe] mb-[3px]">Station</div>
            <div className="text-[13.5px] font-bold text-[#eef2f8]">{editedSheet.station}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-semibold tracking-[0.1em] uppercase text-[#bfdbfe] mb-[3px]">Date</div>
            <div className="text-[13.5px] font-bold text-[#eef2f8]">{new Date(editedSheet.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-semibold tracking-[0.1em] uppercase text-[#bfdbfe] mb-[3px]">Order Of</div>
            <div className="text-[13.5px] font-bold text-[#eef2f8]">{editedSheet.orderOf}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-semibold tracking-[0.1em] uppercase text-[#bfdbfe] mb-[3px]">Grand Total</div>
            <div className="text-[13.5px] font-extrabold text-[#4ade80] tabular-nums">{formatMoney(editedSheet.total)}</div>
          </div>
        </div>
      </div>

      {/* Sheet Header - Desktop Only */}
      <div className="hidden lg:block border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2">
        {/* Desktop: single row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-x-4">
          {/* LPO details - wrap on mobile */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5">
            <div className="flex items-center space-x-1.5">
              <span className="font-medium text-gray-700 dark:text-gray-300 text-xs">LPO No.:</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editedSheet.lpoNo}
                  onChange={(e) => handleHeaderEdit('lpoNo', e.target.value)}
                  className="px-2 py-1 border dark:border-gray-600 rounded font-bold text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-20"
                />
              ) : (
                <span className="font-bold text-sm text-blue-600 dark:text-blue-400">{editedSheet.lpoNo}</span>
              )}
            </div>
            
            <div className="flex items-center space-x-1.5">
              <span className="font-medium text-gray-700 dark:text-gray-300 text-xs">Station:</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editedSheet.station}
                  onChange={(e) => handleHeaderEdit('station', e.target.value)}
                  className="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                />
              ) : (
                <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{editedSheet.station}</span>
              )}
            </div>
            
            <div className="flex items-center space-x-1.5">
              <span className="font-medium text-gray-700 dark:text-gray-300 text-xs">Date:</span>
              {isEditing ? (
                <input
                  type="date"
                  value={editedSheet.date}
                  onChange={(e) => handleHeaderEdit('date', e.target.value)}
                  className="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                />
              ) : (
                <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{new Date(editedSheet.date).toLocaleDateString()}</span>
              )}
            </div>
            
            <div className="flex items-center space-x-1.5">
              <span className="font-medium text-gray-700 dark:text-gray-300 text-xs">Order of:</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editedSheet.orderOf}
                  onChange={(e) => handleHeaderEdit('orderOf', e.target.value)}
                  className="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                />
              ) : (
                <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{editedSheet.orderOf}</span>
              )}
            </div>
            
            <span className="hidden lg:inline text-xs text-gray-600 dark:text-gray-400 font-medium border-l border-gray-300 dark:border-gray-600 pl-4">KINDLY SUPPLY THE FOLLOWING LITERS</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-1.5 flex-shrink-0">
            {/* Search input - visible on all viewports */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={entrySearch}
                onChange={(e) => setEntrySearch(e.target.value)}
                placeholder="Search truck, DO..."
                className="pl-8 pr-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 w-32 sm:w-40"
              />
            </div>

            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  className="flex items-center px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                >
                  <Save className="w-3.5 h-3.5 mr-1" />
                  Save Changes
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Cancel
                </button>
              </>
            ) : (
              <>
                {/* Copy/Download Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowCopyDropdown(!showCopyDropdown)}
                    className="flex items-center px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copy / Download
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </button>
                  
                  {showCopyDropdown && (
                    <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10">
                      <div className="py-1">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                          Copy Options
                        </div>
                        <button
                          onClick={handleCopyImageToClipboard}
                          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Image className="w-4 h-4 mr-2" />
                          Copy as Image
                        </button>
                        <button
                          onClick={handleCopyWhatsAppText}
                          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Copy for WhatsApp
                        </button>
                        <button
                          onClick={handleCopyCsvText}
                          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Calculator className="w-4 h-4 mr-2" />
                          Copy as CSV Text
                        </button>
                        
                        <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>
                        
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                          Download Options
                        </div>
                        <button
                          onClick={handleDownloadPDF}
                          disabled={downloadingPdf}
                          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {downloadingPdf ? (
                            <Loader2 className="w-4 h-4 mr-2 text-red-600 animate-spin" />
                          ) : (
                            <FileDown className="w-4 h-4 mr-2 text-red-600" />
                          )}
                          {downloadingPdf ? 'Downloading...' : 'Download as PDF'}
                        </button>
                        <button
                          onClick={handleDownloadImage}
                          disabled={downloadingImage}
                          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {downloadingImage ? (
                            <Loader2 className="w-4 h-4 mr-2 text-green-600 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4 mr-2 text-green-600" />
                          )}
                          {downloadingImage ? 'Downloading...' : 'Download as Image'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={handleStartEdit}
                  className="flex items-center px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  <PenSquare className="w-3.5 h-3.5 mr-1" />
                  Edit LPO
                </button>

                {/* Cancel All LPO button - only show if there are active entries */}
                {editedSheet.entries.some(e => !e.isCancelled) && (
                  <button
                    onClick={() => setShowCancelAllModal(true)}
                    className="flex items-center px-2 py-1 text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/40 text-sm"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Cancel LPO
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cancellation Report Banner */}
      {cancellationReport && cancellationReport.cancelledTrucks.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-3 py-2">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-800 dark:text-red-300 text-sm">
                    {cancellationReport.isFullyCancelled 
                      ? 'LPO Fully Cancelled' 
                      : 'Partial Cancellation'}
                  </h4>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                    {cancellationReport.reportText}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={handleCopyCancellationReport}
                  className="flex items-center px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800/40 text-xs"
                >
                  <Clipboard className="w-3 h-3 mr-1" />
                  Copy Report
                </button>
                <button
                  onClick={() => setShowCancellationReport(!showCancellationReport)}
                  className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-xs underline"
                >
                  {showCancellationReport ? 'Hide' : 'Show'} Details
                </button>
              </div>
            </div>
            
            {showCancellationReport && (
              <div className="mt-2 bg-white dark:bg-gray-800 rounded border border-red-200 dark:border-red-800 p-2">
                <h5 className="font-medium text-red-800 dark:text-red-300 mb-1 text-xs">Cancelled Trucks:</h5>
                <ul className="space-y-0.5 text-xs text-red-700 dark:text-red-400">
                  {cancellationReport.cancelledTrucks.map((truck, idx) => (
                    <li key={idx} className="flex items-center space-x-2">
                      <span className="font-medium">{truck.truckNo}</span>
                      <span className="text-red-500 dark:text-red-400">-</span>
                      <span>DO: {truck.doNo}</span>
                      <span className="text-red-500 dark:text-red-400">-</span>
                      <span>{truck.liters}L</span>
                    </li>
                  ))}
                </ul>
                {cancellationReport.activeTrucks.length > 0 && (
                  <>
                    <h5 className="font-medium text-green-800 dark:text-green-300 mt-2 mb-1 text-xs">Active Trucks:</h5>
                    <ul className="space-y-0.5 text-xs text-green-700 dark:text-green-400">
                      {cancellationReport.activeTrucks.map((truck, idx) => (
                        <li key={idx} className="flex items-center space-x-2">
                          <span className="font-medium">{truck.truckNo}</span>
                          <span>-</span>
                          <span>DO: {truck.doNo}</span>
                          <span>-</span>
                          <span>{truck.liters}L</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
        </div>
      )}

      {/* Pick-up-at selection toolbar */}
      {selectedIndices.size > 0 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800">
          <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
            {selectedIndices.size} truck{selectedIndices.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={selectAllPickable}
              className="px-2 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
            >
              Select all active
            </button>
            <button
              onClick={clearSelection}
              className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Clear
            </button>
            <button
              onClick={handleOpenPickup}
              className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" /> Pick up at…
            </button>
          </div>
        </div>
      )}

      {/* Sheet Content */}
      <div className="flex-1 overflow-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">

        {/* ===== MOBILE VIEW (lg:hidden) ===== */}
        <div className="lg:hidden bg-white dark:bg-gray-800 min-h-full">

          {/* Search */}
          <div className="px-4 pt-4 pb-1.5">
            <div className="relative">
              <Search className="absolute left-[14px] top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={entrySearch}
                onChange={(e) => setEntrySearch(e.target.value)}
                placeholder="Search truck, DO or destination"
                className="w-full h-[46px] pl-[40px] pr-4 border border-gray-300 dark:border-gray-600 rounded-[14px] bg-white dark:bg-gray-700 text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>
          </div>

          {/* Section label */}
          <div className="flex items-center justify-between px-[18px] py-2">
            <div className="text-[12px] font-extrabold tracking-[0.06em] uppercase text-gray-500 dark:text-gray-400">Trucks</div>
            <div className="text-[11px] font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-[9px] py-[3px] rounded-full">
              {editedSheet.entries.length} total
            </div>
          </div>

          {/* Entry cards */}
          <div className="flex flex-col gap-3 px-4 pb-2">
            {visibleEntries.map(({ entry, originalIndex }) => {
              const isCancelled = entry.isCancelled;
              const isDriverAccount = entry.isDriverAccount;
              const isHighlighted = highlightedTruckNo !== null && (entry.truckNo || '').toLowerCase() === highlightedTruckNo.toLowerCase();
              return (
                <div
                  key={originalIndex}
                  ref={(el) => {
                    if (el) entryRowRefs.current.set(originalIndex, el);
                    else entryRowRefs.current.delete(originalIndex);
                  }}
                  className={`border rounded-xl transition-all ${
                    isHighlighted
                      ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-400 dark:ring-blue-500'
                      : isCancelled
                      ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                      : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50'
                  }`}
                  style={{ opacity: isCancelled ? 0.85 : 1 }}
                >
                  {editingRow === originalIndex ? (
                    <div className="p-4 space-y-3">
                      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'}}>
                        <span className="text-[10px] font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Editing Entry</span>
                        <div style={{display: 'flex', gap: '8px', flexShrink: 0}}>
                          <button onClick={() => requestRowSave(originalIndex)} disabled={isSaving} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                            <Save className="w-3.5 h-3.5" />{isSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => handleRowCancel(originalIndex)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-bold bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                            <X className="w-3.5 h-3.5" />Cancel
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">Truck No.</label>
                          <input type="text" value={entry.truckNo} onChange={(e) => handleEntryEdit(originalIndex, 'truckNo', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">Direction</label>
                          <div className="min-h-[42px] flex items-center">{renderDirectionCell(entry, originalIndex)}</div>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">DO No.</label>
                          <input type="text" value={entry.doNo} onChange={(e) => handleEntryEdit(originalIndex, 'doNo', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">Status</label>
                          <div className="min-h-[42px] flex items-center">{renderStatusCell(entry, originalIndex)}</div>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">Liters</label>
                          <input type="number" value={entry.liters} onChange={(e) => handleEntryEdit(originalIndex, 'liters', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">Rate</label>
                          <input type="number" step="0.1" value={entry.rate} onChange={(e) => handleEntryEdit(originalIndex, 'rate', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">Destination</label>
                          <input type="text" value={entry.dest} onChange={(e) => handleEntryEdit(originalIndex, 'dest', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                        </div>
                      </div>
                      {renderRowLookupPanel(originalIndex)}
                    </div>
                  ) : (
                    <div className="p-[15px]">
                      {/* Truck + pill / Amount */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isPickable(entry) && (
                              <input
                                type="checkbox"
                                checked={selectedIndices.has(originalIndex)}
                                onChange={() => toggleSelect(originalIndex)}
                                className="w-4 h-4 accent-indigo-600 flex-shrink-0"
                                title="Select for pick-up-at"
                              />
                            )}
                            <span className={`text-[17px] font-extrabold tracking-tight ${isCancelled ? 'line-through text-red-500 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                              {entry.truckNo}
                            </span>
                            <span className={`text-[9.5px] font-bold tracking-[0.05em] uppercase px-2 py-0.5 rounded-full ${
                              isCancelled
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                                : isDriverAccount
                                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
                                  : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                            }`}>
                              {isCancelled ? 'Cancelled' : isDriverAccount ? 'Driver A/C' : 'Verified'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-[5px] text-[12px] font-semibold text-gray-500 dark:text-gray-400">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>
                            </svg>
                            <span>DO {isDriverAccount ? 'NIL' : entry.doNo}</span>
                            <span className="text-gray-300 dark:text-gray-600">•</span>
                            <span className="text-gray-600 dark:text-gray-300">{entry.dest}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-[9px] font-bold tracking-[0.08em] uppercase text-gray-500 dark:text-gray-400">Amount</div>
                          <div className={`text-[18px] font-extrabold tabular-nums leading-tight ${isCancelled ? 'line-through text-red-500 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                            {formatMoney(entry.amount)}
                          </div>
                        </div>
                      </div>
                      {/* Stat strip */}
                      <div className="flex gap-[10px] mt-[13px]">
                        <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[11px] px-3 py-[9px]">
                          <div className="text-[9px] font-bold tracking-[0.07em] uppercase text-gray-500 dark:text-gray-400 mb-[2px]">Liters</div>
                          <div className="text-[14px] font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">
                            {entry.originalLiters != null && entry.originalLiters !== entry.liters && (
                              <span className="line-through text-gray-400 dark:text-gray-500 mr-1 text-xs">{entry.originalLiters.toFixed(2)}</span>
                            )}
                            {entry.liters.toFixed(2)}{' '}<span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">L</span>
                          </div>
                        </div>
                        <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[11px] px-3 py-[9px]">
                          <div className="text-[9px] font-bold tracking-[0.07em] uppercase text-gray-500 dark:text-gray-400 mb-[2px]">Rate</div>
                          <div className="text-[14px] font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">
                            {entry.rate}{' '}<span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">/L</span>
                          </div>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex gap-[9px] mt-[13px]">
                        {isCancelled ? (
                          <button onClick={() => openRestoreEntry(originalIndex)} disabled={isSaving} className="flex-1 flex items-center justify-center gap-[7px] h-[42px] rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-[13px] font-bold hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50">
                            <RotateCcw className="w-[15px] h-[15px]" />Restore Entry
                          </button>
                        ) : (
                          <>
                            <button onClick={() => handleStartRowEdit(originalIndex)} className="flex-1 flex items-center justify-center gap-[7px] h-[42px] rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[13px] font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30">
                              <PenSquare className="w-[15px] h-[15px]" />Modify
                            </button>
                            <button onClick={() => openCancelModal(originalIndex)} className="flex-1 flex items-center justify-center gap-[7px] h-[42px] rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 text-[13px] font-bold hover:bg-orange-100 dark:hover:bg-orange-900/30">
                              <XCircle className="w-[15px] h-[15px]" />Void
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Empty state */}
          {visibleEntries.length === 0 && entrySearch.trim() && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Search className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <div className="text-[13px] font-semibold mt-2">No trucks match your search</div>
              <button onClick={() => setEntrySearch('')} className="mt-[10px] bg-transparent border-none text-[13px] font-bold text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">
                Clear search
              </button>
            </div>
          )}

          {/* Locked notice */}
          <div className="flex items-center justify-center gap-2 mx-4 my-2 p-[11px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-[13px] text-amber-700 dark:text-amber-300">
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-[11.5px] font-semibold">Sheet locked — editing existing entries only</span>
          </div>

          {/* Spacer for sticky bar */}
          <div className="h-24" />
        </div>

        {/* ===== DESKTOP VIEW (hidden lg:block) ===== */}
        <div className="hidden lg:block w-full px-3 py-4 xl:px-4">
          <div className="w-full">
            <div className="border border-gray-300 dark:border-gray-700 rounded-lg overflow-x-auto">

            {/* Table Header */}
            <div className="bg-blue-50 dark:bg-blue-900/30 border-b border-gray-300 dark:border-gray-700 min-w-[1480px]">
              <div className={sheetGridClass}>
                <div className={`${sheetCell}`}>
                  {(() => {
                    const pickableCount = editedSheet.entries.filter(isPickable).length;
                    return (
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-indigo-600"
                        disabled={pickableCount === 0}
                        checked={pickableCount > 0 && selectedIndices.size === pickableCount}
                        onChange={(e) => (e.target.checked ? selectAllPickable() : clearSelection())}
                        title="Select all active trucks"
                      />
                    );
                  })()}
                </div>
                <div className={`${sheetCell} ${sheetCellText}`}>DO No.</div>
                <div className={`${sheetCell} ${sheetCellText}`}>Truck No.</div>
                <div className={`${sheetCell} ${sheetCellText}`}>Direction</div>
                <div className={`${sheetCell} ${sheetCellText}`}>Liters</div>
                <div className={`${sheetCell} ${sheetCellText}`}>Rate</div>
                <div className={`${sheetCell} ${sheetCellText}`}>Amount</div>
                <div className={`${sheetCell} ${sheetCellText}`}>Dest.</div>
                <div className={`${sheetCell} ${sheetCellText}`}>Checkpoint</div>
                <div className={`${sheetCell} ${sheetCellText}`}>Status</div>
                <div className={`${sheetCell} ${sheetCellText}`}>Picked at</div>
                <div className={`${sheetCell} ${sheetCellText}`}>Context</div>
                <div className={`${sheetCellLast} ${sheetCellText}`}>Actions</div>
              </div>
            </div>

            {/* Table Body - Existing Entries */}
            {visibleEntries.map(({ entry, originalIndex }) => {
              const displayData = formatEntryForDisplay(entry);
              const isCancelled = entry.isCancelled;
              const isDriverAccount = entry.isDriverAccount;
              const isHighlighted = highlightedTruckNo !== null && (entry.truckNo || '').toLowerCase() === highlightedTruckNo.toLowerCase();

              // Row styling based on entry state
              const rowClass = isHighlighted
                ? 'bg-blue-50 dark:bg-blue-900/20 border-b border-blue-300 dark:border-blue-700 ring-1 ring-inset ring-blue-400 dark:ring-blue-500'
                : isCancelled
                ? 'bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800'
                : isDriverAccount
                  ? 'bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800'
                  : 'border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800';

              return (
              <div
                key={originalIndex}
                ref={(el) => {
                  if (el) entryRowRefs.current.set(originalIndex, el);
                  else entryRowRefs.current.delete(originalIndex);
                }}
                className={rowClass}
              >
                <div className={sheetGridClass}>
                  <div className={sheetCell}>
                    {isPickable(entry) && editingRow !== originalIndex && (
                      <input
                        type="checkbox"
                        checked={selectedIndices.has(originalIndex)}
                        onChange={() => toggleSelect(originalIndex)}
                        className="w-4 h-4 accent-indigo-600"
                        title="Select for pick-up-at"
                      />
                    )}
                  </div>
                  <div className={sheetCell}>
                    {editingRow === originalIndex ? (
                      <input
                        type="text"
                        value={entry.doNo}
                        onChange={(e) => handleEntryEdit(originalIndex, 'doNo', e.target.value)}
                        className={`w-full px-1 py-0.5 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-center ${sheetCellText}`}
                      />
                    ) : (
                      <span
                        className={`${sheetCellText} ${displayData.displayClass} truncate max-w-full`}
                        title={isCancelled ? 'CANCELLED' : isDriverAccount ? 'NIL' : entry.doNo}
                      >
                        {isCancelled ? 'CANCELLED' : isDriverAccount ? 'NIL' : entry.doNo}
                      </span>
                    )}
                  </div>

                  <div className={sheetCell}>
                    {editingRow === originalIndex ? (
                      <input
                        type="text"
                        value={entry.truckNo}
                        onChange={(e) => handleEntryEdit(originalIndex, 'truckNo', e.target.value)}
                        className={`w-full px-1 py-0.5 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-center ${sheetCellText}`}
                      />
                    ) : (
                      <span
                        className={`${sheetCellText} ${isCancelled ? 'text-red-600 dark:text-red-400' : ''} truncate max-w-full`}
                        title={entry.truckNo}
                      >
                        {entry.truckNo}
                      </span>
                    )}
                  </div>

                  <div className={sheetCell}>
                    {renderDirectionCell(entry, originalIndex)}
                  </div>

                  <div className={sheetCell}>
                    {editingRow === originalIndex ? (
                      <input
                        type="number"
                        value={entry.liters}
                        onChange={(e) => handleEntryEdit(originalIndex, 'liters', parseFloat(e.target.value) || 0)}
                        className={`w-full px-1 py-0.5 border dark:border-gray-600 rounded text-center bg-white dark:bg-gray-700 ${sheetCellText} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                      />
                    ) : (
                      <span className="inline-flex items-center justify-center gap-1 max-w-full">
                        {entry.originalLiters != null && entry.originalLiters !== entry.liters && (
                          <span className={`${sheetCellMuted} line-through truncate`}>{entry.originalLiters}</span>
                        )}
                        <span className={`${sheetCellText} ${isCancelled ? 'text-red-600 dark:text-red-400 line-through' : ''} truncate`}>{entry.liters}</span>
                      </span>
                    )}
                  </div>

                  <div className={sheetCell}>
                    {editingRow === originalIndex ? (
                      <input
                        type="number"
                        step="0.1"
                        value={entry.rate}
                        onChange={(e) => handleEntryEdit(originalIndex, 'rate', parseFloat(e.target.value) || 0)}
                        className={`w-full px-1 py-0.5 border dark:border-gray-600 rounded text-center bg-white dark:bg-gray-700 ${sheetCellText} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                      />
                    ) : (
                      <span className={`${sheetCellText} ${isCancelled ? 'text-red-600 dark:text-red-400 line-through' : ''} truncate max-w-full`}>
                        {entry.rate}
                      </span>
                    )}
                  </div>

                  <div className={sheetCell}>
                    <span
                      className={`${sheetCellText} ${isCancelled ? 'text-red-600 dark:text-red-400 line-through' : ''} truncate max-w-full`}
                      title={formatCurrency(entry.amount)}
                    >
                      {formatCurrency(entry.amount)}
                    </span>
                  </div>

                  <div className={sheetCell}>
                    {editingRow === originalIndex ? (
                      <input
                        type="text"
                        value={entry.dest}
                        onChange={(e) => handleEntryEdit(originalIndex, 'dest', e.target.value)}
                        className={`w-full px-1 py-0.5 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-center ${sheetCellText}`}
                      />
                    ) : (
                      <span
                        className={`${sheetCellText} ${displayData.displayClass} truncate max-w-full`}
                        title={isCancelled ? entry.dest : isDriverAccount ? 'NIL' : entry.dest}
                      >
                        {isCancelled ? entry.dest : isDriverAccount ? 'NIL' : entry.dest}
                      </span>
                    )}
                  </div>

                  <div className={sheetCell}>
                    <span
                      className={`${sheetCellText} truncate max-w-full whitespace-nowrap`}
                      title={checkpointFieldLabel(entry.dispensedCheckpoint) || entry.dispensedCheckpoint || undefined}
                    >
                      {checkpointFieldLabel(entry.dispensedCheckpoint)}
                    </span>
                  </div>

                  <div className={sheetCell}>
                    {renderStatusCell(entry, originalIndex)}
                  </div>

                  <div className={sheetCell}>
                    {entry.pickedAtStation ? (
                      <span
                        className="text-[10px] font-bold text-teal-700 dark:text-teal-300 text-center truncate max-w-full whitespace-nowrap"
                        title={`Ordered at ${editedSheet.station} · filled at ${entry.pickedAtStation}`}
                      >
                        {entry.pickedAtStation}
                      </span>
                    ) : (
                      <span className={sheetCellMuted}>—</span>
                    )}
                  </div>

                  <div className={sheetCell}>
                    {entry.context ? (
                      <button
                        type="button"
                        onClick={() => openContextModal(originalIndex, editingRow !== originalIndex)}
                        className="p-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded"
                        title="View context"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    ) : editingRow === originalIndex ? (
                      <button
                        type="button"
                        onClick={() => openContextModal(originalIndex, false)}
                        className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Add
                      </button>
                    ) : (
                      <span className={sheetCellMuted}>—</span>
                    )}
                  </div>

                  <div className={sheetCellLast}>
                    <div className="flex items-center justify-center flex-wrap gap-0.5">
                      {isCancelled ? (
                        <>
                          <span className="font-medium text-red-600 text-[10px] mr-0.5">CANCELLED</span>
                          <button
                            onClick={() => openRestoreEntry(originalIndex)}
                            className="p-1.5 rounded-md text-green-600 hover:text-green-800 hover:bg-green-50 dark:hover:bg-green-900/30"
                            title="Restore Entry"
                          >
                            <RotateCcw className="w-4 h-4" strokeWidth={2} />
                          </button>
                        </>
                      ) : editingRow === originalIndex ? (
                        <>
                          <button
                            onClick={() => requestRowSave(originalIndex)}
                            className="p-1.5 rounded-md text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/30"
                            title="Save & Update Fuel Record"
                          >
                            <Check className="w-4 h-4" strokeWidth={2} />
                          </button>
                          <button
                            onClick={() => handleRowCancel(originalIndex)}
                            className="p-1.5 rounded-md text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                            title="Cancel Edit"
                          >
                            <X className="w-4 h-4" strokeWidth={2} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartRowEdit(originalIndex)}
                            className="p-1.5 rounded-md text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                            title="Edit Entry"
                          >
                            <PenSquare className="w-4 h-4" strokeWidth={2} />
                          </button>
                          <button
                            onClick={() => handleOpenPickedAt(originalIndex)}
                            className={`p-1.5 rounded-md ${
                              entry.pickedAtStation
                                ? 'text-teal-700 bg-teal-50 dark:text-teal-300 dark:bg-teal-900/40'
                                : 'text-teal-600 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30'
                            }`}
                            title={entry.pickedAtStation ? `Picked at ${entry.pickedAtStation}` : 'Set picked at (stay on this LPO)'}
                          >
                            <MapPin className="w-4 h-4" strokeWidth={2} />
                          </button>
                          {isPickable(entry) && (
                            <button
                              onClick={() => handleOpenPickupForIndex(originalIndex)}
                              className="p-1.5 rounded-md text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                              title="Pick up at… (move to new LPO)"
                            >
                              <ArrowRightLeft className="w-4 h-4" strokeWidth={2} />
                            </button>
                          )}
                          <button
                            onClick={() => openCancelModal(originalIndex)}
                            className="p-1.5 rounded-md text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
                            title="Cancel Entry"
                          >
                            <XCircle className="w-4 h-4" strokeWidth={2} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {editingRow === originalIndex && rowNeedsJourneyPicker(originalIndex) && (
                  <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-slate-50 dark:bg-slate-800/40">
                    {renderRowLookupPanel(originalIndex)}
                  </div>
                )}
              </div>
              );
            })}

            {/* Locked Sheet Notice */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-gray-300 dark:border-gray-700">
              <div className="px-4 py-3 flex items-center justify-center text-amber-700 dark:text-amber-300">
                <Lock className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">
                  Sheet is locked - Only editing existing entries is allowed. Adding or removing trucks is disabled.
                </span>
              </div>
            </div>

            {/* Total Row */}
            <div className="bg-blue-100 dark:bg-blue-900/40 font-semibold">
              <div className={sheetGridClass}>
                <div className={sheetCell} />
                <div className={sheetCell} />
                <div className={sheetCell} />
                <div className={sheetCell} />
                <div className={`${sheetCell} ${sheetCellText}`}>TOTAL</div>
                <div className={sheetCell} />
                <div className={`${sheetCell} text-sm font-bold text-blue-900 dark:text-blue-300`}>
                  {formatCurrency(editedSheet.total)}
                </div>
                <div className={sheetCell} />
                <div className={sheetCell} />
                <div className={sheetCell} />
                <div className={sheetCell} />
                <div className={sheetCell} />
                <div className={sheetCellLast}>
                  <Calculator className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </div>
            {/* No search results */}
            {visibleEntries.length === 0 && entrySearch.trim() && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Search className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No entries match &ldquo;{entrySearch}&rdquo;</p>
                <button onClick={() => setEntrySearch('')} className="text-sm text-blue-600 dark:text-blue-400 mt-2 hover:underline">
                  Clear search
                </button>
              </div>
            )}
          </div>

          {/* Summary Statistics */}
          <div className="grid mt-6 grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Entries</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{editedSheet.entries.length}</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Liters</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {editedSheet.entries.reduce((sum, entry) => sum + entry.liters, 0)}
              </div>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Amount</div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatCurrency(editedSheet.total)}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* End desktop view */}

      </div>
      {/* End sheet content */}

      {/* Mobile Sticky Summary Bar */}
      <div className="lg:hidden flex-shrink-0 px-3 pb-6 pt-2 bg-white dark:bg-gray-800">
        <div className="flex items-start justify-between rounded-[20px] px-[18px] py-[13px]" style={{background: 'linear-gradient(160deg, #1d4ed8, #1e3a8a)', boxShadow: '0 16px 32px -12px rgba(30,58,138,0.7)'}}>
          <div>
            <div className="text-[9px] font-bold tracking-[0.1em] uppercase text-[#bfdbfe]">Active trucks</div>
            <div className="text-[11px] font-semibold text-[#dbeafe] mt-[1px]">
              {editedSheet.entries.filter(e => !e.isCancelled).length} active · {editedSheet.entries.filter(e => !e.isCancelled).reduce((s, e) => s + e.liters, 0).toLocaleString()} L
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-bold tracking-[0.1em] uppercase text-[#bfdbfe]">Grand Total</div>
            <div className="text-[21px] font-extrabold text-white tabular-nums leading-tight">{formatMoney(editedSheet.total)}</div>
          </div>
        </div>
      </div>

      {/* Cancel Entry Modal */}
      {showCancelModal && cancellingEntryIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 transition-colors">
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
                Cancel Entry
              </h3>
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancellingEntryIndex(null);
                  setDetectedDirection(null);
                  setDetectedCancellationPoint(null);
                }}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="px-6 py-4">
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">
                  <strong>Cancelling:</strong> Truck {editedSheet.entries[cancellingEntryIndex].truckNo} - {editedSheet.entries[cancellingEntryIndex].liters}L
                </p>
              </div>

              {isDetecting ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400 mr-2" />
                  <span className="text-gray-600 dark:text-gray-400">Verifying entry type and fuel record...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Entry Type Message - Prominent display */}
                  {entryTypeMessage && (
                    <div className={`p-4 rounded-lg border-2 ${
                      entryType === 'driver-account' 
                        ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700'
                        : entryType === 'regular'
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                        : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                    }`}>
                      <p className={`text-sm font-medium ${
                        entryType === 'driver-account'
                          ? 'text-purple-800 dark:text-purple-200'
                          : entryType === 'regular'
                          ? 'text-green-800 dark:text-green-200'
                          : 'text-amber-800 dark:text-amber-200'
                      }`}>
                        {entryType === 'driver-account' && '🔒 Driver Account Entry'} 
                        {entryType === 'regular' && '✓ Regular Entry with Fuel Record'}
                        {entryType === 'nil-do' && '⚠️ Entry Without Fuel Record'}
                      </p>
                      <p className={`text-xs mt-2 ${
                        entryType === 'driver-account'
                          ? 'text-purple-700 dark:text-purple-300'
                          : entryType === 'regular'
                          ? 'text-green-700 dark:text-green-300'
                          : 'text-amber-700 dark:text-amber-300'
                      }`}>
                        {entryTypeMessage}
                      </p>
                    </div>
                  )}
                  
                  {detectionError && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        {detectionError}
                      </p>
                    </div>
                  )}
                  
                  {/* Auto-detected Information Display */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Auto-detected Fuel Record Details
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">DO Number</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {editedSheet.entries[cancellingEntryIndex].doNo}
                        </span>
                      </div>
                      
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">Station</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {editedSheet.station}
                        </span>
                      </div>
                      
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">Direction</span>
                        <span className={`text-sm font-medium ${detectedDirection === 'going' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                          {detectedDirection === 'going' ? '↗ Going' : '↙ Returning'}
                        </span>
                      </div>
                      
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">Checkpoint</span>
                        <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                          {detectedCancellationPoint ? getCancellationPointDisplayName(detectedCancellationPoint) : 'Unknown'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {entryType === 'regular' && fuelAutomation?.lpoCancelRevert === false ? (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
                      <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          <strong>Automation OFF — choose the checkpoint to revert.</strong>{' '}
                          Direction is <strong>{detectedDirection === 'returning' ? 'returning' : 'going'}</strong>. The {editedSheet.entries[cancellingEntryIndex].liters}L will be reverted from the column you pick.
                        </span>
                      </p>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase mb-1">Revert checkpoint</label>
                          <select
                            value={cancelManualField}
                            onChange={(e) => setCancelManualField(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Select column…</option>
                            {(detectedDirection === 'returning' ? FUEL_RECORD_COLUMNS.return : FUEL_RECORD_COLUMNS.going).map((c) => (
                              <option key={c.field} value={c.field}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                        {detectedFuelRecordId != null && (
                          <button
                            onClick={() => setShowCancelInspect(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          >
                            <Search className="w-3.5 h-3.5" /> Inspect
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        <strong>What will happen:</strong>{' '}
                        {entryType === 'driver-account' && (
                          `This LPO entry will be marked as cancelled. No fuel record will be affected since Driver Account entries don't create fuel records.`
                        )}
                        {entryType === 'regular' && (
                          `The fuel deduction of ${editedSheet.entries[cancellingEntryIndex].liters}L will be reverted from the ${detectedDirection} checkpoint (${detectedCancellationPoint ? getCancellationPointDisplayName(detectedCancellationPoint) : 'Unknown'}).`
                        )}
                        {entryType === 'nil-do' && (
                          `This LPO entry will be marked as cancelled. No fuel record reversal will occur since no fuel record was found for this entry.`
                        )}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancellingEntryIndex(null);
                  setDetectedDirection(null);
                  setDetectedCancellationPoint(null);
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCancelEntry}
                disabled={
                  isDetecting || !detectedCancellationPoint || isSaving ||
                  (entryType === 'regular' && fuelAutomation?.lpoCancelRevert === false && !cancelManualField)
                }
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Processing...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel All Modal */}
      {showCancelAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">
                Cancel Entire LPO — {editedSheet.lpoNo}
              </h2>
            </div>

            <div className="px-6 py-4 space-y-4">
              {(() => {
                const active = editedSheet.entries.filter(e => !e.isCancelled);
                const regularEntries = active.filter(e => {
                  const doUp = (e.doNo || '').toUpperCase().trim();
                  return !e.isDriverAccount && !e.isRefer && doUp !== 'NIL' && doUp !== 'REF' && doUp !== 'DA' && doUp !== '' && doUp !== 'N/A';
                });
                const daOrRefEntries = active.filter(e => e.isDriverAccount || e.isRefer);
                const nilEntries = active.filter(e => {
                  const doUp = (e.doNo || '').toUpperCase().trim();
                  return !e.isDriverAccount && !e.isRefer && (doUp === 'NIL' || doUp === '' || doUp === 'N/A');
                });

                return (
                  <>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      This will cancel <strong>{active.length}</strong> active truck{active.length !== 1 ? 's' : ''} on this LPO.
                    </p>
                    {regularEntries.length > 0 && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-300">
                        <p className="font-medium mb-1">
                          {regularEntries.length} regular truck{regularEntries.length !== 1 ? 's' : ''} — fuel records WILL be reverted:
                        </p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {regularEntries.map((e, i) => (
                            <li key={i}>{e.truckNo} — {e.doNo} ({e.liters}L)</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {daOrRefEntries.length > 0 && (
                      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400">
                        <p className="font-medium mb-1">
                          {daOrRefEntries.length} DA/Refer truck{daOrRefEntries.length !== 1 ? 's' : ''} — marked cancelled only, no fuel change:
                        </p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {daOrRefEntries.map((e, i) => (
                            <li key={i}>{e.truckNo} ({e.isDriverAccount ? 'DA' : 'REF'})</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {nilEntries.length > 0 && (
                      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400">
                        <p className="font-medium mb-1">
                          {nilEntries.length} NIL DO truck{nilEntries.length !== 1 ? 's' : ''} — marked cancelled only:
                        </p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {nilEntries.map((e, i) => (
                            <li key={i}>{e.truckNo}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Automation OFF — operator picks the revert checkpoint per direction */}
              {cancelAllNeedsManual && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-3">
                  <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>Automation OFF — choose the checkpoint(s) to revert.</strong>{' '}
                      Fuel will be reverted from the column you pick for each direction present on this LPO.
                    </span>
                  </p>

                  {cancelAllDetecting ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Resolving truck directions…
                    </p>
                  ) : (
                    <>
                      {cancelAllHasGoing && (
                        <div>
                          <label className="block text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase mb-1">
                            Going revert checkpoint
                          </label>
                          <select
                            value={cancelAllRevertGoing}
                            onChange={(e) => setCancelAllRevertGoing(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Select column…</option>
                            {FUEL_RECORD_COLUMNS.going.map((c) => (
                              <option key={c.field} value={c.field}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {cancelAllHasReturning && (
                        <div>
                          <label className="block text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase mb-1">
                            Returning revert checkpoint
                          </label>
                          <select
                            value={cancelAllRevertReturning}
                            onChange={(e) => setCancelAllRevertReturning(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Select column…</option>
                            {FUEL_RECORD_COLUMNS.return.map((c) => (
                              <option key={c.field} value={c.field}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {!cancelAllHasGoing && !cancelAllHasReturning && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Could not resolve a fuel-record direction for any truck. Cancelling will mark rows cancelled without reverting fuel.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t dark:border-gray-700">
              <button
                onClick={() => setShowCancelAllModal(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
              >
                Go Back
              </button>
              <button
                onClick={handleCancelAll}
                disabled={isCancellingAll || cancelAllDetecting || (cancelAllNeedsManual && (cancelAllHasGoing || cancelAllHasReturning) && !cancelAllManualReady)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCancellingAll ? 'Cancelling...' : 'Cancel Entire LPO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pick-up-at Modal */}
      {showPickupModal && (
        <PickupAtModal
          isOpen={showPickupModal}
          onClose={handleClosePickup}
          sourceLpo={pickupSourceLpo}
          selectedEntries={selectedEntries}
          fuelAutomation={fuelAutomation}
          onComplete={handlePickupComplete}
        />
      )}

      {pickedAtIndex !== null && editedSheet.entries[pickedAtIndex] && (
        <PickedAtModal
          isOpen={pickedAtIndex !== null}
          onClose={handleClosePickedAt}
          sourceLpo={pickupSourceLpo}
          entry={editedSheet.entries[pickedAtIndex]}
          fuelAutomation={fuelAutomation}
          onComplete={handlePickedAtComplete}
        />
      )}

      {/* Inspect fuel record from the cancel modal */}
      {showCancelInspect && detectedFuelRecordId != null && (
        <FuelRecordInspectModal
          isOpen={showCancelInspect}
          onClose={() => setShowCancelInspect(false)}
          fuelRecordId={detectedFuelRecordId}
          truckNumber={cancellingEntryIndex !== null ? editedSheet.entries[cancellingEntryIndex]?.truckNo : undefined}
        />
      )}

      {/* Restore manual checkpoint modal (lpoCancelRevert OFF + regular entry) */}
      {showRestoreModal && restoringEntryIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                <RotateCcw className="w-5 h-5" /> Restore Entry
              </h3>
              <button
                onClick={() => { setShowRestoreModal(false); setRestoringEntryIndex(null); }}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
                Restoring <strong>{editedSheet.entries[restoringEntryIndex].truckNo}</strong>
                {' '}({editedSheet.entries[restoringEntryIndex].doNo} — {editedSheet.entries[restoringEntryIndex].liters}L)
              </div>

              {restoreDetecting ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Resolving fuel record direction…
                </p>
              ) : (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
                  <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>Automation OFF — choose the checkpoint to re-deduct.</strong>{' '}
                      Direction is <strong>{restoreDirection === 'returning' ? 'returning' : 'going'}</strong>. The {editedSheet.entries[restoringEntryIndex].liters}L will be re-deducted from the column you pick.
                    </span>
                  </p>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase mb-1">Re-deduct checkpoint</label>
                      <select
                        value={restoreManualField}
                        onChange={(e) => setRestoreManualField(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Select column…</option>
                        {(restoreDirection === 'returning' ? FUEL_RECORD_COLUMNS.return : FUEL_RECORD_COLUMNS.going).map((c) => (
                          <option key={c.field} value={c.field}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    {restoreFuelRecordId != null && (
                      <button
                        onClick={() => setShowRestoreInspect(true)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      >
                        <Search className="w-3.5 h-3.5" /> Inspect
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <button
                onClick={() => { setShowRestoreModal(false); setRestoringEntryIndex(null); }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRestore}
                disabled={restoreDetecting || isSaving || !restoreManualField}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Processing...' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect fuel record from the restore modal */}
      {showRestoreInspect && restoreFuelRecordId != null && (
        <FuelRecordInspectModal
          isOpen={showRestoreInspect}
          onClose={() => setShowRestoreInspect(false)}
          fuelRecordId={restoreFuelRecordId}
          truckNumber={restoringEntryIndex !== null ? editedSheet.entries[restoringEntryIndex]?.truckNo : undefined}
        />
      )}

      {/* Edit-side manual checkpoint modal (lpoEditAdjust OFF) */}
      {editCheckpoint.open && editCheckpoint.index !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Choose Adjustment Checkpoint</h3>
              <button
                onClick={() =>
                  setEditCheckpoint({
                    open: false,
                    index: null,
                    direction: null,
                    oldDirection: null,
                    fuelRecordId: null,
                    field: '',
                    revertField: '',
                    isDirectionSwap: false,
                    loading: false,
                  })
                }
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Fuel automation for edits is OFF.
                {editCheckpoint.isDirectionSwap ? (
                  <>
                    {' '}
                    Direction change for <strong>{editedSheet.entries[editCheckpoint.index].truckNo}</strong>:
                    revert the old direction checkpoint, then deduct current liters onto the new direction checkpoint.
                  </>
                ) : (
                  <>
                    {' '}
                    Liters / truck / DO changes for{' '}
                    <strong>{editedSheet.entries[editCheckpoint.index].truckNo}</strong> use the column you choose
                    ({editCheckpoint.direction === 'returning' ? 'returning' : 'going'}).
                  </>
                )}
              </p>
              {editCheckpoint.loading ? (
                <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Detecting direction…</div>
              ) : editCheckpoint.isDirectionSwap ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      Revert from ({editCheckpoint.oldDirection === 'returning' ? 'returning' : 'going'})
                    </label>
                    <select
                      value={editCheckpoint.revertField}
                      onChange={(e) => setEditCheckpoint((p) => ({ ...p, revertField: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Select column…</option>
                      {(editCheckpoint.oldDirection === 'returning' ? FUEL_RECORD_COLUMNS.return : FUEL_RECORD_COLUMNS.going).map((c) => (
                        <option key={c.field} value={c.field}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                        Deduct onto ({editCheckpoint.direction === 'returning' ? 'returning' : 'going'})
                      </label>
                      <select
                        value={editCheckpoint.field}
                        onChange={(e) => setEditCheckpoint((p) => ({ ...p, field: e.target.value }))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Select column…</option>
                        {(editCheckpoint.direction === 'returning' ? FUEL_RECORD_COLUMNS.return : FUEL_RECORD_COLUMNS.going).map((c) => (
                          <option key={c.field} value={c.field}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    {editCheckpoint.fuelRecordId != null && (
                      <button
                        onClick={() => setShowEditInspect(true)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      >
                        <Search className="w-3.5 h-3.5" /> Inspect
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Checkpoint</label>
                    <select
                      value={editCheckpoint.field}
                      onChange={(e) => setEditCheckpoint((p) => ({ ...p, field: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Select column…</option>
                      {(editCheckpoint.direction === 'returning' ? FUEL_RECORD_COLUMNS.return : FUEL_RECORD_COLUMNS.going).map((c) => (
                        <option key={c.field} value={c.field}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  {editCheckpoint.fuelRecordId != null && (
                    <button
                      onClick={() => setShowEditInspect(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    >
                      <Search className="w-3.5 h-3.5" /> Inspect
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t dark:border-gray-700">
              <button
                onClick={() =>
                  setEditCheckpoint({
                    open: false,
                    index: null,
                    direction: null,
                    oldDirection: null,
                    fuelRecordId: null,
                    field: '',
                    revertField: '',
                    isDirectionSwap: false,
                    loading: false,
                  })
                }
                className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  editCheckpoint.index !== null &&
                  handleRowSave(editCheckpoint.index, editCheckpoint.field, {
                    revertField: editCheckpoint.isDirectionSwap ? editCheckpoint.revertField : undefined,
                  })
                }
                disabled={
                  !editCheckpoint.field ||
                  (editCheckpoint.isDirectionSwap && !editCheckpoint.revertField) ||
                  isSaving
                }
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditInspect && editCheckpoint.fuelRecordId != null && (
        <FuelRecordInspectModal
          isOpen={showEditInspect}
          onClose={() => setShowEditInspect(false)}
          fuelRecordId={editCheckpoint.fuelRecordId}
          truckNumber={editCheckpoint.index !== null ? editedSheet.entries[editCheckpoint.index]?.truckNo : undefined}
        />
      )}

      {/* Ambiguous DO — same DO on multiple trucks */}
      {doAmbiguityModal.open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDoAmbiguityModal({ open: false, index: -1, doNo: '', matches: [] })}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 p-5 border-b border-gray-100 dark:border-gray-800">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  DO {doAmbiguityModal.doNo} is on {doAmbiguityModal.matches.length} trucks
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Pick the truck you mean — the LPO row is not updated until you choose.
                </p>
              </div>
            </div>
            <div className="p-3 max-h-[55vh] overflow-y-auto space-y-2">
              {doAmbiguityModal.matches.map((m, i) => (
                <button
                  key={`${m.fuelRecord?.id || m.fuelRecord?._id || i}`}
                  type="button"
                  onClick={() => {
                    applyJourneyToRow(doAmbiguityModal.index, m);
                    setDoAmbiguityModal({ open: false, index: -1, doNo: '', matches: [] });
                    toast.success(`Selected truck ${formatTruckNumber(m.truckNo || m.fuelRecord?.truckNo || '')}`);
                  }}
                  className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20 transition-colors p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-gray-900 dark:text-gray-100">
                      {formatTruckNumber(m.truckNo || m.fuelRecord?.truckNo || '—')}
                    </span>
                    <span
                      className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-md ${
                        m.direction === 'returning'
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      }`}
                    >
                      {m.direction || 'going'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    DO {m.goingDo}
                    {m.returnDo && m.returnDo !== 'NIL' ? ` / ${m.returnDo}` : ''} · {m.goingDestination || m.destination} · Bal {m.balance}L
                  </div>
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button
                type="button"
                onClick={() => setDoAmbiguityModal({ open: false, index: -1, doNo: '', matches: [] })}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entry context modal */}
      {contextModal.open && contextModal.index !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-start gap-3 p-5 border-b border-gray-100 dark:border-gray-800">
              <MessageSquare className="w-6 h-6 text-indigo-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {contextModal.readOnly ? 'Order context' : 'Add context'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Truck {editedSheet.entries[contextModal.index]?.truckNo} · DO{' '}
                  {editedSheet.entries[contextModal.index]?.doNo}
                </p>
              </div>
            </div>
            <div className="p-5">
              <textarea
                value={contextModal.text}
                onChange={(e) => setContextModal((p) => ({ ...p, text: e.target.value }))}
                readOnly={contextModal.readOnly}
                rows={5}
                maxLength={2000}
                placeholder="Optional note for this truck order…"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              />
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setContextModal({ open: false, index: null, text: '', readOnly: false })}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {contextModal.readOnly ? 'Close' : 'Cancel'}
              </button>
              {!contextModal.readOnly && (
                <button
                  type="button"
                  onClick={saveContextModal}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
                >
                  Save context
                </button>
              )}
              {contextModal.readOnly && (
                <button
                  type="button"
                  onClick={() => setContextModal((p) => ({ ...p, readOnly: false }))}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LPOSheetView;