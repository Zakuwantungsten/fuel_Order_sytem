import ExcelJS from 'exceljs';
import { IFleetGroup, ITruckPositionInSnapshot } from '../models/FleetSnapshot';
import { Checkpoint } from '../models';
import { logger } from '../utils';

interface ParsedReport {
  reportType: 'IMPORT' | 'NO_ORDER';
  reportDate: Date;
  fleetGroups: IFleetGroup[];
  totalTrucks: number;
  goingTrucks: number;
  returningTrucks: number;
  checkpointDistribution: Map<string, number>;
}

/**
 * Fleet Report Parser Service
 * Parses Excel/CSV files containing truck position reports
 */
export class FleetReportParser {
  private checkpoints: Map<string, { name: string; order: number }> = new Map();

  /**
   * Initialize parser by loading checkpoints
   */
  async initialize(): Promise<void> {
    const allCheckpoints = await Checkpoint.find({ isDeleted: false, isActive: true }).sort({ order: 1 });
    
    for (const cp of allCheckpoints) {
      // Add main name
      this.checkpoints.set(cp.name.toUpperCase(), { name: cp.name, order: cp.order });
      
      // Add alternative names
      for (const altName of cp.alternativeNames) {
        this.checkpoints.set(altName.toUpperCase(), { name: cp.name, order: cp.order });
      }
    }
    
    logger.info(`Loaded ${allCheckpoints.length} checkpoints for fleet report parsing`);
  }

  /**
   * Parse Excel file buffer
   */
  async parseExcelFile(fileBuffer: Buffer, fileName: string): Promise<ParsedReport> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);

    // Determine report type from filename or content
    const reportType = fileName.toUpperCase().includes('NO_ORDER') || fileName.toUpperCase().includes('NO ORDER')
      ? 'NO_ORDER'
      : 'IMPORT';

    // Get the first worksheet
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('No worksheet found in Excel file');
    }

    const fleetGroups: IFleetGroup[] = [];
    let reportDate = new Date();
    
    // Check if this is multi-table (IMPORT) or single-table (NO_ORDER)
    if (reportType === 'IMPORT') {
      const groups = this.extractMultiTableFleetGroups(worksheet);
      fleetGroups.push(...groups);
      
      // Try to extract report date from first few rows
      reportDate = this.extractReportDate(worksheet) || new Date();
    } else {
      const group = this.extractSingleTableFleetGroup(worksheet);
      if (group) {
        fleetGroups.push(group);
      }
      reportDate = this.extractReportDate(worksheet) || new Date();
    }

    // Calculate statistics
    const totalTrucks = fleetGroups.reduce((sum, group) => sum + group.trucks.length, 0);
    const goingTrucks = fleetGroups.reduce(
      (sum, group) => sum + group.trucks.filter(t => t.direction === 'GOING').length,
      0
    );
    const returningTrucks = fleetGroups.reduce(
      (sum, group) => sum + group.trucks.filter(t => t.direction === 'RETURNING').length,
      0
    );

    const checkpointDistribution = new Map<string, number>();
    for (const group of fleetGroups) {
      for (const truck of group.trucks) {
        const count = checkpointDistribution.get(truck.currentCheckpoint) || 0;
        checkpointDistribution.set(truck.currentCheckpoint, count + 1);
      }
    }

    return {
      reportType,
      reportDate,
      fleetGroups,
      totalTrucks,
      goingTrucks,
      returningTrucks,
      checkpointDistribution,
    };
  }

  /**
   * Extract fleet groups from multi-table format (IMPORT reports)
   */
  private extractMultiTableFleetGroups(worksheet: ExcelJS.Worksheet): IFleetGroup[] {
    const groups: IFleetGroup[] = [];
    const rows = worksheet.getSheetValues() as any[];
    
    let currentGroupName = '';
    let currentGroupTrucks: ITruckPositionInSnapshot[] = [];
    let inDataSection = false;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) continue;

      // Check if this is a fleet group header (looks like: "CONKEN 4 TRUCKS" or "RELOAD 313MT DSM-LIKASI")
      const firstCell = row[1]?.toString().trim();
      if (firstCell && this.isFleetGroupHeader(firstCell)) {
        // Save previous group if exists
        if (currentGroupName && currentGroupTrucks.length > 0) {
          groups.push(this.createFleetGroup(currentGroupName, currentGroupTrucks));
        }
        
        // Start new group
        currentGroupName = firstCell;
        currentGroupTrucks = [];
        inDataSection = false;
        continue;
      }

      // Check if this is a column header row (S/N, TRUCK, TRAILER, etc.)
      if (firstCell && (firstCell.toUpperCase() === 'S/N' || firstCell.toUpperCase() === 'SN')) {
        inDataSection = true;
        continue;
      }

      // Extract truck data if we're in a data section
      if (inDataSection && currentGroupName) {
        const truck = this.extractTruckFromRow(row, 'IMPORT');
        if (truck) {
          currentGroupTrucks.push(truck);
        }
      }

      // Empty rows or lines of commas might indicate end of group
      if (this.isEmptyRow(row) && currentGroupTrucks.length > 0) {
        inDataSection = false;
      }
    }

    // Add last group
    if (currentGroupName && currentGroupTrucks.length > 0) {
      groups.push(this.createFleetGroup(currentGroupName, currentGroupTrucks));
    }

    logger.info(`Extracted ${groups.length} fleet groups with ${groups.reduce((sum, g) => sum + g.trucks.length, 0)} trucks`);
    return groups;
  }

  /**
   * Extract fleet group from single-table format (NO_ORDER reports)
   */
  private extractSingleTableFleetGroup(worksheet: ExcelJS.Worksheet): IFleetGroup | null {
    const rows = worksheet.getSheetValues() as any[];
    const trucks: ITruckPositionInSnapshot[] = [];
    let inDataSection = false;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) continue;

      const firstCell = row[1]?.toString().trim();
      
      // Check if this is column header
      if (firstCell && (firstCell.toUpperCase() === 'S/N' || firstCell.toUpperCase() === 'SN')) {
        inDataSection = true;
        continue;
      }

      if (inDataSection) {
        const truck = this.extractTruckFromRow(row, 'NO_ORDER');
        if (truck) {
          trucks.push(truck);
          // Log first few trucks to verify status extraction
          if (trucks.length <= 3) {
            logger.info(`Sample truck: ${truck.truckNo} - Status: "${truck.status}" - Position: ${truck.currentCheckpoint}`);
          }
        }
      }
    }

    if (trucks.length === 0) return null;

    return {
      name: 'NO ORDER - RETURN TRUCKS',
      trucks,
    };
  }

  /**
   * Check if a cell value looks like a fleet group header
   */
  private isFleetGroupHeader(text: string): boolean {
    const upper = text.toUpperCase();
    // Look for patterns like "CONKEN", "RELOAD", "BRIDGE", "IMPALA", "POSEIDON", etc.
    const patterns = [
      /^\s*[A-Z]+\s+\d+\s+TRUCKS?/i,
      /^\s*RELOAD\s+\d+MT/i,
      /^\s*BRIDGE\s+\d+MT/i,
      /^\s*IMPALA\s+\d+MT/i,
      /^\s*POSEIDON\s+\d+MT/i,
      /^\s*POLYTRA\s+\d+MT/i,
    ];
    
    return patterns.some(pattern => pattern.test(text));
  }

  /**
   * Extract truck data from a row
   */
  private extractTruckFromRow(row: any[], reportType: 'IMPORT' | 'NO_ORDER'): ITruckPositionInSnapshot | null {
    try {
      // Column mapping differs between report types (1-indexed from ExcelJS):
      // NO_ORDER: [1]=S/N, [2]=TRUCK, [3]=TRAILER, [4]=POSITION, [5]=TYPE, [6]=STATUS, [7]=C40, [8]=DSJ, [9]=DEPT DATE, [10]=DATE TODAY
      // IMPORT:   [1]=S/N, [2]=TRUCK, [3]=TRAILER, [4]=POSITION, [5]=STATUS, [6]=TYPE, [7]=RETURN, [8]=DSJ, [9]=DEPT DATE, [10]=DATE TODAY
      
      const truckNo = row[2]?.toString().trim();
      const trailerNo = row[3]?.toString().trim();
      const position = row[4]?.toString().trim();
      
      // STATUS is at different columns depending on report type
      const status = reportType === 'IMPORT' 
        ? row[5]?.toString().trim()  // Column 5 for IMPORT (after POSITION)
        : row[6]?.toString().trim();  // Column 6 for NO_ORDER (after TYPE)
      
      const vehicleType = reportType === 'IMPORT'
        ? row[6]?.toString().trim()  // Column 6 for IMPORT (after STATUS)
        : row[5]?.toString().trim();  // Column 5 for NO_ORDER (before STATUS)
        
      const dsjText = reportType === 'IMPORT'
        ? row[8]?.toString().trim()  // Column 8 for IMPORT
        : row[8]?.toString().trim();  // Column 8 for NO_ORDER (same position)
        
      const deptDateText = reportType === 'IMPORT'
        ? row[9]?.toString().trim()  // Column 9 for IMPORT
        : row[9]?.toString().trim();  // Column 9 for NO_ORDER (same position)

      if (!truckNo || !position) return null;

      // Match position to checkpoint
      const checkpoint = this.matchCheckpoint(position);
      if (!checkpoint) {
        logger.warn(`Could not match position: ${position}`);
        return null;
      }

      // Determine direction from status
      const direction = this.determineDirection(status);

      // Parse dates and days
      let departureDate: Date | undefined;
      if (deptDateText && deptDateText !== 'NA') {
        departureDate = this.parseDate(deptDateText);
      }

      let daysInJourney: number | undefined;
      if (dsjText && dsjText !== 'NA' && !isNaN(parseInt(dsjText))) {
        daysInJourney = parseInt(dsjText);
      }

      return {
        truckNo: truckNo.toUpperCase(),
        trailerNo: trailerNo?.toUpperCase() || '',
        currentCheckpoint: checkpoint.name,
        checkpointOrder: checkpoint.order,
        status: status?.toUpperCase() || 'UNKNOWN',
        direction,
        vehicleType: vehicleType?.toUpperCase() || 'FLATBED',
        departureDate,
        daysInJourney,
      };
    } catch (error) {
      logger.warn(`Error extracting truck from row: ${error}`);
      return null;
    }
  }

  /**
   * Match a position string to a checkpoint (fuzzy matching with regex normalization)
   */
  private matchCheckpoint(positionText: string): { name: string; order: number } | null {
    // Normalize: uppercase, trim, remove country suffixes
    const normalized = positionText
      .toUpperCase()
      .trim()
      .replace(/-ZMB|-ZM|-TZ|-DRC|-CD|-KE|-MW|-BW|-AO/gi, ''); // Strip country codes

    // Direct match after normalization
    if (this.checkpoints.has(normalized)) {
      return this.checkpoints.get(normalized)!;
    }

    // Try to find checkpoint name within the position text
    for (const [key, value] of this.checkpoints.entries()) {
      // Also normalize checkpoint key for comparison
      const normalizedKey = key.replace(/-ZMB|-ZM|-TZ|-DRC|-CD|-KE|-MW|-BW|-AO/gi, '');
      
      if (normalized.includes(normalizedKey) || normalizedKey.includes(normalized)) {
        return value;
      }
    }

    // Special handling for common variations
    if (normalized.includes('DSM') || normalized.includes('DAR')) {
      return this.checkpoints.get('DSM') || null;
    }
    if (normalized.includes('KASUMBALESA')) {
      if (positionText.toUpperCase().includes('DRC')) return this.checkpoints.get('KASUMBALESA DRC') || null;
      if (positionText.toUpperCase().includes('ZMB') || positionText.toUpperCase().includes('ZM')) return this.checkpoints.get('KASUMBALESA ZMB') || null;
    }

    return null;
  }

  /**
   * Determine direction (GOING/RETURNING) from status text
   */
  private determineDirection(status: string): 'GOING' | 'RETURNING' | 'UNKNOWN' {
    if (!status) return 'UNKNOWN';

    const upper = status.toUpperCase();
    
    // Going indicators
    if (upper.includes('ENROUTE') && !upper.includes('DAR') && !upper.includes('MSA') && !upper.includes('MOMBASA')) {
      return 'GOING';
    }
    if (upper.includes('TO LOAD') || upper.includes('WAITING TO LOAD') || upper.includes('LOADED')) {
      return 'GOING';
    }
    if (upper.includes('WAITING CLEARANCE') || upper.includes('UNDER CLEARANCE')) {
      return 'GOING';
    }
    if (upper.includes('WAITING TO CROSS')) {
      return 'GOING';
    }

    // Returning indicators
    if (upper.includes('ENROUTE DAR') || upper.includes('ENROUTE MSA') || upper.includes('ENROUTE MOMBASA')) {
      return 'RETURNING';
    }
    if (upper.includes('WAITING TO OFFLOAD') || upper.includes('WAITING OFFLOAD')) {
      return 'RETURNING';
    }

    return 'UNKNOWN';
  }

  /**
   * Create fleet group object
   */
  private createFleetGroup(name: string, trucks: ITruckPositionInSnapshot[]): IFleetGroup {
    // Try to extract tonnage and route from name
    const tonnageMatch = name.match(/(\d+)\s*MT/i);
    const tonnage = tonnageMatch ? parseInt(tonnageMatch[1]) : undefined;

    const routeMatch = name.match(/(DSM|MBSA|MOMBASA|TANGA)[\s-]+(KOLWEZI|LIKASI|LUBUMBASHI|COMIKA|TCC|KAMOA)/i);
    const route = routeMatch ? `${routeMatch[1]}-${routeMatch[2]}` : undefined;

    return {
      name,
      tonnage,
      route,
      trucks,
    };
  }

  /**
   * Check if row is empty or just commas
   */
  private isEmptyRow(row: any[]): boolean {
    if (!row || !Array.isArray(row)) return true;
    return row.every(cell => !cell || cell.toString().trim() === '');
  }

  /**
   * Extract report date from worksheet
   */
  private extractReportDate(worksheet: ExcelJS.Worksheet): Date | null {
    const rows = worksheet.getSheetValues() as any[];
    
    // Look in first 10 rows for date
    for (let i = 1; i <= Math.min(10, rows.length); i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) continue;

      for (const cell of row) {
        if (!cell) continue;
        
        // Handle Excel date objects directly
        if (cell instanceof Date && !isNaN(cell.getTime())) {
          if (cell.getFullYear() >= 2000) {
            return cell;
          }
        }
        
        // Try parsing as number or string
        const date = this.parseDate(cell);
        if (date && date.getFullYear() >= 2000) {
          return date;
        }
      }
    }

    // If no valid date found, return current date
    logger.warn('No valid report date found in Excel file, using current date');
    return new Date();
  }

  /**
   * Parse various date formats including Excel serial dates
   */
  private parseDate(text: string | number): Date | undefined {
    if (!text && text !== 0) return undefined;

    // If it's a number, treat it as Excel serial date
    if (typeof text === 'number') {
      // Excel serial date: days since 1900-01-01 (with 1900 leap year bug)
      const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
      const msPerDay = 24 * 60 * 60 * 1000;
      return new Date(excelEpoch.getTime() + text * msPerDay);
    }

    // Convert to string for text parsing
    const textStr = text.toString().trim();
    if (!textStr) return undefined;

    // Try standard formats
    const date = new Date(textStr);
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
      return date;
    }

    // Try DD-MMM format (e.g., "23-Jan")
    const ddMmmMatch = textStr.match(/(\d{1,2})[-/]([A-Za-z]{3})/);
    if (ddMmmMatch) {
      const day = parseInt(ddMmmMatch[1]);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIndex = monthNames.findIndex(m => m.toLowerCase() === ddMmmMatch[2].toLowerCase());
      if (monthIndex >= 0) {
        const year = new Date().getFullYear();
        return new Date(year, monthIndex, day);
      }
    }

    // Try DD/MM/YYYY or MM/DD/YYYY
    const slashMatch = textStr.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (slashMatch) {
      const part1 = parseInt(slashMatch[1]);
      const part2 = parseInt(slashMatch[2]);
      let year = parseInt(slashMatch[3]);
      
      // Handle 2-digit years
      if (year < 100) {
        year += year < 50 ? 2000 : 1900;
      }
      
      // Try DD/MM/YYYY first (international format)
      if (part1 <= 31 && part2 <= 12) {
        return new Date(year, part2 - 1, part1);
      }
      // Try MM/DD/YYYY (US format)
      if (part1 <= 12 && part2 <= 31) {
        return new Date(year, part1 - 1, part2);
      }
    }

    return undefined;
  }
}

export const fleetReportParser = new FleetReportParser();
