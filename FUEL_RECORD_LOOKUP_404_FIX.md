# Fuel Record Lookup 404 Error Fix

## Issue Summary

**Problem**: When cancelling an LPO entry through the modal, the frontend shows "⚠️ No fuel record found for DO 0007/26" and "404 Not Found" error, even though:
- The fuel record exists
- The backend cancellation actually works correctly
- The fuel is properly deducted/restored

**Root Causes**: 
1. The fuel record lookup endpoint `/fuel-records/do/:doNumber` was NOT filtering out cancelled fuel records
2. **Date format mismatch**: Fuel records store dates as strings in various formats (e.g., "6-Oct", "25-Jan", "2026-01-25"), but the backend was using `$gte` string comparison with "YYYY-MM-DD" format, which doesn't work for non-ISO date strings

---

## Technical Details

### The Workflow

1. **User clicks "Cancel" on LPO entry** in LPOSheetView modal (for EITHER going or returning journey)
2. **Frontend checks fuel record** → Calls `fuelRecordsAPI.getByDoNumber('0007/26')` (works for any DO)
3. **Backend endpoint** → `GET /fuel-records/do/:doNumber` → `getFuelRecordByGoingDO()` 
   - **Note**: Despite the misleading function name, this searches BOTH `goingDo` AND `returnDo` fields
4. **Frontend shows modal** with detected direction (going/returning) and checkpoint
5. **User confirms cancellation**
6. **Backend cancels** → `POST /lpo-documents/cancel-truck` → `cancelTruckInLPO()`

### The Problem

The `getFuelRecordByGoingDO()` function searches for fuel records using **BOTH** goingDo and returnDo, but had TWO issues:

**Issue 1: Missing cancelled record filter (OLD CODE):**
```typescript
let fuelRecord = await FuelRecord.findOne({
  goingDo: doNumber,
  isDeleted: false,
  // ❌ MISSING: isCancelled filter
  date: { $gte: dateLimitString }
});
```

**Issue 2: Date format mismatch (OLD CODE):**
```typescript
// This creates "2025-09-25" (YYYY-MM-DD)
const dateLimitString = dateLimitForFuelRecords.toISOString().split('T')[0];

// But fuel records might have dates like:
// - "6-Oct" (doesn't match YYYY-MM-DD comparison)
// - "25-Jan" (doesn't match YYYY-MM-DD comparison)
// - "2026-01-25" (works, but inconsistent)

// String comparison fails for non-ISO formats!
date: { $gte: "2025-09-25" } // Won't find "6-Oct" or "25-Jan"
```

**Step 6 (Cancellation):**
```typescript
// Cancellation code - lpoSummaryController.ts  
let fuelRecord = await FuelRecord.findOne({
  goingDo: doNumber,
  isDeleted: false,
  isCancelled: { $ne: true }, // ✅ CORRECT: Excludes cancelled records
});
```

**Result**: 
- If fuel record is cancelled → lookup finds it → frontend says "found" → but then cancellation can't find it (because it filters out cancelled) → error
- User sees "No fuel record found" warning in modal even though record exists

---
Fixed BOTH issues in `getFuelRecordByGoingDO()`:

1. ✅ Added `isCancelled: { $ne: true }` filter (for both goingDo and returnDo lookups)
2. ✅ **Removed date-based filtering** since DO numbers are unique enough and date formats are inconsistent
3. ✅ Added `.sort({ createdAt: -1 })` to get most recent record if duplicates exist

### File: `backend/src/controllers/fuelRecordController.ts`

**Lines 264-285**:
```typescript
// Search by DO number only (DO numbers are unique enough)
// Note: Removed date filtering because fuel record dates are stored as strings in various formats
// (e.g., "6-Oct", "2025-10-06") which don't work reliably with $gte string comparison

// Search by goingDo (for going journey LPOs)
let fuelRecord = await FuelRecord.findOne({
  goingDo: doNumber,
  isDeleted: false,
  isCancelled: { $ne: true },  // ✅ ADDED - excludes cancelled records
}).sort({ createdAt: -1 }); // ✅ ADDED - get most recent if multiple exist

let direction: 'going' | 'returning' = 'going';

// Search by returnDo (for returning journey LPOs)
if (!fuelRecord) {
  fuelRecord = await FuelRecord.findOne({
    returnDo: doNumber,
    isDeleted: false,
    isCancelled: { $ne: true },  // ✅ ADDED - excludes cancelled records
  }).sort({ createdAt: -1 }); // ✅ ADDED - get most recent if multiple existsDeleted: false,
    isCancelled: { $ne: true },  // ✅ ADDED - excludes cancelled records
    date: { $gte: dateLimitString }
  });
  direction = 'returning';
}
```

---

## Testing
reate fuel record with DO "0003/26" and date "6-Oct"
2. Try to cancel LPO with DO "0003/26"
3. ❌ Query: `date: { $gte: "2025-09-25" }` doesn't match "6-Oct" (string comparison fails)
4. ❌ Modal shows "⚠️ No fuel record found"
5. ❌ Console shows "404 Not Found"

### After Fix
1. Create fuel record with DO "0003/26" (any date format)
2. Try to cancel LPO with DO "0003/26"
3. ✅ Query finds by DO number (ignores date format issues)
4. ✅ Modal shows correct fuel record details
5. ✅ Cancellation works smoothrd is cancelled)
4. ✅ Frontend handles it gracefully - shows "NIL DO" warning (which is correct)
5. ✅ User can still create LPO manually

---

## Impact

### Before
- **Frontend modal**: Shows confusing "No record found" warning
- **Console**: 404 errors
- **User experience**: Confusing - record exists but system says it doesn't
- **Data integrity**: Still correct (cancellation worked), just confusing UI

### After  
- **Frontend modal**: Correctly identifies DO has no active fuel record
- **Console**: Clean (404 is expected for cancelled records, handled gracefully)
- **User experience**: Clear and consistent
- **Data integrity**: Unchanged (still correct)

---

## Related Files

**Backend:**
- `backend/src/controllers/fuelRecordController.ts` (getFuelRecordByGoingDO) - FIXED
- `backend/src/controllers/lpoSummaryController.ts` (cancelTruckInLPO) - Already correct

**Frontend:**
- `frontend/src/services/api.ts` (fuelRecordsAPI.getByDoNumber) - No change needed
- `frontend/src/components/LPOSheetView.tsx` - No change needed (already handles 404)

---

## Consistency

Now ALL fuel record lookups across the system properly exclude cancelled records:

1. ✅ **LPO cancellation** (lpoSummaryController) - `isCancelled: { $ne: true }`
2. ✅ **Fuel record lookup by DO** (fuelRecordController) - `isCancelled: { $ne: true }` (FIXED)
3. ✅ **Auto-fetch service** (frontend) - filters `!r.isCancelled`
4. ✅ **Journey queue** (deliveryOrderController) - filters `!r.isCancelled`

---BOTH fuel record lookups (goingDo AND returnDo) in `getFuelRecordByGoingDO()`.

**Scope**: Works for LPO cancellations in BOTH directions:
- ✅ Going journey LPOs (searched by goingDo)
- ✅ Returning journey LPOs (searched by returnDo)

**Result**: Frontend modal no longer shows false "404 Not Found" errors when checking cancelled fuel records during LPO cancellation workflow - regardless of journey direction.

**Note**: The function name `getFuelRecordByGoingDO()` is misleading - it actually searches by BOTH goingDo and returnDo fields

**One-line fix**: Added `isCancelled: { $ne: true }` to fuel record lookups in `getFuelRecordByGoingDO()`.

**Result**: Frontend modal no longer shows false "404 Not Found" errors when checking cancelled fuel records during LPO cancellation workflow.
