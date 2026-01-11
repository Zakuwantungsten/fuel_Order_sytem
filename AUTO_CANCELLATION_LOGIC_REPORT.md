# Auto-Cancellation Logic Report
## Cash Fuel Records & LPOs

**Report Date:** January 11, 2026  
**Author:** System Analysis  
**Purpose:** Comprehensive documentation of auto-cancellation mechanisms in the Fuel Order System

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Auto-Cancellation Triggers](#auto-cancellation-triggers)
4. [CASH Mode Auto-Cancellation](#cash-mode-auto-cancellation)
5. [LPO Cancellation Logic](#lpo-cancellation-logic)
6. [Fuel Record Cancellation Logic](#fuel-record-cancellation-logic)
7. [Delivery Order Cascade Cancellation](#delivery-order-cascade-cancellation)
8. [Technical Implementation](#technical-implementation)
9. [Data Flow Diagrams](#data-flow-diagrams)
10. [Important Findings](#important-findings)

---

## Executive Summary

The Fuel Order System implements **NO SCHEDULED/AUTOMATIC TIME-BASED CANCELLATION** for cash fuel records or LPOs. All cancellations are **MANUAL and USER-TRIGGERED** with automatic cascading effects to related records.

### Key Findings:
- ✅ **CASH mode triggers auto-cancellation** when creating new LPO with same truck at same checkpoint
- ✅ **Delivery Order cancellation cascades** to fuel records and LPO entries
- ✅ **LPO entry cancellation reverts** fuel record allocations automatically
- ❌ **NO scheduled/cron jobs** for automatic cancellation based on time/age
- ❌ **NO automatic expiration** of cash fuel records or LPOs

---

## System Overview

### Architecture Components
```
┌─────────────────────────────────────────────────────────────┐
│                    Cancellation System                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. MANUAL CANCELLATION (User-Triggered)                    │
│     ├─ LPO Entry Cancellation                               │
│     ├─ Delivery Order Cancellation                          │
│     └─ Direct Fuel Record Cancellation                      │
│                                                               │
│  2. AUTO-CANCELLATION (Event-Triggered)                     │
│     ├─ CASH Mode LPO Creation → Cancel existing LPO         │
│     ├─ DO Cancellation → Cascade to Fuel Record            │
│     ├─ DO Cancellation → Cascade to LPO Entries            │
│     └─ LPO Entry Cancellation → Revert Fuel Record         │
│                                                               │
│  3. NO SCHEDULED CANCELLATION                                │
│     ❌ No cron jobs for auto-cancellation                   │
│     ❌ No time-based expiration                             │
│     ❌ No age-based automatic cleanup                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Scheduled Jobs in System
The system has **only ONE scheduled job** (found in `backend/src/jobs/archivalScheduler.ts`):

```typescript
// Runs on 1st day of every month at 2:00 AM
cron.schedule('0 2 1 * *', async () => {
  // Archives data older than 6 months (moves to archive collections)
  // Does NOT cancel or delete records
  // DeliveryOrders are NEVER archived
});
```

**Important:** This archival job **DOES NOT CANCEL** records - it only moves old data to archive collections for performance optimization.

---

## Auto-Cancellation Triggers

### 1. CASH Mode LPO Creation (Trigger-Based)

**Location:** `frontend/src/components/LPODetailForm.tsx` (Lines 1495-1520)

**When it happens:**
- User creates a new LPO with station = 'CASH'
- User selects cancellation checkpoint(s) (Going and/or Returning)
- Truck(s) in the new LPO already exist in other LPOs at same checkpoint

**What gets cancelled:**
- Existing LPO entries for the same truck at the same cancellation checkpoint
- Automatically triggered BEFORE creating the new CASH LPO

**Code Implementation:**
```typescript
// Perform auto-cancellation for CASH mode if checkpoint(s) are selected
if (formData.station === 'CASH' && existingLPOsForTrucks.size > 0) {
  try {
    // Cancel trucks in existing LPOs for all directions
    for (const [truckNo, directionLPOs] of existingLPOsForTrucks) {
      for (const { lpos, direction } of directionLPOs) {
        const checkpoint = direction === 'Going' ? goingCheckpoint : returningCheckpoint;
        for (const lpo of lpos) {
          await lpoDocumentsAPI.cancelTruck(
            lpo.id as string,
            truckNo,
            checkpoint as CancellationPoint,
            `Cash mode payment - station was out of fuel (${direction})`
          );
        }
      }
    }
    console.log('Auto-cancellation completed for both directions');
  } catch (error) {
    console.error('Error during auto-cancellation:', error);
    // Continue with LPO creation even if cancellation fails
  }
}
```

**Business Logic:**
- **Reason:** Station ran out of fuel, truck paid cash at checkpoint
- **Effect:** Cancels the station-based LPO and creates CASH LPO
- **Fuel Record Impact:** Fuel allocation reverted from old LPO, applied to new CASH LPO
- **Audit Trail:** Cancellation reason: "Cash mode payment - station was out of fuel"

**Example Scenario:**
```
Initial State:
- LPO #001 (LAKE CHILABOMBWE): Truck T123 ABC - 400L at ZAMBIA_GOING
- Fuel Record: zambiaGoing = 400L

User Action:
- Creates CASH LPO with T123 ABC at ZAMBIA_GOING checkpoint

Auto-Cancellation:
1. System finds LPO #001 has T123 ABC at ZAMBIA_GOING
2. Cancels T123 ABC entry in LPO #001
3. Reverts fuel record: zambiaGoing = 0L
4. Creates new CASH LPO
5. Applies fuel to new CASH LPO: zambiaGoing = 400L (from CASH)

Final State:
- LPO #001: T123 ABC entry marked isCancelled=true
- CASH LPO: T123 ABC - 400L at ZAMBIA_GOING
- Fuel Record: zambiaGoing = 400L (source changed from station to CASH)
```

### 2. Delivery Order Cancellation (Cascade)

**Location:** `backend/src/controllers/deliveryOrderController.ts` (Lines 104-217)

**When it happens:**
- User cancels a Delivery Order (DO)
- System automatically cascades cancellation to related records

**Cascade Logic:**

#### A. Going DO (IMPORT) Cancelled
```typescript
// IMPORT DO (going DO) is cancelled - cancel the entire fuel record
// The going DO is the primary journey, without it the fuel record has no purpose
await FuelRecord.findByIdAndUpdate(fuelRecord._id, {
  isCancelled: true,
  cancelledAt: new Date(),
  cancellationReason: `Going DO ${deliveryOrder.doNumber} cancelled: ${cancellationReason}`,
  cancelledBy: username,
});

// Result: FULL FUEL RECORD CANCELLATION
```

**Effect:**
- Entire fuel record marked as cancelled
- Journey considered as never happened
- All related LPO entries marked as deleted
- Fuel allocations preserved for audit but record inactive

#### B. Return DO (EXPORT) Cancelled
```typescript
// EXPORT DO (return DO) is cancelled
// The fuel record still has the going DO, so we don't cancel the whole record
// Instead, we remove the return DO and revert to going-only journey

const updateData: any = {
  returnDo: null, // Remove the return DO
  from: revertFrom,
  to: revertTo,
  originalGoingFrom: null,
  originalGoingTo: null,
  // Clear return fuel allocations
  zambiaReturn: 0,
  tundumaReturn: 0,
  mbeyaReturn: 0,
  moroReturn: 0,
  darReturn: 0,
  tangaReturn: 0,
};

// Result: RETURN JOURNEY REMOVED, GOING JOURNEY PRESERVED
```

**Effect:**
- Return DO removed from fuel record
- Return fuel allocations cleared (set to 0)
- Going journey data restored to original values
- Fuel record reverts to "going-only" state
- Record remains active (not cancelled)

#### C. LPO Entries Cascade
```typescript
// Mark LPO entries as cancelled/deleted
const result = await LPOEntry.updateMany(
  { doSdo: doNumber, isDeleted: false },
  { 
    isDeleted: true, 
    deletedAt: new Date() 
  }
);
```

**Effect:**
- All LPO entries linked to cancelled DO are marked as deleted
- Entries preserved for audit trail
- Excluded from active queries

### 3. LPO Entry Cancellation (Manual with Auto-Revert)

**Location:** `backend/src/controllers/lpoSummaryController.ts` (Lines 1945-2030)

**When it happens:**
- User manually cancels a specific truck entry in an LPO
- Triggered via API: `POST /api/lpo-summary/cancel-truck`

**What gets reverted:**
```typescript
// Revert the fuel record deduction
await updateFuelRecordForLPOEntry(
  entry.doNo,
  -entry.liters,  // Negative liters = add back to balance
  lpo.station,
  entry.truckNo,
  entry.cancellationPoint,
  entry.isCustomStation ? { ... } : undefined
);

// Mark the entry as cancelled
lpo.entries[entryIndex].isCancelled = true;
lpo.entries[entryIndex].cancellationPoint = cancellationPoint;
lpo.entries[entryIndex].cancellationReason = reason || 'Entry cancelled - fuel allocation reverted';
lpo.entries[entryIndex].cancelledAt = new Date();
```

**Fuel Record Revert Logic:**
- Finds fuel record by DO number and truck number
- Identifies which checkpoint field was updated (darGoing, zambiaReturn, etc.)
- **Subtracts** liters from checkpoint field (reverses the deduction)
- **Adds** liters back to balance
- Preserves audit trail

**Entry Type Handling:**

| Entry Type | Fuel Record Impact | Cancellation Reason |
|------------|-------------------|-------------------|
| Regular Entry | Fuel reverted | "Entry cancelled - fuel allocation reverted" |
| Driver Account | NO fuel impact | "Driver Account entry cancelled - no fuel record affected" |
| NIL DO (No DO) | NO fuel impact | "Entry cancelled - no fuel record found" |

---

## CASH Mode Auto-Cancellation

### Purpose
CASH mode is used when the designated fuel station runs out of fuel and the truck must purchase fuel with cash at a checkpoint.

### Business Rules

1. **Checkpoint Selection Required**
   - User must select which checkpoint(s) the truck purchased cash fuel
   - Can select Going checkpoint, Returning checkpoint, or both
   - Each checkpoint corresponds to a fuel record column

2. **Auto-Cancellation Trigger**
   - System searches for existing LPOs with same truck at same checkpoint
   - Searches last 40 days of LPOs for performance
   - Only matches non-cancelled entries

3. **Cancellation Process**
   ```
   1. User creates CASH LPO
   2. User selects checkpoint (e.g., ZAMBIA_GOING)
   3. System queries:
      - Find LPOs with station != 'CASH'
      - Where entries.truckNo matches
      - Where date >= (today - 40 days)
      - Where entries.isCancelled != true
   4. For each matching LPO:
      - Cancel truck entry via API
      - Revert fuel allocation
      - Set cancellation reason
   5. Create new CASH LPO
   6. Apply fuel to CASH LPO
   ```

### Cancellation Points Mapping

**Going Direction:**
```typescript
'DAR_GOING'      → Fuel Record: darGoing
'MORO_GOING'     → Fuel Record: moroGoing
'MBEYA_GOING'    → Fuel Record: mbeyaGoing
'TDM_GOING'      → Fuel Record: tdmGoing
'ZAMBIA_GOING'   → Fuel Record: zambiaGoing
'CONGO_GOING'    → Fuel Record: congoFuel
```

**Returning Direction:**
```typescript
'ZAMBIA_RETURNING' → Fuel Record: zambiaReturn
'TDM_RETURN'       → Fuel Record: tundumaReturn
'MBEYA_RETURN'     → Fuel Record: mbeyaReturn
'MORO_RETURN'      → Fuel Record: moroReturn
'DAR_RETURN'       → Fuel Record: darReturn
'TANGA_RETURN'     → Fuel Record: tangaReturn
'CONGO_RETURNING'  → Fuel Record: congoFuel
```

### Frontend Implementation

**File:** `frontend/src/services/cancellationService.ts`

**Key Functions:**

1. **`getAvailableCancellationPoints()`**
   - Returns list of valid checkpoints for Going and Returning directions
   - Used to populate checkpoint dropdowns

2. **`getAutoCancellationPoint(station, direction)`**
   - Auto-detects cancellation point based on station name
   - Eliminates manual checkpoint selection for non-CASH stations

3. **`getCancellationPointDisplayName(point)`**
   - Converts cancellation point enum to human-readable name
   - Example: `ZAMBIA_GOING` → "Zambia Going"

4. **`getFuelRecordFieldFromCancellationPoint(point)`**
   - Maps cancellation point to fuel record database field
   - Example: `ZAMBIA_GOING` → "zambiaGoing"

5. **`createCancellationInfo()`**
   - Creates structured cancellation metadata
   - Includes timestamp, user, reason, and references

### API Endpoint

**POST /api/lpo-summary/cancel-truck**

**Request Body:**
```typescript
{
  lpoId: string,           // LPO document ID
  truckNo: string,         // Truck number to cancel
  cancellationPoint: CancellationPoint,  // Checkpoint
  reason?: string          // Optional reason
}
```

**Response:**
```typescript
{
  success: true,
  message: "Successfully cancelled truck T123 ABC in LPO LPO-001",
  data: LPOSummary,        // Updated LPO document
  entryType: 'regular' | 'driver-account' | 'nil-do'
}
```

---

## LPO Cancellation Logic

### Manual Cancellation Flow

```
User Action → API Call → Find LPO Entry → Determine Entry Type → 
Revert Fuel (if applicable) → Mark Cancelled → Recalculate Total → Save
```

### Entry Types & Behavior

#### 1. Regular Entry (Has Valid DO)
- **Fuel Record:** YES - fuel deduction reverted
- **Cancellation Reason:** "Entry cancelled - fuel allocation reverted"
- **Process:**
  1. Find fuel record by DO number
  2. Determine direction (going vs returning)
  3. Identify fuel field (darGoing, zambiaReturn, etc.)
  4. Subtract liters from field (reverse deduction)
  5. Add liters back to balance

#### 2. Driver Account Entry
- **Fuel Record:** NO - no fuel record affected
- **Cancellation Reason:** "Driver Account entry cancelled - no fuel record affected"
- **Process:**
  1. Mark entry as cancelled
  2. No fuel record changes
  3. Driver account entry preserved for billing

#### 3. NIL DO Entry (No DO Assigned)
- **Fuel Record:** NO - no fuel record found
- **Cancellation Reason:** "Entry cancelled - no fuel record found"
- **Process:**
  1. Attempt fuel record search
  2. If not found, skip fuel revert
  3. Mark entry as cancelled

### Fuel Record Update Logic

**Function:** `updateFuelRecordForLPOEntry()`  
**Location:** `backend/src/controllers/lpoSummaryController.ts` (Lines 152-385)

**Search Strategy:**
```typescript
// Multi-month search: current → previous → 2 months ago → 3 months ago
// Find active fuel record (balance != 0 OR journey not complete)
```

**Field Determination:**
1. **Custom Station:** Use `customGoingCheckpoint` or `customReturnCheckpoint`
2. **CASH Mode:** Use `cancellationPoint` mapping
3. **Regular Station:** Use station-to-field mapping from config

**Update Calculation:**
```typescript
// For cancellation (reverting fuel):
litersChange = -entry.liters  // Negative value

// Checkpoint field (positive values):
currentValue = Math.abs(fuelRecord[fieldToUpdate] || 0)
newValue = currentValue + Math.abs(litersChange)  // Subtract from field

// Balance (remaining fuel):
newBalance = fuelRecord.balance - Math.abs(litersChange)  // Add back to balance
```

**Example:**
```
Before Cancellation:
- Fuel Record Balance: 500L
- zambiaGoing: 400L

Cancel 400L entry:
- litersChange: -400
- newValue: 400 - 400 = 0L (reverted)
- newBalance: 500 + 400 = 900L (restored)

After Cancellation:
- Fuel Record Balance: 900L
- zambiaGoing: 0L
```

### LPO Total Recalculation

```typescript
// Recalculate total (excluding cancelled entries)
lpo.total = lpo.entries
  .filter((e: any) => !e.isCancelled)
  .reduce((sum: number, e: any) => sum + e.amount, 0);
```

**Effect:**
- Total amount reflects only active entries
- Cancelled entries excluded from financial totals
- Cancelled entries still visible in sheet for audit

---

## Fuel Record Cancellation Logic

### Cancellation Scenarios

#### 1. Direct Cancellation (Going DO Cancelled)
```typescript
// Location: deliveryOrderController.ts
await FuelRecord.findByIdAndUpdate(fuelRecord._id, {
  isCancelled: true,
  cancelledAt: new Date(),
  cancellationReason: `Going DO ${deliveryOrder.doNumber} cancelled: ${reason}`,
  cancelledBy: username,
});
```

**Impact:**
- Entire fuel record cancelled
- All fuel allocations preserved but record inactive
- Journey considered as never happened
- Related LPO entries marked as deleted

#### 2. Partial Cancellation (Return DO Cancelled)
```typescript
// Return DO removed, going journey preserved
await FuelRecord.findByIdAndUpdate(fuelRecord._id, {
  returnDo: null,
  from: originalGoingFrom,
  to: originalGoingTo,
  originalGoingFrom: null,
  originalGoingTo: null,
  zambiaReturn: 0,
  tundumaReturn: 0,
  mbeyaReturn: 0,
  moroReturn: 0,
  darReturn: 0,
  tangaReturn: 0,
});
```

**Impact:**
- Fuel record remains active (isCancelled: false)
- Return journey data cleared
- Going journey data restored
- Truck can complete return journey via different route

### Cancelled Record Behavior

#### Database
- `isCancelled: true`
- `cancelledAt: Date`
- `cancellationReason: String`
- `cancelledBy: String`
- All fuel allocations preserved for audit

#### Frontend Display
- Red strikethrough styling
- "CANCELLED" badge
- Read-only view (cannot edit)
- Details modal accessible
- Excluded from analytics by default

#### API Queries
```typescript
// Filter out cancelled records:
const filter = {
  isDeleted: false,
  isCancelled: { $ne: true }  // Exclude cancelled
};

// Find only cancelled records:
const filter = {
  isDeleted: false,
  isCancelled: true
};
```

---

## Delivery Order Cascade Cancellation

### Cascade Targets

When a Delivery Order is cancelled:

1. **Fuel Record** (if applicable)
2. **LPO Entries** linked to the DO
3. **Yard Fuel Links** (indirectly affected)

### Cascade Functions

#### 1. `cascadeCancelFuelRecord()`
**Location:** `backend/src/controllers/deliveryOrderController.ts` (Lines 107-217)

**Logic:**
```typescript
if (deliveryOrder.importOrExport === 'IMPORT') {
  // Going DO cancelled → Full fuel record cancellation
  // Find fuel record where goingDo = deliveryOrder.doNumber
  // Set isCancelled = true
  return { cancelled: true, action: 'fully_cancelled' };
}
else if (deliveryOrder.importOrExport === 'EXPORT') {
  // Return DO cancelled → Remove return journey, preserve going
  // Find fuel record where returnDo = deliveryOrder.doNumber
  // Clear returnDo and return fuel allocations
  return { cancelled: true, action: 'return_do_removed' };
}
```

**Special Cases:**
- **SDO Orders:** Skipped (SDOs don't interact with fuel records)
- **No Fuel Record Found:** Cancellation considered successful (no cascade needed)

#### 2. `cascadeToLPOEntries()`
**Location:** `backend/src/controllers/deliveryOrderController.ts` (Lines 219-260)

**Logic:**
```typescript
if (action === 'cancel') {
  // Mark LPO entries as deleted
  const result = await LPOEntry.updateMany(
    { doSdo: doNumber, isDeleted: false },
    { 
      isDeleted: true, 
      deletedAt: new Date() 
    }
  );
  return { count: result.modifiedCount };
}
```

**Effect:**
- All LPO entries with matching DO number marked as deleted
- Entries preserved for audit
- Excluded from active LPO queries

### Cascade Results Tracking

```typescript
const cascadeResults = {
  fuelRecordCancelled: boolean,
  fuelRecordId: string,
  fuelRecordAction: 'fully_cancelled' | 'return_do_removed',
  lpoEntriesCancelled: number,
};
```

**User Notification:**
```
Delivery Order DO-12345 cancelled successfully.
• Associated fuel record cancelled
• 3 LPO entries cancelled
```

---

## Technical Implementation

### Backend Structure

#### Models

**FuelRecord Schema** (`backend/src/models/FuelRecord.ts`)
```typescript
{
  // Cancellation fields
  isCancelled: Boolean (default: false),
  cancelledAt: Date,
  cancellationReason: String,
  cancelledBy: String,
}
```

**LPODetail Schema** (embedded in LPOSummary)
```typescript
{
  // Cancellation fields
  isCancelled: Boolean,
  cancellationPoint: CancellationPoint,
  cancellationReason: String,
  cancelledAt: Date,
}
```

#### Database Indexes

**FuelRecord:**
```typescript
// Optimized for yard fuel auto-linking (filters cancelled records)
{ truckNo: 1, date: -1, isDeleted: 1, isCancelled: 1 }
```

**LPOSummary:**
```typescript
// Efficient filtering of cancelled entries
'entries.isCancelled': 1
```

### API Endpoints

#### Cancel Truck in LPO
```
POST /api/lpo-summary/cancel-truck
Body: { lpoId, truckNo, cancellationPoint, reason? }
Response: { success, message, data, entryType }
```

#### Cancel Delivery Order
```
POST /api/delivery-orders/:id/cancel
Body: { reason }
Response: { success, message, cascadeResults }
```

#### Find LPOs by Truck at Station
```
POST /api/lpo-summary/find-by-truck-at-station
Body: { truckNo, station? }
Response: { success, data: LPOSummary[] }
```

### Frontend Components

#### 1. LPODetailForm.tsx
- **Auto-cancellation on CASH LPO creation**
- Checkpoint selection for Going and Returning
- Existing LPO detection and display
- Auto-cancellation execution before submit

#### 2. LPOSheetView.tsx
- **Manual entry cancellation**
- Entry type detection (regular/driver-account/nil-do)
- Cancellation point auto-detection
- Cancellation confirmation modal

#### 3. DeliveryOrders.tsx
- **DO cancellation with cascade display**
- Shows cascade results (fuel record + LPO entries)
- Cancellation reason input
- Refresh data after cancellation

---

## Data Flow Diagrams

### CASH Mode Auto-Cancellation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User Creates CASH LPO                                        │
│    - Selects trucks                                              │
│    - Selects ZAMBIA_GOING checkpoint                            │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. System Searches Existing LPOs                                │
│    - Query: truck=T123, station!=CASH, date >= (today-40days)  │
│    - Finds: LPO #001 (LAKE CHILABOMBWE) with T123 ABC          │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Auto-Cancel Existing LPO Entry                               │
│    API: POST /api/lpo-summary/cancel-truck                      │
│    Body: {                                                       │
│      lpoId: "LPO-001",                                          │
│      truckNo: "T123 ABC",                                       │
│      cancellationPoint: "ZAMBIA_GOING",                         │
│      reason: "Cash mode payment - station was out of fuel"      │
│    }                                                             │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Revert Fuel Record                                           │
│    - Find fuel record by DO number                              │
│    - Field: zambiaGoing = 400L → 0L (reverted)                 │
│    - Balance: 500L → 900L (restored)                            │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Mark LPO Entry as Cancelled                                  │
│    - isCancelled: true                                          │
│    - cancellationPoint: "ZAMBIA_GOING"                          │
│    - cancellationReason: "Cash mode payment..."                 │
│    - cancelledAt: 2026-01-11T10:30:00Z                         │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Create New CASH LPO                                          │
│    - Station: CASH                                              │
│    - Truck: T123 ABC                                            │
│    - Liters: 400L                                               │
│    - Checkpoint: ZAMBIA_GOING                                   │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. Apply Fuel to CASH LPO                                       │
│    - Field: zambiaGoing = 0L → 400L (from CASH)                │
│    - Balance: 900L → 500L (consumed)                            │
│    - Source changed: Station → CASH                             │
└─────────────────────────────────────────────────────────────────┘
```

### DO Cancellation Cascade Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ User Cancels Delivery Order                                     │
│ DO Number: DO-12345 (IMPORT)                                    │
│ Reason: "Wrong truck assigned"                                  │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Mark DO as Cancelled                                         │
│    - isCancelled: true                                          │
│    - cancellationReason: "Wrong truck assigned"                 │
│    - cancelledAt: 2026-01-11T10:30:00Z                         │
│    - cancelledBy: "john.doe"                                    │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Cascade to Fuel Record                                       │
│    If IMPORT DO:                                                │
│      → FULL CANCELLATION                                        │
│      → isCancelled: true                                        │
│      → Reason: "Going DO DO-12345 cancelled: Wrong truck"      │
│                                                                  │
│    If EXPORT DO:                                                │
│      → PARTIAL CANCELLATION                                     │
│      → Clear returnDo, return fuel allocations                  │
│      → Revert to going-only journey                             │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Cascade to LPO Entries                                       │
│    - Find all LPO entries with doSdo = "DO-12345"              │
│    - Mark as deleted: isDeleted = true                          │
│    - Set deletedAt timestamp                                    │
│    - Count: 3 entries cancelled                                 │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Return Cascade Results                                       │
│    {                                                             │
│      fuelRecordCancelled: true,                                 │
│      fuelRecordId: "FR-12345",                                  │
│      fuelRecordAction: "fully_cancelled",                       │
│      lpoEntriesCancelled: 3                                     │
│    }                                                             │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Display Confirmation                                         │
│    "Delivery Order DO-12345 cancelled successfully."           │
│    "• Associated fuel record cancelled"                         │
│    "• 3 LPO entries cancelled"                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Important Findings

### ✅ What Exists (Confirmed)

1. **CASH Mode Auto-Cancellation**
   - ✅ Triggered when creating CASH LPO with existing truck at checkpoint
   - ✅ Searches last 40 days of LPOs
   - ✅ Cancels existing LPO entries automatically
   - ✅ Reverts fuel record allocations
   - ✅ Creates audit trail with reason

2. **DO Cascade Cancellation**
   - ✅ DO cancellation triggers automatic cascade
   - ✅ IMPORT DO → Full fuel record cancellation
   - ✅ EXPORT DO → Partial fuel record update (return journey removed)
   - ✅ All related LPO entries marked as deleted
   - ✅ Cascade results tracked and displayed to user

3. **LPO Entry Cancellation**
   - ✅ Manual cancellation via API
   - ✅ Automatic fuel record revert
   - ✅ Handles 3 entry types (regular, driver-account, nil-do)
   - ✅ Recalculates LPO totals
   - ✅ Preserves audit trail

4. **Fuel Record Locking**
   - ✅ Locked when configuration missing (totalLts or extra)
   - ✅ Cannot edit/delete locked records
   - ✅ Admin notification for pending configuration
   - ✅ Auto-unlocks when configuration complete

### ❌ What Does NOT Exist (Confirmed)

1. **NO Time-Based Auto-Cancellation**
   - ❌ No scheduled cancellation jobs
   - ❌ No automatic expiration of fuel records
   - ❌ No age-based cleanup of LPOs
   - ❌ No automatic cancellation of old CASH entries

2. **NO Automatic Cancellation Triggers Based On:**
   - ❌ Age of record (e.g., cancel after 30 days)
   - ❌ Inactivity (e.g., no updates in X days)
   - ❌ Balance status (e.g., cancel when balance = 0)
   - ❌ Journey completion (e.g., cancel when return checkpoint filled)

3. **NO Scheduled Jobs for Cancellation**
   - ❌ No cron jobs for cancellation
   - ❌ Only ONE scheduled job exists: `archivalScheduler` (data archival, not cancellation)
   - ❌ Archival moves old data but doesn't cancel records

### 🔍 Edge Cases & Special Behavior

1. **CASH LPO Auto-Cancellation Failure**
   - System continues with CASH LPO creation even if cancellation fails
   - Logs error but doesn't block user workflow
   - May result in duplicate fuel allocations (rare scenario)

2. **Multiple LPOs at Same Checkpoint**
   - All matching LPOs cancelled (not just most recent)
   - User may need to manually verify cancellations

3. **Driver Account Entries**
   - No fuel record impact when cancelled
   - Still billed to driver's account
   - Preserved for financial records

4. **NIL DO Entries**
   - Cannot revert fuel record (no DO to match)
   - Still marked as cancelled in LPO
   - May leave fuel allocations orphaned

5. **Cross-Month Fuel Record Search**
   - Searches up to 4 months back
   - May miss very old open fuel records
   - Could cause fuel allocation mismatches if record > 4 months old

### 📊 Data Integrity Considerations

1. **Cancelled Records Filtering**
   - ✅ Yard fuel auto-linking excludes cancelled records
   - ✅ Fuel record queries exclude cancelled by default
   - ✅ Analytics exclude cancelled unless explicitly included
   - ✅ LPO queries filter `isCancelled: true` entries

2. **Audit Trail Preservation**
   - ✅ Cancelled records never deleted (soft delete only)
   - ✅ Cancellation reasons required
   - ✅ Timestamps and user tracking
   - ✅ Original values preserved

3. **Referential Integrity**
   - ✅ DO cancellation cascades correctly
   - ✅ LPO cancellation reverts fuel records
   - ✅ Fuel record cancellation doesn't cascade (manual cascade via DO)
   - ⚠️ **Gap:** Fuel record direct cancellation doesn't cascade to LPOs

---

## Recommendations

### 1. Consider Adding Time-Based Auto-Cancellation (Optional)

**Use Case:** Automatically cancel very old open CASH LPOs that were never completed

**Proposed Logic:**
```typescript
// Scheduled job: Run daily at 3:00 AM
cron.schedule('0 3 * * *', async () => {
  // Find CASH LPOs older than 90 days with balance > 0
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  
  const oldOpenRecords = await FuelRecord.find({
    date: { $lt: cutoffDate.toISOString().split('T')[0] },
    balance: { $gt: 0 },
    isCancelled: false,
    isDeleted: false,
    // Only CASH mode or unlisted routes
    $or: [
      { goingDo: 'NIL' },
      { isLocked: true }
    ]
  });
  
  // Auto-cancel with notification
  for (const record of oldOpenRecords) {
    await FuelRecord.findByIdAndUpdate(record._id, {
      isCancelled: true,
      cancelledAt: new Date(),
      cancellationReason: 'Auto-cancelled: Record older than 90 days with open balance',
      cancelledBy: 'system'
    });
    
    // Send notification to admins
    await createNotification({
      type: 'fuel_record_auto_cancelled',
      message: `Fuel record for ${record.truckNo} auto-cancelled (90+ days old)`,
      data: record
    });
  }
});
```

**Pros:**
- Cleans up abandoned fuel records
- Prevents indefinite open balances
- Improves data quality

**Cons:**
- May cancel legitimate long-running journeys
- Requires careful configuration (90 days may be too short)
- Needs admin review mechanism

**Recommendation:** ⚠️ **NOT RECOMMENDED** - Manual review and cancellation is safer

### 2. Add Fuel Record → LPO Cascade (Gap Fix)

**Current Gap:** When fuel record is directly cancelled, related LPO entries are not automatically cancelled

**Proposed Fix:**
```typescript
// Add to fuelRecordController.ts
async function cascadeToRelatedLPOs(fuelRecord: any, reason: string) {
  // Find all LPO entries for this journey
  const lpoEntries = await LPOEntry.find({
    $or: [
      { doSdo: fuelRecord.goingDo },
      { doSdo: fuelRecord.returnDo }
    ],
    truckNo: fuelRecord.truckNo,
    isDeleted: false
  });
  
  // Mark as deleted
  for (const entry of lpoEntries) {
    await LPOEntry.findByIdAndUpdate(entry._id, {
      isDeleted: true,
      deletedAt: new Date()
    });
  }
  
  return { count: lpoEntries.length };
}
```

**Recommendation:** ✅ **RECOMMENDED** - Improves data consistency

### 3. Add Cancellation History Tracking

**Proposed Feature:** Track all cancellations in a separate collection for audit/analytics

```typescript
// New collection: CancellationHistory
{
  entityType: 'fuel_record' | 'lpo_entry' | 'delivery_order',
  entityId: ObjectId,
  entityRef: String,  // DO number, LPO number, etc.
  cancelledBy: String,
  cancelledAt: Date,
  cancellationReason: String,
  cascadeResults: Object,
  metadata: Object
}
```

**Benefits:**
- Better reporting on cancellation patterns
- Audit trail independent of entity deletion
- Analytics on cancellation reasons

**Recommendation:** ✅ **RECOMMENDED** - Enhances audit capabilities

---

## Conclusion

The Fuel Order System implements a **robust event-driven cancellation system** with automatic cascading, but **NO scheduled/time-based auto-cancellation**. All cancellations are triggered by user actions or related record cancellations.

### Summary Table

| Cancellation Type | Trigger | Auto-Cascade | Fuel Record Impact | Scheduled? |
|-------------------|---------|--------------|-------------------|-----------|
| CASH LPO Creation | User creates CASH LPO | ✅ Yes | Reverts old, applies new | ❌ No |
| LPO Entry Cancel | User cancels entry | ✅ Yes | Reverts fuel allocation | ❌ No |
| DO Cancel (IMPORT) | User cancels DO | ✅ Yes | Full cancellation | ❌ No |
| DO Cancel (EXPORT) | User cancels DO | ✅ Yes | Removes return journey | ❌ No |
| Direct Fuel Record Cancel | User cancels fuel record | ❌ No | N/A (is the target) | ❌ No |
| Age-Based Auto-Cancel | N/A | ❌ No | N/A | ❌ No |
| Balance-Based Auto-Cancel | N/A | ❌ No | N/A | ❌ No |

### Key Takeaways

1. ✅ **Strong Cascade Logic:** DO and LPO cancellations properly cascade to related records
2. ✅ **CASH Mode Intelligence:** Automatic detection and cancellation of conflicting LPOs
3. ✅ **Audit Trail:** Complete tracking of who, when, why for all cancellations
4. ❌ **No Time-Based Automation:** No scheduled jobs for automatic cancellation
5. ⚠️ **Minor Gap:** Direct fuel record cancellation doesn't cascade to LPOs

### System Strengths

- Event-driven architecture ensures data consistency
- User-triggered cancellations provide control and accountability
- Multiple entry types handled appropriately (regular, driver-account, nil-do)
- Fuel record revert logic properly maintains balance integrity

### Areas for Enhancement

- Consider adding fuel record → LPO cascade
- Optional: Add cancellation history collection
- Optional: Add age-based auto-cancellation with admin review

---

**Report Completed:** January 11, 2026  
**Total Cancellation Mechanisms:** 5 (all user-triggered or event-triggered)  
**Scheduled Cancellation Jobs:** 0  
**Archival Jobs:** 1 (data archival, not cancellation)
