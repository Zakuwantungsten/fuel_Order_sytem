# EXPORT DO Fuel Logic Report

## Executive Summary

When a truck with a **going DO (IMPORT)** receives a **return DO (EXPORT)**, the system **ONLY adds destination-specific extra fuel** (+170L for Moshi/MSA) automatically. Route fuel differences and loading point extras are NO LONGER automatically added. Instead, the system **alerts the user** when the return route requires different fuel allocation, allowing manual review and adjustment.

---

## Complete Journey Flow

### Phase 1: IMPORT DO (Going Journey)

**What happens:**
1. User creates an IMPORT DO for a truck
2. System automatically creates a fuel record with:
   - `goingDo`: DO number
   - `totalLts`: Based on destination route (e.g., 2300L for Kamoa)
   - `extra`: Based on truck batch (e.g., 200L for specific batches)
   - `from`: Start location (DAR or TANGA)
   - `to`: Destination (e.g., KAMOA)
   - `balance`: totalLts + extra (e.g., 2300 + 200 = 2500L)
   - All checkpoint fields: **0** (empty, filled as LPOs created)

**Example:**
```
Truck: T889 ZSA
IMPORT DO: DO-001/2025
Route: DAR → KAMOA
totalLts: 2300L
extra: 200L
balance: 2500L
Status: Going journey in progress
```

---

### Phase 2: EXPORT DO (Return Journey)

**What happens:**
1. User creates an EXPORT DO for the same truck
2. System finds the existing fuel record (matched by truckNo without returnDo)
3. System **CALCULATES but DOES NOT automatically add** route fuel differences
4. System **ONLY adds destination extras** (+170L for Moshi/MSA)

#### A. Base Route Calculation (FOR NOTIFICATION ONLY)
```javascript
// Calculate required fuel for return journey
returnLoadingPoint = EXPORT DO destination (e.g., "KAMOA")
finalDestination = Original start location (e.g., "DAR")

// Look up route: KAMOA → DAR
requiredTotalLiters = 2400L  // From database routes

// Calculate difference for warning purposes
originalTotalLiters = 2300L  // From going journey
fuelDifference = 2400L - 2300L = 100L
hasFuelShortfall = true  // Will trigger warning

// ⚠️ NOTE: This difference is NOT automatically added to totalLts
// User receives warning and must manually adjust if needed
```

#### B. Loading Point Extra Fuel (REMOVED)
```javascript
// ❌ REMOVED - No longer automatically adds loading point extras
// Previously added: Kamoa +40L, NMI +20L, Kalongwe +60L
// Now: User must manually add if needed
```

#### C. Destination Extra Fuel (MAINTAINED)
```javascript
// ✅ STILL ACTIVE - Automatically adds destination extras
if (finalDestination === "MOSHI" || finalDestination === "MSA") 
    additionalFuel += 170L
```

#### D. Final Calculation
```javascript
// Only destination extras are added automatically
totalAdditionalFuel = destinationExtra
                    = 0L (for DAR destination)

newTotalLiters = originalTotalLiters + totalAdditionalFuel
               = 2300L + 0L = 2300L (UNCHANGED)

newBalance = oldBalance + totalAdditionalFuel
           = 2500L + 0L = 2500L (UNCHANGED)

// User sees warning:
// "⚠️ Return route requires 2400L but truck has 2300L (100L short)"
```

---

## Updated Fuel Record After EXPORT DO

```javascript
{
  // Original fields preserved
  truckNo: "T889 ZSA",
  goingDo: "DO-001/2025",
  returnDo: "DO-002/2025", // ✅ NEW
  
  // Original journey preserved
  originalGoingFrom: "DAR", // ✅ NEW - stores original "from"
  originalGoingTo: "KAMOA", // ✅ NEW - stores original "to"
  
  // Journey state updated for return
  from: "KAMOA", // ✅ CHANGED - now loading from destination
  to: "DAR", // ✅ CHANGED - returning to start
  
  // Fuel allocation - ONLY destination extras added
  totalLts: 2300, // ⚠️ UNCHANGED (no automatic route difference addition)
  extra: 200, // UNCHANGED
  balance: 2500, // ⚠️ UNCHANGED (no automatic route difference addition)
  
  // Checkpoint fields still 0 (filled when LPOs created)
  tangaYard: 0,
  darYard: 0,
  darGoing: 0,
  // ... all other checkpoints: 0
}
```

**User Alert Displayed:**
```
⚠️ FUEL SHORTFALL ALERT:
Return route KAMOA→DAR requires 2400L
Truck currently has 2300L allocated
Shortage: 100L

⚠️ Please review and manually add extra fuel if needed!
```

---

## Frontend Implementation

**File:** `frontend/src/services/fuelRecordService.ts`

**Key Function:** `updateFuelRecordWithReturnDO()` (Lines 415-510)

```typescript
export async function updateFuelRecordWithReturnDO(
  existingRecord: FuelRecord,
  returnDeliveryOrder: DeliveryOrder
): Promise<{ 
  updatedRecord: Partial<FuelRecord>; 
  lposToGenerate: LPOToGenerate[]; 
  additionalFuelInfo?: any 
}> {
  // 1. Store original going journey
  const originalGoingFrom = existingRecord.originalGoingFrom || existingRecord.from;
  const originalGoingTo = existingRecord.originalGoingTo || existingRecord.to;
  
  // 2. Get return journey details
  const returnLoadingPoint = returnDeliveryOrder.destination; // Where truck loads for return
  const finalDestination = existingRecord.start || 'DAR'; // Where truck returns to
  
  // 3. Calculate required fuel for return route
  const destinationMatch = await FuelConfigService.getTotalLitersByRoute(
    returnLoadingPoint, 
    finalDestination
  );
  const requiredTotalLiters = destinationMatch.liters;
  
  // 4. Calculate fuel difference (for notification, not auto-added)
  const originalTotalLiters = existingRecord.totalLts || 0;
  const fuelDifference = requiredTotalLiters - originalTotalLiters;
  const hasFuelShortfall = fuelDifference > 0;
  
  // 5. Only add destination extras automatically
  // Loading point extras REMOVED - user must manually add if needed
  let additionalFuelNeeded = 0;
  
  // 6. Add destination extras
  const destinationExtra = FuelConfigService.getDestinationExtraFuel(finalDestination);
  additionalFuelNeeded += destinationExtra;
  
  // 7. Calculate new totals (only destination extras added)
  const newTotalLiters = originalTotalLiters + additionalFuelNeeded;
  
  // 8. Update fuel record (only with destination extras)
  const updatedRecord: Partial<FuelRecord> = {
    returnDo: returnDeliveryOrder.doNumber,
    originalGoingFrom: originalGoingFrom,
    originalGoingTo: originalGoingTo,
    from: returnLoadingPoint,
    to: finalDestination,
    totalLts: newTotalLiters, // Only includes destination extras
  };
  
  // 9. Update balance if destination extra was added
  if (additionalFuelNeeded > 0) {
    updatedRecord.balance = (existingRecord.balance || 0) + additionalFuelNeeded;
  }
  
  // 10. Log warning if fuel shortfall detected
  if (hasFuelShortfall) {
    console.warn(`⚠️ FUEL SHORTFALL: Return route requires ${requiredTotalLiters}L but truck has ${originalTotalLiters}L (${fuelDifference}L short)`);
  }
  
  return { updatedRecord, lposToGenerate: [], additionalFuelInfo };
}
```

---

## Backend Implementation

**File:** `backend/src/controllers/deliveryOrderController.ts`

**Key Function:** `relinkExportDOToFuelRecord()` (Lines 2597-2691)

```typescript
export const relinkExportDOToFuelRecord = async (req: AuthRequest, res: Response) => {
  // 1. Get the EXPORT delivery order
  const deliveryOrder = await DeliveryOrder.findOne({ _id: id, isDeleted: false });
  
  // 2. Validate it's an EXPORT DO
  if (deliveryOrder.importOrExport !== 'EXPORT') {
    throw new ApiError(400, 'Only EXPORT (return) DOs can be re-linked');
  }
  
  // 3. Find matching fuel record (one without returnDo yet)
  const matchingFuelRecord = await FuelRecord.findOne({
    truckNo: deliveryOrder.truckNo,
    returnDo: { $in: [null, '', undefined] },
    isDeleted: false,
  }).sort({ date: -1 }); // Most recent first
  
  // 4. Store original going journey
  const originalGoingFrom = matchingFuelRecord.originalGoingFrom || matchingFuelRecord.from;
  const originalGoingTo = matchingFuelRecord.originalGoingTo || matchingFuelRecord.to;
  
  // 5. Update fuel record with return DO
  const updateData = {
    returnDo: deliveryOrder.doNumber,
    originalGoingFrom: originalGoingFrom,
    originalGoingTo: originalGoingTo,
    from: deliveryOrder.destination, // Return journey loading point
    to: matchingFuelRecord.start || 'DAR', // Return destination
  };
  
  await FuelRecord.findByIdAndUpdate(matchingFuelRecord._id, updateData);
  
  // Note: Backend only updates linking, not fuel calculation
  // Fuel calculation happens in frontend before API call
};
```

---
Fuel Shortfall Detected + Destination Extra Added:
```
⚠️ FUEL SHORTFALL ALERT:
Return route KAMOA→DAR requires 2400L
Truck currently has 2300L allocated
Shortage: 100L

⚠️ Please review and manually add extra fuel if needed!
```

### If Only Destination Extra Added (No Shortfall):
```
✓ Auto-added destination extra: +170L (MSA)
New Total: 2470L (was 2300L)
```

### If No Changes (No Shortfall, No Destination Extra)2400L needed - 2300L original)
- Loading point extra (KAMOA): +40L
- Destination extra (DAR): +0L
```

### If No Additional Fuel:
```
✓ Fuel record updated with return DO-002/2025
```

### If No Matching Going Record:
```
⚠️ Warning: No fuel record found for truck T889 ZSA.

Return DO-002/2025 has been saved, but could not be linked to a fuel record.

A notification has been- Manual Decision Required
- Route fuel differences are **calculated but NOT automatically added**
- System alerts user if return route requires more fuel
- User must manually review and decide if extra fuel is needed
- Only destination extras (+170L for Moshi/MSA) are added automatically

### 2. Special Cases (Updated)
```javascript
// Destination extras - STILL ACTIVE
if (finalDestination === "MOSHI" || finalDestination === "MSA") 
    additionalFuel += 170L

// Loading point extras - REMOVED
// Previously: Kamoa +40L, NMI +20L, Kalongwe +60L
// Now: User must manually add if needed

// Base route difference - NOT AUTO-ADDED
// System calculates and warns, user decides
if (returnLoadingPoint === "NMI") additionalFuel += 20L

// Kalongwe loading point
if (returnLoadingPoint === "KALONGWE") additionalFuel += 60L

// Moshi/MSA final destination
if (finalDestination === "MOSHI" || finalDestination === "MSA") 
    additionalFuel += 170L
```

### 3. Checkpoint Fields Remain Empty
- Return checkpoint fielonly destination extra:
// Scenario 1: No destination extra (e.g., returning to DAR)
balance = (2300 + 200) - (0) = 2500L (unchanged)

// Scenario 2: With destination extra (e.g., returning to MSA)
balance = (2300 + 170 + 200) - (0) = 2670L (+170L) created for fuel orders
- This matches the IMPORT DO behavior

### 4. Balance Calculation
```javascript
balance = (totalLts + extra) - (sum of all checkpoint fields)

// After EXPORT DO with additional fuel:
balance = (2440 + 200) - (0) = 2640L
```

---

## Configuration Services

### FuelConfigService Methods

**1. getTotalLitersByRoute(from, to)**
- Returns: `{ liters, matched, matchType, matchedRoute, suggestions }`
- Uses fuzzy matching for route names
- Example: "KAMOA" → "KAMOA (Kamoa)" with 2400L

**2. getLoadingPointExtraFuel(loadingPoint)**
- Returns extra liters for special loading points
- Uses fuzzy matching: "KAMOA" matches "Kamoa", "kamoa", "KAMOA COPPER"

**3. getDestinationExtraFuel(destination)**
- Returns extra liters for special des (Shortfall Warning)
```
IMPORT: DAR → KAMOA (2300L + 200L extra = 2500L)
EXPORT: KAMOA → DAR (requires 2400L base)
Warning: "⚠️ Return route requires 2400L but truck has 2300L (100L short)"
Result: totalLts = 2300L (UNCHANGED), balance = 2500L (UNCHANGED)
User Action: Must manually add extra fuel if needed
```

### Scenario 2: Return to Mombasa with Destination Extra
```
IMPORT: DAR → NMI (2300L + 200L extra = 2500L)
EXPORT: NMI → MSA (requires 2500L base)
Warning: None (fuel matches)
Destination Extra: +170L for MSA
Result: totalLts = 2470L (+170L), balance = 2670L (+170L)
Message: "✓ Auto-added destination extra: +170L (MSA)"
```

### Scenario 3: Symmetric Route (No Changes)
```
IMPORT: DAR → LUSAKA (2300L + 200L extra = 2500L)
EXPORT: LUSAKA → DAR (requires 2300L base, symmetric)
Warning: None
Destination Extra: None
Result: totalLts = 2300L (UNCHANGED), balance = 2500L (UNCHANGED)
Message: "✓ Fuel record updated with return DO-002/2025"
```

### Scenario 4: Shortfall + Destination Extra
```
IMPORT: DAR → KAMOA (2300L + 200L extra = 2500L)
EXPORT: KAMOA → MOSHI (requires 2400L base)
Warning: "⚠️ Return route requires 2400L but truck has 2300L (100L short)"
Destination Extra: +170L for MOSHI
Result: totalLts = 2470L (+170L only), balance = 2670L (+170L only)
User Action: Must manually add 100L for route difference if needed

### Scenario 4: Symmetric Route
```
IMPORT: DAR → LUSAKA (2300L + 200L extra = 2500L)
EXPORT: LUSAKA → DAR (requires 2300L base, symmetric)
Lusaka loading extra: +0L
Result: totalLts = 2300L, balance = 2500L (NO CHANGE)
```

---

## Key Files Reference

### Frontend
- **fuelRecordSeMAY change when EXPORT DO is added, but ONLY for destination extras.**

### Changes Made:
1. **totalLts**: Only increases for destination extras (+170L for Moshi/MSA)
2. **balance**: Increases proportionally with totalLts (destination extras only)
3. **returnDo**: Set to EXPORT DO number
4. **originalGoingFrom/To**: Stores original journey (NEW fields)
5. **from/to**: Updated to reflect return journey state

### Fields NOT Changed:
- **extra**: Remains same (truck batch constant)
- **All checkpoint fields**: Stay at 0 (filled when LPOs created)
- **goingDo**: Original IMPORT DO preserved

### User Alerts:
1. **Fuel Shortfall Warning**: When return route requires more fuel than allocated
2. **Destination Extra Confirmation**: When +170L automatically added
3. **Manual Action Required**: User must decide if additional fuel needed for route differences

### Removed Automatic Additions:
- ❌ Base route fuel differences (now generates warning only)
- ❌ Kamoa loading point extra (+40L)
- ❌ NMI loading point extra (+20L)
- ❌ Kalongwe loading point extra (+60L)

### Maintained Automatic Additions:
- ✅ Moshi destination extra (+170L)
- ✅ MSA/Mombasa destination extra (+170L)
5. **from/to**: Updated to reflect return journey state

### Fields NOT Changed:
- **extra**: Remains same (truck batch constant)
- **All checkpoint fields**: Stay at 0 (filled when LPOs created)
- **goingDo**: Original IMPORT DO preserved

### Calculation Factors:
1. Base route fuel requirement difference
2. Special loading point extras
3. Special destination extras

This ensures the fuel record accurately reflects the total fuel needed for the **complete round trip** (going + return).

---

## Next Steps for Development

1. ✅ **CONFIRMED**: Additional fuel calculation is working
2. ⏳ **Test**: Run migration script for existing fuel records
3. ⏳ **Document**: User guide for EXPORT DO fuel allocation
4. ⏳ **Monitor**: Track additional fuel patterns for optimization
