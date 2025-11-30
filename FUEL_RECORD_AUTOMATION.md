# Fuel Record Automation - Implementation Summary

## Overview
The fuel record system has been enhanced to automatically create and update fuel records when Delivery Orders (DOs) are created. The system handles both going (IMPORT) and return (EXPORT) journeys with automatic fuel allocation calculations and LPO generation.

## Key Components Created

### 1. **FuelRecordService** (`/services/fuelRecordService.ts`)
Handles all automatic fuel calculation logic:

- **Truck Batch Categorization**: Automatically determines extra fuel (60L, 80L, or 100L) based on truck suffix
- **Journey Start Detection**: Determines if journey starts in Tanga or Dar
- **Going Journey Calculations**: 
  - Tanga Yard: 100L (if starting from Tanga)
  - Dar Yard: 550L (standard) or 580L (Kisarawe)
  - Dar Going: Variable (if filled at station instead of yard)
  - Mbeya Going: 450L (adjusted if filled at Dar station)
  - Zambia Going: (totalLiters + extra) - 900L
  - Special destinations: Lusaka (60L), Lubumbashi (260L)

- **Return Journey Calculations**:
  - Zambia Return: 400L total (50L @ Lake Ndola + 350L @ Lake Kapiri)
  - Tunduma Return: 100L
  - Mbeya Return: 400L
  - Moro Return: 100L (for Mombasa destinations)
  - Tanga Return: 70L (for Mombasa destinations)

### 2. **FuelConfigService** (`/services/fuelConfigService.ts`)
Manages configurable settings:

- Truck batch configurations
- Standard fuel allocations per checkpoint
- Special destination rules
- Fuel station information with pricing
- Loading point configurations
- Persistent storage via localStorage

### 3. **Enhanced FuelRecordForm** (`/components/FuelRecordForm.tsx`)
Features:
- Auto-calculated field indicators (⚡ icon)
- Lock/Unlock mechanism for manual overrides
- Visual distinction between auto-calculated and manual fields
- Warning banner for auto-calculated records

### 4. **Integrated DO Creation Flow** (`/pages/DeliveryOrders.tsx`)
Automatic workflow:
1. User creates DO with IMPORT or EXPORT type
2. System automatically:
   - Creates new fuel record for IMPORT
   - Updates existing fuel record for EXPORT
   - Generates required LPOs for station purchases
   - Handles special cases (Zambia return = 2 LPOs)

## How It Works

### Creating a Going Journey (IMPORT DO)
```
1. User creates DO with:
   - importOrExport: IMPORT
   - truckNo: T705 DXY
   - destination: Kpm
   - date: 6-Oct

2. System automatically:
   - Determines extra fuel: 100L (batch_100)
   - Journey start: DAR
   - Calculates allocations:
     * Dar Yard: -550L
     * Mbeya Going: -450L
     * Zambia Going: -400L (2200+100-900)
   - Balance: 900L
   
3. Fuel record created automatically
4. No LPOs needed (company fuel from yard)
```

### Creating a Return Journey (EXPORT DO)
```
1. User creates DO with:
   - importOrExport: EXPORT
   - truckNo: T705 DXY (matches existing going record)
   - destination: DAR
   - date: 10-Oct

2. System automatically:
   - Finds matching going record
   - Updates route: from Kpm to DAR
   - Adds return allocations:
     * Zambia Return: -400L
     * Tunduma Return: -100L
     * Mbeya Return: -400L
   - Updates balance
   
3. Generates 2 LPOs:
   - LPO #2360: Lake Ndola, 50L
   - LPO #2361: Lake Kapiri, 350L
```

## Configuration

### Modifying Truck Batches
```typescript
import FuelConfigService from './services/fuelConfigService';

// Add truck to batch
const config = FuelConfigService.loadConfig();
config.truckBatches.batch_100.push('abc');
FuelConfigService.saveConfig(config);
```

### Updating Standard Allocations
```typescript
const config = FuelConfigService.loadConfig();
config.standardAllocations.mbeyaGoing = 500; // Change from 450 to 500
FuelConfigService.saveConfig(config);
```

### Managing Fuel Stations
```typescript
const config = FuelConfigService.loadConfig();
config.fuelStations.push({
  id: 'new_station',
  name: 'NEW STATION',
  location: 'Tanzania',
  pricePerLiter: 1500,
  isActive: true
});
FuelConfigService.saveConfig(config);
```

## Testing with CSV Data

### Example from CSV (Line 1):
```
Date: 6-Oct
Truck: T705 DXY
Going DO: 6395
From: DAR
To: Kpm
Total: 2200
Extra: 100 (batch_100)
Dar Yard: -550
Mbeya Going: -450
Zambia Going: -400
Balance: 900
```

### System Calculation:
```javascript
Extra = 100 (T705 DXY is in batch_100)
Start = DAR
Dar Yard = -550 (standard loading)
Mbeya Going = -450 (standard)
Zambia Going = (2200 + 100) - 900 = -400
Balance = 2200 + 100 - 550 - 450 - 400 = 900 ✓
```

## Special Cases Handled

### 1. Lusaka Destination
```
Zambia Going = 60L (instead of calculated amount)
```

### 2. Lubumbashi Destination
```
Zambia Going = 260L (instead of calculated amount)
```

### 3. Mombasa Destination (Return)
```
Moro Return = 100L
Tanga Return = 70L
```

### 4. Dar Station Fuel (Not Yard)
```
Dar Going = Custom amount (requires LPO)
Mbeya Going = (amount - 550) + 450
```

### 5. Kisarawe Loading
```
Dar Yard = 580L (instead of 550L)
```

## LPO Generation Rules

**Company Fuel (No LPO needed):**
- Tanga Yard
- Dar Yard
- MMSA Yard

**Station Purchases (LPO required):**
- Dar Going (if filled at station)
- Zambia Return (2 LPOs: Lake Ndola + Lake Kapiri)
- Tunduma Return
- Mbeya Return
- Moro Return
- Tanga Return
- Dar Return

## Future Enhancements

1. **Configuration UI**: Create a settings page for managing configurations
2. **Bulk Updates**: Handle bulk DO creation with automatic fuel record generation
3. **Validation**: Add validation rules to prevent incorrect fuel allocations
4. **Reporting**: Generate fuel consumption reports per truck/route
5. **Alerts**: Notify when fuel balance is negative or unusual
6. **Integration**: Connect with actual LPO workbook system for consolidated reporting

## API Integration

The system uses the following APIs:
- `fuelRecordsAPI.create()` - Create new fuel record
- `fuelRecordsAPI.update()` - Update existing fuel record
- `fuelRecordsAPI.getAll()` - Get all records for matching
- `lposAPI.create()` - Create LPO entry
- `lposAPI.getAll()` - Get all LPOs for numbering

## Error Handling

- Missing going record: Warns user but still saves return DO
- Failed fuel record creation: Saves DO but alerts user to create manually
- Failed LPO generation: Logs error but doesn't block DO creation
- Configuration errors: Falls back to default configuration

## Notes

- All fuel allocations in the database are stored as **negative values** (as in the CSV)
- Balance calculation: `totalFuel + allocations` (since allocations are negative)
- Truck matching for return DOs is based on truck number only
- Return DOs find the most recent going record without a return DO
