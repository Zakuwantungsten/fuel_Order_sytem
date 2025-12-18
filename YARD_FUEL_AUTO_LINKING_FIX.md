# Yard Fuel Auto-Linking Bug Fix - December 18, 2025

## Issue Summary

Yard fuel entries were incorrectly showing as "pending linking" even when active delivery orders (DOs) existed for the trucks. This occurred because the auto-linking query was finding cancelled DOs instead of active ones.

## Root Cause

The `FuelRecord.findOne()` query in `yardFuelController.ts` was missing the `isCancelled: false` filter, causing the system to match yard fuel entries with cancelled fuel records instead of active ones.

### Affected Trucks (Example)
- **T150 DZY**: 44L at DAR YARD - had active DO but showed as pending
- **T203 EHE**: 550L at DAR YARD - had active DO but showed as pending

## Changes Implemented

### 1. Backend Controller Fixes

**File:** `backend/src/controllers/yardFuelController.ts`

#### Change 1: Auto-linking during creation (Lines 150-157)
```typescript
// BEFORE
const fuelRecord = await FuelRecord.findOne({
  truckNo: { $regex: new RegExp(`^${truckNo}$`, 'i') },
  date: { $gte: searchDateStart, $lte: searchDateEnd },
  isDeleted: false,
}).sort({ date: -1 });

// AFTER
const fuelRecord = await FuelRecord.findOne({
  truckNo: { $regex: new RegExp(`^${truckNo}$`, 'i') },
  date: { $gte: searchDateStart, $lte: searchDateEnd },
  isDeleted: false,
  isCancelled: false,  // ✅ ADDED
}).sort({ date: -1 });
```

#### Change 2: Manual linking validation (Lines 590-610)
```typescript
// ADDED: Validate fuel record before linking
const fuelRecord = await FuelRecord.findOne({
  _id: fuelRecordId,
  isDeleted: false,
  isCancelled: false,  // ✅ ADDED
});

if (!fuelRecord) {
  throw new ApiError(400, 'Fuel record not found or is cancelled');
}
```

#### Change 3: Enhanced logging (Lines 195-210)
```typescript
// ADDED: Diagnostic logging for cancelled records
const cancelledRecordCount = await FuelRecord.countDocuments({
  truckNo: { $regex: new RegExp(`^${truckNo}$`, 'i') },
  date: { $gte: searchDateStart, $lte: searchDateEnd },
  isDeleted: false,
  isCancelled: true,
});

if (cancelledRecordCount > 0) {
  logger.info(
    `No active fuel record found for ${truckNo}, but ${cancelledRecordCount} cancelled record(s) exist.`
  );
}
```

### 2. Database Index Optimization

**File:** `backend/src/models/FuelRecord.ts`

```typescript
// ADDED: Compound index for optimized yard fuel queries
fuelRecordSchema.index({ 
  truckNo: 1, 
  date: -1, 
  isDeleted: 1, 
  isCancelled: 1 
});
```

**Impact:** Significantly improves query performance for auto-linking operations.

### 3. Migration Script

**File:** `backend/src/scripts/relink-pending-yard-fuel.ts`

**Purpose:** Re-process existing pending yard fuel entries to link them with active DOs.

**Usage:**
```bash
cd backend
npm run relink-yard-fuel
```

**Features:**
- ✅ Finds all pending yard fuel entries
- ✅ Attempts to link with active (non-cancelled) fuel records
- ✅ Updates fuel record yard allocations
- ✅ Provides detailed summary and statistics
- ✅ Logs successful links, remaining pending, and errors

**Example Output:**
```
========================================
MIGRATION SUMMARY
========================================
Total Pending Entries:     15
Successfully Linked:       12
Remaining Pending:         3
Errors:                    0
========================================

✅ SUCCESSFULLY LINKED:
  - T150 DZY (44L at DAR YARD) → DO 2024-001
  - T203 EHE (550L at DAR YARD) → DO 2024-002
  ...

⚠️ STILL PENDING:
  - T999 XYZ (100L at DAR YARD) - No matching fuel record found
  ...
```

### 4. Admin Dashboard Widget

**File:** `frontend/src/components/YardFuelAlertWidget.tsx`

**Features:**
- 🚨 Real-time monitoring of pending yard fuel entries
- ⏰ Tracks how long entries have been pending (24h, 48h+ alerts)
- 📊 Shows total pending entries and liters
- 🎨 Color-coded severity (yellow → orange → red)
- 🔄 Auto-refreshes every 5 minutes
- 👆 Click to view detailed pending entries

**Integration:**
```tsx
import YardFuelAlertWidget from './components/YardFuelAlertWidget';

<YardFuelAlertWidget onViewDetails={handleOpenPendingModal} />
```

### 5. Comprehensive Testing

**File:** `backend/src/__tests__/integration/yardFuelCancelledRecords.test.ts`

**Test Cases:**
1. ✅ Links to active DO and ignores cancelled DO
2. ✅ Remains pending when only cancelled DO exists
3. ✅ Links to active DO even when cancelled DO has more recent date
4. ✅ Rejects manual linking to cancelled fuel record
5. ✅ Successfully links to active fuel record manually

**Run Tests:**
```bash
cd backend
npm test -- yardFuelCancelledRecords
```

## Deployment Steps

### 1. Apply Code Changes
```bash
# Pull latest changes
git pull origin main

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Run Migration Script
```bash
cd backend
npm run relink-yard-fuel
```

This will:
- Reprocess all existing pending yard fuel entries
- Link them to active DOs where possible
- Generate a detailed report

### 3. Restart Services
```bash
# Backend
cd backend
npm run build
pm2 restart fuel-order-backend

# Frontend
cd ../frontend
npm run build
# Deploy frontend build
```

### 4. Verify Fixes
1. Check migration script output for successfully linked entries
2. Log in as `dar_yard` user
3. Enter test yard fuel entry for truck with active DO
4. Verify it auto-links successfully
5. Check notification system shows correct status

## Testing Checklist

- [ ] Run backend unit/integration tests
- [ ] Run migration script and verify output
- [ ] Test yard fuel entry for truck with active DO → should auto-link
- [ ] Test yard fuel entry for truck with only cancelled DO → should remain pending
- [ ] Test manual linking with cancelled record → should reject
- [ ] Test manual linking with active record → should succeed
- [ ] Verify existing T150 DZY and T203 EHE entries are now linked
- [ ] Check notification system shows correct messages
- [ ] Verify yard allocations updated correctly in fuel records
- [ ] Test admin dashboard widget displays pending entries

## Rollback Plan

If issues occur:

```bash
# Backend rollback
git checkout <previous-commit-hash>
cd backend
npm install
npm run build
pm2 restart fuel-order-backend

# Frontend rollback
cd ../frontend
git checkout <previous-commit-hash>
npm install
npm run build
```

## Performance Impact

- ✅ **Positive:** Added database index improves query speed
- ✅ **Neutral:** Additional `isCancelled` filter adds minimal overhead
- ✅ **Positive:** Reduced false notifications
- ✅ **Positive:** Fewer manual interventions needed

## Monitoring

### Key Metrics to Watch
1. **Pending Yard Fuel Count**: Should decrease significantly
2. **Auto-link Success Rate**: Should approach 95%+
3. **False Notifications**: Should drop to near zero
4. **Query Performance**: Monitor via logs

### Log Messages to Monitor
```
✅ "Fuel record auto-updated: [DO] [field] += [liters]L"
⚠️ "No active fuel record found for [truck], but [n] cancelled record(s) exist"
❌ "Failed to auto-link fuel record"
```

## Future Enhancements

1. **Auto-retry Failed Links**: Periodic background job to retry pending entries
2. **Smart Notifications**: Only notify after 24 hours of pending status
3. **Bulk Linking Interface**: UI for fuel order makers to link multiple pending entries
4. **Analytics Dashboard**: Track auto-link success rates and trends
5. **Cancelled Record Warning**: Alert when trying to manually use cancelled DO

## Support

For issues or questions:
- Check logs in `backend/logs/`
- Review migration script output
- Contact: System Administrator

## Related Documentation

- [Yard Fuel System Documentation](./YARD_FUEL_SYSTEM.md)
- [Fuel Record Management](./FUEL_RECORD_MANAGEMENT.md)
- [Cancellation System](./CANCELLATION_SYSTEM.md)
