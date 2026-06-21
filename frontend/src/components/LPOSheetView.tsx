import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Edit2, Save, X, Calculator, Copy, MessageSquare, Image, ChevronDown, FileDown, Download, Lock, AlertTriangle, Clipboard, Ban, RotateCcw, Loader2, XCircle, Search } from 'lucide-react';
import { LPOSheet, LPODetail, LPOSummary, CancellationReport, CancellationPoint } from '../types';
import { lpoWorkbookAPI, fuelRecordsAPI, lpoDocumentsAPI, FuelAutomationConfig } from '../services/api';
import { useJourneyConfig } from '../hooks/useJourneyConfig';
import { copyLPOImageToClipboard, downloadLPOImage } from '../utils/lpoImageGenerator';
import { copyLPOForWhatsApp, copyLPOTextToClipboard } from '../utils/lpoTextGenerator';
import { useAuth } from '../contexts/AuthContext';
import { formatTruckNumber } from '../utils/dataCleanup';
import { 
  generateCancellationReport, 
  formatEntryForDisplay,
  saveCancellationToHistory,
  getAutoCancellationPoint,
  getCancellationPointDisplayName
} from '../services/cancellationService';

interface LPOSheetViewProps {
  sheet: LPOSheet;
  workbookId: string | number;
  onUpdate: (updatedSheet: LPOSheet) => void;
  lpoNo?: string;
  onBack?: () => void;
}

const LPOSheetView: React.FC<LPOSheetViewProps> = ({ sheet, workbookId, onUpdate, lpoNo, onBack }) => {
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
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);
  const [showCancelAllModal, setShowCancelAllModal] = useState(false);
  const [isCancellingAll, setIsCancellingAll] = useState(false);
  const [entrySearch, setEntrySearch] = useState('');
  const [fuelAutomation, setFuelAutomation] = useState<FuelAutomationConfig | null>(null);

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
  useEffect(() => {
    if (journeyConfig?.fuelAutomation) setFuelAutomation(journeyConfig.fuelAutomation);
  }, [journeyConfig]);

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
          return;
        }
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
    } catch (error) {
      console.error('Error saving sheet:', error);
      toast.error('Error saving changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Save a single row edit to the backend
  const handleRowSave = async (_index: number) => {
    if (isSaving) return; // Prevent double submission
    setIsSaving(true);
    try {
      const updatedSheet = await lpoWorkbookAPI.updateSheet(workbookId, sheet.id!, editedSheet);
      onUpdate(updatedSheet);
      setEditingRow(null);
      await releaseLockIfNeeded();
      toast.success('Entry updated! Fuel records have been adjusted.');
    } catch (error) {
      console.error('Error saving entry:', error);
      toast.error('Error saving entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel row edit - revert to original values
  const handleRowCancel = async (index: number) => {
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
          return;
        }
      }
    }
    setEditingRow(index);
  };

  // Open cancel modal for an entry - auto-detect direction and checkpoint
  const openCancelModal = async (index: number) => {
    setCancellingEntryIndex(index);
    setDetectedDirection(null);
    setDetectedCancellationPoint(null);
    setDetectionError(null);
    setEntryTypeMessage(null);
    setEntryType(null);
    setIsDetecting(true);
    setShowCancelModal(true);

    const entry = editedSheet.entries[index];
    const doNo = entry.doNo?.trim().toUpperCase() || '';
    const isNilDO = doNo === 'NIL' || doNo === '' || doNo === 'N/A';
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

      const updatedSheet = {
        ...editedSheet,
        entries: updatedEntries,
        total: newTotal
      };

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

  // Handle uncancelling an entry (restore it)
  const handleUncancelEntry = async (index: number) => {
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

      const updatedSheet = {
        ...editedSheet,
        entries: updatedEntries,
        total: newTotal
      };

      // Save to backend
      const savedSheet = await lpoWorkbookAPI.updateSheet(workbookId, sheet.id!, updatedSheet);
      onUpdate(savedSheet);
      setEditedSheet(savedSheet);

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

  // Handle cancelling ALL active entries in the LPO
  const handleCancelAll = async () => {
    setIsCancellingAll(true);
    try {
      await lpoDocumentsAPI.cancelAll(editedSheet.id as string, 'Bulk LPO cancellation');
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
      total: editedSheet.total
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
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Filtered entries for search
  const visibleEntries = entrySearch.trim()
    ? editedSheet.entries.filter(entry => {
        const term = entrySearch.toLowerCase();
        return (
          (entry.truckNo || '').toLowerCase().includes(term) ||
          (entry.doNo || '').toLowerCase().includes(term) ||
          (entry.dest || '').toLowerCase().includes(term)
        );
      })
    : editedSheet.entries;

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
                    <Edit2 className="w-4 h-4 mr-3 text-blue-500" />Edit LPO
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
            <div className="text-[13.5px] font-extrabold text-[#4ade80] tabular-nums">${formatCurrency(editedSheet.total)}</div>
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
                  <Edit2 className="w-3.5 h-3.5 mr-1" />
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
            {visibleEntries.map((entry, index) => {
              const isCancelled = entry.isCancelled;
              const isDriverAccount = entry.isDriverAccount;
              return (
                <div
                  key={index}
                  className={`border rounded-xl transition-all ${
                    isCancelled
                      ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                      : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50'
                  }`}
                  style={{ opacity: isCancelled ? 0.85 : 1 }}
                >
                  {editingRow === index ? (
                    <div className="p-4 space-y-3">
                      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'}}>
                        <span className="text-[10px] font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Editing Entry</span>
                        <div style={{display: 'flex', gap: '8px', flexShrink: 0}}>
                          <button onClick={() => handleRowSave(index)} disabled={isSaving} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                            <Save className="w-3.5 h-3.5" />{isSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => handleRowCancel(index)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-bold bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                            <X className="w-3.5 h-3.5" />Cancel
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">Truck No.</label>
                          <input type="text" value={entry.truckNo} onChange={(e) => handleEntryEdit(index, 'truckNo', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">DO No.</label>
                          <input type="text" value={entry.doNo} onChange={(e) => handleEntryEdit(index, 'doNo', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">Liters</label>
                          <input type="number" value={entry.liters} onChange={(e) => handleEntryEdit(index, 'liters', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">Rate</label>
                          <input type="number" step="0.1" value={entry.rate} onChange={(e) => handleEntryEdit(index, 'rate', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">Destination</label>
                          <input type="text" value={entry.dest} onChange={(e) => handleEntryEdit(index, 'dest', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-[15px]">
                      {/* Truck + pill / Amount */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
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
                            ${formatCurrency(entry.amount)}
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
                          <button onClick={() => handleUncancelEntry(index)} disabled={isSaving} className="flex-1 flex items-center justify-center gap-[7px] h-[42px] rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-[13px] font-bold hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50">
                            <RotateCcw className="w-[15px] h-[15px]" />Restore Entry
                          </button>
                        ) : (
                          <>
                            <button onClick={() => handleStartRowEdit(index)} className="flex-1 flex items-center justify-center gap-[7px] h-[42px] rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[13px] font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30">
                              <Edit2 className="w-[15px] h-[15px]" />Modify
                            </button>
                            <button onClick={() => openCancelModal(index)} className="flex-1 flex items-center justify-center gap-[7px] h-[42px] rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 text-[13px] font-bold hover:bg-orange-100 dark:hover:bg-orange-900/30">
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
        <div className="hidden lg:block p-6">
          <div className="max-w-6xl mx-auto">
            <div className="border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">

            {/* Table Header */}
            <div className="bg-blue-50 dark:bg-blue-900/30 border-b border-gray-300 dark:border-gray-700">
              <div className="grid grid-cols-7 gap-0">
                <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-700">DO No.</div>
                <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-700">Truck No.</div>
                <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-700 text-right">Liters</div>
                <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-700 text-right">Rate</div>
                <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-700 text-right">Amount</div>
                <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-700">Dest.</div>
                <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 text-center">Actions</div>
              </div>
            </div>

            {/* Table Body - Existing Entries */}
            {visibleEntries.map((entry, index) => {
              const displayData = formatEntryForDisplay(entry);
              const isCancelled = entry.isCancelled;
              const isDriverAccount = entry.isDriverAccount;
              
              // Row styling based on entry state
              const rowClass = isCancelled 
                ? 'bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800' 
                : isDriverAccount 
                  ? 'bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800'
                  : 'border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800';
              
              return (
              <div key={index} className={rowClass}>
                <div className="grid grid-cols-7 gap-0">
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-700">
                    {editingRow === index ? (
                      <input
                        type="text"
                        value={entry.doNo}
                        onChange={(e) => handleEntryEdit(index, 'doNo', e.target.value)}
                        className="w-full px-1 py-0 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    ) : (
                      <span className={`text-sm ${displayData.displayClass}`}>
                        {isCancelled ? 'CANCELLED' : isDriverAccount ? 'NIL' : entry.doNo}
                      </span>
                    )}
                  </div>
                  
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-700">
                    {editingRow === index ? (
                      <input
                        type="text"
                        value={entry.truckNo}
                        onChange={(e) => handleEntryEdit(index, 'truckNo', e.target.value)}
                        className="w-full px-1 py-0 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    ) : (
                      <span className={`text-sm font-medium ${isCancelled ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{entry.truckNo}</span>
                    )}
                  </div>
                  
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-700 text-right">
                    {editingRow === index ? (
                      <input
                        type="number"
                        value={entry.liters}
                        onChange={(e) => handleEntryEdit(index, 'liters', parseFloat(e.target.value) || 0)}
                        className="w-full px-1 py-0 text-sm border dark:border-gray-600 rounded text-right bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        {entry.originalLiters != null && entry.originalLiters !== entry.liters && (
                          <span className="text-sm text-gray-400 dark:text-gray-500 line-through">{entry.originalLiters}</span>
                        )}
                        <span className={`text-sm ${isCancelled ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{entry.liters}</span>
                      </span>
                    )}
                  </div>
                  
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-700 text-right">
                    {editingRow === index ? (
                      <input
                        type="number"
                        step="0.1"
                        value={entry.rate}
                        onChange={(e) => handleEntryEdit(index, 'rate', parseFloat(e.target.value) || 0)}
                        className="w-full px-1 py-0 text-sm border dark:border-gray-600 rounded text-right bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    ) : (
                      <span className={`text-sm ${isCancelled ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{entry.rate}</span>
                    )}
                  </div>
                  
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-700 text-right">
                    <span className={`text-sm font-medium ${isCancelled ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                      {formatCurrency(entry.amount)}
                    </span>
                  </div>
                  
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-700">
                    {editingRow === index ? (
                      <input
                        type="text"
                        value={entry.dest}
                        onChange={(e) => handleEntryEdit(index, 'dest', e.target.value)}
                        className="w-full px-1 py-0 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    ) : (
                      <span className={`text-sm ${displayData.displayClass}`}>
                        {isCancelled ? entry.dest : isDriverAccount ? 'NIL' : entry.dest}
                      </span>
                    )}
                  </div>
                  
                  <div className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      {isCancelled ? (
                        <>
                          <span className="text-xs text-red-600 font-medium mr-1">CANCELLED</span>
                          <button
                            onClick={() => handleUncancelEntry(index)}
                            className="p-1 text-green-600 hover:text-green-800"
                            title="Restore Entry"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </>
                      ) : editingRow === index ? (
                        <>
                          <button
                            onClick={() => handleRowSave(index)}
                            className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                            title="Save & Update Fuel Record"
                          >
                            <Save className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleRowCancel(index)}
                            className="p-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                            title="Cancel Edit"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartRowEdit(index)}
                            className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            title="Edit Entry"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => openCancelModal(index)}
                            className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                            title="Cancel Entry"
                          >
                            <Ban className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
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
              <div className="grid grid-cols-7 gap-0">
                <div className="px-3 py-3 border-r border-gray-300 dark:border-gray-700"></div>
                <div className="px-3 py-3 border-r border-gray-300 dark:border-gray-700"></div>
                <div className="px-3 py-3 border-r border-gray-300 dark:border-gray-700 text-right text-gray-900 dark:text-gray-100">TOTAL</div>
                <div className="px-3 py-3 border-r border-gray-300 dark:border-gray-700"></div>
                <div className="px-3 py-3 border-r border-gray-300 dark:border-gray-700 text-right text-lg font-bold text-blue-900 dark:text-blue-300">
                  {formatCurrency(editedSheet.total)}
                </div>
                <div className="px-3 py-3 border-r border-gray-300 dark:border-gray-700"></div>
                <div className="px-3 py-3 text-center">
                  <Calculator className="w-4 h-4 text-blue-600 dark:text-blue-400 mx-auto" />
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
            <div className="text-[21px] font-extrabold text-white tabular-nums leading-tight">${formatCurrency(editedSheet.total)}</div>
          </div>
        </div>
      </div>

      {/* Cancel Entry Modal */}
      {showCancelModal && cancellingEntryIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 transition-colors">
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                <Ban className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
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
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          <strong>Automation OFF — Revert on LPO cancellation:</strong>{' '}
                          The fuel deduction of {editedSheet.entries[cancellingEntryIndex].liters}L will <strong>not</strong> be automatically reverted from the {detectedDirection} checkpoint ({detectedCancellationPoint ? getCancellationPointDisplayName(detectedCancellationPoint) : 'Unknown'}). Reconcile this fuel record manually after cancelling.
                        </span>
                      </p>
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
                disabled={isDetecting || !detectedCancellationPoint || isSaving}
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
                disabled={isCancellingAll}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
              >
                {isCancellingAll ? 'Cancelling...' : 'Cancel Entire LPO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LPOSheetView;