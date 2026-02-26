import React, { useState, useEffect } from 'react';
import { X, Download, Save, FileSpreadsheet, Edit2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LPOWorkbook, LPOSummary } from '../types';
import { lpoWorkbookAPI, lpoDocumentsAPI } from '../services/api';
import LPOSheetView from './LPOSheetView';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

interface LPOWorkbookProps {
  workbookId?: string | number; // Can be year number or ID
  onClose?: () => void;
  initialLpoNo?: string; // LPO number to open by default
}

const TABS_PER_PAGE = 8;

const LPOWorkbook: React.FC<LPOWorkbookProps> = ({ workbookId, onClose, initialLpoNo }) => {
  const [workbook, setWorkbook] = useState<LPOWorkbook | null>(null);
  const [activeSheetId, setActiveSheetId] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRenaming, setIsRenaming] = useState<string | number | null>(null);
  const [newSheetName, setNewSheetName] = useState('');
  const [workbookName, setWorkbookName] = useState('');
  const [isRenamingWorkbook, setIsRenamingWorkbook] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tabPageStart, setTabPageStart] = useState(0);

  useEffect(() => {
    if (workbookId) {
      fetchWorkbook(workbookId);
    } else {
      // Use current year
      fetchWorkbook(new Date().getFullYear());
    }
  }, [workbookId, initialLpoNo]);

  const fetchWorkbook = async (idOrYear: string | number) => {
    try {
      setLoading(true);
      // Determine if it's a year (4-digit number) or an ID
      const year = typeof idOrYear === 'number' && idOrYear >= 2000 && idOrYear <= 2100 
        ? idOrYear 
        : new Date().getFullYear();
      
      const data = await lpoWorkbookAPI.getByYear(year);
      setWorkbook(data);
      setWorkbookName(data.name);
      if (data.sheets && data.sheets.length > 0) {
        // If initialLpoNo is provided, find and select that sheet
        if (initialLpoNo) {
          const targetSheet = data.sheets.find(sheet => sheet.lpoNo === initialLpoNo);
          if (targetSheet && targetSheet.id) {
            setActiveSheetId(targetSheet.id);
          } else {
            setActiveSheetId(data.sheets[0].id!);
          }
        } else {
          setActiveSheetId(data.sheets[0].id!);
        }
      }
    } catch (error) {
      console.error('Error fetching workbook:', error);
      // If not found, show empty state
      setWorkbook(null);
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync(['lpo_entries', 'lpo_summaries'], () => {
    fetchWorkbook(workbookId || new Date().getFullYear());
  });

  useEffect(() => {
    if (!workbook?.sheets || activeSheetId === null) return;
    const activeIndex = workbook.sheets.findIndex(s => s.id === activeSheetId);
    if (activeIndex < 0) return;
    setTabPageStart(prev => {
      if (activeIndex < prev) return activeIndex;
      if (activeIndex >= prev + TABS_PER_PAGE) return activeIndex - TABS_PER_PAGE + 1;
      return prev;
    });
  }, [activeSheetId, workbook?.sheets]);

  const handleRenameSheet = async (sheetId: string | number | undefined, newName: string) => {
    if (!workbook || !sheetId) {
      alert('Cannot rename: Sheet ID is missing.');
      setIsRenaming(null);
      return;
    }
    
    try {
      const updatedSheet = await lpoDocumentsAPI.update(sheetId, {
        lpoNo: newName
      });
      
      setWorkbook(prev => prev ? {
        ...prev,
        sheets: (prev.sheets || []).map(sheet => 
          sheet.id === sheetId ? { ...sheet, ...updatedSheet } : sheet
        )
      } : null);
      
      setIsRenaming(null);
    } catch (error: any) {
      console.error('Error renaming sheet:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
      alert(`Error renaming LPO sheet: ${errorMsg}`);
    }
  };

  const handleSaveWorkbook = async () => {
    // In the new model, workbooks are auto-managed by year
    // Individual sheets are saved automatically
    setIsRenamingWorkbook(false);
    alert('All changes are saved automatically!');
  };

  const handleExportWorkbook = async () => {
    if (!workbook) return;
    
    try {
      setExporting(true);
      await lpoWorkbookAPI.exportWorkbook(workbook.year);
      alert(`✓ Workbook LPOS_${workbook.year}.xlsx downloaded successfully!`);
    } catch (error) {
      console.error('Error exporting workbook:', error);
      alert('Error exporting workbook. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const getActiveSheet = (): LPOSummary | null => {
    if (!workbook || !activeSheetId || !workbook.sheets) return null;
    return workbook.sheets.find(sheet => sheet.id === activeSheetId) || null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">Loading workbook...</div>
      </div>
    );
  }

  if (!workbook) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500 dark:text-red-400">Failed to load workbook</div>
      </div>
    );
  }

  const activeSheet = getActiveSheet();
  const sheets = workbook.sheets || [];
  const visibleSheets = sheets.slice(tabPageStart, tabPageStart + TABS_PER_PAGE);
  const canGoPrev = tabPageStart > 0;
  const canGoNext = tabPageStart + TABS_PER_PAGE < sheets.length;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 transition-colors">
      {/* Workbook Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <FileSpreadsheet className="w-6 h-6 text-green-600 dark:text-green-400" />
            {isRenamingWorkbook ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={workbookName}
                  onChange={(e) => setWorkbookName(e.target.value)}
                  className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-lg font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  autoFocus
                  onBlur={() => setIsRenamingWorkbook(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveWorkbook();
                    if (e.key === 'Escape') setIsRenamingWorkbook(false);
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{workbook.name}</h1>
                <button
                  onClick={() => setIsRenamingWorkbook(true)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleSaveWorkbook}
              className="flex items-center px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </button>
            <button
              onClick={handleExportWorkbook}
              disabled={exporting}
              className={`flex items-center px-3 py-1 text-white rounded ${
                exporting 
                  ? 'bg-green-400 dark:bg-green-500 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600'
              }`}
            >
              <Download className="w-4 h-4 mr-1" />
              {exporting ? 'Exporting...' : 'Export'}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sheet Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700">
        <div className="flex items-center">
          {canGoPrev && (
            <button
              onClick={() => setTabPageStart(prev => Math.max(0, prev - TABS_PER_PAGE))}
              className="px-2 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-r border-gray-300 dark:border-gray-600 flex-shrink-0"
              title="Previous sheets"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          {visibleSheets.map((sheet, index) => (
            <div key={sheet.id || `sheet-${sheet.lpoNo}-${tabPageStart + index}`} className="flex items-center">
              <button
                onClick={() => sheet.id && setActiveSheetId(sheet.id)}
                className={`px-4 py-2 text-sm font-medium border-r border-gray-300 dark:border-gray-600 whitespace-nowrap ${
                  activeSheetId === sheet.id
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {isRenaming === sheet.id ? (
                  <input
                    type="text"
                    value={newSheetName}
                    onChange={(e) => setNewSheetName(e.target.value)}
                    onBlur={() => setIsRenaming(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && sheet.id) {
                        handleRenameSheet(sheet.id, newSheetName);
                      }
                      if (e.key === 'Escape') {
                        setIsRenaming(null);
                      }
                    }}
                    className="w-20 px-1 py-0 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    autoFocus
                  />
                ) : (
                  <span>LPO {sheet.lpoNo}</span>
                )}
              </button>
              {activeSheetId === sheet.id && (
                <button
                  onClick={() => {
                    if (sheet.id) {
                      setIsRenaming(sheet.id);
                      setNewSheetName(sheet.lpoNo);
                    }
                  }}
                  disabled={!sheet.id}
                  className={`p-1 ml-1 ${!sheet.id ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                  title={!sheet.id ? 'Cannot rename: No ID' : 'Rename'}
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {canGoNext && (
            <button
              onClick={() => setTabPageStart(prev => Math.min(sheets.length - TABS_PER_PAGE, prev + TABS_PER_PAGE))}
              className="px-2 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-l border-gray-300 dark:border-gray-600 flex-shrink-0"
              title="Next sheets"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sheet Content */}
      <div className="flex-1 overflow-hidden">
        {activeSheet ? (
          <LPOSheetView
            sheet={activeSheet}
            workbookId={workbook.id!}
            onUpdate={(updatedSheet) => {
              setWorkbook(prev => prev ? {
                ...prev,
                sheets: (prev.sheets || []).map(sheet => 
                  sheet.id === updatedSheet.id ? updatedSheet : sheet
                )
              } : null);
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <p>No LPO sheets available</p>
              <p className="text-sm mt-2">Create LPOs using the LPO form to see them here</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LPOWorkbook;