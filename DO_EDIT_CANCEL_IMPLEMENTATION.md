# DO Edit & Cancel Implementation Guide

## Overview

This implementation adds comprehensive editing and cancellation features for Delivery Orders (DOs), including cascading updates to related records (Fuel Records, Exports, Workbooks).

## Features Implemented

### 1. DO Editing with Cascading Updates

When a DO is edited, the following fields can be modified:
- **Truck** - Changes reflect in linked fuel records
- **POL (Place of Loading)** - Updates cascade to related records
- **Destination** - Updates cascade to related records
- **Rate** - Updates cascade to related records
- **Tonnage** - Updates cascade to related records
- **Trailer** - Updates cascade to related records

**Cascade Behavior:**
- When DO fields change, linked Fuel Records are automatically updated
- Edit history is tracked for audit purposes
- All exports and workbooks reflect the updated data

### 2. DO Cancellation (Soft Delete)

DOs can be cancelled but NOT deleted. This preserves data integrity and audit trails.

**Cancellation Features:**
- Status changes from `active` to `cancelled`
- Cancellation reason is required
- Timestamp and user who cancelled are recorded
- Cancelled DOs remain visible but clearly marked
- Edit button is disabled for cancelled DOs

**Cascade Cancellation Logic:**

The cascade behavior depends on whether the cancelled DO is a going DO (IMPORT) or return DO (EXPORT):

#### Scenario 1: IMPORT DO (Going DO) Cancelled
- The **entire fuel record is cancelled**
- Reason: The going DO is the primary journey - without it, the fuel record has no purpose

#### Scenario 2: EXPORT DO (Return DO) Cancelled
- The fuel record is **NOT fully cancelled**
- Instead, the return DO is **removed from the fuel record**
- The `from` and `to` fields are **reverted to the going journey values**
- All return fuel allocations are cleared (zambiaReturn, tundumaReturn, etc.)
- This allows a new return DO to be assigned later if needed

**Example:**
1. Fuel record has goingDo: "DO-001" (IMPORT) with from: "Zambia", to: "Dar"
2. Return DO "DO-002" (EXPORT) is added, updating to: "Dar-Zambia"
3. If DO-002 is cancelled:
   - returnDo is set to null
   - from/to reverts to: "Zambia", "Dar"
   - Return fuel allocations are cleared
   - A new EXPORT DO can be linked in the future

### 3. Status Filtering

The DO list page now includes a status filter:
- **All DOs** - Shows both active and cancelled
- **Active Only** - Shows only active DOs (default)
- **Cancelled Only** - Shows only cancelled DOs

## Backend Changes

### Types (`backend/src/types/index.ts`)

```typescript
// DO Status type
export type DOStatus = 'active' | 'cancelled';

// Edit History interface
export interface IDeliveryOrderEditHistory {
  editedAt: Date;
  editedBy: string;
  fieldChanged: string;
  oldValue: any;
  newValue: any;
}

// Added to IDeliveryOrder
status: DOStatus;
isCancelled: boolean;
cancelledAt?: Date;
cancellationReason?: string;
cancelledBy?: string;
editHistory?: IDeliveryOrderEditHistory[];

// Added to IFuelRecord
isCancelled: boolean;
cancelledAt?: Date;
cancellationReason?: string;
cancelledByDO?: string;
```

### DO Model (`backend/src/models/DeliveryOrder.ts`)

- Added `editHistorySchema` for tracking changes
- Added `status` field with default 'active'
- Added cancellation fields
- Added index on status field

### Fuel Record Model (`backend/src/models/FuelRecord.ts`)

- Added cancellation fields (isCancelled, cancelledAt, cancellationReason, cancelledByDO)

### DO Controller (`backend/src/controllers/deliveryOrderController.ts`)

New helper functions:
- `cascadeCancelFuelRecord(doId, reason, cancelledBy)` - Cancels linked fuel records
- `cascadeUpdateRelatedRecords(doId, updatedDO)` - Updates linked fuel records

Enhanced functions:
- `updateDeliveryOrder` - Now tracks edit history and cascades changes
- `cancelDeliveryOrder` - New function for soft-cancelling with cascade

### Routes (`backend/src/routes/deliveryOrderRoutes.ts`)

Added new route:
```
POST /api/delivery-orders/:id/cancel
```

## Frontend Changes

### Types (`frontend/src/types/index.ts`)

Added DOStatus type and cancellation fields to DeliveryOrder and FuelRecord interfaces.

### API Service (`frontend/src/services/api.ts`)

Added `cancel` method to `deliveryOrdersAPI`:
```typescript
cancel: (id: string, reason: string) => axios.post(`/delivery-orders/${id}/cancel`, { reason })
```

### Components

#### CancelDOModal (`frontend/src/components/CancelDOModal.tsx`)

New modal component for cancelling a DO:
- Shows DO information (DO#, Truck, Date)
- Requires cancellation reason
- Warns about cascade effects on fuel records
- Confirmation flow

#### DODetailModal (`frontend/src/components/DODetailModal.tsx`)

- Added cancelled banner at top for cancelled DOs
- Edit button hidden for cancelled DOs

#### DeliveryOrders Page (`frontend/src/pages/DeliveryOrders.tsx`)

- Added status filter dropdown
- Added cancel button in actions
- Added status column showing cancelled badge
- Conditional styling for cancelled rows
- Cancel modal integration

### Workbook Exports

The exports now include status column and show cancelled DOs appropriately.

## API Endpoints

### Cancel a DO

```
POST /api/delivery-orders/:id/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Customer cancelled order"
}
```

Response:
```json
{
  "success": true,
  "message": "Delivery Order cancelled successfully",
  "data": {
    // Updated DO with cancelled status
  }
}
```

### Update a DO (with cascade)

```
PUT /api/delivery-orders/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "truck": "NEW TRUCK",
  "destination": "New Destination",
  // other fields...
}
```

The update automatically:
1. Tracks edit history
2. Cascades changes to linked fuel records
3. Returns the updated DO

## UI/UX Features

### Cancelled DO Visual Indicators

- Red banner at top of DO detail view
- Red "Cancelled" badge in table
- Faded/strikethrough styling in list
- Edit button disabled
- Cancel button hidden for already cancelled DOs

### Status Filter

Located in the toolbar above the DO table:
- Dropdown with "All", "Active", "Cancelled" options
- Default shows "Active Only"
- Maintains filter during pagination

## Testing

### Test Cancellation

1. Go to Delivery Orders page
2. Click "Cancel" on an active DO
3. Enter cancellation reason
4. Confirm cancellation
5. Verify:
   - DO shows as cancelled
   - Linked fuel record is cancelled
   - Edit button is disabled

### Test Cascading Updates

1. Edit a DO (truck, destination, rate, etc.)
2. Verify the linked fuel record is updated
3. Check exports reflect the changes

### Test Status Filter

1. Create multiple DOs
2. Cancel some DOs
3. Use the status filter to verify filtering works correctly

## Data Integrity

- Cancelled DOs are never deleted
- All changes are tracked in edit history
- Cascading ensures data consistency
- User who cancelled is recorded for audit

## Notes

- Only users with edit permissions can cancel DOs
- Cancellation cannot be undone through the UI (requires database intervention)
- Edit history provides full audit trail of changes
