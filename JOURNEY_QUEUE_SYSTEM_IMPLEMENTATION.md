# Journey Queue System Implementation

**Implemented:** January 11, 2026  
**Feature:** Multi-Booking Journey Queue Management for Trucks

---

## Overview

The Journey Queue System allows trucks to have multiple bookings (journeys) in a queue. When a truck is on an active journey but receives a new booking for a future assignment, the new journey is automatically queued instead of being rejected. When the active journey completes, the next queued journey is automatically activated.

---

## Key Features

### ✅ Journey States
- **Active**: Currently ongoing journey (fuel allocation in progress)
- **Queued**: Pre-booked journey waiting for current journey to complete
- **Completed**: Journey finished (balance = 0, return checkpoint filled)
- **Cancelled**: Journey was cancelled

### ✅ Automatic Queue Management
- Truck can have **1 active journey** + **multiple queued journeys**
- Queued journeys are ordered by `queueOrder` (1, 2, 3, ...)
- When active journey completes → Next queued journey auto-activates
- Remaining queued journeys are reordered automatically

### ✅ Journey Completion Detection
- **Criteria for completion:**
  - `balance === 0` (all fuel allocated)
  - Return checkpoint filled:
    - Non-MSA destinations: `mbeyaReturn !== 0`
    - MSA/Mombasa destinations: `tangaReturn !== 0`

### ✅ User Experience
- **Creating new DO with active journey:**
  - Shows confirmation: "Truck has active journey. Queue this journey?"
  - User can accept (queued) or cancel
  - Queue position displayed (e.g., "Position #2")
  
- **LPO Form:**
  - Shows journey status badge (🚛 ACTIVE, ⏳ QUEUED #1, ✓ COMPLETED)
  - Displays queue count: "ACTIVE Journey | 2 queued"
  
- **Fuel Records List:**
  - Journey status badges in mobile card view
  - Visual indicators for each state

---

## Database Schema Changes

### FuelRecord Model - New Fields

```typescript
{
  // Journey status and queue management
  journeyStatus: 'queued' | 'active' | 'completed' | 'cancelled'  // Default: 'active'
  queueOrder?: number                 // Position in queue (1, 2, 3...)
  activatedAt?: Date                  // When journey became active
  completedAt?: Date                  // When journey finished
  estimatedStartDate?: string         // Expected start date for queued journey
  previousJourneyId?: string          // Reference to journey that must finish first
}
```

### Indexes Added
```javascript
fuelRecordSchema.index({ journeyStatus: 1 });
fuelRecordSchema.index({ truckNo: 1, journeyStatus: 1, queueOrder: 1 });
fuelRecordSchema.index({ truckNo: 1, journeyStatus: 1, isDeleted: 1 });
```

---

## API Changes

### Updated Endpoints

#### `POST /api/fuel-records`
**Before:** Blocked if truck had open fuel record  
**Now:** Creates queued journey if active journey exists

**Response includes:**
```json
{
  "journeyStatus": "queued",
  "queueOrder": 2,
  "previousJourneyId": "67abc123...",
  "message": "Journey queued (position 2)"
}
```

#### `GET /api/delivery-orders/truck/:truckNo/current-journey`
**New fields in response:**
```json
{
  "activeFuelRecord": { ... },          // Current active journey
  "queuedJourneys": [ ... ],            // Array of queued journeys
  "hasQueue": true,
  "queueInfo": {
    "count": 2,
    "nextUp": { ... }                   // Next journey to activate
  }
}
```

---

## Migration

### Running the Migration Script

Migrate all existing fuel records to include journey status:

```bash
cd backend
npx ts-node src/scripts/migrateJourneyStatus.ts
```

**Migration Logic:**
- No `returnDo` → **Active** (ongoing journey)
- Has `returnDo`, balance=0, checkpoint filled → **Completed**
- Has `returnDo`, balance>0 → **Active** (return journey in progress)

**Expected Output:**
```
✓ T889 ZSA - DO 0001/26: Active (no return DO)
✓ T705 DXY - DO 0002/26: Completed (balance=0, return checkpoint filled)
✓ T112 DVL - DO 0003/26: Active (return journey in progress)

=== Migration Summary ===
Total records processed: 245
Already migrated: 0
Updated: 245
  - Active journeys: 189
  - Completed journeys: 56
```

---

## Code Flow

### 1. Creating a New DO (IMPORT)

```
User creates IMPORT DO
    ↓
Backend: createFuelRecord()
    ↓
Check: Does truck have active journey?
    ↓
   YES ──→ Create as QUEUED
    │      - Set journeyStatus = 'queued'
    │      - Calculate queueOrder (count + 1)
    │      - Link previousJourneyId
    │
   NO ───→ Create as ACTIVE
           - Set journeyStatus = 'active'
           - Set activatedAt = now
```

### 2. Journey Completion & Auto-Activation

```
User updates fuel record (LPO created)
    ↓
updateFuelRecord()
    ↓
checkAndActivateNextJourney()
    ↓
Is journey complete? (balance=0 + checkpoint filled)
    ↓
   YES ──→ Mark as COMPLETED
    │      - Set completedAt = now
    │      ↓
    │      activateNextQueuedJourney()
    │      ↓
    │      Find next queued journey (queueOrder = 1)
    │      ↓
    │      Activate it
    │      - Set journeyStatus = 'active'
    │      - Set activatedAt = now
    │      ↓
    │      Reorder remaining queued journeys
    │
   NO ───→ Continue (journey still active)
```

---

## UI Components

### Journey Status Badge Component
**Location:** `frontend/src/components/JourneyStatusBadge.tsx`

**Usage:**
```tsx
<JourneyStatusBadge 
  status="active"     // 'active' | 'queued' | 'completed' | 'cancelled'
  queueOrder={2}      // Optional: Position in queue
  size="md"           // 'sm' | 'md' | 'lg'
/>
```

**Visual Indicators:**
- 🚛 **ACTIVE** - Green badge
- ⏳ **QUEUED #2** - Yellow badge with position
- ✓ **COMPLETED** - Gray badge
- ✗ **CANCELLED** - Red badge

---

## Testing Scenarios

### Scenario 1: Short Trip with Re-booking
```
1. Truck T889 ZSA gets DO-001 (ACTIVE) → Journey to Lubumbashi (2 weeks)
2. Week 1: Truck still on journey, gets DO-002 (QUEUED #1) → Next journey to Kamoa
3. Week 2: Truck completes DO-001 → DO-002 auto-activates (ACTIVE)
4. Week 3: Truck on DO-002, gets DO-003 (QUEUED #1) → Another booking
```

### Scenario 2: Pre-booking Next Assignment
```
1. Truck T705 DXY gets DO-100 (ACTIVE) → Currently at Zambia
2. While at Zambia, office books DO-101 (QUEUED #1) → Return and go to Mombasa
3. Truck completes DO-100 → DO-101 activates automatically
4. Driver proceeds directly to next assignment without delays
```

### Scenario 3: Multiple Queued Journeys
```
1. Truck T112 DVL has DO-200 (ACTIVE)
2. Office pre-books:
   - DO-201 (QUEUED #1) → Kamoa
   - DO-202 (QUEUED #2) → Lubumbashi
   - DO-203 (QUEUED #3) → Solwezi
3. As each journey completes, next one auto-activates in order
```

---

## Benefits

✅ **No More Blocking**: Trucks can be booked for future trips  
✅ **Short Trips Supported**: Multiple bookings per month possible  
✅ **Automatic Progression**: No manual intervention needed  
✅ **Clear Visibility**: Users see queue position and status  
✅ **Audit Trail**: Complete history of all journeys  
✅ **Better Planning**: Office can pre-book assignments

---

## Backwards Compatibility

- Existing fuel records migrated automatically
- Old records without `journeyStatus` default to 'active'
- LPO form still works with legacy data
- All existing functionality preserved

---

## Future Enhancements (Optional)

- **Queue Management UI**: Admin panel to reorder/edit queued journeys
- **Notifications**: Alert fuel makers when journey activates
- **Estimated Start Dates**: Calculate when queued journey might start
- **Queue Priority**: Allow high-priority jobs to jump queue
- **Journey Templates**: Save common routes as templates

---

## Files Modified

### Backend
- `backend/src/types/index.ts` - Added JourneyStatus type
- `backend/src/models/FuelRecord.ts` - Added journey status fields
- `backend/src/controllers/fuelRecordController.ts` - Queue logic + auto-activation
- `backend/src/controllers/deliveryOrderController.ts` - Updated getCurrentJourneyByTruck
- `backend/src/scripts/migrateJourneyStatus.ts` - Migration script

### Frontend
- `frontend/src/types/index.ts` - Added JourneyStatus type
- `frontend/src/pages/DeliveryOrders.tsx` - Updated validation (no blocking)
- `frontend/src/components/LPODetailForm.tsx` - Show queue status
- `frontend/src/pages/FuelRecords.tsx` - Display journey badges
- `frontend/src/components/JourneyStatusBadge.tsx` - **NEW** Status badge component

---

## Support & Questions

For questions or issues with the Journey Queue System, contact the development team or refer to:
- System Configuration docs
- Fuel Records functionality report
- This implementation guide
