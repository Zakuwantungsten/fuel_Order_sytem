import React, { useState, useEffect } from 'react';
import { Edit2, Save, X, Calculator, Copy, MessageSquare, Image, ChevronDown, FileDown, Download, Lock } from 'lucide-react';
import { LPOSheet, LPODetail, LPOSummary } from '../types';
import { lpoWorkbookAPI } from '../services/api';
import { copyLPOImageToClipboard, downloadLPOPDF, downloadLPOImage } from '../utils/lpoImageGenerator';
import { copyLPOForWhatsApp, copyLPOTextToClipboard } from '../utils/lpoTextGenerator';

interface LPOSheetViewProps {
  sheet: LPOSheet;
  workbookId: string | number;
  onUpdate: (updatedSheet: LPOSheet) => void;
}

const LPOSheetView: React.FC<LPOSheetViewProps> = ({ sheet, workbookId, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSheet, setEditedSheet] = useState<LPOSheet>(sheet);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);

  useEffect(() => {
    setEditedSheet(sheet);
  }, [sheet]);

  useEffect(() => {
    // Calculate total when entries change
    const total = editedSheet.entries.reduce((sum, entry) => sum + entry.amount, 0);
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

  const handleHeaderEdit = (field: keyof LPOSheet, value: string) => {
    setEditedSheet(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      const updatedSheet = await lpoWorkbookAPI.updateSheet(workbookId, sheet.id!, editedSheet);
      onUpdate(updatedSheet);
      setIsEditing(false);
      alert('✓ Changes saved successfully! Fuel records have been updated.');
    } catch (error) {
      console.error('Error saving sheet:', error);
      alert('Error saving changes. Please try again.');
    }
  };

  // Save a single row edit to the backend
  const handleRowSave = async (_index: number) => {
    try {
      const updatedSheet = await lpoWorkbookAPI.updateSheet(workbookId, sheet.id!, editedSheet);
      onUpdate(updatedSheet);
      setEditingRow(null);
      alert('✓ Entry updated! Fuel records have been adjusted.');
    } catch (error) {
      console.error('Error saving entry:', error);
      alert('Error saving entry. Please try again.');
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

  const handleCancel = () => {
    setEditedSheet(sheet);
    setIsEditing(false);
    setEditingRow(null);
  };

  // Convert LPOSheet to LPOSummary format
  const convertToLPOSummary = (): LPOSummary => {
    return {
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
      const success = await copyLPOImageToClipboard(lpoSummary);
      
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
      await downloadLPOPDF(lpoSummary);
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
      await downloadLPOImage(lpoSummary);
      alert('✓ LPO image downloaded successfully!');
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Failed to download LPO as image. Please try again.');
    }
    setShowCopyDropdown(false);
  };

  const handleEntryEdit = (index: number, field: keyof LPODetail, value: string | number) => {
    const updatedEntries = [...editedSheet.entries];
    updatedEntries[index] = {
      ...updatedEntries[index],
      [field]: value
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
    <div className="h-full flex flex-col bg-white">
      {/* Sheet Header - LPO Header Info */}
      <div className="border-b bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 gap-8 mb-4">
            {/* Left Column */}
            <div className="space-y-3">
              <div className="flex items-center space-x-4">
                <span className="font-medium text-gray-700 w-20">LPO No.:</span>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedSheet.lpoNo}
                    onChange={(e) => handleHeaderEdit('lpoNo', e.target.value)}
                    className="px-2 py-1 border rounded font-bold text-lg"
                  />
                ) : (
                  <span className="font-bold text-lg text-blue-600">{editedSheet.lpoNo}</span>
                )}
              </div>
              
              <div className="flex items-center space-x-4">
                <span className="font-medium text-gray-700 w-20">Station:</span>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedSheet.station}
                    onChange={(e) => handleHeaderEdit('station', e.target.value)}
                    className="px-2 py-1 border rounded"
                  />
                ) : (
                  <span className="font-medium">{editedSheet.station}</span>
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-3">
              <div className="flex items-center space-x-4">
                <span className="font-medium text-gray-700 w-20">Date:</span>
                {isEditing ? (
                  <input
                    type="date"
                    value={editedSheet.date}
                    onChange={(e) => handleHeaderEdit('date', e.target.value)}
                    className="px-2 py-1 border rounded"
                  />
                ) : (
                  <span className="font-medium">{new Date(editedSheet.date).toLocaleDateString()}</span>
                )}
              </div>
              
              <div className="flex items-center space-x-4">
                <span className="font-medium text-gray-700 w-20">Order of:</span>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedSheet.orderOf}
                    onChange={(e) => handleHeaderEdit('orderOf', e.target.value)}
                    className="px-2 py-1 border rounded"
                  />
                ) : (
                  <span className="font-medium">{editedSheet.orderOf}</span>
                )}
              </div>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-600 font-medium">KINDLY SUPPLY THE FOLLOWING LITERS</p>
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
                    <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                      <div className="py-1">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Copy Options
                        </div>
                        <button
                          onClick={handleCopyImageToClipboard}
                          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Image className="w-4 h-4 mr-2" />
                          Copy as Image
                        </button>
                        <button
                          onClick={handleCopyWhatsAppText}
                          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Copy for WhatsApp
                        </button>
                        <button
                          onClick={handleCopyCsvText}
                          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Calculator className="w-4 h-4 mr-2" />
                          Copy as CSV Text
                        </button>
                        
                        <div className="border-t border-gray-200 my-1"></div>
                        
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Download Options
                        </div>
                        <button
                          onClick={handleDownloadPDF}
                          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <FileDown className="w-4 h-4 mr-2 text-red-600" />
                          Download as PDF
                        </button>
                        <button
                          onClick={handleDownloadImage}
                          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
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

      {/* Sheet Content - Excel-like Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="bg-blue-50 border-b border-gray-300">
              <div className="grid grid-cols-7 gap-0">
                <div className="px-3 py-2 font-medium text-gray-900 border-r border-gray-300">DO No.</div>
                <div className="px-3 py-2 font-medium text-gray-900 border-r border-gray-300">Truck No.</div>
                <div className="px-3 py-2 font-medium text-gray-900 border-r border-gray-300 text-right">Liters</div>
                <div className="px-3 py-2 font-medium text-gray-900 border-r border-gray-300 text-right">Rate</div>
                <div className="px-3 py-2 font-medium text-gray-900 border-r border-gray-300 text-right">Amount</div>
                <div className="px-3 py-2 font-medium text-gray-900 border-r border-gray-300">Dest.</div>
                <div className="px-3 py-2 font-medium text-gray-900 text-center">Actions</div>
              </div>
            </div>

            {/* Table Body - Existing Entries */}
            {editedSheet.entries.map((entry, index) => (
              <div key={index} className="border-b border-gray-200 hover:bg-gray-50">
                <div className="grid grid-cols-7 gap-0">
                  <div className="px-3 py-2 border-r border-gray-300">
                    {editingRow === index ? (
                      <input
                        type="text"
                        value={entry.doNo}
                        onChange={(e) => handleEntryEdit(index, 'doNo', e.target.value)}
                        className="w-full px-1 py-0 text-sm border rounded"
                      />
                    ) : (
                      <span className="text-sm">{entry.doNo}</span>
                    )}
                  </div>
                  
                  <div className="px-3 py-2 border-r border-gray-300">
                    {editingRow === index ? (
                      <input
                        type="text"
                        value={entry.truckNo}
                        onChange={(e) => handleEntryEdit(index, 'truckNo', e.target.value)}
                        className="w-full px-1 py-0 text-sm border rounded"
                      />
                    ) : (
                      <span className="text-sm font-medium">{entry.truckNo}</span>
                    )}
                  </div>
                  
                  <div className="px-3 py-2 border-r border-gray-300 text-right">
                    {editingRow === index ? (
                      <input
                        type="number"
                        value={entry.liters}
                        onChange={(e) => handleEntryEdit(index, 'liters', parseFloat(e.target.value) || 0)}
                        className="w-full px-1 py-0 text-sm border rounded text-right"
                      />
                    ) : (
                      <span className="text-sm">{entry.liters}</span>
                    )}
                  </div>
                  
                  <div className="px-3 py-2 border-r border-gray-300 text-right">
                    {editingRow === index ? (
                      <input
                        type="number"
                        step="0.1"
                        value={entry.rate}
                        onChange={(e) => handleEntryEdit(index, 'rate', parseFloat(e.target.value) || 0)}
                        className="w-full px-1 py-0 text-sm border rounded text-right"
                      />
                    ) : (
                      <span className="text-sm">{entry.rate}</span>
                    )}
                  </div>
                  
                  <div className="px-3 py-2 border-r border-gray-300 text-right">
                    <span className="text-sm font-medium">{formatCurrency(entry.amount)}</span>
                  </div>
                  
                  <div className="px-3 py-2 border-r border-gray-300">
                    {editingRow === index ? (
                      <input
                        type="text"
                        value={entry.dest}
                        onChange={(e) => handleEntryEdit(index, 'dest', e.target.value)}
                        className="w-full px-1 py-0 text-sm border rounded"
                      />
                    ) : (
                      <span className="text-sm">{entry.dest}</span>
                    )}
                  </div>
                  
                  <div className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      {editingRow === index ? (
                        <>
                          <button
                            onClick={() => handleRowSave(index)}
                            className="p-1 text-green-600 hover:text-green-800"
                            title="Save & Update Fuel Record"
                          >
                            <Save className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleRowCancel(index)}
                            className="p-1 text-gray-600 hover:text-gray-800"
                            title="Cancel"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEditingRow(index)}
                          className="p-1 text-blue-600 hover:text-blue-800"
                          title="Edit Entry"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Locked Sheet Notice */}
            <div className="bg-amber-50 border-b border-gray-300">
              <div className="px-4 py-3 flex items-center justify-center text-amber-700">
                <Lock className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">
                  Sheet is locked - Only editing existing entries is allowed. Adding or removing trucks is disabled.
                </span>
              </div>
            </div>

            {/* Total Row */}
            <div className="bg-blue-100 font-semibold">
              <div className="grid grid-cols-7 gap-0">
                <div className="px-3 py-3 border-r border-gray-300"></div>
                <div className="px-3 py-3 border-r border-gray-300"></div>
                <div className="px-3 py-3 border-r border-gray-300 text-right">TOTAL</div>
                <div className="px-3 py-3 border-r border-gray-300"></div>
                <div className="px-3 py-3 border-r border-gray-300 text-right text-lg font-bold text-blue-900">
                  {formatCurrency(editedSheet.total)}
                </div>
                <div className="px-3 py-3 border-r border-gray-300"></div>
                <div className="px-3 py-3 text-center">
                  <Calculator className="w-4 h-4 text-blue-600 mx-auto" />
                </div>
              </div>
            </div>
          </div>

          {/* Summary Statistics */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600">Total Entries</div>
              <div className="text-2xl font-bold text-blue-600">{editedSheet.entries.length}</div>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600">Total Liters</div>
              <div className="text-2xl font-bold text-green-600">
                {editedSheet.entries.reduce((sum, entry) => sum + entry.liters, 0)}
              </div>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600">Total Amount</div>
              <div className="text-2xl font-bold text-purple-600">
                {formatCurrency(editedSheet.total)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LPOSheetView;