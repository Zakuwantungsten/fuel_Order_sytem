# Admin Configuration & Notification System Implementation

## ✅ COMPLETED

### 1. Backend Changes

#### FuelRecord Model (`backend/src/models/FuelRecord.ts`)
- ✅ Made `totalLts` optional (nullable) for unlisted routes
- ✅ Made `extra` optional (nullable) for unlisted truck suffixes  
- ✅ Added `isLocked: Boolean` flag
- ✅ Added `pendingConfigReason` enum field ('missing_total_liters', 'missing_extra_fuel', 'both')

#### Notification System (`backend/src/models/Notification.ts`)
- ✅ Created Notification model with:
  - Types: missing_total_liters, missing_extra_fuel, both, info, warning, error
  - Status: pending, resolved, dismissed
  - Related model references (FuelRecord ID, DO Number, etc.)
  - Recipients array (admin, super_admin)
  - Metadata for fuel record details

#### Notification Controller (`backend/src/controllers/notificationController.ts`)
- ✅ `getNotifications()` - fetch user's notifications
- ✅ `getNotificationCount()` - badge count for unread
- ✅ `markAsRead()` - mark individual notification as read
- ✅ `dismissNotification()` - dismiss notification
- ✅ `resolveNotification()` - resolve (admin only)
- ✅ `createMissingConfigNotification()` - auto-create on fuel record creation
- ✅ `autoResolveNotifications()` - auto-resolve when fuel record unlocked

#### Notification Routes (`backend/src/routes/notificationRoutes.ts`)
- ✅ GET `/api/notifications` - get all
- ✅ GET `/api/notifications/count` - get count
- ✅ PATCH `/api/notifications/:id/read` - mark read
- ✅ PATCH `/api/notifications/:id/dismiss` - dismiss
- ✅ PATCH `/api/notifications/:id/resolve` - resolve (admin)
- ✅ Registered in main routes (`backend/src/routes/index.ts`)

#### Fuel Record Controller Updates (`backend/src/controllers/fuelRecordController.ts`)
- ✅ On create: Check if locked → create notification
- ✅ On update: Check if unlocking → auto-resolve notifications
- ✅ Auto-calculate balance when both totalLts and extra filled
- ✅ Import notification controller functions

### 2. Frontend Changes

#### Fuel Record Service (`frontend/src/services/fuelRecordService.ts`)
- ✅ Updated `createFuelRecordFromDO()` signature to accept `totalLiters: number | null` and `extraFuel: number | null`
- ✅ Returns `{ fuelRecord, lposToGenerate, isLocked, missingFields }`
- ✅ Sets `isLocked` and `pendingConfigReason` based on missing values
- ✅ Balance set to 0 if configuration incomplete

#### Delivery Orders Page (`frontend/src/pages/DeliveryOrders.tsx`)
- ✅ REMOVED all prompts for unlisted routes/trucks
- ✅ Creates fuel records with null values when configuration missing
- ✅ Shows single info alert explaining record will be locked
- ✅ Passes null values to service function
- ✅ Logs locked status and missing fields

#### Notification Bell Component (`frontend/src/components/NotificationBell.tsx`)
- ✅ Bell icon with badge counter
- ✅ Dropdown showing pending notifications
- ✅ Auto-refresh every 30 seconds
- ✅ Click notification to handle
- ✅ Dismiss functionality
- ✅ Shows metadata (DO number, truck, destination, suffix)
- ✅ Visual indicators for notification types

## 🚧 TODO - REMAINING WORK

### 3. Frontend Integration

#### Add Notification Bell to Layout
**File:** `frontend/src/components/layout/Header.tsx` (or main layout)
```tsx
import NotificationBell from '../NotificationBell';

// In header, near user menu:
<NotificationBell onNotificationClick={handleNotificationClick} />
```

#### Create Admin Configuration Resolution Page
**New File:** `frontend/src/pages/PendingConfigurations.tsx`
- List all locked fuel records
- Show missing fields for each
- Inline editors for totalLiters and extraFuel
- Save button → updates fuel record → auto-unlocks → resolves notification
- Visual feedback (locked icon, unlock animation)

**Integration in AdminDashboard:**
```tsx
// Add tab
{ id: 'pending', label: 'Pending Config', icon: Lock, badge: pendingCount }

// In tab content:
{activeTab === 'pending' && <PendingConfigurations />}
```

#### Update LPO Creation Validation
**File:** `frontend/src/services/lpoService.ts` or LPO creation components
- Check if `fuelRecord.isLocked === true`
- Show error: "Cannot create LPO - Fuel record locked. Reason: [pendingConfigReason]"
- Provide link to admin dashboard to resolve

#### Copy Configuration UI from Super Admin
**Files to Copy:**
- `frontend/src/components/SuperAdmin/ConfigurationTab.tsx` → `frontend/src/components/Admin/ConfigurationTab.tsx`

**Modifications Needed:**
1. Use admin API endpoints instead of super admin endpoints
2. Remove any super-admin-only features
3. Integrate into AdminDashboard as a tab

**Ensure These Work:**
- Add/Edit/Delete Fuel Stations
- Add/Edit/Delete Routes (destinations + total liters)
- Add/Edit/Delete Standard Allocations
- All changes sync to backend immediately
- Route changes reflected in fuel record creation

### 4. Testing Checklist

#### Test Flow 1: Unlisted Route
1. [ ] Import DO with destination not in config (e.g., "NEWTOWN")
2. [ ] Verify: No prompts shown
3. [ ] Verify: Fuel record created with `totalLts: null`, `isLocked: true`
4. [ ] Verify: Alert shows "Missing Configuration" message
5. [ ] Verify: Admin gets notification in bell icon
6. [ ] Admin clicks notification → opens fuel record
7. [ ] Admin sets totalLiters → saves
8. [ ] Verify: Fuel record unlocked automatically
9. [ ] Verify: Notification auto-resolved
10. [ ] Fuel order maker can now create LPOs

#### Test Flow 2: Unlisted Truck Suffix
1. [ ] Import DO with truck "T999 ZZZ" (suffix not in batches)
2. [ ] Verify: No prompts shown
3. [ ] Verify: Fuel record created with `extra: null`, `isLocked: true`
4. [ ] Verify: Admin notification created
5. [ ] Admin assigns "ZZZ" to batch (80L)
6. [ ] Admin opens fuel record, sets `extra: 80`
7. [ ] Verify: Auto-unlocks and resolves notification

#### Test Flow 3: Both Missing
1. [ ] Import DO with unlisted route AND unlisted truck
2. [ ] Verify: Fuel record created with both null
3. [ ] Verify: `pendingConfigReason: 'both'`
4. [ ] Verify: Single notification created
5. [ ] Admin fixes totalLiters only → still locked
6. [ ] Admin fixes extra → auto-unlocks
7. [ ] Verify: Notification resolved

#### Test Flow 4: LPO Blocking
1. [ ] Try to create LPO for locked fuel record
2. [ ] Verify: Error message shown
3. [ ] Verify: Cannot proceed with LPO creation

#### Test Flow 5: Configuration Management
1. [ ] Admin adds new route "KOLWEZI" → 2400L
2. [ ] Import DO with destination "KOLWEZI"
3. [ ] Verify: Matches route, uses 2400L
4. [ ] Verify: No notification, not locked
5. [ ] Admin adds truck suffix "ABC" to batch_100
6. [ ] Import DO with truck "T111 ABC"
7. [ ] Verify: Uses 100L extra, not locked

## 📋 Quick Implementation Guide

### Step 1: Add Bell to Header (5 minutes)
```bash
# Find your main layout/header component
# Import NotificationBell
# Add <NotificationBell onNotificationClick={navigateToFuelRecord} />
```

### Step 2: Create Pending Config Page (30 minutes)
```typescript
// Fetch locked fuel records
const lockedRecords = await fuelRecordsAPI.getAll({ filter: { isLocked: true } });

// Show table with:
// - DO Number
// - Truck
// - Destination  
// - Missing Fields
// - Input fields for missing values
// - Save button

// On save:
await fuelRecordsAPI.update(recordId, { totalLts, extra });
// Backend auto-unlocks and resolves notification
```

### Step 3: Block LPO Creation (10 minutes)
```typescript
// In LPO creation handler:
if (fuelRecord.isLocked) {
  alert(`Cannot create LPO - Fuel record is locked.\n\nReason: ${fuelRecord.pendingConfigReason}\n\nPlease contact admin to configure missing values.`);
  return;
}
```

### Step 4: Copy Configuration UI (20 minutes)
```bash
# Copy SuperAdmin/ConfigurationTab.tsx to Admin folder
# Update API calls to use admin endpoints
# Add as tab in AdminDashboard
```

## 🎯 Priority Order

1. **HIGH:** Add NotificationBell to header (users need to see notifications)
2. **HIGH:** Create PendingConfigurations page (admins need to resolve)
3. **HIGH:** Block LPO creation for locked records (prevent errors)
4. **MEDIUM:** Copy configuration UI to admin (improve UX)
5. **LOW:** Polish notifications (better formatting, filters, search)

## 💡 Key Points

- Fuel records are ALWAYS created (never fail due to missing config)
- Locked records cannot have LPOs created
- Notifications persist until admin resolves (or dismisses)
- Auto-unlock happens when both totalLts AND extra are filled
- Balance recalculates automatically on unlock
- Configuration changes (routes/trucks) take effect immediately

## 🔗 Related Files

### Backend
- `models/FuelRecord.ts` - Schema with isLocked
- `models/Notification.ts` - Notification schema
- `controllers/notificationController.ts` - Notification logic
- `controllers/fuelRecordController.ts` - Create/update with notifications
- `routes/notificationRoutes.ts` - API endpoints

### Frontend
- `services/fuelRecordService.ts` - Create with null values
- `pages/DeliveryOrders.tsx` - Remove prompts
- `components/NotificationBell.tsx` - Bell UI
- `components/SuperAdmin/ConfigurationTab.tsx` - Copy to Admin

## 🚀 Next Steps

1. Add NotificationBell to your header/nav component
2. Create PendingConfigurations.tsx page
3. Test the complete flow
4. Copy configuration UI
5. Deploy and monitor

---

**Status:** Backend complete ✅ | Frontend UI partial ⏳ | Testing pending ⏰
