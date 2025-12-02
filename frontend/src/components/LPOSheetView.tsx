import React, { useState, useEffect } from 'react';
import { Edit2, Save, X, Calculator, Copy, MessageSquare, Image, ChevronDown, FileDown, Download, Lock, AlertTriangle, Clipboard, Ban, RotateCcw, Loader2 } from 'lucide-react';
import { LPOSheet, LPODetail, LPOSummary, CancellationReport, CancellationPoint } from '../types';
import { lpoWorkbookAPI, fuelRecordsAPI } from '../services/api';
import { copyLPOImageToClipboard, downloadLPOPDF, downloadLPOImage } from '../utils/lpoImageGenerator';
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
}

const LPOSheetView: React.FC<LPOSheetViewProps> = ({ sheet, workbookId, onUpdate }) => {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedSheet, setEditedSheet] = useState<LPOSheet>(sheet);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Prevent double submissions
  const [cancellationReport, setCancellationReport] = useState<CancellationReport | null>(null);
  const [showCancellationReport, setShowCancellationReport] = useState(false);
  
  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingEntryIndex, setCancellingEntryIndex] = useState<number | null>(null);
  const [detectedDirection, setDetectedDirection] = useState<'going' | 'returning' | null>(null);
  const [detectedCancellationPoint, setDetectedCancellationPoint] = useState<CancellationPoint | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);

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

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Copy cancellation report to clipboard
  const handleCopyCancellationReport = async () => {
    if (!cancellationReport) return;
    try {
      await navigator.clipboard.writeText(cancellationReport.reportText);
      saveCancellationToHistory(cancellationReport);
      alert('Cancellation report copied to clipboard!');
    } catch (error) {
      console.error('Error copying cancellation report:', error);
      alert('Failed to copy. Please try again.');
    }
  };

  const handleHeaderEdit = async (field: keyof LPOSheet, value: string) => {
    setEditedSheet(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (isSaving) return; // Prevent double submission
    setIsSaving(true);
    try {
      const updatedSheet = await lpoWorkbookAPI.updateSheet(workbookId, sheet.id!, editedSheet);
      onUpdate(updatedSheet);
      setIsEditing(false);
      alert('✓ Changes saved successfully! Fuel records have been updated.');
    } catch (error) {
      console.error('Error saving sheet:', error);
      alert('Error saving changes. Please try again.');
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
      alert('✓ Entry updated! Fuel records have been adjusted.');
    } catch (error) {
      console.error('Error saving entry:', error);
      alert('Error saving entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel row edit - revert to original values
  const handleRowCancel = (index: number) => {
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
  };

  // Open cancel modal for an entry - auto-detect direction and checkpoint
  const openCancelModal = async (index: number) => {
    setCancellingEntryIndex(index);
    setDetectedDirection(null);
    setDetectedCancellationPoint(null);
    setDetectionError(null);
    setIsDetecting(true);
    setShowCancelModal(true);

    const entry = editedSheet.entries[index];
    
    try {
      // Try to find the fuel record by DO number to determine direction
      const result = await fuelRecordsAPI.getByDoNumber(entry.doNo);
      
      let direction: 'going' | 'returning' = 'going';
      
      if (result) {
        direction = result.direction;
      } else {
        // If no fuel record found, try to infer from DO number format
        // DOs starting with higher numbers or containing certain patterns might be returns
        // For now, default to 'going' but the user can see this in the confirmation
        console.log(`No fuel record found for DO ${entry.doNo}, defaulting to 'going' direction`);
      }
      
      setDetectedDirection(direction);
      
      // Auto-determine the cancellation point based on station and direction
      const cancellationPoint = getAutoCancellationPoint(editedSheet.station, direction);
      setDetectedCancellationPoint(cancellationPoint);
      
    } catch (error) {
      console.error('Error detecting fuel record direction:', error);
      // Default to going direction if detection fails
      setDetectedDirection('going');
      const cancellationPoint = getAutoCancellationPoint(editedSheet.station, 'going');
      setDetectedCancellationPoint(cancellationPoint);
      setDetectionError('Could not auto-detect direction. Using default settings.');
    } finally {
      setIsDetecting(false);
    }
  };

  // Handle cancelling an entry
  const handleCancelEntry = async () => {
    if (cancellingEntryIndex === null || !detectedCancellationPoint) {
      alert('Unable to determine cancellation point. Please try again.');
      return;
    }

    if (isSaving) return;
    setIsSaving(true);

    try {
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
      
      setShowCancelModal(false);
      setCancellingEntryIndex(null);
      setDetectedDirection(null);
      setDetectedCancellationPoint(null);
      
      alert('✓ Entry cancelled successfully! Fuel record has been updated.');
    } catch (error) {
      console.error('Error cancelling entry:', error);
      alert('Error cancelling entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle uncancelling an entry (restore it)
  const handleUncancelEntry = async (index: number) => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const updatedEntries = [...editedSheet.entries];
      updatedEntries[index] = {
        ...updatedEntries[index],
        isCancelled: false,
        cancellationPoint: undefined
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
      
      alert('✓ Entry restored successfully! Fuel record has been updated.');
    } catch (error) {
      console.error('Error restoring entry:', error);
      alert('Error restoring entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedSheet(sheet);
    setIsEditing(false);
    setEditingRow(null);
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
      const success = await copyLPOImageToClipboard(lpoSummary, user?.username);
      
      if (success) {
        alert('LPO image copied to clipboard successfully!');
      } else {
        alert('Failed to copy LPO image to clipboard. Please try again.');
      }
    } catch (error) {
      console.error('Error copying image to clipboard:', error);
      alert('Failed to copy LPO image to clipboard. Your browser may not support this feature.');
    }
    setShowCopyDropdown(false);
  };

  // Handle copy LPO text for WhatsApp
  const handleCopyWhatsAppText = async () => {
    try {
      const lpoSummary = convertToLPOSummary();
      const success = await copyLPOForWhatsApp(lpoSummary);
      
      if (success) {
        alert('LPO text for WhatsApp copied to clipboard successfully!');
      } else {
        alert('Failed to copy LPO text to clipboard. Please try again.');
      }
    } catch (error) {
      console.error('Error copying WhatsApp text to clipboard:', error);
      alert('Failed to copy LPO text to clipboard.');
    }
    setShowCopyDropdown(false);
  };

  // Handle copy LPO as CSV text
  const handleCopyCsvText = async () => {
    try {
      const lpoSummary = convertToLPOSummary();
      const success = await copyLPOTextToClipboard(lpoSummary);
      
      if (success) {
        alert('LPO CSV text copied to clipboard successfully!');
      } else {
        alert('Failed to copy LPO CSV text to clipboard. Please try again.');
      }
    } catch (error) {
      console.error('Error copying CSV text to clipboard:', error);
      alert('Failed to copy LPO CSV text to clipboard.');
    }
    setShowCopyDropdown(false);
  };

  // Handle download LPO as PDF
  const handleDownloadPDF = async () => {
    try {
      const lpoSummary = convertToLPOSummary();
      await downloadLPOPDF(lpoSummary, undefined, user?.username);
      alert('✓ LPO PDF downloaded successfully!');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download LPO as PDF. Please try again.');
    }
    setShowCopyDropdown(false);
  };

  // Handle download LPO as Image
  const handleDownloadImage = async () => {
    try {
      const lpoSummary = convertToLPOSummary();
      await downloadLPOImage(lpoSummary, undefined, user?.username);
      alert('✓ LPO image downloaded successfully!');
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Failed to download LPO as image. Please try again.');
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

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 transition-colors">
      {/* Sheet Header - LPO Header Info */}
      <div className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 gap-8 mb-4">
            {/* Left Column */}
            <div className="space-y-3">
              <div className="flex items-center space-x-4">
                <span className="font-medium text-gray-700 dark:text-gray-300 w-20">LPO No.:</span>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedSheet.lpoNo}
                    onChange={(e) => handleHeaderEdit('lpoNo', e.target.value)}
                    className="px-2 py-1 border dark:border-gray-600 rounded font-bold text-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                ) : (
                  <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{editedSheet.lpoNo}</span>
                )}
              </div>
              
              <div className="flex items-center space-x-4">
                <span className="font-medium text-gray-700 dark:text-gray-300 w-20">Station:</span>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedSheet.station}
                    onChange={(e) => handleHeaderEdit('station', e.target.value)}
                    className="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                ) : (
                  <span className="font-medium text-gray-900 dark:text-gray-100">{editedSheet.station}</span>
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-3">
              <div className="flex items-center space-x-4">
                <span className="font-medium text-gray-700 dark:text-gray-300 w-20">Date:</span>
                {isEditing ? (
                  <input
                    type="date"
                    value={editedSheet.date}
                    onChange={(e) => handleHeaderEdit('date', e.target.value)}
                    className="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                ) : (
                  <span className="font-medium text-gray-900 dark:text-gray-100">{new Date(editedSheet.date).toLocaleDateString()}</span>
                )}
              </div>
              
              <div className="flex items-center space-x-4">
                <span className="font-medium text-gray-700 dark:text-gray-300 w-20">Order of:</span>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedSheet.orderOf}
                    onChange={(e) => handleHeaderEdit('orderOf', e.target.value)}
                    className="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                ) : (
                  <span className="font-medium text-gray-900 dark:text-gray-100">{editedSheet.orderOf}</span>
                )}
              </div>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">KINDLY SUPPLY THE FOLLOWING LITERS</p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  className="flex items-center px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  <Save className="w-4 h-4 mr-1" />
                  Save Changes
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </button>
              </>
            ) : (
              <>
                {/* Copy/Download Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowCopyDropdown(!showCopyDropdown)}
                    className="flex items-center px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    <Copy className="w-4 h-4 mr-1" />
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
                          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <FileDown className="w-4 h-4 mr-2 text-red-600" />
                          Download as PDF
                        </button>
                        <button
                          onClick={handleDownloadImage}
                          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Download className="w-4 h-4 mr-2 text-green-600" />
                          Download as Image
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  <Edit2 className="w-4 h-4 mr-1" />
                  Edit LPO
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cancellation Report Banner */}
      {cancellationReport && cancellationReport.cancelledTrucks.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-800 dark:text-red-300">
                    {cancellationReport.isFullyCancelled 
                      ? 'LPO Fully Cancelled' 
                      : 'Partial Cancellation'}
                  </h4>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                    {cancellationReport.reportText}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCopyCancellationReport}
                  className="flex items-center px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800/40 text-sm"
                >
                  <Clipboard className="w-4 h-4 mr-1" />
                  Copy Report
                </button>
                <button
                  onClick={() => setShowCancellationReport(!showCancellationReport)}
                  className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm underline"
                >
                  {showCancellationReport ? 'Hide' : 'Show'} Details
                </button>
              </div>
            </div>
            
            {showCancellationReport && (
              <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-800 p-4">
                <h5 className="font-medium text-red-800 dark:text-red-300 mb-2">Cancelled Trucks:</h5>
                <ul className="space-y-1 text-sm text-red-700 dark:text-red-400">
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
                    <h5 className="font-medium text-green-800 dark:text-green-300 mt-4 mb-2">Active Trucks:</h5>
                    <ul className="space-y-1 text-sm text-green-700 dark:text-green-400">
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
        </div>
      )}

      {/* Sheet Content - Excel-like Table */}
      <div className="flex-1 overflow-auto p-6">
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
            {editedSheet.entries.map((entry, index) => {
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
                        className="w-full px-1 py-0 text-sm border dark:border-gray-600 rounded text-right bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    ) : (
                      <span className={`text-sm ${isCancelled ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{entry.liters}</span>
                    )}
                  </div>
                  
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-700 text-right">
                    {editingRow === index ? (
                      <input
                        type="number"
                        step="0.1"
                        value={entry.rate}
                        onChange={(e) => handleEntryEdit(index, 'rate', parseFloat(e.target.value) || 0)}
                        className="w-full px-1 py-0 text-sm border dark:border-gray-600 rounded text-right bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                      ) : isDriverAccount ? (
                        <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">DRIVER A/C</span>
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
                            onClick={() => setEditingRow(index)}
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
          </div>

          {/* Summary Statistics */}
          <div className="mt-6 grid grid-cols-3 gap-4">
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
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  This will revert the fuel record deduction and mark this entry as cancelled.
                </p>
              </div>

              {isDetecting ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400 mr-2" />
                  <span className="text-gray-600 dark:text-gray-400">Detecting fuel record details...</span>
                </div>
              ) : (
                <div className="space-y-4">
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

                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      <strong>Action:</strong> The fuel deduction of {editedSheet.entries[cancellingEntryIndex].liters}L will be reverted from the {detectedDirection} checkpoint ({detectedCancellationPoint ? getCancellationPointDisplayName(detectedCancellationPoint) : 'Unknown'}).
                    </p>
                  </div>
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
    </div>
  );
};

export default LPOSheetView;