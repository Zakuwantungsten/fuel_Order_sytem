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

export class FleetReportParser {
  private checkpoints: Map<string, { name: string; order: number }> = new Map();

  async initialize(): Promise<void> {
    const allCheckpoints = await Checkpoint.find({ isDeleted: false, isActive: true }).sort({ order: 1 });

    for (const cp of allCheckpoints) {
      this.checkpoints.set(cp.name.toUpperCase(), { name: cp.name, order: cp.order });
      for (const altName of cp.alternativeNames) {
        this.checkpoints.set(altName.toUpperCase(), { name: cp.name, order: cp.order });
      }
    }

    logger.info(`Loaded ${allCheckpoints.length} checkpoints for fleet report parsing`);
  }

  async parseExcelFile(fileBuffer: Buffer, fileName: string): Promise<ParsedReport> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    const reportType = fileName.toUpperCase().includes('NO_ORDER') || fileName.toUpperCase().includes('NO ORDER')
      ? 'NO_ORDER'
      : 'IMPORT';

    // Find the first worksheet that has actual data (skip chart sheets which have ≤3 rows)
    const worksheet =
      workbook.worksheets.find(ws => ws.rowCount > 3) || workbook.worksheets[0];

    if (!worksheet) {
      throw new Error('No worksheet found in Excel file');
    }

    logger.info(`Using worksheet "${worksheet.name}" (${worksheet.rowCount} rows) for ${reportType} report`);

    const fleetGroups: IFleetGroup[] = [];
    let reportDate = new Date();

    if (reportType === 'IMPORT') {
      const groups = this.extractMultiTableFleetGroups(worksheet);
      fleetGroups.push(...groups);
      reportDate = this.extractReportDate(worksheet) || new Date();
    } else {
      const group = this.extractSingleTableFleetGroup(worksheet);
      if (group) {
        fleetGroups.push(group);
      }
      reportDate = this.extractReportDate(worksheet) || new Date();
    }

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
   * Build a { COLUMN_NAME: columnIndex } map from the S/N header row.
   * ExcelJS rows are 1-indexed (index 0 is always null).
   */
  private buildColumnMap(row: any[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (let i = 1; i < row.length; i++) {
      const cell = row[i];
      if (cell == null) continue;
      const key = cell.toString().trim().toUpperCase();
      if (key) map[key] = i;
    }
    return map;
  }

  /**
   * Resolve a column index from the map by trying multiple name variants.
   * Falls back to prefix-matching when no exact match is found.
   */
  private resolveCol(map: Record<string, number>, ...names: string[]): number {
    for (const name of names) {
      if (map[name] !== undefined) return map[name];
    }
    for (const name of names) {
      for (const key of Object.keys(map)) {
        if (key.startsWith(name) || name.startsWith(key)) return map[key];
      }
    }
    return -1;
  }

  private extractMultiTableFleetGroups(worksheet: ExcelJS.Worksheet): IFleetGroup[] {
    const groups: IFleetGroup[] = [];
    const rows = worksheet.getSheetValues() as any[];

    let currentGroupName = '';
    let currentGroupTrucks: ITruckPositionInSnapshot[] = [];
    let inDataSection = false;
    let emptyRowCount = 0;
    let colMap: Record<string, number> = {};

    logger.info(`Processing ${rows.length} rows for multi-table fleet groups`);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) continue;

      // Check columns 1-3 for fleet group headers
      let headerFound = false;
      let headerText = '';
      for (let col = 1; col <= 3; col++) {
        const cellText = row[col]?.toString().trim();
        if (cellText && this.isFleetGroupHeader(cellText)) {
          headerText = cellText;
          headerFound = true;
          break;
        }
      }

      if (headerFound) {
        if (currentGroupName && currentGroupTrucks.length > 0) {
          logger.info(`Completed group "${currentGroupName}" with ${currentGroupTrucks.length} trucks`);
          groups.push(this.createFleetGroup(currentGroupName, currentGroupTrucks));
        }
        currentGroupName = headerText;
        currentGroupTrucks = [];
        inDataSection = false;
        emptyRowCount = 0;
        colMap = {};
        logger.info(`Started new group: "${currentGroupName}"`);
        continue;
      }

      // Detect the S/N header row and build the column map from it
      let snColIdx = -1;
      for (let col = 1; col <= 4; col++) {
        const cellText = row[col]?.toString().trim().toUpperCase();
        if (cellText === 'S/N' || cellText === 'SN') {
          snColIdx = col;
          break;
        }
      }

      if (snColIdx >= 0) {
        colMap = this.buildColumnMap(row);
        inDataSection = true;
        emptyRowCount = 0;
        logger.info(`Found header row at line ${i} for group "${currentGroupName}": ${Object.keys(colMap).join(', ')}`);
        continue;
      }

      if (this.isEmptyRow(row)) {
        emptyRowCount++;
        if (emptyRowCount >= 2 && currentGroupTrucks.length > 0) {
          inDataSection = false;
        }
        continue;
      } else {
        emptyRowCount = 0;
      }

      if (inDataSection && currentGroupName && Object.keys(colMap).length > 0) {
        const truck = this.extractTruckFromRow(row, 'IMPORT', colMap);
        if (truck) {
          currentGroupTrucks.push(truck);
          if (currentGroupTrucks.length === 1) {
            logger.info(`First truck in "${currentGroupName}": ${truck.truckNo} at ${truck.currentCheckpoint}`);
          }
        }
      }
    }

    if (currentGroupName && currentGroupTrucks.length > 0) {
      logger.info(`Completed final group "${currentGroupName}" with ${currentGroupTrucks.length} trucks`);
      groups.push(this.createFleetGroup(currentGroupName, currentGroupTrucks));
    }

    const totalTrucks = groups.reduce((sum, g) => sum + g.trucks.length, 0);
    logger.info(`✅ Extracted ${groups.length} fleet groups with ${totalTrucks} total trucks`);

    if (groups.length === 0) {
      logger.warn('⚠️ WARNING: No fleet groups extracted! Check if headers match expected patterns.');
    }

    return groups;
  }

  private extractSingleTableFleetGroup(worksheet: ExcelJS.Worksheet): IFleetGroup | null {
    const rows = worksheet.getSheetValues() as any[];
    const trucks: ITruckPositionInSnapshot[] = [];
    let inDataSection = false;
    let colMap: Record<string, number> = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) continue;

      // Detect the S/N header row in any of the first 4 columns
      let snColIdx = -1;
      for (let col = 1; col <= 4; col++) {
        const cellText = row[col]?.toString().trim().toUpperCase();
        if (cellText === 'S/N' || cellText === 'SN') {
          snColIdx = col;
          break;
        }
      }

      if (snColIdx >= 0) {
        colMap = this.buildColumnMap(row);
        inDataSection = true;
        logger.info(`Found header row at line ${i}: ${Object.keys(colMap).join(', ')}`);
        continue;
      }

      if (inDataSection && Object.keys(colMap).length > 0) {
        const truck = this.extractTruckFromRow(row, 'NO_ORDER', colMap);
        if (truck) {
          trucks.push(truck);
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

  private isFleetGroupHeader(text: string): boolean {
    if (!text || text.trim().length === 0) return false;

    const upper = text.toUpperCase().trim();

    if (upper.includes('IMPORT REPORT') || upper.includes('POD SUMMARY')) {
      return false;
    }

    const patterns = [
      /^[A-Z]+\s+\d+\s+TRUCKS?/i,
      /^RELOAD\s+\d+MT/i,
      /^BRIDGE\s+\d+/i,
      /^IMPALA\s+\d+MT/i,
      /^POSEIDON\s+\d+MT/i,
      /^POLYTRA\s+\d+MT/i,
      /^GREATLAKES\s+DSM/i,
    ];

    const isMatch = patterns.some(pattern => pattern.test(upper));
    if (isMatch) {
      logger.debug(`✓ Recognized fleet group header: "${text}"`);
    }
    return isMatch;
  }

  /**
   * Extract a single truck record from a data row using the dynamic column map.
   *
   * Direction is not derived from status text:
   *   - NO_ORDER: every truck is RETURNING (they have no active load order)
   *   - IMPORT:   direction is left as UNKNOWN (mixed statuses, not meaningful here)
   */
  private extractTruckFromRow(
    row: any[],
    reportType: 'IMPORT' | 'NO_ORDER',
    colMap: Record<string, number>
  ): ITruckPositionInSnapshot | null {
    try {
      const truckCol    = this.resolveCol(colMap, 'TRUCK', 'TRUCK NO', 'TRUCK NO.');
      const trailerCol  = this.resolveCol(colMap, 'TRAILER', 'TRAILER NO', 'TRAILER NO.');
      const positionCol = this.resolveCol(colMap, 'POSITION', 'POS', 'CURRENT POSITION');
      const statusCol   = this.resolveCol(colMap, 'STATUS');
      const typeCol     = this.resolveCol(colMap, 'TYPE', 'VEHICLE TYPE');
      const dsjCol      = this.resolveCol(colMap, 'DSJ', 'D.S.J', 'DAYS');
      const deptDateCol = this.resolveCol(colMap, 'DEPT DATE', 'DEPARTURE DATE', 'DEP DATE', 'DEPT. DATE');

      const truckNo     = truckCol    >= 0 ? row[truckCol]?.toString().trim()    : null;
      const trailerNo   = trailerCol  >= 0 ? row[trailerCol]?.toString().trim()  : '';
      const position    = positionCol >= 0 ? row[positionCol]?.toString().trim() : null;
      const status      = statusCol   >= 0 ? row[statusCol]?.toString().trim()   : '';
      const vehicleType = typeCol     >= 0 ? row[typeCol]?.toString().trim()     : 'FLATBED';
      const dsjText     = dsjCol      >= 0 ? row[dsjCol]?.toString().trim()      : null;
      const deptDateText = deptDateCol >= 0 ? row[deptDateCol]?.toString().trim() : null;

      if (!truckNo || !position) {
        if (row.some((cell, idx) => idx > 0 && cell?.toString().trim())) {
          logger.debug(`Skipping row - missing truck (${truckNo}) or position (${position})`);
        }
        return null;
      }

      const checkpoint = this.matchCheckpoint(position);
      if (!checkpoint) {
        logger.warn(`Could not match position: ${position}`);
        return null;
      }

      // NO_ORDER trucks have no active load order → all returning.
      // IMPORT trucks show mixed states that don't map cleanly to a direction.
      const direction: 'GOING' | 'RETURNING' | 'UNKNOWN' =
        reportType === 'NO_ORDER' ? 'RETURNING' : 'UNKNOWN';

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

  private matchCheckpoint(positionText: string): { name: string; order: number } | null {
    const normalized = positionText
      .toUpperCase()
      .trim()
      .replace(/-ZMB|-ZM|-TZ|-DRC|-CD|-KE|-MW|-BW|-AO/gi, '');

    if (this.checkpoints.has(normalized)) {
      return this.checkpoints.get(normalized)!;
    }

    for (const [key, value] of this.checkpoints.entries()) {
      const normalizedKey = key.replace(/-ZMB|-ZM|-TZ|-DRC|-CD|-KE|-MW|-BW|-AO/gi, '');
      if (normalized.includes(normalizedKey) || normalizedKey.includes(normalized)) {
        return value;
      }
    }

    if (normalized.includes('DSM') || normalized.includes('DAR')) {
      return this.checkpoints.get('DSM') || null;
    }
    if (normalized.includes('KASUMBALESA')) {
      if (positionText.toUpperCase().includes('DRC')) return this.checkpoints.get('KASUMBALESA DRC') || null;
      if (positionText.toUpperCase().includes('ZMB') || positionText.toUpperCase().includes('ZM'))
        return this.checkpoints.get('KASUMBALESA ZMB') || null;
    }

    return null;
  }

  private createFleetGroup(name: string, trucks: ITruckPositionInSnapshot[]): IFleetGroup {
    const tonnageMatch = name.match(/(\d+)\s*MT/i);
    const tonnage = tonnageMatch ? parseInt(tonnageMatch[1]) : undefined;

    const routeMatch = name.match(/(DSM|MBSA|MOMBASA|TANGA)[\s-]+(KOLWEZI|LIKASI|LUBUMBASHI|COMIKA|TCC|KAMOA)/i);
    const route = routeMatch ? `${routeMatch[1]}-${routeMatch[2]}` : undefined;

    return { name, tonnage, route, trucks };
  }

  private isEmptyRow(row: any[]): boolean {
    if (!row || !Array.isArray(row)) return true;
    return row.every(cell => !cell || cell.toString().trim() === '');
  }

  private extractReportDate(worksheet: ExcelJS.Worksheet): Date | null {
    const rows = worksheet.getSheetValues() as any[];

    for (let i = 1; i <= Math.min(10, rows.length); i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) continue;

      for (const cell of row) {
        if (!cell) continue;

        if (cell instanceof Date && !isNaN(cell.getTime())) {
          if (cell.getFullYear() >= 2000) return cell;
        }

        const date = this.parseDate(cell);
        if (date && date.getFullYear() >= 2000) return date;
      }
    }

    logger.warn('No valid report date found in Excel file, using current date');
    return new Date();
  }

  private parseDate(text: string | number): Date | undefined {
    if (!text && text !== 0) return undefined;

    if (typeof text === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      const msPerDay = 24 * 60 * 60 * 1000;
      return new Date(excelEpoch.getTime() + text * msPerDay);
    }

    const textStr = text.toString().trim();
    if (!textStr) return undefined;

    const date = new Date(textStr);
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) return date;

    const ddMmmMatch = textStr.match(/(\d{1,2})[-/]([A-Za-z]{3})/);
    if (ddMmmMatch) {
      const day = parseInt(ddMmmMatch[1]);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIndex = monthNames.findIndex(m => m.toLowerCase() === ddMmmMatch[2].toLowerCase());
      if (monthIndex >= 0) {
        return new Date(new Date().getFullYear(), monthIndex, day);
      }
    }

    const slashMatch = textStr.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (slashMatch) {
      const part1 = parseInt(slashMatch[1]);
      const part2 = parseInt(slashMatch[2]);
      let year = parseInt(slashMatch[3]);
      if (year < 100) year += year < 50 ? 2000 : 1900;

      if (part1 <= 31 && part2 <= 12) return new Date(year, part2 - 1, part1);
      if (part1 <= 12 && part2 <= 31) return new Date(year, part1 - 1, part2);
    }

    return undefined;
  }
}

export const fleetReportParser = new FleetReportParser();
