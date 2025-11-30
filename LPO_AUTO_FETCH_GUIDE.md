# LPO Auto-Fetch and Intelligent DO Selection

## Overview

This system automatically determines the correct Delivery Order (DO) - whether going or returning - when creating an LPO, based on the truck number and station. It also auto-fills fuel amounts and rates based on predefined configurations.

## Key Features

### 1. **Intelligent DO Detection**
The system analyzes:
- Truck number
- Selected station
- Existing fuel records
- Station type (going/returning/both)

### 2. **Smart Decision Logic**

#### For Stations Serving BOTH Directions (e.g., Zambia Going Stations)
The system checks:
1. **Has the truck already taken fuel at this station on the going journey?**
   - If YES → Use RETURNING DO
   - If NO → Use GOING DO

2. **Is the station below Zambia Going checkpoints?** (e.g., Mbeya, Tunduma)
   - Always use GOING DO

3. **Does truck have both going and returning DOs?**
   - Analyze fuel records to determine which journey

#### For Direction-Specific Stations
- **LAKE NDOLA, LAKE KAPIRI** → Always RETURNING DO
- **MBEYA STATION** → Always GOING DO
- **TUNDUMA STATION** → Always RETURNING DO

### 3. **Auto-Fill Fuel Amounts**

The system provides default fuel amounts based on:

| Station | Going DO | Returning DO |
|---------|----------|--------------|
| LAKE CHILABOMBWE | Calculated: (totalLiters + extra) - 900 | 0 |
| LAKE NDOLA | - | 50 liters |
| LAKE KAPIRI | - | 350 liters |
| CASH/TCC/ZHANFEI/KAMOA/COMIKA | 260 liters (default) | 0 |
| MBEYA STATION | 450 liters | - |
| TUNDUMA STATION | - | 100 liters |

**Special Destinations:**
- **Lusaka** → 60 liters at Zambia Going
- **Lubumbashi** → 260 liters at Zambia Going

### 4. **Automatic Fuel Deduction**

When an LPO is created, the system:
1. Identifies the correct fuel record for the DO
2. Deducts fuel from the appropriate checkpoint field
3. Updates the fuel record with negative values (as per system convention)

## Station-Checkpoint Mapping

```typescript
Station → Checkpoint Field in Fuel Record
--------------------------------------------
LAKE CHILABOMBWE → zambiaGoing (both directions)
LAKE NDOLA → zambiaReturn
LAKE KAPIRI → zambiaReturn
CASH → zambiaGoing (both directions)
TCC → zambiaGoing (both directions)
ZHANFEI → zambiaGoing (both directions)
KAMOA → zambiaGoing (both directions)
COMIKA → zambiaGoing (both directions)
MBEYA STATION → mbeyaGoing
TUNDUMA STATION → tundumaReturn
```

## User Interface

### Auto-Fill Banner
Shows confidence level and reasoning:
- 🟢 **High Confidence**: Station is direction-specific or clear fuel record evidence
- 🟡 **Medium Confidence**: Only one DO type available
- 🟠 **Low Confidence**: Unknown station or ambiguous data

### Manual Override
- **"Manual Entry Mode"** checkbox allows users to bypass auto-fill
- **"Use Custom"** button appears when auto-fill is active
- All fields remain editable even with auto-fill active

## Implementation Details

### Services

#### `lpoAutoFetchService.ts`
Main service handling:
- `findCorrectDOForTruck()` - Determines which DO to use
- `getStationFuelDefaults()` - Provides default fuel amounts
- `getAutoFillDataForLPO()` - Combines DO selection and defaults
- `deductFuelFromRecord()` - Updates fuel records after LPO creation

#### `fuelConfigService.ts`
Extended with:
- Complete station list with prices
- Station-to-checkpoint mappings
- Configurable fuel rates

### Components

#### `LPOForm.tsx`
Enhanced with:
- Real-time auto-fetch when truck and station are selected
- Visual feedback banner showing confidence and reasoning
- Manual mode toggle
- Loading indicator during fetch

### API Integration

#### `api.ts` - LPO Creation Flow
```typescript
1. Create LPO Entry
2. Call deductFuelFromRecord()
3. Update corresponding fuel record
4. Return created LPO
```

## Usage Example

### Scenario 1: Going Journey at Zambia
1. User enters: **Truck "T530 DRF"** + **Station "LAKE CHILABOMBWE"**
2. System checks: No zambiaGoing fuel record exists
3. Result: Auto-fills **Going DO 6376**, **260 liters**, **Rate 1450**
4. On submit: Deducts 260L from `zambiaGoing` field in fuel record

### Scenario 2: Returning Journey at Zambia
1. User enters: **Truck "T530 DRF"** + **Station "LAKE CHILABOMBWE"**
2. System checks: zambiaGoing already has -260 (fuel taken)
3. Result: Auto-fills **Returning DO 6377**, **0 liters** (not standard)
4. User can override to custom amount if needed

### Scenario 3: Return at LAKE NDOLA
1. User enters: **Truck "T148 EGJ"** + **Station "LAKE NDOLA"**
2. System knows: LAKE NDOLA is returning-only
3. Result: Auto-fills **Returning DO 6531**, **50 liters**, **Rate 1450**
4. On submit: Deducts 50L from `zambiaReturn` field

### Scenario 4: Special Destination (Lusaka)
1. User enters: **Truck "T546 EKT"** + **Station "CASH"**
2. System checks: DO destination is "Lusaka"
3. Result: Auto-fills **Going DO 6415**, **60 liters** (special), **Rate 1450**

## Configuration

All defaults are configurable via `fuelConfigService.ts`:

```typescript
// Update station rates
FuelConfigService.updateStation({
  id: 'lake_ndola',
  name: 'LAKE NDOLA',
  pricePerLiter: 1500, // Changed from 1450
  isActive: true
});

// Update standard allocations
FuelConfigService.saveConfig({
  standardAllocations: {
    ...currentAllocations,
    mbeyaGoing: 500 // Changed from 450
  }
});
```

## Error Handling

The system gracefully handles:
- Missing DOs for truck
- Unknown stations
- Missing fuel records
- API errors during auto-fetch

**Fallback Behavior:**
- Shows lower confidence warning
- Allows manual entry
- LPO creation doesn't fail if fuel deduction fails

## Benefits

1. ✅ **Reduces Manual Errors** - Automatic DO selection eliminates wrong DO selection
2. ✅ **Saves Time** - No need to lookup DOs manually
3. ✅ **Intelligent Logic** - Handles complex scenarios (mixed going/returning)
4. ✅ **Flexibility** - Manual override always available
5. ✅ **Transparency** - Shows reasoning for each decision
6. ✅ **Automatic Tracking** - Fuel deductions update records instantly

## Future Enhancements

- [ ] Support for multiple active DOs per truck
- [ ] Historical LPO analysis for better predictions
- [ ] Station-specific custom rules
- [ ] Bulk LPO creation with auto-fetch
- [ ] Admin interface for configuration management
