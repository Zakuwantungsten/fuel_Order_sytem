/**
 * Test cases for return journey fuel difference calculation
 * and fuzzy location matching logic
 */

import FuelConfigService from '../services/fuelConfigService';
import * as fuelRecordService from '../services/fuelRecordService';
import { DeliveryOrder, FuelRecord } from '../types';

console.log('\n==========================================');
console.log('FUEL DIFFERENCE CALCULATION TESTS');
console.log('==========================================\n');

// Test 1: Fuzzy matching for loading points
console.log('TEST 1: Fuzzy Location Matching');
console.log('--------------------------------');

const locationTests = [
  // Kamoa variations
  { input: 'KAMOA', expected: 40, description: 'Exact: KAMOA' },
  { input: 'kamoa', expected: 40, description: 'Lowercase: kamoa' },
  { input: 'KAMOWA', expected: 40, description: 'Typo: KAMOWA (1 char off)' },
  { input: 'KAMO', expected: 40, description: 'Short: KAMO (75% match)' },
  { input: 'KAMUA', expected: 40, description: 'Typo: KAMUA' },
  
  // NMI variations
  { input: 'NMI', expected: 20, description: 'Exact: NMI' },
  { input: 'nmi', expected: 20, description: 'Lowercase: nmi' },
  { input: 'NIM', expected: 20, description: 'Typo: NIM' },
  { input: 'NM', expected: 20, description: 'Short: NM (66% match)' },
  
  // Kalongwe variations
  { input: 'KALONGWE', expected: 60, description: 'Exact: KALONGWE' },
  { input: 'kalongwe', expected: 60, description: 'Lowercase: kalongwe' },
  { input: 'KALONGW', expected: 60, description: 'Short: KALONGW (87% match)' },
  { input: 'KALONGWI', expected: 60, description: 'Typo: KALONGWI' },
  { input: 'KALONG', expected: 60, description: 'Short: KALONG (75% match)' },
  
  // Non-matching
  { input: 'LUBUMBASHI', expected: 0, description: 'Non-match: LUBUMBASHI' },
  { input: 'DAR', expected: 0, description: 'Non-match: DAR' },
];

locationTests.forEach(test => {
  const result = FuelConfigService.getLoadingPointExtraFuel(test.input);
  const status = result === test.expected ? '✓' : '✗';
  console.log(`${status} ${test.description}: ${result}L (expected ${test.expected}L)`);
});

// Test 2: Moshi/Msa destination matching
console.log('\n\nTEST 2: Destination Extra Fuel (Moshi/Msa)');
console.log('-------------------------------------------');

const destinationTests = [
  { input: 'MOSHI', expected: 170, description: 'Exact: MOSHI' },
  { input: 'moshi', expected: 170, description: 'Lowercase: moshi' },
  { input: 'MSA', expected: 170, description: 'Exact: MSA' },
  { input: 'msa', expected: 170, description: 'Lowercase: msa' },
  { input: 'MOSH', expected: 170, description: 'Short: MOSH (80% match)' },
  { input: 'MOSHI TOWN', expected: 170, description: 'Contains: MOSHI TOWN' },
  { input: 'DAR', expected: 0, description: 'Non-match: DAR' },
  { input: 'TANGA', expected: 0, description: 'Non-match: TANGA' },
];

destinationTests.forEach(test => {
  const result = FuelConfigService.getDestinationExtraFuel(test.input);
  const status = result === test.expected ? '✓' : '✗';
  console.log(`${status} ${test.description}: ${result}L (expected ${test.expected}L)`);
});

// Test 3: Complete fuel difference calculation scenarios
console.log('\n\nTEST 3: Complete Fuel Difference Scenarios');
console.log('-------------------------------------------');

// Scenario 1: Original 2300L, return from Kamoa (needs 2440L), going to DAR
const scenario1Record: FuelRecord = {
  id: 1,
  date: '2025-12-04',
  month: 'December 2025',
  truckNo: 'T664 ECQ',
  goingDo: '6449',
  start: 'DAR',
  from: 'DAR',
  to: 'KOLWEZI',
  totalLts: 2300,
  extra: 60,
  balance: 900,
  tangaYard: 0,
  darYard: 0,
  darGoing: 0,
  moroGoing: 0,
  mbeyaGoing: 0,
  tdmGoing: 0,
  zambiaGoing: 0,
  congoFuel: 0,
  zambiaReturn: 0,
  tundumaReturn: 0,
  mbeyaReturn: 0,
  moroReturn: 0,
  darReturn: 0,
  tangaReturn: 0,
};

const scenario1DO: DeliveryOrder = {
  id: 1,
  doNumber: '6868',
  date: '2025-12-04',
  truckNo: 'T664 ECQ',
  trailerNo: 'TR100',
  importOrExport: 'EXPORT',
  destination: 'KAMOA', // Loading point (return journey)
  loadingPoint: 'KOLWEZI',
  clientName: 'Test Client',
  tonnages: 30,
  ratePerTon: 1000,
  driverName: 'John Doe',
  doType: 'DO',
  invoiceNos: [],
};

console.log('\nScenario 1: 2300L going, return from KAMOA to DAR');
console.log('Expected: +140L difference + 40L Kamoa extra = 180L additional');
const result1 = fuelRecordService.updateFuelRecordWithReturnDO(scenario1Record, scenario1DO);
console.log('Result:', result1.additionalFuelInfo);
console.log(`${result1.additionalFuelInfo?.totalAdditionalFuel === 180 ? '✓' : '✗'} Total additional fuel: ${result1.additionalFuelInfo?.totalAdditionalFuel}L`);

// Scenario 2: Original 2200L, return from NMI (needs 2200L), going to MOSHI
const scenario2Record: FuelRecord = {
  ...scenario1Record,
  totalLts: 2200,
  to: 'LIKASI',
  start: 'MOSHI',
};

const scenario2DO: DeliveryOrder = {
  ...scenario1DO,
  destination: 'NMI', // Loading point
};

console.log('\nScenario 2: 2200L going, return from NMI to MOSHI');
console.log('Expected: 0L difference + 20L NMI extra + 170L Moshi extra = 190L additional');
const result2 = fuelRecordService.updateFuelRecordWithReturnDO(scenario2Record, scenario2DO);
console.log('Result:', result2.additionalFuelInfo);
console.log(`${result2.additionalFuelInfo?.totalAdditionalFuel === 190 ? '✓' : '✗'} Total additional fuel: ${result2.additionalFuelInfo?.totalAdditionalFuel}L`);

// Scenario 3: Original 2400L, return from Kalongwe (needs 2440L), going to DAR
const scenario3Record: FuelRecord = {
  ...scenario1Record,
  totalLts: 2400,
  to: 'KOLWEZI',
  start: 'DAR',
};

const scenario3DO: DeliveryOrder = {
  ...scenario1DO,
  destination: 'KALONGWE', // Loading point
};

console.log('\nScenario 3: 2400L going, return from KALONGWE to DAR');
console.log('Expected: 40L difference + 60L Kalongwe extra = 100L additional');
const result3 = fuelRecordService.updateFuelRecordWithReturnDO(scenario3Record, scenario3DO);
console.log('Result:', result3.additionalFuelInfo);
console.log(`${result3.additionalFuelInfo?.totalAdditionalFuel === 100 ? '✓' : '✗'} Total additional fuel: ${result3.additionalFuelInfo?.totalAdditionalFuel}L`);

// Scenario 4: Original 2400L, return from regular location (needs 2200L), going to DAR
const scenario4Record: FuelRecord = {
  ...scenario1Record,
  totalLts: 2400,
  to: 'KOLWEZI',
};

const scenario4DO: DeliveryOrder = {
  ...scenario1DO,
  destination: 'LUBUMBASHI', // Regular location
};

console.log('\nScenario 4: 2400L going, return from LUBUMBASHI (needs 2100L) to DAR');
console.log('Expected: 0L difference (already have enough) + 0L extras = 0L additional');
const result4 = fuelRecordService.updateFuelRecordWithReturnDO(scenario4Record, scenario4DO);
console.log('Result:', result4.additionalFuelInfo);
console.log(`${result4.additionalFuelInfo?.totalAdditionalFuel === 0 ? '✓' : '✗'} Total additional fuel: ${result4.additionalFuelInfo?.totalAdditionalFuel}L`);

console.log('\n==========================================');
console.log('TEST COMPLETE');
console.log('==========================================\n');
