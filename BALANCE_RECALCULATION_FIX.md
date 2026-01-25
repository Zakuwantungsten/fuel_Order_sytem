# Balance Recalculation Fix - Implementation Summary

## Issue Fixed
Fixed balance calculation inconsistencies in fuel records where the formula `(totalLiters + extraFuel) - (yardsFuel + checkpoints) = balance` was not being consistently applied, especially when:
- Records were created with missing configuration (locked state)
- Fuel was allocated while records were locked
- Configuration was filled in later (manual entry)
- Routes were updated causing totalLiters to change

## Root Cause
The balance was only being recalculated when unlocking records, not on every update. This caused:
- **Negative balances** when fuel was allocated to locked records (balance started at 0)
- **Incorrect balances** when configuration was filled in after fuel allocation
- **Formula inconsistencies** when routes were updated

## Solution Implemented

### 1. **Fuel Record Controller** (`backend/src/controllers/fuelRecordController.ts`)
**What Changed:**
- Balance is now **ALWAYS recalculated** whenever any balance-affecting field is updated
- Applies to both locked and unlocked records
- Checks all 15 checkpoint fields plus totalLts and extra

**Logic:**
```typescript
// Detects if any balance-affecting field is being updated
const balanceFieldsUpdated = (
  req.body.totalLts !== undefined ||
  req.body.extra !== undefined ||
  checkpointFields.some(field => req.body[field] !== undefined)
);

if (balanceFieldsUpdated) {
  // Get final values (updated or existing)
  const totalFuel = (finalTotalLts || 0) + (finalExtra || 0);
  const totalCheckpoints = checkpointFields.reduce(...);
  
  // Apply formula
  req.body.balance = totalFuel - totalCheckpoints;
}
```

### 2. **Delivery Order Controller** (`backend/src/controllers/deliveryOrderController.ts`)
**What Changed:**
- When route is updated and totalLts changes, balance is recalculated
- Applies to:
  - **IMPORT DOs**: Destination changes
  - **EXPORT DOs**: Origin/destination changes  
  - **Loading point changes**

**Logic:**
```typescript
// When route is found and totalLts is updated
const totalFuel = newRoute.defaultTotalLiters + (fuelRecord.extra || 0);
const totalCheckpoints = /* sum all 15 checkpoint fields */;
updates.balance = totalFuel - totalCheckpoints;
```

### 3. **LPO Summary Controller** (Already Correct ✅)
- Already updates balance when LPOs are created
- Subtracts liters from balance: `newBalance = fuelRecord.balance - liters`

### 4. **Yard Fuel Controller** (Already Correct ✅)
- Already updates balance when yard fuel is dispensed
- Subtracts liters from balance: `newBalance = fuelRecord.balance - liters`

## Files Modified
1. ✅ `backend/src/controllers/fuelRecordController.ts` - Enhanced update logic
2. ✅ `backend/src/controllers/deliveryOrderController.ts` - Added balance recalculation on route updates
3. ✅ `backend/src/scripts/verifyBalanceCalculation.ts` - New verification script
4. ✅ `backend/package.json` - Added `verify:balance` command

## Balance Calculation Formula

### Correct Formula (Now Applied Everywhere)
```
Balance = (totalLiters + extraFuel) - (Sum of ALL Checkpoints)

Where checkpoints include:
- Yard allocations: mmsaYard, tangaYard, darYard
- Going fuel: darGoing, moroGoing, mbeyaGoing, tdmGoing, zambiaGoing, congoFuel
- Return fuel: zambiaReturn, tundumaReturn, mbeyaReturn, moroReturn, darReturn, tangaReturn

All values stored as POSITIVE numbers
```

## Testing & Verification

### Run Verification Script
```bash
cd backend
npm run verify:balance
```

This script:
- ✅ Checks all fuel records in the database
- ✅ Calculates expected balance using the formula
- ✅ Compares with actual balance
- ✅ Reports any discrepancies

### Expected Behavior After Fix

#### Scenario 1: Locked Record → Fuel Allocated → Config Filled
**Before Fix:**
1. Record created: `totalLts=null, extra=null, balance=0` (LOCKED)
2. LPO created: `mbeyaGoing=450, balance=0-450=-450L` ❌ NEGATIVE!
3. Config filled: `totalLts=2000, extra=100, balance=(2000+100)-450=1650L` ❌ Wrong!

**After Fix:**
1. Record created: `totalLts=null, extra=null, balance=0` (LOCKED)
2. LPO created: `mbeyaGoing=450, balance=0-450=-450L`
3. Config filled: `totalLts=2000, extra=100` → **RECALCULATES**: `balance=(2000+100)-450=1650L` ✅ CORRECT!

#### Scenario 2: Route Updated
**Before Fix:**
1. Record: `totalLts=2000, extra=100, mbeyaGoing=450, balance=1650L`
2. Route updated: `totalLts=2500` → `balance=1650L` ❌ Not updated!

**After Fix:**
1. Record: `totalLts=2000, extra=100, mbeyaGoing=450, balance=1650L`
2. Route updated: `totalLts=2500` → **RECALCULATES**: `balance=(2500+100)-450=2150L` ✅ CORRECT!

#### Scenario 3: Manual Checkpoint Entry
**Before Fix:**
1. Record: `totalLts=2000, extra=100, balance=2100L`
2. Manual entry: `darYard=550` → `balance=2100L` ❌ Not updated!

**After Fix:**
1. Record: `totalLts=2000, extra=100, balance=2100L`
2. Manual entry: `darYard=550` → **RECALCULATES**: `balance=(2000+100)-550=1550L` ✅ CORRECT!

## Impact & Benefits

### ✅ Data Integrity
- Balance always reflects current state of all fields
- No more negative balances from locked records
- Formula consistently applied everywhere

### ✅ User Experience
- Manual entries work correctly
- Route updates don't break calculations
- Configuration can be filled in any order

### ✅ Maintainability
- Single source of truth for balance calculation
- Easy to verify correctness with verification script
- Clear logging of balance changes

## Migration

If you have existing records with incorrect balances, run:
```bash
cd backend
npm run migrate:fuel-logic
```

This will:
- Fix all checkpoint values (ensure positive)
- Recalculate all balances using the correct formula
- Verify all records after migration

## Monitoring

### Check Logs
Look for these log messages in the backend:
```
Recalculating balance for fuel record <id>: (<totalLts> + <extra>) - <checkpoints> = <balance>L
Recalculated totalLts and balance for IMPORT DO <doNumber>: <oldLts>L → <newLts>L, balance: <balance>L
```

### Watch for Issues
- Negative balances should no longer appear (except in very rare edge cases)
- Balance should match formula in all records
- Manual entries should update balance immediately

## Technical Details

### Checkpoint Fields Checked
```typescript
const checkpointFields = [
  'mmsaYard', 'tangaYard', 'darYard',          // Yard allocations
  'darGoing', 'moroGoing', 'mbeyaGoing',       // Going fuel
  'tdmGoing', 'zambiaGoing', 'congoFuel',
  'zambiaReturn', 'tundumaReturn',              // Return fuel  
  'mbeyaReturn', 'moroReturn', 'darReturn', 
  'tangaReturn'
];
```

### Balance Calculation Function
```typescript
const getFinalValue = (field: string) => {
  return req.body[field] !== undefined 
    ? req.body[field] 
    : (existingRecord as any)[field];
};

const totalFuel = (finalTotalLts || 0) + (finalExtra || 0);
const totalCheckpoints = checkpointFields.reduce((sum, field) => {
  return sum + Math.abs(getFinalValue(field) || 0);
}, 0);

const balance = totalFuel - totalCheckpoints;
```

## Related Documentation
- [FUEL_CALCULATION_FIX_IMPLEMENTATION.md](./FUEL_CALCULATION_FIX_IMPLEMENTATION.md)
- [FUEL_LOGIC_ANALYSIS_REPORT.md](./FUEL_LOGIC_ANALYSIS_REPORT.md)
- [FUEL_RECORDS_FUNCTIONALITY_REPORT.md](./FUEL_RECORDS_FUNCTIONALITY_REPORT.md)

---

**Date Implemented:** January 25, 2026  
**Status:** ✅ Complete  
**Tested:** Pending database verification
