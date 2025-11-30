# Quick Test Guide - Fuel Record Fix

## How to Test the Fix

### 1. Start the Application

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 2. Create Test Delivery Orders

#### Test 1: Kolwezi Destination (Should be 2400L)
1. Navigate to Delivery Orders page
2. Click "New DO" or "Bulk DO"
3. Create DO with:
   - Truck: T699 DXY (or any truck)
   - Destination: **KOLWEZI**
   - Import/Export: **IMPORT**
   - Date: Today's date
4. Save the DO
5. Check console logs for fuel record creation
6. Navigate to Fuel Records page
7. Find the newly created record

**Expected Results**:
- ✅ totalLts = **2400**
- ✅ extra = 100 (for DXY truck)
- ✅ balance = **2500** (2400 + 100)
- ✅ ALL checkpoint fields = 0:
  - tangaYard: 0
  - darYard: 0
  - darGoing: 0
  - mbeyaGoing: 0
  - zambiaGoing: 0
  - congoFuel: 0
  - zambiaReturn: 0
  - tundumaReturn: 0
  - mbeyaReturn: 0
  - moroReturn: 0
  - darReturn: 0
  - tangaReturn: 0

#### Test 2: Lubumbashi Destination (Should be 2100L)
1. Create another DO with:
   - Truck: T132 EFP
   - Destination: **LUBUMBASHI**
   - Import/Export: **IMPORT**
2. Save and check fuel record

**Expected Results**:
- ✅ totalLts = **2100**
- ✅ extra = 60 (for EFP truck)
- ✅ balance = **2160** (2100 + 60)
- ✅ ALL checkpoints = 0

#### Test 3: Likasi Destination (Should be 2200L)
1. Create DO with:
   - Destination: **LIKASI**
   - Import/Export: **IMPORT**

**Expected Results**:
- ✅ totalLts = **2200**
- ✅ balance = 2200 + extra
- ✅ ALL checkpoints = 0

#### Test 4: Unknown Destination (Should default to 2200L)
1. Create DO with:
   - Destination: **SOME_RANDOM_PLACE**
   - Import/Export: **IMPORT**

**Expected Results**:
- ✅ totalLts = **2200** (default)
- ✅ balance = 2200 + extra
- ✅ ALL checkpoints = 0

### 3. Check Console Logs

When creating a DO, you should see logs like:

```
→ Generating fuel record for DO: 6789
→ Destination: KOLWEZI, Total Liters: 2400
→ Loading point: DAR_YARD
→ Fuel record to create: {
    "date": "29-Nov",
    "month": "November",
    "truckNo": "T699 DXY",
    "goingDo": "6789",
    "totalLts": 2400,
    "extra": 100,
    "tangaYard": 0,
    "darYard": 0,
    ...all checkpoints 0...
    "balance": 2500
  }
✓ Created fuel record with ID: xxx
✓ Fuel record created with empty checkpoints (ready for fuel orders)
✓✓ Fuel record created successfully for DO-6789
```

### 4. Verify in Fuel Records Page

1. Navigate to Fuel Records page
2. Find your test records
3. Check each field matches expected values
4. Verify all checkpoint columns show 0 or empty
5. Verify balance = totalLts + extra

## What Was Fixed

### Before Fix ❌
- Total liters: Hardcoded 2200L for all destinations
- Checkpoints: Pre-filled with calculated values
- Balance: Calculated after deducting pre-filled checkpoints
- Kolwezi: Got 2200L instead of 2400L

### After Fix ✅
- Total liters: Based on destination (Kolwezi = 2400L, Lubumbashi = 2100L, etc.)
- Checkpoints: All start at 0
- Balance: Equals totalLts + extra (full allocation)
- Kolwezi: Gets correct 2400L allocation

## Destination → Total Liters Mapping

| Destination | Total Liters |
|------------|--------------|
| LUBUMBASHI | 2100 |
| LIKASI | 2200 |
| KAMBOVE | 2220 |
| FUNGURUME | 2300 |
| KINSANFU | 2360 |
| LAMIKAL | 2360 |
| KOLWEZI | **2400** |
| KAMOA | 2440 |
| KALONGWE | 2440 |
| LUSAKA | 1900 |
| *Others* | 2200 (default) |

## Truck → Extra Fuel Mapping

| Truck Batch | Extra Liters | Trucks |
|-------------|--------------|--------|
| Batch 100 | 100 | dnh, dny, dpn, dre, drf, dnw, dxy, eaf, dtb |
| Batch 80 | 80 | dvk, dvl, dwk |
| Batch 60 | 60 | dyy, dzy, eag, ecq, edd, egj, ehj, ehe, ely, elv, eeq, eng, efp, efn, ekt, eks |

## Troubleshooting

### Issue: Checkpoints still showing values
- **Check**: Make sure you're creating a NEW DO, not viewing an old one
- **Solution**: Clear old test data or filter by date

### Issue: Wrong total liters
- **Check**: Verify destination name matches the mapping
- **Solution**: Destinations are case-insensitive and support partial matching

### Issue: Can't see fuel record
- **Check**: Only IMPORT DOs create fuel records, not EXPORT
- **Solution**: Make sure Import/Export is set to "IMPORT"

### Issue: No console logs
- **Check**: Open browser DevTools (F12)
- **Solution**: Refresh page and check Console tab

## Next Steps

After this fix, the workflow is:
1. ✅ Create DO → Creates fuel record with empty checkpoints
2. 🔄 Create LPO → Updates specific checkpoint in fuel record
3. 🔄 Repeat for each fuel order along the journey
4. ✅ Balance automatically updated as checkpoints are filled

The LPO creation workflow will handle updating the checkpoint values and recalculating the balance.
