/**
 * Utility functions for cleaning up corrupted data in the system
 */
import { DeliveryOrder } from '../types';

/**
 * Format truck number to standard format: T(number)(space)(letters)
 * Example: "t103dvl" -> "T103 DVL", "T103DVL" -> "T103 DVL", "t 103 dvl" -> "T103 DVL"
 * @param truckNo - The truck number to format
 * @returns Formatted truck number in standard format (e.g., "T103 DVL")
 */
export const formatTruckNumber = (truckNo: string | undefined | null): string => {
  if (!truckNo || typeof truckNo !== 'string') return '';
  
  // Remove all spaces and convert to uppercase
  const cleaned = truckNo.replace(/\s+/g, '').toUpperCase();
  
  // Match the pattern: T followed by numbers followed by letters
  const match = cleaned.match(/^T?(\d+)([A-Z]+)$/);
  
  if (match) {
    const [, numbers, letters] = match;
    return `T${numbers} ${letters}`;
  }
  
  // If it already has the correct format with space, normalize it
  const spaceMatch = truckNo.toUpperCase().match(/^T?(\d+)\s+([A-Z]+)$/);
  if (spaceMatch) {
    const [, numbers, letters] = spaceMatch;
    return `T${numbers} ${letters}`;
  }
  
  // Return original value in uppercase if it doesn't match expected pattern
  return truckNo.toUpperCase().trim();
};

/**
 * Clean driver name field to remove tonnage data corruption
 */
export const cleanDriverName = (driverName: string | undefined | null): string => {
  if (!driverName || typeof driverName !== 'string') return '';
  
  const cleanName = driverName.trim();
  
  // Check if it contains tonnage patterns like "28, 0 TONS" or just numbers
  const tonnagePatterns = [
    /^\d+([,.]?\s*\d+)?\s*(TONS?|KG|MT)$/i,  // "28 TONS", "28.5 TONS", "28, 0 TONS"
    /^\d+([,.]?\s*\d+)?$/,                    // Just numbers like "28" or "28.5"
    /^\d+,\s*\d+\s*TONS?$/i,                 // "28, 0 TONS" specifically
  ];
  
  const isCorrupted = tonnagePatterns.some(pattern => pattern.test(cleanName));
  
  if (isCorrupted) {
    console.warn('Driver name contains tonnage data, cleaning:', cleanName);
    return '';
  }
  
  return cleanName;
};

/**
 * Clean and validate a delivery order object
 */
export const cleanDeliveryOrder = (order: Partial<DeliveryOrder>): Partial<DeliveryOrder> => {
  const cleaned = { ...order };
  
  // Clean driver name
  if (cleaned.driverName) {
    cleaned.driverName = cleanDriverName(cleaned.driverName);
  }
  
  // Validate tonnages is a number
  if (cleaned.tonnages && typeof cleaned.tonnages === 'string') {
    const tonnageNum = parseFloat(cleaned.tonnages);
    if (!isNaN(tonnageNum)) {
      cleaned.tonnages = tonnageNum;
    }
  }
  
  // Validate rate per ton is a number
  if (cleaned.ratePerTon && typeof cleaned.ratePerTon === 'string') {
    const rateNum = parseFloat(cleaned.ratePerTon);
    if (!isNaN(rateNum)) {
      cleaned.ratePerTon = rateNum;
    }
  }
  
  return cleaned;
};

/**
 * Clean an array of delivery orders
 */
export const cleanDeliveryOrders = (orders: DeliveryOrder[]): DeliveryOrder[] => {
  return orders.map(order => cleanDeliveryOrder(order) as DeliveryOrder);
};

/**
 * Check if a driver name appears to be corrupted tonnage data
 */
export const isCorruptedDriverName = (driverName: string | undefined | null): boolean => {
  if (!driverName || typeof driverName !== 'string') return false;
  
  const cleanName = driverName.trim();
  const tonnagePatterns = [
    /^\d+([,.]?\s*\d+)?\s*(TONS?|KG|MT)$/i,
    /^\d+([,.]?\s*\d+)?$/,
    /^\d+,\s*\d+\s*TONS?$/i,
  ];
  
  return tonnagePatterns.some(pattern => pattern.test(cleanName));
};