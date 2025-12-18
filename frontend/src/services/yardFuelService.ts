import { YardFuelDispense, FuelRecord } from '../types';
import { yardFuelAPI, fuelRecordsAPI } from './api';
import { formatTruckNumber } from '../utils/dataCleanup';

/**
 * Service for handling yard fuel dispensing operations
 * Manages auto-linking of yard fuel entries to fuel records
 */

export const yardFuelService = {
  /**
   * Search for active fuel records by truck number
   * Returns fuel records that might need yard fuel
   * Excludes cancelled fuel records
   * No date restriction - searches all records
   */
  searchActiveFuelRecords: async (truckNo: string): Promise<FuelRecord[]> => {
    try {
      const response = await fuelRecordsAPI.getAll({ 
        truckNo,
        limit: 10000
      });
      const fuelRecords = response.data;
      
      // Filter out cancelled fuel records (backend now does this by default)
      return fuelRecords.filter((r: FuelRecord) => !r.isCancelled);
    } catch (error) {
      console.error('Error searching active fuel records:', error);
      return [];
    }
  },

  /**
   * Get truck information from recent DOs or fuel records
   */
  searchTruckInfo: async (truckNo: string) => {
    try {
      const activeFuelRecords = await yardFuelService.searchActiveFuelRecords(truckNo);
      
      if (activeFuelRecords.length > 0) {
        const latestRecord = activeFuelRecords[0];
        return {
          truckNo: latestRecord.truckNo,
          doNumber: latestRecord.goingDo,
          destination: latestRecord.to,
          fuelRecordId: latestRecord.id,
          hasActiveRecord: true,
        };
      }
      
      return {
        truckNo: formatTruckNumber(truckNo),
        hasActiveRecord: false,
      };
    } catch (error) {
      console.error('Error searching truck info:', error);
      return {
        truckNo: formatTruckNumber(truckNo),
        hasActiveRecord: false,
      };
    }
  },

  /**
   * Record fuel dispensed at yard
   * Automatically links to fuel record if found
   */
  dispenseYardFuel: async (dispense: Omit<YardFuelDispense, 'id' | 'timestamp' | 'autoLinked' | 'linkedFuelRecordId' | 'linkedDONumber' | 'status'>): Promise<YardFuelDispense> => {
    try {
      const timestamp = new Date().toISOString();
      
      // Try to auto-link to fuel record
      const truckInfo = await yardFuelService.searchTruckInfo(dispense.truckNo);
      
      const newDispense: Partial<YardFuelDispense> = {
        ...dispense,
        timestamp,
        autoLinked: truckInfo.hasActiveRecord,
        linkedFuelRecordId: truckInfo.fuelRecordId,
        linkedDONumber: truckInfo.doNumber,
        status: truckInfo.hasActiveRecord ? 'linked' : 'pending',
      };

      // Save to backend
      const createdDispense = await yardFuelAPI.create(newDispense);

      // Update fuel record if linked
      if (createdDispense.linkedFuelRecordId && createdDispense.status === 'linked') {
        await yardFuelService.updateFuelRecordYardAllocation(
          createdDispense.linkedFuelRecordId,
          createdDispense.yard,
          createdDispense.liters
        );
      }

      return createdDispense;
    } catch (error) {
      console.error('Error dispensing yard fuel:', error);
      throw error;
    }
  },

  /**
   * Update fuel record with yard allocation
   */
  updateFuelRecordYardAllocation: async (
    fuelRecordId: string | number,
    yard: YardFuelDispense['yard'],
    liters: number
  ) => {
    try {
      const record = await fuelRecordsAPI.getById(fuelRecordId);
      
      // Update appropriate yard field (as negative value since it's consumption)
      const updates: Partial<FuelRecord> = {};
      switch (yard) {
        case 'DAR YARD':
          updates.darYard = (record.darYard || 0) - liters;
          break;
        case 'TANGA YARD':
          updates.tangaYard = (record.tangaYard || 0) - liters;
          break;
        case 'MMSA YARD':
          updates.mmsaYard = (record.mmsaYard || 0) - liters;
          break;
      }

      // Recalculate balance
      const totalFuel = (record.totalLts || 0) + (record.extra || 0);
      const allocations = (
        ((yard === 'MMSA YARD' ? updates.mmsaYard : record.mmsaYard) || 0) +
        ((yard === 'TANGA YARD' ? updates.tangaYard : record.tangaYard) || 0) +
        ((yard === 'DAR YARD' ? updates.darYard : record.darYard) || 0) +
        (record.darGoing || 0) +
        (record.moroGoing || 0) +
        (record.mbeyaGoing || 0) +
        (record.tdmGoing || 0) +
        (record.zambiaGoing || 0) +
        (record.congoFuel || 0) +
        (record.zambiaReturn || 0) +
        (record.tundumaReturn || 0) +
        (record.mbeyaReturn || 0) +
        (record.moroReturn || 0) +
        (record.darReturn || 0) +
        (record.tangaReturn || 0)
      );
      updates.balance = totalFuel + allocations;

      await fuelRecordsAPI.update(fuelRecordId, updates);
    } catch (error) {
      console.error('Error updating fuel record yard allocation:', error);
    }
  },

  /**
   * Get all yard fuel dispenses
   */
  getAllDispenses: async (): Promise<YardFuelDispense[]> => {
    try {
      return await yardFuelAPI.getAll();
    } catch (error) {
      console.error('Error getting all dispenses:', error);
      return [];
    }
  },

  /**
   * Get all yard fuel dispenses with pagination
   */
  getAll: async (filters?: any) => {
    try {
      const response = await yardFuelAPI.getAll(filters);
      return {
        items: Array.isArray(response) ? response : [],
        total: Array.isArray(response) ? response.length : 0,
      };
    } catch (error) {
      console.error('Error getting all dispenses:', error);
      return { items: [], total: 0 };
    }
  },

  /**
   * Create a new yard fuel dispense
   */
  create: async (data: Partial<YardFuelDispense>): Promise<YardFuelDispense> => {
    return await yardFuelAPI.create(data);
  },

  /**
   * Get dispenses for a specific yard and date
   */
  getDispensesByYardAndDate: async (yard: string, date: string): Promise<YardFuelDispense[]> => {
    try {
      return await yardFuelAPI.getByYardAndDate(yard, date);
    } catch (error) {
      console.error('Error getting dispenses by yard and date:', error);
      return [];
    }
  },

  /**
   * Get stats for a yard on a specific date
   */
  getYardStats: async (yard: string, date: string) => {
    const dispenses = await yardFuelService.getDispensesByYardAndDate(yard, date);
    
    return {
      totalEntries: dispenses.length,
      totalLiters: dispenses.reduce((sum, d) => sum + d.liters, 0),
      averageLiters: dispenses.length > 0 
        ? Math.round(dispenses.reduce((sum, d) => sum + d.liters, 0) / dispenses.length)
        : 0,
      linkedEntries: dispenses.filter(d => d.status === 'linked').length,
      pendingEntries: dispenses.filter(d => d.status === 'pending').length,
    };
  },

  /**
   * Reject a yard fuel entry (fuel order maker action)
   */
  rejectYardFuelEntry: async (id: string | number, rejectionReason: string): Promise<any> => {
    try {
      const response = await yardFuelAPI.reject(id, rejectionReason);
      return response;
    } catch (error) {
      console.error('Error rejecting yard fuel entry:', error);
      throw error;
    }
  },

  /**
   * Get rejection history for a yard
   */
  getRejectionHistory: async (yard?: string, showResolved: boolean = false, dateFrom?: string, dateTo?: string): Promise<YardFuelDispense[]> => {
    try {
      const response = await yardFuelAPI.getRejectionHistory(yard, dateFrom, dateTo, showResolved);
      return response;
    } catch (error) {
      console.error('Error getting rejection history:', error);
      return [];
    }
  },
};

export default yardFuelService;
