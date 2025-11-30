/**
 * Utility functions for cleaning up corrupted data in the system
 */
import { DeliveryOrder } from '../types';

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