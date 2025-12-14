# Bulk DO Creation Notification System

## Overview
Implemented a notification system to track and report skipped/failed orders during bulk DO creation. When creating multiple DOs in bulk, any trucks with open fuel records or other errors will now be recorded in the notification bell for later review.

## Implementation Details

### 1. Backend - Notification Controller
**File**: `backend/src/controllers/notificationController.ts`

Added `createBulkDOFailureNotification` function that:
- Creates notifications only when there are failures or skips
- Includes detailed breakdown of skipped and failed orders
- Shows truck numbers and specific reasons for each issue
- Targets: `fuel_order_maker`, `admin`, `super_admin` roles
- Notification type: `bulk_do_creation_issues`

**Key Features**:
- Accepts metadata with counts and detailed reason arrays
- Formats clear, actionable messages
- Logs notification creation for audit trail
- Handles errors gracefully without failing the main operation

### 2. Backend - Delivery Order Controller
**File**: `backend/src/controllers/deliveryOrderController.ts`

Added `createBulkDOFailureNotification` controller method that:
- Validates required fields (totalAttempted, successCount, skippedCount, failedCount)
- Extracts reason arrays from request body
- Calls the notification creation helper
- Returns success response

### 3. Backend - Routes
**File**: `backend/src/routes/deliveryOrderRoutes.ts`

Added POST route:
```
POST /api/delivery-orders/notify-bulk-failures
```

**Authorization**: Requires one of:
- `super_admin`
- `admin`
- `manager`
- `clerk`
- `fuel_order_maker`

### 4. Frontend - API Service
**File**: `frontend/src/services/api.ts`

Added `createBulkFailureNotification` method to `deliveryOrdersAPI`:
```typescript
createBulkFailureNotification: async (data: {
  totalAttempted: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  skippedReasons?: { truck: string; reason: string }[];
  failedReasons?: { truck: string; reason: string }[];
}): Promise<void>
```

### 5. Frontend - Bulk DO Handler
**File**: `frontend/src/pages/DeliveryOrders.tsx`

Modified `handleSaveBulkOrders` function to:
1. Track skipped orders (trucks with open fuel records)
2. Track failed orders (DO creation errors)
3. Call notification API when issues occur
4. Format reason arrays with truck details
5. Update alert message to mention notification bell

## User Experience Flow

### Before (Old Behavior)
- User creates bulk DOs
- Some fail due to open fuel records
- User sees alert with failure details
- **Alert is transient and disappears when closed**
- No way to review issues later

### After (New Behavior)
- User creates bulk DOs
- Some fail due to open fuel records
- User sees alert with failure details
- **Alert mentions "Check the notification bell for details"**
- **Notification is created in the notification bell**
- User can review issues later at their convenience
- Notification persists until marked as read/resolved

## Notification Format

### Title
```
Bulk DO Creation Issues
```

### Message Example
```
Bulk DO creation completed with 19/20 successful. 
1 skipped: DO-0025 (T859 EKS) (Truck T859 EKS has open fuel record). 
```

### Metadata Stored
- `totalAttempted`: Total number of DOs user tried to create
- `successCount`: Number successfully created
- `skippedCount`: Number skipped
- `failedCount`: Number failed
- `skippedReasons`: Array of `{ truck, reason }` objects for skipped orders
- `failedReasons`: Array of `{ truck, reason }` objects for failed orders

## Benefits

1. **Audit Trail**: Permanent record of bulk operation issues
2. **Deferred Action**: Users can review and resolve issues later
3. **Accountability**: Clear tracking of who created the notification
4. **Visibility**: Multiple roles can see and act on issues
5. **Context**: Full details including truck numbers and specific reasons
6. **Non-Blocking**: Notification creation runs in background, doesn't slow down bulk operation

## Error Handling

- Notification creation errors are logged but don't fail the bulk operation
- If notification API fails, user still sees the alert summary
- Console logs provide detailed debugging information

## Testing Checklist

- [ ] Create bulk DOs where one truck has an open fuel record
- [ ] Verify notification appears in notification bell
- [ ] Check notification contains correct counts
- [ ] Verify notification shows truck numbers and reasons
- [ ] Confirm alert message mentions notification bell
- [ ] Test with multiple failures/skips
- [ ] Verify notification only created when there are issues (not for all-success case)

## Related Files

### Backend
- `backend/src/controllers/notificationController.ts` - Notification creation logic
- `backend/src/controllers/deliveryOrderController.ts` - API controller
- `backend/src/routes/deliveryOrderRoutes.ts` - Route definition
- `backend/src/models/Notification.ts` - Notification schema (existing)

### Frontend
- `frontend/src/pages/DeliveryOrders.tsx` - Bulk DO handler
- `frontend/src/services/api.ts` - API client
- `frontend/src/components/NotificationBell.tsx` - Notification display (existing)
- `frontend/src/components/NotificationsPage.tsx` - Full notifications view (existing)

## API Endpoint Details

### Request
```http
POST /api/delivery-orders/notify-bulk-failures
Content-Type: application/json
Authorization: Bearer <token>

{
  "totalAttempted": 20,
  "successCount": 19,
  "skippedCount": 1,
  "failedCount": 0,
  "skippedReasons": [
    {
      "truck": "DO-0025 (T859 EKS)",
      "reason": "Truck T859 EKS has open fuel record"
    }
  ],
  "failedReasons": []
}
```

### Response
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "success": true,
  "message": "Notification created for bulk DO creation issues"
}
```

## Future Enhancements

1. Add bulk action to resolve multiple skipped orders
2. Link notifications to specific DOs for quick access
3. Add retry mechanism for failed orders
4. Email notifications for critical bulk failures
5. Dashboard widget showing bulk operation statistics
