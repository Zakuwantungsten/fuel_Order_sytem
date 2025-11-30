# Yard Fuel Dispensing Workflow

## Overview
The Yard Fuel Entry system has been redesigned to properly separate responsibilities between office staff (who manage DOs) and yard personnel (who dispense fuel).

## Key Principles

### ❌ What Yard Personnel DON'T Do:
- Create or manage Delivery Orders (DOs)
- Enter DO numbers manually
- Track destinations or routes
- Handle paperwork or documentation

### ✅ What Yard Personnel DO:
- **Search for the truck** that needs fuel
- **Dispense the fuel** from the yard tank
- **Record the amount** dispensed
- Add any relevant notes about the dispensing

## How It Works

### Step 1: Office Staff Creates DO
1. Office staff creates the delivery order in the system
2. System automatically creates a fuel record for the truck
3. Fuel record includes expected yard allocation (e.g., 550L for DAR YARD)

### Step 2: Truck Arrives at Yard
1. Truck arrives at the yard to get fueled
2. Yard personnel opens "Yard Fuel Dispensing" interface
3. They select their yard (DAR YARD, TANGA YARD, etc.)

### Step 3: Search for Truck
```
Yard Personnel Actions:
1. Type truck number (e.g., "T699 DXY")
2. Click Search button
3. System shows:
   - ✅ Truck has active DO #6038
   - Destination: Kpm
   - "Will auto-link to fuel record"
```

### Step 4: Dispense & Record Fuel
```
1. Yard personnel fills the truck tank
2. Enters exact amount dispensed (e.g., 550 liters)
3. Adds optional notes if needed
4. Clicks "Record Fuel Dispensing"
5. System automatically:
   - Links to the fuel record
   - Updates darYard field: -550L
   - Recalculates balance
   - Shows confirmation: "✓ Linked to DO #6038"
```

## Auto-Linking Logic

### When Truck Has Active DO:
```json
{
  "status": "linked",
  "autoLinked": true,
  "linkedDONumber": "6038",
  "linkedFuelRecordId": 123,
  "displayColor": "green"
}
```

### When Truck Has No DO Yet:
```json
{
  "status": "pending",
  "autoLinked": false,
  "displayColor": "yellow",
  "note": "Will link when DO is created"
}
```

## Visual Indicators

### 🟢 Green Badge = Auto-Linked
- Truck has active DO
- Fuel entry successfully linked
- Fuel record updated automatically

### 🟡 Yellow Badge = Pending
- No active DO found yet
- Entry saved and waiting
- Will auto-link when DO is created

## Real-World Example

### Scenario: T705 DXY needs fuel at DAR YARD

**Old Way (❌ Incorrect):**
```
Yard Person: "What's the DO number?"
Truck Driver: "I don't know, I just need fuel"
Yard Person: "I can't enter it without the DO number"
Result: Delays, confusion, manual tracking
```

**New Way (✅ Correct):**
```
1. Yard Person: Types "T705 DXY" and searches
2. System: "✓ Found! DO #6395 → Destination: Lusaka"
3. Yard Person: Dispenses 550 liters, clicks save
4. System: "✓ Fuel recorded and linked to DO #6395"
5. Fuel Record automatically updated:
   - darYard: -550L
   - balance recalculated
Result: Fast, accurate, no manual lookup needed
```

## Data Flow

```
DO Creation (Office)
    ↓
Fuel Record Created
    ↓
Truck Arrives at Yard
    ↓
Yard Search by Truck Number
    ↓
System Finds Active Fuel Record
    ↓
Yard Dispenses & Records Fuel
    ↓
Auto-Link to Fuel Record
    ↓
Update Yard Allocation Field
    ↓
Recalculate Balance
```

## Benefits

### For Yard Personnel:
- ✅ Simple search by truck number
- ✅ No need to know DO numbers
- ✅ Focus on actual work: dispensing fuel
- ✅ Instant feedback on linking status

### For Office Staff:
- ✅ All DO management in one place
- ✅ Automatic fuel record creation
- ✅ Accurate tracking from creation to dispensing

### For the System:
- ✅ Single source of truth
- ✅ Automatic data linking
- ✅ Reduced manual errors
- ✅ Complete audit trail

## Technical Implementation

### New Types
```typescript
interface YardFuelDispense {
  truckNo: string;
  liters: number;
  yard: 'DAR YARD' | 'TANGA YARD' | 'MMSA YARD' | 'MBEYA YARD';
  linkedFuelRecordId?: number;
  linkedDONumber?: string;
  autoLinked?: boolean;
  status: 'pending' | 'linked' | 'manual';
}
```

### New Service: `yardFuelService.ts`
- `searchTruckInfo(truckNo)` - Find active fuel records
- `dispenseYardFuel(dispense)` - Record fuel and auto-link
- `updateFuelRecordYardAllocation()` - Update fuel record
- `getYardStats()` - Get daily statistics

### Updated Component: `YardFuelEntry.tsx`
- Truck search interface
- Visual linking status
- Auto-complete from search
- Color-coded entries (green=linked, yellow=pending)

## Statistics Dashboard

Yard personnel can see:
- **Entries Today**: Total number of trucks fueled
- **Total Liters**: Sum of all fuel dispensed
- **Auto-Linked**: Number successfully linked to DOs
- **Average/Truck**: Average fuel per truck

## Future Enhancements

1. **Barcode Scanner Integration**: Scan truck registration
2. **Fuel Level Sensors**: Auto-detect dispensed amount
3. **Mobile App**: Tablet/phone interface for yard personnel
4. **Real-time Notifications**: Alert when truck arrives with pending DO
5. **Historical Lookup**: Quick access to previous fuel records

## Migration Notes

### Existing Data
- Old yard entries without auto-linking will remain as "manual" status
- New entries will use the auto-linking system
- No data loss during transition

### Training Required
- 15-minute orientation for yard personnel
- Focus: "Search truck → Enter amount → Click save"
- Emphasize: System handles DO linking automatically

## Support

If you see:
- 🟢 Green = Everything working correctly
- 🟡 Yellow = Normal - waiting for DO creation
- ⚠️ Red = Error - contact system admin
