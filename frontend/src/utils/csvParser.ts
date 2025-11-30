import Papa from 'papaparse';
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
