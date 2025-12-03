import Papa from 'papaparse';
import * as XLSX from 'xlsx-js-style';
import { DeliveryOrder, LPOEntry, FuelRecord } from '../types';

export const parseCSV = <T>(csvText: string): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        resolve(results.data);
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
};

export const loadCSVFile = async (filePath: string): Promise<string> => {
  const response = await fetch(filePath);
  if (!response.ok) {
    throw new Error(`Failed to load CSV file: ${filePath}`);
  }
  return response.text();
};

// Transform raw CSV data to typed DeliveryOrder
export const parseDeliveryOrders = (rawData: any[]): DeliveryOrder[] => {
  return rawData.map((row, index) => ({
    id: index + 1,
    sn: row['SN'] || row['S/N'] || 0,
    date: row['DATE '] || row['Date'] || '',
    importOrExport: (row['IMPORT OR EXPORT'] || 'IMPORT') as 'IMPORT' | 'EXPORT',
    doType: (row['DO Type'] || 'DO') as 'DO' | 'SDO',
    doNumber: row['D.O No.'] || row['DO No.'] || '',
    invoiceNos: row['Invoice Nos'] || '',
    clientName: row['CLIENT NAME '] || row['CLIENT NAME'] || '',
    truckNo: row['TRUCK No.'] || row['Truck No.'] || '',
    trailerNo: row['TRAILER No.'] || row['Trailer No.'] || '',
    containerNo: row['CONTAINER No.'] || row['Container No.'] || '',
    borderEntryDRC: row['BORDER ENTRY DRC'] || '',
    loadingPoint: row['LOADING POINT'] || row['Loading Point'] || '',
    destination: row['DESTINATION'] || row['Destination'] || '',
    haulier: row['HAULIER'] || row['Haulier'] || '',
    tonnages: parseFloat(row['TONNAGES '] || row['Tonnages'] || 0),
    ratePerTon: parseFloat(row['RATE PER TON'] || row['Rate Per Ton'] || 0),
    rate: row['RATE'] || '',
  }));
};

// Transform raw CSV data to typed LPOEntry
export const parseLPOEntries = (rawData: any[]): LPOEntry[] => {
  return rawData.map((row, index) => ({
    id: index + 1,
    sn: row['S/No.'] || row['SN'] || 0,
    date: row['Date'] || '',
    lpoNo: row['LPO No.'] || row['LPO No'] || '',
    dieselAt: row['Diesel @'] || '',
    doSdo: row['DO/SDO'] || '',
    truckNo: row['Truck No.'] || '',
    ltrs: parseFloat(row['Ltrs'] || row['Liters'] || 0),
    pricePerLtr: parseFloat(row['Price per Ltr'] || row['Price/Ltr'] || 0),
    destinations: row['Destinations'] || row['Destination'] || '',
  }));
};

// Transform raw CSV data to typed FuelRecord
export const parseFuelRecords = (rawData: any[]): FuelRecord[] => {
  return rawData.map((row, index) => ({
    id: index + 1,
    date: row['Date'] || '',
    truckNo: row['Truck No.'] || '',
    goingDo: row['Going Do'] || '',
    returnDo: row['Return Do'] || '',
    start: row['Start'] || '',
    from: row['From'] || '',
    to: row['To'] || '',
    totalLts: parseFloat(row['Total Lts'] || 0),
    extra: parseFloat(row['Extra']) || undefined,
    mmsaYard: parseFloat(row['MMSA Yard']) || undefined,
    tangaYard: parseFloat(row['Tanga Yard']) || undefined,
    darYard: parseFloat(row['Dar Yard']) || undefined,
    darGoing: parseFloat(row['Dar Going']) || undefined,
    moroGoing: parseFloat(row['Moro Going']) || undefined,
    mbeyaGoing: parseFloat(row['Mbeya Going']) || undefined,
    tdmGoing: parseFloat(row['Tdm Going']) || undefined,
    zambiaGoing: parseFloat(row['Zambia Going']) || undefined,
    congoFuel: parseFloat(row['Congo Fuel']) || undefined,
    zambiaReturn: parseFloat(row['Zambia Return']) || undefined,
    tundumaReturn: parseFloat(row['Tunduma Return ']) || undefined,
    mbeyaReturn: parseFloat(row['Mbeya Return']) || undefined,
    moroReturn: parseFloat(row['Moro Return']) || undefined,
    darReturn: parseFloat(row['Dar Return']) || undefined,
    tangaReturn: parseFloat(row['Tanga Return']) || undefined,
    balance: parseFloat(row['Balance'] || 0),
  }));
};

// Helper to download CSV
export const exportToCSV = (data: any[], filename: string) => {
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Helper to export data as XLSX with formatting
interface ExportToXLSXOptions {
  sheetName?: string;
  headerColor?: string;
  headerTextColor?: string;
  addBorders?: boolean;
  columnWidths?: number[];
  wrapHeader?: boolean;
  centerAllCells?: boolean;
  strikethroughCancelledRows?: boolean; // Apply red strikethrough to cancelled rows (uses _isCancelled field)
}

export const exportToXLSX = (
  data: any[], 
  filename: string, 
  options: ExportToXLSXOptions = {}
) => {
  const {
    sheetName = 'Sheet1',
    headerColor = '4472C4',
    headerTextColor = 'FFFFFF',
    addBorders = true,
    columnWidths,
    wrapHeader = false,
    centerAllCells = false,
    strikethroughCancelledRows = false,
  } = options;

  // Track which rows are cancelled (for strikethrough styling)
  const cancelledRows: Set<number> = new Set();
  if (strikethroughCancelledRows) {
    data.forEach((row, index) => {
      if (row._isCancelled) {
        cancelledRows.add(index + 1); // +1 because row 0 is header
      }
    });
    // Remove the _isCancelled field from data before creating sheet
    data = data.map(row => {
      const { _isCancelled, ...rest } = row;
      return rest;
    });
  }

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);

  // Get the range of the worksheet
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  // Style the header row
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (ws[cellRef]) {
      ws[cellRef].s = {
        fill: {
          fgColor: { rgb: headerColor },
        },
        font: {
          bold: true,
          color: { rgb: headerTextColor },
          sz: 10,
        },
        alignment: {
          horizontal: 'center',
          vertical: 'center',
          wrapText: wrapHeader,
        },
        border: addBorders ? {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        } : undefined,
      };
    }
  }

  // Set row height for header if wrapping
  if (wrapHeader) {
    ws['!rows'] = [{ hpt: 40 }]; // Header row height - taller to fit two lines of wrapped text
  }

  // Style data cells with borders and strikethrough for cancelled rows
  for (let row = 1; row <= range.e.r; row++) {
    const isCancelledRow = cancelledRows.has(row);
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      if (ws[cellRef]) {
        ws[cellRef].s = {
          ...ws[cellRef].s,
          font: isCancelledRow ? {
            strike: true,
            color: { rgb: 'FF0000' }, // Red text for cancelled
          } : undefined,
          border: addBorders ? {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
          } : undefined,
          alignment: {
            horizontal: centerAllCells ? 'center' : undefined,
            vertical: 'center',
          },
        };
      } else if (addBorders) {
        // Create empty cell with border (and strikethrough if cancelled)
        ws[cellRef] = {
          v: '',
          s: {
            font: isCancelledRow ? {
              strike: true,
              color: { rgb: 'FF0000' },
            } : undefined,
            border: {
              top: { style: 'thin', color: { rgb: '000000' } },
              bottom: { style: 'thin', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: '000000' } },
              right: { style: 'thin', color: { rgb: '000000' } },
            },
            alignment: centerAllCells ? { horizontal: 'center', vertical: 'center' } : undefined,
          },
        };
      }
    }
  }

  // Set column widths
  if (columnWidths && columnWidths.length > 0) {
    ws['!cols'] = columnWidths.map(width => ({ wch: width }));
  } else {
    // Auto-calculate column widths based on content
    const colWidths: { wch: number }[] = [];
    for (let col = range.s.c; col <= range.e.c; col++) {
      let maxWidth = 8; // minimum width
      for (let row = range.s.r; row <= range.e.r; row++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        if (ws[cellRef] && ws[cellRef].v) {
          const cellValue = String(ws[cellRef].v);
          maxWidth = Math.max(maxWidth, Math.min(cellValue.length + 2, 15));
        }
      }
      colWidths.push({ wch: maxWidth });
    }
    ws['!cols'] = colWidths;
  }

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Generate and download file
  XLSX.writeFile(wb, filename);
};

// Interface for multi-sheet export
interface SheetData {
  sheetName: string;
  data: any[];
}

// Helper to export data as XLSX with multiple sheets (one per month)
export const exportToXLSXMultiSheet = (
  sheets: SheetData[],
  filename: string,
  options: ExportToXLSXOptions = {}
) => {
  const {
    headerColor = '4472C4',
    headerTextColor = 'FFFFFF',
    addBorders = true,
    columnWidths,
    wrapHeader = false,
    centerAllCells = false,
    strikethroughCancelledRows = false,
  } = options;

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Process each sheet
  sheets.forEach(({ sheetName, data }) => {
    // Track which rows are cancelled (for strikethrough styling)
    const cancelledRows: Set<number> = new Set();
    let processedData = data;
    
    if (strikethroughCancelledRows) {
      data.forEach((row, index) => {
        if (row._isCancelled) {
          cancelledRows.add(index + 1); // +1 because row 0 is header
        }
      });
      // Remove the _isCancelled field from data before creating sheet
      processedData = data.map(row => {
        const { _isCancelled, ...rest } = row;
        return rest;
      });
    }

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(processedData);

    // Get the range of the worksheet
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    // Style the header row
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
      if (ws[cellRef]) {
        ws[cellRef].s = {
          fill: {
            fgColor: { rgb: headerColor },
          },
          font: {
            bold: true,
            color: { rgb: headerTextColor },
            sz: 10,
          },
          alignment: {
            horizontal: 'center',
            vertical: 'center',
            wrapText: wrapHeader,
          },
          border: addBorders ? {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
          } : undefined,
        };
      }
    }

    // Set row height for header if wrapping
    if (wrapHeader) {
      ws['!rows'] = [{ hpt: 40 }];
    }

    // Style data cells with borders and strikethrough for cancelled rows
    for (let row = 1; row <= range.e.r; row++) {
      const isCancelledRow = cancelledRows.has(row);
      
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        if (ws[cellRef]) {
          ws[cellRef].s = {
            ...ws[cellRef].s,
            font: isCancelledRow ? {
              strike: true,
              color: { rgb: 'FF0000' },
            } : undefined,
            border: addBorders ? {
              top: { style: 'thin', color: { rgb: '000000' } },
              bottom: { style: 'thin', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: '000000' } },
              right: { style: 'thin', color: { rgb: '000000' } },
            } : undefined,
            alignment: {
              horizontal: centerAllCells ? 'center' : undefined,
              vertical: 'center',
            },
          };
        } else if (addBorders) {
          ws[cellRef] = {
            v: '',
            s: {
              font: isCancelledRow ? {
                strike: true,
                color: { rgb: 'FF0000' },
              } : undefined,
              border: {
                top: { style: 'thin', color: { rgb: '000000' } },
                bottom: { style: 'thin', color: { rgb: '000000' } },
                left: { style: 'thin', color: { rgb: '000000' } },
                right: { style: 'thin', color: { rgb: '000000' } },
              },
              alignment: centerAllCells ? { horizontal: 'center', vertical: 'center' } : undefined,
            },
          };
        }
      }
    }

    // Set column widths
    if (columnWidths && columnWidths.length > 0) {
      ws['!cols'] = columnWidths.map(width => ({ wch: width }));
    } else {
      const colWidths: { wch: number }[] = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        let maxWidth = 8;
        for (let row = range.s.r; row <= range.e.r; row++) {
          const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
          if (ws[cellRef] && ws[cellRef].v) {
            const cellValue = String(ws[cellRef].v);
            maxWidth = Math.max(maxWidth, Math.min(cellValue.length + 2, 15));
          }
        }
        colWidths.push({ wch: maxWidth });
      }
      ws['!cols'] = colWidths;
    }

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // Generate and download file
  XLSX.writeFile(wb, filename);
};
