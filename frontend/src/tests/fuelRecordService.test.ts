/**
 * Test file to validate fuel record calculations against CSV data
 * Run this to verify the calculation logic matches expected results
 */

import fuelRecordService from '../services/fuelRecordService';
import { DeliveryOrder } from '../types';

// Test case from CSV line 1
const testCase1: DeliveryOrder = {
  sn: 1,
  date: '6-Oct',
  importOrExport: 'IMPORT',
  doType: 'DO',
  doNumber: '6395',
  clientName: 'Test Client',
  truckNo: 'T705 DXY',
  trailerNo: 'T001',
  containerNo: 'LOOSE CARGO',
  loadingPoint: 'DAR',
  destination: 'Kpm',
  haulier: 'Test Haulier',
  tonnages: 25,
  ratePerTon: 500,
};

// Expected results from CSV
const expected1 = {
  totalLts: 2200,
  extra: 100,
  darYard: -550,
  mbeyaGoing: -450,
  zambiaGoing: -400,
  balance: 900,
};

console.log('=== Fuel Record Calculation Test ===\n');

// Test 1: Basic going journey
console.log('Test 1: Basic Going Journey (T705 DXY to Kpm)');
const result1 = fuelRecordService.createFuelRecordFromDO(testCase1, 'DAR_YARD', 2200);
console.log('Expected:', expected1);
console.log('Calculated:', {
  totalLts: result1.fuelRecord.totalLts,
  extra: result1.fuelRecord.extra,
  darYard: result1.fuelRecord.darYard,
  mbeyaGoing: result1.fuelRecord.mbeyaGoing,
  zambiaGoing: result1.fuelRecord.zambiaGoing,
  balance: result1.fuelRecord.balance,
});
console.log('Match:', JSON.stringify(result1.fuelRecord) === JSON.stringify(expected1) ? '✓' : '✗');
console.log('LPOs to generate:', result1.lposToGenerate.length);
console.log('\n---\n');

// Test 2: Different truck batch (80L)
const testCase2: DeliveryOrder = {
  ...testCase1,
  truckNo: 'T784 DWK',
  doNumber: '6450',
  destination: 'Likasi',
};

const expected2 = {
  extra: 80,
  zambiaGoing: -380,
  balance: 900,
};

console.log('Test 2: Batch 80 Truck (T784 DWK to Likasi)');
const result2 = fuelRecordService.createFuelRecordFromDO(testCase2, 'DAR_YARD', 2200);
console.log('Expected extra:', expected2.extra);
console.log('Calculated extra:', result2.fuelRecord.extra);
console.log('Expected zambia going:', expected2.zambiaGoing);
console.log('Calculated zambia going:', result2.fuelRecord.zambiaGoing);
console.log('Match:', result2.fuelRecord.extra === expected2.extra && 
                     result2.fuelRecord.zambiaGoing === expected2.zambiaGoing ? '✓' : '✗');
console.log('\n---\n');

// Test 3: Return journey with LPO generation
const goingRecord = {
  id: 1,
  date: '6-Oct',
  truckNo: 'T664 ECQ',
  goingDo: '6449',
  start: 'DAR',
  from: 'DAR',
  to: 'COMIKA',
  totalLts: 2200,
  extra: 60,
  darYard: -550,
  mbeyaGoing: -450,
  zambiaGoing: -360,
  balance: 900,
};

const returnDO: DeliveryOrder = {
  ...testCase1,
  truckNo: 'T664 ECQ',
  doNumber: '6868',
  importOrExport: 'EXPORT',
  destination: 'DAR',
};

console.log('Test 3: Return Journey (T664 ECQ from COMIKA to DAR)');
const result3 = fuelRecordService.updateFuelRecordWithReturnDO(goingRecord as any, returnDO);
console.log('Return DO:', returnDO.doNumber);
console.log('Updated record has return DO:', !!result3.updatedRecord.returnDo);
console.log('Route reversed:', result3.updatedRecord.from, '->', result3.updatedRecord.to);
console.log('Zambia Return:', result3.updatedRecord.zambiaReturn);
console.log('Tunduma Return:', result3.updatedRecord.tundumaReturn);
console.log('Mbeya Return:', result3.updatedRecord.mbeyaReturn);
console.log('LPOs generated:', result3.lposToGenerate.length);
console.log('LPO stations:', result3.lposToGenerate.map(l => `${l.station} (${l.liters}L)`).join(', '));
console.log('\n---\n');

// Test 4: Mombasa destination (should add Moro and Tanga return)
const mombasaDO: DeliveryOrder = {
  ...testCase1,
  truckNo: 'T705 DXY',
  destination: 'MOMBASA',
  importOrExport: 'EXPORT',
};

console.log('Test 4: Mombasa Return Journey');
const result4 = fuelRecordService.updateFuelRecordWithReturnDO(goingRecord as any, mombasaDO);
console.log('Destination includes Mombasa:', mombasaDO.destination.includes('MOMBASA'));
console.log('Has Moro Return:', !!result4.updatedRecord.moroReturn);
console.log('Moro Return amount:', result4.updatedRecord.moroReturn);
console.log('Has Tanga Return:', !!result4.updatedRecord.tangaReturn);
console.log('Tanga Return amount:', result4.updatedRecord.tangaReturn);
console.log('Match expected (100L, 70L):', 
  result4.updatedRecord.moroReturn === -100 && 
  result4.updatedRecord.tangaReturn === -70 ? '✓' : '✗');
console.log('\n---\n');

// Test 5: Truck batch detection
console.log('Test 5: Truck Batch Detection');
const trucks = [
  { no: 'T857 DNH', expected: 100, batch: 'batch_100' },
  { no: 'T784 DWK', expected: 80, batch: 'batch_80' },
  { no: 'T753 ELY', expected: 60, batch: 'batch_60' },
  { no: 'T999 XYZ', expected: 60, batch: 'default' },
];

trucks.forEach(truck => {
  const extra = fuelRecordService.calculateExtraFuel(truck.no);
  console.log(`${truck.no}: ${extra}L (${truck.batch}) - ${extra === truck.expected ? '✓' : '✗'}`);
});

console.log('\n=== Test Complete ===');

export { };
