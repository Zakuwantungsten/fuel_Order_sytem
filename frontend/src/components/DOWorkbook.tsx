import React, { useState, useEffect } from 'react';
import { X, Download, FileSpreadsheet, Edit2 } from 'lucide-react';
import type { DOWorkbook as DOWorkbookType, DeliveryOrder } from '../types';
import { doWorkbookAPI } from '../services/api';
import DOSheetView from './DOSheetView';

interface DOWorkbookProps {
  workbookId?: string | number; // Can be year number or ID
  onClose?: () => void;
  initialDoNumber?: string; // DO number to open by default
}

const DOWorkbook: React.FC<DOWorkbookProps> = ({ workbookId, onClose, initialDoNumber }) => {
  const [workbook, setWorkbook] = useState<DOWorkbookType | null>(null);
  const [activeSheetId, setActiveSheetId] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(true);
  const [workbookName, setWorkbookName] = useState('');
  const [isRenamingWorkbook, setIsRenamingWorkbook] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (workbookId) {
      fetchWorkbook(workbookId);
    } else {
      // Use current year
      fetchWorkbook(new Date().getFullYear());
    }
  }, [workbookId]);

  const fetchWorkbook = async (idOrYear: string | number) => {
    try {
      setLoading(true);
      // Determine if it's a year (4-digit number) or an ID
      const year = typeof idOrYear === 'number' && idOrYear >= 2000 && idOrYear <= 2100 
        ? idOrYear 
        : new Date().getFullYear();
      
      const data = await doWorkbookAPI.getByYear(year);
      setWorkbook(data);
      setWorkbookName(data.name);
      
      if (data.sheets && data.sheets.length > 0) {
        // If initialDoNumber is provided, find and select that sheet
        if (initialDoNumber) {
          const targetSheet = data.sheets.find(sheet => sheet.doNumber === initialDoNumber);
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
      setWorkbook(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExportWorkbook = async () => {
    if (!workbook) return;
    
    try {
      setExporting(true);
      await doWorkbookAPI.exportWorkbook(workbook.year);
      alert(`✓ Workbook DELIVERY_ORDERS_${workbook.year}.xlsx downloaded successfully!`);
    } catch (error) {
      console.error('Error exporting workbook:', error);
      alert('Error exporting workbook. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const getActiveSheet = (): DeliveryOrder | null => {
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
        <div className="text-center">
          <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400">No delivery orders found for this year</p>
          {onClose && (
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Go Back
            </button>
          )}
        </div>
      </div>
    );
  }

  const activeSheet = getActiveSheet();

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 transition-colors">
      {/* Workbook Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <FileSpreadsheet className="w-6 h-6 text-blue-600 dark:text-blue-400" />
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
                    if (e.key === 'Enter' || e.key === 'Escape') setIsRenamingWorkbook(false);
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
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ({workbook.sheets?.length || 0} DOs)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
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
              {exporting ? 'Exporting...' : 'Export All'}
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
        <div className="flex items-center overflow-x-auto">
          {(workbook.sheets || []).map((sheet) => (
            <div key={sheet.id} className="flex items-center">
              <button
                onClick={() => setActiveSheetId(sheet.id!)}
                className={`px-4 py-2 text-sm font-medium border-r border-gray-300 dark:border-gray-600 whitespace-nowrap ${
                  activeSheetId === sheet.id
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                <span>{sheet.doType || 'DO'}-{sheet.doNumber}</span>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {sheet.importOrExport}
                </div>
              </button>
            </div>
          ))}
          
          {workbook.sheets?.length === 0 && (
            <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
              No delivery orders in this workbook
            </div>
          )}
        </div>
      </div>

      {/* Sheet Content */}
      <div className="flex-1 overflow-hidden">
        {activeSheet ? (
          <DOSheetView
            order={activeSheet}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <p>No sheet selected</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Select a DO tab above to view the delivery order
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DOWorkbook;
