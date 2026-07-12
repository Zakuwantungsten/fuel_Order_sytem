import type { FuelRecord } from '../types';
import { fuelRecordsAPI } from '../services/api';

export interface TruckFetchResult {
  fuelRecord: FuelRecord | null;
  goingDo: string;
  returnDo: string;
  destination: string;
  goingDestination: string;
  balance: number;
  message: string;
  success: boolean;
  warningType?: 'not_found' | 'journey_completed' | 'no_active_record' | 'ambiguous_do' | null;
  ambiguous?: boolean;
  matches?: (TruckFetchResult & { truckNo?: string; direction?: 'going' | 'returning' })[];
  queueInfo?: {
    hasQueue: boolean;
    queuedCount: number;
    nextJourney: FuelRecord;
  };
  allJourneys?: {
    active: FuelRecord | null;
    queued: FuelRecord[];
  };
  truckNo?: string;
  direction?: 'going' | 'returning';
}

export const buildDoResult = (
  fuelRecord: FuelRecord,
  direction: 'going' | 'returning'
): TruckFetchResult & { truckNo?: string; direction?: 'going' | 'returning' } => {
  const goingDestination = fuelRecord.originalGoingTo || fuelRecord.to || 'NIL';
  const doShown = direction === 'returning' ? fuelRecord.returnDo : fuelRecord.goingDo;
  return {
    fuelRecord,
    truckNo: fuelRecord.truckNo,
    direction,
    goingDo: fuelRecord.goingDo || 'NIL',
    returnDo: fuelRecord.returnDo || 'NIL',
    destination: fuelRecord.to || 'NIL',
    goingDestination,
    balance: fuelRecord.balance || 0,
    message: `Found: DO ${doShown || 'NIL'}, Balance: ${fuelRecord.balance ?? 0}L`,
    success: true,
  };
};

const isJourneyComplete = (record: FuelRecord): boolean => {
  if ((record as any).isLocked) return false;
  if (record.journeyStatus === 'completed') return true;
  if (record.journeyStatus === 'active' || record.journeyStatus === 'queued') return false;

  const destination = (record.originalGoingTo || record.to || '').toUpperCase();
  const isMSADestination = destination.includes('MSA') || destination.includes('MOMBASA');
  if (isMSADestination) {
    const tangaReturn = (record as any).tangaReturn;
    return tangaReturn !== 0 && tangaReturn !== null && tangaReturn !== undefined;
  }
  const mbeyaReturn = (record as any).mbeyaReturn;
  return mbeyaReturn !== 0 && mbeyaReturn !== null && mbeyaReturn !== undefined;
};

/**
 * Look up active / queued journeys for a truck (same rules as LPO Detail Form).
 */
export async function fetchTruckForLpo(
  truckNo: string,
  lookupMonthsFallback = 4
): Promise<TruckFetchResult> {
  if (!truckNo || truckNo.length < 3) {
    return {
      fuelRecord: null,
      goingDo: 'NIL',
      returnDo: 'NIL',
      destination: 'NIL',
      goingDestination: 'NIL',
      balance: 0,
      message: 'Enter a valid truck number',
      success: false,
    };
  }

  try {
    const { data: fuelRecords, meta } = await fuelRecordsAPI.getForLpoTruckLookup(truckNo.trim());
    const lookupMonths = meta.lookupMonths ?? lookupMonthsFallback;

    const activeFuelRecords = (fuelRecords || []).filter((r: FuelRecord) => !r.isCancelled);
    if (!activeFuelRecords.length) {
      return {
        fuelRecord: null,
        goingDo: 'NIL',
        returnDo: 'NIL',
        destination: 'NIL',
        goingDestination: 'NIL',
        balance: 0,
        message: '⚠️ No fuel record found - truck may not be on a journey. You can still edit manually.',
        success: false,
        warningType: 'not_found',
      };
    }

    const lockedRecord = activeFuelRecords.find((r: any) => r.isLocked);
    if (lockedRecord) {
      return {
        fuelRecord: lockedRecord,
        goingDo: lockedRecord.goingDo || 'NIL',
        returnDo: lockedRecord.returnDo || 'NIL',
        destination: lockedRecord.to || 'NIL',
        goingDestination: lockedRecord.originalGoingTo || lockedRecord.to || 'NIL',
        balance: lockedRecord.balance || 0,
        message: `🔒 LOCKED: Missing configuration. DO: ${lockedRecord.goingDo} | Truck: ${lockedRecord.truckNo}`,
        success: true,
        allJourneys: { active: lockedRecord, queued: [] },
      };
    }

    const now = new Date();
    const monthStarts: Date[] = [];
    for (let i = 0; i < lookupMonths; i++) {
      monthStarts.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    }

    const monthLabel = (offset: number): string => {
      if (offset === 0) return 'current';
      if (offset === 1) return 'previous';
      return `${offset} months ago`;
    };

    const isInMonth = (dateStr: string, monthStart: Date): boolean => {
      const date = new Date(dateStr);
      const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
      return date >= monthStart && date < nextMonthStart;
    };

    const isActiveRecord = (r: FuelRecord): boolean => {
      if (r.journeyStatus === 'active') return true;
      if (r.journeyStatus === 'queued' || r.journeyStatus === 'completed') return false;
      if (r.balance !== 0) return true;
      return !isJourneyComplete(r);
    };

    const isQueuedRecord = (r: FuelRecord): boolean => r.journeyStatus === 'queued';

    const sortedRecords = [...activeFuelRecords].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    let activeRecord: FuelRecord | null = null;
    let queuedRecord: FuelRecord | null = null;
    let searchMonth = 'current';

    for (let i = 0; i < monthStarts.length && !activeRecord; i++) {
      searchMonth = monthLabel(i);
      activeRecord =
        sortedRecords.find((r) => isInMonth(r.date, monthStarts[i]) && isActiveRecord(r)) || null;
    }

    if (!activeRecord) {
      for (let i = 0; i < monthStarts.length && !queuedRecord; i++) {
        searchMonth = monthLabel(i);
        queuedRecord =
          sortedRecords.find((r) => isInMonth(r.date, monthStarts[i]) && isQueuedRecord(r)) || null;
      }
    }

    const selectedRecord = activeRecord || queuedRecord;
    if (!selectedRecord) {
      const mostRecent = sortedRecords[0];
      if (mostRecent && isJourneyComplete(mostRecent)) {
        const goingDest = mostRecent.originalGoingTo || mostRecent.to || 'NIL';
        return {
          fuelRecord: mostRecent,
          goingDo: mostRecent.goingDo || 'NIL',
          returnDo: mostRecent.returnDo || 'NIL',
          destination: mostRecent.to || 'NIL',
          goingDestination: goingDest,
          balance: 0,
          message: `⚠️ Journey completed. Last trip: ${mostRecent.goingDo}. You can still edit manually.`,
          success: false,
          warningType: 'journey_completed',
        };
      }
      return {
        fuelRecord: null,
        goingDo: 'NIL',
        returnDo: 'NIL',
        destination: 'NIL',
        goingDestination: 'NIL',
        balance: 0,
        message: `⚠️ No active journey found in last ${lookupMonths} months.`,
        success: false,
        warningType: 'no_active_record',
      };
    }

    const goingDestination = selectedRecord.originalGoingTo || selectedRecord.to || 'NIL';
    const currentDestination = selectedRecord.to || 'NIL';
    const queuedJourneys = activeFuelRecords
      .filter((r) => r.journeyStatus === 'queued' && r.truckNo === selectedRecord.truckNo)
      .sort((a: any, b: any) => (a.queueOrder || 0) - (b.queueOrder || 0));

    let statusMessage = `Found (${searchMonth} month): Going DO ${selectedRecord.goingDo}, Balance: ${selectedRecord.balance}L`;
    if (selectedRecord.journeyStatus === 'queued') {
      statusMessage = `QUEUED Journey (Position #${selectedRecord.queueOrder || '?'}): ${selectedRecord.goingDo}`;
    } else if (selectedRecord.journeyStatus === 'active') {
      statusMessage = `ACTIVE Journey: DO ${selectedRecord.goingDo}, Balance: ${selectedRecord.balance}L`;
      if (queuedJourneys.length > 0) statusMessage += ` | ${queuedJourneys.length} queued`;
    }

    return {
      fuelRecord: selectedRecord,
      goingDo: selectedRecord.goingDo || 'NIL',
      returnDo: selectedRecord.returnDo || 'NIL',
      destination: currentDestination,
      goingDestination,
      balance: selectedRecord.balance || 0,
      message: statusMessage,
      success: true,
      queueInfo:
        queuedJourneys.length > 0
          ? { hasQueue: true, queuedCount: queuedJourneys.length, nextJourney: queuedJourneys[0] }
          : undefined,
      allJourneys: { active: activeRecord, queued: queuedJourneys },
    };
  } catch (error) {
    console.error('Error fetching truck data:', error);
    return {
      fuelRecord: null,
      goingDo: 'NIL',
      returnDo: 'NIL',
      destination: 'NIL',
      goingDestination: 'NIL',
      balance: 0,
      message: 'Error fetching truck data',
      success: false,
    };
  }
}

/**
 * Look up a journey by DO number (same source as truck lookup).
 */
export async function fetchDoForLpo(
  doNumber: string
): Promise<TruckFetchResult & { truckNo?: string; direction?: 'going' | 'returning' }> {
  if (!doNumber || doNumber.length < 3 || isSpecialDo(doNumber)) {
    return {
      fuelRecord: null,
      goingDo: 'NIL',
      returnDo: 'NIL',
      destination: 'NIL',
      goingDestination: 'NIL',
      balance: 0,
      message: isSpecialDo(doNumber) ? 'No delivery order assigned' : 'Enter a valid DO number',
      success: false,
    };
  }

  try {
    const result = await fuelRecordsAPI.getByDoNumber(doNumber.trim().toUpperCase());
    if (!result?.fuelRecord) {
      return {
        fuelRecord: null,
        goingDo: 'NIL',
        returnDo: 'NIL',
        destination: 'NIL',
        goingDestination: 'NIL',
        balance: 0,
        message: `⚠️ No fuel record found for DO ${doNumber}`,
        success: false,
        warningType: 'not_found',
      };
    }

    const base = buildDoResult(result.fuelRecord, result.direction);
    return {
      ...base,
      ambiguous: result.ambiguous,
      matches: result.matches.map((m) => buildDoResult(m.fuelRecord, m.direction)),
    };
  } catch (error) {
    console.error('Error fetching fuel record by DO:', error);
    return {
      fuelRecord: null,
      goingDo: 'NIL',
      returnDo: 'NIL',
      destination: 'NIL',
      goingDestination: 'NIL',
      balance: 0,
      message: `Error fetching DO ${doNumber}`,
      success: false,
    };
  }
}

export function isSpecialDo(doNo: string): boolean {
  const up = (doNo || '').toUpperCase().trim();
  return (
    !up ||
    up === 'NIL' ||
    up === 'N/A' ||
    up === 'REF' ||
    up === 'DA' ||
    up === 'PENDING'
  );
}
