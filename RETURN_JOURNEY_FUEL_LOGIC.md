# Return Journey Fuel Difference Calculation Logic

## Overview
This document explains the automated fuel allocation calculation for return journeys (EXPORT DOs) in the fuel management system.

## Problem Statement
When a truck completes its outbound delivery and receives a return journey delivery order, the fuel allocation needs to account for:
1. The difference between original fuel allocation and the fuel required to reach the return loading point
2. Extra fuel for special loading locations (mining sites)
3. Extra fuel for special final destinations

## Example Scenario

**Journey Flow:**
```
A (Start: DAR) ──[2300L]──> B (Offload: KOLWEZI) ──[?L]──> C (Load: KAMOA) ──[?L]──> A (Final: DAR)
```

### Breakdown:
1. **Outbound (IMPORT DO)**: Truck starts from DAR (A), assigned 2300L, goes to KOLWEZI (B) and offloads
2. **Return (EXPORT DO)**: After offloading at KOLWEZI (B), receives order to go to KAMOA (C) to load, then return to DAR (A)

### Fuel Calculation:
- Normal route from DAR (A) to KAMOA (C) requires: **2440L**
- Already allocated: **2300L**
- **Difference needed**: 2440 - 2300 = **140L**
- **Kamoa loading extra**: +**40L** (special mining site)
- **Total additional fuel**: 140 + 40 = **180L**

**New total allocation**: 2300 + 180 = **2480L**

## Special Location Extras

### Loading Points (Return Journey Only)
Extra fuel added when loading from these locations:

| Location | Extra Fuel | Reason |
|----------|-----------|---------|
| **KAMOA** | +40L | Remote mining site |
| **NMI** | +20L | Special location |
| **KALONGWE** | +60L | Distant mining site |

### Final Destinations (Return Journey Only)
Extra fuel added when returning to these locations:

| Destination | Extra Fuel | Reason |
|------------|-----------|---------|
| **MOSHI (MSA)** | +170L | Long distance return |

## Fuzzy Location Matching

The system uses **Levenshtein distance algorithm** to match location names even with spelling variations or typos.

### Matching Threshold: 50% similarity

This means the system recognizes locations even when:
- 3-4 characters are misspelled in an 8-character name
- Half the name is correct
- Common typos exist

### Examples:

#### KAMOA Matches:
- ✓ `KAMOA` (exact)
- ✓ `kamoa` (case insensitive)
- ✓ `KAMOWA` (1 typo)
- ✓ `KAMO` (75% match)
- ✓ `KAMUA` (1 typo)

#### NMI Matches:
- ✓ `NMI` (exact)
- ✓ `nmi` (case insensitive)
- ✓ `NIM` (reversed)
- ✓ `NM` (66% match)

#### KALONGWE Matches:
- ✓ `KALONGWE` (exact)
- ✓ `KALONGW` (87% match)
- ✓ `KALONGWI` (1 typo)
- ✓ `KALONG` (75% match)

#### MOSHI/MSA Matches:
- ✓ `MOSHI` (exact)
- ✓ `MSA` (exact)
- ✓ `MOSH` (80% match)
- ✓ `MOSHI TOWN` (contains)

## Calculation Formula

```typescript
// Step 1: Calculate base fuel difference
requiredTotalLiters = getTotalLitersByDestination(returnLoadingPoint)
fuelDifference = max(0, requiredTotalLiters - originalTotalLiters)

// Step 2: Add loading point extras (with fuzzy matching)
loadingPointExtra = getLoadingPointExtraFuel(returnLoadingPoint)
  // Returns 40L for Kamoa, 20L for NMI, 60L for Kalongwe, 0L otherwise

// Step 3: Add destination extras (with fuzzy matching)
destinationExtra = getDestinationExtraFuel(finalDestination)
  // Returns 170L for Moshi/Msa, 0L otherwise

// Step 4: Calculate total additional fuel
additionalFuelNeeded = fuelDifference + loadingPointExtra + destinationExtra

// Step 5: Update fuel record
newTotalLiters = originalTotalLiters + additionalFuelNeeded
newBalance = currentBalance + additionalFuelNeeded
```

## Real-World Scenarios

### Scenario 1: Standard Return with Loading Extra
```
Going: DAR → KOLWEZI (2300L allocated)
Return: KOLWEZI → KAMOA (load) → DAR (offload)

Calculation:
- Required for DAR → KAMOA: 2440L
- Original allocation: 2300L
- Difference: 140L
- Kamoa loading extra: +40L
- Total additional: 180L
- New total: 2480L
```

### Scenario 2: Return to Moshi with NMI Loading
```
Going: MOSHI → LIKASI (2200L allocated)
Return: LIKASI → NMI (load) → MOSHI (offload)

Calculation:
- Required for MOSHI → NMI: 2200L (same)
- Original allocation: 2200L
- Difference: 0L
- NMI loading extra: +20L
- Moshi destination extra: +170L
- Total additional: 190L
- New total: 2390L
```

### Scenario 3: Return from Kalongwe
```
Going: DAR → KOLWEZI (2400L allocated)
Return: KOLWEZI → KALONGWE (load) → DAR (offload)

Calculation:
- Required for DAR → KALONGWE: 2440L
- Original allocation: 2400L
- Difference: 40L
- Kalongwe loading extra: +60L
- Total additional: 100L
- New total: 2500L
```

### Scenario 4: Standard Return (No Extras)
```
Going: DAR → KOLWEZI (2400L allocated)
Return: KOLWEZI → LUBUMBASHI (load) → DAR (offload)

Calculation:
- Required for DAR → LUBUMBASHI: 2100L
- Original allocation: 2400L
- Difference: 0L (already have enough)
- No loading extras
- Total additional: 0L
- New total: 2400L (unchanged)
```

## Implementation Details

### Files Modified:

1. **`frontend/src/services/fuelConfigService.ts`**
   - Added fuzzy matching algorithm (Levenshtein distance)
   - Added `loadingPointExtraFuel` configuration
   - Added `destinationExtraFuel` configuration
   - Added helper methods for location matching

2. **`frontend/src/services/fuelRecordService.ts`**
   - Updated `updateFuelRecordWithReturnDO()` function
   - Implemented complete fuel difference calculation
   - Added detailed logging and return info

3. **`frontend/src/pages/DeliveryOrders.tsx`**
   - Updated to display additional fuel information
   - Shows breakdown of fuel calculation to user

## User Experience

When creating an EXPORT (return) DO, the user sees:

```
Fuel record updated with return DO-6868

📊 Additional Fuel Allocated: 180L
New Total: 2480L (was 2300L)

Breakdown:
Base difference: 140L (2440L needed - 2300L original)
Loading point extra (KAMOA): +40L
```

## Testing

Run the test suite:
```bash
cd frontend
npm test src/tests/fuelDifferenceCalculation.test.ts
```

The test covers:
- Fuzzy location matching for all special locations
- Complete calculation scenarios
- Edge cases (no extras needed, multiple extras combined)

## Configuration

Admin users can modify the extra fuel values in the system configuration:

```typescript
loadingPointExtraFuel: {
  kamoa: 40,      // Adjustable
  nmi: 20,        // Adjustable
  kalongwe: 60,   // Adjustable
}

destinationExtraFuel: {
  moshi: 170,     // Adjustable
}
```

## Benefits

1. **Automatic Calculation**: No manual fuel difference calculation needed
2. **Accurate Tracking**: System tracks exact fuel needed for return journeys
3. **Typo Tolerance**: Fuzzy matching handles spelling variations
4. **Transparent**: Shows detailed breakdown to users
5. **Configurable**: Admin can adjust extra fuel values
6. **Audit Trail**: All calculations logged for tracking

## Future Enhancements

- Add more special locations as needed
- Allow admin UI to configure special locations
- Add distance-based calculation option
- Support for multiple loading points in return journey
